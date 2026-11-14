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
  let initialized = false;

  const STEPS = [
    {
      nav: "MISSION",
      kicker: "QUICK GUIDE · 1 OF 5",
      title: "BALANCE YOUR CHOICES LIKE A REAL MISSION",
      body: `
        <p class="academy-lede">
          You are the mission planner. Pick what to explore, how to get there, and what tools to bring.
          Every choice draws from the same limited resources — upgrading one thing usually costs another.
        </p>
        <div class="academy-resource-grid">
          <div class="academy-resource" style="--rc:#7fb8a6;">
            <div class="academy-resource-code">BUDGET</div>
            <p>Money for your spacecraft, tools, rocket, and Earth dishes. Saving here leaves wiggle room for later.</p>
          </div>
          <div class="academy-resource" style="--rc:#67e8f9;">
            <div class="academy-resource-code">WEIGHT</div>
            <p>Everything you pack must be light enough for your chosen rocket to lift into space.</p>
          </div>
          <div class="academy-resource" style="--rc:#d0a15c;">
            <div class="academy-resource-code">ELECTRICITY</div>
            <p>Solar panels power everything in sunlight and charge batteries so lights stay on in Earth's shadow.</p>
          </div>
          <div class="academy-resource" style="--rc:#9a8fc4;">
            <div class="academy-resource-code">RADIO &amp; DATA</div>
            <p>Science tools gather data. Your radio and Earth dishes must be strong enough to send it all home.</p>
          </div>
          <div class="academy-resource" style="--rc:#38bdf8;">
            <div class="academy-resource-code">PUSH SPEED</div>
            <p>Thrusters must carry enough fuel to reach your destination, stay on track, and clean up safely afterward.</p>
          </div>
          <div class="academy-resource" style="--rc:#4ade80;">
            <div class="academy-resource-code">SCIENCE</div>
            <p>Pack the exact tools or lab pouches needed to answer the mission's main goal.</p>
          </div>
        </div>
        <div class="academy-callout">
          <strong>It's all about trade-offs.</strong> Bigger cameras gather better data, but add weight,
          power draw, file size, and cost. A smaller rocket saves money, but might not lift heavy gear.
        </div>
      `
    },
    {
      nav: "DESIGN",
      kicker: "QUICK GUIDE · 2 OF 5",
      title: "BUILD YOUR PLAN IN SIX SIMPLE STEPS",
      body: `
        <ol class="academy-flow">
          <li><b>01 · GOAL</b><span>Pick what you want to discover. This sets your budget, trip length, radiation risk, and needed tools.</span></li>
          <li><b>02 · FLIGHT PATH &amp; ROCKET</b><span>Pick where you are flying first, then choose a rocket strong enough to carry your weight there.</span></li>
          <li><b>03 · BODY &amp; POWER</b><span>Choose the main frame or pouch kit, plus enough solar panels and batteries to survive Earth's night side.</span></li>
          <li><b>04 · SCIENCE GEAR</b><span>Score points by packing the tools that match your mission goal — not just the priciest hardware.</span></li>
          <li><b>05 · COOLING &amp; RADIOS</b><span>Heat shields and cooling protect sensitive parts. Your radio and Earth dishes send the data back home.</span></li>
          <li><b>06 · ENGINES &amp; CLEANUP</b><span>Make sure you have enough fuel to steer, plus a safe end-of-mission cleanup plan with no space junk.</span></li>
        </ol>
        <div class="academy-callout">
          <strong>Easy starting tip:</strong> at any workstation, click <em>LOAD RECOMMENDED PLAN</em>.
          It loads a working starter setup for your mission. From there, tweak one item at a time and
          watch the live status bars.
        </div>
        <div class="academy-callout academy-callout-amber">
          <strong>Keep an eye on the top bar.</strong> Red warning bars mean something won't work in real life
          (like being too heavy or running out of battery), so fix those before launch!
        </div>
      `
    },
    {
      nav: "TRADE-OFFS",
      kicker: "QUICK GUIDE · 3 OF 5",
      title: "EVERY UPGRADE HAS A COST",
      body: `
        <div class="academy-tradeoff-table">
          <div class="academy-tradeoff-row academy-tradeoff-head"><span>IF YOU UPGRADE…</span><span>EXPECT TO PAY IN…</span></div>
          <div class="academy-tradeoff-row"><span>Better cameras or sensors</span><span>More weight · more electricity · bigger files · higher cost</span></div>
          <div class="academy-tradeoff-row"><span>Higher flight path or more fuel</span><span>Needs bigger rocket · carries less gear · longer radio reach</span></div>
          <div class="academy-tradeoff-row"><span>More solar power</span><span>Heavier panels · higher cost · takes up more room</span></div>
          <div class="academy-tradeoff-row"><span>Longer trip in space</span><span>Thicker radiation shield · extra fuel · higher budget</span></div>
          <div class="academy-tradeoff-row"><span>Faster downloads to Earth</span><span>Bigger dish · more electricity · pricier Earth antennas</span></div>
          <div class="academy-tradeoff-row"><span>Bigger rocket</span><span>Higher launch price · heavier ground support</span></div>
        </div>
        <div class="academy-callout">
          <strong>All green bars is step one — not the finish line!</strong> Your final score also checks whether
          you packed the right science gear, left spare room for safety, lasted long enough, and planned a clean finish.
        </div>
        <div class="academy-callout academy-callout-cyan">
          <strong>Compare before locking in:</strong> click <em>Save Plan A</em>, try a swap, and compare your
          cost, weight, electricity, fuel, and science score side by side!
        </div>
      `
    },
    {
      nav: "FLY",
      kicker: "QUICK GUIDE · 4 OF 5",
      title: "FROM LAUNCH PAD TO SPACE STATION",
      body: `
        <div class="academy-phase-grid">
          <div class="academy-phase"><b>01 · BOARD</b><span>Follow the glowing arrows to the spaceship door and press <kbd>E</kbd> to climb aboard.</span></div>
          <div class="academy-phase"><b>02 · LAUNCH</b><span>Press <kbd>L</kbd> to launch when ready. Everyone on board straps in automatically.</span></div>
          <div class="academy-phase"><b>03 · PARK AT STATION</b><span>Line up carefully with the Space Station doorway, then press <kbd>SPACE</kbd> to connect.</span></div>
          <div class="academy-phase"><b>04 · BUILD PLAN</b><span>Walk to each of the 7 glowing stations inside and press <kbd>E</kbd> to make your choices.</span></div>
          <div class="academy-phase"><b>05 · TEST FLIGHT</b><span>Run the full mission check at <b>[FINAL]</b>, see your report card, and try improvements.</span></div>
        </div>
        <div class="academy-controls">
          <span><kbd>WASD</kbd> WALK</span>
          <span><kbd>DRAG</kbd> LOOK AROUND</span>
          <span><kbd>E</kbd> USE DESK</span>
          <span><kbd>R</kbd> TEAM RADIO</span>
          <span><kbd>M</kbd> MIC</span>
          <span><kbd>C</kbd> CAMERA</span>
          <span><kbd>U</kbd> 3D PATH</span>
          <span><kbd>P</kbd> CONNECTION</span>
          <span><kbd>F1</kbd> GUIDE</span>
        </div>
        <div class="academy-callout">
          <strong>Need help anytime?</strong> Press <kbd>F1</kbd> or click <em>HELP</em> in the top bar.
          The checklist on the top-left always shows what step comes next.
        </div>
      `
    },
    {
      nav: "TEAM & SCORE",
      kicker: "QUICK GUIDE · 5 OF 5",
      title: "PLAY ALONE OR WITH FRIENDS",
      body: `
        <div class="academy-two-col">
          <div class="academy-panel">
            <h3>SOLO</h3>
            <p>You can run every station yourself! Watch the colored resource bars stay green, then run the final test flight.</p>
          </div>
          <div class="academy-panel">
            <h3>WITH A TEAM</h3>
            <p>Pick <em>CREATE TEAM</em>, share the room code, and split roles. Earth Control handles launch clearance and radio support while the Space Crew works inside the station.</p>
          </div>
        </div>
        <div class="academy-role-map">
          <div><b>[MAIN HUB]</b> pick mission goal &amp; overall plan</div>
          <div><b>[FLIGHT PATH]</b> where to fly &amp; which rocket</div>
          <div><b>[POWER]</b> spacecraft body, solar panels &amp; batteries</div>
          <div><b>[LAB &amp; GEAR]</b> cameras, sensors &amp; Space Food pouches</div>
          <div><b>[COOLING]</b> temperature control &amp; space shielding</div>
          <div><b>[ENGINES]</b> radios, Earth dishes, fuel &amp; cleanup</div>
          <div><b>[FINAL CHECK]</b> run test flight &amp; get your score</div>
        </div>
        <div class="academy-callout">
          <strong>Your final grade combines Science (45%) + Engineering (55%).</strong>
          Even if every bar is green, your score drops if you pack the wrong tool or forget clean retirement.
          Aim for <strong>75+</strong> to earn a Launch-Ready badge!
        </div>
        <div class="academy-callout academy-callout-cyan">
          <strong>Try, compare, improve.</strong> Download your mission plan file, save a backup as Plan A,
          and test a second setup — there's often more than one smart way to solve a mission.
        </div>
        <div class="academy-callout">
          <strong>Past Flights:</strong> every finished solo or team run is saved in your
          <em>Past Flights</em> log with scores, stages, and teammates. Open it anytime from the home screen or
          after finishing a mission!
        </div>
      `
    }
  ];

  const CONSOLE_TIPS = {
    task_antenna: "Start here to set your mission goal and difficulty. Apply the recommended starter setup if you want a clean working baseline to explore from.",
    task_nav: "Your orbit path and rocket must fit together. Higher or farther orbits need more steering speed and limit how much weight the rocket can carry.",
    task_wires: "Electricity balances sun and shadow: solar panels run equipment in daylight and charge batteries for Earth's shadow. Keep battery drain below 80%.",
    task_science: "Science gear adds discovery points while spending weight, power, and data. For BioNutrients-2, pick the full germ-filtered 12+ bag recipe with the 6-hour shake.",
    task_lss: "Temperature and radiation shields protect your gear. For BioNutrients-2 yeast, warm at 30°C and store bags in the -80°C ultra-cold freezer afterward.",
    task_hull: "Make sure your radio dish reaches Earth's antennas cleanly and you carry enough fuel plus a safe cleanup plan when the mission finishes.",
    task_landing: "Run the full mission check! Look at every stage (Launch, In Space, Ground, Lab Results) and tweak any red warning until all stages turn green."
  };

  const PREFLIGHT_TIPS = {
    arch: "Start here. Your mission goal sets your budget, trip length, science needs, fuel push, and radiation risk. Difficulty adjusts how much spare budget and weight room you get.",
    orbit: "Pick where to fly first, then pick your rocket. The rocket must be strong enough to carry your full loaded weight to that destination.",
    bus: "The spacecraft body and solar panels power everything on board. More science tools, a faster computer, or electric thrusters need more solar panels, battery storage, and weight.",
    viz: "This preview shows potential trouble spots and expected science results so you can fix weak areas before locking in your plan.",
    generic: "Watch the live status bars at the top! Click Load Recommended Plan for an easy starting setup, then swap one part at a time to see how it changes your numbers."
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
    // Start cadets from the scenario's recommended point design, then let them
    // change one subsystem at a time with the CADET COACH guidance.
    if (window.gameplay && typeof window.gameplay.applyRecommendedScenarioBaseline === "function") {
      window.gameplay.applyRecommendedScenarioBaseline("lunar_south_pole");
    }
    if (window.spaceAudio) window.spaceAudio.playClick();
    if (els.start) {
      els.start.disabled = true;
      els.start.textContent = "LAUNCHING CADET MISSION…";
    }
    window.netManager.startSolo(name, color, null, {
      opsMode: "iss_expedition",
      scenarioId: "lunar_south_pole",
      difficultyId: "cadet",
      autoStart: true
    });
    close();
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
      <div class="cadet-coach" role="note" aria-label="Helpful tip">
        <div class="cadet-coach-head">
          <span class="cadet-coach-badge">HELPFUL TIP</span>
          <span class="cadet-coach-actions">
            <button type="button" class="cadet-coach-btn" data-cadet-baseline data-scenario-id="${escapeHtml(scenarioId)}">LOAD RECOMMENDED PLAN</button>
            <button type="button" class="cadet-coach-btn" data-open-academy>HOW TO PLAY</button>
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
    if (initialized) return;
    initialized = true;
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
    // Do not auto-open the guide. New pilots can launch it from the title,
    // staging deck, or HUD whenever they choose.
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

  // Self-initialize as soon as the DOM shell is ready. main.js also calls init()
  // after the 3D world boots, but the Academy must remain usable even if a
  // scene module fails to initialize.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    setTimeout(init, 0);
  }
})(window);
