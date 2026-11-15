#!/usr/bin/env node
/*
 * Artemis II Crewed Lunar Flyby — focused automated verification suite.
 * Verifies orbital mechanics, free-return trajectory continuity, all 13 mission
 * phases, interactive controls, proximity operations, lunar far-side occultation
 * blackout, atmospheric skip entry, 11-parachute deployment, Pacific splashdown,
 * crew recovery, checkpoint restoration, and abort handling.
 *
 * Run: node tests/artemis/run_checks.js
 */
"use strict";
const S = require("../../public/js/game/artemis_simulation.js");
const { ArtemisMission, PHASES, OBJECTIVES } = require("../../public/js/game/artemis_mission.js");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("PASS  " + name + (detail ? "  — " + detail : ""));
  } else {
    fail++;
    console.error("FAIL  " + name + (detail ? "  — " + detail : ""));
  }
}
const norm = S.vec.norm;

// 1. Orbital mechanics, SLS ascent profile, HEO burn & Free-Return Trajectory
(function testPhysics() {
  const a = S.moonState(0);
  const b = S.moonState(86400);
  check("Moon moves on a 27.32-day inclined orbit", norm(S.vec.sub(a.r, b.r)) > 1e7, Math.round(norm(S.vec.sub(a.r, b.r)) / 1e3) + " km in 1 day");

  const r1 = [7000e3, 0, 0];
  const r2 = [0, 8000e3, 0];
  const sol = S.lambert(r1, r2, 1800, S.MU_E, true);
  let r = r1.slice();
  let v = sol.v1.slice();
  let t = 0;
  while (t < 1800) {
    const s = S.rk4(r, v, 1, t, false, S.MU_E);
    r = s.r;
    v = s.v;
    t += 1;
  }
  check("Lambert departure velocity propagates to target", norm(S.vec.sub(r, r2)) < 50, norm(S.vec.sub(r, r2)).toFixed(1) + " m");

  const pre = S.ascentProfile(-6);
  const srb = S.ascentProfile(60);
  const meco = S.ascentProfile(510);
  check(
    "SLS ascent profile models RS-25 ramp, 8.8M lbs SRB liftoff & 200 km orbit insertion",
    pre.rs25 && !pre.srbActive && srb.thrustMlbs === 8.8 && Math.abs(norm(meco.r) - (S.RE + 200000)) < 50,
    `T-6s=${pre.thrustMlbs.toFixed(2)}M lbs, T+60s=${srb.thrustMlbs}M lbs, T+510s alt=${Math.round((norm(meco.r) - S.RE) / 1000)} km`
  );

  const park = S.parkingState(510);
  const plan = S.planTLI(park, 510);
  check(
    "Free-return TLI from LEO has physically consistent tangential impulse (~3,143 m/s)",
    !!plan && S.tliFeasible(plan) && plan.dvMag > 2900 && plan.dvMag < 3400,
    plan ? `${Math.round(plan.dvMag)} m/s / ${(plan.tofOut / 86400).toFixed(1)} d` : "none"
  );

  const sPeri = S.freeReturnStateAt(plan, plan.tPerilune);
  const sEntry = S.freeReturnStateAt(plan, plan.tEntry);
  check(
    "Free-return perilune passes ~7,400 km (~4,598 mi) behind Moon in radio blackout",
    Math.abs(sPeri.lunarAlt - S.FLYBY_ALT) < 100 && sPeri.occultation.blackout === true,
    `lunarAlt=${Math.round(sPeri.lunarAlt / 1000)} km (${Math.round((sPeri.lunarAlt / 1000) * 0.621371)} mi), blackout=${sPeri.occultation.blackout}`
  );
  check(
    "Free-return trajectory arrives at Earth Entry Interface (121.92 km) at ~11.0 km/s (~24,600 mph)",
    Math.abs(sEntry.earthAlt - S.ENTRY_ALT) < 50 && norm(sEntry.v) > 10800 && norm(sEntry.v) < 11300,
    `alt=${(sEntry.earthAlt / 1000).toFixed(2)} km, speed=${Math.round(norm(sEntry.v))} m/s (${Math.round(norm(sEntry.v) * 2.236936)} mph)`
  );
})();

