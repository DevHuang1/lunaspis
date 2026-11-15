/*
 * pad_walk.js — pre-flight boarding on LC-39A (remote-main astronaut rigs + walking, adapted).
 *
 * Every crew member starts on the gantry staging deck of the fixed service structure. One walks to
 * the access-arm control (yellow ring) to swing the arm and White Room across to the orbiter; then
 * each walks the bridge to the crew hatch (cyan ring) and boards. The server owns the arm state and
 * who is aboard (pad_action ARM / BOARD, validated against pad_layout.js); once everyone is aboard
 * the normal mission briefing and count follow.
 *
 * Movement follows remote-main's player physics: WASD relative to the camera yaw, Shift to run
 * (3.9 / 5.6 m/s), the body turns toward the motion, third-person camera behind the head. Collision
 * is the walkable-surface model in pad_layout.js (deck + extended arm), so nobody can fall off.
 * Positions are in the pad frame (+X east, +Y up, +Z south); ShuttleView turns them into ECI.
 */
(function () {
  "use strict";
  const T = window.THREE, L = window.PadLayout;
  const WALK = 3.9, RUN = 7.8, SEND_HZ = 10;          // run is 2× walk (remote-main used 5.6, which barely read as running)
  const RUN_ANIM = 1.7;                                  // walk clip plays faster while running
  const CABIN = [2.0, 52.6, -2.0];                 // where an aboard crew member's voice comes from

  const isDescendant = (o, root) => { for (let p = o; p; p = p.parent) if (p === root) return true; return false; };

  class PadWalk {
    constructor(view, net) {
      this.view = view; this.net = net; this.active = false;
      this.rigs = {}; this.remote = {}; this.camYaw = -Math.PI / 2; this.camPitch = -0.12; this.dist = 3.6;
      this.pos = null; this.yaw = -Math.PI / 2; this.lastSend = 0; this.pending = null; this.moving = false;
      this.tour = null;                                  // site tour sector index (remote-main SITE_TOUR_SPAWNS) or null
      this._onMoved = (d) => this._remoteMoved(d);
    }
    get available() { return !!(this.view && this.view.ksc && this.view.padFrame && L); }

    start() {
      if (this.active || !this.available) return false;
      this.active = true;
      const me = this.net.socketId, players = this._players();
      const idx = Math.max(0, players.findIndex((p) => p.id === me));
      const sp = L.spawn(idx);
      this.pos = sp.pos.slice(); this.yaw = sp.yaw; this.camYaw = sp.yaw; this.camPitch = -0.12;
      this.net.on("pad_moved", this._onMoved);
      this._sendPos(true);
      return true;
    }
    stop() {
      if (!this.active) return;
      this.active = false;
      this.net.off("pad_moved", this._onMoved);
      for (const id of Object.keys(this.rigs)) this._dropRig(id);
      this.view.walkCam = null; this.view.kscMarkers = null;
      this.remote = {};
    }

    _players() { const rs = this.net.roomState; return (rs && Array.isArray(rs.players)) ? rs.players : []; }
    _rig(id, p) {
      let r = this.rigs[id];
      if (r) return r;
      const gm = window.glbManager;
      if (gm && typeof gm.createAstronautRig === "function") {
        r = gm.createAstronautRig(p.color || "#67e8f9", p.role || "cdr", p.name || "Astronaut", false, id === this.net.socketId ? "astronaut_lod0" : "astronaut_lod1", "crew", { enableLight: false, castShadow: false, receiveShadow: false });
      } else {
        const g = new T.Group(), m = new T.Mesh(new T.CapsuleGeometry ? new T.CapsuleGeometry(0.3, 1.2, 4, 8) : new T.CylinderGeometry(0.3, 0.3, 1.8, 10), new T.MeshStandardMaterial({ color: p.color || "#67e8f9" }));
        m.position.y = 0.9; g.add(m); r = { root: g, updateAnimation() {} };
      }
      this.view.padFrame.add(r.root);
      this.rigs[id] = r;
      return r;
    }
    _dropRig(id) { const r = this.rigs[id]; if (r && r.root.parent) r.root.parent.remove(r.root); delete this.rigs[id]; }
    _remoteMoved(d) {
      if (!d || !d.id || !Array.isArray(d.pos)) return;
      const r = this.remote[d.id] || (this.remote[d.id] = { pos: d.pos.slice(), yaw: d.yaw || 0 });
      r.target = d.pos.slice(); r.targetYaw = +d.yaw || 0; r.moving = d.moving === 2 ? 2 : !!d.moving; r.at = performance.now();
      if (d.emote) { const rig = this.rigs[d.id]; if (rig && rig.playEmote) rig.playEmote(d.emote); }
    }

    // crew expressions from remote-main's astronaut rig (wave, salute, dance, laugh, look, roger): keys 1–6
    emote(i) {
      const defs = window.ASTRONAUT_EMOTES || [], def = defs[i]; if (!def || !this.active) return null;
      const rig = this.rigs[this.net.socketId]; if (rig && rig.playEmote) rig.playEmote(def.id);
      this.pendingEmote = def.id; this._sendPos(true);
      return def;
    }
    // ---- site tour (remote-main "Space Center 2" ground tour): walk the whole KSC site at ground level,
    // 1–6 fast-travel between the six sectors, T back to the gantry. Boarding only happens from the gantry.
    _tourSpawns() { return (window.SpaceCenterModules && window.SpaceCenterModules.SITE_TOUR_SPAWNS) || []; }
    tourGo(i) {
      const sp = this._tourSpawns()[i]; if (!sp || !this.active) return null;
      this.tour = i; this.pos = [sp.x, 50, sp.z];
      const g0 = this._groundAt(sp.x, sp.z, 50); this.pos[1] = (g0 === null ? 0 : g0) + 0.02; this.yaw = sp.yaw; this.camYaw = sp.yaw; this.camPitch = -(sp.pitch || 0.04) * 0.5;
      this._sendPos(true);
      return sp.label;
    }
    toggleTour() {
      if (!this.active) return null;
      if (this.tour === null) return this.tourGo(0);
      const players = this._players(), idx = Math.max(0, players.findIndex((p) => p.id === this.net.socketId)), sp = L.spawn(idx);
      this.tour = null; this.pos = sp.pos.slice(); this.yaw = sp.yaw; this.camYaw = sp.yaw; this.camPitch = -0.12;
      this._sendPos(true);
      return "Back on the gantry";
    }
    _tourFloor(x, z) {
      const C = window.SpaceCenterModules && window.SpaceCenterModules.constants, b = (C && C.SITE_BOUNDS) || { minX: -1050, maxX: 525, minZ: -850, maxZ: 850 };
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return null;
      const site = this.view.ksc && this.view.ksc.sc.site, r = 0.45;
      if (Math.hypot(x, z) < 76 + r) return null;                                  // LC-39A pad mound (stack, tower, deluge)
      for (const q of (site && site.boxColliders) || []) if (x > q.minX - r && x < q.maxX + r && z > q.minZ - r && z < q.maxZ + r) return null;
      for (const c of (site && site.circleColliders) || []) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return null;
      // follow the ground (roads, ramps and slabs are raised): ray down from just above the feet; steps up
      // to 0.6 m are climbed, anything taller is a wall
      const yRef = this.pos ? this.pos[1] : 0.2, g = this._groundAt(x, z, yRef + 1.2);
      if (g === null) return 0.2;
      if (g > yRef + 0.6) return null;
      return g + 0.02;
    }
    _groundAt(x, z, fromY) {
      const T = window.THREE, ksc = this.view.ksc; if (!ksc) return null;
      if (!this._rayList) {
        this._rayList = []; this._rc = new T.Raycaster();
        ksc.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible && !(this.view.padFrame && isDescendant(o, this.view.padFrame))) this._rayList.push(o); });
      }
      ksc.group.updateMatrixWorld(true);
      const o = ksc.group.localToWorld(new T.Vector3(x, fromY, z)), d = ksc.group.localToWorld(new T.Vector3(x, fromY - 1, z)).sub(o).normalize();
      this._rc.set(o, d); this._rc.far = 60;
      const h = this._rc.intersectObjects(this._rayList, false);
      return h.length ? ksc.group.worldToLocal(h[0].point.clone()).y : null;
    }
    look(dx, dy) { this.camYaw -= dx * 0.006; this.camPitch = Math.max(-1.1, Math.min(0.65, this.camPitch - dy * 0.005)); }
    zoom(f) { this.dist = Math.max(1.6, Math.min(12, this.dist * f)); }

    _sendPos(force) {
      const now = performance.now();
      if (!force && now - this.lastSend < 1000 / SEND_HZ) return;
      this.lastSend = now;
      if (this.net.sendPadPos) this.net.sendPadPos(this.pos.map((v) => Math.round(v * 100) / 100), Math.round(this.yaw * 1000) / 1000, this.moving ? (this.running ? 2 : 1) : 0, this.pendingEmote || null);
      this.pendingEmote = null;
    }
    async _action(type) {
      if (this.pending) return;
      this.pending = type;
      try {
        this._sendPos(true);
        const r = await this.net.padAction(type, this.pos.slice());
        this.lastReject = r && !r.accepted ? r.reason : null;
      } finally { setTimeout(() => { this.pending = null; }, 600); }
    }

    /** Per frame while walking. keys: KeyboardEvent.code map. Returns the state the HUD shows. */
    update(dt, sn, keys) {
      if (!this.active) return null;
      dt = Math.min(dt, 0.1);
      const pad = sn.pad || { arm: false, aboard: [] }, me = this.net.socketId, aboard = new Set(pad.aboard || []);
      const ksc = this.view.ksc;
      ksc.setArmExtended(!!pad.arm);
      const armOK = ksc.armReady();
      // ---- local movement (camera-relative WASD, Shift runs)
      const k = keys || {};
      const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      const strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      const runKey = !!(k.ShiftLeft || k.ShiftRight), sp = runKey ? RUN : WALK;
      const sY = Math.sin(this.camYaw), cY = Math.cos(this.camYaw);
      let dx = fwd * sY - strafe * cY, dz = fwd * cY + strafe * sY;
      const len = Math.hypot(dx, dz);
      let moved = false;
      if (len > 1e-3) {
        dx = dx / len * sp * dt; dz = dz / len * sp * dt;
        let d = Math.atan2(dx, dz) - this.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        this.yaw += d * Math.min(1, dt * 12);
        // slide along edges: full move, else each axis on its own
        const tryAt = (x, z) => { const y = this.tour !== null ? this._tourFloor(x, z) : L.floorAt([x, 0, z], ksc.armAngle); return y === null ? null : [x, y, z]; };
        const next = tryAt(this.pos[0] + dx, this.pos[2] + dz) || tryAt(this.pos[0] + dx, this.pos[2]) || tryAt(this.pos[0], this.pos[2] + dz);
        if (next) { moved = Math.hypot(next[0] - this.pos[0], next[2] - this.pos[2]) > 1e-4; this.pos = next; }
      }
      this.moving = moved; this.running = moved && runKey;
      // ---- rigs: me + everyone still walking
      const players = this._players(), present = new Set();
      for (const p of players) {
        if (aboard.has(p.id)) continue;
        present.add(p.id);
        const rig = this._rig(p.id, p);
        if (p.id === me) {
          rig.root.position.set(this.pos[0], this.pos[1], this.pos[2]); rig.root.rotation.y = this.yaw;
          rig.updateAnimation(this.running ? dt * RUN_ANIM : dt, moved);
        } else {
          const r = this.remote[p.id];
          if (!r) { rig.root.visible = false; continue; }
          rig.root.visible = true;
          const a = 1 - Math.exp(-dt * 10);
          if (r.target) for (let i = 0; i < 3; i++) r.pos[i] += (r.target[i] - r.pos[i]) * a;
          let d = (r.targetYaw || 0) - r.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; r.yaw += d * a;
          rig.root.position.set(r.pos[0], r.pos[1], r.pos[2]); rig.root.rotation.y = r.yaw;
          const live = !!r.moving && performance.now() - r.at < 400;
          rig.updateAnimation(live && r.moving === 2 ? dt * RUN_ANIM : dt, live);
        }
      }
      for (const id of Object.keys(this.rigs)) if (!present.has(id)) this._dropRig(id);
      // ---- boarding triggers (the server validates both)
      const atConsole = this.tour === null && L.nearConsole(this.pos), atHatch = this.tour === null && L.nearHatch(this.pos);
      if (atConsole && !pad.arm) this._action("ARM");
      if (atHatch && armOK && !aboard.has(me)) this._action("BOARD");
      this._sendPos(false);
      // ---- camera (remote-main third person: behind the head, pitch orbits around it)
      const head = [this.pos[0], this.pos[1] + 1.48, this.pos[2]];
      const h = Math.cos(this.camPitch) * this.dist, vy = -Math.sin(this.camPitch) * this.dist;
      const sy2 = Math.sin(this.camYaw), cy2 = Math.cos(this.camYaw);
      const eye = [head[0] - sy2 * h, Math.max(this.pos[1] + 0.35, head[1] + 0.25 + vy), head[2] - cy2 * h];
      this.view.walkCam = { eye, look: [head[0] + sy2 * 2.5, head[1] + Math.sin(this.camPitch) * 2.5, head[2] + cy2 * 2.5] };
      this.view.kscMarkers = { arm: !pad.arm, hatch: !!pad.arm };
      // ---- proximity voice: distance between astronauts on the gantry; crew already aboard speak from the cabin
      if (window.voiceManager && window.voiceManager.updateProximity) {
        const map = {};
        for (const p of players) {
          if (p.id === me) continue;
          if (aboard.has(p.id)) map[p.id] = { curPos: CABIN };
          else if (this.remote[p.id]) map[p.id] = { curPos: this.remote[p.id].pos };
        }
        window.voiceManager.updateProximity({ x: this.pos[0], y: this.pos[1], z: this.pos[2] }, this.yaw, map);
      }
      const walking = players.filter((p) => !aboard.has(p.id));
      const tsp = this.tour !== null ? this._tourSpawns()[this.tour] : null;
      return { tour: tsp ? tsp.label : null, emotes: (window.ASTRONAUT_EMOTES || []).slice(0, 6).map((e) => e.label), step: !pad.arm ? "arm" : (armOK ? "hatch" : "swing"), atConsole, atHatch, walking: walking.map((p) => p.name), aboard: players.filter((p) => aboard.has(p.id)).map((p) => p.name), reject: this.lastReject };
    }
  }
  window.PadWalk = PadWalk;
})();
