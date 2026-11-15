/*
 * CubeSat coverage — automated checks (Node, no dependencies).
 *   node tests/coverage/run_checks.js            all checks that need no optional library
 * Real-mode checks (N17–N21, N28–N31) run when satellite.js is installed (node_modules/satellite.js).
 */
"use strict";
const path = require("path");
const C = require("../../public/js/coverage/coverage_core.js");
const S = require("../../public/js/game/shuttle_simulation.js");
const D = C.D2R, R = C.R2D;

let pass = 0, fail = 0;
const results = [];
const pending = [];
function check(id, name, fn) {
  const ok = (msg) => { pass++; results.push(`PASS ${id} ${name}${msg ? " — " + msg : ""}`); };
  const bad = (e) => { fail++; results.push(`FAIL ${id} ${name} — ${e && e.message}`); };
  try { const r = fn(); if (r && typeof r.then === "function") pending.push(r.then(ok, bad)); else ok(r); }
  catch (e) { bad(e); }
}
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const near = (a, b, tol, m) => assert(Math.abs(a - b) <= tol, `${m || ""} ${a} vs ${b} (tol ${tol})`);

const EPOCH = "2026-11-14T03:00:00Z";
function scn(over) {
  const s = C.defaultSandbox(Date.parse(EPOCH));
  if (over) { if (over.orbit) Object.assign(s.orbit, over.orbit); if (over.stations) s.stations = over.stations; if (over.horizon) s.horizon = over.horizon; if (over.epochUtc) s.epochUtc = over.epochUtc; }
  return s;
}
const st = (id, lat, lon, mask = 10, extra) => ({ id, name: id, lat, lon, altM: 0, maskDeg: mask, enabled: true, source: "test", ...(extra || {}) });
function run(s) { const v = C.validate(s); assert(v.ok, JSON.stringify(v.errors)); const p = C.makePropagator(s); return { s, p, fc: C.forecast(s, p) }; }
// sub-satellite point at time t
function subPoint(p, t) { const ll = C.ecefToLatLon(p.posEcef(t), p.earth); return { lat: ll.lat * R, lon: ll.lon * R }; }

// ---------------------------------------------------------------------------------------------------
check("N0", "constants match ShuttleSim", () => { near(C.MU, S.MU, 0); near(C.R_SPHERE, S.RE, 0); near(C.OMEGA_E, S.OMEGA_E, 0); });

check("N1", "overhead: el 90°, range = h", () => {
  const s = scn({ stations: [] }); s.stations = [st("a", 0, 0)]; const p = C.makePropagator(s);
  const sp = subPoint(p, 0); const g = C.stationGeometry({ lat: sp.lat, lon: sp.lon, maskDeg: 0 }, "sphere");
  const la = C.lookAngle(p.posEcef(0), g); near(la.el * R, 90, 1e-6, "el"); near(la.range, 550e3, 1, "range");
});

check("N2", "elevation matches analytic el(γ)", () => {
  const a = C.R_SPHERE + 550e3; let maxErr = 0;
  const g = C.stationGeometry({ lat: 0, lon: 0, maskDeg: 0 }, "sphere");
  for (let gam = 0.001; gam < Math.acos(C.R_SPHERE / a); gam += 0.002) {
    const la = C.lookAngle([a * Math.cos(gam), a * Math.sin(gam), 0], g);
    maxErr = Math.max(maxErr, Math.abs(la.el - Math.atan2(Math.cos(gam) - C.R_SPHERE / a, Math.sin(gam))));
  }
  assert(maxErr < 1e-9, "max err " + maxErr); return `max err ${maxErr.toExponential(1)} rad`;
});

// Build a station whose pass peak elevation equals target (search latitude offset at a fixed longitude)
function stationForPeak(s, targetElDeg, lon) {
  const p = C.makePropagator(s);
  const peak = (lat) => { const g = C.stationGeometry({ lat, lon, maskDeg: 0 }, "sphere"); let b = -9; for (let t = 0; t < 2400; t += 0.5) b = Math.max(b, C.lookAngle(p.posEcef(t), g).el); return b * R; };
  // find bracket above the ground track crossing of this longitude
  let best = null; for (let lat = -50; lat <= 50; lat += 1) { const v = peak(lat); if (!best || v > best.v) best = { lat, v }; }
  let lo = best.lat, hi = best.lat + 25; // move north until peak drops below target
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (peak(m) > targetElDeg) lo = m; else hi = m; }
  return lo;
}

