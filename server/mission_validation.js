/**
 * @fileoverview Server-authoritative validation for the LDR final mission report.
 *
 * The browser runs the design solver for immediate feedback. When the crew
 * commits the LDR simulation, it sends a compact report. This module no longer
 * trusts the browser's scores or constraint booleans: it re-runs the shared
 * mission-design evaluator (generated from the same catalogs as the client)
 * against the authoritative room scenario/difficulty and the sanitized design.
 *
 * The report's simulation phases and seeded-anomaly attestation are still
 * supplied by the client (the mission simulation is not replayed here), but a
 * design that fails any physical constraint can never be accepted.
 */
"use strict";

const { sanitizeDesignPatch } = require("./design_sanitizer");
const { evaluateDesignCore, catalogs } = require("./mission_design_core");

const SCENARIO_RULES = catalogs.MISSION_SCENARIOS;
const DIFFICULTY_MULTIPLIERS = Object.fromEntries(
  Object.entries(catalogs.DIFFICULTY_LEVELS).map(([id, level]) => [id, level.budgetMultiplier])
);

const VALID_IDS = {
  orbitId: new Set(Object.keys(catalogs.ORBIT_OPTIONS)),
  launchVehicleId: new Set(Object.keys(catalogs.LAUNCH_VEHICLES)),
  busId: new Set(Object.keys(catalogs.SPACECRAFT_BUSES)),
  powerId: new Set(Object.keys(catalogs.POWER_SYSTEMS)),
  batteryId: new Set(Object.keys(catalogs.BATTERY_PACKS)),
  thermalId: new Set(Object.keys(catalogs.THERMAL_RADIATION_PACKAGES)),
  commsId: new Set(Object.keys(catalogs.COMMS_PACKAGES)),
  groundNetId: new Set(Object.keys(catalogs.GROUND_NETWORKS)),
  propulsionId: new Set(Object.keys(catalogs.PROPULSION_SYSTEMS)),
  wavelengthId: new Set(Object.keys(catalogs.WAVELENGTH_BANDS)),
  cubesatFormId: new Set(Object.keys(catalogs.CUBESAT_FORMS)),
  disposalId: new Set(Object.keys(catalogs.DISPOSAL_OPTIONS)),
  bioOrganismId: new Set(Object.keys(catalogs.BIO_ORGANISM_OPTIONS)),
  bioBagId: new Set(Object.keys(catalogs.BIO_BAG_CONFIGS)),
  bioProtocolId: new Set(Object.keys(catalogs.BIO_PROTOCOL_OPTIONS)),
  bioThermalId: new Set(Object.keys(catalogs.BIO_THERMAL_OPTIONS))
};

const INSTRUMENT_TYPES = Object.fromEntries(
  catalogs.SCIENTIFIC_INSTRUMENTS.map((instrument) => [instrument.id, instrument.type])
);

const REQUIRED_DESIGN_KEYS = [
  "orbitId",
  "launchVehicleId",
  "busId",
  "powerId",
  "batteryId",
  "thermalId",
  "commsId",
  "groundNetId",
  "propulsionId",
  "disposalId"
];

function isTrue(value) {
  return value === true;
}

