(function () {
  "use strict";

  const FALLBACK = {
    brand: "#c9f04b",
    brandStrong: "#e4ff7e",
    brandRgb: "201, 240, 75",
    brandSoft: "rgba(201, 240, 75, 0.12)",
    brandLine: "rgba(201, 240, 75, 0.42)",
    brandInk: "#0b1204",
    ink: "#efeee7",
    inkMuted: "#a7b0ba",
    inkDim: "#7a8490",
    ok: "#63e6a8",
    warn: "#f5c451",
    crit: "#ff6b6b",
    info: "#7dd3fc",
    data: "#7dd3fc",
    glassBorder: "rgba(255, 255, 255, 0.10)"
  };

  const cssVar = (name, fallback) => {
    if (typeof window === "undefined" || !document.documentElement) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value && value.trim() ? value.trim() : fallback;
  };

  const palette = {
    brand: cssVar("--brand", cssVar("--ui-brand", FALLBACK.brand)),
    brandStrong: cssVar("--brand-strong", cssVar("--ui-brand-strong", FALLBACK.brandStrong)),
    brandRgb: cssVar("--ui-brand-rgb", FALLBACK.brandRgb),
    brandSoft: cssVar("--brand-soft", cssVar("--ui-brand-soft", FALLBACK.brandSoft)),
    brandLine: cssVar("--brand-line", cssVar("--ui-brand-line", FALLBACK.brandLine)),
    brandInk: cssVar("--brand-ink", FALLBACK.brandInk),
    ink: cssVar("--ink-1", cssVar("--ui-text", FALLBACK.ink)),
    inkMuted: cssVar("--ink-2", cssVar("--ui-text-muted", FALLBACK.inkMuted)),
    inkDim: cssVar("--ink-3", cssVar("--ui-text-dim", FALLBACK.inkDim)),
    ok: cssVar("--state-ok", cssVar("--ui-ok", FALLBACK.ok)),
    warn: cssVar("--ui-warn", FALLBACK.warn),
    crit: cssVar("--state-crit", cssVar("--ui-crit", FALLBACK.crit)),
    info: cssVar("--ui-info", FALLBACK.info),
    data: cssVar("--ui-data", FALLBACK.data),
    glassBorder: cssVar("--glass-border", FALLBACK.glassBorder)
  };

  const prompts = {
    kbm: {
      navigate: "WASD",
      select: "ENTER",
      close: "ESC",
      interact: "E",
      camera: "C",
      emote: "X",
      deck: "Q"
    },
    pad: {
      navigate: "D-PAD",
      select: "A",
      close: "B",
      interact: "X",
      camera: "Y",
      emote: "LB",
      deck: "LB"
    },
    touch: {
      navigate: "TAP",
      select: "TAP",
      close: "\u2715",
      interact: "TAP",
      camera: "CAM",
      emote: "DECK",
      deck: "DECK"
    }
  };

  const THEMES = {
    "flight-lime": { label: "FLIGHT LIME", metaColor: "#080b10" },
    "gloss-silver": { label: "GLOSS SILVER", metaColor: "#07090c" },
    "lunar-champagne": { label: "LUNAR CHAMPAGNE", metaColor: "#080a0e" }
  };
  const THEME_STORAGE_KEY = "lunaspis_ui_theme";

  function storedTheme() {
    try {
      const value = localStorage.getItem(THEME_STORAGE_KEY);
      return THEMES[value] ? value : "";
    } catch (_) {
      return "";
    }
  }

  let currentTheme = storedTheme() || document.documentElement.dataset.theme || "flight-lime";
  if (!THEMES[currentTheme]) currentTheme = "flight-lime";
  document.documentElement.dataset.theme = currentTheme;

  function updateThemeUI() {
    document.querySelectorAll("[data-theme-choice]").forEach((button) => {
      const selected = button.getAttribute("data-theme-choice") === currentTheme;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    const badge = document.getElementById("theme-val-badge");
    if (badge) badge.textContent = (THEMES[currentTheme] || THEMES["flight-lime"]).label;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", (THEMES[currentTheme] || THEMES["flight-lime"]).metaColor);
  }

  function applyTheme(theme, persist = true) {
    const next = THEMES[theme] ? theme : "flight-lime";
    currentTheme = next;
    document.documentElement.dataset.theme = next;
    if (persist) {
      try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch (_) { /* noop */ }
    }
    if (window.UITheme && typeof window.UITheme.refreshColors === "function") {
      window.UITheme.refreshColors();
    }
    updateThemeUI();
    window.dispatchEvent(new CustomEvent("ui-theme-changed", { detail: { theme: next } }));
    return next;
  }

  let currentInput = "kbm";
  const listeners = new Set();

  function detectMode(event) {
    if (!event) return currentInput;
    if (event.type === "gamepadconnected") return "pad";
    if (event.type === "pointerdown" && event.pointerType === "touch") return "touch";
    if (event.type === "touchstart") return "touch";
    if (event.type === "keydown") return "kbm";
    if (event.type === "pointerdown") return "kbm";
    return currentInput;
  }

  function setInputMode(mode) {
    if (!mode || mode === currentInput) return;
    currentInput = mode;
    document.body.dataset.input = mode;
    listeners.forEach((fn) => {
      try { fn(mode, prompts[mode]); } catch (_) { /* noop */ }
    });
  }

  function updatePrompts() {
    const glyphs = prompts[currentInput];
    const nav = document.getElementById("deck-glyph-nav");
    const select = document.getElementById("deck-glyph-select");
    const close = document.getElementById("deck-glyph-close");
    if (nav) nav.textContent = glyphs.navigate;
    if (select) select.textContent = glyphs.select;
    if (close) close.textContent = glyphs.close;
    document.querySelectorAll(".ctl-glyph[data-action]").forEach((el) => {
      const action = el.getAttribute("data-action");
      if (glyphs[action]) el.textContent = glyphs[action];
    });
  }

  function onInput(event) {
    const mode = detectMode(event);
    if (mode !== currentInput) {
      setInputMode(mode);
      updatePrompts();
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onInput, { passive: true });
    window.addEventListener("pointerdown", onInput, { passive: true });
    window.addEventListener("touchstart", onInput, { passive: true });
    window.addEventListener("gamepadconnected", onInput);
    window.addEventListener("gamepaddisconnected", () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const hasPad = Array.from(pads || []).some(Boolean);
      if (!hasPad) {
        setInputMode("kbm");
        updatePrompts();
      }
    });

    const touchCapable = (navigator.maxTouchPoints || 0) > 0 &&
      window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    currentInput = touchCapable ? "touch" : "kbm";
    document.body.dataset.input = currentInput;

    window.UITheme = {
      palette,
      themes: THEMES,
      color(name = "brand") { return palette[name] || palette.brand; },
      get theme() { return currentTheme; },
      setTheme(theme) { return applyTheme(theme, true); },
      get inputMode() { return currentInput; },
      setInputMode,
      prompts: () => prompts[currentInput],
      glyph: (action) => (prompts[currentInput] && prompts[currentInput][action]) || "",
      onInputChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      refreshColors() {
        palette.brand = cssVar("--brand", palette.brand);
        palette.brandStrong = cssVar("--brand-strong", palette.brandStrong);
        palette.brandRgb = cssVar("--ui-brand-rgb", palette.brandRgb);
        palette.ink = cssVar("--ink-1", palette.ink);
        palette.inkMuted = cssVar("--ink-2", palette.inkMuted);
        palette.inkDim = cssVar("--ink-3", palette.inkDim);
        palette.ok = cssVar("--state-ok", palette.ok);
        palette.crit = cssVar("--state-crit", palette.crit);
        palette.warn = cssVar("--ui-warn", palette.warn);
        palette.info = cssVar("--ui-info", palette.info);
        palette.data = cssVar("--ui-data", palette.data);
      },
      setQualityClass(preset) {
        const fast = preset === "potato" || preset === "off";
        document.body.classList.toggle("quality-fast", Boolean(fast));
      }
    };

    applyTheme(currentTheme, false);

    function bindThemeControls() {
      document.querySelectorAll("[data-theme-choice]").forEach((button) => {
        button.addEventListener("click", () => {
          applyTheme(button.getAttribute("data-theme-choice"), true);
        });
      });
      updateThemeUI();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        updatePrompts();
        bindThemeControls();
      }, { once: true });
    } else {
      updatePrompts();
      bindThemeControls();
    }
    updateThemeUI();
  }
})();
