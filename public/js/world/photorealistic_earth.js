/**
 * ============================================================================
 * INTERFELLAS PHOTOREALISTIC EARTH & SPACE ATMOSPHERE SYSTEM
 * ============================================================================
 * High-fidelity 4K Earth shader ported from Perilune / SpaceShip:
 * - 4096px NASA Day Albedo & Night City Lights
 * - 2048px Normal & Specular mapping for ocean gloss and mountain topography
 * - Dynamic independent cloud layer with rotation drift
 * - Rayleigh atmospheric limb glow and twilight terminator blending
 */

(function (window) {
  "use strict";

  const vertexShader = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;

    uniform sampler2D uDay;
    uniform sampler2D uNight;
    uniform sampler2D uClouds;
    uniform sampler2D uNormalMap;
    uniform sampler2D uSpecular;
    uniform vec3 uSunDirection;
    uniform vec3 uCameraPosition;
    uniform float uCloudOffset;

    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPosition;

    void main() {
      vec3 viewDir = normalize(uCameraPosition - vWorldPosition);

      // Derivatives for bump/normal mapping
      vec3 dpdx = dFdx(vWorldPosition);
      vec3 dpdy = dFdy(vWorldPosition);
      vec2 duvdx = dFdx(vUv);
      vec2 duvdy = dFdy(vUv);
      vec3 tangent = normalize(dpdx * duvdy.y - dpdy * duvdx.y);
      vec3 bitangent = normalize(-dpdx * duvdy.x + dpdy * duvdx.x);
      vec3 baseNormal = normalize(vWorldNormal);
      vec3 tangentNormal = texture2D(uNormalMap, vUv).xyz * 2.0 - 1.0;
      vec3 normal = normalize(mat3(tangent, bitangent, baseNormal) * tangentNormal);

      vec3 sunDir = normalize(uSunDirection);
      float ndl = dot(normal, sunDir);
      float day = smoothstep(-0.2, 0.3, ndl);

      vec3 dayColor = texture2D(uDay, vUv).rgb;
      vec3 nightColor = texture2D(uNight, vUv).rgb;

      // Daylight diffuse + nocturnal electrical city lights
      vec3 surface = mix(nightColor * vec3(3.4, 2.9, 2.2), dayColor * (0.18 + 1.15 * max(ndl, 0.0)), day);
      surface += nightColor * (1.0 - day) * 1.1;
      surface += vec3(0.02, 0.05, 0.11) * (1.0 - day);

      // Cloud layer with independent UV animation drift
      float cloud = texture2D(uClouds, vUv + vec2(uCloudOffset, 0.0)).a;
      vec3 cloudColor = vec3(0.86, 0.92, 1.0) * (0.07 + 1.05 * max(ndl, 0.0));
      surface = mix(surface, cloudColor, cloud * 0.85);

      // Ocean specular gleam
      vec3 halfDir = normalize(sunDir + viewDir);
      float specMask = texture2D(uSpecular, vUv).r;
      float specular = pow(max(dot(normal, halfDir), 0.0), 90.0) * specMask;
      surface += vec3(1.0, 0.86, 0.68) * specular * 0.9 * day;

      // Atmospheric Rayleigh limb scattering glow
      float rimBase = 1.0 - max(dot(baseNormal, viewDir), 0.0);
      float rimWide = pow(rimBase, 2.1);
      float rimTight = pow(rimBase, 6.5);
      vec3 atmosphereColor = mix(
        vec3(0.24, 0.58, 1.0),
        vec3(0.85, 0.62, 0.38),
        clamp((1.0 - ndl) * 0.8, 0.0, 1.0)
      );
      surface += atmosphereColor * (rimWide * 0.42 + rimTight * 0.75);

      gl_FragColor = vec4(surface, 1.0);
    }
  `;

  class PhotorealisticEarth {
    constructor(scene, options = {}) {
      this.scene = scene;
      this.radius = options.radius || 340;
      this.position = options.position || new window.THREE.Vector3(0, -380, 40);
      this.cloudOffset = 0.0;
      this.group = new window.THREE.Group();
      this.group.name = "PhotorealisticEarthGroup";
      this.scene.add(this.group);

      this.sunDirection = new window.THREE.Vector3(120, 95, -80).normalize();
      this._initEarthMesh();
    }

    _initEarthMesh() {
      const texLoader = new window.THREE.TextureLoader();
      const loadTex = (path) => {
        const t = texLoader.load(path);
        t.wrapS = window.THREE.RepeatWrapping;
        t.wrapT = window.THREE.ClampToEdgeWrapping;
        return t;
      };

      const uDay = loadTex("textures/earth/earth_day_4096.jpg");
      const uNight = loadTex("textures/earth/earth_night_4096.jpg");
      const uClouds = loadTex("textures/earth/earth_clouds_1024.png");
      const uNormalMap = loadTex("textures/earth/earth_normal_2048.jpg");
      const uSpecular = loadTex("textures/earth/earth_specular_2048.jpg");

      this.uniforms = {
        uDay: { value: uDay },
        uNight: { value: uNight },
        uClouds: { value: uClouds },
        uNormalMap: { value: uNormalMap },
        uSpecular: { value: uSpecular },
        uSunDirection: { value: this.sunDirection },
        uCameraPosition: { value: new window.THREE.Vector3() },
        uCloudOffset: { value: 0.0 }
      };

      const geo = new window.THREE.SphereGeometry(this.radius, 64, 64);
      const mat = new window.THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: this.uniforms
      });

      this.earthMesh = new window.THREE.Mesh(geo, mat);
      this.group.position.copy(this.position);
      this.group.add(this.earthMesh);

      // Outer atmospheric halo
      const haloGeo = new window.THREE.SphereGeometry(this.radius * 1.025, 48, 48);
      const haloMat = new window.THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.16,
        side: window.THREE.BackSide
      });
      this.haloMesh = new window.THREE.Mesh(haloGeo, haloMat);
      this.group.add(this.haloMesh);
    }

    update(delta, camera) {
      if (this.uniforms && camera) {
        this.uniforms.uCameraPosition.value.copy(camera.position);
        this.cloudOffset = (this.cloudOffset + delta * 0.0006) % 1.0;
        this.uniforms.uCloudOffset.value = this.cloudOffset;
      }
      if (this.earthMesh) {
        this.earthMesh.rotation.y += delta * 0.004;
      }
    }

    dispose() {
      if (this.group && this.scene) {
        this.scene.remove(this.group);
      }
    }
  }

  window.PhotorealisticEarth = PhotorealisticEarth;
})(window);
