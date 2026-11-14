/**
 * Constructed ISS interior, station navigation, mission workstations,
 * crew map, sun flare, and lunar landing scene. The station is a simplified
 * single-level interpretation of the credited ISS structural reference.
 */

(function (window) {
  "use strict";


  // The constructed station and its collision map share these module volumes.
  // The connected layout is informed by Stephen Mack’s ISS interior reference.
  const ISS_WALK_ZONES = [
    { xMin: -1.2, xMax: 1.2, zMin: 0.3, zMax: 7.2 },
    { xMin: -5.0, xMax: 1.5, zMin: 6.3, zMax: 12.2 },
    { xMin: -9.5, xMax: -4.5, zMin: 7.0, zMax: 10.0 },
    { xMin: -2.0, xMax: 2.1, zMin: -5.3, zMax: 1.0 },
    { xMin: -7.5, xMax: -1.5, zMin: -5.3, zMax: -2.3 },
    { xMin: 1.5, xMax: 12.0, zMin: -5.3, zMax: -2.3 },
    { xMin: 1.2, xMax: 11.5, zMin: 6.0, zMax: 10.2 },
    { xMin: -1.2, xMax: 2.0, zMin: 11.0, zMax: 49.0 }
  ];
  const ISS_STATION_LAYOUT = {
    hub: { position: [-1.6, 1.02, 2], workPosition: [0, 0, 2] },
    command: { position: [-0.8, 0.92, -5.5], workPosition: [0, 0, -3.5] },
    power: { position: [-5.5, 0.92, -5.5], workPosition: [-4.6, 0, -3.8] },
    "life-support": { position: [8, 0.92, -5.5], workPosition: [7, 0, -3.5] },
    hull: { position: [8, 0.92, 10.5], workPosition: [7.5, 0, 8.7] },
    "csa-lab": { position: [4.2, 0.92, -5.5], workPosition: [4.2, 0, -3.5] },
    lander: { position: [1.6, 0.92, 25], workPosition: [0, 0, 24] }
  };
  const ISS_TASK_WORK_POSITIONS = {
    task_science: [6.3, 0, -3.5],
    task_lss: [8.9, 0, -3.5]
  };
  const ISS_HATCHES = [
    { axis: "z", at: -0.4, center: 0, halfWidth: 1.55 },
    { axis: "z", at: 6.6, center: 0, halfWidth: 1.55 },
    { axis: "z", at: 12, center: 0, halfWidth: 1.55 },
    { axis: "z", at: 23, center: 0, halfWidth: 1.55 },
    { axis: "z", at: 33, center: 0, halfWidth: 1.55 },
    { axis: "z", at: 46.5, center: 0, halfWidth: 1.55 },
    { axis: "x", at: 3.5, center: -3.8, halfWidth: 2 },
    { axis: "x", at: 3.5, center: 8, halfWidth: 2 },
    { axis: "x", at: -3.2, center: -3.8, halfWidth: 2 },
    { axis: "x", at: -4.5, center: 8.5, halfWidth: 2 },
    { axis: "x", at: -7.2, center: 8.5, halfWidth: 2 }
  ];
  // Two open pressure-hatch leaves fold back against the side of the node.
  // These slim volumes also keep bodies and cameras from passing through them.
  const ISS_HATCH_LEAVES = [
    { x: -1.42, zMin: -2.32, zMax: -0.4 },
    { x: -1.42, zMin: 4.68, zMax: 6.6 }
  ];

  // A pressure bulkhead has to meet the module side walls on both sides of the
  // round opening. Resolve the contiguous walk-zone span across the hatch
  // plane, around the hatch centre, so no gate is left as a floating panel
  // with an open slot on its left and right.
  const hatchSpanCache = new WeakMap();
  function getHatchCrossSpan(hatch) {
    const cached = hatchSpanCache.get(hatch);
    if (cached) return cached;

    const intervals = [];
    ISS_WALK_ZONES.forEach((zone) => {
      const forwardMin = hatch.axis === "z" ? zone.zMin : zone.xMin;
      const forwardMax = hatch.axis === "z" ? zone.zMax : zone.xMax;
      if (hatch.at < forwardMin - 0.001 || hatch.at > forwardMax + 0.001) return;
      // The wall panels are built on 1 m cells whose centres may extend half a
      // cell past the walk-zone edge. The pressure wall must meet those actual
      // panels, not the (up to 1 m narrower) walk-zone numeric edge, or a slot
      // opens between the bulkhead and the real side wall.
      const crossMin = hatch.axis === "z" ? zone.xMin : zone.zMin;
      const crossMax = hatch.axis === "z" ? zone.xMax : zone.zMax;
      intervals.push([
        Math.ceil(crossMin - 1),
        Math.floor(crossMax) + 1
      ]);
    });

    let span;
    if (!intervals.length) {
      const half = Math.max(1.2, hatch.halfWidth || 1.55);
      span = [hatch.center - half, hatch.center + half];
    } else {
      intervals.sort((a, b) => a[0] - b[0]);
      let containing = intervals.find(([min, max]) => hatch.center >= min - 0.001 && hatch.center <= max + 0.001);
      if (!containing) {
        containing = intervals.reduce((best, current) => {
          const currentDistance = Math.min(Math.abs(hatch.center - current[0]), Math.abs(hatch.center - current[1]));
          const bestDistance = Math.min(Math.abs(hatch.center - best[0]), Math.abs(hatch.center - best[1]));
          return currentDistance < bestDistance ? current : best;
        });
      }
      let min = containing[0];
      let max = containing[1];
      intervals.forEach(([start, end]) => {
        if (start <= max + 0.001 && end >= min - 0.001) {
          min = Math.min(min, start);
          max = Math.max(max, end);
        }
      });
      // Slight overlap with the side panels closes hairline seams at the corners.
      span = [min - 0.04, max + 0.04];
    }

    hatchSpanCache.set(hatch, span);
    return span;
  }

  // Simplified plan-view representation of the pressurized module sequence.
  // Harmony connects Destiny to the Columbus and Kibo laboratories.
  const ISS_MODULES = [
    { name: "HARMONY", x: 0, z: -3.5 },
    { name: "COLUMBUS", x: -4.8, z: -3.8 },
    { name: "KIBO", x: 7.5, z: -3.8 },
    { name: "DESTINY", x: 0, z: 3.2 },
    { name: "UNITY", x: -0.5, z: 8.8 },
    { name: "QUEST", x: -7.0, z: 8.5 },
    { name: "TRANQUILITY", x: 6.5, z: 8.1 },
    { name: "CUPOLA", x: 10.3, z: 8.1 },
    { name: "ZARYA", x: 0.4, z: 18 },
    { name: "ZVEZDA", x: 0.4, z: 41 }
  ];

  const METAL_LIGHT = 0x5b636a;

  // ============================================================================
  // 1. LEVEL DEFINITIONS: ROOMS, STATIONS, DOORS & WALKABLE ZONES (level.ts)
  // ============================================================================
  // Mission IDs remain stable for saves and multiplayer; labels now refer to
  // the station modules that contain those workstations.
  const ROOMS = [
    { id: "hub", label: "Destiny Laboratory", shortLabel: "HUB", center: [0, 2], size: [2.4, 7], color: "#67e8f9" },
    { id: "command", label: "Harmony", shortLabel: "CMD", center: [0, -3.5], size: [4, 4], color: "#38bdf8" },
    { id: "power", label: "Columbus Laboratory", shortLabel: "PWR", center: [-4.8, -3.8], size: [5, 3], color: "#fbbf24" },
    { id: "life-support", label: "Kibo Laboratory", shortLabel: "LSS", center: [7.5, -3.8], size: [9, 3], color: "#34d399" },
    { id: "hull", label: "Tranquility", shortLabel: "HULL", center: [6.5, 8], size: [9, 4], color: "#fb7185" },
    { id: "lander", label: "Zarya and Zvezda", shortLabel: "LDR", center: [0.4, 30], size: [3.2, 38], color: "#a78bfa" }
  ];
  const ROOM_BY_ID = new Map(ROOMS.map((room) => [room.id, room]));

  const STATIONS = {
    hub: {
      id: "hub",
      label: "Mission Workstation",
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
      description: "Mission timer, live position, and the Moon landing plan."
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
    },
    "csa-lab": {
      id: "csa-lab",
      label: "CSA Space Lab",
      shortLabel: "CSA LAB",
      room: "life-support",
      position: [4.2, 0.92, -5.5],
      workPosition: [4.2, 0, -3.5],
      interactRadius: 2.6,
      color: "#f87171",
      description: "Co-op Canadarm2 cargo capture and Tomatosphere greenhouse."
    }
  };

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

  function createISSDeckTexture() {
    const { element, context } = makeCanvas(512, 512);
    // The deck in a walking interpretation is a field of removable utility
    // covers, with narrow retaining tracks rather than decorative floor tiles.
    context.fillStyle = "#747f80";
    context.fillRect(0, 0, 512, 512);
    context.fillStyle = "#c5c9c6";
    context.fillRect(7, 7, 498, 498);
    context.fillStyle = "#d6d9d4";
    context.fillRect(18, 18, 476, 476);
    context.strokeStyle = "rgba(81,97,99,0.42)";
    context.lineWidth = 2;
    context.strokeRect(18, 18, 476, 476);
    context.strokeStyle = "rgba(255,255,255,0.44)";
    context.beginPath(); context.moveTo(23, 487); context.lineTo(23, 23); context.lineTo(487, 23); context.stroke();
    context.fillStyle = "#aeb7b4";
    context.fillRect(45, 43, 118, 15);
    context.fillStyle = "#596b6d";
    context.font = "12px monospace";
    context.fillText("DECK / ACCESS", 48, 55);
    [[28, 28], [484, 28], [28, 484], [484, 484], [256, 28], [256, 484]].forEach(([x, y]) => {
      context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fillStyle = "#728182"; context.fill();
      context.strokeStyle = "#d1d9d6"; context.lineWidth = 1; context.stroke();
    });
    context.strokeStyle = "rgba(74,84,83,0.12)";
    for (let line = 0; line < 24; line++) {
      const x = 64 + (line * 79) % 374, y = 78 + (line * 53) % 360;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x + 5 + line % 7, y + 1); context.stroke();
    }
    const texture = new window.THREE.CanvasTexture(element);
    return applyTextureEncoding(texture, 8);
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

  function createCornerPanelTexture() {
    const { element, context } = makeCanvas(512, 256);
    context.fillStyle = "#bec7c3";
    context.fillRect(0, 0, 512, 256);
    addNoise(context, 512, 256, 1800);
    context.fillStyle = "#9daaa7";
    context.fillRect(0, 15, 512, 9);
    context.fillRect(0, 231, 512, 9);
    context.fillStyle = "#d1d7d2";
    context.fillRect(32, 36, 448, 184);
    context.strokeStyle = "#879997";
    context.lineWidth = 3;
    context.strokeRect(32, 36, 448, 184);
    [70, 442].forEach((x) => {
      context.fillStyle = "#9baaa6";
      context.fillRect(x - 13, 38, 26, 180);
      context.fillStyle = "#687b7d";
      [60, 196].forEach((y) => { context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.fill(); });
    });
    context.strokeStyle = "rgba(81, 97, 96, 0.23)";
    context.lineWidth = 2;
    context.beginPath(); context.moveTo(119, 69); context.lineTo(392, 69); context.stroke();
    context.beginPath(); context.moveTo(119, 185); context.lineTo(392, 185); context.stroke();
    const texture = new window.THREE.CanvasTexture(element);
    return applyTextureEncoding(texture, 8);
  }

  function createFabricTexture() {
    const width = 128, height = 128;
    const { element, context } = makeCanvas(width, height);
    context.fillStyle = "#e1e1dc";
    context.fillRect(0, 0, width, height);
    addNoise(context, width, height, 3000);

    context.strokeStyle = "rgba(82,89,91,0.10)";
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

  let cachedInteriorTextures = null;
  let fabricImage = null;
  const fabricTextureClones = [];
  function getInteriorTextures() {
    if (cachedInteriorTextures) return cachedInteriorTextures;
    cachedInteriorTextures = {
      wall: createWallTexture(),
      ceiling: createCeilingTexture(),
      corner: createCornerPanelTexture(),
      fabric: createFabricTexture()
    };
    // Keep the procedural canvas visible while the detailed material loads or
    // if it is unavailable. Existing clones must share the loaded image too.
    new window.THREE.TextureLoader().load("textures/iss/insulation_albedo.jpg", (texture) => {
      fabricImage = texture.image;
      [cachedInteriorTextures.fabric, ...fabricTextureClones].forEach((target) => {
        target.image = fabricImage;
        target.needsUpdate = true;
      });
      texture.dispose();
    }, undefined, (error) => {
      console.warn("ISS insulation texture unavailable; keeping procedural fabric:", error);
    });
    return cachedInteriorTextures;
  }

  function createTiledTexture(base, repeatX, repeatY) {
    const clone = base.clone();
    clone.wrapS = window.THREE.RepeatWrapping;
    clone.wrapT = window.THREE.RepeatWrapping;
    clone.repeat.set(repeatX, repeatY);
    applyTextureEncoding(clone, base.anisotropy || 8);
    if (cachedInteriorTextures && base === cachedInteriorTextures.fabric) {
      if (fabricImage) clone.image = fabricImage;
      fabricTextureClones.push(clone);
    }
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

  function createConsoleScreenTexture(station) {
    const { element, context } = makeCanvas(512, 288);
    context.fillStyle = "#101d29";
    context.fillRect(0, 0, 512, 288);
    context.fillStyle = "#315a71";
    context.fillRect(0, 0, 512, 34);
    context.fillStyle = "#e0eaeb";
    context.font = "bold 18px monospace";
    context.fillText(String(station.shortLabel).toUpperCase(), 12, 24);
    context.font = "12px monospace";
    context.fillStyle = "#abc5ca";
    context.fillText("SYSTEM MONITOR  /  ISS", 12, 57);
    context.strokeStyle = "#365664";
    context.lineWidth = 1;
    for (let y = 82; y < 244; y += 32) {
      context.beginPath(); context.moveTo(18, y); context.lineTo(330, y); context.stroke();
    }
    context.strokeStyle = "#7cb9bd";
    context.lineWidth = 3;
    context.beginPath();
    [182, 169, 177, 145, 152, 135, 153, 125, 138, 117, 131].forEach((y, index) => {
      if (index === 0) context.moveTo(20, y);
      else context.lineTo(20 + index * 30, y);
    });
    context.stroke();
    context.fillStyle = "#b5d0d0";
    ["DATA LINK", "PRESSURE", "THERMAL", "POWER"].forEach((label, index) => {
      const y = 97 + index * 44;
      context.fillText(label, 357, y);
      context.fillStyle = index === 0 ? "#70bba8" : "#8baab1";
      context.fillRect(357, y + 8, 100 - index * 11, 5);
      context.fillStyle = "#b5d0d0";
    });
    return applyTextureEncoding(new window.THREE.CanvasTexture(element), 4);
  }

  function createConsoleKeysTexture() {
    const { element, context } = makeCanvas(512, 112);
    context.fillStyle = "#39494d";
    context.fillRect(0, 0, 512, 112);
    context.fillStyle = "#93a19f";
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 14; column++) {
        context.fillRect(10 + column * 35, 8 + row * 32, 27, 23);
      }
    }
    context.fillStyle = "#d6dbd5";
    context.fillRect(172, 82, 142, 20);
    return applyTextureEncoding(new window.THREE.CanvasTexture(element), 4);
  }

  function createSignTexture(short, label) {
    const { element, context } = makeCanvas(512, 128);
    context.fillStyle = "#e3e5df";
    context.fillRect(0, 0, 512, 128);
    context.strokeStyle = "#738188";
    context.lineWidth = 4;
    context.strokeRect(6, 6, 500, 116);
    context.fillStyle = "#243c4b";
    context.font = "600 54px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "center";
    context.fillText(short, 256, 62);
    context.fillStyle = "#53646c";
    context.font = "400 22px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText(String(label).toUpperCase(), 256, 96);
    const tex = new window.THREE.CanvasTexture(element);
    return applyTextureEncoding(tex, 4);
  }

  // ---------------------------------------------------------------------------
  // Shared detail textures. These are generated once and reused by instanced
  // hatch thresholds, rack placards, ventilation grilles and the cupola glass.
  // ---------------------------------------------------------------------------
  let hazardTextureCache = null;
  function getHazardTexture() {
    if (hazardTextureCache) return hazardTextureCache;
    const { element, context } = makeCanvas(256, 64);
    context.fillStyle = "#242a2e";
    context.fillRect(0, 0, 256, 64);
    context.save();
    context.beginPath();
    context.rect(0, 0, 256, 64);
    context.clip();
    for (let x = -64; x < 320; x += 32) {
      context.fillStyle = "#d7a93f";
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + 16, 0);
      context.lineTo(x - 48, 64);
      context.lineTo(x - 64, 64);
      context.closePath();
      context.fill();
    }
    context.restore();
    context.fillStyle = "rgba(255,255,255,0.10)";
    context.fillRect(0, 0, 256, 2);
    context.fillRect(0, 62, 256, 2);
    const tex = new window.THREE.CanvasTexture(element);
    tex.wrapS = window.THREE.RepeatWrapping;
    tex.wrapT = window.THREE.ClampToEdgeWrapping;
    hazardTextureCache = applyTextureEncoding(tex, 4);
    return hazardTextureCache;
  }

  let ventTextureCache = null;
  function getVentTexture() {
    if (ventTextureCache) return ventTextureCache;
    const { element, context } = makeCanvas(128, 128);
    context.fillStyle = "#aeb8b7";
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = "#687578";
    context.fillRect(8, 8, 112, 112);
    context.fillStyle = "#c5cdca";
    context.fillRect(12, 12, 104, 104);
    for (let slot = 0; slot < 7; slot++) {
      const y = 22 + slot * 12;
      context.fillStyle = "#273236";
      context.fillRect(20, y, 88, 6);
      context.fillStyle = "rgba(255,255,255,0.22)";
      context.fillRect(20, y, 88, 1);
    }
    [[16, 16], [112, 16], [16, 112], [112, 112]].forEach(([x, y]) => {
      context.beginPath();
      context.arc(x, y, 3, 0, Math.PI * 2);
      context.fillStyle = "#5d6b6e";
      context.fill();
    });
    const tex = new window.THREE.CanvasTexture(element);
    ventTextureCache = applyTextureEncoding(tex, 4);
    return ventTextureCache;
  }

  let rackLabelTextureCache = null;
  function getRackLabelTexture() {
    if (rackLabelTextureCache) return rackLabelTextureCache;
    const { element, context } = makeCanvas(256, 64);
    context.fillStyle = "#e7e9e2";
    context.fillRect(0, 0, 256, 64);
    context.strokeStyle = "#7c8a8c";
    context.lineWidth = 2;
    context.strokeRect(1, 1, 254, 62);
    context.fillStyle = "#203847";
    context.font = "700 20px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "left";
    context.fillText("ISPR", 10, 27);
    context.fillStyle = "#5a6a70";
    context.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillText("ISS PAYLOAD RACK", 10, 44);
    context.fillStyle = "#203847";
    for (let bar = 0; bar < 16; bar++) {
      const width = 1 + ((bar * 7) % 3);
      context.fillRect(150 + bar * 6, 14, width, 28);
    }
    context.fillStyle = "#d7a93f";
    context.fillRect(10, 49, 12, 5);
    context.fillStyle = "#53646c";
    context.fillText("REF", 27, 55);
    const tex = new window.THREE.CanvasTexture(element);
    rackLabelTextureCache = applyTextureEncoding(tex, 4);
    return rackLabelTextureCache;
  }

  let cautionTextureCache = null;
  function getCautionTexture() {
    if (cautionTextureCache) return cautionTextureCache;
    const { element, context } = makeCanvas(256, 72);
    context.fillStyle = "#d7a93f";
    context.fillRect(0, 0, 256, 72);
    context.fillStyle = "#1d2327";
    context.fillRect(4, 4, 248, 64);
    context.fillStyle = "#d7a93f";
    context.beginPath();
    context.moveTo(16, 50);
    context.lineTo(30, 22);
    context.lineTo(44, 50);
    context.closePath();
    context.fill();
    context.fillStyle = "#1d2327";
    context.font = "700 15px ui-monospace, monospace";
    context.fillText("!", 27, 45);
    context.fillStyle = "#f2e5bd";
    context.font = "700 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "left";
    context.fillText("CAUTION", 56, 26);
    context.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.fillStyle = "#d7a93f";
    context.fillText("PRESSURE HATCH / KEEP CLEAR", 56, 44);
    const tex = new window.THREE.CanvasTexture(element);
    cautionTextureCache = applyTextureEncoding(tex, 4);
    return cautionTextureCache;
  }

  let glassReflectionTextureCache = null;
  function getGlassReflectionTexture() {
    if (glassReflectionTextureCache) return glassReflectionTextureCache;
    const { element, context } = makeCanvas(256, 256);
    context.clearRect(0, 0, 256, 256);
    const gradient = context.createLinearGradient(0, 0, 256, 256);
    gradient.addColorStop(0, "rgba(190,230,255,0)");
    gradient.addColorStop(0.38, "rgba(190,230,255,0)");
    gradient.addColorStop(0.50, "rgba(210,240,255,0.34)");
    gradient.addColorStop(0.55, "rgba(255,255,255,0.10)");
    gradient.addColorStop(0.62, "rgba(190,230,255,0)");
    gradient.addColorStop(1, "rgba(190,230,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
    context.strokeStyle = "rgba(224,246,255,0.38)";
    context.lineWidth = 3;
    [[22, 178, 92, 108], [58, 210, 142, 122], [104, 236, 196, 140]].forEach(([x1, y1, x2, y2]) => {
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    });
    glassReflectionTextureCache = applyTextureEncoding(new window.THREE.CanvasTexture(element), 2);
    return glassReflectionTextureCache;
  }

  // ============================================================================
  // 3. MODULAR INTERIOR KIT BUILDERS (Kit.tsx & FaultBeacon.tsx)
  // ============================================================================
  let payloadAtlasState = null;
  function getPayloadAtlasState() {
    if (payloadAtlasState) return payloadAtlasState;
    const THREE = window.THREE;
    const state = {
      materials: Array.from({ length: 4 }, () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.06 })),
      surfaces: [],
      fallbacks: [],
      loaded: false
    };
    payloadAtlasState = state;
    new THREE.TextureLoader().load("textures/iss/payload_racks_v1.png", (atlas) => {
      applyTextureEncoding(atlas, 8);
      state.materials.forEach((material, index) => {
        // Small inset prevents the adjacent rack panel bleeding into the UVs.
        const texture = atlas.clone();
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(0.492, 0.492);
        texture.offset.set((index % 2) * 0.5 + 0.004, (index < 2 ? 0.5 : 0) + 0.004);
        applyTextureEncoding(texture, 8);
        material.map = texture;
        material.needsUpdate = true;
      });
      state.loaded = true;
      state.surfaces.forEach((surface) => { surface.visible = true; });
      state.fallbacks.forEach((surface) => { surface.visible = false; });
      state.surfaces.length = 0;
      state.fallbacks.length = 0;
    }, undefined, (error) => {
      console.warn("ISS equipment textures unavailable; keeping modeled rack surfaces:", error);
      state.surfaces.length = 0;
      state.fallbacks.length = 0;
    });
    return state;
  }

  let interiorKitMaterials = null;
  function getInteriorKitMaterials() {
    if (interiorKitMaterials) return interiorKitMaterials;
    const THREE = window.THREE;
    const textures = getInteriorTextures();
    const bagMap = createTiledTexture(textures.fabric, 1, 1);
    const blueBagMap = createTiledTexture(textures.fabric, 1, 1);
    const ivoryBagMap = createTiledTexture(textures.fabric, 1, 1);
    interiorKitMaterials = {
      rack: new THREE.MeshStandardMaterial({ map: createTiledTexture(textures.wall, 1.1, 1.9), color: 0xc9ccce, roughness: 0.58, metalness: 0.22 }),
      rackFallback: new THREE.MeshStandardMaterial({ map: createTiledTexture(textures.wall, 1, 2), color: 0xdce0df, roughness: 0.7 }),
      handle: new THREE.MeshStandardMaterial({ color: METAL_LIGHT, roughness: 0.4, metalness: 0.7 }),
      bag: new THREE.MeshStandardMaterial({ map: bagMap, bumpMap: bagMap, bumpScale: 0.001, color: 0xf1f1ec, roughness: 0.94, metalness: 0.02 }),
      bagBlue: new THREE.MeshStandardMaterial({ map: blueBagMap, bumpMap: blueBagMap, bumpScale: 0.001, color: 0x546b79, roughness: 0.94, metalness: 0.02 }),
      bagIvory: new THREE.MeshStandardMaterial({ map: ivoryBagMap, bumpMap: ivoryBagMap, bumpScale: 0.001, color: 0xd4d0be, roughness: 0.94, metalness: 0.02 }),
      strap: new THREE.MeshStandardMaterial({ color: 0x345876, roughness: 0.85 })
    };
    return interiorKitMaterials;
  }

  function createSoftStowageGeometry() {
    const THREE = window.THREE;
    const geometry = new THREE.BoxGeometry(0.62, 0.44, 0.42, 4, 4, 4);
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const radius = 0.055, half = [0.31, 0.22, 0.21];
    for (let index = 0; index < positions.count; index++) {
      const point = [positions.getX(index), positions.getY(index), positions.getZ(index)];
      const core = point.map((value, axis) => Math.max(-half[axis] + radius, Math.min(half[axis] - radius, value)));
      const normal = new THREE.Vector3(point[0] - core[0], point[1] - core[1], point[2] - core[2]).normalize();
      positions.setXYZ(index, core[0] + normal.x * radius, core[1] + normal.y * radius, core[2] + normal.z * radius);
      normals.setXYZ(index, normal.x, normal.y, normal.z);
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
    return geometry;
  }

  function buildEquipmentFixtures(racks, bags) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const materials = getInteriorKitMaterials();
    const atlas = getPayloadAtlasState();
    const parent = new THREE.Object3D();
    const local = new THREE.Object3D();
    const matrix = new THREE.Matrix4();
    const setInstance = (mesh, index, spec, position, scale = [1, 1, 1]) => {
      parent.position.set(...spec.position);
      parent.rotation.set(...(spec.rotation || [0, 0, 0]));
      parent.scale.setScalar(spec.scale || 1);
      parent.updateMatrix();
      local.position.set(...position);
      local.rotation.set(0, 0, 0);
      local.scale.set(...scale);
      local.updateMatrix();
      matrix.multiplyMatrices(parent.matrix, local.matrix);
      mesh.setMatrixAt(index, matrix);
    };
    const finish = (mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    };
    if (racks.length) {
      const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.9, 0.46), materials.rack, racks.length);
      const fallback = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.86, 1.7), materials.rackFallback, racks.length);
      const handles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.34, 0.05), materials.handle, racks.length * 2);
      const panels = [[], [], [], []];
      racks.forEach((rack, index) => {
        setInstance(bodies, index, rack, [0, 0.95, 0]);
        setInstance(fallback, index, rack, [0, 0.96, 0.24]);
        [-0.42, 0.42].forEach((x, side) => setInstance(handles, index * 2 + side, rack, [x, 1.55, 0.27]));
        const variant = Array.from(String(rack.label)).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
        [0, 1].forEach((row) => panels[(variant + row) % 4].push({ rack, row }));
      });
      finish(bodies);
      finish(handles);
      fallback.visible = !atlas.loaded;
      if (!atlas.loaded) atlas.fallbacks.push(fallback);
      finish(fallback);
      const panelGeometry = new THREE.PlaneGeometry(0.82, 0.82);
      panels.forEach((items, variant) => {
        if (!items.length) return;
        const mesh = new THREE.InstancedMesh(panelGeometry, atlas.materials[variant], items.length);
        items.forEach(({ rack, row }, index) => setInstance(mesh, index, rack, [0, 0.55 + row * 0.83, 0.245]));
        mesh.visible = atlas.loaded;
        if (!atlas.loaded) atlas.surfaces.push(mesh);
        finish(mesh);
      });
    }
    if (bags.length) {
      const bagGroups = [[], [], []];
      const straps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.strap, bags.length * 7);
      bags.forEach((bag, index) => {
        const seed = Math.abs(Math.round(bag.position[0] * 79 + bag.position[2] * 31));
        bagGroups[seed % 11 === 0 ? 1 : seed % 7 === 0 ? 2 : 0].push(bag);
        const offset = bag.offset || 0;
        let strip = 0;
        [-0.218, 0.218].forEach((z) => {
          [-0.19, 0.19].forEach((x) => {
            setInstance(straps, index * 7 + strip++, bag, [x, 0.22, z + offset], [0.035, 0.44, 0.018]);
          });
          setInstance(straps, index * 7 + strip++, bag, [0, 0.22, z + offset], [0.62, 0.034, 0.018]);
        });
        setInstance(straps, index * 7 + strip, bag, [0, 0.45, offset], [0.24, 0.03, 0.16]);
      });
      const bagGeometry = createSoftStowageGeometry();
      [materials.bag, materials.bagBlue, materials.bagIvory].forEach((material, variant) => {
        if (!bagGroups[variant].length) return;
        const bodies = new THREE.InstancedMesh(bagGeometry, material, bagGroups[variant].length);
        bagGroups[variant].forEach((bag, index) => setInstance(bodies, index, bag, [0, 0.22, bag.offset || 0]));
        finish(bodies);
      });
      finish(straps);
    }
    return group;
  }

  // Small equipment cases project from selected rack faces. Keeping them in
  // a few instanced batches gives the cabin actual depth without making the
  // number of draw calls depend on the number of fitted workstations.
  function buildRackElectronics(fixtures) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const selected = fixtures.filter((fixture, index) => index % 4 === 1 &&
      !Object.values(ISS_STATION_LAYOUT).some(({ position }) => Math.hypot(fixture.x - position[0], fixture.z - position[2]) < 0.95));
    if (!selected.length) return group;
    const parent = new THREE.Object3D(), local = new THREE.Object3D(), matrix = new THREE.Matrix4();
    const setPart = (mesh, index, fixture, position, scale = [1, 1, 1]) => {
      parent.position.set(fixture.x, 0, fixture.z);
      parent.rotation.set(0, fixture.rotation, 0);
      parent.updateMatrix();
      local.position.set(...position);
      local.rotation.set(0, 0, 0);
      local.scale.set(...scale);
      local.updateMatrix();
      matrix.multiplyMatrices(parent.matrix, local.matrix);
      mesh.setMatrixAt(index, matrix);
    };
    const finish = (mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    };
    const backing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.63, 0.48, 0.075),
      new THREE.MeshStandardMaterial({ color: 0xa6b0ad, roughness: 0.68, metalness: 0.26 }), selected.length);
    const bezel = new THREE.InstancedMesh(new THREE.BoxGeometry(0.51, 0.32, 0.075),
      new THREE.MeshStandardMaterial({ color: 0x263036, roughness: 0.65, metalness: 0.16 }), selected.length);
    const controls = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.06, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x596568, roughness: 0.65, metalness: 0.2 }), selected.length);
    const indicators = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.012, 0.01),
      new THREE.MeshBasicMaterial({ color: 0xa2c7a4 }), selected.length * 3);
    const screenGroups = [[], [], []];
    selected.forEach((fixture, index) => {
      const height = 1.15 + (index % 3) * 0.19;
      const size = 0.86 + (index % 3) * 0.07;
      setPart(backing, index, fixture, [0, height, 0.28], [size, size, 1]);
      setPart(bezel, index, fixture, [0, height + 0.025, 0.35], [size, size, 1]);
      setPart(controls, index, fixture, [0, height - 0.17 * size, 0.35], [size, size, 1]);
      for (let led = 0; led < 3; led++) {
        setPart(indicators, index * 3 + led, fixture, [-0.12 + led * 0.08, height - 0.17 * size, 0.37]);
      }
      screenGroups[index % screenGroups.length].push({ fixture, height, size });
    });
    finish(backing); finish(bezel); finish(controls); finish(indicators);
    const screenGeometry = new THREE.PlaneGeometry(0.44, 0.245);
    const screenMaterials = [
      new THREE.MeshBasicMaterial({ map: createConsoleScreenTexture({ shortLabel: "SYSTEM" }) }),
      new THREE.MeshStandardMaterial({ color: 0x111a1f, metalness: 0.35, roughness: 0.3 }),
      new THREE.MeshBasicMaterial({ map: createConsoleScreenTexture({ shortLabel: "PAYLOAD" }) })
    ];
    screenGroups.forEach((items, variant) => {
      if (!items.length) return;
      const screen = new THREE.InstancedMesh(screenGeometry, screenMaterials[variant], items.length);
      items.forEach(({ fixture, height, size }, index) => {
        setPart(screen, index, fixture, [0, height + 0.025, 0.39], [size, size, 1]);
      });
      finish(screen);
    });
    return group;
  }

  function buildRackInstruments(surfaces) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const selected = surfaces.filter((surface, index) => index % 5 === 3 && index % 4 !== 1 &&
      !Object.values(ISS_STATION_LAYOUT).some(({ position }) => Math.hypot(surface.x - position[0], surface.z - position[2]) < 0.95));
    if (!selected.length) return group;
    const parent = new THREE.Object3D(), local = new THREE.Object3D(), matrix = new THREE.Matrix4();
    const setPart = (mesh, index, surface, position, angle = 0) => {
      parent.position.set(surface.x, 0, surface.z);
      parent.rotation.set(0, surface.rotation, 0);
      parent.updateMatrix();
      local.position.set(...position);
      local.rotation.set(0, 0, angle);
      local.updateMatrix();
      matrix.multiplyMatrices(parent.matrix, local.matrix);
      mesh.setMatrixAt(index, matrix);
    };
    const finish = (mesh) => { mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; group.add(mesh); };
    const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.38, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xb1bab5, roughness: 0.7, metalness: 0.22 }), selected.length);
    const inset = new THREE.InstancedMesh(new THREE.BoxGeometry(0.52, 0.29, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x46585b, roughness: 0.68, metalness: 0.2 }), selected.length);
    const dialFace = new THREE.InstancedMesh(new THREE.CircleGeometry(0.075, 18),
      new THREE.MeshStandardMaterial({ color: 0xd9ded7, roughness: 0.6 }), selected.length * 2);
    const dialRim = new THREE.InstancedMesh(new THREE.TorusGeometry(0.077, 0.008, 6, 18),
      new THREE.MeshStandardMaterial({ color: 0x849492, metalness: 0.45, roughness: 0.46 }), selected.length * 2);
    const needle = new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, 0.055, 0.008),
      new THREE.MeshBasicMaterial({ color: 0x27373b }), selected.length * 2);
    const switches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.026, 0.035, 0.018),
      new THREE.MeshStandardMaterial({ color: 0xabb7b3, roughness: 0.6, metalness: 0.35 }), selected.length * 3);
    selected.forEach((surface, index) => {
      const y = index % 2 ? 0.82 : 1.75;
      setPart(housing, index, surface, [0, y, 0.30]);
      setPart(inset, index, surface, [0, y, 0.37]);
      [-0.14, 0.06].forEach((x, dial) => {
        setPart(dialFace, index * 2 + dial, surface, [x, y + 0.02, 0.386]);
        setPart(dialRim, index * 2 + dial, surface, [x, y + 0.02, 0.39]);
        setPart(needle, index * 2 + dial, surface, [x, y + 0.035, 0.394], (index % 3 - 1) * 0.45 + dial * 0.35);
      });
      for (let switchIndex = 0; switchIndex < 3; switchIndex++) {
        setPart(switches, index * 3 + switchIndex, surface, [0.20, y - 0.08 + switchIndex * 0.07, 0.39]);
      }
    });
    [housing, inset, dialFace, dialRim, needle, switches].forEach(finish);
    return group;
  }

  function buildEquipmentCables(surfaces, ceilings) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    const hash = (surface) => Math.abs(Math.round(surface.x * 97 + surface.z * 47 + surface.rotation * 53));
    const point = (x, y, z) => new THREE.Vector3(x, y, z);
    const coils = [point(-0.32, 0.76, 0.07), point(-0.14, 0.48, 0.14)];
    for (let index = 0; index <= 16; index++) {
      const angle = index * Math.PI * 2.3 / 16;
      coils.push(point(0.04 + Math.cos(angle) * 0.16, 0.05 + Math.sin(angle) * 0.17, 0.15 + index * 0.001));
    }
    coils.push(point(0.31, -0.52, 0.08));
    const wires = [
      { color: 0xd9dbd4, radius: 0.008, points: [point(-0.42, 0.8, 0.06), point(-0.25, 0.56, 0.14), point(0.1, 0.39, 0.2), point(0.29, -0.15, 0.17), point(-0.08, -0.7, 0.07)] },
      { color: 0x2d383e, radius: 0.006, points: [point(0.35, 0.78, 0.06), point(0.22, 0.45, 0.16), point(-0.2, 0.16, 0.21), point(-0.17, -0.4, 0.13), point(0.2, -0.74, 0.07)] },
      { color: 0xbfc5c1, radius: 0.006, points: coils },
      { color: 0x647e8a, radius: 0.007, points: [point(-0.34, -0.7, 0.07), point(-0.16, -0.4, 0.15), point(0.18, -0.33, 0.22), point(0.3, 0.26, 0.17), point(0.09, 0.77, 0.07)] },
      { color: 0xb18b62, radius: 0.005, points: [point(0.38, -0.77, 0.07), point(0.2, -0.35, 0.13), point(-0.28, -0.1, 0.19), point(-0.26, 0.42, 0.14), point(-0.38, 0.72, 0.07)] }
    ];
    wires.forEach((wire, variant) => {
      const mounts = surfaces.filter((surface) => (hash(surface) + variant * 7) % 5 < 3);
      if (!mounts.length) return;
      const curve = new THREE.CatmullRomCurve3(wire.points);
      const geometry = new THREE.TubeGeometry(curve, variant === 2 ? 32 : 18, wire.radius, 5, false);
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: wire.color, roughness: 0.72, metalness: 0.08 }), mounts.length);
      const transform = new THREE.Object3D();
      mounts.forEach((surface, index) => {
        const seed = hash(surface) + variant * 31;
        transform.position.set(surface.x + Math.sin(surface.rotation) * 0.14,
          1.4 + ((seed % 5) - 2) * 0.045, surface.z + Math.cos(surface.rotation) * 0.14);
        transform.rotation.set(0, surface.rotation, ((seed % 7) - 3) * 0.045);
        transform.scale.set(0.82 + (seed % 4) * 0.08, 0.83 + (seed % 3) * 0.08, 1);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    });

    // A few loose overhead cable runs interrupt the repeated ceiling panels;
    // all hang above the crew and camera clearance envelope.
    const overhead = ceilings.filter(([x, , z]) => {
      if (Math.abs(Math.round(x * 7 + z * 11)) % 5 >= 2) return false;
      return !ISS_HATCHES.some((hatch) => {
        const forward = hatch.axis === "z" ? z : x;
        const cross = hatch.axis === "z" ? x : z;
        const span = getHatchCrossSpan(hatch);
        return Math.abs(forward - hatch.at) < 1 &&
          cross > span[0] - 0.5 && cross < span[1] + 0.5;
      });
    });
    const anchors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.025, 0.045),
      new THREE.MeshStandardMaterial({ color: 0x65777d, roughness: 0.65, metalness: 0.25 }), overhead.length * 6);
    const anchorParent = new THREE.Object3D(), anchorLocal = new THREE.Object3D(), anchorMatrix = new THREE.Matrix4();
    [0xcfd2cb, 0x36434a, 0x7993a0].forEach((color, variant) => {
      const curve = new THREE.CatmullRomCurve3([
        point(-0.46, 0, -0.3 + variant * 0.1), point(-0.22, -0.05 - variant * 0.01, -0.1),
        point(0.13, -0.08, 0.2), point(0.42, 0, 0.37 - variant * 0.1)
      ]);
      const mesh = new THREE.InstancedMesh(new THREE.TubeGeometry(curve, 16, 0.006 + variant * 0.001, 5, false),
        new THREE.MeshStandardMaterial({ color, roughness: 0.75 }), overhead.length);
      const transform = new THREE.Object3D();
      overhead.forEach(([x, , z], index) => {
        transform.position.set(x, 2.76, z);
        transform.rotation.y = (Math.abs(Math.round(x * 13 + z * 17)) % 4) * Math.PI / 2;
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        anchorParent.position.copy(transform.position);
        anchorParent.rotation.copy(transform.rotation);
        anchorParent.updateMatrix();
        [[-0.46, 0, -0.3 + variant * 0.1], [0.42, 0, 0.37 - variant * 0.1]].forEach((position, endpoint) => {
          anchorLocal.position.set(...position);
          anchorLocal.updateMatrix();
          anchorMatrix.multiplyMatrices(anchorParent.matrix, anchorLocal.matrix);
          anchors.setMatrixAt(variant * overhead.length * 2 + index * 2 + endpoint, anchorMatrix);
        });
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    });
    anchors.instanceMatrix.needsUpdate = true;
    anchors.frustumCulled = false;
    group.add(anchors);
    return group;
  }

  function buildScienceGlovebox(position) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.position.set(...position);
    g.rotation.y = Math.PI / 2;
    const housing = new THREE.MeshStandardMaterial({ color: 0xd4d8d6, metalness: 0.18, roughness: 0.68 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x263c49, metalness: 0.3, roughness: 0.45 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x5c6f78, metalness: 0.55, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.86, 0.4), housing);
    body.position.y = 0.93;
    g.add(body);
    const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.62, 0.06), dark);
    chamber.position.set(0, 1.26, 0.22);
    g.add(chamber);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x7595a0, metalness: 0.2, roughness: 0.18, transparent: true, opacity: 0.45 }));
    glass.position.set(0, 1.26, 0.26);
    g.add(glass);
    [-0.22, 0.22].forEach((x) => {
      const port = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 20), trim);
      port.position.set(x, 1.13, 0.29);
      g.add(port);
      const opening = new THREE.Mesh(new THREE.CircleGeometry(0.10, 20), dark);
      opening.position.set(x, 1.13, 0.275);
      g.add(opening);
    });
    const control = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 0.035), trim);
    control.position.set(0, 0.67, 0.23);
    g.add(control);
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.14),
      new THREE.MeshBasicMaterial({ map: createConsoleScreenTexture({ shortLabel: "GLOVEBOX" }) }));
    display.position.set(-0.16, 0.67, 0.25);
    g.add(display);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.1),
      new THREE.MeshBasicMaterial({ map: createSignTexture("MSG", "MICROGRAVITY SCIENCE GLOVEBOX") }));
    sign.position.set(0, 1.72, 0.205);
    g.add(sign);
    return g;
  }

  function buildAirlockPanel(position) {
    const THREE = window.THREE;
    const g = new THREE.Group();
    g.position.set(...position);
    const housing = new THREE.MeshStandardMaterial({ color: 0xb9c4c5, roughness: 0.72, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.2, 0.18), housing);
    body.position.y = 1.12;
    g.add(body);
    const atlas = getPayloadAtlasState();
    const equipment = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.92), atlas.materials[3]);
    equipment.position.set(0, 1.1, 0.095);
    equipment.visible = atlas.loaded;
    if (!atlas.loaded) atlas.surfaces.push(equipment);
    g.add(equipment);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.085),
      new THREE.MeshBasicMaterial({ map: createSignTexture("QUEST", "AIRLOCK EQUIPMENT") }));
    sign.position.set(0, 1.63, 0.1);
    g.add(sign);
    [0x416b84, 0xe4e5df].forEach((color, index) => {
      const x = -0.19 + index * 0.3;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 1.43, 0.12),
        new THREE.Vector3(x + 0.1, 1.18, 0.16),
        new THREE.Vector3(x + 0.04, 0.91, 0.16),
        new THREE.Vector3(x + 0.14, 0.72, 0.12)
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.012, 6, false),
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 })));
    });
    return g;
  }

  // ============================================================================
  // 3b. CONSTRUCTED-STATION DETAIL LAYER
  // ============================================================================
  // These builders add the visual evidence of a working orbital laboratory:
  // hazard-marked hatches, utility trays, ventilation, rack placards, emergency
  // equipment and module colour coding. Repeated elements are instanced so the
  // extra fidelity does not turn into a draw-call explosion.
  function buildHatchThresholds() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.name = "ISS_Hatch_Thresholds";
    const hazardMaterial = new THREE.MeshStandardMaterial({
      map: getHazardTexture(),
      roughness: 0.82,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const thresholdGeometry = new THREE.PlaneGeometry(1, 1);
    ISS_HATCHES.forEach((hatch) => {
      const span = Math.max(1.2, hatch.halfWidth * 2 - 0.28);
      const width = hatch.axis === "z" ? span : 0.36;
      const depth = hatch.axis === "z" ? 0.36 : span;
      const plate = new THREE.Mesh(thresholdGeometry, hazardMaterial);
      plate.rotation.x = -Math.PI / 2;
      plate.scale.set(width, depth, 1);
      plate.position.set(
        hatch.axis === "z" ? hatch.center : hatch.at,
        -0.012,
        hatch.axis === "z" ? hatch.at : hatch.center
      );
      group.add(plate);
    });

    // Recessed tie-down rings along the clear aisle edges. They give the deck
    // scale without adding anything the walking collision has to know about.
    const tiePoints = [];
    for (let z = 1.4; z <= 48; z += 4.1) {
      [-0.82, 0.82].forEach((x) => {
        const nearHatch = ISS_HATCHES.some((hatch) => {
          if (hatch.axis !== "z" || Math.abs(z - hatch.at) >= 0.9) return false;
          const span = getHatchCrossSpan(hatch);
          return x > span[0] - 0.25 && x < span[1] + 0.25;
        });
        if (!nearHatch) tiePoints.push([x, z]);
      });
    }
    if (tiePoints.length) {
      const ringGeometry = new THREE.TorusGeometry(0.055, 0.011, 6, 14);
      const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x65777e, roughness: 0.45, metalness: 0.62 });
      const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, tiePoints.length);
      const transform = new THREE.Object3D();
      tiePoints.forEach(([x, z], index) => {
        transform.position.set(x, -0.006, z);
        transform.rotation.set(-Math.PI / 2, 0, 0);
        transform.updateMatrix();
        rings.setMatrixAt(index, transform.matrix);
      });
      rings.instanceMatrix.needsUpdate = true;
      rings.frustumCulled = false;
      group.add(rings);
    }
    return group;
  }

  function buildUtilityRun(wallSurfaces) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.name = "ISS_Overhead_Utility_Run";

    // Split the overhead cable trays at every pressure hatch so the services
    // appear to terminate at a proper bulkhead pass-through instead of
    // clipping through the hatch surround.
    const breaks = ISS_HATCHES.filter((hatch) => hatch.axis === "z")
      .map((hatch) => hatch.at)
      .sort((a, b) => a - b);
    const runs = [];
    let cursor = -4.8;
    breaks.forEach((at) => {
      if (at - 0.48 > cursor) runs.push([cursor, at - 0.48]);
      cursor = Math.max(cursor, at + 0.48);
    });
    if (49 > cursor) runs.push([cursor, 49]);
    const usableRuns = runs.filter(([start, end]) => end - start > 0.7);

    const trayMaterial = new THREE.MeshStandardMaterial({ color: 0x5e6c72, roughness: 0.55, metalness: 0.38 });
    const lipMaterial = new THREE.MeshStandardMaterial({ color: 0x7d898b, roughness: 0.5, metalness: 0.45 });
    const cableMaterials = [0xcfd2cb, 0x36434a, 0x7993a0].map((color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.74, metalness: 0.12 }));
    const hangerMaterial = new THREE.MeshStandardMaterial({ color: 0x6b797c, roughness: 0.58, metalness: 0.3 });

    const trayItems = [], lipItems = [], cableItems = [[], [], []], hangerItems = [];
    usableRuns.forEach(([start, end]) => {
      const length = end - start;
      const center = (start + end) / 2;
      [-1, 1].forEach((side) => {
        const x = side * 0.95;
        trayItems.push({ x, z: center, length });
        lipItems.push({ x: x - 0.09, z: center, length });
        lipItems.push({ x: x + 0.09, z: center, length });
        [-0.044, 0, 0.044].forEach((offset, variant) => {
          cableItems[variant].push({ x: x + offset, z: center, length });
        });
        for (let z = start + 0.65; z < end - 0.2; z += 2.5) {
          hangerItems.push({ x, z });
        }
      });
    });

    if (trayItems.length) {
      const trayGeometry = new THREE.BoxGeometry(0.18, 0.035, 1);
      const trays = new THREE.InstancedMesh(trayGeometry, trayMaterial, trayItems.length);
      const transform = new THREE.Object3D();
      trayItems.forEach((item, index) => {
        transform.position.set(item.x, 2.625, item.z);
        transform.rotation.set(0, 0, 0);
        transform.scale.set(1, 1, item.length);
        transform.updateMatrix();
        trays.setMatrixAt(index, transform.matrix);
      });
      trays.instanceMatrix.needsUpdate = true;
      trays.frustumCulled = false;
      group.add(trays);

      const lipGeometry = new THREE.BoxGeometry(0.018, 0.052, 1);
      const lips = new THREE.InstancedMesh(lipGeometry, lipMaterial, lipItems.length);
      lipItems.forEach((item, index) => {
        transform.position.set(item.x, 2.638, item.z);
        transform.scale.set(1, 1, item.length);
        transform.updateMatrix();
        lips.setMatrixAt(index, transform.matrix);
      });
      lips.instanceMatrix.needsUpdate = true;
      lips.frustumCulled = false;
      group.add(lips);
    }

    if (cableItems[0].length) {
      const cableGeometry = new THREE.CylinderGeometry(0.011, 0.011, 1, 6);
      cableItems.forEach((items, variant) => {
        const cables = new THREE.InstancedMesh(cableGeometry, cableMaterials[variant], items.length);
        const transform = new THREE.Object3D();
        items.forEach((item, index) => {
          transform.position.set(item.x, 2.652, item.z);
          transform.rotation.set(Math.PI / 2, 0, 0);
          transform.scale.set(1, item.length, 1);
          transform.updateMatrix();
          cables.setMatrixAt(index, transform.matrix);
        });
        cables.instanceMatrix.needsUpdate = true;
        cables.frustumCulled = false;
        group.add(cables);
      });
    }

    if (hangerItems.length) {
      const hangerGeometry = new THREE.BoxGeometry(0.035, 0.22, 0.035);
      const hangers = new THREE.InstancedMesh(hangerGeometry, hangerMaterial, hangerItems.length);
      const transform = new THREE.Object3D();
      hangerItems.forEach((item, index) => {
        transform.position.set(item.x, 2.745, item.z);
        transform.updateMatrix();
        hangers.setMatrixAt(index, transform.matrix);
      });
      hangers.instanceMatrix.needsUpdate = true;
      hangers.frustumCulled = false;
      group.add(hangers);
    }

    // Ceiling return-air diffusers, spaced away from the hatch rings.
    const diffusers = [];
    for (let z = -1.5; z <= 48; z += 5.4) {
      const nearHatch = ISS_HATCHES.some((hatch) => hatch.axis === "z" && Math.abs(z - hatch.at) < 1.15);
      if (nearHatch) continue;
      [-0.54, 0.54].forEach((x) => diffusers.push([x, z]));
    }
    if (diffusers.length) {
      const housing = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.032, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x7d8a8b, roughness: 0.62, metalness: 0.24 }), diffusers.length);
      const grille = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.28, 0.28),
        new THREE.MeshStandardMaterial({ map: getVentTexture(), roughness: 0.7, metalness: 0.18 }), diffusers.length);
      const transform = new THREE.Object3D();
      diffusers.forEach(([x, z], index) => {
        transform.position.set(x, 2.815, z);
        transform.rotation.set(0, 0, 0);
        transform.updateMatrix();
        housing.setMatrixAt(index, transform.matrix);
        transform.position.set(x, 2.797, z);
        transform.rotation.set(Math.PI / 2, 0, 0);
        transform.updateMatrix();
        grille.setMatrixAt(index, transform.matrix);
      });
      housing.instanceMatrix.needsUpdate = true;
      grille.instanceMatrix.needsUpdate = true;
      housing.frustumCulled = false;
      grille.frustumCulled = false;
      group.add(housing, grille);
    }

    // Smoke detectors are deliberately small; the repeated white pucks help
    // the ceiling read as an engineered volume rather than a flat panel.
    const detectors = [];
    for (let z = 0.5; z <= 48; z += 6.2) {
      const nearHatch = ISS_HATCHES.some((hatch) => hatch.axis === "z" && Math.abs(z - hatch.at) < 0.9);
      if (!nearHatch) [-0.36, 0.36].forEach((x) => detectors.push([x, z]));
    }
    if (detectors.length) {
      const detectorMaterial = new THREE.MeshStandardMaterial({ color: 0xe3e7e2, roughness: 0.55, metalness: 0.15 });
      const detectorGeometry = new THREE.CylinderGeometry(0.052, 0.058, 0.035, 12);
      const mesh = new THREE.InstancedMesh(detectorGeometry, detectorMaterial, detectors.length);
      const led = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8a75 }), detectors.length);
      const transform = new THREE.Object3D();
      detectors.forEach(([x, z], index) => {
        transform.position.set(x, 2.815, z);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
        transform.position.set(x, 2.795, z);
        transform.updateMatrix();
        led.setMatrixAt(index, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      led.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      led.frustumCulled = false;
      group.add(mesh, led);
    }

    // A scattering of wall return grilles breaks up the long rack runs.
    const grilleSurfaces = wallSurfaces.filter((surface, index) => index % 13 === 5 &&
      !Object.values(ISS_STATION_LAYOUT).some(({ position }) =>
        Math.hypot(surface.x - position[0], surface.z - position[2]) < 1.15));
    if (grilleSurfaces.length) {
      const wallGrilles = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.22),
        new THREE.MeshStandardMaterial({ map: getVentTexture(), roughness: 0.72, metalness: 0.16 }), grilleSurfaces.length);
      const transform = new THREE.Object3D();
      grilleSurfaces.forEach((surface, index) => {
        transform.position.set(
          surface.x + Math.sin(surface.rotation) * 0.085,
          2.48,
          surface.z + Math.cos(surface.rotation) * 0.085
        );
        transform.rotation.set(0, surface.rotation, 0);
        transform.updateMatrix();
        wallGrilles.setMatrixAt(index, transform.matrix);
      });
      wallGrilles.instanceMatrix.needsUpdate = true;
      wallGrilles.frustumCulled = false;
      group.add(wallGrilles);
    }
    return group;
  }

  function buildModuleAccents(wallSurfaces) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.name = "ISS_Module_Accent_Strips";
    const groups = [[], [], [], []];
    wallSurfaces.forEach((surface) => {
      const index = surface.z > 12 ? 3 : surface.x < -3 ? 1 : surface.x > 3 ? 2 : 0;
      groups[index].push(surface);
    });
    const palette = [0x67e8f9, 0x3b82f6, 0x34d399, 0xd8b56a];
    const geometry = new THREE.BoxGeometry(0.92, 0.022, 0.012);
    groups.forEach((surfaces, index) => {
      if (!surfaces.length) return;
      const material = new THREE.MeshStandardMaterial({
        color: palette[index],
        emissive: palette[index],
        emissiveIntensity: 0.28,
        roughness: 0.52,
        metalness: 0.22
      });
      const strips = new THREE.InstancedMesh(geometry, material, surfaces.length);
      const transform = new THREE.Object3D();
      surfaces.forEach((surface, stripIndex) => {
        transform.position.set(
          surface.x + Math.sin(surface.rotation) * 0.078,
          2.64,
          surface.z + Math.cos(surface.rotation) * 0.078
        );
        transform.rotation.set(0, surface.rotation, 0);
        transform.updateMatrix();
        strips.setMatrixAt(stripIndex, transform.matrix);
      });
      strips.instanceMatrix.needsUpdate = true;
      strips.frustumCulled = false;
      group.add(strips);
    });
    return group;
  }

  function buildRackTrim(racks) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.name = "ISS_Rack_Trim";
    if (!racks.length) return group;
    const labelMaterial = new THREE.MeshBasicMaterial({ map: getRackLabelTexture() });
    const headerMaterial = new THREE.MeshStandardMaterial({ color: 0x3f5058, roughness: 0.6, metalness: 0.28 });
    const latchMaterial = new THREE.MeshStandardMaterial({ color: 0x59686c, roughness: 0.52, metalness: 0.42 });
    const drawerMaterial = new THREE.MeshStandardMaterial({ color: 0xa9b3b0, roughness: 0.62, metalness: 0.24 });
    const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x465a63, roughness: 0.46, metalness: 0.5 });

    const headers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.72, 0.1, 0.025), headerMaterial, racks.length);
    const labels = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.43, 0.105), labelMaterial, racks.length);
    const latches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.035, 0.028), latchMaterial, racks.length * 2);
    const indicatorGroups = [[], [], []];
    const drawerItems = [];
    const transform = new THREE.Object3D();

    racks.forEach((rack, index) => {
      const rotation = (rack.rotation && rack.rotation[1]) || 0;
      const forwardX = Math.sin(rotation);
      const forwardZ = Math.cos(rotation);
      const x = rack.position[0];
      const z = rack.position[2];
      transform.position.set(x + forwardX * 0.246, 1.83, z + forwardZ * 0.246);
      transform.rotation.set(0, rotation, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      headers.setMatrixAt(index, transform.matrix);

      transform.position.set(x + forwardX * 0.262, 1.832, z + forwardZ * 0.262);
      transform.updateMatrix();
      labels.setMatrixAt(index, transform.matrix);

      [-0.31, 0.31].forEach((side, sideIndex) => {
        transform.position.set(
          x + Math.cos(rotation) * side + forwardX * 0.258,
          0.38,
          z - Math.sin(rotation) * side + forwardZ * 0.258
        );
        transform.rotation.set(0, rotation, 0);
        transform.updateMatrix();
        latches.setMatrixAt(index * 2 + sideIndex, transform.matrix);
      });

      const seed = Math.abs(Math.round(x * 71 + z * 37 + rotation * 19));
      indicatorGroups[seed % indicatorGroups.length].push({ x, z, rotation, forwardX, forwardZ });
      if (index % 3 === 0) drawerItems.push({ x, z, rotation, forwardX, forwardZ, seed });
    });

    const indicatorPalette = [
      { color: 0x6ee7b7, emissive: 0x34d399 },
      { color: 0xfde68a, emissive: 0xf59e0b },
      { color: 0x93c5fd, emissive: 0x3b82f6 }
    ];
    indicatorGroups.forEach((items, index) => {
      if (!items.length) return;
      const material = new THREE.MeshStandardMaterial({
        color: indicatorPalette[index].color,
        emissive: indicatorPalette[index].emissive,
        emissiveIntensity: 0.85,
        roughness: 0.4
      });
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.024, 0.012, 0.01), material, items.length);
      items.forEach((item, itemIndex) => {
        transform.position.set(
          item.x + Math.cos(item.rotation) * 0.28 + item.forwardX * 0.268,
          1.832,
          item.z - Math.sin(item.rotation) * 0.28 + item.forwardZ * 0.268
        );
        transform.rotation.set(0, item.rotation, 0);
        transform.updateMatrix();
        mesh.setMatrixAt(itemIndex, transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    });

    if (drawerItems.length) {
      const drawerBody = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.2, 0.04), drawerMaterial, drawerItems.length);
      const drawerHandle = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.022, 0.018), handleMaterial, drawerItems.length);
      drawerItems.forEach((item, index) => {
        transform.position.set(item.x + item.forwardX * 0.262, 0.58, item.z + item.forwardZ * 0.262);
        transform.rotation.set(0, item.rotation, 0);
        transform.updateMatrix();
        drawerBody.setMatrixAt(index, transform.matrix);
        transform.position.set(item.x + item.forwardX * 0.284, 0.58, item.z + item.forwardZ * 0.284);
        transform.updateMatrix();
        drawerHandle.setMatrixAt(index, transform.matrix);
      });
      drawerBody.instanceMatrix.needsUpdate = true;
      drawerHandle.instanceMatrix.needsUpdate = true;
      drawerBody.frustumCulled = false;
      drawerHandle.frustumCulled = false;
      group.add(drawerBody, drawerHandle);
    }

    headers.instanceMatrix.needsUpdate = true;
    labels.instanceMatrix.needsUpdate = true;
    latches.instanceMatrix.needsUpdate = true;
    headers.frustumCulled = false;
    labels.frustumCulled = false;
    latches.frustumCulled = false;
    group.add(headers, labels, latches);
    return group;
  }

  function buildEmergencyStations() {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.name = "ISS_Emergency_Equipment";
    const redMaterial = new THREE.MeshStandardMaterial({ color: 0xb2382f, roughness: 0.55, metalness: 0.3 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x243238, roughness: 0.6, metalness: 0.25 });
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xd9ded8, roughness: 0.7, metalness: 0.12 });
    const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x3f6a58, roughness: 0.66, metalness: 0.16 });

    const extinguisher = (x, z, rotation) => {
      const unit = new THREE.Group();
      unit.position.set(x, 0, z);
      unit.rotation.y = rotation;
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.06), darkMaterial);
      bracket.position.set(0, 1.15, -0.03);
      unit.add(bracket);
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.36, 14), redMaterial);
      bottle.position.set(0, 1.15, 0.075);
      unit.add(bottle);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.09, 10), darkMaterial);
      neck.position.set(0, 1.37, 0.075);
      unit.add(neck);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.035), darkMaterial);
      handle.position.set(0.035, 1.42, 0.075);
      unit.add(handle);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085),
        new THREE.MeshBasicMaterial({ map: createSignTexture("FIRE", "EXTINGUISHER") }));
      sign.position.set(0, 1.52, 0.02);
      unit.add(sign);
      group.add(unit);
    };

    const storedBreathing = (x, z, rotation) => {
      const unit = new THREE.Group();
      unit.position.set(x, 0, z);
      unit.rotation.y = rotation;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.13), greenMaterial);
      box.position.set(0, 1.38, 0.05);
      unit.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.035, 0.02), whiteMaterial);
      lid.position.set(0, 1.38, 0.12);
      unit.add(lid);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.08),
        new THREE.MeshBasicMaterial({ map: createSignTexture("O2", "CREW BREATHING") }));
      sign.position.set(0, 1.58, 0.02);
      unit.add(sign);
      group.add(unit);
    };

    const firstAid = (x, z, rotation) => {
      const unit = new THREE.Group();
      unit.position.set(x, 0, z);
      unit.rotation.y = rotation;
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.1), whiteMaterial);
      box.position.set(0, 1.32, 0.04);
      unit.add(box);
      const crossVertical = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.012), redMaterial);
      crossVertical.position.set(0, 1.32, 0.096);
      unit.add(crossVertical);
      const crossHorizontal = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.012), redMaterial);
      crossHorizontal.position.set(0, 1.32, 0.096);
      unit.add(crossHorizontal);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.08),
        new THREE.MeshBasicMaterial({ map: createSignTexture("FIRST AID", "MEDICAL KIT") }));
      sign.position.set(0, 1.49, 0.02);
      unit.add(sign);
      group.add(unit);
    };

    extinguisher(1.14, 6.42, Math.PI);
    extinguisher(-1.14, 22.84, Math.PI);
    storedBreathing(-1.14, 11.84, Math.PI);
    storedBreathing(10.4, 10.06, Math.PI);
    firstAid(1.14, 32.84, Math.PI);
    firstAid(-7.0, 9.94, Math.PI);
    storedBreathing(1.14, 46.34, Math.PI);
    return group;
  }

  // Dress both faces of every gate bulkhead so the wide pressure-wall wings
  // read as finished module walls instead of blank slabs. All repeated parts
  // are instanced across every hatch, keeping the extra detail to ~13 draw
  // calls for the whole station.
  function buildHatchWingDressing(specs) {
    const THREE = window.THREE;
    const group = new THREE.Group();
    group.name = "ISS_Hatch_Wing_Dressing";
    if (!specs || !specs.length) return group;
    const kit = getInteriorKitMaterials();
    const lockerMaterial = new THREE.MeshStandardMaterial({ color: 0x9da9a7, roughness: 0.66, metalness: 0.22 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x52656b, roughness: 0.5, metalness: 0.42 });
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x3f5058, roughness: 0.55, metalness: 0.35 });
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x4b7d97, roughness: 0.46, metalness: 0.52 });
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: createSignTexture("EQUIP", "STOWAGE"),
      transparent: true,
      side: THREE.DoubleSide
    });
    const ventMaterial = new THREE.MeshStandardMaterial({
      map: getVentTexture(),
      roughness: 0.7,
      metalness: 0.16,
      side: THREE.DoubleSide
    });
    const cautionMaterial = new THREE.MeshBasicMaterial({
      map: getCautionTexture(),
      transparent: true,
      side: THREE.DoubleSide
    });
    const gaugeFaceMaterial = new THREE.MeshBasicMaterial({ color: 0xe8ece6, side: THREE.DoubleSide });
    const gaugeNeedleMaterial = new THREE.MeshBasicMaterial({ color: 0x27373b, side: THREE.DoubleSide });
    const gaugeRimMaterial = new THREE.MeshStandardMaterial({ color: 0x849492, metalness: 0.45, roughness: 0.46, side: THREE.DoubleSide });

    const entries = {
      ribs: [], lockers: [], handles: [], labels: [], bags: [], vents: [],
      backCautions: [], backGauges: [], backGaugeRims: [], backNeedles: [],
      backRails: [], backRailMounts: [], backBolts: []
    };
    const add = (list, spec, position, rotation, scale) => {
      list.push({ spec, position, rotation: rotation || [0, 0, 0], scale: scale || [1, 1, 1] });
    };

    specs.forEach((spec) => {
      spec.wings.forEach((wing) => {
        const width = wing.end - wing.start;
        if (width < 0.4) return;
        const center = (wing.start + wing.end) / 2;
        [wing.start + 0.06, wing.end - 0.06].forEach((x) => {
          add(entries.ribs, spec, [x, 0.34, -0.025]);
          add(entries.ribs, spec, [x, 0.34, -0.055]);
        });
        if (width < 0.62) {
          add(entries.vents, spec, [center, 1.55, -0.02]);
          add(entries.vents, spec, [center, 1.55, -0.06], [0, Math.PI, 0]);
          return;
        }
        const count = Math.max(1, Math.min(3, Math.floor(width / 1.15)));
        for (let index = 0; index < count; index++) {
          const x = wing.start + ((index + 0.5) * width) / count;
          // Front face: equipment locker, handle and stowage placard.
          add(entries.lockers, spec, [x, 0.55, 0.04]);
          add(entries.handles, spec, [x, 0.55, 0.135]);
          add(entries.labels, spec, [x, 0.55, 0.125]);
          // Back face: soft stowage, return-air grille and placard.
          add(entries.bags, spec, [x, 1.18, -0.21], [0, 0, 0], [0.8, 0.8, 0.8]);
          add(entries.vents, spec, [x, 1.55, -0.06], [0, Math.PI, 0]);
          add(entries.labels, spec, [x, 0.55, -0.06], [0, Math.PI, 0]);
        }
      });

      // Mirror the gate hardware onto the back face so both approaches look
      // deliberate: caution plate, pressure gauge, handrails and frame bolts.
      add(entries.backCautions, spec, [1.0, 1.25, -0.145], [0, Math.PI, 0]);
      add(entries.backGauges, spec, [1.16, 0.63, -0.132], [0, Math.PI, 0]);
      add(entries.backGaugeRims, spec, [1.16, 0.63, -0.136], [0, Math.PI, 0]);
      add(entries.backNeedles, spec, [1.16, 0.646, -0.14], [0, Math.PI, -0.55]);
      [-1.38, 1.38].forEach((x) => {
        add(entries.backRails, spec, [x, 0.08, -0.13]);
        [-0.64, 0.8].forEach((y) => add(entries.backRailMounts, spec, [x, y, -0.08], [Math.PI / 2, 0, 0]));
      });
      for (let index = 0; index < 10; index++) {
        const y = -0.92 + index * 0.26;
        add(entries.backBolts, spec, [-1.5, y, -0.095]);
        add(entries.backBolts, spec, [1.5, y, -0.095]);
      }
    });

    const parent = new THREE.Object3D();
    const local = new THREE.Object3D();
    const matrix = new THREE.Matrix4();
    const addBatch = (list, geometry, material, name) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      list.forEach((entry, index) => {
        parent.position.set(entry.spec.x, 1.08, entry.spec.z);
        parent.rotation.set(0, entry.spec.rotation, 0);
        parent.updateMatrix();
        local.position.set(...entry.position);
        local.rotation.set(...entry.rotation);
        local.scale.set(...entry.scale);
        local.updateMatrix();
        matrix.multiplyMatrices(parent.matrix, local.matrix);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = name;
      group.add(mesh);
    };

    addBatch(entries.ribs, new THREE.BoxGeometry(0.03, 2.5, 0.024), darkMaterial, "HatchWing_Ribs");
    addBatch(entries.lockers, new THREE.BoxGeometry(0.5, 0.62, 0.16), lockerMaterial, "HatchWing_Lockers");
    addBatch(entries.handles, new THREE.BoxGeometry(0.2, 0.03, 0.03), trimMaterial, "HatchWing_Handles");
    addBatch(entries.labels, new THREE.PlaneGeometry(0.4, 0.095), labelMaterial, "HatchWing_Labels");
    addBatch(entries.bags, createSoftStowageGeometry(), kit.bag, "HatchWing_Stowage");
    addBatch(entries.vents, new THREE.PlaneGeometry(0.3, 0.24), ventMaterial, "HatchWing_Vents");
    addBatch(entries.backCautions, new THREE.PlaneGeometry(0.4, 0.11), cautionMaterial, "HatchBack_Caution");
    addBatch(entries.backGauges, new THREE.CircleGeometry(0.062, 18), gaugeFaceMaterial, "HatchBack_Gauges");
    addBatch(entries.backGaugeRims, new THREE.TorusGeometry(0.066, 0.008, 6, 18), gaugeRimMaterial, "HatchBack_GaugeRims");
    addBatch(entries.backNeedles, new THREE.BoxGeometry(0.006, 0.05, 0.004), gaugeNeedleMaterial, "HatchBack_GaugeNeedles");
    addBatch(entries.backRails, new THREE.CylinderGeometry(0.022, 0.022, 1.45, 8), railMaterial, "HatchBack_Rails");
    addBatch(entries.backRailMounts, new THREE.CylinderGeometry(0.028, 0.028, 0.1, 8), railMaterial, "HatchBack_RailMounts");
    addBatch(entries.backBolts, new THREE.SphereGeometry(0.022, 6, 4), darkMaterial, "HatchBack_Bolts");
    return group;
  }

  // ============================================================================
  // 4. ROOM WALLS, CONSOLES, HOLOTABLE & ROOM PROPS (ShipInterior.tsx)
  // ============================================================================
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
      this.activeModule = "DESTINY";
      this.isInteriorActive = true;
      this.isMoonLandingActive = false;

      // Dynamic animated elements
      this.stationEntries = {}; // stationId -> workstation materials and fault state
      this.moonLanding = null;
      this.sunFlare = null;
      this.stationInteractionGroup = null;
      this.issInteriorModelGroup = null;
      this.issInteriorModel = null;
      this.savedExteriorLights = null;

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

      // Interior lighting matching SpaceShip/src/components/game/ShipInterior.tsx.
      // Mobile relies more on ambient/hemisphere light and fewer dynamic point
      // lights, which is much cheaper for the forward renderer.
      this.group.add(new THREE.AmbientLight(0xffffff, window.isMobileDevice ? 0.4 : 0.27));
      this.group.add(new THREE.HemisphereLight(0xcfd9e2, 0x0a0f16, window.isMobileDevice ? 0.6 : 0.43));
      const dirLight = new THREE.DirectionalLight(0xffe9cf, 0.18);
      dirLight.position.set(5, 8, 3);
      this.group.add(dirLight);

      this.stationInteractionGroup = new THREE.Group();
      this.stationInteractionGroup.name = "ISS_Interior_Mission_Stations";
      this.issInteriorModelGroup = new THREE.Group();
      this.issInteriorModelGroup.name = "ISS_Interior_Constructed";
      this.issInteriorModelGroup.visible = true;
      interiorGroup.add(this.stationInteractionGroup);
      interiorGroup.add(this.issInteriorModelGroup);

      this.group = this.stationInteractionGroup;
      this._buildISSStationConsoles();
      this.group = interiorGroup;
      // Keep this compatibility property for the movement and camera code.
      // It now points to a constructed scene, never an imported GLB.
      this.issInteriorModel = this._buildISSInterior();
      this.issInteriorModelGroup.add(this.issInteriorModel);

      // Build Moon Landing Scene & SunFlare in main scene
      this.moonLanding = buildMoonLandingScene();
      this.scene.add(this.moonLanding.root);

      this.sunFlare = buildSunFlare();
      this.scene.add(this.sunFlare.group);

      // Build HUD compartment banner & live SVG Ship Minimap
      this._buildInteractiveHUD();
      this._buildMinimapDOM();
      this._applyISSStationLayout();

      console.log("🛰️ [ISS Interior] Constructed station modules and mission stations online.");
    }

    _setInteriorTitle(text) {
      const titleEl = document.getElementById("ship-room-title");
      if (titleEl) titleEl.textContent = text;
    }

    _buildISSInterior() {
      const THREE = window.THREE;
      const group = new THREE.Group();
      group.name = "ISS_Interior_Constructed_Modules";
      const step = 1.0;
      const cells = new Set();
      const key = (x, z) => `${x},${z}`;
      for (let x = -11; x <= 12; x++) {
        for (let z = -7; z <= 49; z++) {
          const cx = (x + 0.5) * step, cz = (z + 0.5) * step;
          if (ISS_WALK_ZONES.some((zone) => cx >= zone.xMin - 0.5 && cx <= zone.xMax + 0.5 && cz >= zone.zMin - 0.5 && cz <= zone.zMax + 0.5)) {
            cells.add(key(x, z));
          }
        }
      }
      const floors = [], ceilings = [], eastWest = [], northSouth = [], wallFixtures = [], wallSurfaces = [], chamferX = [], chamferZ = [];
      cells.forEach((cell) => {
        const [x, z] = cell.split(",").map(Number);
        const cx = (x + 0.5) * step, cz = (z + 0.5) * step;
        floors.push([cx, -0.09, cz]);
        ceilings.push([cx, 2.85, cz]);
        if (!cells.has(key(x - 1, z))) {
          eastWest.push([cx - step / 2, 1.38, cz]);
          chamferX.push({ x: cx - step / 2 + 0.19, z: cz, inward: 1 });
          wallSurfaces.push({ x: cx - step / 2 + 0.05, z: cz, rotation: Math.PI / 2 });
          if ((z + 100) % 3 === 0) wallFixtures.push({ x: cx - step / 2 - 0.05, z: cz, rotation: Math.PI / 2 });
        }
        // The outer end of Tranquility has an observation opening. Its
        // collision boundary remains inside the glazing.
        if (!cells.has(key(x + 1, z)) && !(cx + step / 2 === 12 && cz >= 7 && cz < 9)) {
          eastWest.push([cx + step / 2, 1.38, cz]);
          chamferX.push({ x: cx + step / 2 - 0.19, z: cz, inward: -1 });
          wallSurfaces.push({ x: cx + step / 2 - 0.05, z: cz, rotation: -Math.PI / 2 });
          if ((z + 100) % 3 === 1) wallFixtures.push({ x: cx + step / 2 + 0.05, z: cz, rotation: -Math.PI / 2 });
        }
        if (!cells.has(key(x, z - 1))) {
          northSouth.push([cx, 1.38, cz - step / 2]);
          chamferZ.push({ x: cx, z: cz - step / 2 + 0.19, inward: 1 });
          wallSurfaces.push({ x: cx, z: cz - step / 2 + 0.05, rotation: 0 });
          if ((x + 100) % 3 === 0) wallFixtures.push({ x: cx, z: cz - step / 2 - 0.05, rotation: 0 });
        }
        if (!cells.has(key(x, z + 1))) {
          northSouth.push([cx, 1.38, cz + step / 2]);
          chamferZ.push({ x: cx, z: cz + step / 2 - 0.19, inward: -1 });
          wallSurfaces.push({ x: cx, z: cz + step / 2 - 0.05, rotation: Math.PI });
          if ((x + 100) % 3 === 1) wallFixtures.push({ x: cx, z: cz + step / 2 + 0.05, rotation: Math.PI });
        }
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
      makePanels([step, 0.12, step], floors, 0xd0d6d7, createISSDeckTexture());
      const deckTracks = floors.filter(([x, , z]) => Math.abs(Math.round(z - 0.5)) % 3 === 1);
      makePanels([step * 0.94, 0.018, 0.035], deckTracks.map(([x, , z]) => [x, -0.022, z]), 0x405c6c, null);
      makePanels([step, 0.12, step], ceilings, 0xb8c2c5, textures.ceiling);
      makePanels([0.08, 2.9, step], eastWest, 0xaab6bc, textures.wall);
      makePanels([step, 2.9, 0.08], northSouth, 0xaab6bc, textures.wall);

      // Sloped panels soften the box-shaped collision shell into a modular
      // pressure-vessel interior while staying outside the walkable center.
      const addChamfers = (segments, alongX) => {
        const geometry = new THREE.BoxGeometry(alongX ? 0.55 : step, 0.08, alongX ? step : 0.55);
        const material = new THREE.MeshStandardMaterial({ map: textures.corner, color: 0xb9c4bf, roughness: 0.78, metalness: 0.16 });
        const mesh = new THREE.InstancedMesh(geometry, material, segments.length * 2);
        const transform = new THREE.Object3D();
        segments.forEach((segment, index) => {
          [0.25, 2.55].forEach((height, layer) => {
            transform.position.set(segment.x, height, segment.z);
            transform.rotation.set(alongX ? 0 : segment.inward * (layer ? -1 : 1) * Math.PI / 4, 0,
              alongX ? segment.inward * (layer ? 1 : -1) * Math.PI / 4 : 0);
            transform.updateMatrix();
            mesh.setMatrixAt(index * 2 + layer, transform.matrix);
          });
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        group.add(mesh);
      };
      addChamfers(chamferX, true);
      addChamfers(chamferZ, false);
      const cornerRuns = [...chamferX.map((segment) => ({ ...segment, alongX: true })),
        ...chamferZ.map((segment) => ({ ...segment, alongX: false }))];
      const cornerPipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.96, 6),
        new THREE.MeshStandardMaterial({ color: 0x667f86, roughness: 0.58, metalness: 0.36 }), cornerRuns.length * 2);
      const cornerTransform = new THREE.Object3D();
      cornerRuns.forEach((segment, index) => {
        [0.31, 2.50].forEach((height, layer) => {
          cornerTransform.position.set(segment.x + (segment.alongX ? segment.inward * 0.08 : 0), height,
            segment.z + (segment.alongX ? 0 : segment.inward * 0.08));
          cornerTransform.rotation.set(segment.alongX ? Math.PI / 2 : 0, 0, segment.alongX ? 0 : Math.PI / 2);
          cornerTransform.updateMatrix();
          cornerPipes.setMatrixAt(index * 2 + layer, cornerTransform.matrix);
        });
      });
      cornerPipes.instanceMatrix.needsUpdate = true;
      cornerPipes.frustumCulled = false;
      group.add(cornerPipes);

      // Rails and structural seams follow the same outer boundary as the
      // collision volumes, leaving junctions open between connected modules.
      const handrails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.026, 0.026, step * 0.96, 8),
        new THREE.MeshStandardMaterial({ color: 0x48758d, roughness: 0.54, metalness: 0.38 }), wallSurfaces.length * 2);
      const railTransform = new THREE.Object3D();
      wallSurfaces.forEach((surface, index) => {
        [0.95, 2.28].forEach((height, row) => {
          railTransform.position.set(surface.x + Math.sin(surface.rotation) * 0.13, height,
            surface.z + Math.cos(surface.rotation) * 0.13);
          railTransform.rotation.set(0, surface.rotation, Math.PI / 2);
          railTransform.updateMatrix();
          handrails.setMatrixAt(index * 2 + row, railTransform.matrix);
        });
      });
      handrails.instanceMatrix.needsUpdate = true;
      handrails.frustumCulled = false;
      group.add(handrails);

      // ISS labs use the perimeter for equipment and cargo on all sides.
      // Instancing the photographic rack variants keeps the dense treatment
      // affordable and leaves the modelled fixtures and handrails in front.
      const atlas = getPayloadAtlasState();
      const surfaceGroups = [[], [], [], []];
      wallSurfaces.forEach((surface, index) => {
        if (index % 7 === 0) return; // leave a few structural panels visible
        const hash = Math.abs(Math.round(surface.x * 17 + surface.z * 29 + surface.rotation * 13));
        [0, 1].forEach((row) => {
          // Zarya and Zvezda carry more fabric stowage and systems hardware
          // than the US laboratory racks at the other end of the station.
          const variant = surface.z > 12 ? 2 + ((hash + row) % 2) : (hash + row) % surfaceGroups.length;
          surfaceGroups[variant].push({ ...surface, y: 0.88 + row * 1.04, depth: 0.07 + ((hash + row) % 4) * 0.045 });
        });
      });
      // Shallow, individually fitted payload drawers sit over the pressure
      // shell. Their varied depths give the photographic faces real edges.
      const fittedPanels = surfaceGroups.flat();
      const panelBodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.92, 1.03, 1),
        new THREE.MeshStandardMaterial({ color: 0x9ca9a8, roughness: 0.78, metalness: 0.2 }), fittedPanels.length);
      const panelTransform = new THREE.Object3D();
      fittedPanels.forEach((surface, index) => {
        panelTransform.position.set(surface.x + Math.sin(surface.rotation) * surface.depth / 2, surface.y,
          surface.z + Math.cos(surface.rotation) * surface.depth / 2);
        panelTransform.rotation.set(0, surface.rotation, 0);
        panelTransform.scale.set(1, 1, surface.depth);
        panelTransform.updateMatrix();
        panelBodies.setMatrixAt(index, panelTransform.matrix);
      });
      panelBodies.instanceMatrix.needsUpdate = true;
      panelBodies.frustumCulled = false;
      group.add(panelBodies);
      const rackUprights = wallSurfaces.filter((surface, index) => index % 2 === 0);
      const rackRails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 2.18, 0.055),
        new THREE.MeshStandardMaterial({ color: 0x6c8185, roughness: 0.55, metalness: 0.35 }), rackUprights.length);
      const uprightTransform = new THREE.Object3D();
      rackUprights.forEach((surface, index) => {
        const across = -0.46, outward = 0.24;
        uprightTransform.position.set(surface.x + Math.cos(surface.rotation) * across + Math.sin(surface.rotation) * outward, 1.4,
          surface.z - Math.sin(surface.rotation) * across + Math.cos(surface.rotation) * outward);
        uprightTransform.rotation.set(0, surface.rotation, 0);
        uprightTransform.updateMatrix();
        rackRails.setMatrixAt(index, uprightTransform.matrix);
      });
      rackRails.instanceMatrix.needsUpdate = true;
      rackRails.frustumCulled = false;
      group.add(rackRails);
      const surfaceGeometry = new THREE.PlaneGeometry(0.88, 0.99);
      surfaceGroups.forEach((surfaces, variant) => {
        if (!surfaces.length) return;
        const mesh = new THREE.InstancedMesh(surfaceGeometry, atlas.materials[variant], surfaces.length);
        const transform = new THREE.Object3D();
        surfaces.forEach((surface, index) => {
          transform.position.set(surface.x + Math.sin(surface.rotation) * (surface.depth + 0.006), surface.y,
            surface.z + Math.cos(surface.rotation) * (surface.depth + 0.006));
          transform.rotation.set(0, surface.rotation, 0);
          transform.updateMatrix();
          mesh.setMatrixAt(index, transform.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.visible = atlas.loaded;
        if (!atlas.loaded) atlas.surfaces.push(mesh);
        group.add(mesh);
      });

      // Overhead equipment is normal aboard the ISS; a clear center aisle and
      // the existing light fixtures keep it navigable in this walking version.
      const overheadGroups = [[], [], [], []];
      ceilings.forEach(([x, , z], index) => {
        if (index % 9 === 0) return;
        const hash = Math.abs(Math.round(x * 11 + z * 7));
        overheadGroups[z > 12 ? 2 + (hash % 2) : hash % overheadGroups.length].push([x, z]);
      });
      const overheadGeometry = new THREE.PlaneGeometry(0.9, 0.9);
      overheadGroups.forEach((surfaces, variant) => {
        if (!surfaces.length) return;
        const mesh = new THREE.InstancedMesh(overheadGeometry, atlas.materials[variant], surfaces.length);
        const transform = new THREE.Object3D();
        surfaces.forEach(([x, z], index) => {
          transform.position.set(x, 2.78, z);
          transform.rotation.set(Math.PI / 2, 0, 0);
          transform.updateMatrix();
          mesh.setMatrixAt(index, transform.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.frustumCulled = false;
        mesh.visible = atlas.loaded;
        if (!atlas.loaded) atlas.surfaces.push(mesh);
        group.add(mesh);
      });

      group.add(buildEquipmentCables(wallSurfaces.filter((surface, index) => index % 7 !== 0), ceilings));
      group.add(buildHatchThresholds());
      group.add(buildUtilityRun(wallSurfaces));
      group.add(buildModuleAccents(wallSurfaces));
      group.add(buildEmergencyStations());

      // Instrument racks and strapped cargo line the perimeter on every side,
      // with their backs inside the wall so the center route stays clear.
      const rackFixtures = [], bagFixtures = [];
      wallFixtures.forEach((fixture, index) => {
        rackFixtures.push({ position: [fixture.x, 0, fixture.z], rotation: [0, fixture.rotation, 0], label: `ISPR-${String(index + 1).padStart(2, "0")}` });
        if (index % 2 === 0) {
          bagFixtures.push({ position: [fixture.x, 1.88, fixture.z], rotation: [0, fixture.rotation, 0], scale: 0.7, offset: 0.22 });
        }
        if (fixture.z > 12 && index % 3 !== 1) {
          bagFixtures.push({ position: [fixture.x, 0.67, fixture.z], rotation: [0, fixture.rotation, 0], scale: 0.88, offset: 0.22 });
          if (index % 3 === 0) bagFixtures.push({ position: [fixture.x, 1.15, fixture.z], rotation: [0, fixture.rotation, 0], scale: 0.75, offset: 0.22 });
        }
      });
      wallSurfaces.forEach((surface, index) => {
        const seed = Math.abs(Math.round(surface.x * 41 + surface.z * 73 + surface.rotation * 17));
        if (index % 7 === 0 || index % 4 === 1 || index % 5 === 3 || seed % 4 !== 0) return;
        const nearConsole = Object.values(ISS_STATION_LAYOUT).some(({ position }) =>
          Math.hypot(surface.x - position[0], surface.z - position[2]) < 0.95
        );
        if (nearConsole) return;
        bagFixtures.push({
          position: [surface.x, 0.45 + (seed % 3) * 0.48, surface.z],
          rotation: [0, surface.rotation, ((seed % 5) - 2) * 0.035],
          scale: 0.72 + (seed % 3) * 0.07,
          offset: 0.26
        });
      });

      const rimMat = new THREE.MeshStandardMaterial({ color: 0x76858e, metalness: 0.58, roughness: 0.38 });
      const innerRimMat = new THREE.MeshStandardMaterial({ color: 0xd2dce0, metalness: 0.25, roughness: 0.5 });
      const statusMat = new THREE.MeshStandardMaterial({ color: 0x65e6ba, emissive: 0x28b68a, emissiveIntensity: 0.8 });
      // The bulkhead around each hatch used to be a flat, untextured slab and
      // read as an unfinished wall beside the racks. Tie it into the module
      // panelling and add an explicit structural frame.
      const hatchWallMap = textures.wall.clone();
      hatchWallMap.wrapS = hatchWallMap.wrapT = THREE.RepeatWrapping;
      hatchWallMap.repeat.set(0.34, 0.34);
      hatchWallMap.needsUpdate = true;
      const hatchWallMaterial = new THREE.MeshStandardMaterial({
        map: hatchWallMap,
        color: 0xc4cdcc,
        roughness: 0.72,
        metalness: 0.17,
        side: THREE.DoubleSide
      });
      const hatchBulkheadMat = new THREE.MeshStandardMaterial({ color: 0x7f8e92, roughness: 0.56, metalness: 0.34 });
      const hatchLeafMat = new THREE.MeshStandardMaterial({ color: 0x9da9a8, roughness: 0.58, metalness: 0.3 });
      const hatchHardwareMat = new THREE.MeshStandardMaterial({ color: 0x51656d, roughness: 0.46, metalness: 0.5 });
      const hatchRailMat = new THREE.MeshStandardMaterial({ color: 0x4b7d97, roughness: 0.46, metalness: 0.52 });
      const hatchWingSpecs = [];
      const hatch = (x, z, alongX, code, label) => {
        const portal = new THREE.Group();
        portal.position.set(x, 1.08, z);
        if (alongX) portal.rotation.y = Math.PI / 2;
        const halfWidth = alongX ? 2 : 1.55;
        const gateCross = alongX ? z : x;
        const crossSpan = getHatchCrossSpan({
          axis: alongX ? "x" : "z",
          at: alongX ? x : z,
          center: gateCross,
          halfWidth
        });
        // Extend the pressure wall from the central hatch bay out to the
        // module side walls. Local +X becomes world -Z when an X-axis gate is
        // rotated into place, so mirror the span in that orientation.
        // Keep the wall just wide enough to contain the 3.1 m structural frame;
        // anything wider is a wing that runs out to the module side wall.
        const minShellHalf = 1.56;
        let shellMinX;
        let shellMaxX;
        if (alongX) {
          shellMaxX = Math.max(minShellHalf, gateCross - crossSpan[0]);
          shellMinX = -Math.max(minShellHalf, crossSpan[1] - gateCross);
        } else {
          shellMinX = -Math.max(minShellHalf, gateCross - crossSpan[0]);
          shellMaxX = Math.max(minShellHalf, crossSpan[1] - gateCross);
        }
        const wingGap = 0.08;
        const wings = [];
        if (-1.5 - wingGap - (shellMinX + wingGap) > 0.45) {
          wings.push({ start: shellMinX + wingGap, end: -1.5 - wingGap });
        }
        if (shellMaxX - wingGap - (1.5 + wingGap) > 0.45) {
          wings.push({ start: 1.5 + wingGap, end: shellMaxX - wingGap });
        }
        hatchWingSpecs.push({ x, z, rotation: alongX ? Math.PI / 2 : 0, wings });
        const shell = new THREE.Shape();
        shell.moveTo(shellMinX, -1.08);
        shell.lineTo(shellMaxX, -1.08);
        shell.lineTo(shellMaxX, 1.77);
        shell.lineTo(shellMinX, 1.77);
        shell.closePath();
        const opening = new THREE.Path();
        opening.absarc(0, 0, 1.08, 0, Math.PI * 2, true);
        shell.holes.push(opening);
        const pressureWall = new THREE.Mesh(new THREE.ShapeGeometry(shell, 32), hatchWallMaterial);
        pressureWall.position.z = -0.04;
        portal.add(pressureWall);
        // Finished bulkhead frame: side posts, head and sill hide the raw
        // pressure-wall edges and make the hatch sit in a real structural bay.
        [
          { size: [0.1, 2.9, 0.14], position: [-1.5, 0.34, -0.02] },
          { size: [0.1, 2.9, 0.14], position: [1.5, 0.34, -0.02] },
          { size: [3.1, 0.1, 0.14], position: [0, 1.79, -0.02] },
          { size: [3.1, 0.1, 0.14], position: [0, -1.1, -0.02] }
        ].forEach((piece) => {
          const frame = new THREE.Mesh(new THREE.BoxGeometry(...piece.size), hatchBulkheadMat);
          frame.position.set(...piece.position);
          portal.add(frame);
        });
        const frameBolts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 6, 4),
          hatchHardwareMat, 20);
        const frameBoltTransform = new THREE.Object3D();
        for (let index = 0; index < 10; index++) {
          frameBoltTransform.position.set(-1.5, -0.92 + index * 0.26, 0.055);
          frameBoltTransform.updateMatrix();
          frameBolts.setMatrixAt(index, frameBoltTransform.matrix);
          frameBoltTransform.position.set(1.5, -0.92 + index * 0.26, 0.055);
          frameBoltTransform.updateMatrix();
          frameBolts.setMatrixAt(10 + index, frameBoltTransform.matrix);
        }
        frameBolts.instanceMatrix.needsUpdate = true;
        frameBolts.frustumCulled = false;
        portal.add(frameBolts);
        // Vertical translation handrails flank the opening so the finished
        // bulkhead has somewhere for a crewmember to hold while working a hatch.
        [-1.38, 1.38].forEach((side) => {
          const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 8), hatchRailMat);
          rail.position.set(side, 0.08, 0.13);
          portal.add(rail);
          [-0.64, 0.8].forEach((y) => {
            const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.1, 8), hatchRailMat);
            mount.rotation.x = Math.PI / 2;
            mount.position.set(side, y, 0.08);
            portal.add(mount);
          });
        });
        const outer = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.085, 8, 32), rimMat);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.035, 8, 32), innerRimMat);
        portal.add(outer, inner);
        const gasket = new THREE.Mesh(new THREE.TorusGeometry(1.095, 0.025, 8, 32),
          new THREE.MeshStandardMaterial({ color: 0x273d49, roughness: 0.75 }));
        gasket.position.z = 0.075;
        portal.add(gasket);
        const boltGeometry = new THREE.SphereGeometry(0.027, 6, 4);
        const boltMaterial = new THREE.MeshStandardMaterial({ color: 0x465962, metalness: 0.65, roughness: 0.35 });
        const bolts = new THREE.InstancedMesh(boltGeometry, boltMaterial, 12);
        const hatchTransform = new THREE.Object3D();
        for (let index = 0; index < 12; index++) {
          const angle = index * Math.PI / 6;
          hatchTransform.position.set(Math.cos(angle) * 1.22, Math.sin(angle) * 1.22, 0.08);
          hatchTransform.updateMatrix();
          bolts.setMatrixAt(index, hatchTransform.matrix);
        }
        bolts.instanceMatrix.needsUpdate = true;
        bolts.frustumCulled = false;
        portal.add(bolts);
        const latches = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.07, 0.10),
          new THREE.MeshStandardMaterial({ color: 0x566970, roughness: 0.52, metalness: 0.42 }), 8);
        for (let index = 0; index < 8; index++) {
          const angle = Math.PI / 8 + index * Math.PI / 4;
          hatchTransform.position.set(Math.cos(angle) * 1.22, Math.sin(angle) * 1.22, 0.08);
          hatchTransform.rotation.set(0, 0, angle);
          hatchTransform.updateMatrix();
          latches.setMatrixAt(index, hatchTransform.matrix);
        }
        latches.instanceMatrix.needsUpdate = true;
        latches.frustumCulled = false;
        portal.add(latches);
        hatchTransform.rotation.set(0, 0, 0);
        const bulkheadMat = new THREE.MeshStandardMaterial({ color: 0xa8b8bf, metalness: 0.25, roughness: 0.6 });
        const jambs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 2.55, 0.24), bulkheadMat, 2);
        const grips = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8),
          new THREE.MeshStandardMaterial({ color: 0x4e7c94, roughness: 0.54, metalness: 0.35 }), 2);
        [-1.33, 1.33].forEach((side, index) => {
          hatchTransform.position.set(side, 0.02, 0);
          hatchTransform.updateMatrix();
          jambs.setMatrixAt(index, hatchTransform.matrix);
          hatchTransform.position.set(side, 0.05, 0.17);
          hatchTransform.updateMatrix();
          grips.setMatrixAt(index, hatchTransform.matrix);
        });
        jambs.instanceMatrix.needsUpdate = true;
        grips.instanceMatrix.needsUpdate = true;
        jambs.frustumCulled = false;
        grips.frustumCulled = false;
        portal.add(jambs, grips);
        const header = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 0.24), bulkheadMat);
        header.position.set(0, 1.25, 0);
        portal.add(header);
        const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.07), statusMat);
        indicator.position.set(0.86, 0.9, 0);
        portal.add(indicator);
        const caution = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.11),
          new THREE.MeshBasicMaterial({ map: getCautionTexture(), transparent: true, side: THREE.DoubleSide }));
        caution.position.set(1.0, 1.25, 0.145);
        portal.add(caution);
        const gaugeFace = new THREE.Mesh(new THREE.CircleGeometry(0.062, 18),
          new THREE.MeshBasicMaterial({ color: 0xe8ece6 }));
        gaugeFace.position.set(1.16, 0.63, 0.132);
        portal.add(gaugeFace);
        const gaugeRim = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.008, 6, 18), rimMat);
        gaugeRim.position.set(1.16, 0.63, 0.136);
        portal.add(gaugeRim);
        const gaugeNeedle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.004),
          new THREE.MeshBasicMaterial({ color: 0x27373b }));
        gaugeNeedle.position.set(1.16, 0.646, 0.14);
        gaugeNeedle.rotation.z = -0.55;
        portal.add(gaugeNeedle);
        const signMaterial = new THREE.MeshBasicMaterial({ map: createSignTexture(code, label), transparent: true });
        const signs = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.78, 0.16), signMaterial, 2);
        [0.14, -0.14].forEach((depth, index) => {
          hatchTransform.position.set(0, 1.25, depth);
          hatchTransform.rotation.set(0, index ? Math.PI : 0, 0);
          hatchTransform.updateMatrix();
          signs.setMatrixAt(index, hatchTransform.matrix);
        });
        signs.instanceMatrix.needsUpdate = true;
        signs.frustumCulled = false;
        portal.add(signs);
        if (!alongX && (code === "NODE 1" || code === "NODE 2")) {
          const leaf = new THREE.Group();
          leaf.position.set(-1.42, 0, -0.95);
          leaf.rotation.y = Math.PI / 2;
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.075, 32), hatchLeafMat);
          plate.rotation.x = Math.PI / 2;
          leaf.add(plate);
          const edgeRim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.032, 8, 36), hatchHardwareMat);
          edgeRim.position.z = 0.042;
          leaf.add(edgeRim);
          const recessedPanel = new THREE.Mesh(new THREE.CylinderGeometry(0.79, 0.79, 0.018, 32),
            new THREE.MeshStandardMaterial({ color: 0x8c9998, roughness: 0.66, metalness: 0.26 }));
          recessedPanel.rotation.x = Math.PI / 2;
          recessedPanel.position.z = 0.049;
          leaf.add(recessedPanel);
          const seal = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.04, 8, 32), rimMat);
          seal.position.z = 0.045;
          leaf.add(seal);
          // Radial stiffeners and latch dogs make the leaf read as a real
          // pressure door rather than a blank white disc.
          [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4].forEach((angle) => {
            const rib = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.026, 0.02), hatchHardwareMat);
            rib.position.set(Math.cos(angle) * 0.47, Math.sin(angle) * 0.47, 0.064);
            rib.rotation.z = angle;
            leaf.add(rib);
          });
          const latchDogs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.045, 0.032),
            hatchHardwareMat, 8);
          const latchTransform = new THREE.Object3D();
          for (let index = 0; index < 8; index++) {
            const angle = Math.PI / 8 + index * Math.PI / 4;
            latchTransform.position.set(Math.cos(angle) * 0.855, Math.sin(angle) * 0.855, 0.066);
            latchTransform.rotation.set(0, 0, angle);
            latchTransform.updateMatrix();
            latchDogs.setMatrixAt(index, latchTransform.matrix);
          }
          latchDogs.instanceMatrix.needsUpdate = true;
          latchDogs.frustumCulled = false;
          leaf.add(latchDogs);
          const windowRim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 24), rimMat);
          windowRim.position.set(0, 0.18, 0.062);
          leaf.add(windowRim);
          const windowGlass = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24),
            new THREE.MeshStandardMaterial({ color: 0x263c45, roughness: 0.22, metalness: 0.4 }));
          windowGlass.position.set(0, 0.18, 0.067);
          leaf.add(windowGlass);
          const handwheel = new THREE.Group();
          handwheel.position.set(0, -0.3, 0.088);
          const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.019, 8, 22), hatchHardwareMat);
          handwheel.add(wheelRim);
          [0, Math.PI / 2].forEach((angle) => {
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.018, 0.018), hatchHardwareMat);
            spoke.rotation.z = angle;
            handwheel.add(spoke);
          });
          const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.045, 12), hatchHardwareMat);
          wheelHub.rotation.x = Math.PI / 2;
          handwheel.add(wheelHub);
          leaf.add(handwheel);
          const caution = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.08),
            new THREE.MeshBasicMaterial({ map: createSignTexture("HATCH", "PRESSURE SEAL") }));
          caution.position.set(0, -0.57, 0.07);
          leaf.add(caution);
          // Hinge pin and arms connect the leaf to the structural jamb instead
          // of leaving it visually suspended in the module.
          const hingePin = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.86, 10), hatchHardwareMat);
          hingePin.position.set(-0.92, 0, 0);
          leaf.add(hingePin);
          [-0.72, 0.72].forEach((y) => {
            const hingeArm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.095, 0.13), hatchHardwareMat);
            hingeArm.position.set(-0.845, y, 0.015);
            leaf.add(hingeArm);
          });
          portal.add(leaf);
        }
        group.add(portal);
      };
      hatch(0, -0.4, false, "NODE 2", "HARMONY");
      hatch(0, 6.6, false, "NODE 1", "UNITY");
      hatch(0, 12, false, "FGB", "ZARYA");
      hatch(0, 23, false, "FGB", "ZARYA TRANSFER");
      hatch(0, 33, false, "SM", "ZVEZDA");
      hatch(0, 46.5, false, "AFT", "DOCKING PORT");
      hatch(3.5, -3.8, true, "LAB", "KIBO");
      hatch(3.5, 8, true, "NODE 3", "TRANQUILITY");
      hatch(-3.2, -3.8, true, "LAB", "COLUMBUS");
      hatch(-4.5, 8.5, true, "AIRLOCK", "QUEST");
      hatch(-7.2, 8.5, true, "QUEST", "CREW LOCK");
      group.add(buildHatchWingDressing(hatchWingSpecs));

      const modulePlacard = (text, description, position, rotation) => {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.28),
          new THREE.MeshBasicMaterial({ map: createSignTexture(text, description), transparent: true, side: THREE.DoubleSide }));
        sign.position.set(...position);
        sign.rotation.y = rotation;
        group.add(sign);
      };
      modulePlacard("NASA", "DESTINY LABORATORY", [-1.48, 2.35, 4], Math.PI / 2);
      modulePlacard("ESA", "COLUMBUS LABORATORY", [-4.7, 2.35, -5.45], 0);
      modulePlacard("JAXA", "KIBO LABORATORY", [7, 2.35, -5.45], 0);
      modulePlacard("NODE 1", "UNITY", [-3.7, 2.35, 11.45], Math.PI);
      modulePlacard("QUEST", "EQUIPMENT LOCK", [-6, 2.35, 6.55], 0);
      modulePlacard("NODE 3", "TRANQUILITY", [5, 2.35, 10.45], Math.PI);
      modulePlacard("FGB", "ZARYA", [1.48, 2.35, 18], -Math.PI / 2);
      modulePlacard("SM", "ZVEZDA", [1.48, 2.35, 40], -Math.PI / 2);

      // Radial ports in the reference connect downward to other modules.
      // They are represented as closed deck hatches in the walking layout.
      const radialPort = (z, name) => {
        const hatchGroup = new THREE.Group();
        hatchGroup.position.set(0, -0.005, z);
        const cover = new THREE.Mesh(new THREE.CircleGeometry(0.57, 32),
          new THREE.MeshStandardMaterial({ color: 0x9eafb4, roughness: 0.72, metalness: 0.25 }));
        cover.rotation.x = -Math.PI / 2;
        hatchGroup.add(cover);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.035, 8, 32), rimMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.012;
        hatchGroup.add(ring);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.13),
          new THREE.MeshBasicMaterial({ map: createSignTexture(name, "RADIAL PORT") }));
        label.rotation.x = -Math.PI / 2;
        label.position.y = 0.02;
        hatchGroup.add(label);
        group.add(hatchGroup);
      };
      radialPort(18, "RASSVET");
      radialPort(32, "NAUKA");

      // Cupola-inspired seven-pane observation window at the end of the
      // Tranquility branch. A separate view sphere supplies the Earth vista.
      const cupola = new THREE.Group();
      cupola.name = "Cupola_Observation_Window";
      cupola.position.set(11.96, 1.45, 8);
      cupola.rotation.y = -Math.PI / 2;
      const windowFrame = new THREE.MeshStandardMaterial({ color: 0x687c88, metalness: 0.55, roughness: 0.4 });
      const glass = new THREE.MeshBasicMaterial({ color: 0xaacde1, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
      const cupolaPanel = new THREE.Shape();
      cupolaPanel.moveTo(-1, -1.45);
      cupolaPanel.lineTo(1, -1.45);
      cupolaPanel.lineTo(1, 1.45);
      cupolaPanel.lineTo(-1, 1.45);
      cupolaPanel.closePath();
      const centerHole = new THREE.Path();
      centerHole.absarc(0, 0, 0.35, 0, Math.PI * 2, true);
      cupolaPanel.holes.push(centerHole);
      const sideWindows = [];
      for (let index = 0; index < 6; index++) {
        const start = index * Math.PI / 3 + 0.055;
        const end = (index + 1) * Math.PI / 3 - 0.055;
        const point = (radius, angle) => new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
        const corners = [point(0.46, start), point(0.96, start), point(0.96, end), point(0.46, end)];
        sideWindows.push(corners);
        const hole = new THREE.Path();
        corners.slice().reverse().forEach((corner, cornerIndex) => {
          if (cornerIndex === 0) hole.moveTo(corner.x, corner.y);
          else hole.lineTo(corner.x, corner.y);
        });
        hole.closePath();
        cupolaPanel.holes.push(hole);
      }
      const windowPanel = new THREE.Mesh(new THREE.ShapeGeometry(cupolaPanel, 32),
        new THREE.MeshStandardMaterial({ color: 0xa8b9c0, roughness: 0.6, metalness: 0.25, side: THREE.DoubleSide }));
      windowPanel.position.z = -0.025;
      cupola.add(windowPanel);
      const centerRim = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.045, 8, 32), windowFrame);
      centerRim.position.z = -0.35;
      cupola.add(centerRim);
      const centerGlass = new THREE.Mesh(new THREE.CircleGeometry(0.35, 32), glass);
      centerGlass.position.z = -0.35;
      cupola.add(centerGlass);
      sideWindows.forEach((corners) => {
        // The central pane sits farther outside the module, giving the six
        // side panes the sloped profile of the observation cupola.
        const vertices = corners.map((corner, index) => new THREE.Vector3(corner.x, corner.y, index === 0 || index === 3 ? -0.35 : 0));
        const paneGeometry = new THREE.BufferGeometry();
        paneGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flatMap((point) => [point.x, point.y, point.z]), 3));
        paneGeometry.setIndex([0, 1, 2, 0, 2, 3]);
        paneGeometry.computeVertexNormals();
        const pane = new THREE.Mesh(paneGeometry, glass);
        cupola.add(pane);
        vertices.forEach((start, index) => {
          const end = vertices[(index + 1) % vertices.length];
          const direction = new THREE.Vector3().subVectors(end, start);
          const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, direction.length(), 8), windowFrame);
          frame.position.copy(start).add(end).multiplyScalar(0.5);
          frame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
          cupola.add(frame);
        });
      });
      const windowSign = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.16), new THREE.MeshBasicMaterial({ map: createSignTexture("CUPOLA", "EARTH OBSERVATION"), transparent: true, side: THREE.DoubleSide }));
      windowSign.position.set(0, 1.2, 0.02);
      cupola.add(windowSign);

      // Finish the cupola as a padded observation bay rather than a flat pane:
      // structural sill, interior handrails, a non-slip ledge and a subtle
      // reflection layer on the central glass.
      const sillMaterial = new THREE.MeshStandardMaterial({ color: 0x35444d, roughness: 0.62, metalness: 0.28 });
      const railMaterial = new THREE.MeshStandardMaterial({ color: 0x4b7d97, roughness: 0.46, metalness: 0.52 });
      [
        { size: [2.1, 0.11, 0.14], position: [0, 1.4, 0.085] },
        { size: [2.1, 0.11, 0.14], position: [0, -1.4, 0.085] },
        { size: [0.11, 2.9, 0.14], position: [-1.0, 0, 0.085] },
        { size: [0.11, 2.9, 0.14], position: [1.0, 0, 0.085] }
      ].forEach((piece) => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(...piece.size), sillMaterial);
        frame.position.set(...piece.position);
        cupola.add(frame);
      });
      // Dark padded reveal around the seven panes keeps the white pressure
      // wall from reading as a flat cut-out and gives the window a real depth.
      const surroundMaterial = new THREE.MeshStandardMaterial({ color: 0x36444c, roughness: 0.58, metalness: 0.3 });
      [
        { size: [2.14, 0.095, 0.16], position: [0, 1.025, 0.19] },
        { size: [2.14, 0.095, 0.16], position: [0, -1.025, 0.19] },
        { size: [0.095, 2.15, 0.16], position: [-1.025, 0, 0.19] },
        { size: [0.095, 2.15, 0.16], position: [1.025, 0, 0.19] }
      ].forEach((piece) => {
        const reveal = new THREE.Mesh(new THREE.BoxGeometry(...piece.size), surroundMaterial);
        reveal.position.set(...piece.position);
        cupola.add(reveal);
      });
      const headBumper = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.13, 0.2),
        new THREE.MeshStandardMaterial({ color: 0x2c363d, roughness: 0.7, metalness: 0.2 }));
      headBumper.position.set(0, 1.16, 0.25);
      cupola.add(headBumper);
      const observationLedge = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.075, 0.34), sillMaterial);
      observationLedge.position.set(0, -1.36, 0.22);
      cupola.add(observationLedge);
      [-0.86, 0.86].forEach((x) => {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.52, 8), railMaterial);
        rail.position.set(x, 0, 0.22);
        cupola.add(rail);
        [-0.76, 0.76].forEach((y) => {
          const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8), railMaterial);
          mount.rotation.x = Math.PI / 2;
          mount.position.set(x, y, 0.175);
          cupola.add(mount);
        });
      });
      const crossRail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.74, 8), railMaterial);
      crossRail.rotation.z = Math.PI / 2;
      crossRail.position.set(0, 1.18, 0.22);
      cupola.add(crossRail);
      const reflection = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.68),
        new THREE.MeshBasicMaterial({
          map: getGlassReflectionTexture(),
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        }));
      reflection.position.set(0, 0, -0.298);
      cupola.add(reflection);
      const cupolaLamp = new THREE.PointLight(0xbfe4ff, 0.35, 4.2, 1.8);
      cupolaLamp.position.set(0, 0.1, 0.7);
      cupola.add(cupolaLamp);
      group.add(cupola);

      const earthTexture = new THREE.TextureLoader().load(window.isMobileDevice
        ? "textures/earth/blue-marble-2048.jpg"
        : "textures/earth/earth_day_5400.jpg");
      earthTexture.encoding = THREE.sRGBEncoding;
      earthTexture.anisotropy = window.isMobileDevice ? 2 : 8;
      const earthSegments = window.isMobileDevice ? [48, 36] : [72, 54];
      const earth = new THREE.Mesh(new THREE.SphereGeometry(11.5, earthSegments[0], earthSegments[1]),
        new THREE.MeshBasicMaterial({ map: earthTexture }));
      // Push the planet far enough away that the limb and the black of space
      // remain visible around it through the cupola panes.
      earth.position.set(50, 2.0, 8.5);
      earth.rotation.y = 1.4;
      group.add(earth);
      const cloudTexture = new THREE.TextureLoader().load(window.isMobileDevice
        ? "textures/earth/earth_clouds_1024.png"
        : "textures/earth/earth_clouds_2048.png");
      cloudTexture.encoding = THREE.sRGBEncoding;
      const clouds = new THREE.Mesh(new THREE.SphereGeometry(11.54, earthSegments[0], earthSegments[1]),
        new THREE.MeshBasicMaterial({ map: cloudTexture, transparent: true, opacity: 0.68, depthWrite: false }));
      clouds.position.copy(earth.position);
      clouds.rotation.y = earth.rotation.y;
      group.add(clouds);
      // Fresnel rim gives the Earth a believable atmospheric limb without a
      // full post-processing pass; the interior stays lightweight on mobile.
      const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(11.7, window.isMobileDevice ? 32 : 48, window.isMobileDevice ? 24 : 32),
        new THREE.ShaderMaterial({
          uniforms: { glowColor: { value: new THREE.Color(0x4d9dff) } },
          vertexShader: [
            "varying vec3 vNormal;",
            "varying vec3 vView;",
            "void main() {",
            "  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);",
            "  vNormal = normalize(normalMatrix * normal);",
            "  vView = normalize(-mvPosition.xyz);",
            "  gl_Position = projectionMatrix * mvPosition;",
            "}"
          ].join("\n"),
          fragmentShader: [
            "uniform vec3 glowColor;",
            "varying vec3 vNormal;",
            "varying vec3 vView;",
            "void main() {",
            "  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.1);",
            "  gl_FragColor = vec4(glowColor, rim * 0.62);",
            "}"
          ].join("\n"),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        }));
      atmosphere.position.copy(earth.position);
      group.add(atmosphere);

      // A local starfield behind the cupola guarantees a convincing orbital
      // backdrop even when the main exterior skybox is hidden by the station.
      const starPositions = [];
      const starSeed = (index) => {
        const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
        return value - Math.floor(value);
      };
      const starCount = window.isMobileDevice ? 220 : 520;
      for (let index = 0; index < starCount; index++) {
        const theta = starSeed(index) * Math.PI * 2;
        const phi = Math.acos(1 - starSeed(index + 37) * 0.92);
        const radius = 62 + starSeed(index + 91) * 18;
        starPositions.push(
          12 + Math.sin(phi) * Math.cos(theta) * radius,
          1.45 + Math.cos(phi) * radius,
          8 + Math.sin(phi) * Math.sin(theta) * radius
        );
      }
      const starGeometry = new THREE.BufferGeometry();
      starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
      const starfield = new THREE.Points(starGeometry, new THREE.PointsMaterial({
        color: 0xcfe3ff,
        size: 0.42,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      starfield.name = "Cupola_Starfield";
      group.add(starfield);
      this.cupolaEarth = earth;
      this.cupolaClouds = clouds;

      // Equipment is mounted outside the walkable center line so astronauts
      // and the third-person camera can move through the same clear passage.
      const rackZ = [2.8, 5, 14.5, 17.5, 20.5, 23.5, 27, 30, 34, 37, 40, 43, 47];
      rackZ.forEach((z, index) => {
        [-1, 1].forEach((side) => {
          rackFixtures.push({
            position: [side * 1.55, 0, z],
            rotation: [0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0],
            label: `${side < 0 ? "SYS" : "EXP"}-${String(index + 1).padStart(2, "0")}`
          });
          if (index % 2 === 0) {
            bagFixtures.push({ position: [side * 1.57, 1.88, z], rotation: [0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0], scale: 0.65, offset: 0.05 });
          }
        });
      });
      [-5.8, -4.4, 4.8, 6.4, 8, 9.6].forEach((x, index) => {
        rackFixtures.push({ position: [x, 0, -5.45], label: `LAB-${index + 1}` });
        bagFixtures.push({ position: [x, 1.88, -5.46], scale: 0.65, offset: 0.18 });
      });
      [4.8, 6.4, 8, 9.6].forEach((x, index) => {
        rackFixtures.push({ position: [x, 0, 10.35], rotation: [0, Math.PI, 0], label: `CREW-${index + 1}` });
      });
      group.add(buildEquipmentFixtures(rackFixtures, bagFixtures));
      group.add(buildRackElectronics(wallSurfaces));
      if (!window.isMobileDevice) group.add(buildRackInstruments(wallSurfaces));
      group.add(buildRackTrim(rackFixtures));
      group.add(buildScienceGlovebox([-1.72, 0, 4.15]));
      group.add(buildAirlockPanel([-5.9, 0, 6.65]));
      group.add(buildAirlockPanel([-8.2, 0, 6.65]));

      // Bundled conduits run along the module ceiling, as in the reference,
      // while leaving the hatch centers and the walking path clear.
      [0x467b91, 0xd9b66e, 0xd7e0e1].forEach((color, index) => {
        [-1, 1].forEach((side) => {
          const conduit = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 48, 8),
            new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.3 })
          );
          conduit.rotation.x = Math.PI / 2;
          conduit.position.set(side * (0.68 + index * 0.08), 2.66, 24.5);
          group.add(conduit);
        });
      });

      const lightMat = new THREE.MeshStandardMaterial({ color: 0xeaf5ff, emissive: 0xd5eaff, emissiveIntensity: 0.85 });
      const lightHousing = new THREE.MeshStandardMaterial({ color: 0x56646d, roughness: 0.5, metalness: 0.3 });
      const lightPositions = [
        [0, 2.76, -3.5, false], [0, 2.76, 2.5, false], [0, 2.76, 8.5, false],
        [0, 2.76, 15, false], [0, 2.76, 22, false], [0, 2.76, 29, false],
        [0, 2.76, 36, false], [0, 2.76, 43, false], [0, 2.76, 48, false],
        [-4.5, 2.76, -3.8, true], [7, 2.76, -3.8, true], [7, 2.76, 8, true]
      ];
      const interiorLights = [];
      lightPositions.forEach(([x, y, z, alongX], lightIndex) => {
        [-1, 1].forEach((side) => {
          const housing = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 1.25 : 0.18, 0.06, alongX ? 0.18 : 1.25), lightHousing);
          housing.position.set(x + (alongX ? 0 : side * 1.02), y, z + (alongX ? side * 1.02 : 0));
          group.add(housing);
          const diffuser = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 1.12 : 0.12, 0.025, alongX ? 0.12 : 1.12), lightMat);
          diffuser.position.set(housing.position.x, y - 0.045, housing.position.z);
          group.add(diffuser);
        });
        // The emissive diffusers remain on every fixture; mobile only pays for
        // every second dynamic point light, and ambient fill covers the gap.
        if (window.isMobileDevice && lightIndex % 2 !== 0) return;
        const light = new THREE.PointLight(0xe4f3ff, window.isMobileDevice ? 1.15 : 0.9, 6.5, 1.7);
        light.position.set(x, y - 0.3, z);
        group.add(light);
        interiorLights.push(light);
      });
      window.interiorPointLights = interiorLights;
      return group;
    }

    _applyISSStationLayout() {
      Object.entries(ISS_STATION_LAYOUT).forEach(([id, layout]) => {
        const station = STATIONS[id];
        station.position = layout.position.slice();
        station.workPosition = layout.workPosition.slice();
        const object = this.stationInteractionGroup.getObjectByName(`Console_${id}`);
        if (object) {
          object.position.set(layout.position[0], 0, layout.position[2]);
          object.rotation.y = Math.atan2(layout.workPosition[0] - layout.position[0], layout.workPosition[2] - layout.position[2]);
          object.scale.setScalar(1);
        }
      });
      if (window.gameplay && Array.isArray(window.gameplay.tasks)) {
        window.gameplay.tasks.forEach((task) => {
          const layout = ISS_STATION_LAYOUT[task.stationId];
          if (layout) task.pos = (ISS_TASK_WORK_POSITIONS[task.id] || layout.workPosition).slice();
        });
      }
      this._updateMinimapDOM();
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

    _buildISSStationConsoles() {
      const THREE = window.THREE;
      const keysMaterial = new THREE.MeshBasicMaterial({ map: createConsoleKeysTexture() });
      Object.values(STATIONS).forEach((station) => {
        const unit = new THREE.Group();
        unit.name = `Console_${station.id}`;
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.88, 0.2),
          new THREE.MeshStandardMaterial({ color: 0x8d9b9e, roughness: 0.7, metalness: 0.28 }));
        mount.position.set(0, 1.18, -0.15);
        unit.add(mount);
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.82, 0.22),
          new THREE.MeshStandardMaterial({ color: 0xc0c8c6, roughness: 0.68, metalness: 0.2 }));
        shell.position.y = 1.18;
        unit.add(shell);
        const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.38, 0.06),
          new THREE.MeshStandardMaterial({ color: 0x192834, roughness: 0.48, metalness: 0.25 }));
        bezel.position.set(0, 1.25, 0.13);
        unit.add(bezel);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.29),
          new THREE.MeshBasicMaterial({ map: createConsoleScreenTexture(station) }));
        screen.position.set(0, 1.25, 0.165);
        unit.add(screen);
        const indicatorMat1 = new THREE.MeshStandardMaterial({ color: 0xfb7185, emissive: 0xfb7185, emissiveIntensity: 0.9 });
        const indicatorMat2 = new THREE.MeshStandardMaterial({ color: 0xfb7185, emissive: 0xfb7185, emissiveIntensity: 0.9 });
        [indicatorMat1, indicatorMat2].forEach((material, index) => {
          const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.02), material);
          indicator.position.set(-0.15 + index * 0.30, 1.01, 0.125);
          unit.add(indicator);
        });
        const labelSpriteMat = new THREE.MeshBasicMaterial({ map: createStationLabelTexture({ text: station.shortLabel, subtext: "FAULT", accent: "#e08080" }), transparent: true });
        const label = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.105), labelSpriteMat);
        label.position.set(0, 1.53, 0.115);
        unit.add(label);
        const keyboard = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.11), keysMaterial);
        keyboard.position.set(0, 0.90, 0.115);
        unit.add(keyboard);
        this.group.add(unit);
        this.stationEntries[station.id] = { station, indicatorMat1, indicatorMat2, labelSpriteMat, hasFault: true };
      });
    }

    // ============================================================================
    // 9. STATION FAULT / TASK SYNCHRONIZATION
    // ============================================================================
    syncStationFaults(tasks = []) {
      const faultStations = new Set();

      tasks.forEach((t) => {
        if (!t.completed && t.stationId && STATIONS[t.stationId]) {
          faultStations.add(t.stationId);
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
        <span style="font-size:10px;font-weight:700;letter-spacing:1.6px;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="ship-room-title">INTERNATIONAL SPACE STATION · INTERIOR</span>
        <a href="https://sketchfab.com/3d-models/international-space-station-2256c89a089b4ec895bb658b18fa7bbb" target="_blank" rel="noopener noreferrer" title="Structural reference: International Space Station by Stephen Mack on Sketchfab, CC BY 4.0. Interior rebuilt for Lunaspis." style="font-size:8px;font-weight:700;letter-spacing:0.6px;color:#a5f3fc;text-decoration:underline;white-space:nowrap;">REFERENCE · STEPHEN MACK · CC BY 4.0</a>
        <button id="btn-return-space-center" style="background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.28);color:#e2e8f0;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Return the whole crew to the Launch Center [G]">
          LAUNCH PAD [G]
        </button>
        <button id="btn-toggle-iss-showcase" style="background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.22);color:#e2e8f0;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Look around the 27-part 3D Space Station model [J]">
          STATION 3D [J]
        </button>
        <button id="btn-toggle-lunar-scene" style="background:rgba(15,23,42,0.88);border:1px solid rgba(148,163,184,0.22);color:#94a3b8;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Toggle 3D Lunar Touchdown Scene [K]">
          MOON [K]
        </button>
        <button id="btn-toggle-mission-viz" style="background:rgba(37,99,235,0.22);border:1px solid rgba(59,130,246,0.48);color:#f8fafc;font-size:9px;font-weight:700;letter-spacing:1.2px;padding:4px 9px;border-radius:4px;cursor:pointer;font-family:inherit;white-space:nowrap;" title="Open 3D Orbit & Earth Map View [U]">
          3D ORBIT [U]
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

      let faultCount = 0;
      Object.values(this.stationEntries).forEach((e) => {
        if (e.hasFault) faultCount++;
      });

      const linesSvg = "";
      const roomsSvg = ISS_WALK_ZONES.map((zone) =>
        `<rect x="${zone.xMin}" y="${zone.zMin}" width="${zone.xMax - zone.xMin}" height="${zone.zMax - zone.zMin}" fill="rgba(103,232,249,0.08)" stroke="rgba(148,163,184,0.3)" stroke-width="0.2" />`
      ).join("") + ISS_MODULES.map((module) =>
        `<text x="${module.x}" y="${module.z}" text-anchor="middle" fill="#f8fafc" font-size="0.8">${module.name}</text>`
      ).join("");

      const stationsSvg = Object.values(STATIONS)
        .map((st) => {
          const done = completedSet.has(st.taskId);
          const fault = !done;
          return `<circle cx="${st.position[0]}" cy="${st.position[2]}" r="${fault ? 0.38 : 0.28}" fill="${fault ? st.color : "rgba(248,250,252,0.45)"}" />`;
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
        if (pos[0] < -10.5 || pos[0] > 14 || pos[2] < -6.5 || pos[2] > 50.5) return;
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
            ${friendLegend.join("") || (!includeLocal ? `<span style="color:rgba(148,163,184,0.7);">WAITING FOR LIVE LOCATION</span>` : "")}
          </div>
        `
        : "";

      return {
        curRoomLabel: this.activeModule || curRoomObj.shortLabel,
        faultCount,
        pingRoomCode,
        svgHtml: `
          <svg viewBox="-10.5 -6.5 24.5 57" style="height:${svgHeight}px;width:100%;display:block;">
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
            <span>MAIN DECK</span>
            <span>${markup.pingRoomCode ? `GROUND ALERT: ${markup.pingRoomCode}` : `${markup.faultCount} TO FIX`}</span>
          </div>
        `}
      `;
    }

    // ============================================================================
    // 11. REAL-TIME PHYSICAL COLLISION & CAMERA CLEARANCE ENGINE (collision.ts)
    // ============================================================================
    isWalkable(x, z) {
      return ISS_WALK_ZONES.some(
        (zone) => x >= zone.xMin && x <= zone.xMax && z >= zone.zMin && z <= zone.zMax
      );
    }

    isSolid(x, z, margin = 0) {
      if (Object.values(STATIONS).some((station) =>
        Math.hypot(x - station.position[0], z - station.position[2]) < 0.4 + margin
      )) return true;
      if (ISS_HATCH_LEAVES.some((leaf) => Math.abs(x - leaf.x) < 0.08 + margin &&
        z >= leaf.zMin - margin && z <= leaf.zMax + margin)) return true;
      return ISS_HATCHES.some((hatch) => {
        const forward = hatch.axis === "z" ? z : x;
        const cross = hatch.axis === "z" ? x : z;
        const offset = Math.abs(cross - hatch.center);
        const span = getHatchCrossSpan(hatch);
        const crossMin = Math.min(span[0], hatch.center - hatch.halfWidth);
        const crossMax = Math.max(span[1], hatch.center + hatch.halfWidth);
        return Math.abs(forward - hatch.at) < 0.12 + margin &&
          cross > crossMin - margin && cross < crossMax + margin &&
          offset > 1.06 - margin;
      });
    }

    canStandAt(x, z, radius = 0.26) {
      if (!this.isWalkable(x, z) || this.isSolid(x, z, radius)) return false;
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
      const module = ISS_MODULES.reduce((nearest, current) =>
        Math.hypot(x - current.x, z - current.z) < Math.hypot(x - nearest.x, z - nearest.z) ? current : nearest
      );
      if (module.name !== this.activeModule) {
        this.activeModule = module.name;
        this._setInteriorTitle(`ISS · ${module.name}`);
      }
      const nextRoomId = Object.values(STATIONS).reduce((nearest, station) =>
          Math.hypot(x - station.workPosition[0], z - station.workPosition[2]) <
          Math.hypot(x - nearest.workPosition[0], z - nearest.workPosition[2]) ? station : nearest
        ).room;
      if (nextRoomId !== this.activeRoomId) {
        this.activeRoomId = nextRoomId;
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

    _suppressExteriorLights(suppress) {
      if (suppress) {
        if (this.savedExteriorLights) return;
        this.savedExteriorLights = [window.ambLight, window.hemiLight, window.sunLight, window.earthShineLight]
          .filter(Boolean).map((light) => ({ light, visible: light.visible }));
        this.savedExteriorLights.forEach(({ light }) => { light.visible = false; });
      } else if (this.savedExteriorLights) {
        this.savedExteriorLights.forEach(({ light, visible }) => { light.visible = visible; });
        this.savedExteriorLights = null;
      }
    }

    toggleMoonLandingScene(forceState) {
      const next = typeof forceState === "boolean" ? forceState : !this.isMoonLandingActive;
      this.isMoonLandingActive = next;
      this._suppressExteriorLights(!next && this.isInteriorActive);

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

      if (this.issInteriorModelGroup) {
        this.issInteriorModelGroup.visible = Boolean(this.issInteriorModel && this.isInteriorActive && !next);
      }

      const titleEl = document.getElementById("ship-room-title");
      if (titleEl) {
        titleEl.textContent = next
          ? "MARE TRANQUILLITATIS • LUNAR TOUCHDOWN"
          : `ISS · ${(ROOM_BY_ID.get(this.activeRoomId)?.label || "DESTINY LABORATORY").toUpperCase()}`;
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

      // The cupola is the visual anchor of the station; a very slow Earth and
      // cloud drift keeps the vista alive without pulling attention from work.
      const interiorDelta = Math.min(0.1, Number(delta) || 0);
      if (this.cupolaEarth) this.cupolaEarth.rotation.y += interiorDelta * 0.0011;
      if (this.cupolaClouds) this.cupolaClouds.rotation.y += interiorDelta * 0.0035;

      // Update Minimap player marker
      if (window.localCrew && window.localCrew.group) {
        const p = window.localCrew.group.position;
        const yaw = window.localCrew.group.rotation.y || 0;
        const minimapInterval = window.isMobileDevice ? 0.24 : 0.12;
        if (!this._minimapTimer || t - this._minimapTimer > minimapInterval) {
          this._minimapTimer = t;
          this._updateMinimapDOM(p.x, p.z, yaw);
        }
      }
    }

    show() {
      this.isInteriorActive = true;
      this.isMoonLandingActive = false;
      this._suppressExteriorLights(true);
      document.body.classList.add("interior-active");
      document.body.classList.remove("ground-mode-active");
      if (window.csaNasaLab && typeof window.csaNasaLab.syncGroundLockState === "function") {
        window.csaNasaLab.syncGroundLockState();
      }
      if (this.moonLanding && this.moonLanding.root) this.moonLanding.root.visible = false;
      // CRITICAL: Never show the exterior ISS outside the window when the player is INSIDE the station!
      if (window.issGroup) window.issGroup.visible = false;
      if (this.group) this.group.visible = true;
      if (this.issInteriorModel) {
        if (this.issInteriorModelGroup) this.issInteriorModelGroup.visible = true;
        this._placeCrewOnISSWalkway();
        this._setInteriorTitle("INTERNATIONAL SPACE STATION · INTERIOR");
      }
      if (this.hudPill) this.hudPill.style.display = window.isGameStarted ? "flex" : "none";
      if (this.minimapEl) this.minimapEl.style.display = window.isGameStarted ? "block" : "none";
    }

    hide() {
      this.isInteriorActive = false;
      this._suppressExteriorLights(false);
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
