/**
 * ============================================================================
 * INTERFELLAS NASA KENNEDY SPACE CENTER (LC-39A) & PLAYER-CONTROLLED BOARDING DOCK
 * ============================================================================
 * Production-grade 3D Space Center starting environment & pre-flight sequence:
 * 1. Starts players at Kennedy Space Center Launch Complex 39A (Ground & Gantry).
 * 2. Guided boarding flow with no manual dock/launch buttons:
 *    - A glowing marker at the Access Arm Control extends & locks the bridge
 *      automatically when a crew member walks up to it.
 *    - A second marker at the orbiter hatch walks the crew across the White Room;
 *      boarding triggers automatically at the hatch.
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
      this.openCar = null;              // Drivable open-top NASA ground car

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

      this._buildCoastalTerrain();
      this._buildLaunchPad39A();
      this._buildLaunchTowerAndBoardingDock();
      this._buildWaterDelugeSystem();
      this._buildLaunchStack();
      this._buildBoardingGuidance();
      this._buildPerimeterLighting();

      if (window.SpaceCenterSite) {
        this.site = new window.SpaceCenterSite(this);
        this.site.build();
      }

      // Drivable open-top NASA car parked beside the Pad 39A ground spawn.
      if (window.SpaceCenterOpenCar) {
        this.openCar = new window.SpaceCenterOpenCar(this);
        this.openCar.build();
        window.spaceCenterCar = this.openCar;
      }

      this._setupGroundUI();

      console.log("[SpaceCenter] Kennedy Space Center LC-39A & Player Boarding Dock ready.");
    }

    // ============================================================================
    // SHARED HELPERS
    // ============================================================================
    _makeCanvasTexture(size, draw, repeatX = 1, repeatY = 1) {
      const THREE = window.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      draw(ctx, size);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = this.renderer && this.renderer.capabilities
        ? Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        : 1;
      if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
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
        for (let i = 0; i < 16; i++) {
          const shades = ["rgba(56,82,42,0.22)", "rgba(88,118,58,0.18)", "rgba(98,108,64,0.14)"];
          ctx.fillStyle = shades[i % shades.length];
          ctx.beginPath();
          ctx.ellipse(Math.random() * s, Math.random() * s, 26 + Math.random() * 64, 22 + Math.random() * 58, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 11000; i++) {
          const g = 74 + Math.floor(Math.random() * 52);
          ctx.fillStyle = `rgba(${g - 24},${g + 4},${g - 34},${0.16 + Math.random() * 0.22})`;
          ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.2, 1 + Math.random() * 2.8);
        }
      }, 54, 58);
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
    _handleElevatorKey() {
      if (!this.elevatorCab || !this._elevatorConfig) return;
      const cfg = this._elevatorConfig;

      // World position of elevator base = towerGroup.position + (ELV_X, 0, ELV_Z)
      // towerGroup is at padGroup(-34, 19.8, 0); padGroup is at scene origin.
      const elevWorldX = -34 + cfg.x;
      const elevWorldZ = 0  + cfg.z;
      const gantryY    = 64.1; // world Y of gantry deck
      const groundY    = 19.8; // world Y of pad ground level

      // Current player world position
      const cam = this.camera;
      if (!cam) return;
      const px = cam.position.x;
      const pz = cam.position.z;
      const py = cam.position.y;

      const groundDist = Math.sqrt((px - elevWorldX) ** 2 + (pz - elevWorldZ) ** 2);
      const atGround   = py < groundY + 5  && groundDist < 7;
      const atGantry   = py >= groundY - 2 && groundDist < 10;

      if (this.elevatorMoving) {
        // Pressing G while moving: cancel / stop (player teleports to nearest floor)
        this.elevatorMoving = false;
        this.elevatorRidingPlayer = false;
        return;
      }

      if (atGround) {
        // Call elevator down (if needed) then ride up
        this.elevatorTargetY = cfg.top;
        this.elevatorMoving  = true;
        this.elevatorRidingPlayer = true;
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 ELEVATOR: Ascending to Gantry Level — stand clear of doors");
        }
      } else if (atGantry) {
        // Send elevator back down
        this.elevatorTargetY = cfg.bottom;
        this.elevatorMoving  = true;
        this.elevatorRidingPlayer = true;
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 ELEVATOR: Descending to Ground Level");
        }
      } else {
        // Too far — hint
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("🛗 Walk to the ELEVATOR on the west side of the tower, then press [G]");
        }
      }
    }

    _updateSunShadowFocus(camPos) {
      if (!this.isGroundMode || !window.sunLight || !window.sunLight.castShadow) return;
      const sun = window.sunLight;
      const focusX = camPos ? Math.max(-420, Math.min(480, camPos.x)) : 0;
      const focusZ = camPos ? Math.max(-220, Math.min(720, camPos.z)) : 0;
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
      for (let i = 0; i < 10; i++) {
        const cloud = new THREE.Group();
        const puffs = 3 + Math.floor(Math.random() * 4);
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
        new THREE.CylinderGeometry(134.8, 136.2, 0.16, 64, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xa4acb2, roughness: 0.92, metalness: 0.04, side: THREE.DoubleSide })
      );
      apronCurb.position.set(0, 0.02, 0);
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
      for (let z = -960; z <= 960; z += 42) {
        const jx = 472 + Math.sin(z * 0.17) * 5;
        const dune = new THREE.Mesh(duneGeo, duneMat);
        dune.scale.set(1.25, 0.55 + (Math.cos(z * 0.23) + 1) * 0.35, 2.8);
        dune.position.set(jx, -0.08, z);
        dune.receiveShadow = true;
        terrainGroup.add(dune);

        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 0), duneScrubMat);
        bush.scale.set(1.5, 0.55, 1.4);
        bush.position.set(jx - 3.2, 0.52, z + 6);
        bush.castShadow = true;
        terrainGroup.add(bush);
      }

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
      padBerm.receiveShadow = true;
      padBerm.castShadow = true;
      this.padGroup.add(padBerm);

      // Concrete retaining wall collar around berm crest.
      const collarTex = this._makeConcreteTexture(512, "#879199");
      collarTex.repeat.set(8, 1);
      const collarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: collarTex, roughness: 0.9, metalness: 0.08 });
      const padCollar = new THREE.Mesh(new THREE.CylinderGeometry(65.6, 67.0, 0.55, 8), collarMat);
      padCollar.position.set(0, 12.14, 0);
      padCollar.receiveShadow = true;
      this.padGroup.add(padCollar);

      const topApronTex = this._makeConcreteTexture(512, "#97a0a8");
      topApronTex.repeat.set(6, 6);
      const topApron = new THREE.Mesh(
        new THREE.CylinderGeometry(64.6, 65.2, 0.62, 8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: topApronTex, roughness: 0.88, metalness: 0.1 })
      );
      topApron.position.set(0, 12.19, 0);
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

      // Crawlerway approach ramp from south apron (z=186, y=0.08) to Pad top (z=61, y=12.50).
      const rampTex = this._makeConcreteTexture(512, "#808991");
      rampTex.repeat.set(2, 5);
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(30, 1.4, 125.6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, map: rampTex, roughness: 0.92, metalness: 0.05 })
      );
      ramp.rotation.x = 0.0994;
      ramp.position.set(0, 5.65, 123.5);
      ramp.receiveShadow = true;
      this.padGroup.add(ramp);

      // Sloped grass wing embankments flanking the crawlerway ramp so it seats naturally.
      [-21, 21].forEach((sx) => {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 4.8, 118), bermMat);
        wing.rotation.x = 0.0994;
        wing.position.set(sx, 3.75, 122);
        wing.receiveShadow = true;
        this.padGroup.add(wing);
      });

      const rampEdgeMat = new THREE.MeshStandardMaterial({ color: 0x4b5560, roughness: 0.86, metalness: 0.14 });
      [-15.4, 15.4].forEach((x) => {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 125.6), rampEdgeMat);
        edge.rotation.x = 0.0994;
        edge.position.set(x, 6.25, 123.5);
        edge.castShadow = true;
        edge.receiveShadow = true;
        this.padGroup.add(edge);
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
      const railGeoX = new THREE.BoxGeometry(49.2, 1.15, 0.32);
      const railGeoZ = new THREE.BoxGeometry(0.32, 1.15, 40.6);
      const railMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.35 });
      const railFwd = new THREE.Mesh(railGeoX, railMat);
      railFwd.position.set(0, 20.38, 20.34);
      const railAft = new THREE.Mesh(railGeoX, railMat);
      railAft.position.set(0, 20.38, -20.34);
      const railEast = new THREE.Mesh(railGeoZ, railMat);
      railEast.position.set(24.34, 20.38, 0);
      const railWest = new THREE.Mesh(railGeoZ, railMat);
      railWest.position.set(-24.34, 20.38, 0);
      this.padGroup.add(railFwd, railAft, railEast, railWest);

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
      // ── FUNCTIONAL ELEVATOR SYSTEM ──────────────────────────────────────────
      // Elevator shaft on the west face of the tower.
      // Shaft centre: X=-9, Z=4 in towerGroup space.
      // Rides from Y=0 (ground) to Y=44 (gantry deck).
      // ════════════════════════════════════════════════════════════════════════
      const ELV_X = -9, ELV_Z = 4;
      const ELV_BOTTOM = 0, ELV_TOP = 44;

      // Shaft rails (two vertical I-beams)
      const shaftMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.6, metalness: 0.75 });
      this._makeBeam(this.towerGroup, 0.3, towerHeight, 0.3, ELV_X - 1.2, towerHeight / 2, ELV_Z, shaftMat);
      this._makeBeam(this.towerGroup, 0.3, towerHeight, 0.3, ELV_X + 1.2, towerHeight / 2, ELV_Z, shaftMat);
      // Shaft cross ties
      for (let y = 8; y <= towerHeight; y += 8) {
        this._makeBeam(this.towerGroup, 2.6, 0.18, 0.18, ELV_X, y, ELV_Z, shaftMat);
      }

      // Elevator cabin (animated group)
      this.elevatorCab = new THREE.Group();
      this.elevatorCab.name = "ElevatorCab";
      this.elevatorCab.position.set(ELV_X, ELV_BOTTOM, ELV_Z);
      this.towerGroup.add(this.elevatorCab);

      // Cabin walls — steel + glass
      const cabSteel = new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.5, metalness: 0.75 });
      const cabGlass = new THREE.MeshStandardMaterial({
        color: 0x80deea, roughness: 0.1, metalness: 0.0,
        transparent: true, opacity: 0.42, side: THREE.DoubleSide
      });
      // Floor
      const cabFloor = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.4), cabSteel);
      cabFloor.position.set(0, 0.06, 0);
      this.elevatorCab.add(cabFloor);
      // Ceiling
      const cabCeil = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.4), cabSteel);
      cabCeil.position.set(0, 2.5, 0);
      this.elevatorCab.add(cabCeil);
      // Back wall (steel)
      const cabBack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 0.12), cabSteel);
      cabBack.position.set(0, 1.25, -1.2);
      this.elevatorCab.add(cabBack);
      // Side walls (glass)
      [-1.3, 1.3].forEach(x => {
        const sw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 2.4), cabGlass);
        sw.position.set(x, 1.25, 0);
        this.elevatorCab.add(sw);
      });
      // Front glass (facing tower exterior)
      const cabFront = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 0.08), cabGlass);
      cabFront.position.set(0, 1.25, 1.2);
      this.elevatorCab.add(cabFront);
      // Corner pillars
      [[-1.25, -1.1], [1.25, -1.1], [-1.25, 1.1], [1.25, 1.1]].forEach(([px, pz]) => {
        const cp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.65, 0.14), cabSteel);
        cp.position.set(px, 1.25, pz);
        this.elevatorCab.add(cp);
      });
      // Interior ambient light inside cab
      const cabLight = new THREE.PointLight(0xfff5e0, 0.9, 6);
      cabLight.position.set(0, 2.2, 0);
      this.elevatorCab.add(cabLight);
      // Cabin status strip (green = at gantry, amber = moving, red = at ground)
      this._elevatorLightMat = new THREE.MeshStandardMaterial({
        color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 2.0
      });
      const cabStatus = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.08), this._elevatorLightMat);
      cabStatus.position.set(0, 2.45, -1.14);
      this.elevatorCab.add(cabStatus);

      // ── Ground-level call panel ──
      const callPanelGroup = new THREE.Group();
      callPanelGroup.name = "ElevatorCallPanel";
      callPanelGroup.position.set(ELV_X - 1.6, 2.0, ELV_Z + 1.6);
      this.towerGroup.add(callPanelGroup);
      const cpBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.12),
        new THREE.MeshStandardMaterial({ color: 0x1c2a35, roughness: 0.45, metalness: 0.65 }));
      cpBase.position.set(0, 0, 0);
      callPanelGroup.add(cpBase);
      // Up button
      const btnMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 1.5 });
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12), btnMat);
      btn.rotation.x = Math.PI / 2;
      btn.position.set(0, 0.2, 0.08);
      callPanelGroup.add(btn);
      // "ELEVATOR" text texture label
      const lblCanvas = document.createElement("canvas");
      lblCanvas.width = 256; lblCanvas.height = 96;
      const lblCtx = lblCanvas.getContext("2d");
      lblCtx.fillStyle = "#0f172a";
      lblCtx.fillRect(0, 0, 256, 96);
      lblCtx.fillStyle = "#fbbf24";
      lblCtx.font = "bold 28px Arial";
      lblCtx.textAlign = "center";
      lblCtx.fillText("ELEVATOR", 128, 36);
      lblCtx.fillStyle = "#94a3b8";
      lblCtx.font = "18px Arial";
      lblCtx.fillText("[G] Call / Ride", 128, 68);
      const lblTex = new THREE.CanvasTexture(lblCanvas);
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshBasicMaterial({ map: lblTex, transparent: true }));
      lbl.position.set(0, -0.28, 0.07);
      callPanelGroup.add(lbl);

      // ── Gantry-level call panel (same design, at top) ──
      const callPanelTop = callPanelGroup.clone();
      callPanelTop.name = "ElevatorCallPanelTop";
      callPanelTop.position.set(ELV_X - 1.6, ELV_TOP + 2.0, ELV_Z + 1.6);
      this.towerGroup.add(callPanelTop);

      // Store elevator config for update() / key handler
      this._elevatorConfig = { x: ELV_X, z: ELV_Z, bottom: ELV_BOTTOM, top: ELV_TOP };
      this.elevatorY = ELV_BOTTOM;
      this.elevatorTargetY = ELV_BOTTOM;

      // ── [G] key → call elevator / ride ──
      if (!this._elevatorKeyBound) {
        this._elevatorKeyBound = true;
        window.addEventListener("keydown", (ev) => {
          if (!window.isGameStarted || !this.isGroundMode) return;
          if (ev.code !== "KeyG") return;
          if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) return;
          ev.preventDefault();
          this._handleElevatorKey();
        });
      }

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
      const railMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.55, metalness: 0.35 });
      const railPostMat = new THREE.MeshStandardMaterial({ color: 0x9aa8b3, roughness: 0.55, metalness: 0.45 });
      const railSegments = [
        { x: 1.5, z: 4.92, sx: 15.88, sz: 0.12, rotY: 0 },
        { x: 1.5, z: -12.92, sx: 15.88, sz: 0.12, rotY: 0 },
        { x: -6.42, z: -4.0, sx: 0.12, sz: 17.72, rotY: 0 },
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
        this._makeBeam(this.towerGroup, 0.08, 1.35, 0.08, -6.4, 44.7, z, railPostMat);
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
      const bridgeFloor = new THREE.Mesh(
        new THREE.BoxGeometry(19.0, 0.3, 2.8),
        new THREE.MeshStandardMaterial({ color: 0x8493a0, roughness: 0.65, metalness: 0.4 })
      );
      bridgeFloor.position.set(9.5, 0.15, 0);
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

      // Hammerhead crane at the top of the tower.
      const craneMast = new THREE.Mesh(new THREE.BoxGeometry(2.2, 14, 2.2), darkSteelMat);
      craneMast.position.set(0, 95, 0);
      this.towerGroup.add(craneMast);

      const jibMat = new THREE.MeshStandardMaterial({ color: 0x8b98a4, roughness: 0.52, metalness: 0.55 });
      this._makeBeam(this.towerGroup, 38, 0.9, 1.2, 8, 101.5, 0, jibMat);
      this._makeBeam(this.towerGroup, 0.7, 5.0, 0.7, -8.0, 98.2, 0, darkSteelMat);
      const counterweight = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, 3.2), deckMat);
      counterweight.position.set(-10.5, 98.0, 0);
      this.towerGroup.add(counterweight);

      const craneCab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 3.0), jibMat);
      craneCab.position.set(1.2, 98.4, 1.8);
      this.towerGroup.add(craneCab);

      const hookCable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 16, 6), darkSteelMat);
      hookCable.position.set(20, 93.5, 0);
      this.towerGroup.add(hookCable);
      const hookBlock = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.0), steelMat);
      hookBlock.position.set(20, 85.0, 0);
      this.towerGroup.add(hookBlock);

      // Lightning mast / beacon above the crane.
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.55, 30, 10),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.35 })
      );
      mast.position.set(0, 118, 0);
      this.towerGroup.add(mast);

      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xef4444,
        emissiveIntensity: 2.0
      });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), beaconMat);
      beacon.position.set(0, 133.4, 0);
      this.towerGroup.add(beacon);

      this.beaconLight = new THREE.PointLight(0xef4444, 2.0, 120);
      this.beaconLight.position.set(0, 128, 0);
      this.towerGroup.add(this.beaconLight);
    }

    // ============================================================================
    // 4. WATER DELUGE SOUND SUPPRESSION SYSTEM
    // ============================================================================
    _buildWaterDelugeSystem() {
      const THREE = window.THREE;
      const delugeGroup = new THREE.Group();
      delugeGroup.name = "WaterDelugeSystem";
      delugeGroup.position.set(78, 0, -70);
      this.padGroup.add(delugeGroup);

      const tankMat = new THREE.MeshStandardMaterial({ color: 0xdfe7ec, roughness: 0.5, metalness: 0.28 });
      const legMat = new THREE.MeshStandardMaterial({ color: 0x8d99a3, roughness: 0.55, metalness: 0.4 });

      // Four support legs and cross-braced water tower.
      const legGeo = new THREE.CylinderGeometry(0.7, 0.95, 45, 10);
      [
        [-8, -8], [8, -8], [-8, 8], [8, 8]
      ].forEach(([x, z]) => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(x, 22.5, z);
        delugeGroup.add(leg);
      });

      for (let y = 8; y <= 36; y += 9) {
        this._makeBeam(delugeGroup, 16, 0.28, 0.28, 0, y, -8, legMat);
        this._makeBeam(delugeGroup, 16, 0.28, 0.28, 0, y, 8, legMat);
        this._makeBeam(delugeGroup, 0.28, 0.28, 16, -8, y, 0, legMat);
        this._makeBeam(delugeGroup, 0.28, 0.28, 16, 8, y, 0, legMat);
      }
      this._makeBeam(delugeGroup, 22, 0.25, 0.25, 0, 22, -8, legMat, 0.62, 0, 0);
      this._makeBeam(delugeGroup, 22, 0.25, 0.25, 0, 22, 8, legMat, -0.62, 0, 0);

      const sphereTank = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 18), tankMat);
      sphereTank.position.set(0, 54, 0);
      delugeGroup.add(sphereTank);

      const tankBand = new THREE.Mesh(new THREE.CylinderGeometry(11.05, 11.05, 1.5, 32), new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6, metalness: 0.2 }));
      tankBand.position.set(0, 54, 0);
      delugeGroup.add(tankBand);

      // Vertical riser pipe down from the tank and across toward the pad.
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x9aa6b0, roughness: 0.45, metalness: 0.7 });
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 46, 10), pipeMat);
      riser.position.set(0, 31, 0);
      delugeGroup.add(riser);

      const feedPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 60, 8), pipeMat);
      feedPipe.rotation.z = Math.PI / 2;
      feedPipe.position.set(-30, 2.0, 0);
      delugeGroup.add(feedPipe);

      const delugeBase = new THREE.Mesh(new THREE.BoxGeometry(20, 1.6, 20), new THREE.MeshStandardMaterial({ color: 0x66727b, roughness: 0.9, metalness: 0.1 }));
      delugeBase.position.set(0, 0.8, 0);
      delugeGroup.add(delugeBase);

      const waterSprayMat = new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.0,
        roughness: 0.1
      });
      this.delugeWaterMesh = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 12, 16), waterSprayMat);
      this.delugeWaterMesh.position.set(0, 14, 0);
      // Keep the deluge effect at the pad, not under the water tower.
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

      const armMarker = this._createGuidanceMarker("1 · ACCESS ARM CONTROL", 0xfbbf24);
      armMarker.position.set(8.1, 44.42, -6.3);
      armMarker.userData.baseY = 44.42;
      this.towerGroup.add(armMarker);
      this.guidanceMarkers.arm = armMarker;

      const hatchMarker = this._createGuidanceMarker("2 · BOARD ORBITER", 0x67e8f9);
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
            label: "E · VAB SPACECRAFT INTEGRATION DESK",
            shortAction: "OPEN VAB INTEGRATION DESK [E]",
            action: "bus",
            color: 0x38bdf8
          },
          {
            id: "lcc_ops",
            x: -203.0,
            z: 180.5,
            y: 0.3,
            radius: 3.2,
            label: "E · LCC FLIGHT DIRECTOR OPS CONSOLE",
            shortAction: "OPEN LCC OPS CONSOLE [E]",
            action: "lcc_console",
            color: 0x3b82f6
          },
          {
            id: "mcc_flight_director",
            x: -68,
            z: 240.5,
            y: 0.3,
            radius: 4.6,
            label: "E · MCC FLIGHT DIRECTOR CONSOLE",
            shortAction: "FLIGHT DIRECTOR · MISSION CHARTER [E]",
            action: "mission",
            color: 0xfbbf24
          },
          {
            id: "mcc_ground_systems",
            x: -52,
            z: 240.5,
            y: 0.3,
            radius: 4.6,
            label: "E · MCC GROUND SYSTEMS CONSOLE",
            shortAction: "GROUND SYSTEMS · ORBIT & LINK [E]",
            action: "orbit",
            color: 0x67e8f9
          },
          {
            id: "lcc_fd",
            x: -208.3,
            z: 181,
            y: 0.3,
            radius: 4.6,
            label: "E · FIRING ROOM FLIGHT DIRECTOR",
            shortAction: "FIRING ROOM · MISSION CHARTER [E]",
            action: "mission",
            color: 0xfbbf24
          },
          {
            id: "lcc_gs",
            x: -197.7,
            z: 181,
            y: 0.3,
            radius: 4.6,
            label: "E · FIRING ROOM GROUND SYSTEMS",
            shortAction: "FIRING ROOM · ORBIT & LINK [E]",
            action: "orbit",
            color: 0x67e8f9
          },
          {
            id: "lcc_viz",
            x: -160,
            z: 188,
            y: 0.3,
            radius: 5.0,
            label: "E · LCC FLIGHT DYNAMICS & ORBIT VIZ",
            shortAction: "OPEN ORBIT VIZ [E]",
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

        const light = new THREE.SpotLight(0xfffbeb, 0.55, 165, Math.PI / 4, 0.55);
        light.position.set(lx, topY, lz);
        light.target.position.set(0, 48, 0);
        this.padGroup.add(light);
        this.padGroup.add(light.target);
        this.floodlights.push(light);
      });
    }

    // ============================================================================
    // 6. GROUND-LEVEL SITE TOUR (Space Center 2 web port)
    // ============================================================================
    _siteTourSpawn(index) {
      const spawns = (window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || [];
      return spawns[((index % spawns.length) + spawns.length) % spawns.length] || { x: 18, z: 150, yaw: Math.PI, label: "Pad 39A" };
    }

    enterSiteTour(index = 0) {
      const isGround = this._isLocalGroundCrew();
      if (!this.isGroundMode || (!isGround && (this.crewBoarded || this.isLaunching))) {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast(this.crewBoarded ? "CREW ALREADY ABOARD · RETURN TO GANTRY BEFORE TOURING" : "SITE TOUR UNAVAILABLE DURING LAUNCH");
        }
        return false;
      }
      if (!this.site) return false;
      this.siteTourActive = true;
      this.teleportSiteTour(index);
      if (window.spaceAudio) window.spaceAudio.playAirlockCycle();
      this._renderGroundHUD();
      return true;
    }

    exitSiteTour() {
      if (this.openCar) this.openCar.forceExit();
      this.siteTourActive = false;
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
          ? "RETURNED TO LCC FIRING ROOM · CONSOLE [C]"
          : "RETURNED TO THE GANTRY · BOARD THE ORBITER WHEN READY");
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
      // Fast travel must not leave the astronaut logically driver-seated far
      // away while the body teleports to another sector.
      if (this.openCar) this.openCar.forceExit();
      const spawns = (window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || [];
      const spawn = this._siteTourSpawn(index);
      const count = spawns.length || 6;
      this.siteTourIndex = ((index % count) + count) % count;
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = true;
        window.localCrew.group.position.set(spawn.x, 0.2, spawn.z);
        window.localCrew.group.rotation.y = spawn.yaw;
      }
      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(spawn.yaw, typeof spawn.pitch === "number" ? spawn.pitch : 0.04);
      }
      this._updateSunShadowFocus({ x: spawn.x, z: spawn.z });
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast(`SITE TOUR · ${spawn.label.toUpperCase()} · [1-${count}] FAST TRAVEL · [T] ${this._isLocalGroundCrew() ? "LCC ROOM" : "GANTRY"}`);
      }
      this._renderGroundHUD();
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
      let nx = Math.max(bounds.minX, Math.min(bounds.maxX, proposedPos.x));
      let nz = Math.max(bounds.minZ, Math.min(bounds.maxZ, proposedPos.z));

      const boxes = (this.site && this.site.boxColliders) || [];
      const circles = (this.site && this.site.circleColliders) || [];
      const blocked = (x, z) => {
        for (const box of boxes) {
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
      return new THREE.Vector3(nx, 0.2, nz);
    }

    // ============================================================================
    // 7. SPACE CENTER WALKABLE GANTRY & BOARDING BRIDGE COLLISION
    // ============================================================================
    resolveGroundCollision(currentPos, proposedPos) {
      const THREE = window.THREE;
      if (this.siteTourActive || this._isLocalGroundCrew()) {
        return this._resolveSiteTourCollision(currentPos, proposedPos);
      }
      // Gantry level Y = 64.1m
      const y = 64.1;
      const nx = proposedPos.x;
      const nz = proposedPos.z;
      const px = currentPos.x;
      const pz = currentPos.z;

      // Walkable Zone 1: Tower Gantry Staging Deck
      // (world x: -40.2 to -24.8, z: -12.7 to 4.7)
      const inGantry = nx >= -40.2 && nx <= -24.8 && nz >= -12.7 && nz <= 4.7;
      // Walkable Zone 2: Boarding Bridge / White Room when Dock is Extended
      // (world x: -25.5 to -3.6, z: -8.8 to -5.6)
      const inBridge = this.dockLocked && nx >= -25.5 && nx <= -3.6 && nz >= -8.8 && nz <= -5.6;

      // Already standing on the access arm: clamp both axes to the bridge
      // footprint. Without this, stepping toward the side edge made the old
      // code fall through to the deck clamp and snap the player several
      // metres back to x = -24.8.
      const wasOnBridge = this.dockLocked &&
        px >= -25.5 && px <= -3.6 && pz >= -8.8 && pz <= -5.6;
      if (wasOnBridge) {
        const armX = Math.max(-25.5, Math.min(-3.6, nx));
        const armZ = Math.max(-8.8, Math.min(-5.6, nz));
        if (!this.crewBoarded && armX >= -6.8) {
          this.boardSpacecraft();
        }
        return new THREE.Vector3(armX, y, armZ);
      }

      if (inGantry || inBridge) {
        // Board when the player crosses into the White Room at the orbiter
        // hatch end of the access arm.
        if (inBridge && !this.crewBoarded && nx >= -6.8) {
          this.boardSpacecraft();
        }
        return new THREE.Vector3(nx, y, nz);
      }

      // Leaving the deck on the east side is only allowed through the bridge
      // corridor; everywhere else is clamped to the gantry edge.
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
            if (e.code === "KeyM") {
              e.preventDefault();
              if (window.gameplay && typeof window.gameplay.openMissionPlannerFromGround === "function") {
                window.gameplay.openMissionPlannerFromGround();
              }
              return;
            }
            if (e.code === "KeyE") {
              const nearTerm = this._getNearbyFacilityTerminal();
              if (nearTerm) {
                e.preventDefault();
                this._activateFacilityTerminal(nearTerm);
                return;
              }
            }
            if (this.siteTourActive || isGround) return;
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

          if ((e.code === "KeyE" || e.code === "KeyB") && this.dockLocked && !this.crewBoarded && this.missionPhase === "gantry") {
            const distHatch = this._distanceToGuidancePoint(-7.8, -7.2);
            if (distHatch !== null && distHatch <= 2.6) {
              e.preventDefault();
              this.boardSpacecraft();
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

      // Belt-and-braces hatch trigger: boarding also completes when a crew
      // member reaches the glowing hatch marker, even if the collision clamp
      // has already stopped their forward step.
      if (this.dockLocked && !this.crewBoarded && crew && crew.visible && crew.position) {
        const distanceToHatch = Math.hypot(crew.position.x + 7.8, crew.position.z + 7.2);
        if (distanceToHatch <= 1.0) {
          this.boardSpacecraft();
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

      const armOwnerLabel = crewState.armOwner
        ? (crewState.armOwner.isSelf ? `YOU (${crewState.armOwner.roleShort})` : `${crewState.armOwner.roleShort} · ${crewState.armOwner.name}`)
        : "ENG";
      const launchAuthLabel = crewState.launchAuthority
        ? (crewState.launchAuthority.isSelf ? `YOU (${crewState.launchAuthority.roleShort})` : `${crewState.launchAuthority.roleShort} · ${crewState.launchAuthority.name}`)
        : "CMD";
      const unboardedNames = crewState.flightRoster.filter((p) => !p.isAboard).map((p) => p.name);

      let statusText = `LC-39A · STEP 1 (${armOwnerLabel}): ARM [F]`;
      let statusColor = "#93c5fd";
      let distance = null;
      let target = null;

      const nearTerm = (this.siteTourActive || isGround) ? this._getNearbyFacilityTerminal() : null;
      if (isGround) {
        if (nearTerm) {
          statusText = `${nearTerm.label} · [E] OPEN`;
          statusColor = "#60a5fa";
        } else if (this.missionPhase === "gantry") {
          if (pollActive) {
            statusText = "LAUNCH POLL ACTIVE · ISSUE GO/NO-GO IN LCC CONSOLE [C]";
            statusColor = "#fbbf24";
          } else {
            statusText = `LCC FIRING ROOM · FLIGHT ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · OPS CONSOLE [C]`;
            statusColor = gs.goNoGoLaunch ? "#86efac" : "#93c5fd";
          }
        } else if (this.missionPhase === "launch") {
          statusText = "T+ASCENT TELEMETRY LIVE · MONITOR PAD 39A LIFTOFF · CONSOLE [C]";
          statusColor = "#fca5a5";
        } else if (this.missionPhase === "docking") {
          statusText = gs.dockingClearance
            ? "ORBITAL DOCKING IN PROGRESS · CORRIDOR CLEARED · CONSOLE [C]"
            : "ORBITAL RENDEZVOUS · ISSUE DOCKING CLEARANCE [C]";
          statusColor = gs.dockingClearance ? "#86efac" : "#fbbf24";
        } else {
          statusText = "ORBITAL OPS · COORDINATE STATION CREW & DOWNLINK · CONSOLE [C]";
          statusColor = "#86efac";
        }
      } else if (this.siteTourActive) {
        const current = tourSpawns[this.siteTourIndex] || tourSpawns[0];
        if (nearTerm) {
          statusText = `${nearTerm.label} · [E] OPEN TERMINAL`;
          statusColor = "#60a5fa";
        } else {
          const loc = (current && (current.short || current.label) ? (current.short || current.label) : "PAD 39A").toUpperCase();
          const jumpRange = tourSpawns.length || 6;
          statusText = touchUI
            ? `SITE TOUR · ${loc}`
            : `SITE TOUR · ${loc} · [1-${jumpRange}] JUMP · [T] GANTRY`;
          statusColor = "#d0a15c";
        }
      } else if (this.isLaunching) {
        statusText = "T-0: MAIN ENGINE & BOOSTER IGNITION · LIFTOFF";
        statusColor = "#f87171";
      } else if (pollActive) {
        statusText = touchUI
          ? "AWAITING GROUND GO/NO-GO · TAP LAUNCH TO OVERRIDE"
          : "AWAITING GROUND GO/NO-GO (8s) · PRESS [L] AGAIN TO LAUNCH NOW";
        statusColor = "#fbbf24";
      } else if (!step1Done) {
        distance = this._distanceToGuidancePoint(-25.9, -6.3);
        target = "arm";
        statusText = `LC-39A · STEP 1 (${armOwnerLabel}): ARM [F]${distance !== null ? ` · ${Math.max(1, Math.round(distance))}m` : ""}`;
        statusColor = "#fbbf24";
      } else if (!step2Done) {
        distance = this._distanceToGuidancePoint(-7.8, -7.2);
        target = "hatch";
        statusText = `LC-39A · STEP 2: HATCH [E/B] (${crewState.aboardCount}/${crewState.crewTotal})${distance !== null ? ` · ${Math.max(1, Math.round(distance))}m` : ""}`;
        statusColor = "#93c5fd";
      } else if (this.autoLaunchRemaining !== null) {
        const seconds = Math.max(1, Math.ceil(this.autoLaunchRemaining));
        statusText = `ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · LIFTOFF IN ${seconds}s`;
        statusColor = "#86efac";
      } else if (crewState.allAboard) {
        statusText = gs.goNoGoLaunch
          ? `GO FOR LAUNCH · ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · IGNITION...`
          : `ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · POLLING LAUNCH...`;
        statusColor = "#86efac";
      } else {
        const waitingOn = unboardedNames.length ? `WAIT: ${unboardedNames.join(", ")} · ` : "";
        statusText = touchUI
          ? `ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · ${waitingOn}AUTH: ${launchAuthLabel}`
          : `ABOARD ${crewState.aboardCount}/${crewState.crewTotal} · ${waitingOn}${launchAuthLabel} [L]`;
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
        nearTerm,
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
            <button type="button" id="btn-sc-term-act" class="sc-hud-btn sc-btn-term" style="display:${guidance.nearTerm ? "inline-flex" : "none"};">
              ${guidance.nearTerm ? guidance.nearTerm.shortAction : "TERMINAL [E]"}
            </button>
            ${guidance.isGround ? `
              <button type="button" id="btn-sc-lcc-console" class="sc-hud-btn ${this.lccConsoleOpen ? "sc-btn-launch" : "sc-btn-term"}">
                ${this.lccConsoleOpen ? "CLOSE OPS [C]" : (guidance.pollActive ? "GO/NO-GO [C]" : "LCC OPS [C]")}
              </button>
            ` : `
              <button type="button" id="btn-sc-launch" class="sc-hud-btn sc-btn-launch" style="display:${guidance.canLaunchNow ? "inline-flex" : "none"};">
                ${guidance.pollActive ? (touchUI ? "OVERRIDE LAUNCH" : "OVERRIDE [L]") : (touchUI ? "LAUNCH" : "LAUNCH [L]")}
              </button>
            `}
            <button type="button" id="btn-sc-hud-toggle" class="sc-hud-btn sc-btn-collapse" title="${this.hudCollapsed ? "Expand LC-39A Dock" : "Minimize LC-39A Dock"}">
              ${this.hudCollapsed ? "+" : "-"}
            </button>
          </div>
        </div>

        <div class="sc-hud-body" style="display:${this.hudCollapsed ? "none" : "flex"};">
          <div class="sc-hud-tools">
            <button type="button" id="btn-sc-mission-plan" class="sc-hud-btn sc-btn-plan">
              ${touchUI ? "DESIGN" : "DESIGN [M]"}
            </button>
            <button type="button" id="btn-sc-mdl-desk" class="sc-hud-btn sc-btn-mdl">
              MDL DESK
            </button>
            <button type="button" id="btn-sc-cml-workbench" class="sc-hud-btn sc-btn-plan">
              CML GATE
            </button>
            <button type="button" id="btn-sc-orbit-viz" class="sc-hud-btn sc-btn-viz">
              ${touchUI ? "ORBIT VIZ" : "ORBIT VIZ [U]"}
            </button>
            ${guidance.isGround ? `
              <button type="button" id="btn-sc-return-lcc" class="sc-hud-btn sc-btn-tour">
                ${touchUI ? "LCC ROOM" : "LCC ROOM [T]"}
              </button>
            ` : `
              <button type="button" id="btn-sc-site-tour" class="sc-hud-btn sc-btn-tour">
                ${this.siteTourActive ? (touchUI ? "GANTRY" : "GANTRY [T]") : "SITE TOUR"}
              </button>
            `}
          </div>

          ${guidance.isGround ? `
            <div class="sc-ground-ops-strip">
              <button type="button" id="btn-gop-gonogo" class="ground-action-btn ${this._groundOpButtonAttrs(gs.goNoGoLaunch, guidance.pollActive)}" data-ground-op="go_nogo_launch">
                ${gs.goNoGoLaunch ? "GO LAUNCHED" : (guidance.pollActive ? "ISSUE GO/LAUNCH" : "PRE-CLEAR GO")}
              </button>
              <button type="button" id="btn-gop-dock" class="ground-action-btn ${this._groundOpButtonAttrs(gs.dockingClearance, this.missionPhase === "docking" && !gs.dockingClearance)}" data-ground-op="docking_clearance">
                ${gs.dockingClearance ? "DOCK CLEARED" : "CLEAR DOCKING"}
              </button>
              <button type="button" id="btn-gop-dsn" class="ground-action-btn ${this._groundOpButtonAttrs(gs.dsnLocked)}" data-ground-op="dsn_lock">
                ${gs.dsnLocked ? "DSN LOCKED" : "DSN LOCK"}
              </button>
              <button type="button" id="btn-gop-eps" class="ground-action-btn ${this._groundOpButtonAttrs(gs.powerRouted)}" data-ground-op="power_route">
                ${gs.powerRouted ? "EPS ROUTED" : "EPS ROUTE"}
              </button>
              <button type="button" id="btn-gop-sci" class="ground-action-btn ${this._groundOpButtonAttrs(gs.scienceCleared)}" data-ground-op="science_downlink">
                ${gs.scienceCleared ? "SCI DOWNLINK" : "SCI CLEAR"}
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

      const btnTermAct = this.hudOverlay.querySelector("#btn-sc-term-act");
      if (btnTermAct) {
        btnTermAct.style.display = guidance.nearTerm ? "inline-flex" : "none";
        if (guidance.nearTerm) btnTermAct.textContent = guidance.nearTerm.shortAction;
      }

      const btnLcc = this.hudOverlay.querySelector("#btn-sc-lcc-console");
      if (btnLcc) {
        btnLcc.textContent = this.lccConsoleOpen
          ? "CLOSE OPS [C]"
          : (guidance.pollActive ? "GO/NO-GO [C]" : "LCC OPS [C]");
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

      applyChip("sc-step-1", `1 · ARM [F]`, guidance.step1Done, !guidance.step1Done, {
        border: "rgba(217,119,6,0.65)",
        background: "rgba(217,119,6,0.16)",
        color: "#fde68a"
      });
      applyChip("sc-step-2", `2 · HATCH [E/B] (${guidance.aboardCount}/${guidance.crewTotal})`, guidance.step2Done, guidance.step1Done && !guidance.step2Done, {
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
          this._renderLccConsole();
        }
      }
      this._renderGroundHUD();
    }

    _syncLccConsoleLive() {
      if (!this.lccConsoleOverlay || !this.lccConsoleOpen) return;
      const mapWrap = this.lccConsoleOverlay.querySelector("#lcc-live-floorplan");
      if (mapWrap && window.shipInterior && typeof window.shipInterior.renderExternalFloorplanHtml === "function") {
        mapWrap.innerHTML = window.shipInterior.renderExternalFloorplanHtml(190);
      }
      const missionEl = this.lccConsoleOverlay.querySelector("#lcc-live-telemetry-readout");
      if (missionEl && window.gameplay && typeof window.gameplay.getGroundTelemetrySummary === "function") {
        const sum = window.gameplay.getGroundTelemetrySummary();
        missionEl.textContent = `PHASE ${String(this.missionPhase || "gantry").toUpperCase()} · CHECKLIST ${sum.completed}/${sum.total} · READINESS ${sum.readiness}%`;
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
        : `<div style="font-size:11px;color:#94a3b8;">Station floorplan telemetry online upon docking.</div>`;
      const activePing = gs.activePing;
      const pingValid = activePing && (Date.now() - (activePing.at || 0) < 20000);
      const roomButtons = [
        { id: "HUB", label: "HUB · HARMONY" },
        { id: "CMD", label: "CMD · CUPOLA" },
        { id: "PWR", label: "PWR · EPS BAY" },
        { id: "SCI", label: "SCI · LAB" },
        { id: "LSS", label: "LSS · DESTINY" },
        { id: "HULL", label: "HULL · COMMS" }
      ];

      this.lccConsoleOverlay.innerHTML = `
        <div class="ground-lcc-header">
          <div>
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1.6px;color:#93c5fd;">KENNEDY SPACE CENTER · FIRING ROOM 4</div>
            <div id="lcc-live-telemetry-readout" style="font-size:12px;font-weight:700;color:#f8fafc;margin-top:2px;">
              PHASE ${phaseUpper} · CHECKLIST ${sum.completed}/${sum.total} · READINESS ${sum.readiness}%
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            <button type="button" class="ground-action-btn" id="btn-lcc-open-viz">ORBIT VIZ [U]</button>
            <button type="button" class="ground-action-btn" id="btn-lcc-open-planner">ARCHITECTURE [M]</button>
            <button type="button" class="ground-action-btn" id="btn-lcc-cml-review" style="border-color:rgba(251,191,36,0.55);color:#fde68a;">CML ASSESSOR</button>
            <button type="button" class="ground-action-btn" id="btn-lcc-close">CLOSE [C]</button>
          </div>
        </div>

        ${pingValid ? `
          <div class="ground-ping-banner">
            <span>ACTIVE FLIGHT PING: <strong>${String(activePing.roomLabel || activePing.roomId || "HUB").toUpperCase()}</strong>${activePing.message ? ` · ${activePing.message}` : ""} (${activePing.byName || "LCC"})</span>
            <button type="button" class="ground-action-btn" id="btn-lcc-clear-ping">CLEAR PING</button>
          </div>
        ` : ""}

        <div class="ground-lcc-grid">
          <div class="ground-lcc-card">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1.4px;color:#94a3b8;">LAUNCH & DOCKING CLEARANCES</div>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.goNoGoLaunch, pollActive)}" data-lcc-op="go_nogo_launch" style="text-align:left;padding:7px 10px;">
              ${gs.goNoGoLaunch ? `GO FOR LAUNCH APPROVED (${gs.goNoGoBy || "GROUND"})` : (pollActive ? "POLL ACTIVE: ISSUE GO FOR LAUNCH" : "PRE-CLEAR GO FOR LAUNCH")}
            </button>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.dockingClearance, this.missionPhase === "docking" && !gs.dockingClearance)}" data-lcc-op="docking_clearance" style="text-align:left;padding:7px 10px;">
              ${gs.dockingClearance ? `DOCKING CORRIDOR CLEARED (${gs.dockingClearanceBy || "GROUND"})` : "ISSUE DOCKING CORRIDOR CLEARANCE"}
            </button>
            <div style="font-family:var(--font-mono);font-size:10px;color:#94a3b8;margin-top:4px;">FLIGHT CREW MANIFEST (${crewState.aboardCount}/${crewState.crewTotal} ABOARD)</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              ${crewState.flightRoster.map((p) => `
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:4px 7px;background:rgba(15,23,42,0.65);border:1px solid rgba(148,163,184,0.16);border-radius:3px;">
                  <span style="color:#f8fafc;"><strong>${p.roleShort}</strong> · ${p.name}</span>
                  <span style="font-family:var(--font-mono);font-size:9px;color:${this.missionPhase === "station" ? "#86efac" : (p.isAboard ? "#93c5fd" : "#94a3b8")};">
                    ${this.missionPhase === "station" ? "STATION" : (p.isAboard ? "BOARDED" : "PAD 39A")}
                  </span>
                </div>
              `).join("") || `<div style="font-size:11px;color:#94a3b8;">No Flight Crew assigned.</div>`}
            </div>
          </div>

          <div class="ground-lcc-card">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1.4px;color:#94a3b8;">GROUND NETWORK & SUBSYSTEM SUPPORT</div>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.dsnLocked)}" data-lcc-op="dsn_lock" style="text-align:left;padding:7px 10px;">
              ${gs.dsnLocked ? `DSN TELEMETRY LOCKED (${gs.dsnLockedBy || "GROUND"})` : "LOCK DEEP SPACE NETWORK ANTENNA (+COMMS)"}
            </button>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.powerRouted)}" data-lcc-op="power_route" style="text-align:left;padding:7px 10px;">
              ${gs.powerRouted ? `EPS ARRAY POWER ROUTED (${gs.powerRoutedBy || "GROUND"})` : "ROUTE EPS SOLAR ARRAY TELEMETRY (+POWER)"}
            </button>
            <button type="button" class="ground-action-btn ${this._groundOpButtonAttrs(gs.scienceCleared)}" data-lcc-op="science_downlink" style="text-align:left;padding:7px 10px;">
              ${gs.scienceCleared ? `SCIENCE DOWNLINK CLEARED (${gs.scienceClearedBy || "GROUND"})` : "AUTHORIZE PAYLOAD SCIENCE DOWNLINK (+SCIENCE)"}
            </button>
            <div style="font-family:var(--font-mono);font-size:10px;color:#94a3b8;margin-top:4px;">PING STATION COMPARTMENT</div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;">
              ${roomButtons.map((rm) => `
                <button type="button" class="ground-action-btn ${pingValid && activePing.roomId === rm.id ? "is-approved" : ""}" data-lcc-ping="${rm.id}">
                  PING ${rm.label}
                </button>
              `).join("")}
            </div>
          </div>

          <div class="ground-lcc-card">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:1.4px;color:#94a3b8;">ORBITAL STATION LIVE CREW TRACKER</div>
            <div id="lcc-live-floorplan" style="background:rgba(5,8,16,0.8);border:1px solid rgba(148,163,184,0.16);border-radius:4px;padding:6px;">
              ${mapHtml}
            </div>
            <div style="font-size:10px;color:#94a3b8;line-height:1.4;">
              Advisory model: Ground clearances boost &amp; guide Flight Crew telemetry without soft-locking mission progression. Hold [R] or click S-BAND RADIO to speak directly to orbit.
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
          if (targetRoom) this._triggerGroundAction("ping_room", { targetRoom, message: "PRIORITY CHECK REQUESTED BY LCC" });
        });
      });
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
        this.crewBoarded = isGround ? false : (this.crewBoarded || boardedByServer);
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

      this.isGroundMode = true;
      this.isLaunching = false;
      this.launchTime = 0.0;
      document.body.classList.add("ground-mode-active");
      document.body.classList.remove("interior-active", "launch-active", "docking-active", "iss-showcase-active", "solar-system-active");
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
              window.gameplay.showToast("GO/NO-GO LAUNCH POLL SENT TO GROUND CONTROL (8s AUTO-RELEASE · PRESS [L] AGAIN TO OVERRIDE)");
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
          window.gameplay.showToast("T-0 LIFTOFF AT LC-39A · OBSERVE ASCENT FROM SPACE CENTER · CONSOLE [C]");
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
          window.gameplay.showToast("ORBITAL RENDEZVOUS · ISSUE DOCKING CORRIDOR CLEARANCE IN LCC CONSOLE [C]");
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
          window.gameplay.showToast("ORBITAL INSERTION COMPLETE · ALIGN & DOCK WITH STATION PORT PMA-2");
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
          window.gameplay.showToast("FLIGHT CREW DOCKED AT STATION · COORDINATE OPERATIONS FROM LCC CONSOLE [C]");
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
        window.gameplay.showToast("HARD CAPTURE & INGRESS COMPLETE · WELCOME ABOARD STATION INTERIOR");
      }
    }

    /**
     * Requests a shared crew reset back to LC-39A. The server is authoritative
     * so every astronaut returns to the gantry together; solo/offline sessions
     * fall back to a purely local reset.
     */
    requestMissionReset() {
      if (this.missionPhase === "gantry" && this.isGroundMode) {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("ALREADY AT LC-39A · FOLLOW THE GUIDANCE MARKERS TO THE ACCESS ARM AND ORBITER HATCH");
        }
        return false;
      }

      const confirmed = typeof window.confirm !== "function" ||
        window.confirm("Return the whole crew to Kennedy Space Center LC-39A? This resets the shared mission for every astronaut.");
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
        window.gameplay.showToast("CREW RETURNED TO KENNEDY SPACE CENTER LC-39A");
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
        const speed = 8.0; // metres per second
        const diff  = this.elevatorTargetY - this.elevatorY;
        const step  = Math.sign(diff) * Math.min(Math.abs(diff), speed * delta);
        this.elevatorY += step;
        this.elevatorCab.position.y = this.elevatorY;

        // Status strip: amber while moving
        if (this._elevatorLightMat) {
          this._elevatorLightMat.color.setHex(0xf59e0b);
          this._elevatorLightMat.emissive.setHex(0xf59e0b);
        }

        // Carry the player if riding (towerGroup world Y offset = 19.8)
        if (this.elevatorRidingPlayer && this.camera) {
          this.camera.position.y = 19.8 + this.elevatorY + 1.4;
        }

        // Arrived?
        if (Math.abs(diff) < 0.05) {
          this.elevatorY = this.elevatorTargetY;
          this.elevatorCab.position.y = this.elevatorY;
          this.elevatorMoving = false;
          this.elevatorRidingPlayer = false;

          if (this.camera) {
            const isTop = this.elevatorY >= cfg.top - 1;
            this.camera.position.y = isTop ? 64.1 : 19.8;
            if (window.gameplay && typeof window.gameplay.showToast === "function") {
              window.gameplay.showToast(isTop
                ? "🛗 GANTRY LEVEL — extend the Orbiter Access Arm with [F]"
                : "🛗 GROUND LEVEL — Elevator doors open");
            }
          }

          if (this._elevatorLightMat) {
            const col = this.elevatorY >= cfg.top - 1 ? 0x34d399 : 0xef4444;
            this._elevatorLightMat.color.setHex(col);
            this._elevatorLightMat.emissive.setHex(col);
          }
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
