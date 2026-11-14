/**
 * ============================================================================
 * LUNASPIS // SOLAR SYSTEM ATLAS
 * ============================================================================
 * Full-screen 3D solar system theatre for the Lunaspis / Interfellas game.
 *
 * - Self-contained vanilla Three.js r128 module (no React, no build step).
 * - Opened from the HUD "SOLAR" button or the [O] key.
 * - Renders the Sun, planets, moons, orbit rings, asteroid belt and galaxy.
 * - Clicking a body opens an educational dossier with distance, light-time,
 *   transfer time, delta-v class, propellant mass and a budget estimate.
 *
 * The module hides the running game world and restores it exactly on close.
 * It has no runtime dependency on any external project.
 *
 * Texture attribution (CC BY 4.0 / public domain):
 *   Mercury..Neptune, Ceres, Moon, Sun, Saturn ring - Solar System Scope
 *   Europa - USGS Astrogeology (NASA/JPL/USGS)
 *   Titan - NASA/JPL-Caltech/Space Science Institute
 *   Earth - NASA Blue Marble (via three.js planets)
 * ============================================================================
 */

(function (window) {
  "use strict";

  const THREE = window.THREE;

  const G0 = 9.80665;
  const SUN_RADIUS = 2.2;
  const OVERVIEW_RADIUS = 62;
  const MIN_RADIUS = 5.5;
  const MAX_RADIUS = 135;
  const REF_WET_KG = 800;
  const ISP_CHEM = 318;
  const ISP_ION = 1850;

  const LAUNCH_TIERS = {
    light: { id: "light", label: "Light (Electron class)", costM: 28 },
    medium: { id: "medium", label: "Medium (Falcon 9 class)", costM: 72 },
    heavy: { id: "heavy", label: "Heavy (Falcon Heavy class)", costM: 118 },
    superheavy: { id: "superheavy", label: "Super-Heavy (SLS class)", costM: 175 }
  };

  const TIER_BY_DV = {
    "earth-orbit": "light",
    lunar: "medium",
    inner: "heavy",
    outer: "superheavy"
  };

  const REF_BUS_COST_M = 52;
  const REF_PROP_COST_M = 44;

  // layout.distance = orbit radius in scene units (sun-relative)
  // layout.size     = sphere radius in scene units
  // moons use layout.parent + layout.moonOrbit
  const DESTINATIONS = [
    {
      id: "earth", label: "Earth", kind: "planet", accent: "#6ee7ff",
      radius: 0.76, angle: 3.7, distance: 12.5, texture: null,
      atmosphere: "#6ab7ff", atmosphereOpacity: 0.12,
      facts: {
        diameterKm: 12742, gravity: 9.81, dayLength: "24 h", meanTempC: 15,
        atmosphere: "78% N2, 21% O2", moons: "1",
        distanceFromEarth: "0 km", distanceAu: "0 AU", lightDelay: "0 s"
      },
      env: { solarFluxWm2: 1361, radiation: 1, atmosphereKpa: 101.3 },
      transit: { months: 0, deltaVms: 400, deltaVClass: "earth-orbit", window: "Continuous access" },
      hazards: ["Crowded orbits", "Debris", "Short eclipse cycles"],
      profiles: ["Climate Monitor", "Comms Relay", "Orbiter"]
    },
    {
      id: "moon", label: "The Moon", kind: "moon", parent: "earth",
      accent: "#eceae3", radius: 0.3, angle: 1.4, moonOrbit: 2.35,
      texture: "textures/planets/moon.jpg",
      facts: {
        diameterKm: 3475, gravity: 1.62, dayLength: "29.5 Earth days", meanTempC: -20,
        atmosphere: "Essentially none", moons: "0",
        distanceFromEarth: "384,400 km", distanceAu: "0.0026 AU", lightDelay: "1.3 s"
      },
      env: { solarFluxWm2: 1361, radiation: 1.25, atmosphereKpa: 0 },
      transit: { months: 0.1, deltaVms: 3200, deltaVClass: "lunar", window: "Any month" },
      hazards: ["Long eclipses", "Regolith dust", "Deep thermal cycling"],
      profiles: ["Water Prospector", "Sample Return", "Relay", "Orbiter"]
    },
    {
      id: "mars", label: "Mars", kind: "planet", accent: "#d0a15c",
      radius: 0.6, angle: 5.4, distance: 19, texture: "textures/planets/mars.jpg",
      atmosphere: "#d0a15c", atmosphereOpacity: 0.1,
      facts: {
        diameterKm: 6779, gravity: 3.71, dayLength: "24.6 h", meanTempC: -63,
        atmosphere: "Thin CO2 (0.6 kPa)", moons: "2",
        distanceFromEarth: "225 million km", distanceAu: "1.50 AU", lightDelay: "3-22 min"
      },
      env: { solarFluxWm2: 590, radiation: 1.5, atmosphereKpa: 0.6 },
      transit: { months: 8, deltaVms: 3600, deltaVClass: "inner", window: "Every 26 months" },
      hazards: ["Thin CO2 atmosphere", "Global dust storms", "Long comms delay"],
      profiles: ["Water Prospector", "Sample Return", "Life Detection", "Orbiter"]
    },
    {
      id: "venus", label: "Venus", kind: "planet", accent: "#d0a15c",
      radius: 0.68, angle: 2.3, distance: 9, texture: "textures/planets/venus.jpg",
      atmosphere: "#d0a15c", atmosphereOpacity: 0.26,
      facts: {
        diameterKm: 12104, gravity: 8.87, dayLength: "243 Earth days", meanTempC: 464,
        atmosphere: "CO2, 92 bar", moons: "0",
        distanceFromEarth: "41 million km", distanceAu: "0.27 AU", lightDelay: "2-14 min"
      },
      env: { solarFluxWm2: 2611, radiation: 1.1, atmosphereKpa: 9200 },
      transit: { months: 5, deltaVms: 3500, deltaVClass: "inner", window: "Every 19 months" },
      hazards: ["Crushing pressure", "Sulfuric acid clouds", "Runaway greenhouse"],
      profiles: ["Atmospheric Probe", "Climate Monitor", "Orbiter"]
    },
    {
      id: "mercury", label: "Mercury", kind: "planet", accent: "#eceae3",
      radius: 0.48, angle: 0.6, distance: 6, texture: "textures/planets/mercury.jpg",
      facts: {
        diameterKm: 4880, gravity: 3.7, dayLength: "59 Earth days", meanTempC: 167,
        atmosphere: "Essentially none", moons: "0",
        distanceFromEarth: "77 million km", distanceAu: "0.52 AU", lightDelay: "4-13 min"
      },
      env: { solarFluxWm2: 9126, radiation: 2.2, atmosphereKpa: 0 },
      transit: { months: 7, deltaVms: 5400, deltaVClass: "inner", window: "Every 3-4 months" },
      hazards: ["Extreme solar flux", "Severe thermal swings", "No atmosphere"],
      profiles: ["Orbiter", "Flyby"]
    },
    {
      id: "ceres", label: "Ceres", kind: "dwarf", accent: "#eceae3",
      radius: 0.26, angle: 0.1, distance: 23, texture: "textures/planets/ceres.jpg",
      facts: {
        diameterKm: 940, gravity: 0.28, dayLength: "9 h", meanTempC: -105,
        atmosphere: "Essentially none", moons: "0",
        distanceFromEarth: "260 million km", distanceAu: "1.74 AU", lightDelay: "14-22 min"
      },
      env: { solarFluxWm2: 180, radiation: 1.2, atmosphereKpa: 0 },
      transit: { months: 36, deltaVms: 4200, deltaVClass: "inner", window: "Every 15 months" },
      hazards: ["Microgravity operations", "Airless surface", "Long transit"],
      profiles: ["Sample Return", "Orbiter"]
    },
    {
      id: "jupiter", label: "Jupiter", kind: "planet", accent: "#e7c58c",
      radius: 1.55, angle: 1.5, distance: 28, texture: "textures/planets/jupiter.jpg",
      atmosphere: "#e7c58c", atmosphereOpacity: 0.08,
      facts: {
        diameterKm: 139820, gravity: 24.79, dayLength: "9.9 h", meanTempC: -110,
        atmosphere: "Hydrogen / helium", moons: "95+",
        distanceFromEarth: "628 million km", distanceAu: "4.20 AU", lightDelay: "33-53 min"
      },
      env: { solarFluxWm2: 50, radiation: 4, atmosphereKpa: 100000 },
      transit: { months: 60, deltaVms: 6300, deltaVClass: "outer", window: "Every 13 months" },
      hazards: ["Intense radiation belts", "Deep gravity well", "No solid surface"],
      profiles: ["Orbiter", "Flyby", "Atmospheric Probe"]
    },
    {
      id: "europa", label: "Europa", kind: "moon", parent: "jupiter",
      accent: "#93c5fd", radius: 0.34, angle: 2.2, moonOrbit: 3.35,
      texture: "textures/planets/europa.webp", tint: "#eceae3",
      roughness: 0.55, metalness: 0.06,
      atmosphere: "#93c5fd", atmosphereOpacity: 0.08,
      facts: {
        diameterKm: 3122, gravity: 1.31, dayLength: "3.6 Earth days", meanTempC: -160,
        atmosphere: "Trace oxygen", moons: "0",
        distanceFromEarth: "628 million km", distanceAu: "4.20 AU", lightDelay: "33-53 min"
      },
      env: { solarFluxWm2: 50, radiation: 3.2, atmosphereKpa: 0 },
      transit: { months: 60, deltaVms: 6900, deltaVClass: "outer", window: "Every 13 months" },
      hazards: ["Jupiter radiation", "Ice-shell landing", "Deep comms delay"],
      profiles: ["Ice Prospector", "Life Detection", "Orbiter"]
    },
    {
      id: "saturn", label: "Saturn", kind: "planet", accent: "#e7c58c",
      radius: 1.38, angle: 2.8, distance: 37, texture: "textures/planets/saturn.jpg",
      atmosphere: "#e7c58c", atmosphereOpacity: 0.08,
      facts: {
        diameterKm: 116460, gravity: 10.44, dayLength: "10.7 h", meanTempC: -140,
        atmosphere: "Hydrogen / helium", moons: "146+",
        distanceFromEarth: "1.4 billion km", distanceAu: "9.36 AU", lightDelay: "70-90 min"
      },
      env: { solarFluxWm2: 15, radiation: 2.2, atmosphereKpa: 100000 },
      transit: { months: 84, deltaVms: 7300, deltaVClass: "outer", window: "Every 12 months" },
      hazards: ["Ring-plane navigation", "Long transit", "Low solar power"],
      profiles: ["Orbiter", "Flyby", "Atmospheric Probe"]
    },
    {
      id: "titan", label: "Titan", kind: "moon", parent: "saturn",
      accent: "#d0a15c", radius: 0.38, angle: 3.6, moonOrbit: 3.55,
      texture: "textures/planets/titan.jpg", tint: "#d9a35b",
      emissive: "#8a4f18", emissiveIntensity: 0.18,
      atmosphere: "#d0a15c", atmosphereOpacity: 0.34,
      facts: {
        diameterKm: 5150, gravity: 1.35, dayLength: "15.9 Earth days", meanTempC: -179,
        atmosphere: "Dense nitrogen (1.47 bar)", moons: "0",
        distanceFromEarth: "1.4 billion km", distanceAu: "9.36 AU", lightDelay: "70-90 min"
      },
      env: { solarFluxWm2: 15, radiation: 1.1, atmosphereKpa: 146.7 },
      transit: { months: 84, deltaVms: 7500, deltaVClass: "outer", window: "Every 12 months" },
      hazards: ["Dense haze", "Cryogenic methane lakes", "Low sunlight"],
      profiles: ["Lake Probe", "Life Detection", "Atmospheric Probe", "Orbiter"]
    },
    {
      id: "uranus", label: "Uranus", kind: "planet", accent: "#e7c58c",
      radius: 0.94, angle: 4.2, distance: 46, texture: "textures/planets/uranus.jpg",
      atmosphere: "#e7c58c", atmosphereOpacity: 0.12,
      facts: {
        diameterKm: 50724, gravity: 8.69, dayLength: "17.2 h", meanTempC: -195,
        atmosphere: "Hydrogen / helium / methane", moons: "27",
        distanceFromEarth: "2.7 billion km", distanceAu: "18.05 AU", lightDelay: "2.5-2.9 h"
      },
      env: { solarFluxWm2: 3.7, radiation: 1.4, atmosphereKpa: 100000 },
      transit: { months: 108, deltaVms: 8200, deltaVClass: "outer", window: "Every 12 months" },
      hazards: ["Extreme distance", "Very low solar power", "Long comms blackouts"],
      profiles: ["Orbiter", "Flyby"]
    },
    {
      id: "neptune", label: "Neptune", kind: "planet", accent: "#93c5fd",
      radius: 0.9, angle: 5.5, distance: 53, texture: "textures/planets/neptune.jpg",
      atmosphere: "#93c5fd", atmosphereOpacity: 0.12,
      facts: {
        diameterKm: 49244, gravity: 11.15, dayLength: "16.1 h", meanTempC: -200,
        atmosphere: "Hydrogen / helium / methane", moons: "14",
        distanceFromEarth: "4.3 billion km", distanceAu: "28.7 AU", lightDelay: "4.0-4.7 h"
      },
      env: { solarFluxWm2: 1.5, radiation: 1.3, atmosphereKpa: 100000 },
      transit: { months: 144, deltaVms: 8600, deltaVClass: "outer", window: "Every 12 months" },
      hazards: ["Farthest target", "Minimal solar power", "Multi-hour light delay"],
      profiles: ["Flyby", "Orbiter"]
    }
  ];

  const DESTINATION_BY_ID = {};
  DESTINATIONS.forEach(function (entry) { DESTINATION_BY_ID[entry.id] = entry; });

  function formatInt(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function formatMonths(months) {
    if (!months) return "0 months";
    if (months < 1) return "~" + Math.round(months * 30) + " days";
    if (months < 12) return months + " months";
    return months + " months (" + (months / 12).toFixed(1) + " yr)";
  }

  function propellantKg(deltaV, isp) {
    return REF_WET_KG * (1 - Math.exp(-deltaV / (isp * G0)));
  }

  function budgetForTier(tier) {
    const base = tier.costM + REF_BUS_COST_M + REF_PROP_COST_M;
    const high = Math.round(base * 1.35);
    return "$" + base + "M - $" + high + "M";
  }

  function atmosphereLabel(kpa) {
    if (!kpa) return "Vacuum";
    if (kpa >= 1000) return formatInt(kpa) + " kPa (crushing)";
    return kpa + " kPa";
  }

  function makeCanvasTexture(draw, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size || 512;
    canvas.height = size || 512;
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.needsUpdate = true;
    return texture;
  }

  function makeGlowTexture() {
    return makeCanvasTexture(function (ctx, w, h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(255,246,210,1)");
      g.addColorStop(0.18, "rgba(255,190,90,0.9)");
      g.addColorStop(0.45, "rgba(255,120,40,0.35)");
      g.addColorStop(1, "rgba(255,90,20,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }, 256);
  }

  function makeGalaxyTexture() {
    let seed = 987654321;
    function rnd() {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    }
    return makeCanvasTexture(function (ctx, w, h) {
      ctx.fillStyle = "#020307";
      ctx.fillRect(0, 0, w, h);
      const core = ctx.createRadialGradient(w * 0.5, h * 0.48, 0, w * 0.5, h * 0.48, w * 0.34);
      core.addColorStop(0, "rgba(255,238,200,0.9)");
      core.addColorStop(0.16, "rgba(255,196,120,0.45)");
      core.addColorStop(0.42, "rgba(120,130,220,0.16)");
      core.addColorStop(1, "rgba(10,16,40,0)");
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, w, h);
      for (let arm = 0; arm < 4; arm += 1) {
        const offset = (arm / 4) * Math.PI * 2;
        for (let i = 0; i < 1400; i += 1) {
          const t = i / 1400;
          const radius = w * 0.06 + t * w * 0.44;
          const angle = offset + t * 7.2 + (rnd() - 0.5) * 0.32;
          const spread = (rnd() - 0.5) * (4 + t * 30);
          const x = w * 0.5 + Math.cos(angle) * radius + spread;
          const y = h * 0.5 + Math.sin(angle) * radius * 0.72 + spread * 0.7;
          const alpha = (0.06 + rnd() * 0.4) * (1 - t * 0.3);
          ctx.fillStyle = i % 7 === 0
            ? "rgba(150,190,255," + alpha.toFixed(3) + ")"
            : "rgba(255,226,186," + alpha.toFixed(3) + ")";
          const dot = 0.5 + rnd() * 1.3;
          ctx.fillRect(x, y, dot, dot);
        }
      }
      for (let i = 0; i < 500; i += 1) {
        const x = rnd() * w;
        const y = rnd() * h;
        ctx.fillStyle = "rgba(220,235,255," + (0.15 + rnd() * 0.6).toFixed(3) + ")";
        ctx.fillRect(x, y, 1, 1);
      }
    }, 1024);
  }

  function makeLabelTexture(text, accent) {
    return makeCanvasTexture(function (ctx, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(3,6,12,0.72)";
      ctx.fillRect(8, 34, w - 16, 60);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.strokeRect(8, 34, w - 16, 60);
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(34, 64, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#eceae3";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "600 40px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(String(text).toUpperCase(), 58, 64);
    }, 512);
  }

  function propellantRow(label, kg) {
    return '<div class="ss-row"><span>' + label + '</span><b>' + formatInt(kg) + ' kg</b></div>';
  }

  function chipList(items, kind) {
    return items.map(function (item) {
      return '<span class="ss-chip ss-chip-' + kind + '">' + item + '</span>';
    }).join("");
  }

  class SolarSystemManager {
    constructor() {
      if (!THREE) return;
      this.THREE = THREE;
      this.initialized = false;
      this.isActive = false;

      this.scene = null;
      this.camera = null;
      this.renderer = null;

      this.group = null;
      this.uiRoot = null;
      this.savedState = null;

      this.bodyNodes = new Map();
      this.bodyPositions = new Map();
      this.pickables = [];
      this.raycaster = new THREE.Raycaster();

      this.selected = null;
      this.hovered = null;
      this.following = false;

      this.camTarget = new THREE.Vector3(0, 0, 0);
      this.desiredTarget = new THREE.Vector3(0, 0, 0);
      this.camSpherical = { radius: 18, theta: 0.7, phi: 1.12 };
      this.desiredRadius = OVERVIEW_RADIUS;

      this.pointers = new Map();
      this.dragging = false;
      this.dragMoved = 0;
      this.lastPointer = { x: 0, y: 0 };
      this.pinchStart = 0;
      this.pinchRadius = OVERVIEW_RADIUS;
      this.pointerDownAt = 0;

      this.texLoader = null;
      this.texTotal = 0;
      this.texDone = 0;
      this.time = 0;
    }

    init(scene, camera, renderer) {
      if (!window.THREE) {
        console.warn("[SolarSystem] THREE.js is not available.");
        return;
      }
      if (this.initialized) return;
      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;
      this.initialized = true;

      this._build();
      this._bindPointerControls();
    }

    _loadTexture(path, srgb) {
      const THREE = window.THREE;
      if (!this.texLoader) this.texLoader = new THREE.TextureLoader();
      this.texTotal += 1;
      const texture = this.texLoader.load(
        path,
        () => { this.texDone += 1; this._refreshLoader(); },
        undefined,
        () => {
          this.texDone += 1;
          console.warn("[SolarSystem] Failed to load texture:", path);
          this._refreshLoader();
        }
      );
      texture.encoding = srgb === false ? THREE.LinearEncoding : THREE.sRGBEncoding;
      texture.anisotropy = 8;
      return texture;
    }

    _build() {
      const THREE = window.THREE;
      this.group = new THREE.Group();
      this.group.name = "SolarSystemAtlasGroup";
      this.group.visible = false;
      this.scene.add(this.group);

      this._buildLights();
      this._buildSun();
      this._buildOrbitRings();
      this._buildBodies();
      this._buildAsteroidBelt();
      this._buildGalaxy();

      this._layoutBodies(0);
    }

    _buildLights() {
      const THREE = window.THREE;
      this.group.add(new THREE.AmbientLight(0x9fb8d9, 0.5));
      this.group.add(new THREE.HemisphereLight(0x9cc7ff, 0x05070c, 0.35));

      const key = new THREE.PointLight(0xffe6b8, 2.4, 0, 0);
      key.position.set(0, 0, 0);
      this.group.add(key);

      const warm = new THREE.PointLight(0xff9a4d, 0.7, 0, 0);
      warm.position.set(0, 0, 0);
      this.group.add(warm);
    }

    _buildSun() {
      const THREE = window.THREE;
      const sunTex = this._loadTexture("textures/planets/sun.webp");
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, map: sunTex });
      material.toneMapped = false;
      const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 48, 32), material);
      this.group.add(sun);
      this.sunMesh = sun;

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: 0xffb066,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      }));
      halo.scale.set(SUN_RADIUS * 11, SUN_RADIUS * 11, 1);
      this.group.add(halo);
    }

    _buildOrbitRings() {
      const THREE = window.THREE;
      const list = DESTINATIONS.filter(function (entry) { return !entry.parent; });
      list.forEach((entry) => {
        const points = [];
        for (let i = 0; i <= 180; i += 1) {
          const a = (i / 180) * Math.PI * 2;
          points.push(new THREE.Vector3(Math.cos(a) * entry.distance, 0, Math.sin(a) * entry.distance));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.35 });
        const ring = new THREE.Line(geo, mat);
        ring.name = "orbit-" + entry.id;
        this.group.add(ring);
      });
    }

    _planetMaterial(entry) {
      const THREE = window.THREE;
      if (entry.id === "earth") {
        const day = this._loadTexture("textures/earth/earth_day_4096.jpg");
        const night = this._loadTexture("textures/earth/earth_night_4096.jpg");
        return new THREE.MeshPhongMaterial({
          map: day,
          emissive: 0xffffff,
          emissiveMap: night,
          emissiveIntensity: 0.5,
          specular: 0x2a2a2a,
          shininess: 16
        });
      }
      const map = this._loadTexture(entry.texture);
      return new THREE.MeshStandardMaterial({
        map: map,
        color: entry.tint || 0xffffff,
        roughness: entry.roughness != null ? entry.roughness : 0.92,
        metalness: entry.metalness != null ? entry.metalness : 0.02,
        emissive: entry.emissive ? new THREE.Color(entry.emissive) : new THREE.Color(0x000000),
        emissiveIntensity: entry.emissiveIntensity || 0
      });
    }

    _buildBodies() {
      const THREE = window.THREE;
      const isMobile = this._isMobile();
      const segmentScale = isMobile ? 0.5 : 1;

      DESTINATIONS.forEach((entry) => {
        const node = new THREE.Group();
        node.name = "body-" + entry.id;
        node.userData.destId = entry.id;
        this.group.add(node);

        const seg = Math.max(20, Math.round(64 * segmentScale));
        const geo = new THREE.SphereGeometry(entry.radius, seg, Math.round(seg * 0.66));
        const sphere = new THREE.Mesh(geo, this._planetMaterial(entry));
        sphere.userData.destId = entry.id;
        node.add(sphere);
        this.pickables.push(sphere);
        node.userData.sphere = sphere;

        if (entry.atmosphere) {
          const atm = new THREE.Mesh(
            new THREE.SphereGeometry(entry.radius, Math.round(seg * 0.6), Math.round(seg * 0.4)),
            new THREE.MeshBasicMaterial({
              color: entry.atmosphere,
              transparent: true,
              opacity: entry.atmosphereOpacity != null ? entry.atmosphereOpacity : 0.1,
              side: THREE.BackSide,
              depthWrite: false
            })
          );
          atm.scale.setScalar(1.045);
          atm.userData.destId = entry.id;
          node.add(atm);
          this.pickables.push(atm);
        }

        if (entry.id === "earth") {
          const cloudTex = this._loadTexture("textures/earth/earth_clouds_1024.png");
          const clouds = new THREE.Mesh(
            new THREE.SphereGeometry(entry.radius * 1.012, seg, Math.round(seg * 0.66)),
            new THREE.MeshPhongMaterial({
              map: cloudTex,
              transparent: true,
              opacity: 0.55,
              depthWrite: false
            })
          );
          node.add(clouds);
          node.userData.clouds = clouds;
        }

        if (entry.id === "saturn") {
          const rings = this._buildSaturnRings(entry.radius);
          rings.userData.destId = entry.id;
          node.add(rings);
          this.pickables.push(rings);
        }

        const label = new THREE.Sprite(new THREE.SpriteMaterial({
          map: makeLabelTexture(entry.label, entry.accent),
          transparent: true,
          depthWrite: false,
          depthTest: true
        }));
        label.position.set(0, entry.radius + 0.5, 0);
        label.scale.set(1.2, 0.3, 1);
        node.add(label);
        node.userData.label = label;

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(entry.radius * 1.35, entry.radius * 1.44, 56),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(entry.accent),
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        );
        ring.rotation.x = Math.PI / 2;
        ring.visible = false;
        node.add(ring);
        node.userData.ring = ring;

        if (!entry.parent) {
          entry._orbitSpeed = 0.09 / Math.pow(entry.distance / 10, 0.9);
        } else {
          entry._moonSpeed = 0.32;
        }

        this.bodyNodes.set(entry.id, node);
      });
    }

    _buildSaturnRings(radius) {
      const THREE = window.THREE;
      const inner = radius * 1.35;
      const outer = radius * 2.25;
      const ringTex = this._loadTexture("textures/planets/saturn_ring_alpha.png");
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uRing: { value: ringTex },
          uInner: { value: inner },
          uOuter: { value: outer },
          uOpacity: { value: 0.95 }
        },
        vertexShader: [
          "varying vec3 vLocal;",
          "void main() {",
          "  vLocal = position;",
          "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
          "}"
        ].join("\n"),
        fragmentShader: [
          "precision highp float;",
          "uniform sampler2D uRing;",
          "uniform float uInner;",
          "uniform float uOuter;",
          "uniform float uOpacity;",
          "varying vec3 vLocal;",
          "void main() {",
          "  float radius = length(vLocal.xy);",
          "  float t = clamp((radius - uInner) / max(uOuter - uInner, 0.001), 0.0, 1.0);",
          "  vec4 ring = texture2D(uRing, vec2(t, 0.5));",
          "  gl_FragColor = vec4(ring.rgb, ring.a * uOpacity);",
          "}"
        ].join("\n"),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 128, 1), material);
      mesh.rotation.x = Math.PI / 2;
      mesh.rotation.z = 0.28;
      return mesh;
    }

    _buildAsteroidBelt() {
      if (this._isMobile()) return;
      const THREE = window.THREE;
      let seed = 8123;
      function rnd() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }
      const count = 620;
      const geo = new THREE.DodecahedronGeometry(1, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 0.96, metalness: 0.05 });
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < count; i += 1) {
        const radius = 22 + rnd() * 4.5;
        const angle = rnd() * Math.PI * 2;
        dummy.position.set(Math.cos(angle) * radius, (rnd() - 0.5) * 0.7, Math.sin(angle) * radius);
        dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
        dummy.scale.setScalar(0.015 + rnd() * 0.04);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.beltGroup = new THREE.Group();
      this.beltGroup.add(mesh);
      this.group.add(this.beltGroup);
    }

    _buildGalaxy() {
      const THREE = window.THREE;
      const galaxy = new THREE.Mesh(
        new THREE.SphereGeometry(260, 32, 24),
        new THREE.MeshBasicMaterial({
          map: makeGalaxyTexture(),
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          toneMapped: false
        })
      );
      galaxy.renderOrder = -10;
      this.galaxyMesh = galaxy;
      this.group.add(galaxy);
    }

    _isMobile() {
      return ("ontouchstart" in window) && ((navigator.maxTouchPoints || 0) > 0) && (window.innerWidth <= 1100);
    }

    _layoutBodies(elapsed) {
      DESTINATIONS.forEach((entry) => {
        const node = this.bodyNodes.get(entry.id);
        if (!node) return;
        if (!entry.parent) {
          const speed = entry._orbitSpeed || 0.02;
          const angle = entry.angle + elapsed * speed;
          node.position.set(Math.cos(angle) * entry.distance, 0, Math.sin(angle) * entry.distance);
        } else {
          const parentNode = this.bodyNodes.get(entry.parent);
          if (!parentNode) return;
          const speed = entry._moonSpeed || 0.3;
          const angle = entry.angle + elapsed * speed;
          const r = entry.moonOrbit || 2.5;
          node.position.set(
            parentNode.position.x + Math.cos(angle) * r,
            parentNode.position.y + Math.sin(angle * 1.6) * r * 0.18,
            parentNode.position.z + Math.sin(angle) * r
          );
        }
        this.bodyPositions.set(entry.id, node.position.clone());
      });
    }

    _ensureUI() {
      if (this.uiRoot) return;
      const root = document.createElement("div");
      root.id = "solar-system-ui";
      root.style.display = "none";
      root.innerHTML = [
        "<style>",
        "#solar-system-ui{position:fixed;inset:0;z-index:162;pointer-events:none;color:#eceae3;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;}",
        "#solar-system-ui .ss-panel{pointer-events:auto;background:rgba(6,11,22,0.9);border:1px solid rgba(208,161,92,0.28);backdrop-filter:blur(12px);border-radius:10px;}",
        "#ss-topbar{position:absolute;top:12px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 14px;}",
        "#ss-brand{display:flex;align-items:center;gap:10px;}",
        "#ss-brand .ss-dot{width:9px;height:9px;border-radius:50%;background:#d0a15c;box-shadow:0 0 10px #d0a15c;}",
        "#ss-title{font-size:11px;font-weight:700;letter-spacing:1.5px;color:#d0a15c;}",
        "#ss-sub{font-size:10px;color:#a6adb6;margin-top:2px;}",
        "#ss-actions{display:flex;gap:6px;flex-wrap:wrap;}",
        ".ss-btn{pointer-events:auto;padding:6px 11px;border-radius:5px;border:1px solid rgba(208,161,92,0.45);background:rgba(208,161,92,0.14);color:#e7c58c;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;letter-spacing:0.4px;}",
        ".ss-btn:hover{background:rgba(208,161,92,0.24);}",
        "#ss-exit{border-color:rgba(198,121,121,0.55);background:rgba(198,121,121,0.16);color:#c67979;}",
        "#ss-exit:hover{background:rgba(198,121,121,0.28);}",
        "#ss-dossier{pointer-events:auto;position:absolute;top:78px;left:12px;width:302px;max-width:calc(100vw - 24px);max-height:calc(100vh - 200px);overflow-y:auto;padding:14px;}",
        ".ss-kicker{font-size:9px;font-weight:700;letter-spacing:1.4px;color:#d0a15c;margin-bottom:6px;}",
        ".ss-name{font-size:19px;font-weight:700;letter-spacing:0.4px;color:#eceae3;}",
        ".ss-kind{font-size:9.5px;text-transform:uppercase;letter-spacing:1.2px;color:#a6adb6;margin-top:2px;margin-bottom:10px;}",
        ".ss-section{margin-top:11px;padding-top:9px;border-top:1px solid rgba(255,255,255,0.09);}",
        ".ss-section-title{font-size:9px;font-weight:700;letter-spacing:1.3px;color:#d0a15c;margin-bottom:6px;}",
        ".ss-row{display:flex;justify-content:space-between;gap:10px;font-size:10.5px;line-height:1.75;color:#a6adb6;}",
        ".ss-row b{color:#eceae3;font-weight:600;text-align:right;}",
        ".ss-note{font-size:9px;color:#6f7782;line-height:1.5;margin-top:8px;}",
        ".ss-chip{display:inline-block;margin:2px 3px 2px 0;padding:2px 7px;border-radius:10px;font-size:9px;letter-spacing:0.3px;}",
        ".ss-chip-hazard{background:rgba(198,121,121,0.13);border:1px solid rgba(198,121,121,0.3);color:#c67979;}",
        ".ss-chip-profile{background:rgba(208,161,92,0.12);border:1px solid rgba(208,161,92,0.3);color:#e7c58c;}",
        ".ss-overview-row{display:flex;align-items:center;gap:8px;width:100%;padding:6px 4px;border:0;border-bottom:1px solid rgba(255,255,255,0.06);background:transparent;color:#eceae3;font-family:inherit;font-size:10.5px;cursor:pointer;text-align:left;}",
        ".ss-overview-row:hover{background:rgba(255,255,255,0.05);}",
        ".ss-overview-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;}",
        ".ss-overview-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
        ".ss-overview-meta{flex:0 0 auto;color:#a6adb6;font-size:9px;}",
        "#ss-strip{pointer-events:auto;position:absolute;bottom:12px;left:12px;right:12px;display:flex;gap:6px;overflow-x:auto;padding:8px 10px;scrollbar-width:thin;}",
        ".ss-strip-btn{pointer-events:auto;display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;padding:6px 10px;border-radius:14px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.04);color:#eceae3;font-family:inherit;font-size:9.5px;cursor:pointer;white-space:nowrap;}",
        ".ss-strip-btn:hover{background:rgba(255,255,255,0.09);}",
        ".ss-strip-btn.is-active{border-color:rgba(208,161,92,0.7);background:rgba(208,161,92,0.16);color:#eceae3;}",
        ".ss-strip-dot{width:6px;height:6px;border-radius:50%;}",
        "#ss-loader{pointer-events:auto;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:280px;padding:16px;display:none;flex-direction:column;gap:9px;}",
        "#ss-loader-label{font-size:10px;font-weight:700;letter-spacing:1.3px;color:#d0a15c;}",
        "#ss-loader-track{height:5px;border-radius:3px;background:rgba(255,255,255,0.1);overflow:hidden;}",
        "#ss-loader-fill{height:100%;width:0%;background:linear-gradient(90deg,#d0a15c,#d0a15c);transition:width 0.2s;}",
        "#ss-loader-pct{font-size:9.5px;color:#a6adb6;text-align:right;}",
        "#ss-credits{position:absolute;bottom:62px;right:12px;font-size:8px;color:#6f7782;letter-spacing:0.3px;max-width:340px;text-align:right;line-height:1.5;}",
        "</style>",
        '<div id="ss-topbar" class="ss-panel">',
        '  <div id="ss-brand">',
        '    <span class="ss-dot"></span>',
        '    <div><div id="ss-title">SOLAR SYSTEM ATLAS</div><div id="ss-sub">Drag to orbit - Scroll / pinch to zoom - Select a destination</div></div>',
        '  </div>',
        '  <div id="ss-actions">',
        '    <button type="button" class="ss-btn" id="ss-reset">RESET VIEW</button>',
        '    <button type="button" class="ss-btn" id="ss-exit">EXIT [O]</button>',
        '  </div>',
        '</div>',
        '<div id="ss-dossier" class="ss-panel"></div>',
        '<div id="ss-strip" class="ss-panel"></div>',
        '<div id="ss-credits">Textures: Solar System Scope (CC BY 4.0) - Europa USGS - Titan NASA/JPL-Caltech - Earth NASA. Approximate educational values.</div>',
        '<div id="ss-loader" class="ss-panel">',
        '  <div id="ss-loader-label">LOADING SOLAR ATLAS</div>',
        '  <div id="ss-loader-track"><div id="ss-loader-fill"></div></div>',
        '  <div id="ss-loader-pct">0%</div>',
        '</div>'
      ].join("\n");

      document.body.appendChild(root);
      this.uiRoot = root;

      root.querySelector("#ss-exit").addEventListener("click", () => this.close());
      root.querySelector("#ss-reset").addEventListener("click", () => this._resetView());

      root.addEventListener("click", (event) => {
        const target = event.target.closest("[data-dest]");
        if (!target) return;
        event.preventDefault();
        const id = target.getAttribute("data-dest");
        if (id) this._selectDestination(id);
      });
    }

    _buildStrip() {
      if (!this.uiRoot) return;
      const host = this.uiRoot.querySelector("#ss-strip");
      if (!host) return;
      host.innerHTML = DESTINATIONS.map(function (entry) {
        return '<button type="button" class="ss-strip-btn" data-dest="' + entry.id + '">' +
          '<span class="ss-strip-dot" style="background:' + entry.accent + '"></span>' +
          entry.label + "</button>";
      }).join("");
    }

    _syncStrip() {
      if (!this.uiRoot) return;
      const host = this.uiRoot.querySelector("#ss-strip");
      if (!host) return;
      const buttons = host.querySelectorAll("[data-dest]");
      for (let i = 0; i < buttons.length; i += 1) {
        const btn = buttons[i];
        btn.classList.toggle("is-active", btn.getAttribute("data-dest") === this.selected);
      }
    }

    _refreshLoader() {
      if (!this.uiRoot) return;
      const loader = this.uiRoot.querySelector("#ss-loader");
      if (!loader) return;
      if (this.texDone >= this.texTotal) {
        loader.style.display = "none";
        return;
      }
      if (this.isActive) {
        loader.style.display = "flex";
        const pct = this.texTotal ? Math.round((this.texDone / this.texTotal) * 100) : 100;
        const fill = loader.querySelector("#ss-loader-fill");
        const label = loader.querySelector("#ss-loader-pct");
        if (fill) fill.style.width = pct + "%";
        if (label) label.textContent = pct + "%";
      }
    }

    _renderOverview() {
      if (!this.uiRoot) return;
      const host = this.uiRoot.querySelector("#ss-dossier");
      if (!host) return;
      const rows = DESTINATIONS.map(function (entry) {
        return '<button type="button" class="ss-overview-row" data-dest="' + entry.id + '">' +
          '<span class="ss-overview-dot" style="background:' + entry.accent + '"></span>' +
          '<span class="ss-overview-name">' + entry.label + "</span>" +
          '<span class="ss-overview-meta">' + entry.facts.distanceFromEarth + " - " + formatMonths(entry.transit.months) + "</span>" +
          "</button>";
      }).join("");
      host.innerHTML =
        '<div class="ss-kicker">SYSTEM OVERVIEW</div>' +
        '<div class="ss-name">Solar System</div>' +
        '<div class="ss-kind">12 destinations - select a body</div>' +
        '<div class="ss-section">' + rows + "</div>" +
        '<div class="ss-note">Distances and transfer times are approximate educational values. Delta-v is an in-space transfer from low Earth orbit.</div>';
    }

    _renderDossier(id) {
      if (!this.uiRoot) return;
      const entry = DESTINATION_BY_ID[id];
      if (!entry) return;
      const host = this.uiRoot.querySelector("#ss-dossier");
      if (!host) return;

      const tier = LAUNCH_TIERS[TIER_BY_DV[entry.transit.deltaVClass] || "medium"];
      const chemKg = propellantKg(entry.transit.deltaVms, ISP_CHEM);
      const ionKg = propellantKg(entry.transit.deltaVms, ISP_ION);
      const kindLabel = entry.kind + (entry.parent ? " of " + DESTINATION_BY_ID[entry.parent].label : "");

      host.innerHTML =
        '<div class="ss-kicker">DESTINATION DOSSIER</div>' +
        '<div class="ss-name">' + entry.label + "</div>" +
        '<div class="ss-kind">' + kindLabel + "</div>" +

        '<div class="ss-section">' +
        '<div class="ss-section-title">REACH</div>' +
        '<div class="ss-row"><span>Distance from Earth</span><b>' + entry.facts.distanceFromEarth + "</b></div>" +
        '<div class="ss-row"><span>Distance</span><b>' + entry.facts.distanceAu + "</b></div>" +
        '<div class="ss-row"><span>One-way light time</span><b>' + entry.facts.lightDelay + "</b></div>" +
        '<div class="ss-row"><span>Transfer time</span><b>' + formatMonths(entry.transit.months) + "</b></div>" +
        '<div class="ss-row"><span>Launch window</span><b>' + entry.transit.window + "</b></div>" +
        "</div>" +

        '<div class="ss-section">' +
        '<div class="ss-section-title">PROPULSION</div>' +
        '<div class="ss-row"><span>Delta-v class</span><b>' + entry.transit.deltaVClass.toUpperCase() + "</b></div>" +
        '<div class="ss-row"><span>Transfer delta-v</span><b>' + formatInt(entry.transit.deltaVms) + " m/s</b></div>" +
        propellantRow("Chemical (318 s)", chemKg) +
        propellantRow("Ion (1850 s)", ionKg) +
        "</div>" +

        '<div class="ss-section">' +
        '<div class="ss-section-title">LAUNCH &amp; BUDGET</div>' +
        '<div class="ss-row"><span>Launch tier</span><b>' + tier.label + "</b></div>" +
        '<div class="ss-row"><span>Launch cost</span><b>$' + tier.costM + "M</b></div>" +
        '<div class="ss-row"><span>Est. mission budget</span><b>' + budgetForTier(tier) + "</b></div>" +
        "</div>" +

        '<div class="ss-section">' +
        '<div class="ss-section-title">ENVIRONMENT</div>' +
        '<div class="ss-row"><span>Solar flux</span><b>' + formatInt(entry.env.solarFluxWm2) + " W/m2</b></div>" +
        '<div class="ss-row"><span>Radiation</span><b>' + entry.env.radiation + "x baseline</b></div>" +
        '<div class="ss-row"><span>Gravity</span><b>' + entry.facts.gravity + " m/s2</b></div>" +
        '<div class="ss-row"><span>Atmosphere</span><b>' + atmosphereLabel(entry.env.atmosphereKpa) + "</b></div>" +
        '<div class="ss-row"><span>Mean temperature</span><b>' + entry.facts.meanTempC + " C</b></div>" +
        '<div class="ss-row"><span>Day length</span><b>' + entry.facts.dayLength + "</b></div>" +
        '<div class="ss-row"><span>Diameter</span><b>' + formatInt(entry.facts.diameterKm) + " km</b></div>" +
        '<div class="ss-row"><span>Moons</span><b>' + entry.facts.moons + "</b></div>" +
        "</div>" +

        '<div class="ss-section">' +
        '<div class="ss-section-title">HAZARDS</div>' +
        "<div>" + chipList(entry.hazards, "hazard") + "</div>" +
        "</div>" +

        '<div class="ss-section">' +
        '<div class="ss-section-title">MISSION PROFILES</div>' +
        "<div>" + chipList(entry.profiles, "profile") + "</div>" +
        "</div>" +

        '<div class="ss-section">' +
        '<div class="ss-note">Approximate educational values. Propellant assumes an 800 kg reference wet mass. Budget includes a reference bus and propulsion package.</div>' +
        "</div>";
    }

    _selectDestination(id) {
      if (!DESTINATION_BY_ID[id]) return;
      this.selected = id;
      this.following = true;
      const entry = DESTINATION_BY_ID[id];
      this.desiredRadius = Math.max(5.0, entry.radius * 7.5);
      this._renderDossier(id);
      this._syncStrip();
      if (this.uiRoot) {
        const dossier = this.uiRoot.querySelector("#ss-dossier");
        if (dossier) dossier.scrollTop = 0;
      }
      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
    }

    _resetView() {
      this.following = false;
      this.selected = null;
      this.desiredRadius = OVERVIEW_RADIUS;
      this.desiredTarget.set(0, 0, 0);
      this._renderOverview();
      this._syncStrip();
    }

    _pickAt(clientX, clientY) {
      if (!this.camera || !this.pickables.length) return null;
      const dom = this.renderer && this.renderer.domElement;
      if (!dom) return null;
      const rect = dom.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      if (this.group) this.group.updateMatrixWorld(true);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(this.pickables, false);
      for (let i = 0; i < hits.length; i += 1) {
        const id = hits[i].object.userData.destId;
        if (id) return id;
      }
      return null;
    }

    _bindPointerControls() {
      const dom = this.renderer && this.renderer.domElement;
      if (!dom) return;

      dom.addEventListener("pointerdown", (event) => {
        if (!this.isActive || event.target !== dom) return;
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.pointers.size === 1) {
          this.dragging = true;
          this.dragMoved = 0;
          this.lastPointer.x = event.clientX;
          this.lastPointer.y = event.clientY;
          this.pointerDownAt = performance.now();
        } else if (this.pointers.size === 2) {
          const pts = Array.from(this.pointers.values());
          this.pinchStart = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          this.pinchRadius = this.desiredRadius;
        }
      });

      window.addEventListener("pointermove", (event) => {
        if (!this.isActive) return;
        if (!this.pointers.has(event.pointerId)) {
          this._updateHover(event.clientX, event.clientY);
          return;
        }
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (this.pointers.size >= 2) {
          const pts = Array.from(this.pointers.values());
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this.pinchStart > 10) {
            this.desiredRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, this.pinchRadius * (this.pinchStart / Math.max(10, dist))));
          }
          return;
        }

        if (!this.dragging) return;
        const dx = event.clientX - this.lastPointer.x;
        const dy = event.clientY - this.lastPointer.y;
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.lastPointer.x = event.clientX;
        this.lastPointer.y = event.clientY;
        this.camSpherical.theta -= dx * 0.0065;
        this.camSpherical.phi = Math.max(0.22, Math.min(Math.PI / 2.05, this.camSpherical.phi - dy * 0.0065));
      });

      const endPointer = (event) => {
        if (!this.isActive) return;
        if (!this.pointers.has(event.pointerId)) return;
        const wasSingle = this.pointers.size === 1;
        this.pointers.delete(event.pointerId);
        if (this.pointers.size < 2) this.pinchStart = 0;
        if (this.pointers.size === 0) this.dragging = false;
        if (wasSingle && this.dragMoved < 9 && performance.now() - this.pointerDownAt < 500) {
          const id = this._pickAt(event.clientX, event.clientY);
          if (id) this._selectDestination(id);
        }
      };
      window.addEventListener("pointerup", endPointer);
      window.addEventListener("pointercancel", endPointer);

      dom.addEventListener("wheel", (event) => {
        if (!this.isActive) return;
        event.preventDefault();
        this.desiredRadius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, this.desiredRadius + event.deltaY * 0.03));
      }, { passive: false });
    }

    _updateHover(clientX, clientY) {
      const dom = this.renderer && this.renderer.domElement;
      if (!dom) return;
      const id = this._pickAt(clientX, clientY);
      if (id === this.hovered) return;
      this.hovered = id;
      dom.style.cursor = id ? "pointer" : "grab";
    }

    open() {
      if (!this.initialized || this.isActive) return;
      if (window.vrManager && window.vrManager.isAnyVRActive) return;
      if (window.launchCutscene && window.launchCutscene.isPlaying) {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("Launch in progress - Solar Atlas unavailable");
        }
        return;
      }

      if (window.gameplay && window.gameplay.activeTask && typeof window.gameplay.closeTaskModal === "function") {
        window.gameplay.closeTaskModal();
      }
      if (window.missionViz && window.missionViz.isActive) window.missionViz.close();
      if (window.issShowcase && window.issShowcase.isActive) window.issShowcase.close();
      if (window.glbManager && window.glbManager.hangarActive) window.glbManager.closeHangar();
      if (window.shipInterior && window.shipInterior.isMoonLandingActive && typeof window.shipInterior.toggleMoonLandingScene === "function") {
        window.shipInterior.toggleMoonLandingScene(false);
      }

      this.savedState = {
        issVisible: window.issGroup ? window.issGroup.visible : true,
        earthVisible: window.photorealisticEarth && window.photorealisticEarth.group ? window.photorealisticEarth.group.visible : true,
        localVisible: window.localCrew && window.localCrew.group ? window.localCrew.group.visible : true,
        interiorVisible: window.shipInterior && window.shipInterior.group ? window.shipInterior.group.visible : false,
        groundGroupVisible: window.spaceCenter && window.spaceCenter.group ? window.spaceCenter.group.visible : false,
        moonLandingActive: window.shipInterior ? window.shipInterior.isMoonLandingActive : false,
        background: this.scene.background ? this.scene.background.clone() : null,
        fog: this.scene.fog,
        cameraPosition: this.camera.position.clone(),
        cameraQuaternion: this.camera.quaternion.clone()
      };

      if (window.issGroup) window.issGroup.visible = false;
      if (window.photorealisticEarth && window.photorealisticEarth.group) window.photorealisticEarth.group.visible = false;
      if (window.localCrew && window.localCrew.group) window.localCrew.group.visible = false;
      if (window.shipInterior && window.shipInterior.group) window.shipInterior.group.visible = false;
      if (window.spaceCenter && window.spaceCenter.group) window.spaceCenter.group.visible = false;

      this.scene.background = new THREE.Color(0x02040a);
      this.scene.fog = null;

      this._ensureUI();
      this._buildStrip();
      this.uiRoot.style.display = "block";
      document.body.classList.add("solar-system-active");

      this.isActive = true;
      this.selected = null;
      this.following = false;
      this.desiredTarget.set(0, 0, 0);
      this.camTarget.set(0, 0, 0);
      this.camSpherical.radius = 16;
      this.camSpherical.theta = 0.7;
      this.camSpherical.phi = 1.12;
      this.desiredRadius = OVERVIEW_RADIUS;

      this.group.visible = true;
      this._layoutBodies(this.time);
      this._renderOverview();
      this._syncStrip();
      this._refreshLoader();

      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
    }

    close() {
      if (!this.isActive) return;
      this.isActive = false;
      this.group.visible = false;
      if (this.uiRoot) this.uiRoot.style.display = "none";
      document.body.classList.remove("solar-system-active");

      if (this.savedState) {
        if (window.issGroup) window.issGroup.visible = this.savedState.issVisible;
        if (window.photorealisticEarth && window.photorealisticEarth.group) {
          window.photorealisticEarth.group.visible = this.savedState.earthVisible;
        }
        if (window.localCrew && window.localCrew.group) {
          window.localCrew.group.visible = this.savedState.localVisible;
        }
        if (window.shipInterior && window.shipInterior.group) {
          window.shipInterior.group.visible = this.savedState.interiorVisible;
        }
        if (window.spaceCenter && window.spaceCenter.group) {
          window.spaceCenter.group.visible = this.savedState.groundGroupVisible;
        }
        if (this.savedState.moonLandingActive && window.shipInterior && typeof window.shipInterior.toggleMoonLandingScene === "function") {
          window.shipInterior.toggleMoonLandingScene(true);
        }
        if (this.savedState.background) this.scene.background = this.savedState.background;
        this.scene.fog = this.savedState.fog;
        if (this.savedState.cameraPosition) this.camera.position.copy(this.savedState.cameraPosition);
        if (this.savedState.cameraQuaternion) this.camera.quaternion.copy(this.savedState.cameraQuaternion);
        this.savedState = null;
      }

      const dom = this.renderer && this.renderer.domElement;
      if (dom) dom.style.cursor = "grab";
      this.hovered = null;
      this.pointers.clear();
      this.dragging = false;

      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
    }

    toggle(force) {
      const next = typeof force === "boolean" ? force : !this.isActive;
      if (next) this.open();
      else this.close();
      return this.isActive;
    }

    update(delta, elapsed) {
      if (!this.isActive || !this.group) return;

      const conflict =
        (window.missionViz && window.missionViz.isActive) ||
        (window.issShowcase && window.issShowcase.isActive) ||
        (window.glbManager && window.glbManager.hangarActive) ||
        (window.dockingSim && window.dockingSim.isActive);
      if (conflict) {
        this.close();
        return;
      }

      const dt = Math.min(delta || 0.016, 0.05);
      this.time += dt;
      const time = this.time;

      this._layoutBodies(time);

      this.bodyNodes.forEach((node) => {
        const sphere = node.userData.sphere;
        if (sphere) sphere.rotation.y += dt * 0.09;
        const clouds = node.userData.clouds;
        if (clouds) clouds.rotation.y += dt * 0.02;
      });
      if (this.sunMesh) this.sunMesh.rotation.y += dt * 0.02;
      if (this.beltGroup) this.beltGroup.rotation.y += dt * 0.012;
      if (this.galaxyMesh) this.galaxyMesh.rotation.y += dt * 0.0015;

      this._updateCamera();
      this._updateLabels();
      this._updateSelection(time);
    }

    _updateCamera() {
      if (this.following && this.selected && this.bodyPositions.has(this.selected)) {
        this.desiredTarget.copy(this.bodyPositions.get(this.selected));
      } else {
        this.desiredTarget.set(0, 0, 0);
      }
      this.camTarget.lerp(this.desiredTarget, 0.12);
      this.camSpherical.radius += (this.desiredRadius - this.camSpherical.radius) * 0.09;

      const r = this.camSpherical.radius;
      const phi = this.camSpherical.phi;
      const theta = this.camSpherical.theta;
      const sinPhi = Math.sin(phi);

      this.camera.position.set(
        this.camTarget.x + r * sinPhi * Math.cos(theta),
        this.camTarget.y + r * Math.cos(phi),
        this.camTarget.z + r * sinPhi * Math.sin(theta)
      );
      this.camera.lookAt(this.camTarget);
    }

    _updateLabels() {
      this.bodyNodes.forEach((node) => {
        const label = node.userData.label;
        if (!label) return;
        const dist = this.camera.position.distanceTo(node.position);
        const w = Math.max(0.9, Math.min(6, dist * 0.05));
        label.scale.set(w, w * 0.25, 1);
      });
    }

    _updateSelection(time) {
      this.bodyNodes.forEach((node) => {
        const ring = node.userData.ring;
        if (!ring) return;
        const active = node.userData.destId === this.selected;
        ring.visible = active;
        if (!active) return;
        const pulse = 1 + Math.sin(time * 2.4) * 0.06;
        ring.scale.setScalar(pulse);
        if (ring.material) ring.material.opacity = 0.45 + Math.sin(time * 2.4) * 0.15;
      });
    }
  }

  window.SolarSystemManager = SolarSystemManager;
  window.solarSystem = new SolarSystemManager();
})(window);
