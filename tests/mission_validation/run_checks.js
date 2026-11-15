/* Mission review must not offer to complete a design that the server rejects. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const CMLFramework = require("../../public/js/core/cml_framework.js");
const { validateFinalReport } = require("../../server/mission_validation.js");

const source = fs.readFileSync(path.join(__dirname, "../../public/js/game/gameplay.js"), "utf8");
const cubesat = {
  scenarioId: "cubesat_101", difficultyId: "engineer", orbitId: "iss_cubesat_418",
  launchVehicleId: "electron_light", busId: "smallsat_12u", powerId: "deployable_rosa",
  batteryId: "li_ion_320", instruments: ["inst_lidar"],
  thermalId: "passive_mli", commsId: "s_band_omni", groundNetId: "near_space_net",
  propulsionId: "hydrazine_mono", cubesatFormId: "6u", disposalId: "drag_sail"
};
const qualifiedCubesat = {
  ...cubesat, instruments: ["inst_multispectral", "inst_mag"]
};
const bio = {
  scenarioId: "bionutrients_2", difficultyId: "engineer", orbitId: "leo_400",
  launchVehicleId: "electron_light", busId: "smallsat_12u", powerId: "deployable_rosa",
  batteryId: "li_ion_120", instruments: ["inst_mag", "inst_neutron"],
  thermalId: "passive_mli", commsId: "s_band_omni", groundNetId: "near_space_net",
  propulsionId: "hydrazine_mono", disposalId: "drag_sail",
  bioOrganismId: "yeast_beta_carotene", bioBagId: "fep_3mil_iss_002",
  bioProtocolId: "pwd_syringe_filter_6h_16rep", bioThermalId: "inc_30c_melfi_80c"
};

function runReview(design) {
  const window = { CMLFramework, netManager: { connected: true, roomId: "qa", roomState: {} } };
  const document = { getElementById: () => null };
  vm.runInNewContext(source, { window, document, console, setTimeout, clearTimeout });
  const game = window.gameplay;
  game.missionDesign = { ...game.missionDesign, ...design };
  game._renderLiveTradeoffStrip = () => "";
  let report = null, toast = "";
  game.finishTask = (_task, _stayOpen, data) => { report = data.evaluation; };
  game.showToast = message => { toast = message; };
  const buttons = new Map();
  const container = {
    innerHTML: "",
    querySelector(selector) {
      if (!buttons.has(selector)) buttons.set(selector, { addEventListener: (_name, fn) => { buttons.get(selector).click = fn; } });
      return buttons.get(selector);
    }
  };
  game.renderMissionSimulationConsole(container, { id: "task_landing" });
  const telemetry = game.evaluateMissionDesign();
  buttons.get("#btn-commit-sim").click();
  return { html: container.innerHTML, report, toast, telemetry };
}

function accepted(result, design) {
  assert.ok(result.report, "a qualified design should be submitted");
  const validation = validateFinalReport({ report: result.report, scenarioId: design.scenarioId, difficultyId: design.difficultyId });
  assert.equal(validation.ok, true, validation.reasons.join(" "));
}

const invalidScience = runReview(cubesat);
assert.equal(invalidScience.telemetry.matchedTypes.length, 0);
assert.equal(invalidScience.report, null, "unmatched CubeSat payload should not be submitted");
assert.match(invalidScience.html, /mission-priority science tool/i);
console.log("PASS CubeSat payload without a mission-priority instrument is flagged before submission");

accepted(runReview(qualifiedCubesat), qualifiedCubesat);
console.log("PASS Qualified CubeSat design is accepted by the server validator");

const noReturn = runReview({ ...bio, disposalId: "none_drift" });
assert.equal(noReturn.telemetry.disposalOk, false);
assert.equal(noReturn.report, null, "BioNutrients without safe return should not be submitted");
assert.match(noReturn.html, /safe return/i);
console.log("PASS BioNutrients without a safe-return plan is flagged before submission");

accepted(runReview(bio), bio);
console.log("PASS Qualified BioNutrients design is accepted by the server validator");
