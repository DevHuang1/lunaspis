#!/usr/bin/env node
/**
 * Crew model regression checks.
 *
 * These guard the asset contract the game relies on:
 *   - feet-at-origin (min Y = 0) so the LCC loader must not half-height-center
 *   - the astronaut-compatible 22-bone humanoid skeleton
 *   - idle / walk / look_around / wave clips
 *   - procedural materials only (no external texture dependencies)
 *
 * Run: node tests/crew/run_checks.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PUBLIC = path.join(ROOT, "public");
const MODELS = [
  { id: "crew_a", height: [1.80, 1.95], file: "crew_a.glb" },
  { id: "crew_b", height: [1.68, 1.85], file: "crew_b.glb" },
];

const REQUIRED_BONES = [
  "hips", "spine", "spine1", "chest", "neck", "head",
  "shoulder_L", "upperarm_L", "forearm_L", "hand_L",
  "shoulder_R", "upperarm_R", "forearm_R", "hand_R",
  "thigh_L", "calf_L", "foot_L", "toe_L",
  "thigh_R", "calf_R", "foot_R", "toe_R",
];

const REQUIRED_CLIPS = ["idle", "walk", "look_around", "wave"];

function readGlbJson(file) {
  const buffer = fs.readFileSync(file);
  assert.strictEqual(buffer.readUInt32LE(0), 0x46546c67, `${file}: invalid GLB magic`);
  assert.strictEqual(buffer.readUInt32LE(4), 2, `${file}: expected glTF 2.0`);
  const jsonLength = buffer.readUInt32LE(12);
  assert.strictEqual(buffer.readUInt32LE(16), 0x4e4f534a, `${file}: first chunk is not JSON`);
  return JSON.parse(buffer.slice(20, 20 + jsonLength).toString("utf8"));
}

function meshBounds(json) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  let triangles = 0;
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const position = json.accessors[prim.attributes.POSITION];
      vertices += position.count;
      const index = prim.indices !== undefined ? json.accessors[prim.indices] : null;
      triangles += index ? index.count / 3 : position.count / 3;
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], position.min[axis]);
        max[axis] = Math.max(max[axis], position.max[axis]);
      }
    }
  }
  return { min, max, vertices, triangles };
}

function checkModel(entry) {
  const file = path.join(PUBLIC, "models", "crew", entry.file);
  assert.ok(fs.existsSync(file), `${entry.id}: missing ${file}`);
  const json = readGlbJson(file);
  assert.strictEqual(json.asset.version, "2.0", `${entry.id}: not glTF 2.0`);

  const skin = json.skins && json.skins[0];
  assert.ok(skin, `${entry.id}: no skin`);
  const boneNames = skin.joints.map((index) => json.nodes[index].name);
  for (const bone of REQUIRED_BONES) {
    assert.ok(boneNames.includes(bone), `${entry.id}: missing bone ${bone}`);
  }

  const clips = (json.animations || []).map((animation) => animation.name);
  for (const clip of REQUIRED_CLIPS) {
    assert.ok(clips.includes(clip), `${entry.id}: missing clip ${clip}`);
  }

  assert.strictEqual(json.images ? json.images.length : 0, 0, `${entry.id}: unexpected external image dependency`);
  assert.strictEqual(json.textures ? json.textures.length : 0, 0, `${entry.id}: unexpected texture dependency`);

  const bounds = meshBounds(json);
  assert.ok(Math.abs(bounds.min[1]) < 1e-5, `${entry.id}: feet must start at Y=0, got ${bounds.min[1]}`);
  const height = bounds.max[1] - bounds.min[1];
  assert.ok(
    height >= entry.height[0] && height <= entry.height[1],
    `${entry.id}: unexpected height ${height.toFixed(3)}m`
  );
  assert.ok(bounds.vertices < 90000, `${entry.id}: vertex budget exceeded (${bounds.vertices})`);
  assert.ok(bounds.triangles < 180000, `${entry.id}: triangle budget exceeded (${Math.round(bounds.triangles)})`);
  assert.ok(fs.statSync(file).size < 5 * 1024 * 1024, `${entry.id}: GLB exceeds 5 MB`);

  console.log(
    `  ${entry.id}: ${height.toFixed(2)}m, ${bounds.vertices} verts, ` +
    `${Math.round(bounds.triangles)} tris, clips ${clips.join("/")}`
  );
}

function checkLoaderOrigin() {
  const manager = fs.readFileSync(path.join(PUBLIC, "js", "core", "glb_manager.js"), "utf8");
  const feetEntries = manager.match(/origin:\s*"feet"/g) || [];
  assert.ok(feetEntries.length >= 2, "crew_a/crew_b must declare origin: \"feet\" in the catalog");
  assert.ok(
    /feetOrigin[\s\S]{0,220}center:\s*!feetOrigin/.test(manager),
    "instantiateModel() must keep feet-origin crew uncentered"
  );
  console.log("  loader: feet-origin grounding path present");
}

console.log("Crew model checks:");
for (const entry of MODELS) checkModel(entry);
checkLoaderOrigin();
console.log("Crew model checks passed.");
