/**
 * ============================================================================
 * INTERFELLAS NASA KENNEDY SPACE CENTER (LC-39A) & PLAYER-CONTROLLED BOARDING DOCK
 * ============================================================================
 * Production-grade 3D Space Center starting environment & pre-flight sequence:
 * 1. Starts players at Kennedy Space Center Launch Complex 39A (Ground & Gantry).
 * 2. Guided boarding flow with a reversible access arm:
 *    - A glowing marker at the Access Arm Control extends & locks the bridge
 *      automatically when a crew member walks up to it.
 *    - The crew walk the bridge freely and board with [E]/[B] at the orbiter
 *      hatch. Before liftoff they can step back onto the bridge with [E]/[B].
 *    - Once every connected astronaut is aboard, the automatic liftoff
 *      countdown begins after a short safety pause.
 * 3. Pre-Launch Flight Deck & Liftoff Ignition:
 *    - Triggers sound suppression water deluge, SSME + SRB ignition, and launches
 *      into the 3D Ascent Cutscene -> Player-Controlled Orbital Docking ->
 *      6-Room Station Interior (where exterior ISS is hidden because you are inside!).
 */

(function (window) {
  "use strict";

  class SpaceCenterManager {
    constructor() {
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.group = null;

      // Start at Space Center when mission begins!
      this.isGroundMode = false;
      this.isLaunching = false;
      this.launchTime = 0.0;

      // Boarding Dock & Pre-Launch State Machine
      // Phases: "gantry" -> "dock_locked" -> "boarded" -> "launching" -> "orbit"
      this.boardingState = "gantry";
      this.dockSwingAngle = 0.38; // radians retracted away from ship hatch
      this.targetDockSwingAngle = 0.38;
      this.dockLocked = false;
      this.crewBoarded = false;
      this.missionPhase = "gantry";
      this._launchSequenceStarted = false;
      this._dockingPhaseStarted = false;
      this._stationEntered = false;
      this.siteTourActive = false;
      this.siteTourIndex = 0;
      this.guidanceMarkers = { arm: null, hatch: null };
      this.autoLaunchRemaining = null;
      this._groundHudAccumulator = 0;

      // 3D Elements
      this.padGroup = null;
      this.towerGroup = null;
      this.armPivotGroup = null;
      this.dockCollarMesh = null;
      this.dockStatusLightMat = null;
      this.stackGroup = null;
      this.flamePlumes = [];
      this.steamPlumes = [];
      this.floodlights = [];
      this.whiteRoomDoor = null;
      this.rssGroup = null;
      this.goxVentArm = null;
      this.openCar = null;              // Drivable open-top NASA ground car
      this.lccDoors = null;             // Interactive secure entrance doors to Launch Control Center (LCC)

      // Elevator system
      this.elevatorCab = null;          // THREE.Group — the moving cabin
      this.elevatorY = 0;               // current cabin Y in towerGroup space
      this.elevatorTargetY = 0;         // 0 = ground, 44 = gantry
      this.elevatorMoving = false;
      this.elevatorRidingPlayer = false;// true while player is in the cab
      this._elevatorLightMat = null;    // status light material on call panel

      // Interactive UI
      this.hudOverlay = null;
      this.hudCollapsed = false;
      this.lccConsoleOverlay = null;
      this.lccConsoleOpen = false;
      this.lccTelemetryTab = "flight";
      this._lccTelemetryNet = null;
      this._lccTelemetryHandler = null;
      this._lccTelemetrySnapshot = null;
      this._lccTelemetryReceivedAt = 0;
      this._localPollSentAt = 0;
      this._autoLaunchPollSent = false;
      this._groundObserverLaunch = false;
      this._lccSyncAccumulator = 0;

      // Ground atmosphere / lighting state
      this.savedFog = null;
      this.savedBackground = null;
      this._savedCamNear = null;
      this._savedCamFar = null;
      this._savedSunState = null;
      this.skySunSprite = null;
      this.oceanMesh = null;
      this.oceanTex = null;
      this.surfLines = [];
      this.clouds = [];
      this.stackPartsReady = false;

      // Shared, lightweight geometries used by the gantry lattice
      this.unitBoxGeo = null;
      this.steelMat = null;
      this.darkSteelMat = null;
      this.deckMat = null;
    }

    init(scene, camera, renderer) {
      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;

      this.group = new window.THREE.Group();
      this.group.name = "SpaceCenterGround_LC39A";
      this.group.visible = false;
      this.scene.add(this.group);

      this.unitBoxGeo = new window.THREE.BoxGeometry(1, 1, 1);
      this.steelMat = new window.THREE.MeshStandardMaterial({
        color: 0x7f2d22,
        roughness: 0.7,
        metalness: 0.36
      });
      this.darkSteelMat = new window.THREE.MeshStandardMaterial({
        color: 0x323c46,
        roughness: 0.72,
        metalness: 0.48
      });
      this.deckMat = new window.THREE.MeshStandardMaterial({
        color: 0x3f4a54,
        roughness: 0.82,
        metalness: 0.28
      });

      // Build the huge ground complex only when a mission actually enters
      // ground mode; the title/orbit scene no longer holds it in memory.
      this._groundBuilt = false;
      this._setupGroundUI();
      console.log("[SpaceCenter] LC-39A ground systems armed (site builds on entry).");
    }

    _ensureGroundBuilt() {
      if (this._groundBuilt) return;
      this._groundBuilt = true;
      this._buildCoastalTerrain();
      this._buildLaunchPad39A();
      this._buildLaunchTowerAndBoardingDock();
      this._buildRotatingServiceStructure();
      this._buildWaterDelugeSystem();
      this._buildLaunchStack();
      this._buildBoardingGuidance();
      this._buildPerimeterLighting();
      if (window.SpaceCenterSite) {
        this.site = new window.SpaceCenterSite(this);
        this.site.build();
      }
      if (window.SpaceCenterOpenCar) {
        this.openCar = new window.SpaceCenterOpenCar(this);
        this.openCar.build();
        window.spaceCenterCar = this.openCar;
      }
      this._mergeStaticPadBeams();
      this._mergePadGeometry();
      console.log("[SpaceCenter] Kennedy Space Center LC-39A & Player Boarding Dock ready.");
    }

    _mergeStaticPadBeams() {
      const THREE = window.THREE;
      if (!THREE.InstancedMesh || !this.padGroup) return;
      this.padGroup.updateMatrixWorld(true);
      const invPad = new THREE.Matrix4().copy(this.padGroup.matrixWorld).invert();
      const excluded = new Set([this.elevatorCab, this.armPivotGroup, this.stackGroup, this.goxVentArm]);
      const isExcluded = (object) => {
        let node = object;
        while (node) { if (excluded.has(node)) return true; node = node.parent; }
        return false;
      };
      const buckets = new Map();
      const isVisibleWithin = (object) => {
        let node = object;
        while (node && node !== this.padGroup) { if (!node.visible) return false; node = node.parent; }
        return true;
      };
      this.padGroup.traverse((obj) => {
        if (!obj.isMesh || obj.isInstancedMesh) return;
        if (obj.geometry !== this.unitBoxGeo) return;
        if (!obj.material || obj.material.transparent) return;
        if (isExcluded(obj) || !isVisibleWithin(obj)) return;
        const key = obj.material.uuid || obj.material.id || "shared";
        if (!buckets.has(key)) buckets.set(key, { material: obj.material, items: [] });
        buckets.get(key).items.push(obj);
      });
      for (const bucket of buckets.values()) {
        if (bucket.items.length < 2) continue;
        const instanced = new THREE.InstancedMesh(this.unitBoxGeo, bucket.material, bucket.items.length);
        bucket.items.forEach((mesh, index) => {
          const local = new THREE.Matrix4().multiplyMatrices(invPad, mesh.matrixWorld);
          instanced.setMatrixAt(index, local);
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.frustumCulled = false;
        instanced.castShadow = !window.isMobileDevice;
        instanced.receiveShadow = true;
        const matName = (bucket.material && bucket.material.name) || "";
        instanced.name = matName ? `MergedPadBeams_${matName}` : "MergedPadBeams";
        this.padGroup.add(instanced);
        bucket.items.forEach((mesh) => { if (mesh.parent) mesh.parent.remove(mesh); });
      }
    }

    _mergePadGeometry() {
      const THREE = window.THREE;
      if (!this.padGroup || !this.site || typeof this.site._mergeGeometryList !== "function") return;
      this.padGroup.updateWorldMatrix(true, true);
      const invPad = new THREE.Matrix4().copy(this.padGroup.matrixWorld).invert();
      const excluded = new Set([this.elevatorCab, this.armPivotGroup, this.stackGroup, this.goxVentArm]);
      const isExcluded = (object) => {
        let node = object;
        while (node) { if (excluded.has(node)) return true; node = node.parent; }
        return false;
      };
      const buckets = new Map();
      const isVisibleWithin = (object) => {
        let node = object;
        while (node && node !== this.padGroup) { if (!node.visible) return false; node = node.parent; }
        return true;
      };
      this.padGroup.traverse((obj) => {
        if (!obj.isMesh || obj.isInstancedMesh || obj.isSkinnedMesh) return;
        if (!obj.material || Array.isArray(obj.material) || obj.material.transparent) return;
        if (isExcluded(obj) || !isVisibleWithin(obj)) return;
        const key = obj.material.uuid;
        if (!buckets.has(key)) buckets.set(key, { material: obj.material, items: [] });
        buckets.get(key).items.push(obj);
      });
      for (const bucket of buckets.values()) {
        if (bucket.items.length < 2) continue;
        const geometries = bucket.items.map((mesh) => {
          const geometry = mesh.geometry.clone();
          const local = new THREE.Matrix4().multiplyMatrices(invPad, mesh.matrixWorld);
          geometry.applyMatrix4(local);
          return geometry;
        });
        const merged = this.site._mergeGeometryList(geometries);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, bucket.material);
        mesh.castShadow = !window.isMobileDevice;
        mesh.receiveShadow = true;
        mesh.name = `MergedPad_${bucket.material.name || "material"}`;
        this.padGroup.add(mesh);
        bucket.items.forEach((item) => { if (item.parent) item.parent.remove(item); });
        geometries.forEach((geometry) => geometry.dispose());
      }
    }

    // ============================================================================
    // SHARED HELPERS
    // ============================================================================
    _makeCanvasTexture(size, draw, repeatX = 1, repeatY = 1) {
      const THREE = window.THREE;
      const actualSize = window.isMobileDevice ? Math.min(size, 256) : size;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = actualSize;
      const ctx = canvas.getContext("2d");
      draw(ctx, actualSize);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      // Canvas ground textures are viewed at grazing angles for hundreds of
      // metres. Cap anisotropy high (16x where supported), keep full trilinear
      // mipmapping, and let the GPU build the mip chain from the power-of-two
      // canvas. The previous 8x cap made distant grass/gravel shimmer.
      texture.generateMipmaps = true;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      const maxAniso = window.isMobileDevice ? 2 : 16;
      texture.anisotropy = this.renderer && this.renderer.capabilities
        ? Math.min(maxAniso, this.renderer.capabilities.getMaxAnisotropy())
        : 1;
      if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
      texture.needsUpdate = true;
      return texture;
    }

    _makeConcreteTexture(size = 512, base = "#7c8794") {
      return this._makeCanvasTexture(size, (ctx, s) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 2600; i++) {
          const shade = 92 + Math.floor(Math.random() * 48);
          ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 8},${0.10 + Math.random() * 0.18})`;
          const r = 1 + Math.random() * 3.2;
          ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
        }
        ctx.strokeStyle = "rgba(40,48,58,0.28)";
        ctx.lineWidth = 2;
        for (let i = 0; i <= 4; i++) {
          const p = (i / 4) * s;
          ctx.beginPath();
          ctx.moveTo(p, 0);
          ctx.lineTo(p, s);
          ctx.moveTo(0, p);
          ctx.lineTo(s, p);
          ctx.stroke();
        }
        for (let i = 0; i < 14; i++) {
          const x = Math.random() * s;
          const y = Math.random() * s;
          ctx.strokeStyle = "rgba(30,36,44,0.20)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90);
          ctx.stroke();
        }
      });
    }

    _makeGrassTexture(size = 512) {
      return this._makeCanvasTexture(size, (ctx, s) => {
        ctx.fillStyle = "#486538";
        ctx.fillRect(0, 0, s, s);

        // Broad tonal patches give the lawn readable variation at distance.
        for (let i = 0; i < 22; i++) {
          const shades = ["rgba(56,82,42,0.20)", "rgba(88,118,58,0.16)", "rgba(98,108,64,0.12)"];
          ctx.fillStyle = shades[i % shades.length];
          ctx.beginPath();
          ctx.ellipse(Math.random() * s, Math.random() * s, 30 + Math.random() * 70, 24 + Math.random() * 62, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }

        // Medium clumps replace the old 11,000 sub-pixel specks that caused
        // severe moiré/shimmer on distant ground. Keep these low-contrast and
        // at least a few pixels wide so mipmaps average them cleanly.
        for (let i = 0; i < 140; i++) {
          const g = 82 + Math.floor(Math.random() * 40);
          ctx.fillStyle = `rgba(${g - 26},${g + 2},${g - 36},${0.07 + Math.random() * 0.1})`;
          ctx.beginPath();
          ctx.ellipse(
            Math.random() * s,
            Math.random() * s,
            3.5 + Math.random() * 9,
            2.5 + Math.random() * 7,
            Math.random() * Math.PI,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        // Sparse fine blade detail for close-up viewing only.
        for (let i = 0; i < 2600; i++) {
          const g = 78 + Math.floor(Math.random() * 34);
          ctx.fillStyle = `rgba(${g - 22},${g + 4},${g - 32},${0.08 + Math.random() * 0.1})`;
          ctx.fillRect(Math.random() * s, Math.random() * s, 1.4 + Math.random() * 2.4, 1.4 + Math.random() * 2.2);
        }
      }, 44, 48);
    }

    _makeSandTexture(size = 512) {
      return this._makeCanvasTexture(size, (ctx, s) => {
        ctx.fillStyle = "#dfd0aa";
        ctx.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 8) {
          ctx.fillStyle = y % 16 === 0 ? "rgba(255,246,220,0.14)" : "rgba(182,158,118,0.14)";
          ctx.fillRect(0, y, s, 4);
        }
        for (let i = 0; i < 8000; i++) {
          ctx.fillStyle = i % 2 === 0 ? "rgba(252,240,210,0.24)" : "rgba(174,148,106,0.22)";
          ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
        }
      }, 6, 68);
    }

    _makeOceanTexture(size = 512) {
      return this._makeCanvasTexture(size, (ctx, s) => {
        ctx.fillStyle = "#0b6e94";
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 160; i++) {
          const y = Math.random() * s;
          const x = Math.random() * s;
          const len = 24 + Math.random() * 68;
          ctx.fillStyle = i % 3 === 0 ? "rgba(116,204,232,0.18)" : "rgba(6,74,104,0.22)";
          ctx.fillRect(x, y, len, 2 + Math.random() * 3);
        }
      }, 28, 36);
    }

    _makeBeam(parent, sx, sy, sz, x, y, z, material, rotZ = 0, rotY = 0, rotX = 0, castShadow = true) {
      const beam = new window.THREE.Mesh(this.unitBoxGeo, material || this.steelMat);
      beam.scale.set(sx, sy, sz);
      beam.position.set(x, y, z);
      beam.rotation.set(rotX, rotY, rotZ);
      beam.castShadow = castShadow;
      beam.receiveShadow = true;
      parent.add(beam);
      return beam;
    }

    // ── Elevator interaction ─────────────────────────────────────────────────
    _handleElevatorKey(targetFloor) {
      if (!this.elevatorCab || !this._elevatorConfig) return;
      const cfg = this._elevatorConfig;

      // World position of elevator base = towerGroup.position + (ELV_X, 0, ELV_Z)
      // towerGroup is at padGroup(-34, 19.8, 0); padGroup is at scene origin.
      const elevWorldX = -34 + cfg.x;
      const elevWorldZ = 0  + cfg.z;

      // Current player world position (support both localCrew and camera)
      const crewPos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
      if (!crewPos) return;
      const px = crewPos.x;
      const pz = crewPos.z;
      const py = crewPos.y;

      const groundDist = Math.sqrt((px - elevWorldX) ** 2 + (pz - elevWorldZ) ** 2);
      const isNearElevator = groundDist < 24.0;

      if (this.elevatorMoving) {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 ELEVATOR IN TRANSIT — Please hold on...");
        }
        return;
      }

      if (!isNearElevator && !this.elevatorRidingPlayer) {
        // Exit site tour if active
        this.siteTourActive = false;
        if (targetFloor === undefined || targetFloor === null) {
          // Fast travel directly to the Pad 39A Ground Elevator Lobby (world y = 12.5m)
          if (window.localCrew && window.localCrew.group) {
            window.localCrew.group.position.set(-41.0, 12.5, -4.0);
            window.localCrew.group.rotation.y = -Math.PI / 2;
          }
          if (typeof window.setCameraYawPitch === "function") {
            window.setCameraYawPitch(-Math.PI / 2, 0.0);
          }
          if (window.spaceAudio && typeof window.spaceAudio.playAirlockCycle === "function") {
            window.spaceAudio.playAirlockCycle();
          }
          if (window.gameplay && typeof window.gameplay.showToast === "function") {
            window.gameplay.showToast("🛗 ARRIVED AT GROUND ELEVATOR LOBBY — Press [3] for Top Deck, [2] for Gantry");
          }
          this._renderGroundHUD();
          return;
        } else {
          // Explicit destination requested from afar: move inside cab at ground level and proceed!
          if (window.localCrew && window.localCrew.group) {
            window.localCrew.group.position.set(-42.2, 12.5, -4.0);
          }
        }
      }

      // Exit site tour if active when operating the elevator
      if (this.siteTourActive) {
        this.siteTourActive = false;
        this._renderGroundHUD();
      }

      // Determine current floor
      const atGround = py < 35.0;
      const atTop    = py >= 85.0;
      const atGantry = !atGround && !atTop;

      if (window.spaceAudio && typeof window.spaceAudio.playAirlockCycle === "function") {
        window.spaceAudio.playAirlockCycle();
      }

      // Normalize explicit floor requests
      const reqGround = targetFloor === 1 || targetFloor === 0 || targetFloor === "ground";
      const reqGantry = targetFloor === 2 || targetFloor === 44 || targetFloor === "gantry";
      const reqTop    = targetFloor === 3 || targetFloor === 88 || targetFloor === "top";

      if (reqTop) {
        this.elevatorTargetY = cfg.top !== undefined ? cfg.top : 88.0;
        this.elevatorMoving  = true;
        this.elevatorRidingPlayer = true;
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.position.set(-42.2, py, -4.0);
        }
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 ELEVATOR: Ascending to Tower Top Observation Deck (88m / 300 FT)");
        }
        return;
      }

      if (reqGantry) {
        this.elevatorTargetY = cfg.gantry !== undefined ? cfg.gantry : 44.0;
        this.elevatorMoving  = true;
        this.elevatorRidingPlayer = true;
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.position.set(-42.2, py, -4.0);
        }
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 ELEVATOR: In transit to Spacecraft Boarding Gantry (44m) — Walk to White Room to board");
        }
        return;
      }

      if (reqGround) {
        this.elevatorTargetY = cfg.bottom !== undefined ? cfg.bottom : -7.3;
        this.elevatorMoving  = true;
        this.elevatorRidingPlayer = true;
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.position.set(-42.2, py, -4.0);
        }
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 ELEVATOR: Descending to Pad Ground Level (0m)");
        }
        return;
      }

      // Unspecified target floor (general toggle via [G] or [E])
      if (atGround) {
        // From Ground: ride up to Gantry Level to board the spacecraft!
        this.elevatorTargetY = cfg.gantry !== undefined ? cfg.gantry : 44.0;
        this.elevatorMoving  = true;
        this.elevatorRidingPlayer = true;
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.position.set(-42.2, 12.5, -4.0);
        }
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 ELEVATOR: Ascending to Gantry Level (44m) — Walk to White Room to board spacecraft");
        }
      } else if (atGantry) {
        // From Gantry: ride to Top Deck if cab is already at Gantry, otherwise to Ground
        if (Math.abs(this.elevatorY - 44.0) < 4.0) {
          this.elevatorTargetY = cfg.top !== undefined ? cfg.top : 88.0;
          this.elevatorMoving  = true;
          this.elevatorRidingPlayer = true;
          if (window.localCrew && window.localCrew.group) {
            window.localCrew.group.position.set(-42.2, 64.1, -4.0);
          }
          if (window.gameplay && typeof window.gameplay.showToast === "function") {
            window.gameplay.showToast("🛗 ELEVATOR: Ascending to Tower Top Observation Deck (88m / 300 FT)");
          }
        } else {
          this.elevatorTargetY = cfg.bottom !== undefined ? cfg.bottom : -7.3;
          this.elevatorMoving  = true;
          this.elevatorRidingPlayer = false;
          if (window.gameplay && typeof window.gameplay.showToast === "function") {
            window.gameplay.showToast("🛗 ELEVATOR CALLED: In transit to Ground Level...");
          }
        }
      } else if (atTop) {
        // From Top Deck: ride back down to Gantry for spacecraft boarding!
        this.elevatorTargetY = cfg.gantry !== undefined ? cfg.gantry : 44.0;
        this.elevatorMoving  = true;
        this.elevatorRidingPlayer = true;
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.position.set(-42.2, 108.1, -4.0);
        }
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 ELEVATOR: Descending to Gantry Level (44m) for Spacecraft Boarding");
        }
      }
    }

    // ── Launch Control Center (LCC) Entrance Door Interaction ─────────────────
    _isNearLccDoor() {
      const pos = (window.localCrew && window.localCrew.group)
        ? window.localCrew.group.position
        : (this.camera ? this.camera.position : null);
      if (!pos) return false;
      const d = this.lccDoors || { cx: -180, cz: 203 };
      return Math.hypot(pos.x - d.cx, pos.z - d.cz) < 6.8 && pos.y < 8.0;
    }

    toggleLccDoors(forceState) {
      if (!this.lccDoors) return;
      const d = this.lccDoors;
      d.isOpen = forceState !== undefined ? !!forceState : !d.isOpen;
      d.target = d.isOpen ? 1.0 : 0.0;
      if (d.collider) d.collider.disabled = d.isOpen;

      if (window.spaceAudio && typeof window.spaceAudio.playAirlockCycle === "function") {
        window.spaceAudio.playAirlockCycle();
      }

      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast(
          d.isOpen
            ? "🚪 LAUNCH CONTROL CENTER: Doors Open — Welcome to Firing Room & Mission Control"
            : "🚪 LAUNCH CONTROL CENTER: Doors Closed — Access Secured"
        );
      }
      this._renderGroundHUD();
    }

    _updateSunShadowFocus(camPos) {
      if (!this.isGroundMode || !window.sunLight || !window.sunLight.castShadow) return;
      const sun = window.sunLight;
      const focusX = camPos ? Math.max(-960, Math.min(480, camPos.x)) : 0;
      const focusZ = camPos ? Math.max(-860, Math.min(760, camPos.z)) : 0;
      // Texel-snap focus onto a 2m grid so shadows never shimmer as the camera glides.
      const snap = 2.0;
      const sx = Math.round(focusX / snap) * snap;
      const sz = Math.round(focusZ / snap) * snap;
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + 135, 165, sz + 115);
      sun.target.updateMatrixWorld();
    }

    _applyGroundAtmosphere() {
      const THREE = window.THREE;
      if (!this.scene) return;
      if (!this.savedFog) {
        this.savedFog = {
          color: this.scene.fog ? this.scene.fog.color.clone() : null,
          density: this.scene.fog && typeof this.scene.fog.density === "number" ? this.scene.fog.density : null
        };
        this.savedBackground = this.scene.background && this.scene.background.isColor
          ? this.scene.background.clone()
          : null;
      }

      if (this.camera) {
        if (this._savedCamNear === null) this._savedCamNear = this.camera.near;
        if (this._savedCamFar === null) this._savedCamFar = this.camera.far;
        this.camera.near = 0.45;
        this.camera.far = 4800;
        this.camera.updateProjectionMatrix();
      }

      this.scene.background = new THREE.Color(0x96cae6);
      if (this.scene.fog && this.scene.fog.color) {
        this.scene.fog.color.setHex(0xc4dce8);
        this.scene.fog.density = 0.00058;
      }

      if (window.spaceStars) window.spaceStars.visible = false;
      if (window.ambLight) {
        if (!this._savedLightingState) this._savedLightingState = {};
        if (this._savedLightingState.ambIntensity === undefined) {
          this._savedLightingState.ambIntensity = window.ambLight.intensity;
        }
        window.ambLight.intensity = 0.28;
      }
      if (window.hemiLight) {
        if (!this._savedLightingState) this._savedLightingState = {};
        if (this._savedLightingState.hemiSky === undefined) {
          this._savedLightingState.hemiSky = window.hemiLight.color.getHex();
          this._savedLightingState.hemiGround = window.hemiLight.groundColor.getHex();
          this._savedLightingState.hemiIntensity = window.hemiLight.intensity;
        }
        window.hemiLight.color.setHex(0xb8dfff);
        window.hemiLight.groundColor.setHex(0x526444);
        window.hemiLight.intensity = 0.68;
      }
      if (window.earthShineLight) {
        window.earthShineLight.visible = false;
      }
      if (window.sunLight) {
        if (!this._savedSunState) {
          this._savedSunState = {
            pos: window.sunLight.position.clone(),
            castShadow: window.sunLight.castShadow
          };
        }
        window.sunLight.color.setHex(0xfff3d8);
        window.sunLight.intensity = 1.95;
        const shadowsAllowed = !!(this.renderer && this.renderer.shadowMap && this.renderer.shadowMap.enabled);
        window.sunLight.castShadow = shadowsAllowed;
        if (shadowsAllowed && window.sunLight.shadow) {
          window.sunLight.shadow.mapSize.set(2048, 2048);
          window.sunLight.shadow.camera.near = 25;
          window.sunLight.shadow.camera.far = 560;
          window.sunLight.shadow.camera.left = -140;
          window.sunLight.shadow.camera.right = 140;
          window.sunLight.shadow.camera.top = 140;
          window.sunLight.shadow.camera.bottom = -140;
          window.sunLight.shadow.bias = -0.00045;
          window.sunLight.shadow.normalBias = 0.04;
          window.sunLight.shadow.camera.updateProjectionMatrix();
        }
        this._updateSunShadowFocus(this.camera ? this.camera.position : null);
      }
      if (window.shipInterior && window.shipInterior.sunFlare && window.shipInterior.sunFlare.group) {
        window.shipInterior.sunFlare.group.visible = false;
      }
    }

    _restoreSpaceAtmosphere() {
      const THREE = window.THREE;
      if (!this.scene) return;
      if (this.camera && this._savedCamNear !== null && this._savedCamFar !== null) {
        this.camera.near = this._savedCamNear;
        this.camera.far = this._savedCamFar;
        this.camera.updateProjectionMatrix();
      }
      this.scene.background = this.savedBackground || new THREE.Color(0x03060f);
      if (this.scene.fog && this.scene.fog.color) {
        this.scene.fog.color.copy(this.savedFog && this.savedFog.color ? this.savedFog.color : new THREE.Color(0x03060f));
        this.scene.fog.density = this.savedFog && typeof this.savedFog.density === "number" ? this.savedFog.density : 0.0004;
      }
      if (window.spaceStars) window.spaceStars.visible = true;
      if (window.ambLight && this._savedLightingState && this._savedLightingState.ambIntensity !== undefined) {
        window.ambLight.intensity = this._savedLightingState.ambIntensity;
      }
      if (window.hemiLight && this._savedLightingState && this._savedLightingState.hemiSky !== undefined) {
        window.hemiLight.color.setHex(this._savedLightingState.hemiSky);
        window.hemiLight.groundColor.setHex(this._savedLightingState.hemiGround);
        window.hemiLight.intensity = this._savedLightingState.hemiIntensity;
      }
      if (window.earthShineLight) {
        window.earthShineLight.visible = true;
      }
      if (window.sunLight) {
        window.sunLight.color.setHex(0xfff5e0);
        window.sunLight.intensity = 2.2;
        if (this._savedSunState) {
          window.sunLight.position.copy(this._savedSunState.pos);
          window.sunLight.castShadow = this._savedSunState.castShadow;
        } else {
          window.sunLight.castShadow = false;
        }
        window.sunLight.target.position.set(0, 0, 0);
        window.sunLight.target.updateMatrixWorld();
      }
    }

    // ============================================================================
    // 1. COASTAL TERRAIN, ATLANTIC OCEAN & VAB
    // ============================================================================
    _buildCoastalTerrain() {
      const THREE = window.THREE;
      const terrainGroup = new THREE.Group();
      terrainGroup.name = "TerrainGroup";
      this.group.add(terrainGroup);

      // Gradient daytime sky dome for Cape Canaveral.  A flat dark sphere made
      // the launch complex look like it was floating in deep space.
      const skyGeo = new THREE.SphereGeometry(2200, 32, 20);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x1b5b96) },
          midColor: { value: new THREE.Color(0x74aed4) },
          horizonColor: { value: new THREE.Color(0xd9e8ee) }
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 horizonColor;
          varying vec3 vWorldPosition;
          void main() {
            float h = normalize(vWorldPosition).y;
            float lower = smoothstep(-0.05, 0.18, h);
            float upper = smoothstep(0.18, 0.75, h);
            vec3 col = mix(horizonColor, midColor, lower);
            col = mix(col, topColor, upper);
            gl_FragColor = vec4(col, 1.0);
          }
        `
      });
      const skyDome = new THREE.Mesh(skyGeo, skyMat);
      skyDome.name = "SpaceCenterSkyDome";
      skyDome.renderOrder = -1000;
      terrainGroup.add(skyDome);

      // Soft sun disc / glow in the direction of the scene key light.
      const sunCanvas = document.createElement("canvas");
      sunCanvas.width = sunCanvas.height = 256;
      const sunCtx = sunCanvas.getContext("2d");
      const sunGrad = sunCtx.createRadialGradient(128, 128, 2, 128, 128, 126);
      sunGrad.addColorStop(0, "rgba(255,255,246,1)");
      sunGrad.addColorStop(0.12, "rgba(255,248,218,0.95)");
      sunGrad.addColorStop(0.34, "rgba(255,226,168,0.42)");
      sunGrad.addColorStop(1, "rgba(255,214,150,0)");
      sunCtx.fillStyle = sunGrad;
      sunCtx.fillRect(0, 0, 256, 256);
      const sunTex = new THREE.CanvasTexture(sunCanvas);
      const sunMat = new THREE.SpriteMaterial({
        map: sunTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false
      });
      this.skySunSprite = new THREE.Sprite(sunMat);
      this.skySunSprite.position.set(950, 700, 1050);
      this.skySunSprite.scale.set(240, 240, 1);
      terrainGroup.add(this.skySunSprite);

      // Light, low-poly cloud banks near the horizon.
      const cloudMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        fog: true
      });
      const cloudCount = window.isMobileDevice ? 4 : 10;
      for (let i = 0; i < cloudCount; i++) {
        const cloud = new THREE.Group();
        const puffs = (window.isMobileDevice ? 2 : 3) + Math.floor(Math.random() * (window.isMobileDevice ? 2 : 4));
        for (let p = 0; p < puffs; p++) {
          const puff = new THREE.Mesh(new THREE.SphereGeometry(18 + Math.random() * 22, 8, 6), cloudMat);
          puff.scale.y = 0.42;
          puff.position.set((p - puffs / 2) * 26, Math.random() * 8, (Math.random() - 0.5) * 24);
          cloud.add(puff);
        }
        cloud.position.set(-500 + Math.random() * 1500, 210 + Math.random() * 150, -600 + Math.random() * 1200);
        terrainGroup.add(cloud);
        this.clouds.push(cloud);
      }

      // Grass / scrub terrain west of the Atlantic shoreline (non-overlapping with dunes/beach).
      const grassTex = this._makeGrassTexture();
      const groundGeo = new THREE.PlaneGeometry(1720, 2400, 1, 1);
      groundGeo.rotateX(-Math.PI / 2);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: grassTex,
        roughness: 0.96,
        metalness: 0.0
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.position.set(-392, 0.0, 0);
      ground.receiveShadow = true;
      terrainGroup.add(ground);

      // Concrete hardstand / apron around the pad (beveled edge prevents jagged grass clipping).
      const apronTex = this._makeConcreteTexture(512, "#879098");
      apronTex.repeat.set(9, 4);
      const apron = new THREE.Mesh(
        new THREE.CylinderGeometry(132, 134, 0.24, 64),
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: apronTex, roughness: 0.9, metalness: 0.04 })
      );
      apron.position.set(0, -0.04, 0);
      apron.receiveShadow = true;
      terrainGroup.add(apron);

      const apronCurb = new THREE.Mesh(
        new THREE.CylinderGeometry(132.2, 135.4, 0.16, 64, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xa4acb2, roughness: 0.92, metalness: 0.04, side: THREE.DoubleSide })
      );
      apronCurb.position.set(0, -0.02, 0);
      terrainGroup.add(apronCurb);

      // Perimeter service road outside apron.
      const road = new THREE.Mesh(
        new THREE.RingGeometry(144.5, 153.5, 96),
        new THREE.MeshStandardMaterial({
          color: 0x2a3138,
          roughness: 0.94,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1
        })
      );
      road.rotation.x = -Math.PI / 2;
      road.position.y = 0.09;
      road.receiveShadow = true;
      terrainGroup.add(road);

      const shoulderMat = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.72,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3
      });
      [145.1, 152.9].forEach((r) => {
        const stripe = new THREE.Mesh(new THREE.RingGeometry(r - 0.14, r + 0.14, 96), shoulderMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.y = 0.11;
        terrainGroup.add(stripe);
      });

      // Sloped golden sandy beach & vegetated dune ridge cleanly East of terrain.
      const sandTex = this._makeSandTexture(512);
      const beachGeo = new THREE.PlaneGeometry(82, 2400);
      beachGeo.rotateX(-Math.PI / 2);
      const beachMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: sandTex,
        roughness: 0.95,
        metalness: 0.01
      });
      const beach = new THREE.Mesh(beachGeo, beachMat);
      // Tilt foreshore down into surf (-0.018 rad: y=+0.50 at x=468 down to y=-0.98 at x=550).
      beach.position.set(509, -0.24, 0);
      beach.rotation.z = -0.018;
      beach.receiveShadow = true;
      terrainGroup.add(beach);

      // Soft rolling coastal sand dunes backing the beach edge.
      const duneGeo = new THREE.CylinderGeometry(7, 13, 2.2, 8);
      const duneMat = new THREE.MeshStandardMaterial({ color: 0xdcc79c, roughness: 0.96, metalness: 0.01 });
      const duneScrubMat = new THREE.MeshStandardMaterial({ color: 0x5c7742, roughness: 0.94 });
      const duneItems = [], bushItems = [];
      for (let z = -960; z <= 960; z += 42) {
        const jx = 472 + Math.sin(z * 0.17) * 5;
        duneItems.push({ x: jx, z, sy: 0.55 + (Math.cos(z * 0.23) + 1) * 0.35 });
        bushItems.push({ x: jx - 3.2, z: z + 6 });
      }
      const duneTransform = new THREE.Object3D();
      const dunes = new THREE.InstancedMesh(duneGeo, duneMat, duneItems.length);
      duneItems.forEach((item, index) => {
        duneTransform.position.set(item.x, -0.08, item.z);
        duneTransform.scale.set(1.25, item.sy, 2.8);
        duneTransform.updateMatrix();
        dunes.setMatrixAt(index, duneTransform.matrix);
      });
      dunes.instanceMatrix.needsUpdate = true;
      dunes.frustumCulled = false;
      dunes.receiveShadow = true;
      terrainGroup.add(dunes);

      const bushes = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.7, 0), duneScrubMat, bushItems.length);
      bushItems.forEach((item, index) => {
        duneTransform.position.set(item.x, 0.52, item.z);
        duneTransform.scale.set(1.5, 0.55, 1.4);
        duneTransform.updateMatrix();
        bushes.setMatrixAt(index, duneTransform.matrix);
      });
      bushes.instanceMatrix.needsUpdate = true;
      bushes.frustumCulled = false;
      bushes.castShadow = !window.isMobileDevice;
      terrainGroup.add(bushes);

      // Atlantic Ocean with rippled wave texture & animated shoreline surf.
      this.oceanTex = this._makeOceanTexture(512);
      const oceanGeo = new THREE.PlaneGeometry(1850, 2400);
      oceanGeo.rotateX(-Math.PI / 2);
      const oceanMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.oceanTex,
        roughness: 0.24,
        metalness: 0.42,
        transparent: true,
        opacity: 0.94
      });
      this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
      this.oceanMesh.position.set(1445, -0.34, 0);
      this.oceanMesh.receiveShadow = true;
      terrainGroup.add(this.oceanMesh);

      this.surfLines = [];
      for (let s = 0; s < 2; s++) {
        const surfGeo = new THREE.PlaneGeometry(3.2 - s * 1.1, 2200);
        surfGeo.rotateX(-Math.PI / 2);
        const surfMat = new THREE.MeshBasicMaterial({
          color: 0xf4fbff,
          transparent: true,
          opacity: 0.62 - s * 0.18,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3
        });
        const surf = new THREE.Mesh(surfGeo, surfMat);
        surf.position.set(518 + s * 9, -0.25 + s * 0.02, 0);
        surf.userData = { baseX: 518 + s * 9, phase: s * 1.9, baseOpacity: 0.62 - s * 0.18 };
        terrainGroup.add(surf);
        this.surfLines.push(surf);
      }
    }

    // ============================================================================
    // 2. LAUNCH COMPLEX 39A OCTAGONAL PAD & MOBILE LAUNCHER PLATFORM
    // ============================================================================
    _buildLaunchPad39A() {
      const THREE = window.THREE;
      this.padGroup = new THREE.Group();
      this.padGroup.name = "Pad39A_Structure";
      this.group.add(this.padGroup);

      // Sloped grassy LC-39A coastal berm surrounding the concrete pad structure.
      const bermTex = this._makeCanvasTexture(256, (ctx, s) => {
        ctx.fillStyle = "#4c6a3b";
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 4200; i++) {
          ctx.fillStyle = i % 2 === 0 ? "rgba(62,88,46,0.28)" : "rgba(92,124,62,0.24)";
          ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
        }
      }, 12, 3);
      const bermMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: bermTex, roughness: 0.96, metalness: 0.0 });
      const padBerm = new THREE.Mesh(new THREE.CylinderGeometry(66.5, 92, 11.9, 8), bermMat);
      padBerm.position.set(0, 5.95, 0);
      padBerm.rotation.y = Math.PI / 8;
      padBerm.receiveShadow = true;
      padBerm.castShadow = true;
      this.padGroup.add(padBerm);

      // Concrete retaining wall collar around berm crest.
      const collarTex = this._makeConcreteTexture(512, "#879199");
      collarTex.repeat.set(8, 1);
      const collarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: collarTex, roughness: 0.9, metalness: 0.08 });
      const padCollar = new THREE.Mesh(new THREE.CylinderGeometry(65.6, 67.0, 0.55, 8), collarMat);
      padCollar.position.set(0, 12.14, 0);
      padCollar.rotation.y = Math.PI / 8;
      padCollar.receiveShadow = true;
      this.padGroup.add(padCollar);

      const topApronTex = this._makeConcreteTexture(512, "#97a0a8");
      topApronTex.repeat.set(6, 6);
      const topApron = new THREE.Mesh(
        new THREE.CylinderGeometry(64.6, 65.2, 0.62, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: topApronTex, roughness: 0.88, metalness: 0.1 })
      );
      topApron.position.set(0, 12.19, 0);
      topApron.rotation.y = Math.PI / 8;
      topApron.receiveShadow = true;
      this.padGroup.add(topApron);

      // Recessed flame trench channel & angled blast deflector wedge under MLP.
      const trenchWallMat = new THREE.MeshStandardMaterial({ color: 0x6f7982, roughness: 0.92, metalness: 0.08 });
      [-14.6, 14.6].forEach((wx) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 92), trenchWallMat);
        wall.position.set(wx, 13.6, 0);
        wall.castShadow = true;
        wall.receiveShadow = true;
        this.padGroup.add(wall);
      });

      const trenchFloor = new THREE.Mesh(
        new THREE.BoxGeometry(26.6, 0.24, 92),
        new THREE.MeshStandardMaterial({
          color: 0x161c22,
          roughness: 0.96,
          metalness: 0.04,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        })
      );
      trenchFloor.position.set(0, 12.56, 0);
      trenchFloor.receiveShadow = true;
      this.padGroup.add(trenchFloor);

      const deflectorMat = new THREE.MeshStandardMaterial({ color: 0x3b444e, roughness: 0.72, metalness: 0.35 });
      [-1, 1].forEach((dir) => {
        const slope = new THREE.Mesh(new THREE.BoxGeometry(22, 1.0, 14), deflectorMat);
        slope.position.set(0, 14.1, dir * 5.8);
        slope.rotation.x = dir * 0.52;
        slope.castShadow = true;
        this.padGroup.add(slope);
      });

      // Crawlerway approach ramp from south crawlerway (z=186, y=0.14) to Pad top (z=60, y=12.50).
      const rampTex = this._makeConcreteTexture(512, "#808991");
      rampTex.repeat.set(2, 5);
      const rampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: rampTex, roughness: 0.92, metalness: 0.05 });
      const rampSpanZ = 126.0;
      const rampRiseY = 12.36;
      const rampLen = Math.hypot(rampSpanZ, rampRiseY);
      const rampRx = Math.atan2(rampRiseY, rampSpanZ);
      const rampHalfH = 0.7;
      const rampMidY = (0.14 + 12.5) * 0.5;
      const rampMidZ = (186.0 + 60.0) * 0.5;

      const ramp = new THREE.Mesh(new THREE.BoxGeometry(38, rampHalfH * 2, rampLen), rampMat);
      ramp.rotation.x = rampRx;
      ramp.position.set(0, rampMidY - rampHalfH * Math.cos(rampRx), rampMidZ - rampHalfH * Math.sin(rampRx));
      ramp.receiveShadow = true;
      this.padGroup.add(ramp);

      // Flush south toe transition pad meeting CrawlerLane (z=186..196, top=0.14) with zero seam step.
      const toeApron = new THREE.Mesh(
        new THREE.BoxGeometry(41.5, 0.15, 10.0),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: rampTex,
          roughness: 0.92,
          metalness: 0.05,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        })
      );
      // Sits 1 cm proud of the flush crawlerway lane tops (0.14 m). Keeping the
      // two surfaces out of the same depth plane is what stops z-fighting along
      // the ramp toe at distance.
      toeApron.position.set(0, 0.075, 190.8);
      toeApron.receiveShadow = true;
      this.padGroup.add(toeApron);

      // Flush north crest bridge connecting ramp cleanly to the octagonal top apron.
      const topBridge = new THREE.Mesh(new THREE.BoxGeometry(39.6, 0.62, 6.0), rampMat);
      topBridge.position.set(0, 12.185, 58.6);
      topBridge.receiveShadow = true;
      this.padGroup.add(topBridge);

      // Full-length sloped grass wing embankments tilted gently down into the outer lawn.
      [-25.2, 25.2].forEach((sx) => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(12.2, 5.2, rampLen), bermMat);
        wing.rotation.set(rampRx, 0, sx > 0 ? -0.26 : 0.26, "YXZ");
        wing.position.set(sx, 3.05, rampMidZ - 0.5);
        wing.receiveShadow = true;
        this.padGroup.add(wing);
      });

      const rampEdgeMat = new THREE.MeshStandardMaterial({ color: 0x4b5560, roughness: 0.86, metalness: 0.14 });
      [-19.45, 19.45].forEach((x) => {
        const curbHalfH = 0.88; // protrudes a gentle 0.36m above ramp top surface
        const curbTopOffset = 0.36;
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.9, curbHalfH * 2, rampLen - 1.5), rampEdgeMat);
        edge.rotation.x = rampRx;
        edge.position.set(
          x,
          rampMidY - (curbHalfH - curbTopOffset) * Math.cos(rampRx),
          rampMidZ - 0.75 - (curbHalfH - curbTopOffset) * Math.sin(rampRx)
        );
        edge.castShadow = true;
        edge.receiveShadow = true;
        this.padGroup.add(edge);

        const curbBevel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 3.4), rampEdgeMat);
        curbBevel.rotation.x = 0.11;
        curbBevel.position.set(x, 0.19, 186.6);
        curbBevel.receiveShadow = true;
        this.padGroup.add(curbBevel);
      });

      // Mobile Launcher Platform (MLP) seated atop launch mount piers (top strictly at y=19.80).
      const pierMat = new THREE.MeshStandardMaterial({ color: 0x3b444e, roughness: 0.68, metalness: 0.45 });
      [
        [-21, -17], [21, -17], [-21, 17], [21, 17], [-21, 0], [21, 0]
      ].forEach(([px, pz]) => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 3.2), pierMat);
        pier.position.set(px, 12.8, pz);
        pier.castShadow = true;
        this.padGroup.add(pier);
      });

      const mlpTex = this._makeConcreteTexture(512, "#5b6670");
      mlpTex.repeat.set(3, 3);
      const mlp = new THREE.Mesh(
        new THREE.BoxGeometry(49, 7.0, 41),
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: mlpTex, roughness: 0.68, metalness: 0.4 })
      );
      mlp.position.set(0, 16.3, 0);
      mlp.castShadow = true;
      mlp.receiveShadow = true;
      this.padGroup.add(mlp);

      // MLP deck perimeter yellow safety rails & umbilical riser cabinets.
      // Front railing is split to leave a 5m open doorway at x in [-14.5, -9.5] for the access stairs!
      const railGeoZ = new THREE.BoxGeometry(0.32, 1.15, 40.6);
      const railMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.35 });
      const railFwdEast = new THREE.Mesh(new THREE.BoxGeometry(34.0, 1.15, 0.32), railMat);
      railFwdEast.position.set(7.5, 20.38, 20.34);
      const railFwdWest = new THREE.Mesh(new THREE.BoxGeometry(10.0, 1.15, 0.32), railMat);
      railFwdWest.position.set(-19.5, 20.38, 20.34);
      const railAft = new THREE.Mesh(new THREE.BoxGeometry(49.2, 1.15, 0.32), railMat);
      railAft.position.set(0, 20.38, -20.34);
      const railEast = new THREE.Mesh(railGeoZ, railMat);
      railEast.position.set(24.34, 20.38, 0);
      const railWest = new THREE.Mesh(railGeoZ, railMat);
      railWest.position.set(-24.34, 20.38, 0);
      this.padGroup.add(railFwdEast, railFwdWest, railAft, railEast, railWest);

      // ── Realistic Industrial Steel Stairway & Caged Safety Ladder ─────────
      // Connects Pad Hardstand (y=12.5, z=32.0) to Mobile Launcher Platform Deck (y=19.8, z=20.5)
      // Height rise = 7.3m, run = 11.5m, slope length = 13.62m, slope angle = +0.56586 rad
      const stairAngle = 0.56586; // Positive rotation around X pitches south end DOWN to ground and north end UP to deck
      const stringerMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.65 });
      const treadMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75, metalness: 0.45 });
      const noseMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.4 });
      const stairPostMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.5 });
      const stairRailMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.4 });
      const footingMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, metalness: 0.1 });

      const stairGrp = new THREE.Group();
      stairGrp.name = "MLP_AccessStairway";
      this.padGroup.add(stairGrp);

      // 1. Dual heavy structural channel stringers (left & right sides of the stairway)
      [-13.8, -10.2].forEach((sx) => {
        const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.45, 13.62), stringerMat);
        stringer.position.set(sx, 16.15, 26.25);
        stringer.rotation.x = stairAngle;
        stringer.castShadow = true;
        stringer.receiveShadow = true;
        stairGrp.add(stringer);
      });

      // 2. 24 horizontal individual steel grating steps with safety yellow nosings
      const stepCount = 24;
      for (let i = 0; i < stepCount; i++) {
        const t = (i + 0.5) / stepCount;
        const sz = 32.0 - t * 11.5;
        const sy = 12.5 + t * 7.3;

        // Step grating tread (flat horizontal box)
        const step = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.08, 0.52), treadMat);
        step.position.set(-12.0, sy, sz);
        step.receiveShadow = true;
        stairGrp.add(step);

        // Safety yellow non-slip nosing on front edge of each step
        const nose = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.082, 0.05), noseMat);
        nose.position.set(-12.0, sy + 0.002, sz + 0.25);
        stairGrp.add(nose);
      }

      // 3. Vertical structural support pillars resting on concrete footings on pad hardstand
      [0.25, 0.5, 0.75].forEach((t) => {
        const sz = 32.0 - t * 11.5;
        const sy = 12.5 + t * 7.3;
        const pillarH = sy - 12.5;
        [-13.8, -10.2].forEach((sx) => {
          // Steel pillar
          this._makeBeam(stairGrp, 0.18, pillarH, 0.18, sx, 12.5 + pillarH / 2, sz, stringerMat);
          // Concrete footing
          const footing = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.55), footingMat);
          footing.position.set(sx, 12.5 + 0.175, sz);
          footing.receiveShadow = true;
          stairGrp.add(footing);
        });
      });

      // 4. Continuous OSHA dual-rail safety handrails on both sides (left & right)
      [-13.92, -10.08].forEach((sx) => {
        // Top handrail (1.1m above stringer)
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 13.62), stairRailMat);
        topRail.position.set(sx, 17.25, 26.25);
        topRail.rotation.x = stairAngle;
        stairGrp.add(topRail);

        // Mid safety rail (0.55m above stringer)
        const midRail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 13.62), stairRailMat);
        midRail.position.set(sx, 16.7, 26.25);
        midRail.rotation.x = stairAngle;
        stairGrp.add(midRail);

        // Safety toe-board / kick-plate along bottom of rail
        const toeBoard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 13.62), stringerMat);
        toeBoard.position.set(sx, 16.22, 26.25);
        toeBoard.rotation.x = stairAngle;
        stairGrp.add(toeBoard);

        // Vertical stanchion posts every ~1.6m along the stair run
        for (let i = 0; i <= 8; i++) {
          const t = i / 8;
          const sz = 32.0 - t * 11.5;
          const sy = 12.5 + t * 7.3;
          this._makeBeam(stairGrp, 0.08, 1.25, 0.08, sx, sy + 0.62, sz, stairPostMat);
        }
      });

      // 5. Top landing transition platform at MLP deck level (y=19.8, z=20.0)
      const topLanding = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 1.4), treadMat);
      topLanding.position.set(-12.0, 19.8, 19.8);
      topLanding.receiveShadow = true;
      stairGrp.add(topLanding);

      // 6. Authentic Caged Vertical Service Ladder on south wall of MLP (at x=-15.5)
      const ladderGrp = new THREE.Group();
      ladderGrp.name = "MLP_CagedLadder";
      this.padGroup.add(ladderGrp);

      const ladderMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.5 });
      // Side rails spanning from ground y=12.5 to 1.1m above MLP deck y=20.9
      [-15.8, -15.2].forEach((lx) => {
        this._makeBeam(ladderGrp, 0.06, 8.4, 0.06, lx, 12.5 + 4.2, 20.65, ladderMat);
      });
      // Horizontal rungs every 0.3m
      for (let ry = 12.8; ry <= 19.8; ry += 0.3) {
        this._makeBeam(ladderGrp, 0.6, 0.04, 0.04, -15.5, ry, 20.65, ladderMat);
      }
      // Safety cage hoops every 1.2m from y=15.0 up to 20.9
      const cageGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.04, 16, 1, true, 0, Math.PI);
      for (let cy = 15.0; cy <= 20.6; cy += 1.2) {
        const hoop = new THREE.Mesh(cageGeo, ladderMat);
        hoop.position.set(-15.5, cy, 21.0);
        hoop.rotation.x = Math.PI / 2;
        ladderGrp.add(hoop);
      }
      // Vertical safety cage straps
      [-0.45, 0, 0.45].forEach((offset) => {
        this._makeBeam(ladderGrp, 0.03, 5.8, 0.03, -15.5 + offset, 17.9, 21.45, ladderMat);
      });

      // 7. High-visibility directional entrance sign at base of stairway
      const signCanvas = document.createElement("canvas");
      signCanvas.width = 512; signCanvas.height = 128;
      const sctx = signCanvas.getContext("2d");
      sctx.fillStyle = "#0f172a"; sctx.fillRect(0, 0, 512, 128);
      sctx.strokeStyle = "#facc15"; sctx.lineWidth = 6; sctx.strokeRect(4, 4, 504, 120);
      sctx.fillStyle = "#38bdf8"; sctx.font = "bold 26px Arial"; sctx.textAlign = "center";
      sctx.fillText("PAD 39A MOBILE LAUNCHER ACCESS", 256, 44);
      sctx.fillStyle = "#facc15"; sctx.font = "bold 20px Arial";
      sctx.fillText("STAIRWAY & CAGED LADDER TO MLP DECK", 256, 82);
      sctx.fillStyle = "#34d399"; sctx.font = "bold 16px Arial";
      sctx.fillText("🛗 FOR TOWER TOP & ORBITER, TAKE FSS ELEVATOR", 256, 110);
      const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas), transparent: true }));
      signMesh.position.set(-12.0, 14.8, 32.3);
      stairGrp.add(signMesh);
      // Sign stanchion posts
      this._makeBeam(stairGrp, 0.08, 2.4, 0.08, -14.0, 13.7, 32.28, stairPostMat);
      this._makeBeam(stairGrp, 0.08, 2.4, 0.08, -10.0, 13.7, 32.28, stairPostMat);

      // Single non-overlapping pad identification stencil ("39A").
      const markCanvas = document.createElement("canvas");
      markCanvas.width = 512;
      markCanvas.height = 256;
      const markCtx = markCanvas.getContext("2d");
      markCtx.clearRect(0, 0, 512, 256);
      markCtx.font = "900 176px Arial, Helvetica, sans-serif";
      markCtx.textAlign = "center";
      markCtx.textBaseline = "middle";
      markCtx.fillStyle = "rgba(248,248,242,0.88)";
      markCtx.fillText("39A", 256, 138);
      const markTex = new THREE.CanvasTexture(markCanvas);
      if (THREE.sRGBEncoding !== undefined) markTex.encoding = THREE.sRGBEncoding;
      const padMark = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 15),
        new THREE.MeshBasicMaterial({
          map: markTex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4
        })
      );
      padMark.rotation.x = -Math.PI / 2;
      padMark.position.set(38, 12.54, 38);
      this.padGroup.add(padMark);

      // Hold-down posts & deluge nozzle manifolds around the launch mount.
      const postMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.56, metalness: 0.58 });
      [
        [-18, 21.0, -16], [18, 21.0, -16],
        [-18, 21.0, 16], [18, 21.0, 16]
      ].forEach(([x, y, z]) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 2.2), postMat);
        post.position.set(x, y, z);
        post.castShadow = true;
        this.padGroup.add(post);
      });
    }

    // ============================================================================
    // 3. LAUNCH TOWER & PLAYER-CONTROLLED BOARDING DOCK (OAA + WHITE ROOM)
    // ============================================================================
    _buildLaunchTowerAndBoardingDock() {
      const THREE = window.THREE;
      this.towerGroup = new THREE.Group();
      this.towerGroup.name = "LaunchTower_FSS";
      // Pull the fixed service structure away from the vehicle so the access
      // arm can actually reach the orbiter hatch and the gantry view is clear.
      this.towerGroup.position.set(-34, 19.8, 0);
      this.padGroup.add(this.towerGroup);

      const steelMat = this.steelMat;
      const darkSteelMat = this.darkSteelMat;
      const deckMat = this.deckMat;

      // ── GLB-based Fixed Service Structure ──────────────────────────────────
      // Load the low-poly FSS from the reference GLB (rocket parts stripped).
      const _loadFSSGLB = () => {
        if (!window.glbManager) return;
        const fssUrl = "assets/space-shuttle-fss-tower.glb";
        window.glbManager.loadGLB(fssUrl).then(() => {
          try {
            const fssMesh = window.glbManager.instantiateModel(fssUrl, { scale: 1.0 });
            if (fssMesh && this.padGroup) {
              fssMesh.name = "LaunchTower_FSS_GLB";
              fssMesh.position.set(-0.1035, -19.80, -4.702);
              fssMesh.traverse((obj) => {
                if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
              });
              this.padGroup.add(fssMesh);
            }
          } catch (e) { console.warn("[SpaceCenter] FSS GLB instantiate error:", e); }
        }).catch((e) => { console.warn("[SpaceCenter] FSS GLB load error:", e); });
      };
      _loadFSSGLB();
      // ───────────────────────────────────────────────────────────────────────

      // ── Realistic FSS Detail Layer ─────────────────────────────────────────
      // All in towerGroup space (towerGroup at padGroup(-34, 19.8, 0)).
      // Tower extends from Y=0 (pad level) to Y=88 (gantry top).

      const towerHeight = 88;
      const half = 6; // half-width of main structural columns

      // ── Main corner columns (4×) ──
      const colMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.5, metalness: 0.65 });
      [[-half, -half], [half, -half], [-half, half], [half, half]].forEach(([cx, cz]) => {
        this._makeBeam(this.towerGroup, 1.2, towerHeight, 1.2, cx, towerHeight / 2, cz, colMat);
      });

      // ── Diagonal X-bracing every 8m ──
      const braceMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.55, metalness: 0.6 });
      const dAng = Math.atan2(8, half * 2);
      const dLen = Math.hypot(half * 2, 8);
      for (let y = 0; y < towerHeight; y += 8) {
        const my = y + 4;
        // North & south faces
        [-half, half].forEach(z => {
          this._makeBeam(this.towerGroup, dLen, 0.18, 0.18, 0, my, z, braceMat, dAng, 0, 0);
          this._makeBeam(this.towerGroup, dLen, 0.18, 0.18, 0, my, z, braceMat, -dAng, 0, 0);
        });
        // East & west faces
        [-half, half].forEach(x => {
          if (x > 0 && y === 40) return; // boarding arm opening
          this._makeBeam(this.towerGroup, 0.18, 0.18, dLen, x, my, 0, braceMat, 0, 0, dAng);
          this._makeBeam(this.towerGroup, 0.18, 0.18, dLen, x, my, 0, braceMat, 0, 0, -dAng);
        });
        // Ring beams at every level
        const span = half * 2 - 1.2;
        this._makeBeam(this.towerGroup, span, 0.28, 0.28, 0, y, -half, braceMat);
        this._makeBeam(this.towerGroup, span, 0.28, 0.28, 0, y, half, braceMat);
        this._makeBeam(this.towerGroup, 0.28, 0.28, span, -half, y, 0, braceMat);
        this._makeBeam(this.towerGroup, 0.28, 0.28, span, half, y, 0, braceMat);
      }

      // ── Cladding panels (east & west face alternating) ──
      const claddingMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.75, metalness: 0.15, side: THREE.FrontSide });
      for (let y = 0; y < towerHeight; y += 16) {
        // West face panels
        const panW = new THREE.Mesh(new THREE.PlaneGeometry(10, 15), claddingMat);
        panW.rotation.y = Math.PI / 2;
        panW.position.set(-half - 0.05, y + 7.5, 0);
        this.towerGroup.add(panW);
        // East face upper panels (above boarding arm)
        if (y > 48) {
          const panE = new THREE.Mesh(new THREE.PlaneGeometry(10, 15), claddingMat);
          panE.rotation.y = -Math.PI / 2;
          panE.position.set(half + 0.05, y + 7.5, 0);
          this.towerGroup.add(panE);
        }
      }

      // ── Vertical pipe runs (cryogenic + purge + orange LH2 vent) ──
      const cryPipeMat = new THREE.MeshStandardMaterial({ color: 0xe8edf0, roughness: 0.42, metalness: 0.45 });
      const lh2PipeMat = new THREE.MeshStandardMaterial({ color: 0xe65c00, roughness: 0.45, metalness: 0.35 });
      const goxPipeMat = new THREE.MeshStandardMaterial({ color: 0x78909c, roughness: 0.5, metalness: 0.5 });
      const pipeX = -half - 0.9;
      this._makeBeam(this.towerGroup, 0.42, towerHeight - 2, 0.42, pipeX, (towerHeight - 2) / 2, -2.8, lh2PipeMat);
      this._makeBeam(this.towerGroup, 0.32, towerHeight - 2, 0.32, pipeX, (towerHeight - 2) / 2, -1.8, cryPipeMat);
      this._makeBeam(this.towerGroup, 0.32, towerHeight - 2, 0.32, pipeX, (towerHeight - 2) / 2, 1.5, cryPipeMat);
      this._makeBeam(this.towerGroup, 0.26, towerHeight - 2, 0.26, pipeX, (towerHeight - 2) / 2, 2.5, goxPipeMat);
      // Horizontal pipe runs at key service levels
      [24, 44, 64].forEach(y => {
        this._makeBeam(this.towerGroup, 8, 0.28, 0.28, pipeX + 4.5, y, -2.3, lh2PipeMat);
        this._makeBeam(this.towerGroup, 8, 0.22, 0.22, pipeX + 4.5, y + 1.0, -1.8, cryPipeMat);
      });

      // ── Cable trays on south face ──
      const cableMat = new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.7, metalness: 0.3 });
      this._makeBeam(this.towerGroup, 0.6, towerHeight * 0.75, 2.8, half + 0.4, towerHeight * 0.375, half + 0.3, cableMat);
      for (let y = 4; y < towerHeight * 0.75; y += 4) {
        this._makeBeam(this.towerGroup, 0.08, 0.08, 2.8, half + 0.4, y, half + 0.3, braceMat);
      }

      // ── Service work platforms at every 8m ──
      const workPlatMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.75, metalness: 0.35 });
      const platRailMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.3 });
      [16, 24, 32, 40, 48, 56, 64, 72, 80].forEach((y) => {
        const pw = 10, pd = 8;
        const plat = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.3, pd), workPlatMat);
        plat.position.set(-1, y, -2);
        plat.castShadow = true;
        plat.receiveShadow = true;
        this.towerGroup.add(plat);
        // Yellow safety railings
        this._makeBeam(this.towerGroup, pw, 0.1, 0.1, -1, y + 1.1, -6.1, platRailMat);
        this._makeBeam(this.towerGroup, 0.1, 1.2, 0.1, -pw / 2 - 0.1, y + 0.7, -6.1, platRailMat);
        this._makeBeam(this.towerGroup, 0.1, 1.2, 0.1, pw / 2 - 0.1, y + 0.7, -6.1, platRailMat);
      });

      // ── Floodlights at 3 levels ──
      const floodHousingMat = new THREE.MeshStandardMaterial({ color: 0xeceff1, roughness: 0.4, metalness: 0.6 });
      [[half + 0.5, 30, 2, 0.4, -0.2], [half + 0.5, 55, 2, 0.4, -0.3], [-half - 0.5, 30, 2, -0.4, -0.2]].forEach(([fx, fy, fz, rx, ry]) => {
        const fh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 1.0), floodHousingMat);
        fh.position.set(fx, fy, fz);
        fh.rotation.set(rx, ry, 0);
        this.towerGroup.add(fh);
        const fLens = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3),
          new THREE.MeshStandardMaterial({ color: 0xfff8dc, emissive: 0xfff8dc, emissiveIntensity: 2.5 }));
        fLens.position.set(fx + (fx > 0 ? 0.32 : -0.32), fy, fz);
        fLens.rotation.y = fx > 0 ? -Math.PI / 2 : Math.PI / 2;
        this.towerGroup.add(fLens);
      });

      // ── Nitrogen purge arm near pad ──
      const nitMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, roughness: 0.6, metalness: 0.5 });
      this._makeBeam(this.towerGroup, 14, 0.35, 0.35, 7, 8, 0, nitMat, 0, 0, 0.18);
      this._makeBeam(this.towerGroup, 0.35, 10, 0.35, 14, 4, 0, nitMat);

      // ── Hydrogen burn-off stack (flare boom) ──
      const flareMat = new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.5, metalness: 0.55 });
      this._makeBeam(this.towerGroup, 20, 0.5, 0.5, 10, 70, -3, flareMat, 0, 0, 0.14);
      const flareTip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2, 8), flareMat);
      flareTip.position.set(20.2, 72.2, -3);
      this.towerGroup.add(flareTip);

      // ── Umbilical carrier arms (LOX + LH2 at two heights) ──
      const umbMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.5, metalness: 0.65 });
      [[half, 20, -3], [half, 36, -1]].forEach(([ux, uy, uz]) => {
        this._makeBeam(this.towerGroup, 8, 0.5, 0.5, ux + 4.5, uy, uz, umbMat);
        const umbEnd = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 1.4), umbMat);
        umbEnd.position.set(ux + 9.0, uy, uz);
        this.towerGroup.add(umbEnd);
      });

      // ── Staircase risers (open grating style, west face) ──
      const stairMat = new THREE.MeshStandardMaterial({ color: 0x607d8b, roughness: 0.65, metalness: 0.4 });
      for (let y = 0; y < 80; y += 8) {
        const dir = (y / 8) % 2 === 0 ? 1 : -1;
        this._makeBeam(this.towerGroup, 6, 0.18, 1.2, -1, y + 4.0, -4.0, stairMat, dir * 0.65, 0, 0);
        // Step edges
        for (let s = 0; s < 5; s++) {
          this._makeBeam(this.towerGroup, 6, 0.08, 0.08, -1, y + s * 1.6, -4.0 + dir * (s * 0.52 - 2.0), stairMat);
        }
      }

      // ── Electrical junction boxes ──
      const jboxMat = new THREE.MeshStandardMaterial({ color: 0x1a237e, roughness: 0.5, metalness: 0.6 });
      [[0, 12, -half - 0.4], [0, 36, -half - 0.4], [3, 52, half + 0.4]].forEach(([jx, jy, jz]) => {
        const jb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.4), jboxMat);
        jb.position.set(jx, jy, jz);
        this.towerGroup.add(jb);
      });

      // ── Ground-level concrete blast wall extensions ──
      const blastMat = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.9, metalness: 0.05 });
      [-12, 12].forEach(bz => {
        const bw = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 1.5), blastMat);
        bw.position.set(0, 5, bz);
        bw.castShadow = true;
        this.towerGroup.add(bw);
      });

      // ════════════════════════════════════════════════════════════════════════
      // ── FULL-HEIGHT 3-STOP ELEVATOR SYSTEM ──────────────────────────────────
      // Connects Ground Level (-7.3m in towerGroup / world y=12.5m on Pad 39A)
      // -> Spacecraft Boarding Gantry (44m) -> Tower Top Observation Deck (88m)
      // Shaft centre: X = -8.2, Z = -4.0 (aligned with Gantry Deck walkway)
      // ════════════════════════════════════════════════════════════════════════
      const ELV_X = -8.2, ELV_Z = -4.0;
      const ELV_BOTTOM = -7.3, ELV_GANTRY = 44.0, ELV_TOP = 88.0;

      // Shaft rails (two vertical heavy I-beams spanning from Ground -7.3m up to Top 88m: total height 95.3m)
      const shaftMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6, metalness: 0.75 });
      const shaftTotalHeight = towerHeight + 7.3; // 95.3m
      const shaftCenterY = (-7.3 + towerHeight) / 2; // 40.35m
      this._makeBeam(this.towerGroup, 0.35, shaftTotalHeight, 0.35, ELV_X - 1.5, shaftCenterY, ELV_Z, shaftMat);
      this._makeBeam(this.towerGroup, 0.35, shaftTotalHeight, 0.35, ELV_X + 1.5, shaftCenterY, ELV_Z, shaftMat);
      // Shaft cross ties every 8m from ground to top
      for (let y = -7.3; y <= towerHeight; y += 8) {
        this._makeBeam(this.towerGroup, 3.2, 0.22, 0.22, ELV_X, y, ELV_Z, shaftMat);
        this._makeBeam(this.towerGroup, 0.22, 0.22, 2.8, ELV_X, y, ELV_Z - 1.4, shaftMat);
        this._makeBeam(this.towerGroup, 0.22, 0.22, 2.8, ELV_X, y, ELV_Z + 1.4, shaftMat);
      }

      // ── Elevator Cabin (Animated Group) ──
      this.elevatorCab = new THREE.Group();
      this.elevatorCab.name = "ElevatorCab";
      this.elevatorCab.position.set(ELV_X, ELV_BOTTOM, ELV_Z);
      this.towerGroup.add(this.elevatorCab);

      const cabSteel = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.75 });
      const cabGlass = new THREE.MeshStandardMaterial({
        color: 0x80deea, roughness: 0.08, metalness: 0.1,
        transparent: true, opacity: 0.45, side: THREE.DoubleSide
      });
      // Floor (3.0m x 2.8m)
      const cabFloor = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 2.8), cabSteel);
      cabFloor.position.set(0, 0.08, 0);
      this.elevatorCab.add(cabFloor);
      // Ceiling
      const cabCeil = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 2.8), cabSteel);
      cabCeil.position.set(0, 2.7, 0);
      this.elevatorCab.add(cabCeil);
      // Back wall (west face)
      const cabBack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 2.8), cabSteel);
      cabBack.position.set(-1.44, 1.35, 0);
      this.elevatorCab.add(cabBack);
      // Side walls (glass on north & south sides)
      [-1.34, 1.34].forEach(z => {
        const sw = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.6, 0.08), cabGlass);
        sw.position.set(0, 1.35, z);
        this.elevatorCab.add(sw);
      });
      // Corner structural pillars
      [[-1.4, -1.3], [-1.4, 1.3], [1.4, -1.3], [1.4, 1.3]].forEach(([px, pz]) => {
        const cp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.16), cabSteel);
        cp.position.set(px, 1.35, pz);
        this.elevatorCab.add(cp);
      });
      // Interior ambient light inside cab (emissive strip covers mobile).
      if (!window.isMobileDevice) {
        const cabLight = new THREE.PointLight(0xfff5e0, 0.9, 6);
        cabLight.position.set(0, 2.2, 0);
        this.elevatorCab.add(cabLight);
      }
      // Cabin status strip (green = at gantry, amber = moving, red = at ground)
      this._elevatorLightMat = new THREE.MeshStandardMaterial({
        color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 2.2
      });
      const cabStatus = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 2.4), this._elevatorLightMat);
      cabStatus.position.set(-1.38, 2.55, 0);
      this.elevatorCab.add(cabStatus);

      // ── Connecting Catwalks at Every Floor ──
      const bridgeDeckMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72, metalness: 0.35 });
      const bridgeRailMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.4 });

      // 1. Ground Level Landing Platform (y = -7.3m in towerGroup, world y = 12.5m on Pad Hardstand)
      const groundPlatform = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.25, 6.4), bridgeDeckMat);
      groundPlatform.position.set(ELV_X - 0.8, -7.3 + 0.12, ELV_Z);
      groundPlatform.receiveShadow = true;
      this.towerGroup.add(groundPlatform);

      // Concrete foundation plinth beneath the ground platform
      const fdnMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0.1 });
      const fdnMesh = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.4, 6.8), fdnMat);
      fdnMesh.position.set(ELV_X - 0.8, -7.3 - 0.2, ELV_Z);
      this.towerGroup.add(fdnMesh);

      // Safety railings (enclosing north and west, leaving south and east open for easy entrance)
      this._makeBeam(this.towerGroup, 6.4, 0.1, 0.1, ELV_X - 0.8, -7.3 + 1.2, ELV_Z - 3.2, bridgeRailMat);
      this._makeBeam(this.towerGroup, 0.1, 0.1, 6.4, ELV_X - 4.0, -7.3 + 1.2, ELV_Z, bridgeRailMat);

      // Weather canopy / entrance awning
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.5 });
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.2, 5.2), canopyMat);
      canopy.position.set(ELV_X - 0.8, -7.3 + 3.6, ELV_Z + 0.6);
      this.towerGroup.add(canopy);
      this._makeBeam(this.towerGroup, 0.16, 3.6, 0.16, ELV_X + 2.3, -7.3 + 1.8, ELV_Z + 3.1, canopyMat);
      this._makeBeam(this.towerGroup, 0.16, 3.6, 0.16, ELV_X - 3.9, -7.3 + 1.8, ELV_Z + 3.1, canopyMat);

      // Downward spotlight at entrance
      const groundLight = new THREE.PointLight(0xffedd5, 1.4, 12);
      groundLight.position.set(ELV_X, -7.3 + 3.2, ELV_Z);
      this.towerGroup.add(groundLight);

      // Ground Entrance Header Sign: "🛗 FIXED SERVICE STRUCTURE ELEVATOR"
      const groundSignCanvas = document.createElement("canvas");
      groundSignCanvas.width = 512; groundSignCanvas.height = 128;
      const gsCtx = groundSignCanvas.getContext("2d");
      gsCtx.fillStyle = "#0f172a";
      gsCtx.fillRect(0, 0, 512, 128);
      gsCtx.strokeStyle = "#38bdf8";
      gsCtx.lineWidth = 6;
      gsCtx.strokeRect(4, 4, 504, 120);
      gsCtx.fillStyle = "#38bdf8";
      gsCtx.font = "bold 30px Arial";
      gsCtx.textAlign = "center";
      gsCtx.fillText("🛗 FSS ELEVATOR · GROUND ENTRANCE", 256, 44);
      gsCtx.fillStyle = "#fbbf24";
      gsCtx.font = "bold 22px Arial";
      gsCtx.fillText("[1] GROUND · [2] GANTRY (44m) · [3/T] TOP DECK (88m)", 256, 82);
      gsCtx.fillStyle = "#34d399";
      gsCtx.font = "bold 18px Arial";
      gsCtx.fillText("STEP INSIDE OR PRESS [3] / [T] TO REACH TOP DECK", 256, 110);
      const gsTex = new THREE.CanvasTexture(groundSignCanvas);
      const groundSignMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), new THREE.MeshBasicMaterial({ map: gsTex, transparent: true }));
      groundSignMesh.position.set(ELV_X - 0.8, -7.3 + 3.2, ELV_Z + 3.22);
      this.towerGroup.add(groundSignMesh);

      // 2. Gantry Level Catwalk Bridge (y = 44m -> leads straight to Orbiter Access Arm & White Room!)
      const gantryBridge = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 3.6), bridgeDeckMat);
      gantryBridge.position.set(-7.2, ELV_GANTRY, ELV_Z);
      gantryBridge.castShadow = true;
      gantryBridge.receiveShadow = true;
      this.towerGroup.add(gantryBridge);

      // Bridge side railings
      this._makeBeam(this.towerGroup, 2.4, 0.1, 0.1, -7.2, ELV_GANTRY + 1.15, ELV_Z + 1.8, bridgeRailMat);
      this._makeBeam(this.towerGroup, 2.4, 0.1, 0.1, -7.2, ELV_GANTRY + 1.15, ELV_Z - 1.8, bridgeRailMat);

      // 3. Tower Top Observation Bridge (y = 88m -> leads to top crane & lightning mast deck)
      const topBridge = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 3.6), bridgeDeckMat);
      topBridge.position.set(-7.2, ELV_TOP, ELV_Z);
      topBridge.castShadow = true;
      topBridge.receiveShadow = true;
      this.towerGroup.add(topBridge);

      this._makeBeam(this.towerGroup, 2.4, 0.1, 0.1, -7.2, ELV_TOP + 1.15, ELV_Z + 1.8, bridgeRailMat);
      this._makeBeam(this.towerGroup, 2.4, 0.1, 0.1, -7.2, ELV_TOP + 1.15, ELV_Z - 1.8, bridgeRailMat);

      // ── Call Stations at Ground, Gantry, and Top ──
      const createCallStation = (yPos, labelText) => {
        const grp = new THREE.Group();
        grp.position.set(ELV_X - 1.6, yPos + 1.8, ELV_Z - 1.5);
        this.towerGroup.add(grp);

        const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.15),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.65 }));
        grp.add(base);

        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 12),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 1.8 }));
        btn.rotation.x = Math.PI / 2;
        btn.position.set(0, 0.22, 0.08);
        grp.add(btn);

        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 128;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 256, 128);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 26px Arial";
        ctx.textAlign = "center";
        ctx.fillText("🛗 ELEVATOR", 128, 38);
        ctx.fillStyle = "#facc15";
        ctx.font = "bold 20px Arial";
        ctx.fillText(labelText, 128, 72);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "16px Arial";
        ctx.fillText("[E] / [G] CALL & RIDE", 128, 104);
        const tex = new THREE.CanvasTexture(canvas);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.35), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
        sign.position.set(0, -0.32, 0.08);
        grp.add(sign);
        return grp;
      };

      createCallStation(ELV_BOTTOM, "1: GROUND (PAD 39A)");
      createCallStation(ELV_GANTRY, "2: GANTRY (44m)");
      createCallStation(ELV_TOP,    "3: TOWER TOP (88m)");

      // Store elevator config for update() / key handler
      this._elevatorConfig = { x: ELV_X, z: ELV_Z, bottom: ELV_BOTTOM, gantry: ELV_GANTRY, top: ELV_TOP };
      this.elevatorY = ELV_BOTTOM;
      this.elevatorTargetY = ELV_BOTTOM;

      // Small service platforms at a few levels.
      [28, 60, 80].forEach((y) => {
        const platform = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.45, 11.0), deckMat);
        platform.position.set(0, y, 0);
        platform.castShadow = true;
        platform.receiveShadow = true;
        this.towerGroup.add(platform);

        const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.55, metalness: 0.5 });
        this._makeBeam(this.towerGroup, 10.8, 0.12, 0.12, 0, y + 1.1, 5.5, railMat);
        this._makeBeam(this.towerGroup, 0.12, 1.2, 0.12, 5.4, y + 0.6, 5.5, railMat);
        this._makeBeam(this.towerGroup, 0.12, 1.2, 0.12, -5.4, y + 0.6, 5.5, railMat);
      });

      // Walkable Crew Staging Gantry Deck at y = 44m above MLP (world Y = 63.8m)
      const deckTex = this._makeCanvasTexture(256, (ctx, s) => {
        ctx.fillStyle = "#3f4a54";
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = "rgba(18,24,30,0.4)";
        ctx.lineWidth = 2;
        for (let i = 0; i <= 8; i++) {
          const p = (i / 8) * s;
          ctx.beginPath();
          ctx.moveTo(p, 0);
          ctx.lineTo(p, s);
          ctx.moveTo(0, p);
          ctx.lineTo(s, p);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(250,204,21,0.55)";
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, s - 8, s - 8);
      }, 4, 4);
      const stagingDeckMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: deckTex,
        roughness: 0.72,
        metalness: 0.35
      });
      const stagingDeck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 18), stagingDeckMat);
      stagingDeck.position.set(1.5, 44.0, -4.0);
      stagingDeck.castShadow = true;
      stagingDeck.receiveShadow = true;
      this.towerGroup.add(stagingDeck);

      // Support trusses below the staging deck.
      this._makeBeam(this.towerGroup, 11.0, 0.26, 0.26, 0.0, 41.0, -9.0, steelMat, 0.55, 0, 0);
      this._makeBeam(this.towerGroup, 11.0, 0.26, 0.26, 0.0, 41.0, 1.0, steelMat, -0.55, 0, 0);
      this._makeBeam(this.towerGroup, 0.26, 0.26, 17.6, -6.0, 41.0, -4.0, darkSteelMat, 0, 0, 0);
      this._makeBeam(this.towerGroup, 0.26, 0.26, 17.6, 9.0, 41.0, -4.0, darkSteelMat, 0, 0, 0);

      // Safety railings around the open sides of the gantry deck (corner-trimmed).
      // West railing is split around z = -4.0 to leave a clear 3.6m doorway for the elevator bridge!
      const railMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.55, metalness: 0.35 });
      const railPostMat = new THREE.MeshStandardMaterial({ color: 0x9aa8b3, roughness: 0.55, metalness: 0.45 });
      const railSegments = [
        { x: 1.5, z: 4.92, sx: 15.88, sz: 0.12, rotY: 0 },
        { x: 1.5, z: -12.92, sx: 15.88, sz: 0.12, rotY: 0 },
        { x: -6.42, z: 1.35, sx: 0.12, sz: 7.1, rotY: 0 },
        { x: -6.42, z: -9.35, sx: 0.12, sz: 7.1, rotY: 0 },
        { x: 9.42, z: -10.8, sx: 0.12, sz: 4.12, rotY: 0 },
        { x: 9.42, z: 2.8, sx: 0.12, sz: 4.32, rotY: 0 }
      ];
      railSegments.forEach((seg) => {
        this._makeBeam(this.towerGroup, seg.sx, 0.14, seg.sz, seg.x, 45.35, seg.z, railMat);
        this._makeBeam(this.towerGroup, seg.sx, 0.08, seg.sz, seg.x, 44.75, seg.z, railPostMat);
      });
      for (let i = 0; i < 18; i++) {
        const x = -6.3 + i * 0.92;
        this._makeBeam(this.towerGroup, 0.08, 1.35, 0.08, x, 44.7, 4.9, railPostMat);
        this._makeBeam(this.towerGroup, 0.08, 1.35, 0.08, x, 44.7, -12.9, railPostMat);
      }
      for (let i = 0; i < 18; i++) {
        const z = -12.8 + i * 0.98;
        if (z < -5.8 || z > -2.2) {
          this._makeBeam(this.towerGroup, 0.08, 1.35, 0.08, -6.4, 44.7, z, railPostMat);
        }
      }

      // Boarding Dock Control Console on Gantry Deck.
      const dockConsole = new THREE.Group();
      dockConsole.position.set(8.1, 44.3, -5.4);
      const cBase = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.15, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.45, metalness: 0.6 })
      );
      cBase.position.set(0, 0.58, 0);
      dockConsole.add(cBase);

      this.dockStatusLightMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.4
      });
      const cScreen = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.45, 0.06), this.dockStatusLightMat);
      cScreen.position.set(0, 1.25, 0.25);
      cScreen.rotation.x = -0.25;
      dockConsole.add(cScreen);
      this.towerGroup.add(dockConsole);

      // Pivoting Orbiter Access Arm (OAA) + White Room Boarding Bridge.
      // Pivot sits on the east face of the tower, aligned with the orbiter hatch.
      this.armPivotGroup = new THREE.Group();
      this.armPivotGroup.position.set(8.5, 44.0, -7.2);
      this.armPivotGroup.rotation.y = this.dockSwingAngle; // Starts retracted!
      this.towerGroup.add(this.armPivotGroup);

      // Walkable bridge floor inside the access arm. The arm runs from the
      // tower face to the orbiter's port-side hatch; its length matches the
      // 19 m reach needed to close the gap to the fuselage at x ~= -2.2.
      // The floor starts at the staging-deck edge instead of overlapping it.
      // Both decks share the same walking height, and a coplanar overlap makes
      // the bridge flicker with depth-buffer z-fighting as the crew crosses.
      const bridgeFloor = new THREE.Mesh(
        new THREE.BoxGeometry(18.0, 0.3, 2.8),
        new THREE.MeshStandardMaterial({ color: 0x8493a0, roughness: 0.65, metalness: 0.4 })
      );
      bridgeFloor.position.set(10.0, 0.15, 0);
      this.armPivotGroup.add(bridgeFloor);

      // Access-arm side trusses and handrails.
      const armBehindMat = new THREE.MeshStandardMaterial({ color: 0x5b6772, roughness: 0.6, metalness: 0.5 });
      [-1.3, 1.3].forEach((z) => {
        this._makeBeam(this.armPivotGroup, 19.0, 0.2, 0.2, 9.5, 2.55, z, armBehindMat);
        this._makeBeam(this.armPivotGroup, 19.0, 0.16, 0.16, 9.5, 1.45, z, armBehindMat);
        for (let i = 0; i <= 9; i++) {
          this._makeBeam(this.armPivotGroup, 0.1, 1.15, 0.1, i * 2.0, 1.95, z, armBehindMat);
        }
      });
      // Diagonal lattice on the outer faces.
      for (let i = 0; i < 9; i++) {
        this._makeBeam(this.armPivotGroup, 2.55, 0.16, 0.16, 1 + i * 2.0, 1.35, 1.3, armBehindMat, 0.55, 0, 0);
        this._makeBeam(this.armPivotGroup, 2.55, 0.16, 0.16, 1 + i * 2.0, 1.35, -1.3, armBehindMat, -0.55, 0, 0);
      }

      // White Room environmental docking chamber at the end of the arm.
      const whiteRoom = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 3.2, 3.8),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.38, metalness: 0.14 })
      );
      whiteRoom.position.set(20.2, 1.6, 0);
      this.armPivotGroup.add(whiteRoom);

      // White Room hatch plate and status strip.
      const hatchPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 2.6),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4, metalness: 0.3 })
      );
      hatchPlate.rotation.y = Math.PI / 2;
      hatchPlate.position.set(21.92, 1.55, 0);
      this.armPivotGroup.add(hatchPlate);

      const hatchGlowMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.2
      });
      const hatchGlow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 2.0), hatchGlowMat);
      hatchGlow.position.set(21.97, 2.85, 0);
      this.armPivotGroup.add(hatchGlow);

      // Extendable docking collar seal connecting the White Room to the hatch.
      this.dockCollarMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.15, 1.6, 24),
        new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 0.6,
          roughness: 0.4
        })
      );
      this.dockCollarMesh.rotation.z = Math.PI / 2;
      this.dockCollarMesh.position.set(22.3, 1.45, 0);
      this.armPivotGroup.add(this.dockCollarMesh);

      // LC-39A identification plate on the tower face.
      const signCanvas = document.createElement("canvas");
      signCanvas.width = 512;
      signCanvas.height = 160;
      const signCtx = signCanvas.getContext("2d");
      signCtx.fillStyle = "#101820";
      signCtx.fillRect(0, 0, 512, 160);
      signCtx.strokeStyle = "#e2e8f0";
      signCtx.lineWidth = 8;
      signCtx.strokeRect(8, 8, 496, 144);
      signCtx.fillStyle = "#f8fafc";
      signCtx.font = "900 82px Arial, Helvetica, sans-serif";
      signCtx.textAlign = "center";
      signCtx.textBaseline = "middle";
      signCtx.fillText("LC-39A", 256, 84);
      const signTex = new THREE.CanvasTexture(signCanvas);
      if (THREE.sRGBEncoding !== undefined) signTex.encoding = THREE.sRGBEncoding;
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(9.5, 3.0),
        new THREE.MeshBasicMaterial({
          map: signTex,
          transparent: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        })
      );
      sign.rotation.y = Math.PI / 2;
      sign.position.set(6.32, 53.0, -1.0);
      this.towerGroup.add(sign);

      // ════════════════════════════════════════════════════════════════════════
      // ── GASEOUS OXYGEN (GOX) VENT ARM & BEANIE CAP (LEVEL 300) ──────────────
      // Recreates the iconic heated vent hood covering the External Tank apex:
      // Spans from tower face (x=6) to ET nose cone (x=34) at y=52.0 in tower space.
      // ════════════════════════════════════════════════════════════════════════
      this.goxVentArm = new THREE.Group();
      this.goxVentArm.name = "GOX_VentArm_BeanieCap";
      this.goxVentArm.position.set(6.0, 52.0, 0);
      this.towerGroup.add(this.goxVentArm);

      const armReach = 28.0; // reaches from tower face (x=6) to ET apex (x=34)
      const goxMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.52, metalness: 0.5 });
      const ductMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.35 });
      const beanieOuterMat = new THREE.MeshStandardMaterial({ color: 0x8a99a8, roughness: 0.55, metalness: 0.45 });
      const beanieRimMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.65, metalness: 0.2 });

      // Main triangular truss boom
      // Upper chord
      this._makeBeam(this.goxVentArm, armReach, 0.22, 0.22, armReach / 2, 1.2, 0, goxMat);
      // Lower twin chords
      this._makeBeam(this.goxVentArm, armReach, 0.22, 0.22, armReach / 2, -1.2, -0.9, goxMat);
      this._makeBeam(this.goxVentArm, armReach, 0.22, 0.22, armReach / 2, -1.2, 0.9, goxMat);

      // Diagonal lattice braces along the boom
      for (let bx = 0; bx < armReach - 2; bx += 3.2) {
        this._makeBeam(this.goxVentArm, 3.4, 0.12, 0.12, bx + 1.6, 0, -0.45, goxMat, 0.65, 0, 0);
        this._makeBeam(this.goxVentArm, 3.4, 0.12, 0.12, bx + 1.6, 0, 0.45, goxMat, -0.65, 0, 0);
        this._makeBeam(this.goxVentArm, 0.12, 0.12, 1.8, bx, -1.2, 0, goxMat);
      }

      // Large insulated cryogenic vent ducts (twin flex pipes running down arm)
      for (const dz of [-0.45, 0.45]) {
        const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, armReach - 1, 14), ductMat);
        duct.rotation.z = Math.PI / 2;
        duct.position.set((armReach - 1) / 2, 0.3, dz);
        this.goxVentArm.add(duct);
      }

      // ── THE BEANIE CAP (Vent Hood over ET apex) ──
      // Conical / oval heated hood enveloping the orange nose cone of the ET
      const beanieGroup = new THREE.Group();
      beanieGroup.position.set(armReach, 0, 0);
      this.goxVentArm.add(beanieGroup);

      // Upper hood cone
      const hoodTop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 2.6, 2.4, 24, 1, true),
        beanieOuterMat
      );
      hoodTop.position.set(0, 0.8, 0);
      beanieGroup.add(hoodTop);

      // Lower insulated flare / seal skirt
      const hoodSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.85, 0.9, 24),
        beanieRimMat
      );
      hoodSkirt.position.set(0, -0.85, 0);
      beanieGroup.add(hoodSkirt);

      // Hood crown cap & exhaust port
      const hoodCrown = new THREE.Mesh(
        new THREE.SphereGeometry(0.85, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        beanieOuterMat
      );
      hoodCrown.position.set(0, 2.0, 0);
      beanieGroup.add(hoodCrown);

      // Duct elbow connectors into the beanie cap
      for (const dz of [-0.65, 0.65]) {
        const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 12), ductMat);
        elbow.rotation.x = dz > 0 ? 0.4 : -0.4;
        elbow.position.set(-0.4, 1.5, dz);
        beanieGroup.add(elbow);
      }

      // Cryogenic vapor wisps venting gently from underneath the beanie cap
      const vaporGeo = new THREE.RingGeometry(2.6, 3.4, 20);
      vaporGeo.rotateX(-Math.PI / 2);
      const vaporMat = new THREE.MeshBasicMaterial({
        color: 0xf1f5f9,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const vaporRing = new THREE.Mesh(vaporGeo, vaporMat);
      vaporRing.position.set(0, -1.35, 0);
      beanieGroup.add(vaporRing);

      // ════════════════════════════════════════════════════════════════════════
      // ── 195-FT LEVEL EMERGENCY EGRESS PORCH & SLIDEWIRE SYSTEM ──────────────
      // Egress porch on the west face with yellow escape baskets & guide cables
      // ════════════════════════════════════════════════════════════════════════
      const egressY = 56.0;
      const egressPorch = new THREE.Group();
      egressPorch.name = "EmergencyEgressPorch";
      egressPorch.position.set(-half - 3.5, egressY, 0);
      this.towerGroup.add(egressPorch);

      // Extended platform deck (7m x 6m)
      const epDeck = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.3, 6.0), deckMat);
      egressPorch.add(epDeck);

      // Yellow safety railing & gate
      const epRailMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.4 });
      this._makeBeam(egressPorch, 7.0, 0.1, 0.1, 0, 1.15, 3.0, epRailMat);
      this._makeBeam(egressPorch, 7.0, 0.1, 0.1, 0, 1.15, -3.0, epRailMat);
      this._makeBeam(egressPorch, 0.1, 0.1, 6.0, -3.5, 1.15, 0, epRailMat);
      for (let ex = -3.2; ex <= 3.2; ex += 1.6) {
        this._makeBeam(egressPorch, 0.08, 1.2, 0.08, ex, 0.6, 3.0, epRailMat);
        this._makeBeam(egressPorch, 0.08, 1.2, 0.08, ex, 0.6, -3.0, epRailMat);
      }

      // Overhead slidewire track beam
      this._makeBeam(egressPorch, 6.5, 0.25, 0.25, -0.5, 3.2, 0, darkSteelMat);

      // Suspended emergency escape baskets (3x yellow basket cars)
      for (const bz of [-1.8, 0, 1.8]) {
        const basket = new THREE.Group();
        basket.position.set(-2.8, 1.5, bz);
        egressPorch.add(basket);

        // Basket cage (yellow steel mesh)
        const bBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.2), epRailMat);
        basket.add(bBody);
        const bInterior = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.0), darkSteelMat);
        basket.add(bInterior);

        // Trolley hanger & pulleys to overhead wire
        this._makeBeam(basket, 0.08, 1.6, 0.08, 0, 1.4, 0, darkSteelMat);
        const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10), darkSteelMat);
        pulley.rotation.z = Math.PI / 2;
        pulley.position.set(0, 2.2, 0);
        basket.add(pulley);

        // Slidewire cable stretching down towards ground shelter
        this._makeBeam(this.towerGroup, 35, 0.05, 0.05, -half - 20, egressY - 14, bz, steelMat, 0.65, 0, 0);
      }

      // ════════════════════════════════════════════════════════════════════════
      // ── ELEVATOR MACHINERY PENTHOUSE (TOP WEST FACE) ─────────────────────────
      // Two-story enclosed corrugated machine house with louvers & railings
      // ════════════════════════════════════════════════════════════════════════
      const phHouse = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 8.0, 5.8),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.68, metalness: 0.35 })
      );
      phHouse.position.set(-half - 3.0, 88.0, 4.0);
      phHouse.castShadow = true;
      this.towerGroup.add(phHouse);

      // Ventilation louver panel on penthouse exterior
      const louver = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.0),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7, metalness: 0.5 })
      );
      louver.rotation.y = -Math.PI / 2;
      louver.position.set(-half - 5.62, 88.0, 4.0);
      this.towerGroup.add(louver);

      // Penthouse roof railing
      this._makeBeam(this.towerGroup, 5.2, 0.08, 0.08, -half - 3.0, 92.5, 6.9, epRailMat);
      this._makeBeam(this.towerGroup, 5.2, 0.08, 0.08, -half - 3.0, 92.5, 1.1, epRailMat);

      // ════════════════════════════════════════════════════════════════════════
      // ── PYRAMIDAL DERRICK BASE & TALL FIBERGLASS LIGHTNING SPIRE ────────────
      // Matches the authentic peak of the NASA FSS in the reference photo:
      // 1. Four-legged pyramidal structural lattice from y=88 to y=100
      // 2. Slender white fiberglass mast spire from y=100 to y=128
      // 3. Dual red aviation beacons, warning bands, and catenary grounding wires
      // ════════════════════════════════════════════════════════════════════════
      const pyrBaseY = 88.0, pyrTopY = 100.0;
      const pyrBaseHalf = 5.8, pyrTopHalf = 1.8;
      const pyrColMat = new THREE.MeshStandardMaterial({ color: 0x8b98a4, roughness: 0.5, metalness: 0.6 });

      // Four corner sloping lattice legs
      const legPairs = [
        [-pyrBaseHalf, -pyrBaseHalf, -pyrTopHalf, -pyrTopHalf],
        [pyrBaseHalf, -pyrBaseHalf, pyrTopHalf, -pyrTopHalf],
        [-pyrBaseHalf, pyrBaseHalf, -pyrTopHalf, pyrTopHalf],
        [pyrBaseHalf, pyrBaseHalf, pyrTopHalf, pyrTopHalf]
      ];
      legPairs.forEach(([bx, bz, tx, tz]) => {
        this._makeBeam(this.towerGroup, 0.42, 0.42, Math.hypot(bx - tx, pyrTopY - pyrBaseY, bz - tz),
          (bx + tx) / 2, (pyrBaseY + pyrTopY) / 2, (bz + tz) / 2, pyrColMat,
          Math.atan2(bz - tz, pyrTopY - pyrBaseY), 0, Math.atan2(bx - tx, pyrTopY - pyrBaseY));
      });

      // Solid observation deck platform floor at y = 88.0m (under lightning spire)
      const topDeckPlatform = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.45, 11.6), deckMat);
      topDeckPlatform.position.set(0, pyrBaseY, 0);
      topDeckPlatform.receiveShadow = true;
      this.towerGroup.add(topDeckPlatform);

      // Top Deck perimeter safety railings (with open gap on west side at z = -4.0 where elevator bridge connects)
      const topRailMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45, metalness: 0.5 });
      this._makeBeam(this.towerGroup, 11.6, 0.1, 0.1, 0, pyrBaseY + 1.15, 5.7, topRailMat);
      this._makeBeam(this.towerGroup, 11.6, 0.1, 0.1, 0, pyrBaseY + 1.15, -5.7, topRailMat);
      this._makeBeam(this.towerGroup, 0.1, 0.1, 11.6, 5.7, pyrBaseY + 1.15, 0, topRailMat);
      this._makeBeam(this.towerGroup, 0.1, 0.1, 7.8, -5.7, pyrBaseY + 1.15, 1.8, topRailMat);
      this._makeBeam(this.towerGroup, 0.1, 0.1, 3.6, -5.7, pyrBaseY + 1.15, -7.6, topRailMat);

      // Observation Binoculars & Weather Station on East railing overlooking Space Shuttle orbiter & Atlantic Ocean
      const binoGrp = new THREE.Group();
      binoGrp.position.set(5.5, pyrBaseY, 0);
      const binoPole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.35, 12),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4, metalness: 0.7 }));
      binoPole.position.y = 0.68;
      binoGrp.add(binoPole);
      const binoHead = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.35),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 }));
      binoHead.position.set(0, 1.4, 0);
      binoGrp.add(binoHead);
      [-0.1, 0.1].forEach(oz => {
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.25, 12),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.9 }));
        lens.rotation.z = Math.PI / 2;
        lens.position.set(0.18, 1.4, oz);
        binoGrp.add(lens);
      });
      this.towerGroup.add(binoGrp);

      // Authentic NASA Top Deck Plaque
      const tdSignCanvas = document.createElement("canvas");
      tdSignCanvas.width = 512; tdSignCanvas.height = 128;
      const tctx = tdSignCanvas.getContext("2d");
      tctx.fillStyle = "#0f172a"; tctx.fillRect(0, 0, 512, 128);
      tctx.strokeStyle = "#38bdf8"; tctx.lineWidth = 6; tctx.strokeRect(4, 4, 504, 120);
      tctx.fillStyle = "#38bdf8"; tctx.font = "bold 26px Arial"; tctx.textAlign = "center";
      tctx.fillText("NASA KSC · FSS APEX OBSERVATION DECK", 256, 44);
      tctx.fillStyle = "#facc15"; tctx.font = "bold 22px Arial";
      tctx.fillText("ELEVATION 300 FT (88m) · LIGHTNING MAST ZONE", 256, 88);
      const tdSignMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tdSignCanvas), transparent: true }));
      tdSignMesh.rotation.y = Math.PI / 2;
      tdSignMesh.position.set(-5.6, pyrBaseY + 1.8, -4.0);
      this.towerGroup.add(tdSignMesh);

      // Deck Corner Floodlights aimed at lightning spire and launch mount
      [[-5.2, -5.2], [5.2, -5.2], [-5.2, 5.2], [5.2, 5.2]].forEach(([lx, lz]) => {
        const light = new THREE.SpotLight(0xfffbeb, 0.85, 90, Math.PI / 4, 0.45);
        light.position.set(lx, pyrBaseY + 1.2, lz);
        light.target.position.set(0, pyrTopY + 14, 0);
        this.towerGroup.add(light);
        this.towerGroup.add(light.target);
      });

      // Pyramidal horizontal tie frames & X-braces
      [pyrBaseY + 4.0, pyrBaseY + 8.0, pyrTopY].forEach((fy) => {
        const factor = (fy - pyrBaseY) / (pyrTopY - pyrBaseY);
        const curHalf = pyrBaseHalf + (pyrTopHalf - pyrBaseHalf) * factor;
        this._makeBeam(this.towerGroup, curHalf * 2, 0.22, 0.22, 0, fy, -curHalf, pyrColMat);
        this._makeBeam(this.towerGroup, curHalf * 2, 0.22, 0.22, 0, fy, curHalf, pyrColMat);
        this._makeBeam(this.towerGroup, 0.22, 0.22, curHalf * 2, -curHalf, fy, 0, pyrColMat);
        this._makeBeam(this.towerGroup, 0.22, 0.22, curHalf * 2, curHalf, fy, 0, pyrColMat);
      });

      // Hammerhead crane on top deck
      const jibMat = new THREE.MeshStandardMaterial({ color: 0x8b98a4, roughness: 0.52, metalness: 0.55 });
      this._makeBeam(this.towerGroup, 34, 0.85, 1.1, 7, pyrBaseY + 2.5, 0, jibMat);
      const counterweight = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.0, 3.0), deckMat);
      counterweight.position.set(-9.5, pyrBaseY + 2.2, 0);
      this.towerGroup.add(counterweight);

      const craneCab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.6, 2.8), jibMat);
      craneCab.position.set(1.2, pyrBaseY + 2.4, 1.8);
      this.towerGroup.add(craneCab);

      const hookCable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 14, 6), darkSteelMat);
      hookCable.position.set(18, pyrBaseY - 3.5, 0);
      this.towerGroup.add(hookCable);
      const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.9), steelMat);
      hookBlock.position.set(18, pyrBaseY - 11.0, 0);
      this.towerGroup.add(hookBlock);

      // ── TALL SLENDER WHITE FIBERGLASS LIGHTNING MAST SPIRE ──
      // Rises from pyrTopY (y=100m) to y=128m (28m high!)
      const spireHeight = 28.0;
      const spireMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.15 });
      const warnOrangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45, metalness: 0.2 });

      const lightningSpire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.65, spireHeight, 16),
        spireMat
      );
      lightningSpire.position.set(0, pyrTopY + spireHeight / 2, 0);
      lightningSpire.castShadow = true;
      this.towerGroup.add(lightningSpire);

      // Aviation warning orange bands on the spire
      [pyrTopY + 8.0, pyrTopY + 17.0].forEach((wy) => {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.46, 2.2, 16),
          warnOrangeMat
        );
        band.position.set(0, wy, 0);
        this.towerGroup.add(band);
      });

      // Stainless steel lightning finial rod at the very tip (reaching y=130m)
      const finialRod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.12, 3.2, 8),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 })
      );
      finialRod.position.set(0, pyrTopY + spireHeight + 1.6, 0);
      this.towerGroup.add(finialRod);

      // Dual red aviation obstruction beacons (pulsing)
      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 2.4
      });
      [-0.45, 0.45].forEach((bx) => {
        const beaconSphere = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8), beaconMat);
        beaconSphere.position.set(bx, pyrTopY + spireHeight + 0.4, 0);
        this.towerGroup.add(beaconSphere);
      });

      this.beaconLight = new THREE.PointLight(0xef4444, 2.5, 140);
      this.beaconLight.position.set(0, pyrTopY + spireHeight + 0.5, 0);
      this.towerGroup.add(this.beaconLight);

      // Catenary grounding guy wires sloping down from mast to tower corners
      [-pyrBaseHalf, pyrBaseHalf].forEach((gx) => {
        [-pyrBaseHalf, pyrBaseHalf].forEach((gz) => {
          this._makeBeam(this.towerGroup, Math.hypot(gx, 22, gz), 0.06, 0.06,
            gx / 2, pyrTopY + 4, gz / 2, darkSteelMat,
            Math.atan2(gz, 22), 0, Math.atan2(gx, 22));
        });
      });
    }

    // ============================================================================
    // 3b. ROTATING SERVICE STRUCTURE (RSS) — LC-39A
    // ============================================================================
    // Recreates the massive movable structure adjacent to the FSS:
    // 1. Massive cylindrical Hinge Column & pivot bearing at (x = -18, z = 16)
    // 2. Triangular tubular space-frame bridge truss connecting hinge to PCR
    // 3. Payload Changeout Room (PCR): 5-story cleanroom body with corrugated
    //    industrial siding, multi-tier railed access galleries, and payload bay seals
    // 4. Twin OMPS hypergolic propellant tanks with hemispherical dome tops on roof
    // 5. Circular ground rail track and 8-wheel drive trucks with hydraulic jacks
    // 6. High-intensity floodlight arrays and industrial pipe risers
    _buildRotatingServiceStructure() {
      const THREE = window.THREE;
      this.rssGroup = new THREE.Group();
      this.rssGroup.name = "RotatingServiceStructure_RSS";
      this.padGroup.add(this.rssGroup);

      const rssSteelMat = new THREE.MeshStandardMaterial({ color: 0x828f9d, roughness: 0.58, metalness: 0.42 });
      const rssDarkMat  = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.55 });
      const rssTubularMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.52, metalness: 0.48 });
      const rssYellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.35 });
      const domeMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.28, metalness: 0.72 });
      const corrugatedMat = new THREE.MeshStandardMaterial({ color: 0x8a99a8, roughness: 0.62, metalness: 0.38 });

      // ── 1. Hinge Column (Pivot Mast) at (x = -18, y = 19.8, z = 16) ──
      const hingeX = -18, hingeZ = 16, hingeBaseY = 19.8, hingeHeight = 36;
      const hingeCol = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.8, hingeHeight, 24),
        rssSteelMat
      );
      hingeCol.position.set(hingeX, hingeBaseY + hingeHeight / 2, hingeZ);
      hingeCol.castShadow = true;
      hingeCol.receiveShadow = true;
      this.rssGroup.add(hingeCol);

      // Flange rings on the hinge column
      for (let y = 4; y < hingeHeight; y += 8) {
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(1.85, 1.85, 0.6, 24),
          rssDarkMat
        );
        ring.position.set(hingeX, hingeBaseY + y, hingeZ);
        this.rssGroup.add(ring);
      }

      // Diagonal anchor braces at base of hinge column
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const footX = hingeX + Math.cos(ang) * 6.5;
        const footZ = hingeZ + Math.sin(ang) * 6.5;
        this._makeBeam(this.rssGroup, 7.8, 0.5, 0.5, (hingeX + footX) / 2, hingeBaseY + 4.5, (hingeZ + footZ) / 2, rssSteelMat,
          Math.atan2(hingeZ - footZ, 9), 0, Math.atan2(hingeX - footX, 9));
      }

      // ── 2. Triangular Tubular Bridge Truss ──
      // Spans from hinge column to the Payload Changeout Room (PCR)
      const pcrOriginX = 5.0, pcrOriginZ = 16.0;
      const trussSpan = Math.hypot(pcrOriginX - hingeX, pcrOriginZ - hingeZ);
      const trussYaw = Math.atan2(pcrOriginZ - hingeZ, pcrOriginX - hingeX);

      // Upper and lower tubular chords
      for (const yOff of [10, 20, 30]) {
        for (const zOff of [-4, 4]) {
          this._makeBeam(this.rssGroup, trussSpan - 2, 0.65, 0.65,
            (hingeX + pcrOriginX) / 2, hingeBaseY + yOff, (hingeZ + pcrOriginZ) / 2 + zOff,
            rssTubularMat, 0, -trussYaw, 0);
        }
        // Diagonal cross-bracing along the tubular bridge
        for (let s = 0; s < 4; s++) {
          const t1 = s / 4;
          const t2 = (s + 1) / 4;
          const bx1 = hingeX + (pcrOriginX - hingeX) * t1;
          const bx2 = hingeX + (pcrOriginX - hingeX) * t2;
          this._makeBeam(this.rssGroup, 6.2, 0.35, 0.35, (bx1 + bx2) / 2, hingeBaseY + yOff, hingeZ, rssTubularMat, 0.5, -trussYaw, 0);
          this._makeBeam(this.rssGroup, 6.2, 0.35, 0.35, (bx1 + bx2) / 2, hingeBaseY + yOff, hingeZ, rssTubularMat, -0.5, -trussYaw, 0);
        }
      }

      // ── 3. Payload Changeout Room (PCR) ──
      // Multi-story cleanroom body: width 15m (X), height 28m (Y), depth 20m (Z)
      const pcrW = 15.0, pcrH = 28.0, pcrD = 20.0;
      const pcrY = hingeBaseY + 3.0 + pcrH / 2; // base at 22.8, top at 50.8
      const pcrBody = new THREE.Mesh(
        new THREE.BoxGeometry(pcrW, pcrH, pcrD),
        corrugatedMat
      );
      pcrBody.position.set(pcrOriginX, pcrY, pcrOriginZ);
      pcrBody.castShadow = true;
      pcrBody.receiveShadow = true;
      this.rssGroup.add(pcrBody);

      // Vertical corrugated ribs / stiffener columns on PCR exterior
      for (let gx = -pcrW / 2 + 1; gx <= pcrW / 2 - 1; gx += 2.2) {
        this._makeBeam(this.rssGroup, 0.32, pcrH + 0.4, 0.45, pcrOriginX + gx, pcrY, pcrOriginZ + pcrD / 2 + 0.2, rssDarkMat);
        this._makeBeam(this.rssGroup, 0.32, pcrH + 0.4, 0.45, pcrOriginX + gx, pcrY, pcrOriginZ - pcrD / 2 - 0.2, rssDarkMat);
      }
      for (let gz = -pcrD / 2 + 1; gz <= pcrD / 2 - 1; gz += 2.4) {
        this._makeBeam(this.rssGroup, 0.45, pcrH + 0.4, 0.32, pcrOriginX + pcrW / 2 + 0.2, pcrY, pcrOriginZ + gz, rssDarkMat);
      }

      // Weather seal bellows facing the orbiter cargo bay (-X face)
      const sealMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, pcrH * 0.75, pcrD * 0.7),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9, metalness: 0.1 })
      );
      sealMesh.position.set(pcrOriginX - pcrW / 2 - 0.4, pcrY - 2.0, pcrOriginZ);
      this.rssGroup.add(sealMesh);

      // ── 4. Exterior Access Galleries & Catwalks with Yellow Railings ──
      [hingeBaseY + 9, hingeBaseY + 18, hingeBaseY + 27].forEach((platY) => {
        // Catwalk floors wrapping around North & East faces
        const catN = new THREE.Mesh(new THREE.BoxGeometry(pcrW + 2.4, 0.25, 2.0), rssDarkMat);
        catN.position.set(pcrOriginX, platY, pcrOriginZ + pcrD / 2 + 1.0);
        this.rssGroup.add(catN);

        const catE = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, pcrD + 2.4), rssDarkMat);
        catE.position.set(pcrOriginX + pcrW / 2 + 1.0, platY, pcrOriginZ);
        this.rssGroup.add(catE);

        // Yellow safety handrails
        this._makeBeam(this.rssGroup, pcrW + 2.4, 0.1, 0.1, pcrOriginX, platY + 1.15, pcrOriginZ + pcrD / 2 + 2.0, rssYellowMat);
        this._makeBeam(this.rssGroup, 0.1, 0.1, pcrD + 2.4, pcrOriginX + pcrW / 2 + 2.0, platY + 1.15, pcrOriginZ, rssYellowMat);
        // Rail stanchions
        for (let rx = -pcrW / 2; rx <= pcrW / 2; rx += 2.8) {
          this._makeBeam(this.rssGroup, 0.08, 1.2, 0.08, pcrOriginX + rx, platY + 0.6, pcrOriginZ + pcrD / 2 + 2.0, rssYellowMat);
        }
      });

      // ── 5. OMPS Hypergolic Propellant Tanks & Domes on Roof ──
      // Two prominent hemispherical dome-capped cylindrical tanks on PCR roof (World Y = 50.8)
      const roofY = pcrY + pcrH / 2; // Y = 50.8
      [
        { x: pcrOriginX - 3.2, z: pcrOriginZ - 2.5 },
        { x: pcrOriginX + 3.2, z: pcrOriginZ - 2.5 }
      ].forEach((tankPos) => {
        // Cylindrical tank body
        const tankCyl = new THREE.Mesh(
          new THREE.CylinderGeometry(2.1, 2.1, 4.8, 24),
          domeMat
        );
        tankCyl.position.set(tankPos.x, roofY + 2.4, tankPos.z);
        tankCyl.castShadow = true;
        this.rssGroup.add(tankCyl);

        // Smooth hemispherical dome top
        const domeTop = new THREE.Mesh(
          new THREE.SphereGeometry(2.1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2),
          domeMat
        );
        domeTop.position.set(tankPos.x, roofY + 4.8, tankPos.z);
        domeTop.castShadow = true;
        this.rssGroup.add(domeTop);

        // Small top vent cap
        const ventCap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.35, 0.6, 12),
          rssDarkMat
        );
        ventCap.position.set(tankPos.x, roofY + 7.1, tankPos.z);
        this.rssGroup.add(ventCap);
      });

      // Roof perimeter safety railing
      this._makeBeam(this.rssGroup, pcrW, 0.1, 0.1, pcrOriginX, roofY + 1.15, pcrOriginZ + pcrD / 2, rssYellowMat);
      this._makeBeam(this.rssGroup, pcrW, 0.1, 0.1, pcrOriginX, roofY + 1.15, pcrOriginZ - pcrD / 2, rssYellowMat);
      this._makeBeam(this.rssGroup, 0.1, 0.1, pcrD, pcrOriginX + pcrW / 2, roofY + 1.15, pcrOriginZ, rssYellowMat);
      this._makeBeam(this.rssGroup, 0.1, 0.1, pcrD, pcrOriginX - pcrW / 2, roofY + 1.15, pcrOriginZ, rssYellowMat);

      // ── 6. Circular Ground Track & Mechanical Drive Trucks ──
      // Curved rail on pad hardstand following swing arc
      const railRadius = 24.0;
      const railGeo = new THREE.RingGeometry(railRadius - 0.4, railRadius + 0.4, 32, 1, Math.PI * 0.15, Math.PI * 0.45);
      railGeo.rotateX(-Math.PI / 2);
      const railMesh = new THREE.Mesh(railGeo, rssDarkMat);
      railMesh.position.set(hingeX, hingeBaseY + 0.12, hingeZ);
      this.rssGroup.add(railMesh);

      // 4 heavy drive trucks at base of PCR
      [
        { x: pcrOriginX - 5.5, z: pcrOriginZ - 7.5 },
        { x: pcrOriginX + 5.5, z: pcrOriginZ - 7.5 },
        { x: pcrOriginX - 5.5, z: pcrOriginZ + 7.5 },
        { x: pcrOriginX + 5.5, z: pcrOriginZ + 7.5 }
      ].forEach((tp) => {
        const truck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 2.2), rssDarkMat);
        truck.position.set(tp.x, hingeBaseY + 1.1, tp.z);
        this.rssGroup.add(truck);
        // Steel wheels
        [-1.1, 1.1].forEach((wx) => {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 14), rssSteelMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(tp.x + wx, hingeBaseY + 0.55, tp.z);
          this.rssGroup.add(wheel);
        });
        // Hydraulic leveling jack
        const jack = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.6, 12), rssTubularMat);
        jack.position.set(tp.x, hingeBaseY + 2.2, tp.z);
        this.rssGroup.add(jack);
      });

      // ── 7. High-Intensity Floodlight Banks Facing the Shuttle Stack ──
      const floodMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffedd5,
        emissiveIntensity: 2.2
      });
      [hingeBaseY + 16, hingeBaseY + 28, hingeBaseY + 40].forEach((ly) => {
        const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 3.2), rssDarkMat);
        fixture.position.set(pcrOriginX - pcrW / 2 - 0.25, ly, pcrOriginZ);
        this.rssGroup.add(fixture);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 2.9), floodMat);
        bulb.position.set(pcrOriginX - pcrW / 2 - 0.46, ly, pcrOriginZ);
        this.rssGroup.add(bulb);
      });
    }

    // ============================================================================
    // 4. WATER DELUGE SOUND SUPPRESSION SYSTEM
    // ============================================================================
    _buildWaterDelugeSystem() {
      const THREE = window.THREE;

      // Active water deluge spray under the vehicle launch mount (no giant sphere blocking view)
      const waterSprayMat = new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.0,
        roughness: 0.1
      });
      this.delugeWaterMesh = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 12, 16), waterSprayMat);
      this.delugeWaterMesh.position.set(0, 14, 0);
      this.padGroup.add(this.delugeWaterMesh);

      const steamMat = new THREE.MeshBasicMaterial({
        color: 0xf8fafc,
        transparent: true,
        opacity: 0.0
      });
      this.steamPlumes = [];
      for (let i = 0; i < 6; i++) {
        const steam = new THREE.Mesh(new THREE.SphereGeometry(6 + i * 1.5, 12, 12), steamMat.clone());
        steam.position.set((Math.random() - 0.5) * 16, 8 + i * 4, (Math.random() - 0.5) * 40);
        this.padGroup.add(steam);
        this.steamPlumes.push(steam);
      }
    }

    // ============================================================================
    // 5. LAUNCH VEHICLE STACK ON THE PAD
    // ============================================================================
    _buildLaunchStack() {
      const THREE = window.THREE;
      this.stackGroup = new THREE.Group();
      this.stackGroup.name = "LaunchVehicleStack_OnPad";
      this.stackGroup.position.set(0, 20.2, 0);
      this.padGroup.add(this.stackGroup);

      // The stack core is rotated so model +Z becomes world +Y.  Its origin is
      // placed at y=44 so the tank base sits on the MLP instead of floating
      // nine metres above it.
      this.stackCore = new THREE.Group();
      this.stackCore.rotation.x = -Math.PI / 2;
      this.stackCore.position.set(0, 23.8, 0);
      this.stackGroup.add(this.stackCore);

      // Launch mount / hold-down base under the tank.
      const mountBase = new THREE.Mesh(
        new THREE.BoxGeometry(18, 1.2, 18),
        new THREE.MeshStandardMaterial({ color: 0x414c56, roughness: 0.72, metalness: 0.45 })
      );
      mountBase.rotation.x = Math.PI / 2;
      mountBase.position.set(0, 0, -23.2);
      this.stackCore.add(mountBase);

      const tankGeo = new THREE.CylinderGeometry(4.2, 4.2, 47.0, 32);
      tankGeo.rotateX(Math.PI / 2);
      this.tankMesh = new THREE.Mesh(
        tankGeo,
        new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7, metalness: 0.08 })
      );
      this.tankMesh.position.set(0, 0, 0);
      this.stackCore.add(this.tankMesh);

      const orbGeo = new THREE.ConeGeometry(3.6, 37.0, 16);
      orbGeo.rotateX(Math.PI / 2);
      this.orbiterMesh = new THREE.Mesh(
        orbGeo,
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 })
      );
      this.orbiterMesh.position.set(0, 5.25, 5.0);
      this.stackCore.add(this.orbiterMesh);

      const srbGeo = new THREE.CylinderGeometry(1.8, 1.8, 45.0, 24);
      srbGeo.rotateX(Math.PI / 2);
      const srbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
      this.srbLeft = new THREE.Mesh(srbGeo, srbMat);
      this.srbLeft.position.set(7.6, 0, -1.5);
      this.srbRight = new THREE.Mesh(srbGeo, srbMat);
      this.srbRight.position.set(-7.6, 0, -1.5);
      this.srbRight.rotation.set(0, 0, Math.PI);
      this.stackCore.add(this.srbLeft, this.srbRight);

      // Intertank / booster attach struts.
      const strutMat = new THREE.MeshStandardMaterial({ color: 0x8d99a3, roughness: 0.5, metalness: 0.6 });
      [-9.5, 9.5].forEach((z) => {
        this._makeBeam(this.stackCore, 3.8, 0.34, 0.34, 6.0, 0, z, strutMat);
        this._makeBeam(this.stackCore, 3.8, 0.34, 0.34, -6.0, 0, z, strutMat);
      });
      [2.0, 9.0].forEach((z) => {
        this._makeBeam(this.stackCore, 0.34, 3.2, 0.34, 0, 4.0, z, strutMat);
      });

      if (window.glbManager) {
        window.glbManager.loadGLB("assets/ExternalTank.glb").then(() => {
          try {
            const realTank = window.glbManager.instantiateModel("assets/ExternalTank.glb", { scale: 1.0 });
            if (realTank && this.stackCore) {
              this.stackCore.remove(this.tankMesh);
              this.tankMesh = realTank;
              this.tankMesh.position.set(0, 0, 0);
              this.stackCore.add(this.tankMesh);
            }
          } catch (e) {}
        }).catch(() => {});

        window.glbManager.loadGLB("assets/Orbiter_V2.glb").then(() => {
          try {
            const realOrbiter = window.glbManager.instantiateModel("assets/Orbiter_V2.glb", { scale: 1.0 });
            if (realOrbiter && this.stackCore) {
              this.stackCore.remove(this.orbiterMesh);
              this.orbiterMesh = realOrbiter;
              this.orbiterMesh.position.set(0, 5.25, 5.0);
              this.stackCore.add(this.orbiterMesh);
            }
          } catch (e) {}
        }).catch(() => {});

        window.glbManager.loadGLB("assets/SolidRocketBooster.glb").then(() => {
          try {
            const realSrbL = window.glbManager.instantiateModel("assets/SolidRocketBooster.glb", { scale: 1.0 });
            const realSrbR = window.glbManager.instantiateModel("assets/SolidRocketBooster.glb", { scale: 1.0 });
            if (realSrbL && realSrbR && this.stackCore) {
              this.stackCore.remove(this.srbLeft);
              this.stackCore.remove(this.srbRight);
              this.srbLeft = realSrbL;
              this.srbRight = realSrbR;
              this.srbLeft.position.set(7.6, 0, 0);
              this.srbRight.position.set(-7.6, 0, 0);
              this.srbRight.rotation.set(0, 0, Math.PI);
              this.stackCore.add(this.srbLeft, this.srbRight);
            }
          } catch (e) {}
        }).catch(() => {});
      }

      this._buildIgnitionEffects();
    }

    _buildIgnitionEffects() {
      const THREE = window.THREE;
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xffedd5, transparent: true, opacity: 0.9 });
      const plumeGeo = new THREE.CylinderGeometry(0.8, 4.0, 26.0, 16);
      plumeGeo.rotateX(Math.PI / 2);

      [7.6, -7.6].forEach((x) => {
        const plume = new THREE.Mesh(plumeGeo, flameMat);
        plume.position.set(x, 0, -38.0);
        plume.visible = false;
        this.stackCore.add(plume);
        this.flamePlumes.push(plume);
      });

      const ssmeMat = new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 });
      const ssmeGeo = new THREE.CylinderGeometry(0.5, 2.5, 18.0, 12);
      ssmeGeo.rotateX(Math.PI / 2);

      [
        [0, 7.5, -33.0],
        [-1.4, 6.2, -33.0],
        [1.4, 6.2, -33.0]
      ].forEach(([px, py, pz]) => {
        const ssme = new THREE.Mesh(ssmeGeo, ssmeMat);
        ssme.position.set(px, py, pz);
        ssme.visible = false;
        this.stackCore.add(ssme);
        this.flamePlumes.push(ssme);
      });
    }

    // ============================================================================
    // 5b. GUIDED BOARDING OBJECTIVE MARKERS
    // ============================================================================
    _buildBoardingGuidance() {
      const THREE = window.THREE;
      if (!THREE || !this.towerGroup || !this.armPivotGroup) return;

      this.guidanceMarkers = this.guidanceMarkers || { arm: null, hatch: null };

      const armMarker = this._createGuidanceMarker("1 · BOARDING BRIDGE CONTROL", 0xfbbf24);
      armMarker.position.set(8.1, 44.42, -6.3);
      armMarker.userData.baseY = 44.42;
      this.towerGroup.add(armMarker);
      this.guidanceMarkers.arm = armMarker;

      const hatchMarker = this._createGuidanceMarker("2 · BOARD SPACESHIP", 0x67e8f9);
      hatchMarker.position.set(17.0, 0.48, 0);
      hatchMarker.userData.baseY = 0.48;
      this.armPivotGroup.add(hatchMarker);
      this.guidanceMarkers.hatch = hatchMarker;

      // VAB High Bay & LCC Firing Room interactive terminals for Site Tour exploration
      this.facilityTerminals = [];
      if (this.group) {
        const specs = [
          {
            id: "vab_mdl",
            x: -42,
            z: 652,
            y: 0.22,
            radius: 5.5,
            label: "E · ASSEMBLY HALL DESIGN DESK",
            shortAction: "OPEN ASSEMBLY DESK [E]",
            action: "bus",
            color: 0x38bdf8
          },
          {
            id: "lcc_ops",
            x: -203.0,
            z: 180.5,
            y: 0.3,
            radius: 3.2,
            label: "E · EARTH CONTROL OPS CONSOLE",
            shortAction: "OPEN CONTROL CONSOLE [E]",
            action: "lcc_console",
            color: 0x3b82f6
          },
          {
            id: "mcc_flight_director",
            x: -68,
            z: 240.5,
            y: 0.3,
            radius: 4.6,
            label: "E · MISSION LEADER CONSOLE",
            shortAction: "MISSION LEADER · GOALS [E]",
            action: "mission",
            color: 0xfbbf24
          },
          {
            id: "mcc_ground_systems",
            x: -52,
            z: 240.5,
            y: 0.3,
            radius: 4.6,
            label: "E · GROUND SUPPORT CONSOLE",
            shortAction: "GROUND SUPPORT · PATH & RADIO [E]",
            action: "orbit",
            color: 0x67e8f9
          },
          {
            id: "lcc_fd",
            x: -208.3,
            z: 181,
            y: 0.3,
            radius: 4.6,
            label: "E · CONTROL ROOM LEADER",
            shortAction: "CONTROL ROOM · GOALS [E]",
            action: "mission",
            color: 0xfbbf24
          },
          {
            id: "lcc_gs",
            x: -197.7,
            z: 181,
            y: 0.3,
            radius: 4.6,
            label: "E · CONTROL ROOM SUPPORT",
            shortAction: "CONTROL ROOM · PATH & RADIO [E]",
            action: "orbit",
            color: 0x67e8f9
          },
          {
            id: "lcc_viz",
            x: -160,
            z: 188,
            y: 0.3,
            radius: 5.0,
            label: "E · EARTH CONTROL 3D FLIGHT VIEW",
            shortAction: "OPEN 3D FLIGHT VIEW [E]",
            action: "viz",
            color: 0xa78bfa
          }
        ];
        specs.forEach((spec) => {
          const marker = this._createGuidanceMarker(spec.label, spec.color);
          const markerY = typeof spec.y === "number" ? spec.y : 0.08;
          marker.position.set(spec.x, markerY, spec.z);
          marker.userData.baseY = markerY;
          marker.visible = false;
          this.group.add(marker);
          this.facilityTerminals.push(Object.assign({}, spec, { marker }));
        });
      }
    }

    _isLocalGroundCrew() {
      const nm = window.netManager;
      if (!nm) return false;
      const roles = window.InterfellasRoles;
      const localRole = nm.localPlayer && nm.localPlayer.role;
      if (nm.localPlayer && nm.localPlayer.team === "ground") return true;
      if (roles && typeof roles.isGroundRole === "function" && roles.isGroundRole(localRole)) return true;
      if (nm.roomState && Array.isArray(nm.roomState.players) && nm.socketId) {
        const me = nm.roomState.players.find((p) => p && p.id === nm.socketId);
        if (me) {
          if (me.team === "ground") return true;
          if (roles && typeof roles.isGroundRole === "function" && roles.isGroundRole(me.role)) return true;
        }
      }
      return false;
    }

    _getNearbyFacilityTerminal() {
      if (!(this.siteTourActive || this._isLocalGroundCrew()) || !Array.isArray(this.facilityTerminals) || !this.facilityTerminals.length) return null;
      const crew = window.localCrew && window.localCrew.group;
      if (!crew || !crew.visible || !crew.position) return null;
      let best = null;
      let bestDist = Infinity;
      for (const term of this.facilityTerminals) {
        const d = Math.hypot(crew.position.x - term.x, crew.position.z - term.z);
        if (d <= term.radius && d < bestDist) {
          best = term;
          bestDist = d;
        }
      }
      return best;
    }

    _activateFacilityTerminal(term) {
      if (!term) return;
      if (window.spaceAudio) window.spaceAudio.playClick();
      if (term.action === "lcc_console") {
        this.openLccConsole(true);
        return;
      }
      if (term.action === "mission") {
        if (window.gameplay && typeof window.gameplay.openMissionPlannerFromGround === "function") {
          window.gameplay.openMissionPlannerFromGround();
        }
        return;
      }
      if (term.action === "cml") {
        if (window.gameplay && typeof window.gameplay.openCmlWorkbench === "function") {
          window.gameplay.openCmlWorkbench("checklist");
        }
        return;
      }
      if (term.action === "viz") {
        if (window.missionViz && typeof window.missionViz.open === "function") {
          window.missionViz.open();
        } else if (window.gameplay && typeof window.gameplay.openPreFlightMdlDesk === "function") {
          window.gameplay.openPreFlightMdlDesk("viz");
        }
      } else if (window.gameplay && typeof window.gameplay.openPreFlightMdlDesk === "function") {
        window.gameplay.openPreFlightMdlDesk(term.action || "bus");
      }
    }

    _createGuidanceMarker(labelText, colorHex) {
      const THREE = window.THREE;
      const group = new THREE.Group();

      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.055, 8, 44), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      group.add(ring);

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1.02, 36),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        })
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.04;
      group.add(disc);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.9, 3.6, 18, 1, true),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide
        })
      );
      beam.position.y = 1.8;
      group.add(beam);

      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 0),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      diamond.position.y = 2.6;
      group.add(diamond);

      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 640, 160);
      ctx.fillStyle = "rgba(6, 10, 16, 0.93)";
      ctx.strokeStyle = `#${colorHex.toString(16).padStart(6, "0")}`;
      ctx.lineWidth = 6;
      const x = 8, y = 18, w = 624, h = 124, r = 26;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f8fafc";
      ctx.font = "800 45px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, 320, 82);

      const texture = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          fog: false
        })
      );
      label.scale.set(1.9, 0.475, 1);
      label.position.y = 3.1;
      label.renderOrder = 30;
      group.add(label);

      group.visible = false;
      group.userData.ring = ring;
      group.userData.disc = disc;
      group.userData.beam = beam;
      group.userData.diamond = diamond;
      group.userData.label = label;
      group.userData.baseY = 0;
      return group;
    }

    _updateGuidanceMarkers(delta, elapsed) {
      const isGround = this._isLocalGroundCrew();
      const showGuidance = this.isGroundMode &&
        !isGround &&
        !this.siteTourActive &&
        !this.isLaunching &&
        this.missionPhase === "gantry" &&
        !this.crewBoarded;

      const armActive = showGuidance && !this.dockLocked;
      const hatchActive = showGuidance &&
        this.dockLocked &&
        Math.abs(this.dockSwingAngle) < 0.08;

      const animate = (marker, active) => {
        if (!marker) return;
        marker.visible = active;
        if (!active) return;
        const { ring, disc, beam, diamond, label, baseY } = marker.userData;
        const pulse = 1 + Math.sin(elapsed * 3.2) * 0.08;
        ring.scale.setScalar(pulse);
        disc.scale.setScalar(pulse);
        if (beam.material) beam.material.opacity = 0.11 + (Math.sin(elapsed * 2.4) + 1) * 0.035;
        if (diamond) {
          diamond.position.y = 2.6 + Math.sin(elapsed * 2.1) * 0.18;
          diamond.rotation.y += delta * 1.7;
        }
        if (label) label.position.y = 3.1 + Math.sin(elapsed * 1.6) * 0.08;
        if (baseY !== undefined) marker.position.y = baseY;
      };

      animate(this.guidanceMarkers.arm, armActive);
      animate(this.guidanceMarkers.hatch, hatchActive);

      if (Array.isArray(this.facilityTerminals)) {
        const showFacility = !!(this.isGroundMode && (this.siteTourActive || isGround));
        this.facilityTerminals.forEach((term) => {
          animate(term.marker, showFacility);
        });
      }
    }

    _buildPerimeterLighting() {
      const THREE = window.THREE;
      [
        [48, 34, 48],
        [-48, 34, 48],
        [48, 34, -48],
        [-48, 34, -48]
      ].forEach(([lx, topY, lz]) => {
        const baseY = 12.45;
        const poleH = topY - baseY;
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.56, poleH, 8),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.5 })
        );
        pole.position.set(lx, baseY + poleH * 0.5, lz);
        pole.castShadow = true;
        this.padGroup.add(pole);

        const headGrp = new THREE.Group();
        headGrp.position.set(lx, topY + 0.6, lz);
        headGrp.lookAt(0, 48, 0);
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(3.4, 0.28, 0.4),
          new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.6 })
        );
        headGrp.add(bar);
        [-1.0, 0, 1.0].forEach((ox) => {
          const lampHead = new THREE.Mesh(
            new THREE.BoxGeometry(0.85, 0.65, 0.7),
            new THREE.MeshStandardMaterial({
              color: 0xfff3c4,
              emissive: 0xffe9a8,
              emissiveIntensity: 0.9,
              roughness: 0.3,
              metalness: 0.35
            })
          );
          lampHead.position.set(ox, 0.42, 0.22);
          headGrp.add(lampHead);
        });
        this.padGroup.add(headGrp);

        if (!window.isMobileDevice) {
          const light = new THREE.SpotLight(0xfffbeb, 0.55, 165, Math.PI / 4, 0.55);
          light.position.set(lx, topY, lz);
          light.target.position.set(0, 48, 0);
          this.padGroup.add(light);
          this.padGroup.add(light.target);
          this.floodlights.push(light);
        }
      });
    }

    // ============================================================================
    // 6. GROUND-LEVEL SITE TOUR (Space Center 2 web port)
    // ============================================================================
    _siteTourSpawn(index) {
      const spawns = (window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || [];
      return spawns[((index % spawns.length) + spawns.length) % spawns.length] || { x: 18, z: 150, yaw: Math.PI, label: "Launch Pad" };
    }

    enterSiteTour(index = 0) {
      const isGround = this._isLocalGroundCrew();
      if (!this.isGroundMode || (!isGround && (this.crewBoarded || this.isLaunching))) {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast(this.crewBoarded ? "CREW ALREADY ABOARD · RETURN TO LAUNCH TOWER BEFORE TOURING" : "SITE TOUR UNAVAILABLE DURING LAUNCH");
        }
        return false;
      }
      if (!this.site) return false;
      this.siteTourActive = true;
      this._syncSpaceGamesLock();
      this.teleportSiteTour(index);
      if (window.spaceAudio) window.spaceAudio.playAirlockCycle();
      this._renderGroundHUD();
      return true;
    }

    exitSiteTour() {
      if (this.openCar) this.openCar.forceExit();
      this.siteTourActive = false;
      this._syncSpaceGamesLock();
      const isGround = this._isLocalGroundCrew();
      const spawn = isGround
        ? this._groundLccSpawnForIndex(this._localGroundIndex())
        : this._groundSpawnForIndex(this._localPlayerIndex());
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = isGround ? true : !this.crewBoarded;
        window.localCrew.group.position.set(spawn.x, spawn.y, spawn.z);
        window.localCrew.group.rotation.y = spawn.yaw;
      }
      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(spawn.yaw, isGround ? 0.03 : -0.05);
      }
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast(isGround
          ? "RETURNED TO EARTH CONTROL ROOM · CONSOLE [C]"
          : "RETURNED TO THE LAUNCH TOWER · BOARD THE SPACESHIP WHEN READY");
      }
      this._renderGroundHUD();
    }

    toggleSiteTour() {
      if (this.siteTourActive) {
        this.exitSiteTour();
      } else {
        this.enterSiteTour(this.siteTourIndex || 0);
      }
    }

    teleportSiteTour(index) {
      this._ensureGroundBuilt();
      // Fast travel must not leave the astronaut logically driver-seated far
      // away while the body teleports to another sector.
      if (this.openCar) this.openCar.forceExit();
      const spawns = (window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || [];
      const spawn = this._siteTourSpawn(index);
      const count = spawns.length || 6;
      this.siteTourIndex = ((index % count) + count) % count;
      const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
      const spawnY = terrain ? terrain.getSurfaceHeightAt(spawn.x, spawn.z, 0.2) : 0.2;
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = true;
        window.localCrew.group.position.set(spawn.x, spawnY, spawn.z);
        window.localCrew.group.rotation.y = spawn.yaw;
      }
      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(spawn.yaw, typeof spawn.pitch === "number" ? spawn.pitch : 0.04);
      }
      this._updateSunShadowFocus({ x: spawn.x, z: spawn.z });
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast(`SITE TOUR · ${spawn.label.toUpperCase()} · [1-${count}] FAST TRAVEL · [T] ${this._isLocalGroundCrew() ? "CONTROL ROOM" : "LAUNCH TOWER"}`);
      }
      this._renderGroundHUD();
    }

    _getSiteTourElevation(x, z) {
      // 1. Mobile Launcher Platform (MLP) deck
      if (x >= -24.5 && x <= 24.5 && z >= -20.5 && z <= 20.5) {
        return 19.8;
      }
      // 2. South Access Stairway to MLP (x in [-15.5, -8.5], z in [20.5, 32.0])
      if (x >= -15.5 && x <= -8.5 && z >= 20.5 && z <= 32.0) {
        const t = Math.max(0, Math.min(1, (32.0 - z) / (32.0 - 20.5)));
        return 12.5 + t * 7.3;
      }
      // 3. Pad 39A elevated hardstand octagonal surface (including ground elevator at x=-42.2, z=-4.0)
      if (z >= -45.0 && z <= 61.0 && x >= -65.0 && x <= 55.0) {
        return 12.5;
      }
      // 4. Crawlerway approach ramp from south apron (z=186, y=0.2) to Pad top (z=61, y=12.5)
      if (z > 61.0 && z <= 186.0 && Math.abs(x) <= 18.0) {
        const t = Math.max(0, Math.min(1, (186.0 - z) / (186.0 - 61.0)));
        return 0.2 + t * 12.3;
      }
      // 5. Default ground level everywhere else
      return 0.2;
    }

    _resolveSiteTourCollision(currentPos, proposedPos) {
      const THREE = window.THREE;
      const radius = 0.45;
      const bounds = (window.SpaceCenterModules && window.SpaceCenterModules.constants.SITE_BOUNDS) || {
        minX: -1050,
        maxX: 492,
        minZ: -850,
        maxZ: 850
      };
      const boxes = (this.site && this.site.boxColliders) || [];
      const circles = (this.site && this.site.circleColliders) || [];
      const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;

      if (terrain && typeof terrain.resolveMovement === "function") {
        const res = terrain.resolveMovement(
          currentPos.x,
          currentPos.z,
          proposedPos.x,
          proposedPos.z,
          radius,
          currentPos.y,
          boxes,
          circles,
          bounds
        );
        return new THREE.Vector3(res.x, res.y, res.z);
      }

      let nx = Math.max(bounds.minX, Math.min(bounds.maxX, proposedPos.x));
      let nz = Math.max(bounds.minZ, Math.min(bounds.maxZ, proposedPos.z));
      const blocked = (x, z) => {
        for (const box of boxes) {
          if (box.disabled) continue;
          if (box.rotated) {
            const dx = x - box.cx;
            const dz = z - box.cz;
            const lx = dx * box.cos - dz * box.sin;
            const lz = dx * box.sin + dz * box.cos;
            if (Math.abs(lx) < box.halfW + radius && Math.abs(lz) < box.halfD + radius) {
              return true;
            }
            continue;
          }
          if (
            x > box.minX - radius &&
            x < box.maxX + radius &&
            z > box.minZ - radius &&
            z < box.maxZ + radius
          ) {
            return true;
          }
        }
        for (const circle of circles) {
          if (Math.hypot(x - circle.x, z - circle.z) < circle.r + radius) return true;
        }
        return false;
      };

      if (blocked(nx, nz)) {
        if (!blocked(nx, currentPos.z)) {
          nz = currentPos.z;
        } else if (!blocked(currentPos.x, nz)) {
          nx = currentPos.x;
        } else {
          nx = currentPos.x;
          nz = currentPos.z;
        }
      }

      const targetY = this._getSiteTourElevation(nx, nz);
      return new THREE.Vector3(nx, targetY, nz);
    }

    // ============================================================================
    // 7. SPACE CENTER WALKABLE GANTRY & BOARDING BRIDGE COLLISION
    // ============================================================================
    resolveGroundCollision(currentPos, proposedPos) {
      const THREE = window.THREE;
      if (this.siteTourActive || this._isLocalGroundCrew()) {
        return this._resolveSiteTourCollision(currentPos, proposedPos);
      }

      // If riding the elevator while in transit, lock position inside the moving cabin
      if (this.elevatorMoving && this.elevatorRidingPlayer) {
        return new THREE.Vector3(-42.2, 19.8 + this.elevatorY, -4.0);
      }

      const py = currentPos.y;
      const nx = proposedPos.x;
      const nz = proposedPos.z;
      const px = currentPos.x;
      const pz = currentPos.z;

      // ── LEVEL 1: PAD GROUND & MLP LEVEL (py < 35m) ──
      if (py < 35.0) {
        // A. On MLP deck (if entered from top of stairway or already on deck)
        if (nx >= -24.5 && nx <= 24.5 && nz >= -20.5 && nz <= 20.5 && py > 16.0) {
          return new THREE.Vector3(nx, 19.8, nz);
        }
        // B. On the South Access Stairway
        if (nx >= -15.5 && nx <= -8.5 && nz >= 20.5 && nz <= 32.0) {
          const t = Math.max(0, Math.min(1, (32.0 - nz) / (32.0 - 20.5)));
          return new THREE.Vector3(nx, 12.5 + t * 7.3, nz);
        }
        // C. Pad 39A Hardstand ground surface (including elevator base at x=-42.2, z=-4.0)
        const clampedX = Math.max(-65.0, Math.min(55.0, nx));
        const clampedZ = Math.max(-45.0, Math.min(61.0, nz));
        return new THREE.Vector3(clampedX, 12.5, clampedZ);
      }

      // ── LEVEL 3: TOWER TOP OBSERVATION DECK (py >= 85m) ──
      if (py >= 85.0) {
        const topY = 108.1;
        const inTopDeck = nx >= -39.8 && nx <= -28.2 && nz >= -5.8 && nz <= 5.8;
        const inTopBridge = nx >= -43.6 && nx <= -39.8 && nz >= -5.8 && nz <= -2.2;
        if (inTopDeck || inTopBridge) {
          return new THREE.Vector3(nx, topY, nz);
        }
        if (nz >= -5.8 && nz <= -2.2) {
          const cx = Math.max(-43.6, Math.min(-28.2, nx));
          const cz = Math.max(-5.8, Math.min(-2.2, nz));
          return new THREE.Vector3(cx, topY, cz);
        }
        const cx = Math.max(-39.8, Math.min(-28.2, nx));
        const cz = Math.max(-5.8, Math.min(5.8, nz));
        return new THREE.Vector3(cx, topY, cz);
      }

      // ── LEVEL 2: GANTRY LEVEL (35m <= py < 85m) ──
      const y = 64.1;
      // Walkable Zone 1: Tower Gantry Staging Deck
      const inGantry = nx >= -40.2 && nx <= -24.8 && nz >= -12.7 && nz <= 4.7;
      // Walkable Zone 2: Elevator bridge & cabin west of gantry deck
      const inElevBridge = nx >= -43.6 && nx <= -40.0 && nz >= -5.8 && nz <= -2.2;
      // Walkable Zone 3: Boarding Bridge / White Room when Dock is Extended
      const inBridge = this.dockLocked && nx >= -25.5 && nx <= -3.6 && nz >= -8.8 && nz <= -5.6;

      // Already standing on the access arm: clamp both axes to the bridge corridor
      const wasOnBridge = this.dockLocked &&
        px >= -25.5 && px <= -3.6 && pz >= -8.8 && pz <= -5.6;
      if (wasOnBridge) {
        const armX = Math.max(-25.5, Math.min(-3.6, nx));
        const armZ = Math.max(-8.8, Math.min(-5.6, nz));
        return new THREE.Vector3(armX, y, armZ);
      }

      if (inGantry || inElevBridge || inBridge) {
        // Boarding is a deliberate [E]/[B] action at the hatch. Walking the
        // bridge must stay reversible so the crew can inspect the ship or walk
        // back to the tower without being trapped or force-boarded.
        return new THREE.Vector3(nx, y, nz);
      }

      // Clamping: if heading into or inside elevator bridge corridor
      if (nz >= -5.8 && nz <= -2.2) {
        const clampedX = Math.max(-43.6, Math.min(-24.8, nx));
        const clampedZ = Math.max(-5.8, Math.min(-2.2, nz));
        return new THREE.Vector3(clampedX, y, clampedZ);
      }

      const clampedX = Math.max(-40.2, Math.min(-24.8, nx));
      const clampedZ = Math.max(-12.7, Math.min(4.7, nz));
      return new THREE.Vector3(clampedX, y, clampedZ);
    }

    // ============================================================================
    // 7. PLAYER-CONTROLLED BOARDING DOCK, INGRESS & LAUNCH SEQUENCE UI
    // ============================================================================
    _setupGroundUI() {
      const existing = document.getElementById("space-center-ground-hud");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      const existingLcc = document.getElementById("ground-lcc-console");
      if (existingLcc && existingLcc.parentNode) existingLcc.parentNode.removeChild(existingLcc);

      this.hudOverlay = document.createElement("div");
      this.hudOverlay.id = "space-center-ground-hud";
      this.hudOverlay.style.display = "none";
      document.body.appendChild(this.hudOverlay);

      this.lccConsoleOverlay = document.createElement("div");
      this.lccConsoleOverlay.id = "ground-lcc-console";
      this.lccConsoleOverlay.style.display = "none";
      document.body.appendChild(this.lccConsoleOverlay);

      this._renderGroundHUD();

      if (!this._groundKeyBound) {
        this._groundKeyBound = true;
        window.addEventListener("keydown", (e) => {
          if (!window.isGameStarted || !this.isGroundMode) return;
          if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
          if (window.gameplay && window.gameplay.activeTask) return;
          // Alternate inspection scenes own the keyboard while they are open.
          if (window.missionViz && window.missionViz.isActive) return;
          if (window.solarSystem && window.solarSystem.isActive) return;
          if (window.issShowcase && window.issShowcase.isActive) return;
          if (window.vrManager && window.vrManager.isAnyVRActive) return;
          if (window.launchCutscene && window.launchCutscene.isPlaying) return;
          const briefingEl = document.getElementById("mission-briefing-overlay");
          if (briefingEl && briefingEl.style.display === "flex") return;

          const isGround = this._isLocalGroundCrew();

          if (e.code === "Escape" && this.lccConsoleOpen) {
            e.preventDefault();
            this.openLccConsole(false);
            return;
          }

          if (e.code === "KeyC" && isGround) {
            e.preventDefault();
            this.toggleLccConsole();
            return;
          }

          if (this.siteTourActive || isGround) {
            const tourCount = Math.max(6, ((window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || []).length);
            const tourCodes = Array.from({ length: tourCount }, (_, i) => `Digit${i + 1}`);
            const tourIndex = tourCodes.indexOf(e.code);
            const pos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
            const isNearPad = pos && Math.abs(pos.x) < 70 && Math.abs(pos.z) < 90;

            // When at Pad 39A, [3], [T], or [G] take you up to the Tower Top Deck or Gantry!
            if (e.code === "Digit3" || e.code === "Numpad3" || (isNearPad && e.code === "KeyT")) {
              e.preventDefault();
              this._handleElevatorKey(3);
              return;
            }
            if ((e.code === "Digit2" || e.code === "Numpad2") && isNearPad) {
              e.preventDefault();
              this._handleElevatorKey(2);
              return;
            }
            if ((e.code === "Digit1" || e.code === "Numpad1") && isNearPad && pos && pos.y > 25.0) {
              e.preventDefault();
              this._handleElevatorKey(1);
              return;
            }

            if (tourIndex !== -1) {
              e.preventDefault();
              this.teleportSiteTour(tourIndex);
              return;
            }
            if (e.code === "KeyT") {
              e.preventDefault();
              this.exitSiteTour();
              return;
            }
            if (e.code === "KeyG") {
              e.preventDefault();
              this._handleElevatorKey(3);
              return;
            }
            if (e.code === "KeyE") {
              if (this.lccDoors && this._isNearLccDoor()) {
                e.preventDefault();
                this.toggleLccDoors();
                return;
              }
              const elevX = -34 + (this._elevatorConfig ? this._elevatorConfig.x : -8.2);
              const elevZ = (this._elevatorConfig ? this._elevatorConfig.z : -4.0);
              if (pos && Math.hypot(pos.x - elevX, pos.z - elevZ) < 24.0) {
                e.preventDefault();
                this._handleElevatorKey(3);
                return;
              }
              const nearTerm = this._getNearbyFacilityTerminal();
              if (nearTerm) {
                e.preventDefault();
                this._activateFacilityTerminal(nearTerm);
                return;
              }
            }
            if (this.siteTourActive || isGround) return;
          }

          if (e.code === "Digit1" || e.code === "Numpad1") {
            const elevX = -34 + (this._elevatorConfig ? this._elevatorConfig.x : -8.2);
            const elevZ = (this._elevatorConfig ? this._elevatorConfig.z : -4.0);
            const pos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
            if (pos && (Math.hypot(pos.x - elevX, pos.z - elevZ) < 32.0 || this.elevatorMoving || pos.y > 25.0)) {
              e.preventDefault();
              this._handleElevatorKey(1);
              return;
            }
          }

          if (e.code === "Digit2" || e.code === "Numpad2") {
            const elevX = -34 + (this._elevatorConfig ? this._elevatorConfig.x : -8.2);
            const elevZ = (this._elevatorConfig ? this._elevatorConfig.z : -4.0);
            const pos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
            if (pos && (Math.hypot(pos.x - elevX, pos.z - elevZ) < 32.0 || this.elevatorMoving || pos.y < 35.0 || pos.y > 85.0)) {
              e.preventDefault();
              this._handleElevatorKey(2);
              return;
            }
          }

          if (e.code === "Digit3" || e.code === "Numpad3") {
            const elevX = -34 + (this._elevatorConfig ? this._elevatorConfig.x : -8.2);
            const elevZ = (this._elevatorConfig ? this._elevatorConfig.z : -4.0);
            const pos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
            if (pos && (Math.hypot(pos.x - elevX, pos.z - elevZ) < 32.0 || this.elevatorMoving || pos.y < 85.0)) {
              e.preventDefault();
              this._handleElevatorKey(3);
              return;
            }
          }

          if (e.code === "KeyL" && this._canLaunchNow()) {
            e.preventDefault();
            this.startLaunchCountdown();
            return;
          }

          if (e.code === "KeyF" && !this.dockLocked && !this.crewBoarded && this.missionPhase === "gantry") {
            const distArm = this._distanceToGuidancePoint(-25.9, -6.3);
            const myRole = window.InterfellasRoles && window.netManager && window.netManager.localPlayer
              ? window.InterfellasRoles.normalizeRole(window.netManager.localPlayer.role, "commander")
              : "commander";
            if ((distArm !== null && distArm <= 4.0) || myRole === "engineer" || (window.netManager && window.netManager.isHost)) {
              e.preventDefault();
              this.toggleBoardingDock(true);
              return;
            }
          }

          if ((e.code === "KeyE" || e.code === "KeyB") && this.crewBoarded && this.missionPhase === "gantry" && !this.isLaunching) {
            e.preventDefault();
            this.unboardSpacecraft();
            return;
          }

          if ((e.code === "KeyE" || e.code === "KeyB") && this.dockLocked && !this.crewBoarded && this.missionPhase === "gantry") {
            const distHatch = this._distanceToGuidancePoint(-7.8, -7.2);
            if (distHatch !== null && distHatch <= 2.6) {
              e.preventDefault();
              this.boardSpacecraft();
              return;
            }
          }

          if (e.code === "KeyG") {
            e.preventDefault();
            const pos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
            if (pos && pos.y < 35.0) {
              this._handleElevatorKey(3);
            } else {
              this._handleElevatorKey();
            }
            return;
          }

          if (e.code === "KeyT" && !this.siteTourActive) {
            e.preventDefault();
            const pos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
            if (pos && pos.y >= 85.0) {
              this._handleElevatorKey(2);
            } else {
              this._handleElevatorKey(3);
            }
            return;
          }

          if (e.code === "KeyE") {
            if (this.lccDoors && this._isNearLccDoor()) {
              e.preventDefault();
              this.toggleLccDoors();
              return;
            }
            const elevX = -34 + (this._elevatorConfig ? this._elevatorConfig.x : -8.2);
            const elevZ = (this._elevatorConfig ? this._elevatorConfig.z : -4.0);
            const pos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
            if (pos && Math.hypot(pos.x - elevX, pos.z - elevZ) < 14.0) {
              e.preventDefault();
              this._handleElevatorKey();
              return;
            }
          }

          if (e.code === "KeyM") {
            e.preventDefault();
            if (window.gameplay && typeof window.gameplay.openMissionPlannerFromGround === "function") {
              window.gameplay.openMissionPlannerFromGround();
            }
          }
        });
      }
    }

    _canLaunchNow(crewState) {
      if (!this.isGroundMode || this.siteTourActive || this._isLocalGroundCrew() || this.isLaunching || this._launchSequenceStarted) {
        return false;
      }
      if (this.missionPhase !== "gantry") return false;
      const state = crewState || this._crewAboardState();
      return !!(this.crewBoarded || (state && state.aboardCount > 0));
    }

    _localGroundIndex() {
      const nm = window.netManager;
      const players = nm && nm.roomState && Array.isArray(nm.roomState.players) ? nm.roomState.players : [];
      const roles = window.InterfellasRoles;
      const groundPlayers = players.filter((p) => p && (p.team === "ground" || (roles && roles.isGroundRole(p.role))));
      if (!groundPlayers.length || !nm || !nm.socketId) return 0;
      const idx = groundPlayers.findIndex((p) => p.id === nm.socketId);
      return idx >= 0 ? idx : 0;
    }

    _groundLccSpawnForIndex(index = 0) {
      const spots = [
        { x: -204.5, y: 0.25, z: 185.5, yaw: 0 },
        { x: -201.5, y: 0.25, z: 185.5, yaw: 0 }
      ];
      return spots[((index % spots.length) + spots.length) % spots.length];
    }

    _crewAboardState() {
      const room = window.netManager && window.netManager.roomState;
      const players = room && Array.isArray(room.players) ? room.players : [];
      const mission = window.netManager && typeof window.netManager.getMission === "function"
        ? window.netManager.getMission()
        : null;
      const boardedIds = mission && Array.isArray(mission.boarded) ? mission.boarded : [];
      const mySocketId = window.netManager ? window.netManager.socketId : null;
      const roles = window.InterfellasRoles;
      const normalizeRole = roles
        ? roles.normalizeRole
        : ((r, f) => String(r || f || "commander").toLowerCase());
      const isGroundRoleFn = roles
        ? roles.isGroundRole
        : ((r) => r === "flight_director" || r === "ground_capcom");
      const getMeta = roles
        ? roles.getRoleMeta
        : ((r) => ({ short: String(r || "CMD").slice(0, 3).toUpperCase(), color: "#93c5fd" }));

      const boarded = new Set(boardedIds);
      const localIsGround = this._isLocalGroundCrew();
      if (this.crewBoarded && mySocketId && !localIsGround) boarded.add(mySocketId);

      const mappedPlayers = players.length
        ? players.map((p) => {
            const role = normalizeRole(p.role, "commander");
            const meta = getMeta(role);
            const isGround = p.team === "ground" || isGroundRoleFn(role);
            return {
              id: p.id,
              name: p.name || "Crew",
              role,
              team: isGround ? "ground" : "crew",
              isGround,
              roleShort: meta.short,
              roleColor: meta.color,
              isHost: p.id === (room && room.hostId) || !!p.isHost,
              isSelf: p.id === mySocketId,
              isAboard: !isGround && boarded.has(p.id)
            };
          })
        : [{
            id: mySocketId || "local",
            name: (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.name) || "Astronaut",
            role: normalizeRole(window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.role, "commander"),
            team: localIsGround ? "ground" : "crew",
            isGround: localIsGround,
            roleShort: getMeta(window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.role).short,
            roleColor: getMeta(window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.role).color,
            isHost: true,
            isSelf: true,
            isAboard: !localIsGround && !!this.crewBoarded
          }];

      const flightRoster = mappedPlayers.filter((p) => !p.isGround);
      const groundRoster = mappedPlayers.filter((p) => p.isGround);
      const crewTotal = flightRoster.length ? flightRoster.length : (localIsGround ? 0 : 1);
      const aboardCount = Math.min(
        crewTotal,
        flightRoster.length ? flightRoster.filter((p) => p.isAboard).length : (this.crewBoarded ? 1 : 0)
      );

      const armOwner = flightRoster.find((p) => p.role === "engineer")
        || flightRoster.find((p) => p.isHost)
        || flightRoster[0]
        || mappedPlayers[0];
      const launchAuthority = flightRoster.find((p) => p.role === "commander")
        || flightRoster.find((p) => p.isHost)
        || flightRoster[0]
        || mappedPlayers[0];
      const isLocalLaunchAuthority = !localIsGround && !!(launchAuthority && (launchAuthority.isSelf || flightRoster.length <= 1));

      return {
        aboardCount,
        crewTotal,
        groundTotal: groundRoster.length,
        hasOnlineGround: groundRoster.length > 0,
        allAboard: flightRoster.length > 0 && aboardCount >= flightRoster.length,
        roster: flightRoster.length ? flightRoster : mappedPlayers,
        flightRoster,
        groundRoster,
        armOwner,
        launchAuthority,
        isLocalLaunchAuthority,
        groundSupport: (mission && mission.groundSupport) || {},
        launchPollAt: (mission && mission.launchPollAt) || 0
      };
    }

    _distanceToGuidancePoint(x, z) {
      const crew = window.localCrew && window.localCrew.group;
      if (!crew || !crew.visible || !crew.position) return null;
      return Math.hypot(crew.position.x - x, crew.position.z - z);
    }

    _updateBoardingGuidance(delta, elapsed) {
      if (!this.isGroundMode) return;

      const isGround = this._isLocalGroundCrew();
      if (this.lccConsoleOpen && isGround) {
        this._lccSyncAccumulator += delta;
        if (this._lccSyncAccumulator >= 0.35) {
          this._lccSyncAccumulator = 0;
          this._syncLccConsoleLive();
        }
      }

      const briefingEl = document.getElementById("mission-briefing-overlay");
      const paused = isGround ||
        this.siteTourActive ||
        this.isLaunching ||
        this.missionPhase !== "gantry" ||
        !!(window.gameplay && window.gameplay.activeTask) ||
        !!(window.missionViz && window.missionViz.isActive) ||
        !!(window.solarSystem && window.solarSystem.isActive) ||
        !!(window.issShowcase && window.issShowcase.isActive) ||
        !!(window.vrManager && window.vrManager.isAnyVRActive) ||
        !!(briefingEl && briefingEl.style.display === "flex");

      if (paused) {
        this.autoLaunchRemaining = null;
        this._updateGuidanceMarkers(delta, elapsed);
        this._groundHudAccumulator += delta;
        if (this._groundHudAccumulator >= 0.15) {
          this._groundHudAccumulator = 0;
          this._syncGroundHUD();
        }
        return;
      }

      const crew = window.localCrew && window.localCrew.group;
      if (!this.dockLocked && !this.crewBoarded && crew && crew.visible && crew.position) {
        const distanceToArmControl = Math.hypot(crew.position.x + 25.9, crew.position.z + 6.3);
        if (distanceToArmControl <= 1.35) {
          this.toggleBoardingDock(true);
        }
      }

      const crewState = this._crewAboardState();
      if (this.dockLocked && crewState.allAboard && !this._launchSequenceStarted) {
        if (this.autoLaunchRemaining === null) {
          this.autoLaunchRemaining = crewState.isLocalLaunchAuthority ? 5.0 : 6.2;
          if (window.spaceAudio) window.spaceAudio.playCountdownBeep(true);
          if (window.gameplay && typeof window.gameplay.showToast === "function") {
            window.gameplay.showToast("ALL CREW ABOARD · AUTOMATIC LIFTOFF IN 5 SECONDS");
          }
        }
        this.autoLaunchRemaining -= delta;
        if (this.autoLaunchRemaining <= 0) {
          this.autoLaunchRemaining = 0;
          if (!this._autoLaunchPollSent) {
            this._autoLaunchPollSent = true;
            this.startLaunchCountdown();
          }
        }
      } else {
        this.autoLaunchRemaining = null;
        this._autoLaunchPollSent = false;
      }

      this._updateGuidanceMarkers(delta, elapsed);
      this._groundHudAccumulator += delta;
      if (this._groundHudAccumulator >= 0.15) {
        this._groundHudAccumulator = 0;
        this._syncGroundHUD();
      }
    }

    _groundGuidanceState() {
      const touchUI = !!(window.isMobileDevice || (window.matchMedia && window.matchMedia("(pointer: coarse), (hover: none)").matches));
      const crewState = this._crewAboardState();
      const isGround = this._isLocalGroundCrew();
      const gs = crewState.groundSupport || {};
      const pollActive = !!(crewState.launchPollAt && !gs.goNoGoLaunch);
      const tourSpawns = (window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || [];
      const step1Done = this.dockLocked;
      const step2Done = this.crewBoarded;

      const camPos = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : (this.camera ? this.camera.position : null);
      const elevX = -34 + (this._elevatorConfig ? this._elevatorConfig.x : -8.2);
      const elevZ = (this._elevatorConfig ? this._elevatorConfig.z : -4.0);
      const nearElevator = camPos ? Math.hypot(camPos.x - elevX, camPos.z - elevZ) < 14.0 : false;
      const isAtGround = camPos ? camPos.y < 35.0 : false;
      const isAtTop = camPos ? camPos.y >= 85.0 : false;
      const isAtGantry = !isAtGround && !isAtTop;
      const canGoTop = isAtGantry && !this.isLaunching && !this.siteTourActive;
      const nearLccDoor = this._isNearLccDoor();
      const lccDoorOpen = !!(this.lccDoors && this.lccDoors.isOpen);

      const armOwnerLabel = crewState.armOwner
        ? (crewState.armOwner.isSelf ? `YOU (${crewState.armOwner.roleShort})` : `${crewState.armOwner.roleShort} · ${crewState.armOwner.name}`)
        : "ENG";
      const launchAuthLabel = crewState.launchAuthority
        ? (crewState.launchAuthority.isSelf ? `YOU (${crewState.launchAuthority.roleShort})` : `${crewState.launchAuthority.roleShort} · ${crewState.launchAuthority.name}`)
        : "CMD";
      const unboardedNames = crewState.flightRoster.filter((p) => !p.isAboard).map((p) => p.name);
      const stepOutHint = this.crewBoarded && !this.isLaunching ? " · [E/B] STEP OUT" : "";
      const hatchDistance = this._distanceToGuidancePoint(-7.8, -7.2);
      const canBoard = !isGround && !this.crewBoarded && this.dockLocked &&
        this.missionPhase === "gantry" && !this.isLaunching &&
        hatchDistance !== null && hatchDistance <= 2.6;
      const canUnboard = !isGround && this.crewBoarded && this.missionPhase === "gantry" &&
        !this.isLaunching && !this._launchSequenceStarted;

      let statusText = `LAUNCH PAD · STEP 1 (${armOwnerLabel}): BRIDGE [F]`;
      let statusColor = "#93c5fd";
      let distance = null;
      let target = null;

      const nearTerm = (this.siteTourActive || isGround) ? this._getNearbyFacilityTerminal() : null;
      if (nearLccDoor) {
        statusText = lccDoorOpen
          ? "LAUNCH CONTROL CENTER · DOORS OPEN · PRESS [E] TO CLOSE"
          : "LAUNCH CONTROL CENTER ENTRANCE · DOORS LOCKED · PRESS [E] TO ENTER";
        statusColor = lccDoorOpen ? "#86efac" : "#ef4444";
      } else if (isGround) {
        if (nearTerm) {
          statusText = `${nearTerm.label} · [E] OPEN`;
          statusColor = "#60a5fa";
        } else if (this.missionPhase === "gantry") {
          if (pollActive) {
            statusText = "LAUNCH CHECK READY · GIVE FINAL OK IN CONTROL CONSOLE [C]";
            statusColor = "#fbbf24";
          } else {
            statusText = `EARTH CONTROL ROOM · CREW ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · OPS CONSOLE [C]`;
            statusColor = gs.goNoGoLaunch ? "#86efac" : "#93c5fd";
          }
        } else if (this.missionPhase === "launch") {
          statusText = "ROCKET CLIMBING LIVE · WATCH LIFTOFF STATS · CONSOLE [C]";
          statusColor = "#fca5a5";
        } else if (this.missionPhase === "docking") {
          statusText = gs.dockingClearance
            ? "DOCKING IN PROGRESS · PATH CLEARED · CONSOLE [C]"
            : "APPROACHING STATION · APPROVE DOCKING [C]";
          statusColor = gs.dockingClearance ? "#86efac" : "#fbbf24";
        } else {
          statusText = "IN SPACE · HELP STATION CREW & RADIO DATA · CONSOLE [C]";
          statusColor = "#86efac";
        }
      } else if (this.siteTourActive) {
        const current = tourSpawns[this.siteTourIndex] || tourSpawns[0];
        if (nearTerm) {
          statusText = `${nearTerm.label} · [E] OPEN TERMINAL`;
          statusColor = "#60a5fa";
        } else {
          const loc = (current && (current.short || current.label) ? (current.short || current.label) : "LAUNCH PAD").toUpperCase();
          const jumpRange = tourSpawns.length || 6;
          statusText = touchUI
            ? `SITE TOUR · ${loc}`
            : `SITE TOUR · ${loc} · [1-${jumpRange}] JUMP · [T] TOWER`;
          statusColor = "#d0a15c";
        }
      } else if (this.isLaunching) {
        statusText = "ENGINES FIRED · LIFTOFF!";
        statusColor = "#f87171";
      } else if (pollActive) {
        statusText = touchUI
          ? "WAITING ON EARTH CONTROL OK · TAP LAUNCH TO OVERRIDE"
          : "WAITING ON EARTH CONTROL OK (8s) · PRESS [L] AGAIN TO LAUNCH NOW";
        statusColor = "#fbbf24";
      } else if (isAtGround && !step2Done) {
        statusText = "LC-39A · REACH TOWER TOP: PRESS [3] OR [T] · GANTRY: PRESS [2]";
        statusColor = "#38bdf8";
      } else if (isAtTop && !step2Done) {
        statusText = "LC-39A · TOWER TOP (88m) · TAKE ELEVATOR [G/E] DOWN TO GANTRY TO BOARD";
        statusColor = "#facc15";
      } else if (!step1Done) {
        distance = this._distanceToGuidancePoint(-25.9, -6.3);
        target = "arm";
        statusText = `LAUNCH PAD · STEP 1 (${armOwnerLabel}): BRIDGE [F]${distance !== null ? ` · ${Math.max(1, Math.round(distance))}m` : ""}`;
        statusColor = "#fbbf24";
      } else if (!step2Done) {
        distance = this._distanceToGuidancePoint(-7.8, -7.2);
        target = "hatch";
        statusText = `LAUNCH PAD · STEP 2: BOARD DOOR [E/B] (${crewState.aboardCount}/${crewState.crewTotal})${distance !== null ? ` · ${Math.max(1, Math.round(distance))}m` : ""}`;
        statusColor = "#93c5fd";
      } else if (this.autoLaunchRemaining !== null) {
        const seconds = Math.max(1, Math.ceil(this.autoLaunchRemaining));
        statusText = `CREW ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · LIFTOFF IN ${seconds}s${stepOutHint}`;
        statusColor = "#86efac";
      } else if (crewState.allAboard) {
        statusText = gs.goNoGoLaunch
          ? `CLEAR FOR LIFTOFF · CREW ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · STARTING...`
          : `CREW ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · CHECKING WITH GROUND...${stepOutHint}`;
        statusColor = "#86efac";
      } else {
        const waitingOn = unboardedNames.length ? `WAIT: ${unboardedNames.join(", ")} · ` : "";
        statusText = touchUI
          ? `CREW ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · ${waitingOn}LEADER: ${launchAuthLabel}${stepOutHint}`
          : `CREW ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · ${waitingOn}${launchAuthLabel} [L]${stepOutHint}`;
        statusColor = "#fbbf24";
      }

      const canLaunchNow = this._canLaunchNow(crewState);

      return {
        touchUI,
        isGround,
        gs,
        pollActive,
        step1Done,
        step2Done,
        crewBoarded: this.crewBoarded,
        canBoard,
        canUnboard,
        nearLccDoor,
        lccDoorOpen,
        nearTerm,
        nearElevator,
        canGoTop,
        isAtGround,
        isAtTop,
        canLaunchNow,
        aboardCount: crewState.aboardCount,
        crewTotal: crewState.crewTotal,
        allAboard: crewState.allAboard,
        roster: crewState.roster,
        flightRoster: crewState.flightRoster,
        groundRoster: crewState.groundRoster,
        armOwnerLabel,
        launchAuthLabel,
        autoLaunchRemaining: this.autoLaunchRemaining,
        statusText,
        statusColor,
        distance,
        target
      };
    }

    _groundOpButtonAttrs(approved, urgent = false) {
      if (approved) return "is-approved";
      if (urgent) return "is-urgent";
      return "";
    }

    _triggerGroundAction(type, extra = {}) {
      if (window.spaceAudio) window.spaceAudio.playClick();
      if (window.netManager && typeof window.netManager.sendGroundAction === "function") {
        window.netManager.sendGroundAction(type, extra);
      }
    }

    _renderGroundHUD() {
      if (!this.hudOverlay) return;
      const guidance = this._groundGuidanceState();
      const touchUI = guidance.touchUI;
      const tourSpawns = (window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || [];
      const gs = guidance.gs || {};

      this.hudOverlay.classList.toggle("is-collapsed", !!this.hudCollapsed);
      this.hudOverlay.innerHTML = `
        <div class="sc-hud-top">
          <div class="sc-hud-status">
            <span id="sc-status-dot" class="sc-status-dot" style="background:${guidance.statusColor};"></span>
            <span id="sc-status-label" class="sc-status-label" style="color:${guidance.statusColor};">${guidance.statusText}</span>
          </div>

          <div class="sc-hud-primary">
            <button type="button" id="btn-sc-lcc-door" class="sc-hud-btn ${guidance.lccDoorOpen ? "sc-btn-plan" : "sc-btn-launch"}" style="display:${guidance.nearLccDoor ? "inline-flex" : "none"};">
              ${guidance.lccDoorOpen ? (touchUI ? "🚪 CLOSE LCC" : "🚪 CLOSE DOORS [E]") : (touchUI ? "🚪 ENTER LCC" : "🚪 ENTER LCC [E]")}
            </button>
            <button type="button" id="btn-sc-term-act" class="sc-hud-btn sc-btn-term" style="display:${guidance.nearTerm ? "inline-flex" : "none"};">
              ${guidance.nearTerm ? guidance.nearTerm.shortAction : "TERMINAL [E]"}
            </button>
            <button type="button" id="btn-sc-elv-act" class="sc-hud-btn sc-btn-elv" style="display:${guidance.nearElevator || this.siteTourActive || guidance.isAtGround ? "inline-flex" : "none"};">
              ${guidance.isAtGround ? (touchUI ? "🗼 TO TOP DECK" : "🗼 TO TOP DECK [3/T]") : (guidance.isAtTop ? (touchUI ? "🛗 TO GROUND" : "🛗 TO GROUND [1]") : (this.siteTourActive ? "🛗 TO ELEVATOR [G]" : "🛗 ELEVATOR [G/E]"))}
            </button>
            ${guidance.isGround ? `
              <button type="button" id="btn-sc-lcc-console" class="sc-hud-btn ${this.lccConsoleOpen ? "sc-btn-launch" : "sc-btn-term"}">
                ${this.lccConsoleOpen ? "CLOSE OPS [C]" : (guidance.pollActive ? "GIVE OK [C]" : "CONTROL ROOM [C]")}
              </button>
            ` : `
              <button type="button" id="btn-sc-launch" class="sc-hud-btn sc-btn-launch" style="display:${guidance.canLaunchNow ? "inline-flex" : "none"};">
                ${guidance.pollActive ? (touchUI ? "OVERRIDE LAUNCH" : "OVERRIDE [L]") : (touchUI ? "LAUNCH" : "LAUNCH [L]")}
              </button>
              <button type="button" id="btn-sc-boarding" class="sc-hud-btn sc-btn-term" style="display:${guidance.canBoard || guidance.canUnboard ? "inline-flex" : "none"};">
                ${guidance.canUnboard ? (touchUI ? "STEP OUT" : "STEP OUT [E/B]") : (touchUI ? "BOARD" : "BOARD [E/B]")}
              </button>
            `}
            <button type="button" id="btn-sc-hud-toggle" class="sc-hud-btn sc-btn-collapse" title="${this.hudCollapsed ? "Expand Launch Pad Dock" : "Minimize Launch Pad Dock"}">
              ${this.hudCollapsed ? "+" : "-"}
            </button>
          </div>
        </div>

        <div class="sc-hud-body" style="display:${this.hudCollapsed ? "none" : "flex"};">
          <div class="sc-hud-tools">
            <button type="button" id="btn-sc-ground" class="sc-hud-btn sc-btn-elv" title="Ride Elevator to Pad Ground Level [1]">
              ${touchUI ? "🛗 GROUND" : "🛗 GROUND [1]"}
            </button>
            <button type="button" id="btn-sc-gantry" class="sc-hud-btn sc-btn-gantry" title="Ride Elevator to Spacecraft Gantry [2]">
              ${touchUI ? "🚀 GANTRY" : "🚀 GANTRY [2]"}
            </button>
            <button type="button" id="btn-sc-top-deck" class="sc-hud-btn sc-btn-top" title="Ride Elevator to Tower Top Observation Deck [3/T]">
              ${touchUI ? "🗼 TOP DECK" : "🗼 TOP DECK [3/T]"}
            </button>
            <button type="button" id="btn-sc-mission-plan" class="sc-hud-btn sc-btn-plan">
              ${touchUI ? "DESIGN" : "DESIGN [M]"}
            </button>
            <button type="button" id="btn-sc-mdl-desk" class="sc-hud-btn sc-btn-mdl">
              SUMMARY DESK
            </button>
            <button type="button" id="btn-sc-cml-workbench" class="sc-hud-btn sc-btn-plan">
              READINESS
            </button>
            <button type="button" id="btn-sc-orbit-viz" class="sc-hud-btn sc-btn-viz">
              ${touchUI ? "3D VIEW" : "3D VIEW [U]"}
            </button>
            ${guidance.isGround ? `
              <button type="button" id="btn-sc-return-lcc" class="sc-hud-btn sc-btn-tour">
                ${touchUI ? "CONTROL ROOM" : "CONTROL ROOM [T]"}
              </button>
            ` : `
              <button type="button" id="btn-sc-site-tour" class="sc-hud-btn sc-btn-tour">
                ${this.siteTourActive ? (touchUI ? "LAUNCH TOWER" : "LAUNCH TOWER [T]") : "SITE TOUR"}
              </button>
            `}
          </div>

          ${guidance.isGround ? `
            <div class="sc-ground-ops-strip">
              <button type="button" id="btn-gop-gonogo" class="ground-action-btn ${this._groundOpButtonAttrs(gs.goNoGoLaunch, guidance.pollActive)}" data-ground-op="go_nogo_launch">
                ${gs.goNoGoLaunch ? "LIFTOFF OK'D" : (guidance.pollActive ? "APPROVE LIFTOFF" : "PRE-APPROVE LIFTOFF")}
              </button>
              <button type="button" id="btn-gop-dock" class="ground-action-btn ${this._groundOpButtonAttrs(gs.dockingClearance, this.missionPhase === "docking" && !gs.dockingClearance)}" data-ground-op="docking_clearance">
                ${gs.dockingClearance ? "DOCKING OK'D" : "APPROVE DOCKING"}
              </button>
              <button type="button" id="btn-gop-dsn" class="ground-action-btn ${this._groundOpButtonAttrs(gs.dsnLocked)}" data-ground-op="dsn_lock">
                ${gs.dsnLocked ? "DISH LOCKED" : "LOCK EARTH DISH"}
              </button>
              <button type="button" id="btn-gop-eps" class="ground-action-btn ${this._groundOpButtonAttrs(gs.powerRouted)}" data-ground-op="power_route">
                ${gs.powerRouted ? "POWER SENT" : "BOOST SOLAR POWER"}
              </button>
              <button type="button" id="btn-gop-sci" class="ground-action-btn ${this._groundOpButtonAttrs(gs.scienceCleared)}" data-ground-op="science_downlink">
                ${gs.scienceCleared ? "LAB DATA ON" : "CLEAR SCIENCE DATA"}
              </button>
            </div>
          ` : `
            <div id="sc-guidance-steps" class="sc-hud-steps" style="display:${this.siteTourActive ? "none" : "flex"};">
              <span id="sc-step-1" class="sc-step-chip"></span>
              <span id="sc-step-2" class="sc-step-chip"></span>
              <span id="sc-step-3" class="sc-step-chip"></span>
            </div>
          `}

          ${(this.siteTourActive || guidance.isGround) ? `
            <div class="sc-tour-grid">
              ${tourSpawns.map((spawn, index) => `
                <button type="button" data-site-tour-index="${index}" class="sc-tour-btn${index === this.siteTourIndex ? " is-active" : ""}">
                  ${index + 1}. ${spawn.short || spawn.label}
                </button>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `;

      const btnToggle = this.hudOverlay.querySelector("#btn-sc-hud-toggle");
      if (btnToggle) {
        btnToggle.addEventListener("click", () => {
          this.hudCollapsed = !this.hudCollapsed;
          this._renderGroundHUD();
        });
      }

      const btnLccDoor = this.hudOverlay.querySelector("#btn-sc-lcc-door");
      if (btnLccDoor) {
        btnLccDoor.addEventListener("click", () => {
          this.toggleLccDoors();
        });
      }

      const btnElvAct = this.hudOverlay.querySelector("#btn-sc-elv-act");
      if (btnElvAct) {
        btnElvAct.addEventListener("click", () => {
          if (guidance.isAtGround) {
            this._handleElevatorKey(3);
          } else if (guidance.isAtTop) {
            this._handleElevatorKey(1);
          } else {
            this._handleElevatorKey(3);
          }
        });
      }

      const btnGround = this.hudOverlay.querySelector("#btn-sc-ground");
      if (btnGround) {
        btnGround.addEventListener("click", () => {
          this._handleElevatorKey(1);
        });
      }

      const btnElv = this.hudOverlay.querySelector("#btn-sc-elevator");
      if (btnElv) {
        btnElv.addEventListener("click", () => {
          this._handleElevatorKey(1);
        });
      }

      const btnGantry = this.hudOverlay.querySelector("#btn-sc-gantry");
      if (btnGantry) {
        btnGantry.addEventListener("click", () => {
          this._handleElevatorKey(2);
        });
      }

      const btnTop = this.hudOverlay.querySelector("#btn-sc-top-deck");
      if (btnTop) {
        btnTop.addEventListener("click", () => {
          this._handleElevatorKey(3);
        });
      }

      const btnLccConsole = this.hudOverlay.querySelector("#btn-sc-lcc-console");
      if (btnLccConsole) {
        btnLccConsole.addEventListener("click", () => this.toggleLccConsole());
      }

      const btnReturnLcc = this.hudOverlay.querySelector("#btn-sc-return-lcc");
      if (btnReturnLcc) {
        btnReturnLcc.addEventListener("click", () => this.exitSiteTour());
      }

      const btnPlan = this.hudOverlay.querySelector("#btn-sc-mission-plan");
      if (btnPlan) {
        btnPlan.addEventListener("click", () => {
          if (window.gameplay && typeof window.gameplay.openMissionPlannerFromGround === "function") {
            window.gameplay.openMissionPlannerFromGround();
          }
        });
      }

      const btnMdl = this.hudOverlay.querySelector("#btn-sc-mdl-desk");
      if (btnMdl) {
        btnMdl.addEventListener("click", () => {
          if (window.gameplay && typeof window.gameplay.openPreFlightMdlDesk === "function") {
            window.gameplay.openPreFlightMdlDesk("bus");
          }
        });
      }

      const btnScCml = this.hudOverlay.querySelector("#btn-sc-cml-workbench");
      if (btnScCml) {
        btnScCml.addEventListener("click", () => {
          if (window.gameplay && typeof window.gameplay.openCmlWorkbench === "function") {
            window.gameplay.openCmlWorkbench("checklist");
          }
        });
      }

      const btnViz = this.hudOverlay.querySelector("#btn-sc-orbit-viz");
      if (btnViz) {
        btnViz.addEventListener("click", () => {
          if (window.missionViz && typeof window.missionViz.toggle === "function") {
            window.missionViz.toggle();
          }
        });
      }

      const btnTermAct = this.hudOverlay.querySelector("#btn-sc-term-act");
      if (btnTermAct) {
        btnTermAct.addEventListener("click", () => {
          const term = this._getNearbyFacilityTerminal();
          if (term) this._activateFacilityTerminal(term);
        });
      }

      const btnSiteTour = this.hudOverlay.querySelector("#btn-sc-site-tour");
      if (btnSiteTour) {
        btnSiteTour.addEventListener("click", () => this.toggleSiteTour());
      }

      const btnLaunch = this.hudOverlay.querySelector("#btn-sc-launch");
      if (btnLaunch) {
        btnLaunch.addEventListener("click", () => {
          if (this._canLaunchNow()) this.startLaunchCountdown();
        });
      }

      const btnBoarding = this.hudOverlay.querySelector("#btn-sc-boarding");
      if (btnBoarding) {
        btnBoarding.addEventListener("click", () => {
          if (this.crewBoarded) {
            this.unboardSpacecraft();
            return;
          }
          const distHatch = this._distanceToGuidancePoint(-7.8, -7.2);
          if (this.dockLocked && distHatch !== null && distHatch <= 2.6) {
            this.boardSpacecraft();
          }
        });
      }

      this.hudOverlay.querySelectorAll("[data-ground-op]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const op = btn.getAttribute("data-ground-op");
          if (op) this._triggerGroundAction(op);
        });
      });

      const step1Chip = this.hudOverlay.querySelector("#sc-step-1");
      if (step1Chip) {
        step1Chip.addEventListener("click", () => {
          if (!this.dockLocked && !this.crewBoarded && !this._isLocalGroundCrew()) {
            const distArm = this._distanceToGuidancePoint(-25.9, -6.3);
            const myRole = window.InterfellasRoles && window.netManager && window.netManager.localPlayer
              ? window.InterfellasRoles.normalizeRole(window.netManager.localPlayer.role, "commander")
              : "commander";
            if ((distArm !== null && distArm <= 4.0) || myRole === "engineer" || (window.netManager && window.netManager.isHost)) {
              this.toggleBoardingDock(true);
            }
          }
        });
      }

      const step3Chip = this.hudOverlay.querySelector("#sc-step-3");
      if (step3Chip) {
        step3Chip.addEventListener("click", () => {
          if (this._canLaunchNow()) this.startLaunchCountdown();
        });
      }

      this.hudOverlay.querySelectorAll("[data-site-tour-index]").forEach((button) => {
        button.addEventListener("click", () => {
          const index = Number(button.getAttribute("data-site-tour-index"));
          if (Number.isFinite(index)) this.teleportSiteTour(index);
        });
      });

      this._syncGroundHUD();
    }

    _syncGroundHUD() {
      if (!this.hudOverlay) return;
      const guidance = this._groundGuidanceState();
      const label = this.hudOverlay.querySelector("#sc-status-label");
      if (label) {
        label.textContent = guidance.statusText;
        label.style.color = guidance.statusColor;
      }
      const dot = this.hudOverlay.querySelector("#sc-status-dot");
      if (dot) {
        dot.style.background = guidance.statusColor;
      }

      const btnLaunch = this.hudOverlay.querySelector("#btn-sc-launch");
      if (btnLaunch) {
        btnLaunch.style.display = guidance.canLaunchNow ? "inline-flex" : "none";
        btnLaunch.textContent = guidance.pollActive
          ? (guidance.touchUI ? "OVERRIDE LAUNCH" : "OVERRIDE [L]")
          : (guidance.touchUI ? "LAUNCH" : "LAUNCH [L]");
      }

      const btnBoarding = this.hudOverlay.querySelector("#btn-sc-boarding");
      if (btnBoarding) {
        btnBoarding.style.display = guidance.canBoard || guidance.canUnboard ? "inline-flex" : "none";
        btnBoarding.textContent = guidance.canUnboard
          ? (guidance.touchUI ? "STEP OUT" : "STEP OUT [E/B]")
          : (guidance.touchUI ? "BOARD" : "BOARD [E/B]");
      }

      const btnLccDoor = this.hudOverlay.querySelector("#btn-sc-lcc-door");
      if (btnLccDoor) {
        btnLccDoor.style.display = guidance.nearLccDoor ? "inline-flex" : "none";
        btnLccDoor.textContent = guidance.lccDoorOpen
          ? (guidance.touchUI ? "🚪 CLOSE LCC" : "🚪 CLOSE DOORS [E]")
          : (guidance.touchUI ? "🚪 ENTER LCC" : "🚪 ENTER LCC [E]");
        btnLccDoor.className = `sc-hud-btn ${guidance.lccDoorOpen ? "sc-btn-plan" : "sc-btn-launch"}`;
      }

      const btnTermAct = this.hudOverlay.querySelector("#btn-sc-term-act");
      if (btnTermAct) {
        btnTermAct.style.display = guidance.nearTerm ? "inline-flex" : "none";
        if (guidance.nearTerm) btnTermAct.textContent = guidance.nearTerm.shortAction;
      }

      const btnLcc = this.hudOverlay.querySelector("#btn-sc-lcc-console");
      if (btnLcc) {
        btnLcc.textContent = this.lccConsoleOpen
          ? "CLOSE OPS [C]"
          : (guidance.pollActive ? "GIVE OK [C]" : "CONTROL ROOM [C]");
      }

      const stepsRow = this.hudOverlay.querySelector("#sc-guidance-steps");
      if (stepsRow) stepsRow.style.display = (this.siteTourActive || guidance.isGround || this.hudCollapsed) ? "none" : "flex";

      const applyChip = (id, text, done, active, accent) => {
        const chip = this.hudOverlay.querySelector(`#${id}`);
        if (!chip) return;
        chip.textContent = `${done ? "DONE" : active ? ">" : "-"} ${text}`;
        chip.style.borderColor = done ? "rgba(34,197,94,0.45)" : active ? accent.border : "rgba(148,163,184,0.22)";
        chip.style.background = done ? "rgba(22,163,74,0.14)" : active ? accent.background : "rgba(15,23,42,0.7)";
        chip.style.color = done ? "#86efac" : active ? accent.color : "#94a3b8";
        chip.style.boxShadow = "none";
      };

      applyChip("sc-step-1", `1 · BRIDGE [F]`, guidance.step1Done, !guidance.step1Done, {
        border: "rgba(217,119,6,0.65)",
        background: "rgba(217,119,6,0.16)",
        color: "#fde68a"
      });
      applyChip("sc-step-2", guidance.crewBoarded ? "2 · ABOARD · [E/B] STEP OUT" : `2 · BOARD DOOR [E/B] (${guidance.aboardCount}/${guidance.crewTotal})`, guidance.step2Done, guidance.step1Done && !guidance.step2Done, {
        border: "rgba(59,130,246,0.6)",
        background: "rgba(37,99,235,0.18)",
        color: "#dbeafe"
      });
      const step3Chip = this.hudOverlay.querySelector("#sc-step-3");
      if (step3Chip) {
        step3Chip.style.cursor = guidance.canLaunchNow ? "pointer" : "default";
      }
      applyChip(
        "sc-step-3",
        guidance.allAboard ? "3 · AUTO LIFTOFF" : (guidance.canLaunchNow ? "3 · LAUNCH [L]" : "3 · LIFTOFF"),
        this.isLaunching,
        guidance.canLaunchNow && !this.isLaunching,
        {
          border: "rgba(34,197,94,0.6)",
          background: "rgba(22,163,74,0.18)",
          color: "#bbf7d0"
        }
      );
    }

    toggleLccConsole() {
      this.openLccConsole(!this.lccConsoleOpen);
    }

    openLccConsole(open = true) {
      const next = !!open && this._isLocalGroundCrew() && this.isGroundMode;
      this.lccConsoleOpen = next;
      if (this.lccConsoleOverlay) {
        this.lccConsoleOverlay.style.display = next ? "flex" : "none";
        if (next) {
          this._bindLccShuttleTelemetry();
          this._renderLccConsole();
        }
      }
      this._renderGroundHUD();
    }

    _syncLccConsoleLive() {
      if (!this.lccConsoleOverlay || !this.lccConsoleOpen) return;
      this._renderLccTelemetry();
      const mapWrap = this.lccConsoleOverlay.querySelector("#lcc-live-floorplan");
      if (mapWrap && window.shipInterior && typeof window.shipInterior.renderExternalFloorplanHtml === "function") {
        mapWrap.innerHTML = window.shipInterior.renderExternalFloorplanHtml(190);
      }
      const missionEl = this.lccConsoleOverlay.querySelector("#lcc-live-telemetry-readout");
      if (missionEl && window.gameplay && typeof window.gameplay.getGroundTelemetrySummary === "function") {
        const sum = window.gameplay.getGroundTelemetrySummary();
        missionEl.textContent = `STAGE: ${String(this.missionPhase || "gantry").toUpperCase()} · TASKS ${sum.completed}/${sum.total} · READY ${sum.readiness}%`;
      }
    }

    _lccPhaseLabel(phase) {
      const labels = {
        gantry: "Launch pad",
        launch: "Launch & ascent",
        docking: "Docking",
        station: "Station operations",
        debrief: "Debrief"
      };
      return labels[phase] || String(phase || "Launch pad").replace(/_/g, " ");
    }

    _bindLccShuttleTelemetry() {
      const net = window.netManager;
      if (!net || typeof net.on !== "function") return;
      if (this._lccTelemetryNet !== net) {
        if (this._lccTelemetryNet && this._lccTelemetryHandler && typeof this._lccTelemetryNet.off === "function") {
          this._lccTelemetryNet.off("shuttle_state", this._lccTelemetryHandler);
        }
        this._lccTelemetryNet = net;
        this._lccTelemetryHandler = (snapshot) => {
          this._lccTelemetrySnapshot = snapshot || null;
          this._lccTelemetryReceivedAt = Date.now();
          if (this.lccConsoleOpen) this._renderLccTelemetry(snapshot);
        };
        net.on("shuttle_state", this._lccTelemetryHandler);
      }
      if (net.snapshot && net.snapshot.telemetry) {
        this._lccTelemetrySnapshot = net.snapshot;
        if (!this._lccTelemetryReceivedAt) this._lccTelemetryReceivedAt = Date.now();
      }
    }

    _renderLccTelemetry(snapshot) {
      const root = this.lccConsoleOverlay && this.lccConsoleOverlay.querySelector("#lcc-shuttle-telemetry");
      if (!root) return;
      const net = window.netManager;
      const sn = snapshot || this._lccTelemetrySnapshot || (net && net.snapshot && net.snapshot.telemetry ? net.snapshot : null);
      const content = root.querySelector("#lcc-shuttle-telemetry-content");
      const sync = root.querySelector("#lcc-shuttle-telemetry-sync");
      const nav = root.querySelector("#lcc-shuttle-telemetry-tabs");
      if (!sn || !sn.telemetry) {
        if (sync) sync.textContent = "WAITING FOR SHUTTLE DOWNLINK";
        if (content) content.innerHTML = '<div class="sync-banner">Shuttle telemetry will appear here when the flight vehicle begins transmitting. Crew assignments and flight data share the same live mission snapshot.</div>';
        if (nav) nav.querySelectorAll("button").forEach((button) => button.disabled = true);
        return;
      }
      this._lccTelemetrySnapshot = sn;
      if (!this._lccTelemetryReceivedAt) this._lccTelemetryReceivedAt = Date.now();
      if (nav) nav.querySelectorAll("button").forEach((button) => {
        button.disabled = false;
        button.setAttribute("aria-pressed", String(button.dataset.lccTelemetryTab === this.lccTelemetryTab));
      });

      const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
      const hasNumber = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
      const fmt = (value, decimals = 0) => hasNumber(value) ? Number(value).toFixed(decimals) : "—";
      const t = sn.telemetry || {}, v = sn.vehicle || {}, eng = v.eng || {}, cfg = v.cfg || {}, res = sn.resources || {}, pay = sn.payload || {};
      const phase = String(sn.phase || "flight").replace(/_/g, " ").toUpperCase();
      const seconds = Math.max(0, Math.floor(Number(sn.met) || 0));
      const met = sn.phase === "prelaunch" ? `T-${fmt(sn.countdown)} S` : sn.met == null ? "—" : `T+${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
      const altitudeKm = hasNumber(t.altitudeM) ? Number(t.altitudeM) / 1000 : NaN;
      const altitude = Number.isFinite(altitudeKm) ? (Math.abs(altitudeKm) >= 20 ? fmt(altitudeKm, 1) : fmt(t.altitudeM)) : "—";
      const altitudeUnit = Number.isFinite(altitudeKm) && Math.abs(altitudeKm) >= 20 ? "KM" : "M";
      const pressure = hasNumber(t.dynPressPa) ? `${fmt(Number(t.dynPressPa) / 1000, 1)} KPA` : "—";
      const speed = (value) => `${fmt(value)} M/S`;
      const metric = (label, value) => `<div class="ground-lcc-telemetry-metric"><span>${esc(label)}</span><strong>${value}</strong></div>`;
      const cell = (label, value) => `<div class="ground-lcc-data-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
      const grid = (rows) => `<div class="ground-lcc-data-grid">${rows.map(([label, value]) => cell(label, value)).join("")}</div>`;
      const crew = sn.crew || {};
      const crewSeats = [["cdr", "COMMANDER"], ["plt", "PILOT"], ["ms1", "MISSION SPECIALIST 1"], ["ms2", "MISSION SPECIALIST 2"]];
      const next = sn.guidance && sn.guidance.next || {};
      const receivedAge = Math.max(0, Date.now() - this._lccTelemetryReceivedAt);
      const linkStatus = sn.paused ? "PAUSED" : receivedAge < 3000 ? "LIVE" : "STALE DOWNLINK";
      if (sync) sync.textContent = `${linkStatus} · ${esc(sn.missionId || "SHUTTLE")} · SIM ${fmt(sn.simTime, 1)} S · ${met} · ${(Object.values(crew).filter((seat) => seat && seat.name).length)}/4 CREW`;

      if (this.lccTelemetryTab === "systems") {
        const rows = [
          ["SSME", eng.ssme ? "FIRING" : "OFF"], ["SRB", eng.srb ? "FIRING" : "OFF"], ["OMS", eng.oms ? "FIRING" : "OFF"],
          ["THROTTLE", `${fmt((Number(eng.throttle) || 0) * 100)}%`], ["BOOSTERS", cfg.srb ? "ATTACHED" : "SEPARATED"], ["EXTERNAL TANK", cfg.et ? "ATTACHED" : "SEPARATED"],
          ["GEAR", v.gear >= 1 ? "DOWN" : v.gearCmd ? "MOVING" : "UP"], ["SPEED BRAKE", `${fmt((Number(v.sb) || 0) * 100)}%`], ["CARGO DOORS", `${fmt((Number(v.doors) || 0) * 100)}%`],
          ["PAYLOAD POWER", pay.power ? "ON" : "OFF"], ["PAYLOAD CHECKOUT", pay.checkout || "—"], ["PAYLOAD READY", pay.ready ? "YES" : "NO"], ["PAYLOAD STATE", pay.released ? "RELEASED" : pay.attached ? "ATTACHED" : "SEPARATED"],
          ["OMS FUEL", `${fmt(res.oms, 1)} KG`], ["RCS FUEL", `${fmt(res.rcs, 1)} KG`], ["ET FUEL", `${fmt(res.et, 1)} KG`], ["SRB FUEL", `${fmt(res.srb, 1)} KG`], ["PAYLOAD MASS", `${fmt(res.payloadKg, 1)} KG`],
          ["WARP", `${fmt(sn.warp)}× / ${fmt(sn.warpMax)}× MAX`], ["INTEGRITY", sn.integrity || "NORMAL"]
        ];
        content.innerHTML = grid(rows);
      } else if (this.lccTelemetryTab === "crew") {
        const roster = crewSeats.map(([key, label]) => {
          const seat = crew[key] || {};
          return `<article class="ground-lcc-crew-card"><strong>${label}</strong><span>${esc(seat.name || "AWAITING CREW")}</span><span>${seat.filled ? "CONNECTED · ABOARD" : "SEAT COVERED BY FLIGHT CONTROL"}</span></article>`;
        }).join("");
        const eventRows = (sn.messages || []).slice(-5).reverse().map((message) => `<div class="ground-lcc-data-cell"><span>${esc(fmt(message.t, 1))} S · ${esc(message.level || "FLIGHT")}</span><strong>${esc(message.text)}</strong></div>`).join("") || '<div class="ground-lcc-data-cell"><span>FLIGHT LOG</span><strong>No flight messages yet</strong></div>';
        content.innerHTML = `<div class="ground-lcc-crew-grid">${roster}</div><div class="sync-banner">CREW AND TELEMETRY ARE FROM THE SAME SERVER SNAPSHOT · NEXT ACTION: ${esc(next.seat || "CREW")} · ${esc(next.text || "Awaiting flight instruction")}</div><div class="ground-lcc-data-grid">${eventRows}</div>`;
      } else if (this.lccTelemetryTab === "raw") {
        content.innerHTML = `<pre class="ground-lcc-raw-snapshot">${esc(JSON.stringify(sn, null, 2))}</pre>`;
      } else if (this.lccTelemetryTab === "controls") {
        content.innerHTML = '<div class="sync-banner">GROUND CONTROL IS MONITORING THE LIVE SHUTTLE DOWNLINK. Flight command authority remains with the crew aboard. Use CREW COMMS in the console header to coordinate directly.</div>';
      } else {
        const primaryValue = altitude;
        const status = sn.failure ? `FLIGHT STOPPED · ${sn.failure.reason}` : sn.paused ? "FLIGHT PAUSED" : phase;
        const flightRows = [
          ["ORBIT SPEED", speed(t.inertialSpeedMps)], ["VERTICAL SPEED", speed(t.verticalSpeedMps)], ["MACH", fmt(t.mach, 2)], ["DYNAMIC PRESSURE", pressure],
          ["FLIGHT PATH", `${fmt(Number(t.flightPathRad) * 180 / Math.PI, 1)}°`], ["BANK", `${fmt(Number(t.bankRad) * 180 / Math.PI, 1)}°`], ["ANGLE OF ATTACK", `${fmt(Number(t.angleOfAttackRad) * 180 / Math.PI, 1)}°`],
          ["G LOAD", `${fmt(t.loadG, 2)} G`], ["HEAT", `${fmt(t.heat)} W/CM²`], ["APOAPSIS", hasNumber(t.apoapsisAltitudeM) ? `${fmt(Number(t.apoapsisAltitudeM) / 1000, 1)} KM` : "—"],
          ["PERIAPSIS", hasNumber(t.periapsisAltitudeM) ? `${fmt(Number(t.periapsisAltitudeM) / 1000, 1)} KM` : "—"], ["SATELLITE RANGE", hasNumber(pay.range) ? `${fmt(pay.range, 1)} M` : "—"]
        ];
        content.innerHTML = `<div class="ground-lcc-telemetry-main"><div class="ground-lcc-led-wrap"><span class="ground-lcc-led-label">${v.regime === "ground" ? "LANDING SPEED" : "SHUTTLE ALTITUDE"} · ${esc(status)}</span><strong class="ground-lcc-led-value">${esc(v.regime === "ground" ? fmt(t.eas, 1) : primaryValue)}</strong><span class="ground-lcc-led-unit">${v.regime === "ground" ? "M/S" : altitudeUnit}</span></div><div class="ground-lcc-telemetry-metrics">${metric("AIR SPEED", speed(t.airspeedMps))}${metric("MACH", fmt(t.mach, 2))}${metric("VERTICAL SPEED", speed(t.verticalSpeedMps))}${metric("AIR LOAD", pressure)}</div></div>${grid(flightRows)}`;
      }
    }

    _renderLccConsole() {
      if (!this.lccConsoleOverlay || !this.lccConsoleOpen) return;
      const crewState = this._crewAboardState();
      const gs = crewState.groundSupport || {};
      const pollActive = !!(crewState.launchPollAt && !gs.goNoGoLaunch);
      const phaseUpper = String(this.missionPhase || "gantry").toUpperCase();
      const sum = (window.gameplay && typeof window.gameplay.getGroundTelemetrySummary === "function")
        ? window.gameplay.getGroundTelemetrySummary()
        : { completed: 0, total: 6, readiness: 0, o2: 100, temp: 21.5, rad: 0 };
      const mapHtml = (window.shipInterior && typeof window.shipInterior.renderExternalFloorplanHtml === "function")
        ? window.shipInterior.renderExternalFloorplanHtml(190)
        : `<div style="font-size:11px;color:#94a3b8;">Station map goes live once you dock.</div>`;
      const activePing = gs.activePing;
      const pingValid = activePing && (Date.now() - (activePing.at || 0) < 20000);
      const roomButtons = [
        { id: "HUB", label: "HUB · MAIN HALL" },
        { id: "CMD", label: "CMD · WINDOW DECK" },
        { id: "PWR", label: "PWR · POWER ROOM" },
        { id: "SCI", label: "SCI · SCIENCE LAB" },
        { id: "LSS", label: "LSS · AIR & WATER" },
        { id: "HULL", label: "HULL · RADIO DISH" }
      ];

      const telemetryPanel = `
        <section class="ground-lcc-telemetry lcc-telemetry" id="lcc-shuttle-telemetry" aria-label="Live shuttle downlink">
          <div class="ground-lcc-telemetry-head">
            <div class="ground-lcc-telemetry-title">Shuttle downlink</div>
            <div class="ground-lcc-telemetry-sync" id="lcc-shuttle-telemetry-sync">Waiting for downlink</div>
          </div>
          <nav class="ground-lcc-telemetry-tabs" id="lcc-shuttle-telemetry-tabs" role="tablist" aria-label="Shuttle telemetry views">
            <button type="button" role="tab" aria-pressed="true" data-lcc-telemetry-tab="flight">Flight</button>
            <button type="button" role="tab" aria-pressed="false" data-lcc-telemetry-tab="systems">Systems</button>
            <button type="button" role="tab" aria-pressed="false" data-lcc-telemetry-tab="crew">Crew &amp; log</button>
            <button type="button" role="tab" aria-pressed="false" data-lcc-telemetry-tab="raw">Full data</button>
            <button type="button" role="tab" aria-pressed="false" data-lcc-telemetry-tab="controls">Ground role</button>
          </nav>
          <div class="ground-lcc-telemetry-content" id="lcc-shuttle-telemetry-content"></div>
        </section>`;

      this.lccConsoleOverlay.innerHTML = `
        <div class="ground-lcc-header">
          <div>
            <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:1.2px;color:#93c5fd;">EARTH CONTROL CENTER · ROOM 4</div>
            <div id="lcc-live-telemetry-readout" style="font-size:13.5px;font-weight:700;color:#f8fafc;margin-top:3px;">
              STAGE: ${phaseUpper} · TASKS ${sum.completed}/${sum.total} · READY ${sum.readiness}%
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <button type="button" class="ground-action-btn" id="btn-lcc-open-viz">3D PATH VIEW [U]</button>
            <button type="button" class="ground-action-btn" id="btn-lcc-open-planner">MISSION PLAN [M]</button>
            <button type="button" class="ground-action-btn" id="btn-lcc-cml-review" style="border-color:rgba(251,191,36,0.55);color:#fde68a;">FRESH-EYES REVIEW</button>
            <button type="button" class="ground-action-btn" id="btn-lcc-close">CLOSE [C]</button>
          </div>
        </div>

        ${telemetryPanel}

        ${pingValid ? `
          <div class="ground-ping-banner">
            <span>TEAM ALERT: <strong>${String(activePing.roomLabel || activePing.roomId || "HUB").toUpperCase()}</strong>${activePing.message ? ` · ${activePing.message}` : ""} (${activePing.byName || "Ground"})</span>
            <button type="button" class="ground-action-btn" id="btn-lcc-clear-ping">CLEAR ALERT</button>
          </div>
        ` : ""}

        <div class="ground-lcc-grid">
          <div class="ground-lcc-card">
            <div style="font-family:var(--font-mono);font-size:11.5px;letter-spacing:1px;color:#94a3b8;">LAUNCH & DOCKING OK</div>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.goNoGoLaunch, pollActive)}" data-lcc-op="go_nogo_launch" style="text-align:left;padding:9px 12px;font-size:11.5px;">
              ${gs.goNoGoLaunch ? `LIFTOFF APPROVED (${gs.goNoGoBy || "GROUND"})` : (pollActive ? "CHECK ACTIVE: GIVE LIFTOFF OK" : "PRE-APPROVE LIFTOFF")}
            </button>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.dockingClearance, this.missionPhase === "docking" && !gs.dockingClearance)}" data-lcc-op="docking_clearance" style="text-align:left;padding:9px 12px;font-size:11.5px;">
              ${gs.dockingClearance ? `DOCKING PATH CLEARED (${gs.dockingClearanceBy || "GROUND"})` : "APPROVE SAFE DOCKING PATH"}
            </button>
            <div style="font-family:var(--font-mono);font-size:11px;color:#94a3b8;margin-top:6px;">FLIGHT TEAM (${crewState.aboardCount}/${crewState.crewTotal} ABOARD)</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              ${crewState.flightRoster.map((p) => `
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:7px 10px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.16);border-radius:4px;">
                  <span style="color:#f8fafc;"><strong>${p.roleShort}</strong> · ${p.name}</span>
                  <span style="font-family:var(--font-mono);font-size:10.5px;color:${this.missionPhase === "station" ? "#86efac" : (p.isAboard ? "#93c5fd" : "#94a3b8")};">
                    ${this.missionPhase === "station" ? "STATION" : (p.isAboard ? "ABOARD" : "LAUNCH PAD")}
                  </span>
                </div>
              `).join("") || `<div style="font-size:12px;color:#94a3b8;">No Space Crew assigned.</div>`}
            </div>
          </div>

          <div class="ground-lcc-card">
            <div style="font-family:var(--font-mono);font-size:11.5px;letter-spacing:1px;color:#94a3b8;">GROUND TEAM HELP & BOOSTS</div>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.dsnLocked)}" data-lcc-op="dsn_lock" style="text-align:left;padding:9px 12px;font-size:11.5px;">
              ${gs.dsnLocked ? `EARTH RADIO LOCKED (${gs.dsnLockedBy || "GROUND"})` : "TURN ON BIG EARTH RADIO DISH (+SIGNAL)"}
            </button>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.powerRouted)}" data-lcc-op="power_route" style="text-align:left;padding:9px 12px;font-size:11.5px;">
              ${gs.powerRouted ? `SOLAR POWER BOOST ON (${gs.powerRoutedBy || "GROUND"})` : "SEND EXTRA SOLAR POWER TRACKING (+POWER)"}
            </button>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.scienceCleared)}" data-lcc-op="science_downlink" style="text-align:left;padding:9px 12px;font-size:11.5px;">
              ${gs.scienceCleared ? `LAB DATA LINK CLEARED (${gs.scienceClearedBy || "GROUND"})` : "APPROVE LIVE SCIENCE DATA FEED (+SCIENCE)"}
            </button>
            <div style="font-family:var(--font-mono);font-size:11px;color:#94a3b8;margin-top:6px;">ALERT A STATION ROOM</div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;">
              ${roomButtons.map((rm) => `
                <button type="button" class="ground-action-btn ${pingValid && activePing.roomId === rm.id ? "is-approved" : ""}" data-lcc-ping="${rm.id}" style="padding:7px 9px;font-size:11px;">
                  ALERT ${rm.label}
                </button>
              `).join("")}
            </div>
          </div>

          <div class="ground-lcc-card">
            <div style="font-family:var(--font-mono);font-size:11.5px;letter-spacing:1px;color:#94a3b8;">LIVE STATION ROOM MAP</div>
            <div id="lcc-live-floorplan" style="background:rgba(5,8,16,0.8);border:1px solid rgba(148,163,184,0.16);border-radius:5px;padding:10px;">
              ${mapHtml}
            </div>
            <div style="font-size:11.5px;color:#94a3b8;line-height:1.5;">
              Team helper: Ground approvals boost &amp; guide Space Crew numbers without blocking progress. Hold [R] or click VOICE RADIO to talk directly to space.
            </div>
          </div>
        </div>
      `;

      const btnClose = this.lccConsoleOverlay.querySelector("#btn-lcc-close");
      if (btnClose) btnClose.addEventListener("click", () => this.openLccConsole(false));
      const btnViz = this.lccConsoleOverlay.querySelector("#btn-lcc-open-viz");
      if (btnViz) btnViz.addEventListener("click", () => {
        if (window.missionViz && typeof window.missionViz.toggle === "function") window.missionViz.toggle();
      });
      const btnPlanner = this.lccConsoleOverlay.querySelector("#btn-lcc-open-planner");
      if (btnPlanner) btnPlanner.addEventListener("click", () => {
        if (window.gameplay && typeof window.gameplay.openMissionPlannerFromGround === "function") {
          window.gameplay.openMissionPlannerFromGround();
        }
      });
      const btnLccCml = this.lccConsoleOverlay.querySelector("#btn-lcc-cml-review");
      if (btnLccCml) btnLccCml.addEventListener("click", () => {
        this.openLccConsole(false);
        if (window.gameplay && typeof window.gameplay.openCmlWorkbench === "function") {
          window.gameplay.openCmlWorkbench("checklist", { assessorMode: true });
        }
      });
      const btnClearPing = this.lccConsoleOverlay.querySelector("#btn-lcc-clear-ping");
      if (btnClearPing) btnClearPing.addEventListener("click", () => this._triggerGroundAction("clear_ping"));

      this.lccConsoleOverlay.querySelectorAll("[data-lcc-op]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const op = btn.getAttribute("data-lcc-op");
          if (op) this._triggerGroundAction(op);
        });
      });

      this.lccConsoleOverlay.querySelectorAll("[data-lcc-ping]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetRoom = btn.getAttribute("data-lcc-ping");
          if (targetRoom) this._triggerGroundAction("ping_room", { targetRoom, message: "PLEASE CHECK THIS ROOM — EARTH CONTROL" });
        });
      });
      this.lccConsoleOverlay.querySelectorAll("[data-lcc-telemetry-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.lccTelemetryTab = btn.dataset.lccTelemetryTab || "flight";
          this._renderLccTelemetry();
        });
      });
      this._bindLccShuttleTelemetry();
      this._renderLccTelemetry();
    }

    _syncSpaceGamesLock() {
      if (window.csaNasaLab && typeof window.csaNasaLab.syncGroundLockState === "function") {
        window.csaNasaLab.syncGroundLockState();
      }
    }

    syncLocalRoleChange() {
      const isGround = this._isLocalGroundCrew();
      if (!isGround && this.lccConsoleOpen) {
        this.lccConsoleOpen = false;
        if (this.lccConsoleOverlay) this.lccConsoleOverlay.style.display = "none";
      }
      if (this.isGroundMode && this.missionPhase === "gantry" && !this.crewBoarded && window.localCrew && window.localCrew.group) {
        const spawn = isGround
          ? this._groundLccSpawnForIndex(this._localGroundIndex())
          : this._groundSpawnForIndex(this._localPlayerIndex());
        window.localCrew.group.visible = true;
        window.localCrew.group.position.set(spawn.x, spawn.y, spawn.z);
        window.localCrew.group.rotation.y = spawn.yaw;
        if (typeof window.setCameraYawPitch === "function") {
          window.setCameraYawPitch(spawn.yaw, isGround ? 0.03 : -0.05);
        }
      }
      this._renderGroundHUD();
      if (this.lccConsoleOpen) this._renderLccConsole();
      this._syncSpaceGamesLock();
    }


    /**
     * Player controls the Orbiter Access Arm / Boarding Dock to swing & lock to the spacecraft hatch.
     * The lock state is room-wide so every astronaut sees the same bridge.
     */
    toggleBoardingDock(forceLock, options = {}) {
      const fromNetwork = !!options.fromNetwork;
      const broadcast = options.broadcast !== false;
      const nextState = typeof forceLock === "boolean" ? forceLock : !this.dockLocked;
      this.dockLocked = nextState;
      this.targetDockSwingAngle = nextState ? 0.0 : 0.38;

      if (this.dockStatusLightMat) {
        this.dockStatusLightMat.color.setHex(nextState ? 0x34d399 : 0xf59e0b);
        this.dockStatusLightMat.emissive.setHex(nextState ? 0x34d399 : 0xf59e0b);
      }

      if (!fromNetwork) {
        if (window.spaceAudio) {
          window.spaceAudio.playAirlockCycle();
        }
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast(
            nextState
              ? "ACCESS ARM LOCKED · FOLLOW THE GLOWING MARKER TO THE ORBITER HATCH"
              : "ORBITER ACCESS ARM RETRACTED"
          );
        }
        if (broadcast && window.netManager && typeof window.netManager.setMissionDockLocked === "function") {
          window.netManager.setMissionDockLocked(nextState);
        }
      }
      this._renderGroundHUD();
    }

    /**
     * Boards the local astronaut on the pad. Boarding is tracked per player by
     * the server, so each crew member can walk aboard independently.
     */
    boardSpacecraft(options = {}) {
      if (this._isLocalGroundCrew()) return;
      const fromNetwork = !!options.fromNetwork;
      const broadcast = options.broadcast !== false;

      if (!this.dockLocked) {
        this.toggleBoardingDock(true, { fromNetwork, broadcast });
      }
      const wasBoarded = this.crewBoarded;
      this.crewBoarded = true;
      this._boardedAt = Date.now();
      this._unboardedAt = 0;
      this.boardingState = "boarded";

      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = false;
      }

      if (!fromNetwork && !wasBoarded) {
        if (window.spaceAudio) {
          window.spaceAudio.playDockingLatch();
        }
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          const crewState = this._crewAboardState();
          const touchUI = !!(window.isMobileDevice || (window.matchMedia && window.matchMedia("(pointer: coarse), (hover: none)").matches));
          window.gameplay.showToast(
            crewState.allAboard
              ? "CREW MEMBER BOARDED & HATCH SEALED · AUTOMATIC LIFTOFF SEQUENCE"
              : `CREW MEMBER BOARDED (${crewState.aboardCount}/${crewState.crewTotal}) · ${touchUI ? "TAP LAUNCH NOW" : "PRESS [L] OR CLICK LAUNCH NOW"} TO START WITHOUT WAITING`
          );
        }
        if (broadcast && window.netManager && typeof window.netManager.boardSpacecraft === "function") {
          window.netManager.boardSpacecraft();
        }
      }
      this._renderGroundHUD();
    }

    /**
     * Steps back out of the orbiter before liftoff and returns the crew member
     * to the access arm. Once the launch sequence starts this is refused so a
     * countdown cannot be cancelled at the hatch.
     */
    unboardSpacecraft(options = {}) {
      if (this._isLocalGroundCrew()) return false;
      if (!this.crewBoarded || this.missionPhase !== "gantry" || this.isLaunching || this._launchSequenceStarted) {
        return false;
      }

      const fromNetwork = !!options.fromNetwork;
      const broadcast = options.broadcast !== false;
      this.crewBoarded = false;
      this._boardedAt = 0;
      this._unboardedAt = Date.now();
      this.boardingState = this.dockLocked ? "dock_locked" : "gantry";
      this.autoLaunchRemaining = null;
      this._autoLaunchPollSent = false;

      // Stand in the White Room on the ship side of the access arm, facing
      // back toward the tower. The crew can immediately reboard or walk away.
      const spawn = { x: -8.4, y: 64.1, z: -7.2, yaw: -Math.PI / 2 };
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = true;
        window.localCrew.group.position.set(spawn.x, spawn.y, spawn.z);
        window.localCrew.group.rotation.y = spawn.yaw;
      }
      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(spawn.yaw, -0.05);
      }
      if (!fromNetwork) {
        if (window.spaceAudio) window.spaceAudio.playAirlockCycle();
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("STEPPED BACK ONTO THE BOARDING BRIDGE · WALK BACK TO THE TOWER OR REBOARD AT THE HATCH");
        }
        if (broadcast && window.netManager && typeof window.netManager.unboardSpacecraft === "function") {
          window.netManager.unboardSpacecraft();
        }
      }
      this._renderGroundHUD();
      this._syncSpaceGamesLock();
      return true;
    }

    // ============================================================================
    // SHARED MISSION PHASE (server-authoritative)
    // Dock lock, launch, docking and station entry are room-wide. Boarding is
    // tracked per astronaut so each player can walk aboard independently.
    // ============================================================================
    _localPlayerIndex() {
      const nm = window.netManager;
      const players = nm && nm.roomState && Array.isArray(nm.roomState.players) ? nm.roomState.players : [];
      if (!players.length) return 0;
      const index = players.findIndex((p) => p && p.id === nm.socketId);
      return index >= 0 ? index : 0;
    }

    _groundSpawnForIndex(index = 0) {
      // Safe gantry spawn queue synced with server.js groundSpawnFor().
      // Places crew clear of the tower lattice and >2.7m from Arm Control (-25.9, -6.3)
      // so joining players do not immediately auto-trip the access arm.
      const spots = [
        { x: -25.8, z: -9.0 },
        { x: -26.8, z: -9.0 },
        { x: -25.8, z: -10.3 },
        { x: -26.8, z: -10.3 },
        { x: -25.8, z: -11.6 },
        { x: -26.8, z: -11.6 }
      ];
      const spot = spots[index % spots.length];
      return {
        x: spot.x,
        y: 64.1,
        z: spot.z,
        yaw: 0
      };
    }

    _stationSpawnForIndex(index = 0) {
      // Safe standing spots around the Transit Hub holotable.
      const slots = [
        [0.0, 0.0, 2.0],
        [-0.7, 0.0, 3.3],
        [0.7, 0.0, 3.3],
        [-0.7, 0.0, 4.6],
        [0.7, 0.0, 4.6],
        [0.0, 0.0, 5.8]
      ];
      const slot = slots[index % slots.length];
      return { x: slot[0], y: slot[1], z: slot[2], yaw: Math.PI };
    }

    _syncRemoteCrewSpawns(phase = "gantry") {
      const nm = window.netManager;
      if (!nm || !nm.roomState || !Array.isArray(nm.roomState.players)) return;
      const roles = window.InterfellasRoles;
      let groundIdx = 0;
      let flightIdx = 0;
      nm.roomState.players.forEach((player) => {
        if (!player) return;
        const isGround = player.team === "ground" || (roles && typeof roles.isGroundRole === "function" && roles.isGroundRole(player.role));
        const roleSlot = isGround ? groundIdx++ : flightIdx++;
        if (player.id === nm.socketId) return;
        const rp = nm.remotePlayers && nm.remotePlayers[player.id];
        if (!rp) return;
        const spawn = isGround
          ? this._groundLccSpawnForIndex(roleSlot)
          : (phase === "station"
            ? this._stationSpawnForIndex(roleSlot)
            : this._groundSpawnForIndex(roleSlot));
        rp.curPos = [spawn.x, spawn.y, spawn.z];
        rp.targetPos = [spawn.x, spawn.y, spawn.z];
        rp.curYaw = spawn.yaw;
        rp.targetYaw = spawn.yaw;
        rp.snapshots = [];
        if (rp.mesh) {
          rp.mesh.position.set(spawn.x, spawn.y, spawn.z);
          rp.mesh.rotation.y = spawn.yaw;
        }
      });
    }

    /**
     * Applies an authoritative mission snapshot from the server. Safe to call
     * repeatedly; each phase transition is guarded so cutscenes never restart.
     * `meta.action === "reset"` forces the crew back to the gantry even if a
     * launch/docking/station sequence is already running locally.
     */
    applyMissionState(mission, meta = {}) {
      if (!mission || !window.isGameStarted) return;
      const phase = mission.phase || "gantry";
      const forceReset = !!(meta && meta.action === "reset");
      const nm = window.netManager;
      const myId = nm ? nm.socketId : null;
      const isGround = this._isLocalGroundCrew();
      const boardedByServer = !isGround && Array.isArray(mission.boarded) && mission.boarded.indexOf(myId) !== -1;

      if (forceReset) {
        if (this.openCar) this.openCar.forceExit();
        this._launchSequenceStarted = false;
        this._dockingPhaseStarted = false;
        this._stationEntered = false;
        this._groundObserverLaunch = false;
        this._autoLaunchPollSent = false;
        this._localPollSentAt = 0;
        this.isGroundMode = false;
        this.lccConsoleOpen = false;
        if (this.lccConsoleOverlay) this.lccConsoleOverlay.style.display = "none";
        if (window.launchCutscene && window.launchCutscene.isPlaying && typeof window.launchCutscene.cancel === "function") {
          window.launchCutscene.cancel();
        }
        if (window.dockingSim && window.dockingSim.isActive) {
          window.dockingSim.stop();
        }
      }

      if (phase === "gantry") {
        // A late dock/board snapshot can arrive while this client is already
        // flying; never rewind the local sequence to the pad unless the server
        // explicitly broadcasts a crew reset.
        if (!forceReset && (this._launchSequenceStarted || this._dockingPhaseStarted || this._stationEntered)) return;
      }
      this.missionPhase = phase;

      if (phase === "gantry") {
        this.dockLocked = !!mission.dockLocked;
        if (isGround) {
          this.crewBoarded = false;
        } else {
          // Respect optimistic board/step-out states while the server ack is in
          // flight, but never let a stale mission snapshot silently do either.
          const recentlyUnboarded = this._unboardedAt && (Date.now() - this._unboardedAt < 2500);
          const recentlyBoarded = this._boardedAt && (Date.now() - this._boardedAt < 2500);
          if (boardedByServer && !recentlyUnboarded) {
            this.crewBoarded = true;
          } else if (!boardedByServer && !recentlyBoarded) {
            this.crewBoarded = false;
            this._unboardedAt = 0;
          }
        }
        this.targetDockSwingAngle = this.dockLocked ? 0.0 : 0.38;
        if (!this.isGroundMode) {
          this.enterSpaceCenter(mission);
          return;
        }
        if (!isGround && this.crewBoarded && window.localCrew && window.localCrew.group) {
          window.localCrew.group.visible = false;
        }
        if (this.dockStatusLightMat) {
          const color = this.dockLocked ? 0x34d399 : 0xf59e0b;
          this.dockStatusLightMat.color.setHex(color);
          this.dockStatusLightMat.emissive.setHex(color);
        }
        this._renderGroundHUD();
        if (this.lccConsoleOpen) this._renderLccConsole();
        return;
      }

      if (phase === "launch") {
        if (!isGround && (this._dockingPhaseStarted || this._stationEntered)) return;
        if (!this.isGroundMode) {
          this.enterSpaceCenter(mission);
          return;
        }
        if (!this._launchSequenceStarted) {
          this.startLaunchCountdown({ fromNetwork: true });
        } else {
          if (isGround) {
            this._renderGroundHUD();
            if (this.lccConsoleOpen) this._renderLccConsole();
          }
          if (window.launchCutscene && typeof window.launchCutscene.updateCrewStatus === "function") {
            window.launchCutscene.updateCrewStatus(mission);
          }
        }
        return;
      }

      if (phase === "docking") {
        if (isGround) {
          if (!this.isGroundMode) {
            this.enterSpaceCenter(mission);
          } else {
            this.startOrbitalDockingPhase({ fromNetwork: true });
          }
          this._renderGroundHUD();
          if (this.lccConsoleOpen) this._renderLccConsole();
          return;
        }
        // Server transitioned Flight Crew to docking (e.g. launch ended or skip vote passed).
        if (window.launchCutscene && window.launchCutscene.isPlaying && typeof window.launchCutscene.cancel === "function") {
          window.launchCutscene.cancel();
        }
        if (!this._dockingPhaseStarted) {
          this.startOrbitalDockingPhase({ fromNetwork: true });
        } else if (window.dockingSim && typeof window.dockingSim.updateCrewStatus === "function") {
          window.dockingSim.updateCrewStatus(mission);
        }
        return;
      }

      if (phase === "station") {
        if (isGround && !this.isGroundMode) {
          this.enterSpaceCenter(mission);
          return;
        }
        this.completeDockingAndEnterStation({ fromNetwork: true });
        this._renderGroundHUD();
        if (this.lccConsoleOpen) this._renderLccConsole();
        if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();
      }
    }

    /**
     * Enters Space Center ground mode (called when mission starts).
     * When a mission snapshot is supplied, restores the current shared phase.
     */
    enterSpaceCenter(mission) {
      const nm = window.netManager;
      const activeMission = mission || (nm && typeof nm.getMission === "function" ? nm.getMission() : null);
      const phase = activeMission && activeMission.phase ? activeMission.phase : "gantry";
      const isGround = this._isLocalGroundCrew();

      this.siteTourActive = false;
      this.missionPhase = phase;
      this._launchSequenceStarted = false;
      this._dockingPhaseStarted = false;
      this._stationEntered = false;
      this._groundObserverLaunch = false;
      this._autoLaunchPollSent = false;

      if (window.launchCutscene && window.launchCutscene.isPlaying && typeof window.launchCutscene.cancel === "function") {
        window.launchCutscene.cancel();
      }
      if (window.dockingSim && window.dockingSim.isActive) {
        window.dockingSim.stop();
      }

      if (window.gameplay && window.gameplay.activeTask && typeof window.gameplay.closeTaskModal === "function") {
        window.gameplay.closeTaskModal();
      }
      if (window.shipInterior && window.shipInterior.isMoonLandingActive && typeof window.shipInterior.toggleMoonLandingScene === "function") {
        window.shipInterior.toggleMoonLandingScene(false);
      }
      if (window.solarSystem && window.solarSystem.isActive && typeof window.solarSystem.close === "function") {
        window.solarSystem.close();
      }
      if (window.issShowcase && window.issShowcase.isActive && typeof window.issShowcase.toggle === "function") {
        window.issShowcase.toggle();
      }

      // Late Flight joiners skip straight to the active orbital phase. Ground
      // Control ALWAYS remains at Kennedy Space Center on Earth.
      if (!isGround && phase === "station") {
        this.isGroundMode = false;
        this.completeDockingAndEnterStation({ fromNetwork: true });
        return;
      }
      if (!isGround && phase === "docking") {
        this.isGroundMode = false;
        this.startOrbitalDockingPhase({ fromNetwork: true });
        return;
      }

      this._ensureGroundBuilt();
      this.isGroundMode = true;
      this.isLaunching = false;
      this.launchTime = 0.0;
      document.body.classList.add("ground-mode-active");
      document.body.classList.remove("interior-active", "launch-active", "docking-active", "iss-showcase-active", "solar-system-active");
      this._syncSpaceGamesLock();
      this.autoLaunchRemaining = null;
      if (this.stackGroup) {
        this.stackGroup.visible = phase === "gantry" || phase === "launch";
        this.stackGroup.position.set(0, 20.2, 0);
        this.stackGroup.rotation.set(0, 0, 0);
      }
      this.boardingState = (activeMission && activeMission.dockLocked) ? "dock_locked" : "gantry";
      this.dockLocked = !!(activeMission && activeMission.dockLocked);
      const myId = nm ? nm.socketId : null;
      this.crewBoarded = !isGround && !!(activeMission && Array.isArray(activeMission.boarded) && activeMission.boarded.indexOf(myId) !== -1);
      this.dockSwingAngle = this.dockLocked ? 0.0 : 0.38;
      this.targetDockSwingAngle = this.dockSwingAngle;
      if (this.armPivotGroup) this.armPivotGroup.rotation.y = this.dockSwingAngle;
      if (this.group) this.group.visible = true;

      if (this.dockStatusLightMat) {
        const color = this.dockLocked ? 0x34d399 : 0xf59e0b;
        this.dockStatusLightMat.color.setHex(color);
        this.dockStatusLightMat.emissive.setHex(color);
      }
      if (this.delugeWaterMesh && this.delugeWaterMesh.material) {
        this.delugeWaterMesh.material.opacity = 0.0;
      }
      if (this.steamPlumes) {
        this.steamPlumes.forEach((s) => {
          if (s.material) s.material.opacity = 0.0;
        });
      }
      if (this.flamePlumes) {
        this.flamePlumes.forEach((p) => { p.visible = false; });
      }

      // Ground haze, daylight sky and no starfield while on Earth.
      this._applyGroundAtmosphere();

      // Hide exterior ISS & station interior while at Kennedy Space Center on Earth!
      if (window.issGroup) window.issGroup.visible = false;
      if (window.photorealisticEarth && window.photorealisticEarth.group) {
        window.photorealisticEarth.group.visible = false;
      }
      if (window.shipInterior) {
        window.shipInterior.hide();
      }

      const spawn = isGround
        ? this._groundLccSpawnForIndex(this._localGroundIndex())
        : this._groundSpawnForIndex(this._localPlayerIndex());
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = isGround ? true : !this.crewBoarded;
        window.localCrew.group.position.set(spawn.x, spawn.y, spawn.z);
        window.localCrew.group.rotation.y = spawn.yaw;
      }
      this._syncRemoteCrewSpawns(phase);
      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(spawn.yaw, isGround ? 0.03 : -0.05);
      }

      if (this.hudOverlay) {
        this.hudOverlay.style.display = window.isGameStarted ? "flex" : "none";
        this._renderGroundHUD();
      }
      if (this.lccConsoleOverlay && !isGround) {
        this.lccConsoleOpen = false;
        this.lccConsoleOverlay.style.display = "none";
      }

      if (phase === "launch") {
        this.startLaunchCountdown({ fromNetwork: true });
      } else if (isGround && phase === "docking") {
        this.startOrbitalDockingPhase({ fromNetwork: true });
      } else if (isGround && phase === "station") {
        this.completeDockingAndEnterStation({ fromNetwork: true });
      }
    }

    /**
     * Executes the shared liftoff sequence from LC-39A -> Ascent -> Orbital Docking -> Station Interior.
     */
    startLaunchCountdown(options = {}) {
      const fromNetwork = !!options.fromNetwork;
      const broadcast = options.broadcast !== false;
      const isGround = this._isLocalGroundCrew();
      if (this._launchSequenceStarted || (!isGround && this._stationEntered)) return;
      if (this.openCar) this.openCar.forceExit();

      if (!fromNetwork) {
        if (isGround) return;
        const nm = window.netManager;
        const room = nm && nm.roomState;
        const mission = nm && typeof nm.getMission === "function" ? nm.getMission() : null;
        const gs = (mission && mission.groundSupport) || {};
        const roles = window.InterfellasRoles;
        const hasGround = !!(room && Array.isArray(room.players) && room.players.some((p) => p && (p.team === "ground" || (roles && roles.isGroundRole(p.role)))));

        if (nm && nm.roomId && hasGround && !gs.goNoGoLaunch) {
          const pollPending = !!(mission && mission.launchPollAt);
          if (broadcast && typeof nm.requestLaunch === "function") {
            nm.requestLaunch();
          }
          if (!pollPending || (Date.now() - this._localPollSentAt < 1200)) {
            if (!pollPending) this._localPollSentAt = Date.now();
            if (window.gameplay && typeof window.gameplay.showToast === "function") {
              window.gameplay.showToast("LIFTOFF CHECK SENT TO EARTH CONTROL (8s AUTO-START · PRESS [L] AGAIN TO LAUNCH NOW)");
            }
            this._renderGroundHUD();
            return;
          }
          return;
        }
      }

      if (!isGround) this.siteTourActive = false;
      this._launchSequenceStarted = true;
      this.missionPhase = "launch";
      this.autoLaunchRemaining = null;
      this._autoLaunchPollSent = false;

      if (!this.dockLocked && !isGround) this.toggleBoardingDock(true, { fromNetwork, broadcast });
      if (!this.crewBoarded && !isGround) this.boardSpacecraft({ fromNetwork, broadcast });

      if (!fromNetwork && broadcast && window.netManager && typeof window.netManager.requestLaunch === "function") {
        window.netManager.requestLaunch();
      }

      this.isLaunching = true;
      this.launchTime = 0.0;
      this.targetDockSwingAngle = 0.45;

      if (window.spaceAudio) {
        window.spaceAudio.playCountdownBeep(false);
      }

      if (this.delugeWaterMesh && this.delugeWaterMesh.material) {
        this.delugeWaterMesh.material.opacity = 0.85;
      }
      if (this.steamPlumes) {
        this.steamPlumes.forEach((s) => {
          if (s.material) s.material.opacity = 0.75;
        });
      }

      if (isGround) {
        this._groundObserverLaunch = true;
        this.isGroundMode = true;
        document.body.classList.add("ground-mode-active");
        this._syncSpaceGamesLock();
        this._applyGroundAtmosphere();
        if (this.group) this.group.visible = true;
        if (this.stackGroup) {
          this.stackGroup.visible = true;
          this.stackGroup.position.set(0, 20.2, 0);
          this.stackGroup.rotation.set(0, 0, 0);
        }
        if (this.flamePlumes) {
          this.flamePlumes.forEach((p) => { p.visible = true; });
        }
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.visible = true;
        }
        if (this.hudOverlay) this.hudOverlay.style.display = "flex";
        this._renderGroundHUD();
        if (this.lccConsoleOpen) this._renderLccConsole();
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("LIFTOFF AT LAUNCH PAD · WATCH ROCKET CLIMB · CONTROL CONSOLE [C]");
        }
        return;
      }

      this._groundObserverLaunch = false;
      this._renderGroundHUD();
      if (this.hudOverlay) this.hudOverlay.style.display = "none";
      this._applyGroundAtmosphere();
      if (this.group) this.group.visible = true;
      // The cinematic owns its own launch stack; hide the duplicate pad stack
      // but leave the pad, tower, deluge and service structures in view.
      if (this.stackGroup) this.stackGroup.visible = false;
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = false;
      }

      if (window.launchCutscene && typeof window.launchCutscene.start === "function") {
        window.launchCutscene.start(this.scene, this.camera, this.renderer, (result) => {
          this.startOrbitalDockingPhase({
            naturalEnd: !!(result && result.naturalEnd),
            fromCutsceneSkip: !!(result && result.skipped)
          });
        });
      } else {
        if (this.group) this.group.visible = false;
        if (this.stackGroup) this.stackGroup.visible = true;
        this._restoreSpaceAtmosphere();
        this.startOrbitalDockingPhase({ naturalEnd: true });
      }
    }

    /**
     * After launch reaches orbit, Flight Crew controls Orbital Approach & Docking;
     * Ground Control monitors from Kennedy Space Center and issues Docking Clearance.
     */
    startOrbitalDockingPhase(options = {}) {
      const fromNetwork = !!options.fromNetwork;
      const broadcast = options.broadcast !== false;
      const naturalEnd = !!options.naturalEnd;
      const isGround = this._isLocalGroundCrew();

      if (isGround) {
        this._dockingPhaseStarted = true;
        this.missionPhase = "docking";
        this.isLaunching = false;
        this._groundObserverLaunch = false;
        this.isGroundMode = true;
        document.body.classList.add("ground-mode-active");
        this._syncSpaceGamesLock();
        if (this.group) this.group.visible = true;
        if (this.stackGroup) this.stackGroup.visible = false;
        if (this.flamePlumes) this.flamePlumes.forEach((p) => { p.visible = false; });
        if (this.delugeWaterMesh && this.delugeWaterMesh.material) this.delugeWaterMesh.material.opacity = 0;
        if (this.steamPlumes) this.steamPlumes.forEach((s) => { if (s.material) s.material.opacity = 0; });
        if (window.issGroup) window.issGroup.visible = false;
        if (window.photorealisticEarth && window.photorealisticEarth.group) window.photorealisticEarth.group.visible = false;
        if (window.shipInterior) window.shipInterior.hide();
        if (window.localCrew && window.localCrew.group) window.localCrew.group.visible = true;
        if (this.hudOverlay) this.hudOverlay.style.display = "flex";
        this._renderGroundHUD();
        if (this.lccConsoleOpen) this._renderLccConsole();
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("APPROACHING STATION · APPROVE SAFE DOCKING IN CONTROL CONSOLE [C]");
        }
        return;
      }

      if (this._stationEntered) return;
      if (this._dockingPhaseStarted || (window.dockingSim && window.dockingSim.isActive)) return;

      this.siteTourActive = false;
      this._dockingPhaseStarted = true;
      this.missionPhase = "docking";
      this.isLaunching = false;
      this.isGroundMode = false;
      document.body.classList.remove("ground-mode-active");
      this._syncSpaceGamesLock();
      if (this.group) this.group.visible = false;
      if (this.hudOverlay) this.hudOverlay.style.display = "none";
      this._restoreSpaceAtmosphere();

      if (!fromNetwork && broadcast && window.netManager && typeof window.netManager.beginDockingPhase === "function") {
        window.netManager.beginDockingPhase({ naturalEnd });
      }

      if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();

      if (window.issGroup) window.issGroup.visible = true;
      if (window.photorealisticEarth && window.photorealisticEarth.group) {
        window.photorealisticEarth.group.visible = true;
      }
      if (window.shipInterior) {
        window.shipInterior.hide();
      }
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = false;
      }

      if (window.dockingSim && typeof window.dockingSim.start === "function") {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("REACHED SPACE ORBIT · LINE UP & DOCK WITH THE STATION DOOR");
        }
        window.dockingSim.start(this.scene, this.camera, null, (info) => {
          this.completeDockingAndEnterStation({ corridorCapture: !!(info && info.corridorCapture) });
        });
      } else {
        this.completeDockingAndEnterStation({ corridorCapture: true });
      }
    }

    /**
     * Once docked with the ISS, hide the exterior ISS (since we are now INSIDE it!)
     * and transition the whole crew into the 6-room Station Interior.
     */
    completeDockingAndEnterStation(options = {}) {
      const fromNetwork = !!options.fromNetwork;
      const broadcast = options.broadcast !== false;
      const isGround = this._isLocalGroundCrew();

      if (isGround) {
        const firstEntry = !this._stationEntered;
        this._stationEntered = true;
        this.missionPhase = "station";
        this.isLaunching = false;
        this._groundObserverLaunch = false;
        this.isGroundMode = true;
        document.body.classList.add("ground-mode-active");
        this._syncSpaceGamesLock();
        if (this.group) this.group.visible = true;
        if (this.stackGroup) this.stackGroup.visible = false;
        if (this.flamePlumes) this.flamePlumes.forEach((p) => { p.visible = false; });
        if (this.delugeWaterMesh && this.delugeWaterMesh.material) this.delugeWaterMesh.material.opacity = 0;
        if (this.steamPlumes) this.steamPlumes.forEach((s) => { if (s.material) s.material.opacity = 0; });
        if (window.issGroup) window.issGroup.visible = false;
        if (window.photorealisticEarth && window.photorealisticEarth.group) window.photorealisticEarth.group.visible = false;
        if (window.shipInterior) window.shipInterior.hide();
        if (window.localCrew && window.localCrew.group) window.localCrew.group.visible = true;
        if (this.hudOverlay) this.hudOverlay.style.display = "flex";
        this._renderGroundHUD();
        if (this.lccConsoleOpen) this._renderLccConsole();
        if (firstEntry && window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("CREW DOCKED AT SPACE STATION · HELP TEAM FROM CONTROL CONSOLE [C]");
        }
        return;
      }

      if (this._stationEntered) {
        // A network snapshot can arrive while the local docking callback is
        // still pending; make sure the interior is visible but do not re-toast.
        if (window.shipInterior) window.shipInterior.show();
        return;
      }

      this.siteTourActive = false;
      this._stationEntered = true;
      this.missionPhase = "station";
      this.isLaunching = false;
      this.isGroundMode = false;
      document.body.classList.remove("ground-mode-active");
      this._syncSpaceGamesLock();
      if (this.group) this.group.visible = false;
      if (this.hudOverlay) this.hudOverlay.style.display = "none";
      this._restoreSpaceAtmosphere();

      // If another astronaut docked while this client was still watching the
      // ascent cinematic, cancel the cinematic cleanly without triggering docking callback.
      if (window.launchCutscene && window.launchCutscene.isPlaying) {
        if (typeof window.launchCutscene.cancel === "function") {
          window.launchCutscene.cancel();
        } else if (typeof window.launchCutscene.finish === "function") {
          window.launchCutscene.finish({ naturalEnd: false, skipped: false });
        }
      }

      if (window.dockingSim && window.dockingSim.isActive) {
        window.dockingSim.stop();
      }

      if (!fromNetwork && broadcast && window.netManager && typeof window.netManager.completeDocking === "function") {
        window.netManager.completeDocking({ corridorCapture: !!(options && options.corridorCapture) });
      }

      if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();

      // CRITICAL: Hide exterior ISS model when inside the station so we never see the ISS outside our own window!
      if (window.issGroup) {
        window.issGroup.visible = false;
      }
      if (window.photorealisticEarth && window.photorealisticEarth.group) {
        window.photorealisticEarth.group.visible = true;
      }

      if (window.shipInterior) {
        window.shipInterior.show();
      }

      // Give every astronaut a unique berth around the Transit Hub instead of
      // stacking the whole crew on the same tile.
      const spawn = this._stationSpawnForIndex(this._localPlayerIndex());
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = true;
        window.localCrew.group.position.set(spawn.x, spawn.y, spawn.z);
        window.localCrew.group.rotation.y = spawn.yaw;
      }
      this._syncRemoteCrewSpawns("station");

      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(spawn.yaw, -0.18);
      }

      if (!fromNetwork && window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast("DOCKING LOCKED · WELCOME INSIDE THE SPACE STATION!");
      }
    }

    /**
     * Requests a shared crew reset back to Launch Pad. The server is authoritative
     * so every astronaut returns to the gantry together; solo/offline sessions
     * fall back to a purely local reset.
     */
    requestMissionReset() {
      if (this.missionPhase === "gantry" && this.isGroundMode) {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("ALREADY AT LAUNCH PAD · FOLLOW THE MARKERS TO THE BOARDING BRIDGE AND SPACESHIP DOOR");
        }
        return false;
      }

      const confirmed = typeof window.confirm !== "function" ||
        window.confirm("Send the whole crew back to the Launch Pad? This restarts the trip from ground for everyone.");
      if (!confirmed) return false;

      const nm = window.netManager;
      if (nm && nm.roomId && typeof nm.resetMission === "function") {
        nm.resetMission();
        return true;
      }

      this._resetToGantryLocally();
      return true;
    }

    _resetToGantryLocally() {
      const localMission = {
        phase: "gantry",
        dockLocked: false,
        boarded: []
      };
      this._launchSequenceStarted = false;
      this._dockingPhaseStarted = false;
      this._stationEntered = false;
      this._groundObserverLaunch = false;
      this._autoLaunchPollSent = false;
      this._localPollSentAt = 0;
      this.isGroundMode = false;
      this.lccConsoleOpen = false;
      if (this.lccConsoleOverlay) this.lccConsoleOverlay.style.display = "none";
      document.body.classList.remove("ground-mode-active");
      this._syncSpaceGamesLock();
      if (window.launchCutscene && window.launchCutscene.isPlaying && typeof window.launchCutscene.cancel === "function") {
        window.launchCutscene.cancel();
      }
      if (window.dockingSim && window.dockingSim.isActive) {
        window.dockingSim.stop();
      }
      if (window.shipInterior) {
        window.shipInterior.hide();
      }
      this.enterSpaceCenter(localMission);
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast("CREW RETURNED TO THE LAUNCH PAD");
      }
    }

    /**
     * Backward-compatible entry point used by the [G] shortcut and the station
     * HUD button. Now always performs a shared, server-authoritative reset.
     */
    toggleGroundOrbit() {
      return this.requestMissionReset();
    }

    update(delta, camera, elapsed) {
      const clockElapsed = typeof elapsed === "number" ? elapsed : performance.now() * 0.001;
      if (this.beaconLight) {
        this.beaconLight.intensity = Math.sin(Date.now() * 0.006) > 0.5 ? 3.0 : 0.0;
      }

      // ── Elevator animation ──────────────────────────────────────────────────
      if (this.elevatorMoving && this.elevatorCab && this._elevatorConfig) {
        const cfg = this._elevatorConfig;
        const speed = 12.0; // metres per second smooth lift
        const diff  = this.elevatorTargetY - this.elevatorY;
        const step  = Math.sign(diff) * Math.min(Math.abs(diff), speed * delta);
        this.elevatorY += step;
        this.elevatorCab.position.y = this.elevatorY;

        // Status strip: amber while moving
        if (this._elevatorLightMat) {
          this._elevatorLightMat.color.setHex(0xf59e0b);
          this._elevatorLightMat.emissive.setHex(0xf59e0b);
        }

        // Carry the player smoothly inside the cab if riding
        if (this.elevatorRidingPlayer) {
          const worldY = 19.8 + this.elevatorY;
          if (window.localCrew && window.localCrew.group) {
            window.localCrew.group.position.set(-42.2, worldY, -4.0);
          }
          if (this.camera) {
            this.camera.position.set(-42.2, worldY + 1.48, -4.0);
          }
        }

        // Arrived?
        if (Math.abs(diff) < 0.05) {
          this.elevatorY = this.elevatorTargetY;
          this.elevatorCab.position.y = this.elevatorY;
          this.elevatorMoving = false;

          const arrivedGantry = Math.abs(this.elevatorY - 44.0) < 2.0;
          const arrivedTop    = Math.abs(this.elevatorY - 88.0) < 2.0;
          const arrivedGround = Math.abs(this.elevatorY - (-7.3)) < 2.0 || Math.abs(this.elevatorY - 0.0) < 2.0;

          if (this._elevatorLightMat) {
            const col = arrivedGround ? 0x38bdf8 : (arrivedGantry ? 0x34d399 : 0xfacc15);
            this._elevatorLightMat.color.setHex(col);
            this._elevatorLightMat.emissive.setHex(col);
          }

          if (window.spaceAudio && typeof window.spaceAudio.playAirlockCycle === "function") {
            window.spaceAudio.playAirlockCycle();
          }

          if (this.elevatorRidingPlayer) {
            this.elevatorRidingPlayer = false;

            if (arrivedGantry) {
              if (window.localCrew && window.localCrew.group) {
                window.localCrew.group.position.set(-40.2, 64.1, -4.0);
                window.localCrew.group.rotation.y = Math.PI / 2;
              }
              if (typeof window.setCameraYawPitch === "function") {
                window.setCameraYawPitch(Math.PI / 2, 0.0);
              }
              if (window.gameplay && typeof window.gameplay.showToast === "function") {
                window.gameplay.showToast("🛗 GANTRY LEVEL (44m) — Walk east across catwalk to extend Orbiter Access Arm [F] & board [E]");
              }
            } else if (arrivedTop) {
              if (window.localCrew && window.localCrew.group) {
                window.localCrew.group.position.set(-40.2, 108.1, -4.0);
                window.localCrew.group.rotation.y = Math.PI / 2;
              }
              if (typeof window.setCameraYawPitch === "function") {
                window.setCameraYawPitch(Math.PI / 2, 0.0);
              }
              if (window.gameplay && typeof window.gameplay.showToast === "function") {
                window.gameplay.showToast("🛗 TOWER TOP DECK (88m / 300 FT) — 360° observation deck under the lightning mast spire");
              }
            } else {
              if (window.localCrew && window.localCrew.group) {
                window.localCrew.group.position.set(-41.0, 12.5, -4.0);
                window.localCrew.group.rotation.y = -Math.PI / 2;
              }
              if (typeof window.setCameraYawPitch === "function") {
                window.setCameraYawPitch(-Math.PI / 2, 0.0);
              }
              if (window.gameplay && typeof window.gameplay.showToast === "function") {
                window.gameplay.showToast("🛗 PAD GROUND LEVEL — Elevator doors open onto Pad 39A Hardstand");
              }
            }
          } else {
            // Cab arrived after being called by a player waiting at the call station
            if (window.gameplay && typeof window.gameplay.showToast === "function") {
              const floorLabel = arrivedTop ? "TOWER TOP (88m)" : (arrivedGantry ? "GANTRY LEVEL (44m)" : "PAD GROUND LEVEL");
              window.gameplay.showToast(`🛗 ELEVATOR ARRIVED AT ${floorLabel} — Press [E] or [G] to ride`);
            }
          }

          this._renderGroundHUD();
        }
      }
      // ───────────────────────────────────────────────────────────────────────

      // Smoothly swing the Player-Controlled Orbiter Access Arm (OAA)
      if (this.armPivotGroup) {
        const diff = this.targetDockSwingAngle - this.dockSwingAngle;
        if (Math.abs(diff) > 0.001) {
          this.dockSwingAngle += diff * Math.min(1, delta * 4.5);
          this.armPivotGroup.rotation.y = this.dockSwingAngle;
        }
      }

      // Smoothly swing the GOX Vent Arm & Beanie Cap (retracts during launch)
      if (this.goxVentArm) {
        const targetGoxAngle = this.isLaunching ? -0.55 : 0.0;
        if (Math.abs(this.goxVentArm.rotation.y - targetGoxAngle) > 0.001) {
          this.goxVentArm.rotation.y += (targetGoxAngle - this.goxVentArm.rotation.y) * Math.min(1, delta * 2.5);
        }
      }

      // ── Launch Control Center (LCC) entrance doors animation ────────────────
      if (this.lccDoors) {
        const d = this.lccDoors;
        const diff = d.target - d.progress;
        if (Math.abs(diff) > 0.0005) {
          const step = Math.sign(diff) * Math.min(Math.abs(diff), delta * 2.8);
          d.progress += step;
          if (Math.abs(d.target - d.progress) < 0.002) {
            d.progress = d.target;
          }
          if (d.leftDoor) {
            d.leftDoor.position.x = d.leftBaseX - d.progress * d.slideDist;
          }
          if (d.rightDoor) {
            d.rightDoor.position.x = d.rightBaseX + d.progress * d.slideDist;
          }
          if (d.statusMat) {
            const p = d.progress;
            const r = (0xef * (1 - p) + 0x22 * p) / 255;
            const g = (0x44 * (1 - p) + 0xc5 * p) / 255;
            const b = (0x44 * (1 - p) + 0x5e * p) / 255;
            d.statusMat.color.setRGB(r, g, b);
            d.statusMat.emissive.setRGB(r * 0.85, g * 0.85, b * 0.85);
          }
          if (d.markerMat) {
            d.markerMat.color.setHex(d.progress > 0.5 ? 0x22c55e : 0x38bdf8);
            d.markerMat.opacity = 0.55 + 0.35 * Math.sin(clockElapsed * 3.5);
          }
        } else if (d.markerMat) {
          d.markerMat.opacity = 0.55 + 0.35 * Math.sin(clockElapsed * 3.5);
        }
      }

      // Guided boarding objectives, proximity triggers and auto-liftoff.
      this._updateBoardingGuidance(delta, clockElapsed);

      // Launch-pad deluge, steam, and Ground Control rocket ascent animation.
      if (this.isLaunching) {
        this.launchTime += delta;
        const steamPulse = 0.65 + Math.sin(this.launchTime * 7.5) * 0.12;
        if (this.delugeWaterMesh && this.delugeWaterMesh.material) {
          this.delugeWaterMesh.material.opacity = Math.min(0.9, steamPulse);
        }
        if (this.steamPlumes) {
          this.steamPlumes.forEach((steam, i) => {
            if (!steam.material) return;
            steam.material.opacity = Math.min(0.82, steamPulse + Math.sin(this.launchTime * 4 + i) * 0.08);
            const grow = 1 + Math.sin(this.launchTime * 2.2 + i * 1.3) * 0.07;
            steam.scale.setScalar(grow);
          });
        }
        if (this._groundObserverLaunch && this.stackGroup && this.stackGroup.visible) {
          const tClimb = Math.max(0, this.launchTime - 0.8);
          const nextY = 20.2 + 0.9 * Math.pow(tClimb, 2.2);
          this.stackGroup.position.y = nextY;
          if (this.launchTime > 6.0) {
            this.stackGroup.rotation.z = -Math.min(0.32, (this.launchTime - 6.0) * 0.016);
          }
          if (nextY > 2200) {
            this.stackGroup.visible = false;
            if (this.flamePlumes) this.flamePlumes.forEach((p) => { p.visible = false; });
          }
        }
      }

      // Soft cloud drift, ocean wave shimmer, surf cycle & snapped shadow focus.
      if (this.isGroundMode) {
        if (this.clouds.length) {
          const drift = delta * 1.15;
          this.clouds.forEach((cloud, i) => {
            cloud.position.x += drift * (0.6 + (i % 3) * 0.12);
            if (cloud.position.x > 900) cloud.position.x = -750;
          });
        }
        if (this.oceanTex) {
          this.oceanTex.offset.x = (this.oceanTex.offset.x - delta * 0.014) % 1;
          this.oceanTex.offset.y = (this.oceanTex.offset.y + delta * 0.008) % 1;
        }
        if (this.surfLines && this.surfLines.length) {
          this.surfLines.forEach((surf) => {
            const u = surf.userData || {};
            const wave = Math.sin(clockElapsed * 1.15 + (u.phase || 0));
            surf.position.x = (u.baseX || 518) + wave * 2.4;
            if (surf.material) {
              surf.material.opacity = Math.max(0.18, (u.baseOpacity || 0.5) + wave * 0.2);
            }
          });
        }
        this._updateSunShadowFocus(camera ? camera.position : null);
      }
    }
  }

  window.SpaceCenterManager = SpaceCenterManager;
  window.spaceCenter = new SpaceCenterManager();
})(window);