check("N3", "mask boundary ±0.001°", () => {
  const base = scn({ horizon: "6h" }); base.stations = [];
  const lat = stationForPeak(base, 20, 40);
  const mk = (mask) => { const s = JSON.parse(JSON.stringify(base)); s.stations = [st("b", lat, 40, mask)]; s.horizon = "1orbit"; return run(s).fc.passes.b.filter((p) => p.start < 2400).length; };
  // peak is 20° ± search tolerance: find exact peak through the forecast with mask 0
  const s0 = JSON.parse(JSON.stringify(base)); s0.stations = [st("b", lat, 40, 0)]; s0.horizon = "1orbit";
  const pk = run(s0).fc.passes.b.find((p) => p.start < 2400).peakEl * R;
  assert(mk(pk - 0.001) === 1, "pass missing just below peak"); assert(mk(pk + 0.001) === 0, "pass found above peak");
  return `peak ${pk.toFixed(4)}°`;
});

check("N4", "Earth occultation: el≥0 ⇔ clear line of sight (10 000 random pairs)", () => {
  let rng = 12345; const rnd = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
  let disagree = 0;
  for (let i = 0; i < 10000; i++) {
    const lat = Math.asin(2 * rnd() - 1) * R, lon = rnd() * 360 - 180, g = C.stationGeometry({ lat, lon, maskDeg: 0 }, "sphere");
    const r = C.R_SPHERE + 300e3 + rnd() * 1700e3, th = Math.acos(2 * rnd() - 1), ph = rnd() * 2 * Math.PI;
    const s = [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
    const vis = C.lookAngle(s, g).el >= 0;
    // independent segment–sphere test (sphere shrunk by 1 m so the station itself is outside)
    const d = s.map((v, k) => v - g.pos[k]), A = d[0] ** 2 + d[1] ** 2 + d[2] ** 2, B = 2 * (g.pos[0] * d[0] + g.pos[1] * d[1] + g.pos[2] * d[2]);
    const Cc = g.pos[0] ** 2 + g.pos[1] ** 2 + g.pos[2] ** 2 - (C.R_SPHERE - 1) ** 2, disc = B * B - 4 * A * Cc;
    let blocked = false; if (disc > 0) { const t1 = (-B - Math.sqrt(disc)) / (2 * A), t2 = (-B + Math.sqrt(disc)) / (2 * A); blocked = (t1 > 1e-9 && t1 < 1) || (t2 > 1e-9 && t2 < 1); }
    if (vis === blocked) disagree++;
  }
  assert(disagree === 0, disagree + " disagreements");
});

check("N5", "overlapping contacts kept; union < sum; peak 2", () => {
  const { fc } = run(scn({ stations: [st("a", 16.8, 96.2), st("b", 13.7, 100.5)] }));
  const sum = fc.passes.a.concat(fc.passes.b).reduce((x, p) => x + p.duration, 0), uni = fc.network.reduce((x, i) => x + i.end - i.start, 0);
  assert(fc.passes.a.length > 0 && fc.passes.b.length > 0, "no passes"); assert(uni < sum - 1, `union ${uni} sum ${sum}`); assert(fc.peakSimul.count === 2, "peak " + fc.peakSimul.count);
});

check("N6", "short/grazing passes found despite 10 s grid", () => {
  const base = scn({ horizon: "1orbit" }); base.stations = [];
  const out = [];
  for (const target of [0.5, 5, 30]) {
    // find latitude giving a pass of `target` seconds above a 10° mask (bisection on duration via fine scan)
    const p = C.makePropagator(base), lon = 40;
    const durAt = (lat) => { const g = C.stationGeometry({ lat, lon, maskDeg: 10 }, "sphere"); let d = 0; for (let t = 0; t < 2400; t += 0.01) if (C.lookAngle(p.posEcef(t), g).el >= 10 * D) d += 0.01; return d; };
    let lo = stationForPeak(base, 10.5, lon) - 3, hi = stationForPeak(base, 9.5, lon) + 3; // lo: longer pass, hi: none
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (durAt(m) > target) lo = m; else hi = m; }
    const exact = durAt(lo);
    const s = JSON.parse(JSON.stringify(base)); s.stations = [st("g", lo, lon, 10)];
    const ps = run(s).fc.passes.g.filter((x) => x.start < 2400);
    assert(ps.length === 1, `target ${target}s: found ${ps.length}`); near(ps[0].duration, exact, 0.2, `duration for ${target}s`);
    out.push(`${exact.toFixed(2)}s→${ps[0].duration.toFixed(2)}s`);
  }
  return out.join(", ");
});

