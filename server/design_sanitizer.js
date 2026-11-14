/**
 * @fileoverview Shared mission architecture & JPL CML design patch sanitizer.
 */
"use strict";

const MISSION_DESIGN_KEYS = new Set([
  "scenarioId",
  "difficultyId",
  "orbitId",
  "launchVehicleId",
  "busId",
  "powerId",
  "batteryId",
  "instruments",
  "thermalId",
  "commsId",
  "groundNetId",
  "propulsionId",
  "wavelengthId",
  "disposalId",
  "cubesatFormId",
  "bioOrganismId",
  "bioBagId",
  "bioProtocolId",
  "bioThermalId",
  "cmlTargetLevel",
  "cmlAssessorSignedOff",
  "cmlOverrides",
  "cmlNotes"
]);

const VALID_CML_STATUS = new Set(["G", "Y", "R"]);

const CML_NOTE_LIMITS = {
  stmSummary: 240,
  heritageSource: 160,
  launchWindow: 96,
  launchWindowDays: 16,
  costClass: 96,
  backupLv: 96,
  partnerMode: 120,
  descopeOptions: 200,
  trlFallback: 200,
  scheduleMarginNote: 160,
  wbsSummary: 180,
  nepaSummary: 180,
  vnvSummary: 180,
  costModelValidation: 180,
  swMarginPct: 16,
  assessorName: 80,
  assessorNotes: 320
};

function sanitizeDesignPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const clean = {};

  for (const key of Object.keys(patch)) {
    if (!MISSION_DESIGN_KEYS.has(key)) continue;
    const value = patch[key];

    if (key === "instruments") {
      if (Array.isArray(value)) {
        clean[key] = value
          .filter((item) => typeof item === "string")
          .map((item) => item.slice(0, 48))
          .slice(0, 8);
      }
    } else if (key === "cmlTargetLevel") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        clean[key] = Math.max(2, Math.min(6, parsed));
      }
    } else if (key === "cmlAssessorSignedOff") {
      if (typeof value === "boolean") {
        clean[key] = value;
      }
    } else if (key === "cmlOverrides") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const cleanOverrides = {};
        let count = 0;
        for (const itemId of Object.keys(value)) {
          if (count >= 120) break;
          if (itemId === "__proto__" || itemId === "constructor" || itemId === "prototype") continue;
          if (!/^[a-zA-Z0-9_]{2,40}$/.test(itemId)) continue;
          const status = value[itemId];
          if (typeof status === "string" && VALID_CML_STATUS.has(status)) {
            cleanOverrides[itemId] = status;
            count++;
          }
        }
        clean[key] = cleanOverrides;
      }
    } else if (key === "cmlNotes") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const cleanNotes = {};
        for (const noteKey of Object.keys(CML_NOTE_LIMITS)) {
          const raw = value[noteKey];
          if (typeof raw === "string") {
            const trimmed = raw.trim();
            if (trimmed.length > 0) {
              cleanNotes[noteKey] = trimmed.slice(0, CML_NOTE_LIMITS[noteKey]);
            }
          }
        }
        clean[key] = cleanNotes;
      }
    } else if (typeof value === "string" && value.length <= 64) {
      clean[key] = value;
    }
  }

  return Object.keys(clean).length ? clean : null;
}

module.exports = {
  MISSION_DESIGN_KEYS,
  CML_NOTE_LIMITS,
  VALID_CML_STATUS,
  sanitizeDesignPatch
};
