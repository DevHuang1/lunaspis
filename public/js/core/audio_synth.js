/**
 * ============================================================================
 * LUNASPIS SFX ENGINE  (Web Audio API, v5)
 * ============================================================================
 * 100% procedural, offline-ready sound design. No audio files are loaded.
 *
 * Design language
 *   - One musical palette: D major pentatonic (D E F# A B). Every chime, arpeggio
 *     and confirmation lands on a consonant note, so overlapping UI sounds never
 *     clash.
 *   - Glass / FM bells for interface + success, filtered noise and inharmonic
 *     metal partials for physical things (hatches, clamps, stage separation).
 *   - A shared algorithmic reverb bus gives everything the same "room".
 *   - A master limiter keeps big events (launch, victory) from clipping.
 *   - Ambient scene beds (menu / station / ground / space / launch) crossfade
 *     automatically from game state.
 *
 * Public API (backwards compatible with the previous engine)
 *   spaceAudio.init() / resume() / toggleMute()
 *   spaceAudio.playClick() playRadioBeep(intro) playThrusterBurst(d)
 *   spaceAudio.playAirlockCycle() playAlarm(type) playDockingLock() playLaserPulse()
 *   spaceAudio.playWormholeJump() startRocketRoar(i) stopRocketRoar(fade)
 *   spaceAudio.playStagingSeparation() playCountdownBeep(isGo) playDockingLatch()
 *   spaceAudio.playWarpSpoolUp() playScanTone() playSatelliteDeploy()
 *
 * New API
 *   spaceAudio.play(name, { vol, pan, at, ...params })   fire any named sound
 *   spaceAudio.setVolume("master"|"sfx"|"ui"|"ambience", 0..1)
 *   spaceAudio.setMuted(bool)  /  spaceAudio.setScene("menu"|"station"|...)
 *   spaceAudio.names()         list every registered sound
 *
 * Interface sounds are automatic: hover, click, tab, toggle, slider, typing and
 * panel open/close are detected from the DOM. Override per element with
 *   data-sfx="none | click | confirm | back | tab | open | deny | <sound name>"
 * ============================================================================
 */
