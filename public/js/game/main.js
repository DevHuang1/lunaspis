/**
 * ============================================================================
 * INTERFELLAS — CO-OP SHUTTLE MISSION CLIENT (title, crew lobby, comms)
 * ============================================================================
 * The only gameplay is the Shuttle mission (shuttle_game.js), flown by a crew whose seats each
 * own part of the vehicle. The server runs the authoritative mission simulation. This file sets
 * up the renderer, the title backdrop, sign-in, the crew lobby, voice comms and the hand-off to
 * the mission view.
 */
(function () {
  "use strict";

  let renderer, clock;
  window.isGameStarted = false;      // voice chat: full-volume crew comms (no proximity model)

  function detectMobileDevice() {
    const coarse = window.matchMedia && window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    const ua = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent || "");
    return Boolean(coarse || ua);
  }
  const isMobile = detectMobileDevice();
  window.isMobileDevice = isMobile;

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

  function buildLocalAstronaut() { /* astronaut avatars belonged to the removed station missions */ }
  function updateLocalBadge() { /* no in-world name badges in the Shuttle mission */ }

  function showToast(msg) {
    const el = document.getElementById("action-toast");
    if (!el) return;
    el.textContent = msg; el.classList.add("show"); el.style.opacity = "1"; el.style.display = "block";
    clearTimeout(showToast._t); showToast._t = setTimeout(() => { el.style.opacity = "0"; el.classList.remove("show"); }, 3200);
  }
  window.showActionToast = showToast;

  function init() {
    syncViewportCSSVars();
    const { w, h } = getViewportSize();
    renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setSize(w, h);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    document.getElementById("canvas-container").appendChild(renderer.domElement);
    window.renderer = renderer;
    clock = new THREE.Clock();
    if (window.spaceAudio && typeof window.spaceAudio.init === "function") { try { window.spaceAudio.init(); } catch (e) { /* audio optional */ } }
    if (window.shuttleGame) window.shuttleGame.initTitle(renderer);
    setupFlow();
    window.addEventListener("resize", onResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
    animate();
  }

  function onResize() {
    const { w, h } = syncViewportCSSVars();
    if (renderer) renderer.setSize(w, h);
    if (window.shuttleGame) window.shuttleGame.resize();
  }

  // ------------------------------------------------------------------ FPS / ping pill
  let fpsFrames = 0, fpsLast = performance.now();
  function updatePerfPill() {
    fpsFrames++;
    const now = performance.now();
    if (now - fpsLast < 1000) return;
    const fps = Math.round((fpsFrames * 1000) / (now - fpsLast)); fpsFrames = 0; fpsLast = now;
    const fv = document.getElementById("perf-fps-val"), pv = document.getElementById("perf-ping-val");
    if (fv) fv.textContent = String(fps);
    if (pv && window.netManager) pv.textContent = window.netManager.connected ? `${Math.round(window.netManager.pingMs)} ms` : "offline";
    const badge = document.getElementById("perf-latency-badge");
    if (badge && window.netManager) badge.textContent = !window.netManager.connected ? "OFFLINE" : window.netManager.pingMs > 200 ? "HIGH" : "NOMINAL";
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    updatePerfPill();
    if (window.shuttleGame) {
      if (window.shuttleGame.isActive) window.shuttleGame.frame(dt);
      else window.shuttleGame.renderTitle(dt);
    }
  }

  // ------------------------------------------------------------------ title → lobby → mission
  function setupFlow() {
    if (!window.netManager) return;
    window.netManager.init();

    const screenMenu = document.getElementById("screen-menu");
    const screenLobby = document.getElementById("screen-lobby");
    const inputName = document.getElementById("input-player-name");
    const inputCode = document.getElementById("input-join-code");
    const btnHost = document.getElementById("btn-host-game");
    const btnSolo = document.getElementById("btn-solo-flight");
    const btnJoin = document.getElementById("btn-join-game");
    const btnQuick = document.getElementById("btn-quick-play");
    const lobbyRoomCode = document.getElementById("lobby-room-code");
    const btnCopyLink = document.getElementById("btn-copy-invite");
    const btnStartMission = document.getElementById("btn-start-mission");
    let currentAstronaut = null;
    let soloPending = false;

    const show = (which) => {
      screenMenu.style.display = which === "menu" ? "flex" : "none";
      screenLobby.style.display = which === "lobby" ? "flex" : "none";
    };
    const nameNow = () => (inputName && inputName.value.trim()) || window.netManager.localPlayer.name;

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

        const defName = localStorage.getItem("interfellas_name") || "CDR. Vance";
        if (inputName) inputName.value = defName;
        window.netManager.localPlayer.name = defName;
        window.netManager.localPlayer.color = "#67e8f9";
        
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

      window.netManager.userId = astro.id;
      window.netManager.localPlayer.name = callsign;
      window.netManager.localPlayer.color = color;
      
      buildLocalAstronaut(color, rank.toLowerCase().replace(/\s+/g, "_"), defaultModel);
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
            localStorage.setItem("nasa_astronaut_credential", JSON.stringify(data.user));
            applyAstronautProfile(data.user);
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
            localStorage.setItem("nasa_astronaut_credential", JSON.stringify(data.user));
            applyAstronautProfile(data.user);
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
        const newPassword = document.getElementById("reset-password").value;
        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, newPassword })
          });
          const data = await res.json();
          if (data.success && data.user) {
            localStorage.setItem("nasa_astronaut_credential", JSON.stringify(data.user));
            applyAstronautProfile(data.user);
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
          const res = await fetch("/api/auth/update-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: currentAstronaut.id,
              callsign,
              flightTitle,
              suitColor: dossierSelectedColor,
              preferredRole: flightTitle.toLowerCase().replace(/\s+/g, "_")
            })
          });
          const data = await res.json();
          if (data.success && data.user) {
            localStorage.setItem("nasa_astronaut_credential", JSON.stringify(data.user));
            applyAstronautProfile(data.user);
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
      localStorage.removeItem("nasa_astronaut_credential");
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
        fetch(`/api/auth/me?userId=${encodeURIComponent(parsed.id)}`)
          .then(r => r.json())
          .then(data => {
            if (data.success && data.user) {
              localStorage.setItem("nasa_astronaut_credential", JSON.stringify(data.user));
              applyAstronautProfile(data.user);
            }
          }).catch(() => {});
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
      if (inputName && profile.username) inputName.value = profile.username;
      const statMissions = document.getElementById("stat-missions");
      const statVictories = document.getElementById("stat-victories");
      const statTasks = document.getElementById("stat-tasks");
      if (statMissions) statMissions.textContent = profile.games_played || 0;
      if (statVictories) statVictories.textContent = profile.games_won || 0;
      if (statTasks) statTasks.textContent = profile.tasks_completed || 0;
    });

    if (btnHost) btnHost.addEventListener("click", () => { soloPending = false; window.netManager.createRoom(nameNow(), { isPublic: true }); });
    if (btnSolo) btnSolo.addEventListener("click", () => { soloPending = true; window.netManager.createRoom(nameNow(), { isPublic: false }); });
    if (btnQuick) btnQuick.addEventListener("click", () => { soloPending = false; window.netManager.joinRoom("ORBIT1", nameNow()); });
    if (btnJoin) btnJoin.addEventListener("click", () => {
      const code = inputCode ? inputCode.value.trim().toUpperCase() : "";
      if (!code) { showToast("Enter the crew code first"); return; }
      soloPending = false; window.netManager.joinRoom(code, nameNow());
    });
    window.netManager.on("auto_join_url", (code) => { if (inputCode) inputCode.value = code; window.netManager.joinRoom(code, nameNow()); });

    if (btnCopyLink) btnCopyLink.addEventListener("click", () => {
      const code = window.netManager.roomId; if (!code) return;
      const link = `${window.location.origin}/?room=${code}`;
      const done = () => { btnCopyLink.textContent = "COPIED!"; setTimeout(() => { btnCopyLink.textContent = "COPY LINK"; }, 2000); };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => showToast(link)); else showToast(link);
    });

    function leaveCurrentRoom() {
      if (window.shuttleGame && window.shuttleGame.isActive) window.shuttleGame.exit(true);
      window.netManager.leaveRoom();
      if (window.location.search && window.history && window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);
      show("menu");
    }
    window.leaveCrewRoom = leaveCurrentRoom;
    const btnLeaveRoom = document.getElementById("btn-leave-room");
    if (btnLeaveRoom) btnLeaveRoom.addEventListener("click", leaveCurrentRoom);
    if (btnStartMission) btnStartMission.addEventListener("click", () => window.netManager.startGame());

    document.querySelectorAll(".lobby-color-btn").forEach((btn) => btn.addEventListener("click", (e) => {
      window.netManager.customize({ color: e.currentTarget.getAttribute("data-color") });
    }));
    document.querySelectorAll("#lobby-roles-list .lobby-role-card").forEach((card) => card.addEventListener("click", async (e) => {
      const role = e.currentTarget.getAttribute("data-role");
      const r = await window.netManager.customize({ role });
      if (!r.success) showToast(r.message);
    }));

    const enterLobby = (data) => {
      if (lobbyRoomCode) lobbyRoomCode.textContent = data.roomId;
      show("lobby");
      renderLobby(data.room);
      if (soloPending && data.room && data.room.players.length === 1) { soloPending = false; window.netManager.startGame(); }
    };
    window.netManager.on("room_created", enterLobby);
    window.netManager.on("room_joined", (data) => { if (!data.inFlight) enterLobby(data); });
    window.netManager.on("join_error", (err) => {
      if (window.location.search && window.history && window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);
      showToast(err.message || "Failed to join room");
    });
    window.netManager.on("room_update", (room) => {
      renderLobby(room);
      if (window.shuttleGame && window.shuttleGame.isActive) window.shuttleGame.onRoomUpdate(room);
    });
    window.netManager.on("game_started", () => {
      show("none");
      if (window.shuttleGame) window.shuttleGame.start({ net: window.netManager, onLeave: leaveCurrentRoom });
    });
    window.netManager.on("disconnected", () => {
      if (window.shuttleGame && window.shuttleGame.isActive) { window.shuttleGame.exit(true); show("menu"); showToast("Connection to the server lost"); }
    });

    // lobby chat
    const chatInput = document.getElementById("lobby-chat-input"), chatSend = document.getElementById("lobby-chat-send");
    const sendLobbyChat = () => { if (chatInput && chatInput.value.trim()) { window.netManager.sendChat(chatInput.value); chatInput.value = ""; } };
    if (chatSend) chatSend.addEventListener("click", sendLobbyChat);
    if (chatInput) chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendLobbyChat(); });
    window.netManager.on("chat_message", (comm) => {
      appendLobbyChat(comm);
      if (window.shuttleGame && window.shuttleGame.isActive) window.shuttleGame.onChat(comm);
    });

    // ---------------------------------------------------------------- comms (voice) settings
    const btnVoiceMic = null;     // the in-flight mic button lives in the Shuttle HUD
    const btnVoiceSettings = null;
    const btnLobbySettings = document.getElementById("btn-lobby-audio-settings");
    const modalSettings = document.getElementById("modal-station-systems");
    const btnCloseSettings = document.getElementById("btn-close-settings");
    const toggleSystemsSettingsModal = (force) => {
      if (!modalSettings) return;
      const open = typeof force === "boolean" ? force : modalSettings.style.display !== "flex";
      modalSettings.style.display = open ? "flex" : "none";
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
          tags.push(`<div class="active-speaker-tag ${vm.isRadioTransmitting ? "speaker-radio" : "speaker-local"}">${vm.isRadioTransmitting ? "📻" : "🎙️"} ${localName}</div>`);
        }
        if (window.netManager && window.netManager.remotePlayers) {
          for (const id in window.netManager.remotePlayers) {
            const rp = window.netManager.remotePlayers[id];
            if (rp && rp.isSpeaking && !rp.isMuted) {
              tags.push(`<div class="active-speaker-tag">🎙️ ${rp.name || "CREW"}</div>`);
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
            row.innerHTML = `
              <span class="crewmate-vol-name" style="color:${rp.color || "#ece7dc"};">${rp.name || "Crew"}</span>
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
          showToast(msg);
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
    if (btnLobbySettings) btnLobbySettings.addEventListener("click", () => { refreshAudioDevicesAndCrewList(); toggleSystemsSettingsModal(true); });
    if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => toggleSystemsSettingsModal(false));
    if (modalSettings) modalSettings.addEventListener("click", (e) => { if (e.target === modalSettings) toggleSystemsSettingsModal(false); });
    window.crewComms = {
      toggleMic: () => handleToggleVoiceComms(false),
      openSettings: () => { refreshAudioDevicesAndCrewList(); toggleSystemsSettingsModal(true); },
      state: () => { const vm = window.voiceManager; return vm ? (vm.isEnabled ? (vm.isMuted ? "MUTED" : "LIVE") : "OFF") : "N/A"; },
    };
  }

  const SEAT_NAMES = { cdr: "COMMANDER", plt: "PILOT", ms1: "MISSION SPECIALIST 1", ms2: "MISSION SPECIALIST 2" };
  function renderLobby(room) {
    if (!room) return;
    const players = room.players || [], crew = room.crew || {};
    const me = window.netManager.socketId;
    const grid = document.getElementById("lobby-players-grid");
    const count = document.getElementById("lobby-player-count");
    const btnStart = document.getElementById("btn-start-mission");
    if (count) count.textContent = `${players.length} / ${room.maxPlayers || 4} CREW`;
    if (btnStart) { btnStart.style.display = room.hostId === me ? "block" : "none"; btnStart.textContent = room.status === "playing" ? "REJOIN FLIGHT" : "GO TO BRIEFING"; }
    const hint = document.getElementById("lobby-hint");
    if (hint) hint.textContent = room.hostId === me ? "You are the host: launch the crew into the briefing when everyone has a seat." : "Waiting for the host to launch the crew into the briefing.";
    if (grid) {
      grid.innerHTML = `<div style="grid-column:1/-1;display:flex;justify-content:space-between;padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.12);font:700 11px ui-monospace,monospace;letter-spacing:1.4px;color:#ece7dc;"><span>FLIGHT DECK SEATS</span><span style="color:#9aa4ae;">${players.length} / ${room.maxPlayers || 4} ABOARD</span></div>`;
      for (const seat of ["cdr", "plt", "ms1", "ms2"]) {
        const c = crew[seat] || {}, p = players.find((x) => x.role === seat);
        const pod = document.createElement("div");
        pod.className = `lobby-player-pod ${p ? "occupied" : "empty"}`;
        pod.style.cssText = "padding:12px 14px;flex-direction:row;justify-content:space-between;gap:8px;min-height:60px;cursor:" + (p ? "default" : "pointer");
        const info = room.roleInfo && room.roleInfo[seat];
        pod.innerHTML = p
          ? `<div style="display:flex;align-items:center;gap:8px;"><div class="pod-color-indicator" style="width:30px;height:30px;background:${p.color};"></div><div style="text-align:left;"><div class="pod-name" style="font-size:12px;">${escapeHtml(p.name)} ${p.isHost ? "[HOST]" : ""} ${p.id === me ? '<span style="color:#67e8f9;">(YOU)</span>' : ""}</div><div class="pod-role" style="font-size:10px;color:${p.color};">${SEAT_NAMES[seat]}</div></div></div><div class="pod-ready-badge ready" style="padding:2px 6px;font-size:9px;">SEATED</div>`
          : `<div style="display:flex;align-items:center;gap:8px;"><div class="pod-color-indicator empty" style="width:30px;height:30px;"></div><div style="text-align:left;"><div class="pod-name" style="color:#9aa4ae;font-size:12px;">${SEAT_NAMES[seat]} — OPEN</div><div class="pod-role" style="font-size:9px;color:rgba(154,164,174,.8);">${info ? escapeHtml(info.duty) : ""}${c.name ? ` · covered by ${escapeHtml(c.name)}` : ""}</div></div></div><div style="font-size:10px;color:#67e8f9;font-weight:700;letter-spacing:1px;">TAKE &rarr;</div>`;
        if (!p) pod.addEventListener("click", async () => { const r = await window.netManager.customize({ role: seat }); if (!r.success) showToast(r.message); });
        grid.appendChild(pod);
      }
    }
    const mine = (players.find((x) => x.id === me) || {}).role;
    document.querySelectorAll("#lobby-roles-list .lobby-role-card").forEach((card) => {
      const seat = card.getAttribute("data-role");
      card.classList.toggle("active", seat === mine);
      const taken = players.find((x) => x.role === seat && x.id !== me);
      card.style.opacity = taken ? "0.45" : "1";
    });
  }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function appendLobbyChat(comm) {
    const container = document.getElementById("lobby-chat-msgs");
    if (!container) return;
    const div = document.createElement("div");
    div.className = "lobby-msg";
    div.innerHTML = `<strong style="color:${escapeHtml(comm.color)};">${escapeHtml(comm.sender)}:</strong> <span>${escapeHtml(comm.text)}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  window.addEventListener("DOMContentLoaded", init);
})();