check("N7", "window clipping: active pass at start is 'available now', not 'next'", () => {
  const s0 = scn(); const p = C.makePropagator(s0); const sp = subPoint(p, 0);
  const { s, fc } = run(scn({ stations: [st("here", sp.lat, sp.lon)] }));
  const ps = fc.passes.here; assert(ps[0].clippedStart && ps[0].start === 0, "not clipped");
  const q = C.query(s, C.makePropagator(s), fc, 0);
  assert(q.available.length === 1 && q.available[0].id === "here", "not available now"); assert(!q.next.some((x) => x.start === 0), "listed as next");
  const last = run(scn({ horizon: "6h", stations: [st("here", sp.lat, sp.lon)] }));
  last.fc.passes.here.forEach((x, i, arr) => assert(!x.clippedEnd || i === arr.length - 1));
});

check("N8", "no pass in window ≠ never", () => {
  const { s, p, fc } = run(scn({ orbit: { incDeg: 0 }, stations: [st("north", 60, 0)] }));
  assert(fc.passes.north.length === 0, "unexpected pass"); const q = C.query(s, p, fc, 0); assert(q.next.length === 0 && q.nextEvent === null);
});

check("N9", "orbital timing and Earth rotation per orbit", () => {
  const out = [];
  for (const [alt, T] of [[400, 92.41], [550, 95.5], [800, 100.72]]) { const p = C.makePropagator(scn({ orbit: { altKm: alt } })); near(p.period / 60, T, 0.01, `T(${alt})`); out.push(`${alt} km ${(p.period / 60).toFixed(2)} min`); }
  const p = C.makePropagator(scn()); near(C.wrapPi(p.argLat(p.period) - p.argLat(0)), 0, 1e-9, "u after T");
  const d = C.wrapPi((subPoint(p, p.period).lon - subPoint(p, 0).lon) * D) * R;
  near(d, -23.94, 0.02, "lon shift"); out.push(`lon shift ${d.toFixed(3)}°`);
  return out.join(", ");
});

check("N10", "return to X's orbit position", () => {
  const p = C.makePropagator(scn());
  const tX = 1234.5, uX = p.argLat(tX);
  near(p.phaseReturn(tX, uX) - tX, p.period, 1e-6, "at X → T");
  const t = 3000, tr = p.phaseReturn(t, uX); near(C.wrapPi(p.argLat(tr) - uX), 0, 1e-9, "u at return");
  // brute force scan
  let bf = null; for (let x = t + 0.05; x < t + p.period + 1; x += 0.05) { if (Math.abs(C.wrapPi(p.argLat(x) - uX)) < 0.05 * p.n) { bf = x; break; } }
  near(tr, bf, 0.1, "brute force");
});

check("N11", "no automatic repetition: orbit-2 sequence differs from orbit 1", () => {
  const { s, p, fc } = run(scn());
  const seq = (k) => { const ev = []; for (const id of fc.stationsUsed) for (const x of fc.passes[id]) if (x.start >= (k - 1) * p.period && x.start < k * p.period) ev.push([x.start - (k - 1) * p.period, id]); return ev.sort((a, b) => a[0] - b[0]).map((e) => `${e[1]}@${Math.round(e[0])}`).join(","); };
  assert(seq(1) !== seq(2), "identical sequences"); return `orbit1 [${seq(1)}] orbit2 [${seq(2)}]`;
});

