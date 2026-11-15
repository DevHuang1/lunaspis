/* Earth Control must show live Shuttle data and request real GMAT forecasts safely. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
let callback = null;
let calls = 0;
const snapshot = {
  missionId: "flight-1", phase: "ascent", simTime: 40,
  telemetry: { altitudeM: 12000, airspeedMps: 450, verticalSpeedMps: 330, dynPressPa: 21000, mach: 1.3 },
  vehicle: { eng: { ssme: true, srb: true, oms: false, throttle: 0.67 } }
};
const window = { netManager: { connected: true, snapshot, socket: {
  timeout(ms) {
    assert.equal(ms, 60000);
    return { emit(name, cb) { assert.equal(name, "shuttle_gmat_coast"); calls++; callback = cb; } };
  }
} } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../public/js/world/space_center.js"), "utf8"), { window, console });
const control = window.spaceCenter;
const elements = new Map();
const elementFor = selector => {
  if (!elements.has(selector)) {
    elements.set(selector, {
      textContent: "",
      innerHTML: "",
      disabled: false,
      dataset: {},
      querySelector: nested => elementFor(nested),
      querySelectorAll: () => [],
      setAttribute: () => {}
    });
  }
  return elements.get(selector);
};
control.lccConsoleOpen = true;
control.missionPhase = "launch";
control.lccConsoleOverlay = { querySelector: elementFor };
const get = selector => elements.get(selector);

control._syncLccConsoleLive();
assert.equal(get("#lcc-shuttle-altitude").textContent, "12.0 km");
assert.equal(get("#lcc-shuttle-throttle").textContent, "67 %");
assert.equal(get("#btn-lcc-gmat").disabled, true);
control._requestLccGmatForecast();
assert.equal(calls, 0);
console.log("PASS Earth Control shows live ascent values and prevents an early GMAT request");

snapshot.phase = "insertion";
snapshot.telemetry.altitudeM = 230000;
snapshot.vehicle.eng.ssme = false;
snapshot.vehicle.eng.srb = false;
control._syncLccConsoleLive();
assert.equal(get("#lcc-shuttle-throttle").textContent, "0 %");
assert.equal(get("#btn-lcc-gmat").disabled, false);
control._requestLccGmatForecast();
assert.equal(calls, 1);
assert.equal(get("#btn-lcc-gmat").disabled, true);
callback(null, { success: true, prediction: { missionId: "flight-1", horizonSeconds: 120, sourceSimTime: 500, altitudeKm: 234.56, inertialSpeedKmS: 7.67 } });
assert.match(get("#lcc-gmat-result").textContent, /\+120 s.*234\.6 km.*7\.67 km\/s/);
assert.equal(get("#btn-lcc-gmat").disabled, false);
console.log("PASS Earth Control requests and displays the returned GMAT coast forecast");

control._requestLccGmatForecast();
const oldCallback = callback;
window.netManager.snapshot = { ...snapshot, missionId: "flight-2" };
control._syncLccConsoleLive();
oldCallback(null, { success: true, prediction: { missionId: "flight-1", horizonSeconds: 120, sourceSimTime: 500, altitudeKm: 234.56, inertialSpeedKmS: 7.67 } });
assert.doesNotMatch(get("#lcc-gmat-result").textContent, /234\.6 km/);
control.missionPhase = "docking";
control._syncLccConsoleLive();
assert.match(get("#lcc-shuttle-status").textContent, /paused after handoff/i);
assert.equal(get("#btn-lcc-gmat").disabled, true);
console.log("PASS Old forecasts are discarded and the display marks data paused after docking handoff");

control.missionPhase = "launch";
window.netManager.connected = false;
control._syncLccConsoleLive();
assert.match(get("#lcc-shuttle-status").textContent, /connection lost/i);
assert.equal(get("#lcc-shuttle-altitude").textContent, "—");
assert.equal(get("#btn-lcc-gmat").disabled, true);
console.log("PASS Disconnected flight data is not presented as live");
