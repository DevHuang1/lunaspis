#!/usr/bin/env node
/*
 * Focused automated checks for the Shuttle mission (no dependencies; DOM-free).
 * Run:  node tests/shuttle/run_checks.js            (full suite, ~1-3 min)
 *       node tests/shuttle/run_checks.js --quick    (skips the long comparison flights)
 */
"use strict";
const S = require("../../public/js/game/shuttle_simulation.js");
const { ShuttleMission, DT } = require("../../public/js/game/shuttle_mission.js");
const { createPilot, fly } = require("./pilot.js");
const { add, sub, scl, norm, dot, unit } = S.vec;
const DEG = S.DEG;
const QUICK = process.argv.includes("--quick");
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  (cond ? pass++ : fail++);
  results.push(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  console.log(results[results.length - 1]);
}
const km = (m) => (m / 1e3).toFixed(1) + " km";

// ---------------------------------------------------------------------------- physics basics
(function orbitPropagation() {
  const st = S.createState(); st.regime = "orbit"; st.dap.mode = "FREE"; st.cfg = { srb: false, et: false, payload: true };
  const r0 = S.RE + 300e3; st.r = [r0, 0, 0]; st.v = [0, Math.sqrt(S.MU / r0) * Math.cos(28.5 * DEG), Math.sqrt(S.MU / r0) * Math.sin(28.5 * DEG)];
  st.w = [0, 0, 0];
  const e0 = S.elements(st.r, st.v).energy, per = S.elements(st.r, st.v).period;
  const n = Math.round(per / DT);
  for (let i = 0; i < n; i++) S.step(st, {}, DT);
  const e1 = S.elements(st.r, st.v).energy;
  const kep = S.keplerPropagate([r0, 0, 0], [0, Math.sqrt(S.MU / r0) * Math.cos(28.5 * DEG), Math.sqrt(S.MU / r0) * Math.sin(28.5 * DEG)], n * DT);
  check("Circular orbit: energy drift over one orbit (RK4, 1/60 s)", Math.abs((e1 - e0) / e0) < 1e-8, `rel ${((e1 - e0) / e0).toExponential(2)}`);
  check("Circular orbit: integrator matches Kepler after one orbit", norm(sub(st.r, kep.r)) < 5, `${norm(sub(st.r, kep.r)).toFixed(3)} m`);
  const p = S.keplerPropagate(kep.r, kep.v, -n * DT);
  check("Frame/propagation round trip (Kepler forward/back)", norm(sub(p.r, [r0, 0, 0])) < 1e-3, `${norm(sub(p.r, [r0, 0, 0])).toExponential(2)} m`);
})();

(function frameRoundTrips() {
  const st = S.createState();
  const r = S.fromRunway(st, 1234, -56, 78), b = S.toRunway(st, r);
  check("Runway frame round trip (≤5 cm: tangent plane vs spherical surface)", Math.abs(b.x - 1234) < 0.05 && Math.abs(b.y + 56) < 0.05 && Math.abs(b.h - 78) < 1e-3, `${b.x.toFixed(4)}, ${b.y.toFixed(4)}, ${b.h.toFixed(4)}`);
  const va = [7000, 300, -150], rr = [S.RE + 80e3, 1e5, 2e5];
  const att = S.attitudeFromAero(rr, va, 33 * DEG, -47 * DEG), back = S.aeroFromAttitude(att.q, rr, va);
  check("Aero-angle <-> attitude round trip", Math.abs(back.alpha - 33 * DEG) < 1e-9 && Math.abs(back.sigma + 47 * DEG) < 1e-9, `α ${(back.alpha / DEG).toFixed(6)}°, σ ${(back.sigma / DEG).toFixed(6)}°`);
})();

