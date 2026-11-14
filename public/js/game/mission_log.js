/**
 * ============================================================================
 * LUNASPIS FLIGHT RECORDS — local mission log & leaderboard
 * ============================================================================
 * The challenge brief asks for leaderboards/rankings and shareable mission
 * reports. The project may run without auth, so this module keeps a durable
 * local leaderboard in localStorage and records every completed mission.
 */

(function (window) {
  "use strict";

  const STORAGE_KEY = "lunaspis_mission_log_v1";
  const MAX_RECORDS = 30;
  let els = {};
  let records = [];
  let initialized = false;

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function loadRecords() {
    const raw = safeGet(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((record) => record && typeof record === "object");
    } catch (e) {
      return [];
    }
  }

  function saveRecords() {
    records = records
      .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0) || (b.completedAt || 0) - (a.completedAt || 0))
      .slice(0, MAX_RECORDS);
    safeSet(STORAGE_KEY, JSON.stringify(records));
  }

  function formatDate(timestamp) {
    const date = timestamp ? new Date(timestamp) : new Date();
    try {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
        date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return date.toISOString().slice(0, 16).replace("T", " ");
    }
  }

  function recordVictory(data) {
    if (!data || !data.debrief) return;
    const debrief = data.debrief;
    const design = window.gameplay && typeof window.gameplay.evaluateMissionDesign === "function"
      ? window.gameplay.evaluateMissionDesign()
      : null;
    if (!design) return;

    const completedAt = Number(debrief.completedAt || Date.now());
    const roomId = (window.netManager && window.netManager.roomId) || null;
    const isDuplicate = records.some((record) =>
      record.completedAt === completedAt && record.roomId === roomId
    );
    if (isDuplicate) return;

    const crew = Array.isArray(debrief.crew) ? debrief.crew : [];
    const record = {
      id: `run_${completedAt}`,
      roomId,
      solo: !!(window.netManager && window.netManager.isSoloRoom),
      completedAt,
      recordedAt: new Date().toISOString(),
      scenarioId: debrief.scenarioId || design.scenarioId || "lunar_south_pole",
      scenarioCode: debrief.scenarioCode || design.scenario.code || "LUNASPIS",
      scenarioName: debrief.scenarioName || design.scenario.name || "Mission",
      difficultyId: debrief.difficultyId || design.difficultyId || "engineer",
      score: Number(design.overallScore) || 0,
      scienceScore: Number(design.scienceScore) || 0,
      engineeringScore: Number(design.engineeringScore) || 0,
      cmlLevel: Number(design.cmlLevel) || 1,
      budgetM: Number(design.totalCostM) || 0,
      budgetCapM: Number(design.budgetCapM) || 0,
      wetMassKg: Number(design.wetMassKg) || 0,
      lvCapacityKg: Number(design.lvCapacityKg) || 0,
      dataGeneratedGbPerDay: Number(design.dataGeneratedGbPerDay) || 0,
      downlinkCapGbPerDay: Number(design.downlinkCapGbPerDay) || 0,
      achievedDeltaV: Number(design.achievedDeltaV) || 0,
      requiredDeltaV: Number(design.requiredDeltaV) || 0,
      completedObjectives: Array.isArray(debrief.completedObjectives) ? debrief.completedObjectives.length : 0,
      totalObjectives: Number(debrief.totalObjectives) || 7,
      durationMs: Number(debrief.durationMs) || 0,
      crew: crew.map((member) => ({
        name: member.name || "Astronaut",
        role: member.role || "crew"
      }))
    };

    records.unshift(record);
    saveRecords();
    render();
    if (els.modal && els.modal.style.display === "flex") {
      if (window.spaceAudio) window.spaceAudio.playRadioBeep(true);
    }
  }

  function recordQualifier(record) {
    if (record.score >= 75) return { label: "FLIGHT QUALIFIED", color: "#86efac" };
    if (record.score >= 60) return { label: "MISSION READY", color: "#fde68a" };
    return { label: "NEEDS WORK", color: "#fca5a5" };
  }

  function buildShareText(record) {
    const mode = record.solo ? "SOLO" : "CREW";
    return [
      `LUNASPIS // MISSION REPORT`,
      `${record.scenarioCode} · ${record.scenarioName}`,
      `Difficulty: ${String(record.difficultyId || "engineer").toUpperCase()} · ${mode}`,
      `Score: ${record.score}/100 (Science ${record.scienceScore} · Engineering ${record.engineeringScore} · CML ${record.cmlLevel})`,
      `Objectives: ${record.completedObjectives}/${record.totalObjectives}`,
      `Budget: $${record.budgetM}M / $${record.budgetCapM}M`,
      `Mass: ${record.wetMassKg} / ${record.lvCapacityKg} kg`,
      `Crew: ${record.crew && record.crew.length ? record.crew.map((c) => c.name).join(", ") : "Solo"}`,
      `Recorded: ${formatDate(record.completedAt)}`
    ].join("\n");
  }

  function render() {
    if (!els.content) return;
    records = loadRecords();
    saveRecords();
    const best = records.reduce((top, record) => (!top || record.score > top.score ? record : top), null);

    if (!records.length) {
      els.content.innerHTML = `
        <div class="mission-log-empty">
          <div class="mission-log-empty-badge">NO FLIGHT RECORDS YET</div>
          <p>Complete a solo or crew mission to populate your local leaderboard. Every run stores the mission profile, score, constraints and crew.</p>
        </div>
      `;
      return;
    }

    els.content.innerHTML = `
      <div class="mission-log-summary">
        <div>
          <div class="mission-log-summary-label">LOCAL FLIGHT RECORDS</div>
          <div class="mission-log-summary-value">${records.length} MISSION${records.length === 1 ? "" : "S"} LOGGED</div>
        </div>
        <div>
          <div class="mission-log-summary-label">PERSONAL BEST</div>
          <div class="mission-log-summary-value mission-log-best">${best ? `${best.score}/100 · ${escapeHtml(best.scenarioCode)}` : "—"}</div>
        </div>
        <div>
          <div class="mission-log-summary-label">STORAGE</div>
          <div class="mission-log-summary-value">THIS DEVICE</div>
        </div>
      </div>
      <div class="mission-log-table">
        <div class="mission-log-row mission-log-head">
          <span>#</span><span>MISSION</span><span>DIFF</span><span>SCORE</span><span>SCI / ENG</span><span>MODE</span><span>DATE</span><span></span>
        </div>
        ${records.map((record, index) => {
          const qualifier = recordQualifier(record);
          const isBest = index === 0;
          return `
            <div class="mission-log-row${isBest ? " is-best" : ""}">
              <span class="mission-log-rank">${index + 1}${isBest ? " ★" : ""}</span>
              <span>
                <b>${escapeHtml(record.scenarioCode)}</b>
                <em>${record.completedObjectives}/${record.totalObjectives} OBJ · CML ${record.cmlLevel}</em>
              </span>
              <span class="mission-log-diff">${escapeHtml(String(record.difficultyId || "engineer").toUpperCase())}</span>
              <span class="mission-log-score" style="color:${qualifier.color};">${record.score}</span>
              <span class="mission-log-sci">${record.scienceScore} / ${record.engineeringScore}</span>
              <span>${record.solo ? "SOLO" : `${(record.crew || []).length || 1} CREW`}</span>
              <span class="mission-log-date">${formatDate(record.completedAt)}</span>
              <span><button type="button" class="mission-log-copy" data-copy-record="${escapeHtml(record.id)}">COPY</button></span>
            </div>
          `;
        }).join("")}
      </div>
      <div class="mission-log-note">Rankings are saved locally in this browser. When authentication is enabled, the same records can be synced to <code>/api/leaderboard</code>.</div>
    `;
  }

  function open() {
    if (!els.modal) return;
    render();
    els.modal.style.display = "flex";
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("mission-log-open");
    if (window.spaceAudio) window.spaceAudio.playClick();
  }

  function close() {
    if (!els.modal) return;
    els.modal.style.display = "none";
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("mission-log-open");
  }

  function exportLog() {
    const payload = {
      generator: "LUNASPIS // Flight Records",
      exportedAt: new Date().toISOString(),
      records
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lunaspis-flight-records.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function clearLog() {
    if (!records.length) return;
    if (!window.confirm("Clear all locally saved Lunaspis flight records? This cannot be undone.")) return;
    records = [];
    safeSet(STORAGE_KEY, "[]");
    render();
  }

  function copyRecord(recordId) {
    const record = records.find((entry) => entry.id === recordId);
    if (!record) return;
    const text = buildShareText(record);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (window.gameplay && typeof window.gameplay.showToast === "function") {
          window.gameplay.showToast("Mission report copied to clipboard.");
        }
      }).catch(() => {});
    }
  }

  function bind() {
    if (els.close) els.close.addEventListener("click", close);
    if (els.modal) {
      els.modal.addEventListener("click", (event) => {
        if (event.target === els.modal) close();
      });
    }
    if (els.content) {
      els.content.addEventListener("click", (event) => {
        const copyButton = event.target.closest ? event.target.closest("[data-copy-record]") : null;
        if (copyButton) {
          copyRecord(copyButton.getAttribute("data-copy-record"));
          copyButton.textContent = "COPIED";
          setTimeout(() => { copyButton.textContent = "COPY"; }, 1600);
        }
      });
    }
    if (els.exportButton) els.exportButton.addEventListener("click", exportLog);
    if (els.clearButton) els.clearButton.addEventListener("click", clearLog);

    [document.getElementById("btn-open-mission-log"), document.getElementById("btn-victory-log")].forEach((button) => {
      if (!button) return;
      button.addEventListener("click", open);
    });

    window.addEventListener("keydown", (event) => {
      if (els.modal && els.modal.style.display === "flex" && (event.code === "Escape" || event.key === "Escape")) {
        event.preventDefault();
        close();
      }
    });

    if (window.netManager && typeof window.netManager.on === "function") {
      window.netManager.on("crew_victory", recordVictory);
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    els = {
      modal: document.getElementById("modal-mission-log"),
      content: document.getElementById("mission-log-content"),
      close: document.getElementById("btn-close-mission-log"),
      exportButton: document.getElementById("btn-mission-log-export"),
      clearButton: document.getElementById("btn-mission-log-clear")
    };
    records = loadRecords();
    if (!els.modal) return;
    bind();
    render();
  }

  window.missionLog = {
    init: init,
    open: open,
    close: close,
    getRecords: () => loadRecords().slice(),
    recordVictory: recordVictory
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    setTimeout(init, 0);
  }
})(window);