function clampText(value, max) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function validateFinalReport({ report, scenarioId, difficultyId, completedObjectives = 0 }) {
  const reasons = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { ok: false, reasons: ["Missing final simulation report."] };
  }

  const authoritativeScenario = hasOwn(SCENARIO_RULES, scenarioId) ? scenarioId : "lunar_south_pole";
  const authoritativeDifficulty = hasOwn(DIFFICULTY_MULTIPLIERS, difficultyId) ? difficultyId : "engineer";
  const scenario = SCENARIO_RULES[authoritativeScenario];

  if (report.scenarioId && report.scenarioId !== scenarioId) {
    reasons.push(`Scenario mismatch: report=${report.scenarioId}, room=${scenarioId}.`);
  }
  if (report.difficultyId && report.difficultyId !== difficultyId) {
    reasons.push(`Difficulty mismatch: report=${report.difficultyId}, room=${difficultyId}.`);
  }

  const design = sanitizeDesignPatch(report.design);
  if (!design) {
    reasons.push("Missing or invalid mission design snapshot.");
  } else {
    for (const key of REQUIRED_DESIGN_KEYS) {
      if (!design[key]) reasons.push(`Missing required design field: ${key}.`);
      else if (!VALID_IDS[key].has(design[key])) reasons.push(`Invalid ${key}.`);
    }
    const instruments = Array.isArray(design.instruments) ? design.instruments : [];
    if (!instruments.length) reasons.push("No scientific instruments selected.");
    if (instruments.length > 8) reasons.push("Too many scientific instruments.");
    for (const instrumentId of instruments) {
      if (!hasOwn(INSTRUMENT_TYPES, instrumentId)) reasons.push("Unknown scientific instrument.");
    }
    if (scenario.requiresWavelength && !VALID_IDS.wavelengthId.has(design.wavelengthId)) {
      reasons.push("A valid telescope wavelength band is required for this scenario.");
    }
    if (scenario.isCubesat && !VALID_IDS.cubesatFormId.has(design.cubesatFormId)) {
      reasons.push("A valid CubeSat form factor is required for this scenario.");
    }
    if (scenario.isBioPayload) {
      for (const key of ["bioOrganismId", "bioBagId", "bioProtocolId", "bioThermalId"]) {
        if (!VALID_IDS[key].has(design[key])) reasons.push(`Invalid or missing ${key}.`);
      }
    }
  }

  let core = null;
  if (design) {
    try {
      core = evaluateDesignCore({
        ...design,
        // Never allow the client to pick an easier scenario or budget than the
        // room is actually flying.
        scenarioId: authoritativeScenario,
        difficultyId: authoritativeDifficulty
      });
    } catch (error) {
      reasons.push("The mission design could not be evaluated.");
    }
  }

  if (core) {
    const constraints = [
      ["budgetOk", "Budget"],
      ["massOk", "Mass/launch compatibility"],
      ["powerOk", "Power and battery"],
      ["commsOk", "Communications"],
      ["deltaVOk", "Delta-v"],
      ["thermalOk", "Thermal control"],
      ["radiationOk", "Radiation shielding"],
      ["lifetimeOk", "Mission lifetime"],
      ["disposalOk", "End-of-mission disposal"]
    ];
    if (scenario.requiresWavelength) constraints.push(["telescopeOk", "Telescope optical compatibility"]);
    if (scenario.isBioPayload) constraints.push(["bioOk", "BioNutrients protocol"]);
    for (const [flag, label] of constraints) {
      if (!isTrue(core[flag])) reasons.push(`${label} constraint is not satisfied.`);
    }
    if (core.scienceScore < 40) reasons.push("Science score below the server minimum (40).");
    if (core.overallScore < 75) reasons.push("Overall score below the flight-qualified threshold (75).");
  }

  if (!isTrue(report.allNominal)) reasons.push("The LDR report is not all-nominal.");
  const phases = Array.isArray(report.phases) ? report.phases : [];
  if (phases.length < 6) reasons.push("Final report is missing simulation phases.");
  if (phases.some((phase) => !phase || phase.ok !== true)) {
    reasons.push("One or more simulation phases failed.");
  }
  if (report.event && report.event.ok !== true) {
    reasons.push("The seeded mission anomaly was not survived.");
  }

  const segments = core ? Object.values(core.segments || {}) : [];
  const segmentsPassed = segments.filter((segment) => segment && segment.ok === true).length;
  let cmlLevel = 1;
  const completed = Math.max(0, Number(completedObjectives) || 0);
  if (completed >= 2 || (core && core.overallScore >= 50)) cmlLevel = 2;
  if (completed >= 4 || (segmentsPassed >= 3 && core && core.overallScore >= 65)) cmlLevel = 3;
  if (completed >= 6 || (segmentsPassed === 4 && core && core.overallScore >= 75)) cmlLevel = 4;

  const normalized = core
    ? {
        scenarioId: authoritativeScenario,
        difficultyId: authoritativeDifficulty,
        overallScore: core.overallScore,
        scienceScore: Math.round(core.scienceScore),
        engineeringScore: Math.round(core.engineeringScore),
        cmlLevel: Math.max(1, Math.min(6, cmlLevel)),
        budget: {
          totalCostM: Math.round(core.totalCostM),
          capM: Math.round(core.budgetCapM),
          ok: core.budgetOk
        },
        mass: {
          wetMassKg: Math.round(core.wetMassKg * 10) / 10,
          capacityKg: Math.round(core.lvCapacityKg * 10) / 10,
          marginPct: core.massMarginPct,
          ok: core.massOk
        },
        power: {
          loadW: Math.round(core.totalPowerLoadW),
          generationW: Math.round(core.daylightGenW),
          batteryDodPct: Math.round(core.batteryDodPct),
          ok: core.powerOk
        },
        comms: {
          linkMarginDb: Math.round(core.linkMarginDb * 10) / 10,
          dataGeneratedGbPerDay: Math.round(core.dataGeneratedGbPerDay * 10) / 10,
          downlinkCapGbPerDay: Math.round(core.downlinkCapGbPerDay * 10) / 10,
          ok: core.commsOk
        },
        deltaV: {
          achievedMs: Math.round(core.achievedDeltaV),
          requiredMs: Math.round(core.requiredDeltaV),
          ok: core.deltaVOk
        },
        lifetime: {
          estimatedMonths: Math.round(core.estimatedLifetimeMonths),
          targetMonths: scenario.targetLifetimeMonths,
          ok: core.lifetimeOk
        },
        thermal: { ok: core.thermalOk, radiationOk: core.radiationOk },
        disposal: { ok: core.disposalOk, note: clampText(core.disposalNote, 180) },
        phases: phases.slice(0, 12).map((phase) => ({
          phase: clampText(phase.phase || phase.id, 120),
          ok: phase.ok === true,
          metric: clampText(phase.metric, 180)
        })),
        event: report.event
          ? {
              id: clampText(report.event.id, 64),
              severity: clampText(report.event.severity, 24),
              title: clampText(report.event.title, 120),
              ok: report.event.ok === true
            }
          : null,
        design: {
          ...design,
          scenarioId: authoritativeScenario,
          difficultyId: authoritativeDifficulty
        },
        validatedAt: Date.now(),
        validator: "lunaspis-server-design-evaluator-v2"
      }
    : null;

  return { ok: reasons.length === 0, reasons, result: reasons.length === 0 ? normalized : null };
}

module.exports = {
  SCENARIO_RULES,
  DIFFICULTY_MULTIPLIERS,
  VALID_IDS,
  INSTRUMENT_TYPES,
  evaluateDesignCore,
  validateFinalReport
};
