/*
 * deploy_view.js — Three.js view of the CubeSat deployment from the ISS (DeployCore state → picture).
 *
 * Near pass in metres in the ISS model frame (team GLB: +X port, +Y zenith, +Z velocity), far pass in
 * kilometres for the Earth below, both from the same camera orientation. Draws the JEM airlock hatch and
 * slide table, the MPEP with the J-SSOD, the JEMRMS (two-boom IK; the GLB's own stowed arm is hidden),
 * the 3U CubeSat, the planned and current deploy axes and the predicted relative path.
 * Never decides anything: all state comes from the server snapshot.
 */
(function () {
  "use strict";
  const T = window.THREE, D = window.DeployCore, Sim = window.ShuttleSim;
  const V = (a) => new T.Vector3(a[0], a[1], a[2]);
  const COL = { ink: 0xede8dd, dim: 0x8e897f, blue: 0x5cc2ec, live: 0x7cf0c0, rose: 0xc9576a, amber: 0xffb347, yellow: 0xffd21a };

  function mat(color, o) { return new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.35 }, o || {})); }
  function cyl(r, len, m) { const g = new T.CylinderGeometry(r, r, 1, 18); const mesh = new T.Mesh(g, m); mesh.userData.len = len; return mesh; }
  /** place a unit-height cylinder between points a and b */
  function span(mesh, a, b) {
    const d = new T.Vector3().subVectors(b, a), L = d.length();
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.scale.set(1, Math.max(L, 1e-3), 1);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  }
  function lineObj(color, opacity, dashed) {
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(new Float32Array(6), 3));
    const m = dashed ? new T.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity }) : new T.LineBasicMaterial({ color, transparent: true, opacity });
    const l = new T.Line(g, m); l.frustumCulled = false; return l;
  }
  function setLine(l, pts) {
    const arr = new Float32Array(pts.length * 3); pts.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
    l.geometry.dispose(); l.geometry = new T.BufferGeometry(); l.geometry.setAttribute("position", new T.BufferAttribute(arr, 3));
    if (l.material.isLineDashedMaterial) l.computeLineDistances();
  }

  class DeployView {
    constructor(renderer) {
      this.renderer = renderer; this.disposed = false;
      this.far = new T.Scene(); this.near = new T.Scene();
      const a = window.innerWidth / window.innerHeight;
      this.farCam = new T.PerspectiveCamera(50, a, 0.5, 2e6);
      this.cam = new T.PerspectiveCamera(50, a, 0.05, 80000);
      this.camMode = "auto"; this.autoMode = "overview";
      this.orbit = { yaw: 0.8, pitch: 0.32, dist: 26, focus: V(D.G.hatch) };
      this.status = { iss: "loading", cubesat: "loading" };
      this._build();
      this._onResize = () => this.resize(); window.addEventListener("resize", this._onResize); this.resize();
    }

    _build() {
      // ---- far: Earth + stars (km)
      this.globe = window.EarthGlobe.create(this.renderer, { cloudOpacity: 0.7 });
      this.earthPivot = new T.Group(); this.earthPivot.add(this.globe.earth); this.far.add(this.earthPivot);
      const g = new T.BufferGeometry(), n = 2500, pos = new Float32Array(n * 3);
      let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); pos.set([9e5 * s * Math.cos(th), 9e5 * u, 9e5 * s * Math.sin(th)], i * 3); }
      g.setAttribute("position", new T.BufferAttribute(pos, 3));
      this.stars = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false })); this.far.add(this.stars);
      this.farSun = new T.DirectionalLight(0xffffff, 1.35); this.far.add(this.farSun, this.farSun.target); this.far.add(new T.AmbientLight(0x223344, 0.4));
      // ---- near: ISS (m)
      this.sun = new T.DirectionalLight(0xfff6e8, 1.9); this.near.add(this.sun, this.sun.target);
      this.earthshine = new T.HemisphereLight(0x10141c, 0x2a4a78, 0.55); this.near.add(this.earthshine);   // blue light from the Earth below
      this.iss = new T.Group(); this.near.add(this.iss);
      const gm = window.glbManager, url = "models/iss/ISS_stationary_opt.glb";
      const issFallback = () => { this.status.iss = "placeholder"; const m = mat(0xd8dde3); const k = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 11, 20), m); k.rotation.z = Math.PI / 2; k.position.set(7.8, 0, 16.2); this.iss.add(k); const ef = new T.Mesh(new T.BoxGeometry(7.5, 1.6, 5), mat(0x9aa0a8)); ef.position.set(17.2, -1.6, 16.2); this.iss.add(ef); };
      if (gm) gm.loadGLB(url).then(() => {
        if (this.disposed) return;
        const inst = gm.instantiateModel(url, { castShadow: false, receiveShadow: false });
        inst.traverse((o) => { if (/robotic_?arm/i.test(o.name || "")) o.visible = false; });   // replaced by the animated JEMRMS
        this.iss.add(inst); this.status.iss = "ok";
      }).catch(issFallback); else issFallback();
      // ---- JEM airlock outer hatch (on the Kibo PM port endcone) + slide table
      const G = D.G, white = mat(0xe8e6df), grey = mat(0x8c939b), dark = mat(0x2b3036, { metalness: 0.5 }), gold = mat(0xc9a64a, { metalness: 0.8, roughness: 0.3 });
      this.hatchFrame = new T.Mesh(new T.BoxGeometry(0.08, 0.95, 0.95), dark); this.hatchFrame.position.set(G.hatch[0] - 0.02, G.hatch[1], G.hatch[2]); this.near.add(this.hatchFrame);
      this.hatchDoor = new T.Group(); this.hatchDoor.position.set(G.hatch[0] + 0.03, G.hatch[1] + 0.42, G.hatch[2]);
      const door = new T.Mesh(new T.BoxGeometry(0.06, 0.84, 0.84), white); door.position.set(0, -0.42, 0); this.hatchDoor.add(door); this.near.add(this.hatchDoor);
      this.table = new T.Group(); this.near.add(this.table);
      const plate = new T.Mesh(new T.BoxGeometry(0.9, 0.05, 0.62), grey); plate.position.y = -0.22; this.table.add(plate);
      for (const z of [-0.3, 0.3]) { const r = new T.Mesh(new T.BoxGeometry(1.6, 0.04, 0.04), dark); r.position.set(-0.55, -0.26, z); this.table.add(r); }
      // ---- MPEP + J-SSOD (payload frame: deploy axis +X, grapple fixture +Y)
      this.payload = new T.Group(); this.near.add(this.payload);
      const mp = new T.Mesh(new T.BoxGeometry(0.80, 0.06, 0.58), white); mp.position.y = -0.17; this.payload.add(mp);
      const truss = new T.Mesh(new T.BoxGeometry(0.5, 0.18, 0.4), grey); truss.position.y = -0.05; this.payload.add(truss);
      this.jssod = new T.Mesh(new T.BoxGeometry(0.42, 0.16, 0.30), white); this.jssod.position.set(0.09, 0.17, 0); this.payload.add(this.jssod);
      const label = new T.Mesh(new T.BoxGeometry(0.30, 0.005, 0.12), mat(0xc9576a)); label.position.set(0.08, 0.252, 0.06); this.payload.add(label);
      this.door = new T.Group(); this.door.position.set(0.30, 0.25, 0);   // hinge on the top edge of the exit face
      const dd = new T.Mesh(new T.BoxGeometry(0.01, 0.15, 0.28), gold); dd.position.set(0.005, -0.075, 0); this.door.add(dd); this.payload.add(this.door);
      const fx = new T.Mesh(new T.CylinderGeometry(0.06, 0.08, 0.10, 16), dark); fx.position.set(0, 0.33, 0); this.payload.add(fx);   // grapple fixture
      const pin = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.14, 8), gold); pin.position.set(0, 0.40, 0); this.payload.add(pin);
      const tgt = new T.Mesh(new T.BoxGeometry(0.16, 0.004, 0.02), mat(0x111111)); tgt.position.set(0, 0.385, -0.12); this.payload.add(tgt);   // camera target bar
      // ---- JEMRMS
      this.arm = { boom1: cyl(0.17, 1, white), boom2: cyl(0.15, 1, white), wrist: cyl(0.12, 1, white), ee: new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 1, 20), mat(0xe8e6df)),
                   sh: new T.Mesh(new T.SphereGeometry(0.26, 16, 12), grey), el: new T.Mesh(new T.SphereGeometry(0.22, 16, 12), grey), wr: new T.Mesh(new T.SphereGeometry(0.18, 16, 12), grey) };
      for (const k of Object.keys(this.arm)) this.near.add(this.arm[k]);
      // ---- CubeSat (true size, GLB)
      this.cubesat = new T.Group(); this.near.add(this.cubesat); this.cubesatParts = {};
      const csUrl = "assets/cubesat_3u.glb";
      const csFallback = () => { this.status.cubesat = "fallback"; this.cubesat.add(new T.Mesh(new T.BoxGeometry(0.1, 0.34, 0.1), mat(0x1a2140))); };
      if (gm) gm.loadGLB(csUrl).then(() => {
        if (this.disposed) return;
        const inst = gm.instantiateModel(csUrl, { castShadow: false, receiveShadow: false });
        inst.traverse((o) => { const nm = o.name || ""; if (/Antennas|SolarCells|WingBacks/.test(nm)) this.cubesatParts[nm] = o; });
        this.cubesat.add(inst); this.status.cubesat = "ok";
      }).catch(csFallback); else csFallback();
      this.satDot = new T.Sprite(new T.SpriteMaterial({ color: COL.yellow, sizeAttenuation: false, depthTest: false, transparent: true, map: this._ringTex() }));
      this.satDot.scale.set(0.028, 0.028, 1); this.satDot.renderOrder = 10; this.near.add(this.satDot);
      // ---- guidance lines
      this.axisLine = lineObj(COL.ink, 0.9); this.planLine = lineObj(COL.blue, 0.9, true); this.pathLine = lineObj(COL.yellow, 0.85);
      this.orbitLine = lineObj(COL.ink, 0.55); this.earthPivot.add(this.orbitLine);
      this.orbitArc = lineObj(COL.ink, 0.85);
      this.near.add(this.axisLine, this.planLine, this.pathLine, this.orbitArc);
      this.hitDot = new T.Mesh(new T.SphereGeometry(0.25, 12, 8), new T.MeshBasicMaterial({ color: COL.rose })); this.hitDot.visible = false; this.near.add(this.hitDot);
    }
    _ringTex() {
      const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
      g.strokeStyle = "#fff"; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
      return new T.CanvasTexture(c);
    }

    // ------------------------------------------------------------------ per frame
    /** st: (interpolated) snapshot, assess: last assessment or null, me: { rmsMine } */
    update(st, assess, dt) {
      const f = D.frame(st, st.t), ps = D.pose(st);
      this._ps = ps; this._st = st;
      // Earth: model = M · eci, M rows = [ĥ; r̂; v̂]; the globe's render frame is (x, z, -y) of ECI
      const M = [f.hh, f.rh, f.vh], A = new T.Matrix4();
      // A = M · Q, Q maps render (x, y, z) -> eci (x, -z, y)
      A.set(M[0][0], M[0][2], -M[0][1], 0, M[1][0], M[1][2], -M[1][1], 0, M[2][0], M[2][2], -M[2][1], 0, 0, 0, 0, 1);
      this.earthPivot.quaternion.setFromRotationMatrix(A);
      this.globe.earth.rotation.set(0, f.theta, 0);
      this.globe.clouds.rotation.y = st.t * 2e-6;
      const sunM = V(D.eciToModel(f, f.sun)).normalize();
      // camera
      this._camera(st, ps, dt);
      const camKm = this.cam.position.clone().multiplyScalar(0.001);
      this.earthPivot.position.set(0, -f.a / 1000, 0).sub(camKm);
      this.farCam.position.set(0, 0, 0); this.farCam.quaternion.copy(this.cam.quaternion);
      this.farSun.position.copy(sunM.clone().multiplyScalar(1e5)); this.farSun.target.position.set(0, 0, 0);
      this.farCam.updateMatrixWorld();
      this.globe.setSunView(sunM.clone().applyQuaternion(this.farCam.quaternion.clone().invert()));
      // Earth shadow on the ISS: sunlit unless the Sun is behind the Earth
      const sd = sunM.y, lit = !(sd < 0 && Math.sqrt(1 - sd * sd) * f.a < 6371e3 + 30e3);
      this.sun.intensity = lit ? 1.9 : 0.0; this.sun.position.copy(sunM.clone().multiplyScalar(200).add(V(D.G.hatch))); this.sun.target.position.copy(V(D.G.hatch));
      this.earthshine.intensity = lit ? 0.55 : 0.18; this.lit = lit;
      // hatch + table
      this.hatchDoor.rotation.z = -st.al.outer * 1.9;
      const tableCentre = V(D.G.tableIn).lerp(V(D.G.tableOut), st.al.table);
      this.table.position.copy(tableCentre); this.table.visible = true;
      // payload
      const m4 = new T.Matrix4(); const R = ps.R;
      m4.set(R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, 0, 0, 0, 1);
      this.payload.quaternion.setFromRotationMatrix(m4); this.payload.position.copy(V(ps.mpep));
      this.payload.visible = true;
      this.door.rotation.z = -st.sat.door * 1.7;
      // JEMRMS
      const a = ps.arm, S = V(a.shoulder), E = V(a.elbow), W = V(a.wrist), EE = V(ps.ee);
      span(this.arm.boom1, S, E); span(this.arm.boom2, E, W); span(this.arm.wrist, W, EE.clone().addScaledVector(V(ps.eeDir), -0.16));
      this.arm.sh.position.copy(S); this.arm.el.position.copy(E); this.arm.wr.position.copy(W);
      span(this.arm.ee, EE.clone().addScaledVector(V(ps.eeDir), -0.32), EE); this.arm.ee.scale.x = this.arm.ee.scale.z = 1;
      this.arm.ee.rotateY((ps.eeRollDeg || 0) * Math.PI / 180);
      // CubeSat: long axis (+Y) along the deploy axis, then tip-off tumble
      const axis = V(ps.axis).normalize();
      this.cubesat.position.copy(V(ps.sat));
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), axis);
      if (st.sat.released) {
        // Constant body-rate rotation uses one rotation vector, avoiding compounded Euler-axis tumble.
        const rotation = V(ps.satRot), angle = rotation.length();
        if (angle > 0) q.multiply(new T.Quaternion().setFromAxisAngle(rotation.normalize(), angle * Math.PI / 180));
      }
      this.cubesat.quaternion.copy(q);
      this.cubesat.visible = st.sat.released || st.sat.door > 0.3;
      for (const o of Object.values(this.cubesatParts)) o.visible = !!st.sat.antennas;   // deployables wait for the 30-min inhibit
      this.satDot.position.copy(this.cubesat.position); this.satDot.visible = st.sat.released && this.cam.position.distanceTo(this.cubesat.position) > 25;
      // Earth-centred orbit includes the ISS's inherited ~7.7 km/s velocity and LVLH frame rotation.
      this.orbitLine.visible = this.orbitArc.visible = st.sat.released;
      if (st.sat.released) {
        const state = D.inertialState(st, st.t, st.sat.p, st.sat.v);
        if (this._orbitAt === undefined || Math.abs(st.t - this._orbitAt) >= 10) {
          this._orbitAt = st.t;
          const orbit = Sim.elements(state.r, state.v), pts = [];
          for (let i = 0; i <= 384; i++) {
            const p = Sim.keplerPropagate(state.r, state.v, orbit.period * i / 384).r;
            pts.push(new T.Vector3(p[0] / 1000, p[2] / 1000, -p[1] / 1000));
          }
          setLine(this.orbitLine, pts);
        }
        // Fine near-camera samples bridge the far pass's 500 m near plane through the CubeSat.
        const pts = [];
        for (let t = -12; t <= 12; t += 0.5) {
          const p = Sim.keplerPropagate(state.r, state.v, t).r;
          pts.push(V(D.eciToModel(f, Sim.vec.sub(p, f.r))));
        }
        setLine(this.orbitArc, pts);
      }
      // guidance: current axis, planned axis, predicted path, line-of-fire hit
      const showG = st.phase === "point" || st.phase === "move" && st.arm.move > 0.95;
      this.axisLine.visible = this.planLine.visible = showG; this.pathLine.visible = showG && !!assess;
      if (showG) {
        const ex = V(ps.exit), plan = V(D.axisOf(D.P.plan.azDeg, D.P.plan.elDeg));
        setLine(this.axisLine, [ex, ex.clone().addScaledVector(axis, 40)]);
        setLine(this.planLine, [ex, ex.clone().addScaledVector(plan, 40)]);
        if (assess && assess.pr && assess.pr.plot && this._plotRev !== assess._rev) {
          this._plotRev = assess._rev;
          const pts = [ex]; for (const p of assess.pr.plot) { if (pts.length > 140) break; pts.push(new T.Vector3(p[2], p[1], p[0])); }
          setLine(this.pathLine, pts);
          this.pathLine.material.color.setHex(assess.safe ? COL.yellow : COL.rose);
        }
        const hit = assess && assess.lof && assess.lof.hit;
        this.hitDot.visible = !!hit; if (hit) this.hitDot.position.copy(ex.clone().addScaledVector(axis, hit.dist));
      } else this.hitDot.visible = false;
    }

    // ------------------------------------------------------------------ cameras
    modeFor(st) {
      if (this.camMode !== "auto") return this.camMode;
      if (st.phase === "grapple") return "ee";
      if (st.phase === "point") return "deployer";
      if (st.phase === "release") return "deployer";
      if (st.phase === "drift" || st.phase === "done") return "follow";
      return "overview";
    }
    cycleCamera() {
      const order = ["auto", "overview", "ee", "deployer", "follow", "station"];
      this.camMode = order[(order.indexOf(this.camMode) + 1) % order.length];
      return this.camMode;
    }
    orbitCamera(dyaw, dpitch) { this.orbit.yaw += dyaw; this.orbit.pitch = Math.max(-1.4, Math.min(1.4, this.orbit.pitch + dpitch)); this._userLook = performance.now(); }
    zoomCamera(k) { this.orbit.dist = Math.max(1.5, Math.min(6000, this.orbit.dist * k)); this._userLook = performance.now(); }
    _orbitEye(focus, dist) {
      const o = this.orbit, c = Math.cos(o.pitch);
      return focus.clone().add(new T.Vector3(Math.sin(o.yaw) * c, Math.sin(o.pitch), Math.cos(o.yaw) * c).multiplyScalar(dist));
    }
    _camera(st, ps, dt) {
      const mode = this.modeFor(st), cam = this.cam; this.activeMode = mode;
      cam.up.set(0, 1, 0);
      if (mode === "ee") {
        // end-effector camera: at the EE, looking along the approach axis, image "up" = +Z (forward)
        const ee = V(ps.ee), dir = V(ps.eeDir).normalize();
        cam.position.copy(ee).addScaledVector(dir, -0.05);
        cam.up.set(0, 0, 1); if (Math.abs(dir.z) > 0.9) cam.up.set(0, 1, 0);
        const roll = (ps.eeRollDeg || 0) * Math.PI / 180; cam.up.applyAxisAngle(dir, roll);
        cam.lookAt(ee.clone().add(dir)); cam.fov = 55; cam.near = 0.02; cam.updateProjectionMatrix(); return;
      }
      if (cam.fov !== 50 || cam.near !== 0.05) { cam.fov = 50; cam.near = 0.05; cam.updateProjectionMatrix(); }
      if (mode === "deployer") {
        const ex = V(ps.exit), ax = V(ps.axis).normalize();
        const side = new T.Vector3().crossVectors(ax, new T.Vector3(0, 1, 0)); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
        const base = ex.clone().addScaledVector(ax, -2.2).add(new T.Vector3(0, 0.9, 0)).addScaledVector(side, 0.9);
        const k = Math.min(1, dt * 3); this._dep = this._dep ? this._dep.lerp(base, k) : base.clone();
        if (st.sat.released) { const s = V(ps.sat); cam.position.copy(this._dep); cam.lookAt(s.distanceTo(ex) < 30 ? s : ex.clone().addScaledVector(ax, 12)); return; }
        cam.position.copy(this._dep); cam.lookAt(ex.clone().addScaledVector(ax, 12)); return;
      }
      if (mode === "follow") {
        const s = V(ps.sat), d = Math.max(1.2, Math.min(4000, this.orbit.dist * 0.12));
        const eye = this._orbitEye(s, d); cam.position.copy(eye); cam.lookAt(s); return;
      }
      if (mode === "station") {
        // from the CubeSat looking back at the ISS
        const s = V(ps.sat), toIss = s.clone().negate().normalize();
        cam.position.copy(s).addScaledVector(toIss, -1.5).add(new T.Vector3(0, 0.4, 0)); cam.lookAt(0, 0, 10); return;
      }
      // overview: orbit around a phase-dependent focus
      const focus = st.phase === "move" || st.phase === "point" ? V(D.G.deployFixture).lerp(V(D.G.hatch), 0.4) : V(D.G.hatch).add(new T.Vector3(1.2, 0, 0));
      this.orbit.focus.lerp(focus, Math.min(1, dt * 2));
      cam.position.copy(this._orbitEye(this.orbit.focus, this.orbit.dist)); cam.lookAt(this.orbit.focus);
    }

    /** Screen position (px) of a model-frame point, or null when behind the camera. */
    screen(p) { const v = V(p).project(this.cam); if (v.z > 1) return null; return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight }; }

    resize() {
      const w = window.innerWidth, h = window.innerHeight, a = w / h;
      for (const c of [this.cam, this.farCam]) { c.aspect = a; c.updateProjectionMatrix(); }
    }
    render() {
      const r = this.renderer; r.autoClear = false; r.setClearColor(0x000000, 1); r.clear();
      r.render(this.far, this.farCam); r.clearDepth(); r.render(this.near, this.cam);
      r.autoClear = true;
    }
    dispose() {
      this.disposed = true; window.removeEventListener("resize", this._onResize);
      this.globe.dispose();
      const free = (root) => root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map && !this.iss.children.includes(o)) m.map.dispose(); m.dispose(); }); } });
      free(this.far);
      // the ISS / CubeSat GLB instances share cached geometry with glbManager: only drop our own meshes
      [this.payload, this.table, this.hatchDoor, this.hatchFrame, this.axisLine, this.planLine, this.pathLine, this.orbitArc, this.hitDot, this.satDot, ...Object.values(this.arm)].forEach((o) => free(o));
    }
  }
  window.DeployView = DeployView;
})();