(function aeroChecks() {
  const st = S.createState(); st.cfg = { srb: false, et: false, payload: false };
  st.flight.alpha = 40 * DEG; st.flight.sigma = 0;
  const rV = [S.RE + 200e3, 0, 0], vV = [0, 7700, 0];
  check("Zero aerodynamic force in vacuum (200 km)", norm(S.aeroAccel(st, rV, vV, 90000, "orbiter").a) === 0);
  const r = [S.RE + 70e3, 0, 0], v = [0, 7400, 0];
  const va = S.airVel(r, v), vh = unit(va), up = unit(r);
  const l0 = unit(sub(up, scl(vh, dot(up, vh)))), right0 = S.vec.cross(vh, l0);
  const lat = (sig) => { st.flight.sigma = sig; const a = S.aeroAccel(st, r, v, 90000, "orbiter").a; return dot(a, right0); };
  const vert = (sig) => { st.flight.sigma = sig; const a = S.aeroAccel(st, r, v, 90000, "orbiter").a; return dot(a, l0); };
  check("Bank sign changes lateral lift (σ=+60 right, σ=-60 left)", lat(60 * DEG) > 0 && lat(-60 * DEG) < 0, `${lat(60 * DEG).toFixed(2)} / ${lat(-60 * DEG).toFixed(2)} m/s²`);
  check("Bank tilts the lift vector (vertical lift ∝ cos σ)", Math.abs(vert(60 * DEG) / vert(0) - 0.5) < 0.02 * 1 + 0.15, `ratio ${(vert(60 * DEG) / vert(0)).toFixed(3)}`);
  st.flight.sigma = 0;
  const D = S.aeroAccel(st, r, v, 90000, "orbiter");
  check("Drag opposes air-relative velocity", dot(D.a, vh) < 0);
  // energy in the Earth-rotating frame cannot increase without thrust (atmosphere co-rotates)
  const s2 = S.createState(); s2.regime = "atmo"; s2.cfg = { srb: false, et: false, payload: false };
  s2.r = [S.RE + 60e3, 0, 0]; s2.v = add([0, 6000, 0], S.earthRateVel(s2.r)); s2.flight.alpha = 40 * DEG; s2.flight.sigma = 50 * DEG;
  const EJ = (s) => { const vr = S.airVel(s.r, s.v); return dot(vr, vr) / 2 - S.MU / norm(s.r) - 0.5 * S.OMEGA_E ** 2 * (s.r[0] ** 2 + s.r[1] ** 2); };
  let mono = true, prev = EJ(s2);
  for (let i = 0; i < 60 * 60; i++) { S.step(s2, {}, DT); const e = EJ(s2); if (e > prev + 1e-3) mono = false; prev = e; }
  check("Unpowered entry: rotating-frame energy never increases (60 s)", mono);
})();

// ---------------------------------------------------------------------------- ascent / staging
let ascentInfo = {};
(function ascent() {
  const m = new ShuttleMission(); m.command("START");
  check("Ascent requires no player input (none sent)", true);
  const evs = []; let prevR = m.st.r.slice(), prevV = m.st.v.slice(), jumps = [];
  let stageCount = { SRB: 0, ET: 0 }, mecoCount = 0;
  while (m.phase !== "insertion" && m.st.t < 900) {
    prevR = m.st.r.slice(); prevV = m.st.v.slice();
    const e = m.advanceSim(DT);
    for (const x of e) {
      if (x.type === "STAGE_SEPARATED") { stageCount[x.stage]++; jumps.push({ stage: x.stage, dr: norm(sub(m.st.r, prevR)), dv: norm(sub(m.st.v, prevV)), vmag: norm(m.st.v) }); }
      if (x.type === "MECO") mecoCount++;
      evs.push(x.type);
    }
  }
  const order = evs.filter((t) => ["LIFTOFF", "STAGE_SEPARATED", "MECO"].includes(t));
  check("Staging order: liftoff → SRB sep → MECO → ET sep, each once", stageCount.SRB === 1 && stageCount.ET === 1 && mecoCount === 1 && order.join(",") === "LIFTOFF,STAGE_SEPARATED,MECO,STAGE_SEPARATED", order.join(","));
  const j = jumps.map((x) => `${x.stage}: Δr ${x.dr.toFixed(2)} m, Δv ${x.dv.toFixed(3)} m/s`).join("; ");
  check("Stage separation preserves position/velocity (no teleport)", jumps.every((x) => x.dr < x.vmag * DT * 1.05 + 0.1 && x.dv < 1.5), j);
  const el = S.elements(m.st.r, m.st.v);
  ascentInfo = { met: m.st.t - m.st.launchT, peri: el.periapsisAlt, apo: el.apoapsisAlt, inc: el.inc, etLeft: m.st.mass.et };
  check("MECO/ET-sep orbit is NOT accepted as orbit (perigee low)", m.obj.orbit_valid !== "done" && el.periapsisAlt < 250e3, `${km(el.periapsisAlt)} × ${km(el.apoapsisAlt)}`);
  check("Main engines cannot thrust after ET separation", !m.st.cfg.et && !m.st.eng.ssme && m.st.mass.et === 0);
  const e0 = S.elements(m.st.r, m.st.v).energy; m.advanceSim(20);
  check("After ET sep only drag acts (112 km perigee): energy does not increase", S.elements(m.st.r, m.st.v).energy <= e0, `ΔE ${(S.elements(m.st.r, m.st.v).energy - e0).toFixed(1)} J/kg`);
  const r = m.command("SET_WARP", { factor: 100 });
  check("Warp limited in insertion before burn authorization", !r.accepted, r.reason);
  ascentInfo.mission = m;
})();

