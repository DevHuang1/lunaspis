/*
 * shuttle_view.js — render adapter for the solo Shuttle mission.
 *
 * Reads MissionSnapshots and one-shot mission events; maps ECI state to Three.js using the
 * right-handed mapping render = (x, z, -y) with a camera-relative origin. Two passes: a "far" scene
 * in kilometres (Earth, stars) and a "near" scene in metres (vehicles, pad, runway). The view
 * never decides mission outcomes; animations are driven by simulated state (door/gear/deploy
 * fractions), never the other way round.
 */
(function () {
  "use strict";
  const T = window.THREE;
  const S = window.ShuttleSim;
  const toR = (v) => new T.Vector3(v[0], v[2], -v[1]);
  const Q_MAP = new T.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);          // rotation X by -90°
  const qToR = (q) => Q_MAP.clone().multiply(new T.Quaternion(q[1], q[2], q[3], q[0]));
  const SUN_ECI = (() => { const a = 0.35 + (-80.6 * Math.PI / 180) + 0.55; return S.vec.unit([Math.cos(a), Math.sin(a), 0.25]); })();
  // stack geometry in the orbiter frame (from the ET/orbiter sockets in the GLBs)
  const ET_OFF = [0, -5.25, 12.4], SRB_L_OFF = [6.6, -5.25, 2.52], SRB_R_OFF = [-6.6, -5.25, 2.52];
  // The Space Center pad sits on a 12.2 m hardstand with a ~20.2 m mobile-launcher
  // deck; the Shuttle simulation puts the MLP deck at 12.8 m. Lower the borrowed
  // site by the difference so the boosters meet the launcher instead of clipping.
  const LAUNCH_SITE_OFFSET_Y = -7.4;
  // Ground-scene look while the borrowed LC-39A site is in frame: the same key
  // light direction and daylight fill the Space Center uses.
  const LAUNCH_SUN_LOCAL = (() => { const l = Math.hypot(135, 165, 115); return [135 / l, 165 / l, 115 / l]; })();
  const GROUND_SKY = 0x74aed4;          // mid-sky colour of the LC-39A sky dome
  const GROUND_FOG = 0xc4dce8;
  const GROUND_FOG_DENSITY = 0.00058;
  const GROUND_SUN_COLOR = new T.Color(0xfff3d8);
  const SPACE_SUN_COLOR = new T.Color(0xfff4e0);
  const GROUND_HEMI_SKY = new T.Color(0xb8dfff);
  const SPACE_HEMI_SKY = new T.Color(0x9ec9ff);
  const GROUND_HEMI_GROUND = new T.Color(0x526444);
  const SPACE_HEMI_GROUND = new T.Color(0x223318);
  const smooth01 = (edge0, edge1, x) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1))); return t * t * (3 - 2 * t); };

  class ShuttleView {
    constructor(renderer) {
      this.renderer = renderer;
      this.far = new T.Scene(); this.near = new T.Scene();
      const aspect = window.innerWidth / window.innerHeight;
      this.scope = { on: false, fov: 1.0 };
      this.farCam = new T.PerspectiveCamera(60, aspect, 0.5, 2e6);   // km: Earth, Moon (384,400 km), sky points
      this.nearCam = new T.PerspectiveCamera(60, aspect, 0.5, 2e7);   // m: complete Earth-scale mission route in one pass
      this.camMode = "follow"; this.camModes = ["follow", "bay", "fixed"];
      this.camPos = null; this.objs = {}; this.mixers = []; this.debrisObjs = {}; this.loaded = false; this.disposed = false;
      this.camOrbit = { yaw: 0, pitch: 0, idle: 0 }; this.zoom = 1;
      // The detailed LC-39A site is handed over by the ground game at liftoff so
      // the pad, tower, VAB and surrounding buildings stay in frame instead of
      // cutting to the simplified training pad.
      this.launchSite = null;
      this.launchSiteMount = new T.Group();
      this.launchSiteMount.name = "LC39A_DetailedLaunchSite";
      this.launchSiteMount.visible = false;
      // One continuous liftoff: carry the player's ground-camera pose into the
      // flight view, ease onto the pad vantage, then blend into the chase camera
      // as the stack clears the tower.
      this._launchCamAge = 0;
      this._handoffFov = 60;
      this.sceneFov = 60;
      this.launchSunRender = null;
      this._skyColor = new T.Color();
      this._computedSky = new T.Color();
      this._groundSky = new T.Color(GROUND_SKY);
      this._buildFar(); this._buildNear(); this._loadModels(); this._loadRoutes();
      this.near.add(this.launchSiteMount);
      this._onResize = () => this.resize();
      window.addEventListener("resize", this._onResize);
    }

    // ------------------------------------------------------------------ scene construction
    _buildFar() {
      const loader = new T.TextureLoader();
      // Team Earth texture (OrbitForge earth.glb, 5400 x 2700) with anisotropic filtering for the grazing
      // views from orbit, plus a procedural fine-detail layer that fades in within ~2500 km of the camera
      // so the ground under a low orbit is not a smear of magnified pixels.
      const aniso = this.renderer && this.renderer.capabilities ? this.renderer.capabilities.getMaxAnisotropy() : 1;
      const day = loader.load("textures/earth/earth_day_5400.jpg");
      if (T.sRGBEncoding) day.encoding = T.sRGBEncoding;
      day.anisotropy = aniso;
      // city lights on the night side (the repository's NASA-style night map), faded
      // in across a soft terminator; uSunView is the sun direction in view space, updated per frame
      const night = loader.load("textures/earth/earth_night_4096.jpg"); if (T.sRGBEncoding) night.encoding = T.sRGBEncoding; night.anisotropy = aniso;
      const earthMat = new T.MeshPhongMaterial({ map: day, specular: new T.Color(0x223344), shininess: 8, emissive: new T.Color(0xffffff), emissiveMap: night, emissiveIntensity: 1.0 });
      const detail = this._detailTexture(); detail.anisotropy = aniso;
      this.earthUniforms = null;
      earthMat.onBeforeCompile = (sh) => {
        sh.uniforms.detailMap = { value: detail }; sh.uniforms.uSunView = { value: new T.Vector3(0, 0, 1) };
        this.earthUniforms = sh.uniforms;
        sh.fragmentShader = "uniform sampler2D detailMap; uniform vec3 uSunView;\n" + sh.fragmentShader
          .replace("#include <map_fragment>", `#include <map_fragment>
          float dKm = length(vViewPosition);
          float fade = smoothstep(2500.0, 250.0, dKm);
          vec3 dt = texture2D(detailMap, vUv * vec2(900.0, 450.0)).rgb * texture2D(detailMap, vUv * vec2(170.0, 85.0)).gbr * 2.04;
          diffuseColor.rgb *= mix(vec3(1.0), dt, fade * 0.55);`)
          .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float sunlit = dot(normalize(vNormal), normalize(uSunView));
          float nightK = 1.0 - smoothstep(-0.18, 0.08, sunlit);
          totalEmissiveRadiance = max(totalEmissiveRadiance - vec3(0.045), 0.0) * 1.25 * nightK * (0.9 + 0.5 * fade);   // drop the map's faint blue land base`);
      };
      const earth = new T.Mesh(new T.SphereGeometry(6371, 160, 96), earthMat);
      this.earth = earth; this.far.add(earth);
      // thin limb glow (view-dependent, additive) instead of a flat translucent shell
      const atmo = new T.Mesh(new T.SphereGeometry(6371 * 1.012, 96, 64), new T.ShaderMaterial({
        uniforms: { c: { value: new T.Color(0x4f9bff) } }, side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
        vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
        fragmentShader: "uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float d = abs(dot(vN, vV)); float k = pow(1.0 - d, 6.0) * 1.4; gl_FragColor = vec4(c * k, k); }" }));
      earth.add(atmo);
      // star field (fixed in ECI)
      const g = new T.BufferGeometry(), n = 2500, pos = new Float32Array(n * 3);
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); pos.set([9e5 * s * Math.cos(th), 9e5 * u, 9e5 * s * Math.sin(th)], i * 3); }
      g.setAttribute("position", new T.BufferAttribute(pos, 3));
      this.stars = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false }));
      this.far.add(this.stars);
      const clouds = loader.load("textures/earth/earth_clouds_2048.png");   // team RGBA cloud map (2048 x 1024)
      clouds.anisotropy = aniso;
      this.clouds = new T.Mesh(new T.SphereGeometry(6371 * 1.004, 160, 96), new T.MeshLambertMaterial({ map: clouds, transparent: true, opacity: 0.9, depthWrite: false }));
      earth.add(this.clouds);
      this._buildSky();
      this.sunFar = new T.DirectionalLight(0xffffff, 1.35); this.far.add(this.sunFar);
      this.far.add(new T.AmbientLight(0x223344, 0.25));
    }
    // Moon at its real distance/size, the Sun and naked-eye planets as bright points on the sky
    // (fixed fictional geometry for this scenario). Team-made planet models can replace these.
    _buildSky() {
      const cvs = document.createElement("canvas"); cvs.width = 512; cvs.height = 256;
      const g = cvs.getContext("2d"); g.fillStyle = "#8d8d8a"; g.fillRect(0, 0, 512, 256);
      let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 900; i++) { const x = rnd() * 512, y = rnd() * 256, rr = Math.pow(rnd(), 3) * 18 + 1; g.fillStyle = `rgba(${rnd() < 0.5 ? 60 : 170},${rnd() < 0.5 ? 60 : 170},${rnd() < 0.5 ? 60 : 165},${0.15 + rnd() * 0.25})`; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); }
      const tex = new T.CanvasTexture(cvs);
      this.moon = new T.Mesh(new T.SphereGeometry(1737, 48, 32), new T.MeshLambertMaterial({ map: tex }));
      this.moonDir = S.vec.unit([-0.42, 0.83, 0.37]);
      this.far.add(this.moon);
      const glow = (color, size) => {
        const c2 = document.createElement("canvas"); c2.width = c2.height = 64; const x = c2.getContext("2d");
        const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.25, color); grd.addColorStop(1, "rgba(0,0,0,0)");
        x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
        const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c2), depthWrite: false, transparent: true, blending: T.AdditiveBlending, sizeAttenuation: false }));
        sp.scale.set(size, size, 1); return sp;
      };
      this.sunSprite = glow("rgba(255,240,200,0.9)", 0.18); this.far.add(this.sunSprite);
      // Team planet models (OrbitForge GLBs) at their TRUE apparent sizes (typical angular diameter, in
      // arcseconds; the Moon above is 0.52 deg, the Sun 0.53 deg). Every planet is far below one pixel in the
      // normal 60 deg view, so each also has a point of light scaled by brightness; the models resolve in the
      // SCOPE view (hold the right mouse button). Directions are a fixed scenario sky, not an ephemeris.
      const AS = 1 / 3600;
      this.planets = [
        { name: "Mercury", file: "mercury", dir: [0.55, 0.78, 0.30], deg: 8 * AS, dot: 0.0042, color: "rgba(220,210,200,0.9)" },
        { name: "Venus", file: "venus", dir: [0.62, 0.70, 0.36], deg: 30 * AS, dot: 0.0075, color: "rgba(255,250,225,1)" },
        { name: "Mars", file: "mars", dir: [0.10, -0.92, -0.38], deg: 10 * AS, dot: 0.0045, color: "rgba(255,140,90,0.9)" },
        { name: "Jupiter", file: "jupiter", dir: [-0.80, -0.50, -0.33], deg: 44 * AS, dot: 0.0065, color: "rgba(255,235,200,0.95)" },
        { name: "Saturn", file: "saturn", dir: [-0.95, 0.20, 0.24], deg: 41 * AS, dot: 0.0048, color: "rgba(240,220,170,0.9)" },   // rings span ~41"
        { name: "Uranus", file: "uranus", dir: [0.20, 0.35, -0.92], deg: 3.7 * AS, dot: 0.0026, color: "rgba(170,230,240,0.75)" },
        { name: "Neptune", file: "neptune", dir: [-0.30, 0.90, -0.30], deg: 2.3 * AS, dot: 0.0022, color: "rgba(120,150,255,0.7)" },
      ].map((p) => { const sp = glow(p.color, p.dot); this.far.add(sp); return Object.assign(p, { sprite: sp, dir: S.vec.unit(p.dir), model: null }); });
      this.planetStatus = "loading";
      const gm = window.glbManager;
      if (!gm) { this.planetStatus = "unavailable"; return; }
      const D = 6.0e5;   // km — beyond the Moon, inside the far camera range
      const place = (obj, deg) => {
        // size by the opaque body only, so faint transparent dust rings (Jupiter) don't shrink the planet
        obj.updateMatrixWorld(true); const box = new T.Box3();
        obj.traverse((c) => { if (c.isMesh && !(c.material && c.material.transparent)) box.expandByObject(c); });
        if (box.isEmpty()) box.setFromObject(obj);
        const sph = box.getBoundingSphere(new T.Sphere());
        const radius = D * Math.tan((deg * Math.PI / 180) / 2);
        const wrap = new T.Group(); obj.position.sub(sph.center); wrap.add(obj); wrap.scale.setScalar(radius / Math.max(1e-6, sph.radius));
        return wrap;
      };
      const NOV14_PLANET_GLBS = new Set(["venus", "mars", "saturn", "neptune"]);
      const glbPlanets = this.planets.filter((p) => NOV14_PLANET_GLBS.has(p.file));
      let pending = glbPlanets.length;
      const done = () => { if (--pending <= 0) this.planetStatus = glbPlanets.every((p) => p.model) ? "ok" : "partial"; };
      if (!pending) { this.planetStatus = "partial"; return; }
      for (const p of glbPlanets) {
        gm.loadGLB(`assets/planets/${p.file}.glb`).then(() => {
          if (this.disposed) return;
          const inst = gm.instantiateModel(`assets/planets/${p.file}.glb`, { castShadow: false, receiveShadow: false });
          // unlit (full-disk) so the planets read clearly in the free-look sky whatever the sun angle
          inst.traverse((c) => { if (c.isMesh) { const m = c.material; c.material = new T.MeshBasicMaterial({ map: m.map || null, color: m.map ? 0xffffff : (m.color || new T.Color(0xcccccc)), transparent: !!m.transparent, opacity: m.opacity == null ? 1 : m.opacity, alphaTest: m.alphaTest || 0, side: m.side }); } });
          p.model = place(inst, p.deg); p.model.rotation.x = 0.4; this.far.add(p.model); done();
        }).catch(() => done());
      }
    }

    _buildNear() {
      this.sunNear = new T.DirectionalLight(0xfff4e0, 2.2); this.near.add(this.sunNear); this.near.add(this.sunNear.target);
      this.hemiNear = new T.HemisphereLight(0x9ec9ff, 0x223318, 0.35); this.near.add(this.hemiNear);
      this.ambientNear = new T.AmbientLight(0xdbeafe, 0); this.near.add(this.ambientNear);
      // Ground haze, enabled only while the detailed LC-39A site is in view so
      // the borrowed Space Center keeps the same atmospheric depth as on foot.
      this.near.fog = new T.FogExp2(GROUND_FOG, 0);
      // Earth-fixed ground tile around KSC (pad + runway), tangent plane at the midpoint
      const site = S.SITES, latM = (site.pad.lat + site.runway.lat) / 2, lonM = (site.pad.lon + site.runway.lon) / 2;
      this.groundECEF = S.llhToEcef(latM, lonM, -0.3); this.groundBasis = S.enuBasis(latM, lonM);
      const ground = new T.Group();
      const land = new T.Mesh(new T.CircleGeometry(60000, 96), new T.MeshLambertMaterial({ color: 0x2e4524 }));
      land.rotation.x = -Math.PI / 2; ground.add(land);
      const sea = new T.Mesh(new T.PlaneGeometry(60000, 120000), new T.MeshLambertMaterial({ color: 0x0f3550, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(36500, 1.5, 0); ground.add(sea);    // ocean east of the pad (coastline ≈2 km east of LC-39A)
      // runway 15: 4572 x 91 m, markings
      const rwy = new T.Group(), L = S.RWY.length, W = S.RWY.width;
      const asphalt = new T.Mesh(new T.PlaneGeometry(W, L), new T.MeshLambertMaterial({ color: 0x1c1d20, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(0, 0.2, -L / 2); rwy.add(asphalt);
      const white = new T.MeshBasicMaterial({ color: 0xe8e8e8 });
      for (let z = 60; z < L - 60; z += 60) { const d = new T.Mesh(new T.PlaneGeometry(0.9, 36), white); d.rotation.x = -Math.PI / 2; d.position.set(0, 0.25, -z); rwy.add(d); }
      for (let k = -7; k <= 7; k++) if (k) { for (const z0 of [12, L - 12]) { const b = new T.Mesh(new T.PlaneGeometry(1.8, 22), white); b.rotation.x = -Math.PI / 2; b.position.set(k * 5.5, 0.25, -z0); rwy.add(b); } }
      for (const side of [-1, 1]) { const e = new T.Mesh(new T.PlaneGeometry(0.9, L), white); e.rotation.x = -Math.PI / 2; e.position.set(side * (W / 2 - 1), 0.25, -L / 2); rwy.add(e); }
      // approach lights / PAPI-like markers before the threshold
      const lightMat = new T.MeshBasicMaterial({ color: 0xffd27a });
      for (let z = 60; z < 900; z += 60) { const l = new T.Mesh(new T.BoxGeometry(14, 0.6, 1.2), lightMat); l.position.set(0, 0.4, z); rwy.add(l); }
      this.runwayGroup = rwy; ground.add(rwy);
      const rel = this._enuOf(S.RWY.threshold);
      rwy.position.set(rel[0], 0, -rel[1]);
      rwy.rotation.y = -S.RWY.heading;                     // local -Z (north) rotated to the runway heading
      // Launch Complex 39A, ported from the team's Godot "SpaceCenter" hub (LaunchComplex.gd):
      // hardstand mound, launch mount + mobile launcher, 108 m fixed service structure, three
      // lightning masts with catenary wires, water tower and propellant farm. Same coordinates
      // (1 unit = 1 m; Godot +X/+Y/+Z map to this tile's east/up/south).
      const pad = this._buildLaunchComplex();
      const padRel = this._enuOf(S.llhToEcef(site.pad.lat, site.pad.lon, 0));
      pad.position.set(padRel[0], 0, -padRel[1]); ground.add(pad);
      this.simplePad = pad;
      this._buildVAB(ground);
      this.groundGroup = ground; this.near.add(ground);
    }

    // ------------------------------------------------------------------ detailed LC-39A handoff
    // The ground game owns the walkable Space Center scene. Rather than hiding it and
    // swapping in the training pad, the same group is lent to this renderer for the
    // first minutes of flight, so ignition and tower clearance happen over the real
    // pad, VAB, LCC and surrounding buildings.
    attachLaunchSite(manager) {
      if (!manager || !manager.group) return false;
      this.detachLaunchSite();
      const group = manager.group;
      manager._launchSiteLent = true;
      this._launchCamAge = 0;
      const cam = manager.camera || null;
      this._handoffFov = cam ? cam.fov : 60;
      let handoff = null;
      if (cam) {
        // Space Center local metres -> the Shuttle view's Earth-fixed frame.
        group.updateMatrixWorld(true);
        const inv = new T.Matrix4().copy(group.matrixWorld).invert();
        const localEye = cam.position.clone().applyMatrix4(inv);
        const localDir = cam.getWorldDirection(new T.Vector3()).transformDirection(inv);
        const localUp = new T.Vector3(0, 1, 0).applyQuaternion(cam.quaternion).transformDirection(inv);
        handoff = {
          eye: [localEye.x, localEye.y, localEye.z],
          dir: [localDir.x, localDir.y, localDir.z],
          up: [localUp.x, localUp.y, localUp.z],
          fov: cam.fov
        };
      }
      const saved = {
        parent: group.parent,
        visible: group.visible,
        stackVisible: manager.stackGroup ? manager.stackGroup.visible : true,
        carVisible: manager.openCar && manager.openCar.group ? manager.openCar.group.visible : true,
        guidance: [],
        facilities: []
      };
      for (const key of Object.keys(manager.guidanceMarkers || {})) {
        const marker = manager.guidanceMarkers[key];
        if (!marker) continue;
        saved.guidance.push([marker, marker.visible]);
        marker.visible = false;
      }
      for (const terminal of manager.facilityTerminals || []) {
        if (!terminal || !terminal.marker) continue;
        saved.facilities.push([terminal.marker, terminal.marker.visible]);
        terminal.marker.visible = false;
      }
      let skyDome = null;
      group.traverse((node) => { if (node && node.name === "SpaceCenterSkyDome") skyDome = node; });
      const arm = manager.armPivotGroup || null;
      this.launchSite = {
        manager, group, saved,
        deluge: manager.delugeWaterMesh || null,
        steam: manager.steamPlumes || null,
        skyDome, handoff,
        arm,
        armStart: arm ? arm.rotation.y : 0,
        armTarget: typeof manager.dockRetractAngle === "number" ? manager.dockRetractAngle : (arm ? arm.rotation.y : 0)
      };
      this.launchSiteMount.add(group);
      group.visible = true;
      if (manager.stackGroup) manager.stackGroup.visible = false;      // the flight vehicle replaces it
      if (manager.openCar && manager.openCar.group) manager.openCar.group.visible = false;
      if (this.simplePad) this.simplePad.visible = false;
      if (this.simpleVAB) this.simpleVAB.visible = false;
      this.launchSiteMount.visible = true;
      // Match the Space Center's daylight key/fill so the borrowed site does not
      // change colour when the gameplay camera hands over to the flight camera.
      if (this.sunNear) { this.sunNear.color.setHex(0xfff3d8); this.sunNear.intensity = 1.95; }
      if (this.hemiNear) { this.hemiNear.color.setHex(0xb8dfff); this.hemiNear.groundColor.setHex(0x526444); this.hemiNear.intensity = 0.68; }
      if (this.ambientNear) this.ambientNear.intensity = 0.28;
      if (this.near.fog) this.near.fog.density = GROUND_FOG_DENSITY;
      this.launchSunRender = null;
      return true;
    }

    detachLaunchSite() {
      if (!this.launchSite) return;
      const { manager, group, saved } = this.launchSite;
      manager._launchSiteLent = false;
      if (group.parent === this.launchSiteMount) this.launchSiteMount.remove(group);
      if (saved.parent) saved.parent.add(group);
      else if (manager.scene) manager.scene.add(group);
      group.visible = saved.visible !== false;
      if (manager.stackGroup) manager.stackGroup.visible = saved.stackVisible !== false;
      if (manager.openCar && manager.openCar.group) manager.openCar.group.visible = saved.carVisible !== false;
      for (const [marker, visible] of saved.guidance) marker.visible = visible;
      for (const [marker, visible] of saved.facilities) marker.visible = visible;
      if (this.launchSite.skyDome) this.launchSite.skyDome.visible = true;
      this.launchSiteMount.visible = false;
      this.launchSite = null;
      if (this.simplePad) this.simplePad.visible = true;
      if (this.simpleVAB) this.simpleVAB.visible = true;
      if (this.groundGroup) this.groundGroup.visible = true;
      // Restore the high-altitude flight lighting / clear sky.
      if (this.sunNear) { this.sunNear.color.setHex(0xfff4e0); this.sunNear.intensity = 2.2; }
      if (this.hemiNear) { this.hemiNear.color.setHex(0x9ec9ff); this.hemiNear.groundColor.setHex(0x223318); this.hemiNear.intensity = 0.35; }
      if (this.ambientNear) this.ambientNear.intensity = 0;
      if (this.near.fog) this.near.fog.density = 0;
      this.launchSunRender = null;
      this._launchCamAge = 0;
      this._handoffFov = 60;
      this.sceneFov = 60;
      for (const cam of [this.nearCam, this.farCam]) {
        if (cam && cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); }
      }
    }

    _sitePointToEci(local, th) {
      const pad = S.SITES.pad, B = S.enuBasis(pad.lat, pad.lon);
      const base = S.vec.add(S.llhToEcef(pad.lat, pad.lon, 0), S.vec.scl(B.U, LAUNCH_SITE_OFFSET_Y));
      const ecef = S.vec.add(base, S.vec.add(
        S.vec.scl(B.E, local[0]),
        S.vec.add(S.vec.scl(B.U, local[1]), S.vec.scl(B.N, -local[2]))
      ));
      return S.ecefToEci(ecef, th);
    }

    _applyLaunchLighting(alt, th) {
      if (!this.launchSite) return;
      // Blend the ground-scene sunlight/fill into the flight renderer's cooler
      // space lighting only after the detailed site has dropped away below.
      const k = smooth01(4000, 18000, alt);
      if (this.sunNear) {
        this.sunNear.color.copy(GROUND_SUN_COLOR).lerp(SPACE_SUN_COLOR, k);
        this.sunNear.intensity = 1.95 + (2.2 - 1.95) * k;
      }
      if (this.hemiNear) {
        this.hemiNear.color.copy(GROUND_HEMI_SKY).lerp(SPACE_HEMI_SKY, k);
        this.hemiNear.groundColor.copy(GROUND_HEMI_GROUND).lerp(SPACE_HEMI_GROUND, k);
        this.hemiNear.intensity = 0.68 + (0.35 - 0.68) * k;
      }
      if (this.ambientNear) this.ambientNear.intensity = 0.28 * (1 - k);
      if (this.near.fog) this.near.fog.density = GROUND_FOG_DENSITY * (1 - smooth01(2500, 10000, alt));
      const pad = S.SITES.pad, B = S.enuBasis(pad.lat, pad.lon);
      const E = S.ecefToEci(B.E, th), N = S.ecefToEci(B.N, th), U = S.ecefToEci(B.U, th);
      const d = LAUNCH_SUN_LOCAL;
      const sunEci = S.vec.unit(S.vec.add(S.vec.add(S.vec.scl(E, d[0]), S.vec.scl(U, d[1])), S.vec.scl(N, -d[2])));
      this.launchSunRender = toR(sunEci);
    }

    _updateLaunchSite(sn, alt, th, cam) {
      if (!this.launchSite) return;
      this._applyLaunchLighting(alt, th);
      const v = sn.vehicle;
      const visible = (v.regime === "pad" || v.regime === "ascent") && alt < 15000;
      this.launchSiteMount.visible = visible;
      if (this.groundGroup) this.groundGroup.visible = alt < 9000 && !visible;
      if (!visible) return;
      // The ground scene's sky bubble is only useful from inside it; once the
      // stack climbs out, let the flight renderer's sky/space background show.
      if (this.launchSite.skyDome) this.launchSite.skyDome.visible = alt < 1800;
      // The ground game normally animates the Orbiter Access Arm in its own
      // update loop. During the borrowed launch that loop is paused, so swing
      // the same arm clear of the stack as the countdown reaches zero.
      const site = this.launchSite;
      if (site.arm) {
        const countdown = typeof sn.countdown === "number" ? sn.countdown : null;
        const retract = (sn.phase === "prelaunch" && countdown !== null)
          ? 1 - smooth01(0, 8, countdown)
          : 1;
        site.arm.rotation.y = site.armStart + (site.armTarget - site.armStart) * retract;
      }
      // Water deluge and pad steam during ignition, using the detailed pad's
      // existing effects so the ground behaves like the pre-launch scene.
      const eng = v.eng || {};
      const firing = (v.regime === "pad" && (eng.ssme || eng.srb)) || (v.regime === "ascent" && alt < 1400);
      if (site.deluge && site.deluge.material) site.deluge.material.opacity = firing ? 0.78 : 0;
      if (site.steam) {
        site.steam.forEach((steam, i) => {
          if (!steam.material) return;
          steam.material.opacity = firing ? 0.55 + Math.sin(sn.simTime * 4 + i) * 0.12 : 0;
          steam.scale.setScalar(1 + Math.sin(sn.simTime * 2.2 + i * 1.3) * 0.07);
        });
      }
      const padBase = this._sitePointToEci([0, 0, 0], th);
      this.launchSiteMount.position.copy(toR(S.vec.sub(padBase, cam)));
      const pad = S.SITES.pad, B = S.enuBasis(pad.lat, pad.lon);
      const E = S.ecefToEci(B.E, th), N = S.ecefToEci(B.N, th), U = S.ecefToEci(B.U, th);
      const m = new T.Matrix4().makeBasis(toR(E), toR(U), toR(N).multiplyScalar(-1));
      this.launchSiteMount.quaternion.setFromRotationMatrix(m);
    }

    _buildLaunchComplex() {
      const g = new T.Group(), M = {};
      const mat = (k, c) => M[k] || (M[k] = new T.MeshLambertMaterial({ color: c }));
      const C = { concrete: mat("concrete", 0x9b9a93), cdark: mat("cdark", 0x6c6b66), steel: mat("steel", 0x7d848b), tower: mat("tower", 0xb5452e),
        white: mat("white", 0xe2e2df), rust: mat("rust", 0x8a4b2a), black: mat("black", 0x141414), grass: mat("grass", 0x3c5a2c) };
      const box = (sx, sy, sz, x, y, z, m, rx, rz) => { const o = new T.Mesh(new T.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); if (rx) o.rotation.x = rx; if (rz) o.rotation.z = rz; g.add(o); return o; };
      const beam = (a, b, r, m) => { const A = new T.Vector3(...a), B = new T.Vector3(...b), d = B.clone().sub(A); const o = new T.Mesh(new T.CylinderGeometry(r, r, d.length(), 6), m);
        o.position.copy(A).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); g.add(o); return o; };
      const cyl = (rt, rb, h, x, y, z, m, seg) => { const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 16), m); o.position.set(x, y, z); g.add(o); return o; };
      const PAD_TOP = 6, TX = 26, TH = 108;
      // hardstand mound with embankments, flame trench, launch mount, MLP
      box(130, PAD_TOP, 130, 0, PAD_TOP / 2, 0, C.concrete);
      const rise = Math.atan2(PAD_TOP, 20);
      box(20, 0.6, 130, 75, 3, 0, C.grass, 0, -rise); box(20, 0.6, 130, -75, 3, 0, C.grass, 0, rise);
      box(130, 0.6, 20, 0, 3, -75, C.grass, -rise); box(130, 0.6, 20, 0, 3, 75, C.grass, rise);
      box(30, 0.3, 30, 0, PAD_TOP + 0.02, 0, C.black);
      box(28, 4, 28, 0, 8, 0, C.cdark); box(42, 2.5, 42, 0, 11.25, 0, C.steel); box(38, 0.4, 38, 0, 12.6, 0, C.tower);
      for (const x of [-5.6, 5.6]) for (const z of [-5.6, 5.6]) box(1.4, 2.6, 1.4, x, 13.6, z, C.rust);
      // fixed service structure: core, four tapering legs, ring beams, diagonals, access arms
      box(3.6, TH, 3.6, TX, PAD_TOP + TH / 2, 0, C.steel);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]], hb = 5.5, ht = 2.5, L = 9;
      for (const c of corners) beam([TX + c[0] * hb, PAD_TOP, c[1] * hb], [TX + c[0] * ht, PAD_TOP + TH, c[1] * ht], 0.55, C.tower);
      for (let l = 0; l <= L; l++) {
        const t = l / L, y = PAD_TOP + TH * t, h = hb + (ht - hb) * t;
        for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; beam([TX + a[0] * h, y, a[1] * h], [TX + b[0] * h, y, b[1] * h], 0.32, C.tower); }
        if (l < L) { const t1 = (l + 1) / L, y1 = PAD_TOP + TH * t1, h1 = hb + (ht - hb) * t1;
          for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; beam([TX + a[0] * h, y, a[1] * h], [TX + b[0] * h1, y1, b[1] * h1], 0.22, C.tower); } }
      }
      for (const [y, len] of [[40, 15], [56, 16], [72, 14]]) box(len, 1.6, 2.4, TX - len / 2 - 2, y, 0, C.steel);   // service / crew access arms
      box(30, 2, 3, TX, PAD_TOP + TH + 1, 0, C.tower);                                                                // hammerhead crane
      // lightning protection: three masts and catenary wires
      const wire = new T.LineBasicMaterial({ color: 0x2a2a2a }), tops = [];
      for (let i = 0; i < 3; i++) {
        const a = (30 + 120 * i) * Math.PI / 180, x = Math.cos(a) * 88, z = Math.sin(a) * 88;
        cyl(0.5, 1.2, 118, x, 59, z, C.white, 12); cyl(0.05, 0.5, 14, x, 125, z, C.steel, 8); cyl(3, 3, 1.2, x, 0.6, z, C.cdark, 12);
        tops.push([x, 130, z, Math.cos(a) * 175, Math.sin(a) * 175]);
      }
      const sag = (p0, p1, drop) => { const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new T.Vector3(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - drop * 4 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t)); } g.add(new T.Line(new T.BufferGeometry().setFromPoints(pts), wire)); };
      for (let i = 0; i < 3; i++) { const a = tops[i], b = tops[(i + 1) % 3]; sag([a[0], 130, a[2]], [b[0], 130, b[2]], 14); sag([a[0], 130, a[2]], [a[3], 0, a[4]], 8); }
      // water tower and propellant farm
      const wx = 96, wz = 58;
      for (const c of corners) beam([wx + c[0] * 7, 0, wz + c[1] * 7], [wx + c[0] * 2.8, 42, wz + c[1] * 2.8], 0.55, C.steel);
      cyl(7.5, 7.5, 10, wx, 47, wz, C.white, 24); cyl(7.5, 1.6, 5, wx, 39.5, wz, C.white, 24); cyl(1, 7.5, 4, wx, 54, wz, C.white, 24);
      for (let i = 0; i < 2; i++) {
        const px = -120 + i * 34, pz = 88;
        const sp = new T.Mesh(new T.SphereGeometry(7, 24, 16), C.white); sp.position.set(px, 13, pz); g.add(sp);
        for (const c of corners) beam([px + c[0] * 4.2, 0, pz + c[1] * 4.2], [px + c[0] * 2, 7, pz + c[1] * 2], 0.4, C.steel);
      }
      beam([-100, 2, 88], [-30, 2, 55], 0.9, C.steel); beam([-30, 2, 55], [-14, 6.5, 20], 0.9, C.steel);
      return g;
    }
    // Vehicle Assembly Building (real location, team spec 158 x 160 x 218 m) and the crawlerway to 39A
    _buildVAB(ground) {
      const vabLL = { lat: 28.5862 * Math.PI / 180, lon: -80.6508 * Math.PI / 180 };
      const p = this._enuOf(S.llhToEcef(vabLL.lat, vabLL.lon, 0)), padP = this._enuOf(S.llhToEcef(S.SITES.pad.lat, S.SITES.pad.lon, 0));
      const vab = new T.Group();
      const body = new T.Mesh(new T.BoxGeometry(158, 160, 218), new T.MeshLambertMaterial({ color: 0xd9d6cf })); body.position.y = 80; vab.add(body);
      const door = new T.Mesh(new T.PlaneGeometry(46, 139), new T.MeshLambertMaterial({ color: 0x55585c })); door.position.set(0, 69.5, 109.1); vab.add(door);
      const flagC = document.createElement("canvas"); flagC.width = 190; flagC.height = 100; const fx = flagC.getContext("2d");
      for (let i = 0; i < 13; i++) { fx.fillStyle = i % 2 ? "#ffffff" : "#b22234"; fx.fillRect(0, i * 100 / 13, 190, 100 / 13 + 1); } fx.fillStyle = "#3c3b6e"; fx.fillRect(0, 0, 76, 54);
      const flag = new T.Mesh(new T.PlaneGeometry(64, 34), new T.MeshLambertMaterial({ map: new T.CanvasTexture(flagC) })); flag.position.set(-79.1, 110, -40); flag.rotation.y = -Math.PI / 2; vab.add(flag);
      const low = new T.Mesh(new T.BoxGeometry(130, 64, 180), new T.MeshLambertMaterial({ color: 0xcfccc4 })); low.position.set(144, 32, 0); vab.add(low);
      vab.position.set(p[0], 0, -p[1]); ground.add(vab);
      this.simpleVAB = vab;
      // crawlerway: two gravel lanes from the VAB to the pad
      const dx = padP[0] - p[0], dz = -(padP[1] - p[1]), len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
      for (const off of [-10, 10]) {
        const lane = new T.Mesh(new T.PlaneGeometry(12, len - 260), new T.MeshLambertMaterial({ color: 0x9a8f7c }));
        lane.rotation.x = -Math.PI / 2; const mid = [(p[0] + padP[0]) / 2, -(p[1] + padP[1]) / 2];
        lane.position.set(mid[0] + Math.cos(ang) * off, 0.15, mid[1] - Math.sin(ang) * off); lane.rotation.z = ang; ground.add(lane);
      }
    }
    // tileable grey noise (~1) used to break up magnified texels of the Earth map at close range
    _detailTexture() {
      const n = 256, c = document.createElement("canvas"); c.width = c.height = n; const x = c.getContext("2d"), img = x.createImageData(n, n);
      let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const g = []; const G = 16; for (let i = 0; i < G * G; i++) g.push(rnd());
      const val = (u, v, f) => { const X = u * f, Y = v * f, x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0, s = (t) => t * t * (3 - 2 * t);
        const at = (i, j) => g[((i % f + f) % f) * G + ((j % f + f) % f)]; const a = at(x0, y0), b = at(x0 + 1, y0), c2 = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        return a + (b - a) * s(fx) + (c2 - a) * s(fy) + (a - b - c2 + d) * s(fx) * s(fy); };
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const u = i / n, v = j / n, k = 0.5 * val(u, v, 4) + 0.3 * val(u, v, 8) + 0.2 * val(u, v, 16);
        const r = 0.78 + 0.44 * k, o = (j * n + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(255, r * 180)); img.data[o + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
    }
    // ------------------------------------------------------------------ planned mission route
    _loadRoutes() {
      window.ShuttleRoute.load().then(data => {
        if (this.disposed) return;
        this.routes = Object.fromEntries(Object.entries(data.routes).map(([key, route]) => [key, new window.ShuttleRoute(route)]));
      }).catch(error => console.error("[Shuttle] Planned flight route unavailable:", error));
    }
    _updateRouteAim(sn, rV, qV, th) {
      const route = this.routes && this.routes[sn.variant || "deploy"];
      if (!route || sn.phase === "debrief") return;
      route.update(sn, rV, th);
      // Keep the existing screen steering arrows aimed along the upcoming route.
      const aim = route.point(Math.min(1, route.anchor + route.right * 0.5));
      const delta = S.vec.sub(S.ecefToEci(aim.toArray(), th), rV), ax = S.quat.qAxes(qV);
      this.aimBody = [S.vec.dot(delta, ax.x), S.vec.dot(delta, ax.y), S.vec.dot(delta, ax.z)];
    }
    // Screen anchors for the steering arrows: the orbiter centre and points off its own left, right,
    // top and bottom (body axes), so the arrows stay correct from any camera angle.
    steerAnchors() {
      if (!this._lastRV || !this.camPos) return null;
      const vec = S.vec, q = this._lastQV, rV = this._lastRV; let ax = S.quat.qAxes(q);
      if (this._lastRegime && this._lastRegime !== "orbit") {
        // in the air: horizon-level axes (left = level and square to the flight direction, up = local
        // vertical), so "left" is on the screen-left of the shuttle even in a steep bank
        const up = vec.unit(rV), va = this._lastV ? S.airVel(rV, this._lastV) : ax.z;
        let fwd = vec.sub(va, vec.scl(up, vec.dot(va, up))); fwd = vec.norm(fwd) > 1e-6 ? vec.unit(fwd) : ax.z;
        ax = { x: vec.cross(up, fwd), y: up, z: fwd };
      }
      const dist = vec.norm(vec.sub(rV, this.camPos)), off = Math.max(14, dist * 0.16);
      const w = window.innerWidth, h = window.innerHeight;
      const proj = (p) => { const v3 = toR(vec.sub(p, this.camPos)).project(this.nearCam); return { x: (v3.x + 1) / 2 * w, y: (1 - v3.y) / 2 * h, ok: v3.z < 1 }; };
      const c = proj(rV);
      return { c, left: proj(vec.add(rV, vec.scl(ax.x, off))), right: proj(vec.add(rV, vec.scl(ax.x, -off))), up: proj(vec.add(rV, vec.scl(ax.y, off))), down: proj(vec.add(rV, vec.scl(ax.y, -off))),
        nose: proj(vec.add(rV, vec.scl(ax.z, off))) };
    }
    _enuOf(ecef) { const d = S.vec.sub(ecef, this.groundECEF), B = this.groundBasis; return [S.vec.dot(d, B.E), S.vec.dot(d, B.N), S.vec.dot(d, B.U)]; }
    // Layered exhaust plume (replaces the old single translucent cone):
    //  - core: shader cone with a hot white throat, shock ("mach") diamonds in air, streaky flicker
    //  - sheath: wider, dimmer, slower-moving outer cone
    //  - throat discs: three additive billboards at the nozzle exit that pulse
    // In vacuum the plume expands sideways and the diamonds vanish (uExpand / uDiamonds).
    _plumeMaterial(colA, colB, opacity) {
      return new T.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uThrottle: { value: 1 }, uExpand: { value: 0 }, uDiamonds: { value: 1 }, uOpacity: { value: opacity },
          uColA: { value: new T.Color(colA) }, uColB: { value: new T.Color(colB) } },
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
        vertexShader: `varying vec2 vUv; varying float vRim;
          void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);
            vec3 n = normalize(normalMatrix * normal); vRim = abs(dot(n, normalize(-mv.xyz)));
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uTime, uThrottle, uExpand, uDiamonds, uOpacity; uniform vec3 uColA, uColB; varying vec2 vUv; varying float vRim;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          void main(){
            float t = vUv.y;                       // 0 at the tip (far end), 1 at the nozzle for ConeGeometry
            float s = 1.0 - t;                     // 0 nozzle -> 1 tip
            float n = vnoise(vec2(vUv.x * 7.0, s * 5.0 - uTime * 9.0)) * 0.6 + vnoise(vec2(vUv.x * 19.0, s * 14.0 - uTime * 22.0)) * 0.4;
            float len = pow(1.0 - s, 1.6 - 0.5 * uExpand);
            float dia = uDiamonds * pow(0.5 + 0.5 * sin(s * 42.0 - uTime * 3.0), 6.0) * (1.0 - smoothstep(0.0, 0.55, s)) * 1.3;
            float rim = pow(vRim, 1.2 + 1.5 * uExpand);
            vec3 col = mix(uColA, uColB, smoothstep(0.0, 0.7, s)) * (0.75 + 0.45 * n) + vec3(1.0) * dia;
            float a = uOpacity * uThrottle * len * rim * (0.65 + 0.5 * n);
            gl_FragColor = vec4(col * a, a); }`
      });
    }
    _plume(len, rad, kind) {
      const g = new T.Group(); g.visible = false; g.renderOrder = 5;
      const spec = kind === "srb" ? { a: 0xfff4d0, b: 0xff7a1a, op: 1.0 } : kind === "oms" ? { a: 0xdcf0ff, b: 0x6fa0ff, op: 0.75 } : { a: 0xffffff, b: 0xffa040, op: 0.9 };
      const cone = (L, R, op) => { const geo = new T.ConeGeometry(R, L, 24, 12, true); geo.translate(0, -L / 2, 0); geo.rotateX(Math.PI / 2);   // opens toward -Z
        const m = new T.Mesh(geo, this._plumeMaterial(spec.a, spec.b, op)); return m; };
      const core = cone(len, rad, spec.op), sheath = cone(len * 1.25, rad * 1.9, spec.op * 0.35);
      g.add(core, sheath);
      if (!this._discTex) { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d");
        const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,240,200,0.6)"); gr.addColorStop(1, "rgba(255,160,60,0)");
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128); this._discTex = new T.CanvasTexture(c); }
      const discs = [];
      for (let i = 0; i < 3; i++) { const sp = new T.Sprite(new T.SpriteMaterial({ map: this._discTex, color: spec.a, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
        sp.position.z = -rad * (0.3 + i * 0.9); sp.scale.set(rad * 2.6, rad * 2.6, 1); g.add(sp); discs.push(sp); }
      g.userData.plumeParts = { core, sheath, discs, len, rad, seed: Math.random() * 10 };
      (this.plumeGroups = this.plumeGroups || []).push(g);
      return g;
    }
    // called every frame with the flight state (throttle 0-1, air density fraction 0-1)
    _animatePlumes(dt, thr, airFrac) {
      this._plumeT = (this._plumeT || 0) + dt;
      if (!this.plumeGroups) return;
      for (const g of this.plumeGroups) {
        if (!g.visible) continue;
        const P = g.userData.plumeParts, tt = this._plumeT + P.seed, ex = 1 - airFrac;
        for (const m of [P.core, P.sheath]) { const u = m.material.uniforms; u.uTime.value = tt; u.uThrottle.value = 0.55 + 0.45 * thr; u.uExpand.value = ex; u.uDiamonds.value = airFrac; }
        const w = 1 + 1.6 * ex;                      // vacuum expansion of the exhaust
        P.core.scale.set(w, w, 0.75 + 0.35 * thr + 0.5 * ex); P.sheath.scale.set(w * 1.1, w * 1.1, 0.8 + 0.3 * thr + 0.6 * ex);
        P.discs.forEach((sp, i) => { const f = 0.85 + 0.25 * Math.sin(tt * (23 + 7 * i) + i * 2.1) * Math.sin(tt * 5.3 + i); sp.scale.set(P.rad * 2.6 * f * (1 + 0.6 * ex), P.rad * 2.6 * f * (1 + 0.6 * ex), 1); sp.material.opacity = 0.35 + 0.3 * thr; });
      }
    }

    _placeholder(len, rad, color) {
      const m = new T.Mesh(new T.CylinderGeometry(rad, rad, len, 16), new T.MeshStandardMaterial({ color, roughness: 0.6 }));
      m.rotation.x = Math.PI / 2; const g = new T.Group(); g.add(m); g.userData.placeholder = true; return g;
    }
    _loadModels() {
      const vehicle = new T.Group(); this.vehicle = vehicle; this.near.add(vehicle);
      // placeholders until GLBs arrive (labelled in the HUD as loading)
      this.objs.orbiter = this._placeholder(37, 2.6, 0xeeeeee); vehicle.add(this.objs.orbiter);
      this.objs.et = this._placeholder(47, 4.2, 0xc8732e); this.objs.et.position.copy(new T.Vector3(...ET_OFF)); vehicle.add(this.objs.et);
      this.objs.srbL = this._placeholder(46, 1.85, 0xf2f2f2); this.objs.srbL.position.copy(new T.Vector3(...SRB_L_OFF)); vehicle.add(this.objs.srbL);
      this.objs.srbR = this._placeholder(46, 1.85, 0xf2f2f2); this.objs.srbR.position.copy(new T.Vector3(...SRB_R_OFF)); vehicle.add(this.objs.srbR);
      this.objs.sat = this._placeholder(3, 1.2, 0xd4af37); this.objs.sat.position.set(...S.V.payloadSocket); vehicle.add(this.objs.sat);
      this.assetStatus = { orbiter: "loading", et: "loading", srb: "loading", sat: "loading" };
      Object.defineProperty(this.assetStatus, "planets", { enumerable: true, get: () => this.planetStatus || "loading" });
      const gm = window.glbManager;
      if (!gm) { Object.keys(this.assetStatus).forEach((k) => (this.assetStatus[k] = "unavailable")); return; }
      const swap = (key, url, parentOff, opts, after) => gm.loadGLB(url).then((entry) => {
        if (this.disposed) return;
        const inst = gm.instantiateModel(url, Object.assign({ castShadow: false, receiveShadow: false }, opts || {}));
        const old = this.objs[key]; const parent = old.parent; inst.position.copy(old.position); inst.rotation.copy(old.rotation);
        parent.remove(old); parent.add(inst); this.objs[key] = inst;
        if (after) after(inst, entry);
      });
      swap("orbiter", "assets/Orbiter_V2.glb", null, {}, (inst, entry) => {
        this.assetStatus.orbiter = "ok";
        this.orbMixer = new T.AnimationMixer(inst); this.mixers.push(this.orbMixer); this.orbActions = {};
        (entry.gltf.animations || []).forEach((clip) => { const a = this.orbMixer.clipAction(clip); a.clampWhenFinished = true; a.setLoop(T.LoopOnce, 0); a.play(); a.paused = true; a.time = 0; a.weight = 0; this.orbActions[clip.name] = a; });
        const fx = (name) => { let o = null; inst.traverse((c) => { if (c.name === name) o = c; }); return o; };
        this._openBay(fx("ORB_Body"), inst);
        this.plumes = [];
        // The FX empties are exported with a -90 deg X rotation (Blender convention), so a plume built along
        // the node's local -Z would point at the belly. Cancel the node's rotation relative to the model so
        // every plume points aft along the vehicle -Z axis.
        const aft = (node, p) => { inst.updateMatrixWorld(true); const qi = inst.getWorldQuaternion(new T.Quaternion()), qn = node.getWorldQuaternion(new T.Quaternion());
          p.quaternion.copy(qi.invert().multiply(qn).invert()); node.add(p); };
        for (const n of ["FX_MainEngine_Upper", "FX_MainEngine_Lower_L", "FX_MainEngine_Lower_R"]) { const node = fx(n); if (node) { const p = this._plume(34, 1.5, "ssme"); aft(node, p); this.plumes.push({ mesh: p, kind: "ssme" }); } }
        for (const n of ["FX_OMSEngine_L", "FX_OMSEngine_R"]) { const node = fx(n); if (node) { const p = this._plume(10, 0.7, "oms"); aft(node, p); this.plumes.push({ mesh: p, kind: "oms" }); } }
      }).catch(() => { this.assetStatus.orbiter = "failed (placeholder shown)"; });
      swap("et", "assets/ExternalTank.glb").then(() => { this.assetStatus.et = "ok"; }).catch(() => { this.assetStatus.et = "failed (placeholder)"; });
      gm.loadGLB("assets/SolidRocketBooster.glb").then(() => {
        if (this.disposed) return;
        for (const k of ["srbL", "srbR"]) {
          const inst = gm.instantiateModel("assets/SolidRocketBooster.glb", { castShadow: false, receiveShadow: false });
          const old = this.objs[k]; inst.position.copy(old.position); if (k === "srbR") inst.rotation.z = Math.PI;
          old.parent.remove(old); this.vehicle.add(inst); this.objs[k] = inst;
          const p = this._plume(70, 3.4, "srb"); p.position.z = -24; inst.add(p); inst.userData.plume = p;
        }
        this.assetStatus.srb = "ok";
      }).catch(() => { this.assetStatus.srb = "failed (placeholder)"; });
      swap("sat", "assets/Satellite.glb", null, { scale: 0.95 }, (inst, entry) => {
        this.assetStatus.sat = "ok";
        this.satMixer = new T.AnimationMixer(inst); this.mixers.push(this.satMixer);
        const clip = (entry.gltf.animations || [])[0];
        if (clip) { this.satAction = this.satMixer.clipAction(clip); this.satAction.setLoop(T.LoopOnce, 0); this.satAction.clampWhenFinished = true; this.satAction.play(); this.satAction.paused = true; this.satDur = clip.duration; }
      }).catch(() => { this.assetStatus.sat = "failed (placeholder)"; });
    }

    // The orbiter GLB's body mesh carries its own closed payload-bay roof underneath the separate door
    // meshes, so opening the animated doors still showed a closed bay. Strip those roof triangles and
    // line the bay (floor, walls, bulkheads) so the open bay reads correctly.
    _openBay(body, inst) {
      if (!body) return;
      body.traverse((m) => {
        if (!m.isMesh || !m.geometry.index) return;
        const g = m.geometry, P = g.attributes.position, I = g.index.array, keep = [];
        // the hull's upper arc duplicates the doors over the whole door span (z -8.55..9.65 in model
        // space); drop every triangle whose centroid lies in that arc, so no slivers remain at the ends
        for (let t = 0; t < I.length; t += 3) {
          const cx = (P.getX(I[t]) + P.getX(I[t + 1]) + P.getX(I[t + 2])) / 3, cy = (P.getY(I[t]) + P.getY(I[t + 1]) + P.getY(I[t + 2])) / 3, cz = (P.getZ(I[t]) + P.getZ(I[t + 1]) + P.getZ(I[t + 2])) / 3;
          if (!(cy > 4.2 && Math.abs(cx) < 2.6 && cz > -8.7 && cz < 9.9)) keep.push(I[t], I[t + 1], I[t + 2]);
        }
        if (keep.length === I.length) return;
        const ng = g.clone(); ng.setIndex(keep); m.geometry = ng;
      });
      // bay liner inside the hull: floor, side walls below the sill, hull-shaped bulkheads, frames
      const liner = new T.Group(), mat = new T.MeshLambertMaterial({ color: 0xc9ccd0, side: T.DoubleSide }), dark = new T.MeshLambertMaterial({ color: 0x5c6066, side: T.DoubleSide });
      const box = (sx, sy, sz, x, y, z, m) => { const o = new T.Mesh(new T.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); liner.add(o); };
      box(4.6, 0.08, 18.0, 0, 1.5, 0.5, mat);
      for (const x of [-2.36, 2.36]) box(0.08, 2.6, 18.0, x, 2.8, 0.5, mat);
      const R = 2.5, CY = 3.2, y0 = 1.5, x0 = Math.sqrt(R * R - (y0 - CY) * (y0 - CY));
      const sh = new T.Shape(); sh.moveTo(-x0, y0); sh.lineTo(x0, y0);
      sh.absarc(0, CY, R, Math.atan2(y0 - CY, x0), Math.atan2(y0 - CY, -x0), false); sh.closePath();
      for (const z of [9.55, -8.5]) { const o = new T.Mesh(new T.ShapeGeometry(sh, 24), dark); o.position.z = z; liner.add(o); }
      for (let z = -8; z <= 9; z += 2) box(4.5, 0.12, 0.1, 0, 1.6, z, dark);
      inst.add(liner);
    }

    // drive a clip to a normalised position (state-driven, not time-driven)
    _clip(name, frac, weight) {
      const a = this.orbActions && this.orbActions[name]; if (!a) return;
      a.weight = weight === undefined ? 1 : weight; a.time = Math.max(0, Math.min(1, frac)) * a.getClip().duration;
    }

    // ------------------------------------------------------------------ per-frame update
    update(sn, input, dt) {
      if (this.disposed) return;
      const v = sn.vehicle, cfg = v.cfg;
      // interpolate between the last two fixed steps for smooth rendering
      const a = Math.max(0, Math.min(1, v.alpha || 0));
      const rV = v.prevR ? S.vec.add(v.prevR, S.vec.scl(S.vec.sub(v.r, v.prevR), a)) : v.r;
      const qV = v.q;
      this.vehiclePos = rV;
      // stack visibility follows the configuration (separated stages become debris bodies)
      this.objs.et.visible = cfg.et; this.objs.srbL.visible = cfg.srb; this.objs.srbR.visible = cfg.srb;
      const satAttached = sn.payload.attached;
      if (satAttached && this.objs.sat.parent !== this.vehicle) { this.near.remove(this.objs.sat); this.vehicle.add(this.objs.sat); this.objs.sat.position.set(...S.V.payloadSocket); this.objs.sat.quaternion.identity(); }
      if (!satAttached && this.objs.sat.parent === this.vehicle) { this.vehicle.remove(this.objs.sat); this.near.add(this.objs.sat); }
      // camera
      this._updateCamera(sn, rV, qV, dt);
      const cam = this.camPos;
      this.vehicle.position.copy(toR(S.vec.sub(rV, cam)));
      this.vehicle.quaternion.copy(qToR(qV));
      if (!satAttached && sn.payload.r) {
        const far = S.vec.norm(S.vec.sub(sn.payload.r, rV)) > 20000;
        this.objs.sat.visible = !far;
        this.objs.sat.position.copy(toR(S.vec.sub(sn.payload.r, cam))); this.objs.sat.quaternion.copy(qToR(sn.payload.q || qV));
      } else this.objs.sat.visible = satAttached;
      if (this.satAction && this.satDur) this.satAction.time = (sn.payload.deploy || 0) * this.satDur;
      // debris bodies
      const seen = {};
      for (const b of sn.debris) {
        seen[b.id] = true;
        let o = this.debrisObjs[b.id];
        if (!o) {
          const src = b.kind === "et" ? this.objs.et : (b.id === "SRB_L" ? this.objs.srbL : this.objs.srbR);
          o = src.clone(true); o.visible = true; if (o.userData.plume) o.userData.plume.visible = false;
          o.traverse((c) => { if (c.userData && c.userData.plumeParts) c.visible = false; });
          this.near.add(o); this.debrisObjs[b.id] = o;
        }
        const off = b.kind === "et" ? [0, 0, 0] : [0, 0, 0];
        o.position.copy(toR(S.vec.sub(b.r, cam))); o.quaternion.copy(qToR(b.q));
        if (b.id === "SRB_R") o.quaternion.multiply(new T.Quaternion(0, 0, 1, 0));
      }
      for (const id of Object.keys(this.debrisObjs)) if (!seen[id]) { this.near.remove(this.debrisObjs[id]); delete this.debrisObjs[id]; }
      // ground tile (Earth-fixed) placed relative to the camera
      const th = S.gmst({ theta0: sn.theta0, t: sn.simTime }, sn.simTime);
      const gECI = S.ecefToEci(this.groundECEF, th);
      const alt = sn.telemetry.altitudeM;
      this._updateLaunchSite(sn, alt, th, cam);
      const detailedGround = !!(this.launchSite && this.launchSiteMount.visible);
      this.groundGroup.visible = alt < 9000 && !detailedGround;   // the flat KSC tile reads as a pale square from higher up; the globe covers it
      if (this.groundGroup.visible) {
        this.groundGroup.position.copy(toR(S.vec.sub(gECI, cam)));
        const B = this.groundBasis;
        const E = S.ecefToEci(B.E, th), N = S.ecefToEci(B.N, th), U = S.ecefToEci(B.U, th);
        // local axes: +X east, +Y up, -Z north
        const m = new T.Matrix4().makeBasis(toR(E), toR(U), toR(N).multiplyScalar(-1));
        this.groundGroup.quaternion.setFromRotationMatrix(m);
      }
      this._lastRV = rV; this._lastQV = qV; this._lastV = sn.vehicle.v; this._lastRegime = sn.vehicle.regime;
      this._updateRouteAim(sn, rV, qV, th);
      // Earth (far scene, km) and lights
      this.earth.position.copy(toR(S.vec.scl(cam, -1 / 1000)));
      this.earth.rotation.set(0, th, 0);
      if (this.clouds) this.clouds.rotation.y = sn.simTime * 2e-6;
      const camKm = S.vec.scl(cam, 1 / 1000);
      this.moon.position.copy(toR(S.vec.sub(S.vec.scl(this.moonDir, 384400), camKm)));
      this.sunSprite.position.copy(toR(S.vec.scl(SUN_ECI, 9e5)));
      for (const p of this.planets) {
        p.sprite.position.copy(toR(S.vec.scl(p.dir, 8.5e5)));
        if (p.model) { p.model.position.copy(toR(S.vec.scl(p.dir, 6.0e5))); p.model.rotation.y += dt * 0.01; }
      }
      if (this.sunModel) this.sunModel.position.copy(toR(S.vec.scl(SUN_ECI, 6.0e5)));
      const sunR = toR(SUN_ECI);
      if (this.earthUniforms) this.earthUniforms.uSunView.value.copy(sunR).applyQuaternion(this.farCam.quaternion.clone().invert()).normalize();
      this.sunFar.position.copy(sunR.clone().multiplyScalar(1e5).add(this.earth.position)); this.sunFar.target = this.earth;
      this.sunNear.position.copy(this.launchSunRender || sunR).multiplyScalar(1000); this.sunNear.target.position.set(0, 0, 0);
      // Sky colour by altitude. While the borrowed LC-39A site is in frame,
      // start from the same mid-sky tone as its dome, then ease into the flight
      // sky as the stack climbs out.
      const k = Math.max(0, Math.min(1, 1 - alt / 70000));
      const spaceSky = this._skyColor.setRGB(0.02 + 0.33 * k * k, 0.03 + 0.5 * k * k, 0.06 + 0.78 * k * k);
      this.sky = this.launchSite
        ? this._computedSky.copy(this._groundSky).lerp(spaceSky, smooth01(1800, 9000, alt))
        : spaceSky;
      this.stars.material.opacity = 1 - k; this.stars.material.transparent = true;
      // engines
      const eng = v.eng || {};
      if (this.plumes) for (const p of this.plumes) {
        if (p.kind === "ssme") p.mesh.visible = !!eng.ssme && cfg.et;
        if (p.kind === "oms") p.mesh.visible = !!eng.oms;
      }
      for (const k2 of ["srbL", "srbR"]) { const o = this.objs[k2]; if (o.userData.plume) o.userData.plume.visible = !!eng.srb && cfg.srb; }
      this._animatePlumes(dt, eng.ssme ? (eng.throttle || 1) : 1, Math.max(0, Math.min(1, 1 - alt / 60000)));
      // orbiter clips driven by state
      if (this.orbActions) {
        const atmo = v.regime === "atmo" || v.regime === "ground";
        this._clip("PayloadDoors_Open", v.doors);
        this._clip("Gear_Deploy", v.gear);
        this._clip("SpeedBrake_Open", v.sb);
        const pitch = atmo ? input.pitch || 0 : 0, roll = atmo ? input.roll || 0 : 0;
        this._clip("Elevons_PitchUp", Math.max(0, pitch), pitch > 0 ? 1 : 0);
        this._clip("Elevons_PitchDown", Math.max(0, -pitch), pitch < 0 ? 1 : 0);
        this._clip("Elevons_RollRight", Math.max(0, roll), roll > 0 && pitch === 0 ? 1 : 0);
        this._clip("Elevons_RollLeft", Math.max(0, -roll), roll < 0 && pitch === 0 ? 1 : 0);
        this._clip("Rudder_YawRight", 0, 0); this._clip("Rudder_YawLeft", 0, 0);
      }
      for (const mx of this.mixers) mx.update(0);
    }

    // Follow camera with free look (open-world vehicle style): the rig stays centred on the
    // vehicle and follows it; drag/swipe looks around it, the wheel zooms, and after a few
    // idle seconds the view eases back behind the vehicle. "bay" and "fixed" are extra views.
    _updateCamera(sn, r, q, dt) {
      const ax = S.quat.qAxes(q), up = S.vec.unit(r), v = sn.vehicle;
      const vAir = S.airVel(r, v.v), spd = S.vec.norm(vAir), vh = spd > 1 ? S.vec.unit(vAir) : ax.z;
      const rot = (vec, axis, ang) => { const c = Math.cos(ang), s2 = Math.sin(ang), d = S.vec.dot(axis, vec); return S.vec.add(S.vec.add(S.vec.scl(vec, c), S.vec.scl(S.vec.cross(axis, vec), s2)), S.vec.scl(axis, d * (1 - c))); };
      const fl = this.camOrbit;
      fl.idle = (fl.idle || 0) + dt;
      if (!this.dragging && fl.idle > 4 && this.autoRecentre !== false) { const k = Math.min(1, dt * 1.5); fl.yaw -= fl.yaw * k; fl.pitch -= fl.pitch * k; }
      let eye = null, look = r, camUp = up;
      const th = S.gmst({ theta0: sn.theta0 }, sn.simTime);
      if (this.camMode === "fixed") {
        if (v.regime === "pad" || (v.regime === "ascent" && sn.telemetry.altitudeM < 15000)) {
          const pad = S.SITES.pad, B = S.enuBasis(pad.lat, pad.lon);
          eye = S.ecefToEci(S.vec.add(S.llhToEcef(pad.lat, pad.lon, 2), S.vec.add(S.vec.scl(B.E, -900), S.vec.scl(B.N, -700))), th);
          camUp = S.ecefToEci(B.U, th);
        } else if ((v.regime === "atmo" && sn.telemetry.altitudeM < 3000) || v.regime === "ground") {
          eye = S.fromRunway({ theta0: sn.theta0, t: sn.simTime }, 900, 140, 6);
        }
      }
      if (!eye && this.camMode === "bay") {
        eye = S.vec.add(r, S.vec.add(S.vec.scl(ax.y, 34), S.vec.scl(ax.z, -14)));
        look = S.vec.add(r, S.vec.scl(ax.y, 3)); camUp = ax.z;
      }
      if (!eye) {
        // base "behind" direction and horizon-level up for each regime
        let back, upv = up, dist;
        if (v.regime === "pad" || v.regime === "ascent") {
          // behind the stack along its motion (west of the pad before liftoff), level with the horizon
          const hor = (vec) => S.vec.sub(vec, S.vec.scl(up, S.vec.dot(vec, up)));
          let dir = spd > 60 ? S.vec.scl(vh, -1) : null;
          if (!dir) { const B = S.enuBasis(S.SITES.pad.lat, S.SITES.pad.lon); dir = S.ecefToEci(S.vec.scl(B.E, -1), th); }
          const h = hor(dir); back = S.vec.norm(h) > 0.2 ? S.vec.unit(S.vec.add(S.vec.unit(h), S.vec.scl(up, -0.15))) : S.vec.unit(dir);
          dist = 160;
        } else if (v.regime === "atmo" || v.regime === "ground") { back = S.vec.scl(vh, -1); dist = v.regime === "ground" ? 55 : 75; }
        else { back = S.vec.scl(ax.z, -1); upv = ax.y; dist = 75; }
        dist *= this.zoom || 1;
        let off = S.vec.add(S.vec.scl(back, dist), S.vec.scl(upv, dist * 0.22));
        off = rot(off, S.vec.unit(upv), fl.yaw);
        const side = S.vec.unit(S.vec.cross(off, upv));
        if (S.vec.norm(side) > 0) off = rot(off, side, fl.pitch);
        eye = S.vec.add(r, off); camUp = upv;
        // keep the camera above the ground near the pad/runway
        const alt = S.vec.norm(eye) - S.RE;
        if (alt < 3) eye = S.vec.add(eye, S.vec.scl(up, 3 - alt));
      }
      // One continuous liftoff: start from the player's exact ground camera,
      // ease onto the north-east pad vantage, hold it while the stack clears
      // the tower, then blend into the chase camera. The detailed LC-39A site
      // stays visible throughout instead of cutting to the simplified pad.
      const altNow = sn.telemetry.altitudeM;
      if (this.launchSite && (v.regime === "pad" || v.regime === "ascent") && altNow < 12000) {
        const pad = S.SITES.pad, B = S.enuBasis(pad.lat, pad.lon);
        const E = S.ecefToEci(B.E, th), N = S.ecefToEci(B.N, th), U = S.ecefToEci(B.U, th);
        const padEye = this._sitePointToEci([96, 46, -72], th);
        const padLook = this._sitePointToEci([0, 42, 0], th);
        const padUp = U;
        this._launchCamAge += dt;
        const handoffK = smooth01(0, 1.6, this._launchCamAge);
        let baseEye = padEye, baseLook = padLook, baseUp = padUp;
        const handoff = this.launchSite.handoff;
        if (handoff) {
          const hEye = this._sitePointToEci(handoff.eye, th);
          const hd = handoff.dir;
          const hDir = S.vec.unit(S.vec.add(
            S.vec.add(S.vec.scl(E, hd[0]), S.vec.scl(U, hd[1])),
            S.vec.scl(N, -hd[2])
          ));
          const hLook = S.vec.add(hEye, S.vec.scl(hDir, 1000));
          const hu = handoff.up || [0, 1, 0];
          const hUp = S.vec.unit(S.vec.add(
            S.vec.add(S.vec.scl(E, hu[0]), S.vec.scl(U, hu[1])),
            S.vec.scl(N, -hu[2])
          ));
          baseEye = S.vec.add(S.vec.scl(hEye, 1 - handoffK), S.vec.scl(padEye, handoffK));
          baseLook = S.vec.add(S.vec.scl(hLook, 1 - handoffK), S.vec.scl(padLook, handoffK));
          baseUp = S.vec.add(S.vec.scl(hUp, 1 - handoffK), S.vec.scl(padUp, handoffK));
        }
        const track = smooth01(20, 700, altNow);
        const tracked = S.vec.add(S.vec.scl(baseLook, 1 - track), S.vec.scl(r, track));
        const climb = smooth01(120, 900, altNow);
        eye = S.vec.add(S.vec.scl(baseEye, 1 - climb), S.vec.scl(eye, climb));
        look = S.vec.add(S.vec.scl(tracked, 1 - climb), S.vec.scl(look, climb));
        camUp = S.vec.add(S.vec.scl(baseUp, 1 - climb), S.vec.scl(camUp, climb));
        const fov = this._handoffFov + (60 - this._handoffFov) * handoffK;
        this.sceneFov = fov;
        if (this.nearCam.fov !== fov) { this.nearCam.fov = fov; this.nearCam.updateProjectionMatrix(); }
      }
      this.camPos = eye;
      const c = this.nearCam, f = this.farCam;
      c.position.set(0, 0, 0); f.position.set(0, 0, 0);
      c.up.copy(toR(camUp).normalize()); f.up.copy(c.up);
      const target = toR(S.vec.sub(look, eye));
      c.lookAt(target); f.lookAt(target);
    }

    cycleCamera() { const i = this.camModes.indexOf(this.camMode); this.camMode = this.camModes[(i + 1) % this.camModes.length]; this.camOrbit = { yaw: 0, pitch: 0, idle: 0 }; return this.camMode; }
    orbitCamera(dyaw, dpitch) { this.camOrbit.yaw += dyaw; this.camOrbit.pitch = Math.max(-1.45, Math.min(1.45, this.camOrbit.pitch + dpitch)); this.camOrbit.idle = 0; }
    zoomCamera(factor) { this.zoom = Math.max(0.3, Math.min(8, (this.zoom || 1) * factor)); this.camOrbit.idle = 0; }
    recentre() { this.camOrbit = { yaw: 0, pitch: 0, idle: 0 }; this.zoom = 1; }

    // SCOPE: a narrow-field sky view along the current look direction (the vehicle is not drawn), so
    // the true-size planets and the Moon can be examined. fov in degrees, 0.2–12.
    setScope(on) { this.scope.on = !!on; }
    scopeZoom(f) { this.scope.fov = Math.max(0.2, Math.min(12, this.scope.fov * f)); }
    render() {
      const r = this.renderer, sc = this.scope;
      const prevAuto = r.autoClear;
      r.autoClear = false;
      r.setClearColor(sc.on ? new T.Color(0x000000).lerp(this.sky || new T.Color(0), 0.6) : (this.sky || new T.Color(0x000000)), 1);
      r.clear();
      const fov = sc.on ? sc.fov : (this.sceneFov || 60);
      if (this.farCam.fov !== fov) { this.farCam.fov = fov; this.farCam.updateProjectionMatrix(); }
      // planet points of light: fade out once the scope resolves the disk (model larger than the dot)
      const pxDeg = fov / Math.max(1, window.innerHeight);
      if (this.planets) for (const p of this.planets) p.sprite.visible = !(sc.on && p.deg / pxDeg > 6);
      r.render(this.far, this.farCam);
      if (!sc.on) { r.clearDepth(); r.render(this.near, this.nearCam); }
      r.autoClear = prevAuto;
    }
    resize() { const a = window.innerWidth / window.innerHeight; this.farCam.aspect = a; this.nearCam.aspect = a; this.farCam.updateProjectionMatrix(); this.nearCam.updateProjectionMatrix(); }
    dispose() {
      this.disposed = true; window.removeEventListener("resize", this._onResize);
      const free = (root) => root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map && m.map !== undefined) { /* shared textures are cached by the loader */ } m.dispose(); }); });
      free(this.far); free(this.groundGroup);   // GLB instances share cached geometry: not disposed here
      this.mixers.length = 0;
    }
  }
  window.ShuttleView = ShuttleView;
})();
