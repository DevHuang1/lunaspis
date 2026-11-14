(function () {
  "use strict";

  const FALLBACK = {
    brand: "#d0a15c",
    brandStrong: "#e7c58c",
    brandSoft: "rgba(208, 161, 92, 0.12)",
    brandLine: "rgba(208, 161, 92, 0.42)",
    brandInk: "#1a1206",
    ink: "#eceae3",
    inkMuted: "#a6adb6",
    inkDim: "#6f7782",
    ok: "#83a896",
    warn: "#d0a15c",
    crit: "#c67979",
    glassBorder: "rgba(255, 255, 255, 0.13)"
  };

  const cssVar = (name, fallback) => {
    if (typeof window === "undefined" || !document.documentElement) return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value && value.trim() ? value.trim() : fallback;
  };

  const palette = {
    brand: cssVar("--brand", cssVar("--ui-brand", FALLBACK.brand)),
    brandStrong: cssVar("--brand-strong", cssVar("--ui-brand-strong", FALLBACK.brandStrong)),
    brandSoft: cssVar("--brand-soft", cssVar("--ui-brand-soft", FALLBACK.brandSoft)),
    brandLine: cssVar("--brand-line", cssVar("--ui-brand-line", FALLBACK.brandLine)),
    brandInk: cssVar("--brand-ink", FALLBACK.brandInk),
    ink: cssVar("--ink-1", cssVar("--ui-text", FALLBACK.ink)),
    inkMuted: cssVar("--ink-2", cssVar("--ui-text-muted", FALLBACK.inkMuted)),
    inkDim: cssVar("--ink-3", cssVar("--ui-text-dim", FALLBACK.inkDim)),
    ok: cssVar("--state-ok", cssVar("--ui-ok", FALLBACK.ok)),
    warn: cssVar("--ui-warn", FALLBACK.warn),
    crit: cssVar("--state-crit", cssVar("--ui-crit", FALLBACK.crit)),
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
        palette.ink = cssVar("--ink-1", palette.ink);
        palette.inkMuted = cssVar("--ink-2", palette.inkMuted);
        palette.inkDim = cssVar("--ink-3", palette.inkDim);
        palette.ok = cssVar("--state-ok", palette.ok);
        palette.crit = cssVar("--state-crit", palette.crit);
      },
      setQualityClass(preset) {
        const fast = preset === "potato" || preset === "off";
        document.body.classList.toggle("quality-fast", Boolean(fast));
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", updatePrompts, { once: true });
    } else {
      updatePrompts();
    }
  }
})();