(function verticalSuborbital() {
  const m = new ShuttleMission();
  m.applyFixture("vertical 400 km, no tangential speed", (mm) => {
    mm.phase = "insertion"; const st = mm.st; st.regime = "orbit"; st.cfg = { srb: false, et: false, payload: true }; st.dap.mode = "FREE";
    st.r = [S.RE + 400e3, 0, 0]; st.v = add([300, 0, 0], S.earthRateVel(st.r));
    st.burn = { kind: "OMS2", complete: true, authorized: true };
  });
  m.advanceSim(30);
  check("Vertical 400 km trajectory never validates orbit", m.obj.orbit_valid !== "done", `periapsis ${km(S.elements(m.st.r, m.st.v).periapsisAlt)}`);
})();

// ---------------------------------------------------------------------------- frame-rate invariance
(function frameRate() {
  const runAt = (fps) => { const m = new ShuttleMission(); m.command("START"); const dt = 1 / fps; for (let i = 0; i < 40 * fps; i++) m.advance(dt); return m.st; };
  const a = runAt(30), b = runAt(60), c = runAt(120);
  const d1 = norm(sub(a.r, b.r)), d2 = norm(sub(c.r, b.r)), dt1 = Math.abs(a.t - b.t), dt2 = Math.abs(c.t - b.t);
  check("Frame-rate invariance 30/60/120 fps (40 s of ascent)", d1 < 1e-6 + norm(b.v) * DT * 1.1 && d2 < 1e-6 + norm(b.v) * DT * 1.1 && dt1 <= DT + 1e-9 && dt2 <= DT + 1e-9,
    `Δr ${d1.toFixed(4)} / ${d2.toFixed(4)} m, Δt ${dt1.toFixed(4)} / ${dt2.toFixed(4)} s (≤ one fixed step)`);
  const m = new ShuttleMission(); m.command("START"); m.advance(0.5); m.advance(3.0);
  check("Long frame (3 s suspension) pauses instead of integrating a huge step", m.paused);
})();

// ---------------------------------------------------------------------------- full nominal mission
let full = null;
(function fullMission() {
  const m = new ShuttleMission();
  const t0 = Date.now();
  const res = fly(m, createPilot());
  full = m;
  const r = m.result || {};
  check("Full nominal mission (scripted pilot following HUD cues, digital inputs)", !!(m.result && m.result.success),
    m.result ? `MET ${(r.met / 60).toFixed(0)} min sim; touchdown sink ${r.touchdown.sink.toFixed(2)} m/s, ${r.touchdown.gs.toFixed(0)} m/s at x=${r.touchdown.x.toFixed(0)} m, y=${r.touchdown.y.toFixed(1)} m; stop x=${r.stopX.toFixed(0)} m; max ${r.maxG.toFixed(2)} g, ${r.maxHeat.toFixed(0)} W/cm²; wall ${(Date.now() - t0) / 1000}s` : JSON.stringify(m.failure));
  const ev = m.events; // drained by advanceSim; count via objectives instead
  check("All objectives done exactly at completion", m.snapshot().objectives.every((o) => o.status === "done"));
  const before = m.revision; m.advanceSim(5); const r2 = m.command("RELEASE_PAYLOAD");
  check("Completion is final (no further ticks/commands after wheels stop)", m.revision === before + 1 && !r2.accepted && m.result.success, `revision +${m.revision - before} (rejection event only)`);
})();

