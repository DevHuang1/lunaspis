/*
 * coverage_core.js — CubeSat Contact Coverage: orbit, access and statistics core.
 *
 * NO DOM, Three.js, network or wall-clock time. Every function takes simulation time as an argument,
 * so playback speed cannot change a prediction. Loads in the browser (window.CoverageCore) and in Node.
 *
 * Units inside: metres, seconds, radians. Scenario/UI values: km, degrees, ISO-8601 UTC.
 * Frames: ECI (X/Y equatorial, Z north; the ShuttleSim convention), Earth-fixed = R_z(-theta) * ECI,
 * theta = GMST(UTC) (IAU-1982 formula, UT1 ~ UTC). Sandbox: spherical Earth R = 6371 km. Real: stations on WGS84.
 *
 * "Available" = station enabled AND elevation >= that station's minimum elevation (geometric access only;
 * compatible radios and an adequate link budget are assumed — this is not a scheduled or successful contact).
 */
(function (root) {
  "use strict";

  const MU = 3.986004418e14;          // m^3/s^2 (same as ShuttleSim)
  const R_SPHERE = 6.371e6;           // m (same as ShuttleSim)
  const OMEGA_E = 7.2921159e-5;       // rad/s
  const WGS_A = 6378137.0, WGS_B = 6356752.3142;   // m (same constants as satellite.js)
  const WGS_F = (WGS_A - WGS_B) / WGS_A, WGS_E2 = 2 * WGS_F - WGS_F * WGS_F;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, TWO_PI = 2 * Math.PI;
  const GRID_S = 10;                  // forecast sampling step (s)
  const LIMITS = { stations: 50, pins: 20, maskMin: 0, maskMax: 60, altMin: 300, altMax: 2000, altConfirm: 2000, nameMax: 32,
                   realStartMaxDays: 30, ageAgingDays: 3, ageStaleDays: 7, ageBlockDays: 30 };
  const HORIZONS = { "1orbit": { label: "1 orbit", orbits: 1 }, "3orbit": { label: "3 orbits", orbits: 3 },
                     "6h": { label: "6 h", s: 21600 }, "24h": { label: "24 h", s: 86400 }, "72h": { label: "72 h", s: 259200 } };
  const SCHEMA = "interfellas.coverage.scenario/1";

  const posMod = (a, m) => ((a % m) + m) % m;
  const wrapPi = (a) => posMod(a + Math.PI, TWO_PI) - Math.PI;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => Math.sqrt(dot(a, a));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; };
  const fin = (x) => typeof x === "number" && isFinite(x);

  // ------------------------------------------------------------------ time
  /** GMST (rad) for a UTC instant in ms — IAU-1982, identical to satellite.js gstime(). */
  function gmstFromUtcMs(ms) {
    const jd = ms / 86400000 + 2440587.5;
    const tut1 = (jd - 2451545.0) / 36525.0;
    let temp = -6.2e-6 * tut1 * tut1 * tut1 + 0.093104 * tut1 * tut1 + (876600.0 * 3600 + 8640184.812866) * tut1 + 67310.54841;
    temp = ((temp * D2R) / 240.0) % TWO_PI;
    if (temp < 0) temp += TWO_PI;
    return temp;
  }
  const parseUtc = (iso) => { if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(iso)) return NaN; return Date.parse(iso); };
  const isoUtc = (ms) => new Date(Math.round(ms)).toISOString().replace(/\.\d{3}Z$/, "Z");
  function fmtDur(s, withHours) {
    if (!fin(s)) return "—";
    const neg = s < 0; s = Math.abs(Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, p = (n) => String(n).padStart(2, "0");
    return (neg ? "-" : "") + (h || withHours ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`);
  }

  /** Sun direction in ECI (unit vector) — low-precision almanac formula, used for globe lighting only. */
  function sunDirEci(ms) {
    const n = ms / 86400000 + 2440587.5 - 2451545.0;
    const L = (280.46 + 0.9856474 * n) * D2R, g = (357.528 + 0.9856003 * n) * D2R;
    const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R, eps = (23.439 - 4e-7 * n) * D2R;
    return [Math.cos(lam), Math.cos(eps) * Math.sin(lam), Math.sin(eps) * Math.sin(lam)];
  }
  /** Earth central angle (rad) of the area where a station with this mask could see a satellite at altitude h (m). */
  function footprintAngle(hM, maskRad, R) { const a = (R || R_SPHERE) + hM; return Math.acos(clamp((R || R_SPHERE) / a * Math.cos(maskRad), -1, 1)) - maskRad; }

  // ------------------------------------------------------------------ Earth / stations
  function stationGeometry(st, earth) {
    const lat = st.lat * D2R, lon = st.lon * D2R, h = st.altM || 0;
    const cl = Math.cos(lat), sl = Math.sin(lat), co = Math.cos(lon), so = Math.sin(lon);
    let pos;
    if (earth === "wgs84") {
      const N = WGS_A / Math.sqrt(1 - WGS_E2 * sl * sl);
      pos = [(N + h) * cl * co, (N + h) * cl * so, (N * (1 - WGS_E2) + h) * sl];
    } else {
      const r = R_SPHERE + h; pos = [r * cl * co, r * cl * so, r * sl];
    }
    return { pos, up: [cl * co, cl * so, sl], east: [-so, co, 0], north: [-sl * co, -sl * so, cl], mask: (st.maskDeg || 0) * D2R };
  }
  /** Elevation/azimuth/range of an Earth-fixed satellite position from a station geometry (one function for live + forecast). */
  function lookAngle(sat, g) {
    const d = [sat[0] - g.pos[0], sat[1] - g.pos[1], sat[2] - g.pos[2]];
    const r = norm(d);
    if (!(r > 0)) return { el: Math.PI / 2, az: 0, range: 0 };
    const el = Math.asin(clamp(dot(d, g.up) / r, -1, 1));
    const az = posMod(Math.atan2(dot(d, g.east), dot(d, g.north)), TWO_PI);
    return { el, az, range: r };
  }
  function ecefToLatLon(p, earth) {
    const lon = Math.atan2(p[1], p[0]), rxy = Math.hypot(p[0], p[1]);
    if (earth !== "wgs84") { const r = norm(p); return { lat: Math.asin(p[2] / r), lon, alt: r - R_SPHERE }; }
    let lat = Math.atan2(p[2], rxy * (1 - WGS_E2)), N = WGS_A, h = 0;
    for (let i = 0; i < 6; i++) { const s = Math.sin(lat); N = WGS_A / Math.sqrt(1 - WGS_E2 * s * s); h = rxy / Math.cos(lat) - N; lat = Math.atan2(p[2], rxy * (1 - WGS_E2 * N / (N + h))); }
    return { lat, lon, alt: h };
  }

  // ------------------------------------------------------------------ propagators
  /** Ideal circular two-body orbit defined relative to Earth at the scenario epoch. */
  function circularPropagator(scn) {
    const o = scn.orbit, t0 = parseUtc(scn.epochUtc);
    const a = R_SPHERE + o.altKm * 1000, n = Math.sqrt(MU / (a * a * a)), T = TWO_PI / n;
    const inc = o.incDeg * D2R, th0 = gmstFromUtcMs(t0);
    const Omega = o.nodeLonDeg * D2R + th0, u0 = o.phaseDeg * D2R;
    const ci = Math.cos(inc), si = Math.sin(inc), v = Math.sqrt(MU / a);
    const theta = (t) => gmstFromUtcMs(t0 + t * 1000);
    const argLatRaw = (t) => u0 + n * t;
    function stateEci(t) {
      const u = argLatRaw(t), cu = Math.cos(u), su = Math.sin(u);
      return { r: rotZ([a * cu, a * su * ci, a * su * si], Omega), v: rotZ([-v * su, v * cu * ci, v * cu * si], Omega) };
    }
    return {
      kind: "circular", earth: "sphere", epochMs: t0, period: T, n, a, incRad: inc, exactPeriod: true, theta,
      stateEci, posEcef: (t) => rotZ(stateEci(t).r, -theta(t)), argLat: (t) => posMod(argLatRaw(t), TWO_PI),
      orbitNo: (t) => Math.floor(t / T) + 1,
      // ascending equator crossings in [t1, t2]: u = 2*pi*k
      nodesBetween(t1, t2) { const out = []; let k = Math.ceil((u0 + n * t1) / TWO_PI - 1e-12); for (;; k++) { const t = (k * TWO_PI - u0) / n; if (t > t2) break; if (t >= t1) out.push(t); } return out; },
      phaseReturn(t, uX) { let dt = posMod(uX - argLatRaw(t), TWO_PI) / n; if (dt < 1e-6) dt = T; return t + dt; },
      valid: () => true,
    };
  }

  /** SGP4 propagator using an injected satellite.js library and a CelesTrak OMM JSON record. */
  function sgp4Propagator(scn, sat) {
    if (!sat || typeof sat.json2satrec !== "function") throw new Error("SGP4 library not loaded");
    const omm = scn.orbit.omm, t0 = parseUtc(scn.epochUtc);
    const satrec = sat.json2satrec(omm);
    if (!satrec || satrec.error) throw new Error("Invalid orbital elements (SGP4 init error " + (satrec && satrec.error) + ")");
    const mmRevDay = Number(omm.MEAN_MOTION), nMean = mmRevDay * TWO_PI / 86400;
    const theta = (t) => gmstFromUtcMs(t0 + t * 1000);
    const cache = new Map();
    let failAt = Infinity;
    function stateEci(t) {
      const key = Math.round(t * 1000);
      if (cache.has(key)) return cache.get(key);
      const pv = sat.propagate(satrec, new Date(t0 + t * 1000));
      let out = null;
      if (pv && pv.position && typeof pv.position === "object" && fin(pv.position.x) && !satrec.error) {
        const r = [pv.position.x * 1000, pv.position.y * 1000, pv.position.z * 1000];
        if (norm(r) > WGS_A + 100e3) out = { r, v: [pv.velocity.x * 1000, pv.velocity.y * 1000, pv.velocity.z * 1000] };
      }
      if (!out && t < failAt) failAt = t;
      if (cache.size > 200000) cache.clear();
      cache.set(key, out);
      return out;
    }
    function argLat(t) {
      const s = stateEci(t); if (!s) return NaN;
      const h = cross(s.r, s.v), nn = [-h[1], h[0], 0], nl = norm(nn) || 1, hl = norm(h);
      const nx = [nn[0] / nl, nn[1] / nl, 0], ny = cross([h[0] / hl, h[1] / hl, h[2] / hl], nx);
      return posMod(Math.atan2(dot(s.r, ny), dot(s.r, nx)), TWO_PI);
    }
    const self = {
      kind: "sgp4", earth: "wgs84", epochMs: t0, satrec, exactPeriod: false, theta, stateEci, argLat,
      period: TWO_PI / nMean, n: nMean, a: Math.cbrt(MU / (nMean * nMean)), incRad: Number(omm.INCLINATION) * D2R,
      posEcef(t) { const s = stateEci(t); return s ? rotZ(s.r, -theta(t)) : null; },
      valid: (t) => !!stateEci(t),
      failAt: () => failAt,
      nodes: [],
      orbitNo(t) { let k = 0; for (const x of self.nodes) { if (x <= t) k++; else break; } return k + 1; },
      nodesBetween(t1, t2) { return self.nodes.filter((x) => x >= t1 && x <= t2); },
      phaseReturn(t, uX) {
        const step = 10, lim = t + 3 * self.period;
        let prev = wrapPi(argLat(t + 1) - uX), tp = t + 1;
        for (let x = t + 1 + step; x <= lim; x += step) {
          const cur = wrapPi(argLat(x) - uX);
          if (!fin(cur)) return null;
          if (prev < 0 && cur >= 0 && cur - prev < Math.PI) { let lo = tp, hi = x; while (hi - lo > 0.05) { const m = (lo + hi) / 2; if (wrapPi(argLat(m) - uX) < 0) lo = m; else hi = m; } return (lo + hi) / 2; }
          prev = cur; tp = x;
        }
        return null;
      },
    };
    return self;
  }

  function makePropagator(scn, sat) { return scn.orbit.type === "omm" ? sgp4Propagator(scn, sat || root.satellite) : circularPropagator(scn); }

  // ------------------------------------------------------------------ scenario defaults + validation
  const PRESET_STATIONS = [
    { id: "hyp-yangon", name: "Hypothetical site near Yangon", lat: 16.84, lon: 96.17 },
    { id: "hyp-svalbard", name: "Hypothetical site near Svalbard", lat: 78.23, lon: 15.41 },
    { id: "hyp-capetown", name: "Hypothetical site near Cape Town", lat: -33.92, lon: 18.42 },
    { id: "hyp-santiago", name: "Hypothetical site near Santiago", lat: -33.45, lon: -70.67 },
    { id: "hyp-singapore", name: "Hypothetical site near Singapore", lat: 1.35, lon: 103.82 },
    { id: "hyp-perth", name: "Hypothetical site near Perth", lat: -31.95, lon: 115.86 },
  ];
  function floorMinuteIso(ms) { return isoUtc(Math.floor(ms / 60000) * 60000); }
  function defaultSandbox(nowMs) {
    return {
      schema: SCHEMA, mode: "sandbox", title: "Sandbox CubeSat",
      epochUtc: floorMinuteIso(nowMs), horizon: "24h",
      orbit: { type: "circular", altKm: 550, incDeg: 51.6, nodeLonDeg: 0, phaseDeg: 0 },
      stations: PRESET_STATIONS.map((s) => ({ ...s, altM: 0, maskDeg: 10, enabled: true, source: "hypothetical" })),
      pins: [], edited: false,
    };
  }
  const isEquatorial = (incDeg) => incDeg < 0.01 || incDeg > 179.99;

  function validate(scn) {
    const errors = [], err = (field, msg) => errors.push({ field, msg });
    if (!scn || typeof scn !== "object") return { ok: false, errors: [{ field: "scenario", msg: "No scenario" }] };
    if (scn.schema !== SCHEMA) err("schema", "Unknown scenario format");
    if (scn.mode !== "sandbox" && scn.mode !== "real") err("mode", "Mode must be sandbox or real");
    const t0 = parseUtc(scn.epochUtc);
    if (!fin(t0)) err("epochUtc", "Start time must be a UTC date-time like 2026-11-14T03:00:00Z");
    else if (t0 < Date.UTC(1990, 0, 1) || t0 > Date.UTC(2100, 11, 31, 23, 59)) err("epochUtc", "Start time must be between 1990 and 2100");
    if (!HORIZONS[scn.horizon]) err("horizon", "Choose a prediction length");
    const o = scn.orbit || {};
    if (o.type === "circular") {
      if (!fin(o.altKm)) err("orbit.altKm", "Altitude must be a number");
      else if (o.altKm < LIMITS.altMin) err("orbit.altKm", `Altitude below ${LIMITS.altMin} km is too low for a stable orbit in this simplified model`);
      else if (o.altKm > LIMITS.altMax) err("orbit.altKm", `Altitude above ${LIMITS.altMax} km is outside low Earth orbit for this mission`);
      if (!fin(o.incDeg) || o.incDeg < 0 || o.incDeg > 180) err("orbit.incDeg", "Inclination must be 0–180°");
      if (!fin(o.nodeLonDeg) || o.nodeLonDeg < -180 || o.nodeLonDeg > 180) err("orbit.nodeLonDeg", "Track position must be −180° to 180°");
      if (!fin(o.phaseDeg) || o.phaseDeg < 0 || o.phaseDeg >= 360) err("orbit.phaseDeg", "Start phase must be 0–359.9°");
    } else if (o.type === "omm") {
      const r = validateOmm(o.omm); r.errors.forEach((m) => err("orbit.omm", m));
      if (fin(t0) && r.ok) {
        const ep = ommEpochMs(o.omm);
        if (Math.abs(t0 - ep) > LIMITS.realStartMaxDays * 86400000) err("epochUtc", `Start time is more than ${LIMITS.realStartMaxDays} days from the element epoch — elements too old for meaningful prediction`);
      }
    } else err("orbit", "Unknown orbit type");
    if (!Array.isArray(scn.stations)) err("stations", "Station list missing");
    else {
      if (scn.stations.length > LIMITS.stations) err("stations", `At most ${LIMITS.stations} stations`);
      const names = new Set(), ids = new Set();
      scn.stations.forEach((s, i) => {
        const f = (k) => `stations[${i}].${k}`;
        if (!s || typeof s !== "object") { err(`stations[${i}]`, "Invalid station"); return; }
        if (typeof s.id !== "string" || !s.id || ids.has(s.id)) err(f("id"), "Station id missing or duplicated"); else ids.add(s.id);
        const nm = typeof s.name === "string" ? s.name.trim() : "";
        if (!nm || nm.length > LIMITS.nameMax) err(f("name"), `Name must be 1–${LIMITS.nameMax} characters`);
        else if (names.has(nm.toLowerCase())) err(f("name"), "Station names must be unique"); else names.add(nm.toLowerCase());
        if (!fin(s.lat) || s.lat < -90 || s.lat > 90) err(f("lat"), "Latitude must be −90° to 90°");
        if (!fin(s.lon) || s.lon < -180 || s.lon > 180) err(f("lon"), "Longitude must be −180° to 180°");
        if (!fin(s.maskDeg) || s.maskDeg < LIMITS.maskMin || s.maskDeg > LIMITS.maskMax) err(f("maskDeg"), `Minimum elevation must be ${LIMITS.maskMin}–${LIMITS.maskMax}°`);
        if (s.altM !== undefined && (!fin(s.altM) || s.altM < -500 || s.altM > 9000)) err(f("altM"), "Station altitude must be −500 to 9000 m");
        if (typeof s.enabled !== "boolean") err(f("enabled"), "Enabled must be true/false");
      });
    }
    if (scn.pins !== undefined) {
      if (!Array.isArray(scn.pins) || scn.pins.length > LIMITS.pins) err("pins", `At most ${LIMITS.pins} pins`);
      else { const ids = new Set(); scn.pins.forEach((p, i) => { if (!p || typeof p.id !== "string" || ids.has(p.id)) err(`pins[${i}]`, "Pin id missing or duplicated"); else ids.add(p.id); if (!p || !fin(p.t) || p.t < 0) err(`pins[${i}]`, "Pin time invalid"); if (p && (typeof p.name !== "string" || !p.name.trim() || p.name.length > 16)) err(`pins[${i}]`, "Pin name must be 1–16 characters"); }); }
    }
    return { ok: errors.length === 0, errors };
  }
  /** Copy with the canonical shape (drops unknown keys, wraps longitudes). Assumes validate() passed. */
  function normalize(scn) {
    const o = scn.orbit;
    const out = {
      schema: SCHEMA, mode: scn.mode, title: String(scn.title || "").slice(0, 60), epochUtc: isoUtc(parseUtc(scn.epochUtc)), horizon: scn.horizon,
      orbit: o.type === "circular" ? { type: "circular", altKm: +o.altKm, incDeg: +o.incDeg, nodeLonDeg: +o.nodeLonDeg, phaseDeg: +o.phaseDeg }
                                   : { type: "omm", omm: { ...o.omm }, source: o.source ? { ...o.source } : null },
      stations: scn.stations.map((s) => ({ id: s.id, name: s.name.trim(), lat: +s.lat, lon: +s.lon, altM: +(s.altM || 0), maskDeg: +s.maskDeg, enabled: !!s.enabled, source: s.source || "user" })),
      pins: Array.isArray(scn.pins) ? scn.pins.map((p) => ({ id: p.id, name: String(p.name).trim(), t: +p.t })) : [],
      edited: !!scn.edited,
    };
    if (scn.derivedFrom) out.derivedFrom = { ...scn.derivedFrom };
    return out;
  }

  // ------------------------------------------------------------------ real data (OMM) checks
  const OMM_REQ = ["OBJECT_NAME", "NORAD_CAT_ID", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR"];
  function ommEpochMs(omm) { const e = String(omm.EPOCH || ""); return Date.parse(/Z$/.test(e) ? e : e + "Z"); }
  function validateOmm(omm) {
    const errors = [];
    if (!omm || typeof omm !== "object") return { ok: false, errors: ["No orbital element record"] };
    for (const k of OMM_REQ) if (omm[k] === undefined || omm[k] === null || omm[k] === "") errors.push(`Missing ${k}`);
    if (!errors.length) {
      const nums = ["MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "BSTAR"];
      for (const k of nums) if (!fin(Number(omm[k]))) errors.push(`${k} is not a number`);
      if (!fin(ommEpochMs(omm))) errors.push("EPOCH is not a date");
      if (!/^\d{1,9}$/.test(String(omm.NORAD_CAT_ID))) errors.push("NORAD_CAT_ID must be 1–9 digits");
      const e = Number(omm.ECCENTRICITY), mm = Number(omm.MEAN_MOTION);
      if (!(e >= 0 && e < 1)) errors.push("ECCENTRICITY must be 0 ≤ e < 1");
      if (!(mm > 0)) errors.push("MEAN_MOTION must be positive");
      else if (mm < 6.4) errors.push("Not a low-Earth-orbit satellite (mean motion below 6.4 rev/day)");
    }
    return { ok: errors.length === 0, errors };
  }
  function dataAge(omm, nowMs) {
    const ageD = (nowMs - ommEpochMs(omm)) / 86400000;
    let tier = "fresh", note = "fresh";
    if (ageD > LIMITS.ageBlockDays) { tier = "blocked"; note = "elements too old for meaningful prediction"; }
    else if (ageD > LIMITS.ageStaleDays) { tier = "stale"; note = "stale: timings may be minutes off"; }
    else if (ageD > LIMITS.ageAgingDays) { tier = "aging"; note = "aging: predictions drift (km-level errors)"; }
    return { days: ageD, tier, note };
  }

  // ------------------------------------------------------------------ forecast
  function horizonSeconds(scn, prop) {
    const h = HORIZONS[scn.horizon];
    return h.s || Math.round(h.orbits * prop.period);
  }
  /** Prediction window in seconds without building a propagator (server clock limits). */
  function horizonSecondsQuick(scn) {
    const h = HORIZONS[scn.horizon]; if (!h) return 0; if (h.s) return h.s;
    let T;
    if (scn.orbit.type === "circular") { const a = R_SPHERE + scn.orbit.altKm * 1000; T = TWO_PI * Math.sqrt(a * a * a / MU); }
    else T = 86400 / Number(scn.orbit.omm.MEAN_MOTION);
    return Math.round(h.orbits * T);
  }
  function bisect(fn, lo, hi, flo) { // root of fn between lo (sign flo) and hi
    const sLo = flo >= 0;
    for (let i = 0; i < 40 && hi - lo > 0.005; i++) { const m = 0.5 * (lo + hi); if ((fn(m) >= 0) === sLo) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  }
  function goldenMax(fn, a, b) {
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a), d = a + g * (b - a), fc = fn(c), fd = fn(d);
    for (let i = 0; i < 80 && b - a > 0.01; i++) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = fn(c); } else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = fn(d); }
    }
    const t = 0.5 * (a + b); return { t, v: fn(t) };
  }

  /**
   * Compute every access window over the scenario's prediction window. Runs once per scenario revision.
   * Returns passes per station (with clipping flags and peaks), the network union, gaps, peak simultaneity and stats.
   */
  function forecast(scnIn, prop) {
    const scn = scnIn;
    const H = horizonSeconds(scn, prop);
    const times = [];
    for (let t = 0; t < H; t += GRID_S) times.push(t);
    times.push(H);
    const M = times.length;
    const sat = new Array(M);
    let validUntil = H;
    for (let k = 0; k < M; k++) { sat[k] = prop.posEcef(times[k]); if (!sat[k]) { validUntil = k ? times[k - 1] : 0; break; } }
    const Mv = sat.findIndex((x) => !x) === -1 ? M : sat.findIndex((x) => !x);
    const Hv = Mv === M ? H : validUntil;

    const stations = scn.stations.filter((s) => s.enabled);
    const passes = {};
    for (const s of scn.stations) passes[s.id] = [];
    for (const st of stations) {
      const g = stationGeometry(st, prop.earth);
      const fAt = (t) => { const p = prop.posEcef(t); return p ? lookAngle(p, g).el - g.mask : -10; };
      const elAt = (t) => { const p = prop.posEcef(t); return p ? lookAngle(p, g).el : -10; };
      const f = new Float64Array(Mv);
      for (let k = 0; k < Mv; k++) f[k] = lookAngle(sat[k], g).el - g.mask;
      const ev = [];
      for (let k = 0; k < Mv - 1; k++) {
        const a = f[k], b = f[k + 1];
        if (a < 0 && b >= 0) ev.push({ t: bisect(fAt, times[k], times[k + 1], a), type: "aos" });
        else if (a >= 0 && b < 0) ev.push({ t: bisect(fAt, times[k], times[k + 1], a), type: "los" });
      }
      // grazing passes: both neighbouring samples below the mask but the elevation peaks between them
      for (let k = 0; k < Mv; k++) {
        if (f[k] >= 0) continue;
        const left = k > 0 ? f[k - 1] : -Infinity, right = k < Mv - 1 ? f[k + 1] : -Infinity;
        if (!(f[k] >= left && f[k] >= right) || left >= 0 || right >= 0) continue;
        const lo = times[Math.max(k - 1, 0)], hi = times[Math.min(k + 1, Mv - 1)];
        const pk = goldenMax(fAt, lo, hi);
        if (pk.v >= 0) {
          ev.push({ t: bisect(fAt, lo, pk.t, -1), type: "aos" });
          ev.push({ t: bisect(fAt, pk.t, hi, 1), type: "los" });
        }
      }
      ev.sort((p, q) => p.t - q.t || (p.type === "aos" ? -1 : 1));
      let inside = f[0] >= 0, start = 0;
      const list = passes[st.id];
      const close = (end, clippedEnd) => {
        const clippedStart = start === 0 && f[0] >= 0;
        const pk = goldenMax(elAt, start, Math.max(start, end));
        const azAt = (t) => { const p = prop.posEcef(t); return p ? lookAngle(p, g).az : NaN; };
        list.push({ stationId: st.id, start, end, duration: end - start, peakT: pk.t, peakEl: pk.v, clippedStart, clippedEnd, azStart: azAt(start), azEnd: azAt(end), azPeak: azAt(pk.t) });
      };
      for (const e of ev) {
        if (e.type === "aos" && !inside) { inside = true; start = e.t; }
        else if (e.type === "los" && inside) { inside = false; close(e.t, false); }
      }
      if (inside) close(Hv, true);
    }
    // network union
    const all = [];
    for (const id in passes) for (const p of passes[id]) all.push(p);
    all.sort((a, b) => a.start - b.start);
    const network = [];
    for (const p of all) {
      const last = network[network.length - 1];
      if (last && p.start <= last.end) last.end = Math.max(last.end, p.end);
      else network.push({ start: p.start, end: p.end });
    }
    const gaps = []; let cur = 0;
    for (const iv of network) { if (iv.start > cur) gaps.push({ start: cur, end: iv.start }); cur = Math.max(cur, iv.end); }
    if (cur < Hv) gaps.push({ start: cur, end: Hv });
    gaps.forEach((g) => { g.duration = g.end - g.start; g.clipped = g.start === 0 || g.end === Hv; });
    // peak simultaneous (ends processed before starts at equal times)
    const pts = [];
    for (const p of all) { pts.push([p.start, 1]); pts.push([p.end, -1]); }
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let c = 0, peak = 0, peakT = null;
    for (const [t, d] of pts) { c += d; if (c > peak) { peak = c; peakT = t; } }
    const ascNodes = prop.kind === "sgp4" ? findNodes(prop, times.slice(0, Mv)) : prop.nodesBetween(0, Hv);
    if (prop.kind === "sgp4") prop.nodes = ascNodes;
    const fc = { horizonS: H, validUntil: Hv, truncated: Hv < H, times: times.slice(0, Mv), sat: sat.slice(0, Mv), passes, network, gaps, peakSimul: { count: peak, t: peakT }, ascNodes, stationsUsed: stations.map((s) => s.id) };
    fc.hash = forecastHash(fc);
    return fc;
  }
  function findNodes(prop, times) {
    const out = [];
    let pz = prop.stateEci(times[0]); pz = pz ? pz.r[2] : 0;
    for (let k = 1; k < times.length; k++) {
      const s = prop.stateEci(times[k]); if (!s) break;
      if (pz < 0 && s.r[2] >= 0) {
        let lo = times[k - 1], hi = times[k];
        while (hi - lo > 0.01) { const m = 0.5 * (lo + hi), z = prop.stateEci(m); if (z && z.r[2] < 0) lo = m; else hi = m; }
        out.push(0.5 * (lo + hi));
      }
      pz = s.r[2];
    }
    return out;
  }
  function forecastHash(fc) { // FNV-1a over pass times rounded to 1 ms — used to detect client desync
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    const feed = (str) => { for (let i = 0; i < str.length; i++) { h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 ^ str.charCodeAt(i), 2246822519) >>> 0; } };
    for (const id of Object.keys(fc.passes).sort()) { feed(id); for (const p of fc.passes[id]) feed(`${Math.round(p.start * 1000)},${Math.round(p.end * 1000)};`); }
    feed(String(fc.horizonS));
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  // ------------------------------------------------------------------ queries
  function inPass(fc, id, t) { for (const p of fc.passes[id] || []) { if (t >= p.start && t <= p.end) return p; if (p.start > t) break; } return null; }
  function stationById(scn, id) { return scn.stations.find((s) => s.id === id); }
  /** Current situation at simulation time t (same pass list as the forecast; live geometry for the numbers). */
  function query(scn, prop, fc, t, nextLimit) {
    const pos = prop.posEcef(t);
    const available = [];
    if (pos) for (const id of fc.stationsUsed) {
      const p = inPass(fc, id, t); if (!p) continue;
      const st = stationById(scn, id), la = lookAngle(pos, stationGeometry(st, prop.earth));
      available.push({ id, name: st.name, elDeg: la.el * R2D, azDeg: la.az * R2D, rangeKm: la.range / 1000, timeLeft: p.end - t, clippedEnd: p.clippedEnd, pass: p });
    }
    available.sort((a, b) => b.elDeg - a.elDeg);
    const next = [];
    for (const id of fc.stationsUsed) for (const p of fc.passes[id]) if (p.start > t) next.push({ ...p, name: stationById(scn, id).name, startsIn: p.start - t });
    next.sort((a, b) => a.start - b.start);
    const ll = pos ? ecefToLatLon(pos, prop.earth) : null;
    const nextEvent = nextEventAfter(fc, t);
    return {
      t, utcMs: prop.epochMs + t * 1000, pos, latDeg: ll ? ll.lat * R2D : NaN, lonDeg: ll ? ll.lon * R2D : NaN, altKm: ll ? ll.alt / 1000 : NaN,
      orbitNo: prop.orbitNo(t), argLatDeg: prop.argLat(t) * R2D, available, next: next.slice(0, nextLimit || 12), nextCount: next.length,
      nextEvent, valid: !!pos && t <= fc.validUntil,
    };
  }
  function nextEventAfter(fc, t) {
    let best = null;
    for (const id of fc.stationsUsed) for (const p of fc.passes[id]) {
      if (p.start > t + 1e-3 && (!best || p.start < best.t)) best = { t: p.start, type: "aos", stationId: id };
      if (!p.clippedEnd && p.end > t + 1e-3 && (!best || p.end < best.t)) best = { t: p.end, type: "los", stationId: id };
    }
    return best;
  }
  function availableIds(fc, t) { return fc.stationsUsed.filter((id) => inPass(fc, id, t)); }
  /** X→Y comparison: retained, lost, gained, plus passes that began and ended strictly between them. */
  function compare(scn, fc, tX, tY) {
    const swapped = tY < tX, a = swapped ? tY : tX, b = swapped ? tX : tY;
    const X = new Set(availableIds(fc, tX)), Y = new Set(availableIds(fc, tY));
    const name = (id) => stationById(scn, id).name;
    const between = [];
    for (const id of fc.stationsUsed) for (const p of fc.passes[id]) if (p.start > a && p.end < b) between.push({ id, name: name(id), start: p.start, end: p.end });
    return {
      yBeforeX: swapped,
      retained: [...X].filter((id) => Y.has(id)).map((id) => ({ id, name: name(id) })),
      lost: [...X].filter((id) => !Y.has(id)).map((id) => ({ id, name: name(id) })),
      gained: [...Y].filter((id) => !X.has(id)).map((id) => ({ id, name: name(id) })),
      between: between.sort((p, q) => p.start - q.start),
    };
  }
  const C_next = (q) => (q.next && q.next[0] ? { name: q.next[0].name, startsIn: q.next[0].startsIn } : null);
  function markerSnapshot(scn, prop, fc, t) {
    const q = query(scn, prop, fc, t, 1);
    return { t, utc: isoUtc(q.utcMs), orbitNo: q.orbitNo, argLatDeg: q.argLatDeg, latDeg: q.latDeg, lonDeg: q.lonDeg, altKm: q.altKm, available: q.available.map((a) => ({ id: a.id, name: a.name, elDeg: a.elDeg, azDeg: a.azDeg, rangeKm: a.rangeKm })), next: (() => { const n = C_next(q); return n; })() };
  }

  // ------------------------------------------------------------------ coverage along the orbit
  /** Number of stations in view at each of the given (ascending) times — for colouring the track. */
  function countsAt(fc, times) {
    const ev = [];
    for (const id of fc.stationsUsed) for (const p of fc.passes[id]) { ev.push([p.start, 1]); ev.push([p.end, -1]); }
    ev.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const out = new Array(times.length); let k = 0, c = 0;
    for (let i = 0; i < times.length; i++) { const t = times[i]; while (k < ev.length && (ev[k][0] < t || (ev[k][0] === t && ev[k][1] > 0))) { c += ev[k][1]; k++; } out[i] = c; }
    return out;
  }
  const inViewCount = (fc, t) => availableIds(fc, t).length;

  // ------------------------------------------------------------------ results + A/B
  function gapStats(intervals, H) { // gaps BETWEEN intervals (excluding the open edges of the window)
    const g = []; for (let i = 1; i < intervals.length; i++) g.push(intervals[i].start - intervals[i - 1].end);
    return { count: g.length, longest: g.length ? Math.max(...g) : null, mean: g.length ? g.reduce((x, y) => x + y, 0) / g.length : null };
  }
  function summarize(scn, prop, fc, opts) {
    const useful = ((opts && opts.usefulElDeg) !== undefined ? opts.usefulElDeg : 30) * D2R;
    const days = Math.max(1e-9, fc.validUntil / 86400);
    const per = scn.stations.filter((s) => s.enabled).map((s) => {
      const ps = fc.passes[s.id], total = ps.reduce((x, p) => x + p.duration, 0), gs = gapStats(ps, fc.validUntil);
      return { id: s.id, name: s.name, maskDeg: s.maskDeg, passes: ps.length, contactS: total, passesPerDay: ps.length / days, contactMinPerDay: total / 60 / days,
               usefulPasses: ps.filter((p) => p.peakEl >= useful).length, maxEl: ps.length ? Math.max(...ps.map((p) => p.peakEl)) * R2D : null,
               longestGapS: gs.longest, meanGapS: gs.mean, meanPassS: ps.length ? total / ps.length : null };
    });
    const union = fc.network.reduce((x, iv) => x + (iv.end - iv.start), 0);
    const longest = fc.gaps.reduce((b, g) => (!b || g.duration > b.duration ? g : b), null);
    const ng = gapStats(fc.network, fc.validUntil);
    return {
      mode: scn.mode, windowS: fc.validUntil, days, horizonKey: scn.horizon, truncated: fc.truncated, usefulElDeg: useful * R2D,
      uniqueStations: per.filter((p) => p.passes > 0).length, enabledStations: per.length, perStation: per,
      passCount: per.reduce((x, p) => x + p.passes, 0), coveragePct: fc.validUntil > 0 ? (100 * union) / fc.validUntil : 0,
      unionS: union, contactMinPerDay: union / 60 / days, contactsPerDay: fc.network.length / days, blackoutS: fc.validUntil - union, longestGap: longest,
      meanGapS: ng.mean, peakSimul: fc.peakSimul, periodS: prop.period, periodExact: prop.exactPeriod, hash: fc.hash,
    };
  }
  /** Predicted pass schedule as CSV (one row per pass). Geometric visibility only. */
  function passesCsv(scn, prop, fc) {
    const q = (v) => { const x = String(v == null ? "" : v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const deg = (r) => (fin(r) ? (r * R2D).toFixed(1) : "");
    const lines = [
      `# Interfellas CubeSat coverage — predicted geometric visibility (above each station's minimum elevation). Not a radio schedule.`,
      `# Scenario: ${scn.title || scn.mode}; start ${scn.epochUtc}; window ${HORIZONS[scn.horizon].label}; ${scn.orbit.type === "omm" ? `satellite ${scn.orbit.omm.OBJECT_NAME} #${scn.orbit.omm.NORAD_CAT_ID}, elements epoch ${isoUtc(ommEpochMs(scn.orbit.omm))}, SGP4` : `sandbox circular orbit ${scn.orbit.altKm} km / ${scn.orbit.incDeg} deg`}`,
      "station,station_lat_deg,station_lon_deg,min_elevation_deg,start_utc,end_utc,duration_s,max_elevation_deg,max_elevation_utc,start_azimuth_deg,end_azimuth_deg,clipped",
    ];
    const rows = [];
    for (const s of scn.stations) for (const p of fc.passes[s.id] || []) rows.push([p.start, [q(s.name), s.lat, s.lon, s.maskDeg, isoUtc(prop.epochMs + p.start * 1000), isoUtc(prop.epochMs + p.end * 1000), p.duration.toFixed(1), deg(p.peakEl), isoUtc(prop.epochMs + p.peakT * 1000), deg(p.azStart), deg(p.azEnd), p.clippedStart && p.clippedEnd ? "start+end" : p.clippedStart ? "start" : p.clippedEnd ? "end" : ""].join(",")]);
    rows.sort((a, b) => a[0] - b[0]);
    return lines.concat(rows.map((r) => r[1])).join("\r\n") + "\r\n";
  }
  /** Parse pasted station lines: "name, lat, lon[, min elevation]" or "lat, lon" (comma, tab or semicolon). */
  function parseStationList(text, existing) {
    const out = [], errors = [], names = new Set((existing || []).map((s) => s.name.toLowerCase()));
    String(text || "").split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim(); if (!line || line.startsWith("#")) return;
      const parts = line.split(/\t|;|,/).map((x) => x.trim()).filter((x) => x !== "");
      let name, lat, lon, mask = 10;
      const nums = parts.map((x) => (/^[-+]?\d+(\.\d+)?$/.test(x) ? +x : NaN));
      if (parts.length >= 3 && isNaN(nums[0])) { name = parts[0]; lat = nums[1]; lon = nums[2]; if (parts.length >= 4) mask = nums[3]; }
      else if (parts.length >= 2 && !isNaN(nums[0])) { lat = nums[0]; lon = nums[1]; if (parts.length >= 3) mask = nums[2]; name = null; }
      else { errors.push({ line: i + 1, msg: "Expected: name, latitude, longitude[, min elevation]" }); return; }
      if (!fin(lat) || lat < -90 || lat > 90) { errors.push({ line: i + 1, msg: "Latitude must be −90 to 90" }); return; }
      if (!fin(lon) || lon < -180 || lon > 180) { errors.push({ line: i + 1, msg: "Longitude must be −180 to 180" }); return; }
      if (!fin(mask) || mask < 0 || mask > 60) { errors.push({ line: i + 1, msg: "Minimum elevation must be 0–60" }); return; }
      if (!name) name = `Station ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      name = name.slice(0, 32); let base = name, k = 2; while (names.has(name.toLowerCase())) name = `${base.slice(0, 28)} (${k++})`;
      names.add(name.toLowerCase());
      out.push({ id: "st-" + Math.random().toString(36).slice(2, 10), name, lat, lon, altM: 0, maskDeg: mask, enabled: true, source: "user (pasted)" });
    });
    return { stations: out, errors };
  }
  function settingsRows(scn) {
    const rows = [["Mode", scn.mode === "real" ? "Real satellite" : "Sandbox"], ["Start (UTC)", scn.epochUtc], ["Prediction length", HORIZONS[scn.horizon].label]];
    const o = scn.orbit;
    if (o.type === "circular") rows.push(["Altitude", `${o.altKm} km`], ["Inclination", `${o.incDeg}°`], ["Track position", `${o.nodeLonDeg}°E`], ["Start phase", `${o.phaseDeg}°`]);
    else rows.push(["Satellite", `${o.omm.OBJECT_NAME} (#${o.omm.NORAD_CAT_ID})`], ["Element epoch", isoUtc(ommEpochMs(o.omm))], ["Data source", o.source ? o.source.name : "—"]);
    const en = scn.stations.filter((s) => s.enabled);
    rows.push(["Stations enabled", `${en.length} of ${scn.stations.length}`], ["Station list", en.map((s) => `${s.name.replace(/^Hypothetical site near /, "")} (${s.lat.toFixed(1)}, ${s.lon.toFixed(1)}, ${s.maskDeg}°)`).join(", ") || "none"]);
    if (scn.derivedFrom) rows.push(["Derived from", `${scn.derivedFrom.name} (#${scn.derivedFrom.catnr})${scn.edited ? " — hypothetical (edited)" : ""}`]);
    return rows;
  }
  function compareAB(A, B) {
    const ra = settingsRows(A.scenario), rb = settingsRows(B.scenario), keys = [...new Set([...ra.map((r) => r[0]), ...rb.map((r) => r[0])])];
    const get = (rows, k) => (rows.find((r) => r[0] === k) || [k, "—"])[1];
    const settings = keys.map((k) => ({ label: k, a: get(ra, k), b: get(rb, k), changed: get(ra, k) !== get(rb, k) }));
    const ma = A.summary, mb = B.summary;
    const num = (label, a, b, fmt, higherBetter) => ({ label, a: fmt(a), b: fmt(b), delta: b - a, dir: b === a ? "same" : (b > a) === higherBetter ? "better" : "worse", arrow: b === a ? "=" : b > a ? "▲" : "▼" });
    const mm = (s) => fmtDur(s, true);
    const results = [
      num("Coverage", ma.coveragePct, mb.coveragePct, (v) => v.toFixed(1) + " %", true),
      num("Stations reached", ma.uniqueStations, mb.uniqueStations, String, true),
      num("Passes", ma.passCount, mb.passCount, String, true),
      num("Contact per day", ma.contactMinPerDay, mb.contactMinPerDay, (v) => v.toFixed(1) + " min", true),
      num("Contacts per day", ma.contactsPerDay, mb.contactsPerDay, (v) => v.toFixed(1), true),
      num("Total available time", ma.unionS, mb.unionS, mm, true),
      num("Longest blackout", ma.longestGap ? ma.longestGap.duration : 0, mb.longestGap ? mb.longestGap.duration : 0, mm, false),
      num("Peak stations at once", ma.peakSimul.count, mb.peakSimul.count, String, true),
      num("Orbit period", ma.periodS, mb.periodS, (v) => (v / 60).toFixed(2) + " min", false),
    ];
    results[results.length - 1].dir = "info";
    return { settings, results, windowsDiffer: Math.abs(ma.windowS - mb.windowS) > 1, windowA: ma.windowS, windowB: mb.windowS };
  }

  // ------------------------------------------------------------------ Copy to Sandbox
  function copyToSandbox(scnReal, prop, t) {
    const o = scnReal.orbit.omm, s = prop.stateEci(t), pos = prop.posEcef(t);
    if (!s || !pos) throw new Error("Satellite state unavailable at that time");
    const inc = Number(o.INCLINATION), u = prop.argLat(t), ll = ecefToLatLon(pos, "wgs84");
    const nodeLon = ll.lon - Math.atan2(Math.sin(u) * Math.cos(inc * D2R), Math.cos(u));
    const alt = Math.round((prop.a - R_SPHERE) / 1000);
    return {
      schema: SCHEMA, mode: "sandbox", title: `Hypothetical orbit based on ${o.OBJECT_NAME}`,
      epochUtc: floorMinuteIso(prop.epochMs + t * 1000), horizon: scnReal.horizon,
      orbit: { type: "circular", altKm: clamp(alt, LIMITS.altMin, LIMITS.altMax), incDeg: Math.round(inc * 10) / 10,
               nodeLonDeg: Math.round(wrapPi(nodeLon) * R2D * 10) / 10, phaseDeg: Math.round(posMod(u * R2D, 360) * 10) / 10 % 360 },
      stations: scnReal.stations.map((x) => ({ ...x })), pins: [], edited: false,
      derivedFrom: { catnr: String(o.NORAD_CAT_ID), name: o.OBJECT_NAME, elementEpoch: isoUtc(ommEpochMs(o)), eccentricity: Number(o.ECCENTRICITY), sha256: scnReal.orbit.source ? scnReal.orbit.source.sha256 || null : null },
    };
  }

  const api = {
    MU, R_SPHERE, OMEGA_E, WGS_A, WGS_B, D2R, R2D, GRID_S, LIMITS, HORIZONS, SCHEMA, PRESET_STATIONS,
    gmstFromUtcMs, sunDirEci, footprintAngle, parseUtc, isoUtc, fmtDur, posMod, wrapPi,
    stationGeometry, lookAngle, ecefToLatLon, circularPropagator, sgp4Propagator, makePropagator,
    defaultSandbox, isEquatorial, validate, normalize, validateOmm, ommEpochMs, dataAge,
    horizonSeconds, horizonSecondsQuick, forecast, query, nextEventAfter, availableIds, inPass, compare, markerSnapshot, summarize, settingsRows, compareAB, copyToSandbox,
    countsAt, inViewCount, passesCsv, parseStationList,
  };
  root.CoverageCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
