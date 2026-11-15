/*
 * artemis_simulation.js — shared, DOM-free physics and trajectory helpers for
 * the Artemis II-inspired crewed lunar flyby simulation (and reusable cislunar
 * helpers).
 *
 * Units: SI (m, s, kg, N, rad). Frames:
 *   ECI    Earth-centred inertial, equatorial XY, Z north.
 *   MCI    Moon-centred inertial, parallel to ECI.
 *   LOCAL  local reference frame.
 *
 * The active Artemis II trajectory model uses a continuous patched-conic
 * free-return architecture:
 *   1. Guided SLS ascent from LC-39B (T-15s to T+510s) into an initial
 *      ~200 x 2,200 km Earth orbit (~90 min period), with SRB separation,
 *      Service Module fairing jettison, LAS jettison, and Core Stage MECO/sep.
 *   2. ICPS perigee-raising burn into High Earth Orbit (~300 x 70,000 km,
 *      ~24 h checkout orbit), followed by Orion/ICPS separation and Proximity
 *      Operations demonstration.
 *   3. Trans-Lunar Injection (TLI) placing Orion onto a ~4-day outbound transfer
 *      extending >230,000 miles from Earth to the Lunar Flyby entry gate.
 *   4. Moon-centred hyperbolic flyby passing ~4,600 miles (~7,400 km) beyond
 *      the lunar far side (~244,500 miles from Earth), including geometric
 *      Earth-Moon line-of-sight occultation (far-side communications blackout).
 *   5. Gravity-driven ~4-day free-return trajectory back to Earth Entry
 *      Interface (~75 miles / 121.9 km altitude) at ~25,000 mph (~11.1 km/s),
 *      followed by atmospheric entry (~4G peak load, ~5,000°F peak heat-shield
 *      temperature), 11-parachute deployment sequence, and Pacific splashdown
 *      ~50 NM off California.
 *
 * Reusable landing/rendezvous helpers are preserved for compatibility with
 * future missions.
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
  const MOON_PHASE0 = 2.2557;       // nodal alignment for 3.6-day translunar transfer
  const MOON_SOI = 66100000;        // m, approximate
  const LUNAR_GATE = 20000000;      // m, legacy arrival gate
  const FLYBY_ALT = 7400000;        // m (~4,598 miles beyond the lunar far side)
  const FLYBY_HALF_TIME = 18000;    // s (5 hours inbound + 5 hours outbound in lunar flyby frame)
  const FLYBY_PERI_SPEED = 1380;    // m/s hyperbolic perilune speed at RM + FLYBY_ALT
  const ENTRY_ALT = 121920;         // m, 400,000 ft (~75.7 miles)
  const ATM_TOP = 150000;           // m
  // Pacific Ocean recovery zone ~50 nautical miles off the California coast
  const SPLASHDOWN = { lat: 32.5 * DEG, lon: -118.2 * DEG, offshoreNm: 50, region: "Pacific Ocean (50 NM off California)" };

  const MOON_X = [1, 0, 0];
  const MOON_Y = [0, Math.cos(MOON_INC), Math.sin(MOON_INC)];

  const PARK = { r: RE + 200000, ra: RE + 2200000, heoRa: RE + 70000000, inc: 28.6 * DEG };

  // Vehicle mass & propulsion parameters (simplified simulation constants).
  const VEHICLES = {
    sls: { dry: 250000, prop: 2470000, isp: 365, thrust: 39140000 }, // 8.8 million lbs liftoff thrust
    icps: { dry: 3500, prop: 29000, isp: 462, thrust: 110000 },
    orion: { dry: 15400, prop: 9200, rcs: 650, isp: 316, thrust: 26700, rcsIsp: 290 },
    lander: {
      dry: 18000, descentProp: 25000, ascentProp: 12000, rcs: 900,
      descentIsp: 330, ascentIsp: 340, descentThrust: 160000, ascentThrust: 80000, rcsIsp: 290
    }
  };

  // Preserved reusable south-polar sites for future landing scenarios.
  const SITES = [
    { id: "shackleton_rim", name: "Shackleton Rim", x: 0, z: 0, radius: 550, illumination: "High rim / long shadows", note: "Training site near a permanent-shadow boundary." },
    { id: "connecting_ridge", name: "Connecting Ridge", x: 620, z: -310, radius: 480, illumination: "Ridge crest / broad Earth view", note: "Training site with a gentle ridge and nearby crater." },
    { id: "degerlager", name: "de Gerlager Rim", x: -460, z: 540, radius: 430, illumination: "Mixed illumination / rougher approach", note: "Training site with a steeper approach and more hazards." }
  ];

  const vec = V;
  const quat = Q;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
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
    const n = Math.sqrt(MU_E / (PARK.r * PARK.r * PARK.r));
    const th0 = 0.0813 - n * 510;
    const th = th0 + n * t;
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
      const total = Math.max(1e-9, v.descentProp + v.ascentProp);
      v.descentProp = Math.max(0, v.descentProp - used * (v.descentProp / total));
      v.ascentProp = Math.max(0, v.ascentProp - used * (v.ascentProp / total));
    }
    return { ok: true, used, available: v[key] + used };
  }

  function applyImpulse(v, dv) {
    v.v = vec.add(v.v, dv);
  }

  // ---------------------------------------------------------------- SLS Ascent Profile (Phase 3)
  // Computes continuous position, velocity, acceleration, thrust, and propellant
  // from T-15s countdown through T+510s orbital insertion.
  function ascentProfile(elapsed) {
    const e = Number(elapsed) || 0;
    const targetEnd = parkingState(510);
    const padPos = [RE, 0, 0];
    if (e <= 0) {
      const rofi = e >= -12;
      const rs25 = e >= -6;
      const rs25Ramp = rs25 ? clamp((e + 6) / 6, 0, 1) : 0;
      const thrustMlbs = rs25Ramp * 1.66;
      const thrustN = thrustMlbs * 4448221.6;
      return {
        elapsed: e, countdown: e, liftoff: false,
        alt: 0, downrange: 0, speed: 0, accelG: 0, q: 0, pitchDeg: 90,
        rofi, rs25, srbActive: false, icpsActive: false,
        thrustMlbs, thrustN,
        srbPropPct: 100,
        corePropPct: rs25 ? Math.max(99.2, 100 - rs25Ramp * 0.8) : 100,
        r: padPos, v: [0, 0, 0]
      };
    }

    const u = clamp(e / 510, 0, 1);
    // Altitude climbs slowly off the pad, passes ~45 km at SRB sep (126s),
    // ~95 km at fairing/LAS sep (195-201s), and reaches 200 km at 510s.
    const alt = 200000 * (0.28 * Math.pow(u, 1.65) + 0.72 * smooth(0, 1, u));
    const speed = vec.norm(targetEnd.v) * Math.pow(u, 1.18);
    const downrange = 1650000 * Math.pow(u, 1.85);
    const pitchDeg = 90 * (1 - smooth(0.03, 0.82, u));
    const rho = atmosphereDensity(alt);
    const q = 0.5 * rho * speed * speed;

    const srbActive = e < 126;
    const rs25 = e < 480;
    const icpsActive = e >= 492;
    let thrustMlbs = 0;
    let accelG = 0;
    if (srbActive) {
      // 8.8 million lbs total thrust (75% from two SRBs @ 3.6M lbs each + 4 RS-25s)
      thrustMlbs = 8.8;
      accelG = lerp(1.47, 2.75, clamp(e / 126, 0, 1));
    } else if (rs25) {
      thrustMlbs = 2.02;
      accelG = lerp(1.05, 3.15, clamp((e - 126) / (480 - 126), 0, 1));
    } else if (e < 492) {
      thrustMlbs = 0;
      accelG = 0.02;
    } else {
      thrustMlbs = 0.25;
      accelG = 0.45;
    }

    const srbPropPct = clamp(100 * (1 - e / 126), 0, 100);
    const corePropPct = clamp(99.2 * (1 - e / 480), 0, 100);

    // Smoothly interpolate ECI state from LC-39B pad to the exact 510s parking state
    const th = (downrange / RE);
    const X = [1, 0, 0];
    const Y = [0, Math.cos(PARK.inc), Math.sin(PARK.inc)];
    const rad = RE + alt;
    const c = Math.cos(th), s = Math.sin(th);
    const r = [
      rad * (c * X[0] + s * Y[0]),
      rad * (c * X[1] + s * Y[1]),
      rad * (c * X[2] + s * Y[2])
    ];
    const fpa = (pitchDeg * DEG) * (1 - smooth(0.15, 0.95, u));
    const vHoriz = speed * Math.cos(fpa);
    const vRad = speed * Math.sin(fpa);
    const uRad = vec.unit(r);
    const uTan = [-s * X[0] + c * Y[0], -s * X[1] + c * Y[1], -s * X[2] + c * Y[2]];
    const v = e >= 509.5 ? targetEnd.v.slice() : vec.add(vec.scl(uTan, vHoriz), vec.scl(uRad, vRad));
    const rFinal = e >= 509.5 ? targetEnd.r.slice() : r;

    return {
      elapsed: e, countdown: 0, liftoff: true,
      alt, downrange, speed, accelG, q, pitchDeg,
      rofi: false, rs25, srbActive, icpsActive,
      thrustMlbs, thrustN: thrustMlbs * 4448221.6,
      srbPropPct, corePropPct,
      r: rFinal, v
    };
  }

  // ---------------------------------------------------------------- High Earth Orbit Raise (Phase 4)
  // Computes the prograde perigee burn to raise apoapsis to High Earth Orbit
  // (~38,000 km for a ~11-hour HEO ellipse, realistic for ICPS delta-v budget).
  function planHighEarthOrbitBurn(r, v) {
    const rn = vec.norm(r);
    const vn = vec.norm(v);
    const targetRa = RE + 38000000; // 38,000 km apoapsis altitude
    const a = (rn + targetRa) / 2;
    const vTarget = Math.sqrt(MU_E * (2 / rn - 1 / a));
    const dvMag = Math.max(120, vTarget - vn);
    const uPro = vec.unit(v);
    const dv = vec.scl(uPro, dvMag);
    return { dv, dvMag, targetApoapsisAlt: targetRa - RE, targetPeriapsisAlt: rn - RE, a };
  }

  // ---------------------------------------------------------------- Artemis II Free-Return Trajectory (Phases 6-9)
  // Computes a continuous patched-conic figure-eight free-return trajectory:
  //   - Outbound Kepler transfer from Earth orbit to the Lunar Flyby entry gate
  //   - Moon-centred hyperbolic flyby arc passing FLYBY_ALT (~7,400 km / 4,600 mi)
  //     directly behind the lunar far side (through the Earth-Moon occultation cone)
  //   - Return Kepler transfer from the Lunar Flyby exit gate back to Earth
  //     Entry Interface (121.9 km / ~75 miles altitude)
  function flybyHyperbolaState(tPerilune, tau) {
    const mPeri = moonState(tPerilune);
    const uRadial = vec.unit(mPeri.r); // Anti-Earth direction (lunar far side)
    const hMoon = vec.unit(vec.cross(mPeri.r, mPeri.v));
    const uTang = vec.unit(vec.cross(hMoon, uRadial));
    // Perilune is directly behind the Moon at RM + FLYBY_ALT (~4,600 miles above surface)
    // Velocity is retrograde (-uTang) for the figure-eight free-return loop.
    const rPeriRel = vec.scl(uRadial, RM + FLYBY_ALT);
    const vPeriRel = vec.scl(uTang, -FLYBY_PERI_SPEED);
    const prop = kepler(rPeriRel, vPeriRel, tau, MU_M);
    const mNow = moonState(tPerilune + tau);
    return {
      rRel: prop.r,
      vRel: prop.v,
      rEci: vec.add(mNow.r, prop.r),
      vEci: vec.add(mNow.v, prop.v),
      moon: mNow,
      periluneAlt: FLYBY_ALT,
      periluneR: RM + FLYBY_ALT
    };
  }

  function planFreeReturnTLI(orionState, tDepart, options) {
    const opts = options || {};
    const tofOut = (opts.tofOutDays || 3.6) * 86400;
    const tofReturn = (opts.tofReturnDays || 3.6) * 86400;
    const tFlybyIn = tDepart + tofOut;
    const tPerilune = tFlybyIn + FLYBY_HALF_TIME;
    const tFlybyOut = tPerilune + FLYBY_HALF_TIME;
    const tEntry = tFlybyOut + tofReturn;

    const entryGate = flybyHyperbolaState(tPerilune, -FLYBY_HALF_TIME);
    const periluneState = flybyHyperbolaState(tPerilune, 0);
    const exitGate = flybyHyperbolaState(tPerilune, +FLYBY_HALF_TIME);

    // Determine the departure orbit's perigee radius and perigee speed
    const r0 = vec.norm(orionState.r);
    const v0 = vec.norm(orionState.v);
    const el0 = elements(orionState.r, orionState.v, MU_E);
    const rp = (el0.bound && el0.rp >= RE + 120000 && el0.rp <= RE + 1000000) ? el0.rp : clamp(r0, RE + 180000, RE + 600000);
    const vp = (el0.bound && el0.a > 0) ? Math.sqrt(MU_E * (2 / rp - 1 / el0.a)) : v0;

    // Compute the tangential perigee TLI injection state in the transfer plane
    const hMoon = vec.unit(vec.cross(periluneState.moon.r, periluneState.moon.v));
    const uTarget = vec.unit(entryGate.rEci);
    const uTangTarget = vec.unit(vec.cross(hMoon, uTarget));
    const sweepOut = 175.34 * DEG;
    const uDep = vec.add(vec.scl(uTarget, Math.cos(sweepOut)), vec.scl(uTangTarget, -Math.sin(sweepOut)));
    const rWindow = vec.scl(uDep, rp);
    const vWindowPre = vec.scl(vec.unit(vec.cross(hMoon, uDep)), vp);

    // Check direct Lambert from orionState.r first; if orionState is already at the
    // nodal perigee window (e.g. t = 510s), preserve orionState.r directly.
    const solDirect = lambert(orionState.r, entryGate.rEci, tofOut, MU_E, true);
    const directDv = solDirect ? vec.sub(solDirect.v1, orionState.v) : null;
    const directDvMag = directDv ? vec.norm(directDv) : Infinity;
    const solWindow = lambert(rWindow, entryGate.rEci, tofOut, MU_E, true);
    if (!solWindow && !solDirect) return null;

    const useDirect = !!(solDirect && directDvMag < 3600 && vec.dot(vec.unit(orionState.v), vec.unit(solDirect.v1)) > 0.995);
    const rDepart = useDirect ? orionState.r.slice() : rWindow;
    const vDepartPre = useDirect ? orionState.v.slice() : vWindowPre;
    const solOut = useDirect ? solDirect : solWindow;

    // Target Earth Entry Interface (121.92 km / ~75.7 miles) on a shallow skip-entry
    // corridor (~ -1.4° flight-path angle) in the return plane, timed for Pacific splashdown.
    const uExit = vec.unit(exitGate.rEci);
    const uTangExit = vec.unit(vec.cross(hMoon, uExit));
    const sweepRet = 172.5 * DEG;
    const uEntry = vec.add(vec.scl(uExit, Math.cos(sweepRet)), vec.scl(uTangExit, Math.sin(sweepRet)));
    const rEntryTarget = vec.scl(uEntry, RE + ENTRY_ALT);
    const solRet = lambert(exitGate.rEci, rEntryTarget, tofReturn, MU_E, true);
    if (!solRet) return null;

    const dv = vec.sub(solOut.v1, vDepartPre);
    const rawDvMag = vec.norm(dv);
    // If departing from LEO, esmDvCost reflects the HEO-assisted Orion ESM burn (~1,080 m/s);
    // if already in HEO (vp > 9,000 m/s), rawDvMag is already ~1,080 m/s.
    const esmDvCost = rawDvMag < 1800 ? rawDvMag : clamp(rawDvMag * 0.345, 950, 1250);

    return {
      tDepart,
      tof: tofOut,
      tofOut,
      tofReturn,
      tFlybyIn,
      tPerilune,
      tFlybyOut,
      tEntry,
      rDepart,
      vDepartPre,
      dv,
      dvMag: rawDvMag,
      esmDvCost,
      v1: solOut.v1,
      v2: solOut.v2,
      entryGateR: entryGate.rEci,
      entryGateV: entryGate.vEci,
      periluneR: periluneState.rEci,
      periluneV: periluneState.vEci,
      periluneAltKm: FLYBY_ALT / 1000,
      periluneAltMi: (FLYBY_ALT / 1000) * 0.621371,
      maxEarthDistKm: vec.norm(periluneState.rEci) / 1000,
      maxEarthDistMi: (vec.norm(periluneState.rEci) / 1000) * 0.621371,
      exitGateR: exitGate.rEci,
      exitGateV: exitGate.vEci,
      returnV1: solRet.v1,
      returnV2: solRet.v2,
      rEntryTarget,
      moonArrival: periluneState.moon,
      sol: solOut,
      solRet
    };
  }

  // Evaluates the continuous patched-conic free-return state at any mission time t
  function freeReturnStateAt(plan, t) {
    if (!plan) return null;
    let r, v, segment;
    if (t <= plan.tFlybyIn) {
      const dt = Math.max(0, t - plan.tDepart);
      const k = kepler(plan.rDepart, plan.v1, dt, MU_E);
      r = k.r; v = k.v; segment = "outbound";
    } else if (t <= plan.tFlybyOut) {
      const tau = t - plan.tPerilune;
      const fb = flybyHyperbolaState(plan.tPerilune, tau);
      r = fb.rEci; v = fb.vEci; segment = "flyby";
    } else {
      const dt = Math.min(plan.tofReturn, Math.max(0, t - plan.tFlybyOut));
      const k = kepler(plan.exitGateR, plan.returnV1, dt, MU_E);
      r = k.r; v = k.v; segment = "return";
    }
    const moon = moonState(t);
    const rRel = vec.sub(r, moon.r);
    const vRel = vec.sub(v, moon.v);
    const earthDist = vec.norm(r);
    const lunarDist = vec.norm(rRel);
    const occultation = checkLunarOccultation(r, moon.r);
    return {
      t, r, v, segment, moon, rRel, vRel,
      earthDist, earthAlt: earthDist - RE,
      lunarDist, lunarAlt: lunarDist - RM,
      occultation
    };
  }

  function sampleFreeReturnCurve(plan, stepsPerLeg) {
    if (!plan) return [];
    const n = Math.max(12, stepsPerLeg || 36);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = lerp(plan.tDepart, plan.tFlybyIn, i / n);
      pts.push(freeReturnStateAt(plan, t).r);
    }
    for (let i = 1; i <= n; i++) {
      const t = lerp(plan.tFlybyIn, plan.tFlybyOut, i / n);
      pts.push(freeReturnStateAt(plan, t).r);
    }
    for (let i = 1; i <= n; i++) {
      const t = lerp(plan.tFlybyOut, plan.tEntry, i / n);
      pts.push(freeReturnStateAt(plan, t).r);
    }
    return pts;
  }

  // Geometric line-of-sight occultation check between Earth [0,0,0] and Orion
  // by the lunar sphere of radius RM at moonR.
  function checkLunarOccultation(orionR, moonR) {
    const dM = vec.norm(moonR);
    if (!(dM > 1)) return { blackout: false, behindMoon: false, perpKm: Infinity, marginKm: -Infinity };
    const uM = vec.scl(moonR, 1 / dM);
    const proj = vec.dot(orionR, uM);
    const behindMoon = proj > dM;
    const perpVec = vec.sub(orionR, vec.scl(uM, proj));
    const perp = vec.norm(perpVec);
    const occRadius = RM * 1.04;
    const blackout = behindMoon && perp <= occRadius;
    return {
      blackout,
      behindMoon,
      perpKm: perp / 1000,
      marginKm: (occRadius - perp) / 1000,
      beyondMoonKm: (proj - dM) / 1000
    };
  }

  // Legacy/compatible planTLI wrapper
  function planTLI(park, t, options) {
    const fr = planFreeReturnTLI(park, t, options);
    if (fr) return fr;
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
    return best;
  }

  function tliFeasible(plan) {
    return !!(plan && plan.dvMag > 0 && plan.dvMag < 4800);
  }

  // Preserved reusable lunar orbit / lander helpers for future scenarios
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

  function planTEI(orion, t, options) {
    const opts = options || {};
    const tof = (opts.tofDays || 3.2) * 86400;
    const targetDir = [
      Math.cos(SPLASHDOWN.lat) * Math.cos(SPLASHDOWN.lon),
      Math.cos(SPLASHDOWN.lat) * Math.sin(SPLASHDOWN.lon),
      Math.sin(SPLASHDOWN.lat)
    ];
    const target = vec.scl(targetDir, RE + ENTRY_ALT);
    const m = moonState(t);
    const rNow = vec.sub(orion.r, m.r);
    const vNow = vec.sub(orion.v, m.v);
    const earthR = vec.add(m.r, rNow);
    const earthV = vec.add(m.v, vNow);
    const sol = lambert(earthR, target, tof, MU_E, true);
    if (!sol) return null;
    const dv = vec.sub(sol.v1, earthV);
    return { tDepart: t, tof, dv, dvMag: vec.norm(dv), v1: sol.v1, target, sol, earthR, earthV };
  }

  // ---------------------------------------------------------------- terrain / entry helpers
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
    return [
      (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e),
      (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e)
    ];
  }
  function terrainSlopeDeg(x, z) {
    const g = terrainGradient(x, z);
    return Math.atan(Math.hypot(g[0], g[1])) / DEG;
  }
  function siteById(id) { return SITES.find((s) => s.id === id) || SITES[0]; }

  function atmosphereDensity(alt) {
    if (alt >= ATM_TOP) return 0;
    if (alt <= 0) return 1.225;
    return 1.225 * Math.exp(-alt / 7200);
  }

  // Orion Crew Module atmospheric entry model: models lunar-return entry from
  // ~11,100 m/s (~25,000 mph) at 121.9 km (~75 miles) with lift-modulated
  // deceleration peaking near ~4.0G and Avcoat heat-shield temperature peaking
  // near ~5,000°F.
  function entryDerivative(alt, speed, gamma, bank, chute) {
    const rho = atmosphereDensity(alt);
    const m = 10400;
    const cdA = chute ? 340 : 15.2;
    const q = 0.5 * rho * speed * speed;
    const rawDrag = q * cdA / m;
    // Lift-modulated skip-entry guidance caps sustained crew load near ~4.0 G
    const drag = chute ? rawDrag : Math.min(rawDrag, 3.85 * G0);
    const lift = drag * (chute ? 0.04 : 0.30) * Math.cos(bank || 0);
    const heat = 1.83e-4 * Math.sqrt(Math.max(1e-9, rho / 0.25)) * speed * speed * speed / 1e5;
    const tempF = clamp(70 + heat * 62, 70, 5050);
    const loadG = Math.min(4.2, Math.hypot(drag, lift) / G0);
    const dSpeed = -drag - G0 * Math.sin(gamma);
    const dGamma = (lift / Math.max(1, speed)) * Math.cos(bank || 0) - (G0 / Math.max(1, speed) - speed / (RE + alt)) * Math.cos(gamma);
    return { dAlt: speed * Math.sin(gamma), dSpeed, dGamma, heat, tempF, loadG, q, rho, drag, lift };
  }

  const api = {
    DEG, G0, MU_E, RE, MU_M, RM, MOON_A, MOON_PERIOD, MOON_INC, MOON_PHASE0,
    MOON_SOI, LUNAR_GATE, FLYBY_ALT, FLYBY_HALF_TIME, FLYBY_PERI_SPEED,
    ENTRY_ALT, ATM_TOP, SPLASHDOWN, PARK, VEHICLES, SITES,
    vec, quat, clamp, smooth, lerp,
    moonState, parkingState, moonRelative, moonToEci,
    stumpff, kepler, lambert, elements, moonElements, timeToPeriapsis,
    accel, rk4, makeVehicle, mass, burnFuel, applyImpulse,
    ascentProfile, planHighEarthOrbitBurn, flybyHyperbolaState, planFreeReturnTLI,
    freeReturnStateAt, sampleFreeReturnCurve, checkLunarOccultation,
    planTLI, tliFeasible, captureToEllipse, shapeLunarApproach, circularizeAtPeriapsis, planTEI,
    terrainHeight, terrainGradient, terrainSlopeDeg, siteById,
    atmosphereDensity, entryDerivative
  };
  root.ArtemisSim = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
