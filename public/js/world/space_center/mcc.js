/**
 * Space Center 2 — Mission Control Center (MCC) building, exterior and interior.
 *
 * A dedicated ground-team facility east of the Launch Control Center: glazed
 * two-storey-scale control room with a hero status wall, two ground consoles
 * (Flight Director + Ground Systems), a comms analysis room, reception lobby,
 * entrance canopy, rooftop tracking dishes and landscaped approach.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("mcc", function buildMCC(site) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.name = "SC2_MCC";
    site.group.add(g);

    const m = (k) => site.mat(k);
    const white = m("lcc_wall");
    const concrete = m("concrete");
    const concreteDark = m("concrete_dark");
    const curb = m("concrete_curb");
    const steel = m("steel_grey");
    const trim = m("black");
    const glass = m("glass");
    const floorMat = m("tan");

    const cx = -60;
    const cz = 240;
    const hx = 29;
    const hz = 20;
    const height = 13;
    const wallT = 0.7;
    const halfWall = wallT * 0.5;
    const north = cz - hz;
    const south = cz + hz;
    const floorTop = 0.24;
    const doorHalf = 5;

    // -------------------------------------------------------------------------
    // 1. SITE WORK, APPROACH WALKWAY & PARKING
    // -------------------------------------------------------------------------
    site.box(g, 78, 0.16, 62, cx, 0.08, cz, concreteDark, "MCCPlinth");
    site.box(g, 72, 0.2, 56, cx, 0.1, cz, concrete, "MCCApron");
    // Approach walkway from the KSC avenue to the front doors.
    site.box(g, 14, 0.22, 26, cx, 0.11, south + 13, curb, "MCCWalkway");
    site.box(g, 0.5, 0.24, 26, cx - 7.2, 0.12, south + 13, m("nasa_blue"), "MCCWalkStripe");
    site.box(g, 0.5, 0.24, 26, cx + 7.2, 0.12, south + 13, m("nasa_blue"), "MCCWalkStripe");
    // Short-stay parking bays east of the walkway.
    for (let i = 0; i < 3; i++) {
      const px = cx + 22 + i * 6.5;
      site.box(g, 0.14, 0.02, 11, px, 0.21, south + 14, m("stripe_white"), "MCCParkingStripe");
    }
    site.vehicle(g, cx + 25, south + 13, Math.PI / 2, "silver", "sedan", 0.2);
    site.vehicle(g, cx + 31, south + 14.5, Math.PI / 2, "steel_white", "van", 0.2);

    // -------------------------------------------------------------------------
    // 2. BUILDING SHELL, GLAZED ENTRANCE & CANOPY
    // -------------------------------------------------------------------------
    // Interior floor & drop ceiling.
    site.box(g, hx * 2 - wallT * 2, floorTop, hz * 2 - wallT * 2, cx, floorTop * 0.5, cz, floorMat, "MCCFloor");
    site.box(g, hx * 2 - wallT * 2, 0.35, hz * 2 - wallT * 2, cx, 12.3, cz, concrete, "MCCCeiling");
    // Roof and parapet.
    site.box(g, hx * 2 + 1.4, 0.9, hz * 2 + 1.4, cx, height + 0.45, cz, concreteDark, "MCCRoof");
    site.box(g, hx * 2 + 1.7, 0.5, hz * 2 + 1.7, cx, height + 1.15, cz, trim, "MCCParapet");

    // North / west / east walls.
    site.box(g, hx * 2, height, wallT, cx, height * 0.5, north + halfWall, white, "MCCNorthWall");
    site.box(g, wallT, height, hz * 2, cx - hx + halfWall, height * 0.5, cz, white, "MCCWestWall");
    site.box(g, wallT, height, hz * 2, cx + hx - halfWall, height * 0.5, cz, white, "MCCEastWall");
    // South wall split around the 10 m glazed entrance.
    const southPanelW = hx - doorHalf; // 24 m each side
    site.box(g, southPanelW, height, wallT, cx - doorHalf - southPanelW * 0.5, height * 0.5, south - halfWall, white, "MCCSouthWallW");
    site.box(g, southPanelW, height, wallT, cx + doorHalf + southPanelW * 0.5, height * 0.5, south - halfWall, white, "MCCSouthWallE");
    site.box(g, doorHalf * 2, height - 9, wallT, cx, height - (height - 9) * 0.5, south - halfWall, white, "MCCSouthHeader");

    // South curtain wall glazing, mullions and sun hoods.
    for (const side of [-1, 1]) {
      for (const rowY of [3.6, 7.2, 10.4]) {
        site.box(g, 20, 2.2, 0.18, cx + side * 18.5, rowY, south + 0.08, glass, "MCCWindow");
        site.box(g, 21, 0.36, 1.15, cx + side * 18.5, rowY + 1.35, south + 0.55, curb, "MCCSunHood");
        for (let o = -8; o <= 8; o += 4) {
          site.box(g, 0.22, 2.28, 0.28, cx + side * 18.5 + o, rowY, south + 0.16, trim, "MCCMullion");
        }
      }
    }
    // Entrance glass doors.
    site.box(g, doorHalf * 2, 4.4, 0.16, cx, 2.4, south + 0.08, glass, "MCCEntryDoor");
    site.box(g, 0.24, 4.4, 0.2, cx, 2.4, south + 0.1, trim, "MCCDoorSplitter");

    // Canopy and its columns.
    site.box(g, 19, 0.55, 7, cx, 8.2, south + 3.4, steel, "MCCCanopy");
    site.box(g, 19.2, 0.22, 7.2, cx, 8.58, south + 3.4, m("nasa_blue"), "MCCCanopyFascia");
    for (const px of [cx - 7.5, cx + 7.5]) {
      site.cyl(g, 0.34, 8, px, 4, south + 6.3, concrete, 10, "MCCCanopyColumn");
    }

    // Header sign above the canopy.
    site.canvasPlane(
      g, 24, 2.4, cx, 10.9, south + 0.06, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#0b1524";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 5;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#f8fafc";
        ctx.font = "900 52px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("MISSION CONTROL CENTER", w * 0.5, h * 0.52);
      },
      1280, 128,
      { name: "MCC_HeaderSign" }
    );

    // -------------------------------------------------------------------------
    // 3. ROOFTOP TRACKING ARRAY & CHILLERS
    // -------------------------------------------------------------------------
    for (const [rx, rz, r] of [[cx - 16, cz - 6, 2.6], [cx + 12, cz - 9, 1.9]]) {
      site.cyl(g, r, 0.3, rx, height + 1.35, rz, steel, 16, "MCCDishBase");
      const dish = site.cone(g, r, 0.25, 1.5, rx, height + 2.25, rz, m("white"), 18, "MCCDish");
      dish.rotation.x = 0.5;
      site.cyl(g, 0.12, 3.2, rx, height + 2.9, rz, steel, 8, "MCCDishMast");
    }
    for (const rx of [cx - 22, cx + 21]) {
      site.box(g, 8, 2.2, 6, rx, height + 2.0, cz + 8, steel, "MCCRoofChiller");
      site.cyl(g, 1.5, 0.8, rx, height + 3.3, cz + 8, trim, 12, "MCCChillerFan");
    }
    site.cyl(g, 0.16, 6, cx + 24, height + 4, cz - 2, steel, 8, "MCCMast");

    // -------------------------------------------------------------------------
    // 4. LANDSCAPING & FLAGS
    // -------------------------------------------------------------------------
    for (const side of [-1, 1]) {
      const px = cx + side * 13;
      site.box(g, 12, 0.55, 14, px, 0.275, south + 20, curb, "MCCPlanterCurb");
      site.box(g, 11.2, 0.62, 13.2, px, 0.34, south + 20, m("grass"), "MCCPlanterSoil");
      site.box(g, 11.2, 1.0, 3, px, 1.15, south + 15, m("foliage"), "MCCHedge");
      site.palmTree(g, px - side * 2.6, south + 21, 1.05, side > 0 ? 4 : 9, 0.7);
      site.palmTree(g, px + side * 3, south + 19, 0.9, side > 0 ? 7 : 2, 0.7);
    }
    site.flagPole(g, cx - 20, south + 12, 19, "usa", 0.2);
    site.flagPole(g, cx + 20, south + 12, 19, "nasa", 0.2);

    // -------------------------------------------------------------------------
    // 5. LOBBY & RECEPTION
    // -------------------------------------------------------------------------
    site.box(g, 9, 1.15, 2.2, cx, floorTop + 0.575, cz + 12.5, m("steel_white"), "MCCReceptionDesk");
    site.box(g, 9.2, 0.16, 2.4, cx, floorTop + 1.24, cz + 12.5, trim, "MCCReceptionTop");
    site.box(g, 3.4, 1.6, 0.16, cx, floorTop + 2.4, cz + 9.6, glass, "MCCReceptionBackdrop");
    site.canvasPlane(
      g, 9, 2.2, cx, 8.2, cz + 8.9, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#0b1524";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "900 44px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("MCC · BAY 1", w * 0.5, h * 0.44);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "700 24px Arial, Helvetica, sans-serif";
        ctx.fillText("GROUND FLIGHT OPERATIONS", w * 0.5, h * 0.72);
      },
      640, 160,
      { unlit: true, name: "MCC_LobbySign" }
    );
    for (const side of [-1, 1]) {
      site.box(g, 3.4, 0.45, 1.4, cx + side * 10, floorTop + 0.225, cz + 16, m("nasa_blue"), "MCCLobbySofa");
      site.box(g, 3.4, 0.6, 0.3, cx + side * 10, floorTop + 0.65, cz + 16.55, m("nasa_blue"), "MCCLobbySofaBack");
      site.cyl(g, 0.5, 0.6, cx + side * 6.5, floorTop + 0.3, cz + 16, trim, 10, "MCCLobbyStool");
    }
    site.floorLabel(g, "MCC", cx, floorTop + 0.02, cz + 6, 12, "rgba(230,232,238,0.8)");

    // -------------------------------------------------------------------------
    // 6. MAIN CONTROL ROOM — TWO GROUND STATIONS
    // -------------------------------------------------------------------------
    // Interior divider with a central doorway.
    const divZ = cz + 3;
    site.box(g, hx - 5, 12.16, 0.5, cx - 14.5, floorTop + 6.08, divZ, white, "MCCDividerW");
    site.box(g, hx - 5, 12.16, 0.5, cx + 14.5, floorTop + 6.08, divZ, white, "MCCDividerE");
    site.box(g, 8, 1.4, 0.5, cx, 12.1, divZ, white, "MCCDividerHeader");

    // Hero status wall.
    site.canvasPlane(
      g, 20, 5.8, cx, 8.6, north + wallT + 0.06, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#03141f";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 5;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "900 38px Arial, Helvetica, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("MISSION CONTROL · KSC", 26, 50);
        ctx.font = "700 22px Arial, Helvetica, sans-serif";
        ctx.fillStyle = "#4ade80";
        ctx.fillText("FLIGHT STATUS: GO FOR LAUNCH", 26, 86);
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 64; i++) {
          const x = 28 + i * 14;
          const y = 210 + Math.sin(i * 0.55) * 30 + Math.sin(i * 0.17) * 16;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "#facc15";
        ctx.beginPath();
        for (let i = 0; i < 64; i++) {
          const x = 28 + i * 14;
          const y = 305 + Math.cos(i * 0.4) * 20;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 18px Arial, Helvetica, sans-serif";
        ctx.fillText("T-00:04:12 · VEHICLE POWER NOMINAL · RANGE GREEN", 26, h - 24);
      },
      1024, 340,
      { unlit: true, name: "MCC_MainScreen" }
    );
    site.label(g, "MISSION CONTROL CENTER", cx, 12.0, north + 1.2, { width: 14, height: 1.6, fontSize: 28 });

    // Two ground consoles facing the status wall.
    const stations = [
      { x: cx - 8, title: "FLIGHT DIRECTOR", sub: "GO / NO-GO & MISSION AUTHORITY", color: "#fbbf24" },
      { x: cx + 8, title: "GROUND SYSTEMS", sub: "COMMS · TRACKING · GROUND NETWORK", color: "#67e8f9" }
    ];
    for (const st of stations) {
      const deskZ = cz - 4;
      site.box(g, 8.6, 1.0, 2.0, st.x, floorTop + 0.5, deskZ, steel, "MCC_ConsoleDesk");
      site.box(g, 8.9, 0.12, 2.3, st.x, floorTop + 1.06, deskZ, trim, "MCC_ConsoleTop");
      site.box(g, 8.9, 0.5, 0.12, st.x, floorTop + 0.62, deskZ + 1.05, concreteDark, "MCC_ModestyPanel");
      for (const mx of [st.x - 2.7, st.x, st.x + 2.7]) {
        site.box(g, 1.7, 0.95, 0.1, mx, floorTop + 1.72, deskZ - 0.55, m("black"), "MCC_MonitorBezel");
        site.box(g, 1.56, 0.82, 0.02, mx, floorTop + 1.72, deskZ - 0.49, m("screen"), "MCC_MonitorScreen");
        site.box(g, 0.3, 0.3, 0.22, mx, floorTop + 1.2, deskZ - 0.4, trim, "MCC_MonitorStand");
        site.canvasPlane(
          g, 1.5, 0.78, mx, floorTop + 1.72, deskZ - 0.47, 0, 0, 0,
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
      site.box(g, 1.8, 0.06, 0.45, st.x, floorTop + 1.14, deskZ + 0.35, m("black"), "MCC_Keyboard");
      site.cyl(g, 0.16, 0.35, st.x + 3.3, floorTop + 1.22, deskZ + 0.35, m("black"), 8, "MCC_Headset");
      site.canvasPlane(
        g, 4.4, 0.55, st.x, floorTop + 0.72, deskZ + 1.12, 0, 0, 0,
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
      for (const [li, lc] of [[0, "red"], [1, "yellow"], [2, "green"]]) {
        site.sphere(g, 0.14, st.x + 3.9, floorTop + 1.18, deskZ + 0.15 + li * 0.35, m(lc), 8, "MCC_StatusLamp");
      }
      site.cyl(g, 0.45, 0.5, st.x, floorTop + 0.25, deskZ + 3.0, trim, 10, "MCC_OperatorChair");
      site.box(g, 0.95, 1.15, 0.18, st.x, floorTop + 0.95, deskZ + 3.62, trim, "MCC_ChairBack");
    }

    // GO/NO-GO board on the west wall.
    site.canvasPlane(
      g, 6.2, 4.4, cx - hx + wallT + 0.06, 7.4, cz - 8, 0, Math.PI / 2, 0,
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

    // Ceiling light strips and warm interior fill so the room reads at night.
    for (const lx of [cx - 12, cx, cx + 12]) {
      site.box(g, 1.4, 0.1, 12, lx, 12.1, cz - 4, m("lamp"), "MCC_CeilingLight");
    }
    for (const [lx, lz] of [[cx - 10, cz - 6], [cx + 10, cz - 6], [cx, cz + 10]]) {
      const fill = new THREE.PointLight(0xfff1d6, 0.9, 34, 1.6);
      fill.position.set(lx, 10.5, lz);
      g.add(fill);
    }

    // -------------------------------------------------------------------------
    // 7. COMMS ANALYSIS ROOM (north-east corner)
    // -------------------------------------------------------------------------
    site.box(g, 0.5, 12.16, 12, cx + 16, floorTop + 6.08, cz - 13, glass, "MCCCommsGlassW");
    site.box(g, 0.5, 0.5, 12, cx + 16, 9.1, cz - 13, trim, "MCCCommsMullion");
    site.box(g, 12, 12.16, 0.5, cx + 22, floorTop + 6.08, cz - 19, glass, "MCCCommsGlassN");
    site.box(g, 0.5, 12.16, 0.5, cx + 16, floorTop + 6.08, cz - 19, trim, "MCCCommsPost");
    site.label(g, "COMMS & TRACKING", cx + 22, 11.2, cz - 18.2, { width: 9, height: 1.5, fontSize: 34 });
    for (let i = 0; i < 3; i++) {
      site.box(g, 1.6, 2.2, 0.9, cx + 18.5 + i * 2.4, floorTop + 1.1, cz - 18, m("black"), "MCCServerRack");
      for (let k = 0; k < 4; k++) {
        site.box(g, 0.5, 0.08, 0.02, cx + 18.5 + i * 2.4, floorTop + 0.5 + k * 0.36, cz - 18 + 0.46, m("lamp"), "MCCRackLED");
      }
    }
    site.box(g, 8, 0.9, 3, cx + 21, floorTop + 0.45, cz - 12, steel, "MCCAnalysisDesk");

    // -------------------------------------------------------------------------
    // 8. ARRIVAL PLAZA — WAYFINDING, MISSION CLOCK, PATH LIGHTING & DROP-OFF
    // -------------------------------------------------------------------------
    // Dashed pedestrian crosswalk over the KSC avenue south of the walkway.
    for (let i = 0; i < 6; i++) {
      site.box(g, 3.6, 0.02, 0.8, cx, 0.14, 290.5 + i * 2.1, m("stripe_white"), "MCCCrosswalkStripe");
    }
    // NASA meatball inlaid into the walkway.
    site.canvasPlane(
      g, 5.6, 5.6, cx, 0.235, south + 16, -Math.PI / 2, 0, 0,
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#0b3d91";
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, w * 0.46, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.5, w * 0.32, h * 0.25, -0.32, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#d1252b";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(w * 0.3, h * 0.7);
        ctx.quadraticCurveTo(w * 0.44, h * 0.24, w * 0.52, h * 0.76);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 92px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("NASA", w * 0.5, h * 0.54);
      },
      512,
      512,
      { unlit: true, transparent: true, name: "MCC_MeatballInlay" }
    );

    // Directional directory kiosk on the west side of the approach.
    site.signBoard(
      g,
      cx - 10.5,
      0.95,
      269.5,
      Math.PI / 2,
      6.4,
      2.5,
      (ctx, w, h) => {
        ctx.fillStyle = "#0b1524";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 5;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "900 34px Arial, Helvetica, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("MCC · GROUND OPS", 18, 42);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "700 24px Arial, Helvetica, sans-serif";
        ctx.fillText("→  BAY 1 CONTROL ROOM", 18, 92);
        ctx.fillText("→  COMMS & TRACKING", 18, 128);
        ctx.fillText("→  BRIEFING / LOBBY", 18, 164);
        ctx.fillStyle = "#facc15";
        ctx.font = "700 20px Arial, Helvetica, sans-serif";
        ctx.fillText("● YOU ARE HERE", 18, 210);
      },
      "MCC_DirectoryKiosk"
    );

    // Mission clock on the east side of the approach.
    site.cyl(g, 0.3, 4.6, cx + 10.5, 2.3, 268, steel, 8, "MCCClockLegW");
    site.cyl(g, 0.3, 4.6, cx + 12.6, 2.3, 268, steel, 8, "MCCClockLegE");
    site.box(g, 5.2, 2.9, 0.5, cx + 11.55, 4.9, 268, m("black"), "MCCClockHousing");
    site.canvasPlane(
      g, 4.8, 2.5, cx + 11.55, 4.9, 268.28, 0, 0, 0,
      (ctx, w, h) => {
        ctx.fillStyle = "#06121c";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#facc15";
        ctx.font = "900 66px monospace";
        ctx.textAlign = "center";
        ctx.fillText("T-00:04:12", w * 0.5, h * 0.42);
        ctx.fillStyle = "#7dd3fc";
        ctx.font = "700 24px Arial, Helvetica, sans-serif";
        ctx.fillText("LC-39B · FLIGHT COUNTDOWN", w * 0.5, h * 0.66);
        ctx.fillStyle = "#4ade80";
        ctx.font = "700 20px Arial, Helvetica, sans-serif";
        ctx.fillText("HOLD · GO FOR LAUNCH", w * 0.5, h * 0.85);
      },
      512,
      256,
      { unlit: true, name: "MCC_MissionClockFace" }
    );

    // Path bollard lights flanking the walkway.
    for (const zz of [263, 268]) {
      for (const xx of [cx - 7.9, cx + 7.9]) {
        site.cyl(g, 0.14, 0.95, xx, 0.72, zz, steel, 8, "MCCPathLightPost");
        site.sphere(g, 0.2, xx, 1.24, zz, m("lamp"), 8, "MCCPathLightGlobe");
      }
    }
    // Entrance bollards.
    for (const bx of [cx - 5.5, cx - 1.9, cx + 1.9, cx + 5.5]) {
      site.cyl(g, 0.19, 1.0, bx, 0.72, 262.2, m("yellow"), 8, "MCCEntranceBollard");
    }
    // Trash bin, fire hydrant and benches.
    site.cyl(g, 0.4, 1.0, cx - 8.6, 0.72, 266, m("black"), 10, "MCCTrashBin");
    site.cyl(g, 0.22, 0.9, cx + 8.6, 0.66, 266, m("red"), 8, "MCCHydrant");
    site.box(g, 2.2, 0.12, 0.7, cx - 6.3, 0.75, 283, m("tan"), "MCCBenchSeat");
    site.box(g, 2.2, 0.6, 0.12, cx - 6.6, 1.05, 283.3, m("tan"), "MCCBenchBack");
    for (const lx of [cx - 7.2, cx - 5.4]) {
      site.cyl(g, 0.08, 0.55, lx, 0.48, 283, steel, 6, "MCCBenchLeg");
    }

    // Crew drop-off lane with cones and a waiting van (west apron).
    site.box(g, 18, 0.16, 8, cx - 13, 0.2, 264, concreteDark, "MCCDropOffPad");
    for (const coneX of [cx - 20, cx - 17.4, cx - 14.8]) {
      site.cone(g, 0.05, 0.28, 0.7, coneX, 0.57, 260.8, m("orange"), 8, "MCCTrafficCone");
    }
    site.vehicle(g, cx - 13, 263, Math.PI / 2, "steel_white", "van", 0.28);

    // Wayfinding sign toward the parking bays.
    site.signBoard(
      g,
      cx + 18,
      0.9,
      268,
      Math.PI / 2,
      4.2,
      1.6,
      (ctx, w, h) => {
        ctx.fillStyle = "#0b3d91";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 40px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("PARKING →", w * 0.5, h * 0.58);
      },
      "MCCParkingSign"
    );

    // -------------------------------------------------------------------------
    // 9. COLLISION
    // -------------------------------------------------------------------------
    site.addBoxCollider(cx, north + halfWall, hx * 2, wallT, "MCC north wall");
    site.addBoxCollider(cx - hx + halfWall, cz, wallT, hz * 2, "MCC west wall");
    site.addBoxCollider(cx + hx - halfWall, cz, wallT, hz * 2, "MCC east wall");
    site.addBoxCollider(cx - doorHalf - southPanelW * 0.5, south - halfWall, southPanelW, wallT, "MCC south wall");
    site.addBoxCollider(cx + doorHalf + southPanelW * 0.5, south - halfWall, southPanelW, wallT, "MCC south wall");
    site.addBoxCollider(cx - 14.5, divZ, hx - 5, 0.5, "MCC lobby divider");
    site.addBoxCollider(cx + 14.5, divZ, hx - 5, 0.5, "MCC lobby divider");
    site.addBoxCollider(cx - 8, cz - 4, 8.6, 2.0, "MCC flight director console");
    site.addBoxCollider(cx + 8, cz - 4, 8.6, 2.0, "MCC ground systems console");
    site.addBoxCollider(cx, cz + 12.5, 9, 2.2, "MCC reception desk");
    site.addBoxCollider(cx - 10, cz + 16, 3.4, 1.4, "MCC lobby sofa");
    site.addBoxCollider(cx + 10, cz + 16, 3.4, 1.4, "MCC lobby sofa");
    site.addBoxCollider(cx + 16, cz - 13, 0.5, 12, "MCC comms glass wall");
    site.addBoxCollider(cx + 22, cz - 19, 12, 0.5, "MCC comms glass wall");
    site.addBoxCollider(cx + 21, cz - 12, 8, 3, "MCC analysis desk");
    for (const rx of [cx - 22, cx + 21]) {
      site.addBoxCollider(rx, cz + 8, 8, 6, "MCC roof chiller");
    }
    site.addBoxCollider(cx - 13, south + 20, 12, 14, "MCC planter");
    site.addBoxCollider(cx + 13, south + 20, 12, 14, "MCC planter");
    for (const px of [cx - 7.5, cx + 7.5]) {
      site.addCircleCollider(px, south + 6.3, 0.7, "MCC canopy column");
    }
    site.addCircleCollider(cx - 20, south + 12, 0.8, "MCC flagpole");
    site.addCircleCollider(cx + 20, south + 12, 0.8, "MCC flagpole");
    site.addCircleCollider(cx - 6.5, cz + 16, 0.6, "MCC lobby stool");
    site.addCircleCollider(cx + 6.5, cz + 16, 0.6, "MCC lobby stool");
    // Arrival plaza props.
    site.addBoxCollider(cx - 10.5, 269.5, 6.5, 0.8, "MCC directory kiosk");
    site.addBoxCollider(cx + 11.5, 268, 2.6, 1.0, "MCC mission clock");
    site.addBoxCollider(cx - 6.3, 283, 2.4, 1.0, "MCC bench");
    site.addBoxCollider(cx - 13, 263, 6.2, 3.0, "MCC drop-off van");
    site.addCircleCollider(cx - 8.6, 266, 0.5, "MCC trash bin");
    site.addCircleCollider(cx + 8.6, 266, 0.4, "MCC hydrant");
    site.addBoxCollider(cx + 18, 268, 0.8, 4.4, "MCC parking sign");
  });
})(window);
