/**
 * ============================================================================
 * LUNASPIS MISSION ACADEMY
 * ============================================================================
 * Beginner onboarding for the NASA Space Apps Mission Design Game.
 * - First-run "how to play" wizard (solo + crew)
 * - Plain-language trade-off cheat sheet
 * - Cadet-mission launcher (private solo, cadet difficulty)
 * - Contextual "CADET COACH" tips injected into every design console
 * - Optional guidance preference persisted in localStorage
 */

(function (window) {
  "use strict";

  const SEEN_KEY = "lunaspis_academy_seen_v1";
  const TIPS_KEY = "lunaspis_cadet_tips_v1";

  let currentStep = 0;
  let lastFocused = null;
  let els = {};
  let bound = false;

  const STEPS = [
    {
      nav: "MISSION",
      kicker: "FIRST FLIGHT BRIEF · 1 OF 5",
      title: "DESIGN A MISSION THAT FITS REALITY",
      body: `
        <p class="academy-lede">
          You are the mission architect. Choose what to learn, how to fly, and what to leave out.
          Every decision spends the same five resources — and improving one usually costs another.
        </p>
        <div class="academy-resource-grid">
          <div class="academy-resource" style="--rc:#7fb8a6;">
            <div class="academy-resource-code">BUDGET</div>
            <p>Money for the spacecraft, instruments, rocket and ground network. Cheaper parts leave reserve for fixes.</p>
          </div>
          <div class="academy-resource" style="--rc:#67e8f9;">
            <div class="academy-resource-code">MASS</div>
            <p>Everything you launch must fit under the rocket's lift capacity for your chosen orbit.</p>
          </div>
          <div class="academy-resource" style="--rc:#d0a15c;">
            <div class="academy-resource-code">POWER</div>
            <p>Solar arrays must run the spacecraft and recharge the battery for eclipse. More instruments need more power.</p>
          </div>
          <div class="academy-resource" style="--rc:#9a8fc4;">
            <div class="academy-resource-code">DATA &amp; COMMS</div>
            <p>Instruments generate data. The antenna and ground stations must downlink it with a safe link margin.</p>
          </div>
          <div class="academy-resource" style="--rc:#38bdf8;">
            <div class="academy-resource-code">DELTA-V</div>
            <p>Propulsion must cover orbit insertion, station-keeping and safe end-of-mission disposal.</p>
          </div>
          <div class="academy-resource" style="--rc:#4ade80;">
            <div class="academy-resource-code">SCIENCE</div>
            <p>Your instruments must cover the science types the mission was chosen to deliver.</p>
          </div>
        </div>
        <div class="academy-callout">
          <strong>No single perfect design.</strong> A bigger instrument buys more science, but also adds mass,
          power use, data volume and cost. A cheaper rocket saves money but may not lift the spacecraft.
        </div>
      `
    },
    {
      nav: "DESIGN",
      kicker: "FIRST FLIGHT BRIEF · 2 OF 5",
      title: "BUILD THE MISSION IN SIX DECISIONS",
      body: `
        <ol class="academy-flow">
          <li><b>01 · SCENARIO</b><span>The science goal sets the budget, lifetime, required instruments, delta-v and radiation environment.</span></li>
          <li><b>02 · ORBIT &amp; LAUNCH</b><span>Pick the orbit first, then a rocket that can lift your wet mass to that orbit.</span></li>
          <li><b>03 · BUS &amp; POWER</b><span>The bus is the chassis. Solar arrays and batteries must cover the load through eclipse.</span></li>
          <li><b>04 · INSTRUMENTS</b><span>Science value comes from matching instruments to the required science types — not just adding the most expensive payload.</span></li>
          <li><b>05 · THERMAL &amp; COMMS</b><span>Heat rejection and shielding keep the spacecraft alive. The antenna and ground network move the data home.</span></li>
          <li><b>06 · PROPULSION &amp; DISPOSAL</b><span>Delta-v must close, and the end-of-mission plan must meet orbital-debris rules.</span></li>
        </ol>
        <div class="academy-callout">
          <strong>Fast start:</strong> in any design console, click <em>APPLY RECOMMENDED BASELINE</em>.
          It gives you a safe starting point for the selected scenario. Then change one part at a time and
          watch the live resource strip.
        </div>
        <div class="academy-callout academy-callout-amber">
          <strong>Never edit blind.</strong> The strip at the top of every console is live. A red bar means a real
          constraint is broken; the mission simulation will penalize it.
        </div>
      `
    },
    {
      nav: "TRADE-OFFS",
      kicker: "FIRST FLIGHT BRIEF · 3 OF 5",
      title: "EVERY UPGRADE HAS A PRICE",
      body: `
        <div class="academy-tradeoff-table">
          <div class="academy-tradeoff-row academy-tradeoff-head"><span>IF YOU INCREASE…</span><span>EXPECT TO PAY IN…</span></div>
          <div class="academy-tradeoff-row"><span>Instrument science capability</span><span>Mass · power · data rate · cost</span></div>
          <div class="academy-tradeoff-row"><span>Orbit altitude or delta-v</span><span>Launch energy · lighter payload · longer comms distance</span></div>
          <div class="academy-tradeoff-row"><span>Power generation</span><span>Array mass · cost · stowed volume</span></div>
          <div class="academy-tradeoff-row"><span>Mission lifetime</span><span>Radiation shielding · propellant · budget</span></div>
          <div class="academy-tradeoff-row"><span>Data downlink</span><span>Antenna mass · power · ground-network cost</span></div>
          <div class="academy-tradeoff-row"><span>Launch vehicle lift capacity</span><span>Cost · schedule · infrastructure</span></div>
        </div>
        <div class="academy-callout">
          <strong>Green bars are necessary, not sufficient.</strong> The final score also rewards required science
          coverage, mass margin, data downlink, lifetime and a compliant end-of-mission disposal plan.
        </div>
        <div class="academy-callout academy-callout-cyan">
          <strong>Iterate like an engineer:</strong> save Option A, make one change, then compare the live trade
          delta (cost, mass, power, ΔV, science, grade) before committing.
        </div>
      `
    },
    {
      nav: "FLY",
      kicker: "FIRST FLIGHT BRIEF · 4 OF 5",
      title: "FROM THE PAD TO THE STATION",
      body: `
        <div class="academy-phase-grid">
          <div class="academy-phase"><b>01 · BOARD</b><span>Follow the glowing marker to the orbiter. Press <kbd>E</kbd> at the hatch.</span></div>
          <div class="academy-phase"><b>02 · LAUNCH</b><span>The host releases launch with <kbd>L</kbd>. Flight crew is strapped in automatically.</span></div>
          <div class="academy-phase"><b>03 · DOCK</b><span>Align with PMA-2 using RCS translation and rotation, then latch with <kbd>SPACE</kbd>.</span></div>
          <div class="academy-phase"><b>04 · STATION</b><span>Walk to the seven consoles and press <kbd>E</kbd>. Commit each subsystem design.</span></div>
          <div class="academy-phase"><b>05 · EVALUATE</b><span>Run the full mission simulation at <b>[LDR]</b>, then read the debrief and iterate.</span></div>
        </div>
        <div class="academy-controls">
          <span><kbd>WASD</kbd> MOVE</span>
          <span><kbd>DRAG</kbd> LOOK</span>
          <span><kbd>E</kbd> CONSOLE</span>
          <span><kbd>R</kbd> S-BAND</span>
          <span><kbd>M</kbd> MIC</span>
          <span><kbd>C</kbd> VIEW</span>
          <span><kbd>U</kbd> ORBIT VIZ</span>
          <span><kbd>P</kbd> DIAGNOSTICS</span>
          <span><kbd>F1</kbd> ACADEMY</span>
        </div>
        <div class="academy-callout">
          <strong>Stuck?</strong> Press <kbd>F1</kbd> or click <em>GUIDE</em> in the HUD at any time.
          The mission checklist at the top-left always shows the next available objective.
        </div>
      `
    },
    {
      nav: "CREW & SCORE",
      kicker: "FIRST FLIGHT BRIEF · 5 OF 5",
      title: "FLY SOLO OR BRING A CREW",
      body: `
        <div class="academy-two-col">
          <div class="academy-panel">
            <h3>SOLO</h3>
            <p>You can run every console yourself. Use this guide, keep the resource strip green, and finish with the full simulation.</p>
          </div>
          <div class="academy-panel">
            <h3>CREW</h3>
            <p>Choose <em>HOST CREW</em>, share the expedition code, and assign roles. Ground Control runs LCC launch authority and ground support while Flight Crew works the station consoles.</p>
          </div>
        </div>
        <div class="academy-role-map">
          <div><b>[HUB]</b> mission architecture &amp; scenario</div>
          <div><b>[CMD]</b> orbit, launch vehicle &amp; navigation</div>
          <div><b>[PWR]</b> spacecraft bus, solar power &amp; batteries</div>
          <div><b>[SCI]</b> instruments &amp; science return</div>
          <div><b>[ECLSS]</b> thermal control &amp; radiation shielding</div>
          <div><b>[HULL]</b> communications, ground network &amp; propulsion</div>
          <div><b>[LDR]</b> full simulation &amp; evaluation</div>
        </div>
        <div class="academy-callout">
          <strong>The debrief scores Science (45%) + Engineering (55%).</strong>
          A mission can be fully green and still score poorly if it misses required science or the end-of-mission disposal rules.
          Aim for <strong>75+</strong> for a Flight-Qualified result.
        </div>
        <div class="academy-callout academy-callout-cyan">
          <strong>Try, compare, improve.</strong> Export your MDL point design as JSON, save Option A,
          and run another architecture. Different combinations can reach the same objective.
        </div>
      `
    }
  ];

  const CONSOLE_TIPS = {
    task_antenna: "Mission architecture sets the rules for every later decision. Pick the scenario and difficulty first, then apply the recommended baseline so the budget, lifetime and science requirements are visible.",
    task_nav: "Orbit and launch vehicle are a matched pair. A higher-energy orbit needs more delta-v and reduces the rocket's lift capacity. Check wet mass against the exact orbit before committing.",
    task_wires: "Power is a day/night problem: solar arrays must run the spacecraft and recharge the battery for eclipse. Bigger instruments and ion propulsion increase the load; bigger batteries add mass and cost.",
    task_science: "Instruments buy science but spend mass, power and data. Match the required science types first, then check that the ground network can downlink everything you generate.",
    task_lss: "Thermal control and radiation shielding keep the spacecraft alive. Deep-space, lunar and long-lifetime missions need stronger heat rejection and more shielding — both add mass and cost.",
    task_hull: "The communications link must close at your orbit's distance. High-gain antennas and DSN contacts cost mass and money; propulsion and disposal must also fit inside the delta-v budget.",
    task_landing: "Run the full simulation. Green bars are necessary, but the score also checks required science, mass margin, data downlink, lifetime and end-of-mission disposal. Read the debrief, then iterate."
  };

  const PREFLIGHT_TIPS = {
    arch: "Start here. The scenario sets the budget, lifetime, required science, delta-v and radiation environment. Difficulty changes the budget multiplier and mass margin.",
    orbit: "Choose the orbit, then the launcher. The launcher must lift your spacecraft's wet mass to that exact orbit. A cheaper rocket is only a bargain if it can carry the payload.",
    bus: "The bus and power system are the chassis. More instruments, a stronger computer or ion propulsion need more power, battery capacity and mass.",
    viz: "This preview shows risk and expected science. Use it to spot a weak subsystem before you commit the design.",
    generic: "Use the live resource strip at the top. Apply the recommended baseline for a safe starting point, then change one decision at a time and compare the trade delta."
  };

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

  function isGuidanceEnabled() {
    return safeGet(TIPS_KEY) !== "0";
  }

  function setGuidanceEnabled(enabled) {
    safeSet(TIPS_KEY, enabled ? "1" : "0");
    if (els.tipsToggle) els.tipsToggle.checked = !!enabled;
    if (typeof window.gameplay !== "undefined" && window.gameplay && typeof window.gameplay._activeRenderCallback === "function") {
      try { window.gameplay._activeRenderCallback(); } catch (e) {}
    }
  }

  function isOpen() {
    return !!els.modal && els.modal.style.display === "flex";
  }

  function renderProgress() {
    if (!els.progress) return;
    els.progress.innerHTML = STEPS.map((step, index) => {
      const state = index === currentStep ? "active" : (index < currentStep ? "done" : "");
      return `
        <button type="button" class="academy-dot ${state}" data-academy-step="${index}" aria-label="Open step ${index + 1}: ${escapeHtml(step.nav)}">
          <span class="academy-dot-index">${index + 1}</span>
          <span class="academy-dot-label">${escapeHtml(step.nav)}</span>
        </button>
        ${index < STEPS.length - 1 ? `<span class="academy-dot-line ${index < currentStep ? "done" : ""}"></span>` : ""}
      `;
    }).join("");
  }

  function renderStep() {
    if (!els.step) return;
    const step = STEPS[currentStep] || STEPS[0];
    els.step.innerHTML = `
      <div class="academy-step-kicker">${escapeHtml(step.kicker)}</div>
      <h2 class="academy-step-title">${escapeHtml(step.title)}</h2>
      <div class="academy-step-body">${step.body}</div>
    `;
    if (els.back) els.back.style.display = currentStep === 0 ? "none" : "inline-block";
    if (els.next) {
      els.next.style.display = currentStep === STEPS.length - 1 ? "none" : "inline-block";
      els.next.textContent = "NEXT →";
    }
    if (els.start) {
      const inRoom = !!(window.netManager && window.netManager.roomId);
      els.start.style.display = inRoom ? "none" : "inline-block";
    }
    renderProgress();
  }

  function open(stepIndex) {
    if (!els.modal) return;
    if (typeof stepIndex === "number") {
      currentStep = Math.max(0, Math.min(STEPS.length - 1, stepIndex));
    }
    lastFocused = document.activeElement;
    els.modal.style.display = "flex";
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("academy-open");
    renderStep();
    if (els.close) {
      try { els.close.focus({ preventScroll: true }); } catch (e) {}
    }
    if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
      window.spaceAudio.playClick();
    }
  }

  function close() {
    if (!els.modal) return;
    els.modal.style.display = "none";
    els.modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("academy-open");
    safeSet(SEEN_KEY, "1");
    if (lastFocused && typeof lastFocused.focus === "function") {
      try { lastFocused.focus({ preventScroll: true }); } catch (e) {}
    }
    lastFocused = null;
  }

  function next() {
    if (currentStep < STEPS.length - 1) {
      currentStep += 1;
      renderStep();
      if (window.spaceAudio) window.spaceAudio.playClick();
    }
  }

  function back() {
    if (currentStep > 0) {
      currentStep -= 1;
      renderStep();
      if (window.spaceAudio) window.spaceAudio.playClick();
    }
  }

  function startCadetMission() {
    if (!window.netManager || typeof window.netManager.startSolo !== "function") return;
    if (window.netManager.roomId) {
      close();
      return;
    }
    const inputName = document.getElementById("input-player-name");
    const name = (inputName && inputName.value.trim())
      || (window.netManager.localPlayer && window.netManager.localPlayer.name)
      || "Cadet";
    const color = (window.netManager.localPlayer && window.netManager.localPlayer.color) || "#67e8f9";
    setGuidanceEnabled(!!(els.tipsToggle && els.tipsToggle.checked));
    safeSet(SEEN_KEY, "1");
    if (window.spaceAudio) window.spaceAudio.playClick();
    if (els.start) {
      els.start.disabled = true;
      els.start.textContent = "LAUNCHING CADET MISSION…";
    }
    window.netManager.startSolo(name, color, null, {
      opsMode: "iss_expedition",
      scenarioId: "lunar_south_pole",
      difficultyId: "cadet"
    });
    setTimeout(() => {
      if (els.start) {
        els.start.disabled = false;
        els.start.textContent = "START CADET MISSION →";
      }
    }, 2500);
  }

  function getConsoleTip(task, tab) {
    if (!task || !isGuidanceEnabled()) return "";
    if (task.isPreFlightMdl) {
      return PREFLIGHT_TIPS[tab] || PREFLIGHT_TIPS.generic;
    }
    return CONSOLE_TIPS[task.id] || "";
  }

  function getConsoleTipHtml(task, tab) {
    const tip = getConsoleTip(task, tab);
    if (!tip) return "";
    const scenarioId = window.gameplay && window.gameplay.missionDesign
      ? window.gameplay.missionDesign.scenarioId
      : "lunar_south_pole";
    return `
      <div class="cadet-coach" role="note" aria-label="Cadet coach tip">
        <div class="cadet-coach-head">
          <span class="cadet-coach-badge">CADET COACH</span>
          <span class="cadet-coach-actions">
            <button type="button" class="cadet-coach-btn" data-cadet-baseline data-scenario-id="${escapeHtml(scenarioId)}">USE RECOMMENDED BASELINE</button>
            <button type="button" class="cadet-coach-btn" data-open-academy>OPEN GUIDE</button>
            <button type="button" class="cadet-coach-btn cadet-coach-hide" data-cadet-hide-tips>HIDE TIPS</button>
          </span>
        </div>
        <div class="cadet-coach-copy">${escapeHtml(tip)}</div>
      </div>
    `;
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    els.openTitle = document.getElementById("btn-open-academy");
    els.openHud = document.getElementById("btn-hud-academy");
    els.openLobby = document.getElementById("btn-lobby-academy");

    [els.openTitle, els.openHud, els.openLobby].forEach((button) => {
      if (!button) return;
      button.addEventListener("click", () => open(0));
    });

    if (els.close) els.close.addEventListener("click", close);
    if (els.back) els.back.addEventListener("click", back);
    if (els.next) els.next.addEventListener("click", next);
    if (els.start) els.start.addEventListener("click", startCadetMission);
    if (els.tipsToggle) {
      els.tipsToggle.checked = isGuidanceEnabled();
      els.tipsToggle.addEventListener("change", () => setGuidanceEnabled(els.tipsToggle.checked));
    }
    if (els.modal) {
      els.modal.addEventListener("click", (event) => {
        if (event.target === els.modal) close();
      });
    }

    document.addEventListener("click", (event) => {
      const dot = event.target.closest ? event.target.closest("[data-academy-step]") : null;
      if (dot) {
        currentStep = Math.max(0, Math.min(STEPS.length - 1, Number(dot.getAttribute("data-academy-step")) || 0));
        renderStep();
        if (window.spaceAudio) window.spaceAudio.playClick();
        return;
      }

      const openButton = event.target.closest ? event.target.closest("[data-open-academy], #btn-briefing-academy") : null;
      if (openButton) {
        event.preventDefault();
        open(0);
        return;
      }

      const hideTips = event.target.closest ? event.target.closest("[data-cadet-hide-tips]") : null;
      if (hideTips) {
        setGuidanceEnabled(false);
        return;
      }

      const baseline = event.target.closest ? event.target.closest("[data-cadet-baseline]") : null;
      if (baseline && window.gameplay) {
        const scenarioId = baseline.getAttribute("data-scenario-id")
          || (window.gameplay.missionDesign && window.gameplay.missionDesign.scenarioId)
          || "lunar_south_pole";
        if (typeof window.gameplay.applyRecommendedScenarioBaseline === "function") {
          window.gameplay.applyRecommendedScenarioBaseline(scenarioId);
          if (typeof window.gameplay.showToast === "function") {
            window.gameplay.showToast("Recommended baseline applied — review the live resource strip.");
          }
          if (typeof window.gameplay._activeRenderCallback === "function") {
            try { window.gameplay._activeRenderCallback(); } catch (e) {}
          }
        }
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "F1" || event.key === "F1") {
        event.preventDefault();
        if (isOpen()) close();
        else open(0);
        return;
      }
      if (isOpen() && (event.code === "Escape" || event.key === "Escape")) {
        event.preventDefault();
        close();
      }
    });
  }

  function maybeAutoOpen() {
    if (safeGet(SEEN_KEY)) return;
    const menu = document.getElementById("screen-menu");
    if (!menu || menu.style.display === "none") return;
    if (document.body.classList.contains("game-active")) return;
    setTimeout(() => {
      if (safeGet(SEEN_KEY)) return;
      const menuNow = document.getElementById("screen-menu");
      if (!menuNow || menuNow.style.display === "none") return;
      if (document.hidden) return;
      if (isOpen()) return;
      open(0);
    }, 1100);
  }

  function init() {
    els = {
      modal: document.getElementById("modal-academy"),
      progress: document.getElementById("academy-progress"),
      step: document.getElementById("academy-step"),
      back: document.getElementById("btn-academy-back"),
      next: document.getElementById("btn-academy-next"),
      start: document.getElementById("btn-academy-start"),
      close: document.getElementById("btn-close-academy"),
      tipsToggle: document.getElementById("chk-academy-tips")
    };
    if (!els.modal) return;
    bindEvents();
    renderStep();
    maybeAutoOpen();
  }

  window.missionAcademy = {
    init: init,
    open: open,
    close: close,
    next: next,
    back: back,
    isOpen: isOpen,
    isGuidanceEnabled: isGuidanceEnabled,
    setGuidanceEnabled: setGuidanceEnabled,
    getConsoleTip: getConsoleTip,
    getConsoleTipHtml: getConsoleTipHtml
  };
})(window);
