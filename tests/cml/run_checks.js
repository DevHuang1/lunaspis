/**
 * @fileoverview Verification suite for JPL Concept Maturity Levels (CML 1-9) framework & server sanitizer.
 * Run: `node tests/cml/run_checks.js`
 */
"use strict";

const fs = require("fs");
const path = require("path");
const CML = require("../../public/js/core/cml_framework.js");
const { sanitizeDesignPatch, MISSION_DESIGN_KEYS } = require("../../server/design_sanitizer.js");

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n=== 1. JPL CML 1-9 SCALE & 24x7 MATRIX STRUCTURE ===");
check("CML_LEVELS contains all 9 levels (1..9)",
  CML.CML_LEVELS.length === 9 && CML.CML_LEVELS.map((l) => l.level).join(",") === "1,2,3,4,5,6,7,8,9");
check("Formal checklists exist strictly on CML 2-6",
  CML.CML_LEVELS.filter((l) => l.hasFormalChecklist).map((l) => l.level).join(",") === "2,3,4,5,6");
check("CML 2-4 carry iterative trade-space loop tag",
  CML.CML_LEVELS.filter((l) => l.feedbackLoopGroup === "trade-loop").map((l) => l.level).join(",") === "2,3,4");

const catCounts = {};
for (const row of CML.CML_MATRIX_ROWS) {
  catCounts[row.category] = (catCounts[row.category] || 0) + 1;
}
check("CML Matrix has 24 rows (2 Sci, 13 Tech, 5 Mgmt, 1 Cost, 3 Other)",
  CML.CML_MATRIX_ROWS.length === 24 &&
  catCounts.science === 2 &&
  catCounts.technical === 13 &&
  catCounts.management === 5 &&
  catCounts.cost === 1 &&
  catCounts.other === 3,
  JSON.stringify(catCounts));

const allMatrixCellsPresent = CML.CML_MATRIX_ROWS.every(
  (r) => [1, 2, 3, 4, 5, 6, 7].every((c) => typeof r.cells[c] === "string" && r.cells[c].length > 0)
);
check("Every matrix row populates all 7 columns (CML 1..7)", allMatrixCellsPresent);

console.log("\n=== 2. CML 4 CHECKLIST, N/A RULES & MARGIN THRESHOLDS ===");
const cml4Defs = CML.CML_CHECKLIST_ITEMS.filter((i) => i.level === 4);
const cml4ApplicableDefs = cml4Defs.filter((i) => !i.na);
const cml4NaDefs = cml4Defs.filter((i) => i.na);
check("CML 4 includes all active criteria (>=50) and 6 shaded N/A rows",
  cml4ApplicableDefs.length >= 50 && cml4NaDefs.length === 6,
  `active=${cml4ApplicableDefs.length}, N/A=${cml4NaDefs.length}`);

const deepMargins = CML.evaluateTechnicalMargins(
  {
    orbit: { id: "sun_earth_l2" },
    scenario: { id: "deep_space_telescope" },
    massMarginPct: 38,
    netDaylightMarginW: 500,
    totalPowerLoadW: 600,
    rechargePowerNeededW: 100,
    batteryDodPct: 35,
    linkMarginDb: 3.4,
    bus: { id: "modular_hex", name: "Hex" },
    massOk: true
  },
  { launchWindowDays: "21" }
);
const deepRf = deepMargins.metrics.find((m) => m.id === "telecom");
check("Deep space L2 accepts >=3.0 dB RF link margin as Green",
  deepMargins.deepSpace === true && deepRf.required === ">= 3 dB" && deepRf.status === "G",
  `${deepRf.actual} vs ${deepRf.required}`);

const proxMargins = CML.evaluateTechnicalMargins(
  {
    orbit: { id: "lunar_polar_100" },
    scenario: { id: "lunar_south_pole" },
    massMarginPct: 20,
    netDaylightMarginW: 100,
    totalPowerLoadW: 600,
    rechargePowerNeededW: 100,
    batteryDodPct: 70,
    linkMarginDb: 4.5,
    bus: { id: "smallsat_12u", name: "SmallSat" },
    massOk: true
  },
  { launchWindowDays: "14" }
);
const proxRf = proxMargins.metrics.find((m) => m.id === "telecom");
const proxMass = proxMargins.metrics.find((m) => m.id === "mass");
const proxWin = proxMargins.metrics.find((m) => m.id === "launch_period");
check("Proximity orbit enforces >=6 dB RF, >=35% mass & 20-day launch window",
  proxRf.status === "Y" && proxMass.status === "Y" && proxWin.status === "Y",
  `RF=${proxRf.status}, Mass=${proxMass.status}, Win=${proxWin.status}`);