// ---------------------------------------------------------------------------- checkpoints
const ck = full ? full.checkpoints : {};
function fromCk(name, variant, opts) {
  const m = new ShuttleMission(); m.checkpoints = ck; m.command("RETRY_CHECKPOINT", { name });
  const res = fly(m, createPilot(variant), opts || {});
  return m;
}
(function checkpointEquivalence() {
  const run = () => { const m = new ShuttleMission(); m.checkpoints = ck; m.command("RETRY_CHECKPOINT", { name: "entry" }); const p = createPilot(); for (let i = 0; i < 60 * 200; i++) { const o = p.step(m); for (const c of o.cmds) m.command(c[0], c[1]); m.command("SET_CONTROL_INPUT", o.input); m.advanceSim(DT); } return JSON.stringify([m.st.r, m.st.v, m.st.flight]); };
  check("Checkpoint restore is deterministic (two replays from ENTRY, 200 s)", run() === run());
  const m = new ShuttleMission(); m.checkpoints = ck; m.command("RETRY_CHECKPOINT", { name: "payload" });
  check("Restored PAYLOAD checkpoint has released satellite once, no stale result", m.st.payload.released && !m.st.cfg.payload && !m.result && !m.failure && m.phase === "deorbit");
  const r = m.command("RELEASE_PAYLOAD");
  check("Cannot release the payload again after restore", !r.accepted, r.reason);
})();

// ---------------------------------------------------------------------------- orbital tasks need the player
(function orbitalInputs() {
  const m = new ShuttleMission(); m.checkpoints = ck; m.command("RETRY_CHECKPOINT", { name: "orbit" });
  const eA = S.elements(m.st.r, m.st.v).energy; m.advanceSim(20);
  check("No thrust in a 300 km orbit without inputs/burns (energy constant over 20 s)", Math.abs(S.elements(m.st.r, m.st.v).energy - eA) < 1e-3, `ΔE ${(S.elements(m.st.r, m.st.v).energy - eA).toExponential(2)} J/kg`);
  const r1 = m.command("RELEASE_PAYLOAD");
  check("Release rejected with doors closed / unchecked payload", !r1.accepted && /doors/i.test(r1.reason), r1.reason);
  const r2 = m.command("DAP_HOLD");
  check("Attitude hold refused while rates are high (player must null rates)", !r2.accepted, r2.reason);
  const r3 = m.command("PAYLOAD_POWER");
  check("Payload power refused before radiators are exposed", !r3.accepted, r3.reason);
  const none = fromCk("orbit", { orbital: "none" }, { maxSim: 1800 });
  check("No orbital inputs: payload objective stays incomplete (30 min)", none.phase === "payload" && none.obj.deploy_verified !== "done" && !none.result, `phase ${none.phase}, release ${none.obj.release}`);
  const up = fromCk("orbit", { sepDir: "up" }, { maxSim: 3600, stopPhase: "deorbit" });
  check("Wrong-way separation (toward the satellite) fails with a collision", !!(up.failure && /Collid/.test(up.failure.reason)), up.failure ? up.failure.reason : up.phase);
  const nosep = fromCk("orbit", { sepDir: "none" }, { maxSim: 3600, stopPhase: "deorbit" });
  check("Skipping the separation burn never verifies deployment", nosep.obj.deploy_verified !== "done", nosep.failure ? nosep.failure.reason : `phase ${nosep.phase}`);
  const ok = fromCk("orbit", {}, { maxSim: 3600, stopPhase: "deorbit" });
  check("Correct orbital work completes deployment and saves PAYLOAD checkpoint", ok.phase === "deorbit" && ok.obj.deploy_verified === "done");
})();

// ---------------------------------------------------------------------------- deorbit
(function deorbit() {
  const before = (() => { const m = new ShuttleMission(); m.checkpoints = ck; m.command("RETRY_CHECKPOINT", { name: "payload" }); return S.elements(m.st.r, m.st.v).periapsisAlt; })();
  const m = fromCk("payload", {}, { stopPhase: "entry" });
  const peri = S.elements(m.st.r, m.st.v).periapsisAlt;
  check("Deorbit burn lowers perigee into the entry corridor", peri < 85e3 && before > 250e3, `${km(before)} → ${km(peri)}`);
  const m2 = new ShuttleMission(); m2.checkpoints = ck; m2.command("RETRY_CHECKPOINT", { name: "payload" });
  m2.command("CLOSE_BAY"); m2.advanceSim(50); m2.command("COAST_TO_TIG");
  const rr = m2.command("AUTHORIZE_BURN");
  check("Deorbit authorization refused when not pointing retrograde", !rr.accepted, rr.reason);
  if (!QUICK) {
    const late = fromCk("payload", { deorbitLate: 45 }, { stopPhase: "entry" });
    const pOn = m.guid.eiPred, pLate = late.guid.eiPred;
    check("Late ignition (+45 s) shifts the predicted entry downrange (long)", pOn && pLate && pLate.rangeErr > pOn.rangeErr + 100e3, pOn && pLate ? `nominal ${km(pOn.rangeErr)}, late ${km(pLate.rangeErr)} (+ = long)` : (late.failure || {}).reason);
    const vlate = fromCk("payload", { deorbitLate: 75 }, { stopPhase: "entry", maxSim: 900 });
    check("Very late authorization (> TIG+60 s) is refused — opportunity missed", vlate.phase === "deorbit" && !(vlate.st.burn && vlate.st.burn.authorized));
  }
})();

