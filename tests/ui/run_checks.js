/**
 * @fileoverview Lightweight HUD structure/overlap regression checks.
 * These do not replace a browser pass, but they guard the layout invariants
 * that caused the fixed-HUD collisions: duplicate entry points, removed dead
 * bars, compact toolbar rules, collapsed defaults and safe-zone media queries.
 * Run: `node tests/ui/run_checks.js`
 */
"use strict";

const fs = require("fs");
const path = require("path");

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

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const indexHtml = read("public/index.html");
const videoLink = read("public/js/core/video_link.js");
const mainJs = read("public/js/game/main.js");
const gameplayJs = read("public/js/game/gameplay.js");
const groundMapJs = read("public/js/world/space_center/ground_map.js");
const styleCss = read("public/css/style.css");
const premiumCss = read("public/css/premium.css");
const lunarGlassCss = read("public/css/lunar-glass.css");
const mobileCss = read("public/css/mobile.css");
const polishCss = read("public/css/ui-polish.css");
const allCss = [styleCss, premiumCss, lunarGlassCss, mobileCss, polishCss].join("\n");
const allMarkup = [indexHtml, videoLink].join("\n");

console.log("\n=== 1. DUPLICATE ENTRY POINTS REMOVED ===");
check("Floating 3D Crew Link prompt markup is gone",
  !/id=["']vl-start-prompt["']/.test(allMarkup));
check("Injected .vl-start-prompt and glyph CSS is gone",
  !/\.vl-start-prompt\b/.test(videoLink) &&
  !/\.vl-link-glyph\b/.test(videoLink));
check("Right-edge COMMS tab is gone",
  !/id=["']crew-comms-toggle["']/.test(indexHtml) &&
  !/#crew-comms-toggle\b/.test(allCss) &&
  !/getElementById\(["']crew-comms-toggle["']\)/.test(mainJs));
check("Toolbar COMMS button owns the unread badge",
  /id="btn-hud-comms"/.test(indexHtml) &&
  /id="crew-comms-badge"/.test(indexHtml) &&
  /getElementById\(["']btn-hud-comms["']\)/.test(mainJs));

console.log("\n=== 2. LANDING PAGE SCOPE ===");
check("Hangar, Dossier and Past Flights are absent from the landing page",
  !/btn-open-hangar-menu|btn-title-dossier|btn-open-mission-log|>HANGAR<|>DOSSIER<|PAST FLIGHTS/.test(indexHtml));
check("Landing activity picker exposes Shuttle/Station and CubeSat Coverage",
  /id="btn-activity-shuttle"[^>]*aria-pressed="true"/.test(indexHtml) &&
  /id="btn-activity-coverage"[^>]*aria-pressed="false"/.test(indexHtml));
check("Landing activity picker styles exist",
  /\.title-activity-row\s*\{/.test(premiumCss) &&
  /\.title-util-btn\[aria-pressed="true"\]/.test(premiumCss));

console.log("\n=== 3. DEAD HUD MARKUP/CSS REMOVED ===");
check("Legacy race/task bar markup is gone",
  !/hud-race-bar-container|hud-task-bar-container|hud-task-track|hud-race-team/.test(indexHtml));
check("Legacy race/task bar selectors are gone from CSS",
  !/hud-race-bar-container|hud-task-bar-container|hud-task-track|hud-systems-badge|hud-race-team/.test(allCss));
check("Legacy race/task DOM writers are gone",
  !/race-score-coop|race-fill-coop/.test(gameplayJs));

console.log("\n=== 4. COLLAPSED DEFAULTS ===");
check("Mission Hub starts collapsed", /classList\.add\(["']collapsed["']\)/.test(mainJs));
check("Mission Hub exposes a NEXT line in the collapsed header",
  /id="hud-checklist-next"/.test(indexHtml) &&
  /getElementById\(["']hud-checklist-next["']\)/.test(gameplayJs));
check("Resource meters start collapsed", /classList\.add\(["']telemetry-collapsed["']\)/.test(mainJs));
check("Ground map starts collapsed", /this\.collapsed = true/.test(groundMapJs));
check("Ground HUD starts collapsed", /this\.hudCollapsed = true/.test(
  read("public/js/world/space_center.js")
));

console.log("\n=== 5. FIXED-HUD SAFE ZONES ===");
check("Top-right toolbar collapses to icon-only at <=1600px",
  /@media \(max-width: 1600px\)[\s\S]{0,900}\.voice-btn__label[\s\S]{0,100}display:\s*none/.test(polishCss));
check("Compact toolbar is width-capped so it cannot reach the centre-top pill",
  /@media \(max-width: 1600px\)[\s\S]{0,900}\.voice-header-row[\s\S]{0,200}flex-wrap:\s*nowrap/.test(polishCss) &&
  /@media \(max-width: 1600px\)[\s\S]{0,1400}\.voice-mic-btn[\s\S]{0,200}width:\s*34px/.test(polishCss));
check("Bottom key strip is hidden at <=1366px",
  /@media \(max-width: 1366px\)[\s\S]{0,500}#hud-control-strip[\s\S]{0,100}display:\s*none/.test(polishCss));
check("Bottom key strip yields to ground/shuttle/docking/launch HUDs",
  /body\.ground-mode-active #hud-control-strip/.test(styleCss) &&
  /body\.shuttle-mode-active #hud-control-strip/.test(styleCss) &&
  /body\.docking-active #hud-control-strip/.test(polishCss) &&
  /body\.launch-active #hud-control-strip/.test(polishCss));
check("Collapsed ground HUD no longer stretches to a full-width bar",
  /#space-center-ground-hud\.is-collapsed[\s\S]{0,220}width:\s*auto/.test(polishCss));
check("Mobile hides perf pill, compass, crosshair, map and key strip",
  /@media \(max-width: 900px\)[\s\S]{0,700}#perf-overlay,[\s\S]{0,240}#hud-compass,[\s\S]{0,240}#hud-crosshair,[\s\S]{0,240}#space-center-ground-map/.test(polishCss));
check("Compass and crosshair are hidden while on foot",
  /body\.ground-mode-active #hud-compass,[\s\S]{0,120}body\.ground-mode-active #hud-crosshair/.test(styleCss));

console.log("\n=== 6. GROUND HUD DENSITY ===");
check("Resource strip is limited to BUDGET / MASS / POWER",
  /hudMetrics\s*=\s*metrics\.filter\([\s\S]{0,180}budget[\s\S]{0,80}mass[\s\S]{0,80}power/.test(gameplayJs));
check("Ground CAR action only appears when driving or near the car",
  /nearCar\s*=/.test(read("public/js/world/space_center.js")) &&
  /guidance\.nearCar \? systemCard\(/.test(read("public/js/world/space_center.js")));
check("Mission Hub no longer repeats a per-row progress track",
  !/hub-role-group-track/.test(gameplayJs) &&
  !/hub-role-group-track/.test(allCss));
check("Phase-locked status is shown once per role group",
  /IN ORBIT · \$\{phaseLockedCount\}/.test(gameplayJs) &&
  /entry\.phaseLocked\s*\?\s*""/.test(gameplayJs));

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
