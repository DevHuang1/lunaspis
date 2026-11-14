/**
 * @fileoverview Server-authoritative validation for the LDR final mission report.
 *
 * The browser runs the full design solver for immediate feedback. When the crew
 * commits the LDR simulation, it sends a compact final report. This module
 * validates that report against the authoritative room scenario/difficulty,
 * the sanitized design ids, the score arithmetic, the resource constraints and
 * the simulation phase results before the server records a victory.
 *
 * It deliberately does not trust client-side booleans alone: the score is
 * recomputed, the budget cap is recomputed, numeric constraints are checked,
 * and every component id must exist in the shared catalogs.
 */
"use strict";

const { sanitizeDesignPatch } = require("./design_sanitizer");

const SCENARIO_RULES = {
  earth_climate: {
    baseBudgetM: 380,
    targetLifetimeMonths: 36,
    requiredScienceTypes: ["optical", "radar", "altimetry", "spectrometer"],
    minDeltaV: 420,
    minRadiationKrad: 25,
    requiresWavelength: false,
    isCubesat: false,
    isBioPayload: false
  },
  lunar_south_pole: {
    baseBudgetM: 500,
    targetLifetimeMonths: 24,
    requiredScienceTypes: ["neutron", "altimetry", "spectrometer", "optical"],
    minDeltaV: 1150,
    minRadiationKrad: 50,
    requiresWavelength: false,
    isCubesat: false,
    isBioPayload: false
  },
  asteroid_rendezvous: {
    baseBudgetM: 540,
    targetLifetimeMonths: 48,
    requiredScienceTypes: ["spectrometer", "altimetry", "magnetometer", "neutron"],
    minDeltaV: 1650,
    minRadiationKrad: 75,
    requiresWavelength: false,
    isCubesat: false,
    isBioPayload: false
  },
  space_telescope: {
    baseBudgetM: 620,
    targetLifetimeMonths: 60,
    requiredScienceTypes: ["optical", "spectrometer"],
    minDeltaV: 1480,
    minRadiationKrad: 55,
    requiresWavelength: true,
    isCubesat: false,
    isBioPayload: false
  },
  cubesat_101: {
    baseBudgetM: 105,
    targetLifetimeMonths: 18,
    requiredScienceTypes: ["optical", "magnetometer"],
    minDeltaV: 85,
    minRadiationKrad: 15,
    requiresWavelength: false,
    isCubesat: true,
    isBioPayload: false
  },
  bionutrients_2: {
    baseBudgetM: 18,
    targetLifetimeMonths: 12,
    requiredScienceTypes: ["optical", "spectrometer"],
    minDeltaV: 120,
    minRadiationKrad: 10,
    requiresWavelength: false,
    isCubesat: false,
    isBioPayload: true
  },
  sandbox: {
    baseBudgetM: 950,
    targetLifetimeMonths: 24,
    requiredScienceTypes: ["optical", "spectrometer"],
    minDeltaV: 300,
    minRadiationKrad: 20,
    requiresWavelength: false,
    isCubesat: false,
    isBioPayload: false
  }
};

const DIFFICULTY_MULTIPLIERS = {
  cadet: 1.25,
  engineer: 1.0,
  director: 0.88
};

const VALID_IDS = {
  orbitId: new Set(["leo_400", "sso_705", "gto_heo", "lunar_polar_100", "iss_cubesat_418", "sun_earth_l2"]),
  launchVehicleId: new Set(["cygnus_ng18", "electron_light", "falcon_medium", "ariane_heavy", "sls_superheavy"]),
  busId: new Set(["smallsat_12u", "modular_hex", "deep_space_heavy"]),
  powerId: new Set(["body_solar", "deployable_rosa", "high_power_wings"]),
  batteryId: new Set(["li_ion_120", "li_ion_320", "solid_state_640"]),
  thermalId: new Set(["passive_mli", "pumped_loop_50", "cryo_rad_90"]),
  commsId: new Set(["s_band_omni", "x_band_hga", "ka_band_optical"]),
  groundNetId: new Set(["regional_vhs", "near_space_net", "dsn_goldstone"]),
  propulsionId: new Set(["cold_gas", "hydrazine_mono", "biprop_nto_mmh", "hall_ion_sep"]),
  wavelengthId: new Set(["uv_optical", "near_ir", "mid_ir", "xray"]),
  cubesatFormId: new Set(["3u", "6u", "12u"]),
  disposalId: new Set(["none_drift", "drag_sail", "controlled_deorbit"]),
  bioOrganismId: new Set(["yeast_beta_carotene", "yogurt_culture", "kefir_culture"]),
  bioBagId: new Set(["fep_3mil_iss_002", "fep_5mil_hd_002", "fep_earth_001", "bn1_legacy_canister"]),
  bioProtocolId: new Set(["pwd_syringe_filter_6h_16rep", "pwd_12rep_30ml_std", "skip_6h_shake_protocol", "low_rep_6_unfiltered"]),
  bioThermalId: new Set(["inc_30c_melfi_80c", "inc_42c_melfi_80c", "ambient_melfi_80c", "inc_30c_coldbag_4c"])
};

