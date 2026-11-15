/**
 * ============================================================================
 * INTERFELLAS MANUAL ORBITAL DOCKING SIMULATOR (NASA 6DOF RCS & TOUCH EDITION)
 * ============================================================================
 * Player-Controlled Orbital Approach & Docking between Launch Ascent and
 * Station Interior Operations:
 * - 6DOF Reaction Control System (RCS) translational & rotational thrusters
 * - Keyboard controls (WASD Translate, R/F Vertical, Arrows Pitch/Yaw, Q/E Roll)
 *   + Interactive On-Screen RCS Thruster Pad & Auto-Align Assist [T]
 * - Real-time NASA Proximity Operations telemetry: Range (m), Closure Rate (m/s),
 *   and Attitude Alignment Error (°) targeting PMA-2 / IDA Forward Port
 * - Oriented-bounding-box collision against the ISS exterior so the orbiter
 *   cannot fly through the station, solar arrays or truss
 * - Upon Hard Capture, hides the external ISS model and transitions the crew
 *   directly into the 6-room Station Interior!
 */

(function (window) {
  "use strict";

  class DockingSimulator {
    constructor() {
      this.isActive = false;
      this.isCompleted = false;
      this.onDockSuccessCallback = null;

      this.shipGroup = null;
      this.orbiterMesh = null;
      this.targetBeacon = null;

      // Target PMA-2 / IDA forward docking port on the exterior ISS model.
      // ISS_stationary_opt.glb is placed at (0, 4, -55); PMA-2's outward face
      // is at model z = 21.01, i.e. scene z = -33.99. Approach from +Z.
      this.targetPortPos = new window.THREE.Vector3(0, 3.9, -34.0);
      this.targetPortQuat = new window.THREE.Quaternion().setFromAxisAngle(
        new window.THREE.Vector3(0, 1, 0),
        Math.PI
      );
      this.approachInward = new window.THREE.Vector3(0, 0, -1);

      // 6DOF Physics State (start 23.5 m in front of PMA-2, slightly high/right)
      this.position = new window.THREE.Vector3(1.8, 5.2, -10.5);
      this.velocity = new window.THREE.Vector3(0, 0, -0.28);
      this.angularVelocity = new window.THREE.Vector3(0, 0, 0);
      this.quaternion = this.targetPortQuat.clone();
      // Damping values are per 60 Hz frame and are rescaled by delta in update()
      // so handling stays identical at 30/60/120 FPS.
      this.damping = 0.94;
      this.rotDamping = 0.92;
      this.rcsPower = 3.0;
      this.rotPower = 0.95;
      this.maxSpeed = 2.2;
      this.maxAngularSpeed = 0.3;
      this.fineControl = false;

      // Station collision. The ISS is a static mesh, so its oriented bounding
      // boxes are built once and reused. The ship is sampled with spheres along
      // its nose, fuselage, wing roots and tail.
      this.collisionRadius = 1.15;
      this.stationColliders = null;
      this._stationColliderRoot = null;
      this.contactTimer = 0;

      this.cameraMode = "chase"; // "chase" or "cockpit"
      this.autoAssist = false;

      // Free-orbit chase camera. The user can drag around the orbiter and
      // zoom independently of the vehicle attitude while docking.
      this.orbitYaw = 0.28;
      this.orbitPitch = 0.22;
      this.orbitDistance = 56;
      this.cameraInitialized = false;
      this.orbiting = false;
      this.lastPointerX = 0;
      this.lastPointerY = 0;
      this.smoothCameraPos = new window.THREE.Vector3();
      this.smoothLookTarget = new window.THREE.Vector3();
      this.pointerPositions = new Map();
      this.pinchStartDistance = 0;
      this.pinchStartOrbit = 56;

      // HUD Elements
      this.hudOverlay = null;
      this.rangeValEl = null;
      this.rateValEl = null;
      this.alignValEl = null;
      this.statusBadgeEl = null;
      this.crosshairBox = null;
      this.camModeBadge = null;

      this.keys = {};
      this._bindInputs();
    }

    start(scene, camera, shipOverride, onDockSuccess) {
      if (this.isActive) this.stop();
      this.isActive = true;
      this.isCompleted = false;
      this.autoAssist = false;
      this.scene = scene;
      this.camera = camera;
      this.onDockSuccessCallback = onDockSuccess;

      // During external approach & docking, the target ISS exterior IS visible ahead of our ship
      if (window.issGroup) {
        window.issGroup.visible = true;
      }
      if (window.shipInterior) {
        window.shipInterior.hide();
      }
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = false;
      }

      // Start 23.5 m out from the PMA-2 forward docking port with a gentle
      // inward closure rate. The ship faces the station along -Z.
      this.position.set(1.8, 5.2, -10.5);
      this.velocity.set(0, 0, -0.28);
      this.angularVelocity.set(0, 0, 0);
      this.quaternion.copy(this.targetPortQuat);
      this.contactTimer = 0;
      this._collisionSamples = [
        // Local ship space: nose at z = 0, fuselage/wings extend toward -Z.
        { offset: new window.THREE.Vector3(0, 0, 0), radius: 1.15 },
        { offset: new window.THREE.Vector3(0, 0, -9), radius: 2.4 },
        { offset: new window.THREE.Vector3(-7, -0.5, -6), radius: 2.0 },
        { offset: new window.THREE.Vector3(7, -0.5, -6), radius: 2.0 },
        { offset: new window.THREE.Vector3(0, 1.5, -24), radius: 3.0 }
      ];
      this.fineControl = false;
      this.autoAssist = false;
      this._boresightActive = true;
      this._syncAccum = 0;
      this._assistFlashText = "";
      this._assistFlashUntil = 0;
      this._remoteTargetPos = this.position.clone();
      this._remoteTargetQuat = this.quaternion.clone();
      this._lastCorridorCapture = false;

      // Late joiners / reconnecting pilots should resume the shared approach
      // instead of restarting the run from the default entry point.
      this._restoreSharedDockingSnapshot();

      this.stationColliders = null;
      this._stationColliderRoot = null;
      this._buildStationColliders();

      this._setupShipMesh(shipOverride);
      this._setupTargetBeacon();
      if (this.targetBeacon) {
        this.targetBeacon.visible = this._boresightActive;
      }
      if (this.shipGroup) {
        this.shipGroup.position.copy(this.position);
        this.shipGroup.quaternion.copy(this.quaternion);
      }
      this.orbitYaw = 0.28;
      this.orbitPitch = 0.22;
      this.orbitDistance = 56;
      this.cameraInitialized = false;
      this._bindNetListeners();
      this._createDockingHUD();
      this._bindInputs();
      this._bindCameraControls();
      document.body.classList.add("docking-active");
      document.body.classList.remove("ground-mode-active", "launch-active", "interior-active");
      if (window.csaNasaLab && typeof window.csaNasaLab.syncGroundLockState === "function") {
        window.csaNasaLab.syncGroundLockState();
      }

      if (window.spaceAudio) {
        window.spaceAudio.playRadioBeep(true);
      }
    }

    _restoreSharedDockingSnapshot() {
      const nm = window.netManager;
      const mission = nm && typeof nm.getMission === "function" ? nm.getMission() : null;
      const roomState = nm && nm.roomState;
      const savedState =
        (roomState && roomState.systems && roomState.systems.dockingState) ||
        (mission && mission.systems && mission.systems.dockingState) ||
        null;

      // The server seeds a default state when the phase opens. Only restore a
      // state that came from an actual helm-pilot telemetry packet.
      if (!savedState || !savedState.pilotId) return;

      const vec3 = (value) => {
        if (!Array.isArray(value) || value.length !== 3) return null;
        const out = value.map(Number);
        return out.every((n) => Number.isFinite(n)) ? out : null;
      };
      const vec4 = (value) => {
        if (!Array.isArray(value) || value.length !== 4) return null;
        const out = value.map(Number);
        return out.every((n) => Number.isFinite(n)) ? out : null;
      };

      const position = vec3(savedState.position || savedState.pos);
      const velocity = vec3(savedState.velocity || savedState.vel);
      const quaternion = vec4(savedState.quaternion || savedState.quat);
      if (position) {
        this.position.set(position[0], position[1], position[2]);
        this._remoteTargetPos.copy(this.position);
      }
      if (velocity) this.velocity.set(velocity[0], velocity[1], velocity[2]);
      if (quaternion) {
        this.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
        this._remoteTargetQuat.copy(this.quaternion);
      }
      if (typeof savedState.fineControl === "boolean") this.fineControl = savedState.fineControl;
      if (typeof savedState.autoAssist === "boolean") this.autoAssist = savedState.autoAssist;
      if (typeof savedState.boresight === "boolean") {
        this._boresightActive = savedState.boresight;
      } else if (typeof savedState.boresightLocked === "boolean") {
        this._boresightActive = savedState.boresightLocked;
      }
    }

    _getPilotPlayer() {
      const nm = window.netManager;
      const room = nm && nm.roomState;
      const players = room && Array.isArray(room.players) ? room.players : [];
      if (!players.length) return null;
      const mission = nm && typeof nm.getMission === "function" ? nm.getMission() : (room && room.mission);
      const pilotId = mission && mission.dockingPilotId;
      if (pilotId) {
        const byId = players.find((p) => p && p.id === pilotId);
        if (byId) return byId;
      }
      const norm = window.InterfellasRoles
        ? window.InterfellasRoles.normalizeRole
        : ((r) => String(r || "commander").toLowerCase());
      return players.find((p) => norm(p.role) === "commander")
        || players.find((p) => p.id === (room && room.hostId) || p.isHost)
        || players[0];
    }

    _isHelmPilot() {
      const nm = window.netManager;
      if (!nm || !nm.connected || !nm.roomId) return true;
      const players = nm.roomState && Array.isArray(nm.roomState.players) ? nm.roomState.players : [];
      if (players.length <= 1) return true;
      const pilot = this._getPilotPlayer();
      if (!pilot) return true;
      return pilot.id === nm.socketId;
    }

    // Docking completion is an authoritative action. Being physically inside
    // the capture corridor is not authorization: a passenger cannot finish the
    // pilot's approach for them.
    _canAuthorizeDocking() {
      const nm = window.netManager;
      if (!nm || !nm.connected || !nm.roomId) return true;
      const players = nm.roomState && Array.isArray(nm.roomState.players) ? nm.roomState.players : [];
      if (players.length <= 1) return true;
      if (nm.isHost) return true;
      const myRole = window.InterfellasRoles
        ? window.InterfellasRoles.normalizeRole(nm.localPlayer && nm.localPlayer.role, "commander")
        : "commander";
      return this._isHelmPilot() || myRole === "commander";
    }

    _bindNetListeners() {
      if (this._netBound || !window.netManager || typeof window.netManager.on !== "function") return;
      this._netBound = true;

      window.netManager.on("docking_state", (payload) => {
        if (!this.isActive || this.isCompleted || !payload) return;
        if (this._isHelmPilot()) return;
        const st = payload.state || payload;
        if (Array.isArray(st.position) && st.position.length === 3) {
          this._remoteTargetPos.set(st.position[0], st.position[1], st.position[2]);
        }
        if (Array.isArray(st.velocity) && st.velocity.length === 3) {
          this.velocity.set(st.velocity[0], st.velocity[1], st.velocity[2]);
        }
        if (Array.isArray(st.quaternion) && st.quaternion.length === 4) {
          this._remoteTargetQuat.set(st.quaternion[0], st.quaternion[1], st.quaternion[2], st.quaternion[3]);
        }
        if (Array.isArray(st.angularVelocity) && st.angularVelocity.length === 3) {
          this.angularVelocity.set(st.angularVelocity[0], st.angularVelocity[1], st.angularVelocity[2]);
        }
        if (typeof st.fineControl === "boolean") this.fineControl = st.fineControl;
        if (typeof st.autoAssist === "boolean") this.autoAssist = st.autoAssist;
        if (typeof st.boresight === "boolean") {
          this._boresightActive = st.boresight;
          if (this.targetBeacon) this.targetBeacon.visible = this._boresightActive;
        }
      });

      window.netManager.on("docking_pilot_changed", () => {
        if (!this.isActive) return;
        const pilot = this._getPilotPlayer();
        const name = pilot ? pilot.name : "Crew";
        this._assistFlashText = `HELM TRANSFERRED TO ${name.toUpperCase()}`;
        this._assistFlashUntil = performance.now() + 3000;
        this.updateCrewStatus();
      });

      window.netManager.on("docking_assist_event", (ev) => {
        if (!this.isActive || !ev) return;
        const actor = String(ev.playerName || "CREW").toUpperCase();
        const roleTag = window.InterfellasRoles
          ? window.InterfellasRoles.getRoleMeta(ev.role).short
          : String(ev.role || "CREW").slice(0, 3).toUpperCase();

        if (ev.kind === "rcs_stabilize") {
          if (this._isHelmPilot()) {
            this.angularVelocity.multiplyScalar(0.15);
            this.velocity.x *= 0.25;
            this.velocity.y *= 0.25;
            this._emitDockingState(true);
          }
          this._assistFlashText = `[${roleTag}] ${actor}: SHIP ROTATION STEADIED`;
          this._assistFlashUntil = performance.now() + 3000;
        } else if (ev.kind === "fine_trim") {
          if (this._isHelmPilot()) {
            this.toggleFineControl();
            this._emitDockingState(true);
          }
          this._assistFlashText = `[${roleTag}] ${actor}: GENTLE MODE TOGGLED`;
          this._assistFlashUntil = performance.now() + 2600;
        } else if (ev.kind === "boresight") {
          this._boresightActive = !this._boresightActive;
          if (this.targetBeacon) this.targetBeacon.visible = this._boresightActive;
          this._assistFlashText = `[${roleTag}] ${actor}: LASER GUIDE BEAM ${this._boresightActive ? "ON" : "OFF"}`;
          this._assistFlashUntil = performance.now() + 2600;
        } else if (ev.kind === "ping") {
          const dist = this.position.distanceTo(this.targetPortPos).toFixed(1);
          const err = this._calcAngularDeviation().toFixed(1);
          this._assistFlashText = `[${roleTag}] ${actor}: DOOR CHECK ${dist}m · TILT ${err}°`;
          this._assistFlashUntil = performance.now() + 3400;
        }
        if (window.spaceAudio) window.spaceAudio.playClick();
      });
    }

    _emitDockingState(force = false) {
      if (!this.isActive || !this._isHelmPilot()) return;
      if (!window.netManager || !window.netManager.connected || typeof window.netManager.sendDockingState !== "function") return;
      if (!force && this._syncAccum < 0.05) return;
      this._syncAccum = 0;
      window.netManager.sendDockingState({
        position: [this.position.x, this.position.y, this.position.z],
        velocity: [this.velocity.x, this.velocity.y, this.velocity.z],
        quaternion: [this.quaternion.x, this.quaternion.y, this.quaternion.z, this.quaternion.w],
        angularVelocity: [this.angularVelocity.x, this.angularVelocity.y, this.angularVelocity.z],
        fineControl: this.fineControl,
        autoAssist: this.autoAssist,
        boresight: this._boresightActive
      });
    }

    stop() {
      this.isActive = false;
      this.isCompleted = false;
      this.keys = {};
      this.orbiting = false;
      this.pointerPositions.clear();
      document.body.classList.remove("docking-active");

      if (this.hudOverlay && this.hudOverlay.parentNode) {
        this.hudOverlay.parentNode.removeChild(this.hudOverlay);
        this.hudOverlay = null;
      }

      if (this.targetBeacon && this.targetBeacon.parent) {
        this.targetBeacon.parent.remove(this.targetBeacon);
        this.targetBeacon = null;
      }

      if (this.shipGroup && this.shipGroup.parent) {
        this.shipGroup.parent.remove(this.shipGroup);
        this.shipGroup = null;
      }

      if (this._onKeyDown) {
        window.removeEventListener("keydown", this._onKeyDown);
        window.removeEventListener("keyup", this._onKeyUp);
        this._onKeyDown = null;
        this._onKeyUp = null;
      }

      if (this._domPointerTarget) {
        const dom = this._domPointerTarget;
        dom.removeEventListener("pointerdown", this._onPointerDown);
        dom.removeEventListener("pointermove", this._onPointerMove);
        dom.removeEventListener("pointerup", this._onPointerUp);
        dom.removeEventListener("pointercancel", this._onPointerUp);
        dom.removeEventListener("wheel", this._onWheel);
        dom.removeEventListener("dblclick", this._onDoubleClick);
        this._domPointerTarget = null;
      }
    }

    skip() {
      if (!this.isActive) return;
      const nm = window.netManager;
      const corridorCapture = this._isInsideCaptureCorridor();
      if (nm && nm.connected && nm.roomState && Array.isArray(nm.roomState.players) && nm.roomState.players.length > 1) {
        if (!this._canAuthorizeDocking()) {
          this._assistFlashText = "HELM PILOT OR HOST AUTHORIZES EARLY SKIP · CLICK TAKE HELM OR ASSIST WITH [1-4]";
          this._assistFlashUntil = performance.now() + 3000;
          if (window.gameplay && typeof window.gameplay.showToast === "function") {
            window.gameplay.showToast("HELM PILOT / HOST CONTROLS CAPTURE SKIP — USE [1-4] OR TAKE HELM");
          }
          return;
        }
      }
      this._completeDocking(corridorCapture);
    }

    _setupTargetBeacon() {
      if (!this.scene) return;
      const THREE = window.THREE;
      this.targetBeacon = new THREE.Group();

      const ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(2.1, 0.08, 16, 48),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.95 })
      );
      this.targetBeacon.add(ringMesh);

      const innerRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.04, 12, 36),
        new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.85 })
      );
      this.targetBeacon.add(innerRing);

      const lineMat = new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 });
      const ptsX = [new THREE.Vector3(-2.6, 0, 0), new THREE.Vector3(2.6, 0, 0)];
      const ptsY = [new THREE.Vector3(0, -2.6, 0), new THREE.Vector3(0, 2.6, 0)];
      this.targetBeacon.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsX), lineMat));
      this.targetBeacon.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ptsY), lineMat));

      this.targetBeacon.position.copy(this.targetPortPos);
      this.scene.add(this.targetBeacon);
    }

    _addDockingCollar() {
      if (!this.shipGroup) return;
      if (this.shipGroup.getObjectByName("OrbiterDockingCollar")) return;
      const THREE = window.THREE;
      const collar = new THREE.Group();
      collar.name = "OrbiterDockingCollar";
      const collarMat = new THREE.MeshStandardMaterial({
        color: 0xb8c4cf,
        roughness: 0.42,
        metalness: 0.7
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.15, 12, 32), collarMat);
      ring.position.z = -0.08;
      collar.add(ring);
      const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.02, 1.15, 20), collarMat);
      tunnel.rotation.x = Math.PI / 2;
      tunnel.position.z = -0.72;
      collar.add(tunnel);
      this.shipGroup.add(collar);
    }

    _setupShipMesh(shipOverride) {
      if (shipOverride) {
        this.shipGroup = shipOverride;
        return;
      }

      const THREE = window.THREE;
      this.shipGroup = new THREE.Group();
      this.shipGroup.name = "DockingCraft_Orbiter";
      this.scene.add(this.shipGroup);

      const glb = window.glbManager;
      const attachOrbiterModel = (key) => {
        try {
          if (!glb) return false;
          const mesh = glb.instantiateModel(key, {
            scale: 1.0,
            castShadow: false,
            receiveShadow: false
          });
          // Align the orbiter's nose (+Z, model z = 18.95, y median = 1.8)
          // with the docking root so the ship actually touches PMA-2 instead
          // of passing through it or floating above the port.
          mesh.position.set(0, -1.8, -18.95);
          while (this.shipGroup.children.length > 0) {
            this.shipGroup.remove(this.shipGroup.children[0]);
          }
          this.shipGroup.add(mesh);
          this.orbiterMesh = mesh;
          this._addDockingCollar();
          return true;
        } catch (e) {
          return false;
        }
      };

      if (glb && (glb.cache["assets/Orbiter_V2.glb"] || glb.cache["orbiter_v2"])) {
        attachOrbiterModel("assets/Orbiter_V2.glb");
      } else {
        const tempGroup = new THREE.Group();
        const hullMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35, metalness: 0.15 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });

        const fuseGeo = new THREE.CylinderGeometry(2.1, 2.4, 22.0, 24);
        fuseGeo.rotateX(Math.PI / 2);
        const fuselage = new THREE.Mesh(fuseGeo, hullMat);
        fuselage.position.set(0, 0, -2.0);
        tempGroup.add(fuselage);

        const noseGeo = new THREE.ConeGeometry(2.1, 5.5, 24);
        noseGeo.rotateX(Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, darkMat);
        nose.position.set(0, 0, 2.8);
        tempGroup.add(nose);

        const wings = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.25, 12.5), darkMat);
        wings.position.set(0, -0.6, -5.8);
        tempGroup.add(wings);

        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.8, 6.0), hullMat);
        tail.position.set(0, 2.9, -9.5);
        tempGroup.add(tail);

        tempGroup.position.set(0, 0, -5.5);
        this.shipGroup.add(tempGroup);
        this._addDockingCollar();

        if (glb) {
          glb.loadGLB("assets/Orbiter_V2.glb")
            .then(() => attachOrbiterModel("assets/Orbiter_V2.glb"))
            .catch(() => {});
        }
      }
    }

    _bindInputs() {
      if (this._onKeyDown) {
        window.removeEventListener("keydown", this._onKeyDown);
        window.removeEventListener("keyup", this._onKeyUp);
      }

      this._onKeyDown = (e) => {
        if (!this.isActive) return;
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
        this.keys[e.code] = true;
        if (e.key) this.keys[e.key.toLowerCase()] = true;

        // Hard capture latch separated from Roll Right [E] onto [Space] / [Enter]
        if ((e.code === "Space" || e.code === "Enter") && this._isInsideCaptureCorridor() && this._canAuthorizeDocking()) {
          e.preventDefault();
          this._completeDocking(true);
          return;
        }

        if (e.code === "KeyV") {
          e.preventDefault();
          this.cameraMode = this.cameraMode === "chase" ? "cockpit" : "chase";
          if (this.camModeBadge) {
            this.camModeBadge.textContent = this.cameraMode === "chase" ? "VIEW: CHASE [V]" : "VIEW: COCKPIT [V]";
          }
          if (window.spaceAudio) window.spaceAudio.playClick();
          return;
        }

        if (e.code === "KeyT" && this._isHelmPilot()) {
          e.preventDefault();
          this.toggleAutoAssist();
          return;
        }

        // Crew Assist Hotkeys [1]-[4]
        const assistMap = { Digit1: "rcs_stabilize", Digit2: "fine_trim", Digit3: "boresight", Digit4: "ping" };
        if (assistMap[e.code]) {
          e.preventDefault();
          this._triggerCrewAssist(assistMap[e.code]);
        }
      };

      this._onKeyUp = (e) => {
        if (!this.isActive) return;
        this.keys[e.code] = false;
        if (e.key) this.keys[e.key.toLowerCase()] = false;
      };

      window.addEventListener("keydown", this._onKeyDown);
      window.addEventListener("keyup", this._onKeyUp);
    }

    _triggerCrewAssist(kind) {
      if (!this.isActive || this.isCompleted) return;
      const nm = window.netManager;
      if (nm && nm.connected && nm.roomId && typeof nm.sendDockingAssist === "function") {
        nm.sendDockingAssist(kind);
      } else {
        // Offline / solo fallback applies immediately
        if (kind === "rcs_stabilize") {
          this.angularVelocity.multiplyScalar(0.15);
          this.velocity.x *= 0.25;
          this.velocity.y *= 0.25;
          this._assistFlashText = "SHIP STEADIED";
          this._assistFlashUntil = performance.now() + 2600;
        } else if (kind === "fine_trim") {
          this.toggleFineControl();
        } else if (kind === "boresight") {
          this._boresightActive = !this._boresightActive;
          if (this.targetBeacon) this.targetBeacon.visible = this._boresightActive;
          this._assistFlashText = `LASER GUIDE BEAM ${this._boresightActive ? "ON" : "OFF"}`;
          this._assistFlashUntil = performance.now() + 2600;
        } else if (kind === "ping") {
          const dist = this.position.distanceTo(this.targetPortPos).toFixed(1);
          const err = this._calcAngularDeviation().toFixed(1);
          this._assistFlashText = `DISTANCE CHECK: ${dist}m · ANGLE ${err}°`;
          this._assistFlashUntil = performance.now() + 3200;
        }
        if (window.spaceAudio) window.spaceAudio.playClick();
      }
    }

    toggleAutoAssist(force) {
      this.autoAssist = typeof force === "boolean" ? force : !this.autoAssist;
      const btnAuto = this.hudOverlay ? this.hudOverlay.querySelector("#btn-dock-auto") : null;
      if (btnAuto) {
        btnAuto.style.borderColor = this.autoAssist ? "#63e6a8" : "rgba(var(--ui-brand-rgb),0.4)";
        btnAuto.style.color = this.autoAssist ? "#63e6a8" : "var(--ui-brand-strong)";
        btnAuto.textContent = this.autoAssist ? "AUTO-DOCK: ON [T]" : "AUTO-DOCK ASSIST [T]";
      }
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    toggleFineControl(force) {
      this.fineControl = typeof force === "boolean" ? force : !this.fineControl;
      const btnFine = this.hudOverlay ? this.hudOverlay.querySelector("#btn-dock-fine") : null;
      if (btnFine) {
        btnFine.style.borderColor = this.fineControl ? "#63e6a8" : "rgba(255,255,255,0.2)";
        btnFine.style.color = this.fineControl ? "#63e6a8" : "#efeee7";
        btnFine.textContent = this.fineControl ? "FINE RCS: ON" : "FINE RCS: OFF";
      }
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    update(delta) {
      if (!this.isActive || this.isCompleted) return;
      const THREE = window.THREE;
      const dt = Math.min(Math.max(delta || 0, 1 / 240), 0.05);
      const isPilot = this._isHelmPilot();

      if (isPilot) {
        const thrust = new THREE.Vector3();
        const rot = new THREE.Vector3();
        const shiftHeld = !!(this.keys["ShiftLeft"] || this.keys["ShiftRight"] || this.keys["shift"]);
        const powerScale = (this.fineControl || shiftHeld) ? 0.42 : 1.0;

        if (this.keys["KeyW"] || this.keys["w"]) thrust.z -= this.rcsPower * powerScale;
        if (this.keys["KeyS"] || this.keys["s"]) thrust.z += this.rcsPower * powerScale;
        if (this.keys["KeyA"] || this.keys["a"]) thrust.x -= this.rcsPower * powerScale;
        if (this.keys["KeyD"] || this.keys["d"]) thrust.x += this.rcsPower * powerScale;
        if (this.keys["KeyR"] || this.keys["r"]) thrust.y += this.rcsPower * powerScale;
        if (this.keys["KeyF"] || this.keys["f"]) thrust.y -= this.rcsPower * powerScale;

        if (this.keys["ArrowUp"]) rot.x += this.rotPower * powerScale;
        if (this.keys["ArrowDown"]) rot.x -= this.rotPower * powerScale;
        if (this.keys["ArrowLeft"]) rot.y += this.rotPower * powerScale;
        if (this.keys["ArrowRight"]) rot.y -= this.rotPower * powerScale;
        if (this.keys["KeyQ"] || this.keys["q"]) rot.z += this.rotPower * powerScale;
        if (this.keys["KeyE"] || this.keys["e"]) rot.z -= this.rotPower * powerScale;

        if (this.autoAssist) {
          const dx = this.targetPortPos.x - this.position.x;
          const dy = this.targetPortPos.y - this.position.y;
          thrust.x += Math.max(-2.4, Math.min(2.4, dx * 1.35));
          thrust.y += Math.max(-2.4, Math.min(2.4, dy * 1.35));
          const distZ = this.position.z - this.targetPortPos.z; // positive in front of PMA-2
          const desiredInward = distZ > 10 ? 2.4 : Math.max(0.32, distZ * 0.22);
          thrust.z += (-desiredInward - this.velocity.z) * 2.2;
          this.angularVelocity.multiplyScalar(Math.pow(0.82, dt * 60));
          this.quaternion.slerp(this.targetPortQuat, Math.min(1, dt * 3.5));
        }

        if (thrust.lengthSq() > 0.01 && Math.random() < 0.12 && window.spaceAudio) {
          window.spaceAudio.playThrusterBurst(0.12);
        }

        // Frame-rate independent damping keeps the RCS crisp on every display.
        this.velocity.addScaledVector(thrust, dt);
        this.velocity.multiplyScalar(Math.pow(this.damping, dt * 60));
        if (this.velocity.lengthSq() > this.maxSpeed * this.maxSpeed) {
          this.velocity.setLength(this.maxSpeed);
        }

        this.angularVelocity.addScaledVector(rot, dt);
        this.angularVelocity.multiplyScalar(Math.pow(this.rotDamping, dt * 60));
        if (this.angularVelocity.lengthSq() > this.maxAngularSpeed * this.maxAngularSpeed) {
          this.angularVelocity.setLength(this.maxAngularSpeed);
        }

        this.position.addScaledVector(this.velocity, dt);

        // Keep the orbiter outside the ISS hull. This also kills inward velocity
        // so the ship cannot tunnel through the station at high closure rates.
        this._resolveStationCollision();
        if (this.contactTimer > 0) this.contactTimer = Math.max(0, this.contactTimer - dt);

        const qDelta = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            this.angularVelocity.x * dt,
            this.angularVelocity.y * dt,
            this.angularVelocity.z * dt,
            "YXZ"
          )
        );
        this.quaternion.multiply(qDelta);

        this._syncAccum += dt;
        this._emitDockingState(false);

        if (this._isInsideCaptureCorridor()) {
          const dist = this.position.distanceTo(this.targetPortPos);
          const closure = -this.velocity.z;
          if (dist < 2.1 && closure > -0.05 && closure < 0.85) {
            this._completeDocking(true);
          }
        }
      } else {
        // Copilots track the helm pilot's authoritative state smoothly
        const lerpAlpha = 1 - Math.exp(-12 * dt);
        this._remoteTargetPos.addScaledVector(this.velocity, dt * 0.35);
        this.position.lerp(this._remoteTargetPos, lerpAlpha);
        this.quaternion.slerp(this._remoteTargetQuat, lerpAlpha);
      }

      if (this.shipGroup) {
        this.shipGroup.position.copy(this.position);
        this.shipGroup.quaternion.copy(this.quaternion);
      }

      if (this.camera) {
        this._updateCamera(dt);
      }

      this._updateHUDTelemetry();
    }

    /**
     * Build one oriented bounding box per visible ISS mesh. The station is
     * static, so the local boxes and inverse matrices are cached and reused.
     */
    _buildStationColliders() {
      const THREE = window.THREE;
      const root = window.flagshipStation;
      if (!THREE || !root) return 0;
      if (this._stationColliderRoot === root && this.stationColliders) {
        return this.stationColliders.length;
      }

      root.updateMatrixWorld(true);
      const colliders = [];
      root.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry || obj.visible === false) return;
        const geometry = obj.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box || box.isEmpty()) return;

        const size = box.getSize(new THREE.Vector3());
        if (size.x < 0.18 && size.y < 0.18 && size.z < 0.18) return;

        const matrixWorld = obj.matrixWorld;
        const scale = new THREE.Vector3().setFromMatrixScale(matrixWorld);
        const minScale = Math.max(0.0001, Math.min(scale.x, scale.y, scale.z));
        const worldBox = new THREE.Box3().copy(box).applyMatrix4(matrixWorld);
        const sphere = worldBox.getBoundingSphere(new THREE.Sphere());
        if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) return;
        const parentName = (obj.parent && obj.parent.name) || "";
        const isDockingPort = /PMA|IDA/i.test(`${parentName} ${obj.name || ""}`);

        colliders.push({
          box,
          invMatrix: new THREE.Matrix4().copy(matrixWorld).invert(),
          linear: new THREE.Matrix3().setFromMatrix4(matrixWorld),
          minScale,
          sphere,
          isDockingPort
        });
      });

      this.stationColliders = colliders;
      this._stationColliderRoot = root;
      return colliders.length;
    }

    _resolveStationCollision() {
      if (!this.stationColliders || this.stationColliders.length === 0) {
        if (this._buildStationColliders() === 0) return false;
      }

      const THREE = window.THREE;
      const samples = (this._collisionSamples && this._collisionSamples.length)
        ? this._collisionSamples
        : [{ offset: new THREE.Vector3(0, 0, 0), radius: this.collisionRadius }];
      const local = new THREE.Vector3();
      const closest = new THREE.Vector3();
      const push = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const sampleWorld = new THREE.Vector3();
      // Within the capture corridor the PMA/IDA docking adapter is allowed to
      // be touched; otherwise its collision volume would stop the nose a few
      // metres short and prevent hard capture.
      const inCaptureCorridor = this._isInsideCaptureCorridor();
      const lateralOffset = Math.hypot(
        this.position.x - this.targetPortPos.x,
        this.position.y - this.targetPortPos.y
      );
      const dockAligned = inCaptureCorridor && lateralOffset < 1.7;
      let contact = false;

      // Two passes settle corners where two hull sections meet.
      for (let pass = 0; pass < 2; pass++) {
        let passContact = false;
        for (const sample of samples) {
          sampleWorld.copy(sample.offset).applyQuaternion(this.quaternion).add(this.position);

          for (const collider of this.stationColliders) {
            if (dockAligned && collider.isDockingPort) continue;
            const broad = collider.sphere.radius + sample.radius;
            if (sampleWorld.distanceToSquared(collider.sphere.center) > broad * broad) continue;

            local.copy(sampleWorld).applyMatrix4(collider.invMatrix);
            const box = collider.box;
            closest.set(
              Math.max(box.min.x, Math.min(local.x, box.max.x)),
              Math.max(box.min.y, Math.min(local.y, box.max.y)),
              Math.max(box.min.z, Math.min(local.z, box.max.z))
            );

            const localRadius = sample.radius / collider.minScale;
            const distSq = local.distanceToSquared(closest);
            if (distSq >= localRadius * localRadius) continue;

            if (distSq > 1e-8) {
              const dist = Math.sqrt(distSq);
              push.copy(local).sub(closest).multiplyScalar((localRadius - dist) / dist);
            } else {
              // Centre is inside the box: exit through the nearest face.
              const dxMin = local.x - box.min.x;
              const dxMax = box.max.x - local.x;
              const dyMin = local.y - box.min.y;
              const dyMax = box.max.y - local.y;
              const dzMin = local.z - box.min.z;
              const dzMax = box.max.z - local.z;
              let best = dxMin;
              push.set(-1, 0, 0);
              if (dxMax < best) { best = dxMax; push.set(1, 0, 0); }
              if (dyMin < best) { best = dyMin; push.set(0, -1, 0); }
              if (dyMax < best) { best = dyMax; push.set(0, 1, 0); }
              if (dzMin < best) { best = dzMin; push.set(0, 0, -1); }
              if (dzMax < best) { best = dzMax; push.set(0, 0, 1); }
              push.multiplyScalar(best + localRadius);
            }

            push.applyMatrix3(collider.linear);
            const pushLen = push.length();
            if (pushLen < 1e-6) continue;

            this.position.add(push);
            sampleWorld.add(push);
            normal.copy(push).multiplyScalar(1 / pushLen);
            const inward = this.velocity.dot(normal);
            if (inward < 0) this.velocity.addScaledVector(normal, -inward);
            contact = true;
            passContact = true;
          }
        }
        if (!passContact) break;
      }

      if (contact) {
        this.contactTimer = 0.7;
        // Damp any lateral scraping so the ship settles against the hull.
        this.velocity.multiplyScalar(0.82);
        this.angularVelocity.multiplyScalar(0.9);
      }
      return contact;
    }

    _updateCamera(delta) {
      const THREE = window.THREE;
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion);

      if (this.cameraMode === "cockpit") {
        const camOffset = new THREE.Vector3(0, 1.1, -2.4).applyQuaternion(this.quaternion);
        this.camera.position.copy(this.position).add(camOffset);
        this.camera.lookAt(this.targetPortPos);
        return;
      }

      // Orbit around the orbiter's centre of mass (about 18.4 m behind the
      // docking root) so a short drag reveals the whole vehicle and the ISS.
      const shipCenter = this.position.clone().addScaledVector(forward, -18.4);
      shipCenter.y -= 0.8;

      const pitch = Math.max(-0.12, Math.min(1.12, this.orbitPitch));
      const distance = Math.max(20, Math.min(140, this.orbitDistance));
      const horizontal = Math.cos(pitch) * distance;
      const orbitOffset = new THREE.Vector3(
        Math.sin(this.orbitYaw) * horizontal,
        Math.sin(pitch) * distance,
        -Math.cos(this.orbitYaw) * horizontal
      ).applyQuaternion(this.quaternion);

      const desiredPosition = shipCenter.clone().add(orbitOffset);
      const desiredLook = shipCenter.clone().addScaledVector(forward, 7.5);
      desiredLook.y += 1.2;

      if (!this.cameraInitialized) {
        this.smoothCameraPos.copy(desiredPosition);
        this.smoothLookTarget.copy(desiredLook);
        this.cameraInitialized = true;
      }

      this.smoothCameraPos.lerp(desiredPosition, 1 - Math.exp(-delta * 7.5));
      this.smoothLookTarget.lerp(desiredLook, 1 - Math.exp(-delta * 9.0));
      this.camera.position.copy(this.smoothCameraPos);
      this.camera.lookAt(this.smoothLookTarget);
    }

    _bindCameraControls() {
      if (this._domPointerTarget) return;
      const dom = (window.renderer && window.renderer.domElement) || null;
      if (!dom) return;
      this._domPointerTarget = dom;

      this._onPointerDown = (e) => {
        if (!this.isActive) return;
        if (e.button !== undefined && e.button !== 0) return;
        if (e.target && typeof e.target.closest === "function" && e.target.closest("#docking-hud-overlay")) return;
        this.pointerPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.pointerPositions.size >= 2) {
          const points = Array.from(this.pointerPositions.values());
          this.pinchStartDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          this.pinchStartOrbit = this.orbitDistance;
          this.orbiting = false;
          return;
        }
        this.orbiting = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        if (typeof dom.setPointerCapture === "function" && e.pointerId !== undefined) {
          try { dom.setPointerCapture(e.pointerId); } catch (err) {}
        }
      };

      this._onPointerMove = (e) => {
        if (!this.isActive) return;
        if (this.pointerPositions.has(e.pointerId)) {
          this.pointerPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        if (this.pointerPositions.size >= 2) {
          const points = Array.from(this.pointerPositions.values());
          const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          if (this.pinchStartDistance > 0 && distance > 0) {
            this.orbitDistance = Math.max(
              20,
              Math.min(140, this.pinchStartOrbit * (this.pinchStartDistance / distance))
            );
          }
          return;
        }
        if (!this.orbiting) return;
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.orbitYaw -= dx * 0.0045;
        this.orbitPitch = Math.max(-0.12, Math.min(1.12, this.orbitPitch + dy * 0.0032));
      };

      this._onPointerUp = (e) => {
        this.orbiting = false;
        if (e && e.pointerId !== undefined) this.pointerPositions.delete(e.pointerId);
        if (this.pointerPositions.size < 2) this.pinchStartDistance = 0;
      };

      this._onWheel = (e) => {
        if (!this.isActive) return;
        e.preventDefault();
        this.orbitDistance = Math.max(20, Math.min(140, this.orbitDistance + Math.sign(e.deltaY) * 3.2));
      };

      this._onDoubleClick = () => {
        if (!this.isActive) return;
        this.orbitYaw = 0.28;
        this.orbitPitch = 0.22;
        this.orbitDistance = 56;
      };

      dom.addEventListener("pointerdown", this._onPointerDown);
      dom.addEventListener("pointermove", this._onPointerMove);
      dom.addEventListener("pointerup", this._onPointerUp);
      dom.addEventListener("pointercancel", this._onPointerUp);
      dom.addEventListener("wheel", this._onWheel, { passive: false });
      dom.addEventListener("dblclick", this._onDoubleClick);
    }

    _isInsideCaptureCorridor() {
      const dist = this.position.distanceTo(this.targetPortPos);
      const closure = -this.velocity.z;
      const angleErr = this._calcAngularDeviation();
      return dist < 4.2 && closure < 1.25 && closure > -0.6 && angleErr < 10.0;
    }

    _calcAngularDeviation() {
      const fwd = new window.THREE.Vector3(0, 0, 1).applyQuaternion(this.quaternion);
      const dot = Math.max(-1.0, Math.min(1.0, fwd.dot(this.approachInward)));
      return Math.acos(dot) * (180 / Math.PI);
    }

    _updateHUDTelemetry() {
      const dist = this.position.distanceTo(this.targetPortPos);
      const closureRate = -this.velocity.z;
      const angleDeviation = this._calcAngularDeviation();

      if (this.rangeValEl) this.rangeValEl.textContent = `${dist.toFixed(1)} m`;
      if (this.rateValEl) {
        this.rateValEl.textContent = `${closureRate >= 0 ? "+" : ""}${closureRate.toFixed(2)} m/s`;
        this.rateValEl.style.color = Math.abs(closureRate) > 1.8 ? "#ff6b6b" : "#63e6a8";
      }
      if (this.alignValEl) {
        this.alignValEl.textContent = `${angleDeviation.toFixed(1)}°`;
        this.alignValEl.style.color = angleDeviation < 4.5 ? "#63e6a8" : angleDeviation < 10.0 ? "#f5c451" : "#ff6b6b";
      }

      if (this.crosshairBox) {
        const dx = Math.max(-90, Math.min(90, (this.position.x - this.targetPortPos.x) * 38));
        const dy = Math.max(-90, Math.min(90, (this.position.y - this.targetPortPos.y) * 38));
        this.crosshairBox.style.transform = `translate(calc(-50% - ${dx}px), calc(-50% + ${dy}px))`;
      }

      if (this.statusBadgeEl) {
        const now = performance.now();
        if (this._assistFlashText && now < this._assistFlashUntil) {
          this.statusBadgeEl.textContent = this._assistFlashText;
          this.statusBadgeEl.style.color = "var(--ui-brand-strong)";
          this.statusBadgeEl.style.borderColor = "rgba(var(--ui-brand-rgb),0.75)";
        } else if (this.contactTimer > 0 && !this._isInsideCaptureCorridor()) {
          this.statusBadgeEl.textContent = "STATION CONTACT • BACK AWAY OR USE FINE RCS";
          this.statusBadgeEl.style.color = "#ff6b6b";
          this.statusBadgeEl.style.borderColor = "rgba(255,107,107,0.7)";
        } else if (this._isInsideCaptureCorridor()) {
          this.statusBadgeEl.textContent = "CAPTURE CORRIDOR LOCKED • PRESS [SPACE] / [ENTER] OR LATCH BUTTON";
          this.statusBadgeEl.style.color = "#63e6a8";
          this.statusBadgeEl.style.borderColor = "#63e6a8";
        } else if (dist < 14.0) {
          this.statusBadgeEl.textContent = "FINAL PROXIMITY APPROACH • KEEP CLOSURE < 1.2 m/s";
          this.statusBadgeEl.style.color = "#f5c451";
          this.statusBadgeEl.style.borderColor = "rgba(245,196,81,0.5)";
        } else {
          this.statusBadgeEl.textContent = this.autoAssist
            ? "AUTO-PILOT ACTIVE • GUIDING TO STATION DOOR"
            : (this._isHelmPilot()
              ? "YOU HAVE HELM • [WASD/QE] RCS · ALIGN PMA-2 PORT"
              : "COPILOT TELEMETRY LOCKED TO PILOT • ASSIST [1-4]");
          this.statusBadgeEl.style.color = "var(--ui-brand)";
          this.statusBadgeEl.style.borderColor = "rgba(var(--ui-brand-rgb),0.5)";
        }
      }
    }

    _completeDocking(corridorCapture = false) {
      if (!this.isActive || this.isCompleted) return;
      this.isCompleted = true;
      this._lastCorridorCapture = !!(corridorCapture || this._isInsideCaptureCorridor());

      this.position.copy(this.targetPortPos);
      this.quaternion.copy(this.targetPortQuat);
      if (this.shipGroup) {
        this.shipGroup.position.copy(this.position);
        this.shipGroup.quaternion.copy(this.quaternion);
      }

      if (window.spaceAudio) {
        window.spaceAudio.playDockingLatch();
      }

      if (this.statusBadgeEl) {
        this.statusBadgeEl.textContent = "HARD CAPTURE & PRESSURE SEAL CONFIRMED • ENTERING STATION INTERIOR...";
        this.statusBadgeEl.style.color = "#63e6a8";
        this.statusBadgeEl.style.borderColor = "#63e6a8";
      }

      const captureFlag = this._lastCorridorCapture;
      setTimeout(() => {
        const cb = this.onDockSuccessCallback;
        this.stop();
        // Hide exterior ISS before entering the station interior so we never see the ISS outside!
        if (window.issGroup) {
          window.issGroup.visible = false;
        }
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.visible = true;
        }
        if (typeof cb === "function") {
          cb({ corridorCapture: captureFlag });
        }
      }, 1100);
    }

    updateCrewStatus() {
      if (!this.isActive || !this.hudOverlay) return;
      const nm = window.netManager;
      const isPilot = this._isHelmPilot();
      const pilot = this._getPilotPlayer();
      const pilotName = pilot ? pilot.name : (nm && nm.localPlayer ? nm.localPlayer.name : "Commander");
      const pilotRoleMeta = window.InterfellasRoles
        ? window.InterfellasRoles.getRoleMeta(pilot ? pilot.role : "commander")
        : { short: "CMD", color: "var(--ui-brand)" };
      const myRole = window.InterfellasRoles && nm && nm.localPlayer
        ? window.InterfellasRoles.normalizeRole(nm.localPlayer.role, "commander")
        : "commander";

      const roleBar = this.hudOverlay.querySelector("#dock-crew-role-bar");
      if (roleBar) {
        const gs = nm && typeof nm.getMission === "function" && nm.getMission() ? nm.getMission().groundSupport : null;
        const lccCleared = !!(gs && gs.dockingClearance);
        const roleInstruction = isPilot
          ? "YOUR JOB (PILOT): Fly [WASD + R/F + Arrows + Q/E] &rarr; Press [SPACE] near door"
          : myRole === "engineer"
            ? "YOUR JOB (ENGINEER): Help pilot — [1] Steady Ship, [2] Gentle Thrusters"
            : myRole === "scientist"
              ? "YOUR JOB (SCIENTIST): Watch Station Door — [3] Laser Guide Beam, [4] Distance Check"
              : myRole === "specialist"
                ? "YOUR JOB (SPECIALIST): Latch Watch — [3] Laser Guide Beam, [4] Distance Check"
                : "CREW HELP: Watch live flight numbers or click [TAKE CONTROLS] if needed";

        roleBar.innerHTML = `
          <span style="padding:3px 7px;border-radius:3px;border:1px solid ${pilotRoleMeta.color};color:${pilotRoleMeta.color};font-weight:700;">
            PILOT: [${pilotRoleMeta.short}] ${String(pilotName).replace(/[<>&"]/g, "")}${isPilot ? " (YOU)" : ""}
          </span>
          <span style="padding:2px 6px;border-radius:3px;border:1px solid ${lccCleared ? "rgba(99,230,168,0.55)" : "rgba(255,255,255,0.22)"};background:${lccCleared ? "rgba(99,230,168,0.16)" : "transparent"};color:${lccCleared ? "#63e6a8" : "#a7b0ba"};font-size:9px;font-weight:700;">
            GROUND OK: ${lccCleared ? "CLEARED" : "STANDBY"}
          </span>
          <span style="color:#efeee7;">${roleInstruction}</span>
          <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">
            <button type="button" id="btn-dock-assist-1" class="dock-assist-btn" style="padding:4px 8px;border-radius:4px;border:1px solid ${myRole === "engineer" ? "var(--ui-brand)" : "rgba(255,255,255,0.22)"};background:${myRole === "engineer" ? "rgba(var(--ui-brand-rgb),0.18)" : "rgba(255,255,255,0.06)"};color:var(--ui-brand-strong);font-family:inherit;font-size:9px;font-weight:700;cursor:pointer;">[1] STEADY SHIP</button>
            <button type="button" id="btn-dock-assist-2" class="dock-assist-btn" style="padding:4px 8px;border-radius:4px;border:1px solid ${myRole === "engineer" ? "var(--ui-brand)" : "rgba(255,255,255,0.22)"};background:${myRole === "engineer" ? "rgba(var(--ui-brand-rgb),0.18)" : "rgba(255,255,255,0.06)"};color:var(--ui-brand-strong);font-family:inherit;font-size:9px;font-weight:700;cursor:pointer;">[2] GENTLE MODE</button>
            <button type="button" id="btn-dock-assist-3" class="dock-assist-btn" style="padding:4px 8px;border-radius:4px;border:1px solid ${(myRole === "scientist" || myRole === "specialist") ? "#63e6a8" : "rgba(255,255,255,0.22)"};background:${(myRole === "scientist" || myRole === "specialist") ? "rgba(99,230,168,0.18)" : "rgba(255,255,255,0.06)"};color:#63e6a8;font-family:inherit;font-size:9px;font-weight:700;cursor:pointer;">[3] LASER GUIDE</button>
            <button type="button" id="btn-dock-assist-4" class="dock-assist-btn" style="padding:4px 8px;border-radius:4px;border:1px solid ${(myRole === "scientist" || myRole === "specialist") ? "#63e6a8" : "rgba(255,255,255,0.22)"};background:${(myRole === "scientist" || myRole === "specialist") ? "rgba(99,230,168,0.18)" : "rgba(255,255,255,0.06)"};color:#63e6a8;font-family:inherit;font-size:9px;font-weight:700;cursor:pointer;">[4] CHECK DISTANCE</button>
            ${!isPilot ? `<button type="button" id="btn-dock-take-helm" style="padding:4px 8px;border-radius:4px;border:1px solid rgba(var(--ui-brand-rgb),0.6);background:rgba(var(--ui-brand-rgb),0.16);color:var(--ui-brand-strong);font-family:inherit;font-size:9px;font-weight:800;cursor:pointer;">TAKE CONTROLS</button>` : ""}
          </div>
        `;
        const b1 = roleBar.querySelector("#btn-dock-assist-1");
        const b2 = roleBar.querySelector("#btn-dock-assist-2");
        const b3 = roleBar.querySelector("#btn-dock-assist-3");
        const b4 = roleBar.querySelector("#btn-dock-assist-4");
        const bHelm = roleBar.querySelector("#btn-dock-take-helm");
        if (b1) b1.addEventListener("click", () => this._triggerCrewAssist("rcs_stabilize"));
        if (b2) b2.addEventListener("click", () => this._triggerCrewAssist("fine_trim"));
        if (b3) b3.addEventListener("click", () => this._triggerCrewAssist("boresight"));
        if (b4) b4.addEventListener("click", () => this._triggerCrewAssist("ping"));
        if (bHelm) {
          bHelm.addEventListener("click", () => {
            if (window.netManager && typeof window.netManager.requestDockingHelm === "function") {
              window.netManager.requestDockingHelm(window.netManager.socketId);
            }
          });
        }
      }

      const rcsBar = this.hudOverlay.querySelector(".dock-rcs-bar");
      if (rcsBar) {
        rcsBar.style.opacity = isPilot ? "1" : "0.45";
        rcsBar.style.pointerEvents = isPilot ? "auto" : "none";
      }
      const btnLatch = this.hudOverlay.querySelector("#btn-dock-latch-now");
      if (btnLatch) {
        const players = nm && nm.roomState && Array.isArray(nm.roomState.players) ? nm.roomState.players : [];
        const canSkip = players.length <= 1 || isPilot || (nm && nm.isHost) || myRole === "commander";
        btnLatch.style.opacity = canSkip ? "1" : "0.5";
        btnLatch.title = canSkip ? "Dock right now or skip" : "Pilot or host controls docking skip";
      }
    }

    _createDockingHUD() {
      const existing = document.getElementById("docking-hud-overlay");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      this.hudOverlay = document.createElement("div");
      this.hudOverlay.id = "docking-hud-overlay";

      this.hudOverlay.innerHTML = `
        <div class="dock-header-row">
          <div class="dock-title-card">
            <div style="font-size:9.5px;font-weight:700;letter-spacing:1.6px;color:var(--ui-brand);">PHASE 3 // COORDINATED ORBITAL DOCKING</div>
            <div class="dock-title-main" style="font-size:13px;font-weight:700;color:#efeee7;letter-spacing:0.8px;">ISS FORWARD PORT PMA-2 / IDA-2</div>
          </div>

          <div id="dock-status-badge">
            STEER YOUR SHIP INTO THE YELLOW TARGET RING
          </div>

          <div class="dock-actions-wrap">
            <button type="button" id="dock-cam-badge" style="background:rgba(6,10,16,0.9);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:7px 12px;font-family:inherit;font-size:10px;font-weight:700;color:#efeee7;cursor:pointer;">
              VIEW: ${this.cameraMode === "chase" ? "CHASE" : "COCKPIT"} [V]
            </button>
            <button type="button" id="btn-dock-auto" style="background:rgba(var(--ui-brand-rgb),0.12);border:1px solid rgba(var(--ui-brand-rgb),0.4);border-radius:6px;padding:7px 12px;font-family:inherit;font-size:10px;font-weight:700;color:var(--ui-brand-strong);cursor:pointer;">
              AUTO-DOCK ASSIST [T]
            </button>
            <button type="button" id="btn-dock-fine" style="background:rgba(6,10,16,0.9);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:7px 12px;font-family:inherit;font-size:10px;font-weight:700;color:#efeee7;cursor:pointer;">
              FINE RCS: OFF
            </button>
            <button type="button" id="btn-dock-latch-now" style="background:rgba(99,230,168,0.16);border:1px solid rgba(99,230,168,0.55);color:#63e6a8;padding:7px 14px;border-radius:6px;font-family:inherit;font-size:10px;font-weight:700;letter-spacing:1px;cursor:pointer;">
              COMPLETE DOCK &amp; BOARD STATION ⏩
            </button>
            <button type="button" id="btn-dock-leave" style="background:rgba(255,107,107,0.14);border:1px solid rgba(255,107,107,0.5);color:#ff6b6b;padding:7px 12px;border-radius:6px;font-family:inherit;font-size:10px;font-weight:700;letter-spacing:1px;cursor:pointer;">
              LEAVE
            </button>
            <div class="dock-hint-line">
              WASD/R/F MOVE &middot; ARROWS/Q/E TURN &middot; SPACE DOCK &middot; DRAG CAMERA
            </div>
          </div>
        </div>

        <div id="dock-crew-role-bar" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:7px 12px;margin:4px auto 0;max-width:1180px;background:rgba(6,10,16,0.88);border:1px solid rgba(var(--ui-brand-rgb),0.28);border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;pointer-events:auto;"></div>

        <div class="dock-reticle">
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;border:2px solid rgba(var(--ui-brand-rgb),0.65);border-radius:50%;">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:4px;background:var(--ui-brand);border-radius:50%;"></div>
          </div>
          <div id="dock-target-box" style="position:absolute;top:50%;left:50%;width:56px;height:56px;border:2px dashed var(--ui-brand);transform:translate(-50%,-50%);transition:transform 0.05s linear;">
            <div style="position:absolute;top:-16px;left:0;font-size:9px;font-weight:700;color:var(--ui-brand);letter-spacing:1px;">PMA-2</div>
          </div>
        </div>

        <div class="dock-bottom-row">
          <div class="dock-telem-grid">
            <div class="dock-telem-card">
              <div style="font-size:8.5px;font-weight:700;color:#a7b0ba;letter-spacing:1px;">RANGE TO PORT</div>
              <div id="dock-range-val" style="font-size:15px;font-weight:700;color:var(--ui-brand);">-- m</div>
            </div>
            <div class="dock-telem-card">
              <div style="font-size:8.5px;font-weight:700;color:#a7b0ba;letter-spacing:1px;">CLOSURE RATE</div>
              <div id="dock-rate-val" style="font-size:15px;font-weight:700;color:var(--ui-brand);">-- m/s</div>
            </div>
            <div class="dock-telem-card">
              <div style="font-size:8.5px;font-weight:700;color:#a7b0ba;letter-spacing:1px;">ATTITUDE ERR</div>
              <div id="dock-align-val" style="font-size:15px;font-weight:700;color:#63e6a8;">--°</div>
            </div>
          </div>
          <div class="dock-rcs-bar">
            <button type="button" class="rcs-btn" data-key="KeyW" style="padding:6px 9px;border-radius:4px;border:1px solid rgba(var(--ui-brand-rgb),0.35);background:rgba(255,255,255,0.05);color:#efeee7;font-family:inherit;font-size:9.5px;font-weight:700;cursor:pointer;">FWD [W]</button>
            <button type="button" class="rcs-btn" data-key="KeyS" style="padding:6px 9px;border-radius:4px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:#efeee7;font-family:inherit;font-size:9.5px;font-weight:700;cursor:pointer;">AFT [S]</button>
            <button type="button" class="rcs-btn" data-key="KeyA" style="padding:6px 9px;border-radius:4px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:#efeee7;font-family:inherit;font-size:9.5px;font-weight:700;cursor:pointer;">PORT [A]</button>
            <button type="button" class="rcs-btn" data-key="KeyD" style="padding:6px 9px;border-radius:4px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:#efeee7;font-family:inherit;font-size:9.5px;font-weight:700;cursor:pointer;">STBD [D]</button>
            <button type="button" class="rcs-btn" data-key="KeyR" style="padding:6px 9px;border-radius:4px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:#efeee7;font-family:inherit;font-size:9.5px;font-weight:700;cursor:pointer;">UP [R]</button>
            <button type="button" class="rcs-btn" data-key="KeyF" style="padding:6px 9px;border-radius:4px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:#efeee7;font-family:inherit;font-size:9.5px;font-weight:700;cursor:pointer;">DN [F]</button>
          </div>
        </div>
      `;

      document.body.appendChild(this.hudOverlay);

      this.rangeValEl = this.hudOverlay.querySelector("#dock-range-val");
      this.rateValEl = this.hudOverlay.querySelector("#dock-rate-val");
      this.alignValEl = this.hudOverlay.querySelector("#dock-align-val");
      this.statusBadgeEl = this.hudOverlay.querySelector("#dock-status-badge");
      this.crosshairBox = this.hudOverlay.querySelector("#dock-target-box");
      this.camModeBadge = this.hudOverlay.querySelector("#dock-cam-badge");

      if (this.camModeBadge) {
        this.camModeBadge.addEventListener("click", () => {
          this.cameraMode = this.cameraMode === "chase" ? "cockpit" : "chase";
          this.camModeBadge.textContent = this.cameraMode === "chase" ? "VIEW: CHASE [V]" : "VIEW: COCKPIT [V]";
        });
      }

      const btnAuto = this.hudOverlay.querySelector("#btn-dock-auto");
      if (btnAuto) {
        btnAuto.addEventListener("click", () => this.toggleAutoAssist());
      }

      const btnFine = this.hudOverlay.querySelector("#btn-dock-fine");
      if (btnFine) {
        btnFine.addEventListener("click", () => this.toggleFineControl());
      }

      const btnLatchNow = this.hudOverlay.querySelector("#btn-dock-latch-now");
      if (btnLatchNow) {
        btnLatchNow.addEventListener("click", () => this.skip());
      }

      const btnLeave = this.hudOverlay.querySelector("#btn-dock-leave");
      if (btnLeave) {
        btnLeave.addEventListener("click", () => {
          const leaveBtn = document.getElementById("btn-hud-leave-room");
          if (leaveBtn) {
            leaveBtn.click();
          } else if (window.netManager && typeof window.netManager.leaveRoom === "function") {
            window.netManager.leaveRoom();
          }
        });
      }

      this.hudOverlay.querySelectorAll(".rcs-btn").forEach((btn) => {
        const k = btn.dataset.key;
        const startHold = (e) => {
          e.preventDefault();
          this.keys[k] = true;
        };
        const endHold = (e) => {
          e.preventDefault();
          this.keys[k] = false;
        };
        btn.addEventListener("mousedown", startHold);
        btn.addEventListener("mouseup", endHold);
        btn.addEventListener("mouseleave", endHold);
        btn.addEventListener("touchstart", startHold, { passive: false });
        btn.addEventListener("touchend", endHold, { passive: false });
      });

      this.updateCrewStatus();
    }
  }

  window.DockingSimulator = DockingSimulator;
  window.dockingSim = new DockingSimulator();
})(window);
