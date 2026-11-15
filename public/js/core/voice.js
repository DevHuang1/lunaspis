/**
 * ============================================================================
 * INTERFELLAS HIGH-RELIABILITY ALWAYS-ON PROXIMITY VOICE SUITE
 * ============================================================================
 * Zero-NAT, 100% firewall-traversing WebSocket audio relay for multiplayer crew comms:
 * - Always-On Comms: Crew members can hear each other at ALL times across the entire station.
 * - Dynamic Proximity Acoustics:
 *     * Near (<=2m): Full 100% volume, wideband response + vocal presence boost,
 *       and directional stereo panning (sounds like standing right next to you).
 *     * Far (>=22m): Settles to ~38% volume (never fully muted) with a strongly
 *       muffled 1.6kHz intercom response.
 *     * Closed CBM Hatch: Acoustic muffling (1kHz) through pressurized doors.
 * - Cockpit Audio Settings: Device selector, live VU meter, sensitivity, deafen & per-player volumes.
 * - Ultra-low latency (~30ms) scheduled Web Audio playback.
 */

(function (window) {
  "use strict";

  const TARGET_SAMPLE_RATE = 16000; // 16kHz High-Definition Voice Audio
  const CHUNK_DURATION_MS = 100;     // 100ms audio packet granularity
  const SAMPLES_PER_CHUNK = Math.round((TARGET_SAMPLE_RATE * CHUNK_DURATION_MS) / 1000); // 1600 samples = 3.2 KB

  const PROXIMITY_CONFIG = {
    nearDistance: 2.0,     // Distance (m) where volume is 100% and presence is maximized
    farDistance: 22.0,     // Distance (m) where volume settles to the far intercom level
    nearGain: 1.00,        // 100% volume when standing close
    farGain: 0.38,         // 38% volume when far away (still audible, but clearly distant)
    nearFilterFreq: 20000, // Full crisp presence when close
    farFilterFreq: 1600,   // Strongly muffled spacecraft intercom response when far
    occludedFreq: 1000,    // Heavily muffled frequency through a closed CBM hatch
    occludedGainMult: 0.55 // 55% volume through closed door
  };

  const VOICE_JITTER_BUFFER_SEC = 0.09;

  // Helper: line segment intersection in 2D (XZ plane)
  function lineSegmentsIntersect(p1x, p1z, p2x, p2z, p3x, p3z, p4x, p4z) {
    const d = (p2x - p1x) * (p4z - p3z) - (p2z - p1z) * (p4x - p3x);
    if (Math.abs(d) < 0.0001) return false;
    const u = ((p3x - p1x) * (p4z - p3z) - (p3z - p1z) * (p4x - p3x)) / d;
    const v = ((p3x - p1x) * (p2z - p1z) - (p3z - p1z) * (p2x - p1x)) / d;
    return (u >= 0 && u <= 1 && v >= 0 && v <= 1);
  }

  class ProximityVoiceManager {
    constructor() {
      this.socket = null;
      this.audioCtx = null;
      this.masterGainNode = null;
      this.localStream = null;
      this.micSource = null;
      this.processorNode = null;
      this.micAnalyser = null;
      this.silentSink = null;
      this.currentDeviceId = localStorage.getItem("interfellas_mic_device") || "default";

      // Status
      this.isEnabled = false;
      this.isMuted = false;
      this.isSpeaking = false;
      this.isRadioTransmitting = false;
      this.emergencyMode = false;
      this.pttActive = false;           // Push-to-talk [V]
      this.pttWasMuted = false;
      this.radioChannelLatched = false;
      this.isDeafened = localStorage.getItem("interfellas_deafen") === "true";
      this.lastError = null;
      this._boundSocket = null;
      this._keysBound = false;

      // Tuning Settings
      const storedVad = localStorage.getItem("interfellas_vad_thresh");
      // Migrate the old default (12) to the more sensitive default (7) while
      // preserving values the user explicitly chose.
      if (storedVad === null || storedVad === "12") {
        this.vadThreshold = 7;
        localStorage.setItem("interfellas_vad_thresh", "7");
      } else {
        const parsedVad = parseInt(storedVad, 10);
        this.vadThreshold = Number.isFinite(parsedVad) ? Math.max(5, Math.min(80, parsedVad)) : 7;
      }
      this.masterVolume = parseFloat(localStorage.getItem("interfellas_master_vol") || "1.0");
      this.playerVolumes = {}; // peerId -> volumeMultiplier (0.0 to 2.0)

      // Live VU meter value (0-100)
      this.currentMicLevel = 0;
      this.lastProximityUpdateAt = 0;

      // Peers map: socketId -> { proximityGain, pannerNode, proximityFilter, presenceFilter, nextPlayTime, isSpeaking, speakingTimeout }
      this.peers = {};

      // VAD & Capture
      this.vadInterval = null;
      this.outgoingBuffer = new Int16Array(SAMPLES_PER_CHUNK);
      this.outgoingIndex = 0;

      // Callbacks
      this.onStateChangeCallbacks = [];

      this.setupGlobalAudioUnlock();
    }

    setupGlobalAudioUnlock() {
      const unlock = () => {
        if (this.audioCtx && this.audioCtx.state === "suspended") {
          this.audioCtx.resume().catch(() => {});
        }
        if (window.spaceAudio && window.spaceAudio.ctx && window.spaceAudio.ctx.state === "suspended") {
          window.spaceAudio.ctx.resume().catch(() => {});
        }
      };
      window.addEventListener("pointerdown", unlock, { passive: true });
      window.addEventListener("keydown", unlock, { passive: true });
      window.addEventListener("click", unlock, { passive: true });
      window.addEventListener("touchstart", unlock, { passive: true });
    }

    onStateChange(cb) {
      this.onStateChangeCallbacks.push(cb);
    }

    emitStateChange() {
      const state = {
        isEnabled: this.isEnabled,
        isMuted: this.isMuted,
        isSpeaking: this.isSpeaking,
        isDeafened: this.isDeafened,
        isRadio: !!(this.isRadioTransmitting || this.radioChannelLatched),
        radioChannelLatched: !!this.radioChannelLatched,
        emergencyMode: this.emergencyMode,
        masterVolume: this.masterVolume,
        peerCount: Object.keys(this.peers).length,
        peers: this.peers
      };
      this.onStateChangeCallbacks.forEach(cb => {
        try { cb(state); } catch (e) {}
      });
    }

    init(socket) {
      if (!socket) return;
      this.socket = socket;
      if (this._boundSocket !== socket) {
        this._boundSocket = socket;
        this.bindSocketEvents();
      }
      if (!this._keysBound) {
        this._keysBound = true;
        this.bindKeyboardShortcuts();
      }
      console.log("🎙️  [VOICE] Always-On Proximity Voice Engine online.");
    }

    ensureAudioContext() {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        this.audioCtx = (window.spaceAudio && window.spaceAudio.ctx)
          ? window.spaceAudio.ctx
          : new AudioContextClass();

        // Master Voice Output Gain (for Deafen & Master Volume)
        this.masterGainNode = this.audioCtx.createGain();
        this.masterGainNode.gain.setValueAtTime(this.isDeafened ? 0 : this.masterVolume, this.audioCtx.currentTime);
        this.masterGainNode.connect(this.audioCtx.destination);
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    }

    /**
     * Start Microphone & Live Audio Streaming
     */
    async startMicrophone(deviceId = null) {
      this.lastError = null;
      this.ensureAudioContext();

      if (deviceId) this.currentDeviceId = deviceId;

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        this.lastError = "Microphone requires HTTPS or localhost (browser blocked getUserMedia on insecure origin).";
        console.warn("⚠️  [VOICE]", this.lastError);
        this.isEnabled = false;
        this.emitStateChange();
        return false;
      }

      try {
        if (this.audioCtx && this.audioCtx.state === "suspended") {
          await this.audioCtx.resume();
        }

        // Release existing mic if restarting
        if (this.localStream) {
          this.localStream.getTracks().forEach(t => t.stop());
          this.localStream = null;
        }

        const baseAudio = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        };

        const audioConstraints = Object.assign({}, baseAudio);
        if (this.currentDeviceId && this.currentDeviceId !== "default") {
          audioConstraints.deviceId = { exact: this.currentDeviceId };
        }

        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: false
          });
        } catch (firstErr) {
          // If saved deviceId was unplugged or constraints were too strict, fall back cleanly
          if (firstErr && (firstErr.name === "OverconstrainedError" || firstErr.name === "NotFoundError")) {
            this.currentDeviceId = "default";
            localStorage.setItem("interfellas_mic_device", "default");
            try {
              this.localStream = await navigator.mediaDevices.getUserMedia({ audio: baseAudio, video: false });
            } catch (secondErr) {
              this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
          } else {
            throw firstErr;
          }
        }

        this.isEnabled = true;
        this.isMuted = false;

        this.setupLocalCapture();
        this.connectToExistingRoomPeers();

        if (window.netManager && window.netManager.roomId && this.socket) {
          this.socket.emit("voice_join", { roomId: window.netManager.roomId });
        }

        this.broadcastVoiceState();
        this.emitStateChange();
        this.playQuindarBeep(true);
        console.log("🎙️  [VOICE] Microphone connected. Open Comms active.");
        return true;
      } catch (err) {
        if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          this.lastError = "Microphone permission denied. Please allow mic access in your browser settings.";
        } else if (err && err.name === "NotFoundError") {
          this.lastError = "No microphone found on this device.";
        } else if (err && err.name === "NotReadableError") {
          this.lastError = "Microphone is in use by another application.";
        } else {
          this.lastError = (err && err.message) ? err.message : "Unable to start microphone.";
        }
        console.warn("⚠️  [VOICE] Microphone access failed:", this.lastError);
        this.isEnabled = false;
        this.emitStateChange();
        return false;
      }
    }

    /**
     * Set up local audio capture, downsampling to 16kHz & chunk streaming
     */
    setupLocalCapture() {
      if (!this.localStream) return;
      this.ensureAudioContext();
      if (!this.audioCtx) return;

      try {
        if (this.processorNode) {
          try { this.processorNode.disconnect(); } catch (e) {}
          this.processorNode = null;
        }
        if (this.micSource) {
          try { this.micSource.disconnect(); } catch (e) {}
          this.micSource = null;
        }

        this.micSource = this.audioCtx.createMediaStreamSource(this.localStream);
        this.micAnalyser = this.audioCtx.createAnalyser();
        this.micAnalyser.fftSize = 256;
        this.micAnalyser.smoothingTimeConstant = 0.4;
        this.micSource.connect(this.micAnalyser);

        const bufferSize = 2048;
        this.processorNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

        const inSampleRate = this.audioCtx.sampleRate;
        const targetRate = TARGET_SAMPLE_RATE;
        const ratio = inSampleRate / targetRate;

        this.outgoingBuffer = new Int16Array(SAMPLES_PER_CHUNK);
        this.outgoingIndex = 0;

        this.processorNode.onaudioprocess = (e) => {
          if (!this.isEnabled || this.isMuted) {
            this.outgoingIndex = 0;
            return;
          }

          const input = e.inputBuffer.getChannelData(0);
          const outSamples = Math.floor(input.length / ratio);

          // VAD gates transmission to keep mobile data usage reasonable. The
          // hysteresis + longer hangover below prevent mid-word cut-outs.
          if (!this.isSpeaking) {
            this.outgoingIndex = 0;
            return;
          }

          for (let i = 0; i < outSamples; i++) {
            const srcIdx = Math.floor(i * ratio);
            let sample = input[srcIdx] || 0;
            sample = Math.max(-1, Math.min(1, sample));
            this.outgoingBuffer[this.outgoingIndex++] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;

            if (this.outgoingIndex >= SAMPLES_PER_CHUNK) {
              if (this.socket && window.netManager && window.netManager.roomId) {
                this.socket.emit("voice_chunk", {
                  roomId: window.netManager.roomId,
                  chunk: this.outgoingBuffer.buffer.slice(0)
                });
              }
              this.outgoingIndex = 0;
            }
          }
        };

        this.micSource.connect(this.processorNode);

        // Silent sink to ensure audio clock drives onaudioprocess
        if (!this.silentSink) {
          this.silentSink = this.audioCtx.createGain();
          this.silentSink.gain.setValueAtTime(0, this.audioCtx.currentTime);
          this.silentSink.connect(this.audioCtx.destination);
        }
        this.processorNode.connect(this.silentSink);

        this.setupLocalVAD();

      } catch (err) {
        console.warn("[VOICE] Error setting up audio capture:", err);
      }
    }

    /**
     * VAD & Volume Meter Loop (Time-Domain RMS for accurate speech detection)
     */
    setupLocalVAD() {
      if (this.vadInterval) {
        clearInterval(this.vadInterval);
        this.vadInterval = null;
      }

      const timeData = new Uint8Array(this.micAnalyser ? this.micAnalyser.fftSize : 256);
      let speakingCooldown = 0;

      this.vadInterval = setInterval(() => {
        if (!this.micAnalyser) return;

        this.micAnalyser.getByteTimeDomainData(timeData);
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const norm = (timeData[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / timeData.length);
        const level = Math.min(100, Math.round(rms * 380));
        this.currentMicLevel = level;

        if (this.isMuted || !this.isEnabled) {
          if (this.isSpeaking) {
            this.isSpeaking = false;
            this.broadcastVoiceState();
            this.emitStateChange();
          }
          return;
        }

        // Hysteresis: start on the configured threshold, keep transmitting
        // until the level falls well below it. This prevents brief dips
        // between syllables from clipping the stream.
        const startThreshold = this.vadThreshold;
        const stopThreshold = Math.max(3, Math.round(this.vadThreshold * 0.55));
        const threshold = this.isSpeaking ? stopThreshold : startThreshold;
        const nowSpeaking = level > threshold || this.isRadioTransmitting || this.pttActive;

        if (nowSpeaking) {
          speakingCooldown = 30; // Hold state for ~900ms (30ms VAD tick) to preserve word endings
          if (!this.isSpeaking) {
            this.isSpeaking = true;
            this.broadcastVoiceState();
            this.emitStateChange();
          }
        } else if (speakingCooldown > 0) {
          speakingCooldown--;
        } else if (this.isSpeaking) {
          this.isSpeaking = false;
          this.broadcastVoiceState();
          this.emitStateChange();
        }
      }, 30);
    }

    /**
     * Query available microphones
     */
    async getAudioInputDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === "audioinput");
      } catch (e) {
        return [];
      }
    }

    async setAudioInputDevice(deviceId) {
      this.currentDeviceId = deviceId;
      localStorage.setItem("interfellas_mic_device", deviceId);
      if (this.isEnabled) {
        await this.startMicrophone(deviceId);
      }
    }

    stopMicrophone() {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }
      if (this.vadInterval) {
        clearInterval(this.vadInterval);
        this.vadInterval = null;
      }
      if (this.processorNode) {
        try { this.processorNode.disconnect(); } catch (e) {}
        this.processorNode = null;
      }
      if (this.micSource) {
        try { this.micSource.disconnect(); } catch (e) {}
        this.micSource = null;
      }

      this.isEnabled = false;
      this.isSpeaking = false;
      this.broadcastVoiceState();
      this.emitStateChange();
    }

    toggleMute() {
      this.ensureAudioContext();

      if (!this.localStream) {
        this.startMicrophone();
        return;
      }

      this.isMuted = !this.isMuted;
      this.localStream.getAudioTracks().forEach(t => {
        t.enabled = !this.isMuted;
      });

      if (this.isMuted) {
        this.isSpeaking = false;
      }

      this.broadcastVoiceState();
      this.emitStateChange();
      this.playQuindarBeep(!this.isMuted);
      return this.isMuted;
    }

    setMuted(muted) {
      if (this.isMuted === muted) return;
      this.isMuted = !!muted;
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach(t => {
          t.enabled = !this.isMuted;
        });
      }
      if (this.isMuted) {
        this.isSpeaking = false;
      }
      this.broadcastVoiceState();
      this.emitStateChange();
    }

    setDeafened(deafen) {
      this.isDeafened = !!deafen;
      localStorage.setItem("interfellas_deafen", this.isDeafened ? "true" : "false");
      if (this.masterGainNode && this.audioCtx) {
        const target = this.isDeafened ? 0 : this.masterVolume;
        this.masterGainNode.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.04);
      }
      this.emitStateChange();
    }

    setMasterVolume(val) {
      this.masterVolume = Math.max(0, Math.min(1.5, parseFloat(val) || 1.0));
      localStorage.setItem("interfellas_master_vol", this.masterVolume.toString());
      if (this.masterGainNode && this.audioCtx && !this.isDeafened) {
        this.masterGainNode.gain.setTargetAtTime(this.masterVolume, this.audioCtx.currentTime, 0.04);
      }
      this.emitStateChange();
    }

    setSensitivity(threshold) {
      this.vadThreshold = Math.max(5, Math.min(80, parseInt(threshold, 10) || 20));
      localStorage.setItem("interfellas_vad_thresh", this.vadThreshold.toString());
    }

    setPeerVolume(peerId, volume) {
      this.playerVolumes[peerId] = Math.max(0, Math.min(2.0, parseFloat(volume) || 1.0));
    }

    getMicLevel() {
      return this.currentMicLevel;
    }

    async toggleRadioChannel(forceState = null) {
      this.ensureAudioContext();
      const next = forceState === null ? !this.radioChannelLatched : !!forceState;
      this.radioChannelLatched = next;
      this.emergencyMode = next || !!this.isRadioTransmitting;

      if (next && !this.localStream) {
        await this.startMicrophone();
      } else if (next && this.isMuted) {
        this.setMuted(false);
      }

      this.broadcastVoiceState();
      this.emitStateChange();
      this.playQuindarBeep(next);
      return this.radioChannelLatched;
    }

    broadcastVoiceState() {
      if (!this.socket || !window.netManager) return;
      this.socket.emit("voice_state_update", {
        roomId: window.netManager.roomId,
        isMuted: this.isMuted,
        isSpeaking: this.isSpeaking,
        isRadio: !!(this.isRadioTransmitting || this.radioChannelLatched)
      });
    }

    /**
     * Subtle NASA Roger Tone
     */
    playQuindarBeep(isOpen) {
      try {
        this.ensureAudioContext();
        if (!this.audioCtx || this.audioCtx.state === "suspended") return;

        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(isOpen ? 2525 : 2475, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.06, now + 0.005);
        gain.gain.linearRampToValueAtTime(0, now + (isOpen ? 0.04 : 0.06));

        osc.connect(gain);
        gain.connect(this.masterGainNode || this.audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.065);
      } catch (e) {}
    }

    /**
     * Socket.io Handlers
     */
    bindSocketEvents() {
      this.socket.on("voice_chunk", (data) => {
        if (!data || !data.senderId || !data.chunk) return;
        this.handleIncomingVoiceChunk(data.senderId, data.chunk);
      });

      this.socket.on("voice_peer_joined", (data) => {
        if (data && data.id && data.id !== this.socket.id) {
          this.getOrCreatePeer(data.id);
        }
      });

      this.socket.on("voice_peer_state", (data) => {
        if (!data || !data.senderId) return;
        const peer = this.peers[data.senderId];
        if (peer) {
          peer.isSpeaking = !!data.isSpeaking;
          peer.isMuted = !!data.isMuted;
          peer.isRadio = !!data.isRadio;
        }

        if (window.netManager && window.netManager.remotePlayers && window.netManager.remotePlayers[data.senderId]) {
          const rp = window.netManager.remotePlayers[data.senderId];
          rp.isSpeaking = !!data.isSpeaking;
          rp.isMuted = !!data.isMuted;
          rp.isRadio = !!data.isRadio;
        }

        this.emitStateChange();
      });

      this.socket.on("voice_peer_left", (data) => {
        if (data && data.id) {
          this.cleanupPeer(data.id);
          this.emitStateChange();
        }
      });
    }

    connectToExistingRoomPeers() {
      if (!this.socket || !window.netManager || !window.netManager.remotePlayers) return;
      const remotePlayers = window.netManager.remotePlayers;

      for (const peerId in remotePlayers) {
        if (peerId !== this.socket.id) {
          this.getOrCreatePeer(peerId);
        }
      }
    }

    /**
     * Build Web Audio spatial proximity & acoustic presence node tree for each remote crewmate
     */
    getOrCreatePeer(peerId) {
      if (!peerId || peerId === (this.socket ? this.socket.id : null)) return null;
      if (this.peers[peerId]) return this.peers[peerId];

      this.ensureAudioContext();

      let proximityGain = null;
      let pannerNode = null;
      let proximityFilter = null;
      let presenceFilter = null;

      if (this.audioCtx) {
        // 1. Proximity Low-Pass Filter (Opens up to 18kHz when near, settles to 3.8kHz when far)
        proximityFilter = this.audioCtx.createBiquadFilter();
        proximityFilter.type = "lowpass";
        proximityFilter.frequency.setValueAtTime(PROXIMITY_CONFIG.nearFilterFreq, this.audioCtx.currentTime);

        // 2. Vocal Presence Boost (Peaking filter at 2.8kHz gives clear "standing next to you" presence)
        presenceFilter = this.audioCtx.createBiquadFilter();
        presenceFilter.type = "peaking";
        presenceFilter.frequency.setValueAtTime(2800, this.audioCtx.currentTime);
        presenceFilter.Q.setValueAtTime(1.2, this.audioCtx.currentTime);
        presenceFilter.gain.setValueAtTime(0, this.audioCtx.currentTime);

        // 3. Proximity Gain Node (Gentle volume modulation: 100% near -> 70% far)
        proximityGain = this.audioCtx.createGain();
        proximityGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

        // 4. Stereo Panner Node (Directional hearing in station modules)
        if (typeof this.audioCtx.createStereoPanner === "function") {
          try {
            pannerNode = this.audioCtx.createStereoPanner();
            pannerNode.pan.setValueAtTime(0, this.audioCtx.currentTime);
          } catch (e) {}
        }

        // Connect the node graph:
        // incoming audio -> proximityFilter -> presenceFilter -> proximityGain -> pannerNode -> masterGainNode
        proximityFilter.connect(presenceFilter);
        presenceFilter.connect(proximityGain);

        if (pannerNode) {
          proximityGain.connect(pannerNode);
          pannerNode.connect(this.masterGainNode || this.audioCtx.destination);
        } else {
          proximityGain.connect(this.masterGainNode || this.audioCtx.destination);
        }
      }

      const peerObj = {
        peerId,
        proximityGain,
        pannerNode,
        proximityFilter,
        presenceFilter,
        nextPlayTime: 0,
        isSpeaking: false,
        isMuted: false,
        isRadio: false,
        speakingTimeout: null
      };

      this.peers[peerId] = peerObj;
      this.emitStateChange();
      return peerObj;
    }

    /**
     * Decode and smoothly schedule incoming voice audio buffer into Web Audio spatial graph
     */
    handleIncomingVoiceChunk(senderId, chunk) {
      this.ensureAudioContext();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }

      const peer = this.getOrCreatePeer(senderId);
      if (!peer) return;

      try {
        let int16;
        if (chunk instanceof ArrayBuffer) {
          int16 = new Int16Array(chunk);
        } else if (ArrayBuffer.isView(chunk)) {
          int16 = new Int16Array(chunk.buffer, chunk.byteOffset, Math.floor(chunk.byteLength / 2));
        } else if (chunk && Array.isArray(chunk.data)) {
          const u8 = new Uint8Array(chunk.data);
          int16 = new Int16Array(u8.buffer);
        } else {
          return;
        }
        const len = int16.length;
        if (len === 0) return;

        // Create 16kHz audio buffer and measure its level. Capture streams
        // continuously while unmuted, so silence must not light up the UI.
        let sumSq = 0;
        const audioBuffer = this.audioCtx.createBuffer(1, len, TARGET_SAMPLE_RATE);
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const sample = int16[i] / 32768.0;
          channelData[i] = sample;
          sumSq += sample * sample;
        }
        const isAudible = Math.sqrt(sumSq / len) > 0.02;

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;

        if (peer.proximityFilter) {
          source.connect(peer.proximityFilter);
        } else {
          source.connect(this.masterGainNode || this.audioCtx.destination);
        }

        // Schedule smooth playback with a jitter buffer. Reset only when the
        // stream has genuinely fallen behind or drifted too far ahead; small
        // late arrivals should play immediately instead of being discarded.
        const now = this.audioCtx.currentTime;
        const streamRestarted = !peer.lastChunkAt || (now - peer.lastChunkAt) > 0.5;
        if (streamRestarted || peer.nextPlayTime < now - 0.15 || peer.nextPlayTime > now + 0.75) {
          peer.nextPlayTime = now + VOICE_JITTER_BUFFER_SEC;
        }
        source.start(Math.max(now, peer.nextPlayTime));
        peer.nextPlayTime = Math.max(now, peer.nextPlayTime) + audioBuffer.duration;
        peer.lastChunkAt = now;

        // Active speaker indicator (only for chunks that actually contain voice)
        if (isAudible) {
          peer.isSpeaking = true;
          if (window.netManager && window.netManager.remotePlayers && window.netManager.remotePlayers[senderId]) {
            window.netManager.remotePlayers[senderId].isSpeaking = true;
          }

          clearTimeout(peer.speakingTimeout);
          peer.speakingTimeout = setTimeout(() => {
            peer.isSpeaking = false;
            if (window.netManager && window.netManager.remotePlayers && window.netManager.remotePlayers[senderId]) {
              window.netManager.remotePlayers[senderId].isSpeaking = false;
            }
            this.emitStateChange();
          }, 350);
        }

      } catch (err) {
        console.warn("[VOICE] Error decoding voice chunk:", err);
      }
    }

    cleanupPeer(peerId) {
      const peer = this.peers[peerId];
      if (!peer) return;

      try {
        clearTimeout(peer.speakingTimeout);
        if (peer.proximityGain) peer.proximityGain.disconnect();
        if (peer.presenceFilter) peer.presenceFilter.disconnect();
        if (peer.proximityFilter) peer.proximityFilter.disconnect();
        if (peer.pannerNode) peer.pannerNode.disconnect();
      } catch (e) {}

      delete this.peers[peerId];
    }

    /**
     * Check if any closed CBM Hatch door intersects the direct path between two players
     */
    checkCbmDoorOcclusion(localPos, remotePos) {
      if (!window.cbmDoorPortals || window.cbmDoorPortals.length === 0) return false;

      const p1x = localPos.x, p1z = localPos.z;
      const p2x = remotePos.x, p2z = remotePos.z;

      for (let i = 0; i < window.cbmDoorPortals.length; i++) {
        const portal = window.cbmDoorPortals[i];
        if (portal.openProgress < 0.40) {
          const cx = portal.worldPos.x;
          const cz = portal.worldPos.z;
          const rotY = portal.rotY || 0;

          const halfW = 1.3;
          const dx = Math.cos(rotY) * halfW;
          const dz = -Math.sin(rotY) * halfW;

          const p3x = cx - dx, p3z = cz - dz;
          const p4x = cx + dx, p4z = cz + dz;

          if (lineSegmentsIntersect(p1x, p1z, p2x, p2z, p3x, p3z, p4x, p4z)) {
            return true;
          }
        }
      }
      return false;
    }

    /**
     * 3D Proximity & Acoustic Presence Audio Update Loop
     * - Voice chat is ALWAYS audible (baseline ~38% volume at maximum distance)
     * - Closer proximity boosts volume toward 100%, opens high frequencies,
     *   and enhances direct vocal presence.
     */
    updateProximity(localPos, localYaw = 0, remotePlayers = {}) {
      if (!this.audioCtx) return;

      // Acoustic proximity changes slowly; 12.5 Hz is plenty and avoids
      // scheduling dozens of AudioParam ramps every rendered frame.
      const nowMs = performance.now();
      if (nowMs - this.lastProximityUpdateAt < 80) return;
      this.lastProximityUpdateAt = nowMs;

      const currentTime = this.audioCtx.currentTime;
      const isEmergency = !!this.emergencyMode;

      // In the lobby or pre-launch briefing, all crew members hear each other
      // at 100% full volume. The server uses "playing" for an active mission.
      const roomStatus = window.netManager && window.netManager.roomState
        ? window.netManager.roomState.status
        : "lobby";
      const isInLobby = !window.netManager ||
        !window.netManager.roomState ||
        roomStatus === "lobby" ||
        roomStatus === "victory" ||
        roomStatus === "debrief";

      const localRole = window.netManager && window.netManager.localPlayer ? window.netManager.localPlayer.role : "commander";
      const localTeam = (window.netManager && window.netManager.localPlayer && window.netManager.localPlayer.team)
        || (window.InterfellasRoles && typeof window.InterfellasRoles.getTeamForRole === "function"
          ? window.InterfellasRoles.getTeamForRole(localRole)
          : "crew");
      const localRadioOpen = !!(this.isRadioTransmitting || this.radioChannelLatched || isEmergency);

      for (const peerId in this.peers) {
        const peer = this.peers[peerId];
        if (!peer || !peer.proximityGain) continue;

        const peerVolScale = this.playerVolumes[peerId] !== undefined ? this.playerVolumes[peerId] : 1.0;

        // In lobby/victory: 100% clean full presence
        if (isInLobby) {
          peer.proximityGain.gain.setTargetAtTime(1.0 * peerVolScale, currentTime, 0.04);
          if (peer.proximityFilter) {
            peer.proximityFilter.frequency.setTargetAtTime(PROXIMITY_CONFIG.nearFilterFreq, currentTime, 0.04);
          }
          if (peer.presenceFilter) {
            peer.presenceFilter.gain.setTargetAtTime(0, currentTime, 0.04);
          }
          if (peer.pannerNode) {
            peer.pannerNode.pan.setTargetAtTime(0.0, currentTime, 0.04);
          }
          continue;
        }

        const rp = remotePlayers[peerId];
        const remoteRole = rp && rp.role ? rp.role : "commander";
        const remoteTeam = (rp && rp.team)
          || (window.InterfellasRoles && typeof window.InterfellasRoles.getTeamForRole === "function"
            ? window.InterfellasRoles.getTeamForRole(remoteRole)
            : "crew");
        const radioLinked = localRadioOpen || !!(peer.isRadio || (rp && rp.isRadio));

        // Zone Isolation between LCC Ground Control and Orbital Flight Crew:
        // Passive proximity stays zone-local; holding [R] or latching S-Band links Ground <-> Ship.
        if (localTeam !== remoteTeam) {
          if (!radioLinked) {
            peer.proximityGain.gain.setTargetAtTime(0.0, currentTime, 0.04);
            if (peer.pannerNode) {
              peer.pannerNode.pan.setTargetAtTime(0.0, currentTime, 0.04);
            }
          } else {
            peer.proximityGain.gain.setTargetAtTime(1.0 * peerVolScale, currentTime, 0.04);
            if (peer.proximityFilter) {
              peer.proximityFilter.frequency.setTargetAtTime(4200, currentTime, 0.04);
            }
            if (peer.presenceFilter) {
              peer.presenceFilter.gain.setTargetAtTime(2.5, currentTime, 0.04);
            }
            if (peer.pannerNode) {
              peer.pannerNode.pan.setTargetAtTime(0.0, currentTime, 0.04);
            }
          }
          continue;
        }

        if (radioLinked) {
          peer.proximityGain.gain.setTargetAtTime(1.0 * peerVolScale, currentTime, 0.04);
          if (peer.proximityFilter) {
            peer.proximityFilter.frequency.setTargetAtTime(PROXIMITY_CONFIG.nearFilterFreq, currentTime, 0.04);
          }
          if (peer.presenceFilter) {
            peer.presenceFilter.gain.setTargetAtTime(1.5, currentTime, 0.04);
          }
          if (peer.pannerNode) {
            peer.pannerNode.pan.setTargetAtTime(0.0, currentTime, 0.04);
          }
          continue;
        }

        // Same-Zone 3D Proximity: Calculate real distance
        let remotePos = null;

        if (rp) {
          if (rp.mesh && rp.mesh.position) {
            remotePos = rp.mesh.position;
          } else if (rp.curPos) {
            remotePos = { x: rp.curPos[0], y: rp.curPos[1], z: rp.curPos[2] };
          }
        }

        if (!remotePos || !localPos) {
          // Default baseline volume when position is resolving
          peer.proximityGain.gain.setTargetAtTime(PROXIMITY_CONFIG.nearGain * peerVolScale, currentTime, 0.05);
          continue;
        }

        const dx = remotePos.x - localPos.x;
        const dy = remotePos.y - localPos.y;
        const dz = remotePos.z - localPos.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Same-zone mates: proximity modulates loudness and filtering smoothly
        const t = Math.max(0, Math.min(1, (dist - PROXIMITY_CONFIG.nearDistance) / (PROXIMITY_CONFIG.farDistance - PROXIMITY_CONFIG.nearDistance)));
        const curve = Math.pow(t, 0.8);

        let targetGain = PROXIMITY_CONFIG.nearGain * Math.pow(PROXIMITY_CONFIG.farGain / PROXIMITY_CONFIG.nearGain, curve);
        let targetFreq = PROXIMITY_CONFIG.nearFilterFreq * Math.pow(PROXIMITY_CONFIG.farFilterFreq / PROXIMITY_CONFIG.nearFilterFreq, curve);
        let presenceBoost = (1 - t) * 4.0;

        // Airlock CBM Hatch Occlusion onboard Station
        const phase = window.netManager && window.netManager.mission ? window.netManager.mission.phase : "gantry";
        if (localTeam !== "ground" && phase === "station") {
          const isDoorOccluded = this.checkCbmDoorOcclusion(localPos, remotePos);
          if (isDoorOccluded) {
            targetGain *= PROXIMITY_CONFIG.occludedGainMult;
            targetFreq = Math.min(targetFreq, PROXIMITY_CONFIG.occludedFreq);
          }
        }

        targetGain *= peerVolScale;

        peer.proximityGain.gain.setTargetAtTime(targetGain, currentTime, 0.04);
        if (peer.proximityFilter) {
          peer.proximityFilter.frequency.setTargetAtTime(targetFreq, currentTime, 0.04);
        }
        if (peer.presenceFilter) {
          peer.presenceFilter.gain.setTargetAtTime(presenceBoost, currentTime, 0.04);
        }

        // Directional Stereo Panning
        if (peer.pannerNode) {
          if (dist > 0.5 && dist < 16.0) {
            const relX = dx * Math.cos(-localYaw) - dz * Math.sin(-localYaw);
            const relZ = dx * Math.sin(-localYaw) + dz * Math.cos(-localYaw);
            const panStrength = Math.max(0, 1.0 - (dist / 18.0));
            const rawPan = Math.max(-1, Math.min(1, relX / Math.max(1.5, Math.abs(relX) + Math.abs(relZ))));
            peer.pannerNode.pan.setTargetAtTime(rawPan * panStrength, currentTime, 0.04);
          } else {
            peer.pannerNode.pan.setTargetAtTime(0.0, currentTime, 0.04);
          }
        }
      }
    }

    setEmergencyMode(active) {
      this.emergencyMode = !!active;
      this.emitStateChange();
    }

    bindKeyboardShortcuts() {
      window.addEventListener("keydown", (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea" || tag === "select") return;

        // [M] - Toggle Microphone Mute (or enable mic if not started yet)
        if (e.code === "KeyM" && !e.repeat) {
          e.preventDefault();
          if (!this.isEnabled) {
            this.startMicrophone();
          } else {
            this.toggleMute();
          }
          return;
        }

        // [V] - Local PTT (Hold to talk if muted)
        if (e.code === "KeyV" && !e.repeat && this.isEnabled) {
          this.pttWasMuted = this.isMuted;
          this.pttActive = true;
          if (this.isMuted) {
            this.setMuted(false);
          }
        }

        // [R] - S-Band Space-to-Ground Radio PTT (Hold to bridge Ground <-> Ship)
        if (e.code === "KeyR" && !e.repeat && !(window.dockingSim && window.dockingSim.isActive)) {
          this.isRadioTransmitting = true;
          this.emergencyMode = true;
          this.pttWasMuted = this.isMuted;
          if (!this.localStream && !this.isEnabled) {
            this.startMicrophone().catch(() => {});
          } else if (this.isMuted) {
            this.setMuted(false);
          }
          this.broadcastVoiceState();
          this.emitStateChange();
          this.playQuindarBeep(true);
        }
      });

      window.addEventListener("keyup", (e) => {
        if (e.code === "KeyV" && this.pttActive) {
          this.pttActive = false;
          if (this.pttWasMuted) {
            this.setMuted(true);
          }
        }
        if (e.code === "KeyR" && this.isRadioTransmitting) {
          this.isRadioTransmitting = false;
          this.emergencyMode = !!this.radioChannelLatched;
          if (this.pttWasMuted && !this.radioChannelLatched) {
            this.setMuted(true);
          }
          this.broadcastVoiceState();
          this.emitStateChange();
        }
      });
    }
  }

  window.voiceManager = new ProximityVoiceManager();

})(window);
