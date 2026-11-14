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

console.log("\n=== 6. FSS ELEVATOR ACCESS & MULTI-LEVEL PER-OBSTACLE COLLISIONS ===");
// 6a. Ground Level Elevator Walk-In from South & East on Pad 39A Hardstand (y = 12.5m)
const elevWalkGround = simulateDrive([
  [-42.2, 8.0],
  [-42.2, -0.8],
  [-42.2, -4.0], // inside Elevator Cab via South entrance
  [-40.5, -4.0]  // out East doorway toward FSS Ground Lobby
], 0.42, 12.5, mockSite.boxColliders, mockSite.circleColliders);

check("Crew walks freely into FSS Ground Elevator Cab from South entrance and out East doorway",
  elevWalkGround.blockedSteps === 0 && Math.abs(elevWalkGround.y - 12.5) < 1e-3,
  `blockedSteps=${elevWalkGround.blockedSteps}, endPos=(${elevWalkGround.x.toFixed(2)}, ${elevWalkGround.z.toFixed(2)})`);

check("FSS Ground Elevator back wall, north glass wall, North/South blast walls, and RSS block properly",
  T.isBlocked(-43.75, -4.0, 0.42, 12.5, [], []) && // Cab west back wall
  T.isBlocked(-42.2, -5.4, 0.42, 12.5, [], []) &&  // Cab north glass wall
  T.isBlocked(-42.2, -7.0, 0.42, 12.5, [], []) &&  // North lobby railing
  T.isBlocked(-34.0, -12.0, 0.42, 12.5, [], []) && // FSS North blast wall
  T.isBlocked(-34.0, 12.0, 0.42, 12.5, [], []) &&  // FSS South blast wall
  T.isBlocked(-18.0, 16.0, 0.42, 12.5, [], []) &&  // RSS Hinge Column
  T.isBlocked(5.0, 16.0, 0.42, 12.5, [], []));     // RSS Payload Changeout Room (PCR)

// 6b. MLP South Access Stairway climb onto MLP Deck (y = 12.5m -> 19.8m) & MLP Deck obstacles
const mlpStairClimb = simulateDrive([
  [-12.0, 33.0],
  [-12.0, 26.0],
  [-12.0, 20.0],
  [-15.5, 12.0],
  [-15.5, -10.0]
], 0.42, 12.5, mockSite.boxColliders, mockSite.circleColliders);

check("Crew climbs MLP South Access Stairway to 19.8m MLP deck and walks west deck corridor",
  mlpStairClimb.blockedSteps === 0 && Math.abs(mlpStairClimb.y - 19.8) < 1e-3,
  `blockedSteps=${mlpStairClimb.blockedSteps}, endY=${mlpStairClimb.y.toFixed(2)}`);

check("MLP Deck obstacles (Vehicle Stack, TSMs, Hold-Down Posts, Deck Railings) block properly at y=19.8m",
  T.isBlocked(0, 0, 0.42, 19.8, [], []) &&          // Launch Stack
  T.isBlocked(-11.5, -9.5, 0.42, 19.8, [], []) &&   // West TSM
  T.isBlocked(11.5, -9.5, 0.42, 19.8, [], []) &&    // East TSM
  T.isBlocked(-18.0, -16.0, 0.42, 19.8, [], []) &&  // Hold-down post
  T.isBlocked(-24.4, 0, 0.42, 19.8, [], []));       // West MLP perimeter railing

// 6c. SpaceCenterManager.resolveGroundCollision on Level 2 (Gantry 64.1m) & Level 3 (Top Deck 108.1m)
function RealVector3(x = 0, y = 0, z = 0) {
  this.x = x; this.y = y; this.z = z;
}
global.THREE = new Proxy({}, {
  get: (_, k) => k === "DoubleSide" ? 2 : k === "Vector3" ? RealVector3 : makeTestProxyFn()
});
require("../../public/js/world/space_center.js");
const scProto = window.SpaceCenterManager && window.SpaceCenterManager.prototype;
const mockSC = {
  siteTourActive: false,
  _isLocalGroundCrew: () => false,
  elevatorMoving: false,
  elevatorRidingPlayer: false,
  dockLocked: true,
  site: mockSite,
  _getSiteTourElevation: scProto._getSiteTourElevation,
  _resolveSiteTourCollision: scProto._resolveSiteTourCollision,
  resolveGroundCollision: scProto.resolveGroundCollision
};

