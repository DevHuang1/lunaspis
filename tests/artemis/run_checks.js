#!/usr/bin/env node
/*
 * Artemis expedition focused checks. No DOM, no npm dependencies.
 * Run: node tests/artemis/run_checks.js
 */
"use strict";
const S = require("../../public/js/game/artemis_simulation.js");
const { ArtemisMission, OBJECTIVES } = require("../../public/js/game/artemis_mission.js");
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log("PASS  " + name + (detail ? "  — " + detail : "")); }
  else { fail++; console.error("FAIL  " + name + (detail ? "  — " + detail : "")); }
}
const norm = S.vec.norm;

function toOrbit() {
  const m = new ArtemisMission();
  m.command("START");
  m.advanceSim(510);
  return m;
}
function toArrival() {
  const m = toOrbit();
  const r = m.command("TLI");
  if (!r.accepted) throw new Error("TLI rejected: " + r.reason);
  for (let i = 0; i < 4000 && m.phase === "outbound" && !m.result; i++) m.advanceSim(60);
  return m;
}
function toDocking() {
  const m = toArrival();
  const c = m.command("CAPTURE");
  if (!c.accepted) throw new Error("Capture rejected: " + c.reason);
  const p = m.command("PHASING");
  if (!p.accepted) throw new Error("Phasing rejected: " + p.reason);
  return m;
}
function toLanded() {
  const m = toDocking();
  m.command("AUTO_DOCK");
  for (let i = 0; i < 1200 && m.phase === "docking" && !m.result; i++) m.advanceSim(1);
  m.command("TRANSFER_CREW");
  m.command("UNDOCK");
  m.command("SELECT_SITE", { siteId: "shackleton_rim" });
  m.command("BEGIN_DESCENT");
  m.command("AUTO_LAND");
  for (let i = 0; i < 2000 && m.phase === "descent" && !m.result; i++) m.advanceSim(1);
  return m;
}
function surfaceTasks(m) {
  m.command("EGRESS");
  const ids = Object.keys(m.surface.astronauts);
  const at = (x, z) => { for (const a of Object.values(m.surface.astronauts)) { a.x = x; a.z = z; } };
  at(70, 95); const p = m.command("SURFACE_INTERACT", { actorId: ids[0], target: "photo" });
  at(105, 145); const a = m.command("SURFACE_INTERACT", { actorId: ids[0], target: "sampleA" });
  at(-75, 135); const e = m.command("SURFACE_INTERACT", { actorId: ids[0], target: "experiment" });
  at(-135, 205); const b = m.command("SURFACE_INTERACT", { actorId: ids[0], target: "sampleB" });
  at(0, 0); const end = m.command("END_EVA");
  return { p, a, e, b, end };
}
function finishToSplash(m) {
  m.command("ASCENT");
  for (let i = 0; i < 100 && m.phase === "ascent" && !m.result; i++) m.advanceSim(10);
  m.command("AUTO_DOCK");
  for (let i = 0; i < 1200 && m.phase === "reunion" && !m.result; i++) m.advanceSim(1);
  m.command("TRANSFER_RETURN");
  const t = m.command("TEI");
  for (let i = 0; i < 20000 && m.phase === "return" && !m.paused && !m.result; i++) m.advanceSim(60);
  m.command("ENTRY_PREP");
  for (let i = 0; i < 20000 && m.phase === "entry" && !m.paused && !m.result; i++) m.advanceSim(1);
  if (m.eventHold === "chute") m.command("DEPLOY_CHUTE");
  for (let i = 0; i < 20000 && m.phase === "entry" && !m.result; i++) m.advanceSim(1);
  return { t };
}

// 1. Moon motion and Lambert consistency
(function physics() {
  const a = S.moonState(0), b = S.moonState(86400);
  check("Moon moves on a 27.32-day orbit", norm(S.vec.sub(a.r, b.r)) > 1e7, Math.round(norm(S.vec.sub(a.r, b.r)) / 1e3) + " km in 1 day");
  const r1 = [7000e3, 0, 0], r2 = [0, 8000e3, 0];
  const sol = S.lambert(r1, r2, 1800, S.MU_E, true);
  let r = r1.slice(), v = sol.v1.slice(), t = 0;
  while (t < 1800) { const s = S.rk4(r, v, 1, t, false, S.MU_E); r = s.r; v = s.v; t += 1; }
  check("Lambert departure velocity propagates to the target", norm(S.vec.sub(r, r2)) < 50, norm(S.vec.sub(r, r2)).toFixed(1) + " m");
  const plan = S.planTLI(S.parkingState(510), 510);
  check("TLI transfer has a finite, plausible impulse", !!plan && plan.dvMag > 2500 && plan.dvMag < 4500, plan ? Math.round(plan.dvMag) + " m/s / " + (plan.tof / 86400).toFixed(2) + " d" : "none");
})();