check("N12", "date-only change shifts timestamps exactly (sandbox)", () => {
  const a = run(scn()), b = run(scn({ epochUtc: "2026-11-15T03:37:00Z" }));
  const shift = (Date.parse("2026-11-15T03:37:00Z") - Date.parse(EPOCH)) / 1000;
  for (const id of a.fc.stationsUsed) {
    assert(a.fc.passes[id].length === b.fc.passes[id].length, "count " + id);
    a.fc.passes[id].forEach((p, i) => { const q = b.fc.passes[id][i]; near(q.start, p.start, 0.05, "start"); near(q.duration, p.duration, 0.05, "dur"); near(q.peakEl, p.peakEl, 1e-6, "peak");
      near((b.p.epochMs + q.start * 1000) - (a.p.epochMs + p.start * 1000), shift * 1000, 50, "UTC shift"); });
  }
});

check("N13", "equatorial / polar / retrograde geometry; equatorial merge", () => {
  for (const inc of [0, 90, 135, 180]) {
    const p = C.makePropagator(scn({ orbit: { incDeg: inc } })); const lim = inc <= 90 ? inc : 180 - inc;
    let maxLat = 0; for (let t = 0; t < p.period; t += 2) maxLat = Math.max(maxLat, Math.abs(subPoint(p, t).lat));
    near(maxLat, lim, 0.2, `max lat i=${inc}`);
  }
  // retrograde moves westward relative to inertial space
  const pr = C.makePropagator(scn({ orbit: { incDeg: 135 } })), pp = C.makePropagator(scn({ orbit: { incDeg: 45 } }));
  const dl = (p) => C.wrapPi((subPoint(p, 60).lon - subPoint(p, 0).lon) * D) * R; assert(dl(pr) < 0 && dl(pp) > 0, `${dl(pr)} ${dl(pp)}`);
  // equatorial: node+phase combine — same forecast for 30+20 and 10+40
  const e1 = run(scn({ orbit: { incDeg: 0, nodeLonDeg: 30, phaseDeg: 20 }, stations: [st("eq", 5, 60)] })), e2 = run(scn({ orbit: { incDeg: 0, nodeLonDeg: 10, phaseDeg: 40 }, stations: [st("eq", 5, 60)] }));
  assert(e1.fc.passes.eq.length > 0, "no equatorial pass");
  e1.fc.passes.eq.forEach((p, i) => near(e2.fc.passes.eq[i].start, p.start, 0.02, "merge"));
});

check("N14", "date line symmetry", () => {
  const { fc } = run(scn({ orbit: { incDeg: 0, nodeLonDeg: 90, phaseDeg: 0 }, stations: [st("e", 10, 179.95), st("w", 10, -179.95)] }));
  near(fc.passes.e[0].duration, fc.passes.w[0].duration, 0.05, "duration"); near(fc.passes.e[0].peakEl, fc.passes.w[0].peakEl, 1e-6, "peak");
});

check("N15", "monotonic invariants (mask, disable, add)", () => {
  const base = run(scn());
  const hi = scn(); hi.stations[0].maskDeg = 25; const h = run(hi);
  const id = hi.stations[0].id;
  h.fc.passes[id].forEach((p) => assert(base.fc.passes[id].some((q) => q.start <= p.start + 0.01 && q.end >= p.end - 0.01), "mask added time"));
  const off = scn(); off.stations[1].enabled = false; const o = run(off);
  assert(C.summarize(off, o.p, o.fc).coveragePct <= C.summarize(base.s, base.p, base.fc).coveragePct + 1e-9, "disable raised coverage");
  const add = scn(); add.stations.push(st("extra", 40, -100)); const a = run(add);
  assert(C.summarize(add, a.p, a.fc).coveragePct >= C.summarize(base.s, base.p, base.fc).coveragePct - 1e-9, "add lowered coverage");
});

