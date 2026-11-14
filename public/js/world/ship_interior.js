/**
 * ============================================================================
 * LUNASPIS / SPACESHIP 3D MODULAR TRANSIT CRAFT, MINIMAP & LUNAR SCENE
 * ============================================================================
 * Pure Vanilla Three.js port of the SpaceShip (Lunaspis — Orbital / Mission Lab)
 * 3D ship architecture (no Next.js / React required):
 * 1. Procedural Canvas Textures (interior-textures.ts & label-texture.ts):
 *    - Riveted aluminum panel walls with louver vents & base grime
 *    - Non-slip treaded metallic deck floor tiles with corner bolts
 *    - Clean grid ceiling panels, woven stowage bag fabric, diagonal hazard stripes
 *    - Deep-space starfield with galactic band
 * 2. Modular Interior Kit (Kit.tsx & FaultBeacon.tsx):
 *    - PanelWall with top/bottom trims, warm accent strip, blue Handrails & Conduits
 *    - DoorFrame with hazard threshold, RoomSign plaque & pulsing fault status light
 *    - CeilingLights (3 per room) with dynamic fault pulsing
 *    - FloorDetails (inset amber guide lines & center runner)
 *    - ISPR Racks (LAB-A/B, PWR-A/B, ECLSS-A/B, LDR-A/B, HUB-A2/A4) with status LEDs
 *    - Crew Lockers, Fabric StowageBags & Command Deck CupolaWindow with 3D Earth
 *    - World-space FaultBeacons (floating octahedron, pulsing ring & light beam)
 * 3. 6 Interconnected Rooms & Props (ShipInterior.tsx & level.ts):
 *    - Transit Hub [8x8], Command Deck [8x7.8], Power Bay [7.8x8],
 *      Life Support [7.8x8], Hull Access [8x6.8], Lander Bay [9x8.2]
 *    - Central HoloTable with counter-rotating torus rings & wireframe icosahedron
 *    - 5 Station Consoles with live READY/FAULT billboard labels
 * 4. Exact Collision Engine (collision.ts):
 *    - Walkable room/corridor rects, solid circles & solid equipment rack rects
 *    - Camera line-of-sight clearance check (isCameraClear)
 * 5. Live SVG Ship Minimap (Minimap.tsx) with friendly crew markers & 3D Lunar Landing Scene (MoonLandingScene.tsx)
 * 6. Anamorphic SunFlare (SunFlare.tsx) & 27-Part ISS Reference Showcase (ISSModel.tsx)
 */