console.log("\n=== 3. TELEMETRY AUTO-EVALUATION, 80% GATE & 3 JPL CAVEATS ===");
const failingEval = CML.evaluateCmlState(
  {
    scenario: { id: "lunar_south_pole", name: "Lunar South Pole", code: "LRO", requiredScienceTypes: ["imaging", "radar"], targetLifetimeMonths: 24 },
    orbit: { id: "lunar_polar_100", radiationEnvKrad: 45 },
    massMarginPct: -10,
    massOk: false,
    powerOk: false,
    netDaylightMarginW: -200,
    totalPowerLoadW: 800,
    daylightGenW: 600,
    batteryDodPct: 95,
    commsOk: false,
    linkMarginDb: -2,
    deltaVOk: false,
    achievedDeltaV: 200,
    requiredDeltaV: 1100,
    disposalOk: false,
    disposalNote: "No EoM disposal",
    thermalOk: false,
    radiationOk: false,
    telescopeOk: true,
    budgetOk: false,
    totalCostM: 500,
    budgetCapM: 350,
    selectedInsts: [],
    matchedTypes: [],
    scienceScore: 10,
    engineeringScore: 15,
    overallScore: 13,
    segments: {
      launch: { label: "LAUNCH", ok: false },
      space: { label: "SPACE", ok: false },
      ground: { label: "GROUND", ok: false },
      user: { label: "USER", ok: false }
    },
    riskMatrix: []
  },
  { tasks: [], tradeBaselineA: null, groundSupport: {} },
  { targetCml: 4, assessorSignedOff: false, overrides: {}, notes: {} }
);
check("Failing concept remains at reachedCml=1 and triggers CML 2-4 feedback alerts",
  failingEval.reachedCml === 1 && failingEval.feedbackAlerts.length >= 2,
  `reached=${failingEval.reachedCml}, alerts=${failingEval.feedbackAlerts.length}`);

// Strong closed concept reaching >=80% on CML 2-4
const all7Tasks = [
  "task_antenna", "task_nav", "task_wires", "task_science", "task_lss", "task_hull", "task_landing"
].map((id) => ({ id, completed: true }));
const strongTelemetry = {
  scenario: { id: "lunar_south_pole", name: "Lunar Polar Mapper", code: "LUNAR", requiredScienceTypes: ["imaging", "lidar", "neutron"], targetLifetimeMonths: 24 },
  orbit: { id: "lunar_polar_100", radiationEnvKrad: 35 },
  lv: { id: "ariane_heavy", name: "Ariane 64 Heavy" },
  bus: { id: "flagship_octagonal", name: "Flagship Octagonal" },
  pwr: { id: "deployable_rosa", name: "ROSA" },
  bat: { id: "solid_state_640", name: "640 Wh" },
  thm: { id: "pumped_loop_50", name: "50 krad Loop", radRatingKrad: 55 },
  com: { id: "x_band_hga", name: "X-Band HGA" },
  gnd: { id: "dsn_goldstone", name: "DSN" },
  prop: { id: "biprop_nto_mmh", name: "MMH/NTO" },
  disposal: { id: "controlled_deorbit", name: "Controlled Deorbit", deorbitYears: 0.1 },
  analogue: { name: "LRO + LCROSS", missions: "LRO" },
  selectedInsts: [{ id: "a", name: "Cam" }, { id: "b", name: "Lidar" }, { id: "c", name: "Neutron" }],
  matchedTypes: ["imaging", "lidar", "neutron"],
  budgetCapM: 400,
  totalCostM: 310,
  budgetRemainingM: 90,
  budgetOk: true,
  dryMassKg: 420,
  wetMassKg: 800,
  lvCapacityKg: 1400,
  massMarginPct: 43,
  massOk: true,
  totalPowerLoadW: 400,
  daylightGenW: 1100,
  rechargePowerNeededW: 120,
  netDaylightMarginW: 580,
  eclipseEnergyNeedWh: 200,
  batteryDodPct: 32,
  powerOk: true,
  dataGeneratedGbPerDay: 20,
  downlinkCapGbPerDay: 80,
  linkMarginDb: 8.5,
  commsOk: true,
  achievedDeltaV: 1400,
  requiredDeltaV: 1100,
  deltaVOk: true,
  disposalOk: true,
  telescopeOk: true,
  thermalOk: true,
  radiationOk: true,
  estimatedLifetimeMonths: 42,
  lifetimeOk: true,
  scienceScore: 92,
  engineeringScore: 96,
  overallScore: 94,
  segments: {
    launch: { label: "LAUNCH", ok: true },
    space: { label: "SPACE", ok: true },
    ground: { label: "GROUND", ok: true },
    user: { label: "USER", ok: true }
  },
  riskMatrix: [{}, {}, {}, {}, {}]
};
const strongNotes = {
  stmSummary: "PSR H2O detection L1 req traced to Neutron + Lidar KPPs",
  heritageSource: "LRO / LADEE avionics bus & star tracker heritage",
  launchWindow: "Nov 2027 (22-day lunar transfer window)",
  launchWindowDays: "22",
  costClass: "NASA Discovery Cap $400M",
  backupLv: "Vulcan Centaur",
  partnerMode: "GSFC in-house bus with competed AO instruments",
  descopeOptions: "Descope UV channel to preserve 25% mass reserve",
  trlFallback: "TRL 6 solid-state Li-ion fallback to flight-proven 320Wh pack",
  scheduleMarginNote: "6 months funded reserve per DP 6.1.2.2",
  wbsSummary: "NASA Standard WBS L1-L4 Dictionary complete",
  nepaSummary: "NPR 8580.1 solar Cat-Ex clean",
  vnvSummary: "FlatSat + EM avionics testbed, 24 C&DH functions mapped",
  costModelValidation: "NICM + SEER-H within 6% spread",
  assessorName: "LCC-FDIR (Alex)"
};

