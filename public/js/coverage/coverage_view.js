/*
 * coverage_view.js — Three.js globe view for the CubeSat Contact Coverage mission.
 *
 * Reads the scenario, propagator and forecast from CoverageCore; never decides results. Two passes:
 * "far" in kilometres with a camera-relative origin (Earth, orbit ring, ground track, stations,
 * contact lines, satellite marker) and "near" in metres (the true-size 3U CubeSat for the close view).
 * Render mapping (x, z, -y) like the Shuttle view; Earth rotation.y = GMST(UTC).
 */
(function () {
  "use strict";
  const T = window.THREE, C = window.CoverageCore;
  const toR = (v) => new T.Vector3(v[0], v[2], -v[1]);
  const COL = { ink: 0xede8dd, dim: 0x8e897f, blue: 0x5cc2ec, live: 0x7cf0c0, rose: 0xc9576a, track: 0xffd21a, pin: 0xffb347 };
  // stations in view → track colour (same scale as the HUD legend): 0 rose, 1 blue, 2 green, 3+ yellow
  const COUNT_COL = [new T.Color(0xc9576a), new T.Color(0x5cc2ec), new T.Color(0x7cf0c0), new T.Color(0xffd21a)];
  const countColor = (n) => COUNT_COL[Math.min(3, n)];

  function dotSprite(color, sizePx, ring) {
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    if (ring) { g.strokeStyle = "#fff"; g.lineWidth = 7; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke(); }
    else { const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.35, "rgba(255,255,255,0.9)"); grd.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); }
    const m = new T.SpriteMaterial({ map: new T.CanvasTexture(c), color, depthWrite: false, transparent: true, sizeAttenuation: false });
    const s = new T.Sprite(m); s.scale.set(sizePx, sizePx, 1); return s;
  }

  class CoverageView {
    constructor(renderer) {
      this.renderer = renderer;
      this.far = new T.Scene(); this.near = new T.Scene();
      const aspect = window.innerWidth / window.innerHeight;
      this.farCam = new T.PerspectiveCamera(45, aspect, 1, 2e6);
      this.nearCam = new T.PerspectiveCamera(45, aspect, 0.01, 2000);
      this.mode = "globe";            // globe | follow | close
      this.earthLock = false;         // camera turns with Earth (stations stay put on screen)
      this.orbit = { yaw: 0.6, pitch: 0.35, dist: 22000 };
      this.disposed = false;
      this._build();
      this._onResize = () => this.resize(); window.addEventListener("resize", this._onResize);
    }

    _build() {
      this.globe = window.EarthGlobe.create(this.renderer, { cloudOpacity: 0.55 });
      this.earth = this.globe.earth; this.far.add(this.earth);
      const g = new T.BufferGeometry(), n = 2500, pos = new Float32Array(n * 3);
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); pos.set([9e5 * s * Math.cos(th), 9e5 * u, 9e5 * s * Math.sin(th)], i * 3); }
      g.setAttribute("position", new T.BufferAttribute(pos, 3));
      this.stars = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false }));
      this.far.add(this.stars);
      this.sun = new T.DirectionalLight(0xffffff, 1.3); this.far.add(this.sun); this.far.add(this.sun.target);
      this.far.add(new T.AmbientLight(0x334455, 0.35));
      // Earth-fixed overlay group (child of the Earth mesh: rotates with it)
      this.fixed = new T.Group(); this.earth.add(this.fixed);
      // orbit ring (ECI)
      this.ring = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 }));
      this.ring.frustumCulled = false; this.far.add(this.ring);
      // ground track: past (solid) and future (dashed), Earth-fixed
      this.trackPast = new T.Line(new T.BufferGeometry(), new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
      this.trackFut = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ vertexColors: true, dashSize: 70, gapSize: 35, transparent: true, opacity: 0.95 }));
      this.trackSpan = "orbit";   // orbit (±1 orbit around now) | window (whole prediction window)
      for (const l of [this.trackPast, this.trackFut]) { l.frustumCulled = false; this.fixed.add(l); }
      // footprint (Earth-fixed circle around the sub-satellite point)
      this.foot = new T.LineLoop(new T.BufferGeometry(), new T.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.5 }));
      this.foot.frustumCulled = false; this.fixed.add(this.foot);
      // contact lines pool (world)
      const lg = new T.BufferGeometry(); lg.setAttribute("position", new T.BufferAttribute(new Float32Array(50 * 6), 3)); lg.setDrawRange(0, 0);
      this.lines = new T.LineSegments(lg, new T.LineBasicMaterial({ color: COL.live, transparent: true, opacity: 0.95, depthTest: true }));
      this.lines.frustumCulled = false; this.far.add(this.lines);
      // satellite marker
      this.satDot = dotSprite(0xffffff, 0.02); this.far.add(this.satDot);
      this.satRing = dotSprite(COL.track, 0.035, true); this.far.add(this.satRing);
      // X / Y orbit-position markers (ECI points on the orbit at the marked times)
      this.pinSprites = [];   // pooled pin markers (ECI points on the orbit at the pinned times)
      this.hoverDot = dotSprite(0xffffff, 0.018, true); this.hoverDot.visible = false; this.far.add(this.hoverDot);
      this.stations = {};   // id -> { dot, ring, ecef }
      // near scene: CubeSat (true size, metres)
      this.near.add(new T.AmbientLight(0x667788, 0.6)); this.sunNear = new T.DirectionalLight(0xffffff, 1.6); this.near.add(this.sunNear); this.near.add(this.sunNear.target);
      this.cubesat = new T.Group(); this.near.add(this.cubesat); this.modelStatus = "loading";
      const gm = window.glbManager;
      const fallback = () => {
        const body = new T.Mesh(new T.BoxGeometry(0.1, 0.34, 0.1), new T.MeshStandardMaterial({ color: 0x1a2140, metalness: 0.4, roughness: 0.35 }));
        const wing = new T.Mesh(new T.BoxGeometry(0.09, 0.32, 0.003), new T.MeshStandardMaterial({ color: 0x0b1a40, metalness: 0.3, roughness: 0.3 }));
        const w2 = wing.clone(); wing.position.set(0.1, 0, 0.05); w2.position.set(-0.1, 0, 0.05);
        this.cubesat.add(body, wing, w2); this.modelStatus = "fallback (procedural)";
      };
      if (gm) gm.loadGLB("assets/cubesat_3u.glb").then(() => {
        if (this.disposed) return;
        const inst = gm.instantiateModel("assets/cubesat_3u.glb", { castShadow: false, receiveShadow: false });
        if (inst) { this.cubesat.add(inst); this.modelStatus = "ok"; } else fallback();
      }).catch(fallback); else fallback();
    }

    // ------------------------------------------------------------------ scenario-dependent geometry
    setScenario(scn, prop, fc) {
      this.scn = scn; this.prop = prop; this.fc = fc;
      for (const id of Object.keys(this.stations)) { const s = this.stations[id]; this.fixed.remove(s.dot); this.fixed.remove(s.ring); }
      this.stations = {};
      if (!scn) return;
      const earthModel = prop ? prop.earth : "sphere";
      for (const st of scn.stations) {
        const g = C.stationGeometry(st, earthModel);
        // draw on the 6371 km sphere at the station's latitude/longitude (display mapping only)
        const p = C.stationGeometry({ lat: st.lat, lon: st.lon, altM: 8000 }, "sphere").pos.map((v) => v / 1000);
        const dot = dotSprite(st.enabled ? COL.ink : 0x55524c, st.enabled ? 0.014 : 0.01);
        const ring = dotSprite(COL.live, 0.03, true); ring.visible = false;
        dot.position.copy(toR(p)); ring.position.copy(toR(p));
        this.fixed.add(dot); this.fixed.add(ring);
        this.stations[st.id] = { dot, ring, ecef: g.pos, drawPos: p, enabled: st.enabled, name: st.name };
      }
      this._ringKey = null; this._trackKey = null;
      const minMask = Math.min(...scn.stations.filter((s) => s.enabled).map((s) => s.maskDeg), 90);
      this.footMask = isFinite(minMask) && minMask < 90 ? minMask : 10;
    }

    _setLine(line, pts, dashed, colors) {
      const arr = new Float32Array(pts.length * 3);
      pts.forEach((p, i) => { const r = toR(p); arr[i * 3] = r.x; arr[i * 3 + 1] = r.y; arr[i * 3 + 2] = r.z; });
      line.geometry.dispose(); line.geometry = new T.BufferGeometry(); line.geometry.setAttribute("position", new T.BufferAttribute(arr, 3));
      if (colors) { const ca = new Float32Array(pts.length * 3); colors.forEach((c, i) => { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }); line.geometry.setAttribute("color", new T.BufferAttribute(ca, 3)); }
      if (dashed) line.computeLineDistances();
    }

    _rebuildRing(t) {
      const prop = this.prop, fc = this.fc; if (!prop || !fc) return;
      const key = Math.floor(t / 60);
      if (key === this._ringKey) return; this._ringKey = key;
      const ts = [], pts = [], N = 180;
      for (let i = 0; i <= N; i++) { const x = t + (i / N) * prop.period, st = prop.stateEci(x); if (st) { ts.push(x); pts.push(st.r.map((v) => v / 1000)); } }
      const cnt = C.countsAt(fc, ts.map((x) => Math.min(x, fc.validUntil)));
      this._setLine(this.ring, pts, false, cnt.map(countColor));
      this.ringSamples = ts.map((x, i) => ({ t: x, eci: pts[i] }));
    }

    _rebuildTrack(t) {
      const prop = this.prop, fc = this.fc; if (!prop || !fc) return;
      const whole = this.trackSpan === "window";
      const key = whole ? "w" + Math.floor(t / 600) : Math.floor(t / 30);
      if (key === this._trackKey) return; this._trackKey = key;
      const lift = (p) => { const r = Math.hypot(p[0], p[1], p[2]); return p.map((v) => (v / r) * 6381); };
      const H = fc.validUntil, span = Math.min(prop.period, 6000), step = whole ? 30 : 20;
      const t0 = whole ? 0 : Math.max(0, t - span), t1 = whole ? H : Math.min(H, t + span);
      const ts = []; for (let x = t0; x <= t1; x += step) ts.push(x); if (ts[ts.length - 1] < t1) ts.push(t1);
      const cnt = C.countsAt(fc, ts);
      const past = [], pastC = [], fut = [], futC = [], samples = [];
      ts.forEach((x, i) => {
        const p = prop.posEcef(x); if (!p) return;
        const q = lift(p.map((v) => v / 1000)), c = countColor(cnt[i]);
        samples.push({ t: x, ecef: q });
        if (x <= t) { past.push(q); pastC.push(c); } if (x >= t) { fut.push(q); futC.push(c); }
      });
      if (past.length && fut.length) { /* join the two lines at "now" */ }
      const nil = [[0, 0, 0], [0, 0, 0]], nilC = [COUNT_COL[0], COUNT_COL[0]];
      this._setLine(this.trackPast, past.length > 1 ? past : nil, false, past.length > 1 ? pastC : nilC);
      this._setLine(this.trackFut, fut.length > 1 ? fut : nil, true, fut.length > 1 ? futC : nilC);
      this.trackSamples = samples;
    }
    setTrackSpan(span) { this.trackSpan = span; this._trackKey = null; }

    _footprint(t) {
      const prop = this.prop, p = prop && prop.posEcef(t); if (!p) { this.foot.visible = false; return; }
      this.foot.visible = true;
      const r = Math.hypot(p[0], p[1], p[2]), lam = C.footprintAngle(r - C.R_SPHERE, this.footMask * C.D2R);
      const u = p.map((v) => v / r), a = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const e1 = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]], l1 = Math.hypot(...e1); e1.forEach((v, i) => (e1[i] = v / l1));
      const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]];
      const pts = [], R = 6378;
      for (let i = 0; i < 96; i++) { const th = (i / 96) * Math.PI * 2, c = Math.cos(lam), s = Math.sin(lam); pts.push([0, 1, 2].map((k) => R * (c * u[k] + s * (Math.cos(th) * e1[k] + Math.sin(th) * e2[k])))); }
      this._setLine(this.foot, pts);
    }

    // ------------------------------------------------------------------ per-frame
    update(t, q, opts) {
      opts = opts || {};
      const prop = this.prop;
      if (!prop || !q) return;
      const theta = prop.theta(t), utcMs = prop.epochMs + t * 1000;
      this.earth.rotation.set(0, theta, 0);
      this.globe.clouds.rotation.y = t * 1e-6;
      const sEci = prop.stateEci(t), satKm = sEci ? sEci.r.map((v) => v / 1000) : [7000, 0, 0];
      this._satKm = satKm;
      this._rebuildRing(t); this._rebuildTrack(t); this._footprint(t);
      // camera (km, ECI before the camera-relative shift)
      const camKm = this._cameraPosition(satKm, theta);
      this._camKm = camKm;
      const rel = (v) => toR([v[0] - camKm[0], v[1] - camKm[1], v[2] - camKm[2]]);
      this.earth.position.copy(rel([0, 0, 0]));
      this.earth.updateMatrixWorld(true);
      this.ring.position.copy(rel([0, 0, 0]));
      this.satDot.position.copy(rel(satKm)); this.satRing.position.copy(rel(satKm));
      this.satDot.visible = this.satRing.visible = this.mode !== "close";
      if (!this._aimed && this.mode === "globe") { this._aimed = true; this.orbit.yaw = Math.atan2(satKm[1], satKm[0]) - 0.35; this.orbit.pitch = Math.max(-0.9, Math.min(0.9, Math.asin(satKm[2] / Math.hypot(...satKm)) * 0.7 + 0.15)); }
      this.farCam.position.set(0, 0, 0);
      this.farCam.up.copy(toR([0, 0, 1]));
      this.farCam.lookAt(rel(this._lookAtKm(satKm)));
      // pins: Earth-fixed points on the ground track at the pinned times (where the satellite was / will be over the Earth)
      const pins = opts.pins || [];
      while (this.pinSprites.length < pins.length) { const sp = dotSprite(COL.pin, 0.02, true); this.fixed.add(sp); this.pinSprites.push(sp); }
      this.pinScreenPos = [];
      this.pinSprites.forEach((sp, i) => {
        const p = pins[i], e = p ? prop.posEcef(p.t) : null; sp.visible = !!e;
        if (e) { const r = Math.hypot(...e); sp.position.copy(toR(e.map((v) => (v / r) * 6390))); }
      });
      if (opts.hoverT !== null && opts.hoverT !== undefined) { const e = prop.posEcef(opts.hoverT); this.hoverDot.visible = !!e; if (e) { const r = Math.hypot(...e); this.hoverDot.position.copy(this.earth.localToWorld(toR(e.map((v) => (v / r) * 6392)))); } }
      else this.hoverDot.visible = false;
      // stations + contact lines
      const avail = new Set(q.available.map((a) => a.id));
      const lp = this.lines.geometry.attributes.position.array; let nl = 0;
      const satR = rel(satKm);
      for (const id of Object.keys(this.stations)) {
        const s = this.stations[id], on = avail.has(id);
        s.ring.visible = on;
        s.dot.material.color.setHex(!s.enabled ? 0x55524c : on ? COL.live : COL.ink);
        if (on && nl < 50) {
          const w = this.earth.localToWorld(toR(s.drawPos));
          lp.set([w.x, w.y, w.z, satR.x, satR.y, satR.z], nl * 6); nl++;
        }
      }
      this.lines.geometry.setDrawRange(0, nl * 2); this.lines.geometry.attributes.position.needsUpdate = true;
      // lighting from the Sun's true direction for this UTC (display only)
      const sun = toR(C.sunDirEci(utcMs));
      this.sun.position.copy(sun.clone().multiplyScalar(1e5).add(this.earth.position)); this.sun.target.position.copy(this.earth.position);
      this.farCam.updateMatrixWorld();
      this.globe.setSunView(sun.clone().applyQuaternion(this.farCam.quaternion.clone().invert()));
      // near scene: CubeSat at the camera-relative satellite position (metres), nadir-pointing (+Y long axis along velocity)
      if (this.mode === "close" && sEci) {
        this.nearCam.position.set(0, 0, 0); this.nearCam.quaternion.copy(this.farCam.quaternion);
        const satM = satR.clone().multiplyScalar(1000);
        this.cubesat.position.copy(satM);
        const up = toR(sEci.r).normalize(), fwd = toR(sEci.v).normalize(), side = new T.Vector3().crossVectors(fwd, up).normalize();
        const m = new T.Matrix4().makeBasis(side, fwd, up); this.cubesat.quaternion.setFromRotationMatrix(m);
        this.sunNear.position.copy(satM.clone().add(sun.clone().multiplyScalar(100))); this.sunNear.target.position.copy(satM);
        this.cubesat.visible = true;
      } else this.cubesat.visible = false;
    }

    _lookAtKm(satKm) {
      if (this.mode === "globe") return [0, 0, 0];
      if (this.mode === "follow") return satKm.map((v) => v * 0.55);
      return satKm;
    }
    _cameraPosition(satKm, theta) {
      const o = this.orbit;
      if (this.mode === "globe") {
        const yaw = o.yaw + (this.earthLock ? theta : 0);
        return [o.dist * Math.cos(o.pitch) * Math.cos(yaw), o.dist * Math.cos(o.pitch) * Math.sin(yaw), o.dist * Math.sin(o.pitch)];
      }
      const r = Math.hypot(...satKm), up = satKm.map((v) => v / r);
      const ref = Math.abs(up[2]) < 0.95 ? [0, 0, 1] : [1, 0, 0];
      let e = [ref[1] * up[2] - ref[2] * up[1], ref[2] * up[0] - ref[0] * up[2], ref[0] * up[1] - ref[1] * up[0]]; const le = Math.hypot(...e); e = e.map((v) => v / le);
      const nn = [up[1] * e[2] - up[2] * e[1], up[2] * e[0] - up[0] * e[2], up[0] * e[1] - up[1] * e[0]];
      if (this.mode === "follow") {
        const d = Math.max(1500, Math.min(20000, o.dist * 0.25)), back = 0.6;
        return [0, 1, 2].map((k) => satKm[k] + up[k] * d + (Math.cos(o.yaw) * e[k] + Math.sin(o.yaw) * nn[k]) * d * back);
      }
      // close: a few metres from the CubeSat (km units)
      const d = Math.max(0.0006, Math.min(0.02, o.dist / 2e7));
      return [0, 1, 2].map((k) => satKm[k] + (Math.cos(o.yaw) * Math.cos(o.pitch) * e[k] + Math.sin(o.yaw) * Math.cos(o.pitch) * nn[k] + Math.sin(o.pitch) * up[k]) * d);
    }

    // ------------------------------------------------------------------ input helpers
    orbitCamera(dyaw, dpitch) { this.orbit.yaw += dyaw; this.orbit.pitch = Math.max(-1.45, Math.min(1.45, this.orbit.pitch + dpitch)); }
    zoomCamera(k) { this.orbit.dist = Math.max(7600, Math.min(120000, this.orbit.dist * k)); }
    cycleMode() { const m = ["globe", "follow", "close"]; this.mode = m[(m.indexOf(this.mode) + 1) % m.length]; this._trackKey = null; return this.mode; }
    /** Screen projection of every station (for HTML labels). Hidden when behind the Earth. */
    stationScreen() {
      const out = [], w = window.innerWidth, h = window.innerHeight, camW = new T.Vector3(0, 0, 0), ctr = this.earth.position;
      for (const id of Object.keys(this.stations)) {
        const s = this.stations[id], p = this.earth.localToWorld(toR(s.drawPos));
        const n = p.clone().sub(ctr).normalize(), toCam = camW.clone().sub(p).normalize();
        const v = p.clone().project(this.farCam);
        const vis = n.dot(toCam) > 0.02 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
        out.push({ id, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, vis });
      }
      return out;
    }
    satScreen() { const v = this.satDot.position.clone().project(this.farCam); return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, vis: v.z < 1 }; }
    /** Ray-pick latitude/longitude on the globe (for placing stations). */
    pickLatLon(clientX, clientY) {
      const ndc = new T.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
      const ray = new T.Raycaster(); ray.setFromCamera(ndc, this.farCam);
      const hit = ray.ray.intersectSphere(new T.Sphere(this.earth.position.clone(), 6371), new T.Vector3());
      if (!hit) return null;
      const local = this.earth.worldToLocal(hit.clone());   // render coords in the Earth-fixed frame: (x, z, -y)
      const ex = local.x, ey = -local.z, ez = local.y, r = Math.hypot(ex, ey, ez);
      return { lat: Math.asin(ez / r) * C.R2D, lon: Math.atan2(ey, ex) * C.R2D };
    }
    _screen(world) { const v = world.clone().project(this.farCam); return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight, ok: v.z < 1 }; }
    _frontFacing(world) { const n = world.clone().sub(this.earth.position).normalize(), toCam = world.clone().negate().normalize(); return n.dot(toCam) > 0.0; }
    /** Nearest ground-track or orbit-ring sample to the cursor (≤ maxPx). Returns a simulation time or null. */
    pickTime(clientX, clientY, maxPx) {
      maxPx = maxPx || 12; let best = null;
      const consider = (t, world, needFront) => {
        if (needFront && !this._frontFacing(world)) return;
        const s = this._screen(world); if (!s.ok) return;
        const d = Math.hypot(s.x - clientX, s.y - clientY); if (d <= maxPx && (!best || d < best.d)) best = { d, t };
      };
      for (const smp of this.trackSamples || []) consider(smp.t, this.earth.localToWorld(toR(smp.ecef)), true);
      const cam = this._camKm || [0, 0, 0];
      for (const smp of this.ringSamples || []) { const w = toR([smp.eci[0] - cam[0], smp.eci[1] - cam[1], smp.eci[2] - cam[2]]); const blocked = (() => { const c = this.earth.position, d = w.clone(), A = d.dot(d), B = -2 * c.dot(d), Cc = c.dot(c) - 6371 * 6371, disc = B * B - 4 * A * Cc; if (disc <= 0) return false; const t1 = (-B - Math.sqrt(disc)) / (2 * A); return t1 > 0 && t1 < 1; })(); if (!blocked) consider(smp.t, w, false); }
      if (!best) return null;
      // refine between neighbouring samples is unnecessary at 20–30 s spacing for a hover readout
      return best.t;
    }
    /** Nearest visible station marker to the cursor (≤ maxPx). */
    pickStation(clientX, clientY, maxPx) {
      maxPx = maxPx || 12; let best = null;
      for (const id of Object.keys(this.stations)) { const w = this.earth.localToWorld(toR(this.stations[id].drawPos)); if (!this._frontFacing(w)) continue; const s = this._screen(w); const d = Math.hypot(s.x - clientX, s.y - clientY); if (d <= maxPx && (!best || d < best.d)) best = { d, id }; }
      return best ? best.id : null;
    }
    /** Move a station marker immediately while dragging (the scenario edit follows on release). */
    previewStation(id, lat, lon) { const s = this.stations[id]; if (!s) return; s.drawPos = C.stationGeometry({ lat, lon, altM: 8000 }, "sphere").pos.map((v) => v / 1000); s.dot.position.copy(toR(s.drawPos)); s.ring.position.copy(toR(s.drawPos)); }
    pinScreen(pins) { return (pins || []).map((p, i) => { const sp = this.pinSprites[i]; if (!sp || !sp.visible) return { id: p.id, vis: false }; const w = this.earth.localToWorld(sp.position.clone()); const s = this._screen(w); return { id: p.id, x: s.x, y: s.y, vis: s.ok && this._frontFacing(w) }; }); }
    /** Test helper: true if any drawn contact line passes through the Earth sphere. */
    contactLinesClear() {
      const a = this.lines.geometry.attributes.position.array, n = this.lines.geometry.drawRange.count / 2, c = this.earth.position;
      for (let i = 0; i < n; i++) {
        const p = new T.Vector3(a[i * 6], a[i * 6 + 1], a[i * 6 + 2]), q = new T.Vector3(a[i * 6 + 3], a[i * 6 + 4], a[i * 6 + 5]);
        const d = q.clone().sub(p), f = p.clone().sub(c), A = d.dot(d), B = 2 * f.dot(d), Cc = f.dot(f) - (6371 - 1) * (6371 - 1), disc = B * B - 4 * A * Cc;
        if (disc > 0) { const t1 = (-B - Math.sqrt(disc)) / (2 * A), t2 = (-B + Math.sqrt(disc)) / (2 * A); if ((t1 > 1e-6 && t1 < 1) || (t2 > 1e-6 && t2 < 1)) return false; }
      }
      return true;
    }

    /** Shift the picture up by dy pixels so the globe sits above the HUD dock. */
    setViewOffsetY(dy) { dy = Math.round(dy || 0); if (dy === this._dy) return; this._dy = dy; this.resize(); }
    resize() {
      const w = window.innerWidth, h = window.innerHeight, a = w / h, dy = this._dy || 0;
      for (const cam of [this.farCam, this.nearCam]) { cam.aspect = a; if (dy) cam.setViewOffset(w, h, 0, dy, w, h); else cam.clearViewOffset(); cam.updateProjectionMatrix(); }
    }
    render() {
      const r = this.renderer; r.autoClear = false; r.setClearColor(0x000000, 1); r.clear();
      r.render(this.far, this.farCam);
      if (this.mode === "close") { r.clearDepth(); r.render(this.near, this.nearCam); }
      r.autoClear = true;
    }
    dispose() {
      this.disposed = true; window.removeEventListener("resize", this._onResize);
      this.globe.dispose();
      const free = (root) => root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      free(this.far);
    }
  }
  window.CoverageView = CoverageView;
})();