(function (window) {
  "use strict";

  const WALL_HEIGHT = 3.2;
  const DOOR_WIDTH = 2.4;
  const DOOR_HEIGHT = 2.35;
  const WALL_THICKNESS = 0.16;
  const ISS_INTERIOR_MODEL_URL = "models/iss/international_space_station.glb";
  const ISS_INTERIOR_MODEL_SCALE = 0.55;

  // Approximate passages through the scan, in station coordinates. The scan
  // contains holes and photogrammetry spikes, so it is not a collision mesh.
  const ISS_WALK_ZONES = [
    { xMin: -1.2, xMax: 1.2, zMin: 0.3, zMax: 7.2 },
    { xMin: -5.0, xMax: 1.5, zMin: 6.3, zMax: 12.2 },
    { xMin: -7.5, xMax: 2.1, zMin: -5.3, zMax: 1.0 },
    { xMin: 1.5, xMax: 12.0, zMin: -5.3, zMax: -2.3 },
    { xMin: 1.2, xMax: 11.5, zMin: 6.0, zMax: 10.2 },
    { xMin: -1.2, xMax: 2.0, zMin: 11.0, zMax: 40.0 }
  ];
  const ISS_STATION_LAYOUT = {
    hub: { position: [-2.5, 1.02, 0], workPosition: [-1.4, 0, 0.5] },
    command: { position: [-0.8, 0.92, -3.5], workPosition: [0, 0, -3.5] },
    power: { position: [-5.5, 0.92, -3.8], workPosition: [-4.2, 0, -3.8] },
    "life-support": { position: [8, 0.92, -3.5], workPosition: [7, 0, -3.5] },
    hull: { position: [8, 0.92, 8], workPosition: [7, 0, 8] },
    lander: { position: [0, 0.92, 25], workPosition: [1, 0, 24] }
  };

  const METAL = 0x2f353b;
  const METAL_LIGHT = 0x5b636a;
  const WARM_LIGHT = 0xffe6c2;
  const HANDRAIL = 0x3f6075;
  const PANEL = 0xd4d6d7;

  // ============================================================================
  // 1. LEVEL DEFINITIONS: ROOMS, STATIONS, DOORS & WALKABLE ZONES (level.ts)
  // ============================================================================
  const ROOMS = [
    {
      id: "hub",
      label: "Transit Hub",
      shortLabel: "HUB",
      description: "Central spine, mission table, and pressure bulkheads.",
      center: [0, 0],
      size: [8, 8],
      color: "#67e8f9",
      doors: ["north", "south", "east", "west"]
    },
    {
      id: "command",
      label: "Command Deck",
      shortLabel: "CMD",
      description: "Flight plan, mission clock, and transit telemetry.",
      center: [0, -8.3],
      size: [8, 7.8],
      color: "#38bdf8",
      doors: ["south"]
    },
    {
      id: "power",
      label: "Power Bay",
      shortLabel: "PWR",
      description: "Solar bus relays, battery banks, and manual reroute panel.",
      center: [-8.3, 0],
      size: [7.8, 8],
      color: "#fbbf24",
      doors: ["east"]
    },
    {
      id: "life-support",
      label: "Life Support",
      shortLabel: "LSS",
      description: "Scrubbers, oxygen reserves, and cabin atmosphere controls.",
      center: [8.3, 0],
      size: [7.8, 8],
      color: "#34d399",
      doors: ["west"]
    },
    {
      id: "hull",
      label: "Hull Access",
      shortLabel: "HULL",
      description: "Pressure seals, breach lockers, and the lander airlock.",
      center: [0, 7.8],
      size: [8, 6.8],
      color: "#fb7185",
      doors: ["north", "south"]
    },
    {
      id: "lander",
      label: "Lander Bay",
      shortLabel: "LDR",
      description: "Three-seat cockpit and the final descent alignment station.",
      center: [0, 15.9],
      size: [9, 8.2],
      color: "#a78bfa",
      doors: ["north"]
    }
  ];

  const ROOM_BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

  const CONNECTORS = [
    { id: "hub-command", center: [0, -4.35], width: 2.4, depth: 0.6 },
    { id: "hub-power", center: [-4.35, 0], width: 0.6, depth: 2.4 },
    { id: "hub-life", center: [4.35, 0], width: 0.6, depth: 2.4 },
    { id: "hub-hull", center: [0, 4.35], width: 2.4, depth: 0.6 },
    { id: "hull-lander", center: [0, 11.5], width: 2.8, depth: 0.9 }
  ];

  const STATIONS = {
    hub: {
      id: "hub",
      label: "Mission Table",
      shortLabel: "MISSION",
      room: "hub",
      position: [0, 1.02, 0],
      workPosition: [0, 0, 1.5],
      interactRadius: 2.1,
      color: "#67e8f9",
      description: "Transit cycle status, resource trends, and crew assignments."
    },
    command: {
      id: "command",
      label: "Flight Console",
      shortLabel: "COMMAND",
      room: "command",
      position: [0, 0.92, -11.2],
      workPosition: [0, 0, -9.5],
      interactRadius: 2.6,
      color: "#38bdf8",
      description: "Mission clock, transit telemetry, and the lunar approach plan."
    },
    power: {
      id: "power",
      label: "Power Console",
      shortLabel: "POWER",
      room: "power",
      position: [-11.2, 0.92, 0],
      workPosition: [-9.5, 0, 0],
      interactRadius: 2.6,
      color: "#fbbf24",
      description: "Manual bus reroute and battery load balancing."
    },
    "life-support": {
      id: "life-support",
      label: "Atmosphere Console",
      shortLabel: "LIFE SUPPORT",
      room: "life-support",
      position: [11.2, 0.92, 0],
      workPosition: [9.5, 0, 0],
      interactRadius: 2.6,
      color: "#34d399",
      description: "Oxygen, CO₂ scrubbing, pressure, and cabin temperature."
    },
    hull: {
      id: "hull",
      label: "Breach Locker",
      shortLabel: "HULL",
      room: "hull",
      position: [0, 0.92, 10.4],
      workPosition: [0, 0, 9.1],
      interactRadius: 2.6,
      color: "#fb7185",
      description: "Hull breach seals, pressure doors, and repair drones."
    },
    lander: {
      id: "lander",
      label: "Descent Console",
      shortLabel: "LANDER",
      room: "lander",
      position: [0, 0.92, 18.9],
      workPosition: [0, 0, 17.4],
      interactRadius: 2.8,
      color: "#a78bfa",
      description: "Three-axis descent alignment and touchdown authority."
    }
  };

  const ROOM_ADJACENCY = {
    hub: ["command", "power", "life-support", "hull"],
    command: ["hub"],
    power: ["hub"],
    "life-support": ["hub"],
    hull: ["hub", "lander"],
    lander: ["hull"]
  };

  const DOOR_POINTS = {
    "hub-command": [0, -4.35],
    "hub-power": [-4.35, 0],
    "hub-life-support": [4.35, 0],
    "hub-hull": [0, 4.35],
    "hull-lander": [0, 11.5]
  };

  // Walkable zones (with 0.18m wall thickness inset)
  const WALK_ZONES = [
    ...ROOMS.map((room) => ({
      xMin: room.center[0] - room.size[0] / 2 + 0.18,
      xMax: room.center[0] + room.size[0] / 2 - 0.18,
      zMin: room.center[1] - room.size[1] / 2 + 0.18,
      zMax: room.center[1] + room.size[1] / 2 - 0.18
    })),
    { xMin: -1.15, xMax: 1.15, zMin: -4.65, zMax: -3.75 },
    { xMin: -4.65, xMax: -3.75, zMin: -1.15, zMax: 1.15 },
    { xMin: 3.75, xMax: 4.65, zMin: -1.15, zMax: 1.15 },
    { xMin: -1.15, xMax: 1.15, zMin: 3.75, zMax: 4.65 },
    { xMin: -1.35, xMax: 1.35, zMin: 11.0, zMax: 12.0 }
  ];

  // Solid collision circles & rects from collision.ts
  const SOLID_CIRCLES = [
    { x: STATIONS.hub.position[0], z: STATIONS.hub.position[2], radius: 1.35 },
    ...Object.values(STATIONS)
      .filter((s) => s.id !== "hub")
      .map((s) => ({ x: s.position[0], z: s.position[2], radius: 1.05 }))
  ];

  const SOLID_RECTS = [
    // hub racks
    { x: -3.54, z: -1.55, halfX: 0.3, halfZ: 0.56 },
    { x: -3.54, z: 1.55, halfX: 0.3, halfZ: 0.56 },
    // hub lockers
    { x: 3.54, z: 1.75, halfX: 0.3, halfZ: 0.78 },
    { x: 3.54, z: -1.75, halfX: 0.3, halfZ: 0.78 },
    // command racks
    ...[-6.9, -8.5, -10.1].flatMap((z) => [
      { x: -3.54, z, halfX: 0.3, halfZ: 0.56 },
      { x: 3.54, z, halfX: 0.3, halfZ: 0.56 }
    ]),
    // power bay racks
    { x: -8.3, z: -3.54, halfX: 0.56, halfZ: 0.3 },
    { x: -8.3, z: 3.54, halfX: 0.56, halfZ: 0.3 },
    // life support racks
    { x: 8.3, z: -3.54, halfX: 0.56, halfZ: 0.3 },
    { x: 8.3, z: 3.54, halfX: 0.56, halfZ: 0.3 },
    // lander racks
    { x: -4.0, z: 13.4, halfX: 0.3, halfZ: 0.56 },
    { x: 4.0, z: 13.4, halfX: 0.3, halfZ: 0.56 }
  ];

  function roomAtPosition(x, z) {
    const match = ROOMS.find((room) => {
      const halfW = room.size[0] / 2;
      const halfD = room.size[1] / 2;
      return (
        x >= room.center[0] - halfW &&
        x <= room.center[0] + halfW &&
        z >= room.center[1] - halfD &&
        z <= room.center[1] + halfD
      );
    });
    return match ? match.id : "hub";
  }

  function roomPath(from, to) {
    if (from === to) return [from];
    const queue = [[from]];
    const visited = new Set([from]);
    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      const neighbors = ROOM_ADJACENCY[current] || [];
      for (let i = 0; i < neighbors.length; i++) {
        const next = neighbors[i];
        if (visited.has(next)) continue;
        const nextPath = [...path, next];
        if (next === to) return nextPath;
        visited.add(next);
        queue.push(nextPath);
      }
    }
    return [from, to];
  }

  function getDoorPoint(a, b) {
    return DOOR_POINTS[`${a}-${b}`] || DOOR_POINTS[`${b}-${a}`] || null;
  }

  // ============================================================================
  // 2. PROCEDURAL CANVAS TEXTURES (interior-textures.ts & label-texture.ts)
  // ============================================================================
  function makeCanvas(width, height) {
    const element = document.createElement("canvas");
    element.width = width;
    element.height = height;
    const context = element.getContext("2d");
    return { element, context };
  }

  function applyTextureEncoding(tex, anisotropy = 8) {
    if (!window.THREE) return tex;
    if ("colorSpace" in tex && window.THREE.SRGBColorSpace) {
      tex.colorSpace = window.THREE.SRGBColorSpace;
    } else if (window.THREE.sRGBEncoding) {
      tex.encoding = window.THREE.sRGBEncoding;
    }
    tex.anisotropy = window.isMobileDevice ? Math.min(2, anisotropy) : anisotropy;
    tex.needsUpdate = true;
    return tex;
  }

  function addNoise(context, width, height, amount) {
    for (let i = 0; i < amount; i++) {
      const alpha = Math.random() * 0.05;
      const shade = Math.random() > 0.5 ? 255 : 0;
      context.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
      context.fillRect(
        Math.random() * width,
        Math.random() * height,
        Math.random() * 3 + 1,
        Math.random() * 3 + 1
      );
    }
  }

  function createWallTexture() {
    const width = 512, height = 256;
    const { element, context } = makeCanvas(width, height);
    context.fillStyle = "#c7cacc";
    context.fillRect(0, 0, width, height);
    addNoise(context, width, height, 5200);

    const columns = 4, rows = 2;
    const panelWidth = width / columns;
    const panelHeight = height / rows;

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = column * panelWidth + 3;
        const y = row * panelHeight + 3;
        const w = panelWidth - 6;
        const h = panelHeight - 6;
        const shade = 195 + ((row * columns + column) % 4) * 4;
        context.fillStyle = `rgb(${shade},${shade + 2},${shade + 4})`;
        context.fillRect(x, y, w, h);

        context.strokeStyle = "rgba(70,78,84,0.55)";
        context.lineWidth = 2;
        context.strokeRect(x, y, w, h);
        context.strokeStyle = "rgba(255,255,255,0.28)";
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(x, y + h);
        context.lineTo(x, y);
        context.lineTo(x + w, y);
        context.stroke();

        const bolts = [
          [x + 14, y + 14],
          [x + w - 14, y + 14],
          [x + 14, y + h - 14],
          [x + w - 14, y + h - 14]
        ];
        bolts.forEach(([bx, by]) => {
          context.beginPath();
          context.arc(bx, by, 3.2, 0, Math.PI * 2);
          context.fillStyle = "#6f757a";
          context.fill();
        });
      }
    }

    // Vent clusters
    [
      [panelWidth * 2.6, panelHeight * 0.55],
      [panelWidth * 0.35, panelHeight * 1.55]
    ].forEach(([vx, vy]) => {
      context.fillStyle = "#60676c";
      context.fillRect(vx, vy, 74, 46);
      context.fillStyle = "#23282c";
      for (let slot = 0; slot < 5; slot++) {
        context.fillRect(vx + 8, vy + 7 + slot * 7, 58, 3);
      }
    });

    // Grime near base
    const grime = context.createLinearGradient(0, height - 70, 0, height);
    grime.addColorStop(0, "rgba(52,58,62,0)");
    grime.addColorStop(1, "rgba(52,58,62,0.3)");
    context.fillStyle = grime;
    context.fillRect(0, height - 70, width, 70);

    const tex = new window.THREE.CanvasTexture(element);
    tex.wrapS = window.THREE.RepeatWrapping;
    tex.wrapT = window.THREE.RepeatWrapping;
    return applyTextureEncoding(tex, 8);
  }

  function createFloorTexture() {
    const width = 512, height = 512;
    const { element, context } = makeCanvas(width, height);
    context.fillStyle = "#3c4247";
    context.fillRect(0, 0, width, height);
    addNoise(context, width, height, 6000);

    const size = 128;
    for (let row = 0; row < 4; row++) {
      for (let column = 0; column < 4; column++) {
        const x = column * size + 3;
        const y = row * size + 3;
        const w = size - 6;
        const h = size - 6;
        const shade = 56 + ((row + column) % 3) * 4;
        context.fillStyle = `rgb(${shade},${shade + 4},${shade + 7})`;
        context.fillRect(x, y, w, h);
        context.strokeStyle = "rgba(16,20,23,0.75)";
        context.lineWidth = 3;
        context.strokeRect(x, y, w, h);

        context.strokeStyle = "rgba(120,130,138,0.16)";
        context.lineWidth = 2;
        for (let line = -h; line < w; line += 24) {
          context.beginPath();
          context.moveTo(x + line, y + h);
          context.lineTo(x + line + h, y);
          context.stroke();
        }

        [
          [x + 16, y + 16],
          [x + w - 16, y + 16],
          [x + 16, y + h - 16],
          [x + w - 16, y + h - 16]
        ].forEach(([bx, by]) => {
          context.beginPath();
          context.arc(bx, by, 4, 0, Math.PI * 2);
          context.fillStyle = "#242a2e";
          context.fill();
        });
      }
    }

    const tex = new window.THREE.CanvasTexture(element);
    tex.wrapS = window.THREE.RepeatWrapping;
    tex.wrapT = window.THREE.RepeatWrapping;
    return applyTextureEncoding(tex, 8);
  }

  function createCeilingTexture() {
    const width = 256, height = 256;
    const { element, context } = makeCanvas(width, height);
    context.fillStyle = "#d5d7d6";
    context.fillRect(0, 0, width, height);
    addNoise(context, width, height, 2600);

    context.strokeStyle = "rgba(92,99,103,0.45)";
    context.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      context.beginPath();
      context.moveTo((width / 4) * i, 0);
      context.lineTo((width / 4) * i, height);
      context.stroke();
    }
    for (let i = 1; i < 3; i++) {
      context.beginPath();
      context.moveTo(0, (height / 3) * i);
      context.lineTo(width, (height / 3) * i);
      context.stroke();
    }

    const tex = new window.THREE.CanvasTexture(element);
    tex.wrapS = window.THREE.RepeatWrapping;
    tex.wrapT = window.THREE.RepeatWrapping;
    return applyTextureEncoding(tex, 8);
  }

  function createFabricTexture() {
    const width = 128, height = 128;
    const { element, context } = makeCanvas(width, height);
    context.fillStyle = "#b9ac96";
    context.fillRect(0, 0, width, height);
    addNoise(context, width, height, 3000);

    context.strokeStyle = "rgba(84,74,60,0.12)";
    context.lineWidth = 1;
    for (let line = 0; line < width; line += 4) {
      context.beginPath();
      context.moveTo(line, 0);
      context.lineTo(line, height);
      context.stroke();
    }
    for (let line = 0; line < height; line += 4) {
      context.beginPath();
      context.moveTo(0, line);
      context.lineTo(width, line);
      context.stroke();
    }

    const tex = new window.THREE.CanvasTexture(element);
    tex.wrapS = window.THREE.RepeatWrapping;
    tex.wrapT = window.THREE.RepeatWrapping;
    return applyTextureEncoding(tex, 4);
  }

  function createHazardTexture() {
    const width = 512, height = 128;
    const { element, context } = makeCanvas(width, height);
    context.fillStyle = "#1c1e20";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#d8a044";
    for (let i = -height; i < width + height; i += 96) {
      context.beginPath();
      context.moveTo(i, height);
      context.lineTo(i + 48, 0);
      context.lineTo(i + 96, 0);
      context.lineTo(i + 48, height);
      context.closePath();
      context.fill();
    }
    const tex = new window.THREE.CanvasTexture(element);
    tex.wrapS = window.THREE.RepeatWrapping;
    tex.wrapT = window.THREE.RepeatWrapping;
    return applyTextureEncoding(tex, 4);
  }

  function createStarTexture() {
    const width = 1024, height = 512;
    const { element, context } = makeCanvas(width, height);
    context.fillStyle = "#020307";
    context.fillRect(0, 0, width, height);

    const band = context.createLinearGradient(0, height * 0.2, width, height * 0.8);
    band.addColorStop(0, "rgba(30,44,70,0)");
    band.addColorStop(0.45, "rgba(64,86,120,0.16)");
    band.addColorStop(0.55, "rgba(90,110,150,0.12)");
    band.addColorStop(1, "rgba(30,44,70,0)");
    context.fillStyle = band;
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 1600; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = Math.random() * 1.4 + 0.2;
      const alpha = Math.random() * 0.8 + 0.15;
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fillStyle = `rgba(235,242,255,${alpha})`;
      context.fill();
    }

    const tex = new window.THREE.CanvasTexture(element);
    return applyTextureEncoding(tex, 4);
  }

  let cachedInteriorTextures = null;
  function getInteriorTextures() {
    if (cachedInteriorTextures) return cachedInteriorTextures;
    cachedInteriorTextures = {
      wall: createWallTexture(),
      floor: createFloorTexture(),
      ceiling: createCeilingTexture(),
      fabric: createFabricTexture(),
      hazard: createHazardTexture(),
      stars: createStarTexture()
    };
    return cachedInteriorTextures;
  }

  function createTiledTexture(base, repeatX, repeatY) {
    const clone = base.clone();
    clone.wrapS = window.THREE.RepeatWrapping;
    clone.wrapT = window.THREE.RepeatWrapping;
    clone.repeat.set(repeatX, repeatY);
    applyTextureEncoding(clone, base.anisotropy || 8);
    return clone;
  }

  function createStationLabelTexture({ text, subtext, accent }) {
    const width = 512, height = 128;
    const { element, context } = makeCanvas(width, height);
    context.fillStyle = "rgba(5, 8, 12, 0.9)";
    context.fillRect(0, 0, width, height);

    context.strokeStyle = accent;
    context.globalAlpha = 0.6;
    context.lineWidth = 4;
    context.strokeRect(4, 4, width - 8, height - 8);
    context.globalAlpha = 1;

    context.fillStyle = "#ece7dc";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `600 ${subtext ? 38 : 42}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.fillText(String(text).toUpperCase(), width / 2, subtext ? height / 2 - 12 : height / 2);

    if (subtext) {
      context.fillStyle = accent;
      context.font = "500 22px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillText(String(subtext).toUpperCase(), width / 2, height / 2 + 28);
    }

    const tex = new window.THREE.CanvasTexture(element);
    return applyTextureEncoding(tex, 4);
  }

  function createSignTexture(short, label) {
    const { element, context } = makeCanvas(512, 128);
    context.fillStyle = "#0d1117";
    context.fillRect(0, 0, 512, 128);
    context.strokeStyle = "#7b858d";
    context.lineWidth = 4;
    context.strokeRect(6, 6, 500, 116);
    context.fillStyle = "#d8cbb4";
    context.font = "600 54px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.fillText(short, 256, 62);
    context.fillStyle = "#8e969d";
    context.font = "400 22px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(String(label).toUpperCase(), 256, 96);
    const tex = new window.THREE.CanvasTexture(element);
    return applyTextureEncoding(tex, 4);
  }

  function createRackPlateTexture(text) {
    const { element, context } = makeCanvas(256, 64);
    context.fillStyle = "#141a20";
    context.fillRect(0, 0, 256, 64);
    context.strokeStyle = "#7d8890";
    context.lineWidth = 3;
    context.strokeRect(3, 3, 250, 58);
    context.fillStyle = "#d8cbb4";
    context.font = "600 26px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.fillText(String(text).slice(0, 16), 128, 41);
    const tex = new window.THREE.CanvasTexture(element);
    return applyTextureEncoding(tex, 4);
  }

  // ============================================================================
  // 3. MODULAR INTERIOR KIT BUILDERS (Kit.tsx & FaultBeacon.tsx)
  // ============================================================================
  function buildHandrail(position, length, axis) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.position.set(position[0], position[1], position[2]);

    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, length, 10),
      new THREE.MeshStandardMaterial({ color: HANDRAIL, roughness: 0.35, metalness: 0.7 })
    );
    if (axis === "x") bar.rotation.set(0, 0, Math.PI / 2);
    else bar.rotation.set(Math.PI / 2, 0, 0);
    g.add(bar);

    const bracketMat = new THREE.MeshStandardMaterial({ color: METAL_LIGHT, roughness: 0.5, metalness: 0.6 });
    [-0.32, 0.32].forEach((offset) => {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(axis === "x" ? 0.05 : 0.16, 0.05, axis === "x" ? 0.16 : 0.05),
        bracketMat
      );
      if (axis === "x") b.position.set(length * offset, 0, 0);
      else b.position.set(0, 0, length * offset);
      g.add(b);
    });
    return g;
  }

  function buildConduit(position, length, axis) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.position.set(position[0], position[1], position[2]);

    [-0.1, 0, 0.1].forEach((offset, index) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, length, 8),
        new THREE.MeshStandardMaterial({
          color: index === 1 ? 0x7a5a3a : 0x1d2226,
          roughness: 0.7,
          metalness: 0.3
        })
      );
      m.position.set(axis === "x" ? 0 : offset, index * 0.02, axis === "x" ? offset : 0);
      if (axis === "x") m.rotation.set(0, 0, Math.PI / 2);
      else m.rotation.set(Math.PI / 2, 0, 0);
      g.add(m);
    });
    return g;
  }

  function buildPanelWall(box, roomCenter) {
    const THREE = window.THREE;
    const textures = getInteriorTextures();
    const [sx, sy, sz] = box.size;
    const thinX = sx <= sz;
    const length = thinX ? sz : sx;
    const height = sy;
    const thickness = thinX ? sx : sz;

    const map = createTiledTexture(textures.wall, Math.max(1, length / 3.2), Math.max(1, height / 2.4));
    const trims = [
      { y: box.position[1] - sy / 2 + 0.035 },
      { y: box.position[1] + sy / 2 - 0.035 }
    ];
    const roomSide = thinX
      ? Math.sign(roomCenter[0] - box.position[0]) || 1
      : Math.sign(roomCenter[1] - box.position[2]) || 1;
    const railOffset = thickness / 2 + 0.13;
    const railLength = Math.max(0, length - 0.9);
    const showRail = height > 2.4 && length > 1.6;

    const g = new THREE.Group();
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, sy, sz),
      new THREE.MeshStandardMaterial({
        map,
        color: PANEL,
        roughness: 0.62,
        metalness: 0.14
      })
    );
    wallMesh.position.set(box.position[0], box.position[1], box.position[2]);
    g.add(wallMesh);

    const trimMat = new THREE.MeshStandardMaterial({ color: METAL_LIGHT, roughness: 0.45, metalness: 0.7 });
    trims.forEach((trim) => {
      const tm = new THREE.Mesh(
        new THREE.BoxGeometry(
          thinX ? thickness + 0.05 : length + 0.04,
          0.07,
          thinX ? length + 0.04 : thickness + 0.05
        ),
        trimMat
      );
      tm.position.set(box.position[0], trim.y, box.position[2]);
      g.add(tm);
    });

    if (height > 2.4) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(
          thinX ? thickness + 0.03 : length,
          0.035,
          thinX ? length : thickness + 0.03
        ),
        new THREE.MeshStandardMaterial({
          color: 0xb9b0a0,
          emissive: 0x6b6357,
          emissiveIntensity: 0.12,
          roughness: 0.5
        })
      );
      strip.position.set(box.position[0], 2.55, box.position[2]);
      g.add(strip);
    }

    if (showRail) {
      const railPos = thinX
        ? [box.position[0] + roomSide * railOffset, 1.02, box.position[2]]
        : [box.position[0], 1.02, box.position[2] + roomSide * railOffset];
      g.add(buildHandrail(railPos, railLength, thinX ? "z" : "x"));
    }

    if (showRail && length > 2.4) {
      const condPos = thinX
        ? [box.position[0] + roomSide * (thickness / 2 + 0.07), 2.78, box.position[2]]
        : [box.position[0], 2.78, box.position[2] + roomSide * (thickness / 2 + 0.07)];
      g.add(buildConduit(condPos, length - 0.4, thinX ? "z" : "x"));
    }

    return g;
  }

  function buildDoorFrame(room, side) {
    const THREE = window.THREE;
    const [cx, cz] = room.center;
    const [width, depth] = room.size;
    const northSouth = side === "north" || side === "south";
    const wallZ = side === "north" ? cz - depth / 2 : cz + depth / 2;
    const wallX = side === "west" ? cx - width / 2 : cx + width / 2;
    const inward = northSouth ? (side === "north" ? 1 : -1) : (side === "west" ? 1 : -1);

    const signPosition = northSouth
      ? [cx, 2.62, wallZ + inward * 0.11]
      : [wallX + inward * 0.11, 2.62, cz];
    const signRotation = northSouth
      ? side === "north" ? [0, 0, 0] : [0, Math.PI, 0]
      : side === "west" ? [0, Math.PI / 2, 0] : [0, -Math.PI / 2, 0];

    const postOffset = DOOR_WIDTH / 2 + 0.08;
    const posts = northSouth
      ? [
          [cx - postOffset, 0, wallZ],
          [cx + postOffset, 0, wallZ]
        ]
      : [
          [wallX, 0, cz - postOffset],
          [wallX, 0, cz + postOffset]
        ];

    const g = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.4, metalness: 0.72 });

    posts.forEach((post) => {
      const pm = new THREE.Mesh(
        new THREE.BoxGeometry(
          northSouth ? 0.11 : 0.26,
          DOOR_HEIGHT + 0.12,
          northSouth ? 0.26 : 0.11
        ),
        metalMat
      );
      pm.position.set(post[0], (DOOR_HEIGHT + 0.12) / 2, post[2]);
      g.add(pm);
    });

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(
        northSouth ? DOOR_WIDTH + 0.32 : 0.26,
        0.12,
        northSouth ? 0.26 : DOOR_WIDTH + 0.32
      ),
      metalMat
    );
    lintel.position.set(northSouth ? cx : wallX, DOOR_HEIGHT + 0.06, northSouth ? wallZ : cz);
    g.add(lintel);

    const hazardPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(northSouth ? DOOR_WIDTH : 0.34, northSouth ? 0.34 : DOOR_WIDTH),
      new THREE.MeshStandardMaterial({
        map: getInteriorTextures().hazard,
        roughness: 0.7,
        metalness: 0.15,
        polygonOffset: true,
        polygonOffsetFactor: -1
      })
    );
    hazardPlane.position.set(northSouth ? cx : wallX, 0.02, northSouth ? wallZ : cz);
    hazardPlane.rotation.set(-Math.PI / 2, 0, 0);
    g.add(hazardPlane);

    const statusMat = new THREE.MeshStandardMaterial({
      color: 0x6ee7b7,
      emissive: 0x34d399,
      emissiveIntensity: 1.6
    });
    const statusLamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.16), statusMat);
    statusLamp.position.set(northSouth ? cx : wallX, DOOR_HEIGHT + 0.2, northSouth ? wallZ : cz);
    g.add(statusLamp);

    const signTex = createSignTexture(room.shortLabel, room.label);
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.28),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true })
    );
    signMesh.position.set(signPosition[0], signPosition[1], signPosition[2]);
    signMesh.rotation.set(signRotation[0], signRotation[1], signRotation[2]);
    g.add(signMesh);

    return { group: g, statusMat };
  }

  function buildCeilingLights(center) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    const offsets = [-2.1, 0, 2.1];
    const housingMat = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.45, metalness: 0.7 });
    const diffuserMats = [];

    offsets.forEach((offset) => {
      const fg = new THREE.Group();
      fg.position.set(center[0] + offset, WALL_HEIGHT - 0.05, center[1]);

      const housing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.07, 0.66), housingMat);
      fg.add(housing);

      const diffMat = new THREE.MeshStandardMaterial({
        color: WARM_LIGHT,
        emissive: WARM_LIGHT,
        emissiveIntensity: 0.75
      });
      diffuserMats.push(diffMat);
      const diff = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.52), diffMat);
      diff.position.set(0, -0.045, 0);
      fg.add(diff);
      g.add(fg);
    });

    const light = new THREE.PointLight(WARM_LIGHT, 2.0, 9, 1.7);
    light.position.set(center[0], WALL_HEIGHT - 0.35, center[1]);
    g.add(light);

    const runner = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.02, 3.8),
      new THREE.MeshStandardMaterial({
        color: 0xb9b0a0,
        emissive: 0x6b6357,
        emissiveIntensity: 0.12
      })
    );
    runner.position.set(center[0], WALL_HEIGHT - 0.02, center[1]);
    g.add(runner);

    return { group: g, light, diffuserMats };
  }

  function buildFloorDetails(room) {
    const THREE = window.THREE;
    const [cx, cz] = room.center;
    const [width, depth] = room.size;
    const inset = 0.42;
    const length = 0.05;

    const g = new THREE.Group();
    g.position.set(cx, 0.015, cz);

    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xd8b06a,
      emissive: 0x8a5a24,
      emissiveIntensity: 0.25,
      roughness: 0.6
    });

    [
      { position: [0, 0, -depth / 2 + inset], size: [width - inset * 2, length] },
      { position: [0, 0, depth / 2 - inset], size: [width - inset * 2, length] },
      { position: [-width / 2 + inset, 0, 0], size: [length, depth - inset * 2] },
      { position: [width / 2 - inset, 0, 0], size: [length, depth - inset * 2] }
    ].forEach((line) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(line.size[0], 0.012, line.size[1]), lineMat);
      m.position.set(line.position[0], 0, line.position[2]);
      g.add(m);
    });

    const centerStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.01, depth * 0.55),
      new THREE.MeshStandardMaterial({
        color: 0xb9b0a0,
        emissive: 0x5b5346,
        emissiveIntensity: 0.12,
        roughness: 0.55
      })
    );
    centerStrip.position.set(0, 0.005, 0);
    g.add(centerStrip);

    return g;
  }

  function buildRack({ position, rotation = [0, 0, 0], label, accent }) {
    const THREE = window.THREE;
    const textures = getInteriorTextures();
    const map = createTiledTexture(textures.wall, 1.1, 1.9);

    const g = new THREE.Group();
    g.position.set(position[0], position[1], position[2]);
    g.rotation.set(rotation[0], rotation[1], rotation[2]);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 1.9, 0.46),
      new THREE.MeshStandardMaterial({ map, color: 0xc9ccce, roughness: 0.58, metalness: 0.22 })
    );
    body.position.set(0, 0.95, 0);
    g.add(body);

    const face = new THREE.Mesh(
      new THREE.BoxGeometry(0.88, 1.72, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x1a2229, roughness: 0.5, metalness: 0.42 })
    );
    face.position.set(0, 0.95, 0.24);
    g.add(face);

    const slotMat = new THREE.MeshStandardMaterial({ color: 0x4d5a63, roughness: 0.6, metalness: 0.4 });
    [0.45, 0.78, 1.12, 1.45].forEach((y) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.035, 0.02), slotMat);
      s.position.set(0, y, 0.265);
      g.add(s);
    });

    const accentPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.18, 0.015),
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.9
      })
    );
    accentPanel.position.set(0.22, 1.46, 0.27);
    g.add(accentPanel);

    [0.3, 0.24, 0.18].forEach((_, index) => {
      const c = index === 0 ? 0x6ee7b7 : index === 1 ? 0xf5b942 : 0xff6b6b;
      const em = index === 0 ? 0x34d399 : index === 1 ? 0xe0a63a : 0xfb7185;
      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.05, 0.015),
        new THREE.MeshStandardMaterial({ color: c, emissive: em, emissiveIntensity: 1.2 })
      );
      led.position.set(-0.32 + index * 0.1, 0.42, 0.275);
      g.add(led);
    });

    const handleMat = new THREE.MeshStandardMaterial({ color: METAL_LIGHT, roughness: 0.4, metalness: 0.7 });
    [-0.42, 0.42].forEach((x) => {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), handleMat);
      h.position.set(x, 1.55, 0.28);
      g.add(h);
    });

    const plateTex = createRackPlateTexture(label);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.1),
      new THREE.MeshBasicMaterial({ map: plateTex, transparent: true })
    );
    plate.position.set(0, 1.82, 0.27);
    g.add(plate);

    return g;
  }

  function buildLocker({ position, rotation = [0, 0, 0], accent }) {
    const THREE = window.THREE;
    const textures = getInteriorTextures();
    const map = createTiledTexture(textures.wall, 1.6, 2.2);

    const g = new THREE.Group();
    g.position.set(position[0], position[1], position[2]);
    g.rotation.set(rotation[0], rotation[1], rotation[2]);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.96, 0.5),
      new THREE.MeshStandardMaterial({ map, color: 0xc3c7c9, roughness: 0.6, metalness: 0.24 })
    );
    body.position.set(0, 0.98, 0);
    g.add(body);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.36, 1.8, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xb7bbbd, roughness: 0.5, metalness: 0.3 })
    );
    door.position.set(0, 0.98, 0.26);
    g.add(door);

    const dividerMat = new THREE.MeshStandardMaterial({ color: 0x5e686f, roughness: 0.6, metalness: 0.35 });
    [0.45, 0.75, 1.05, 1.35].forEach((y) => {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.025, 0.015), dividerMat);
      d.position.set(0, y, 0.275);
      g.add(d);
    });

    const handleMat = new THREE.MeshStandardMaterial({ color: METAL_LIGHT, roughness: 0.4, metalness: 0.7 });
    [-0.36, 0.36].forEach((x) => {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.04), handleMat);
      h.position.set(x, 1.0, 0.29);
      g.add(h);
    });

    const topAccent = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.05, 0.02),
      new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.8 })
    );
    topAccent.position.set(0, 1.94, 0.26);
    g.add(topAccent);

    return g;
  }

  function buildStowageBag({ position, rotation = [0, 0, 0], scale = 1 }) {
    const THREE = window.THREE;
    const textures = getInteriorTextures();
    const map = createTiledTexture(textures.fabric, 2, 2);

    const g = new THREE.Group();
    g.position.set(position[0], position[1], position[2]);
    g.rotation.set(rotation[0], rotation[1], rotation[2]);
    g.scale.setScalar(scale);

    const bag = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.44, 0.42),
      new THREE.MeshStandardMaterial({ map, color: 0xb9ac96, roughness: 0.94, metalness: 0.02 })
    );
    bag.position.set(0, 0.22, 0);
    g.add(bag);

    const strapMat = new THREE.MeshStandardMaterial({ color: 0x4b4338, roughness: 0.85 });
    [-0.18, 0.18].forEach((z) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.46, 0.04), strapMat);
      s.position.set(0, 0.22, z);
      g.add(s);
    });

    const topHandle = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.03, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x3d3a33, roughness: 0.8 })
    );
    topHandle.position.set(0, 0.45, 0);
    g.add(topHandle);

    return g;
  }

  function buildCupolaWindow(position, width = 4.4, height = 1.85) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.position.set(position[0], position[1], position[2]);

    // The real photorealistic Earth is visible through this window from the
    // exterior scene, so no separate low-resolution Earth proxy is added here.

    // Optical glass pane
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshPhysicalMaterial({
        color: 0xa9d2e0,
        transparent: true,
        opacity: 0.1,
        roughness: 0.06,
        metalness: 0.05,
        depthWrite: false
      })
    );
    glass.position.set(0, 0, 0.01);
    g.add(glass);

    const frameMat = new THREE.MeshStandardMaterial({ color: METAL, roughness: 0.38, metalness: 0.75 });
    [
      { position: [0, height / 2 + 0.08, 0.04], size: [width + 0.32, 0.16, 0.16] },
      { position: [0, -height / 2 - 0.08, 0.04], size: [width + 0.32, 0.16, 0.16] },
      { position: [-width / 2 - 0.08, 0, 0.04], size: [0.16, height + 0.32, 0.16] },
      { position: [width / 2 + 0.08, 0, 0.04], size: [0.16, height + 0.32, 0.16] }
    ].forEach((f) => {
      const fm = new THREE.Mesh(new THREE.BoxGeometry(f.size[0], f.size[1], f.size[2]), frameMat);
      fm.position.set(f.position[0], f.position[1], f.position[2]);
      g.add(fm);
    });

    const mullionMat = new THREE.MeshStandardMaterial({ color: METAL_LIGHT, roughness: 0.4, metalness: 0.7 });
    [-width / 6, width / 6].forEach((mx) => {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.1), mullionMat);
      mm.position.set(mx, 0, 0.045);
      g.add(mm);
    });

    const boltMat = new THREE.MeshStandardMaterial({ color: 0x8b949b, roughness: 0.4, metalness: 0.8 });
    [
      [-width / 2 - 0.08, height / 2 + 0.08],
      [width / 2 + 0.08, height / 2 + 0.08],
      [-width / 2 - 0.08, -height / 2 - 0.08],
      [width / 2 + 0.08, -height / 2 - 0.08]
    ].forEach(([bx, by]) => {
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10), boltMat);
      bm.position.set(bx, by, 0.13);
      bm.rotation.set(Math.PI / 2, 0, 0);
      g.add(bm);
    });

    const sill = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.5, 0.12, 0.36),
      new THREE.MeshStandardMaterial({ color: METAL_LIGHT, roughness: 0.42, metalness: 0.7 })
    );
    sill.position.set(0, -height / 2 - 0.2, 0.16);
    g.add(sill);

    const winLight = new THREE.PointLight(0x8fc7ff, 1.4, 4, 2);
    winLight.position.set(0, 0, -0.6);
    g.add(winLight);

    return { group: g };
  }

  function buildFaultBeacon(position, color) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.position.set(position[0], position[1], position[2]);

    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.09, 0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthTest: false
      })
    );
    diamond.renderOrder = 12;
    group.add(diamond);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.22, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      })
    );
    ring.rotation.set(Math.PI / 2, 0, 0);
    ring.renderOrder = 12;
    group.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 1.8, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.08,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    beam.position.set(0, -1.1, 0);
    beam.renderOrder = 11;
    group.add(beam);

    return { group, ring, baseY: position[1] };
  }

  // ============================================================================
  // 4. ROOM WALLS, CONSOLES, HOLOTABLE & ROOM PROPS (ShipInterior.tsx)
  // ============================================================================
  function computeRoomWallBoxes(room) {
    const [cx, cz] = room.center;
    const [width, depth] = room.size;
    const boxes = [];
    const halfW = width / 2;
    const halfD = depth / 2;

    const fullWall = (side) => {
      if (side === "north" || side === "south") {
        const z = side === "north" ? cz - halfD : cz + halfD;
        boxes.push({
          key: `${room.id}-${side}`,
          position: [cx, WALL_HEIGHT / 2, z],
          size: [width, WALL_HEIGHT, WALL_THICKNESS]
        });
        return;
      }
      const x = side === "west" ? cx - halfW : cx + halfW;
      boxes.push({
        key: `${room.id}-${side}`,
        position: [x, WALL_HEIGHT / 2, cz],
        size: [WALL_THICKNESS, WALL_HEIGHT, depth]
      });
    };

    const doorWall = (side) => {
      const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT;
      const lintelY = DOOR_HEIGHT + lintelHeight / 2;

      if (side === "north" || side === "south") {
        const z = side === "north" ? cz - halfD : cz + halfD;
        const segment = (width - DOOR_WIDTH) / 2;
        const offset = (width + DOOR_WIDTH) / 4;
        boxes.push({
          key: `${room.id}-${side}-left`,
          position: [cx - offset, WALL_HEIGHT / 2, z],
          size: [segment, WALL_HEIGHT, WALL_THICKNESS]
        });
        boxes.push({
          key: `${room.id}-${side}-right`,
          position: [cx + offset, WALL_HEIGHT / 2, z],
          size: [segment, WALL_HEIGHT, WALL_THICKNESS]
        });
        boxes.push({
          key: `${room.id}-${side}-lintel`,
          position: [cx, lintelY, z],
          size: [DOOR_WIDTH, lintelHeight, WALL_THICKNESS]
        });
        return;
      }

      const x = side === "west" ? cx - halfW : cx + halfW;
      const segment = (depth - DOOR_WIDTH) / 2;
      const offset = (depth + DOOR_WIDTH) / 4;
      boxes.push({
        key: `${room.id}-${side}-north`,
        position: [x, WALL_HEIGHT / 2, cz - offset],
        size: [WALL_THICKNESS, WALL_HEIGHT, segment]
      });
      boxes.push({
        key: `${room.id}-${side}-south`,
        position: [x, WALL_HEIGHT / 2, cz + offset],
        size: [WALL_THICKNESS, WALL_HEIGHT, segment]
      });
      boxes.push({
        key: `${room.id}-${side}-lintel`,
        position: [x, lintelY, cz],
        size: [WALL_THICKNESS, lintelHeight, DOOR_WIDTH]
      });
    };

    const windowWall = () => {
      const z = cz - halfD;
      const windowWidth = 4.4;
      const windowBottom = 1.05;
      const windowTop = 2.9;
      const sideWidth = (width - windowWidth) / 2;

      boxes.push({
        key: `${room.id}-north-left`,
        position: [cx - windowWidth / 2 - sideWidth / 2, WALL_HEIGHT / 2, z],
        size: [sideWidth, WALL_HEIGHT, WALL_THICKNESS]
      });
      boxes.push({
        key: `${room.id}-north-right`,
        position: [cx + windowWidth / 2 + sideWidth / 2, WALL_HEIGHT / 2, z],
        size: [sideWidth, WALL_HEIGHT, WALL_THICKNESS]
      });
      boxes.push({
        key: `${room.id}-north-bottom`,
        position: [cx, windowBottom / 2, z],
        size: [windowWidth, windowBottom, WALL_THICKNESS]
      });
      boxes.push({
        key: `${room.id}-north-top`,
        position: [cx, (windowTop + WALL_HEIGHT) / 2, z],
        size: [windowWidth, WALL_HEIGHT - windowTop, WALL_THICKNESS]
      });
    };

    ["north", "south", "east", "west"].forEach((side) => {
      if (room.id === "command" && side === "north") {
        windowWall();
        return;
      }
      if (room.doors.includes(side)) {
        doorWall(side);
      } else {
        fullWall(side);
      }
    });

    return boxes;
  }

  function buildConnector(connector) {
    const THREE = window.THREE;
    const { center, width, depth } = connector;
    const horizontal = width > depth;
    const textures = getInteriorTextures();
    const floorMap = createTiledTexture(textures.floor, Math.max(1, width / 2.4), Math.max(1, depth / 2.4));
    const ceilingMap = createTiledTexture(textures.ceiling, Math.max(1, width / 3), Math.max(1, depth / 3));

    const g = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.14, depth),
      new THREE.MeshStandardMaterial({ map: floorMap, color: 0xa2a7ab, roughness: 0.72, metalness: 0.34 })
    );
    floor.position.set(center[0], -0.07, center[1]);
    g.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.08, depth),
      new THREE.MeshStandardMaterial({ map: ceilingMap, color: 0xd5d7d6, roughness: 0.7, metalness: 0.12 })
    );
    ceiling.position.set(center[0], WALL_HEIGHT + 0.04, center[1]);
    g.add(ceiling);

    const sideWallMat = new THREE.MeshStandardMaterial({ color: 0x3a4147, roughness: 0.62, metalness: 0.3 });
    if (horizontal) {
      [-width / 2, width / 2].forEach((dx) => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.12, WALL_HEIGHT, depth), sideWallMat);
        w.position.set(center[0] + dx, WALL_HEIGHT / 2, center[1]);
        g.add(w);
      });
    } else {
      [-depth / 2, depth / 2].forEach((dz) => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(width, WALL_HEIGHT, 0.12), sideWallMat);
        w.position.set(center[0], WALL_HEIGHT / 2, center[1] + dz);
        g.add(w);
      });
    }

    return g;
  }

  function buildRoomProps(roomId) {
    const THREE = window.THREE;
    const g = new THREE.Group();

    if (roomId === "command") {
      [-6.9, -8.5, -10.1].forEach((z) => {
        g.add(buildRack({ position: [-3.54, 0, z], rotation: [0, Math.PI / 2, 0], label: "LAB-A", accent: "#7f9fb8" }));
        g.add(buildRack({ position: [3.54, 0, z], rotation: [0, -Math.PI / 2, 0], label: "LAB-B", accent: "#7f9fb8" }));
      });
      g.add(buildStowageBag({ position: [-2.8, 0, -7.1], rotation: [0, 0.35, 0], scale: 0.9 }));
      g.add(buildStowageBag({ position: [2.8, 0, -9.4], rotation: [0, -0.3, 0], scale: 0.9 }));
      [-3.25, 3.25].forEach((x) => {
        const sideConsole = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 0.9, 0.7),
          new THREE.MeshStandardMaterial({ color: 0x152232, roughness: 0.55, metalness: 0.5 })
        );
        sideConsole.position.set(x, 0.52, -10.2);
        g.add(sideConsole);
      });
      return g;
    }

    if (roomId === "power") {
      g.add(buildRack({ position: [-8.3, 0, -3.54], label: "PWR-A", accent: "#c9a05a" }));
      g.add(buildRack({ position: [-8.3, 0, 3.54], rotation: [0, Math.PI, 0], label: "PWR-B", accent: "#c9a05a" }));
      g.add(buildStowageBag({ position: [-6.6, 0, 2.9], rotation: [0, 0.4, 0], scale: 0.9 }));
      [-2.6, 2.6].forEach((z) => {
        const bg = new THREE.Group();
        bg.position.set(-11.75, 0, z);
        const bank = new THREE.Mesh(
          new THREE.BoxGeometry(0.72, 1.56, 1.35),
          new THREE.MeshStandardMaterial({ color: 0x18212a, roughness: 0.52, metalness: 0.55 })
        );
        bank.position.set(0, 0.78, 0);
        bg.add(bank);
        [0.35, 0.78, 1.21].forEach((y) => {
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.06, 0.95),
            new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.75 })
          );
          bar.position.set(0.38, y, 0);
          bg.add(bar);
        });
        g.add(bg);
      });
      [-2.2, 0, 2.2].forEach((z) => {
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8),
          new THREE.MeshStandardMaterial({ color: 0x0e1822, metalness: 0.6, roughness: 0.45 })
        );
        pipe.position.set(-10.6, 0.16, z);
        pipe.rotation.set(0, 0, Math.PI / 2);
        g.add(pipe);
      });
      return g;
    }

    if (roomId === "life-support") {
      g.add(buildRack({ position: [8.3, 0, -3.54], label: "ECLSS-A", accent: "#7fb8a6" }));
      g.add(buildRack({ position: [8.3, 0, 3.54], rotation: [0, Math.PI, 0], label: "ECLSS-B", accent: "#7fb8a6" }));
      g.add(buildStowageBag({ position: [6.6, 0, -3.0], rotation: [0, -0.35, 0], scale: 0.9 }));
      [-2.45, 2.45].forEach((z) => {
        const tg = new THREE.Group();
        tg.position.set(11.45, 0, z);
        const cyl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.56, 0.56, 2.1, 16),
          new THREE.MeshStandardMaterial({ color: 0x17302b, roughness: 0.48, metalness: 0.5 })
        );
        cyl.position.set(0, 1.05, 0);
        tg.add(cyl);
        [0.45, 0.95, 1.45].forEach((y) => {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.57, 0.025, 6, 24),
            new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x34d399, emissiveIntensity: 0.9 })
          );
          ring.position.set(0, y, 0);
          tg.add(ring);
        });
        g.add(tg);
      });
      const floorPipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 2.7, 8),
        new THREE.MeshStandardMaterial({ color: 0x0e1822, metalness: 0.6, roughness: 0.45 })
      );
      floorPipe.position.set(10.3, 0.18, 0);
      floorPipe.rotation.set(0, 0, Math.PI / 2);
      g.add(floorPipe);
      return g;
    }

    if (roomId === "hull") {
      [-3.35, 3.35].forEach((x) => {
        [6.4, 9.3].forEach((z) => {
          const unit = new THREE.Mesh(
            new THREE.BoxGeometry(0.78, 1.56, 1.25),
            new THREE.MeshStandardMaterial({ color: 0x21161b, roughness: 0.55, metalness: 0.5 })
          );
          unit.position.set(x, 0.78, z);
          g.add(unit);

          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.16, 1.0),
            new THREE.MeshStandardMaterial({ color: 0xfb7185, emissive: 0xfb7185, emissiveIntensity: 1.05 })
          );
          stripe.position.set(x + (x < 0 ? 0.4 : -0.4), 0.86, z);
          g.add(stripe);
        });
      });
      const threshold = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.03, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xfb7185, emissive: 0xfb7185, emissiveIntensity: 0.9 })
      );
      threshold.position.set(0, 0.03, 11.15);
      g.add(threshold);
      return g;
    }

    if (roomId === "lander") {
      g.add(buildRack({ position: [-4.0, 0, 13.4], rotation: [0, Math.PI / 2, 0], label: "LDR-A", accent: "#9a8fc4" }));
      g.add(buildRack({ position: [4.0, 0, 13.4], rotation: [0, -Math.PI / 2, 0], label: "LDR-B", accent: "#9a8fc4" }));
      g.add(buildStowageBag({ position: [-3.2, 0, 15.4], rotation: [0, 0.35, 0], scale: 0.9 }));

      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(3.15, 3.15, 0.06, 28),
        new THREE.MeshStandardMaterial({ color: 0x0c1521, roughness: 0.65, metalness: 0.45 })
      );
      pad.position.set(0, 0.03, 16.05);
      g.add(pad);

      const padRing = new THREE.Mesh(
        new THREE.TorusGeometry(3.3, 0.035, 8, 48),
        new THREE.MeshStandardMaterial({ color: 0xa78bfa, emissive: 0xa78bfa, emissiveIntensity: 0.9 })
      );
      padRing.position.set(0, 0.06, 16.05);
      padRing.rotation.set(Math.PI / 2, 0, 0);
      g.add(padRing);

      [-2.15, 2.15].forEach((x) => {
        const sg = new THREE.Group();
        sg.position.set(x, 0, 17.1);
        sg.rotation.set(0, x < 0 ? 0.42 : -0.42, 0);

        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.92, 0.72, 0.8),
          new THREE.MeshStandardMaterial({ color: 0x171326, roughness: 0.55, metalness: 0.5 })
        );
        base.position.set(0, 0.42, 0);
        sg.add(base);

        const bezel = new THREE.Mesh(
          new THREE.BoxGeometry(0.82, 0.62, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x070c17, roughness: 0.3, metalness: 0.55 })
        );
        bezel.position.set(0, 0.88, -0.08);
        sg.add(bezel);

        const scr = new THREE.Mesh(
          new THREE.BoxGeometry(0.58, 0.36, 0.02),
          new THREE.MeshStandardMaterial({
            color: 0xa78bfa,
            emissive: 0xa78bfa,
            emissiveIntensity: 0.55,
            transparent: true,
            opacity: 0.6
          })
        );
        scr.position.set(0, 0.88, -0.02);
        sg.add(scr);
        g.add(sg);
      });

      const viewportFrame = new THREE.Mesh(
        new THREE.BoxGeometry(6.1, 2.25, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x07101c, roughness: 0.28, metalness: 0.6 })
      );
      viewportFrame.position.set(0, 2.02, 19.9);
      g.add(viewportFrame);

      const viewportGlass = new THREE.Mesh(
        new THREE.BoxGeometry(5.7, 1.9, 0.02),
        new THREE.MeshStandardMaterial({
          color: 0x16264b,
          emissive: 0x1d4ed8,
          emissiveIntensity: 0.5,
          transparent: true,
          opacity: 0.72
        })
      );
      viewportGlass.position.set(0, 2.02, 19.84);
      g.add(viewportGlass);

      const moonSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 24, 18),
        new THREE.MeshStandardMaterial({
          color: 0xcbd5e1,
          emissive: 0x94a3b8,
          emissiveIntensity: 0.35,
          roughness: 0.9,
          metalness: 0.05
        })
      );
      moonSphere.position.set(0, 2.06, 19.72);
      g.add(moonSphere);

      const moonOrbit = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.012, 6, 48),
        new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.7 })
      );
      moonOrbit.position.set(0, 2.06, 19.62);
      moonOrbit.rotation.set(Math.PI / 2, 0, 0);
      g.add(moonOrbit);

      const landerLight = new THREE.PointLight(0xa78bfa, 2.4, 6, 1.8);
      landerLight.position.set(0, 2.2, 18.5);
      g.add(landerLight);
      return g;
    }

    // Hub props
    g.add(buildRack({ position: [-3.54, 0, -1.55], rotation: [0, Math.PI / 2, 0], label: "HUB-A2", accent: "#7fa8b8" }));
    g.add(buildRack({ position: [-3.54, 0, 1.55], rotation: [0, Math.PI / 2, 0], label: "HUB-A4", accent: "#7fa8b8" }));
    g.add(buildLocker({ position: [3.54, 0, 1.75], rotation: [0, -Math.PI / 2, 0], accent: "#7fa8b8" }));
    g.add(buildLocker({ position: [3.54, 0, -1.75], rotation: [0, -Math.PI / 2, 0], accent: "#7fa8b8" }));
    g.add(buildStowageBag({ position: [-2.95, 0, 0.55], rotation: [0, 0.35, 0] }));
    g.add(buildStowageBag({ position: [2.95, 0, 0.2], rotation: [0, -0.25, 0], scale: 0.9 }));
    g.add(buildStowageBag({ position: [2.65, 0, 2.7], rotation: [0, 0.5, 0], scale: 0.8 }));
    return g;
  }

  // ============================================================================
  // 5. ANAMORPHIC SUN FLARE (SunFlare.tsx)
  // ============================================================================
  function makeGlowTexture(size = 256) {
    const { element, context } = makeCanvas(size, size);
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255, 252, 244, 1)");
    gradient.addColorStop(0.12, "rgba(255, 244, 224, 0.9)");
    gradient.addColorStop(0.32, "rgba(255, 214, 170, 0.34)");
    gradient.addColorStop(0.62, "rgba(255, 190, 140, 0.08)");
    gradient.addColorStop(1, "rgba(255, 180, 120, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return applyTextureEncoding(new window.THREE.CanvasTexture(element), 4);
  }

  function makeStreakTexture(width = 1024, height = 128) {
    const { element, context } = makeCanvas(width, height);
    const horizontal = context.createLinearGradient(0, 0, width, 0);
    horizontal.addColorStop(0, "rgba(255, 196, 140, 0)");
    horizontal.addColorStop(0.3, "rgba(255, 224, 190, 0.25)");
    horizontal.addColorStop(0.5, "rgba(255, 248, 236, 0.9)");
    horizontal.addColorStop(0.7, "rgba(255, 224, 190, 0.25)");
    horizontal.addColorStop(1, "rgba(255, 196, 140, 0)");
    context.fillStyle = horizontal;
    context.fillRect(0, 0, width, height);

    const vertical = context.createLinearGradient(0, 0, 0, height);
    vertical.addColorStop(0, "rgba(0, 0, 0, 0)");
    vertical.addColorStop(0.5, "rgba(0, 0, 0, 1)");
    vertical.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = vertical;
    context.fillRect(0, 0, width, height);
    return applyTextureEncoding(new window.THREE.CanvasTexture(element), 4);
  }

  function buildSunFlare() {
    const THREE = window.THREE;
    const glow = makeGlowTexture();
    const streak = makeStreakTexture();
    const group = new THREE.Group();
    group.name = "Lunaspis_SunFlare";

    const s1 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: streak,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.55
      })
    );
    s1.scale.set(22, 0.6, 1);
    s1.renderOrder = 30;
    group.add(s1);

    const s2 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.28
      })
    );
    s2.scale.set(4.2, 4.2, 1);
    s2.renderOrder = 31;
    group.add(s2);

    const s3 = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.95
      })
    );
    s3.scale.set(1.35, 1.35, 1);
    s3.renderOrder = 32;
    group.add(s3);

    const localDir = new THREE.Vector3(0.4, 0.22, -1).normalize();
    const worldDir = new THREE.Vector3();

    return {
      group,
      update: (camera) => {
        if (!camera || !group.visible) return;
        worldDir.copy(localDir).applyQuaternion(camera.quaternion);
        group.position.copy(camera.position).addScaledVector(worldDir, 40);
      }
    };
  }

  // ============================================================================
  // 6. 3D LUNAR LANDING SCENE (MoonLandingScene.tsx)
  // ============================================================================
  function seededValue(seed, step) {
    let x = Math.imul(seed ^ Math.imul(step + 1, 0x9e3779b1), 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  function seededRange(seed, step, min, max) {
    return min + seededValue(seed, step) * (max - min);
  }

  function terrainHeight(x, z) {
    return (
      Math.sin(x * 0.19) * 0.24 +
      Math.cos(z * 0.17) * 0.22 +
      Math.sin((x + z) * 0.33) * 0.11 +
      Math.cos((x - z) * 0.09) * 0.16
    );
  }

  function buildMoonLandingScene() {
    const THREE = window.THREE;
    const root = new THREE.Group();
    root.name = "MoonLandingScene_MareTranquillitatis";
    root.visible = false;

    // Lighting
    root.add(new THREE.AmbientLight(0xdbeafe, 0.38));
    root.add(new THREE.HemisphereLight(0x9ccfff, 0x1a1c22, 1.25));
    const dirLight = new THREE.DirectionalLight(0xfff4dc, 2.3);
    dirLight.position.set(-10, 14, 8);
    root.add(dirLight);

    // Lunar terrain (90x90 plane with flattened landing center)
    const terrainGeo = new THREE.PlaneGeometry(90, 90, 90, 90);
    terrainGeo.rotateX(-Math.PI / 2);
    const posAttr = terrainGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const dist = Math.hypot(x, z);
      const flatten = Math.min(1, dist / 8);
      posAttr.setY(i, terrainHeight(x, z) * flatten - 0.02);
    }
    terrainGeo.computeVertexNormals();
    const terrainMesh = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({ color: 0x8b9199, roughness: 0.98, metalness: 0.02 })
    );
    terrainMesh.receiveShadow = true;
    root.add(terrainMesh);

    // 28 Seeded Craters
    const CRATER_SEED = 4471;
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x6f757d, roughness: 1, metalness: 0 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x5f656d, roughness: 1, metalness: 0 });
    for (let i = 0; i < 28; i++) {
      const angle = seededRange(CRATER_SEED, i * 4, 0, Math.PI * 2);
      const distance = seededRange(CRATER_SEED, i * 4 + 1, 6, 38);
      const radius = seededRange(CRATER_SEED, i * 4 + 2, 0.5, 2.8);
      const cg = new THREE.Group();
      cg.position.set(Math.cos(angle) * distance, 0.015, Math.sin(angle) * distance);

      const rim = new THREE.Mesh(new THREE.RingGeometry(radius * 0.72, radius, 28), rimMat);
      rim.rotation.set(-Math.PI / 2, 0, 0);
      cg.add(rim);

      const cFloor = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.8, 28), floorMat);
      cFloor.rotation.set(-Math.PI / 2, 0, 0);
      cFloor.position.set(0, 0.003, 0);
      cg.add(cFloor);
      root.add(cg);
    }

    // 3D Lunar Lander
    const lander = new THREE.Group();
    lander.name = "LunarLander_Craft";

    const descentStage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.55, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0xb58a3f, roughness: 0.62, metalness: 0.5 })
    );
    descentStage.position.set(0, 1.15, 0);
    lander.add(descentStage);

    const interstage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.25, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x202833, roughness: 0.55, metalness: 0.6 })
    );
    interstage.position.set(0, 1.55, 0);
    lander.add(interstage);

    const ascentCabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.15, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xc9cdd2, roughness: 0.58, metalness: 0.32 })
    );
    ascentCabin.position.set(0, 2.05, 0);
    lander.add(ascentCabin);

    const topDeck = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.28, 1.45),
      new THREE.MeshStandardMaterial({ color: 0x202833, roughness: 0.5, metalness: 0.6 })
    );
    topDeck.position.set(0, 2.68, 0);
    lander.add(topDeck);

    const antMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x9aa1a9, roughness: 0.5, metalness: 0.7 })
    );
    antMast.position.set(0.92, 2.04, 0.92);
    lander.add(antMast);

    const antDish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: 0xdbe2e8, roughness: 0.45, metalness: 0.45 })
    );
    antDish.position.set(0.92, 2.74, 0.92);
    antDish.rotation.set(0, 0, -0.55);
    lander.add(antDish);

    const cabinWin = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.36, 0.05),
      new THREE.MeshStandardMaterial({
        color: 0x67e8f9,
        emissive: 0x67e8f9,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.62
      })
    );
    cabinWin.position.set(0.62, 2.15, 0.91);
    lander.add(cabinWin);

    const strutMat = new THREE.MeshStandardMaterial({ color: 0xaab1b9, roughness: 0.5, metalness: 0.68 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x8b939e, roughness: 0.72, metalness: 0.35 });
    [
      [-1.25, 0.55, -1.25],
      [1.25, 0.55, -1.25],
      [-1.25, 0.55, 1.25],
      [1.25, 0.55, 1.25]
    ].forEach(([lx, ly, lz]) => {
      const lg = new THREE.Group();
      lg.position.set(lx, ly, lz);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.85, 8), strutMat);
      leg.rotation.set(0, 0, lx > 0 ? -0.55 : 0.55);
      lg.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.08, 12), padMat);
      foot.position.set(0, -0.66, 0);
      lg.add(foot);
      lander.add(lg);
    });

    const tankSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 18, 12),
      new THREE.MeshStandardMaterial({
        color: 0xd9a441,
        emissive: 0x5a3b0d,
        emissiveIntensity: 0.18,
        roughness: 0.75,
        metalness: 0.4
      })
    );
    tankSphere.position.set(-0.56, 0.98, -0.75);
    tankSphere.rotation.set(0.2, 0.3, -0.1);
    lander.add(tankSphere);

    const landerPtLight = new THREE.PointLight(0xf8e7bd, 2, 8, 2);
    landerPtLight.position.set(0, 3.8, 2.4);
    lander.add(landerPtLight);
    root.add(lander);

    // Earth rising in the Lunar sky
    const earthGroup = new THREE.Group();
    earthGroup.position.set(15, 11.5, -25);
    earthGroup.rotation.set(0, -0.5, 0.18);
    const texLoader = new THREE.TextureLoader();
    const earthTex = texLoader.load("textures/earth/blue-marble-2048.jpg");
    applyTextureEncoding(earthTex, 8);

    const earthSphere = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 48, 32),
      new THREE.MeshStandardMaterial({
        map: earthTex,
        emissive: 0x15325f,
        emissiveIntensity: 0.18,
        roughness: 0.85,
        metalness: 0.02
      })
    );
    earthGroup.add(earthSphere);

    const earthAtm = new THREE.Mesh(
      new THREE.SphereGeometry(3.52, 32, 20),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        transparent: true,
        opacity: 0.09,
        side: THREE.BackSide
      })
    );
    earthGroup.add(earthAtm);
    root.add(earthGroup);

    const skyGlow = new THREE.Mesh(
      new THREE.SphereGeometry(18, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0x0a1a38, transparent: true, opacity: 0.18 })
    );
    skyGlow.position.set(0, 14, -32);
    root.add(skyGlow);

    return { root, lander, earthGroup };
  }

  // ============================================================================
  // 7. MAIN SHIP INTERIOR MANAGER CLASS
  // ============================================================================
  class ShipInteriorManager {
    constructor() {
      this.scene = null;
      this.group = null;
      this.activeRoomId = "hub";
      this.isInteriorActive = true;
      this.isMoonLandingActive = false;

      // Dynamic animated elements
      this.holoRingGroup = null;
      this.holoCoreMesh = null;
      this.stationEntries = {}; // stationId -> { station, indicatorMat1, indicatorMat2, labelMat, beacon }
      this.roomVisuals = {}; // roomId -> { doorFrames, ceilingLights }
      this.moonLanding = null;
      this.sunFlare = null;
      this.roomShellGroup = null;
      this.stationInteractionGroup = null;
      this.legacyPropsGroup = null;
      this.issInteriorModelGroup = null;
      this.issInteriorModel = null;
      this.issInteriorBacking = null;
      this.issInteriorModelPromise = null;
      this.issInteriorLoadProgress = -1;
      this.fallbackStationLayout = Object.fromEntries(Object.entries(STATIONS).map(([id, station]) => [id, {
        position: station.position.slice(), workPosition: station.workPosition.slice()
      }]));
      this.fallbackTaskPositions = null;

      // UI Overlays
      this.hudPill = null;
      this.minimapEl = null;
    }

    init(scene) {
      this.scene = scene;
      const THREE = window.THREE;

      this.group = new THREE.Group();
      this.group.name = "ShipInterior_ModularCraft";
      this.group.position.set(0, 0, 0);
      this.group.visible = true;
      this.scene.add(this.group);

      const interiorGroup = this.group;

      // Interior lighting matching SpaceShip/src/components/game/ShipInterior.tsx
      this.group.add(new THREE.AmbientLight(0xffffff, 0.38));
      this.group.add(new THREE.HemisphereLight(0xcfd9e2, 0x0a0f16, 0.6));
      const dirLight = new THREE.DirectionalLight(0xffe9cf, 0.32);
      dirLight.position.set(5, 8, 3);
      this.group.add(dirLight);

      this.roomShellGroup = new THREE.Group();
      this.roomShellGroup.name = "ISS_Interior_Procedural_Fallback";
      this.stationInteractionGroup = new THREE.Group();
      this.stationInteractionGroup.name = "ISS_Interior_Mission_Stations";
      this.legacyPropsGroup = new THREE.Group();
      this.legacyPropsGroup.name = "ISS_Interior_Procedural_Props";
      this.issInteriorModelGroup = new THREE.Group();
      this.issInteriorModelGroup.name = "ISS_Interior_Stephen_Mack_Model";
      this.issInteriorModelGroup.visible = false;
      interiorGroup.add(this.roomShellGroup);
      interiorGroup.add(this.stationInteractionGroup);
      interiorGroup.add(this.legacyPropsGroup);
      interiorGroup.add(this.issInteriorModelGroup);

      this.group = this.roomShellGroup;
      this._buildAllRoomsAndConnectors();

      this.group = this.stationInteractionGroup;
      this._buildHoloTable();
      this._buildStationConsoles();

      this.group = this.legacyPropsGroup;
      this._buildAllRoomProps();
      this.group = interiorGroup;

      // Build Moon Landing Scene & SunFlare in main scene
      this.moonLanding = buildMoonLandingScene();
      this.scene.add(this.moonLanding.root);

      this.sunFlare = buildSunFlare();
      this.scene.add(this.sunFlare.group);

      // Build HUD compartment banner & live SVG Ship Minimap
      this._buildInteractiveHUD();
      this._buildMinimapDOM();

      console.log("🛸 [SpaceShip] 6-room Lunaspis modular transit craft, friendly crew map & lunar landing scene online.");
    }

    _setInteriorTitle(text) {
      const titleEl = document.getElementById("ship-room-title");
      if (titleEl) titleEl.textContent = text;
    }

    _ensureISSInteriorModel() {
      if (this.issInteriorModel) return Promise.resolve(this.issInteriorModel);
      if (this.issInteriorModelPromise) return this.issInteriorModelPromise;
      if (!window.glbManager || typeof window.glbManager.loadGLB !== "function") {
        return Promise.reject(new Error("The GLB manager is not available."));
      }

      this.issInteriorLoadProgress = -1;
      this._setInteriorTitle("LOADING ISS INTERIOR · 0%");
      this.issInteriorModelPromise = window.glbManager.loadGLB(
        ISS_INTERIOR_MODEL_URL,
        (percent) => {
          if (percent === this.issInteriorLoadProgress) return;
          this.issInteriorLoadProgress = percent;
          if (this.isInteriorActive && !this.isMoonLandingActive) {
            this._setInteriorTitle(`LOADING ISS INTERIOR · ${percent}%`);
          }
        }
      ).then(() => {
        const THREE = window.THREE;
        const model = window.glbManager.instantiateModel(ISS_INTERIOR_MODEL_URL, {
          scale: ISS_INTERIOR_MODEL_SCALE,
          center: false,
          castShadow: false,
          receiveShadow: false,
          enhancePBR: false
        });
        model.name = "Stephen_Mack_ISS_Interior_CC_BY_4_0";

        // Anchor using Node 1, then place the crew spawn in Destiny's clearer
        // corridor. Its scan includes incomplete surfaces and stray polygons.
        const nodeOneBounds = new THREE.Box3();
        model.updateMatrixWorld(true);
        model.traverse((object) => {
          if (!object.isMesh) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          if (!materials.some((material) => /NODE1_and_QUEST_FINAL/i.test(material && material.name || ""))) return;
          nodeOneBounds.union(new THREE.Box3().setFromObject(object));
        });
        const referenceBounds = nodeOneBounds.isEmpty()
          ? new THREE.Box3().setFromObject(model)
          : nodeOneBounds;
        const referenceCenter = new THREE.Vector3();
        referenceBounds.getCenter(referenceCenter);
        // A half-unit downward adjustment keeps the astronaut's view within
        // the photographed corridor instead of beneath its uneven floor scan.
        model.position.set(-referenceCenter.x - 1.8, -referenceBounds.min.y - 0.5, -referenceCenter.z + 9.3);

        model.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = false;
          object.receiveShadow = false;
          // The scan's photographs already contain lighting. Display their
          // original colors without applying scene lighting a second time.
          const convert = (material) => {
            if (!material || !material.map) return material;
            if (window.renderer && window.renderer.capabilities) {
              material.map.anisotropy = Math.min(8, window.renderer.capabilities.getMaxAnisotropy());
            }
            return new THREE.MeshBasicMaterial({
              map: material.map, color: material.color, side: material.side,
              transparent: material.transparent, opacity: material.opacity,
              alphaTest: material.alphaTest, depthWrite: material.depthWrite,
              toneMapped: false
            });
          };
          object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
        });
        this.issInteriorModelGroup.add(model);
        this.issInteriorBacking = this._buildISSInteriorBacking();
        this.issInteriorModelGroup.add(this.issInteriorBacking);
        model.updateMatrixWorld(true);
        this.issInteriorModel = model;
        this._applyISSStationLayout();
        this._placeCrewOnISSWalkway();

        if (this.roomShellGroup) this.roomShellGroup.visible = false;
        if (this.legacyPropsGroup) this.legacyPropsGroup.visible = false;
        this.issInteriorModelGroup.visible = this.isInteriorActive && !this.isMoonLandingActive;
        if (this.isInteriorActive && !this.isMoonLandingActive) {
          this._setInteriorTitle("INTERNATIONAL SPACE STATION · INTERIOR");
        }
        console.log("🛰️ [ISS Interior] Stephen Mack's Sketchfab interior loaded (CC BY 4.0).");
        return model;
      }).catch((error) => {
        this.issInteriorModelPromise = null;
        if (this.issInteriorModelGroup && this.issInteriorModel) this.issInteriorModelGroup.remove(this.issInteriorModel);
        if (this.issInteriorModelGroup && this.issInteriorBacking) this.issInteriorModelGroup.remove(this.issInteriorBacking);
        this.issInteriorModel = null;
        this.issInteriorBacking = null;
        this._restoreFallbackStationLayout();
        if (this.roomShellGroup) this.roomShellGroup.visible = true;
        if (this.legacyPropsGroup) this.legacyPropsGroup.visible = true;
        if (this.issInteriorModelGroup) this.issInteriorModelGroup.visible = false;
        if (this.isInteriorActive && !this.isMoonLandingActive) {
          this._setInteriorTitle("ISS INTERIOR MODEL UNAVAILABLE · CURRENT INTERIOR ACTIVE");
        }
        console.warn("Could not load the ISS interior model; using the procedural interior:", error);
        throw error;
      });

      return this.issInteriorModelPromise;
    }

    _buildISSInteriorBacking() {
      const THREE = window.THREE;
      const group = new THREE.Group();
      group.name = "ISS_Interior_Gap_Backing";
      const step = 0.5;
      const cells = new Set();
      const key = (x, z) => `${x},${z}`;
      for (let x = -17; x <= 25; x++) {
        for (let z = -13; z <= 81; z++) {
          const cx = (x + 0.5) * step, cz = (z + 0.5) * step;
          if (ISS_WALK_ZONES.some((zone) => cx >= zone.xMin - 0.5 && cx <= zone.xMax + 0.5 && cz >= zone.zMin - 0.5 && cz <= zone.zMax + 0.5)) {
            cells.add(key(x, z));
          }
        }
      }
      const floors = [], ceilings = [], eastWest = [], northSouth = [];
      cells.forEach((cell) => {
        const [x, z] = cell.split(",").map(Number);
        const cx = (x + 0.5) * step, cz = (z + 0.5) * step;
        floors.push([cx, -0.09, cz]);
        ceilings.push([cx, 2.85, cz]);
        if (!cells.has(key(x - 1, z))) eastWest.push([cx - step / 2, 1.38, cz]);
        if (!cells.has(key(x + 1, z))) eastWest.push([cx + step / 2, 1.38, cz]);
        if (!cells.has(key(x, z - 1))) northSouth.push([cx, 1.38, cz - step / 2]);
        if (!cells.has(key(x, z + 1))) northSouth.push([cx, 1.38, cz + step / 2]);
      });
      const textures = getInteriorTextures();
      const makePanels = (size, positions, color, map) => {
        const mesh = new THREE.InstancedMesh(
          new THREE.BoxGeometry(...size),
          new THREE.MeshStandardMaterial({ color, map, roughness: 0.9, metalness: 0.08 }),
          positions.length
        );
        const transform = new THREE.Object3D();
        positions.forEach((position, index) => {
          transform.position.set(...position);
          transform.updateMatrix();
          mesh.setMatrixAt(index, transform.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        group.add(mesh);
      };
      makePanels([step, 0.12, step], floors, 0xaeb7ba, textures.floor);
      makePanels([step, 0.12, step], ceilings, 0xb8c2c5, textures.ceiling);
      makePanels([0.08, 2.9, step], eastWest, 0xb8c2c5, textures.wall);
      makePanels([step, 2.9, 0.08], northSouth, 0xb8c2c5, textures.wall);
      return group;
    }

    _applyISSStationLayout() {
      if (window.gameplay && Array.isArray(window.gameplay.tasks) && !this.fallbackTaskPositions) {
        this.fallbackTaskPositions = window.gameplay.tasks.map((task) => task.pos.slice());
      }
      Object.entries(ISS_STATION_LAYOUT).forEach(([id, layout]) => {
        const station = STATIONS[id];
        station.position = layout.position.slice();
        station.workPosition = layout.workPosition.slice();
        const object = this.stationInteractionGroup.getObjectByName(id === "hub" ? "Hub_HoloTable" : `Console_${id}`);
        if (object) {
          object.position.set(layout.position[0], 0, layout.position[2]);
          object.scale.setScalar(0.55);
        }
        const entry = this.stationEntries[id];
        if (entry && entry.beacon) entry.beacon.group.position.set(layout.position[0], entry.beacon.baseY, layout.position[2]);
      });
      if (window.gameplay && Array.isArray(window.gameplay.tasks)) {
        window.gameplay.tasks.forEach((task) => {
          const layout = ISS_STATION_LAYOUT[task.stationId];
          if (layout) task.pos = layout.workPosition.slice();
        });
      }
      this._updateMinimapDOM();
    }

    _restoreFallbackStationLayout() {
      Object.entries(this.fallbackStationLayout).forEach(([id, layout]) => {
        const station = STATIONS[id];
        station.position = layout.position.slice();
        station.workPosition = layout.workPosition.slice();
        const object = this.stationInteractionGroup && this.stationInteractionGroup.getObjectByName(id === "hub" ? "Hub_HoloTable" : `Console_${id}`);
        if (object) {
          object.position.set(layout.position[0], 0, layout.position[2]);
          object.scale.setScalar(1);
        }
        const entry = this.stationEntries[id];
        if (entry && entry.beacon) entry.beacon.group.position.set(layout.position[0], entry.beacon.baseY, layout.position[2]);
      });
      if (this.fallbackTaskPositions && window.gameplay && Array.isArray(window.gameplay.tasks)) {
        window.gameplay.tasks.forEach((task, index) => {
          if (this.fallbackTaskPositions[index]) task.pos = this.fallbackTaskPositions[index].slice();
        });
      }
      this.fallbackTaskPositions = null;
    }

    _placeCrewOnISSWalkway() {
      if (!this.isInteriorActive || (window.spaceCenter && window.spaceCenter.isGroundMode)) return;
      const crew = window.localCrew && window.localCrew.group;
      if (!crew || this.canStandAt(crew.position.x, crew.position.z, 0.32)) return;
      const candidates = ISS_WALK_ZONES.map((zone) => ({
        x: Math.max(zone.xMin + 0.4, Math.min(zone.xMax - 0.4, crew.position.x)),
        z: Math.max(zone.zMin + 0.4, Math.min(zone.zMax - 0.4, crew.position.z))
      })).filter((point) => this.canStandAt(point.x, point.z, 0.32));
      candidates.sort((a, b) => Math.hypot(a.x - crew.position.x, a.z - crew.position.z) - Math.hypot(b.x - crew.position.x, b.z - crew.position.z));
      const target = candidates[0] || { x: 0, z: 2 };
      crew.position.set(target.x, 0, target.z);
    }

    _buildAllRoomsAndConnectors() {
      const THREE = window.THREE;
      const textures = getInteriorTextures();

      ROOMS.forEach((room) => {
        const rg = new THREE.Group();
        rg.name = `Room_${room.id}`;
        const [cx, cz] = room.center;
        const [width, depth] = room.size;

        const floorMap = createTiledTexture(textures.floor, Math.max(1, width / 2.4), Math.max(1, depth / 2.4));
        const ceilingMap = createTiledTexture(textures.ceiling, Math.max(1, width / 3), Math.max(1, depth / 3));

        const floor = new THREE.Mesh(
          new THREE.BoxGeometry(width, 0.14, depth),
          new THREE.MeshStandardMaterial({ map: floorMap, color: 0xa2a7ab, roughness: 0.72, metalness: 0.34 })
        );
        floor.position.set(cx, -0.07, cz);
        rg.add(floor);

        const ceiling = new THREE.Mesh(
          new THREE.BoxGeometry(width, 0.08, depth),
          new THREE.MeshStandardMaterial({ map: ceilingMap, color: 0xd5d7d6, roughness: 0.7, metalness: 0.12 })
        );
        ceiling.position.set(cx, WALL_HEIGHT + 0.04, cz);
        rg.add(ceiling);

        const wallBoxes = computeRoomWallBoxes(room);
        wallBoxes.forEach((box) => {
          rg.add(buildPanelWall(box, room.center));
        });

        const doorFrames = [];
        room.doors.forEach((side) => {
          const df = buildDoorFrame(room, side);
          rg.add(df.group);
          doorFrames.push(df);
        });

        const ceilingLights = buildCeilingLights(room.center);
        rg.add(ceilingLights.group);

        rg.add(buildFloorDetails(room));

        if (room.id === "command") {
          const cupola = buildCupolaWindow([cx, 1.975, cz - depth / 2 + 0.02]);
          rg.add(cupola.group);
        }

        this.roomVisuals[room.id] = { doorFrames, ceilingLights, hasFault: false };
        this.group.add(rg);
      });

      CONNECTORS.forEach((conn) => {
        this.group.add(buildConnector(conn));
      });
    }

    _buildHoloTable() {
      const THREE = window.THREE;
      const g = new THREE.Group();
      g.name = "Hub_HoloTable";
      g.position.set(STATIONS.hub.position[0], 0, STATIONS.hub.position[2]);

      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.95, 1.12, 0.68, 20),
        new THREE.MeshStandardMaterial({ color: 0x111d2b, roughness: 0.52, metalness: 0.55 })
      );
      pedestal.position.set(0, 0.34, 0);
      g.add(pedestal);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(1.18, 1.18, 0.08, 24),
        new THREE.MeshStandardMaterial({
          color: 0x263a40,
          emissive: 0x3a7a8a,
          emissiveIntensity: 0.2,
          roughness: 0.32,
          metalness: 0.4
        })
      );
      rim.position.set(0, 0.73, 0);
      g.add(rim);

      this.holoRingGroup = new THREE.Group();
      this.holoRingGroup.position.set(0, 1.06, 0);

      const t1 = new THREE.Mesh(
        new THREE.TorusGeometry(1.22, 0.025, 8, 56),
        new THREE.MeshStandardMaterial({ color: 0x8fc7d4, emissive: 0x5f8f9c, emissiveIntensity: 0.45 })
      );
      t1.rotation.set(Math.PI / 2, 0, 0);
      this.holoRingGroup.add(t1);

      const t2 = new THREE.Mesh(
        new THREE.TorusGeometry(0.9, 0.018, 8, 48),
        new THREE.MeshStandardMaterial({ color: 0x8fc7d4, emissive: 0x5f8f9c, emissiveIntensity: 0.35 })
      );
      t2.rotation.set(Math.PI / 2.8, 0.4, 0);
      this.holoRingGroup.add(t2);
      g.add(this.holoRingGroup);

      this.holoCoreMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.42, 1),
        new THREE.MeshBasicMaterial({ color: 0x8fc7d4, wireframe: true, transparent: true, opacity: 0.22 })
      );
      this.holoCoreMesh.position.set(0, 1.22, 0);
      g.add(this.holoCoreMesh);

      const pt = new THREE.PointLight(0x8fc7d4, 1.1, 5.2, 1.8);
      pt.position.set(0, 1.35, 0);
      g.add(pt);

      this.group.add(g);
    }

    _buildStationConsoles() {
      const THREE = window.THREE;
      Object.values(STATIONS)
        .filter((s) => s.id !== "hub")
        .forEach((station) => {
          const rotation =
            station.id === "power"
              ? Math.PI / 2
              : station.id === "life-support"
                ? -Math.PI / 2
                : station.id === "hull" || station.id === "lander"
                  ? Math.PI
                  : 0;

          const cg = new THREE.Group();
          cg.name = `Console_${station.id}`;
          cg.position.set(station.position[0], 0, station.position[2]);
          cg.rotation.set(0, rotation, 0);

          const base = new THREE.Mesh(
            new THREE.BoxGeometry(2.9, 0.12, 1.1),
            new THREE.MeshStandardMaterial({ color: 0x0b1520, roughness: 0.6, metalness: 0.55 })
          );
          base.position.set(0, 0.06, 0);
          cg.add(base);

          const body = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 0.84, 0.68),
            new THREE.MeshStandardMaterial({ color: 0x152232, roughness: 0.55, metalness: 0.48 })
          );
          body.position.set(0, 0.48, 0);
          cg.add(body);

          const deskTop = new THREE.Mesh(
            new THREE.BoxGeometry(2.65, 0.12, 0.94),
            new THREE.MeshStandardMaterial({ color: 0x1a2a3c, roughness: 0.48, metalness: 0.5 })
          );
          deskTop.position.set(0, 0.92, 0.05);
          cg.add(deskTop);

          const monitorBezel = new THREE.Mesh(
            new THREE.BoxGeometry(2.3, 0.78, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x07111d, roughness: 0.3, metalness: 0.6 })
          );
          monitorBezel.position.set(0, 1.34, 0.3);
          monitorBezel.rotation.set(-0.18, 0, 0);
          cg.add(monitorBezel);

          const monitorScreen = new THREE.Mesh(
            new THREE.BoxGeometry(2.02, 0.52, 0.02),
            new THREE.MeshStandardMaterial({
              color: station.color,
              emissive: station.color,
              emissiveIntensity: 0.62,
              transparent: true,
              opacity: 0.62,
              roughness: 0.25
            })
          );
          monitorScreen.position.set(0, 1.34, 0.35);
          monitorScreen.rotation.set(-0.18, 0, 0);
          cg.add(monitorScreen);

          const leftBar = new THREE.Mesh(
            new THREE.BoxGeometry(0.36, 0.08, 0.02),
            new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0x9ae6ff, emissiveIntensity: 1.2 })
          );
          leftBar.position.set(-0.72, 1.34, 0.37);
          leftBar.rotation.set(-0.18, 0, 0);
          cg.add(leftBar);

          const indicatorMat1 = new THREE.MeshStandardMaterial({
            color: 0xfb7185,
            emissive: 0xfb7185,
            emissiveIntensity: 1.2
          });
          const rightBar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.02), indicatorMat1);
          rightBar.position.set(0.72, 1.34, 0.37);
          rightBar.rotation.set(-0.18, 0, 0);
          cg.add(rightBar);

          const keyStrip = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.05, 0.16),
            new THREE.MeshStandardMaterial({ color: station.color, emissive: station.color, emissiveIntensity: 0.55 })
          );
          keyStrip.position.set(0, 1.06, 0.5);
          cg.add(keyStrip);

          const leftBlock = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.1, 0.18),
            new THREE.MeshStandardMaterial({ color: 0x203247, metalness: 0.6, roughness: 0.4 })
          );
          leftBlock.position.set(-1.02, 0.98, 0.48);
          cg.add(leftBlock);

          const indicatorMat2 = new THREE.MeshStandardMaterial({
            color: 0xfb7185,
            emissive: 0xfb7185,
            emissiveIntensity: 1.4
          });
          const rightBlock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.18), indicatorMat2);
          rightBlock.position.set(1.02, 0.98, 0.48);
          cg.add(rightBlock);

          const pt = new THREE.PointLight(station.color, 1.8, 4.2, 2);
          pt.position.set(0, 1.55, 0.6);
          cg.add(pt);

          // Billboard Station Label Sprite
          const labelTex = createStationLabelTexture({
            text: station.shortLabel,
            subtext: "FAULT",
            accent: "#e08080"
          });
          const labelSpriteMat = new THREE.SpriteMaterial({
            map: labelTex,
            transparent: true,
            depthWrite: false
          });
          const labelSprite = new THREE.Sprite(labelSpriteMat);
          labelSprite.scale.set(0.92, 0.23, 1);
          labelSprite.position.set(0, 2.38, 0);
          labelSprite.renderOrder = 6;
          cg.add(labelSprite);

          this.group.add(cg);

          // Fault Beacon above console
          const beacon = buildFaultBeacon([station.position[0], 2.45, station.position[2]], station.color);
          this.group.add(beacon.group);

          this.stationEntries[station.id] = {
            station,
            indicatorMat1,
            indicatorMat2,
            labelSpriteMat,
            beacon,
            hasFault: true
          };
        });
    }

    _buildAllRoomProps() {
      ROOMS.forEach((room) => {
        this.group.add(buildRoomProps(room.id));
      });
    }

    // ============================================================================
    // 9. STATION FAULT / TASK SYNCHRONIZATION
    // ============================================================================
    syncStationFaults(tasks = []) {
      const faultStations = new Set();
      const faultRooms = new Set();

      tasks.forEach((t) => {
        if (!t.completed && t.stationId && STATIONS[t.stationId]) {
          faultStations.add(t.stationId);
          faultRooms.add(STATIONS[t.stationId].room);
        }
      });

      Object.keys(this.stationEntries).forEach((stId) => {
        const entry = this.stationEntries[stId];
        const hasFault = faultStations.has(stId);
        if (entry.hasFault !== hasFault) {
          entry.hasFault = hasFault;
          const cHex = hasFault ? 0xfb7185 : 0x34d399;
          entry.indicatorMat1.color.setHex(hasFault ? 0xfb7185 : 0x6ee7b7);
          entry.indicatorMat1.emissive.setHex(hasFault ? 0xfb7185 : 0x6ee7b7);
          entry.indicatorMat2.color.setHex(cHex);
          entry.indicatorMat2.emissive.setHex(cHex);
          entry.beacon.group.visible = hasFault;

          const nextTex = createStationLabelTexture({
            text: entry.station.shortLabel,
            subtext: hasFault ? "FAULT" : "READY",
            accent: hasFault ? "#e08080" : entry.station.color
          });
          if (entry.labelSpriteMat.map) entry.labelSpriteMat.map.dispose();
          entry.labelSpriteMat.map = nextTex;
          entry.labelSpriteMat.needsUpdate = true;
        }
      });

      Object.keys(this.roomVisuals).forEach((roomId) => {
        const rv = this.roomVisuals[roomId];
        const hasFault = faultRooms.has(roomId);
        if (rv.hasFault !== hasFault) {
          rv.hasFault = hasFault;
          rv.doorFrames.forEach((df) => {
            df.statusMat.color.setHex(hasFault ? 0xff5c5c : 0x6ee7b7);
            df.statusMat.emissive.setHex(hasFault ? 0xff3b3b : 0x34d399);
          });
          rv.ceilingLights.light.color.setHex(hasFault ? 0xff6b5b : WARM_LIGHT);
          rv.ceilingLights.diffuserMats.forEach((dm) => {
            dm.color.setHex(hasFault ? 0xff9b8a : WARM_LIGHT);
            dm.emissive.setHex(hasFault ? 0xff5b4a : WARM_LIGHT);
          });
        }
      });

      this._updateMinimapDOM();
    }

    // ============================================================================
    // 10. INTERACTIVE HUD COMPARTMENT PILL & LIVE SVG SHIP MINIMAP (Minimap.tsx)
    // ============================================================================
    _buildInteractiveHUD() {
      const existing = document.getElementById("ship-interior-hud");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      this.hudPill = document.createElement("div");
      this.hudPill.id = "ship-interior-hud";
      this.hudPill.innerHTML = `
        <span style="width:6px;height:6px;border-radius:2px;background:#2563eb;flex-shrink:0;"></span>
        <span style="font-size:10px;font-weight:700;letter-spacing:1.6px;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="ship-room-title">ISS INTERIOR · LOADS ON ENTRY</span>
        <a href="https://sketchfab.com/3d-models/international-space-station-2256c89a089b4ec895bb658b18fa7bbb" target="_blank" rel="noopener noreferrer" title="Original ISS interior model by Stephen Mack on Sketchfab, licensed CC BY 4.0. Scaled and repositioned at runtime for Lunaspis." style="font-size:8px;font-weight:700;letter-spacing:0.6px;color:#a5f3fc;text-decoration:underline;white-space:nowrap;">SKETCHFAB · STEPHEN MACK · CC BY 4.0</a>
        <button id="btn-return-space-center" style="background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.28);color:#e2e8f0;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Return the whole crew to Kennedy Space Center LC-39A [G]">
          PAD LC-39A [G]
        </button>
        <button id="btn-toggle-iss-showcase" style="background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.22);color:#e2e8f0;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Inspect 27-Part NASA ISS 3D Reference Model [J]">
          ISS 3D [J]
        </button>
        <button id="btn-toggle-lunar-scene" style="background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.22);color:#94a3b8;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Toggle 3D Lunar Touchdown Scene [K]">
          MOON [K]
        </button>
        <button id="btn-toggle-mission-viz" style="background:rgba(37,99,235,0.22);border:1px solid rgba(59,130,246,0.48);color:#f8fafc;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Open 3D NASA Mission Viz & GMAT Trajectory Theater [U]">
          ORBIT VIZ [U]
        </button>
        <button id="btn-hud-vr" style="background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.22);color:#cbd5e1;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Toggle WebXR / Stereo VR View">
          VR VIEW
        </button>
      `;
      document.body.appendChild(this.hudPill);

      const applyHudPillLayout = () => {
        if (!this.hudPill) return;
        const canShow = Boolean(window.isGameStarted && this.isInteriorActive);
        this.hudPill.style.display = canShow ? "flex" : "none";
      };
      applyHudPillLayout();
      window.addEventListener("resize", applyHudPillLayout);
      window.addEventListener("orientationchange", applyHudPillLayout);

      const btnPad = this.hudPill.querySelector("#btn-return-space-center");
      if (btnPad) {
        btnPad.addEventListener("click", () => {
          if (window.spaceCenter && typeof window.spaceCenter.requestMissionReset === "function") {
            window.spaceCenter.requestMissionReset();
          } else if (window.spaceCenter && typeof window.spaceCenter.enterSpaceCenter === "function") {
            window.spaceCenter.enterSpaceCenter();
          }
        });
      }

      const btnShowcase = this.hudPill.querySelector("#btn-toggle-iss-showcase");
      if (btnShowcase) {
        btnShowcase.addEventListener("click", () => {
          if (window.issShowcase) {
            window.issShowcase.toggle();
          } else {
            this.toggle();
          }
        });
      }

      const btnLunar = this.hudPill.querySelector("#btn-toggle-lunar-scene");
      if (btnLunar) {
        btnLunar.addEventListener("click", () => {
          this.toggleMoonLandingScene();
        });
      }

      const btnViz = this.hudPill.querySelector("#btn-toggle-mission-viz");
      if (btnViz) {
        btnViz.addEventListener("click", () => {
          if (window.missionViz && typeof window.missionViz.toggle === "function") {
            window.missionViz.toggle();
          }
        });
      }

      const btnVr = this.hudPill.querySelector("#btn-hud-vr");
      if (btnVr) {
        btnVr.addEventListener("click", () => {
          if (window.vrManager && typeof window.vrManager.toggleVR === "function") {
            window.vrManager.toggleVR();
          }
        });
      }
    }

    _buildMinimapDOM() {
      const existing = document.getElementById("lunaspis-ship-minimap");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      this.minimapCollapsed = Boolean(window.innerWidth <= 900);
      this.minimapEl = document.createElement("div");
      this.minimapEl.id = "lunaspis-ship-minimap";
      const applyMinimapLayout = () => {
        if (!this.minimapEl) return;
        const canShowMap = Boolean(window.isGameStarted && this.isInteriorActive);
        this.minimapEl.style.display = canShowMap ? "block" : "none";
      };
      applyMinimapLayout();
      this.minimapEl.addEventListener("click", () => {
        this.minimapCollapsed = !this.minimapCollapsed;
        this._updateMinimapDOM(this._lastMinimapX || 0, this._lastMinimapZ || 2.0, this._lastMinimapYaw || 0);
      });
      window.addEventListener("resize", () => {
        applyMinimapLayout();
        this._updateMinimapDOM(this._lastMinimapX || 0, this._lastMinimapZ || 2.0, this._lastMinimapYaw || 0);
      });
      document.body.appendChild(this.minimapEl);
      this._updateMinimapDOM(0, 2.0, 0);
    }

    _escapeMapText(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    _buildFloorplanMarkup(px = 0, pz = 2.0, heading = 0, options = {}) {
      const includeLocal = options.includeLocal !== false;
      const curRoomObj = ROOM_BY_ID.get(this.activeRoomId) || ROOMS[0];
      const mission = window.netManager && typeof window.netManager.getMission === "function"
        ? window.netManager.getMission()
        : null;
      const completedSet = new Set((mission && mission.completedObjectives) || []);
      const activePing = mission && mission.groundSupport ? mission.groundSupport.activePing : null;
      const pingValid = activePing && (Date.now() - (activePing.at || 0) < 20000);
      const pingRoomCode = pingValid ? String(activePing.roomId || "").toUpperCase() : "";

      const connections = [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
        [4, 5]
      ];

      let faultCount = 0;
      Object.values(this.stationEntries).forEach((e) => {
        if (e.hasFault) faultCount++;
      });

      const linesSvg = this.issInteriorModel ? "" : connections
        .map(([from, to]) => {
          const a = ROOMS[from];
          const b = ROOMS[to];
          return `<line x1="${a.center[0]}" y1="${a.center[1]}" x2="${b.center[0]}" y2="${b.center[1]}" stroke="rgba(148,163,184,0.22)" stroke-width="0.35" />`;
        })
        .join("");

      const roomsSvg = this.issInteriorModel ? ISS_WALK_ZONES.map((zone) =>
        `<rect x="${zone.xMin}" y="${zone.zMin}" width="${zone.xMax - zone.xMin}" height="${zone.zMax - zone.zMin}" fill="rgba(103,232,249,0.08)" stroke="rgba(148,163,184,0.3)" stroke-width="0.2" />`
      ).join("") + Object.values(STATIONS).map((station) =>
        `<text x="${station.workPosition[0]}" y="${station.workPosition[2]}" text-anchor="middle" fill="#f8fafc" font-size="1.1">${station.shortLabel}</text>`
      ).join("") : ROOMS.map((room) => {
        const stEntry = Object.values(this.stationEntries).find(
          (e) => e.station.room === room.id
        );
        const fault = stEntry
          ? (mission ? !completedSet.has(stEntry.station.taskId) : stEntry.hasFault)
          : false;
        const isPinged = pingRoomCode && room.shortLabel.toUpperCase() === pingRoomCode;
        const color = stEntry ? stEntry.station.color : "#f8fafc";
        const active = includeLocal && curRoomObj.shortLabel === room.shortLabel;
        const fill = isPinged
          ? "rgba(37, 99, 235, 0.28)"
          : fault
            ? `${color}20`
            : active
              ? "rgba(248,250,252,0.12)"
              : "rgba(255,255,255,0.025)";
        const stroke = isPinged
          ? "#38bdf8"
          : fault
            ? `${color}99`
            : active
              ? "rgba(248,250,252,0.55)"
              : "rgba(148,163,184,0.2)";
        const textFill = isPinged ? "#93c5fd" : (fault ? color : "rgba(248,250,252,0.68)");

        return `
          <g>
            <rect x="${room.center[0] - room.size[0] / 2}" y="${room.center[1] - room.size[1] / 2}" width="${room.size[0]}" height="${room.size[1]}" fill="${fill}" stroke="${stroke}" stroke-width="${isPinged ? 0.5 : 0.3}" />
            <text x="${room.center[0]}" y="${room.center[1] + 0.8}" text-anchor="middle" fill="${textFill}" font-size="2.1" letter-spacing="0.2">${room.shortLabel}</text>
          </g>
        `;
      }).join("");

      const stationsSvg = Object.values(STATIONS)
        .map((st) => {
          const done = completedSet.has(st.taskId);
          const fault = !done;
          return `<circle cx="${st.position[0]}" cy="${st.position[2]}" r="${fault ? 0.85 : 0.55}" fill="${fault ? st.color : "rgba(248,250,252,0.45)"}" />`;
        })
        .join("");

      // Live orbital Flight Crew markers only (exclude Space Center Ground Control).
      const remotePlayers = window.netManager && window.netManager.remotePlayers
        ? Object.values(window.netManager.remotePlayers)
        : [];
      const friendMarkers = [];
      const friendLegend = [];
      remotePlayers.slice(0, 6).forEach((rp, index) => {
        if (!rp || rp.team === "ground") return;
        const pos = rp.curPos || rp.targetPos;
        if (!pos || !Number.isFinite(pos[0]) || !Number.isFinite(pos[2])) return;
        if (this.issInteriorModel
          ? (pos[0] < -9 || pos[0] > 14 || pos[2] < -6.5 || pos[2] > 41.5)
          : (pos[0] < -13.2 || pos[0] > 13.2 || pos[2] < -13.2 || pos[2] > 21.2)) return;
        const color = /^#[0-9a-fA-F]{6}$/.test(rp.color) ? rp.color : "#38bdf8";
        const rawName = String(rp.name || `Crew ${index + 1}`).slice(0, 12);
        const roleMeta = window.InterfellasRoles ? window.InterfellasRoles.getRoleMeta(rp.role) : null;
        const shortTag = roleMeta ? `[${roleMeta.short}] ` : "";
        const safeName = this._escapeMapText(shortTag + rawName);
        friendMarkers.push(`
          <g transform="translate(${pos[0].toFixed(2)} ${pos[2].toFixed(2)})">
            <title>${safeName}</title>
            <circle r="1.05" fill="${color}" stroke="#050810" stroke-width="0.32" />
            <circle r="0.3" fill="rgba(5,8,16,0.72)" />
          </g>
        `);
        friendLegend.push(`
          <span style="display:inline-flex;align-items:center;gap:3px;max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <span style="width:5px;height:5px;border-radius:1px;background:${color};flex:0 0 auto;"></span>${safeName}
          </span>
        `);
      });

      const localMarkerSvg = includeLocal
        ? `
          <g transform="translate(${px.toFixed(2)} ${pz.toFixed(2)}) rotate(${(((heading * 180) / Math.PI) + 180).toFixed(1)})">
            <path d="M 0 -2.3 L 1.7 1.9 L 0 1.1 L -1.7 1.9 Z" fill="#f8fafc" stroke="#050810" stroke-width="0.2" />
          </g>
        `
        : "";

      const isCompact = window.innerWidth <= 900 || window.isMobileDevice;
      const svgHeight = options.svgHeight || (isCompact ? 132 : 190);
      const legendHtml = (friendLegend.length || includeLocal)
        ? `
          <div style="display:flex;flex-wrap:wrap;gap:4px 7px;border-top:1px solid rgba(148,163,184,0.18);padding:4px 8px;font-size:7px;letter-spacing:0.3px;color:rgba(148,163,184,0.88);">
            ${includeLocal ? `<span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:5px;height:5px;border-radius:1px;background:#f8fafc;flex:0 0 auto;"></span>YOU</span>` : ""}
            ${friendLegend.join("") || (!includeLocal ? `<span style="color:rgba(148,163,184,0.7);">AWAITING ORBITAL TELEMETRY</span>` : "")}
          </div>
        `
        : "";

      return {
        curRoomLabel: curRoomObj.shortLabel,
        faultCount,
        pingRoomCode,
        svgHtml: `
          <svg viewBox="${this.issInteriorModel ? "-9 -6.5 23 48" : "-13.5 -13.5 27 35"}" style="height:${svgHeight}px;width:100%;display:block;">
            ${linesSvg}
            ${roomsSvg}
            ${stationsSvg}
            ${friendMarkers.join("")}
            ${localMarkerSvg}
          </svg>
          ${legendHtml}
        `
      };
    }

    renderExternalFloorplanHtml(svgHeight = 165) {
      const markup = this._buildFloorplanMarkup(0, 2, 0, { includeLocal: false, svgHeight });
      return markup.svgHtml;
    }

    _updateMinimapDOM(px = 0, pz = 2.0, heading = 0) {
      if (!this.minimapEl) return;
      this._lastMinimapX = px;
      this._lastMinimapZ = pz;
      this._lastMinimapYaw = heading;

      const markup = this._buildFloorplanMarkup(px, pz, heading, { includeLocal: true });

      this.minimapEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:${this.minimapCollapsed ? "none" : "1px solid rgba(148,163,184,0.18)"};padding:5px 8px;" title="Tap to collapse/expand ship map">
          <span style="font-size:8px;text-transform:uppercase;letter-spacing:1.6px;color:rgba(148,163,184,0.85);">MAP ${this.minimapCollapsed ? "&#9656;" : "&#9662;"}</span>
          <span style="font-size:8px;text-transform:uppercase;letter-spacing:1.4px;color:#f8fafc;font-weight:700;">${markup.curRoomLabel}</span>
        </div>
        ${this.minimapCollapsed ? "" : `
          ${markup.svgHtml}
          <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(148,163,184,0.18);padding:4px 8px;font-size:7px;text-transform:uppercase;letter-spacing:1.4px;color:rgba(148,163,184,0.72);">
            <span>DECK 01</span>
            <span>${markup.pingRoomCode ? `LCC PING: ${markup.pingRoomCode}` : `${markup.faultCount} FAULTS`}</span>
          </div>
        `}
      `;
    }

    // ============================================================================
    // 11. REAL-TIME PHYSICAL COLLISION & CAMERA CLEARANCE ENGINE (collision.ts)
    // ============================================================================
    isWalkable(x, z) {
      const zones = this.issInteriorModel ? ISS_WALK_ZONES : WALK_ZONES;
      return zones.some(
        (zone) => x >= zone.xMin && x <= zone.xMax && z >= zone.zMin && z <= zone.zMax
      );
    }

    isSolid(x, z, margin = 0) {
      if (this.issInteriorModel) {
        return Object.values(STATIONS).some((station) =>
          Math.hypot(x - station.position[0], z - station.position[2]) < 0.4 + margin
        );
      }
      for (let i = 0; i < SOLID_CIRCLES.length; i++) {
        const c = SOLID_CIRCLES[i];
        if (Math.hypot(x - c.x, z - c.z) < c.radius + margin) return true;
      }
      for (let i = 0; i < SOLID_RECTS.length; i++) {
        const r = SOLID_RECTS[i];
        if (Math.abs(x - r.x) < r.halfX + margin && Math.abs(z - r.z) < r.halfZ + margin) {
          return true;
        }
      }
      return false;
    }

    canStandAt(x, z, radius = 0.26) {
      if (!this.isWalkable(x, z) || this.isSolid(x, z, radius)) return false;
      if (!this.issInteriorModel) return true;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        if (!this.isWalkable(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius)) return false;
      }
      return true;
    }

    isCameraClear(x, z) {
      return this.canStandAt(x, z, 0.14);
    }

    cameraClearFraction(origin, destination) {
      if (!this.issInteriorModel) return 1;
      const dx = destination.x - origin.x;
      const dz = destination.z - origin.z;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
      for (let i = 1; i <= steps; i++) {
        const fraction = i / steps;
        if (!this.isCameraClear(origin.x + dx * fraction, origin.z + dz * fraction)) {
          return Math.max(0, (i - 1) / steps);
        }
      }
      return 1;
    }

    resolveCollision(currentPos, proposedPos, radius = 0.26) {
      const THREE = window.THREE;
      const dx = proposedPos.x - currentPos.x;
      const dz = proposedPos.z - currentPos.z;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.12));
      let x = currentPos.x, z = currentPos.z;
      for (let i = 0; i < steps; i++) {
        const nx = x + dx / steps, nz = z + dz / steps;
        if (this.canStandAt(nx, nz, radius)) { x = nx; z = nz; }
        else if (this.canStandAt(nx, z, radius)) x = nx;
        else if (this.canStandAt(x, nz, radius)) z = nz;
      }
      this._updateActiveRoom(x, z);
      return new THREE.Vector3(x, 0, z);
    }

    _updateActiveRoom(x, z) {
      const nextRoomId = this.issInteriorModel
        ? Object.values(STATIONS).reduce((nearest, station) =>
          Math.hypot(x - station.workPosition[0], z - station.workPosition[2]) <
          Math.hypot(x - nearest.workPosition[0], z - nearest.workPosition[2]) ? station : nearest
        ).room
        : roomAtPosition(x, z);
      if (nextRoomId !== this.activeRoomId) {
        this.activeRoomId = nextRoomId;
        const match = ROOM_BY_ID.get(nextRoomId);
        const titleEl = document.getElementById("ship-room-title");
        if (titleEl && match) {
          titleEl.textContent = this.issInteriorModel
            ? "INTERNATIONAL SPACE STATION · INTERIOR"
            : `LUNASPIS TRANSIT CRAFT • ${match.label.toUpperCase()}`;
        }
      }
    }

    // ============================================================================
    // 12. LUNAR LANDING SCENE TOGGLE & ANIMATION TICK
    // ============================================================================
    startMoonLandingScene() {
      return this.toggleMoonLandingScene(true);
    }

    stopMoonLandingScene() {
      return this.toggleMoonLandingScene(false);
    }

    toggleMoonLandingScene(forceState) {
      const next = typeof forceState === "boolean" ? forceState : !this.isMoonLandingActive;
      this.isMoonLandingActive = next;

      if (this.moonLanding && this.moonLanding.root) {
        this.moonLanding.root.visible = next;
      }
      if (this.group) {
        this.group.visible = !next && this.isInteriorActive;
      }
      if (window.issGroup) {
        window.issGroup.visible = !next && !this.isInteriorActive;
      }
      if (window.photorealisticEarth && window.photorealisticEarth.group) {
        window.photorealisticEarth.group.visible = !next;
      }
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = !next;
      }

      if (this.issInteriorModel) {
        if (this.roomShellGroup) this.roomShellGroup.visible = false;
        if (this.legacyPropsGroup) this.legacyPropsGroup.visible = false;
      } else {
        if (this.roomShellGroup) this.roomShellGroup.visible = true;
        if (this.legacyPropsGroup) this.legacyPropsGroup.visible = true;
      }
      if (this.issInteriorModelGroup) {
        this.issInteriorModelGroup.visible = Boolean(this.issInteriorModel && this.isInteriorActive && !next);
      }

      const titleEl = document.getElementById("ship-room-title");
      if (titleEl) {
        titleEl.textContent = next
          ? "MARE TRANQUILLITATIS • LUNAR TOUCHDOWN"
          : this.issInteriorModel
            ? "INTERNATIONAL SPACE STATION · INTERIOR"
            : `LUNASPIS TRANSIT CRAFT • ${(ROOM_BY_ID.get(this.activeRoomId)?.label || "TRANSIT HUB").toUpperCase()}`;
      }
      return this.isMoonLandingActive;
    }

    update(delta, elapsed = 0, camera = null) {
      const t = elapsed || performance.now() * 0.001;

      // Update SunFlare position relative to camera
      if (this.sunFlare && camera) {
        this.sunFlare.group.visible = !this.isInteriorActive && !this.isMoonLandingActive && !(window.spaceCenter && window.spaceCenter.isGroundMode);
        this.sunFlare.update(camera);
      }

      // If Lunar Touchdown Scene is active, drift camera around Lunar Lander (MoonLandingScene.tsx)
      if (this.isMoonLandingActive && camera) {
        const drift = Math.sin(t * 0.12) * 0.18;
        const targetX = 0.4 + drift;
        const targetY = 2.35 + Math.sin(t * 0.17) * 0.05;
        const targetZ = 8.4;
        const blend = Math.min(1, delta * 1.8);
        camera.position.set(
          camera.position.x + (targetX - camera.position.x) * blend,
          camera.position.y + (targetY - camera.position.y) * blend,
          camera.position.z + (targetZ - camera.position.z) * blend
        );
        camera.lookAt(0, 1.55, 0);
        return;
      }

      if (!this.isInteriorActive) return;

      // Sync Transit Hub HoloTable orbit tilt & accent color with live missionDesign.orbitId
      const orbitId = window.gameplay && window.gameplay.missionDesign && window.gameplay.missionDesign.orbitId;
      if (orbitId && orbitId !== this._lastHoloOrbitId && (this.holoRingGroup || this.holoCoreMesh)) {
        this._lastHoloOrbitId = orbitId;
        const holoTheme = {
          leo_400: { color: 0x38bdf8, tilt: 0.35, scaleZ: 1.0 },
          iss_cubesat_418: { color: 0x34d399, tilt: 0.42, scaleZ: 1.0 },
          sso_705: { color: 0xfacc15, tilt: 1.38, scaleZ: 1.0 },
          gto_heo: { color: 0xfb923c, tilt: 0.72, scaleZ: 1.38 },
          lunar_polar_100: { color: 0xc4b5fd, tilt: 1.28, scaleZ: 1.25 },
          sun_earth_l2: { color: 0xf472b6, tilt: 0.12, scaleZ: 1.32 }
        }[orbitId] || { color: 0x38bdf8, tilt: 0.35, scaleZ: 1.0 };

        if (this.holoRingGroup) {
          this.holoRingGroup.rotation.x = holoTheme.tilt;
          this.holoRingGroup.scale.set(1, 1, holoTheme.scaleZ);
          this.holoRingGroup.traverse((obj) => {
            if (obj.material && obj.material.color) {
              obj.material.color.setHex(holoTheme.color);
            }
          });
        }
        if (this.holoCoreMesh && this.holoCoreMesh.material && this.holoCoreMesh.material.color) {
          this.holoCoreMesh.material.color.setHex(holoTheme.color);
          if (this.holoCoreMesh.material.emissive) {
            this.holoCoreMesh.material.emissive.setHex(holoTheme.color);
          }
        }
      }

      // Spin HoloTable rings & icosahedron core
      if (this.holoRingGroup) {
        this.holoRingGroup.rotation.y = t * 0.45;
      }
      if (this.holoCoreMesh) {
        this.holoCoreMesh.rotation.y = -t * 0.3;
        this.holoCoreMesh.rotation.x = t * 0.12;
      }

      // Animate Fault Beacons & Pulsing Ceiling Lights
      Object.values(this.stationEntries).forEach((entry) => {
        if (entry.beacon && entry.beacon.group.visible) {
          entry.beacon.group.position.y = entry.beacon.baseY + Math.sin(t * 2.2) * 0.07;
          entry.beacon.group.rotation.y = t * 0.7;
          entry.beacon.ring.scale.setScalar(1 + Math.sin(t * 3.2) * 0.16);
        }
      });

      Object.values(this.roomVisuals).forEach((rv) => {
        if (rv.ceilingLights && rv.ceilingLights.light) {
          rv.ceilingLights.light.intensity = rv.hasFault
            ? 1.2 + Math.sin(t * 5) * 0.8
            : 2.4;
        }
      });

      // Update Minimap player marker
      if (window.localCrew && window.localCrew.group) {
        const p = window.localCrew.group.position;
        const yaw = window.localCrew.group.rotation.y || 0;
        if (!this._minimapTimer || t - this._minimapTimer > 0.12) {
          this._minimapTimer = t;
          this._updateMinimapDOM(p.x, p.z, yaw);
        }
      }
    }

    show() {
      this.isInteriorActive = true;
      this.isMoonLandingActive = false;
      document.body.classList.add("interior-active");
      document.body.classList.remove("ground-mode-active");
      if (this.moonLanding && this.moonLanding.root) this.moonLanding.root.visible = false;
      // CRITICAL: Never show the exterior ISS outside the window when the player is INSIDE the station!
      if (window.issGroup) window.issGroup.visible = false;
      if (this.group) this.group.visible = true;
      if (this.issInteriorModel) {
        if (this.roomShellGroup) this.roomShellGroup.visible = false;
        if (this.legacyPropsGroup) this.legacyPropsGroup.visible = false;
        if (this.issInteriorModelGroup) this.issInteriorModelGroup.visible = true;
        this._placeCrewOnISSWalkway();
        this._setInteriorTitle("INTERNATIONAL SPACE STATION · INTERIOR");
      } else {
        if (this.roomShellGroup) this.roomShellGroup.visible = true;
        if (this.legacyPropsGroup) this.legacyPropsGroup.visible = true;
        if (this.issInteriorModelGroup) this.issInteriorModelGroup.visible = false;
        this._ensureISSInteriorModel().catch(() => {});
      }
      if (this.hudPill) this.hudPill.style.display = window.isGameStarted ? "flex" : "none";
      if (this.minimapEl) this.minimapEl.style.display = window.isGameStarted ? "block" : "none";
    }

    hide() {
      this.isInteriorActive = false;
      document.body.classList.remove("interior-active");
      if (this.group) this.group.visible = false;
      if (this.hudPill) this.hudPill.style.display = "none";
      if (this.minimapEl) this.minimapEl.style.display = "none";
    }

    toggle() {
      if (this.isInteriorActive) this.hide();
      else this.show();
      return this.isInteriorActive;
    }

    toggleInterior() {
      return this.toggle();
    }
  }

  window.ROOMS = ROOMS;
  window.STATIONS = STATIONS;
  window.ShipInteriorManager = ShipInteriorManager;
  window.shipInterior = new ShipInteriorManager();
  window.resolveShipInteriorCollision = (cur, prop, rad) => {
    if (window.shipInterior) {
      return window.shipInterior.resolveCollision(cur, prop, rad);
    }
    return prop;
  };
})(window);
