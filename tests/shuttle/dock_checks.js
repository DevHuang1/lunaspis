#!/usr/bin/env node
/*
 * ISS docking flight checks (variant "iss"; DOM-free). Run: node tests/shuttle/dock_checks.js
 *  - launch reaches a stable 51.6° orbit and the documented skip puts the station 250 m ahead (orbiter on the -V-bar)
 *  - a keyboard crew that only follows the NEXT cue (one key at a time) docks inside the limits
 *  - contact outside the limits fails with the reason (too fast, doors closed, misaligned)
 *  - checkpoints / 100× allowed during the approach; the deploy flight is unchanged by default
 */
"use strict";
const S = require("../../public/js/game/shuttle_simulation.js");
const M = require("../../public/js/game/shuttle_mission.js");
const { ShuttleMission, DOCK } = M;
const { createPilot, fly } = require("./pilot.js");
const DEG = S.DEG;
let pass = 0, fail = 0;
function check(name, cond, detail) { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); }
const incOf = (st) => { const h = S.vec.cross(st.r, st.v); return Math.acos(h[2] / S.vec.norm(h)) / DEG; };

// ---- launch to the docking phase with the scripted pilot (START, OMS-2)
const base = new ShuttleMission({ variant: "iss" });
const t0 = Date.now();
fly(base, createPilot(), { stopPhase: "docking" });
const el = S.elements(base.st.r, base.st.v);
check("ISS flight reaches the docking phase (launch + OMS-2, no satellite aboard)", base.phase === "docking" && !base.st.cfg.payload,
  `${base.phase} ${base.failure ? base.failure.reason : ""} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
check("Orbit inclination ≈ 51.6° (station plane)", Math.abs(incOf(base.st) - 51.6) < 0.5, `inc ${incOf(base.st).toFixed(2)}°, ${(el.periapsisAlt / 1e3).toFixed(0)} × ${(el.apoapsisAlt / 1e3).toFixed(0)} km`);
const g0 = S.dockGeometry(base.st);
// (the docking ring sits 8 m from the orbiter's centre, so where it starts depends on the hand-over attitude)
check("Skip places the station ≈250 m ahead (orbiter on the -V-bar), no relative drift", g0 && Math.abs(g0.axial - DOCK.start) < 15 && g0.lateral < 10 && Math.abs(g0.closing) < 0.02,
  g0 && `axial ${g0.axial.toFixed(1)} m, lateral ${g0.lateral.toFixed(2)} m, closing ${g0.closing.toFixed(3)} m/s`);
check("Checkpoint PROX saved at the start of the approach", base.checkpoints.prox && base._bestCheckpoint() === "prox");
const ck = base.checkpoints.prox;
const fromProx = () => { const m = new ShuttleMission({ variant: "iss" }); m.checkpoints = { prox: ck }; m.command("RETRY_CHECKPOINT", { name: "prox" }); return m; };

// a drift check: with no inputs the geometry stays put for ten minutes
(() => {
  const m = fromProx(); m.advanceSim(600);
  const g = S.dockGeometry(m.st);
  check("Hands off for 10 min: station stays within a few metres (co-orbital)", Math.abs(g.axial - DOCK.start) < 15 && g.lateral < 15, `axial ${g.axial.toFixed(1)} m, lateral ${g.lateral.toFixed(1)} m`);
})();

// ---- follow ONLY the NEXT cue (same key map as the game; one key at a time)
function followCues(m, opts) {
  opts = opts || {};
  const KEY = { Y: ["OPEN_BAY"], H: ["DAP_HOLD"] };
  const AX = { W: ["pitch", -1], S: ["pitch", 1], A: ["roll", -1], D: ["roll", 1], Q: ["yaw", -1], E: ["yaw", 1],
    I: ["ty", 1], K: ["ty", -1], J: ["tx", 1], L: ["tx", -1], U: ["tz", 1], O: ["tz", -1] };
  const seen = new Set(); let lastKey = null, presses = 0, held = 0; const tStart = m.st.t;
  while (!m.failure && !m.result && m.st.t - tStart < 3 * 3600) {
    const sn = m.snapshot(), n = sn.guidance.next, inp = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: 0, brake: 0 };
    seen.add(n.text.replace(/[0-9.]+/g, "#"));
    if (KEY[n.key] && n.key !== lastKey) { m.command(...KEY[n.key]); presses++; }
    if (AX[n.key]) { inp[AX[n.key][0]] = AX[n.key][1]; held++; }
    // rush: once aligned, push in to 0.3 m/s and ignore every "slow the approach" cue (lateral cues still followed)
    if (opts.rush && sn.guidance.dock && m.st.dap.mode === "HOLD" && sn.guidance.dock.misalignDeg < 4) { if (n.key === "K") inp.ty = 0; if (sn.guidance.dock.closing < 0.3) inp.ty = 1; }
    lastKey = KEY[n.key] ? n.key : null;
    m.command("SET_CONTROL_INPUT", inp);
    const far = sn.guidance.dock && sn.guidance.dock.axial > 60 && !AX[n.key];
    m.advanceSim(far ? Math.min(10, m._warpLimit().max) / 60 : 1 / 60);
  }
  return { presses, cues: seen.size, held };
}

(() => {
  const m = fromProx(), t = m.st.t, o = followCues(m), r = m.result;
  const d = r && r.docking;
  check("Following only the NEXT cue docks to the ISS inside the limits (mission ends at docking)", !!(r && r.success && m.phase === "debrief" && m.st.iss.docked),
    r ? `closing ${d.closing.toFixed(3)} m/s, offset ${d.lateral.toFixed(2)} m, misalign ${d.misalignDeg.toFixed(1)}°, roll ${d.rollDeg.toFixed(1)}°, ${((m.st.t - t) / 60).toFixed(1)} min, ${o.presses} presses, ${o.cues} cues, RCS left ${r.rcsLeft.toFixed(0)} kg`
      : (m.failure ? m.failure.reason : "no result"));
  check("Docked result reports the contact numbers", !!(d && d.closing >= DOCK.closeMin && d.closing <= DOCK.closeMax && d.lateral <= DOCK.lateral && d.misalignDeg <= DOCK.misalignDeg));
})();

(() => {
  const m = fromProx(); followCues(m, { rush: true });
  check("Rushing the approach (ignoring 'slow the approach') fails with a too-fast reason", !!(m.failure && /too fast/.test(m.failure.reason)), m.failure ? m.failure.reason : (m.result ? "docked?!" : "no failure"));
  const r = m.command("RETRY_CHECKPOINT");
  check("Retry from PROX after a docking failure", r.accepted && m.phase === "docking" && !m.failure, r.reason);
})();

// placed contacts: aligned in DAP HOLD, 1 m out on the docking axis, closing 0.08 m/s; one thing wrong each
function placedContact(setup) {
  const m = fromProx();
  if (setup.doors !== false) { m.command("OPEN_BAY"); m.advanceSim(50); }
  m.st.dap.mode = "HOLD"; m.st.q = S.dockGeometry(m.st).target; m.st.w = S.orbitRateBody(m.st); m.st.dap.holdRel = null;
  const g = S.dockGeometry(m.st);
  m.st.r = S.vec.add(m.st.r, S.vec.sub(S.vec.add(g.P, S.vec.scl(g.axis, 1.0)), g.D));
  // velocity relative to the station's rotating frame: purely along the axis (add the frame rotation n·H × r)
  const n = S.vec.norm(S.vec.cross(m.st.iss.r, m.st.iss.v)) / S.vec.norm(m.st.iss.r) ** 2;
  m.st.v = S.vec.add(S.vec.add(m.st.iss.v, S.vec.scl(S.vec.cross(g.F.H, S.vec.sub(m.st.r, m.st.iss.r)), n)), S.vec.scl(g.axis, -(setup.closing || 0.08)));
  if (setup.tiltDeg) { const h = setup.tiltDeg / 2 * DEG; m.st.q = S.quat.qmul(m.st.q, [Math.cos(h), Math.sin(h), 0, 0]); m.st.w = S.orbitRateBody(m.st); m.st.dap.holdRel = null; }
  m.command("SET_CONTROL_INPUT", {}); for (let i = 0; i < 60 * 120 && !m.failure && !m.result; i++) m.advanceSim(1 / 60);
  return m;
}
(() => {
  const m = placedContact({ doors: false });
  check("Contact with the bay doors closed fails (docking ring still in the bay)", !!(m.failure && /doors not open/.test(m.failure.reason)), m.failure ? m.failure.reason : "no failure");
  const ok = placedContact({});
  check("Placed nominal contact (aligned, 0.08 m/s, on axis) docks", !!(ok.result && ok.result.success), ok.failure ? ok.failure.reason : "");
})();

(() => {
  const m = placedContact({ tiltDeg: 8 });
  check("Misaligned contact (8°) fails with the misalignment reason", !!(m.failure && /misaligned/.test(m.failure.reason)), m.failure ? m.failure.reason : (m.result ? "docked" : "no contact"));
  const slow = placedContact({ closing: 0.015 });
  check("Too-slow contact (0.015 m/s) fails: capture latches need ≥ 0.03 m/s", !!(slow.failure && /too slow/.test(slow.failure.reason)), slow.failure ? slow.failure.reason : "");
})();

(() => {
  const m = fromProx(); const g = S.dockGeometry(m.st);
  m.st.r = S.vec.add(m.st.r, S.vec.scl(g.axis, -(g.axial - 10))); m.st.iss.range = 10;
  const w = m.command("SET_WARP", { factor: 100 });
  check("100× allowed close to the station too (only the landing is capped)", w.accepted && m.warpReq === 100, w.reason);
  const dep = new ShuttleMission();
  check("Default flight is still the satellite deploy (no station, payload aboard)", dep.variant === "deploy" && dep.st.cfg.payload && !dep.st.iss && dep.snapshot().phases.includes("payload"));
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