const strongUnverified = CML.evaluateCmlState(
  strongTelemetry,
  { tasks: all7Tasks, tradeBaselineA: { overallScore: 80 }, groundSupport: { systemsPowerVerified: true, rangeGo: true } },
  { targetCml: 4, assessorSignedOff: false, overrides: {}, notes: strongNotes }
);
check("Strong closed design reaches >= CML 4 via >=80% Green Gate",
  strongUnverified.reachedCml >= 4 && strongUnverified.levelsSummary[4].percentGreen >= 80,
  `reached=CML ${strongUnverified.reachedCml}, CML4=${strongUnverified.levelsSummary[4].percentGreen}%`);

check("Caveat #3 flags pending Independent Assessor & holds certifiedCml < 5",
  strongUnverified.certifiedCml <= 4 && strongUnverified.caveatsStatus[2].flagged === true);

const strongWithStmGap = CML.evaluateCmlState(
  strongTelemetry,
  { tasks: all7Tasks, tradeBaselineA: { overallScore: 80 }, groundSupport: { systemsPowerVerified: true, rangeGo: true } },
  { targetCml: 4, assessorSignedOff: true, overrides: { c4_sci_stm: "R", c4_sci_l1: "R" }, notes: strongNotes }
);
check("Caveat #2 catches unweighted critical gaps even when >=80% Green threshold holds",
  strongWithStmGap.levelsSummary[4].thresholdMet === true &&
  strongWithStmGap.levelsSummary[4].gateCertified === false &&
  strongWithStmGap.levelsSummary[4].criticalGaps.length === 2,
  `pct=${strongWithStmGap.levelsSummary[4].percentGreen}%, gaps=${strongWithStmGap.levelsSummary[4].criticalGaps.length}`);

const strongCertified = CML.evaluateCmlState(
  strongTelemetry,
  { tasks: all7Tasks, tradeBaselineA: { overallScore: 80 }, groundSupport: { systemsPowerVerified: true, rangeGo: true } },
  { targetCml: 5, assessorSignedOff: true, overrides: {}, notes: strongNotes }
);
check("With Independent Assessor sign-off + complete docs, certifiedCml reaches >= 5",
  strongCertified.certifiedCml >= 5,
  `certified=CML ${strongCertified.certifiedCml}`);

console.log("\n=== 4. 5x5 RISK MATRIX & REPORT EXPORTS ===");
check("5x5 Risk Matrix creates 25 cells (1x1..5x5) and scores high risks when failing",
  Object.keys(failingEval.risk5x5.cells).length === 25 && failingEval.risk5x5.highCount >= 3,
  `highRisks=${failingEval.risk5x5.highCount}`);
const jsonRep = CML.generateCmlReportPayload(strongTelemetry, strongCertified);
const mdRep = CML.formatCmlMarkdownReport(strongTelemetry, strongCertified);
check("Report exporters emit valid JSON schema and beginner-friendly Markdown sections",
  jsonRep.schema === "lunaspis.jpl-cml-assessment.v1" &&
  mdRep.includes("Three Golden Rules (JPL Caveats)") &&
  mdRep.includes("Safety Buffers (Technical Margin Gate)"));