const INSTRUMENT_TYPES = {
  inst_multispectral: "optical",
  inst_sar: "radar",
  inst_lidar: "altimetry",
  inst_ir_spec: "spectrometer",
  inst_neutron: "neutron",
  inst_mag: "magnetometer"
};

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

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isTrue(value) {
  return value === true;
}

function clampText(value, max) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

function validateFinalReport({ report, scenarioId, difficultyId }) {
  const reasons = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { ok: false, reasons: ["Missing final simulation report."] };
  }

  const scenario = SCENARIO_RULES[scenarioId] || SCENARIO_RULES.lunar_south_pole;
  const difficulty = DIFFICULTY_MULTIPLIERS[difficultyId] ? difficultyId : "engineer";
  const budgetCapM = Math.round(scenario.baseBudgetM * DIFFICULTY_MULTIPLIERS[difficulty]);

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
      else if (!VALID_IDS[key].has(design[key])) reasons.push(`Invalid ${key}: ${design[key]}.`);
    }
    const instruments = Array.isArray(design.instruments) ? design.instruments : [];
    if (!instruments.length) reasons.push("No scientific instruments selected.");
    if (instruments.length > 8) reasons.push("Too many scientific instruments.");
    for (const instrumentId of instruments) {
      if (!INSTRUMENT_TYPES[instrumentId]) reasons.push(`Unknown instrument: ${instrumentId}.`);
    }
    if (scenario.requiresWavelength) {
      if (!design.wavelengthId || !VALID_IDS.wavelengthId.has(design.wavelengthId)) {
        reasons.push("A valid telescope wavelength band is required for this scenario.");
      }
    }
    if (scenario.isCubesat) {
      if (!design.cubesatFormId || !VALID_IDS.cubesatFormId.has(design.cubesatFormId)) {
        reasons.push("A valid CubeSat form factor is required for this scenario.");
      }
    }
    if (scenario.isBioPayload) {
      for (const key of ["bioOrganismId", "bioBagId", "bioProtocolId", "bioThermalId"]) {
        if (!design[key] || !VALID_IDS[key].has(design[key])) {
          reasons.push(`Invalid or missing ${key}.`);
        }
      }
    }

    if (!scenario.isBioPayload) {
      const selectedTypes = new Set(instruments.map((id) => INSTRUMENT_TYPES[id]).filter(Boolean));
      const requiredTypes = scenario.requiredScienceTypes || [];
      const matched = requiredTypes.filter((type) => selectedTypes.has(type));
      if (!matched.length) {
        reasons.push("Payload does not cover any required science type for this scenario.");
      }
    }
  }

  const scienceScore = Number(report.scienceScore);
  const engineeringScore = Number(report.engineeringScore);
  const expectedOverall = Math.round(engineeringScore * 0.55 + scienceScore * 0.45);

  if (!isNumber(scienceScore) || scienceScore < 0 || scienceScore > 100) {
    reasons.push("Invalid science score.");
  }
  if (!isNumber(engineeringScore) || engineeringScore < 0 || engineeringScore > 100) {
    reasons.push("Invalid engineering score.");
  }
  if (scienceScore < 40) {
    reasons.push("Science score below the server minimum (40).");
  }
  if (report.overallScore !== expectedOverall) {
    reasons.push(`Overall score arithmetic mismatch: report=${report.overallScore}, expected=${expectedOverall}.`);
  }
  if (expectedOverall < 75) {
    reasons.push("Overall score below the flight-qualified threshold (75).");
  }
  if (!isTrue(report.allNominal)) {
    reasons.push("The LDR report is not all-nominal.");
  }

  const phases = Array.isArray(report.phases) ? report.phases : [];
  if (phases.length < 6) {
    reasons.push("Final report is missing simulation phases.");
  }
  const failedPhases = phases
    .filter((phase) => !phase || phase.ok !== true)
    .map((phase) => clampText(phase && (phase.phase || phase.id), 80) || "unknown");
  if (failedPhases.length) {
    reasons.push(`Failing simulation phases: ${failedPhases.join(", ")}.`);
  }

  const requiredFlags = [
    "budgetOk",
    "massOk",
    "powerOk",
    "commsOk",
    "deltaVOk",
    "thermalOk",
    "radiationOk",
    "lifetimeOk",
    "disposalOk"
  ];
  if (scenario.requiresWavelength) requiredFlags.push("telescopeOk");
  if (scenario.isBioPayload) requiredFlags.push("bioOk");
  for (const flag of requiredFlags) {
    if (!isTrue(report[flag])) reasons.push(`Constraint flag is not satisfied: ${flag}.`);
  }

  const totalCostM = Number(report.totalCostM);
  const wetMassKg = Number(report.wetMassKg);
  const lvCapacityKg = Number(report.lvCapacityKg);
  const batteryDodPct = Number(report.batteryDodPct);
  const netDaylightMarginW = Number(report.netDaylightMarginW);
  const linkMarginDb = Number(report.linkMarginDb);
  const dataGeneratedGbPerDay = Number(report.dataGeneratedGbPerDay);
  const downlinkCapGbPerDay = Number(report.downlinkCapGbPerDay);
  const achievedDeltaV = Number(report.achievedDeltaV);
  const requiredDeltaV = Number(report.requiredDeltaV);
  const estimatedLifetimeMonths = Number(report.estimatedLifetimeMonths);
  const selectedInstCount = Number(report.selectedInstCount);

  if (!isNumber(totalCostM) || totalCostM < 0 || totalCostM > budgetCapM) {
    reasons.push(`Budget exceeds the authoritative cap ($${budgetCapM}M).`);
  }
  if (Number(report.budgetCapM) !== budgetCapM) {
    reasons.push(`Budget cap mismatch: report=${report.budgetCapM}, expected=${budgetCapM}.`);
  }
  if (!isNumber(wetMassKg) || wetMassKg <= 0 || !isNumber(lvCapacityKg) || wetMassKg > lvCapacityKg) {
    reasons.push("Spacecraft wet mass is missing or exceeds launch-vehicle capacity.");
  }
  if (!isNumber(batteryDodPct) || batteryDodPct < 0 || batteryDodPct > 80) {
    reasons.push("Battery depth-of-discharge exceeds 80%.");
  }
  if (!isNumber(netDaylightMarginW) || netDaylightMarginW < 0) {
    reasons.push("Daylight power margin is negative.");
  }
  if (!isNumber(linkMarginDb) || linkMarginDb < 3) {
    reasons.push("Communications link margin is below 3 dB.");
  }
  if (!isNumber(downlinkCapGbPerDay) || downlinkCapGbPerDay < dataGeneratedGbPerDay) {
    reasons.push("Downlink capacity is below generated science data.");
  }
  if (!isNumber(achievedDeltaV) || achievedDeltaV < requiredDeltaV) {
    reasons.push("Achieved delta-v is below the required delta-v.");
  }
  if (!isNumber(estimatedLifetimeMonths) || estimatedLifetimeMonths < scenario.targetLifetimeMonths) {
    reasons.push("Estimated mission lifetime is below the scenario target.");
  }
  if (!isNumber(selectedInstCount) || selectedInstCount < 1) {
    reasons.push("No selected instruments were reported.");
  }

  if (report.event && report.event.ok !== true) {
    reasons.push("The seeded mission anomaly was not survived.");
  }
  const cmlLevel = Number(report.cmlLevel);
  if (!isNumber(cmlLevel) || cmlLevel < 1 || cmlLevel > 6) {
    reasons.push("Invalid CML level.");
  }

  const normalized = {
    scenarioId,
    difficultyId: difficulty,
    overallScore: expectedOverall,
    scienceScore: Math.round(scienceScore),
    engineeringScore: Math.round(engineeringScore),
    cmlLevel: Math.max(1, Math.min(6, Math.round(cmlLevel))),
    budget: {
      totalCostM: Math.round(totalCostM),
      capM: budgetCapM,
      ok: true
    },
    mass: {
      wetMassKg: Math.round(wetMassKg * 10) / 10,
      capacityKg: Math.round(lvCapacityKg * 10) / 10,
      marginPct: isNumber(report.massMarginPct) ? Math.round(report.massMarginPct) : null,
      ok: true
    },
    power: {
      loadW: Math.round(Number(report.totalPowerLoadW) || 0),
      generationW: Math.round(Number(report.daylightGenW) || 0),
      batteryDodPct: Math.round(batteryDodPct),
      ok: true
    },
    comms: {
      linkMarginDb: Math.round(linkMarginDb * 10) / 10,
      dataGeneratedGbPerDay: Math.round(dataGeneratedGbPerDay * 10) / 10,
      downlinkCapGbPerDay: Math.round(downlinkCapGbPerDay * 10) / 10,
      ok: true
    },
    deltaV: {
      achievedMs: Math.round(achievedDeltaV),
      requiredMs: Math.round(requiredDeltaV),
      ok: true
    },
    lifetime: {
      estimatedMonths: Math.round(estimatedLifetimeMonths),
      targetMonths: scenario.targetLifetimeMonths,
      ok: true
    },
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
    design,
    validatedAt: Date.now(),
    validator: "lunaspis-server-validation-v1"
  };

  return { ok: reasons.length === 0, reasons, result: reasons.length === 0 ? normalized : null };
}

module.exports = {
  SCENARIO_RULES,
  DIFFICULTY_MULTIPLIERS,
  VALID_IDS,
  INSTRUMENT_TYPES,
  validateFinalReport
};