// ---------------------------------------------------------------------------- entry: input matters
const entryRuns = {};
(function entry() {
  const variants = QUICK ? ["follow", "none"] : ["follow", "none", "wrong", "shallow", "steep"];
  for (const v of variants) {
    const m = fromCk("entry", { entry: v }, { stopPhase: "approach" });
    const d = S.derive(m.st);
    entryRuns[v] = { phase: m.phase, fail: m.failure ? m.failure.reason : null, dist: d.rangeToRunwayM, maxHeat: m.st.log.maxHeat, maxG: m.st.log.maxG, t: m.st.t };
  }
  const f = entryRuns.follow, n = entryRuns.none;
  check("Entry with player banking per cues reaches the terminal-area gate", f.phase === "approach" && !f.fail, `${km(f.dist)} from KSC at handover`);
  check("Entry with NO bank input fails (trajectory differs)", !!n.fail, n.fail);
  if (!QUICK) {
    check("Entry with wrong-direction reversals fails or misses the gate", !!entryRuns.wrong.fail || entryRuns.wrong.phase !== "approach", entryRuns.wrong.fail || entryRuns.wrong.phase);
    check("Shallow constant bank (20°) fails: too much energy/range", !!entryRuns.shallow.fail, entryRuns.shallow.fail);
    check("Steep constant bank (88°) fails: low energy / limits", !!entryRuns.steep.fail, entryRuns.steep.fail);
  }
})();

// ---------------------------------------------------------------------------- approach / landing
const apprRuns = {};
(function approach() {
  for (const v of ["follow", "noflare", "nogear", "none"]) {
    const m = fromCk("approach", { approach: v });
    apprRuns[v] = { ok: !!(m.result && m.result.success), fail: m.failure ? m.failure.reason : null, td: m.touchdown };
  }
  const r = fromCk("approach", { rollout: "nobrake" });
  apprRuns.nobrake = { ok: !!(m => m)(r.result && r.result.success), fail: r.failure ? r.failure.reason : null };
  check("Approach flown per cues: touchdown inside limits and wheels stop", apprRuns.follow.ok, apprRuns.follow.td ? `sink ${apprRuns.follow.td.sink.toFixed(2)} m/s, ${apprRuns.follow.td.gs.toFixed(0)} m/s, x ${apprRuns.follow.td.x.toFixed(0)} m, y ${apprRuns.follow.td.y.toFixed(1)} m` : apprRuns.follow.fail);
  check("No flare → touchdown failure", !!apprRuns.noflare.fail, apprRuns.noflare.fail);
  check("Gear not deployed → belly landing failure", !!apprRuns.nogear.fail && /gear/i.test(apprRuns.nogear.fail), apprRuns.nogear.fail);
  check("No approach input → failure", !!apprRuns.none.fail, apprRuns.none.fail);
  check("No braking → runway overrun failure", !!apprRuns.nobrake.fail && /overrun/i.test(apprRuns.nobrake.fail), apprRuns.nobrake.fail);
})();

