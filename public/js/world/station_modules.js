/**
 * ============================================================================
 * LUNASPIS / SPACESHIP 3D NASA ISS REFERENCE MODEL & 27-PART SHOWCASE ENGINE
 * ============================================================================
 * Pure Vanilla Three.js port of SpaceShip's:
 * - src/lib/iss/data.ts (27 curated NASA ISS components, categories, facts & telemetry)
 * - src/components/showcase/ISSModel.tsx (132-node hierarchy normalization, raycasting,
 *   emissive hover/selection pulsing, component isolation, camera focus & 3D labels)
 * - src/components/showcase/Panels.tsx (Searchable 27-part Station Map Navigator,
 *   Station Overview, Component Details inspector, and top control bar)
 */

(function (window) {
  "use strict";

  const MODEL_TARGET_SIZE = 28;
  const SELECT_COLOR = "#e7e8e3";
  const HOVER_COLOR = "#ffffff";

  const PART_CATEGORIES = [
    { id: "modules", label: "Pressurized modules", color: "#8ec5e8" },
    { id: "power", label: "Truss & power", color: "#e3c27a" },
    { id: "robotics", label: "Robotics", color: "#e6e6df" },
    { id: "science", label: "Science & external", color: "#8ed7b6" },
    { id: "docking", label: "Docking & airlock", color: "#e6a0a0" },
    { id: "logistics", label: "Logistics & stowage", color: "#b8c0c8" }
  ];

  const CATEGORY_BY_ID = new Map(PART_CATEGORIES.map((c) => [c.id, c]));

  const ISS_STATION = {
    name: "International Space Station",
    shortName: "ISS",
    tagline: "The largest modular structure ever assembled in space.",
    description:
      "The International Space Station is a permanently crewed research laboratory assembled in low Earth orbit from modules built by five space agencies. Its pressurized modules, power truss, solar arrays, radiators, and robotic arms form an integrated system in which every element supports the others.",
    facts: [
      { label: "Mass", value: "≈420,000 kg" },
      { label: "Pressurized volume", value: "915.6 m³" },
      { label: "Electrical power", value: "84–120 kW" },
      { label: "Truss length", value: "108.5 m" },
      { label: "Orbit", value: "≈408 km · 51.64°" },
      { label: "Crew", value: "6–7" }
    ],
    agencies: [
      { short: "NASA", name: "United States" },
      { short: "Roscosmos", name: "Russia" },
      { short: "ESA", name: "Europe" },
      { short: "JAXA", name: "Japan" },
      { short: "CSA", name: "Canada" }
    ],
    modelNote:
      "The model reflects the 2011-era station. Pirs was deorbited in 2021 and several external payloads have since changed."
  };

  const ISS_PARTS = [
    {
      id: "zarya",
      name: "Zarya (FGB)",
      shortName: "Zarya",
      category: "modules",
      agency: "Roscosmos / NASA",
      launched: "20 Nov 1998",
      mass: "≈19,323 kg",
      summary: "The first ISS module — propulsion, power, and cargo storage.",
      description:
        "Zarya, also called the Functional Cargo Block, was the first station element in orbit. Built in Russia with U.S. funding, it supplied early attitude control, propulsion, electrical power, and storage.",
      facts: [
        { label: "Length", value: "12.6 m" },
        { label: "Diameter", value: "4.1 m" },
        { label: "Role", value: "Cargo, power, propulsion" }
      ],
      match: ["zarya"],
      priority: 1
    },
    {
      id: "zvezda",
      name: "Zvezda (Service Module)",
      shortName: "Zvezda",
      category: "modules",
      agency: "Roscosmos",
      launched: "12 Jul 2000",
      mass: "≈19,051 kg",
      summary: "Living quarters, life support, and the station's early propulsion hub.",
      description:
        "Zvezda provides the Russian Segment's primary life-support systems, crew quarters, and propulsion. It made continuous crew occupation possible from November 2000 onward.",
      facts: [
        { label: "Length", value: "13.1 m" },
        { label: "Diameter", value: "4.15 m" },
        { label: "Role", value: "Habitation and life support" }
      ],
      match: ["zvezda"],
      priority: 1
    },
    {
      id: "unity",
      name: "Unity (Node 1)",
      shortName: "Unity",
      category: "modules",
      agency: "NASA",
      launched: "4 Dec 1998",
      mass: "≈11,612 kg",
      summary: "The first U.S. module and the central connecting node of the station.",
      description:
        "Unity connects the Russian Segment to the U.S. laboratory, life-support, and habitation modules. Six docking ports make it one of the station's main structural hubs.",
      facts: [
        { label: "Length", value: "5.5 m" },
        { label: "Diameter", value: "4.6 m" },
        { label: "Role", value: "Connecting node" }
      ],
      match: ["unity node 1"],
      priority: 2
    },
    {
      id: "destiny",
      name: "Destiny (U.S. Laboratory)",
      shortName: "Destiny",
      category: "modules",
      agency: "NASA",
      launched: "7 Feb 2001",
      mass: "≈14,515 kg",
      summary: "NASA's primary research laboratory, hosting experiments and station systems.",
      description:
        "Destiny is the central U.S. laboratory and the primary location for microgravity research. Its exterior carries payload attach points, while its interior houses experiment racks and critical station systems.",
      facts: [
        { label: "Length", value: "8.5 m" },
        { label: "Diameter", value: "4.3 m" },
        { label: "Role", value: "Microgravity research" }
      ],
      match: ["destiny space laboratory", "destiny_window_cover"],
      priority: 1
    },
    {
      id: "columbus",
      name: "Columbus",
      shortName: "Columbus",
      category: "modules",
      agency: "ESA",
      launched: "7 Feb 2008",
      mass: "≈12,800 kg",
      summary: "Europe's pressurized research laboratory for microgravity science.",
      description:
        "Columbus is ESA's main contribution to the station's pressurized research volume. It supports materials science, fluid physics, biology, and Earth observation experiments.",
      facts: [
        { label: "Length", value: "6.9 m" },
        { label: "Diameter", value: "4.5 m" },
        { label: "Role", value: "European laboratory" }
      ],
      match: ["columbus"],
      priority: 1
    },
    {
      id: "kibo",
      name: "Kibo (Japanese Experiment Module)",
      shortName: "Kibo",
      category: "modules",
      agency: "JAXA",
      launched: "2008–2009",
      mass: "Pressurized module ≈15,900 kg",
      summary: "Japan's laboratory complex, including an exposed payload platform.",
      description:
        "Kibo means 'hope' in Japanese. The complex includes a pressurized laboratory, a logistics module, and an exposed platform serviced by a dedicated robotic arm.",
      facts: [
        { label: "Pressurized length", value: "11.2 m" },
        { label: "Exposed platform", value: "5.6 × 5.0 m" },
        { label: "Role", value: "Research and external payloads" }
      ],
      match: ["kibo"],
      priority: 1
    },
    {
      id: "harmony",
      name: "Harmony (Node 2)",
      shortName: "Harmony",
      category: "modules",
      agency: "NASA / ESA",
      launched: "23 Oct 2007",
      mass: "≈14,288 kg",
      summary: "Connects the U.S., European, and Japanese laboratories.",
      description:
        "Harmony links the U.S. Destiny laboratory with the European Columbus and Japanese Kibo modules. It also provides docking ports and utility routing for visiting spacecraft.",
      facts: [
        { label: "Length", value: "7.2 m" },
        { label: "Diameter", value: "4.4 m" },
        { label: "Role", value: "Laboratory connector" }
      ],
      match: ["harmony node 2"],
      priority: 2
    },
    {
      id: "tranquility",
      name: "Tranquility (Node 3)",
      shortName: "Tranquility",
      category: "modules",
      agency: "NASA / ESA",
      launched: "8 Feb 2010",
      mass: "≈15,500 kg",
      summary: "Houses life-support, exercise, and environmental control systems.",
      description:
        "Tranquility contains atmosphere recycling and water recovery systems. The Cupola observation module is attached to its Earth-facing port.",
      facts: [
        { label: "Length", value: "6.7 m" },
        { label: "Diameter", value: "4.4 m" },
        { label: "Role", value: "Life support and habitation" }
      ],
      match: ["tranquility node 3"],
      priority: 2
    },
    {
      id: "cupola",
      name: "Cupola",
      shortName: "Cupola",
      category: "modules",
      agency: "ESA / NASA",
      launched: "8 Feb 2010",
      mass: "≈1,805 kg",
      summary: "A seven-window observation module with a 360° view of Earth.",
      description:
        "Cupola is a pressurized observation module with seven windows, including a large circular central window supporting Earth observation and robotics.",
      facts: [
        { label: "Diameter", value: "2.95 m" },
        { label: "Windows", value: "7" },
        { label: "Role", value: "Observation and robotics workstation" }
      ],
      match: ["cupola"],
      priority: 1
    },
    {
      id: "quest",
      name: "Quest Airlock",
      shortName: "Quest",
      category: "docking",
      agency: "NASA",
      launched: "12 Jul 2001",
      mass: "≈6,064 kg",
      summary: "The station's primary airlock for U.S. spacewalks and equipment.",
      description:
        "Quest supports extravehicular activity, allowing crew members to exit the station in U.S. spacesuits.",
      facts: [
        { label: "Length", value: "5.5 m" },
        { label: "Diameter", value: "4.0 m" },
        { label: "Role", value: "Spacewalk airlock" }
      ],
      match: ["quest airlock"],
      priority: 2
    },
    {
      id: "leonardo",
      name: "Leonardo (PMM)",
      shortName: "Leonardo",
      category: "logistics",
      agency: "NASA / ESA",
      launched: "24 Feb 2011",
      mass: "≈9,400 kg",
      summary: "A converted logistics module that adds pressurized storage to the station.",
      description:
        "Leonardo was converted into the Permanent Multipurpose Module and attached to the station to provide additional pressurized storage.",
      facts: [
        { label: "Length", value: "6.4 m" },
        { label: "Diameter", value: "4.6 m" },
        { label: "Role", value: "Pressurized storage" }
      ],
      match: ["leonardo"],
      priority: 2
    },
    {
      id: "s0-truss",
      name: "S0 Truss",
      shortName: "S0 Truss",
      category: "power",
      agency: "NASA",
      launched: "8 Apr 2002",
      mass: "≈13,970 kg",
      summary: "The central truss segment that anchors the station's power backbone.",
      description:
        "S0 sits on top of Destiny and carries power, cooling, and data lines out to the port and starboard truss segments.",
      facts: [
        { label: "Length", value: "13.4 m" },
        { label: "Role", value: "Central structural and utility spine" }
      ],
      match: ["s0 truss"],
      priority: 2
    },
    {
      id: "solar-trusses",
      name: "Port & Starboard Trusses",
      shortName: "Solar Trusses",
      category: "power",
      agency: "NASA",
      launched: "2002–2009",
      mass: "≈14,000 kg per segment",
      summary: "The long truss spine that carries solar arrays, radiators, and payloads.",
      description:
        "The P1–P6 and S1–S6 truss segments extend the station's power backbone to port and starboard.",
      facts: [
        { label: "Total span", value: "108.5 m" },
        { label: "Segments", value: "P1, P3–P6, S1, S3–S6" },
        { label: "Role", value: "Power and thermal backbone" }
      ],
      match: ["p1 truss", "p3 truss", "p4 truss", "p5 truss", "p6 truss", "s1 truss", "s3 truss", "s4 truss", "s5 truss", "s6 truss"],
      priority: 2
    },
    {
      id: "solar-arrays",
      name: "Solar Array Wings",
      shortName: "Solar Arrays",
      category: "power",
      agency: "NASA",
      launched: "2000–2009",
      mass: "≈1,100 kg per wing",
      summary: "Eight large wings convert sunlight into the station's electrical power.",
      description:
        "Each solar array wing unfolds into a long blanket of photovoltaic cells generating up to 120 kW of electrical power.",
      facts: [
        { label: "Wings", value: "8" },
        { label: "Wing size", value: "≈35 × 12 m" },
        { label: "Role", value: "Primary power generation" }
      ],
      match: ["panel_", "hinge_"],
      priority: 1
    },
    {
      id: "z1-truss",
      name: "Z1 Truss",
      shortName: "Z1 Truss",
      category: "power",
      agency: "NASA",
      launched: "11 Oct 2000",
      mass: "≈8,755 kg",
      summary: "The first truss segment, carrying communications and gyroscopes.",
      description:
        "Z1 was mounted on Unity and served as an early mounting point for communications equipment and control-moment gyroscopes.",
      facts: [
        { label: "Role", value: "Early truss and utilities" },
        { label: "Installed on", value: "Unity (Node 1)" }
      ],
      match: ["z1 truss"],
      priority: 2
    },
    {
      id: "canadarm2",
      name: "Canadarm2",
      shortName: "Canadarm2",
      category: "robotics",
      agency: "CSA / NASA",
      launched: "19 Apr 2001",
      mass: "≈1,800 kg",
      summary: "A 17.6 m robotic arm that assembles, moves, and services the station.",
      description:
        "Canadarm2 moves along the Mobile Base System and is used to capture visiting spacecraft, install modules, and support spacewalks.",
      facts: [
        { label: "Length", value: "17.6 m" },
        { label: "Reach", value: "≈15 m" },
        { label: "Role", value: "Assembly and servicing" }
      ],
      match: ["canadarm2"],
      priority: 1
    },
    {
      id: "mbs",
      name: "Mobile Base System",
      shortName: "MBS",
      category: "robotics",
      agency: "CSA / NASA",
      launched: "5 Jun 2002",
      mass: "≈1,700 kg",
      summary: "A mobile platform that lets Canadarm2 travel along the station's truss.",
      description:
        "The Mobile Base System rides on rails along the Integrated Truss Structure, carrying Canadarm2 from one worksite to another.",
      facts: [
        { label: "Role", value: "Mobile robotics platform" },
        { label: "Works with", value: "Canadarm2" }
      ],
      match: ["mobile base system"],
      priority: 2
    },
    {
      id: "dextre",
      name: "Dextre",
      shortName: "Dextre",
      category: "robotics",
      agency: "CSA",
      launched: "11 Mar 2008",
      mass: "≈1,662 kg",
      summary: "A two-armed special-purpose robot for fine external maintenance.",
      description:
        "Dextre performs delicate maintenance tasks outside the station that would otherwise require a spacewalk.",
      facts: [
        { label: "Height", value: "≈3.7 m" },
        { label: "Arms", value: "2" },
        { label: "Role", value: "Fine external servicing" }
      ],
      match: ["dextre"],
      priority: 2
    },
    {
      id: "jem-arm",
      name: "JEM Remote Manipulator System",
      shortName: "JEM Arm",
      category: "robotics",
      agency: "JAXA",
      launched: "2008",
      summary: "A Japanese robotic arm that services experiments on Kibo's exposed platform.",
      description:
        "The JEM RMS moves experiments between the exposed platform and the scientific airlock.",
      facts: [
        { label: "Length", value: "≈10 m" },
        { label: "Role", value: "Kibo payload handling" }
      ],
      match: ["robotic arm"],
      priority: 2
    },
    {
      id: "eiba",
      name: "Enhanced ISS Boom Assembly",
      shortName: "EIBA",
      category: "robotics",
      agency: "NASA",
      launched: "27 May 2011",
      summary: "A boom extension used with Canadarm2 for detailed exterior inspections.",
      description:
        "The Enhanced ISS Boom Assembly extends Canadarm2's reach so sensors can inspect the station's exterior.",
      facts: [{ label: "Role", value: "Exterior inspection" }],
      match: ["enhanced iss boom assembly"],
      priority: 2
    },
    {
      id: "ams-02",
      name: "Alpha Magnetic Spectrometer (AMS-02)",
      shortName: "AMS-02",
      category: "science",
      agency: "NASA / DOE / international",
      launched: "16 May 2011",
      mass: "≈6,717 kg",
      summary: "A particle-physics detector searching for dark matter and antimatter.",
      description:
        "AMS-02 is a precision particle detector mounted on the station's truss studying cosmic rays for evidence of dark matter and antimatter.",
      facts: [
        { label: "Dimensions", value: "≈5 × 4 × 3 m" },
        { label: "Role", value: "Cosmic-ray physics" }
      ],
      match: ["alpha magnetic spectrometer"],
      priority: 2
    },
    {
      id: "external-science",
      name: "External Science Payloads",
      shortName: "External Science",
      category: "science",
      agency: "NASA",
      launched: "2014–2019",
      summary: "Instruments mounted outside the station to observe Earth's climate and weather.",
      description:
        "Payloads such as RapidScat, CATS, ECOSTRESS, and OCO-3 study winds, clouds, vegetation, and carbon dioxide.",
      facts: [
        { label: "Examples", value: "RapidScat, CATS, ECOSTRESS, OCO-3" },
        { label: "Role", value: "Earth observation" }
      ],
      match: ["rapidscat", "cats", "oco3", "ecostress"],
      priority: 2
    },
    {
      id: "stowage",
      name: "External Stowage & ELCs",
      shortName: "Stowage",
      category: "logistics",
      agency: "NASA",
      launched: "2001–2011",
      summary: "Unpressurized pallets that store spare parts and payloads outside the station.",
      description:
        "External Stowage Platforms and Express Logistics Carriers hold spare components and experiments in the vacuum of space.",
      facts: [
        { label: "Elements", value: "ESP-1–3, ELC-1–4" },
        { label: "Role", value: "External logistics" }
      ],
      match: ["external stowage platform", "express logistics carrier"],
      priority: 2
    },
    {
      id: "pirs",
      name: "Pirs (Docking Compartment)",
      shortName: "Pirs",
      category: "docking",
      agency: "Roscosmos",
      launched: "14 Sep 2001",
      mass: "≈3,580 kg",
      summary: "A docking compartment and airlock on the Russian segment.",
      description:
        "Pirs provided a docking port and airlock for Russian spacewalks in the 2011-era configuration.",
      facts: [
        { label: "Role", value: "Docking and airlock" },
        { label: "Status", value: "Deorbited 2021" }
      ],
      match: ["pirs"],
      priority: 2
    },
    {
      id: "poisk",
      name: "Poisk (MRM-2)",
      shortName: "Poisk",
      category: "docking",
      agency: "Roscosmos",
      launched: "10 Nov 2009",
      mass: "≈3,670 kg",
      summary: "A mini research module and docking port on the Russian segment.",
      description:
        "Poisk serves as a docking port for Soyuz and Progress spacecraft and as a small research module.",
      facts: [
        { label: "Role", value: "Docking and research" },
        { label: "Docked to", value: "Zvezda" }
      ],
      match: ["poisk"],
      priority: 2
    },
    {
      id: "rassvet",
      name: "Rassvet (MRM-1)",
      shortName: "Rassvet",
      category: "docking",
      agency: "Roscosmos",
      launched: "14 May 2010",
      mass: "≈5,075 kg",
      summary: "A mini research module and docking port delivered by the Space Shuttle.",
      description:
        "Rassvet provides docking, cargo storage, and research space on the Russian Segment.",
      facts: [
        { label: "Role", value: "Docking and research" },
        { label: "Delivered by", value: "STS-132" }
      ],
      match: ["rassvet"],
      priority: 2
    },
    {
      id: "pma",
      name: "Pressurized Mating Adapters",
      shortName: "PMA",
      category: "docking",
      agency: "NASA",
      launched: "1998–2000",
      mass: "≈1,300–1,600 kg",
      summary: "Cone-shaped adapters that connect modules and visiting spacecraft.",
      description:
        "The Pressurized Mating Adapters convert between different docking interfaces. PMA-1 joins the Russian and U.S. segments, while PMA-2 and PMA-3 support visiting vehicle docking.",
      facts: [
        { label: "Units", value: "PMA-1, PMA-2, PMA-3" },
        { label: "Role", value: "Docking interface conversion" }
      ],
      match: ["pressurized mating adapter"],
      priority: 2
    }
  ];

  const PART_BY_ID = new Map(ISS_PARTS.map((p) => [p.id, p]));

  function normalizeNodeName(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function resolvePartId(nodeName) {
    const normalized = normalizeNodeName(nodeName);
    if (!normalized) return null;
    for (let i = 0; i < ISS_PARTS.length; i++) {
      const part = ISS_PARTS[i];
      if (part.match.some((pattern) => normalized.includes(normalizeNodeName(pattern)))) {
        return part.id;
      }
    }
    return null;
  }

  // ============================================================================
  // ISS SHOWCASE MANAGER (ISSModel.tsx + Panels.tsx)
  // ============================================================================
  class ISSShowcaseManager {
    constructor() {
      this.isActive = false;
      this.spinGroup = null;
      this.showcaseGroup = null;
      this.builtModel = null;
      this.targets = {};
      this.stats = { nodes: 0, meshes: 0, materials: 0, textures: 0, triangles: 0 };

      this.selectedPartId = null;
      this.hoveredPartId = null;
      this.autoRotate = true;
      this.labelsVisible = true;
      this.isolateSelected = false;
      this.searchQuery = "";
      this.modelError = null;
      this._pendingOpen = false;

      this.selectedMaterials = [];
      this.selectionOutlines = [];
      this.selectionOutlineMaterials = [];
      this._outlinedPartId = null;
      this._outlinedColor = null;

      this.overlayEl = null;
      this.labelsContainerEl = null;
      this.labelElements = {};
      this._environmentState = null;

      // Orbit camera state for showcase
      this.camTarget = null;
      this.camSpherical = { radius: 28, phi: 1.15, theta: 0.55 };
      this.desiredTarget = null;
      this.desiredRadius = 28;
      this.raycaster = null;
      this.pointerNDC = null;
    }

    attachModel(rawScene, parentGroup) {
      const THREE = window.THREE;
      if (!THREE || !rawScene || !parentGroup) return;

      // Keep the showcase model on its own mount.  The shared `issGroup` is
      // the real full-scale station used by the docking simulator; normalizing
      // that group to showcase size made the ISS look smaller than the orbiter.
      this.showcaseGroup = parentGroup;
      if (parentGroup.parent === null && window.scene) {
        window.scene.add(parentGroup);
      }
      parentGroup.visible = false;

      this.raycaster = new THREE.Raycaster();
      this.pointerNDC = new THREE.Vector2();
      this.camTarget = new THREE.Vector3(0, 0, -35);
      this.desiredTarget = new THREE.Vector3(0, 0, -35);
      const defaultRadius = this._defaultRadius();
      this.camSpherical.radius = defaultRadius;
      this.desiredRadius = defaultRadius;

      const model = rawScene.clone(true);
      model.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = MODEL_TARGET_SIZE / maxDim;

      const boxes = new Map();
      const materialIds = new Set();
      let nodes = 0, meshes = 0, triangles = 0;

      model.traverse((object) => {
        nodes++;
        if (!object.isMesh) return;
        meshes++;

        const geom = object.geometry;
        if (geom) {
          const idx = geom.getIndex();
          const pos = geom.getAttribute("position");
          if (idx) triangles += idx.count / 3;
          else if (pos) triangles += pos.count / 3;
        }

        let partId = null;
        let cur = object;
        while (cur) {
          const match = resolvePartId(cur.name || (cur.userData && cur.userData.name));
          if (match) {
            partId = match;
            break;
          }
          cur = cur.parent;
        }
        object.userData.partId = partId;

        if (partId) {
          const box = new THREE.Box3().setFromObject(object);
          const existing = boxes.get(partId);
          if (existing) existing.union(box);
          else boxes.set(partId, box.clone());
        }

        const mats = Array.isArray(object.material) ? object.material : [object.material];
        const clonedMats = mats.map((m) => {
          if (!m) return m;
          materialIds.add(m.uuid);
          const clone = m.clone();
          clone.userData.baseEmissive = clone.emissive ? clone.emissive.getHex() : 0x000000;
          clone.userData.baseEmissiveIntensity = typeof clone.emissiveIntensity === "number" ? clone.emissiveIntensity : 0;
          return clone;
        });
        object.material = Array.isArray(object.material) ? clonedMats : clonedMats[0];
        object.castShadow = false;
        object.receiveShadow = false;
      });

      this.targets = {};
      boxes.forEach((box, partId) => {
        const partCenter = box.getCenter(new THREE.Vector3()).sub(center).multiplyScalar(scale);
        const partSize = box.getSize(new THREE.Vector3()).multiplyScalar(scale);
        this.targets[partId] = {
          center: [partCenter.x, partCenter.y, partCenter.z],
          radius: Math.max(partSize.x, partSize.y, partSize.z) * 0.5
        };
      });

      this.stats = {
        nodes,
        meshes,
        materials: materialIds.size,
        triangles: Math.round(triangles)
      };

      // Clear previous children of parentGroup
      while (parentGroup.children.length > 0) {
        parentGroup.remove(parentGroup.children[0]);
      }

      this.spinGroup = new THREE.Group();
      this.spinGroup.name = "ISS_Showcase_SpinGroup";
      this.spinGroup.position.set(0, 0, -35);

      const offsetGroup = new THREE.Group();
      offsetGroup.scale.setScalar(scale);
      offsetGroup.position.copy(center.clone().multiplyScalar(-scale));
      offsetGroup.add(model);
      this.spinGroup.add(offsetGroup);

      parentGroup.add(this.spinGroup);
      this.builtModel = model;
      this.modelError = null;

      this._bindCanvasEvents();
      console.log(`🛰️ [ISSShowcase] Normalized 3D ISS model (${nodes} nodes, ${meshes} meshes, ${Object.keys(this.targets).length} interactive parts).`);
      if (this._pendingOpen) {
        this._pendingOpen = false;
        this.open();
      }
    }

    _bindCanvasEvents() {
      if (this._eventsBound) return;
      this._eventsBound = true;

      let downX = 0, downY = 0, isDragging = false;
      let touchStartX = 0, touchStartY = 0, touchLastX = 0, touchLastY = 0;
      let isTouchOrbiting = false;
      let pinchStartDist = 0;

      window.addEventListener("mousedown", (e) => {
        if (!this.isActive) return;
        if (e.target.closest("#iss-showcase-ui")) return;
        downX = e.clientX;
        downY = e.clientY;
        isDragging = true;
      });

      window.addEventListener("mousemove", (e) => {
        if (!this.isActive || !this.builtModel || !window.camera) return;
        if (isDragging) {
          const dx = e.clientX - downX;
          const dy = e.clientY - downY;
          if (Math.hypot(dx, dy) > 2) {
            this.camSpherical.theta -= dx * 0.006;
            this.camSpherical.phi = Math.max(0.2, Math.min(Math.PI - 0.2, this.camSpherical.phi - dy * 0.006));
            downX = e.clientX;
            downY = e.clientY;
          }
          return;
        }

        if (e.target.closest("#iss-showcase-ui")) {
          if (this.hoveredPartId) this.setHoveredPart(null);
          return;
        }

        this.pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.pointerNDC, window.camera);
        const hits = this.raycaster.intersectObject(this.builtModel, true);
        const visibleHit = hits.find((h) => h.object && h.object.visible && h.object.userData.partId);
        this.setHoveredPart(visibleHit ? visibleHit.object.userData.partId : null);
      });

      window.addEventListener("mouseup", (e) => {
        if (!this.isActive) return;
        if (isDragging) {
          const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
          isDragging = false;
          if (moved < 5 && !e.target.closest("#iss-showcase-ui") && this.builtModel && window.camera) {
            this.pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.pointerNDC, window.camera);
            const hits = this.raycaster.intersectObject(this.builtModel, true);
            const visibleHit = hits.find((h) => h.object && h.object.visible && h.object.userData.partId);
            if (visibleHit) {
              this.selectPart(visibleHit.object.userData.partId);
            }
          }
        }
      });

      // Multi-touch 1-finger orbit, 2-finger pinch zoom & tap-to-select on mobile
      window.addEventListener("touchstart", (e) => {
        if (!this.isActive) return;
        if (e.target.closest("#iss-showcase-ui")) return;
        if (e.touches.length === 1) {
          touchStartX = touchLastX = e.touches[0].clientX;
          touchStartY = touchLastY = e.touches[0].clientY;
          isTouchOrbiting = true;
        } else if (e.touches.length >= 2) {
          isTouchOrbiting = false;
          pinchStartDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      }, { passive: true });

      window.addEventListener("touchmove", (e) => {
        if (!this.isActive) return;
        if (e.target.closest("#iss-showcase-ui")) return;
        if (e.touches.length === 1 && isTouchOrbiting) {
          const cx = e.touches[0].clientX;
          const cy = e.touches[0].clientY;
          const dx = cx - touchLastX;
          const dy = cy - touchLastY;
          this.camSpherical.theta -= dx * 0.0065;
          this.camSpherical.phi = Math.max(0.2, Math.min(Math.PI - 0.2, this.camSpherical.phi - dy * 0.0065));
          touchLastX = cx;
          touchLastY = cy;
        } else if (e.touches.length >= 2) {
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          if (pinchStartDist > 0) {
            const deltaDist = pinchStartDist - dist;
            this.desiredRadius = Math.max(4.5, Math.min(75, this.desiredRadius + deltaDist * 0.06));
          }
          pinchStartDist = dist;
        }
      }, { passive: true });

      window.addEventListener("touchend", (e) => {
        if (!this.isActive) return;
        if (isTouchOrbiting && e.changedTouches.length > 0) {
          const ct = e.changedTouches[0];
          const moved = Math.hypot(ct.clientX - touchStartX, ct.clientY - touchStartY);
          if (moved < 12 && !e.target.closest("#iss-showcase-ui") && this.builtModel && window.camera) {
            this.pointerNDC.x = (ct.clientX / window.innerWidth) * 2 - 1;
            this.pointerNDC.y = -(ct.clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.pointerNDC, window.camera);
            const hits = this.raycaster.intersectObject(this.builtModel, true);
            const visibleHit = hits.find((h) => h.object && h.object.visible && h.object.userData.partId);
            if (visibleHit) {
              this.selectPart(visibleHit.object.userData.partId);
            }
          }
        }
        if (e.touches.length === 0) {
          isTouchOrbiting = false;
          pinchStartDist = 0;
        }
      }, { passive: true });

      window.addEventListener("wheel", (e) => {
        if (!this.isActive || e.target.closest("#iss-showcase-ui")) return;
        this.desiredRadius = Math.max(4.5, Math.min(75, this.desiredRadius + Math.sign(e.deltaY) * 2.2));
      }, { passive: true });
    }

    setHoveredPart(partId) {
      if (this.hoveredPartId === partId) return;
      this.hoveredPartId = partId;
      document.body.style.cursor = partId ? "pointer" : "";
      this._applyMaterialHighlights();
    }

    selectPart(partId) {
      this.selectedPartId = partId;
      if (!partId) this.isolateSelected = false;
      this._applyMaterialHighlights();
      this._applyIsolation();
      if (partId) this.focusPart(partId);
      this._renderShowcasePanels();
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    focusPart(partId) {
      if (!partId || !this.targets[partId] || !this.spinGroup) return;
      const THREE = window.THREE;
      const target = this.targets[partId];
      this.spinGroup.updateMatrixWorld(true);
      const worldCenter = this.spinGroup.localToWorld(new THREE.Vector3(...target.center));
      this.desiredTarget.copy(worldCenter);
      this.desiredRadius = Math.max(4.2, Math.min(36, Math.max(target.radius, 0.5) * 5.2));
    }

    _defaultRadius() {
      const width = Math.max(320, window.innerWidth || 1600);
      // Leave room for the 288px / 340px side panels on desktop so the solar
      // arrays never slide underneath the component details card.
      const sidePanels = width > 1360 ? 660 : (width > 900 ? 560 : 0);
      const available = Math.max(340, width - sidePanels);
      return Math.max(28, Math.min(70, 28 * (1000 / available)));
    }

    resetView() {
      this.selectedPartId = null;
      this.isolateSelected = false;
      this.desiredTarget.set(0, 0, -35);
      this.desiredRadius = this._defaultRadius();
      this.camSpherical.theta = 0.55;
      this.camSpherical.phi = 1.15;
      this._applyMaterialHighlights();
      this._applyIsolation();
      this._renderShowcasePanels();
    }

    _applyMaterialHighlights() {
      if (!this.builtModel) return;
      this.selectedMaterials = [];
      const selectedPart = PART_BY_ID.get(this.selectedPartId);
      const selectedColor = selectedPart
        ? CATEGORY_BY_ID.get(selectedPart.category)?.color || SELECT_COLOR
        : SELECT_COLOR;
      const hoverColor = (window.UITheme && window.UITheme.palette && window.UITheme.palette.brandStrong) || HOVER_COLOR;

      this.builtModel.traverse((obj) => {
        if (!obj.isMesh) return;
        const partId = obj.userData.partId;
        const isSelected = Boolean(this.selectedPartId && partId === this.selectedPartId);
        const isHovered = Boolean(this.hoveredPartId && partId === this.hoveredPartId && !isSelected);
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

        mats.forEach((mat) => {
          if (!mat || !mat.emissive) return;
          if (isSelected) {
            // Keep the PBR texture readable: selected parts get a faint
            // emissive lift plus a silhouette outline, not a solid color wash.
            mat.emissive.set(selectedColor);
            mat.emissiveIntensity = 0.08;
            this.selectedMaterials.push(mat);
          } else if (isHovered) {
            mat.emissive.set(hoverColor);
            mat.emissiveIntensity = 0.045;
          } else {
            const base = mat.userData.baseEmissive;
            mat.emissive.setHex(typeof base === "number" ? base : 0x000000);
            mat.emissiveIntensity = mat.userData.baseEmissiveIntensity || 0;
          }
        });
      });

      if (this.selectedPartId !== this._outlinedPartId || (this.selectedPartId && selectedColor !== this._outlinedColor)) {
        this._clearSelectionOutlines();
        if (this.selectedPartId) {
          this._buildSelectionOutlines(this.selectedPartId, selectedColor);
          this._outlinedPartId = this.selectedPartId;
          this._outlinedColor = selectedColor;
        }
      }
    }

    _clearSelectionOutlines() {
      this.selectionOutlines.forEach((outline) => {
        if (outline.parent) outline.parent.remove(outline);
      });
      this.selectionOutlineMaterials.forEach((mat) => {
        if (mat && typeof mat.dispose === "function") mat.dispose();
      });
      this.selectionOutlines = [];
      this.selectionOutlineMaterials = [];
      this._outlinedPartId = null;
      this._outlinedColor = null;
    }

    _buildSelectionOutlines(partId, color) {
      const THREE = window.THREE;
      if (!THREE || !this.builtModel || !partId) return;
      const meshes = [];
      this.builtModel.traverse((obj) => {
        if (obj.isMesh && obj.userData.partId === partId && obj.visible) meshes.push(obj);
      });
      meshes.forEach((mesh) => {
        const mat = new THREE.MeshBasicMaterial({
          color,
          side: THREE.BackSide,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          depthTest: true,
          toneMapped: false
        });
        const outline = new THREE.Mesh(mesh.geometry, mat);
        outline.name = "ISS_SelectionOutline";
        outline.userData.isSelectionOutline = true;
        outline.scale.setScalar(1.012);
        outline.renderOrder = 4;
        outline.raycast = () => {};
        mesh.add(outline);
        this.selectionOutlines.push(outline);
        this.selectionOutlineMaterials.push(mat);
      });
    }

    _applyIsolation() {
      if (!this.builtModel) return;
      this.builtModel.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.userData.isSelectionOutline) return;
        const partId = obj.userData.partId;
        obj.visible = !this.isolateSelected || !this.selectedPartId || partId === this.selectedPartId;
      });
    }

    notifyModelError(error) {
      this.modelError = error ? String(error.message || error) : "ISS model unavailable";
      this._pendingOpen = false;
      if (window.gameplay && typeof window.gameplay.showToast === "function") {
        window.gameplay.showToast("ISS 3D MODEL FAILED TO LOAD — USING THE STATION VIEW AS-IS");
      }
      console.warn("[ISSShowcase] Model load failed:", error);
    }

    open() {
      if (this.isActive) return;
      if (window.solarSystem && window.solarSystem.isActive && typeof window.solarSystem.close === "function") {
        window.solarSystem.close();
      }
      if (window.missionViz && window.missionViz.isActive && typeof window.missionViz.close === "function") {
        window.missionViz.close();
      }
      if (!this.builtModel) {
        this._pendingOpen = !this.modelError;
        const message = this.modelError
          ? "ISS 3D MODEL UNAVAILABLE — CHECK YOUR CONNECTION AND RELOAD"
          : "ISS 3D MODEL IS STILL LOADING — OPENING WHEN READY";
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast(message);
        }
        return;
      }
      this.isActive = true;
      document.body.classList.add("iss-showcase-active");
      // Preserve the exterior/interior context so closing the showcase does not
      // yank a crewmember out of the launch pad or into the station interior.
      this._previousInteriorActive = !!(window.shipInterior && window.shipInterior.isInteriorActive);
      this._previousMoonLandingActive = !!(window.shipInterior && window.shipInterior.isMoonLandingActive);
      this._previousCrewVisible = !!(window.localCrew && window.localCrew.group && window.localCrew.group.visible);
      if (window.shipInterior) {
        if (this._previousMoonLandingActive && typeof window.shipInterior.stopMoonLandingScene === "function") {
          window.shipInterior.stopMoonLandingScene();
        }
        window.shipInterior.hide();
      }
      // The showcase is mounted at the origin; hide the launch complex so the
      // reference model is not drawn inside the pad or the crawlerway terrain.
      // Save the scene dressing first, before the ground presentation is suspended.
      this._saveEnvironmentState();
      this._previousGroundSuspended = !!(
        window.spaceCenter &&
        typeof window.spaceCenter.suspendGroundPresentation === "function" &&
        window.spaceCenter.suspendGroundPresentation()
      );
      this._previousIssVisible = !!(window.issGroup && window.issGroup.visible);
      if (window.issGroup) window.issGroup.visible = false;
      if (window.localCrew && window.localCrew.group) window.localCrew.group.visible = false;
      this._enterOrbitBackdrop();
      if (this.showcaseGroup) this.showcaseGroup.visible = true;
      this._ensureShowcaseDOM();
      this.overlayEl.style.display = "block";
      this._renderShowcasePanels();
    }

    _saveEnvironmentState() {
      // The showcase is an orbital reference view. Preserve the current scene
      // dressing (launch pad, Earth, starfield, sky/fog) so opening it from the
      // ground does not leave the station half-buried in the pad concrete, and
      // restore every flag exactly when the showcase closes.
      const scene = window.scene;
      const ground = window.spaceCenter && window.spaceCenter.group;
      const earth = window.photorealisticEarth && window.photorealisticEarth.group;
      this._environmentState = {
        groundVisible: ground ? ground.visible : null,
        earthVisible: earth ? earth.visible : null,
        starsVisible: window.spaceStars ? window.spaceStars.visible : null,
        background: scene && scene.background
          ? (scene.background.isColor ? scene.background.clone() : scene.background)
          : null,
        fog: scene ? scene.fog : null
      };
    }

    _enterOrbitBackdrop() {
      const THREE = window.THREE;
      const scene = window.scene;
      if (window.spaceCenter && window.spaceCenter.group) {
        window.spaceCenter.group.visible = false;
      }
      if (window.photorealisticEarth && window.photorealisticEarth.group) {
        window.photorealisticEarth.group.visible = true;
      }
      if (window.spaceStars) window.spaceStars.visible = true;
      if (scene) {
        scene.background = new THREE.Color(0x03060f);
        scene.fog = null;
      }
    }

    _restoreEnvironmentState() {
      const scene = window.scene;
      const state = this._environmentState;
      if (!state) return;
      if (window.spaceCenter && window.spaceCenter.group && state.groundVisible !== null) {
        window.spaceCenter.group.visible = state.groundVisible;
      }
      if (window.photorealisticEarth && window.photorealisticEarth.group && state.earthVisible !== null) {
        window.photorealisticEarth.group.visible = state.earthVisible;
      }
      if (window.spaceStars && state.starsVisible !== null) {
        window.spaceStars.visible = state.starsVisible;
      }
      if (scene) {
        scene.background = state.background;
        scene.fog = state.fog;
      }
      this._environmentState = null;
    }

    close() {
      if (!this.isActive) return;
      this.isActive = false;
      document.body.classList.remove("iss-showcase-active");
      document.body.style.cursor = "";
      if (this.overlayEl) this.overlayEl.style.display = "none";
      if (this.showcaseGroup) this.showcaseGroup.visible = false;
      if (window.issGroup) window.issGroup.visible = this._previousIssVisible;
      // The previous scene may hide the ground again on its own (for example,
      // [J] opened on top of an active lunar scene). Restore our ground state
      // first so the restored scene's suspension is the one that wins.
      if (this._previousGroundSuspended && window.spaceCenter && typeof window.spaceCenter.resumeGroundPresentation === "function") {
        window.spaceCenter.resumeGroundPresentation();
      }
      this._restoreEnvironmentState();
      if (window.localCrew && window.localCrew.group) {
        window.localCrew.group.visible = this._previousCrewVisible !== false;
      }
      if (window.shipInterior) {
        if (this._previousMoonLandingActive && typeof window.shipInterior.startMoonLandingScene === "function") {
          window.shipInterior.startMoonLandingScene();
        } else if (this._previousInteriorActive) {
          window.shipInterior.show();
        } else {
          window.shipInterior.hide();
        }
      }
      this._previousInteriorActive = false;
      this._previousMoonLandingActive = false;
      this._previousCrewVisible = true;
      this._previousGroundSuspended = false;
    }

    toggle() {
      if (this.isActive) this.close();
      else this.open();
      return this.isActive;
    }

    _ensureShowcaseDOM() {
      if (this.overlayEl) return;
      this.overlayEl = document.createElement("div");
      this.overlayEl.id = "iss-showcase-ui";
      this.overlayEl.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 980;
        pointer-events: none;
        display: none;
        font-family: var(--ui-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      `;

      this.overlayEl.innerHTML = `
        <!-- 3D Floating Part Labels Container -->
        <div id="iss-showcase-3d-labels" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;"></div>

        <!-- Top Showcase Header Bar -->
        <div id="iss-showcase-topbar"></div>

        <!-- Left Station Map Navigator (27 Parts) -->
        <aside id="iss-showcase-left"></aside>

        <!-- Right Component Details / Station Overview -->
        <aside id="iss-showcase-right"></aside>
      `;

      document.body.appendChild(this.overlayEl);
      this.labelsContainerEl = this.overlayEl.querySelector("#iss-showcase-3d-labels");
    }

    _renderShowcasePanels() {
      this._ensureShowcaseDOM();
      const topbar = this.overlayEl.querySelector("#iss-showcase-topbar");
      const leftPanel = this.overlayEl.querySelector("#iss-showcase-left");
      const rightPanel = this.overlayEl.querySelector("#iss-showcase-right");

      if (topbar) {
        const vrActive = !!(window.vrManager && window.vrManager.isAnyVRActive);
        const vrLabel = vrActive
          ? "EXIT VR"
          : (window.vrManager && window.vrManager.webxrSupported ? "WEBXR / VR" : "STEREO VR");
        topbar.innerHTML = `
          <div class="iss-topbar-brand">
            <span class="iss-topbar-mark" aria-hidden="true">ISS</span>
            <div class="iss-topbar-copy">
              <span class="iss-topbar-kicker">ORBITAL / MISSION LAB</span>
              <span class="iss-topbar-title">ISS Reference Craft</span>
              <span class="iss-topbar-meta">${ISS_PARTS.length} curated components · 2011 ISS</span>
            </div>
          </div>
          <div class="iss-topbar-actions">
            <button type="button" class="ft-help-btn ft-help-btn--sm" data-feature-help="iss_showcase" title="ISS 3D Showcase Visual Guide">?</button>
            <button type="button" id="iss-btn-labels" class="iss-chip${this.labelsVisible ? " is-active" : ""}" aria-pressed="${this.labelsVisible}">
              <svg class="ui-icon" aria-hidden="true"><use href="#i-eye"></use></svg><span>LABELS</span>
            </button>
            <button type="button" id="iss-btn-rotate" class="iss-chip${this.autoRotate ? " is-active" : ""}" aria-pressed="${this.autoRotate}">
              <svg class="ui-icon" aria-hidden="true"><use href="#i-orbit"></use></svg><span>AUTO-ROTATE</span>
            </button>
            <button type="button" id="iss-btn-isolate" class="iss-chip${this.isolateSelected ? " is-active" : ""}" aria-pressed="${this.isolateSelected}" ${!this.selectedPartId ? "disabled" : ""}>
              <svg class="ui-icon" aria-hidden="true"><use href="#i-target"></use></svg><span>ISOLATE</span>
            </button>
            <button type="button" id="iss-btn-reset" class="iss-chip">
              <span class="iss-chip__glyph" aria-hidden="true">↺</span><span>RESET VIEW</span>
            </button>
            <button type="button" id="iss-btn-vr" class="iss-chip iss-chip--accent">
              <svg class="ui-icon" aria-hidden="true"><use href="#i-vr"></use></svg><span>${vrLabel}</span>
            </button>
            <button type="button" id="iss-btn-return-ship" class="iss-chip iss-chip--primary">
              <svg class="ui-icon" aria-hidden="true"><use href="#i-leave"></use></svg><span>${this._previousInteriorActive ? "RETURN TO SHIP INTERIOR" : "CLOSE SHOWCASE"}</span><span class="iss-chip__key">${this._previousInteriorActive ? "I" : "J"}</span>
            </button>
          </div>
        `;

        topbar.querySelector("#iss-btn-labels").addEventListener("click", () => {
          this.labelsVisible = !this.labelsVisible;
          this._renderShowcasePanels();
        });
        topbar.querySelector("#iss-btn-rotate").addEventListener("click", () => {
          this.autoRotate = !this.autoRotate;
          this._renderShowcasePanels();
        });
        topbar.querySelector("#iss-btn-isolate").addEventListener("click", () => {
          if (!this.selectedPartId) return;
          this.isolateSelected = !this.isolateSelected;
          this._applyIsolation();
          this._renderShowcasePanels();
        });
        topbar.querySelector("#iss-btn-reset").addEventListener("click", () => this.resetView());
        const btnVr = topbar.querySelector("#iss-btn-vr");
        if (btnVr) {
          btnVr.addEventListener("click", () => {
            if (window.vrManager && typeof window.vrManager.toggleVR === "function") {
              window.vrManager.toggleVR();
            }
          });
        }
        topbar.querySelector("#iss-btn-return-ship").addEventListener("click", () => this.close());
      }

      if (leftPanel) {
        const q = this.searchQuery.trim().toLowerCase();
        const filtered = q
          ? ISS_PARTS.filter((p) => `${p.name} ${p.shortName} ${p.summary}`.toLowerCase().includes(q))
          : ISS_PARTS;

        const groupsHtml = PART_CATEGORIES.map((cat) => {
          const parts = filtered.filter((p) => p.category === cat.id);
          if (!parts.length) return "";
          return `
            <section class="iss-part-group">
              <div class="iss-part-group-head" style="--iss-cat-color:${cat.color};">
                <span class="iss-dot" aria-hidden="true"></span>
                <span class="iss-part-group-label">${cat.label}</span>
                <span class="iss-part-group-count">${parts.length}</span>
              </div>
              <div class="iss-part-group-list">
                ${parts
                  .map((part) => {
                    const isSel = part.id === this.selectedPartId;
                    return `
                      <button type="button" class="iss-part-item${isSel ? " is-selected" : ""}" data-id="${part.id}" style="--iss-cat-color:${cat.color};" aria-pressed="${isSel}">
                        <span class="iss-part-dot" aria-hidden="true"></span>
                        <span class="iss-part-name">${part.shortName}</span>
                        <span class="iss-part-arrow" aria-hidden="true">›</span>
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            </section>
          `;
        }).join("");

        leftPanel.innerHTML = `
          <div class="iss-panel-head">
            <span class="iss-panel-kicker">STATION MAP</span>
            <span class="iss-panel-title">${ISS_PARTS.length} components</span>
            <label class="iss-search-wrap">
              <span class="iss-search-icon" aria-hidden="true">⌕</span>
              <input id="iss-part-search" type="search" class="iss-search" value="${this.searchQuery}" placeholder="Search components…" aria-label="Search ISS components" />
            </label>
          </div>
          <div class="iss-panel-scroll iss-part-list">
            ${groupsHtml || '<div class="iss-empty">No matching components.</div>'}
          </div>
          <div class="iss-panel-foot">
            <span>2011 ISS REFERENCE</span>
            <span>${this.stats.nodes} NODES · ${this.stats.triangles.toLocaleString()} TRIS</span>
          </div>
        `;

        const searchInput = leftPanel.querySelector("#iss-part-search");
        if (searchInput) {
          searchInput.addEventListener("input", (e) => {
            this.searchQuery = e.target.value;
            this._renderShowcasePanels();
            const nextInput = this.overlayEl.querySelector("#iss-part-search");
            if (nextInput) {
              nextInput.focus();
              nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
            }
          });
        }

        leftPanel.querySelectorAll(".iss-part-item").forEach((btn) => {
          btn.addEventListener("click", () => this.selectPart(btn.dataset.id));
          btn.addEventListener("mouseenter", () => this.setHoveredPart(btn.dataset.id));
          btn.addEventListener("mouseleave", () => this.setHoveredPart(null));
        });
      }

      if (rightPanel) {
        const part = PART_BY_ID.get(this.selectedPartId);
        if (!part) {
          rightPanel.innerHTML = `
            <div class="iss-panel-head">
              <span class="iss-panel-kicker">STATION OVERVIEW</span>
              <span class="iss-panel-title">Reference configuration</span>
            </div>
            <div class="iss-panel-scroll">
              <div class="iss-overview">
                <span class="iss-eyebrow">LOW EARTH ORBIT · 1998–PRESENT</span>
                <h2 class="iss-hero-title">${ISS_STATION.name}</h2>
                <p class="iss-lead">${ISS_STATION.tagline}</p>
                <p class="iss-body">${ISS_STATION.description}</p>
                <div class="iss-fact-grid">
                  ${ISS_STATION.facts
                    .map(
                      (f) => `
                    <div class="iss-fact-card">
                      <span class="iss-fact-label">${f.label}</span>
                      <span class="iss-fact-value">${f.value}</span>
                    </div>
                  `
                    )
                    .join("")}
                </div>
                <div class="iss-note">${ISS_STATION.modelNote}</div>
                <button type="button" id="iss-btn-inspect-destiny" class="iss-action iss-action--wide">
                  <span>Inspect the Destiny laboratory</span>
                  <span class="iss-action-arrow" aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          `;
          const btnDest = rightPanel.querySelector("#iss-btn-inspect-destiny");
          if (btnDest) btnDest.addEventListener("click", () => this.selectPart("destiny"));
        } else {
          const cat = CATEGORY_BY_ID.get(part.category);
          const facts = [...(part.mass ? [{ label: "Mass", value: part.mass }] : []), ...part.facts];
          rightPanel.innerHTML = `
            <div class="iss-panel-head iss-panel-head--split">
              <div>
                <span class="iss-panel-kicker">COMPONENT</span>
                <span class="iss-panel-title">${part.name}</span>
              </div>
              <button type="button" id="iss-btn-clear-sel" class="iss-icon-btn" title="Back to station overview" aria-label="Clear component selection">✕</button>
            </div>
            <div class="iss-panel-scroll">
              <div class="iss-component" style="--iss-cat-color:${cat ? cat.color : SELECT_COLOR};">
                <span class="iss-category">
                  <span class="iss-dot" aria-hidden="true"></span>
                  <span>${cat ? cat.label : "Component"}</span>
                </span>
                <h2 class="iss-hero-title">${part.name}</h2>
                <div class="iss-meta">${part.agency} · ${part.launched}</div>
                <p class="iss-lead">${part.summary}</p>
                <p class="iss-body">${part.description}</p>
                <div class="iss-fact-grid">
                  ${facts
                    .map(
                      (f) => `
                    <div class="iss-fact-card">
                      <span class="iss-fact-label">${f.label}</span>
                      <span class="iss-fact-value">${f.value}</span>
                    </div>
                  `
                    )
                    .join("")}
                </div>
                <div class="iss-action-row">
                  <button type="button" id="iss-btn-focus-part" class="iss-action">
                    <span aria-hidden="true">◎</span><span>Focus camera</span>
                  </button>
                  <button type="button" id="iss-btn-isolate-part" class="iss-action iss-action--ghost">
                    <span aria-hidden="true">▣</span><span>${this.isolateSelected ? "Show all" : "Isolate"}</span>
                  </button>
                </div>
              </div>
            </div>
          `;
          rightPanel.querySelector("#iss-btn-clear-sel").addEventListener("click", () => this.selectPart(null));
          rightPanel.querySelector("#iss-btn-focus-part").addEventListener("click", () => this.focusPart(part.id));
          rightPanel.querySelector("#iss-btn-isolate-part").addEventListener("click", () => {
            this.isolateSelected = !this.isolateSelected;
            this._applyIsolation();
            this._renderShowcasePanels();
          });
        }
      }
    }

    update(delta, elapsed, camera) {
      if (!this.spinGroup) return;

      if (this.autoRotate) {
        this.spinGroup.rotation.y += Math.min(delta, 0.08) * 0.07;
      }

      // Pulse the faint selection lift and the silhouette outline instead of
      // washing out the component's texture.
      if (this.selectedMaterials.length > 0) {
        const intensity = 0.065 + Math.sin(elapsed * 2.4) * 0.012;
        this.selectedMaterials.forEach((mat) => {
          if (mat.emissive) mat.emissiveIntensity = intensity;
        });
      }
      if (this.selectionOutlineMaterials.length > 0) {
        const opacity = 0.36 + Math.sin(elapsed * 2.4) * 0.1;
        this.selectionOutlineMaterials.forEach((mat) => {
          mat.opacity = opacity;
        });
      }

      if (!this.isActive || !camera) return;

      // Smoothly orbit camera around desiredTarget
      this.camTarget.lerp(this.desiredTarget, 1 - Math.exp(-delta * 6));
      this.camSpherical.radius += (this.desiredRadius - this.camSpherical.radius) * (1 - Math.exp(-delta * 6));

      const r = this.camSpherical.radius;
      const sinPhi = Math.sin(this.camSpherical.phi);
      const cosPhi = Math.cos(this.camSpherical.phi);
      const sinTheta = Math.sin(this.camSpherical.theta);
      const cosTheta = Math.cos(this.camSpherical.theta);

      camera.position.set(
        this.camTarget.x + r * sinPhi * sinTheta,
        this.camTarget.y + r * cosPhi,
        this.camTarget.z + r * sinPhi * cosTheta
      );
      camera.lookAt(this.camTarget);

      this._updateFloatingPartLabels(camera);
    }

    _updateFloatingPartLabels(camera) {
      if (!this.labelsContainerEl || !this.spinGroup) return;
      const THREE = window.THREE;
      this.spinGroup.updateMatrixWorld(true);

      ISS_PARTS.forEach((part) => {
        const target = this.targets[part.id];
        if (!target) return;

        let btn = this.labelElements[part.id];
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.className = "iss-floating-label";
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.selectPart(part.id);
          });
          this.labelsContainerEl.appendChild(btn);
          this.labelElements[part.id] = btn;
        }

        const isSelected = part.id === this.selectedPartId;
        const isHovered = part.id === this.hoveredPartId;
        const shouldShow =
          (!this.isolateSelected || !this.selectedPartId || isSelected) &&
          (isSelected || isHovered || (this.labelsVisible && part.priority === 1));

        if (!shouldShow) {
          btn.style.display = "none";
          return;
        }

        const worldPos = this.spinGroup.localToWorld(new THREE.Vector3(...target.center));
        const proj = worldPos.clone().project(camera);
        if (proj.z > 1) {
          btn.style.display = "none";
          return;
        }

        const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
        const color = CATEGORY_BY_ID.get(part.category)?.color || SELECT_COLOR;

        btn.style.display = "inline-flex";
        btn.style.left = `${x.toFixed(1)}px`;
        btn.style.top = `${y.toFixed(1)}px`;
        btn.style.setProperty("--iss-cat-color", color);
        btn.classList.toggle("is-selected", isSelected);
        btn.classList.toggle("is-hovered", isHovered);
        btn.setAttribute("aria-pressed", String(isSelected));
        btn.innerHTML = `<span class="iss-floating-dot" aria-hidden="true"></span><span>${part.shortName}</span>`;
      });
    }
  }

  window.ISS_PARTS = ISS_PARTS;
  window.ISSShowcaseManager = ISSShowcaseManager;
  window.issShowcase = new ISSShowcaseManager();
})(window);
