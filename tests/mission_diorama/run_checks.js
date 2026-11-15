/**
 * Mission payload diorama checks.
 *
 * Builds every mission-specific hologram with a small Three.js stub so the
 * ISS interior module can be exercised without a browser or WebGL context.
 */
const fs = require("fs");
const path = require("path");

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
}
class Color {
  constructor(value) { this.value = value; }
  set(value) { this.value = value; return this; }
  setHex(value) { this.value = value; return this; }
  getHex() { return this.value; }
}
class Object3D {
  constructor() {
    this.children = [];
    this.position = new Vec3();
    this.rotation = new Vec3();
    this.scale = new Vec3(1, 1, 1);
    this.userData = {};
    this.visible = true;
  }
  add(...objects) { this.children.push(...objects); return this; }
  remove(object) { const i = this.children.indexOf(object); if (i >= 0) this.children.splice(i, 1); return this; }
  traverse(cb) { cb(this); this.children.forEach((child) => child.traverse && child.traverse(cb)); }
  getObjectByName() { return null; }
}
class Group extends Object3D {}
class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
class Geometry {
  constructor() {
    this.attributes = {
      position: {
        count: 12,
        getX: () => 0.1,
        getY: () => 0.2,
        getZ: () => 0.3,
        setXYZ: () => {}
      }
    };
  }
  dispose() {}
  computeVertexNormals() {}
}
class Material {
  constructor(options = {}) {
    Object.assign(this, options);
    this.color = new Color(options.color);
    this.emissive = new Color(options.emissive);
    this.userData = options.userData || {};
    this.map = options.map || null;
  }
  dispose() {}
}
class MeshStandardMaterial extends Material {}
class MeshBasicMaterial extends Material {}
class PointLight extends Object3D {
  constructor(color, intensity, distance, decay) {
    super();
    this.color = new Color(color);
    this.intensity = intensity;
    this.distance = distance;
    this.decay = decay;
  }
}
class CanvasTexture {
  constructor(element) { this.element = element; this.anisotropy = 1; this.needsUpdate = false; }
  dispose() {}
}

const THREE = {
  Group,
  Mesh,
  Color,
  PointLight,
  CanvasTexture,
  Vector3: Vec3,
  SphereGeometry: Geometry,
  BoxGeometry: Geometry,
  CylinderGeometry: Geometry,
  ConeGeometry: Geometry,
  TorusGeometry: Geometry,
  CircleGeometry: Geometry,
  PlaneGeometry: Geometry,
  IcosahedronGeometry: Geometry,
  OctahedronGeometry: Geometry,
  MeshStandardMaterial,
  MeshBasicMaterial
};

const fakeDocument = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return new Proxy({}, { get: () => () => {} });
      }
    };
  },
  getElementById() { return null; },
  querySelector() { return null; },
  addEventListener() {}
};

const fakeWindow = {
  THREE,
  isMobileDevice: false,
  document: fakeDocument,
  addEventListener() {},
  performance: { now: () => 0 },
  gameStarted: false,
  gameplay: {
    missionDesign: {
      scenarioId: "bionutrients_2",
      bioBagId: "fep_3mil_iss_002",
      bioThermalId: "inc_30c_melfi_80c",
      cubesatFormId: "6u",
      wavelengthId: "near_ir"
    },
    getMissionPresentation(scenarioId) {
      return {
        destination: scenarioId === "bionutrients_2" ? "STATION" : "SPACE",
        title: scenarioId === "bionutrients_2" ? "VITAMIN LAB" : "MISSION",
        accent: scenarioId === "bionutrients_2" ? "#fb7185" : "#67e8f9"
      };
    }
  }
};

const code = fs.readFileSync(path.join(__dirname, "../../public/js/world/ship_interior.js"), "utf8");
const load = new Function("window", "document", code);
load(fakeWindow, fakeDocument);

const manager = fakeWindow.shipInterior;
if (!manager || !manager._buildMissionDioramaModel) {
  throw new Error("ShipInteriorManager did not load");
}

const scenarios = [
  "artemis_expedition",
  "cubesat_101",
  "bionutrients_2",
  "sandbox"
];

const variants = [
  {
    bagId: "fep_3mil_iss_002",
    thermalId: "inc_30c_melfi_80c",
    yieldOk: true,
    incubateTempC: 30,
    storageTempC: -80,
    cubesatFormId: "6u",
    wavelengthId: "near_ir"
  },
  {
    bagId: "fep_5mil_hd_002",
    thermalId: "inc_42c_melfi_80c",
    yieldOk: false,
    incubateTempC: 42,
    storageTempC: -80,
    cubesatFormId: "3u",
    wavelengthId: "mid_ir"
  },
  {
    bagId: "fep_3mil_iss_002",
    thermalId: "inc_30c_coldbag_4c",
    yieldOk: false,
    incubateTempC: 30,
    storageTempC: 4,
    cubesatFormId: "12u",
    wavelengthId: "xray"
  }
];

for (const id of scenarios) {
  for (const state of variants) {
    const result = manager._buildMissionDioramaModel(id, state, "#67e8f9");
    if (!result || !result.group || !Array.isArray(result.pulseMats)) {
      throw new Error(`Bad diorama result for ${id}`);
    }
  }
  console.log(`${id}: built ${variants.length} variants`);
}

const parent = new Group();
manager._buildMissionDiorama(parent);
if (!manager.missionDiorama || !manager.missionDiorama.model) {
  throw new Error("Mission diorama table did not initialize");
}
for (const id of scenarios) {
  manager.setMissionDioramaScenario(id, variants[0]);
  if (!manager.missionDiorama.model || manager.missionDiorama.scenarioId !== id) {
    throw new Error(`Mission diorama did not switch to ${id}`);
  }
}
console.log("Mission diorama table initializes and switches scenarios");

console.log("All mission dioramas built successfully");