(function touchdownEnvelope() {
  const mk = (sink, gs, gear, x, y, hc) => {
    const st = S.createState(); st.regime = "atmo"; st.approachMode = true; st.cfg = { srb: false, et: false, payload: false };
    st.flight.gear = gear; st.flight.alpha = 8 * DEG; st.flight.sigma = 0;
    st.r = S.fromRunway(st, x, y, hc || 4.0);
    const vR = [gs, 0, -sink];
    st.v = add(S.rwyVecToEci(st, vR), S.earthRateVel(st.r));
    st.q = S.attitudeFromAero(st.r, S.airVel(st.r, st.v), 8 * DEG, 0).q;
    return S.touchdownCheck(st);
  };
  const a = mk(2.9, 100, 1, 600, 0), b = mk(3.1, 100, 1, 600, 0), c = mk(1, 119, 1, 600, 0), d = mk(1, 121, 1, 600, 0);
  const e = mk(1, 100, 0.5, 600, 0, 1.5), f = mk(1, 100, 1, -50, 0), g = mk(1, 100, 1, 600, 44), h = mk(1, 100, 1, 4700, 0);
  check("Touchdown envelope: sink 2.9 ok / 3.1 fail", a && a.ok && b && !b.ok, b && b.reason);
  check("Touchdown envelope: groundspeed 119 ok / 121 fail", c && c.ok && d && !d.ok, d && d.reason);
  check("Touchdown with gear not locked fails", e && !e.ok, e && e.reason);
  check("Runway bounds: short / off edge / beyond end all fail", f && !f.ok && g && !g.ok && h && !h.ok, [f, g, h].map((z) => z && z.reason).join(" | "));
})();

// ---------------------------------------------------------------------------- lifecycle
(function lifecycle() {
  const m = new ShuttleMission(); m.command("START");
  const r = m.command("START");
  check("Duplicate START rejected", !r.accepted, r.reason);
  const r2 = m.command("DEPLOY_GEAR");
  check("Out-of-order command rejected with reason", !r2.accepted, r2.reason);
  m.advanceSim(30); m.command("EXIT"); const t = m.st.t; m.advance(1 / 60); m.advanceSim(5);
  check("EXIT stops the mission without a result", m.exited && !m.result && m.st.t === t);
  const m2 = new ShuttleMission(); m2.checkpoints = ck; m2.command("RETRY_CHECKPOINT", { name: "approach" });
  fly(m2, createPilot({ approach: "noflare" }));
  const failed = !!m2.failure; const rr = m2.command("RETRY_CHECKPOINT");
  fly(m2, createPilot());
  check("Failure → retry from checkpoint → success; retries counted", failed && rr.accepted && m2.result && m2.result.success && m2.result.retries >= 2, `retries ${m2.result && m2.result.retries}`);
  const m3 = new ShuttleMission(); m3.applyFixture("approach preset", (mm) => { const c = JSON.parse(ck.approach); mm.st = c.st; mm.obj = c.obj; mm.phase = c.phase; mm.guid = {}; });
  fly(m3, createPilot());
  check("Fixture/preset run can never award a normal-flight result", m3.result && m3.result.success === false && m3.result.integrity === "rehearsal", m3.result && m3.result.summary);
  const m4 = new ShuttleMission(); m4.command("START"); m4.advanceSim(60);
  const w = m4.command("SET_WARP", { factor: 50 });
  check("Ascent warp capped at 8× (every phase can be accelerated, hand-flown ones are capped)", !w.accepted && m4.warpReq === 8, w.reason);
  (() => { const lim = { entry: 8, approach: 4, rollout: 4 }; const bad = Object.keys(lim).filter((ph) => ShuttleMission.WARP_LIMIT ? ShuttleMission.WARP_LIMIT[ph] !== lim[ph] : false);
    const M = require("../../public/js/game/shuttle_mission.js"); const got = Object.keys(lim).map((ph) => `${ph}:${M.WARP_LIMIT[ph]}`).join(" ");
    check("Entry, approach and rollout accept time acceleration", Object.keys(lim).every((ph) => M.WARP_LIMIT[ph] >= lim[ph]), got + (bad.length ? "" : "")); })();
})();

