/*
 * deploy_core.js — DOM-free simulation of a CubeSat deployment from the ISS (JAXA J-SSOD on Kibo).
 *
 * Follows the published J-SSOD procedure (JAXA, "JEM Small Satellite Orbital Deployer"; NanoRacks
 * NRCSD mission flow, which uses the same Kibo airlock + robotic arm):
 *   1. The crew installs the satellite install case in the J-SSOD, mounts the J-SSOD on the
 *      Multi-Purpose Experiment Platform (MPEP) and the MPEP on the JEM airlock slide table.
 *   2. The JEM airlock is depressurised (air recovered by the depress pump, the rest vented),
 *      leak-checked, the outer hatch opened and the slide table extended outboard.
 *   3. The JEM Remote Manipulator System (JEMRMS) grapples the MPEP and moves it to the release point.
 *   4. The deployer is pointed nadir-aft 45° (away from the ISS travel direction, toward the Earth).
 *   5. After a GO from every console the deploy command is sent; an internal spring releases the
 *      CubeSat at 0.77–1.7 m/s depending on its mass, with a small tip-off rotation.
 *   6. The CubeSat stays silent for 30 minutes (CubeSat Design Specification inhibit), then deploys
 *      its antennas and starts beaconing.
 *
 * Relative motion is the linearised Clohessy–Wiltshire model about the ISS's circular orbit, plus the
 * differential drag that makes a CubeSat (ballistic coefficient <= 120 kg/m^2) sink faster than the ISS.
 * The deployment is checked against the ISS Approach Ellipsoid (4 x 2 x 2 km) and a line-of-fire test
 * against the ISS model's structure. Times inside the airlock procedure are compressed and labelled.
 *
 * Frames: "model" = the team's ISS GLB in metres: +X port (orbit normal), +Y zenith, +Z velocity
 * (= ISS body +X forward, -Y... in LVLH flight). LVLH/CW: radial = +Y, along-track = +Z, cross-track = +X.
 */
