/**
 * ============================================================================
 * INTERFELLAS HIGH-PERFORMANCE 3D GLB/glTF ASSET & HANGAR ENGINE (SPACESHIP EDITION)
 * ============================================================================
 * Provides comprehensive, production-grade .glb/.gltf 3D model support ported from
 * SpaceShip (Perilune — Orbital / Mission Lab):
 * 1. Asynchronous multi-asset loading & in-memory caching with Draco, KTX2/Basis
 *    Universal, and Meshopt decompression support
 * 2. SpaceShip NASA Astronaut suit integration (astronaut_lod0.glb & astronaut_lod1.glb)
 *    with 4 skeletal animation clips ('idle', 'walk', 'look_around', 'wave'),
 *    radial ground contact shadow, and role accent ring
 * 3. SpaceShip NASA ISS 3D Models (ISS_stationary_opt.glb & ISS_B.glb) + Orbital Fleet
 * 4. Full-window Drag-and-Drop & File Picker for custom user .glb/.gltf models
 * 5. Interactive 3D Model Hangar & Inspector (real-time 3D turntable, wireframe,
 *    polygon/vertex stats, PBR lighting, 1-click equip and spawn)
 */

(function (window) {
  "use strict";

  const GLB_CATALOG = {
    // --- SPACESHIP PRIMARY ASTRONAUT RIGS ---
    "astronaut_lod0": {
      id: "astronaut_lod0",
      name: "Perilune NASA Astronaut (LOD0 High-Detail)",
      category: "astronauts",
      role: "commander",
      file: "models/astronaut/astronaut_lod0.glb",
      defaultColor: "#67e8f9",
      targetHeight: 1.90,
      rotateY: 0,
      description: "High-detail SpaceShip NASA spacesuit rig with KTX2 2K PBR textures, Meshopt geometry, and 4 skeletal animation clips (idle, walk, look_around, wave)."
    },
    "astronaut_lod1": {
      id: "astronaut_lod1",
      name: "Perilune NASA Crewmate (LOD1 Optimized)",
      category: "astronauts",
      role: "scientist",
      file: "models/astronaut/astronaut_lod1.glb",
      defaultColor: "#f59e0b",
      targetHeight: 1.90,
      rotateY: 0,
      description: "Optimized SpaceShip NASA spacesuit rig with 1K KTX2 textures and 4 skeletal animations for AI crew and multiplayer squad."
    },

    // --- SPACESHIP PRIMARY ISS & SPACECRAFT MODELS ---
    "iss_stationary_opt": {
      id: "iss_stationary_opt",
      name: "NASA International Space Station (Perilune Primary)",
      category: "spacecraft",
      file: "models/iss/ISS_stationary_opt.glb",
      scale: 1.0,
      targetHeight: 5.0,
      description: "SpaceShip primary Draco + WebP compressed 2011-era NASA ISS model with 27 curated interactive parts: Zarya, Zvezda, Destiny, Columbus, Kibo, Harmony, Cupola, Quest, Canadarm2, and solar wings."
    },
    "iss_b": {
      id: "iss_b",
      name: "NASA ISS Alternate Configuration (ISS_B)",
      category: "spacecraft",
      file: "models/iss/ISS_B.glb",
      scale: 1.0,
      targetHeight: 5.0,
      description: "SpaceShip secondary Draco-compressed NASA International Space Station configuration."
    },
    "orbiter_v2": {
      id: "orbiter_v2",
      name: "NASA Space Shuttle Orbiter (Orbiter V2)",
      category: "spacecraft",
      file: "assets/Orbiter_V2.glb",
      scale: 1.0,
      description: "Reusable orbital crew spacecraft with payload bay doors, SSME nozzles, and forward ODS docking ring."
    },
    "external_tank": {
      id: "external_tank",
      name: "Cryogenic External Tank (LH2 / LOX)",
      category: "spacecraft",
      file: "assets/ExternalTank.glb",
      scale: 1.0,
      description: "Cryogenic liquid hydrogen and liquid oxygen propellant backbone tank for launch ascent."
    },
    "solid_rocket_booster": {
      id: "solid_rocket_booster",
      name: "Solid Rocket Booster (SRB)",
      category: "spacecraft",
      file: "assets/SolidRocketBooster.glb",
      scale: 1.0,
      description: "High-thrust solid propellant booster for first-stage liftoff and tower clearance."
    },
    "satellite": {
      id: "satellite",
      name: "Deployable Science & Comms Satellite",
      category: "spacecraft",
      file: "assets/Satellite.glb",
      scale: 1.0,
      description: "Orbital scientific payload with unfolding solar wings and high-gain dish boom."
    },
    "modular_spacecraft_bus_smallsat": {
      id: "modular_spacecraft_bus_smallsat",
      name: "12U / ESPA MicroSat Bus",
      category: "spacecraft",
      file: "assets/modular_spacecraft_bus_smallsat.glb",
      scale: 1.0,
      description: "Compact low-mass satellite bus for focused LEO Earth observation and technology demonstration."
    },
    "modular_spacecraft_bus_hex": {
      id: "modular_spacecraft_bus_hex",
      name: "Modular Hex Standard Spacecraft Bus",
      category: "spacecraft",
      file: "assets/modular_spacecraft_bus_hex.glb",
      scale: 1.0,
      description: "Balanced 3-axis stabilized hexagonal spacecraft bus for multi-instrument SSO and lunar missions."
    },
    "modular_spacecraft_bus_heavy": {
      id: "modular_spacecraft_bus_heavy",
      name: "Deep-Space Heavy Explorer Bus",
      category: "spacecraft",
      file: "assets/modular_spacecraft_bus_heavy.glb",
      scale: 1.0,
      description: "High-capacity deep-space spacecraft bus with radiation vault, high-gain comms, and large propellant tanks."
    },
    "modular_spacecraft_fully_configured": {
      id: "modular_spacecraft_fully_configured",
      name: "Integrated Multi-Instrument Observatory",
      category: "spacecraft",
      file: "assets/modular_spacecraft_fully_configured.glb",
      scale: 1.0,
      description: "Fully integrated spacecraft configuration with deployable solar arrays, SAR antenna, optical imager, and Ka-band dish."
    }
  };

  // Crew expressions. The GLB rigs ship with idle / walk / look_around / wave
  // clips; every expression layers a procedural arm/hand gesture on top of the
  // skeletal clip so the crew actually talk with their hands, plus a floating
  // emoji bubble so astronauts can communicate non-verbally.
  const EMOTE_DEFS = [
    { id: "wave", icon: "WAV", label: "Wave", clip: "wave", duration: 2.6, gesture: "wave" },
    { id: "salute", icon: "SAL", label: "Salute", clip: "idle", duration: 2.4, gesture: "salute" },
    { id: "dance", icon: "DNC", label: "Dance", clip: "idle", duration: 3.8, procedural: "dance", gesture: "dance" },
    { id: "laugh", icon: "LGH", label: "Laugh", clip: "idle", duration: 2.8, procedural: "laugh", gesture: "laugh" },
    { id: "look", icon: "OBS", label: "Look", clip: "look_around", duration: 3.0, gesture: "look" },
    { id: "heart", icon: "ACK", label: "Roger", clip: "idle", duration: 3.0, procedural: "heart", gesture: "heart" }
  ];
  const EMOTE_BY_ID = {};
  EMOTE_DEFS.forEach((def) => { EMOTE_BY_ID[def.id] = def; });
  window.ASTRONAUT_EMOTES = EMOTE_DEFS;

  function createEmoteBubble() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    const texture = new window.THREE.CanvasTexture(canvas);
    texture.minFilter = window.THREE.LinearFilter;
    texture.magFilter = window.THREE.LinearFilter;

    const sprite = new window.THREE.Sprite(
      new window.THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        opacity: 0
      })
    );
    sprite.visible = false;
    sprite.scale.set(0.8, 0.8, 1);
    sprite.position.set(0, 2.85, 0);
    return { sprite, canvas, ctx, texture };
  }

  function drawEmoteBubble(bubble, def) {
    // Interfellas: the STS_OS label style (os_plate.js) when loaded, so emotes match the nameplates and HUD
    if (window.OsPlate && window.OsPlate.drawEmote) { window.OsPlate.drawEmote(bubble, def); bubble.texture.needsUpdate = true; return; }
    const { ctx, canvas, texture } = bubble;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.save();

    // Soft navy speech bubble with a small tail.
    const glow = ctx.createRadialGradient(w / 2, h * 0.44, 12, w / 2, h * 0.44, h * 0.46);
    glow.addColorStop(0, "rgba(14, 24, 40, 0.97)");
    glow.addColorStop(0.72, "rgba(8, 15, 27, 0.95)");
    glow.addColorStop(1, "rgba(8, 15, 27, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.44, h * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(103, 232, 249, 0.9)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.44, h * 0.36, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(8, 15, 27, 0.95)";
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h * 0.76);
    ctx.lineTo(w * 0.5, h * 0.97);
    ctx.lineTo(w * 0.58, h * 0.76);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(103, 232, 249, 0.5)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "108px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
    ctx.fillText(def.icon, w / 2, h * 0.41);

    ctx.font = "800 19px 'SF Mono', Monaco, Consolas, monospace";
    ctx.fillStyle = "rgba(236, 231, 220, 0.96)";
    ctx.fillText(def.label.toUpperCase(), w / 2, h * 0.7);

    ctx.restore();
    texture.needsUpdate = true;
  }

  // -------------------------------------------------------------------------
  // Procedural crew gesture posing
  //
  // The astronaut GLB has a full humanoid skeleton (upperarm / forearm / hand
  // and finger bones). Emotes therefore solve a small two-bone IK chain for
  // each arm every frame, so hands genuinely reach the head, cover the visor,
  // salute, wave, etc. instead of relying only on whole-body bobbing.
  // -------------------------------------------------------------------------
  const EMOTE_SIDES = [
    { key: "left", upper: "upperarm_L", fore: "forearm_L", hand: "hand_L", palmSign: 1 },
    { key: "right", upper: "upperarm_R", fore: "forearm_R", hand: "hand_R", palmSign: -1 }
  ];

  function bindEmoteBones(rig, model) {
    const bones = {};
    model.traverse((obj) => {
      if (!obj.name) return;
      if (/^(hips|spine|spine1|chest|neck|head|shoulder_[LR]|upperarm_[LR]|forearm_[LR]|hand_[LR])$/.test(obj.name)) {
        bones[obj.name] = obj;
      }
    });
    rig.bones = bones;
    rig.model = model;
    rig.modelScale = 1;
    const worldScale = new window.THREE.Vector3();
    model.getWorldScale(worldScale);
    if (worldScale.x > 0.0001) rig.modelScale = worldScale.x;
  }

  // Returns hand targets/elbow poles/palm orientation in character-local space.
  // Offsets are relative to the head bone, which keeps every gesture locked to
  // the astronaut's head even while the body bobs and sways.
  function buildEmoteGesturePose(gesture, t) {
    const v = (x, y, z) => new window.THREE.Vector3(x, y, z);

    switch (gesture) {
      case "wave": {
        const wave = Math.sin(t * 8.5) * 0.085;
        return {
          frame: "model",
          right: {
            offset: v(-0.30 + wave, 0.25 + Math.sin(t * 4.2) * 0.015, 0.10),
            pole: v(-1.0, -0.45, 0.05),
            finger: v(0, 1, 0),
            palm: v(0, 0, 1)
          }
        };
      }

      case "salute":
        return {
          frame: "head",
          right: {
            offset: v(-0.175, 0.115, 0.135),
            pole: v(-1.0, -0.45, 0.3),
            finger: v(1.0, 0.20, 0.0),
            palm: v(0, -1, 0)
          }
        };

      case "look": {
        const scan = Math.sin(t * 1.5) * 0.055;
        return {
          frame: "head",
          right: {
            offset: v(-0.10 + scan, 0.135, 0.215),
            pole: v(-1.0, -0.55, 0.35),
            finger: v(1.0, 0.12, 0.0),
            palm: v(0, -1, 0)
          }
        };
      }

      case "laugh": {
        // Both gloved hands pressed over the visor while the shoulders shake.
        const shake = Math.sin(t * 16.0);
        const bounce = Math.abs(shake) * 0.014;
        return {
          frame: "head",
          left: {
            offset: v(0.105 + shake * 0.006, 0.035 + bounce, 0.185),
            pole: v(1.0, -0.65, 0.15),
            finger: v(-0.28, 1.0, 0.05),
            palm: v(0, 0, -1)
          },
          right: {
            offset: v(-0.105 + shake * 0.006, 0.035 - bounce, 0.185),
            pole: v(-1.0, -0.65, 0.15),
            finger: v(0.28, 1.0, 0.05),
            palm: v(0, 0, -1)
          }
        };
      }

      case "dance": {
        const pump = Math.sin(t * 6.5);
        return {
          frame: "model",
          left: {
            offset: v(0.30, 0.25 + pump * 0.12, 0.11),
            pole: v(1.0, 0.10, 0.25),
            finger: v(0.15, 1.0, 0.0),
            palm: v(0, 0, 1)
          },
          right: {
            offset: v(-0.30, 0.25 - pump * 0.12, 0.11),
            pole: v(-1.0, 0.10, 0.25),
            finger: v(-0.15, 1.0, 0.0),
            palm: v(0, 0, 1)
          }
        };
      }

      case "heart": {
        // Both hands meet above the helmet, palms facing each other, elbows
        // rounded out so the arms read as a heart symbol.
        const pulse = Math.sin(t * 3.0) * 0.008;
        return {
          frame: "model",
          left: {
            offset: v(0.035, 0.30 + pulse, 0.16),
            pole: v(1.0, 0.18, 0.4),
            finger: v(0.10, 1.0, 0.03),
            palm: v(-1.0, 0.0, 0.0)
          },
          right: {
            offset: v(-0.035, 0.30 + pulse, 0.16),
            pole: v(-1.0, 0.18, 0.4),
            finger: v(-0.10, 1.0, 0.03),
            palm: v(1.0, 0.0, 0.0)
          }
        };
      }

      default:
        return null;
    }
  }

  // Rotates a limb bone so its child joint points at the supplied world target.
  function aimEmoteBone(bone, child, target, weight) {
    const T = window.THREE;
    const bonePos = bone.getWorldPosition(new T.Vector3());
    const childPos = child.getWorldPosition(new T.Vector3());
    const currentDir = childPos.sub(bonePos);
    const targetDir = target.clone().sub(bonePos);
    if (currentDir.lengthSq() < 1e-8 || targetDir.lengthSq() < 1e-8) return;

    currentDir.normalize();
    targetDir.normalize();

    const worldQuat = bone.getWorldQuaternion(new T.Quaternion());
    const deltaQuat = new T.Quaternion().setFromUnitVectors(currentDir, targetDir);
    const targetWorldQuat = deltaQuat.multiply(worldQuat);
    const parentWorldQuat = bone.parent.getWorldQuaternion(new T.Quaternion());
    const targetLocalQuat = parentWorldQuat.invert().multiply(targetWorldQuat);

    if (weight >= 0.999) bone.quaternion.copy(targetLocalQuat);
    else bone.quaternion.slerp(targetLocalQuat, weight);
    bone.updateWorldMatrix(false, true);
  }

  // Orients the wrist using a finger direction + palm normal so hands face the
  // right way (palms toward the visor for laugh, palms together for heart, ...).
  function aimEmoteHand(hand, targetWorldQuat, weight) {
    const T = window.THREE;
    const parentWorldQuat = hand.parent.getWorldQuaternion(new T.Quaternion());
    const targetLocalQuat = parentWorldQuat.invert().multiply(targetWorldQuat);
    if (weight >= 0.999) hand.quaternion.copy(targetLocalQuat);
    else hand.quaternion.slerp(targetLocalQuat, weight);
    hand.updateWorldMatrix(false, true);
  }

  function applyEmoteHandPose(rig, elapsed, def, weight) {
    const T = window.THREE;
    if (!rig || !rig.bones || !rig.model || !rig.modelContainer) return;
    if (!def || !def.gesture || weight <= 0.002) return;

    const bones = rig.bones;
    if (!bones.head) return;

    const pose = buildEmoteGesturePose(def.gesture, elapsed);
    if (!pose) return;

    rig.root.updateMatrixWorld(true);

    const headPos = bones.head.getWorldPosition(new T.Vector3());
    const headQuat = bones.head.getWorldQuaternion(new T.Quaternion());
    const modelQuat = rig.modelContainer.getWorldQuaternion(new T.Quaternion());
    const frameQuat = pose.frame === "head" ? headQuat : modelQuat;
    const scale = rig.modelScale || 1;

    for (let i = 0; i < EMOTE_SIDES.length; i++) {
      const side = EMOTE_SIDES[i];
      const spec = pose[side.key];
      if (!spec) continue;

      const upper = bones[side.upper];
      const fore = bones[side.fore];
      const hand = bones[side.hand];
      if (!upper || !fore || !hand) continue;

      // World-space wrist target, offset from the animated head position.
      const target = headPos.clone()
        .add(spec.offset.clone().multiplyScalar(scale).applyQuaternion(frameQuat));

      const shoulderPos = upper.getWorldPosition(new T.Vector3());
      const elbowPos = fore.getWorldPosition(new T.Vector3());
      const wristPos = hand.getWorldPosition(new T.Vector3());
      const upperLen = shoulderPos.distanceTo(elbowPos);
      const foreLen = elbowPos.distanceTo(wristPos);
      if (upperLen < 1e-4 || foreLen < 1e-4) continue;

      const toTarget = target.clone().sub(shoulderPos);
      let dist = toTarget.length();
      if (dist < 1e-4) continue;

      const minReach = Math.abs(upperLen - foreLen) * 0.98;
      const maxReach = (upperLen + foreLen) * 0.995;
      dist = Math.max(minReach, Math.min(maxReach, dist));
      toTarget.normalize();
      target.copy(shoulderPos).addScaledVector(toTarget, dist);

      // Law-of-cosines elbow placement around a body-relative pole vector.
      const along = (upperLen * upperLen - foreLen * foreLen + dist * dist) / (2 * dist);
      const out = Math.sqrt(Math.max(0, upperLen * upperLen - along * along));
      const poleDir = spec.pole.clone().applyQuaternion(modelQuat);
      poleDir.addScaledVector(toTarget, -poleDir.dot(toTarget));
      if (poleDir.lengthSq() < 1e-8) poleDir.set(0, -1, 0);
      poleDir.normalize();

      const elbowTarget = shoulderPos.clone()
        .addScaledVector(toTarget, along)
        .addScaledVector(poleDir, out);

      aimEmoteBone(upper, fore, elbowTarget, weight);
      aimEmoteBone(fore, hand, target, weight);

      // Wrist orientation: fingers along +Y, palm normal along local +X.
      const fingerDir = spec.finger.clone().applyQuaternion(frameQuat).normalize();
      let palmNormal = spec.palm.clone().applyQuaternion(frameQuat);
      palmNormal.addScaledVector(fingerDir, -palmNormal.dot(fingerDir));
      if (palmNormal.lengthSq() < 1e-8) {
        palmNormal = new T.Vector3(0, 0, side.palmSign).applyQuaternion(frameQuat);
      }
      palmNormal.normalize().multiplyScalar(side.palmSign);

      const zAxis = new T.Vector3().crossVectors(palmNormal, fingerDir).normalize();
      const xAxis = new T.Vector3().crossVectors(fingerDir, zAxis).normalize();
      const handMatrix = new T.Matrix4().makeBasis(xAxis, fingerDir, zAxis);
      const handWorldQuat = new T.Quaternion().setFromRotationMatrix(handMatrix);
      aimEmoteHand(hand, handWorldQuat, weight);
    }
  }

  let sharedShadowTex = null;
  function getGroundShadowTexture() {
    if (sharedShadowTex) return sharedShadowTex;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(0, 0, 0, 0.55)");
    g.addColorStop(0.55, "rgba(0, 0, 0, 0.22)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new window.THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    sharedShadowTex = tex;
    return tex;
  }

  let sharedDracoLoader = null;
  let sharedKTX2Loader = null;

  class GLBManager {
    constructor() {
      this.catalog = GLB_CATALOG;
      this.cache = {}; // url -> { gltf, meta }
      this.loadingPromises = {}; // url -> Promise
      this.customModels = {}; // id -> { id, name, gltf, meta, isCustom: true }
      this.selectedAvatarModelId = "astronaut_lod0";
      this.spawnedFleet = [];
      this.activeMixers = [];

      // Hangar Modal & Turntable State
      this.hangarActive = false;
      this.hangarScene = null;
      this.hangarCamera = null;
      this.hangarRenderer = null;
      this.hangarModelGroup = null;
      this.hangarAnimFrame = null;
      this.hangarClock = null;
      this.hangarCurrentModel = null;
      this.hangarAutoRotate = true;
      this.hangarWireframe = false;
      this.hangarColorTest = "#67e8f9";
      this.hangarMouse = { down: false, x: 0, y: 0, rotX: 0.2, rotY: 0.8, dist: 3.5 };

      this._initDragAndDrop();
    }

    /**
     * Configures a GLTFLoader instance with Draco, KTX2/Basis Universal, and Meshopt decoders.
     */
    _configureGLTFLoader(loader) {
      if (window.THREE.DRACOLoader) {
        if (!sharedDracoLoader) {
          sharedDracoLoader = new window.THREE.DRACOLoader();
          sharedDracoLoader.setDecoderPath("draco/");
        }
        loader.setDRACOLoader(sharedDracoLoader);
      }
      if (window.THREE.KTX2Loader && typeof loader.setKTX2Loader === "function") {
        if (!sharedKTX2Loader) {
          sharedKTX2Loader = new window.THREE.KTX2Loader();
          sharedKTX2Loader.setTranscoderPath("basis/");
          if (window.renderer) {
            sharedKTX2Loader.detectSupport(window.renderer);
          }
        }
        loader.setKTX2Loader(sharedKTX2Loader);
      }
      const meshopt = window.MeshoptDecoder || (window.THREE && window.THREE.MeshoptDecoder);
      if (meshopt && typeof loader.setMeshoptDecoder === "function") {
        loader.setMeshoptDecoder(meshopt);
      }
    }

    /**
     * Maps player station role to SpaceShip astronaut model ID.
     */
    getModelIdForRole(role, isLocal = false) {
      if (isLocal) return "astronaut_lod0";
      const r = (role || "commander").toLowerCase();
      if (r === "commander") return "astronaut_lod0";
      return "astronaut_lod1";
    }

    /**
     * Loads a .glb or .gltf file asynchronously with automatic caching and geometry analysis.
     */
    loadGLB(url, onProgress) {
      if (this.cache[url]) {
        return Promise.resolve(this.cache[url]);
      }
      if (this.loadingPromises[url]) {
        return this.loadingPromises[url];
      }

      const p = new Promise((resolve, reject) => {
        if (!window.THREE || !window.THREE.GLTFLoader) {
          reject(new Error("THREE.GLTFLoader is not available."));
          return;
        }

        const loader = new window.THREE.GLTFLoader();
        this._configureGLTFLoader(loader);

        loader.load(
          url,
          (gltf) => {
            const meta = this._analyzeGLTF(gltf, url);
            const entry = { gltf, meta, url };
            this.cache[url] = entry;
            // Also index by catalog ID if matching
            Object.keys(this.catalog).forEach((k) => {
              if (this.catalog[k].file === url) {
                this.cache[k] = entry;
              }
            });
            delete this.loadingPromises[url];
            resolve(entry);
          },
          (xhr) => {
            if (onProgress && xhr.total) {
              const pct = Math.round((xhr.loaded / xhr.total) * 100);
              onProgress(pct, xhr.loaded, xhr.total);
            }
          },
          (err) => {
            console.error(`Failed to load GLB model from ${url}:`, err);
            delete this.loadingPromises[url];
            reject(err);
          }
        );
      });

      this.loadingPromises[url] = p;
      return p;
    }

    /**
     * Parses an ArrayBuffer containing raw .glb binary data (for user drag & drop / file picker).
     */
    loadArrayBuffer(arrayBuffer, filename = "custom_model.glb") {
      return new Promise((resolve, reject) => {
        if (!window.THREE || !window.THREE.GLTFLoader) {
          reject(new Error("THREE.GLTFLoader is not available."));
          return;
        }

        const loader = new window.THREE.GLTFLoader();
        this._configureGLTFLoader(loader);

        loader.parse(
          arrayBuffer,
          "",
          (gltf) => {
            const id = "custom_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
            const meta = this._analyzeGLTF(gltf, filename);
            const cleanName = filename.replace(/\.(glb|gltf)$/i, "").replace(/[_-]/g, " ");
            const item = {
              id,
              name: cleanName.toUpperCase(),
              category: "custom",
              file: filename,
              defaultColor: "#67e8f9",
              targetHeight: 1.90,
              isCustom: true,
              gltf,
              meta,
              description: `User-imported 3D model (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB, ${meta.triangles.toLocaleString()} triangles).`
            };
            this.customModels[id] = item;
            this.catalog[id] = item;
            this.cache[id] = { gltf, meta, url: id };
            resolve(item);
          },
          (err) => {
            console.error("Failed to parse custom GLB ArrayBuffer:", err);
            reject(err);
          }
        );
      });
    }

    /**
     * Analyzes model hierarchy, bounding box dimensions, polygon count, and materials.
     */
    _analyzeGLTF(gltf, source) {
      let vertices = 0;
      let triangles = 0;
      let meshCount = 0;
      const materials = new Set();
      const nodeNames = [];

      const box = new window.THREE.Box3();
      box.setFromObject(gltf.scene);

      gltf.scene.traverse((obj) => {
        if (obj.name) nodeNames.push(obj.name);
        if (obj.isMesh) {
          meshCount++;
          if (obj.geometry) {
            const geom = obj.geometry;
            if (geom.attributes && geom.attributes.position) {
              vertices += geom.attributes.position.count;
            }
            if (geom.index) {
              triangles += Math.floor(geom.index.count / 3);
            } else if (geom.attributes && geom.attributes.position) {
              triangles += Math.floor(geom.attributes.position.count / 3);
            }
          }
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => materials.add(m.name || "Material"));
            } else {
              materials.add(obj.material.name || "Material");
            }
          }
        }
      });

      const size = new window.THREE.Vector3();
      box.getSize(size);
      const center = new window.THREE.Vector3();
      box.getCenter(center);

      return {
        source,
        vertices,
        triangles,
        meshCount,
        materialCount: materials.size,
        materials: Array.from(materials),
        nodeNames,
        box: {
          min: [box.min.x, box.min.y, box.min.z],
          max: [box.max.x, box.max.y, box.max.z],
          size: [size.x, size.y, size.z],
          center: [center.x, center.y, center.z]
        },
        hasAnimations: !!(gltf.animations && gltf.animations.length > 0),
        animationCount: gltf.animations ? gltf.animations.length : 0
      };
    }

    /**
     * Clones and tunes a GLB model hierarchy for in-game use.
     */
    instantiateModel(modelKeyOrUrl, options = {}) {
      const entry = this.catalog[modelKeyOrUrl];
      const url = entry ? entry.file : modelKeyOrUrl;

      const cacheEntry = this.cache[modelKeyOrUrl] || this.cache[url];
      if (!cacheEntry) {
        throw new Error(`Model not yet loaded in cache: ${modelKeyOrUrl}`);
      }

      const rawScene = cacheEntry.gltf.scene;
      let cloned;
      if (window.THREE.SkeletonUtils && typeof window.THREE.SkeletonUtils.clone === "function") {
        cloned = window.THREE.SkeletonUtils.clone(rawScene);
      } else {
        cloned = rawScene.clone(true);
      }

      const suitColor = options.suitColor || (entry ? entry.defaultColor : null);
      const castShadow = options.castShadow !== false;
      const receiveShadow = options.receiveShadow !== false;
      const enhancePBR = options.enhancePBR !== false;

      cloned.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = castShadow;
          obj.receiveShadow = receiveShadow;
          obj.frustumCulled = false;

          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            const tunedMats = mats.map((mat) => {
              const m = mat.clone();
              if (enhancePBR) {
                m.envMapIntensity = 1.1;
                if (typeof m.roughness === "number") {
                  m.roughness = Math.min(0.95, Math.max(0.15, m.roughness));
                }
                if (/visor/i.test(m.name) || /glass/i.test(m.name)) {
                  m.roughness = 0.08;
                  m.metalness = 0.92;
                }
                if (/gold/i.test(m.name) || /kapton/i.test(m.name)) {
                  m.roughness = 0.22;
                  m.metalness = 0.88;
                }
                if (/led/i.test(m.name) || /telemetry/i.test(m.name) || /screen/i.test(m.name) || /plume/i.test(m.name) || /glow/i.test(m.name)) {
                  m.emissiveIntensity = 2.4;
                  if (!m.emissive || (m.emissive.r === 0 && m.emissive.g === 0 && m.emissive.b === 0)) {
                    m.emissive = m.color.clone();
                  }
                }
              }

              if (suitColor) {
                const isStripe = /stripe/i.test(m.name) || /role/i.test(m.name) || /trim/i.test(m.name) || /insignia/i.test(m.name);
                const isLED = /led/i.test(m.name) || /telemetry/i.test(m.name);
                if (isStripe || isLED) {
                  const hex = parseInt(String(suitColor).replace("#", "0x")) || 0x38bdf8;
                  m.color = new window.THREE.Color(hex);
                  if (m.emissive) {
                    m.emissive = new window.THREE.Color(hex);
                    m.emissiveIntensity = isLED ? 2.8 : 0.4;
                  }
                }
              }

              return m;
            });
            obj.material = Array.isArray(obj.material) ? tunedMats : tunedMats[0];
          }
        }
      });

      const curBox = new window.THREE.Box3().setFromObject(cloned);
      const curSize = new window.THREE.Vector3();
      curBox.getSize(curSize);

      let scaleFactor = options.scale || 1.0;
      if (options.targetHeight && curSize.y > 0.001) {
        scaleFactor = options.targetHeight / curSize.y;
      }
      if (scaleFactor !== 1.0) {
        cloned.scale.set(scaleFactor, scaleFactor, scaleFactor);
      }

      if (options.groundBottom) {
        const scaledBox = new window.THREE.Box3().setFromObject(cloned);
        cloned.position.y = -scaledBox.min.y;
      }

      if (options.center) {
        const scaledBox = new window.THREE.Box3().setFromObject(cloned);
        const center = new window.THREE.Vector3();
        scaledBox.getCenter(center);
        cloned.position.x = -center.x;
        cloned.position.z = -center.z;
        if (!options.groundBottom) {
          cloned.position.y = -center.y;
        }
      }

      const rotY = options.rotateY !== undefined ? options.rotateY : (entry && entry.rotateY !== undefined ? entry.rotateY : 0);
      if (rotY) {
        const wrapper = new window.THREE.Group();
        wrapper.add(cloned);
        wrapper.rotation.y = rotY;
        return wrapper;
      }

      return cloned;
    }

    /**
     * Creates a SpaceShip Astronaut Rig (ported from SpaceShip/src/components/game/astronaut/Astronaut.tsx).
     * Features:
     * - astronaut_lod0.glb / astronaut_lod1.glb skeletal animations ('idle', 'walk', 'look_around', 'wave')
     * - Radial ground contact shadow decal at y = 0.012
     * - Role accent ring at y = 0.035
     * - Overhead billboard nametag and optional helmet lamp
     */
    createAstronautRig(suitHexColor = "#67e8f9", role = "commander", name = "Astronaut", isHost = false, modelKey = null, team = "crew", options = {}) {
      const root = new window.THREE.Group();
      root.name = `Astronaut_${name}_Rig`;

      // Ground contact shadow decal
      const shadowMesh = new window.THREE.Mesh(
        new window.THREE.PlaneGeometry(1.1, 1.1),
        new window.THREE.MeshBasicMaterial({
          map: getGroundShadowTexture(),
          transparent: true,
          depthWrite: false,
          opacity: 0.85
        })
      );
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.y = 0.012;
      root.add(shadowMesh);

      // Role / player accent ring on the floor
      const hexVal = parseInt(String(suitHexColor).replace("#", "0x")) || 0x67e8f9;
      const accentRingMat = new window.THREE.MeshBasicMaterial({
        color: hexVal,
        transparent: true,
        opacity: 0.72,
        side: window.THREE.DoubleSide,
        depthWrite: false
      });
      const accentRing = new window.THREE.Mesh(
        new window.THREE.RingGeometry(0.26, 0.33, 40),
        accentRingMat
      );
      accentRing.rotation.x = -Math.PI / 2;
      accentRing.position.y = 0.035;
      root.add(accentRing);

      // Inner container holding the actual GLB model
      const modelContainer = new window.THREE.Group();
      modelContainer.name = "ModelContainer";
      root.add(modelContainer);

      // Lightweight proxy placeholder while GLB loads asynchronously
      const proxyMat = new window.THREE.MeshStandardMaterial({
        color: hexVal,
        roughness: 0.4,
        metalness: 0.1
      });
      const proxyGroup = new window.THREE.Group();
      const proxyChest = new window.THREE.Mesh(new window.THREE.BoxGeometry(0.46, 0.60, 0.30), proxyMat);
      proxyChest.position.set(0, 1.05, 0);
      const proxyHead = new window.THREE.Mesh(new window.THREE.SphereGeometry(0.22, 16, 12), proxyMat);
      proxyHead.position.set(0, 1.55, 0);
      proxyGroup.add(proxyChest, proxyHead);
      modelContainer.add(proxyGroup);

      // Helmet lamp
      let spot = null;
      if (options.enableLight !== false) {
        spot = new window.THREE.SpotLight(0xffffff, 2.2, 24, Math.PI / 4.5, 0.35);
        spot.position.set(0, 1.50, 0.24);
        const spotTarget = new window.THREE.Object3D();
        spotTarget.position.set(0, 1.4, 6.0);
        root.add(spot);
        root.add(spotTarget);
        spot.target = spotTarget;
      }

      // Overhead Name & Role Label Badge Sprite
      let nameBadge = null;
      if (typeof window.createNameBadgeSprite === "function") {
        nameBadge = window.createNameBadgeSprite(name, suitHexColor, role, isHost, team);
      } else {
        nameBadge = this._createFallbackNameBadge(name, suitHexColor, role, isHost);
      }
      nameBadge.position.set(0, 2.18, 0);
      root.add(nameBadge);

      // Floating emote bubble (hidden until the crewmate expresses themselves)
      const emoteBubble = createEmoteBubble();
      root.add(emoteBubble.sprite);

      // Mock groups for backwards compatibility
      const headGroup = new window.THREE.Group();
      headGroup.position.set(0, 1.55, 0);
      const helmetMeshGroup = new window.THREE.Group();
      headGroup.add(helmetMeshGroup);
      root.add(headGroup);

      const torsoGroup = new window.THREE.Group();
      torsoGroup.position.set(0, 1.05, 0);
      root.add(torsoGroup);

      const leftArm = new window.THREE.Group();
      const rightArm = new window.THREE.Group();
      const leftLeg = new window.THREE.Group();
      const rightLeg = new window.THREE.Group();
      root.add(leftArm, rightArm, leftLeg, rightLeg);

      const rig = {
        root,
        modelContainer,
        shadowMesh,
        accentRing,
        accentRingMat,
        headGroup,
        helmetMeshGroup,
        torsoGroup,
        leftArm,
        rightArm,
        leftLeg,
        rightLeg,
        spotLight: spot,
        nameBadge,
        isGLB: true,
        loadedGLB: null,
        mixer: null,
        actions: {},
        activeClipName: null,
        walkTime: 0.0,
        currentModelId: null,
        currentColor: suitHexColor,
        emoteBubble,
        emote: null,

        playEmote: (emoteId) => {
          const def = EMOTE_BY_ID[emoteId];
          if (!def) return false;

          rig.emote = { def, elapsed: 0 };
          drawEmoteBubble(emoteBubble, def);
          emoteBubble.sprite.visible = true;
          emoteBubble.sprite.material.opacity = 0;
          emoteBubble.sprite.scale.set(0.5 * (emoteBubble.sx || 1), 0.5 * (emoteBubble.sy || 1), 1);

          // Restart the matching skeletal clip immediately (if it is loaded).
          const act = def.clip ? rig.actions[def.clip] : null;
          if (act) {
            const prev = rig.activeClipName ? rig.actions[rig.activeClipName] : null;
            if (prev && prev !== act) prev.fadeOut(0.16);
            act.reset();
            act.timeScale = def.clipSpeed || 1;
            act.fadeIn(0.16).play();
            rig.activeClipName = def.clip;
          }
          return true;
        },

        cancelEmote: () => {
          rig.emote = null;
          emoteBubble.sprite.visible = false;
          emoteBubble.sprite.material.opacity = 0;
          if (rig.mixer && rig.actions) {
            Object.keys(rig.actions).forEach((clipName) => {
              const act = rig.actions[clipName];
              if (act && typeof act.timeScale === "number") act.timeScale = 1;
            });
          }
        },

        /**
         * SpaceShip animation clip switcher & procedural fallback update.
         */
        updateAnimation: (delta, isMoving = false, isEva = false, isGrounded = true, customAction = null) => {
          if (rig.emote) {
            rig.emote.elapsed += delta;
            if (rig.emote.elapsed >= rig.emote.def.duration) {
              rig.cancelEmote();
            }
          }

          const emoteClip = rig.emote && rig.emote.def.clip ? rig.emote.def.clip : null;
          const emoteSpeed = rig.emote && rig.emote.def.clipSpeed ? rig.emote.def.clipSpeed : 1;

          if (rig.mixer) {
            const desiredClip = customAction || emoteClip || (isMoving ? "walk" : "idle");
            if (rig.actions[desiredClip] && rig.activeClipName !== desiredClip) {
              const nextAct = rig.actions[desiredClip];
              const prevAct = rig.activeClipName ? rig.actions[rig.activeClipName] : null;
              if (prevAct && prevAct !== nextAct) {
                prevAct.fadeOut(0.22);
              }
              nextAct.reset();
              nextAct.timeScale = 1;
              nextAct.fadeIn(0.22).play();
              rig.activeClipName = desiredClip;
            }
            if (rig.activeClipName === "walk" && rig.actions["walk"] && !emoteClip) {
              rig.actions["walk"].timeScale = isEva ? 0.75 : 1.15;
            } else if (emoteClip && rig.actions[emoteClip]) {
              rig.actions[emoteClip].timeScale = emoteSpeed;
            }
            rig.mixer.update(delta);
            modelContainer.position.y = 0;
            modelContainer.rotation.x = 0;
            modelContainer.rotation.z = 0;
          } else {
            // Procedural bobbing for static GLB models without skeletal clips
            if (isMoving) {
              rig.walkTime += delta * (isEva ? 3.0 : 8.5);
              const bob = Math.abs(Math.sin(rig.walkTime)) * 0.04;
              modelContainer.position.y = isEva ? Math.sin(rig.walkTime * 0.5) * 0.05 : bob;
              modelContainer.rotation.x = isEva ? 0.14 : 0.05;
              modelContainer.rotation.z = Math.sin(rig.walkTime * 0.5) * 0.03;
            } else {
              rig.walkTime += delta * 1.8;
              modelContainer.position.y = Math.sin(rig.walkTime) * 0.015;
              modelContainer.rotation.x = 0;
              modelContainer.rotation.z = Math.sin(rig.walkTime * 0.7) * 0.01;
            }
          }

          // Emote body language & floating expression bubble
          if (rig.emote) {
            const t = rig.emote.elapsed;
            const def = rig.emote.def;
            const fadeIn = Math.min(1, t / 0.15);
            const fadeOut = Math.min(1, Math.max(0, (def.duration - t) / 0.38));
            const alpha = Math.min(fadeIn, fadeOut);

            if (def.procedural === "dance") {
              modelContainer.position.y += Math.abs(Math.sin(t * 9.0)) * 0.085;
              modelContainer.rotation.z += Math.sin(t * 6.2) * 0.2;
              modelContainer.rotation.x += Math.sin(t * 4.4) * 0.05;
            } else if (def.procedural === "laugh") {
              modelContainer.position.y += Math.abs(Math.sin(t * 17.0)) * 0.03;
              modelContainer.rotation.x += Math.sin(t * 19.0) * 0.05;
              modelContainer.rotation.z += Math.sin(t * 8.5) * 0.025;
            } else if (def.procedural === "heart") {
              modelContainer.position.y += Math.sin(t * 3.0) * 0.018;
              modelContainer.rotation.z += Math.sin(t * 1.8) * 0.045;
            }

            // Layer the hand/arm IK gesture on top of the animated body.
            applyEmoteHandPose(rig, t, def, alpha);

            const sprite = emoteBubble.sprite;
            const pop = 0.5 + 0.5 * Math.min(1, t / 0.16);
            sprite.visible = !rig.emoteBubbleHidden;
            sprite.material.opacity = alpha;
            sprite.scale.set(pop * (emoteBubble.sx || 1), pop * (emoteBubble.sy || 1), 1);
            sprite.position.y = (emoteBubble.baseY || 2.85) + Math.sin(t * 3.2) * 0.035;
          }
        },

        setModel: (targetModelId) => {
          loadModelIntoRig(targetModelId, rig.currentColor);
        },

        setColor: (newColorHex) => {
          rig.currentColor = newColorHex;
          const cHex = parseInt(String(newColorHex).replace("#", "0x")) || 0x38bdf8;
          if (rig.accentRingMat) {
            rig.accentRingMat.color.setHex(cHex);
          }
          if (rig.loadedGLB) {
            rig.loadedGLB.traverse((obj) => {
              if (obj.isMesh && obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m) => {
                  if (/stripe/i.test(m.name) || /role/i.test(m.name) || /led/i.test(m.name) || /trim/i.test(m.name)) {
                    m.color.setHex(cHex);
                    if (m.emissive) m.emissive.setHex(cHex);
                  }
                });
              }
            });
          }
          if (rig.nameBadge && rig.nameBadge.userData && rig.nameBadge.userData.update) {
            rig.nameBadge.userData.update(name, newColorHex, role, isHost);
          }
        }
      };

      const loadModelIntoRig = (modelId, color) => {
        const chosenId = modelId || modelKey || this.selectedAvatarModelId || "astronaut_lod0";
        rig.currentModelId = chosenId;

        const catalogEntry = this.catalog[chosenId];
        const url = catalogEntry ? catalogEntry.file : chosenId;

        this.loadGLB(url)
          .then((entry) => {
            const hasAnims = !!(entry.gltf.animations && entry.gltf.animations.length > 0);
            const model = this.instantiateModel(chosenId, {
              suitColor: color,
              targetHeight: (catalogEntry && catalogEntry.targetHeight) || 1.90,
              groundBottom: !hasAnims,
              center: true,
              castShadow: options.castShadow !== false,
              receiveShadow: options.receiveShadow !== false
            });

            while (modelContainer.children.length > 0) {
              modelContainer.remove(modelContainer.children[0]);
            }
            modelContainer.add(model);
            rig.loadedGLB = model;
            bindEmoteBones(rig, model);

            // Bind skeletal animation clips ('idle', 'walk', 'look_around', 'wave')
            rig.actions = {};
            rig.activeClipName = null;
            if (entry.gltf.animations && entry.gltf.animations.length > 0) {
              rig.mixer = new window.THREE.AnimationMixer(model);
              entry.gltf.animations.forEach((clip) => {
                const act = rig.mixer.clipAction(clip);
                rig.actions[clip.name] = act;
              });
              const startClip = rig.actions["idle"] ? "idle" : entry.gltf.animations[0].name;
              if (rig.actions[startClip]) {
                rig.actions[startClip].play();
                rig.activeClipName = startClip;
              }
            } else {
              rig.mixer = null;
            }
          })
          .catch((err) => {
            console.warn(`[GLBManager] Falling back to procedural rig for ${name}:`, err);
          });
      };

      loadModelIntoRig(modelKey, suitHexColor);

      return rig;
    }

    _createFallbackNameBadge(name, colorHex, role, isHost) {
      const canvas = document.createElement("canvas");
      canvas.width = 384;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");

      function redraw(n, c, r, h) {
        ctx.clearRect(0, 0, 384, 96);
        ctx.fillStyle = "rgba(11, 18, 33, 0.88)";
        ctx.strokeStyle = c || "#38bdf8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(8, 8, 368, 80, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const title = (h ? "★ " : "") + (n || "Astronaut").toUpperCase();
        ctx.fillText(title, 192, 40);

        ctx.fillStyle = c || "#38bdf8";
        ctx.font = "bold 18px sans-serif";
        ctx.fillText((r || "CREW").toUpperCase(), 192, 68);
      }

      redraw(name, colorHex, role, isHost);

      const tex = new window.THREE.CanvasTexture(canvas);
      const spriteMat = new window.THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new window.THREE.Sprite(spriteMat);
      sprite.scale.set(1.4, 0.35, 1);
      sprite.userData = {
        update: (n, c, r, h) => {
          redraw(n, c, r, h);
          tex.needsUpdate = true;
        }
      };
      return sprite;
    }

    spawnOrbitalFleet() {
      // Perilune uses only the 6-room transit craft, ISS reference craft, and Lunar Lander.
    }

    updateFleet(delta, elapsed) {
      for (let i = 0; i < this.spawnedFleet.length; i++) {
        const item = this.spawnedFleet[i];
        if (item.type === "orbital_satellite" && item.obj) {
          item.obj.rotation.y += (item.rotSpeed || 0.1) * delta;
          item.obj.position.y += Math.sin(elapsed * 0.8 + i) * 0.008;
        }
      }
    }

    // ========================================================================
    // INTERACTIVE 3D GLB MODEL HANGAR & STUDIO (INSPECTOR MODAL)
    // ========================================================================
    openHangar(initialModelId = null) {
      let modal = document.getElementById("glb-hangar-modal");
      if (!modal) {
        modal = this._buildHangarModalDOM();
        document.body.appendChild(modal);
        this._bindHangarEvents(modal);
      }

      modal.style.display = "flex";
      this.hangarActive = true;

      const container = document.getElementById("hangar-viewport-container");
      if (container && !this.hangarRenderer) {
        this._initHangarViewport(container);
      } else if (this.hangarRenderer) {
        this._onHangarResize();
      }

      this._renderHangarCatalog();

      const targetId = initialModelId || this.selectedAvatarModelId || "astronaut_lod0";
      this.selectHangarModel(targetId);

      this._startHangarAnimationLoop();
    }

    closeHangar() {
      const modal = document.getElementById("glb-hangar-modal");
      if (modal) modal.style.display = "none";
      this.hangarActive = false;
      if (this.hangarAnimFrame) {
        cancelAnimationFrame(this.hangarAnimFrame);
        this.hangarAnimFrame = null;
      }
    }

    _initHangarViewport(container) {
      const width = container.clientWidth || 540;
      const height = container.clientHeight || 420;

      this.hangarScene = new window.THREE.Scene();
      this.hangarScene.background = new window.THREE.Color(0x060913);

      this.hangarCamera = new window.THREE.PerspectiveCamera(45, width / height, 0.1, 500);
      this.hangarCamera.position.set(0, 1.2, 3.5);

      this.hangarRenderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.hangarRenderer.setSize(width, height);
      this.hangarRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.hangarRenderer.outputEncoding = window.THREE.sRGBEncoding;
      this.hangarRenderer.toneMapping = window.THREE.ACESFilmicToneMapping;
      this.hangarRenderer.toneMappingExposure = 1.1;
      container.appendChild(this.hangarRenderer.domElement);

      const amb = new window.THREE.AmbientLight(0xdbeafe, 1.0);
      this.hangarScene.add(amb);

      const keyLight = new window.THREE.DirectionalLight(0xfffaed, 2.2);
      keyLight.position.set(4, 6, 5);
      this.hangarScene.add(keyLight);

      const fillLight = new window.THREE.DirectionalLight(0x67e8f9, 1.0);
      fillLight.position.set(-5, 2, -3);
      this.hangarScene.add(fillLight);

      const rimLight = new window.THREE.DirectionalLight(0x9a8fc4, 0.8);
      rimLight.position.set(0, -4, -4);
      this.hangarScene.add(rimLight);

      const grid = new window.THREE.GridHelper(10, 20, 0x3b4856, 0x141a22);
      grid.position.y = -0.01;
      this.hangarScene.add(grid);

      this.hangarModelGroup = new window.THREE.Group();
      this.hangarScene.add(this.hangarModelGroup);

      this.hangarClock = new window.THREE.Clock();

      const dom = this.hangarRenderer.domElement;
      dom.addEventListener("mousedown", (e) => {
        this.hangarMouse.down = true;
        this.hangarMouse.x = e.clientX;
        this.hangarMouse.y = e.clientY;
      });
      window.addEventListener("mousemove", (e) => {
        if (!this.hangarActive || !this.hangarMouse.down) return;
        const dx = e.clientX - this.hangarMouse.x;
        const dy = e.clientY - this.hangarMouse.y;
        this.hangarMouse.x = e.clientX;
        this.hangarMouse.y = e.clientY;

        this.hangarMouse.rotY += dx * 0.01;
        this.hangarMouse.rotX = Math.max(-1.2, Math.min(1.2, this.hangarMouse.rotX + dy * 0.01));
      });
      window.addEventListener("mouseup", () => {
        this.hangarMouse.down = false;
      });
      dom.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.hangarMouse.dist = Math.max(0.8, Math.min(45.0, this.hangarMouse.dist + e.deltaY * 0.005));
      }, { passive: false });
    }

    _onHangarResize() {
      const container = document.getElementById("hangar-viewport-container");
      if (!container || !this.hangarRenderer || !this.hangarCamera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.hangarCamera.aspect = w / h;
      this.hangarCamera.updateProjectionMatrix();
      this.hangarRenderer.setSize(w, h);
    }

    _startHangarAnimationLoop() {
      const loop = () => {
        if (!this.hangarActive) return;
        this.hangarAnimFrame = requestAnimationFrame(loop);

        const delta = this.hangarClock.getDelta();

        if (this.hangarAutoRotate && !this.hangarMouse.down) {
          this.hangarMouse.rotY += delta * 0.45;
        }

        const dist = this.hangarMouse.dist;
        const cy = Math.sin(this.hangarMouse.rotX) * dist + 1.0;
        const r = Math.cos(this.hangarMouse.rotX) * dist;
        const cx = Math.sin(this.hangarMouse.rotY) * r;
        const cz = Math.cos(this.hangarMouse.rotY) * r;

        this.hangarCamera.position.set(cx, cy, cz);
        this.hangarCamera.lookAt(0, 1.0, 0);

        this.hangarRenderer.render(this.hangarScene, this.hangarCamera);
      };
      loop();
    }

    selectHangarModel(modelId) {
      const entry = this.catalog[modelId] || this.customModels[modelId];
      if (!entry) return;

      this.hangarCurrentModel = entry;

      document.querySelectorAll(".hangar-catalog-card").forEach((card) => {
        card.classList.toggle("active", card.dataset.id === modelId);
      });

      const statusEl = document.getElementById("hangar-status-text");
      if (statusEl) statusEl.textContent = `LOADING 3D GEOMETRY (${entry.name})...`;

      const url = entry.file;

      const onModelReady = (loadedEntry) => {
        while (this.hangarModelGroup.children.length > 0) {
          this.hangarModelGroup.remove(this.hangarModelGroup.children[0]);
        }

        const isAstronaut = entry.category === "astronauts";
        const targetH = isAstronaut ? 1.90 : (entry.targetHeight || null);

        const inst = this.instantiateModel(modelId, {
          suitColor: this.hangarColorTest,
          targetHeight: targetH,
          groundBottom: true,
          center: true,
          enhancePBR: true
        });

        if (this.hangarWireframe) {
          inst.traverse((o) => {
            if (o.isMesh && o.material) {
              const m = Array.isArray(o.material) ? o.material : [o.material];
              m.forEach((mat) => { mat.wireframe = true; });
            }
          });
        }

        this.hangarModelGroup.add(inst);

        const box = new window.THREE.Box3().setFromObject(inst);
        const sz = new window.THREE.Vector3();
        box.getSize(sz);
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        this.hangarMouse.dist = Math.max(2.2, maxDim * 1.8);
        this.hangarCamera.position.y = sz.y * 0.5;

        this._updateHangarTelemetry(entry, loadedEntry.meta);

        if (statusEl) statusEl.textContent = `TELEMETRY READY • ${entry.name}`;
      };

      if (entry.isCustom && this.cache[modelId]) {
        onModelReady(this.cache[modelId]);
      } else {
        this.loadGLB(url, (pct) => {
          if (statusEl) statusEl.textContent = `DOWNLOADING 3D ASSET: ${pct}%...`;
        })
          .then(onModelReady)
          .catch((err) => {
            if (statusEl) statusEl.textContent = `ERROR LOADING 3D MODEL: ${err.message}`;
          });
      }
    }

    _updateHangarTelemetry(entry, meta) {
      const titleEl = document.getElementById("hangar-spec-title");
      const descEl = document.getElementById("hangar-spec-desc");
      const triEl = document.getElementById("hangar-stat-triangles");
      const vertEl = document.getElementById("hangar-stat-vertices");
      const meshEl = document.getElementById("hangar-stat-meshes");
      const matEl = document.getElementById("hangar-stat-materials");
      const dimEl = document.getElementById("hangar-stat-dimensions");

      if (titleEl) titleEl.textContent = entry.name;
      if (descEl) descEl.textContent = entry.description || "Official high-polygon watertight 3D aerospace asset.";
      if (meta) {
        if (triEl) triEl.textContent = meta.triangles.toLocaleString();
        if (vertEl) vertEl.textContent = meta.vertices.toLocaleString();
        if (meshEl) meshEl.textContent = meta.meshCount.toLocaleString();
        if (matEl) matEl.textContent = meta.materialCount.toLocaleString();
        if (dimEl && meta.box && meta.box.size) {
          const s = meta.box.size;
          dimEl.textContent = `${s[0].toFixed(2)}m × ${s[1].toFixed(2)}m × ${s[2].toFixed(2)}m`;
        }
      }
    }

    _escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    _renderHangarCatalog(filterCategory = "all") {
      const container = document.getElementById("hangar-catalog-list");
      if (!container) return;
      container.innerHTML = "";

      const renderCard = (item, isCustom = false) => {
        if (filterCategory !== "all") {
          if (filterCategory === "custom") {
            if (!isCustom) return;
          } else {
            if (item.category !== filterCategory) return;
          }
        }

        const card = document.createElement("div");
        card.className = "hangar-catalog-card";
        card.dataset.id = item.id;
        card.innerHTML = `
          <div class="hangar-card-header">
            <span class="hangar-card-badge">${this._escapeHtml((item.category || (isCustom ? "CUSTOM" : "3D")).toUpperCase())}</span>
            <span class="hangar-card-role">${this._escapeHtml(item.role ? item.role.toUpperCase() : (isCustom ? "UPLOAD" : "ASSET"))}</span>
          </div>
          <div class="hangar-card-title">${this._escapeHtml(item.name)}</div>
          <div class="hangar-card-desc">${this._escapeHtml((item.description || "Custom 3D model asset.").slice(0, 78))}...</div>
        `;
        card.addEventListener("click", () => this.selectHangarModel(item.id));
        container.appendChild(card);
      };

      Object.keys(this.catalog).forEach((key) => renderCard(this.catalog[key], false));
      Object.keys(this.customModels).forEach((key) => renderCard(this.customModels[key], true));
    }

    _buildHangarModalDOM() {
      const overlay = document.createElement("div");
      overlay.id = "glb-hangar-modal";
      overlay.className = "settings-modal-overlay";
      overlay.style.display = "none";
      overlay.innerHTML = `
        <div class="settings-modal-card hangar-modal-card">
          <div class="settings-modal-header hangar-header">
            <div>
              <div class="settings-modal-title">PERILUNE // 3D ASSET INSPECTOR</div>
              <div style="font-size:10px;color:rgba(154,164,174,0.75);letter-spacing:1.2px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">DRACO / KTX2 / MESHOPT RIG STUDIO</div>
            </div>
            <button class="settings-close-btn" id="hangar-btn-close">&times;</button>
          </div>

          <div class="hangar-modal-body">
            <div class="hangar-sidebar">
              <div class="hangar-tabs-row">
                <button class="hangar-tab-btn active" data-cat="all">ALL</button>
                <button class="hangar-tab-btn" data-cat="astronauts">SUITS</button>
                <button class="hangar-tab-btn" data-cat="spacecraft">ISS</button>
                <button class="hangar-tab-btn" data-cat="custom">CUSTOM</button>
              </div>
              <div class="hangar-catalog-list" id="hangar-catalog-list"></div>
              <div class="hangar-upload-box">
                <input type="file" id="hangar-file-input" accept=".glb,.gltf" style="display:none;" />
                <button class="btn-secondary" id="hangar-btn-upload" style="width:100%;font-size:10px;padding:8px;">
                  IMPORT CUSTOM .GLB
                </button>
              </div>
            </div>

            <div class="hangar-viewport-wrapper">
              <div id="hangar-viewport-container"></div>
              <div class="hangar-viewport-controls">
                <button class="hangar-ctrl-btn" id="hangar-btn-wireframe" title="Toggle Wireframe">WIREFRAME</button>
                <button class="hangar-ctrl-btn active" id="hangar-btn-rotate" title="Toggle Turntable Rotation">AUTO-ROTATE</button>
                <button class="hangar-ctrl-btn" id="hangar-btn-reset-cam" title="Reset Camera">RESET</button>
              </div>
              <div class="hangar-viewport-status">
                <span class="perf-dot" style="background:#67e8f9;"></span>
                <span id="hangar-status-text">INITIALIZING 3D ENGINE...</span>
              </div>
            </div>

            <div class="hangar-specs-panel">
              <div style="font-size:9.5px;font-weight:700;letter-spacing:1.8px;color:#67e8f9;text-transform:uppercase;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">MODEL DOSSIER</div>
              <div id="hangar-spec-title" class="hangar-spec-title">ASTRONAUT MODEL</div>
              <div id="hangar-spec-desc" class="hangar-spec-desc">Model technical overview and description.</div>

              <div class="hangar-stats-grid">
                <div class="hangar-stat-box">
                  <span class="hangar-stat-lbl">TRIANGLES</span>
                  <span class="hangar-stat-val" id="hangar-stat-triangles">--</span>
                </div>
                <div class="hangar-stat-box">
                  <span class="hangar-stat-lbl">VERTICES</span>
                  <span class="hangar-stat-val" id="hangar-stat-vertices">--</span>
                </div>
                <div class="hangar-stat-box">
                  <span class="hangar-stat-lbl">MESHES</span>
                  <span class="hangar-stat-val" id="hangar-stat-meshes">--</span>
                </div>
                <div class="hangar-stat-box">
                  <span class="hangar-stat-lbl">MATERIALS</span>
                  <span class="hangar-stat-val" id="hangar-stat-materials">--</span>
                </div>
                <div class="hangar-stat-box" style="grid-column:span 2;">
                  <span class="hangar-stat-lbl">BOUNDING DIMENSIONS (W × H × D)</span>
                  <span class="hangar-stat-val" id="hangar-stat-dimensions" style="font-size:12px;">--</span>
                </div>
              </div>

              <div style="margin-top:10px;">
                <label style="font-size:11px;color:#94a3b8;font-weight:700;display:block;margin-bottom:6px;">TEST SUIT COLOR ACCENT</label>
                <div class="color-swatches" id="hangar-color-swatches">
                  <button type="button" class="lobby-color-btn" data-color="#ef4444" style="background:#ef4444;" title="Apollo Red"></button>
                  <button type="button" class="lobby-color-btn" data-color="#3b82f6" style="background:#3b82f6;" title="ESA Blue"></button>
                  <button type="button" class="lobby-color-btn" data-color="#f59e0b" style="background:#f59e0b;" title="JAXA Gold"></button>
                  <button type="button" class="lobby-color-btn" data-color="#10b981" style="background:#10b981;" title="EVA Green"></button>
                  <button type="button" class="lobby-color-btn" data-color="#f8fafc" style="background:#f8fafc;" title="NASA White"></button>
                  <button type="button" class="lobby-color-btn" data-color="#334155" style="background:#334155;" title="Carbon Stealth"></button>
                </div>
              </div>

              <div style="margin-top:auto;display:flex;flex-direction:column;gap:8px;">
                <button class="btn-primary" id="hangar-btn-equip" style="width:100%;font-size:12px;padding:12px;">
                  EQUIP AS MY ASTRONAUT AVATAR
                </button>
                <button class="btn-secondary" id="hangar-btn-spawn" style="width:100%;font-size:12px;padding:10px;">
                  SPAWN IN SPACE ORBIT
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
      return overlay;
    }

    _bindHangarEvents(modal) {
      modal.querySelector("#hangar-btn-close").addEventListener("click", () => this.closeHangar());

      modal.querySelectorAll(".hangar-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          modal.querySelectorAll(".hangar-tab-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this._renderHangarCatalog(btn.dataset.cat);
        });
      });

      const btnWireframe = modal.querySelector("#hangar-btn-wireframe");
      btnWireframe.addEventListener("click", () => {
        this.hangarWireframe = !this.hangarWireframe;
        btnWireframe.classList.toggle("active", this.hangarWireframe);
        if (this.hangarCurrentModel) this.selectHangarModel(this.hangarCurrentModel.id);
      });

      const btnRotate = modal.querySelector("#hangar-btn-rotate");
      btnRotate.addEventListener("click", () => {
        this.hangarAutoRotate = !this.hangarAutoRotate;
        btnRotate.classList.toggle("active", this.hangarAutoRotate);
      });

      modal.querySelector("#hangar-btn-reset-cam").addEventListener("click", () => {
        this.hangarMouse.rotX = 0.2;
        this.hangarMouse.rotY = 0.8;
      });

      modal.querySelectorAll("#hangar-color-swatches .lobby-color-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.hangarColorTest = btn.dataset.color;
          if (this.hangarCurrentModel) this.selectHangarModel(this.hangarCurrentModel.id);
        });
      });

      modal.querySelector("#hangar-btn-equip").addEventListener("click", () => {
        if (!this.hangarCurrentModel) return;

        if (this.hangarCurrentModel.category !== "astronauts") {
          if (window.showActionToast) {
            window.showActionToast(`${this.hangarCurrentModel.name} is a spacecraft/object. Use 'SPAWN IN SPACE ORBIT' or press [U] to board.`);
          }
          return;
        }

        this.selectedAvatarModelId = this.hangarCurrentModel.id;

        const preservedRoleRaw =
          (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.role) ||
          (window.localCrew && window.localCrew.role) ||
          this.hangarCurrentModel.role ||
          "commander";
        const preservedRole = window.InterfellasRoles
          ? window.InterfellasRoles.normalizeRole(preservedRoleRaw, "commander")
          : preservedRoleRaw;

        if (window.localCrew && window.localCrew.group && window.buildLocalAstronaut) {
          window.buildLocalAstronaut(this.hangarColorTest, preservedRole, this.hangarCurrentModel.id);
        }

        if (window.netManager && window.netManager.customizeAstronaut) {
          window.netManager.customizeAstronaut(
            null,
            this.hangarColorTest,
            preservedRole,
            undefined,
            this.hangarCurrentModel.id,
            "crew",
            { explicitRole: !!(window.netManager && window.netManager.explicitRoleSelected) }
          );
        }

        if (window.showActionToast) {
          window.showActionToast(`EQUIPPED 3D MODEL: ${this.hangarCurrentModel.name}`);
        }
        this.closeHangar();
      });

      modal.querySelector("#hangar-btn-spawn").addEventListener("click", () => {
        if (!this.hangarCurrentModel || !window.scene) return;

        try {
          const spawnInst = this.instantiateModel(this.hangarCurrentModel.id, {
            suitColor: this.hangarColorTest,
            scale: 1.0,
            castShadow: true,
            receiveShadow: true
          });

          const p = (window.localCrew && window.localCrew.group) ? window.localCrew.group.position : { x: 0, y: 2, z: 0 };
          spawnInst.position.set(p.x + (Math.random() * 20 - 10), p.y + 12 + Math.random() * 5, p.z - 30 + (Math.random() * 10));
          window.scene.add(spawnInst);
          this.spawnedFleet.push({ obj: spawnInst, type: "orbital_satellite", rotSpeed: 0.1 });

          if (window.showActionToast) {
            window.showActionToast(`SPAWNED ${this.hangarCurrentModel.name} INTO LIVE ORBIT!`);
          }
          this.closeHangar();
        } catch (e) {
          alert("Failed to spawn model: " + e.message);
        }
      });

      const fileInput = modal.querySelector("#hangar-file-input");
      const btnUpload = modal.querySelector("#hangar-btn-upload");
      btnUpload.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          this.loadArrayBuffer(evt.target.result, file.name)
            .then((customItem) => {
              this._renderHangarCatalog("all");
              this.selectHangarModel(customItem.id);
              if (window.showActionToast) {
                window.showActionToast(`IMPORTED CUSTOM 3D MODEL: ${customItem.name}`);
              }
            })
            .catch((err) => alert("Failed to import .glb: " + err.message));
        };
        reader.readAsArrayBuffer(file);
      });
    }

    _initDragAndDrop() {
      let dropOverlay = null;

      const ensureOverlay = () => {
        if (dropOverlay) return dropOverlay;
        dropOverlay = document.createElement("div");
        dropOverlay.id = "glb-drag-drop-overlay";
        dropOverlay.style.cssText = `
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(5, 6, 10, 0.92);
          backdrop-filter: blur(12px);
          z-index: 999999;
          justify-content: center;
          align-items: center;
          flex-direction: column;
          gap: 12px;
          border: 1px dashed rgba(103, 232, 249, 0.55);
          pointer-events: none;
        `;
        dropOverlay.innerHTML = `
          <div style="font-size:18px;font-weight:700;letter-spacing:2.4px;color:#ece7dc;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">DROP .GLB / .GLTF MODEL</div>
          <div style="font-size:12px;color:rgba(154,164,174,0.8);">Inspect, equip as astronaut rig, or spawn in orbit</div>
        `;
        document.body.appendChild(dropOverlay);
        return dropOverlay;
      };

      window.addEventListener("dragenter", (e) => {
        if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          const ov = ensureOverlay();
          ov.style.display = "flex";
        }
      });

      window.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      window.addEventListener("dragleave", (e) => {
        if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
          if (dropOverlay) dropOverlay.style.display = "none";
        }
      });

      window.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dropOverlay) dropOverlay.style.display = "none";

        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || files.length === 0) return;

        const file = files[0];
        if (!/\.(glb|gltf)$/i.test(file.name)) {
          if (window.showActionToast) {
            window.showActionToast("ERROR: Please drop a .glb or .gltf 3D model file.");
          }
          return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
          this.loadArrayBuffer(evt.target.result, file.name)
            .then((customItem) => {
              this.openHangar(customItem.id);
              if (window.showActionToast) {
                window.showActionToast(`IMPORTED CUSTOM 3D MODEL: ${customItem.name}`);
              }
            })
            .catch((err) => {
              console.error("Failed to parse dropped GLB:", err);
              alert("Failed to parse .glb model: " + err.message);
            });
        };
        reader.readAsArrayBuffer(file);
      });
    }
  }

  window.GLBManager = GLBManager;
  window.glbManager = new GLBManager();
})(window);
