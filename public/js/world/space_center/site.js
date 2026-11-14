/**
 * Space Center 2 — Three.js site orchestrator.
 *
 * Builds the converted LC-39A complex from independent modules, batches static
 * boxes into per-material InstancedMeshes with shadow support, and exposes
 * walkable-site collision volumes plus detail builders.
 */
(function (window) {
  "use strict";

  const NS = window.SpaceCenterModules;

  const NO_SHADOW_CAST = new Set([
    "asphalt",
    "gravel",
    "grass",
    "sand",
    "dune_sand",
    "water",
    "surf",
    "stripe_white",
    "stripe_yellow",
    "lamp",
    "screen"
  ]);

  const NO_SHADOW_RECEIVE = new Set(["lamp", "screen", "surf"]);

  class SpaceCenterSite {
    constructor(spaceCenter) {
      this.sc = spaceCenter;
      this.group = new window.THREE.Group();
      this.group.name = "SpaceCenter2_WebSite";
      this.materials = {};
      this.textures = {};
      this.boxColliders = [];
      this.circleColliders = [];
    }

    build() {
      const order = ["environment", "pad", "pad39b", "mcc", "vab", "lcc", "crawler", "utilities"];
      for (const name of order) {
        const builder = NS.builders && NS.builders[name];
        if (typeof builder === "function") builder(this);
      }
      this._mergeStaticBoxes();
      this.sc.group.add(this.group);
      return this;
    }

    _mergeStaticBoxes() {
      const THREE = window.THREE;
      if (!THREE.InstancedMesh) return;
      this.group.updateMatrixWorld(true);
      const buckets = new Map();
      const toRemove = [];

      this.group.traverse((obj) => {
        if (!obj.isMesh || obj.geometry !== this.sc.unitBoxGeo) return;
        if (!obj.material || obj.material.transparent) return;
        const key = obj.material.uuid || obj.material.id || "shared";
        if (!buckets.has(key)) {
          buckets.set(key, { material: obj.material, matrices: [] });
        }
        buckets.get(key).matrices.push(obj.matrixWorld.clone());
        toRemove.push(obj);
      });

      for (const bucket of buckets.values()) {
        const instanced = new THREE.InstancedMesh(
          this.sc.unitBoxGeo,
          bucket.material,
          bucket.matrices.length
        );
        bucket.matrices.forEach((matrix, index) => instanced.setMatrixAt(index, matrix));
        instanced.instanceMatrix.needsUpdate = true;
        instanced.frustumCulled = false;
        const matName = (bucket.material && bucket.material.name) || "";
        instanced.castShadow = !NO_SHADOW_CAST.has(matName);
        instanced.receiveShadow = !NO_SHADOW_RECEIVE.has(matName);
        instanced.name = matName ? `MergedStatic_${matName}` : "MergedStaticBoxes";
        this.group.add(instanced);
      }

      for (const mesh of toRemove) {
        if (mesh.parent) mesh.parent.remove(mesh);
      }
    }

    _makeProceduralTexture(key, size, draw, repeatX = 1, repeatY = 1) {
      if (this.textures[key]) return this.textures[key];
      const tex = this.sc._makeCanvasTexture(size, draw, repeatX, repeatY);
      this.textures[key] = tex;
      return tex;
    }

    _makeNoiseTexture(key, baseHex, speckColors, lineStyle, size = 256) {
      return this._makeProceduralTexture(key, size, (ctx, s) => {
        ctx.fillStyle = baseHex;
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 2400; i++) {
          ctx.fillStyle = speckColors[i % speckColors.length];
          const r = 1 + (i % 3);
          ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
        }
        if (lineStyle === "vab_panel") {
          for (let x = 0; x < s; x += 32) {
            ctx.fillStyle = "rgba(18,24,33,0.16)";
            ctx.fillRect(x, 0, 2, s);
            ctx.fillStyle = "rgba(255,255,255,0.08)";
            ctx.fillRect(x + 2, 0, 2, s);
          }
          for (let y = 0; y < s; y += 64) {
            ctx.fillStyle = "rgba(18,24,33,0.14)";
            ctx.fillRect(0, y, s, 2);
          }
        } else if (lineStyle === "asphalt") {
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = "rgba(10,12,16,0.14)";
            ctx.fillRect(0, Math.random() * s, s, 2 + Math.random() * 6);
          }
        } else if (lineStyle === "foliage") {
          for (let i = 0; i < 320; i++) {
            ctx.fillStyle = i % 2 === 0 ? "rgba(88,128,54,0.28)" : "rgba(32,58,24,0.28)";
            ctx.beginPath();
            ctx.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }, 1, 1);
    }

    mat(key) {
      if (this.materials[key]) return this.materials[key];
      const THREE = window.THREE;
      const common = { roughness: 0.82, metalness: 0.12 };
      let material;

      switch (key) {
        case "concrete":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "concrete_clean",
              "#cbcac2",
              ["rgba(165,164,156,0.22)", "rgba(232,231,224,0.18)", "rgba(110,114,118,0.12)"],
              null,
              512
            ),
            roughness: 0.92,
            metalness: 0.03
          });
          break;
        case "concrete_curb":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "concrete_curb",
              "#d9dad4",
              ["rgba(170,172,166,0.18)", "rgba(246,246,240,0.18)"],
              null
            ),
            roughness: 0.88,
            metalness: 0.04
          });
          break;
        case "concrete_dark":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "concrete_dark",
              "#868a84",
              ["rgba(64,68,66,0.22)", "rgba(164,166,158,0.14)"],
              null,
              512
            ),
            roughness: 0.95,
            metalness: 0.03
          });
          break;
        case "vab_panel":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "vab_panel",
              "#cfd5dc",
              ["rgba(176,184,194,0.2)", "rgba(244,247,250,0.18)", "rgba(110,120,132,0.12)"],
              "vab_panel"
            ),
            roughness: 0.72,
            metalness: 0.16
          });
          break;
        case "vab_rib":
          material = new THREE.MeshStandardMaterial({ color: 0x3b4450, roughness: 0.56, metalness: 0.42 });
          break;
        case "lcc_wall":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "lcc_wall",
              "#dfe3e8",
              ["rgba(190,196,204,0.15)", "rgba(255,255,255,0.14)"],
              "vab_panel"
            ),
            roughness: 0.76,
            metalness: 0.1
          });
          break;
        case "asphalt":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "asphalt",
              "#292d34",
              ["rgba(62,67,76,0.28)", "rgba(20,23,28,0.28)", "rgba(92,96,104,0.15)"],
              "asphalt",
              512
            ),
            roughness: 0.93,
            metalness: 0.04
          });
          break;
        case "gravel":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "gravel",
              "#9c9484",
              ["rgba(126,118,104,0.34)", "rgba(190,182,166,0.30)", "rgba(92,86,76,0.24)"],
              null,
              512
            ),
            roughness: 0.98,
            metalness: 0.02
          });
          break;
        case "grass":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "grass_tile",
              "#4a6739",
              ["rgba(62,92,46,0.32)", "rgba(96,126,64,0.26)", "rgba(46,66,34,0.26)"],
              "foliage",
              512
            ),
            roughness: 0.96,
            metalness: 0.0
          });
          break;
        case "foliage":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "foliage_leaf",
              "#385c2c",
              ["rgba(74,116,48,0.35)", "rgba(28,50,20,0.35)"],
              "foliage"
            ),
            roughness: 0.88,
            metalness: 0.0
          });
          break;
        case "palm_frond":
          material = new THREE.MeshStandardMaterial({
            color: 0x4b7f36,
            roughness: 0.78,
            metalness: 0.02,
            side: THREE.DoubleSide
          });
          break;
        case "trunk":
          material = new THREE.MeshStandardMaterial({
            color: 0x6f5741,
            roughness: 0.92,
            metalness: 0.02
          });
          break;
        case "sand":
        case "dune_sand":
          material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: this._makeNoiseTexture(
              "sand_grain",
              "#dfc99b",
              ["rgba(196,170,124,0.26)", "rgba(242,226,188,0.24)"],
              null,
              512
            ),
            roughness: 0.96,
            metalness: 0.01
          });
          break;
        case "surf":
          material = new THREE.MeshStandardMaterial({
            color: 0xf4fbff,
            roughness: 0.35,
            metalness: 0.05,
            transparent: true,
            opacity: 0.86,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          });
          break;
        case "water":
          material = new THREE.MeshStandardMaterial({
            color: 0x0f6a8c,
            roughness: 0.18,
            metalness: 0.45,
            transparent: true,
            opacity: 0.94
          });
          break;
        case "steel_white":
          material = new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.38, metalness: 0.25 });
          break;
        case "steel_grey":
          material = new THREE.MeshStandardMaterial({ color: 0x85898f, roughness: 0.42, metalness: 0.68 });
          break;
        case "tower":
          material = new THREE.MeshStandardMaterial({ color: 0xa8aba8, roughness: 0.6, metalness: 0.45 });
          break;
        case "rust":
          material = new THREE.MeshStandardMaterial({ color: 0x6c3a24, roughness: 0.82, metalness: 0.15 });
          break;
        case "foam":
          material = new THREE.MeshStandardMaterial({ color: 0xc26b30, roughness: 0.8, metalness: 0.02 });
          break;
        case "nasa_blue":
          material = new THREE.MeshStandardMaterial({ color: 0x0b3d91, roughness: 0.46, metalness: 0.12 });
          break;
        case "red":
          material = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5, metalness: 0.08 });
          break;
        case "crimson":
          material = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.48, metalness: 0.12 });
          break;
        case "yellow":
          material = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.54, metalness: 0.08 });
          break;
        case "orange":
          material = new THREE.MeshStandardMaterial({ color: 0xe05d10, roughness: 0.52, metalness: 0.08 });
          break;
        case "black":
          material = new THREE.MeshStandardMaterial({ color: 0x16191e, roughness: 0.68, metalness: 0.22 });
          break;
        case "tire":
          material = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.92, metalness: 0.04 });
          break;
        case "tan":
          material = new THREE.MeshStandardMaterial({ color: 0xc2b28f, roughness: 0.86, metalness: 0.04 });
          break;
        case "silver":
          material = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.3, metalness: 0.72 });
          break;
        case "navy":
          material = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.45, metalness: 0.28 });
          break;
        case "stripe_white":
          material = new THREE.MeshStandardMaterial({
            color: 0xf1f5f9,
            roughness: 0.62,
            metalness: 0.02,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3
          });
          break;
        case "stripe_yellow":
          material = new THREE.MeshStandardMaterial({
            color: 0xfacc15,
            roughness: 0.58,
            metalness: 0.04,
            polygonOffset: true,
            polygonOffsetFactor: -3,
            polygonOffsetUnits: -3
          });
          break;
        case "glass":
          material = new THREE.MeshStandardMaterial({
            color: 0x12263a,
            roughness: 0.1,
            metalness: 0.85,
            emissive: 0x1e3a5f,
            emissiveIntensity: 0.42
          });
          break;
        case "engine":
          material = new THREE.MeshStandardMaterial({ color: 0x29292e, roughness: 0.28, metalness: 0.88 });
          break;
        case "lamp":
          material = new THREE.MeshStandardMaterial({
            color: 0xfff3cf,
            roughness: 0.28,
            metalness: 0.0,
            emissive: 0xffe49e,
            emissiveIntensity: 1.25
          });
          break;
        case "screen":
          material = new THREE.MeshStandardMaterial({
            color: 0x052836,
            roughness: 0.2,
            metalness: 0.1,
            emissive: 0x22d3ee,
            emissiveIntensity: 0.85
          });
          break;
        case "white":
          material = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.38, metalness: 0.14 });
          break;
        default:
          material = new THREE.MeshStandardMaterial({ color: 0xb3b3b3, ...common });
          break;
      }
      material.name = key;
      this.materials[key] = material;
      return material;
    }

    box(parent, sx, sy, sz, x, y, z, material, name) {
      const THREE = window.THREE;
      const mesh = new THREE.Mesh(this.sc.unitBoxGeo, material);
      mesh.scale.set(sx, sy, sz);
      mesh.position.set(x, y, z);
      if (name) mesh.name = name;
      parent.add(mesh);
      return mesh;
    }

    boxRot(parent, sx, sy, sz, x, y, z, rx, ry, rz, material, name) {
      const mesh = this.box(parent, sx, sy, sz, x, y, z, material, name);
      mesh.rotation.set(rx, ry, rz);
      return mesh;
    }

    cyl(parent, radius, height, x, y, z, material, segments = 16, name) {
      const THREE = window.THREE;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material);
      mesh.position.set(x, y, z);
      const mName = (material && material.name) || "";
      mesh.castShadow = !NO_SHADOW_CAST.has(mName);
      mesh.receiveShadow = !NO_SHADOW_RECEIVE.has(mName);
      if (name) mesh.name = name;
      parent.add(mesh);
      return mesh;
    }

    cone(parent, topRadius, bottomRadius, height, x, y, z, material, segments = 16, name) {
      const THREE = window.THREE;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments), material);
      mesh.position.set(x, y, z);
      const mName = (material && material.name) || "";
      mesh.castShadow = !NO_SHADOW_CAST.has(mName);
      mesh.receiveShadow = !NO_SHADOW_RECEIVE.has(mName);
      if (name) mesh.name = name;
      parent.add(mesh);
      return mesh;
    }

    sphere(parent, radius, x, y, z, material, segments = 16, name) {
      const THREE = window.THREE;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, segments, Math.max(8, Math.floor(segments / 2))),
        material
      );
      mesh.position.set(x, y, z);
      const mName = (material && material.name) || "";
      mesh.castShadow = !NO_SHADOW_CAST.has(mName);
      mesh.receiveShadow = !NO_SHADOW_RECEIVE.has(mName);
      if (name) mesh.name = name;
      parent.add(mesh);
      return mesh;
    }

    beam(parent, ax, ay, az, bx, by, bz, thickness, material, name) {
      const THREE = window.THREE;
      const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
      const len = dir.length();
      if (len < 0.001) return null;
      const mesh = new THREE.Mesh(this.sc.unitBoxGeo, material);
      mesh.scale.set(thickness, len, thickness);
      mesh.position.set((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      if (name) mesh.name = name;
      parent.add(mesh);
      return mesh;
    }

    canvasPlane(parent, width, height, x, y, z, rx, ry, rz, drawFn, pxW = 512, pxH = 256, options = {}) {
      const THREE = window.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = pxW;
      canvas.height = pxH;
      const ctx = canvas.getContext("2d");
      drawFn(ctx, pxW, pxH);
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      if (this.sc && this.sc.renderer && this.sc.renderer.capabilities) {
        tex.anisotropy = Math.min(8, this.sc.renderer.capabilities.getMaxAnisotropy());
      }
      const MatCtor = options.unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
      const matParams = {
        map: tex,
        transparent: options.transparent === true,
        depthWrite: options.depthWrite !== false,
        polygonOffset: options.polygonOffset !== false,
        polygonOffsetFactor: options.polygonOffsetFactor ?? -2,
        polygonOffsetUnits: options.polygonOffsetUnits ?? -2,
        side: options.side || THREE.FrontSide
      };
      if (!options.unlit) {
        matParams.roughness = options.roughness ?? 0.65;
        matParams.metalness = options.metalness ?? 0.08;
        if (options.emissiveMap) {
          matParams.emissive = new THREE.Color(0xffffff);
          matParams.emissiveMap = tex;
          matParams.emissiveIntensity = options.emissiveIntensity ?? 0.45;
        }
      }
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new MatCtor(matParams));
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.receiveShadow = !options.unlit;
      if (options.name) mesh.name = options.name;
      parent.add(mesh);
      return mesh;
    }

    label(parent, text, x, y, z, options = {}) {
      const THREE = window.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 512, 128);
      if (options.background) {
        ctx.fillStyle = options.background;
        ctx.fillRect(0, 0, 512, 128);
      }
      ctx.font = `700 ${options.fontSize || 64}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = options.color || "#f8fafc";
      ctx.fillText(text, 256, 68);
      const texture = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false })
      );
      sprite.position.set(x, y, z);
      sprite.scale.set(options.width || 10, options.height || 2.5, 1);
      parent.add(sprite);
      return sprite;
    }

    floorLabel(parent, text, x, y, z, width = 16, color = "rgba(240,240,232,0.82)") {
      const THREE = window.THREE;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, 512, 256);
      ctx.font = "900 170px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = color;
      ctx.fillText(text, 256, 138);
      const texture = new THREE.CanvasTexture(canvas);
      if (THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, width * 0.5),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    }

    palmTree(parent, x, z, scale = 1, seed = 0, baseY = 0) {
      const h = (8.5 + (seed % 5) * 1.1) * scale;
      const leanX = Math.sin(seed * 1.7) * 0.8 * scale;
      const leanZ = Math.cos(seed * 2.3) * 0.7 * scale;
      const segs = 4;
      const trunkMat = this.mat("trunk");
      const frondMat = this.mat("palm_frond");

      let prevX = x;
      let prevY = baseY;
      let prevZ = z;
      for (let i = 1; i <= segs; i++) {
        const t = i / segs;
        const curX = x + leanX * t * t;
        const curY = baseY + h * t;
        const curZ = z + leanZ * t * t;
        const r = (0.32 - 0.14 * t) * scale;
        const segLen = Math.hypot(curX - prevX, curY - prevY, curZ - prevZ);
        const seg = this.cone(parent, r * 0.86, r, segLen + 0.15, (prevX + curX) * 0.5, (prevY + curY) * 0.5, (prevZ + curZ) * 0.5, trunkMat, 7, "PalmTrunk");
        seg.rotation.z = -(curX - prevX) / Math.max(0.5, curY - prevY);
        seg.rotation.x = (curZ - prevZ) / Math.max(0.5, curY - prevY);
        prevX = curX;
        prevY = curY;
        prevZ = curZ;
      }

      // Lush arched frond fan crown
      const frondCount = 7;
      for (let f = 0; f < frondCount; f++) {
        const angle = (f / frondCount) * Math.PI * 2 + seed * 0.7;
        const frondLen = (2.6 + (f % 2) * 0.55) * scale;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        const mid = this.boxRot(
          parent,
          0.62 * scale,
          0.07 * scale,
          frondLen,
          prevX + dx * (frondLen * 0.45),
          prevY + 0.18 * scale,
          prevZ + dz * (frondLen * 0.45),
          -0.18,
          -angle + Math.PI / 2,
          0,
          frondMat,
          "PalmFrond"
        );
        mid.castShadow = true;
        // Drooping leaf tip
        this.boxRot(
          parent,
          0.46 * scale,
          0.06 * scale,
          frondLen * 0.7,
          prevX + dx * (frondLen * 1.05),
          prevY - 0.42 * scale,
          prevZ + dz * (frondLen * 1.05),
          -0.62,
          -angle + Math.PI / 2,
          0,
          frondMat,
          "PalmFrondTip"
        );
      }
      this.sphere(parent, 0.34 * scale, prevX, prevY - 0.15 * scale, prevZ, this.mat("foliage"), 8, "PalmCrown");
    }

    lightPole(parent, x, z, yaw = 0, height = 10, dualArm = false, baseY = 0) {
      const grp = new window.THREE.Group();
      grp.position.set(x, baseY, z);
      grp.rotation.y = yaw;
      this.cyl(grp, 0.34, 0.45, 0, 0.225, 0, this.mat("concrete_dark"), 8, "LightPlinth");
      this.cone(grp, 0.12, 0.22, height, 0, 0.45 + height * 0.5, 0, this.mat("steel_grey"), 8, "LightMast");
      const armDirs = dualArm ? [-1, 1] : [1];
      for (const dir of armDirs) {
        this.box(grp, 0.14, 0.14, 2.6, 0, 0.45 + height - 0.2, dir * 1.3, this.mat("steel_grey"), "LightArm");
        this.box(grp, 0.65, 0.18, 1.15, 0, 0.45 + height - 0.28, dir * 2.45, this.mat("steel_white"), "LightHousing");
        this.box(grp, 0.52, 0.08, 0.96, 0, 0.45 + height - 0.4, dir * 2.45, this.mat("lamp"), "LightLens");
      }
      parent.add(grp);
      return grp;
    }

    vehicle(parent, x, z, yaw = 0, colorKey = "silver", variant = "sedan", baseY = 0) {
      const grp = new window.THREE.Group();
      grp.position.set(x, baseY, z);
      grp.rotation.y = yaw;
      const bodyMat = this.mat(colorKey);
      const isVan = variant === "van";
      const isTruck = variant === "truck";
      const len = isVan ? 5.6 : isTruck ? 5.2 : 4.5;
      const wid = isVan ? 2.15 : 1.9;
      const bodyH = isVan ? 1.55 : 0.72;
      const axleZ = len * 0.31;

      for (const wx of [-wid * 0.48, wid * 0.48]) {
        for (const wz of [-axleZ, axleZ]) {
          const wheel = this.cyl(grp, 0.34, 0.24, wx, 0.34, wz, this.mat("tire"), 10, "Wheel");
          wheel.rotation.z = Math.PI / 2;
        }
      }

      // Main chassis body
      this.box(grp, wid, bodyH, len, 0, 0.34 + bodyH * 0.5, 0, bodyMat, "VehBody");
      // Bumpers
      this.box(grp, wid + 0.08, 0.22, 0.24, 0, 0.44, len * 0.5 + 0.05, this.mat("black"), "FrontBumper");
      this.box(grp, wid + 0.08, 0.22, 0.24, 0, 0.44, -len * 0.5 - 0.05, this.mat("black"), "RearBumper");

      if (!isVan) {
        const cabLen = isTruck ? 2.1 : 2.35;
        const cabZ = isTruck ? 0.45 : -0.18;
        this.box(grp, wid * 0.84, 0.56, cabLen, 0, 0.34 + bodyH + 0.28, cabZ, this.mat("glass"), "VehGlass");
        this.box(grp, wid * 0.88, 0.08, cabLen + 0.06, 0, 0.34 + bodyH + 0.58, cabZ, bodyMat, "VehRoof");
      } else {
        this.box(grp, wid + 0.04, 0.52, len * 0.82, 0, 1.38, -0.15, this.mat("glass"), "VanWindows");
        this.box(grp, wid * 0.78, 0.14, 1.6, 0, 1.96, -0.4, this.mat("steel_white"), "VanAC");
      }

      // Headlights & taillights
      for (const side of [-wid * 0.34, wid * 0.34]) {
        this.box(grp, 0.32, 0.16, 0.06, side, 0.62, len * 0.5 + 0.04, this.mat("lamp"), "Headlight");
        this.box(grp, 0.32, 0.16, 0.06, side, 0.62, -len * 0.5 - 0.04, this.mat("red"), "Taillight");
      }

      parent.add(grp);
      return grp;
    }

    flagPole(parent, x, z, height = 22, kind = "usa", baseY = 0) {
      this.cyl(parent, 0.55, 0.5, x, baseY + 0.25, z, this.mat("concrete_curb"), 10, "FlagPlinth");
      this.cone(parent, 0.1, 0.24, height, x, baseY + 0.5 + height * 0.5, z, this.mat("silver"), 10, "FlagPole");
      this.sphere(parent, 0.24, x, baseY + height + 0.65, z, this.mat("yellow"), 10, "FlagFinial");

      this.canvasPlane(
        parent,
        6.8,
        3.8,
        x + 3.45,
        baseY + height - 1.6,
        z,
        0,
        0,
        0,
        (ctx, w, h) => {
          if (kind === "nasa") {
            ctx.fillStyle = "#0b3d91";
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.ellipse(w * 0.5, h * 0.5, w * 0.28, h * 0.24, -0.35, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = "#fc3d21";
            ctx.beginPath();
            ctx.moveTo(w * 0.25, h * 0.7);
            ctx.lineTo(w * 0.58, h * 0.18);
            ctx.lineTo(w * 0.72, h * 0.76);
            ctx.lineTo(w * 0.55, h * 0.45);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = "900 92px Arial, Helvetica, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("NASA", w * 0.5, h * 0.54);
          } else {
            const stripeH = h / 13;
            for (let s = 0; s < 13; s++) {
              ctx.fillStyle = s % 2 === 0 ? "#b22234" : "#ffffff";
              ctx.fillRect(0, s * stripeH, w, stripeH + 1);
            }
            ctx.fillStyle = "#3c3b6e";
            ctx.fillRect(0, 0, w * 0.4, stripeH * 7);
            ctx.fillStyle = "#ffffff";
            for (let r = 0; r < 5; r++) {
              for (let c = 0; c < 6; c++) {
                ctx.beginPath();
                ctx.arc(w * (0.045 + c * 0.06), h * (0.065 + r * 0.092), 3.6, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
        },
        512,
        286,
        { side: window.THREE.DoubleSide, name: kind === "nasa" ? "NASAFlagBanner" : "USAFlagBanner" }
      );
    }

    signBoard(parent, x, y, z, ry, width, height, drawFn, name = "SiteSign") {
      const grp = new window.THREE.Group();
      grp.position.set(x, y, z);
      grp.rotation.y = ry;
      const postSpan = Math.max(0.6, width * 0.36);
      const postLen = y + height + 0.1;
      for (const px of [-postSpan, postSpan]) {
        this.cyl(grp, 0.09, postLen, px, postLen * 0.5 - y, -0.02, this.mat("steel_grey"), 8, "SignPost");
      }
      this.box(grp, width + 0.16, height + 0.16, 0.12, 0, height * 0.5, -0.02, this.mat("steel_grey"), "SignBackplate");
      this.canvasPlane(
        grp,
        width,
        height,
        0,
        height * 0.5,
        0.06,
        0,
        0,
        0,
        drawFn,
        512,
        256,
        { name }
      );
      parent.add(grp);
      return grp;
    }

    addBoxCollider(cx, cz, width, depth, name, opts) {
      const entry = {
        minX: cx - width * 0.5,
        maxX: cx + width * 0.5,
        minZ: cz - depth * 0.5,
        maxZ: cz + depth * 0.5,
        name: name || "structure"
      };
      if (opts && typeof opts.minY === "number") entry.minY = opts.minY;
      if (opts && typeof opts.maxY === "number") entry.maxY = opts.maxY;
      this.boxColliders.push(entry);
    }

    addCircleCollider(x, z, radius, name, opts) {
      const entry = { x, z, r: radius, name: name || "structure" };
      if (opts && typeof opts.minY === "number") entry.minY = opts.minY;
      if (opts && typeof opts.maxY === "number") entry.maxY = opts.maxY;
      this.circleColliders.push(entry);
    }

    railing(parent, ax, az, bx, bz, y, material) {
      const length = Math.hypot(bx - ax, bz - az);
      const segments = Math.max(2, Math.floor(length / 9));
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        this.box(parent, 0.1, 1.1, 0.1, ax + (bx - ax) * t, y + 0.55, az + (bz - az) * t, material);
      }
      this.beam(parent, ax, y + 1.05, az, bx, y + 1.05, bz, 0.08, material);
      this.beam(parent, ax, y + 0.6, az, bx, y + 0.6, bz, 0.06, material);
    }
  }

  NS.SpaceCenterSite = SpaceCenterSite;
  window.SpaceCenterSite = SpaceCenterSite;
})(window);
