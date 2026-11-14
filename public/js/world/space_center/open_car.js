/**
 * Space Center LC-39A — Drivable Open-Top NASA Ground Car
 * ============================================================================
 * A small, fully procedural open car parked on the apron-side parking pad near
 * the Pad 39A ground spawn. Players walk up, press [E], and drive around the
 * Kennedy Space Center site tour — crawlerway, VAB apron, LCC roads and beach.
 *
 * - Open cockpit (no roof): seats, dashboard, windshield frame, roll bar.
 * - WASD / arrows / mobile D-pad: throttle, reverse and steering.
 * - Space or the on-screen button: brake. [E] or the prompt button: exit.
 * - Uses the Space Center site collider volumes so it cannot drive through the
 *   pad hardstand, VAB walls, LCC, crawler or utility buildings.
 * - Car movement drives the local crew position as well, so proximity voice,
 *   network interpolation and mission logic continue to see the player there.
 */
(function (window) {
  "use strict";

  const CAR_SPAWN = { x: 33, y: 0.1, z: 160, yaw: 0.08 };
  const CAR_RADIUS = 1.35;
  const MAX_FORWARD_SPEED = 16.5; // m/s (~59 km/h)
  const MAX_REVERSE_SPEED = 6.5;
  const WHEEL_RADIUS = 0.44;
  const WHEELBASE = 2.85;

  class SpaceCenterOpenCar {
    constructor(spaceCenter) {
      this.sc = spaceCenter;
      this.group = null;
      this.body = null;
      this.driver = null;
      this.driverSuitMat = null;
      this.steerWheel = null;
      this.beaconMat = null;
      this.brakeLightMats = [];
      this.wheels = [];
      this.label = null;
      this.hud = null;
      this.speedEl = null;
      this.statusEl = null;

      this.isDriving = false;
      this.speed = 0;
      this.steer = 0;
      this.yaw = CAR_SPAWN.yaw;
      this.brakeHeld = false;
      this.keys = Object.create(null);
      this._keysBound = false;
      this._camInitialised = false;
      this._lastDelta = 0.016;
      this._bodyPitch = 0;
      this._bodyRoll = 0;
      this._netPos = null;
      this._wasVisible = false;
    }

    // =========================================================================
    // SCENE ASSEMBLY
    // =========================================================================
    build() {
      const T = window.THREE;
      const sc = this.sc;
      if (!T || !sc || !sc.group) return this;

      this._buildMaterials();
      this._buildParkingPad();

      this.group = new T.Group();
      this.group.name = "SpaceCenter_OpenCar";
      this.group.position.set(CAR_SPAWN.x, CAR_SPAWN.y, CAR_SPAWN.z);
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
      this._buildLabel();

      this._netPos = new T.Vector3(CAR_SPAWN.x, 0.2, CAR_SPAWN.z);
      this._buildHud();
      this._bindInput();

      if (sc.site && Array.isArray(sc.site.circleColliders)) {
        // The car is a moving prop; the site tour collision list is static, so
        // do not register a permanent collider at the parking spot.
      }
      return this;
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

    _buildParkingPad() {
      const T = window.THREE;
      const pad = new T.Mesh(
        new T.BoxGeometry(7.2, 0.08, 6.4),
        new T.MeshStandardMaterial({ color: 0x8d969e, roughness: 0.94, metalness: 0.03 })
      );
      pad.name = "OpenCarParkingPad";
      pad.position.set(CAR_SPAWN.x, 0.04, CAR_SPAWN.z);
      pad.receiveShadow = true;
      this.sc.group.add(pad);

      const stripeMat = new T.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.8 });
      [-2.3, 2.3].forEach((ox) => {
        const stripe = new T.Mesh(new T.BoxGeometry(0.16, 0.025, 4.6), stripeMat);
        stripe.position.set(CAR_SPAWN.x + ox, 0.085, CAR_SPAWN.z);
        this.sc.group.add(stripe);
      });
      const stopMat = new T.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.8 });
      const stop = new T.Mesh(new T.BoxGeometry(5.2, 0.025, 0.16), stopMat);
      stop.position.set(CAR_SPAWN.x, 0.085, CAR_SPAWN.z - 2.55);
      this.sc.group.add(stop);
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
        // Low sill bridging the open door area
        this._box(body, 0.14, 0.24, 1.4, x, 0.82, -0.15, m.whiteDim, "CarSill");
        // Blue NASA livery stripe
        this._box(body, 0.025, 0.1, 3.35, side * 0.995, 1.06, 0.0, m.blue, "CarStripe");
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
      this._box(body, 0.05, 0.025, 1.1, -0.1, 1.162, 1.45, m.red, "CarHoodStripeRed");
      this._box(body, 0.05, 0.025, 1.1, 0.1, 1.162, 1.45, m.white, "CarHoodStripeWhite");

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
          #open-car-hud:not(.is-driving) .oc-drive-only { display: none; }
          #open-car-hud.is-driving .oc-near-only { display: none; }
          @media (max-width: 620px) {
            #open-car-hud { bottom: max(12px, env(safe-area-inset-bottom)); }
            #open-car-hud .oc-card { min-width: 0; padding: 7px 10px; }
            #open-car-hud .oc-hint { display: none; }
            #open-car-hud .oc-btn { padding: 7px 10px; font-size: 10px; }
            #open-car-hud .oc-speed span { font-size: 20px; }
          }
        `;
        document.head.appendChild(style);

        const hud = document.createElement("div");
        hud.id = "open-car-hud";
        hud.innerHTML = `
          <div class="oc-card">
            <div class="oc-title">LC-39A · NASA OPEN-TERRAIN CAR</div>
            <div class="oc-row">
              <button type="button" class="oc-btn oc-btn-primary oc-near-only" id="open-car-action">E · DRIVE</button>
              <button type="button" class="oc-btn oc-btn-primary oc-drive-only" id="open-car-exit">E · EXIT</button>
              <button type="button" class="oc-btn oc-btn-brake oc-drive-only" id="open-car-brake">HOLD · BRAKE</button>
              <div class="oc-speed oc-drive-only"><span id="open-car-speed">0</span><small>KM/H</small></div>
            </div>
            <div class="oc-hint oc-drive-only">W/S THROTTLE · A/D STEER · SPACE BRAKE</div>
            <div class="oc-hint oc-near-only">WALK UP AND PRESS [E] OR TAP TO DRIVE</div>
          </div>
        `;
        document.body.appendChild(hud);
        this.hud = hud;
      }

      this.speedEl = document.getElementById("open-car-speed");
      this.statusEl = document.querySelector("#open-car-hud .oc-title");

      const action = document.getElementById("open-car-action");
      const exit = document.getElementById("open-car-exit");
      const brake = document.getElementById("open-car-brake");
      if (action) action.addEventListener("click", (e) => { e.preventDefault(); this.enter(); });
      if (exit) exit.addEventListener("click", (e) => { e.preventDefault(); this.exit(); });
      if (brake) {
        const press = (e) => { e.preventDefault(); this.brakeHeld = true; };
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

        if (this.isDriving && (e.code === "Space" || e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD" ||
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
      });
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
      const briefing = document.getElementById("mission-briefing-overlay");
      if (briefing && briefing.style.display === "flex") return true;
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

    // =========================================================================
    // ENTER / EXIT
    // =========================================================================
    enter() {
      if (this.isDriving || !this._canDrive()) return false;
      this.isDriving = true;
      this.speed = 0;
      this.steer = 0;
      this.brakeHeld = false;
      this.keys = Object.create(null);
      this._camInitialised = false;

      if (window.localCrew && window.localCrew.group) {
        this.localCrewWasVisible = window.localCrew.group.visible;
        window.localCrew.group.visible = false;
      }

      this._applyDriverSuit();
      if (this.driver) this.driver.visible = true;
      if (this.label) this.label.visible = false;

      // A flight-crew member stepping out of the gantry uses the ground-level
      // site-tour collision/camera rules while driving. Ground crew already do.
      if (!this.sc.siteTourActive && typeof this.sc._isLocalGroundCrew === "function" && !this.sc._isLocalGroundCrew()) {
        this.sc.siteTourActive = true;
        if (typeof this.sc._renderGroundHUD === "function") this.sc._renderGroundHUD();
      }

      if (typeof window.setCameraYawPitch === "function") {
        window.setCameraYawPitch(this.yaw, 0.03);
      }
      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast("NASA OPEN CAR READY · W/S THROTTLE · A/D STEER · SPACE BRAKE · [E] EXIT");
      }
      this._syncLocalCrewPose();
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
      this.keys = Object.create(null);
      this._camInitialised = false;

      if (this.driver) this.driver.visible = false;
      if (this.label) this.label.visible = true;

      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = true;
        window.localCrew.group.position.set(exitPos.x, 0.2, exitPos.z);
        window.localCrew.group.rotation.y = this.yaw;
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
      this.keys = Object.create(null);
      this._camInitialised = false;
      if (this.driver) this.driver.visible = false;
      if (this.label) this.label.visible = true;
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = this.sc.isGroundMode && !this.sc.crewBoarded;
      }
      this._updateHud();
    }

    _findExitPosition() {
      const T = window.THREE;
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
        if (!this._blocked(candidate.x, candidate.z, 0.45)) return candidate;
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
      const joyActive = !!window.virtualJoyActive;
      const joyY = joyActive ? Math.max(-1, Math.min(1, window.virtualJoyY || 0)) : 0;
      const joyX = joyActive ? Math.max(-1, Math.min(1, window.virtualJoyX || 0)) : 0;

      const throttle = Math.max(-1, Math.min(1, (forward - reverse) + joyY));
      const previousSpeed = this.speed;

      if (throttle > 0) {
        this.speed += 8.2 * delta;
      } else if (throttle < 0) {
        this.speed -= 5.8 * delta;
      } else {
        const drag = 2.2 * delta + Math.abs(this.speed) * 0.35 * delta;
        if (Math.abs(this.speed) <= drag) this.speed = 0;
        else this.speed -= Math.sign(this.speed) * drag;
      }

      if (braking) {
        const brakeForce = 18 * delta;
        if (Math.abs(this.speed) <= brakeForce) this.speed = 0;
        else this.speed -= Math.sign(this.speed) * brakeForce;
      }

      this.speed = Math.max(-MAX_REVERSE_SPEED, Math.min(MAX_FORWARD_SPEED, this.speed));

      // Steering authority shrinks a little at high speed for stable arcs.
      const maxSteer = 0.54 - Math.min(0.36, Math.abs(this.speed) * 0.022);
      const steerTarget = Math.max(-1, Math.min(1, (right - left) + joyX)) * maxSteer;
      this.steer += (steerTarget - this.steer) * Math.min(1, delta * 7.5);

      if (Math.abs(this.speed) > 0.015) {
        this.yaw += (this.speed / WHEELBASE) * Math.tan(this.steer) * delta;
      }

      const dx = Math.sin(this.yaw) * this.speed * delta;
      const dz = Math.cos(this.yaw) * this.speed * delta;
      const px = this.group.position.x;
      const pz = this.group.position.z;
      let nx = px + dx;
      let nz = pz + dz;

      if (!this._blocked(nx, nz)) {
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

      // Subtle body pitch under acceleration + lean into corners.
      const accel = (this.speed - previousSpeed) / Math.max(0.001, delta);
      const targetPitch = Math.max(-0.05, Math.min(0.05, -accel * 0.0035));
      this._bodyPitch += (targetPitch - this._bodyPitch) * Math.min(1, delta * 6);
      this._bodyRoll += ((-this.steer * Math.abs(this.speed) / MAX_FORWARD_SPEED) * 0.11 - this._bodyRoll) * Math.min(1, delta * 5);
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
    }

    _idle(delta) {
      if (this.body) {
        this._bodyPitch += (0 - this._bodyPitch) * Math.min(1, delta * 5);
        this._bodyRoll += (0 - this._bodyRoll) * Math.min(1, delta * 5);
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

    _blocked(x, z, radius) {
      const r = typeof radius === "number" ? radius : CAR_RADIUS;
      const sc = this.sc;
      const bounds = (window.SpaceCenterModules && window.SpaceCenterModules.constants && window.SpaceCenterModules.constants.SITE_BOUNDS) || {
        minX: -1050,
        maxX: 525,
        minZ: -850,
        maxZ: 850
      };
      if (x < bounds.minX + r || x > bounds.maxX - r || z < bounds.minZ + r || z > bounds.maxZ - r) return true;

      const boxes = (sc.site && sc.site.boxColliders) || [];
      for (const box of boxes) {
        if (x > box.minX - r && x < box.maxX + r && z > box.minZ - r && z < box.maxZ + r) return true;
      }
      const circles = (sc.site && sc.site.circleColliders) || [];
      for (const circle of circles) {
        if (Math.hypot(x - circle.x, z - circle.z) < circle.r + r) return true;
      }
      return false;
    }

    _syncLocalCrewPose() {
      if (!this._netPos) return;
      const p = this.group.position;
      this._netPos.set(p.x, 0.2, p.z);
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.position.copy(this._netPos);
        window.localCrew.group.rotation.y = this.yaw;
      }
      if (window.netManager && typeof window.netManager.sendPlayerUpdate === "function") {
        window.netManager.sendPlayerUpdate(this._netPos, this.yaw, 0.03, false, false);
      }
    }

    // =========================================================================
    // VISUALS / CAMERA / HUD
    // =========================================================================
    updateCamera(camera) {
      if (!camera || !this.group) return;
      const p = this.group.position;
      const distance = 7.4;
      const height = 3.35;
      const desiredX = p.x - Math.sin(this.yaw) * distance;
      const desiredY = p.y + height;
      const desiredZ = p.z - Math.cos(this.yaw) * distance;

      if (!this._camInitialised) {
        camera.position.set(desiredX, desiredY, desiredZ);
        this._camInitialised = true;
      } else {
        const blend = 1 - Math.exp(-Math.max(0.001, this._lastDelta) * 6.5);
        camera.position.x += (desiredX - camera.position.x) * blend;
        camera.position.y += (desiredY - camera.position.y) * blend;
        camera.position.z += (desiredZ - camera.position.z) * blend;
      }
      camera.lookAt(
        p.x + Math.sin(this.yaw) * 2.6,
        p.y + 1.25,
        p.z + Math.cos(this.yaw) * 2.6
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
      this.hud.classList.toggle("is-visible", show);
      this.hud.classList.toggle("is-driving", this.isDriving);
      if (this.speedEl) {
        const kmh = Math.round(Math.abs(this.speed) * 3.6);
        this.speedEl.textContent = String(kmh).padStart(2, "0");
      }
      if (this.statusEl) {
        this.statusEl.textContent = this.isDriving
          ? "LC-39A · NASA OPEN-TERRAIN CAR · DRIVING"
          : "LC-39A · NASA OPEN-TERRAIN CAR";
      }
    }
  }

  window.SpaceCenterOpenCar = SpaceCenterOpenCar;
})(window);