(function (root) {
  "use strict";
  const C = root.CoverageCore || (typeof require === "function" ? require("./coverage_core.js") : null);
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, TWO_PI = 2 * Math.PI;
  const MU = C.MU, RE = C.R_SPHERE;
  const posMod = (a, m) => ((a % m) + m) % m;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const fin = (x) => typeof x === "number" && isFinite(x);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => Math.sqrt(dot(a, a));
  const unit = (a) => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const smooth = (k) => k * k * (3 - 2 * k);

  // ------------------------------------------------------------------ published / assumed numbers
  const P = {
    iss: { altKm: 415, incDeg: 51.64 },                        // ISS operating orbit (approx. 2026)
    plan: { azDeg: 180, elDeg: -45, tolDeg: 5 },               // J-SSOD release: nadir-aft 45°, ISS body frame
    sat: { name: "3U CubeSat", massKg: 4.0, areaM2: 0.06 },    // 3U at the J-SSOD limit of 1.33 kg per U; mean tumbling drag area incl. wings
    issDrag: { massKg: 420000, areaM2: 1800 },                 // mean drag area (approx.)
    cd: 2.2, rho: 3.0e-12,                                     // kg/m^3 near 410 km, moderate solar activity
    railM: 0.40,                                               // spring push length in the install case
    tipoffDegS: 5,                                             // NRCSD: tip-off <= 5 deg/s/axis
    nominalTipoffDegS: 0.1,                                   // nominal release, deg/s per axis, below the published limit
    inhibitS: 1800,                                            // CDS: no RF / deployables for 30 min after release
    uplinkS: 2.0,                                              // ground command latency (Tsukuba -> TDRS -> ISS)
    ae: { along: 2000, radial: 1000, cross: 1000 },            // ISS Approach Ellipsoid semi-axes (m)
    kos: 200,                                                  // ISS Keep-Out Sphere radius (m)
    box: { radial: 2000, along: 25000, cross: 25000 },         // ISS conjunction screening box ("pizza box", ±2 km radial, ±25 km)
    horizonDays: 14,
    airlock: { volM3: 2.0, pumpK: 0.0058, pumpFloorKPa: 2.0, ventK: 0.04, leakKPaS: 0.0004, leakCheckS: 120, leakMaxKPa: 0.10, hatchMaxKPa: 0.5, ventWarnKPa: 10 },
    los: [[100, 112], [250, 265]],                             // Ku-band loss-of-signal bands in argument of latitude (deg) — simplified TDRS zones of exclusion
  };
  // J-SSOD spring: 1.7 m/s at 1.33 kg (1U), lower for heavier satellites, within the published 0.77–1.7 m/s
  const releaseSpeed = (m) => clamp(1.7 * Math.sqrt(1.33 / m), 0.77, 1.7);
  const KG_PER_KPA = (P.airlock.volM3 * 1000 * 0.02897) / (8.314 * 295);   // air mass per kPa in the airlock

  // ------------------------------------------------------------------ geometry (model frame, metres)
  // Kibo PM port endcone is at x = 13.5 (from the GLB); the JEM airlock sits above the EF interface,
  // the JEMRMS shoulder next to it. Booms 4.07 m each (GLB), wrist + end effector 1.5 m.
  const G = {
    shoulder: [13.2, 1.6, 17.6], L1: 4.07, L2: 4.07, Lw: 1.5,
    hatch: [13.5, 0.9, 15.0],
    tableIn: [12.7, 0.9, 15.0], tableOut: [14.6, 0.9, 15.0],   // MPEP centre on the slide table
    fixtureLocal: [0, 0.40, 0],                                // grapple fixture above the MPEP centre (payload frame)
    exitLocal: [0.30, 0.17, 0],                                // J-SSOD door (payload frame); deploy axis = payload +X
    deployFixture: [16.8, 0.4, 13.2],                          // fixture position at the release point
    eeStartOffset: [0.22, 1.10, -0.15], eeStartRollDeg: 7,
    grapple: { lat: 0.035, depth: 0.10, rollDeg: 3, speed: 0.02 },
  };
  const OBST = [
    ["Pirs DC",-2.5,-4.7,-22.0,1.7,0.1,-18.0],
    ["Poisk MRM-2",-1.7,1.4,-22.0,2.5,6.2,-18.0],
    ["panel_01_p.001",2.2,0.7,-25.9,3.6,0.7,-22.2],
    ["panel_01_s.001",-3.6,0.7,-25.9,-2.2,0.7,-22.2],
    ["panel_02_p.001",3.5,0.7,-25.9,5.1,0.7,-22.2],
    ["panel_02_s.001",-5.1,0.7,-25.9,-3.5,0.7,-22.2],
    ["panel_03_p.001",5.0,0.7,-25.9,6.6,0.7,-22.2],
    ["panel_03_s.001",-6.6,0.7,-25.9,-5.0,0.7,-22.2],
    ["panel_04_p.001",6.6,0.7,-25.9,8.1,0.7,-22.2],
    ["panel_04_s.001",-8.1,0.7,-25.9,-6.6,0.7,-22.2],
    ["panel_05_p",8.1,0.7,-25.9,9.6,0.7,-22.2],
    ["panel_05_s",-9.6,0.7,-25.9,-8.1,0.7,-22.2],
    ["panel_06_p",9.6,0.7,-26.1,11.2,0.7,-22.0],
    ["panel_06_s",-11.2,0.7,-26.1,-9.6,0.7,-22.0],
    ["panel_07_p",11.2,0.7,-26.1,12.8,0.7,-22.0],
    ["panel_07_s",-12.8,0.7,-26.1,-11.2,0.7,-22.0],
    ["panel_08_p",12.8,0.7,-26.1,14.4,0.7,-22.0],
    ["panel_08_s",-14.4,0.7,-26.1,-12.8,0.7,-22.0],
    ["panel_09_p",14.3,0.6,-26.1,16.4,0.9,-22.0],
    ["panel_09_s",-16.4,0.6,-26.1,-14.3,0.9,-22.0],
    ["panel_bracket_p",1.5,0.7,-24.3,2.3,0.7,-23.8],
    ["panel_bracket_s",-2.3,0.7,-24.3,-1.5,0.7,-23.8],
    ["Zvezda (SM) Service Module",-2.6,-1.8,-33.2,2.3,5.7,-18.5],
    ["Rassvet (MRM-1) Mini Researc",-2.0,-6.9,-9.6,2.4,0.1,-4.4],
    ["Zarya - (FGB) Funtional Carg",-2.1,-2.9,-19.0,2.1,4.4,-5.6],
    ["(PMA) Pressurized Mating Ada",-1.3,-1.4,-6.0,1.3,2.4,-3.4],
    ["Z1 Truss",-2.6,1.8,-2.2,5.4,10.4,2.5],
    ["(ESP) External Stowage Platf",2.2,-1.0,2.9,3.3,0.0,5.5],
    ["DEXTRE.003",-13.2,19.0,11.2,-12.3,20.2,12.1],
    ["DEXTRE.002",-14.3,18.0,11.1,-11.3,19.9,13.7],
    ["DEXTRE.009",-8.5,16.2,11.4,-8.0,17.1,11.8],
    ["DEXTRE.008",-8.7,17.1,11.4,-8.0,17.4,11.7],
    ["DEXTRE.007",-9.9,17.1,11.7,-8.4,17.5,12.0],
    ["DEXTRE.006",-10.9,17.1,11.7,-9.4,17.5,12.5],
    ["DEXTRE.005",-11.2,17.1,11.6,-10.5,17.8,12.0],
    ["DEXTRE.004",-11.5,17.0,11.2,-10.9,17.5,12.0],
    ["DEXTRE.015",-17.5,16.2,11.4,-17.1,17.1,11.8],
    ["DEXTRE.014",-17.6,17.1,11.4,-16.9,17.4,11.7],
    ["DEXTRE.013",-17.1,17.1,11.7,-15.7,17.5,12.0],
    ["DEXTRE.012",-16.2,17.1,11.7,-14.7,17.5,12.5],
    ["DEXTRE.011",-15.0,17.1,11.6,-14.3,17.8,12.0],
    ["DEXTRE.010",-14.6,17.0,11.2,-14.1,17.5,12.0],
    ["DEXTRE.001",-14.3,16.0,11.0,-11.3,18.0,11.8],
    ["DEXTRE",-13.2,15.6,11.1,-12.4,16.0,12.0],
    ["Canadarm2_08",-13.2,14.6,11.2,-12.3,15.8,12.1],
    ["Canadarm2_07",-13.1,14.1,11.3,-12.5,14.6,11.8],
    ["Canadarm2_06",-12.5,14.0,11.2,-12.0,14.6,11.8],
    ["Canadarm2_05",-12.5,6.7,10.7,-11.7,14.6,11.6],
    ["Canadarm2_04",-12.5,6.5,9.7,-4.6,7.3,10.7],
    ["Canadarm2_03",-5.2,6.6,9.5,-4.5,7.3,10.1],
    ["Canadarm2_02",-5.5,6.1,9.4,-4.7,6.8,10.1],
    ["Canadarm2",-5.2,5.6,8.3,-4.0,6.7,9.7],
    ["(MBS) Mobile Base System",-6.2,3.7,6.5,0.5,8.0,9.6],
    ["S1 Truss_02",-17.3,-1.0,-20.3,-13.0,11.0,4.7],
    ["S4 Truss_01",-40.6,-29.0,5.8,-28.5,4.0,25.6],
    ["S4 Truss_02",-40.6,5.3,-15.5,-28.5,38.4,4.2],
    ["S6 Truss_01",-56.0,-29.1,5.8,-43.9,4.0,25.6],
    ["S6 Truss_02",-56.0,5.3,-15.5,-43.9,38.4,4.2],
    ["S6 Truss",-50.3,-4.9,-9.3,-36.5,7.2,8.9],
    ["S5 Truss",-36.7,1.0,2.0,-33.2,7.3,8.4],
    ["S4 Truss",-42.4,-4.5,-9.3,-25.8,7.7,8.2],
    ["(ESP) External Stowage Platf",-26.7,-0.6,2.1,-24.3,2.9,7.5],
    ["Express Logistics Carrier (E",-27.5,7.1,2.1,-24.0,12.8,7.5],
    ["Express Logistics Carrier (E",-23.0,-2.7,2.1,-20.8,2.9,7.5],
    ["Alpha Magnetic Spectrometer ",-23.1,7.0,2.4,-20.4,10.2,6.7],
    ["S3 Truss",-26.7,2.3,3.0,-21.0,7.7,6.6],
    ["Enhanced ISS Boom Assembly (",-18.9,6.8,5.6,-2.9,7.5,6.3],
    ["S1 Truss",-21.0,2.4,4.7,-6.6,7.6,6.6],
    ["P1 Truss_02",13.2,-1.0,-20.3,17.5,11.0,4.7],
    ["P6 Truss_01",43.9,-29.0,4.2,56.0,4.0,24.0],
    ["P6 Truss_02",43.9,6.7,-14.8,56.0,39.8,5.0],
    ["P6 Truss",36.5,-3.8,-9.7,50.3,9.1,7.8],
    ["P4 Truss_01",28.5,-29.0,4.2,40.6,4.0,24.0],
    ["P4 Truss_02",28.5,6.7,-14.8,40.6,39.8,5.0],
    ["P5 Truss",33.2,2.7,1.1,36.7,9.0,7.6],
    ["P4 Truss",25.8,-3.8,-9.7,42.4,7.9,7.8],
    ["Express Logistics Carrier (E",23.0,-2.8,2.0,26.7,2.9,7.5],
    ["Express Logistics Carrier (E",24.2,7.1,2.0,27.6,12.8,7.5],
    ["P3 Truss",21.0,2.3,3.0,26.7,7.7,6.6],
    ["P1 Truss",6.6,2.4,4.7,21.0,7.6,6.6],
    ["S0 Truss",-6.8,0.9,2.9,6.8,7.6,12.3],
    ["(PMA) Pressurized Mating Ada",-1.3,-1.7,18.4,1.3,1.5,21.0],
    ["RapidScat_dish",-11.2,-2.8,15.7,-10.6,-2.1,16.4],
    ["RapidScat",-11.4,-2.3,15.6,-10.0,-0.8,16.8],
    ["Columbus Space Laboratory",-11.2,-2.5,13.6,-2.1,3.4,18.9],
    ["Kibo Space Laboratory (PSM) ",7.7,2.1,13.6,12.9,6.0,18.5],
    ["Kibo Space Laboratory Expose",13.5,-4.0,13.4,21.0,-0.6,21.1],
    ["CATS",17.6,-2.5,13.4,18.4,-1.1,15.3],
    ["Kibo Space Laboratory (PSM) ",2.1,-2.6,13.3,13.5,2.7,19.1],
    ["Harmony Node 2",-2.4,-2.4,11.4,2.4,2.4,18.7],
    ["Destiny_Window_Cover",-0.4,-2.3,7.0,0.4,-2.3,7.8],
    ["Destiny Space Laboratory",-3.5,-3.1,2.2,2.6,3.2,11.6],
    ["ESP External Stowage Platfor",-8.1,-1.9,2.4,-2.9,-0.0,5.9],
    ["Quest Airlock",-8.0,-3.5,-2.9,-2.2,3.1,2.6],
    ["(PMA) Pressurized Mating Ada",9.2,-1.7,-1.3,11.9,1.5,1.3],
    ["Cupola.001",7.6,-3.6,-0.4,8.3,-3.0,0.4],
    ["Cupola.002",7.1,-3.6,0.4,7.9,-3.0,1.1],
    ["Cupola.003",6.2,-3.6,0.4,7.0,-3.0,1.1],
    ["Cupola.004",5.8,-3.6,-0.4,6.5,-3.0,0.4],
    ["Cupola.005",6.2,-3.6,-1.1,7.0,-3.0,-0.4],
    ["Cupola.006",7.1,-3.6,-1.1,7.9,-3.0,-0.4],
    ["Cupola.007",6.4,-3.8,-0.5,7.5,-3.6,0.5],
    ["ISS",6.5,-3.0,-0.7,7.6,-2.3,0.7],
    ["Cupola",5.8,-3.8,-1.5,8.4,-2.2,1.3],
    ["Tranquility Node 3",2.2,-2.4,-2.4,9.5,2.4,2.4],
    ["Leonardo_Raffaello Perm Mult",-2.5,-8.7,-2.6,2.4,-2.2,2.6],
    ["Unity Node 1",-2.3,-2.3,-3.7,2.3,2.3,2.4],
    ["panel_01_p",1.6,-0.3,-12.6,2.2,1.7,-11.0],
    ["hinge_02_p",2.1,0.6,-12.6,3.0,0.8,-9.6],
    ["panel_03_p",2.9,-1.2,-12.6,4.0,2.6,-9.6],
    ["hinge_04_p",3.9,0.6,-12.6,4.3,0.8,-11.0],
    ["hinge_01_p",1.7,0.6,-11.1,2.2,0.8,-9.6],
    ["panel_02_p",2.1,-1.2,-12.6,3.0,2.6,-9.6],
    ["hinge_03_p",2.9,0.6,-12.6,3.9,0.8,-9.6],
    ["panel_04_p",3.9,-1.2,-12.6,4.7,2.6,-9.6],
    ["panel_01_s",-2.2,-0.3,-12.6,-1.6,1.7,-11.0],
    ["hinge_02_s",-3.0,0.6,-12.6,-2.1,0.8,-9.6],
    ["panel_03_s",-4.0,-1.2,-12.6,-2.9,2.6,-9.6],
    ["hinge_04_s",-4.3,0.6,-12.6,-3.9,0.8,-11.0],
    ["hinge_03_s",-3.9,0.6,-12.6,-2.9,0.8,-9.6],
    ["panel_04_s",-4.7,-1.2,-12.6,-3.9,2.6,-9.6],
    ["panel_02_s",-3.0,-1.2,-12.6,-2.1,2.6,-9.6],
    ["hinge_01_s",-2.2,0.6,-11.1,-1.7,0.8,-9.6],
    ["OCO3",15.3,-2.6,19.0,16.0,-1.4,20.9],
    ["ECOStress",18.9,-2.5,15.7,20.9,-1.3,16.5]
  ];

  // ------------------------------------------------------------------ orbit of the ISS
  function issOrbit(st) {
    const o = st.iss, a = RE + o.altKm * 1000, n = Math.sqrt(MU / (a * a * a));
    return { a, n, v: Math.sqrt(MU / a), inc: o.incDeg * D2R, Omega: o.nodeLonDeg * D2R + C.gmstFromUtcMs(st.epochMs), u0: o.phaseDeg * D2R, T: TWO_PI / n };
  }
  const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; };
  /** ISS ECI state and LVLH basis at sim time t: r̂ (zenith), v̂ (velocity), ĥ (orbit normal = model +X). */
  function frame(st, t) {
    const O = issOrbit(st), u = O.u0 + O.n * t, cu = Math.cos(u), su = Math.sin(u), ci = Math.cos(O.inc), si = Math.sin(O.inc);
    const rh = rotZ([cu, su * ci, su * si], O.Omega), vh = rotZ([-su, cu * ci, cu * si], O.Omega), hh = cross(rh, vh);
    const ms = st.epochMs + t * 1000;
    return { r: scl(rh, O.a), v: scl(vh, O.v), rh, vh, hh, u: posMod(u, TWO_PI), n: O.n, a: O.a, T: O.T, theta: C.gmstFromUtcMs(ms), sun: C.sunDirEci(ms), utcMs: ms };
  }
  const modelToEci = (f, p) => add(add(scl(f.hh, p[0]), scl(f.rh, p[1])), scl(f.vh, p[2]));
  const eciToModel = (f, e) => [dot(e, f.hh), dot(e, f.rh), dot(e, f.vh)];
  const inLos = (u) => { const d = posMod(u * R2D, 360); return P.los.some(([a, b]) => d >= a && d < b); };
  /** Seconds until the Ku-band state changes (AOS<->LOS) after time t. */
  function commChangeIn(st, t) {
    const f = frame(st, t), d = f.u * R2D, now = inLos(f.u), degPerS = f.n * R2D;
    const edges = P.los.flat().map((e) => posMod(e - d, 360)).filter((x) => x > 1e-6).sort((a, b) => a - b);
    return { los: now, inS: edges.length ? edges[0] / degPerS : Infinity };
  }

  // ------------------------------------------------------------------ pointing / payload pose
  const axisOf = (azDeg, elDeg) => { const a = azDeg * D2R, e = elDeg * D2R; return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]; };
  // payload rotation (3x3, rows) = Ry(az - 90°) · Rz(el): payload +X -> axis(az, el)
  function payloadRot(azDeg, elDeg) {
    const f = (azDeg - 90) * D2R, e = elDeg * D2R, cf = Math.cos(f), sf = Math.sin(f), ce = Math.cos(e), se = Math.sin(e);
    const Rz = [[ce, -se, 0], [se, ce, 0], [0, 0, 1]], Ry = [[cf, 0, sf], [0, 1, 0], [-sf, 0, cf]];
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) M[i][j] += Ry[i][k] * Rz[k][j];
    return M;
  }
  const mulM = (M, v) => [M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2], M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2], M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]];
  const angleDeg = (a, b) => Math.acos(clamp(dot(unit(a), unit(b)), -1, 1)) * R2D;

  /** Two-link IK for the JEMRMS booms (elbow bent away from Kibo, toward zenith/outboard). */
  function armIK(wrist) {
    const S = G.shoulder, d = sub(wrist, S), L = norm(d), reach = G.L1 + G.L2;
    const dist = Math.min(L, reach - 1e-3), dir = unit(d);
    const a = (G.L1 * G.L1 - G.L2 * G.L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, G.L1 * G.L1 - a * a));
    let bend = sub([0.3, 1, 0.1], scl(dir, dot([0.3, 1, 0.1], dir))); if (norm(bend) < 1e-6) bend = [1, 0, 0]; bend = unit(bend);
    const elbow = add(add(S, scl(dir, a)), scl(bend, h));
    return { shoulder: S, elbow, wrist: L > reach ? add(S, scl(dir, reach)) : wrist, overreach: L > reach };
  }

  /** Everything the view needs to draw the arm, MPEP, deployer and CubeSat for state st. */
  function pose(st) {
    const ar = st.arm, out = { table: st.al.table };
    let R = payloadRot(90, 0), mpep, fixture;
    const tableCentre = lerp3(G.tableIn, G.tableOut, st.al.table);
    const fixOnTable = add(tableCentre, G.fixtureLocal);
    if (st.phase === "grapple" && !ar.grappled || ["brief", "load", "depress", "outboard"].includes(st.phase)) {
      mpep = tableCentre; fixture = fixOnTable;
      const ee = add(fixOnTable, ar.d);
      out.ee = ee; out.eeRollDeg = ar.rollDeg; out.eeDir = [0, -1, 0];
      out.arm = armIK(add(ee, [0, G.Lw, 0]));
      if (["brief", "load", "depress", "outboard"].includes(st.phase)) out.arm = armIK(add(add(fixOnTable, G.eeStartOffset), [0, G.Lw, 0]));
    } else {
      let fx;
      if (st.phase === "grapple" || st.phase === "move" && ar.move <= 0) fx = fixOnTable;
      else if (st.phase === "move") {
        const k = smooth(clamp(ar.move, 0, 1));
        const lift = add(fixOnTable, [0.6, 0.5, 0]);        // unberth: up and outboard off the table first
        fx = k < 0.2 ? lerp3(fixOnTable, lift, k / 0.2) : lerp3(lift, G.deployFixture, (k - 0.2) / 0.8);
        fx = add(fx, [0, Math.sin(Math.PI * clamp((k - 0.2) / 0.8, 0, 1)) * 1.2, 0]);
      } else fx = G.deployFixture;
      R = payloadRot(ar.az, ar.el);
      fixture = fx; mpep = sub(fx, mulM(R, G.fixtureLocal));
      const up = mulM(R, [0, 1, 0]);
      out.ee = fx; out.eeDir = scl(up, -1); out.eeRollDeg = 0;
      out.arm = armIK(add(fx, scl(up, G.Lw)));
    }
    out.R = R; out.mpep = mpep; out.fixture = fixture;
    out.axis = mulM(R, [1, 0, 0]); out.exit = add(mpep, mulM(R, G.exitLocal));
    // CubeSat: inside the case until released, then on its relative trajectory
    if (st.sat.released) { out.sat = st.sat.p.slice(); out.satRot = st.sat.rot.slice(); }
    else if (st.phase === "release") { out.sat = add(out.exit, scl(out.axis, st.sat.rail - P.railM)); out.satRot = [0, 0, 0]; }
    else { out.sat = add(out.exit, scl(out.axis, -P.railM)); out.satRot = [0, 0, 0]; }
    out.door = st.sat.door;
    return out;
  }

  // ------------------------------------------------------------------ relative motion (CW + differential drag)
  function dragAccel() {
    const v = Math.sqrt(MU / (RE + P.iss.altKm * 1000));
    return 0.5 * P.rho * v * v * P.cd * (P.sat.areaM2 / P.sat.massKg - P.issDrag.areaM2 / P.issDrag.massKg);   // > 0: CubeSat decelerates more
  }
  // state s = [X, Y, Z, vX, vY, vZ] in the model frame (X cross-track, Y radial, Z along-track)
  function cwDeriv(s, n, ad) {
    return [s[3], s[4], s[5], -n * n * s[0], 3 * n * n * s[1] + 2 * n * s[5], -2 * n * s[4] - ad];
  }
  function cwStep(s, dt, n, ad) {
    const k1 = cwDeriv(s, n, ad), s2 = s.map((x, i) => x + k1[i] * dt / 2), k2 = cwDeriv(s2, n, ad), s3 = s.map((x, i) => x + k2[i] * dt / 2), k3 = cwDeriv(s3, n, ad), s4 = s.map((x, i) => x + k3[i] * dt), k4 = cwDeriv(s4, n, ad);
    return s.map((x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  const aeValue = (p) => (p[0] / P.ae.cross) ** 2 + (p[1] / P.ae.radial) ** 2 + (p[2] / P.ae.along) ** 2;

  /** Predict the relative trajectory for a release along `axis` from `exit`.
   *  Near term: the ISS Approach Ellipsoid (4 x 2 x 2 km) must be left and never re-entered.
   *  Long term (14 days, with differential drag): the CubeSat must not come back into the ISS conjunction
   *  screening box (±2 km radial, ±25 km along/cross-track) once it has left it. */
  function predict(exit, axis, speed, opts) {
    opts = opts || {};
    const n = Math.sqrt(MU / Math.pow(RE + P.iss.altKm * 1000, 3)), T = TWO_PI / n, ad = opts.noDrag ? 0 : dragAccel();
    let s = [exit[0], exit[1], exit[2], axis[0] * speed, axis[1] * speed, axis[2] * speed], t = 0;
    const H = (opts.horizonDays || P.horizonDays) * 86400, plotN = 3 * T, B = P.box;
    const inBox = (p) => Math.abs(p[1]) < B.radial && Math.abs(p[2]) < B.along && Math.abs(p[0]) < B.cross;
    let exitT = null, reentryT = null, boxExitT = null, boxReT = null, minAfter = Infinity, minAfterT = null;
    const plot = [];
    let at24 = null;
    while (t < H) {
      const dt = t < plotN ? 10 : 60;
      s = cwStep(s, dt, n, ad); t += dt;
      const p = [s[0], s[1], s[2]], inAe = aeValue(p) < 1, d = norm(p);
      if (t <= plotN && Math.round(t) % 30 === 0) plot.push([+s[2].toFixed(1), +s[1].toFixed(1), +s[0].toFixed(1)]);
      if (exitT === null) { if (!inAe) exitT = t; }
      else {
        if (d < minAfter) { minAfter = d; minAfterT = t; }
        if (inAe && reentryT === null) reentryT = t;
      }
      const ib = inBox(p);
      if (boxExitT === null) { if (Math.abs(p[2]) > B.along || Math.abs(p[0]) > B.cross) boxExitT = t; }   // left the box along-track
      else if (ib && boxReT === null) boxReT = t;
      if (at24 === null && t >= 86400) at24 = { alongKm: s[2] / 1000, radialKm: s[1] / 1000 };
      if (reentryT !== null && !opts.full && t > reentryT + T) break;
      if (boxReT !== null && !opts.full) break;
    }
    const safe = exitT !== null && reentryT === null && boxReT === null;
    let q = [exit[0], exit[1], exit[2], axis[0] * speed, axis[1] * speed, axis[2] * speed];
    for (let x = 0; x < P.inhibitS; x += 5) q = cwStep(q, 5, n, ad);
    return { safe, exitT, reentryT, boxExitT, boxReT, minAfter: isFinite(minAfter) ? minAfter : null, minAfterT, at24, plot, T, at30min: { along: q[2], radial: q[1], cross: q[0] },
             neverLeaves: exitT === null, retro: axis[2] < -0.05 };
  }

  /** Ray from the deployer door along the axis vs the ISS structure (AABBs from the team's GLB, padded). */
  function lineOfFire(exit, axis, maxDist) {
    maxDist = maxDist || 250; let hit = null;
    for (const b of OBST) {
      const mn = [b[1] - 0.15, b[2] - 0.15, b[3] - 0.15], mx = [b[4] + 0.15, b[5] + 0.15, b[6] + 0.15];
      let t0 = 0.05, t1 = maxDist, okHit = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(axis[k]) < 1e-9) { if (exit[k] < mn[k] || exit[k] > mx[k]) { okHit = false; break; } continue; }
        let a = (mn[k] - exit[k]) / axis[k], c = (mx[k] - exit[k]) / axis[k]; if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) { okHit = false; break; }
      }
      if (okHit && (!hit || t0 < hit.dist)) hit = { name: b[0], dist: t0 };
    }
    return { clear: !hit, hit };
  }

  function assess(st) {
    const ps = pose(Object.assign({}, st, { phase: "point" }));
    const speed = releaseSpeed(P.sat.massKg);
    const pr = predict(ps.exit, ps.axis, speed);
    const lof = lineOfFire(ps.exit, ps.axis);
    const errDeg = angleDeg(ps.axis, axisOf(P.plan.azDeg, P.plan.elDeg));
    let verdict;
    if (!lof.clear) verdict = `Blocked · ${lof.hit.name} · ${lof.hit.dist.toFixed(1)} m`;
    else if (pr.neverLeaves) verdict = "Trapped in ISS approach zone";
    else if (pr.reentryT !== null) verdict = `ISS approach-zone return · ${fmtT(pr.reentryT)}`;
    else if (pr.boxReT !== null) verdict = `ISS screening-zone return · ${fmtT(pr.boxReT)}`;
    else verdict = `Clear · ${P.horizonDays} days`;
    return { errDeg, inTol: errDeg <= P.plan.tolDeg, lof, pr, speed, safe: lof.clear && pr.safe, verdict, az: st.arm.az, el: st.arm.el };
  }
  function fmtT(s) {
    if (!fin(s)) return "—";
    if (s < 3600) return `${Math.round(s / 60)} min`;
    if (s < 2 * 86400) return `${(s / 3600).toFixed(1)} h`;
    return `${(s / 86400).toFixed(1)} days`;
  }

  // ------------------------------------------------------------------ simulation
  const PHASES = ["brief", "load", "depress", "outboard", "grapple", "move", "point", "release", "drift", "done"];
  const ROLES = ["rms", "crew", "flight"];
  const ROLE_NAME = { rms: "JEMRMS (JAXA Tsukuba)", crew: "Kibo crew", flight: "Flight director" };
  const LOAD_STEPS = [
    { id: "case", label: "Install CubeSat case", s: 30 },
    { id: "inhibit", label: "Check latch + power inhibits", s: 15 },
    { id: "mpep", label: "Mount deployer on MPEP", s: 25 },
    { id: "table", label: "Mount on table + connect power", s: 30 },
    { id: "hatch", label: "Latch inner hatch", s: 15 },
  ];
  const WARPS = [1, 10, 60];
  const WARP_PHASES = { brief: 1, load: 60, depress: 60, outboard: 10, grapple: 1, move: 10, point: 1, release: 1, drift: 60, done: 1 };

  function choosePhase(epochMs, alt, inc, nodeLon) {
    // Start in sunlight, a little before local noon, outside the Ku-band LOS bands (nice camera views)
    const st = { epochMs, iss: { altKm: alt, incDeg: inc, nodeLonDeg: nodeLon, phaseDeg: 0 } };
    let best = 0, bestV = -2;
    for (let u = 0; u < 360; u += 2) {
      st.iss.phaseDeg = u; const f = frame(st, 0); const v = dot(f.rh, f.sun);
      if (v > bestV) { bestV = v; best = u; }
    }
    let u = posMod(best - 40, 360);
    for (let k = 0; k < 40 && inLos(u * D2R); k++) u = posMod(u - 3, 360);
    return u;
  }

  function create(opts) {
    opts = opts || {};
    const epochMs = Math.floor((opts.epochMs || Date.now()) / 60000) * 60000;
    const nodeLon = fin(opts.nodeLonDeg) ? opts.nodeLonDeg : -60;
    let seed = (opts.seed >>> 0) || 20261115;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const st = {
      v: 1, phase: "brief", t: 0, warp: 1, epochMs, rev: 0,
      iss: { altKm: P.iss.altKm, incDeg: P.iss.incDeg, nodeLonDeg: nodeLon, phaseDeg: 0 },
      load: { step: 0, busy: null },
      al: { p: 101.3, pump: false, vent: false, leak: null, leakOk: false, outer: 0, outerCmd: false, table: 0, tableCmd: false, ventedKg: 0, ventWarned: false, innerLatched: false },
      arm: { d: G.eeStartOffset.slice(), vel: [0, 0, 0], rollDeg: G.eeStartRollDeg, rollRate: 0, grappled: false, attempts: 0, contacts: 0, move: 0, moving: false,
             az: 90, el: 0, azRate: 0, elRate: 0, brakes: false },
      input: { x: 0, y: 0, z: 0, r: 0, fine: false },
      poll: { rms: false, crew: false, flight: false }, camera: false, armed: false, uplink: null,
      sat: { released: false, rail: 0, door: 0, relT: null, p: [0, 0, 0], v: [0, 0, 0], rot: [0, 0, 0], w: [0, 0, 0], antennas: false, speed: releaseSpeed(P.sat.massKg) },
      assessRev: 0, assess: null, log: [], violations: [], done: null, handoff: null,
      startedAt: null,
    };
    st.iss.phaseDeg = choosePhase(epochMs, st.iss.altKm, st.iss.incDeg, nodeLon);
    const tip = () => (rnd() * 2 - 1) * P.nominalTipoffDegS;
    st.sat.w = [tip(), tip(), tip()];
    const sim = { st, P, G };
    const ev = [];
    const log = (who, msg, kind) => { const e = { t: st.t, who, msg, kind: kind || "info" }; st.log.push(e); if (st.log.length > 40) st.log.shift(); ev.push({ type: "log", ...e }); };
    const setPhase = (ph) => {
      st.phase = ph; st.rev++;
      const cap = WARP_PHASES[ph] || 1; if (st.warp > cap) st.warp = cap;
      ev.push({ type: "phase", phase: ph });
    };
    const reassess = () => { st.assess = assess(st); st.assessRev++; st._assessAt = st.t; st._assessKey = `${st.arm.az.toFixed(2)}|${st.arm.el.toFixed(2)}`; };
    const resetPoll = (why) => { if (st.poll.rms || st.poll.crew || st.poll.flight || st.armed) { st.poll = { rms: false, crew: false, flight: false }; st.armed = false; log("flight", `Poll reset — ${why}`, "warn"); } };

    sim.command = function (role, cmd, arg) {
      ev.length = 0;
      const ok = (m) => ({ accepted: true, msg: m || null, events: ev.slice() });
      const no = (m) => ({ accepted: false, reason: m, events: ev.slice() });
      const need = (r) => role === r || role === "all";
      const ph = st.phase;
      switch (cmd) {
        case "BEGIN":
          if (ph !== "brief") return no("Already started");
          st.startedAt = st.t; setPhase("load"); log("flight", "GO · load CubeSat");
          return ok();
        case "WARP": {
          const w = +arg, cap = WARP_PHASES[ph] || 1;
          if (!WARPS.includes(w) && !(sim.testHooks && w > 0 && w <= 2000)) return no("Unknown time-warp");
          if (w > cap && !sim.testHooks) return no(`Warp limit · ×${cap}`);
          if (st.uplink) return no("Wait for the deploy command to arrive");
          st.warp = w; return ok();
        }
        case "STEP": {
          if (!need("crew")) return no("The Kibo crew does the loading");
          if (ph !== "load") return no("Loading is finished");
          if (st.load.busy) return no("Finish the current step first");
          const s = LOAD_STEPS[st.load.step]; st.load.busy = { step: st.load.step, until: st.t + s.s };
          log("crew", `${s.label}…`); return ok();
        }
        case "PUMP": case "VENT": {
          if (!need("crew")) return no("The Kibo crew runs the airlock");
          if (ph !== "depress" && !(ph === "outboard" && st.al.outer === 0)) return no("The airlock is not being depressurised now");
          const on = arg === undefined ? !(cmd === "PUMP" ? st.al.pump : st.al.vent) : !!arg;
          if (cmd === "PUMP") {
            if (on && st.al.vent) return no("Close vent first");
            st.al.pump = on; log("crew", on ? "Pump ON · recovering air" : `Pump OFF · ${st.al.p.toFixed(1)} kPa`);
          } else {
            if (on && st.al.pump) return no("Stop pump first");
            st.al.vent = on;
            if (on && st.al.p > P.airlock.ventWarnKPa) log("crew", `Air wasted · vent at ${st.al.p.toFixed(0)} kPa`, "warn");
            else log("crew", on ? `Vent OPEN · ${st.al.p.toFixed(1)} kPa` : `Vent CLOSED · ${st.al.p.toFixed(2)} kPa`);
          }
          if (st.al.leak) { st.al.leak = null; log("crew", "Leak check interrupted", "warn"); }
          return ok();
        }
        case "LEAK_CHECK": {
          if (!need("crew")) return no("The Kibo crew runs the airlock");
          if (ph !== "depress") return no("Not now");
          if (st.al.pump || st.al.vent) return no("Stop pump + close vent first");
          if (st.al.p > 0.5) return no(`Pressure ${st.al.p.toFixed(2)} kPa — vent to below 0.5 kPa first`);
          st.al.leak = { t0: st.t, p0: st.al.p }; log("crew", `Leak check · hold ${P.airlock.leakCheckS} s`); return ok();
        }
        case "OUTER_HATCH": {
          if (!need("crew")) return no("The Kibo crew runs the airlock");
          if (ph !== "depress") return no("Not now");
          if (!st.al.leakOk) return no("Complete a leak check first");
          if (st.al.p > P.airlock.hatchMaxKPa) return no(`Pressure ${st.al.p.toFixed(2)} kPa — the outer hatch opens below ${P.airlock.hatchMaxKPa} kPa`);
          st.al.outerCmd = true; setPhase("outboard"); log("crew", "Outer hatch opening");
          if ((st.al.ventedHighKg || 0) > 0.05) st.violations.push(`Vented ${st.al.ventedHighKg.toFixed(1)} kg of air above ${P.airlock.ventWarnKPa} kPa — the depress pump recovers that air into the cabin`);
          return ok();
        }
        case "TABLE": {
          if (!need("crew")) return no("The Kibo crew drives the slide table");
          if (ph !== "outboard") return no("Not now");
          if (st.al.outer < 1) return no("Wait for the outer hatch to open fully");
          st.al.tableCmd = true; log("crew", "Slide table extending outboard"); return ok();
        }
        case "GRAPPLE": {
          if (!need("rms")) return no("The JEMRMS operator grapples");
          if (ph !== "grapple" || st.arm.grappled) return no("Not now");
          st.arm.attempts++;
          const a = st.arm, g = G.grapple, lat = Math.hypot(a.d[0], a.d[2]), sp = norm(a.vel), why = [];
          if (a.d[1] > g.depth) why.push(`${((a.d[1] - g.depth) * 100).toFixed(0)} cm too high — move in`);
          if (Math.abs(a.d[0]) > g.lat || Math.abs(a.d[2]) > g.lat) why.push(`off-centre by ${(lat * 100).toFixed(1)} cm (≤ ${(g.lat * 100).toFixed(1)})`);
          if (Math.abs(a.rollDeg) > g.rollDeg) why.push(`roll ${a.rollDeg.toFixed(1)}° (≤ ${g.rollDeg}°)`);
          if (sp > g.speed) why.push(`still moving ${(sp * 100).toFixed(1)} cm/s (≤ ${(g.speed * 100).toFixed(0)})`);
          if (why.length) { log("rms", `Grapple missed · ${why.join(", ")}`, "warn"); return no("Missed · " + why.join(", ")); }
          a.grappled = true; a.vel = [0, 0, 0]; a.d = [0, 0, 0]; a.rollDeg = 0;
          setPhase("move"); log("rms", `Grapple locked · attempt ${a.attempts}`, "good"); return ok();
        }
        case "MOVE": {
          if (!need("rms")) return no("The JEMRMS operator moves the arm");
          if (ph !== "move" || st.arm.moving) return no("Not now");
          st.arm.moving = true; log("rms", "Moving to release point"); return ok();
        }
        case "BRAKES": {
          if (!need("rms")) return no("Only the JEMRMS operator");
          if (ph !== "point") return no("Not now");
          const on = arg === undefined ? !st.arm.brakes : !!arg;
          if (on && (Math.abs(st.arm.azRate) > 0.05 || Math.abs(st.arm.elRate) > 0.05)) return no("Stop the arm before applying the brakes");
          st.arm.brakes = on; if (!on) resetPoll("JEMRMS brakes released");
          log("rms", on ? "JEMRMS joint brakes ON" : "JEMRMS brakes OFF"); reassess(); return ok();
        }
        case "CAMERA": {
          if (!need("crew")) return no("The Kibo crew sets up the camera");
          if (ph !== "point") return no("Not now");
          st.camera = !st.camera; log("crew", st.camera ? "Kibo camera recording" : "Camera stowed"); if (!st.camera) resetPoll("camera stowed"); return ok();
        }
        case "GO": {
          if (ph !== "point") return no("The GO/NO-GO poll happens at the release point");
          const r = arg; if (!ROLES.includes(r)) return no("Unknown console");
          if (!need(r)) return no(`${ROLE_NAME[r]} reports for that console`);
          if (!st.assess || st._assessKey !== `${st.arm.az.toFixed(2)}|${st.arm.el.toFixed(2)}`) reassess();
          const A = st.assess;
          if (r === "rms") {
            if (!st.arm.brakes) return no("Apply JEMRMS brakes first");
            if (!A.inTol) return no(`Point aft/down 45° · error ${A.errDeg.toFixed(1)}° (max ${P.plan.tolDeg}°)`);
          }
          if (r === "crew") {
            if (!st.camera) return no("Start Kibo camera first");
          }
          if (r === "flight") {
            if (!st.poll.rms || !st.poll.crew) return no("Wait for JEMRMS + crew GO");
            if (!A.safe) return no(`Flight: ${A.verdict} — NO-GO`);
            if (inLos(frame(st, st.t).u)) return no("KU LOS · wait for AOS");
          }
          st.poll[r] = true; log(r, `${ROLE_NAME[r]}: GO`, "good"); return ok();
        }
        case "ARM": {
          if (!need("flight")) return no("The flight director arms the deployer");
          if (ph !== "point") return no("Not now");
          if (!(st.poll.rms && st.poll.crew && st.poll.flight)) return no("All three consoles must be GO");
          st.armed = !st.armed; log("flight", st.armed ? "J-SSOD ARMED" : "J-SSOD safed"); if (st.armed && st.warp > 1) st.warp = 1; return ok();
        }
        case "DEPLOY": {
          if (!need("flight")) return no("The flight director sends the deploy command");
          if (ph !== "point") return no("Not now");
          if (!st.armed) return no("Arm the deployer first");
          if (st.uplink) return no("Command already on its way");
          st.uplink = { sent: st.t, arrive: st.t + P.uplinkS }; st.warp = 1;
          log("flight", "DEPLOY sent · TDRS uplink"); return ok();
        }
        case "HANDOFF": {
          if (ph !== "done") return no("The CubeSat is not beaconing yet");
          st.handoff = handoffOrbit(st); return ok();
        }
        default: return no("Unknown command");
      }
    };

    sim.setInput = function (inp) {
      inp = inp || {};
      const c = (x) => (fin(x) ? clamp(x, -1, 1) : 0);
      st.input = { x: c(inp.x), y: c(inp.y), z: c(inp.z), r: c(inp.r), fine: !!inp.fine };
    };

    function stepFixed(dt) {
      st.t += dt;
      const al = st.al, ar = st.arm, inp = st.input;
      // loading
      if (st.phase === "load" && st.load.busy && st.t >= st.load.busy.until) {
        const s = LOAD_STEPS[st.load.busy.step]; st.load.busy = null; st.load.step++;
        log("crew", `✓ ${s.label}`, "good");
        if (s.id === "hatch") al.innerLatched = true;
        if (st.load.step >= LOAD_STEPS.length) { setPhase("depress"); log("crew", "Airlock sealed · start pump"); }
      }
      // airlock pressure
      if (["depress", "outboard"].includes(st.phase)) {
        const A = P.airlock, p0 = al.p;
        if (al.outer > 0) al.p = 0;
        else {
          if (al.pump) al.p = A.pumpFloorKPa + (al.p - A.pumpFloorKPa) * Math.exp(-A.pumpK * dt);
          if (al.vent) { al.p = al.p * Math.exp(-A.ventK * dt); al.ventedKg += (p0 - al.p) * KG_PER_KPA; if (p0 > A.ventWarnKPa) al.ventedHighKg = (al.ventedHighKg || 0) + (p0 - Math.max(al.p, A.ventWarnKPa)) * KG_PER_KPA; }
          if (!al.vent && !al.pump) al.p += A.leakKPaS * dt;
          if (al.pump && al.p < A.pumpFloorKPa + 0.2 && !al._floorMsg) { al._floorMsg = true; log("crew", `${al.p.toFixed(1)} kPa · stop pump → open vent`); }
          if (al.leak && st.t - al.leak.t0 >= A.leakCheckS) {
            const rise = al.p - al.leak.p0;
            if (rise <= A.leakMaxKPa) { al.leakOk = true; log("crew", `Leak check PASS · +${rise.toFixed(3)} kPa · open hatch`, "good"); }
            else log("crew", `Leak check FAILED: +${rise.toFixed(3)} kPa`, "warn");
            al.leak = null;
          }
        }
        if (al.outerCmd && al.outer < 1) { al.outer = Math.min(1, al.outer + dt / 20); if (al.outer >= 1) log("crew", "Outer hatch open. Slide table ready."); }
        if (al.tableCmd && al.table < 1) {
          al.table = Math.min(1, al.table + dt / 40);
          if (al.table >= 1) { setPhase("grapple"); log("crew", "Table extended"); log("rms", "Align EE camera → grapple"); }
        }
      }
      // grapple: rate-commanded end effector in the EE camera axes (right = -X, up = +Z, in = -Y)
      if (st.phase === "grapple" && !ar.grappled) {
        const v = inp.fine ? 0.01 : 0.05, cmd = [-inp.x * v, -inp.y * v, inp.z * v], k = 1 - Math.exp(-dt / 0.4);
        for (let i = 0; i < 3; i++) ar.vel[i] += (cmd[i] - ar.vel[i]) * k;
        ar.rollRate += ((inp.r * (inp.fine ? 0.5 : 2)) - ar.rollRate) * k;
        ar.d = add(ar.d, scl(ar.vel, dt)); ar.rollDeg += ar.rollRate * dt;
        ar.d[0] = clamp(ar.d[0], -1, 1); ar.d[2] = clamp(ar.d[2], -1, 1); ar.d[1] = Math.min(2, ar.d[1]);
        if (ar.d[1] < 0) { ar.d[1] = 0.005; if (ar.vel[1] < -0.005) { ar.contacts++; log("rms", `CONTACT with the grapple fixture at ${(-ar.vel[1] * 100).toFixed(1)} cm/s — back off and approach slower`, "warn"); } ar.vel[1] = Math.max(0, ar.vel[1]); }
      }
      if (st.phase === "move" && ar.moving) {
        ar.move = Math.min(1, ar.move + dt / 90);
        if (ar.move >= 1) { ar.moving = false; setPhase("point"); reassess(); log("rms", "At release point · slew aft/down 45°"); }
      }
      if (st.phase === "point") {
        if (!ar.brakes) {
          const rate = inp.fine ? 0.5 : 3, k = 1 - Math.exp(-dt / 0.5);
          ar.azRate += (-inp.x * rate - ar.azRate) * k; ar.elRate += (inp.z * rate - ar.elRate) * k;
          const az0 = ar.az, el0 = ar.el;
          ar.az = posMod(ar.az + ar.azRate * dt, 360); ar.el = clamp(ar.el + ar.elRate * dt, -85, 85);
          if (Math.abs(ar.az - az0) > 1e-9 || Math.abs(ar.el - el0) > 1e-9) { if (st.poll.rms || st.poll.flight) resetPoll("deployer attitude changed"); }
        } else { ar.azRate = 0; ar.elRate = 0; }
        const key = `${ar.az.toFixed(2)}|${ar.el.toFixed(2)}`;
        if (key !== st._assessKey && st.t - (st._assessAt || 0) > 0.25) reassess();
        if (st.uplink && st.t >= st.uplink.arrive) {
          const f = frame(st, st.t); st.uplink = null;
          if (inLos(f.u)) { log("flight", "Deploy command NOT received — Ku/S-band LOS. Re-send at AOS.", "warn"); }
          else if (!(st.armed && st.poll.rms && st.poll.crew && st.poll.flight)) log("flight", "Deploy command rejected — deployer not armed", "warn");
          else {
            reassess();
            st.done = { errDeg: st.assess.errDeg, safe: st.assess.safe, verdict: st.assess.verdict, az: ar.az, el: ar.el, attempts: ar.attempts, contacts: ar.contacts, ventedKg: al.ventedKg, releaseT: st.t, prediction: { at24: st.assess.pr.at24, at30min: st.assess.pr.at30min } };
            setPhase("release"); st.sat.door = 0; st.sat.rail = 0; log("flight", "Command received — J-SSOD door open, spring release!", "good");
          }
        }
      }
      if (st.phase === "release") {
        const s = st.sat; s.door = Math.min(1, s.door + dt / 0.6);
        if (s.door >= 1) {
          const a = (s.speed * s.speed) / (2 * P.railM); s._tr = (s._tr || 0) + dt;
          s.rail = Math.min(P.railM, 0.5 * a * s._tr * s._tr);
          if (s.rail >= P.railM) {
            const ps = pose(st); s.released = true; s.relT = st.t; s.p = ps.exit.slice(); s.v = scl(ps.axis, s.speed);
            st.done.exit = ps.exit.slice(); st.done.axis = ps.axis.slice();
            setPhase("drift"); log("rms", `Separation confirmed: ${s.speed.toFixed(2)} m/s, tip-off ${norm(s.w).toFixed(1)}°/s. CubeSat is free-flying.`, "good");
            log("flight", "30-min inhibit · radio + antennas locked");
          }
        }
      }
      if (st.sat.released) {
        const s = st.sat, n = issOrbit(st).n, ad = dragAccel();
        const x = cwStep([...s.p, ...s.v], dt, n, ad); s.p = x.slice(0, 3); s.v = x.slice(3);
        s.rot = s.rot.map((r, i) => r + s.w[i] * dt);
        const since = st.t - s.relT;
        if (!s.antennas && since >= P.inhibitS) {
          s.antennas = true; setPhase("done");
          const d = norm(s.p);
          log("crew", `First beacon · antennas out · ISS ${(d / 1000).toFixed(2)} km`, "good");
          st.done.at30 = { dist: d, along: s.p[2], radial: s.p[1], cross: s.p[0] };
        }
      }
    }

    sim.advance = function (dtWall) {
      ev.length = 0;
      let left = Math.max(0, Math.min(dtWall, 0.5)) * st.warp;
      if (st.phase === "brief" || st.phase === "done" && st.handoff) return [];
      // fixed substeps: 0.05 s in fine-control phases, 0.5 s otherwise
      const fineMax = ["grapple", "point", "release"].includes(st.phase) ? 0.05 : 0.5;
      let guard = 0;
      while (left > 1e-9 && guard++ < 5000) { const h = Math.min(fineMax, left); stepFixed(h); left -= h; }
      return ev.slice();
    };

    sim.snapshot = function (withAssess) {
      const s = JSON.parse(JSON.stringify({
        v: st.v, phase: st.phase, t: st.t, warp: st.warp, epochMs: st.epochMs, rev: st.rev, iss: st.iss, load: st.load, al: st.al,
        arm: st.arm, input: st.input, poll: st.poll, camera: st.camera, armed: st.armed, uplink: st.uplink, sat: st.sat,
        assessRev: st.assessRev, log: st.log, violations: st.violations, done: st.done, handoff: st.handoff,
      }));
      if (withAssess) s.assess = st.assess;
      return s;
    };
    sim.testHooks = !!opts.testHooks;
    return sim;
  }

  /** Convert ISS-relative position and velocity to an Earth-centred inertial state (SI). */
  function inertialState(st, t, p, vRel) {
    const f = frame(st, t);
    const r = add(f.r, modelToEci(f, p));
    // inertial velocity of a point moving in the rotating LVLH frame: v_iss + v_rel + ω × p (ω = n ĥ)
    const v = add(add(f.v, modelToEci(f, vRel)), cross(scl(f.hh, f.n), modelToEci(f, p)));
    return { r, v };
  }

  /** Circular sandbox orbit for the coverage mission, from the CubeSat's state at release. */
  function handoffOrbit(st) {
    const relT = st.sat.relT;
    const { r, v } = inertialState(st, relT, st.done.exit, scl(st.done.axis, st.sat.speed));
    const h = cross(r, v), hn = norm(h), inc = Math.acos(clamp(h[2] / hn, -1, 1));
    const Omega = Math.atan2(h[0], -h[1]);
    const rn = norm(r), en = (dot(v, v) / 2) - MU / rn, a = -MU / (2 * en);
    const nodeVec = [Math.cos(Omega), Math.sin(Omega), 0];
    const w = cross(unit(h), nodeVec);
    const u = Math.atan2(dot(r, w), dot(r, nodeVec));
    const nc = Math.sqrt(MU / (a * a * a));
    const handMs = st.epochMs + (relT + P.inhibitS) * 1000;
    const epochMs = Math.ceil(handMs / 60000) * 60000;
    const uE = u + nc * ((epochMs - (st.epochMs + relT * 1000)) / 1000);
    let nodeLon = (Omega - C.gmstFromUtcMs(epochMs)) * R2D; nodeLon = posMod(nodeLon + 180, 360) - 180;
    const eVec = sub(scl(cross(v, h), 1 / MU), unit(r));
    return {
      altKm: +((a - RE) / 1000).toFixed(3), incDeg: +(inc * R2D).toFixed(4), nodeLonDeg: +nodeLon.toFixed(4), phaseDeg: +posMod(uE * R2D, 360).toFixed(4) % 360,
      epochUtc: C.isoUtc(epochMs), eccentricity: norm(eVec), issAltKm: st.iss.altKm, releaseUtc: C.isoUtc(st.epochMs + relT * 1000),
    };
  }

  const api = { P, G, OBST, PHASES, ROLES, ROLE_NAME, LOAD_STEPS, WARPS, WARP_PHASES, KG_PER_KPA,
    create, frame, modelToEci, eciToModel, inertialState, inLos, commChangeIn, axisOf, payloadRot, pose, armIK, predict, lineOfFire, assess, handoffOrbit, releaseSpeed, dragAccel, cwStep, aeValue, fmtT };
  root.DeployCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
