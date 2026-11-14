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

    _seatLabel(seat) {
      return seat === "arm" ? "ARM" : seat === "latch" ? "LATCH" :
        seat === "water" ? "WATER" : seat === "climate" ? "CLIMATE" : "OBSERVER";
    }

    _roleSummary(gameId, participants) {
      const nm = window.netManager;
      const myId = nm ? nm.socketId : null;
      const entries = Object.keys(participants || {}).map((id) => participants[id]);
      const mySeat = myId && participants && participants[myId] ? participants[myId].seat : null;
      const people = entries.length
        ? entries.map((p) => `${escapeHtml(p.name || "Crew")} · ${this._seatLabel(p.seat)}`).join("  |  ")
        : "WAITING FOR CREW";
      return { mySeat, people, solo: entries.length === 1, count: entries.length, entries };
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
      if (!state) {
        this.bodyEl.innerHTML = `
          <div style="padding:26px;text-align:center;color:#94a3b8;font-size:12px;">
            CONNECTING TO ${meta.label}…<br/><br/>${this.lastError ? `<span style="color:#fca5a5;">${escapeHtml(this.lastError)}</span>` : "Waiting for the station link."}
          </div>`;
        return;
      }

      if (gameId === "canadarm") {
        this._renderCanadarm(state, role);
      } else {
        this._renderTomato(state, role);
      }
    }

    _renderCanadarm(state, role) {
      const yaw = Number(state.yaw) || 0;
      const extend = Number(state.extend) || 0;
      const targetYaw = Number(state.targetYaw) || 0;
      const targetExtend = Number(state.targetExtend) || 0;
      const yawError = Math.abs(yaw - targetYaw);
      const extendError = Math.abs(extend - targetExtend);
      const yawOk = yawError <= 4;
      const extendOk = extendError <= 0.05;
      const captured = !!state.captured;
      const hasSeat = role.solo || (role.mySeat && role.mySeat !== "observer");
      const canArm = role.solo || role.mySeat === "arm";
      const canLatch = role.solo || role.mySeat === "latch";

      let prompt = "CARGO SECURED";
      let sub = "<b>RESET</b> FOR A NEW TARGET";
      if (!captured && !hasSeat) {
        prompt = "OBSERVER";
        sub = role.count ? "BOTH SEATS FILLED" : "WAITING FOR CREW";
      } else if (!captured && !yawOk) {
        prompt = `ROTATE ${targetYaw >= yaw ? "RIGHT" : "LEFT"}`;
        sub = `<b>${role.solo ? "SOLO" : "ARM SEAT"}</b> · A / D`;
      } else if (!captured && !extendOk) {
        prompt = targetExtend >= extend ? "EXTEND INTO RING" : "RETRACT INTO RING";
        sub = `<b>${role.solo ? "SOLO" : "ARM SEAT"}</b> · W / S`;
      } else if (!captured) {
        prompt = "LATCH NOW";
        sub = `<b>${role.solo ? "SOLO" : "LATCH SEAT"}</b> · SPACE`;
      }

      const stepAlign = captured || yawOk ? "is-done" : "is-active";
      const stepExtend = captured || (yawOk && extendOk) ? "is-done" : yawOk ? "is-active" : "";
      const stepLatch = captured ? "is-done" : yawOk && extendOk ? "is-active" : "";
      const armSuggestion = !captured && canArm
        ? (!yawOk ? (targetYaw >= yaw ? "arm_right" : "arm_left") : !extendOk ? (targetExtend >= extend ? "arm_out" : "arm_in") : "")
        : "";
      const latchSuggestion = !captured && canLatch && yawOk && extendOk ? "latch" : "";

      const rawStatus = this.lastError || state.message || "";
      const statusText = this.lastError
        ? escapeHtml(this.lastError)
        : captured
          ? "CAPTURE CONFIRMED"
          : /MISS/i.test(rawStatus)
            ? "MISS · TRY AGAIN"
            : "";
      const statusClass = captured ? "is-good" : /MISS|FAIL|LOST/i.test(rawStatus) ? "is-bad" : "";

      this.bodyEl.innerHTML = `
        ${this._crewHeader(role)}
        <div class="sg-goal" style="--sg-accent:#67e8f9;">
          <div class="sg-goal-copy" aria-live="polite">
            <span class="sg-kicker">YOUR NEXT MOVE</span>
            <strong class="sg-prompt">${prompt}</strong>
            <span class="sg-sub">${sub}</span>
          </div>
          <div class="sg-steps">
            ${this._stepCard("1", "ALIGN", "align", stepAlign)}
            ${this._stepCard("2", "EXTEND", "extend", stepExtend)}
            ${this._stepCard("3", "LATCH", "latch", stepLatch)}
          </div>
        </div>
        <canvas id="iss-canadarm-canvas" class="sg-canvas" width="680" height="270"></canvas>
        <div class="sg-readout">
          <span>YAW <b>${yaw.toFixed(1)}°</b> · EXT <b>${(extend * 100).toFixed(0)}%</b></span>
          <span class="is-target">TARGET ${targetYaw.toFixed(1)}° / ${(targetExtend * 100).toFixed(0)}% · CAPTURES <b>${state.captures || 0}</b></span>
        </div>
        <div class="sg-controls sg-controls--arm">
          <div class="sg-control-group${canArm ? " is-yours" : ""}">
            <div class="sg-control-group__label"><span>ARM</span><b>${role.solo ? "SOLO" : canArm ? "YOURS" : "CREW"}</b></div>
            <div class="sg-control-row">
              <button type="button" class="sg-btn${armSuggestion === "arm_left" ? " is-suggested" : ""}" data-side-action="arm_left" ${canArm && !captured ? "" : "disabled"}>ROTATE ◀ [A]</button>
              <button type="button" class="sg-btn${armSuggestion === "arm_right" ? " is-suggested" : ""}" data-side-action="arm_right" ${canArm && !captured ? "" : "disabled"}>ROTATE ▶ [D]</button>
              <button type="button" class="sg-btn${armSuggestion === "arm_out" ? " is-suggested" : ""}" data-side-action="arm_out" ${canArm && !captured ? "" : "disabled"}>EXTEND [W]</button>
              <button type="button" class="sg-btn${armSuggestion === "arm_in" ? " is-suggested" : ""}" data-side-action="arm_in" ${canArm && !captured ? "" : "disabled"}>RETRACT [S]</button>
            </div>
          </div>
          <div class="sg-control-group${canLatch ? " is-yours" : ""}">
            <div class="sg-control-group__label"><span>LATCH</span><b>${role.solo ? "SOLO" : canLatch ? "YOURS" : "CREW"}</b></div>
            <div class="sg-control-row">
              <button type="button" class="sg-btn sg-btn--wide${latchSuggestion === "latch" ? " is-suggested" : ""}" data-side-action="latch" ${canLatch && !captured ? "" : "disabled"}>LATCH [SPACE]</button>
              <button type="button" class="sg-btn sg-btn--wide" data-side-action="reset">RESET [R]</button>
            </div>
          </div>
        </div>
        ${statusText ? `<div class="sg-status ${statusClass}" title="${escapeHtml(rawStatus)}">${statusText}</div>` : ""}
      `;
      this._drawCanadarm(state);
    }

    _renderTomato(state, role) {
      const water = Math.max(0, Math.min(100, Number(state.water) || 0));
      const light = Math.max(0, Math.min(100, Number(state.light) || 0));
      const temp = Math.max(0, Math.min(100, Number(state.temp) || 0));
      const growth = Math.max(0, Math.min(100, Number(state.growth) || 0));
      const health = Math.max(0, Math.min(100, Number(state.health) || 0));
      const waterOk = Math.abs(water - 55) <= 14;
      const lightOk = Math.abs(light - 65) <= 14;
      const tempOk = Math.abs(temp - 45) <= 12;
      const allOk = waterOk && lightOk && tempOk;
      const completed = !!state.completed;
      const failed = !!state.failed;
      const busy = completed || failed;
      const canWater = role.solo || role.mySeat === "water";
      const canClimate = role.solo || role.mySeat === "climate";

      const waterIssue = waterOk ? "" : water < 55 ? "WATER UP" : "WATER DOWN";
      const lightIssue = lightOk ? "" : light < 65 ? "LIGHT UP" : "LIGHT DOWN";
      const tempIssue = tempOk ? "" : temp < 45 ? "TEMP UP" : "TEMP DOWN";
      let myIssue = "";
      let myIssueKey = "";
      if (!role.solo && role.mySeat === "water" && waterIssue) {
        myIssue = waterIssue;
        myIssueKey = "A / D";
      } else if (!role.solo && role.mySeat === "climate") {
        if (lightIssue) {
          myIssue = lightIssue;
          myIssueKey = "W / S";
        } else if (tempIssue) {
          myIssue = tempIssue;
          myIssueKey = "Q / E";
        }
      }
      const teamIssue = waterIssue || lightIssue || tempIssue;
      const activeIssue = myIssue || teamIssue;
      const activeKey = myIssue ? myIssueKey : waterIssue ? "A / D" : lightIssue ? "W / S" : "Q / E";
      const activeSeat = myIssue ? this._seatLabel(role.mySeat) : waterIssue ? "WATER" : "CLIMATE";

      let prompt = "HOLD STEADY";
      let sub = `<b>GROWING</b> · ${growth.toFixed(0)}%`;
      if (completed) {
        prompt = "HARVEST READY";
        sub = "<b>RESET</b> FOR A NEW BATCH";
      } else if (failed) {
        prompt = "BATCH LOST";
        sub = "<b>RESET</b> TO RETRY";
      } else if (activeIssue) {
        prompt = activeIssue;
        sub = `<b>${role.solo ? "SOLO" : `${activeSeat} SEAT`}</b> · ${activeKey}`;
      }

      const waterDone = waterOk || completed;
      const climateDone = (lightOk && tempOk) || completed;
      const stepWater = waterDone ? "is-done" : !busy ? "is-active" : "";
      const stepClimate = climateDone ? "is-done" : waterDone && !busy ? "is-active" : "";
      const stepGrow = completed ? "is-done" : waterDone && climateDone && !failed ? "is-active" : "";
      const suggestWater = !busy && canWater ? (water < 41 ? "water_up" : water > 69 ? "water_down" : "") : "";
      const suggestLight = !busy && canClimate ? (light < 51 ? "light_up" : light > 79 ? "light_down" : "") : "";
      const suggestTemp = !busy && canClimate ? (temp < 33 ? "temp_up" : temp > 57 ? "temp_down" : "") : "";

      const rawStatus = this.lastError || state.message || "";
      const statusText = this.lastError
        ? escapeHtml(this.lastError)
        : completed
          ? "HARVEST COMPLETE"
          : failed
            ? "BATCH LOST"
            : "";

      this.bodyEl.innerHTML = `
        ${this._crewHeader(role)}
        <div class="sg-goal" style="--sg-accent:#4ade80;">
          <div class="sg-goal-copy" aria-live="polite">
            <span class="sg-kicker">YOUR NEXT MOVE</span>
            <strong class="sg-prompt">${prompt}</strong>
            <span class="sg-sub">${sub}</span>
          </div>
          <div class="sg-steps">
            ${this._stepCard("1", "WATER", "water", stepWater)}
            ${this._stepCard("2", "CLIMATE", "climate", stepClimate)}
            ${this._stepCard("3", "GROW", "grow", stepGrow)}
          </div>
        </div>
        <canvas id="iss-tomato-canvas" class="sg-canvas sg-canvas--tomato" width="680" height="220"></canvas>
        <div class="sg-gauges">
          ${this._gauge("WATER", water, 55, 14, "#38bdf8", "A / D")}
          ${this._gauge("LIGHT", light, 65, 14, "#fde047", "W / S")}
          ${this._gauge("TEMP", temp, 45, 12, "#fb7185", "Q / E")}
        </div>
        <div class="sg-meters">
          ${this._meter("GROWTH", growth, "#4ade80")}
          ${this._meter("HEALTH", health, "#a7f3d0")}
        </div>
        <div class="sg-controls">
          <div class="sg-control-group${canWater ? " is-yours" : ""}">
            <div class="sg-control-group__label"><span>WATER</span><b>${role.solo ? "SOLO" : canWater ? "YOURS" : "CREW"}</b></div>
            <div class="sg-control-row">
              <button type="button" class="sg-btn${suggestWater === "water_down" ? " is-suggested" : ""}" data-side-action="water_down" ${canWater && !busy ? "" : "disabled"}>WATER − [A]</button>
              <button type="button" class="sg-btn${suggestWater === "water_up" ? " is-suggested" : ""}" data-side-action="water_up" ${canWater && !busy ? "" : "disabled"}>WATER + [D]</button>
            </div>
          </div>
          <div class="sg-control-group${canClimate ? " is-yours" : ""}">
            <div class="sg-control-group__label"><span>CLIMATE</span><b>${role.solo ? "SOLO" : canClimate ? "YOURS" : "CREW"}</b></div>
            <div class="sg-control-row">
              <button type="button" class="sg-btn${suggestLight === "light_down" ? " is-suggested" : ""}" data-side-action="light_down" ${canClimate && !busy ? "" : "disabled"}>LIGHT − [S]</button>
              <button type="button" class="sg-btn${suggestLight === "light_up" ? " is-suggested" : ""}" data-side-action="light_up" ${canClimate && !busy ? "" : "disabled"}>LIGHT + [W]</button>
              <button type="button" class="sg-btn${suggestTemp === "temp_down" ? " is-suggested" : ""}" data-side-action="temp_down" ${canClimate && !busy ? "" : "disabled"}>TEMP − [Q]</button>
              <button type="button" class="sg-btn${suggestTemp === "temp_up" ? " is-suggested" : ""}" data-side-action="temp_up" ${canClimate && !busy ? "" : "disabled"}>TEMP + [E]</button>
              <button type="button" class="sg-btn sg-btn--wide" data-side-action="reset">RESET [R]</button>
            </div>
          </div>
        </div>
        ${statusText ? `<div class="sg-status ${completed ? "is-good" : "is-bad"}" title="${escapeHtml(rawStatus)}">${statusText}</div>` : ""}
      `;
      this._drawTomato(state);
    }

    _crewHeader(role) {
      const seated = role.mySeat && role.mySeat !== "observer";
      const myLabel = role.solo ? "SOLO · BOTH CONTROLS" : seated ? `YOU · ${this._seatLabel(role.mySeat)}` : "OBSERVER";
      const chips = (role.entries || []).map((p) => `
        <span class="sg-crew-chip"><b>${this._seatLabel(p.seat)}</b>${escapeHtml(p.name || "CREW")}</span>
      `).join("");
      return `
        <div class="sg-head">
          <span class="sg-you${role.solo || seated ? "" : " is-dim"}">${myLabel}</span>
          <span class="sg-team">${chips || "WAITING FOR CREW"}</span>
        </div>
      `;
    }

    _stepCard(num, label, icon, stateClass) {
      return `
        <span class="sg-step ${stateClass}">
          <span class="sg-step__num">${num}</span>
          ${this._stepIcon(icon)}
          <span class="sg-step__label">${label}</span>
        </span>
      `;
    }

    _stepIcon(kind) {
      if (kind === "align") {
        return `<svg class="sg-step__icon" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 10a6 6 0 1 1 2.2 4.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M3 6v5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      }
      if (kind === "extend") {
        return `<svg class="sg-step__icon" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2 9h12M10 5l4 4-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      }
      if (kind === "latch") {
        return `<svg class="sg-step__icon" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M5 3v6a2 2 0 0 0 4 0V3M5 8h4M11 5l3 4-3 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      }
      if (kind === "water") {
        return `<svg class="sg-step__icon" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2c3 4 5 6.2 5 9a5 5 0 0 1-10 0c0-2.8 2-5 5-9Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
      }
      if (kind === "climate") {
        return `<svg class="sg-step__icon" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="3" stroke="currentColor" stroke-width="1.4"/><path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M14.3 3.7l-1.4 1.4M5.1 12.9l-1.4 1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
      }
      return `<svg class="sg-step__icon" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 16V8M9 11c-2.8 0-4.5-1.8-4.5-4.2C7.3 6.8 9 8.2 9 11ZM9 10c2.8 0 4.5-1.8 4.5-4.2C10.7 5.8 9 7.2 9 10Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    }

    _gauge(label, value, center, half, color, keys) {
      const pct = Math.max(0, Math.min(100, Number(value) || 0));
      const inBand = Math.abs(pct - center) <= half;
      const start = Math.max(0, center - half);
      const end = Math.min(100, center + half);
      return `
        <div class="sg-gauge ${inBand ? "is-in" : "is-out"}" style="--band-start:${start}%;--band-end:${end}%;--value:${pct}%;--gauge-color:${color};">
          <div class="sg-gauge__head"><span>${label}</span><b>${pct.toFixed(0)}%</b></div>
          <span class="sg-gauge__keys">${keys}</span>
          <div class="sg-gauge__track">
            <span class="sg-gauge__band"></span>
            <span class="sg-gauge__fill"></span>
            <span class="sg-gauge__needle"></span>
          </div>
          <span class="sg-gauge__state">${inBand ? "IN BAND" : "ADJUST"}</span>
        </div>
      `;
    }

    _meter(label, value, color) {
      const pct = Math.max(0, Math.min(100, Number(value) || 0));
      return `
        <div class="sg-meter">
          <div class="sg-meter__head"><span>${label}</span><b>${pct.toFixed(0)}%</b></div>
          <div class="sg-meter__track"><div class="sg-meter__fill" style="--value:${pct}%;--meter-color:${color};"></div></div>
        </div>
      `;
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

      // Dashed guide shows the arm tip the way into the capture ring.
      if (!state.captured) {
        const dx = target.x - arm.x;
        const dy = target.y - arm.y;
        const gap = Math.hypot(dx, dy);
        if (gap > 34) {
          ctx.save();
          ctx.strokeStyle = "rgba(253,224,71,0.38)";
          ctx.fillStyle = "rgba(253,224,71,0.75)";
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(arm.x, arm.y);
          ctx.lineTo(target.x - (dx / gap) * 22, target.y - (dy / gap) * 22);
          ctx.stroke();
          ctx.setLineDash([]);
          const arrowAngle = Math.atan2(dy, dx);
          const tipX = target.x - (dx / gap) * 22;
          const tipY = target.y - (dy / gap) * 22;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - Math.cos(arrowAngle - 0.5) * 7, tipY - Math.sin(arrowAngle - 0.5) * 7);
          ctx.lineTo(tipX - Math.cos(arrowAngle + 0.5) * 7, tipY - Math.sin(arrowAngle + 0.5) * 7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

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
      ctx.fillText("ENTER YELLOW RING", 14, 36);
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
