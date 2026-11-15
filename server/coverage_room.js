/*
 * coverage_room.js — shared-session authority for the CubeSat Contact Coverage mission.
 *
 * The server owns the scenario, its revision, who may edit it, and the simulation clock. It does NOT
 * propagate orbits: every client computes the forecast from the identical scenario (with any real
 * orbital element record embedded), so results agree; clients report a forecast hash to detect desync.
 */
"use strict";
const C = require("../public/js/coverage/coverage_core.js");

const RATES = [1, 10, 60, 300, 1000];

function createCoverageState(hostId, scenario) {
  const scn = scenario && C.validate(scenario).ok ? C.normalize(scenario) : C.defaultSandbox(Date.now());
  return { scenario: scn, revision: 1, editorId: hostId, clock: { simT: 0, wallRef: Date.now(), rate: 60, paused: true }, hashes: {}, desync: false };
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
  const ed = room.players[cov.editorId];
  return { revision: cov.revision, pinsRev: cov.pinsRev || 0, scenario: cov.scenario, editorId: cov.editorId, editorName: ed ? ed.name : null,
           clock: { ...cov.clock }, serverNow: now, desync: cov.desync };
}

/** Apply a client request. Returns { accepted, reason?, changed: "scenario"|"clock"|"editor"|null }. */
function applyRequest(cov, room, socketId, req) {
  req = req || {};
  const now = Date.now();
  const isEditor = socketId === cov.editorId, isHost = socketId === room.hostId;
  switch (req.type) {
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
      if (!room.players[req.playerId]) return { accepted: false, reason: "That player is not in the room" };
      cov.editorId = req.playerId;
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

module.exports = { createCoverageState, applyRequest, publicState, onPlayerLeft, clockNow, RATES };
