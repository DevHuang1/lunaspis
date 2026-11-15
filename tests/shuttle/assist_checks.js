#!/usr/bin/env node
/* Landing assist (default ON): a crew that does nothing in the approach still lands on the runway, and
 * gentle; with the assist OFF the same hands-off approach does not. Run: node tests/shuttle/assist_checks.js */
"use strict";
const S = require("../../public/js/game/shuttle_simulation.js");
const { ShuttleMission } = require("../../public/js/game/shuttle_mission.js");
const { createPilot, fly } = require("./pilot.js");
let pass = 0, fail = 0;
const check = (n, c, d) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  — " + d : ""}`); };
const base = new ShuttleMission(); fly(base, createPilot(), { stopPhase: "approach" });
check("Scripted flight reaches the approach", base.phase === "approach", base.failure && base.failure.reason);
const ck = base.checkpoints.approach;
function handsOff(assist, offsetDeg) {
  const m = new ShuttleMission(); m.checkpoints = { approach: ck }; m.command("RETRY_CHECKPOINT", { name: "approach" });
  if (!assist) m.command("TOGGLE_AOA_ASSIST");
  if (offsetDeg) { m.st.flight.gammaHold = (m.st.flight.gammaHold || 0) + offsetDeg * S.DEG; m.st.flight.sigma += 15 * S.DEG; }   // start disturbed
  m.command("SET_CONTROL_INPUT", { pitch: 0, roll: 0, yaw: 0, sb: 0, brake: 0 });
  for (let i = 0; i < 60 * 1200 && !m.failure && (m.phase === "approach" || m.phase === "rollout"); i++) m.advanceSim(1 / 60);
  return m;
}
for (const off of [0, 6, -6]) {
  const m = handsOff(true, off), td = m.touchdown;
  check(`Hands-off with the landing assist lands and stops on the runway (start disturbed ${off}° glide, 15° bank)`, !!(m.result && m.result.success && td && td.ok),
    td ? `sink ${td.sink.toFixed(2)} m/s, ${td.x.toFixed(0)} m past threshold, ${td.y.toFixed(1)} m off centreline, stopped ${m.result ? m.result.stopX.toFixed(0) : "-"} m, ${m.failure ? m.failure.reason : ""}` : (m.failure ? m.failure.reason : m.phase));
}
const off = handsOff(false, 0);
check("Hands-off with the assist OFF does not land (the assist is what flew it)", !(off.touchdown && off.touchdown.ok), off.failure ? off.failure.reason : off.phase);
// taking over: a pilot pushing the nose down for 4 s, then letting go, is caught by the assist again
const m = new ShuttleMission(); m.checkpoints = { approach: ck }; m.command("RETRY_CHECKPOINT", { name: "approach" });
m.command("SET_CONTROL_INPUT", { pitch: -1 }); m.advanceSim(4); m.command("SET_CONTROL_INPUT", { pitch: 0 });
for (let i = 0; i < 60 * 900 && !m.failure && m.phase === "approach"; i++) m.advanceSim(1 / 60);
check("Pilot input takes over, and letting go hands back to the assist (still lands)", m.phase === "rollout" && m.touchdown && m.touchdown.ok, m.failure ? m.failure.reason : (m.touchdown ? `sink ${m.touchdown.sink.toFixed(2)}` : m.phase));
console.log(`\n${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