// 2. Complete 13-Phase Artemis II Mission Playthrough
(function testFull13PhaseMission() {
  const m = new ArtemisMission();
  check("All 13 mission objectives are registered", OBJECTIVES.length === 13 && PHASES.length >= 13, `${OBJECTIVES.length} objectives`);

  // Phase 1: Briefing & Crew Preparation
  check("Starts in Phase 1 (briefing)", m.phase === "briefing" && m.snapshot().phaseNumber === 1, m.phase);
  check("Crew readiness check accepted", m.command("CREW_CHECK").accepted && m.flags.crewReady);
  check("Spacecraft & SLS status check accepted", m.command("SPACECRAFT_CHECK").accepted && m.flags.spacecraftChecked);
  check("Launch authorization advances to Phase 2 (launch_prep)", m.command("START").accepted && m.phase === "launch_prep" && m.obj.briefing_prep === "done", m.phase);

  // Phase 2: Crew Transport & Pad 39B Preparation
  check("Commit launch rejected before crew ingress & cryo load", !m.command("COMMIT_LAUNCH").accepted);
  check("Crew Astrovan transport & White Room ingress accepted", m.command("CREW_INGRESS").accepted && m.flags.crewIngress);
  check("SLS cryogenic propellant loading accepted", m.command("LOAD_PROPELLANT").accepted && m.launch.propLoadPct === 100);
  check("Commit launch starts T-15s countdown in Phase 3 (launch)", m.command("COMMIT_LAUNCH").accepted && m.phase === "launch" && m.launch.elapsed === -15, `phase=${m.phase}, T=${m.launch.elapsed}s`);

  // Phase 3: SLS Launch & Ascent (-15s to +510s = 525s total)
  m.advanceSim(525);
  check(
    "SLS ascent executes ROFI, RS-25, Liftoff, SRB sep, Fairing/LAS jettison, Core sep & reaches Phase 4 (earth_orbit)",
    m.phase === "earth_orbit" && m.flags.rofi && m.flags.rs25 && m.flags.launchLiftoff && m.flags.srbSep && m.flags.fairingSep && m.flags.lasJettison && m.flags.meco && m.flags.coreSep && m.obj.launch === "done",
    `phase=${m.phase}, stage=${m.launch.stage}`
  );

  // Phase 4: Earth Orbit, Solar Arrays, HEO Burn & 24h Checkout
  check("Solar array deployment accepted in Earth orbit", m.command("DEPLOY_SOLAR_ARRAYS").accepted && m.flags.solarArrays);
  check("Initial Earth-orbit systems checkout accepted", m.command("CHECKOUT").accepted && m.flags.checkout);
  m.advanceSim(5400); // 90-minute initial orbit coast
  check("ICPS High Earth Orbit (HEO) raise burn accepted", m.command("HEO_BURN").accepted && m.flags.heoBurn, `${m.orbitState.periapsisAltKm} x ${m.orbitState.apoapsisAltKm} km`);
  m.advanceSim(86400); // 24-hour HEO systems checkout coast
  check("24-hour HEO systems check accepted", m.command("ORION_CHECK").accepted && m.flags.orionCheck);
  check("ICPS separation transitions to Phase 5 (prox_ops)", m.command("SEPARATE_ICPS").accepted && m.phase === "prox_ops" && !m.icps.attached && m.obj.earth_checkout === "done", m.phase);

  // Phase 5: Proximity Operations Demonstration
  check("Proximity exit rejected before approaching ICPS target", !m.command("CONFIRM_PROX_EXIT").accepted);
  const proxStart = m.prox.range;
  m.command("PROX_APPROACH");
  let maxStep = 0;
  let prevPos = m.prox.pos.slice();
  for (let i = 0; i < 600 && !m.prox.inspected; i++) {
    m.advanceSim(1);
    const step = norm(S.vec.sub(m.prox.pos, prevPos));
    maxStep = Math.max(maxStep, step);
    prevPos = m.prox.pos.slice();
  }
  check("Approaching <=38 m of ICPS completes close-inspection check", m.prox.inspected && m.prox.range <= 38, `range=${m.prox.range.toFixed(1)} m`);
  check(
    "Proximity approach is continuous translation, not a position teleport",
    maxStep <= 6.0 && m.prox.range < proxStart,
    `max displacement per 1 s step=${maxStep.toFixed(2)} m (${proxStart.toFixed(0)} m -> ${m.prox.range.toFixed(1)} m)`
  );
  m.command("PROX_RETREAT");
  for (let i = 0; i < 600 && !m.prox.retreated; i++) m.advanceSim(1);
  check("Backing away >=85 m from ICPS achieves safe separation", m.prox.retreated && m.prox.range >= 85, `range=${m.prox.range.toFixed(1)} m`);
  check("Confirming Proximity Ops transitions to Phase 6 (tli_prep)", m.command("CONFIRM_PROX_EXIT").accepted && m.phase === "tli_prep" && m.obj.prox_ops === "done", m.phase);

  // Phase 6: Trans-Lunar Injection (TLI)
  m.advanceSim(3600);
  check("Verify TLI maneuver accepted", m.command("VERIFY_TLI").accepted && m.flags.tliVerified);
  const tli = m.command("TLI");
  check("TLI burn accepted and transitions to Phase 7 (outbound)", tli.accepted && m.phase === "outbound" && m.obj.tli === "done", `prop remaining=${Math.round(m.orion.prop)} kg`);

  // Phase 7: Outbound Deep-Space Cruise (~3.6 days)
  check("Deep-space systems check accepted during outbound cruise", m.command("ORION_CHECK").accepted && m.flags.outboundCheck);
  check("Radiation shelter drill accepted during outbound cruise", m.command("RADIATION_DRILL").accepted && m.flags.radiationDrill);
  check("Outbound trajectory trim accepted", m.command("TRAJECTORY_TRIM").accepted && m.flags.outboundTrim);
  for (let i = 0; i < 6000 && m.phase === "outbound" && !m.result; i++) m.advanceSim(60);
  check("Outbound coast reaches Lunar Flyby Entry Gate (Phase 8 lunar_flyby)", m.phase === "lunar_flyby" && m.obj.outbound_cruise === "done", m.phase);

  // Phase 8: Lunar Far-Side Flyby & Communications Blackout
  m.paused = false;
  m.eventHold = null;
  let sawBlackout = false;
  for (let i = 0; i < 3000 && m.phase === "lunar_flyby" && !m.flyby.blackoutCleared; i++) {
    m.advanceSim(15);
    if (m.flyby.inBlackout) sawBlackout = true;
  }
  check("Orion enters expected communications blackout behind lunar far side and restores AOS", sawBlackout && m.flyby.blackoutEntered && m.flyby.blackoutCleared && m.flyby.perilunePassed, `closest=${Math.round(m.flyby.closestAltKm)} km, blackoutMin=${(m.flyby.blackoutDuration / 60).toFixed(1)}`);
  check("Lunar far-side observation & photography accepted", m.command("LUNAR_OBSERVATION").accepted && m.flyby.lunarObserved && m.telemetry.photos >= 2);
  check("Confirming flyby exit transitions to Phase 9 (return_coast)", m.command("CONFIRM_FLYBY_EXIT").accepted && m.phase === "return_coast" && m.obj.lunar_flyby === "done", m.phase);

  // Phase 9: Free-Return Journey to Earth (~3.6 days)
  check("Return systems check accepted", m.command("RETURN_CHECK").accepted && m.flags.returnCheck);
  check("Return trajectory trim accepted", m.command("RETURN_TRIM").accepted && m.flags.returnTrim);
  for (let i = 0; i < 6000 && m.phase === "return_coast" && !m.result; i++) m.advanceSim(60);
  check("Free-return trajectory reaches Earth Entry Interface (Phase 10 entry)", m.phase === "entry" && m.obj.return_coast === "done", `alt=${(m.entry.alt / 1000).toFixed(1)} km, speed=${Math.round(m.entry.speed)} m/s`);

  // Phase 10: Service Module Separation & Atmospheric Entry
  check("Service Module separation accepted at Entry Interface", m.command("SEPARATE_SM").accepted && m.entry.smSeparated);
  check("Heat-shield orientation & entry prep accepted", m.command("ENTRY_PREP").accepted && m.entry.ready);
  for (let i = 0; i < 2000 && m.phase === "entry" && !m.result; i++) m.advanceSim(1);
  check(
    "Atmospheric skip-entry survives ~5,000°F peak heating and ~4G load and reaches Phase 11 (chutes)",
    m.phase === "chutes" && m.obj.entry === "done" && m.entry.maxTempF > 4200 && m.entry.maxG >= 3.5 && m.entry.maxG <= 4.3,
    `maxTemp=${Math.round(m.entry.maxTempF)}°F, maxG=${m.entry.maxG.toFixed(2)}G`
  );

  // Phase 11: 11-Parachute Deployment Sequence
  check("3 Forward Bay Cover + 2 Drogue parachutes deploy at ~25,000 ft (5/11 chutes)", m.command("DEPLOY_DROGUES").accepted && m.chutes.totalDeployed === 5);
  for (let i = 0; i < 500 && m.phase === "chutes" && !m.paused && !m.result; i++) m.advanceSim(1);
  check("3 Pilot + 3 Main parachutes deploy at ~9,000 ft (11/11 chutes)", m.command("DEPLOY_MAINS").accepted && m.chutes.totalDeployed === 11);
  for (let i = 0; i < 1000 && m.phase === "chutes" && !m.result; i++) m.advanceSim(1);
  check(
    "Orion splashes down in the Pacific Ocean below 20 mph (Phase 12 splashdown)",
    m.phase === "splashdown" && m.obj.chutes === "done" && m.splashdownState.splashed && m.splashdownState.speedMph < 20,
    `speed=${m.splashdownState.speedMph.toFixed(1)} mph (${m.splashdownState.speedMps.toFixed(1)} m/s)`
  );

  // Phase 12: Pacific Ocean Splashdown
  check("Capsule stabilization & CMUS upright airbags inflation accepted", m.command("STABILIZE_CAPSULE").accepted && m.splashdownState.uprightBags);
  check("Crew safety confirmation transitions to Phase 13 (recovery)", m.command("CONFIRM_CREW_SAFE").accepted && m.phase === "recovery" && m.obj.splashdown === "done", m.phase);

  // Phase 13: Crew Recovery & Mission Debrief
  check("Inflatable front porch deployment accepted", m.command("DEPLOY_FRONT_PORCH").accepted && m.recoveryState.frontPorch);
  check("Helicopter crew extraction & ship recovery completes mission with success", m.command("HELICOPTER_EXTRACTION").accepted && m.result && m.result.success && m.obj.recovery === "done", JSON.stringify({ success: m.result.success, objectives: m.result.completedObjectives.length }));
  check("Debrief opens cleanly after recovery", m.command("DEBRIEF").accepted && m.phase === "debrief", m.phase);
})();

