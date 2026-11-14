/*
 * shuttle_game.js — client controller for the co-op Shuttle mission.
 *
 * The server runs the authoritative mission (shuttle_mission.js) and streams MissionSnapshots.
 * This controller owns the keyboard while a flight is active, sends the control axes and
 * commands that belong to the player's crew seat(s), renders the snapshot through ShuttleView
 * (with short dead-reckoning between 15 Hz snapshots) and drives the HUD. It also renders the
 * title backdrop (the stack on the pad) before a flight starts.
 */
(function () {
  "use strict";
  const S = window.ShuttleSim, Lib = window.ShuttleMissionLib, CREW = Lib.CREW;
  const WARP_STEPS = [1, 2, 4, 10, 25, 50, 100];
  const FLIGHT_KEYS = new Set(["KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "KeyZ", "KeyX", "KeyI", "KeyK", "KeyJ", "KeyL", "KeyU", "KeyO", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
  const KEY_COMMANDS = { KeyB: "AUTHORIZE_BURN", KeyY: "BAY", KeyP: "PAYLOAD_POWER", KeyN: "PAYLOAD_GO", KeyR: "RELEASE_PAYLOAD", KeyH: "DAP_HOLD",
    KeyT: "COAST_TO_TIG", KeyM: "TOGGLE_AOA_ASSIST", KeyG: "DEPLOY_GEAR", Comma: "WARP-", Period: "WARP+", KeyC: "CAM", KeyF: "RECENTRE", KeyV: "MIC", Escape: "PAUSE" };

  const game = {
    isActive: false, net: null, view: null, hud: null, keys: {}, sbPos: 0, listeners: [], titleMission: null, _camBound: false,
    testMode: /[?&]shuttletest=1/.test(location.search),

    // ---------------------------------------------------------------- title backdrop
    ensureView(renderer) {
      if (renderer) this.renderer = renderer;
      if (!this.renderer) return null;
      if (!this.view) {
        this.view = new window.ShuttleView(this.renderer);
        this.view.autoRecentre = false;
      }
      if (!this._camBound) {
        this._camBound = true;
        this._bindCameraInput();
      }
      return this.view;
    },
    initTitle(renderer) {
      this.renderer = renderer;
      this.titleMission = new Lib.ShuttleMission();
      this.ensureView(renderer);
    },
    renderTitle(dt) {
      if (!this.view || !this.titleMission) return;
      const sn = this.titleMission.snapshot();
      this.view.orbitCamera(dt * 0.05, 0);
      this.view.camOrbit.pitch = -0.08;
      this.view.update(sn, {}, dt);
      this.view.render();
    },
    resize() {
      if (this.view) this.view.resize();
      if (this.controlCamera) {
        this.controlCamera.aspect = window.innerWidth / window.innerHeight;
        this.controlCamera.updateProjectionMatrix();
      }
    },

    // camera look-around: drag (mouse or touch) on the canvas, wheel / pinch to zoom
    _bindCameraInput() {
      const canvas = this.renderer.domElement;
      canvas.style.touchAction = "none";
      const pts = new Map();
      // right mouse button held = SCOPE (narrow-field sky view, like aiming down sights); wheel sets magnification
      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      canvas.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.view) { this.view.dragging = true; if (e.button === 2 && this.isActive) this.view.setScope(true); } });
      const end = (e) => { pts.delete(e.pointerId); if (this.view && e.button === 2) this.view.setScope(false); if (!pts.size && this.view) this.view.dragging = false; };
      window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
      window.addEventListener("pointermove", (e) => {
        if (!pts.has(e.pointerId) || !this.view || !this.isActive) return;
        const p = pts.get(e.pointerId);
        const k = this.view.scope && this.view.scope.on ? this.view.scope.fov / 60 : 1;   // finer aim when zoomed
        if (pts.size === 1 && this.controlCenter) {
          this.controlYaw -= (e.clientX - p.x) * 0.004;
          this.controlPitch = Math.max(-0.8, Math.min(0.8, this.controlPitch - (e.clientY - p.y) * 0.004));
        } else if (pts.size === 1) this.view.orbitCamera(-(e.clientX - p.x) * 0.006 * k, (e.clientY - p.y) * 0.005 * k);
        else if (pts.size === 2) {
          const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1];
          const d0 = Math.hypot(p.x - other.x, p.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
          if (d0 > 0 && d1 > 0) this.view.zoomCamera(d0 / d1);
        }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      });
      canvas.addEventListener("wheel", (e) => { if (!this.isActive || !this.view) return; e.preventDefault(); if (this.view.scope && this.view.scope.on) this.view.scopeZoom(e.deltaY > 0 ? 1.15 : 1 / 1.15); else this.view.zoomCamera(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    },

    // ---------------------------------------------------------------- flight lifecycle
    start(opts) {
      if (this.isActive) return;
      this.net = opts.net; this.onLeave = opts.onLeave; this.onReturnToLobby = opts.onReturnToLobby || null;
      this.ensureView(opts && opts.renderer);
      this.controlCenter = !!(this.net.localPlayer && this.net.localPlayer.team === "ground");
      this.controlYaw = 0; this.controlPitch = 0;
      if (!this.controlCamera) {
        this.controlCamera = new window.THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
        this.controlCamera.position.set(-60, 3.5, 246);
        this.controlCamera.rotation.order = "YXZ";
        this.controlLight = new window.THREE.HemisphereLight(0xffffff, 0x7892a8, 0.7);
        this.controlLight.visible = false;
        window.scene.add(this.controlLight);
      }
      this.isActive = true; this.keys = {}; this.sbPos = 0; this.snapA = null; this.snapB = null; this.snapBuf = []; this.lastSent = null; this.lastSendT = 0;
      if (this.view) {
        this.view.resize();
        this.view.autoRecentre = true;
        this.view.recentre();
        this.view.camMode = "follow";
      }
      this.hud = new window.ShuttleHud((cmd, arg) => this.command(cmd, arg), { crew: CREW, canReturnLobby: !!(opts && opts.canReturnLobby && this.onReturnToLobby) });
      this._on(window, "keydown", (e) => this._key(e, true), true);
      this._on(window, "keyup", (e) => this._key(e, false), true);
      this._on(window, "blur", () => { this.keys = {}; if (this.hud) this.hud.clearTouch(); });
      this._on(document, "visibilitychange", () => { if (document.hidden) this.keys = {}; });
      this._netHandlers = {
        shuttle_state: (sn) => {
          const now = performance.now();
          // a retry/restart (sim time going backwards) starts a fresh buffer: never blend across it
          if (this.snapB && sn.simTime < this.snapB.sn.simTime) this.snapBuf = [];
          this.snapA = this.snapB; this.snapB = { sn, at: now };
          (this.snapBuf = this.snapBuf || []).push(this.snapB); if (this.snapBuf.length > 8) this.snapBuf.shift();
        },
        shuttle_command_log: (log) => { if (this.hud) this.hud.crewLog(log); },
        shuttle_events: (ev) => { if (this.hud) this.hud.events(ev); },
        player_left: (p) => { if (this.hud) this.hud.toast(`${p.name} left the flight — their seat is now flown by the Commander`); },
      };
      for (const k of Object.keys(this._netHandlers)) this.net.on(k, this._netHandlers[k]);
      if (this.net.snapshot) this._netHandlers.shuttle_state(this.net.snapshot);
      console.log("[Shuttle] crew flight view active");
    },
    _on(target, type, fn, capture) { target.addEventListener(type, fn, !!capture); this.listeners.push([target, type, fn, !!capture]); },

    exit() {
      if (!this.isActive) return;
      for (const [t, type, fn, cap] of this.listeners) t.removeEventListener(type, fn, cap);
      this.listeners = [];
      if (this.net && this._netHandlers) for (const k of Object.keys(this._netHandlers)) this.net.off(k, this._netHandlers[k]);
      if (this.hud) this.hud.dispose();
      this.hud = null; this.keys = {}; this.isActive = false; this.snapA = this.snapB = null; this.snapBuf = [];
      if (this.view) { this.view.setScope(false); this.view.dragging = false; this.view.autoRecentre = false; this.view.recentre(); this.view.camMode = "follow"; }
      if (this.renderer) this.renderer.setClearColor(0x000000, 1);
      if (window.shuttleSfx && typeof window.shuttleSfx.stopAll === "function") window.shuttleSfx.stopAll();
      console.log("[Shuttle] crew flight view closed");
    },
    onRoomUpdate(room) { if (this.hud) { this.hud.room = room; this.hud.opts.canReturnLobby = !!(this.onReturnToLobby && this.net && this.net.isHost); } },
    onChat(comm) { if (this.hud) this.hud.chat(comm); },

    myRoles() { return this.net ? this.net.myRoles() : []; },
    owns(seat) { return this.myRoles().includes(seat); },

    async command(cmd, arg) {
      if (!this.net) return;
      switch (cmd) {
        case "RETURN_LOBBY": if (this.onReturnToLobby) this.onReturnToLobby(); return;
        case "LEAVE": case "EXIT": if (this.onLeave) this.onLeave(); return;
        case "CAM": if (this.view) this.view.cycleCamera(); return;
        case "RECENTRE": if (this.view) this.view.recentre(); return;
        case "TOUCH": if (this.hud) this.hud.toggleTouch(); return;
        case "MIC": if (window.crewComms) window.crewComms.toggleMic(); return;
        case "COMMS": if (window.crewComms) window.crewComms.openSettings(); return;
        case "CONTROL_CENTER": this.controlCenter = !this.controlCenter; return;
        case "CHAT": if (arg) this.net.sendChat(arg); return;
        case "GMAT_COAST": {
          if (!this.hud || this.hud.gmatLoading) return;
          const hud = this.hud;
          hud.gmatLoading = true;
          hud.gmatMessage = "GMAT calculation in progress…";
          if (!this.net.socket || !this.net.connected) {
            hud.gmatLoading = false;
            hud.gmatMessage = "Connect to the flight before requesting GMAT.";
            return;
          }
          this.net.socket.timeout(25000).emit("shuttle_gmat_coast", (error, result) => {
            if (this.hud !== hud) return;
            hud.gmatLoading = false;
            if (error || !result) hud.gmatMessage = "GMAT request timed out.";
            else if (!result.success) hud.gmatMessage = result.error || "GMAT calculation failed.";
            else {
              hud.gmatPrediction = result.prediction;
              hud.gmatMessage = "GMAT coast calculation complete.";
            }
          });
          return;
        }
        case "BAY": { const sn = this.net.snapshot; const close = sn && (sn.vehicle.doors > 0.5 || sn.vehicle.doorsCmd > 0); return this._send(close ? "CLOSE_BAY" : "OPEN_BAY"); }
        case "WARP+": case "WARP-": {
          const sn = this.net.snapshot, cur = sn ? Math.max(0, WARP_STEPS.indexOf(sn.warpReq)) : 0;
          const n = WARP_STEPS[Math.max(0, Math.min(WARP_STEPS.length - 1, cur + (cmd === "WARP+" ? 1 : -1)))];
          return this._send("SET_WARP", { factor: n });
        }
        case "RETRY_CHECKPOINT": this.sbPos = 0; return this._send("RETRY_CHECKPOINT", { name: arg });
        default: return this._send(cmd);
      }
    },
    async _send(type, args) {
      const seat = CREW.commandRole[type];
      if (seat && !this.owns(seat) && this.hud) { this.hud.toast(`${CREW.info[seat].title} owns that — ask your ${CREW.info[seat].short}`); return { accepted: false }; }
      const r = await this.net.sendCommand(type, args);
      if (!r.accepted && this.hud) this.hud.toast(r.reason || "Rejected");
      return r;
    },

    _key(e, down) {
      if (!this.isActive) return;
      const sysModal = document.getElementById("modal-station-systems");
      if (sysModal && sysModal.style.display === "flex") {
        if (down && (e.code === "Escape" || e.key === "Escape")) {
          e.preventDefault();
          const closeBtn = document.getElementById("btn-close-settings");
          if (closeBtn) closeBtn.click();
        }
        return;
      }
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.stopPropagation();
      if (FLIGHT_KEYS.has(e.code) || e.code === "Escape" || e.code === "F3" || e.code === "Tab") e.preventDefault();
      if (down && !e.repeat) {
        const sn = this.net && this.net.snapshot;
        if (e.code === "F3" || e.code === "Tab") { if (this.hud) this.hud.toggleData(); }
        else if (e.code === "Enter") { if (sn && sn.phase === "briefing" && tag !== "BUTTON") this.command("START"); }
        else if (e.code === "Slash" && this.hud) this.hud.focusChat();
        else if (KEY_COMMANDS[e.code]) this.command(KEY_COMMANDS[e.code]);
      }
      if (!e.repeat && !!this.keys[e.code] !== down && window.shuttleSfx) window.shuttleSfx.key(down, e.code);
      this.keys[e.code] = down;
    },

    // control axes for the seats this player owns (others' axes are ignored by the server anyway)
    _axes(dt) {
      const k = this.keys, sn = this.net && this.net.snapshot, ph = sn ? sn.phase : "briefing", t = this.hud ? this.hud.touchInput() : {};
      const ax = (pos, neg) => (k[pos] ? 1 : 0) - (k[neg] ? 1 : 0);
      const inp = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: this.sbPos, brake: 0 };
      if (ph === "payload" || ph === "deorbit" || ph === "insertion") {
        inp.pitch = ax("KeyS", "KeyW"); inp.roll = ax("KeyD", "KeyA"); inp.yaw = ax("KeyE", "KeyQ");   // A/D roll, Q/E yaw (rudder)
        inp.ty = ax("KeyI", "KeyK"); inp.tx = ax("KeyJ", "KeyL"); inp.tz = ax("KeyU", "KeyO");
      } else if (ph === "entry") {
        inp.roll = ax("KeyD", "KeyA"); inp.pitch = ax("KeyS", "KeyW");
      } else if (ph === "approach" || ph === "rollout") {
        inp.pitch = ax("KeyS", "KeyW"); inp.roll = ax("KeyD", "KeyA");
        // on the runway the rudder pedals (Q/E) steer the nose wheel; in the air the sim flies coordinated turns
        if (ph === "rollout") inp.roll = Math.max(-1, Math.min(1, inp.roll + ax("KeyE", "KeyQ")));
        if (this.owns("plt")) { this.sbPos = Math.max(0, Math.min(1, this.sbPos + (ax("KeyX", "KeyZ") + (t.sb || 0)) * 0.5 * dt)); }
        inp.sb = this.sbPos;
        inp.brake = k.Space || t.brake ? 1 : 0;
      }
      for (const a of ["pitch", "roll", "yaw", "ty"]) if (t[a]) inp[a] = Math.max(-1, Math.min(1, inp[a] + t[a]));
      // zero the axes this player does not own so a shared keyboard never fights another seat
      for (const a of Object.keys(inp)) if (!this.owns(CREW.axisRole[a])) inp[a] = 0;
      return inp;
    },
    _sendInput(force, ack) {
      const inp = this.input || {};
      const key = JSON.stringify(inp), now = performance.now();
      if (!force && key === this.lastSent && now - this.lastSendT < 250) return Promise.resolve(true);
      this.lastSent = key; this.lastSendT = now;
      return this.net.sendInput(inp, ack);
    },

    // Render ~1.5 snapshot intervals in the past and interpolate between the two snapshots around that
    // moment, so the orbiter, separated SRBs/ET and the satellite move smoothly at any frame rate. The
    // old path dead-reckoned only the orbiter (without thrust) and drew debris at raw 15 Hz positions,
    // which made separations stutter. Beyond the newest snapshot it extrapolates briefly.
    _renderSnapshot() {
      const buf = this.snapBuf || []; const B = this.snapB; if (!B || !buf.length) return null;
      const L = buf[buf.length - 1], sn = L.sn;
      const hold = sn.paused || sn.failure || sn.result || sn.phase === "briefing";
      if (hold || buf.length < 2) return Object.assign({}, sn, { vehicle: Object.assign({}, sn.vehicle, { prevR: null, alpha: 0 }) });
      const span = Math.max(30, Math.min(200, (L.at - buf[0].at) / (buf.length - 1)));
      const t = performance.now() - 1.5 * span;
      let A = null, C = null;
      for (let i = buf.length - 1; i > 0; i--) if (buf[i - 1].at <= t) { A = buf[i - 1]; C = buf[i]; break; }
      if (!A) { A = buf[0]; C = buf[1]; }
      let u = (t - A.at) / Math.max(1, C.at - A.at);
      const a = A.sn, c = C.sn;
      if (a.phase !== c.phase && (a.vehicle.regime !== c.vehicle.regime)) u = 1;
      u = Math.max(0, Math.min(1.6, u));                     // >1: short extrapolation past the newest
      const dS = c.simTime - a.simTime;
      const va = a.vehicle, vc = c.vehicle;
      const lerp = (x, y, k) => [0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * k);
      const slerp = (qa, qc, k) => {
        if (!qa || !qc) return qc || qa;
        if (k >= 1) return k === 1 ? qc : extrapQ(qa, qc, k);
        return S.quat.qToward(qa, qc, k * S.quat.qAngle(qa, qc));
      };
      const extrapQ = (qa, qc, k) => { const d = S.quat.qmul(S.quat.qconj(qa), qc); const ang = S.quat.qAngle(qa, qc); if (ang < 1e-9) return qc;
        const s = Math.sin(ang / 2), ax = [d[1] / s, d[2] / s, d[3] / s].map((x) => x * Math.sign(d[0] || 1)); return S.quat.qIntegrate(qc, ax, ang * (k - 1)); };
      let r;
      if (u <= 1 && dS > 0) {   // cubic Hermite using both velocities (exact for powered flight to 2nd order)
        const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
        r = [0, 1, 2].map((i) => h00 * va.r[i] + h10 * dS * va.v[i] + h01 * vc.r[i] + h11 * dS * vc.v[i]);
      } else {
        const e = Math.max(0, u - 1) * dS, g = S.gravity(vc.r);
        r = [0, 1, 2].map((i) => vc.r[i] + vc.v[i] * e + 0.5 * g[i] * e * e);
      }
      const vehicle = Object.assign({}, vc, { r, v: lerp(va.v, vc.v, Math.min(u, 1)), q: slerp(va.q, vc.q, u), prevR: null, alpha: 0 });
      const out = Object.assign({}, c, { simTime: a.simTime + dS * u, vehicle });
      const prevDeb = {}; (a.debris || []).forEach((b) => { prevDeb[b.id] = b; });
      out.debris = (c.debris || []).map((b) => { const p = prevDeb[b.id]; return p ? Object.assign({}, b, { r: lerp(p.r, b.r, u), q: slerp(p.q, b.q, u) }) : b; });
      if (a.payload && c.payload && a.payload.r && c.payload.r) out.payload = Object.assign({}, c.payload, { r: lerp(a.payload.r, c.payload.r, u), q: slerp(a.payload.q, c.payload.q, u) });
      return out;
    },

    frame(rawDt) {
      if (!this.isActive) return;
      this._fps = this._fps ? this._fps * 0.95 + (1 / Math.max(1e-3, rawDt)) * 0.05 : 60;
      this.input = this._axes(Math.min(rawDt, 0.1));
      this._sendInput(false);
      const sn = this._renderSnapshot();
      if (sn) { this.view.update(sn, this.input, rawDt); }
      else if (this.titleMission) this.view.update(this.titleMission.snapshot(), {}, rawDt);
      if (this.controlCenter && window.spaceCenter && window.spaceCenter.group) {
        const scene = window.scene, group = window.spaceCenter.group;
        const oldVisible = group.visible, oldFog = scene.fog, oldBackground = scene.background;
        const oldExposure = this.renderer.toneMappingExposure;
        group.visible = true;
        this.controlLight.visible = true;
        scene.fog = null;
        scene.background = new window.THREE.Color(0x9eb7c5);
        this.controlCamera.rotation.set(this.controlPitch, this.controlYaw, 0);
        this.renderer.toneMappingExposure = 0.5;
        this.renderer.render(scene, this.controlCamera);
        this.renderer.toneMappingExposure = oldExposure;
        scene.background = oldBackground;
        scene.fog = oldFog;
        this.controlLight.visible = false;
        group.visible = oldVisible;
      } else {
        this.view.render();
      }
      if (this.hud && sn) this.hud.update(sn, rawDt, { assets: this.view.assetStatus, roles: this.myRoles(), crew: sn.crew, me: this.net.socketId, comms: window.crewComms ? window.crewComms.state() : "N/A", ping: this.net.pingMs, fps: this._fps, scope: this.controlCenter ? null : this.view.scope, keys: this.keys, anchors: this.controlCenter ? null : this.view.steerAnchors(), aim: this.view.aimBody || null, controlCenter: this.controlCenter });
      if (window.shuttleSfx && sn) window.shuttleSfx.update(sn, this.input, rawDt);
    },
  };

  // Automated playtests only (?shuttletest=1 and a server started with SHUTTLE_TEST=1): accelerated
  // stepping of the server's fixed-step simulation with the crew's current held inputs.
  if (game.testMode) {
    window.__shuttleTest = {
      snapshot: () => (game.net && game.net.snapshot) || null,
      roles: () => game.myRoles(),
      flushInput: async () => { game.input = game._axes(1 / 60); await game._sendInput(true, true); return true; },
      stepSim: async (seconds) => {
        game.input = game._axes(Math.min(seconds, 1));
        await game._sendInput(true, true);
        const r = await game.net.testOp({ op: "step", seconds });
        return r && r.t;
      },
      freeze: async (on) => { const r = await game.net.testOp({ op: "freeze", on }); return !!r; },
      preset: async (phase) => { const r = await game.net.testOp({ op: "preset", phase }); game.snapBuf = []; return r; },
      keys: () => Object.keys(game.keys).filter((k) => game.keys[k]),
    };
  }
  window.shuttleGame = game;
})();
