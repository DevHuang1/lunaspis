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

  const ROUTE_PHASES = {
    plan: { label: "PLAN", color: "#67e8f9" },
    build: { label: "BUILD", color: "#d0a15c" },
    final: { label: "FINAL TEST", color: "#83a896" }
  };

  const ROUTE_STOPS = [
    { code: "HUB", action: "Pick goal", detail: "Mission + team", phase: "plan", icon: "flag" },
    { code: "CMD", action: "Pick rocket", detail: "Match the distance", phase: "plan", icon: "rocket" },
    { code: "PWR", action: "Body + power", detail: "Solar + battery", phase: "build", icon: "power" },
    { code: "SCI", action: "Pack tools", detail: "Match the goal", phase: "build", icon: "flask" },
    { code: "LSS", action: "Heat + shield", detail: "Keep tools alive", phase: "build", icon: "thermo" },
    { code: "HULL", action: "Radio + fuel", detail: "Reach Earth + steer", phase: "build", icon: "antenna" },
    { code: "LDR", action: "Test + score", detail: "Fix red, then fly", phase: "final", icon: "gauge" }
  ];

  const ICON_PATHS = {
    flag: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M8.5 11.5l2 2 4-4"/><path d="M8.5 17.5h7"/>',
    rocket: '<path d="M12 2.5c2.6 2 4 5.4 4 9.2 0 1.5-.4 2.9-.9 4H8.9c-.5-1.1-.9-2.5-.9-4 0-3.8 1.4-7.2 4-9.2Z"/><circle cx="12" cy="9" r="1.5"/><path d="M8.9 15.7 6 18.4l.6-4.3M15.1 15.7l2.9 2.7-.6-4.3M12 15.7V21"/>',
    power: '<path d="M13 2 4.5 13.5H11l-1 8.5 8.5-12H13l1-8Z"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 8.2A1.8 1.8 0 0 0 6.6 20h10.8a1.8 1.8 0 0 0 1.6-2.8L14 9V3"/><path d="M8 14h8"/>',
    thermo: '<path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z"/><path d="M12 8v6"/><circle cx="12" cy="17" r="1.4"/>',
    antenna: '<path d="M12 13v8M8.5 21h7"/><circle cx="12" cy="10" r="2.2"/><path d="M7.4 5.4a6.5 6.5 0 0 1 9.2 0M9.5 7.8a3.4 3.4 0 0 1 5 0"/>',
    gauge: '<path d="M4 18a8 8 0 0 1 16 0"/><path d="M12 18l3.4-5.2"/><circle cx="12" cy="18" r="1.2"/><path d="M5.8 13.6l1 .6M18.2 13.6l-1 .6M12 6.2v1.2"/>',
    budget: '<path d="M12 3v18"/><path d="M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.7 4 3 4 1.1 4 3-1.8 3-4 3-4-1.1-4-3"/>',
    weight: '<circle cx="12" cy="4.5" r="2"/><path d="M6 8h12l2 13H4L6 8Z"/><path d="M9 12h6"/>',
    data: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
    fuel: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/><path d="M9.5 15.5a2.5 2.5 0 0 0 5 0"/>'
  };

  function iconSvg(name, className, extra) {
    return `<svg class="${className}" ${extra || ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ""}</svg>`;
  }

  function hexToRgba(hex, alpha) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function renderMissionRouteSvg() {
    const startX = 76;
    const gap = 124;
    const routeY = 176;
    const phases = ["plan", "build", "final"];

    const bands = phases.map((key) => {
      const phase = ROUTE_PHASES[key];
      const indexes = ROUTE_STOPS
        .map((stop, index) => (stop.phase === key ? index : -1))
        .filter((index) => index >= 0);
      const first = indexes[0];
      const last = indexes[indexes.length - 1];
      const x = startX + first * gap - 34;
      const width = (last - first) * gap + 68;
      return `
        <g class="academy-map-band">
          <rect x="${x}" y="16" width="${width}" height="32" rx="16" fill="${hexToRgba(phase.color, 0.07)}" stroke="${hexToRgba(phase.color, 0.3)}" />
          <text x="${x + width / 2}" y="37" text-anchor="middle" fill="${phase.color}" class="academy-map-phase-label">${phase.label}</text>
        </g>`;
    }).join("");

    const chevrons = ROUTE_STOPS.slice(0, -1).map((_, index) => {
      const x = startX + index * gap + gap / 2;
      return `<path d="M${x - 4} ${routeY - 4} l5 4 -5 4" class="academy-map-chevron" />`;
    }).join("");

    const stars = [
      [62, 92, 1.1], [148, 72, 0.8], [238, 110, 1], [342, 80, 0.7], [438, 108, 1.2],
      [522, 74, 0.8], [626, 104, 0.9], [724, 82, 1.1], [818, 110, 0.7], [874, 66, 0.9],
      [104, 138, 0.7], [298, 140, 0.8], [556, 132, 0.7], [778, 138, 0.8]
    ].map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" class="academy-map-star" />`).join("");

    const stops = ROUTE_STOPS.map((stop, index) => {
      const phase = ROUTE_PHASES[stop.phase];
      const x = startX + index * gap;
      const soft = hexToRgba(phase.color, 0.16);
      return `
        <g class="academy-map-stop" transform="translate(${x} ${routeY})">
          <circle cx="0" cy="0" r="34" fill="${soft}" />
          <circle cx="0" cy="0" r="27" class="academy-map-disc" stroke="${hexToRgba(phase.color, 0.55)}" stroke-width="1.2" />
          ${iconSvg(stop.icon, "academy-map-glyph", 'x="-12" y="-12" width="24" height="24" style="color:' + phase.color + '"')}
          <g transform="translate(21 -21)">
            <circle r="10" fill="${phase.color}" />
            <text y="3.4" text-anchor="middle" class="academy-map-num">${index + 1}</text>
          </g>
          <text y="52" text-anchor="middle" class="academy-map-code">${stop.code}</text>
          <text y="70" text-anchor="middle" class="academy-map-action">${stop.action}</text>
          <text y="87" text-anchor="middle" class="academy-map-detail">${stop.detail}</text>
        </g>`;
    }).join("");

    return `
      <svg class="academy-route-svg" viewBox="0 0 900 286" role="img" aria-labelledby="academyRouteTitle academyRouteDesc">
        <title id="academyRouteTitle">Mission flight plan: seven stops</title>
        <desc id="academyRouteDesc">Start at HUB to pick your mission goal. Then CMD for the rocket, PWR for power, SCI for tools, LSS for heat and shielding, HULL for radio and fuel, and finally LDR for the full test. Each stop is one decision.</desc>
        <defs>
          <linearGradient id="academyRouteGradient" gradientUnits="userSpaceOnUse" x1="${startX}" y1="0" x2="${startX + gap * (ROUTE_STOPS.length - 1)}" y2="0">
            <stop offset="0" stop-color="#67e8f9" />
            <stop offset="0.42" stop-color="#67e8f9" />
            <stop offset="0.58" stop-color="#d0a15c" />
            <stop offset="0.86" stop-color="#d0a15c" />
            <stop offset="1" stop-color="#83a896" />
          </linearGradient>
        </defs>
        <g class="academy-map-stars">${stars}</g>
        ${bands}
        <line x1="${startX}" y1="${routeY}" x2="${startX + gap * (ROUTE_STOPS.length - 1)}" y2="${routeY}" class="academy-map-track" />
        <line x1="${startX}" y1="${routeY}" x2="${startX + gap * (ROUTE_STOPS.length - 1)}" y2="${routeY}" class="academy-map-line" stroke="url(#academyRouteGradient)" />
        <g class="academy-map-chevrons">${chevrons}</g>
        <g class="academy-map-stops">${stops}</g>
      </svg>`;
  }

  function renderMissionRouteMobile() {
    const rows = ROUTE_STOPS.map((stop, index) => {
      const phase = ROUTE_PHASES[stop.phase];
      const style = `--phase:${phase.color};--phase-soft:${hexToRgba(phase.color, 0.14)};--phase-line:${hexToRgba(phase.color, 0.42)};`;
      return `
        <li class="academy-route-mobile-stop" style="${style}">
          <span class="academy-route-mobile-pin">
            <span class="academy-route-mobile-icon">${iconSvg(stop.icon, "academy-route-icon", 'width="22" height="22"')}</span>
            <span class="academy-route-mobile-num">${index + 1}</span>
          </span>
          <span class="academy-route-mobile-copy">
            <span class="academy-route-mobile-line"><b>${stop.code}</b><span>${stop.action}</span></span>
            <span class="academy-route-mobile-detail">${stop.detail}</span>
          </span>
        </li>`;
    }).join("");

    return `
      <ol class="academy-route-mobile" aria-label="Seven mission stops">
        ${rows}
      </ol>`;
  }

  function renderMissionRoute() {
    const legend = Object.keys(ROUTE_PHASES).map((key) => {
      const phase = ROUTE_PHASES[key];
      return `<span style="--phase:${phase.color}"><i></i>${phase.label}</span>`;
    }).join("");

    return `
      <div class="academy-route-panel">
        <div class="academy-route-top">
          <span class="academy-route-title">MISSION FLIGHT PLAN</span>
          <span class="academy-route-sub">7 STOPS · FOLLOW IN ORDER</span>
        </div>
        <div class="academy-route-desktop">${renderMissionRouteSvg()}</div>
        ${renderMissionRouteMobile()}
        <div class="academy-route-legend">
          ${legend}
          <span class="academy-route-legend-tip">START AT THE HUB</span>
        </div>
      </div>`;
  }

  function resourceHead(icon, label, color) {
    return `
      <div class="academy-resource-head" style="--rc:${color};">
        <span class="academy-resource-icon">${iconSvg(icon, "academy-resource-glyph", 'width="18" height="18"')}</span>
        <span class="academy-resource-code">${label}</span>
      </div>`;
  }

  const STEPS = [
    {
      nav: "FLIGHT PLAN",
      kicker: "START HERE · 1 OF 5",
      title: "SEVEN DESKS. ONE FLIGHT PLAN.",
      body: `
        <div class="academy-goal">
          <span>THE WHOLE GAME</span>
          <strong>Pick a goal. Build at seven desks. Run the final test.</strong>
        </div>
        <p class="academy-lede">Each desk asks one question. Visit them in order — the Mission Hub always names the next one.</p>
        ${renderMissionRoute()}
        <div class="academy-callout academy-callout-cyan">
          <strong>Lost?</strong> The top-left Mission Hub always shows your next desk. Press <kbd>E</kbd> at the glowing console.
        </div>
        <details class="academy-check">
          <summary>Quick check: which desk do you visit first?</summary>
          <p>The HUB. Pick your mission goal there, then follow the glowing desks in order.</p>
        </details>
      `
    },
    {
      nav: "BARS",
      kicker: "READ THE GAUGES · 2 OF 5",
      title: "SIX BARS TELL YOU IF IT CAN FLY",
      body: `
        <div class="academy-goal">
          <span>YOU'LL LEARN</span>
          <strong>What the six resource bars mean — and why a “better” part can make the whole mission worse.</strong>
        </div>
        <p class="academy-lede">Every part spends at least two bars. Green is safe. Red must be fixed.</p>
        <div class="academy-resource-grid">
          <div class="academy-resource" style="--rc:#7fb8a6;">
            ${resourceHead("budget", "BUDGET", "#7fb8a6")}
            <p><b>What you can spend.</b> Bigger parts leave less for everything else.</p>
          </div>
          <div class="academy-resource" style="--rc:#67e8f9;">
            ${resourceHead("weight", "WEIGHT", "#67e8f9")}
            <p><b>What your rocket can lift.</b> Every tool, battery, and shield adds kilograms.</p>
          </div>
          <div class="academy-resource" style="--rc:#d0a15c;">
            ${resourceHead("power", "ELECTRICITY", "#d0a15c")}
            <p><b>What stays on in the dark.</b> Solar charges batteries for Earth's shadow.</p>
          </div>
          <div class="academy-resource" style="--rc:#9a8fc4;">
            ${resourceHead("data", "RADIO &amp; DATA", "#9a8fc4")}
            <p><b>What you can send home.</b> Big files need a stronger dish and more power.</p>
          </div>
          <div class="academy-resource" style="--rc:#38bdf8;">
            ${resourceHead("fuel", "FUEL", "#38bdf8")}
            <p><b>How far you can steer.</b> The Moon needs more push than low Earth orbit.</p>
          </div>
          <div class="academy-resource" style="--rc:#4ade80;">
            ${resourceHead("flask", "SCIENCE", "#4ade80")}
            <p><b>The reason you fly.</b> Pick the tools that answer your mission question.</p>
          </div>
        </div>
        <div class="academy-callout">
          <strong>One trade-off to remember:</strong> a better camera adds weight, uses more power, makes bigger files, and costs more.
        </div>
        <details class="academy-check">
          <summary>Quick check: what does a bigger camera cost?</summary>
          <p>Weight, electricity, data, and budget. That is why a better part can still make the mission worse.</p>
        </details>
      `
    },
    {
      nav: "TRADE-OFFS",
      kicker: "SMART CHOICES · 3 OF 5",
      title: "FIND THE HIDDEN COST",
      body: `
        <div class="academy-goal">
          <span>YOU'LL LEARN</span>
          <strong>The three trade-offs that decide most missions.</strong>
        </div>
        <div class="academy-tradeoff-table">
          <div class="academy-tradeoff-row academy-tradeoff-head"><span>IF YOU ADD…</span><span>EXPECT TO SPEND…</span></div>
          <div class="academy-tradeoff-row"><span>Better science tool</span><span>Weight · power · data · budget</span></div>
          <div class="academy-tradeoff-row"><span>Farther destination</span><span>Fuel · shielding · mission time</span></div>
          <div class="academy-tradeoff-row"><span>Bigger safety margin</span><span>Budget · mass · room for tools</span></div>
        </div>
        <div class="academy-callout">
          <strong>Green bars mean it can fly.</strong> They do not mean it is a good mission. Your score also checks the right tools and a clean finish.
        </div>
        <div class="academy-callout academy-callout-cyan">
          <strong>Compare two ideas:</strong> click <em>Save Plan A</em>, swap one part, and read the changes. That is the fastest way to learn a trade-off.
        </div>
        <div class="academy-try">
          <span class="academy-try-label">TRY THIS NOW</span>
          <p>At any desk, save Plan A. Change one part. Compare the cost, weight, power, and score.</p>
        </div>
        <details class="academy-check">
          <summary>Quick check: all bars are green. Are you guaranteed a high score?</summary>
          <p>No. A high score also needs science tools that match the goal and a safe end-of-mission cleanup.</p>
        </details>
      `
    },
    {
      nav: "FLY",
      kicker: "FLIGHT DAY · 4 OF 5",
      title: "FROM PAD TO FINAL TEST",
      body: `
        <div class="academy-goal">
          <span>YOU'LL LEARN</span>
          <strong>The five-step flight flow from boarding to the final test.</strong>
        </div>
        <div class="academy-phase-grid">
          <div class="academy-phase"><b>01 · BOARD</b><span>Follow the glowing arrows to the ship door. Press <kbd>E</kbd>.</span></div>
          <div class="academy-phase"><b>02 · LAUNCH</b><span>Strap in. Press <kbd>L</kbd> when the pad is clear.</span></div>
          <div class="academy-phase"><b>03 · DOCK</b><span>Line up with the Station door. Press <kbd>SPACE</kbd> to connect.</span></div>
          <div class="academy-phase"><b>04 · BUILD</b><span>Walk to each glowing desk. Press <kbd>E</kbd> to choose.</span></div>
          <div class="academy-phase"><b>05 · TEST</b><span>Run the Final Check [LDR] and read your score.</span></div>
        </div>
        <div class="academy-controls">
          <span><kbd>WASD</kbd> WALK</span>
          <span><kbd>DRAG</kbd> LOOK</span>
          <span><kbd>E</kbd> USE DESK</span>
          <span><kbd>L</kbd> LAUNCH</span>
          <span><kbd>F1</kbd> HELP</span>
        </div>
        <div class="academy-callout">
          <strong>Lost?</strong> The top-left Mission Hub always names the next step and shows which crew role owns it. Press <kbd>F1</kbd> to reopen this guide.
        </div>
        <div class="academy-try">
          <span class="academy-try-label">TRY THIS NOW</span>
          <p>Find the glowing ship door and press <kbd>E</kbd>. Then open the Mission Hub to see your next task.</p>
        </div>
        <details class="academy-check">
          <summary>Quick check: how do you launch?</summary>
          <p>Board the ship and press <kbd>L</kbd>. The Earth Team clears the launch before liftoff.</p>
        </details>
      `
    },
    {
      nav: "TEAM & SCORE",
      kicker: "FINISH STRONG · 5 OF 5",
      title: "PLAY SOLO OR WITH FRIENDS",
      body: `
        <div class="academy-goal">
          <span>YOU'LL LEARN</span>
          <strong>Why solo works, what changes with a team, and how your final score is built.</strong>
        </div>
        <div class="academy-two-col">
          <div class="academy-panel">
            <h3>SOLO</h3>
            <p>You cover every desk. Follow the checklist and use the safe starter setup if you get stuck.</p>
          </div>
          <div class="academy-panel">
            <h3>WITH A TEAM</h3>
            <p>Share the room code. Earth Team handles clearance and dishes; Space Crew builds and tests.</p>
          </div>
        </div>
        <div class="academy-score-card">
          <span class="academy-try-label">FINAL SCORE</span>
          <strong>Science 45% + Engineering 55%</strong>
          <p>75 or more earns the Launch-Ready badge. The right tools and a clean finish matter as much as green bars.</p>
        </div>
        <div class="academy-role-summary">
          <span><b>EARTH TEAM</b> launch clearance, Earth dishes, science links</span>
          <span><b>SPACE CREW</b> HUB · CMD · PWR · SCI · LSS · HULL</span>
          <span><b>ANYONE</b> final LDR test</span>
        </div>
        <div class="academy-try">
          <span class="academy-try-label">TRY THIS NOW</span>
          <p>Finish a run, then open Past Flights. Compare the score with the tools you packed.</p>
        </div>
        <details class="academy-check">
          <summary>Quick check: what score earns Launch Ready?</summary>
          <p>75 or higher. Fly once, compare the result, then improve one choice and fly again.</p>
        </details>
      `
    }
  ];

  const CONSOLE_TIPS = {
    task_antenna: "Pick the mission question and difficulty. Use the safe starter setup for a working baseline.",
    task_nav: "Pick the destination first, then a rocket that can lift your full weight there.",
    task_wires: "Solar panels must run tools in daylight and charge batteries for Earth's shadow.",
    task_science: "Pack tools that match the goal. For BioNutrients-2, use the 12+ bag filtered recipe with the 6-hour shake.",
    task_lss: "Warm yeast at 30°C, then freeze samples at −80°C after growth.",
    task_hull: "Your radio must reach Earth, and you need enough fuel plus a safe cleanup plan.",
    task_landing: "Run the full test. Fix every red stage, then check your score."
  };

  const PREFLIGHT_TIPS = {
    arch: "Pick the mission goal first. It sets budget, trip length, science needs, fuel, and radiation risk.",
    orbit: "Pick the destination first, then a rocket strong enough for your full loaded weight.",
    bus: "More tools and electric thrusters need more solar power, battery storage, and weight.",
    viz: "Use this preview to find weak spots before you lock the plan.",
    generic: "Watch the status bars. Use the safe starter setup, then change one part at a time."
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
            <button type="button" class="cadet-coach-btn" data-cadet-baseline data-scenario-id="${escapeHtml(scenarioId)}">SAFE START</button>
            <button type="button" class="cadet-coach-btn" data-open-academy>GUIDE</button>
            <button type="button" class="cadet-coach-btn cadet-coach-hide" data-cadet-hide-tips>HIDE</button>
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
