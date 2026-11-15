/*
 * artemis_simulation.js — shared, DOM-free physics helpers for the Artemis
 * lunar expedition training scenario.
 *
 * Units: SI (m, s, kg, N, rad). Frames:
 *   ECI  Earth-centred inertial, equatorial XY, Z north.
 *   MCI  Moon-centred inertial, parallel to ECI.
 *   LOCAL  landing-site east/north/up frame (x east, y north, z up).
 *
 * The cislunar model is a patched-conic training model: Earth+Moon point-mass
 * gravity for the transfer, a 20,000 km lunar arrival gate, and two-body
 * motion inside the lunar sphere of influence. It is deliberately not a
 * flight-certified ephemeris or a real-time 6-DOF SLS/Orion model. See
 * docs/ARTEMIS.md for published facts, calculated values and assumptions.
 */
(function (root) {
  "use strict";
  const S = root.ShuttleSim || (typeof require !== "undefined" ? require("./shuttle_simulation.js") : null);
  const V = S.vec;
  const Q = S.quat;

  const DEG = Math.PI / 180;
  const G0 = 9.80665;
  const MU_E = 3.986004418e14;      // m^3/s^2
  const RE = 6371000;               // m
  const MU_M = 4.902800118e12;      // m^3/s^2
  const RM = 1737400;               // m
  const MOON_A = 384400000;         // m
  const MOON_PERIOD = 27.321661 * 86400;
  const MOON_INC = 5.145 * DEG;
  const MOON_PHASE0 = 2.71;         // training epoch alignment; see manifest
  const MOON_SOI = 66100000;        // m, approximate
  const LUNAR_GATE = 20000000;      // m, patched-conic arrival gate
  const ENTRY_ALT = 121920;         // m, 400,000 ft
  const ATM_TOP = 150000;           // m
  const SPLASHDOWN = { lat: 7.5 * DEG, lon: -142 * DEG };

  const MOON_X = [1, 0, 0];
  const MOON_Y = [0, Math.cos(MOON_INC), Math.sin(MOON_INC)];

  const PARK = { r: RE + 200000, inc: 28.6 * DEG };

  // Training vehicle assumptions. These are not published vehicle mass
  // properties and are labelled as assumptions in the scenario manifest.
  const VEHICLES = {
    sls: { dry: 250000, prop: 2200000, isp: 300, thrust: 39100000 },
    icps: { dry: 3500, prop: 55000, isp: 462, thrust: 110000 },
    orion: { dry: 15000, prop: 25000, rcs: 650, isp: 316, thrust: 26700, rcsIsp: 290 },
    lander: {
      dry: 18000, descentProp: 25000, ascentProp: 12000, rcs: 900,
      descentIsp: 330, ascentIsp: 340, descentThrust: 160000, ascentThrust: 80000, rcsIsp: 290
    }
  };

  // South-polar landing sites. Coordinates are local metres within the 2 km
  // training patch; slopes are calculated from the same height function used
  // for collision, not from an image.
  const SITES = [
    { id: "shackleton_rim", name: "Shackleton Rim", x: 0, z: 0, radius: 550, illumination: "High rim / long shadows", note: "Training site near a permanent-shadow boundary." },
    { id: "connecting_ridge", name: "Connecting Ridge", x: 620, z: -310, radius: 480, illumination: "Ridge crest / broad Earth view", note: "Training site with a gentle ridge and nearby crater." },
    { id: "degerlager", name: "de Gerlager Rim", x: -460, z: 540, radius: 430, illumination: "Mixed illumination / rougher approach", note: "Training site with a steeper approach and more hazards." }
  ];

  const vec = V;
  const quat = Q;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------------------------------------------------------------- Moon / Earth
  function moonState(t, phase0) {
    const p0 = phase0 === undefined ? MOON_PHASE0 : phase0;
    const th = p0 + 2 * Math.PI * t / MOON_PERIOD;
    const c = Math.cos(th), s = Math.sin(th), w = 2 * Math.PI / MOON_PERIOD;
    return {
      r: [
        MOON_A * (c * MOON_X[0] + s * MOON_Y[0]),
        MOON_A * (c * MOON_X[1] + s * MOON_Y[1]),
        MOON_A * (c * MOON_X[2] + s * MOON_Y[2])
      ],
      v: [
        MOON_A * w * (-s * MOON_X[0] + c * MOON_Y[0]),
        MOON_A * w * (-s * MOON_X[1] + c * MOON_Y[1]),
        MOON_A * w * (-s * MOON_X[2] + c * MOON_Y[2])
      ],
      theta: th
    };
  }

  function parkingState(t) {
    const th = Math.sqrt(MU_E / (PARK.r * PARK.r * PARK.r)) * t;
    const c = Math.cos(th), s = Math.sin(th), vp = Math.sqrt(MU_E / PARK.r);
    const X = [1, 0, 0];
    const Y = [0, Math.cos(PARK.inc), Math.sin(PARK.inc)];
    return {
      r: [PARK.r * (c * X[0] + s * Y[0]), PARK.r * (c * X[1] + s * Y[1]), PARK.r * (c * X[2] + s * Y[2])],
      v: [vp * (-s * X[0] + c * Y[0]), vp * (-s * X[1] + c * Y[1]), vp * (-s * X[2] + c * Y[2])]
    };
  }

  function moonRelative(r, v, t) {
    const m = moonState(t);
    return { r: vec.sub(r, m.r), v: vec.sub(v, m.v), moon: m };
  }
  function moonToEci(rRel, vRel, t) {
    const m = moonState(t);
    return { r: vec.add(m.r, rRel), v: vec.add(m.v, vRel), moon: m };
  }

  // ---------------------------------------------------------------- Stumpff / Kepler / Lambert
  function stumpff(z) {
    if (z > 1e-6) { const s = Math.sqrt(z); return { C: (1 - Math.cos(s)) / z, S: (s - Math.sin(s)) / (s * s * s) }; }
    if (z < -1e-6) { const s = Math.sqrt(-z); return { C: (Math.cosh(s) - 1) / (-z), S: (Math.sinh(s) - s) / (s * s * s) }; }
    return { C: 0.5 - z / 24, S: 1 / 6 - z / 120 };
  }

  // Universal-variable two-body propagation with an arbitrary central mu.
  function kepler(r0, v0, dt, mu) {
    if (!dt) return { r: r0.slice(), v: v0.slice() };
    const r0n = vec.norm(r0), vr0 = vec.dot(r0, v0) / r0n;
    const alpha = 2 / r0n - vec.dot(v0, v0) / mu;
    const sq = Math.sqrt(mu);
    let x = Math.abs(alpha) > 1e-14 ? sq * Math.abs(alpha) * dt : sq * dt / r0n;
    if (!(alpha > 1e-14)) x = sq * dt / r0n;
    for (let i = 0; i < 80; i++) {
      const z = alpha * x * x, { C, S } = stumpff(z);
      const F = r0n * vr0 / sq * x * x * C + (1 - alpha * r0n) * x * x * x * S + r0n * x - sq * dt;
      const dF = r0n * vr0 / sq * x * (1 - alpha * x * x * S) + (1 - alpha * r0n) * x * x * C + r0n;
      const dx = F / dF; x -= dx;
      if (Math.abs(dx) < 1e-8) break;
    }
    const z = alpha * x * x, { C, S } = stumpff(z);
    const f = 1 - x * x / r0n * C, g = dt - x * x * x / sq * S;
    const r = vec.add(vec.scl(r0, f), vec.scl(v0, g));
    const rn = vec.norm(r);
    const fd = sq / (rn * r0n) * (alpha * x * x * x * S - x);
    const gd = 1 - x * x / rn * C;
    return { r, v: vec.add(vec.scl(r0, fd), vec.scl(v0, gd)) };
  }

  // Lambert (Vallado universal-variable formulation). Returns departure and
  // arrival inertial velocities. prograde is measured about +Z.
  function lambert(r1, r2, tof, mu, prograde) {
    if (!(tof > 0)) return null;
    const r1n = vec.norm(r1), r2n = vec.norm(r2);
    if (r1n < 1 || r2n < 1) return null;
    let cos = clamp(vec.dot(r1, r2) / (r1n * r2n), -1, 1);
    let theta = Math.acos(cos);
    const h = vec.cross(r1, r2);
    if (prograde ? h[2] < 0 : h[2] >= 0) theta = 2 * Math.PI - theta;
    const A = Math.sin(theta) * Math.sqrt(r1n * r2n / Math.max(1e-12, 1 - Math.cos(theta)));
    if (Math.abs(A) < 1) return null;
    let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI, z = 0;
    for (let i = 0; i < 220; i++) {
      const { C, S } = stumpff(z);
      const y = r1n + r2n + A * (z * S - 1) / Math.sqrt(C);
      if (y < 0) { lo = z; z = (lo + hi) / 2; continue; }
      const x = Math.sqrt(y / C);
      const t = (x * x * x * S + A * Math.sqrt(y)) / Math.sqrt(mu);
      if (Math.abs(t - tof) < 1e-5) break;
      if (t < tof) lo = z; else hi = z;
      z = (lo + hi) / 2;
    }
    const { C, S } = stumpff(z);
    const y = r1n + r2n + A * (z * S - 1) / Math.sqrt(C);
    if (!(y > 0)) return null;
    const f = 1 - y / r1n, g = A * Math.sqrt(y / mu), gd = 1 - y / r2n;
    if (Math.abs(g) < 1e-9) return null;
    const v1 = vec.scl(vec.sub(r2, vec.scl(r1, f)), 1 / g);
    const v2 = vec.scl(vec.sub(vec.scl(r2, gd), r1), 1 / g);
    return { v1, v2, theta, z };
  }

  function elements(r, v, mu) {
    const rn = vec.norm(r), vn = vec.norm(v);
    const eps = vn * vn / 2 - mu / rn;
    const h = vec.cross(r, v), hn = vec.norm(h);
    const evec = vec.sub(vec.scl(vec.cross(v, h), 1 / mu), vec.scl(r, 1 / rn));
    const e = vec.norm(evec);
    const out = { energy: eps, h: hn, e, inc: Math.acos(clamp(h[2] / (hn || 1), -1, 1)), bound: eps < 0 };
    if (eps < 0) {
      const a = -mu / (2 * eps);
      out.a = a; out.rp = a * (1 - e); out.ra = a * (1 + e);
      out.periapsisAlt = out.rp - RE; out.apoapsisAlt = out.ra - RE;
      out.period = 2 * Math.PI * Math.sqrt(a * a * a / mu);
    } else {
      out.rp = hn * hn / mu / (1 + e); out.periapsisAlt = out.rp - RE; out.apoapsisAlt = Infinity; out.ra = Infinity;
    }
    out.flightPath = Math.asin(clamp(vec.dot(r, v) / (rn * vn || 1), -1, 1));
    return out;
  }

  function moonElements(rRel, vRel) {
    const el = elements(rRel, vRel, MU_M);
    el.periapsisAlt = el.rp - RM;
    el.apoapsisAlt = Number.isFinite(el.ra) ? el.ra - RM : Infinity;
    return el;
  }

  function timeToPeriapsis(r, v, mu) {
    const el = elements(r, v, mu);
    if (!el.bound || el.e < 1e-6) return 0;
    const rn = vec.norm(r), e = el.e;
    const cosNu = clamp((el.a * (1 - e * e) / rn - 1) / e, -1, 1);
    let nu = Math.acos(cosNu); if (vec.dot(r, v) < 0) nu = 2 * Math.PI - nu;
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    let M = E - e * Math.sin(E); if (M < 0) M += 2 * Math.PI;
    const n = Math.sqrt(mu / (el.a ** 3));
    let t = (2 * Math.PI - M) / n;
    if (t < 0) t += 2 * Math.PI / n;
    return t;
  }

  // ---------------------------------------------------------------- gravity / propagation
  function accel(r, t, includeMoon, mu) {
    const rn = vec.norm(r);
    let a = vec.scl(r, -(mu || MU_E) / (rn * rn * rn));
    if (includeMoon) {
      const m = moonState(t);
      const d = vec.sub(r, m.r), dn = vec.norm(d);
      a = vec.add(a, vec.scl(d, -MU_M / (dn * dn * dn)));
    }
    return a;
  }

  function rk4(r, v, dt, t, includeMoon, mu) {
    const h = dt / 2;
    const k1r = v, k1v = accel(r, t, includeMoon, mu);
    const k2r = vec.add(v, vec.scl(k1v, h)), k2v = accel(vec.add(r, vec.scl(k1r, h)), t + h, includeMoon, mu);
    const k3r = vec.add(v, vec.scl(k2v, h)), k3v = accel(vec.add(r, vec.scl(k2r, h)), t + h, includeMoon, mu);
    const k4r = vec.add(v, vec.scl(k3v, dt)), k4v = accel(vec.add(r, vec.scl(k3r, dt)), t + dt, includeMoon, mu);
    return {
      r: vec.add(r, vec.scl(vec.add(vec.add(k1r, k4r), vec.scl(vec.add(k2r, k3r), 2)), dt / 6)),
      v: vec.add(v, vec.scl(vec.add(vec.add(k1v, k4v), vec.scl(vec.add(k2v, k3v), 2)), dt / 6))
    };
  }

  // ---------------------------------------------------------------- vehicles / burns
  function makeVehicle(kind, r, v, q) {
    const d = VEHICLES[kind];
    const isLander = kind === "lander";
    return {
      kind,
      r: r.slice(), v: v.slice(), q: (q || [1, 0, 0, 0]).slice(), w: [0, 0, 0],
      dryMass: d.dry,
      prop: isLander ? d.descentProp + d.ascentProp : d.prop,
      descentProp: isLander ? d.descentProp : 0,
      ascentProp: isLander ? d.ascentProp : 0,
      rcs: d.rcs || 0,
      isp: d.isp || d.descentIsp,
      thrust: d.thrust || d.descentThrust,
      rcsIsp: d.rcsIsp || 290,
      heat: 0, loadG: 0, chute: false, landed: false, docked: false
    };
  }

  function mass(v) { return v.dryMass + v.prop + v.rcs; }

  function burnFuel(v, dv, isp, propKey) {
    const m0 = mass(v);
    const mf = m0 * Math.exp(-Math.max(0, dv) / (isp * G0));
    const used = m0 - mf;
    const key = propKey || "prop";
    if (v[key] + 1e-6 < used) return { ok: false, used, available: v[key] };
    v[key] -= used;
    if (key === "prop" && v.kind === "lander") {
      // Descend/ascent propellant is tracked separately for the budget checks.
      const total = Math.max(1e-9, v.descentProp + v.ascentProp);
      const fraction = used / total;
      v.descentProp = Math.max(0, v.descentProp - used * (v.descentProp / total));
      v.ascentProp = Math.max(0, v.ascentProp - used * (v.ascentProp / total));
    }
    return { ok: true, used, available: v[key] + used };
  }

  function applyImpulse(v, dv) {
    v.v = vec.add(v.v, dv);
  }

  // ---------------------------------------------------------------- TLI / capture / TEI
  // Find a low-energy transfer from the current parking state to the Moon's
  // future position. Scans time-of-flight; the result is a training plan.
  function planTLI(park, t, options) {
    const opts = options || {};
    const minTof = (opts.minTofDays || 2.5) * 86400;
    const maxTof = (opts.maxTofDays || 4.5) * 86400;
    const step = (opts.stepHours || 2) * 3600;
    let best = null;
    for (let tof = minTof; tof <= maxTof; tof += step) {
      const m = moonState(t + tof, opts.phase0);
      const sol = lambert(park.r, m.r, tof, MU_E, true);
      if (!sol) continue;
      const dv = vec.sub(sol.v1, park.v), mag = vec.norm(dv);
      if (!best || mag < best.dvMag) best = { tDepart: t, tof, dv, dvMag: mag, v1: sol.v1, v2: sol.v2, moonArrival: m, sol };
    }
    if (!best) return null;
    return best;
  }

  function tliFeasible(plan) {
    return !!(plan && plan.dvMag > 0 && plan.dvMag < 4200);
  }

  // Capture from the lunar gate into an ellipse with a low perilune. The
  // target velocity is tangent in the current transfer plane. This is a
  // patched-conic guidance approximation, not a finite-burn optimizer.
  function captureToEllipse(rel, rp, ra) {
    const rn = vec.norm(rel.r);
    const h = vec.cross(rel.r, rel.v);
    const hn = vec.norm(h);
    if (!(hn > 0)) return null;
    const a = (rp + ra) / 2;
    const vt = Math.sqrt(MU_M * (2 / rn - 1 / a));
    let tangent = vec.unit(vec.cross(h, rel.r));
    if (vec.dot(tangent, rel.v) < 0) tangent = vec.scl(tangent, -1);
    const targetV = vec.scl(tangent, vt);
    const dv = vec.sub(targetV, rel.v);
    return { dv, dvMag: vec.norm(dv), targetV, rp, ra, a };
  }

  // Shape the incoming lunar hyperbola at the arrival gate into a flyby with
  // the requested perilune. This is a guidance/training approximation: the
  // burn is applied impulsively at the gate, then the two-body path is
  // propagated to perilune where the circularization burn is applied.
  function shapeLunarApproach(rel, rp) {
    const r0 = vec.norm(rel.r);
    if (!(r0 > rp)) return null;
    const v2 = vec.dot(rel.v, rel.v);
    const vInf2 = Math.max(0, v2 - 2 * MU_M / r0);
    const v0 = Math.sqrt(vInf2 + 2 * MU_M / r0);
    const vp = Math.sqrt(vInf2 + 2 * MU_M / rp);
    const hMag = rp * vp;
    const tangential = hMag / r0;
    if (tangential >= v0) return null;
    const radial = Math.sqrt(Math.max(0, v0 * v0 - tangential * tangential));
    const h = vec.cross(rel.r, rel.v);
    let tangent = vec.unit(vec.cross(h, rel.r));
    if (vec.dot(tangent, rel.v) < 0) tangent = vec.scl(tangent, -1);
    const inward = vec.scl(vec.unit(rel.r), -1);
    const shapedV = vec.add(vec.scl(tangent, tangential), vec.scl(inward, radial));
    return { v: shapedV, dv: vec.sub(shapedV, rel.v), dvMag: vec.norm(vec.sub(shapedV, rel.v)), rp, vp, r0 };
  }

  function circularizeAtPeriapsis(rel, altitude) {
    const rn = vec.norm(rel.r);
    const targetR = RM + altitude;
    if (Math.abs(rn - targetR) > 50000) return null;
    const vCirc = Math.sqrt(MU_M / targetR);
    const h = vec.cross(rel.r, rel.v);
    let tangent = vec.unit(vec.cross(h, rel.r));
    if (vec.dot(tangent, rel.v) < 0) tangent = vec.scl(tangent, -1);
    const targetV = vec.scl(tangent, vCirc);
    const dv = vec.sub(targetV, rel.v);
    return { dv, dvMag: vec.norm(dv), targetV, targetR };
  }

  // TEI: Lambert from the current Earth-relative lunar-orbit state to a
  // 120 km Earth-interface target above the splashdown longitude. The Moon's
  // gravity is ignored after the impulsive departure burn (patched conic).
  function planTEI(orion, t, options) {
    const opts = options || {};
    const tof = (opts.tofDays || 3.2) * 86400;
    const targetDir = [Math.cos(SPLASHDOWN.lat) * Math.cos(SPLASHDOWN.lon),
      Math.cos(SPLASHDOWN.lat) * Math.sin(SPLASHDOWN.lon), Math.sin(SPLASHDOWN.lat)];
    const target = vec.scl(targetDir, RE + ENTRY_ALT);
    const m = moonState(t);
    const rNow = vec.sub(orion.r, m.r);
    const vNow = vec.sub(orion.v, m.v);
    // Departure from lunar orbit is treated as a single Earth-frame impulse.
    const earthR = vec.add(m.r, rNow);
    const earthV = vec.add(m.v, vNow);
    const sol = lambert(earthR, target, tof, MU_E, true);
    if (!sol) return null;
    const dv = vec.sub(sol.v1, earthV);
    return { tDepart: t, tof, dv, dvMag: vec.norm(dv), v1: sol.v1, target, sol, earthR, earthV };
  }

  // ---------------------------------------------------------------- descent / entry helpers
  // Bounded 2 km south-polar training patch. The same height function is used
  // for the visual mesh and for contact/slope checks.
  function terrainHeight(x, z) {
    const r = Math.hypot(x, z);
    const craterA = Math.exp(-((x - 280) ** 2 + (z + 180) ** 2) / (2 * 140 ** 2));
    const craterB = Math.exp(-((x + 360) ** 2 + (z - 250) ** 2) / (2 * 110 ** 2));
    const ridge = 22 * Math.exp(-((z - 0.22 * x) ** 2) / (2 * 310 ** 2));
    const rough = 3.2 * Math.sin(x * 0.021) * Math.cos(z * 0.017) + 1.8 * Math.sin((x + z) * 0.041);
    return -18 * craterA - 12 * craterB + ridge + rough + 0.006 * r;
  }
  function terrainGradient(x, z, eps) {
    const e = eps || 2;
    return [(terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e),
      (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e)];
  }
  function terrainSlopeDeg(x, z) {
    const g = terrainGradient(x, z);
    return Math.atan(Math.hypot(g[0], g[1])) / DEG;
  }
  function siteById(id) { return SITES.find((s) => s.id === id) || SITES[0]; }

  function atmosphereDensity(alt) {
    if (alt >= ATM_TOP) return 0;
    if (alt <= 0) return 1.225;
    // Exponential fit, close to US76 at entry altitudes for gameplay.
    return 1.225 * Math.exp(-alt / 7200);
  }

  // Very compact Orion entry model: point mass, drag + banked lift, with
  // heat/load indicators. It is a training approximation, not the Artemis
  // I/II entry guidance or a certified aerothermal model.
  function entryDerivative(alt, speed, gamma, bank, chute) {
    const rho = atmosphereDensity(alt);
    const m = 10500;
    const cdA = chute ? 320 : 15.5;
    const q = 0.5 * rho * speed * speed;
    const drag = q * cdA / m;
    const lift = drag * (chute ? 0.05 : 0.28) * Math.cos(bank);
    const heat = 1.83e-4 * Math.sqrt(Math.max(1e-9, rho / 0.25)) * speed * speed * speed / 1e5;
    const loadG = Math.hypot(drag, lift) / G0;
    const dSpeed = -drag - G0 * Math.sin(gamma);
    const dGamma = (lift / Math.max(1, speed)) * Math.cos(bank) - (G0 / Math.max(1, speed) - speed / (RE + alt)) * Math.cos(gamma);
    return { dAlt: speed * Math.sin(gamma), dSpeed, dGamma, heat, loadG, q, rho, drag, lift };
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  const api = {
    DEG, G0, MU_E, RE, MU_M, RM, MOON_A, MOON_PERIOD, MOON_INC, MOON_PHASE0,
    MOON_SOI, LUNAR_GATE, ENTRY_ALT, ATM_TOP, SPLASHDOWN, PARK, VEHICLES, SITES,
    vec, quat, clamp, smooth, moonState, parkingState, moonRelative, moonToEci,
    stumpff, kepler, lambert, elements, moonElements, timeToPeriapsis,
    accel, rk4, makeVehicle, mass, burnFuel, applyImpulse,
    planTLI, tliFeasible, captureToEllipse, shapeLunarApproach, circularizeAtPeriapsis, planTEI,
    terrainHeight, terrainGradient, terrainSlopeDeg, siteById,
    atmosphereDensity, entryDerivative, lerp
  };
  root.ArtemisSim = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
