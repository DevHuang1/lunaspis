#!/usr/bin/env node
/**
 * Regenerates server/mission_design_core.js from the canonical mission-design
 * catalogs and scoring math in public/js/game/gameplay.js.
 *
 * The browser and the server must score a design identically. Keeping one
 * generated copy avoids silent drift between the UI preview and the
 * authoritative validation used to award mission victories.
 *
 * Usage:
 *   node scripts/build_mission_design_core.js
 *   node scripts/build_mission_design_core.js --check
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "public", "js", "game", "gameplay.js");
const TARGET = path.join(ROOT, "server", "mission_design_core.js");

const source = fs.readFileSync(SOURCE, "utf8").replace(/\r\n/g, "\n");
const lines = source.split("\n");

function findLine(predicate, from = 0, label = "marker") {
  for (let i = from; i < lines.length; i += 1) {
    if (predicate(lines[i])) return i;
  }
  throw new Error(`Could not locate ${label} in ${path.relative(ROOT, SOURCE)}`);
}

const catalogStart = findLine((line) => line.trim() === "const MISSION_SCENARIOS = {", 0, "catalog start");
const classStart = findLine((line) => line.trim() === "class GameplayEngine {", catalogStart, "class start");
const catalogBlock = lines.slice(catalogStart, classStart).join("\n").replace(/\s+$/, "");

const evalStart = findLine((line) => line.trim() === "evaluateMissionDesign() {", classStart, "evaluateMissionDesign");
const completedTasks = findLine((line) => line.includes("const completedTasksCount ="), evalStart, "score boundary");
const numericBlock = lines.slice(evalStart + 1, completedTasks).join("\n");

const mdDeclaration = "      const md = this.missionDesign;";
if (!numericBlock.includes(mdDeclaration)) {
  throw new Error("Gameplay evaluator no longer starts with the expected missionDesign declaration.");
}
const evaluatorBody = numericBlock.replace(mdDeclaration, "  const md = missionDesign;");
if (/\bthis\./.test(evaluatorBody)) {
  throw new Error("Extracted evaluator still references `this`; generation would be unsafe.");
}

const catalogNames = [
  "MISSION_SCENARIOS",
  "MISSION_ANALOGUES",
  "DIFFICULTY_LEVELS",
  "ORBIT_OPTIONS",
  "LAUNCH_VEHICLES",
  "SPACECRAFT_BUSES",
  "POWER_SYSTEMS",
  "BATTERY_PACKS",
  "SCIENTIFIC_INSTRUMENTS",
  "THERMAL_RADIATION_PACKAGES",
  "COMMS_PACKAGES",
  "GROUND_NETWORKS",
  "PROPULSION_SYSTEMS",
  "WAVELENGTH_BANDS",
  "CUBESAT_FORMS",
  "DISPOSAL_OPTIONS",
  "BIO_ORGANISM_OPTIONS",
  "BIO_BAG_CONFIGS",
  "BIO_PROTOCOL_OPTIONS",
  "BIO_THERMAL_OPTIONS"
];

const exportList = [
  "scenario", "difficulty", "orbit", "lv", "bus", "pwr", "bat", "thm", "com", "gnd",
  "prop", "wavelength", "cubesatForm", "disposal", "bioTelemetry", "isBio", "selectedInsts",
  "budgetCapM", "totalCostM", "budgetRemainingM", "budgetOk", "dryMassKg", "wetMassKg",
  "lvCapacityKg", "massMarginPct", "massOk", "totalPowerLoadW", "daylightGenW",
  "rechargePowerNeededW", "netDaylightMarginW", "eclipseHours", "eclipseEnergyNeedWh",
  "batteryDodPct", "powerOk", "dataGeneratedGbPerDay", "downlinkCapGbPerDay", "linkMarginDb",
  "commsOk", "achievedDeltaV", "requiredDeltaV", "deltaVOk", "disposalOk", "disposalNote",
  "telescopeIssues", "telescopeOk", "thermalOk", "radiationOk", "estimatedLifetimeMonths",
  "lifetimeOk", "matchedTypes", "scienceScore", "engineeringScore", "overallScore", "segments",
  "bioOk"
];

const output = `/**
 * AUTO-GENERATED FILE — do not edit by hand.
 *
 * Source: public/js/game/gameplay.js (mission-design catalogs + scoring math)
 * Regenerate: node scripts/build_mission_design_core.js
 *
 * This module is the authoritative server-side scorer for LDR mission reports.
 * It deliberately mirrors the browser's preview math so a crew cannot submit
 * impossible designs and have them accepted by the server.
 */
"use strict";

${catalogBlock}

function evaluateDesignCore(missionDesign) {
  if (!missionDesign || typeof missionDesign !== "object" || Array.isArray(missionDesign)) {
    throw new TypeError("A mission design object is required.");
  }
${evaluatorBody}

  return {
${exportList.map((name) => `    ${name},`).join("\n")}
  };
}

module.exports = {
  evaluateDesignCore,
  catalogs: {
${catalogNames.map((name) => `    ${name},`).join("\n")}
  }
};
`;

const checkOnly = process.argv.includes("--check");
if (checkOnly) {
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, "utf8") : "";
  if (current !== output) {
    console.error("server/mission_design_core.js is stale. Run: node scripts/build_mission_design_core.js");
    process.exit(1);
  }
  console.log("server/mission_design_core.js is up to date.");
  process.exit(0);
}

fs.writeFileSync(TARGET, output, "utf8");
console.log(`Generated ${path.relative(ROOT, TARGET)} (${output.split("\n").length} lines).`);
