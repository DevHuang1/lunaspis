/**
 * Space Center 2 — Launch Complex 39B walkable site.
 *
 * A second, fully explorable launch complex north-east of Pad 39A: octagonal
 * hardstand and flame trench, fixed service structure, mobile launcher,
 * lightning protection masts, elevated deluge water tower, cryogenic
 * propellant farm, crawlerway apron and ground support equipment.
 * The launch/boarding flow stays on Pad 39A; 39B is a site-tour destination.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  NS.register("pad39b", function buildPad39B(site) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.name = "SC2_Pad39B";
    site.group.add(g);

    const C = NS.constants;
    const m = (k) => site.mat(k);

    // -------------------------------------------------------------------------
    // LOCAL PAD FRAME — rotate the whole complex to the LC-39B bearing so the
    // flame trench runs east-west and the crawlerway approaches from the north.
    // -------------------------------------------------------------------------
    const P = C.PAD_39B; // (-120, -760)
    const ROT = -0.46; // ~26° (LC-39B orientation)
    const cosR = Math.cos(ROT);
    const sinR = Math.sin(ROT);
    const wx = (x, z) => P.x + x * cosR + z * sinR;
    const wz = (x, z) => P.z - x * sinR + z * cosR;

    const B = (sx, sy, sz, x, y, z, mat, name) => site.boxRot(g, sx, sy, sz, wx(x, z), y, wz(x, z), 0, ROT, 0, mat, name);
    const CY = (r, h, x, y, z, mat, seg, name) => site.cyl(g, r, h, wx(x, z), y, wz(x, z), mat, seg, name);
    const CO = (rt, rb, h, x, y, z, mat, seg, name) => site.cone(g, rt, rb, h, wx(x, z), y, wz(x, z), mat, seg, name);
    const SP = (r, x, y, z, mat, seg, name) => site.sphere(g, r, wx(x, z), y, wz(x, z), mat, seg, name);
    const beamW = (ax, ay, az, bx, by, bz, th, mat, name) =>
      site.beam(g, wx(ax, az), ay, wz(ax, az), wx(bx, bz), by, wz(bx, bz), th, mat, name);

    const concrete = m("concrete");
    const concreteDark = m("concrete_dark");
    const curb = m("concrete_curb");
    const steel = m("steel_grey");
    const white = m("steel_white");
    const darkSteel = m("rust");
    const towerMat = m("tower");
    const yellow = m("yellow");
    const orange = m("orange");
    const grass = m("grass");
    const asphalt = m("asphalt");

    // -------------------------------------------------------------------------
    // 1. GRASSY BERM, OCTAGONAL HARDSTAND & FLAME TRENCH
    // -------------------------------------------------------------------------
    CO(62, 76, 5.9, 0, 2.95, 0, grass, 8, "Pad39BBerm");
    CY(61.4, 0.5, 0, 5.75, 0, concrete, 8, "Pad39BCollar");
    CY(60.2, 0.62, 0, 6.11, 0, concreteDark, 8, "Pad39BDeck");

    // Recessed east-west flame trench with blast deflector wedges.
    // Recessed flame-trench channel marking with low blast deflector wedges.
    B(52, 0.06, 13, 0, 6.4, 0, m("black"), "Pad39BTrenchChannel");
    B(54, 0.06, 1.2, 0, 6.41, -6.9, m("stripe_yellow"), "Pad39BTrenchLipN");
    B(54, 0.06, 1.2, 0, 6.41, 6.9, m("stripe_yellow"), "Pad39BTrenchLipS");
    B(12, 1.0, 7, 0, 6.9, -2.4, darkSteel, "Pad39BDeflectorA");
    B(12, 1.0, 7, 0, 6.9, 2.4, darkSteel, "Pad39BDeflectorB");

    // Crawlerway ramp from the north apron onto the hardstand (faces the
    // LC-39B crawlerway spur and the pad taxi lines).
    const rampTex = site._makeProceduralTexture("pad39b_ramp", 512, (ctx, s) => {
      ctx.fillStyle = "#8b949c";
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2400; i++) {
        ctx.fillStyle = i % 2 === 0 ? "rgba(120,128,136,0.24)" : "rgba(206,212,218,0.18)";
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    }, 3, 5);
    const rampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: rampTex, roughness: 0.92, metalness: 0.05 });
    const rampSlope = Math.atan2(6.3, 70);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 70.3), rampMat);
    ramp.position.set(wx(0, 95), 2.672, wz(0, 95));
    ramp.rotation.set(rampSlope, ROT, 0, "YXZ");
    ramp.castShadow = true;
    ramp.receiveShadow = true;
    g.add(ramp);
    for (const sx of [-23, 23]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(12, 4.2, 68), m("grass"));
      wing.position.set(wx(sx, 95), 1.18, wz(sx, 95));
      wing.rotation.set(rampSlope, ROT, sx > 0 ? -0.22 : 0.22, "YXZ");
      wing.receiveShadow = true;
      g.add(wing);
    }
    // Yellow lead-in lines painted on the ramp surface.
    for (const sx of [-9, 9]) {
      const lead = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 64), m("stripe_yellow"));
      lead.position.set(wx(sx, 95), 3.29, wz(sx, 95));
      lead.rotation.set(rampSlope, ROT, 0, "YXZ");
      g.add(lead);
    }

    // Hardstand perimeter railings (leave the ramp mouth and east stair open).
    const ring = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ring.push({ x: Math.sin(a) * 58.6, z: Math.cos(a) * 58.6 });
    }
    for (let i = 0; i < 8; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % 8];
      if (a.z > 30 && b.z > 30 && Math.abs((a.x + b.x) * 0.5) < 22) continue;
      site.railing(g, wx(a.x, a.z), wz(a.x, a.z), wx(b.x, b.z), wz(b.x, b.z), 6.45, yellow);
    }

    // Pad taxi lines and identification stencil.
    B(0.5, 0.03, 30, -13, 6.44, 47, m("stripe_yellow"), "Pad39BGuideW");
    B(0.5, 0.03, 30, 13, 6.44, 47, m("stripe_yellow"), "Pad39BGuideE");
    site.floorLabel(g, "39B", wx(34, 34), 6.46, wz(34, 34), 16, "rgba(240,240,232,0.86)");

    // -------------------------------------------------------------------------
    // 2. MOBILE LAUNCHER & FIXED SERVICE STRUCTURE
    // -------------------------------------------------------------------------
    for (const [px, pz] of [[-21, -16], [21, -16], [-21, 16], [21, 16], [-21, 0], [21, 0]]) {
      B(3.2, 1.1, 3.2, px, 6.95, pz, darkSteel, "MLPPier");
    }
    B(48, 5.5, 40, 0, 10.2, 0, concreteDark, "MobileLauncherBase");
    B(48.6, 0.32, 40.6, 0, 13.02, 0, steel, "MobileLauncherDeck");
    for (const [sx, sz, w, d] of [[0, 20.2, 48.4, 0.3], [0, -20.2, 48.4, 0.3], [24.2, 0, 0.3, 40.4], [-24.2, 0, 0.3, 40.4]]) {
      B(w, 1.2, d, sx, 13.7, sz, yellow, "MLPRailing");
    }
    // Launch mount table + hold-down clamps.
    B(24, 1.1, 24, 0, 13.6, 0, darkSteel, "LaunchMountTable");
    for (const [sx, sz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
      B(1.8, 2.4, 1.8, sx, 15.0, sz, steel, "HoldDownClamp");
    }

    // Stacked launch vehicle mock-up (SLS-class: core stage, upper stage,
    // Orion capsule, twin solid rocket boosters) resting on the launcher.
    const stackMat = m("white");
    const stackBand = m("yellow");
    CY(4.2, 46, 0, 37.2, 0, stackMat, 16, "Pad39B_CoreStage");
    for (const by of [22, 42, 54]) {
      CY(4.28, 1.0, 0, by, 0, stackMat, 16, "Pad39B_CoreBand");
    }
    // Orange NASA-style core stage accent bands.
    for (const by of [30.5, 48.5]) {
      CY(4.26, 1.3, 0, by, 0, m("orange"), 16, "Pad39B_CoreAccent");
    }
    CY(3.1, 8, 0, 64.2, 0, stackMat, 16, "Pad39B_UpperStage");
    CO(2.0, 3.1, 4.2, 0, 70.3, 0, stackMat, 16, "Pad39B_Adapter");
    CY(2.35, 4.4, 0, 77.2, 0, stackMat, 16, "Pad39B_CrewModule");
    CO(0.3, 2.35, 2.2, 0, 80.5, 0, stackMat, 16, "Pad39B_LaunchEscape");
    CO(0.05, 0.28, 5.0, 0, 84.1, 0, stackBand, 8, "Pad39B_LaunchAbortTower");
    for (const sx of [-6.6, 6.6]) {
      CY(1.95, 50, sx, 39.2, 0, stackMat, 14, "Pad39B_SRB");
      for (const by of [26, 40, 54]) {
        CY(1.99, 2.2, sx, by, 0, m("orange"), 14, "Pad39B_SRBStripes");
      }
      CO(0.5, 1.95, 3.2, sx, 65.8, 0, stackMat, 14, "Pad39B_SRBNose");
    }
    // Core stage exhaust nozzles tucked into the launch mount table.
    for (const sx of [-1.9, 0, 1.9]) {
      CO(0.7, 1.1, 1.8, sx, 14.0, 0, m("engine"), 10, "Pad39B_EngineBell");
    }

    // Core-stage raceway / cable tray and interstage ring.
    B(0.7, 38, 1.1, 0, 38, 4.25, darkSteel, "Pad39B_Raceway");
    CY(4.3, 1.5, 0, 60.2, 0, darkSteel, 16, "Pad39B_Interstage");
    // Solid rocket booster attach struts.
    for (const sx of [-6.6, 6.6]) {
      for (const sy of [24, 38, 52]) {
        B(1.1, 0.5, 1.1, sx * 0.82, sy, 0, steel, "Pad39B_SRBStrut");
      }
    }

    // Orion service module with four X-configuration solar array wings.
    CY(2.45, 2.5, 0, 73.6, 0, m("silver"), 16, "Pad39B_ServiceModule");
    for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
      const wingLen = 7.4;
      site.boxRot(
        g,
        wingLen,
        0.1,
        1.5,
        wx(Math.cos(a) * wingLen * 0.5, Math.sin(a) * wingLen * 0.5),
        73.6,
        wz(Math.cos(a) * wingLen * 0.5, Math.sin(a) * wingLen * 0.5),
        0,
        ROT - a,
        0,
        m("nasa_blue"),
        "Pad39B_SolarWing"
      );
    }
    // Orion windows and docking hatch.
    for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      B(0.42, 0.34, 0.16, Math.cos(a) * 2.3, 78.6, Math.sin(a) * 2.3, m("black"), "Pad39B_CMWindow");
    }
    B(0.9, 0.9, 0.2, 0, 79.4, 0, darkSteel, "Pad39B_DockingHatch");

    // Launch abort system lattice and jettison motor.
    for (const a of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      site.beam(
        g,
        wx(Math.cos(a) * 1.4, Math.sin(a) * 1.4), 79.6, wz(Math.cos(a) * 1.4, Math.sin(a) * 1.4),
        wx(Math.cos(a) * 0.24, Math.sin(a) * 0.24), 86.6, wz(Math.cos(a) * 0.24, Math.sin(a) * 0.24),
        0.12, steel, "Pad39B_LASStrut"
      );
    }
    for (const ay of [81.5, 83.5, 85.5]) {
      const ringMesh = site.cyl(g, Math.max(0.3, 1.4 - (ay - 81.5) * 0.35), 0.12, wx(0, 0), ay, wz(0, 0), steel, 8, "Pad39B_LASRing");
      ringMesh.rotation.x = 0;
    }

    // "USA" core-stage decal and NASA body-side marking.
    site.canvasPlane(
      g, 5.4, 2.7,
      wx(4.36, 0), 56, wz(4.36, 0),
      0, ROT + Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#d1252b";
        ctx.font = "900 150px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("USA", w * 0.5, h * 0.54);
      },
      512, 256,
      { unlit: true, transparent: true, name: "Pad39B_USADecal" }
    );
    site.canvasPlane(
      g, 4.6, 2.3,
      wx(-4.36, 0), 56, wz(-4.36, 0),
      0, ROT - Math.PI / 2, 0,
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#0b3d91";
        ctx.beginPath();
        ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 54px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("NASA", w * 0.5, h * 0.5);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.5, w * 0.32, h * 0.24, -0.35, 0, Math.PI * 2);
        ctx.stroke();
      },
      512, 256,
      { unlit: true, transparent: true, name: "Pad39B_NASAWormDecal" }
    );

    // -------------------------------------------------------------------------
    // CRAWLER TRANSPORTER CT-2 (parked on the 39B crawlerway spur)
    // Four double-track truck assemblies, hydraulic jacking cylinders, twin
    // operator cabs, exhaust stacks, deck railings and service ladders.
    // -------------------------------------------------------------------------
    const crawler = new THREE.Group();
    crawler.position.set(wx(71, 143), 0.12, wz(71, 143));
    // Long axis aligned with the crawlerway spur (north-south).
    crawler.rotation.y = Math.PI / 2;
    g.add(crawler);

    // Chassis frame and main deck.
    for (const sx of [-11, 11]) {
      site.box(crawler, 2.8, 2.4, 20, sx, 3.4, 0, steel, "Pad39B_CrawlerSideBeam");
    }
    for (const cz of [-8, 8]) {
      site.box(crawler, 22, 1.8, 2.6, 0, 3.4, cz, towerMat, "Pad39B_CrawlerCrossBeam");
    }
    site.box(crawler, 28, 0.7, 20.5, 0, 5.1, 0, steel, "Pad39B_CrawlerDeck");
    site.box(crawler, 30, 0.5, 22, 0, 5.9, 0, towerMat, "Pad39B_CrawlerDeckPlate");
    // Deck grating strips.
    for (let gx = -12; gx <= 12; gx += 4) {
      site.box(crawler, 0.35, 0.06, 20.4, gx, 6.17, 0, m("concrete_dark"), "Pad39B_CrawlerGrating");
    }
    // Deck perimeter safety railing.
    for (const [sx, sz, w, d] of [[0, 10.8, 30, 0.1], [0, -10.8, 30, 0.1], [14.9, 0, 0.1, 21.6], [-14.9, 0, 0.1, 21.6]]) {
      site.box(crawler, w, 0.1, d, sx, 7.3, sz, yellow, "Pad39B_CrawlerDeckRail");
      site.box(crawler, w, 0.1, d, sx, 6.8, sz, yellow, "Pad39B_CrawlerDeckRail");
    }
    for (let px = -14; px <= 14; px += 4.66) {
      for (const pz of [-10.8, 10.8]) {
        site.box(crawler, 0.12, 1.3, 0.12, px, 6.85, pz, yellow, "Pad39B_CrawlerDeckPost");
      }
    }

    // Four double-track truck assemblies (track skirts with visible bogies).
    for (const [tx, tz] of [[-11, -7.5], [11, -7.5], [-11, 7.5], [11, 7.5]]) {
      site.box(crawler, 6.4, 1.3, 9.9, tx, 2.65, tz, steel, "Pad39B_CrawlerTruckFrame");
      for (const side of [-1, 1]) {
        site.box(crawler, 3.0, 1.5, 9.4, tx + side * 1.6, 1.05, tz, m("black"), "Pad39B_CrawlerTrackSkirt");
        for (const wz of [-3.6, -1.8, 0, 1.8, 3.6]) {
          const bogie = site.cyl(crawler, 0.66, 3.1, tx + side * 1.6, 0.72, tz + wz, steel, 10, "Pad39B_CrawlerBogie");
          bogie.rotation.z = Math.PI / 2;
        }
        // Track tension idler at the leading edge.
        const idler = site.cyl(crawler, 0.82, 3.0, tx + side * 1.6, 1.75, tz - 4.75, m("steel_grey"), 10, "Pad39B_CrawlerIdler");
        idler.rotation.z = Math.PI / 2;
      }
      // Corner jacking cylinder between the truck and the deck.
      site.cyl(crawler, 0.85, 2.2, tx, 3.95, tz, m("silver"), 10, "Pad39B_CrawlerJackBody");
      site.cyl(crawler, 0.45, 1.9, tx, 4.85, tz, steel, 8, "Pad39B_CrawlerJackPiston");
    }

    // Twin operator cabs (front-left, rear-right) with glass and beacons.
    for (const [cabX, cabZ, cabYaw] of [[-9.5, 8.6, 0], [9.5, -8.6, Math.PI]]) {
      site.box(crawler, 5.4, 3.1, 4.4, cabX, 7.9, cabZ, m("steel_white"), "Pad39B_CrawlerCab");
      site.box(crawler, 5.6, 0.3, 4.6, cabX, 9.6, cabZ, m("steel_grey"), "Pad39B_CrawlerCabRoof");
      site.box(crawler, 4.6, 1.0, 0.1, cabX, 8.5, cabZ + (cabYaw === 0 ? 2.25 : -2.25), m("glass"), "Pad39B_CrawlerCabGlass");
      site.box(crawler, 0.1, 1.0, 3.6, cabX + (cabYaw === 0 ? -2.75 : 2.75), 8.5, cabZ, m("glass"), "Pad39B_CrawlerCabWindow");
      site.sphere(crawler, 0.3, cabX, 9.85, cabZ, m("red"), 8, "Pad39B_CrawlerBeacon");
      for (const lx of [-1.6, 1.6]) {
        site.box(crawler, 0.55, 0.3, 0.12, cabX + lx, 7.3, cabZ + (cabYaw === 0 ? 2.28 : -2.28), m("lamp"), "Pad39B_CrawlerHeadlight");
      }
    }

    // Diesel exhaust stacks, fuel tanks and service ladder.
    for (const ex of [-4.5, 4.5]) {
      site.cyl(crawler, 0.45, 4.6, ex, 8.2, -9.4, m("black"), 8, "Pad39B_CrawlerExhaust");
      site.cyl(crawler, 0.52, 0.5, ex, 10.6, -9.4, m("steel_grey"), 8, "Pad39B_CrawlerExhaustCap");
    }
    for (const fx of [-5, 5]) {
      const tank = site.cyl(crawler, 1.2, 5.4, fx, 3.9, 8.6, m("silver"), 12, "Pad39B_CrawlerFuelTank");
      tank.rotation.z = Math.PI / 2;
    }
    for (let ly = 0; ly < 6; ly++) {
      site.box(crawler, 1.3, 0.14, 0.5, 12.2, 1.2 + ly * 1.0, -6.5, yellow, "Pad39B_CrawlerLadderRung");
    }
    for (const lz of [-7.0, -6.0]) {
      site.box(crawler, 0.12, 6.2, 0.12, 12.8, 3.1, lz, yellow, "Pad39B_CrawlerLadderRail");
    }
    site.label(g, "CRAWLER CT-2", wx(71, 143), 12.4, wz(71, 143) - 11, {
      width: 9,
      height: 1.6,
      color: "#facc15",
      fontSize: 38
    });

    // -------------------------------------------------------------------------
    // 2b. FIXED SERVICE STRUCTURE — loaded from the reference GLB asset
    //     (assets/space-shuttle-launching-platform-fss.glb), which is the
    //     FSS-only extraction of space-shuttle-launching-platform-low-poly.glb.
    //     A lightweight procedural fallback is shown until the GLB resolves.
    // -------------------------------------------------------------------------
    const T = { x: -42, z: 0 };

    // GLB-based FSS — loaded asynchronously, positioned to match the pad frame.
    // The GLB origin sits at the launch-pad base; we offset so the tower base
    // lands on the hardstand deck (world Y ≈ 6.45) in front of the MLP.
    const _loadFSS39BGLB = () => {
      if (!window.glbManager) return;
      const fssUrl = "assets/space-shuttle-launching-platform-fss.glb";
      window.glbManager.loadGLB(fssUrl).then(() => {
        try {
          const fssMesh = window.glbManager.instantiateModel(fssUrl, { scale: 1.0 });
          if (fssMesh && g) {
            fssMesh.name = "Pad39B_FSS_GLB";
            // Place the GLB root in world space: pad centre + local offset
            // rotated by the pad bearing (ROT ≈ -0.46 rad, ~26° CCW).
            // The model's internal origin is at the pad corner; shift it so
            // the FSS tower aligns with T = { x:-42, z:0 } in pad-local space.
            const fssWorldX = wx(T.x, T.z);
            const fssWorldZ = wz(T.x, T.z);
            fssMesh.position.set(fssWorldX, 6.45, fssWorldZ);
            fssMesh.rotation.y = ROT;
            fssMesh.traverse((obj) => {
              if (obj.isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;
              }
            });
            g.add(fssMesh);
            // Hide the procedural fallback once GLB is live.
            const fallback = g.getObjectByName("Pad39B_FSS_Fallback");
            if (fallback) fallback.visible = false;
          }
        } catch (e) {
          console.warn("[SpaceCenter] 39B FSS GLB instantiate error:", e);
        }
      }).catch((e) => {
        console.warn("[SpaceCenter] 39B FSS GLB load error:", e);
      });
    };
    _loadFSS39BGLB();

    // ── Procedural fallback (shown immediately; hidden after GLB loads) ────────
    // Simple white steel box-truss tower matching the GLB silhouette so the pad
    // looks correct on slow connections or if the GLB fails to parse.
    const fssWhite = new THREE.MeshStandardMaterial({ color: 0xe8eaec, roughness: 0.55, metalness: 0.25 });
    const fssDark  = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.6,  metalness: 0.4  });
    const fssGrey  = new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.65, metalness: 0.3  });

    const towerH = 92;
    const halfT  = 17;
    const fss = new THREE.Group();
    fss.name = "Pad39B_FSS_Fallback";
    fss.position.set(wx(T.x, T.z), 6.45, wz(T.x, T.z));
    fss.rotation.y = ROT;
    g.add(fss);

    // Four corner columns and ring beams.
    for (const [ax, az] of [[-halfT, -halfT], [halfT, -halfT], [-halfT, halfT], [halfT, halfT]]) {
      site.box(fss, 1.1, towerH, 1.1, ax, towerH * 0.5, az, fssWhite, "FSS_Column");
    }
    const bays = 7;
    const bayH = towerH / bays;
    for (let lvl = 0; lvl <= bays; lvl++) {
      const y = lvl * bayH;
      site.box(fss, halfT * 2, 0.45, 0.45, 0, y, -halfT, fssWhite, "FSS_Ring");
      site.box(fss, halfT * 2, 0.45, 0.45, 0, y,  halfT, fssWhite, "FSS_Ring");
      site.box(fss, 0.45, 0.45, halfT * 2, -halfT, y, 0, fssWhite, "FSS_Ring");
      site.box(fss, 0.45, 0.45, halfT * 2,  halfT, y, 0, fssWhite, "FSS_Ring");
    }
    // X-bracing across every bay on all four faces.
    const faceSpan = Math.hypot(halfT * 2, bayH);
    for (let lvl = 0; lvl < bays; lvl++) {
      const yMid   = lvl * bayH + bayH * 0.5;
      const angleZ  = Math.atan2(bayH, halfT * 2);
      for (const zFace of [-halfT, halfT]) {
        const b1 = site.box(fss, faceSpan, 0.3, 0.3, 0, yMid, zFace, fssWhite, "FSS_Brace");
        b1.rotation.z = angleZ;
        const b2 = site.box(fss, faceSpan, 0.3, 0.3, 0, yMid, zFace, fssWhite, "FSS_Brace");
        b2.rotation.z = -angleZ;
      }
      for (const xFace of [-halfT, halfT]) {
        const b1 = site.box(fss, 0.3, 0.3, faceSpan, xFace, yMid, 0, fssWhite, "FSS_Brace");
        b1.rotation.x = angleZ;
        const b2 = site.box(fss, 0.3, 0.3, faceSpan, xFace, yMid, 0, fssWhite, "FSS_Brace");
        b2.rotation.x = -angleZ;
      }
    }

    // Large overhanging work platforms with perimeter railings.
    const platformDefs = [
      { y: 34, size: 38 },
      { y: 58, size: 42 },
      { y: 80, size: 38 },
      { y: 92, size: 46 }
    ];
    for (const p of platformDefs) {
      site.box(fss, p.size, 0.7, p.size, 0, p.y, 0, fssWhite, "FSS_Platform");
      const halfP = p.size * 0.5;
      const railY = p.y + 1.75;
      site.box(fss, p.size, 0.1, 0.1, 0, railY, -halfP, fssDark, "FSS_PlatformRail");
      site.box(fss, p.size, 0.1, 0.1, 0, railY,  halfP, fssDark, "FSS_PlatformRail");
      site.box(fss, 0.1, 0.1, p.size, -halfP, railY, 0, fssDark, "FSS_PlatformRail");
      site.box(fss, 0.1, 0.1, p.size,  halfP, railY, 0, fssDark, "FSS_PlatformRail");
      site.box(fss, p.size, 0.06, 0.06, 0, p.y + 1.05, -halfP, fssDark, "FSS_PlatformRail");
      site.box(fss, p.size, 0.06, 0.06, 0, p.y + 1.05,  halfP, fssDark, "FSS_PlatformRail");
      site.box(fss, 0.06, 0.06, p.size, -halfP, p.y + 1.05, 0, fssDark, "FSS_PlatformRail");
      site.box(fss, 0.06, 0.06, p.size,  halfP, p.y + 1.05, 0, fssDark, "FSS_PlatformRail");
      for (const cornerX of [-halfP, halfP]) {
        for (const cornerZ of [-halfP, halfP]) {
          site.box(fss, 0.12, 1.4, 0.12, cornerX, p.y + 1.05, cornerZ, fssDark, "FSS_RailPost");
        }
      }
      for (let i = 1; i < 6; i++) {
        const t = (i / 6) * p.size - halfP;
        site.box(fss, 0.1, 1.35, 0.1,  t,     p.y + 1.05, -halfP, fssDark, "FSS_RailPost");
        site.box(fss, 0.1, 1.35, 0.1,  t,     p.y + 1.05,  halfP, fssDark, "FSS_RailPost");
        site.box(fss, 0.1, 1.35, 0.1, -halfP, p.y + 1.05,  t,     fssDark, "FSS_RailPost");
        site.box(fss, 0.1, 1.35, 0.1,  halfP, p.y + 1.05,  t,     fssDark, "FSS_RailPost");
      }
    }

    // Equipment containers on the 58 m deck (ribbed grey boxes in the reference).
    for (const [ex, ez] of [[-8, 7], [8, 7]]) {
      site.box(fss, 12, 5.2, 7, ex, 58.35 + 2.6, ez, fssGrey, "FSS_EquipmentContainer");
      for (let rib = -4; rib <= 4; rib++) {
        site.box(fss, 0.32, 5.25, 7.05, ex + rib * 1.3, 58.35 + 2.6, ez, fssDark, "FSS_ContainerRib");
      }
      site.box(fss, 12.2, 0.3, 7.2, ex, 58.35 + 5.2, ez, fssDark, "FSS_ContainerLid");
    }

    // Black equipment cab on the top deck.
    site.box(fss, 10, 3.8, 7, 3, 92.35 + 1.9, -3, fssDark, "FSS_TopCab");
    site.box(fss, 9.2, 0.9, 6.2, 3, 92.35 + 4.1, -3, fssGrey, "FSS_TopCabRoof");

    // Separate lattice crane mast beside the tower.
    const craneBase = { x: -32, z: 34 };
    const crane = new THREE.Group();
    crane.name = "Pad39B_CraneMast";
    crane.position.set(wx(craneBase.x, craneBase.z), 6.45, wz(craneBase.x, craneBase.z));
    crane.rotation.y = ROT;
    g.add(crane);
    const mastH = 104;
    const halfM = 5;
    for (const [mx, mz] of [[-halfM, -halfM], [halfM, -halfM], [-halfM, halfM], [halfM, halfM]]) {
      site.box(crane, 0.8, mastH, 0.8, mx, mastH * 0.5, mz, fssWhite, "FSS_CraneLeg");
    }
    for (let y = 0; y <= mastH; y += 10) {
      site.box(crane, halfM * 2, 0.35, 0.35, 0, y, -halfM, fssWhite, "FSS_CraneRing");
      site.box(crane, halfM * 2, 0.35, 0.35, 0, y, halfM, fssWhite, "FSS_CraneRing");
      site.box(crane, 0.35, 0.35, halfM * 2, -halfM, y, 0, fssWhite, "FSS_CraneRing");
      site.box(crane, 0.35, 0.35, halfM * 2, halfM, y, 0, fssWhite, "FSS_CraneRing");
    }
    site.box(crane, 13, 0.5, 13, 0, mastH, 0, fssWhite, "FSS_CranePlatform");
    site.box(crane, 13, 0.1, 0.1, 0, mastH + 1.5, -6.5, fssDark, "FSS_CraneRail");
    site.box(crane, 13, 0.1, 0.1, 0, mastH + 1.5, 6.5, fssDark, "FSS_CraneRail");
    site.box(crane, 0.1, 0.1, 13, -6.5, mastH + 1.5, 0, fssDark, "FSS_CraneRail");
    site.box(crane, 0.1, 0.1, 13, 6.5, mastH + 1.5, 0, fssDark, "FSS_CraneRail");
    site.box(crane, 24, 0.9, 1.6, 6, mastH + 2.2, 0, fssWhite, "FSS_CraneJib");
    site.box(crane, 3.2, 2.8, 3.2, 3, mastH + 1.2, 0, fssGrey, "FSS_CraneCab");
    site.box(crane, 0.06, 14, 0.06, 16, mastH - 5, 0, fssDark, "FSS_CraneCable");
    site.box(crane, 1.4, 1.6, 1.0, 16, mastH - 12, 0, fssGrey, "FSS_CraneHook");
    site.sphere(crane, 0.4, 0, mastH + 2.8, 0, m("red"), 8, "FSS_CraneBeacon");

    // -------------------------------------------------------------------------
    // 3. LIGHTNING PROTECTION MASTS & CATENARY WIRES
    // -------------------------------------------------------------------------
    const masts = [
      { x: -58, z: -54 },
      { x: 50, z: -60 },
      { x: -6, z: 66 }
    ];
    const anchors = [
      { x: -92, z: -74 },
      { x: 76, z: -80 },
      { x: -12, z: 94 }
    ];
    const mastHeight = 108;
    masts.forEach((p, idx) => {
      CY(2.4, 0.9, p.x, 0.45, p.z, concreteDark, 10, "Pad39BMastFooting");
      // Segmented white mast with orange aviation bands.
      CY(1.25, 12, p.x, 6, p.z, white, 10, "Pad39BMastSegment");
      for (let s = 0; s < 8; s++) {
        const y = 14 + s * 11.5;
        const r = 1.2 - (s / 8) * 0.85;
        CY(r, 11.5, p.x, y, p.z, white, 10, "Pad39BMastSegment");
        CY(r + 0.04, 3.6, p.x, y + 3.3, p.z, orange, 10, "Pad39BMastWarnBand");
      }
      CO(0.06, 0.3, 12, p.x, mastHeight, p.z, steel, 8, "Pad39BMastFinial");
      SP(0.5, p.x, mastHeight + 6.8, p.z, m("red"), 8, "Pad39BMastBeacon");

      const anc = anchors[idx];
      B(2.6, 1.5, 2.6, anc.x, 0.75, anc.z, concreteDark, "Pad39BGuyAnchor");
      beamW(p.x, mastHeight, p.z, anc.x, 1.4, anc.z, 0.14, steel, "Pad39BGuyWire");
    });
    beamW(masts[0].x, mastHeight + 1.5, masts[0].z, masts[1].x, mastHeight + 1.5, masts[1].z, 0.15, steel, "Pad39BCatenary");
    beamW(masts[0].x, mastHeight + 1.5, masts[0].z, masts[2].x, mastHeight + 1.5, masts[2].z, 0.15, steel, "Pad39BCatenary");
    beamW(masts[1].x, mastHeight + 1.5, masts[1].z, masts[2].x, mastHeight + 1.5, masts[2].z, 0.15, steel, "Pad39BCatenary");

    // -------------------------------------------------------------------------
    // 4. ELEVATED DELUGE WATER TOWER & PUMP HOUSE
    // -------------------------------------------------------------------------
    const wt = { x: 92, z: -28 };
    CY(9.6, 0.4, wt.x, 0.2, wt.z, concreteDark, 20, "Pad39BWaterPad");
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const lx = wt.x + Math.cos(a) * 6.6;
      const lz = wt.z + Math.sin(a) * 6.6;
      const topX = wt.x + Math.cos(a) * 5.4;
      const topZ = wt.z + Math.sin(a) * 5.4;
      beamW(lx, 0.4, lz, topX, 33, topZ, 0.62, steel, "Pad39BWaterLeg");
      const nextA = ((i + 1) / 6) * Math.PI * 2;
      beamW(lx, 16, lz, wt.x + Math.cos(nextA) * 6.0, 16, wt.z + Math.sin(nextA) * 6.0, 0.32, steel, "Pad39BWaterBrace");
    }
    CY(1.3, 34, wt.x, 17, wt.z, white, 14, "Pad39BWaterRiser");
    CO(7.8, 1.7, 5.4, wt.x, 35.7, wt.z, white, 24, "Pad39BWaterBowl");
    CY(7.8, 10, wt.x, 43.4, wt.z, white, 24, "Pad39BWaterTank");
    CY(7.9, 1.5, wt.x, 43.4, wt.z, orange, 24, "Pad39BWaterBand");
    CO(0.5, 8.0, 3.8, wt.x, 50.2, wt.z, white, 24, "Pad39BWaterRoof");
    SP(0.42, wt.x, 52.5, wt.z, m("red"), 8, "Pad39BWaterBeacon");
    site.label(g, "WATER TANK 39B", wx(wt.x, wt.z), 3.8, wz(wt.x, wt.z) - 13, { width: 10.5, height: 1.7, fontSize: 38 });

    // Deluge pump house and supply manifold.
    B(18, 5.4, 12, 66, 2.7, 24, concreteDark, "Pad39BPumpHouse");
    B(19, 0.5, 13, 66, 5.55, 24, steel, "Pad39BPumpRoof");
    B(4.6, 3.1, 0.22, 62, 1.75, 30.1, m("glass"), "Pad39BPumpDoor");
    B(0.8, 0.8, 28, 54, 1.3, 22, steel, "Pad39BDelugeHeader");

    // -------------------------------------------------------------------------
    // 5. CRYOGENIC PROPELLANT FARM (LOX & LH2 SPHERES)
    // -------------------------------------------------------------------------
    const farm = { x: 62, z: 50 };
    B(74, 0.2, 44, farm.x, 0.1, farm.z, concreteDark, "Pad39BPropellantApron");
    B(74, 1.3, 1.0, farm.x, 0.85, farm.z - 21.5, concrete, "Pad39BBermN");
    B(74, 1.3, 1.0, farm.x, 0.85, farm.z + 21.5, concrete, "Pad39BBermS");
    B(1.0, 1.3, 42, farm.x - 36.5, 0.85, farm.z, concrete, "Pad39BBermW");
    B(1.0, 1.3, 42, farm.x + 36.5, 0.85, farm.z, concrete, "Pad39BBermE");
    [[-17, "LOX", m("nasa_blue")], [17, "LH2", yellow]].forEach(([dx, tag, stripe]) => {
      const sx = farm.x + dx;
      CY(9.6, 0.4, sx, 0.4, farm.z, curb, 20, "Pad39BSpherePad");
      SP(7.9, sx, 10.6, farm.z, white, 24, tag === "LOX" ? "Pad39BLOXSphere" : "Pad39BLH2Sphere");
      CY(7.96, 1.0, sx, 10.6, farm.z, stripe, 24, "Pad39BSphereStripe");
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        CY(0.44, 10.6, sx + Math.cos(a) * 6.9, 5.5, farm.z + Math.sin(a) * 6.9, steel, 8, "Pad39BSphereLeg");
      }
      site.label(g, tag === "LOX" ? "LOX" : "LH2", wx(sx, farm.z), 11.2, wz(sx, farm.z) - 8.6, {
        width: 7,
        height: 1.5,
        color: "#ffd633",
        fontSize: 46
      });
    });
    // GN2 tube rack and insulated cryo transfer lines toward the pad.
    for (let i = 0; i < 4; i++) {
      const tube = site.cyl(g, 0.55, 12, wx(farm.x + 30, farm.z - 8 + i * 2.2), 1.5 + (i % 2) * 1.1, wz(farm.x + 30, farm.z - 8 + i * 2.2), yellow, 10, "Pad39BGN2Tube");
      tube.rotation.z = Math.PI / 2;
      tube.rotation.y = ROT;
    }
    beamW(farm.x + 8, 1.5, farm.z - 20, 30, 1.5, 18, 0.5, white, "Pad39BCryoTransferPipe");
    site.signBoard(
      g,
      wx(farm.x - 12, farm.z - 22),
      1.6,
      wz(farm.x - 12, farm.z - 22),
      Math.PI + ROT,
      5.4,
      1.4,
      (ctx, w, h) => {
        ctx.fillStyle = "#b91c1c";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 6;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 40px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("DANGER · SUPER-COLD FUEL", w * 0.5, h * 0.45);
        ctx.font = "700 26px Arial, Helvetica, sans-serif";
        ctx.fillText("PAD 39B ROCKET FUEL TANKS", w * 0.5, h * 0.78);
      },
      "Pad39BPropellantSign"
    );

    // -------------------------------------------------------------------------
    // 6. SERVICE ROAD, GATEHOUSE, GSE & PERIMETER LIGHTING
    // -------------------------------------------------------------------------
    // Duplicate the road helper locally so 39B is self-contained.
    const addRoad = (ax, az, bx, bz, width = 12, noCurbs = false) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) return;
      const mx = (ax + bx) * 0.5;
      const mz = (az + bz) * 0.5;
      const yaw = Math.atan2(bx - ax, bz - az);
      site.boxRot(g, width, 0.12, len, mx, 0.06, mz, 0, yaw, 0, asphalt, "Pad39BRoad");
      if (!noCurbs) {
        for (const side of [-1, 1]) {
          site.boxRot(g, 0.32, 0.22, len - 0.6, mx + Math.cos(yaw) * side * (width * 0.5 + 0.16), 0.11, mz - Math.sin(yaw) * side * (width * 0.5 + 0.16), 0, yaw, 0, curb, "Pad39BRoadCurb");
        }
      }
    };
    // Spur-to-ramp connector so the crawlerway lines up smoothly with the ramp toe.
    addRoad(-120, -622, wx(0, 130), wz(0, 130), 22, true);
    addRoad(wx(46, 196), wz(46, 196), wx(46, 112), wz(46, 112), 11);
    addRoad(wx(46, 112), wz(46, 112), wx(58, 44), wz(58, 44), 11);
    addRoad(wx(58, 44), wz(58, 44), wx(80, -6), wz(80, -6), 10);
    // Small hardstand parking apron for GSE.
    B(30, 0.14, 20, 64, 0.07, -8, asphalt, "Pad39BApron");

    // Gatehouse / guard kiosk at the service road entrance.
    B(7, 3.4, 4.8, 58, 1.7, 168, concreteDark, "Pad39BKioskBody");
    B(9, 0.4, 6.6, 58, 3.6, 168, white, "Pad39BKioskCanopy");
    B(7.1, 1.2, 4.9, 58, 2.1, 168, m("glass"), "Pad39BKioskGlass");
    for (let i = 0; i < 5; i++) {
      if (i === 2) continue;
      B(5.4, 1.0, 0.7, 52 + i * 6.2, 0.5, 176, curb, "Pad39BJerseyBarrier");
    }

    // Ground support fleet.
    site.vehicle(g, wx(52, 34), wz(52, 34), ROT - 0.5, "yellow", "truck", 0.14);
    site.vehicle(g, wx(66, 12), wz(66, 12), ROT + 0.4, "steel_white", "van", 0.14);
    site.vehicle(g, wx(44, 120), wz(44, 120), ROT + Math.PI, "red", "truck", 0.14);

    // Floodlight poles around the perimeter.
    [[-74, -40, 16, false], [58, -64, 16, true], [-40, 74, 14, false], [96, 44, 14, true], [46, 168, 12, false]].forEach(([lx, lz, h, dual]) => {
      site.lightPole(g, wx(lx, lz), wz(lx, lz), ROT, h, dual, 0.1);
    });

    // Flagpole and LC-39B entrance sign.
    site.flagPole(g, wx(44, 178), wz(44, 178), 20, "nasa");
    site.signBoard(
      g,
      wx(52, 184),
      2.4,
      wz(52, 184),
      ROT + Math.PI,
      9,
      2.4,
      (ctx, w, h) => {
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 8;
        ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.fillStyle = "#facc15";
        ctx.font = "900 44px Arial, Helvetica, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("LC-39B", w * 0.5, h * 0.4);
        ctx.fillStyle = "#e5e7eb";
        ctx.font = "700 24px Arial, Helvetica, sans-serif";
        ctx.fillText("KENNEDY SPACE CENTER · NASA", w * 0.5, h * 0.68);
        ctx.font = "600 19px Arial, Helvetica, sans-serif";
        ctx.fillText("AUTHORIZED PERSONNEL ONLY", w * 0.5, h * 0.86);
      },
      "Pad39BEntranceSign"
    );

    // Landscaping along the approach road.
    for (let i = 0; i < 9; i++) {
      const pz = 142 + Math.floor(i / 3) * 16;
      site.palmTree(g, wx(30 + (i % 3) * 7, pz), wz(30 + (i % 3) * 7, pz), 0.9 + (i % 4) * 0.08, i * 3, 0);
    }

    // -------------------------------------------------------------------------
    // 7. COLLISION VOLUMES
    //    Ground facilities use standard ground colliders; the 39B hardstand berm,
    //    ramp, and summit deck use elevation-aware collision in SpaceCenterModules.terrain.
    // -------------------------------------------------------------------------
    const groundOnly = { maxY: 5.0 };
    // Crawler transporter and its parked footprint.
    site.addBoxCollider(wx(71, 143), wz(71, 143), 26, 38, "39B crawler transporter", groundOnly);
    // Lightning protection masts.
    for (const p of masts) {
      site.addCircleCollider(wx(p.x, p.z), wz(p.x, p.z), 3.2, "39B lightning mast", groundOnly);
    }
    // Deluge water tower and propellant farm hardware.
    site.addCircleCollider(wx(wt.x, wt.z), wz(wt.x, wt.z), 9.5, "39B water tower", groundOnly);
    site.addBoxCollider(wx(farm.x, farm.z), wz(farm.x, farm.z), 78, 48, "39B propellant farm", groundOnly);
    site.addCircleCollider(wx(farm.x - 17, farm.z), wz(farm.x - 17, farm.z), 8.8, "39B LOX sphere", groundOnly);
    site.addCircleCollider(wx(farm.x + 17, farm.z), wz(farm.x + 17, farm.z), 8.8, "39B LH2 sphere", groundOnly);
    // Service structures.
    site.addBoxCollider(wx(66, 24), wz(66, 24), 20, 14, "39B pump house", groundOnly);
    site.addBoxCollider(wx(58, 168), wz(58, 168), 9, 7, "39B gatehouse", groundOnly);
    site.addBoxCollider(wx(52, 184), wz(52, 184), 10, 4, "39B entrance sign", groundOnly);
    // Fixed service structure base (on the upper 39B hardstand deck).
    site.addBoxCollider(wx(T.x, T.z), wz(T.x, T.z), 15, 15, "39B fixed service structure", { minY: 4.5 });
  });
})(window);
