/*
 * artemis_game.js — client controller, 3D view and HUD for the 13-phase
 * Artemis II-inspired Crewed Lunar Flyby simulation.
 *
 * The server owns authoritative mission state; this module renders the 3D
 * scenes (Launch Complex 39B, SLS staging, Earth/HEO orbit, ICPS proximity
 * operations, cislunar figure-eight trajectory map, lunar far-side flyby,
 * atmospheric skip-entry plasma, 11-parachute deployment, Pacific splashdown,
 * and U.S. Navy helicopter/ship recovery) and binds all interactive controls.
 */
(function () {
  "use strict";
  const T = window.THREE;
  const SIM = window.ArtemisSim;
  const DEG = Math.PI / 180;
  const ESC = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d }) : "—";
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0;
  const fmtMET = (s) => {
    const neg = s < 0;
    const abs = Math.floor(Math.abs(s || 0));
    const body = `${String(Math.floor(abs / 86400)).padStart(2, "0")}:${String(Math.floor(abs / 3600) % 24).padStart(2, "0")}:${String(Math.floor(abs / 60) % 60).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
    return neg ? `T-${body}` : `T+${body}`;
  };

  class ArtemisView {
    constructor(renderer) {
      this.renderer = renderer;
      this.map = new T.Scene();
      this.local = new T.Scene();
      this.mapCam = new T.PerspectiveCamera(52, 1, 0.01, 8000);
      this.localCam = new T.PerspectiveCamera(58, 1, 0.05, 80000);
      this.mapCam.position.set(0, 90, 180);
      this.camOrbit = { yaw: 0.35, pitch: 0.32, radius: 140 };
      this.cameraMode = "auto"; // "auto" | "external" | "cockpit" | "map"
      this.dragging = false;
      this.lastPointer = null;
      this.trail = [];
      this.plannedCurveKey = null;
      this.sls = null;
      this.slsReady = false;
      this.slsParts = {};
      this.animTime = 0;

      this._buildMap();
      this._buildLocal();
      this._loadSLS();
      this._bindPointer();
    }

    setCameraMode(mode) {
      this.cameraMode = mode || "auto";
    }

    _buildMap() {
      const scene = this.map;
      scene.background = new T.Color(0x02060d);
      const starGeo = new T.BufferGeometry();
      const pos = new Float32Array(2200 * 3);
      let seed = 17;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 2200; i++) {
        const u = rnd() * 2 - 1;
        const th = rnd() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        pos[i * 3] = 1400 * s * Math.cos(th);
        pos[i * 3 + 1] = 1400 * u;
        pos[i * 3 + 2] = 1400 * s * Math.sin(th);
      }
      starGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
      scene.add(new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false })));

      const loader = new T.TextureLoader();
      const earth = new T.Mesh(
        new T.SphereGeometry(6.371, 64, 48),
        new T.MeshPhongMaterial({ map: loader.load("textures/earth/earth_day_4096.jpg"), emissive: new T.Color(0x061326), shininess: 10 })
      );
      earth.name = "MapEarth";
      scene.add(earth);
      this.earth = earth;

      const cloud = new T.Mesh(
        new T.SphereGeometry(6.39, 48, 36),
        new T.MeshLambertMaterial({ map: loader.load("textures/earth/earth_clouds_2048.png"), transparent: true, opacity: 0.4, depthWrite: false })
      );
      earth.add(cloud);
      this.cloud = cloud;

      const moon = new T.Mesh(
        new T.SphereGeometry(1.737, 48, 32),
        new T.MeshPhongMaterial({ map: loader.load("textures/planets/moon.jpg"), shininess: 2 })
      );
      moon.name = "MapMoon";
      scene.add(moon);
      this.moon = moon;

      // Moon orbital path ring
      const moonOrbitPts = [];
      for (let i = 0; i <= 128; i++) {
        const st = SIM.moonState((i / 128) * SIM.MOON_PERIOD);
        moonOrbitPts.push(new T.Vector3(st.r[0] / 1e6, st.r[2] / 1e6, -st.r[1] / 1e6));
      }
      const moonOrbitGeo = new T.BufferGeometry().setFromPoints(moonOrbitPts);
      scene.add(new T.Line(moonOrbitGeo, new T.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.55 })));

      // Planned figure-eight free-return trajectory line
      const planGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(1, 0, 0)]);
      this.plannedLine = new T.Line(planGeo, new T.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 }));
      scene.add(this.plannedLine);

      // Active spacecraft trail
      const trailGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(1, 0, 0)]);
      this.trailLine = new T.Line(trailGeo, new T.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95 }));
      scene.add(this.trailLine);

      scene.add(new T.AmbientLight(0x334455, 0.85));
      const sun = new T.DirectionalLight(0xfff4e0, 2.3);
      sun.position.set(60, 25, 40);
      scene.add(sun);

      this.orionMarker = this._marker(0xfbbf24, 3.2);
      scene.add(this.orionMarker);
      this.moonMarker = this._marker(0x67e8f9, 2.4);
      scene.add(this.moonMarker);
    }

    _marker(color, size) {
      const g = new T.Group();
      g.add(new T.Mesh(new T.SphereGeometry(size, 12, 10), new T.MeshBasicMaterial({ color })));
      const ring = new T.Mesh(
        new T.RingGeometry(size * 1.45, size * 2.1, 24),
        new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: T.DoubleSide })
      );
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      return g;
    }

    _buildLocal() {
      const scene = this.local;
      scene.background = new T.Color(0x02050b);

      // Starfield in local scene
      const starGeo = new T.BufferGeometry();
      const pos = new Float32Array(1600 * 3);
      let seed = 41;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 1600; i++) {
        const u = rnd() * 2 - 1;
        const th = rnd() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        pos[i * 3] = 28000 * s * Math.cos(th);
        pos[i * 3 + 1] = 28000 * u;
        pos[i * 3 + 2] = 28000 * s * Math.sin(th);
      }
      starGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
      this.localStars = new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false }));
      scene.add(this.localStars);

      scene.add(new T.AmbientLight(0x8fa8c8, 0.72));
      const hemi = new T.HemisphereLight(0xbcd8ff, 0x18202c, 0.95);
      scene.add(hemi);
      const sun = new T.DirectionalLight(0xfff5e4, 2.4);
      sun.position.set(120, 95, 110);
      scene.add(sun);
      this.localSun = sun;

      const loader = new T.TextureLoader();

      // Launch Complex 39B ground & pad group
      const ground = new T.Mesh(
        new T.PlaneGeometry(8000, 8000, 1, 1),
        new T.MeshStandardMaterial({ color: 0x1e2630, roughness: 0.95 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -2.2;
      scene.add(ground);
      this.launchGround = ground;

      const launch = new T.Group();
      launch.name = "LC39B";
      scene.add(launch);
      this.launchGroup = launch;

      // Flame trench & concrete pad deck
      const padBase = new T.Mesh(
        new T.BoxGeometry(58, 4.4, 58),
        new T.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.9 })
      );
      padBase.position.y = -2.2;
      launch.add(padBase);

      // Mobile Launcher tower & swing arms (LC-39B)
      const tower = new T.Group();
      tower.name = "MobileLauncherTower";
      for (let i = 0; i < 14; i++) {
        const seg = new T.Mesh(
          new T.BoxGeometry(8, 7.5, 8),
          new T.MeshStandardMaterial({ color: 0x64748b, metalness: 0.45, roughness: 0.55, wireframe: i % 2 === 1 })
        );
        seg.position.set(-16, 4 + i * 7.5, 0);
        tower.add(seg);
      }
      // Umbilical & White Room Crew Access Arm
      this.crewAccessArm = new T.Mesh(
        new T.BoxGeometry(15, 1.4, 2.2),
        new T.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4 })
      );
      this.crewAccessArm.position.set(-8.5, 82, 0);
      tower.add(this.crewAccessArm);

      // Lightning mast
      const mast = new T.Mesh(
        new T.CylinderGeometry(0.4, 0.9, 28, 8),
        new T.MeshStandardMaterial({ color: 0x94a3b8 })
      );
      mast.position.set(-16, 118, 0);
      tower.add(mast);
      launch.add(tower);
      this.padTower = tower;

      // Astrovan crew transport vehicle at LC-39B
      const van = new T.Group();
      const vanBody = new T.Mesh(
        new T.BoxGeometry(7.5, 2.6, 2.8),
        new T.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.6, roughness: 0.3 })
      );
      vanBody.position.y = 1.6;
      van.add(vanBody);
      const stripe = new T.Mesh(
        new T.BoxGeometry(7.6, 0.45, 2.86),
        new T.MeshBasicMaterial({ color: 0x1d4ed8 })
      );
      stripe.position.y = 1.65;
      van.add(stripe);
      van.position.set(42, 0, 28);
      launch.add(van);
      this.astrovan = van;

      // SLS Rocket Stack container (holds either GLB or multi-stage fallback)
      this.rocketGroup = new T.Group();
      this.rocketGroup.name = "SLSRocketStack";
      launch.add(this.rocketGroup);

      const fallback = this._buildMultiStageFallbackSLS();
      this.rocketGroup.add(fallback);
      this.sls = fallback;

      // Engine Plumes & ROFI Sparklers on SLS
      this.plumeGroup = this._buildLaunchPlumes();
      this.rocketGroup.add(this.plumeGroup);

      // Local Earth sphere (for Earth orbit, HEO, TLI, and Entry phases)
      this.localEarth = new T.Mesh(
        new T.SphereGeometry(600, 64, 48),
        new T.MeshPhongMaterial({ map: loader.load("textures/earth/earth_day_4096.jpg"), emissive: new T.Color(0x041022), shininess: 12 })
      );
      this.localEarth.position.set(0, -640, -180);
      this.localEarth.visible = false;
      scene.add(this.localEarth);

      // Local Moon sphere (for Phase 8 Lunar Far-Side Flyby)
      this.localMoon = new T.Mesh(
        new T.SphereGeometry(320, 64, 48),
        new T.MeshPhongMaterial({ map: loader.load("textures/planets/moon.jpg"), shininess: 2 })
      );
      this.localMoon.position.set(0, -350, -120);
      this.localMoon.visible = false;
      scene.add(this.localMoon);

      // Detailed Orion Spacecraft (Crew Module + European Service Module + 4 X-Wing Solar Arrays + Chutes + Airbags)
      this.orionCraft = this._buildOrionCraft();
      this.orionCraft.visible = false;
      scene.add(this.orionCraft);

      // Separated ICPS & Orion Stage Adapter target (for Phase 4 & Phase 5 Proximity Ops)
      this.icpsTarget = this._buildIcpsTarget();
      this.icpsTarget.visible = false;
      scene.add(this.icpsTarget);

      // Pacific Ocean & Recovery Scene (for Phases 11, 12, 13)
      this._buildRecoveryScene();
    }

    _buildMultiStageFallbackSLS() {
      const g = new T.Group();
      g.name = "FallbackSLS";

      const core = new T.Mesh(
        new T.CylinderGeometry(2.6, 2.6, 52, 24),
        new T.MeshStandardMaterial({ color: 0xd97732, roughness: 0.78 })
      );
      core.position.y = 28;
      core.name = "F_Core_Stage";
      g.add(core);

      const lvsa = new T.Mesh(
        new T.CylinderGeometry(1.85, 2.6, 5.5, 20),
        new T.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
      );
      lvsa.position.y = 56.7;
      lvsa.name = "E_Launch_Vehicle_Stage_Adapter";
      g.add(lvsa);

      const icps = new T.Mesh(
        new T.CylinderGeometry(1.8, 1.8, 8.5, 20),
        new T.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.25 })
      );
      icps.position.y = 63.7;
      icps.name = "C_Interim_Cryogenic_Propulsion_Stage";
      g.add(icps);

      const osa = new T.Mesh(
        new T.CylinderGeometry(1.8, 1.8, 2.2, 20),
        new T.MeshStandardMaterial({ color: 0x94a3b8 })
      );
      osa.position.y = 69.0;
      osa.name = "D_Orion_Stage_Adapter";
      g.add(osa);

      const orion = new T.Mesh(
        new T.ConeGeometry(2.1, 5.2, 20),
        new T.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.35 })
      );
      orion.position.y = 72.7;
      orion.name = "B_Orion_Spacecraft";
      g.add(orion);

      const las = new T.Mesh(
        new T.ConeGeometry(0.95, 11.5, 16),
        new T.MeshStandardMaterial({ color: 0xf8fafc })
      );
      las.position.y = 81.0;
      las.name = "A_Orion_Launch_Abort_System";
      g.add(las);

      const makeSrb = (x, name) => {
        const srbGroup = new T.Group();
        srbGroup.name = name;
        srbGroup.position.set(x, 24, 0);
        const body = new T.Mesh(
          new T.CylinderGeometry(1.22, 1.22, 42, 16),
          new T.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
        );
        srbGroup.add(body);
        const cone = new T.Mesh(
          new T.ConeGeometry(1.22, 4.8, 16),
          new T.MeshStandardMaterial({ color: 0xf8fafc })
        );
        cone.position.y = 23.4;
        srbGroup.add(cone);
        return srbGroup;
      };
      g.add(makeSrb(-4.2, "H_Solid_Rocket_Booster_Left"));
      g.add(makeSrb(4.2, "I_Solid_Rocket_Booster_Right"));

      this._indexSlsParts(g);
      return g;
    }

    _indexSlsParts(rootObj) {
      this.slsParts = {};
      rootObj.traverse((node) => {
        if (node && node.name && /^[A-I]_/.test(node.name)) {
          this.slsParts[node.name] = {
            node,
            basePos: node.position.clone(),
            baseRot: node.rotation.clone()
          };
        }
      });
    }

    _loadSLS() {
      if (!window.THREE || !window.THREE.GLTFLoader) return;
      const loader = new T.GLTFLoader();
      loader.load(
        "assets/artemis/sls_block1_orion_display.glb",
        (gltf) => {
          if (!gltf || !gltf.scene) return;
          const model = gltf.scene;
          const box = new T.Box3().setFromObject(model);
          const h = Math.max(0.001, box.max.y - box.min.y);
          const scale = 96 / h;
          model.scale.setScalar(scale);
          model.updateMatrixWorld(true);
          const b2 = new T.Box3().setFromObject(model);
          model.position.y -= b2.min.y;
          model.position.x = 0;
          model.position.z = 0;
          model.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          if (this.sls && this.sls.parent) this.sls.parent.remove(this.sls);
          this.sls = model;
          this.slsReady = true;
          this._indexSlsParts(model);
          this.rocketGroup.add(model);
        },
        undefined,
        () => { /* keep procedural fallback */ }
      );
    }

    _buildLaunchPlumes() {
      const g = new T.Group();
      // ROFI sparklers
      this.rofiGroup = new T.Group();
      for (let i = 0; i < 6; i++) {
        const spark = new T.Mesh(
          new T.SphereGeometry(0.55, 8, 8),
          new T.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 })
        );
        spark.position.set(Math.cos(i) * 2.5, 0.8, Math.sin(i) * 2.5);
        this.rofiGroup.add(spark);
      }
      g.add(this.rofiGroup);

      // RS-25 Core Plume (blue-white hydrolox cone)
      this.rs25Plume = new T.Mesh(
        new T.ConeGeometry(2.6, 22, 18, 1, true),
        new T.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.78, side: T.DoubleSide })
      );
      this.rs25Plume.position.y = -11;
      this.rs25Plume.rotation.x = Math.PI;
      g.add(this.rs25Plume);

      // Twin SRB Plumes (bright gold-orange solid propellant flames)
      this.srbPlumeL = new T.Mesh(
        new T.ConeGeometry(2.2, 34, 16),
        new T.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.9 })
      );
      this.srbPlumeL.position.set(-4.2, -17, 0);
      this.srbPlumeL.rotation.x = Math.PI;
      g.add(this.srbPlumeL);

      this.srbPlumeR = this.srbPlumeL.clone();
      this.srbPlumeR.position.set(4.2, -17, 0);
      g.add(this.srbPlumeR);

      return g;
    }

    _buildOrionCraft() {
      const root = new T.Group();
      root.name = "OrionSpacecraft";

      // Crew Module (CM)
      this.cmGroup = new T.Group();
      const cmCone = new T.Mesh(
        new T.CylinderGeometry(1.55, 2.51, 2.15, 28),
        new T.MeshStandardMaterial({ color: 0xdbe4ee, metalness: 0.45, roughness: 0.35 })
      );
      cmCone.position.y = 1.1;
      this.cmGroup.add(cmCone);

      // Forward docking tunnel & windows
      const tunnel = new T.Mesh(
        new T.CylinderGeometry(1.05, 1.5, 0.65, 24),
        new T.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5 })
      );
      tunnel.position.y = 2.45;
      this.cmGroup.add(tunnel);

      for (const x of [-0.65, 0.65]) {
        const win = new T.Mesh(
          new T.BoxGeometry(0.45, 0.28, 0.12),
          new T.MeshBasicMaterial({ color: 0x38bdf8 })
        );
        win.position.set(x, 1.55, 1.92);
        win.rotation.x = -0.52;
        this.cmGroup.add(win);
      }

      // 16.5-ft Avcoat Heat Shield
      this.heatShieldMesh = new T.Mesh(
        new T.CylinderGeometry(2.54, 2.52, 0.38, 28),
        new T.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85, emissive: new T.Color(0x000000) })
      );
      this.heatShieldMesh.position.y = -0.12;
      this.cmGroup.add(this.heatShieldMesh);

      // Re-entry Plasma Glow Shell
      this.plasmaShell = new T.Mesh(
        new T.SphereGeometry(3.45, 28, 20, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58),
        new T.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.0, side: T.DoubleSide })
      );
      this.plasmaShell.position.y = 0.25;
      this.cmGroup.add(this.plasmaShell);

      // 5 CM Upright System (CMUS) Orange Floatation Airbags (Phase 12 Splashdown)
      this.uprightBagsGroup = new T.Group();
      const bagPositions = [
        [0, 2.85, 0],
        [0.85, 2.65, 0.5],
        [-0.85, 2.65, 0.5],
        [0.75, 2.65, -0.6],
        [-0.75, 2.65, -0.6]
      ];
      for (const [bx, by, bz] of bagPositions) {
        const bag = new T.Mesh(
          new T.SphereGeometry(0.56, 14, 12),
          new T.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 })
        );
        bag.position.set(bx, by, bz);
        this.uprightBagsGroup.add(bag);
      }
      this.uprightBagsGroup.visible = false;
      this.cmGroup.add(this.uprightBagsGroup);

      root.add(this.cmGroup);

      // European Service Module (ESM) + 4 X-Wing Solar Arrays
      this.smGroup = new T.Group();
      const smBody = new T.Mesh(
        new T.CylinderGeometry(2.05, 2.05, 2.7, 24),
        new T.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6, roughness: 0.35 })
      );
      smBody.position.y = -1.65;
      this.smGroup.add(smBody);

      const radiator = new T.Mesh(
        new T.CylinderGeometry(2.08, 2.08, 1.8, 24, 1, true),
        new T.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.6 })
      );
      radiator.position.y = -1.65;
      this.smGroup.add(radiator);

      const aj10 = new T.Mesh(
        new T.ConeGeometry(0.68, 1.35, 18),
        new T.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 })
      );
      aj10.position.y = -3.45;
      aj10.rotation.x = Math.PI;
      this.smGroup.add(aj10);

      // 4 X-wing solar arrays
      this.solarWings = [];
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const pivot = new T.Group();
        pivot.position.set(Math.cos(angle) * 2.1, -1.6, Math.sin(angle) * 2.1);
        pivot.rotation.y = -angle;
        const wing = new T.Mesh(
          new T.BoxGeometry(7.2, 0.08, 1.55),
          new T.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.55, roughness: 0.25, emissive: new T.Color(0x0a1e4a) })
        );
        wing.position.x = 3.7;
        pivot.add(wing);
        this.smGroup.add(pivot);
        this.solarWings.push(pivot);
      }
      root.add(this.smGroup);

      // Drogue Parachutes (2 Drogues + 3 FBC)
      this.drogueChuteGroup = new T.Group();
      for (const x of [-2.8, 2.8]) {
        const canopy = new T.Mesh(
          new T.SphereGeometry(3.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          new T.MeshBasicMaterial({ color: 0xe2e8f0, side: T.DoubleSide, transparent: true, opacity: 0.85 })
        );
        canopy.position.set(x, 15, 0);
        this.drogueChuteGroup.add(canopy);
        const riser = new T.Mesh(
          new T.CylinderGeometry(0.03, 0.03, 13, 6),
          new T.MeshBasicMaterial({ color: 0xcbd5e1 })
        );
        riser.position.set(x * 0.5, 8.5, 0);
        riser.rotation.z = x * -0.08;
        this.drogueChuteGroup.add(riser);
      }
      this.drogueChuteGroup.visible = false;
      root.add(this.drogueChuteGroup);

      // 3 Main Parachutes (Phase 11)
      this.mainChuteGroup = new T.Group();
      const mainOffsets = [
        [-6.5, 22, -2.5],
        [6.5, 22, -2.5],
        [0, 23.5, 5.5]
      ];
      for (const [mx, my, mz] of mainOffsets) {
        const canopy = new T.Mesh(
          new T.SphereGeometry(6.8, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
          new T.MeshBasicMaterial({ color: 0xf97316, side: T.DoubleSide, transparent: true, opacity: 0.88 })
        );
        canopy.position.set(mx, my, mz);
        this.mainChuteGroup.add(canopy);

        const band = new T.Mesh(
          new T.RingGeometry(4.2, 6.2, 22),
          new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide })
        );
        band.rotation.x = Math.PI / 2;
        band.position.set(mx, my - 1.2, mz);
        this.mainChuteGroup.add(band);

        const line = new T.Mesh(
          new T.CylinderGeometry(0.035, 0.035, 20, 6),
          new T.MeshBasicMaterial({ color: 0xe2e8f0 })
        );
        line.position.set(mx * 0.45, 12, mz * 0.45);
        line.rotation.z = mx * -0.035;
        line.rotation.x = mz * 0.035;
        this.mainChuteGroup.add(line);
      }
      this.mainChuteGroup.visible = false;
      root.add(this.mainChuteGroup);

      return root;
    }

    _buildIcpsTarget() {
      const g = new T.Group();
      g.name = "ICPSTarget";
      const tank = new T.Mesh(
        new T.CylinderGeometry(2.5, 2.5, 11.5, 24),
        new T.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.35, roughness: 0.45 })
      );
      tank.rotation.x = Math.PI / 2;
      g.add(tank);

      const interstage = new T.Mesh(
        new T.CylinderGeometry(2.55, 2.55, 2.4, 24),
        new T.MeshStandardMaterial({ color: 0xd97732, roughness: 0.7 })
      );
      interstage.rotation.x = Math.PI / 2;
      interstage.position.z = 5.8;
      g.add(interstage);

      // Orion Stage Adapter & optical target bullseye facing Orion (+Z)
      const adapter = new T.Mesh(
        new T.CylinderGeometry(2.3, 2.5, 1.8, 24),
        new T.MeshStandardMaterial({ color: 0x64748b, metalness: 0.5 })
      );
      adapter.rotation.x = Math.PI / 2;
      adapter.position.z = 7.4;
      g.add(adapter);

      const targetRing = new T.Mesh(
        new T.RingGeometry(0.55, 0.95, 24),
        new T.MeshBasicMaterial({ color: 0x67e8f9, side: T.DoubleSide })
      );
      targetRing.position.z = 8.35;
      g.add(targetRing);

      const rl10 = new T.Mesh(
        new T.ConeGeometry(1.05, 2.6, 18),
        new T.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 })
      );
      rl10.rotation.x = -Math.PI / 2;
      rl10.position.z = -7.0;
      g.add(rl10);

      return g;
    }

    _buildRecoveryScene() {
      // Pacific Ocean water plane
      const ocean = new T.Mesh(
        new T.PlaneGeometry(3000, 3000, 36, 36),
        new T.MeshStandardMaterial({ color: 0x073b6b, roughness: 0.25, metalness: 0.2 })
      );
      ocean.rotation.x = -Math.PI / 2;
      ocean.position.y = -0.35;
      ocean.visible = false;
      this.local.add(ocean);
      this.ocean = ocean;

      // Inflatable "Front Porch" recovery raft alongside Orion
      this.frontPorchMesh = new T.Mesh(
        new T.TorusGeometry(3.4, 0.55, 14, 28),
        new T.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45 })
      );
      this.frontPorchMesh.rotation.x = Math.PI / 2;
      this.frontPorchMesh.position.set(0, 0.05, 0);
      this.frontPorchMesh.visible = false;
      this.local.add(this.frontPorchMesh);

      // U.S. Navy Amphibious Transport Dock Recovery Ship
      const ship = new T.Group();
      const hull = new T.Mesh(
        new T.BoxGeometry(26, 7.5, 92),
        new T.MeshStandardMaterial({ color: 0x475569, roughness: 0.6, metalness: 0.3 })
      );
      hull.position.y = 3.2;
      ship.add(hull);
      const superstructure = new T.Mesh(
        new T.BoxGeometry(18, 12, 34),
        new T.MeshStandardMaterial({ color: 0x64748b, roughness: 0.55 })
      );
      superstructure.position.set(0, 12, -16);
      ship.add(superstructure);
      const mast = new T.Mesh(
        new T.CylinderGeometry(0.5, 1.2, 14, 8),
        new T.MeshStandardMaterial({ color: 0x94a3b8 })
      );
      mast.position.set(0, 24, -14);
      ship.add(mast);
      ship.position.set(-55, -0.5, -95);
      ship.rotation.y = 0.35;
      ship.visible = false;
      this.local.add(ship);
      this.recoveryShip = ship;

      // U.S. Navy Recovery Helicopter
      const helo = new T.Group();
      const fuselage = new T.Mesh(
        new T.BoxGeometry(2.6, 2.4, 8.8),
        new T.MeshStandardMaterial({ color: 0x64748b, metalness: 0.4 })
      );
      helo.add(fuselage);
      const tail = new T.Mesh(
        new T.BoxGeometry(0.9, 1.1, 6.5),
        new T.MeshStandardMaterial({ color: 0x475569 })
      );
      tail.position.set(0, 0.4, -7.2);
      helo.add(tail);
      this.heloRotor = new T.Mesh(
        new T.BoxGeometry(11.5, 0.12, 0.55),
        new T.MeshBasicMaterial({ color: 0xe2e8f0 })
      );
      this.heloRotor.position.y = 1.65;
      helo.add(this.heloRotor);
      helo.position.set(8, 16, -6);
      helo.visible = false;
      this.local.add(helo);
      this.helicopter = helo;
    }

    _bindPointer() {
      const el = this.renderer.domElement;
      el.addEventListener("pointerdown", (e) => {
        this.dragging = true;
        this.lastPointer = { x: e.clientX, y: e.clientY };
      });
      window.addEventListener("pointerup", () => {
        this.dragging = false;
        this.lastPointer = null;
      });
      window.addEventListener("pointermove", (e) => {
        if (!this.dragging || !this.lastPointer) return;
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.camOrbit.yaw -= dx * 0.005;
        this.camOrbit.pitch = Math.max(-1.1, Math.min(1.1, this.camOrbit.pitch + dy * 0.004));
      });
      el.addEventListener(
        "wheel",
        (e) => {
          if (!this.isActive) return;
          e.preventDefault();
          this.camOrbit.radius = Math.max(12, Math.min(1200, this.camOrbit.radius * (e.deltaY > 0 ? 1.12 : 0.89)));
        },
        { passive: false }
      );
    }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.mapCam.aspect = w / Math.max(1, h);
      this.mapCam.updateProjectionMatrix();
      this.localCam.aspect = w / Math.max(1, h);
      this.localCam.updateProjectionMatrix();
    }

    useMapScene(sn) {
      if (this.cameraMode === "map") return true;
      if (this.cameraMode === "external" || this.cameraMode === "cockpit") return false;
      return ["tli_prep", "outbound", "return_coast"].includes(sn.phase);
    }

    update(sn, dt) {
      this.animTime += dt || 0.016;
      const SCALE = 1e6; // 1 unit = 1,000 km in map scene
      const moonPos = new T.Vector3(sn.moon.r[0] / SCALE, sn.moon.r[2] / SCALE, -sn.moon.r[1] / SCALE);
      this.moon.position.copy(moonPos);
      this.moonMarker.position.copy(moonPos);

      const orionPos = new T.Vector3(sn.vessel.orion.r[0] / SCALE, sn.vessel.orion.r[2] / SCALE, -sn.vessel.orion.r[1] / SCALE);
      this.orionMarker.position.copy(orionPos);

      // Update planned figure-eight curve when tliPlan is available
      if (sn.tliPlan && this.plannedCurveKey !== sn.tliPlan.tDepart) {
        this.plannedCurveKey = sn.tliPlan.tDepart;
        const fullPlan = SIM.planFreeReturnTLI(
          { r: sn.vessel.orion.r, v: sn.vessel.orion.v },
          sn.tliPlan.tDepart
        );
        if (fullPlan) {
          const pts = SIM.sampleFreeReturnCurve(fullPlan, 42).map(
            (p) => new T.Vector3(p[0] / SCALE, p[2] / SCALE, -p[1] / SCALE)
          );
          this.plannedLine.geometry.dispose();
          this.plannedLine.geometry = new T.BufferGeometry().setFromPoints(pts);
        }
      }

      if (this.useMapScene(sn)) {
        if (this.trail.length === 0 || this.trail[this.trail.length - 1].distanceTo(orionPos) > 0.35) {
          this.trail.push(orionPos.clone());
          if (this.trail.length > 900) this.trail.shift();
          if (this.trail.length > 2) {
            this.trailLine.geometry.dispose();
            this.trailLine.geometry = new T.BufferGeometry().setFromPoints(this.trail);
          }
        }
        const focus = sn.phase === "lunar_flyby" ? moonPos : new T.Vector3(0, 0, 0).lerp(moonPos, 0.42);
        const r = this.camOrbit.radius * (sn.phase === "lunar_flyby" ? 0.55 : 2.2);
        this.mapCam.position.set(
          focus.x + Math.sin(this.camOrbit.yaw) * Math.cos(this.camOrbit.pitch) * r,
          focus.y + Math.sin(this.camOrbit.pitch) * r,
          focus.z + Math.cos(this.camOrbit.yaw) * Math.cos(this.camOrbit.pitch) * r
        );
        this.mapCam.up.set(0, 1, 0);
        this.mapCam.lookAt(focus);
        this.renderer.render(this.map, this.mapCam);
        return;
      }

      this.renderLocal(sn, dt);
    }

    _updateSlsStaging(sn) {
      const e = (sn.launch && sn.launch.elapsed) || -15;
      const st = sn.vessel && sn.vessel.stack || {};

      // Plumes
      if (this.plumeGroup) {
        this.rofiGroup.visible = e >= -12 && e < 0;
        this.rs25Plume.visible = e >= -6 && e < 480;
        this.srbPlumeL.visible = e >= 0 && e < 126;
        this.srbPlumeR.visible = e >= 0 && e < 126;
      }

      // Stage separation displacements on named SLS nodes
      for (const [name, info] of Object.entries(this.slsParts)) {
        const node = info.node;
        node.position.copy(info.basePos);
        node.rotation.copy(info.baseRot);
        node.visible = true;

        if (name === "H_Solid_Rocket_Booster_Left" && (st.srbSeparated || e >= 126)) {
          const dtSep = Math.max(0, e - 126);
          if (dtSep > 40) node.visible = false;
          else {
            node.position.x -= dtSep * 1.4;
            node.position.y -= dtSep * 2.2;
            node.rotation.z += dtSep * 0.04;
          }
        }
        if (name === "I_Solid_Rocket_Booster_Right" && (st.srbSeparated || e >= 126)) {
          const dtSep = Math.max(0, e - 126);
          if (dtSep > 40) node.visible = false;
          else {
            node.position.x += dtSep * 1.4;
            node.position.y -= dtSep * 2.2;
            node.rotation.z -= dtSep * 0.04;
          }
        }
        if (name === "A_Orion_Launch_Abort_System" && (st.lasJettisoned || e >= 201)) {
          const dtLas = Math.max(0, e - 201);
          if (dtLas > 35) node.visible = false;
          else {
            node.position.y += dtLas * 4.5;
            node.position.x += dtLas * 0.4;
          }
        }
        if ((name === "F_Core_Stage" || name === "G_Engine_Base_Covers" || name === "E_Launch_Vehicle_Stage_Adapter") && (st.coreSeparated || e >= 492)) {
          const dtCore = Math.max(0, e - 492);
          if (dtCore > 40) node.visible = false;
          else {
            node.position.y -= dtCore * 2.8;
          }
        }
      }
    }

    renderLocal(sn, dt) {
      const phase = sn.phase;
      const isPadOrAscent = ["briefing", "launch_prep", "launch"].includes(phase);
      const isOrbitOrCruise = ["earth_orbit", "prox_ops", "tli_prep", "outbound", "lunar_flyby", "return_coast"].includes(phase);
      const isEntryOrRecovery = ["entry", "chutes", "splashdown", "recovery", "debrief"].includes(phase);

      this.launchGroup.visible = isPadOrAscent;
      this.launchGround.visible = isPadOrAscent && ((sn.launch && sn.launch.alt) || 0) < 35000;
      this.orionCraft.visible = isOrbitOrCruise || isEntryOrRecovery;
      this.icpsTarget.visible = phase === "prox_ops" || (phase === "earth_orbit" && sn.vessel.icps.attached);
      this.localEarth.visible = ["earth_orbit", "prox_ops", "tli_prep", "outbound", "return_coast", "entry"].includes(phase);
      this.localMoon.visible = phase === "lunar_flyby";
      this.ocean.visible = ["chutes", "splashdown", "recovery", "debrief"].includes(phase);
      this.localStars.visible = !["chutes", "splashdown", "recovery", "debrief"].includes(phase);
      this.frontPorchMesh.visible = (phase === "recovery" || phase === "debrief") && !!(sn.recoveryState && sn.recoveryState.frontPorch);
      this.recoveryShip.visible = phase === "recovery" || phase === "debrief";
      this.helicopter.visible = (phase === "recovery" || phase === "debrief") && !!(sn.recoveryState && sn.recoveryState.crewExtracted);

      // Sky background transitions
      if (["chutes", "splashdown", "recovery", "debrief"].includes(phase)) {
        this.local.background.setHex(0x163c66);
      } else if (phase === "launch" && (sn.launch.alt || 0) < 45000) {
        this.local.background.setHex(0x071a33);
      } else {
        this.local.background.setHex(0x02050b);
      }

      // Configure Orion sub-assemblies based on mission state
      const stack = (sn.vessel && sn.vessel.stack) || {};
      this.smGroup.visible = !stack.smSeparated && !["chutes", "splashdown", "recovery", "debrief"].includes(phase);
      for (const wing of this.solarWings) {
        wing.scale.x = stack.solarArrays ? 1 : 0.12;
      }
      this.drogueChuteGroup.visible = phase === "chutes" && !!(sn.chutes && sn.chutes.droguesDeployed && !sn.chutes.mainsDeployed);
      this.mainChuteGroup.visible = phase === "chutes" && !!(sn.chutes && sn.chutes.mainsDeployed);
      this.uprightBagsGroup.visible = ["splashdown", "recovery", "debrief"].includes(phase) && !!(sn.splashdownState && sn.splashdownState.uprightBags);

      // Heat shield & plasma glow
      const tempF = (sn.entry && sn.entry.tempF) || 70;
      const heatRatio = Math.max(0, Math.min(1, (tempF - 400) / 4500));
      this.plasmaShell.material.opacity = phase === "entry" ? heatRatio * 0.72 : 0;
      this.heatShieldMesh.material.emissive.setRGB(heatRatio * 0.9, heatRatio * 0.28, 0);

      if (isPadOrAscent) {
        this._updateSlsStaging(sn);
        const e = (sn.launch && sn.launch.elapsed) || -15;
        if (this.astrovan) {
          this.astrovan.position.x = sn.flags && sn.flags.crewIngress ? 14 : 44;
        }
        if (this.crewAccessArm) {
          this.crewAccessArm.rotation.y = e > -10 ? -1.1 : 0;
        }
        const climbY = e > 0 ? Math.min(600, Math.pow(e, 1.35) * 0.35) : 0;
        this.rocketGroup.position.set(0, climbY, 0);
        this.rocketGroup.rotation.z = e > 8 ? -Math.min(0.85, ((90 - (sn.launch.pitchDeg || 90)) * DEG) * 0.65) : 0;

        if (this.cameraMode === "cockpit") {
          this.localCam.position.set(0, climbY + 73, 2.2);
          this.localCam.lookAt(0, climbY + 120, 40);
        } else {
          const camDist = 115;
          this.localCam.position.set(
            Math.sin(this.camOrbit.yaw) * camDist,
            Math.max(12, climbY + 46 + Math.sin(this.camOrbit.pitch) * 35),
            Math.cos(this.camOrbit.yaw) * camDist
          );
          this.localCam.lookAt(0, climbY + 44, 0);
        }
      } else if (phase === "prox_ops") {
        const p = sn.prox || {};
        const pos = p.pos || [0, 0, 75];
        this.orionCraft.position.set(0, 0, 0);
        this.orionCraft.rotation.set(0, 0, 0);
        this.icpsTarget.position.set(pos[0], pos[1], -pos[2]);
        this.icpsTarget.rotation.set(0, 0, 0);

        if (this.cameraMode === "cockpit") {
          this.localCam.position.set(0, 1.8, -1.8);
          this.localCam.lookAt(pos[0], pos[1], -pos[2]);
        } else {
          this.localCam.position.set(11, 7, 18);
          this.localCam.lookAt(pos[0] * 0.5, pos[1] * 0.5, -pos[2] * 0.45);
        }
      } else if (phase === "lunar_flyby") {
        this.orionCraft.position.set(0, 0, 0);
        this.orionCraft.rotation.set(0.25, this.animTime * 0.05, 0);
        this.localMoon.position.set(0, -345, -75);
        this.localMoon.rotation.y = this.animTime * 0.02;
        if (this.cameraMode === "cockpit") {
          this.localCam.position.set(0, 1.8, -1.2);
          this.localCam.lookAt(0, -120, -100);
        } else {
          const r = 24;
          this.localCam.position.set(
            Math.sin(this.camOrbit.yaw) * r,
            6 + Math.sin(this.camOrbit.pitch) * 10,
            Math.cos(this.camOrbit.yaw) * r
          );
          this.localCam.lookAt(0, -3, -10);
        }
      } else if (isOrbitOrCruise) {
        this.orionCraft.position.set(0, 0, 0);
        this.orionCraft.rotation.set(0.18, 0.3, 0);
        if (phase === "earth_orbit" && sn.vessel.icps.attached) {
          this.icpsTarget.position.set(0, -8.5, 0);
          this.icpsTarget.rotation.set(-Math.PI / 2, 0, 0);
        }
        const earthScale = phase === "outbound" || phase === "return_coast" ? 0.35 : 1.0;
        this.localEarth.scale.setScalar(earthScale);
        this.localEarth.position.set(0, -645 * earthScale, -190);
        this.localEarth.rotation.y += 0.001;

        if (this.cameraMode === "cockpit") {
          this.localCam.position.set(0, 2.0, 0.5);
          this.localCam.lookAt(0, -60, -140);
        } else {
          const r = 22;
          this.localCam.position.set(
            Math.sin(this.camOrbit.yaw) * r,
            6 + Math.sin(this.camOrbit.pitch) * 9,
            Math.cos(this.camOrbit.yaw) * r
          );
          this.localCam.lookAt(0, -1, 0);
        }
      } else if (phase === "entry") {
        this.orionCraft.position.set(0, 12, 0);
        // Heat-shield forward orientation during skip entry
        this.orionCraft.rotation.set(0.35, 0, (sn.entry && sn.entry.bank) || 0);
        // Show separated Service Module drifting away briefly after SEPARATE_SM
        if (sn.entry && sn.entry.smSeparated && !sn.entry.ready) {
          this.smGroup.visible = true;
          this.smGroup.position.set(-8, -9, -12);
        } else {
          this.smGroup.position.set(0, 0, 0);
        }
        this.localCam.position.set(14, 15, 20);
        this.localCam.lookAt(0, 12, 0);
      } else if (phase === "chutes") {
        const yPos = Math.max(2, Math.min(45, ((sn.entry && sn.entry.alt) || 1000) / 180));
        this.orionCraft.position.set(0, yPos, 0);
        this.orionCraft.rotation.set(0, Math.sin(this.animTime * 0.8) * 0.08, Math.cos(this.animTime * 0.7) * 0.04);
        this.localCam.position.set(22, yPos + 10, 32);
        this.localCam.lookAt(0, yPos + 6, 0);
      } else if (["splashdown", "recovery", "debrief"].includes(phase)) {
        const bob = Math.sin(this.animTime * 1.8) * 0.22;
        this.orionCraft.position.set(0, 0.25 + bob, 0);
        this.orionCraft.rotation.set(Math.sin(this.animTime * 1.3) * 0.05, 0, Math.cos(this.animTime * 1.1) * 0.05);
        if (this.heloRotor) this.heloRotor.rotation.y = this.animTime * 18;
        if (this.helicopter && this.helicopter.visible) {
          this.helicopter.position.y = 15 + Math.sin(this.animTime * 2.2) * 0.4;
        }
        this.localCam.position.set(18, 9, 26);
        this.localCam.lookAt(0, 2, -8);
      }

      this.renderer.render(this.local, this.localCam);
    }
  }

  class ArtemisHud {
    constructor(game) {
      this.game = game;
      this.briefDismissed = false;
      this.root = document.createElement("div");
      this.root.id = "artemis-hud";
      this.root.innerHTML = `
        <div class="art-top">
          <div class="art-brand">
            <span class="art-kicker" id="art-kicker">ARTEMIS II // CREWED LUNAR FLYBY — PHASE 1 / 13</span>
            <strong id="art-phase">PHASE 1 — MISSION BRIEFING &amp; CREW PREPARATION</strong>
            <div class="art-subbar">
              <span id="art-met">T+00:00:00:00</span>
              <span class="art-comm-badge" id="art-comm">NOMINAL — DSN / TDRS LINK ACTIVE</span>
            </div>
          </div>
          <div class="art-top-right">
            <div class="art-cam-group">
              <button type="button" data-art-cam="auto" class="is-active">AUTO CAM</button>
              <button type="button" data-art-cam="external">EXTERNAL</button>
              <button type="button" data-art-cam="cockpit">COCKPIT</button>
              <button type="button" data-art-cam="map">3D MAP</button>
            </div>
            <span id="art-warp">WARP 1×</span>
            <span id="art-assist">ASSIST ON</span>
            <button id="art-open-brief" type="button">BRIEFING</button>
            <button id="art-reassign" type="button">DUTIES</button>
            <button id="art-help" type="button">HELP</button>
            <button id="art-leave" type="button">LEAVE</button>
          </div>
        </div>
        <div class="art-left">
          <h3>13-PHASE MISSION PLAN</h3>
          <div id="art-objectives"></div>
          <div class="art-crew" id="art-crew"></div>
        </div>
        <div class="art-right">
          <h3>NAVIGATION &amp; SPACECRAFT</h3>
          <div id="art-resources"></div>
          <div class="art-message" id="art-messages"></div>
        </div>
        <div class="art-bottom">
          <div id="art-guidance"></div>
          <div id="art-controls"></div>
          <div id="art-instruments"></div>
        </div>
        <div class="art-toast" id="art-toast"></div>
        <div class="art-modal" id="art-modal">
          <div class="art-modal-card">
            <div id="art-modal-body"></div>
            <button id="art-modal-close" type="button">CLOSE</button>
          </div>
        </div>
        <div class="art-brief" id="art-brief">
          <div class="art-brief-card">
            <div class="art-kicker">NASA ARTEMIS II-INSPIRED CREWED LUNAR FLYBY</div>
            <h2>LUNA MISSION — CREWED LUNAR FLYBY</h2>
            <p>Command NASA's <b>Orion</b> spacecraft and <b>Space Launch System (SLS Block 1)</b> across all 13 phases of the Artemis II-style crewed lunar flyby and free-return mission. <b>This is a lunar flyby mission — Orion does not land on the Moon.</b></p>
            <div class="art-brief-grid">
              <div><span>LAUNCH VEHICLE</span><b>SLS Block 1 (8.8M lbs thrust)</b></div>
              <div><span>SPACECRAFT</span><b>Orion CM + European SM + ICPS</b></div>
              <div><span>TRAJECTORY</span><b>Figure-Eight Free-Return (~10 Days)</b></div>
              <div><span>LUNAR FLYBY</span><b>~4,600 mi beyond Far Side + Radio Blackout</b></div>
              <div><span>EARTH ENTRY</span><b>~25,000 mph / ~4G / ~5,000°F Avcoat</b></div>
              <div><span>RECOVERY</span><b>11 Chutes → Pacific Ocean (50 NM off CA)</b></div>
            </div>
            <div id="art-brief-status"></div>
            <div class="art-brief-actions">
              <button id="art-brief-crew" type="button" data-art-cmd="CREW_CHECK">1. CONFIRM CREW READINESS</button>
              <button id="art-brief-ship" type="button" data-art-cmd="SPACECRAFT_CHECK">2. VERIFY SPACECRAFT &amp; SLS</button>
              <button id="art-brief-go" type="button">3. AUTHORIZE LAUNCH &amp; PROCEED TO PAD 39B</button>
              <button id="art-brief-hide" type="button">VIEW PAD 39B</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(this.root);

      this.root.querySelector("#art-help").addEventListener("click", () => this.showHelp());
      this.root.querySelector("#art-open-brief").addEventListener("click", () => {
        this.briefDismissed = false;
        this.root.querySelector("#art-brief").style.display = "flex";
      });
      this.root.querySelector("#art-brief-hide").addEventListener("click", () => {
        this.briefDismissed = true;
        this.root.querySelector("#art-brief").style.display = "none";
      });
      this.root.querySelector("#art-reassign").addEventListener("click", () => this.showReassign());
      this.root.querySelector("#art-leave").addEventListener("click", () => game.exit());
      this.root.querySelector("#art-modal-close").addEventListener("click", () => {
        this.root.querySelector("#art-modal").style.display = "none";
      });
      this.root.querySelector("#art-brief-go").addEventListener("click", () => {
        this.briefDismissed = true;
        this.root.querySelector("#art-brief").style.display = "none";
        game.command("START");
      });
    }

    dispose() {
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }

    toast(text) {
      const el = this.root.querySelector("#art-toast");
      if (!el) return;
      el.textContent = text;
      el.style.display = "block";
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => {
        el.style.display = "none";
      }, 3800);
    }

    showHelp() {
      const body = this.root.querySelector("#art-modal-body");
      body.innerHTML = `<h3>ARTEMIS II FLIGHT MANUAL &amp; CONTROLS</h3>
        <p><b>Mission Architecture:</b> 13-phase crewed lunar flyby and free-return trajectory (Briefing → Pad 39B Prep → SLS Launch → Earth Orbit &amp; HEO Burn → ICPS Proximity Ops → TLI → Outbound Cruise → Lunar Far-Side Flyby &amp; Blackout → Free-Return Coast → SM Separation &amp; Skip Entry → 11-Parachute Deployment → Pacific Splashdown → Navy Recovery &amp; Debrief).</p>
        <p><b>Proximity Operations (Phase 5):</b> Use <b>W/S</b> to approach/back away from the ICPS target, <b>A/D</b> lateral, <b>R/F</b> vertical, <b>Arrow Keys</b> pitch/yaw, <b>Q/E</b> roll, <b>Shift</b> fine RCS mode — or use the HUD maneuver buttons (Approach ≤38m, then Retreat ≥85m).</p>
        <p><b>Atmospheric Entry &amp; Parachutes (Phases 10–11):</b> Separate Service Module, orient Heat Shield, use <b>A/D</b> to bank during entry, and deploy the 3 FBC + 2 Drogue chutes at 25,000 ft followed by the 3 Pilot + 3 Main chutes at 9,000 ft (<b>Space</b> or HUD buttons).</p>
        <p><b>Time Warp &amp; Cameras:</b> Press <b>T</b> or click the HUD warp buttons (1×–1000×) during orbit and deep-space cruise phases. Press <b>V</b> or click <b>AUTO / EXTERNAL / COCKPIT / 3D MAP</b> to switch views.</p>`;
      this.root.querySelector("#art-modal").style.display = "flex";
    }

    showReassign() {
      const sn = this.lastSnap;
      if (!sn || !sn.players) return;
      const flight = sn.players.filter((p) => p.team !== "ground");
      const rows = Object.entries(sn.duties || {})
        .map(
          ([id, d]) =>
            `<label class="art-reassign-row"><span>${ESC(d.label)}</span><select data-art-duty="${id}">${flight
              .map((p) => `<option value="${ESC(p.id)}" ${d.playerId === p.id ? "selected" : ""}>${ESC(p.name)} (${ESC(p.role)})</option>`)
              .join("")}</select></label>`
        )
        .join("");
      const body = this.root.querySelector("#art-modal-body");
      body.innerHTML = `<h3>ARTEMIS II CREW STATIONS</h3><p>Assign players to the four Orion crew stations (Commander, Pilot/Nav, Mission Specialist 1, Mission Specialist 2). Solo players can operate all stations.</p>${rows}<button id="art-reassign-apply" type="button">APPLY STATIONS</button>`;
      this.root.querySelector("#art-modal").style.display = "flex";
      const apply = this.root.querySelector("#art-reassign-apply");
      if (apply) {
        apply.onclick = () => {
          const changes = [...this.root.querySelectorAll("[data-art-duty]")].map((sel) => [sel.getAttribute("data-art-duty"), sel.value]);
          let pending = changes.length;
          if (!pending) return;
          changes.forEach(([duty, playerId]) => {
            this.game.net.reassignArtemisDuty(duty, playerId, () => {
              pending--;
              if (pending <= 0) this.root.querySelector("#art-modal").style.display = "none";
            });
          });
        };
      }
    }

    update(sn) {
      this.lastSnap = sn;
      const q = (s) => this.root.querySelector(s);
      this._htmlCache = this._htmlCache || {};
      const setHtml = (selector, html) => {
        if (this._htmlCache[selector] === html) return;
        this._htmlCache[selector] = html;
        const el = q(selector);
        if (el) el.innerHTML = html;
      };

      const pNum = sn.phaseNumber || 1;
      q("#art-kicker").textContent = `ARTEMIS II // CREWED LUNAR FLYBY — PHASE ${pNum} / 13`;
      q("#art-phase").textContent = sn.phaseTitle || String(sn.phase || "").replace(/_/g, " ").toUpperCase();
      q("#art-met").textContent = `MET ${fmtMET(sn.met)}`;
      const commEl = q("#art-comm");
      if (commEl) {
        commEl.textContent = sn.commStatus || "NOMINAL";
        commEl.className = "art-comm-badge" + (sn.inBlackout ? " is-blackout" : "");
      }
      q("#art-warp").textContent = `WARP ${sn.warp || 1}×`;
      q("#art-assist").textContent = `ASSIST ${sn.assist ? "ON" : "OFF"}`;

      // Objectives list
      setHtml(
        "#art-objectives",
        (sn.objectives || [])
          .map((o) => {
            const isCurrent = o.phase === sn.phase && o.status !== "done";
            return `<div class="art-obj ${o.status === "done" ? "is-done" : ""} ${isCurrent ? "is-current" : ""}"><i></i><span>${ESC(o.label)}</span><b>${o.status === "done" ? "DONE" : isCurrent ? "ACTIVE" : "WAIT"}</b></div>`;
          })
          .join("")
      );

      // Crew & Duties
      const duties = sn.duties || {};
      const dutyRows = Object.entries(duties)
        .map(([id, d]) => `<div class="art-duty"><span>${ESC(d.label)}</span><b>${ESC(d.playerName || d.crewName || "ASSIGNED")}</b></div>`)
        .join("");
      setHtml("#art-crew", `<h4>ORION CREW &amp; STATIONS</h4>${dutyRows}`);

      // Navigation & Spacecraft Resources
      const r = sn.resources || {};
      const nav = sn.nav || {};
      const st = (sn.vessel && sn.vessel.stack) || {};
      const bar = (label, value, max, color, unit) =>
        `<div class="art-bar"><div><span>${label}</span><b>${fmt(value)}${max != null ? " / " + fmt(max) : ""}${unit ? " " + unit : ""}</b></div><i><em style="width:${pct(value, max)}%;background:${color}"></em></i></div>`;

      const altStr = ["chutes", "splashdown", "recovery", "debrief"].includes(sn.phase)
        ? `${fmt((nav.earthAltM || 0) * 3.28084, 0)} ft (${fmt(nav.earthAltKm, 2)} km)`
        : `${fmt(nav.earthAltKm, 1)} km (${fmt((nav.earthAltKm || 0) * 0.621371, 1)} mi)`;

      setHtml(
        "#art-resources",
        `<div class="art-stat-row"><span>ALTITUDE</span><b>${altStr}</b></div>
         <div class="art-stat-row"><span>VELOCITY</span><b>${fmt(nav.speedMps, 0)} m/s (${fmt(nav.speedMph, 0)} mph)</b></div>
         <div class="art-stat-row"><span>EARTH DIST</span><b>${fmt(nav.earthDistMi, 0)} mi (${fmt(nav.earthDistKm, 0)} km)</b></div>
         <div class="art-stat-row"><span>MOON DIST</span><b>${fmt(nav.lunarAltMi, 0)} mi (${fmt(nav.lunarAltKm, 0)} km)</b></div>
         <div class="art-stat-row"><span>SOLAR ARRAYS</span><b>${st.solarArrays ? "DEPLOYED (4 X-WINGS)" : "STOWED"}</b></div>
         <div class="art-stat-row"><span>ICPS STAGE</span><b>${sn.vessel && sn.vessel.icps && sn.vessel.icps.attached ? "ATTACHED" : "SEPARATED"}</b></div>
         ${bar("ORION ESM PROPELLANT", r.orionProp, r.orionPropStart, "#67e8f9", "kg")}
         ${bar("ORION RCS PROPELLANT", r.orionRcs, r.orionRcsStart || 650, "#38bdf8", "kg")}
         ${bar("ICPS CRYO PROPELLANT", r.icpsProp, r.icpsPropStart, "#fbbf24", "kg")}
         <div class="art-stat-row"><span>FAR-SIDE OBSERVATIONS</span><b>${fmt(r.observations)} / 2</b></div>`
      );

      setHtml(
        "#art-messages",
        (sn.messages || [])
          .slice(-5)
          .map((m) => `<div class="art-msg ${m.level}">${ESC(m.text)}</div>`)
          .join("")
      );

      setHtml("#art-guidance", this._guidance(sn));
      this._syncControls(sn);
      setHtml("#art-instruments", this._instruments(sn));

      // Update Phase 1 Briefing checklist badges
      const f = sn.flags || {};
      setHtml(
        "#art-brief-status",
        `<div class="art-brief-checks">
           <span class="${f.crewReady ? "is-ok" : ""}">CREW READINESS: ${f.crewReady ? "CONFIRMED" : "PENDING"}</span>
           <span class="${f.spacecraftChecked ? "is-ok" : ""}">SPACECRAFT &amp; SLS: ${f.spacecraftChecked ? "VERIFIED" : "PENDING"}</span>
         </div>`
      );
      q("#art-brief").style.display = sn.phase === "briefing" && !this.briefDismissed ? "flex" : "none";
    }

    _guidance(sn) {
      const f = sn.flags || {};
      switch (sn.phase) {
        case "briefing":
          return `<b>PHASE 1 — MISSION BRIEFING &amp; CREW PREPARATION</b><p>Confirm 4-crew suit &amp; medical readiness (${f.crewReady ? "DONE" : "REQUIRED"}) and verify Orion/SLS pre-flight status (${f.spacecraftChecked ? "DONE" : "REQUIRED"}), then click <b>AUTHORIZE LAUNCH</b> to proceed to Launch Complex 39B.</p>`;
        case "launch_prep":
          return `<b>PHASE 2 — CREW TRANSPORT &amp; LAUNCH COMPLEX 39B PREPARATION</b><p>Complete Astrovan crew transport &amp; White Room ingress into Orion (${f.crewIngress ? "DONE" : "REQUIRED"}), load 730,000+ gallons of cryogenic propellant into SLS (${f.propLoaded ? "100% LOADED" : "REQUIRED"}), then click <b>COMMIT LAUNCH (T-15s)</b>.</p>`;
        case "launch":
          return `<b>PHASE 3 — SLS BLOCK 1 LAUNCH &amp; ASCENT</b><p>Monitor terminal countdown (ROFI sparklers at T-12s, RS-25 ignition at T-6s, 8.8M lbs SRB liftoff at T-0s), SRB separation (~2m), Service Module fairing &amp; LAS jettison (~3m 15s), and Core Stage MECO/separation (~8m) into initial Earth orbit.</p>`;
        case "earth_orbit":
          return `<b>PHASE 4 — EARTH ORBIT, HEO BURN &amp; 24H SYSTEMS CHECKOUT</b><p>1. Deploy Orion's 4 solar array wings (${f.solarArrays ? "DONE" : "REQUIRED"}). 2. Run Systems Checkout (${f.checkout ? "DONE" : "REQUIRED"}). 3. Execute the ICPS High Earth Orbit Burn (${f.heoBurn ? "DONE" : "REQUIRED"}). 4. Complete 24h Orion Check &amp; click <b>SEPARATE ICPS</b>.</p>`;
        case "prox_ops":
          return `<b>PHASE 5 — PROXIMITY OPERATIONS DEMONSTRATION</b><p>Fly Orion relative to the separated ICPS stage using <b>WASD / RF / Arrows</b> or the HUD RCS controls: 1. Approach within <b>≤38 m</b> for inspection (${sn.prox && sn.prox.inspected ? "DONE" : "PENDING"}). 2. Back away to <b>≥85 m</b> safe separation (${sn.prox && sn.prox.retreated ? "DONE" : "PENDING"}), then click <b>CONFIRM PROX OPS COMPLETE</b>.</p>`;
        case "tli_prep":
          return `<b>PHASE 6 — TRANS-LUNAR INJECTION (TLI)</b><p>Verify the Figure-Eight Free-Return maneuver plan (${f.tliVerified ? "VERIFIED" : "CLICK VERIFY TLI"}), then click <b>EXECUTE TLI BURN</b> to fire Orion's Service Module main engine toward the Moon.</p>`;
        case "outbound":
          return `<b>PHASE 7 — OUTBOUND DEEP-SPACE CRUISE (~4 DAYS)</b><p>Complete the Deep-Space Systems Check (${f.outboundCheck ? "DONE" : "PENDING"}), Radiation Shelter Drill (${f.radiationDrill ? "DONE" : "PENDING"}), and Outbound Trajectory Trim (${f.outboundTrim ? "DONE" : "OPTIONAL"}), and use <b>TIME WARP (100×–1000×)</b> to coast >230,000 miles to the Lunar Flyby gate.</p>`;
        case "lunar_flyby":
          return `<b>PHASE 8 — LUNAR FAR-SIDE FLYBY &amp; COMMUNICATIONS BLACKOUT</b><p>Orion is flying on a hyperbolic arc ~4,600 miles behind the Moon's far side! Capture <b>Far-Side Lunar Observations</b> (${sn.flyby && sn.flyby.lunarObserved ? "DONE" : "REQUIRED"}), monitor the expected ~43-minute <b>Far-Side Radio Blackout</b> (${sn.flyby && sn.flyby.blackoutCleared ? "AOS RESTORED" : sn.inBlackout ? "IN BLACKOUT" : "APPROACHING"}), then click <b>CONFIRM FLYBY EXIT</b>.</p>`;
        case "return_coast":
          return `<b>PHASE 9 — FREE-RETURN JOURNEY TO EARTH (~4 DAYS)</b><p>Lunar gravity has bent Orion onto a free-return path to Earth! Complete the Return Systems Check (${f.returnCheck ? "DONE" : "REQUIRED"}) and Return Corridor Trim (${f.returnTrim ? "DONE" : "OPTIONAL"}), and use <b>TIME WARP</b> to coast to Earth Entry Interface (121.9 km / 75.7 mi).</p>`;
        case "entry":
          return `<b>PHASE 10 — SERVICE MODULE SEPARATION &amp; ATMOSPHERIC ENTRY</b><p>1. Click <b>SEPARATE SERVICE MODULE</b> (${sn.entry && sn.entry.smSeparated ? "DONE" : "REQUIRED"}). 2. Click <b>ORIENT HEAT SHIELD &amp; BEGIN ENTRY</b> (${sn.entry && sn.entry.ready ? "ACTIVE" : "REQUIRED"}). Monitor ~25,000 mph deceleration, ~4G load, and ~5,000°F Avcoat temperature down to 25,000 ft.</p>`;
        case "chutes":
          return `<b>PHASE 11 — 11-PARACHUTE DEPLOYMENT SEQUENCE</b><p>Step 1 (~25,000 ft): Deploy <b>3 Forward Bay Cover + 2 Drogue Parachutes</b> (${sn.chutes && sn.chutes.droguesDeployed ? "DEPLOYED" : "READY"}). Step 2 (~9,000 ft): Deploy <b>3 Pilot + 3 Main Parachutes</b> (${sn.chutes && sn.chutes.mainsDeployed ? "ALL 11 DEPLOYED" : "WAIT FOR ~9,000 FT"}).</p>`;
        case "splashdown":
          return `<b>PHASE 12 — PACIFIC OCEAN SPLASHDOWN (~50 NM OFF CALIFORNIA)</b><p>Orion has splashed down at ${fmt(sn.splashdownState && sn.splashdownState.speedMph, 1)} mph (<20 mph)! Click <b>RELEASE CHUTES &amp; INFLATE UPRIGHT BAGS</b> (${sn.splashdownState && sn.splashdownState.stabilized ? "DONE" : "REQUIRED"}), then <b>CONFIRM CREW SAFE</b>.</p>`;
        case "recovery":
        case "debrief":
          return `<b>PHASE 13 — U.S. NAVY CREW RECOVERY &amp; MISSION DEBRIEF</b><p>1. Deploy the inflatable <b>Front Porch</b> recovery raft (${sn.recoveryState && sn.recoveryState.frontPorch ? "DEPLOYED" : "REQUIRED"}). 2. Execute <b>Helicopter Crew Extraction &amp; Ship Well-Deck Recovery</b> (${sn.recoveryState && sn.recoveryState.crewExtracted ? "COMPLETE" : "REQUIRED"}). 3. Open the <b>Mission Debrief</b>.</p>`;
        default:
          return "";
      }
    }

    _syncControls(sn) {
      const container = this.root.querySelector("#art-controls");
      if (!container) return;
      let row = container.querySelector(".art-buttons");
      if (!row) {
        row = document.createElement("div");
        row.className = "art-buttons";
        container.appendChild(row);
      }

      const allowed = sn.allowedCommands || [];
      const f = sn.flags || {};
      const labels = {
        CREW_CHECK: f.crewReady ? "✓ 1. CREW READINESS CONFIRMED" : "1. CONFIRM CREW READINESS",
        SPACECRAFT_CHECK: f.spacecraftChecked ? "✓ 2. SPACECRAFT VERIFIED" : "2. VERIFY SPACECRAFT & SLS",
        START: "3. AUTHORIZE LAUNCH & ROLL TO PAD",
        CREW_INGRESS: f.crewIngress ? "✓ 1. INGRESS COMPLETE" : "1. ASTROVAN PAD ARRIVAL & ORION INGRESS",
        LOAD_PROPELLANT: f.propLoaded ? "✓ 2. CRYO PROPELLANT LOADED" : "2. LOAD SLS CRYO PROPELLANT (100%)",
        COMMIT_LAUNCH: "3. COMMIT LAUNCH (START T-15s COUNTDOWN)",
        STAGE_SRB: "SEPARATE SRBs",
        JETTISON_LAS: "JETTISON FAIRINGS & LAS",
        DEPLOY_SOLAR_ARRAYS: "1. DEPLOY ORION SOLAR ARRAYS",
        CHECKOUT: "2. RUN SYSTEMS CHECKOUT",
        HEO_BURN: "3. EXECUTE ICPS HEO RAISE BURN",
        ORION_CHECK: sn.phase === "earth_orbit" ? "4. VERIFY 24H HEO CHECKOUT" : "DEEP-SPACE SYSTEMS CHECK",
        SEPARATE_ICPS: "5. SEPARATE ICPS & START PROX OPS",
        PROX_APPROACH: "RCS APPROACH (CLOSE TO ≤35m)",
        PROX_HOLD: "HOLD & ALIGN ON ICPS",
        PROX_RETREAT: "RCS RETREAT (BACK AWAY ≥85m)",
        AUTO_PROX: "AUTO PROX OPS (ASSIST)",
        CONFIRM_PROX_EXIT: "CONFIRM PROX OPS COMPLETE",
        VERIFY_TLI: "1. VERIFY TLI MANEUVER & GO/NO-GO",
        TLI: "2. EXECUTE TRANS-LUNAR INJECTION (TLI)",
        RADIATION_DRILL: "RADIATION SHELTER DRILL",
        TRAJECTORY_TRIM: "OUTBOUND TRAJECTORY TRIM",
        LUNAR_OBSERVATION: "PHOTOGRAPH & OBSERVE LUNAR FAR SIDE",
        CONFIRM_FLYBY_EXIT: "CONFIRM FLYBY & ENTER FREE-RETURN",
        RETURN_CHECK: "RETURN SYSTEMS & HEAT-SHIELD CHECK",
        RETURN_TRIM: "RETURN CORRIDOR TRIM BURN",
        SEPARATE_SM: "1. SEPARATE SERVICE MODULE",
        ENTRY_PREP: "2. ORIENT HEAT SHIELD & BEGIN ENTRY",
        DEPLOY_DROGUES: "1. DEPLOY 3 FBC & 2 DROGUE CHUTES",
        DEPLOY_MAINS: "2. DEPLOY 3 PILOT & 3 MAIN CHUTES [SPACE]",
        STABILIZE_CAPSULE: "1. CUT CHUTES & INFLATE UPRIGHT BAGS",
        CONFIRM_CREW_SAFE: "2. CONFIRM CREW SAFE & SIGNAL RECOVERY",
        DEPLOY_FRONT_PORCH: "1. DEPLOY INFLATABLE FRONT PORCH",
        HELICOPTER_EXTRACTION: "2. HELICOPTER CREW EXTRACTION & SHIP RECOVERY",
        DEBRIEF: "3. OPEN MISSION DEBRIEF",
        ABORT: "EMERGENCY ABORT"
      };

      const specs = [];
      for (const c of allowed) {
        if (["SET_WARP", "RESTART", "RETRY_CHECKPOINT", "SET_ASSIST", "PAUSE"].includes(c)) continue;
        specs.push({
          key: `cmd:${c}`,
          attr: "data-art-cmd",
          val: c,
          cls: c === "ABORT" ? "is-danger" : "is-primary",
          text: labels[c] || c.replace(/_/g, " ")
        });
      }

      const warpMax = sn.warpMax || 1;
      if (warpMax > 1) {
        for (const w of [1, 10, 25, 100, 500, 1000, 10000]) {
          if (w <= warpMax) {
            specs.push({
              key: `warp:${w}`,
              attr: "data-art-warp",
              val: String(w),
              cls: `art-warp-btn${sn.warpReq === w ? " is-active" : ""}`,
              text: `WARP ${w}×`
            });
          }
        }
      }

      if ((sn.checkpoints || []).length) {
        specs.push({
          key: "cmd:RETRY_CHECKPOINT",
          attr: "data-art-cmd",
          val: "RETRY_CHECKPOINT",
          cls: "",
          text: "RETRY CHECKPOINT"
        });
      }
      specs.push({
        key: "cmd:SET_ASSIST",
        attr: "data-art-cmd",
        val: "SET_ASSIST",
        cls: "",
        text: sn.assist ? "ASSIST OFF" : "ASSIST ON"
      });
      specs.push({
        key: "cmd:PAUSE",
        attr: "data-art-cmd",
        val: "PAUSE",
        cls: "",
        text: sn.paused ? "RESUME" : "PAUSE"
      });

      // Reconcile DOM buttons in-place by key so existing buttons are never detached mid-click
      const existingByKey = new Map();
      [...row.children].forEach((el) => {
        const k = el.getAttribute("data-btn-key");
        if (k) existingByKey.set(k, el);
      });

      const wantedKeys = new Set(specs.map((s) => s.key));
      for (const [k, el] of existingByKey.entries()) {
        if (!wantedKeys.has(k)) row.removeChild(el);
      }

      specs.forEach((s, idx) => {
        let btn = existingByKey.get(s.key);
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.setAttribute("data-btn-key", s.key);
          btn.setAttribute(s.attr, s.val);
        }
        if (btn.className !== s.cls) btn.className = s.cls;
        if (btn.textContent !== s.text) btn.textContent = s.text;
        const refNode = row.children[idx];
        if (refNode !== btn) row.insertBefore(btn, refNode || null);
      });
    }

    _instruments(sn) {
      const f = sn.flags || {};
      if (sn.phase === "briefing" || sn.phase === "launch_prep") {
        const l = sn.launch || {};
        return `<div class="art-instruments-grid">
          <div><span>CREW CHECK</span><b>${f.crewReady ? "GO (4 SUITED)" : "STANDBY"}</b></div>
          <div><span>ORION / SLS</span><b>${f.spacecraftChecked ? "GO" : "STANDBY"}</b></div>
          <div><span>PAD 39B INGRESS</span><b>${f.crewIngress ? "HATCH SEALED" : "PENDING"}</b></div>
          <div><span>CRYO PROPELLANT</span><b>${fmt(l.propLoadPct || 0, 0)}% LOADED</b></div>
        </div>`;
      }
      if (sn.phase === "launch") {
        const l = sn.launch || {};
        return `<div class="art-instruments-grid">
          <div><span>THRUST</span><b>${fmt(l.thrustMlbs, 2)} M lbs</b></div>
          <div><span>ACCEL LOAD</span><b>${fmt(l.accelG, 2)} G</b></div>
          <div><span>PITCH ATTITUDE</span><b>${fmt(l.pitchDeg, 1)}°</b></div>
          <div><span>SRB / CORE PROP</span><b>${fmt(l.srbPropPct, 0)}% / ${fmt(l.corePropPct, 0)}%</b></div>
        </div>`;
      }
      if (sn.phase === "earth_orbit" || sn.phase === "tli_prep") {
        const o = sn.orbitState || {};
        const p = (sn.guidance && sn.guidance.tli) || sn.tliPlan || {};
        return `<div class="art-instruments-grid">
          <div><span>EARTH ORBIT</span><b>${fmt(o.periapsisAltKm, 0)} × ${fmt(o.apoapsisAltKm, 0)} km</b></div>
          <div><span>HEO RAISE BURN</span><b>${f.heoBurn ? "COMPLETE" : "PENDING"}</b></div>
          <div><span>PLANNED TLI ΔV</span><b>${fmt(p.esmDv || p.dv, 0)} m/s</b></div>
          <div><span>TARGET PERILUNE</span><b>${fmt(p.periluneAltMi || 4598, 0)} mi (${fmt(p.periluneAltKm || 7400, 0)} km)</b></div>
        </div>`;
      }
      if (sn.phase === "prox_ops") {
        const p = sn.prox || {};
        return `<div class="art-instruments-grid">
          <div><span>ICPS RANGE</span><b>${fmt(p.range, 1)} m</b></div>
          <div><span>CLOSURE RATE</span><b>${fmt(p.closure, 2)} m/s</b></div>
          <div><span>ALIGN ERROR</span><b>${fmt(p.alignErr, 1)}°</b></div>
          <div><span>DEMO STATUS</span><b>${p.retreated ? "SAFE SEP (≥85m)" : p.inspected ? "INSPECTED — RETREAT ≥85m" : "APPROACH ≤38m"}</b></div>
        </div>`;
      }
      if (sn.phase === "outbound" || sn.phase === "lunar_flyby" || sn.phase === "return_coast") {
        const nav = sn.nav || {};
        const fb = sn.flyby || {};
        return `<div class="art-instruments-grid">
          <div><span>EARTH DISTANCE</span><b>${fmt(nav.earthDistMi, 0)} mi</b></div>
          <div><span>LUNAR ALTITUDE</span><b>${fmt(nav.lunarAltMi, 0)} mi (${fmt(nav.lunarAltKm, 0)} km)</b></div>
          <div><span>COMMS LINK</span><b>${sn.inBlackout ? "FAR-SIDE BLACKOUT" : "DSN LINK ACTIVE"}</b></div>
          <div><span>FAR-SIDE OBS</span><b>${fb.lunarObserved ? "RECORDED (2/2)" : "PENDING"}</b></div>
        </div>`;
      }
      if (sn.phase === "entry") {
        const e = sn.entry || {};
        return `<div class="art-instruments-grid">
          <div><span>ENTRY ALTITUDE</span><b>${fmt(e.alt / 1000, 1)} km (${fmt((e.alt / 1000) * 0.621371, 1)} mi)</b></div>
          <div><span>VELOCITY</span><b>${fmt((e.speed || 0) * 2.236936, 0)} mph (${fmt(e.speed, 0)} m/s)</b></div>
          <div><span>HEAT SHIELD</span><b>${fmt(e.tempF, 0)} °F (Max ${fmt(e.maxTempF, 0)} °F)</b></div>
          <div><span>CREW LOAD</span><b>${fmt(e.loadG, 2)} G (Max ${fmt(e.maxG, 2)} G)</b></div>
        </div>`;
      }
      if (sn.phase === "chutes") {
        const e = sn.entry || {};
        const c = sn.chutes || {};
        return `<div class="art-instruments-grid">
          <div><span>ALTITUDE</span><b>${fmt((e.alt || 0) * 3.28084, 0)} ft (${fmt(e.alt, 0)} m)</b></div>
          <div><span>DESCENT SPEED</span><b>${fmt((e.speed || 0) * 2.236936, 1)} mph (${fmt(e.speed, 1)} m/s)</b></div>
          <div><span>CHUTES DEPLOYED</span><b>${fmt(c.totalDeployed, 0)} / 11 CHUTES</b></div>
          <div><span>CHUTE STAGE</span><b>${ESC(c.stageLabel || "ACTIVE")}</b></div>
        </div>`;
      }
      if (sn.phase === "splashdown" || sn.phase === "recovery" || sn.phase === "debrief") {
        const sp = sn.splashdownState || {};
        const rc = sn.recoveryState || {};
        return `<div class="art-instruments-grid">
          <div><span>SPLASHDOWN</span><b>${fmt(sp.speedMph, 1)} mph (${ESC(sp.region || "Pacific")})</b></div>
          <div><span>UPRIGHT BAGS</span><b>${sp.uprightBags ? "INFLATED (STABLE-1)" : "STANDBY"}</b></div>
          <div><span>FRONT PORCH</span><b>${rc.frontPorch ? "DEPLOYED" : "STANDBY"}</b></div>
          <div><span>CREW EXTRACTION</span><b>${rc.crewExtracted ? "ABOARD NAVY SHIP" : "IN PROGRESS"}</b></div>
        </div>`;
      }
      return "";
    }
  }

  const game = {
    isActive: false,
    renderer: null,
    net: null,
    view: null,
    hud: null,
    snapshot: null,
    keys: {},
    listeners: [],
    _toastPhase: null,

    start(opts) {
      if (this.isActive) return;
      this.renderer = opts.renderer;
      this.net = opts.net;
      this.onLeave = opts.onLeave || null;
      this.onReturnToLobby = opts.onReturnToLobby || null;
      this.isActive = true;
      this.keys = {};
      this.snapshot = (this.net && this.net.artemisSnapshot) || null;
      this.view = new ArtemisView(this.renderer);
      this.view.isActive = true;
      this.view.resize();
      this.hud = new ArtemisHud(this);

      document.body.classList.add("game-active", "artemis-mode-active");
      document.body.classList.remove("shuttle-mode-active", "ground-mode-active", "docking-active", "interior-active");

      if (window.spaceCenter) {
        if (window.spaceCenter.group) window.spaceCenter.group.visible = false;
        if (window.spaceCenter.stackGroup) window.spaceCenter.stackGroup.visible = false;
        if (window.spaceCenter.towerGroup) window.spaceCenter.towerGroup.visible = false;
        if (window.spaceCenter.hudOverlay) window.spaceCenter.hudOverlay.style.display = "none";
      }
      if (window.issGroup) window.issGroup.visible = false;
      if (window.glbManager && window.glbManager.hangarActive && typeof window.glbManager.closeHangar === "function") {
        window.glbManager.closeHangar();
      }
      const hangar = document.getElementById("glb-hangar-modal");
      if (hangar) hangar.style.display = "none";
      if (window.shipInterior && typeof window.shipInterior.hide === "function") window.shipInterior.hide();
      if (window.localCrew && window.localCrew.group) window.localCrew.group.visible = false;
      if (window.shuttleGame && window.shuttleGame.isActive) window.shuttleGame.exit();
      if (window.dockingSim && window.dockingSim.isActive) window.dockingSim.stop();

      const screenGame = document.getElementById("screen-game");
      if (screenGame) screenGame.style.display = "none";
      const res = document.getElementById("lunaspis-resource-meters");
      if (res) res.style.display = "none";
      for (const id of [
        "space-center-ground-hud",
        "ground-lcc-console",
        "launch-cutscene-overlay",
        "docking-hud-overlay",
        "ship-interior-hud",
        "hud-checklist-panel",
        "hud-crew-roster"
      ]) {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      }

      this._bind();
      this._netHandlers = {
        artemis_state: (sn) => this._onState(sn),
        artemis_events: (events) => this._onEvents(events),
        artemis_result: (data) => this._onResult(data),
        room_update: (room) => {
          if (this.hud && room) this.hud.room = room;
        }
      };
      for (const k of Object.keys(this._netHandlers)) this.net.on(k, this._netHandlers[k]);
      if (this.snapshot) this._onState(this.snapshot);
      console.log("[Artemis II] client active");
    },

    _bind() {
      this._on(window, "keydown", (e) => this._key(e, true), true);
      this._on(window, "keyup", (e) => this._key(e, false), true);
      this._on(window, "resize", () => this.view && this.view.resize());
      this._on(document, "visibilitychange", () => {
        if (document.hidden) this.keys = {};
      });

      this.hud.root.addEventListener("click", (e) => {
        const camBtn = e.target.closest("[data-art-cam]");
        if (camBtn) {
          const mode = camBtn.getAttribute("data-art-cam");
          if (this.view) this.view.setCameraMode(mode);
          this.hud.root.querySelectorAll("[data-art-cam]").forEach((b) => {
            b.classList.toggle("is-active", b.getAttribute("data-art-cam") === mode);
          });
          return;
        }
        const warpBtn = e.target.closest("[data-art-warp]");
        if (warpBtn) {
          const factor = Number(warpBtn.getAttribute("data-art-warp")) || 1;
          this.command("SET_WARP", { factor });
          return;
        }
        const btn = e.target.closest("[data-art-cmd]");
        if (!btn) return;
        const cmd = btn.getAttribute("data-art-cmd");
        const args = {};
        if (cmd === "RETRY_CHECKPOINT") args.name = ((this.snapshot && this.snapshot.checkpoints) || []).slice(-1)[0];
        this.command(cmd, args);
      });
    },

    _on(target, type, fn, capture) {
      target.addEventListener(type, fn, !!capture);
      this.listeners.push([target, type, fn, !!capture]);
    },

    exit(silent) {
      if (!this.isActive) return;
      for (const [t, type, fn, cap] of this.listeners) t.removeEventListener(type, fn, cap);
      this.listeners = [];
      if (this.net && this._netHandlers) {
        for (const k of Object.keys(this._netHandlers)) this.net.off(k, this._netHandlers[k]);
      }
      if (this.hud) this.hud.dispose();
      this.hud = null;
      this.view = null;
      this.isActive = false;
      this.keys = {};
      document.body.classList.remove("artemis-mode-active");
      const screenGame = document.getElementById("screen-game");
      if (screenGame) screenGame.style.display = "flex";
      if (window.onWindowResize) window.onWindowResize();
      if (!silent && this.onLeave && !this._returning) this.onLeave();
    },

    command(type, args) {
      if (!this.net || !this.isActive) return;
      const p = this.net.sendArtemisCommand(type, args || {});
      p.then((r) => {
        if (r && !r.accepted && this.hud) this.hud.toast(r.reason || "Command rejected");
      });
    },

    _key(e, down) {
      if (!this.isActive) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.stopImmediatePropagation();
      const flight = new Set([
        "KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyQ", "KeyE",
        "KeyV", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
      ]);
      if (flight.has(e.code) || e.code === "Tab") e.preventDefault();
      if (down && !e.repeat) {
        if (e.code === "KeyT") this._cycleWarp();
        else if (e.code === "KeyP") this.command("PAUSE");
        else if (e.code === "KeyH" || e.code === "F1") this.hud && this.hud.showHelp();
        else if (e.code === "KeyC") this.view && (this.view.camOrbit.radius = 140);
        else if (e.code === "KeyV") this._cycleCamera();
        else if (e.code === "Space" && this.snapshot && (this.snapshot.phase === "chutes" || this.snapshot.phase === "entry")) {
          this.command("DEPLOY_CHUTE");
        }
      }
      this.keys[e.code] = down;
    },

    _cycleCamera() {
      if (!this.view || !this.hud) return;
      const modes = ["auto", "external", "cockpit", "map"];
      const next = modes[(modes.indexOf(this.view.cameraMode) + 1) % modes.length];
      this.view.setCameraMode(next);
      this.hud.root.querySelectorAll("[data-art-cam]").forEach((b) => {
        b.classList.toggle("is-active", b.getAttribute("data-art-cam") === next);
      });
      this.hud.toast(`CAMERA: ${next.toUpperCase()}`);
    },

    _cycleWarp() {
      const max = (this.snapshot && this.snapshot.warpMax) || 1;
      const steps = [1, 10, 25, 100, 500, 1000, 10000].filter((w) => w <= max);
      if (!steps.length) return;
      const cur = this.snapshot ? this.snapshot.warpReq || 1 : 1;
      const idx = Math.max(0, steps.indexOf(cur));
      const next = steps[(idx + 1) % steps.length];
      this.command("SET_WARP", { factor: next });
    },

    _onState(sn) {
      if (!sn) return;
      const prev = this.snapshot;
      this.snapshot = sn;
      if (this.hud) this.hud.update(sn);
      if (sn.phase !== this._toastPhase && sn.phase && this.hud) {
        this._toastPhase = sn.phase;
        if (sn.phase === "briefing") {
          this.hud.briefDismissed = false;
        } else {
          this.hud.toast(sn.phaseTitle || String(sn.phase).replace(/_/g, " ").toUpperCase());
        }
      }
      if (sn.eventHold && prev && !prev.eventHold && this.hud) {
        if (sn.eventHold === "chutes_main") this.hud.toast("9,000 FT — DEPLOY MAIN PARACHUTES [SPACE]");
        else if (sn.eventHold === "chutes_drogue") this.hud.toast("25,000 FT — DEPLOY FBC & DROGUE CHUTES");
      }
    },

    _onEvents(events) {
      if (!Array.isArray(events) || !this.hud) return;
      for (const e of events) {
        if (e.type === "FAILED") this.hud.toast(`FAILURE: ${e.reason || "checkpoint required"}`);
        if (e.type === "LIFTOFF") this.hud.toast("LIFTOFF — 8.8 MILLION LBS THRUST!");
        if (e.type === "SRB_SEPARATION") this.hud.toast("SRB SEPARATION CONFIRMED");
        if (e.type === "LAS_JETTISON") this.hud.toast("FAIRINGS & LAS JETTISONED");
        if (e.type === "CORE_SEPARATION") this.hud.toast("CORE STAGE SEPARATED");
        if (e.type === "COMM_BLACKOUT_START") this.hud.toast("LOS — FAR-SIDE RADIO BLACKOUT (EXPECTED)");
        if (e.type === "PERILUNE_CLOSEST_APPROACH") this.hud.toast("CLOSEST LUNAR APPROACH (~4,600 MILES)");
        if (e.type === "COMM_BLACKOUT_END") this.hud.toast("AOS — COMMUNICATIONS RESTORED!");
        if (e.type === "SPLASHDOWN") this.hud.toast("PACIFIC OCEAN SPLASHDOWN CONFIRMED!");
        if (e.type === "RECOVERY_COMPLETE" && e.result) {
          this._onResult({ result: e.result, debrief: e.result });
        }
      }
    },

    _onResult(data) {
      if (!data || !this.hud) return;
      const r = data.result || {};
      const d = Object.assign({}, r, data.debrief || {});
      const ok = !!r.success;
      const objList = (d.completedObjectives || [])
        .map((label) => `<li>${ESC(label)}</li>`)
        .join("");

      this.hud.root.querySelector("#art-modal-body").innerHTML = `
        <div class="art-kicker">${ok ? "ARTEMIS II CREWED LUNAR FLYBY COMPLETE" : r.abort ? "SAFE ABORT RECOVERY" : "MISSION INCOMPLETE"}</div>
        <h2>${ok ? "ALL 4 ASTRONAUTS &amp; ORION RECOVERED" : r.abort ? "EMERGENCY ABORT SPLASHDOWN COMPLETE" : "MISSION FAILED"}</h2>
        <p>${ok ? "Orion launched aboard SLS Block 1 from LC-39B, completed High Earth Orbit checkout and ICPS proximity operations, executed Trans-Lunar Injection, flew ~4,600 miles beyond the lunar far side through radio blackout, returned on a gravity-driven free-return trajectory, survived 25,000 mph / 4G / 5,000°F skip entry, deployed all 11 parachutes, and splashed down safely in the Pacific Ocean." : r.abort ? "An emergency abort return was flown safely to ocean recovery." : ESC((r.failure && r.failure.reason) || "Mission requirements were not met.")}</p>
        <div class="art-debrief-grid">
          <div><span>MISSION RESULT</span><b>${ok ? "SUCCESS" : r.abort ? "SAFE ABORT" : "FAILED"}</b></div>
          <div><span>DURATION (MET)</span><b>${fmtMET(d.met)} (${fmt(d.durationDays, 1)} d)</b></div>
          <div><span>MAX VELOCITY</span><b>${fmt(d.maxSpeedMph, 0)} mph (${fmt(d.maxSpeedMps, 0)} m/s)</b></div>
          <div><span>MAX EARTH DIST</span><b>${fmt(d.maxEarthDistMi, 0)} mi (${fmt(d.maxEarthDistKm, 0)} km)</b></div>
          <div><span>LUNAR CLOSEST</span><b>${d.closestLunarAltMi ? fmt(d.closestLunarAltMi, 0) + " mi (" + fmt(d.closestLunarAltKm, 0) + " km)" : "—"}</b></div>
          <div><span>PEAK ENTRY TEMP / G</span><b>${fmt(d.maxHeatTempF, 0)} °F / ${fmt(d.maxEntryG, 1)} G</b></div>
          <div><span>SPLASHDOWN SPEED</span><b>${d.splashdown ? fmt(d.splashdown.speedMph || d.splashdown.vertical * 2.237, 1) + " mph" : "—"}</b></div>
          <div><span>CREW &amp; ORION STATUS</span><b>${ESC(d.crewStatus || "SAFE")}</b></div>
        </div>
        ${objList ? `<div class="art-debrief-objs"><h4>COMPLETED MISSION OBJECTIVES (${(d.completedObjectives || []).length} / 13)</h4><ul>${objList}</ul></div>` : ""}
        <div class="art-brief-actions">
          <button id="art-result-close" type="button">CLOSE</button>
          <button id="art-result-replay" type="button">REPLAY MISSION</button>
          ${ok ? '<button id="art-result-lobby" type="button">RETURN TO LOBBY</button>' : '<button id="art-result-retry" type="button">RETRY CHECKPOINT</button>'}
        </div>`;
      const modal = this.hud.root.querySelector("#art-modal");
      modal.style.display = "flex";
      const close = this.hud.root.querySelector("#art-result-close");
      if (close) close.onclick = () => { modal.style.display = "none"; };
      const replay = this.hud.root.querySelector("#art-result-replay");
      if (replay) replay.onclick = () => { modal.style.display = "none"; this.command("RESTART"); };
      const lobby = this.hud.root.querySelector("#art-result-lobby");
      if (lobby) lobby.onclick = () => { this._returning = true; if (this.onReturnToLobby) this.onReturnToLobby(); };
      const retry = this.hud.root.querySelector("#art-result-retry");
      if (retry) {
        retry.onclick = () => {
          modal.style.display = "none";
          this.command("RETRY_CHECKPOINT", { name: ((this.snapshot && this.snapshot.checkpoints) || []).slice(-1)[0] });
        };
      }
    },

    _sendInputs() {
      if (!this.net) return;
      const sn = this.snapshot;
      if (!sn) return;
      const k = this.keys;
      const ax = (p, n) => (k[p] ? 1 : 0) - (k[n] ? 1 : 0);
      const flightInput = {
        pitch: ax("ArrowDown", "ArrowUp"),
        yaw: ax("ArrowLeft", "ArrowRight"),
        roll: ax("KeyE", "KeyQ"),
        tx: ax("KeyD", "KeyA"),
        ty: ax("KeyR", "KeyF"),
        tz: ax("KeyS", "KeyW"),
        fine: !!(k.ShiftLeft || k.ShiftRight)
      };
      if (sn.phase === "prox_ops" || sn.phase === "entry") {
        this.net.sendArtemisInput(flightInput);
      }
    },

    frame(dt) {
      if (!this.isActive || !this.view) return;
      this._sendInputs();
      const sn = this.snapshot;
      if (!sn) {
        this.renderer.setClearColor(0x02050a, 1);
        this.view.renderer.render(this.view.local, this.view.localCam);
        return;
      }
      this.view.update(sn, dt);
    },

    onRoomUpdate(room) {
      if (this.hud) this.hud.room = room;
    }
  };

  window.ArtemisView = ArtemisView;
  window.ArtemisHud = ArtemisHud;
  window.artemisGame = game;
})();
