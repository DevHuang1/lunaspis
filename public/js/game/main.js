/**
 * ============================================================================
 * INTERFELLAS 3D MULTIPLAYER ENGINE & THREE.JS SCENE PIPELINE (SPACESHIP EDITION)
 * ============================================================================
 * Integrates all 3D ship designs, interiors, models, shaders, and interactive
 * systems from SpaceShip (Lunaspis — Orbital / Mission Lab) in vanilla Three.js:
 * - 6-Room Lunaspis Orbital Transit Craft Interior + Exterior Hull & Solar Arrays
 * - Draco, KTX2/Basis Universal, and Meshopt GLTF 2.0 3D asset pipeline
 * - SpaceShip NASA Astronaut rigs (astronaut_lod0.glb & astronaut_lod1.glb)
 * - 27-Part Interactive NASA ISS Reference Showcase [J]
 * - 3D Lunar Touchdown Scene (MoonLandingScene) [K]
 * - 6 Console Mini-Games with live 4-resource telemetry & FaultBeacons
 * - Full Mobile Compatibility: Dynamic Viewport Width/Height (visualViewport +
 *   portrait/landscape FOV scaling), Multi-Touch Analog Thumbstick + Right-Thumb
 *   Camera Look + Pinch-to-Zoom, and Adaptive Mobile GPU Performance Scaling
 */

