/**
 * ============================================================================
 * ISS CSA LAB — cooperative station side activities
 * ============================================================================
 * Two CSA-inspired activities that are actually performed aboard the ISS:
 *   - Canadarm2 cargo capture (one crew drives the arm, one calls the latch)
 *   - Tomatosphere greenhouse (one crew manages water, one manages climate)
 *
 * Both are optional. They are synchronised by the server per room, never count
 * toward the seven mission objectives, and are only available in the station
 * phase at the physical CSA Lab console in Kibo.
 */

(function (window) {
  "use strict";

  const WORK_POSITION = [4.2, 0, -3.5];
  const INTERACT_RADIUS = 2.6;
  const GAME_IDS = ["canadarm", "tomato"];

  const GAME_META = {
    canadarm: {
      label: "CANADARM2 CAPTURE",
      short: "ROBOT ARM",
      hint: "ARM operator: A/D rotate, W/S extend. LATCH operator: SPACE to capture."
    },
    tomato: {
      label: "TOMATOSPHERE",
      short: "GREENHOUSE",
      hint: "WATER operator: A/D. CLIMATE operator: W/S light, Q/E temperature."
    }
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  class IssSideGames {
    constructor() {
      this.isOpen = false;
      this.current = "canadarm";
      this.states = {};
      this.participants = {};
      this.overlay = null;
      this.bodyEl = null;
      this.lastError = "";
      this.built = false;
      this.networkBound = false;
    }

    init() {
      if (this.built) return;
      this._build();
      this._bindNetwork();
      this._bindKeys();
      this.built = true;
      console.log("[ISS CSA Lab] Cooperative Canadarm2 and Tomatosphere activities online.");
    }

    getStationPosition() {
      return { x: WORK_POSITION[0], y: WORK_POSITION[1], z: WORK_POSITION[2] };
    }

    getNearby(playerPos) {
      if (!playerPos) return null;
      const distance = Math.hypot(playerPos.x - WORK_POSITION[0], playerPos.z - WORK_POSITION[2]);
      return distance <= INTERACT_RADIUS ? { id: "csa-lab", distance } : null;
    }

    open(gameId) {
      if (!window.isGameStarted) return false;
      const mission = window.netManager && typeof window.netManager.getMission === "function"
        ? window.netManager.getMission()
        : null;
      if (!mission || mission.phase !== "station") {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("CSA LAB ACTIVITIES UNLOCK INSIDE THE ISS AFTER DOCKING");
        }
        return false;
      }
      if (!this.built) this.init();
      this.isOpen = true;
      this.overlay.style.display = "flex";
      this.switchGame(gameId || this.current);
      if (window.spaceAudio) window.spaceAudio.playClick();
      return true;
    }

    close() {
      if (!this.isOpen) return;
      if (window.netManager && typeof window.netManager.leaveSideGame === "function") {
        window.netManager.leaveSideGame(this.current);
      }
      this.isOpen = false;
      if (this.overlay) this.overlay.style.display = "none";
      if (window.spaceAudio) window.spaceAudio.playClick();
    }

    switchGame(gameId) {
      const next = GAME_IDS.includes(gameId) ? gameId : "canadarm";
      if (window.netManager && typeof window.netManager.joinSideGame === "function") {
        if (this.isOpen && this.current !== next) window.netManager.leaveSideGame(this.current);
        window.netManager.joinSideGame(next);
      }
      this.current = next;
      this.lastError = "";
      this._render();
    }

    send(action) {
      if (!this.isOpen || !window.netManager || typeof window.netManager.sendSideGameAction !== "function") return;
      window.netManager.sendSideGameAction(this.current, action);
    }

    _bindNetwork() {
      const nm = window.netManager;
      if (!nm || typeof nm.on !== "function") {
        setTimeout(() => this._bindNetwork(), 500);
        return;
      }
      if (this.networkBound) return;
      this.networkBound = true;
      nm.on("sidegame_state", (data) => {
        if (!data || !GAME_IDS.includes(data.gameId)) return;
        this.states[data.gameId] = data.state || null;
        this.participants[data.gameId] = data.participants || {};
        if (data.gameId === this.current && this.isOpen) this._render();
      });
      nm.on("sidegame_error", (data) => {
        this.lastError = data && data.message ? data.message : "CSA Lab link unavailable.";
        if (this.isOpen) this._render();
      });
      nm.on("sidegame_event", (data) => {
        if (!data || data.kind === "joined") return;
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast(data.message || "CSA LAB ACTIVITY UPDATE");
        }
      });
      nm.on("mission_update", (data) => {
        const phase = data && data.mission ? data.mission.phase : null;
        if (this.isOpen && phase && phase !== "station") this.close();
      });
    }

    _bindKeys() {
      window.addEventListener("keydown", (e) => {
        if (!this.isOpen) return;
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        if (e.code === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.close();
          return;
        }
        const canadarmMap = {
          KeyA: "arm_left", ArrowLeft: "arm_left",
          KeyD: "arm_right", ArrowRight: "arm_right",
          KeyW: "arm_out", ArrowUp: "arm_out",
          KeyS: "arm_in", ArrowDown: "arm_in",
          Space: "latch", KeyR: "reset"
        };
        const tomatoMap = {
          KeyA: "water_down", ArrowLeft: "water_down",
          KeyD: "water_up", ArrowRight: "water_up",
          KeyW: "light_up", ArrowUp: "light_up",
          KeyS: "light_down", ArrowDown: "light_down",
          KeyQ: "temp_down", KeyE: "temp_up",
          KeyR: "reset"
        };
        const action = (this.current === "canadarm" ? canadarmMap : tomatoMap)[e.code];
        if (action) {
          e.preventDefault();
          e.stopPropagation();
          this.send(action);
        } else if (/^(Key|Arrow|Space|Tab)/.test(e.code)) {
          e.stopPropagation();
        }
      }, true);
    }

    _build() {
      const overlay = document.createElement("div");
      overlay.id = "iss-sidegame-overlay";
      overlay.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(2,6,15,0.82);backdrop-filter:blur(4px);padding:18px;";
      overlay.innerHTML = `
        <div style="width:min(760px,96vw);max-height:92dvh;overflow:auto;border-radius:12px;border:1px solid rgba(248,113,113,0.45);background:#070c18;box-shadow:0 24px 70px rgba(0,0,0,0.8);color:#ece7dc;font-family:var(--font-mono,monospace);">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid rgba(248,113,113,0.28);background:rgba(15,23,42,0.95);">
            <div>
              <div style="font-size:10px;letter-spacing:2px;color:#fca5a5;font-weight:700;">CSA LAB · KIBO MODULE</div>
              <div style="font-size:15px;font-weight:800;color:#f8fafc;margin-top:2px;">COOPERATIVE STATION ACTIVITIES</div>
            </div>
            <button type="button" id="iss-sidegame-close" style="padding:7px 12px;border-radius:5px;border:1px solid rgba(148,163,184,0.3);background:rgba(15,23,42,0.8);color:#e2e8f0;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;">CLOSE [ESC]</button>
          </div>
          <div style="display:flex;gap:8px;padding:11px 18px;border-bottom:1px solid rgba(148,163,184,0.16);">
            <button type="button" data-side-tab="canadarm" style="flex:1;padding:8px;border-radius:5px;border:1px solid rgba(103,232,249,0.35);background:rgba(103,232,249,0.1);color:#a5f3fc;font-family:inherit;font-size:10.5px;font-weight:800;cursor:pointer;">CANADARM2 CAPTURE</button>
            <button type="button" data-side-tab="tomato" style="flex:1;padding:8px;border-radius:5px;border:1px solid rgba(74,222,128,0.35);background:rgba(22,163,74,0.1);color:#bbf7d0;font-family:inherit;font-size:10.5px;font-weight:800;cursor:pointer;">TOMATOSPHERE</button>
          </div>
          <div id="iss-sidegame-body" style="padding:16px 18px 20px;"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      this.overlay = overlay;
      this.bodyEl = overlay.querySelector("#iss-sidegame-body");
      overlay.querySelector("#iss-sidegame-close").addEventListener("click", () => this.close());
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.close();
      });
      overlay.querySelectorAll("[data-side-tab]").forEach((button) => {
        button.addEventListener("click", () => this.switchGame(button.getAttribute("data-side-tab")));
      });
      this.bodyEl.addEventListener("click", (e) => {
        const button = e.target && e.target.closest ? e.target.closest("[data-side-action]") : null;
        if (!button) return;
        e.preventDefault();
        this.send(button.getAttribute("data-side-action"));
      });
    }

    _roleSummary(gameId, participants) {
      const nm = window.netManager;
      const myId = nm ? nm.socketId : null;
      const entries = Object.keys(participants || {}).map((id) => participants[id]);
      const mySeat = myId && participants && participants[myId] ? participants[myId].seat : null;
      const seatLabel = (seat) => seat === "arm" ? "ARM" : seat === "latch" ? "LATCH" :
        seat === "water" ? "WATER" : seat === "climate" ? "CLIMATE" : "OBSERVER";
      const people = entries.length
        ? entries.map((p) => `${escapeHtml(p.name || "Crew")} · ${seatLabel(p.seat)}`).join("  |  ")
        : "WAITING FOR CREW";
      return { mySeat, people, solo: entries.length <= 1, count: entries.length };
    }

    _render() {
      if (!this.bodyEl) return;
      const gameId = this.current;
      const state = this.states[gameId] || null;
      const participants = this.participants[gameId] || {};
      const role = this._roleSummary(gameId, participants);
      this.overlay.querySelectorAll("[data-side-tab]").forEach((button) => {
        const active = button.getAttribute("data-side-tab") === gameId;
        const canadarm = button.getAttribute("data-side-tab") === "canadarm";
        button.style.borderColor = active ? (canadarm ? "rgba(103,232,249,0.8)" : "rgba(74,222,128,0.8)") : "rgba(148,163,184,0.2)";
        button.style.background = active ? (canadarm ? "rgba(103,232,249,0.18)" : "rgba(22,163,74,0.18)") : "rgba(15,23,42,0.5)";
        button.style.color = active ? "#f8fafc" : "#94a3b8";
      });

      const meta = GAME_META[gameId];
      const status = state && state.message ? escapeHtml(state.message) : "ESTABLISHING STATION LINK…";
      const roleLine = role.mySeat
        ? `<span style="color:#fde68a;font-weight:800;">YOU · ${role.mySeat.toUpperCase()}</span>`
        : `<span style="color:#94a3b8;">You are observing. Controls unlock when you take a seat.</span>`;

      if (!state) {
        this.bodyEl.innerHTML = `
          <div style="padding:26px;text-align:center;color:#94a3b8;font-size:12px;">
            CONNECTING TO ${meta.label}…<br/><br/>${this.lastError ? `<span style="color:#fca5a5;">${escapeHtml(this.lastError)}</span>` : "Waiting for the station link."}
          </div>`;
        return;
      }

      if (gameId === "canadarm") {
        const solo = role.solo;
        const canArm = solo || role.mySeat === "arm";
        const canLatch = solo || role.mySeat === "latch";
        const captured = !!state.captured;
        this.bodyEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:9px;">
            <div style="font-size:10px;color:#cbd5e1;">${roleLine}</div>
            <div style="font-size:10px;color:#67e8f9;">TEAM: ${escapeHtml(role.people)}</div>
          </div>
          <canvas id="iss-canadarm-canvas" width="680" height="270" style="width:100%;height:270px;border-radius:8px;border:1px solid rgba(103,232,249,0.25);background:#040a14;display:block;"></canvas>
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:9px;font-size:10.5px;color:#cbd5e1;">
            <span>ARM YAW <b style="color:#67e8f9;">${Number(state.yaw).toFixed(1)}°</b> · EXTEND <b style="color:#67e8f9;">${(Number(state.extend) * 100).toFixed(0)}%</b></span>
            <span>TARGET <b style="color:#fde047;">${Number(state.targetYaw).toFixed(1)}° / ${(Number(state.targetExtend) * 100).toFixed(0)}%</b> · CAPTURES <b style="color:#86efac;">${state.captures || 0}</b></span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:11px;">
            <button type="button" data-side-action="arm_left" ${canArm && !captured ? "" : "disabled"} style="${this._btnStyle(canArm && !captured, "#67e8f9")}">◀ ROTATE [A]</button>
            <button type="button" data-side-action="arm_right" ${canArm && !captured ? "" : "disabled"} style="${this._btnStyle(canArm && !captured, "#67e8f9")}">ROTATE ▶ [D]</button>
            <button type="button" data-side-action="arm_out" ${canArm && !captured ? "" : "disabled"} style="${this._btnStyle(canArm && !captured, "#67e8f9")}">EXTEND [W]</button>
            <button type="button" data-side-action="arm_in" ${canArm && !captured ? "" : "disabled"} style="${this._btnStyle(canArm && !captured, "#67e8f9")}">RETRACT [S]</button>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:7px;margin-top:7px;">
            <button type="button" data-side-action="latch" ${canLatch && !captured ? "" : "disabled"} style="${this._btnStyle(canLatch && !captured, "#fde047")}">LATCH [SPACE]</button>
            <button type="button" data-side-action="reset" style="${this._btnStyle(true, "#94a3b8")}">RESET [R]</button>
          </div>
          <div style="margin-top:10px;padding:9px 11px;border-radius:6px;background:rgba(15,23,42,0.8);border:1px solid rgba(148,163,184,0.16);font-size:10.5px;color:${captured ? "#86efac" : "#fde68a"};">${status}</div>
          <div style="margin-top:8px;font-size:9.5px;color:#64748b;">Two-person crew: one arm operator, one latch operator. Solo crew can use every control.</div>
        `;
        this._drawCanadarm(state);
      } else {
        const solo = role.solo;
        const canWater = solo || role.mySeat === "water";
        const canClimate = solo || role.mySeat === "climate";
        const busy = state.completed || state.failed;
        this.bodyEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:9px;">
            <div style="font-size:10px;color:#cbd5e1;">${roleLine}</div>
            <div style="font-size:10px;color:#86efac;">TEAM: ${escapeHtml(role.people)}</div>
          </div>
          <canvas id="iss-tomato-canvas" width="680" height="220" style="width:100%;height:220px;border-radius:8px;border:1px solid rgba(74,222,128,0.25);background:#040a14;display:block;"></canvas>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;font-size:10px;">
            ${this._bar("WATER", state.water, "#38bdf8", 55)}
            ${this._bar("LIGHT", state.light, "#fde047", 65)}
            ${this._bar("TEMP", state.temp, "#fb7185", 45)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;font-size:10px;">
            ${this._bar("GROWTH", state.growth, "#4ade80", 100)}
            ${this._bar("HEALTH", state.health, "#a7f3d0", 100)}
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:11px;">
            <button type="button" data-side-action="water_down" ${canWater && !busy ? "" : "disabled"} style="${this._btnStyle(canWater && !busy, "#38bdf8")}">WATER − [A]</button>
            <button type="button" data-side-action="water_up" ${canWater && !busy ? "" : "disabled"} style="${this._btnStyle(canWater && !busy, "#38bdf8")}">WATER + [D]</button>
            <button type="button" data-side-action="light_down" ${canClimate && !busy ? "" : "disabled"} style="${this._btnStyle(canClimate && !busy, "#fde047")}">LIGHT − [S]</button>
            <button type="button" data-side-action="light_up" ${canClimate && !busy ? "" : "disabled"} style="${this._btnStyle(canClimate && !busy, "#fde047")}">LIGHT + [W]</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:7px;">
            <button type="button" data-side-action="temp_down" ${canClimate && !busy ? "" : "disabled"} style="${this._btnStyle(canClimate && !busy, "#fb7185")}">TEMP − [Q]</button>
            <button type="button" data-side-action="temp_up" ${canClimate && !busy ? "" : "disabled"} style="${this._btnStyle(canClimate && !busy, "#fb7185")}">TEMP + [E]</button>
            <button type="button" data-side-action="reset" style="${this._btnStyle(true, "#94a3b8")}">RESET [R]</button>
          </div>
          <div style="margin-top:10px;padding:9px 11px;border-radius:6px;background:rgba(15,23,42,0.8);border:1px solid rgba(148,163,184,0.16);font-size:10.5px;color:${state.completed ? "#86efac" : state.failed ? "#fca5a5" : "#fde68a"};">${status}</div>
          <div style="margin-top:8px;font-size:9.5px;color:#64748b;">Two-person crew: one water operator, one climate operator. Keep each bar in its green band.</div>
        `;
        this._drawTomato(state);
      }
    }

    _btnStyle(enabled, color) {
      return `padding:9px 8px;border-radius:5px;border:1px solid ${enabled ? color : "rgba(148,163,184,0.15)"};background:${enabled ? "rgba(15,23,42,0.85)" : "rgba(15,23,42,0.4)"};color:${enabled ? color : "#475569"};font-family:inherit;font-size:10px;font-weight:800;cursor:${enabled ? "pointer" : "not-allowed"};`;
    }

    _bar(label, value, color, ideal) {
      const pct = Math.max(0, Math.min(100, Number(value) || 0));
      const inBand = Math.abs(pct - ideal) <= (ideal === 100 ? 100 : 14);
      return `<div style="padding:7px 8px;border-radius:5px;background:rgba(15,23,42,0.7);border:1px solid ${inBand ? "rgba(74,222,128,0.35)" : "rgba(251,191,36,0.3)"};">
        <div style="display:flex;justify-content:space-between;color:${inBand ? "#bbf7d0" : "#fde68a"};font-weight:800;"><span>${label}</span><span>${pct.toFixed(0)}%</span></div>
        <div style="height:5px;border-radius:3px;background:rgba(148,163,184,0.16);margin-top:4px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${color};"></div></div>
      </div>`;
    }

    _drawCanadarm(state) {
      const canvas = this.bodyEl.querySelector("#iss-canadarm-canvas");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#040a14";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(103,232,249,0.08)";
      for (let x = 0; x < w; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      const baseX = 100, baseY = h - 34;
      const toPoint = (yawDeg, extend) => {
        const angle = (Number(yawDeg) || 0) * Math.PI / 180;
        const length = 82 + Math.max(0, Math.min(1, Number(extend) || 0)) * 165;
        return { x: baseX + Math.cos(angle) * length, y: baseY - Math.sin(angle) * length, angle, length };
      };
      const target = toPoint(state.targetYaw, state.targetExtend);
      const arm = toPoint(state.yaw, state.extend);
      const elbow = {
        x: baseX + Math.cos(arm.angle) * arm.length * 0.55,
        y: baseY - Math.sin(arm.angle) * arm.length * 0.55
      };

      // Capture envelope
      ctx.strokeStyle = state.captured ? "rgba(74,222,128,0.8)" : "rgba(253,224,71,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(target.x, target.y, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(253,224,71,0.08)";
      ctx.fill();

      // Target cargo satellite
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(-0.25);
      ctx.fillStyle = "#8a6a3b";
      ctx.fillRect(-12, -10, 24, 20);
      ctx.fillStyle = "#c9a25f";
      ctx.fillRect(-5, -17, 10, 7);
      ctx.fillStyle = "#4f7fb0";
      ctx.fillRect(-24, -7, 9, 14);
      ctx.fillRect(15, -7, 9, 14);
      ctx.restore();
      ctx.fillStyle = "#fde047";
      ctx.font = "11px monospace";
      ctx.fillText("CARGO", target.x - 18, target.y + 33);

      // Arm
      ctx.strokeStyle = "#d7e3eb";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.lineTo(arm.x, arm.y);
      ctx.stroke();
      ctx.strokeStyle = "#5d7f96";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(elbow.x, elbow.y);
      ctx.lineTo(arm.x, arm.y);
      ctx.stroke();

      // Shoulder joint
      ctx.fillStyle = "#5d7f96";
      ctx.beginPath(); ctx.arc(baseX, baseY, 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath(); ctx.arc(baseX, baseY, 6, 0, Math.PI * 2); ctx.fill();

      // Claw
      const clawAngle = state.captured ? 0.25 : 0.55;
      ctx.strokeStyle = state.captured ? "#4ade80" : "#f8fafc";
      ctx.lineWidth = 4;
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.moveTo(arm.x, arm.y);
        ctx.lineTo(arm.x + Math.cos(arm.angle + side * clawAngle) * 18, arm.y - Math.sin(arm.angle + side * clawAngle) * 18);
        ctx.stroke();
      });

      ctx.fillStyle = "#67e8f9";
      ctx.font = "11px monospace";
      ctx.fillText("CANADARM2", 14, 20);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("MOVE INTO THE YELLOW ENVELOPE", 14, 36);
      if (state.captured) {
        ctx.fillStyle = "#4ade80";
        ctx.font = "bold 15px monospace";
        ctx.fillText("CAPTURE CONFIRMED", 14, 60);
      }
    }

    _drawTomato(state) {
      const canvas = this.bodyEl.querySelector("#iss-tomato-canvas");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#040a14";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(74,222,128,0.08)";
      for (let x = 0; x < w; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      const growth = Math.max(0, Math.min(100, Number(state.growth) || 0));
      const health = Math.max(0, Math.min(100, Number(state.health) || 0));
      const soilY = h - 44;
      ctx.fillStyle = "#5a4631";
      ctx.fillRect(w / 2 - 70, soilY, 140, 26);
      ctx.fillStyle = "#2b3a2c";
      ctx.fillRect(w / 2 - 64, soilY, 128, 8);

      const stemH = 10 + growth * 1.15;
      const sway = Math.sin(Date.now() * 0.001) * Math.min(6, growth * 0.04);
      ctx.strokeStyle = health > 35 ? "#4ade80" : "#a3a34a";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(w / 2, soilY);
      ctx.quadraticCurveTo(w / 2 + sway, soilY - stemH * 0.55, w / 2 + sway * 0.4, soilY - stemH);
      ctx.stroke();

      const leafColor = health > 35 ? "#39b66f" : "#8b8b3d";
      const leafCount = Math.min(6, Math.floor(growth / 16));
      for (let i = 0; i < leafCount; i++) {
        const t = (i + 1) / (leafCount + 1);
        const x = w / 2 + sway * (1 - t) * 0.5;
        const y = soilY - stemH * t;
        [-1, 1].forEach((side) => {
          ctx.fillStyle = leafColor;
          ctx.beginPath();
          ctx.ellipse(x + side * 18, y - 4, 21, 8, side * 0.42, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      if (growth >= 78 && health > 35) {
        const tomatoY = soilY - stemH * 0.72;
        ctx.fillStyle = "#ef6a5b";
        ctx.beginPath(); ctx.arc(w / 2 + 18, tomatoY, 12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w / 2 - 20, tomatoY + 12, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3f8a4f";
        ctx.beginPath(); ctx.arc(w / 2 + 18, tomatoY - 9, 5, 0, Math.PI * 2); ctx.fill();
      }

      ctx.fillStyle = "#86efac";
      ctx.font = "11px monospace";
      ctx.fillText("TOMATOSPHERE · KIBO", 14, 20);
      ctx.fillStyle = "#94a3b8";
      ctx.fillText(health > 35 ? "SEEDLING STABLE" : "SEEDLING STRESSED", 14, 36);
      ctx.fillStyle = "#fde047";
      ctx.font = "bold 14px monospace";
      ctx.fillText(`${growth.toFixed(0)}% GROWN`, w - 150, 20);
    }
  }

  const instance = new IssSideGames();
  window.issSideGames = instance;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => instance.init());
  } else {
    instance.init();
  }
})(window);
