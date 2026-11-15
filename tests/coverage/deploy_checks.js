#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const D = require("../../public/js/coverage/deploy_core.js");
const C = require("../../public/js/coverage/coverage_core.js");
const R = require("../../server/coverage_room.js");
const S = require("../../public/js/game/shuttle_simulation.js");
let passed = 0;
function check(name, run) {
  run();
  passed++;
  console.log("PASS " + name);
}
function command(sim, role, cmd, arg) {
  const result = sim.command(role, cmd, arg);
  assert.ok(result.accepted, cmd + ": " + result.reason);
}
function advance(sim, seconds) {
  const target = sim.st.t + seconds;
  while (sim.st.t < target - 1e-8) sim.advance(Math.min(0.5, (target - sim.st.t) / sim.st.warp));
}
function until(sim, predicate, limit) {
  for (let i = 0; i < limit * 20 && !predicate(); i++) sim.advance(0.05);
  assert.ok(predicate(), "Timed out in " + sim.st.phase);
}
const sim = D.create({ epochMs: Date.UTC(2026, 10, 15, 4) });
check("Solo begins with every deployment interlock engaged", () => {
  assert.equal(sim.st.phase, "brief");
  assert.equal(sim.st.sat.released, false);
  assert.equal(sim.command("all", "DEPLOY").accepted, false);
  command(sim, "all", "BEGIN");
  assert.equal(sim.command("flight", "STEP").accepted, false);
});
check("Crew completes all five load steps before depressurisation", () => {
  for (const step of D.LOAD_STEPS) {
    command(sim, "crew", "STEP");
    assert.equal(sim.command("crew", "STEP").accepted, false);
    advance(sim, step.s + 0.1);
  }
  assert.equal(sim.st.phase, "depress");
  assert.equal(sim.st.al.innerLatched, true);
});
check("Airlock pump, vent, leak check and hatch enforce the procedure", () => {
  assert.equal(sim.command("crew", "OUTER_HATCH").accepted, false);
  command(sim, "crew", "PUMP");
  assert.equal(sim.command("crew", "VENT").accepted, false);
  until(sim, () => sim.st.al.p < 2.2, 1200);
  command(sim, "crew", "PUMP");
  command(sim, "crew", "VENT");
  until(sim, () => sim.st.al.p < 0.2, 100);
  command(sim, "crew", "VENT");
  command(sim, "crew", "LEAK_CHECK");
  assert.equal(sim.command("crew", "OUTER_HATCH").accepted, false);
  advance(sim, D.P.airlock.leakCheckS + 0.1);
  assert.ok(sim.st.al.leakOk && sim.st.al.p < 0.5);
  command(sim, "crew", "OUTER_HATCH");
  assert.equal(sim.command("crew", "TABLE").accepted, false);
  advance(sim, 21);
  command(sim, "crew", "TABLE");
  advance(sim, 41);
  assert.equal(sim.st.phase, "grapple");
  assert.equal(sim.st.violations.length, 0);
});
check("EE camera controls converge without contacts and grapple only at rest", () => {
  assert.equal(sim.command("rms", "GRAPPLE").accepted, false);
  for (let i = 0; i < 2000; i++) {
    const a = sim.st.arm;
    sim.setInput({ x: a.d[0] / 0.03, z: -a.d[2] / 0.03, y: (a.d[1] - 0.06) / 0.03, r: -a.rollDeg, fine: true });
    sim.advance(0.1);
    if (Math.hypot(a.d[0], a.d[2]) < 0.005 && Math.abs(a.d[1] - 0.06) < 0.005 && Math.abs(a.rollDeg) < 0.2) break;
  }
  sim.setInput(null);
  advance(sim, 3);
  command(sim, "rms", "GRAPPLE");
  assert.equal(sim.st.phase, "move");
  assert.equal(sim.st.arm.contacts, 0);
});
check("Arm IK preserves boom lengths throughout unberthing and pointing", () => {
  command(sim, "rms", "MOVE");
  for (let i = 0; i < 181; i++) {
    const a = D.pose(sim.st).arm;
    assert.equal(a.overreach, false);
    assert.ok(Math.abs(Math.hypot(...a.elbow.map((x, j) => x - a.shoulder[j])) - D.G.L1) < 1e-6);
    assert.ok(Math.abs(Math.hypot(...a.wrist.map((x, j) => x - a.elbow[j])) - D.G.L2) < 1e-6);
    advance(sim, 0.5);
  }
  assert.equal(sim.st.phase, "point");
});
check("Pointing, brakes, camera and ordered GO poll gate the release", () => {
  assert.equal(sim.command("flight", "ARM").accepted, false);
  assert.equal(sim.command("flight", "GO", "flight").accepted, false);
  for (let i = 0; i < 1600; i++) {
    const a = sim.st.arm;
    sim.setInput({ x: (a.az - 180) / 2, z: (-45 - a.el) / 2 });
    sim.advance(0.1);
    if (Math.abs(a.az - 180) < 0.1 && Math.abs(a.el + 45) < 0.1) break;
  }
  sim.setInput(null);
  advance(sim, 4);
  command(sim, "rms", "BRAKES");
  assert.ok(sim.st.assess.safe && sim.st.assess.inTol);
  command(sim, "rms", "GO", "rms");
  assert.equal(sim.command("crew", "GO", "crew").accepted, false);
  command(sim, "crew", "CAMERA");
  command(sim, "crew", "GO", "crew");
  until(sim, () => !D.inLos(D.frame(sim.st, sim.st.t).u), 600);
  command(sim, "flight", "GO", "flight");
  command(sim, "flight", "ARM");
  command(sim, "flight", "DEPLOY");
  assert.equal(sim.command("flight", "DEPLOY").accepted, false);
  until(sim, () => sim.st.phase === "drift", 10);
});
check("30-minute inhibit holds deployables, then the CubeSat drifts ahead and below", () => {
  advance(sim, 1798);
  assert.equal(sim.st.sat.antennas, false);
  assert.equal(sim.command("all", "HANDOFF").accepted, false);
  until(sim, () => sim.st.phase === "done", 5);
  assert.equal(sim.st.sat.antennas, true);
  assert.ok(sim.st.done.at30.along > 3000 && sim.st.done.at30.radial < -2000);
  command(sim, "all", "HANDOFF");
  const h = sim.st.handoff;
  assert.ok(h.altKm > 413 && h.altKm < 415 && Math.abs(h.incDeg - 51.64) < 0.01);
  assert.ok(h.eccentricity < 0.001);
  assert.ok(Date.parse(h.epochUtc) >= sim.st.epochMs + (sim.st.sat.relT + D.P.inhibitS) * 1000);
});
check("Release tumble stays gentle at 60x and below the published tip-off limit", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const w = D.create({ seed }).st.sat.w;
    assert.ok(w.every(rate => Math.abs(rate) <= D.P.tipoffDegS));
    assert.ok(Math.hypot(...w) * 60 < 11, "Visible tumble must stay below 11 deg/s at 60x");
  }
});
check("Released CubeSat inherits orbital velocity and its full orbit clears Earth", () => {
  const inertial = D.inertialState(sim.st, sim.st.t, sim.st.sat.p, sim.st.sat.v);
  const orbit = S.elements(inertial.r, inertial.v);
  assert.ok(orbit.bound && orbit.periapsisAlt > 410000 && orbit.apoapsisAlt < 416000);
  assert.ok(Math.hypot(...inertial.v) > 7600);
  assert.ok(Math.abs(orbit.flightPath) < 0.001);
  for (let i = 0; i <= 384; i++) {
    const point = S.keplerPropagate(inertial.r, inertial.v, orbit.period * i / 384).r;
    assert.ok(Math.hypot(...point) - C.R_SPHERE > 410000);
  }
  const f = D.frame(sim.st, sim.st.t);
  const zero = D.inertialState(sim.st, sim.st.t, [0, 0, 0], [0, 0, 0]);
  assert.deepEqual(zero.r, f.r);
  assert.deepEqual(zero.v, f.v);
});
check("14-day prediction distinguishes safe nadir-aft and unsafe directions", () => {
  for (const [az, el, safe, blocked] of [[180, -45, true, false], [180, 0, false, true], [90, 0, false, true], [270, 0, false, true], [0, -90, false, false], [0, 90, false, false], [0, 0, false, false], [180, 45, false, true]]) {
    const st = JSON.parse(JSON.stringify(sim.st));
    st.arm.az = az; st.arm.el = el;
    const a = D.assess(st);
    assert.equal(a.safe, safe, `az ${az} el ${el}: ${a.verdict}`);
    assert.equal(!a.lof.clear, blocked, `line of fire az ${az} el ${el}`);
  }
});
check("CW propagation agrees with the analytic cross-track harmonic", () => {
  const n = D.frame(sim.st, 0).n, t = 1000;
  let state = [10, 0, 0, 0.03, 0, 0];
  for (let i = 0; i < t; i++) state = D.cwStep(state, 1, n, 0);
  assert.ok(Math.abs(state[0] - (10 * Math.cos(n * t) + 0.03 / n * Math.sin(n * t))) < 1e-8);
  const f = D.frame(sim.st, 1234), p = [123, -45, 67];
  const back = D.eciToModel(f, D.modelToEci(f, p));
  assert.ok(Math.hypot(...back.map((x, i) => x - p[i])) < 1e-10);
});
check("Warp limits hold in normal play", () => {
  const s = D.create();
  assert.equal(s.command("all", "WARP", 2000).accepted, false);
  assert.equal(s.command("all", "WARP", 60).accepted, false);
  command(s, "all", "BEGIN");
  command(s, "all", "WARP", 60);
});
check("Two players hold host JEMRMS/flight and guest crew with server enforcement", () => {
  const room = { hostId: "host", players: { host: { name: "Host" }, guest: { name: "Guest" } } };
  const cov = R.createCoverageState("host", null, { deploy: true });
  const request = (id, cmd, arg) => R.applyRequest(cov, room, id, { type: "DEPLOY", cmd, arg });
  const roles = R.deployRoles(room);
  assert.equal(roles.rms.playerId, "host");
  assert.equal(roles.flight.playerId, "host");
  assert.equal(roles.crew.playerId, "guest");
  assert.equal(request("guest", "BEGIN").accepted, false);
  assert.ok(request("host", "BEGIN").accepted);
  assert.equal(request("host", "STEP").accepted, false);
  assert.ok(request("guest", "STEP").accepted);
  assert.equal(R.applyRequest(cov, room, "guest", { type: "DEPLOY_INPUT", input: { x: 1 } }).accepted, false);
  assert.equal(R.applyRequest(cov, room, "host", { type: "CLOCK", op: "play" }).accepted, false);
  assert.equal(request("guest", "SKIP").accepted, false);
  assert.ok(request("host", "SKIP").accepted);
  assert.equal(cov.deploy.active, false);
  assert.equal(cov.deployResult, null);
});
check("Handoff validates the new orbit and preserves ground stations", () => {
  const room = { hostId: "host", players: { host: { name: "Host" } } };
  const cov = R.createCoverageState("host", null, { deploy: true });
  const stations = JSON.stringify(cov.scenario.stations);
  cov.deploy.sim = sim;
  const result = R.applyRequest(cov, room, "host", { type: "DEPLOY", cmd: "HANDOFF" });
  assert.ok(result.accepted);
  assert.equal(cov.deploy.active, false);
  assert.ok(C.validate(cov.scenario).ok);
  assert.equal(cov.scenario.orbit.altKm, sim.st.handoff.altKm);
  assert.equal(JSON.stringify(cov.scenario.stations), stations);
  assert.equal(cov.clock.paused, true);
  assert.ok(cov.deployResult);
});
console.log(`\n${passed} passed, 0 failed`);
