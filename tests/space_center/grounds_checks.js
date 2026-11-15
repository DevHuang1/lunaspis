/**
 * @fileoverview Verification suite for the Space Center grounds-detail module.
 * Confirms the new buildings/props register collision, do not block the site
 * tour spawns or the primary roads, and that the new paved surfaces report
 * consistent walkable heights.
 * Run: `node tests/space_center/grounds_checks.js`
 */
"use strict";

global.window = global;
const SCModules = require("../../public/js/world/space_center/shared.js");
const T = SCModules.terrain;

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

function makeTestProxyObj() {
  const store = Object.create(null);
  return new Proxy(store, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === "toString" || p === "valueOf") return () => 0;
      if (p in t) return t[p];
      t[p] = makeTestProxyFn();
      return t[p];
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
function makeTestProxyFn() {
  const props = Object.create(null);
  return new Proxy(function () { return makeTestProxyObj(); }, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === "toString" || p === "valueOf") return () => 0;
      if (p === "prototype") return t.prototype;
      if (p in props) return props[p];
      props[p] = makeTestProxyFn();
      return props[p];
    },
    set(t, p, v) { props[p] = v; return true; },
    construct() { return makeTestProxyObj(); }
  });
}

global.document = { createElement: () => makeTestProxyObj() };
global.THREE = new Proxy({}, { get: (_, k) => k === "DoubleSide" ? 2 : makeTestProxyFn() });
require("../../public/js/world/space_center/site.js");
require("../../public/js/world/space_center/grounds.js");

const mockSite = new SCModules.SpaceCenterSite(makeTestProxyObj(), makeTestProxyObj(), SCModules.constants);
SCModules.builders.grounds(mockSite);

console.log("\n=== 1. GROUNDS MODULE REGISTRATION ===");
check("grounds builder is registered", typeof SCModules.builders.grounds === "function");
check("grounds adds solid building volumes", mockSite.boxColliders.length >= 8, `boxes=${mockSite.boxColliders.length}`);
check("grounds adds the flagpole and barge-crane accents", mockSite.circleColliders.length >= 2, `circles=${mockSite.circleColliders.length}`);

console.log("\n=== 2. SITE TOUR SPAWNS REMAIN CLEAR ===");
for (const spawn of SCModules.SITE_TOUR_SPAWNS) {
  check(
    `${spawn.short} spawn (${spawn.x}, ${spawn.z}) is walkable`,
    !T.isBlocked(spawn.x, spawn.z, 1.2, T.getSurfaceHeightAt(spawn.x, spawn.z, 0), mockSite.boxColliders, mockSite.circleColliders),
    `y=${T.getSurfaceHeightAt(spawn.x, spawn.z, 0).toFixed(2)}`
  );
}

console.log("\n=== 3. PRIMARY ROAD / CRAWLERWAY ROUTES REMAIN CLEAR ===");
const routeChecks = [
  ["Main Avenue", -680, 296, 180, 296],
  ["Pad Boulevard", 180, -140, 180, 286],
  ["Main Crawlerway", 0, 200, 0, 580],
  ["Campus entrance and spine", -345, 290, -345, 264],
  ["Campus spine", -470, 264, -280, 264]
];
for (const [label, x0, z0, x1, z1] of routeChecks) {
  let blocked = 0;
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    const y = T.getSurfaceHeightAt(x, z, 0);
    if (T.isBlocked(x, z, 1.35, y, mockSite.boxColliders, mockSite.circleColliders)) {
      blocked++;
      if (blocked === 1) console.error(`        first block at (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  check(`${label} route has no unseen grounds collider`, blocked === 0, `blocked samples=${blocked}`);
}

console.log("\n=== 4. NEW PAVED SURFACES REPORT WALKABLE HEIGHTS ===");
const heightChecks = [
  ["VAB south apron", -60, 540, 0.06],
  ["Campus spine", -380, 264, 0.12],
  ["Campus entrance drive", -345, 277, 0.12],
  ["Campus east lot", -255, 267, 0.12],
  ["Campus west lot", -465, 235, 0.12],
  ["Fire-rescue apron", -70, 270, 0.10],
  ["Press overflow lot", 202, 262, 0.12],
  ["LETF gravel yard", 198, 560, 0.08],
  ["Laydown yard", -450, 192, 0.06],
  ["Barge yard", -930, 165, 0.06],
  ["Hazmat pad", -181, 132, 0.06],
  ["VAB warehouse lot link", -147, 512, 0.12]
];
for (const [label, x, z, expected] of heightChecks) {
  const y = T.getSurfaceHeightAt(x, z, 0);
  check(`${label} height is ${expected.toFixed(2)}m`, Math.abs(y - expected) < 1e-6, `y=${y.toFixed(3)}`);
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
