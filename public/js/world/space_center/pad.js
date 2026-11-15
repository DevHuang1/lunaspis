/**
 * Space Center 2 — Launch Complex 39A pad accessories, propellant farm,
 * elevated deluge water tower, emergency egress slidewire, lightning masts & pad GSE.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("pad", function buildPadDetails(site) {
    const g = new window.THREE.Group();
    g.name = "SC2_Pad39A";
    site.group.add(g);

    const C = NS.constants;
    const m = (k) => site.mat(k);
    const steel = m("steel_grey");
    const white = m("steel_white");
    const concrete = m("concrete");
    const concreteDark = m("concrete_dark");
    const padTopY = 12.5;

    // -------------------------------------------------------------------------
    // 1. THREE TALL LIGHTNING PROTECTION MASTS & CATENARY WIRES
    // -------------------------------------------------------------------------
    const masts = [
      { x: -84, z: -74 },
      { x: 84, z: -74 },
      { x: 0, z: -102 }
    ];
    const anchors = [
      { x: -116, z: -102 },
      { x: 116, z: -102 },
      { x: 0, z: -126 }
    ];
    masts.forEach((p, idx) => {
      site.cyl(g, 2.2, 0.8, p.x, 0.4, p.z, concreteDark, 10, "MastFooting");
      site.cone(g, 0.45, 1.35, 92, p.x, 46.8, p.z, white, 12, "LightningMast");
      // Aviation warning orange bands
      for (const oy of [30, 56, 82]) {
        const r = 1.35 - (oy / 92) * 0.9;
        site.cyl(g, r + 0.04, 5.5, p.x, oy, p.z, m("orange"), 12, "MastWarnBand");
      }
      site.cone(g, 0.04, 0.28, 16, p.x, 100.8, p.z, steel, 8, "MastFinial");
      site.sphere(g, 0.46, p.x, 109.0, p.z, m("red"), 8, "MastBeacon");

      // Anchor block + heavy steel catenary cable (thick enough to avoid moire flicker)
      const anc = anchors[idx];
      site.box(g, 2.4, 1.4, 2.4, anc.x, 0.7, anc.z, concreteDark, "GuyAnchorBlock");
      site.beam(g, p.x, 94, p.z, anc.x, 1.2, anc.z, 0.13, steel, "MastGuyWire");
    });
    // Overhead catenary grid linking mast tips above rocket apex
    site.beam(g, masts[0].x, 96, masts[0].z, masts[1].x, 96, masts[1].z, 0.14, steel, "CatenaryWire");
    site.beam(g, masts[0].x, 96, masts[0].z, masts[2].x, 96, masts[2].z, 0.14, steel, "CatenaryWire");
    site.beam(g, masts[1].x, 96, masts[1].z, masts[2].x, 96, masts[2].z, 0.14, steel, "CatenaryWire");

    // -------------------------------------------------------------------------
    // 2. PAD HARDSTAND RAILINGS, TAXI LINES & MLP DELUGE / HOLD-DOWN DETAILS
    // -------------------------------------------------------------------------
    const octPts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      octPts.push([Math.sin(a) * 63.2, Math.cos(a) * 63.2]);
    }
    for (let i = 0; i < 8; i++) {
      const a = octPts[i];
      const b = octPts[(i + 1) % 8];
      // Leave the South crawler ramp opening clear (z > 50, centered around x=0)
      if (a[1] > 48 && b[1] > 48 && Math.abs((a[0] + b[0]) * 0.5) < 28) continue;
      site.railing(g, a[0], a[1], b[0], b[1], padTopY, m("yellow"));
    }

    // Crisp elevated crawler alignment lines & flame trench exit blast walls (no overlap!)
    site.box(g, 0.42, 0.03, 34, -14, padTopY + 0.025, 45, m("stripe_yellow"), "PadGuideLineW");
    site.box(g, 0.42, 0.03, 34, 14, padTopY + 0.025, 45, m("stripe_yellow"), "PadGuideLineE");
    site.box(g, 1.4, 4.4, 22, 65.4, 4.4, 0, m("black"), "TrenchExitPortE");
    site.box(g, 1.4, 4.4, 22, -65.4, 4.4, 0, m("black"), "TrenchExitPortW");

    // Tail Service Masts (TSM) & deluge manifolds mounted squarely on MLP top (y=19.8)
    const mlpTop = 19.8;
    for (const sx of [-11.5, 11.5]) {
      site.box(g, 3.6, 8.8, 3.2, sx, mlpTop + 4.4, -9.5, concreteDark, "TSM_Housing");
      site.box(g, 3.8, 0.4, 3.4, sx, mlpTop + 8.9, -9.5, m("yellow"), "TSM_Cap");
      site.cyl(g, 0.35, 7.6, sx * 0.85, mlpTop + 3.8, -8.5, white, 10, "TSM_CryoPipe");
    }
    // Deluge water supply header piping flanking MLP base
    for (const px of [-22.5, 22.5]) {
      site.cyl(g, 0.48, 36, px, padTopY + 0.6, 0, m("steel_white"), 10, "DelugeHeader").rotation.x = Math.PI / 2;
    }

    // Emergency Slidewire Egress Basket cables (FSS tower top x=-34, y=88 -> West bunker)
    site.box(g, 11, 2.8, 12, -108, 1.4, -22, concreteDark, "EgressBunker");
    site.box(g, 11.4, 0.4, 12.4, -108, 2.9, -22, m("orange"), "EgressRoof");
    site.beam(g, -39, 86, -4, -106, 2.8, -22, 0.11, steel, "SlidewireCableA");
    site.beam(g, -39, 86, 2, -106, 2.8, -18, 0.11, steel, "SlidewireCableB");

    // -------------------------------------------------------------------------
    // 3. PAD PERIMETER SUPPORT VEHICLES, KIOSK & BARRIERS (on apron top y=0.08)
    // -------------------------------------------------------------------------
    const apronTop = 0.08;
    // Pad Safety & Guard Kiosk near South Apron Road Entrance
    site.box(g, 6.4, 3.2, 4.4, -52, apronTop + 1.6, 112, concreteDark, "PadKioskBody");
    site.box(g, 8.2, 0.36, 6.2, -52, apronTop + 3.38, 112, m("steel_white"), "PadKioskCanopy");
    site.box(g, 6.5, 1.1, 4.5, -52, apronTop + 2.1, 112, m("glass"), "PadKioskGlass");

    // Detailed Pad Ground Support Fleet (Emergency Fire Crash Truck, Crew Vans, Tool Pickup)
    site.vehicle(g, 48, 92, -0.5, "yellow", "truck", apronTop);
    site.vehicle(g, -44, 102, 0.35, "steel_white", "van", apronTop);
    site.vehicle(g, 62, 64, Math.PI * 0.72, "red", "truck", apronTop);
    // Portable telescoping diesel floodlight trailer on apron
    site.box(g, 2.8, 1.1, 1.8, 36, apronTop + 0.55, 108, m("orange"), "LightCartBody");
    site.cyl(g, 0.12, 5.2, 36, apronTop + 3.6, 108, steel, 8, "LightCartMast");
    site.box(g, 1.3, 0.45, 0.45, 36, apronTop + 6.3, 108, m("lamp"), "LightCartHead");

    for (const bx of [-40, -34, 34, 40]) {
      site.box(g, 4.8, 1.0, 0.7, bx, apronTop + 0.5, 128, m("concrete_curb"), "JerseyBarrier");
    }

    // -------------------------------------------------------------------------
    // 4. CRYOGENIC PROPELLANT FARM (LOX & LH2 SPHERES, CORNER-TRIMMED BERM)
    // -------------------------------------------------------------------------
    const prop = C.PROPELLANT; // (-120, 88)
    site.box(g, 68, 0.18, 42, prop.x, 0.09, prop.z, concreteDark, "PropellantApron");
    // Trimmed non-overlapping containment berm walls
    site.box(g, 68, 1.4, 1.0, prop.x, 0.88, prop.z - 20.5, concrete, "BermNorth");
    site.box(g, 68, 1.4, 1.0, prop.x, 0.88, prop.z + 20.5, concrete, "BermSouth");
    site.box(g, 1.0, 1.4, 40, prop.x - 33.5, 0.88, prop.z, concrete, "BermWest");
    site.box(g, 1.0, 1.4, 40, prop.x + 33.5, 0.88, prop.z, concrete, "BermEast");

    [prop.x - 16, prop.x + 16].forEach((x, idx) => {
      site.cyl(g, 9.2, 0.35, x, 0.35, prop.z, concrete, 20, "SpherePad");
      site.sphere(g, 7.6, x, 11.2, prop.z, white, 24, idx === 0 ? "LOX_Sphere" : "LH2_Sphere");
      site.cyl(g, 7.68, 0.9, x, 11.2, prop.z, idx === 0 ? m("ops_blue") : m("yellow"), 24, "SphereStripe");
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        site.cyl(g, 0.42, 11.0, x + Math.cos(a) * 6.6, 5.8, prop.z + Math.sin(a) * 6.6, steel, 8, "SphereLeg");
      }
      site.label(g, idx === 0 ? "LIQUID OXYGEN" : "LIQUID HYDROGEN", x, 11.5, prop.z - 8.2, {
        width: 7,
        height: 1.5,
        color: "#e4ff7e",
        fontSize: 46
      });
      site.addCircleCollider(x, prop.z, 7.0, "Propellant sphere");
    });

    // High-pressure gaseous Nitrogen bottle tube-rack & cryo transfer pipeway toward Pad
    for (let i = 0; i < 4; i++) {
      const tz = prop.z - 5 + i * 2.2;
      const tube = site.cyl(g, 0.55, 11, prop.x, 1.5 + (i % 2) * 1.1, tz, m("yellow"), 10, "GN2_Tube");
      tube.rotation.z = Math.PI / 2;
    }
    // Insulated stainless pipeline run onto Pad Berm
    const pipe = site.cyl(g, 0.44, 42, prop.x + 34, 1.4, prop.z - 12, white, 10, "CryoTransferPipe");
    pipe.rotation.z = Math.PI / 2;
    pipe.rotation.y = 0.28;

    site.signBoard(
      g,
      prop.x + 17,
      1.6,
      prop.z - 19.6,
      Math.PI,
      5.2,
      1.4,
      (ctx, w, h) => {
        ctx.fillStyle = "#b91c1c";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#efeee7";
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = "#efeee7";
        ctx.font = "900 42px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("DANGER · NO OPEN FLAME", w * 0.5, h * 0.45);
        ctx.font = "700 28px Arial, Helvetica, sans-serif";
        ctx.fillText("SUPER-COLD ROCKET FUEL", w * 0.5, h * 0.78);
      },
      "PropellantDangerSign"
    );

    // -------------------------------------------------------------------------
    // 5. ELEVATED DELUGE WATER TOWER (96, 58)
    // -------------------------------------------------------------------------
    const wt = C.WATER_TOWER;
    site.cyl(g, 9.8, 0.34, wt.x, 0.17, wt.z, concreteDark, 20, "WaterTowerPad");
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const lx = wt.x + Math.cos(a) * 6.4;
      const lz = wt.z + Math.sin(a) * 6.4;
      const topX = wt.x + Math.cos(a) * 5.2;
      const topZ = wt.z + Math.sin(a) * 5.2;
      site.beam(g, lx, 0.34, lz, topX, 31, topZ, 0.42, steel, "WaterLeg");
      const nextA = ((i + 1) / 6) * Math.PI * 2;
      const nx = wt.x + Math.cos(nextA) * 5.8;
      const nz = wt.z + Math.sin(nextA) * 5.8;
      site.beam(g, lx, 15, lz, nx, 15, nz, 0.22, steel, "WaterBrace");
    }
    site.cyl(g, 1.35, 32, wt.x, 16, wt.z, white, 14, "WaterRiserPipe");
    site.cone(g, 7.6, 1.6, 5.2, wt.x, 32.6, wt.z, white, 24, "WaterBowlBottom");
    site.cyl(g, 7.6, 9.6, wt.x, 40.0, wt.z, white, 24, "WaterTankWall");
    site.cyl(g, 7.72, 1.4, wt.x, 40.0, wt.z, m("orange"), 24, "WaterTankBand");
    site.cone(g, 0.5, 7.8, 3.6, wt.x, 46.6, wt.z, white, 24, "WaterTankRoof");
    site.sphere(g, 0.4, wt.x, 48.8, wt.z, m("red"), 8, "WaterTankBeacon");
    site.label(g, "WATER TANK 39A", wt.x, 3.6, wt.z - 12, { width: 9, height: 1.6, fontSize: 40 });
    site.addCircleCollider(wt.x, wt.z, 6.2, "Water tower", { maxY: 8.0 });

    // Berm slope, ramp side embankments, and pad summit perimeter/obstacles
    // are enforced with elevation awareness in SpaceCenterModules.terrain so
    // the south ramp corridor and top hardstand deck stay smoothly traversable.
    const groundOnly = { maxY: 8.0 };
    // Cryogenic propellant farm containment deck.
    site.addBoxCollider(prop.x, prop.z, 70, 44, "Propellant farm", groundOnly);
    // Egress bunker, floodlight cart and jersey barrier row.
    site.addBoxCollider(-108, -22, 11.2, 12.2, "Pad egress bunker", groundOnly);
    site.addBoxCollider(36, 108, 2.8, 1.8, "Pad light cart", groundOnly);
    // Match the four visible barrier blocks exactly instead of sealing the gap
    // between each pair with one wide collider.
    for (const bx of [-40, -34, 34, 40]) {
      site.addBoxCollider(bx, 128, 4.8, 0.7, "Pad jersey barrier", groundOnly);
    }
    // Lightning masts, guard kiosk, sign and pad support vehicles are solid.
    for (const p of masts) site.addCircleCollider(p.x, p.z, 2.4, "Lightning mast", groundOnly);
    for (const a of anchors) site.addBoxCollider(a.x, a.z, 2.6, 2.6, "Mast guy anchor", groundOnly);
    site.addBoxCollider(-52, 112, 6.6, 4.6, "Pad 39A guard kiosk", groundOnly);
    // Oriented footprints match each parked vehicle's yaw, avoiding invisible
    // AABB walls around the sides of the trucks.
    site.addRotatedBoxCollider(48, 92, 2.2, 5.4, -0.5, "Pad fire truck", groundOnly);
    site.addRotatedBoxCollider(-44, 102, 2.35, 5.8, 0.35, "Pad crew van", groundOnly);
    site.addRotatedBoxCollider(62, 64, 2.2, 5.4, Math.PI * 0.72, "Pad support truck", groundOnly);
  });
})(window);
