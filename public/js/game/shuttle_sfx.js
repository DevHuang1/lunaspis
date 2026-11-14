/*
 * shuttle_sfx.js — Shuttle mission sound, built on the shared Lunaspis SFX engine (audio_synth.js).
 *
 *   sfx.update(sn, axes, dt)   continuous layers (engines, SRB crackle, wind, OMS, RCS) driven from the snapshot
 *   sfx.event(type)            LIFTOFF, SRB_SEP, MECO, ET_SEP, BAY, RELEASE, GEAR, TOUCHDOWN, FAIL, OK, WARN, UI
 *   sfx.key(down, code)        "creamy" keyboard click
 *   sfx.stopAll()              fade every continuous layer to silence
 *
 * One-shot cues live in the engine's sound library (ignition, stageSep, servo, gearDeploy, touchdown,
 * masterAlarm, success, caution, …) so the Shuttle shares the same reverb, limiter and volume settings
 * as the rest of the game. Continuous layers sit on the engine's "sfx" bus.
 */
(function () {
  "use strict";

  // Shuttle event -> engine sound name (+ options)
  const EVENT_MAP = {
    LIFTOFF: ["ignition"],
    SRB_SEP: ["stagingSeparation"],
    ET_SEP: ["stagingSeparation"],
    MECO: ["callout"],
    BAY: ["servo", { dur: 0.9 }],
    RELEASE: ["satelliteDeploy"],
    GEAR: ["gearDeploy"],
    TOUCHDOWN: ["touchdown"],
    FAIL: ["alarm"],
    OK: ["success"],
    WARN: ["caution"],
    UI: ["uiClick"],
  };

  class ShuttleSfx {
    constructor() { this.ready = false; this.layers = {}; this.lastEng = {}; }

    _ctx() {
      if (this.ready) return this.ctx;
      const sa = window.spaceAudio;
      if (!sa || !sa.init() || !sa.ctx || !sa.buses || !sa.buses.sfx) return null;
      this.sa = sa;
      this.ctx = sa.ctx;
      // Own sub-bus so stopAll() can silence the beds without touching one-shots.
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 1;
      this.bus.connect(sa.buses.sfx.dry);
      this.ready = true;
      this._buildLayers();
      return this.ctx;
    }

    resume() { const c = this._ctx(); if (c && c.state === "suspended") c.resume(); }

    _layer(name, color, filterType, freq, q) {
      const c = this.ctx;
      const src = this.sa.loopingNoise(color);
      const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.bus);
      src.start(c.currentTime, Math.random() * 3);
      this.layers[name] = { src, f, g };
    }

    _buildLayers() {
      this._layer("main", "brown", "lowpass", 220, 1.2);      // SSME roar
      this._layer("srb", "pink", "bandpass", 90, 0.6);         // SRB rumble
      this._layer("crackle", "white", "bandpass", 1800, 0.5);  // SRB crackle (modulated)
      this._layer("wind", "pink", "bandpass", 600, 0.4);       // aerodynamic noise
      this._layer("oms", "white", "bandpass", 3200, 1.5);      // OMS hiss
      this._layer("rcs", "white", "highpass", 2500, 0.7);      // RCS jets
      const c = this.ctx, sub = c.createOscillator(); sub.type = "sawtooth"; sub.frequency.value = 36;
      const sf = c.createBiquadFilter(); sf.type = "lowpass"; sf.frequency.value = 65;
      const sg = c.createGain(); sg.gain.value = 0;
      sub.connect(sf); sf.connect(sg); sg.connect(this.bus); sub.start(); this.sub = sg;
    }

    _set(name, v, tc) {
      const L = this.layers[name]; if (!L) return;
      L.g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, tc || 0.12);
    }

    stopAll() {
      if (!this.ready || !this.ctx) { this.lastEng = {}; return; }
      const t = this.ctx.currentTime;
      for (const k of Object.keys(this.layers)) {
        const L = this.layers[k];
        if (L && L.g) L.g.gain.setTargetAtTime(0, t, 0.04);
      }
      if (this.sub) this.sub.gain.setTargetAtTime(0, t, 0.04);
      this.lastEng = {};
    }

    update(sn, axes, dt) {
      if (!this._ctx() || !sn) return;
      const v = sn.vehicle, eng = v.eng || {}, t = sn.telemetry, alt = t.altitudeM || 0;
      const air = Math.max(0, Math.min(1, 1 - alt / 70000));           // sound carries only in air (faint in vacuum)
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

    event(type) {
      if (!this._ctx()) return;
      const m = EVENT_MAP[type];
      if (m) this.sa.play(m[0], m[1]);
    }

    // "creamy" keyboard thock, slightly randomised in pitch
    key(down /*, code */) {
      if (!this._ctx()) return;
      this.sa.play("key", { down: !!down });
    }
  }

  window.shuttleSfx = new ShuttleSfx();
})();