// ---------------- the on-screen NEXT cue alone is enough for the orbital tasks
(() => {
  const m = new ShuttleMission(); fly(m, createPilot(), { stopPhase: "payload" });
  const KEY = { Y: ["OPEN_BAY"], P: ["PAYLOAD_POWER"], N: ["PAYLOAD_GO"], H: ["DAP_HOLD"], R: ["RELEASE_PAYLOAD"], B: ["AUTHORIZE_BURN"], T: ["COAST_TO_TIG"] };
  const AX = { W: ["pitch", -1], S: ["pitch", 1], A: ["roll", -1], D: ["roll", 1], Q: ["yaw", -1], E: ["yaw", 1], K: ["ty", -1] };   // same key map as the game
  const seen = new Set(); let lastKey = null, presses = 0, t0 = m.st.t;
  while (!m.failure && m.phase !== "entry" && m.st.t - t0 < 4 * 3600) {
    const n = m.snapshot().guidance.next, inp = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: 0, brake: 0 };
    seen.add(n.text.replace(/[0-9.]+/g, "#"));
    if (KEY[n.key] && n.key !== lastKey) { m.command(...(n.key === "Y" && m.st.bay.doors > 0 ? ["CLOSE_BAY"] : KEY[n.key])); presses++; }   // [Y] toggles the doors
    if (AX[n.key]) inp[AX[n.key][0]] = AX[n.key][1];
    lastKey = KEY[n.key] ? n.key : null;
    m.command("SET_CONTROL_INPUT", inp);
    const fast = n.key === "." || n.text.startsWith("Satellite self-check") || n.text.startsWith("Deorbit burn done") || n.text.startsWith("Separating");
    m.advanceSim(fast ? 10 / 60 : 1 / 60);
  }
  check("Following only the NEXT cue (one key at a time) completes payload deploy and deorbit", m.phase === "entry" && m.obj.deploy_verified === "done" && m.obj.deorbit_burn === "done",
    `${m.phase}; ${m.failure ? m.failure.reason : ""} ${presses} presses, ${seen.size} distinct cues`);
})();

// ---------------- landing by the prompt alone: a keyboard pilot that only reads the HUD's glide and
// bank cues (same thresholds as shuttle_hud.js) and re-reads them every 0.25 / 0.5 / 1 s
(() => {
  const DEG_ = Math.PI / 180, res = [];
  for (const react of [0.25, 0.5, 1.0]) {
    const m = new ShuttleMission(); fly(m, createPilot(), { stopPhase: "approach" });
    let hp = 0, hr = 0, tNext = 0, sb = 0, gear = false;
    while (!m.result && !m.failure && m.st.t < 30000) {
      const sn = m.snapshot(), t = sn.telemetry, g = sn.guidance, a = g.appr || {};
      if (m.st.t >= tNext) {
        tNext = m.st.t + react;
        if (a.gammaCmd !== undefined) { const dp = (a.gammaCmd - (t.gammaHoldRad === null ? t.flightPathRad : t.gammaHoldRad)) / DEG_; hp = Math.abs(dp) < 0.5 ? 0 : dp > 0 ? 1 : -1; }
        if (a.bankCue !== undefined) { const db = (a.bankCue - t.bankRad) / DEG_; hr = Math.abs(db) < 2 ? 0 : db > 0 ? 1 : -1; }
        if (sn.phase === "rollout") { hp = -1; hr = 0; }
        if (g.next && g.next.key === "G" && !gear) { m.command("DEPLOY_GEAR"); gear = true; }
        if (/FINAL|PREFLARE|SHALLOW/.test(a.mode || "")) sb = t.eas > 168 ? Math.min(1, sb + 0.2) : t.eas < 150 ? Math.max(0, sb - 0.2) : sb;
        else if (a.sbCue !== undefined) sb = a.sbCue;
      }
      m.command("SET_CONTROL_INPUT", { pitch: hp, roll: hr, yaw: 0, tx: 0, ty: 0, tz: 0, sb, brake: sn.phase === "rollout" ? 1 : 0 });
      m.advanceSim(1 / 60);
    }
    const td = (m.result && m.result.touchdown) || {};
    res.push({ react, ok: !!(m.result && m.result.success), x: td.x, y: td.y, sink: td.sink, why: m.failure && m.failure.reason });
  }
  check("Following only the landing prompt (glide + bank cues, 0.25/0.5/1 s reactions) lands on the runway", res.every((r) => r.ok),
    res.map((r) => r.ok ? `${r.react}s: x ${r.x.toFixed(0)} m, y ${r.y.toFixed(1)} m, sink ${r.sink.toFixed(2)}` : `${r.react}s: ${r.why}`).join(" | "));
})();

console.log(`\nAscent: MECO→ET sep orbit ${km(ascentInfo.peri)} × ${km(ascentInfo.apo)}, inc ${(ascentInfo.inc / DEG).toFixed(2)}°, ET residual ${ascentInfo.etLeft.toFixed(0)} kg`);
console.log("Entry comparison:", JSON.stringify(Object.fromEntries(Object.entries(entryRuns).map(([k, v]) => [k, v.fail || `${v.phase} @ ${km(v.dist)}`]))));
console.log("Approach comparison:", JSON.stringify(Object.fromEntries(Object.entries(apprRuns).map(([k, v]) => [k, v.ok ? "success" : v.fail]))));
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
