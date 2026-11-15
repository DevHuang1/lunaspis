/*
 * artemis_game.js — client controller, 3D view and HUD for the Artemis lunar
 * expedition training scenario. The server owns mission truth; this module
 * only renders snapshots, sends duty-scoped commands/inputs and explains the
 * current phase. Visual assets labelled "proxy" are development models.
 */
(function () {
  "use strict";
  const T = window.THREE;
  const SIM = window.ArtemisSim;
  const LIB = window.ArtemisMissionLib || {};
  const DEG = Math.PI / 180;
  const ESC = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-US", { maximumFractionDigits: d == null ? 0 : d }) : "—";
  const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0;
  const fmtMET = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return `${String(Math.floor(s / 86400)).padStart(2, "0")}:${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  class ArtemisView {
    constructor(renderer) {
      this.renderer = renderer;
      this.map = new T.Scene();
      this.local = new T.Scene();
      this.mapCam = new T.PerspectiveCamera(55, 1, 0.01, 6000);
      this.localCam = new T.PerspectiveCamera(60, 1, 0.05, 60000);
      this.mapCam.position.set(0, 70, 130);
      this.camOrbit = { yaw: 0.2, pitch: 0.35, radius: 120 };
      this.localCam.position.set(0, 12, 35);
      this.dragging = false; this.lastPointer = null;
      this.trail = [];
      this.sls = null; this.slsReady = false;
      this.lander = null; this.terrain = null; this.surfaceGroup = null;
      this.astronautMeshes = new Map();
      this.markers = {};
      this._buildMap();
      this._buildLocal();
      this._loadSLS();
      this._bindPointer();
    }

    _buildMap() {
      const scene = this.map;
      scene.background = new T.Color(0x02050a);
      const starGeo = new T.BufferGeometry();
      const pos = new Float32Array(1800 * 3);
      let seed = 17; const rnd = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
      for (let i = 0; i < 1800; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        pos[i * 3] = 900 * s * Math.cos(th); pos[i * 3 + 1] = 900 * u; pos[i * 3 + 2] = 900 * s * Math.sin(th);
      }
      starGeo.setAttribute("position", new T.BufferAttribute(pos, 3));
      scene.add(new T.Points(starGeo, new T.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false })));
      const loader = new T.TextureLoader();
      const earth = new T.Mesh(new T.SphereGeometry(6.371, 64, 48), new T.MeshPhongMaterial({ map: loader.load("textures/earth/earth_day_4096.jpg"), emissive: new T.Color(0x06111f), shininess: 8 }));
      earth.name = "MapEarth"; scene.add(earth); this.earth = earth;
      const cloud = new T.Mesh(new T.SphereGeometry(6.386, 64, 48), new T.MeshLambertMaterial({ map: loader.load("textures/earth/earth_clouds_2048.png"), transparent: true, opacity: 0.42, depthWrite: false }));
      earth.add(cloud); this.cloud = cloud;
      const moon = new T.Mesh(new T.SphereGeometry(1.737, 48, 32), new T.MeshPhongMaterial({ map: loader.load("textures/planets/moon.jpg"), shininess: 2 }));
      moon.name = "MapMoon"; scene.add(moon); this.moon = moon;
      const ambient = new T.AmbientLight(0x223344, 0.7); scene.add(ambient);
      const sun = new T.DirectionalLight(0xfff3df, 2.2); sun.position.set(40, 20, 10); scene.add(sun);
      const trailGeo = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(1, 0, 0)]);
      this.trailLine = new T.Line(trailGeo, new T.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.9 }));
      scene.add(this.trailLine);
      this.earthMarker = this._marker(0xffd166, 0.35); scene.add(this.earthMarker);
      this.moonMarker = this._marker(0xcbd5e1, 0.22); scene.add(this.moonMarker);
      this.landerMarker = this._marker(0xfbbf24, 0.2); scene.add(this.landerMarker);
    }

    _marker(color, size) {
      const g = new T.Group();
      g.add(new T.Mesh(new T.SphereGeometry(size, 10, 8), new T.MeshBasicMaterial({ color })));
      g.add(new T.Mesh(new T.RingGeometry(size * 1.5, size * 2.2, 18), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: T.DoubleSide })));
      g.children[1].rotation.x = Math.PI / 2;
      return g;
    }

    _buildLocal() {
      const scene = this.local;
      scene.background = new T.Color(0x02050a);
      scene.add(new T.AmbientLight(0x8ea4bd, 0.55));
      const hemi = new T.HemisphereLight(0xa8c8ff, 0x11151c, 1.0); scene.add(hemi);
      const sun = new T.DirectionalLight(0xfff4dc, 2.2); sun.position.set(-30, 18, 12); scene.add(sun); this.localSun = sun;
      const ground = new T.Mesh(new T.PlaneGeometry(5000, 5000, 1, 1), new T.MeshStandardMaterial({ color: 0x252b33, roughness: 0.98 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -2.3; scene.add(ground); this.launchGround = ground;
      const launch = new T.Group(); launch.name = "ArtemisLaunchPad"; scene.add(launch); this.launchGroup = launch;
      const pad = new T.Mesh(new T.CylinderGeometry(24, 28, 2, 8), new T.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.95 }));
      pad.position.y = -1; launch.add(pad);
      const tower = new T.Group();
      for (let i = 0; i < 7; i++) {
        const b = new T.Mesh(new T.BoxGeometry(1.1, 8, 1.1), new T.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.4, roughness: 0.6 }));
        b.position.set(18, 4 + i * 7, 0); tower.add(b);
      }
      const arm = new T.Mesh(new T.BoxGeometry(12, 0.6, 1.2), new T.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.5 }));
      arm.position.set(12, 16, 0); tower.add(arm);
      launch.add(tower);
      const fallback = this._fallbackSLS(); fallback.position.y = 1; launch.add(fallback); this.fallbackSLS = fallback; this.sls = fallback;
      const moon = new T.Mesh(new T.SphereGeometry(1.737, 32, 24), new T.MeshPhongMaterial({ map: new T.TextureLoader().load("textures/planets/moon.jpg") }));
      moon.position.set(-180, 55, -260); scene.add(moon); this.localMoon = moon;
      this._buildTerrain();
      this._buildEntryScene();
      this.lander = this._buildLander(); this.lander.visible = false; scene.add(this.lander);
      this.capsule = this._buildCapsule(); this.capsule.visible = false; scene.add(this.capsule);
      this.surfaceGroup = new T.Group(); this.surfaceGroup.visible = false; scene.add(this.surfaceGroup);
      this.surfaceGroup.add(this._buildExperiment());
      this.surfaceGroup.add(this._buildSamples());
    }

    _fallbackSLS() {
      const g = new T.Group();
      const core = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 34, 18), new T.MeshStandardMaterial({ color: 0xd97732, roughness: 0.8 }));
      core.position.y = 21; g.add(core);
      const upper = new T.Mesh(new T.CylinderGeometry(1.8, 2.5, 9, 16), new T.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.2 }));
      upper.position.y = 42; g.add(upper);
      const orion = new T.Mesh(new T.ConeGeometry(2.2, 4.5, 18), new T.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.35 }));
      orion.position.y = 49; g.add(orion);
      for (const x of [-4.2, 4.2]) {
        const srb = new T.Mesh(new T.CylinderGeometry(1.25, 1.25, 30, 14), new T.MeshStandardMaterial({ color: 0xf1f5f9 }));
        srb.position.set(x, 19, 0); g.add(srb);
        const nose = new T.Mesh(new T.ConeGeometry(1.25, 4, 14), new T.MeshStandardMaterial({ color: 0xf1f5f9 }));
        nose.position.set(x, 36, 0); g.add(nose);
      }
      return g;
    }

    _loadSLS() {
      if (!window.THREE || !window.THREE.GLTFLoader) return;
      const loader = new T.GLTFLoader();
      loader.load("assets/artemis/sls_block1_orion_display.glb", (gltf) => {
        if (!gltf || !gltf.scene) return;
        const model = gltf.scene;
        const box = new T.Box3().setFromObject(model);
        const h = Math.max(0.001, box.max.y - box.min.y);
        const scale = 96 / h; // display model is approximately 60% of SLS height
        model.scale.setScalar(scale);
        model.updateMatrixWorld(true);
        const b2 = new T.Box3().setFromObject(model);
        model.position.y -= b2.min.y;
        model.position.x = 0; model.position.z = 0;
        model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        if (this.sls && this.sls.parent) this.sls.parent.remove(this.sls);
        this.sls = model; this.slsReady = true;
        this.launchGroup.add(model);
      }, undefined, () => { /* keep procedural fallback */ });
    }

    _buildTerrain() {
      const geo = new T.PlaneGeometry(2000, 2000, 90, 90);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      const colors = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const y = SIM.terrainHeight(x, z);
        p.setY(i, y);
        const shade = Math.max(0.22, Math.min(0.85, 0.48 + y / 120 + 0.12 * Math.sin(x * 0.03)));
        colors.push(shade * 0.92, shade * 0.95, shade);
      }
      geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const terrain = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0.0 }));
      terrain.name = "SouthPolarTerrain"; terrain.receiveShadow = true;
      this.local.add(terrain); this.terrain = terrain;
      const rocks = new T.Group();
      let seed = 23; const rnd = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
      for (let i = 0; i < 80; i++) {
        const x = (rnd() - 0.5) * 1800, z = (rnd() - 0.5) * 1800, r = 0.6 + rnd() * 3.2;
        const rock = new T.Mesh(new T.DodecahedronGeometry(r, 0), new T.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.95 }));
        rock.position.set(x, SIM.terrainHeight(x, z) + r * 0.35, z); rocks.add(rock);
      }
      this.local.add(rocks);
      const siteMarker = new T.Mesh(new T.RingGeometry(10, 14, 32), new T.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.6, side: T.DoubleSide }));
      siteMarker.rotation.x = -Math.PI / 2; siteMarker.position.y = SIM.terrainHeight(0, 0) + 0.2; siteMarker.name = "SiteMarker"; this.local.add(siteMarker); this.siteMarker = siteMarker;
    }

    _buildLander() {
      const g = new T.Group(); g.name = "BlueMoonProxy";
      const body = new T.Mesh(new T.CylinderGeometry(3.2, 3.8, 3.2, 8), new T.MeshStandardMaterial({ color: 0xd8dee9, metalness: 0.55, roughness: 0.45 }));
      body.position.y = 4.2; g.add(body);
      const cabin = new T.Mesh(new T.BoxGeometry(4.8, 2.4, 4.2), new T.MeshStandardMaterial({ color: 0xbfc7d5, metalness: 0.35, roughness: 0.5 }));
      cabin.position.y = 6.5; g.add(cabin);
      const glass = new T.Mesh(new T.BoxGeometry(2.4, 0.7, 0.08), new T.MeshBasicMaterial({ color: 0x67e8f9 }));
      glass.position.set(0, 6.8, 2.14); g.add(glass);
      const engine = new T.Mesh(new T.ConeGeometry(0.9, 2.2, 12), new T.MeshStandardMaterial({ color: 0x111827, metalness: 0.8 }));
      engine.position.y = 2.2; engine.rotation.x = Math.PI; g.add(engine);
      for (const [x, z] of [[-3.2, -2.4], [3.2, -2.4], [-3.2, 2.4], [3.2, 2.4]]) {
        const leg = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 5.4, 8), new T.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.7 }));
        leg.position.set(x, 2.0, z); leg.rotation.z = x > 0 ? -0.24 : 0.24; g.add(leg);
        const foot = new T.Mesh(new T.CylinderGeometry(0.55, 0.65, 0.18, 12), new T.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.5 }));
        foot.position.set(x + (x > 0 ? 0.55 : -0.55), 0.1, z); g.add(foot);
      }
      for (const x of [-5.4, 5.4]) {
        const panel = new T.Mesh(new T.BoxGeometry(0.08, 2.4, 4.8), new T.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.5, roughness: 0.3 }));
        panel.position.set(x, 5.2, 0); g.add(panel);
      }
      const dish = new T.Mesh(new T.ConeGeometry(0.65, 0.3, 18, 1, true), new T.MeshStandardMaterial({ color: 0xe5e7eb, side: T.DoubleSide }));
      dish.position.set(0, 8.0, 0); dish.rotation.x = Math.PI; g.add(dish);
      return g;
    }

    _buildCapsule() {
      const g = new T.Group(); g.name = "OrionProxy";
      const cm = new T.Mesh(new T.CylinderGeometry(2.4, 2.9, 2.2, 20), new T.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.4, roughness: 0.4 }));
      cm.position.y = 1.1; g.add(cm);
      const shield = new T.Mesh(new T.CylinderGeometry(2.95, 2.95, 0.35, 24), new T.MeshStandardMaterial({ color: 0x111827, roughness: 0.95 }));
      shield.position.y = -0.1; g.add(shield);
      const sm = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 2.0, 18), new T.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.4 }));
      sm.position.y = -1.2; g.add(sm);
      for (const x of [-4.1, 4.1]) {
        const wing = new T.Mesh(new T.BoxGeometry(3.8, 0.05, 1.2), new T.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.5 }));
        wing.position.set(x, -1.2, 0); g.add(wing);
      }
      this.chuteGroup = new T.Group();
      const canopy = new T.Mesh(new T.SphereGeometry(9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ color: 0xf8fafc, side: T.DoubleSide, transparent: true, opacity: 0.75 }));
      canopy.position.y = 16; this.chuteGroup.add(canopy);
      for (const x of [-6, 0, 6]) {
        const line = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 14, 4), new T.MeshBasicMaterial({ color: 0xe5e7eb }));
        line.position.set(x * 0.4, 9, 0); line.rotation.z = x * 0.02; this.chuteGroup.add(line);
      }
      g.add(this.chuteGroup); this.chuteGroup.visible = false;
      return g;
    }

    _buildExperiment() {
      const g = new T.Group(); g.name = "TrainingExperiment";
      const box = new T.Mesh(new T.BoxGeometry(1.4, 0.8, 1.0), new T.MeshStandardMaterial({ color: 0xd97732, metalness: 0.4 }));
      box.position.set(-75, SIM.terrainHeight(-75, 135) + 0.4, 135); g.add(box);
      const mast = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.6, 6), new T.MeshStandardMaterial({ color: 0xe5e7eb }));
      mast.position.set(-75, SIM.terrainHeight(-75, 135) + 1.6, 135); g.add(mast);
      return g;
    }

    _buildSamples() {
      const g = new T.Group(); g.name = "SampleMarkers";
      const add = (x, z, color) => {
        const m = new T.Mesh(new T.CylinderGeometry(0.35, 0.45, 0.5, 8), new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
        m.position.set(x, SIM.terrainHeight(x, z) + 0.3, z); g.add(m);
      };
      add(70, 95, 0x67e8f9); add(105, 145, 0x34d399); add(-135, 205, 0xfbbf24);
      return g;
    }

    _buildEntryScene() {
      const ocean = new T.Mesh(new T.PlaneGeometry(400, 400, 1, 1), new T.MeshStandardMaterial({ color: 0x0b3a66, roughness: 0.35, metalness: 0.1 }));
      ocean.rotation.x = -Math.PI / 2; ocean.position.y = -1; ocean.visible = false; this.local.add(ocean); this.ocean = ocean;
    }

    _bindPointer() {
      const el = this.renderer.domElement;
      el.addEventListener("pointerdown", (e) => { this.dragging = true; this.lastPointer = { x: e.clientX, y: e.clientY }; });
      window.addEventListener("pointerup", () => { this.dragging = false; this.lastPointer = null; });
      window.addEventListener("pointermove", (e) => {
        if (!this.dragging || !this.lastPointer) return;
        const dx = e.clientX - this.lastPointer.x, dy = e.clientY - this.lastPointer.y;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.camOrbit.yaw -= dx * 0.005; this.camOrbit.pitch = Math.max(-1.1, Math.min(1.1, this.camOrbit.pitch + dy * 0.004));
      });
      el.addEventListener("wheel", (e) => {
        if (!this.isActive) return;
        e.preventDefault(); this.camOrbit.radius = Math.max(12, Math.min(900, this.camOrbit.radius * (e.deltaY > 0 ? 1.12 : 0.89)));
      }, { passive: false });
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.mapCam.aspect = w / Math.max(1, h); this.mapCam.updateProjectionMatrix();
      this.localCam.aspect = w / Math.max(1, h); this.localCam.updateProjectionMatrix();
    }

    update(sn, dt) {
      const phase = sn.phase;
      const mapMode = ["outbound", "lunar_arrival", "lunar_orbit", "return", "earth_orbit"].includes(phase);
      const moonPos = new T.Vector3(sn.moon.r[0] / 1000, sn.moon.r[2] / 1000, -sn.moon.r[1] / 1000);
      this.moon.position.copy(moonPos);
      const orion = new T.Vector3(sn.vessel.orion.r[0] / 1000, sn.vessel.orion.r[2] / 1000, -sn.vessel.orion.r[1] / 1000);
      const lander = new T.Vector3(sn.vessel.lander.r[0] / 1000, sn.vessel.lander.r[2] / 1000, -sn.vessel.lander.r[1] / 1000);
      this.landerMarker.position.copy(lander);
      this.earthMarker.position.set(0, 6.8, 0);
      this.moonMarker.position.copy(moonPos);
      if (mapMode) {
        this.trail.push(orion.clone());
        if (this.trail.length > 900) this.trail.shift();
        if (this.trail.length > 2) {
          this.trailLine.geometry.dispose();
          this.trailLine.geometry = new T.BufferGeometry().setFromPoints(this.trail);
        }
        const focus = phase === "docking" ? orion : new T.Vector3(0, 0, 0).lerp(moonPos, 0.22);
        const r = this.camOrbit.radius * (phase === "outbound" || phase === "return" ? 1.6 : 0.7);
        this.mapCam.position.set(
          focus.x + Math.sin(this.camOrbit.yaw) * Math.cos(this.camOrbit.pitch) * r,
          focus.y + Math.sin(this.camOrbit.pitch) * r,
          focus.z + Math.cos(this.camOrbit.yaw) * Math.cos(this.camOrbit.pitch) * r
        );
        this.mapCam.up.set(0, 1, 0); this.mapCam.lookAt(focus);
        this.renderer.render(this.map, this.mapCam);
        return;
      }
      this.renderer.render(this.local, this.localCam);
    }

    renderLocal(sn, dt) {
      const phase = sn.phase;
      const lander = sn.vessel.lander;
      this.lander.visible = ["descent", "landed", "surface", "ascent", "docking", "reunion"].includes(phase);
      this.capsule.visible = ["entry", "splashdown", "docking", "reunion"].includes(phase);
      this.launchGroup.visible = ["launch", "briefing"].includes(phase);
      this.surfaceGroup.visible = phase === "surface" || phase === "landed";
      this.ocean.visible = phase === "splashdown";
      this.localMoon.visible = phase !== "splashdown";
      if (this.sls) this.sls.visible = phase === "launch";
      if (phase === "launch" || phase === "briefing") {
        const alt = Math.max(0, Math.min(120, (sn.launch.elapsed || 0) / 5));
        this.launchGroup.position.y = alt * 4;
        this.launchGroup.rotation.z = Math.min(0.28, (sn.launch.elapsed || 0) / 2200);
        const t = sn.launch.elapsed || 0;
        this.localCam.position.set(88, 48 + alt * 2, 128);
        this.localCam.lookAt(0, 48 + alt * 3, 0);
      } else if (phase === "docking" || phase === "reunion") {
        const d = sn.docking || {};
        const p = d.pos || [0, 0, 25];
        this.lander.position.set(p[0], p[1], -p[2]);
        this.capsule.position.set(0, 0, 0);
        this.localCam.position.set(p[0] + 9, p[1] + 7, -p[2] + 18);
        this.localCam.lookAt(0, 0, 0);
      } else if (phase === "descent" || phase === "landed") {
        const d = sn.descent || {};
        const site = SIM.siteById(d.siteId);
        this.lander.position.set((d.x || 0), Math.max(0, (d.alt || 0) - (d.terrainH || 0)) + 2.4, -(d.z || 0));
        this.lander.rotation.z = (d.pitch || 0) * 0.4;
        this.lander.rotation.x = (d.roll || 0) * 0.4;
        this.localCam.position.set(this.lander.position.x + 14, this.lander.position.y + 10, this.lander.position.z + 26);
        this.localCam.lookAt(this.lander.position.x, this.lander.position.y + 3, this.lander.position.z);
      } else if (phase === "surface") {
        const ast = Object.values(sn.surface.astronauts || {});
        const localId = window.netManager && window.netManager.socketId;
        const me = sn.surface.astronauts[localId] || ast[0];
        this._syncAstronauts(sn, ast);
        const x = me ? me.x : 0, z = me ? me.z : 0;
        const y = SIM.terrainHeight(x, z) + 1.7;
        const heading = me ? me.heading : 0;
        this.localCam.position.set(x + Math.sin(heading) * -2, y, -(z + Math.cos(heading) * -2));
        this.localCam.lookAt(x + Math.sin(heading) * 20, y - 0.4, -(z + Math.cos(heading) * 20));
        this.lander.position.set(0, SIM.terrainHeight(0, 0) + 2.4, 0);
      } else if (phase === "ascent" || phase === "reunion") {
        this.lander.position.set(0, 180 + (sn.t % 60) * 2, 0);
        this.localCam.position.set(18, 195, 30); this.localCam.lookAt(0, 180, 0);
      } else if (phase === "entry" || phase === "splashdown") {
        const alt = sn.entry.alt || 0;
        this.capsule.position.set(0, Math.max(0, alt / 1000), 0);
        this.chuteGroup.visible = !!sn.entry.chute;
        this.localCam.position.set(16, Math.max(6, alt / 1000 + 8), 24);
        this.localCam.lookAt(0, Math.max(0, alt / 1000), 0);
        this.lander.visible = false;
      } else {
        this.localCam.position.set(0, 16, 42); this.localCam.lookAt(0, 8, 0);
      }
      this.renderer.render(this.local, this.localCam);
    }

    _syncAstronauts(sn, list) {
      for (const a of list) {
        let mesh = this.astronautMeshes.get(a.id);
        if (!mesh) {
          mesh = new T.Group();
          const body = new T.Mesh(new T.CylinderGeometry(0.34, 0.4, 1.2, 8), new T.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.7 }));
          body.position.y = 1.0; mesh.add(body);
          const helmet = new T.Mesh(new T.SphereGeometry(0.32, 12, 8), new T.MeshStandardMaterial({ color: 0x67e8f9, metalness: 0.4, roughness: 0.2 }));
          helmet.position.y = 1.65; mesh.add(helmet);
          const pack = new T.Mesh(new T.BoxGeometry(0.56, 0.72, 0.32), new T.MeshStandardMaterial({ color: 0xd1d5db }));
          pack.position.set(0, 1.0, -0.42); mesh.add(pack);
          this.local.add(mesh); this.astronautMeshes.set(a.id, mesh);
        }
        mesh.visible = true;
        mesh.position.set(a.x, SIM.terrainHeight(a.x, a.z), -a.z);
        mesh.rotation.y = a.heading;
      }
      for (const [id, mesh] of this.astronautMeshes) if (!list.find((a) => a.id === id)) mesh.visible = false;
    }
  }

  class ArtemisHud {
    constructor(game) {
      this.game = game;
      this.root = document.createElement("div");
      this.root.id = "artemis-hud";
      this.root.innerHTML = `
        <div class="art-top">
          <div class="art-brand"><span class="art-kicker">ARTEMIS // LUNAR EXPEDITION</span><strong id="art-phase">BRIEFING</strong><span id="art-met">MET 00:00:00:00</span></div>
          <div class="art-top-right"><span id="art-warp">WARP 1×</span><span id="art-assist">ASSIST ON</span><button id="art-reassign" type="button">DUTIES</button><button id="art-help" type="button">HELP</button><button id="art-leave" type="button">LEAVE</button></div>
        </div>
        <div class="art-left"><h3>MISSION PLAN</h3><div id="art-objectives"></div><div class="art-crew" id="art-crew"></div></div>
        <div class="art-right"><h3>VEHICLES &amp; RESOURCES</h3><div id="art-resources"></div><div class="art-message" id="art-messages"></div></div>
        <div class="art-bottom"><div id="art-guidance"></div><div id="art-controls"></div><div id="art-instruments"></div></div>
        <div class="art-toast" id="art-toast"></div>
        <div class="art-modal" id="art-modal"><div class="art-modal-card"><div id="art-modal-body"></div><button id="art-modal-close" type="button">CLOSE</button></div></div>
        <div class="art-brief" id="art-brief"><div class="art-brief-card"><div class="art-kicker">DATED TRAINING SCENARIO</div><h2>ARTEMIS LUNAR EXPEDITION</h2><p>Blue Moon-style lunar-rendezvous training architecture. Launch on SLS, fly Orion to a low lunar orbit, dock with a pre-delivered lander, land at the south pole, complete two bounded EVA task sequences, return to Orion and splash down.</p><p class="art-small">Not an exact reconstruction of an unflown mission. Vehicle masses, transfer windows and several surface tasks are labelled training assumptions. The Moon moves; the trajectory is propagated from physical state. Use the mission plan and controls; assistance can be toggled.</p><div class="art-brief-actions"><button id="art-brief-go" type="button">AUTHORIZE LAUNCH</button><button id="art-brief-help" type="button">CONTROLS</button></div></div></div>
      `;
      document.body.appendChild(this.root);
      this.root.querySelector("#art-help").addEventListener("click", () => this.showHelp());
      this.root.querySelector("#art-brief-help").addEventListener("click", () => this.showHelp());
      this.root.querySelector("#art-reassign").addEventListener("click", () => this.showReassign());
      this.root.querySelector("#art-leave").addEventListener("click", () => game.exit());
      this.root.querySelector("#art-modal-close").addEventListener("click", () => this.root.querySelector("#art-modal").style.display = "none");
      this.root.querySelector("#art-brief-go").addEventListener("click", () => {
        this.root.querySelector("#art-brief").style.display = "none";
        game.command("START");
      });
    }
    dispose() { if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root); }
    toast(text) {
      const el = this.root.querySelector("#art-toast"); el.textContent = text; el.style.display = "block";
      clearTimeout(this._toastT); this._toastT = setTimeout(() => { el.style.display = "none"; }, 3800);
    }
    showHelp() {
      const body = this.root.querySelector("#art-modal-body");
      body.innerHTML = `<h3>ARTEMIS CONTROLS</h3>
        <p><b>Docking:</b> W/S close/back, A/D lateral, R/F up/down, arrow keys pitch/yaw, Q/E roll. Fine mode: Shift.</p>
        <p><b>Descent:</b> W/S throttle, A/D lateral, Q/E rotate, Space level hold. Auto Land is a training assist.</p>
        <p><b>Surface:</b> WASD walk, Shift sprint, mouse drag look, E interact with the nearest marker. Return to the lander before the suit reserve expires.</p>
        <p><b>Entry:</b> authorize ENTRY PREP, monitor heat/load, deploy parachutes at the prompt (Space).</p>
        <p><b>Time:</b> T cycles warp in coast phases; critical events pause automatically.</p>
        <p>Duties are gameplay assignments, not NASA procedures. Solo players can operate every station.</p>`;
      this.root.querySelector("#art-modal").style.display = "flex";
    }
    showReassign() {
      const sn = this.lastSnap;
      if (!sn || !sn.players) return;
      const flight = sn.players.filter((p) => p.team !== "ground");
      const rows = Object.entries(sn.duties || {}).map(([id, d]) => `<label class="art-reassign-row"><span>${ESC(d.label)}</span><select data-art-duty="${id}">${flight.map((p) => `<option value="${ESC(p.id)}" ${d.playerId === p.id ? "selected" : ""}>${ESC(p.name)} (${ESC(p.role)})</option>`).join("")}</select></label>`).join("");
      const body = this.root.querySelector("#art-modal-body");
      body.innerHTML = `<h3>CREW DUTIES</h3><p>Reassign stations without moving avatars or teleporting crew. The host or commander can change assignments between phases.</p>${rows}<button id="art-reassign-apply" type="button">APPLY DUTIES</button><p class="art-small">Recommended: surface pilot, surface science, Orion navigation, Orion systems. Solo players hold every duty.</p>`;
      this.root.querySelector("#art-modal").style.display = "flex";
      const apply = this.root.querySelector("#art-reassign-apply");
      if (apply) apply.onclick = () => {
        const changes = [...this.root.querySelectorAll("[data-art-duty]")].map((sel) => [sel.getAttribute("data-art-duty"), sel.value]);
        let pending = changes.length;
        if (!pending) return;
        changes.forEach(([duty, playerId]) => {
          game.net.reassignArtemisDuty(duty, playerId, () => {
            pending--;
            if (pending <= 0) this.root.querySelector("#art-modal").style.display = "none";
          });
        });
      };
    }

    update(sn) {
      this.lastSnap = sn;
      const q = (s) => this.root.querySelector(s);
      // Snapshot updates arrive at ~10 Hz. Replacing a button's innerHTML on
      // every packet detaches it between pointerdown and click, which makes
      // the HUD controls appear dead. Only replace markup when it changed.
      this._htmlCache = this._htmlCache || {};
      const setHtml = (selector, html) => {
        if (this._htmlCache[selector] === html) return;
        this._htmlCache[selector] = html;
        const el = q(selector); if (el) el.innerHTML = html;
      };
      q("#art-phase").textContent = String(sn.phase || "").replace(/_/g, " ").toUpperCase();
      q("#art-met").textContent = `MET ${fmtMET(sn.met)}`;
      q("#art-warp").textContent = `WARP ${sn.warp || 1}×`;
      q("#art-assist").textContent = `ASSIST ${sn.assist ? "ON" : "OFF"}`;
      setHtml("#art-objectives", (sn.objectives || []).map((o) => `<div class="art-obj ${o.status === "done" ? "is-done" : ""}"><i></i><span>${ESC(o.label)}</span><b>${o.status === "done" ? "DONE" : "PENDING"}</b></div>`).join(""));
      const duties = sn.duties || {};
      const dutyRows = Object.entries(duties).map(([id, d]) => `<div class="art-duty"><span>${ESC(d.label)}</span><b>${ESC(d.playerName || "OPEN")}</b></div>`).join("");
      setHtml("#art-crew", `<h4>DUTIES</h4>${dutyRows}`);
      const r = sn.resources || {};
      const bar = (label, value, max, color) => `<div class="art-bar"><div><span>${label}</span><b>${fmt(value)}${max != null ? " / " + fmt(max) : ""}</b></div><i><em style="width:${pct(value, max)}%;background:${color}"></em></i></div>`;
      setHtml("#art-resources", `
        ${bar("ORION MAIN PROPELLANT", r.orionProp, r.orionPropStart, "#67e8f9")}
        ${bar("LANDER DESCENT", r.landerDescent, r.landerDescentStart, "#fbbf24")}
        ${bar("LANDER ASCENT", r.landerAscent, r.landerAscentStart, "#34d399")}
        <div class="art-stat-row"><span>SAMPLES</span><b>${fmt(r.samples)} / 2</b></div>
        <div class="art-stat-row"><span>PHOTOS</span><b>${fmt(r.photos)}</b></div>
        <div class="art-small">All values are calculated training estimates. The lunar lander is a Blue Moon-style proxy.</div>`);
      setHtml("#art-messages", (sn.messages || []).slice(-5).map((m) => `<div class="art-msg ${m.level}">${ESC(m.text)}</div>`).join(""));
      setHtml("#art-guidance", this._guidance(sn));
      setHtml("#art-controls", this._controls(sn));
      setHtml("#art-instruments", this._instruments(sn));
      q("#art-brief").style.display = sn.phase === "briefing" ? "flex" : "none";
    }
    _guidance(sn) {
      if (sn.phase === "briefing") return `<b>TRAINING BRIEFING</b><p>This is a dated Blue Moon-style lunar-rendezvous scenario. It does not claim NASA selected Blue Origin. Read the mission plan, then authorize launch.</p>`;
      if (sn.phase === "launch") return `<b>AUTOMATIC ASCENT</b><p>SLS guidance controls pitch, throttle and staging. Monitor the stack and look around. Orbit insertion is validated from the physical parking state, not a timer.</p>`;
      if (sn.phase === "earth_orbit") return `<b>EARTH ORBIT CHECKOUT</b><p>Run CHECKOUT and ORION_CHECK, then authorize TLI. The transfer window and propellant cost are calculated from the current state.</p>`;
      if (sn.phase === "outbound") return `<b>OUTBOUND CRUISE</b><p>Use warp for the quiet coast. The Moon moves; the trajectory is propagated with Earth and Moon gravity. Capture is requested at the 20,000 km arrival gate.</p>`;
      if (sn.phase === "lunar_arrival") return `<b>LUNAR ARRIVAL GATE</b><p>Authorize CAPTURE to shape the approach and circularize at 100 km. Waiting too long will leave the capture window.</p>`;
      if (sn.phase === "lunar_orbit") return `<b>LUNAR RENDEZVOUS</b><p>Circularize if needed, then PHASING. The lander is 25 m ahead after phasing; fly the final RCS approach.</p>`;
      if (sn.phase === "docking" || sn.phase === "reunion") return `<b>FINAL APPROACH</b><p>Dock within the closure, lateral, alignment and rate limits. AUTO_DOCK is an assisted training mode.</p>`;
      if (sn.phase === "transfer") return `<b>CREW TRANSFER</b><p>Two crew transfer to the lander and two remain in Orion. Check the seal, suits, samples and descent/ascent reserves before undocking.</p>`;
      if (sn.phase === "descent") return `<b>POWERED DESCENT</b><p>Early braking is guided. At 2 km the pilot controls throttle and lateral motion. Touchdown limits: 2 m/s vertical, 1 m/s horizontal, 12° slope, 8° attitude.</p>`;
      if (sn.phase === "landed") return `<b>TOUCHDOWN CONFIRMED</b><p>Confirm the vehicle is stable, then EGRESS. The EVA has a two-hour training limit and a suit return reserve.</p>`;
      if (sn.phase === "surface") return `<b>SOUTH-POLAR EVA</b><p>Complete the survey/photo/sample A sequence and the experiment/sample B sequence. Return both crew to the lander before the suit reserve expires.</p>`;
      if (sn.phase === "ascent") return `<b>GUIDED LUNAR ASCENT</b><p>Ascent is guided and fuel-limited. Final reunion docking remains pilot-controlled.</p>`;
      if (sn.phase === "return_prep") return `<b>ORION RETURN PREP</b><p>Transfer crew and samples to Orion, run the Orion check, then authorize TEI. This is a separate Earth-return Lambert arc, not a reversed outbound path.</p>`;
      if (sn.phase === "return") return `<b>EARTH RETURN</b><p>Warp through the coast. Orion will reach the entry interface; heat shield and cabin preparation become live.</p>`;
      if (sn.phase === "entry") return `<b>ORION ENTRY</b><p>Authorize ENTRY PREP. Monitor heat and load. Deploy parachutes when the prompt appears.</p>`;
      if (sn.phase === "splashdown") return `<b>SPLASHDOWN</b><p>Recovery conditions are met. Open the debrief.</p>`;
      if (sn.phase === "debrief") return `<b>DEBRIEF</b><p>The mission result distinguishes full success, safe abort, failure and practice.</p>`;
      return "";
    }
    _controls(sn) {
      const allowed = sn.allowedCommands || [];
      const labels = {
        START: "AUTHORIZE LAUNCH", TLI: "AUTHORIZE TLI", CHECKOUT: "CHECKOUT", ORION_CHECK: "ORION CHECK",
        CAPTURE: "CAPTURE", CIRCULARIZE: "CIRCULARIZE", PHASING: "PHASING BURN", AUTO_DOCK: "AUTO DOCK",
        TRANSFER_CREW: "TRANSFER CREW", UNDOCK: "UNDOCK", SELECT_SITE: "SELECT SITE", BEGIN_DESCENT: "BEGIN DESCENT",
        AUTO_LAND: "AUTO LAND (ASSIST)", EGRESS: "EGRESS", END_EVA: "END EVA", ASCENT: "AUTHORIZE ASCENT",
        TRANSFER_RETURN: "TRANSFER TO ORION", TEI: "AUTHORIZE TEI", ENTRY_PREP: "PREPARE ENTRY",
        DEPLOY_CHUTE: "DEPLOY PARACHUTES", ABORT: "ABORT / RETURN", DEBRIEF: "OPEN DEBRIEF",
        SET_ASSIST: `ASSIST ${sn.assist ? "OFF" : "ON"}`, PAUSE: "PAUSE", EXIT: "LEAVE"
      };
      const buttons = allowed.filter((c) => !["SET_WARP", "RESTART", "RETRY_CHECKPOINT", "SURFACE_INTERACT", "SET_ASSIST", "PAUSE"].includes(c)).map((c) => {
        let args = {};
        if (c === "SELECT_SITE") {
          return `<div class="art-site-row">${SIM.SITES.map((s) => `<button type="button" data-art-cmd="SELECT_SITE" data-site="${s.id}" class="${sn.descent && sn.descent.siteId === s.id ? "is-active" : ""}">${ESC(s.name)}</button>`).join("")}</div>`;
        }
        return `<button type="button" data-art-cmd="${c}" class="${c === "ABORT" ? "is-danger" : ""}">${labels[c] || c.replace(/_/g, " ")}</button>`;
      }).join("");
      const retry = (sn.checkpoints || []).length ? `<button type="button" data-art-cmd="RETRY_CHECKPOINT">RETRY CHECKPOINT</button>` : "";
      return `<div class="art-buttons">${buttons}${retry}<button type="button" data-art-cmd="SET_ASSIST">${sn.assist ? "ASSIST OFF" : "ASSIST ON"}</button><button type="button" data-art-cmd="PAUSE">${sn.paused ? "RESUME" : "PAUSE"}</button></div>`;
    }
    _instruments(sn) {
      if (sn.phase === "docking" || sn.phase === "reunion") {
        const d = sn.docking || {};
        return `<div class="art-instruments-grid"><div><span>RANGE</span><b>${fmt(d.range, 1)} m</b></div><div><span>CLOSURE</span><b>${fmt(d.closure, 2)} m/s</b></div><div><span>LATERAL</span><b>${fmt(d.lateral, 2)} m</b></div><div><span>ALIGN</span><b>${fmt(d.alignErr, 1)}°</b></div></div><p class="art-small">Target limits: closure &lt; 0.12 m/s, lateral &lt; 0.22 m, alignment &lt; 5°.</p>`;
      }
      if (sn.phase === "descent") {
        const d = sn.descent || {};
        return `<div class="art-instruments-grid"><div><span>ALTITUDE</span><b>${fmt(d.alt, 0)} m</b></div><div><span>DESCENT</span><b>${fmt(-d.vy, 1)} m/s</b></div><div><span>HORIZONTAL</span><b>${fmt(Math.hypot(d.vx || 0, d.vz || 0), 1)} m/s</b></div><div><span>FUEL</span><b>${fmt(sn.lander && sn.lander.descentProp, 0)} kg</b></div><div><span>SLOPE</span><b>${fmt(d.slope, 1)}°</b></div><div><span>THROTTLE</span><b>${fmt((d.throttle || 0) * 100, 0)}%</b></div></div><p class="art-small">${d.final ? "FINAL DESCENT — W/S throttle, A/D lateral, Q/E rotate, Space level." : "GUIDED BRAKING — final descent starts at 2 km."}</p>`;
      }
      if (sn.phase === "surface") {
        const s = sn.surface || {};
        const ast = Object.values(s.astronauts || {});
        const me = ast[0];
        return `<div class="art-instruments-grid"><div><span>EVA TIME</span><b>${fmtMET(s.elapsed)}</b></div><div><span>O₂</span><b>${fmt(me && me.o2, 1)}%</b></div><div><span>BATTERY</span><b>${fmt(me && me.battery, 1)}%</b></div><div><span>SAMPLES</span><b>${fmt(s.samples)} / 2</b></div></div><p class="art-small">Nearest action: move to a glowing marker and press E. Return to the lander within 45 m before END EVA.</p>`;
      }
      if (sn.phase === "entry") {
        const e = sn.entry || {};
        return `<div class="art-instruments-grid"><div><span>ALTITUDE</span><b>${fmt(e.alt / 1000, 1)} km</b></div><div><span>SPEED</span><b>${fmt(e.speed, 0)} m/s</b></div><div><span>HEAT</span><b>${fmt(e.heat, 0)}</b></div><div><span>LOAD</span><b>${fmt(e.loadG, 2)} g</b></div></div><p class="art-small">${e.chute ? "PARACHUTES DEPLOYED — terminal descent." : "Heat shield forward. Deploy parachutes at the prompt."}</p>`;
      }
      return "";
    }
  }

  const game = {
    isActive: false, renderer: null, net: null, view: null, hud: null, snapshot: null,
    keys: {}, listeners: [], _sendInputAt: 0, _toastPhase: null,
    start(opts) {
      if (this.isActive) return;
      this.renderer = opts.renderer; this.net = opts.net; this.onLeave = opts.onLeave || null;
      this.onReturnToLobby = opts.onReturnToLobby || null;
      this.isActive = true; this.keys = {}; this.snapshot = this.net && this.net.artemisSnapshot || null;
      this.view = new ArtemisView(this.renderer); this.view.isActive = true; this.view.resize();
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
      if (window.glbManager && window.glbManager.hangarActive && typeof window.glbManager.closeHangar === "function") window.glbManager.closeHangar();
      const hangar = document.getElementById("glb-hangar-modal");
      if (hangar) hangar.style.display = "none";
      if (window.shipInterior && typeof window.shipInterior.hide === "function") window.shipInterior.hide();
      if (window.localCrew && window.localCrew.group) window.localCrew.group.visible = false;
      if (window.shuttleGame && window.shuttleGame.isActive) window.shuttleGame.exit();
      if (window.dockingSim && window.dockingSim.isActive) window.dockingSim.stop();
      const screenGame = document.getElementById("screen-game"); if (screenGame) screenGame.style.display = "none";
      const res = document.getElementById("lunaspis-resource-meters"); if (res) res.style.display = "none";
      for (const id of ["space-center-ground-hud", "ground-lcc-console", "launch-cutscene-overlay", "docking-hud-overlay", "ship-interior-hud", "hud-checklist-panel", "hud-crew-roster"]) {
        const el = document.getElementById(id); if (el) el.style.display = "none";
      }
      this._bind();
      this._netHandlers = {
        artemis_state: (sn) => this._onState(sn),
        artemis_events: (events) => this._onEvents(events),
        artemis_result: (data) => this._onResult(data),
        room_update: (room) => { if (this.hud && room) this.hud.room = room; }
      };
      for (const k of Object.keys(this._netHandlers)) this.net.on(k, this._netHandlers[k]);
      if (this.snapshot) this._onState(this.snapshot);
      console.log("[Artemis] client active");
    },
    _bind() {
      this._on(window, "keydown", (e) => this._key(e, true), true);
      this._on(window, "keyup", (e) => this._key(e, false), true);
      this._on(window, "resize", () => this.view && this.view.resize());
      this._on(document, "visibilitychange", () => { if (document.hidden) this.keys = {}; });
      this.hud.root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-art-cmd]");
        if (!btn) return;
        const cmd = btn.getAttribute("data-art-cmd");
        const args = {};
        if (cmd === "SELECT_SITE") args.siteId = btn.getAttribute("data-site");
        if (cmd === "RETRY_CHECKPOINT") args.name = (this.snapshot && this.snapshot.checkpoints || []).slice(-1)[0];
        this.command(cmd, args);
      });
    },
    _on(target, type, fn, capture) { target.addEventListener(type, fn, !!capture); this.listeners.push([target, type, fn, !!capture]); },
    exit(silent) {
      if (!this.isActive) return;
      for (const [t, type, fn, cap] of this.listeners) t.removeEventListener(type, fn, cap);
      this.listeners = [];
      if (this.net && this._netHandlers) for (const k of Object.keys(this._netHandlers)) this.net.off(k, this._netHandlers[k]);
      if (this.hud) this.hud.dispose();
      this.hud = null; this.view = null; this.isActive = false; this.keys = {};
      document.body.classList.remove("artemis-mode-active");
      const screenGame = document.getElementById("screen-game"); if (screenGame) screenGame.style.display = "flex";
      if (window.onWindowResize) window.onWindowResize();
      if (!silent && this.onLeave && !this._returning) this.onLeave();
    },
    command(type, args) {
      if (!this.net || !this.isActive) return;
      const p = this.net.sendArtemisCommand(type, args || {});
      p.then((r) => { if (r && !r.accepted && this.hud) this.hud.toast(r.reason || "Command rejected"); });
    },
    _key(e, down) {
      if (!this.isActive) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.stopImmediatePropagation();
      const flight = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyQ", "KeyE", "KeyI", "KeyK", "KeyJ", "KeyL", "KeyU", "KeyO", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
      if (flight.has(e.code) || e.code === "Tab") e.preventDefault();
      if (down && !e.repeat) {
        if (e.code === "KeyT") this._cycleWarp();
        else if (e.code === "KeyP") this.command("PAUSE");
        else if (e.code === "KeyH" || e.code === "F1") this.hud && this.hud.showHelp();
        else if (e.code === "KeyC") this.view && (this.view.camOrbit.radius = 120);
        else if (e.code === "Space" && this.snapshot && this.snapshot.phase === "entry") this.command("DEPLOY_CHUTE");
        else if (e.code === "KeyE" && this.snapshot && this.snapshot.phase === "surface") this._surfaceInteract();
      }
      this.keys[e.code] = down;
    },
    _cycleWarp() {
      const steps = [1, 10, 100, 1000];
      const cur = this.snapshot ? this.snapshot.warpReq || 1 : 1;
      const idx = Math.max(0, steps.indexOf(cur));
      const next = steps[(idx + 1) % steps.length];
      this.command("SET_WARP", { factor: next });
    },
    _surfaceInteract() {
      const sn = this.snapshot; if (!sn || !sn.surface) return;
      const me = sn.surface.astronauts && sn.surface.astronauts[this.net.socketId] || Object.values(sn.surface.astronauts || {})[0];
      if (!me) return;
      let best = null, bestD = Infinity;
      for (const [id, t] of Object.entries(sn.surface.targets || {})) {
        const d = Math.hypot(me.x - t.x, me.z - t.z);
        if (d < (t.r || 25) && d < bestD) { best = id; bestD = d; }
      }
      if (best) this.command("SURFACE_INTERACT", { target: best });
      else this.hud.toast("Move closer to a glowing sample, photo or experiment marker");
    },
    _onState(sn) {
      if (!sn) return;
      const prev = this.snapshot; this.snapshot = sn;
      if (this.hud) this.hud.update(sn);
      if (sn.phase !== this._toastPhase && sn.phase && this.hud) {
        this._toastPhase = sn.phase;
        if (sn.phase !== "briefing" && sn.phase !== "debrief") this.hud.toast(String(sn.phase).replace(/_/g, " ").toUpperCase());
      }
      if (sn.eventHold && prev && !prev.eventHold && this.hud) this.hud.toast(sn.eventHold === "chute" ? "DEPLOY PARACHUTES [SPACE]" : "GUIDANCE HOLD");
    },
    _onEvents(events) {
      if (!Array.isArray(events) || !this.hud) return;
      for (const e of events) {
        if (e.type === "FAILED") this.hud.toast(`FAILED: ${e.reason || "checkpoint required"}`);
        if (e.type === "TOUCHDOWN") this.hud.toast("TOUCHDOWN CONFIRMED");
        if (e.type === "SPLASHDOWN") this.hud.toast("SPLASHDOWN CONFIRMED");
        if (e.type === "CHECKPOINT_SAVED") this.hud.toast(`CHECKPOINT: ${String(e.name || "").toUpperCase()}`);
      }
    },
    _onResult(data) {
      if (!data || !this.hud) return;
      const r = data.result || {};
      const d = data.debrief || {};
      const ok = !!r.success;
      this.hud.root.querySelector("#art-modal-body").innerHTML = `
        <div class="art-kicker">${ok ? "EXPEDITION COMPLETE" : r.abort ? "SAFE ABORT" : "MISSION DEBRIEF"}</div>
        <h2>${ok ? "CREW RECOVERED" : r.abort ? "CREW RETURNED WITHOUT LANDING" : "MISSION INCOMPLETE"}</h2>
        <p>${ok ? "The crew landed at the lunar south pole, completed the surface tasks and returned safely to Earth." : r.abort ? "A physically feasible abort-return was flown. The landing did not occur." : ESC(r.failure && r.failure.reason || "The mission did not meet its return criteria.")}</p>
        <div class="art-debrief-grid">
          <div><span>SAMPLES</span><b>${fmt(d.samples)} / 2</b></div><div><span>PHOTOS</span><b>${fmt(d.photos)}</b></div>
          <div><span>ORION PROP</span><b>${fmt(d.fuel && d.fuel.orionPropKg)} kg</b></div><div><span>LANDER ASCENT</span><b>${fmt(d.fuel && d.fuel.landerAscentKg)} kg</b></div>
          <div><span>ASSISTANCE</span><b>${d.assistance ? "ON" : "OFF"}</b></div><div><span>RETRIES</span><b>${fmt(d.retries)}</b></div>
          <div><span>MISSION TIME</span><b>${fmtMET(d.met)}</b></div><div><span>SPLASHDOWN</span><b>${d.splashdown ? "CONFIRMED" : "—"}</b></div>
        </div>
        <p class="art-small">This is a training scenario. Published Artemis architecture, calculated trajectory values and hypothetical vehicle assumptions are separated in the mission manifest.</p>
        <div class="art-brief-actions"><button id="art-result-close" type="button">CLOSE</button>${ok ? '<button id="art-result-lobby" type="button">RETURN TO LOBBY</button>' : '<button id="art-result-retry" type="button">RETRY CHECKPOINT</button>'}</div>`;
      const modal = this.hud.root.querySelector("#art-modal"); modal.style.display = "flex";
      const close = this.hud.root.querySelector("#art-result-close"); if (close) close.onclick = () => { modal.style.display = "none"; };
      const lobby = this.hud.root.querySelector("#art-result-lobby"); if (lobby) lobby.onclick = () => { this._returning = true; if (this.onReturnToLobby) this.onReturnToLobby(); };
      const retry = this.hud.root.querySelector("#art-result-retry"); if (retry) retry.onclick = () => { modal.style.display = "none"; this.command("RETRY_CHECKPOINT", { name: (this.snapshot && this.snapshot.checkpoints || []).slice(-1)[0] }); };
    },
    _sendInputs() {
      if (!this.net) return;
      const sn = this.snapshot; if (!sn) return;
      const k = this.keys;
      const ax = (p, n) => (k[p] ? 1 : 0) - (k[n] ? 1 : 0);
      const docking = { pitch: ax("ArrowDown", "ArrowUp"), yaw: ax("ArrowLeft", "ArrowRight"), roll: ax("KeyE", "KeyQ"), tx: ax("KeyD", "KeyA"), ty: ax("KeyR", "KeyF"), tz: ax("KeyS", "KeyW"), fine: !!(k.ShiftLeft || k.ShiftRight) };
      const descent = { throttle: (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), tx: ax("KeyD", "KeyA"), tz: ax("KeyS", "KeyW"), roll: ax("KeyE", "KeyQ"), fine: !!k.ShiftLeft };
      if (sn.phase === "docking" || sn.phase === "reunion") this.net.sendArtemisInput(docking);
      if (sn.phase === "descent") this.net.sendArtemisInput(descent);
      if (sn.phase === "surface") this.net.sendArtemisSurfaceInput({ forward: ax("KeyW", "KeyS"), strafe: ax("KeyD", "KeyA"), turn: ax("ArrowRight", "ArrowLeft"), sprint: !!k.ShiftLeft });
    },
    frame(dt) {
      if (!this.isActive || !this.view) return;
      this._sendInputs();
      const sn = this.snapshot;
      if (!sn) { this.renderer.setClearColor(0x02050a, 1); this.view.renderer.render(this.view.local, this.view.localCam); return; }
      this.view.update(sn, dt);
      if (!["outbound", "lunar_arrival", "lunar_orbit", "return", "earth_orbit"].includes(sn.phase)) this.view.renderLocal(sn, dt);
    },
    onRoomUpdate(room) { if (this.hud) this.hud.room = room; }
  };

  window.ArtemisView = ArtemisView;
  window.ArtemisHud = ArtemisHud;
  window.artemisGame = game;
})();
