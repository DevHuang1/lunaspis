/*
 * shuttle_sfx.js — procedural sound for the Shuttle mission (Web Audio, no sample files).
 * Continuous layers are driven from the mission snapshot every frame; one-shot cues are fired
 * from mission events and HUD actions. Uses the shared SpaceAudioEngine context when present.
 *
 *   sfx.update(sn, axes, dt)   continuous layers (engines, wind, RCS, OMS)
 *   sfx.event(type)            LIFTOFF, SRB_SEP, MECO, ET_SEP, BAY, RELEASE, GEAR, TOUCHDOWN, FAIL, OK, WARN
 *   sfx.key(down, code)        "creamy" keyboard click
 */
(function () {
  "use strict";
  class ShuttleSfx {
    constructor() { this.ready = false; this.layers = {}; this.lastEng = {}; }
    _ctx() {
      if (this.ready) return this.ctx;
      const sa = window.spaceAudio;
      if (sa && sa.ctx) { this.ctx = sa.ctx; this.out = sa.masterGain; }
      else { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = 0.35; this.out.connect(this.ctx.destination); }
      this.bus = this.ctx.createGain(); this.bus.gain.value = 1; this.bus.connect(this.out);
      this.ready = true; this._buildLayers(); return this.ctx;
    }
    resume() { const c = this._ctx(); if (c && c.state === "suspended") c.resume(); }
    _noise(seconds, color) {
      const c = this.ctx, n = c.sampleRate * seconds, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
      let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (color === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 6; }
        else if (color === "pink") { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
        else d[i] = w;
      }
      return b;
    }
    _layer(name, color, filterType, freq, q) {
      const c = this.ctx, src = c.createBufferSource(); src.buffer = this._noise(3, color); src.loop = true;
      const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = c.createGain(); g.gain.value = 0; src.connect(f); f.connect(g); g.connect(this.bus); src.start();
      this.layers[name] = { src, f, g, target: 0 };
    }
    _buildLayers() {
      this._layer("main", "brown", "lowpass", 220, 1.2);      // SSME roar
      this._layer("srb", "pink", "bandpass", 90, 0.6);         // SRB crackle (low)
      this._layer("crackle", "white", "bandpass", 1800, 0.5);  // SRB crackle (high, modulated)
      this._layer("wind", "pink", "bandpass", 600, 0.4);       // aerodynamic noise
      this._layer("oms", "white", "bandpass", 3200, 1.5);      // OMS hiss
      this._layer("rcs", "white", "highpass", 2500, 0.7);      // RCS jets
      const c = this.ctx, sub = c.createOscillator(); sub.type = "sawtooth"; sub.frequency.value = 36;
      const sf = c.createBiquadFilter(); sf.type = "lowpass"; sf.frequency.value = 65; const sg = c.createGain(); sg.gain.value = 0;
      sub.connect(sf); sf.connect(sg); sg.connect(this.bus); sub.start(); this.sub = sg;
    }
    _set(name, v, tc) { const L = this.layers[name]; if (!L) return; const t = this.ctx.currentTime; L.g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), t, tc || 0.12); }

    update(sn, axes, dt) {
      if (!this._ctx() || !sn) return;
      const v = sn.vehicle, eng = v.eng || {}, t = sn.telemetry, alt = t.altitudeM || 0;
      const air = Math.max(0, Math.min(1, 1 - alt / 70000));           // sound carries only in air (game convention: faint in vacuum)
      const vac = 0.12;                                                  // residual structure-borne level in vacuum
      const carry = vac + (1 - vac) * air;
      const thr = eng.ssme ? (eng.throttle || 1) : 0;
      this._set("main", thr * 0.55 * carry);
      this.sub.gain.setTargetAtTime((thr * 0.5 + (eng.srb ? 0.5 : 0)) * carry * 0.5, this.ctx.currentTime, 0.2);
      const srb = eng.srb && v.cfg && v.cfg.srb ? 1 : 0;
      this._set("srb", srb * 0.7 * carry);
      this.cr = (this.cr || 0) + dt; const mod = 0.5 + 0.5 * Math.sin(this.cr * 37) * Math.sin(this.cr * 11.3);
      this._set("crackle", srb * 0.25 * carry * (0.4 + 0.6 * mod), 0.03);
      const q = t.dynPressPa || 0, wind = Math.min(1, q / 25000);
      this._set("wind", wind * 0.6 + (v.regime === "ground" && (t.airspeedMps || 0) > 5 ? 0.2 : 0));
      if (this.layers.wind) this.layers.wind.f.frequency.setTargetAtTime(300 + 900 * wind, this.ctx.currentTime, 0.3);
      this._set("oms", eng.oms ? 0.35 : 0, 0.05);
      const rcs = v.regime === "orbit" && axes ? Math.min(1, Math.abs(axes.pitch || 0) + Math.abs(axes.yaw || 0) + Math.abs(axes.roll || 0) + Math.abs(axes.tx || 0) + Math.abs(axes.ty || 0) + Math.abs(axes.tz || 0)) : 0;
      this._set("rcs", rcs * 0.22, 0.04);
      // edge-triggered events from state changes
      const E = this.lastEng;
      if (E.srb === false && eng.srb) this.event("LIFTOFF");
      if (E.srb === true && !eng.srb) this.event("SRB_SEP");
      if (E.attached === true && sn.payload && !sn.payload.attached) this.event("RELEASE");
      if (E.ssme === true && !eng.ssme && alt > 50000) this.event("MECO");
      if (E.et === true && !(v.cfg && v.cfg.et)) this.event("ET_SEP");
      if (E.gear !== undefined && E.gear < 1 && v.gear >= 1) this.event("GEAR");
      if (E.regime && E.regime !== "ground" && v.regime === "ground") this.event("TOUCHDOWN");
      if (E.doorsMoving === false && v.doors > 0 && v.doors < 1) this.event("BAY");
      if (E.failure === false && sn.failure) this.event("FAIL");
      if (E.result === false && sn.result && sn.result.success) this.event("OK");
      this.lastEng = { attached: !!(sn.payload && sn.payload.attached), srb: !!eng.srb, ssme: !!eng.ssme, et: !!(v.cfg && v.cfg.et), gear: v.gear, regime: v.regime, doorsMoving: v.doors > 0 && v.doors < 1, failure: !!sn.failure, result: !!sn.result };
    }

    _tone(freq, dur, type, vol, slide) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.05);
    }
    _burst(dur, vol, freq, q, type) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this._noise(Math.max(0.05, dur), "white");
      const f = c.createBiquadFilter(); f.type = type || "bandpass"; f.frequency.value = freq; f.Q.value = q || 1;
      const g = c.createGain(), t = c.currentTime; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.bus); s.start(t); s.stop(t + dur + 0.02);
    }
    event(type) {
      if (!this._ctx()) return;
      switch (type) {
        case "LIFTOFF": this._burst(1.2, 0.5, 120, 0.5, "lowpass"); break;
        case "SRB_SEP": case "ET_SEP": this._burst(0.35, 0.6, 300, 0.7, "lowpass"); this._tone(70, 0.4, "triangle", 0.3, 40); break;
        case "MECO": this._tone(520, 0.12, "square", 0.08); setTimeout(() => this._tone(520, 0.12, "square", 0.08), 160); break;
        case "BAY": this._burst(0.6, 0.12, 180, 2, "bandpass"); break;
        case "RELEASE": this._burst(0.25, 0.4, 500, 1, "bandpass"); this._tone(240, 0.3, "triangle", 0.2, 120); break;
        case "GEAR": this._burst(0.3, 0.5, 200, 0.8, "lowpass"); this._tone(90, 0.25, "triangle", 0.3, 60); break;
        case "TOUCHDOWN": this._burst(0.5, 0.8, 150, 0.5, "lowpass"); this._burst(1.5, 0.3, 2500, 0.4, "bandpass"); break;
        case "FAIL": [0, 180, 360].forEach((ms) => setTimeout(() => this._tone(440, 0.15, "square", 0.12, 330), ms)); break;
        case "OK": [0, 120, 240].forEach((ms, i) => setTimeout(() => this._tone(660 + i * 110, 0.14, "sine", 0.15), ms)); break;
        case "WARN": this._tone(880, 0.1, "square", 0.08); break;
        case "UI": this._tone(1200, 0.04, "sine", 0.06); break;
      }
    }
    // "Creamy" keyboard: lubed linear switches in a gasket-mounted board with thick PBT caps. Each press is
    // rendered once into a buffer (several random variants, so repeats never sound identical):
    //   bottom-out = a tight, dry tick (keycap edge, 2-6 kHz, <1 ms) + a short damped "clack" mode
    //   (~1.2 kHz, plate/cap) + a round low-mid body (~450 Hz, case, ~10 ms) + a soft sub thump (~170 Hz);
    //   no spring ping, no long ring. Release = a lighter, higher top-out tick. Big keys (Space/Enter/Shift)
    //   are deeper and a touch longer (stabilisers).
    _keyBuffers() {
      if (this.keyBufs) return this.keyBufs;
      const sr = this.ctx.sampleRate, mk = (kind) => { const d = synthKey(sr, kind, Math.random); const b = this.ctx.createBuffer(1, d.length, sr); b.getChannelData(0).set(d); return b; };
      this.keyBufs = {};
      for (const kind of ["down", "up", "bigDown", "bigUp"]) this.keyBufs[kind] = Array.from({ length: 6 }, () => mk(kind));
      return this.keyBufs;
    }
    key(down, code) {
      if (!this._ctx()) return;
      const big = /^(Space|Enter|NumpadEnter|ShiftLeft|ShiftRight|Backspace|Tab)$/.test(code || "");
      const set = this._keyBuffers()[(big ? "big" : "") + (down ? "Down" : "Up").replace(/^./, (c) => big ? c : c.toLowerCase())];
      const c = this.ctx, src = c.createBufferSource(), g = c.createGain(), t = c.currentTime;
      src.buffer = set[(Math.random() * set.length) | 0];
      src.playbackRate.value = 0.97 + Math.random() * 0.06;
      g.gain.value = (down ? 0.55 : 0.32) * (0.9 + Math.random() * 0.2);
      src.connect(g); g.connect(this.bus); src.start(t);
    }
  }

  // DOM-free key-click synthesis (also used by tools/key_click_preview.js to render a listening sample)
  function synthKey(sr, kind, rnd) {
    rnd = rnd || Math.random;
    const big = kind.startsWith("big"), down = /down/i.test(kind), j = (x, p) => x * (1 + (rnd() * 2 - 1) * p);
    const dur = down ? (big ? 0.085 : 0.06) : 0.04, n = Math.ceil(sr * dur), out = new Float32Array(n);
    // modes: [freq Hz, decay s, amplitude]
    const modes = down
      ? (big ? [[j(330, 0.04), 0.016, 0.55], [j(980, 0.05), 0.0065, 0.5], [j(140, 0.05), 0.02, 0.26], [j(2300, 0.06), 0.0022, 0.26]]
             : [[j(450, 0.05), 0.0095, 0.48], [j(1250, 0.05), 0.0052, 0.62], [j(175, 0.05), 0.012, 0.2], [j(2700, 0.06), 0.0022, 0.34]])
      : (big ? [[j(620, 0.05), 0.006, 0.4], [j(1500, 0.05), 0.003, 0.35]] : [[j(780, 0.05), 0.0045, 0.38], [j(1850, 0.05), 0.0025, 0.42]]);
    const ph = modes.map(() => rnd() * 0.3);
    // dry transient: band-limited noise, ~0.7 ms decay (two one-pole filters = crude 2-6 kHz band)
    let lp = 0, hp = 0, prev = 0;
    const tickAmp = down ? 0.95 : 0.65, tickTau = down ? 0.0008 : 0.0006, aLP = Math.exp(-2 * Math.PI * 5000 / sr), aHP = Math.exp(-2 * Math.PI * 1800 / sr);
    // cream texture: a little darker noise riding on the body, a few ms
    let tx = 0; const aTx = Math.exp(-2 * Math.PI * 1100 / sr), txTau = down ? 0.004 : 0.0025;
    for (let i = 0; i < n; i++) {
      const t = i / sr, att = Math.min(1, t / 0.00035);               // 0.35 ms attack: crisp but not a hard digital edge
      let y = 0;
      for (let m = 0; m < modes.length; m++) { const [f, tau, a] = modes[m]; y += a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t + ph[m]); }
      const w = rnd() * 2 - 1;
      lp = aLP * lp + (1 - aLP) * w; hp = aHP * (hp + lp - prev); prev = lp;
      y += tickAmp * Math.exp(-t / tickTau) * hp * 3;
      tx = aTx * tx + (1 - aTx) * w; y += 0.35 * Math.exp(-t / txTau) * tx;
      out[i] = y * att;
    }
    // gentle soft-clip and fade-out tail, then normalise to a fixed peak
    let pk = 0;
    for (let i = 0; i < n; i++) { const fade = Math.min(1, (n - i) / (sr * 0.006)); out[i] = Math.tanh(out[i] * 1.2) * fade; pk = Math.max(pk, Math.abs(out[i])); }
    const k = (down ? 0.9 : 0.6) / (pk || 1);
    for (let i = 0; i < n; i++) out[i] *= k;
    return out;
  }
  window.ShuttleSfxSynth = { synthKey };
  window.shuttleSfx = new ShuttleSfx();
})();
