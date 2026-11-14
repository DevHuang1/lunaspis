/**
 * ============================================================================
 * INTERFELLAS SYNTHESIZED SCI-FI AUDIO ENGINE (Web Audio API)
 * ============================================================================
 * 100% self-contained, offline-ready procedural sound effects generator.
 * Zero external mp3/wav audio files required — generates rich analog & digital
 * sci-fi audio effects directly in real-time with zero loading latency:
 * - NASA Quindar Beep & Radio Comms Squelch (Roger chirp)
 * - RCS Jetpack Gas Thruster Bursts (Filtered white noise + envelope)
 * - Hydraulic CBM Hatch Clang & Air Decompression Hiss
 * - Reactor Core Hum & Overheat Alarm Siren
 * - Docking Hard-Capture Clamps & Magnetic Latches
 * - Defense Pulse Laser & Meteor Impact Thud
 * - Hyperspace Wormhole Warp Boom
 */

(function (window) {
  "use strict";

  class SpaceAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.isMuted = false;
      this.initialized = false;
      this.reactorOsc = null;
      this.reactorGain = null;
    }

    init() {
      if (this.initialized) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;

      // Start subtle background atmospheric spacecraft cabin hum
      this.startCabinAmbience();
    }

    resume() {
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }

    toggleMute() {
      this.isMuted = !this.isMuted;
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.35, this.ctx.currentTime);
      }
      return this.isMuted;
    }

    startCabinAmbience() {
      if (!this.ctx || this.reactorOsc) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(54, this.ctx.currentTime); // 54Hz deep electrical hum

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(120, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.04, this.ctx.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start();

        this.reactorOsc = osc;
        this.reactorGain = gain;
      } catch (e) {
        console.warn("Ambience startup failed", e);
      }
    }

    // NASA Quindar Comms Beep (Apollo / ISS vintage tone)
    playRadioBeep(intro = true) {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;

      osc.type = "sine";
      osc.frequency.setValueAtTime(intro ? 2524 : 2475, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.13);
    }

    // RCS Jetpack Gas Burst (for EVA spacewalk thrusters)
    playThrusterBurst(duration = 0.22) {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(650, t);
      filter.Q.setValueAtTime(2.2, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start(t);
      noise.stop(t + duration);
    }

    // Airlock Hatch Pneumatic Actuator & Decompression Hiss
    playAirlockCycle() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      this.playThrusterBurst(0.65);

      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.linearRampToValueAtTime(80, t + 0.4);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.46);
    }

    // Emergency Crisis Alarm Siren
    playAlarm(type = "warning") {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      if (type === "critical") {
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.linearRampToValueAtTime(440, t + 0.28);
      } else {
        osc.frequency.setValueAtTime(580, t);
        osc.frequency.setValueAtTime(720, t + 0.15);
      }

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.32);
    }

    // Docking Hard Capture Lock Clunk
    playDockingLock() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;

      // Heavy metallic sub thud
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.35);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.42);

      // Hydraulic clamp latch click
      setTimeout(() => this.playRadioBeep(false), 220);
    }

    // Defense Laser Discharge
    playLaserPulse() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(1400, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.18);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.22);
    }

    // Quantum Resonance / Wormhole Hyperspace Jump Boom
    playWormholeJump() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;

      // Rising harmonic chord
      [220, 330, 440, 660].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 3.5, t + 1.2);

        gain.gain.setValueAtTime(0.01, t);
        gain.gain.linearRampToValueAtTime(0.12, t + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t + idx * 0.05);
        osc.stop(t + 1.7);
      });

      // Sub-bass detonation at warp collapse
      setTimeout(() => {
        if (!this.ctx) return;
        const tb = this.ctx.currentTime;
        const subOsc = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        subOsc.type = "triangle";
        subOsc.frequency.setValueAtTime(120, tb);
        subOsc.frequency.exponentialRampToValueAtTime(18, tb + 1.5);
        subGain.gain.setValueAtTime(0.5, tb);
        subGain.gain.exponentialRampToValueAtTime(0.001, tb + 1.6);

        subOsc.connect(subGain);
        subGain.connect(this.masterGain);
        subOsc.start(tb);
        subOsc.stop(tb + 1.7);
      }, 1100);
    }

    // UI Click or Console Toggle
    playClick() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.05);
    }

    // Rocket Engine Deep Blast & Sustained Launch Roar
    startRocketRoar(intensity = 1.0) {
      if (!this.initialized || this.isMuted || this.rocketRoarGain) return;
      this.resume();
      try {
        const bufferSize = this.ctx.sampleRate * 2.0;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.04 * white) / 1.04;
          data[i] = last * 4.0;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(380, this.ctx.currentTime);
        filter.Q.setValueAtTime(2.0, this.ctx.currentTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.38 * intensity, this.ctx.currentTime + 1.2);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();

        // Sub-rumble 38Hz oscillator
        const sub = this.ctx.createOscillator();
        sub.type = "sawtooth";
        sub.frequency.setValueAtTime(38, this.ctx.currentTime);
        const subFilter = this.ctx.createBiquadFilter();
        subFilter.type = "lowpass";
        subFilter.frequency.setValueAtTime(70, this.ctx.currentTime);
        sub.connect(subFilter);
        subFilter.connect(gain);
        sub.start();

        this.rocketRoarSource = noise;
        this.rocketRoarGain = gain;
        this.rocketSubOsc = sub;
      } catch (e) {
        console.warn("Rocket roar start notice:", e);
      }
    }

    stopRocketRoar(fadeTime = 1.5) {
      if (!this.rocketRoarGain || !this.ctx) return;
      const t = this.ctx.currentTime;
      this.rocketRoarGain.gain.setValueAtTime(this.rocketRoarGain.gain.value, t);
      this.rocketRoarGain.gain.exponentialRampToValueAtTime(0.0001, t + fadeTime);
      setTimeout(() => {
        try {
          if (this.rocketRoarSource) this.rocketRoarSource.stop();
          if (this.rocketSubOsc) this.rocketSubOsc.stop();
        } catch (e) {}
        this.rocketRoarSource = null;
        this.rocketRoarGain = null;
        this.rocketSubOsc = null;
      }, fadeTime * 1000 + 100);
    }

    // Rocket Staging / Pyrotechnic Separation Thud
    playStagingSeparation() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(95, t);
      osc.frequency.exponentialRampToValueAtTime(22, t + 0.6);
      gain.gain.setValueAtTime(0.42, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.68);
      this.playThrusterBurst(0.35);
    }

    // NASA Countdown Roger Beep
    playCountdownBeep(isGo = false) {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(isGo ? 1800 : 980, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (isGo ? 0.35 : 0.12));
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + (isGo ? 0.38 : 0.14));
    }

    // Docking Hard-Capture Hydraulic Lock
    playDockingLatch() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      // Double mechanical click
      [0, 0.09].forEach(delay => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(320, t + delay);
        osc.frequency.exponentialRampToValueAtTime(80, t + delay + 0.08);
        gain.gain.setValueAtTime(0.28, t + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.09);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t + delay);
        osc.stop(t + delay + 0.1);
      });
      setTimeout(() => this.playAirlockCycle(), 180);
    }

    // Warp Drive Spool-up Charge & Discharge
    playWarpSpoolUp() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(1450, t + 1.8);
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 1.5);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.1);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 2.2);
    }

    // Planetary Science Scanner Telemetry Tone
    playScanTone() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      const t = this.ctx.currentTime;
      [880, 1108, 1320, 1760].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + idx * 0.08);
        gain.gain.setValueAtTime(0.08, t + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(t + idx * 0.08);
        osc.stop(t + idx * 0.08 + 0.22);
      });
    }

    // Satellite Deployment Mechanical Release
    playSatelliteDeploy() {
      if (!this.initialized || this.isMuted) return;
      this.resume();
      this.playThrusterBurst(0.18);
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.linearRampToValueAtTime(260, t + 0.3);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.38);
    }
  }

  window.SpaceAudioEngine = SpaceAudioEngine;
  window.spaceAudio = new SpaceAudioEngine();
})(window);