function simulateFlightCrewWalk(waypoints, levelY) {
  let pos = new global.THREE.Vector3(waypoints[0][0], levelY, waypoints[0][1]);
  let blockedSteps = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const [tx, tz] = waypoints[i];
    const dist = Math.hypot(tx - pos.x, tz - pos.z);
    const steps = Math.max(1, Math.ceil(dist / 0.4));
    for (let s = 1; s <= steps; s++) {
      const nx = pos.x + (tx - pos.x) * (1 / (steps - s + 1));
      const nz = pos.z + (tz - pos.z) * (1 / (steps - s + 1));
      const nextPos = mockSC.resolveGroundCollision(pos, new global.THREE.Vector3(nx, levelY, nz));
      if (Math.hypot(nextPos.x - pos.x, nextPos.z - pos.z) < 1e-4 && dist > 0.1) {
        blockedSteps++;
      }
      pos = nextPos;
    }
  }
  return { pos, blockedSteps };
}

const gantryToElev = simulateFlightCrewWalk([
  [-30.0, -9.0],  // Crew spawn bay on Gantry Staging Deck
  [-34.0, -4.0],  // Center of FSS Gantry Deck
  [-40.0, -4.0],  // West FSS Elevator Portal Doorway
  [-42.2, -4.0],  // Inside Gantry Elevator Cab
  [-34.0, -7.2],  // Back onto Gantry Deck aligned with OAA
  [-24.0, -7.2],  // Through OAA Portal onto Boarding Bridge
  [-5.0, -7.2]    // Inside White Room at Orbiter Hatch
], 64.1);

check("Level 2 Gantry Deck: Crew walks from spawn bay into Elevator Cab and across OAA into White Room with zero blocks",
  gantryToElev.blockedSteps === 0 && Math.abs(gantryToElev.pos.x - (-5.0)) < 1e-2,
  `blockedSteps=${gantryToElev.blockedSteps}, endX=${gantryToElev.pos.x.toFixed(2)}`);

// Verify Gantry Deck obstacles block walking through them
const hitConsole = mockSC.resolveGroundCollision(
  new global.THREE.Vector3(-27.2, 64.1, -5.4),
  new global.THREE.Vector3(-25.9, 64.1, -5.4)
);
const hitLockers = mockSC.resolveGroundCollision(
  new global.THREE.Vector3(-29.5, 64.1, -11.4),
  new global.THREE.Vector3(-29.5, 64.1, -12.3)
);
const hitWestCladding = mockSC.resolveGroundCollision(
  new global.THREE.Vector3(-39.2, 64.1, 2.0),
  new global.THREE.Vector3(-40.1, 64.1, 2.0)
);
check("Level 2 Gantry Deck obstacles (Control Console, Crew Lockers/Bench, SW Cladding Wall) block properly",
  Math.abs(hitConsole.x - (-27.2)) < 1e-3 &&
  Math.abs(hitLockers.z - (-11.4)) < 1e-3 &&
  Math.abs(hitWestCladding.x - (-39.2)) < 1e-3);

const topDeckToElev = simulateFlightCrewWalk([
  [-34.0, -3.5],  // Top Observation Deck clear walkway
  [-40.0, -4.0],  // Top Deck Elevator Portal Doorway
  [-42.2, -4.0],  // Inside Top Deck Elevator Cab
  [-36.0, -4.0],  // Back onto Top Deck
  [-36.0, 2.0]    // West of Hammerhead Crane Cab
], 108.1);

check("Level 3 Top Observation Deck: Crew walks freely between Top Deck and Elevator Cab with zero blocks",
  topDeckToElev.blockedSteps === 0 && Math.abs(topDeckToElev.pos.z - 2.0) < 1e-2,
  `blockedSteps=${topDeckToElev.blockedSteps}, endPos=(${topDeckToElev.pos.x.toFixed(2)}, ${topDeckToElev.pos.z.toFixed(2)})`);

const hitCraneCab = mockSC.resolveGroundCollision(
  new global.THREE.Vector3(-34.8, 108.1, 1.8),
  new global.THREE.Vector3(-32.8, 108.1, 1.8)
);
check("Level 3 Top Observation Deck Hammerhead Crane Cab blocks walking through it",
  Math.abs(hitCraneCab.x - (-34.8)) < 1e-3);

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
