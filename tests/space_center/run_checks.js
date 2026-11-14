/**
 * @fileoverview Verification suite for Space Center terrain seams, LC-39A/B ramp
 * elevation, slope alignment, height-aware collisions, and crawlerway routing.
 * Run: `node tests/space_center/run_checks.js`
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

console.log("\n=== 1. TERRAIN & CRAWLERWAY CONTINUITY ===");
check("LC-39B crawlerway spur routes cleanly around Pad 39A (min dist >= 220m from 0,0)",
  T.distToPolyline(0, 0, SCModules.CRAWLERWAY_39B_POINTS) >= 220,
  `dist=${T.distToPolyline(0, 0, SCModules.CRAWLERWAY_39B_POINTS).toFixed(1)}m`);

check("Pad 39A ramp toe (z=186) matches main crawlerway height (0.14m)",
  Math.abs(T.getSurfaceHeightAt(0, 186, 0.14) - 0.14) < 1e-6 &&
  Math.abs(T.getSurfaceHeightAt(14, 188, 0.14) - 0.14) < 1e-6);

check("Pad 39A ramp crest (z=60) meets top deck height (12.50m)",
  Math.abs(T.getSurfaceHeightAt(0, 60, 12.4) - 12.5) < 1e-6 &&
  Math.abs(T.getSurfaceHeightAt(14, 58, 12.5) - 12.5) < 1e-6);

check("OpenCar spawn parking pad sits cleanly at 0.08m",
  Math.abs(T.getSurfaceHeightAt(38, 197, 0) - 0.08) < 1e-6);

console.log("\n=== 2. PAD 39A RAMP CLIMB & DECK NAVIGATION (CAR + ON FOOT) ===");
function simulateDrive(waypoints, radius, startY, boxes = [], circles = []) {
  let x = waypoints[0][0];
  let z = waypoints[0][1];
  let y = startY;
  let blockedSteps = 0;
  let minY = y;
  let maxY = y;
  for (let i = 1; i < waypoints.length; i++) {
    const [tx, tz] = waypoints[i];
    const dist = Math.hypot(tx - x, tz - z);
    const steps = Math.max(1, Math.ceil(dist / 0.5));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const nx = x + (tx - x) * (1 / (steps - s + 1));
      const nz = z + (tz - z) * (1 / (steps - s + 1));
      const res = T.resolveMovement(x, z, nx, nz, radius, y, boxes, circles);
      if (Math.hypot(res.x - x, res.z - z) < 1e-4 && dist > 0.1) {
        blockedSteps++;
      }
      x = res.x;
      z = res.z;
      y = res.y;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (f === 1) break;
    }
  }
  return { x, z, y, minY, maxY, blockedSteps };
}

// Drive car (radius 1.35) along right crawler lane (x=14) straight up ramp onto Pad 39A East apron, circle Shuttle/FSS, and back down!
const carPath39A = simulateDrive([
  [14, 210],
  [14, 186],
  [14, 123],
  [14, 60],
  [14, 52],
  [26, 50],
  [38, 38],
  [50, 20],
  [50, -20],
  [38, -38],
  [24, -52],
  [0, -52],
  [-24, -52],
  [-38, -38],
  [-50, -20],
  [-50, 20],
  [-38, 38],
  [-24, 52],
  [0, 54],
  [0, 123],
  [0, 210]
], 1.35, 0.14);

check("Car drives straight up x=14 lane, loops Pad 39A deck, and descends x=0 with zero blocks",
  carPath39A.blockedSteps === 0 && Math.abs(carPath39A.maxY - 12.5) < 1e-3 && Math.abs(carPath39A.y - 0.14) < 1e-3,
  `blockedSteps=${carPath39A.blockedSteps}, peakY=${carPath39A.maxY.toFixed(2)}, endY=${carPath39A.y.toFixed(2)}`);

const walkerPath39A = simulateDrive([
  [-12, 200],
  [-12, 186],
  [-12, 60],
  [-12, 52],
  [26, 50],
  [38, 38]
], 0.45, 0.14);

check("Walker ascends ramp and stands on Pad 39A '39A' deck at y=12.50m",
  walkerPath39A.blockedSteps === 0 && Math.abs(walkerPath39A.y - 12.5) < 1e-3,
  `blockedSteps=${walkerPath39A.blockedSteps}, y=${walkerPath39A.y.toFixed(2)}`);

// Verify smooth monotonic climb with no step > 0.11m per 1m step along z=186..60
let monotonicOk = true;
let prevH = T.getSurfaceHeightAt(0, 186, 0.14);
for (let z = 185; z >= 60; z -= 1) {
  const h = T.getSurfaceHeightAt(0, z, prevH);
  const dh = h - prevH;
  if (dh < -1e-6 || dh > 0.15) monotonicOk = false;
  prevH = h;
}
check("Pad 39A ramp profile rises smoothly and monotonically (0.14m -> 12.50m)", monotonicOk);

console.log("\n=== 3. SLOPE PITCH & SAFETY / OBSTACLE COLLISIONS ===");
const uphill = T.getSurfaceSlopePitchRoll(0, 123, Math.PI, 6.32); // yaw=PI faces -Z (uphill!)
const downhill = T.getSurfaceSlopePitchRoll(0, 123, 0, 6.32);      // yaw=0 faces +Z (downhill!)
check("Car body pitch tilts nose up facing uphill (pitch < 0) and down facing downhill (pitch > 0)",
  uphill.pitch < -0.08 && downhill.pitch > 0.08,
  `uphill=${uphill.pitch.toFixed(4)} rad, downhill=${downhill.pitch.toFixed(4)} rad`);

check("Ramp side curbs block driving off ramp sides at y=6.3m",
  T.isBlocked(19.2, 123, 1.35, 6.32, [], []) && T.isBlocked(-19.2, 123, 1.35, 6.32, [], []));

check("Pad 39A berm blocks entering from ground outside the ramp",
  T.isBlocked(50, 70, 1.35, 0.08, [], []) && T.isBlocked(-30, 120, 0.45, 0.08, [], []));

check("Pad 39A top deck structures (MLP, Flame Trench, FSS Tower) remain solid at y=12.5m",
  T.isBlocked(0, 0, 0.45, 12.5, [], []) &&
  T.isBlocked(0, 30, 0.45, 12.5, [], []) &&
  T.isBlocked(-34, 0, 0.45, 12.5, [], []));

check("Pad 39A top deck perimeter railings block driving over cliff edges & beside ramp mouth",
  T.isBlocked(59, 0, 1.35, 12.5, [], []) &&
  T.isBlocked(0, -59, 1.35, 12.5, [], []) &&
  T.isBlocked(21, 57, 1.35, 12.5, [], []));

console.log("\n=== 4. PAD 39B ROTATED RAMP CLIMB ===");
const ROT = -0.46;
const toWorld39B = (lx, lz) => [
  -120 + lx * Math.cos(ROT) + lz * Math.sin(ROT),
  -760 - lx * Math.sin(ROT) + lz * Math.cos(ROT)
];
const p39bStart = toWorld39B(0, 140);
const p39bToe = toWorld39B(0, 130);
const p39bCrest = toWorld39B(0, 52);
const p39bEastTurn = toWorld39B(24, 46);
const p39bEastDeck = toWorld39B(34, 34);
const drive39B = simulateDrive([p39bStart, p39bToe, p39bCrest, p39bEastTurn, p39bEastDeck], 1.35, 0.12);

check("Car drives smoothly up rotated Pad 39B ramp onto 6.42m summit apron",
  drive39B.blockedSteps === 0 && Math.abs(drive39B.y - 6.42) < 1e-3,
  `blockedSteps=${drive39B.blockedSteps}, endY=${drive39B.y.toFixed(2)}`);

console.log("\n=== 5. REAL PAD MODULE COLLIDER INTEGRATION (PAD.JS + PAD39B.JS) ===");
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
require("../../public/js/world/space_center/pad.js");
require("../../public/js/world/space_center/pad39b.js");

const mockSite = new SCModules.SpaceCenterSite(makeTestProxyObj(), makeTestProxyObj(), SCModules.constants);
SCModules.builders.pad(mockSite);
SCModules.builders.pad39b(mockSite);

const real39A = simulateDrive([
  [14, 210], [14, 186], [14, 123], [14, 60], [14, 52],
  [26, 50], [38, 38], [50, 20], [50, -20], [38, -38],
  [24, -52], [0, -52], [-24, -52], [-38, -38], [-50, -20],
  [-50, 20], [-38, 38], [-24, 52], [0, 54], [0, 123], [0, 210]
], 1.35, 0.14, mockSite.boxColliders, mockSite.circleColliders);

check("pad.js colliders do not block driving up/down Pad 39A ramp or orbiting deck",
  mockSite.boxColliders.length > 0 && real39A.blockedSteps === 0 && Math.abs(real39A.maxY - 12.5) < 1e-3 && Math.abs(real39A.y - 0.14) < 1e-3,
  `boxes=${mockSite.boxColliders.length}, blockedSteps=${real39A.blockedSteps}, peakY=${real39A.maxY.toFixed(2)}`);

const real39B = simulateDrive(
  [p39bStart, p39bToe, p39bCrest, p39bEastTurn, p39bEastDeck],
  1.35, 0.12, mockSite.boxColliders, mockSite.circleColliders
);

check("pad39b.js colliders do not block driving up Pad 39B ramp onto 6.42m deck",
  real39B.blockedSteps === 0 && Math.abs(real39B.y - 6.42) < 1e-3,
  `blockedSteps=${real39B.blockedSteps}, endY=${real39B.y.toFixed(2)}`);

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
