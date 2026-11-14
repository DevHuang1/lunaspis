/**
 * ============================================================================
 * INTERFELLAS CINEMATIC EARTH LAUNCH & MISSION SEQUENCE ENGINE
 * ============================================================================
 * Orchestrates the full 9-stage NASA Space Shuttle EX-01 launch & mission sequence:
 * 1. T-3.5s: Sound suppression deluge active; 3x SSME main engine ignition
 * 2. T+0s: Solid Rocket Boosters (SRBs) ignite with massive thrust; tower clearance
 * 3. T+3.9–6.8s: Roll program: stack rolls 120° about long axis to flight azimuth
 * 4. T+7–13s: Pitch-over heads-down climbing over high-resolution 3D Earth
 * 5. T+13s: SRB booster separation: BSM separation motors fire outboard; SRBs tumble away
 * 6. T+19s: MECO (Main Engine Cutoff); main plumes extinguish
 * 7. T+20.8s: External Tank jettison: tank separates downwards away from Orbiter
 * 8. T+24s: Orbital sunrise insertion (408 km circular orbit)
 * 9. T+25.5–32s: Payload bay doors open (PayloadDoors_Open clip), Satellite lifts
 *    out of SOCKET_Payload and unfolds solar wings & dish boom (Satellite_Deploy clip)!
 * - Full audio integration: countdown beeps, engine roar, staging clank, airlock cycle
 * - Instant Skip option ([SPACE] or [ESC] key or button)
 */

