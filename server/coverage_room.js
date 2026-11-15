/*
 * coverage_room.js — shared-session authority for the CubeSat Contact Coverage mission.
 *
 * The server owns the scenario, its revision, who may edit it, and the simulation clock. It does NOT
 * propagate orbits: every client computes the forecast from the identical scenario (with any real
 * orbital element record embedded), so results agree; clients report a forecast hash to detect desync.
 */
"use strict";
const C = require("../public/js/coverage/coverage_core.js");
const DC = require("../public/js/coverage/deploy_core.js");

const RATES = [1, 10, 60, 300, 1000];

function createCoverageState(hostId, scenario, opts) {
  opts = opts || {};
  const scn = scenario && C.validate(scenario).ok ? C.normalize(scenario) : C.defaultSandbox(Date.now());
  const cov = { scenario: scn, revision: 1, editorId: hostId, clock: { simT: 0, wallRef: Date.now(), rate: 60, paused: true }, hashes: {}, desync: false, deploy: null, deployResult: null };
  // The session opens with the CubeSat still inside the ISS: deployment from Kibo (deploy_core.js), unless skipped.
  if (opts.deploy) cov.deploy = { active: true, sim: DC.create({ epochMs: Date.now(), testHooks: !!opts.testHooks }), inputs: {}, lastAssessRev: -1 };
  return cov;
}

// ------------------------------------------------------------------ ISS deployment (co-op consoles)
/** Console owners: 1 player holds all; 2 → host JEMRMS + flight, guest crew; 3+ → host JEMRMS, 2nd crew, 3rd flight. */
function deployRoles(room) {
  const ids = Object.keys(room.players);
  const order = [room.hostId, ...ids.filter((id) => id !== room.hostId)].filter((id) => room.players[id]);
  const pick = (i) => order[Math.min(i, order.length - 1)] || null;
  const map = order.length >= 3 ? { rms: pick(0), crew: pick(1), flight: pick(2) } : order.length === 2 ? { rms: pick(0), crew: pick(1), flight: pick(0) } : { rms: pick(0), crew: pick(0), flight: pick(0) };
  const out = {};
  for (const r of DC.ROLES) { const id = map[r], p = id && room.players[id]; out[r] = { playerId: id, name: p ? p.name : null }; }
  return out;
}
function deploySnapshot(cov, room, withAssess) {
  if (!cov.deploy) return null;
  const sim = cov.deploy.sim, snap = sim.snapshot(withAssess);
  snap.active = cov.deploy.active; snap.roles = deployRoles(room); snap.serverNow = Date.now();
  return snap;
}
/** Advance the deployment simulation; uses only the JEMRMS console owner's hand-controller input. */
function tickDeploy(cov, room, dt) {
  const d = cov.deploy; if (!d || !d.active) return [];
  const roles = deployRoles(room), inp = d.inputs[roles.rms.playerId];
  d.sim.setInput(inp && Date.now() - inp.at < 1500 ? inp.v : null);
  return d.sim.advance(dt);
}
function finishDeploy(cov, handoff) {
  const d = cov.deploy; if (!d) return;
  d.active = false;
  const now = Date.now();
  if (handoff) {
    const prev = cov.scenario, h = handoff, sim = d.sim;
    const next = Object.assign({}, prev, {
      mode: "sandbox", title: "CubeSat deployed from the ISS (J-SSOD)", epochUtc: h.epochUtc,
      orbit: { type: "circular", altKm: h.altKm, incDeg: h.incDeg, nodeLonDeg: h.nodeLonDeg, phaseDeg: h.phaseDeg },
      pins: [], edited: false,
    });
    delete next.derivedFrom;
    const v = C.validate(next);
    if (v.ok) {
      cov.scenario = C.normalize(next); cov.revision++; cov.hashes = {}; cov.desync = false;
      cov.clock = { simT: 0, wallRef: now, rate: cov.clock.rate, paused: true };
      cov.deployResult = { handoff: h, done: sim.st.done, violations: sim.st.violations.slice(), releaseUtc: h.releaseUtc };
    }
  }
}

