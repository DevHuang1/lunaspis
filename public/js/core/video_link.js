/*
 * video_link.js — live Earth Control <-> Flight Crew video link.
 *
 * Earth Control sees a live 3D flight-deck view of the seated crew; the crew
 * sees a compact Earth Control camera feed in the top-left corner. Audio stays
 * on the existing always-on crew voice relay; this module carries camera video
 * over a small WebRTC mesh and uses Socket.IO only for SDP/ICE signalling.
 */
(function (window) {
  "use strict";

  const T = window.THREE;
  const SEATS = ["cdr", "plt", "ms1", "ms2"];
  const SEAT_LABEL = { cdr: "CDR", plt: "PLT", ms1: "MS1", ms2: "MS2" };
  const ROLE_LABEL = {
    flight_director: "FLIGHT DIRECTOR",
    ground_capcom: "GROUND SYSTEMS",
    commander: "COMMANDER",
    engineer: "ENGINEER",
    scientist: "SCIENTIST",
    specialist: "SPECIALIST"
  };
  const ROLE_SHORT = {
    flight_director: "FD",
    ground_capcom: "GS",
    commander: "CDR",
    engineer: "ENG",
    scientist: "SCI",
    specialist: "SPC"
  };
  const ROLE_ORDER = ["flight_director", "ground_capcom", "commander", "engineer", "scientist", "specialist"];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function normalizeRole(raw, fallback = "commander") {
    if (window.InterfellasRoles && typeof window.InterfellasRoles.normalizeRole === "function") {
      return window.InterfellasRoles.normalizeRole(raw, fallback);
    }
    return String(raw || fallback).trim().toLowerCase().replace(/[_-]+/g, " ");
  }

  function teamForRole(raw) {
    if (window.InterfellasRoles && typeof window.InterfellasRoles.getTeamForRole === "function") {
      return window.InterfellasRoles.getTeamForRole(raw);
    }
    return ["flight_director", "ground_capcom"].includes(normalizeRole(raw)) ? "ground" : "crew";
  }

  function playerTeam(player) {
    if (!player) return null;
    if (player.team === "ground" || player.team === "crew") return player.team;
    return teamForRole(player.role);
  }

  function roleLabel(role) {
    return ROLE_LABEL[normalizeRole(role)] || String(role || "CREW").toUpperCase();
  }

  function roleShort(role) {
    return ROLE_SHORT[normalizeRole(role)] || "CRW";
  }

  class CrewVideoLink {
    constructor() {
      this.socket = null;
      this._socketBound = false;
      this._boundNet = false;
      this.roomId = null;
      this.enabled = false;
      this._starting = false;
      this._cameraSeq = 0;
      this._joining = false;
      this.localStream = null;
      this.peers = new Map();
      this.knownVideoPeers = new Set();
      this.lastError = null;
      this._teamCache = null;

      this._shipFeedSig = "";
      this._seatFeedSig = "";
      this._cabinRosterKey = "";
      this._cabinMounted = false;
      this.cabinMount = null;
      this.cabinFloat = null;
      this.cabinWrap = null;
      this.cabin = null;
      this._cabinPointer = { x: 0, y: 0 };
      this._toastTimer = null;
      this._iceServers = null;

      this._buildDom();
      this._bindDom();
      this._refreshUI();
      this._loadIceConfig();
    }

    // ------------------------------------------------------------------ lifecycle
    init(socket) {
      if (!socket) return;
      if (this.socket !== socket) {
        this._unbindSocket();
        this.socket = socket;
        this._socketBound = true;
        socket.on("video_peer_joined", (data) => this._onPeerJoined(data));
        socket.on("video_peer_left", (data) => this._onPeerLeft(data));
        socket.on("video_signal", (data) => this._onSignal(data));
        socket.on("disconnect", () => this._onDisconnect());
        socket.on("connect", () => this._onReconnect());
      }
      if (!this._boundNet && window.netManager && typeof window.netManager.on === "function") {
        this._boundNet = true;
        window.netManager.on("room_update", () => this._onRoomUpdate());
        window.netManager.on("room_joined", () => this._syncRoomFromManager());
        window.netManager.on("room_created", () => this._syncRoomFromManager());
        window.netManager.on("disconnected", () => this._onDisconnect());
      }
      this._syncRoomFromManager();
    }

    _unbindSocket() {
      if (!this.socket || typeof this.socket.off !== "function") return;
      this.socket.off("video_peer_joined");
      this.socket.off("video_peer_left");
      this.socket.off("video_signal");
      this.socket.off("disconnect");
      this.socket.off("connect");
    }

    _syncRoomFromManager() {
      const nm = window.netManager;
      const next = (nm && nm.roomId) || null;
      this.setRoom(next);
    }

    setRoom(roomId) {
      const next = roomId || null;
      if (this.roomId === next) {
        this._refreshUI();
        return;
      }
      this.roomId = next;
      this._closeAllPeers();
      this.knownVideoPeers.clear();
      if (!this.roomId) this.stopCamera();
      if (this.roomId && this.enabled) this._joinVideo();
      this._refreshUI();
    }

    _onReconnect() {
      if (this.roomId && this.enabled) this._joinVideo();
    }

    _onDisconnect() {
      this._closeAllPeers();
      this.knownVideoPeers.clear();
      this._refreshUI();
    }

    _onRoomUpdate() {
      const nm = window.netManager;
      if (!nm) return;
      if ((nm.roomId || null) !== this.roomId) {
        this.setRoom(nm.roomId || null);
        return;
      }
      const team = this._localTeam();
      if (this._teamCache && team && this._teamCache !== team) {
        // A ground/crew role swap changes who we are allowed to call.
        this._closeAllPeers();
        if (this.enabled) this._joinVideo();
      }
      this._teamCache = team;
      this._reconcilePeers();
      this._refreshUI();
    }

    _reconcilePeers() {
      if (!this.enabled) return;
      for (const peerId of Array.from(this.knownVideoPeers)) {
        if (this._isCrossTeam(peerId)) this._ensurePeer(peerId, true);
        else if (this.peers.has(peerId)) this._closePeer(peerId);
      }
    }

    // ------------------------------------------------------------------ camera
    async startCamera() {
      if (this.enabled || this._starting) return this.enabled;
      this.lastError = null;
      if (!this.roomId) {
        this._fail("Join a room before starting the video link.");
        return false;
      }
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        this._fail("Camera needs HTTPS (or localhost) and a browser with getUserMedia support.");
        return false;
      }

      this._starting = true;
      const requestId = ++this._cameraSeq;
      this._refreshUI();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 15, max: 24 },
            facingMode: "user"
          }
        });
        if (requestId !== this._cameraSeq || !this.roomId) {
          stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) {} });
          this._starting = false;
          this._refreshUI();
          return false;
        }
        this.localStream = stream;
        const track = this.localStream.getVideoTracks()[0];
        if (track && "contentHint" in track) track.contentHint = "motion";
        if (track && typeof track.addEventListener === "function") {
          track.addEventListener("ended", () => {
            if (this.enabled && (!this.localStream || !this.localStream.getVideoTracks().some((t) => t.readyState === "live"))) {
              this.stopCamera();
            }
          });
        }
        this.enabled = true;
        this._starting = false;
        this._joinVideo();
        this._refreshUI();
        this._toast("VIDEO LINK ACTIVE — Earth Control can see your camera.");
        return true;
      } catch (error) {
        this._starting = false;
        this.enabled = false;
        this.localStream = null;
        this._fail(this._cameraError(error));
        return false;
      }
    }

    stopCamera() {
      this._cameraSeq++;
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          try { track.stop(); } catch (e) {}
        });
      }
      this.localStream = null;
      this.enabled = false;
      this._starting = false;
      this._leaveVideo();
      this._closeAllPeers();
      this._refreshUI();
    }

    toggleCamera() {
      if (this._starting) return;
      if (this.enabled) {
        this.stopCamera();
        this._toast("VIDEO LINK CLOSED — camera is private again.");
        return;
      }
      this.startCamera();
    }

    _cameraError(error) {
      const name = error && error.name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Camera permission was denied. Allow it in the browser settings and try again.";
      if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No camera was found on this device.";
      if (name === "NotReadableError" || name === "TrackStartError") return "The camera is already in use by another app.";
      if (name === "OverconstrainedError") return "This camera does not support the requested video format.";
      return (error && error.message) || "Unable to start the camera.";
    }

    _fail(message) {
      this.lastError = message;
      this._refreshUI();
      this._toast(message);
    }

    // ------------------------------------------------------------------ signalling
    _joinVideo() {
      if (!this.enabled || !this.socket || !this.roomId || this._joining) return;
      this._joining = true;
      this.socket.emit("video_join", { roomId: this.roomId }, (response) => {
        this._joining = false;
        if (!response || !response.ok) {
          this.lastError = (response && response.error) || "Video signalling unavailable.";
          this._refreshUI();
          return;
        }
        for (const peer of response.peers || []) {
          if (peer && peer.id) {
            this.knownVideoPeers.add(peer.id);
            if (this._isCrossTeam(peer.id)) this._ensurePeer(peer.id, true);
          }
        }
        this._refreshUI();
      });
    }

    _leaveVideo() {
      if (this.socket && this.roomId) this.socket.emit("video_leave", { roomId: this.roomId });
    }

    _sendSignal(to, data) {
      if (!this.socket || !this.roomId) return;
      this.socket.emit("video_signal", { roomId: this.roomId, to, data });
    }

    _onPeerJoined(data) {
      const id = data && data.id;
      if (!id || id === this._socketId()) return;
      this.knownVideoPeers.add(id);
      if (this._isCrossTeam(id)) this._ensurePeer(id, true);
      this._refreshUI();
    }

    _onSignal(data) {
      const from = data && data.from;
      const payload = data && data.data;
      if (!from || !payload || from === this._socketId()) return;
      if (this._isSameTeam(from)) return;
      this.knownVideoPeers.add(from);
      const peer = this._ensurePeer(from, true, false);
      if (!peer) return;
      if (payload.description) this._handleDescription(peer, payload.description);
      else if (payload.candidate) this._handleCandidate(peer, payload.candidate);
    }

    _onPeerLeft(data) {
      const id = data && data.id;
      if (!id) return;
      this.knownVideoPeers.delete(id);
      this._closePeer(id);
      this._refreshUI();
    }

    _ensurePeer(peerId, allowUnknown = false, initiate = true) {
      if (!this.enabled || !this.localStream || !peerId || peerId === this._socketId()) return null;
      if (!allowUnknown && !this._isCrossTeam(peerId)) {
        if (this.peers.has(peerId)) this._closePeer(peerId);
        return null;
      }
      if (!allowUnknown && this._isSameTeam(peerId)) return null;
      const existing = this.peers.get(peerId);
      if (existing) return existing;
      if (typeof window.RTCPeerConnection !== "function") {
        this._fail("This browser does not support WebRTC video calls.");
        return null;
      }

      const pc = new window.RTCPeerConnection(this._rtcConfig());
      const peer = {
        id: peerId,
        pc,
        stream: null,
        video: null,
        videoTexture: null,
        pendingCandidates: [],
        remoteSet: false,
        makingOffer: false,
        closed: false
      };
      this.peers.set(peerId, peer);
      for (const track of this.localStream.getTracks()) {
        try { pc.addTrack(track, this.localStream); } catch (e) {}
      }
      pc.onicecandidate = (event) => {
        if (event && event.candidate) this._sendSignal(peerId, { candidate: event.candidate });
      };
      pc.ontrack = (event) => {
        const stream = (event.streams && event.streams[0]) || new window.MediaStream([event.track]);
        this._attachRemoteStream(peer, stream);
      };
      pc.onconnectionstatechange = () => {
        if (!peer.closed && (pc.connectionState === "failed" || pc.connectionState === "closed")) {
          this._closePeer(peerId);
        }
        this._refreshUI();
      };
      pc.oniceconnectionstatechange = () => this._refreshUI();

      if (initiate && this._socketId() && this._socketId() < peerId) this._makeOffer(peer);
      return peer;
    }

    async _makeOffer(peer) {
      if (!peer || peer.closed || peer.makingOffer || peer.pc.signalingState !== "stable") return;
      peer.makingOffer = true;
      try {
        const offer = await peer.pc.createOffer();
        if (peer.closed) return;
        await peer.pc.setLocalDescription(offer);
        this._sendSignal(peer.id, { description: peer.pc.localDescription });
      } catch (error) {
        this._closePeer(peer.id);
      } finally {
        peer.makingOffer = false;
      }
    }

    async _handleDescription(peer, description) {
      try {
        if (description.type === "offer") {
          if (peer.pc.signalingState !== "stable") {
            try { await peer.pc.setLocalDescription({ type: "rollback" }); } catch (e) {}
          }
          await peer.pc.setRemoteDescription(description);
          peer.remoteSet = true;
          this._flushCandidates(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          this._sendSignal(peer.id, { description: peer.pc.localDescription });
        } else if (description.type === "answer" && peer.pc.signalingState === "have-local-offer") {
          await peer.pc.setRemoteDescription(description);
          peer.remoteSet = true;
          this._flushCandidates(peer);
        }
        this._refreshUI();
      } catch (error) {
        this._closePeer(peer.id);
      }
    }

    _handleCandidate(peer, candidate) {
      if (!candidate) return;
      if (peer.remoteSet) {
        peer.pc.addIceCandidate(candidate).catch(() => {});
      } else {
        peer.pendingCandidates.push(candidate);
      }
    }

    _flushCandidates(peer) {
      const pending = peer.pendingCandidates.splice(0);
      for (const candidate of pending) peer.pc.addIceCandidate(candidate).catch(() => {});
    }

    _attachRemoteStream(peer, stream) {
      if (!stream) return;
      if (peer.video) {
        peer.video.srcObject = null;
        if (peer.video.parentNode) peer.video.parentNode.removeChild(peer.video);
      }
      peer.stream = stream;
      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.srcObject = stream;
      this.hiddenMedia.appendChild(video);
      peer.video = video;
      video.addEventListener("loadeddata", () => this._refreshUI());
      video.addEventListener("playing", () => this._refreshUI());
      video.play().catch(() => {});
      if (T && typeof T.VideoTexture === "function") {
        const texture = new T.VideoTexture(video);
        if (T.LinearFilter) { texture.minFilter = T.LinearFilter; texture.magFilter = T.LinearFilter; }
        texture.generateMipmaps = false;
        if (T.sRGBEncoding !== undefined && "encoding" in texture) texture.encoding = T.sRGBEncoding;
        if (peer.videoTexture && typeof peer.videoTexture.dispose === "function") peer.videoTexture.dispose();
        peer.videoTexture = texture;
      }
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.addEventListener === "function") {
        track.addEventListener("ended", () => this._closePeer(peer.id));
      }
      this._refreshUI();
    }

    _closePeer(peerId) {
      const peer = this.peers.get(peerId);
      if (!peer) return;
      peer.closed = true;
      this.peers.delete(peerId);
      if (peer.video) {
        peer.video.srcObject = null;
        if (peer.video.parentNode) peer.video.parentNode.removeChild(peer.video);
      }
      if (peer.videoTexture && typeof peer.videoTexture.dispose === "function") peer.videoTexture.dispose();
      try { peer.pc.close(); } catch (e) {}
      this._refreshUI();
    }

    _closeAllPeers() {
      for (const id of Array.from(this.peers.keys())) this._closePeer(id);
    }

    _loadIceConfig() {
      if (typeof fetch !== "function") return;
      fetch("/api/video/ice", { credentials: "omit" })
        .then((response) => (response && response.ok ? response.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.iceServers) && data.iceServers.length) this._iceServers = data.iceServers;
        })
        .catch(() => {});
    }

    _rtcConfig() {
      const configured = Array.isArray(window.INTERFELLAS_ICE_SERVERS)
        ? window.INTERFELLAS_ICE_SERVERS
        : (Array.isArray(this._iceServers) && this._iceServers.length ? this._iceServers : null);
      return {
        iceServers: configured || [
          { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
        ],
        iceCandidatePoolSize: 4
      };
    }

    // ------------------------------------------------------------------ roster helpers
    _socketId() {
      return (this.socket && this.socket.id) || (window.netManager && window.netManager.socketId) || null;
    }

    _players() {
      const nm = window.netManager;
      return (nm && nm.roomState && Array.isArray(nm.roomState.players)) ? nm.roomState.players : [];
    }

    _player(peerId) {
      return this._players().find((p) => p && p.id === peerId) || null;
    }

    _localTeam() {
      const nm = window.netManager;
      const lp = nm && nm.localPlayer;
      if (lp && (lp.team === "ground" || lp.team === "crew")) return lp.team;
      if (lp && lp.role) return teamForRole(lp.role);
      return null;
    }

    _teamOf(peerId) {
      const p = this._player(peerId);
      return playerTeam(p);
    }

    _isSameTeam(peerId) {
      const a = this._localTeam(), b = this._teamOf(peerId);
      return !!a && !!b && a === b;
    }

    _isCrossTeam(peerId) {
      const a = this._localTeam(), b = this._teamOf(peerId);
      return !!a && !!b && a !== b;
    }

    _peerEntries(team) {
      const ids = new Set([...this.knownVideoPeers, ...this.peers.keys()]);
      const entries = [];
      for (const id of ids) {
        const player = this._player(id);
        const peer = this.peers.get(id);
        const resolvedTeam = playerTeam(player) || (peer ? (this._teamOf(id) || null) : null);
        if (team && resolvedTeam !== team) continue;
        if (team && !player && !peer) continue;
        entries.push({
          id,
          player,
          name: (player && player.name) || "CREW",
          role: (player && player.role) || "crew",
          team: resolvedTeam,
          peer,
          live: !!(peer && peer.video && peer.stream && peer.video.readyState >= 2)
        });
      }
      entries.sort((a, b) => {
        const ai = ROLE_ORDER.indexOf(normalizeRole(a.role));
        const bi = ROLE_ORDER.indexOf(normalizeRole(b.role));
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || String(a.name).localeCompare(String(b.name));
      });
      return entries;
    }

    _cabinRoster() {
      const players = this._players();
      const flight = players.filter((p) => p && playerTeam(p) === "crew");
      const crew = window.netManager && window.netManager.snapshot && window.netManager.snapshot.crew;
      const used = new Set();
      return SEATS.map((seat, index) => {
        let player = null;
        const assigned = crew && crew[seat];
        if (assigned && assigned.filled && assigned.playerId) {
          player = players.find((p) => p && p.id === assigned.playerId) || {
            id: assigned.playerId,
            name: assigned.name || "CREW",
            role: "crew",
            team: "crew",
            color: "#67e8f9"
          };
        }
        if (!player && !crew) {
          player = flight.find((p) => p && !used.has(p.id)) || null;
        }
        if (player) used.add(player.id);
        return { seat, index, player };
      });
    }

    // ------------------------------------------------------------------ UI
    _buildDom() {
      if (!document.getElementById("vl-style")) {
        const style = document.createElement("style");
        style.id = "vl-style";
        style.textContent = `
          :root{--vl-cyan:#67e8f9;--vl-green:#4ade80;--vl-amber:#fbbf24;--vl-ink:#e6f7fb;--vl-dim:#94a3b8;--vl-line:rgba(103,232,249,.32);--vl-bg:rgba(3,10,18,.9)}
          #vl-shell{position:fixed;inset:0;z-index:5000;pointer-events:none;font-family:"DM Sans",Inter,system-ui,sans-serif}
          .vl-start-prompt{position:fixed;left:18px;top:62px;z-index:5001;display:none;align-items:center;gap:9px;padding:8px 12px;border:1px solid var(--vl-line);border-radius:9px;background:rgba(3,10,18,.82);color:var(--vl-ink);font:700 10.5px/1.15 ui-monospace,Menlo,monospace;letter-spacing:.06em;cursor:pointer;pointer-events:auto;box-shadow:0 8px 24px rgba(0,0,0,.28);backdrop-filter:blur(9px)}
          .vl-start-prompt.is-open{display:flex}
          .vl-start-prompt:hover{border-color:var(--vl-cyan);background:rgba(8,27,40,.94)}
          .vl-start-prompt b{display:block;color:var(--vl-cyan);font-size:11px}
          .vl-start-prompt small{display:block;color:var(--vl-dim);font:600 9px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.05em;margin-top:2px}
          .vl-cam-glyph{width:17px;height:12px;border:1.5px solid var(--vl-cyan);border-radius:2px;position:relative;flex:0 0 auto}
          .vl-cam-glyph:after{content:"";position:absolute;right:-6px;top:2px;border-left:5px solid var(--vl-cyan);border-top:2px solid transparent;border-bottom:2px solid transparent}
          .vl-ship-panel{position:fixed;left:18px;top:62px;z-index:5002;display:none;flex-direction:column;width:min(306px,44vw);border:1px solid var(--vl-line);border-radius:11px;background:var(--vl-bg);color:var(--vl-ink);box-shadow:0 16px 42px rgba(0,0,0,.42);backdrop-filter:blur(12px);pointer-events:auto;overflow:hidden}
          .vl-ship-panel.is-open{display:flex}
          .vl-ship-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(103,232,249,.2);background:rgba(6,22,34,.62)}
          .vl-live{display:flex;align-items:center;gap:7px;font:800 10px/1.15 ui-monospace,Menlo,monospace;letter-spacing:.08em}
          .vl-live i{width:7px;height:7px;border-radius:50%;background:var(--vl-green);box-shadow:0 0 8px var(--vl-green);flex:0 0 auto;animation:vlpulse 1.8s ease-in-out infinite}
          .vl-live small{display:block;color:var(--vl-dim);font-size:8.5px;letter-spacing:.09em;margin-top:2px}
          @keyframes vlpulse{50%{opacity:.38}}
          .vl-head-actions{display:flex;align-items:center;gap:5px}
          .vl-head-actions button,.vl-cabin-cam{border:1px solid rgba(103,232,249,.38);border-radius:5px;background:rgba(103,232,249,.1);color:var(--vl-cyan);font:800 8.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.05em;padding:5px 7px;cursor:pointer;white-space:nowrap}
          .vl-head-actions button:hover,.vl-cabin-cam:hover{background:rgba(103,232,249,.22)}
          .vl-head-actions button.is-on{color:#031018;background:var(--vl-cyan);border-color:var(--vl-cyan)}
          .vl-feeds{display:grid;grid-template-columns:1fr;gap:6px;padding:7px}
          .vl-feeds:has(.vl-feed:nth-child(2)){grid-template-columns:1fr 1fr}
          .vl-feed{border:1px solid rgba(148,163,184,.2);border-radius:7px;overflow:hidden;background:#02070d;position:relative}
          .vl-feed-frame{aspect-ratio:16/9;position:relative;background:radial-gradient(circle at 50% 46%,rgba(30,64,82,.55),#02070d 70%);overflow:hidden}
          .vl-feed-frame video{width:100%;height:100%;object-fit:cover;display:block}
          .vl-feed-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--vl-dim);font:700 8.5px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-align:center;padding:8px}
          .vl-feed-label{display:flex;align-items:center;gap:5px;padding:4px 6px;font:700 8.5px/1.15 ui-monospace,Menlo,monospace;letter-spacing:.045em;background:rgba(6,20,30,.86)}
          .vl-feed-label b{color:var(--vl-cyan);font-size:8.5px}
          .vl-feed-label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vl-ink)}
          .vl-feed-label i{margin-left:auto;color:var(--vl-dim);font-style:normal;font-size:7.5px}
          .vl-feed.is-live .vl-feed-label i{color:var(--vl-green)}
          .vl-foot{padding:6px 9px 8px;color:var(--vl-dim);font:600 8.5px/1.35 ui-monospace,Menlo,monospace;letter-spacing:.035em;border-top:1px solid rgba(103,232,249,.14)}
          .vl-ship-panel.is-collapsed .vl-feeds,.vl-ship-panel.is-collapsed .vl-foot{display:none}
          .vl-cabin-float{position:fixed;right:18px;bottom:18px;width:min(470px,calc(100vw - 36px));z-index:4800;pointer-events:auto;display:none}
          .vl-cabin-float.is-open{display:block}
          .vl-cabin-wrap{position:relative;width:100%;aspect-ratio:16/9;border:1px solid rgba(103,232,249,.34);border-radius:11px;background:#02070d;overflow:hidden;box-shadow:0 20px 52px rgba(0,0,0,.48);pointer-events:auto}
          .vl-cabin-wrap.is-embedded{aspect-ratio:2.35/1;border-radius:7px;box-shadow:none;background:#02070d}
          .vl-cabin-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
          .vl-cabin-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.028) 0 1px,transparent 1px 3px),radial-gradient(circle at 50% 48%,transparent 45%,rgba(0,0,0,.35) 100%);mix-blend-mode:screen;opacity:.62}
          .vl-cabin-head{position:absolute;left:0;right:0;top:0;z-index:3;display:flex;align-items:center;gap:8px;padding:7px 9px;background:linear-gradient(180deg,rgba(2,7,13,.92),rgba(2,7,13,.2) 78%,transparent);font:800 9.5px/1.15 ui-monospace,Menlo,monospace;letter-spacing:.07em;pointer-events:none}
          .vl-cabin-title{display:flex;align-items:center;gap:7px;color:var(--vl-ink)}
          .vl-cabin-title i{width:7px;height:7px;border-radius:50%;background:var(--vl-green);box-shadow:0 0 8px var(--vl-green);animation:vlpulse 1.8s ease-in-out infinite}
          .vl-cabin-title span{color:var(--vl-dim);font-size:8px}
          .vl-cabin-badge{margin-left:auto;border:1px solid rgba(103,232,249,.3);border-radius:4px;padding:3px 6px;color:var(--vl-cyan);font-size:8px;background:rgba(3,16,24,.6)}
          .vl-cabin-cam{position:absolute;right:9px;top:32px;z-index:4;pointer-events:auto}
          .vl-cabin-status{position:absolute;left:10px;right:10px;bottom:43px;z-index:3;color:var(--vl-dim);font:700 8.5px/1.25 ui-monospace,Menlo,monospace;letter-spacing:.045em;text-align:center;text-shadow:0 1px 4px #000;pointer-events:none}
          .vl-cabin-roster{position:absolute;left:7px;right:7px;bottom:7px;z-index:3;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;pointer-events:none}
          .vl-seat-chip{border:1px solid rgba(148,163,184,.22);border-radius:5px;background:rgba(3,10,18,.76);padding:3px 5px;min-width:0;backdrop-filter:blur(5px)}
          .vl-seat-chip b{display:block;color:var(--vl-cyan);font:800 7.5px/1.2 ui-monospace,Menlo,monospace;letter-spacing:.08em}
          .vl-seat-chip span{display:block;color:var(--vl-ink);font:700 8px/1.2 ui-monospace,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .vl-seat-chip i{display:block;color:var(--vl-dim);font:600 7px/1.2 ui-monospace,Menlo,monospace;font-style:normal;margin-top:1px}
          .vl-seat-chip.is-live{border-color:rgba(74,222,128,.42)}
          .vl-seat-chip.is-live i{color:var(--vl-green)}
          .vl-hidden-media{position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none}
          #vl-hidden-media video{width:2px;height:2px;opacity:0}
          #crew-comms-video.is-on{color:#031018;background:var(--vl-cyan);border-color:var(--vl-cyan)}
          body.vl-prompt-live #shuttle-hud .log,body.vl-prompt-live #shuttle-hud .chat{top:112px}
          body.vl-ship-live #shuttle-hud .log,body.vl-ship-live #shuttle-hud .chat{top:var(--vl-ship-offset,320px)}
          @media (max-width:720px){
            .vl-ship-panel{width:min(240px,52vw);top:54px;left:10px}
            .vl-start-prompt{left:10px;top:54px}
            .vl-cabin-float{right:10px;bottom:10px;width:min(380px,calc(100vw - 20px))}
            .vl-cabin-wrap.is-embedded{aspect-ratio:16/10}
            body.vl-ship-live #shuttle-hud .log,body.vl-ship-live #shuttle-hud .chat{top:250px}
            .vl-cabin-roster{grid-template-columns:repeat(2,minmax(0,1fr))}
          }
          @media (prefers-reduced-motion:reduce){.vl-live i,.vl-cabin-title i{animation:none}}
        `;
        document.head.appendChild(style);
      }

      const shell = document.createElement("div");
      shell.id = "vl-shell";
      shell.innerHTML = `
        <button type="button" class="vl-start-prompt" id="vl-start-prompt" title="Share your camera with Earth Control">
          <span class="vl-cam-glyph"></span>
          <span><b>VIDEO LINK</b><small>START CREW CAMERA</small></span>
        </button>
        <section class="vl-ship-panel" id="vl-ship-panel" aria-label="Earth Control live video">
          <header class="vl-ship-head">
            <div class="vl-live"><i></i><span>EARTH CONTROL<small>LIVE CAMERA FEED</small></span></div>
            <div class="vl-head-actions">
              <button type="button" id="vl-ship-cam" data-vl-ship-cam>CAM OFF</button>
              <button type="button" id="vl-ship-min" data-vl-ship-min>HIDE</button>
            </div>
          </header>
          <div class="vl-feeds" id="vl-ground-feeds"></div>
          <div class="vl-foot" id="vl-ship-foot">LINK STANDBY</div>
        </section>
        <div class="vl-cabin-float" id="vl-cabin-float"></div>
        <div class="vl-hidden-media" id="vl-hidden-media" aria-hidden="true"></div>
      `;
      document.body.appendChild(shell);

      this.shell = shell;
      this.prompt = shell.querySelector("#vl-start-prompt");
      this.shipPanel = shell.querySelector("#vl-ship-panel");
      this.groundFeeds = shell.querySelector("#vl-ground-feeds");
      this.shipFoot = shell.querySelector("#vl-ship-foot");
      this.shipCamBtn = shell.querySelector("#vl-ship-cam");
      this.shipMinBtn = shell.querySelector("#vl-ship-min");
      this.cabinFloat = shell.querySelector("#vl-cabin-float");
      this.hiddenMedia = shell.querySelector("#vl-hidden-media");

      const wrap = document.createElement("div");
      wrap.className = "vl-cabin-wrap";
      wrap.id = "vl-cabin-wrap";
      wrap.innerHTML = `
        <canvas class="vl-cabin-canvas" id="vl-cabin-canvas"></canvas>
        <div class="vl-cabin-scan"></div>
        <div class="vl-cabin-head">
          <div class="vl-cabin-title"><i></i>FLIGHT DECK <span>LIVE 3D CREW LINK</span></div>
          <div class="vl-cabin-badge" id="vl-cabin-badge">LINK 0/4</div>
        </div>
        <button type="button" class="vl-cabin-cam" id="vl-cabin-cam" data-vl-cabin-cam>START MY CAMERA</button>
        <div class="vl-cabin-status" id="vl-cabin-status">AWAITING CREW CAMERAS</div>
        <div class="vl-cabin-roster" id="vl-cabin-roster"></div>
      `;
      this.cabinFloat.appendChild(wrap);
      this.cabinWrap = wrap;
      this.cabinBadge = wrap.querySelector("#vl-cabin-badge");
      this.cabinStatus = wrap.querySelector("#vl-cabin-status");
      this.cabinRosterEl = wrap.querySelector("#vl-cabin-roster");
      this.cabinCamBtn = wrap.querySelector("#vl-cabin-cam");
    }

    _bindDom() {
      this.prompt.addEventListener("click", () => this.startCamera());
      this.shipPanel.addEventListener("click", (event) => {
        if (event.target.closest("[data-vl-ship-cam]")) this.toggleCamera();
        if (event.target.closest("[data-vl-ship-min]")) {
          this.shipPanel.classList.toggle("is-collapsed");
          this.shipMinBtn.textContent = this.shipPanel.classList.contains("is-collapsed") ? "SHOW" : "HIDE";
          this._refreshShipPanel();
        }
      });
      this.cabinWrap.addEventListener("click", (event) => {
        if (event.target.closest("[data-vl-cabin-cam]")) this.toggleCamera();
      });
      this.cabinWrap.addEventListener("pointermove", (event) => {
        const rect = this.cabinWrap.getBoundingClientRect();
        this._cabinPointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
        this._cabinPointer.y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
      });
      this.cabinWrap.addEventListener("pointerleave", () => {
        this._cabinPointer.x = 0;
        this._cabinPointer.y = 0;
      });

      const commsVideo = document.getElementById("crew-comms-video");
      if (commsVideo) commsVideo.addEventListener("click", () => this.toggleCamera());
    }

    attachCabinView(container) {
      this.cabinMount = container || null;
      if (container) {
        container.appendChild(this.cabinWrap);
        this.cabinWrap.classList.add("is-embedded");
      } else {
        this.cabinFloat.appendChild(this.cabinWrap);
        this.cabinWrap.classList.remove("is-embedded");
      }
      this._refreshCabin();
      window.requestAnimationFrame(() => this._resizeCabin());
    }

    detachCabinView() {
      this.attachCabinView(null);
    }

    _refreshUI() {
      this._refreshPrompt();
      this._refreshShipPanel();
      this._refreshCabin();
      this._refreshButtons();
    }

    _refreshPrompt() {
      const isCrew = this._localTeam() === "crew";
      const groundPeers = this._peerEntries("ground");
      const show = !!(isCrew && this.roomId && !this.enabled && !groundPeers.length && !this._starting);
      this.prompt.classList.toggle("is-open", show);
      document.body.classList.toggle("vl-prompt-live", show);
    }

    _refreshShipPanel() {
      const isCrew = this._localTeam() === "crew";
      const groundPeers = this._peerEntries("ground");
      const show = !!(isCrew && this.roomId && (this.enabled || groundPeers.length || this._starting));
      this.shipPanel.classList.toggle("is-open", show);
      document.body.classList.toggle("vl-ship-live", show);
      if (!show) {
        this._shipFeedSig = "";
        return;
      }

      const sig = groundPeers.map((p) => `${p.id}:${p.live ? 1 : 0}:${p.name}`).join("|") + `|${this.enabled ? 1 : 0}|${this._starting ? 1 : 0}`;
      if (sig !== this._shipFeedSig) {
        this._shipFeedSig = sig;
        // Keep the live <video> decoders alive while their tiles are rebuilt.
        for (const entry of groundPeers) {
          if (entry.peer && entry.peer.video && entry.peer.video.parentNode) this.hiddenMedia.appendChild(entry.peer.video);
        }
        this.groundFeeds.innerHTML = "";
        if (!groundPeers.length) {
          const wait = document.createElement("div");
          wait.className = "vl-feed";
          wait.innerHTML = `<div class="vl-feed-frame"><div class="vl-feed-wait">EARTH CONTROL CAMERA<br />IS STARTING…</div></div>`;
          this.groundFeeds.appendChild(wait);
        } else {
          for (const entry of groundPeers) {
            const tile = document.createElement("div");
            tile.className = "vl-feed" + (entry.live ? " is-live" : "");
            tile.dataset.peer = entry.id;
            const frame = document.createElement("div");
            frame.className = "vl-feed-frame";
            if (entry.live && entry.peer && entry.peer.video) {
              frame.appendChild(entry.peer.video);
              entry.peer.video.play().catch(() => {});
            } else {
              const wait = document.createElement("div");
              wait.className = "vl-feed-wait";
              wait.textContent = "LINKING EARTH CONTROL…";
              frame.appendChild(wait);
            }
            const label = document.createElement("div");
            label.className = "vl-feed-label";
            label.innerHTML = `<b>${esc(roleShort(entry.role))}</b><span>${esc(entry.name)}</span><i>${entry.live ? "LIVE" : "WAIT"}</i>`;
            tile.appendChild(frame);
            tile.appendChild(label);
            this.groundFeeds.appendChild(tile);
          }
        }
      }
      const liveCount = groundPeers.filter((p) => p.live).length;
      this.shipFoot.textContent = liveCount
        ? `${liveCount} EARTH CAMERA${liveCount === 1 ? "" : "S"} LIVE · AUDIO ON CREW COMMS`
        : "WAITING FOR EARTH CONTROL CAMERA · TURN YOURS ON SO THEY CAN SEE YOU";
      window.requestAnimationFrame(() => {
        if (!this.shipPanel.classList.contains("is-open")) return;
        const offset = Math.max(112, this.shipPanel.offsetHeight + 72);
        document.documentElement.style.setProperty("--vl-ship-offset", `${offset}px`);
      });
    }

    _refreshCabin() {
      const isGround = this._localTeam() === "ground";
      const crewPeers = this._peerEntries("crew");
      const show = !!(isGround && this.roomId && (this.cabinMount || this.enabled || crewPeers.length || this._starting));
      if (this.cabinMount) {
        this.cabinWrap.style.display = "block";
      } else {
        this.cabinFloat.classList.toggle("is-open", show);
      }
      if (!show) {
        if (this.cabin) this.cabin.visible = false;
        return;
      }
      this._initCabin();
      if (this.cabin && !this.cabin.failed) this.cabin.visible = true;
      this._resizeCabin();
      this._syncCabinRoster();
      this._syncSeatFeeds();
      const roster = this._cabinRoster();
      const liveCount = roster.filter((entry) => {
        const p = entry.player && this.peers.get(entry.player.id);
        return !!(p && p.video && p.stream && p.video.readyState >= 2);
      }).length;
      const crewCount = roster.filter((entry) => !!entry.player).length;
      if (this.cabinBadge) this.cabinBadge.textContent = crewCount ? `LINK ${liveCount}/${crewCount}` : "NO CREW";
      if (this.cabinStatus) {
        this.cabinStatus.textContent = liveCount
          ? `${liveCount} LIVE CAMERA${liveCount === 1 ? "" : "S"} · SEATED FLIGHT DECK CREW`
          : (crewCount ? "CREW SEATED · ASK THEM TO START THEIR CAMERAS" : "AWAITING FLIGHT CREW · CREW SEATS OPEN");
      }
    }

    _refreshButtons() {
      const label = this._starting ? "STARTING…" : (this.enabled ? "CAM ON" : "CAM OFF");
      if (this.shipCamBtn) {
        this.shipCamBtn.textContent = label;
        this.shipCamBtn.classList.toggle("is-on", this.enabled);
      }
      if (this.cabinCamBtn) this.cabinCamBtn.textContent = this.enabled ? "MY CAMERA ON" : "START MY CAMERA";
      const commsVideo = document.getElementById("crew-comms-video");
      if (commsVideo) {
        commsVideo.textContent = this.enabled ? "VIDEO ON" : "VIDEO OFF";
        commsVideo.classList.toggle("is-on", this.enabled);
        commsVideo.disabled = !this.roomId;
      }
      const groundHudVideo = document.getElementById("btn-sc-video");
      if (groundHudVideo) groundHudVideo.textContent = `VIDEO ${this.enabled ? "ON" : "OFF"}`;
      const lccVideo = document.getElementById("btn-lcc-video");
      if (lccVideo) lccVideo.textContent = this.enabled ? "CAMERA ON" : "START CAMERA";
    }

    _toast(message) {
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast(message);
        return;
      }
      const el = document.getElementById("action-toast");
      if (!el) return;
      el.textContent = message;
      el.style.display = "block";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { el.style.display = "none"; }, 4200);
    }

    // ------------------------------------------------------------------ 3D flight deck
    _initCabin() {
      if (this.cabin || !T) return;
      const canvas = this.cabinWrap.querySelector("#vl-cabin-canvas");
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
      } catch (error) {
        this.cabin = { failed: true, visible: false };
        return;
      }
      renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
      renderer.setClearColor(0x02070d, 1);
      if (T.sRGBEncoding !== undefined) renderer.outputEncoding = T.sRGBEncoding;
      if (T.ACESFilmicToneMapping !== undefined) {
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;
      }

      const scene = new T.Scene();
      scene.fog = new T.FogExp2(0x02070d, 0.052);
      const camera = new T.PerspectiveCamera(38, 16 / 9, 0.05, 50);
      const baseCam = { x: 0, y: 2.52, z: 5.9 };
      camera.position.set(baseCam.x, baseCam.y, baseCam.z);
      camera.lookAt(0, 1.14, 0.34);

      scene.add(new T.HemisphereLight(0x9bdcff, 0x050b11, 0.58));
      const key = new T.DirectionalLight(0xd6f4ff, 1.0);
      key.position.set(3.4, 4.6, 5.2);
      scene.add(key);
      const rim = new T.DirectionalLight(0x3aa7d8, 0.72);
      rim.position.set(-4, 2.3, -3.2);
      scene.add(rim);
      const warm = new T.PointLight(0xffc46b, 0.42, 9, 2);
      warm.position.set(-2.4, 1.5, 1.1);
      scene.add(warm);
      const cyan = new T.PointLight(0x67e8f9, 0.7, 8, 2);
      cyan.position.set(0, 2.25, 1.7);
      scene.add(cyan);

      this.cabin = {
        canvas,
        renderer,
        scene,
        camera,
        baseCam,
        clock: new T.Clock(),
        elapsed: 0,
        lastFrame: 0,
        feedTick: 0,
        camX: 0,
        camY: 0,
        visible: false,
        raf: null,
        seats: [],
        failed: false
      };

      this._buildCabinShell();
      this._buildCabinSeats();
      this._resizeCabin();
      this._startCabinLoop();
      if (typeof ResizeObserver === "function") {
        this._cabinResizeObserver = new ResizeObserver(() => this._resizeCabin());
        this._cabinResizeObserver.observe(this.cabinWrap);
      }
      this._onWindowResize = () => this._resizeCabin();
      window.addEventListener("resize", this._onWindowResize);
    }

    _cabinMaterial(color, roughness = 0.8, metalness = 0.15) {
      return new T.MeshStandardMaterial({ color, roughness, metalness });
    }

    _cabinBox(parent, w, h, d, x, y, z, material, rx = 0, ry = 0, rz = 0) {
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      parent.add(mesh);
      return mesh;
    }

    _buildCabinShell() {
      const c = this.cabin, scene = c.scene;
      const wall = this._cabinMaterial(0x0a141c, 0.88, 0.18);
      const wallDeep = this._cabinMaterial(0x071019, 0.92, 0.12);
      const floor = this._cabinMaterial(0x071017, 0.95, 0.08);
      const metal = this._cabinMaterial(0x334d59, 0.38, 0.72);
      const darkMetal = this._cabinMaterial(0x172a34, 0.52, 0.45);
      const cyan = new T.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x1386a2, emissiveIntensity: 1.65, roughness: 0.35 });
      const amber = new T.MeshStandardMaterial({ color: 0xffc46b, emissive: 0x7c3f06, emissiveIntensity: 1.25, roughness: 0.4 });
      const screenMat = new T.MeshBasicMaterial({ color: 0x0a2230 });

      this._cabinBox(scene, 4.5, 0.14, 5.05, 0, -0.08, -0.18, floor);
      this._cabinBox(scene, 4.5, 0.1, 5.05, 0, 2.78, -0.18, wallDeep);
      this._cabinBox(scene, 4.5, 2.85, 0.14, 0, 1.35, -2.68, wall);
      this._cabinBox(scene, 0.14, 2.85, 5.05, -2.24, 1.35, -0.18, wall);
      this._cabinBox(scene, 0.14, 2.85, 5.05, 2.24, 1.35, -0.18, wall);
      this._cabinBox(scene, 4.28, 0.28, 0.72, 0, 2.6, 0.92, darkMetal);
      this._cabinBox(scene, 3.6, 0.12, 0.65, 0, 2.49, 0.92, wallDeep);

      // Ceiling light strips and side ribs.
      for (const x of [-0.78, 0.78]) this._cabinBox(scene, 0.12, 0.035, 3.85, x, 2.69, -0.2, cyan);
      for (const z of [-2.16, -1.28, -0.4, 0.48, 1.36, 2.24]) {
        this._cabinBox(scene, 0.13, 2.55, 0.11, -2.14, 1.28, z, metal);
        this._cabinBox(scene, 0.13, 2.55, 0.11, 2.14, 1.28, z, metal);
        this._cabinBox(scene, 4.03, 0.11, 0.11, 0, 2.64, z, metal);
      }
      // Floor centre guidance strip and inset panels.
      this._cabinBox(scene, 0.09, 0.012, 4.3, 0, 0.015, -0.15, cyan);
      for (const x of [-1.45, -0.72, 0.72, 1.45]) this._cabinBox(scene, 0.025, 0.012, 4.25, x, 0.016, -0.15, metal);

      // Rear bulkhead hatch and mission board.
      const hatch = new T.Mesh(new T.TorusGeometry(0.46, 0.045, 8, 36), metal);
      hatch.position.set(0, 1.33, -2.6);
      scene.add(hatch);
      const hatchInner = new T.Mesh(new T.CircleGeometry(0.41, 32), darkMetal);
      hatchInner.position.set(0, 1.33, -2.61);
      scene.add(hatchInner);
      this._cabinBox(scene, 0.06, 0.38, 0.06, 0.36, 1.33, -2.56, cyan);
      this._cabinBox(scene, 0.06, 0.38, 0.06, -0.36, 1.33, -2.56, cyan);

      const board = this._cabinLabelTexture("LUNASPIS · FLIGHT DECK", "CREW VIDEO LINK · ORBITAL TRANSIT", "#67e8f9");
      const boardMesh = new T.Mesh(new T.PlaneGeometry(2.45, 0.56), new T.MeshBasicMaterial({ map: board, transparent: true }));
      boardMesh.position.set(0, 2.28, -2.585);
      scene.add(boardMesh);

      // Side windows with a stylised Earth/space view.
      const windowTex = this._cabinWindowTexture();
      for (const side of [-1, 1]) {
        const frame = new T.Mesh(new T.TorusGeometry(0.39, 0.035, 8, 32), metal);
        frame.position.set(side * 2.155, 1.72, 0.48);
        frame.rotation.y = side * Math.PI / 2;
        scene.add(frame);
        const view = new T.Mesh(new T.CircleGeometry(0.36, 32), new T.MeshBasicMaterial({ map: windowTex }));
        view.position.set(side * 2.167, 1.72, 0.48);
        view.rotation.y = side * Math.PI / 2;
        scene.add(view);
      }

      // Small overhead switch banks.
      for (const x of [-1.18, 0, 1.18]) {
        this._cabinBox(scene, 0.82, 0.035, 0.52, x, 2.55, 0.9, darkMetal);
        for (let i = 0; i < 4; i++) {
          this._cabinBox(scene, 0.06, 0.012, 0.06, x - 0.28 + i * 0.18, 2.535, 0.9, i % 2 ? amber : cyan);
        }
      }

      // Foreground console lip and glowing key banks.
      this._cabinBox(scene, 3.8, 0.3, 0.62, 0, 0.72, 3.0, darkMetal, -0.16);
      for (let i = 0; i < 7; i++) {
        this._cabinBox(scene, 0.17, 0.025, 0.1, -1.44 + i * 0.48, 0.885, 2.93, i % 3 === 0 ? amber : cyan, -0.16);
      }
      const display = new T.Mesh(new T.PlaneGeometry(1.25, 0.28), screenMat);
      display.position.set(0, 1.02, 2.9);
      display.rotation.x = -0.28;
      scene.add(display);

      scene.userData.cabinMaterials = { wall, wallDeep, metal, cyan, amber };
    }

    _cabinLabelTexture(title, subtitle, color) {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 1024, 256);
      ctx.fillStyle = "rgba(3,12,20,0.92)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(8, 8, 1008, 240, 18); else ctx.rect(8, 8, 1008, 240);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "900 54px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, 512, 112);
      ctx.fillStyle = "#93c5fd";
      ctx.font = "700 27px Arial, Helvetica, sans-serif";
      ctx.fillText(subtitle, 512, 168);
      const texture = new T.CanvasTexture(canvas);
      if (T.sRGBEncoding !== undefined && "encoding" in texture) texture.encoding = T.sRGBEncoding;
      return texture;
    }

    _cabinWindowTexture() {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#020509";
      ctx.fillRect(0, 0, 256, 256);
      let seed = 17;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 90; i++) {
        const r = rnd() * 1.1 + 0.2;
        ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
        ctx.beginPath();
        ctx.arc(rnd() * 256, rnd() * 256, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const glow = ctx.createRadialGradient(162, 144, 3, 162, 144, 74);
      glow.addColorStop(0, "#dff7ff");
      glow.addColorStop(0.32, "#67c8f2");
      glow.addColorStop(0.7, "#1f6ea8");
      glow.addColorStop(1, "rgba(9,30,55,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(162, 144, 72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(80,180,120,0.55)";
      ctx.beginPath();
      ctx.ellipse(148, 130, 28, 13, 0.5, 0, Math.PI * 2);
      ctx.fill();
      const texture = new T.CanvasTexture(canvas);
      if (T.sRGBEncoding !== undefined && "encoding" in texture) texture.encoding = T.sRGBEncoding;
      return texture;
    }

    _buildCabinSeats() {
      const layout = [
        { seat: "cdr", x: -1.56, z: 0.48, baseY: 0.02, ry: 0.15 },
        { seat: "plt", x: -0.52, z: 0.82, baseY: 0.02, ry: 0.05 },
        { seat: "ms1", x: 0.52, z: 0.82, baseY: 0.02, ry: -0.05 },
        { seat: "ms2", x: 1.56, z: 0.48, baseY: 0.02, ry: -0.15 }
      ];
      const seatMat = this._cabinMaterial(0x142a35, 0.9, 0.08);
      const seatTrim = this._cabinMaterial(0x2a4654, 0.62, 0.34);
      const seatMetal = this._cabinMaterial(0x48606b, 0.35, 0.75);
      const harnessMat = this._cabinMaterial(0xc98b3e, 0.8, 0.16);
      const cyan = this.cabin.scene.userData.cabinMaterials.cyan;

      for (const item of layout) {
        const group = new T.Group();
        group.position.set(item.x, item.baseY, item.z);
        group.rotation.y = item.ry || 0;
        this.cabin.scene.add(group);
        if (item.baseY > 0) this._cabinBox(group, 1.32, item.baseY, 1.26, 0, -item.baseY / 2 + 0.005, -0.05, seatMetal);
        // Main seat shell.
        this._cabinBox(group, 0.82, 0.18, 0.74, 0, 0.52, 0.02, seatMat);
        this._cabinBox(group, 0.82, 1.02, 0.16, 0, 1.06, -0.33, seatMat, -0.11);
        this._cabinBox(group, 0.46, 0.3, 0.17, 0, 1.68, -0.37, seatMat, -0.11);
        for (const side of [-1, 1]) {
          this._cabinBox(group, 0.14, 0.3, 0.78, side * 0.44, 0.62, 0.02, seatTrim);
          this._cabinBox(group, 0.14, 0.09, 0.64, side * 0.49, 0.8, 0.03, seatMetal);
          this._cabinBox(group, 0.07, 0.9, 0.04, side * 0.23, 1.06, -0.235, harnessMat, -0.11);
          this._cabinBox(group, 0.11, 0.08, 0.7, side * 0.56, 0.41, 0.03, seatMetal);
          this._cabinBox(group, 0.08, 0.38, 0.08, side * 0.56, 0.2, 0.28, seatMetal);
        }
        this._cabinBox(group, 0.12, 0.12, 0.05, 0, 1.01, -0.22, harnessMat);
        this._cabinBox(group, 0.31, 0.26, 0.03, 0, 0.62, 0.405, seatMetal);
        // Small flight-control stick where the seated hands rest.
        this._cabinBox(group, 0.32, 0.06, 0.22, 0, 0.88, 0.7, seatMetal);
        this._cabinBox(group, 0.035, 0.24, 0.035, 0, 1.0, 0.7, seatMetal);
        this._cabinBox(group, 0.1, 0.06, 0.1, 0, 1.12, 0.7, cyan);

        // Private video display on a short support arm above the seat.
        this._cabinBox(group, 0.055, 0.36, 0.055, 0, 1.83, -0.2, seatMetal);
        this._cabinBox(group, 0.92, 0.6, 0.055, 0, 2.1, -0.03, seatMetal);
        const placeholder = this._cabinSeatTexture(item.seat, "OPEN SEAT", "CAMERA OFFLINE");
        const screenMat = new T.MeshBasicMaterial({ map: placeholder });
        const screen = new T.Mesh(new T.PlaneGeometry(0.78, 0.47), screenMat);
        screen.position.set(0, 2.1, 0.001);
        group.add(screen);
        const ledMat = new T.MeshBasicMaterial({ color: 0x475569 });
        const led = new T.Mesh(new T.SphereGeometry(0.022, 10, 8), ledMat);
        led.position.set(0.38, 2.36, 0.04);
        group.add(led);
        const nameTex = this._cabinNameTexture(SEAT_LABEL[item.seat], "OPEN SEAT");
        const nameMat = new T.MeshBasicMaterial({ map: nameTex, transparent: true });
        const nameplate = new T.Mesh(new T.PlaneGeometry(0.74, 0.2), nameMat);
        nameplate.position.set(0, 1.76, 0.18);
        group.add(nameplate);

        this.cabin.seats.push({
          index: this.cabin.seats.length,
          seat: item.seat,
          group,
          screen,
          screenMat,
          ledMat,
          placeholder,
          placeholderKey: "",
          nameTex,
          nameMat,
          nameCanvas: nameTex.image,
          nameKey: "",
          avatarRoot: null,
          rig: null,
          playerId: null,
          avatarKey: "",
          feedSig: "",
          feedPeerId: null,
          lookUntil: 0,
          nextLook: 4 + this.cabin.seats.length * 2.1,
          hipAligned: false
        });
      }
    }

    _cabinSeatTexture(seat, name, status) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 320;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#020b12";
      ctx.fillRect(0, 0, 512, 320);
      ctx.strokeStyle = "rgba(103,232,249,0.45)";
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, 496, 304);
      ctx.strokeStyle = "rgba(103,232,249,0.14)";
      ctx.lineWidth = 1;
      for (let y = 30; y < 320; y += 24) { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(502, y); ctx.stroke(); }
      ctx.fillStyle = "#67e8f9";
      ctx.font = "900 74px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(SEAT_LABEL[seat], 256, 130);
      ctx.fillStyle = "#e2f8ff";
      ctx.font = "800 33px Arial, Helvetica, sans-serif";
      ctx.fillText(String(name || "OPEN SEAT").slice(0, 18).toUpperCase(), 256, 198);
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "700 20px Arial, Helvetica, sans-serif";
      ctx.fillText(String(status || "CAMERA OFFLINE"), 256, 246);
      const texture = new T.CanvasTexture(canvas);
      if (T.sRGBEncoding !== undefined && "encoding" in texture) texture.encoding = T.sRGBEncoding;
      return texture;
    }

    _cabinNameTexture(seat, name) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 512, 128);
      ctx.fillStyle = "rgba(4,18,28,0.9)";
      ctx.strokeStyle = "rgba(103,232,249,0.42)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(5, 8, 502, 110, 14); else ctx.rect(5, 8, 502, 110);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#67e8f9";
      ctx.font = "900 26px Arial, Helvetica, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(seat, 26, 53);
      ctx.fillStyle = "#e6f7fb";
      ctx.font = "800 30px Arial, Helvetica, sans-serif";
      ctx.fillText(String(name || "OPEN SEAT").slice(0, 21).toUpperCase(), 90, 54);
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "700 17px Arial, Helvetica, sans-serif";
      ctx.fillText("FLIGHT DECK · LIVE VIDEO", 26, 92);
      const texture = new T.CanvasTexture(canvas);
      if (T.sRGBEncoding !== undefined && "encoding" in texture) texture.encoding = T.sRGBEncoding;
      return texture;
    }

    _drawSeatName(seat, name) {
      const canvas = seat.nameCanvas;
      if (!canvas) return;
      const key = `${seat.seat}:${name || ""}`;
      if (seat.nameKey === key) return;
      seat.nameKey = key;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(4,18,28,0.9)";
      ctx.strokeStyle = "rgba(103,232,249,0.42)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(5, 8, 502, 110, 14); else ctx.rect(5, 8, 502, 110);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#67e8f9";
      ctx.font = "900 26px Arial, Helvetica, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(SEAT_LABEL[seat.seat], 26, 53);
      ctx.fillStyle = "#e6f7fb";
      ctx.font = "800 30px Arial, Helvetica, sans-serif";
      ctx.fillText(String(name || "OPEN SEAT").slice(0, 21).toUpperCase(), 90, 54);
      ctx.fillStyle = "#7dd3fc";
      ctx.font = "700 17px Arial, Helvetica, sans-serif";
      ctx.fillText("FLIGHT DECK · LIVE VIDEO", 26, 92);
      if (seat.nameTex) seat.nameTex.needsUpdate = true;
    }

    _drawSeatPlaceholder(seat, name, status) {
      const key = `${seat.seat}:${name}:${status}`;
      if (seat.placeholderKey === key) return seat.placeholder;
      seat.placeholderKey = key;
      const texture = this._cabinSeatTexture(seat.seat, name, status);
      if (seat.placeholder && typeof seat.placeholder.dispose === "function" && seat.placeholder !== texture) {
        // Textures are small; keep the previous one alive while the material
        // may still reference it for this frame, then let GC/Three release it.
      }
      seat.placeholder = texture;
      return texture;
    }

    _syncCabinRoster() {
      if (!this.cabin || this.cabin.failed) return;
      const roster = this._cabinRoster();
      const key = roster.map((entry) => `${entry.seat}:${entry.player ? entry.player.id : ""}:${entry.player ? entry.player.name : ""}:${entry.player ? entry.player.role : ""}:${entry.player ? entry.player.color || "" : ""}`).join("|");
      if (key !== this._cabinRosterKey) {
        this._cabinRosterKey = key;
        roster.forEach((entry) => this._syncSeatAvatar(this.cabin.seats[entry.index], entry.player));
      }
      if (this.cabinRosterEl) {
        const html = roster.map((entry) => {
          const p = entry.player;
          const peer = p && this.peers.get(p.id);
          const live = !!(peer && peer.video && peer.stream && peer.video.readyState >= 2);
          return `<div class="vl-seat-chip${live ? " is-live" : ""}">
            <b>${SEAT_LABEL[entry.seat]}</b>
            <span>${esc(p ? p.name : "OPEN SEAT")}</span>
            <i>${live ? "LIVE CAMERA" : (p ? roleLabel(p.role) : "UNASSIGNED")}</i>
          </div>`;
        }).join("");
        if (this._cabinRosterHtml !== html) {
          this._cabinRosterHtml = html;
          this.cabinRosterEl.innerHTML = html;
        }
      }
    }

    _syncSeatAvatar(seat, player) {
      if (!seat || !this.cabin) return;
      const nextId = player ? player.id : null;
      const avatarKey = player ? `${nextId}:${player.name || ""}:${player.role || ""}:${player.color || ""}` : "";
      if (seat.avatarKey === avatarKey && (seat.avatarRoot || !player)) {
        this._drawSeatName(seat, player ? player.name : "OPEN SEAT");
        return;
      }
      if (seat.avatarRoot && seat.avatarRoot.parent) seat.avatarRoot.parent.remove(seat.avatarRoot);
      seat.avatarRoot = null;
      seat.rig = null;
      seat.playerId = nextId;
      seat.avatarKey = avatarKey;
      seat.feedSig = "";
      seat.feedPeerId = null;
      seat.hipAligned = false;
      if (!player) {
        this._drawSeatName(seat, "OPEN SEAT");
        return;
      }

      this._drawSeatName(seat, player.name || "CREW");
      const role = normalizeRole(player.role, "crew");
      const modelId = seat.seat === "cdr" || seat.seat === "ms1" ? "crew_a" : "crew_b";
      const color = player.color || (seat.index % 2 ? "#67e8f9" : "#7fb8a6");
      if (!window.glbManager || typeof window.glbManager.createAstronautRig !== "function") return;
      const rig = window.glbManager.createAstronautRig(
        color,
        role,
        player.name || "CREW",
        false,
        modelId,
        "crew",
        { enableLight: false, castShadow: false, receiveShadow: false }
      );
      if (!rig || !rig.root) return;
      if (rig.shadowMesh) rig.shadowMesh.visible = false;
      if (rig.accentRing) rig.accentRing.visible = false;
      if (rig.nameBadge) rig.nameBadge.visible = false;
      if (rig.emoteBubble && rig.emoteBubble.sprite) rig.emoteBubble.sprite.visible = false;
      if (rig.spotLight) rig.spotLight.visible = false;
      rig.root.position.set(seat.group.position.x, seat.group.position.y, seat.group.position.z);
      // Face the cockpit camera; the seat shells keep their small toe-in.
      rig.root.rotation.y = 0;
      rig.root.scale.setScalar(0.96);
      this.cabin.scene.add(rig.root);
      seat.avatarRoot = rig.root;
      seat.rig = rig;
    }

    _syncSeatFeeds() {
      if (!this.cabin || this.cabin.failed) return;
      const roster = this._cabinRoster();
      for (const entry of roster) {
        const seat = this.cabin.seats[entry.index];
        if (!seat) continue;
        const player = entry.player;
        const peer = player ? this.peers.get(player.id) : null;
        const ready = !!(peer && peer.video && peer.stream && peer.video.readyState >= 2 && peer.videoTexture);
        const sig = `${player ? player.id : "open"}:${player ? player.name : ""}:${ready ? 1 : 0}`;
        if (seat.feedSig === sig) continue;
        const status = ready ? "LIVE CAMERA" : (player ? "CAMERA OFFLINE" : "OPEN SEAT");
        if (ready) {
          seat.screenMat.map = peer.videoTexture;
          seat.ledMat.color.setHex(0x4ade80);
          seat.feedPeerId = player.id;
        } else {
          seat.screenMat.map = this._drawSeatPlaceholder(seat, player ? player.name : "OPEN SEAT", status);
          seat.ledMat.color.setHex(player ? 0xfbbf24 : 0x334155);
          seat.feedPeerId = null;
        }
        if (seat.screenMat.map) seat.screenMat.needsUpdate = true;
        seat.feedSig = sig;
      }
    }

    _aimCabinBone(bone, child, target) {
      if (!bone || !child || !T) return;
      const bonePos = bone.getWorldPosition(new T.Vector3());
      const childPos = child.getWorldPosition(new T.Vector3());
      const currentDir = childPos.sub(bonePos);
      const targetDir = target.clone().sub(bonePos);
      if (currentDir.lengthSq() < 1e-8 || targetDir.lengthSq() < 1e-8) return;
      currentDir.normalize();
      targetDir.normalize();
      const worldQuat = bone.getWorldQuaternion(new T.Quaternion());
      const deltaQuat = new T.Quaternion().setFromUnitVectors(currentDir, targetDir);
      const targetWorldQuat = deltaQuat.multiply(worldQuat);
      const parentWorldQuat = bone.parent.getWorldQuaternion(new T.Quaternion());
      bone.quaternion.copy(parentWorldQuat.invert().multiply(targetWorldQuat));
      bone.updateWorldMatrix(false, true);
    }

    _applyCabinArmPose(seat) {
      const rig = seat && seat.rig;
      const bones = rig && rig.bones;
      if (!bones || !bones.upperarm_L || !bones.forearm_L || !bones.hand_L ||
          !bones.upperarm_R || !bones.forearm_R || !bones.hand_R) return;
      rig.root.updateMatrixWorld(true);
      const base = seat.group.position;
      for (const side of [-1, 1]) {
        const upper = bones[side < 0 ? "upperarm_L" : "upperarm_R"];
        const fore = bones[side < 0 ? "forearm_L" : "forearm_R"];
        const hand = bones[side < 0 ? "hand_L" : "hand_R"];
        if (!upper || !fore || !hand) continue;
        const shoulder = upper.getWorldPosition(new T.Vector3());
        const elbow = shoulder.clone().add(new T.Vector3(side * 0.05, -0.15, 0.17));
        const wristOffset = new T.Vector3(side * 0.2, 0.93, 0.5)
          .applyAxisAngle(new T.Vector3(0, 1, 0), seat.group.rotation.y);
        const wrist = new T.Vector3(base.x, base.y, base.z).add(wristOffset);
        this._aimCabinBone(upper, fore, elbow);
        this._aimCabinBone(fore, hand, wrist);
      }
    }

    _resizeCabin() {
      const c = this.cabin;
      if (!c || c.failed || !this.cabinWrap) return;
      const rect = this.cabinWrap.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const width = Math.max(2, Math.floor(rect.width));
      const height = Math.max(2, Math.floor(rect.height));
      if (c.renderer.domElement.width === Math.floor(width * c.renderer.getPixelRatio()) &&
          c.renderer.domElement.height === Math.floor(height * c.renderer.getPixelRatio())) return;
      c.renderer.setSize(width, height, false);
      c.camera.aspect = width / height;
      c.camera.updateProjectionMatrix();
    }

    _startCabinLoop() {
      if (!this.cabin || this.cabin.raf) return;
      const tick = () => {
        const c = this.cabin;
        if (!c || c.failed) return;
        c.raf = window.requestAnimationFrame(tick);
        if (!c.visible || document.hidden) return;
        const now = performance.now();
        if (now - c.lastFrame < 30) return;
        const dt = Math.min(0.06, Math.max(0.001, (now - c.lastFrame) / 1000));
        c.lastFrame = now;
        c.elapsed += dt;
        c.camX += (this._cabinPointer.x * 0.24 - c.camX) * Math.min(1, dt * 3.2);
        c.camY += (-this._cabinPointer.y * 0.12 - c.camY) * Math.min(1, dt * 3.2);
        c.camera.position.x = c.baseCam.x + c.camX + Math.sin(c.elapsed * 0.19) * 0.035;
        c.camera.position.y = c.baseCam.y + c.camY + Math.sin(c.elapsed * 0.28) * 0.018;
        c.camera.position.z = c.baseCam.z;
        c.camera.lookAt(0, 1.14, 0.34);

        for (const seat of c.seats) {
          if (!seat.rig || typeof seat.rig.updateAnimation !== "function") continue;
          // The crew GLBs and spacesuit rigs use different rest origins. Once
          // the skeleton is ready, align the hips just above the seat cushion so
          // the seated pose reads correctly for every model.
          if (!seat.hipAligned && seat.rig.bones && seat.rig.bones.hips) {
            seat.rig.root.updateMatrixWorld(true);
            const hip = seat.rig.bones.hips.getWorldPosition(new T.Vector3());
            const targetHip = seat.group.position.y + 0.66;
            seat.rig.root.position.y += targetHip - hip.y;
            seat.hipAligned = true;
          }
          // Keep every seated avatar facing the camera; the idle clip supplies
          // the breathing/weight-shift animation while the hands rest on the
          // flight-control sticks.
          seat.rig.updateAnimation(dt, false, false, true, "idle", false, false, true, 0);
          this._applyCabinArmPose(seat);
        }
        c.feedTick += dt;
        if (c.feedTick > 0.35) {
          c.feedTick = 0;
          this._syncSeatFeeds();
        }
        c.renderer.render(c.scene, c.camera);
      };
      this.cabin.raf = window.requestAnimationFrame(tick);
    }
  }

  window.videoLink = new CrewVideoLink();
})(window);
