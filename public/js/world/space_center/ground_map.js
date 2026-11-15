/**
 * Space Center LC-39A — Ground Minimap
 * ============================================================================
 * A compact top-down map for the Kennedy Space Center ground tour.
 * - Draws the crawlerway/road network and every major ground facility.
 * - Marks local & remote crew, the driveable NASA car, and all parked
 *   site vehicles.
 * - Toggle with [N] or by clicking the map header. Starts collapsed on
 *   small / touch displays so it does not cover the HUD.
 */
(function (window) {
  "use strict";

  const MAP_W = 224;
  const MAP_H = 246;
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  class SpaceCenterGroundMap {
    constructor() {
      this.el = null;
      this.canvas = null;
      this.ctx = null;
      this.staticCanvas = null;
      this.countEl = null;
      this.toggleEl = null;
      this.collapsed = !!(window.isMobileDevice || window.innerWidth <= 900);
      this.accum = 0;
      this._map = null;
      this._staticSite = null;
      this._parked = [];
      this._hookVehicleFactory();
    }

    init() {
      if (this.el) return;
      const style = document.createElement("style");
      style.id = "space-center-ground-map-style";
      style.textContent = `
        #space-center-ground-map {
          position: fixed;
          top: calc(96px + var(--safe-top, 0px));
          right: calc(16px + var(--safe-right, 0px));
          width: 236px;
          z-index: 905;
          display: none;
          border: 1px solid rgba(103, 232, 249, 0.32);
          border-radius: 7px;
          background: rgba(5, 10, 18, 0.9);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: #dbe7f3;
          pointer-events: auto;
          overflow: hidden;
          user-select: none;
        }
        #space-center-ground-map .gm-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 8px;
          cursor: pointer;
          background: linear-gradient(180deg, rgba(14, 27, 45, 0.96), rgba(7, 14, 25, 0.96));
          border-bottom: 1px solid rgba(103, 232, 249, 0.16);
        }
        #space-center-ground-map.is-collapsed .gm-head {
          border-bottom: none;
        }
        #space-center-ground-map .gm-title {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.2px;
          color: #e2e8f0;
          white-space: nowrap;
        }
        #space-center-ground-map .gm-title b {
          color: #fbbf24;
        }
        #space-center-ground-map .gm-live {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #34d399;
          box-shadow: 0 0 6px rgba(52, 211, 153, 0.8);
        }
        #space-center-ground-map .gm-toggle {
          width: 17px;
          height: 17px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 4px;
          color: #93c5fd;
          font-size: 11px;
          font-weight: 800;
        }
        #space-center-ground-map .gm-body {
          padding: 5px 6px 6px;
        }
        #space-center-ground-map.is-collapsed .gm-body {
          display: none;
        }
        #space-center-ground-map canvas {
          display: block;
          width: 100%;
          height: auto;
          border-radius: 4px;
          background: #07111d;
        }
        #space-center-ground-map .gm-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
          flex-wrap: wrap;
          padding-top: 4px;
          font-size: 7px;
          letter-spacing: 0.4px;
          color: #94a3b8;
        }
        #space-center-ground-map .gm-key {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        #space-center-ground-map .gm-key span {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        #space-center-ground-map i {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          font-style: normal;
        }
        #space-center-ground-map i.gm-crew { background: #67e8f9; }
        #space-center-ground-map i.gm-car { background: #fbbf24; border-radius: 1px; }
        #space-center-ground-map i.gm-bld { background: #64748b; border-radius: 1px; }
        #space-center-ground-map .gm-count {
          margin-left: auto;
          color: #67e8f9;
          white-space: nowrap;
        }
        @media (max-width: 900px) {
          #space-center-ground-map {
            top: calc(74px + var(--safe-top, 0px));
            width: 184px;
          }
          #space-center-ground-map .gm-foot {
            font-size: 6.5px;
          }
        }
      `;
      document.head.appendChild(style);

      const el = document.createElement("div");
      el.id = "space-center-ground-map";
      el.innerHTML = `
        <div class="gm-head" id="gm-head" title="Toggle ground map [N]">
          <div class="gm-title"><span class="gm-live"></span>KSC <b>GROUND MAP</b> <span style="color:#64748b;">[N]</span></div>
          <div class="gm-toggle" id="gm-toggle">${this.collapsed ? "+" : "–"}</div>
        </div>
        <div class="gm-body">
          <canvas id="gm-canvas" width="${MAP_W * DPR}" height="${MAP_H * DPR}"></canvas>
          <div class="gm-foot">
            <div class="gm-key">
              <span><i class="gm-crew"></i>CREW</span>
              <span><i class="gm-car"></i>CAR</span>
              <span><i class="gm-bld"></i>FACILITY</span>
            </div>
            <div class="gm-count" id="gm-count">--</div>
          </div>
        </div>
      `;
      if (this.collapsed) el.classList.add("is-collapsed");
      document.body.appendChild(el);
      this.el = el;
      this.toggleEl = el.querySelector("#gm-toggle");
      this.countEl = el.querySelector("#gm-count");
      this.canvas = el.querySelector("#gm-canvas");
      this.ctx = this.canvas.getContext("2d");

      el.querySelector("#gm-head").addEventListener("click", () => this.toggle());
      window.addEventListener("keydown", (e) => {
        if (e.code !== "KeyN" || e.repeat) return;
        if (!window.isGameStarted || !window.spaceCenter || !window.spaceCenter.isGroundMode) return;
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT")) return;
        if (e.target && e.target.isContentEditable) return;
        if (this._uiBlocked()) return;
        e.preventDefault();
        this.toggle();
      });
      window.addEventListener("resize", () => {
        if (window.innerWidth <= 900 && !window.isMobileDevice) {
          // Keep the map open; only the CSS size changes.
        }
      });
    }

    toggle() {
      this._setCollapsed(!this.collapsed);
    }

    _setCollapsed(collapsed) {
      this.collapsed = !!collapsed;
      if (!this.el) return;
      this.el.classList.toggle("is-collapsed", this.collapsed);
      if (this.toggleEl) this.toggleEl.textContent = this.collapsed ? "+" : "–";
    }

    /**
     * The map is useful on foot but a large map window eats the road view while
     * driving. Fold it to the header for the drive and restore the player's
     * previous choice when they step out. A manual expand while driving sticks
     * until the car is exited.
     */
    _syncCarCollapse() {
      if (!this.el) return;
      const driving = document.body.classList.contains("ground-car-driving");
      if (driving && !this._carAutoCollapsed) {
        this._carAutoCollapsed = true;
        this._carWasCollapsed = this.collapsed;
        if (!this.collapsed) this._setCollapsed(true);
      } else if (!driving && this._carAutoCollapsed) {
        this._carAutoCollapsed = false;
        if (!this._carWasCollapsed) this._setCollapsed(false);
      }
    }

    _uiBlocked() {
      if (window.gameplay && window.gameplay.activeTask) return true;
      if (window.launchCutscene && window.launchCutscene.isPlaying) return true;
      if (window.dockingSim && window.dockingSim.isActive) return true;
      if (window.solarSystem && window.solarSystem.isActive) return true;
      if (window.missionViz && window.missionViz.isActive) return true;
      if (window.issShowcase && window.issShowcase.isActive) return true;
      if (window.vrManager && window.vrManager.isAnyVRActive) return true;
      const overlays = ["mission-briefing-overlay", "modal-academy", "modal-mission-log", "modal-auth", "modal-station-systems", "task-modal-overlay", "victory-overlay"];
      for (const id of overlays) {
        const node = document.getElementById(id);
        if (node && node.style && node.style.display && node.style.display !== "none") return true;
      }
      return false;
    }

    _active() {
      if (!window.isGameStarted) return false;
      const sc = window.spaceCenter;
      if (!sc || !sc.isGroundMode) return false;
      if (sc.crewBoarded || sc.isLaunching) return false;
      if (window.launchCutscene && window.launchCutscene.isPlaying) return false;
      if (window.dockingSim && window.dockingSim.isActive) return false;
      if (window.solarSystem && window.solarSystem.isActive) return false;
      if (window.missionViz && window.missionViz.isActive) return false;
      if (window.issShowcase && window.issShowcase.isActive) return false;
      if (window.vrManager && window.vrManager.isAnyVRActive) return false;
      return true;
    }

    _hookVehicleFactory() {
      const proto = window.SpaceCenterSite && window.SpaceCenterSite.prototype;
      if (!proto || proto._groundMapHooked) return;
      const original = proto.vehicle;
      if (typeof original !== "function") return;
      proto.vehicle = function (parent, x, z, yaw, colorKey, variant, baseY) {
        const result = original.apply(this, arguments);
        try {
          if (!this._groundMapVehicles) this._groundMapVehicles = [];
          this._groundMapVehicles.push({
            x: Number(x) || 0,
            z: Number(z) || 0,
            yaw: Number(yaw) || 0,
            variant: variant || "sedan"
          });
        } catch (e) {}
        return result;
      };
      proto._groundMapHooked = true;
    }

    update(delta) {
      this.accum += Math.max(0, delta || 0);
      if (this.accum < 0.11) return;
      this.accum = 0;

      const active = this._active();
      if (this.el) this.el.style.display = active ? "block" : "none";
      if (this.toggleEl) {
        const symbol = this.collapsed ? "+" : "–";
        if (this.toggleEl.textContent !== symbol) this.toggleEl.textContent = symbol;
      }
      this._avoidGroundHudOverlap();
      this._syncCarCollapse();
      if (!active || !this.ctx) return;
      if (this.collapsed) return;

      this._ensureStatic();
      this._draw();
    }

    /**
     * On short screens the expanded map and the Site Tour panel can share the
     * same space. When they do, collapse the tour panel to its compact header
     * while the map is open, and restore it when the map closes.
     */
    _avoidGroundHudOverlap() {
      if (!this.el) return;
      const sc = window.spaceCenter;
      const restore = () => {
        if (!this._siteHudAutoCollapsed) return;
        if (sc) {
          sc.hudCollapsed = !!this._siteHudWasCollapsed;
          if (typeof sc._renderGroundHUD === "function") sc._renderGroundHUD();
        }
        this._siteHudAutoCollapsed = false;
      };
      if (this.collapsed) {
        restore();
        return;
      }
      const ground = document.getElementById("space-center-ground-hud");
      if (!sc || !ground || ground.style.display === "none" || !sc.isGroundMode) {
        restore();
        return;
      }
      const mapRect = this.el.getBoundingClientRect();
      const hudRect = ground.getBoundingClientRect();
      const overlap = mapRect.left < hudRect.right &&
        mapRect.right > hudRect.left &&
        mapRect.top < hudRect.bottom &&
        mapRect.bottom > hudRect.top;
      if (overlap && !sc.hudCollapsed) {
        if (!this._siteHudAutoCollapsed) this._siteHudWasCollapsed = false;
        sc.hudCollapsed = true;
        this._siteHudAutoCollapsed = true;
        if (typeof sc._renderGroundHUD === "function") sc._renderGroundHUD();
      } else if (!overlap) {
        restore();
      }
    }

    _ensureStatic() {
      const site = window.spaceCenter && window.spaceCenter.site;
      if (!site) return;
      if (this.staticCanvas && this._staticSite === site) return;

      this._staticSite = site;
      this._parked = (site._groundMapVehicles || []).slice();
      this._setupProjection();
      this._buildStatic(site);
    }

    _setupProjection() {
      const c = (window.SpaceCenterModules && window.SpaceCenterModules.constants) || {};
      const b = c.SITE_BOUNDS || { minX: -1050, maxX: 525, minZ: -1050, maxZ: 850 };
      const pad = 8;
      const worldW = Math.max(1, b.maxX - b.minX);
      const worldH = Math.max(1, b.maxZ - b.minZ);
      const scale = Math.min((MAP_W - pad * 2) / worldW, (MAP_H - pad * 2) / worldH);
      this._map = {
        bounds: b,
        scale,
        ox: (MAP_W - worldW * scale) * 0.5,
        oy: (MAP_H - worldH * scale) * 0.5
      };
    }

    _mx(x) {
      const m = this._map;
      return m.ox + (x - m.bounds.minX) * m.scale;
    }

    _mz(z) {
      const m = this._map;
      return m.oy + (z - m.bounds.minZ) * m.scale;
    }

    _buildStatic(site) {
      const canvas = document.createElement("canvas");
      canvas.width = MAP_W * DPR;
      canvas.height = MAP_H * DPR;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, MAP_W, MAP_H);

      // Ground / water base.
      ctx.fillStyle = "#0a1724";
      ctx.fillRect(0, 0, MAP_W, MAP_H);

      const C = (window.SpaceCenterModules && window.SpaceCenterModules.constants) || {};
      const NS = window.SpaceCenterModules || {};

      // Atlantic beach + water on the east edge.
      this._fillWorldRect(ctx, 468, -1050, 58, 1900, "#b9a176");
      this._fillWorldRect(ctx, 514, -1050, 30, 1900, "#0b4b68");

      // Grass tone.
      this._fillWorldRect(ctx, C.SITE_BOUNDS ? C.SITE_BOUNDS.minX : -1050, -1050, C.SITE_BOUNDS ? (C.SITE_BOUNDS.maxX - C.SITE_BOUNDS.minX) : 1575, 1900, "rgba(39, 69, 43, 0.55)");

      // Crawlerway network.
      this._roadLine(ctx, [[0, 186], [0, 591]], 50, "#7d7466");
      this._roadLine(ctx, [[0, 186], [0, 591]], 14.5, "#405f38");
      if (NS.CRAWLERWAY_39B_POINTS) {
        this._roadLine(ctx, NS.CRAWLERWAY_39B_POINTS, 50, "#7d7466");
        this._roadLine(ctx, NS.CRAWLERWAY_39B_POINTS, 14.5, "#405f38");
      }
      // Pad ramp.
      this._fillWorldRect(ctx, -19, 60, 38, 126, "#7b838b");

      // Road network.
      this._roadLine(ctx, [[-692, 296], [187, 296]], 14, "#323a46");
      this._roadLine(ctx, [[180, -148], [180, 292]], 14, "#323a46");
      this._roadLine(ctx, [[-692, 50], [-692, 289]], 12, "#323a46");
      this._roadLine(ctx, [[-686, 56], [-560, 56]], 12, "#323a46");
      this._roadLine(ctx, [[-686, 92], [-595, 92]], 11, "#323a46");
      this._roadLine(ctx, [[156, 214], [173, 214]], 10, "#323a46");
      this._roadLine(ctx, [[-172, 88], [-138, 88]], 10, "#323a46");
      this._fillWorldRect(ctx, -233, 245, 106, 44, "rgba(50, 58, 70, 0.75)");

      const feature = (kind, x, z, w, d, options = {}) => {
        const fill = options.fill || "#203a52";
        const stroke = options.stroke || "rgba(125, 211, 252, 0.72)";
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.8;
        if (kind === "circle") {
          const r = Math.max(2, w * this._map.scale);
          ctx.beginPath();
          ctx.arc(this._mx(x), this._mz(z), r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          const px = this._mx(x - w * 0.5);
          const pz = this._mz(z - d * 0.5);
          const pw = Math.max(1.5, w * this._map.scale);
          const ph = Math.max(1.5, d * this._map.scale);
          ctx.fillRect(px, pz, pw, ph);
          ctx.strokeRect(px, pz, pw, ph);
        }
      };

      const VAB = C.VAB || { x: -30, z: 700, halfX: 79, halfZ: 109 };
      const LCC = C.LCC || { x: -180, z: 180, halfX: 35, halfZ: 23 };
      const PAD = C.PAD || { x: 0, z: 0 };
      const PADB = C.PAD_39B || { x: -120, z: -760 };
      const PRESS = C.PRESS || { x: 118, z: 214 };
      const CRAWLER = C.CRAWLER || { x: 0, z: 500 };
      const PROP = C.PROPELLANT || { x: -120, z: 88 };
      const TURN = C.TURN_BASIN || { x: -930, z: 118 };
      const SUB = C.SUBSTATION || { x: -706, z: 50 };
      const GEN = C.GENERATOR || { x: -618, z: 18 };
      const COOL = C.COOLING || { x: -620, z: 58 };
      const FIRE = C.FIRE_TANK || { x: -596, z: 92 };
      const ANT = C.ANTENNA || { x: -850, z: 336 };
      const WATER = C.WATER_TOWER || { x: 96, z: 58 };

      // Major facilities.
      feature("rect", VAB.x, VAB.z, VAB.halfX * 2, VAB.halfZ * 2, { fill: "#1b3550", stroke: "#7dd3fc" });
      feature("rect", -164, 762, 102, 74, { fill: "#172f47", stroke: "#60a5fa" });
      feature("rect", 62.5, 718, 27, 118, { fill: "#172f47", stroke: "#60a5fa" });
      // Launch mounts / towers inside each pad.
      feature("rect", 0, 0, 49, 41, { fill: "#101a24", stroke: "#f8fafc" });
      feature("rect", -34, 0, 9, 9, { fill: "#94a3b8", stroke: "#f8fafc" });
      feature("rect", PADB.x, PADB.z, 48, 40, { fill: "#101a24", stroke: "#e2e8f0" });
      feature("rect", LCC.x, LCC.z, LCC.halfX * 2, LCC.halfZ * 2, { fill: "#1c3b58", stroke: "#67e8f9" });
      feature("rect", PRESS.x, PRESS.z, 74, 46, { fill: "#233447", stroke: "#94a3b8" });
      feature("circle", PAD.x, PAD.z, 65, 65, { fill: "#4d5966", stroke: "#e2e8f0" });
      feature("circle", PADB.x, PADB.z, 56, 56, { fill: "#4d5966", stroke: "#cbd5e1" });
      feature("rect", CRAWLER.x, CRAWLER.z, 38, 44, { fill: "#64748b", stroke: "#e2e8f0" });
      feature("rect", PROP.x, PROP.z, 70, 44, { fill: "#223b45", stroke: "#38bdf8" });
      feature("rect", TURN.x, TURN.z, 72, 48, { fill: "#0b4b68", stroke: "#38bdf8" });
      feature("rect", SUB.x, SUB.z, 36, 26, { fill: "#27313c", stroke: "#94a3b8" });
      feature("rect", GEN.x, GEN.z, 14, 10, { fill: "#27313c", stroke: "#94a3b8" });
      feature("circle", COOL.x, COOL.z, 6.2, 6.2, { fill: "#475569", stroke: "#94a3b8" });
      feature("circle", FIRE.x, FIRE.z, 5, 5, { fill: "#475569", stroke: "#94a3b8" });
      feature("rect", ANT.x, ANT.z, 26, 20, { fill: "#27313c", stroke: "#94a3b8" });
      feature("circle", WATER.x, WATER.z, 5.5, 5.5, { fill: "#475569", stroke: "#94a3b8" });
      feature("rect", -390, 296, 6.4, 5.4, { fill: "#475569", stroke: "#94a3b8" });

      // Small 39B support buildings.
      feature("rect", -142.6, -583.7, 9, 7, { fill: "#27313c", stroke: "#94a3b8" });
      feature("rect", -71.5, -709.2, 20, 14, { fill: "#27313c", stroke: "#94a3b8" });
      feature("rect", -119.9, -600.3, 26, 38, { fill: "#64748b", stroke: "#e2e8f0" });

      // Labels.
      this._label(ctx, "VAB", VAB.x, VAB.z, 0, 0, 7, "#e2e8f0");
      this._label(ctx, "LOW BAY", -164, 762, 0, 0, 5.5, "#93c5fd");
      this._label(ctx, "LCC", LCC.x, LCC.z, -4, 0, 6, "#e2e8f0", "right");
      this._label(ctx, "PRESS", PRESS.x, PRESS.z, 0, 9, 6, "#e2e8f0");
      this._label(ctx, "PAD 39A", PAD.x, PAD.z, 0, -9, 6.5, "#f8fafc");
      this._label(ctx, "PAD 39B", PADB.x, PADB.z, 0, 8, 6, "#e2e8f0");
      this._label(ctx, "CRAWLER", CRAWLER.x, CRAWLER.z, 9, 0, 5.5, "#e2e8f0", "left");
      this._label(ctx, "PROP", PROP.x, PROP.z, 0, 9, 5.5, "#7dd3fc");
      this._label(ctx, "TURN BASIN", TURN.x, TURN.z, 0, -8, 5.5, "#7dd3fc");
      this._label(ctx, "SUB", SUB.x, SUB.z, 0, -7, 5, "#cbd5e1");
      this._label(ctx, "ANTENNA", ANT.x, ANT.z, 0, -7, 5, "#cbd5e1");
      this._label(ctx, "WATER", WATER.x, WATER.z, 0, -6, 5, "#cbd5e1");
      this._label(ctx, "BEACH", 492, 20, 0, 0, 5.5, "#fde68a");

      // North arrow. World +Z is south, so north is up on the map.
      ctx.strokeStyle = "rgba(148, 163, 184, 0.8)";
      ctx.fillStyle = "rgba(203, 213, 225, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(13, 18);
      ctx.lineTo(13, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(13, 4);
      ctx.lineTo(10.5, 9);
      ctx.lineTo(15.5, 9);
      ctx.closePath();
      ctx.fill();
      ctx.font = "700 6px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("N", 13, 26);

      this.staticCanvas = canvas;
    }

    _fillWorldRect(ctx, x, z, w, d, color) {
      ctx.fillStyle = color;
      const px = this._mx(x);
      const pz = this._mz(z);
      ctx.fillRect(px, pz, Math.max(1, w * this._map.scale), Math.max(1, d * this._map.scale));
    }

    _roadLine(ctx, points, widthM, color) {
      if (!points || points.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, widthM * this._map.scale);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((pt, i) => {
        const x = this._mx(pt[0]);
        const y = this._mz(pt[1]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    _label(ctx, text, x, z, dx, dy, size, color, align) {
      ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = align || "center";
      ctx.textBaseline = "middle";
      const px = this._mx(x) + (dx || 0);
      const py = this._mz(z) + (dy || 0);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(3, 8, 15, 0.92)";
      ctx.strokeText(text, px, py);
      ctx.fillStyle = color || "#e2e8f0";
      ctx.fillText(text, px, py);
    }

    _draw() {
      const ctx = this.ctx;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, MAP_W, MAP_H);
      if (this.staticCanvas) ctx.drawImage(this.staticCanvas, 0, 0, MAP_W, MAP_H);
      else {
        ctx.fillStyle = "#07111d";
        ctx.fillRect(0, 0, MAP_W, MAP_H);
      }

      // Parked cars: small amber squares.
      ctx.fillStyle = "rgba(251, 191, 36, 0.72)";
      for (const v of this._parked) {
        const px = this._mx(v.x);
        const py = this._mz(v.z);
        ctx.fillRect(px - 0.9, py - 0.9, 1.8, 1.8);
      }

      // Driveable open car.
      const car = window.spaceCenterCar;
      if (car && car.group) {
        const p = car.group.position;
        this._drawCar(ctx, p.x, p.z, car.yaw, !!car.isDriving);
      }

      const nm = window.netManager;
      const remote = nm && nm.remotePlayers ? nm.remotePlayers : {};
      let visibleRemoteCrew = 0;
      let visibleRemoteCars = 0;
      for (const id in remote) {
        const rp = remote[id];
        if (!rp) continue;
        const pos = rp.curPos || (rp.mesh && rp.mesh.position ? [rp.mesh.position.x, rp.mesh.position.y, rp.mesh.position.z] : null);
        if (!pos) continue;
        // A driving crewmate is represented by their car, not a walking dot.
        if (rp.driving) {
          this._drawCar(ctx, pos[0], pos[2], rp.curYaw || 0, true);
          visibleRemoteCars++;
          continue;
        }
        // Hide crewmates who are boarded/in orbit rather than standing on the
        // ground tour (their network position can otherwise be stale).
        if (rp.mesh && rp.mesh.visible === false) continue;
        visibleRemoteCrew++;
        const px = this._mx(pos[0]);
        const py = this._mz(pos[2]);
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = String(rp.color || "#3b82f6");
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = "rgba(3, 8, 15, 0.9)";
        ctx.stroke();
        this._drawHeading(ctx, px, py, rp.curYaw || 0, 3.4, "rgba(255,255,255,0.72)");
      }

      // Local player arrow (the car icon represents them while driving).
      if (window.localCrew && window.localCrew.group && !(car && car.isDriving)) {
        const p = window.localCrew.group.position;
        this._drawPlayer(ctx, p.x, p.z, window.localCrew.group.rotation.y);
      }

      // Live counts.
      const crewCount = 1 + visibleRemoteCrew;
      const carCount = this._parked.length + (car && car.group ? 1 : 0) + visibleRemoteCars;
      if (this.countEl) this.countEl.textContent = `${crewCount} CREW · ${carCount} CARS`;
    }

    _drawPlayer(ctx, x, z, yaw) {
      const px = this._mx(x);
      const py = this._mz(z);
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const tipX = px + fx * 5.2;
      const tipY = py + fz * 5.2;
      const b1X = px - fx * 2.8 + rx * 3.5;
      const b1Y = py - fz * 2.8 + rz * 3.5;
      const b2X = px - fx * 2.8 - rx * 3.5;
      const b2Y = py - fz * 2.8 - rz * 3.5;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(b1X, b1Y);
      ctx.lineTo(b2X, b2Y);
      ctx.closePath();
      ctx.fillStyle = "#67e8f9";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#03121b";
      ctx.stroke();
    }

    _drawCar(ctx, x, z, yaw, driving) {
      const px = this._mx(x);
      const py = this._mz(z);
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      const hl = 3.6;
      const hw = 2.0;
      const pts = [
        [px + fx * hl + rx * hw, py + fz * hl + rz * hw],
        [px + fx * hl - rx * hw, py + fz * hl - rz * hw],
        [px - fx * hl - rx * hw, py - fz * hl - rz * hw],
        [px - fx * hl + rx * hw, py - fz * hl + rz * hw]
      ];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      if (driving) {
        ctx.shadowColor = "rgba(251, 191, 36, 0.95)";
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#1b1304";
      ctx.stroke();
      if (driving) {
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = "#67e8f9";
        ctx.fill();
      }
    }

    _drawHeading(ctx, x, y, yaw, len, color) {
      const fx = Math.sin(yaw || 0);
      const fz = Math.cos(yaw || 0);
      ctx.beginPath();
      ctx.moveTo(x + fx * 1.2, y + fz * 1.2);
      ctx.lineTo(x + fx * len, y + fz * len);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  window.SpaceCenterGroundMap = SpaceCenterGroundMap;
  window.spaceCenterGroundMap = new SpaceCenterGroundMap();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => window.spaceCenterGroundMap.init(), { once: true });
  } else {
    window.spaceCenterGroundMap.init();
  }
})(window);
