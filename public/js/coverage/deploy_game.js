/*
 * deploy_game.js — client controller for the ISS deployment phase of the CubeSat mission.
 *
 * The server runs the deployment simulation (deploy_core.js via server/coverage_room.js) and streams
 * `deploy_state` snapshots at 10 Hz. This controller interpolates them for a smooth picture, draws them
 * (DeployView + DeployHud), sends console commands, and — for the player holding the JEMRMS console —
 * streams the hand-controller axes. coverage_game.js starts it while `coverageState.deployActive`.
 */
(function () {
  "use strict";
  const D = window.DeployCore;
  const lerp = (a, b, k) => a + (b - a) * k;
  const lerpA = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
  const lerpDeg = (a, b, k) => { let d = ((b - a + 540) % 360) - 180; return (a + d * k + 360) % 360; };

  class DeployMode {
    constructor(game) {
      this.game = game; this.net = game.net; this.listeners = []; this.keys = new Set();
      this.view = new window.DeployView(game.renderer);
      this.hud = new window.DeployHud((c, a) => this.command(c, a));
      this.a = null; this.b = null; this.assess = null;
      this._onState = (s) => this._state(s);
      this.net.on("deploy_state", this._onState);
      if (this.net.deployState) this._state(this.net.deployState);
      this._on(window, "keydown", (e) => this._key(e, true), true);
      this._on(window, "keyup", (e) => this._key(e, false), true);
      this._on(window, "blur", () => this.keys.clear());
      this._bindPointer();
      this._lastInputSent = 0; this._lastInputKey = "";
    }
    _on(t, type, fn, cap) { t.addEventListener(type, fn, !!cap); this.listeners.push([t, type, fn, !!cap]); }
    dispose() {
      for (const [t, type, fn, cap] of this.listeners) t.removeEventListener(type, fn, cap);
      this.listeners = []; this.net.off("deploy_state", this._onState);
      this.hud.dispose(); this.view.dispose();
    }
    _state(s) {
      if (!s) return;
      if (s.assess !== undefined && s.assess) { this.assess = s.assess; this.assess._rev = s.assessRev; }
      else if (s.assess === null) this.assess = null;
      const now = performance.now();
      this.a = this.b && this.b.phase === s.phase ? this.b : s; this.aT = this.bT || now;
      this.b = s; this.bT = now;
      if (s.roles) this.roles = s.roles;
    }
    mine() {
      const id = this.net.socketId, r = this.roles || {};
      return D.ROLES.filter((k) => r[k] && r[k].playerId === id);
    }
    isHost() { const room = this.game.room; return !!(room && room.hostId === this.net.socketId) || !(room && room.players && room.players.length > 1); }
    /** interpolate continuous values between the last two snapshots (render ~1 snapshot behind) */
    _mixed() {
      const a = this.a, b = this.b; if (!b) return null;
      if (!a || a === b) return b;
      const span = Math.max(30, this.bT - this.aT), k = Math.max(0, Math.min(1, (performance.now() - this.bT) / span));
      const s = JSON.parse(JSON.stringify(b));
      const kk = 1 - (1 - k);   // fraction from a -> b, lagging one snapshot
      s.t = lerp(a.t, b.t, kk);
      s.arm.d = lerpA(a.arm.d, b.arm.d, kk); s.arm.rollDeg = lerp(a.arm.rollDeg, b.arm.rollDeg, kk);
      s.arm.az = lerpDeg(a.arm.az, b.arm.az, kk); s.arm.el = lerp(a.arm.el, b.arm.el, kk); s.arm.move = lerp(a.arm.move, b.arm.move, kk);
      s.al.table = lerp(a.al.table, b.al.table, kk); s.al.outer = lerp(a.al.outer, b.al.outer, kk);
      s.sat.door = lerp(a.sat.door, b.sat.door, kk); s.sat.rail = lerp(a.sat.rail, b.sat.rail, kk);
      if (a.sat.released && b.sat.released) { s.sat.p = lerpA(a.sat.p, b.sat.p, kk); s.sat.rot = lerpA(a.sat.rot, b.sat.rot, kk); }
      return s;
    }
    frame(dt) {
      this._sendInput();
      const st = this._mixed();
      if (!st) { this.view.render(); return; }
      this.view.update(st, this.assess, dt || 0.016);
      this.view.render();
      const f = D.frame(st, st.t);
      this.hud.update({ st, assess: this.assess, roles: this.roles || {}, mine: this.mine(), isHost: this.isHost(), view: this.view, cc: D.commChangeIn(st, st.t), frame: f });
    }

    // ------------------------------------------------------------------ commands
    async req(type, payload) {
      const r = await this.net.coverageRequest(type, payload);
      if (!r.accepted && r.reason) this.hud.toast(r.reason);
      return r;
    }
    command(c, a) {
      switch (c) {
        case "CLOSE": this.hud.closeWin(); return;
        case "BRIEF": this.hud._brief({ st: this.b, roles: this.roles || {}, mine: this.mine(), isHost: this.isHost() }); return;
        case "DEBRIEF": this.hud._debrief({ st: this.b }); return;
        case "LEAVE": this.hud.showWin("Leave?", "", "<p>Leave this session and return to the title screen?</p>", [["CLOSE", "Stay"], ["LEAVE_OK", "Leave session", undefined, "warn"]]); return;
        case "LEAVE_OK": if (this.game.onLeave) this.game.onLeave(); return;
        case "SKIP": this.hud.closeWin(); return this.req("DEPLOY", { cmd: "SKIP" });
        case "WARP": return this.req("DEPLOY", { cmd: "WARP", arg: +a });
        case "GO": return this.req("DEPLOY", { cmd: "GO", arg: a });
        case "GO_MINE": {   // keyboard: report GO for each console I hold, in poll order
          const st = this.b; if (!st) return;
          const todo = D.ROLES.filter((r) => this.mine().includes(r) && !st.poll[r]);
          if (!todo.length) { this.hud.toast("Your consoles are already GO"); return; }
          return (async () => { for (const r of todo) { const x = await this.req("DEPLOY", { cmd: "GO", arg: r }); if (!x.accepted) break; } })();
        }
        case "HANDOFF": this.hud.closeWin(); return this.req("DEPLOY", { cmd: "HANDOFF" });
        default: if (c === "BEGIN") this.hud.closeWin(); return this.req("DEPLOY", { cmd: c, arg: a === null || a === undefined ? undefined : a });
      }
    }
    _sendInput() {
      if (!this.mine().includes("rms") || !this.b) return;
      const k = this.keys, ax = (p, n) => (k.has(p) ? 1 : 0) - (k.has(n) ? 1 : 0);
      const ph = this.b.phase;
      let inp = { x: 0, y: 0, z: 0, r: 0, fine: k.has("ShiftLeft") || k.has("ShiftRight") };
      if (ph === "grapple") inp = { x: ax("KeyD", "KeyA"), z: ax("KeyW", "KeyS"), y: ax("KeyR", "KeyF"), r: ax("KeyE", "KeyQ"), fine: inp.fine };
      else if (ph === "point") inp = { x: ax("KeyD", "KeyA"), z: ax("KeyW", "KeyS"), y: 0, r: 0, fine: inp.fine };
      const key = JSON.stringify(inp), now = performance.now(), active = inp.x || inp.y || inp.z || inp.r;
      if (key !== this._lastInputKey || (active && now - this._lastInputSent > 400)) {
        this._lastInputKey = key; this._lastInputSent = now;
        this.net.coverageRequest("DEPLOY_INPUT", { input: inp });
      }
    }
    _key(e, down) {
      const tag = e.target && e.target.tagName; if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!down) { this.keys.delete(e.code); return; }
      const st = this.b; if (!st) return;
      const ph = st.phase, armKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyF", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"];
      if (armKeys.includes(e.code)) { this.keys.add(e.code); if (ph === "grapple" || ph === "point") { e.preventDefault(); e.stopPropagation(); } }
      if (e.repeat) return;
      if (e.code === "Escape") { e.preventDefault(); if (!this.hud.closeWin()) this.command("LEAVE"); return; }
      if (this.hud.openWin && e.code !== "Enter") return;
      const map = {
        load: { Enter: "STEP" }, depress: { KeyP: "PUMP", KeyV: "VENT", KeyL: "LEAK_CHECK", KeyH: "OUTER_HATCH" }, outboard: { KeyT: "TABLE" },
        grapple: { KeyG: "GRAPPLE" }, move: { KeyM: "MOVE" }, point: { KeyB: "BRAKES", KeyK: "CAMERA", KeyG: "GO_MINE", KeyY: "ARM", Enter: "DEPLOY" }, done: { Enter: "HANDOFF" }, brief: { Enter: "BEGIN" },
      }[ph] || {};
      let c = map[e.code];
      if (e.code === "Enter" && this.hud.openWin) { if (ph === "brief") c = "BEGIN"; else if (ph === "done") c = "HANDOFF"; else c = "CLOSE"; }
      if (e.code === "KeyC") c = "CAM";
      if (e.code === "Comma" || e.code === "Period") { const i = D.WARPS.indexOf(st.warp); const w = D.WARPS[Math.max(0, Math.min(D.WARPS.length - 1, i + (e.code === "Period" ? 1 : -1)))]; if (w !== st.warp) this.command("WARP", w); e.preventDefault(); return; }
      if (!c) return;
      e.preventDefault(); e.stopPropagation();
      if (window.shuttleSfx) window.shuttleSfx.key(true, e.code);
      if (c === "CAM") { const m = this.view.cycleCamera(); this.hud.toast(`Camera: ${m === "auto" ? "automatic" : m}`, 1500); return; }
      this.command(c);
    }
    _bindPointer() {
      const canvas = this.game.renderer.domElement, pts = new Map();
      this._on(canvas, "pointerdown", (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
      this._on(window, "pointerup", (e) => { pts.delete(e.pointerId); });
      this._on(window, "pointermove", (e) => {
        const p = pts.get(e.pointerId); if (!p) return;
        if (pts.size === 1) this.view.orbitCamera(-(e.clientX - p.x) * 0.005, (e.clientY - p.y) * 0.004);
        else if (pts.size === 2) { const o = [...pts.entries()].find(([id]) => id !== e.pointerId)[1]; const d0 = Math.hypot(p.x - o.x, p.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y); if (d0 > 0 && d1 > 0) this.view.zoomCamera(d0 / d1); }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      });
      this._on(canvas, "wheel", (e) => { e.preventDefault(); this.view.zoomCamera(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, false);
    }
  }
  window.DeployMode = DeployMode;
})();