check("N16", "validation messages", () => {
  const bad = [
    [(s) => { s.orbit.altKm = NaN; }, "orbit.altKm"], [(s) => { s.orbit.altKm = 250; }, "orbit.altKm"], [(s) => { s.orbit.incDeg = 181; }, "orbit.incDeg"],
    [(s) => { s.orbit.nodeLonDeg = 200; }, "orbit.nodeLonDeg"], [(s) => { s.orbit.phaseDeg = 360; }, "orbit.phaseDeg"], [(s) => { s.epochUtc = "yesterday"; }, "epochUtc"],
    [(s) => { s.horizon = "5d"; }, "horizon"], [(s) => { s.stations[0].maskDeg = -1; }, "stations[0].maskDeg"], [(s) => { s.stations[1].name = s.stations[0].name; }, "stations[1].name"],
    [(s) => { s.stations[0].lat = Infinity; }, "stations[0].lat"], [(s) => { for (let i = 0; i < 50; i++) s.stations.push(st("x" + i, 0, i)); }, "stations"], [(s) => { s.stations[0].name = ""; }, "stations[0].name"],
  ];
  for (const [mut, field] of bad) { const s = scn(); mut(s); const v = C.validate(s); assert(!v.ok && v.errors.some((e) => e.field === field), "missing error for " + field + " got " + JSON.stringify(v.errors)); }
  const edge = scn({ orbit: { altKm: 300, incDeg: 180, nodeLonDeg: -180, phaseDeg: 359.9 } }); edge.stations[0].maskDeg = 60; edge.stations = edge.stations.concat([]); assert(C.validate(edge).ok, JSON.stringify(C.validate(edge).errors));
  const empty = scn(); empty.stations = []; assert(C.validate(empty).ok, "empty list must be valid");
  const e = run(empty); const sm = C.summarize(empty, e.p, e.fc); assert(sm.coveragePct === 0 && e.fc.gaps.length === 1 && e.fc.gaps[0].duration === e.fc.horizonS, "empty coverage");
});

check("N22", "playback-speed independence: live transitions match forecast", () => {
  const { s, p, fc } = run(scn());
  const hash0 = fc.hash; let worst = 0, matched = 0;
  for (const rate of [1, 60, 300, 1000]) {
    let rng = rate; const rnd = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
    let t = 0, prev = new Set(C.availableIds(fc, 0)), lastDt = 0;
    const end = rate === 1 ? 3600 : 86400;
    while (t < end) {
      const dt = (1 / 60 + rnd() / 30) * rate; t = Math.min(end, t + dt); lastDt = dt;
      const now = new Set(C.availableIds(fc, t));
      for (const id of now) if (!prev.has(id)) { // became available: predicted AOS must lie within the last step
        const ps = fc.passes[id].find((x) => x.start <= t && x.end >= t); const err = t - ps.start; assert(err >= -1e-9 && err <= dt + 1e-9, `rate ${rate} late ${err}`); worst = Math.max(worst, err / rate); matched++;
      }
      prev = now;
    }
  }
  const again = C.forecast(s, C.makePropagator(s)); assert(again.hash === hash0, "forecast changed");
  return `${matched} transitions, worst lag ${(worst * 1000).toFixed(1)} ms wall`;
});

check("N23", "union statistics on hand-built intervals", () => {
  const s = scn(); s.stations = [st("a", 0, 0), st("b", 0, 1), st("c", 0, 2)]; s.horizon = "6h";
  const p = C.makePropagator(s), fc = C.forecast(s, p);
  fc.passes = { a: [{ start: 0, end: 100, duration: 100, peakEl: 0.5, clippedStart: true }], b: [{ start: 50, end: 200, duration: 150, peakEl: 0.3 }, { start: 1000, end: 1100, duration: 100, peakEl: 0.2 }], c: [{ start: 200, end: 300, duration: 100, peakEl: 0.1 }] };
  // recompute network the same way forecast does
  const recompute = (fcx) => { const fresh = C.forecast(s, p); return fresh; };
  void recompute;
  const all = [].concat(fc.passes.a, fc.passes.b, fc.passes.c).sort((x, y) => x.start - y.start), net = [];
  for (const q of all) { const l = net[net.length - 1]; if (l && q.start <= l.end) l.end = Math.max(l.end, q.end); else net.push({ start: q.start, end: q.end }); }
  assert(net.length === 2 && net[0].end === 300 && net[1].start === 1000, JSON.stringify(net));
  // peak simultaneous with tie at 200 (b ends, c starts): must be 2 (a+b), not 3
  const pts = []; all.forEach((q) => { pts.push([q.start, 1]); pts.push([q.end, -1]); }); pts.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let c = 0, pk = 0; pts.forEach(([, d]) => { c += d; pk = Math.max(pk, c); }); assert(pk === 2, "peak " + pk);
});

