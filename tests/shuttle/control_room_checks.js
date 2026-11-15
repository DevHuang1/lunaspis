/* Shuttle telemetry should reflect main-engine cutoff in the control display. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../public/js/game/shuttle_hud.js"), "utf8"), { window });
const hud = Object.create(window.ShuttleHud.prototype);
const snapshot = {
  missionId: "test", phase: "ascent", met: 50, simTime: 50, objectives: [], messages: [],
  telemetry: { altitudeM: 10000, airspeedMps: 360, inertialSpeedMps: 597, verticalSpeedMps: 353, mach: 1.19, dynPressPa: 28400 },
  vehicle: { eng: { ssme: true, throttle: 0.67, oms: false }, cfg: { srb: true, et: true } }
};

assert.match(hud._controlRoom(snapshot).details, /Main engine throttle<\/span><span class="v ">67%/);
console.log("PASS Control display shows main-engine throttle during ascent");
snapshot.phase = "insertion";
snapshot.vehicle.eng.ssme = false;
snapshot.vehicle.eng.oms = true;
assert.match(hud._controlRoom(snapshot).details, /Main engine throttle<\/span><span class="v ">0%/);
console.log("PASS Control display shows main engines off after cutoff, even during an OMS burn");
