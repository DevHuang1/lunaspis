/**
 * Space Center 2 — Vehicle Assembly Building (VAB), Low Bay & High Bay interior.
 *
 * Non-overlapping wall corners/roof, proud exterior South High Bay doors, NASA
 * Meatball and US Flag murals facing Pad 39A, illuminated High Bay platforms,
 * overhead bridge crane, and walkable interior colliders.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("vab", function buildVAB(site) {
    const g = new window.THREE.Group();
    g.name = "SC2_VAB";
    site.group.add(g);

    const C = NS.constants;
    const m = (k) => site.mat(k);
    const vabPanel = m("vab_panel");
    const steel = m("steel_grey");
    const dark = m("vab_rib");
    const concrete = m("concrete");
    const concreteDark = m("concrete_dark");

    const cx = C.VAB.x;
    const cz = C.VAB.z;
    const hx = C.VAB.halfX;
    const hz = C.VAB.halfZ;
    const height = C.VAB.height;
    const wallT = 2.0;
    const southFaceZ = cz - hz; // 591.0 exterior south face
    const northFaceZ = cz + hz; // 809.0 exterior north face
    const doorHalf = C.VAB.doorHalfWidth; // 23
    const sideDepth = hz * 2 - wallT * 2; // 214 (between N/S walls -> zero corner overlap)

    // South VAB assembly apron wing pads flanking crawlerway corridor (cleanly below crawlerway top=0.14)
    site.box(g, hx * 2 + 44, 0.08, 96, cx, 0.02, southFaceZ - 48, concreteDark, "VABSouthApron");
    // Interior slab (strictly inside outer walls to avoid any Z-fighting with exterior concrete)
    site.box(g, hx * 2 - wallT * 2, 0.18, sideDepth, cx, 0.09, cz, concrete, "VABFloor");
    // Roof sits strictly above walls [160..162.8] with overhanging parapet cap
    site.box(g, hx * 2 + 1.4, 2.8, hz * 2 + 1.4, cx, height + 1.4, cz, vabPanel, "VABRoof");
    site.box(g, hx * 2 + 1.8, 0.8, hz * 2 + 1.8, cx, height + 3.2, cz, dark, "VABParapet");

    // North, West, East outer walls (corner-trimmed so no faces overlap)
    site.box(g, hx * 2, height, wallT, cx, height * 0.5, northFaceZ - wallT * 0.5, vabPanel, "VABWallNorth");
    site.box(g, wallT, height, sideDepth, cx - hx + wallT * 0.5, height * 0.5, cz, vabPanel, "VABWallWest");
    site.box(g, wallT, height, sideDepth, cx + hx - wallT * 0.5, height * 0.5, cz, vabPanel, "VABWallEast");

    // South wall split around the towering 140m x 46m High Bay door
    const panelWidth = hx - doorHalf; // 56m each wing
    site.box(g, panelWidth, height, wallT, cx - doorHalf - panelWidth * 0.5, height * 0.5, southFaceZ + wallT * 0.5, vabPanel, "VABWallSouthW");
    site.box(g, panelWidth, height, wallT, cx + doorHalf + panelWidth * 0.5, height * 0.5, southFaceZ + wallT * 0.5, vabPanel, "VABWallSouthE");
    site.box(g, doorHalf * 2, height - 140, wallT, cx, 150, southFaceZ + wallT * 0.5, vabPanel, "VABDoorHeaderWall");

    // Heavy structural jamb pillars framing the High Bay portal (proud outside z=591.0)
    for (const side of [-1, 1]) {
      const jambX = cx + side * (doorHalf + 0.9);
      site.box(g, 1.8, 142, 2.8, jambX, 71, southFaceZ + 0.35, dark, "VABDoorJamb");
      // Retracted multi-section black corrugated door leaves parked OUTSIDE southFaceZ (zero overlap!)
      const leafX = cx + side * (doorHalf + 11.8);
      site.box(g, 20.5, 139, 1.3, leafX, 69.5, southFaceZ - 0.72, m("black"), "VABDoorLeaf");
      site.box(g, 20.8, 1.2, 1.48, leafX, 139.6, southFaceZ - 0.74, m("yellow"), "DoorLeafTopTrim");
      site.box(g, 20.8, 2.0, 1.48, leafX, 70, southFaceZ - 0.74, m("yellow"), "DoorLeafCenterStripe");
      for (let i = 1; i <= 6; i++) {
        if (i === 3) continue;
        site.box(g, 20.4, 0.36, 1.42, leafX, i * 20, southFaceZ - 0.72, steel, "DoorLeafSeam");
      }
      // Red/white safety threshold bollards beside portal
      site.cyl(g, 0.32, 1.8, cx + side * (doorHalf - 0.8), 0.9, southFaceZ - 1.5, m("yellow"), 10, "PortalBollard");
    }

    // Horizontal door track truss & aerodynamic belt above High Bay portal (strictly proud at southFaceZ)
    site.box(g, doorHalf * 2 + 46, 2.6, 1.4, cx, 141.6, southFaceZ - 0.85, dark, "DoorTrackHeader");
    site.box(g, doorHalf * 2 + 46, 0.4, 1.55, cx, 140.2, southFaceZ - 0.85, m("yellow"), "DoorHeaderWarn");

    // Vertical structural ribs cleanly framing bays without crossing Meatball/Flag murals
    [-76, -31, -24.5, 24.5, 31, 76].forEach((ox) => {
      site.box(g, 1.5, height - 1, 1.1, cx + ox, height * 0.5, southFaceZ - 0.55, dark, "VABSouthRib");
      site.box(g, 1.5, height - 1, 1.1, cx + ox, height * 0.5, northFaceZ + 0.55, dark, "VABNorthRib");
    });

    // Horizontal structural wind bands framing the upper mural bays [80..136] cleanly
    [42, 80, 136].forEach((by) => {
      site.box(g, hx * 2 + 1.2, 1.4, 0.9, cx, by, southFaceZ - 0.45, dark, "VABBandS");
      site.box(g, hx * 2 + 1.2, 1.4, 0.9, cx, by, northFaceZ + 0.45, dark, "VABBandN");
      site.box(g, 0.9, 1.4, hz * 2 - 1.2, cx - hx - 0.45, by, cz, dark, "VABBandW");
      site.box(g, 0.9, 1.4, hz * 2 - 1.2, cx + hx + 0.45, by, cz, dark, "VABBandE");
    });

    // Exterior East/West louver bays
    for (let bz = cz - 88; bz <= cz + 88; bz += 22) {
      site.box(g, 1.2, height - 1, 1.4, cx - hx - 0.6, height * 0.5, bz, dark, "VABWestRib");
      site.box(g, 1.2, height - 1, 1.4, cx + hx + 0.6, height * 0.5, bz, dark, "VABEastRib");
    }

    // Corner aerodynamic bevel fins
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        site.box(g, 3.2, height, 3.2, cx + sx * hx, height * 0.5, cz + sz * hz, dark, "VABCornerFin");
      }
    }

    // Iconic NASA Meatball Insignia centered cleanly inside upper-west bay [-76..-31, y 81..135]
    site.canvasPlane(
      g,
      28,
      28,
      cx - 53.5,
      108,
      southFaceZ - 0.16,
      0,
      Math.PI,
      0,
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const r = w * 0.44;
        ctx.fillStyle = "#0b3d91";
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 24; i++) {
          const sx = (0.2 + ((i * 73) % 60) / 100) * w;
          const sy = (0.2 + ((i * 41) % 60) / 100) * h;
          ctx.beginPath();
          ctx.arc(sx, sy, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.52, r * 0.88, r * 0.38, -0.38, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#fc3d21";
        ctx.beginPath();
        ctx.moveTo(w * 0.14, h * 0.64);
        ctx.lineTo(w * 0.52, h * 0.12);
        ctx.lineTo(w * 0.84, h * 0.72);
        ctx.lineTo(w * 0.52, h * 0.36);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 112px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("NASA", w * 0.5, h * 0.54);
      },
      512,
      512,
      { transparent: true, name: "VAB_NASA_Meatball" }
    );

    // Iconic Giant US Flag Mural centered cleanly inside upper-east bay [+31..+76, y 81..135]
    site.canvasPlane(
      g,
      28,
      46,
      cx + 53.5,
      108,
      southFaceZ - 0.16,
      0,
      Math.PI,
      0,
      (ctx, w, h) => {
        // Vertical 209-ft style US Flag mural
        const stripeW = w / 13;
        for (let i = 0; i < 13; i++) {
          ctx.fillStyle = i % 2 === 0 ? "#b22234" : "#f8fafc";
          ctx.fillRect(i * stripeW, 0, stripeW + 1, h);
        }
        ctx.fillStyle = "#2b305c";
        ctx.fillRect(0, 0, stripeW * 7, h * 0.42);
        ctx.fillStyle = "#ffffff";
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 5; c++) {
            ctx.beginPath();
            ctx.arc((0.6 + c * 1.25) * stripeW, h * (0.05 + r * 0.064), 3.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
      384,
      640,
      { name: "VAB_US_FlagMural" }
    );

    // Crisp NASA architectural header placard centered above the High Bay door
    site.canvasPlane(
      g,
      44,
      7,
      cx,
      151,
      southFaceZ - 0.2,
      0,
      Math.PI,
      0,
      (ctx, w, h) => {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#f8fafc";
        ctx.font = "900 44px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("VEHICLE ASSEMBLY BUILDING", w * 0.5, h * 0.52);
      },
      768,
      128,
      { name: "VAB_TitlePlaque" }
    );

    // Roof utility plant, chillers, HVAC penthouse & twin lightning arresters (strictly above roof top=162.8)
    for (let rx = -40; rx <= 40; rx += 40) {
      site.box(g, 18, 6, 22, cx + rx, height + 5.8, cz - 24, concrete, "VABRoofChiller");
      site.cyl(g, 2.2, 2.4, cx + rx, height + 9.4, cz - 24, dark, 12, "VABChillerFan");
    }
    site.box(g, 28, 7, 18, cx, height + 6.3, cz + 42, dark, "VABRoofPenthouse");
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const mx = cx + sx * (hx - 6);
        const mz = cz + sz * (hz - 8);
        site.cone(g, 0.14, 0.36, 18, mx, height + 11.8, mz, steel, 8, "VABRoofMast");
        site.sphere(g, 0.35, mx, height + 21.0, mz, m("red"), 8, "VABMastBeacon");
      }
    }

    // Low Bay annex on west side (cleanly separated roof/facade/doors/Windows)
    const lbX = cx - 134;
    const lbZ = cz + 62;
    site.box(g, 102, 66, 74, lbX, 33, lbZ, vabPanel, "VABLowBayShell");
    site.box(g, 104, 2.4, 76, lbX, 67.2, lbZ, concreteDark, "LowBayRoof");
    for (let bx = lbX - 36; bx <= lbX + 36; bx += 24) {
      site.box(g, 12, 16, 0.5, bx, 8, lbZ - 37.25, m("steel_grey"), "LowBayDoor");
      site.box(g, 12.6, 0.9, 0.6, bx, 16.45, lbZ - 37.28, m("yellow"), "LowBayDoorTrim");
    }
    site.box(g, 64, 4.2, 0.4, lbX, 42, lbZ - 37.2, m("glass"), "LowBayWindows");
    site.box(g, 26, 4.5, 16, lbX, 70.6, lbZ, steel, "LowBayRoofAHU");
    site.label(g, "LOW BAY", lbX - 38, 12, lbZ - 38.5, { width: 10, height: 2.2, fontSize: 44 });

    // East Launch Operations Support Annex (non-overlapping with main East wall x=cx+hx)
    const ex = cx + hx + 13.5;
    site.box(g, 27, 36, 118, ex, 18, cz + 18, vabPanel, "VABEastAnnex");
    site.box(g, 28, 1.8, 120, ex, 36.9, cz + 18, concreteDark, "VABEastAnnexRoof");
    site.box(g, 0.4, 3.2, 92, ex + 13.7, 25, cz + 18, m("glass"), "AnnexStripWindow");

    // South exterior plaza floodlight standards
    for (const fx of [cx - 64, cx - 32, cx + 32, cx + 64]) {
      site.lightPole(g, fx, southFaceZ - 16, 0, 14, false, 0.06);
    }

    // Illuminated interior High Bay steel platforms, 250-ton yellow bridge crane & stacked vehicle
    for (const y of [22, 46, 70, 94, 118]) {
      site.box(g, 28, 1.4, 34, cx - 32, y, cz, dark, "InteriorPlatformW");
      site.box(g, 28, 1.4, 34, cx + 32, y, cz, dark, "InteriorPlatformE");
      site.box(g, 1.6, 1.4, 34, cx - 17.5, y, cz, m("yellow"), "InteriorEdgeW");
      site.box(g, 1.6, 1.4, 34, cx + 17.5, y, cz, m("yellow"), "InteriorEdgeE");
      // Cross columns supporting interior platforms
      site.box(g, 1.2, 24, 1.2, cx - 19, y - 12, cz - 15, steel, "HighBayCol");
      site.box(g, 1.2, 24, 1.2, cx + 19, y - 12, cz - 15, steel, "HighBayCol");
    }

    // Overhead 250-ton High Bay Bridge Crane
    site.box(g, 148, 3.2, 4.4, cx, 146, cz - 18, m("yellow"), "VABBridgeCrane");
    site.box(g, 14, 4.2, 7.6, cx + 18, 144.2, cz - 18, dark, "VABCraneTrolley");
    site.cyl(g, 0.14, 28, cx + 18, 129, cz - 18, steel, 8, "VABCraneCable");
    site.box(g, 3.2, 2.2, 1.8, cx + 18, 114.5, cz - 18, m("yellow"), "VABCraneHook");

    // Floor markings strictly proud of VABFloor top (0.18) with polygonOffset
    site.box(g, 1.2, 0.04, 150, cx - 18, 0.21, cz, m("stripe_yellow"), "AisleStripe");
    site.box(g, 1.2, 0.04, 150, cx + 18, 0.21, cz, m("stripe_yellow"), "AisleStripe");
    site.floorLabel(g, "HIGH BAY 1", cx, 0.22, cz - 72, 34, "rgba(250,204,21,0.82)");

    // Indoor launch vehicle stack (SLS-style core + twin SRBs + Orion fairing)
    site.box(g, 28, 3.8, 28, cx, 1.9 + 0.18, cz, concreteDark, "IndoorMLP");
    site.cyl(g, 4.2, 65, cx, 36.7, cz, m("foam"), 24, "IndoorSLSCore");
    site.cone(g, 2.5, 4.2, 9, cx, 73.7, cz, m("white"), 24, "IndoorAdapter");
    site.cyl(g, 2.5, 11, cx, 83.7, cz, m("white"), 20, "IndoorUpperStage");
    site.cone(g, 0.3, 2.5, 6, cx, 92.2, cz, m("white"), 16, "IndoorCapsule");
    for (const bx of [-7.5, 7.5]) {
      site.cyl(g, 1.85, 54, cx + bx, 31.2, cz, m("white"), 16, "IndoorSRB");
      site.cone(g, 0.2, 1.85, 5.5, cx + bx, 60.95, cz, m("white"), 16, "IndoorSRBCap");
      site.cyl(g, 1.9, 1.6, cx + bx, 12, cz, m("red"), 16, "IndoorSRBBand");
    }
    site.addCircleCollider(cx, cz, 10, "Indoor launch vehicle");

    // Comms mezzanine facing the pad doorway inside West VAB floor (cleanly offset glazing)
    const commsX = cx - 42;
    const commsY = 2.6;
    site.box(g, 18, 5, 12, commsX, commsY + 2.5, cz - 14, m("steel_grey"), "CommsRoom");
    site.box(g, 14, 2.4, 0.18, commsX, commsY + 2.6, cz - 20.1, m("glass"), "CommsWindow");
    site.label(g, "COMMS", commsX, commsY + 2.6, cz - 20.4, { width: 6, height: 1.5, fontSize: 40 });
    for (let i = 0; i < 4; i++) {
      site.box(g, 1.6, 2.4, 0.9, commsX - 4.5 + i * 3, commsY + 1.2, cz - 14, m("black"), "ServerRack");
    }

    // Operations & Restroom support blocks inside south-east VAB bay (relative to cx!)
    site.box(g, 10, 4.6, 8, cx + 48, 2.48, cz - 86, concrete, "OfficeModule");
    site.box(g, 6, 2.0, 0.14, cx + 48, 2.7, cz - 90.08, m("glass"), "OfficeWindow");
    site.label(g, "OPERATIONS", cx + 48, 3.0, cz - 90.3, { width: 5, height: 1.2, fontSize: 34 });
    site.box(g, 8, 4.2, 7, cx + 48, 2.28, cz - 72, m("steel_white"), "RestroomModule");

    // Subtle warm interior fill light inside High Bay so rocket stack stands out from outside
    const bayLight = new window.THREE.PointLight(0xfff1d6, 1.6, 180, 1.4);
    bayLight.position.set(cx, 72, cz - 35);
    g.add(bayLight);

    // Wall colliders (preserving exact player bounds)
    site.addBoxCollider(cx, northFaceZ - wallT * 0.5, hx * 2, wallT, "VAB north wall");
    site.addBoxCollider(cx - hx + wallT * 0.5, cz, wallT, hz * 2, "VAB west wall");
    site.addBoxCollider(cx + hx - wallT * 0.5, cz, wallT, hz * 2, "VAB east wall");
    site.addBoxCollider(cx - doorHalf - panelWidth * 0.5, southFaceZ + wallT * 0.5, panelWidth, wallT, "VAB south wall");
    site.addBoxCollider(cx + doorHalf + panelWidth * 0.5, southFaceZ + wallT * 0.5, panelWidth, wallT, "VAB south wall");
    site.addBoxCollider(cx - 134, cz + 62, 104, 76, "VAB low bay");
  });
})(window);
