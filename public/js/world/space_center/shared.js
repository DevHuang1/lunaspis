/**
 * Space Center 2 — shared web-port constants and module registry.
 *
 * The original Godot LC-39A project lives in design-reference/ for reference.
 * Runtime content is built from these modules so terrain, facilities and
 * launch-pad props can be reused independently.
 */
(function (window) {
  "use strict";

  const NS = (window.SpaceCenterModules = window.SpaceCenterModules || {});

  NS.constants = {
    SITE_BOUNDS: { minX: -1050, maxX: 525, minZ: -1050, maxZ: 850 },
    PAD: { x: 0, z: 0, radius: 74, topY: 12.2 },
    VAB: {
      x: -30,
      z: 700,
      halfX: 79,
      halfZ: 109,
      height: 160,
      doorHalfWidth: 23,
      doorZ: 591
    },
    LCC: {
      x: -180,
      z: 180,
      halfX: 35,
      halfZ: 23,
      height: 24,
      doorZ: 203
    },
    CRAWLER: { x: 0, z: 500, yaw: Math.PI / 2 },
    PRESS: { x: 118, z: 214 },
    TURN_BASIN: { x: -930, z: 118 },
    ANTENNA: { x: -850, z: 336 },
    SUBSTATION: { x: -706, z: 50 },
    COOLING: { x: -620, z: 58 },
    GENERATOR: { x: -618, z: 18 },
    FIRE_TANK: { x: -596, z: 92 },
    PROPELLANT: { x: -120, z: 88 },
    WATER_TOWER: { x: 96, z: 58 },
    PAD_39B: { x: -120, z: -760 },
    BEACH: { x: 470, z: 0 }
  };

  NS.SITE_TOUR_SPAWNS = [
    { id: "pad", label: "Pad 39A", short: "PAD 39A", x: 30, z: 205, yaw: Math.atan2(-30, -205), pitch: 0.14 },
    { id: "vab", label: "Vehicle Assembly Building", short: "VAB", x: -30, z: 544, yaw: 0.02, pitch: 0.22 },
    { id: "lcc", label: "Launch Control Center", short: "LCC", x: -180, z: 232, yaw: Math.PI, pitch: 0.05 },
    { id: "mcc", label: "Mission Control Center", short: "MCC", x: -60, z: 280, yaw: Math.PI, pitch: 0.05 },
    { id: "crawler", label: "Crawler Transporter", short: "CRAWLER", x: 34, z: 452, yaw: Math.atan2(-34, 48), pitch: 0.06 },
    { id: "beach", label: "Beach View", short: "BEACH", x: 474, z: 18, yaw: Math.PI / 2 - 0.14, pitch: 0.0 },
    { id: "press", label: "Press Site 39A", short: "PRESS", x: 162, z: 214, yaw: Math.atan2(-162, -214) - 0.14, pitch: 0.08 },
    { id: "pad39b", label: "Pad 39B", short: "PAD 39B", x: -120, z: -520, yaw: Math.PI, pitch: 0.1 },
    { id: "crawlerway39b", label: "LC-39B Crawler Transporter", short: "39B CRAWLER", x: -185, z: -560, yaw: 2.123, pitch: 0.04 }
  ];

  NS.CRAWLERWAY_39B_POINTS = [
    [0, 415],
    [-315, 340],
    [-315, -240],
    [-120, -622]
  ];

  // Shared surface geometry & height-aware navigation helpers so terrain visuals,
  // walking site-tour physics, and the drivable open car stay aligned everywhere.
  const PAD_39A = {
    deckTopY: 12.5,
    rampStartZ: 186.0,
    rampEndZ: 60.0,
    rampStartY: 0.14,
    rampHalfW: 19.0,
    deckApothem: 58.39,
    bermR: 90.0
  };

  const PAD_39B_ROT = -0.46;
  const PAD_39B = {
    cx: -120,
    cz: -760,
    cosR: Math.cos(PAD_39B_ROT),
    sinR: Math.sin(PAD_39B_ROT),
    deckTopY: 6.42,
    rampStartLocalZ: 130.0,
    rampEndLocalZ: 60.0,
    rampStartY: 0.12,
    rampHalfW: 17.0,
    deckApothem: 54.14,
    bermR: 74.0
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function inRotatedOctagon(x, z, apothem) {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    return ax <= apothem && az <= apothem && (ax + az) * Math.SQRT1_2 <= apothem;
  }

  function pointSegmentDistSq(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq < 1e-6) return (px - ax) * (px - ax) + (pz - az) * (pz - az);
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / lenSq, 0, 1);
    const nx = ax + dx * t;
    const nz = az + dz * t;
    return (px - nx) * (px - nx) + (pz - nz) * (pz - nz);
  }

  function distToPolyline(px, pz, pts) {
    let minSq = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const sq = pointSegmentDistSq(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (sq < minSq) minSq = sq;
    }
    return Math.sqrt(minSq);
  }

  function to39BLocal(x, z) {
    const dx = x - PAD_39B.cx;
    const dz = z - PAD_39B.cz;
    return {
      x: dx * PAD_39B.cosR - dz * PAD_39B.sinR,
      z: dx * PAD_39B.sinR + dz * PAD_39B.cosR
    };
  }

  function inBox(x, z, minX, maxX, minZ, maxZ, r) {
    return x > minX - r && x < maxX + r && z > minZ - r && z < maxZ + r;
  }

  function getSurfaceHeightAt(x, z, currentY) {
    const refY = typeof currentY === "number" && Number.isFinite(currentY) ? currentY : null;

    // 1. Pad 39A south crawlerway ramp (linear 0.14m at z=186 -> 12.50m at z=60)
    if (Math.abs(x) <= PAD_39A.rampHalfW + 0.45 && z >= 57.5 && z <= PAD_39A.rampStartZ + 1.0) {
      const t = clamp((PAD_39A.rampStartZ - z) / (PAD_39A.rampStartZ - PAD_39A.rampEndZ), 0, 1);
      return PAD_39A.rampStartY + t * (PAD_39A.deckTopY - PAD_39A.rampStartY);
    }

    // 2. Pad 39A octagonal summit hardstand (12.50m)
    if ((refY === null || refY >= 4.5) && inRotatedOctagon(x, z, 60.2)) {
      return PAD_39A.deckTopY;
    }

    // 3. Pad 39B crawlerway ramp & octagonal hardstand (local frame)
    const p39b = to39BLocal(x, z);
    if (Math.abs(p39b.x) <= PAD_39B.rampHalfW + 0.45 && p39b.z >= 56.0 && p39b.z <= PAD_39B.rampStartLocalZ + 1.0) {
      const t = clamp(
        (PAD_39B.rampStartLocalZ - p39b.z) / (PAD_39B.rampStartLocalZ - PAD_39B.rampEndLocalZ),
        0,
        1
      );
      return PAD_39B.rampStartY + t * (PAD_39B.deckTopY - PAD_39B.rampStartY);
    }
    if ((refY === null || refY >= 2.2) && inRotatedOctagon(p39b.x, p39b.z, 56.0)) {
      return PAD_39B.deckTopY;
    }

    // 4. Pad 39B approach apron between end of spur (-120, -622) and 39B ramp toe
    if (pointSegmentDistSq(x, z, -120, -622, -177.7, -643.5) <= 9.5 * 9.5) {
      return 0.12;
    }

    // 5. Interior building slabs & elevated plinths
    if (Math.abs(x + 180) < 35 && Math.abs(z - 180) < 23) return 0.24; // LCC
    if (Math.abs(x + 60) < 29 && Math.abs(z - 240) < 20) return 0.24;  // MCC
    if (Math.abs(x + 30) < 79 && Math.abs(z - 700) < 109) return 0.18; // VAB

    // 6. Main crawlerway, crossings, and LC-39B crawlerway spur (0.14m gravel)
    if (
      (Math.abs(x) <= 21.0 && z >= PAD_39A.rampStartZ && z <= 592) ||
      (Math.abs(x) <= 24.5 && Math.abs(z - 296) <= 8.5) ||
      (Math.abs(x + 315) <= 24.5 && Math.abs(z - 296) <= 8.5) ||
      distToPolyline(x, z, NS.CRAWLERWAY_39B_POINTS) <= 21.0
    ) {
      return 0.14;
    }

    // 7. Paved roads & parking pads
    if (Math.abs(x - 38) <= 3.7 && Math.abs(z - 197) <= 3.3) return 0.08;
    const rPadA = Math.hypot(x, z);
    if (rPadA >= 144.3 && rPadA <= 153.7) return 0.09;
    if (rPadA <= 134.5) return 0.08;
    if (Math.abs(z - 296) <= 7.2 && x >= -695 && x <= 190) return 0.12;
    if (Math.abs(x - 180) <= 7.2 && z >= -150 && z <= 292) return 0.12;
    if (x >= -234 && x <= -126 && z >= 244 && z <= 290) return 0.12;

    // 8. Atlantic foreshore downward beach slope east of dune ridge
    if (x > 468 && x < 550) {
      return Math.max(-0.5, 0.5 - (x - 468) * 0.018);
    }
    return 0.0;
  }

  function getSurfaceSlopePitchRoll(x, z, yaw, currentY) {
    const cy = getSurfaceHeightAt(x, z, currentY);
    const refY = Math.max(cy, typeof currentY === "number" ? currentY : cy);
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const halfWB = 1.425;
    const halfTrack = 0.98;

    const yFront = getSurfaceHeightAt(x + sinY * halfWB, z + cosY * halfWB, refY);
    const yRear = getSurfaceHeightAt(x - sinY * halfWB, z - cosY * halfWB, refY);
    const yLeft = getSurfaceHeightAt(x + cosY * halfTrack, z - sinY * halfTrack, refY);
    const yRight = getSurfaceHeightAt(x - cosY * halfTrack, z + sinY * halfTrack, refY);

    return {
      pitch: -Math.atan2(yFront - yRear, halfWB * 2),
      roll: Math.atan2(yLeft - yRight, halfTrack * 2),
      centerY: cy
    };
  }

  function pad39ABlocked(x, z, r, effY) {
    if (Math.hypot(x, z) > 195.0) return false;
    const curbHalfW = PAD_39A.rampHalfW - 0.15; // 18.85m inner curb clearance
    const inRampChannel = Math.abs(x) <= curbHalfW - r && z >= 52.0 && z <= PAD_39A.rampStartZ + 0.5;
    if (inRampChannel) return false;

    const onHighPad = effY >= 4.5 && Math.hypot(x, z) <= 85.0;
    if (onHighPad && z < 61.0) {
      // Must stay inside top perimeter railing except when heading onto south ramp mouth
      if (!inRotatedOctagon(x, z, 57.6 - r)) return true;
      // Mobile Launcher Platform, trench walls, open flame trench, and FSS Launch Tower
      if (inBox(x, z, -25.2, 25.2, -21.5, 21.5, r)) return true;
      if (inBox(x, z, -16.2, 16.2, 21.5, 46.8, r)) return true;
      if (inBox(x, z, -16.2, 16.2, -46.8, -21.5, r)) return true;
      if (inBox(x, z, -43.0, -25.0, -11.5, 11.5, r)) return true;
      return false;
    }

    // Outside ramp or ground level: block berm cone & side wing embankments (and ramp from sides)
    if (Math.hypot(x, z) < PAD_39A.bermR + r) return true;
    if (inBox(x, z, 18.85, 31.2, 58.0, 186.2, r)) return true;
    if (inBox(x, z, -31.2, -18.85, 58.0, 186.2, r)) return true;
    if (effY < 4.0 && inBox(x, z, -18.85, 18.85, 58.0, 184.0, r)) return true;
    return false;
  }

  function pad39BBlocked(x, z, r, effY) {
    const l = to39BLocal(x, z);
    if (Math.hypot(l.x, l.z) > 140.0) return false;
    const curbHalfW = PAD_39B.rampHalfW - 0.2;
    const inRampChannel = Math.abs(l.x) <= curbHalfW - r && l.z >= 49.0 && l.z <= PAD_39B.rampStartLocalZ + 0.5;
    if (inRampChannel) return false;

    const onHighPad = effY >= 2.2 && Math.hypot(l.x, l.z) <= 75.0;
    if (onHighPad && l.z < 58.0) {
      if (!inRotatedOctagon(l.x, l.z, 53.5 - r)) return true;
      if (inBox(l.x, l.z, -25.5, 25.5, -21.2, 21.2, r)) return true;
      if (inBox(l.x, l.z, -26.5, 26.5, -7.5, 7.5, r)) return true;
      if (inBox(l.x, l.z, -50.0, -34.0, -8.0, 8.0, r)) return true;
      return false;
    }

    if (Math.hypot(l.x, l.z) < PAD_39B.bermR + r) return true;
    if (inBox(l.x, l.z, 16.8, 29.0, 56.0, 130.2, r)) return true;
    if (inBox(l.x, l.z, -29.0, -16.8, 56.0, 130.2, r)) return true;
    if (effY < 2.0 && inBox(l.x, l.z, -16.8, 16.8, 56.0, 128.0, r)) return true;
    return false;
  }

  function isBlocked(x, z, radius, currentY, boxes, circles, bounds) {
    const b = bounds || NS.constants.SITE_BOUNDS;
    if (x < b.minX + radius || x > b.maxX - radius || z < b.minZ + radius || z > b.maxZ - radius) {
      return true;
    }
    const effY =
      typeof currentY === "number" && Number.isFinite(currentY)
        ? currentY
        : getSurfaceHeightAt(x, z, 0);

    if (pad39ABlocked(x, z, radius, effY)) return true;
    if (pad39BBlocked(x, z, radius, effY)) return true;

    if (boxes) {
      for (const box of boxes) {
        if (typeof box.minY === "number" && effY < box.minY) continue;
        if (typeof box.maxY === "number" && effY > box.maxY) continue;
        if (x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius) {
          return true;
        }
      }
    }
    if (circles) {
      for (const circle of circles) {
        if (typeof circle.minY === "number" && effY < circle.minY) continue;
        if (typeof circle.maxY === "number" && effY > circle.maxY) continue;
        if (Math.hypot(x - circle.x, z - circle.z) < circle.r + radius) return true;
      }
    }
    return false;
  }

  function resolveMovement(curX, curZ, nextX, nextZ, radius, currentY, boxes, circles, bounds) {
    const b = bounds || NS.constants.SITE_BOUNDS;
    const cx = clamp(nextX, b.minX + radius, b.maxX - radius);
    const cz = clamp(nextZ, b.minZ + radius, b.maxZ - radius);

    if (!isBlocked(cx, cz, radius, currentY, boxes, circles, b)) {
      return { x: cx, z: cz, y: getSurfaceHeightAt(cx, cz, currentY), blocked: false };
    }

    const dx = cx - curX;
    const dz = cz - curZ;
    const candidates = [
      [cx, curZ],
      [curX, cz]
    ];
    // Include angled slide probes for 45-deg octagonal pad corners and rotated 39B ramp
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) {
      for (const ang of [0.46, -0.46, Math.PI * 0.25, -Math.PI * 0.25]) {
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const rx = dx * ca - dz * sa;
        const rz = dx * sa + dz * ca;
        candidates.push([curX + rx * 0.85, curZ + rz * 0.85]);
      }
    }

    let best = null;
    let bestScore = -1;
    for (const [tx, tz] of candidates) {
      const clampedX = clamp(tx, b.minX + radius, b.maxX - radius);
      const clampedZ = clamp(tz, b.minZ + radius, b.maxZ - radius);
      if (!isBlocked(clampedX, clampedZ, radius, currentY, boxes, circles, b)) {
        const progress = (clampedX - curX) * dx + (clampedZ - curZ) * dz;
        if (progress > bestScore) {
          bestScore = progress;
          best = [clampedX, clampedZ];
        }
      }
    }

    if (best) {
      return {
        x: best[0],
        z: best[1],
        y: getSurfaceHeightAt(best[0], best[1], currentY),
        blocked: true,
        slid: true
      };
    }

    return {
      x: curX,
      z: curZ,
      y: getSurfaceHeightAt(curX, curZ, currentY),
      blocked: true,
      slid: false
    };
  }

  NS.terrain = {
    PAD_39A,
    PAD_39B,
    clamp,
    distToPolyline,
    getSurfaceHeightAt,
    getSurfaceSlopePitchRoll,
    isBlocked,
    resolveMovement
  };

  NS.register = function (name, builder) {
    NS.builders = NS.builders || {};
    NS.builders[name] = builder;
  };

  if (typeof module === "object" && module.exports) {
    module.exports = NS;
  }
})(window);