(function () {
  "use strict";

  let scene, camera, renderer, clock;
  let cinematicPass = null;
  let isGameStarted = false;
  window.isGameStarted = false;

  // Touch / Mobile Hardware Detection (never misclassifies narrow desktop windows as touch devices)
  function detectMobileDevice() {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse), (hover: none)").matches;
    const ua = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || "");
    const touchCapable = ("ontouchstart" in window) && ((navigator.maxTouchPoints || 0) > 0) && (window.innerWidth <= 1100);
    return Boolean(coarse || ua || touchCapable);
  }
  const isMobile = detectMobileDevice();
  window.isMobileDevice = isMobile;
  let userToggledChecklist = false;
  let userToggledTelemetry = false;
  let lobbyMissionsExpanded = false;
  let lastLobbyMission = null;

  // Dynamic Viewport Width & Height Synchronization (fixes iOS Safari / Chrome Android address bar clipping)
  function getViewportSize() {
    const vv = window.visualViewport;
    const w = Math.max(280, Math.round(vv ? vv.width : window.innerWidth || document.documentElement.clientWidth || 360));
    const h = Math.max(240, Math.round(vv ? vv.height : window.innerHeight || document.documentElement.clientHeight || 640));
    return { w, h };
  }

  function syncViewportCSSVars() {
    const { w, h } = getViewportSize();
    const root = document.documentElement;
    if (root && root.style) {
      root.style.setProperty("--app-width", `${w}px`);
      root.style.setProperty("--app-height", `${h}px`);
    }
    return { w, h };
  }

  // Station and Exterior objects
  let issGroup, earthSphere, cloudSphere, photorealisticEarth = null, sarjGroups = [], canArmPivot = null;
  let spaceStars, sunLight;
  let interiorPointLights = [], ambLightRef = null;

  // Performance & Telemetry Tracking + Adaptive Dynamic Resolution Scaling (DRS)
  let lastFrameRenderTimestamp = performance.now();
  let minFps = 60, maxFps = 60, frameTimeMs = 16.6;
  let fpsHistory = [];
  let dynamicResolutionMultiplier = 1.0;
  let lastDrsAdjustTime = 0;
  let toggleSystemsSettingsModal = null, toggleDiagnosticsOverlay = null;

  const defaultPerfSettings = {
    renderScale: isMobile ? 95 : 100,
    cinematicPreset: isMobile ? "off" : "balanced",
    fpsCap: 60,
    lightingQuality: isMobile ? "low" : "high",
    fov: 62,
    tickRate: isMobile ? 15 : 20,
    interpBuffer: "balanced",
    deltaCulling: true,
    showPerfPill: true,
    showDiagOverlay: false,
    visorOpacity: 100,
    showCrosshair: true
  };

  let perfSettings = Object.assign({}, defaultPerfSettings);

  function loadPerfSettings() {
    try {
      const raw = localStorage.getItem("interfellas_perf_settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migrate older tick-rate presets (25/33 Hz) to the new lower-latency set.
        if (parsed.tickRate === 25) parsed.tickRate = 20;
        if (parsed.tickRate > 30) parsed.tickRate = 30;
        perfSettings = Object.assign({}, defaultPerfSettings, parsed);
      }
    } catch (e) {
      console.warn("Failed to load perf settings:", e);
    }
  }

  function savePerfSettings() {
    try {
      localStorage.setItem("interfellas_perf_settings", JSON.stringify(perfSettings));
    } catch (e) {
      console.warn("Failed to save perf settings:", e);
    }
  }

  function computeEffectiveFov(baseFov, aspect) {
    const base = Number(baseFov) || 62;
    // Widen vertical FOV automatically on portrait mobile screens so horizontal view inside corridors stays comfortable
    if (aspect < 1.0) {
      const portraitBoost = Math.min(22, (1.0 - aspect) * 34);
      return Math.min(86, Math.round(base + portraitBoost));
    }
    return base;
  }

  // Render resolution is expressed relative to CSS pixels so the setting has
  // the same meaning with or without post-processing. 100% = 1 CSS pixel per
  // screen pixel; 50% halves each axis; 150% supersamples. Dynamic resolution
  // scaling can temporarily reduce this further when the GPU cannot keep up.
  const MIN_RENDER_SCALE = 0.5;
  const MAX_RENDER_SCALE = 1.5;

  function getEffectiveRenderScale() {
    const userScale = Math.max(
      MIN_RENDER_SCALE,
      Math.min(MAX_RENDER_SCALE, (Number(perfSettings.renderScale) || 100) / 100)
    );
    // Mobile GPUs hit thermal/fill-rate limits sooner, so allow DRS to fall a
    // little further before the frame rate becomes visibly unstable.
    const drsFloor = isMobile ? 0.7 : 0.7;
    const drs = Math.max(drsFloor, Math.min(1.0, Number(dynamicResolutionMultiplier) || 1.0));
    return Math.max(isMobile ? 0.3 : 0.35, Math.min(MAX_RENDER_SCALE, userScale * drs));
  }

  function applyRenderResolution(w, h) {
    const scale = getEffectiveRenderScale();

    if (renderer) {
      // The canvas backing store must use the same scale as the scene render
      // target, otherwise the post-processing pass renders at one resolution
      // and upscales to another (which made the slider feel ineffective).
      renderer.setPixelRatio(scale);
      renderer.setSize(w, h, false);
    }
    if (cinematicPass) {
      if (typeof cinematicPass.setSize === "function") cinematicPass.setSize(w, h);
      if (typeof cinematicPass.setRenderScale === "function") cinematicPass.setRenderScale(scale);
    }

    return scale;
  }

  function applyPerfSettings() {
    const { w, h } = syncViewportCSSVars();

    // 1. Render Resolution Scale & Post-Processing Target Resolution
    applyRenderResolution(w, h);
    if (renderer) {
      renderer.shadowMap.enabled = !isMobile && perfSettings.lightingQuality === "high";
    }

    // 2. Cinematic Shaders / Post-Processing
    if (cinematicPass && typeof cinematicPass.setPreset === "function") {
      cinematicPass.setPreset(perfSettings.cinematicPreset);
    }

    // 3. Lighting & Dynamic Point Lights
    if (ambLightRef) {
      ambLightRef.intensity = perfSettings.lightingQuality === "low" ? 0.65 : 0.38;
    }
    if (Array.isArray(window.interiorPointLights)) {
      interiorPointLights = window.interiorPointLights;
    }
    if (Array.isArray(interiorPointLights)) {
      interiorPointLights.forEach((pl, idx) => {
        if (!pl.userData.originalIntensity) pl.userData.originalIntensity = pl.intensity;
        if (perfSettings.lightingQuality === "low") {
          pl.visible = (idx % 2 === 0);
          pl.intensity = isMobile ? 1.35 : 0.8;
        } else {
          pl.visible = true;
          pl.intensity = pl.userData.originalIntensity || 1.3;
        }
      });
    }

    // 4. Field of View (Portrait/Landscape Aspect-Aware)
    if (camera) {
      camera.aspect = w / h;
      camera.fov = computeEffectiveFov(perfSettings.fov, camera.aspect);
      camera.updateProjectionMatrix();
    }

    // 5. Network Subsystem
    if (window.netManager) {
      if (typeof window.netManager.setTickRate === "function") {
        window.netManager.setTickRate(perfSettings.tickRate);
      }
      if (typeof window.netManager.setInterpBuffer === "function") {
        window.netManager.setInterpBuffer(perfSettings.interpBuffer);
      }
      if (typeof window.netManager.setDeltaCulling === "function") {
        window.netManager.setDeltaCulling(perfSettings.deltaCulling);
      }
    }

    // 6. UI HUD Visibility
    const perfOverlay = document.getElementById("perf-overlay");
    if (perfOverlay) {
      perfOverlay.style.display = perfSettings.showPerfPill ? "flex" : "none";
    }

    const diagDeck = document.getElementById("hud-diagnostics-overlay");
    if (diagDeck) {
      diagDeck.style.display = perfSettings.showDiagOverlay ? "block" : "none";
    }

    const visorEl = document.getElementById("helmet-visor-overlay");
    if (visorEl) {
      visorEl.style.opacity = ((perfSettings.visorOpacity !== undefined ? perfSettings.visorOpacity : 100) / 100).toString();
    }

    const crosshairEl = document.getElementById("hud-crosshair") || document.getElementById("crosshair");
    if (crosshairEl) {
      crosshairEl.style.display = perfSettings.showCrosshair ? "block" : "none";
    }
  }

  // Local Crew Avatar
  let localCrew = {
    group: null,
    headGroup: null,
    helmetMeshGroup: null,
    torsoGroup: null,
    spotLight: null,
    leftArm: null,
    rightArm: null,
    leftLeg: null,
    rightLeg: null,
    nameBadge: null,
    role: "commander",
    color: "#c9f04b",
    isEva: false,
    isZeroG: false,
    suitLights: true,
    magBoots: true,
    walkCycle: 0
  };

  // The ISS interior is a zero-g environment: the crew hover clear of the
  // deck and carry a little momentum instead of walking. The bob is applied to
  // the model, not the root, so network updates stay quiet while idle.
  const ZERO_G_HOVER_Y = 0.32;
  const zeroGVelocity = { x: 0, z: 0 };

  // Locomotion footstep SFX tracking
  let localFootstepTimer = 0;
  let localFootstepSide = false;
  let localFootstepMoving = false;

  function getLocomotionSurface(pos) {
    if (window.spaceCenter && window.spaceCenter.isGroundMode) {
      if (!pos) return "ground";
      // Elevated on launch tower / gantry / mobile launcher deck / boarding bridge
      if (pos.y > 11.5) {
        return "metal";
      }
      // Inside Launch Control Center (LCC)
      if (Math.hypot(pos.x - (-203), pos.z - 185) < 38) {
        return "indoor";
      }
      // Outer terrain / gravel off-pad
      const distFromPad = Math.hypot(pos.x, pos.z);
      if (distFromPad > 120 && Math.hypot(pos.x - (-203), pos.z - 185) > 50) {
        return "gravel";
      }
      return "ground";
    }
    return "metal";
  }

  function isISSInteriorViewActive() {
    const interior = window.shipInterior;
    return !!(
      interior &&
      interior.isInteriorActive &&
      interior.issInteriorModel &&
      interior.group &&
      interior.group.visible &&
      !interior.isMoonLandingActive &&
      !(window.spaceCenter && window.spaceCenter.isGroundMode)
    );
  }

  function setLocalMeshVisibility(visible) {
    if (localCrew.helmetMeshGroup) localCrew.helmetMeshGroup.visible = visible;
    if (localCrew.torsoGroup) localCrew.torsoGroup.visible = visible;
    if (localCrew.leftArm) localCrew.leftArm.visible = visible;
    if (localCrew.rightArm) localCrew.rightArm.visible = visible;
    if (localCrew.leftLeg) localCrew.leftLeg.visible = visible;
    if (localCrew.rightLeg) localCrew.rightLeg.visible = visible;
    if (localCrew.rig && localCrew.rig.modelContainer) {
      localCrew.rig.modelContainer.visible = visible;
    }
    const poseStillFloating = localCrew.rig && localCrew.rig.zeroGBlend > 0.05;
    const grounded = visible && !localCrew.isZeroG && !poseStillFloating;
    if (localCrew.rig && localCrew.rig.shadowMesh) {
      localCrew.rig.shadowMesh.visible = grounded;
    }
    if (localCrew.rig && localCrew.rig.accentRing) {
      localCrew.rig.accentRing.visible = grounded;
    }
    if (localCrew.rig && localCrew.rig.emoteBubble) {
      localCrew.rig.emoteBubbleHidden = !visible;
      localCrew.rig.emoteBubble.sprite.visible = visible && Boolean(localCrew.rig.emote);
    }
    if (localCrew.nameBadge) localCrew.nameBadge.visible = false;
  }

  // Remote crew avatars container (socketId -> 3D Object)
  const remoteCrewMeshes = {};
  // Visual-only open cars for crewmates who are driving (socketId -> 3D Object)
  const remoteCarMeshes = {};
  const remoteSeatPosition = new THREE.Vector3();
  const remoteSeatQuaternion = new THREE.Quaternion();

  /**
   * Builds (or reuses) the visual car for a remote driver. The local open car
   * owns physics, input and HUD; remote cars only follow interpolated network
   * snapshots, so every client can see another player's car on the ground.
   */
  function ensureRemoteCarVisual(id, rp) {
    if (remoteCarMeshes[id]) return remoteCarMeshes[id];
    if (!rp || !rp.driving) return null;
    const sourceCar = window.spaceCenterCar;
    if (!sourceCar || typeof sourceCar.createRemoteVisual !== "function" || !sourceCar.group) return null;
    const visual = sourceCar.createRemoteVisual();
    if (!visual) return null;
    remoteCarMeshes[id] = visual;
    scene.add(visual);
    return visual;
  }

  // Camera & Controls state
  let cameraMode = 1;
  let thirdPersonDist = 2.9;
  let camPitch = -0.18;
  let camYaw = Math.PI; // Facing -Z toward HoloTable & Command Deck

  // Analog Virtual Joystick state (-1..1)
  window.virtualJoyX = 0;
  window.virtualJoyY = 0;
  window.virtualJoyActive = false;

  const CAMERA_MODES = [
    { id: 0, name: "1ST PERSON", icon: "1P" },
    { id: 1, name: "3RD PERSON", icon: "CAM" }
  ];

  function cycleCameraMode() {
    cameraMode = (cameraMode + 1) % CAMERA_MODES.length;
    updateCameraModeUI();
    if (window.spaceAudio) window.spaceAudio.playClick();
  }

  function setCameraMode(mode) {
    cameraMode = mode % CAMERA_MODES.length;
    updateCameraModeUI();
  }

  function updateCameraModeUI() {
    const cur = CAMERA_MODES[cameraMode];
    const btnLabel = document.getElementById("cam-mode-label");
    const btnIcon = document.getElementById("cam-mode-icon");
    if (btnLabel) btnLabel.textContent = cur.name;
    if (btnIcon) btnIcon.textContent = cur.icon;

    const visorOverlay = document.getElementById("helmet-visor-overlay");
    if (visorOverlay) {
      visorOverlay.style.display = (cameraMode === 0) ? "block" : "none";
    }
  }

  // Key tracking
  const keys = {};

  // Crew emote wheel state
  let emoteWheelOpen = false;
  let emoteToastTimer = null;
  let quickDeckOpen = false;
  let quickDeckTab = "crew";

  function setEmoteWheelOpen(open) {
    const wheel = document.getElementById("emote-wheel");
    const btn = document.getElementById("btn-emote-menu");
    emoteWheelOpen = Boolean(open);
    if (wheel) {
      wheel.classList.toggle("open", emoteWheelOpen);
      wheel.setAttribute("aria-hidden", emoteWheelOpen ? "false" : "true");
    }
    if (btn) btn.classList.toggle("active", emoteWheelOpen);
  }

  function deckDefaultDetail(tab = quickDeckTab) {
    return tab === "systems"
      ? "Ship systems, mission views, and display modes."
      : "Crew expressions, ready for the whole expedition.";
  }

  function setDeckDetail(text) {
    const detail = document.getElementById("deck-detail-text");
    if (detail) detail.textContent = text || deckDefaultDetail();
  }

  function setQuickDeckTab(tab) {
    quickDeckTab = tab === "systems" ? "systems" : "crew";
    const crewTab = document.getElementById("tab-deck-crew");
    const systemsTab = document.getElementById("tab-deck-systems");
    const deckTabs = document.querySelector("#quick-deck .deck-tabs");
    const crewPanel = document.getElementById("deck-crew-panel");
    const systemsPanel = document.getElementById("deck-systems-panel");
    const isCrew = quickDeckTab === "crew";
    if (crewTab) {
      crewTab.classList.toggle("active", isCrew);
      crewTab.setAttribute("aria-selected", String(isCrew));
    }
    if (systemsTab) {
      systemsTab.classList.toggle("active", !isCrew);
      systemsTab.setAttribute("aria-selected", String(!isCrew));
    }
    if (deckTabs) deckTabs.setAttribute("data-tab", quickDeckTab);
    if (crewPanel) crewPanel.hidden = !isCrew;
    if (systemsPanel) systemsPanel.hidden = isCrew;
    setDeckDetail(deckDefaultDetail(quickDeckTab));
  }

  function setQuickDeckOpen(open, tab) {
    const deck = document.getElementById("quick-deck");
    const btn = document.getElementById("btn-quick-deck");
    quickDeckOpen = Boolean(open);
    if (tab) setQuickDeckTab(tab);
    if (deck) {
      deck.classList.toggle("open", quickDeckOpen);
      deck.setAttribute("aria-hidden", quickDeckOpen ? "false" : "true");
    }
    if (btn) {
      btn.classList.toggle("active", quickDeckOpen);
      btn.setAttribute("aria-expanded", String(quickDeckOpen));
    }
    document.body.classList.toggle("deck-open", quickDeckOpen);
    if (quickDeckOpen) {
      Object.keys(keys).forEach((key) => { keys[key] = false; });
      const activePanel = document.getElementById(quickDeckTab === "crew" ? "deck-crew-panel" : "deck-systems-panel");
      const first = activePanel ? activePanel.querySelector(".deck-row") : null;
      if (first && typeof first.focus === "function") first.focus({ preventScroll: true });
    }
  }

  function isFullscreenViewActive() {
    return Boolean(
      (window.solarSystem && window.solarSystem.isActive) ||
      (window.missionViz && window.missionViz.isActive) ||
      (window.issShowcase && window.issShowcase.isActive) ||
      (window.vrManager && window.vrManager.isAnyVRActive) ||
      (window.dockingSim && window.dockingSim.isActive) ||
      (window.launchCutscene && window.launchCutscene.isPlaying) ||
      (window.glbManager && window.glbManager.hangarActive)
    );
  }

  function showEmoteToast(def) {
    const toast = document.getElementById("emote-toast");
    if (!toast || !def) return;
    toast.textContent = `${def.icon} ${String(def.label || "").toUpperCase()}`;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    clearTimeout(emoteToastTimer);
    emoteToastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
  }

  function playLocalEmote(emoteId) {
    if (!isGameStarted) return;
    const defs = window.ASTRONAUT_EMOTES || [];
    const def = defs.find((item) => item.id === emoteId);
    if (!def) return;

    if (localCrew.rig && typeof localCrew.rig.playEmote === "function") {
      localCrew.rig.playEmote(emoteId);
    }
    if (window.netManager && typeof window.netManager.sendEmote === "function") {
      window.netManager.sendEmote(emoteId);
    }
    showEmoteToast(def);
    if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
      window.spaceAudio.playClick();
    }
  }
  window.playLocalEmote = playLocalEmote;

  function syncTelemetryToggleUI() {
    const btn = document.getElementById("btn-telemetry-toggle");
    const chevron = document.getElementById("telemetry-toggle-chevron");
    const collapsed = document.body.classList.contains("telemetry-collapsed");
    if (btn) {
      btn.classList.toggle("is-open", !collapsed);
      btn.setAttribute("aria-expanded", String(!collapsed));
    }
    if (chevron) {
      chevron.innerHTML = collapsed ? "&#9656;" : "&#9662;";
    }
  }

  function syncResponsiveHudState(width, height) {
    const size = (typeof width === "number" && typeof height === "number")
      ? { w: width, h: height }
      : getViewportSize();
    const isNarrow = size.w <= 900;
    const isCompact = size.w <= 1024 || size.h <= 700 || isMobile;

    if (isMobile) {
      document.body.classList.add("touch-ui");
    }

    const checklistTitle = document.getElementById("hud-checklist-title");
    if (checklistTitle) {
      checklistTitle.textContent = "MISSION HUB";
    }

    const settingsBtn = document.getElementById("btn-voice-settings");
    if (settingsBtn) {
      settingsBtn.innerHTML = (isNarrow || isMobile) ? "<span>&#9881;</span><span>SET</span>" : "<span>&#9881;</span>";
    }

    if (!userToggledChecklist) {
      const checklistPanel = document.getElementById("hud-checklist-panel");
      if (checklistPanel) {
        checklistPanel.classList.toggle("collapsed", isCompact);
      }
    }

    if (!userToggledTelemetry) {
      document.body.classList.toggle("telemetry-collapsed", isCompact);
    }
    syncTelemetryToggleUI();
  }

  function setupMobileUX() {
    const checklistToggle = document.getElementById("hud-checklist-toggle");
    if (checklistToggle && !checklistToggle._hudTracked) {
      checklistToggle._hudTracked = true;
      checklistToggle.addEventListener("click", () => {
        userToggledChecklist = true;
      }, true);
    }

    const telemToggle = document.getElementById("btn-telemetry-toggle");
    if (telemToggle && !telemToggle._hudTracked) {
      telemToggle._hudTracked = true;
      telemToggle.addEventListener("click", () => {
        userToggledTelemetry = true;
        document.body.classList.toggle("telemetry-collapsed");
        syncTelemetryToggleUI();
      });
    }

    window.addEventListener("touchstart", () => {
      if (!document.body.classList.contains("touch-ui")) {
        document.body.classList.add("touch-ui");
      }
    }, { once: true, passive: true });

    syncResponsiveHudState();

    if (!isMobile) return;
    document.body.classList.add("mobile-ui");
    document.body.classList.add("touch-ui");

    const lobbyHint = document.querySelector(".lobby-controls-hint");
    if (lobbyHint) {
      lobbyHint.innerHTML = "<strong>Thumbstick</strong> Run &bull; <strong>Push Far</strong> Sprint &bull; <strong>Drag</strong> Look &bull; <strong>Tap</strong> Console &bull; <strong>EMOTE</strong> &bull; <strong>CAM</strong>";
    }

    const voiceKeyHint = document.querySelector(".voice-key-hint");
    if (voiceKeyHint) {
      voiceKeyHint.textContent = "Tap the action buttons above";
    }
  }

  function setupEmoteWheel() {
    const wheel = document.getElementById("emote-wheel");
    const btn = document.getElementById("btn-emote-menu");
    const grid = document.getElementById("emote-grid");
    if (!wheel || !btn || !grid) return;

    const defs = window.ASTRONAUT_EMOTES || [];
    grid.innerHTML = defs.map((def, index) => `
      <button type="button" class="emote-btn" data-emote="${def.id}">
        <span class="emote-hotkey">${index === 9 ? 0 : index + 1}</span>
        <span class="emote-icon">${def.icon}</span>
        <span class="emote-label">${def.label}</span>
      </button>
    `).join("");

    btn.addEventListener("click", () => {
      setEmoteWheelOpen(!emoteWheelOpen);
      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
    });

    grid.addEventListener("click", (event) => {
      const target = event.target.closest("[data-emote]");
      if (!target) return;
      playLocalEmote(target.getAttribute("data-emote"));
      setEmoteWheelOpen(false);
    });

    document.addEventListener("pointerdown", (event) => {
      if (!emoteWheelOpen) return;
      if (wheel.contains(event.target) || btn.contains(event.target)) return;
      setEmoteWheelOpen(false);
    });
  }

  function setupTitleChrome() {
    const boot = document.getElementById("boot-overlay");
    if (boot) {
      let bootSeen = false;
      try { bootSeen = sessionStorage.getItem("lunaspis_boot_seen") === "1"; } catch (_) { bootSeen = false; }
      if (bootSeen) {
        boot.remove();
      } else {
        let finished = false;
        const finishBoot = () => {
          if (finished) return;
          finished = true;
          boot.classList.add("is-done");
          try { sessionStorage.setItem("lunaspis_boot_seen", "1"); } catch (_) { /* noop */ }
          setTimeout(() => boot.remove(), 520);
        };
        const delay = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 550 : 2100;
        setTimeout(finishBoot, delay);
        boot.addEventListener("pointerdown", finishBoot, { once: true });
        window.addEventListener("keydown", finishBoot, { once: true });
      }
    }
    const dossierBtn = document.getElementById("btn-title-dossier");
    if (dossierBtn) {
      dossierBtn.addEventListener("click", () => {
        const authBtn = document.getElementById("btn-open-auth");
        if (authBtn) authBtn.click();
      });
    }
    const settingsBtn = document.getElementById("btn-title-settings");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        const source = document.getElementById("btn-voice-settings");
        if (source) source.click();
      });
    }

    const navToggle = document.getElementById("btn-title-nav-toggle");
    const titleNav = document.getElementById("title-primary-nav");
    const navScrim = document.getElementById("title-nav-scrim");
    if (navToggle && titleNav) {
      const setNavOpen = (open) => {
        titleNav.classList.toggle("is-open", open);
        if (navScrim) navScrim.classList.toggle("is-open", open);
        document.body.classList.toggle("title-nav-open", open);
        navToggle.setAttribute("aria-expanded", String(open));
        navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      };
      navToggle.addEventListener("click", () => {
        setNavOpen(!titleNav.classList.contains("is-open"));
      });
      if (navScrim) navScrim.addEventListener("click", () => setNavOpen(false));
      titleNav.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => setNavOpen(false));
      });
      document.addEventListener("pointerdown", (event) => {
        if (!titleNav.classList.contains("is-open")) return;
        if (titleNav.contains(event.target) || navToggle.contains(event.target)) return;
        setNavOpen(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && titleNav.classList.contains("is-open")) {
          setNavOpen(false);
        }
      });
      window.matchMedia("(min-width: 981px)").addEventListener?.("change", (event) => {
        if (event.matches) setNavOpen(false);
      });
    }
  }

  function setupPerfIdleState() {
    const overlay = document.getElementById("perf-overlay");
    if (!overlay) return;
    let idleTimer = null;
    let hovering = false;
    const clearIdle = () => {
      document.body.classList.remove("perf-dim");
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };
    const scheduleIdle = () => {
      clearIdle();
      if (hovering) return;
      idleTimer = setTimeout(() => {
        if (!document.hidden) document.body.classList.add("perf-dim");
      }, 6500);
    };
    overlay.addEventListener("pointerenter", () => {
      hovering = true;
      clearIdle();
    });
    overlay.addEventListener("pointerleave", () => {
      hovering = false;
      scheduleIdle();
    });
    document.addEventListener("pointerdown", scheduleIdle, { passive: true });
    document.addEventListener("keydown", scheduleIdle, { passive: true });
    window.addEventListener("gamepadconnected", scheduleIdle);
    scheduleIdle();
  }

  let compassAccumulator = 0;
  const compassForward = new THREE.Vector3();

  function updateHudCompass(delta) {
    const heading = document.getElementById("hud-compass-heading");
    if (!heading || !camera) return;
    compassAccumulator += delta;
    if (compassAccumulator < 0.08) return;
    compassAccumulator = 0;
    camera.getWorldDirection(compassForward);
    const degrees = ((Math.atan2(compassForward.x, compassForward.z) * 180 / Math.PI) + 360) % 360;
    const rounded = Math.round(degrees) % 360;
    heading.textContent = `${String(rounded).padStart(3, "0")}°`;
  }

  function setupQuickDeck() {
    const deck = document.getElementById("quick-deck");
    const btn = document.getElementById("btn-quick-deck");
    const crewPanel = document.getElementById("deck-crew-panel");
    const systemsPanel = document.getElementById("deck-systems-panel");
    if (!deck || !btn || !crewPanel) return;

    const defs = window.ASTRONAUT_EMOTES || [];
    crewPanel.innerHTML = '<div class="deck-section-label">EXPRESSIONS</div>' + defs.map((def, index) => `
      <button type="button" class="deck-row" data-emote="${def.id}" data-detail="${def.label} — crew expression" title="${def.label}" style="--row-i:${index}">
        <span class="deck-row__icon" aria-hidden="true">${def.icon}</span>
        <span class="deck-row__copy">
          <span class="deck-row__label">${String(def.label || "").toUpperCase()}</span>
          <span class="deck-row__sub">Crew expression</span>
        </span>
        <span class="deck-row__hint">${index + 1}</span>
      </button>
    `).join("");

    // Stagger rows in the static systems panel and annotate them for live detail.
    if (systemsPanel) {
      systemsPanel.querySelectorAll(".deck-row").forEach((row, index) => {
        row.style.setProperty("--row-i", index);
        const label = row.querySelector(".deck-row__label");
        const sub = row.querySelector(".deck-row__sub");
        if (label && !row.getAttribute("data-detail")) {
          row.setAttribute("data-detail", `${label.textContent}${sub ? ` — ${sub.textContent}` : ""}`);
        }
      });
    }

    btn.addEventListener("click", () => {
      setQuickDeckOpen(!quickDeckOpen, quickDeckTab);
      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
    });

    const closeBtn = document.getElementById("btn-deck-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => setQuickDeckOpen(false));
    }

    document.querySelectorAll("[data-deck-tab]").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        setQuickDeckTab(tabBtn.getAttribute("data-deck-tab"));
      });
    });

    crewPanel.addEventListener("click", (event) => {
      const target = event.target.closest("[data-emote]");
      if (!target) return;
      playLocalEmote(target.getAttribute("data-emote"));
      setQuickDeckOpen(false);
    });

    if (systemsPanel) {
      systemsPanel.addEventListener("click", (event) => {
        if (event.target.closest(".deck-row")) setQuickDeckOpen(false);
      });
    }

    const bindDeckDetail = (panel) => {
      if (!panel) return;
      const showRow = (row) => {
        if (!row || !row.getAttribute("data-detail")) return;
        setDeckDetail(row.getAttribute("data-detail"));
      };
      panel.addEventListener("pointerover", (event) => showRow(event.target.closest(".deck-row")));
      panel.addEventListener("focusin", (event) => showRow(event.target.closest(".deck-row")));
      panel.addEventListener("pointerleave", () => setDeckDetail(deckDefaultDetail()));
      panel.addEventListener("focusout", (event) => {
        if (!panel.contains(event.relatedTarget)) setDeckDetail(deckDefaultDetail());
      });
    };
    bindDeckDetail(crewPanel);
    bindDeckDetail(systemsPanel);

    // Drag the mobile sheet down to dismiss it.
    let deckDragY = 0;
    let deckDragging = false;
    const isTouchDeck = () => window.matchMedia && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    const deckHandle = document.getElementById("deck-grabber") || deck.querySelector(".deck-head");
    if (deckHandle) {
      deckHandle.addEventListener("pointerdown", (event) => {
        if (!isTouchDeck()) return;
        deckDragging = true;
        deckDragY = event.clientY;
        deckHandle.setPointerCapture?.(event.pointerId);
      });
      deckHandle.addEventListener("pointermove", (event) => {
        if (!deckDragging) return;
        const dy = Math.max(0, event.clientY - deckDragY);
        deck.style.transform = `translateY(${Math.min(dy, 180)}px)`;
        deck.style.opacity = String(Math.max(0.55, 1 - dy / 420));
      });
      const endDeckDrag = (event) => {
        if (!deckDragging) return;
        deckDragging = false;
        const dy = Math.max(0, (event.clientY || 0) - deckDragY);
        deck.style.transform = "";
        deck.style.opacity = "";
        if (dy > 70) setQuickDeckOpen(false);
      };
      deckHandle.addEventListener("pointerup", endDeckDrag);
      deckHandle.addEventListener("pointercancel", endDeckDrag);
    }

    document.addEventListener("pointerdown", (event) => {
      if (!quickDeckOpen) return;
      if (deck.contains(event.target) || btn.contains(event.target)) return;
      setQuickDeckOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (!quickDeckOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setQuickDeckOpen(false);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        moveDeckFocus(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains("deck-row")) {
          event.preventDefault();
          document.activeElement.click();
        }
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(deck.querySelectorAll("button:not([disabled])")).filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  function init() {
    const container = document.getElementById("canvas-container");
    clock = new THREE.Clock();

    const { w, h } = syncViewportCSSVars();

    // 1. Scene & Camera
    scene = new THREE.Scene();
    window.scene = scene;
    scene.background = new THREE.Color(0x03060f);
    scene.fog = new THREE.FogExp2(0x03060f, 0.0004);

    const aspect = w / h;
    camera = new THREE.PerspectiveCamera(computeEffectiveFov(62, aspect), aspect, 0.1, 15000);
    window.camera = camera;
    camera.position.set(0.0, 2.2, 4.9);
    camera.lookAt(0.0, 1.4, 0.0);

    // 2. WebGL Renderer calibrated for Desktop & Mobile GPU efficiency
    renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      powerPreference: "high-performance",
      precision: isMobile ? "mediump" : "highp"
    });
    window.renderer = renderer;
    renderer.setSize(w, h, false);
    // 1 CSS pixel per device pixel is the sweet spot on phone GPUs; the DRS
    // pass can still trade a little more resolution for a steady frame rate.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.0 : 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = !isMobile;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Use lightweight LOD1 astronaut model by default on mobile devices
    if (isMobile && window.glbManager) {
      window.glbManager.selectedAvatarModelId = "astronaut_lod1";
    }

    // 3. Audio
    if (window.spaceAudio) window.spaceAudio.init();

    // 4. Lighting & Cosmos Environment
    setupCosmosEnvironment();

    // 5. Initialize Lunaspis 27-Part Interactive ISS Reference Showcase, Mission Viz & VR Mode
    if (window.issShowcase && typeof window.issShowcase.init === "function") {
      window.issShowcase.init(scene, camera, renderer);
    }
    if (window.missionViz && typeof window.missionViz.init === "function") {
      window.missionViz.init(scene, camera, renderer);
    }
    if (window.solarSystem && typeof window.solarSystem.init === "function") {
      window.solarSystem.init(scene, camera, renderer);
    }
    if (window.vrManager && typeof window.vrManager.init === "function") {
      window.vrManager.init(scene, camera, renderer);
    }

    // 5a. Build Station & Attach ISS Model
    buildSpaceStationAndFleet();

    // 5b. Preload Lunaspis GLB Assets
    if (window.glbManager) {
      const primaryAstronautPath = isMobile ? "models/astronaut/astronaut_lod1.glb" : "models/astronaut/astronaut_lod0.glb";
      window.glbManager.loadGLB(primaryAstronautPath).catch(() => {});
      window.glbManager.loadGLB("models/astronaut/astronaut_lod1.glb").catch(() => {});
      window.glbManager.loadGLB("models/iss/ISS_stationary_opt.glb").catch(() => {});
    }

    // 5c. Lunaspis 6-Room Modular Spacecraft Interior (hidden during orbital title screen until mission launch)
    if (window.shipInterior && typeof window.shipInterior.init === "function") {
      window.shipInterior.init(scene);
      window.shipInterior.hide();
    }

    // 5d. Kennedy Space Center Launch Complex 39A (Ground Start, Player-Controlled Boarding Dock, Launch & Docking)
    if (window.spaceCenter && typeof window.spaceCenter.init === "function") {
      window.spaceCenter.init(scene, camera, renderer);
    }

    // Expose camera yaw/pitch setter for Space Center <-> Station transitions
    window.setCameraYawPitch = function (yaw, pitch) {
      if (typeof yaw === "number") camYaw = yaw;
      if (typeof pitch === "number") camPitch = pitch;
    };

    // 6. Build Local Player Astronaut Rig
    buildLocalAstronaut("#c9f04b", "commander", isMobile ? "astronaut_lod1" : "astronaut_lod0");

    // 7. Setup UI & Network Flow
    setupMissionControlFlow();
    updateCameraModeUI();
    if (window.gameplay) {
      window.gameplay.init();
      window.gameplay.updateTaskListUI();
    }
    if (window.missionAcademy && typeof window.missionAcademy.init === "function") {
      window.missionAcademy.init();
    }
    if (window.missionLog && typeof window.missionLog.init === "function") {
      window.missionLog.init();
    }

    // Auto-collapse dense panels on compact viewports so the 3D scene stays open
    syncResponsiveHudState(w, h);

    // 8. Post-Processing Pipeline
    try {
      if (typeof window.createCinematicPass === "function") {
        cinematicPass = window.createCinematicPass(THREE, renderer, w, h);
      }
    } catch (e) {
      console.warn("Cinematic pass skipped:", e);
    }

    // 8b. Initialize NASA Cockpit Performance & Flight Systems Settings
    loadPerfSettings();
    applyPerfSettings();

    // 9. Input controls & resize/orientation listeners
    setupInputControls();
    setupQuickDeck();
    setupEmoteWheel();
    setupTitleChrome();
    setupPerfIdleState();
    setupMobileUX();
    window.addEventListener("resize", onWindowResize);
    window.addEventListener("orientationchange", () => {
      setTimeout(onWindowResize, 60);
      setTimeout(onWindowResize, 220);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onWindowResize);
      window.visualViewport.addEventListener("scroll", onWindowResize);
    }

    // 10. Start Loop (WebXR-compatible animation loop)
    if (typeof renderer.setAnimationLoop === "function") {
      renderer.setAnimationLoop(renderFrame);
    } else {
      animate();
    }
  }

  // ============================================================================
  // COSMOS ENVIRONMENT & LIGHTING (Matching SpaceShip GameCanvas.tsx)
  // ============================================================================
  function setupCosmosEnvironment() {
    const ambLight = new THREE.AmbientLight(0xdbeafe, isMobile ? 0.55 : 0.35);
    scene.add(ambLight);
    ambLightRef = ambLight;
    window.ambLight = ambLight;

    const hemiLight = new THREE.HemisphereLight(0xcfe4ff, 0x1a2030, isMobile ? 0.65 : 0.45);
    scene.add(hemiLight);
    window.hemiLight = hemiLight;

    sunLight = new THREE.DirectionalLight(0xfff5e0, 2.2);
    sunLight.position.set(60, 45, 50);
    sunLight.name = "KeySunLight";
    scene.add(sunLight);
    scene.add(sunLight.target);
    window.sunLight = sunLight;

    const earthShine = new THREE.DirectionalLight(0x5ea2ff, 0.55);
    earthShine.position.set(-50, -30, -40);
    scene.add(earthShine);
    window.earthShineLight = earthShine;

    // Realistic Starfield particles (lighter count on mobile GPUs)
    const starCount = isMobile ? 1600 : 4500;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      const r = 900 + Math.random() * 800;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0.88 });
    spaceStars = new THREE.Points(starGeo, starMat);
    spaceStars.name = "SpaceStarfield";
    scene.add(spaceStars);
    window.spaceStars = spaceStars;

    // Photorealistic 4K Earth with Rayleigh Atmospheric Scattering Shader (SpaceShip Earth.tsx)
    if (typeof window.PhotorealisticEarth === "function") {
      photorealisticEarth = new window.PhotorealisticEarth(scene, {
        radius: 50,
        position: new THREE.Vector3(0, -68, -95)
      });
      window.photorealisticEarth = photorealisticEarth;
      earthSphere = photorealisticEarth.earthMesh;
    }
  }

  // ============================================================================
  // STATION & VEHICLES (SpaceShip ISS_stationary_opt.glb & ISS Showcase)
  // ============================================================================
  function buildSpaceStationAndFleet() {
    issGroup = new THREE.Group();
    issGroup.name = "ISS_OrbitGroup";
    scene.add(issGroup);
    window.issGroup = issGroup;

    // The 27-part showcase gets its own mount.  It normalizes the model to a
    // 28 m display size, which must never touch the full-scale station used by
    // the docking simulator.
    const issShowcaseGroup = new THREE.Group();
    issShowcaseGroup.name = "ISS_Showcase_Group";
    issShowcaseGroup.visible = false;
    scene.add(issShowcaseGroup);
    window.issShowcaseGroup = issShowcaseGroup;

    issGroup.visible = true;

    if (window.glbManager) {
      const attachStation = (entry, modelId) => {
        try {
          const flagshipStation = window.glbManager.instantiateModel(modelId, { scale: 1.0 });
          flagshipStation.name = "NASA_ISS_Stationary_Opt";
          flagshipStation.position.set(0, 4.0, -55.0);
          issGroup.add(flagshipStation);
          window.flagshipStation = flagshipStation;

          if (window.issShowcase && typeof window.issShowcase.attachModel === "function") {
            window.issShowcase.attachModel(flagshipStation, issShowcaseGroup);
          }
          console.log(`[SpaceShip] High-fidelity NASA ISS (${modelId}) loaded & wired to 27-part Showcase.`);
        } catch (e) {
          console.warn("Could not instantiate ISS model:", e);
        }
      };

      window.glbManager.loadGLB("models/iss/ISS_stationary_opt.glb")
        .then((entry) => attachStation(entry, "iss_stationary_opt"))
        .catch(() => {
          window.glbManager.loadGLB("models/iss/ISS_B.glb")
            .then((entry) => attachStation(entry, "iss_b"))
            .catch((err) => console.warn("Could not load ISS GLB:", err));
        });
    }
  }

  // ============================================================================
  // NASA ASTRONAUT RIG, FLOATING NAMETAGS & FLIGHT SPECIALIZATION
  // ============================================================================
  function createNameBadgeSprite(name = "Astronaut", color = "#c9f04b", role = "commander", isHost = false, team = "crew") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");

    function drawBadge(n, c, r, h, isSpeaking = false, isMuted = false, isRadio = false, currentTeam = "crew") {
      ctx.clearRect(0, 0, 512, 160);
      const pillX = 36, pillY = 24, pillW = 440, pillH = 112, rad = 24;
      const themeBrand = (window.UITheme && window.UITheme.palette && window.UITheme.palette.brand) || "#c9f04b";
      const themeStrong = (window.UITheme && window.UITheme.palette && window.UITheme.palette.brandStrong) || "#e4ff7e";

      ctx.save();
      let glowColor = c || (currentTeam === "crew" ? themeBrand : currentTeam === "bravo" ? "#8a8194" : "#ff6b6b");
      if (isRadio) glowColor = themeBrand;
      else if (isSpeaking) glowColor = "#63e6a8";

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = (isRadio || isSpeaking) ? 30 : 18;

      ctx.beginPath();
      ctx.moveTo(pillX + rad, pillY);
      ctx.lineTo(pillX + pillW - rad, pillY);
      ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + rad);
      ctx.lineTo(pillX + pillW, pillY + pillH - rad);
      ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - rad, pillY + pillH);
      ctx.lineTo(pillX + rad, pillY + pillH);
      ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - rad);
      ctx.lineTo(pillX, pillY + rad);
      ctx.quadraticCurveTo(pillX, pillY, pillX + rad, pillY);
      ctx.closePath();

      if (isRadio) {
        ctx.fillStyle = "rgba(30, 24, 10, 0.95)";
      } else if (isSpeaking) {
        ctx.fillStyle = "rgba(10, 24, 20, 0.95)";
      } else {
        ctx.fillStyle = "rgba(10, 16, 28, 0.90)";
      }
      ctx.fill();

      ctx.strokeStyle = glowColor;
      ctx.lineWidth = (isRadio || isSpeaking) ? 8 : 5;
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      let prefix = "";
      if (h) prefix += "[HOST] ";
      if (isRadio) prefix += "[TX] ";
      else if (isSpeaking) prefix += "[MIC] ";
      else if (isMuted) prefix += "[MUTE] ";

      const displayName = prefix + String(n || "CREW").toUpperCase();
      ctx.font = "900 34px 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      if (isRadio) ctx.fillStyle = themeStrong;
      else if (isSpeaking) ctx.fillStyle = "#63e6a8";
      else ctx.fillStyle = "#efeee7";

      ctx.fillText(displayName, 256, 62);

      const roleMeta = window.InterfellasRoles
        ? window.InterfellasRoles.getRoleMeta(r)
        : { short: String(r || "CREW").slice(0, 3).toUpperCase(), label: String(r || "CREW").toUpperCase() };
      const roleBanner = `[${roleMeta.short}] ${roleMeta.label}`;

      ctx.font = "800 22px 'SF Mono', Monaco, Consolas, monospace";
      if (isRadio) {
        ctx.fillStyle = themeStrong;
        ctx.fillText("● " + roleBanner + " [RADIO]", 256, 104);
      } else if (isSpeaking) {
        ctx.fillStyle = "#63e6a8";
        ctx.fillText("● " + roleBanner + " [PROX]", 256, 104);
      } else {
        ctx.fillStyle = c || roleMeta.color || themeBrand;
        ctx.fillText("● " + roleBanner, 256, 104);
      }
    }

    drawBadge(name, color, role, isHost, false, false, false, team);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.4, 0.44, 1.0);
    sprite.position.set(0, 2.15, 0);

    sprite.userData = {
      canvas,
      ctx,
      texture,
      update: (n, c, r, h, isSpeaking = false, isMuted = false, isRadio = false) => {
        drawBadge(n, c, r, h, isSpeaking, isMuted, isRadio);
        texture.needsUpdate = true;
      }
    };

    return sprite;
  }
  window.createNameBadgeSprite = createNameBadgeSprite;

  function createAstronautMesh(suitHexColor = "#c9f04b", role = "commander", name = "Astronaut", isHost = false, modelKey = null, team = "crew", options = {}) {
    if (window.glbManager && typeof window.glbManager.createAstronautRig === "function") {
      return window.glbManager.createAstronautRig(suitHexColor, role, name, isHost, modelKey, team, options);
    }
    const root = new THREE.Group();
    return { root };
  }

  function buildLocalAstronaut(color = "#c9f04b", role = "commander", modelKey = null) {
    const prevPos = (isGameStarted && localCrew.group) ? localCrew.group.position.clone() : null;
    const prevRotY = (isGameStarted && localCrew.group) ? localCrew.group.rotation.y : null;

    if (localCrew.group && localCrew.group.parent) {
      scene.remove(localCrew.group);
    }

    const normalizedRole = window.InterfellasRoles
      ? window.InterfellasRoles.normalizeRole(role, "commander")
      : String(role || "commander").toLowerCase();
    if (window.netManager && window.netManager.localPlayer) {
      window.netManager.localPlayer.role = normalizedRole;
      window.netManager.localPlayer.color = color;
    }

    const pName = (window.netManager && window.netManager.localPlayer) ? window.netManager.localPlayer.name : "Astronaut";
    const isHost = (window.netManager) ? window.netManager.isHost : false;
    const team = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.team) ? window.netManager.localPlayer.team : "crew";
    const resolvedTeam = window.InterfellasRoles
      ? window.InterfellasRoles.getTeamForRole(normalizedRole)
      : team;
    const defaultModel = isMobile ? "astronaut_lod1" : "astronaut_lod0";
    const fallbackModel = modelKey || (window.glbManager ? window.glbManager.selectedAvatarModelId : defaultModel);
    const chosenModel = window.glbManager && typeof window.glbManager.getModelIdForRole === "function"
      ? window.glbManager.getModelIdForRole(normalizedRole, fallbackModel)
      : fallbackModel;

    const rig = createAstronautMesh(color, normalizedRole, pName, isHost, chosenModel, resolvedTeam, {
      enableLight: !isMobile && resolvedTeam !== "ground",
      castShadow: !isMobile
    });
    localCrew.group = rig.root;
    localCrew.rig = rig;
    localCrew.headGroup = rig.headGroup;
    localCrew.helmetMeshGroup = rig.helmetMeshGroup;
    localCrew.torsoGroup = rig.torsoGroup;
    localCrew.leftArm = rig.leftArm;
    localCrew.rightArm = rig.rightArm;
    localCrew.leftLeg = rig.leftLeg;
    localCrew.rightLeg = rig.rightLeg;
    localCrew.spotLight = rig.spotLight;
    localCrew.nameBadge = rig.nameBadge;
    localCrew.color = color;
    localCrew.role = normalizedRole;
    localCrew.team = resolvedTeam;

    // Preserve active in-world coordinates when swapping suits/roles mid-mission;
    // otherwise spawn at Lunaspis's PLAYER_SPAWN in Transit Hub facing -Z.
    if (prevPos) {
      localCrew.group.position.copy(prevPos);
      localCrew.group.rotation.y = prevRotY != null ? prevRotY : Math.PI;
    } else {
      localCrew.group.position.set(0.0, 0.0, 2.0);
      localCrew.group.rotation.y = Math.PI;
    }

    if (scene && localCrew.group && !localCrew.group.parent) {
      scene.add(localCrew.group);
    }
    window.localCrew = localCrew;
    window.buildLocalAstronaut = buildLocalAstronaut;
    window.createAstronautMesh = createAstronautMesh;
  }

  // ============================================================================
  // NASA EXPEDITION BRIEFING, FLIGHT CREDENTIALS & LOBBY CONTROLLER
  // ============================================================================
  let currentAstronaut = null;
  let screenVeilTimer = null;

  function setAnimatedNumber(el, value, duration = 320) {
    if (!el) return;
    const target = Number(value) || 0;
    const start = Number(el.textContent) || 0;
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || start === target || typeof requestAnimationFrame !== "function") {
      el.textContent = String(target);
      return;
    }
    const startedAt = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function playScreenVeil() {
    const veil = document.getElementById("screen-transition-veil");
    if (!veil) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (screenVeilTimer) clearTimeout(screenVeilTimer);
    veil.classList.remove("is-active");
    void veil.offsetWidth;
    veil.classList.add("is-active");
    screenVeilTimer = setTimeout(() => {
      veil.classList.remove("is-active");
      screenVeilTimer = null;
    }, 340);
  }

  function setupMissionControlFlow() {
    if (!window.netManager) return;

    window.netManager.init();

    const screenMenu = document.getElementById("screen-menu");
    const screenLobby = document.getElementById("screen-lobby");
    const screenGame = document.getElementById("screen-game");

    const inputName = document.getElementById("input-player-name");
    const inputCode = document.getElementById("input-join-code");

    const btnHost = document.getElementById("btn-host-game");
    const btnJoin = document.getElementById("btn-join-game");
    const btnQuick = document.getElementById("btn-quick-play");
    const btnShuttleOps = document.getElementById("btn-shuttle-ops");
    // The standalone Shuttle training flight is no longer a title-screen mode.
    // It remains reachable with ?shuttle=1 for direct launch-to-landing practice.
    const standaloneShuttleMode = /[?&]shuttle=1/.test(window.location.search);

    const lobbyRoomCode = document.getElementById("lobby-room-code");
    const btnCopyLink = document.getElementById("btn-copy-invite");
    const btnStartMission = document.getElementById("btn-start-mission");

    // Auth modal elements
    const modalAuth = document.getElementById("modal-auth");
    const btnOpenAuth = document.getElementById("btn-open-auth");
    const btnCloseAuth = document.getElementById("btn-close-auth");
    const btnAuthLogout = document.getElementById("btn-auth-logout");
    const btnDossierLogout = document.getElementById("btn-dossier-logout");

    const tabLogin = document.getElementById("tab-auth-login");
    const tabRegister = document.getElementById("tab-auth-register");
    const tabReset = document.getElementById("tab-auth-reset");
    const tabDossier = document.getElementById("tab-auth-dossier");

    const formLogin = document.getElementById("form-auth-login");
    const formRegister = document.getElementById("form-auth-register");
    const formReset = document.getElementById("form-auth-reset");
    const formDossier = document.getElementById("form-auth-dossier");
    const authBanner = document.getElementById("auth-msg-banner");
    const linkGotoReg = document.getElementById("link-goto-register");
    const linkGotoReset = document.getElementById("link-goto-reset");
    const linkGotoLoginFromReg = document.getElementById("link-goto-login-from-reg");
    const linkGotoResetFromReg = document.getElementById("link-goto-reset-from-reg");
    const linkGotoLoginFromReset = document.getElementById("link-goto-login-from-reset");

    const authStatusTitle = document.getElementById("auth-status-title");
    const authStatusDesc = document.getElementById("auth-status-desc");
    const authStatusIcon = document.getElementById("auth-status-icon");

    let regSelectedColor = "#c9f04b";
    let dossierSelectedColor = "#c9f04b";

    function showAuthBanner(msg, isError = false) {
      if (!authBanner) return;
      authBanner.textContent = msg;
      authBanner.className = `auth-msg-banner ${isError ? 'error' : 'success'}`;
      authBanner.style.display = "flex";
    }

    function hideAuthBanner() {
      if (authBanner) authBanner.style.display = "none";
    }

    function switchAuthTab(tab) {
      hideAuthBanner();
      [tabLogin, tabRegister, tabReset, tabDossier].forEach(t => { if (t) t.classList.remove("active"); });
      [formLogin, formRegister, formReset, formDossier].forEach(f => { if (f) f.style.display = "none"; });

      if (tab === "register") {
        if (tabRegister) tabRegister.classList.add("active");
        if (formRegister) formRegister.style.display = "block";
      } else if (tab === "reset") {
        if (tabReset) tabReset.classList.add("active");
        if (formReset) formReset.style.display = "block";
      } else if (tab === "dossier") {
        if (tabDossier) tabDossier.classList.add("active");
        if (formDossier) formDossier.style.display = "block";
        populateDossierForm();
      } else {
        if (tabLogin) tabLogin.classList.add("active");
        if (formLogin) formLogin.style.display = "block";
      }
    }

    if (btnOpenAuth) {
      btnOpenAuth.addEventListener("click", () => {
        if (modalAuth) modalAuth.style.display = "flex";
        switchAuthTab(currentAstronaut ? "dossier" : "login");
      });
    }
    if (btnCloseAuth) btnCloseAuth.addEventListener("click", () => { if (modalAuth) modalAuth.style.display = "none"; });
    if (linkGotoReg) linkGotoReg.addEventListener("click", (e) => { e.preventDefault(); switchAuthTab("register"); });
    if (linkGotoReset) linkGotoReset.addEventListener("click", (e) => { e.preventDefault(); switchAuthTab("reset"); });
    if (linkGotoLoginFromReg) linkGotoLoginFromReg.addEventListener("click", (e) => { e.preventDefault(); switchAuthTab("login"); });
    if (linkGotoResetFromReg) linkGotoResetFromReg.addEventListener("click", (e) => { e.preventDefault(); switchAuthTab("reset"); });
    if (linkGotoLoginFromReset) linkGotoLoginFromReset.addEventListener("click", (e) => { e.preventDefault(); switchAuthTab("login"); });

    if (tabLogin) tabLogin.addEventListener("click", () => switchAuthTab("login"));
    if (tabRegister) tabRegister.addEventListener("click", () => switchAuthTab("register"));
    if (tabReset) tabReset.addEventListener("click", () => switchAuthTab("reset"));
    if (tabDossier) tabDossier.addEventListener("click", () => switchAuthTab("dossier"));

    document.querySelectorAll("#reg-color-swatches .lobby-color-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll("#reg-color-swatches .lobby-color-btn").forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        regSelectedColor = e.currentTarget.getAttribute("data-color");
      });
    });

    document.querySelectorAll("#dossier-color-swatches .lobby-color-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll("#dossier-color-swatches .lobby-color-btn").forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        dossierSelectedColor = e.currentTarget.getAttribute("data-color");
      });
    });

    function applyAstronautProfile(astro) {
      currentAstronaut = astro;
      const defaultModel = isMobile ? "astronaut_lod1" : "astronaut_lod0";
      if (!astro) {
        if (authStatusTitle) authStatusTitle.textContent = "GUEST";
        if (authStatusDesc) authStatusDesc.textContent = "Local session";
        if (btnOpenAuth) btnOpenAuth.textContent = "SIGN IN";
        if (btnAuthLogout) btnAuthLogout.style.display = "none";
        if (tabDossier) tabDossier.style.display = "none";
        if (window.netManager) window.netManager.userId = null;

        const defName = localStorage.getItem("interfellas_name") || "CDR. Vance";
        if (inputName) inputName.value = defName;
        window.netManager.localPlayer.name = defName;
        window.netManager.localPlayer.color = "#c9f04b";
        window.netManager.localPlayer.role = "commander";
        buildLocalAstronaut("#c9f04b", "commander", defaultModel);
        return;
      }

      const rank = astro.flight_title || "Commander";
      const callsign = astro.callsign || astro.username;
      const color = astro.suit_color || "#c9f04b";

      if (authStatusTitle) authStatusTitle.textContent = `${callsign.toUpperCase()}`;
      if (authStatusDesc) authStatusDesc.textContent = `${rank.toUpperCase()}`;
      if (btnOpenAuth) btnOpenAuth.textContent = "DOSSIER";
      if (btnAuthLogout) btnAuthLogout.style.display = "inline-block";
      if (tabDossier) tabDossier.style.display = "inline-block";

      if (inputName) inputName.value = callsign;

      const statMissions = document.getElementById("stat-missions");
      const statVictories = document.getElementById("stat-victories");
      const statTasks = document.getElementById("stat-tasks");
      setAnimatedNumber(statMissions, astro.games_played || 0);
      setAnimatedNumber(statVictories, astro.games_won || 0);
      setAnimatedNumber(statTasks, astro.tasks_completed || 0);

      if (astro.token && typeof window.netManager.setAuthToken === "function") {
        window.netManager.setAuthToken(astro.token);
      }
      const normalizedRole = window.InterfellasRoles
        ? window.InterfellasRoles.normalizeRole(astro.preferred_role || rank, "commander")
        : "commander";
      window.netManager.userId = astro.id;
      window.netManager.localPlayer.name = callsign;
      window.netManager.localPlayer.color = color;
      window.netManager.localPlayer.role = normalizedRole;
      if (normalizedRole !== "commander") {
        window.netManager.explicitRoleSelected = true;
      }
      buildLocalAstronaut(color, normalizedRole, defaultModel);
      if (typeof window.syncLobbySelectionUI === "function") window.syncLobbySelectionUI();
      if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();
    }

    function populateDossierForm() {
      if (!currentAstronaut) return;
      const cInput = document.getElementById("dossier-callsign");
      const tSelect = document.getElementById("dossier-title");
      const dMissions = document.getElementById("dossier-missions");
      const dVictories = document.getElementById("dossier-victories");
      const dTasks = document.getElementById("dossier-tasks");

      if (cInput) cInput.value = currentAstronaut.callsign || currentAstronaut.username;
      if (tSelect) tSelect.value = currentAstronaut.flight_title || "Commander";
      if (dMissions) dMissions.textContent = currentAstronaut.games_played || 0;
      if (dVictories) dVictories.textContent = currentAstronaut.games_won || 0;
      if (dTasks) dTasks.textContent = currentAstronaut.tasks_completed || 0;

      dossierSelectedColor = currentAstronaut.suit_color || "#c9f04b";
      document.querySelectorAll("#dossier-color-swatches .lobby-color-btn").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-color") === dossierSelectedColor);
      });
    }

    if (formLogin) {
      formLogin.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("login-username").value.trim();
        const password = document.getElementById("login-password").value;
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
          });
          const data = await res.json();
          if (data.success && data.user) {
            const credential = { ...data.user, token: data.token };
            localStorage.setItem("nasa_astronaut_credential", JSON.stringify(credential));
            applyAstronautProfile(credential);
            showAuthBanner("NASA Flight Credential Authenticated. Welcome aboard!", false);
            setTimeout(() => { if (modalAuth) modalAuth.style.display = "none"; }, 1000);
          } else {
            showAuthBanner(data.error || "Authentication failed.", true);
          }
        } catch (err) {
          showAuthBanner("Server communication error: " + err.message, true);
        }
      });
    }

    if (formRegister) {
      formRegister.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("reg-username").value.trim();
        const callsign = document.getElementById("reg-callsign").value.trim();
        const password = document.getElementById("reg-password").value;
        const flightTitle = document.getElementById("reg-title").value;
        try {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password, callsign, flightTitle, suitColor: regSelectedColor })
          });
          const data = await res.json();
          if (data.success && data.user) {
            const credential = { ...data.user, token: data.token };
            localStorage.setItem("nasa_astronaut_credential", JSON.stringify(credential));
            window.netManager.explicitRoleSelected = true;
            applyAstronautProfile(credential);
            showAuthBanner("Flight Credential Issued! Welcome to the Astronaut Corps.", false);
            setTimeout(() => { if (modalAuth) modalAuth.style.display = "none"; }, 1000);
          } else {
            showAuthBanner(data.error || "Registration failed.", true);
          }
        } catch (err) {
          showAuthBanner("Server communication error: " + err.message, true);
        }
      });
    }

    if (formReset) {
      formReset.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("reset-username").value.trim();
        const currentPassword = document.getElementById("reset-current-password").value;
        const newPassword = document.getElementById("reset-password").value;
        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, currentPassword, newPassword })
          });
          const data = await res.json();
          if (data.success && data.user) {
            const credential = { ...data.user, token: data.token };
            localStorage.setItem("nasa_astronaut_credential", JSON.stringify(credential));
            applyAstronautProfile(credential);
            showAuthBanner(data.message || "Password reset successfully.", false);
            setTimeout(() => { if (modalAuth) modalAuth.style.display = "none"; }, 1000);
          } else {
            showAuthBanner(data.error || "Password reset failed.", true);
          }
        } catch (err) {
          showAuthBanner("Server communication error: " + err.message, true);
        }
      });
    }

    if (formDossier) {
      formDossier.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!currentAstronaut) return;
        const callsign = document.getElementById("dossier-callsign").value.trim();
        const flightTitle = document.getElementById("dossier-title").value;
        try {
          const normalizedPreferredRole = window.InterfellasRoles
            ? window.InterfellasRoles.normalizeRole(flightTitle, "commander")
            : "commander";
          const res = await fetch("/api/auth/update-profile", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${currentAstronaut.token || ""}`
            },
            body: JSON.stringify({
              callsign,
              flightTitle,
              suitColor: dossierSelectedColor,
              preferredRole: normalizedPreferredRole
            })
          });
          const data = await res.json();
          if (data.success && data.user) {
            const credential = { ...data.user, token: currentAstronaut.token };
            localStorage.setItem("nasa_astronaut_credential", JSON.stringify(credential));
            window.netManager.explicitRoleSelected = true;
            applyAstronautProfile(credential);
            if (window.netManager.roomId) {
              window.netManager.customizeAstronaut(callsign, dossierSelectedColor, normalizedPreferredRole, null, null, null, { explicitRole: true });
            }
            showAuthBanner("Flight Dossier updated successfully.", false);
            setTimeout(() => { if (modalAuth) modalAuth.style.display = "none"; }, 1000);
          } else {
            showAuthBanner(data.error || "Update failed.", true);
          }
        } catch (err) {
          showAuthBanner("Server communication error: " + err.message, true);
        }
      });
    }

    const doLogout = () => {
      const stored = localStorage.getItem("nasa_astronaut_credential");
      let token = null;
      try {
        token = stored ? JSON.parse(stored).token : null;
      } catch (e) {}
      if (token) {
        fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        }).catch(() => {});
      }
      localStorage.removeItem("nasa_astronaut_credential");
      if (window.netManager && typeof window.netManager.setAuthToken === "function") {
        window.netManager.setAuthToken(null);
      }
      if (window.netManager) window.netManager.explicitRoleSelected = false;
      applyAstronautProfile(null);
      if (modalAuth) modalAuth.style.display = "none";
    };
    if (btnAuthLogout) btnAuthLogout.addEventListener("click", doLogout);
    if (btnDossierLogout) btnDossierLogout.addEventListener("click", doLogout);

    try {
      localStorage.removeItem("nasa_astronaut_credential");
    } catch (e) {}
    applyAstronautProfile(null);

    if (inputName) {
      inputName.value = window.netManager.localPlayer.name;
      inputName.addEventListener("input", (e) => {
        const val = e.target.value;
        window.netManager.localPlayer.name = val;
        try {
          if (val && val.trim()) localStorage.setItem("interfellas_name", val.trim());
        } catch (err) {}
      });
    }

    window.netManager.on("user_synced", (profile) => {
      if (!profile || currentAstronaut) return;
      const displayName = profile.callsign || profile.username;
      if (inputName && displayName) inputName.value = displayName;
      const statMissions = document.getElementById("stat-missions");
      const statVictories = document.getElementById("stat-victories");
      const statTasks = document.getElementById("stat-tasks");
      setAnimatedNumber(statMissions, profile.games_played || 0);
      setAnimatedNumber(statVictories, profile.games_won || 0);
      setAnimatedNumber(statTasks, profile.tasks_completed || 0);
    });

    if (btnHost) {
      btnHost.addEventListener("click", () => {
        const name = inputName ? inputName.value.trim() : (currentAstronaut ? currentAstronaut.callsign : "Commander");
        const color = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.color)
          || (currentAstronaut ? currentAstronaut.suit_color : "#c9f04b");
        window.netManager.createRoom(name, color, null, {
          explicitRole: false,
          isPublic: false,
          opsMode: standaloneShuttleMode ? "shuttle_flight" : "iss_expedition"
        });
      });
    }

    if (btnJoin) {
      btnJoin.addEventListener("click", () => {
        const code = inputCode ? inputCode.value.trim().toUpperCase() : "";
        if (!code) {
          alert("Please enter a 6-letter expedition code!");
          return;
        }
        const name = inputName ? inputName.value.trim() : (currentAstronaut ? currentAstronaut.callsign : "Crew");
        const color = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.color)
          || (currentAstronaut ? currentAstronaut.suit_color : "#c9f04b");
        window.netManager.joinRoom(code, name, color, null, { explicitRole: false });
      });
    }

    if (btnQuick) {
      btnQuick.addEventListener("click", () => {
        const name = inputName ? inputName.value.trim() : (currentAstronaut ? currentAstronaut.callsign : "Crew");
        const color = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.color)
          || (currentAstronaut ? currentAstronaut.suit_color : "#c9f04b");
        window.netManager.startSolo(name, color, null, {
          opsMode: standaloneShuttleMode ? "shuttle_flight" : "iss_expedition"
        });
      });
    }

    if (btnShuttleOps) {
      btnShuttleOps.addEventListener("click", () => {
        const name = inputName ? inputName.value.trim() : (currentAstronaut ? currentAstronaut.callsign : "Commander");
        const color = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.color)
          || (currentAstronaut ? currentAstronaut.suit_color : "#67e8f9");
        window.netManager.createRoom(name, color, null, { explicitRole: false, opsMode: "shuttle_flight" });
      });
    }

    if (btnCopyLink) {
      btnCopyLink.addEventListener("click", () => {
        const code = window.netManager.roomId;
        if (!code) return;
        const link = `${window.location.origin}/?room=${code}`;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(link).then(() => {
            btnCopyLink.textContent = "COPIED TO CLIPBOARD";
            setTimeout(() => { btnCopyLink.textContent = "COPY INVITE LINK"; }, 2500);
          }).catch(() => {});
        }
      });
    }

    function syncSpaceGamesLock() {
      if (window.csaNasaLab && typeof window.csaNasaLab.syncGroundLockState === "function") {
        window.csaNasaLab.syncGroundLockState();
      }
    }

    function cleanupGameWorldForLobby() {
      isGameStarted = false;
      window.isGameStarted = false;
      document.body.classList.remove(
        "game-active",
        "ground-mode-active",
        "launch-active",
        "docking-active",
        "interior-active",
        "iss-showcase-active",
        "mission-viz-active",
        "shuttle-mode-active",
        "artemis-mode-active",
        "solar-system-active",
        "vr-stereo-active",
        "vr-webxr-active",
        "space-games-ground-locked"
      );
      syncSpaceGamesLock();
      if (window.artemisGame && window.artemisGame.isActive) stopArtemisFlight(true);

      if (window.shuttleGame && window.shuttleGame.isActive && typeof window.shuttleGame.exit === "function") {
        window.shuttleGame.exit();
        onWindowResize();
      }

      if (window.vrManager && window.vrManager.isAnyVRActive && typeof window.vrManager.exitVR === "function") {
        window.vrManager.exitVR();
      }
      if (window.solarSystem && window.solarSystem.isActive && typeof window.solarSystem.close === "function") {
        window.solarSystem.close();
      }
      if (window.missionViz && window.missionViz.isActive && typeof window.missionViz.close === "function") {
        window.missionViz.close();
      }
      if (window.issShowcase && window.issShowcase.isActive) {
        if (typeof window.issShowcase.close === "function") window.issShowcase.close();
        else if (typeof window.issShowcase.toggle === "function") window.issShowcase.toggle();
      }
      if (window.launchCutscene && window.launchCutscene.isPlaying) {
        if (typeof window.launchCutscene.cancel === "function") window.launchCutscene.cancel();
      }
      if (window.dockingSim && window.dockingSim.isActive && typeof window.dockingSim.stop === "function") {
        window.dockingSim.stop();
      }
      if (window.spaceCenter) {
        window.spaceCenter.isGroundMode = false;
        window.spaceCenter.crewBoarded = false;
        window.spaceCenter.isLaunching = false;
        if (window.spaceCenter.group) window.spaceCenter.group.visible = false;
        if (window.spaceCenter.hudOverlay) window.spaceCenter.hudOverlay.style.display = "none";
      }
      if (window.shipInterior) {
        if (window.shipInterior.isMoonLandingActive && typeof window.shipInterior.stopMoonLandingScene === "function") {
          window.shipInterior.stopMoonLandingScene();
        }
        window.shipInterior.hide();
      }
      if (window.issGroup) {
        window.issGroup.visible = true;
      }
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = false;
      }
      if (window.gameplay && typeof window.gameplay.closeTaskModal === "function") {
        window.gameplay.closeTaskModal();
      }

      const resBar = document.getElementById("lunaspis-resource-meters");
      if (resBar) resBar.style.display = "none";
      const btnUse = document.getElementById("btn-proximity-use");
      if (btnUse) btnUse.style.display = "none";
      const victoryOverlay = document.getElementById("victory-overlay");
      if (victoryOverlay) victoryOverlay.style.display = "none";
      const briefingOverlay = document.getElementById("mission-briefing-overlay");
      if (briefingOverlay) briefingOverlay.style.display = "none";

      for (const id in remoteCrewMeshes) {
        if (remoteCrewMeshes[id] && remoteCrewMeshes[id].parent) {
          remoteCrewMeshes[id].parent.remove(remoteCrewMeshes[id]);
        }
        delete remoteCrewMeshes[id];
      }
      for (const id in remoteCarMeshes) {
        if (remoteCarMeshes[id] && remoteCarMeshes[id].parent) {
          remoteCarMeshes[id].parent.remove(remoteCarMeshes[id]);
        }
        delete remoteCarMeshes[id];
      }
    }

    // ------------------------------------------------------------------------
    // Merged main mission: Shuttle launch/ascent -> ISS docking handoff.
    // The standalone Shuttle mission remains a separate reachable training
    // flight, so this path only engages for mission.flightMode === "shuttle_docking".
    // ------------------------------------------------------------------------
    function isMergedShuttleMission(mission) {
      return !!(mission && mission.flightMode === "shuttle_docking");
    }

    function isArtemisMission(mission) {
      return !!(mission && (mission.flightProfile === "artemis" || mission.flightMode === "artemis" || mission.scenarioId === "artemis_expedition"));
    }

    function startArtemisFlight(mission) {
      if (!isArtemisMission(mission) || !window.artemisGame || window.artemisGame.isActive) return;
      cleanupGameWorldForLobby();
      isGameStarted = true;
      window.isGameStarted = true;
      document.body.classList.add("game-active", "artemis-mode-active");
      syncSpaceGamesLock();
      if (screenGame) screenGame.style.display = "none";
      const resBar = document.getElementById("lunaspis-resource-meters");
      if (resBar) resBar.style.display = "none";
      const briefing = document.getElementById("mission-briefing-overlay");
      if (briefing) briefing.style.display = "none";
      window.artemisGame.start({
        renderer,
        net: window.netManager,
        onLeave: leaveCurrentRoom,
        onReturnToLobby: () => {
          if (window.netManager && window.netManager.isHost && typeof window.netManager.returnToLobby === "function") window.netManager.returnToLobby();
        }
      });
      console.log("[Artemis] expedition client active");
    }

    function stopArtemisFlight(silent) {
      if (!window.artemisGame || !window.artemisGame.isActive) return;
      window.artemisGame.exit(silent);
      document.body.classList.remove("artemis-mode-active");
    }

    function isLocalGroundCrew() {
      const player = window.netManager && window.netManager.localPlayer;
      return !!(player && player.team === "ground");
    }

    function startMergedShuttleFlight(mission) {
      if (!isMergedShuttleMission(mission) || isLocalGroundCrew()) return;
      if (!window.shuttleGame || window.shuttleGame.isActive) return;

      if (window.spaceCenter) {
        const sc = window.spaceCenter;
        sc.missionPhase = "launch";
        sc._launchSequenceStarted = true;
        sc.isLaunching = true;
        sc.isGroundMode = false;
        sc._groundObserverLaunch = false;
        if (sc.group) sc.group.visible = false;
        if (sc.stackGroup) sc.stackGroup.visible = false;
        if (sc.hudOverlay) sc.hudOverlay.style.display = "none";
      }
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = false;
      }
      if (window.launchCutscene && window.launchCutscene.isPlaying && typeof window.launchCutscene.cancel === "function") {
        window.launchCutscene.cancel();
      }

      document.body.classList.add("game-active", "shuttle-mode-active");
      document.body.classList.remove("ground-mode-active", "docking-active", "interior-active");
      syncSpaceGamesLock();
      if (screenGame) screenGame.style.display = "none";
      const resBar = document.getElementById("lunaspis-resource-meters");
      if (resBar) resBar.style.display = "none";
      const launchBanner = document.getElementById("launch-countdown-banner");
      if (launchBanner) launchBanner.style.display = "none";
      const briefingOverlay = document.getElementById("mission-briefing-overlay");
      if (briefingOverlay) briefingOverlay.style.display = "none";

      window.shuttleGame.start({
        renderer,
        net: window.netManager,
        mergedMission: true,
        canReturnLobby: !!(window.netManager && window.netManager.isHost),
        onLeave: leaveCurrentRoom,
        onReturnToLobby: () => {
          if (window.netManager && window.netManager.isHost && typeof window.netManager.returnToLobby === "function") {
            window.netManager.returnToLobby();
          }
        }
      });
      console.log("[Shuttle] merged main-mission flight active");
    }

    function stopMergedShuttleFlight() {
      if (!window.shuttleGame || !window.shuttleGame.isActive) {
        document.body.classList.remove("shuttle-mode-active");
        return;
      }
      window.shuttleGame.exit();
      document.body.classList.remove("shuttle-mode-active");
      if (screenGame) screenGame.style.display = "flex";
      const resBar = document.getElementById("lunaspis-resource-meters");
      if (resBar) {
        if (window.gameplay && typeof window.gameplay._applyResourceBarLayout === "function") {
          window.gameplay._applyResourceBarLayout(resBar);
        } else {
          resBar.style.display = "flex";
        }
      }
      onWindowResize();
      console.log("[Shuttle] merged main-mission flight handed off");
    }

    function syncMergedShuttleView(mission) {
      if (!isMergedShuttleMission(mission)) return;
      if (mission.phase === "launch") {
        startMergedShuttleFlight(mission);
      } else {
        stopMergedShuttleFlight();
      }
    }

    function leaveCurrentRoom() {
      if (window.netManager && typeof window.netManager.leaveRoom === "function") {
        window.netManager.leaveRoom();
      }
      setCrewCommsOpen(false);
      cleanupGameWorldForLobby();

      if (window.location.search && window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", window.location.pathname);
      }
      playScreenVeil();
      if (screenLobby) screenLobby.style.display = "none";
      if (screenGame) screenGame.style.display = "none";
      if (screenMenu) screenMenu.style.display = "flex";
      document.body.classList.add("menu-active");
    }

    window.netManager.on("lobby_returned", (data) => {
      setCrewCommsOpen(false);
      playScreenVeil();
      document.body.classList.remove("menu-active");
      cleanupGameWorldForLobby();
      if (window.gameplay && typeof window.gameplay.resetTasks === "function") {
        window.gameplay.resetTasks();
      }
      screenMenu.style.display = "none";
      screenLobby.style.display = "flex";
      screenGame.style.display = "none";
      if (data && data.room) {
        if (lobbyRoomCode) lobbyRoomCode.textContent = data.roomId;
        updateLobbySlots(data.room.players, data.room.hostId, data.room.status);
        renderLobbyMission(data.room.mission);
      }
      updateLocalBadge();
    });

    const btnLeaveRoom = document.getElementById("btn-leave-room");
    if (btnLeaveRoom) {
      btnLeaveRoom.addEventListener("click", leaveCurrentRoom);
    }

    const btnHudLeaveRoom = document.getElementById("btn-hud-leave-room");
    if (btnHudLeaveRoom) {
      btnHudLeaveRoom.addEventListener("click", leaveCurrentRoom);
    }

    if (btnStartMission) {
      btnStartMission.addEventListener("click", () => {
        const status = window.netManager && window.netManager.roomState ? window.netManager.roomState.status : "lobby";
        if (status === "victory") {
          if (window.netManager.isHost && typeof window.netManager.returnToLobby === "function") {
            window.netManager.returnToLobby();
          }
        } else if (status === "playing") {
          window.netManager.emitEvent("game_started", window.netManager.roomState);
        } else {
          const chkShuffle = document.getElementById("chk-shuffle-on-launch");
          window.netManager.startGame({ randomizeRoles: !!(chkShuffle && chkShuffle.checked) });
        }
      });
    }

    const btnRandomizeRoles = document.getElementById("btn-randomize-roles");
    if (btnRandomizeRoles) {
      btnRandomizeRoles.addEventListener("click", () => {
        if (!window.netManager || !window.netManager.isHost) return;
        if (typeof window.netManager.randomizeRoles === "function") {
          window.netManager.randomizeRoles();
        }
        if (window.spaceAudio) window.spaceAudio.playClick();
      });
    }

    document.querySelectorAll("#screen-lobby .lobby-color-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const col = e.currentTarget.getAttribute("data-color");
        window.netManager.customizeAstronaut(null, col, null, null);
        buildLocalAstronaut(col, window.netManager.localPlayer.role);
        if (typeof window.syncLobbySelectionUI === "function") window.syncLobbySelectionUI();
        if (window.spaceAudio) window.spaceAudio.playClick();
      });
    });

    const btnHangarLobby = document.getElementById("btn-open-hangar-lobby");
    if (btnHangarLobby) {
      btnHangarLobby.addEventListener("click", () => {
        if (window.glbManager) window.glbManager.openHangar();
      });
    }

    const btnHangarHUD = document.getElementById("btn-hud-hangar");
    if (btnHangarHUD) {
      btnHangarHUD.addEventListener("click", () => {
        if (window.glbManager) {
          if (window.glbManager.hangarActive) window.glbManager.closeHangar();
          else window.glbManager.openHangar();
        }
      });
    }

    const btnOrbitVizHUD = document.getElementById("btn-hud-orbit-viz");
    if (btnOrbitVizHUD) {
      btnOrbitVizHUD.addEventListener("click", () => {
        if (window.missionViz && typeof window.missionViz.toggle === "function") {
          window.missionViz.toggle();
        }
      });
    }

    const btnCmlHUD = document.getElementById("btn-hud-cml");
    if (btnCmlHUD) {
      btnCmlHUD.addEventListener("click", () => {
        if (window.gameplay && typeof window.gameplay.openCmlWorkbench === "function") {
          window.gameplay.openCmlWorkbench("checklist");
        }
      });
    }

    const btnSolarHUD = document.getElementById("btn-hud-solar");
    if (btnSolarHUD) {
      btnSolarHUD.addEventListener("click", () => {
        if (window.solarSystem && typeof window.solarSystem.toggle === "function") {
          window.solarSystem.toggle();
        }
      });
    }

    const btnVrMainHUD = document.getElementById("btn-hud-vr-main");
    if (btnVrMainHUD) {
      btnVrMainHUD.addEventListener("click", () => {
        if (window.vrManager && typeof window.vrManager.toggleVR === "function") {
          window.vrManager.toggleVR();
        }
      });
    }

    const btnIssHUD = document.getElementById("btn-hud-iss-showcase");
    if (btnIssHUD) {
      btnIssHUD.addEventListener("click", () => {
        if (window.issShowcase) window.issShowcase.toggle();
      });
    }

    const btnLunarHUD = document.getElementById("btn-hud-lunar-scene");
    if (btnLunarHUD) {
      btnLunarHUD.addEventListener("click", () => {
        if (window.shipInterior) window.shipInterior.toggleMoonLandingScene();
      });
    }

    window.netManager.on("auto_join_url", (roomCode) => {
      if (inputCode) inputCode.value = roomCode;
      const color = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.color)
        || (currentAstronaut ? currentAstronaut.suit_color : "#c9f04b");
      window.netManager.joinRoom(roomCode, inputName ? inputName.value : "Crew", color, null, { explicitRole: false });
    });

    function updateLocalBadge() {
      if (localCrew.nameBadge && localCrew.nameBadge.userData && localCrew.nameBadge.userData.update) {
        localCrew.nameBadge.userData.update(
          window.netManager.localPlayer.name,
          window.netManager.localPlayer.color,
          window.netManager.localPlayer.role,
          window.netManager.isHost,
          window.voiceManager ? window.voiceManager.isSpeaking : false,
          window.voiceManager ? window.voiceManager.isMuted : false,
          false
        );
      }
    }

    const btnCameraMode = document.getElementById("btn-camera-mode");
    if (btnCameraMode) {
      btnCameraMode.addEventListener("click", () => cycleCameraMode());
    }

    // Walking/touring the KSC site keeps a short tool row and folds the rest
    // behind MORE, so the world view is not buried under buttons.
    const btnHudMore = document.getElementById("btn-hud-more");
    if (btnHudMore) {
      btnHudMore.addEventListener("click", () => {
        const expanded = document.body.classList.toggle("hud-tools-expanded");
        btnHudMore.setAttribute("aria-expanded", String(expanded));
        const label = btnHudMore.querySelector("span");
        if (label) label.textContent = expanded ? "LESS" : "MORE";
        if (window.spaceAudio) window.spaceAudio.playClick();
      });
    }

    // Voice & Systems Settings
    const btnVoiceMic = document.getElementById("btn-voice-mic");
    const btnVoiceSettings = document.getElementById("btn-voice-settings");
    const btnLobbySettings = document.getElementById("btn-lobby-audio-settings");
    const modalSettings = document.getElementById("modal-station-systems");
    const btnCloseSettings = document.getElementById("btn-close-settings");

    const renderScaleSlider = document.getElementById("render-scale-slider");
    const renderScaleBadge = document.getElementById("render-scale-val-badge");
    const selectCinematicPreset = document.getElementById("select-cinematic-preset");
    const selectFpsCap = document.getElementById("select-fps-cap");
    const fpsCapBadge = document.getElementById("fps-cap-badge");
    const selectLightingQuality = document.getElementById("select-lighting-quality");
    const fovSlider = document.getElementById("camera-fov-slider");
    const fovBadge = document.getElementById("fov-val-badge");
    const selectTickRate = document.getElementById("select-tick-rate");
    const selectInterpBuffer = document.getElementById("select-interp-buffer");
    const toggleDeltaCulling = document.getElementById("toggle-delta-culling");
    const togglePerfPill = document.getElementById("toggle-perf-pill");
    const toggleDiagOverlay = document.getElementById("toggle-diag-overlay");
    const visorOpacitySlider = document.getElementById("visor-opacity-slider");
    const visorOpacityBadge = document.getElementById("visor-opacity-val-badge");
    const toggleCrosshair = document.getElementById("toggle-crosshair");

    function syncPresetButtonsUI() {
      document.querySelectorAll(".btn-preset[data-preset]").forEach((btn) => {
        const presetKey = btn.getAttribute("data-preset");
        const profile = PRESET_PROFILES[presetKey];
        const isActive = !!profile && Object.keys(profile).every((key) => String(perfSettings[key]) === String(profile[key]));
        btn.classList.toggle("active", isActive);
      });
    }

    function syncSettingsUI() {
      if (renderScaleSlider) renderScaleSlider.value = perfSettings.renderScale;
      if (renderScaleBadge) renderScaleBadge.textContent = `${perfSettings.renderScale}% (${(perfSettings.renderScale / 100).toFixed(1)}x)`;
      if (selectCinematicPreset) selectCinematicPreset.value = perfSettings.cinematicPreset;
      if (selectFpsCap) selectFpsCap.value = String(perfSettings.fpsCap);
      if (fpsCapBadge) fpsCapBadge.textContent = perfSettings.fpsCap === 0 ? "UNCAPPED" : `${perfSettings.fpsCap} FPS`;
      if (selectLightingQuality) selectLightingQuality.value = perfSettings.lightingQuality;
      if (fovSlider) fovSlider.value = perfSettings.fov;
      if (fovBadge) fovBadge.textContent = `${perfSettings.fov}°`;
      if (selectTickRate) selectTickRate.value = String(perfSettings.tickRate);
      if (selectInterpBuffer) selectInterpBuffer.value = perfSettings.interpBuffer;
      if (toggleDeltaCulling) toggleDeltaCulling.checked = Boolean(perfSettings.deltaCulling);
      if (togglePerfPill) togglePerfPill.checked = Boolean(perfSettings.showPerfPill);
      if (toggleDiagOverlay) toggleDiagOverlay.checked = Boolean(perfSettings.showDiagOverlay);
      if (visorOpacitySlider) visorOpacitySlider.value = perfSettings.visorOpacity;
      if (visorOpacityBadge) visorOpacityBadge.textContent = `${perfSettings.visorOpacity}%`;
      if (toggleCrosshair) toggleCrosshair.checked = Boolean(perfSettings.showCrosshair);

      syncPresetButtonsUI();
    }

    toggleSystemsSettingsModal = function (forceState) {
      if (!modalSettings) return;
      const willOpen = typeof forceState === "boolean" ? forceState : (modalSettings.style.display !== "flex");
      if (willOpen) {
        syncSettingsUI();
        updatePerfDisplay();
      }
      modalSettings.style.display = willOpen ? "flex" : "none";
    };

    toggleDiagnosticsOverlay = function (forceState) {
      const diagDeck = document.getElementById("hud-diagnostics-overlay");
      const willOpen = typeof forceState === "boolean" ? forceState : !perfSettings.showDiagOverlay;
      perfSettings.showDiagOverlay = willOpen;
      if (diagDeck) diagDeck.style.display = willOpen ? "block" : "none";
      if (toggleDiagOverlay) toggleDiagOverlay.checked = willOpen;
      savePerfSettings();
      updatePerfDisplay();
    };

    const btnLobbyVoice = document.getElementById("btn-lobby-voice");
    const lobbyVoiceText = document.getElementById("lobby-voice-text");
    const voiceMicLabel = document.getElementById("voice-mic-label");
    const voicePulseDot = document.getElementById("voice-pulse-dot");
    const voiceModeLabel = document.getElementById("voice-mode-label");
    const activeSpeakersEl = document.getElementById("hud-active-speakers");

    const audioDeviceSelect = document.getElementById("audio-input-device");
    const micMeterFill = document.getElementById("mic-meter-fill");
    const micMeterText = document.getElementById("mic-meter-text");
    const micSensSlider = document.getElementById("mic-sensitivity-slider");
    const micSensBadge = document.getElementById("sensitivity-val-badge");
    const masterVoiceSlider = document.getElementById("master-voice-slider");
    const masterVolBadge = document.getElementById("master-vol-badge");
    const btnDeafenToggle = document.getElementById("btn-deafen-toggle");
    const crewVolList = document.getElementById("crewmate-volume-list");

    function syncVoiceUI() {
      const vm = window.voiceManager;
      if (!vm) return;

      if (btnLobbyVoice && lobbyVoiceText) {
        if (!vm.isEnabled) {
          btnLobbyVoice.classList.remove("active");
          lobbyVoiceText.textContent = "ENABLE COMMS";
        } else if (vm.isMuted) {
          btnLobbyVoice.classList.remove("active");
          lobbyVoiceText.textContent = "COMMS MUTED";
        } else {
          btnLobbyVoice.classList.add("active");
          lobbyVoiceText.textContent = vm.isSpeaking ? "TRANSMITTING" : "COMMS LIVE";
        }
      }

      if (btnVoiceMic && voiceMicLabel) {
        if (!vm.isEnabled) {
          btnVoiceMic.classList.remove("muted");
          voiceMicLabel.textContent = "OFF";
        } else if (vm.isMuted) {
          btnVoiceMic.classList.add("muted");
          voiceMicLabel.textContent = "MUTED";
        } else {
          btnVoiceMic.classList.remove("muted");
          voiceMicLabel.textContent = "ON";
        }
      }

      if (voicePulseDot) {
        voicePulseDot.classList.remove("speaking", "muted");
        if (!vm.isEnabled || vm.isMuted) {
          voicePulseDot.classList.add("muted");
        } else if (vm.isSpeaking) {
          voicePulseDot.classList.add("speaking");
        }
      }

      if (voiceModeLabel) {
        if (!vm.isEnabled) voiceModeLabel.textContent = "OFFLINE";
        else if (vm.isDeafened) voiceModeLabel.textContent = "DEAFENED";
        else if (vm.isMuted) voiceModeLabel.textContent = "MUTED";
        else if (vm.isSpeaking) voiceModeLabel.textContent = "TX LIVE";
        else voiceModeLabel.textContent = "ALL-CREW LIVE";
      }

      if (btnDeafenToggle) {
        btnDeafenToggle.classList.toggle("active", !!vm.isDeafened);
        btnDeafenToggle.textContent = vm.isDeafened ? "DEAFENED" : "DEAFEN";
      }

      const ccMic = document.getElementById("crew-comms-mic");
      if (ccMic) {
        ccMic.textContent = !vm.isEnabled ? "MIC OFF" : (vm.isMuted ? "MIC MUTED" : "MIC ON");
        ccMic.classList.toggle("is-on", !!(vm.isEnabled && !vm.isMuted));
      }

      if (activeSpeakersEl) {
        const tags = [];
        if (vm.isEnabled && !vm.isMuted && vm.isSpeaking) {
          const localName = (window.netManager && window.netManager.localPlayer) ? window.netManager.localPlayer.name : "YOU";
          tags.push(`<div class="active-speaker-tag speaker-local">[MIC] ${escapeHtml(localName)}</div>`);
        }
        if (window.netManager && window.netManager.remotePlayers) {
          for (const id in window.netManager.remotePlayers) {
            const rp = window.netManager.remotePlayers[id];
            if (rp && rp.isSpeaking && !rp.isMuted) {
              tags.push(`<div class="active-speaker-tag">[MIC] ${escapeHtml(rp.name || "CREW")}</div>`);
            }
          }
        }
        activeSpeakersEl.innerHTML = tags.join("");
      }

      updateLocalBadge();
    }

    async function refreshAudioDevicesAndCrewList() {
      const vm = window.voiceManager;
      if (!vm) return;

      if (audioDeviceSelect && typeof vm.getAudioInputDevices === "function") {
        const devices = await vm.getAudioInputDevices();
        const currentVal = vm.currentDeviceId || "default";
        audioDeviceSelect.innerHTML = `<option value="default">Default System Microphone</option>`;
        devices.forEach((dev, idx) => {
          const opt = document.createElement("option");
          opt.value = dev.deviceId || "default";
          opt.textContent = dev.label || `Microphone ${idx + 1}`;
          if (opt.value === currentVal) opt.selected = true;
          audioDeviceSelect.appendChild(opt);
        });
      }

      if (micSensSlider && micSensBadge) {
        micSensSlider.value = String(vm.vadThreshold || 12);
        micSensBadge.textContent = String(vm.vadThreshold || 12);
      }

      if (masterVoiceSlider && masterVolBadge) {
        const pct = Math.round((vm.masterVolume !== undefined ? vm.masterVolume : 1.0) * 100);
        masterVoiceSlider.value = String(pct);
        masterVolBadge.textContent = `${pct}%`;
      }

      if (crewVolList) {
        const remotes = (window.netManager && window.netManager.remotePlayers) ? Object.values(window.netManager.remotePlayers) : [];
        if (remotes.length === 0) {
          crewVolList.innerHTML = `<div style="font-size:11px;color:rgba(154,164,174,0.7);text-align:center;padding:8px;">No crewmates in room</div>`;
        } else {
          crewVolList.innerHTML = "";
          remotes.forEach((rp) => {
            const curVol = Math.round((vm.playerVolumes[rp.id] !== undefined ? vm.playerVolumes[rp.id] : 1.0) * 100);
            const row = document.createElement("div");
            row.className = "crewmate-vol-row";
            const volColor = safeHexColor(rp.color, "#efeee7");
            const volName = escapeHtml(rp.name || "Crew");
            row.innerHTML = `
              <span class="crewmate-vol-name" style="color:${volColor};">${volName}</span>
              <input type="range" min="0" max="200" value="${curVol}" class="settings-slider" style="flex:1;" />
              <span class="settings-val-badge" style="min-width:36px;text-align:right;">${curVol}%</span>
            `;
            const slider = row.querySelector("input");
            const badge = row.querySelector(".settings-val-badge");
            slider.addEventListener("input", () => {
              const v = Number(slider.value);
              badge.textContent = `${v}%`;
              vm.setPeerVolume(rp.id, v / 100);
            });
            crewVolList.appendChild(row);
          });
        }
      }
    }

    async function handleToggleVoiceComms(showErrorAlert = false) {
      const vm = window.voiceManager;
      if (!vm) return;
      if (!vm.isEnabled) {
        const ok = await vm.startMicrophone();
        if (!ok) {
          const msg = vm.lastError || "Unable to access microphone. Check browser permissions.";
          if (window.gameplay && typeof window.gameplay.showToast === "function") {
            window.gameplay.showToast(msg);
          }
          if (showErrorAlert) alert(msg);
        } else {
          await refreshAudioDevicesAndCrewList();
        }
      } else {
        vm.toggleMute();
      }
      syncVoiceUI();
    }

    if (window.voiceManager) {
      window.voiceManager.onStateChange(() => syncVoiceUI());
      syncVoiceUI();
    }

    window.crewComms = {
      toggleMic: () => handleToggleVoiceComms(false),
      openSettings: () => {
        refreshAudioDevicesAndCrewList();
        toggleSystemsSettingsModal(true);
      },
      state: () => {
        const vm = window.voiceManager;
        if (!vm || !vm.isEnabled) return "OFFLINE";
        return vm.isMuted ? "MUTED" : "MIC ON";
      }
    };

    if (btnLobbyVoice) {
      btnLobbyVoice.addEventListener("click", () => handleToggleVoiceComms(true));
    }
    if (btnVoiceMic) {
      btnVoiceMic.addEventListener("click", () => handleToggleVoiceComms(false));
    }
    if (audioDeviceSelect) {
      audioDeviceSelect.addEventListener("change", async () => {
        if (window.voiceManager) {
          await window.voiceManager.setAudioInputDevice(audioDeviceSelect.value);
          syncVoiceUI();
        }
      });
    }
    if (micSensSlider) {
      micSensSlider.addEventListener("input", () => {
        const v = Number(micSensSlider.value);
        if (micSensBadge) micSensBadge.textContent = String(v);
        if (window.voiceManager) window.voiceManager.setSensitivity(v);
      });
    }
    if (masterVoiceSlider) {
      masterVoiceSlider.addEventListener("input", () => {
        const v = Number(masterVoiceSlider.value);
        if (masterVolBadge) masterVolBadge.textContent = `${v}%`;
        if (window.voiceManager) window.voiceManager.setMasterVolume(v / 100);
      });
    }
    if (btnDeafenToggle) {
      btnDeafenToggle.addEventListener("click", () => {
        if (window.voiceManager) {
          window.voiceManager.setDeafened(!window.voiceManager.isDeafened);
          syncVoiceUI();
        }
      });
    }

    setInterval(() => {
      if (modalSettings && modalSettings.style.display === "flex" && window.voiceManager) {
        const lvl = window.voiceManager.getMicLevel();
        if (micMeterFill) micMeterFill.style.width = `${lvl}%`;
        if (micMeterText) micMeterText.textContent = `${lvl}%`;
      }
    }, 80);

    if (btnVoiceSettings) {
      btnVoiceSettings.addEventListener("click", () => {
        refreshAudioDevicesAndCrewList();
        toggleSystemsSettingsModal(true);
      });
    }
    if (btnLobbySettings) {
      btnLobbySettings.addEventListener("click", () => {
        refreshAudioDevicesAndCrewList();
        toggleSystemsSettingsModal(true);
      });
    }
    if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => toggleSystemsSettingsModal(false));
    if (modalSettings) {
      modalSettings.addEventListener("click", (e) => {
        if (e.target === modalSettings) toggleSystemsSettingsModal(false);
      });
    }

    const perfOverlay = document.getElementById("perf-overlay");
    if (perfOverlay) perfOverlay.addEventListener("click", () => toggleDiagnosticsOverlay());
    const btnDiagClose = document.getElementById("btn-diag-close");
    if (btnDiagClose) btnDiagClose.addEventListener("click", () => toggleDiagnosticsOverlay(false));
    const btnDiagOpenSettings = document.getElementById("btn-diag-open-settings");
    if (btnDiagOpenSettings) {
      btnDiagOpenSettings.addEventListener("click", () => {
        toggleDiagnosticsOverlay(false);
        toggleSystemsSettingsModal(true);
      });
    }

    // Settings Modal Tabs
    const settingsTabsBar = document.querySelector(".systems-tabs-bar");
    document.querySelectorAll(".sys-tab-btn").forEach((btn, index) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-tab");
        document.querySelectorAll(".sys-tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".sys-tab-content").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        if (settingsTabsBar) settingsTabsBar.style.setProperty("--tab-index", String(index));
        const targetEl = targetId ? document.getElementById(targetId) : null;
        if (targetEl) targetEl.classList.add("active");
      });
    });

    // Preset Profiles & Reset
    const PRESET_PROFILES = {
      cinematic: { renderScale: 120, cinematicPreset: "cinematic", fpsCap: 120, lightingQuality: "high", tickRate: 30, interpBuffer: "snappy" },
      balanced: { renderScale: isMobile ? 90 : 100, cinematicPreset: isMobile ? "off" : "balanced", fpsCap: 60, lightingQuality: isMobile ? "low" : "high", tickRate: isMobile ? 15 : 20, interpBuffer: "balanced" },
      potato: { renderScale: 70, cinematicPreset: "off", fpsCap: 30, lightingQuality: "low", tickRate: 15, interpBuffer: "smooth" }
    };
    document.querySelectorAll(".btn-preset[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const presetKey = btn.getAttribute("data-preset");
        const profile = PRESET_PROFILES[presetKey];
        if (!profile) return;
        Object.assign(perfSettings, profile);
        dynamicResolutionMultiplier = 1.0;
        lastDrsAdjustTime = performance.now();
        syncSettingsUI();
        savePerfSettings();
        applyPerfSettings();
        updatePerfDisplay();
      });
    });
    const btnResetDefaults = document.getElementById("btn-reset-defaults");
    if (btnResetDefaults) {
      btnResetDefaults.addEventListener("click", () => {
        perfSettings = Object.assign({}, defaultPerfSettings);
        dynamicResolutionMultiplier = 1.0;
        lastDrsAdjustTime = performance.now();
        syncSettingsUI();
        savePerfSettings();
        applyPerfSettings();
        updatePerfDisplay();
      });
    }

    // Graphics, Network & Display Controls
    let pendingPerfApplyRaf = 0;
    function queuePerfSettingsApply() {
      if (pendingPerfApplyRaf) return;
      pendingPerfApplyRaf = requestAnimationFrame(() => {
        pendingPerfApplyRaf = 0;
        applyPerfSettings();
        updatePerfDisplay();
      });
    }

    if (renderScaleSlider) {
      renderScaleSlider.addEventListener("input", () => {
        perfSettings.renderScale = Number(renderScaleSlider.value) || 100;
        // Treat a manual resolution choice as authoritative; the adaptive
        // scaler may still reduce it later if the GPU starts struggling.
        dynamicResolutionMultiplier = 1.0;
        lastDrsAdjustTime = performance.now();
        if (renderScaleBadge) renderScaleBadge.textContent = `${perfSettings.renderScale}% (${(perfSettings.renderScale / 100).toFixed(1)}x)`;
        savePerfSettings();
        syncPresetButtonsUI();
        queuePerfSettingsApply();
      });
    }
    if (selectCinematicPreset) {
      selectCinematicPreset.addEventListener("change", () => {
        perfSettings.cinematicPreset = selectCinematicPreset.value;
        savePerfSettings();
        syncPresetButtonsUI();
        applyPerfSettings();
        updatePerfDisplay();
      });
    }
    if (selectFpsCap) {
      selectFpsCap.addEventListener("change", () => {
        perfSettings.fpsCap = Number(selectFpsCap.value) || 0;
        if (fpsCapBadge) fpsCapBadge.textContent = perfSettings.fpsCap === 0 ? "UNCAPPED" : `${perfSettings.fpsCap} FPS`;
        savePerfSettings();
        syncPresetButtonsUI();
        applyPerfSettings();
      });
    }
    if (selectLightingQuality) {
      selectLightingQuality.addEventListener("change", () => {
        perfSettings.lightingQuality = selectLightingQuality.value;
        savePerfSettings();
        syncPresetButtonsUI();
        applyPerfSettings();
      });
    }
    if (fovSlider) {
      fovSlider.addEventListener("input", () => {
        perfSettings.fov = Number(fovSlider.value) || 62;
        if (fovBadge) fovBadge.textContent = `${perfSettings.fov}°`;
        savePerfSettings();
        applyPerfSettings();
      });
    }
    if (selectTickRate) {
      selectTickRate.addEventListener("change", () => {
        perfSettings.tickRate = Number(selectTickRate.value) || 25;
        savePerfSettings();
        syncPresetButtonsUI();
        applyPerfSettings();
        updatePerfDisplay();
      });
    }
    if (selectInterpBuffer) {
      selectInterpBuffer.addEventListener("change", () => {
        perfSettings.interpBuffer = selectInterpBuffer.value;
        savePerfSettings();
        syncPresetButtonsUI();
        applyPerfSettings();
      });
    }
    if (toggleDeltaCulling) {
      toggleDeltaCulling.addEventListener("change", () => {
        perfSettings.deltaCulling = toggleDeltaCulling.checked;
        savePerfSettings();
        applyPerfSettings();
        updatePerfDisplay();
      });
    }
    if (togglePerfPill) {
      togglePerfPill.addEventListener("change", () => {
        perfSettings.showPerfPill = togglePerfPill.checked;
        savePerfSettings();
        applyPerfSettings();
      });
    }
    if (toggleDiagOverlay) {
      toggleDiagOverlay.addEventListener("change", () => {
        toggleDiagnosticsOverlay(toggleDiagOverlay.checked);
      });
    }
    if (visorOpacitySlider) {
      visorOpacitySlider.addEventListener("input", () => {
        perfSettings.visorOpacity = Number(visorOpacitySlider.value);
        if (visorOpacityBadge) visorOpacityBadge.textContent = `${perfSettings.visorOpacity}%`;
        savePerfSettings();
        applyPerfSettings();
      });
    }
    if (toggleCrosshair) {
      toggleCrosshair.addEventListener("change", () => {
        perfSettings.showCrosshair = toggleCrosshair.checked;
        savePerfSettings();
        applyPerfSettings();
      });
    }
    syncSettingsUI();

    function syncLocalRigWithServer() {
      const lp = window.netManager && window.netManager.localPlayer;
      if (!lp) return;
      const normRole = window.InterfellasRoles
        ? window.InterfellasRoles.normalizeRole(lp.role, "commander")
        : (lp.role || "commander");
      lp.role = normRole;
      if (localCrew && (localCrew.role !== normRole || localCrew.color !== lp.color)) {
        buildLocalAstronaut(lp.color || "#c9f04b", normRole);
      }
      if (typeof window.syncLobbySelectionUI === "function") window.syncLobbySelectionUI();
      if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();
    }

    let groundCrewModelsPreloadStarted = false;
    function preloadGroundCrewModels(players) {
      if (groundCrewModelsPreloadStarted || !window.glbManager || !Array.isArray(players)) return;
      const hasGround = players.some((p) => p && (
        p.team === "ground" ||
        (window.InterfellasRoles && window.InterfellasRoles.isGroundRole(p.role))
      ));
      if (!hasGround) return;
      groundCrewModelsPreloadStarted = true;
      ["crew_a", "crew_b"].forEach((id) => {
        const entry = window.glbManager.catalog && window.glbManager.catalog[id];
        if (entry && typeof window.glbManager.loadGLB === "function") {
          window.glbManager.loadGLB(entry.file).catch(() => {});
        }
      });
    }

    function applySoloLobbyChrome(isSolo) {
      const shell = document.querySelector(".lobby-staging-shell");
      if (shell) shell.style.gridTemplateColumns = isSolo ? "minmax(0, 1fr)" : "";
      const manifest = document.querySelector(".lobby-manifest-stage");
      if (manifest) manifest.style.display = isSolo ? "none" : "";
      const copyButton = document.getElementById("btn-copy-invite");
      if (copyButton) copyButton.style.display = isSolo ? "none" : "";
      const voiceButton = document.getElementById("btn-lobby-voice");
      if (voiceButton) voiceButton.style.display = isSolo ? "none" : "";
      const chatBox = document.querySelector(".lobby-chat-box");
      if (chatBox) chatBox.style.display = isSolo ? "none" : "";
      const roomLabel = document.querySelector(".room-code-badge .field-label");
      if (roomLabel) roomLabel.textContent = isSolo ? "MODE" : "ROOM CODE";
      const roomCode = document.getElementById("lobby-room-code");
      if (roomCode && isSolo) roomCode.textContent = "SOLO";
    }

    // Network Callbacks
    window.netManager.on("room_created", (data) => {
      const isSolo = !!(data.solo || (data.room && data.room.isSolo));
      const autoStart = isSolo && !!window.netManager.soloAutoStart;
      window.netManager.soloAutoStart = false;
      playScreenVeil();
      document.body.classList.remove("menu-active");
      screenMenu.style.display = "none";
      syncLocalRigWithServer();
      updateLocalBadge();

      // Only the guided Cadet flow auto-launches. Normal solo play opens the
      // staging deck so the pilot chooses a mission and difficulty first.
      if (autoStart) {
        screenLobby.style.display = "none";
        screenGame.style.display = "none";
        window.netManager.startGame();
        return;
      }

      screenLobby.style.display = "flex";
      screenGame.style.display = "none";
      applySoloLobbyChrome(isSolo);
      if (lobbyRoomCode) lobbyRoomCode.textContent = isSolo ? "SOLO" : data.roomId;
      updateLobbySlots(data.room.players, data.hostId, data.room.status);
      renderLobbyMission(data.room.mission);
    });

    window.netManager.on("room_joined", (data) => {
      if (inputCode) inputCode.value = "";
      playScreenVeil();
      document.body.classList.remove("menu-active");
      screenMenu.style.display = "none";
      screenLobby.style.display = "flex";
      screenGame.style.display = "none";
      if (lobbyRoomCode) lobbyRoomCode.textContent = data.roomId;
      applySoloLobbyChrome(false);
      updateLobbySlots(data.room.players, data.hostId, data.room.status);
      renderLobbyMission(data.room.mission);
      updateLocalBadge();

      if (data && data.room && data.room.status === "playing") {
        if (isGameStarted) {
          syncLocalRigWithServer();
          return;
        }
        window.netManager.emitEvent("game_started", data.room);
        return;
      }

      screenMenu.style.display = "none";
      screenLobby.style.display = "flex";
      screenGame.style.display = "none";
      syncLocalRigWithServer();
    });

    window.netManager.on("join_error", (err) => {
      if (window.location.search && window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", window.location.pathname);
      }
      const missingRoom = err && typeof err.message === "string" && err.message.includes("does not exist");
      const region = window.LunaspisRegions && window.LunaspisRegions.getCurrentRegion();
      const other = window.LunaspisRegions && window.LunaspisRegions.getOtherRegion();
      let regionHint = "";
      if (missingRoom && window.LunaspisRegions) {
        if (region && other) {
          regionHint =
            `\n\nYou are on the ${region.label} server. Room codes only exist on the region where the room was created — ` +
            `click ${other.label} in the SERVER toggle at the top-right and it will retry this code there.`;
        } else {
          regionHint =
            `\n\nYou are on the main server. Room codes only exist on the server where they were created — ` +
            `click ASIA or US in the SERVER toggle at the top-right to retry this code on that region.`;
        }
      }
      alert((err.message || "Failed to join room") + regionHint);
    });

    window.netManager.on("room_update", (data) => {
      syncLocalRigWithServer();
      preloadGroundCrewModels(data.players);
      updateLobbySlots(data.players, data.hostId, data.status);
      renderLobbyMission(data.mission);
      if (window.shuttleGame && window.shuttleGame.isActive) {
        window.shuttleGame.onRoomUpdate(data);
      }
      const hudRoom = document.getElementById("hud-room-code");
      if (hudRoom) {
        if (data.isSolo) {
          hudRoom.textContent = "SOLO";
          hudRoom.title = "Single-player expedition";
        } else {
          hudRoom.textContent = data.roomId || "------";
          hudRoom.title = data.roomId ? `Expedition Room: ${data.roomId}` : "";
        }
      }
      updateLocalBadge();
      if (window.gameplay) {
        if (data.tasks) window.gameplay.updateTaskBar(data.tasks);
        if (typeof window.gameplay.updateTaskListUI === "function") window.gameplay.updateTaskListUI();
      }
      if (window.spaceCenter) {
        const curRoleNow = window.netManager && window.netManager.localPlayer ? window.netManager.localPlayer.role : null;
        if (window._lastSyncedRoleInMain && curRoleNow && window._lastSyncedRoleInMain !== curRoleNow && typeof window.spaceCenter.syncLocalRoleChange === "function") {
          window.spaceCenter.syncLocalRoleChange();
        }
        window._lastSyncedRoleInMain = curRoleNow;
        if (typeof window.spaceCenter._renderGroundHUD === "function") {
          window.spaceCenter._renderGroundHUD(true);
        }
        if (window.spaceCenter.lccConsoleOpen && typeof window.spaceCenter._renderLccConsole === "function") {
          window.spaceCenter._renderLccConsole();
        }
      }
      syncSpaceGamesLock();
      if (typeof window.renderSwapBanners === "function") {
        window.renderSwapBanners();
      }
      if (window.launchCutscene && typeof window.launchCutscene.updateCrewStatus === "function") {
        window.launchCutscene.updateCrewStatus(data.mission);
      }
      if (window.dockingSim && typeof window.dockingSim.updateCrewStatus === "function") {
        window.dockingSim.updateCrewStatus(data.mission);
      }
    });

    window.netManager.on("roles_randomized", () => {
      syncLocalRigWithServer();
      updateLocalBadge();
      if (window.spaceAudio) window.spaceAudio.playClick();
      if (window.spaceCenter && typeof window.spaceCenter.syncLocalRoleChange === "function") {
        window.spaceCenter.syncLocalRoleChange();
      }
      syncSpaceGamesLock();
      if (window.gameplay) {
        if (typeof window.gameplay.updateTaskListUI === "function") window.gameplay.updateTaskListUI();
        if (typeof window.gameplay.showToast === "function") {
          const meta = window.InterfellasRoles ? window.InterfellasRoles.getRoleMeta(window.netManager.localPlayer.role) : { label: "CREW" };
          window.gameplay.showToast(`ROLES RANDOMIZED · YOUR ASSIGNMENT: ${meta.label}`);
        }
      }
      if (typeof window.renderSwapBanners === "function") window.renderSwapBanners();
    });

    window.netManager.on("role_swap_requested", (req) => {
      if (window.spaceAudio) window.spaceAudio.playClick();
      if (typeof window.renderSwapBanners === "function") window.renderSwapBanners(req);
      if (window.gameplay && typeof window.gameplay.showToast === "function" && req) {
        const toMeta = window.InterfellasRoles ? window.InterfellasRoles.getRoleMeta(req.fromRole) : { short: "CREW" };
        window.gameplay.showToast(`SWAP REQUEST FROM ${req.fromName || "CREW"} (${toMeta.short})`);
      }
    });

    window.netManager.on("role_swap_resolved", (payload) => {
      syncLocalRigWithServer();
      updateLocalBadge();
      if (window.spaceCenter && typeof window.spaceCenter.syncLocalRoleChange === "function") {
        window.spaceCenter.syncLocalRoleChange();
      }
      syncSpaceGamesLock();
      if (window.gameplay && typeof window.gameplay.updateTaskListUI === "function") {
        window.gameplay.updateTaskListUI();
      }
      if (typeof window.renderSwapBanners === "function") window.renderSwapBanners();
      if (window.gameplay && typeof window.gameplay.showToast === "function" && payload) {
        if (payload.accepted) {
          const rA = window.InterfellasRoles ? window.InterfellasRoles.getRoleMeta(payload.newFromRole).short : payload.newFromRole;
          const rB = window.InterfellasRoles ? window.InterfellasRoles.getRoleMeta(payload.newToRole).short : payload.newToRole;
          window.gameplay.showToast(`ROLE SWAP CONFIRMED: ${payload.fromName} -> ${rA} | ${payload.toName} -> ${rB}`);
        } else {
          window.gameplay.showToast(`ROLE SWAP DECLINED BY ${payload.toName || "CREW"}`);
        }
      }
    });

    window.netManager.on("role_swap_error", (err) => {
      if (typeof window.renderSwapBanners === "function") window.renderSwapBanners();
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast((err && err.message) || "Role swap unavailable.");
      }
    });

    window.netManager.on("ground_support_event", (ev) => {
      if (!ev) return;
      if (window.spaceCenter) {
        if (typeof window.spaceCenter._renderGroundHUD === "function") window.spaceCenter._renderGroundHUD();
        if (window.spaceCenter.lccConsoleOpen && typeof window.spaceCenter._renderLccConsole === "function") {
          window.spaceCenter._renderLccConsole();
        }
      }
      if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();
      if (window.dockingSim && typeof window.dockingSim.updateCrewStatus === "function") {
        window.dockingSim.updateCrewStatus();
      }
      if (window.gameplay) {
        if (typeof window.gameplay.updateTaskListUI === "function") window.gameplay.updateTaskListUI();
        if (typeof window.gameplay.showToast === "function") {
          const actor = ev.byName || "EARTH CONTROL";
          if (ev.type === "go_nogo_poll") {
            window.gameplay.showToast("ASKING EARTH CONTROL FOR LAUNCH OK · 8s TO REPLY");
          } else if (ev.type === "go_nogo_launch") {
            window.gameplay.showToast(`${actor}: LAUNCH CLEARED FOR LIFTOFF!`);
          } else if (ev.type === "docking_clearance") {
            window.gameplay.showToast(`${actor}: STATION PARKING LANE CLEARED`);
          } else if (ev.type === "dsn_lock") {
            window.gameplay.showToast(`${actor}: EARTH DISH SIGNAL LOCKED`);
          } else if (ev.type === "power_route") {
            window.gameplay.showToast(`${actor}: SOLAR POWER CHECK COMPLETE`);
          } else if (ev.type === "science_downlink") {
            window.gameplay.showToast(`${actor}: SCIENCE DATA SHARING READY`);
          } else if (ev.type === "ping_room" && ev.ping) {
            window.gameplay.showToast(`EARTH ALERT -> ${String(ev.ping.roomLabel || ev.ping.roomId || "HUB").toUpperCase()}`);
          } else if (ev.type === "role_locked") {
            const owner = ev.requiredRoleLabel || "The assigned Earth Control role";
            window.gameplay.showToast(`[ROLE LOCK] ${String(owner).toUpperCase()} ONLY · ${ev.message || "THIS CONTROL IS NOT YOURS"}`);
          } else if (ev.type === "board_blocked_ground" && ev.message) {
            window.gameplay.showToast(ev.message);
          }
        }
      }
    });

    window.netManager.on("game_started", (data) => {
      playScreenVeil();
      document.body.classList.remove("menu-active");
      screenMenu.style.display = "none";
      screenLobby.style.display = "none";
      preloadGroundCrewModels(data && data.players);

      const mission = (data && data.mission)
        || (window.netManager.roomState && window.netManager.roomState.mission)
        || (typeof window.netManager.getMission === "function" ? window.netManager.getMission() : null);

      if (isArtemisMission(mission) || (data && data.flightProfile === "artemis")) {
        startArtemisFlight(mission);
        return;
      }

      const isShuttleOps = !!((data && data.opsMode === "shuttle_flight") || (mission && mission.opsMode === "shuttle_flight"));
      if (isShuttleOps && window.shuttleGame) {
        cleanupGameWorldForLobby();
        isGameStarted = true;
        window.isGameStarted = true;
        document.body.classList.add("game-active", "shuttle-mode-active");
        syncSpaceGamesLock();
        screenGame.style.display = "none";
        const resBar = document.getElementById("lunaspis-resource-meters");
        if (resBar) resBar.style.display = "none";
        window.shuttleGame.start({
          renderer,
          net: window.netManager,
          canReturnLobby: !!(window.netManager && window.netManager.isHost),
          onLeave: leaveCurrentRoom,
          onReturnToLobby: () => {
            if (window.netManager && window.netManager.isHost && typeof window.netManager.returnToLobby === "function") {
              window.netManager.returnToLobby();
            }
          }
        });
        return;
      }

      if (window.shuttleGame && window.shuttleGame.isActive) {
        window.shuttleGame.exit();
      }
      document.body.classList.remove("shuttle-mode-active");

      const startStationOperations = () => {
        isGameStarted = true;
        window.isGameStarted = true;
        document.body.classList.add("game-active");
        syncSpaceGamesLock();
        screenGame.style.display = "flex";
        syncResponsiveHudState();
        const resBar = document.getElementById("lunaspis-resource-meters");
        if (resBar) {
          if (window.gameplay && typeof window.gameplay._applyResourceBarLayout === "function") {
            window.gameplay._applyResourceBarLayout(resBar);
          } else {
            resBar.style.display = "flex";
          }
        }

        // Restore the shared mission phase: gantry boarding, ascent, docking,
        // or the station interior for late joiners.
        if (window.spaceCenter && typeof window.spaceCenter.enterSpaceCenter === "function") {
          window.spaceCenter.enterSpaceCenter(mission);
        } else {
          if (window.shipInterior) {
            window.shipInterior.show();
          }
          if (window.localCrew && window.localCrew.group) {
            window.localCrew.group.visible = true;
            window.localCrew.group.position.set(0.0, 0.0, 2.0);
            window.localCrew.group.rotation.y = Math.PI;
            camYaw = Math.PI;
          }
          camPitch = -0.18;
        }

        const phase = mission && mission.phase ? mission.phase : "gantry";
        const banner = document.getElementById("launch-countdown-banner");
        if (banner) {
          if (phase === "station") {
            banner.textContent = "STATION INTERIOR — ALL CREW ABOARD. BEGIN MISSION OPERATIONS.";
          } else if (phase === "docking") {
            banner.textContent = "STEP 3: SPACE RENDEZVOUS — LINE UP WITH THE STATION DOOR AND CONNECT";
          } else if (phase === "launch") {
            banner.textContent = "STEP 2: ROCKET LAUNCH — HOLD ON TIGHT, HEADING TO SPACE!";
          } else {
            banner.textContent = "STEP 1: LAUNCH PAD — FOLLOW THE GLOWING PATH TO BOARD THE SPACESHIP";
          }
          banner.style.display = "flex";
          setTimeout(() => { banner.style.display = "none"; }, 3000);
        }

        if (window.gameplay) {
          window.gameplay.updateTaskListUI();
          window.gameplay.updateTaskBar();
        }

        showMissionBriefing(mission);
        // A late joiner can enter while the merged Shuttle flight is already
        // under way; switch straight into the flight view.
        syncMergedShuttleView(mission);
      };

      // Let gameplay's game_started listener apply the authoritative mission
      // design before the three.js launch/docking scenes read it for payload
      // selection. Network callbacks run synchronously in registration order;
      // main.js registers before gameplay.js, so defer one turn.
      setTimeout(startStationOperations, 0);
    });

    let specialistFlightLastStage = null;
    window.netManager.on("mission_update", (payload) => {
      if (!payload || !payload.mission) return;
      if (!window.isGameStarted) return;
      if (isArtemisMission(payload.mission) || payload.action === "artemis_result") {
        if (window.artemisGame && window.artemisGame.isActive && payload.room) window.artemisGame.onRoomUpdate(payload.room);
        return;
      }
      if (payload.action === "specialist_flight" && payload.mission.specialistFlight) {
        const stage = payload.mission.specialistFlight.stage;
        const messages = { planning: "PLANET FLIGHT: PLAN YOUR BURN", coast: "PLANET FLIGHT: TRAJECTORY UNDERWAY", encounter: "PLANET FLIGHT: PLAN ORBIT INSERTION", complete: "PLANET FLIGHT: ORBIT ESTIMATE ACHIEVED", missed: "PLANET FLIGHT: REVIEW THE RESULT" };
        if (stage !== specialistFlightLastStage && messages[stage] && window.gameplay && typeof window.gameplay.showToast === "function") window.gameplay.showToast(messages[stage] + " · OPEN SOLAR [O]");
        specialistFlightLastStage = stage;
      }
      // Apply the shared design first: launch/docking scenes read the current
      // payload bus and orbit while advancing their phase.
      if (window.gameplay) {
        if (!window.gameplay.activeTask && typeof window.gameplay.applyMissionDefinition === "function") {
          window.gameplay.applyMissionDefinition(payload.mission);
        } else if (typeof window.gameplay.syncMissionUi === "function") {
          window.gameplay.syncMissionUi(payload.mission);
        }
      }
      // Merged main mission: enter/leave the interactive Shuttle view before the
      // Space Center applies the phase (launch -> Shuttle, docking -> station).
      syncMergedShuttleView(payload.mission);
      if (window.spaceCenter && typeof window.spaceCenter.applyMissionState === "function") {
        window.spaceCenter.applyMissionState(payload.mission, payload);
      }
      if (typeof window.renderHudCrewRoster === "function") {
        window.renderHudCrewRoster();
      }
      if (window.launchCutscene && typeof window.launchCutscene.updateCrewStatus === "function") {
        window.launchCutscene.updateCrewStatus(payload.mission);
      }
      if (window.dockingSim && typeof window.dockingSim.updateCrewStatus === "function") {
        window.dockingSim.updateCrewStatus();
      }
      if (
        payload.playerId &&
        payload.playerId !== window.netManager.socketId &&
        window.gameplay &&
        typeof window.gameplay.showToast === "function"
      ) {
        if (payload.action === "board") {
          window.gameplay.showToast(`${payload.playerName || "TEAMMATE"} BOARDED THE SPACESHIP`);
        } else if (payload.action === "dock") {
          window.gameplay.showToast(
            payload.mission.dockLocked
              ? "TEAM LOCKED THE BOARDING BRIDGE"
              : "BOARDING BRIDGE PULLED BACK"
          );
        } else if (payload.action === "reset") {
          window.gameplay.showToast(`${payload.playerName || "TEAMMATE"} BROUGHT THE TEAM BACK TO THE LAUNCH PAD`);
        } else if (payload.action === "design_revised" || payload.action === "design_sync") {
          window.gameplay.showToast(`${payload.playerName || "TEAMMATE"} UPDATED THE MISSION PLAN`);
        }
      }
    });

    const chatInput = document.getElementById("lobby-chat-input");
    const chatSend = document.getElementById("lobby-chat-send");
    if (chatInput && chatSend) {
      const sendLobbyChat = () => {
        const t = chatInput.value.trim();
        if (t) {
          window.netManager.sendChat(t);
          chatInput.value = "";
        }
      };
      chatSend.addEventListener("click", sendLobbyChat);
      chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendLobbyChat(); });
    }

    // Shared in-game crew comms: Earth Control <-> Flight Crew text channel,
    // quick callouts, and mic access. Voice itself is one global crew channel.
    const crewCommsPanel = document.getElementById("crew-comms-panel");
    const crewCommsToggle = document.getElementById("crew-comms-toggle");
    const crewCommsLog = document.getElementById("crew-comms-log");
    const crewCommsInput = document.getElementById("crew-comms-input");
    const crewCommsBadge = document.getElementById("crew-comms-badge");
    const crewCommsVoiceBtn = document.getElementById("btn-crew-comms");
    const crewCommsVoiceLabel = document.getElementById("crew-comms-voice-label");
    let crewCommsOpen = false;
    let crewCommsUnread = 0;

    function setCrewCommsBadge(value) {
      crewCommsUnread = Math.max(0, value);
      if (!crewCommsBadge) return;
      crewCommsBadge.hidden = crewCommsUnread <= 0;
      crewCommsBadge.textContent = String(Math.min(99, crewCommsUnread));
    }

    function setCrewCommsOpen(open) {
      if (!crewCommsPanel) return;
      crewCommsOpen = !!open;
      crewCommsPanel.setAttribute("aria-hidden", crewCommsOpen ? "false" : "true");
      if (crewCommsToggle) crewCommsToggle.setAttribute("aria-expanded", String(crewCommsOpen));
      if (crewCommsVoiceLabel) crewCommsVoiceLabel.textContent = crewCommsOpen ? "CLOSE" : "OPEN";
      if (crewCommsOpen) {
        setCrewCommsBadge(0);
        if (crewCommsInput) setTimeout(() => crewCommsInput.focus(), 40);
        if (crewCommsLog) crewCommsLog.scrollTop = crewCommsLog.scrollHeight;
      }
    }

    function appendCrewCommsMessage(comm) {
      if (!crewCommsLog) return;
      const data = comm || {};
      const empty = crewCommsLog.querySelector(".cc-empty");
      if (empty) empty.remove();
      const rolesApi = window.InterfellasRoles;
      const roleId = rolesApi && typeof rolesApi.normalizeRole === "function"
        ? rolesApi.normalizeRole(data.role, "commander")
        : String(data.role || "commander");
      const isGround = data.team === "ground" || (rolesApi && typeof rolesApi.isGroundRole === "function" && rolesApi.isGroundRole(roleId));
      const roleShort = rolesApi && typeof rolesApi.getRoleMeta === "function"
        ? rolesApi.getRoleMeta(roleId).short
        : String(roleId).slice(0, 4).toUpperCase();
      const localName = window.netManager && window.netManager.localPlayer ? window.netManager.localPlayer.name : "";
      const isSelf = !!localName && data.sender === localName;

      const row = document.createElement("div");
      row.className = `cc-msg ${isGround ? "is-ground" : "is-flight"}${isSelf ? " is-self" : ""}`;
      const head = document.createElement("div");
      head.className = "cc-msg-head";
      const who = document.createElement("span");
      who.className = "cc-msg-name";
      who.textContent = String(data.sender || "CREW");
      const role = document.createElement("span");
      role.className = "cc-msg-role";
      role.textContent = `${isGround ? "EARTH" : "FLIGHT"} · ${roleShort}`;
      const stamp = document.createElement("time");
      const ts = Number(data.timestamp) || Date.now();
      stamp.textContent = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const headLeft = document.createElement("span");
      headLeft.appendChild(who);
      headLeft.appendChild(document.createTextNode(" "));
      headLeft.appendChild(role);
      head.append(headLeft, stamp);
      const text = document.createElement("div");
      text.className = "cc-msg-text";
      text.textContent = String(data.text || "");
      row.append(head, text);
      crewCommsLog.appendChild(row);
      crewCommsLog.scrollTop = crewCommsLog.scrollHeight;

      if (!crewCommsOpen && !isSelf) setCrewCommsBadge(crewCommsUnread + 1);
    }

    function sendCrewComms(text) {
      const clean = String(text || "").trim();
      if (!clean || !window.netManager) return;
      window.netManager.sendChat(clean);
      if (crewCommsInput) crewCommsInput.value = "";
    }

    if (crewCommsToggle) {
      crewCommsToggle.addEventListener("click", () => setCrewCommsOpen(!crewCommsOpen));
    }
    if (crewCommsVoiceBtn) {
      crewCommsVoiceBtn.addEventListener("click", () => setCrewCommsOpen(!crewCommsOpen));
    }
    const crewCommsClose = document.getElementById("crew-comms-close");
    if (crewCommsClose) crewCommsClose.addEventListener("click", () => setCrewCommsOpen(false));
    const crewCommsSend = document.getElementById("crew-comms-send");
    if (crewCommsSend) crewCommsSend.addEventListener("click", () => sendCrewComms(crewCommsInput ? crewCommsInput.value : ""));
    if (crewCommsInput) {
      crewCommsInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          sendCrewComms(crewCommsInput.value);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setCrewCommsOpen(false);
        }
        e.stopPropagation();
      });
    }
    const crewCommsQuick = document.getElementById("crew-comms-quick");
    if (crewCommsQuick) {
      crewCommsQuick.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-msg]");
        if (btn) sendCrewComms(btn.dataset.msg);
      });
    }
    const crewCommsMic = document.getElementById("crew-comms-mic");
    if (crewCommsMic) {
      crewCommsMic.addEventListener("click", () => handleToggleVoiceComms(false));
    }
    if (window.crewComms) {
      window.crewComms.openPanel = () => setCrewCommsOpen(true);
      window.crewComms.closePanel = () => setCrewCommsOpen(false);
      window.crewComms.togglePanel = () => setCrewCommsOpen(!crewCommsOpen);
      window.crewComms.send = sendCrewComms;
    }

    window.netManager.on("chat_message", (comm) => {
      appendLobbyChat(comm);
      appendCrewCommsMessage(comm);
      if (window.shuttleGame && window.shuttleGame.isActive) {
        window.shuttleGame.onChat(comm);
      }
    });

    window.netManager.on("disconnected", () => {
      setCrewCommsOpen(false);
    });

    window.netManager.on("rejoin_failed", () => {
      setCrewCommsOpen(false);
      if (isGameStarted || (window.shuttleGame && window.shuttleGame.isActive)) {
        cleanupGameWorldForLobby();
        if (screenLobby) screenLobby.style.display = "none";
        if (screenGame) screenGame.style.display = "none";
        if (screenMenu) screenMenu.style.display = "flex";
      }
    });
  }

  function renderLobbyMission(mission) {
    const cards = document.getElementById("lobby-mission-cards");
    const difficultyRow = document.getElementById("lobby-difficulty-pills");
    const difficultyContainer = document.getElementById("lobby-difficulty-row");
    const modeBar = document.getElementById("lobby-ops-mode-bar");
    const selectedLabel = document.getElementById("lobby-mission-selected");
    const hint = document.getElementById("lobby-mission-hint");
    const missionTip = document.getElementById("lobby-mission-tip");
    const difficultyHint = document.getElementById("lobby-difficulty-hint");
    if (!cards) return;

    const opsMode = (mission && mission.opsMode === "shuttle_flight") ? "shuttle_flight" : "iss_expedition";
    const status = window.netManager && window.netManager.roomState
      ? window.netManager.roomState.status
      : "lobby";
    const isHost = !!(window.netManager && window.netManager.isHost);
    const canSelect = isHost && status === "lobby";

    if (modeBar) {
      modeBar.querySelectorAll("[data-ops-mode]").forEach((btn) => {
        const mode = btn.getAttribute("data-ops-mode");
        btn.classList.toggle("active", mode === opsMode);
        btn.disabled = !canSelect;
        btn.onclick = () => {
          if (!canSelect) return;
          window.netManager.selectMission(undefined, undefined, mode);
          if (window.spaceAudio) window.spaceAudio.playClick();
        };
      });
    }

    const btnStart = document.getElementById("btn-start-mission");
    if (opsMode === "shuttle_flight") {
      if (selectedLabel) {
        selectedLabel.textContent = "SHUTTLE · LAUNCH TO LANDING";
      }
      if (hint) {
        hint.textContent = canSelect ? "HOST PICKS" : "HOST'S PICK";
        hint.style.color = canSelect ? "#67e8f9" : "#9aa4ae";
      }
      if (difficultyContainer) difficultyContainer.style.display = "none";
      if (missionTip) missionTip.style.display = "none";
      if (difficultyHint) difficultyHint.style.display = "none";
      cards.classList.remove("mission-pick-grid", "is-lobby");
      cards.innerHTML = `
        <div class="shuttle-mode-card">
          <div class="shuttle-mode-card-title">SPACE SHUTTLE · CREW FLIGHT</div>
          <div class="shuttle-mode-card-desc">LAUNCH → ORBIT → LAND</div>
          <div class="shuttle-mode-seats">
            <div><strong>CAPT</strong> · LAUNCH · RE-ENTRY · WHEELS</div>
            <div><strong>PILOT</strong> · ENGINES · STEERING · BRAKES</div>
            <div><strong>SPEC 1</strong> · CARGO · SATELLITE</div>
            <div><strong>SPEC 2</strong> · TIME · GUIDE</div>
          </div>
        </div>
      `;
      if (btnStart && isHost && status === "lobby") {
        btnStart.textContent = "FLY SPACE SHUTTLE →";
      } else if (btnStart && status === "playing") {
        btnStart.textContent = "JOIN SHUTTLE FLIGHT →";
      }
      return;
    }

    if (difficultyContainer) difficultyContainer.style.display = "flex";

    lastLobbyMission = mission || lastLobbyMission;

    const catalog = window.gameplay && typeof window.gameplay.getScenarioCatalog === "function"
      ? window.gameplay.getScenarioCatalog()
      : [];
    const difficulties = window.gameplay && typeof window.gameplay.getDifficultyCatalog === "function"
      ? window.gameplay.getDifficultyCatalog()
      : [];
    if (!catalog.length) return;

    const selectedId = (mission && mission.scenarioId) || "lunar_south_pole";
    const selectedDifficultyId = (mission && mission.difficultyId) || "engineer";
    const selected = catalog.find((scenario) => scenario.id === selectedId) || catalog[0];
    const selectedPresentation = window.gameplay && typeof window.gameplay.getMissionPresentation === "function"
      ? window.gameplay.getMissionPresentation(selected.id)
      : { destination: selected.badge, title: selected.code };

    if (selectedLabel && selected) {
      selectedLabel.textContent = `${selectedPresentation.destination} · ${selectedPresentation.title}`;
    }
    if (hint) {
      hint.textContent = canSelect ? "HOST PICKS" : "HOST'S PICK";
      hint.style.color = canSelect ? "#67e8f9" : "#9aa4ae";
    }

    if (missionTip) {
      missionTip.innerHTML = `
        <span class="lobby-flight-plan">
          <span class="lobby-flight-plan__label">FLIGHT PLAN</span>
          <span class="lobby-flight-plan__route">
            <span>LAUNCH</span><i>→</i><span>ORBIT</span><i>→</i><span>DOCK</span>
          </span>
        </span>
      `;
      missionTip.style.display = "block";
    }

    const starterIds = window.gameplay && typeof window.gameplay.getStarterMissionIds === "function"
      ? window.gameplay.getStarterMissionIds()
      : catalog.slice(0, 3).map((scenario) => scenario.id);
    const starterCount = Math.max(starterIds.length, 1);
    let visibleIds = lobbyMissionsExpanded
      ? catalog.map((scenario) => scenario.id)
      : starterIds.filter((id) => catalog.some((scenario) => scenario.id === id));
    if (!lobbyMissionsExpanded && selected && !visibleIds.includes(selected.id)) {
      visibleIds = [selected.id, ...visibleIds.filter((id) => id !== selected.id)].slice(0, starterCount);
    }

    cards.classList.add("mission-pick-grid", "is-lobby");
    const cardHtml = visibleIds
      .map((id) => catalog.find((scenario) => scenario.id === id))
      .filter(Boolean)
      .map((scenario) => window.gameplay.renderMissionPickCard(scenario, {
        active: scenario.id === selected.id,
        canSelect
      }))
      .join("");
    const moreMissions = catalog.length > starterCount
      ? `<button type="button" class="mission-pick-more" data-more-missions aria-expanded="${lobbyMissionsExpanded}" aria-controls="lobby-mission-cards">
          ${lobbyMissionsExpanded
            ? `SHOW ${starterCount} STARTERS`
            : `<b>ALL ${catalog.length}</b> MISSIONS`}
        </button>`
      : "";
    cards.innerHTML = `${cardHtml}${moreMissions}`;

    const moreMissionsBtn = cards.querySelector("[data-more-missions]");
    if (moreMissionsBtn) {
      moreMissionsBtn.addEventListener("click", () => {
        lobbyMissionsExpanded = !lobbyMissionsExpanded;
        if (window.spaceAudio) window.spaceAudio.playClick();
        renderLobbyMission(lastLobbyMission);
      });
    }

    if (difficultyRow) {
      difficultyRow.innerHTML = difficulties.map((difficulty) => {
        const active = difficulty.id === selectedDifficultyId;
        return `
          <button type="button" data-difficulty-id="${escapeHtml(difficulty.id)}" title="${escapeHtml(difficulty.desc)}" style="
            padding:6px 12px;
            border-radius:999px;
            border:1px solid ${active ? "#d0a15c" : "rgba(255,255,255,0.14)"};
            background:${active ? "rgba(208,161,92,0.16)" : "rgba(255,255,255,0.03)"};
            color:${active ? "#fde68a" : "#9aa4ae"};
            font-family:monospace;
            font-size:11px;
            font-weight:700;
            letter-spacing:0.6px;
            cursor:${canSelect ? "pointer" : "default"};
          ">${escapeHtml(String(difficulty.name || difficulty.id).split("(")[0].trim().toUpperCase())}</button>
        `;
      }).join("");
    }

    if (difficultyHint) {
      const chosen = difficulties.find((entry) => entry.id === selectedDifficultyId);
      if (chosen) {
        const compactTips = {
          cadet: "MORE BUDGET · GENTLE HINTS",
          engineer: "REAL LIMITS · BALANCED",
          director: "TIGHT BUDGET · STRICT"
        };
        difficultyHint.textContent = compactTips[chosen.id] || chosen.desc;
        difficultyHint.title = chosen.desc;
        difficultyHint.style.display = "block";
      } else {
        difficultyHint.style.display = "none";
      }
    }

    cards.querySelectorAll("[data-scenario-id]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!canSelect) return;
        window.netManager.selectMission(button.getAttribute("data-scenario-id"));
        if (window.spaceAudio) window.spaceAudio.playClick();
      });
    });
    if (difficultyRow) {
      difficultyRow.querySelectorAll("[data-difficulty-id]").forEach((button) => {
        button.addEventListener("click", () => {
          if (!canSelect) return;
          window.netManager.selectMission(undefined, button.getAttribute("data-difficulty-id"));
          if (window.spaceAudio) window.spaceAudio.playClick();
        });
      });
    }

    if (btnStart && status === "lobby" && isHost && selected) {
      btnStart.textContent = `LAUNCH ${selected.code} →`;
    } else if (btnStart && status === "playing") {
      btnStart.textContent = "JOIN ACTIVE MISSION";
    }
  }

  function showMissionBriefing(mission) {
    const overlay = document.getElementById("mission-briefing-overlay");
    if (!overlay || !mission) return;
    const title = document.getElementById("briefing-title");
    const meta = document.getElementById("briefing-meta");
    const summary = document.getElementById("briefing-summary");
    const art = document.getElementById("briefing-art");
    const list = document.getElementById("briefing-objectives");
    const btnBegin = document.getElementById("btn-briefing-begin");

    if (title) {
      title.textContent = `${mission.scenarioCode || "LUNASPIS"} · ${mission.scenarioName || "TEAM MISSION"}`;
    }
    if (meta) {
      const crew = window.netManager && window.netManager.roomState && Array.isArray(window.netManager.roomState.players)
        ? window.netManager.roomState.players.length
        : 0;
      const diffLabels = { cadet: "BEGINNER", engineer: "NORMAL", director: "EXPERT" };
      const diffText = diffLabels[mission.difficultyId] || String(mission.difficultyId || "NORMAL").toUpperCase();
      meta.textContent = `LEVEL: ${diffText} · TEAM: ${crew}/6`;
    }
    if (summary) {
      summary.textContent = mission.scenarioSummary ||
        "Finish the shared mission steps across the Space Station before launch day.";
    }
    if (art) {
      const showBioStory = mission.scenarioId === "bionutrients_2"
        && window.gameplay
        && typeof window.gameplay.renderBioMissionStoryboard === "function";
      if (showBioStory) {
        art.innerHTML = `
          <div class="briefing-bio-art__label">WHAT YOU'LL DO ON THE STATION</div>
          ${window.gameplay.renderBioMissionStoryboard("briefing")}
        `;
        art.style.display = "block";
      } else {
        art.innerHTML = "";
        art.style.display = "none";
      }
    }
    if (list) {
      const objectives = Array.isArray(mission.objectives) ? mission.objectives : [];
      const completed = new Set(mission.completedObjectives || []);
      const assignments = mission.objectiveAssignments || {};
      list.innerHTML = objectives.map((objective) => {
        const done = completed.has(objective.id);
        const deps = (objective.dependsOn || []).map((id) => {
          const dep = objectives.find((entry) => entry.id === id);
          return dep ? dep.room : id;
        });
        const roleId = assignments[objective.id] || objective.role || "all";
        const roleMeta = window.InterfellasRoles && roleId !== "all"
          ? window.InterfellasRoles.getRoleMeta(roleId)
          : { short: "ALL", label: "All Crew", color: "#9aa4ae" };
        return `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-family:monospace;font-size:11px;font-weight:700;color:${done ? "#34d399" : "#67e8f9"};min-width:46px;">${escapeHtml(objective.room)}</span>
            <span title="Assigned role: ${escapeHtml(roleMeta.label)}" style="font-family:monospace;font-size:10px;font-weight:700;color:${roleMeta.color};min-width:42px;">${escapeHtml(roleMeta.short)}</span>
            <span style="flex:1;font-size:12.5px;line-height:1.45;color:${done ? "#7fb8a6" : "#ece7dc"};">${escapeHtml(objective.title)}</span>
            <span style="font-family:monospace;font-size:10.5px;color:#9aa4ae;">${done ? "COMPLETE" : deps.length ? "AFTER " + deps.join("+") : "FIRST"}</span>
          </div>
        `;
      }).join("");
    }

    const coach = document.getElementById("briefing-coach");
    if (coach) {
      const guidanceOn = !window.missionAcademy
        || typeof window.missionAcademy.isGuidanceEnabled !== "function"
        || window.missionAcademy.isGuidanceEnabled();
      if (guidanceOn) {
        let scenarioTip = "";
        if (window.gameplay && typeof window.gameplay.getScenarioCatalog === "function") {
          const scenario = window.gameplay.getScenarioCatalog().find((entry) => entry.id === mission.scenarioId);
          scenarioTip = scenario && scenario.tradeoffTip ? scenario.tradeoffTip : "";
        }
        const isCadet = String(mission.difficultyId || "").toLowerCase() === "cadet";
        coach.innerHTML = `
          <strong>${isCadet ? "BEGINNER HELPER" : "QUICK TIP"}:</strong>
          ${escapeHtml(scenarioTip || "Every choice trades weight, power, radio strength, and budget. Keep all status bars green before locking in!")}
          <div class="briefing-coach-actions">
            <button type="button" id="btn-briefing-academy">OPEN BEGINNER GUIDE [F1]</button>
          </div>
        `;
        coach.style.display = "block";
      } else {
        coach.style.display = "none";
        coach.innerHTML = "";
      }
    }

    if (btnBegin) {
      btnBegin.onclick = () => {
        overlay.style.display = "none";
        if (window.spaceAudio) window.spaceAudio.playClick();
      };
    }
    overlay.style.display = "flex";
  }

  function roleBadgeClass(role) {
    switch (role) {
      case "flight_director": return "badge-fdir";
      case "ground_capcom": return "badge-cap";
      case "engineer": return "badge-eng";
      case "scientist": return "badge-sci";
      case "specialist": return "badge-spc";
      default: return "badge-cmd";
    }
  }

  function renderSwapBanners(transientIncoming = null) {
    const net = window.netManager;
    const myId = net ? net.socketId : null;
    const rs = net && net.roomState ? net.roomState : null;
    const swapList = (rs && Array.isArray(rs.swapRequests)) ? rs.swapRequests.slice() : [];
    if (transientIncoming && transientIncoming.id && !swapList.some((r) => r && r.id === transientIncoming.id)) {
      swapList.unshift(transientIncoming);
    }

    const incoming = myId ? swapList.find((r) => r && r.toId === myId) : null;
    const outgoing = myId ? swapList.find((r) => r && r.fromId === myId) : null;
    const rolesApi = window.InterfellasRoles;

    const buildMarkup = (req, isIncoming) => {
      if (!req) return "";
      const fromShort = rolesApi ? rolesApi.getRoleMeta(req.fromRole).short : String(req.fromRole || "CREW").toUpperCase();
      const toShort = rolesApi ? rolesApi.getRoleMeta(req.toRole).short : String(req.toRole || "CREW").toUpperCase();
      if (isIncoming) {
        return `
          <div>
            <strong>SWAP REQUEST:</strong> ${escapeHtml(req.fromName || "Crew")} (${escapeHtml(fromShort)}) wants to trade stations for your <strong>${escapeHtml(toShort)}</strong> role.
          </div>
          <div class="swap-banner-actions">
            <button type="button" class="ground-action-btn is-approved" data-swap-accept="${escapeHtml(req.id)}">ACCEPT SWAP</button>
            <button type="button" class="ground-action-btn" data-swap-decline="${escapeHtml(req.id)}">DECLINE</button>
          </div>
        `;
      }
      return `
        <div>
          <strong>PENDING SWAP:</strong> Requested ${escapeHtml(req.toName || "Crew")} (${escapeHtml(toShort)}) to trade for your ${escapeHtml(fromShort)} role...
        </div>
        <div class="swap-banner-actions">
          <button type="button" class="ground-action-btn" data-swap-cancel="${escapeHtml(req.id)}">CANCEL</button>
        </div>
      `;
    };

    const bindBanner = (el, req, isIncoming) => {
      if (!el) return;
      if (!req) {
        el.style.display = "none";
        el.innerHTML = "";
        return;
      }
      el.innerHTML = buildMarkup(req, isIncoming);
      el.style.display = "flex";
      const acceptBtn = el.querySelector("[data-swap-accept]");
      if (acceptBtn) {
        acceptBtn.addEventListener("click", () => {
          if (net && typeof net.respondRoleSwap === "function") net.respondRoleSwap(req.id, true);
        });
      }
      const declineBtn = el.querySelector("[data-swap-decline]");
      if (declineBtn) {
        declineBtn.addEventListener("click", () => {
          if (net && typeof net.respondRoleSwap === "function") net.respondRoleSwap(req.id, false);
        });
      }
      const cancelBtn = el.querySelector("[data-swap-cancel]");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          if (net && typeof net.cancelRoleSwap === "function") net.cancelRoleSwap(req.id);
        });
      }
    };

    const lobbyBanner = document.getElementById("lobby-swap-banner");
    const hudBanner = document.getElementById("hud-swap-banner");
    const activeReq = incoming || outgoing || null;
    const activeIncoming = !!incoming;
    bindBanner(lobbyBanner, activeReq, activeIncoming);
    bindBanner(hudBanner, window.isGameStarted ? activeReq : null, activeIncoming);
  }
  window.renderSwapBanners = renderSwapBanners;

  function updateLobbySlots(players, hostId, roomStatus) {
    const slotsContainer = document.getElementById("lobby-players-grid");
    const countBadge = document.getElementById("lobby-player-count");
    const btnStart = document.getElementById("btn-start-mission");
    const btnRand = document.getElementById("btn-randomize-roles");
    const chkShuffle = document.getElementById("chk-shuffle-on-launch");
    const rs = window.netManager && window.netManager.roomState;
    const status = roomStatus || (rs && rs.status) || "lobby";
    const isHost = window.netManager.socketId === hostId;
    const isSolo = !!(rs && rs.isSolo);

    if (countBadge) countBadge.textContent = isSolo ? "SOLO MISSION · COMMANDER" : `${players.length} / 6 CREW ASSIGNED`;
    if (btnRand) {
      btnRand.style.display = (isHost && status === "lobby" && !isSolo) ? "inline-flex" : "none";
      btnRand.disabled = players.length < 2;
      btnRand.style.opacity = players.length < 2 ? "0.5" : "1";
    }
    if (chkShuffle && chkShuffle.parentElement) {
      chkShuffle.parentElement.style.display = (isHost && status === "lobby" && !isSolo) ? "inline-flex" : "none";
    }
    if (btnStart) {
      if (status === "victory") {
        btnStart.style.display = "block";
        btnStart.disabled = !isHost;
        btnStart.style.opacity = isHost ? "1" : "0.55";
        btnStart.textContent = isHost ? "MISSION SELECT ->" : "MISSION COMPLETE";
      } else if (status === "playing") {
        btnStart.style.display = "block";
        btnStart.disabled = false;
        btnStart.style.opacity = "1";
        btnStart.textContent = "JOIN ACTIVE MISSION";
      } else if (isHost) {
        btnStart.style.display = "block";
        btnStart.disabled = false;
        btnStart.style.opacity = "1";
        btnStart.textContent = isSolo ? "LAUNCH SOLO MISSION →" : "LAUNCH MISSION";
      } else {
        btnStart.style.display = "block";
        btnStart.disabled = true;
        btnStart.style.opacity = "0.55";
        btnStart.textContent = "WAITING FOR HOST...";
      }
    }

    if (typeof window.syncLobbySelectionUI === "function") {
      window.syncLobbySelectionUI(players);
    }
    renderSwapBanners();

    if (!slotsContainer) return;
    slotsContainer.innerHTML = "";

    const rolesApi = window.InterfellasRoles;
    const swapList = (rs && Array.isArray(rs.swapRequests)) ? rs.swapRequests : [];
    const myId = window.netManager ? window.netManager.socketId : null;
    const pendingToIds = new Set(swapList.filter((r) => r && r.fromId === myId).map((r) => r.toId));

    const groundTarget = players.length <= 1 ? 0 : (players.length <= 3 ? 1 : 2);
    const groundPlayers = players.filter((p) => p && (p.team === "ground" || (rolesApi && rolesApi.isGroundRole(p.role))));
    const flightPlayers = players.filter((p) => p && !groundPlayers.includes(p));

    const renderManifestRow = (p, fallbackDuty) => {
      const row = document.createElement("div");
      if (!p) {
        row.className = "lobby-manifest-row is-empty";
        row.innerHTML = `
          <div class="lobby-row-head">
            <span class="lobby-row-name" style="color:var(--text-slate);">STANDBY SEAT</span>
            <span class="task-badge">OPEN</span>
          </div>
          <div class="lobby-row-duty">${escapeHtml(fallbackDuty)}</div>
        `;
        return row;
      }
      const isSelf = p.id === myId;
      const color = safeHexColor(p.color, "#93c5fd");
      const normRole = rolesApi ? rolesApi.normalizeRole(p.role, "commander") : (p.role || "commander");
      const roleMeta = rolesApi ? rolesApi.getRoleMeta(normRole) : { short: "CMD", label: "COMMANDER", duties: {} };
      const dutyText = (roleMeta.duties && roleMeta.duties.station) || fallbackDuty;
      const isPending = pendingToIds.has(p.id);
      row.className = `lobby-manifest-row${isSelf ? " is-self" : ""}`;
      row.innerHTML = `
        <div class="lobby-row-head">
          <div class="lobby-row-identity">
            <span class="lobby-suit-swatch" style="background:${color};"></span>
            <span class="lobby-row-name">${escapeHtml(p.name || "Astronaut")} ${p.isHost ? "<span style='color:#fde68a;font-size:10px;'>[HOST]</span>" : ""} ${isSelf ? "<span style='color:#93c5fd;font-size:10px;'>(YOU)</span>" : ""}</span>
          </div>
          <span class="task-badge ${roleBadgeClass(normRole)}">${escapeHtml(roleMeta.short)}</span>
        </div>
        <div class="lobby-row-foot">
          <span class="lobby-row-duty">${escapeHtml(roleMeta.label)} · ${escapeHtml(dutyText)}</span>
          ${!isSelf && players.length > 1 ? `
            <button type="button" class="lobby-swap-btn${isPending ? " is-pending" : ""}" data-req-swap="${escapeHtml(p.id)}" ${isPending ? "disabled" : ""}>
              ${isPending ? "PENDING" : "SWAP"}
            </button>
          ` : ""}
        </div>
      `;
      const swapBtn = row.querySelector("[data-req-swap]");
      if (swapBtn) {
        swapBtn.addEventListener("click", () => {
          if (window.netManager && typeof window.netManager.requestRoleSwap === "function") {
            window.netManager.requestRoleSwap(p.id);
          }
          if (window.spaceAudio) window.spaceAudio.playClick();
        });
      }
      return row;
    };

    const groundGroup = document.createElement("div");
    groundGroup.className = "lobby-zone-group";
    groundGroup.innerHTML = `
      <div class="lobby-zone-header zone-ground">
        <span>EARTH CONTROL TEAM</span>
        <span>${groundPlayers.length} / ${groundTarget} FILLED (${players.length <= 1 ? "SOLO MODE" : "MAX 2"})</span>
      </div>
      <div class="lobby-zone-rows"></div>
    `;
    const groundRows = groundGroup.querySelector(".lobby-zone-rows");
    if (groundPlayers.length === 0) {
      groundRows.appendChild(renderManifestRow(null, players.length <= 1
        ? "Auto-assigned with 2+ players (1 Earth Control at 2-3 players, 2 at 4-6)."
        : "Open Earth Control spot."));
    } else {
      groundPlayers.forEach((p) => groundRows.appendChild(renderManifestRow(p, "Launch OK, Earth Dish Lock, Power & Data Relay")));
      if (groundPlayers.length < groundTarget) {
        groundRows.appendChild(renderManifestRow(null, "Second Earth Control spot fills automatically."));
      }
    }
    slotsContainer.appendChild(groundGroup);

    const flightGroup = document.createElement("div");
    flightGroup.className = "lobby-zone-group";
    flightGroup.innerHTML = `
      <div class="lobby-zone-header zone-crew">
        <span>SPACE CREW · STATION</span>
        <span>${flightPlayers.length} JOINED</span>
      </div>
      <div class="lobby-zone-rows"></div>
    `;
    const flightRows = flightGroup.querySelector(".lobby-zone-rows");
    if (flightPlayers.length === 0) {
      flightRows.appendChild(renderManifestRow(null, "Commander, Engineer, Scientist & Mission Specialist seats."));
    } else {
      flightPlayers.forEach((p) => flightRows.appendChild(renderManifestRow(p, "Pad boarding, Orbital Docking & Station Ops")));
    }
    slotsContainer.appendChild(flightGroup);
  }

  function syncLobbySelectionUI(explicitPlayers) {
    const net = window.netManager;
    const lp = net && net.localPlayer ? net.localPlayer : {};
    const myColor = String(lp.color || "#c9f04b").toLowerCase();
    const players = Array.isArray(explicitPlayers)
      ? explicitPlayers
      : (net && net.roomState && Array.isArray(net.roomState.players) ? net.roomState.players : []);

    document.querySelectorAll("#screen-lobby .lobby-color-btn").forEach((btn) => {
      const col = String(btn.getAttribute("data-color") || "").toLowerCase();
      btn.classList.toggle("active", col === myColor);
    });

    const rolesApi = window.InterfellasRoles;
    const groundCount = players.filter((p) => p && (p.team === "ground" || (rolesApi && rolesApi.isGroundRole(p.role)))).length;
    const flightCount = Math.max(0, players.length - groundCount);
    const myMeta = rolesApi ? rolesApi.getRoleMeta(lp.role) : { short: "CMD", label: "COMMANDER" };

    const coverageEl = document.getElementById("lobby-role-coverage");
    if (coverageEl) {
      if (players.length <= 1) {
        coverageEl.className = "lobby-role-coverage";
        coverageEl.textContent = "SOLO FLIGHT READY: Invite 1-5 crew with Room Code. Roles randomize cleanly across Ground Control (max 2) and Flight Crew.";
      } else {
        coverageEl.className = "lobby-role-coverage ready";
        coverageEl.textContent = `ASSIGNED ROLE: [${myMeta.short}] ${myMeta.label} · ROSTER SPLIT: ${groundCount} GROUND / ${flightCount} FLIGHT · CLICK SWAP ON ANY PEER TO TRADE`;
      }
    }
  }
  window.syncLobbySelectionUI = syncLobbySelectionUI;

  let hudMissionHubRoleFilter = "all";
  let lastHudMissionHubMyRole = null;

  function syncMissionHubRoleFilterForRole(myRole, localIsGround) {
    if (lastHudMissionHubMyRole && lastHudMissionHubMyRole !== myRole) {
      hudMissionHubRoleFilter = localIsGround ? myRole : "all";
    } else if (lastHudMissionHubMyRole === null && localIsGround) {
      hudMissionHubRoleFilter = myRole;
    }
    lastHudMissionHubMyRole = myRole;
    return hudMissionHubRoleFilter;
  }
  window.syncMissionHubRoleFilterForRole = syncMissionHubRoleFilterForRole;

  function setMissionHubRoleFilter(role) {
    const next = (!role || role === "all")
      ? "all"
      : (role === hudMissionHubRoleFilter ? "all" : role);
    hudMissionHubRoleFilter = next;
    if (window.gameplay && typeof window.gameplay.updateTaskListUI === "function") {
      window.gameplay.updateTaskListUI();
    } else {
      renderHudCrewRoster();
    }
    if (window.spaceAudio) window.spaceAudio.playClick();
  }
  window.getMissionHubRoleFilter = () => hudMissionHubRoleFilter;
  window.setMissionHubRoleFilter = setMissionHubRoleFilter;

  function getMissionHubTaskCounts(mission) {
    const counts = {};
    const rolesApi = window.InterfellasRoles;
    const tasks = window.gameplay && Array.isArray(window.gameplay.tasks) ? window.gameplay.tasks : [];
    const completed = new Set((mission && mission.completedObjectives) || []);
    tasks.forEach((task) => {
      if (!task) return;
      const rawRole = window.gameplay && typeof window.gameplay.getTaskRole === "function"
        ? window.gameplay.getTaskRole(task)
        : (task.role || "all");
      const roleId = rawRole === "all" ? "all" : (rolesApi ? rolesApi.normalizeRole(rawRole, "commander") : rawRole);
      if (!counts[roleId]) counts[roleId] = { done: 0, total: 0 };
      counts[roleId].total += 1;
      if (completed.has(task.id) || task.completed) counts[roleId].done += 1;
    });
    return counts;
  }

  function getGroundSupportChecks(mission, roleId) {
    const gs = (mission && mission.groundSupport) || {};
    if (roleId === "flight_director") {
      return [
        { label: "LAUNCH GO", done: !!gs.goNoGoLaunch },
        { label: "DOCK CLEAR", done: !!gs.dockingClearance }
      ];
    }
    if (roleId === "ground_capcom") {
      return [
        { label: "DISH LOCK", done: !!gs.dsnLocked },
        { label: "POWER ROUTE", done: !!gs.powerRouted },
        { label: "SCIENCE LINK", done: !!gs.scienceCleared }
      ];
    }
    return [];
  }
  window.getGroundSupportChecks = getGroundSupportChecks;

  function renderHudCrewRoster() {
    const container = document.getElementById("hud-crew-roster");
    if (!container) return;
    const net = window.netManager;
    const rs = net && net.roomState ? net.roomState : null;
    const lp = net && net.localPlayer ? net.localPlayer : { role: "commander" };
    const rolesApi = window.InterfellasRoles;
    const myRole = rolesApi ? rolesApi.normalizeRole(lp.role, "commander") : "commander";
    const localIsGround = lp.team === "ground" || (rolesApi && rolesApi.isGroundRole(myRole));
    const myMeta = rolesApi ? rolesApi.getRoleMeta(myRole) : { short: "CMD", label: "COMMANDER", color: "#93c5fd" };

    const players = rs && Array.isArray(rs.players) && rs.players.length > 0
      ? rs.players
      : [{ id: net ? net.socketId : "local", name: lp.name || "YOU", role: myRole, team: localIsGround ? "ground" : "crew", isHost: !!(net && net.isHost), color: lp.color || "#c9f04b" }];

    const mission = (net && typeof net.getMission === "function" ? net.getMission() : null) || (rs && rs.mission) || {};
    const phase = mission.phase
      || (window.spaceCenter
        ? (window.spaceCenter.missionPhase || (window.spaceCenter.isGroundMode ? "gantry" : "station"))
        : "station");
    const hostId = rs ? rs.hostId : (net && net.isHost ? net.socketId : null);
    const swapList = (rs && Array.isArray(rs.swapRequests)) ? rs.swapRequests : [];
    const pendingToIds = new Set(swapList.filter((r) => r && r.fromId === (net && net.socketId)).map((r) => r.toId));
    const boarded = Array.isArray(mission.boarded) ? mission.boarded : [];
    const taskCounts = getMissionHubTaskCounts(mission);

    const groundPlayers = players.filter((p) => p && (p.team === "ground" || (rolesApi && rolesApi.isGroundRole(p.role))));
    const flightPlayers = players.filter((p) => p && !groundPlayers.includes(p));
    const crossZoneOpen = phase === "gantry";
    syncMissionHubRoleFilterForRole(myRole, localIsGround);
    const filterRole = hudMissionHubRoleFilter;
    const filterRoleStillPresent = filterRole === "all"
      || filterRole === myRole
      || players.some((p) => p && rolesApi && rolesApi.normalizeRole(p.role, "commander") === filterRole);
    if (!filterRoleStillPresent) hudMissionHubRoleFilter = "all";
    const activeFilter = hudMissionHubRoleFilter;

    const headerDot = document.getElementById("hud-checklist-team-icon");
    if (headerDot) {
      headerDot.style.background = myMeta.color;
      headerDot.style.boxShadow = `0 0 0 3px ${myMeta.color}22`;
    }

    const renderRoleCard = (p) => {
      if (!p) {
        return `
          <div class="hub-role-card is-empty">
            <div class="hub-role-card-top">
              <span class="hub-role-card-badge">OPEN</span>
              <span class="hub-role-card-state">STANDBY</span>
            </div>
            <div class="hub-role-card-name">Open seat</div>
            <div class="hub-role-card-bottom"><span class="hub-role-card-count">Auto-assigned</span></div>
          </div>
        `;
      }
      const pRole = rolesApi ? rolesApi.normalizeRole(p.role, "commander") : (p.role || "commander");
      const meta = rolesApi ? rolesApi.getRoleMeta(pRole) : { short: "CMD", label: "COMMANDER", color: "#93c5fd" };
      const isSelf = net && p.id === net.socketId;
      const pIsGround = p.team === "ground" || (rolesApi && rolesApi.isGroundRole(pRole));
      const canSwap = !isSelf && players.length > 1 && (crossZoneOpen || pIsGround === localIsGround);
      const isPending = pendingToIds.has(p.id);
      const isActive = activeFilter === pRole;
      const statusHint = pIsGround
        ? "EARTH"
        : (phase === "gantry" ? (boarded.includes(p.id) ? "ABOARD" : "PAD") : (phase === "station" ? "STATION" : "ORBIT"));
      const supportChecks = pIsGround ? getGroundSupportChecks(mission, pRole) : [];
      const supportDone = supportChecks.filter((check) => check.done).length;
      const roleCount = taskCounts[pRole] || { done: 0, total: 0 };
      const countValue = pIsGround ? `${supportDone}/${supportChecks.length}` : `${roleCount.done}/${roleCount.total}`;
      const countLabel = pIsGround ? "CHECKS" : "STEPS";
      const dutyText = (meta.duties && meta.duties.station) || meta.primaryDuty || "";
      return `
        <div class="hub-role-card${isSelf ? " is-self" : ""}${isActive ? " is-active" : ""}"
          data-hud-role-filter="${escapeHtml(pRole)}"
          role="button" tabindex="0" aria-pressed="${isActive}"
          style="--role-color:${meta.color};"
          title="${escapeHtml(meta.label)} · ${escapeHtml(p.name || "Crew")}${dutyText ? ` · ${escapeHtml(dutyText)}` : ""} · Click to ${isActive ? "show all roles" : (pIsGround ? `view ${meta.label} support checks` : `view ${meta.label} steps`)}">
          <div class="hub-role-card-top">
            <span class="hub-role-card-badge">${escapeHtml(meta.short)}${isSelf ? " · YOU" : ""}</span>
            <span class="hub-role-card-state">${statusHint}</span>
          </div>
          <div class="hub-role-card-name">${escapeHtml(p.name || "Crew")}</div>
          <div class="hub-role-card-bottom">
            <span class="hub-role-card-count"><strong>${countValue}</strong> ${countLabel}</span>
            ${canSwap ? `
              <button type="button" class="hub-role-swap" data-hud-swap="${escapeHtml(p.id)}" ${isPending ? "disabled" : ""} title="Request a role swap">
                ${isPending ? "PENDING" : "SWAP"}
              </button>
            ` : ""}
          </div>
        </div>
      `;
    };

    const renderZone = (list, title, subtext, emptyText) => {
      const cards = list.length ? list.map(renderRoleCard).join("") : renderRoleCard(null);
      return `
        <div class="hub-crew-zone">
          <div class="hub-crew-zone-head">
            <span>${title}</span>
            <span>${subtext}</span>
          </div>
          <div class="hub-role-grid">${cards}</div>
          ${!list.length && emptyText ? `<div class="hub-zone-empty">${escapeHtml(emptyText)}</div>` : ""}
        </div>
      `;
    };

    const groundTarget = players.length <= 1 ? 0 : (players.length <= 3 ? 1 : 2);
    const showGroundZone = groundPlayers.length > 0 || players.length > 1;
    const gs = mission.groundSupport || {};
    const groundBadges = [
      gs.goNoGoLaunch ? "LAUNCH OK" : null,
      gs.dockingClearance ? "DOCK OK" : null,
      gs.dsnLocked ? "DISH LOCK" : null,
      gs.powerRouted ? "POWER OK" : null,
      gs.scienceCleared ? "SCIENCE OK" : null
    ].filter(Boolean);

    let callout = "";
    if (localIsGround) {
      if (phase === "gantry") {
        callout = `<strong>GROUND CONTROL ROOM:</strong> Watch crew boarding (${boarded.length}/${flightPlayers.length}) · Open Ground Desk [C] for Launch Clearance &amp; live updates. All-crew voice + CREW COMMS are always open.`;
      } else if (phase === "launch") {
        callout = `<strong>LIFTOFF WATCH:</strong> Watch rocket liftoff from Ground Control · Turn on Dish Lock &amp; Solar Routing in Ground Desk [C].`;
      } else if (phase === "docking") {
        callout = `<strong>DOCKING SUPPORT:</strong> Give Safe Docking Clearance in Ground Desk [C] while Space Crew lines up with the hatch.`;
      } else {
        callout = `<strong>MISSION SUPPORT:</strong> Track Space Crew live in Ground Desk [C], alert rooms, &amp; use CREW COMMS to reach the ship.`;
      }
    } else if (phase === "gantry" || phase === "boarding") {
      const unboarded = flightPlayers.filter((p) => !boarded.includes(p.id)).map((p) => p.name);
      const isMeAboard = net && boarded.includes(net.socketId);
      const cmdHolder = flightPlayers.find((p) => rolesApi && rolesApi.normalizeRole(p.role) === "commander") || flightPlayers.find((p) => p.id === hostId) || flightPlayers[0];
      const engHolder = flightPlayers.find((p) => rolesApi && rolesApi.normalizeRole(p.role) === "engineer") || flightPlayers.find((p) => p.id === hostId) || flightPlayers[0];
      const armExtended = !!mission.dockLocked;
      const cmdMeta = rolesApi && cmdHolder ? rolesApi.getRoleMeta(cmdHolder.role) : { short: "CMD" };
      const engMeta = rolesApi && engHolder ? rolesApi.getRoleMeta(engHolder.role) : { short: "ENG" };

      if (!armExtended) {
        const armActor = engHolder && engHolder.id === (net && net.socketId) ? `YOU (${engMeta.short})` : `${engHolder ? engHolder.name : "Crew"} (${engMeta.short})`;
        callout = `<strong>1. BOARDING BRIDGE:</strong> <strong>${escapeHtml(armActor)}</strong> press [F] at the Boarding Bridge (top of the Launch Tower) to swing the walkway out.`;
      } else if (!isMeAboard) {
        callout = `<strong>YOUR TURN:</strong> Walk across the Boarding Bridge &rarr; Press [E] or [B] at the Hatch to get inside (${boarded.length}/${flightPlayers.length} aboard).`;
      } else if (unboarded.length > 0) {
        callout = `<strong>WAITING ON CREW (${boarded.length}/${flightPlayers.length}):</strong> Waiting for <strong>${escapeHtml(unboarded.join(", "))}</strong>. Launch Lead: ${escapeHtml(cmdHolder ? cmdHolder.name : "Host")} (${escapeHtml(cmdMeta.short)}).`;
      } else {
        callout = mission.launchPollAt && !gs.goNoGoLaunch
          ? `<strong>LAUNCH CHECK:</strong> Waiting for Ground Control GO (auto-clears in 8s) · Press [L] again to launch right now.`
          : `<strong>READY FOR LIFTOFF:</strong> Whole crew aboard! Press [L] or click Launch to begin the countdown.`;
      }
    } else if (phase === "launch") {
      const cmdHolder = flightPlayers.find((p) => rolesApi && rolesApi.normalizeRole(p.role) === "commander") || flightPlayers[0];
      callout = `<strong>ROCKET ASCENT:</strong> Pilot <strong>${escapeHtml(cmdHolder ? cmdHolder.name : "Commander")}</strong> leads the climb to space. Sit tight or vote to skip.`;
    } else if (phase === "docking") {
      const pilot = flightPlayers.find((p) => p.id === mission.dockingPilotId) || flightPlayers[0];
      const isPilot = pilot && net && pilot.id === net.socketId;
      callout = isPilot
        ? `<strong>YOUR TURN (PILOT):</strong> Line up the docking rings [WASD+QE] &rarr; Press [SPACE] within 1.2m.`
        : `<strong>CREW HELP:</strong> Pilot <strong>${escapeHtml(pilot ? pilot.name : "CMD")}</strong> steers [WASD]; team steadies the craft [1-4].`;
    } else {
      const tasks = (window.gameplay && Array.isArray(window.gameplay.tasks)) ? window.gameplay.tasks : [];
      const taskIsMine = (task) => {
        if (window.gameplay && typeof window.gameplay.getTaskRole === "function" && typeof window.gameplay._getRoleAssignment === "function") {
          return window.gameplay._getRoleAssignment(window.gameplay.getTaskRole(task)).isMine;
        }
        return task.role === myRole || task.role === "all";
      };
      const myPending = tasks.filter((t) => !t.completed && taskIsMine(t));
      const anyPending = tasks.filter((t) => !t.completed);
      if (tasks.length > 0 && anyPending.length === 0) {
        callout = `<strong>ALL STATIONS DONE:</strong> Mission complete! Press [Y] for Final Results.`;
      } else if (myPending.length > 0) {
        const nextTask = myPending[0];
        const depsDone = !Array.isArray(nextTask.requires) || nextTask.requires.every((reqId) => {
          const dep = tasks.find((x) => x.id === reqId);
          return dep && dep.completed;
        });
        const names = myPending.map((t) => `[${t.code || t.room || t.id}] ${t.location || t.room || "Computer"}`).join(", ");
        callout = depsDone
          ? `<strong>YOUR TURN (${escapeHtml(myRole.toUpperCase())}):</strong> Walk to ${escapeHtml(names)}.`
          : `<strong>UP NEXT (${escapeHtml(myRole.toUpperCase())}):</strong> ${escapeHtml(names)} (wait for earlier step).`;
      } else {
        callout = `<strong>SPACE STATION:</strong> ${anyPending.length ? `${anyPending.length} tasks remaining with crew.` : "Float with [WASD] and press [E] at computers."} Ground support: ${groundBadges.length ? groundBadges.join(" · ") : "STANDBY"}.`;
      }
    }

    const filterRoleMeta = activeFilter !== "all" && rolesApi ? rolesApi.getRoleMeta(activeFilter) : null;
    container.innerHTML = `
      <div class="hub-filter-row">
        <div class="hub-filter-group" role="group" aria-label="Filter mission steps by role">
          <button type="button" class="hub-filter-btn${activeFilter === "all" ? " is-active" : ""}" data-hud-role-filter="all">ALL ROLES</button>
          <button type="button" class="hub-filter-btn${activeFilter === myRole ? " is-active" : ""}" data-hud-role-filter="${escapeHtml(myRole)}">MY ROLE · ${escapeHtml(myMeta.short)}</button>
        </div>
        <span class="hub-filter-current">${filterRoleMeta ? escapeHtml(filterRoleMeta.short) : "ALL"}</span>
      </div>
      ${showGroundZone ? renderZone(groundPlayers, "EARTH CONTROL", `${groundPlayers.length} / ${Math.max(groundTarget, groundPlayers.length)}`, "Ground control seats open up with 2+ players.") : ""}
      ${renderZone(flightPlayers, "FLIGHT CREW", `${flightPlayers.length} JOINED`, "Commander, Engineer, Scientist & Specialist seats.")}
      <div class="hub-callout">
        <div class="hub-callout-head"><span class="hub-callout-dot"></span>YOUR NEXT MOVE</div>
        <div class="hub-callout-body">${callout}</div>
      </div>
    `;

    const activateFilter = (role) => {
      if (!role) return;
      setMissionHubRoleFilter(role);
    };
    container.querySelectorAll("[data-hud-role-filter]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest("[data-hud-swap]")) return;
        activateFilter(el.getAttribute("data-hud-role-filter"));
      });
      if (el.getAttribute("role") === "button") {
        el.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          activateFilter(el.getAttribute("data-hud-role-filter"));
        });
      }
    });
    container.querySelectorAll("[data-hud-swap]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetId = btn.getAttribute("data-hud-swap");
        if (targetId && net && typeof net.requestRoleSwap === "function") {
          net.requestRoleSwap(targetId);
        }
        if (window.spaceAudio) window.spaceAudio.playClick();
      });
    });

    renderSwapBanners();
  }
  window.renderHudCrewRoster = renderHudCrewRoster;

  function safeHexColor(color, fallback = "#ff6b6b") {
    return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function appendLobbyChat(comm) {
    const container = document.getElementById("lobby-chat-msgs");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "lobby-msg";
    const sender = document.createElement("strong");
    sender.style.color = safeHexColor(comm && comm.color, "#ff6b6b");
    sender.textContent = String((comm && comm.sender) || "Crew");
    const sep = document.createTextNode(": ");
    const text = document.createElement("span");
    text.textContent = String((comm && comm.text) || "");
    div.appendChild(sender);
    div.appendChild(sep);
    div.appendChild(text);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // ============================================================================
  // INPUT CONTROLS, ANALOG THUMBSTICK & MULTI-TOUCH CAMERA LOOK + PINCH ZOOM
  // ============================================================================
  function setupInputControls() {
    let isMouseDown = false;
    let lastMouseX = 0, lastMouseY = 0;

    window.addEventListener("keydown", (e) => {
      if (window.shuttleGame && window.shuttleGame.isActive) return;
      if (window.shipInterior && window.shipInterior.isLargeMapOpen) {
        if (e.code === "Escape" || e.key === "Escape") {
          e.preventDefault();
          window.shipInterior.closeLargeMap();
        }
        return;
      }
      if (e.code === "Escape" || e.key === "Escape") {
        if (window.csaNasaLab && window.csaNasaLab.modalEl && window.csaNasaLab.modalEl.style.display && window.csaNasaLab.modalEl.style.display !== "none") {
          window.csaNasaLab.closeModal();
          return;
        }
        if (window.spaceCenter && window.spaceCenter.lccConsoleOpen && typeof window.spaceCenter.openLccConsole === "function") {
          window.spaceCenter.openLccConsole(false);
          return;
        }
        if (emoteWheelOpen) {
          setEmoteWheelOpen(false);
          return;
        }
        const settingsModal = document.getElementById("modal-station-systems");
        if (settingsModal && settingsModal.style.display === "flex" && typeof toggleSystemsSettingsModal === "function") {
          toggleSystemsSettingsModal(false);
          return;
        }
        if (window.vrManager && window.vrManager.isAnyVRActive) {
          return;
        }
        if (window.solarSystem && window.solarSystem.isActive) {
          window.solarSystem.close();
          return;
        }
        if (window.missionViz && window.missionViz.isActive) {
          window.missionViz.close();
          return;
        }
        if (window.issShowcase && window.issShowcase.isActive) {
          window.issShowcase.close();
          return;
        }
        if (window.shipInterior && window.shipInterior.isMoonLandingActive) {
          window.shipInterior.stopMoonLandingScene();
          return;
        }
        if (window.glbManager && window.glbManager.hangarActive) {
          window.glbManager.closeHangar();
          return;
        }
      }

      // Docking owns the keyboard while it is active (RCS + camera keys).
      if (window.dockingSim && window.dockingSim.isActive) return;

      const tTag = e.target && e.target.tagName ? e.target.tagName : "";
      if (tTag === "INPUT" || tTag === "TEXTAREA" || tTag === "SELECT" || (e.target && e.target.isContentEditable)) return;

      const blockingOverlay = ["modal-auth", "modal-academy", "modal-mission-log", "modal-station-systems", "task-modal-overlay", "victory-overlay", "mission-briefing-overlay", "csa-nasa-lab-modal", "iss-sidegame-overlay", "glb-hangar-modal"]
        .some((id) => {
          const el = document.getElementById(id);
          return el && el.style.display && el.style.display !== "none";
        });
      if (blockingOverlay) return;

      keys[e.code] = true;
      if (e.key) keys[e.key.toLowerCase()] = true;

      // 6-Room Lunaspis Ship Interior Toggle [I]
      // Telemetry & Diagnostics Deck [P] or [F3]
      if (e.code === "KeyP" || e.code === "F3" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        if (typeof toggleDiagnosticsOverlay === "function") toggleDiagnosticsOverlay();
        return;
      }

      // Block all in-game movement, camera, and world-switching hotkeys until the mission has started
      if (!isGameStarted) return;

      // The ascent cinematic owns the camera and keyboard until it ends or is skipped.
      if (window.launchCutscene && window.launchCutscene.isPlaying) return;

      // The site tour owns 1-9 fast travel; don't fire emote shortcuts.
      if (window.spaceCenter && window.spaceCenter.siteTourActive) {
        if (e.code === "Digit0" || /^Digit[1-9]$/.test(e.code) || e.code === "KeyT") return;
      }

      // Solar Atlas is a full-screen takeover; close it before another view hotkey opens.
      if (
        window.solarSystem && window.solarSystem.isActive &&
        ["KeyU", "KeyJ", "KeyK", "KeyH", "KeyG", "KeyI", "KeyC", "KeyV"].indexOf(e.code) !== -1
      ) {
        window.solarSystem.close();
      }

      // Solar System Atlas [O]
      if (e.code === "KeyO" || e.key === "o" || e.key === "O") {
        e.preventDefault();
        if (window.solarSystem && typeof window.solarSystem.toggle === "function") {
          window.solarSystem.toggle();
        }
        return;
      }

      // Crew emotes [X] to open the wheel, [1]-[9] and [0] to express
      if (e.code === "KeyX" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        setEmoteWheelOpen(!emoteWheelOpen);
        return;
      }
      if (e.code === "Digit0" || /^Digit[1-9]$/.test(e.code)) {
        const emoteDefs = window.ASTRONAUT_EMOTES || [];
        const emoteIndex = e.code === "Digit0" ? 9 : Number(e.code.slice(5)) - 1;
        const emoteDef = emoteDefs[emoteIndex];
        if (emoteDef) {
          e.preventDefault();
          playLocalEmote(emoteDef.id);
          setEmoteWheelOpen(false);
        }
        return;
      }

      // Reopen the mission debrief after victory [Y]
      if (e.code === "KeyY" || e.key === "y" || e.key === "Y") {
        const status = window.netManager && window.netManager.roomState
          ? window.netManager.roomState.status
          : null;
        if (status === "victory" && window.gameplay && typeof window.gameplay.reopenVictory === "function") {
          e.preventDefault();
          window.gameplay.reopenVictory();
        }
        return;
      }

      // Toggle Space Center LC-39A <-> Station Interior [G]
      if (e.code === "KeyG" || e.key === "g" || e.key === "G") {
        e.preventDefault();
        if (window.missionViz && window.missionViz.isActive) window.missionViz.close();
        if (window.spaceCenter && typeof window.spaceCenter.toggleGroundOrbit === "function") {
          window.spaceCenter.toggleGroundOrbit();
        }
        return;
      }

      // 6-Room Lunaspis Ship Interior Toggle [I]
      if (e.code === "KeyI" || e.key === "i" || e.key === "I") {
        e.preventDefault();
        if (window.missionViz && window.missionViz.isActive) window.missionViz.close();
        // The ISS showcase's RETURN TO SHIP INTERIOR [I] action should restore
        // the context the crew came from instead of double-toggling the interior.
        if (window.issShowcase && window.issShowcase.isActive) {
          window.issShowcase.close();
          return;
        }
        if (window.glbManager && window.glbManager.hangarActive) {
          window.glbManager.closeHangar();
          return;
        }
        if (window.spaceCenter && window.spaceCenter.isGroundMode) {
          if (window.showActionToast) window.showActionToast("COMPLETE THE LAUNCH AND DOCKING SEQUENCE TO ENTER THE STATION");
          return;
        }
        if (window.shipInterior) {
          const vis = window.shipInterior.toggleInterior();
          if (window.showActionToast) {
            window.showActionToast(vis ? "ISS INTERIOR: ZERO-G ACTIVE" : "EXTERIOR / EVA VIEW: ACTIVE");
          }
        }
      }

      // 27-Part Interactive NASA ISS Reference Showcase [J]
      if (e.code === "KeyJ" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        if (window.missionViz && window.missionViz.isActive) window.missionViz.close();
        if (window.glbManager && window.glbManager.hangarActive) window.glbManager.closeHangar();
        if (window.issShowcase) {
          window.issShowcase.toggle();
        }
      }

      // 3D NASA Mission Viz & GMAT Trajectory Theater [U]
      if (e.code === "KeyU" || e.key === "u" || e.key === "U") {
        e.preventDefault();
        if (window.missionViz && typeof window.missionViz.toggle === "function") {
          window.missionViz.toggle();
        }
      }

      // 3D Lunar Touchdown Scene [K]
      if (e.code === "KeyK" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        if (window.missionViz && window.missionViz.isActive) window.missionViz.close();
        if (window.glbManager && window.glbManager.hangarActive) window.glbManager.closeHangar();
        if (window.shipInterior && typeof window.shipInterior.toggleMoonLandingScene === "function") {
          window.shipInterior.toggleMoonLandingScene();
        }
      }

      // 3D Model Hangar & GLB Studio [H]
      if (e.code === "KeyH" || e.key === "h" || e.key === "H") {
        e.preventDefault();
        if (window.missionViz && window.missionViz.isActive) window.missionViz.close();
        if (window.glbManager) {
          if (window.glbManager.hangarActive) window.glbManager.closeHangar();
          else window.glbManager.openHangar();
        }
      }

      // Cycle camera [C] or [V]
      if (e.code === "KeyC" || e.code === "KeyV" || e.key === "c" || e.key === "v" || e.key === "C" || e.key === "V") {
        if (!(window.dockingSim && window.dockingSim.isActive)) {
          cycleCameraMode();
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      keys[e.code] = false;
      if (e.key) keys[e.key.toLowerCase()] = false;
    });

    const dom = renderer.domElement;
    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    const isUIElement = (target) => {
      if (!target || typeof target.closest !== "function") return false;
      return Boolean(
        target.closest(
          "button, input, textarea, select, a, .hud-checklist-panel, .hud-race-bar-container, #hud-crew-roster, #hud-voice-panel, #virtual-dpad, #mobile-joystick-zone, #task-modal-overlay, #iss-showcase-ui, #mission-viz-ui, #solar-system-ui, #vr-mode-overlay, #ground-lcc-console, #lunaspis-ship-minimap, #space-center-ground-map, #ship-interior-hud, #space-center-ground-hud, #docking-hud-overlay, #launch-cutscene-overlay, #lunaspis-resource-meters, #btn-telemetry-toggle, #emote-wheel, #hud-diagnostics-overlay, #modal-auth, #modal-station-systems, #victory-overlay, #mission-briefing-overlay, #action-toast, .modal-card, .menu-card"
        )
      );
    };

    window.addEventListener("mousedown", (e) => {
      if (window.shuttleGame && window.shuttleGame.isActive) return;
      if (window.solarSystem && window.solarSystem.isActive) return;
      if (isUIElement(e.target)) return;
      isMouseDown = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      dom.style.cursor = "grabbing";
    });

    window.addEventListener("mouseup", () => {
      if (window.shuttleGame && window.shuttleGame.isActive) return;
      if (window.solarSystem && window.solarSystem.isActive) return;
      isMouseDown = false;
      dom.style.cursor = "grab";
    });

    window.addEventListener("blur", () => {
      isMouseDown = false;
      window.virtualJoyX = 0;
      window.virtualJoyY = 0;
      window.virtualJoyActive = false;
      if (dom) dom.style.cursor = "grab";
    });

    window.addEventListener("mousemove", (e) => {
      if (window.shuttleGame && window.shuttleGame.isActive) return;
      if (isMouseDown) {
        if (window.issShowcase && window.issShowcase.isActive) return;
        if (window.missionViz && window.missionViz.isActive) return;
        if (window.solarSystem && window.solarSystem.isActive) return;
        if (window.vrManager && window.vrManager.isAnyVRActive) return;
        if (window.dockingSim && window.dockingSim.isActive) return;
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        const sens = 0.0035;
        camYaw -= dx * sens;
        camPitch = Math.max(-0.75, Math.min(0.65, camPitch - dy * sens));
      }
    });

    window.addEventListener("wheel", (e) => {
      if (window.shuttleGame && window.shuttleGame.isActive) return;
      if (!isGameStarted || isUIElement(e.target)) return;
      if (window.issShowcase && window.issShowcase.isActive) return;
      if (window.missionViz && window.missionViz.isActive) return;
      if (window.solarSystem && window.solarSystem.isActive) return;
      if (window.vrManager && window.vrManager.isAnyVRActive) return;
      if (cameraMode === 1) {
        thirdPersonDist = Math.max(1.6, Math.min(5.5, thirdPersonDist + Math.sign(e.deltaY) * 0.25));
      }
    }, { passive: true });

    // ========================================================================
    // 1. ANALOG VIRTUAL THUMBSTICK (Left Thumb Movement)
    // ========================================================================
    const joyZone = document.getElementById("mobile-joystick-zone");
    const joyBase = document.getElementById("mobile-joystick-base");
    const joyStick = document.getElementById("mobile-joystick-stick");
    const joyHint = document.getElementById("mobile-joystick-hint");
    let joyTouchId = null;

    if (joyZone && joyBase && joyStick) {
      const updateStickFromPoint = (clientX, clientY) => {
        const rect = joyBase.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const maxRadius = rect.width * 0.38;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);
        const sx = Math.cos(angle) * clamped;
        const sy = Math.sin(angle) * clamped;

        joyStick.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;

        // Normalized -1..1 (x: right positive, y: forward positive when pushed up)
        const nx = maxRadius > 0 ? sx / maxRadius : 0;
        const ny = maxRadius > 0 ? -sy / maxRadius : 0;
        const mag = Math.hypot(nx, ny);
        if (mag < 0.1) {
          window.virtualJoyX = 0;
          window.virtualJoyY = 0;
          window.virtualJoyActive = false;
        } else {
          window.virtualJoyX = nx;
          window.virtualJoyY = ny;
          window.virtualJoyActive = true;
        }
        if (joyHint) {
          joyHint.textContent = mag > 0.82 ? "SPRINT" : "MOVE";
          joyHint.style.color = mag > 0.82 ? "var(--ui-brand)" : "rgba(167, 176, 186, 0.78)";
        }
      };

      const resetStick = () => {
        joyTouchId = null;
        window.virtualJoyX = 0;
        window.virtualJoyY = 0;
        window.virtualJoyActive = false;
        joyStick.style.transform = "translate3d(0px, 0px, 0px)";
        if (joyHint) {
          joyHint.textContent = "RUN";
          joyHint.style.color = "rgba(148, 163, 184, 0.75)";
        }
      };

      joyZone.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          const touch = e.changedTouches[0];
          if (!touch) return;
          joyTouchId = touch.identifier;
          updateStickFromPoint(touch.clientX, touch.clientY);
        },
        { passive: false }
      );

      joyZone.addEventListener(
        "touchmove",
        (e) => {
          if (joyTouchId === null) return;
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === joyTouchId) {
              e.preventDefault();
              e.stopPropagation();
              updateStickFromPoint(t.clientX, t.clientY);
              break;
            }
          }
        },
        { passive: false }
      );

      const onJoyEnd = (e) => {
        if (joyTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === joyTouchId) {
            resetStick();
            break;
          }
        }
      };
      joyZone.addEventListener("touchend", onJoyEnd, { passive: false });
      joyZone.addEventListener("touchcancel", onJoyEnd, { passive: false });
    }

    // ========================================================================
    // 2. MULTI-TOUCH CAMERA LOOK & TWO-FINGER PINCH ZOOM ON 3D CANVAS
    // ========================================================================
    let lookTouchId = null;
    let lastLookX = 0;
    let lastLookY = 0;
    let lastPinchDist = null;

    dom.addEventListener(
      "touchstart",
      (e) => {
        if (window.issShowcase && window.issShowcase.isActive) return;
        if (window.missionViz && window.missionViz.isActive) return;
        if (window.solarSystem && window.solarSystem.isActive) return;
        if (window.vrManager && window.vrManager.isAnyVRActive) return;
        if (window.dockingSim && window.dockingSim.isActive) return;
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastPinchDist = Math.hypot(dx, dy);
          return;
        }
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === joyTouchId) continue;
          if (lookTouchId === null) {
            lookTouchId = t.identifier;
            lastLookX = t.clientX;
            lastLookY = t.clientY;
            break;
          }
        }
      },
      { passive: true }
    );

    dom.addEventListener(
      "touchmove",
      (e) => {
        if (window.issShowcase && window.issShowcase.isActive) return;
        if (window.missionViz && window.missionViz.isActive) return;
        if (window.solarSystem && window.solarSystem.isActive) return;
        if (window.vrManager && window.vrManager.isAnyVRActive) return;
        if (window.dockingSim && window.dockingSim.isActive) return;
        if (e.touches.length === 2 && lastPinchDist !== null) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          const deltaPinch = (lastPinchDist - dist) * 0.012;
          lastPinchDist = dist;
          if (cameraMode === 1) {
            thirdPersonDist = Math.max(1.6, Math.min(5.5, thirdPersonDist + deltaPinch));
          }
          return;
        }

        if (lookTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === lookTouchId) {
            e.preventDefault();
            const dx = t.clientX - lastLookX;
            const dy = t.clientY - lastLookY;
            lastLookX = t.clientX;
            lastLookY = t.clientY;
            const sens = 0.0042;
            camYaw -= dx * sens;
            camPitch = Math.max(-0.75, Math.min(0.65, camPitch - dy * sens));
            break;
          }
        }
      },
      { passive: false }
    );

    const onLookTouchEnd = (e) => {
      if (e.touches.length < 2) lastPinchDist = null;
      if (lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId) {
          lookTouchId = null;
          break;
        }
      }
    };
    dom.addEventListener("touchend", onLookTouchEnd, { passive: true });
    dom.addEventListener("touchcancel", onLookTouchEnd, { passive: true });

    // Wire fallback D-pad buttons
    function wireDpad(btnId, varName) {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      const start = (e) => { e.preventDefault(); window[varName] = true; };
      const end = (e) => { e.preventDefault(); window[varName] = false; };
      btn.addEventListener("mousedown", start);
      btn.addEventListener("mouseup", end);
      btn.addEventListener("mouseleave", end);
      btn.addEventListener("touchstart", start, { passive: false });
      btn.addEventListener("touchend", end, { passive: false });
    }
    wireDpad("dpad-up", "virtualMoveUp");
    wireDpad("dpad-down", "virtualMoveDown");
    wireDpad("dpad-left", "virtualMoveLeft");
    wireDpad("dpad-right", "virtualMoveRight");
  }

  // ============================================================================
  // PHYSICAL MOVEMENT & SLIDING COLLISION LOOP (SpaceShip ThirdPersonController.tsx)
  // ============================================================================
  function updatePlayerPhysics(delta) {
    if (!localCrew.group) return;

    // Zero-g is a property of the constructed ISS interior, not of the model.
    // Compute it before the early-out branches so opening a task console does
    // not snap a floating crewmate back onto the deck.
    const zeroGNow = isISSInteriorViewActive() && !localCrew.isEva;
    const wasZeroG = !!localCrew.isZeroG;
    localCrew.isZeroG = zeroGNow;

    if (!isGameStarted) {
      if (localCrew.rig && typeof localCrew.rig.updateAnimation === "function") {
        localCrew.rig.updateAnimation(delta, false, localCrew.isEva, !localCrew.isEva, null, zeroGNow);
      }
      return;
    }

    // The open-top ground car owns locomotion while the crewmember is driving.
    if (window.spaceCenterCar && window.spaceCenterCar.isDriving) {
      return;
    }

    if (
      (window.gameplay && window.gameplay.activeTask) ||
      (window.issSideGames && window.issSideGames.isOpen) ||
      (window.launchCutscene && window.launchCutscene.isPlaying) ||
      (window.dockingSim && window.dockingSim.isActive) ||
      (window.solarSystem && window.solarSystem.isActive) ||
      (window.spaceCenter && window.spaceCenter.isGroundMode && window.spaceCenter.crewBoarded)
    ) {
      if (localCrew.rig && typeof localCrew.rig.updateAnimation === "function") {
        localCrew.rig.updateAnimation(delta, false, localCrew.isEva, !localCrew.isEva, null, zeroGNow);
      }
      return;
    }

    const joyMag = window.virtualJoyActive ? Math.hypot(window.virtualJoyX || 0, window.virtualJoyY || 0) : 0;
    // Hold Shift (or push the mobile thumbstick to its outer ring) to sprint.
    const isSprinting = !!(keys["ShiftLeft"] || keys["ShiftRight"] || joyMag > 0.82);
    const inISSInterior = isISSInteriorViewActive();
    const isZeroG = zeroGNow && inISSInterior;
    const speed = localCrew.isEva
      ? (isSprinting ? 7.2 : 4.8)
      : (inISSInterior ? (isSprinting ? 3.4 : 1.8) : (isSprinting ? 7.8 : 3.9));

    const isRight = keys["KeyD"] || keys["ArrowRight"] || keys["d"] || window.virtualMoveRight;
    const isLeft = keys["KeyA"] || keys["ArrowLeft"] || keys["a"] || window.virtualMoveLeft;
    const isDown = keys["KeyS"] || keys["ArrowDown"] || keys["s"] || window.virtualMoveDown;
    const isUp = keys["KeyW"] || keys["ArrowUp"] || keys["w"] || window.virtualMoveUp;

    let fwd = (isUp ? 1 : 0) - (isDown ? 1 : 0);
    let strafe = (isRight ? 1 : 0) - (isLeft ? 1 : 0);

    if (window.virtualJoyActive) {
      fwd += window.virtualJoyY || 0;
      strafe += window.virtualJoyX || 0;
    }

    const sinY = Math.sin(camYaw);
    const cosY = Math.cos(camYaw);

    let dx = fwd * sinY - strafe * cosY;
    let dz = fwd * cosY + strafe * sinY;
    const len = Math.hypot(dx, dz);
    let stepX = 0;
    let stepZ = 0;
    let facingX = 0;
    let facingZ = 0;

    if (len > 0.001) {
      const moveScale = window.virtualJoyActive ? Math.min(1.0, len) : 1.0;
      const dirX = dx / len;
      const dirZ = dz / len;
      const targetX = dirX * speed * moveScale;
      const targetZ = dirZ * speed * moveScale;

      if (isZeroG) {
        // Ease into the push-off instead of setting velocity instantly. On
        // release the remaining velocity decays gently, so a crewmate drifts
        // a short way and then settles against a handrail.
        const blend = 1 - Math.exp(-3.6 * delta);
        zeroGVelocity.x += (targetX - zeroGVelocity.x) * blend;
        zeroGVelocity.z += (targetZ - zeroGVelocity.z) * blend;
      } else {
        zeroGVelocity.x = 0;
        zeroGVelocity.z = 0;
        stepX = targetX * delta;
        stepZ = targetZ * delta;
        facingX = stepX;
        facingZ = stepZ;
      }
    } else if (isZeroG) {
      const decay = Math.exp(-1.35 * delta);
      zeroGVelocity.x *= decay;
      zeroGVelocity.z *= decay;
      if (Math.hypot(zeroGVelocity.x, zeroGVelocity.z) < 0.015) {
        zeroGVelocity.x = 0;
        zeroGVelocity.z = 0;
      }
    } else {
      zeroGVelocity.x = 0;
      zeroGVelocity.z = 0;
    }

    if (isZeroG) {
      stepX = zeroGVelocity.x * delta;
      stepZ = zeroGVelocity.z * delta;
      facingX = zeroGVelocity.x;
      facingZ = zeroGVelocity.z;
    }

    // Smoothly turn astronaut to face movement vector
    if (Math.hypot(facingX, facingZ) > 0.025) {
      const targetFacing = Math.atan2(facingX, facingZ);
      let diff = targetFacing - localCrew.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      localCrew.group.rotation.y += diff * Math.min(1, delta * 12);
    } else if (cameraMode === 0) {
      localCrew.group.rotation.y = camYaw;
    }

    const currentPos = localCrew.group.position;
    const previousX = currentPos.x;
    const previousZ = currentPos.z;

    if (isZeroG) {
      currentPos.y = ZERO_G_HOVER_Y;
    } else if (wasZeroG) {
      // Leaving the interior hands locomotion back to the ground controller.
      zeroGVelocity.x = 0;
      zeroGVelocity.z = 0;
      currentPos.y = 0;
    }

    const proposedPos = new THREE.Vector3(currentPos.x + stepX, currentPos.y, currentPos.z + stepZ);

    if (window.spaceCenter && window.spaceCenter.isGroundMode && typeof window.spaceCenter.resolveGroundCollision === "function") {
      const resolvedGround = window.spaceCenter.resolveGroundCollision(currentPos, proposedPos);
      if (resolvedGround && typeof resolvedGround.x === "number") {
        currentPos.set(resolvedGround.x, resolvedGround.y, resolvedGround.z);
      } else {
        currentPos.copy(proposedPos);
      }
    } else if (inISSInterior && typeof window.resolveShipInteriorCollision === "function") {
      const resolved = window.resolveShipInteriorCollision(currentPos, proposedPos, 0.32);
      if (resolved && typeof resolved.x === "number") {
        currentPos.set(resolved.x, currentPos.y, resolved.z);
        if (isZeroG) {
          // Kill only the blocked axis so a glancing push slides along the
          // module wall instead of stopping the whole drift.
          if (Math.abs(resolved.x - proposedPos.x) > 0.0001) zeroGVelocity.x *= 0.15;
          if (Math.abs(resolved.z - proposedPos.z) > 0.0001) zeroGVelocity.z *= 0.15;
        }
      } else {
        currentPos.copy(proposedPos);
      }
    } else {
      currentPos.copy(proposedPos);
    }

    const actuallyMoving = Math.hypot(currentPos.x - previousX, currentPos.z - previousZ) > 0.0001;

    // Update SpaceShip skeletal animations ('idle' / 'walk' / zero-g float)
    if (localCrew.rig && typeof localCrew.rig.updateAnimation === "function") {
      localCrew.rig.updateAnimation(delta, actuallyMoving, localCrew.isEva, !localCrew.isEva, null, isZeroG, isSprinting);
    }

    // Footstep sound effects while walking and running (grounded locomotion)
    const isDrivingCar = !!(window.spaceCenterCar && window.spaceCenterCar.isDriving);
    const isCrewBoarded = !!(window.spaceCenter && window.spaceCenter.isGroundMode && window.spaceCenter.crewBoarded);
    const canFootstep = actuallyMoving && !isZeroG && !isDrivingCar && !isCrewBoarded;

    if (canFootstep) {
      const stepInterval = isSprinting ? 0.26 : (localCrew.isEva ? 0.55 : 0.38);
      if (!localFootstepMoving) {
        localFootstepMoving = true;
        localFootstepTimer = stepInterval * 0.75;
      }
      localFootstepTimer += delta;
      if (localFootstepTimer >= stepInterval) {
        localFootstepTimer -= stepInterval;
        localFootstepSide = !localFootstepSide;
        if (window.spaceAudio && typeof window.spaceAudio.play === "function") {
          window.spaceAudio.play("footstep", {
            surface: getLocomotionSurface(currentPos),
            step: localFootstepSide,
            running: isSprinting,
            vol: isSprinting ? 0.95 : 0.70
          });
        }
      }
    } else {
      localFootstepMoving = false;
      localFootstepTimer = 0;
    }

    // Send coordinate update to network
    if (window.netManager) {
      window.netManager.sendPlayerUpdate(
        currentPos,
        localCrew.group.rotation.y,
        camPitch,
        localCrew.isEva,
        localCrew.suitLights,
        isSprinting
      );
    }

    // Check proximity for SpaceShip interactive stations (only when inside the station)
    if (window.gameplay && !(window.spaceCenter && window.spaceCenter.isGroundMode)) {
      window.gameplay.updateProximity(currentPos);
    }
  }

  // ============================================================================
  // CAMERA UPDATE (1ST PERSON, SPACESHIP 3RD-PERSON WALL-AWARE, TACTICAL ORBIT)
  // ============================================================================
  function updateTitleCamera(elapsed) {
    const t = elapsed || 0;
    if (localCrew.group) localCrew.group.visible = false;
    if (window.shipInterior && window.shipInterior.sunFlare) {
      window.shipInterior.sunFlare.group.visible = true;
      window.shipInterior.sunFlare.update(camera);
    }
    const camX = -10 + Math.sin(t * 0.06) * 12;
    const camY = 10 + Math.sin(t * 0.04) * 2.0;
    const camZ = -18 + Math.cos(t * 0.06) * 8;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(4, -18, -76);
  }

  function updateCamera() {
    if (!isGameStarted) return;
    if (!localCrew.group) return;
    if (window.spaceCenterCar && window.spaceCenterCar.isDriving) {
      window.spaceCenterCar.updateCamera(camera);
      return;
    }
    const px = localCrew.group.position.x;
    const py = localCrew.group.position.y;
    const pz = localCrew.group.position.z;

    const headX = px;
    const headY = py + 1.48;
    const headZ = pz;

    const sinY = Math.sin(camYaw);
    const cosY = Math.cos(camYaw);
    const cosPitch = Math.cos(camPitch);
    const sinPitch = Math.sin(camPitch);

    if (cameraMode === 0) {
      setLocalMeshVisibility(false);
      localCrew.group.visible = true;

      camera.position.set(
        headX + sinY * 0.14,
        headY + 0.12,
        headZ + cosY * 0.14
      );

      const lookDist = 30.0;
      camera.lookAt(
        camera.position.x + sinY * lookDist * cosPitch,
        headY + 0.12 + lookDist * sinPitch,
        camera.position.z + cosY * lookDist * cosPitch
      );
    } else if (cameraMode === 1) {
      setLocalMeshVisibility(true);
      localCrew.group.visible = true;

      const maxDist = localCrew.isEva ? 3.8 : (thirdPersonDist || 2.9);
      const horizDist = Math.cos(camPitch) * maxDist;
      const vertOffset = -Math.sin(camPitch) * maxDist;

      const fullOffsetX = -sinY * horizDist;
      const fullOffsetZ = -cosY * horizDist;

      let safeFrac = 1.0;
      if (!localCrew.isEva && window.shipInterior && window.shipInterior.group && window.shipInterior.group.visible && typeof window.shipInterior.isCameraClear === "function") {
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const f = i / steps;
          const tx = headX + fullOffsetX * f;
          const tz = headZ + fullOffsetZ * f;
          if (!window.shipInterior.isCameraClear(tx, tz)) {
            safeFrac = Math.max(0.22, (i - 1) / steps);
            break;
          }
        }
      }

      let desiredX = headX + fullOffsetX * safeFrac;
      let desiredZ = headZ + fullOffsetZ * safeFrac;
      const maxCameraHeight = window.shipInterior && window.shipInterior.issInteriorModel && window.shipInterior.group && window.shipInterior.group.visible ? 1.85 : 3.2;
      let camFloorY = py;
      if (window.spaceCenter && window.spaceCenter.isGroundMode && (window.spaceCenter.siteTourActive || (typeof window.spaceCenter._isLocalGroundCrew === "function" && window.spaceCenter._isLocalGroundCrew()))) {
        const terrain = window.SpaceCenterModules && window.SpaceCenterModules.terrain;
        if (terrain && typeof terrain.getSurfaceHeightAt === "function") {
          camFloorY = Math.max(py, terrain.getSurfaceHeightAt(desiredX, desiredZ, py));
        }
      }
      let desiredY = Math.max(camFloorY + 0.5, Math.min(py + maxCameraHeight, headY + 0.25 + vertOffset * safeFrac));

      // Keep the Earth Control third-person camera inside the walkable interior.
      // Without this it clips through the LCC partitions and the drop ceiling
      // whenever a ground operator backs up to a wall or turns around at a desk.
      if (
        window.spaceCenter &&
        window.spaceCenter.isGroundMode &&
        typeof window.spaceCenter.cameraSafePosition === "function"
      ) {
        const safe = window.spaceCenter.cameraSafePosition(
          new THREE.Vector3(headX, headY, headZ),
          new THREE.Vector3(desiredX, desiredY, desiredZ)
        );
        if (safe) {
          desiredX = safe.x;
          desiredY = safe.y;
          desiredZ = safe.z;
        }
      }

      if (!localCrew.isEva && window.shipInterior && window.shipInterior.issInteriorModel && window.shipInterior.group && window.shipInterior.group.visible && typeof window.shipInterior.cameraClearFraction === "function") {
        const origin = new THREE.Vector3(headX, headY, headZ);
        const destination = new THREE.Vector3(desiredX, desiredY, desiredZ);
        safeFrac = window.shipInterior.cameraClearFraction(origin, destination);
        destination.lerpVectors(origin, destination, safeFrac);
        const smoothed = camera.position.clone().lerp(destination, 0.25);
        const smoothFraction = window.shipInterior.cameraClearFraction(origin, smoothed);
        camera.position.lerpVectors(origin, smoothed, smoothFraction);
        camera.lookAt(headX + sinY * 2.5, headY, headZ + cosY * 2.5);
        return;
      }

      const groundCamera = !!(window.spaceCenter && window.spaceCenter.isGroundMode);
      const targetCamera = new THREE.Vector3(desiredX, desiredY, desiredZ);
      if (groundCamera && camera.position.distanceToSquared(targetCamera) > 36) {
        // Teleports (entering the LCC, site-tour jumps, role swaps) must snap.
        // Lerping from the pad leaves Earth Control looking at a distant launch
        // tower for seconds, especially on low-frame-rate machines.
        camera.position.copy(targetCamera);
      } else {
        camera.position.lerp(targetCamera, 0.25);
      }
      camera.lookAt(headX + sinY * 2.5, headY, headZ + cosY * 2.5);
    }
  }

  // ============================================================================
  // REAL-TIME PERFORMANCE MONITOR & ADAPTIVE MOBILE RESOLUTION SCALING
  // ============================================================================
  let frameCount = 0;
  let lastFpsTime = performance.now();
  let currentFps = 60;
  let currentPing = null;

  function updateFpsMeter() {
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastFpsTime;
    if (elapsed >= 500) {
      currentFps = Math.max(1, Math.round((frameCount * 1000) / elapsed));
      frameTimeMs = Number((elapsed / frameCount).toFixed(1));
      fpsHistory.push(currentFps);
      if (fpsHistory.length > 12) fpsHistory.shift();
      minFps = Math.min(...fpsHistory);
      maxFps = Math.max(...fpsHistory);
      frameCount = 0;
      lastFpsTime = now;

      // Adaptive Dynamic Resolution Scaling (DRS) for desktop and mobile.
      // Keep the simulation/network responsive even on high-DPI displays or
      // integrated GPUs by trading a little fill-rate for a steady frame time.
      if (renderer && !document.hidden && now - lastDrsAdjustTime >= 1500) {
        const fpsCapTarget = perfSettings.fpsCap > 0 ? perfSettings.fpsCap : 60;
        const lowThreshold = fpsCapTarget <= 35 ? fpsCapTarget - 12 : 45;
        const highThreshold = fpsCapTarget <= 35 ? fpsCapTarget - 3 : 57;
        if (currentFps < lowThreshold && dynamicResolutionMultiplier > 0.7) {
          dynamicResolutionMultiplier = Math.max(0.7, Number((dynamicResolutionMultiplier - 0.08).toFixed(2)));
          lastDrsAdjustTime = now;
          applyPerfSettings();
        } else if (currentFps >= highThreshold && dynamicResolutionMultiplier < 1.0) {
          dynamicResolutionMultiplier = Math.min(1.0, Number((dynamicResolutionMultiplier + 0.05).toFixed(2)));
          lastDrsAdjustTime = now;
          applyPerfSettings();
        }
      }

      updatePerfDisplay();
    }
  }

  function updatePerfDisplay() {
    const fpsVal = document.getElementById("perf-fps-val");
    const fpsDot = document.getElementById("perf-fps-dot");
    const pingVal = document.getElementById("perf-ping-val");
    const pingDot = document.getElementById("perf-ping-dot");
    const latencyBadge = document.getElementById("perf-latency-badge");

    if (fpsVal) {
      fpsVal.textContent = currentFps;
      const fpsColor = currentFps >= 50 ? "#63e6a8" : (currentFps >= 30 ? "var(--ui-brand)" : "#ff6b6b");
      fpsVal.style.color = fpsColor;
      if (fpsDot) fpsDot.style.background = fpsColor;
    }

    let latencyTier = "nominal";
    let statusText = "NOMINAL";
    if (pingVal && currentPing !== null) {
      pingVal.textContent = `${currentPing} ms`;
      let pingColor = "#63e6a8";

      if (currentPing < 80) {
        pingColor = "#63e6a8";
        statusText = "NOMINAL";
        latencyTier = "nominal";
      } else if (currentPing < 180) {
        pingColor = "var(--ui-brand)";
        statusText = "MODERATE";
        latencyTier = "moderate";
      } else {
        pingColor = "#ff6b6b";
        statusText = "HIGH LATENCY";
        latencyTier = "caution";
      }

      pingVal.style.color = pingColor;
      if (pingDot) pingDot.style.background = pingColor;
      if (latencyBadge) {
        latencyBadge.textContent = statusText;
        latencyBadge.className = `perf-status-badge perf-${latencyTier}`;
      }
    }

    const netTelemetry = (window.netManager && typeof window.netManager.getTelemetry === "function")
      ? window.netManager.getTelemetry()
      : null;
    const jitterMs = netTelemetry ? (netTelemetry.jitter || 0) : 0;
    const packetsOut = netTelemetry ? (netTelemetry.packetsOut || 0) : 0;
    const packetsIn = netTelemetry ? (netTelemetry.packetsIn || 0) : 0;
    const isConnected = netTelemetry ? Boolean(netTelemetry.connected) : false;
    const transportName = netTelemetry && netTelemetry.transport ? String(netTelemetry.transport).toUpperCase() : "OFFLINE";

    const diagFrametime = document.getElementById("diag-frametime");
    const diagFpsMinmax = document.getElementById("diag-fps-minmax");
    const diagPingJitter = document.getElementById("diag-ping-jitter");
    const diagConnQuality = document.getElementById("diag-conn-quality");
    const diagPacketRates = document.getElementById("diag-packet-rates");
    const diagTickrateCull = document.getElementById("diag-tickrate-cull");
    const diagResolution = document.getElementById("diag-resolution");
    const diagShaderStatus = document.getElementById("diag-shader-status");
    const diagClock = document.getElementById("diag-clock");

    if (diagFrametime) diagFrametime.textContent = `${frameTimeMs.toFixed(1)} ms`;
    if (diagFpsMinmax) diagFpsMinmax.textContent = `FPS: ${currentFps} | Min: ${minFps} Max: ${maxFps}`;
    if (diagPingJitter) diagPingJitter.textContent = `${currentPing !== null ? currentPing : "--"} ms (±${jitterMs} ms)`;
    if (diagConnQuality) diagConnQuality.textContent = `STATUS: ${isConnected ? statusText : "OFFLINE"} · ${transportName}`;
    if (diagPacketRates) diagPacketRates.textContent = `↑ ${packetsOut} /s • ↓ ${packetsIn} /s`;
    if (diagTickrateCull) diagTickrateCull.textContent = `${perfSettings.tickRate} Hz | ${perfSettings.deltaCulling ? "DELTA CULLING" : "FULL STREAM"}`;
    if (diagResolution) {
      const { w, h } = getViewportSize();
      const effectiveScale = getEffectiveRenderScale();
      const renderW = Math.max(1, Math.round(w * effectiveScale));
      const renderH = Math.max(1, Math.round(h * effectiveScale));
      const drsTag = dynamicResolutionMultiplier < 0.999 ? " · DRS" : "";
      diagResolution.textContent = `${renderW}x${renderH} @ ${effectiveScale.toFixed(2)}x${drsTag}`;
    }
    if (diagShaderStatus) diagShaderStatus.textContent = `POST-FX: ${String(perfSettings.cinematicPreset || "balanced").toUpperCase()}`;
    if (diagClock) diagClock.textContent = `UTC ${new Date().toISOString().slice(11, 19)}`;

    const netDiagStatus = document.getElementById("net-diag-status");
    const netDiagPing = document.getElementById("net-diag-ping");
    const netDiagJitter = document.getElementById("net-diag-jitter");
    if (netDiagStatus) {
      netDiagStatus.textContent = isConnected ? "ONLINE" : "OFFLINE";
      netDiagStatus.style.color = isConnected ? "#63e6a8" : "#ff6b6b";
    }
    if (netDiagPing) netDiagPing.textContent = `${currentPing !== null ? currentPing : "--"} ms`;
    if (netDiagJitter) netDiagJitter.textContent = `±${jitterMs} ms`;
  }

  setInterval(() => {
    if (document.hidden) return;
    if (window.netManager && window.netManager.socket && window.netManager.connected) {
      const pingStart = performance.now();
      window.netManager.socket.timeout(3000).emit("client_ping", Date.now(), (err) => {
        if (err) return;
        const rtt = Math.max(1, Math.round(performance.now() - pingStart));
        // Display a rolling median rather than a single ack. This prevents one
        // long frame / GC pause from making the latency pill look permanently
        // red when the network itself is healthy.
        currentPing = typeof window.netManager.recordPing === "function"
          ? window.netManager.recordPing(rtt)
          : rtt;
        updatePerfDisplay();
      });
    }
  }, 1000);

  // ============================================================================
  // ANIMATION LOOP (WebXR & Desktop Compatible)
  // ============================================================================
  function renderFrame() {
    const isPresentingXR = !!(renderer && renderer.xr && renderer.xr.isPresenting);
    const now = performance.now();
    if (!isPresentingXR && perfSettings && perfSettings.fpsCap > 0) {
      const minInterval = 1000 / perfSettings.fpsCap;
      if (now - lastFrameRenderTimestamp < minInterval - 1.0) {
        return;
      }
    }
    lastFrameRenderTimestamp = now;

    updateFpsMeter();

    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();

    if (window.artemisGame && window.artemisGame.isActive) {
      window.artemisGame.frame(delta);
      return;
    }

    if (window.shuttleGame && window.shuttleGame.isActive) {
      window.shuttleGame.frame(delta);
      return;
    }

    if (window.photorealisticEarth && typeof window.photorealisticEarth.update === "function") {
      window.photorealisticEarth.update(delta, camera);
    }

    if (window.glbManager && typeof window.glbManager.updateFleet === "function") {
      window.glbManager.updateFleet(delta, elapsed);
    }

    updateHudCompass(delta);

    if (window.shipInterior && typeof window.shipInterior.update === "function") {
      window.shipInterior.update(delta, elapsed, camera);
    }

    if (window.spaceCenter && window.spaceCenter.isGroundMode && typeof window.spaceCenter.update === "function") {
      window.spaceCenter.update(delta, camera, elapsed);
    }

    // Drivable open-top ground car (kept outside the ground-only update so it
    // can park its prompt/HUD correctly during phase changes).
    if (window.spaceCenterCar && typeof window.spaceCenterCar.update === "function") {
      window.spaceCenterCar.update(delta);
    }

    if (window.spaceCenterGroundMap && typeof window.spaceCenterGroundMap.update === "function") {
      window.spaceCenterGroundMap.update(delta);
    }

    if (window.launchCutscene && typeof window.launchCutscene.update === "function") {
      window.launchCutscene.update(delta);
    }

    if (window.dockingSim && typeof window.dockingSim.update === "function") {
      window.dockingSim.update(delta);
    }

    if (window.missionViz && typeof window.missionViz.update === "function") {
      window.missionViz.update(delta, elapsed, camera);
    }

    if (window.solarSystem && typeof window.solarSystem.update === "function") {
      window.solarSystem.update(delta, elapsed, camera);
    }

    if (window.issShowcase && typeof window.issShowcase.update === "function") {
      window.issShowcase.update(delta, elapsed, camera);
    }

    if (!isGameStarted) {
      updateTitleCamera(elapsed);
    } else if (window.launchCutscene && window.launchCutscene.isPlaying) {
      // Launch Cutscene controls camera ascent trajectory
    } else if (window.dockingSim && window.dockingSim.isActive) {
      // Orbital Docking Simulator controls 6DOF docking camera
    } else if (window.missionViz && window.missionViz.isActive) {
      // NASA Mission Viz Trajectory Theater controls 3D orbital camera
    } else if (window.solarSystem && window.solarSystem.isActive) {
      // Solar System Atlas controls its own orbital camera
    } else if (window.issShowcase && window.issShowcase.isActive) {
      // ISS Showcase controls camera orbit & part focus
    } else if (window.shipInterior && window.shipInterior.isMoonLandingActive) {
      // Lunar Touchdown Scene controls camera orbit around Apollo Lunar Module
    } else if (
      window.spaceCenter &&
      window.spaceCenter.isGroundMode &&
      window.spaceCenter.crewBoarded &&
      !(typeof window.spaceCenter._isLocalGroundCrew === "function" && window.spaceCenter._isLocalGroundCrew())
    ) {
      // Cockpit / pad camera while boarded awaiting launch. Keep the whole
      // stack in frame with an unobstructed view from 90° right (North-East perspective).
      // Earth Control never boards, so ground operators must always keep their
      // own LCC first/third-person camera instead of this distant pad shot.
      const t = performance.now() * 0.001;
      camera.position.lerp(
        new THREE.Vector3(96 + Math.cos(t * 0.12) * 5, 46, -72 - Math.sin(t * 0.12) * 5),
        0.06
      );
      camera.lookAt(0, 42, 0);
    } else {
      updatePlayerPhysics(delta);
      updateCamera();
      // In an immersive WebXR session the XR manager owns the head pose; move
      // the rig with the crewmember so WASD locomotion works in the headset.
      if (
        window.vrManager &&
        window.vrManager.isWebXRActive &&
        renderer.xr &&
        renderer.xr.isPresenting &&
        localCrew.group &&
        localCrew.group.visible &&
        typeof window.vrManager.syncRigToPlayer === "function"
      ) {
        window.vrManager.syncRigToPlayer(localCrew.group, camYaw);
      }
    }

    // Lerp Remote Astronauts
    if (window.netManager) {
      window.netManager.updateRemotePlayersInterpolation(delta);

      for (const id in window.netManager.remotePlayers) {
        const rp = window.netManager.remotePlayers[id];
        if (!remoteCrewMeshes[id]) {
          const isH = window.netManager.roomState && window.netManager.roomState.hostId === id;
          const fallbackModel = rp.modelId || "astronaut_lod1";
          const chosenModel = window.glbManager && typeof window.glbManager.getModelIdForRole === "function"
            ? window.glbManager.getModelIdForRole(rp.role, fallbackModel)
            : fallbackModel;
          const rig = createAstronautMesh(
            rp.color || "#3b82f6",
            rp.role || "engineer",
            rp.name || "Crew",
            isH,
            chosenModel,
            rp.team || "crew",
            { enableLight: false, castShadow: false }
          );
          remoteCrewMeshes[id] = rig.root;
          rp.mesh = rig.root;
          rp.rig = rig;
          rp.lastModelId = chosenModel;
          rp.lastEmoteSerial = rp.emoteSerial || 0;
          rp.nameBadge = rig.nameBadge;
          if (rp.curPos) {
            rig.root.position.set(rp.curPos[0], rp.curPos[1], rp.curPos[2]);
            rig.root.rotation.y = rp.curYaw || 0;
          }
          scene.add(rig.root);
        } else {
          const fallbackModel = rp.modelId || "astronaut_lod1";
          const desiredModel = window.glbManager && typeof window.glbManager.getModelIdForRole === "function"
            ? window.glbManager.getModelIdForRole(rp.role, fallbackModel)
            : fallbackModel;
          if (rp.lastModelId && rp.lastModelId !== desiredModel) {
            scene.remove(remoteCrewMeshes[id]);
            delete remoteCrewMeshes[id];
            continue;
          }
          if (rp.rig) {
            if (rp.lastColor !== rp.color) {
              rp.lastColor = rp.color;
              if (typeof rp.rig.setColor === "function") rp.rig.setColor(rp.color);
            }
            if (typeof rp.rig.updateAnimation === "function" && !rp.driving) {
              // Network packets — not the interpolated render position — decide
              // whether the crewmate is actually walking. Comparing curPos to
              // targetPos would keep the walk cycle looping while an idle avatar
              // is briefly held/extrapolated ahead of its last packet.
              const isMoving = !!(rp.lastMoveAt && (performance.now() - rp.lastMoveAt) < 300);
              rp.rig.updateAnimation(delta, isMoving, rp.isEva, !rp.isEva, null, isISSInteriorViewActive() && !rp.isEva, !!rp.isSprinting);

              // Positional 3D footsteps for nearby crewmates
              const rpZeroG = isISSInteriorViewActive() && !rp.isEva;
              if (isMoving && !rpZeroG && camera && rp.mesh) {
                const rpInterval = rp.isSprinting ? 0.26 : 0.38;
                rp._stepTimer = (rp._stepTimer || (rpInterval * 0.75)) + delta;
                if (rp._stepTimer >= rpInterval) {
                  rp._stepTimer -= rpInterval;
                  rp._stepSide = !rp._stepSide;
                  const dist = camera.position.distanceTo(rp.mesh.position);
                  if (dist < 24 && window.spaceAudio && typeof window.spaceAudio.play === "function") {
                    const falloff = Math.max(0, 1 - (dist / 24));
                    const rel = new THREE.Vector3().subVectors(rp.mesh.position, camera.position);
                    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                    const pan = Math.max(-0.85, Math.min(0.85, rel.dot(camRight) / 10));
                    window.spaceAudio.play("footstep", {
                      surface: getLocomotionSurface(rp.mesh.position),
                      step: rp._stepSide,
                      running: !!rp.isSprinting,
                      pan,
                      vol: (rp.isSprinting ? 0.45 : 0.32) * falloff * falloff
                    });
                  }
                }
              } else {
                rp._stepTimer = 0;
              }
            }
            if (rp.rig && typeof rp.rig.playEmote === "function" && rp.emoteSerial && rp.lastEmoteSerial !== rp.emoteSerial) {
              rp.lastEmoteSerial = rp.emoteSerial;
              rp.rig.playEmote(rp.emoteId);
            }
          }
          if (rp.nameBadge && rp.nameBadge.userData && rp.nameBadge.userData.update) {
            const isH = window.netManager.roomState && window.netManager.roomState.hostId === id;
            const isSpk = !!rp.isSpeaking;
            const isMut = !!rp.isMuted;
            const isRad = !!rp.isRadio;
            if (
              rp.lastSpk !== isSpk ||
              rp.lastMut !== isMut ||
              rp.lastRad !== isRad ||
              rp.lastName !== rp.name ||
              rp.lastBadgeColor !== rp.color ||
              rp.lastRole !== rp.role ||
              rp.lastHost !== isH
            ) {
              rp.lastSpk = isSpk;
              rp.lastMut = isMut;
              rp.lastRad = isRad;
              rp.lastName = rp.name;
              rp.lastBadgeColor = rp.color;
              rp.lastRole = rp.role;
              rp.lastHost = isH;
              rp.nameBadge.userData.update(rp.name, rp.color, rp.role, isH, isSpk, isMut, isRad);
            }
          }
        }
      }

      const activeMission = typeof window.netManager.getMission === "function"
        ? window.netManager.getMission()
        : null;
      const missionPhase = activeMission
        ? activeMission.phase
        : (window.spaceCenter ? window.spaceCenter.missionPhase : "gantry");
      const boardedIds = activeMission && Array.isArray(activeMission.boarded)
        ? activeMission.boarded
        : [];
      const crewInFlight = missionPhase === "launch" || missionPhase === "docking";

      const rolesApi = window.InterfellasRoles;
      const orbitalView = !!(
        (window.solarSystem && window.solarSystem.isActive) ||
        (window.missionViz && window.missionViz.isActive) ||
        (window.issShowcase && window.issShowcase.isActive)
      );
      for (const id in remoteCrewMeshes) {
        const rp = window.netManager.remotePlayers[id];
        if (!rp) {
          scene.remove(remoteCrewMeshes[id]);
          delete remoteCrewMeshes[id];
        } else if (orbitalView) {
          remoteCrewMeshes[id].visible = false;
        } else {
          const peerIsGround = rp.team === "ground" || (rolesApi && typeof rolesApi.isGroundRole === "function" && rolesApi.isGroundRole(rp.role));
          const boarded = missionPhase === "gantry" && !peerIsGround && boardedIds.indexOf(id) !== -1;
          if (window.spaceCenter && window.spaceCenter.isGroundMode) {
            remoteCrewMeshes[id].visible = peerIsGround || (missionPhase === "gantry" && !boarded);
          } else {
            remoteCrewMeshes[id].visible = !crewInFlight && !boarded && !peerIsGround;
          }
        }
      }

      // Each client owns one local car, so remote drivers need a visual-only
      // clone positioned from their interpolated network pose. The driver's
      // actual crew rig is seated on the car's seat anchor, so both players see
      // real human models instead of the placeholder mannequin.
      const groundView = !!(window.spaceCenter && window.spaceCenter.isGroundMode);
      for (const id in window.netManager.remotePlayers) {
        const rp = window.netManager.remotePlayers[id];
        if (!rp) continue;
        const car = ensureRemoteCarVisual(id, rp);
        if (!car) continue;
        const shouldShow = !!(groundView && !crewInFlight && !orbitalView);
        car.visible = shouldShow;
        if (rp.driving && rp.mesh) {
          if (!shouldShow) {
            rp.mesh.visible = false;
          } else if (rp.curPos) {
            car.position.set(rp.curPos[0], rp.curPos[1], rp.curPos[2]);
            car.rotation.y = rp.curYaw || 0;
            car.updateMatrixWorld(true);

            if (rp.rig) {
              const seat = car.userData.driverSeat || car;
              seat.getWorldPosition(remoteSeatPosition);
              seat.getWorldQuaternion(remoteSeatQuaternion);
              rp.mesh.position.copy(remoteSeatPosition);
              rp.mesh.quaternion.copy(remoteSeatQuaternion);
              rp.mesh.visible = true;
              if (typeof rp.rig.updateAnimation === "function") {
                rp.rig.updateAnimation(delta, false, false, true, null, false, false, true, 0);
              }
            }
          }
        }
      }
      for (const id in remoteCarMeshes) {
        if (!window.netManager.remotePlayers[id]) {
          scene.remove(remoteCarMeshes[id]);
          delete remoteCarMeshes[id];
        }
      }
    }

    if (window.voiceManager && localCrew.group) {
      window.voiceManager.updateProximity(
        localCrew.group.position,
        localCrew.group.rotation.y,
        window.netManager ? window.netManager.remotePlayers : {}
      );
    }

    // Keep the atlas independent of world visibility changes from mission updates.
    const renderScene = window.solarSystem && window.solarSystem.isActive && window.solarSystem.atlasScene
      ? window.solarSystem.atlasScene : scene;
    // Render (routes through WebXR / Stereo VR manager when active, bypassing postprocessing)
    if (window.vrManager && typeof window.vrManager.render === "function") {
      window.vrManager.render(renderScene, camera, cinematicPass, elapsed, perfSettings);
    } else if (cinematicPass && perfSettings.cinematicPreset !== "off") {
      cinematicPass.render(renderScene, camera, elapsed);
    } else {
      renderer.render(renderScene, camera);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    renderFrame();
  }

  function onWindowResize() {
    const { w, h } = syncViewportCSSVars();
    syncResponsiveHudState(w, h);
    if (camera) {
      camera.aspect = w / h;
      camera.fov = computeEffectiveFov(perfSettings ? perfSettings.fov : 62, camera.aspect);
      camera.updateProjectionMatrix();
    }
    applyRenderResolution(w, h);
    if (window.shuttleGame) {
      window.shuttleGame.resize();
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();