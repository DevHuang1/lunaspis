/**
 * Space Center LC-39A — Drivable Open-Top NASA Ground Car
 * ============================================================================
 * A small, fully procedural open car parked on the apron-side parking pad near
 * the Pad 39A ground spawn. Players walk up, press [E], and drive around the
 * Kennedy Space Center site tour — crawlerway, VAB apron, LCC roads and beach.
 *
 * - Open cockpit (no roof): seats, dashboard, windshield frame, roll bar.
 * - WASD / arrows / mobile D-pad: throttle, reverse and steering.
 * - SHIFT / mobile BOOST button: boost to ~101 km/h.
 * - SPACE / mobile brake button: brake at low speed, handbrake-drift while turning fast.
 * - C / HUD camera button: toggle chase camera and cockpit first-person view.
 * - Space or the on-screen button: brake. [E] or the prompt button: exit.
 * - Uses the Space Center site collider volumes so it cannot drive through the
 *   pad hardstand, VAB walls, LCC, crawler or utility buildings.
 * - Car movement drives the local crew position as well, so proximity voice,
 *   network interpolation and mission logic continue to see the player there.
 */
(function (window) {
  "use strict";

  const FALLBACK_CAR_SPAWN = { x: 38, y: 0.08, z: 197, yaw: 0.15 };
  const CAR_RADIUS = 1.35;
  const MAX_FORWARD_SPEED = 16.5; // m/s (~59 km/h)
  const MAX_BOOST_SPEED = 28.0; // m/s (~101 km/h) with SHIFT / mobile BOOST
  const MAX_REVERSE_SPEED = 6.5;
  const BOOST_ACCELERATION = 15.5;
  const WHEEL_RADIUS = 0.44;
  const WHEELBASE = 2.85;

  class SpaceCenterOpenCar {
    constructor(spaceCenter) {
      this.sc = spaceCenter;
      this.group = null;
      this.body = null;
      this.driver = null;
      this.driverSeat = null;
      this.driverSuitMat = null;
      this.steerWheel = null;
      this.steerWheelPivot = null;
      this.beaconMat = null;
      this.brakeLightMats = [];
      this.wheels = [];
      this.label = null;
      this.hud = null;
      this.speedEl = null;
      this.mphEl = null;
      this.gearEl = null;
      this.statusEl = null;
      this.stateEl = null;
      this.camBtn = null;
      this.boostBtn = null;
      this.gaugeCanvas = null;
      this.gaugeCtx = null;
      this.throttleFill = null;
      this.boostFill = null;
      this.throttlePctEl = null;
      this.boostPctEl = null;
      this.brakeLight = null;
      this.boostLight = null;
      this.driftLight = null;
      this._lastGaugeDraw = 0;

      this.isDriving = false;
      this.speed = 0;
      this.steer = 0;
      this.throttleInput = 0;
      this.steerInput = 0;
      this.displayKmh = 0;
      this.displayThrottle = 0;
      this.displayBoost = 0;
      this.spawn = Object.assign({}, FALLBACK_CAR_SPAWN);
      this.yaw = this.spawn.yaw;
      this.brakeHeld = false;
      this.boostHeld = false;
      this.boosting = false;
      this.drifting = false;
      this.firstPerson = false;
      this.lookYaw = 0;
      this.lookPitch = 0;
      this._lookDragging = false;
      this._lookLastX = 0;
      this._lookLastY = 0;
      this._camHead = null;
      this._camDir = null;
      this.keys = Object.create(null);
      this._keysBound = false;
      this._camInitialised = false;
      this._lastDelta = 0.016;
      this._bodyPitch = 0;
      this._bodyRoll = 0;
      this._netPos = null;
      this._lastGroundHudMeasure = 0;
    }

    // =========================================================================
    // SCENE ASSEMBLY
    // =========================================================================
    build() {
      const T = window.THREE;
      const sc = this.sc;
      if (!T || !sc || !sc.group) return this;

      this.spawn = this._computeSpawnNearGroundSpawn();
      this.yaw = this.spawn.yaw;
      this._buildMaterials();
      this._buildParkingPad();

      this.group = new T.Group();
      this.group.name = "SpaceCenter_OpenCar";
      this.group.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
      this.group.rotation.y = this.yaw;
      sc.group.add(this.group);

      this.body = new T.Group();
      this.body.name = "OpenCar_Body";
      this.group.add(this.body);

      this._buildChassis();
      this._buildCockpit();
      this._buildRollBar();
      this._buildWheels();
      this._buildDriver();
      for (const wheel of this.wheels) this._mergeContainerMeshes(wheel.spin, new Set());
      this._mergeContainerMeshes(this.body, new Set([this.steerWheelPivot, this.steerWheel, this.driver]));
      if (this.driver) this._mergeContainerMeshes(this.driver, new Set());
      this._buildLabel();

      this._netPos = new T.Vector3(this.spawn.x, this.spawn.y, this.spawn.z);
      this._buildHud();
      this._bindInput();
      return this;
    }

    _mergeGeometrySet(geometries) {
      const T = window.THREE;
      const attributes = ["position", "normal", "uv"];
      let vertexCount = 0, indexCount = 0;
      for (const geometry of geometries) {
        vertexCount += geometry.getAttribute("position").count;
        indexCount += geometry.index ? geometry.index.count : geometry.getAttribute("position").count;
      }
      if (!vertexCount) return null;
      const merged = new T.BufferGeometry();
      for (const name of attributes) {
        const first = geometries.find((geometry) => geometry.getAttribute(name));
        if (!first) continue;
        const itemSize = first.getAttribute(name).itemSize;
        const array = new Float32Array(vertexCount * itemSize);
        let offset = 0;
        for (const geometry of geometries) {
          const attribute = geometry.getAttribute(name);
          if (attribute) { array.set(attribute.array, offset); offset += attribute.array.length; }
          else { offset += geometry.getAttribute("position").count * itemSize; }
        }
        merged.setAttribute(name, new T.BufferAttribute(array, itemSize));
      }
      const indices = new Uint32Array(indexCount);
      let indexOffset = 0, vertexOffset = 0;
      for (const geometry of geometries) {
        const count = geometry.getAttribute("position").count;
        if (geometry.index) {
          const source = geometry.index.array;
          for (let i = 0; i < source.length; i++) indices[indexOffset++] = source[i] + vertexOffset;
        } else {
          for (let i = 0; i < count; i++) indices[indexOffset++] = i + vertexOffset;
        }
        vertexOffset += count;
      }
      merged.setIndex(new T.BufferAttribute(indices, 1));
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      return merged;
    }

    _mergeContainerMeshes(container, excludeRoots) {
      const T = window.THREE;
      if (!T || !container) return;
      container.updateWorldMatrix(true, true);
      const invContainer = new T.Matrix4().copy(container.matrixWorld).invert();
      const excluded = excludeRoots || new Set();
      const isExcluded = (object) => {
        let node = object;
        while (node) { if (excluded.has(node)) return true; node = node.parent; }
        return false;
      };
      const buckets = new Map();
      const isVisibleWithin = (object) => {
        let node = object;
        while (node && node !== container) { if (!node.visible) return false; node = node.parent; }
        return true;
      };
      container.traverse((obj) => {
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
          const local = new T.Matrix4().multiplyMatrices(invContainer, mesh.matrixWorld);
          geometry.applyMatrix4(local);
          return geometry;
        });
        const merged = this._mergeGeometrySet(geometries);
        if (!merged) continue;
        const mesh = new T.Mesh(merged, bucket.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `OpenCar_Merged_${bucket.material.name || "material"}`;
        container.add(mesh);
        bucket.items.forEach((item) => { if (item.parent) item.parent.remove(item); });
        geometries.forEach((geometry) => geometry.dispose());
      }
    }

    /**
     * Visual-only clone used for crewmates driving their own car. The clone
     * shares body geometry with the local car and exposes a driver-seat anchor
     * so the remote crew rig can be placed in the cockpit.
     */
    createRemoteVisual() {
      const T = window.THREE;
      if (!T || !this.group) return null;
      const visual = this.group.clone(true);
      visual.name = "SpaceCenter_OpenCar_Remote";
      visual.position.set(0, 0, 0);
      visual.rotation.set(0, 0, 0);
      visual.visible = false;

      const label = visual.getObjectByName("OpenCarLabel");
      if (label && label.parent) label.parent.remove(label);

      const body = visual.getObjectByName("OpenCar_Body");
      if (body) {
        body.position.set(0, 0, 0);
        body.rotation.set(0, 0, 0);
      }

      // The placeholder driver is local-only; remote cars receive the actual
      // crewmate rig at the seat anchor below.
      const driver = visual.getObjectByName("OpenCar_Driver");
      if (driver && driver.parent) driver.parent.remove(driver);

      visual.userData.driverSeat = visual.getObjectByName("OpenCar_DriverSeat") || body || visual;
      return visual;
    }

    _buildMaterials() {
      const T = window.THREE;
      const M = (opts) => new T.MeshStandardMaterial(opts);
      this.mats = {
        white: M({ color: 0xf1f5f9, roughness: 0.5, metalness: 0.18 }),
        whiteDim: M({ color: 0xd7dee6, roughness: 0.62, metalness: 0.12 }),
        blue: M({ color: 0x0b3d91, roughness: 0.48, metalness: 0.2 }),
        red: M({ color: 0xcf2a1b, roughness: 0.5, metalness: 0.15 }),
        dark: M({ color: 0x202a33, roughness: 0.82, metalness: 0.16 }),
        steel: M({ color: 0x93a2b1, roughness: 0.38, metalness: 0.72 }),
        tire: M({ color: 0x14181d, roughness: 0.95, metalness: 0.02 }),
        rim: M({ color: 0xb9c4cf, roughness: 0.32, metalness: 0.8 }),
        seat: M({ color: 0x36414d, roughness: 0.92, metalness: 0.02 }),
        glass: new T.MeshStandardMaterial({
          color: 0xbfe9ff,
          roughness: 0.08,
          metalness: 0.08,
          transparent: true,
          opacity: 0.32,
          side: T.DoubleSide,
          depthWrite: false
        }),
        headlight: M({
          color: 0xfff8dc,
          emissive: 0xffe9a8,
          emissiveIntensity: 1.1,
          roughness: 0.24,
          metalness: 0.2
        }),
        taillight: M({
          color: 0x5e0d0d,
          emissive: 0xef4444,
          emissiveIntensity: 0.7,
          roughness: 0.3,
          metalness: 0.15
        }),
        amber: M({
          color: 0xff9f1c,
          emissive: 0xff8a00,
          emissiveIntensity: 0.7,
          roughness: 0.32,
          metalness: 0.15
        })
      };
    }

    /**
     * Parks the car a few steps from the current Pad 39A ground spawn. The
     * site-tour spawn list is shared with the HUD, so if the spawn is adjusted
     * the car follows it automatically instead of drifting away from the crew.
     */
    _computeSpawnNearGroundSpawn() {
      const spawns = (window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || [];
      const groundCrew = !!(this.sc && typeof this.sc._isLocalGroundCrew === "function" && this.sc._isLocalGroundCrew());
      const padSpawn = spawns.find((s) => s && s.id === (groundCrew ? "lcc" : "pad"))
        || (groundCrew ? spawns.find((s) => s && s.id === "lcc") : null)
        || spawns.find((s) => s && s.id === "pad")
        || spawns[0];
      if (!padSpawn) return Object.assign({}, FALLBACK_CAR_SPAWN);

      const baseYaw = typeof padSpawn.yaw === "number" ? padSpawn.yaw : Math.PI;
      // Park outside the LCC entrance for Earth Control, and by Pad 39A for
      // flight crew. Each client gets a car in its own operating zone.
      const candidates = groundCrew
        ? [[0, -24], [5, -22], [-5, -22], [0, 9], [8, 9], [-8, 9], [12, 4], [-12, 4], [0, 15]]
        : [[8, -8], [-8, -8], [10, 1], [-10, 1], [8, 8], [-8, 8]];
      for (const candidate of candidates) {
        const x = padSpawn.x + candidate[0];
        const z = padSpawn.z + candidate[1];
        if (!this._blocked(x, z, 2.4, 0)) {
          const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
          const y = terrain && typeof terrain.getSurfaceHeightAt === "function"
            ? terrain.getSurfaceHeightAt(x, z, 0.2)
            : 0.08;
          return {
            x,
            y,
            z,
            yaw: baseYaw + Math.PI
          };
        }
      }
      const fallbackX = padSpawn.x + 8;
      const fallbackZ = padSpawn.z - 8;
      const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
      return {
        x: fallbackX,
        y: terrain && typeof terrain.getSurfaceHeightAt === "function"
          ? terrain.getSurfaceHeightAt(fallbackX, fallbackZ, 0.2)
          : 0.08,
        z: fallbackZ,
        yaw: baseYaw + Math.PI
      };
    }

    _buildParkingPad() {
      const T = window.THREE;
      const area = new T.Group();
      area.name = "OpenCarParkingArea";
      area.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
      this.sc.group.add(area);
      this.parkingPad = area;

      const pad = new T.Mesh(
        new T.BoxGeometry(7.2, 0.08, 6.4),
        new T.MeshStandardMaterial({ color: 0x8d969e, roughness: 0.94, metalness: 0.03 })
      );
      pad.name = "OpenCarParkingPad";
      pad.position.set(0, -0.04, 0);
      pad.receiveShadow = true;
      area.add(pad);

      const stripeMat = new T.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.8 });
      [-2.3, 2.3].forEach((ox) => {
        const stripe = new T.Mesh(new T.BoxGeometry(0.16, 0.025, 4.6), stripeMat);
        stripe.position.set(ox, 0.005, 0);
        area.add(stripe);
      });
      const stopMat = new T.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.8 });
      const stop = new T.Mesh(new T.BoxGeometry(5.2, 0.025, 0.16), stopMat);
      stop.position.set(0, 0.005, -2.55);
      area.add(stop);
    }

    /**
     * Moves an already-built car between the LCC parking area (Earth Control)
     * and Pad 39A (flight crew). Role changes happen after the car is built in
     * some lobby/co-op flows, so rebuilding is not an option.
     */
    reparkForLocalRole() {
      if (!this.group || this.isDriving) return false;
      const next = this._computeSpawnNearGroundSpawn();
      if (!next) return false;
      const moved = Math.hypot(next.x - this.spawn.x, next.z - this.spawn.z) > 0.5;
      this.spawn = next;
      this.yaw = next.yaw;
      this.group.position.set(next.x, next.y, next.z);
      this.group.rotation.y = next.yaw;
      if (this.parkingPad) this.parkingPad.position.set(next.x, next.y, next.z);
      if (this._netPos) this._netPos.set(next.x, next.y, next.z);
      this._camInitialised = false;
      if (typeof this._updateHud === "function") this._updateHud();
      return moved;
    }

    _box(parent, w, h, d, x, y, z, material, name, rotation) {
      const T = window.THREE;
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (name) mesh.name = name;
      parent.add(mesh);
      return mesh;
    }

    _cyl(parent, radiusTop, radiusBottom, height, x, y, z, material, segments, name) {
      const T = window.THREE;
      const mesh = new T.Mesh(new T.CylinderGeometry(radiusTop, radiusBottom, height, segments || 12), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (name) mesh.name = name;
      parent.add(mesh);
      return mesh;
    }

    _buildChassis() {
      const T = window.THREE;
      const m = this.mats;
      const body = this.body;

      // Low chassis, skid plate and open floor pan.
      this._box(body, 1.86, 0.28, 4.3, 0, 0.56, 0, m.dark, "CarChassis");
      this._box(body, 1.5, 0.1, 2.55, 0, 0.75, 0.1, m.dark, "CarFloor");
      this._box(body, 1.72, 0.22, 0.34, 0, 0.5, 2.18, m.dark, "FrontSkid");
      this._box(body, 1.72, 0.22, 0.34, 0, 0.5, -2.18, m.dark, "RearSkid");

      // White body sides with an open door cut-out in the middle.
      for (const side of [-1, 1]) {
        const x = side * 0.92;
        // Front fender / door forward panel
        this._box(body, 0.14, 0.55, 1.15, x, 0.94, 1.0, m.white, "CarSideFront");
        // Rear quarter panel
        this._box(body, 0.14, 0.55, 1.2, x, 0.94, -1.35, m.white, "CarSideRear");
        // Low sill bridging the open door area (inset 1 cm so it cannot
        // z-fight with the door panels it overlaps).
        this._box(body, 0.12, 0.24, 1.4, side * 0.915, 0.82, -0.15, m.whiteDim, "CarSill");
        // Blue NASA livery stripe, offset just proud of the side panels.
        this._box(body, 0.02, 0.1, 3.35, side * 1.006, 1.06, 0.0, m.blue, "CarStripe");
      }

      // Hood and nose.
      this._box(body, 1.78, 0.24, 1.25, 0, 1.03, 1.45, m.white, "CarHood");
      this._box(body, 1.86, 0.34, 0.24, 0, 1.02, 2.2, m.white, "CarNose");
      this._box(body, 1.96, 0.2, 0.26, 0, 0.6, 2.32, m.dark, "CarFrontBumper");
      this._box(body, 1.96, 0.2, 0.26, 0, 0.6, -2.32, m.dark, "CarRearBumper");
      this._box(body, 1.1, 0.26, 0.06, 0, 1.03, 2.34, m.dark, "CarGrille");
      for (let i = -2; i <= 2; i++) {
        this._box(body, 0.06, 0.2, 0.02, i * 0.17, 1.03, 2.375, m.steel, "CarGrilleBar");
      }
      this._box(body, 0.42, 0.03, 1.1, 0, 1.16, 1.45, m.blue, "CarHoodStripeBlue");
      this._box(body, 0.05, 0.012, 1.1, -0.1, 1.182, 1.45, m.red, "CarHoodStripeRed");
      this._box(body, 0.05, 0.012, 1.1, 0.1, 1.182, 1.45, m.white, "CarHoodStripeWhite");

      // Rear cargo bed with spare wheel and tool box.
      this._box(body, 1.7, 0.12, 1.15, 0, 0.89, -1.6, m.dark, "CarBedFloor");
      for (const side of [-1, 1]) {
        this._box(body, 0.1, 0.42, 1.28, side * 0.83, 1.11, -1.58, m.white, "CarBedSide");
      }
      this._box(body, 1.76, 0.42, 0.1, 0, 1.11, -2.19, m.white, "CarBedTail");
      this._box(body, 0.7, 0.32, 0.45, 0.2, 1.08, -1.55, m.steel, "CarToolBox");

      const spare = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 0.26, 16), this.mats.tire);
      spare.rotation.z = Math.PI / 2;
      spare.rotation.y = 0.06;
      spare.position.set(-0.45, 1.14, -1.62);
      spare.castShadow = true;
      body.add(spare);

      // Headlights, taillights and indicator pods.
      for (const side of [-1, 1]) {
        this._box(body, 0.34, 0.2, 0.08, side * 0.6, 1.06, 2.36, m.headlight, "CarHeadlight");
        const brakeMat = m.taillight.clone();
        this._box(body, 0.34, 0.2, 0.08, side * 0.64, 1.04, -2.37, brakeMat, "CarTaillight");
        this.brakeLightMats.push(brakeMat);
      }
    }

    _buildCockpit() {
      const T = window.THREE;
      const m = this.mats;
      const body = this.body;

      // Windshield frame — deliberately open above the belt line (no roof).
      for (const side of [-1, 1]) {
        this._box(body, 0.09, 0.86, 0.1, side * 0.84, 1.67, 0.72, m.dark, "CarWindshieldPillar", [-0.1, 0, 0]);
      }
      this._box(body, 1.76, 0.08, 0.09, 0, 2.08, 0.68, m.dark, "CarWindshieldHeader");
      const glass = this._box(body, 1.62, 0.66, 0.03, 0, 1.66, 0.71, m.glass, "CarWindshieldGlass", [-0.1, 0, 0]);
      glass.castShadow = false;

      // Dashboard, centre console and steering wheel.
      this._box(body, 1.64, 0.22, 0.46, 0, 1.19, 0.9, m.dark, "CarDashboard");
      this._box(body, 0.5, 0.25, 0.8, 0, 0.88, 0.05, m.dark, "CarCentreConsole");
      this._box(body, 0.24, 0.12, 0.3, 0, 1.04, 0.18, m.steel, "CarGearLever");
      this._box(body, 0.2, 0.16, 0.22, 0, 1.04, 0.26, m.dark, "CarGearKnob");

      const wheelPivot = new T.Group();
      wheelPivot.position.set(-0.44, 1.31, 0.62);
      wheelPivot.rotation.x = -0.42;
      body.add(wheelPivot);
      this.steerWheelPivot = wheelPivot;
      const wheel = new T.Mesh(new T.TorusGeometry(0.19, 0.035, 8, 18), m.dark);
      wheel.name = "CarSteeringWheel";
      wheel.castShadow = true;
      wheelPivot.add(wheel);
      this.steerWheel = wheel;
      const hub = new T.Mesh(new T.CylinderGeometry(0.055, 0.055, 0.05, 10), m.steel);
      hub.rotation.x = Math.PI / 2;
      hub.position.z = 0.02;
      wheelPivot.add(hub);
      for (let i = 0; i < 3; i++) {
        const spoke = new T.Mesh(new T.BoxGeometry(0.35, 0.025, 0.02), m.steel);
        spoke.rotation.z = (i / 3) * Math.PI * 2;
        wheelPivot.add(spoke);
      }

      // Two open bucket seats.
      for (const sx of [-0.44, 0.44]) {
        this._box(body, 0.66, 0.16, 0.72, sx, 0.98, -0.24, m.seat, "CarSeatBase");
        this._box(body, 0.66, 0.72, 0.14, sx, 1.37, -0.6, m.seat, "CarSeatBack", [0.1, 0, 0]);
        for (const hx of [-0.2, 0.2]) {
          this._box(body, 0.15, 0.18, 0.11, sx + hx, 1.78, -0.64, m.seat, "CarHeadrest");
        }
      }

      // Door-mounted grab handles and wing mirrors.
      for (const side of [-1, 1]) {
        this._box(body, 0.05, 0.05, 0.7, side * 0.83, 1.24, -0.12, m.steel, "CarSideRail");
        this._box(body, 0.04, 0.16, 0.04, side * 0.84, 1.92, 0.5, m.dark, "CarMirrorStem");
        this._box(body, 0.26, 0.16, 0.08, side * 0.84, 2.0, 0.48, m.dark, "CarMirror");
      }

      // Front spot lamps on the bumper (visual only).
      for (const side of [-1, 1]) {
        const lamp = this._cyl(body, 0.09, 0.09, 0.16, side * 0.42, 1.3, 2.27, m.steel, 10, "CarSpotLamp");
        lamp.rotation.x = Math.PI / 2;
      }
    }

    _buildRollBar() {
      const T = window.THREE;
      const m = this.mats;
      const body = this.body;
      const barMat = m.steel;
      for (const side of [-1, 1]) {
        this._box(body, 0.1, 1.05, 0.1, side * 0.82, 1.62, -0.92, barMat, "CarRollBarPost", [0.08, 0, 0]);
        this._box(body, 0.08, 0.62, 0.08, side * 0.82, 1.46, -0.5, barMat, "CarRollBarBrace", [0.55, 0, 0]);
      }
      this._box(body, 1.74, 0.1, 0.1, 0, 2.16, -0.98, barMat, "CarRollBarTop");

      // Amber warning beacon on the roll bar.
      this._cyl(body, 0.09, 0.11, 0.06, 0, 2.24, -0.98, m.dark, 10, "CarBeaconBase");
      this.beaconMat = new T.MeshStandardMaterial({
        color: 0xffa31a,
        emissive: 0xff8a00,
        emissiveIntensity: 0.7,
        roughness: 0.3,
        metalness: 0.1
      });
      this._cyl(body, 0.08, 0.1, 0.13, 0, 2.33, -0.98, this.beaconMat, 10, "CarBeaconLamp");
    }

    _buildWheels() {
      const T = window.THREE;
      const m = this.mats;
      const defs = [
        { x: 0.98, z: 1.45, front: true },
        { x: -0.98, z: 1.45, front: true },
        { x: 0.98, z: -1.45, front: false },
        { x: -0.98, z: -1.45, front: false }
      ];

      defs.forEach((def) => {
        const pivot = new T.Group();
        pivot.position.set(def.x, WHEEL_RADIUS + 0.02, def.z);
        this.group.add(pivot);

        const spin = new T.Group();
        pivot.add(spin);

        const tire = new T.Mesh(new T.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.34, 16), m.tire);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        tire.receiveShadow = true;
        spin.add(tire);

        const rim = new T.Mesh(new T.CylinderGeometry(0.23, 0.23, 0.345, 12), m.rim);
        rim.rotation.z = Math.PI / 2;
        rim.castShadow = true;
        spin.add(rim);

        const hub = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.36, 10), m.dark);
        hub.rotation.z = Math.PI / 2;
        spin.add(hub);

        for (let s = 0; s < 4; s++) {
          const spoke = new T.Mesh(new T.BoxGeometry(0.36, 0.05, 0.12), m.rim);
          spoke.rotation.x = (s / 4) * Math.PI * 2;
          spin.add(spoke);
        }

        // Black fender flare above the wheel.
        const flare = this._box(
          this.body,
          0.42,
          0.18,
          1.12,
          def.x > 0 ? 0.94 : -0.94,
          1.24,
          def.z,
          m.dark,
          "CarFenderFlare"
        );
        flare.castShadow = true;

        this.wheels.push({ pivot, spin, front: def.front });
      });
    }

    _buildDriver() {
      const T = window.THREE;
      this.driverSuitMat = new T.MeshStandardMaterial({
        color: 0x67e8f9,
        roughness: 0.42,
        metalness: 0.2
      });
      const suit = this.driverSuitMat;
      const dark = this.mats.dark;
      const visor = new T.MeshStandardMaterial({
        color: 0x102a43,
        roughness: 0.08,
        metalness: 0.65
      });

      const driver = new T.Group();
      driver.name = "OpenCar_Driver";
      driver.position.set(-0.44, 0.84, -0.18);
      driver.visible = false;
      this.body.add(driver);
      this.driver = driver;

      // The real crewmate rig (astronaut/ground-crew GLB) is positioned over
      // this anchor. Its rest hips are 0.906 m above the rig origin, which puts
      // them at the seat base height (0.98 m above the car floor).
      const seat = new T.Group();
      seat.name = "OpenCar_DriverSeat";
      seat.position.set(-0.44, 0.074, -0.24);
      this.body.add(seat);
      this.driverSeat = seat;

      // Torso settles into the seat; helmet sits just above the windshield belt.
      this._box(driver, 0.44, 0.56, 0.32, 0, 0.32, 0, suit, "DriverTorso");
      this._box(driver, 0.2, 0.12, 0.05, 0, 0.38, 0.18, dark, "DriverChestPanel");
      const helmet = new T.Mesh(new T.SphereGeometry(0.22, 16, 12), suit);
      helmet.position.set(0, 0.79, 0.0);
      helmet.castShadow = true;
      driver.add(helmet);
      const visorMesh = new T.Mesh(new T.SphereGeometry(0.18, 16, 12), visor);
      visorMesh.scale.set(1, 0.72, 0.72);
      visorMesh.position.set(0, 0.8, 0.12);
      driver.add(visorMesh);

      for (const side of [-1, 1]) {
        const arm = this._box(driver, 0.1, 0.4, 0.12, side * 0.27, 0.33, 0.14, suit, "DriverArm", [-0.95, 0, side * 0.06]);
        arm.castShadow = true;
        this._box(driver, 0.14, 0.13, 0.46, side * 0.12, 0.0, 0.25, suit, "DriverLeg", [-0.18, 0, 0]);
        this._box(driver, 0.15, 0.11, 0.22, side * 0.12, -0.1, 0.55, dark, "DriverBoot");
      }
    }

    _buildLabel() {
      const T = window.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 224;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 1024, 224);
      ctx.fillStyle = "rgba(5,10,20,0.84)";
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 7;
      this._roundRect(ctx, 18, 18, 988, 188, 26);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 82px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("NASA OPEN CAR", 512, 105);
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "700 38px Arial, Helvetica, sans-serif";
      ctx.fillText("PRESS [E] TO DRIVE", 512, 168);

      const texture = new T.CanvasTexture(canvas);
      if (T.sRGBEncoding !== undefined) texture.encoding = T.sRGBEncoding;
      const sprite = new T.Sprite(new T.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        fog: false
      }));
      sprite.name = "OpenCarLabel";
      sprite.scale.set(4.6, 1.0, 1);
      sprite.position.set(0, 3.15, 0);
      this.group.add(sprite);
      this.label = sprite;
    }

    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    // =========================================================================
    // ON-SCREEN PROMPT / DRIVE HUD
    // =========================================================================
    _buildHud() {
      if (document.getElementById("open-car-hud")) {
        this.hud = document.getElementById("open-car-hud");
      } else {
        const style = document.createElement("style");
        style.id = "open-car-style";
        style.textContent = `
          #open-car-hud {
            position: fixed;
            left: 50%;
            bottom: max(18px, env(safe-area-inset-bottom));
            transform: translateX(-50%);
            z-index: 84;
            display: none;
            flex-direction: column;
            align-items: center;
            pointer-events: none;
            font-family: var(--font-mono, "Courier New", monospace);
          }
          #open-car-hud.is-visible { display: flex; }
          #open-car-hud .oc-card {
            pointer-events: auto;
            min-width: 280px;
            padding: 9px 13px 8px;
            border-radius: 10px;
            border: 1px solid rgba(251, 191, 36, 0.55);
            background: linear-gradient(180deg, rgba(9, 16, 28, 0.92), rgba(4, 8, 16, 0.9));
            box-shadow: 0 10px 32px rgba(0, 0, 0, 0.42), inset 0 0 22px rgba(37, 99, 235, 0.08);
            color: #e5edf7;
            text-align: center;
          }
          #open-car-hud .oc-title {
            font-size: 9px;
            letter-spacing: 2.2px;
            color: #fbbf24;
            margin-bottom: 6px;
            white-space: nowrap;
          }
          #open-car-hud .oc-row {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            flex-wrap: wrap;
          }
          #open-car-hud .oc-btn {
            pointer-events: auto;
            border: 1px solid rgba(148, 163, 184, 0.35);
            border-radius: 6px;
            padding: 8px 14px;
            font-family: inherit;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 1px;
            cursor: pointer;
            color: #e5edf7;
            background: rgba(30, 41, 59, 0.9);
            transition: background 0.15s ease, transform 0.1s ease;
            touch-action: manipulation;
          }
          #open-car-hud .oc-btn:active { transform: translateY(1px); }
          #open-car-hud .oc-btn-primary {
            color: #111827;
            border-color: #fbbf24;
            background: linear-gradient(180deg, #fde68a, #f59e0b);
          }
          #open-car-hud .oc-btn-brake {
            border-color: rgba(239, 68, 68, 0.6);
            background: rgba(127, 29, 29, 0.8);
            color: #fecaca;
          }
          #open-car-hud .oc-btn-boost {
            border-color: rgba(103, 232, 249, 0.55);
            background: rgba(8, 47, 73, 0.85);
            color: #a5f3fc;
          }
          #open-car-hud .oc-btn.is-active,
          #open-car-hud .oc-btn-boost:active {
            border-color: #fde68a;
            background: rgba(251, 191, 36, 0.24);
            color: #fef3c7;
            box-shadow: 0 0 14px rgba(251, 191, 36, 0.35);
          }
          #open-car-hud .oc-state {
            margin-top: 5px;
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 1.6px;
            color: #94a3b8;
            min-height: 11px;
          }
          #open-car-hud .oc-state.is-drift { color: #fbbf24; text-shadow: 0 0 10px rgba(251, 191, 36, 0.5); }
          #open-car-hud .oc-state.is-boost { color: #67e8f9; text-shadow: 0 0 10px rgba(103, 232, 249, 0.55); }
          #open-car-hud .oc-state.is-brake { color: #f87171; }
          #open-car-hud .oc-speed {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 62px;
            line-height: 1;
          }
          #open-car-hud .oc-speed span {
            font-size: 25px;
            font-weight: 800;
            color: #f8fafc;
            letter-spacing: 1px;
          }
          #open-car-hud .oc-speed small {
            margin-top: 2px;
            font-size: 8px;
            letter-spacing: 1.5px;
            color: #94a3b8;
          }
          #open-car-hud .oc-hint {
            margin-top: 5px;
            font-size: 9px;
            letter-spacing: 0.7px;
            color: #94a3b8;
          }
          #open-car-hud .oc-dashboard {
            display: grid;
            grid-template-columns: 160px minmax(150px, 1fr) 138px;
            align-items: center;
            gap: 12px;
            width: 100%;
          }
          #open-car-hud .oc-gauge {
            width: 160px;
            height: 160px;
            filter: drop-shadow(0 0 18px rgba(251, 191, 36, 0.14));
          }
          #open-car-hud .oc-gauge canvas {
            display: block;
            width: 100%;
            height: 100%;
          }
          #open-car-hud .oc-readouts {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
            text-align: left;
          }
          #open-car-hud .oc-digital {
            display: flex;
            align-items: baseline;
            gap: 6px;
            color: #f8fafc;
          }
          #open-car-hud .oc-digital b {
            font-size: 34px;
            font-weight: 900;
            line-height: 0.9;
            letter-spacing: 1px;
            text-shadow: 0 0 18px rgba(251, 191, 36, 0.28);
          }
          #open-car-hud .oc-digital small {
            font-size: 9px;
            font-weight: 800;
            letter-spacing: 1.2px;
            color: #fbbf24;
          }
          #open-car-hud .oc-digital em {
            margin-left: auto;
            font-style: normal;
            font-size: 9px;
            letter-spacing: 0.8px;
            color: #94a3b8;
            white-space: nowrap;
          }
          #open-car-hud .oc-gear-row {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          #open-car-hud .oc-gear {
            min-width: 38px;
            padding: 2px 6px;
            border: 1px solid rgba(148, 163, 184, 0.45);
            border-radius: 5px;
            background: rgba(8, 20, 34, 0.9);
            color: #cbd5e1;
            font-size: 24px;
            font-weight: 900;
            line-height: 1.05;
            text-align: center;
            box-shadow: inset 0 0 12px rgba(34, 211, 238, 0.08);
          }
          #open-car-hud .oc-gear.is-drive {
            color: #a5f3fc;
            border-color: rgba(103, 232, 249, 0.6);
          }
          #open-car-hud .oc-gear.is-reverse {
            color: #fca5a5;
            border-color: rgba(239, 68, 68, 0.65);
          }
          #open-car-hud .oc-gear-row small {
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 1.5px;
            color: #64748b;
          }
          #open-car-hud .oc-meter {
            display: flex;
            flex-direction: column;
            gap: 3px;
          }
          #open-car-hud .oc-meter label {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 6px;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 1.3px;
            color: #94a3b8;
          }
          #open-car-hud .oc-meter label b {
            font-size: 8px;
            color: #cbd5e1;
          }
          #open-car-hud .oc-meter-track {
            height: 7px;
            border-radius: 4px;
            border: 1px solid rgba(148, 163, 184, 0.24);
            background: rgba(15, 23, 42, 0.92);
            overflow: hidden;
          }
          #open-car-hud .oc-meter-track i {
            display: block;
            width: 0%;
            height: 100%;
            border-radius: 3px;
            background: linear-gradient(90deg, #f59e0b, #fde68a);
            box-shadow: 0 0 8px rgba(251, 191, 36, 0.55);
            transition: width 80ms linear;
          }
          #open-car-hud .oc-meter-track i.is-reverse {
            background: linear-gradient(90deg, #dc2626, #fca5a5);
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
          }
          #open-car-hud .oc-meter-boost .oc-meter-track i {
            background: linear-gradient(90deg, #0891b2, #67e8f9);
            box-shadow: 0 0 8px rgba(103, 232, 249, 0.55);
          }
          #open-car-hud .oc-tell-tales {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
          }
          #open-car-hud .oc-tell {
            padding: 2px 5px;
            border: 1px solid rgba(100, 116, 139, 0.35);
            border-radius: 3px;
            background: rgba(15, 23, 42, 0.55);
            color: #475569;
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 0.8px;
          }
          #open-car-hud .oc-tell.is-on {
            color: #fecaca;
            border-color: rgba(239, 68, 68, 0.7);
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.35);
          }
          #open-car-hud #open-car-boost-light.is-on {
            color: #a5f3fc;
            border-color: rgba(103, 232, 249, 0.75);
            box-shadow: 0 0 8px rgba(103, 232, 249, 0.4);
          }
          #open-car-hud #open-car-drift-light.is-on {
            color: #fde68a;
            border-color: rgba(251, 191, 36, 0.75);
            box-shadow: 0 0 8px rgba(251, 191, 36, 0.4);
          }
          #open-car-hud .oc-drive-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }
          #open-car-hud .oc-drive-controls .oc-btn {
            padding: 8px 4px;
            font-size: 9px;
            letter-spacing: 0.7px;
          }
          #open-car-hud .oc-state.is-reverse { color: #fca5a5; }
          #open-car-hud:not(.is-driving) .oc-drive-only { display: none; }
          #open-car-hud.is-driving .oc-near-only { display: none; }
          /* While driving, use a cockpit instrument cluster rather than a menu. */
          #open-car-hud.is-driving .oc-card {
            min-width: 540px;
            max-width: min(94vw, 620px);
            padding: 10px 14px 8px;
            border-color: rgba(251, 191, 36, 0.68);
          }
          #open-car-hud.is-driving .oc-title { display: none; }
          #open-car-hud.is-driving .oc-hint { display: none; }
          #open-car-hud.is-driving .oc-state { margin-top: 6px; font-size: 9px; }
          @media (max-width: 820px) {
            #open-car-hud {
              bottom: max(140px, calc(env(safe-area-inset-bottom) + 128px));
            }
            #open-car-hud.is-driving .oc-card {
              min-width: 0;
              width: calc(100vw - 16px);
              max-width: 460px;
              padding: 7px 9px 6px;
            }
            #open-car-hud.is-driving .oc-dashboard {
              grid-template-columns: 108px minmax(0, 1fr);
              grid-template-areas: "gauge readouts" "controls controls";
              gap: 6px 10px;
            }
            #open-car-hud.is-driving .oc-gauge {
              width: 108px;
              height: 108px;
              grid-area: gauge;
            }
            #open-car-hud.is-driving .oc-readouts {
              grid-area: readouts;
              gap: 4px;
            }
            #open-car-hud.is-driving .oc-drive-controls {
              grid-area: controls;
              grid-template-columns: repeat(4, minmax(0, 1fr));
            }
            #open-car-hud.is-driving .oc-digital b { font-size: 24px; }
            #open-car-hud.is-driving .oc-digital em { display: none; }
            #open-car-hud.is-driving .oc-gear { font-size: 18px; min-width: 30px; }
            #open-car-hud.is-driving .oc-meter label { font-size: 7px; letter-spacing: 0.9px; }
            #open-car-hud.is-driving .oc-meter-track { height: 6px; }
            #open-car-hud.is-driving .oc-tell { font-size: 7px; padding: 1px 4px; }
            #open-car-hud.is-driving .oc-drive-controls .oc-btn {
              padding: 6px 2px;
              font-size: 8px;
              letter-spacing: 0.3px;
            }
            #open-car-hud.is-driving .oc-state { margin-top: 4px; font-size: 8px; }
          }
          @media (max-width: 620px) {
            #open-car-hud .oc-card { min-width: 0; padding: 7px 10px; }
            #open-car-hud .oc-hint { display: none; }
            #open-car-hud .oc-btn { padding: 7px 10px; font-size: 10px; }
            #open-car-hud.is-driving .oc-card {
              width: calc(100vw - 16px);
              max-width: 380px;
              padding: 6px 8px;
            }
            #open-car-hud.is-driving .oc-btn {
              padding: 6px 3px;
              font-size: 9px;
              letter-spacing: 0.4px;
            }
          }
          @media (max-width: 900px) and (orientation: landscape) {
            #open-car-hud.is-driving {
              bottom: max(8px, env(safe-area-inset-bottom));
            }
            #open-car-hud.is-driving .oc-card {
              width: min(500px, calc(100vw - 300px));
              max-width: 500px;
              padding: 6px 9px 5px;
            }
            #open-car-hud.is-driving .oc-dashboard {
              grid-template-columns: 96px minmax(0, 1fr) 130px;
              grid-template-areas: none;
              gap: 8px;
            }
            #open-car-hud.is-driving .oc-gauge {
              width: 96px;
              height: 96px;
              grid-area: auto;
            }
            #open-car-hud.is-driving .oc-readouts {
              grid-area: auto;
              gap: 3px;
            }
            #open-car-hud.is-driving .oc-drive-controls {
              grid-area: auto;
              grid-template-columns: 1fr 1fr;
            }
            #open-car-hud.is-driving .oc-digital b { font-size: 22px; }
            #open-car-hud.is-driving .oc-digital em { display: none; }
            #open-car-hud.is-driving .oc-gear { font-size: 16px; min-width: 26px; }
            #open-car-hud.is-driving .oc-meter label { font-size: 7px; letter-spacing: 0.7px; }
            #open-car-hud.is-driving .oc-meter-track { height: 5px; }
            #open-car-hud.is-driving .oc-tell { font-size: 7px; padding: 1px 3px; }
            #open-car-hud.is-driving .oc-drive-controls .oc-btn { padding: 5px 2px; font-size: 8px; }
            #open-car-hud.is-driving .oc-state { display: none; }
          }
        `;
        document.head.appendChild(style);

        const hud = document.createElement("div");
        hud.id = "open-car-hud";
        hud.innerHTML = `
          <div class="oc-card">
            <div class="oc-title">LAUNCH CENTER · NASA ROAMING CAR</div>
            <button type="button" class="oc-btn oc-btn-primary oc-near-only" id="open-car-action">E · DRIVE</button>
            <div class="oc-hint oc-near-only">WALK UP AND PRESS [E] OR TAP TO DRIVE</div>

            <div class="oc-dashboard oc-drive-only">
              <div class="oc-gauge">
                <canvas id="open-car-speedometer" width="360" height="360" aria-label="Speedometer"></canvas>
              </div>
              <div class="oc-readouts">
                <div class="oc-digital">
                  <b id="open-car-speed">0</b>
                  <small>KM/H</small>
                  <em id="open-car-mph">0 MPH</em>
                </div>
                <div class="oc-gear-row">
                  <span class="oc-gear" id="open-car-gear">N</span>
                  <small>GEAR</small>
                </div>
                <div class="oc-meter">
                  <label><span>THROTTLE</span><b id="open-car-throttle-pct">0%</b></label>
                  <div class="oc-meter-track"><i id="open-car-throttle-fill"></i></div>
                </div>
                <div class="oc-meter oc-meter-boost">
                  <label><span>BOOST</span><b id="open-car-boost-pct">0%</b></label>
                  <div class="oc-meter-track"><i id="open-car-boost-fill"></i></div>
                </div>
                <div class="oc-tell-tales">
                  <span class="oc-tell" id="open-car-brake-light">BRAKE</span>
                  <span class="oc-tell" id="open-car-boost-light">BOOST</span>
                  <span class="oc-tell" id="open-car-drift-light">DRIFT</span>
                </div>
              </div>
              <div class="oc-drive-controls">
                <button type="button" class="oc-btn oc-btn-primary" id="open-car-exit">E · EXIT</button>
                <button type="button" class="oc-btn oc-btn-boost" id="open-car-boost">HOLD · BOOST</button>
                <button type="button" class="oc-btn" id="open-car-cam">CAM · 3RD</button>
                <button type="button" class="oc-btn oc-btn-brake" id="open-car-brake">HOLD · BRAKE</button>
              </div>
            </div>

            <div class="oc-state oc-drive-only" id="open-car-state">CRUISE</div>
          </div>
        `;
        document.body.appendChild(hud);
        this.hud = hud;
      }

      this.speedEl = document.getElementById("open-car-speed");
      this.mphEl = document.getElementById("open-car-mph");
      this.gearEl = document.getElementById("open-car-gear");
      this.statusEl = document.querySelector("#open-car-hud .oc-title");
      this.stateEl = document.getElementById("open-car-state");
      this.camBtn = document.getElementById("open-car-cam");
      this.boostBtn = document.getElementById("open-car-boost");
      this.gaugeCanvas = document.getElementById("open-car-speedometer");
      this.gaugeCtx = this.gaugeCanvas ? this.gaugeCanvas.getContext("2d") : null;
      this.throttleFill = document.getElementById("open-car-throttle-fill");
      this.boostFill = document.getElementById("open-car-boost-fill");
      this.throttlePctEl = document.getElementById("open-car-throttle-pct");
      this.boostPctEl = document.getElementById("open-car-boost-pct");
      this.brakeLight = document.getElementById("open-car-brake-light");
      this.boostLight = document.getElementById("open-car-boost-light");
      this.driftLight = document.getElementById("open-car-drift-light");

      const action = document.getElementById("open-car-action");
      const exit = document.getElementById("open-car-exit");
      const brake = document.getElementById("open-car-brake");
      const boost = document.getElementById("open-car-boost");
      const cam = document.getElementById("open-car-cam");
      if (action) action.addEventListener("click", (e) => { e.preventDefault(); e.currentTarget.blur(); this.enter(); });
      if (exit) exit.addEventListener("click", (e) => { e.preventDefault(); e.currentTarget.blur(); this.exit(); });
      if (cam) cam.addEventListener("click", (e) => { e.preventDefault(); e.currentTarget.blur(); this.toggleCamera(); });
      if (boost) {
        const press = (e) => { e.preventDefault(); if (e.currentTarget) e.currentTarget.blur(); this.boostHeld = true; };
        const release = (e) => { if (e) e.preventDefault(); this.boostHeld = false; };
        boost.addEventListener("pointerdown", press);
        boost.addEventListener("pointerup", release);
        boost.addEventListener("pointercancel", release);
        boost.addEventListener("pointerleave", release);
        boost.addEventListener("contextmenu", (e) => e.preventDefault());
      }
      if (brake) {
        const press = (e) => { e.preventDefault(); if (e.currentTarget) e.currentTarget.blur(); this.brakeHeld = true; };
        const release = (e) => { if (e) e.preventDefault(); this.brakeHeld = false; };
        brake.addEventListener("pointerdown", press);
        brake.addEventListener("pointerup", release);
        brake.addEventListener("pointercancel", release);
        brake.addEventListener("pointerleave", release);
        brake.addEventListener("contextmenu", (e) => e.preventDefault());
      }
    }

    // =========================================================================
    // INPUT
    // =========================================================================
    _bindInput() {
      if (this._keysBound) return;
      this._keysBound = true;

      window.addEventListener("keydown", (e) => {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
        if (e.target && e.target.isContentEditable) return;

        this.keys[e.code] = true;
        if (e.key) this.keys[e.key.toLowerCase()] = true;

        if (!window.isGameStarted || !this.sc.isGroundMode) return;
        if (this._uiBlocked()) return;

        if (e.code === "KeyE" && !e.repeat) {
          if (this.isDriving) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.exit();
            return;
          }
          if (this._nearby()) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.enter();
          }
          return;
        }

        if (this.isDriving && (e.code === "KeyC" || e.key === "c" || e.key === "C") && !e.repeat) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.toggleCamera();
          return;
        }

        if (this.isDriving && (e.code === "Space" || e.code === "ShiftLeft" || e.code === "ShiftRight" ||
            e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD" ||
            e.code === "ArrowUp" || e.code === "ArrowDown" || e.code === "ArrowLeft" || e.code === "ArrowRight")) {
          e.preventDefault();
        }
      }, { passive: false });

      window.addEventListener("keyup", (e) => {
        this.keys[e.code] = false;
        if (e.key) this.keys[e.key.toLowerCase()] = false;
      });

      window.addEventListener("blur", () => {
        this.keys = Object.create(null);
        this.brakeHeld = false;
        this.boostHeld = false;
        this._lookDragging = false;
      });

      // First-person cockpit look: drag anywhere outside the car HUD.
      const canLook = () => !!(this.isDriving && this.firstPerson && !this._uiBlocked());
      window.addEventListener("pointerdown", (e) => {
        if (!canLook()) return;
        if (e.button !== undefined && e.button !== 0) return;
        const target = e.target;
        if (target && target.closest && target.closest("#open-car-hud, #mobile-joystick-zone, #virtual-dpad, #hud-voice-panel, #btn-proximity-use, .hud-checklist-panel, button, input, textarea, select, a")) return;
        this._lookDragging = true;
        this._lookLastX = e.clientX;
        this._lookLastY = e.clientY;
      });
      window.addEventListener("pointermove", (e) => {
        if (!this._lookDragging || !canLook()) return;
        const dx = e.clientX - this._lookLastX;
        const dy = e.clientY - this._lookLastY;
        this._lookLastX = e.clientX;
        this._lookLastY = e.clientY;
        this.lookYaw -= dx * 0.0034;
        this.lookPitch = Math.max(-0.42, Math.min(0.42, this.lookPitch - dy * 0.0034));
      });
      window.addEventListener("pointerup", () => { this._lookDragging = false; });
      window.addEventListener("pointercancel", () => { this._lookDragging = false; });
    }

    _uiBlocked() {
      if (!window.isGameStarted) return true;
      if (window.gameplay && window.gameplay.activeTask) return true;
      if (window.launchCutscene && window.launchCutscene.isPlaying) return true;
      if (window.dockingSim && window.dockingSim.isActive) return true;
      if (window.solarSystem && window.solarSystem.isActive) return true;
      if (window.missionViz && window.missionViz.isActive) return true;
      if (window.issShowcase && window.issShowcase.isActive) return true;
      if (window.vrManager && window.vrManager.isAnyVRActive) return true;
      const overlays = [
        "mission-briefing-overlay",
        "modal-academy",
        "modal-mission-log",
        "modal-auth",
        "modal-station-systems",
        "task-modal-overlay",
        "victory-overlay"
      ];
      for (const id of overlays) {
        const el = document.getElementById(id);
        if (el && el.style && el.style.display && el.style.display !== "none") return true;
      }
      return false;
    }

    _canDrive() {
      if (!window.isGameStarted || !this.sc.isGroundMode) return false;
      if (this.sc.crewBoarded || this.sc.isLaunching) return false;
      if (window.launchCutscene && window.launchCutscene.isPlaying) return false;
      if (window.dockingSim && window.dockingSim.isActive) return false;
      return true;
    }

    _nearby() {
      if (!window.localCrew || !window.localCrew.group) return false;
      if (!window.localCrew.group.visible) return false;
      const crew = window.localCrew.group.position;
      const car = this.group.position;
      if (Math.abs(crew.y - car.y) > 3.0) return false;
      return Math.hypot(crew.x - car.x, crew.z - car.z) <= 4.2;
    }

    toggleCamera() {
      if (!this.isDriving) return;
      this.firstPerson = !this.firstPerson;
      this.lookYaw = 0;
      this.lookPitch = 0;
      this._lookDragging = false;
      this._camInitialised = false;
      if (this.driver) this.driver.visible = false;
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = !this.firstPerson;
      }
      if (this.camBtn) {
        this.camBtn.textContent = this.firstPerson ? "CAM · 1ST" : "CAM · 3RD";
        this.camBtn.classList.toggle("is-active", this.firstPerson);
      }
      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast(this.firstPerson ? "COCKPIT VIEW · DRAG TO LOOK · C TO SWITCH" : "CHASE VIEW · C TO SWITCH");
      }
      this._updateHud();
    }

    // =========================================================================
    // ENTER / EXIT
    // =========================================================================
    _resetDriveReadouts() {
      this.throttleInput = 0;
      this.steerInput = 0;
      this.displayKmh = 0;
      this.displayThrottle = 0;
      this.displayBoost = 0;
    }

    enter() {
      if (this.isDriving || !this._canDrive()) return false;
      this.isDriving = true;
      this.speed = 0;
      this.steer = 0;
      this.brakeHeld = false;
      this.boostHeld = false;
      this.boosting = false;
      this.drifting = false;
      this.lookYaw = 0;
      this.lookPitch = 0;
      this._lookDragging = false;
      this.keys = Object.create(null);
      this._camInitialised = false;
      this._resetDriveReadouts();

      if (window.localCrew && window.localCrew.group) {
        this.localCrewWasVisible = window.localCrew.group.visible;
        window.localCrew.group.visible = !this.firstPerson;
      }

      this._applyDriverSuit();
      if (this.driver) this.driver.visible = false;
      if (this.label) this.label.visible = false;

      // A flight-crew member stepping out of the gantry uses the ground-level
      // site-tour collision/camera rules while driving. Ground crew already do.
      if (!this.sc.siteTourActive && typeof this.sc._isLocalGroundCrew === "function" && !this.sc._isLocalGroundCrew()) {
        this.sc.siteTourActive = true;
        if (typeof this.sc._syncSpaceGamesLock === "function") this.sc._syncSpaceGamesLock();
        if (typeof this.sc._renderGroundHUD === "function") this.sc._renderGroundHUD();
      }

      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(this.yaw, 0.03);
      }
      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast("NASA OPEN CAR READY · W/S THROTTLE · A/D STEER · SHIFT BOOST · SPACE DRIFT/BRAKE · C VIEW · [E] EXIT");
      }
      this._syncLocalCrewPose(true);
      this._updateDriverAnimation(1 / 60);
      this._updateHud();
      return true;
    }

    exit() {
      if (!this.isDriving) return false;
      const exitPos = this._findExitPosition();
      this.isDriving = false;
      this.speed = 0;
      this.steer = 0;
      this.brakeHeld = false;
      this.boostHeld = false;
      this.boosting = false;
      this.drifting = false;
      this._lookDragging = false;
      this.keys = Object.create(null);
      this._camInitialised = false;
      this._resetDriveReadouts();

      if (this.driver) this.driver.visible = false;
      if (this.label) this.label.visible = true;

      const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
      const exitY = terrain
        ? terrain.getSurfaceHeightAt(exitPos.x, exitPos.z, this.group.position.y)
        : this.group.position.y;
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = true;
        window.localCrew.group.position.set(exitPos.x, exitY, exitPos.z);
        window.localCrew.group.rotation.set(0, this.yaw, 0);
      }
      if (this._netPos) {
        this._netPos.set(exitPos.x, exitY, exitPos.z);
        this._broadcastPose(this._netPos, this.yaw, false, true);
      }
      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(this.yaw, 0.02);
      }
      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast("OPEN CAR PARKED · WALK BACK UP TO IT AND PRESS [E] TO DRIVE");
      }
      this._clearDriverPose();
      this._updateHud();
      return true;
    }

    /**
     * Stops driving without moving the astronaut. Used by teleports, site-tour
     * exits, launch transitions and mission resets.
     */
    forceExit() {
      if (!this.isDriving) return;
      this.isDriving = false;
      this.speed = 0;
      this.steer = 0;
      this.brakeHeld = false;
      this.boostHeld = false;
      this.boosting = false;
      this.drifting = false;
      this._lookDragging = false;
      this.keys = Object.create(null);
      this._camInitialised = false;
      this._resetDriveReadouts();
      if (this.driver) this.driver.visible = false;
      if (this.label) this.label.visible = true;
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = this.sc.isGroundMode && !this.sc.crewBoarded;
        window.localCrew.group.rotation.set(0, window.localCrew.group.rotation.y, 0);
      }
      if (this._netPos && this.group) {
        this._netPos.copy(this.group.position);
        this._broadcastPose(this._netPos, this.yaw, false, true);
      }
      this._clearDriverPose();
      this._updateHud();
    }

    _findExitPosition() {
      const x = this.group.position.x;
      const z = this.group.position.z;
      const candidates = [
        // Driver-side door (left of the car)
        { x: x - Math.cos(this.yaw) * 1.65, z: z + Math.sin(this.yaw) * 1.65 },
        // Passenger side
        { x: x + Math.cos(this.yaw) * 1.65, z: z - Math.sin(this.yaw) * 1.65 },
        // Behind
        { x: x - Math.sin(this.yaw) * 3.0, z: z - Math.cos(this.yaw) * 3.0 },
        { x, z }
      ];
      for (const candidate of candidates) {
        if (!this._blocked(candidate.x, candidate.z, 0.45, this.group.position.y)) return candidate;
      }
      return { x, z };
    }

    _applyDriverSuit() {
      if (!this.driverSuitMat) return;
      let color = null;
      if (window.localCrew && window.localCrew.color) color = window.localCrew.color;
      if (!color && window.netManager && window.netManager.localPlayer) color = window.netManager.localPlayer.color;
      try {
        this.driverSuitMat.color.set(color || "#67e8f9");
      } catch (e) {
        this.driverSuitMat.color.setHex(0x67e8f9);
      }
    }

    // =========================================================================
    // PHYSICS LOOP
    // =========================================================================
    update(delta) {
      if (!this.group) return;
      this._lastDelta = Math.max(0.001, Math.min(0.05, delta || 0.016));

      if (this.isDriving && !this._canDrive()) {
        this.forceExit();
      }

      if (this.isDriving) {
        this._drive(this._lastDelta);
      } else {
        this._idle(this._lastDelta);
      }

      this._updateVisibility();
      this._updateHud();
    }

    _drive(delta) {
      const forward = this._key("KeyW", "ArrowUp", "w", "virtualMoveUp") ? 1 : 0;
      const reverse = this._key("KeyS", "ArrowDown", "s", "virtualMoveDown") ? 1 : 0;
      const left = this._key("KeyA", "ArrowLeft", "a", "virtualMoveLeft") ? 1 : 0;
      const right = this._key("KeyD", "ArrowRight", "d", "virtualMoveRight") ? 1 : 0;
      const braking = this.brakeHeld || this._key("Space", " ");
      const boostHeld = this.boostHeld || this._key("ShiftLeft", "ShiftRight", "shift");
      const joyActive = !!window.virtualJoyActive;
      const joyY = joyActive ? Math.max(-1, Math.min(1, window.virtualJoyY || 0)) : 0;
      const joyX = joyActive ? Math.max(-1, Math.min(1, window.virtualJoyX || 0)) : 0;

      const throttle = Math.max(-1, Math.min(1, (forward - reverse) + joyY));
      const previousSpeed = this.speed;
      const speedAbs = Math.abs(this.speed);
      // The chase camera sits behind the car and looks along +Z, so world +X
      // appears on the LEFT of the screen. Invert the input here so D / right
      // stick actually turns the car to the viewer's right.
      const steerInput = Math.max(-1, Math.min(1, (left - right) - joyX));
      const driftRequested = braking && speedAbs > 5.0 && Math.abs(steerInput) > 0.12;
      const drifting = driftRequested && Math.abs(this.speed) > 3.0;
      const boosting = boostHeld && throttle > 0 && this.speed >= -0.1;
      this.boosting = boosting;
      this.drifting = drifting;
      this.throttleInput = throttle;
      this.steerInput = steerInput;

      if (throttle > 0) {
        if (boosting) {
          this.speed += BOOST_ACCELERATION * delta;
        } else if (this.speed < MAX_FORWARD_SPEED) {
          this.speed += 8.2 * delta;
        }
      } else if (throttle < 0) {
        this.speed -= 5.8 * delta;
      } else {
        const drag = 2.2 * delta + Math.abs(this.speed) * 0.35 * delta;
        if (Math.abs(this.speed) <= drag) this.speed = 0;
        else this.speed -= Math.sign(this.speed) * drag;
      }

      if (braking) {
        // A straight-line handbrake stops the car quickly. Holding it through a
        // fast turn only scrubs speed, which lets the rear step out into a slide.
        const brakeForce = (drifting ? 4.2 : 18) * delta;
        if (Math.abs(this.speed) <= brakeForce) this.speed = 0;
        else this.speed -= Math.sign(this.speed) * brakeForce;
      }

      // Boost raises the ceiling; releasing SHIFT lets the car coast back to
      // the normal top speed naturally instead of snapping down instantly.
      if (!boosting && this.speed > MAX_FORWARD_SPEED) {
        this.speed -= (this.speed - MAX_FORWARD_SPEED) * Math.min(1, delta * 2.2);
      }
      this.speed = Math.max(-MAX_REVERSE_SPEED, Math.min(MAX_BOOST_SPEED, this.speed));

      // Drifting gives sharper steering authority without turning the car into
      // an uncontrollable top; normal high-speed arcs keep the stable angle.
      const maxSteer = drifting
        ? 0.42 - Math.min(0.09, Math.abs(this.speed) * 0.0055)
        : 0.54 - Math.min(0.36, Math.abs(this.speed) * 0.022);
      const steerTarget = steerInput * maxSteer;
      this.steer += (steerTarget - this.steer) * Math.min(1, delta * (drifting ? 10.5 : 7.5));

      if (Math.abs(this.speed) > 0.015) {
        const rawYawRate = (this.speed / WHEELBASE) * Math.tan(this.steer);
        const yawRate = rawYawRate * (drifting ? 1.2 : 1.0);
        const yawCap = drifting ? 2.4 : 3.6;
        this.yaw += Math.max(-yawCap, Math.min(yawCap, yawRate)) * delta;
      }

      // Lateral slide: while the handbrake is held in a turn, the car keeps
      // travelling partly toward the outside of the corner instead of snapping
      // exactly to its new heading.
      const lateralSpeed = drifting ? this.speed * this.steer * 0.65 : 0;
      this.lateralSpeed = lateralSpeed;
      const rightX = -Math.cos(this.yaw);
      const rightZ = Math.sin(this.yaw);
      const dx = Math.sin(this.yaw) * this.speed * delta + rightX * lateralSpeed * delta;
      const dz = Math.cos(this.yaw) * this.speed * delta + rightZ * lateralSpeed * delta;
      const px = this.group.position.x;
      const pz = this.group.position.z;
      const nx = px + dx;
      const nz = pz + dz;
      const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
      const bounds =
        (window.SpaceCenterModules &&
          window.SpaceCenterModules.constants &&
          window.SpaceCenterModules.constants.SITE_BOUNDS) ||
        undefined;
      const boxes = (this.sc.site && this.sc.site.boxColliders) || [];
      const circles = (this.sc.site && this.sc.site.circleColliders) || [];

      let targetY = this.group.position.y;
      if (terrain && typeof terrain.resolveMovement === "function") {
        const res = terrain.resolveMovement(
          px,
          pz,
          nx,
          nz,
          CAR_RADIUS,
          this.group.position.y,
          boxes,
          circles,
          bounds
        );
        this.group.position.x = res.x;
        this.group.position.z = res.z;
        targetY = res.y;
        if (res.blocked) {
          if (res.slid) {
            this.speed *= 0.88;
          } else {
            this.speed = Math.abs(this.speed) > 1.0 ? -this.speed * 0.12 : 0;
          }
        }
      } else if (!this._blocked(nx, nz)) {
        this.group.position.x = nx;
        this.group.position.z = nz;
      } else if (!this._blocked(nx, pz)) {
        this.group.position.x = nx;
        this.speed *= 0.72;
      } else if (!this._blocked(px, nz)) {
        this.group.position.z = nz;
        this.speed *= 0.72;
      } else {
        this.speed = Math.abs(this.speed) > 1.0 ? -this.speed * 0.12 : 0;
      }

      const yBlend = 1 - Math.exp(-delta * 28);
      this.group.position.y += (targetY - this.group.position.y) * yBlend;
      this.group.rotation.y = this.yaw;

      // Wheels: spin with road speed and steer the front pair.
      const spinDelta = (this.speed * delta) / WHEEL_RADIUS;
      const steerVisual = this.steer;
      this.wheels.forEach((wheel) => {
        wheel.spin.rotation.x += spinDelta;
        if (wheel.front) {
          wheel.pivot.rotation.y += (steerVisual - wheel.pivot.rotation.y) * Math.min(1, delta * 10);
        }
      });

      // Slope-aligned body pitch/roll combined with dynamic suspension response.
      const slope =
        terrain && typeof terrain.getSurfaceSlopePitchRoll === "function"
          ? terrain.getSurfaceSlopePitchRoll(
              this.group.position.x,
              this.group.position.z,
              this.yaw,
              this.group.position.y
            )
          : { pitch: 0, roll: 0 };
      const accel = (this.speed - previousSpeed) / Math.max(0.001, delta);
      const dynPitch = Math.max(-0.045, Math.min(0.045, -accel * 0.0032));
      const dynRoll = (this.steer * Math.abs(this.speed) / MAX_FORWARD_SPEED) * (drifting ? 0.19 : 0.1);
      const targetPitch = slope.pitch + dynPitch;
      const targetRoll = slope.roll + dynRoll;
      this._bodyPitch += (targetPitch - this._bodyPitch) * Math.min(1, delta * 9);
      this._bodyRoll += (targetRoll - this._bodyRoll) * Math.min(1, delta * 8);
      if (this.body) {
        this.body.rotation.x = this._bodyPitch;
        this.body.rotation.z = this._bodyRoll;
        this.body.position.y = Math.sin(performance.now() * 0.008) * Math.min(0.012, Math.abs(this.speed) * 0.0015);
      }

      if (this.steerWheel) this.steerWheel.rotation.z = -this.steer * 1.8;

      // Brake/tail lights and warning beacon.
      const brakeGlow = braking || this.speed < -0.1 ? 2.3 : 0.65;
      for (const mat of this.brakeLightMats) mat.emissiveIntensity = brakeGlow;
      if (this.beaconMat) {
        this.beaconMat.emissiveIntensity = 0.55 + (Math.sin(performance.now() * 0.012) > 0.25 ? 1.8 : 0.15);
      }

      this._syncLocalCrewPose();
      this._updateDriverAnimation(delta);
    }

    _idle(delta) {
      this.boosting = false;
      this.drifting = false;
      this.lateralSpeed = 0;
      const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
      if (terrain && this.group) {
        const targetY = terrain.getSurfaceHeightAt(
          this.group.position.x,
          this.group.position.z,
          this.group.position.y
        );
        this.group.position.y += (targetY - this.group.position.y) * Math.min(1, delta * 16);
      }
      const slope =
        terrain && this.group && typeof terrain.getSurfaceSlopePitchRoll === "function"
          ? terrain.getSurfaceSlopePitchRoll(
              this.group.position.x,
              this.group.position.z,
              this.yaw,
              this.group.position.y
            )
          : { pitch: 0, roll: 0 };
      if (this.body) {
        this._bodyPitch += (slope.pitch - this._bodyPitch) * Math.min(1, delta * 7);
        this._bodyRoll += (slope.roll - this._bodyRoll) * Math.min(1, delta * 7);
        this.body.rotation.x = this._bodyPitch;
        this.body.rotation.z = this._bodyRoll;
        this.body.position.y = 0;
      }
      if (this.beaconMat) {
        this.beaconMat.emissiveIntensity = 0.5 + Math.sin(performance.now() * 0.0025) * 0.18;
      }
    }

    _key(code, alternateCode, letter, virtualVar) {
      if (this.keys[code] || this.keys[alternateCode] || this.keys[letter]) return true;
      return !!(virtualVar && window[virtualVar]);
    }

    _blocked(x, z, radius, currentY) {
      const r = typeof radius === "number" ? radius : CAR_RADIUS;
      const sc = this.sc;
      const bounds = (window.SpaceCenterModules && window.SpaceCenterModules.constants && window.SpaceCenterModules.constants.SITE_BOUNDS) || {
        minX: -1050,
        maxX: 525,
        minZ: -850,
        maxZ: 850
      };
      const boxes = (sc.site && sc.site.boxColliders) || [];
      const circles = (sc.site && sc.site.circleColliders) || [];
      const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
      const refY = typeof currentY === "number" ? currentY : this.group ? this.group.position.y : 0;
      if (terrain && typeof terrain.isBlocked === "function") {
        return terrain.isBlocked(x, z, r, refY, boxes, circles, bounds);
      }

      if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return true;
      for (const box of boxes) {
        if (box.disabled) continue;
        if (box.rotated) {
          const dx = x - box.cx;
          const dz = z - box.cz;
          const lx = dx * box.cos - dz * box.sin;
          const lz = dx * box.sin + dz * box.cos;
          if (Math.abs(lx) < box.halfW + r && Math.abs(lz) < box.halfD + r) return true;
          continue;
        }
        if (x > box.minX - r && x < box.maxX + r && z > box.minZ - r && z < box.maxZ + r) return true;
      }
      for (const circle of circles) {
        if (Math.hypot(x - circle.x, z - circle.z) < circle.r + r) return true;
      }
      return false;
    }

    _syncLocalCrewPose(force = false) {
      if (!this._netPos) return;
      const p = this.group.position;
      this._netPos.set(p.x, p.y, p.z);
      if (window.localCrew && window.localCrew.group) {
        if (this.driverSeat) {
          // The seat anchor is inside the suspension body, so the crewmate
          // follows the car's pitch/roll as well as its yaw.
          this.group.updateWorldMatrix(true, true);
          this.driverSeat.getWorldPosition(window.localCrew.group.position);
          this.driverSeat.getWorldQuaternion(window.localCrew.group.quaternion);
        } else {
          window.localCrew.group.position.copy(this._netPos);
          window.localCrew.group.rotation.y = this.yaw;
        }
        // Entering the car while the on-foot camera was in first person leaves
        // the rig's model container hidden; restore it for the external view.
        if (window.localCrew.rig && window.localCrew.rig.modelContainer) {
          window.localCrew.rig.modelContainer.visible = true;
        }
        if (window.localCrew.rig && window.localCrew.rig.emoteBubble) {
          window.localCrew.rig.emoteBubbleHidden = false;
        }
        window.localCrew.group.visible = !this.firstPerson;
      }
      this._broadcastPose(this._netPos, this.yaw, true, force);
    }

    _updateDriverAnimation(delta) {
      const crew = window.localCrew;
      if (!this.isDriving || !crew || !crew.rig || typeof crew.rig.updateAnimation !== "function") return;
      crew.rig.updateAnimation(delta, false, crew.isEva, true, null, false, false, true, this.steer);
    }

    /**
     * Restores the local crew rig to its standing animation immediately after
     * leaving the car, so the astronaut does not blend out of the seat pose
     * while already standing at the door.
     */
    _clearDriverPose() {
      const crew = window.localCrew;
      if (!crew || !crew.rig) return;
      crew.rig.seatedBlend = 0;
      crew.rig.wasSeated = false;
      if (crew.rig.shadowMesh) crew.rig.shadowMesh.visible = true;
      if (crew.rig.accentRing) crew.rig.accentRing.visible = true;
      if (typeof crew.rig.updateAnimation === "function") {
        crew.rig.updateAnimation(1 / 60, false, crew.isEva, true, null, false, false, false, 0);
      }
    }

    _broadcastPose(pos, yaw, driving, force) {
      if (!pos) return;
      if (!window.netManager || typeof window.netManager.sendPlayerUpdate !== "function") return;
      window.netManager.sendPlayerUpdate(pos, yaw, 0.03, false, false, false, !!driving, !!force);
    }

    // =========================================================================
    // VISUALS / CAMERA / HUD
    // =========================================================================
    updateCamera(camera) {
      if (!camera || !this.group) return;
      const T = window.THREE;
      const p = this.group.position;

      if (this.firstPerson) {
        if (window.localCrew && window.localCrew.group) window.localCrew.group.visible = false;
        if (this.driver) this.driver.visible = false;
        if (!this._camHead && T) {
          this._camHead = new T.Vector3();
          this._camDir = new T.Vector3();
        }
        if (!this._camHead) return;
        // Driver eye position in body space, so suspension pitch/roll moves the view.
        this._camHead.set(-0.44, 1.63, -0.18);
        if (this.body) this.body.localToWorld(this._camHead);
        const bob = Math.sin(performance.now() * 0.012) * Math.min(0.015, Math.abs(this.speed) * 0.0011);
        this._camHead.y += bob;
        const pitch = Math.max(-0.6, Math.min(0.6, this.lookPitch - this._bodyPitch * 0.45));
        const yaw = this.yaw + this.lookYaw;
        if (!this._camInitialised) {
          camera.position.copy(this._camHead);
          this._camInitialised = true;
        } else {
          const blend = 1 - Math.exp(-Math.max(0.001, this._lastDelta) * 28);
          camera.position.lerp(this._camHead, blend);
        }
        this._camDir.set(
          Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(yaw) * Math.cos(pitch)
        );
        camera.lookAt(
          camera.position.x + this._camDir.x,
          camera.position.y + this._camDir.y,
          camera.position.z + this._camDir.z
        );
        return;
      }

      if (this.driver) this.driver.visible = false;
      if (window.localCrew && window.localCrew.group && this.isDriving) {
        window.localCrew.group.visible = true;
      }
      const speedRatio = Math.min(1, Math.abs(this.speed) / MAX_BOOST_SPEED);
      const distance = 7.4 + speedRatio * 1.0 + (this.boosting ? 0.6 : 0);
      const height = 3.35 + speedRatio * 0.2;
      const desiredX = p.x - Math.sin(this.yaw) * distance;
      const desiredZ = p.z - Math.cos(this.yaw) * distance;
      const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
      const camGroundY = terrain ? terrain.getSurfaceHeightAt(desiredX, desiredZ, p.y) : 0;
      const desiredY = Math.max(p.y + height, camGroundY + 1.15);

      if (!this._camInitialised) {
        camera.position.set(desiredX, desiredY, desiredZ);
        this._camInitialised = true;
      } else {
        const blend = 1 - Math.exp(-Math.max(0.001, this._lastDelta) * 6.5);
        camera.position.x += (desiredX - camera.position.x) * blend;
        camera.position.y += (desiredY - camera.position.y) * blend;
        camera.position.z += (desiredZ - camera.position.z) * blend;
      }
      const lookAhead = 2.6 + speedRatio * 1.8;
      camera.lookAt(
        p.x + Math.sin(this.yaw) * lookAhead,
        p.y + 1.25 + Math.sin(-this._bodyPitch) * 1.4,
        p.z + Math.cos(this.yaw) * lookAhead
      );
    }

    _updateVisibility() {
      if (!this.group) return;
      const active = !!(window.isGameStarted && this.sc.isGroundMode && !this.sc.crewBoarded);
      this.group.visible = active || this.isDriving;
      if (this.label) {
        this.label.visible = active && !this.isDriving && this._nearbyForLabel();
      }
    }

    _nearbyForLabel() {
      if (!window.localCrew || !window.localCrew.group) return false;
      const crew = window.localCrew.group.position;
      if (Math.abs(crew.y - this.group.position.y) > 3.0) return false;
      return Math.hypot(crew.x - this.group.position.x, crew.z - this.group.position.z) <= 48;
    }

    _updateHud() {
      if (!this.hud) return;
      const active = !!(
        window.isGameStarted &&
        this.sc.isGroundMode &&
        !this.sc.crewBoarded &&
        !this.sc.isLaunching &&
        !(window.launchCutscene && window.launchCutscene.isPlaying) &&
        !(window.dockingSim && window.dockingSim.isActive) &&
        !(window.solarSystem && window.solarSystem.isActive) &&
        !(window.missionViz && window.missionViz.isActive) &&
        !(window.issShowcase && window.issShowcase.isActive) &&
        !(window.vrManager && window.vrManager.isAnyVRActive) &&
        !this._uiBlocked()
      );

      const show = active && (this.isDriving || this._nearby());
      if (this.sc && typeof this.sc._syncGroundPresentationMode === "function") {
        this.sc._syncGroundPresentationMode();
      }
      this.hud.classList.toggle("is-visible", show);
      this.hud.classList.toggle("is-driving", this.isDriving);
      const rawKmh = Math.abs(this.speed) * 3.6;
      const smoothDt = Math.max(0.001, Math.min(0.05, this._lastDelta || 0.016));
      const smoothing = 1 - Math.exp(-smoothDt * 10);
      this.displayKmh += (rawKmh - this.displayKmh) * smoothing;
      const throttle = this.throttleInput || 0;
      const throttleTarget = throttle > 0 ? throttle : Math.abs(throttle) * 0.65;
      this.displayThrottle += (throttleTarget - this.displayThrottle) * smoothing;
      const boostTarget = this.boosting ? 1 : 0;
      this.displayBoost += (boostTarget - this.displayBoost) * smoothing;

      const braking = this.brakeHeld || this._key("Space", " ");
      const kmh = Math.round(this.displayKmh);
      if (this.speedEl) this.speedEl.textContent = String(kmh);
      if (this.mphEl) this.mphEl.textContent = `${Math.round(kmh * 0.621371)} MPH`;
      if (this.gearEl) {
        const gear = this.speed < -0.4 || (Math.abs(this.speed) < 0.4 && throttle < -0.05)
          ? "R"
          : (Math.abs(this.speed) < 0.4 && Math.abs(throttle) < 0.05 ? "N" : "D");
        this.gearEl.textContent = gear;
        this.gearEl.classList.toggle("is-drive", gear === "D");
        this.gearEl.classList.toggle("is-reverse", gear === "R");
      }
      const throttlePct = Math.round(this.displayThrottle * 100);
      if (this.throttleFill) {
        this.throttleFill.style.width = `${throttlePct}%`;
        this.throttleFill.classList.toggle("is-reverse", throttle < -0.05);
      }
      if (this.throttlePctEl) this.throttlePctEl.textContent = `${throttlePct}%`;
      const boostPct = Math.round(this.displayBoost * 100);
      if (this.boostFill) this.boostFill.style.width = `${boostPct}%`;
      if (this.boostPctEl) this.boostPctEl.textContent = `${boostPct}%`;
      if (this.brakeLight) this.brakeLight.classList.toggle("is-on", !!braking);
      if (this.boostLight) this.boostLight.classList.toggle("is-on", !!(this.boosting || this.boostHeld));
      if (this.driftLight) this.driftLight.classList.toggle("is-on", !!this.drifting);
      if (this.isDriving && show) {
        this._drawSpeedometer(this.displayKmh, this.displayThrottle, this.displayBoost);
      }

      if (this.statusEl) {
        this.statusEl.textContent = this.isDriving
          ? "LAUNCH CENTER · NASA ROAMING CAR · DRIVING"
          : "LAUNCH CENTER · NASA ROAMING CAR";
      }
      if (this.stateEl) {
        const state = this.drifting ? "DRIFT" : this.boosting ? "BOOST" : braking ? "BRAKE" : this.speed < -0.4 ? "REVERSE" : "CRUISE";
        this.stateEl.textContent = state;
        this.stateEl.classList.toggle("is-drift", state === "DRIFT");
        this.stateEl.classList.toggle("is-boost", state === "BOOST");
        this.stateEl.classList.toggle("is-brake", state === "BRAKE");
        this.stateEl.classList.toggle("is-reverse", state === "REVERSE");
      }
      if (this.camBtn) {
        this.camBtn.textContent = this.firstPerson ? "CAM · 1ST" : "CAM · 3RD";
        this.camBtn.classList.toggle("is-active", this.firstPerson);
      }
      if (this.boostBtn) {
        this.boostBtn.classList.toggle("is-active", this.boosting || this.boostHeld);
      }
      this._stackAboveGroundHud();
    }

    _drawSpeedometer(kmh, throttle, boost) {
      const canvas = this.gaugeCanvas;
      if (!canvas) return;
      const now = performance.now();
      if (now - this._lastGaugeDraw < 32) return;
      this._lastGaugeDraw = now;
      const ctx = this.gaugeCtx || (this.gaugeCtx = canvas.getContext("2d"));
      if (!ctx) return;

      const W = canvas.width || 360;
      const H = canvas.height || 360;
      const cx = W * 0.5;
      const cy = H * 0.5;
      const r = Math.min(W, H) * 0.42;
      const start = Math.PI * 0.75;
      const sweep = Math.PI * 1.5;
      const maxKmh = 120;
      const speed = Math.max(0, Math.min(maxKmh, kmh));
      const needleAngle = start + (speed / maxKmh) * sweep;

      ctx.clearRect(0, 0, W, H);

      // Instrument housing and face.
      ctx.beginPath();
      ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
      ctx.fillStyle = "#070c14";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(251, 191, 36, 0.42)";
      ctx.stroke();

      const face = ctx.createRadialGradient(cx, cy, 8, cx, cy, r);
      face.addColorStop(0, "#101b2b");
      face.addColorStop(1, "#03070d");
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = face;
      ctx.fill();

      // Scale ticks and labels.
      for (let v = 0; v <= maxKmh; v += 5) {
        const a = start + (v / maxKmh) * sweep;
        const major = v % 20 === 0;
        const inner = r - (major ? 30 : 20);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
        ctx.strokeStyle = v >= 90
          ? "rgba(248, 113, 113, 0.9)"
          : major ? "rgba(226, 232, 240, 0.9)" : "rgba(148, 163, 184, 0.4)";
        ctx.lineWidth = major ? 3 : 1.5;
        ctx.stroke();
        if (major) {
          const labelR = r - 48;
          ctx.fillStyle = v >= 90 ? "#fca5a5" : "#cbd5e1";
          ctx.font = "700 20px Courier New, monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(v), cx + Math.cos(a) * labelR, cy + Math.sin(a) * labelR);
        }
      }

      // Accelerator and boost arcs inside the scale.
      if (throttle > 0.01) {
        ctx.beginPath();
        ctx.arc(cx, cy, r - 64, start, start + sweep * Math.min(1, throttle));
        ctx.strokeStyle = "rgba(251, 191, 36, 0.88)";
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      if (boost > 0.01) {
        ctx.beginPath();
        ctx.arc(cx, cy, r - 74, start, start + sweep * Math.min(1, boost));
        ctx.strokeStyle = "rgba(103, 232, 249, 0.9)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      // Redline arc.
      ctx.beginPath();
      ctx.arc(cx, cy, r - 8, start + (90 / maxKmh) * sweep, start + sweep);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.72)";
      ctx.lineWidth = 5;
      ctx.stroke();

      // Needle.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(needleAngle);
      ctx.beginPath();
      ctx.moveTo(-10, -5);
      ctx.lineTo(r - 26, 0);
      ctx.lineTo(-10, 5);
      ctx.closePath();
      ctx.fillStyle = "#fbbf24";
      ctx.shadowColor = "rgba(251, 191, 36, 0.8)";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.8)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = "#fbbf24";
      ctx.font = "900 20px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("KM/H", cx, cy + 62);
      ctx.fillStyle = "#64748b";
      ctx.font = "700 12px Arial, Helvetica, sans-serif";
      ctx.fillText("LC-39A ROVER", cx, cy + 84);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 11px monospace";
      ctx.fillText("NASA", cx, cy - 82);
    }

    /**
     * The Site Tour panel is also bottom-centered. Measure it (throttled) and
     * lift the car prompt just above it instead of letting the two overlap.
     */
    _stackAboveGroundHud() {
      if (!this.hud) return;
      const groundHud = document.getElementById("space-center-ground-hud");
      // Driving hides the site-tour dock in CSS; do not float the car card up
      // into empty space above it.
      const groundVisible = !!(groundHud && groundHud.style.display !== "none" &&
        !document.body.classList.contains("ground-car-driving"));
      if (!groundVisible || !this.hud.classList.contains("is-visible")) {
        if (this.hud.style.bottom !== "") this.hud.style.bottom = "";
        return;
      }
      const now = performance.now();
      if (now - this._lastGroundHudMeasure < 200) return;
      this._lastGroundHudMeasure = now;
      const rect = groundHud.getBoundingClientRect();
      if (!rect || rect.height < 8) {
        if (this.hud.style.bottom !== "") this.hud.style.bottom = "";
        return;
      }
      const lift = Math.max(18, window.innerHeight - rect.top + 10);
      const maxLift = Math.max(18, window.innerHeight - 190);
      this.hud.style.bottom = `${Math.min(lift, maxLift).toFixed(0)}px`;
    }
  }

  window.SpaceCenterOpenCar = SpaceCenterOpenCar;
})(window);
