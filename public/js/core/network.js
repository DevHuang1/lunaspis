/**
 * ============================================================================
 * INTERFELLAS CO-OP NETWORK CLIENT (Shuttle crew rooms)
 * ============================================================================
 * Rooms, crew seats, lobby chat and voice signalling, plus the Shuttle mission channel:
 * the server runs the authoritative simulation; this client sends seat-owned commands and
 * control axes and receives MissionSnapshots / events.
 */
(function (window) {
  "use strict";

  class NetworkManager {
    constructor() {
      this.socket = null;
      this.connected = false;
      this.socketId = null;
      this.roomId = null;
      this.isHost = false;
      this.userId = localStorage.getItem("interfellas_user_id");
      if (!this.userId) {
        this.userId = "crew_" + Math.random().toString(36).substring(2, 10);
        localStorage.setItem("interfellas_user_id", this.userId);
      }
      this.userProfile = null;
      this.localPlayer = {
        name: localStorage.getItem("interfellas_name") || "Astronaut " + Math.floor(100 + Math.random() * 900),
        color: "#ef4444",
        role: "cdr",
        team: "crew",
        ready: false
      };
      this.roomState = null;
      this.remotePlayers = {}; // id -> { id, name, color, role, isSpeaking } (used by voice chat)
      this.snapshot = null;
      this.snapshotAt = 0;
      this.pingMs = 0;
      this.serverOffsetMs = 0;   // serverNow ≈ Date.now() + serverOffsetMs (from ping round trips)
      this.coverageState = null;
      this.callbacks = {};
    }

    on(event, cb) { (this.callbacks[event] = this.callbacks[event] || []).push(cb); }
    off(event, cb) { if (this.callbacks[event]) this.callbacks[event] = this.callbacks[event].filter((f) => f !== cb); }
    emitEvent(event, data) { (this.callbacks[event] || []).forEach((cb) => cb(data)); }

    init() {
      this.socket = io({ transports: ["websocket", "polling"], reconnectionAttempts: 10, reconnectionDelay: 1000 });

      this.socket.on("connect", () => {
        this.connected = true;
        this.socketId = this.socket.id;
        console.log(`[NET] Connected. Socket ID: ${this.socketId}`);
        this.emitEvent("connected", { socketId: this.socketId });
        if (window.voiceManager) window.voiceManager.init(this.socket);
        this.syncUser();
        if (!this._didAutoJoinUrl) {
          this._didAutoJoinUrl = true;
          const roomFromUrl = (new URLSearchParams(window.location.search).get("room") || "").trim().toUpperCase();
          if (/^[A-Z0-9]{4,8}$/.test(roomFromUrl)) this.emitEvent("auto_join_url", roomFromUrl);
        }
        if (!this._pingTimer) this._pingTimer = setInterval(() => this.ping(), 2000);
        [50, 400, 900].forEach((ms) => setTimeout(() => this.ping(), ms));   // quick first clock-offset samples
      });

      this.socket.on("user_synced", (profile) => {
        this.userProfile = profile;
        if (profile.username) { this.localPlayer.name = profile.username; localStorage.setItem("interfellas_name", profile.username); }
        if (profile.suit_color) this.localPlayer.color = profile.suit_color;
        this.emitEvent("user_synced", profile);
      });

      this.socket.on("disconnect", () => {
        this.connected = false;
        console.warn("[NET] Disconnected from server");
        if (window.voiceManager) window.voiceManager.stopMicrophone();
        this.emitEvent("disconnected", {});
      });

      const onEnterRoom = (kind) => (data) => {
        this.roomId = data.roomId;
        this.isHost = data.hostId === this.socketId;
        this.roomState = data.room;
        if (window.voiceManager) {
          if (window.voiceManager.isEnabled && this.socket) this.socket.emit("voice_join", { roomId: this.roomId });
          window.voiceManager.connectToExistingRoomPeers();
        }
        this.emitEvent(kind, data);
      };
      this.socket.on("room_created", onEnterRoom("room_created"));
      this.socket.on("room_joined", onEnterRoom("room_joined"));
      this.socket.on("join_error", (data) => this.emitEvent("join_error", data));
      this.socket.on("role_rejected", (data) => this.emitEvent("role_rejected", data));

      this.socket.on("room_update", (data) => {
        this.roomState = data;
        this.isHost = data.hostId === this.socketId;
        const ids = new Set();
        data.players.forEach((p) => {
          if (p.id === this.socketId) { Object.assign(this.localPlayer, { name: p.name, color: p.color, role: p.role, ready: p.ready }); return; }
          ids.add(p.id);
          const rp = this.remotePlayers[p.id] || (this.remotePlayers[p.id] = { id: p.id, isSpeaking: false });
          Object.assign(rp, { name: p.name, color: p.color, role: p.role, team: "crew", ready: p.ready });
        });
        for (const id in this.remotePlayers) {
          if (!ids.has(id)) { if (window.voiceManager) window.voiceManager.cleanupPeer(id); delete this.remotePlayers[id]; }
        }
        if (window.voiceManager) window.voiceManager.connectToExistingRoomPeers();
        this.emitEvent("room_update", data);
      });

      this.socket.on("game_started", (data) => this.emitEvent("game_started", data));
      this.socket.on("player_left", (data) => this.emitEvent("player_left", data));
      this.socket.on("chat_broadcast", (comm) => this.emitEvent("chat_message", comm));

      // Shuttle mission channel
      this.socket.on("shuttle_state", (sn) => { this.snapshot = sn; this.snapshotAt = performance.now(); this.emitEvent("shuttle_state", sn); });
      this.socket.on("shuttle_events", (ev) => this.emitEvent("shuttle_events", ev));
      this.socket.on("shuttle_command_log", (log) => this.emitEvent("shuttle_command_log", log));
      this.socket.on("pad_moved", (d) => this.emitEvent("pad_moved", d));

      // CubeSat coverage channel (server owns scenario, clock and edit rights; clients compute forecasts)
      this.socket.on("coverage_state", (st) => { this.coverageState = st; this.emitEvent("coverage_state", st); });
      this.socket.on("coverage_clock", (c) => this.emitEvent("coverage_clock", c));
    }

    ping() {
      if (!this.connected) return;
      const t0 = performance.now();
      const w0 = Date.now();
      this.socket.emit("client_ping", w0, (serverNow) => {
        this.pingMs = performance.now() - t0;
        if (typeof serverNow === "number") {
          // NTP-style: a reply delayed by a busy frame inflates the round trip, so trust the fastest recent sample
          const rtt = Date.now() - w0, est = serverNow + rtt / 2 - Date.now();
          (this._offs = this._offs || []).push({ rtt, est }); if (this._offs.length > 12) this._offs.shift();
          this.serverOffsetMs = this._offs.reduce((b, x) => (x.rtt < b.rtt ? x : b)).est;
        }
      });
    }

    syncUser(playerName, suitColor) {
      if (!this.connected) return;
      this.socket.emit("sync_user", { userId: this.userId, playerName: playerName || this.localPlayer.name, suitColor: suitColor || this.localPlayer.color, role: this.localPlayer.role });
    }

    _setName(name) { if (name) { this.localPlayer.name = name; localStorage.setItem("interfellas_name", name); } }

    createRoom(playerName, opts) {
      opts = opts || {};
      this._setName(playerName);
      this.socket.emit("create_room", { userId: this.userId, playerName: this.localPlayer.name, suitColor: this.localPlayer.color, role: opts.role || "cdr", isPublic: opts.isPublic !== false, activity: opts.activity || "shuttle", flight: opts.flight || "deploy" });
    }

    joinRoom(roomId, playerName) {
      this._setName(playerName);
      this.socket.emit("join_room", { userId: this.userId, roomId: String(roomId || "").trim().toUpperCase(), playerName: this.localPlayer.name, suitColor: this.localPlayer.color });
    }

    leaveRoom() {
      if (this.socket && this.roomId) {
        this.socket.emit("voice_leave", { roomId: this.roomId });
        this.socket.emit("leave_room");
      }
      if (window.voiceManager) for (const peerId in window.voiceManager.peers) window.voiceManager.cleanupPeer(peerId);
      this.roomId = null; this.roomState = null; this.isHost = false; this.remotePlayers = {}; this.snapshot = null; this.coverageState = null;
    }

    customize(fields) {
      fields = fields || {};
      if (fields.name) this._setName(fields.name);
      if (fields.color) this.localPlayer.color = fields.color;
      return new Promise((resolve) => {
        this.socket.emit("customize_astronaut", { name: this.localPlayer.name, color: this.localPlayer.color, role: fields.role, ready: fields.ready }, (r) => resolve(r || { success: true }));
      });
    }

    startGame() { if (this.isHost) this.socket.emit("start_game"); }

    setFlight(flight) {
      return new Promise((resolve) => this.socket.emit("set_flight", { flight }, (r) => resolve(r || { success: false })));
    }
    setActivity(activity) {
      return new Promise((resolve) => this.socket.emit("set_activity", { activity }, (r) => resolve(r || { success: false })));
    }
    // CubeSat coverage: SET_SCENARIO / SET_MARKERS / CLOCK / SET_EDITOR / HASH / SYNC → { accepted, reason }
    coverageRequest(type, payload) {
      return new Promise((resolve) => {
        if (!this.connected) return resolve({ accepted: false, reason: "Not connected" });
        this.socket.emit("coverage_request", Object.assign({ type }, payload || {}), (r) => resolve(r || { accepted: false, reason: "No reply" }));
      });
    }
    serverNow() { return Date.now() + this.serverOffsetMs; }

    sendChat(text) {
      if (!this.connected || !this.roomId || !text || !text.trim()) return;
      this.socket.emit("chat_message", { text: text.trim() });
    }

    // Shuttle: seat-owned semantic command → resolves with { accepted, reason }
    sendCommand(type, args) {
      return new Promise((resolve) => {
        if (!this.connected) return resolve({ accepted: false, reason: "Not connected" });
        this.socket.emit("shuttle_command", { type, args: args || {} }, (r) => resolve(r || { accepted: false, reason: "No reply" }));
      });
    }
    // Shuttle: control axes (the server only uses the axes your seat owns)
    sendInput(axes, ack) {
      if (!this.connected) return Promise.resolve(false);
      if (!ack) { this.socket.emit("shuttle_input", axes); return Promise.resolve(true); }
      return new Promise((resolve) => this.socket.emit("shuttle_input", axes, () => resolve(true)));
    }
    // Automated playtests only (server started with SHUTTLE_TEST=1)
    // pre-flight boarding walk (pad_walk.js)
    sendPadPos(pos, yaw, moving, emote) {
      if (!this.socket || !this.roomId) return;
      // not volatile: over HTTP long-polling most volatile packets are dropped, and the server validates
      // boarding against the last position it received (10 Hz, a few dozen bytes)
      this.socket.emit("pad_pos", emote ? { pos, yaw, moving, emote } : { pos, yaw, moving });
    }
    padAction(type, pos) {
      if (!this.socket || !this.roomId) return Promise.resolve({ accepted: false, reason: "Not connected" });
      return new Promise((resolve) => this.socket.emit("pad_action", { type, pos }, (r) => resolve(r || { accepted: false, reason: "No reply" })));
    }
    testOp(data) { return new Promise((resolve) => this.socket.emit("shuttle_test", data, (r) => resolve(r))); }

    myRoles() {
      const sn = this.snapshot, crew = (sn && sn.crew) || (this.roomState && this.roomState.crew) || {};
      return Object.keys(crew).filter((r) => crew[r].playerId === this.socketId);
    }
  }

  window.NetworkManager = NetworkManager;
  window.netManager = new NetworkManager();
})(window);
