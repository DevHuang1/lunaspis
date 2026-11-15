// ============================================================
// vr_mode.js — WebXR & Side-by-Side Stereo VR Inspection Mode
// Enables headset WebXR ("immersive-vr") + universal desktop/mobile
// Stereo Split-Screen VR for Mission Viz, ISS Showcase & Station
// ============================================================

(function () {
  class VRModeManager {
    constructor() {
      this.scene = null;
      this.camera = null;
      this.renderer = null;

      this.webxrSupported = false;
      this.xrSession = null;
      this.isWebXRActive = false;
      this.isStereoActive = false;

      this.stereoCam = null;
      this.eyeSepMm = 64;
      this._sizeVec = new THREE.Vector2();

      // WebXR camera rig preservation
      this.vrRig = null;
      this._savedCamPos = new THREE.Vector3();
      this._savedCamQuat = new THREE.Quaternion();
      this._savedCamParent = null;

      // Optional mobile gyroscope look offset in Stereo mode
      this.gyroEnabled = false;
      this._gyroBaseline = null;
      this._gyroEuler = new THREE.Euler(0, 0, 0, "YXZ");
      this._gyroOffsetQuat = new THREE.Quaternion();
      this._onDeviceOrientationBound = (e) => this._onDeviceOrientation(e);

      this.uiRoot = null;
      this._onKeyDownBound = (e) => {
        if (e.code === "Escape" && (this.isStereoActive || this.isWebXRActive)) {
          this.exitVR();
        }
      };
    }

    init(scene, camera, renderer) {
      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;

      if (typeof THREE !== "undefined" && THREE.StereoCamera) {
        this.stereoCam = new THREE.StereoCamera();
        this.stereoCam.aspect = 0.5;
        this.stereoCam.eyeSep = this.eyeSepMm / 1000;
      }

      if (renderer && renderer.xr) {
        renderer.xr.setReferenceSpaceType("local");
      }

      this._detectWebXR();
      this._buildUI();
      this._syncButtonLabels();
    }

    async _detectWebXR() {
      try {
        if (navigator.xr && typeof navigator.xr.isSessionSupported === "function") {
          this.webxrSupported = await navigator.xr.isSessionSupported("immersive-vr");
        } else {
          this.webxrSupported = false;
        }
      } catch (e) {
        this.webxrSupported = false;
      }
      this._syncButtonLabels();
    }

    get isAnyVRActive() {
      return !!(this.isWebXRActive || this.isStereoActive);
    }

    async toggleVR(preferredMode = "auto") {
      if (this.isAnyVRActive) {
        await this.exitVR();
        return false;
      }

      if (preferredMode === "stereo") {
        this.enterStereoVR();
        return true;
      }

      if (this.webxrSupported && preferredMode !== "stereo") {
        const started = await this.enterWebXR();
        if (started) return true;
      }

      // Universal fallback for browsers without WebXR headsets
      this.enterStereoVR();
      return true;
    }

    async enterWebXR() {
      if (!this.renderer || !this.camera || !this.scene || !navigator.xr) return false;
      try {
        const session = await navigator.xr.requestSession("immersive-vr", {
          optionalFeatures: ["local-floor", "bounded-floor"]
        });
        this.xrSession = session;
        this.isWebXRActive = true;
        this.isStereoActive = false;

        // Place camera inside a movable VR rig anchored at the user's current view point
        this._savedCamPos.copy(this.camera.position);
        this._savedCamQuat.copy(this.camera.quaternion);
        this._savedCamParent = this.camera.parent || this.scene;

        this.vrRig = new THREE.Group();
        this.vrRig.name = "WebXR_UserRig";
        this.vrRig.position.copy(this._savedCamPos);

        const euler = new THREE.Euler().setFromQuaternion(this._savedCamQuat, "YXZ");
        this.vrRig.rotation.set(0, euler.y, 0);

        this.scene.add(this.vrRig);
        this.vrRig.add(this.camera);
        this.camera.position.set(0, 0, 0);
        this.camera.quaternion.identity();

        this.renderer.xr.enabled = true;
        await this.renderer.xr.setSession(session);

        session.addEventListener("end", () => {
          this._cleanupWebXR();
        }, { once: true });

        document.body.classList.add("vr-webxr-active");
        this._showOverlay();
        this._syncButtonLabels();
        window.addEventListener("keydown", this._onKeyDownBound);
        return true;
      } catch (err) {
        console.warn("[VRMode] WebXR session unavailable or declined, falling back to Stereo VR:", err);
        this._cleanupWebXR();
        return false;
      }
    }

    _cleanupWebXR() {
      const wasActive = this.isWebXRActive;
      this.isWebXRActive = false;
      this.xrSession = null;

      if (this.renderer && this.renderer.xr) {
        this.renderer.xr.enabled = false;
      }

      if (this.vrRig && this.camera) {
        if (this.camera.parent === this.vrRig) {
          this.vrRig.remove(this.camera);
        }
        const targetParent = this._savedCamParent || this.scene;
        if (targetParent && this.camera.parent !== targetParent) {
          targetParent.add(this.camera);
        }
        if (wasActive) {
          this.camera.position.copy(this._savedCamPos);
          this.camera.quaternion.copy(this._savedCamQuat);
        }
        if (this.vrRig.parent) {
          this.vrRig.parent.remove(this.vrRig);
        }
        this.vrRig = null;
      }

      document.body.classList.remove("vr-webxr-active");
      this._hideOverlayIfInactive();
      this._syncButtonLabels();
    }

    enterStereoVR() {
      if (!this.renderer || !this.camera || !this.scene) return;
      if (this.isWebXRActive) return;

      this.isStereoActive = true;
      document.body.classList.add("vr-stereo-active");
      this._showOverlay();
      this._syncButtonLabels();
      window.addEventListener("keydown", this._onKeyDownBound);

      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    async exitVR() {
      window.removeEventListener("keydown", this._onKeyDownBound);
      this._disableGyro();

      if (this.xrSession) {
        try {
          await this.xrSession.end();
        } catch (e) {
          this._cleanupWebXR();
        }
      } else {
        this._cleanupWebXR();
      }

      if (this.isStereoActive) {
        this.isStereoActive = false;
        document.body.classList.remove("vr-stereo-active");
        if (this.renderer) {
          this.renderer.setScissorTest(false);
          this.renderer.getSize(this._sizeVec);
          this.renderer.setViewport(0, 0, this._sizeVec.x, this._sizeVec.y);
        }
      }

      this._hideOverlayIfInactive();
      this._syncButtonLabels();
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    async toggleGyro() {
      if (this.gyroEnabled) {
        this._disableGyro();
        return false;
      }
      try {
        if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm !== "granted") return false;
        }
      } catch (e) {
        return false;
      }
      this._gyroBaseline = null;
      this.gyroEnabled = true;
      window.addEventListener("deviceorientation", this._onDeviceOrientationBound);
      this._syncButtonLabels();
      return true;
    }

    _disableGyro() {
      this.gyroEnabled = false;
      this._gyroBaseline = null;
      this._gyroOffsetQuat.identity();
      window.removeEventListener("deviceorientation", this._onDeviceOrientationBound);
      this._syncButtonLabels();
    }

    _onDeviceOrientation(event) {
      if (!this.gyroEnabled) return;
      const alpha = typeof event.alpha === "number" ? event.alpha : 0;
      const beta = typeof event.beta === "number" ? event.beta : 0;
      const gamma = typeof event.gamma === "number" ? event.gamma : 0;
      if (!this._gyroBaseline) {
        this._gyroBaseline = { alpha, beta, gamma };
      }
      const dYaw = THREE.MathUtils.degToRad(alpha - this._gyroBaseline.alpha);
      const dPitch = THREE.MathUtils.degToRad(beta - this._gyroBaseline.beta) * 0.6;
      const dRoll = THREE.MathUtils.degToRad(gamma - this._gyroBaseline.gamma) * 0.4;
      this._gyroEuler.set(
        THREE.MathUtils.clamp(dPitch, -0.65, 0.65),
        dYaw,
        THREE.MathUtils.clamp(-dRoll, -0.4, 0.4),
        "YXZ"
      );
      this._gyroOffsetQuat.setFromEuler(this._gyroEuler);
    }

    syncRigToPlayer(playerGroup, yaw, eyeHeight = 1.6) {
      if (!this.isWebXRActive || !this.vrRig || !playerGroup) return;
      const p = playerGroup.position;
      this.vrRig.position.set(p.x, p.y + eyeHeight, p.z);
      this.vrRig.rotation.set(0, typeof yaw === "number" ? yaw : 0, 0);
    }

    recenterVR() {
      this._gyroBaseline = null;
      this._gyroOffsetQuat.identity();
      if (this.vrRig && this.camera) {
        this.vrRig.position.copy(this._savedCamPos);
      }
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    setEyeSepMm(mm) {
      const clamped = Math.max(50, Math.min(80, Number(mm) || 64));
      this.eyeSepMm = clamped;
      if (this.stereoCam) {
        this.stereoCam.eyeSep = clamped / 1000;
      }
      this._syncButtonLabels();
    }

    render(scene, camera, cinematicPass, elapsed, settings) {
      if (!this.renderer || !scene || !camera) return;

      // 1. WebXR headset active: bypass EffectComposer/postprocessing so native eye cameras render cleanly
      if (this.isWebXRActive && this.renderer.xr && this.renderer.xr.isPresenting) {
        this.renderer.render(scene, camera);
        return;
      }

      // 2. Universal Side-by-Side Stereo VR mode
      if (this.isStereoActive && this.stereoCam) {
        this._renderStereo(scene, camera);
        return;
      }

      // 3. Standard desktop/mobile render (with optional cinematic postprocessing).
      // The main loop owns perfSettings as a local; accept it as an argument and
      // fall back to the window copy for standalone/legacy callers.
      const activeSettings = settings || window.perfSettings || null;
      if (cinematicPass && activeSettings && activeSettings.cinematicPreset !== "off") {
        cinematicPass.render(scene, camera, elapsed);
      } else {
        this.renderer.render(scene, camera);
      }
    }

    _renderStereo(scene, camera) {
      const renderer = this.renderer;
      renderer.getSize(this._sizeVec);
      const w = Math.max(2, Math.floor(this._sizeVec.x));
      const h = Math.max(2, Math.floor(this._sizeVec.y));
      const halfW = Math.floor(w / 2);

      // Apply temporary gyro offset cleanly and restore immediately after update
      const hadGyro = this.gyroEnabled;
      const savedQuat = hadGyro ? camera.quaternion.clone() : null;
      if (hadGyro) {
        camera.quaternion.multiply(this._gyroOffsetQuat);
      }

      if (scene.autoUpdate === true) scene.updateMatrixWorld();
      if (camera.parent === null) camera.updateMatrixWorld();

      this.stereoCam.aspect = 0.5;
      this.stereoCam.eyeSep = this.eyeSepMm / 1000;
      this.stereoCam.update(camera);

      if (hadGyro && savedQuat) {
        camera.quaternion.copy(savedQuat);
      }

      renderer.setScissorTest(true);

      // Left Eye Viewport
      renderer.setScissor(0, 0, halfW, h);
      renderer.setViewport(0, 0, halfW, h);
      renderer.render(scene, this.stereoCam.cameraL);

      // Right Eye Viewport
      renderer.setScissor(halfW, 0, w - halfW, h);
      renderer.setViewport(halfW, 0, w - halfW, h);
      renderer.render(scene, this.stereoCam.cameraR);

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
    }

    _buildUI() {
      if (this.uiRoot || typeof document === "undefined") return;

      const root = document.createElement("div");
      root.id = "vr-mode-overlay";
      root.style.cssText = "display:none;position:fixed;inset:0;z-index:1200;pointer-events:none;font-family:'JetBrains Mono','Inter',monospace;";
      root.innerHTML = `
        <div id="vr-stereo-divider" style="position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:linear-gradient(to bottom,rgba(var(--ui-brand-rgb),0.15),rgba(var(--ui-brand-rgb),0.7),rgba(var(--ui-brand-rgb),0.15));"></div>
        <div style="position:absolute;top:12px;left:50%;transform:translateX(-50%);pointer-events:auto;display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;padding:6px 12px;border-radius:18px;background:rgba(10,14,26,0.9);border:1px solid rgba(var(--ui-brand-rgb),0.5);box-shadow:0 6px 24px rgba(0,0,0,0.55);color:#efeee7;font-size:10px;width:max-content;max-width:calc(100vw - 20px);">
          <span id="vr-mode-badge" style="font-weight:800;letter-spacing:0.08em;color:var(--ui-brand-strong);">VR STEREO</span>
          <label style="display:inline-flex;align-items:center;gap:4px;color:#a7b0ba;font-size:9px;">
            IPD
            <input type="range" id="vr-ipd-slider" min="52" max="76" value="64" step="1" style="width:68px;accent-color:var(--ui-brand);cursor:pointer;" />
            <span id="vr-ipd-val" style="color:#efeee7;min-width:30px;">64mm</span>
          </label>
          <button type="button" id="vr-btn-gyro" style="padding:3px 7px;border-radius:5px;border:1px solid rgba(var(--ui-brand-rgb),0.45);background:rgba(var(--ui-brand-rgb),0.12);color:var(--ui-brand);font-family:inherit;font-size:9px;font-weight:700;cursor:pointer;">GYRO OFF</button>
          <button type="button" id="vr-btn-recenter" style="padding:3px 7px;border-radius:5px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:#efeee7;font-family:inherit;font-size:9px;font-weight:700;cursor:pointer;">RECENTER</button>
          <button type="button" id="vr-btn-exit" style="padding:3px 9px;border-radius:5px;border:1px solid rgba(255,107,107,0.6);background:rgba(255,107,107,0.2);color:#ff6b6b;font-family:inherit;font-size:9px;font-weight:800;cursor:pointer;">EXIT VR [ESC]</button>
        </div>
      `;
      document.body.appendChild(root);
      this.uiRoot = root;

      const slider = root.querySelector("#vr-ipd-slider");
      const ipdVal = root.querySelector("#vr-ipd-val");
      if (slider) {
        slider.addEventListener("input", () => {
          this.setEyeSepMm(slider.value);
          if (ipdVal) ipdVal.textContent = `${this.eyeSepMm}mm`;
        });
      }

      const btnGyro = root.querySelector("#vr-btn-gyro");
      const btnRecenter = root.querySelector("#vr-btn-recenter");
      const btnExit = root.querySelector("#vr-btn-exit");
      if (btnGyro) btnGyro.addEventListener("click", () => this.toggleGyro());
      if (btnRecenter) btnRecenter.addEventListener("click", () => this.recenterVR());
      if (btnExit) btnExit.addEventListener("click", () => this.exitVR());
    }

    _showOverlay() {
      if (!this.uiRoot) this._buildUI();
      if (!this.uiRoot) return;
      this.uiRoot.style.display = "block";
      const div = this.uiRoot.querySelector("#vr-stereo-divider");
      const badge = this.uiRoot.querySelector("#vr-mode-badge");
      if (div) div.style.display = this.isStereoActive ? "block" : "none";
      if (badge) badge.textContent = this.isWebXRActive ? "WEBXR IMMERSIVE" : "VR STEREO SBS";
    }

    _hideOverlayIfInactive() {
      if (this.uiRoot && !this.isAnyVRActive) {
        this.uiRoot.style.display = "none";
      }
    }

    _syncButtonLabels() {
      if (this.uiRoot) {
        const gyroBtn = this.uiRoot.querySelector("#vr-btn-gyro");
        if (gyroBtn) {
          gyroBtn.textContent = this.gyroEnabled ? "GYRO ON" : "GYRO OFF";
          gyroBtn.style.background = this.gyroEnabled ? "rgba(var(--ui-brand-rgb),0.28)" : "rgba(var(--ui-brand-rgb),0.12)";
        }
      }

      // Sync any HUD or modal VR trigger buttons if present
      const mvBtn = document.getElementById("mv-btn-vr");
      if (mvBtn) {
        if (this.isAnyVRActive) {
          mvBtn.textContent = "EXIT VR";
        } else {
          mvBtn.textContent = this.webxrSupported ? "🥽 WEBXR / VR" : "🥽 STEREO VR";
        }
      }
      const hudVrBtn = document.getElementById("btn-hud-vr-main");
      if (hudVrBtn) {
        const deckLabel = hudVrBtn.querySelector(".deck-row__label");
        const deckSub = hudVrBtn.querySelector(".deck-row__sub");
        if (deckLabel) {
          deckLabel.textContent = this.isAnyVRActive ? "EXIT VR" : "VR MODE";
          if (deckSub) deckSub.textContent = this.isAnyVRActive ? "Return to standard view" : "WebXR or side-by-side stereo";
        } else {
          hudVrBtn.innerHTML = this.isAnyVRActive
            ? "<span>⏹</span><span>EXIT VR</span>"
            : "<span>🥽</span><span>VR</span>";
        }
        hudVrBtn.title = this.isAnyVRActive ? "Exit WebXR / Stereo VR Mode [ESC]" : "Toggle WebXR / Stereo VR Mode";
      }
      const interiorVrBtn = document.getElementById("btn-hud-vr");
      if (interiorVrBtn) {
        interiorVrBtn.textContent = this.isAnyVRActive ? "EXIT VR" : "VR VIEW";
        interiorVrBtn.title = this.isAnyVRActive ? "Exit WebXR / Stereo VR Mode [ESC]" : "Toggle WebXR / Stereo VR View";
      }
      const issVrBtn = document.getElementById("iss-btn-vr");
      if (issVrBtn) {
        issVrBtn.textContent = this.isAnyVRActive
          ? "⏹ EXIT VR"
          : (this.webxrSupported ? "🥽 WEBXR / VR" : "🥽 STEREO VR");
      }
    }
  }

  window.VRModeManager = VRModeManager;
  window.vrManager = new VRModeManager();
})();
