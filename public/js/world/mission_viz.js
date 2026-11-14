/**
 * ============================================================================
 * LUNASPIS // 3D NASA MISSION VIZ & GMAT TRAJECTORY THEATER
 * ============================================================================
 * Interactive 3D mission visualization inspired by NASA Mission Viz & GMAT:
 * - High-resolution 3D Earth with day/night, clouds, Rayleigh limb glow & umbra shadow cone
 * - Van Allen radiation belt shells, 3D Moon, Sun-Earth L2 Halo marker, & NEA target
 * - Dynamic trajectory propagation matching the crew's selected orbit:
 *   LEO (51.6°), ISS CubeSat Deployment (418 km), SSO (98.2°), HEO (Van Allen),
 *   Earth-Moon TLI -> LOI -> Lunar Polar Orbit, and Sun-Earth L2 Halo Orbit
 * - Live Ground Station Network cones (Regional, Near Space Network, DSN) & RF Link Beam
 * - Instantiates the crew's selected modular_spacecraft_*.glb bus along the trajectory
 * - Interactive Mission Event Timeline scrubber, time-warp & camera focus presets
 */

(function (window) {
  "use strict";

  const EARTH_RADIUS = 6.2;

  const TIMELINE_EVENTS = [
    { t: 0.02, id: "launch", label: "1. LIFTOFF", desc: "Rocket launches from Earth into space" },
    { t: 0.18, id: "burn", label: "2. ENGINE PUSH", desc: "Thrusters fire to steer onto our flight path" },
    { t: 0.42, id: "eclipse", label: "3. NIGHT SHADOW", desc: "Passing behind Earth using battery power" },
    { t: 0.62, id: "cme", label: "4. SPACE WEATHER", desc: "Shields protect the computer from space storms" },
    { t: 0.80, id: "science", label: "5. COLLECT & SEND", desc: "Tools gather science and beam it to Earth" },
    { t: 0.96, id: "eom", label: "6. CLEAN FINISH", desc: "Safely retiring the spacecraft with no space junk" }
  ];

  const BIO_TIMELINE_EVENTS = [
    { t: 0.02, id: "launch", label: "1. CARGO LAUNCH", desc: "Supply ship carries our space food pouches to the station" },
    { t: 0.18, id: "burn", label: "2. ADD WATER", desc: "Astronaut adds warm drinking water to wake up the yeast" },
    { t: 0.42, id: "eclipse", label: "3. WARM UP (30°C)", desc: "Mix for 1 minute and keep cozy in the warm box" },
    { t: 0.62, id: "cme", label: "4. 6-HOUR MIX", desc: "Gently shake the pouch after 6 hours so it grows evenly" },
    { t: 0.80, id: "science", label: "5. DEEP FREEZE", desc: "Wrap pouch and freeze at -80°C to preserve the nutrients" },
    { t: 0.96, id: "eom", label: "6. LAB CHECK", desc: "Thaw and test on Earth to confirm fresh vitamins were made" }
  ];

  const GROUND_STATION_COORDS = {
    regional_vhs: [
      { name: "Wallops Regional", lat: 37.9, lon: -75.5 },
      { name: "Darmstadt Uni", lat: 49.8, lon: 8.6 },
      { name: "Tsukuba Ground", lat: 36.1, lon: 140.1 }
    ],
    near_space_net: [
      { name: "Svalbard (NSN)", lat: 78.2, lon: 15.4 },
      { name: "McMurdo (NSN)", lat: -77.8, lon: 166.7 },
      { name: "White Sands", lat: 32.5, lon: -106.6 },
      { name: "Wallops (NSN)", lat: 37.9, lon: -75.5 }
    ],
    dsn_goldstone: [
      { name: "DSN Goldstone", lat: 35.4, lon: -116.9 },
      { name: "DSN Madrid", lat: 40.4, lon: -4.2 },
      { name: "DSN Canberra", lat: -35.4, lon: 149.0 }
    ]
  };

  function latLonToVec3(latDeg, lonDeg, radius) {
    const phi = (90 - latDeg) * (Math.PI / 180);
    const theta = (lonDeg + 180) * (Math.PI / 180);
    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    return new window.THREE.Vector3(x, y, z);
  }

  class MissionVizManager {
    constructor() {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.isActive = false;
      this.initialized = false;

      this.vizGroup = null;
      this.earthGroup = null;
      this.earthMesh = null;
      this.cloudMesh = null;
      this.moonGroup = null;
      this.asteroidGroup = null;
      this.l2Group = null;
      this.vanAllenGroup = null;
      this.umbraCone = null;
      this.orbitLine = null;
      this.orbitNodesGroup = null;
      this.groundGroup = null;
      this.stationNodes = [];
      this.rfBeamLine = null;
      this.craftGroup = null;
      this.craftModelId = null;

      this.progress = 0.14;
      this.playing = true;
      this.speedMultiplier = 1;
      this.cameraMode = "system"; // "system" | "craft" | "target"

      // Orbit camera spherical state
      this.camTarget = new window.THREE.Vector3(0, 0, 0);
      this.desiredTarget = new window.THREE.Vector3(0, 0, 0);
      this.camSpherical = { radius: 26, theta: 0.65, phi: 1.08 };
      this.desiredRadius = 26;
      this.isDragging = false;
      this.lastPointer = { x: 0, y: 0 };
      this.pointerPositions = new Map();
      this.pinchStartDist = 0;
      this.pinchStartRadius = 26;

      this.sunDir = new window.THREE.Vector3(1.0, 0.25, -0.55).normalize();
      this.lastDesignKey = "";
      this.cachedSamplePoints = [];
      this.uiRoot = null;
      this._savedState = null;
      this._lastHudSync = 0;
    }

    init(scene, camera, renderer) {
      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;
      if (this.initialized) return;
      this.initialized = true;

      const THREE = window.THREE;
      this.vizGroup = new THREE.Group();
      this.vizGroup.name = "NASA_Mission_Viz_Group";
      this.vizGroup.visible = false;
      this.scene.add(this.vizGroup);

      this._buildLighting();
      this._buildEarthAndUmbra();
      this._buildVanAllenBelts();
      this._buildTargetBodies();

      this.orbitNodesGroup = new THREE.Group();
      this.vizGroup.add(this.orbitNodesGroup);

      this.groundGroup = new THREE.Group();
      this.vizGroup.add(this.groundGroup);

      this.craftGroup = new THREE.Group();
      this.vizGroup.add(this.craftGroup);
      this._buildFallbackCraft();

      const beamGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 1, 0)
      ]);
      const beamMat = new THREE.LineBasicMaterial({
        color: 0x34d399,
        transparent: true,
        opacity: 0.9
      });
      this.rfBeamLine = new THREE.Line(beamGeo, beamMat);
      this.rfBeamLine.visible = false;
      this.vizGroup.add(this.rfBeamLine);

      this._bindPointerControls();
    }

    _buildLighting() {
      const THREE = window.THREE;
      const amb = new THREE.AmbientLight(0xcfe8ff, 0.52);
      const sun = new THREE.DirectionalLight(0xfff5e0, 2.25);
      sun.position.copy(this.sunDir).multiplyScalar(120);
      const rim = new THREE.DirectionalLight(0x38bdf8, 0.45);
      rim.position.copy(this.sunDir).multiplyScalar(-80);
      this.vizGroup.add(amb, sun, rim);
    }

    _buildEarthAndUmbra() {
      const THREE = window.THREE;
      this.earthGroup = new THREE.Group();
      this.vizGroup.add(this.earthGroup);

      const texLoader = new THREE.TextureLoader();
      const dayTex = texLoader.load("textures/earth/earth_day_4096.jpg");
      const specTex = texLoader.load("textures/earth/earth_specular_2048.jpg");
      const cloudTex = texLoader.load("textures/earth/earth_clouds_1024.png");

      const earthMat = new THREE.MeshPhongMaterial({
        map: dayTex,
        specularMap: specTex,
        specular: new THREE.Color(0x5ea2ff),
        shininess: 18
      });
      this.earthMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 48, 48), earthMat);
      this.earthGroup.add(this.earthMesh);

      const cloudMat = new THREE.MeshPhongMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      });
      this.cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 40, 40), cloudMat);
      this.earthGroup.add(this.cloudMesh);

      const atmoMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.14,
        side: THREE.BackSide
      });
      this.earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.045, 36, 36), atmoMat));

      // Equatorial reference ring
      const eqPts = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        eqPts.push(new THREE.Vector3(Math.cos(a) * EARTH_RADIUS * 1.02, 0, Math.sin(a) * EARTH_RADIUS * 1.02));
      }
      this.earthGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(eqPts),
        new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.2 })
      ));

      // Umbra eclipse shadow cylinder extending away from the Sun
      const umbraLen = 58;
      const umbraGeo = new THREE.CylinderGeometry(EARTH_RADIUS * 0.96, EARTH_RADIUS * 1.08, umbraLen, 32, 1, true);
      umbraGeo.translate(0, umbraLen * 0.5, 0);
      const umbraMat = new THREE.MeshBasicMaterial({
        color: 0x040712,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      this.umbraCone = new THREE.Mesh(umbraGeo, umbraMat);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        this.sunDir.clone().negate()
      );
      this.umbraCone.quaternion.copy(q);
      this.vizGroup.add(this.umbraCone);
    }

    _buildVanAllenBelts() {
      const THREE = window.THREE;
      this.vanAllenGroup = new THREE.Group();
      const innerBelt = new THREE.Mesh(
        new THREE.TorusGeometry(EARTH_RADIUS * 1.55, 0.85, 16, 72),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.14, wireframe: true })
      );
      innerBelt.rotation.x = Math.PI / 2;

      const outerBelt = new THREE.Mesh(
        new THREE.TorusGeometry(EARTH_RADIUS * 2.45, 1.35, 16, 72),
        new THREE.MeshBasicMaterial({ color: 0xec4899, transparent: true, opacity: 0.10, wireframe: true })
      );
      outerBelt.rotation.x = Math.PI / 2;

      this.vanAllenGroup.add(innerBelt, outerBelt);
      this.vizGroup.add(this.vanAllenGroup);
    }

    _buildTargetBodies() {
      const THREE = window.THREE;

      // 1. 3D Moon
      this.moonGroup = new THREE.Group();
      this.moonGroup.position.set(27, 2.2, -13);
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1.7, 32, 24),
        new THREE.MeshStandardMaterial({ color: 0xb8bec7, roughness: 0.94, metalness: 0.04 })
      );
      const southPolePin = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.55, 8),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9 })
      );
      southPolePin.position.set(0, -1.95, 0);
      southPolePin.rotation.x = Math.PI;
      this.moonGroup.add(moonMesh, southPolePin);
      this.vizGroup.add(this.moonGroup);

      // 2. Sun-Earth L2 Halo Anchor (anti-sunward direction)
      this.l2Group = new THREE.Group();
      this.l2Group.position.copy(this.sunDir).multiplyScalar(-26);
      const l2Marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true })
      );
      this.l2Group.add(l2Marker);
      this.vizGroup.add(this.l2Group);

      // 3. Near-Earth Asteroid (Bennu/Apophis)
      this.asteroidGroup = new THREE.Group();
      this.asteroidGroup.position.set(23, -1.8, 16);
      const astGeo = new THREE.IcosahedronGeometry(1.25, 1);
      const pos = astGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        const wobble = 0.84 + 0.24 * Math.sin(vx * 3.1 + vy * 2.4 + vz * 1.9);
        pos.setXYZ(i, vx * wobble, vy * wobble * 0.85, vz * wobble);
      }
      astGeo.computeVertexNormals();
      const astMesh = new THREE.Mesh(
        astGeo,
        new THREE.MeshStandardMaterial({ color: 0x5c574f, roughness: 0.95, metalness: 0.08 })
      );
      this.asteroidGroup.add(astMesh);
      this.vizGroup.add(this.asteroidGroup);
    }

    _buildFallbackCraft() {
      const THREE = window.THREE;
      this.craftGroup.clear();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, 0.65, 8),
        new THREE.MeshStandardMaterial({ color: 0xd0a15c, roughness: 0.35, metalness: 0.75 })
      );
      const wingMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, emissive: 0x0c2461, roughness: 0.25, metalness: 0.6 });
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.34), wingMat);
      wingL.position.set(-0.95, 0, 0);
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.03, 0.34), wingMat);
      wingR.position.set(0.95, 0, 0);
      const dish = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.14, 14),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 })
      );
      dish.position.set(0, 0.42, 0);
      dish.rotation.x = Math.PI;
      this.craftGroup.add(body, wingL, wingR, dish);
    }

    _syncSpacecraftModel(busGlbId) {
      if (!busGlbId || this.craftModelId === busGlbId) return;
      this.craftModelId = busGlbId;

      if (!window.glbManager) return;
      const cat = window.glbManager.catalog && window.glbManager.catalog[busGlbId];
      const file = cat ? cat.file : `assets/${busGlbId}.glb`;
      window.glbManager.loadGLB(file).then(() => {
        try {
          const inst = window.glbManager.instantiateModel(busGlbId, { scale: 1.0 });
          if (!inst) return;
          const box = new window.THREE.Box3().setFromObject(inst);
          const sz = new window.THREE.Vector3();
          box.getSize(sz);
          const maxDim = Math.max(sz.x, sz.y, sz.z, 0.01);
          const normScale = 1.45 / maxDim;
          inst.scale.multiplyScalar(normScale);
          const center = new window.THREE.Vector3();
          box.getCenter(center);
          inst.position.sub(center.multiplyScalar(normScale));

          this.craftGroup.clear();
          this.craftGroup.add(inst);
        } catch (e) {
          this._buildFallbackCraft();
        }
      }).catch(() => {});
    }

    _getTelemetry() {
      if (window.gameplay && typeof window.gameplay.evaluateMissionDesign === "function") {
        return window.gameplay.evaluateMissionDesign();
      }
      return null;
    }

    _rebuildTrajectoryFromDesign() {
      const THREE = window.THREE;
      const t = this._getTelemetry();
      if (!t) return;

      const designKey = [
        t.scenario.id,
        t.orbit.id,
        t.bus.glbId,
        t.gnd.id,
        t.com.id,
        t.prop.id,
        t.disposal ? t.disposal.id : ""
      ].join("|");

      if (designKey === this.lastDesignKey && this.cachedSamplePoints.length > 0) return;
      this.lastDesignKey = designKey;

      this._syncSpacecraftModel(t.bus.glbId);

      // Show/emphasize context bodies
      const isLunar = t.orbit.id === "lunar_polar_100" || t.scenario.id === "lunar_south_pole";
      const isL2 = t.orbit.id === "sun_earth_l2" || t.scenario.id === "space_telescope";
      const isAst = t.scenario.id === "asteroid_rendezvous";
      this.moonGroup.visible = true;
      this.moonGroup.scale.setScalar(isLunar ? 1.15 : 0.72);
      this.l2Group.visible = isL2;
      this.asteroidGroup.visible = isAst;
      this.vanAllenGroup.visible = t.orbit.id === "gto_heo" || t.orbit.radiationEnvKrad >= 45;

      // Generate 240-point parametric trajectory for selected orbit/scenario
      const pts = [];
      const N = 240;
      const orbitId = t.orbit.id;

      if (orbitId === "lunar_polar_100") {
        // Earth parking -> Trans-Lunar Injection arc -> Lunar Polar Mapping loops
        const moonPos = this.moonGroup.position;
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          if (u < 0.25) {
            const a = (u / 0.25) * Math.PI * 1.65;
            pts.push(new THREE.Vector3(Math.cos(a) * 7.6, Math.sin(a) * 1.4, Math.sin(a) * 7.6));
          } else if (u < 0.62) {
            const k = (u - 0.25) / 0.37;
            const p0 = new THREE.Vector3(Math.cos(Math.PI * 1.65) * 7.6, Math.sin(Math.PI * 1.65) * 1.4, Math.sin(Math.PI * 1.65) * 7.6);
            const p1 = new THREE.Vector3(14, 7.5, -18);
            const p2 = moonPos.clone().add(new THREE.Vector3(-2.8, 2.2, 0.5));
            const inv = 1 - k;
            pts.push(
              p0.multiplyScalar(inv * inv)
                .add(p1.multiplyScalar(2 * inv * k))
                .add(p2.multiplyScalar(k * k))
            );
          } else {
            const k = (u - 0.62) / 0.38;
            const a = k * Math.PI * 4.0;
            pts.push(new THREE.Vector3(
              moonPos.x + Math.cos(a) * 0.65,
              moonPos.y + Math.sin(a) * 2.55,
              moonPos.z + Math.cos(a) * 2.45
            ));
          }
        }
      } else if (orbitId === "sun_earth_l2") {
        const l2 = this.l2Group.position;
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          if (u < 0.42) {
            const k = u / 0.42;
            const p0 = new THREE.Vector3(7.5, 0.8, 0);
            const p1 = l2.clone().multiplyScalar(0.45).add(new THREE.Vector3(0, 5.5, 7));
            const p2 = l2.clone().add(new THREE.Vector3(0, 3.2, 0));
            const inv = 1 - k;
            pts.push(p0.multiplyScalar(inv * inv).add(p1.multiplyScalar(2 * inv * k)).add(p2.multiplyScalar(k * k)));
          } else {
            const k = (u - 0.42) / 0.58;
            const a = k * Math.PI * 2.0;
            pts.push(new THREE.Vector3(
              l2.x + Math.sin(a) * 2.2,
              l2.y + Math.cos(a) * 3.4,
              l2.z + Math.sin(a * 1.0) * 4.4
            ));
          }
        }
      } else if (isAst) {
        const ast = this.asteroidGroup.position;
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          if (u < 0.55) {
            const k = u / 0.55;
            const p0 = new THREE.Vector3(7.6, 0, 0);
            const p1 = new THREE.Vector3(16, 4.5, 4);
            const p2 = ast.clone().add(new THREE.Vector3(-2.4, 0, 0));
            const inv = 1 - k;
            pts.push(p0.multiplyScalar(inv * inv).add(p1.multiplyScalar(2 * inv * k)).add(p2.multiplyScalar(k * k)));
          } else {
            const k = (u - 0.55) / 0.45;
            const a = k * Math.PI * 4.0;
            pts.push(new THREE.Vector3(
              ast.x + Math.cos(a) * 2.4,
              ast.y + Math.sin(a) * 0.9,
              ast.z + Math.sin(a) * 2.4
            ));
          }
        }
      } else if (orbitId === "gto_heo") {
        // Highly Elliptical 500x35,786 km crossing Van Allen belts
        const aAxis = 13.6;
        const e = 0.48;
        const inc = (27 * Math.PI) / 180;
        for (let i = 0; i <= N; i++) {
          const theta = (i / N) * Math.PI * 2;
          const r = (aAxis * (1 - e * e)) / (1 + e * Math.cos(theta));
          const x = r * Math.cos(theta) - 3.6;
          const z0 = r * Math.sin(theta);
          pts.push(new THREE.Vector3(x, z0 * Math.sin(inc), z0 * Math.cos(inc)));
        }
      } else if (orbitId === "sso_705") {
        const r = 8.15;
        const inc = (98.2 * Math.PI) / 180;
        for (let i = 0; i <= N; i++) {
          const theta = (i / N) * Math.PI * 2;
          const x = r * Math.cos(theta);
          const z0 = r * Math.sin(theta);
          pts.push(new THREE.Vector3(x * Math.cos(inc), z0, x * Math.sin(inc) * 0.35 + z0 * 0.15));
        }
      } else {
        // leo_400 or iss_cubesat_418 (with end-of-mission decay spiral cue for deployable cubesats)
        const baseR = orbitId === "iss_cubesat_418" ? 7.55 : 7.4;
        const inc = (51.6 * Math.PI) / 180;
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const theta = u * Math.PI * 2;
          const decay = orbitId === "iss_cubesat_418" && !t.scenario.isBioPayload && u > 0.78 ? (u - 0.78) * 1.8 : 0;
          const r = Math.max(EARTH_RADIUS + 0.35, baseR - decay);
          const x = r * Math.cos(theta);
          const z0 = r * Math.sin(theta);
          pts.push(new THREE.Vector3(x, z0 * Math.sin(inc), z0 * Math.cos(inc)));
        }
      }

      this.cachedSamplePoints = pts;

      if (this.orbitLine && this.orbitLine.parent) {
        this.orbitLine.parent.remove(this.orbitLine);
      }
      const orbitColor = t.deltaVOk ? 0x67e8f9 : 0xf87171;
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({ color: orbitColor, transparent: true, opacity: 0.92 });
      this.orbitLine = new THREE.Line(lineGeo, lineMat);
      this.vizGroup.add(this.orbitLine);
      this._syncTimelineChips();

      // Maneuver & Timeline Nodes along the curve
      this.orbitNodesGroup.clear();
      TIMELINE_EVENTS.forEach((ev) => {
        const idx = Math.min(pts.length - 1, Math.floor(ev.t * (pts.length - 1)));
        const p = pts[idx];
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 12, 12),
          new THREE.MeshBasicMaterial({
            color: ev.id === "cme" ? 0xf59e0b : ev.id === "burn" ? 0x38bdf8 : ev.id === "eom" ? 0xa78bfa : 0x34d399
          })
        );
        marker.position.copy(p);
        this.orbitNodesGroup.add(marker);
      });

      // Rebuild Ground Station pins & coverage cones on Earth
      this.groundGroup.clear();
      this.stationNodes = [];
      const coords = GROUND_STATION_COORDS[t.gnd.id] || GROUND_STATION_COORDS.near_space_net;
      coords.forEach((st) => {
        const pos = latLonToVec3(st.lat, st.lon, EARTH_RADIUS + 0.08);
        const normal = pos.clone().normalize();
        const stationPin = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xa78bfa })
        );
        stationPin.position.copy(pos);

        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(1.75, 3.2, 18, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x9a8fc4,
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        cone.position.copy(pos.clone().add(normal.clone().multiplyScalar(1.6)));
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), normal);

        this.groundGroup.add(stationPin, cone);
        this.stationNodes.push({ name: st.name, pin: stationPin });
      });
    }

    _sampleCraftPosition(u) {
      const pts = this.cachedSamplePoints;
      if (!pts.length) return { pos: new window.THREE.Vector3(8, 0, 0), tangent: new window.THREE.Vector3(0, 0, 1) };
      const f = Math.max(0, Math.min(1, u)) * (pts.length - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(pts.length - 1, i0 + 1);
      const alpha = f - i0;
      const pos = pts[i0].clone().lerp(pts[i1], alpha);
      const tangent = pts[Math.min(pts.length - 1, i0 + 1)].clone().sub(pts[Math.max(0, i0 - 1)]).normalize();
      return { pos, tangent };
    }

    _isInEarthShadow(pos) {
      const proj = pos.dot(this.sunDir);
      if (proj >= 0) return false;
      const perpSq = pos.lengthSq() - proj * proj;
      return perpSq < EARTH_RADIUS * EARTH_RADIUS;
    }

    _bindPointerControls() {
      const dom = this.renderer && this.renderer.domElement;
      if (!dom) return;

      dom.addEventListener("pointerdown", (e) => {
        if (!this.isActive) return;
        if (e.target !== dom) return;
        this.pointerPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointerPositions.size === 1) {
          this.isDragging = true;
          this.lastPointer = { x: e.clientX, y: e.clientY };
        } else if (this.pointerPositions.size === 2) {
          const pts = Array.from(this.pointerPositions.values());
          this.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this.pinchStartRadius = this.desiredRadius;
        }
      });

      window.addEventListener("pointermove", (e) => {
        if (!this.isActive) return;
        if (!this.pointerPositions.has(e.pointerId)) return;
        this.pointerPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.pointerPositions.size === 2) {
          const pts = Array.from(this.pointerPositions.values());
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this.pinchStartDist > 10) {
            this.desiredRadius = Math.max(8, Math.min(68, this.pinchStartRadius * (this.pinchStartDist / Math.max(10, d))));
          }
          return;
        }

        if (!this.isDragging) return;
        const dx = e.clientX - this.lastPointer.x;
        const dy = e.clientY - this.lastPointer.y;
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.camSpherical.theta -= dx * 0.007;
        this.camSpherical.phi = Math.max(0.18, Math.min(Math.PI - 0.18, this.camSpherical.phi - dy * 0.007));
      });

      const endPtr = (e) => {
        this.pointerPositions.delete(e.pointerId);
        if (this.pointerPositions.size < 2) this.pinchStartDist = 0;
        if (this.pointerPositions.size === 0) this.isDragging = false;
      };
      window.addEventListener("pointerup", endPtr);
      window.addEventListener("pointercancel", endPtr);

      dom.addEventListener("wheel", (e) => {
        if (!this.isActive) return;
        e.preventDefault();
        this.desiredRadius = Math.max(8, Math.min(68, this.desiredRadius + e.deltaY * 0.02));
      }, { passive: false });
    }

    _ensureUI() {
      if (this.uiRoot) return;
      const root = document.createElement("div");
      root.id = "mission-viz-ui";
      root.style.cssText = `
        display:none;
        position:fixed;
        inset:0;
        z-index:160;
        pointer-events:none;
        font-family:var(--font-mono, monospace);
        color:#ece7dc;
      `;

      root.innerHTML = `
        <div id="mv-topbar" style="pointer-events:auto;position:absolute;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 14px;border-radius:4px;background:rgba(8,13,24,0.88);border:1px solid rgba(148,163,184,0.22);backdrop-filter:blur(8px);">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="width:7px;height:7px;border-radius:2px;background:#2563eb;"></span>
            <div>
              <div style="font-size:11px;font-weight:700;letter-spacing:1.4px;color:#f8fafc;" id="mv-title">3D EARTH &amp; SPACE FLIGHT MAP</div>
              <div style="font-size:10px;color:#94a3b8;" id="mv-subtitle">Drag to spin &middot; Scroll/Pinch to zoom &middot; Scrub the Mission Timeline below</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button type="button" id="mv-btn-cam-sys" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(37,99,235,0.6);background:rgba(37,99,235,0.16);color:#f8fafc;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;">FULL EARTH VIEW</button>
            <button type="button" id="mv-btn-cam-craft" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(148,163,184,0.22);background:rgba(8,13,24,0.75);color:#f8fafc;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;">FOLLOW CRAFT</button>
            <button type="button" id="mv-btn-cam-target" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(148,163,184,0.22);background:rgba(8,13,24,0.75);color:#f8fafc;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;">ZOOM TARGET</button>
            <button type="button" id="mv-btn-gmat" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(52,211,153,0.48);background:rgba(16,185,129,0.16);color:#a7f3d0;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;" title="Download flight path file">FLIGHT PATH FILE</button>
            <button type="button" id="mv-btn-csa-lab" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(103,232,249,0.48);background:rgba(103,232,249,0.14);color:#67e8f9;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;" title="Open Space Games &amp; Learning Activities">GAMES &amp; TOOLS</button>
            <button type="button" id="mv-btn-vr" style="padding:5px 10px;border-radius:4px;border:1px solid rgba(148,163,184,0.28);background:rgba(8,13,24,0.75);color:#93c5fd;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;">VR MODE</button>
            <button type="button" id="mv-btn-close" style="padding:5px 12px;border-radius:4px;border:1px solid rgba(220,38,38,0.55);background:rgba(220,38,38,0.14);color:#fecaca;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;">EXIT [U]</button>
          </div>
        </div>

        <div id="mv-telemetry-card" style="pointer-events:auto;position:absolute;top:74px;left:12px;width:295px;max-width:calc(100vw - 24px);padding:12px;border-radius:4px;background:rgba(8,13,24,0.88);border:1px solid rgba(148,163,184,0.22);backdrop-filter:blur(8px);font-size:10.5px;">
          <div style="font-size:9.5px;font-weight:700;letter-spacing:1.3px;color:#93c5fd;margin-bottom:8px;">LIVE ORBIT &amp; SIGNAL STATUS</div>
          <div id="mv-telemetry-rows" style="display:grid;grid-template-columns:1fr 1fr;gap:6px;"></div>
          <div id="mv-segment-badges" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:9px;padding-top:8px;border-top:1px solid rgba(148,163,184,0.16);"></div>
        </div>

        <div id="mv-timeline-bar" style="pointer-events:auto;position:absolute;bottom:14px;left:12px;right:12px;padding:10px 14px;border-radius:4px;background:rgba(8,13,24,0.9);border:1px solid rgba(148,163,184,0.22);backdrop-filter:blur(8px);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:7px;">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <button type="button" id="mv-btn-play" style="padding:5px 10px;border-radius:4px;border:1px solid #2563eb;background:rgba(37,99,235,0.2);color:#f8fafc;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;">PAUSE</button>
              <button type="button" id="mv-btn-speed" style="padding:5px 9px;border-radius:4px;border:1px solid rgba(148,163,184,0.22);background:rgba(8,13,24,0.75);color:#f8fafc;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;">1x</button>
              <span id="mv-event-active" style="font-size:10px;font-weight:700;color:#86efac;margin-left:4px;">LIFTOFF</span>
            </div>
            <div id="mv-event-chips" style="display:flex;gap:5px;flex-wrap:wrap;"></div>
          </div>
          <input type="range" id="mv-timeline-slider" min="0" max="1000" value="140" style="width:100%;accent-color:#2563eb;cursor:pointer;" />
        </div>
      `;

      document.body.appendChild(root);
      this.uiRoot = root;

      root.querySelector("#mv-btn-close").addEventListener("click", () => this.close());
      root.querySelector("#mv-btn-cam-sys").addEventListener("click", () => this._setCameraMode("system"));
      root.querySelector("#mv-btn-cam-craft").addEventListener("click", () => this._setCameraMode("craft"));
      root.querySelector("#mv-btn-cam-target").addEventListener("click", () => this._setCameraMode("target"));

      root.querySelector("#mv-btn-vr").addEventListener("click", () => {
        if (window.vrManager && typeof window.vrManager.toggleVR === "function") {
          window.vrManager.toggleVR();
        }
      });

      const gmatBtn = root.querySelector("#mv-btn-gmat");
      if (gmatBtn) {
        gmatBtn.addEventListener("click", () => {
          if (window.csaNasaLab && typeof window.csaNasaLab.exportGmatScript === "function") {
            window.csaNasaLab.exportGmatScript();
          }
        });
      }

      const csaBtn = root.querySelector("#mv-btn-csa-lab");
      if (csaBtn) {
        csaBtn.addEventListener("click", () => {
          if (window.csaNasaLab && typeof window.csaNasaLab.openModal === "function") {
            window.csaNasaLab.openModal("gmat");
          }
        });
      }

      const playBtn = root.querySelector("#mv-btn-play");
      playBtn.addEventListener("click", () => {
        this.playing = !this.playing;
        playBtn.textContent = this.playing ? "PAUSE" : "PLAY";
      });

      const speedBtn = root.querySelector("#mv-btn-speed");
      const speeds = [1, 4, 12];
      speedBtn.addEventListener("click", () => {
        const idx = (speeds.indexOf(this.speedMultiplier) + 1) % speeds.length;
        this.speedMultiplier = speeds[idx];
        speedBtn.textContent = `${this.speedMultiplier}x`;
      });

      const slider = root.querySelector("#mv-timeline-slider");
      slider.addEventListener("input", () => {
        this.progress = Number(slider.value) / 1000;
      });

      this._syncTimelineChips();
    }

    _syncTimelineChips() {
      if (!this.uiRoot) return;
      const chipsHost = this.uiRoot.querySelector("#mv-event-chips");
      const slider = this.uiRoot.querySelector("#mv-timeline-slider");
      if (!chipsHost) return;
      const t = this._getTelemetry();
      const events = (t && t.scenario && t.scenario.isBioPayload) ? BIO_TIMELINE_EVENTS : TIMELINE_EVENTS;
      chipsHost.innerHTML = events.map((ev) => `
        <button type="button" data-ev-t="${ev.t}" title="${ev.desc}" style="padding:3px 7px;border-radius:4px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:#cbd5e1;font-family:inherit;font-size:9px;cursor:pointer;">${ev.label}</button>
      `).join("");
      chipsHost.querySelectorAll("[data-ev-t]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.progress = Number(btn.dataset.evT);
          if (slider) slider.value = String(Math.round(this.progress * 1000));
        });
      });
    }

    _setCameraMode(mode) {
      this.cameraMode = mode;
      if (mode === "system") {
        this.desiredTarget.set(0, 0, 0);
        this.desiredRadius = 26;
      } else if (mode === "craft") {
        this.desiredRadius = 6.5;
      } else if (mode === "target") {
        const t = this._getTelemetry();
        if (t && t.orbit.id === "sun_earth_l2") {
          this.desiredTarget.copy(this.l2Group.position);
        } else if (t && t.scenario.id === "asteroid_rendezvous") {
          this.desiredTarget.copy(this.asteroidGroup.position);
        } else {
          this.desiredTarget.copy(this.moonGroup.position);
        }
        this.desiredRadius = 9.5;
      }
      if (this.uiRoot) {
        const map = { system: "#mv-btn-cam-sys", craft: "#mv-btn-cam-craft", target: "#mv-btn-cam-target" };
        Object.keys(map).forEach((k) => {
          const el = this.uiRoot.querySelector(map[k]);
          if (!el) return;
          const active = k === mode;
          el.style.borderColor = active ? "rgba(103,232,249,0.55)" : "rgba(255,255,255,0.18)";
          el.style.background = active ? "rgba(103,232,249,0.16)" : "rgba(255,255,255,0.05)";
        });
      }
    }

    open() {
      if (!this.initialized) return;
      if (this.isActive) return;

      if (window.gameplay && window.gameplay.activeTask) {
        window.gameplay.closeTaskModal();
      }
      if (window.issShowcase && window.issShowcase.isActive) {
        window.issShowcase.close();
      }
      if (window.solarSystem && window.solarSystem.isActive) {
        window.solarSystem.close();
      }
      if (window.glbManager && window.glbManager.hangarActive) {
        window.glbManager.closeHangar();
      }

      this._savedState = {
        issVisible: window.issGroup ? window.issGroup.visible : true,
        earthVisible: window.photorealisticEarth && window.photorealisticEarth.group ? window.photorealisticEarth.group.visible : true,
        localVisible: window.localCrew && window.localCrew.group ? window.localCrew.group.visible : true,
        interiorActive: window.shipInterior ? window.shipInterior.isInteriorActive : false,
        interiorVisible: window.shipInterior && window.shipInterior.group ? window.shipInterior.group.visible : false,
        moonLandingActive: window.shipInterior ? window.shipInterior.isMoonLandingActive : false,
        groundMode: window.spaceCenter ? window.spaceCenter.isGroundMode : false,
        groundGroupVisible: window.spaceCenter && window.spaceCenter.group ? window.spaceCenter.group.visible : false,
        bg: this.scene.background ? this.scene.background.clone() : null,
        fog: this.scene.fog
      };

      if (window.issGroup) window.issGroup.visible = false;
      if (window.photorealisticEarth && window.photorealisticEarth.group) window.photorealisticEarth.group.visible = false;
      if (window.localCrew && window.localCrew.group) window.localCrew.group.visible = false;
      if (window.shipInterior) {
        if (window.shipInterior.isMoonLandingActive && typeof window.shipInterior.toggleMoonLandingScene === "function") {
          window.shipInterior.toggleMoonLandingScene(false);
        }
        if (window.shipInterior.group) window.shipInterior.group.visible = false;
      }
      if (window.spaceCenter && window.spaceCenter.group) {
        window.spaceCenter.group.visible = false;
      }

      this.scene.background = new window.THREE.Color(0x02050d);
      this.scene.fog = null;

      this.isActive = true;
      this.lastDesignKey = "";
      this._rebuildTrajectoryFromDesign();
      this._ensureUI();
      this.uiRoot.style.display = "block";
      document.body.classList.add("mission-viz-active");
      this._setCameraMode("system");
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    close() {
      if (!this.isActive) return;
      this.isActive = false;
      this.vizGroup.visible = false;
      if (this.uiRoot) this.uiRoot.style.display = "none";
      document.body.classList.remove("mission-viz-active");

      if (this._savedState) {
        if (window.issGroup) window.issGroup.visible = this._savedState.issVisible;
        if (window.photorealisticEarth && window.photorealisticEarth.group) {
          window.photorealisticEarth.group.visible = this._savedState.earthVisible;
        }
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.visible = this._savedState.localVisible;
        }
        if (window.shipInterior && window.shipInterior.group) {
          window.shipInterior.group.visible = this._savedState.interiorVisible;
        }
        if (window.spaceCenter && window.spaceCenter.group) {
          window.spaceCenter.group.visible = this._savedState.groundGroupVisible;
        }
        if (this._savedState.moonLandingActive && window.shipInterior && typeof window.shipInterior.toggleMoonLandingScene === "function") {
          window.shipInterior.toggleMoonLandingScene(true);
        }
        if (this._savedState.bg) this.scene.background = this._savedState.bg;
        this.scene.fog = this._savedState.fog;
        this._savedState = null;
      }
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    toggle(force) {
      const next = typeof force === "boolean" ? force : !this.isActive;
      if (next) this.open();
      else this.close();
      return this.isActive;
    }

    update(delta, elapsed, camera) {
      if (!this.isActive || !this.vizGroup) return;
      this.vizGroup.visible = true;
      this._rebuildTrajectoryFromDesign();

      const dt = Math.min(delta || 0.016, 0.05);
      if (this.playing) {
        this.progress = (this.progress + dt * 0.032 * this.speedMultiplier) % 1.0;
        if (this.uiRoot) {
          const slider = this.uiRoot.querySelector("#mv-timeline-slider");
          if (slider) slider.value = String(Math.round(this.progress * 1000));
        }
      }

      if (this.earthGroup) {
        this.earthGroup.rotation.y += dt * 0.055 * this.speedMultiplier;
      }
      if (this.cloudMesh) {
        this.cloudMesh.rotation.y += dt * 0.015 * this.speedMultiplier;
      }
      if (this.asteroidGroup && this.asteroidGroup.visible) {
        this.asteroidGroup.rotation.y += dt * 0.35;
      }

      const { pos, tangent } = this._sampleCraftPosition(this.progress);
      this.craftGroup.position.copy(pos);
      if (tangent.lengthSq() > 0.0001) {
        this.craftGroup.lookAt(pos.clone().add(tangent));
      }

      const inShadow = this._isInEarthShadow(pos);

      // Update Ground Station RF Beam
      let activeStationName = "OUT OF VIEW";
      if (this.stationNodes.length > 0 && this.rfBeamLine) {
        const tmpWorld = new window.THREE.Vector3();
        let bestDist = Infinity;
        let bestWorld = null;
        let bestName = null;

        this.earthGroup.updateMatrixWorld(true);
        this.stationNodes.forEach((st) => {
          st.pin.getWorldPosition(tmpWorld);
          const normal = tmpWorld.clone().normalize();
          const toCraft = pos.clone().sub(tmpWorld).normalize();
          if (normal.dot(toCraft) > 0.12) {
            const d = tmpWorld.distanceTo(pos);
            if (d < bestDist) {
              bestDist = d;
              bestWorld = tmpWorld.clone();
              bestName = st.name;
            }
          }
        });

        const t = this._getTelemetry();
        const linkHealthy = !t || t.linkMarginDb >= 3.0;
        if (bestWorld) {
          activeStationName = bestName;
          this.rfBeamLine.visible = true;
          const attr = this.rfBeamLine.geometry.attributes.position;
          attr.setXYZ(0, bestWorld.x, bestWorld.y, bestWorld.z);
          attr.setXYZ(1, pos.x, pos.y, pos.z);
          attr.needsUpdate = true;
          this.rfBeamLine.material.color.setHex(linkHealthy ? 0x34d399 : 0xef4444);
        } else {
          this.rfBeamLine.visible = false;
        }
      }

      // Camera Update (skip overriding pose if WebXR headset is controlling camera)
      const xrPresenting = Boolean(this.renderer && this.renderer.xr && this.renderer.xr.isPresenting);
      if (camera && !xrPresenting) {
        if (this.cameraMode === "craft") {
          this.desiredTarget.copy(pos);
        }
        this.camTarget.lerp(this.desiredTarget, 1 - Math.exp(-dt * 6));
        this.camSpherical.radius += (this.desiredRadius - this.camSpherical.radius) * (1 - Math.exp(-dt * 6));

        const r = this.camSpherical.radius;
        const sp = Math.sin(this.camSpherical.phi);
        const cp = Math.cos(this.camSpherical.phi);
        const st = Math.sin(this.camSpherical.theta);
        const ct = Math.cos(this.camSpherical.theta);

        camera.position.set(
          this.camTarget.x + r * sp * st,
          this.camTarget.y + r * cp,
          this.camTarget.z + r * sp * ct
        );
        camera.lookAt(this.camTarget);
      }

      if (this.uiRoot && elapsed - this._lastHudSync > 0.12) {
        this._lastHudSync = elapsed;
        this._updateHudTelemetry(inShadow, activeStationName);
      }
    }

    _updateHudTelemetry(inShadow, activeStationName) {
      if (!this.uiRoot) return;
      const t = this._getTelemetry();
      if (!t) return;

      const titleEl = this.uiRoot.querySelector("#mv-title");
      const subEl = this.uiRoot.querySelector("#mv-subtitle");
      if (titleEl) titleEl.textContent = `3D FLIGHT VIEWER // ${t.scenario.name.toUpperCase()} · ${t.orbit.name.toUpperCase()}`;
      if (subEl) {
        subEl.textContent = t.scenario.isBioPayload && t.bioTelemetry
          ? `${t.bioTelemetry.bag.shortLabel} · ${t.lv.name.split("(")[0].trim()} · ${t.gnd.name}`
          : `${t.bus.name} · ${t.lv.name.split("(")[0].trim()} · ${t.gnd.name}`;
      }

      const timelineList = t.scenario.isBioPayload ? BIO_TIMELINE_EVENTS : TIMELINE_EVENTS;
      let activeEv = timelineList[0];
      for (let i = 0; i < timelineList.length; i++) {
        if (this.progress >= timelineList[i].t) activeEv = timelineList[i];
      }
      const evEl = this.uiRoot.querySelector("#mv-event-active");
      if (evEl) evEl.textContent = `${activeEv.label} — ${activeEv.desc}`;

      const rows = this.uiRoot.querySelector("#mv-telemetry-rows");
      if (rows) {
        const altLabel = t.orbit.altitudeKm >= 100000
          ? `${(t.orbit.altitudeKm / 1000).toFixed(0)}k km`
          : `${t.orbit.altitudeKm.toLocaleString()} km`;
        const orbVel = t.orbit.id === "sun_earth_l2" ? "1.0 km/s (Deep Space)" : t.orbit.id === "lunar_polar_100" ? "1.6 km/s (Moon)" : t.orbit.id === "gto_heo" ? "1.6–10.1 km/s" : "7.6 km/s";
        const cell = (k, v, c = "#ece7dc") => `
          <div style="padding:5px 7px;border-radius:5px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);">
            <div style="font-size:8.5px;color:#94a3b8;">${k}</div>
            <div style="font-size:10.5px;font-weight:700;color:${c};margin-top:2px;">${v}</div>
          </div>
        `;
        rows.innerHTML = [
          cell("HEIGHT & TILT", `${altLabel} · ${t.orbit.inclinationDeg}°`, "#67e8f9"),
          cell("TRAVEL SPEED", orbVel),
          cell("SUNLIGHT", inShadow ? "IN EARTH'S SHADOW" : "IN SUNLIGHT", inShadow ? "#fbbf24" : "#4ade80"),
          cell("EARTH DISH", activeStationName, activeStationName.includes("OUT OF VIEW") ? "#94a3b8" : (t.commsOk ? "#34d399" : "#f87171")),
          t.scenario.isBioPayload && t.bioTelemetry
            ? cell("WARM BOX / FREEZER", `${t.bioTelemetry.thermal.incubateTempC}°C / ${t.bioTelemetry.thermal.storageTempC}°C`, (t.bioTelemetry.tempMatch && t.bioTelemetry.melfiOk) ? "#38bdf8" : "#f87171")
            : cell("FUEL POWER", `${t.achievedDeltaV} / ${t.requiredDeltaV} m/s`, t.deltaVOk ? "#38bdf8" : "#f87171"),
          t.scenario.isBioPayload && t.bioTelemetry
            ? cell("NUTRIENT YIELD", `${t.bioTelemetry.betaCaroteneUgMl} mg/L (${t.bioTelemetry.protocol.replicates} pouches)`, t.bioTelemetry.yieldOk ? "#7fb8a6" : "#f87171")
            : cell("SHIELD & LIFESPAN", `Level ${t.orbit.radiationEnvKrad} · ${t.estimatedLifetimeMonths} mo`, t.radiationOk ? "#7fb8a6" : "#f87171")
        ].join("");
      }

      const segEl = this.uiRoot.querySelector("#mv-segment-badges");
      if (segEl) {
        const seg = (label, ok) => `
          <div style="text-align:center;padding:4px 2px;border-radius:4px;background:${ok ? "rgba(74,222,128,0.12)" : "rgba(239,68,68,0.15)"};border:1px solid ${ok ? "rgba(74,222,128,0.35)" : "rgba(239,68,68,0.45)"};font-size:8.5px;font-weight:700;color:${ok ? "#86efac" : "#fca5a5"};">
            ${label}
          </div>
        `;
        const segmentOk = (key, fallback) => (
          t.segments && t.segments[key] && typeof t.segments[key].ok === "boolean"
            ? t.segments[key].ok
            : !!fallback
        );
        segEl.innerHTML = [
          seg("LAUNCH", segmentOk("launch", t.massOk && t.budgetOk)),
          seg("IN SPACE", segmentOk("space", t.powerOk && t.deltaVOk && t.thermalOk && t.radiationOk && t.disposalOk && t.telescopeOk)),
          seg("GROUND", segmentOk("ground", t.commsOk)),
          seg("RESULTS", segmentOk("user", t.scienceScore >= 55 && Array.isArray(t.matchedTypes) && t.matchedTypes.length > 0))
        ].join("");
      }
    }
  }

  window.MissionVizManager = MissionVizManager;
  window.missionViz = new MissionVizManager();
})(window);