check("Beginner-friendly stages, phases, and plain-English labels are active",
  CML.CML_LEVELS.every((l) => l.shortTitle.startsWith("Stage ")) &&
  !CML.CML_LEVELS.some((l) => /Pre-Phase A|NPR 7120|Step 2 Submittal/.test(l.phase + " " + l.competedGate)) &&
  !CML.CML_CHECKLIST_ITEMS.some((i) => /\b(DP 6\.1\.2\.2|NPR 8580\.1|QQCL|BOEs at lowest WBS)\b/.test(i.text)));

console.log("\n=== 5. SERVER SANITIZER & HTML WIRING ===");
check("MISSION_DESIGN_KEYS includes bio and CML keys",
  MISSION_DESIGN_KEYS.has("cmlTargetLevel") &&
  MISSION_DESIGN_KEYS.has("cmlAssessorSignedOff") &&
  MISSION_DESIGN_KEYS.has("cmlOverrides") &&
  MISSION_DESIGN_KEYS.has("cmlNotes") &&
  MISSION_DESIGN_KEYS.has("bioOrganismId"));

const cleanPatch = sanitizeDesignPatch({
  scenarioId: "lunar_south_pole",
  unknownHackerKey: "drop table",
  cmlTargetLevel: "99",
  cmlAssessorSignedOff: true,
  cmlOverrides: {
    c4_sci_stm: "G",
    c4_invalid_val: "X",
    __proto__: "R",
    "bad key!": "Y"
  },
  cmlNotes: {
    stmSummary: "  Validated STM L1 mapping  ",
    unauthorizedField: "ignore me"
  }
});
check("Sanitizer clamps cmlTargetLevel (<=6), strips invalid/proto override keys & strips unknown notes",
  cleanPatch &&
  cleanPatch.cmlTargetLevel === 6 &&
  cleanPatch.cmlAssessorSignedOff === true &&
  cleanPatch.cmlOverrides.c4_sci_stm === "G" &&
  cleanPatch.cmlOverrides.c4_invalid_val === undefined &&
  !Object.prototype.hasOwnProperty.call(cleanPatch.cmlOverrides, "__proto__") &&
  cleanPatch.cmlNotes.stmSummary === "Validated STM L1 mapping" &&
  cleanPatch.cmlNotes.unauthorizedField === undefined &&
  cleanPatch.unknownHackerKey === undefined,
  JSON.stringify(cleanPatch));

const vm = require("vm");
const indexHtml = fs.readFileSync(path.join(__dirname, "../../public/index.html"), "utf8");
check("public/index.html loads cml_framework.js before gameplay.js without conflict markers",
  !indexHtml.includes("<<<<<<<") &&
  indexHtml.indexOf("js/core/cml_framework.js") !== -1 &&
  indexHtml.indexOf("js/core/cml_framework.js") < indexHtml.indexOf("js/game/gameplay.js"));

console.log("\n=== 6. GAMEPLAY.JS + CML FRAMEWORK RUNTIME INTEGRATION ===");
const cmlSrc = fs.readFileSync(path.join(__dirname, "../../public/js/core/cml_framework.js"), "utf8");
const gameplaySrc = fs.readFileSync(path.join(__dirname, "../../public/js/game/gameplay.js"), "utf8");
const fakeDoc = {
  getElementById: () => null,
  createElement: () => ({ id: "", style: {}, className: "", addEventListener: () => {}, querySelector: () => null }),
  body: { appendChild: () => {}, contains: () => false },
  addEventListener: () => {}
};
const sandbox = {
  console,
  Math,
  Date,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Set,
  Map,
  JSON,
  document: fakeDoc,
  window: null,
  navigator: { userAgent: "node" },
  setTimeout,
  clearTimeout,
  requestAnimationFrame: () => 0,
  queueMicrotask: () => {},
  performance: { now: () => 0 }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
vm.runInNewContext(cmlSrc, sandbox);
vm.runInNewContext(gameplaySrc, sandbox);
const gpTelemetry = sandbox.gameplay ? sandbox.gameplay.telemetry : null;
const gpPatch = sandbox.gameplay ? sandbox.gameplay.syncFullDesignPatch() : null;
check("GameplayEngine instantiates with CMLFramework telemetry & syncFullDesignPatch",
  Boolean(sandbox.gameplay && gpTelemetry && gpTelemetry.cml && gpTelemetry.cml.reachedCml >= 1 && gpPatch && gpPatch.cmlTargetLevel === 4),
  gpTelemetry && gpTelemetry.cml ? `reached=CML ${gpTelemetry.cml.reachedCml}, target=CML ${gpPatch.cmlTargetLevel}, cml4Pct=${gpTelemetry.cml.levelsSummary[4].percentGreen}%` : "missing");

console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
if (failed > 0) process.exit(1);
