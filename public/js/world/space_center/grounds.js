/**
 * Space Center 2 — Grounds detail pass.
 *
 * Fills the open acres between the launch pad, VAB, LCC and beach with the
 * things a working space center has on the ground: support buildings and
 * loading docks, a staff/service vehicle fleet, mown lawns and worn dirt
 * service tracks, gravel equipment yards, and live-oak/palm groves.
 *
 * Everything here is deliberately low-poly and shares the materials and
 * instancing helpers used by the other site modules, so the extra detail
 * costs only a handful of draw calls.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("grounds", function buildGrounds(site) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.name = "SC2_Grounds";
    site.group.add(g);

    const m = (k) => site.mat(k);
    const asphalt = m("asphalt");
    const concrete = m("concrete");
    const concreteDark = m("concrete_dark");
    const curb = m("concrete_curb");
    const dirt = m("dirt");
    const dirtDark = m("dirt_dark");
    const gravelLight = m("gravel_light");
    const grass = m("grass");
    const lawn = m("grass_lawn");
    const foliage = m("foliage");
    const trunk = m("trunk");
    const steel = m("steel_grey");
    const white = m("steel_white");
    const glass = m("glass");
    const yellow = m("yellow");
    const red = m("red");
    const black = m("black");
    const stripeWhite = m("stripe_white");
    const tan = m("tan");

    const oakLow = new THREE.MeshStandardMaterial({ color: 0x33552a, roughness: 0.95, metalness: 0.0 });
    const oakHigh = new THREE.MeshStandardMaterial({ color: 0x466c34, roughness: 0.94, metalness: 0.0 });
    const flowerGold = new THREE.MeshStandardMaterial({ color: 0xc9b24a, roughness: 0.82, metalness: 0.0 });
    const flowerWhite = new THREE.MeshStandardMaterial({ color: 0xcfc799, roughness: 0.84, metalness: 0.0 });
    const bloomPink = new THREE.MeshStandardMaterial({ color: 0xb96f87, roughness: 0.86, metalness: 0.0 });
    oakLow.name = "grounds_oak_low";
    oakHigh.name = "grounds_oak_high";
    flowerGold.name = "grounds_flower_gold";
    flowerWhite.name = "grounds_flower_white";
    bloomPink.name = "grounds_bloom_pink";

    const rnd = (n) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    // -----------------------------------------------------------------------
    // Ground-plane helpers
    // -----------------------------------------------------------------------
    const reserved = [];
    function reserve(cx, cz, w, d) {
      reserved.push({
        minX: cx - w * 0.5 - 2,
        maxX: cx + w * 0.5 + 2,
        minZ: cz - d * 0.5 - 2,
        maxZ: cz + d * 0.5 + 2
      });
    }
    function insideReserved(x, z) {
      for (let i = 0; i < reserved.length; i++) {
        const r = reserved[i];
        if (x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ) return true;
      }
      return false;
    }

    let patchIndex = 0;
    function patch(mat, x, z, w, d, yaw = 0) {
      // Stagger the tops by a few millimetres so overlapping decals never
      // z-fight against one another or the flat terrain. Big patches are
      // split into ~24m tiles so the shared canvas texture keeps a usable
      // world-space scale instead of stretching across the whole lawn.
      const lift = mat === dirt || mat === dirtDark ? 0.012 : mat === grass ? 0.004 : 0;
      const base = 0.018 + lift + (patchIndex++ % 4) * 0.0015;
      const nx = Math.max(1, Math.ceil(w / 24));
      const nz = Math.max(1, Math.ceil(d / 24));
      const tw = w / nx;
      const td = d / nz;
      const ax = Math.cos(yaw);
      const az = -Math.sin(yaw);
      const bx = Math.sin(yaw);
      const bz = Math.cos(yaw);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const ox = -w * 0.5 + tw * (i + 0.5);
          const oz = -d * 0.5 + td * (j + 0.5);
          site.boxRot(
            g,
            tw,
            0.032,
            td,
            x + ax * ox + bx * oz,
            base + 0.016,
            z + az * ox + bz * oz,
            0,
            yaw,
            0,
            mat,
            "GroundsPatch"
          );
        }
      }
    }
    function track(x, z, w, d, mat = dirt, yaw = 0) {
      const n = Math.max(1, Math.ceil(d / 24));
      const seg = d / n;
      const dirX = Math.sin(yaw);
      const dirZ = Math.cos(yaw);
      for (let i = 0; i < n; i++) {
        const off = -d * 0.5 + seg * (i + 0.5);
        site.boxRot(g, w, 0.05, seg, x + dirX * off, 0.028, z + dirZ * off, 0, yaw, 0, mat, "GroundsTrack");
      }
    }
    function paved(x, z, w, d, mat = asphalt) {
      const alongX = w >= d;
      const length = alongX ? w : d;
      const n = Math.max(1, Math.ceil(length / 24));
      const seg = length / n;
      for (let i = 0; i < n; i++) {
        const off = -length * 0.5 + seg * (i + 0.5);
        if (alongX) site.box(g, seg, 0.12, d, x + off, 0.06, z, mat, "GroundsPaved");
        else site.box(g, w, 0.12, seg, x, 0.06, z + off, mat, "GroundsPaved");
      }
    }
    function ruts(x, z, length, yaw = 0, spacing = 1.5) {
      const dx = Math.cos(yaw) * spacing * 0.5;
      const dz = -Math.sin(yaw) * spacing * 0.5;
      const dirX = Math.sin(yaw);
      const dirZ = Math.cos(yaw);
      const n = Math.max(1, Math.ceil(length / 24));
      const seg = length / n;
      for (let i = 0; i < n; i++) {
        const off = -length * 0.5 + seg * (i + 0.5);
        const px = x + dirX * off;
        const pz = z + dirZ * off;
        site.boxRot(g, 0.42, 0.018, seg, px + dx, 0.057, pz + dz, 0, yaw, 0, dirtDark, "GroundsRut");
        site.boxRot(g, 0.42, 0.018, seg, px - dx, 0.057, pz - dz, 0, yaw, 0, dirtDark, "GroundsRut");
      }
    }
    function sidewalk(x, z, w, d) {
      site.box(g, w, 0.06, d, x, 0.038, z, curb, "GroundsSidewalk");
    }
    function parkingLot(cx, cz, w, d, baseY = 0, opts = {}) {
      const top = baseY + 0.12;
      site.box(g, w, 0.12, d, cx, baseY + 0.06, cz, asphalt, "GroundsParkingLot");
      const stallDepth = Math.min(5.2, d * 0.3);
      const count = Math.max(2, opts.count || Math.floor(w / 3.2));
      const step = w / count;
      for (let i = 0; i <= count; i++) {
        const sx = cx - w * 0.5 + i * step;
        site.box(g, 0.14, 0.012, stallDepth, sx, top + 0.006, cz - d * 0.5 + stallDepth * 0.5, stripeWhite, "GroundsStallLine");
        site.box(g, 0.14, 0.012, stallDepth, sx, top + 0.006, cz + d * 0.5 - stallDepth * 0.5, stripeWhite, "GroundsStallLine");
      }
      for (let i = 0; i < count; i++) {
        const sx = cx - w * 0.5 + step * (i + 0.5);
        site.box(g, 1.9, 0.16, 0.24, sx, top + 0.08, cz - d * 0.5 + 0.5, curb, "GroundsWheelStop");
        site.box(g, 1.9, 0.16, 0.24, sx, top + 0.08, cz + d * 0.5 - 0.5, curb, "GroundsWheelStop");
      }
      return {
        top,
        step,
        count,
        northZ: cz - d * 0.5 + stallDepth * 0.5,
        southZ: cz + d * 0.5 - stallDepth * 0.5
      };
    }
    function parkedCars(lot, xStart, colors, variants, baseY) {
      // One or two rows depending on how many colours are supplied.
      const rowCount = Math.min(2, Math.ceil(colors.length / lot.count));
      for (let i = 0; i < colors.length; i++) {
        const row = rowCount === 2 && i >= lot.count ? 1 : 0;
        const index = row === 0 ? i : i - lot.count;
        if (index >= lot.count) continue;
        const x = xStart + lot.step * (index + 0.5);
        const z = row === 0 ? lot.northZ : lot.southZ;
        site.vehicle(g, x, z, row === 0 ? Math.PI : 0, colors[i], variants[i % variants.length], baseY);
      }
    }

    // -----------------------------------------------------------------------
    // Façade signs & generic support buildings
    // -----------------------------------------------------------------------
    function drawFacilitySign(title, subtitle, accent = "#e4ff7e", bg = "#0f172a") {
      return (ctx, w, h) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 8;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = "#efeee7";
        ctx.font = "900 46px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(title, w * 0.5, h * 0.4);
        ctx.fillStyle = accent;
        ctx.font = "700 25px Arial, Helvetica, sans-serif";
        ctx.fillText(subtitle, w * 0.5, h * 0.71);
      };
    }

    function facadeSign(parent, cfg, padH) {
      const side = cfg.side || "front";
      const w = cfg.w || 12;
      const h = cfg.h || 3;
      const y = cfg.y || padH + (cfg.buildingH || 8) * 0.76;
      const bd = cfg.buildingD || 20;
      let x = 0;
      let z = 0;
      let ry = 0;
      let plateW = w + 0.4;
      let plateD = 0.16;
      let px = 0;
      let pz = 0;
      if (side === "east" || side === "west") {
        x = cfg.xOffset || (side === "east" ? cfg.buildingW * 0.5 + 0.1 : -cfg.buildingW * 0.5 - 0.1);
        z = cfg.zOffset || 0;
        ry = side === "east" ? Math.PI / 2 : -Math.PI / 2;
        plateW = 0.16;
        plateD = w + 0.4;
        px = side === "east" ? 0.11 : -0.11;
      } else if (side === "back") {
        z = -bd * 0.5 - 0.1;
        ry = Math.PI;
        pz = -0.11;
      } else {
        z = cfg.zOffset || bd * 0.5 + 0.1;
        pz = 0.11;
      }
      site.box(parent, plateW, h + 0.4, plateD, x, y, z, black, "GroundsSignPlate");
      site.canvasPlane(
        parent,
        w,
        h,
        x + px,
        y,
        z + pz,
        0,
        ry,
        0,
        drawFacilitySign(cfg.title, cfg.subtitle, cfg.accent, cfg.bg),
        512,
        256,
        { name: "GroundsFacilitySign" }
      );
    }

    function makeBuilding(cfg) {
      const grp = new THREE.Group();
      grp.position.set(cfg.x, cfg.baseY || 0.02, cfg.z);
      grp.rotation.y = cfg.yaw || 0;
      g.add(grp);

      const w = cfg.w;
      const d = cfg.d;
      const h = cfg.h;
      const padH = 0.24;
      const wall = cfg.wall || white;
      const roof = cfg.roof || concreteDark;

      site.box(grp, w + 1.8, padH, d + 1.8, 0, padH * 0.5, 0, concreteDark, "GroundsBuildingSlab");
      site.box(grp, w, h, d, 0, padH + h * 0.5, 0, wall, "GroundsBuildingWall");
      site.box(grp, w + 0.9, 0.46, d + 0.9, 0, padH + h + 0.23, 0, roof, "GroundsBuildingRoof");
      site.box(grp, w + 1.0, 0.16, d + 1.0, 0, padH + h + 0.5, 0, black, "GroundsRoofCap");

      // Downspouts at the four corners.
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          site.box(grp, 0.14, h, 0.14, sx * (w * 0.5 + 0.02), padH + h * 0.5, sz * (d * 0.5 + 0.02), steel, "GroundsDownspout");
        }
      }

      if (cfg.windows !== false) {
        const winY = padH + h * 0.62;
        const count = Math.max(2, Math.floor(w / 7));
        const surge = w / count;
        for (let i = 0; i < count; i++) {
          site.box(
            grp,
            Math.min(2.8, surge * 0.5),
            Math.min(1.5, h * 0.22),
            0.16,
            -w * 0.5 + surge * (i + 0.5),
            winY,
            d * 0.5 + 0.07,
            glass,
            "GroundsWindow"
          );
        }
        if (cfg.sideWindows !== false) {
          for (const side of [-1, 1]) {
            for (let i = 0; i < 3; i++) {
              site.box(grp, 0.16, 1.2, 2.0, side * (w * 0.5 + 0.07), winY, -d * 0.22 + i * d * 0.22, glass, "GroundsWindow");
            }
          }
        }
      }

      if (cfg.door !== false) {
        const doorX = cfg.doorX || 0;
        site.box(grp, 2.4, 2.7, 0.18, doorX, padH + 1.35, d * 0.5 + 0.08, glass, "GroundsDoor");
        site.box(grp, 3.2, 0.18, 1.7, doorX, padH + 3.05, d * 0.5 + 0.8, roof, "GroundsDoorCanopy");
      }

      const units = cfg.roofUnits === undefined ? 2 : cfg.roofUnits;
      for (let i = 0; i < units; i++) {
        const ox = units === 1 ? 0 : -w * 0.22 + (i / Math.max(1, units - 1)) * w * 0.44;
        const oz = i % 2 === 0 ? -d * 0.18 : d * 0.18;
        site.box(grp, 4.2, 1.4, 3.0, ox, padH + h + 0.7, oz, steel, "GroundsRoofHVAC");
        site.cyl(grp, 1.15, 0.3, ox, padH + h + 1.5, oz, black, 10, "GroundsRoofFan");
      }

      if (cfg.sign) {
        facadeSign(grp, Object.assign({ buildingW: w, buildingD: d, buildingH: h }, cfg.sign), padH);
      }

      if (cfg.yaw) {
        site.addRotatedBoxCollider(cfg.x, cfg.z, w + 0.8, d + 0.8, cfg.yaw, cfg.name || "Support building");
      } else {
        site.addBoxCollider(cfg.x, cfg.z, w + 0.8, d + 0.8, cfg.name || "Support building");
      }
      reserve(cfg.x, cfg.z, w + 5, d + 5);
      return { group: grp, padH, w, d, h };
    }

    function loadingDock(parent, frontZ, width, bays) {
      site.box(parent, width, 1.0, 4.2, 0, 0.5, frontZ + 2.1, concrete, "LoadingDock");
      site.box(parent, width, 0.28, 4.5, 0, 1.04, frontZ + 2.1, concreteDark, "LoadingDockLip");
      for (let i = 0; i < bays; i++) {
        const bx = -width * 0.5 + (width / bays) * (i + 0.5);
        site.box(parent, 6.6, 6.2, 0.22, bx, 3.55, frontZ + 0.11, steel, "LoadingBayDoor");
        site.box(parent, 7.1, 0.32, 0.3, bx, 6.72, frontZ + 0.12, yellow, "LoadingBayTrim");
        for (let r = 1; r <= 4; r++) {
          site.box(parent, 6.4, 0.1, 0.26, bx, 0.9 + r * 1.15, frontZ + 0.14, concreteDark, "LoadingBayRib");
        }
        site.box(parent, 0.18, 1.0, 0.5, bx - 3.1, 0.72, frontZ + 4.0, black, "DockBumper");
        site.box(parent, 0.18, 1.0, 0.5, bx + 3.1, 0.72, frontZ + 4.0, black, "DockBumper");
      }
    }

    // -----------------------------------------------------------------------
    // 1. VAB SUPPORT: WAREHOUSE 39, LAUNCH EQUIPMENT TEST FACILITY, STAFF LOT
    // -----------------------------------------------------------------------
    const vabWarehouse = makeBuilding({
      x: -185,
      z: 550,
      w: 46,
      d: 30,
      h: 12,
      wall: tan,
      roof: white,
      windows: false,
      door: false,
      roofUnits: 3,
      name: "Warehouse 39",
      sign: {
        title: "WAREHOUSE 39",
        subtitle: "LOGISTICS · CARGO BAY",
        side: "east",
        w: 13,
        h: 3.4,
        y: 9.8
      }
    });
    // East-facing cargo doors and dock apron.
    for (let i = -1; i <= 1; i++) {
      const dz = i * 8.2;
      site.box(vabWarehouse.group, 0.24, 7.0, 6.6, 23.12, 3.74, dz, steel, "WarehouseCargoDoor");
      site.box(vabWarehouse.group, 0.34, 0.34, 7.1, 23.1, 7.36, dz, yellow, "WarehouseDoorTrim");
      for (let r = 1; r <= 3; r++) {
        site.box(vabWarehouse.group, 0.3, 0.1, 6.4, 23.16, 0.8 + r * 1.65, dz, concreteDark, "WarehouseDoorRib");
      }
    }
    site.box(vabWarehouse.group, 4.6, 1.0, 23.5, 25.5, 0.5, 0, concrete, "WarehouseDock");
    site.box(vabWarehouse.group, 4.9, 0.26, 23.9, 25.5, 1.04, 0, concreteDark, "WarehouseDockLip");
    site.box(g, 14, 0.08, 34, -153, 0.04, 551, gravelLight, "WarehouseTruckPad");
    site.vehicle(g, -153, 545, -Math.PI / 2, "steel_white", "van", 0.08);
    site.vehicle(g, -153, 558, -Math.PI / 2, "ops_blue", "truck", 0.08);

    // Staff lot south of the warehouse, linked to the VAB apron.
    const wl = parkingLot(-185, 512, 44, 14, 0, { count: 7 });
    const vabLotColors = ["silver", "ops_blue", "red", "black", "steel_white", "navy", "yellow", "silver", "ops_blue", "black"];
    parkedCars(wl, -185, vabLotColors, ["sedan", "truck", "sedan", "van"], 0.12);
    paved(-147, 512, 32, 10);
    reserve(-185, 512, 46, 16);
    // Gravel laydown strip west of the warehouse.
    site.box(g, 30, 0.08, 34, -229, 0.04, 550, gravelLight, "WarehouseGravelYard");
    site.boxRot(g, 15, 0.02, 12, -236, 0.09, 542, 0, 0.18, 0, dirt, "WarehouseYardDirt");
    site.boxRot(g, 12, 0.02, 9, -222, 0.09, 559, 0, -0.32, 0, dirt, "WarehouseYardDirt");
    reserve(-229, 550, 32, 36);
    for (let i = 0; i < 3; i++) {
      site.cyl(g, 0.6, 2.0, -238 + i * 1.5, 1.04, 544, i % 2 === 0 ? yellow : m("orange"), 8, "YardDrum");
    }

    const letf = makeBuilding({
      x: 150,
      z: 560,
      w: 38,
      d: 30,
      h: 13,
      wall: m("vab_panel"),
      roof: m("vab_rib"),
      windows: false,
      sideWindows: false,
      door: false,
      roofUnits: 2,
      name: "Launch Equipment Test Facility",
      sign: {
        title: "LAUNCH EQUIPMENT",
        subtitle: "TEST FACILITY · BAY 1",
        side: "west",
        w: 15,
        h: 2.4,
        y: 11.35
      }
    });
    // West-facing high-bay door, sized for the crawler apron transfer route.
    site.box(letf.group, 0.3, 9.4, 17.0, -19.12, 4.96, 0, steel, "LetfHighBayDoor");
    site.box(letf.group, 0.42, 0.4, 17.6, -19.1, 9.85, 0, yellow, "LetfDoorTrim");
    for (let r = 1; r <= 6; r++) {
      site.box(letf.group, 0.36, 0.12, 16.7, -19.17, 0.8 + r * 1.4, 0, concreteDark, "LetfDoorRib");
    }
    for (let i = -1; i <= 1; i++) {
      site.box(letf.group, 0.16, 1.4, 2.2, 19.07, 8.0, i * 9, glass, "LetfWindow");
    }

    // Gravel equipment yard with a horizontal test article on stands.
    site.box(g, 46, 0.08, 34, 198, 0.04, 560, gravelLight, "LetfGravelYard");
    site.boxRot(g, 14, 0.02, 10, 210, 0.09, 552, 0, 0.12, 0, dirt, "LetfYardDirt");
    site.boxRot(g, 10, 0.02, 8, 184, 0.09, 570, 0, -0.2, 0, dirtDark, "LetfYardDirt");
    reserve(198, 560, 48, 36);
    const standZ = [550, 570];
    for (const sz of standZ) {
      site.box(g, 4.2, 4.2, 1.6, 192, 2.14, sz, steel, "LetfTestStand");
      site.box(g, 5.2, 0.4, 2.2, 192, 0.2, sz, concreteDark, "LetfStandFooting");
      site.box(g, 1.8, 0.38, 2.2, 192, 4.3, sz, yellow, "LetfStandCap");
    }
    const testArticle = site.cyl(g, 1.35, 24, 192, 3.9, 560, white, 16, "LetfTestArticle");
    testArticle.rotation.x = Math.PI / 2;
    const testNozzle = site.cone(g, 0.5, 1.35, 2.4, 192, 3.9, 573.4, steel, 12, "LetfTestNozzle");
    testNozzle.rotation.x = Math.PI / 2;
    site.addBoxCollider(192, 560, 5.4, 36, "LETF test stand");
    site.vehicle(g, 209, 549, Math.PI * 0.5, "yellow", "truck", 0.08);
    site.vehicle(g, 211, 571, -Math.PI * 0.5, "steel_white", "van", 0.08);
    site.vehicle(g, 200, 574, Math.PI, "silver", "sedan", 0.08);
    track(127.5, 534, 7, 107, dirt, Math.PI / 2);
    ruts(127.5, 534, 107, Math.PI / 2, 1.8);

    // Staff parking on the existing VAB south apron.
    const vabA = ["silver", "black", "ops_blue", "steel_white", "red", "navy", "silver", "yellow"];
    const vabB = ["ops_blue", "silver", "black", "tan", "steel_white", "red"];
    for (let row = 0; row < 2; row++) {
      const z = row === 0 ? 506 : 530;
      const yaw = row === 0 ? 0 : Math.PI;
      for (let i = 0; i < 8; i++) {
        const x = -123 + i * 5.6;
        site.vehicle(g, x, z, yaw, vabA[(i + row * 2) % vabA.length], i % 4 === 1 ? "truck" : i % 6 === 4 ? "van" : "sedan", 0.06);
      }
      for (let i = 0; i < 6; i++) {
        const x = 28 + i * 6.0;
        site.vehicle(g, x, z, yaw, vabB[(i + row) % vabB.length], i % 3 === 2 ? "van" : "sedan", 0.06);
      }
    }
    for (let i = 0; i <= 8; i++) {
      const x = -125.8 + i * 5.6;
      site.box(g, 0.16, 0.012, 5.5, x, 0.066, 506, stripeWhite, "VabLotStripe");
      site.box(g, 0.16, 0.012, 5.5, x, 0.066, 530, stripeWhite, "VabLotStripe");
    }
    for (let i = 0; i <= 6; i++) {
      const x = 25.0 + i * 6.0;
      site.box(g, 0.16, 0.012, 5.5, x, 0.066, 506, stripeWhite, "VabLotStripe");
      site.box(g, 0.16, 0.012, 5.5, x, 0.066, 530, stripeWhite, "VabLotStripe");
    }

    // -----------------------------------------------------------------------
    // 2. LOGISTICS SUPPORT CAMPUS (south of the main avenue, west of LCC)
    // -----------------------------------------------------------------------
    const campusWh = makeBuilding({
      x: -395,
      z: 235,
      w: 64,
      d: 26,
      h: 14,
      wall: tan,
      roof: white,
      windows: false,
      door: false,
      roofUnits: 4,
      name: "Logistics Warehouse",
      sign: {
        title: "KSC LOGISTICS",
        subtitle: "WAREHOUSE 39 · CARGO BAY 3",
        side: "front",
        w: 18,
        h: 3.6,
        y: 11.4
      }
    });
    loadingDock(campusWh.group, 13, 48, 3);
    site.vehicle(g, -409, 255.5, Math.PI, "steel_white", "van", 0.1);
    site.vehicle(g, -395, 255.5, Math.PI, "ops_blue", "truck", 0.1);
    site.vehicle(g, -381, 255.5, Math.PI, "steel_white", "truck", 0.1);
    site.box(g, 76, 0.1, 14, -383, 0.05, 255, concreteDark, "CampusDockApron");
    reserve(-383, 255, 78, 16);

    const admin = makeBuilding({
      x: -305,
      z: 228,
      w: 34,
      d: 20,
      h: 10,
      wall: m("lcc_wall"),
      roof: concreteDark,
      roofUnits: 2,
      name: "Mission Support Building",
      sign: {
        title: "MISSION SUPPORT",
        subtitle: "BLDG 39-2 · OPERATIONS",
        side: "front",
        w: 12,
        h: 2.8,
        y: 8.5
      }
    });
    // Recessed entrance with a covered walk.
    site.box(admin.group, 7.0, 0.22, 3.2, 0, 3.35, 11.4, white, "AdminEntranceCanopy");
    for (const cx of [-3.0, 3.0]) {
      site.cyl(admin.group, 0.13, 3.2, cx, 1.84, 12.7, steel, 8, "AdminCanopyPost");
    }
    site.box(admin.group, 5.4, 0.18, 0.8, 0, 0.06, 12.5, concrete, "AdminEntryStep");
    sidewalk(-305, 247, 5, 14);
    site.flagPole(g, -305, 252, 18, "usa", 0.06);
    site.addCircleCollider(-305, 252, 0.8, "Mission Support flagpole", { maxY: 6 });

    // The campus spine, entrance drive and two staff lots.
    paved(-380, 264, 202, 8.4);
    paved(-345, 278.5, 10.4, 20.5);
    paved(-465, 254.9, 7.2, 9.8);
    site.box(g, 2.6, 0.1, 8.4, -277.8, 0.05, 264, asphalt, "CampusLotLink");
    const eastLot = parkingLot(-255, 267, 44, 30, 0, { count: 9 });
    const eastColors = ["silver", "black", "ops_blue", "red", "steel_white", "navy", "tan", "silver", "yellow", "ops_blue", "black"];
    parkedCars(eastLot, -255, eastColors, ["sedan", "van", "sedan", "truck"], 0.12);
    const westLot = parkingLot(-465, 235, 18, 30, 0, { count: 3 });
    parkedCars(westLot, -465, ["silver", "ops_blue", "black", "steel_white"], ["sedan", "truck"], 0.12);
    reserve(-465, 235, 20, 32);
    reserve(-255, 267, 46, 32);
    site.lightPole(g, -281, 254, 0, 10, true, 0.02);
    site.lightPole(g, -231, 280, Math.PI, 10, true, 0.12);
    sidewalk(-305, 259, 5, 10);
    // Entrance sign facing the avenue.
    site.signBoard(
      g,
      -331,
      1.2,
      284,
      0,
      8.0,
      1.8,
      (ctx, w, h) => {
        ctx.fillStyle = "#064e3b";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#e4ff7e";
        ctx.lineWidth = 7;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = "#efeee7";
        ctx.font = "900 38px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("LOGISTICS SUPPORT AREA", w * 0.5, h * 0.42);
        ctx.fillStyle = "#e4ff7e";
        ctx.font = "700 24px Arial, Helvetica, sans-serif";
        ctx.fillText("WAREHOUSE · MISSION SUPPORT · PARKING", w * 0.5, h * 0.73);
      },
      "CampusEntranceSign"
    );

    // Laydown yard with a portable site office, spoil mounds and materials.
    site.box(g, 36, 0.08, 24, -450, 0.04, 192, gravelLight, "LaydownYard");
    patch(dirt, -458, 188, 16, 12, 0.2);
    patch(dirtDark, -442, 198, 12, 8, -0.34);
    site.box(g, 8.0, 3.0, 3.2, -460, 1.64, 186, tan, "SiteOfficeTrailer");
    site.box(g, 8.4, 0.3, 3.6, -460, 3.3, 186, white, "SiteOfficeRoof");
    site.box(g, 2.0, 1.4, 0.14, -457, 2.2, 184.35, glass, "SiteOfficeWindow");
    site.box(g, 8.2, 0.18, 3.4, -460, 0.18, 186, concreteDark, "SiteOfficeSkid");
    site.addBoxCollider(-460, 186, 8.4, 3.6, "Site office trailer");
    reserve(-450, 192, 38, 26);
    for (const [mx, mz, mr, ms] of [[-441, 184, 5.2, 1.5], [-458, 201, 6.0, 1.1], [-434, 198, 4.2, 0.9]]) {
      const mound = site.cone(g, mr * 0.35, mr, 2.0 * ms, mx, 0.95 * ms, mz, dirt, 12, "SpoilMound");
      mound.rotation.y = mr;
    }
    for (let i = 0; i < 5; i++) {
      site.box(g, 2.2, 1.1, 2.2, -446 + (i % 3) * 2.5, 0.6 + Math.floor(i / 3) * 1.1, 178 + (i % 2) * 2.2, steel, "MaterialCrate");
    }
    for (let i = 0; i < 4; i++) {
      const pipe = site.cyl(g, 0.42, 9, -434, 0.64 + i * 0.85, 186, concreteDark, 8, "YardPipe");
      pipe.rotation.z = Math.PI / 2;
    }
    site.vehicle(g, -436, 204, Math.PI * 0.55, "yellow", "truck", 0.06);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      site.cyl(g, 0.08, 2.4, -450 + Math.cos(a) * 18, 1.24, 192 + Math.sin(a) * 12, steel, 6, "FencePost");
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const na = ((i + 1) / 6) * Math.PI * 2;
      site.beam(
        g,
        -450 + Math.cos(a) * 18,
        2.35,
        192 + Math.sin(a) * 12,
        -450 + Math.cos(na) * 18,
        2.35,
        192 + Math.sin(na) * 12,
        0.1,
        steel,
        "FenceRail"
      );
    }

    // Open timber picnic pavilion on the campus lawn.
    const picnicX = -440;
    const picnicZ = 282;
    site.box(g, 15, 0.12, 10, picnicX, 0.06, picnicZ, concreteDark, "PicnicSlab");
    for (const sx of [-6.4, 6.4]) {
      for (const sz of [-4.0, 4.0]) {
        site.cyl(g, 0.22, 3.1, picnicX + sx, 1.55, picnicZ + sz, trunk, 7, "PicnicPost");
      }
    }
    site.box(g, 15.6, 0.3, 11, picnicX, 3.25, picnicZ, trunk, "PicnicRoof");
    site.box(g, 15.9, 0.16, 11.3, picnicX, 3.48, picnicZ, m("rust"), "PicnicRoofCap");
    for (const tx of [-3.6, 3.6]) {
      site.box(g, 4.6, 0.18, 1.4, picnicX + tx, 1.0, picnicZ, white, "PicnicTableTop");
      for (const sz of [-0.9, 0.9]) {
        site.box(g, 4.6, 0.12, 0.5, picnicX + tx, 0.62, picnicZ + sz, trunk, "PicnicBench");
        for (const bx of [-1.7, 1.7]) {
          site.box(g, 0.14, 0.58, 0.14, picnicX + tx + bx, 0.29, picnicZ + sz, black, "PicnicBenchLeg");
        }
      }
      site.box(g, 0.16, 1.0, 0.16, picnicX + tx - 1.8, 0.5, picnicZ, black, "PicnicTableLeg");
      site.box(g, 0.16, 1.0, 0.16, picnicX + tx + 1.8, 0.5, picnicZ, black, "PicnicTableLeg");
    }
    site.label(g, "CREW PICNIC AREA", picnicX, 4.4, picnicZ, { width: 10, height: 1.8, fontSize: 38 });
    reserve(picnicX, picnicZ, 17, 12);

    // -----------------------------------------------------------------------
    // 3. FIRE RESCUE 39 (fronting the main avenue)
    // -----------------------------------------------------------------------
    const fire = makeBuilding({
      x: -70,
      z: 250,
      w: 34,
      d: 22,
      h: 10,
      wall: white,
      roof: concreteDark,
      windows: false,
      door: false,
      roofUnits: 2,
      name: "Fire Rescue 39",
      sign: {
        title: "FIRE RESCUE 39",
        subtitle: "KENNEDY SPACE CENTER",
        side: "front",
        w: 15,
        h: 2.4,
        y: 9.0,
        accent: "#f87171",
        bg: "#2a0e0e"
      }
    });
    for (let i = -1; i <= 1; i++) {
      site.box(fire.group, 8.0, 7.0, 0.24, i * 10.2, 4.0, 11.12, red, "FireApparatusDoor");
      site.box(fire.group, 8.6, 0.4, 0.34, i * 10.2, 7.66, 11.14, white, "FireDoorTrim");
      for (let r = 1; r <= 4; r++) {
        site.box(fire.group, 7.8, 0.12, 0.3, i * 10.2, 1.0 + r * 1.25, 11.16, m("crimson"), "FireDoorRib");
      }
    }
    // Hose-drying tower on the west flank.
    site.box(g, 6.4, 16, 6.4, -91, 8.02, 250, white, "FireHoseTower");
    site.box(g, 6.9, 0.6, 6.9, -91, 16.3, 250, concreteDark, "FireTowerCap");
    site.box(g, 4.4, 5.4, 0.24, -91, 10.4, 253.2, red, "FireTowerDoor");
    site.box(g, 4.4, 0.2, 0.3, -91, 13.2, 253.25, white, "FireTowerTrim");
    site.addBoxCollider(-91, 250, 6.8, 6.8, "Fire hose tower");
    reserve(-91, 250, 8, 8);
    // Apparatus apron and responding fleet.
    site.box(g, 58, 0.1, 23, -70, 0.05, 270.5, concreteDark, "FireApron");
    site.box(g, 14, 0.1, 7, -70, 0.05, 285.5, asphalt, "FireDriveway");
    site.vehicle(g, -79, 270, Math.PI, "red", "truck", 0.1);
    site.vehicle(g, -60, 270, Math.PI, "red", "truck", 0.1);
    site.vehicle(g, -96, 270, Math.PI, "steel_white", "van", 0.1);
    site.vehicle(g, -52, 270, Math.PI, "silver", "sedan", 0.1);
    site.vehicle(g, -43, 269, Math.PI, "ops_blue", "sedan", 0.1);
    site.vehicle(g, -96, 262, Math.PI, "tan", "truck", 0.1);
    site.addRotatedBoxCollider(-79, 270, 2.2, 5.4, Math.PI, "Fire engine", { maxY: 3.4 });
    site.addRotatedBoxCollider(-60, 270, 2.2, 5.4, Math.PI, "Fire engine", { maxY: 3.4 });
    for (const hx of [-36, -104]) {
      site.cyl(g, 0.24, 1.05, hx, 0.615, 268, red, 8, "Hydrant");
      site.cyl(g, 0.28, 0.22, hx, 1.25, 268, white, 8, "HydrantCap");
    }

    // -----------------------------------------------------------------------
    // 4. PAD HAZMAT, TURN BASIN SHED, BEACH PATROL PAVILION
    // -----------------------------------------------------------------------
    const hazmat = makeBuilding({
      x: -180,
      z: 132,
      w: 12,
      d: 8,
      h: 5,
      wall: tan,
      roof: concreteDark,
      windows: false,
      door: false,
      roofUnits: 1,
      baseY: 0.06,
      name: "Pad 39A hazmat storage",
      sign: {
        title: "PAD 39A HAZMAT",
        subtitle: "AUTHORIZED PERSONNEL ONLY",
        side: "back",
        w: 9.5,
        h: 1.8,
        y: 4.0,
        accent: "#fbbf24",
        bg: "#2a1c05"
      }
    });
    site.box(hazmat.group, 3.0, 2.7, 0.2, 0, 1.6, -4.1, steel, "HazmatDoor");
    for (let i = 0; i < 4; i++) {
      site.box(hazmat.group, 0.16, 0.16, 0.16, -5.9 + i * 0.4, 4.3, -4.07, yellow, "HazmatPlacard");
    }
    site.box(g, 32, 0.08, 24, -181, 0.04, 132, gravelLight, "HazmatPad");
    for (let i = 0; i < 5; i++) {
      const drum = site.cyl(g, 0.52, 1.2, -194 + (i % 3) * 1.3, 0.69, 128 + Math.floor(i / 3) * 1.3, i % 2 === 0 ? yellow : red, 10, "HazmatDrum");
      drum.rotation.y = i * 0.8;
    }
    site.vehicle(g, -195, 136, Math.PI * 0.5, "yellow", "truck", 0.06);
    track(-180, 109, 5.5, 36, dirt, 0);
    ruts(-180, 109, 36, 0, 1.6);
    patch(dirtDark, -175, 147, 8, 5, 0.3);

    const barge = makeBuilding({
      x: -930,
      z: 165,
      w: 16,
      d: 10,
      h: 5,
      wall: tan,
      roof: white,
      windows: false,
      door: false,
      roofUnits: 1,
      baseY: 0.06,
      name: "Barge operations shed",
      sign: {
        title: "TURN BASIN",
        subtitle: "BARGE OPERATIONS",
        side: "back",
        w: 11,
        h: 1.8,
        y: 4.05
      }
    });
    site.box(barge.group, 3.0, 2.8, 0.2, 0, 1.64, -5.1, steel, "BargeShedDoor");
    site.box(g, 28, 0.08, 24, -930, 0.04, 165, gravelLight, "BargeShedYard");
    site.cyl(g, 1.2, 0.4, -947, 0.26, 170, concreteDark, 12, "BargeCraneBase");
    site.cyl(g, 0.38, 12, -947, 6.2, 170, yellow, 10, "BargeCraneMast");
    site.beam(g, -947, 11.8, 170, -933, 11.8, 170, 0.34, yellow, "BargeCraneJib");
    site.cyl(g, 0.08, 4.2, -934, 9.8, 170, steel, 6, "BargeCraneCable");
    site.box(g, 1.2, 0.8, 1.2, -934, 9.2, 170, steel, "BargeCraneHook");
    site.vehicle(g, -919, 169, 0, "steel_white", "van", 0.06);
    site.addCircleCollider(-947, 170, 1.4, "Barge crane", { maxY: 14 });
    reserve(-930, 165, 30, 26);

    // Low timber beach-patrol pavilion on the open sand, seaward of the dunes.
    const bpX = 496;
    const bpZ = -24;
    for (const sx of [-3.4, 3.4]) {
      for (const sz of [-2.3, 2.3]) {
        site.cyl(g, 0.17, 2.8, bpX + sx, 1.4, bpZ + sz, trunk, 7, "BeachPavilionPost");
      }
    }
    site.box(g, 8.4, 0.26, 5.8, bpX, 2.93, bpZ, trunk, "BeachPavilionDeck");
    site.box(g, 3.6, 2.8, 3.4, bpX - 2.1, 4.46, bpZ, tan, "BeachPavilionHut");
    site.box(g, 4.2, 0.32, 4.0, bpX - 2.1, 6.02, bpZ, m("rust"), "BeachPavilionRoof");
    site.box(g, 2.0, 1.3, 0.14, bpX - 2.1, 4.9, bpZ + 1.78, glass, "BeachPavilionWindow");
    for (const sz of [-2.85, 2.85]) {
      site.box(g, 8.4, 0.1, 0.1, bpX, 4.1, bpZ + sz, trunk, "BeachPavilionRail");
      for (let i = 0; i < 5; i++) {
        site.box(g, 0.1, 0.9, 0.1, bpX - 3.6 + i * 1.8, 3.55, bpZ + sz, trunk, "BeachPavilionRailPost");
      }
    }
    for (let s = 0; s < 7; s++) {
      site.box(g, 1.4, 0.22, 4.6, bpX - 5.0 - s * 1.0, 2.75 - s * 0.4, bpZ, trunk, "BeachPavilionStep");
    }
    site.cyl(g, 0.09, 1.2, bpX + 2.2, 3.68, bpZ, steel, 6, "BeachTelescopeStem");
    const scope = site.cone(g, 0.18, 0.1, 0.9, bpX + 2.2, 4.4, bpZ, black, 8, "BeachTelescope");
    scope.rotation.x = Math.PI / 2;
    site.signBoard(
      g,
      bpX + 6,
      1.1,
      bpZ + 5.5,
      Math.PI,
      5.2,
      1.5,
      (ctx, w, h) => {
        ctx.fillStyle = "#14532d";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#efeee7";
        ctx.lineWidth = 5;
        ctx.strokeRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = "#efeee7";
        ctx.font = "900 34px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("BEACH PATROL 4", w * 0.5, h * 0.42);
        ctx.font = "700 22px Arial, Helvetica, sans-serif";
        ctx.fillText("CANAVERAL SEASHORE", w * 0.5, h * 0.72);
      },
      "BeachPatrolSign"
    );
    reserve(bpX, bpZ, 12, 8);

    // -----------------------------------------------------------------------
    // 5. PRESS OVERFLOW LOT & SOUTH BEACH TRAIL
    // -----------------------------------------------------------------------
    const pressLot = parkingLot(202, 262, 26, 34, 0, { count: 4 });
    const pressColors = ["steel_white", "silver", "ops_blue", "red", "black", "tan", "steel_white", "navy"];
    for (let i = 0; i < 8; i++) {
      const row = i < 4 ? 0 : 1;
      const index = i % 4;
      const x = 202 - 13 + (26 / 4) * (index + 0.5);
      const z = row === 0 ? pressLot.northZ : pressLot.southZ;
      site.vehicle(g, x, z, row === 0 ? Math.PI : 0, pressColors[i], i === 2 ? "van" : i === 5 ? "truck" : "sedan", 0.12);
    }
    reserve(202, 262, 28, 36);
    site.box(g, 12, 0.08, 20, 221, 0.04, 264, gravelLight, "PressGeneratorPad");
    site.box(g, 3.2, 1.2, 1.4, 221, 0.68, 258, m("orange"), "PressGenerator");
    site.vehicle(g, 221, 270, Math.PI, "steel_white", "van", 0.08);
    reserve(221, 264, 14, 22);
    track(166, 265, 20, 5, dirt, 0);
    patch(dirt, 172, 278, 16, 6, 0.1);

    // -----------------------------------------------------------------------
    // 6. DIRT SERVICE TRACKS, SHOULDERS & SCATTERED WEAR
    // -----------------------------------------------------------------------
    // Southern dirt patrol loop just outside the pad ring road (skips the ramp
    // mouth and the cryogenic propellant farm).
    const ringR = 161.5;
    const segs = 56;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = Math.cos(a0) * ringR;
      const z0 = Math.sin(a0) * ringR;
      const x1 = Math.cos(a1) * ringR;
      const z1 = Math.sin(a1) * ringR;
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      if (mz > 55 && Math.abs(mx) < 30) continue; // Pad 39A ramp throat
      if (mx > -172 && mx < -68 && mz > 52 && mz < 124) continue; // Propellant farm
      const len = Math.hypot(x1 - x0, z1 - z0);
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      site.boxRot(g, 5.2, 0.05, len, mx, 0.028, mz, 0, yaw, 0, dirt, "PadPatrolTrack");
      const rutX = Math.cos(yaw) * 1.15;
      const rutZ = -Math.sin(yaw) * 1.15;
      site.boxRot(g, 0.46, 0.018, len, mx + rutX, 0.057, mz + rutZ, 0, yaw, 0, dirtDark, "PadPatrolRut");
      site.boxRot(g, 0.46, 0.018, len, mx - rutX, 0.057, mz - rutZ, 0, yaw, 0, dirtDark, "PadPatrolRut");
    }

    // Main avenue gravel shoulders, split around junctions.
    for (const [x0, x1, z] of [[-680, -360, 305.6], [-300, -20, 305.6], [40, 170, 305.6], [-680, -360, 286.4], [-120, 50, 286.4]]) {
      track((x0 + x1) * 0.5, z, 1.6, x1 - x0, dirt, 0);
      ruts((x0 + x1) * 0.5, z, x1 - x0, 0, 1.0);
    }
    // Pad boulevard east shoulder.
    track(189.4, 70, 1.6, 430, dirt, 0);
    ruts(189.4, 70, 430, 0, 1.0);
    // Pull-offs used by survey and maintenance crews.
    site.box(g, 20, 0.08, 9, -505, 0.04, 311, gravelLight, "AvenuePulloff");
    site.vehicle(g, -505, 311, Math.PI * 0.5, "orange", "truck", 0.08);
    site.box(g, 18, 0.08, 8, 98, 0.04, 311, gravelLight, "AvenuePulloff");
    site.vehicle(g, 98, 311, -Math.PI * 0.5, "steel_white", "van", 0.08);
    site.box(g, 14, 0.08, 9, 198, 0.04, 80, gravelLight, "BoulevardPulloff");
    site.vehicle(g, 198, 80, Math.PI, "yellow", "truck", 0.08);
    reserve(-505, 311, 22, 11);
    reserve(98, 311, 20, 10);
    reserve(198, 80, 16, 11);

    // Dirt wear around the campus drive, fire apron and VAB apron edges.
    patch(dirt, -340, 272, 13, 8, 0.08);
    patch(dirt, -314, 272, 9, 12, -0.2);
    patch(dirtDark, -467, 254, 8, 10, 0.25);
    patch(dirt, -102, 268, 12, 5, 0.12);
    patch(dirt, -142, 510, 18, 7, 0.3);
    patch(dirt, 74, 540, 14, 6, -0.18);
    patch(dirt, 169, 536, 10, 8, 0.2);
    patch(dirt, 460, 24, 15, 8, 0.1);
    patch(dirt, 444, 118, 18, 12, -0.14);
    patch(dirt, 436, -92, 14, 10, 0.22);
    patch(dirtDark, 452, 64, 10, 6, 0.35);
    patch(dirt, -236, 232, 18, 10, 0.18);
    patch(dirt, -360, 208, 20, 12, -0.12);
    patch(dirt, -205, 220, 14, 8, 0.24);

    // -----------------------------------------------------------------------
    // 7. LAWNS & GROUND COLOUR PATCHES
    // -----------------------------------------------------------------------
    patch(lawn, -370, 244, 210, 30, 0);
    patch(lawn, -370, 206, 220, 28, 0);
    patch(lawn, -70, 240, 40, 18, 0);
    patch(lawn, -185, 525, 40, 22, 0);
    patch(lawn, 150, 540, 40, 16, 0);
    patch(lawn, 202, 242, 28, 8, 0);
    patch(lawn, 430, 0, 34, 30, 0);
    patch(lawn, -930, 152, 34, 12, 0);
    patch(grass, -505, 325, 52, 14, 0);
    patch(grass, 120, 325, 52, 14, 0);
    patch(grass, -350, 300, 40, 10, 0);

    // -----------------------------------------------------------------------
    // 8. LIVE OAKS, SABAL PALMS & SHRUBS
    // -----------------------------------------------------------------------
    const oaks = [
      [-470, 276, 1.0], [-444, 270, 1.15], [-415, 280, 0.9], [-362, 274, 1.05], [-334, 281, 0.95],
      [-286, 272, 1.1], [-292, 246, 0.95], [-470, 208, 1.0], [-360, 204, 1.12], [-288, 204, 0.9],
      [-532, 316, 1.0], [-492, 311, 1.1], [-452, 320, 0.95], [-408, 313, 1.05], [-362, 321, 0.9],
      [-292, 314, 1.0], [-238, 319, 0.95], [-186, 312, 1.1], [-96, 316, 0.95], [-24, 313, 1.05],
      [58, 318, 0.9], [126, 315, 1.0], [-250, 242, 1.0], [-114, 278, 0.95], [-18, 281, 1.05],
      [88, 282, 0.95], [-146, 506, 1.05], [-142, 576, 0.95], [86, 506, 1.0], [86, 568, 1.1],
      [112, 522, 0.9], [196, 606, 1.0], [72, 249, 0.9], [166, 250, 1.0], [-112, 238, 0.95],
      [-28, 258, 1.0], [-930, 193, 0.95], [-962, 60, 1.0], [406, -122, 0.95], [422, 144, 1.0]
    ];
    const oakTrunks = [];
    const oakLobesLow = [];
    const oakLobesHigh = [];
    oaks.forEach(([x, z, s], i) => {
      oakTrunks.push({ x, z, s });
      oakLobesLow.push({ x: x - 1.5 * s, z: z + 0.4 * s, y: 4.7 * s, s: s * 1.0, r: rnd(i + 11) });
      oakLobesLow.push({ x: x + 1.6 * s, z: z - 0.5 * s, y: 5.1 * s, s: s * 0.92, r: rnd(i + 21) });
      oakLobesHigh.push({ x: x + 0.1 * s, z: z + 1.0 * s, y: 5.7 * s, s: s * 0.86, r: rnd(i + 31) });
      oakLobesHigh.push({ x: x - 0.6 * s, z: z - 1.1 * s, y: 6.0 * s, s: s * 0.78, r: rnd(i + 41) });
    });
    if (THREE.InstancedMesh && oakTrunks.length) {
      const dummy = new THREE.Object3D();
      const trunkGeo = new THREE.CylinderGeometry(0.28, 0.52, 5.2, 7);
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunk, oakTrunks.length);
      oakTrunks.forEach((p, i) => {
        dummy.position.set(p.x, 2.6 * p.s, p.z);
        dummy.rotation.set(0, rnd(i + 71) * Math.PI * 2, 0);
        dummy.scale.set(p.s, p.s, p.s);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);
      });
      trunkInst.instanceMatrix.needsUpdate = true;
      trunkInst.frustumCulled = false;
      trunkInst.castShadow = !window.isMobileDevice;
      trunkInst.receiveShadow = true;
      g.add(trunkInst);
      const lobeGeo = new THREE.DodecahedronGeometry(2.7, 1);
      const addLobes = (items, material) => {
        const inst = new THREE.InstancedMesh(lobeGeo, material, items.length);
        items.forEach((p, i) => {
          dummy.position.set(p.x, p.y, p.z);
          dummy.rotation.set(0, p.r * Math.PI * 2, 0);
          dummy.scale.set(1.25 * p.s, 0.76 * p.s, 1.12 * p.s);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        inst.castShadow = !window.isMobileDevice;
        inst.receiveShadow = true;
        g.add(inst);
      };
      addLobes(oakLobesLow, oakLow);
      addLobes(oakLobesHigh, oakHigh);
    }

    const palms = [
      [-300, 272, 1.05, 1], [-292, 272, 0.95, 4], [-203, 240, 1.0, 2],
      [-108, 262, 0.95, 6], [-34, 264, 1.05, 3], [188, 240, 0.9, 7], [218, 245, 1.0, 5],
      [-120, 500, 1.1, 8], [60, 500, 1.0, 2], [-158, 580, 0.95, 4], [-218, 528, 1.05, 6],
      [120, 528, 0.9, 1], [175, 585, 1.0, 3], [-900, 180, 1.05, 9], [-955, 155, 0.95, 2],
      [466, 110, 1.0, 5], [467, -90, 1.05, 7], [465, 200, 0.95, 3]
    ];
    palms.forEach(([px, pz, scale, seed]) => site.palmTree(g, px, pz, scale, seed, 0.02));

    const shrubs = [
      [-425, 252, 1.0], [-374, 252, 0.85], [-330, 244, 1.1], [-286, 244, 0.9],
      [-481, 224, 1.0], [-450, 220, 0.8], [-345, 214, 1.05], [-262, 214, 0.9],
      [-108, 270, 0.85], [-35, 270, 0.8], [-113, 256, 1.0], [-28, 270, 0.9],
      [-146, 540, 0.9], [-146, 580, 0.85], [82, 540, 1.0], [82, 580, 0.9],
      [168, 586, 0.85], [214, 540, 1.0], [232, 556, 0.9], [184, 520, 0.8],
      [140, 266, 0.9], [160, 278, 1.0], [44, 270, 0.85], [108, 273, 0.9],
      [-944, 150, 0.85], [-964, 178, 0.9], [-442, 292, 0.8], [-396, 292, 0.9],
      [420, 24, 0.85], [424, -38, 0.9], [452, 4, 0.8], [410, 72, 0.95],
      [-660, 312, 0.9], [-566, 280, 0.8], [-18, 330, 0.85], [146, 332, 0.9]
    ];
    const bloomSpots = [
      [-310, 243, 0.9], [-282, 248, 0.8], [-440, 274, 0.85], [-110, 256, 0.8],
      [154, 272, 0.85], [-118, 572, 0.8], [93, 574, 0.9], [-16, 276, 0.85]
    ];
    const shrubGeo = new THREE.DodecahedronGeometry(1.25, 0);
    const addShrubs = (items, material, scale) => {
      if (!THREE.InstancedMesh || !items.length) return;
      const inst = new THREE.InstancedMesh(shrubGeo, material, items.length);
      const dummy = new THREE.Object3D();
      items.forEach((p, i) => {
        dummy.position.set(p[0], 0.52 * p[2] * scale, p[1]);
        dummy.rotation.set(0, rnd(i + 151) * Math.PI * 2, 0);
        dummy.scale.set(p[2] * 1.35, p[2] * 0.62, p[2] * 1.2);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      inst.castShadow = !window.isMobileDevice;
      inst.receiveShadow = true;
      g.add(inst);
    };
    addShrubs(shrubs, foliage, 1.0);
    addShrubs(bloomSpots, bloomPink, 0.9);

    // -----------------------------------------------------------------------
    // 9. INSTANCED GRASS TUFTS & ROADSIDE WILDFLOWERS
    // -----------------------------------------------------------------------
    function groundClear(x, z) {
      if (x > 464 || x < -1010 || z < -1010 || z > 815) return false;
      const radius = Math.hypot(x, z);
      if (radius < 168) return false; // Pad apron, ring road and patrol track
      if (Math.abs(x) <= 28 && z >= 178 && z <= 596) return false;
      if (NS.terrain && NS.terrain.distToPolyline(x, z, NS.CRAWLERWAY_39B_POINTS) < 29) return false;
      if (Math.abs(z - 296) < 11 && x > -698 && x < 194) return false;
      if (Math.abs(x - 180) < 11 && z > -154 && z < 296) return false;
      if (Math.abs(x + 692) < 10 && z > 36 && z < 300) return false;
      if (Math.abs(z - 56) < 10 && x > -696 && x < -550) return false;
      if (Math.abs(z - 92) < 9 && x > -696 && x < -584) return false;
      if (x >= -238 && x <= -122 && z >= 240 && z <= 294) return false; // LCC lot
      if (x >= -134 && x <= 74 && z >= 492 && z <= 596) return false; // VAB apron
      if (x >= -220 && x <= 80 && z >= 588 && z <= 815) return false; // VAB
      if (x >= -219 && x <= -141 && z >= 151 && z <= 209) return false; // LCC
      if (x >= 77 && x <= 159 && z >= 187 && z <= 241) return false; // Press
      if (x >= -160 && x <= -80 && z >= 60 && z <= 116) return false; // Propellant farm
      if (x >= -972 && x <= -890 && z >= 90 && z <= 146) return false; // Turn basin
      if (x >= -730 && x <= -682 && z >= 32 && z <= 68) return false; // Substation
      if (Math.hypot(x + 620, z - 58) < 13) return false;
      if (Math.hypot(x + 596, z - 92) < 10) return false;
      if (x >= -870 && x <= -830 && z >= 318 && z <= 354) return false; // Antenna farm
      if (x >= -119 && x <= 24 && z >= 470 && z <= 548) return false; // Crawler
      // New campus drives, aprons and yards.
      if (x >= -484 && x <= -276 && Math.abs(z - 264) < 6) return false;
      if (Math.abs(x + 345) < 7 && z >= 260 && z <= 293) return false;
      if (Math.abs(x + 465) < 5 && z >= 248 && z <= 266) return false;
      if (x >= -430 && x <= -360 && z >= 245 && z <= 260) return false;
      if (x >= -480 && x <= -454 && z >= 216 && z <= 254) return false;
      if (x >= -99 && x <= -41 && z >= 257 && z <= 290) return false; // Fire apron
      if (x >= 72 && x <= 183 && z >= 528 && z <= 540) return false; // LETF access track
      if (x >= -164 && x <= -129 && z >= 505 && z <= 519) return false; // Warehouse lot link
      if (x >= -162 && x <= -144 && z >= 533 && z <= 568) return false; // Warehouse truck apron
      if (x >= -199 && x <= -163 && z >= 118 && z <= 148) return false; // Hazmat pad
      if (x >= 214 && x <= 230 && z >= 250 && z <= 278) return false; // Press generator
      if (insideReserved(x, z)) return false;
      return true;
    }

    const tufts = [];
    const tuftZones = [
      [-370, 242, 112, 58, 220],
      [-260, 318, 400, 8, 150],
      [-530, 281, 72, 9, 44],
      [-12, 280, 130, 9, 58],
      [-148, 545, 8, 52, 46],
      [82, 545, 9, 52, 46],
      [150, 264, 34, 20, 40],
      [442, 0, 24, 210, 110],
      [-532, 230, 40, 52, 50],
      [0, 176, 170, 32, 60]
    ];
    let tuftSeed = 0;
    tuftZones.forEach(([cx, cz, hw, hd, count]) => {
      for (let i = 0; i < count; i++) {
        const x = cx + (rnd(tuftSeed + 1000) * 2 - 1) * hw;
        const z = cz + (rnd(tuftSeed + 2000) * 2 - 1) * hd;
        tuftSeed += 2.17;
        if (!groundClear(x, z)) continue;
        if (Math.abs(x) < 28 && z > 178 && z < 596) continue;
        tufts.push({ x, z, s: 0.55 + rnd(tuftSeed + 3000) * 0.65, r: rnd(tuftSeed + 4000), dry: rnd(tuftSeed + 5000) > 0.88 });
      }
    });

    if (THREE.InstancedMesh && tufts.length) {
      const dummy = new THREE.Object3D();
      const green = tufts.filter((t) => !t.dry);
      const dry = tufts.filter((t) => t.dry);
      const tuftGeo = new THREE.ConeGeometry(0.14, 0.44, 5);
      const tuftGreenMat = new THREE.MeshStandardMaterial({ color: 0x547239, roughness: 0.98, metalness: 0.0 });
      const tuftDryMat = new THREE.MeshStandardMaterial({ color: 0x7c7552, roughness: 0.98, metalness: 0.0 });
      const buildTufts = (items, material, offset, scale) => {
        if (!items.length) return;
        const inst = new THREE.InstancedMesh(tuftGeo, material, items.length);
        items.forEach((p, i) => {
          dummy.position.set(p.x + offset * p.s, 0.22 * p.s * scale, p.z - offset * p.s * 0.4);
          dummy.rotation.set((p.r - 0.5) * 0.22, p.r * Math.PI * 2, (p.r - 0.5) * 0.22);
          dummy.scale.set(p.s * 1.15, p.s * scale, p.s * 1.15);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        inst.receiveShadow = true;
        g.add(inst);
      };
      buildTufts(green, tuftGreenMat, 0, 1.0);
      buildTufts(green, tuftGreenMat, 0.15, 0.7);
      buildTufts(dry, tuftDryMat, 0, 0.85);
    }

    const flowers = [];
    const flowerZones = [
      [-370, 248, 140, 34, 70],
      [-86, 265, 30, 12, 24],
      [150, 264, 32, 18, 22],
      [-185, 522, 38, 18, 18],
      [440, 20, 20, 90, 24]
    ];
    let flowerSeed = 0;
    flowerZones.forEach(([cx, cz, hw, hd, count]) => {
      for (let i = 0; i < count; i++) {
        const x = cx + (rnd(flowerSeed + 6100) * 2 - 1) * hw;
        const z = cz + (rnd(flowerSeed + 7100) * 2 - 1) * hd;
        flowerSeed += 1.83;
        if (!groundClear(x, z)) continue;
        flowers.push({ x, z, s: 0.6 + rnd(flowerSeed + 8100) * 0.8, r: rnd(flowerSeed + 9100) });
      }
    });
    if (THREE.InstancedMesh && flowers.length) {
      const dummy = new THREE.Object3D();
      const gold = flowers.filter((f) => f.r > 0.25);
      const ivory = flowers.filter((f) => f.r <= 0.25);
      const flowerGeo = new THREE.SphereGeometry(0.06, 6, 4);
      const buildFlowers = (items, material) => {
        if (!items.length) return;
        const inst = new THREE.InstancedMesh(flowerGeo, material, items.length);
        items.forEach((p, i) => {
          dummy.position.set(p.x, 0.32 + p.s * 0.12, p.z);
          dummy.rotation.set(0, p.r * Math.PI * 2, 0);
          dummy.scale.set(p.s, p.s, p.s);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        });
        inst.instanceMatrix.needsUpdate = true;
        inst.frustumCulled = false;
        g.add(inst);
      };
      buildFlowers(gold, flowerGold);
      buildFlowers(ivory, flowerWhite);
    }
  });
})(window);