// 2. Full normal mission, automatic assistance
(function fullMission() {
  const m = toOrbit();
  const tli = m.command("TLI");
  check("TLI accepted from a validated parking orbit", tli.accepted, tli.reason || "");
  for (let i = 0; i < 4000 && m.phase === "outbound" && !m.result; i++) m.advanceSim(60);
  check("Lunar arrival gate reached", m.phase === "lunar_arrival", m.phase);
  const cap = m.command("CAPTURE");
  check("Lunar capture sequence accepted", cap.accepted, cap.reason || "");
  const rel = S.moonRelative(m.orion.r, m.orion.v, m.t);
  const el = S.moonElements(rel.r, rel.v);
  check("Captured lunar orbit is bound above the surface", el.bound && el.periapsisAlt > 50e3 && el.apoapsisAlt < 300e3, Math.round(el.periapsisAlt / 1000) + " × " + Math.round(el.apoapsisAlt / 1000) + " km");
  check("Orion propellant remains for return after capture", m.orion.prop > 0, Math.round(m.orion.prop) + " kg");
  m.command("PHASING");
  m.command("AUTO_DOCK");
  for (let i = 0; i < 1200 && m.phase === "docking" && !m.result; i++) m.advanceSim(1);
  check("Assisted docking reaches hard capture", m.phase === "transfer" && m.docking.docked, m.phase + " range " + m.docking.range.toFixed(2));
  m.command("TRANSFER_CREW"); m.command("UNDOCK");
  m.command("SELECT_SITE", { siteId: "shackleton_rim" });
  m.command("BEGIN_DESCENT"); m.command("AUTO_LAND");
  for (let i = 0; i < 2000 && m.phase === "descent" && !m.result; i++) m.advanceSim(1);
  check("Powered descent reaches a stable touchdown", m.phase === "landed" && !m.result, m.result && m.result.failure ? m.result.failure.reason : m.phase);
  check("Descent and ascent reserves remain after landing", m.lander.descentProp > 0 && m.lander.ascentProp > 0, Math.round(m.lander.descentProp) + " / " + Math.round(m.lander.ascentProp) + " kg");
  const tasks = surfaceTasks(m);
  check("Both EVA task sequences complete", tasks.p.accepted && tasks.a.accepted && tasks.e.accepted && tasks.b.accepted && tasks.end.accepted, JSON.stringify(m.surface.tasks));
  check("Samples and photographs are recorded once", m.surface.samples === 2 && m.surface.photos === 1, "samples " + m.surface.samples + " photos " + m.surface.photos);
  finishToSplash(m);
  check("Normal expedition ends with successful splashdown", m.result && m.result.success && m.phase === "splashdown", m.result ? JSON.stringify({ success: m.result.success, abort: m.result.abort, failure: m.result.failure }) : "no result");
  check("Debrief opens only after splashdown", m.command("DEBRIEF").accepted && m.phase === "debrief", m.phase);
})();

// 3. Missing input changes the landing outcome
(function absentLandingInput() {
  const m = toLanded();
  m.command("RETRY_CHECKPOINT", { name: "landed" });
  // Remove the automatic landing assist and rebuild the descent from the landed checkpoint.
  m.phase = "descent"; m.descent.active = false; m.autoLand = false; m.result = null; m.failure = null; m.paused = false;
  m.command("BEGIN_DESCENT");
  for (let i = 0; i < 1000 && m.phase === "descent" && !m.result; i++) m.advanceSim(1);
  check("No throttle input cannot complete the final descent", !(m.result && m.result.success), m.result && m.result.failure ? m.result.failure.reason : "still descending / no result");
})();

// 4. Missing input does not auto-dock
(function absentDockingInput() {
  const m = toDocking();
  for (let i = 0; i < 500 && m.phase === "docking" && !m.result; i++) m.advanceSim(1);
  check("No docking input does not reach hard capture", m.phase === "docking" && !m.docking.docked, m.phase + " range " + m.docking.range.toFixed(1));
})();

// 5. Checkpoint restore preserves resources and does not duplicate samples
(function checkpoint() {
  const m = toLanded();
  const fuel = m.lander.descentProp;
  const r = m.command("RETRY_CHECKPOINT", { name: "landed" });
  check("Landed checkpoint restores phase and lander resources", r.accepted && m.phase === "landed" && Math.abs(m.lander.descentProp - fuel) < 1e-6, "fuel " + m.lander.descentProp.toFixed(0) + " kg");
  check("Checkpoint restore does not duplicate samples", m.surface.samples === 0, "samples " + m.surface.samples);
})();

// 6. Safe abort-return is distinct from full success
(function abort() {
  const m = toOrbit();
  const a = m.command("ABORT");
  check("Abort-return is accepted in Earth orbit", a.accepted, a.reason || "");
  m.command("ENTRY_PREP");
  for (let i = 0; i < 20000 && m.phase === "entry" && !m.result && !m.paused; i++) m.advanceSim(1);
  if (m.eventHold === "chute") m.command("DEPLOY_CHUTE");
  for (let i = 0; i < 20000 && m.phase === "entry" && !m.result; i++) m.advanceSim(1);
  check("Abort ends with a safe splashdown but not mission success", m.result && m.result.abort && !m.result.success, m.result ? JSON.stringify({ abort: m.result.abort, success: m.result.success }) : "no result");
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