function clockNow(cov, now) {
  const c = cov.clock, H = C.horizonSecondsQuick(cov.scenario);
  if (c.paused) return Math.min(c.simT, H);
  return Math.min(H, c.simT + c.rate * (now - c.wallRef) / 1000);
}
// fold elapsed time into simT so a new rate/pause applies from "now"
function settle(cov, now) {
  const H = C.horizonSecondsQuick(cov.scenario);
  cov.clock.simT = clockNow(cov, now);
  cov.clock.wallRef = now;
  if (cov.clock.simT >= H) { cov.clock.simT = H; cov.clock.paused = true; }
}

function publicState(cov, room) {
  const now = Date.now();
  settle(cov, now);
  const ed = Object.prototype.hasOwnProperty.call(room.players, cov.editorId) ? room.players[cov.editorId] : null;
  return { revision: cov.revision, pinsRev: cov.pinsRev || 0, scenario: cov.scenario, editorId: cov.editorId, editorName: ed ? ed.name : null,
           clock: { ...cov.clock }, serverNow: now, desync: cov.desync,
           deployActive: !!(cov.deploy && cov.deploy.active), deployResult: cov.deployResult };
}

/** Apply a client request. Returns { accepted, reason?, changed: "scenario"|"clock"|"editor"|null }. */
function applyRequest(cov, room, socketId, req) {
  req = req || {};
  const now = Date.now();
  const isEditor = socketId === cov.editorId, isHost = socketId === room.hostId;
  const deploying = !!(cov.deploy && cov.deploy.active);
  if (deploying && ["SET_SCENARIO", "SET_PINS", "CLOCK"].includes(req.type)) return { accepted: false, reason: "The CubeSat is still on the ISS — finish or skip the deployment first" };
  switch (req.type) {
    case "DEPLOY_INPUT": {
      if (!deploying) return { accepted: true, changed: null };
      const roles = deployRoles(room);
      if (roles.rms.playerId !== socketId) return { accepted: false, reason: "Only the JEMRMS operator flies the arm" };
      cov.deploy.inputs[socketId] = { v: req.input || {}, at: now };
      return { accepted: true, changed: null };
    }
    case "DEPLOY": {
      if (!deploying) return { accepted: false, reason: "No deployment in progress" };
      const sim = cov.deploy.sim, cmd = String(req.cmd || "");
      if (cmd === "SKIP") {
        if (!isHost && !isEditor) return { accepted: false, reason: "Only the host can skip the deployment" };
        finishDeploy(cov, null); return { accepted: true, changed: "deploy-end" };
      }
      if (cmd === "HANDOFF" && !isHost && !isEditor) return { accepted: false, reason: "The host starts the coverage phase" };
      const roles = deployRoles(room), mine = DC.ROLES.filter((r) => roles[r].playerId === socketId);
      // a command acts for the caller's consoles; GO names its console explicitly
      let role = mine.length === DC.ROLES.length ? "all" : null;
      if (!role) {
        const needs = { STEP: "crew", PUMP: "crew", VENT: "crew", LEAK_CHECK: "crew", OUTER_HATCH: "crew", TABLE: "crew", CAMERA: "crew", GRAPPLE: "rms", MOVE: "rms", BRAKES: "rms", ARM: "flight", DEPLOY: "flight", WARP: "flight", BEGIN: "flight", HANDOFF: "flight" };
        const need = cmd === "GO" ? req.arg : needs[cmd];
        if (cmd === "WARP" || cmd === "BEGIN" || cmd === "HANDOFF") role = isHost || mine.includes("flight") ? "all" : null;
        else role = need && mine.includes(need) ? need : (mine[0] || "observer");
      }
      if (!role) return { accepted: false, reason: "The flight director controls that" };
      const r = sim.command(role, cmd, req.arg);
      if (!r.accepted) return { accepted: false, reason: r.reason, changed: "deploy" };
      if (cmd === "HANDOFF") { finishDeploy(cov, sim.st.handoff); return { accepted: true, changed: "deploy-end" }; }
      return { accepted: true, changed: "deploy" };
    }
    case "SET_SCENARIO": {
      if (!isEditor) return { accepted: false, reason: "Only the editor can change the scenario" };
      const v = C.validate(req.scenario);
      if (!v.ok) return { accepted: false, reason: v.errors.map((e) => `${e.field}: ${e.msg}`).slice(0, 5).join("; ") };
      const next = C.normalize(req.scenario), prev = cov.scenario;
      // Station / pin edits keep the clock running; a new orbit, start time or window restarts from T+0.
      const timing = (x) => JSON.stringify([x.mode, x.orbit, x.epochUtc, x.horizon]);
      const keepClock = timing(next) === timing(prev);
      settle(cov, now);
      cov.scenario = next;
      cov.revision++; cov.hashes = {}; cov.desync = false;
      if (!keepClock) { cov.clock = { simT: 0, wallRef: now, rate: cov.clock.rate, paused: true }; cov.scenario.pins = []; }   // pins are moments of the old orbit
      return { accepted: true, changed: "scenario", keptClock: keepClock };
    }
    case "SET_PINS": {
      if (!isEditor) return { accepted: false, reason: "Only the editor can place pins" };
      const pins = req.pins, H = C.horizonSecondsQuick(cov.scenario);
      if (!Array.isArray(pins) || pins.length > C.LIMITS.pins) return { accepted: false, reason: `At most ${C.LIMITS.pins} pins` };
      const test = Object.assign({}, cov.scenario, { pins });
      const v = C.validate(test); if (!v.ok) return { accepted: false, reason: v.errors[0].msg };
      if (pins.some((p) => p.t > H)) return { accepted: false, reason: "Pins must lie inside the prediction window" };
      cov.scenario.pins = pins.map((p) => ({ id: p.id, name: String(p.name).trim(), t: +p.t }));
      cov.pinsRev = (cov.pinsRev || 0) + 1;
      return { accepted: true, changed: "clock" };
    }
    case "CLOCK": {
      if (!isEditor) return { accepted: false, reason: "Only the editor controls time" };
      settle(cov, now);
      const H = C.horizonSecondsQuick(cov.scenario);
      if (req.op === "play") { if (cov.clock.simT >= H) return { accepted: false, reason: "End of the prediction window — replay or extend it" }; cov.clock.paused = false; }
      else if (req.op === "pause") cov.clock.paused = true;
      else if (req.op === "rate") { if (!RATES.includes(req.value)) return { accepted: false, reason: "Unknown playback rate" }; cov.clock.rate = req.value; }
      else if (req.op === "seek") { if (typeof req.value !== "number" || !isFinite(req.value)) return { accepted: false, reason: "Bad time" }; cov.clock.simT = Math.max(0, Math.min(H, req.value)); }
      else if (req.op === "replay") { cov.clock.simT = 0; cov.clock.paused = false; }
      else return { accepted: false, reason: "Unknown clock operation" };
      cov.clock.wallRef = now;
      return { accepted: true, changed: "clock" };
    }
    case "SET_EDITOR": {
      if (!isHost) return { accepted: false, reason: "Only the host can hand over editing" };
      const targetId = typeof req.playerId === "string" ? req.playerId.slice(0, 128) : "";
      if (!Object.prototype.hasOwnProperty.call(room.players, targetId)) return { accepted: false, reason: "That player is not in the room" };
      cov.editorId = targetId;
      return { accepted: true, changed: "editor" };
    }
    case "HASH": {
      if (req.revision !== cov.revision || typeof req.hash !== "string") return { accepted: true, changed: null };
      cov.hashes[socketId] = req.hash;
      const set = new Set(Object.values(cov.hashes));
      const was = cov.desync; cov.desync = set.size > 1;
      return { accepted: true, changed: was !== cov.desync ? "clock" : null };
    }
    default: return { accepted: false, reason: "Unknown request" };
  }
}

/** Keep an editor when players leave. */
function onPlayerLeft(cov, room) {
  if (!room.players[cov.editorId]) cov.editorId = room.hostId;
  for (const id of Object.keys(cov.hashes)) if (!room.players[id]) delete cov.hashes[id];
}

module.exports = { createCoverageState, applyRequest, publicState, onPlayerLeft, clockNow, RATES, deployRoles, deploySnapshot, tickDeploy, finishDeploy };
