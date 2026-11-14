/**
 * ============================================================================
 * INTERFELLAS MULTIPLAYER NETWORKING ENGINE (NASA Expedition Room System)
 * ============================================================================
 */

(function (window) {
  "use strict";

  const ROLE_META = {
    commander: {
      id: "commander",
      short: "CMD",
      title: "Commander",
      label: "Commander",
      color: "#c08a8a",
      padDuty: "Board White Room & Initiate Liftoff [L]",
      dockDuty: "Primary 6DOF Pilot & Capture Latch [SPACE]",
      consolesSummary: "Charter [HUB] · Orbit & Launch [CMD] · Sim [LDR]",
      stationDuty: "Charter [HUB] · Orbit & Launch [CMD] · Sim [LDR]",
      primaryDuty: "Launch Director [L], Docking Helm Pilot [WASD/QE] & Charter/Nav Consoles [HUB, CMD]",
      duties: {
        pad: "Board White Room & Initiate Liftoff [L]",
        dock: "Primary 6DOF Pilot & Capture Latch [SPACE]",
        station: "Charter [HUB] · Orbit & Launch [CMD] · Sim [LDR]"
      }
    },
    engineer: {
      id: "engineer",
      short: "ENG",
      title: "Flight Engineer",
      label: "Flight Engineer",
      color: "#d0a15c",
      padDuty: "Extend & Lock Access Arm [F]",
      dockDuty: "RCS Attitude Stabilizer [1] & Fine Trim [2]",
      consolesSummary: "Bus & Power [PWR] · Comms, Hull & ΔV [HULL]",
      stationDuty: "Bus & Power [PWR] · Comms, Hull & ΔV [HULL]",
      primaryDuty: "Pad Access Arm [F], Docking RCS Stabilizer [1/2] & Power/Hull Consoles [PWR, HULL]",
      duties: {
        pad: "Extend & Lock Access Arm [F]",
        dock: "RCS Attitude Stabilizer [1] & Fine Trim [2]",
        station: "Bus & Power [PWR] · Comms, Hull & ΔV [HULL]"
      }
    },
    scientist: {
      id: "scientist",
      short: "SCI",
      title: "Science Officer",
      label: "Science Officer",
      color: "#7fb8a6",
      padDuty: "White Room Ingress & Cabin Bio-Check",
      dockDuty: "Boresight Auto-Align [3] & Corridor Ping [4]",
      consolesSummary: "Instruments [SCI] · Thermal & ECLSS [LSS]",
      stationDuty: "Instruments [SCI] · Thermal & ECLSS [LSS]",
      primaryDuty: "Bio-Check Ingress, Boresight Laser Telemetry [3/4] & Science/ECLSS Consoles [SCI, LSS]",
      duties: {
        pad: "White Room Ingress & Cabin Bio-Check",
        dock: "Boresight Auto-Align [3] & Corridor Ping [4]",
        station: "Instruments [SCI] · Thermal & ECLSS [LSS]"
      }
    }
  };

  function normalizeRole(rawRole, fallback = "commander") {
    const s = String(rawRole || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (!s) return fallback;
    if (s === "commander" || s === "cmd" || s.includes("commander") || s.includes("pilot")) {
      return "commander";
    }
    if (s === "engineer" || s === "eng" || s === "pwr" || s.includes("engineer")) {
      return "engineer";
    }
    if (
      s === "scientist" ||
      s === "sci" ||
      s === "lss" ||
      s.includes("scien") ||
      s.includes("payload") ||
      s.includes("eclss")
    ) {
      return "scientist";
    }
    return fallback;
  }

  function getRoleMeta(roleId) {
    const id = normalizeRole(roleId, "commander");
    return ROLE_META[id] || ROLE_META.commander;
  }

  function getCrewByRole(players = []) {
    const groups = { commander: [], engineer: [], scientist: [] };
    (Array.isArray(players) ? players : []).forEach((p) => {
      if (!p) return;
      const r = normalizeRole(p.role, "commander");
      groups[r].push(p);
    });
    return groups;
  }

  window.InterfellasRoles = {
    ORDER: ["commander", "engineer", "scientist"],
    META: ROLE_META,
    normalizeRole,
    getRoleMeta,
    getCrewByRole
  };

  class NetworkManager {
    constructor() {
      this.socket = null;
      this.connected = false;
      this.socketId = null;
      this.roomId = null;
      this.isHost = false;
      this.userId = null;
      this.authToken = this.readStoredToken();
      this.userProfile = null;
      this.localPlayer = {
        name: localStorage.getItem("interfellas_name") || "Astronaut " + Math.floor(100 + Math.random() * 900),
        color: "#ef4444",
        role: "commander",
        team: "crew",
        ready: false
      };
      this.explicitRoleSelected = false;
      this.roomState = null;
      this.mission = null;
      this.remotePlayers = {}; // id -> { id, name, color, role, targetPos, curPos, targetYaw, curYaw, mesh, isEva }
      this.lastSendTime = 0;
      this.lastHeartbeatTime = 0;
      this.lastSentState = null;
      this.tickRate = 20; // Hz (lower packet volume = lower queueing latency)
      this.sendInterval = 50; // 20 Hz default
      this.interpSpeed = 16.0; // legacy fallback smoothing rate
      this.interpDelayMs = 90; // render remote players slightly in the past for smooth buffered motion
      this.maxExtrapolationMs = 100; // never dead-reckon further than this past the newest packet
      this.maxRemoteSpeed = 8.0; // m/s safety clamp for extrapolated remote velocity
      this.idleHeartbeatMs = 750; // resend a stationary position this often
      this.deltaCulling = true; // Stationary delta culling active
      this.wasMoving = false;
      this.pingHistory = [];
      this.currentJitter = 0;
      this.lastPing = null;
      this.transportName = "unknown";
      this.packetsSentThisSec = 0;
      this.packetsReceivedThisSec = 0;
      this.packetsOutPerSec = 0;
      this.packetsInPerSec = 0;
      this.callbacks = {};

      // Start 1-second packet rate window calculator
      setInterval(() => {
        this.packetsOutPerSec = this.packetsSentThisSec;
        this.packetsInPerSec = this.packetsReceivedThisSec;
        this.packetsSentThisSec = 0;
        this.packetsReceivedThisSec = 0;
      }, 1000);

      // Browser throttles timers in background tabs. Discard samples taken
      // across a suspend/resume so the latency pill never sticks on a huge
      // stale value caused by main-thread throttling.
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", () => {
          if (document.hidden) {
            this.pingHistory.length = 0;
            this.currentJitter = 0;
            this.lastPing = null;
          }
        });
      }
    }

    on(event, cb) {
      this.callbacks[event] = this.callbacks[event] || [];
      this.callbacks[event].push(cb);
    }

    emitEvent(event, data) {
      if (this.callbacks[event]) {
        this.callbacks[event].forEach(cb => cb(data));
      }
    }

    readStoredToken() {
      try {
        const raw = localStorage.getItem("nasa_astronaut_credential");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return typeof parsed.token === "string" ? parsed.token : null;
      } catch (e) {
        return null;
      }
    }

    setAuthToken(token) {
      const nextToken = typeof token === "string" && token ? token : null;
      if (this.authToken === nextToken) return;
      this.authToken = nextToken;
      if (this.socket) {
        if (this.roomId) {
          this.leaveRoom();
        }
        this.socket.auth = { token: this.authToken };
        if (this.connected) this.socket.disconnect().connect();
      }
    }

    init() {
      this.socket = io({
        // Try a direct WebSocket first. Long-polling adds an HTTP round-trip
        // (and can stick around forever if the upgrade fails), which shows up
        // as permanently high latency. tryAllTransports keeps polling as a
        // compatibility fallback for restrictive networks.
        transports: ["websocket", "polling"],
        tryAllTransports: true,
        upgrade: true,
        rememberUpgrade: true,
        timeout: 10000,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: { token: this.authToken }
      });

      const trackTransport = () => {
        try {
          const engine = this.socket && this.socket.io && this.socket.io.engine;
          if (!engine) return;
          this.transportName = (engine.transport && engine.transport.name) || this.transportName;
          engine.on("upgrade", (transport) => {
            this.transportName = (transport && transport.name) || "websocket";
            console.log(`[NET] Transport upgraded to ${this.transportName}`);
          });
        } catch (e) {}
      };

      if (typeof this.socket.onAny === "function") {
        this.socket.onAny(() => {
          this.packetsReceivedThisSec++;
        });
      }

      this.socket.on("connect", () => {
        this.connected = true;
        this.socketId = this.socket.id;
        this.transportName = (this.socket.io && this.socket.io.engine && this.socket.io.engine.transport && this.socket.io.engine.transport.name) || "unknown";
        trackTransport();
        console.log(`[NET] Connected to Interfellas server via ${this.transportName}. Socket ID: ${this.socketId}`);
        this.emitEvent("connected", { socketId: this.socketId });

        // Initialize Proximity Voice Manager with active socket
        if (window.voiceManager) {
          window.voiceManager.init(this.socket);
        }

        // Sync persistent user profile with server DB
        this.syncUser();

        // Check if URL has an explicit ?room=CODE query parameter (only once on initial connect)
        if (!this._didAutoJoinUrl) {
          this._didAutoJoinUrl = true;
          const urlParams = new URLSearchParams(window.location.search);
          const roomFromUrl = (urlParams.get("room") || "").trim().toUpperCase();
          if (/^[A-Z0-9]{4,8}$/.test(roomFromUrl)) {
            this.emitEvent("auto_join_url", roomFromUrl);
          }
        }
      });

      this.socket.on("user_synced", (profile) => {
        this.userProfile = profile;
        if (profile && profile.id) this.userId = profile.id;
        const displayName = profile && (profile.callsign || profile.username);
        if (displayName) {
          this.localPlayer.name = displayName;
          localStorage.setItem("interfellas_name", displayName);
        }
        if (profile && profile.suit_color) this.localPlayer.color = profile.suit_color;
        if (profile && (profile.preferred_role || profile.flight_title)) {
          const normalizedRole = normalizeRole(profile.preferred_role || profile.flight_title, "commander");
          this.localPlayer.role = normalizedRole;
          // A default Commander preference should not suppress crew
          // auto-balancing. Only a deliberately non-default specialization is
          // treated as an explicit role choice.
          if (profile && !profile.isGuest && normalizedRole !== "commander") {
            this.explicitRoleSelected = true;
          }
        }
        this.emitEvent("user_synced", profile);
      });

      this.socket.on("disconnect", () => {
        this.connected = false;
        this.transportName = "offline";
        console.warn("[NET] Disconnected from server");
        if (window.voiceManager) window.voiceManager.stopMicrophone();
        this.emitEvent("disconnected", {});
      });

      const applyAuthoritativeRoomMembership = (data) => {
        this.roomId = data.roomId;
        this.isHost = data.hostId === this.socketId;
        this.roomState = data.room || this.roomState;
        this.mission = (data.room && data.room.mission) || data.mission || this.mission || null;
        if (data.player) {
          if (data.player.name) this.localPlayer.name = data.player.name;
          if (data.player.color) this.localPlayer.color = data.player.color;
          if (data.player.role) this.localPlayer.role = normalizeRole(data.player.role, "commander");
          if (data.player.modelId) this.localPlayer.modelId = data.player.modelId;
          this.localPlayer.team = data.player.team || "crew";
        }
        const roomPlayers = data.room && Array.isArray(data.room.players) ? data.room.players : [];
        roomPlayers.forEach((p) => {
          if (!p || p.id === this.socketId || this.remotePlayers[p.id]) return;
          this.remotePlayers[p.id] = {
            id: p.id,
            name: p.name,
            color: p.color,
            role: normalizeRole(p.role, "commander"),
            team: p.team || "crew",
            ready: p.ready,
            modelId: p.modelId || "astronaut_lod1",
            curPos: p.pos ? [...p.pos] : [0, 0, -18],
            targetPos: p.pos ? [...p.pos] : [0, 0, -18],
            curYaw: p.yaw || 0,
            targetYaw: p.yaw || 0,
            curPitch: p.pitch || 0,
            targetPitch: p.pitch || 0,
            snapshots: [],
            mesh: null,
            emoteId: null,
            emoteSerial: 0,
            lastEmoteSerial: 0
          };
        });
      };

      this.socket.on("room_created", (data) => {
        applyAuthoritativeRoomMembership(data);
        if (window.voiceManager) {
          if (window.voiceManager.isEnabled && this.socket) {
            this.socket.emit("voice_join", { roomId: this.roomId });
          }
          window.voiceManager.connectToExistingRoomPeers();
        }
        this.emitEvent("room_created", data);
        if (window.spaceAudio) window.spaceAudio.playRadioBeep(true);
      });

      this.socket.on("room_joined", (data) => {
        applyAuthoritativeRoomMembership(data);
        if (window.voiceManager) {
          if (window.voiceManager.isEnabled && this.socket) {
            this.socket.emit("voice_join", { roomId: this.roomId });
          }
          window.voiceManager.connectToExistingRoomPeers();
        }
        this.emitEvent("room_joined", data);
        if (window.spaceAudio) window.spaceAudio.playRadioBeep(true);
      });

      this.socket.on("join_error", (data) => {
        this.emitEvent("join_error", data);
      });

      this.socket.on("room_update", (data) => {
        this.roomState = data;
        this.isHost = data.hostId === this.socketId;
        if (data.mission) this.mission = data.mission;

        // Update remote players list
        const currentIds = new Set();
        data.players.forEach(p => {
          if (p.id !== this.socketId) {
            currentIds.add(p.id);
            if (!this.remotePlayers[p.id]) {
              this.remotePlayers[p.id] = {
                id: p.id,
                name: p.name,
                color: p.color,
                role: normalizeRole(p.role, "commander"),
                team: p.team || "crew",
                ready: p.ready,
                modelId: p.modelId || "astronaut_lod1",
                curPos: p.pos ? [...p.pos] : [0, 0, -18],
                targetPos: p.pos ? [...p.pos] : [0, 0, -18],
                curYaw: p.yaw || 0,
                targetYaw: p.yaw || 0,
                curPitch: p.pitch || 0,
                targetPitch: p.pitch || 0,
                snapshots: [],
                mesh: null,
                emoteId: null,
                emoteSerial: 0,
                lastEmoteSerial: 0
              };
            } else {
              this.remotePlayers[p.id].name = p.name;
              this.remotePlayers[p.id].color = p.color;
              this.remotePlayers[p.id].role = normalizeRole(p.role, "commander");
              this.remotePlayers[p.id].team = p.team || "crew";
              this.remotePlayers[p.id].ready = p.ready;
              this.remotePlayers[p.id].modelId = p.modelId || "astronaut_lod1";
            }
          } else {
            // Local player update
            this.localPlayer.name = p.name;
            this.localPlayer.color = p.color;
            this.localPlayer.role = normalizeRole(p.role, "commander");
            this.localPlayer.team = p.team || "crew";
            this.localPlayer.ready = p.ready;
          }
        });

        // Remove departed players
        for (const id in this.remotePlayers) {
          if (!currentIds.has(id)) {
            if (this.remotePlayers[id].mesh && this.remotePlayers[id].mesh.parent) {
              this.remotePlayers[id].mesh.parent.remove(this.remotePlayers[id].mesh);
            }
            if (window.voiceManager) {
              window.voiceManager.cleanupPeer(id);
            }
            delete this.remotePlayers[id];
          }
        }

        if (window.voiceManager) {
          window.voiceManager.connectToExistingRoomPeers();
        }

        this.emitEvent("room_update", data);
      });

      this.socket.on("game_started", (data) => {
        if (data && data.mission) {
          this.mission = data.mission;
          if (this.roomState) this.roomState.mission = data.mission;
        }
        if (this.roomState) this.roomState.status = "playing";
        if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
        this.emitEvent("game_started", data);
      });

      this.socket.on("mission_update", (data) => {
        if (!data) return;
        if (data.mission) {
          this.mission = data.mission;
          if (this.roomState) this.roomState.mission = data.mission;
        }
        this.emitEvent("mission_update", data);
      });

      this.socket.on("player_moved", (data) => {
        const rp = this.remotePlayers[data.id];
        if (!rp) return;

        const now = performance.now();
        if (!rp.snapshots) rp.snapshots = [];

        if (data.pos) {
          const pos = [Number(data.pos[0]), Number(data.pos[1]), Number(data.pos[2])];
          if (!pos.every(Number.isFinite)) return;
          const yaw = typeof data.yaw === "number" ? data.yaw : (rp.targetYaw || 0);
          const last = rp.snapshots[rp.snapshots.length - 1];
          const serverTime = Number.isFinite(data.t) ? data.t : null;

          // Pace the render timeline with the server's send interval when it is
          // available. WebSocket/polling can deliver several samples in one
          // burst; arrival-only timestamps would then collapse those samples
          // into a few milliseconds and make them look like teleports.
          let sampleTime = now;
          if (last && serverTime !== null && last.serverT !== null && last.serverT !== undefined) {
            const serverDelta = serverTime - last.serverT;
            if (serverDelta > 0 && serverDelta <= 500) {
              sampleTime = Math.min(now + 120, Math.max(now, last.t + serverDelta));
            }
          }
          if (last && sampleTime <= last.t) sampleTime = last.t + 1;

          // After a quiet period the previous packet may be a stale heartbeat.
          // Seed the buffer from the currently rendered position so the avatar
          // glides into the new position instead of snapping.
          if (!last || now - (rp.lastPacketAt || 0) > 300) {
            rp.snapshots = [{
              t: sampleTime - this.interpDelayMs,
              serverT: null,
              pos: [...rp.curPos],
              yaw: rp.curYaw || yaw
            }];
          }

          // Track actual movement separately from interpolation. Extrapolation
          // can put curPos ahead of targetPos, and that must not keep the walk
          // animation playing while the player is standing still. New packets
          // carry an explicit moving flag; older servers are handled with the
          // position comparison fallback.
          if (typeof data.moving === "boolean") {
            rp.lastMoveAt = data.moving ? now : 0;
          } else {
            const newest = rp.snapshots[rp.snapshots.length - 1];
            if (last && newest) {
              const dx = pos[0] - newest.pos[0];
              const dz = pos[2] - newest.pos[2];
              rp.lastMoveAt = (dx * dx + dz * dz > 0.0001) ? now : 0;
            } else {
              rp.lastMoveAt = 0;
            }
          }

          rp.snapshots.push({ t: sampleTime, serverT: serverTime, pos: pos, yaw: yaw });
          while (rp.snapshots.length > 40) rp.snapshots.shift();

          rp.targetPos = pos;
          rp.targetYaw = yaw;
          rp.lastPacketAt = now;
        }

        if (typeof data.yaw === "number") rp.targetYaw = data.yaw;
        if (typeof data.pitch === "number") rp.targetPitch = data.pitch;
        if (typeof data.isEva === "boolean") rp.isEva = data.isEva;
        if (typeof data.suitLights === "boolean") rp.suitLights = data.suitLights;
      });

      this.socket.on("emote_broadcast", (data) => {
        const rp = this.remotePlayers[data.id];
        if (rp) {
          rp.emoteId = data.emoteId;
          rp.emoteSerial = (rp.emoteSerial || 0) + 1;
        }
        this.emitEvent("emote_broadcast", data);
      });

      this.socket.on("task_completed_broadcast", (data) => {
        if (data && data.mission) {
          this.mission = data.mission;
          if (this.roomState) this.roomState.mission = data.mission;
        }
        if (window.spaceAudio) window.spaceAudio.playRadioBeep(false);
        this.emitEvent("task_completed", data);
      });

      this.socket.on("objective_locked", (data) => {
        if (data && data.mission) {
          this.mission = data.mission;
          if (this.roomState) this.roomState.mission = data.mission;
        }
        if (window.spaceAudio) window.spaceAudio.playAlarm("warning");
        this.emitEvent("objective_locked", data);
      });

      this.socket.on("lobby_returned", (data) => {
        if (data && data.room) {
          this.roomState = data.room;
          this.mission = data.room.mission || null;
          this.isHost = data.room.hostId === this.socketId;
        }
        this.emitEvent("lobby_returned", data);
      });

      this.socket.on("crew_victory", (data) => {
        if (data && data.mission) {
          this.mission = data.mission;
          if (this.roomState) this.roomState.mission = data.mission;
        }
        if (this.roomState) this.roomState.status = "victory";
        if (window.spaceAudio) window.spaceAudio.playWormholeJump();
        this.emitEvent("crew_victory", data);
      });

      this.socket.on("chat_broadcast", (comm) => {
        if (window.spaceAudio) window.spaceAudio.playRadioBeep(false);
        this.emitEvent("chat_message", comm);
      });

      this.socket.on("state_sync", (data) => {
        if (this.roomState && data) {
          if (data.systems) this.roomState.systems = data.systems;
          if (data.tasks) this.roomState.tasks = data.tasks;
          if (data.status) this.roomState.status = data.status;
        }
        this.emitEvent("state_sync", data);
      });

      this.socket.on("docking_state", (data) => {
        if (this.roomState && this.roomState.systems) {
          this.roomState.systems.dockingState = data;
        }
        this.emitEvent("docking_state", data);
      });

      this.socket.on("docking_assist_event", (data) => {
        this.emitEvent("docking_assist_event", data);
      });

      this.socket.on("docking_pilot_changed", (data) => {
        if (this.roomState && this.roomState.systems && data && data.pilotId) {
          this.roomState.systems.dockingPilotId = data.pilotId;
        }
        if (this.mission && data && data.pilotId) {
          this.mission.dockingPilotId = data.pilotId;
        }
        this.emitEvent("docking_pilot_changed", data);
      });

      this.socket.on("player_left", (data) => {
        this.emitEvent("player_left", data);
      });
    }

    syncUser(playerName, suitColor, role) {
      if (!this.connected) return;
      this.socket.emit("sync_user", {
        playerName: playerName || this.localPlayer.name,
        suitColor: suitColor || this.localPlayer.color,
        role: normalizeRole(role || this.localPlayer.role, "commander")
      });
    }

    createRoom(playerName, suitColor, role, teamOrOpts, explicitRole) {
      if (playerName) {
        this.localPlayer.name = playerName;
        localStorage.setItem("interfellas_name", playerName);
      }
      const opts = (teamOrOpts && typeof teamOrOpts === "object") ? teamOrOpts : {};
      const explicit = typeof explicitRole === "boolean"
        ? explicitRole
        : (typeof opts.explicitRole === "boolean" ? opts.explicitRole : !!this.explicitRoleSelected);
      const normalized = normalizeRole(role || this.localPlayer.role, "commander");
      this.localPlayer.role = normalized;
      this.localPlayer.team = "crew";
      this.socket.emit("create_room", {
        playerName: this.localPlayer.name,
        suitColor: suitColor || this.localPlayer.color,
        role: normalized,
        explicitRole: explicit,
        team: "crew"
      });
    }

    joinRoom(roomId, playerName, suitColor, role, teamOrOpts, explicitRole) {
      if (playerName) {
        this.localPlayer.name = playerName;
        localStorage.setItem("interfellas_name", playerName);
      }
      const opts = (teamOrOpts && typeof teamOrOpts === "object") ? teamOrOpts : {};
      const explicit = typeof explicitRole === "boolean"
        ? explicitRole
        : (typeof opts.explicitRole === "boolean" ? opts.explicitRole : !!this.explicitRoleSelected);
      const normalized = role ? normalizeRole(role, "commander") : normalizeRole(this.localPlayer.role, "commander");
      this.localPlayer.role = normalized;
      this.localPlayer.team = "crew";
      this.socket.emit("join_room", {
        roomId: roomId.trim().toUpperCase(),
        playerName: this.localPlayer.name,
        suitColor: suitColor || this.localPlayer.color,
        role: explicit ? normalized : "",
        explicitRole: explicit,
        team: "crew"
      });
    }

    quickPlay(playerName, suitColor, role, explicitOrOpts) {
      if (playerName) {
        this.localPlayer.name = playerName;
        localStorage.setItem("interfellas_name", playerName);
      }
      const explicit = typeof explicitOrOpts === "boolean"
        ? explicitOrOpts
        : (explicitOrOpts && typeof explicitOrOpts === "object" && typeof explicitOrOpts.explicitRole === "boolean"
          ? explicitOrOpts.explicitRole
          : !!this.explicitRoleSelected);
      const normalized = role ? normalizeRole(role, "commander") : normalizeRole(this.localPlayer.role, "commander");
      this.localPlayer.role = normalized;
      this.localPlayer.team = "crew";
      this.socket.emit("quick_play", {
        playerName: this.localPlayer.name,
        suitColor: suitColor || this.localPlayer.color,
        role: explicit ? normalized : "",
        explicitRole: explicit,
        team: "crew"
      });
    }

    sendEmote(emoteId) {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("player_emote", {
        roomId: this.roomId,
        emoteId: String(emoteId || "").slice(0, 24)
      });
    }

    leaveRoom() {
      if (this.socket && this.roomId) {
        this.socket.emit("voice_leave", { roomId: this.roomId });
        this.socket.emit("leave_room");
      }
      if (window.voiceManager) {
        for (const peerId in window.voiceManager.peers) {
          window.voiceManager.cleanupPeer(peerId);
        }
      }
      this.roomId = null;
      this.roomState = null;
      this.mission = null;
      this.isHost = false;
      this.remotePlayers = {};
      this.lastSentState = null;
      this.wasMoving = false;
      this.lastSendTime = 0;
      this.lastHeartbeatTime = 0;
    }

    customizeAstronaut(name, color, role, ready, modelId, team, opts) {
      if (name) {
        this.localPlayer.name = name;
        localStorage.setItem("interfellas_name", name);
      }
      if (color) this.localPlayer.color = color;
      if (role) {
        this.localPlayer.role = normalizeRole(role, "commander");
        if (!opts || opts.explicitRole !== false) {
          this.explicitRoleSelected = true;
        }
      }
      this.localPlayer.team = "crew";
      if (modelId) this.localPlayer.modelId = modelId;
      if (typeof ready === "boolean") this.localPlayer.ready = ready;

      if (!this.socket || !this.connected) return;
      this.socket.emit("customize_astronaut", {
        name: this.localPlayer.name,
        color: this.localPlayer.color,
        role: this.localPlayer.role,
        team: "crew",
        modelId: this.localPlayer.modelId,
        ready: this.localPlayer.ready
      });
    }

    startGame() {
      if (this.isHost) {
        this.socket.emit("start_game");
      }
    }

    // Shared launch-complex actions. The server owns the authoritative phase
    // and rebroadcasts it so every astronaut transitions together.
    setMissionDockLocked(locked) {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("space_dock", { locked: !!locked });
    }

    boardSpacecraft() {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("space_board");
    }

    requestLaunch() {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("space_launch");
    }

    voteLaunchSkip() {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("launch_skip_vote");
    }

    beginDockingPhase(options = {}) {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("space_phase", {
        phase: "docking",
        naturalEnd: !!(options && options.naturalEnd)
      });
    }

    sendDockingState(state) {
      if (!this.connected || !this.roomId || !state) return;
      this.socket.emit("docking_sync", state);
    }

    sendDockingAssist(kind) {
      if (!this.connected || !this.roomId || !kind) return;
      this.socket.emit("docking_assist", { kind });
    }

    requestDockingHelm(targetId) {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("docking_pilot", { targetId: targetId || this.socketId });
    }

    completeDocking(options = {}) {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("space_dock_complete", {
        corridorCapture: !!(options && options.corridorCapture)
      });
    }

    resetMission() {
      if (!this.connected || !this.roomId) return;
      this.socket.emit("space_reset");
    }

    getMission() {
      return this.mission || (this.roomState && this.roomState.mission) || null;
    }

    sendPlayerUpdate(pos, yaw, pitch, isEva, suitLights) {
      if (!this.connected || !this.roomId) return;
      const now = performance.now();
      if (now - this.lastSendTime < this.sendInterval) return;

      let movedSinceLastPacket = false;
      let isTranslating = false;
      let justStopped = false;

      if (this.lastSentState) {
        const dx = pos.x - this.lastSentState.x;
        const dy = pos.y - this.lastSentState.y;
        const dz = pos.z - this.lastSentState.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        const dYaw = Math.abs(yaw - this.lastSentState.yaw);
        const dPitch = Math.abs(pitch - this.lastSentState.pitch);
        const stateSame = (isEva === this.lastSentState.isEva) && (suitLights === this.lastSentState.suitLights);

        // Translation drives the walk animation / extrapolation; yaw still
        // counts for culling so remote avatars turn smoothly in place.
        isTranslating = distSq >= 0.00002;
        movedSinceLastPacket = isTranslating || dYaw >= 0.015;
        // Always send the first frame after movement stops so remote clients
        // receive the exact resting position instead of dead-reckoning past it.
        justStopped = this.wasMoving && !isTranslating;

        // Stationary Delta Culling: skip packets when astronaut has practically
        // not moved or turned and the last heartbeat is still fresh.
        if (this.deltaCulling && !movedSinceLastPacket && dPitch < 0.015 && stateSame && !justStopped && (now - this.lastHeartbeatTime < this.idleHeartbeatMs)) {
          this.wasMoving = false;
          return;
        }
      }
      this.wasMoving = isTranslating;

      this.lastSendTime = now;
      this.lastHeartbeatTime = now;
      this.lastSentState = {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: yaw,
        pitch: pitch,
        isEva: !!isEva,
        suitLights: !!suitLights
      };

      this.packetsSentThisSec++;
      this.socket.emit("player_update", {
        pos: [Number(pos.x.toFixed(3)), Number(pos.y.toFixed(3)), Number(pos.z.toFixed(3))],
        yaw: Number(yaw.toFixed(3)),
        pitch: Number(pitch.toFixed(3)),
        isEva: !!isEva,
        suitLights: !!suitLights,
        moving: isTranslating
      });
    }

    setTickRate(hz) {
      // Cap the realtime rate at 30 Hz. Extra packets mostly add queueing
      // latency without improving the interpolated remote avatar.
      this.tickRate = Math.max(10, Math.min(30, Number(hz) || 20));
      this.sendInterval = Math.round(1000 / this.tickRate);
      // If the client had to fall back to HTTP long-polling, avoid flooding
      // it with polling requests.
      if (this.transportName === "polling" && this.sendInterval < 50) {
        this.sendInterval = 50;
      }
    }

    setInterpBuffer(mode) {
      if (mode === "smooth" || mode === 130 || mode === "130ms") {
        this.interpDelayMs = 130;
        this.interpSpeed = 9.0;
      } else if (mode === "snappy" || mode === 50 || mode === "50ms") {
        this.interpDelayMs = 50;
        this.interpSpeed = 26.0;
      } else {
        this.interpDelayMs = 90;
        this.interpSpeed = 16.0;
      }
    }

    setDeltaCulling(enabled) {
      this.deltaCulling = Boolean(enabled);
    }

    recordPing(ms) {
      if (typeof ms !== "number" || isNaN(ms)) return this.getPingMedian();
      this.lastPing = Math.max(1, Math.round(ms));
      this.pingHistory.push(this.lastPing);
      if (this.pingHistory.length > 12) this.pingHistory.shift();
      if (this.pingHistory.length >= 2) {
        const mean = this.pingHistory.reduce((a, b) => a + b, 0) / this.pingHistory.length;
        const variance = this.pingHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.pingHistory.length;
        this.currentJitter = Math.round(Math.sqrt(variance));
      }
      return this.getPingMedian();
    }

    getPingMedian() {
      if (!this.pingHistory.length) return null;
      const sorted = this.pingHistory.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2
        ? sorted[mid]
        : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }

    getTelemetry() {
      const currentPing = this.getPingMedian();
      return {
        ping: currentPing,
        lastPing: this.lastPing,
        jitter: this.currentJitter,
        packetsOut: this.packetsOutPerSec,
        packetsIn: this.packetsInPerSec,
        tickRate: this.tickRate,
        deltaCulling: this.deltaCulling,
        interpSpeed: this.interpSpeed,
        transport: this.transportName,
        connected: this.connected
      };
    }

    completeTask(taskId, taskName, designPatch) {
      this.packetsSentThisSec++;
      this.socket.emit("complete_task", { taskId, taskName, designPatch });
    }

    syncMissionDesign(designPatch) {
      if (!this.socket || !designPatch) return;
      this.packetsSentThisSec++;
      this.socket.emit("mission_design_sync", { designPatch });
    }

    selectMission(scenarioId, difficultyId) {
      this.packetsSentThisSec++;
      this.socket.emit("select_mission", {
        scenarioId: scenarioId || undefined,
        difficultyId: difficultyId || undefined
      });
    }

    returnToLobby() {
      this.packetsSentThisSec++;
      this.socket.emit("return_to_lobby");
    }

    sendChat(text) {
      if (!text.trim()) return;
      this.packetsSentThisSec++;
      this.socket.emit("chat_message", { text: text.trim() });
    }

    updateRemotePlayersInterpolation(delta) {
      const now = performance.now();
      const renderTime = now - (this.interpDelayMs || 90);
      const fallbackFactor = Math.min(1.0, Math.max(0.001, delta) * (this.interpSpeed || 15.0));
      const maxExtrapolationMs = this.maxExtrapolationMs || 100;
      const maxRemoteSpeed = this.maxRemoteSpeed || 8.0;

      for (const id in this.remotePlayers) {
        const rp = this.remotePlayers[id];
        if (!rp.curPos || !rp.targetPos) continue;

        const snaps = rp.snapshots;
        if (snaps && snaps.length > 0) {
          // Drop snapshots that are far behind the render window, but keep
          // enough history to bridge late packets.
          while (snaps.length > 2 && snaps[1].t < renderTime - 1000) snaps.shift();

          const first = snaps[0];
          const last = snaps[snaps.length - 1];
          let base = first;
          let next = null;
          let alpha = 0;

          if (renderTime >= last.t) {
            const prev = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
            let spanMs = prev ? last.t - prev.t : 0;
            if (prev && Number.isFinite(last.serverT) && Number.isFinite(prev.serverT)) {
              spanMs = last.serverT - prev.serverT;
            }
            const aheadMs = Math.min(maxExtrapolationMs, renderTime - last.t);
            const movingRecently = rp.lastMoveAt && (now - rp.lastMoveAt < 300);

            // Dead-reckon only for a short window and only while the remote
            // actually moved recently. Burst arrivals can otherwise generate
            // enormous velocities and fling an idle avatar across the scene.
            if (prev && movingRecently && aheadMs > 0 && spanMs >= 16 && spanMs <= 1000) {
              const spanSec = spanMs / 1000;
              const aheadSec = aheadMs / 1000;
              let vx = (last.pos[0] - prev.pos[0]) / spanSec;
              let vy = (last.pos[1] - prev.pos[1]) / spanSec;
              let vz = (last.pos[2] - prev.pos[2]) / spanSec;

              const speed = Math.hypot(vx, vy, vz);
              if (speed > maxRemoteSpeed) {
                const scale = maxRemoteSpeed / speed;
                vx *= scale;
                vy *= scale;
                vz *= scale;
              }

              rp.curPos[0] = last.pos[0] + vx * aheadSec;
              rp.curPos[1] = last.pos[1] + vy * aheadSec;
              rp.curPos[2] = last.pos[2] + vz * aheadSec;

              let dy = last.yaw - prev.yaw;
              while (dy < -Math.PI) dy += Math.PI * 2;
              while (dy > Math.PI) dy -= Math.PI * 2;
              let angularVelocity = dy / spanSec;
              const maxAngularVelocity = 12.0;
              if (Math.abs(angularVelocity) > maxAngularVelocity) {
                angularVelocity = Math.sign(angularVelocity) * maxAngularVelocity;
              }
              rp.curYaw = last.yaw + angularVelocity * aheadSec;
            } else {
              rp.curPos[0] = last.pos[0];
              rp.curPos[1] = last.pos[1];
              rp.curPos[2] = last.pos[2];
              rp.curYaw = last.yaw;
            }
          } else if (renderTime <= first.t) {
            rp.curPos[0] = first.pos[0];
            rp.curPos[1] = first.pos[1];
            rp.curPos[2] = first.pos[2];
            rp.curYaw = first.yaw;
          } else {
            for (let i = 0; i < snaps.length - 1; i++) {
              if (snaps[i].t <= renderTime && renderTime <= snaps[i + 1].t) {
                base = snaps[i];
                next = snaps[i + 1];
                alpha = (renderTime - base.t) / Math.max(1, next.t - base.t);
                break;
              }
            }

            if (next) {
              rp.curPos[0] = base.pos[0] + (next.pos[0] - base.pos[0]) * alpha;
              rp.curPos[1] = base.pos[1] + (next.pos[1] - base.pos[1]) * alpha;
              rp.curPos[2] = base.pos[2] + (next.pos[2] - base.pos[2]) * alpha;
              let dy = next.yaw - base.yaw;
              while (dy < -Math.PI) dy += Math.PI * 2;
              while (dy > Math.PI) dy -= Math.PI * 2;
              rp.curYaw = base.yaw + dy * alpha;
            } else {
              rp.curPos[0] = last.pos[0];
              rp.curPos[1] = last.pos[1];
              rp.curPos[2] = last.pos[2];
              rp.curYaw = last.yaw;
            }
          }
        } else {
          // Legacy fallback for players whose first packet has not arrived.
          rp.curPos[0] += (rp.targetPos[0] - rp.curPos[0]) * fallbackFactor;
          rp.curPos[1] += (rp.targetPos[1] - rp.curPos[1]) * fallbackFactor;
          rp.curPos[2] += (rp.targetPos[2] - rp.curPos[2]) * fallbackFactor;

          let diff = rp.targetYaw - rp.curYaw;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          rp.curYaw += diff * fallbackFactor;
        }

        if (rp.mesh) {
          rp.mesh.position.set(rp.curPos[0], rp.curPos[1], rp.curPos[2]);
          rp.mesh.rotation.y = rp.curYaw;
        }
      }
    }
  }

  window.NetworkManager = NetworkManager;
  window.netManager = new NetworkManager();
})(window);
