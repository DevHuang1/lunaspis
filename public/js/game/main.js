/**
 * ============================================================================
 * INTERFELLAS 3D MULTIPLAYER ENGINE & THREE.JS SCENE PIPELINE (SPACESHIP EDITION)
 * ============================================================================
 * Integrates all 3D ship designs, interiors, models, shaders, and interactive
 * systems from SpaceShip (Perilune — Orbital / Mission Lab) in vanilla Three.js:
 * - 6-Room Perilune Orbital Transit Craft Interior + Exterior Hull & Solar Arrays
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
    renderScale: isMobile ? 90 : 100,
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
    const drs = Math.max(0.7, Math.min(1.0, Number(dynamicResolutionMultiplier) || 1.0));
    return Math.max(0.35, Math.min(MAX_RENDER_SCALE, userScale * drs));
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
    if (Array.isArray(interiorPointLights)) {
      interiorPointLights.forEach((pl, idx) => {
        if (perfSettings.lightingQuality === "low") {
          pl.visible = (idx % 2 === 0);
          pl.intensity = 0.8;
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
    color: "#67e8f9",
    isEva: false,
    suitLights: true,
    magBoots: true,
    walkCycle: 0
  };

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
    if (localCrew.rig && localCrew.rig.shadowMesh) {
      localCrew.rig.shadowMesh.visible = visible;
    }
    if (localCrew.rig && localCrew.rig.accentRing) {
      localCrew.rig.accentRing.visible = visible;
    }
    if (localCrew.rig && localCrew.rig.emoteBubble) {
      localCrew.rig.emoteBubbleHidden = !visible;
      localCrew.rig.emoteBubble.sprite.visible = visible && Boolean(localCrew.rig.emote);
    }
    if (localCrew.nameBadge) localCrew.nameBadge.visible = false;
  }

  // Remote crew avatars container (socketId -> 3D Object)
  const remoteCrewMeshes = {};

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
    { id: 0, name: "1ST PERSON", icon: "👁️" },
    { id: 1, name: "3RD PERSON", icon: "🎥" }
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
    const isCompact = size.w <= 1024 || size.h <= 760 || isMobile;

    if (isMobile) {
      document.body.classList.add("touch-ui");
    }

    const checklistTitle = document.getElementById("hud-checklist-title");
    if (checklistTitle) {
      checklistTitle.textContent = (isNarrow || isMobile) ? "OBJECTIVES" : "MISSION OBJECTIVES";
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
      lobbyHint.innerHTML = "<strong>Thumbstick</strong> Move &bull; <strong>Drag</strong> Look &bull; <strong>Tap</strong> Console &bull; <strong>EMOTE</strong> &bull; <strong>CAM</strong>";
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
        <span class="emote-hotkey">${index + 1}</span>
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.75));
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

    // 5. Initialize Perilune 27-Part Interactive ISS Reference Showcase, Mission Viz & VR Mode
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

    // 5b. Preload Perilune GLB Assets
    if (window.glbManager) {
      const primaryAstronautPath = isMobile ? "models/astronaut/astronaut_lod1.glb" : "models/astronaut/astronaut_lod0.glb";
      window.glbManager.loadGLB(primaryAstronautPath).catch(() => {});
      window.glbManager.loadGLB("models/astronaut/astronaut_lod1.glb").catch(() => {});
      window.glbManager.loadGLB("models/iss/ISS_stationary_opt.glb").catch(() => {});
    }

    // 5c. Perilune 6-Room Modular Spacecraft Interior (hidden during orbital title screen until mission launch)
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
    buildLocalAstronaut("#67e8f9", "commander", isMobile ? "astronaut_lod1" : "astronaut_lod0");

    // 7. Setup UI & Network Flow
    setupMissionControlFlow();
    updateCameraModeUI();
    if (window.gameplay) {
      window.gameplay.init();
      window.gameplay.updateTaskListUI();
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
    setupEmoteWheel();
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
          console.log(`🛰️ [SpaceShip] High-fidelity NASA ISS (${modelId}) loaded & wired to 27-part Showcase.`);
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
  function createNameBadgeSprite(name = "Astronaut", color = "#67e8f9", role = "commander", isHost = false, team = "crew") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");

    function drawBadge(n, c, r, h, isSpeaking = false, isMuted = false, isRadio = false, currentTeam = "crew") {
      ctx.clearRect(0, 0, 512, 160);
      const pillX = 36, pillY = 24, pillW = 440, pillH = 112, rad = 24;

      ctx.save();
      let glowColor = c || (currentTeam === "crew" ? "#67e8f9" : currentTeam === "bravo" ? "#3b82f6" : "#ef4444");
      if (isRadio) glowColor = "#f59e0b";
      else if (isSpeaking) glowColor = "#22c55e";

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
      if (h) prefix += "👑 ";
      if (isRadio) prefix += "📻 ";
      else if (isSpeaking) prefix += "🎙️ ";
      else if (isMuted) prefix += "🔇 ";

      const displayName = prefix + String(n || "CREW").toUpperCase();
      ctx.font = "900 34px 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      if (isRadio) ctx.fillStyle = "#fef08a";
      else if (isSpeaking) ctx.fillStyle = "#4ade80";
      else ctx.fillStyle = "#ffffff";

      ctx.fillText(displayName, 256, 62);

      const roleMeta = window.InterfellasRoles
        ? window.InterfellasRoles.getRoleMeta(r)
        : { short: String(r || "CREW").slice(0, 3).toUpperCase(), label: String(r || "CREW").toUpperCase() };
      const roleBanner = `[${roleMeta.short}] ${roleMeta.label}`;

      ctx.font = "800 22px 'SF Mono', Monaco, Consolas, monospace";
      if (isRadio) {
        ctx.fillStyle = "#fde047";
        ctx.fillText("● " + roleBanner + " [RADIO]", 256, 104);
      } else if (isSpeaking) {
        ctx.fillStyle = "#86efac";
        ctx.fillText("● " + roleBanner + " [PROX]", 256, 104);
      } else {
        ctx.fillStyle = c || roleMeta.color || "#67e8f9";
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

  function createAstronautMesh(suitHexColor = "#67e8f9", role = "commander", name = "Astronaut", isHost = false, modelKey = null, team = "crew", options = {}) {
    if (window.glbManager && typeof window.glbManager.createAstronautRig === "function") {
      return window.glbManager.createAstronautRig(suitHexColor, role, name, isHost, modelKey, team, options);
    }
    const root = new THREE.Group();
    return { root };
  }

  function buildLocalAstronaut(color = "#67e8f9", role = "commander", modelKey = null) {
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
    const defaultModel = isMobile ? "astronaut_lod1" : "astronaut_lod0";
    const chosenModel = modelKey || (window.glbManager ? window.glbManager.selectedAvatarModelId : defaultModel);

    const rig = createAstronautMesh(color, normalizedRole, pName, isHost, chosenModel, team, {
      enableLight: !isMobile,
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
    localCrew.team = team;

    // Preserve active in-world coordinates when swapping suits/roles mid-mission;
    // otherwise spawn at Perilune's PLAYER_SPAWN in Transit Hub facing -Z.
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

    let regSelectedColor = "#67e8f9";
    let dossierSelectedColor = "#67e8f9";

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
        window.netManager.localPlayer.color = "#67e8f9";
        window.netManager.localPlayer.role = "commander";
        buildLocalAstronaut("#67e8f9", "commander", defaultModel);
        return;
      }

      const rank = astro.flight_title || "Commander";
      const callsign = astro.callsign || astro.username;
      const color = astro.suit_color || "#67e8f9";

      if (authStatusTitle) authStatusTitle.textContent = `${callsign.toUpperCase()}`;
      if (authStatusDesc) authStatusDesc.textContent = `${rank.toUpperCase()}`;
      if (btnOpenAuth) btnOpenAuth.textContent = "DOSSIER";
      if (btnAuthLogout) btnAuthLogout.style.display = "inline-block";
      if (tabDossier) tabDossier.style.display = "inline-block";

      if (inputName) inputName.value = callsign;

      const statMissions = document.getElementById("stat-missions");
      const statVictories = document.getElementById("stat-victories");
      const statTasks = document.getElementById("stat-tasks");
      if (statMissions) statMissions.textContent = astro.games_played || 0;
      if (statVictories) statVictories.textContent = astro.games_won || 0;
      if (statTasks) statTasks.textContent = astro.tasks_completed || 0;

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

      dossierSelectedColor = currentAstronaut.suit_color || "#67e8f9";
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
      const stored = localStorage.getItem("nasa_astronaut_credential");
      if (stored) {
        const parsed = JSON.parse(stored);
        applyAstronautProfile(parsed);
        if (parsed.token) {
          fetch("/api/auth/me", {
            headers: { "Authorization": `Bearer ${parsed.token}` }
          })
            .then(r => r.json())
            .then(data => {
              if (data.success && data.user) {
                const credential = { ...data.user, token: parsed.token };
                localStorage.setItem("nasa_astronaut_credential", JSON.stringify(credential));
                applyAstronautProfile(credential);
              } else {
                localStorage.removeItem("nasa_astronaut_credential");
                if (window.netManager && typeof window.netManager.setAuthToken === "function") {
                  window.netManager.setAuthToken(null);
                }
                applyAstronautProfile(null);
              }
            }).catch(() => {});
        }
      } else {
        applyAstronautProfile(null);
      }
    } catch (e) {
      applyAstronautProfile(null);
    }

    if (inputName) {
      if (!currentAstronaut) inputName.value = window.netManager.localPlayer.name;
      inputName.addEventListener("input", (e) => {
        window.netManager.localPlayer.name = e.target.value;
      });
    }

    window.netManager.on("user_synced", (profile) => {
      if (!profile || currentAstronaut) return;
      const displayName = profile.callsign || profile.username;
      if (inputName && displayName) inputName.value = displayName;
      const statMissions = document.getElementById("stat-missions");
      const statVictories = document.getElementById("stat-victories");
      const statTasks = document.getElementById("stat-tasks");
      if (statMissions) statMissions.textContent = profile.games_played || 0;
      if (statVictories) statVictories.textContent = profile.games_won || 0;
      if (statTasks) statTasks.textContent = profile.tasks_completed || 0;
    });

    if (btnHost) {
      btnHost.addEventListener("click", () => {
        const name = inputName ? inputName.value.trim() : (currentAstronaut ? currentAstronaut.callsign : "Commander");
        const color = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.color)
          || (currentAstronaut ? currentAstronaut.suit_color : "#67e8f9");
        const rawRole = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.role)
          || (currentAstronaut ? (currentAstronaut.preferred_role || currentAstronaut.flight_title) : "commander");
        const role = window.InterfellasRoles ? window.InterfellasRoles.normalizeRole(rawRole, "commander") : "commander";
        window.netManager.createRoom(name, color, role, {
          explicitRole: !!(window.netManager && window.netManager.explicitRoleSelected)
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
          || (currentAstronaut ? currentAstronaut.suit_color : "#67e8f9");
        const explicitRole = !!(window.netManager && window.netManager.explicitRoleSelected);
        const rawRole = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.role)
          || (currentAstronaut ? (currentAstronaut.preferred_role || currentAstronaut.flight_title) : "commander");
        const role = window.InterfellasRoles ? window.InterfellasRoles.normalizeRole(rawRole, "commander") : "commander";
        window.netManager.joinRoom(code, name, color, explicitRole ? role : null, { explicitRole });
      });
    }

    if (btnQuick) {
      btnQuick.addEventListener("click", () => {
        const name = inputName ? inputName.value.trim() : (currentAstronaut ? currentAstronaut.callsign : "Crew");
        const color = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.color)
          || (currentAstronaut ? currentAstronaut.suit_color : "#67e8f9");
        const explicitRole = !!(window.netManager && window.netManager.explicitRoleSelected);
        const rawRole = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.role)
          || (currentAstronaut ? (currentAstronaut.preferred_role || currentAstronaut.flight_title) : "commander");
        const role = window.InterfellasRoles ? window.InterfellasRoles.normalizeRole(rawRole, "commander") : "commander";
        window.netManager.quickPlay(name, color, explicitRole ? role : null, { explicitRole });
      });
    }

    if (btnCopyLink) {
      btnCopyLink.addEventListener("click", () => {
        const code = window.netManager.roomId;
        if (!code) return;
        const link = `${window.location.origin}/?room=${code}`;
        navigator.clipboard.writeText(link).then(() => {
          btnCopyLink.textContent = "COPIED TO CLIPBOARD!";
          setTimeout(() => { btnCopyLink.textContent = "📋 COPY INVITE LINK"; }, 2500);
        });
      });
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
        "solar-system-active",
        "vr-stereo-active",
        "vr-webxr-active"
      );

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

      const resBar = document.getElementById("perilune-resource-meters");
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
    }

    function leaveCurrentRoom() {
      if (window.netManager && typeof window.netManager.leaveRoom === "function") {
        window.netManager.leaveRoom();
      }
      cleanupGameWorldForLobby();

      if (window.location.search && window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", window.location.pathname);
      }
      if (screenLobby) screenLobby.style.display = "none";
      if (screenGame) screenGame.style.display = "none";
      if (screenMenu) screenMenu.style.display = "flex";
    }

    window.netManager.on("lobby_returned", (data) => {
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
          window.netManager.startGame();
        }
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

    document.querySelectorAll(".lobby-role-card").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const rawRole = e.currentTarget.getAttribute("data-role");
        const role = window.InterfellasRoles ? window.InterfellasRoles.normalizeRole(rawRole, "commander") : rawRole;
        window.netManager.explicitRoleSelected = true;
        window.netManager.customizeAstronaut(null, null, role, null, null, null, { explicitRole: true });
        buildLocalAstronaut(window.netManager.localPlayer.color, role);
        if (typeof window.syncLobbySelectionUI === "function") window.syncLobbySelectionUI();
        if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();
        if (window.gameplay && typeof window.gameplay.updateTaskListUI === "function") window.gameplay.updateTaskListUI();
        if (window.spaceAudio) window.spaceAudio.playClick();
      });
    });

    const btnHangarMenu = document.getElementById("btn-open-hangar-menu");
    if (btnHangarMenu) {
      btnHangarMenu.addEventListener("click", () => {
        if (window.glbManager) window.glbManager.openHangar();
      });
    }

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
        || (currentAstronaut ? currentAstronaut.suit_color : "#67e8f9");
      const explicitRole = !!(window.netManager && window.netManager.explicitRoleSelected);
      const rawRole = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.role)
        || (currentAstronaut ? (currentAstronaut.preferred_role || currentAstronaut.flight_title) : "commander");
      const role = window.InterfellasRoles ? window.InterfellasRoles.normalizeRole(rawRole, "commander") : "commander";
      window.netManager.joinRoom(roomCode, inputName ? inputName.value : "Crew", color, explicitRole ? role : null, { explicitRole });
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
          window.voiceManager ? window.voiceManager.isRadioTransmitting : false
        );
      }
    }

    const btnCameraMode = document.getElementById("btn-camera-mode");
    if (btnCameraMode) {
      btnCameraMode.addEventListener("click", () => cycleCameraMode());
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

      document.querySelectorAll(".btn-preset[data-preset]").forEach((btn) => {
        const p = btn.getAttribute("data-preset");
        const isCinematicMatch = p === "cinematic" && perfSettings.cinematicPreset === "cinematic" && perfSettings.renderScale >= 110;
        const isPotatoMatch = p === "potato" && perfSettings.cinematicPreset === "off" && perfSettings.renderScale <= 75;
        const isBalancedMatch = p === "balanced" && !isCinematicMatch && !isPotatoMatch;
        btn.classList.toggle("active", isCinematicMatch || isPotatoMatch || isBalancedMatch);
      });
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
        else if (vm.isRadioTransmitting) voiceModeLabel.textContent = "RADIO TX";
        else if (vm.isSpeaking) voiceModeLabel.textContent = "TX LIVE";
        else voiceModeLabel.textContent = "COMMS LIVE";
      }

      if (btnDeafenToggle) {
        btnDeafenToggle.classList.toggle("active", !!vm.isDeafened);
        btnDeafenToggle.textContent = vm.isDeafened ? "DEAFENED" : "DEAFEN";
      }

      if (activeSpeakersEl) {
        const tags = [];
        if (vm.isEnabled && !vm.isMuted && vm.isSpeaking) {
          const localName = (window.netManager && window.netManager.localPlayer) ? window.netManager.localPlayer.name : "YOU";
          tags.push(`<div class="active-speaker-tag ${vm.isRadioTransmitting ? "speaker-radio" : "speaker-local"}">${vm.isRadioTransmitting ? "📻" : "🎙️"} ${escapeHtml(localName)}</div>`);
        }
        if (window.netManager && window.netManager.remotePlayers) {
          for (const id in window.netManager.remotePlayers) {
            const rp = window.netManager.remotePlayers[id];
            if (rp && rp.isSpeaking && !rp.isMuted) {
              tags.push(`<div class="active-speaker-tag">🎙️ ${escapeHtml(rp.name || "CREW")}</div>`);
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
            const volColor = safeHexColor(rp.color, "#ece7dc");
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
            window.gameplay.showToast(`⚠️ ${msg}`);
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
    document.querySelectorAll(".sys-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-tab");
        document.querySelectorAll(".sys-tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".sys-tab-content").forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
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
        queuePerfSettingsApply();
      });
    }
    if (selectCinematicPreset) {
      selectCinematicPreset.addEventListener("change", () => {
        perfSettings.cinematicPreset = selectCinematicPreset.value;
        savePerfSettings();
        applyPerfSettings();
        updatePerfDisplay();
      });
    }
    if (selectFpsCap) {
      selectFpsCap.addEventListener("change", () => {
        perfSettings.fpsCap = Number(selectFpsCap.value) || 0;
        if (fpsCapBadge) fpsCapBadge.textContent = perfSettings.fpsCap === 0 ? "UNCAPPED" : `${perfSettings.fpsCap} FPS`;
        savePerfSettings();
        applyPerfSettings();
      });
    }
    if (selectLightingQuality) {
      selectLightingQuality.addEventListener("change", () => {
        perfSettings.lightingQuality = selectLightingQuality.value;
        savePerfSettings();
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
        applyPerfSettings();
        updatePerfDisplay();
      });
    }
    if (selectInterpBuffer) {
      selectInterpBuffer.addEventListener("change", () => {
        perfSettings.interpBuffer = selectInterpBuffer.value;
        savePerfSettings();
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
        buildLocalAstronaut(lp.color || "#67e8f9", normRole);
      }
      if (typeof window.syncLobbySelectionUI === "function") window.syncLobbySelectionUI();
      if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();
    }

    // Network Callbacks
    window.netManager.on("room_created", (data) => {
      screenMenu.style.display = "none";
      screenLobby.style.display = "flex";
      screenGame.style.display = "none";
      if (lobbyRoomCode) lobbyRoomCode.textContent = data.roomId;
      syncLocalRigWithServer();
      updateLobbySlots(data.room.players, data.hostId, data.room.status);
      renderLobbyMission(data.room.mission);
      updateLocalBadge();
    });

    window.netManager.on("room_joined", (data) => {
      screenMenu.style.display = "none";
      screenLobby.style.display = "flex";
      screenGame.style.display = "none";
      if (lobbyRoomCode) lobbyRoomCode.textContent = data.roomId;
      syncLocalRigWithServer();
      updateLobbySlots(data.room.players, data.hostId, data.room.status);
      renderLobbyMission(data.room.mission);
      updateLocalBadge();
    });

    window.netManager.on("join_error", (err) => {
      if (window.location.search && window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", window.location.pathname);
      }
      alert(err.message || "Failed to join room");
    });

    window.netManager.on("room_update", (data) => {
      syncLocalRigWithServer();
      updateLobbySlots(data.players, data.hostId, data.status);
      renderLobbyMission(data.mission);
      const hudRoom = document.getElementById("hud-room-code");
      if (hudRoom) {
        hudRoom.textContent = data.roomId || "------";
        hudRoom.title = data.roomId ? `Expedition Room: ${data.roomId}` : "";
      }
      updateLocalBadge();
      if (window.gameplay) {
        if (data.tasks) window.gameplay.updateTaskBar(data.tasks);
        if (typeof window.gameplay.updateTaskListUI === "function") window.gameplay.updateTaskListUI();
      }
      if (window.spaceCenter && typeof window.spaceCenter._renderGroundHUD === "function") {
        window.spaceCenter._renderGroundHUD(true);
      }
      if (window.launchCutscene && typeof window.launchCutscene.updateCrewStatus === "function") {
        window.launchCutscene.updateCrewStatus(data.mission);
      }
      if (window.dockingSim && typeof window.dockingSim.updateCrewStatus === "function") {
        window.dockingSim.updateCrewStatus(data.mission);
      }
    });

    window.netManager.on("game_started", (data) => {
      screenMenu.style.display = "none";
      screenLobby.style.display = "none";

      const mission = (data && data.mission)
        || (window.netManager.roomState && window.netManager.roomState.mission)
        || (typeof window.netManager.getMission === "function" ? window.netManager.getMission() : null);

      const startStationOperations = () => {
        isGameStarted = true;
        window.isGameStarted = true;
        document.body.classList.add("game-active");
        screenGame.style.display = "flex";
        syncResponsiveHudState();
        const resBar = document.getElementById("perilune-resource-meters");
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
            banner.textContent = "PHASE 3: ORBITAL APPROACH — ALIGN WITH PMA-2 AND COMPLETE DOCKING";
          } else if (phase === "launch") {
            banner.textContent = "PHASE 2: ASCENT IN PROGRESS — CREW STRAPPED IN";
          } else {
            banner.textContent = "PHASE 1: KENNEDY SPACE CENTER LC-39A — FOLLOW THE GLOWING MARKERS TO BOARD THE ORBITER";
          }
          banner.style.display = "flex";
          setTimeout(() => { banner.style.display = "none"; }, 3000);
        }

        if (window.gameplay) {
          window.gameplay.updateTaskListUI();
          window.gameplay.updateTaskBar();
        }

        showMissionBriefing(mission);
      };

      // Let gameplay's game_started listener apply the authoritative mission
      // design before the three.js launch/docking scenes read it for payload
      // selection. Network callbacks run synchronously in registration order;
      // main.js registers before gameplay.js, so defer one turn.
      setTimeout(startStationOperations, 0);
    });

    window.netManager.on("mission_update", (payload) => {
      if (!payload || !payload.mission) return;
      if (!window.isGameStarted) return;
      // Apply the shared design first: launch/docking scenes read the current
      // payload bus and orbit while advancing their phase.
      if (window.gameplay) {
        if (!window.gameplay.activeTask && typeof window.gameplay.applyMissionDefinition === "function") {
          window.gameplay.applyMissionDefinition(payload.mission);
        } else if (typeof window.gameplay.syncMissionUi === "function") {
          window.gameplay.syncMissionUi(payload.mission);
        }
      }
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
          window.gameplay.showToast(`👨‍🚀 ${payload.playerName || "CREW"} BOARDED THE ORBITER`);
        } else if (payload.action === "dock") {
          window.gameplay.showToast(
            payload.mission.dockLocked
              ? "🌉 CREW LOCKED THE ORBITER ACCESS ARM"
              : "🌉 ORBITER ACCESS ARM RETRACTED"
          );
        } else if (payload.action === "reset") {
          window.gameplay.showToast(`🚀 ${payload.playerName || "CREW"} RETURNED THE CREW TO LC-39A`);
        } else if (payload.action === "design_revised" || payload.action === "design_sync") {
          window.gameplay.showToast(`📡 ${payload.playerName || "CREW"} SYNCED MISSION POINT DESIGN`);
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

    window.netManager.on("chat_message", (comm) => {
      appendLobbyChat(comm);
    });
  }

  function renderLobbyMission(mission) {
    const cards = document.getElementById("lobby-mission-cards");
    const difficultyRow = document.getElementById("lobby-difficulty-pills");
    const selectedLabel = document.getElementById("lobby-mission-selected");
    const hint = document.getElementById("lobby-mission-hint");
    if (!cards) return;

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
    const status = window.netManager && window.netManager.roomState
      ? window.netManager.roomState.status
      : "lobby";
    const isHost = !!(window.netManager && window.netManager.isHost);
    const canSelect = isHost && status === "lobby";

    if (selectedLabel && selected) {
      selectedLabel.textContent = `${selected.code} · ${selected.badge}`;
    }
    if (hint) {
      hint.textContent = canSelect
        ? "HOST CONTROL — SELECT EXPEDITION PROFILE"
        : "HOST SELECTS THE EXPEDITION — CREW VIEW";
      hint.style.color = canSelect ? "#67e8f9" : "#9aa4ae";
    }

    cards.innerHTML = catalog.map((scenario) => {
      const active = scenario.id === selected.id;
      return `
        <button type="button" data-scenario-id="${escapeHtml(scenario.id)}" style="
          flex:1 1 170px;
          min-width:170px;
          text-align:left;
          padding:10px;
          border-radius:8px;
          border:1px solid ${active ? "#67e8f9" : "rgba(255,255,255,0.12)"};
          background:${active ? "rgba(103,232,249,0.10)" : "rgba(255,255,255,0.025)"};
          color:inherit;
          font-family:inherit;
          cursor:${canSelect ? "pointer" : "default"};
          opacity:${canSelect ? "1" : "0.82"};
          transition:all 0.15s;
        ">
          <div style="font-family:monospace;font-size:8.5px;font-weight:700;color:#67e8f9;letter-spacing:1.1px;">${escapeHtml(scenario.badge)}</div>
          <div style="font-size:11px;font-weight:700;color:#ece7dc;margin:4px 0 3px;">${escapeHtml(scenario.code)} · ${escapeHtml(scenario.name)}</div>
          <div style="font-size:9.5px;color:#9aa4ae;line-height:1.35;height:39px;overflow:hidden;">${escapeHtml(scenario.summary)}</div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-family:monospace;font-size:8.5px;color:#7fb8a6;">
            <span>$${Number(scenario.baseBudgetM || 0)}M CAP</span>
            <span>${Number(scenario.targetLifetimeMonths || 0)} MO</span>
          </div>
        </button>
      `;
    }).join("");

    if (difficultyRow) {
      difficultyRow.innerHTML = difficulties.map((difficulty) => {
        const active = difficulty.id === selectedDifficultyId;
        return `
          <button type="button" data-difficulty-id="${escapeHtml(difficulty.id)}" title="${escapeHtml(difficulty.desc)}" style="
            padding:5px 9px;
            border-radius:999px;
            border:1px solid ${active ? "#d0a15c" : "rgba(255,255,255,0.14)"};
            background:${active ? "rgba(208,161,92,0.16)" : "rgba(255,255,255,0.03)"};
            color:${active ? "#fde68a" : "#9aa4ae"};
            font-family:monospace;
            font-size:9px;
            font-weight:700;
            letter-spacing:0.8px;
            cursor:${canSelect ? "pointer" : "default"};
          ">${escapeHtml(String(difficulty.name || difficulty.id).split("(")[0].trim().toUpperCase())}</button>
        `;
      }).join("");
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

    const btnStart = document.getElementById("btn-start-mission");
    if (btnStart && status === "lobby" && isHost && selected) {
      btnStart.textContent = `LAUNCH ${selected.code} →`;
    }
  }

  function showMissionBriefing(mission) {
    const overlay = document.getElementById("mission-briefing-overlay");
    if (!overlay || !mission) return;
    const title = document.getElementById("briefing-title");
    const meta = document.getElementById("briefing-meta");
    const summary = document.getElementById("briefing-summary");
    const list = document.getElementById("briefing-objectives");
    const btnBegin = document.getElementById("btn-briefing-begin");

    if (title) {
      title.textContent = `${mission.scenarioCode || "PERILUNE"} · ${mission.scenarioName || "CO-OP EXPEDITION"}`;
    }
    if (meta) {
      const crew = window.netManager && window.netManager.roomState && Array.isArray(window.netManager.roomState.players)
        ? window.netManager.roomState.players.length
        : 0;
      meta.textContent = `DIFFICULTY: ${String(mission.difficultyId || "engineer").toUpperCase()} · CREW: ${crew}/6 · SEED: ${mission.seed || "—"}`;
    }
    if (summary) {
      summary.textContent = mission.scenarioSummary ||
        "Complete the shared mission objectives across the station before the expedition window closes.";
    }
    if (list) {
      const objectives = Array.isArray(mission.objectives) ? mission.objectives : [];
      const completed = new Set(mission.completedObjectives || []);
      list.innerHTML = objectives.map((objective) => {
        const done = completed.has(objective.id);
        const deps = (objective.dependsOn || []).map((id) => {
          const dep = objectives.find((entry) => entry.id === id);
          return dep ? dep.room : id;
        });
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-family:monospace;font-size:9px;font-weight:700;color:${done ? "#34d399" : "#67e8f9"};min-width:38px;">${escapeHtml(objective.room)}</span>
            <span style="flex:1;font-size:11px;color:${done ? "#7fb8a6" : "#ece7dc"};">${escapeHtml(objective.title)}</span>
            <span style="font-family:monospace;font-size:8.5px;color:#9aa4ae;">${done ? "COMPLETE" : deps.length ? "AFTER " + deps.join("+") : "FIRST"}</span>
          </div>
        `;
      }).join("");
    }

    if (btnBegin) {
      btnBegin.onclick = () => {
        overlay.style.display = "none";
        if (window.spaceAudio) window.spaceAudio.playClick();
      };
    }
    overlay.style.display = "flex";
  }

  function updateLobbySlots(players, hostId, roomStatus) {
    const slotsContainer = document.getElementById("lobby-players-grid");
    const countBadge = document.getElementById("lobby-player-count");
    const btnStart = document.getElementById("btn-start-mission");
    const status = roomStatus || (window.netManager.roomState && window.netManager.roomState.status) || "lobby";

    if (countBadge) countBadge.textContent = `${players.length} / 6 ASTRONAUTS (CO-OP CREW)`;
    if (btnStart) {
      const isHost = window.netManager.socketId === hostId;
      if (status === "victory") {
        btnStart.style.display = "block";
        btnStart.disabled = !isHost;
        btnStart.style.opacity = isHost ? "1" : "0.55";
        btnStart.textContent = isHost ? "MISSION SELECT →" : "MISSION COMPLETE";
      } else if (status === "playing") {
        btnStart.style.display = "block";
        btnStart.disabled = false;
        btnStart.style.opacity = "1";
        btnStart.textContent = "JOIN ACTIVE MISSION";
      } else if (isHost) {
        btnStart.style.display = "block";
        btnStart.disabled = false;
        btnStart.style.opacity = "1";
        btnStart.textContent = "LAUNCH MISSION";
      } else {
        btnStart.style.display = "block";
        btnStart.disabled = true;
        btnStart.style.opacity = "0.55";
        btnStart.textContent = "WAITING FOR HOST...";
      }
    }

    if (!slotsContainer) return;
    slotsContainer.innerHTML = "";

    const header = document.createElement("div");
    header.style.gridColumn = "1 / -1";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.padding = "4px 6px";
    header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.12)";
    header.innerHTML = `
      <div style="font-weight:700;color:#ece7dc;font-size:11px;letter-spacing:1.6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">PERILUNE CREW MANIFEST</div>
      <div style="font-size:10px;font-weight:700;color:#9aa4ae;letter-spacing:1px;">${players.length} / 6 ABOARD</div>
    `;
    slotsContainer.appendChild(header);

    const ROLES_ORDER = (window.InterfellasRoles && window.InterfellasRoles.ORDER) || ["commander", "engineer", "scientist"];

    if (typeof window.syncLobbySelectionUI === "function") {
      window.syncLobbySelectionUI(players);
    }

    for (let i = 0; i < 6; i++) {
      const expectedRole = ROLES_ORDER[i % ROLES_ORDER.length];
      const expectedMeta = window.InterfellasRoles
        ? window.InterfellasRoles.getRoleMeta(expectedRole)
        : { short: expectedRole.slice(0, 3).toUpperCase(), label: expectedRole.toUpperCase(), color: "#67e8f9", duties: {} };
      const p = players[i];
      const pod = document.createElement("div");
      pod.className = `lobby-player-pod ${p ? 'occupied' : 'empty'}`;
      pod.style.cursor = p ? "default" : "pointer";
      pod.style.padding = "12px 14px";
      pod.style.flexDirection = "row";
      pod.style.justifyContent = "space-between";
      pod.style.gap = "8px";
      pod.style.minHeight = "64px";

      if (p) {
        const isSelf = p.id === window.netManager.socketId;
        const color = safeHexColor(p.color, "#ef4444");
        const name = escapeHtml(p.name || "Astronaut");
        const normRole = window.InterfellasRoles
          ? window.InterfellasRoles.normalizeRole(p.role, expectedRole)
          : (p.role || expectedRole);
        const roleMeta = window.InterfellasRoles
          ? window.InterfellasRoles.getRoleMeta(normRole)
          : expectedMeta;
        const dutyBrief = roleMeta.duties && roleMeta.duties.station ? roleMeta.duties.station : "";
        pod.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <div class="pod-color-indicator" style="width:30px;height:30px;flex-shrink:0;background:${color};box-shadow:0 0 10px ${color};"></div>
            <div style="text-align:left;min-width:0;">
              <div class="pod-name" style="font-size:12px;">${name} ${p.isHost ? '<span style="color:#fde047;">[HOST]</span>' : ''} ${isSelf ? '<span style="color:#67e8f9;">(YOU)</span>' : ''}</div>
              <div class="pod-role" style="color:${color};font-size:10px;">[${escapeHtml(roleMeta.short)}] ${escapeHtml(roleMeta.label)}</div>
              ${dutyBrief ? `<div class="lobby-pod-duty">${escapeHtml(dutyBrief)}</div>` : ""}
            </div>
          </div>
          <div class="pod-ready-badge ready" style="padding:2px 6px;font-size:9px;flex-shrink:0;">READY</div>
        `;
      } else {
        pod.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="pod-color-indicator empty" style="width:30px;height:30px;"></div>
            <div style="text-align:left;">
              <div class="pod-name" style="color:#9aa4ae;font-size:12px;">OPEN CREW SLOT</div>
              <div class="pod-role" style="font-size:9px;color:rgba(154,164,174,0.85);">Click to assume [${escapeHtml(expectedMeta.short)}] ${escapeHtml(expectedMeta.label)}</div>
            </div>
          </div>
          <div style="font-size:10px;color:#67e8f9;font-weight:700;letter-spacing:1px;">SWITCH &rarr;</div>
        `;
        pod.addEventListener("click", () => {
          window.netManager.explicitRoleSelected = true;
          window.netManager.customizeAstronaut(null, null, expectedRole, null, null, "crew", { explicitRole: true });
          buildLocalAstronaut(window.netManager.localPlayer.color, expectedRole);
          if (typeof window.syncLobbySelectionUI === "function") window.syncLobbySelectionUI();
          if (typeof window.renderHudCrewRoster === "function") window.renderHudCrewRoster();
          if (window.spaceAudio) window.spaceAudio.playClick();
        });
      }
      slotsContainer.appendChild(pod);
    }
  }

  function syncLobbySelectionUI(explicitPlayers) {
    const net = window.netManager;
    const lp = net && net.localPlayer ? net.localPlayer : {};
    const myColor = String(lp.color || "#67e8f9").toLowerCase();
    const myRole = window.InterfellasRoles
      ? window.InterfellasRoles.normalizeRole(lp.role, "commander")
      : String(lp.role || "commander").toLowerCase();
    const players = Array.isArray(explicitPlayers)
      ? explicitPlayers
      : (net && net.roomState && Array.isArray(net.roomState.players) ? net.roomState.players : []);

    document.querySelectorAll("#screen-lobby .lobby-color-btn").forEach((btn) => {
      const col = String(btn.getAttribute("data-color") || "").toLowerCase();
      btn.classList.toggle("active", col === myColor);
    });

    const grouped = window.InterfellasRoles
      ? window.InterfellasRoles.getCrewByRole(players)
      : { commander: [], engineer: [], scientist: [] };

    document.querySelectorAll(".lobby-role-card").forEach((card) => {
      const r = card.getAttribute("data-role");
      card.classList.toggle("active", r === myRole);
      const holderEl = card.querySelector(`[data-role-holders="${r}"]`);
      if (holderEl) {
        const list = grouped[r] || [];
        if (list.length > 0) {
          holderEl.textContent = list.map((p) => (p.id === net.socketId ? `${p.name} (YOU)` : p.name)).join(", ");
          holderEl.classList.add("filled");
        } else {
          holderEl.textContent = "UNSTAFFED";
          holderEl.classList.remove("filled");
        }
      }
    });

    const coverageEl = document.getElementById("lobby-role-coverage");
    if (coverageEl) {
      const missing = (window.InterfellasRoles ? window.InterfellasRoles.ORDER : ["commander", "engineer", "scientist"])
        .filter((r) => !(grouped[r] && grouped[r].length));
      if (players.length <= 1) {
        coverageEl.className = "lobby-role-coverage";
        coverageEl.textContent = "SOLO OR WAITING: Invite crewmates with Room Code. Unstaffed consoles can still be operated manually.";
      } else if (missing.length > 0) {
        const labels = missing.map((r) => (window.InterfellasRoles ? window.InterfellasRoles.getRoleMeta(r).short : r.toUpperCase()));
        coverageEl.className = "lobby-role-coverage warn";
        coverageEl.textContent = `COVERAGE NOTICE (${players.length} crew): ${labels.join(" & ")} unstaffed — click a role card above to balance duties.`;
      } else {
        coverageEl.className = "lobby-role-coverage ready";
        coverageEl.textContent = `ALL 3 FLIGHT ROLES COVERED (${players.length} crew): CMD, ENG & SCI ready for coordinated flight.`;
      }
    }
  }
  window.syncLobbySelectionUI = syncLobbySelectionUI;

  function renderHudCrewRoster() {
    const container = document.getElementById("hud-crew-roster");
    if (!container) return;
    const net = window.netManager;
    const rs = net && net.roomState ? net.roomState : null;
    const lp = net && net.localPlayer ? net.localPlayer : { role: "commander" };
    const myRole = window.InterfellasRoles
      ? window.InterfellasRoles.normalizeRole(lp.role, "commander")
      : "commander";

    let players = rs && Array.isArray(rs.players) && rs.players.length > 0
      ? rs.players
      : [{ id: net ? net.socketId : "local", name: lp.name || "YOU", role: myRole, isHost: !!(net && net.isHost), color: lp.color || "#67e8f9" }];

    const grouped = window.InterfellasRoles
      ? window.InterfellasRoles.getCrewByRole(players)
      : { commander: [], engineer: [], scientist: [] };
    const order = (window.InterfellasRoles && window.InterfellasRoles.ORDER) || ["commander", "engineer", "scientist"];

    const mission = (net && typeof net.getMission === "function" ? net.getMission() : null) || (rs && rs.mission) || {};
    const phase = mission.phase
      || (window.spaceCenter
        ? (window.spaceCenter.missionPhase || (window.spaceCenter.isGroundMode ? "gantry" : "station"))
        : "station");
    const hostId = rs ? rs.hostId : (net && net.isHost ? net.socketId : null);

    const chipsHtml = order.map((r) => {
      const meta = window.InterfellasRoles
        ? window.InterfellasRoles.getRoleMeta(r)
        : { short: r.slice(0, 3).toUpperCase(), label: r.toUpperCase(), color: "#67e8f9" };
      const holders = grouped[r] || [];
      const isSelf = r === myRole;
      const namesText = holders.length > 0
        ? holders.map((p) => (p.id === (net && net.socketId) ? `${p.name}*` : p.name)).join(", ")
        : "OPEN";
      const cls = `crew-role-chip${isSelf ? " is-self" : ""}${holders.length === 0 ? " is-unstaffed" : ""}`;
      return `
        <div class="${cls}" title="${escapeHtml(meta.label)}: ${escapeHtml(namesText)}">
          <div class="crew-role-chip-head" style="color:${meta.color};">
            <span>${escapeHtml(meta.short)}${isSelf ? " · YOU" : ""}</span>
          </div>
          <div class="crew-role-chip-names">${escapeHtml(namesText)}</div>
        </div>
      `;
    }).join("");

    let callout = "";
    if (phase === "gantry" || phase === "boarding") {
      const boarded = Array.isArray(mission.boarded) ? mission.boarded : [];
      const unboarded = players.filter((p) => !boarded.includes(p.id)).map((p) => p.name);
      const isMeAboard = net && boarded.includes(net.socketId);
      const cmdHolder = grouped.commander[0] || players.find((p) => p.id === hostId) || players[0];
      const engHolder = grouped.engineer[0] || players.find((p) => p.id === hostId) || players[0];
      const armExtended = !!mission.dockLocked;
      const cmdMeta = window.InterfellasRoles ? window.InterfellasRoles.getRoleMeta(cmdHolder && cmdHolder.role) : { short: "CMD" };
      const engMeta = window.InterfellasRoles ? window.InterfellasRoles.getRoleMeta(engHolder && engHolder.role) : { short: "ENG" };

      if (!armExtended) {
        const armActor = engHolder && engHolder.id === (net && net.socketId)
          ? `YOU (${engMeta.short})`
          : `${engHolder ? engHolder.name : "Crew"} (${engMeta.short})`;
        callout = `<strong>1. PAD GANTRY:</strong> <strong>${escapeHtml(armActor)}</strong> press [F] at White Room Arm (x=-25.9, z=-6.3) to extend bridge.`;
      } else if (!isMeAboard) {
        callout = `<strong>YOUR DUTY (PAD):</strong> Cross White Room Bridge &rarr; Press [E] or [B] at Orion Hatch to board (${boarded.length}/${players.length} aboard).`;
      } else if (unboarded.length > 0) {
        callout = `<strong>WAITING BOARDING (${boarded.length}/${players.length}):</strong> Waiting for <strong>${escapeHtml(unboarded.join(", "))}</strong>. ${cmdHolder && cmdHolder.id === (net && net.socketId) ? "You hold Launch Override [L]." : `Launch Auth: ${escapeHtml(cmdHolder ? cmdHolder.name : "Host")} (${escapeHtml(cmdMeta.short)}).`}`;
      } else {
        const launchActor = cmdHolder && cmdHolder.id === (net && net.socketId)
          ? `YOU (${cmdMeta.short})`
          : `${cmdHolder ? cmdHolder.name : "Host"} (${cmdMeta.short})`;
        callout = `<strong>READY FOR LAUNCH:</strong> All aboard! <strong>${escapeHtml(launchActor)}</strong> press [L] or Launch button for T-10s ignition.`;
      }
    } else if (phase === "launch") {
      const cmdHolder = grouped.commander[0] || players[0];
      callout = `<strong>ASCENT FLIGHT:</strong> Pilot <strong>${escapeHtml(cmdHolder ? cmdHolder.name : "Commander")}</strong> leads trajectory. Crew hold for staging or vote skip.`;
    } else if (phase === "docking") {
      const pilot = players.find((p) => p.id === mission.dockingPilotId) || grouped.commander[0] || players[0];
      const isPilot = pilot && net && pilot.id === net.socketId;
      callout = isPilot
        ? `<strong>YOUR DUTY (PILOT):</strong> Align docking rings [WASD+QE] &rarr; Press [SPACE] at corridor &le;1.2m.`
        : `<strong>CREW SUPPORT:</strong> Pilot <strong>${escapeHtml(pilot ? pilot.name : "CMD")}</strong> flies [WASD]; ENG stabilizes [1/2], SCI locks boresight [3/4].`;
    } else {
      const tasks = (window.gameplay && Array.isArray(window.gameplay.tasks)) ? window.gameplay.tasks : [];
      const myPending = tasks.filter((t) => !t.completed && (t.role === myRole || t.role === "all"));
      const anyPending = tasks.filter((t) => !t.completed);
      if (tasks.length > 0 && anyPending.length === 0) {
        callout = `<strong>ALL 7 CONSOLES VERIFIED:</strong> Mission complete! Press [Y] for Mission Debrief.`;
      } else if (myPending.length > 0) {
        const nextTask = myPending[0];
        const depsDone = !Array.isArray(nextTask.requires) || nextTask.requires.every((reqId) => {
          const dep = tasks.find((x) => x.id === reqId);
          return dep && dep.completed;
        });
        const names = myPending.map((t) => `[${t.code || t.room || t.id}] ${t.location || t.room || "Console"}`).join(", ");
        callout = depsDone
          ? `<strong>YOUR DUTY (${escapeHtml(myRole.toUpperCase())}):</strong> Head to ${escapeHtml(names)}.`
          : `<strong>YOUR QUEUE (${escapeHtml(myRole.toUpperCase())}):</strong> ${escapeHtml(names)} (wait for upstream console check).`;
      } else if (anyPending.length > 0) {
        const nextOther = anyPending[0];
        const otherRole = nextOther.role === "all" ? "ALL CREW" : String(nextOther.role || "crew").toUpperCase();
        const otherHolder = nextOther.role === "all"
          ? "ALL CREW"
          : (grouped[nextOther.role] && grouped[nextOther.role][0] ? grouped[nextOther.role][0].name : `${otherRole} UNSTAFFED`);
        callout = `<strong>YOUR ROLE DONE:</strong> Assist <strong>${escapeHtml(otherHolder)}</strong> with [${escapeHtml(nextOther.code || nextOther.room || nextOther.id)}] ${escapeHtml(nextOther.name)}.`;
      } else {
        callout = `<strong>PERILUNE STATION:</strong> Walk with [WASD] and interact [E] at your ${escapeHtml(myRole.toUpperCase())} consoles.`;
      }
    }

    container.innerHTML = `
      <div class="crew-roster-grid">${chipsHtml}</div>
      <div class="crew-duty-callout">${callout}</div>
    `;
  }
  window.renderHudCrewRoster = renderHudCrewRoster;

  function safeHexColor(color, fallback = "#ef4444") {
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
    sender.style.color = safeHexColor(comm && comm.color, "#ef4444");
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
      if (e.code === "Escape" || e.key === "Escape") {
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

      const blockingOverlay = ["modal-auth", "modal-station-systems", "task-modal-overlay", "victory-overlay", "mission-briefing-overlay"]
        .some((id) => {
          const el = document.getElementById(id);
          return el && el.style.display && el.style.display !== "none";
        });
      if (blockingOverlay) return;

      keys[e.code] = true;
      if (e.key) keys[e.key.toLowerCase()] = true;

      // 6-Room Perilune Ship Interior Toggle [I]
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

      // The site tour owns 1-6 fast travel; don't fire emote shortcuts.
      if (window.spaceCenter && window.spaceCenter.siteTourActive) {
        if (/^Digit[1-6]$/.test(e.code) || e.code === "KeyT") return;
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

      // Crew emotes [X] to open the wheel, [1]-[6] to express
      if (e.code === "KeyX" || e.key === "x" || e.key === "X") {
        e.preventDefault();
        setEmoteWheelOpen(!emoteWheelOpen);
        return;
      }
      if (/^Digit[1-6]$/.test(e.code)) {
        const emoteDefs = window.ASTRONAUT_EMOTES || [];
        const emoteDef = emoteDefs[Number(e.code.slice(5)) - 1];
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

      // 6-Room Perilune Ship Interior Toggle [I]
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
        if (window.shipInterior) {
          const vis = window.shipInterior.toggleInterior();
          if (window.showActionToast) {
            window.showActionToast(vis ? "PERILUNE 6-ROOM SHIP INTERIOR: ACTIVE" : "EXTERIOR / EVA VIEW: ACTIVE");
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
          "button, input, textarea, select, a, .hud-checklist-panel, .hud-race-bar-container, #hud-crew-roster, #hud-voice-panel, #virtual-dpad, #mobile-joystick-zone, #task-modal-overlay, #iss-showcase-ui, #mission-viz-ui, #vr-mode-overlay, #perilune-ship-minimap, #ship-interior-hud, #space-center-ground-hud, #docking-hud-overlay, #launch-cutscene-overlay, #perilune-resource-meters, #btn-telemetry-toggle, #emote-wheel, #hud-diagnostics-overlay, #modal-auth, #modal-station-systems, #victory-overlay, #mission-briefing-overlay, #action-toast, .modal-card, .menu-card"
        )
      );
    };

    window.addEventListener("mousedown", (e) => {
      if (window.solarSystem && window.solarSystem.isActive) return;
      if (isUIElement(e.target)) return;
      isMouseDown = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      dom.style.cursor = "grabbing";
    });

    window.addEventListener("mouseup", () => {
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
          joyHint.style.color = mag > 0.82 ? "#67e8f9" : "rgba(154, 164, 174, 0.78)";
        }
      };

      const resetStick = () => {
        joyTouchId = null;
        window.virtualJoyX = 0;
        window.virtualJoyY = 0;
        window.virtualJoyActive = false;
        joyStick.style.transform = "translate3d(0px, 0px, 0px)";
        if (joyHint) {
          joyHint.textContent = "MOVE";
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
    if (!isGameStarted) {
      if (localCrew.rig && typeof localCrew.rig.updateAnimation === "function") {
        localCrew.rig.updateAnimation(delta, false, localCrew.isEva, !localCrew.isEva);
      }
      return;
    }
    if (
      (window.gameplay && window.gameplay.activeTask) ||
      (window.launchCutscene && window.launchCutscene.isPlaying) ||
      (window.dockingSim && window.dockingSim.isActive) ||
      (window.solarSystem && window.solarSystem.isActive) ||
      (window.spaceCenter && window.spaceCenter.isGroundMode && window.spaceCenter.crewBoarded)
    ) {
      if (localCrew.rig && typeof localCrew.rig.updateAnimation === "function") {
        localCrew.rig.updateAnimation(delta, false, localCrew.isEva, !localCrew.isEva);
      }
      return;
    }

    const joyMag = window.virtualJoyActive ? Math.hypot(window.virtualJoyX || 0, window.virtualJoyY || 0) : 0;
    const isRunning = keys["ShiftLeft"] || keys["ShiftRight"] || joyMag > 0.82;
    const speed = localCrew.isEva ? 4.8 : (isRunning ? 5.6 : 3.9);

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

    const isMoving = Math.abs(fwd) > 0.05 || Math.abs(strafe) > 0.05;

    const sinY = Math.sin(camYaw);
    const cosY = Math.cos(camYaw);

    let dx = fwd * sinY - strafe * cosY;
    let dz = fwd * cosY + strafe * sinY;
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      const moveScale = window.virtualJoyActive ? Math.min(1.0, len) : 1.0;
      dx = (dx / len) * speed * moveScale * delta;
      dz = (dz / len) * speed * moveScale * delta;

      // Smoothly turn astronaut to face movement vector
      const targetFacing = Math.atan2(dx, dz);
      let diff = targetFacing - localCrew.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      localCrew.group.rotation.y += diff * Math.min(1, delta * 12);
    } else if (cameraMode === 0) {
      localCrew.group.rotation.y = camYaw;
    }

    const currentPos = localCrew.group.position;
    const proposedPos = new THREE.Vector3(currentPos.x + dx, currentPos.y, currentPos.z + dz);

    if (window.spaceCenter && window.spaceCenter.isGroundMode && typeof window.spaceCenter.resolveGroundCollision === "function") {
      const resolvedGround = window.spaceCenter.resolveGroundCollision(currentPos, proposedPos);
      if (resolvedGround && typeof resolvedGround.x === "number") {
        currentPos.set(resolvedGround.x, resolvedGround.y, resolvedGround.z);
      } else {
        currentPos.copy(proposedPos);
      }
    } else if (window.shipInterior && window.shipInterior.group && window.shipInterior.group.visible && typeof window.resolveShipInteriorCollision === "function") {
      const resolved = window.resolveShipInteriorCollision(currentPos, proposedPos, 0.32);
      if (resolved && typeof resolved.x === "number") {
        currentPos.set(resolved.x, 0.0, resolved.z);
      } else {
        currentPos.copy(proposedPos);
      }
    } else {
      currentPos.copy(proposedPos);
    }

    // Update SpaceShip skeletal animations ('idle' / 'walk')
    if (localCrew.rig && typeof localCrew.rig.updateAnimation === "function") {
      localCrew.rig.updateAnimation(delta, isMoving, localCrew.isEva, !localCrew.isEva);
    }

    // Send coordinate update to network
    if (window.netManager) {
      window.netManager.sendPlayerUpdate(
        currentPos,
        localCrew.group.rotation.y,
        camPitch,
        localCrew.isEva,
        localCrew.suitLights
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

      const desiredX = headX + fullOffsetX * safeFrac;
      const desiredY = Math.max(py + 0.5, Math.min(py + 3.2, headY + 0.25 + vertOffset * safeFrac));
      const desiredZ = headZ + fullOffsetZ * safeFrac;

      camera.position.lerp(new THREE.Vector3(desiredX, desiredY, desiredZ), 0.25);
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
      const fpsColor = currentFps >= 50 ? "#22c55e" : (currentFps >= 30 ? "#f59e0b" : "#ef4444");
      fpsVal.style.color = fpsColor;
      if (fpsDot) fpsDot.style.background = fpsColor;
    }

    let latencyTier = "nominal";
    let statusText = "NOMINAL";
    if (pingVal && currentPing !== null) {
      pingVal.textContent = `${currentPing} ms`;
      let pingColor = "#22c55e";

      if (currentPing < 80) {
        pingColor = "#22c55e";
        statusText = "NOMINAL";
        latencyTier = "nominal";
      } else if (currentPing < 180) {
        pingColor = "#f59e0b";
        statusText = "MODERATE";
        latencyTier = "moderate";
      } else {
        pingColor = "#ef4444";
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
      netDiagStatus.style.color = isConnected ? "#7fb8a6" : "#c08a8a";
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

    if (window.photorealisticEarth && typeof window.photorealisticEarth.update === "function") {
      window.photorealisticEarth.update(delta, camera);
    }

    if (window.glbManager && typeof window.glbManager.updateFleet === "function") {
      window.glbManager.updateFleet(delta, elapsed);
    }

    if (window.shipInterior && typeof window.shipInterior.update === "function") {
      window.shipInterior.update(delta, elapsed, camera);
    }

    if (window.spaceCenter && window.spaceCenter.isGroundMode && typeof window.spaceCenter.update === "function") {
      window.spaceCenter.update(delta, camera, elapsed);
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
    } else if (window.spaceCenter && window.spaceCenter.isGroundMode && window.spaceCenter.crewBoarded) {
      // Cockpit / pad camera while boarded awaiting launch.  Keep the whole
      // stack in frame instead of parking the camera inside the external tank.
      const t = performance.now() * 0.001;
      camera.position.lerp(
        new THREE.Vector3(72 + Math.sin(t * 0.12) * 5, 46, 96 + Math.cos(t * 0.12) * 5),
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
          const chosenModel = rp.modelId || "astronaut_lod1";
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
          const desiredModel = rp.modelId || "astronaut_lod1";
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
            if (typeof rp.rig.updateAnimation === "function") {
              // Network packets — not the interpolated render position — decide
              // whether the crewmate is actually walking. Comparing curPos to
              // targetPos would keep the walk cycle looping while an idle avatar
              // is briefly held/extrapolated ahead of its last packet.
              const isMoving = !!(rp.lastMoveAt && (performance.now() - rp.lastMoveAt) < 300);
              rp.rig.updateAnimation(delta, isMoving, rp.isEva, !rp.isEva);
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

      for (const id in remoteCrewMeshes) {
        if (!window.netManager.remotePlayers[id]) {
          scene.remove(remoteCrewMeshes[id]);
          delete remoteCrewMeshes[id];
        } else {
          // Remote crew disappears into the orbiter once they board and stays
          // hidden during ascent/docking. They reappear together in the station.
          const boarded = missionPhase === "gantry" && boardedIds.indexOf(id) !== -1;
          remoteCrewMeshes[id].visible = !crewInFlight && !boarded;
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

    // Render (routes through WebXR / Stereo VR manager when active, bypassing postprocessing)
    if (window.vrManager && typeof window.vrManager.render === "function") {
      window.vrManager.render(scene, camera, cinematicPass, elapsed, perfSettings);
    } else if (cinematicPass && perfSettings.cinematicPreset !== "off") {
      cinematicPass.render(scene, camera, elapsed);
    } else {
      renderer.render(scene, camera);
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
  }

  window.addEventListener("DOMContentLoaded", init);
})();