(function (window) {
  "use strict";

  class LaunchCutsceneManager {
    constructor() {
      this.isPlaying = false;
      this.onCompleteCallback = null;
      this.elapsed = 0.0;
      this.duration = 32.0;

      // 3D Objects & Hierarchy
      this.cutsceneGroup = null;
      this.stackGroup = null;
      this.stackCore = null;
      this.orbiterMesh = null;
      this.tankMesh = null;
      this.srbLeft = null;
      this.srbRight = null;
      this.satelliteMesh = null;
      this.earthMesh = null;
      this.plumes = [];
      this.bsmPuffs = [];

      // Animation Mixers
      this.orbiterMixer = null;
      this.orbiterActions = {};
      this.satelliteMixer = null;
      this.satelliteActions = {};

      // Stage Triggers
      this.srbSeparated = false;
      this.tankSeparated = false;
      this.doorsOpened = false;
      this.satelliteDeployed = false;

      // Cameras
      this.scene = null;
      this.camera = null;
      this.renderer = null;

      // UI
      this.overlayEl = null;
      this.telemetryEl = null;
      this.bannerEl = null;
      this.flashEl = null;

      // Ground-liftoff stage
      this.groundGroup = null;
      this.groundPhase = false;
      this.groundReleased = false;
      this.groundReleasedAt = 0;
      this.spaceCenterStack = null;
    }

    /**
     * Preloads assets needed for the launch sequence.
     */
    preload(glbManager) {
      if (!glbManager) return Promise.resolve();
      return Promise.all([
        glbManager.loadGLB("assets/Orbiter_V2.glb").catch(() => {}),
        glbManager.loadGLB("assets/ExternalTank.glb").catch(() => {}),
        glbManager.loadGLB("assets/SolidRocketBooster.glb").catch(() => {}),
        glbManager.loadGLB("assets/Satellite.glb").catch(() => {})
      ]);
    }

    /**
     * Begins the cinematic launch cutscene.
     */
    start(scene, camera, renderer, onComplete) {
      if (this.isPlaying) return;
      this.isPlaying = true;
      this.elapsed = 0.0;
      this.fastForward = false;
      this.srbSeparated = false;
      this.tankSeparated = false;
      this.doorsOpened = false;
      this.satelliteDeployed = false;
      this.onCompleteCallback = onComplete;
      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;

      this.groundGroup = null;
      this.groundPhase = false;
      this.groundReleased = false;
      this.groundReleasedAt = 0;
      this.spaceCenterStack = null;

      // Create UI Overlay
      this._createHUD();

      // Keep the real LC-39A pad/tower visible under the first ascent stage so
      // liftoff reads as an actual ground launch instead of a cut to orbit.
      this._captureGroundStage();

      // Build 3D Launch Stack & Earth environment
      this._buildLaunchScene();

      // Start sound synthesis
      if (window.spaceAudio) {
        window.spaceAudio.playCountdownBeep(false);
        setTimeout(() => window.spaceAudio.startRocketRoar(1.2), 1500);
      }

      // Preload launch assets in background
      if (window.glbManager) {
        this.preload(window.glbManager);
      }

      // Hotkey listener for SKIP / VOTE SKIP
      this._keyHandler = (e) => {
        const tag = e.target && e.target.tagName ? e.target.tagName : "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.code === "Space" || e.code === "Escape") {
          e.preventDefault();
          this.skip();
        }
      };
      window.addEventListener("keydown", this._keyHandler);
    }

    skip() {
      if (!this.isPlaying) return;
      const nm = window.netManager;
      const players = nm && nm.roomState && Array.isArray(nm.roomState.players) ? nm.roomState.players : [];
      if (nm && nm.connected && nm.roomId && players.length > 1 && typeof nm.voteLaunchSkip === "function") {
        this._localSkipVoted = true;
        nm.voteLaunchSkip();
        this.updateCrewStatus();
        return;
      }
      this.finish({ skipped: true, naturalEnd: false });
    }

    /**
     * Aborts the cinematic without invoking the completion callback. Used when
     * the crew resets or advances the shared mission phase via server authority.
     */
    cancel() {
      if (!this.isPlaying) return;
      this.isPlaying = false;
      this.fastForward = false;
      this._localSkipVoted = false;
      this.onCompleteCallback = null;
      window.removeEventListener("keydown", this._keyHandler);
      if (window.spaceAudio) {
        window.spaceAudio.stopRocketRoar(0.5);
      }
      if (this.cutsceneGroup && this.cutsceneGroup.parent) {
        this.scene.remove(this.cutsceneGroup);
      }
      if (this.overlayEl && this.overlayEl.parentNode) {
        this.overlayEl.parentNode.removeChild(this.overlayEl);
      }
      document.body.classList.remove("launch-active");
      this._cleanupGroundStage();
    }

    finish(result = {}) {
      if (!this.isPlaying) return;
      this.isPlaying = false;
      this.fastForward = false;
      this._localSkipVoted = false;

      window.removeEventListener("keydown", this._keyHandler);

      if (window.spaceAudio) {
        window.spaceAudio.stopRocketRoar(0.8);
        window.spaceAudio.playRadioBeep(true);
      }

      // Cleanup 3D scene objects
      if (this.cutsceneGroup && this.cutsceneGroup.parent) {
        this.scene.remove(this.cutsceneGroup);
      }

      // Remove UI
      if (this.overlayEl && this.overlayEl.parentNode) {
        this.overlayEl.parentNode.removeChild(this.overlayEl);
      }
      document.body.classList.remove("launch-active");

      this._cleanupGroundStage();

      if (typeof this.onCompleteCallback === "function") {
        this.onCompleteCallback({
          naturalEnd: result.naturalEnd !== false && !result.skipped,
          skipped: !!result.skipped
        });
      }
    }

    update(delta) {
      if (!this.isPlaying) return;
      this.elapsed += delta * (this.fastForward ? 3 : 1);

      const t = this.elapsed;

      // Update animation mixers
      if (this.orbiterMixer) this.orbiterMixer.update(delta);
      if (this.satelliteMixer) this.satelliteMixer.update(delta);

      // Animate Plumes
      this.plumes.forEach(p => {
        if (p.material) {
          p.scale.z = 1.0 + Math.sin(t * 30 + p.offset) * 0.25;
          p.scale.x = 1.0 + Math.cos(t * 25) * 0.15;
          p.scale.y = p.scale.x;
        }
      });

      // Animate Separation Motor Puffs
      this.bsmPuffs.forEach(puff => {
        if (puff.visible) {
          puff.scale.multiplyScalar(1.0 + delta * 3.5);
          puff.material.opacity = Math.max(0, puff.material.opacity - delta * 1.8);
        }
      });

      this._updateGroundFlash();

      // Camera & Stack Motion Profiles
      if (t < 3.5) {
        // Stage 1: T-3.5s to T0: countdown, engine ignition and deluge on the
        // real LC-39A pad. Seamlessly maintains the user's high-angle north-east tracking vantage point (90° right).
        this.stackGroup.position.set(0, 0, 0);
        const k = t / 3.5;
        let camX = 96.0 + Math.cos(t * 0.12) * 3.0;
        let camY = 46.0 + k * 2.0;
        let camZ = -72.0 - Math.sin(t * 0.12) * 3.0;

        // Acoustic rumble / camera vibration as SSME main engines roar to life
        const ignitionShake = Math.max(0, t - 1.5) * 0.12;
        camX += Math.sin(t * 47) * ignitionShake;
        camY += Math.cos(t * 53) * ignitionShake * 0.7;

        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(0, 42.0 + k * 2.0, 0);
        this._updateTelemetry(0, 0, t - 3.5, "T-3s: MAIN ENGINES IGNITE & WATER COOLING ACTIVE");
      } else if (t < 8.0) {
        // Stage 2: T0 to T+4.5s: SRB ignition & tower liftoff, clearing the 300 FT Fixed Service Structure!
        const climbTime = t - 3.5;
        const altitude = Math.pow(climbTime, 2.05) * 11.5;
        this.stackGroup.position.set(0, altitude, 0);

        // Roll program (rolls 120 degrees to line up with flight path)
        const rollFrac = Math.min(1.0, Math.max(0, climbTime - 0.8) / 3.5);
        this.stackGroup.rotation.y = rollFrac * (Math.PI * 0.66);

        // Track the ascending vehicle from the north-east perspective (90° right), pulling back slightly to frame the entire pad and launch stack
        const k = Math.min(1.0, climbTime / 4.5);
        let camX = 96.0 + 13.0 * k;
        let camY = 48.0 + 12.0 * k;
        let camZ = -72.0 - 10.0 * k;

        const liftoffShake = Math.max(0, 1.0 - climbTime / 3.2) * 0.35;
        camX += Math.sin(t * 41) * liftoffShake;
        camY += Math.cos(t * 57) * liftoffShake * 0.6;

        this.camera.position.set(camX, camY, camZ);

        // Camera tilts upward tracking the rocket clearing the FSS tower
        const trackY = 44.0 + altitude * 0.72;
        this.camera.lookAt(0, trackY, 0);

        const telemAlt = Math.max(0, altitude / 100);
        this._updateTelemetry(telemAlt, climbTime * 145, climbTime, "T+0s: LIFTOFF! ROCKET CLEARS THE LAUNCH TOWER");
      } else if (t < 13.0) {
        // Stage 3: T+4.5 to T+9.5s: Pitch-over heads-down climbing over Florida & Atlantic Coast
        const climbTime = t - 3.5;
        const altitude = 135.0 + (t - 8.0) * 185.0;
        const downrange = (t - 8.0) * 150.0;

        this.stackGroup.position.set(0, altitude, -downrange);
        this.stackGroup.rotation.x = -Math.min(1.1, (t - 8.0) * 0.18);

        // Smoothly transition from the north-east pad tracking camera into the upper-atmosphere chase shot
        const k = Math.min(1.0, (t - 8.0) / 4.8);
        const startX = 109.0, startY = 60.0, startZ = -82.0;
        const targetX = 55.0, targetY = altitude + 18.0, targetZ = -downrange + 55.0;

        this.camera.position.set(
          startX + (targetX - startX) * k,
          startY + (targetY - startY) * k,
          startZ + (targetZ - startZ) * k
        );
        this.camera.lookAt(this.stackGroup.position.x, this.stackGroup.position.y + 10, this.stackGroup.position.z);

        this._updateTelemetry(altitude * 0.8, 1200 + (t - 8) * 480, climbTime, "T+5s: MISSION CONTROL CONFIRMS SMOOTH CLIMB PATH");
      } else if (t < 19.0) {
        // Stage 4: T+13s: Side Rocket Booster Separation
        if (!this.srbSeparated) {
          this.srbSeparated = true;
          if (window.spaceAudio) window.spaceAudio.playStagingSeparation();
          // Fire separation motor puffs
          this.bsmPuffs.forEach(p => { p.visible = true; p.material.opacity = 0.9; });
        }

        const climbTime = t - 3.5;
        const altitude = 1200 + (t - 13.0) * 220;
        const downrange = 840 + (t - 13.0) * 260;

        this.stackGroup.position.set(0, altitude, -downrange);

        // Animate side boosters peeling outboard and tumbling away
        const sepTime = t - 13.0;
        if (this.srbLeft && this.srbRight) {
          this.srbLeft.position.x = 6.6 + Math.pow(sepTime, 1.8) * 12.0;
          this.srbLeft.position.z = -9.88 - sepTime * 20.0;
          this.srbLeft.rotation.y += delta * 1.5;
          this.srbLeft.rotation.x += delta * 1.0;

          this.srbRight.position.x = -6.6 - Math.pow(sepTime, 1.8) * 12.0;
          this.srbRight.position.z = -9.88 - sepTime * 20.0;
          this.srbRight.rotation.y -= delta * 1.5;
          this.srbRight.rotation.x += delta * 1.0;
        }

        // Camera dramatic side view of staging
        this.camera.position.set(65, altitude + 12, -downrange + 40);
        this.camera.lookAt(this.stackGroup.position.x, this.stackGroup.position.y + 10, this.stackGroup.position.z);

        this._updateTelemetry(65.4 + (t - 13) * 6, 4200 + (t - 13) * 580, climbTime, "T+13s: SIDE BOOSTERS EMPTY & SAFELY SEPARATED");
      } else if (t < 24.0) {
        // Stage 5: T+19 to T+24s: MECO & External Tank Separation
        if (!this.tankSeparated) {
          this.tankSeparated = true;
          if (window.spaceAudio) {
            window.spaceAudio.playStagingSeparation();
            window.spaceAudio.stopRocketRoar(1.2);
          }
          this.plumes.forEach(p => { p.visible = false; });
        }

        const climbTime = t - 3.5;
        const altitude = 2520 + (t - 19.0) * 80;
        const downrange = 2400 + (t - 19.0) * 220;

        this.stackGroup.position.set(0, altitude, -downrange);

        // Tank separates downwards away from orbiter
        const tankSepTime = t - 19.0;
        if (this.tankMesh) {
          this.tankMesh.position.y = -tankSepTime * 12.0;
          this.tankMesh.position.z = -tankSepTime * 8.0;
          this.tankMesh.rotation.x += delta * 0.3;
        }

        this.camera.position.set(
          this.stackGroup.position.x - 24,
          this.stackGroup.position.y + 10,
          this.stackGroup.position.z - 32
        );
        this.camera.lookAt(this.stackGroup.position.x, this.stackGroup.position.y, this.stackGroup.position.z);

        const designTelem = window.gameplay && typeof window.gameplay.evaluateMissionDesign === "function"
          ? window.gameplay.evaluateMissionDesign()
          : null;
        const targetOrbitLabel = designTelem
          ? `${designTelem.scenario.code} → ${designTelem.orbit.name.split("(")[0].trim().toUpperCase()}`
          : "ORBITAL INSERTION";
        this._updateTelemetry(385.0, 7820, climbTime, `T+19s: MAIN ENGINE SHUTDOWN — FUEL TANK DROPPED • ${targetOrbitLabel}`);
      } else if (t < this.duration) {
        // Stage 6: T+24 to T+32s: Payload Bay Doors Open & Satellite Deployment
        const climbTime = t - 3.5;
        const altitude = 2920 + (t - 24.0) * 20;
        const downrange = 3500 + (t - 24.0) * 80;

        this.stackGroup.position.set(0, altitude, -downrange);

        // Open Payload Bay Doors at T+24.5s
        if (t >= 24.5 && !this.doorsOpened) {
          this.doorsOpened = true;
          if (this.orbiterActions["PayloadDoors_Open"]) {
            this.orbiterActions["PayloadDoors_Open"].reset().play();
          }
          if (window.spaceAudio) window.spaceAudio.playAirlockCycle();
        }

        // Deploy Satellite out of SOCKET_Payload at T+27.0s
        if (t >= 27.0 && !this.satelliteDeployed) {
          this.satelliteDeployed = true;
          if (this.satelliteActions["Satellite_Deploy"]) {
            this.satelliteActions["Satellite_Deploy"].reset().play();
          }
          if (window.spaceAudio) window.spaceAudio.playSatelliteDeploy();
        }

        // Animate satellite lifting up out of payload bay
        if (this.satelliteMesh && t >= 27.0) {
          const deployTime = t - 27.0;
          this.satelliteMesh.position.y = 3.6 + Math.min(6.5, deployTime * 1.8);
          this.satelliteMesh.position.z = -1.5 + deployTime * 0.4;
        }

        // Camera smoothly swings to inspect payload bay and unfolding satellite
        this.camera.position.set(
          this.stackGroup.position.x + 14,
          this.stackGroup.position.y + 18,
          this.stackGroup.position.z + 10
        );
        this.camera.lookAt(this.stackGroup.position.x, this.stackGroup.position.y + 4, this.stackGroup.position.z);

        const designTelem = window.gameplay && typeof window.gameplay.evaluateMissionDesign === "function"
          ? window.gameplay.evaluateMissionDesign()
          : null;
        const payloadName = designTelem
          ? (designTelem.scenario && designTelem.scenario.isBioPayload
            ? `BIONUTRIENTS-2 KIT → ISS 418 KM (${designTelem.scenario.code})`
            : `${designTelem.bus.name.split("(")[0].trim().toUpperCase()} (${designTelem.scenario.code})`)
          : "DEEP SPACE COMM SATELLITE";
        const statusMsg = t < 27.0 ?
          `T+24s: ORBIT STABILIZED (${designTelem ? designTelem.orbit.id.toUpperCase() : "LEO"}) — OPENING PAYLOAD BAY DOORS [O]` :
          `T+27s: DEPLOYING ${payloadName} [P]`;
        this._updateTelemetry(408.0, 7860, climbTime, statusMsg);
      } else {
        this.finish({ naturalEnd: true, skipped: false });
      }
    }

    _updateTelemetry(altKm, velKmh, metSec, statusMsg) {
      if (this.bannerEl) this.bannerEl.textContent = statusMsg;
      if (this.telemetryEl) {
        const metAbs = Math.max(0, metSec);
        const mins = String(Math.floor(metAbs / 60)).padStart(2, "0");
        const secs = String(Math.floor(metAbs % 60)).padStart(2, "0");
        this.telemetryEl.innerHTML = `
          <div class="launch-telem-box">
            <span class="launch-telem-lbl">ALTITUDE</span>
            <span class="launch-telem-val">${altKm.toFixed(1)} KM</span>
          </div>
          <div class="launch-telem-box">
            <span class="launch-telem-lbl">VELOCITY</span>
            <span class="launch-telem-val">${Math.round(velKmh).toLocaleString()} KM/H</span>
          </div>
          <div class="launch-telem-box">
            <span class="launch-telem-lbl">MISSION CLOCK</span>
            <span class="launch-telem-val">T+${mins}:${secs}</span>
          </div>
        `;
      }
    }

    _captureGroundStage() {
      const sc = window.spaceCenter;
      if (!sc || !sc.group || !sc.isGroundMode) return;

      this.groundGroup = sc.group;
      this.spaceCenterStack = sc.stackGroup || null;
      this.groundGroup.visible = true;
      if (this.spaceCenterStack) this.spaceCenterStack.visible = false;
      if (this.earthMesh) this.earthMesh.visible = false;
      if (typeof sc._applyGroundAtmosphere === "function") sc._applyGroundAtmosphere();
      this.groundPhase = true;
      this.groundReleased = false;
      this.groundReleasedAt = 0;
    }

    _releaseGroundStage() {
      if (!this.groundPhase) return;
      this.groundPhase = false;
      this.groundReleased = true;
      this.groundReleasedAt = this.elapsed;

      if (this.groundGroup) this.groundGroup.visible = false;
      if (this.spaceCenterStack) this.spaceCenterStack.visible = true;
      if (this.earthMesh) this.earthMesh.visible = true;
      if (window.spaceCenter && typeof window.spaceCenter._restoreSpaceAtmosphere === "function") {
        window.spaceCenter._restoreSpaceAtmosphere();
      }
    }

    _cleanupGroundStage() {
      this.groundPhase = false;
      this.groundGroup = null;
      if (this.spaceCenterStack) this.spaceCenterStack.visible = true;
      this.spaceCenterStack = null;
      if (this.earthMesh) this.earthMesh.visible = true;
    }

    _updateGroundFlash() {
      if (!this.flashEl) return;
      if (this.groundPhase) {
        // Keep Pad 39A ground and Florida coastline visible throughout liftoff and tower clearance (until t >= 11.8s)
        const alpha = Math.max(0, Math.min(1, (this.elapsed - 11.8) / 0.8));
        this.flashEl.style.opacity = String(alpha);
        if (this.elapsed >= 12.6) this._releaseGroundStage();
      } else if (this.groundReleased) {
        const alpha = Math.max(0, 1 - (this.elapsed - this.groundReleasedAt) / 1.1);
        this.flashEl.style.opacity = String(alpha);
        if (alpha <= 0.01) this.groundReleased = false;
      } else {
        this.flashEl.style.opacity = "0";
      }
    }

    _createHUD() {
      const existing = document.getElementById("launch-cutscene-overlay");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      document.body.classList.add("launch-active");
      document.body.classList.remove("ground-mode-active");
      if (window.csaNasaLab && typeof window.csaNasaLab.syncGroundLockState === "function") {
        window.csaNasaLab.syncGroundLockState();
      }

      this.overlayEl = document.createElement("div");
      this.overlayEl.id = "launch-cutscene-overlay";

      this.overlayEl.innerHTML = `
        <div class="launch-header-row">
          <div class="launch-badge-card">
            <div style="font-size:10px;font-weight:700;letter-spacing:1.6px;color:#93c5fd;">LUNASPIS FLIGHT CONTROL &bull; LAUNCH PAD 39A</div>
            <div class="launch-title-main" style="font-size:14px;font-weight:700;color:#f8fafc;letter-spacing:1px;">ROCKET LIFTOFF &amp; SPACECRAFT RELEASE</div>
            <div id="launch-crew-banner" style="font-size:10px;font-weight:600;color:#cbd5e1;margin-top:4px;letter-spacing:0.6px;"></div>
          </div>

          <button id="btn-ff-launch" style="pointer-events:auto;background:rgba(103,232,249,0.14);border:1px solid rgba(103,232,249,0.5);color:#67e8f9;padding:8px 14px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:0.04em;cursor:pointer;">
            FAST FORWARD 3×
          </button>
          <button id="btn-skip-launch">
            SKIP LAUNCH [SPACE]
          </button>
        </div>

        <div id="launch-capcom-banner">
          T-3s: MAIN ENGINES STARTING UP
        </div>

        <div id="launch-telem-bar"></div>

        <div id="launch-flash"></div>
      `;

      document.body.appendChild(this.overlayEl);

      this.bannerEl = this.overlayEl.querySelector("#launch-capcom-banner");
      this.telemetryEl = this.overlayEl.querySelector("#launch-telem-bar");
      this.flashEl = this.overlayEl.querySelector("#launch-flash");
      this.crewBannerEl = this.overlayEl.querySelector("#launch-crew-banner");
      this.skipBtnEl = this.overlayEl.querySelector("#btn-skip-launch");
      if (this.skipBtnEl) this.skipBtnEl.addEventListener("click", () => this.skip());
      this.ffBtnEl = this.overlayEl.querySelector("#btn-ff-launch");
      if (this.ffBtnEl) {
        this.ffBtnEl.addEventListener("click", () => {
          this.fastForward = !this.fastForward;
          this.ffBtnEl.textContent = this.fastForward ? "NORMAL SPEED" : "FAST FORWARD 3×";
          this.ffBtnEl.style.borderColor = this.fastForward ? "rgba(250,204,21,0.75)" : "rgba(103,232,249,0.5)";
          this.ffBtnEl.style.color = this.fastForward ? "#facc15" : "#67e8f9";
        });
      }
      this.updateCrewStatus();
    }

    updateCrewStatus(missionOverride) {
      if (!this.isPlaying || !this.overlayEl) return;
      const nm = window.netManager;
      const players = nm && nm.roomState && Array.isArray(nm.roomState.players) ? nm.roomState.players : [];
      const mission = missionOverride || (nm && typeof nm.getMission === "function" ? nm.getMission() : null) || {};
      const normalize = window.InterfellasRoles
        ? window.InterfellasRoles.normalizeRole
        : ((r, f) => String(r || f || "commander").toLowerCase());
      const myRole = normalize(nm && nm.localPlayer && nm.localPlayer.role, "commander");
      const isAuthority = !!(nm && (nm.isHost || myRole === "commander"));

      if (this.crewBannerEl) {
        if (players.length > 0) {
          const summary = players.map((p) => {
            const role = normalize(p.role, "commander").slice(0, 3).toUpperCase();
            const mark = nm && p.id === nm.socketId ? " (YOU)" : "";
            return `[${role}] ${p.name || "Crew"}${mark}`;
          }).join(" · ");
          this.crewBannerEl.textContent = `CREW MANIFEST: ${summary} — ASCENT TRAJECTORY MONITORED`;
        } else {
          this.crewBannerEl.textContent = `SOLO ASCENT · COMMAND PILOT ACTIVE`;
        }
      }

      if (this.skipBtnEl) {
        const flightPlayers = players.filter((p) => (p && p.team) !== "ground");
        const count = flightPlayers.length;
        if (count <= 1 || !nm || !nm.connected) {
          this.skipBtnEl.textContent = "SKIP LAUNCH [SPACE]";
        } else if (isAuthority) {
          this.skipBtnEl.textContent = "SKIP FOR CREW [SPACE]";
        } else {
          const votes = Array.isArray(mission.skipVotes) ? mission.skipVotes : [];
          const needed = Math.max(1, Math.ceil(count / 2));
          const voted = votes.includes(nm.socketId) || this._localSkipVoted;
          this.skipBtnEl.textContent = voted
            ? `SKIP VOTED (${votes.length}/${needed})`
            : `VOTE SKIP (${votes.length}/${needed}) [SPACE]`;
        }
      }
    }

    _buildLaunchScene() {
      this.cutsceneGroup = new window.THREE.Group();
      this.cutsceneGroup.name = "LaunchCutsceneGroup";
      this.scene.add(this.cutsceneGroup);

      this.stackGroup = new window.THREE.Group();
      this.cutsceneGroup.add(this.stackGroup);

      this.stackCore = new window.THREE.Group();
      this.stackCore.name = "ShuttleStack_Core";
      this.stackGroup.add(this.stackCore);

      // 1. External Tank (Center reference: origin at center, nose +Z, tail -Z)
      try {
        if (window.glbManager && (window.glbManager.cache["assets/ExternalTank.glb"] || window.glbManager.cache["external_tank"])) {
          this.tankMesh = window.glbManager.instantiateModel("external_tank", { scale: 1.0 });
        }
      } catch (e) {}

      if (!this.tankMesh) {
        const tankGeo = new window.THREE.CylinderGeometry(4.2, 4.2, 47.0, 32);
        tankGeo.rotateX(Math.PI / 2);
        const tankMat = new window.THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.6, metalness: 0.1 });
        this.tankMesh = new window.THREE.Mesh(tankGeo, tankMat);

        if (window.glbManager) {
          window.glbManager.loadGLB("assets/ExternalTank.glb").then(() => {
            try {
              const realTank = window.glbManager.instantiateModel("external_tank", { scale: 1.0 });
              if (realTank && this.stackCore && this.tankMesh) {
                this.stackCore.remove(this.tankMesh);
                this.tankMesh = realTank;
                this.tankMesh.position.set(0, 0, 0);
                this.stackCore.add(this.tankMesh);
              }
            } catch (e) {}
          }).catch(() => {});
        }
      }
      this.tankMesh.position.set(0, 0, 0);
      this.stackCore.add(this.tankMesh);

      // 2. Orbiter V2 (Attached to SOCKET_Orbiter at [0, 5.25, -12.4])
      try {
        if (window.glbManager && (window.glbManager.cache["assets/Orbiter_V2.glb"] || window.glbManager.cache["orbiter_v2"])) {
          this.orbiterMesh = window.glbManager.instantiateModel("orbiter_v2", { scale: 1.0 });
          const raw = window.glbManager.cache["assets/Orbiter_V2.glb"] || window.glbManager.cache["orbiter_v2"];
          if (raw && raw.gltf && raw.gltf.animations) {
            this.orbiterMixer = new window.THREE.AnimationMixer(this.orbiterMesh);
            raw.gltf.animations.forEach(clip => {
              const act = this.orbiterMixer.clipAction(clip);
              if (clip.name.includes("Doors") || clip.name.includes("Gear")) {
                act.setLoop(window.THREE.LoopOnce);
                act.clampWhenFinished = true;
              }
              this.orbiterActions[clip.name] = act;
            });
          }
        }
      } catch (e) {}

      if (!this.orbiterMesh) {
        const orbGeo = new window.THREE.ConeGeometry(3.5, 36.0, 16);
        orbGeo.rotateX(Math.PI / 2);
        const orbMat = new window.THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
        this.orbiterMesh = new window.THREE.Mesh(orbGeo, orbMat);

        if (window.glbManager) {
          window.glbManager.loadGLB("assets/Orbiter_V2.glb").then((entry) => {
            try {
              const realOrb = window.glbManager.instantiateModel("orbiter_v2", { scale: 1.0 });
              if (realOrb && this.stackCore && this.orbiterMesh) {
                this.stackCore.remove(this.orbiterMesh);
                this.orbiterMesh = realOrb;
                this.orbiterMesh.position.set(0, 5.25, -12.4);
                this.stackCore.add(this.orbiterMesh);

                if (entry.gltf && entry.gltf.animations) {
                  this.orbiterMixer = new window.THREE.AnimationMixer(this.orbiterMesh);
                  entry.gltf.animations.forEach(clip => {
                    const act = this.orbiterMixer.clipAction(clip);
                    if (clip.name.includes("Doors") || clip.name.includes("Gear")) {
                      act.setLoop(window.THREE.LoopOnce);
                      act.clampWhenFinished = true;
                    }
                    this.orbiterActions[clip.name] = act;
                  });
                }
              }
            } catch (e) {}
          }).catch(() => {});
        }
      }
      this.orbiterMesh.position.set(0, 5.25, -12.4);
      this.stackCore.add(this.orbiterMesh);

      // 3. Deployable Payload inside SOCKET_Payload ([0, 3.6, -1.5])
      // Uses the crew's selected spacecraft bus GLB if configured, else default Satellite.glb
      if (window.glbManager) {
        const designTelem = window.gameplay && typeof window.gameplay.evaluateMissionDesign === "function"
          ? window.gameplay.evaluateMissionDesign()
          : null;
        const selectedBusId = (designTelem && designTelem.bus && designTelem.bus.glbId) || window.glbManager.selectedStationModelId;
        const hasCatalogBus = selectedBusId && window.glbManager.catalog && window.glbManager.catalog[selectedBusId];
        const targetModelKey = hasCatalogBus ? window.glbManager.catalog[selectedBusId].file : "assets/Satellite.glb";
        const targetScale = hasCatalogBus ? 1.85 : 0.95;

        window.glbManager.loadGLB(targetModelKey).then((entry) => {
          try {
            const sat = window.glbManager.instantiateModel(targetModelKey, { scale: targetScale });
            sat.position.set(0, 3.6, -1.5);
            this.orbiterMesh.add(sat);
            this.satelliteMesh = sat;

            if (entry && entry.gltf && entry.gltf.animations && entry.gltf.animations.length > 0) {
              this.satelliteMixer = new window.THREE.AnimationMixer(sat);
              entry.gltf.animations.forEach(clip => {
                const act = this.satelliteMixer.clipAction(clip);
                act.setLoop(window.THREE.LoopOnce);
                act.clampWhenFinished = true;
                this.satelliteActions[clip.name] = act;
              });
            }
          } catch (e) {}
        }).catch(() => {});
      }

      // 4. Solid Rocket Boosters (SOCKET_SRB_L at [6.6, 0, -9.88] & SOCKET_SRB_R at [-6.6, 0, -9.88])
      try {
        if (window.glbManager && (window.glbManager.cache["assets/SolidRocketBooster.glb"] || window.glbManager.cache["solid_rocket_booster"])) {
          this.srbLeft = window.glbManager.instantiateModel("solid_rocket_booster", { scale: 1.0 });
          this.srbRight = window.glbManager.instantiateModel("solid_rocket_booster", { scale: 1.0 });
        }
      } catch (e) {}

      if (!this.srbLeft || !this.srbRight) {
        const srbGeo = new window.THREE.CylinderGeometry(1.8, 1.8, 45.0, 24);
        srbGeo.rotateX(Math.PI / 2);
        const srbMat = new window.THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
        this.srbLeft = new window.THREE.Mesh(srbGeo, srbMat);
        this.srbRight = new window.THREE.Mesh(srbGeo, srbMat);

        if (window.glbManager) {
          window.glbManager.loadGLB("assets/SolidRocketBooster.glb").then(() => {
            try {
              const realSrbL = window.glbManager.instantiateModel("solid_rocket_booster", { scale: 1.0 });
              const realSrbR = window.glbManager.instantiateModel("solid_rocket_booster", { scale: 1.0 });
              if (realSrbL && realSrbR && this.stackCore && this.srbLeft && this.srbRight) {
                this.stackCore.remove(this.srbLeft);
                this.stackCore.remove(this.srbRight);
                this.srbLeft = realSrbL;
                this.srbRight = realSrbR;
                this.srbLeft.position.set(6.6, 0, -9.88);
                this.srbRight.position.set(-6.6, 0, -9.88);
                this.srbRight.rotation.set(0, 0, Math.PI);
                this.stackCore.add(this.srbLeft, this.srbRight);
              }
            } catch (e) {}
          }).catch(() => {});
        }
      }
      this.srbLeft.position.set(6.6, 0, -9.88);
      this.srbRight.position.set(-6.6, 0, -9.88);
      this.srbRight.rotation.set(0, 0, Math.PI);

      this.stackCore.add(this.srbLeft);
      this.stackCore.add(this.srbRight);

      // 5. Procedural Exhaust Plumes & Flame Cones
      const flameMat = new window.THREE.MeshBasicMaterial({ color: 0xffedd5, transparent: true, opacity: 0.85 });
      const plumeGeo = new window.THREE.CylinderGeometry(0.8, 3.2, 18.0, 16);
      plumeGeo.rotateX(Math.PI / 2);

      // SRB Plumes (nozzles at z = -32.2)
      [6.6, -6.6].forEach(x => {
        const plume = new window.THREE.Mesh(plumeGeo, flameMat);
        plume.position.set(x, 0, -41.2);
        plume.offset = Math.random() * 10;
        this.stackCore.add(plume);
        this.plumes.push(plume);
      });

      // Orbiter SSME Main Engine Plumes (3 engines around z = -31.0)
      [[0, 7.5, -40.0], [-1.4, 6.2, -40.0], [1.4, 6.2, -40.0]].forEach(([px, py, pz]) => {
        const ssmePlume = new window.THREE.Mesh(
          new window.THREE.CylinderGeometry(0.5, 2.2, 14.0, 12).rotateX(Math.PI / 2),
          new window.THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.8 })
        );
        ssmePlume.position.set(px, py, pz);
        ssmePlume.offset = Math.random() * 10;
        this.stackCore.add(ssmePlume);
        this.plumes.push(ssmePlume);
      });

      // 6. Booster Separation Motor (BSM) Puffs at FX_SRB_BSM_Fwd & FX_SRB_BSM_Aft
      const bsmMat = new window.THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.0 });
      const bsmGeo = new window.THREE.SphereGeometry(2.5, 12, 12);
      [
        [8.5, 0, 10.0], [-8.5, 0, 10.0],
        [9.2, 0, -30.0], [-9.2, 0, -30.0]
      ].forEach(([bx, by, bz]) => {
        const puff = new window.THREE.Mesh(bsmGeo, bsmMat.clone());
        puff.position.set(bx, by, bz);
        puff.visible = false;
        this.stackCore.add(puff);
        this.bsmPuffs.push(puff);
      });

      // Rotate entire Stack Core by -90° around X so +Z (nose) points up (+Y)!
      this.stackCore.rotation.x = -Math.PI / 2;
      this.stackCore.position.set(0, 44.0, 0);

      // 7. Giant 3D Earth Globe Below Stack
      try {
        if (window.glbManager && (window.glbManager.cache["assets/earth.glb"] || window.glbManager.cache["earth"])) {
          this.earthMesh = window.glbManager.instantiateModel("earth", { scale: 450.0 });
        }
      } catch (e) {}

      if (!this.earthMesh) {
        const earthGeo = new window.THREE.SphereGeometry(600, 48, 48);
        const earthMat = new window.THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.6 });
        this.earthMesh = new window.THREE.Mesh(earthGeo, earthMat);
      }
      this.earthMesh.position.set(0, -680, 0);
      this.cutsceneGroup.add(this.earthMesh);
    }
  }

  window.LaunchCutsceneManager = LaunchCutsceneManager;
  window.launchCutscene = new LaunchCutsceneManager();
})(window);
