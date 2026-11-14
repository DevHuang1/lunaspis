/*
 * shuttle_simulation.js — deterministic Shuttle-era flight model for the solo Shuttle mission.
 *
 * NO DOM, camera, Three.js or asset dependencies. Loads in the browser (window.ShuttleSim) and in
 * Node (module.exports) so the same code is exercised by automated checks.
 *
 * Units: SI internally (m, s, kg, N, rad). Frames:
 *   ECI   Earth-centred inertial. X/Y equatorial plane, Z north. Earth-fixed frame rotates about Z
 *         at OMEGA_E; theta(t) = theta0 + OMEGA_E * t.
 *   BODY  Matches the repository mesh convention: +Z nose, +Y dorsal (payload-bay side), +X = Y x Z
 *         (the vehicle's LEFT side as seen by the crew). Right-handed. Attitude quaternion q maps
 *         BODY -> ECI.
 *   ENU   Local east/north/up at a site; runway frame: x along runway heading, y to the right, z up.
 *
 * Model simplifications (gameplay approximations, not a certified flight model):
 *   point-mass gravity (no J2), piecewise US76-like atmosphere with a hard cut-off at 150 km,
 *   simple blended hypersonic/subsonic aero coefficients, commanded-rate attitude control instead of
 *   rigid-body inertia, idealised RCS, spherical Earth, calm air co-rotating with the Earth.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- constants
  const MU = 3.986004418e14;      // m^3/s^2
  const RE = 6.371e6;             // m, spherical Earth radius used everywhere
  const OMEGA_E = 7.2921159e-5;   // rad/s
  const G0 = 9.80665;             // m/s^2
  const DEG = Math.PI / 180;
  const ATMO_TOP = 150e3;         // m — aerodynamic forces are exactly zero above this
  const EI_ALT = 121.9e3;         // m — entry interface (400,000 ft)

  // Vehicle numbers: rounded public Shuttle-era figures, tuned for gameplay (documented approximations).
  const V = {
    orbiterInert: 79000, payloadMass: 11500, omsPropInit: 10500, rcsPropInit: 1400,
    etInert: 26500, etPropInit: 726000,
    srbInert: 87000, srbPropInit: 503000,             // each
    srbIsp: 268, srbFmax: 13.9e6,                     // each, profile-scaled
    ssmeFvac: 2.09e6, ssmeIspVac: 452.3, ssmeAe: 4.17, ssmeCount: 3,
    omsF: 2 * 26700, omsIsp: 313,
    rcsTransAccel: 0.08, rcsIsp: 280,                 // m/s^2 at nominal orbiter mass
    rcsAngAccel: 1.2 * DEG, rcsMaxRate: 3.0 * DEG, holdMaxRate: 1.5 * DEG,
    S: 249.9,                                          // m^2 reference area
    stackCdA: 0.35 * 120,                              // m^2 launch stack drag area
    gearDeployTime: 4.0, doorTime: 45.0,
    // body-frame contact points (m): +X left, +Y dorsal, +Z nose
    mainGear: [0, -4.6, -2.0], noseGear: [0, -4.4, 13.5], belly: [0, -2.4, -2.0], tail: [0, -1.1, -16.0],
    payloadSocket: [0, 3.6, -1.5],
  };

  const SITES = {
    pad: { name: "LC-39A", lat: 28.6083 * DEG, lon: -80.6041 * DEG, h: 0 },
    // Shuttle Landing Facility, runway 15 (training geometry: rounded coordinates/heading)
    runway: { name: "KSC SLF RWY 15", lat: 28.6150 * DEG, lon: -80.6950 * DEG, h: 0,
              heading: 150 * DEG, length: 4572, width: 91.4 },
  };

  // ---------------------------------------------------------------- vector / quaternion helpers
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => Math.sqrt(dot(a, a));
  const unit = (a) => { const n = norm(a); return n > 0 ? scl(a, 1 / n) : [0, 0, 0]; };
  const addS = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  // quaternion [w,x,y,z]
  const qmul = (a, b) => [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
  const qconj = (q) => [q[0], -q[1], -q[2], -q[3]];
  const qnorm = (q) => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
  function qrot(q, v) {
    const [w, x, y, z] = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  }
  // quaternion from orthonormal body axes expressed in the parent frame (columns X,Y,Z)
  function qFromAxes(X, Y, Z) {
    const m00 = X[0], m01 = Y[0], m02 = Z[0], m10 = X[1], m11 = Y[1], m12 = Z[1], m20 = X[2], m21 = Y[2], m22 = Z[2];
    const tr = m00 + m11 + m22;
    let w, x, y, z;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    return qnorm([w, x, y, z]);
  }
  const qAxes = (q) => ({ x: qrot(q, [1, 0, 0]), y: qrot(q, [0, 1, 0]), z: qrot(q, [0, 0, 1]) });
  // body attitude from nose direction and dorsal hint (dorsal re-orthogonalised)
  function qFromNoseUp(nose, upHint) {
    const Z = unit(nose);
    let Y = sub(upHint, scl(Z, dot(upHint, Z)));
    if (norm(Y) < 1e-6) Y = Math.abs(Z[2]) < 0.9 ? cross(Z, [0, 0, 1]) : cross(Z, [1, 0, 0]);
    Y = unit(Y);
    const X = cross(Y, Z);
    return qFromAxes(X, Y, Z);
  }
  function qAngle(a, b) { // smallest rotation angle between attitudes
    const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
    return 2 * Math.acos(clamp(d, 0, 1));
  }
  // integrate body rates (rad/s) over dt
  function qIntegrate(q, w, dt) {
    const ang = norm(w) * dt;
    if (ang < 1e-12) return q;
    const ax = unit(w), s = Math.sin(ang / 2);
    return qnorm(qmul(q, [Math.cos(ang / 2), ax[0] * s, ax[1] * s, ax[2] * s]));
  }
  // rotate attitude a toward b by at most maxAng (slerp)
  function qToward(a, b, maxAng) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
    const ang = 2 * Math.acos(clamp(d, -1, 1));
    if (ang <= maxAng || ang < 1e-9) return bb.slice();
    const t = maxAng / ang, th = Math.acos(clamp(d, -1, 1)), s = Math.sin(th);
    const k0 = Math.sin((1 - t) * th) / s, k1 = Math.sin(t * th) / s;
    return qnorm([a[0] * k0 + bb[0] * k1, a[1] * k0 + bb[1] * k1, a[2] * k0 + bb[2] * k1, a[3] * k0 + bb[3] * k1]);
  }
  // body-rate vector (rad/s) that rotates q toward target (proportional, saturated)
  function rateToward(q, target, gain, maxRate) {
    let e = qmul(qconj(q), target);
    if (e[0] < 0) e = [-e[0], -e[1], -e[2], -e[3]];
    const ang = 2 * Math.acos(clamp(e[0], -1, 1));
    if (ang < 1e-9) return [0, 0, 0];
    const ax = unit([e[1], e[2], e[3]]);
    return scl(ax, Math.min(maxRate, gain * ang));
  }

  // ---------------------------------------------------------------- Earth / sites
  const gmst = (st, t) => st.theta0 + OMEGA_E * (t === undefined ? st.t : t);
  const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; };
  const ecefToEci = (p, th) => rotZ(p, th);
  const eciToEcef = (p, th) => rotZ(p, -th);
  const llhToEcef = (lat, lon, h) => { const r = RE + h; return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]; };
  function ecefToLL(p) { const r = norm(p); return { lat: Math.asin(p[2] / r), lon: Math.atan2(p[1], p[0]), h: r - RE }; }
  function enuBasis(lat, lon) {
    const E = [-Math.sin(lon), Math.cos(lon), 0];
    const N = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
    const U = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    return { E, N, U };
  }
  const earthRateVel = (r) => [-OMEGA_E * r[1], OMEGA_E * r[0], 0]; // omega x r
  const airVel = (r, v) => sub(v, earthRateVel(r));
  function greatCircle(lat1, lon1, lat2, lon2) {
    const dlat = lat2 - lat1, dlon = lon2 - lon1;
    const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
    const d = 2 * Math.asin(Math.min(1, Math.sqrt(a))) * RE;
    const brg = Math.atan2(Math.sin(dlon) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dlon));
    return { d, brg };
  }

  // Runway frame helpers (origin: runway 15 threshold; x along landing direction, y right, z up)
  const RWY = (() => {
    const s = SITES.runway, B = enuBasis(s.lat, s.lon);
    const dir = add(scl(B.E, Math.sin(s.heading)), scl(B.N, Math.cos(s.heading)));   // landing direction
    const right = add(scl(B.E, Math.cos(s.heading)), scl(B.N, -Math.sin(s.heading)));
    const center = llhToEcef(s.lat, s.lon, s.h);
    const threshold = addS(center, dir, -s.length / 2);
    return { B, dir, right, up: B.U, center, threshold, length: s.length, width: s.width, heading: s.heading };
  })();
  function toRunway(st, rEci) {
    const p = eciToEcef(rEci, gmst(st));
    const d = sub(p, RWY.threshold);
    return { x: dot(d, RWY.dir), y: dot(d, RWY.right), h: norm(p) - RE - SITES.runway.h };
  }
  function fromRunway(st, x, y, h) {
    const ll = ecefToLL(addS(addS(RWY.threshold, RWY.dir, x), RWY.right, y));
    return ecefToEci(llhToEcef(ll.lat, ll.lon, h + SITES.runway.h), gmst(st));
  }
  const rwyVecToEci = (st, v) => ecefToEci(add(add(scl(RWY.dir, v[0]), scl(RWY.right, v[1])), scl(RWY.up, v[2])), gmst(st));
  const eciVecToRwy = (st, v) => { const e = eciToEcef(v, gmst(st)); return [dot(e, RWY.dir), dot(e, RWY.right), dot(e, RWY.up)]; };

  // ---------------------------------------------------------------- atmosphere
  const ATM = [ // h(m), rho(kg/m^3)
    [0, 1.225], [11e3, 0.3639], [20e3, 0.0880], [32e3, 0.01322], [47e3, 0.001427], [51e3, 0.000861],
    [71e3, 6.42e-5], [86e3, 6.96e-6], [100e3, 5.60e-7], [110e3, 9.71e-8], [120e3, 2.22e-8], [150e3, 2.08e-9],
  ];
  function temperature(h) {
    const k = h / 1000;
    if (k < 11) return 288.15 - 6.5 * k;
    if (k < 20) return 216.65;
    if (k < 32) return 216.65 + (k - 20);
    if (k < 47) return 228.65 + 2.8 * (k - 32);
    if (k < 51) return 270.65;
    if (k < 71) return 270.65 - 2.8 * (k - 51);
    if (k < 86) return 214.65 - 2.0 * (k - 71);
    return 186.9;
  }
  function atmosphere(h) {
    const T = temperature(Math.max(0, h));
    const a = Math.sqrt(1.4 * 287.05 * T);
    if (h >= ATMO_TOP) return { rho: 0, T, a, p: 0 };
    if (h <= 0) { const rho0 = 1.225 * Math.exp(-h / 8500); return { rho: rho0, T, a, p: rho0 * 287.05 * T }; }
    let i = 0; while (i < ATM.length - 2 && ATM[i + 1][0] < h) i++;
    const [h0, r0] = ATM[i], [h1, r1] = ATM[i + 1];
    const rho = r0 * Math.exp(Math.log(r1 / r0) * (h - h0) / (h1 - h0));
    return { rho, T, a, p: rho * 287.05 * T };
  }

  // ---------------------------------------------------------------- aerodynamics (orbiter alone)
  function aeroCoeffs(M, alpha, sb, gear) {
    const s = Math.sin(alpha), c = Math.cos(alpha);
    const clH = 1.85 * s * s * c * Math.sign(alpha || 1);
    const cdH = 1.85 * Math.abs(s * s * s) + 0.045;
    const aS = clamp(alpha, -0.2, 0.36);                     // linear to ~20 deg, then stall plateau
    const clS = 0.08 + 2.6 * aS - (alpha > 0.36 ? (alpha - 0.36) * 1.2 : 0);
    const cdS = 0.055 + 0.21 * clS * clS + 0.07 * sb + 0.025 * gear + (alpha > 0.36 ? 1.2 * (alpha - 0.36) : 0);
    const w = smooth(1.2, 4.0, M);
    const wave = 0.08 * clamp((M - 0.9) / 0.3, 0, 1) * (1 - smooth(3, 6, M));
    const trans = 0.04 * Math.exp(-(((M - 1.05) / 0.15) ** 2));
    return { CL: lerp(clS, clH, w), CD: lerp(cdS, cdH, w) + wave + trans };
  }
  // assisted angle-of-attack schedule (training profile)
  function alphaSchedule(M) {
    if (M >= 10) return 40 * DEG;
    if (M <= 2.5) return 14 * DEG;
    return (14 + (M - 2.5) * (26 / 7.5)) * DEG;
  }

  // body attitude from aerodynamic angles: alpha (nose above air velocity in the symmetric plane),
  // sigma (bank of the lift vector about the air-relative velocity; +right).
  function attitudeFromAero(r, vAir, alpha, sigma) {
    const vh = unit(vAir), up = unit(r);
    let l0 = sub(up, scl(vh, dot(up, vh)));
    if (norm(l0) < 1e-9) l0 = [0, 0, 1];
    l0 = unit(l0);
    const right0 = cross(vh, l0);
    const l = add(scl(l0, Math.cos(sigma)), scl(right0, Math.sin(sigma)));
    const nose = add(scl(vh, Math.cos(alpha)), scl(l, Math.sin(alpha)));
    const dors = add(scl(vh, -Math.sin(alpha)), scl(l, Math.cos(alpha)));
    return { q: qFromAxes(cross(dors, nose), dors, nose), lift: l };
  }
  function aeroFromAttitude(q, r, vAir) {
    const ax = qAxes(q), vh = unit(vAir), up = unit(r);
    const alpha = Math.atan2(-dot(vh, ax.y), dot(vh, ax.z));
    const l = add(scl(ax.z, Math.sin(alpha)), scl(ax.y, Math.cos(alpha)));
    let l0 = unit(sub(up, scl(vh, dot(up, vh))));
    const right0 = cross(vh, l0);
    return { alpha, sigma: Math.atan2(dot(l, right0), dot(l, l0)) };
  }

  // ---------------------------------------------------------------- orbital elements / Kepler
  function elements(r, v) {
    const rn = norm(r), vn = norm(v);
    const eps = vn * vn / 2 - MU / rn;
    const h = cross(r, v), hn = norm(h);
    const evec = sub(scl(cross(v, h), 1 / MU), scl(r, 1 / rn));
    const e = norm(evec);
    const out = { energy: eps, h: hn, e, inc: Math.acos(clamp(h[2] / (hn || 1), -1, 1)), bound: eps < 0 };
    if (eps < 0) {
      const a = -MU / (2 * eps);
      out.a = a; out.rp = a * (1 - e); out.ra = a * (1 + e);
      out.periapsisAlt = out.rp - RE; out.apoapsisAlt = out.ra - RE;
      out.period = 2 * Math.PI * Math.sqrt(a * a * a / MU);
    } else {
      out.rp = hn * hn / MU / (1 + e); out.periapsisAlt = out.rp - RE; out.apoapsisAlt = Infinity; out.ra = Infinity;
    }
    out.flightPath = Math.asin(clamp(dot(r, v) / (rn * vn || 1), -1, 1));
    return out;
  }
  // universal-variable Kepler propagation (two-body, exact to round-off)
  function stumpff(z) {
    if (z > 1e-6) { const s = Math.sqrt(z); return { C: (1 - Math.cos(s)) / z, S: (s - Math.sin(s)) / (s * s * s) }; }
    if (z < -1e-6) { const s = Math.sqrt(-z); return { C: (Math.cosh(s) - 1) / -z, S: (Math.sinh(s) - s) / (s * s * s) }; }
    return { C: 0.5 - z / 24, S: 1 / 6 - z / 120 };
  }
  function keplerPropagate(r0, v0, dt) {
    if (Math.abs(dt) < 1e-9) return { r: r0.slice(), v: v0.slice() };
    const r0n = norm(r0), vr0 = dot(r0, v0) / r0n, alpha = 2 / r0n - dot(v0, v0) / MU, sq = Math.sqrt(MU);
    let x = sq * Math.abs(alpha) * dt;
    if (!(alpha > 1e-12)) x = sq * dt / r0n;
    for (let i = 0; i < 60; i++) {
      const z = alpha * x * x, { C, S } = stumpff(z);
      const F = r0n * vr0 / sq * x * x * C + (1 - alpha * r0n) * x * x * x * S + r0n * x - sq * dt;
      const dF = r0n * vr0 / sq * x * (1 - alpha * x * x * S) + (1 - alpha * r0n) * x * x * C + r0n;
      const dx = F / dF; x -= dx;
      if (Math.abs(dx) < 1e-9) break;
    }
    const z = alpha * x * x, { C, S } = stumpff(z);
    const f = 1 - x * x / r0n * C, g = dt - x * x * x / sq * S;
    const r = add(scl(r0, f), scl(v0, g)), rn = norm(r);
    const fd = sq / (rn * r0n) * (alpha * x * x * x * S - x), gd = 1 - x * x / rn * C;
    return { r, v: add(scl(r0, fd), scl(v0, gd)) };
  }
  // time until the radius first crosses rTarget going inward (two-body); null if never
  function timeToRadius(r0, v0, rTarget, maxDt) {
    let t = 0, step = 30, prev = norm(r0) - rTarget;
    if (prev <= 0) return 0;
    while (t < maxDt) {
      const s = keplerPropagate(r0, v0, t + step), d = norm(s.r) - rTarget;
      if (d <= 0) {
        let lo = t, hi = t + step;
        for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (norm(keplerPropagate(r0, v0, m).r) - rTarget > 0) lo = m; else hi = m; }
        return hi;
      }
      t += step;
    }
    return null;
  }
  function timeToApoapsis(r, v) {
    const el = elements(r, v); if (!el.bound) return null;
    const rn = norm(r), ecc = el.e;
    if (ecc < 1e-5) return 0;
    const cosNu = clamp((el.a * (1 - ecc * ecc) / rn - 1) / ecc, -1, 1);
    let nu = Math.acos(cosNu); if (dot(r, v) < 0) nu = 2 * Math.PI - nu;
    const E = 2 * Math.atan(Math.sqrt((1 - ecc) / (1 + ecc)) * Math.tan(nu / 2));
    let Mn = E - ecc * Math.sin(E); if (Mn < 0) Mn += 2 * Math.PI;
    const n = Math.sqrt(MU / el.a ** 3);
    return (Math.PI - Mn) / n + (Mn > Math.PI ? 2 * Math.PI / n : 0);
  }

  // ---------------------------------------------------------------- state construction
  function createState(opts) {
    opts = opts || {};
    const st = {
      schema: 1, t: 0, theta0: opts.theta0 !== undefined ? opts.theta0 : 0.35,
      r: null, v: null, q: null, w: [0, 0, 0],
      mass: { orbiterInert: V.orbiterInert, payload: V.payloadMass, oms: V.omsPropInit, rcs: V.rcsPropInit,
              et: V.etPropInit, srbL: V.srbPropInit, srbR: V.srbPropInit },
      cfg: { srb: true, et: true, payload: true },
      eng: { ssme: false, srb: false, throttle: 0, oms: false, srbTime: 0 },
      regime: "pad",      // pad | ascent | orbit | atmo | ground
      flight: { alpha: 40 * DEG, sigma: 0, theta: 0, sb: 0, gear: 0, gearCmd: false, alphaAssist: true,
                brakes: 0, sigmaRateCmd: 0 },
      dap: { mode: "AUTO", holdRel: null },  // AUTO (guidance-owned) | FREE | HOLD
      bay: { doors: 0, cmd: 0 },
      payload: { power: false, checkout: 0, ready: false, released: false, releaseT: null, r: null, v: null, q: null,
                 deploy: 0, sepOK: false, collided: false },
      ground: null, debris: [],
      burn: null,          // {kind, dvTarget, dvDone, dir:'nose', active}
      log: { dvOMS: 0, dvRCS: 0, maxG: 0, maxHeat: 0, srbSepT: null, mecoT: null, etSepT: null },
      ascent: { mecoTargetApo: 300e3, hTarget: 112e3, azimuth: 90 * DEG },
      maxQ: 0,
    };
    const pad = SITES.pad, B = enuBasis(pad.lat, pad.lon);
    st.r = ecefToEci(llhToEcef(pad.lat, pad.lon, 34.1), st.theta0);    // orbiter origin: SRB aft skirts on the MLP deck (12.8 m)
    st.v = earthRateVel(st.r);
    // stack on pad: nose up, orbiter on the north side of the ET -> orbiter dorsal (+Y) points north
    st.q = qFromNoseUp(ecefToEci(B.U, st.theta0), ecefToEci(B.N, st.theta0));
    return st;
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function vehicleMass(st) {
    const m = st.mass;
    let total = m.orbiterInert + m.oms + m.rcs + (st.cfg.payload ? m.payload : 0);
    if (st.cfg.et) total += V.etInert + m.et;
    if (st.cfg.srb) total += 2 * V.srbInert + m.srbL + m.srbR;
    return total;
  }

  // SRB thrust profile (normalised) vs. burn time — grain shaped for a max-Q dip and tail-off
  function srbProfile(tb) {
    if (tb < 0) return 0;
    if (tb < 18) return 1.0;
    if (tb < 50) return lerp(1.0, 0.70, (tb - 18) / 32);
    if (tb < 70) return 0.70;
    if (tb < 95) return lerp(0.70, 0.78, (tb - 70) / 25);
    if (tb < 108) return 0.78;
    if (tb < 126) return lerp(0.78, 0.0, (tb - 108) / 18);
    return 0;
  }

  // ---------------------------------------------------------------- derived quantities
  function derive(st) {
    const r = st.r, v = st.v, rn = norm(r), alt = rn - RE;
    const va = airVel(r, v), van = norm(va), at = atmosphere(alt);
    const up = unit(r), el = elements(r, v);
    const q = 0.5 * at.rho * van * van;
    const vUp = dot(va, up);
    const hor = sub(va, scl(up, vUp));
    const p = eciToEcef(r, gmst(st)), ll = ecefToLL(p);
    const B = enuBasis(ll.lat, ll.lon);
    const vE = eciToEcef(hor, gmst(st));
    const heading = Math.atan2(dot(vE, B.E), dot(vE, B.N));
    const rw = toRunway(st, r);
    const toRwy = greatCircle(ll.lat, ll.lon, SITES.runway.lat, SITES.runway.lon);
    return {
      altitudeM: alt, inertialSpeedMps: norm(v), airspeedMps: van, mach: van / at.a, dynPressPa: q,
      eas: Math.sqrt(2 * q / 1.225), verticalSpeedMps: vUp, groundSpeedMps: norm(hor),
      flightPathRad: Math.atan2(vUp, norm(hor)), headingRad: heading, lat: ll.lat, lon: ll.lon,
      periapsisAltitudeM: el.periapsisAlt, apoapsisAltitudeM: el.apoapsisAlt, eccentricity: el.e,
      inclinationRad: el.inc, energy: el.energy, bound: el.bound, period: el.period,
      massKg: vehicleMass(st), runwayX: rw.x, runwayCrossTrackM: rw.y, runwayHeightM: rw.h,
      rangeToRunwayM: toRwy.d, bearingToRunwayRad: toRwy.brg, density: at.rho,
      heatFluxWcm2: 1.83e-4 * Math.sqrt(at.rho / 1.0) * van ** 3 / 1e4,
    };
  }

  // ---------------------------------------------------------------- forces
  function aeroAccel(st, r, v, mass, mode) {
    const alt = norm(r) - RE;
    if (alt >= ATMO_TOP) return { a: [0, 0, 0], L: 0, D: 0 };
    const va = airVel(r, v), van = norm(va);
    if (van < 1e-3) return { a: [0, 0, 0], L: 0, D: 0 };
    const at = atmosphere(alt), q = 0.5 * at.rho * van * van, vh = scl(va, 1 / van);
    if (mode === "stack") {
      const D = q * V.stackCdA;
      return { a: scl(vh, -D / mass), L: 0, D };
    }
    const f = st.flight;
    const M = van / at.a;
    const c = aeroCoeffs(M, f.alpha, f.sb, f.gear);
    const att = attitudeFromAero(r, va, f.alpha, f.sigma);
    const L = q * V.S * c.CL, D = q * V.S * c.CD;
    return { a: add(scl(att.lift, L / mass), scl(vh, -D / mass)), L, D };
  }
  const gravity = (r) => { const rn = norm(r); return scl(r, -MU / (rn * rn * rn)); };

  // RK4 for a point mass with a supplied acceleration function
  function rk4(r, v, dt, accFn) {
    const a1 = accFn(r, v);
    const r2 = addS(r, v, dt / 2), v2 = addS(v, a1, dt / 2), a2 = accFn(r2, v2);
    const r3 = addS(r, v2, dt / 2), v3 = addS(v, a2, dt / 2), a3 = accFn(r3, v3);
    const r4 = addS(r, v3, dt), v4 = addS(v, a3, dt), a4 = accFn(r4, v4);
    return {
      r: [r[0] + dt / 6 * (v[0] + 2 * v2[0] + 2 * v3[0] + v4[0]), r[1] + dt / 6 * (v[1] + 2 * v2[1] + 2 * v3[1] + v4[1]), r[2] + dt / 6 * (v[2] + 2 * v2[2] + 2 * v3[2] + v4[2])],
      v: [v[0] + dt / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]), v[1] + dt / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]), v[2] + dt / 6 * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2])],
    };
  }

  // ---------------------------------------------------------------- ascent guidance (automatic)
  // Pitch/roll program + closed-loop second stage. Attitude order: the target attitude is built from
  // the commanded thrust direction (nose) and the heads-down dorsal direction in the launch plane;
  // the vehicle rotates toward it at a bounded rate. Launch azimuth is derived from the pad latitude
  // and the target inclination (due east here), not a fixed roll angle.
  function ascentGuidance(st, d, dt) {
    const tl = st.t - st.launchT;
    const up = unit(st.r), pad = SITES.pad;
    const B = enuBasis(d.lat, d.lon);
    const az = st.ascent.azimuth;             // radians from north
    const downEcef = add(scl(B.N, Math.cos(az)), scl(B.E, Math.sin(az)));
    const down = ecefToEci(downEcef, gmst(st));
    let el;                                   // thrust elevation above local horizontal
    const va = airVel(st.r, st.v), van = norm(va);
    if (tl < 7) el = 90 * DEG;
    else if (st.cfg.srb) {
      // pitch-over kick then near-zero-alpha gravity turn (load relief), bounded below
      const kick = 90 * DEG - clamp((tl - 7) * 0.55, 0, 6) * DEG;
      const velEl = Math.atan2(dot(va, up), Math.max(1, norm(sub(va, scl(up, dot(va, up))))));
      el = tl < 18 ? kick : Math.min(kick, velEl - 1.2 * DEG);
    } else {
      // closed loop: drive altitude toward hTarget, shape vertical speed, and let horizontal
      // acceleration build orbital speed. sin(el) = (a_up_cmd + g - v_h^2/r) / a_thrust
      const hT = st.ascent.hTarget, alt = d.altitudeM;
      const vUp = dot(st.v, up), vh = norm(sub(st.v, scl(up, vUp)));
      const hdotCmd = clamp(0.012 * (hT - alt), -60, 900);
      const aUp = 0.06 * (hdotCmd - vUp);
      const g = MU / (norm(st.r) ** 2), cen = vh * vh / norm(st.r);
      const aT = Math.max(1, st.lastThrustAccel || 10);
      // never command the nose below the local horizon (the stack used to pitch 20 deg nose-down
      // when the altitude overshot the target late in second stage): flying level is enough, the
      // small vertical-speed error washes out before MECO
      el = Math.asin(clamp((aUp + g - cen) / aT, -0.02, 0.97));
    }
    const nose = add(scl(up, Math.sin(el)), scl(down, Math.cos(el)));
    // heads-down: dorsal toward the downrange/underside of the launch plane after the roll program
    const headsDown = add(scl(up, -Math.cos(el)), scl(down, Math.sin(el)));
    let qCmd = qFromNoseUp(nose, headsDown);
    if (tl < 7) qCmd = st.q;  // tower clear before rolling
    st.q = qToward(st.q, qCmd, 5.0 * DEG * dt);
  }

  // ---------------------------------------------------------------- step: per regime
  function stepAscent(st, dt, ev) {
    if (st.padHold) {
      // SSME start sequence on the pad: hold-down posts restrain the stack until SRB ignition (T-0)
      st.eng.throttle = Math.min(1.0, st.eng.throttle);
      st.mass.et -= st.eng.throttle * V.ssmeFvac * V.ssmeCount / (V.ssmeIspVac * G0) * dt;
      st.v = earthRateVel(st.r); st.r = rotZ(st.r, OMEGA_E * dt);
      st.q = qnorm(qmul([Math.cos(OMEGA_E * dt / 2), 0, 0, Math.sin(OMEGA_E * dt / 2)], st.q));
      if (st.t + dt >= st.launchT) { st.padHold = false; st.eng.srb = true; ev.push({ type: "LIFTOFF" }); }
      return;
    }
    const d = derive(st);
    // Guidance steers only while an engine is thrusting. After MECO the stack holds its attitude
    // (inertial) through ET separation; previously the closed-loop law kept running with no thrust
    // and pitched the stack nose-down for the 18 s MECO-to-separation coast.
    if (st.eng.ssme || (st.cfg.srb && st.eng.srb)) ascentGuidance(st, d, dt);
    const nose = qrot(st.q, [0, 0, 1]);
    const at = atmosphere(d.altitudeM);
    let F = 0, mdotEt = 0, mdotSrb = 0;
    // SSMEs: throttle bucket for dynamic pressure and 3 g limit
    if (st.eng.ssme) {
      let thr = 1.045;
      if (st.cfg.srb && d.dynPressPa > 26000) thr = 0.70;
      const fVacTot = V.ssmeFvac * V.ssmeCount;
      const mNow = vehicleMass(st);
      const gLim = 3 * G0 * mNow / fVacTot;
      if (!st.cfg.srb) thr = Math.min(thr, Math.max(0.67, gLim));
      st.eng.throttle += clamp(thr - st.eng.throttle, -0.1 * dt, 0.1 * dt);
      const fEach = st.eng.throttle * V.ssmeFvac - at.p * V.ssmeAe;
      F += fEach * V.ssmeCount;
      mdotEt = st.eng.throttle * V.ssmeFvac * V.ssmeCount / (V.ssmeIspVac * G0);
    }
    if (st.cfg.srb && st.eng.srb) {
      st.eng.srbTime += dt;
      const fs = V.srbFmax * srbProfile(st.eng.srbTime);
      F += 2 * fs;
      mdotSrb = fs / (V.srbIsp * G0);
    }
    const m = vehicleMass(st);
    st.lastThrustAccel = F / m;
    const thrustA = scl(nose, F / m);
    const res = rk4(st.r, st.v, dt, (r, v) => add(add(gravity(r), thrustA), aeroAccel(st, r, v, m, "stack").a));
    st.r = res.r; st.v = res.v;
    // propellant
    if (st.eng.ssme) {
      st.mass.et = Math.max(0, st.mass.et - mdotEt * dt);
      if (st.mass.et <= 0) { st.eng.ssme = false; ev.push({ type: "MECO", reason: "ET depleted" }); st.log.mecoT = st.t; }
    }
    if (st.cfg.srb) {
      st.mass.srbL = Math.max(0, st.mass.srbL - mdotSrb * dt);
      st.mass.srbR = Math.max(0, st.mass.srbR - mdotSrb * dt);
      if (st.eng.srbTime > 126 || st.mass.srbL <= 1) {
        // SRB separation: both casings become independent ballistic bodies with inherited motion
        st.cfg.srb = false; st.eng.srb = false; st.log.srbSepT = st.t;
        const ax = qAxes(st.q);
        for (const side of [1, -1]) {
          const off = add(scl(ax.x, side * 6.6), scl(ax.y, -5.25));
          st.debris.push({ id: side > 0 ? "SRB_L" : "SRB_R", kind: "srb", r: add(st.r, off), v: addS(addS(st.v, ax.x, side * 4), ax.y, -2),
                           q: st.q.slice(), cdA: 40, mass: V.srbInert + 1000, w: scl(ax.x, 0), spin: side * 0.6 * DEG });
        }
        st.mass.srbL = st.mass.srbR = 0;
        ev.push({ type: "STAGE_SEPARATED", stage: "SRB" });
      }
    }
    // MECO when the orbit apoapsis reaches the target (insertion still requires OMS-2)
    if (st.eng.ssme && !st.cfg.srb) {
      const el = elements(st.r, st.v);
      if (el.bound && el.apoapsisAlt >= st.ascent.mecoTargetApo && d.altitudeM > 95e3) {
        st.eng.ssme = false; st.log.mecoT = st.t;
        ev.push({ type: "MECO", reason: "target energy" });
      }
    }
    // ET separation 18 s after MECO; orbiter translates away along +Y (dorsal) under RCS
    if (!st.eng.ssme && st.cfg.et && st.log.mecoT !== null && st.t - st.log.mecoT >= 18) {
      st.cfg.et = false; st.log.etSepT = st.t;
      const ax = qAxes(st.q);
      st.debris.push({ id: "ET", kind: "et", r: addS(st.r, ax.y, -5.25), v: st.v.slice(), q: st.q.slice(), cdA: 300, mass: V.etInert + st.mass.et, spin: 0.25 * DEG });
      st.v = addS(st.v, ax.y, 1.2);          // automatic separation translation (-Z in NASA axes)
      st.mass.rcs -= 30;
      st.mass.et = 0;
      st.regime = "orbit"; st.dap.mode = "AUTO";
      // residual rates left by the separation sequence; the DAP keeps attitude until insertion
      st.w = [0.08 * DEG, -0.05 * DEG, 0.10 * DEG];
      ev.push({ type: "STAGE_SEPARATED", stage: "ET" });
    }
    st.maxQ = Math.max(st.maxQ, d.dynPressPa);
  }

  // LVLH frame at a state (x: along-track-ish, y: orbit normal-derived, z: radial up)
  function lvlh(r, v) {
    const U = unit(r), Hn = unit(cross(r, v)), Sx = cross(Hn, U);
    // body-like axes: Y = up (zenith), Z = along-track, X = Y x Z = +orbit normal (body X is LEFT).
    // This used -normal before, a left-handed set: qFromAxes then returned an unrelated attitude, so
    // the "bay up, nose along track" release attitude the game asked for was really something else.
    return { U, H: Hn, S: Sx, q: qFromAxes(Hn, U, Sx) };
  }
  function orbitRateBody(st) { // LVLH rotation rate expressed in body axes
    const H = unit(cross(st.r, st.v)), n = norm(cross(st.r, st.v)) / dot(st.r, st.r);
    return qrot(qconj(st.q), scl(H, n));
  }

  function stepOrbit(st, dt, input, ev) {
    const m = vehicleMass(st);
    // ---------------- attitude
    const dap = st.dap;
    const angIn = [input.pitch || 0, input.yaw || 0, input.roll || 0];
    // body-rate command from stick axes: pitch up = -wx, yaw right = -wy, roll right = +wz
    const stick = [-angIn[0], -angIn[1], angIn[2]];
    const anyStick = stick.some((s) => Math.abs(s) > 0.05);
    let rcsUse = 0;
    if (dap.mode === "AUTO" && st.autoAttitude) {
      const wCmd = rateToward(st.q, st.autoAttitude, 0.2, 1.0 * DEG);
      const dw = sub(wCmd, st.w), lim = V.rcsAngAccel * 2 * dt;
      st.w = add(st.w, [clamp(dw[0], -lim, lim), clamp(dw[1], -lim, lim), clamp(dw[2], -lim, lim)]);
      rcsUse += norm(dw) > 1e-5 ? 0.02 * dt : 0;
    } else if (dap.mode === "AUTO") {
      // attitude hold (inertial) while the guidance owns the vehicle: damp residual rates slowly
      st.w = scl(st.w, Math.max(0, 1 - 0.4 * dt));
    } else if (dap.mode === "HOLD") {
      const wOrb = orbitRateBody(st);
      if (anyStick) {
        const wCmd = add(wOrb, scl(stick, V.holdMaxRate));
        const dw = sub(wCmd, st.w), lim = V.rcsAngAccel * dt;
        st.w = add(st.w, [clamp(dw[0], -lim, lim), clamp(dw[1], -lim, lim), clamp(dw[2], -lim, lim)]);
        dap.holdRel = null; rcsUse += 0.03 * dt;
      } else {
        const L = lvlh(st.r, st.v);
        if (!dap.holdRel) dap.holdRel = qmul(qconj(L.q), st.q);
        const target = qmul(L.q, dap.holdRel);
        const wCmd = add(wOrb, rateToward(st.q, target, 0.3, V.holdMaxRate));
        const dw = sub(wCmd, st.w), lim = V.rcsAngAccel * dt;
        const ddw = [clamp(dw[0], -lim, lim), clamp(dw[1], -lim, lim), clamp(dw[2], -lim, lim)];
        st.w = add(st.w, ddw); rcsUse += norm(ddw) / (V.rcsAngAccel * dt + 1e-9) * 0.01 * dt;
      }
    } else { // FREE: stick applies angular acceleration; rates persist (no hidden damping)
      if (anyStick) {
        st.w = add(st.w, scl(stick, V.rcsAngAccel * dt));
        const wn = norm(st.w); if (wn > V.rcsMaxRate) st.w = scl(st.w, V.rcsMaxRate / wn);
        rcsUse += 0.03 * dt;
      }
    }
    st.q = qIntegrate(st.q, st.w, dt);
    // ---------------- translation (RCS) and burns (OMS); vacuum translation persists
    let thrustA = [0, 0, 0];
    const tr = [input.tx || 0, input.ty || 0, input.tz || 0];
    if (st.mass.rcs > 0 && tr.some((x) => Math.abs(x) > 0.05)) {
      const aBody = scl(tr, V.rcsTransAccel * (106000 / m));
      thrustA = add(thrustA, qrot(st.q, aBody));
      if (st.payload.released && st.payload.r) {   // player separation delta-v, away from the satellite
        st.payload.sepDv = (st.payload.sepDv || 0) + dot(qrot(st.q, aBody), unit(sub(st.r, st.payload.r))) * dt;
      }
      const F = norm(aBody) * m;
      st.mass.rcs = Math.max(0, st.mass.rcs - F / (V.rcsIsp * G0) * dt);
      st.log.dvRCS += norm(aBody) * dt;
    }
    st.mass.rcs = Math.max(0, st.mass.rcs - rcsUse);
    if (st.burn && st.burn.active) {
      const b = st.burn;
      if (st.mass.oms <= 0) { b.active = false; ev.push({ type: "BURN_END", kind: b.kind, reason: "OMS depleted" }); }
      else {
        const aB = V.omsF / m;
        const nose = qrot(st.q, [0, 0, 1]);
        thrustA = addS(thrustA, nose, aB);
        st.mass.oms = Math.max(0, st.mass.oms - V.omsF / (V.omsIsp * G0) * dt);
        b.dvDone += aB * dt; st.log.dvOMS += aB * dt; st.eng.oms = true;
        if (b.dvDone >= b.dvTarget) { b.active = false; st.eng.oms = false; ev.push({ type: "BURN_END", kind: b.kind, dv: b.dvDone }); }
      }
    } else st.eng.oms = false;
    if (norm(st.r) - RE < ATMO_TOP) { const aa = aeroFromAttitude(st.q, st.r, airVel(st.r, st.v)); st.flight.alpha = aa.alpha; st.flight.sigma = aa.sigma; }
    const res = rk4(st.r, st.v, dt, (r, v) => add(add(gravity(r), thrustA), aeroAccel(st, r, v, m, "orbiter").a));
    st.r = res.r; st.v = res.v;
    // ---------------- payload bay doors (actual progress)
    if (st.bay.cmd !== 0) {
      st.bay.doors = clamp(st.bay.doors + st.bay.cmd * dt / V.doorTime, 0, 1);
      if ((st.bay.cmd > 0 && st.bay.doors >= 1) || (st.bay.cmd < 0 && st.bay.doors <= 0)) {
        ev.push({ type: st.bay.cmd > 0 ? "DOORS_OPEN" : "DOORS_CLOSED" }); st.bay.cmd = 0;
      }
    }
  }

  function stepPayload(st, dt, ev) {
    const p = st.payload;
    if (p.power && !p.ready && st.cfg.payload) {
      if (st.bay.doors < 0.99) { p.power = false; p.checkout = 0; ev.push({ type: "PAYLOAD_POWER_LOST", reason: "radiators stowed" }); }
      else { p.checkout += dt; if (p.checkout >= 25) { p.ready = true; ev.push({ type: "PAYLOAD_READY" }); } }
    }
    if (!p.released || p.r === null) return;
    const res = rk4(p.r, p.v, dt, (r) => gravity(r));
    p.r = res.r; p.v = res.v;
    const rel = sub(p.r, st.r), range = norm(rel), rr = dot(rel, sub(p.v, st.v)) / (range || 1);
    p.range = range; p.rangeRate = rr;
    if (!p.collided && st.t - p.releaseT > 4 && range < 8 && rr < 0) {
      p.collided = true; ev.push({ type: "COLLISION", range, rangeRate: rr });
    }
    if (range > 40 && p.deploy < 1 && !p.collided) { // payload's own sequencer deploys arrays once clear
      p.deploy = Math.min(1, p.deploy + dt / 45);
      if (p.deploy >= 1) ev.push({ type: "PAYLOAD_DEPLOYED" });
    }
  }

  // entry / glide (aerodynamic-angle attitude model)
  function stepAtmo(st, dt, input, ev) {
    const f = st.flight, d = derive(st), m = vehicleMass(st);
    const approach = st.approachMode;
    // bank: rate command, attitude hold when released (documented)
    const maxRoll = (approach ? 10 : 5) * DEG;
    f.sigma = wrapPi(f.sigma + clamp(input.roll || 0, -1, 1) * maxRoll * dt);
    if (approach) f.sigma = clamp(f.sigma, -70 * DEG, 70 * DEG);
    // pitch: AoA assist holds the schedule; otherwise pitch attitude rate command / hold
    if (!approach && f.alphaAssist) {
      const tgt = alphaSchedule(d.mach);
      f.alpha += clamp(tgt - f.alpha, -2 * DEG * dt, 2 * DEG * dt);
      f.theta = d.flightPathRad + f.alpha * Math.cos(f.sigma);
    } else if (!approach) {
      f.alpha = clamp(f.alpha + (input.pitch || 0) * 2 * DEG * dt, 0, 50 * DEG);
      f.theta = d.flightPathRad + f.alpha * Math.cos(f.sigma);
    } else {
      // Approach pitch = FLIGHT-PATH-ANGLE command / hold (fly-by-wire glide): W/S move the commanded
      // glide angle, releasing holds it, and the flight computer drives AoA so the real flight path
      // follows. This replaced a pitch-attitude rate command that a keyboard pilot could not stop on
      // the cue: every correction overshot and the oscillation grew as speed decayed, so following
      // the prompt still ended short of the runway (round-3 report; tests/shuttle/run_checks.js
      // now flies the approach from the prompt alone at three reaction times).
      const gam = d.flightPathRad, hr = d.altitudeM - SITES.runway.h;
      if (f.gammaHold === undefined || f.gammaHold === null) f.gammaHold = gam;
      const grate = hr > 300 ? 3 : 2;
      f.gammaHold = clamp(f.gammaHold + (input.pitch || 0) * grate * DEG * dt, -30 * DEG, 15 * DEG);
      const gdot = f.lastGamma === undefined ? 0 : (gam - f.lastGamma) / Math.max(dt, 1e-3); f.lastGamma = gam;
      const aRate = clamp(2.6 * (f.gammaHold - gam) - 1.1 * gdot, -6 * DEG, 6 * DEG);
      f.alpha = clamp(f.alpha + aRate * dt, -4 * DEG, 24 * DEG);
      f.theta = gam + f.alpha * Math.cos(f.sigma);
    }
    // speed brake (approach), gear (one-way, 4 s deployment)
    if (input.sb !== undefined) f.sb = clamp(input.sb, 0, 1);
    if (f.gearCmd && f.gear < 1) f.gear = Math.min(1, f.gear + dt / V.gearDeployTime);
    const res = rk4(st.r, st.v, dt, (r, v) => add(gravity(r), aeroAccel(st, r, v, m, "orbiter").a));
    st.r = res.r; st.v = res.v;
    const att = attitudeFromAero(st.r, airVel(st.r, st.v), f.alpha, f.sigma);
    st.q = att.q; st.w = [0, 0, 0];
    // loads / heating (gameplay approximations driven by the actual trajectory)
    const aa = aeroAccel(st, st.r, st.v, m, "orbiter");
    const g = norm(aa.a) / G0, heat = derive(st).heatFluxWcm2;
    st.log.maxG = Math.max(st.log.maxG, g); st.log.maxHeat = Math.max(st.log.maxHeat, heat);
    st.loadG = g; st.heat = heat;
  }

  // body point altitude above the runway plane (spherical Earth)
  function pointAlt(st, bodyPt) { return norm(add(st.r, qrot(st.q, bodyPt))) - RE - SITES.runway.h; }

  function stepGround(st, dt, input, ev) {
    const g = st.ground, f = st.flight, m = vehicleMass(st);
    const at = atmosphere(0), qd = 0.5 * at.rho * g.V * g.V;
    // derotation: pilot pitch input lowers the nose; it also settles slowly as speed decays
    if (!g.noseDown) {
      const natural = g.V < 85 ? -0.8 * DEG : 0.2 * DEG;
      const rate = (input.pitch || 0) * 3 * DEG + natural;
      g.theta = Math.max(0, g.theta + rate * dt);
      g.thetaRate = rate;
      if (g.theta <= 0.3 * DEG) {
        g.noseDown = true; g.theta = 0;
        ev.push({ type: "NOSE_GEAR_TOUCHDOWN", rate: g.thetaRate });
        if (g.thetaRate < -6.5 * DEG) ev.push({ type: "GROUND_FAIL", reason: `Nose gear slapdown: derotation rate ${(g.thetaRate / DEG).toFixed(1)}°/s exceeded the 6.5°/s limit` });
      }
    }
    const alpha = g.theta;
    const c = aeroCoeffs(g.V / at.a, alpha, f.sb, 1);
    const L = qd * V.S * c.CL, D = qd * V.S * c.CD;
    const N = Math.max(0, m * G0 - L);
    let brake = 0;
    if (g.noseDown && g.V < 105) brake = clamp(input.brake || 0, 0, 1) * 2.6 * m;
    const decel = (D + 0.015 * N + brake * (N / (m * G0))) / m;
    g.V = Math.max(0, g.V - decel * dt);
    // steering: nosewheel once the nose is down, rudder authority before
    const steerRate = g.noseDown ? 4 * DEG * Math.min(1, g.V / 25) : 0.6 * DEG * Math.min(1, g.V / 60);
    g.psi = wrapPi(g.psi + clamp(input.roll || 0, -1, 1) * steerRate * dt);
    g.x += g.V * Math.cos(g.psi) * dt;
    g.y += g.V * Math.sin(g.psi) * dt;
    // keep the ECI state consistent for rendering and telemetry
    const hdg = g.psi, cg = 4.6;
    st.r = fromRunway(st, g.x, g.y, cg + Math.sin(g.theta) * 2.0);
    const vR = [g.V * Math.cos(hdg), g.V * Math.sin(hdg), 0];
    st.v = add(rwyVecToEci(st, vR), earthRateVel(st.r));
    const fwd = rwyVecToEci(st, [Math.cos(hdg) * Math.cos(g.theta), Math.sin(hdg) * Math.cos(g.theta), Math.sin(g.theta)]);
    st.q = qFromNoseUp(fwd, rwyVecToEci(st, [0, 0, 1]));
    f.alpha = g.theta; f.sigma = 0;
    if (Math.abs(g.y) > RWY.width / 2) ev.push({ type: "GROUND_FAIL", reason: `Departed the runway edge: ${Math.abs(g.y).toFixed(0)} m from centreline (limit ${(RWY.width / 2).toFixed(0)} m)` });
    else if (g.x > RWY.length) ev.push({ type: "GROUND_FAIL", reason: `Runway overrun at ${g.V.toFixed(0)} m/s — brake earlier (brakes need the nose gear down)` });
    else if (g.V < 0.3 && g.noseDown) ev.push({ type: "WHEELS_STOP", x: g.x, y: g.y });
  }

  // debris bodies (SRBs, ET): gravity + simple drag, purely visual consequence of staging
  function stepDebris(st, dt) {
    for (let i = st.debris.length - 1; i >= 0; i--) {
      const b = st.debris[i];
      const res = rk4(b.r, b.v, dt, (r, v) => {
        const alt = norm(r) - RE; let a = gravity(r);
        if (alt < ATMO_TOP) { const va = airVel(r, v), at = atmosphere(alt); a = addS(a, unit(va), -0.5 * at.rho * dot(va, va) * b.cdA / b.mass); }
        return a;
      });
      b.r = res.r; b.v = res.v;
      if (b.spin) b.q = qIntegrate(b.q, [b.spin, 0, b.spin * 0.3], dt);
      if (norm(b.r) - RE < 0 || norm(sub(b.r, st.r)) > 400e3) st.debris.splice(i, 1);
    }
  }

  // single fixed step for the whole simulation. Returns physical events (mission layer interprets).
  function step(st, input, dt) {
    const ev = [];
    input = input || {};
    switch (st.regime) {
      case "pad": st.v = earthRateVel(st.r); st.r = rotZ(st.r, OMEGA_E * dt); st.q = qnorm(qmul([Math.cos(OMEGA_E * dt / 2), 0, 0, Math.sin(OMEGA_E * dt / 2)], st.q)); break;
      case "ascent": stepAscent(st, dt, ev); break;
      case "orbit": stepOrbit(st, dt, input, ev); stepPayload(st, dt, ev); break;
      case "atmo": stepAtmo(st, dt, input, ev); break;
      case "ground": stepGround(st, dt, input, ev); break;
      default: break;
    }
    if (st.debris.length) stepDebris(st, dt);
    st.t += dt;
    return ev;
  }

  // ---------------------------------------------------------------- transitions
  function ignite(st) {
    st.regime = "ascent"; st.launchT = st.t + 6.6; st.eng.ssme = true; st.eng.throttle = 1.0;
    // SSMEs start 6.6 s before T-0; hold-down until SRB ignition (modelled as SRB at T-0)
    st.padHold = true;
  }
  // convert orbit-regime attitude to aerodynamic angles (continuous handover)
  function enterAtmo(st) {
    const va = airVel(st.r, st.v);
    const a = aeroFromAttitude(st.q, st.r, va);
    st.flight.alpha = a.alpha; st.flight.sigma = a.sigma; st.regime = "atmo"; st.w = [0, 0, 0];
  }

  // ---------------------------------------------------------------- entry prediction / guidance
  // fast predictor: integrates the entry with constant |bank| and reversal logic until the relative
  // speed drops below vEnd (TAEM interface). Returns final range/crossrange to the target.
  const TAEM_V = 762;          // m/s air-relative at handover (≈2500 ft/s)
  const TAEM_RANGE = 96e3;     // m nominal remaining range to the runway at handover (≈52 nmi)
  function predictEntry(st0, bankMag, opts) {
    opts = opts || {};
    const st = { theta0: st0.theta0, t: st0.t, r: st0.r.slice(), v: st0.v.slice(),
                 flight: { alpha: st0.flight.alpha, sigma: st0.flight.sigma, sb: 0, gear: 0 } };
    let sign = Math.sign(st.flight.sigma) || 1, dt = opts.dt || 2, steps = 0, maxG = 0, maxHeat = 0;
    const m = opts.mass || 92000;
    let first = true;
    while (steps++ < 4000) {
      const alt = norm(st.r) - RE;
      const va = airVel(st.r, st.v), van = norm(va), at = atmosphere(alt), M = van / at.a;
      if (van < TAEM_V && alt < 60e3) break;
      if (alt < 0) return { crashed: true };
      if (alt > 140e3 && dot(st.r, st.v) > 0 && !first) return { skip: true };
      first = false;
      st.flight.alpha = alphaSchedule(M);
      // lateral logic: keep heading error inside a velocity-dependent deadband
      const p = eciToEcef(st.r, gmst(st, st.t)), ll = ecefToLL(p), B = enuBasis(ll.lat, ll.lon);
      const vE = eciToEcef(va, gmst(st, st.t));
      const hdg = Math.atan2(dot(vE, B.E), dot(vE, B.N));
      const tg = greatCircle(ll.lat, ll.lon, SITES.runway.lat, SITES.runway.lon);
      const dpsi = wrapPi(tg.brg - hdg);
      const db = (van > 4000 ? 10 : 5 + 5 * (van - 1500) / 2500) * DEG;
      if (Math.abs(dpsi) > Math.max(4 * DEG, db) && Math.sign(dpsi) !== sign) sign = Math.sign(dpsi);
      const sigTgt = sign * bankMag;
      st.flight.sigma += clamp(wrapPi(sigTgt - st.flight.sigma), -5 * DEG * dt, 5 * DEG * dt);
      const res = rk4(st.r, st.v, dt, (r, v) => add(gravity(r), aeroAccel(st, r, v, m, "orbiter").a));
      st.r = res.r; st.v = res.v; st.t += dt;
      if (alt < ATMO_TOP) {
        const q = 0.5 * at.rho * van * van, c = aeroCoeffs(M, st.flight.alpha, 0, 0);
        maxG = Math.max(maxG, q * V.S * Math.hypot(c.CL, c.CD) / m / G0);
        maxHeat = Math.max(maxHeat, 1.83e-4 * Math.sqrt(at.rho) * van ** 3 / 1e4);
      }
    }
    const p = eciToEcef(st.r, gmst(st, st.t)), ll = ecefToLL(p);
    const tg = greatCircle(ll.lat, ll.lon, SITES.runway.lat, SITES.runway.lon);
    // signed range error: + = long (passes beyond the handover range), along the current heading
    const B = enuBasis(ll.lat, ll.lon), vE = eciToEcef(airVel(st.r, st.v), gmst(st, st.t));
    const hdg = Math.atan2(dot(vE, B.E), dot(vE, B.N));
    const along = tg.d * Math.cos(wrapPi(tg.brg - hdg)), cross_ = tg.d * Math.sin(wrapPi(tg.brg - hdg));
    return { rangeErr: TAEM_RANGE - along, cross: cross_, dist: tg.d, t: st.t, alt: norm(st.r) - RE, maxG, maxHeat, lat: ll.lat, lon: ll.lon };
  }
  // predictor-corrector: |bank| that nulls the predicted range error (secant, bounded 0..85 deg)
  function solveBank(st, guess, opts) {
    let a = clamp(guess || 50 * DEG, 5 * DEG, 80 * DEG), b = a + 8 * DEG;
    let fa = predictEntry(st, a, opts), fb = predictEntry(st, b, opts);
    const val = (r) => (r.skip ? 3e6 : r.crashed ? -3e6 : r.rangeErr);
    let ea = val(fa), eb = val(fb);
    for (let i = 0; i < 6; i++) {
      if (Math.abs(eb - ea) < 1) break;
      let c = b - eb * (b - a) / (eb - ea);
      c = clamp(c, 0, 88 * DEG);
      a = b; ea = eb; b = c; fb = predictEntry(st, b, opts); eb = val(fb);
      if (Math.abs(eb) < 5e3) break;
    }
    return { bank: b, pred: fb, err: eb };
  }

  // ---------------------------------------------------------------- deorbit targeting
  // Impulsive approximation for planning: retrograde dv at tImp, Kepler to entry interface, then the
  // entry predictor with a nominal 55 deg bank. Returns range/cross errors at the TAEM interface.
  function planDeorbit(st, tImp, dv, mass) {
    const s = keplerPropagate(st.r, st.v, tImp - st.t);
    const v1 = addS(s.v, unit(s.v), -dv);
    const tEI = timeToRadius(s.r, v1, RE + EI_ALT, 6000);
    if (tEI === null) return null;
    const e = keplerPropagate(s.r, v1, tEI);
    const att = attitudeFromAero(e.r, airVel(e.r, e.v), 40 * DEG, 0);
    const fake = { theta0: st.theta0, t: tImp + tEI, r: e.r, v: e.v, flight: { alpha: 40 * DEG, sigma: 50 * DEG } };
    const pred = predictEntry(fake, 55 * DEG, { dt: 4, mass });
    const elEI = elements(e.r, e.v);
    return { tEI: tImp + tEI, eiGamma: Math.asin(dot(unit(e.r), unit(airVel(e.r, e.v)))), pred, perigee: elements(s.r, v1).periapsisAlt, att, elEI };
  }
  // search forward for a landing opportunity whose nominal crossrange is small, then solve the
  // impulse time for zero range error. Coarse scan of KSC passes (unperturbed ground track).
  function findOpportunity(st, dv, mass, horizon) {
    horizon = horizon || 30 * 3600;
    const cands = [];
    let prevD = Infinity, prevT = 0, trend = 0;
    for (let t = 600; t < horizon; t += 60) {
      const s = keplerPropagate(st.r, st.v, t);
      const ll = ecefToLL(eciToEcef(s.r, gmst(st, st.t + t)));
      const dd = greatCircle(ll.lat, ll.lon, SITES.runway.lat, SITES.runway.lon).d;
      if (dd > prevD && trend < 0 && prevD < 2500e3) cands.push(st.t + prevT);
      trend = dd - prevD; prevD = dd; prevT = t;
    }
    for (const tPass of cands) {
      // impulse roughly 60 min before the pass; refine downrange with secant on the impulse time
      let t0 = tPass - 3600, t1 = tPass - 3300;
      if (t0 < st.t + 900) continue;
      let p0 = planDeorbit(st, t0, dv, mass), p1 = planDeorbit(st, t1, dv, mass);
      if (!p0 || !p1 || p0.pred.skip || p1.pred.skip || p0.pred.crashed || p1.pred.crashed) continue;
      for (let i = 0; i < 8; i++) {
        const e0 = p0.pred.rangeErr, e1 = p1.pred.rangeErr;
        if (Math.abs(e1 - e0) < 1) break;
        let t2 = t1 - e1 * (t1 - t0) / (e1 - e0);
        t2 = clamp(t2, t1 - 900, t1 + 900);
        const p2 = planDeorbit(st, t2, dv, mass);
        if (!p2 || p2.pred.skip || p2.pred.crashed) break;
        t0 = t1; p0 = p1; t1 = t2; p1 = p2;
        if (Math.abs(p1.pred.rangeErr) < 10e3) break;
      }
      if (p1 && Math.abs(p1.pred.rangeErr) < 60e3 && Math.abs(p1.pred.cross) < 60e3) return { tImp: t1, plan: p1, dv };
    }
    return null;
  }

  // ---------------------------------------------------------------- payload release
  // Spring ejection along the bay normal (+Y body). Momentum is conserved between the bodies.
  const SPRING_DV = 0.6;
  function releasePayload(st) {
    const p = st.payload, ax = qAxes(st.q);
    const socket = qrot(st.q, V.payloadSocket);
    const mSat = st.mass.payload, mOrb = vehicleMass(st) - mSat;
    p.r = add(st.r, socket);
    p.v = add(add(st.v, cross(qrot(st.q, st.w), socket)), scl(ax.y, SPRING_DV * mOrb / (mOrb + mSat)));
    p.q = st.q.slice(); p.w = qrot(st.q, st.w);
    st.v = addS(st.v, ax.y, -SPRING_DV * mSat / (mOrb + mSat));
    st.cfg.payload = false; p.released = true; p.releaseT = st.t; p.range = norm(socket); p.rangeRate = SPRING_DV;
  }

  // ---------------------------------------------------------------- approach guidance (advisory)
  // Heading-alignment-cylinder style lateral cue + energy/glideslope vertical cue. Cues only; the
  // pilot flies pitch/bank, speed brake, gear, flare and rollout.
  const HAC_R = 5500, FAP_X = -12000, AIM_X = -2000, OGS = 19 * DEG, IGS = 1.5 * DEG, XIGS = 750;
  // final-approach vertical profile: outer glideslope -> preflare arc (flight-path angle varies
  // linearly with distance, a circular-arc approximation tangent to both lines) -> inner glideslope
  const ogsH = (x) => Math.max(0, (AIM_X - x) * Math.tan(OGS));
  const FINAL = (() => {
    const tO = Math.tan(OGS), tI = Math.tan(IGS);
    const xInt = (XIGS * tI - AIM_X * tO) / (tI - tO), hInt = (AIM_X - xInt) * tO;
    const dT = (610 - hInt) / Math.sin(OGS);
    const XPF = xInt - dT * Math.cos(OGS), XJ = xInt + dT * Math.cos(IGS);
    const href = (x) => {
      if (x <= XPF) return ogsH(x);
      if (x >= XJ) return Math.max(0, (XIGS - x) * tI);
      let hh = 610; const n = 24, dx = (x - XPF) / n;
      for (let i = 0; i < n; i++) { const xm = XPF + (i + 0.5) * dx, g = lerp(OGS, IGS, (xm - XPF) / (XJ - XPF)); hh -= Math.tan(g) * dx; }
      return hh;
    };
    return { XPF, XJ, href };
  })();
  function approachGuidance(st, side) {
    const d = derive(st), rw = toRunway(st, st.r);
    const vR = eciVecToRwy(st, airVel(st.r, st.v));
    const psi = Math.atan2(vR[1], vR[0]);                     // ground-track heading rel. runway
    const V_ = d.airspeedMps, h = rw.h;
    const st_0 = st._appr || (st._appr = { mode: "ACQ" });
    if (!st_0.side) st_0.side = side || (rw.y >= 0 ? 1 : -1);
    const s = st_0.side;
    const C = [FAP_X, s * HAC_R], X = [rw.x, rw.y];
    const dC = Math.hypot(X[0] - C[0], X[1] - C[1]);
    const rot = (v, sg) => (sg > 0 ? [-v[1], v[0]] : [v[1], -v[0]]);
    const angOf = (v) => Math.atan2(v[1], v[0]);
    let mode, psiCmd, pathRem, turnBank = 0;
    const finalOK = rw.x > FAP_X - 2500 && rw.x < 0 && Math.abs(rw.y) < 2500 && Math.abs(wrapPi(psi)) < 25 * DEG;
    const st_ = st._appr || (st._appr = { mode: "ACQ" });
    if (st_.mode === "FINAL" || finalOK || rw.x >= 0) {
      st_.mode = "FINAL"; mode = rw.x < AIM_X ? "FINAL" : "FINAL";
      psiCmd = clamp(-Math.atan2(rw.y, rw.x < -4000 ? 1800 : 900), -25 * DEG, 25 * DEG);
      pathRem = Math.max(0, -rw.x);
    } else {
      // tangent point for entering the HAC in turn direction s
      const rho = [(X[0] - C[0]) / dC, (X[1] - C[1]) / dC];
      const remainArc = (pt) => {      // arc from point angle to final point P=(FAP_X,0) going in direction s
        const a0 = angOf([pt[0] - C[0], pt[1] - C[1]]), a1 = angOf([0, -s]);
        let da = s > 0 ? a1 - a0 : a0 - a1; while (da < 0) da += 2 * Math.PI; return da * HAC_R;
      };
      if (dC > HAC_R * 1.08 && st_.mode !== "HAC") {
        const beta = Math.acos(clamp(HAC_R / dC, -1, 1)), phi = angOf(rho);
        let best = null;
        for (const a of [phi + beta, phi - beta]) {
          const T = [C[0] + HAC_R * Math.cos(a), C[1] + HAC_R * Math.sin(a)];
          const vdir = rot([Math.cos(a), Math.sin(a)], s);
          const toT = [T[0] - X[0], T[1] - X[1]], n = Math.hypot(toT[0], toT[1]) || 1;
          if ((toT[0] * vdir[0] + toT[1] * vdir[1]) / n > 0.5) best = { T, n };
        }
        best = best || { T: [C[0] + HAC_R * rho[0], C[1] + HAC_R * rho[1]], n: dC - HAC_R };
        mode = "ACQ"; psiCmd = Math.atan2(best.T[1] - X[1], best.T[0] - X[0]);
        pathRem = best.n + remainArc(best.T) - FAP_X;
      } else {
        st_.mode = "HAC"; mode = "HAC";
        const tan = rot(rho, s);
        psiCmd = angOf(tan) + s * clamp((dC - HAC_R) / 1500, -0.6, 0.6);
        turnBank = s * Math.atan(V_ * V_ / (G0 * HAC_R));
        pathRem = remainArc(X) - FAP_X;
        if (Math.abs(wrapPi(angOf(tan))) < 12 * DEG && Math.abs(rw.y) < 2500 && rw.x > FAP_X - 3000) st_.mode = "FINAL";
      }
    }
    const bankCue = clamp(turnBank + 2.2 * wrapPi(psiCmd - psi), -55 * DEG, 55 * DEG);
    // vertical / energy reference
    const eFAP = ogsH(FAP_X) + 160 * 160 / (2 * G0);
    let hRef, gammaCmd, eRef = null;
    const Eh = h + V_ * V_ / (2 * G0);
    let pitchCue = null;
    if (pathRem > -FAP_X + 500 && h > 3800) {
      // TAEM: fly a dynamic-pressure profile; energy error is managed with speed brake and S-turns
      eRef = eFAP + (pathRem + FAP_X) * 0.50;
      const eErr = Eh - eRef;
      const qT = clamp(13800 + eErr * 0.6, 9000, 17000);
      const at = atmosphere(h), q = 0.5 * at.rho * V_ * V_, m = vehicleMass(st);
      const M = V_ / at.a;
      const nReq = clamp(Math.cos(d.flightPathRad) / Math.max(0.4, Math.cos(st.flight.sigma)) + 0.8 * (q - qT) / qT, 0.3, 1.8);
      const clReq = nReq * m * G0 / (Math.max(q, 1) * V.S);
      let aC = 0; for (let k = 0; k <= 48; k++) { const a = k * 0.5 * DEG; if (aeroCoeffs(M, a, st.flight.sb, st.flight.gear).CL <= clReq) aC = a; }
      pitchCue = d.flightPathRad + aC * Math.cos(st.flight.sigma);
      // glide-angle command for the fly-by-wire approach: the geometric glide that reaches the
      // final-approach point at its outer-glideslope height, steepened when slow (q below the
      // profile) and shallowed when fast
      const dRem = Math.max(2000, pathRem + FAP_X), gGeo = -Math.atan((h - ogsH(FAP_X)) / dRem);
      gammaCmd = clamp(gGeo + 0.25 * (q - qT) / qT, -24 * DEG, -4 * DEG); hRef = null;
    } else {
      const { XPF, XJ, href } = FINAL;
      hRef = href(rw.x);
      const slope = (href(rw.x + 25) - href(rw.x - 25)) / 50;
      if (h > 15) {
        mode = rw.x < XPF ? "FINAL" : rw.x < XJ ? "PREFLARE" : "SHALLOW";
        gammaCmd = Math.atan(slope) + clamp((hRef - h) / (rw.x < XPF ? 1500 : 250), -0.12, 0.12);
      } else {
        mode = "FLARE";
        gammaCmd = -Math.asin(clamp(Math.max(0.6, h * 0.1) / Math.max(V_, 1), 0, 0.3));
      }
    }
    if (pitchCue === null) pitchCue = gammaCmd + st.flight.alpha * Math.cos(st.flight.sigma);
    const easT = 150;
    const sbCue = clamp((d.eas - easT) / 25 + (eRef !== null && Eh > eRef ? (Eh - eRef) / 4000 : 0), 0, 1);
    return { mode, side: s, psi, psiCmd, bankCue, gammaCmd, pitchCue, hRef, eRef, Eh, energyErr: eRef !== null ? Eh - eRef : (hRef !== null ? h - hRef : 0),
             sbCue, pathRem, x: rw.x, y: rw.y, h, gearCue: h < 160 && st.flight.gear < 1 };
  }

  // Remaining reference ground track + height profile, in the runway frame, for the on-screen
  // guidance ribbon: (to the HAC tangent point) -> around the HAC -> final -> runway.
  function approachPath(st) {
    const rw = toRunway(st, st.r), g = st._appr || { mode: "ACQ", side: rw.y >= 0 ? 1 : -1 };
    const s = g.side || 1, C = [FAP_X, s * HAC_R], X = [rw.x, rw.y];
    const pts = [];
    const angOf = (v) => Math.atan2(v[1], v[0]);
    let arcStart = null;
    if (g.mode !== "FINAL") {
      const dC = Math.hypot(X[0] - C[0], X[1] - C[1]);
      if (dC > HAC_R * 1.02) {
        const phi = angOf([X[0] - C[0], X[1] - C[1]]), beta = Math.acos(clamp(HAC_R / dC, -1, 1));
        // tangent whose travel direction (around C in direction s) points away from X
        let best = null;
        for (const a of [phi + beta, phi - beta]) {
          const T = [C[0] + HAC_R * Math.cos(a), C[1] + HAC_R * Math.sin(a)];
          const vdir = s > 0 ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)];
          const toT = [T[0] - X[0], T[1] - X[1]], n = Math.hypot(toT[0], toT[1]) || 1;
          const sc = (toT[0] * vdir[0] + toT[1] * vdir[1]) / n; if (!best || sc > best.sc) best = { a, sc };
        }
        arcStart = best.a;
      } else arcStart = angOf([X[0] - C[0], X[1] - C[1]]);
      const aEnd = angOf([0, -s]);
      let da = s > 0 ? aEnd - arcStart : arcStart - aEnd; while (da < 0) da += 2 * Math.PI;
      const nArc = Math.max(2, Math.round(da * HAC_R / 500));
      for (let i = 0; i <= nArc; i++) { const a = arcStart + s * da * i / nArc; pts.push([C[0] + HAC_R * Math.cos(a), C[1] + HAC_R * Math.sin(a)]); }
    }
    const x0 = pts.length ? FAP_X : Math.min(rw.x, FAP_X);
    for (let x = x0; x < RWY.length; x += x < 0 ? 400 : 800) pts.push([x, 0]);
    pts.push([RWY.length, 0]);
    // heights: before the FAP, descend linearly over the remaining ground distance toward the OGS
    // height at the FAP; from the FAP on, the final-approach profile
    const cum = [Math.hypot(pts[0][0] - X[0], pts[0][1] - X[1])];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const onFinal = (i) => Math.abs(pts[i][1]) < 1 && pts[i][0] >= FAP_X - 1;
    let iFAP = pts.findIndex((_, i) => onFinal(i)); if (iFAP < 0) iFAP = 0;
    const dAll = Math.max(1, cum[iFAP]), hFAP = FINAL.href(FAP_X);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      // never draw the pre-final path above the orbiter: a glider cannot climb back up to it
      const h = onFinal(i) ? FINAL.href(pts[i][0]) : (rw.h > hFAP ? rw.h + (hFAP - rw.h) * clamp(cum[i] / dAll, 0, 1) : rw.h * (1 - 0.3 * clamp(cum[i] / dAll, 0, 1)));
      out.push([pts[i][0], pts[i][1], Math.max(0, h)]);
    }
    return out;
  }

  function beginApproach(st) {
    const d = derive(st);
    st.approachMode = true; st.flight.alphaAssist = false;
    st.flight.theta = d.flightPathRad + st.flight.alpha * Math.cos(st.flight.sigma);
    st.flight.gammaHold = d.flightPathRad; st.flight.lastGamma = undefined;
    st._appr = { mode: "ACQ", side: toRunway(st, st.r).y >= 0 ? 1 : -1 };
  }
  // Touchdown evaluation from the actual contact geometry.
  function touchdownCheck(st) {
    const gearDown = st.flight.gear >= 1;
    const contactPt = gearDown ? V.mainGear : V.belly;
    const hMain = pointAlt(st, contactPt), hTail = pointAlt(st, V.tail), hNose = pointAlt(st, V.noseGear);
    if (hMain > 0 && hTail > 0 && hNose > 0) return null;
    const d = derive(st), rw = toRunway(st, st.r);
    const vR = eciVecToRwy(st, airVel(st.r, st.v));
    const sink = -vR[2], gs = Math.hypot(vR[0], vR[1]);
    const theta = Math.asin(clamp(dot(qrot(st.q, [0, 0, 1]), unit(st.r)), -1, 1));
    const bank = st.flight.sigma, psi = Math.atan2(vR[1], vR[0]);
    const onRunway = rw.x >= 0 && rw.x <= RWY.length && Math.abs(rw.y) <= RWY.width / 2 - 4;
    const res = { x: rw.x, y: rw.y, sink, gs, theta, bank, psi, gearDown, ok: false, reason: null };
    if (!onRunway) res.reason = rw.x < 0 ? `Touched down ${(-rw.x).toFixed(0)} m short of the runway threshold (sink ${sink.toFixed(1)} m/s)` :
      rw.x > RWY.length ? `Touched down beyond the runway end (+${(rw.x - RWY.length).toFixed(0)} m)` :
      `Touched down off the runway edge (${Math.abs(rw.y).toFixed(0)} m from centreline)`;
    else if (!gearDown) res.reason = `Belly landing: landing gear not down and locked (${(st.flight.gear * 100).toFixed(0)}%)`;
    else if (hTail <= 0 && hMain > 0.05) res.reason = `Tail strike: pitch ${(theta / DEG).toFixed(1)}° exceeded the ~15° tail clearance`;
    else if (sink > 3.0) res.reason = `Touchdown sink rate ${sink.toFixed(1)} m/s exceeded the 3.0 m/s limit — flare earlier`;
    else if (gs > 120) res.reason = `Touchdown groundspeed ${gs.toFixed(0)} m/s exceeded the 120 m/s tyre limit`;
    else if (Math.abs(bank) > 6 * DEG) res.reason = `Touchdown bank ${(Math.abs(bank) / DEG).toFixed(1)}° exceeded the 6° limit`;
    else if (hNose <= 0 && hMain > 0.05) res.reason = `Nose gear touched first (pitch ${(theta / DEG).toFixed(1)}°)`;
    else res.ok = true;
    if (res.ok) {
      st.regime = "ground";
      st.ground = { x: rw.x, y: rw.y, V: gs, psi, theta: Math.max(0, theta), noseDown: false, thetaRate: 0 };
    }
    return res;
  }

  const api = {
    MU, RE, OMEGA_E, G0, DEG, ATMO_TOP, EI_ALT, TAEM_V, TAEM_RANGE, V, SITES, RWY, SPRING_DV,
    releasePayload, approachGuidance, approachPath, beginApproach, touchdownCheck, HAC_R, FAP_X, AIM_X,
    vec: { add, sub, scl, dot, cross, norm, unit, addS, clamp, lerp, wrapPi },
    quat: { qmul, qconj, qrot, qnorm, qFromAxes, qFromNoseUp, qAxes, qAngle, qIntegrate, qToward },
    gmst, ecefToEci, eciToEcef, llhToEcef, ecefToLL, enuBasis, airVel, earthRateVel, greatCircle,
    toRunway, fromRunway, rwyVecToEci, eciVecToRwy, atmosphere, aeroCoeffs, alphaSchedule,
    attitudeFromAero, aeroFromAttitude, elements, keplerPropagate, timeToRadius, timeToApoapsis,
    createState, clone, vehicleMass, derive, step, ignite, enterAtmo, lvlh, orbitRateBody, pointAlt,
    predictEntry, solveBank, planDeorbit, findOpportunity, rk4, gravity, aeroAccel, srbProfile,
  };
  root.ShuttleSim = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
