/**
 * Space Center 2 — Coastal Space Coast roads, crawlerway, parking lot, checkpoint,
 * Press Site 39A, Turn Basin, Beach dune walkover boardwalk, and instanced foliage.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("environment", function buildEnvironment(site) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.name = "SC2_Environment";
    site.group.add(g);

    const C = NS.constants;
    const m = (k) => site.mat(k);
    const asphalt = m("asphalt");
    const gravel = m("gravel");
    const concrete = m("concrete");
    const concreteDark = m("concrete_dark");
    const curbMat = m("concrete_curb");
    const foliage = m("foliage");
    const grass = m("grass");
    const stripeWhite = m("stripe_white");
    const stripeYellow = m("stripe_yellow");

    // Helper: non-overlapping road segment at top y = 0.12 (ground y = 0.0)
    // Subdivided along length so procedural noise UVs stay distortion-free.
    const addRoad = (ax, az, bx, bz, width = 12, opts = {}) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) return;
      const yaw = Math.atan2(bx - ax, bz - az);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      const nx = -dz;
      const nz = dx;

      const chunks = Math.max(1, Math.ceil(len / 40));
      const chunkLen = len / chunks;
      for (let i = 0; i < chunks; i++) {
        const d0 = (i + 0.5) * chunkLen;
        const cx = ax + dx * d0;
        const cz = az + dz * d0;
        site.boxRot(g, width, 0.12, chunkLen, cx, 0.06, cz, 0, yaw, 0, asphalt, "RoadAsphalt");
        if (!opts.noCurbs) {
          const trimS = i === 0 ? (opts.trimStart || 0) : 0;
          const trimE = i === chunks - 1 ? (opts.trimEnd || 0) : 0;
          const curbLen = Math.max(0.4, chunkLen - trimS - trimE);
          const cOff = (trimS - trimE) * 0.5;
          for (const side of [-1, 1]) {
            site.boxRot(
              g,
              0.34,
              0.22,
              curbLen,
              cx + dx * cOff + nx * side * (width * 0.5 + 0.17),
              0.11,
              cz + dz * cOff + nz * side * (width * 0.5 + 0.17),
              0,
              yaw,
              0,
              curbMat,
              "RoadCurb"
            );
            site.boxRot(
              g,
              0.16,
              0.012,
              Math.max(0.4, chunkLen - 0.1),
              cx + nx * side * (width * 0.5 - 0.55),
              0.138,
              cz + nz * side * (width * 0.5 - 0.55),
              0,
              yaw,
              0,
              stripeWhite,
              "RoadEdgeLine"
            );
          }
        }
      }

      if (!opts.noDashes) {
        for (let t = 5; t < len - 5; t += 11) {
          site.boxRot(
            g,
            0.24,
            0.012,
            4.2,
            ax + dx * t,
            0.138,
            az + dz * t,
            0,
            yaw,
            0,
            stripeYellow,
            "RoadCenterDash"
          );
        }
      }
    };

    // -------------------------------------------------------------------------
    // 1. CRUSHED LIMESTONE CRAWLERWAY (VAB Portal z=591 -> Pad Ramp Toe z=186)
    //    and non-intersecting LC-39B spur routed cleanly west of Pad 39A.
    //    Segmented into <=24m chunks so grass/gravel UVs never stretch into streaks.
    // -------------------------------------------------------------------------
    const addCrawlerwaySegment = (ax, az, bx, bz, suffix = "") => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) return;
      const yaw = Math.atan2(bx - ax, bz - az);
      const dx = (bx - ax) / len;
      const dz = (bz - az) / len;
      const lxX = Math.cos(yaw);
      const lxZ = -Math.sin(yaw);

      const chunks = Math.max(1, Math.ceil(len / 24));
      const chunkLen = len / chunks;
      for (let i = 0; i < chunks; i++) {
        const dMid = (i + 0.5) * chunkLen;
        const cx = ax + dx * dMid;
        const cz = az + dz * dMid;
        for (const sideX of [-14, 14]) {
          site.boxRot(
            g,
            13.5,
            0.14,
            chunkLen,
            cx + lxX * sideX,
            0.07,
            cz + lxZ * sideX,
            0,
            yaw,
            0,
            gravel,
            `CrawlerLane${suffix}`
          );
          site.boxRot(
            g,
            4.2,
            0.016,
            chunkLen,
            cx + lxX * sideX,
            0.148,
            cz + lxZ * sideX,
            0,
            yaw,
            0,
            concreteDark,
            `CrawlerRut${suffix}`
          );
        }
        // Full 14.5m median fills gap edge-to-edge cleanly between both gravel lanes
        site.boxRot(g, 14.5, 0.08, chunkLen, cx, 0.04, cz, 0, yaw, 0, grass, `CrawlerMedian${suffix}`);
        for (const sx of [-23, 23]) {
          site.boxRot(
            g,
            4.5,
            0.06,
            chunkLen,
            cx + lxX * sx,
            0.03,
            cz + lxZ * sx,
            0,
            yaw,
            0,
            grass,
            `CrawlerShoulder${suffix}`
          );
        }
      }
    };

    // Main Pad 39A Crawlerway (stops flush at Crossing Slab z=304..288 & Pad 39A ramp toe z=186)
    addCrawlerwaySegment(0, 591, 0, 304);
    addCrawlerwaySegment(0, 288, 0, 186);

    // LC-39B Crawlerway Spur routed around west side of Pad 39A & LCC
    const spurPts = NS.CRAWLERWAY_39B_POINTS;
    addCrawlerwaySegment(spurPts[0][0], spurPts[0][1], spurPts[1][0], spurPts[1][1], "39B");
    addCrawlerwaySegment(spurPts[1][0], spurPts[1][1], -315, 304, "39B");
    addCrawlerwaySegment(-315, 288, spurPts[2][0], spurPts[2][1], "39B");
    addCrawlerwaySegment(spurPts[2][0], spurPts[2][1], spurPts[3][0], spurPts[3][1], "39B");
    for (const [vx, vz] of spurPts) {
      // The turning pad sits 2 cm proud of the gravel lane tops so the two
      // coplanar surfaces at the bends cannot z-fight. Radius covers the full
      // crawlerway width including the grass shoulders.
      site.cyl(g, 26.0, 0.16, vx, 0.08, vz, gravel, 24, "CrawlerTurnPad39B");
    }

    // -------------------------------------------------------------------------
    // 2. NON-OVERLAPPING ROAD NETWORK & CRAWLERWAY CROSSINGS
    // -------------------------------------------------------------------------
    // Main KSC West-to-East Avenue at z=296, split around both crawlerway crossings
    addRoad(-692, 296, -339, 296, 14);
    addRoad(-291, 296, -24, 296, 14);
    addRoad(24, 296, 187, 296, 14);
    for (const [cx, tag] of [[0, ""], [-315, "39B"]]) {
      // Crossing deck is 1 cm proud of the crawlerway so the crossing surface
      // is not in the same depth plane as the gravel lanes it overlaps.
      site.box(g, 48, 0.15, 16, cx, 0.075, 296, concrete, `CrawlerCrossingSlab${tag}`);
      for (const sx of [-23.5, 23.5]) {
        site.box(g, 0.6, 0.012, 15.6, cx + sx, 0.158, 296, stripeYellow, `CrossingStripe${tag}`);
      }
    }

    // East Pad Access Boulevard (from north curb of Avenue z=289 north to Pad ring z=-30)
    addRoad(180, 289, 180, 152, 14);
    addRoad(180, -30, 180, -148, 12);

    // West Utility & Industrial Backbone
    addRoad(-692, 289, -692, 50, 12);
    addRoad(-686, 56, -560, 56, 12);
    addRoad(-686, 92, -595, 92, 11);

    // Spur Roads to Press Site & Propellant Compound
    addRoad(156, 214, 173, 214, 10, { noDashes: true });
    addRoad(-172, 88, -138, 88, 10, { noDashes: true });

    // -------------------------------------------------------------------------
    // 3. LCC PARKING LOT (Bridges LCC Plaza z=245 continuously to Avenue z=289!)
    // -------------------------------------------------------------------------
    // Split the wide lot into tiles so one asphalt tile is not stretched across
    // 106 metres. The merged static-box pass still batches every tile.
    const lotW = 106, lotD = 44, lotX = -180, lotZ = 267;
    const lotCols = 4, lotRows = 2;
    for (let col = 0; col < lotCols; col++) {
      for (let row = 0; row < lotRows; row++) {
        const tileW = lotW / lotCols;
        const tileD = lotD / lotRows;
        site.box(
          g,
          tileW,
          0.12,
          tileD,
          lotX - lotW * 0.5 + tileW * (col + 0.5),
          0.06,
          lotZ - lotD * 0.5 + tileD * (row + 0.5),
          asphalt,
          "LCCParkingLot"
        );
      }
    }
    // Entry aisle markings & wheel stops for 22 stalls across two banks
    for (let i = 0; i <= 10; i++) {
      const sx = -224 + i * 8.8;
      if (Math.abs(sx - (-180)) < 5) continue; // Keep central promenade driving lane clear
      site.box(g, 0.14, 0.012, 12, sx, 0.138, 253, stripeWhite, "ParkingStripeN");
      site.box(g, 0.14, 0.012, 12, sx, 0.138, 281, stripeWhite, "ParkingStripeS");
      if (i < 10 && Math.abs(sx + 4.4 - (-180)) >= 5) {
        site.box(g, 2.1, 0.18, 0.24, sx + 4.4, 0.21, 248.4, curbMat, "WheelStopN");
        site.box(g, 2.1, 0.18, 0.24, sx + 4.4, 0.21, 285.6, curbMat, "WheelStopS");
      }
    }
    // Parking curb islands & dual-arm parking lot LED light standards
    for (const lx of [-218, -192, -168, -142]) {
      site.lightPole(g, lx, 267, Math.PI / 2, 10, true, 0.12);
    }

    // Detailed multi-part Vehicles neatly parked inside stalls
    const carPalette = ["nasa_blue", "red", "silver", "black", "steel_white", "navy", "yellow", "silver"];
    const stallX = [-219.6, -210.8, -202.0, -193.2, -166.8, -158.0, -149.2, -140.4];
    stallX.forEach((cx, i) => {
      const variant = i === 4 ? "van" : i % 3 === 1 ? "truck" : "sedan";
      site.vehicle(g, cx, 253, Math.PI, carPalette[i % carPalette.length], variant, 0.12);
      if (i % 2 === 0) {
        site.vehicle(g, cx, 281, 0, carPalette[(i + 3) % carPalette.length], i === 6 ? "van" : "sedan", 0.12);
      }
    });

    // Street lights lining Main Avenue and Pad Boulevard
    for (let x = -540; x <= 140; x += 90) {
      if (Math.abs(x) < 34 || Math.abs(x + 315) < 30) continue;
      site.lightPole(g, x, 287.5, 0, 10.5, false, 0);
    }
    for (let z = -80; z <= 250; z += 75) {
      site.lightPole(g, 190, z, Math.PI / 2, 10.5, false, 0);
    }

    // -------------------------------------------------------------------------
    // 4. SECURITY GATEHOUSE CHECKPOINT & KSC DIRECTIONAL ROAD SIGNS
    // -------------------------------------------------------------------------
    const gateX = -390;
    const gateZ = 296;
    site.addBoxCollider(gateX, gateZ, 6.4, 5.4, "Security gatehouse");
    site.box(g, 14, 0.22, 4.2, gateX, 0.11, gateZ, curbMat, "GateMedianIsland");
    site.box(g, 4.8, 3.4, 3.2, gateX, 1.92, gateZ, m("steel_white"), "GatehouseBody");
    site.box(g, 5.8, 0.45, 5.2, gateX, 3.85, gateZ, m("nasa_blue"), "GatehouseRoof");
    site.box(g, 4.9, 1.3, 3.3, gateX, 2.45, gateZ, m("glass"), "GatehouseGlass");
    for (const laneZ of [292.2, 299.8]) {
      site.box(g, 0.35, 1.2, 0.35, gateX + 2.5, 0.7, laneZ, m("yellow"), "GatePost");
      site.box(g, 0.14, 0.16, 4.6, gateX + 2.5, 1.15, laneZ - (laneZ > 296 ? 1.8 : -1.8), m("red"), "GateBoom");
    }

    site.signBoard(
      g,
      -364,
      1.8,
      287,
      0,
      10.5,
      2.6,
      (ctx, w, h) => {
        ctx.fillStyle = "#064e3b";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#efeee7";
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.fillStyle = "#efeee7";
        ctx.font = "900 44px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("KENNEDY SPACE CENTER · LC-39A  →", w * 0.5, h * 0.44);
        ctx.fillStyle = "#e4ff7e";
        ctx.font = "700 30px Arial, Helvetica, sans-serif";
        ctx.fillText("ROCKET HALL / CONTROL ROOM AHEAD · CREW ONLY", w * 0.5, h * 0.76);
      },
      "KSCEntranceSign"
    );

    site.signBoard(
      g,
      -42,
      1.6,
      286.5,
      Math.PI * 0.18,
      7.2,
      2.1,
      (ctx, w, h) => {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#e4ff7e";
        ctx.lineWidth = 8;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = "#e4ff7e";
        ctx.font = "900 42px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("CAUTION: CRAWLERWAY XING", w * 0.5, h * 0.44);
        ctx.fillStyle = "#efeee7";
        ctx.font = "700 32px Arial, Helvetica, sans-serif";
        ctx.fillText("HEAVY TRANSPORTER RIGHT OF WAY", w * 0.5, h * 0.76);
      },
      "CrawlerCrossingSign"
    );

    // -------------------------------------------------------------------------
    // 5. PRESS SITE 39A (Count Clock, Non-Moire Bleachers, Press Vans & Cameras)
    // -------------------------------------------------------------------------
    const press = C.PRESS; // (118, 214)
    site.box(g, 74, 0.2, 46, press.x, 0.1, press.z, concreteDark, "PressPlinth");
    // Raised grass press viewing terrace
    site.box(g, 68, 1.4, 40, press.x, 0.9, press.z, grass, "PressMoundCore");
    // Trimmed non-overlapping concrete retaining fascia around mound
    site.box(g, 69.2, 1.45, 0.8, press.x, 0.92, press.z - 20.4, concrete, "PressWallN");
    site.box(g, 69.2, 1.45, 0.8, press.x, 0.92, press.z + 20.4, concrete, "PressWallS");
    site.box(g, 0.8, 1.45, 40.0, press.x - 34.2, 0.92, press.z, concrete, "PressWallW");
    site.box(g, 0.8, 1.45, 40.0, press.x + 34.2, 0.92, press.z, concrete, "PressWallE");

    // Clean terraced grandstand bleachers (zero thin vertical moire ribbing!)
    const standX = press.x + 10;
    const standZ = press.z;
    for (let step = 0; step < 5; step++) {
      const sy = 1.6 + step * 0.72;
      const sz = standZ + 8 - step * 2.2;
      site.box(g, 38, 0.72, 2.2, standX, sy + 0.36, sz, curbMat, "PressBleacherTier");
      site.box(g, 38.2, 0.14, 1.2, standX, sy + 0.79, sz, m("steel_grey"), "PressBleacherSeat");
    }
    site.railing(g, press.x - 32, press.z - 18.8, press.x + 32, press.z - 18.8, 1.6, m("steel_white"));

    // Iconic Backlit Digital Mission Countdown Clock facing Bleachers & Camera
    const clockX = press.x - 20;
    const clockZ = press.z - 12;
    site.box(g, 11.4, 6.2, 1.4, clockX, 4.7, clockZ, m("black"), "ClockHousing");
    site.cyl(g, 0.34, 4.0, clockX - 4.2, 2.0, clockZ, steelMat(site), 8, "ClockLegL");
    site.cyl(g, 0.34, 4.0, clockX + 4.2, 2.0, clockZ, steelMat(site), 8, "ClockLegR");
    const drawClockFace = (ctx, w, h) => {
      ctx.fillStyle = "#080c12";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#efeee7";
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = "#c9f04b";
      ctx.font = "700 32px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("KENNEDY SPACE CENTER · LC-39A", w * 0.5, 48);
      ctx.fillStyle = "#e4ff7e";
      ctx.font = "900 104px Courier New, monospace";
      ctx.fillText("T-00:08:42", w * 0.5, 144);
      ctx.fillStyle = "#63e6a8";
      ctx.font = "800 28px Arial, Helvetica, sans-serif";
      ctx.fillText("STAGE 1 GO · BOARDING IN PROGRESS", w * 0.5, 212);
    };
    site.canvasPlane(g, 10.6, 5.4, clockX, 4.7, clockZ - 0.74, 0, Math.PI, 0, drawClockFace, 512, 256, {
      emissiveMap: true,
      emissiveIntensity: 0.75,
      name: "ClockFaceNorth"
    });
    site.canvasPlane(g, 10.6, 5.4, clockX, 4.7, clockZ + 0.74, 0, 0, 0, drawClockFace, 512, 256, {
      emissiveMap: true,
      emissiveIntensity: 0.75,
      name: "ClockFaceSouth"
    });

    // NASA Press Flagpole, Broadcast Satellite Van, Canopy Tent & TV Tripod Cameras
    site.flagPole(g, press.x - 30, press.z - 13, 18, "usa", 1.6);
    site.vehicle(g, press.x + 28, press.z + 12, Math.PI * 0.78, "steel_white", "van", 1.6);
    site.sphere(g, 1.15, press.x + 28, 3.85, press.z + 12, m("white"), 10, "SatDishDome");
    for (const tx of [press.x - 16, press.x - 4]) {
      site.box(g, 6.2, 0.24, 5.4, tx, 4.35, press.z + 11, m("nasa_blue"), "PressCanopyRoof");
      for (const lx of [-2.8, 2.8]) {
        for (const lz of [-2.4, 2.4]) {
          site.cyl(g, 0.06, 2.75, tx + lx, 2.97, press.z + 11 + lz, m("steel_grey"), 6, "CanopyLeg");
        }
      }
    }
    for (let c = 0; c < 3; c++) {
      const cx = press.x - 10 + c * 9;
      const cz = press.z - 16;
      site.cyl(g, 0.08, 1.5, cx, 2.35, cz, m("black"), 6, "CameraTripod");
      site.box(g, 0.45, 0.35, 0.9, cx, 3.18, cz, m("black"), "BroadcastCamera");
    }
    site.addBoxCollider(press.x, press.z, 74, 46, "Press mound");

    // -------------------------------------------------------------------------
    // 6. BEACH DUNE WALKOVER BOARDWALK & HERO PALM GROVES
    // -------------------------------------------------------------------------
    // Timber dune walkover boardwalk right by Beach Tour Stop (x=464..502, z=10)
    const bwZ = 10;
    const timberMat = m("trunk");
    site.box(g, 34, 0.26, 4.2, 480, 1.18, bwZ, timberMat, "BeachBoardwalkDeck");
    for (let bx = 465; bx <= 496; bx += 5) {
      for (const sz of [-1.85, 1.85]) {
        site.cyl(g, 0.14, 2.0, bx, 0.9, bwZ + sz, timberMat, 7, "BoardwalkPiling");
      }
    }
    site.railing(g, 464, bwZ - 1.9, 496, bwZ - 1.9, 1.32, timberMat);
    site.railing(g, 464, bwZ + 1.9, 496, bwZ + 1.9, 1.32, timberMat);
    // Boardwalk steps descending onto sandy beach
    for (let s = 0; s < 4; s++) {
      site.box(g, 1.2, 0.26, 4.2, 497.5 + s * 1.15, 0.94 - s * 0.22, bwZ, timberMat, "BoardwalkStep");
    }
    site.signBoard(
      g,
      467,
      1.6,
      bwZ + 3.4,
      Math.PI * 0.35,
      4.4,
      1.6,
      (ctx, w, h) => {
        ctx.fillStyle = "#14532d";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#efeee7";
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = "#efeee7";
        ctx.font = "900 40px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("CANAVERAL SHORE", w * 0.5, h * 0.42);
        ctx.font = "700 28px Arial, Helvetica, sans-serif";
        ctx.fillText("PROTECTED DUNE WALKOVER", w * 0.5, h * 0.74);
      },
      "BeachWalkSign"
    );

    // Hero Sabal / Coconut Palm Trees framing landmarks & Atlantic coastline
    const palmCoords = [
      // Beach shoreline grove
      [464, -75, 1.15, 1], [462, -40, 1.0, 4], [464, -12, 1.2, 2],
      [463, 28, 1.1, 6], [465, 58, 1.25, 3], [462, 95, 1.05, 8],
      [459, 145, 1.15, 5], [460, -135, 1.1, 9],
      // Press site framing
      [158, 198, 1.1, 3], [160, 224, 1.0, 6], [78, 226, 1.05, 2],
      // Road & VAB plaza accents
      [-126, 232, 1.1, 4], [-234, 232, 1.05, 7],
      [-92, 540, 1.15, 5], [32, 540, 1.1, 8],
      [-315, 282, 1.1, 9]
    ];
    palmCoords.forEach(([px, pz, scale, seed]) => {
      site.palmTree(g, px, pz, scale, seed, 0);
    });

    // -------------------------------------------------------------------------
    // 7. INSTANCED COASTAL PINE FOREST & SCRUB BUSHES (Zero horizon emptiness!)
    // -------------------------------------------------------------------------
    const pinePlacements = [];
    const scrubPlacements = [];
    const pseudoRand = (n) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    // Beach scrub dunes + inland treeline along shoreline (x=428..458)
    for (let i = 0; i < 65; i++) {
      const z = -650 + i * 21 + (pseudoRand(i) - 0.5) * 12;
      const x = 430 + pseudoRand(i + 100) * 28;
      pinePlacements.push({ x, z, s: 0.75 + pseudoRand(i + 200) * 0.55 });
      scrubPlacements.push({ x: x + 12, z: z + 5, s: 0.8 + pseudoRand(i + 300) * 0.9 });
    }
    // Crawlerway wildlife preserve corridors flanking outside road shoulders
    for (let i = 0; i < 48; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = 325 + Math.floor(i / 2) * 11.5;
      const x = side * (62 + pseudoRand(i + 400) * 65);
      if (Math.abs(x - (-30)) < 115 && z > 520) continue; // Keep VAB clear
      if (NS.terrain && NS.terrain.distToPolyline(x, z, NS.CRAWLERWAY_39B_POINTS) < 34) continue;
      pinePlacements.push({ x, z, s: 0.8 + pseudoRand(i + 500) * 0.6 });
    }
    // Western horizon Space Coast preserve belt (around utilities, turn basin, Ave).
    // Stops north of the LC-39B complex so the pad and crawlerway spur stay clear.
    for (let i = 0; i < 95; i++) {
      const z = -420 + i * 13 + (pseudoRand(i + 600) - 0.5) * 10;
      if (z < -560) continue;
      const x = -540 - pseudoRand(i + 700) * 460;
      // Keep roads, substation, cooling tower, generator, turn basin & antenna farm clear
      if (Math.abs(z - 296) < 22 || Math.abs(z - 56) < 34 || Math.abs(z - 92) < 28) continue;
      if (Math.hypot(x - C.ANTENNA.x, z - C.ANTENNA.z) < 42) continue;
      if (Math.hypot(x - C.TURN_BASIN.x, z - C.TURN_BASIN.z) < 58) continue;
      if (NS.terrain && NS.terrain.distToPolyline(x, z, NS.CRAWLERWAY_39B_POINTS) < 34) continue;
      pinePlacements.push({ x, z, s: 0.85 + pseudoRand(i + 800) * 0.65 });
    }
    // Eastern inland treeline between Pad boulevard & Beach
    for (let i = 0; i < 65; i++) {
      const z = -400 + i * 14;
      const x = 225 + pseudoRand(i + 900) * 185;
      if (Math.hypot(x - press.x, z - press.z) < 54) continue;
      if (Math.abs(z - 296) < 22) continue;
      pinePlacements.push({ x, z, s: 0.8 + pseudoRand(i + 1000) * 0.55 });
    }

    if (THREE.InstancedMesh && pinePlacements.length) {
      const count = pinePlacements.length;
      const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 5.4, 6);
      const canopyLowGeo = new THREE.ConeGeometry(3.4, 6.2, 8);
      const canopyHighGeo = new THREE.DodecahedronGeometry(2.3, 1);

      const pineLowMat = new THREE.MeshStandardMaterial({ color: 0x2e4d25, roughness: 0.96, metalness: 0.0 });
      const pineHighMat = new THREE.MeshStandardMaterial({ color: 0x3b602d, roughness: 0.95, metalness: 0.0 });

      const trunkInst = new THREE.InstancedMesh(trunkGeo, m("trunk"), count);
      const lowInst = new THREE.InstancedMesh(canopyLowGeo, pineLowMat, count);
      const highInst = new THREE.InstancedMesh(canopyHighGeo, pineHighMat, count);
      trunkInst.castShadow = true;
      lowInst.castShadow = true;
      highInst.castShadow = true;
      lowInst.receiveShadow = true;
      highInst.receiveShadow = true;

      const dummy = new THREE.Object3D();
      pinePlacements.forEach((p, idx) => {
        dummy.position.set(p.x, 2.7 * p.s, p.z);
        dummy.rotation.set(0, (idx * 1.13) % (Math.PI * 2), 0);
        dummy.scale.set(p.s, p.s, p.s);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(p.x, 6.1 * p.s, p.z);
        dummy.scale.set(p.s, p.s, p.s);
        dummy.updateMatrix();
        lowInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(p.x, 9.2 * p.s, p.z);
        dummy.scale.set(p.s * 1.1, p.s * 0.85, p.s * 1.1);
        dummy.updateMatrix();
        highInst.setMatrixAt(idx, dummy.matrix);
      });
      trunkInst.instanceMatrix.needsUpdate = true;
      lowInst.instanceMatrix.needsUpdate = true;
      highInst.instanceMatrix.needsUpdate = true;
      trunkInst.frustumCulled = false;
      lowInst.frustumCulled = false;
      highInst.frustumCulled = false;
      g.add(trunkInst, lowInst, highInst);
    }

    if (THREE.InstancedMesh && scrubPlacements.length) {
      const bushGeo = new THREE.DodecahedronGeometry(1.5, 0);
      const bushInst = new THREE.InstancedMesh(bushGeo, foliage, scrubPlacements.length);
      bushInst.castShadow = true;
      bushInst.receiveShadow = true;
      const dummy = new THREE.Object3D();
      scrubPlacements.forEach((p, idx) => {
        dummy.position.set(p.x, 0.65 * p.s, p.z);
        dummy.rotation.set(0, idx * 0.7, 0);
        dummy.scale.set(p.s * 1.35, p.s * 0.65, p.s * 1.25);
        dummy.updateMatrix();
        bushInst.setMatrixAt(idx, dummy.matrix);
      });
      bushInst.instanceMatrix.needsUpdate = true;
      bushInst.frustumCulled = false;
      g.add(bushInst);
    }

    // -------------------------------------------------------------------------
    // 8. TURN BASIN BARGE HARBOR (LC-39B itself lives in pad39b.js)
    // -------------------------------------------------------------------------
    const basin = C.TURN_BASIN; // (-930, 118)
    site.box(g, 74, 0.34, 48, basin.x, 0.17, basin.z, concreteDark, "BasinQuay");
    site.box(g, 56, 0.42, 34, basin.x, 0.24, basin.z - 4, m("water"), "BasinWater");
    site.box(g, 30, 1.4, 12, basin.x + 4, 1.0, basin.z - 4, m("steel_grey"), "NASA_PegasusBarge");
    site.box(g, 16, 4.2, 8.6, basin.x + 2, 3.8, basin.z - 4, m("steel_white"), "BargeCargoShell");
    for (let mx = -28; mx <= 28; mx += 14) {
      site.cyl(g, 0.36, 1.2, basin.x + mx, 0.85, basin.z + 18, m("yellow"), 8, "QuayBollard");
    }
    site.label(g, "TURN BASIN", basin.x - 16, 4.2, basin.z + 24, { width: 8, height: 1.8, fontSize: 46 });
    site.addBoxCollider(basin.x, basin.z, 72, 48, "Turn basin");

    function steelMat(s) {
      return s.mat("steel_grey");
    }
  });
})(window);