(function (window) {
  "use strict";

  const STORAGE_KEY = "lunaspis.audio.v1";
  const DEFAULTS = { master: 0.8, sfx: 1.0, ui: 0.85, ambience: 0.7, muted: false };
  const VOICE_SOFT_CAP = 44; // above this, decorative sounds are dropped
  const VOICE_HARD_CAP = 110; // above this, everything except fanfares is dropped
  const NOISE_SEAM = 0.05; // seconds crossfaded at the loop seam of cached noise
  // Fixed per-bus make-up gain so the sliders' default positions sit at a good level.
  const BUS_TRIM = { ui: 2.6, sfx: 1.4, comms: 1.4, ambience: 1.0 };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const jit = (amt) => 1 + (Math.random() * 2 - 1) * amt;

  // ---- Musical palette: D major pentatonic ---------------------------------
  const D4 = 293.6648;
  const semi = (n) => D4 * Math.pow(2, n / 12);
  const PENTA = [0, 2, 4, 7, 9];
  const penta = (i) => semi(PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5));
  const N = {
    D3: 146.83, A3: 220.0, D4: 293.66, E4: 329.63, Fs4: 369.99, A4: 440.0, B4: 493.88,
    D5: 587.33, E5: 659.26, Fs5: 739.99, A5: 880.0, B5: 987.77,
    D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760.0, D7: 2349.32,
  };

  // Minimum spacing between repeats of the same sound (ms).
  const GAP = {
    uiHover: 60, uiClick: 22, uiSlider: 38, typeKey: 26, key: 20, footstep: 105,
    thrusterBurst: 70, rcsPuff: 110, deny: 130, uiNotify: 110, pop: 80,
    airlock: 160, dockingLatch: 300, dockingLock: 300, stagingSeparation: 300,
    radioOpen: 80, radioClose: 80, laser: 45, scan: 200,
  };
  const DECORATIVE = new Set(["uiHover", "uiSlider", "typeKey", "footstep", "thrusterBurst", "rcsPuff", "key"]);

  const SCENES = {
    //            air  wind drone pad   air-lowpass
    menu:    { air: 0.12, wind: 0.0, drone: 0.55, pad: 1.0, lp: 700 },
    station: { air: 1.0,  wind: 0.0, drone: 0.7,  pad: 0.1, lp: 520 },
    ground:  { air: 0.04, wind: 1.0, drone: 0.25, pad: 0.0, lp: 520 },
    space:   { air: 0.12, wind: 0.0, drone: 0.9,  pad: 0.25, lp: 240 },
    launch:  { air: 0.08, wind: 0.2, drone: 0.15, pad: 0.0, lp: 400 },
  };

  function loadSettings() {
    const s = Object.assign({}, DEFAULTS);
    try {
      const raw = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        ["master", "sfx", "ui", "ambience"].forEach((k) => {
          if (typeof p[k] === "number" && isFinite(p[k])) s[k] = clamp(p[k], 0, 1);
        });
        s.muted = !!p.muted;
      }
    } catch (e) { /* storage unavailable */ }
    return s;
  }

  // ==========================================================================
  // SOUND LIBRARY  — every entry is (engine, options, startTime)
  // Levels are pre-master; the limiter and bus volumes sit after these.
  // ==========================================================================
  const SOUNDS = {
    // ---------------------------------------------------------------- UI ----
    uiHover(e, o, t) {
      const f = 2300 * jit(0.05);
      e.tone({ t, f, f2: f * 0.92, dur: 0.04, vol: 0.03, a: 0.002, bus: "ui" });
    },

    uiClick(e, o, t) {
      const f = 1250 * jit(0.04);
      e.tone({ t, f, f2: f * 0.7, dur: 0.075, vol: 0.16, a: 0.002, bus: "ui", send: 0.1 });
      e.noise({ t, dur: 0.014, vol: 0.05, filter: "highpass", f: 4500, a: 0.0008, bus: "ui" });
      e.bell({ t, f: f * 2, ratio: 2, index: 0.35, dur: 0.22, vol: 0.03, bus: "ui", send: 0.25 });
    },

    uiTab(e, o, t) {
      const f = penta(7 + ((o.i | 0) % 6));
      e.bell({ t, f, ratio: 2, index: 0.5, dur: 0.22, vol: 0.085, bus: "ui", send: 0.22 });
      e.noise({ t, dur: 0.012, vol: 0.04, filter: "highpass", f: 5000, a: 0.0008, bus: "ui" });
    },

    uiConfirm(e, o, t) {
      e.bell({ t, f: N.D5, ratio: 2, index: 1.2, dur: 0.6, vol: 0.12, bus: "ui", send: 0.3 });
      e.bell({ t: t + 0.075, f: N.A5, ratio: 2, index: 1.2, dur: 1.0, vol: 0.13, bus: "ui", send: 0.38 });
      e.thump({ t, f: 240, f2: 120, dur: 0.14, vol: 0.08, bus: "ui" });
    },

    uiBack(e, o, t) {
      e.bell({ t, f: N.A5, ratio: 2, index: 0.8, dur: 0.3, vol: 0.085, bus: "ui", send: 0.2 });
      e.bell({ t: t + 0.065, f: N.D5, ratio: 2, index: 0.8, dur: 0.45, vol: 0.095, bus: "ui", send: 0.25 });
    },

    uiOpen(e, o, t) {
      e.noise({ t, dur: 0.32, color: "pink", filter: "bandpass", f: 500, f2: 3200, q: 0.9, vol: 0.075, shape: "swell", a: 0.13, r: 0.15, bus: "ui" });
      e.bell({ t: t + 0.11, f: N.A5, ratio: 2, index: 0.9, dur: 0.7, vol: 0.085, bus: "ui", send: 0.4 });
      e.bell({ t: t + 0.17, f: N.E6, ratio: 2, index: 0.9, dur: 0.9, vol: 0.06, bus: "ui", send: 0.45 });
    },

    uiClose(e, o, t) {
      e.noise({ t, dur: 0.26, color: "pink", filter: "bandpass", f: 3000, f2: 450, q: 0.9, vol: 0.06, shape: "swell", a: 0.06, r: 0.16, bus: "ui" });
      e.bell({ t: t + 0.02, f: N.E5, ratio: 2, index: 0.7, dur: 0.4, vol: 0.075, bus: "ui", send: 0.25 });
    },

    uiToggleOn(e, o, t) {
      e.bell({ t, f: N.E5, ratio: 2, index: 0.8, dur: 0.22, vol: 0.09, bus: "ui", send: 0.2 });
      e.bell({ t: t + 0.055, f: N.B5, ratio: 2, index: 0.8, dur: 0.36, vol: 0.1, bus: "ui", send: 0.28 });
    },

    uiToggleOff(e, o, t) {
      e.bell({ t, f: N.B5 * 0.75, ratio: 2, index: 0.5, dur: 0.18, vol: 0.075, bus: "ui", send: 0.15 });
      e.bell({ t: t + 0.055, f: N.E5 * 0.75, ratio: 2, index: 0.5, dur: 0.28, vol: 0.08, bus: "ui", send: 0.2 });
    },

    uiSlider(e, o, t) {
      const v = clamp(o.v == null ? 0.5 : o.v, 0, 1);
      const f = penta(5 + Math.round(v * 10));
      e.tone({ t, f, dur: 0.06, vol: 0.09, a: 0.002, bus: "ui", send: 0.15 });
      e.noise({ t, dur: 0.008, vol: 0.025, filter: "highpass", f: 5000, a: 0.0005, bus: "ui" });
    },

    uiCopy(e, o, t) {
      [N.D6, N.Fs6, N.A6].forEach((f, i) => e.bell({ t: t + i * 0.045, f, ratio: 2, index: 0.6, dur: 0.34, vol: 0.055, bus: "ui", send: 0.35 }));
    },

    deny(e, o, t) {
      // Soft, rounded "not now": two muted triangle notes falling a fifth.
      e.tone({ t, f: 392, type: "triangle", dur: 0.14, vol: 0.12, a: 0.004, lp: 1400, bus: "ui", send: 0.12 });
      e.tone({ t: t + 0.11, f: 261.63, type: "triangle", dur: 0.22, vol: 0.12, a: 0.004, lp: 1000, bus: "ui", send: 0.15 });
      e.thump({ t: t + 0.11, f: 130, f2: 70, dur: 0.12, vol: 0.09, bus: "ui" });
    },

    uiNotify(e, o, t) {
      e.bell({ t, f: N.E5, ratio: 2, index: 0.9, dur: 0.45, vol: 0.1, bus: "ui", send: 0.35 });
      e.bell({ t: t + 0.09, f: N.B5, ratio: 2, index: 0.9, dur: 0.8, vol: 0.11, bus: "ui", send: 0.4 });
    },

    typeKey(e, o, t) {
      const r = jit(0.1);
      const down = o.down !== false;
      e.tone({ t, f: (down ? 540 : 430) * r, f2: 300 * r, dur: 0.035, vol: down ? 0.07 : 0.04, a: 0.001, bus: "ui" });
      e.noise({ t, dur: 0.016, vol: down ? 0.04 : 0.02, filter: "lowpass", f: 3200 * r, a: 0.0008, bus: "ui" });
    },

    chatSend(e, o, t) {
      e.noise({ t, dur: 0.16, color: "pink", filter: "bandpass", f: 900, f2: 4200, q: 0.8, vol: 0.05, shape: "swell", a: 0.07, r: 0.08, bus: "ui" });
      e.bell({ t: t + 0.05, f: N.A5, ratio: 2, index: 0.7, dur: 0.4, vol: 0.09, bus: "ui", send: 0.3 });
    },

    chatReceive(e, o, t) {
      e.bell({ t, f: N.Fs5, ratio: 2, index: 0.8, dur: 0.35, vol: 0.08, bus: "ui", send: 0.3 });
      e.bell({ t: t + 0.08, f: N.D6, ratio: 2, index: 0.8, dur: 0.6, vol: 0.085, bus: "ui", send: 0.35 });
    },

    pop(e, o, t) {
      e.tone({ t, f: 420, f2: 940, dur: 0.1, vol: 0.12, a: 0.003, bus: "ui", send: 0.15 });
      e.bell({ t: t + 0.03, f: N.A5, ratio: 2, index: 0.5, dur: 0.3, vol: 0.05, bus: "ui", send: 0.3 });
    },

    // ------------------------------------------------------------ SOCIAL ----
    join(e, o, t) {
      [N.D5, N.Fs5, N.A5].forEach((f, i) => e.bell({ t: t + i * 0.085, f, ratio: 2, index: 0.9, dur: 0.75, vol: 0.1, bus: "ui", send: 0.38 }));
      e.pad({ t, notes: [N.D4, N.A4], dur: 0.9, vol: 0.05, a: 0.25, r: 0.5, lp: 700, type: "sine", bus: "ui", send: 0.3 });
    },

    leave(e, o, t) {
      [N.A5, N.Fs5, N.D5].forEach((f, i) => e.bell({ t: t + i * 0.085, f, ratio: 2, index: 0.6, dur: 0.45, vol: 0.075, bus: "ui", send: 0.3 }));
    },

    // ------------------------------------------------------------- COMMS ----
    radioOpen(e, o, t) {
      e.tone({ t, f: 2525, dur: 0.11, vol: 0.2, a: 0.004, bus: "comms" });
      e.noise({ t: t + 0.07, dur: 0.08, vol: 0.06, filter: "bandpass", f: 2200, q: 0.7, a: 0.004, bus: "comms" });
    },

    radioClose(e, o, t) {
      e.tone({ t, f: 2475, dur: 0.1, vol: 0.2, a: 0.004, bus: "comms" });
      e.noise({ t: t + 0.06, dur: 0.14, vol: 0.08, filter: "bandpass", f: 1900, f2: 900, q: 0.7, a: 0.004, bus: "comms" });
    },

    // ----------------------------------------------------------- MISSION ----
    taskComplete(e, o, t) {
      [N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => e.bell({ t: t + i * 0.075, f, ratio: 2, index: 1.1, dur: 1.2, vol: 0.115, bus: "sfx", send: 0.42 }));
      e.bell({ t: t + 0.3, f: N.D7, ratio: 3.01, index: 0.5, dur: 1.1, vol: 0.03, bus: "sfx", send: 0.5 });
      e.pad({ t, notes: [N.D3, N.A3], dur: 1.2, vol: 0.07, a: 0.2, r: 0.7, lp: 600, type: "sine", bus: "sfx", send: 0.3 });
      e.noise({ t, dur: 0.34, color: "pink", filter: "bandpass", f: 800, f2: 5000, q: 0.7, vol: 0.035, shape: "swell", a: 0.18, r: 0.14, bus: "sfx" });
    },

    success(e, o, t) {
      [N.Fs5, N.A5, N.D6].forEach((f, i) => e.bell({ t: t + i * 0.1, f, ratio: 2, index: 1.0, dur: 0.9, vol: 0.12, bus: "sfx", send: 0.4 }));
      e.bell({ t: t + 0.3, f: N.A6, ratio: 3.01, index: 0.4, dur: 0.9, vol: 0.03, bus: "sfx", send: 0.5 });
    },

    missionStart(e, o, t) {
      e.thump({ t, f: 95, f2: 32, dur: 1.1, vol: 0.34, bus: "sfx", send: 0.3 });
      e.noise({ t, dur: 1.9, color: "pink", filter: "bandpass", f: 180, f2: 2600, q: 0.6, vol: 0.12, shape: "swell", a: 1.1, r: 0.6, bus: "sfx", send: 0.2 });
      e.pad({ t, notes: [N.D3, N.A3, N.D4, N.Fs4], dur: 2.9, vol: 0.2, a: 1.0, r: 1.2, lp: 500, lp2: 1800, type: "sawtooth", bus: "sfx", send: 0.4 });
      [[N.D5, 1.0], [N.A5, 1.14], [N.D6, 1.28]].forEach(([f, d]) => e.bell({ t: t + d, f, ratio: 2, index: 1.2, dur: 1.8, vol: 0.12, bus: "sfx", send: 0.5 }));
    },

    victory(e, o, t) {
      e.thump({ t, f: 110, f2: 28, dur: 1.5, vol: 0.4, bus: "sfx", send: 0.3 });
      e.pad({ t: t + 0.05, notes: [N.D3, N.A3, N.D4, N.Fs4, N.A4], dur: 4.8, vol: 0.22, a: 0.7, r: 2.2, lp: 700, lp2: 2400, type: "sawtooth", bus: "sfx", send: 0.45 });
      for (let i = 0; i < 9; i++) e.bell({ t: t + 0.25 + i * 0.12, f: penta(5 + i), ratio: 2, index: 1.0, dur: 1.4, vol: 0.075 + i * 0.006, bus: "sfx", send: 0.5 });
      [N.D6, N.A6, N.Fs6].forEach((f, i) => e.bell({ t: t + 1.45 + i * 0.05, f, ratio: 2, index: 1.0, dur: 2.4, vol: 0.1, bus: "sfx", send: 0.6 }));
      for (let i = 0; i < 8; i++) e.bell({ t: t + 1.8 + rnd(0, 1.8), f: penta(10 + Math.floor(rnd(0, 6))), ratio: 3.01, index: 0.4, dur: 0.9, vol: 0.022, bus: "sfx", send: 0.6, pan: rnd(-0.7, 0.7) });
    },

    defeat(e, o, t) {
      [N.D4, N.A3, N.D3 * 0.89].forEach((f, i) => e.tone({ t: t + i * 0.28, f, type: "triangle", dur: 1.0, vol: 0.16, a: 0.01, lp: 900, bus: "sfx", send: 0.35 }));
      e.thump({ t: t + 0.55, f: 80, f2: 28, dur: 1.2, vol: 0.28, bus: "sfx" });
      e.pad({ t, notes: [N.D3, N.A3 * 0.944], dur: 2.0, vol: 0.12, a: 0.3, r: 1.2, lp: 400, type: "sawtooth", bus: "sfx", send: 0.3 });
    },

    countdown(e, o, t) {
      e.tone({ t, f: 1000, dur: 0.1, vol: 0.22, a: 0.003, bus: "sfx", send: 0.15 });
      e.bell({ t, f: 2000, ratio: 2, index: 0.3, dur: 0.12, vol: 0.04, bus: "sfx" });
    },

    liftoffGo(e, o, t) {
      [N.A5, N.D6, N.Fs6].forEach((f) => e.bell({ t, f, ratio: 2, index: 1.0, dur: 1.3, vol: 0.12, bus: "sfx", send: 0.4 }));
      e.thump({ t, f: 100, f2: 40, dur: 0.5, vol: 0.25, bus: "sfx" });
    },

    alarm(e, o, t) {
      // True master alarm: two-tone klaxon (used for real emergencies only).
      for (let i = 0; i < 4; i++) {
        const f = i % 2 ? 660 : 880;
        e.tone({ t: t + i * 0.2, f, type: "triangle", dur: 0.19, vol: 0.14, a: 0.01, lp: 2600, bus: "sfx", send: 0.1 });
        e.tone({ t: t + i * 0.2, f: f * 2, type: "sine", dur: 0.19, vol: 0.04, a: 0.01, bus: "sfx" });
      }
      e.thump({ t, f: 90, f2: 50, dur: 0.2, vol: 0.12, bus: "sfx" });
    },

    caution(e, o, t) {
      e.tone({ t, f: 880, type: "triangle", dur: 0.13, vol: 0.16, a: 0.005, lp: 2400, bus: "sfx", send: 0.1 });
      e.bell({ t: t + 0.01, f: 1320, ratio: 2, index: 0.4, dur: 0.2, vol: 0.05, bus: "sfx" });
    },

    // ----------------------------------------------------------- MACHINES ---
    thrusterBurst(e, o, t) {
      const d = clamp(o.dur || 0.22, 0.05, 1.2);
      e.noise({ t, dur: d, filter: "bandpass", f: 1100 * jit(0.1), f2: 600, q: 1.1, vol: 0.18, a: 0.014, bus: "sfx", send: 0.08 });
      e.noise({ t, dur: d * 1.1, color: "pink", filter: "lowpass", f: 420, vol: 0.14, a: 0.02, bus: "sfx" });
    },

    rcsPuff(e, o, t) {
      e.noise({ t, dur: 0.14, filter: "bandpass", f: 1500 * jit(0.15), f2: 800, q: 1.2, vol: 0.14, a: 0.01, bus: "sfx", pan: rnd(-0.4, 0.4) });
    },

    airlock(e, o, t) {
      // Hatch: latch release, servo, pneumatic hiss, then a heavy seal.
      e.metal({ t, f: 210, dur: 0.5, vol: 0.14, bus: "sfx", send: 0.2 });
      e.tone({ t: t + 0.04, f: 95, f2: 150, type: "sawtooth", dur: 0.42, vol: 0.05, lp: 320, shape: "swell", a: 0.12, r: 0.15, bus: "sfx" });
      e.noise({ t: t + 0.16, dur: 0.75, filter: "highpass", f: 3000, f2: 1800, vol: 0.07, a: 0.025, bus: "sfx", send: 0.12 });
      e.noise({ t: t + 0.16, dur: 0.7, color: "pink", filter: "bandpass", f: 1300, f2: 700, q: 0.6, vol: 0.06, a: 0.03, bus: "sfx" });
      e.thump({ t: t + 0.55, f: 85, f2: 40, dur: 0.3, vol: 0.22, bus: "sfx" });
      e.metal({ t: t + 0.55, f: 140, dur: 0.45, vol: 0.12, bus: "sfx", send: 0.2 });
    },

    dockingLock(e, o, t) {
      e.thump({ t, f: 90, f2: 28, dur: 0.45, vol: 0.38, bus: "sfx", send: 0.15 });
      e.metal({ t, f: 180, dur: 0.8, vol: 0.28, bus: "sfx", send: 0.3 });
      e.metal({ t: t + 0.1, f: 245, dur: 0.6, vol: 0.2, bus: "sfx", send: 0.3 });
      e.noise({ t: t + 0.2, dur: 0.5, filter: "highpass", f: 3200, vol: 0.05, a: 0.02, bus: "sfx" });
      [N.A4, N.E5].forEach((f, i) => e.bell({ t: t + 0.45 + i * 0.07, f, ratio: 2, index: 0.8, dur: 1.0, vol: 0.07, bus: "sfx", send: 0.45 }));
    },

    dockingLatch(e, o, t) {
      [0, 0.1].forEach((d, i) => {
        e.metal({ t: t + d, f: i ? 250 : 190, dur: 0.55, vol: 0.28, bus: "sfx", send: 0.25 });
        e.thump({ t: t + d, f: 130, f2: 55, dur: 0.12, vol: 0.2, bus: "sfx" });
      });
      e.noise({ t: t + 0.22, dur: 0.7, filter: "highpass", f: 3000, f2: 1800, vol: 0.06, a: 0.03, bus: "sfx" });
      [N.D5, N.A5].forEach((f, i) => e.bell({ t: t + 0.5 + i * 0.08, f, ratio: 2, index: 0.8, dur: 1.1, vol: 0.075, bus: "sfx", send: 0.45 }));
    },

    laser(e, o, t) {
      e.tone({ t, f: 2400, f2: 170, type: "sawtooth", dur: 0.24, vol: 0.12, a: 0.002, lp: 7000, lp2: 700, bus: "sfx", send: 0.25 });
      e.tone({ t, f: 1150, f2: 85, type: "sine", dur: 0.26, vol: 0.12, a: 0.002, bus: "sfx" });
      e.noise({ t, dur: 0.06, filter: "highpass", f: 5500, vol: 0.05, a: 0.001, bus: "sfx" });
    },

    wormhole(e, o, t) {
      e.noise({ t, dur: 1.5, color: "pink", filter: "bandpass", f: 150, f2: 4500, q: 0.7, vol: 0.14, shape: "swell", a: 1.0, r: 0.4, bus: "sfx", send: 0.3 });
      e.pad({ t, notes: [55, 110, 165], dur: 1.6, vol: 0.2, a: 1.1, r: 0.4, lp: 200, lp2: 4200, type: "sawtooth", detune: 12, bus: "sfx", send: 0.3 });
      e.thump({ t: t + 1.22, f: 120, f2: 22, dur: 1.9, vol: 0.5, bus: "sfx", send: 0.3 });
      [N.D6, N.A6, N.Fs6].forEach((f, i) => e.bell({ t: t + 1.25 + i * 0.07, f, ratio: 2, index: 1.0, dur: 2.0, vol: 0.09, bus: "sfx", send: 0.6 }));
    },

    warpSpool(e, o, t) {
      e.tone({ t, f: 110, f2: 1450, dur: 2.1, vol: 0.13, shape: "swell", a: 1.5, r: 0.5, bus: "sfx", send: 0.3 });
      e.tone({ t, f: 55, f2: 725, type: "sawtooth", dur: 2.1, vol: 0.06, lp: 300, lp2: 3000, shape: "swell", a: 1.5, r: 0.5, bus: "sfx" });
      e.noise({ t, dur: 2.1, color: "pink", filter: "highpass", f: 400, f2: 5000, vol: 0.06, shape: "swell", a: 1.6, r: 0.5, bus: "sfx" });
    },

    scan(e, o, t) {
      [5, 7, 9, 11, 14].forEach((p, i) => e.bell({ t: t + i * 0.07, f: penta(p), ratio: 2, index: 0.7, dur: 0.6, vol: 0.075, bus: "sfx", send: 0.45 }));
    },

    stagingSeparation(e, o, t) {
      e.noise({ t, dur: 0.38, filter: "lowpass", f: 4200, f2: 280, q: 0.7, vol: 0.5, a: 0.001, bus: "sfx", send: 0.2 });
      e.thump({ t, f: 120, f2: 24, dur: 0.75, vol: 0.5, bus: "sfx", send: 0.15 });
      e.metal({ t, f: 95, dur: 0.9, vol: 0.2, bus: "sfx", send: 0.3 });
      for (let i = 0; i < 7; i++) e.noise({ t: t + rnd(0.08, 0.5), dur: 0.03, filter: "bandpass", f: rnd(2200, 4200), q: 2, vol: 0.06, a: 0.0006, bus: "sfx", pan: rnd(-0.6, 0.6) });
    },

    satelliteDeploy(e, o, t) {
      e.noise({ t, dur: 0.26, filter: "bandpass", f: 750, f2: 400, q: 1, vol: 0.15, a: 0.008, bus: "sfx", send: 0.15 });
      e.tone({ t, f: 430, f2: 250, type: "triangle", dur: 0.32, vol: 0.14, lp: 1800, bus: "sfx" });
      e.metal({ t: t + 0.02, f: 260, dur: 0.4, vol: 0.12, bus: "sfx", send: 0.3 });
      e.bell({ t: t + 0.18, f: N.D6, ratio: 2, index: 0.7, dur: 1.6, vol: 0.075, bus: "sfx", send: 0.5 });
    },

    ignition(e, o, t) {
      e.thump({ t, f: 62, f2: 33, dur: 1.3, vol: 0.42, bus: "sfx", send: 0.2 });
      e.noise({ t, dur: 1.6, color: "brown", filter: "lowpass", f: 140, f2: 700, q: 1, vol: 0.5, shape: "swell", a: 0.5, r: 0.7, bus: "sfx", send: 0.15 });
      for (let i = 0; i < 14; i++) e.noise({ t: t + rnd(0.05, 1.3), dur: 0.04, filter: "bandpass", f: rnd(1400, 3800), q: 1.5, vol: 0.07, a: 0.0006, bus: "sfx", pan: rnd(-0.7, 0.7) });
    },

    callout(e, o, t) {
      [0, 0.17].forEach((d) => e.tone({ t: t + d, f: 1040, dur: 0.1, vol: 0.085, a: 0.004, bus: "sfx", send: 0.12 }));
    },

    servo(e, o, t) {
      const d = clamp(o.dur || 0.8, 0.2, 3);
      e.tone({ t, f: 115, f2: 170, type: "sawtooth", dur: d, vol: 0.06, lp: 520, shape: "swell", a: d * 0.25, r: d * 0.3, bus: "sfx" });
      e.noise({ t, dur: d, filter: "bandpass", f: 650, f2: 900, q: 1.2, vol: 0.035, shape: "swell", a: d * 0.25, r: d * 0.3, bus: "sfx" });
      e.metal({ t: t + d, f: 180, dur: 0.35, vol: 0.1, bus: "sfx", send: 0.2 });
    },

    gearDeploy(e, o, t) {
      SOUNDS.servo(e, { dur: 0.55 }, t);
      e.noise({ t: t + 0.1, dur: 0.5, filter: "highpass", f: 2800, vol: 0.05, a: 0.03, bus: "sfx" });
      e.thump({ t: t + 0.6, f: 95, f2: 38, dur: 0.3, vol: 0.34, bus: "sfx", send: 0.1 });
      e.metal({ t: t + 0.6, f: 120, dur: 0.5, vol: 0.14, bus: "sfx", send: 0.2 });
    },

    touchdown(e, o, t) {
      e.thump({ t, f: 80, f2: 32, dur: 0.38, vol: 0.46, bus: "sfx" });
      e.noise({ t, dur: 0.6, color: "brown", filter: "lowpass", f: 320, vol: 0.26, a: 0.003, bus: "sfx" });
      e.noise({ t: t + 0.02, dur: 0.55, filter: "bandpass", f: 2300, f2: 1500, q: 3, vol: 0.1, shape: "swell", a: 0.03, r: 0.3, bus: "sfx", pan: -0.2 });
      e.noise({ t: t + 0.1, dur: 1.7, color: "brown", filter: "lowpass", f: 210, vol: 0.13, shape: "swell", a: 0.2, r: 1.1, bus: "sfx" });
    },

    footstep(e, o, t) {
      const r = jit(0.1);
      const side = o.step ? 0.15 : -0.15;
      if (o.surface === "ground") {
        e.noise({ t, dur: 0.1, filter: "lowpass", f: 1300 * r, vol: 0.16, a: 0.002, bus: "sfx", pan: side });
        e.noise({ t, dur: 0.035, filter: "highpass", f: 3200, vol: 0.05, a: 0.001, bus: "sfx", pan: side });
        e.thump({ t, f: 115 * r, f2: 70, dur: 0.08, vol: 0.12, bus: "sfx", pan: side });
      } else {
        e.thump({ t, f: 155 * r, f2: 90, dur: 0.075, vol: 0.18, bus: "sfx", pan: side });
        e.tone({ t, f: 720 * r, f2: 560 * r, dur: 0.1, vol: 0.045, a: 0.001, bus: "sfx", pan: side, send: 0.12 });
        e.noise({ t, dur: 0.02, filter: "bandpass", f: 2000 * r, q: 1, vol: 0.05, a: 0.001, bus: "sfx", pan: side });
      }
    },

    // "Creamy" keyboard: low round thock + short dark noise burst (Shuttle controls).
    key(e, o, t) {
      const r = 0.92 + Math.random() * 0.16;
      const down = o.down !== false;
      e.tone({ t, f: (down ? 170 : 130) * r, f2: (down ? 95 : 80) * r, dur: down ? 0.07 : 0.05, vol: down ? 0.22 : 0.1, a: 0.004, bus: "sfx" });
      e.noise({ t, dur: down ? 0.03 : 0.02, vol: down ? 0.12 : 0.05, filter: "lowpass", f: 1500 * r, q: 0.8, a: 0.001, bus: "sfx" });
    },
  };
  SOUNDS.stageSep = SOUNDS.stagingSeparation;
  SOUNDS.release = SOUNDS.satelliteDeploy;
  SOUNDS.masterAlarm = SOUNDS.alarm;
  SOUNDS.notify = SOUNDS.uiNotify;

  // ==========================================================================
  // ENGINE
  // ==========================================================================
  class SpaceAudioEngine {
    constructor(opts) {
      opts = opts || {};
      this.headless = !!opts.headless;
      this.settings = this.headless ? Object.assign({}, DEFAULTS) : loadSettings();
      this.ctx = null;
      this.masterGain = null;
      this.limiter = null;
      this.buses = {};
      this.initialized = false;
      this.scene = "menu";
      this._gesture = false;
      this._voices = 0;
      this._noise = {};
      this._last = {};
      this._call = null;
      this._roar = null;
      this._amb = null;
      this._uiClickAt = 0;

      if (!this.headless) {
        this._installGestureUnlock();
        this._installUiBindings();
        this._whenDomReady(() => this.bindSettingsUI());
      }
    }

    get isMuted() { return !!this.settings.muted; }
    names() { return Object.keys(SOUNDS); }

    // ---------------------------------------------------------- lifecycle ---
    /** Backwards-compatible entry point. Safe to call any time; builds the
     *  graph as soon as the browser has seen a user gesture. */
    init() {
      if (this.initialized) return true;
      if (!this._gesture) return false;
      return this.ensure();
    }

    ensure() {
      if (this.initialized) {
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        this.attach(new AC({ latencyHint: "interactive" }));
      } catch (err) {
        console.warn("[SFX] audio context failed", err);
        return false;
      }
      return true;
    }

    resume() {
      if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    }

    /** Build the whole mix graph on any BaseAudioContext (real or offline). */
    attach(ctx, opt) {
      opt = opt || {};
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this._master();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 10;
      limiter.ratio.value = 14;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.2;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      this.masterGain = master;
      this.limiter = limiter;

      // Shared room reverb.
      const conv = ctx.createConvolver();
      conv.buffer = this._makeImpulse(2.4);
      const revIn = ctx.createGain();
      const revOut = ctx.createGain();
      revOut.gain.value = 0.55;
      revIn.connect(conv);
      conv.connect(revOut);
      revOut.connect(master);
      this.reverbIn = revIn;

      this.buses = {};
      ["ui", "sfx", "comms", "ambience"].forEach((name) => {
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        dry.connect(master);
        wet.connect(revIn);
        this.buses[name] = { dry, wet };
      });
      this._applyBusVolumes(true);

      this.initialized = true;
      if (opt.gesture) this._gesture = true;
      if (opt.ambience !== false && !this.headless) {
        this._startAmbience();
        this._startSceneWatcher();
      }
      return this;
    }

    // ----------------------------------------------------------- settings ---
    _master() { return this.settings.muted ? 0 : Math.pow(this.settings.master, 2); }

    _applyMaster() {
      if (!this.masterGain) return;
      this.masterGain.gain.setTargetAtTime(this._master(), this.ctx.currentTime, 0.03);
    }

    _applyBusVolumes(immediate) {
      if (!this.ctx) return;
      const s = this.settings;
      const vols = { ui: s.ui, sfx: s.sfx, comms: s.sfx, ambience: s.ambience };
      const t = this.ctx.currentTime;
      const tc = immediate ? 0.001 : 0.03;
      Object.keys(vols).forEach((k) => {
        const v = Math.pow(vols[k], 2) * BUS_TRIM[k];
        this.buses[k].dry.gain.setTargetAtTime(v, t, tc);
        this.buses[k].wet.gain.setTargetAtTime(v, t, tc);
      });
    }

    _save() {
      if (this.headless) return;
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch (e) { /* ignore */ }
    }

    setVolume(key, v) {
      if (!(key in DEFAULTS) || key === "muted") return;
      this.settings[key] = clamp(Number(v) || 0, 0, 1);
      this._save();
      if (key === "master") this._applyMaster(); else this._applyBusVolumes();
    }

    setMuted(m) {
      this.settings.muted = !!m;
      this._save();
      this._applyMaster();
      this._syncSettingsUI();
      return this.settings.muted;
    }

    toggleMute() { return this.setMuted(!this.settings.muted); }

    // ------------------------------------------------------------- gating ---
    _ready() {
      if (!this.initialized && !(this._gesture && this.ensure())) return false;
      if (!this._gesture) return false;
      if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
      return !this.settings.muted;
    }

    _T(o) { return (o && o.at != null ? o.at : this.ctx.currentTime) + 0.012; }

    play(name, o) {
      const fn = SOUNDS[name];
      if (!fn || !this._ready()) return false;
      o = o || {};
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const gap = GAP[name] || 0;
      if (gap && now - (this._last[name] || 0) < gap) return false;
      if (this._voices > VOICE_HARD_CAP) return false;
      if (this._voices > VOICE_SOFT_CAP && DECORATIVE.has(name)) return false;
      this._last[name] = now;

      const prev = this._call;
      this._call = (o.vol != null && o.vol !== 1) || o.pan ? { vol: o.vol == null ? 1 : o.vol, pan: o.pan || 0, nodes: {} } : null;
      try {
        fn(this, o, this._T(o));
      } catch (err) {
        console.warn("[SFX] " + name + " failed", err);
      } finally {
        this._call = prev;
      }
      return true;
    }

    // ---------------------------------------------------------- primitives ---
    _track(node) {
      this._voices++;
      node.onended = () => { this._voices = Math.max(0, this._voices - 1); };
    }

    _route(node, o) {
      const c = this.ctx;
      const busName = o.bus || "sfx";
      const bus = this.buses[busName];
      let n = node;
      if (o.pan && c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = clamp(o.pan, -1, 1);
        n.connect(p);
        n = p;
      }
      let dry = bus.dry;
      let wet = bus.wet;
      if (this._call) {
        const call = this._call;
        let ent = call.nodes[busName];
        if (!ent) {
          const d = c.createGain();
          const w = c.createGain();
          d.gain.value = call.vol;
          w.gain.value = call.vol;
          let dOut = d;
          let wOut = w;
          if (call.pan && c.createStereoPanner) {
            const pd = c.createStereoPanner();
            const pw = c.createStereoPanner();
            pd.pan.value = pw.pan.value = clamp(call.pan, -1, 1);
            d.connect(pd);
            w.connect(pw);
            dOut = pd;
            wOut = pw;
          }
          dOut.connect(bus.dry);
          wOut.connect(bus.wet);
          ent = call.nodes[busName] = { d, w };
        }
        dry = ent.d;
        wet = ent.w;
      }
      n.connect(dry);
      if (o.send > 0) {
        const s = c.createGain();
        s.gain.value = o.send;
        n.connect(s);
        s.connect(wet);
      }
    }

    _env(param, t, dur, vol, o) {
      const a = Math.max(0.001, o.a == null ? 0.005 : o.a);
      param.setValueAtTime(0.0001, t);
      if (o.shape === "swell") {
        const r = Math.min(o.r == null ? dur * 0.35 : o.r, Math.max(0.002, dur - a));
        param.linearRampToValueAtTime(vol, t + a);
        param.linearRampToValueAtTime(vol, t + Math.max(a, dur - r));
        param.exponentialRampToValueAtTime(0.0001, t + dur);
      } else {
        param.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
        param.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, dur));
      }
    }

    /** Oscillator with envelope, optional pitch slide + lowpass sweep. */
    tone(o) {
      const c = this.ctx;
      const t = o.t;
      const dur = o.dur;
      const osc = c.createOscillator();
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + dur);
      if (o.detune) osc.detune.value = o.detune;
      const g = c.createGain();
      this._env(g.gain, t, dur, o.vol == null ? 0.2 : o.vol, o);
      let n = osc;
      if (o.lp) {
        const f = c.createBiquadFilter();
        f.type = "lowpass";
        f.Q.value = o.q || 0.7;
        f.frequency.setValueAtTime(o.lp, t);
        if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + dur);
        osc.connect(f);
        n = f;
      }
      n.connect(g);
      this._route(g, o);
      osc.start(t);
      osc.stop(t + dur + 0.05);
      this._track(osc);
    }

    /** Pitch-dropping sine: kicks, impacts, sub booms. */
    thump(o) {
      this.tone(Object.assign({ type: "sine", a: 0.002 }, o));
    }

    /** FM glass bell: sine carrier + decaying modulator + soft octave partial. */
    bell(o) {
      const c = this.ctx;
      const t = o.t;
      const f = o.f;
      const dur = o.dur || 1;
      const vol = o.vol == null ? 0.12 : o.vol;
      const car = c.createOscillator();
      car.type = "sine";
      car.frequency.setValueAtTime(f, t);
      const mod = c.createOscillator();
      mod.type = "sine";
      mod.frequency.setValueAtTime(f * (o.ratio || 2), t);
      const mg = c.createGain();
      const idx = (o.index == null ? 1 : o.index) * f;
      mg.gain.setValueAtTime(Math.max(1, idx), t);
      mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.03), t + dur * 0.55);
      mod.connect(mg);
      mg.connect(car.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      car.connect(g);
      // shimmer partial
      const sh = c.createOscillator();
      sh.type = "sine";
      sh.frequency.setValueAtTime(f * 2.005, t);
      const sg = c.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.22), t + 0.003);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.5);
      sh.connect(sg);
      sg.connect(g);
      this._route(g, o);
      const end = t + dur + 0.05;
      car.start(t); mod.start(t); sh.start(t);
      car.stop(end); mod.stop(end); sh.stop(end);
      this._track(car); this._track(mod); this._track(sh);
    }

    /** Inharmonic partials: struck metal (clamps, latches, hull ring). */
    metal(o) {
      const t = o.t;
      const f = o.f || 200;
      const dur = o.dur || 0.6;
      const vol = o.vol == null ? 0.2 : o.vol;
      const R = [1, 2.76, 5.4, 8.93, 13.34];
      const A = [1, 0.6, 0.38, 0.22, 0.12];
      R.forEach((r, i) => this.tone({
        t, f: f * r * jit(0.01), dur: Math.max(0.05, dur * (1 - i * 0.15)), vol: vol * A[i] * 0.6, a: 0.001, bus: o.bus, pan: o.pan, send: o.send,
      }));
      this.noise({ t, dur: 0.025, vol: vol * 0.55, filter: "bandpass", f: Math.min(9000, f * 8), q: 1, a: 0.0005, bus: o.bus, pan: o.pan });
    }

    /** Detuned-unison pad through a lowpass; the engine's "cinematic" layer. */
    pad(o) {
      const c = this.ctx;
      const t = o.t;
      const dur = o.dur;
      const notes = o.notes || [];
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.Q.value = 0.6;
      f.frequency.setValueAtTime(o.lp || 900, t);
      if (o.lp2) f.frequency.linearRampToValueAtTime(o.lp2, t + dur * 0.7);
      const g = c.createGain();
      const peak = ((o.vol == null ? 0.05 : o.vol) * 1.5) / Math.max(1, notes.length * 2);
      this._env(g.gain, t, dur, peak, { shape: "swell", a: o.a == null ? dur * 0.3 : o.a, r: o.r == null ? dur * 0.4 : o.r });
      notes.forEach((fr) => {
        [-1, 1].forEach((s) => {
          const osc = c.createOscillator();
          osc.type = o.type || "sawtooth";
          osc.frequency.value = fr;
          osc.detune.value = s * (o.detune == null ? 7 : o.detune);
          osc.connect(f);
          osc.start(t);
          osc.stop(t + dur + 0.05);
          this._track(osc);
        });
      });
      f.connect(g);
      this._route(g, o);
    }

    /** Filtered noise with envelope and optional filter sweep. */
    noise(o) {
      const c = this.ctx;
      const t = o.t;
      const dur = o.dur;
      const loop = dur > 3.5;
      const src = this._noiseSource(o.color || "white", loop);
      let n = src;
      if (o.filter) {
        const f = c.createBiquadFilter();
        f.type = o.filter;
        f.Q.value = o.q || 0.8;
        f.frequency.setValueAtTime(o.f || 1000, t);
        if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + dur);
        src.connect(f);
        n = f;
      }
      const g = c.createGain();
      this._env(g.gain, t, dur, o.vol == null ? 0.2 : o.vol, o);
      n.connect(g);
      this._route(g, o);
      const usable = src._usable;
      const off = loop ? rnd(0, usable) : rnd(0, Math.max(0, usable - dur - 0.1));
      src.start(t, off);
      src.stop(t + dur + 0.05);
      this._track(src);
    }

    _makeNoise(color) {
      const c = this.ctx;
      const sr = c.sampleRate;
      const n = Math.floor(sr * 4);
      const buf = c.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (color === "brown") {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.2;
        } else if (color === "pink") {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          d[i] = w;
        }
      }
      // Seam crossfade so looped noise never pops: loop region is [0, n-K).
      const K = Math.floor(sr * NOISE_SEAM);
      for (let i = 0; i < K; i++) {
        const k = i / K;
        d[i] = d[n - K + i] * (1 - k) + d[i] * k;
      }
      return buf;
    }

    _noiseSource(color, loop) {
      const c = this.ctx;
      const key = color + "@" + c.sampleRate;
      let buf = this._noise[key];
      if (!buf) buf = this._noise[key] = this._makeNoise(color);
      const src = c.createBufferSource();
      src.buffer = buf;
      const usable = buf.duration - NOISE_SEAM;
      if (loop) {
        src.loop = true;
        src.loopStart = 0;
        src.loopEnd = usable;
      }
      src._usable = usable;
      return src;
    }

    /** Shared with other modules (e.g. shuttle_sfx) so noise is generated once. */
    loopingNoise(color) { return this._noiseSource(color, true); }

    _makeImpulse(seconds) {
      const c = this.ctx;
      const sr = c.sampleRate;
      const len = Math.floor(sr * seconds);
      const buf = c.createBuffer(2, len, sr);
      const pre = Math.floor(sr * 0.012);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let lp = 0;
        for (let i = pre; i < len; i++) {
          const x = (i - pre) / (len - pre);
          const decay = Math.pow(1 - x, 3.4);
          const k = 0.85 - 0.7 * x; // tail gets progressively darker
          lp += ((Math.random() * 2 - 1) - lp) * k;
          d[i] = lp * decay;
        }
      }
      return buf;
    }

    // ---------------------------------------------------- rocket loop ------
    startRocketRoar(intensity) {
      if (this._roar || !this._ready()) return;
      const c = this.ctx;
      const t = c.currentTime;
      const k = intensity == null ? 1 : intensity;
      const nodes = [];
      const mix = c.createGain();
      const attack = c.createGain();
      const release = c.createGain();
      attack.gain.setValueAtTime(0.0001, t);
      attack.gain.linearRampToValueAtTime(0.5 * k, t + 1.4);
      mix.connect(attack);
      attack.connect(release);
      this._route(release, { bus: "sfx", send: 0.12 });

      const layer = (color, type, freq, q, level, lfoHz, lfoDepth) => {
        const src = this.loopingNoise(color);
        const f = c.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = c.createGain();
        g.gain.value = level;
        src.connect(f); f.connect(g); g.connect(mix);
        src.start(t, rnd(0, 3));
        nodes.push(src);
        if (lfoHz) {
          const lfo = c.createOscillator();
          lfo.frequency.value = lfoHz;
          const lg = c.createGain();
          lg.gain.value = lfoDepth;
          lfo.connect(lg); lg.connect(g.gain);
          lfo.start(t);
          nodes.push(lfo);
        }
      };
      layer("brown", "lowpass", 300, 1.1, 0.95);
      layer("pink", "bandpass", 700, 0.4, 0.28, 8, 0.08);
      layer("white", "highpass", 2600, 0.7, 0.05, 23, 0.04);

      [32, 41].forEach((fr, i) => {
        const o = c.createOscillator();
        o.type = "sine"; o.frequency.value = fr;
        const g = c.createGain();
        g.gain.value = i ? 0.3 : 0.5;
        o.connect(g); g.connect(mix); o.start(t);
        nodes.push(o);
      });
      this._roar = { release, nodes };
    }

    stopRocketRoar(fade) {
      const r = this._roar;
      if (!r || !this.ctx) return;
      this._roar = null;
      const f = fade == null ? 1.5 : fade;
      const t = this.ctx.currentTime;
      r.release.gain.setTargetAtTime(0, t, Math.max(0.05, f / 4));
      r.nodes.forEach((n) => { try { n.stop(t + f * 1.6 + 0.2); } catch (e) { /* already stopped */ } });
    }

    // ------------------------------------------------------- ambience -------
    _startAmbience() {
      if (!this.ctx || this._amb) return;
      const c = this.ctx;
      const t = c.currentTime;
      const out = c.createGain();
      out.gain.value = 1;
      this._route(out, { bus: "ambience", send: 0.25 });
      const L = {};
      const nodes = [];
      const lfo = (hz, depth, target) => {
        const o = c.createOscillator();
        o.frequency.value = hz;
        const g = c.createGain();
        g.gain.value = depth;
        o.connect(g); g.connect(target); o.start(t);
        nodes.push(o);
      };

      // air handling: soft pink noise, slow breathing filter
      const airSrc = this.loopingNoise("pink");
      const airF = c.createBiquadFilter();
      airF.type = "lowpass"; airF.frequency.value = 520; airF.Q.value = 0.5;
      const airG = c.createGain(); airG.gain.value = 0;
      airSrc.connect(airF); airF.connect(airG); airG.connect(out); airSrc.start(t, rnd(0, 3));
      lfo(0.06, 120, airF.frequency);
      nodes.push(airSrc);
      L.air = airG; L.airF = airF;

      // wind: breathing band of pink noise
      const windSrc = this.loopingNoise("pink");
      const windF = c.createBiquadFilter();
      windF.type = "bandpass"; windF.frequency.value = 380; windF.Q.value = 0.6;
      const windG = c.createGain(); windG.gain.value = 0;
      windSrc.connect(windF); windF.connect(windG); windG.connect(out); windSrc.start(t, rnd(0, 3));
      lfo(0.11, 140, windF.frequency);
      nodes.push(windSrc);
      L.wind = windG;

      // drone: D2 / A2 / D3, very soft, beating slightly
      const droneG = c.createGain(); droneG.gain.value = 0; droneG.connect(out);
      [[73.42, 0.5], [110.0 * 1.0017, 0.35], [146.83, 0.22]].forEach(([fr, lv]) => {
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = fr;
        const g = c.createGain(); g.gain.value = lv * 0.1;
        o.connect(g); g.connect(droneG); o.start(t); nodes.push(o);
      });
      L.drone = droneG;

      // pad: A3 E4 F#4 B4 shimmer; each voice drifts on its own slow LFO
      const padG = c.createGain(); padG.gain.value = 0; padG.connect(out);
      [N.A3, N.E4, N.Fs4, N.B4].forEach((fr, i) => {
        [-1, 1].forEach((s) => {
          const o = c.createOscillator(); o.type = "sine"; o.frequency.value = fr; o.detune.value = s * 5;
          const g = c.createGain(); g.gain.value = 0.012;
          o.connect(g); g.connect(padG); o.start(t); nodes.push(o);
          lfo(1 / (7 + i * 2.3 + (s > 0 ? 1.1 : 0)), 0.01, g.gain);
        });
      });
      L.pad = padG;

      this._amb = { out, nodes, L };
      this.setScene(this.scene, true);
    }

    /** Back-compat alias of the old cabin hum starter. */
    startCabinAmbience() { this._startAmbience(); }

    setScene(name, immediate) {
      if (!SCENES[name]) return;
      this.scene = name;
      if (!this._amb) return;
      const s = SCENES[name];
      const L = this._amb.L;
      const t = this.ctx.currentTime;
      const tc = immediate ? 0.05 : 1.4;
      L.air.gain.setTargetAtTime(0.1 * s.air, t, tc);
      L.wind.gain.setTargetAtTime(0.1 * s.wind, t, tc);
      L.drone.gain.setTargetAtTime(s.drone, t, tc);
      L.pad.gain.setTargetAtTime(s.pad, t, tc);
      L.airF.frequency.setTargetAtTime(s.lp, t, tc);
    }

    _detectScene() {
      const w = window;
      if (w.launchCutscene && w.launchCutscene.isPlaying) return "launch";
      if (!w.isGameStarted) return "menu";
      if (w.dockingSim && w.dockingSim.isActive) return "space";
      if (w.solarSystem && w.solarSystem.isActive) return "space";
      if (w.localCrew && w.localCrew.isEva) return "space";
      if (w.spaceCenter && w.spaceCenter.isGroundMode) return "ground";
      return "station";
    }

    _startSceneWatcher() {
      if (this._sceneTimer || typeof setInterval === "undefined") return;
      this._sceneTimer = setInterval(() => {
        const next = this._detectScene();
        if (next !== this.scene) this.setScene(next);
      }, 700);
    }

    // ------------------------------------------------ browser integration ---
    _whenDomReady(fn) {
      if (typeof document === "undefined") return;
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
      else fn();
    }

    _installGestureUnlock() {
      if (typeof window.addEventListener !== "function") return;
      const unlock = () => {
        this._gesture = true;
        if (!this.initialized) this.ensure();
        else if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
      };
      ["pointerdown", "mousedown", "keydown", "touchstart", "touchend", "click"].forEach((ev) => {
        window.addEventListener(ev, unlock, { capture: true, passive: true });
      });
    }

    _installUiBindings() {
      if (typeof document === "undefined" || this._uiBound) return;
      this._uiBound = true;
      const SEL = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], select, summary, input[type="checkbox"], input[type="radio"], .switch-toggle, [data-sfx], .lobby-color-btn, .emote-btn, [onclick]';
      const find = (target) => (target && target.closest ? target.closest(SEL) : null);
      const disabled = (el) => el.disabled || el.getAttribute("aria-disabled") === "true";
      const optOut = (el) => el.dataset && el.dataset.sfx === "none";
      let hovered = null;

      document.addEventListener("pointerover", (ev) => {
        if (ev.pointerType && ev.pointerType !== "mouse") return;
        const el = find(ev.target);
        if (!el || el === hovered) return;
        hovered = el;
        if (disabled(el) || optOut(el)) return;
        const type = (el.type || "").toLowerCase();
        if (type === "range") return;
        this.play("uiHover");
      }, { capture: true, passive: true });

      document.addEventListener("pointerout", (ev) => {
        if (hovered && !hovered.contains(ev.relatedTarget)) hovered = null;
      }, { capture: true, passive: true });

      document.addEventListener("click", (ev) => {
        if (!ev.isTrusted) return;
        const el = find(ev.target);
        if (!el || disabled(el) || optOut(el)) return;
        const now = performance.now();
        if (now - this._uiClickAt < 40) return; // label + input fire two clicks
        const pick = this._classify(el);
        if (pick === "none") return;
        this._uiClickAt = now;
        const idx = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
        this.play(pick, { i: idx });
      }, { capture: true });

      document.addEventListener("input", (ev) => {
        const el = ev.target;
        if (!el || !el.tagName || optOut(el)) return;
        const type = (el.type || "").toLowerCase();
        if (type === "range") {
          const mn = parseFloat(el.min) || 0;
          const mx = parseFloat(el.max);
          const span = (isNaN(mx) ? 100 : mx) - mn || 1;
          this.play("uiSlider", { v: (parseFloat(el.value) - mn) / span });
        } else if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|email|url|tel|password|number)$/.test(type || "text"))) {
          const it = ev.inputType || "";
          if (it.indexOf("insert") === 0) this.play("typeKey", { down: true });
          else if (it.indexOf("delete") === 0) this.play("typeKey", { down: false });
        }
      }, { capture: true, passive: true });

      document.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" || ev.repeat) return;
        const el = ev.target;
        if (el && el.tagName === "INPUT" && /chat/i.test(el.id + " " + el.className) && !optOut(el) && el.value) {
          this._uiClickAt = performance.now();
          this.play("chatSend");
        }
      }, { capture: true, passive: true });
    }

    /** Decide which interface sound an element should make. */
    _classify(el) {
      const ds = el.dataset && el.dataset.sfx;
      if (ds) {
        const alias = { click: "uiClick", confirm: "uiConfirm", back: "uiBack", tab: "uiTab", open: "uiOpen", close: "uiClose", deny: "deny", toggle: "uiToggleOn", notify: "uiNotify" };
        const name = alias[ds] || ds;
        return SOUNDS[name] ? name : "uiClick";
      }
      const type = (el.type || "").toLowerCase();
      if (type === "range") return "none";
      if (type === "checkbox" || el.getAttribute("role") === "switch") {
        const on = typeof el.checked === "boolean" ? el.checked : el.getAttribute("aria-checked") === "true";
        return on ? "uiToggleOn" : "uiToggleOff";
      }
      if (el.classList && el.classList.contains("switch-toggle")) {
        const inp = el.querySelector("input[type=checkbox]");
        if (inp) return inp.checked ? "uiToggleOn" : "uiToggleOff";
      }
      if (type === "radio" || el.tagName === "SELECT") return "uiTab";
      if (el.matches && el.matches('.sys-tab-btn, [role="tab"], [data-tab], .btn-preset, .lobby-color-btn, .title-chip-btn, .emote-btn')) return "uiTab";

      const id = (el.id || "").toLowerCase();
      const cls = typeof el.className === "string" ? el.className.toLowerCase() : "";
      const key = id + " " + cls;
      const txt = (el.textContent || "").trim().toLowerCase();

      if (/copy/.test(key)) return "uiCopy";
      if (/send/.test(key)) return "chatSend";
      if (/close|back|cancel|leave|dismiss|exit/.test(key) || /^(×|✕|✖|x|close|back|cancel|leave|exit)\b/.test(txt)) return "uiBack";
      if (/btn-open|btn-hud|settings|gear|menu|btn-more|btn-telemetry|btn-camera/.test(key)) return "uiOpen";
      if (/primary|start|launch|begin|confirm|join|host|quick-play|next|submit|deploy|accept|academy-start/.test(key)) return "uiConfirm";
      return "uiClick";
    }

    // ----------------------------------------------------- settings panel ---
    bindSettingsUI() {
      if (typeof document === "undefined" || this._settingsBound) return;
      const rows = [
        ["sfx-master-slider", "master", "sfx-master-badge"],
        ["sfx-effects-slider", "sfx", "sfx-effects-badge"],
        ["sfx-ui-slider", "ui", "sfx-ui-badge"],
        ["sfx-ambience-slider", "ambience", "sfx-ambience-badge"],
      ];
      let any = false;
      rows.forEach(([sid, key, bid]) => {
        const el = document.getElementById(sid);
        if (!el) return;
        any = true;
        const badge = document.getElementById(bid);
        el.value = Math.round(this.settings[key] * 100);
        if (badge) badge.textContent = el.value + "%";
        el.addEventListener("input", () => {
          this.setVolume(key, el.value / 100);
          if (badge) badge.textContent = el.value + "%";
        });
      });
      const mute = document.getElementById("btn-sfx-mute");
      if (mute) {
        any = true;
        mute.addEventListener("click", () => { this.toggleMute(); });
      }
      const test = document.getElementById("btn-sfx-test");
      if (test) {
        any = true;
        test.addEventListener("click", () => this.playPreview());
      }
      if (any) { this._settingsBound = true; this._syncSettingsUI(); }
    }

    _syncSettingsUI() {
      if (typeof document === "undefined") return;
      const mute = document.getElementById("btn-sfx-mute");
      if (mute) {
        mute.textContent = this.settings.muted ? "UNMUTE SFX" : "MUTE SFX";
        mute.classList.toggle("active", this.settings.muted);
      }
    }

    playPreview() {
      if (!this._ready()) return;
      this.play("uiConfirm");
      this.play("taskComplete", { at: this.ctx.currentTime + 0.35 });
    }

    // --------------------------------- legacy named helpers (all routed) ----
    playClick() {
      const now = performance.now();
      if (now - this._uiClickAt < 55) return;
      this._uiClickAt = now;
      this.play("uiClick");
    }
    playRadioBeep(intro) { this.play(intro === false ? "radioClose" : "radioOpen"); }
    playThrusterBurst(d) { this.play("thrusterBurst", { dur: d }); }
    playAirlockCycle() { this.play("airlock"); }
    playAlarm(type) { this.play(type === "critical" ? "alarm" : "deny"); }
    playDockingLock() { this.play("dockingLock"); }
    playDockingLatch() { this.play("dockingLatch"); }
    playLaserPulse() { this.play("laser"); }
    playWormholeJump() { this.play("wormhole"); }
    playStagingSeparation() { this.play("stagingSeparation"); }
    playCountdownBeep(isGo) { this.play(isGo ? "liftoffGo" : "countdown"); }
    playWarpSpoolUp() { this.play("warpSpool"); }
    playScanTone() { this.play("scan"); }
    playSatelliteDeploy() { this.play("satelliteDeploy"); }
    playConfirm() { this.play("uiConfirm"); }
    playBack() { this.play("uiBack"); }
    playDeny() { this.play("deny"); }
    playNotify() { this.play("uiNotify"); }
    playSuccess() { this.play("taskComplete"); }
    playVictory() { this.play("victory"); }
    playDefeat() { this.play("defeat"); }
    playMissionStart() { this.play("missionStart"); }
  }

  SpaceAudioEngine.SOUNDS = SOUNDS;
  SpaceAudioEngine.SCENES = SCENES;
  window.SpaceAudioEngine = SpaceAudioEngine;
  window.spaceAudio = new SpaceAudioEngine();
})(window);