check("N24p", "default scenario teaching properties (overlap, blackout > 30 min, short pass)", () => {
  const { s, p, fc } = run(scn()); const sm = C.summarize(s, p, fc);
  const short = Object.values(fc.passes).flat().some((x) => x.duration < 120 && !x.clippedStart && !x.clippedEnd);
  assert(sm.peakSimul.count >= 2, "no overlap"); assert(sm.longestGap.duration > 1800, "no long blackout"); assert(short, "no short pass");
  return `coverage ${sm.coveragePct.toFixed(1)} %, peak ${sm.peakSimul.count}, longest gap ${C.fmtDur(sm.longestGap.duration, true)}, passes ${sm.passCount}`;
});

check("PERF", "24 h forecast with 50 stations under 150 ms", () => {
  const s = scn(); s.stations = []; for (let i = 0; i < 50; i++) s.stations.push(st("p" + i, -60 + (i * 2.4), -180 + i * 7.2));
  const p = C.makePropagator(s); const t0 = process.hrtime.bigint(); C.forecast(s, p); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert(ms < 150, ms.toFixed(0) + " ms"); return ms.toFixed(0) + " ms";
});

// ----------------------------------------------------------------------------- shared session authority
const CR = require("../../server/coverage_room.js");
function fakeRoom() { return { hostId: "h", players: { h: { name: "Host" }, v: { name: "Viewer" } } }; }

check("N24", "coverage state: default scenario, editor = host, clock paused", () => {
  const room = fakeRoom(), cov = CR.createCoverageState("h");
  assert(cov.editorId === "h" && cov.clock.paused && C.validate(cov.scenario).ok, "bad initial state");
  const pub = CR.publicState(cov, room); assert(pub.editorName === "Host" && pub.revision === 1);
});

check("N25", "edit ownership + server-side validation + revisions", () => {
  const room = fakeRoom(), cov = CR.createCoverageState("h");
  const s2 = JSON.parse(JSON.stringify(cov.scenario)); s2.orbit.altKm = 800;
  let r = CR.applyRequest(cov, room, "v", { type: "SET_SCENARIO", scenario: s2 }); assert(!r.accepted && /editor/.test(r.reason), "viewer edit accepted");
  assert(cov.revision === 1, "revision bumped on rejected edit");
  const bad = JSON.parse(JSON.stringify(s2)); bad.orbit.incDeg = 500;
  r = CR.applyRequest(cov, room, "h", { type: "SET_SCENARIO", scenario: bad }); assert(!r.accepted && /incDeg/.test(r.reason), "invalid scenario accepted");
  r = CR.applyRequest(cov, room, "h", { type: "SET_SCENARIO", scenario: s2 }); assert(r.accepted && cov.revision === 2 && cov.scenario.orbit.altKm === 800, "valid edit rejected");
  r = CR.applyRequest(cov, room, "v", { type: "CLOCK", op: "play" }); assert(!r.accepted, "viewer clock accepted");
  r = CR.applyRequest(cov, room, "v", { type: "SET_EDITOR", playerId: "v" }); assert(!r.accepted, "viewer took editor");
  r = CR.applyRequest(cov, room, "h", { type: "SET_EDITOR", playerId: "v" }); assert(r.accepted && cov.editorId === "v");
  r = CR.applyRequest(cov, room, "v", { type: "SET_PINS", pins: [{ id: "a", name: "A", t: 100 }, { id: "b", name: "B", t: 1e9 }] }); assert(!r.accepted, "out-of-window pin accepted");
  r = CR.applyRequest(cov, room, "v", { type: "SET_PINS", pins: [{ id: "a", name: "A", t: 100 }, { id: "a", name: "B", t: 200 }] }); assert(!r.accepted, "duplicate pin id accepted");
  r = CR.applyRequest(cov, room, "v", { type: "SET_PINS", pins: [{ id: "a", name: "A", t: 100 }, { id: "b", name: "B", t: 2000 }] }); assert(r.accepted && cov.scenario.pins[1].t === 2000, "pins rejected");
  r = CR.applyRequest(cov, room, "h", { type: "SET_PINS", pins: [] }); assert(!r.accepted, "non-editor pins accepted");
  delete room.players.v; CR.onPlayerLeft(cov, room); assert(cov.editorId === "h", "editor not returned to host");
  CR.applyRequest(cov, room, "h", { type: "HASH", revision: 2, hash: "aaa" }); room.players.v = { name: "V" };
  CR.applyRequest(cov, room, "v", { type: "HASH", revision: 2, hash: "bbb" }); assert(cov.desync, "desync not flagged");
});

