/**
 * Space Center 2 — Walkable Launch Control Center (LCC) interior & exterior plaza.
 *
 * Eliminates all corner/roof/window Z-fighting, connects the front promenade
 * continuously to the parking lot road, adds Space-Age sun-hood louvers, masonry
 * palm planters, flagpoles, rooftop chillers, and detailed Firing Room/Lobby rooms.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("lcc", function buildLCC(site) {
    const g = new window.THREE.Group();
    g.name = "SC2_LCC";
    site.group.add(g);

    const THREE = window.THREE;
    const C = NS.constants;
    const m = (k) => site.mat(k);
    const white = m("lcc_wall");
    const concrete = m("concrete");
    const concreteDark = m("concrete_dark");
    const curb = m("concrete_curb");
    const floorMat = m("tan");
    const steel = m("steel_grey");
    const trim = m("black");

    const cx = C.LCC.x; // -180
    const cz = C.LCC.z; // 180
    const hx = C.LCC.halfX; // 35 (x: -215..-145)
    const hz = C.LCC.halfZ; // 23 (z: 157..203)
    const height = C.LCC.height; // 24
    const south = C.LCC.doorZ; // 203
    const north = cz - hz; // 157
    const wallT = 0.8;
    const halfWall = wallT * 0.5;
    const sideDepth = hz * 2 - wallT * 2; // 44.4
    const innerW = hx * 2 - wallT * 2; // 68.4
    const floorTop = 0.24;

    // Interior slab (strictly inside outer walls, top=0.24) & drop ceiling (below roof)
    site.box(g, innerW, floorTop, sideDepth, cx, floorTop * 0.5, cz, floorMat, "LCCFloor");
    site.box(g, innerW, 0.35, sideDepth, cx, 21.8, cz, concrete, "LCCCeiling");
    // Roof strictly above wall top (24.0) + dark architectural fascia parapet
    site.box(g, hx * 2 + 1.2, 1.4, hz * 2 + 1.2, cx, height + 0.7, cz, concreteDark, "LCCRoof");
    site.box(g, hx * 2 + 1.5, 0.7, hz * 2 + 1.5, cx, height + 1.75, cz, trim, "LCCParapet");

    // Outer structural shell (corner-trimmed -> zero overlap)
    site.box(g, hx * 2, height, wallT, cx, height * 0.5, north + halfWall, white, "LCCNorthWall");
    site.box(g, wallT, height, sideDepth, cx - hx + halfWall, height * 0.5, cz, white, "LCCWestWall");
    site.box(g, wallT, height, sideDepth, cx + hx - halfWall, height * 0.5, cz, white, "LCCEastWall");
    site.box(g, 30, height, wallT, cx - 20, height * 0.5, south - halfWall, white, "LCCSouthWallW");
    site.box(g, 30, height, wallT, cx + 20, height * 0.5, south - halfWall, white, "LCCSouthWallE");
    site.box(g, 10, 14, wallT, cx, 17, south - halfWall, white, "LCCSouthHeader");

    // Interior walls seated squarely on floorTop (0.24..21.6)
    const wallH = 21.36;
    const wallY = floorTop + wallH * 0.5;
    site.box(g, 0.6, wallH, 32.4, cx - 12, wallY, 173.8, white, "FiringPartitionN");
    site.box(g, 0.6, wallH, 8.4, cx - 12, wallY, 198.2, white, "FiringPartitionS");
    site.box(g, 0.6, wallH, 32.4, cx + 12, wallY, 173.8, white, "ConfPartitionN");
    site.box(g, 0.6, wallH, 8.4, cx + 12, wallY, 198.2, white, "ConfPartitionS");
    site.box(g, 5.7, wallH, 0.6, cx - 8.85, wallY, 188, white, "LobbyPartitionW");
    site.box(g, 6.0, wallH, 0.6, cx, wallY, 188, white, "LobbyPartitionC");
    site.box(g, 5.7, wallH, 0.6, cx + 8.85, wallY, 188, white, "LobbyPartitionE");
    site.box(g, 0.6, wallH, 30.1, cx, wallY, 172.65, white, "BackDivider");

    // 1. Firing Room / Mission Control Center (west wing)
    //    Apollo-era LC-39A firing room inspired by the reference photograph:
    //    warm beige consoles, a full-width paper status-board wall, and the
    //    Flight Director's central console with its green CRT.
    const mcX = cx - 23; // room centreline
    const boardZ = 158.42;
    const boardBackZ = 158.28;
    const ceilY = 6.6;

    const retroConsole = new THREE.MeshStandardMaterial({ color: 0xb9b09b, roughness: 0.74, metalness: 0.16 });
    retroConsole.name = "lcc_firing_console";
    const retroConsoleDark = new THREE.MeshStandardMaterial({ color: 0x948c79, roughness: 0.8, metalness: 0.12 });
    retroConsoleDark.name = "lcc_firing_console_dark";
    const retroCharcoal = new THREE.MeshStandardMaterial({ color: 0x2b2a26, roughness: 0.58, metalness: 0.32 });
    retroCharcoal.name = "lcc_firing_charcoal";
    const retroBrown = new THREE.MeshStandardMaterial({ color: 0x4b4135, roughness: 0.66, metalness: 0.18 });
    retroBrown.name = "lcc_firing_brown";
    const retroCream = new THREE.MeshStandardMaterial({ color: 0xe7e0cb, roughness: 0.82, metalness: 0.03 });
    retroCream.name = "lcc_firing_cream";
    const retroCarpet = new THREE.MeshStandardMaterial({ color: 0x8d897d, roughness: 0.98, metalness: 0 });
    retroCarpet.name = "lcc_firing_carpet";
    const retroLampRed = new THREE.MeshStandardMaterial({ color: 0x7f1d1a, emissive: 0xff3b2f, emissiveIntensity: 0.55, roughness: 0.4 });
    retroLampRed.name = "lcc_lamp_red";
    const retroLampGreen = new THREE.MeshStandardMaterial({ color: 0x14532d, emissive: 0x34ff6b, emissiveIntensity: 0.5, roughness: 0.4 });
    retroLampGreen.name = "lcc_lamp_green";
    const retroLampAmber = new THREE.MeshStandardMaterial({ color: 0x4a2c08, emissive: 0xffb347, emissiveIntensity: 0.55, roughness: 0.4 });
    retroLampAmber.name = "lcc_lamp_amber";
    const retroCrtGreen = new THREE.MeshStandardMaterial({ color: 0x061a0b, emissive: 0x34ff6b, emissiveIntensity: 0.65, roughness: 0.35 });
    retroCrtGreen.name = "lcc_crt_green";
    const retroCrtAmber = new THREE.MeshStandardMaterial({ color: 0x201408, emissive: 0xffb347, emissiveIntensity: 0.55, roughness: 0.35 });
    retroCrtAmber.name = "lcc_crt_amber";
    const retroWood = new THREE.MeshStandardMaterial({ color: 0x5b412c, roughness: 0.66, metalness: 0.06 });
    retroWood.name = "lcc_retro_wood";
    const retroUpholstery = new THREE.MeshStandardMaterial({ color: 0x8d4f38, roughness: 0.94, metalness: 0.02 });
    retroUpholstery.name = "lcc_upholstery";
    const retroChrome = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.24, metalness: 0.82 });
    retroChrome.name = "lcc_chrome";
    const retroIndustrial = new THREE.MeshStandardMaterial({ color: 0x6b6a62, roughness: 0.88, metalness: 0.08 });
    retroIndustrial.name = "lcc_industrial_floor";
    const retroRug = new THREE.MeshStandardMaterial({ color: 0x4d5560, roughness: 1.0, metalness: 0 });
    retroRug.name = "lcc_rug";

    const addScreenPlane = (x, y, z, width, height, material, name) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
      mesh.position.set(x, y, z);
      mesh.name = name || "FiringScreen";
      g.add(mesh);
      return mesh;
    };

    const addConsoleDesk = (x, z, width, depth, name) => {
      site.box(g, width, 0.88, depth, x, floorTop + 0.44, z, retroConsole, `${name}_Body`);
      site.box(g, width + 0.26, 0.1, depth + 0.2, x, floorTop + 0.93, z, retroConsoleDark, `${name}_Top`);
      site.box(g, width + 0.3, 0.6, 0.12, x, floorTop + 0.52, z + depth / 2 + 0.07, retroConsoleDark, `${name}_Front`);
      site.box(g, width + 0.34, 0.06, 0.18, x, floorTop + 0.83, z + depth / 2 + 0.09, retroBrown, `${name}_Trim`);
      site.box(g, width + 0.1, 0.08, 0.16, x, floorTop + 0.2, z + depth / 2 + 0.06, retroBrown, `${name}_Kick`);
      // Keep the walk collider paired with the rendered console dimensions so
      // each firing-room desk remains solid if its layout is adjusted later.
      site.addBoxCollider(x, z, width + 0.34, depth + 0.2, `MCC ${name} desk`);
    };

    const addMonitor = (x, z, width, height, screenMat, name) => {
      const y = floorTop + 1.02 + height / 2;
      site.box(g, width + 0.16, height + 0.16, 0.16, x, y, z, retroCharcoal, `${name}_Bezel`);
      site.box(g, 0.14, 0.24, 0.14, x, y - height / 2 - 0.14, z, retroCharcoal, `${name}_Stand`);
      addScreenPlane(x, y, z + 0.09, width, height, screenMat, `${name}_Screen`);
      return y;
    };

    const addChair = (x, z, tall) => {
      site.cyl(g, 0.3, 0.06, x, floorTop + 0.05, z, retroCharcoal, 12, "FiringChairBase");
      site.cyl(g, 0.07, 0.4, x, floorTop + 0.29, z, retroCharcoal, 8, "FiringChairPost");
      site.box(g, 0.72, 0.12, 0.66, x, floorTop + 0.53, z, retroCharcoal, "FiringChairSeat");
      site.box(g, 0.72, tall ? 1.0 : 0.82, 0.14, x, floorTop + (tall ? 1.07 : 0.98), z + 0.34, retroCharcoal, "FiringChairBack");
      site.box(g, 0.8, 0.08, 0.14, x, floorTop + (tall ? 1.58 : 1.4), z + 0.34, retroCharcoal, "FiringChairHead");
      site.box(g, 0.14, 0.07, 0.5, x - 0.47, floorTop + 0.78, z, retroCharcoal, "FiringChairArm");
      site.box(g, 0.14, 0.07, 0.5, x + 0.47, floorTop + 0.78, z, retroCharcoal, "FiringChairArm");
    };

    const addPhone = (x, z) => {
      const topY = floorTop + 0.98;
      site.box(g, 0.26, 0.08, 0.34, x, topY + 0.04, z, retroCharcoal, "FiringPhoneBase");
      site.box(g, 0.34, 0.1, 0.12, x, topY + 0.12, z, m("black"), "FiringPhoneHandset");
      site.cyl(g, 0.05, 0.04, x - 0.1, topY + 0.09, z, retroLampRed, 8, "FiringPhoneLight");
    };

    const addNameplate = (x, y, z, title, sub, width) => {
      site.canvasPlane(
        g, width, 0.32, x, y, z, 0, 0, 0,
        (ctx, w, h) => {
          ctx.fillStyle = "#d9d1b8";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#4a4132";
          ctx.lineWidth = 4;
          ctx.strokeRect(2, 2, w - 4, h - 4);
          ctx.fillStyle = "#2e2a20";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "900 26px Arial, Helvetica, sans-serif";
          ctx.fillText(title, w * 0.5, h * 0.38);
          ctx.fillStyle = "#5c5442";
          ctx.font = "700 13px Arial, Helvetica, sans-serif";
          ctx.fillText(sub, w * 0.5, h * 0.74);
        },
        768, 72,
        { unlit: true, name: "MCC_StationPlate" }
      );
    };

    const addSwitchStrip = (x, y, z, width, seed) => {
      site.canvasPlane(
        g, width, 0.22, x, y, z, 0, 0, 0,
        (ctx, w, h) => {
          ctx.fillStyle = "#26241f";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#5b5446";
          ctx.lineWidth = 3;
          ctx.strokeRect(2, 2, w - 4, h - 4);
          const colors = ["#ffb347", "#ff4b3e", "#57e389", "#d8d2bd"];
          const count = 22;
          for (let i = 0; i < count; i++) {
            const bx = 12 + (i / count) * (w - 24);
            ctx.fillStyle = colors[(i + seed) % colors.length];
            ctx.fillRect(bx, h * 0.28, Math.max(5, w / 80), h * 0.44);
            ctx.fillStyle = "rgba(0,0,0,0.35)";
            ctx.fillRect(bx, h * 0.7, Math.max(5, w / 80), 3);
          }
        },
        768, 48,
        { unlit: true, name: "MCC_SwitchStrip" }
      );
    };

    const addWallSign = (text, sub, x, y, z, ry, width, height, name, opts = {}) => {
      site.canvasPlane(
        g, width, height, x, y, z, 0, ry, 0,
        (ctx, w, h) => {
          ctx.fillStyle = opts.bg || "#201d18";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = opts.border || "#8c7b57";
          ctx.lineWidth = 4;
          ctx.strokeRect(3, 3, w - 6, h - 6);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = opts.fg || "#e9e2cd";
          const titleSize = Math.max(16, Math.round(h * (sub ? 0.34 : 0.42)));
          ctx.font = `900 ${titleSize}px Arial, Helvetica, sans-serif`;
          ctx.fillText(text, w * 0.5, sub ? h * 0.38 : h * 0.52);
          if (sub) {
            ctx.fillStyle = opts.subFg || "#ffcf6b";
            ctx.font = `700 ${Math.max(10, Math.round(h * 0.18))}px Arial, Helvetica, sans-serif`;
            ctx.fillText(sub, w * 0.5, h * 0.72);
          }
        },
        Math.max(256, Math.round(width * 96)),
        Math.max(96, Math.round(height * 192)),
        { unlit: true, name }
      );
    };

    const addPottedPlant = (x, z, scale = 1) => {
      site.cyl(g, 0.42 * scale, 0.52 * scale, x, floorTop + 0.26 * scale, z, retroWood, 10, "LobbyPlanterPot");
      site.cyl(g, 0.05 * scale, 0.65 * scale, x, floorTop + 0.75 * scale, z, m("rust"), 6, "LobbyPlanterStem");
      site.box(g, 0.9 * scale, 1.0 * scale, 0.9 * scale, x, floorTop + 1.4 * scale, z, m("foliage"), "LobbyPlanterFoliage");
    };

    const addMissionPatch = (x, y, z, ry, label, accent, name) => {
      site.canvasPlane(
        g, 1.9, 1.9, x, y, z, 0, ry, 0,
        (ctx, w, h) => {
          ctx.fillStyle = "#d8d1bd";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#4b463b";
          ctx.lineWidth = 8;
          ctx.strokeRect(4, 4, w - 8, h - 8);
          const px = w * 0.5;
          const py = h * 0.46;
          const r = Math.min(w, h) * 0.31;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fillStyle = accent;
          ctx.fill();
          ctx.strokeStyle = "#f0e9d4";
          ctx.lineWidth = 5;
          ctx.stroke();
          ctx.fillStyle = "#f0e9d4";
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(px + Math.cos(a) * r * 0.68, py + Math.sin(a) * r * 0.68, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "#e9e2cd";
          ctx.beginPath();
          ctx.moveTo(px, py - r * 0.62);
          ctx.lineTo(px + r * 0.16, py - r * 0.05);
          ctx.lineTo(px + r * 0.1, py + r * 0.5);
          ctx.lineTo(px - r * 0.1, py + r * 0.5);
          ctx.lineTo(px - r * 0.16, py - r * 0.05);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#e25822";
          ctx.beginPath();
          ctx.moveTo(px - r * 0.07, py + r * 0.5);
          ctx.lineTo(px, py + r * 0.86);
          ctx.lineTo(px + r * 0.07, py + r * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#2e2a20";
          ctx.textAlign = "center";
          ctx.font = "900 18px Arial, Helvetica, sans-serif";
          ctx.fillText(label, w * 0.5, h - 20);
        },
        256, 256,
        { unlit: true, name }
      );
    };

    const addFramedPicture = (x, y, z, ry, width, height, name, draw) => {
      const side = Math.abs(Math.abs(ry) - Math.PI / 2) < 0.1;
      if (side) {
        site.box(g, 0.08, height + 0.16, width + 0.16, x, y, z, retroWood, `${name}_Frame`);
      } else {
        site.box(g, width + 0.16, height + 0.16, 0.08, x, y, z, retroWood, `${name}_Frame`);
      }
      const off = 0.05;
      let px = x;
      let pz = z;
      if (side) {
        px += ry > 0 ? off : -off;
      } else {
        pz += Math.abs(ry) < 0.1 ? off : -off;
      }
      site.canvasPlane(g, width, height, px, y, pz, 0, ry, 0, draw, 384, 256, { unlit: true, name });
    };

    // Restroom wall and floor tile materials (procedural, cheap to repeat).
    const wallTileTex = site._makeProceduralTexture("lcc_restroom_tile_wall", 256, (ctx, s) => {
      ctx.fillStyle = "#e2ded1";
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = "rgba(118,112,98,0.38)";
      ctx.lineWidth = 2;
      for (let i = 0; i <= s; i += 32) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
      }
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.09)" : "rgba(80,74,62,0.045)";
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    }, 6, 1);
    const floorTileTex = site._makeProceduralTexture("lcc_restroom_tile_floor", 256, (ctx, s) => {
      ctx.fillStyle = "#cfcabd";
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = "rgba(94,89,78,0.42)";
      ctx.lineWidth = 3;
      for (let i = 0; i <= s; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(s, i);
        ctx.stroke();
      }
      for (let i = 0; i < 420; i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.08)" : "rgba(70,65,54,0.05)";
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    }, 3, 8);
    const retroTileWall = new THREE.MeshStandardMaterial({ map: wallTileTex, roughness: 0.55, metalness: 0.03 });
    retroTileWall.name = "lcc_restroom_wall";
    const retroTileFloor = new THREE.MeshStandardMaterial({ map: floorTileTex, roughness: 0.48, metalness: 0.04 });
    retroTileFloor.name = "lcc_restroom_floor";

    // ── Front status-board wall (paper boards + world map) ───────────────────
    site.box(g, 20.6, 6.2, 0.12, mcX, 3.2, boardBackZ, retroBrown, "FiringBoardBacking");
    for (const seamX of [-212.15, -207.65, -198.35, -193.85]) {
      site.box(g, 0.06, 6.15, 0.14, seamX, 3.2, boardBackZ + 0.05, retroCharcoal, "FiringBoardSeam");
    }

    const drawPaperBoard = (title, rows) => (ctx, w, h) => {
      ctx.fillStyle = "#ded8c3";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#23211c";
      ctx.fillRect(0, 0, w, 62);
      ctx.fillStyle = "#ebe4d0";
      ctx.textAlign = "left";
      ctx.font = "900 26px Arial, Helvetica, sans-serif";
      ctx.fillText(title, 22, 41);
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffcc66";
      ctx.font = "700 18px monospace";
      ctx.fillText("LC-39A", w - 22, 40);
      ctx.font = "700 17px monospace";
      rows.forEach((row, i) => {
        const y = 104 + i * 30;
        ctx.textAlign = "left";
        ctx.fillStyle = row[2] ? "#9a2c1e" : "#39362d";
        ctx.fillText(row[0], 22, y);
        const leftW = ctx.measureText(row[0]).width;
        const rightW = ctx.measureText(row[1]).width;
        ctx.fillStyle = "rgba(84,78,62,0.45)";
        for (let dx = 22 + leftW + 10; dx < w - 22 - rightW - 10; dx += 9) {
          ctx.fillRect(dx, y - 3, 4, 2);
        }
        ctx.textAlign = "right";
        ctx.fillStyle = row[2] ? "#9a2c1e" : "#39362d";
        ctx.fillText(row[1], w - 22, y);
      });
      ctx.strokeStyle = "#4b463b";
      ctx.lineWidth = 7;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      for (let i = 0; i < 1500; i++) {
        ctx.fillStyle = i % 3 === 0 ? "rgba(90,80,60,0.045)" : "rgba(255,255,255,0.05)";
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    };

    const leftRows = [
      ["RANGE STATUS", "GREEN"],
      ["WEATHER", "GO"],
      ["UPPER WIND", "12 KT"],
      ["TANKING", "COMPLETE"],
      ["LOX LOAD", "100%"],
      ["LH2 LOAD", "100%"],
      ["FTS", "ARMED"],
      ["GUIDANCE", "INTERNAL"],
      ["TELEMETRY", "LOCKED"],
      ["TRACKING", "NOMINAL"],
      ["RECOVERY", "STANDBY"],
      ["LCC POWER", "NORMAL"],
      ["HOLD FIRE", "CLEAR"],
      ["RANGE SAFETY", "GO"]
    ];
    const rightRows = [
      ["VEHICLE", "NOMINAL"],
      ["MAIN ENGINE 1", "READY"],
      ["MAIN ENGINE 2", "READY"],
      ["MAIN ENGINE 3", "READY"],
      ["SRB LEFT", "READY"],
      ["SRB RIGHT", "READY"],
      ["ET SEP", "ARMED"],
      ["OMS", "READY"],
      ["RCS", "READY"],
      ["APU 1", "ON"],
      ["APU 2", "ON"],
      ["APU 3", "ON"],
      ["CABIN PRESS", "14.7"],
      ["CREW", "ABOARD"]
    ];

    site.canvasPlane(
      g, 4.3, 3.5, -209.85, 3.9, boardZ, 0, 0, 0,
      drawPaperBoard("MISSION RULES", leftRows),
      768, 620,
      { unlit: true, name: "MCC_LeftStatusBoard" }
    );
    site.canvasPlane(
      g, 4.3, 3.5, -196.15, 3.9, boardZ, 0, 0, 0,
      drawPaperBoard("VEHICLE STATUS", rightRows),
      768, 620,
      { unlit: true, name: "MCC_RightStatusBoard" }
    );

    site.canvasPlane(
      g, 9.2, 3.5, mcX, 3.9, boardZ, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#ded8c3";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#171613";
        ctx.fillRect(0, 0, w, 68);
        ctx.fillStyle = "#ece5d1";
        ctx.textAlign = "left";
        ctx.font = "900 26px Arial, Helvetica, sans-serif";
        ctx.fillText("MISSION CONTROL · FIRING ROOM 1", 24, 45);
        ctx.textAlign = "right";
        ctx.fillStyle = "#ffcc66";
        ctx.font = "900 32px monospace";
        ctx.fillText("T-00:04:12", w - 24, 46);

        const top = 78;
        const mapH = h - top - 26;
        ctx.save();
        ctx.beginPath();
        ctx.rect(8, top, w - 16, mapH);
        ctx.clip();

        ctx.strokeStyle = "rgba(74, 84, 94, 0.20)";
        ctx.lineWidth = 1;
        for (let x = 0; x <= w; x += 48) {
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + mapH);
          ctx.stroke();
        }
        for (let y = top; y <= top + mapH; y += 36) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(74, 84, 94, 0.38)";
        ctx.lineWidth = 2;
        for (let x = 0; x <= w; x += 192) {
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + mapH);
          ctx.stroke();
        }
        for (let y = top; y <= top + mapH; y += 144) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        const mapX = (n) => n * w;
        const mapY = (n) => top + n * mapH;
        const land = (points) => {
          ctx.beginPath();
          points.forEach((p, i) => {
            const x = mapX(p[0]);
            const y = mapY(p[1]);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.fillStyle = "#454d3d";
          ctx.fill();
          ctx.strokeStyle = "#1e241a";
          ctx.lineWidth = 2;
          ctx.stroke();
        };

        land([[0.10, 0.20], [0.19, 0.13], [0.28, 0.14], [0.32, 0.21], [0.28, 0.28], [0.24, 0.31], [0.22, 0.38], [0.18, 0.35], [0.15, 0.27], [0.09, 0.24]]);
        land([[0.22, 0.38], [0.25, 0.43], [0.24, 0.47], [0.21, 0.42]]);
        land([[0.28, 0.47], [0.33, 0.49], [0.35, 0.57], [0.32, 0.68], [0.29, 0.74], [0.26, 0.64], [0.26, 0.54]]);
        land([[0.44, 0.22], [0.52, 0.19], [0.57, 0.24], [0.55, 0.30], [0.49, 0.31], [0.45, 0.27]]);
        land([[0.46, 0.33], [0.55, 0.32], [0.59, 0.39], [0.57, 0.51], [0.52, 0.58], [0.48, 0.50], [0.46, 0.40]]);
        land([[0.56, 0.17], [0.68, 0.14], [0.79, 0.18], [0.88, 0.25], [0.86, 0.33], [0.77, 0.37], [0.68, 0.34], [0.61, 0.30], [0.56, 0.24]]);
        land([[0.66, 0.36], [0.71, 0.35], [0.70, 0.44], [0.66, 0.41]]);
        land([[0.79, 0.52], [0.88, 0.51], [0.91, 0.58], [0.86, 0.65], [0.79, 0.62], [0.77, 0.56]]);
        land([[0.30, 0.08], [0.38, 0.07], [0.41, 0.13], [0.34, 0.16], [0.29, 0.12]]);
        land([[0.13, 0.12], [0.17, 0.10], [0.18, 0.14], [0.14, 0.15]]);

        ctx.fillStyle = "rgba(55, 64, 62, 0.6)";
        ctx.font = "700 14px monospace";
        ctx.textAlign = "left";
        ctx.fillText("PACIFIC OCEAN", w * 0.06, mapY(0.70));
        ctx.fillText("ATLANTIC OCEAN", w * 0.37, mapY(0.58));
        ctx.fillText("INDIAN OCEAN", w * 0.63, mapY(0.72));

        ctx.setLineDash([9, 6]);
        ctx.strokeStyle = "#c25a2a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(w * 0.05, mapY(0.43));
        ctx.bezierCurveTo(w * 0.25, mapY(0.10), w * 0.63, mapY(0.19), w * 0.94, mapY(0.56));
        ctx.stroke();
        ctx.setLineDash([]);

        const marks = [
          [0.27, 0.45, "KSC"],
          [0.47, 0.31, "MADRID"],
          [0.64, 0.61, "AOS +02:14"],
          [0.87, 0.71, "CANBERRA"]
        ];
        ctx.font = "700 15px monospace";
        marks.forEach(([mx, my, label]) => {
          ctx.fillStyle = "#b23a22";
          ctx.beginPath();
          ctx.arc(mapX(mx), mapY(my), 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#2f2b21";
          ctx.fillText(label, mapX(mx) + 9, mapY(my) - 6);
        });

        ctx.strokeStyle = "#b23a22";
        ctx.lineWidth = 3;
        ctx.strokeRect(w * 0.39, mapY(0.20), w * 0.11, mapH * 0.18);
        ctx.fillStyle = "#9a2c1e";
        ctx.font = "700 14px monospace";
        ctx.fillText("TLM WINDOW", w * 0.395, mapY(0.18));

        ctx.fillStyle = "#353128";
        ctx.font = "700 15px monospace";
        ctx.fillText("GROUND TRACK · ORBIT 001", 24, h - 22);
        ctx.textAlign = "right";
        ctx.fillText("RANGE GREEN · FTS ARMED", w - 24, h - 22);

        for (let i = 0; i < 1800; i++) {
          ctx.fillStyle = i % 3 === 0 ? "rgba(90,80,60,0.04)" : "rgba(255,255,255,0.04)";
          ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
        }
        ctx.restore();
        ctx.strokeStyle = "#4b463b";
        ctx.lineWidth = 7;
        ctx.strokeRect(4, 4, w - 8, h - 8);
      },
      1536, 600,
      { unlit: true, name: "MCC_WorldMapBoard" }
    );

    site.canvasPlane(
      g, 18, 0.5, mcX, 5.95, boardZ, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#171613";
        ctx.fillRect(0, 0, w, h);
        const labels = ["GREENWICH TIME", "COUNT DOWN", "HOLD", "COUNTDOWN", "PROCEED", "ELAPSED TIME", "TIME TO RETROFIRE"];
        const values = ["12:34:56", "00:04:12", "--", "T-00:04:12", "GO", "00:00:00", "00:52:10"];
        const cell = w / labels.length;
        labels.forEach((label, i) => {
          const x0 = i * cell;
          ctx.strokeStyle = "#4f483b";
          ctx.lineWidth = 2;
          ctx.strokeRect(x0 + 2, 2, cell - 4, h - 4);
          ctx.textAlign = "center";
          ctx.fillStyle = "#d9d2bd";
          ctx.font = "700 14px Arial, Helvetica, sans-serif";
          ctx.fillText(label, x0 + cell / 2, 24);
          ctx.fillStyle = i === 2 ? "#ff8a3c" : (i === 4 ? "#86efac" : "#ffcf6b");
          ctx.font = "900 22px monospace";
          ctx.fillText(values[i], x0 + cell / 2, 55);
        });
      },
      1536, 96,
      { unlit: true, name: "MCC_BoardHeader" }
    );

    site.canvasPlane(
      g, 8.4, 0.34, mcX, 6.42, boardZ, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#201d18";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#8c7b57";
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        ctx.fillStyle = "#e7dfc7";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "900 24px Arial, Helvetica, sans-serif";
        ctx.fillText("LAUNCH CONTROL CENTER · FIRING ROOM 1", w * 0.5, h * 0.54);
      },
      1024, 48,
      { unlit: true, name: "MCC_RoomPlaque" }
    );

    // Narrow equipment ledge under the boards.
    site.box(g, 19.8, 0.16, 0.7, mcX, 1.9, 158.86, retroConsoleDark, "FiringBoardLedge");
    site.box(g, 19.9, 0.5, 0.14, mcX, 1.63, 158.95, retroBrown, "FiringBoardLedgeFace");

    // ── Two rows of operator consoles under the board wall ───────────────────
    const consoleRows = [
      { z: 162.4, seedOffset: 0, label: "FiringFrontConsole" },
      { z: 169.4, seedOffset: 2, label: "FiringMidConsole" }
    ];
    const frontBanks = [
      { x: mcX - 5.7, width: 7.2, seed: 2 },
      { x: mcX + 5.7, width: 7.2, seed: 5 }
    ];
    for (const row of consoleRows) {
      for (const bank of frontBanks) {
        addConsoleDesk(bank.x, row.z, bank.width, 1.6, row.label);
        addSwitchStrip(bank.x, floorTop + 0.5, row.z + 0.94, bank.width * 0.7, bank.seed + row.seedOffset);
        for (let mi = 0; mi < 3; mi++) {
          const mx = bank.x - bank.width * 0.31 + mi * bank.width * 0.31;
          addMonitor(mx, row.z - 0.34, 1.05, 0.62, mi === 1 ? retroCrtAmber : retroCrtGreen, "FiringConsoleMonitor");
          site.box(g, 0.95, 0.05, 0.3, mx, floorTop + 0.98, row.z + 0.42, retroCharcoal, "FiringKeyboard");
          addChair(mx, row.z + 1.75, false);
        }
        addPhone(bank.x + bank.width / 2 - 0.5, row.z + 0.16);
      }
    }

    // ── Two ground-crew consoles facing the board wall ───────────────────────
    const stations = [
      { x: mcX - 5.3, z: 175.8, width: 7.2, depth: 2.2, seed: 1, title: "FLIGHT DIRECTOR", sub: "GO / NO-GO & MISSION AUTHORITY" },
      { x: mcX + 5.3, z: 175.8, width: 7.2, depth: 2.2, seed: 4, title: "GROUND SYSTEMS", sub: "COMMS · TRACKING · GROUND NETWORK" }
    ];
    for (const st of stations) {
      addConsoleDesk(st.x, st.z, st.width, st.depth, "FiringOpsConsole");
      for (let mi = 0; mi < 3; mi++) {
        const mx = st.x - 2.25 + mi * 2.25;
        addMonitor(mx, st.z - 0.5, 1.2, 0.72, mi === 1 ? retroCrtGreen : retroCrtAmber, "FiringOpsMonitor");
        site.box(g, 1.0, 0.05, 0.32, mx, floorTop + 0.98, st.z + 0.45, retroCharcoal, "FiringKeyboard");
      }
      addSwitchStrip(st.x, floorTop + 0.5, st.z + st.depth / 2 + 0.15, st.width * 0.78, st.seed);
      addNameplate(st.x, floorTop + 0.78, st.z + st.depth / 2 + 0.16, st.title, st.sub, 4.4);
      addPhone(st.x + st.width / 2 - 0.55, st.z + 0.2);
      addChair(st.x - 1.7, st.z + 2.35, false);
      addChair(st.x + 1.7, st.z + 2.35, false);
    }

    // ── Central Flight Director / Ops "trench" console with green CRT ────────
    const opsZ = 176.6;
    addConsoleDesk(mcX, opsZ, 2.6, 2.4, "FiringTrenchConsole");
    addSwitchStrip(mcX, floorTop + 0.45, opsZ + 1.36, 2.2, 7);
    addNameplate(mcX, floorTop + 0.78, opsZ + 1.36, "OPS", "FIRING ROOM 1", 1.9);

    for (const side of [-1, 1]) {
      site.box(g, 0.18, 0.9, 0.9, mcX + side * 1.14, floorTop + 1.28, opsZ - 0.2, retroConsoleDark, "FiringTrenchLampHousing");
      site.canvasPlane(
        g, 0.7, 0.72, mcX + side * 1.14, floorTop + 1.28, opsZ + 0.27, 0, 0, 0,
        (ctx, w, h) => {
          ctx.fillStyle = "#2a2823";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#5d5648";
          ctx.lineWidth = 4;
          ctx.strokeRect(2, 2, w - 4, h - 4);
          const lampColors = ["#ff4b3e", "#ffb347", "#57e389", "#d8d2bd"];
          for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
              ctx.fillStyle = lampColors[(row + col + (side > 0 ? 1 : 0)) % lampColors.length];
              ctx.fillRect(18 + col * 30, 18 + row * 30, 20, 18);
              ctx.fillStyle = "rgba(0,0,0,0.4)";
              ctx.fillRect(18 + col * 30, 36 + row * 30, 20, 3);
            }
          }
        },
        160, 160,
        { unlit: true, name: "FiringTrenchLampPanel" }
      );
    }

    site.box(g, 0.92, 0.72, 0.34, mcX, floorTop + 1.52, opsZ - 0.55, retroCharcoal, "FiringTrenchCrtBezel");
    site.canvasPlane(
      g, 0.74, 0.56, mcX, floorTop + 1.52, opsZ - 0.37, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#071b0a";
        ctx.fillRect(0, 0, w, h);
        for (let y = 0; y < h; y += 3) {
          ctx.fillStyle = "rgba(70,255,120,0.06)";
          ctx.fillRect(0, y, w, 1);
        }
        ctx.fillStyle = "#6dff97";
        ctx.font = "700 14px monospace";
        ctx.textAlign = "left";
        ctx.fillText("FIRING ROOM 1", 12, 24);
        ctx.fillText("T-00:04:12", 12, 46);
        ctx.fillStyle = "#a9ffc0";
        ctx.fillText("RANGE ....... GREEN", 12, 72);
        ctx.fillText("VEHICLE ..... GO", 12, 94);
        ctx.fillText("WEATHER ..... GO", 12, 116);
        ctx.fillStyle = "#ffcf6b";
        ctx.fillText("HOLD ........ CLEAR", 12, 142);
        ctx.strokeStyle = "#6dff97";
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, w - 4, h - 4);
      },
      256, 192,
      { unlit: true, name: "FiringTrenchCrt" }
    );

    site.box(g, 0.42, 0.06, 0.55, mcX + 0.56, floorTop + 1.01, opsZ + 0.35, m("red"), "FiringRedBinder");
    site.box(g, 0.38, 0.03, 0.48, mcX + 0.56, floorTop + 1.05, opsZ + 0.35, retroCream, "FiringBinderPapers");
    site.box(g, 0.4, 0.02, 0.52, mcX - 0.68, floorTop + 1.01, opsZ + 0.6, retroCream, "FiringDeskPapers");
    site.box(g, 0.36, 0.05, 0.46, mcX - 0.68, floorTop + 1.04, opsZ + 0.6, retroCream, "FiringDeskPapers2");
    site.box(g, 1.05, 0.05, 0.32, mcX - 0.08, floorTop + 0.98, opsZ + 0.58, retroCharcoal, "FiringKeyboard");
    addPhone(mcX + 0.95, opsZ - 0.15);
    site.cyl(g, 0.03, 0.55, mcX - 0.95, floorTop + 1.255, opsZ - 0.45, retroCharcoal, 6, "FiringDeskLampArm");
    site.box(g, 0.28, 0.12, 0.2, mcX - 0.95, floorTop + 1.56, opsZ - 0.4, retroCharcoal, "FiringDeskLampShade");
    addChair(mcX, opsZ + 2.35, true);

    // ── Side-wall status boards ──────────────────────────────────────────────
    site.box(g, 0.12, 2.95, 5.35, cx - hx + wallT + 0.02, 3.3, 168, retroBrown, "MCC_GoNoGoFrame");
    site.canvasPlane(
      g, 5.0, 2.7, cx - hx + wallT + 0.1, 3.3, 168, 0, Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#ded8c3";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#23211c";
        ctx.fillRect(0, 0, w, 54);
        ctx.fillStyle = "#ebe4d0";
        ctx.font = "900 28px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("GO / NO-GO", w * 0.5, 38);
        const tiles = ["CDR", "ENG", "SCI", "FD", "GND", "RANGE"];
        tiles.forEach((t, i) => {
          const tx = 30 + (i % 3) * 200;
          const ty = 86 + Math.floor(i / 3) * 145;
          ctx.fillStyle = i < 4 ? "#2e5c3a" : "#2c4d5c";
          ctx.fillRect(tx, ty, 170, 110);
          ctx.strokeStyle = "#171a16";
          ctx.lineWidth = 3;
          ctx.strokeRect(tx, ty, 170, 110);
          ctx.fillStyle = "#e9e2cd";
          ctx.font = "900 30px Arial, Helvetica, sans-serif";
          ctx.fillText(t, tx + 85, ty + 48);
          ctx.fillStyle = i < 4 ? "#a9ffc0" : "#bfe7f5";
          ctx.font = "700 22px Arial, Helvetica, sans-serif";
          ctx.fillText(i < 4 ? "GO" : "STANDBY", tx + 85, ty + 82);
        });
        ctx.strokeStyle = "#4b463b";
        ctx.lineWidth = 7;
        ctx.strokeRect(4, 4, w - 8, h - 8);
      },
      768, 420,
      { unlit: true, name: "MCC_GoNoGoBoard" }
    );

    site.box(g, 0.12, 2.75, 5.05, cx - 12 - wallT * 0.5 - 0.02, 3.3, 170, retroBrown, "MCC_GroundBoardFrame");
    site.canvasPlane(
      g, 4.7, 2.5, cx - 12 - wallT * 0.5 - 0.1, 3.3, 170, 0, -Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#ded8c3";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#23211c";
        ctx.fillRect(0, 0, w, 54);
        ctx.fillStyle = "#ebe4d0";
        ctx.font = "900 26px Arial, Helvetica, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("GROUND NETWORK", 20, 38);
        const rows = [
          ["MADRID", "AOS 02:14"],
          ["CANBERRA", "AOS 03:40"],
          ["GOLDSTONE", "STANDBY"],
          ["RELAY SAT", "LOCKED"],
          ["SIGNAL", "STRONG"],
          ["DOWNLINK", "1.2 GB"],
          ["NEXT PASS", "+02:14"]
        ];
        ctx.font = "700 17px monospace";
        rows.forEach((row, i) => {
          const y = 92 + i * 32;
          ctx.textAlign = "left";
          ctx.fillStyle = "#39362d";
          ctx.fillText(row[0], 20, y);
          const leftW = ctx.measureText(row[0]).width;
          const rightW = ctx.measureText(row[1]).width;
          ctx.fillStyle = "rgba(84,78,62,0.45)";
          for (let dx = 20 + leftW + 8; dx < w - 20 - rightW - 8; dx += 9) {
            ctx.fillRect(dx, y - 3, 4, 2);
          }
          ctx.textAlign = "right";
          ctx.fillStyle = i < 4 ? "#2e5c3a" : "#39362d";
          ctx.fillText(row[1], w - 20, y);
        });
        ctx.strokeStyle = "#4b463b";
        ctx.lineWidth = 7;
        ctx.strokeRect(4, 4, w - 8, h - 8);
      },
      640, 360,
      { unlit: true, name: "MCC_GroundBoard" }
    );

    // Lobby-side sign over the doorway into the firing room.
    site.canvasPlane(
      g, 3.2, 0.55, cx - 11.62, 2.9, 192, 0, Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#201d18";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#8c7b57";
        ctx.lineWidth = 4;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.fillStyle = "#e7dfc7";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "900 30px Arial, Helvetica, sans-serif";
        ctx.fillText("FIRING ROOM 1", w * 0.5, h * 0.4);
        ctx.fillStyle = "#ffcf6b";
        ctx.font = "700 16px Arial, Helvetica, sans-serif";
        ctx.fillText("MISSION CONTROL · LC-39A", w * 0.5, h * 0.72);
      },
      512, 112,
      { unlit: true, name: "MCC_FiringRoomEntrySign" }
    );

    // ── Suspended acoustic ceiling, light panels and warm room lights ────────
    site.box(g, 21.7, 0.16, 43.4, mcX, ceilY + 0.08, 180.1, retroCream, "FiringCeilingSlab");
    for (let gx = -213.2; gx <= -193.0; gx += 3.35) {
      site.box(g, 0.07, 0.05, 43.0, gx, ceilY - 0.02, 180.1, retroConsoleDark, "FiringCeilingGridX");
    }
    for (let gz = 158.8; gz <= 201.4; gz += 3.3) {
      site.box(g, 21.4, 0.05, 0.07, mcX, ceilY - 0.02, gz, retroConsoleDark, "FiringCeilingGridZ");
    }
    for (const lx of [mcX - 5.7, mcX + 5.7]) {
      for (const lz of [161.5, 168.2, 174.9, 181.6, 188.3, 195.0]) {
        site.box(g, 2.5, 0.03, 1.0, lx, ceilY - 0.05, lz, m("lamp"), "FiringCeilingLight");
      }
    }
    for (const [lx, lz] of [[mcX - 5.2, 167], [mcX + 5.2, 186]]) {
      const warm = new THREE.PointLight(0xffe6bf, 1.25, 30, 1.6);
      warm.position.set(lx, 5.3, lz);
      warm.name = "FiringRoomWarmLight";
      g.add(warm);
    }

    // Warm carpet and central aisle runner.
    site.box(g, 21.5, 0.02, 43.2, mcX, floorTop + 0.01, 180.1, retroCarpet, "FiringRoomCarpet");
    site.box(g, 2.0, 0.012, 19.0, mcX, floorTop + 0.026, 168.0, retroBrown, "FiringRoomRunner");

    // Equipment cabinets along the back of the west wall.
    for (const wz of [194.0, 198.0]) {
      site.box(g, 0.95, 1.9, 1.1, -213.7, floorTop + 0.95, wz, retroCharcoal, "FiringEquipmentCabinet");
      site.box(g, 0.05, 0.35, 0.8, -213.2, floorTop + 1.35, wz, retroLampAmber, "FiringCabinetStatus");
    }

    // Warm wall trim and pilasters around the firing room.
    site.box(g, 0.08, 0.22, 43.0, -214.12, floorTop + 0.22, 180.1, retroBrown, "FiringRoomBaseTrimW");
    site.box(g, 0.08, 0.22, 31.2, -192.38, floorTop + 0.22, 174.2, retroBrown, "FiringRoomBaseTrimE");
    site.box(g, 0.08, 0.22, 8.0, -192.38, floorTop + 0.22, 198.0, retroBrown, "FiringRoomBaseTrimE");
    site.box(g, 0.08, 0.07, 43.0, -214.12, floorTop + 1.24, 180.1, retroBrown, "FiringRoomMidRailW");
    for (const wz of [160.0, 172.0, 178.0, 184.0, 190.0, 196.0]) {
      site.box(g, 0.1, 6.2, 0.14, -214.1, 3.34, wz, retroConsoleDark, "FiringRoomWallPilaster");
    }

    // 2. Reception Lobby (south center)
    // Warm terrazzo/carpet, reception suite, visitor displays and period seating.
    site.box(g, 23.4, 0.02, 13.2, cx, floorTop + 0.011, 195.2, retroCarpet, "LobbyCarpet");
    site.box(g, 9.4, 0.026, 2.2, cx, floorTop + 0.024, 200.4, retroBrown, "LobbyEntryMat");

    // Reception desk: wood body, dark top and chrome trim.
    site.box(g, 6.4, 0.88, 1.7, cx, floorTop + 0.44, 192.6, retroWood, "ReceptionDeskBody");
    site.box(g, 6.7, 0.1, 2.0, cx, floorTop + 0.93, 192.6, retroCharcoal, "ReceptionDeskTop");
    site.box(g, 6.5, 0.14, 0.1, cx, floorTop + 0.48, 193.47, retroChrome, "ReceptionDeskTrim");
    addNameplate(cx, floorTop + 0.72, 193.48, "VISITOR RECEPTION", "LAUNCH CONTROL CENTER · LC-39A", 3.6);
    site.box(g, 0.8, 0.48, 0.55, cx - 1.55, floorTop + 1.22, 192.5, retroCharcoal, "ReceptionMonitor");
    site.canvasPlane(
      g, 0.66, 0.36, cx - 1.55, floorTop + 1.22, 192.79, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#08130b";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#6dff97";
        ctx.font = "700 12px monospace";
        ctx.fillText("LC-39A VISITOR STATUS", 10, 22);
        ctx.fillStyle = "#ffcf6b";
        ctx.fillText("FIRING ROOM 1 .... GO", 10, 46);
        ctx.fillText("RANGE ............ GREEN", 10, 66);
        ctx.fillText("WELCOME ........... YES", 10, 86);
        ctx.strokeStyle = "#34ff6b";
        ctx.strokeRect(2, 2, w - 4, h - 4);
      },
      256, 128,
      { unlit: true, name: "ReceptionStatusScreen" }
    );
    site.box(g, 0.62, 0.05, 0.34, cx - 0.3, floorTop + 1.0, 192.1, retroCharcoal, "ReceptionKeyboard");
    site.box(g, 0.6, 0.03, 0.42, cx + 0.55, floorTop + 0.99, 192.1, retroCream, "ReceptionVisitorLog");
    addPhone(cx + 1.9, 192.3);
    site.cyl(g, 0.02, 0.42, cx + 2.2, floorTop + 1.19, 192.6, retroChrome, 6, "ReceptionLampArm");
    site.box(g, 0.3, 0.12, 0.2, cx + 2.2, floorTop + 1.45, 192.6, retroCharcoal, "ReceptionLampShade");
    site.cyl(g, 0.28, 0.08, cx, floorTop + 0.6, 191.1, retroUpholstery, 12, "ReceptionStoolSeat");
    site.cyl(g, 0.06, 0.35, cx, floorTop + 0.36, 191.1, retroCharcoal, 8, "ReceptionStoolPost");
    site.cyl(g, 0.28, 0.05, cx, floorTop + 0.13, 191.1, retroCharcoal, 12, "ReceptionStoolBase");

    // Guest credenza behind the desk.
    site.box(g, 4.7, 1.0, 0.7, cx, floorTop + 0.5, 188.8, retroWood, "ReceptionCredenza");
    site.box(g, 4.8, 0.1, 0.8, cx, floorTop + 1.05, 188.8, retroCharcoal, "ReceptionCredenzaTop");
    site.cyl(g, 0.18, 0.45, cx - 1.5, floorTop + 1.32, 188.8, retroChrome, 10, "ReceptionCoffeeUrn");
    site.box(g, 0.7, 0.16, 0.45, cx + 1.2, floorTop + 1.18, 188.8, retroCream, "ReceptionCups");

    addWallSign("LAUNCH CONTROL CENTER", "WELCOME · KENNEDY SPACE CENTER", cx, 4.55, 188.36, 0, 5.6, 1.2, "LobbyWelcomeSign");
    addMissionPatch(-188.85, 3.15, 188.36, 0, "MERCURY", "#1d3a5f", "LobbyMercuryPatch");
    addMissionPatch(-171.15, 3.15, 188.36, 0, "APOLLO", "#4a2b1d", "LobbyApolloPatch");

    // Directory board and analog clock on the east lobby wall.
    site.canvasPlane(
      g, 4.0, 2.1, -168.34, 2.6, 198.2, 0, -Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#201d18";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#8c7b57";
        ctx.lineWidth = 5;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.fillStyle = "#e9e2cd";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.font = "900 26px Arial, Helvetica, sans-serif";
        ctx.fillText("LCC DIRECTORY", 22, 34);
        const rows = [
          ["FIRING ROOM 1", "WEST"],
          ["CONFERENCE ROOM", "EAST"],
          ["RESTROOMS", "NORTH"],
          ["ELECTRICAL CONTROL", "NORTH"],
          ["MAIN ENTRANCE", "SOUTH"]
        ];
        rows.forEach((row, i) => {
          const y = 82 + i * 38;
          ctx.font = "700 18px monospace";
          ctx.fillStyle = "#d9d2bd";
          ctx.fillText(row[0], 22, y);
          ctx.textAlign = "right";
          ctx.fillStyle = "#ffcf6b";
          ctx.fillText(row[1], w - 22, y);
          ctx.textAlign = "left";
          ctx.strokeStyle = "rgba(140,123,87,0.4)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(22, y + 14);
          ctx.lineTo(w - 22, y + 14);
          ctx.stroke();
        });
      },
      640, 320,
      { unlit: true, name: "LobbyDirectoryBoard" }
    );
    site.canvasPlane(
      g, 1.0, 1.0, -168.34, 5.1, 196.2, 0, -Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#ded8c3";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#4b463b";
        ctx.lineWidth = 8;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        const px = w * 0.5;
        const py = h * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, w * 0.38, 0, Math.PI * 2);
        ctx.strokeStyle = "#39362d";
        ctx.lineWidth = 4;
        ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a) * w * 0.31, py + Math.sin(a) * w * 0.31);
          ctx.lineTo(px + Math.cos(a) * w * 0.37, py + Math.sin(a) * w * 0.37);
          ctx.stroke();
        }
        ctx.strokeStyle = "#2e2a20";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + w * 0.18, py - h * 0.12);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - w * 0.05, py - h * 0.26);
        ctx.stroke();
      },
      256, 256,
      { unlit: true, name: "LobbyClock" }
    );

    // Interior exit sign and mission photographs below the tall south windows.
    addWallSign("EXIT", "", cx, 4.85, 201.94, Math.PI, 1.7, 0.52, "LobbyExitSign", {
      bg: "#14532d",
      border: "#86efac",
      fg: "#d1fae5"
    });
    const drawLaunchPhoto = (ctx, w, h) => {
      ctx.fillStyle = "#0b1a2a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#d9d2bd";
      ctx.fillRect(0, 0, w, h * 0.18);
      ctx.fillStyle = "#b7c7d6";
      ctx.fillRect(0, h * 0.18, w, h * 0.08);
      ctx.fillStyle = "#e9e2cd";
      ctx.fillRect(w * 0.46, h * 0.28, w * 0.08, h * 0.4);
      ctx.fillStyle = "#9aa7b2";
      ctx.beginPath();
      ctx.moveTo(w * 0.46, h * 0.28);
      ctx.lineTo(w * 0.5, h * 0.18);
      ctx.lineTo(w * 0.54, h * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e25822";
      ctx.beginPath();
      ctx.moveTo(w * 0.47, h * 0.68);
      ctx.lineTo(w * 0.5, h * 0.92);
      ctx.lineTo(w * 0.53, h * 0.68);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d9d2bd";
      ctx.font = "700 14px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LC-39A · MISSION READY", w * 0.5, h - 14);
    };
    addFramedPicture(-189, 2.35, 201.94, Math.PI, 2.2, 1.6, "LobbyLaunchPhotoW", drawLaunchPhoto);
    addFramedPicture(-171, 2.35, 201.94, Math.PI, 2.2, 1.6, "LobbyLaunchPhotoE", drawLaunchPhoto);

    // Period seating, coffee table and rugs.
    for (const sx of [cx - 8.5, cx + 8.5]) {
      site.box(g, 3.4, 0.28, 1.2, sx, floorTop + 0.18, 197.6, retroWood, "LobbySofaBase");
      site.box(g, 3.0, 0.22, 1.0, sx, floorTop + 0.4, 197.6, retroUpholstery, "LobbySofaSeat");
      site.box(g, 3.4, 0.75, 0.24, sx, floorTop + 0.75, 198.15, retroUpholstery, "LobbySofaBack");
      site.box(g, 0.24, 0.55, 1.1, sx - 1.68, floorTop + 0.55, 197.6, retroWood, "LobbySofaArm");
      site.box(g, 0.24, 0.55, 1.1, sx + 1.68, floorTop + 0.55, 197.6, retroWood, "LobbySofaArm");
      site.box(g, 7.0, 0.012, 5.4, sx, floorTop + 0.027, 196.2, retroRug, "LobbyRug");
    }
    site.box(g, 1.8, 0.1, 0.9, cx - 8.5, floorTop + 0.5, 194.6, retroWood, "LobbyCoffeeTableTop");
    for (const lx of [-0.7, 0.7]) {
      site.box(g, 0.08, 0.42, 0.08, cx - 8.5 + lx, floorTop + 0.25, 194.6, retroWood, "LobbyCoffeeTableLeg");
    }
    site.box(g, 0.5, 0.04, 0.35, cx - 8.5, floorTop + 0.58, 194.6, retroCream, "LobbyMagazines");

    // Coffee service in the crew lounge corner.
    site.box(g, 1.6, 0.95, 1.2, cx - 8.5, floorTop + 0.475, 190.5, retroWood, "LobbyCoffeeCounter");
    site.box(g, 1.8, 0.1, 1.35, cx - 8.5, floorTop + 1.0, 190.5, retroCharcoal, "LobbyCoffeeTop");
    site.cyl(g, 0.16, 0.42, cx - 8.9, floorTop + 1.28, 190.5, retroChrome, 10, "LobbyCoffeeUrn");
    site.box(g, 0.45, 0.16, 0.35, cx - 8.05, floorTop + 1.13, 190.5, retroCream, "LobbyCoffeeCups");
    addWallSign("COFFEE", "CREW LOUNGE", cx - 8.5, 1.7, 188.36, 0, 2.4, 0.6, "LobbyCoffeeSign");

    addPottedPlant(-190.8, 200.2, 1.0);
    addPottedPlant(-169.2, 200.2, 1.0);

    // Freestanding directory near the entrance.
    site.box(g, 0.12, 1.9, 0.12, cx + 5.6, floorTop + 0.95, 200.2, retroCharcoal, "LobbyDirectoryPost");
    site.box(g, 1.5, 1.1, 0.1, cx + 5.6, floorTop + 1.35, 200.2, retroBrown, "LobbyDirectoryPanel");
    site.canvasPlane(
      g, 1.4, 1.0, cx + 5.6, floorTop + 1.35, 200.26, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#201d18";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#e9e2cd";
        ctx.textAlign = "center";
        ctx.font = "900 22px Arial, Helvetica, sans-serif";
        ctx.fillText("FIRING ROOM 1", w * 0.5, 32);
        ctx.fillStyle = "#ffcf6b";
        ctx.font = "700 16px monospace";
        ctx.fillText("<- WEST WING", w * 0.5, 58);
        ctx.fillStyle = "#d9d2bd";
        ctx.fillText("CONFERENCE ->", w * 0.5, 84);
        ctx.fillText("RESTROOMS ^", w * 0.5, 110);
        ctx.fillText("ENTRANCE v", w * 0.5, 136);
      },
      384, 192,
      { unlit: true, name: "LobbyFloorDirectory" }
    );

    // Ceiling cloud over the reception desk; the tall glazed lobby remains open.
    site.box(g, 9.2, 0.18, 4.6, cx, 5.4, 192.6, retroCream, "LobbyCeilingCloud");
    for (const lx of [cx - 2.8, cx, cx + 2.8]) {
      site.box(g, 1.5, 0.03, 0.8, lx, 5.29, 192.6, m("lamp"), "LobbyCloudLight");
    }
    for (const [rx, rz] of [[-4.2, -2.1], [4.2, -2.1], [-4.2, 2.1], [4.2, 2.1]]) {
      site.cyl(g, 0.015, 16.3, cx + rx, 13.6, 192.6 + rz, trim, 6, "LobbyCloudRod");
    }

    // Lobby base trim.
    site.box(g, 0.06, 0.22, 1.4, -192.28, floorTop + 0.11, 189.1, retroBrown, "LobbyBaseTrimW");
    site.box(g, 0.06, 0.22, 7.7, -192.28, floorTop + 0.11, 198.05, retroBrown, "LobbyBaseTrimW");
    site.box(g, 0.06, 0.22, 1.4, -168.32, floorTop + 0.11, 189.1, retroBrown, "LobbyBaseTrimE");
    site.box(g, 0.06, 0.22, 7.7, -168.32, floorTop + 0.11, 198.05, retroBrown, "LobbyBaseTrimE");
    site.box(g, 7.0, 0.22, 0.06, -188.5, floorTop + 0.11, 201.94, retroBrown, "LobbyBaseTrimS");
    site.box(g, 7.0, 0.22, 0.06, -171.5, floorTop + 0.11, 201.94, retroBrown, "LobbyBaseTrimS");
    site.box(g, 0.06, 0.06, 1.4, -192.28, floorTop + 0.86, 189.1, retroBrown, "LobbyChairRailW");
    site.box(g, 0.06, 0.06, 7.7, -192.28, floorTop + 0.86, 198.05, retroBrown, "LobbyChairRailW");
    site.box(g, 0.06, 0.06, 1.4, -168.32, floorTop + 0.86, 189.1, retroBrown, "LobbyChairRailE");
    site.box(g, 0.06, 0.06, 7.7, -168.32, floorTop + 0.86, 198.05, retroBrown, "LobbyChairRailE");
    site.box(g, 7.0, 0.06, 0.06, -188.5, floorTop + 0.86, 201.94, retroBrown, "LobbyChairRailS");
    site.box(g, 7.0, 0.06, 0.06, -171.5, floorTop + 0.86, 201.94, retroBrown, "LobbyChairRailS");

    // Interior door headers and signs.
    site.box(g, 3.4, 0.8, 0.7, -184.5, 2.9, 188, white, "LobbyRestroomHeader");
    site.box(g, 3.4, 0.8, 0.7, -175.5, 2.9, 188, white, "LobbyElectricalHeader");
    site.box(g, 0.7, 0.8, 4.4, -192, 2.9, 192, white, "LobbyFiringHeader");
    site.box(g, 0.7, 0.8, 4.4, -168, 2.9, 192, white, "LobbyConferenceHeader");
    site.box(g, 3.4, 18.5, 0.7, -184.5, 12.55, 188, white, "LobbyRestroomInfill");
    site.box(g, 3.4, 18.5, 0.7, -175.5, 12.55, 188, white, "LobbyElectricalInfill");
    site.box(g, 0.7, 18.5, 4.4, -192, 12.55, 192, white, "LobbyFiringInfill");
    site.box(g, 0.7, 18.5, 4.4, -168, 12.55, 192, white, "LobbyConferenceInfill");
    addWallSign("RESTROOMS", "MEN · WOMEN · ACCESSIBLE", -184.5, 2.9, 188.36, 0, 3.0, 0.5, "LobbyRestroomSign");
    addWallSign("ELECTRICAL", "HIGH VOLTAGE · AUTHORIZED ONLY", -175.5, 2.9, 188.36, 0, 3.0, 0.5, "LobbyElectricalSign", {
      bg: "#2b2110",
      border: "#facc15",
      fg: "#fde68a"
    });
    addWallSign("CONFERENCE ROOM", "MISSION PLANNING", -168.36, 2.9, 192, -Math.PI / 2, 3.2, 0.55, "LobbyConferenceSign");

    // 3. Restrooms (center-west)
    // Tiled room with a vanity/lounge, stall bank and urinals.
    site.box(g, 11.9, 0.02, 29.4, -186.3, floorTop + 0.012, 172.95, retroTileFloor, "RestroomFloorTile");
    for (const dz of [164.0, 181.0]) {
      site.cyl(g, 0.16, 0.01, -186.3, floorTop + 0.03, dz, retroChrome, 12, "RestroomFloorDrain");
    }
    site.box(g, 0.06, 2.6, 29.0, -192.26, 1.55, 173.0, retroTileWall, "RestroomWestTile");
    site.box(g, 11.8, 2.6, 0.06, -186.3, 1.55, 158.24, retroTileWall, "RestroomNorthTile");
    site.box(g, 0.06, 2.6, 29.0, -180.34, 1.55, 173.0, retroTileWall, "RestroomEastTile");
    site.box(g, 11.9, 0.12, 29.4, -186.3, 3.1, 172.95, retroCream, "RestroomCeiling");
    for (const lz of [163.0, 170.0, 177.0, 184.0]) {
      site.box(g, 1.8, 0.03, 0.8, -186.3, 3.03, lz, m("lamp"), "RestroomLight");
    }

    // Toilet-room partition and sign.
    site.box(g, 6.3, 2.7, 0.3, -189.15, floorTop + 1.35, 178, white, "RestroomPartitionW");
    site.box(g, 2.7, 2.7, 0.3, -181.65, floorTop + 1.35, 178, white, "RestroomPartitionE");
    site.box(g, 3.0, 0.4, 0.32, -184.5, 2.86, 178, white, "RestroomToiletHeader");
    addWallSign("TOILETS", "", -184.5, 2.86, 178.17, 0, 2.4, 0.3, "RestroomToiletSign");

    // Four stalls and their toilets.
    const stallX = [-191.3, -189.3, -187.3, -185.3, -183.3];
    for (const px of stallX) {
      site.box(g, 0.08, 2.2, 1.6, px, floorTop + 1.1, 159.0, retroConsoleDark, "RestroomStallPartition");
    }
    for (let i = 0; i < 4; i++) {
      const doorX = stallX[i] + 1.0;
      site.box(g, 1.86, 1.9, 0.06, doorX, floorTop + 0.97, 159.83, retroConsoleDark, "RestroomStallDoor");
      site.box(g, 0.06, 0.16, 0.04, doorX - 0.78, floorTop + 1.05, 159.87, retroChrome, "RestroomStallHandle");
      site.box(g, 0.08, 0.08, 0.04, doorX, 2.25, 159.87, retroLampGreen, "RestroomStallLamp");
      site.box(g, 0.55, 0.55, 0.2, doorX, floorTop + 0.55, 158.55, m("white"), "RestroomToiletTank");
      site.cyl(g, 0.26, 0.35, doorX, floorTop + 0.31, 159.12, m("white"), 12, "RestroomToiletBowl");
      site.box(g, 0.62, 0.06, 0.45, doorX, floorTop + 0.5, 159.15, m("white"), "RestroomToiletSeat");
      site.box(g, 0.06, 0.12, 0.18, doorX + 0.33, floorTop + 0.35, 158.62, retroChrome, "RestroomFlush");
    }
    site.box(g, 1.6, 0.04, 0.04, -190.4, 1.0, 159.5, retroChrome, "RestroomGrabBar");
    site.box(g, 8.3, 0.35, 0.1, -187.3, 2.55, 159.85, retroTileWall, "RestroomStallHeader");

    // Urinals on the north wall.
    for (const ux of [-182.6, -181.4]) {
      site.box(g, 0.42, 0.6, 0.3, ux, floorTop + 0.75, 158.5, m("white"), "RestroomUrinal");
      site.box(g, 0.32, 0.18, 0.2, ux, floorTop + 0.45, 158.55, m("white"), "RestroomUrinalBowl");
      site.cyl(g, 0.02, 0.45, ux, floorTop + 1.05, 158.45, retroChrome, 6, "RestroomUrinalPipe");
    }
    for (const dx of [-183.3, -182.0]) {
      site.box(g, 0.05, 1.2, 0.6, dx, floorTop + 1.4, 158.8, retroConsoleDark, "RestroomUrinalDivider");
    }

    // Crew lockers along the west wall and shower stalls on the east wall.
    site.box(g, 0.5, 2.0, 6.0, -191.9, floorTop + 1.0, 169.0, retroConsoleDark, "RestroomLockerBank");
    site.box(g, 0.55, 0.1, 6.0, -191.9, floorTop + 2.05, 169.0, retroCharcoal, "RestroomLockerTop");
    for (let i = 0; i < 6; i++) {
      const lz = 166.6 + i * 1.0;
      site.box(g, 0.03, 1.8, 0.86, -191.63, floorTop + 1.02, lz, retroCharcoal, "RestroomLockerDoor");
      site.box(g, 0.02, 0.05, 0.3, -191.61, floorTop + 1.32, lz, retroChrome, "RestroomLockerVent");
      site.box(g, 0.03, 0.08, 0.08, -191.61, floorTop + 0.95, lz + 0.32, retroChrome, "RestroomLockerLatch");
    }
    site.box(g, 0.5, 0.45, 2.0, -191.8, floorTop + 0.23, 173.4, retroUpholstery, "RestroomChangeBench");
    site.box(g, 0.5, 0.5, 0.1, -191.8, floorTop + 0.5, 172.45, retroWood, "RestroomChangeBenchEnd");
    addWallSign("CREW LOCKERS", "FIRING ROOM 1", -192.24, 2.55, 169.0, Math.PI / 2, 3.0, 0.55, "RestroomLockerSign");
    addWallSign("SHOWERS", "CREW FACILITIES", -180.34, 2.55, 169.0, -Math.PI / 2, 2.8, 0.55, "RestroomShowerSign");
    for (let i = 0; i < 2; i++) {
      const szS = 166.6 + i * 4.4;
      site.box(g, 1.0, 2.2, 0.08, -180.8, floorTop + 1.1, szS - 1.1, retroTileWall, "RestroomShowerSide");
      site.box(g, 1.0, 2.2, 0.08, -180.8, floorTop + 1.1, szS + 1.1, retroTileWall, "RestroomShowerSide");
      site.box(g, 0.8, 0.04, 1.0, -180.9, floorTop + 0.03, szS, retroChrome, "RestroomShowerFloor");
      site.cyl(g, 0.025, 0.5, -180.4, 2.2, szS, retroChrome, 6, "RestroomShowerPipe");
      site.box(g, 0.18, 0.06, 0.18, -180.4, 1.98, szS, retroChrome, "RestroomShowerHead");
      site.box(g, 0.06, 1.85, 1.9, -181.16, floorTop + 0.95, szS, m("white"), "RestroomShowerCurtain");
      site.cyl(g, 0.12, 0.01, -180.9, floorTop + 0.035, szS, retroCharcoal, 10, "RestroomShowerDrain");
    }

    // Vanity and mirrors.
    site.box(g, 0.72, 0.88, 5.6, -191.85, floorTop + 0.44, 184.0, retroWood, "RestroomVanity");
    site.box(g, 0.8, 0.1, 5.8, -191.85, floorTop + 0.93, 184.0, retroCharcoal, "RestroomVanityTop");
    site.box(g, 0.08, 0.28, 5.8, -192.2, 1.4, 184.0, retroTileWall, "RestroomVanityBacksplash");
    for (const vz of [182.2, 184.0, 185.8]) {
      site.cyl(g, 0.22, 0.12, -191.55, floorTop + 1.0, vz, m("white"), 12, "RestroomBasin");
      site.cyl(g, 0.025, 0.24, -191.95, floorTop + 1.16, vz, retroChrome, 6, "RestroomFaucet");
      site.box(g, 0.06, 1.15, 0.9, -192.22, 2.0, vz, retroChrome, "RestroomMirror");
    }
    site.box(g, 0.16, 0.28, 0.22, -192.2, 1.4, 181.4, retroChrome, "RestroomSoapDispenser");
    site.box(g, 0.16, 0.4, 0.3, -192.2, 1.35, 186.6, retroChrome, "RestroomTowelDispenser");
    site.box(g, 0.1, 0.55, 0.75, -180.34, 2.6, 170, retroCharcoal, "RestroomVent");
    site.box(g, 0.16, 0.3, 0.3, -180.34, 1.5, 181.6, retroChrome, "RestroomHandDryer");

    // Bench, coat hooks and trash.
    site.box(g, 0.5, 0.45, 2.4, -180.55, floorTop + 0.23, 184.0, retroUpholstery, "RestroomBench");
    site.box(g, 0.1, 1.0, 2.4, -180.35, 0.9, 184.0, retroWood, "RestroomBenchBack");
    for (const hz of [183.0, 184.0, 185.0]) {
      site.box(g, 0.12, 0.12, 0.05, -180.32, 1.65, hz, retroChrome, "RestroomCoatHook");
    }
    site.cyl(g, 0.22, 0.55, -180.75, floorTop + 0.3, 186.6, retroCharcoal, 10, "RestroomTrashBin");
    addPottedPlant(-180.95, 181.0, 0.75);
    // 4. Electrical Control Room (center-east)
    site.box(g, 11.9, 0.02, 29.4, -173.7, floorTop + 0.012, 172.95, retroIndustrial, "ElectricalFloor");
    for (const [fx, fz] of [[-176.0, 165.0], [-171.0, 172.0], [-174.0, 181.0]]) {
      site.box(g, 1.0, 0.02, 1.0, fx, floorTop + 0.025, fz, retroConsoleDark, "ElectricalFloorPanel");
    }
    site.box(g, 11.9, 0.12, 29.4, -173.7, 3.4, 172.95, retroCream, "ElectricalCeiling");
    for (const lz of [163, 170, 177, 184]) {
      site.box(g, 2.0, 0.03, 0.8, -173.7, 3.33, lz, m("lamp"), "ElectricalLight");
    }

    // Telemetry / comms rack bank along the east wall.
    for (let i = 0; i < 5; i++) {
      const rz = 162.0 + i * 2.2;
      site.box(g, 0.85, 2.0, 1.4, -168.7, floorTop + 1.0, rz, retroCharcoal, "ElectricalRack");
      site.box(g, 0.02, 1.7, 1.2, -169.14, floorTop + 1.05, rz, m("black"), "ElectricalRackFace");
      site.box(g, 0.03, 0.18, 0.8, -169.16, floorTop + 1.95, rz, retroLampAmber, "ElectricalRackHeader");
      for (let k = 0; k < 5; k++) {
        site.box(g, 0.05, 0.05, 0.05, -169.16, floorTop + 0.55 + k * 0.28, rz - 0.45, k % 2 ? retroLampGreen : retroLampAmber, "ElectricalRackLed");
        site.box(g, 0.05, 0.05, 0.05, -169.16, floorTop + 0.55 + k * 0.28, rz + 0.45, retroLampRed, "ElectricalRackLed");
      }
    }
    site.box(g, 0.2, 0.08, 12.0, -168.9, 2.95, 166.4, retroChrome, "ElectricalCableTray");
    for (const czD of [160.5, 164.5, 168.5, 172.5]) {
      site.box(g, 0.08, 0.4, 0.08, -168.9, 2.7, czD, retroChrome, "ElectricalCableDrop");
    }
    site.box(g, 0.14, 0.55, 11.0, -168.95, 2.6, 166.4, retroCharcoal, "ElectricalCableBundle");

    // Breaker panels on the west wall.
    for (const pz of [163.8, 166.2, 168.6]) {
      site.box(g, 0.15, 1.2, 1.6, -179.6, floorTop + 1.1, pz, retroCharcoal, "ElectricalBreakerPanel");
      site.box(g, 0.03, 1.0, 1.4, -179.51, floorTop + 1.1, pz, retroConsoleDark, "ElectricalBreakerFace");
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 5; c++) {
          site.box(g, 0.03, 0.08, 0.08, -179.49, floorTop + 0.8 + r * 0.28, pz - 0.55 + c * 0.25, r === 1 ? retroLampAmber : retroCharcoal, "ElectricalBreakerSwitch");
        }
      }
    }
    addWallSign("TELEMETRY · COMMS · RANGE", "LC-39A GROUND SYSTEMS", -168.34, 2.6, 166.4, -Math.PI / 2, 3.8, 0.5, "ElectricalRackSign");
    addWallSign("HIGH VOLTAGE", "ELECTRICAL CONTROL · AUTHORIZED ONLY", -168.34, 2.45, 174.0, -Math.PI / 2, 3.4, 0.7, "ElectricalWarningSign", {
      bg: "#2b2110",
      border: "#facc15",
      fg: "#fde68a",
      subFg: "#fca5a5"
    });

    // UPS cabinets and workbench.
    for (const uz of [178.4, 180.0]) {
      site.box(g, 0.85, 1.7, 1.3, -168.7, floorTop + 0.85, uz, retroCharcoal, "ElectricalUps");
      site.box(g, 0.03, 1.35, 1.1, -169.14, floorTop + 0.9, uz, m("black"), "ElectricalUpsFace");
      site.box(g, 0.04, 0.08, 0.08, -169.16, floorTop + 1.35, uz - 0.35, retroLampGreen, "ElectricalUpsLed");
      site.box(g, 0.04, 0.08, 0.08, -169.16, floorTop + 1.35, uz + 0.35, retroLampAmber, "ElectricalUpsLed");
    }
    site.box(g, 2.4, 0.88, 0.9, -171.5, floorTop + 0.44, 184.2, retroCharcoal, "ElectricalWorkbench");
    site.box(g, 2.6, 0.1, 1.0, -171.5, floorTop + 0.93, 184.2, retroConsoleDark, "ElectricalWorkbenchTop");
    site.box(g, 0.7, 0.45, 0.35, -171.5, floorTop + 1.2, 183.9, retroCharcoal, "ElectricalTerminal");
    addScreenPlane(-171.5, floorTop + 1.2, 184.09, 0.58, 0.32, retroCrtAmber, "ElectricalTerminalScreen");
    addPhone(-170.8, 184.2);
    addChair(-171.5, 185.7, false);
    site.box(g, 0.05, 0.6, 0.35, -179.66, 1.0, 186.2, retroLampRed, "ElectricalEmergencyLamp");
    site.cyl(g, 0.12, 0.6, -179.58, 0.9, 186.8, m("red"), 10, "ElectricalFireExtinguisher");
    for (const pzC of [159.4, 182.2, 184.6]) {
      site.cyl(g, 0.04, 3.0, -168.24, 1.7, pzC, retroChrome, 6, "ElectricalConduit");
    }

    // 5. Conference / briefing room (east wing)
    site.box(g, 22.2, 0.02, 43.4, -156.55, floorTop + 0.011, 180.1, retroCarpet, "ConferenceCarpet");
    site.box(g, 22.2, 0.14, 43.4, -156.55, 4.2, 180.1, retroCream, "ConferenceCeiling");
    for (let gx = -166; gx <= -147; gx += 3.2) {
      site.box(g, 0.06, 0.04, 43.0, gx, 4.14, 180.1, retroConsoleDark, "ConferenceCeilingGridX");
    }
    for (let gz = 160; gz <= 200; gz += 3.4) {
      site.box(g, 22.0, 0.04, 0.06, -156.55, 4.14, gz, retroConsoleDark, "ConferenceCeilingGridZ");
    }
    for (const lx of [-162, -151]) {
      for (const lz of [163, 171, 179, 187, 195]) {
        site.box(g, 2.4, 0.03, 1.0, lx, 4.1, lz, m("lamp"), "ConferenceLight");
      }
    }
    const confLight = new THREE.PointLight(0xffe6bf, 1.0, 32, 1.5);
    confLight.position.set(-156.5, 3.7, 180);
    confLight.name = "ConferenceWarmLight";
    g.add(confLight);

    // Wood wainscot and base trim.
    site.box(g, 0.08, 0.9, 31.2, -167.66, floorTop + 0.45, 174.2, retroWood, "ConferenceWainscotW");
    site.box(g, 0.08, 0.9, 7.4, -167.66, floorTop + 0.45, 197.9, retroWood, "ConferenceWainscotW");
    site.box(g, 0.08, 0.9, 43.0, -145.44, floorTop + 0.45, 180.1, retroWood, "ConferenceWainscotE");
    site.box(g, 0.08, 0.06, 31.2, -167.66, floorTop + 0.92, 174.2, retroBrown, "ConferenceRailW");
    site.box(g, 0.08, 0.06, 7.4, -167.66, floorTop + 0.92, 197.9, retroBrown, "ConferenceRailW");
    site.box(g, 0.08, 0.06, 43.0, -145.44, floorTop + 0.92, 180.1, retroBrown, "ConferenceRailE");

    // Briefing screen and credenza on the north wall.
    site.box(g, 5.8, 3.1, 0.16, -156.55, 2.55, 158.55, retroCharcoal, "ConferenceScreenFrame");
    site.canvasPlane(
      g, 5.5, 2.8, -156.55, 2.55, 158.64, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#101b16";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#3f5e4b";
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#d9e8d7";
        ctx.font = "900 34px Arial, Helvetica, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("LC-39A MISSION PLANNING", 26, 46);
        ctx.fillStyle = "#8fe3ad";
        ctx.font = "700 20px monospace";
        ctx.fillText("T-00:04:12    RANGE GREEN    VEHICLE GO", 26, 82);
        ctx.strokeStyle = "rgba(143,227,173,0.6)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 70; i++) {
          const x = 30 + i * 12;
          const y = h * 0.62 + Math.sin(i * 0.24) * 24;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#ffcf6b";
        ctx.font = "700 17px monospace";
        ctx.fillText("ASCENT PROFILE · OMS-2 INSERTION · GROUND TRACK", 26, h - 26);
      },
      1024, 512,
      { unlit: true, name: "ConferenceBriefingScreen" }
    );
    site.cyl(g, 0.03, 0.4, -156.55, 4.0, 175.0, retroCharcoal, 6, "ConferenceProjectorMount");
    site.box(g, 0.5, 0.25, 0.7, -156.55, 3.85, 175.0, retroCharcoal, "ConferenceProjector");
    site.cyl(g, 0.08, 0.05, -156.55, 3.8, 174.6, retroChrome, 8, "ConferenceProjectorLens");
    site.box(g, 0.8, 1.1, 0.5, -162.5, floorTop + 0.55, 161.5, retroWood, "ConferenceLectern");
    site.box(g, 0.9, 0.06, 0.6, -162.5, floorTop + 1.13, 161.5, retroCharcoal, "ConferenceLecternTop");
    site.box(g, 6.0, 1.0, 0.8, -156.55, floorTop + 0.5, 159.4, retroWood, "ConferenceCredenza");
    site.box(g, 6.1, 0.1, 0.9, -156.55, floorTop + 1.05, 159.4, retroCharcoal, "ConferenceCredenzaTop");
    site.cyl(g, 0.18, 0.45, -157.8, floorTop + 1.32, 159.4, retroChrome, 10, "ConferenceCoffeeUrn");
    site.box(g, 0.7, 0.16, 0.4, -155.4, floorTop + 1.18, 159.4, retroCream, "ConferenceCups");

    // Long briefing table and chairs.
    site.box(g, 4.6, 0.14, 10.5, -156.55, floorTop + 0.82, 169, retroWood, "ConferenceTableTop");
    for (const pz of [165.5, 172.5]) {
      site.box(g, 0.9, 0.78, 0.9, -156.55, floorTop + 0.39, pz, retroBrown, "ConferenceTablePedestal");
    }
    site.box(g, 1.6, 0.04, 3.0, -156.55, floorTop + 0.9, 169, retroCharcoal, "ConferenceTablePower");
    for (let i = 0; i < 5; i++) {
      const czC = 164.5 + i * 2.1;
      addChair(-160.2, czC, false);
      addChair(-152.9, czC, false);
    }
    for (const tz of [166.5, 169, 171.5]) {
      site.box(g, 0.5, 0.08, 0.35, -157.6, floorTop + 0.93, tz, retroCream, "ConferencePapers");
      site.cyl(g, 0.08, 0.3, -155.4, floorTop + 1.03, tz, retroChrome, 8, "ConferenceCarafe");
    }

    // Whiteboard on the east wall and framed charts on the west wall.
    site.box(g, 0.12, 2.6, 5.4, -145.5, 2.3, 166, retroBrown, "ConferenceWhiteboardFrame");
    site.canvasPlane(
      g, 5.2, 2.4, -145.58, 2.3, 166, 0, -Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#e9e4d7";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(70,70,60,0.45)";
        ctx.lineWidth = 2;
        for (let i = 1; i < 8; i++) {
          ctx.beginPath();
          ctx.moveTo((w / 8) * i, 0);
          ctx.lineTo((w / 8) * i, h);
          ctx.stroke();
        }
        ctx.fillStyle = "#2e2a20";
        ctx.font = "900 26px Arial, Helvetica, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("MISSION NOTES", 22, 38);
        ctx.font = "700 18px monospace";
        ctx.fillText("1. COMPLETE TANKING", 22, 82);
        ctx.fillText("2. VERIFY FTS ARMED", 22, 112);
        ctx.fillText("3. CREW ABOARD + HATCH SEAL", 22, 142);
        ctx.fillText("4. RANGE GREEN -> TERMINAL COUNT", 22, 172);
        ctx.fillStyle = "#9a2c1e";
        ctx.fillText("HOLD POINT: T-00:04:12", 22, 214);
        ctx.strokeStyle = "#9a2c1e";
        ctx.lineWidth = 3;
        ctx.strokeRect(16, 190, w - 32, 38);
      },
      768, 384,
      { unlit: true, name: "ConferenceWhiteboard" }
    );
    const drawChart = (title, accent) => (ctx, w, h) => {
      ctx.fillStyle = "#181c1b";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = "#d9e8d7";
      ctx.font = "900 22px Arial, Helvetica, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(title, 14, 32);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.56, w * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(w * 0.5, h * 0.56, w * 0.38, h * 0.12, 0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffcf6b";
      ctx.font = "700 14px monospace";
      ctx.fillText("TRAJECTORY / RENDEZVOUS", 14, h - 16);
    };
    addFramedPicture(-167.62, 2.3, 163.5, Math.PI / 2, 2.0, 1.5, "ConferenceChartA", drawChart("ASCENT", "#67e8f9"));
    addFramedPicture(-167.62, 2.3, 173.5, Math.PI / 2, 2.0, 1.5, "ConferenceChartB", drawChart("RENDEZVOUS", "#fbbf24"));

    // Flight Dynamics / 3D Mission Viz station (matches the lcc_viz terminal).
    site.box(g, 3.1, 0.88, 1.0, -160, floorTop + 0.44, 184.5, retroCharcoal, "ConferenceVizDesk");
    site.box(g, 3.3, 0.1, 1.2, -160, floorTop + 0.93, 184.5, retroConsoleDark, "ConferenceVizTop");
    site.box(g, 1.7, 0.95, 0.18, -160, floorTop + 1.46, 184.05, retroCharcoal, "ConferenceVizMonitor");
    site.canvasPlane(
      g, 1.54, 0.8, -160, floorTop + 1.46, 184.15, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#07131c";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 3;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        const px = w * 0.5;
        const py = h * 0.52;
        ctx.strokeStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(px, py, w * 0.18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#facc15";
        ctx.beginPath();
        ctx.ellipse(px, py, w * 0.32, h * 0.2, 0.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "700 13px monospace";
        ctx.textAlign = "left";
        ctx.fillText("3D MISSION VIZ", 10, 22);
        ctx.fillText("ORBIT 001 · EARTH", 10, h - 12);
      },
      512, 256,
      { unlit: true, name: "ConferenceVizScreen" }
    );
    site.box(g, 1.05, 0.05, 0.32, -160, floorTop + 0.98, 185.0, retroCharcoal, "ConferenceVizKeyboard");
    addPhone(-158.8, 184.7);
    addNameplate(-160, floorTop + 0.78, 185.06, "FLIGHT DYNAMICS", "3D MISSION VIZ · ORBIT ANALYSIS", 2.8);
    addChair(-160, 186.4, true);

    // Coffee credenza and small lounge in the south half.
    site.box(g, 1.0, 1.0, 4.2, -145.9, floorTop + 0.5, 194.0, retroWood, "ConferenceCoffeeCredenza");
    site.box(g, 1.1, 0.1, 4.3, -145.9, floorTop + 1.05, 194.0, retroCharcoal, "ConferenceCoffeeTop");
    site.cyl(g, 0.18, 0.45, -145.9, floorTop + 1.32, 192.8, retroChrome, 10, "ConferenceLoungeUrn");
    site.box(g, 0.7, 0.16, 0.4, -145.9, floorTop + 1.18, 195.0, retroCream, "ConferenceLoungeCups");
    site.box(g, 8.0, 0.012, 5.2, -156.5, floorTop + 0.027, 197.0, retroRug, "ConferenceLoungeRug");
    for (const ax of [-160.5, -152.5]) {
      site.box(g, 1.4, 0.35, 1.3, ax, floorTop + 0.2, 197.5, retroWood, "ConferenceLoungeBase");
      site.box(g, 1.2, 0.22, 1.1, ax, floorTop + 0.4, 197.5, retroUpholstery, "ConferenceLoungeSeat");
      site.box(g, 1.3, 0.65, 0.22, ax, floorTop + 0.7, 198.0, retroUpholstery, "ConferenceLoungeBack");
    }
    site.box(g, 2.2, 0.1, 1.0, -156.5, floorTop + 0.5, 197.5, retroWood, "ConferenceLoungeTable");
    site.box(g, 0.5, 0.04, 0.35, -156.5, floorTop + 0.58, 197.5, retroCream, "ConferenceLoungeMagazines");
    site.canvasPlane(
      g, 0.85, 0.85, -145.48, 3.1, 184, 0, -Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#ded8c3";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#4b463b";
        ctx.lineWidth = 7;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, w * 0.36, 0, Math.PI * 2);
        ctx.strokeStyle = "#39362d";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.5);
        ctx.lineTo(w * 0.68, h * 0.38);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w * 0.5, h * 0.5);
        ctx.lineTo(w * 0.46, h * 0.26);
        ctx.stroke();
      },
      256, 256,
      { unlit: true, name: "ConferenceClock" }
    );

    // Glazed South Observation Windows + proud mullions + Space-Age Sun-Hood Louvers
    for (const rowY of [7.2, 13.0, 18.8]) {
      for (const side of [-1, 1]) {
        // Glass cleanly proud at south + 0.14 (wall face at south = 203.0)
        site.box(g, 26, 2.5, 0.22, cx + side * 20, rowY, south + 0.14, m("glass"), "LCCWindowGlass");
        // Concrete sun-hood shading eyebrow projecting south (depth 1.35m)
        site.box(g, 27.4, 0.42, 1.35, cx + side * 20, rowY + 1.5, south + 0.68, curb, "LCCSunHood");
        for (let offset = -12; offset <= 12; offset += 4) {
          site.box(g, 0.26, 2.58, 0.34, cx + side * 20 + offset, rowY, south + 0.22, trim, "LCCMullion");
        }
      }
    }

    // Glazed Vestibule Entrance Canopy & LCC Sliding Doors
    site.box(g, 13.5, 0.55, 8.2, cx, 9.8, south + 4.1, steel, "LCCCanopy");
    site.box(g, 13.7, 0.22, 8.4, cx, 10.18, south + 4.1, m("nasa_blue"), "LCCCanopyFascia");
    site.cyl(g, 0.34, 9.6, cx - 5.4, 4.8, south + 7.6, concrete, 10, "CanopyColW");
    site.cyl(g, 0.34, 9.6, cx + 5.4, 4.8, south + 7.6, concrete, 10, "CanopyColE");

    // ── LCC Sliding Entrance Doors (press [E] to step straight through) ──────
    const doorSystemGroup = new THREE.Group();
    doorSystemGroup.name = "LCC_EntranceDoorSystem";
    // Keep the sliding leaves out of the static geometry merge passes so the
    // [E] step-through can actually animate them.
    doorSystemGroup.userData.noMerge = true;
    g.add(doorSystemGroup);

    // Frame side jambs, threshold, track and transom window above doors
    site.box(g, 1.8, 4.4, wallT * 1.1, cx - 4.1, 2.2, south - halfWall, white, "LCCDoorJambW");
    site.box(g, 1.8, 4.4, wallT * 1.1, cx + 4.1, 2.2, south - halfWall, white, "LCCDoorJambE");
    site.box(g, 10, 5.6, wallT, cx, 7.2, south - halfWall, white, "LCCTransomWall");
    site.box(g, 6.4, 4.6, 0.22, cx, 7.2, south + 0.12, m("glass"), "LCCTransomGlass");
    site.box(g, 6.6, 0.2, 0.35, cx, 4.45, south + 0.14, trim, "LCCTransomMullion");
    site.box(g, 7.2, 0.3, 0.5, cx, 4.25, south + 0.18, trim, "LCCDoorSlideTrack");
    site.box(g, 7.0, 0.08, 0.9, cx, 0.16, south + 0.05, steel, "LCCDoorThreshold");

    // Illuminated status light material (starts Red = Closed, transitions to Green = Open)
    const doorStatusLightMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.95,
      roughness: 0.28,
      metalness: 0.1
    });

    // Overhead illuminated status LED light bar
    const statusLightBar = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 0.16), doorStatusLightMat);
    statusLightBar.position.set(cx, 4.48, south + 0.25);
    doorSystemGroup.add(statusLightBar);

    // Keycard access reader & LED on exterior entry column
    site.box(doorSystemGroup, 0.28, 0.55, 0.16, cx + 3.45, 1.35, south + 0.35, trim, "LCCCardReaderExt");
    const readerLedExt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), doorStatusLightMat);
    readerLedExt.rotation.x = Math.PI / 2;
    readerLedExt.position.set(cx + 3.45, 1.5, south + 0.44);
    doorSystemGroup.add(readerLedExt);

    // Keycard access reader & LED on interior lobby column (for exiting)
    site.box(doorSystemGroup, 0.28, 0.55, 0.16, cx + 3.45, 1.35, south - 0.35, trim, "LCCCardReaderInt");
    const readerLedInt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), doorStatusLightMat);
    readerLedInt.rotation.x = -Math.PI / 2;
    readerLedInt.position.set(cx + 3.45, 1.5, south - 0.44);
    doorSystemGroup.add(readerLedInt);

    // Left Sliding Door Leaf
    const leftDoor = new THREE.Group();
    leftDoor.name = "LCC_LeftDoor";
    const leftBaseX = cx - 1.52;
    leftDoor.position.set(leftBaseX, 0, south + 0.12);
    doorSystemGroup.add(leftDoor);

    const doorGlassMat = m("glass");
    const doorFrameMat = steel;

    const lGlass = new THREE.Mesh(new THREE.BoxGeometry(2.95, 3.9, 0.08), doorGlassMat);
    lGlass.position.set(0, 2.05, 0);
    leftDoor.add(lGlass);

    site.box(leftDoor, 0.16, 4.0, 0.14, -1.4, 2.05, 0, doorFrameMat, "LDoorFrameL");
    site.box(leftDoor, 0.16, 4.0, 0.14, 1.4, 2.05, 0, doorFrameMat, "LDoorFrameR");
    site.box(leftDoor, 2.95, 0.16, 0.14, 0, 4.0, 0, doorFrameMat, "LDoorFrameT");
    site.box(leftDoor, 2.95, 0.2, 0.14, 0, 0.18, 0, doorFrameMat, "LDoorFrameB");
    site.cyl(leftDoor, 0.035, 1.4, 1.18, 1.6, 0.14, steel, 8, "LDoorHandleExt");
    site.cyl(leftDoor, 0.035, 1.4, 1.18, 1.6, -0.14, steel, 8, "LDoorHandleInt");
    site.box(leftDoor, 2.9, 0.24, 0.09, 0, 1.35, 0, m("steel_white"), "LDoorDecal");

    // Right Sliding Door Leaf
    const rightDoor = new THREE.Group();
    rightDoor.name = "LCC_RightDoor";
    const rightBaseX = cx + 1.52;
    rightDoor.position.set(rightBaseX, 0, south + 0.12);
    doorSystemGroup.add(rightDoor);

    const rGlass = new THREE.Mesh(new THREE.BoxGeometry(2.95, 3.9, 0.08), doorGlassMat);
    rGlass.position.set(0, 2.05, 0);
    rightDoor.add(rGlass);

    site.box(rightDoor, 0.16, 4.0, 0.14, -1.4, 2.05, 0, doorFrameMat, "RDoorFrameL");
    site.box(rightDoor, 0.16, 4.0, 0.14, 1.4, 2.05, 0, doorFrameMat, "RDoorFrameR");
    site.box(rightDoor, 2.95, 0.16, 0.14, 0, 4.0, 0, doorFrameMat, "RDoorFrameT");
    site.box(rightDoor, 2.95, 0.2, 0.14, 0, 0.18, 0, doorFrameMat, "RDoorFrameB");
    site.cyl(rightDoor, 0.035, 1.4, -1.18, 1.6, 0.14, steel, 8, "RDoorHandleExt");
    site.cyl(rightDoor, 0.035, 1.4, -1.18, 1.6, -0.14, steel, 8, "RDoorHandleInt");
    site.box(rightDoor, 2.9, 0.24, 0.09, 0, 1.35, 0, m("steel_white"), "RDoorDecal");

    // High-tech Door Status Sign
    site.canvasPlane(
      g,
      6.4,
      0.65,
      cx,
      4.88,
      south + 0.22,
      0,
      0,
      0,
      (ctx, w, h) => {
        ctx.fillStyle = "#0a192f";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "900 24px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("SECURITY ACCESS CONTROL · PRESS [E] TO ENTER", w * 0.5, 34);
      },
      512,
      64,
      { unlit: true, name: "LCC_DoorAccessSign" }
    );

    // Glowing Circular Ground Access Marker Indicator
    const entryMarkerMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const entryMarker = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.18, 32), entryMarkerMat);
    entryMarker.rotation.x = -Math.PI / 2;
    entryMarker.position.set(cx, 0.12, south + 2.2);
    g.add(entryMarker);

    // Door solid collider (ACTIVE while the doors are CLOSED)
    const doorCollider = site.addBoxCollider(cx, south - halfWall, 6.4, wallT * 1.5, "LCC entrance doors");

    // Register door controller on spaceCenter
    if (site.sc) {
      site.sc.lccDoors = {
        isOpen: false,
        progress: 0.0,
        target: 0.0,
        leftDoor: leftDoor,
        rightDoor: rightDoor,
        leftBaseX: leftBaseX,
        rightBaseX: rightBaseX,
        slideDist: 2.75,
        statusMat: doorStatusLightMat,
        markerMat: entryMarkerMat,
        marker: entryMarker,
        collider: doorCollider,
        cx: cx,
        cz: south
      };
    }

    // Crisp LCC Title Plaque over the Canopy
    site.canvasPlane(
      g,
      26,
      3.4,
      cx,
      11.9,
      south + 0.22,
      0,
      0,
      0,
      (ctx, w, h) => {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#c9f04b";
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#efeee7";
        ctx.font = "900 48px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("LAUNCH CONTROL CENTER", w * 0.5, h * 0.52);
      },
      768,
      112,
      { name: "LCC_HeaderSign" }
    );

    // Rooftop chillers & satellite comms array on roof (top = 25.4)
    for (const rx of [cx - 20, cx + 20]) {
      site.box(g, 10, 2.6, 8, rx, height + 2.7, cz, steel, "LCCRoofChiller");
    }
    site.cyl(g, 0.2, 5.2, cx + 26, height + 4.0, cz - 14, steel, 8, "LCCDomeMast");
    site.sphere(g, 1.3, cx + 26, height + 6.8, cz - 14, m("white"), 12, "LCCCommsRadome");

    // West loading dock bay
    site.box(g, 3.6, 1.3, 13, cx - hx - 1.8, 0.65, cz - 4, concreteDark, "LCCLoadingDock");
    site.box(g, 0.22, 3.6, 10, cx - hx - 0.12, 3.1, cz - 4, steel, "LoadingDoor");

    // Continuous Landscaped Concrete Entry Promenade linking LCC doors (203) -> Parking Road (246)
    site.box(g, 54, 0.16, 44, cx, 0.08, south + 21.5, concrete, "LCCPlazaApron");
    site.box(g, 14, 0.18, 43, cx, 0.09, south + 21.5, curb, "LCCWalkwayCenter");

    // Masonry planter beds flanking walkway with manicured non-flickering foliage + palm trees
    for (const side of [-1, 1]) {
      const px = cx + side * 14;
      site.box(g, 16, 0.62, 24, px, 0.31, south + 20, curb, "LCCPlanterCurb");
      site.box(g, 15.2, 0.72, 23.2, px, 0.38, south + 20, m("grass"), "LCCPlanterSoil");
      site.box(g, 14.2, 1.15, 3.4, px, 1.25, south + 11, m("foliage"), "LCCHedgeBack");
      site.box(g, 14.2, 0.95, 3.2, px, 1.15, south + 29, m("foliage"), "LCCHedgeFront");
      site.palmTree(g, px - side * 3, south + 20, 1.05, side > 0 ? 2 : 7, 0.74);
      site.palmTree(g, px + side * 4, south + 20, 0.9, side > 0 ? 5 : 1, 0.74);
    }

    // Hero Flagpoles (USA & NASA) flanking entry promenade
    site.flagPole(g, cx - 22, south + 10, 20, "usa", 0.16);
    site.flagPole(g, cx + 22, south + 10, 20, "nasa", 0.16);

    // Safety bollards cleanly seated along concrete plaza curb edge (zero grass float!)
    for (let x = -205; x <= -155; x += 5) {
      if (Math.abs(x - cx) < 6) continue; // Keep central walkway clear
      site.cyl(g, 0.18, 1.05, x, 0.68, south + 42.5, m("yellow"), 8, "LCCBollard");
    }

    // Preserve all original interior/exterior colliders identically
    site.addBoxCollider(cx, north + halfWall, hx * 2, wallT, "LCC north wall");
    site.addBoxCollider(cx - hx + halfWall, cz, wallT, hz * 2, "LCC west wall");
    site.addBoxCollider(cx + hx - halfWall, cz, wallT, hz * 2, "LCC east wall");
    site.addBoxCollider(cx - 20, south - halfWall, 30, wallT, "LCC south wall");
    site.addBoxCollider(cx + 20, south - halfWall, 30, wallT, "LCC south wall");
    site.addBoxCollider(cx - 12, 173.8, 0.6, 32.4, "LCC firing partition");
    site.addBoxCollider(cx - 12, 198.2, 0.6, 8.4, "LCC firing partition");
    site.addBoxCollider(cx + 12, 173.8, 0.6, 32.4, "LCC conference partition");
    site.addBoxCollider(cx + 12, 198.2, 0.6, 8.4, "LCC conference partition");
    site.addBoxCollider(cx - 8.85, 188, 5.7, 0.6, "LCC lobby wall");
    site.addBoxCollider(cx, 188, 6, 0.6, "LCC lobby wall");
    site.addBoxCollider(cx + 8.85, 188, 5.7, 0.6, "LCC lobby wall");
    site.addBoxCollider(cx, 172.65, 0.6, 30.1, "LCC utility divider");

    // Firing-room desks register colliders beside their geometry above.
    // Keep the remaining equipment and interior furniture solid here.
    site.addBoxCollider(-213.7, 194.0, 1.1, 1.3, "MCC equipment cabinet");
    site.addBoxCollider(-213.7, 198.0, 1.1, 1.3, "MCC equipment cabinet");
    site.addBoxCollider(cx, 192.6, 6.8, 2.0, "LCC reception desk");
    site.addBoxCollider(cx, 188.8, 4.9, 0.9, "LCC reception credenza");
    site.addBoxCollider(cx - 8.5, 197.6, 3.6, 1.4, "LCC lobby sofa");
    site.addBoxCollider(cx + 8.5, 197.6, 3.6, 1.4, "LCC lobby sofa");
    site.addBoxCollider(cx - 8.5, 190.5, 1.8, 1.4, "LCC coffee counter");
    site.addBoxCollider(cx - 8.5, 194.6, 1.9, 1.0, "LCC coffee table");
    site.addBoxCollider(cx - 10.8, 200.2, 1.0, 1.0, "LCC lobby planter");
    site.addBoxCollider(cx + 10.8, 200.2, 1.0, 1.0, "LCC lobby planter");
    site.addBoxCollider(cx + 5.6, 200.2, 1.6, 0.3, "LCC directory sign");
    site.addBoxCollider(-189.15, 178, 6.4, 0.4, "LCC restroom partition");
    site.addBoxCollider(-181.65, 178, 2.8, 0.4, "LCC restroom partition");
    site.addBoxCollider(-187.3, 159.0, 8.4, 1.8, "LCC restroom stalls");
    site.addBoxCollider(-191.85, 184.0, 0.8, 5.8, "LCC restroom vanity");
    site.addBoxCollider(-180.55, 184.0, 0.6, 2.5, "LCC restroom bench");
    site.addBoxCollider(-191.9, 169.0, 0.6, 6.1, "LCC restroom lockers");
    site.addBoxCollider(-191.8, 173.4, 0.6, 2.1, "LCC restroom changing bench");
    site.addBoxCollider(-180.8, 166.6, 1.1, 2.3, "LCC restroom shower");
    site.addBoxCollider(-180.8, 171.0, 1.1, 2.3, "LCC restroom shower");
    site.addBoxCollider(-168.7, 166.4, 0.9, 11.2, "LCC electrical racks");
    site.addBoxCollider(-168.7, 179.2, 0.9, 3.0, "LCC electrical UPS");
    site.addBoxCollider(-171.5, 184.2, 2.6, 1.0, "LCC electrical workbench");
    site.addBoxCollider(-156.55, 169.0, 5.0, 11.0, "LCC conference table");
    site.addBoxCollider(-156.55, 159.4, 6.2, 1.0, "LCC conference credenza");
    site.addBoxCollider(-162.5, 161.5, 0.9, 0.7, "LCC conference lectern");
    site.addBoxCollider(-160, 184.5, 3.4, 1.3, "LCC flight dynamics station");
    site.addBoxCollider(-145.9, 194.0, 1.1, 4.4, "LCC conference coffee credenza");
    site.addBoxCollider(-156.5, 197.5, 2.4, 1.2, "LCC conference lounge table");
    site.addBoxCollider(-160.5, 197.5, 1.5, 1.4, "LCC conference lounge chair");
    site.addBoxCollider(-152.5, 197.5, 1.5, 1.4, "LCC conference lounge chair");
    site.addBoxCollider(cx - 14, south + 20, 16, 24, "LCC planter");
    site.addBoxCollider(cx + 14, south + 20, 16, 24, "LCC planter");
    site.addCircleCollider(cx - 5.4, south + 7.6, 0.6, "LCC canopy column");
    site.addCircleCollider(cx + 5.4, south + 7.6, 0.6, "LCC canopy column");
    site.addCircleCollider(cx - 22, south + 10, 0.8, "LCC flagpole");
    site.addCircleCollider(cx + 22, south + 10, 0.8, "LCC flagpole");
    site.addBoxCollider(cx - hx - 1.8, cz - 4, 3.6, 13, "LCC loading dock");
  });
})(window);
