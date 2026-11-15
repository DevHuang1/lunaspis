/*
 * earth_globe.js — the shared Earth (kilometre units), used by the Shuttle view and the CubeSat
 * coverage view. Day map (team OrbitForge texture), city lights on the night side across a soft
 * terminator, procedural close-range detail, cloud layer and a thin limb glow.
 *
 *   const g = EarthGlobe.create(renderer);   scene.add(g.earth);
 *   g.setSunView(vec3)        sun direction in VIEW space (call per frame after the camera moves)
 *   g.earth.rotation.y = theta   (render mapping (x, z, -y): longitude 0 lies on +X at theta = 0)
 */
(function () {
  "use strict";
  const T = window.THREE;

  // tileable grey noise (~1) used to break up magnified texels of the Earth map at close range
  function detailTexture() {
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

  function create(renderer, opts) {
    opts = opts || {};
    const loader = new T.TextureLoader();
    const aniso = renderer && renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 1;
    const day = loader.load("textures/earth/earth_day_5400.jpg");
    if (T.sRGBEncoding) day.encoding = T.sRGBEncoding;
    day.anisotropy = aniso;
    const night = loader.load("textures/earth/earth_night_4096.jpg"); if (T.sRGBEncoding) night.encoding = T.sRGBEncoding; night.anisotropy = aniso;
    const mat = new T.MeshPhongMaterial({ map: day, specular: new T.Color(0x223344), shininess: 8, emissive: new T.Color(0xffffff), emissiveMap: night, emissiveIntensity: 1.0 });
    const detail = detailTexture(); detail.anisotropy = aniso;
    const g = { uniforms: null, textures: [day, night, detail] };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail }; sh.uniforms.uSunView = { value: new T.Vector3(0, 0, 1) };
      g.uniforms = sh.uniforms;
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
    const seg = opts.segments || [160, 96];
    const earth = new T.Mesh(new T.SphereGeometry(6371, seg[0], seg[1]), mat);
    // thin limb glow (view-dependent, additive) instead of a flat translucent shell
    const atmo = new T.Mesh(new T.SphereGeometry(6371 * 1.012, 96, 64), new T.ShaderMaterial({
      uniforms: { c: { value: new T.Color(0x4f9bff) } }, side: T.BackSide, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform vec3 c; varying vec3 vN; varying vec3 vV; void main(){ float d = abs(dot(vN, vV)); float k = pow(1.0 - d, 6.0) * 1.4; gl_FragColor = vec4(c * k, k); }" }));
    earth.add(atmo);
    const cloudTex = loader.load("textures/earth/earth_clouds_2048.png");   // team RGBA cloud map (2048 x 1024)
    cloudTex.anisotropy = aniso; g.textures.push(cloudTex);
    const clouds = new T.Mesh(new T.SphereGeometry(6371 * 1.004, seg[0], seg[1]), new T.MeshLambertMaterial({ map: cloudTex, transparent: true, opacity: opts.cloudOpacity !== undefined ? opts.cloudOpacity : 0.9, depthWrite: false }));
    earth.add(clouds);
    g.earth = earth; g.clouds = clouds; g.atmo = atmo; g.material = mat;
    g.setSunView = (v) => { if (g.uniforms) g.uniforms.uSunView.value.copy(v).normalize(); };
    g.dispose = () => {
      earth.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      g.textures.forEach((t) => t.dispose());
    };
    return g;
  }

  window.EarthGlobe = { create };
})();