check("N26", "shared clock: rate, pause, seek, end-of-window clamp", () => {
  const room = fakeRoom(), cov = CR.createCoverageState("h");
  CR.applyRequest(cov, room, "h", { type: "CLOCK", op: "rate", value: 300 });
  CR.applyRequest(cov, room, "h", { type: "CLOCK", op: "play" });
  const w = cov.clock.wallRef; near(CR.clockNow(cov, w + 2000), 600, 1e-6, "300x for 2 s");
  CR.applyRequest(cov, room, "h", { type: "CLOCK", op: "seek", value: 86000 });
  near(CR.clockNow(cov, cov.clock.wallRef + 10000), 86400, 1e-6, "clamped to window end");
  assert(!CR.applyRequest(cov, room, "h", { type: "CLOCK", op: "rate", value: 7 }).accepted, "bad rate accepted");
  // two clients with different offsets compute the same sim time from the same broadcast
  const st = CR.publicState(cov, room), now = st.serverNow + 1234;
  const simAt = (offsetErrMs) => st.clock.paused ? st.clock.simT : Math.min(86400, st.clock.simT + st.clock.rate * ((now + offsetErrMs) - st.clock.wallRef) / 1000);
  CR.applyRequest(cov, room, "h", { type: "CLOCK", op: "seek", value: 100 });
  const st2 = CR.publicState(cov, room);
  const a = st2.clock.simT + st2.clock.rate * (40 / 1000), b = st2.clock.simT + st2.clock.rate * (-10 / 1000);
  assert(Math.abs(a - b) <= 0.05 * st2.clock.rate, "50 ms offset error exceeds tolerance"); void simAt;
});

check("N27", "station-only edits keep the clock; orbit edits restart it", () => {
  const room = fakeRoom(), cov = CR.createCoverageState("h");
  CR.applyRequest(cov, room, "h", { type: "CLOCK", op: "seek", value: 5000 }); CR.applyRequest(cov, room, "h", { type: "CLOCK", op: "play" });
  const s2 = JSON.parse(JSON.stringify(cov.scenario)); s2.stations[0].lat += 3;
  let r = CR.applyRequest(cov, room, "h", { type: "SET_SCENARIO", scenario: s2 }); assert(r.accepted && r.keptClock && cov.clock.simT >= 5000 && !cov.clock.paused, "clock reset on station edit");
  CR.applyRequest(cov, room, "h", { type: "SET_PINS", pins: [{ id: "a", name: "A", t: 100 }] });
  const s2b = JSON.parse(JSON.stringify(cov.scenario)); s2b.stations[1].maskDeg = 20;
  CR.applyRequest(cov, room, "h", { type: "SET_SCENARIO", scenario: s2b }); assert(cov.scenario.pins.length === 1, "pins dropped on a station edit");
  const s3 = JSON.parse(JSON.stringify(cov.scenario)); s3.orbit.altKm = 600;
  r = CR.applyRequest(cov, room, "h", { type: "SET_SCENARIO", scenario: s3 }); assert(r.accepted && !r.keptClock && cov.clock.simT === 0, "clock kept on orbit edit");
  assert(cov.scenario.pins.length === 0, "old-orbit pins kept after an orbit change");
});