// 3. Assisted Proximity Operations autopilot & Checkpoint restoration
(function testProxAssistAndCheckpoints() {
  const m = new ArtemisMission();
  m.command("START", { skipPrep: true });
  m.advanceSim(525);
  m.command("DEPLOY_SOLAR_ARRAYS");
  m.command("CHECKOUT");
  m.command("HEO_BURN");
  m.command("SEPARATE_ICPS");
  m.command("AUTO_PROX");
  for (let i = 0; i < 600 && !(m.prox.inspected && m.prox.retreated); i++) m.advanceSim(1);
  check("Assisted Proximity Operations approaches <=38m and retreats >=85m", m.prox.inspected && m.prox.retreated, `min=${m.prox.minRange.toFixed(1)}m, final=${m.prox.range.toFixed(1)}m`);

  const propBefore = m.orion.prop;
  m.command("CONFIRM_PROX_EXIT");
  m.command("VERIFY_TLI");
  m.command("TLI");
  const restore = m.command("RETRY_CHECKPOINT", { name: "prox_ops" });
  check("Checkpoint restore recovers exact phase and propellant state", restore.accepted && m.phase === "prox_ops" && Math.abs(m.orion.prop - propBefore) < 1e-6, `phase=${m.phase}, prop=${Math.round(m.orion.prop)} kg`);
})();

// 4. Missing entry preparation / parachute deployment failure guards & Safe Abort
(function testFailureGuardsAndAbort() {
  const m = new ArtemisMission();
  m.command("START", { skipPrep: true });
  m.advanceSim(525);
  const ab = m.command("ABORT");
  check("Emergency abort in Earth orbit transitions to entry interface", ab.accepted && m.phase === "entry" && m.returnAbort);
  m.command("SEPARATE_SM");
  m.command("ENTRY_PREP");
  for (let i = 0; i < 2000 && m.phase === "entry" && !m.result; i++) m.advanceSim(1);
  m.command("DEPLOY_DROGUES");
  for (let i = 0; i < 500 && m.phase === "chutes" && !m.paused; i++) m.advanceSim(1);
  m.command("DEPLOY_MAINS");
  for (let i = 0; i < 1000 && m.phase === "chutes" && !m.result; i++) m.advanceSim(1);
  check("Emergency abort completes with safe splashdown", m.phase === "splashdown" && m.splashdownState.splashed);
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
