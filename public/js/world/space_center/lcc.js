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

    // 1. Firing Room (west wing)
    site.box(g, 18, 4.4, 0.35, cx - 23.2, floorTop + 8.2, cz - 22.0, m("screen"), "LaunchWallScreen");
    site.label(g, "FIRING ROOM", cx - 23, 18.8, cz - 21.6, { width: 12, height: 2.2, fontSize: 52 });
    for (let row = 0; row < 3; row++) {
      const rz = cz - 14 + row * 7;
      const tierH = floorTop + row * 0.35;
      if (row > 0) {
        site.box(g, 18.5, row * 0.35, 3.6, cx - 23, floorTop + row * 0.175, rz, concreteDark, "FiringRiser");
      }
      site.box(g, 17, 1.0, 1.5, cx - 23, tierH + 0.5, rz, steel, "ConsoleRow");
      for (let seat = -6; seat <= 6; seat += 4) {
        site.box(g, 1.2, 0.52, 0.08, cx - 23 + seat, tierH + 1.32, rz - 0.5, m("screen"), "ConsoleMonitor");
        site.cyl(g, 0.42, 0.5, cx - 23 + seat, tierH + 0.25, rz + 1.35, m("black"), 10, "OperatorChair");
      }
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

    // Glazed Vestibule Entrance Canopy & Sliding Doors
    site.box(g, 13.5, 0.55, 8.2, cx, 9.8, south + 4.1, steel, "LCCCanopy");
    site.box(g, 13.7, 0.22, 8.4, cx, 10.18, south + 4.1, m("nasa_blue"), "LCCCanopyFascia");
    site.cyl(g, 0.34, 9.6, cx - 5.4, 4.8, south + 7.6, concrete, 10, "CanopyColW");
    site.cyl(g, 0.34, 9.6, cx + 5.4, 4.8, south + 7.6, concrete, 10, "CanopyColE");
    site.box(g, 5.8, 3.8, 0.22, cx, 2.0, south + 0.14, m("glass"), "LCCEntryDoor");

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
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#f8fafc";
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
  });
})(window);