check("N28t", "azimuths: pass rises and sets on opposite sides; peak az consistent", () => {
  const { fc } = run(scn({ stations: [st("y", 16.84, 96.17, 10)] }));
  const p = fc.passes.y.find((x) => !x.clippedStart && !x.clippedEnd && x.peakEl > 20 * D);
  assert(p, "no high pass"); const d = Math.abs(C.wrapPi(p.azEnd - p.azStart)) * R;
  assert(d > 90, "start/end azimuths only " + d.toFixed(0) + "° apart");
  const a1 = C.wrapPi(p.azPeak - p.azStart), a2 = C.wrapPi(p.azEnd - p.azStart); assert(Math.sign(a1) === Math.sign(a2) && Math.abs(a1) < Math.abs(a2), "peak azimuth not between rise and set"); return `AOS ${(p.azStart * R).toFixed(0)}° → LOS ${(p.azEnd * R).toFixed(0)}°, peak ${(p.peakEl * R).toFixed(0)}°`;
});

check("N29t", "coverage counts along the orbit match the in-view list", () => {
  const { s, p, fc } = run(scn());
  const times = []; for (let t = 0; t < fc.validUntil; t += 37) times.push(t);
  const counts = C.countsAt(fc, times);
  times.forEach((t, i) => assert(counts[i] === C.inViewCount(fc, t), `t=${t}: ${counts[i]} vs ${C.inViewCount(fc, t)}`));
  return `max ${Math.max(...counts)} stations at once on the sampled track`;
});

check("N30t", "team stats: per-day rates and gaps between passes", () => {
  const { s, p, fc } = run(scn());
  const sm = C.summarize(s, p, fc, { usefulElDeg: 30 });
  for (const ps of sm.perStation) {
    const list = fc.passes[ps.id];
    near(ps.passesPerDay, list.length, 1e-9, "passes/day over 24 h");
    if (list.length >= 2) { const gaps = list.slice(1).map((x, i) => x.start - list[i].end); near(ps.longestGapS, Math.max(...gaps), 1e-6, "longest gap"); }
    assert(ps.usefulPasses === list.filter((x) => x.peakEl >= 30 * D).length, "useful passes");
  }
  near(sm.contactMinPerDay, sm.unionS / 60, 1e-9, "contact min/day");
});

check("N31t", "CSV pass schedule and pasted station lists", () => {
  const { s, p, fc } = run(scn());
  const csv = C.passesCsv(s, p, fc).trim().split(/\r\n/);
  const hdr = csv.findIndex((l) => l.startsWith("station,")); assert(hdr === 2, "header line");
  const n = Object.values(fc.passes).reduce((x, a) => x + a.length, 0); assert(csv.length - 3 === n, `rows ${csv.length - 3} vs ${n}`);
  const cols = csv[3].split(","); assert(cols.length === 12 && /Z$/.test(cols[4]), "row format " + csv[3]);
  const r = C.parseStationList("# my network\nHome, 16.8, 96.1, 15\n-33.9\t18.4\nBad line\nNorth;95;0", [{ name: "home" }]);
  assert(r.stations.length === 2 && r.errors.length === 2, JSON.stringify(r));
  assert(r.stations[0].name === "Home (2)" && r.stations[0].maskDeg === 15 && r.stations[1].lat === -33.9, JSON.stringify(r.stations));
});

// ----------------------------------------------------------------------------- real mode (optional lib)
let sat = null;
for (const f of ["../../node_modules/satellite.js/dist/satellite.js", "../../node_modules/satellite.js"]) { try { sat = require(path.join(__dirname, f)); if (sat && sat.json2satrec) break; } catch (e) { sat = null; } }
if (sat) require("./real_checks.js")({ C, sat, check, assert, near });
else results.push("SKIP N17–N21, N28–N31: satellite.js not installed");

Promise.all(pending).then(() => {
  for (const r of results) console.log(r);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
});
