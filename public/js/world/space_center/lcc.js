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

    // 1. Mission Control Center (west wing) — two ground-crew stations
    //    (Flight Director + Ground Systems) facing the main display wall.
    const mcX = cx - 23; // room centreline
    const screenZ = 158.6;

    // Main display wall: hero status screen flanked by telemetry monitors.
    site.canvasPlane(
      g, 16.5, 5.6, mcX, 13.2, screenZ, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#03141f";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 5;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "900 40px Arial, Helvetica, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("MISSION CONTROL · KSC", 28, 52);
        ctx.font = "700 22px Arial, Helvetica, sans-serif";
        ctx.fillStyle = "#4ade80";
        ctx.fillText("FLIGHT STATUS: GO FOR LAUNCH", 28, 88);
        // Telemetry plot lines.
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 60; i++) {
          const x = 30 + i * 13;
          const y = 230 + Math.sin(i * 0.55) * 34 + Math.sin(i * 0.17) * 18;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#facc15";
        ctx.beginPath();
        for (let i = 0; i < 60; i++) {
          const x = 30 + i * 13;
          const y = 330 + Math.cos(i * 0.4) * 22;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 18px Arial, Helvetica, sans-serif";
        ctx.fillText("T-00:04:12 · VEHICLE POWER NOMINAL · RANGE GREEN", 28, h - 26);
      },
      1024, 360,
      { unlit: true, name: "MCC_MainScreen" }
    );
    for (const sx of [mcX - 11.5, mcX + 11.5]) {
      site.box(g, 4.2, 2.6, 0.24, sx, 13.0, screenZ, m("screen"), "MCC_SideMonitor");
      site.box(g, 4.4, 0.18, 0.4, sx, 14.4, screenZ, trim, "MCC_SideMonitorHood");
      site.canvasPlane(
        g, 3.9, 2.35, sx, 13.0, screenZ + 0.14, 0, 0, 0,
        (ctx, w, h) => {
          ctx.fillStyle = "#04101a";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = "#0ea5e9";
          ctx.lineWidth = 3;
          ctx.strokeRect(3, 3, w - 6, h - 6);
          // Orbital ground track graticule.
          ctx.strokeStyle = "rgba(56,189,248,0.45)";
          ctx.lineWidth = 1;
          for (let i = 1; i < 6; i++) {
            ctx.beginPath();
            ctx.moveTo(0, (h / 6) * i);
            ctx.lineTo(w, (h / 6) * i);
            ctx.stroke();
          }
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i < 40; i++) {
            const x = (i / 39) * w;
            const y = h * 0.5 + Math.sin(i * 0.34) * h * 0.24;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.fillStyle = "#7dd3fc";
          ctx.font = "700 14px Arial, Helvetica, sans-serif";
          ctx.fillText("GROUND TRACK · 39B", 10, 22);
        },
        320, 180,
        { unlit: true, name: "MCC_TrackingDisplay" }
      );
    }
    site.label(g, "MISSION CONTROL CENTER", mcX, 17.2, screenZ + 0.3, { width: 14, height: 1.7, fontSize: 30 });

    // Two ground-crew consoles, facing the display wall.
    const stations = [
      { x: mcX - 5.3, title: "FLIGHT DIRECTOR", sub: "GO / NO-GO & MISSION AUTHORITY", color: "#fbbf24" },
      { x: mcX + 5.3, title: "GROUND SYSTEMS", sub: "COMMS · TRACKING · GROUND NETWORK", color: "#67e8f9" }
    ];
    for (const st of stations) {
      // Desk body, top and modesty panel.
      site.box(g, 8.6, 1.0, 2.0, st.x, floorTop + 0.5, cz - 4, steel, "MCC_ConsoleDesk");
      site.box(g, 8.9, 0.12, 2.3, st.x, floorTop + 1.06, cz - 4, trim, "MCC_ConsoleTop");
      site.box(g, 8.9, 0.5, 0.12, st.x, floorTop + 0.62, cz - 2.95, concreteDark, "MCC_ModestyPanel");
      // Monitors, keyboard and comms headset.
      for (const mx of [st.x - 2.7, st.x, st.x + 2.7]) {
        site.box(g, 1.7, 0.95, 0.1, mx, floorTop + 1.72, cz - 4.55, m("black"), "MCC_MonitorBezel");
        site.box(g, 1.56, 0.82, 0.02, mx, floorTop + 1.72, cz - 4.49, m("screen"), "MCC_MonitorScreen");
        site.box(g, 0.3, 0.3, 0.22, mx, floorTop + 1.2, cz - 4.4, trim, "MCC_MonitorStand");
        site.canvasPlane(
          g, 1.5, 0.78, mx, floorTop + 1.72, cz - 4.47, 0, 0, 0,
          (ctx, w, h) => {
            ctx.fillStyle = "#04121c";
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "#22d3ee";
            ctx.lineWidth = 2;
            ctx.strokeRect(3, 3, w - 6, h - 6);
            ctx.fillStyle = "#67e8f9";
            ctx.font = "700 13px monospace";
            ctx.fillText("ORBIT ........ NOMINAL", 10, 26);
            ctx.fillText("POWER ........ 100%", 10, 48);
            ctx.fillText("LINK ......... LOCK", 10, 70);
            ctx.strokeStyle = "#4ade80";
            ctx.beginPath();
            for (let i = 0; i < 20; i++) {
              const x = 10 + i * 12;
              const y = 100 + Math.sin(i * 0.6) * 10;
              i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.stroke();
          },
          256, 128,
          { unlit: true, name: "MCC_ConsoleGraphic" }
        );
      }
      site.box(g, 1.8, 0.06, 0.45, st.x, floorTop + 1.14, cz - 3.3, m("black"), "MCC_Keyboard");
      site.cyl(g, 0.16, 0.35, st.x + 3.3, floorTop + 1.22, cz - 3.3, m("black"), 8, "MCC_Headset");
      // Nameplate facing the operator chair.
      site.canvasPlane(
        g, 4.4, 0.55, st.x, floorTop + 0.72, cz - 2.86, 0, 0, 0,
        (ctx, w, h) => {
          ctx.fillStyle = "#0b1524";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = st.color;
          ctx.lineWidth = 3;
          ctx.strokeRect(2, 2, w - 4, h - 4);
          ctx.fillStyle = st.color;
          ctx.font = "900 30px Arial, Helvetica, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(st.title, w * 0.5, h * 0.38);
          ctx.fillStyle = "#94a3b8";
          ctx.font = "600 15px Arial, Helvetica, sans-serif";
          ctx.fillText(st.sub, w * 0.5, h * 0.74);
        },
        640, 80,
        { unlit: true, name: "MCC_StationPlate" }
      );
      // Status lamps and operator chair.
      for (const [li, lc] of [[0, "red"], [1, "yellow"], [2, "green"]]) {
        site.sphere(g, 0.14, st.x + 3.9, floorTop + 1.18, cz - 3.9 + li * 0.35, m(lc), 8, "MCC_StatusLamp");
      }
      site.cyl(g, 0.45, 0.5, st.x, floorTop + 0.25, cz - 0.9, trim, 10, "MCC_OperatorChair");
      site.box(g, 0.95, 1.15, 0.18, st.x, floorTop + 0.95, cz - 0.28, trim, "MCC_ChairBack");
    }

    // Wall status boards: GO/NO-GO on the west wall, comms on the east partition.
    site.canvasPlane(
      g, 6.2, 4.4, cx - hx + wallT + 0.06, 7.4, 168, 0, Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "900 34px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("GO / NO-GO", w * 0.5, 46);
        const tiles = ["CDR", "ENG", "SCI", "FD", "GND", "RANGE"];
        tiles.forEach((t, i) => {
          const tx = 40 + (i % 3) * 170;
          const ty = 100 + Math.floor(i / 3) * 140;
          ctx.fillStyle = i < 4 ? "#16a34a" : "#0ea5e9";
          ctx.fillRect(tx, ty, 140, 90);
          ctx.fillStyle = "#ffffff";
          ctx.font = "900 28px Arial, Helvetica, sans-serif";
          ctx.fillText(t, tx + 70, ty + 45);
          ctx.font = "700 20px Arial, Helvetica, sans-serif";
          ctx.fillText("GO", tx + 70, ty + 74);
        });
      },
      512, 360,
      { unlit: true, name: "MCC_GoNoGoBoard" }
    );
    site.canvasPlane(
      g, 5.6, 3.4, cx - 12 - wallT * 0.5 - 0.06, 7.6, 170, 0, -Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#071a13";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#34d399";
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#6ee7b7";
        ctx.font = "900 28px Arial, Helvetica, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("GROUND NETWORK", 20, 42);
        ctx.font = "700 18px Arial, Helvetica, sans-serif";
        ctx.fillStyle = "#d1fae5";
        const rows = [
          "SPAIN DISHES · MADRID ..... OK",
          "AUSTRALIA DISHES · LARGE .. OK",
          "RELAY SATELLITES .......... OK",
          "SIGNAL STRENGTH ....... STRONG",
          "DOWNLOAD SPEED .... 1.2 GB/day",
          "NEXT PASS ............ +02:14"
        ];
        rows.forEach((r, i) => ctx.fillText(r, 20, 92 + i * 38));
      },
      512, 320,
      { unlit: true, name: "MCC_GroundBoard" }
    );

    // Ceiling light strips over the console rows.
    for (const lx of [mcX - 6, mcX, mcX + 6]) {
      site.box(g, 1.4, 0.1, 9, lx, 21.5, cz - 4, m("lamp"), "MCC_CeilingLight");
    }

    // 2. Reception Lobby (south center)
    site.box(g, 8, 1.15, 2.2, cx, floorTop + 0.575, cz + 14.5, m("steel_white"), "ReceptionDesk");
    site.box(g, 8.2, 0.18, 2.4, cx, floorTop + 1.24, cz + 14.5, m("black"), "ReceptionTop");
    site.label(g, "WELCOME", cx, 16.5, south - 0.2, { width: 10, height: 2.2, color: "#0f2038", fontSize: 52 });
    for (const sx of [cx - 8, cx + 8]) {
      site.box(g, 3.2, 0.45, 1.4, sx, floorTop + 0.225, cz + 18, m("nasa_blue"), "LobbySofa");
      site.box(g, 3.2, 0.6, 0.3, sx, floorTop + 0.65, cz + 18.55, m("nasa_blue"), "SofaBack");
    }
    site.box(g, 1.4, 1.1, 1.2, cx - 8.5, floorTop + 0.55, cz + 10.5, m("rust"), "CoffeeCounter");

    // 3. Restrooms & 4. Electrical Control Room
    for (let i = 0; i < 3; i++) {
      site.box(g, 2.2, 2.4, 0.2, cx - 8.5 + i * 3.1, floorTop + 1.2, cz - 18, m("steel_white"), "RestroomStall");
      site.box(g, 0.65, 1.0, 0.5, cx - 9 + i * 3.1, floorTop + 0.5, cz - 20.5, m("white"), "SinkUnit");
    }
    site.label(g, "RESTROOM", cx - 4.5, 19.5, cz + 8.35, { width: 7, height: 1.5, fontSize: 38 });
    for (let i = 0; i < 4; i++) {
      site.box(g, 1.5, 2.6, 1.1, cx + 2.8 + i * 2.1, floorTop + 1.3, cz - 18, steel, "ElectricalRack");
    }
    site.label(g, "ELECTRICAL", cx + 4.5, 19.5, cz + 8.35, { width: 7, height: 1.5, fontSize: 38 });

    // 5. Conference Room (east wing)
    site.box(g, 6.2, 0.9, 13, cx + 23.5, floorTop + 0.45, cz - 2, m("rust"), "ConferenceTable");
    for (let z = cz - 7; z <= cz + 4; z += 2.6) {
      site.cyl(g, 0.4, 0.5, cx + 19.5, floorTop + 0.25, z, trim, 8, "ConfChairW");
      site.cyl(g, 0.4, 0.5, cx + 27.5, floorTop + 0.25, z, trim, 8, "ConfChairE");
    }
    site.box(g, 0.28, 3.8, 10, cx + 33.8, floorTop + 4.2, cz - 2, m("screen"), "BriefingScreen");

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

    // ── LCC Secure Sliding Entrance Doors (starts CLOSED, press [E] to open/enter) ──
    const THREE = window.THREE;
    const doorSystemGroup = new THREE.Group();
    doorSystemGroup.name = "LCC_EntranceDoorSystem";
    g.add(doorSystemGroup);

    // Frame side jambs, threshold, track and transom window above doors
    site.box(g, 1.8, 4.4, wallT * 1.1, cx - 4.1, 2.2, south - halfWall, white, "LCCDoorJambW");
    site.box(g, 1.8, 4.4, wallT * 1.1, cx + 4.1, 2.2, south - halfWall, white, "LCCDoorJambE");
    site.box(g, 10, 5.6, wallT, cx, 7.2, south - halfWall, white, "LCCTransomWall");
    site.box(g, 6.4, 4.6, 0.22, cx, 7.2, south + 0.12, m("glass"), "LCCTransomGlass");
    site.box(g, 6.6, 0.2, 0.35, cx, 4.45, south + 0.14, trim, "LCCTransomMullion");
    site.box(g, 7.2, 0.3, 0.5, cx, 4.25, south + 0.18, trim, "LCCDoorSlideTrack");
    site.box(g, 7.0, 0.08, 0.9, cx, 0.16, south + 0.05, steel, "LCCDoorThreshold");

    // Illuminated status light material (starts Red = Locked/Closed, transitions to Green = Open)
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

    // Door solid collider (ACTIVE by default when doors are CLOSED)
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
        ctx.strokeStyle = "#d0a15c";
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#eceae3";
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

    // Mission Control Center consoles and all interior furniture are solid.
    site.addBoxCollider(cx - 28.3, cz - 4, 8.6, 2.0, "MCC flight director console");
    site.addBoxCollider(cx - 17.7, cz - 4, 8.6, 2.0, "MCC ground systems console");
    site.addBoxCollider(cx, cz + 14.5, 8, 2.2, "LCC reception desk");
    site.addBoxCollider(cx - 8, cz + 18, 3.2, 1.4, "LCC lobby sofa");
    site.addBoxCollider(cx + 8, cz + 18, 3.2, 1.4, "LCC lobby sofa");
    site.addBoxCollider(cx - 8.5, cz + 10.5, 1.4, 1.2, "LCC coffee counter");
    site.addBoxCollider(cx + 23.5, cz - 2, 6.2, 13, "LCC conference table");
    site.addBoxCollider(cx + 5.95, cz - 18, 8.4, 1.1, "LCC electrical racks");
    site.addBoxCollider(cx - 14, south + 20, 16, 24, "LCC planter");
    site.addBoxCollider(cx + 14, south + 20, 16, 24, "LCC planter");
    site.addCircleCollider(cx - 5.4, south + 7.6, 0.6, "LCC canopy column");
    site.addCircleCollider(cx + 5.4, south + 7.6, 0.6, "LCC canopy column");
    site.addCircleCollider(cx - 22, south + 10, 0.8, "LCC flagpole");
    site.addCircleCollider(cx + 22, south + 10, 0.8, "LCC flagpole");
    site.addBoxCollider(cx - hx - 1.8, cz - 4, 3.6, 13, "LCC loading dock");
  });
})(window);
