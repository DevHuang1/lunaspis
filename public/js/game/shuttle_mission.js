/*
 * shuttle_mission.js — mission lifecycle for the solo Shuttle satellite-deployment mission.
 *
 * Owns phase guards, validated semantic commands, objectives, checkpoints, the fixed-step
 * accumulator, time-acceleration limits and the read-only MissionSnapshot. No DOM / Three.js.
 * The renderer and HUD only read snapshots and send commands; they never award success.
 */
(function (root) {
  "use strict";
  const S = root.ShuttleSim || (typeof require !== "undefined" ? require("./shuttle_simulation.js") : null);
  const { add, sub, scl, dot, norm, unit, clamp } = S.vec;
  const DEG = S.DEG, DT = 1 / 60;

  const PHASES = ["briefing", "prelaunch", "ascent", "insertion", "payload", "deorbit", "entry", "approach", "rollout", "debrief"];
  const OBJECTIVES = [
    ["liftoff", "ascent", "Liftoff (automatic)"], ["srb_sep", "ascent", "Side booster separation (automatic)"],
    ["meco", "ascent", "Main engine cutoff on target speed (automatic)"], ["et_sep", "ascent", "Orange fuel tank separation (automatic)"],
    ["oms2", "insertion", "Start orbit-push engine burn"], ["orbit_valid", "insertion", "Stable orbit reached (safe high/low path)"],
    ["doors_open", "payload", "Open cargo bay doors (reveal cooling panels)"], ["payload_power", "payload", "Turn on satellite power"],
    ["payload_ready", "payload", "Satellite self-check finished"], ["payload_go", "payload", "Crew 2: Approve satellite release"], ["rates_nulled", "payload", "Stop spinning / lock steady hold"],
    ["release_att", "payload", "Aim cargo bay skyward & nose forward"], ["release", "payload", "Release satellite into space"],
    ["separation", "payload", "Back away cleanly (≥ 0.3 m/s push, moving ≥ 0.8 m/s apart)"], ["deploy_verified", "payload", "Satellite floating safely away (≥ 150 m)"],
    ["doors_closed", "deorbit", "Close cargo bay doors before re-entry"], ["coast_tig", "deorbit", "Fast-forward to return burn spot"],
    ["retro_att", "deorbit", "Point nose backward along flight path (±5°)"], ["deorbit_burn", "deorbit", "Start return-to-Earth braking burn"],
    ["entry_corridor", "deorbit", "Landing path lined up for Florida"],
    ["entry_interface", "entry", "Enter upper atmosphere (121.9 km)"], ["taem_gate", "entry", "Reach runway approach zone with good speed"],
    ["gear", "approach", "Lower landing wheels"], ["touchdown", "approach", "Land smoothly inside runway limits"],
    ["wheels_stop", "rollout", "Steer straight and brake to a stop"],
  ];
  // every flown phase can be accelerated (user request); hand-flown phases are capped so inputs stay controllable
  const WARP_LIMIT = { briefing: 1, prelaunch: 4, ascent: 8, insertion: 100, payload: 20, deorbit: 100, entry: 8, approach: 4, rollout: 4, debrief: 1 };
  const CHECKPOINTS = ["pad", "orbit", "payload", "entry", "approach"];

  class ShuttleMission {
    constructor(opts) {
      this.opts = opts || {};
      this.serial = 0;
      this.reset();
    }

    reset() {
      this.serial += 1;
      this.missionId = `STS-T${String(this.serial).padStart(2, "0")}-${Date.now().toString(36).slice(-4)}`;
      this.revision = 0; this.eventSeq = 0;
      this.phase = "briefing";
      this.st = S.createState(this.opts.state || {});
      this.obj = {}; OBJECTIVES.forEach(([id]) => (this.obj[id] = "pending"));
      this.failure = null; this.result = null; this.exited = false; this.paused = false;
      this.warpReq = 1; this.warp = 1; this.acc = 0;
      this.input = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: 0, brake: 0 };
      this.checkpoints = {}; this.retries = 0; this.rejections = 0; this.failures = [];
      this.events = []; this.messages = []; this.guid = {}; this.flags = { orbitDwell: 0, heatT: 0, gT: 0, entryCk: false };
      this.plan = null; this.touchdown = null; this.integrity = "normal";
      // Merged main-mission flights stop at a verified orbit and hand control to
      // the station docking phase instead of continuing to payload/return.
      this.handoffAtOrbit = !!(this.opts && this.opts.handoffAtOrbit);
      this.handoffReady = false;
      this.assistLog = { alphaAssistOffT: 0, holdUsed: false, warpUsedMax: 1 };
      this.prev = { r: this.st.r.slice(), q: this.st.q.slice() };
      this._say("Training flight ready: launch a satellite in space and land safely on Florida Runway 15.", "info");
      return this;
    }

    // ------------------------------------------------------------------ events / messages
    _emit(type, data) {
      const e = Object.assign({ id: `${this.missionId}-${++this.eventSeq}`, type, t: this.st.t, phase: this.phase }, data || {});
      this.events.push(e); this.revision++;
      return e;
    }
    _say(text, level) { this.messages.push({ t: this.st ? this.st.t : 0, text, level: level || "info" }); if (this.messages.length > 40) this.messages.shift(); }
    drainEvents() { const e = this.events; this.events = []; return e; }
    _done(id) { if (this.obj[id] !== "done") { this.obj[id] = "done"; this._emit("OBJECTIVE_DONE", { objective: id }); } }
    _setPhase(p) { if (this.phase !== p) { const from = this.phase; this.phase = p; this._emit("PHASE_CHANGED", { from, to: p }); } }
    _fail(reason, extra) {
      if (this.failure || this.result) return;
      const ck = this._bestCheckpoint();
      this.failure = Object.assign({ phase: this.phase, reason, checkpoint: ck, t: this.st.t }, extra || {});
      this.failures.push({ phase: this.phase, reason });
      this.paused = true;
      this._emit("FAILED", { reason, checkpoint: ck });
      this._say(`FAILURE — ${reason}`, "fail");
    }
    _bestCheckpoint() { for (let i = CHECKPOINTS.length - 1; i >= 0; i--) if (this.checkpoints[CHECKPOINTS[i]]) return CHECKPOINTS[i]; return null; }
    _saveCheckpoint(name) {
      this.checkpoints[name] = JSON.stringify({ v: 1, phase: this.phase, st: this.st, obj: this.obj, flags: this.flags, plan: this.plan, guid: {}, assist: this.assistLog, integrity: this.integrity });
      this._emit("CHECKPOINT_SAVED", { name });
      this._say(`Checkpoint saved: ${name.toUpperCase()}`, "info");
    }

    // ------------------------------------------------------------------ commands
    command(type, args) {
      args = args || {};
      const r = this._command(type, args);
      if (!r.accepted) { this.rejections++; this._emit("COMMAND_REJECTED", { command: type, reason: r.reason }); if (type !== "SET_CONTROL_INPUT") this._say(`${type}: ${r.reason}`, "warn"); }
      else if (type !== "SET_CONTROL_INPUT" && type !== "SET_WARP") this._emit("COMMAND_ACCEPTED", { command: type });
      return r;
    }
    _command(type, a) {
      const st = this.st, ok = (msg) => { if (msg) this._say(msg, "info"); return { accepted: true }; }, no = (reason) => ({ accepted: false, reason });
      if (this.exited) return no("Mission exited");
      const locked = !!(this.failure || this.result);
      switch (type) {
        case "START":
          if (this.phase !== "briefing") return no("Mission already started");
          this._setPhase("prelaunch"); this.countdown = 10; this._saveCheckpoint("pad");
          return ok("Crew boarded, stack armed. Automatic ground launch sequencer: T-10 s. Ascent is fully automatic — monitor.");
        case "SET_CONTROL_INPUT":
          for (const k of Object.keys(this.input)) if (typeof a[k] === "number" && isFinite(a[k])) this.input[k] = clamp(a[k], k === "sb" || k === "brake" ? 0 : -1, 1);
          return { accepted: true };
        case "PAUSE": if (locked) return no("Mission is not running"); this.paused = !this.paused; return ok(this.paused ? "Paused" : "Resumed");
        case "SET_WARP": {
          const lim = this._warpLimit();
          const f = clamp(Math.round(a.factor || 1), 1, 1000);
          if (f > lim.max) { this.warpReq = lim.max; return no(`Time acceleration limited to ${lim.max}× (${lim.why})`); }
          this.warpReq = f; return { accepted: true };
        }
        case "EXIT": this.exited = true; this.paused = true; this._emit("EXITED"); return ok("Mission exited — no result recorded.");
        case "RESTART": this.reset(); return ok("Fresh mission.");
        case "RETRY_CHECKPOINT": {
          const name = a.name || this._bestCheckpoint();
          if (!name || !this.checkpoints[name]) return no("No checkpoint available");
          this._restore(name); return ok(`Restored checkpoint ${name.toUpperCase()}`);
        }
      }
      if (locked) return no(this.result ? "Mission complete" : "Mission failed — retry a checkpoint");
      if (this.paused) return no("Paused");
      switch (type) {
        case "AUTHORIZE_BURN": return this._authorizeBurn();
        case "OPEN_BAY":
          if (!["payload", "insertion"].includes(this.phase) || st.regime !== "orbit") return no("Cargo bay doors only open in space (after the main fuel tank drops)");
          if (this.phase === "insertion" && this.obj.orbit_valid !== "done") return no("Wait for a steady orbit before opening the cargo bay");
          if (st.bay.doors >= 1) return no("Doors already open");
          st.bay.cmd = 1; return ok("Cargo bay doors opening (~45 s).");
        case "CLOSE_BAY":
          if (st.regime !== "orbit") return no("Not in space orbit");
          if (this.phase === "payload" && st.cfg.payload) return no("Satellite is still inside the bay — release it first");
          if (this.phase === "payload" && this.obj.deploy_verified !== "done") return no("Wait to confirm the satellite drifted clear before closing the doors");
          if (st.bay.doors <= 0) return no("Doors already closed");
          st.bay.cmd = -1; return ok("Cargo bay doors closing.");
        case "PAYLOAD_POWER":
          if (this.phase !== "payload") return no("Satellite release isn't active right now");
          if (!st.cfg.payload) return no("Satellite already released");
          if (st.payload.power) return no("Satellite already powered on");
          if (st.bay.doors < 0.99) return no(`Cooling panels still covered — open the cargo bay first (doors ${(st.bay.doors * 100).toFixed(0)}%)`);
          st.payload.power = true; st.payload.checkout = 0; return ok("Satellite power ON — automatic health check running (~25 s).");
        case "PAYLOAD_GO":
          if (this.phase !== "payload") return no("Satellite release isn't active right now");
          if (!st.cfg.payload) return no("Satellite already released");
          if (!st.payload.ready) return no(st.payload.power ? "Health check still running — wait for READY" : "Turn on satellite power first");
          if (this.flags.payloadGo) return no("Release approval already given");
          this.flags.payloadGo = true; this._done("payload_go");
          return ok("Specialist approved: satellite passed health check — OK to release.");
        case "DAP_HOLD": {
          if (st.regime !== "orbit") return no("Angle lock only works in orbit");
          if (st.dap.mode === "AUTO") return no("Auto-pilot is currently steering the ship");
          const wRel = norm(sub(st.w, S.orbitRateBody(st)));
          if (st.dap.mode === "HOLD") { st.dap.mode = "FREE"; return ok("FREE STEER: ship keeps drifting until you fire the side thrusters."); }
          if (wRel > 0.5 * DEG) return no(`Spinning too fast to lock angle (${(wRel / DEG).toFixed(2)}°/s > 0.50°/s) — slow your spin first`);
          st.dap.mode = "HOLD"; st.dap.holdRel = null; this.assistLog.holdUsed = true;
          return ok("ANGLE LOCKED: ship stays level with Earth's horizon; stick turns it.");
        }
        case "RELEASE_PAYLOAD": {
          if (this.phase !== "payload") return no("Cargo bay release isn't active right now");
          if (!st.cfg.payload) return no("Satellite already released");
          const c = this._releaseChecks();
          if (c.length) return no(c[0]);
          S.releasePayload(st); this._done("release"); this._emit("PAYLOAD_RELEASED", { attErrDeg: this._releaseErr() / DEG });
          return ok("Satellite gently pushed clear (0.6 m/s out of the bay). Move safely away: fire DOWN thruster.");
        }
        case "COAST_TO_TIG": return this._coastToTig();
        case "TOGGLE_AOA_ASSIST":
          if (this.phase !== "entry") return no("Nose-angle helper can only be toggled during re-entry");
          st.flight.alphaAssist = !st.flight.alphaAssist;
          return ok(st.flight.alphaAssist ? "Nose-angle helper ON: holding the safe landing angle." : "Nose-angle helper OFF: stick steers the nose angle directly.");
        case "DEPLOY_GEAR": {
          if (this.phase !== "approach") return no("Landing wheels only drop during final landing approach");
          if (st.flight.gearCmd) return no("Landing wheels already down (cannot retract)");
          const d = S.derive(st);
          if (d.eas > 165) return no(`Too fast for landing wheels — slow below 165 m/s airspeed (now ${d.eas.toFixed(0)})`);
          if (d.altitudeM > 3000) return no("Too high — drop wheels below 3000 m (usually around 100 m)");
          st.flight.gearCmd = true; this._done("gear"); this._emit("GEAR_DEPLOY");
          return ok("Landing wheels down — locked in place in about 4 seconds.");
        }
        default: return no(`Unknown command ${type}`);
      }
    }

    _restore(name) {
      const c = JSON.parse(this.checkpoints[name]);
      if (c.v !== 1) throw new Error("Unsupported checkpoint schema");
      this.integrity = c.integrity || "normal";
      this.st = c.st; this.obj = c.obj; this.flags = c.flags; this.plan = c.plan; this.guid = {};
      this.phase = c.phase; this.failure = null; this.result = null; this.paused = false; this.acc = 0; this.warpReq = 1; this.warp = 1;
      this.input = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: 0, brake: 0 };
      this.touchdown = null; this.retries++; this.prev = { r: this.st.r.slice(), q: this.st.q.slice() };
      if (this.phase === "prelaunch") this.countdown = 10;
      this._emit("RESTORED", { name });
    }

    // Development/test fixture: applies a preset state. Marks the run as a practice mode so it can never
    // award a normal-flight result (the HUD shows PRACTICE MODE — QUICK START).
    applyFixture(label, mutate) {
      mutate(this);
      this.integrity = "rehearsal";
      this._emit("FIXTURE_APPLIED", { label });
      this._say(`PRACTICE MODE — QUICK START (${label})`, "warn");
    }

    _releaseErr() { return S.quat.qAngle(this.st.q, S.lvlh(this.st.r, this.st.v).q); }
    _relRate() { return norm(sub(this.st.w, S.orbitRateBody(this.st))); }
    _releaseChecks() {
      const st = this.st, out = [];
      if (st.bay.doors < 0.999) out.push(`Cargo bay doors not fully open (${(st.bay.doors * 100).toFixed(0)}%)`);
      if (!st.payload.ready) out.push(st.payload.power ? "Satellite checkup still running" : "Satellite not powered/checked yet");
      else if (!this.flags.payloadGo) out.push("No GO to release yet (Specialist reviews the satellite checkup)");
      const e = this._releaseErr(); if (e > 10 * DEG) out.push(`Aim error ${(e / DEG).toFixed(1)}° (limit 10°): cargo bay straight up, nose forward`);
      const w = this._relRate(); if (w > 0.15 * DEG) out.push(`Still spinning at ${(w / DEG).toFixed(2)}°/s (limit 0.15°/s): steady it first`);
      return out;
    }
    _retroErr() { return Math.acos(clamp(dot(S.quat.qrot(this.st.q, [0, 0, 1]), scl(unit(this.st.v), -1)), -1, 1)); }

    _authorizeBurn() {
      const st = this.st, no = (reason) => ({ accepted: false, reason });
      if (st.burn && st.burn.authorized && !st.burn.complete) return no("A burn is already authorized");
      if (this.phase === "insertion") {
        if (this.obj.oms2 === "done") return no("Insertion burn already performed");
        const el = S.elements(st.r, st.v);
        let tApo = S.timeToApoapsis(st.r, st.v);
        const sA = S.keplerPropagate(st.r, st.v, tApo);
        const vA = norm(sA.v), vC = Math.sqrt(S.MU / norm(sA.r));
        const dv = vC - vA, m = S.vehicleMass(st), dur = dv * m / S.V.omsF;
        if (tApo - dur / 2 < 20) tApo += el.period;
        st.burn = { kind: "OMS2", tig: st.t + tApo - dur / 2, dvTarget: dv, dvDone: 0, active: false, authorized: true, complete: false, dur };
        st.dap.mode = "AUTO";
        this._done("oms2");
        this._say(`Orbit boost #2 approved: adding ${dv.toFixed(1)} m/s speed at the highest point in ${(tApo - dur / 2).toFixed(0)} s. Auto-pilot will aim forward and fire. You can speed up time until 60 s before the burn.`, "info");
        return { accepted: true };
      }
      if (this.phase === "deorbit") {
        if (!this.plan) return no("No landing burn plan ready");
        if (st.bay.doors > 0.001) return no(`Close the cargo bay doors first (${(st.bay.doors * 100).toFixed(0)}% open)`);
        const e = this._retroErr(); if (e > 5 * DEG) return no(`Point the nose backward within 5° first (off by ${(e / DEG).toFixed(1)}°)`);
        const w = this._relRate(); if (w > 0.2 * DEG) return no(`Still spinning at ${(w / DEG).toFixed(2)}°/s — steady it below 0.20°/s`);
        if (st.t > this.plan.tig + 60) return no(`Burn window passed ${(st.t - this.plan.tig).toFixed(0)} s ago. Use SKIP TO LANDING BURN for the next pass.`);
        st.burn = { kind: "DEORBIT", tig: this.plan.tig, dvTarget: this.plan.dv, dvDone: 0, active: false, authorized: true, complete: false, dur: this.plan.dur };
        this._done("retro_att");
        st.dap.mode = "AUTO";
        const late = st.t - this.plan.tig;
        this._say(late > 2 ? `Landing burn approved LATE (+${late.toFixed(0)} s): you may overshoot the Florida runway.` :
          `Landing burn approved: slowing by ${this.plan.dv.toFixed(1)} m/s backward in ${(-late).toFixed(0)} s. Auto-pilot will hold steady during the burn.`, late > 2 ? "warn" : "info");
        return { accepted: true };
      }
      return no("No engine burn planned in this step");
    }

    _coastToTig() {
      const st = this.st;
      if (this.phase !== "deorbit") return { accepted: false, reason: "Skip-ahead works after releasing the satellite" };
      if (st.burn && st.burn.authorized) return { accepted: false, reason: "Engine burn already approved" };
      if (!this.plan || st.t > this.plan.tig + 60) { this._planDeorbit(); if (!this.plan) return { accepted: false, reason: "No landing window found right now" }; }
      const dtc = this.plan.tig - 360 - st.t;
      if (dtc <= 0) return { accepted: false, reason: "Already within 6 minutes of the landing burn" };
      // two-body coast (aero is exactly zero above 150 km in this model, so this matches the integrator)
      const L0 = S.lvlh(st.r, st.v), rel = S.quat.qmul(S.quat.qconj(L0.q), st.q);
      const s = S.keplerPropagate(st.r, st.v, dtc);
      st.r = s.r; st.v = s.v; st.t += dtc;
      const L1 = S.lvlh(st.r, st.v); st.q = S.quat.qmul(L1.q, rel);
      if (st.dap.mode === "FREE") { st.dap.mode = "HOLD"; this.assistLog.holdUsed = true; }
      st.dap.holdRel = rel; st.w = S.orbitRateBody(st);
      if (st.bay.cmd < 0) { st.bay.doors = 0; st.bay.cmd = 0; }
      if (st.payload.r) { const p = S.keplerPropagate(st.payload.r, st.payload.v, dtc); st.payload.r = p.r; st.payload.v = p.v; }
      st.debris = [];
      this.prev = { r: st.r.slice(), q: st.q.slice() };
      this._done("coast_tig");
      this._emit("COAST", { dt: dtc });
      this._say(`Skipped ahead ${(dtc / 3600).toFixed(2)} h (auto-pilot held steady). Landing burn in 6 min — point the nose backward.`, "info");
      return { accepted: true };
    }

    _planDeorbit() {
      const st = this.st, rn = norm(st.r), rp = S.RE + 30e3;
      const a = (rn + rp) / 2, vA = Math.sqrt(S.MU * (2 / rn - 1 / a)), dv = Math.sqrt(S.MU / rn) - vA;
      const m = S.vehicleMass(st), mEntry = m - dv * m / (S.V.omsIsp * S.G0);
      const opp = S.findOpportunity(st, dv, mEntry);
      if (!opp) { this.plan = null; return; }
      const dur = dv * m / S.V.omsF;
      this.plan = { tImp: opp.tImp, tig: opp.tImp - dur / 2, dv, dur, eiGamma: opp.plan.eiGamma, predCross: opp.plan.pred.cross, predRange: opp.plan.pred.rangeErr };
      this._say(`Landing burn window: fires at ${fmtT(this.plan.tig)}, slowing by ${dv.toFixed(1)} m/s backward for ~${dur.toFixed(0)} s.`, "info");
    }

    // ------------------------------------------------------------------ warp limits
    _warpLimit() {
      const st = this.st, base = WARP_LIMIT[this.phase] || 1;
      let max = base, why = `${this.phase} stage`;
      if (st.burn && st.burn.active) return { max: 4, why: "engine burn running" };
      if (st.burn && st.burn.authorized && !st.burn.complete && st.burn.tig - st.t < 60) return { max: 4, why: "burn within 60 s" };
      if (this.phase === "payload" && st.payload.released && this.obj.deploy_verified !== "done") return { max: 4, why: "moving away from satellite" };
      if (this.phase === "deorbit" && this.obj.deorbit_burn === "done") {
        const alt = norm(st.r) - S.RE;
        if (alt < 140e3) return { max: 8, why: "about to enter Earth's air" };
      }
      if (this.phase === "deorbit" && this.plan && !(st.burn && st.burn.authorized) && this.plan.tig - st.t < 120) max = Math.min(max, 4), why = "near landing burn";
      if (this.phase === "insertion" && !(st.burn && st.burn.authorized)) max = Math.min(max, 10), why = "orbit boost #2 not approved yet";
      if (this.phase === "insertion" && st.burn && st.burn.complete) max = 10, why = "checking stable orbit";
      return { max, why };
    }

    // ------------------------------------------------------------------ time stepping
    advance(realDt) {
      if (this.exited) return [];
      if (realDt > 1.0 && !this.paused && !this.failure && !this.result && this.phase !== "briefing") {
        this.paused = true; this._say(`Paused after a ${realDt.toFixed(1)} s suspension (simulation time was not skipped).`, "warn");
        this._emit("SUSPENDED", { realDt });
      }
      if (this.paused || this.failure || this.result || this.phase === "briefing") return this.drainEvents();
      const lim = this._warpLimit();
      this.warp = Math.min(this.warpReq, lim.max);
      this.assistLog.warpUsedMax = Math.max(this.assistLog.warpUsedMax, this.warp);
      this.acc += (this._uncapped ? realDt : Math.min(realDt, 0.25)) * this.warp;
      const maxSteps = 6000;
      let n = 0;
      while (this.acc >= DT && n < maxSteps) {
        this.acc -= DT; n++;
        this._tick();
        if (this.failure || this.result || this.paused) { this.acc = 0; break; }
        const l2 = this._warpLimit(); if (this.warp > l2.max) { this.warp = l2.max; this.acc = Math.min(this.acc, DT * l2.max); }
      }
      if (n >= maxSteps) this.acc = 0;   // warp throttled by available CPU (sim time is never fabricated)
      return this.drainEvents();
    }
    // test/automation helper: advance simulated seconds at 1x granularity with the current inputs
    advanceSim(seconds) { const steps = Math.round(seconds / DT); for (let i = 0; i < steps; i++) { if (this.failure || this.result || this.paused || this.exited || this.phase === "briefing") break; this._tick(); } return this.drainEvents(); }

    _tick() {
      const st = this.st;
      this.prev.r = st.r.slice(); this.prev.q = st.q.slice();
      if (this.phase === "prelaunch") {
        this.countdown -= DT;
        if (this.countdown <= 6.6 && st.regime === "pad") { S.ignite(st); this._emit("SSME_START"); this._say("Main engine start…", "info"); }
      }
      // burn scheduling (guided): attitude owned by the autopilot, ignition at TIG
      if (st.burn && st.burn.authorized && !st.burn.complete) {
        const b = st.burn, vh = unit(st.v), up = unit(st.r);
        if (b.kind === "OMS2") st.autoAttitude = S.quat.qFromNoseUp(vh, up);
        else st.autoAttitude = S.quat.qFromNoseUp(scl(vh, -1), S.quat.qrot(st.q, [0, 1, 0]));
        if (!b.active && st.t >= b.tig) { b.active = true; this._emit("BURN_START", { kind: b.kind }); this._say(`${b.kind === "OMS2" ? "Orbit boost #2" : "Landing burn"} engine started.`, "info"); }
      }
      const inp = this._inputForPhase();
      const ev = S.step(st, inp, DT);
      for (const e of ev) this._onSimEvent(e);
      if (this.failure || this.result) return;
      this._phaseLogic();
      this.prevPhase = this.phase;
    }

    _inputForPhase() {
      const i = this.input, z = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: this.input.sb, brake: 0 };
      switch (this.phase) {
        case "payload": case "deorbit": case "insertion":
          if (this.st.dap.mode === "AUTO") return z;
          return { pitch: i.pitch, yaw: i.yaw, roll: i.roll, tx: i.tx, ty: i.ty, tz: i.tz };
        case "entry": return { pitch: this.st.flight.alphaAssist ? 0 : i.pitch, roll: i.roll };
        case "approach": return { pitch: i.pitch, roll: i.roll, sb: i.sb };
        case "rollout": return { pitch: i.pitch, roll: i.roll, brake: i.brake, sb: i.sb };
        default: return z;
      }
    }

    _onSimEvent(e) {
      const st = this.st;
      switch (e.type) {
        case "LIFTOFF": this._setPhase("ascent"); this._done("liftoff"); this._emit("LIFTOFF"); this._say("LIFTOFF! Turning toward our launch path and tilting forward (automatic).", "info"); break;
        case "STAGE_SEPARATED":
          this._emit("STAGE_SEPARATED", { stage: e.stage });
          if (e.stage === "SRB") { this._done("srb_sep"); this._say("Side boosters separated! Empty shells dropped; main engines still flying.", "info"); }
          if (e.stage === "ET") {
            this._done("et_sep"); this._setPhase("insertion");
            const el = S.elements(st.r, st.v);
            this._say(`Main fuel tank dropped. Path (${(el.periapsisAlt / 1e3).toFixed(0)} × ${(el.apoapsisAlt / 1e3).toFixed(0)} km) is NOT stable yet — low point dips into air. Next step: approve Orbit Boost #2 [B].`, "info");
          }
          break;
        case "MECO": this._done("meco"); this._emit("MECO", { reason: e.reason }); this._say(`Main engines off (${e.reason === "target energy" ? "target speed reached" : e.reason === "ET depleted" ? "tank empty" : e.reason}). Main tank separates in 18 s.`, "info"); break;
        case "BURN_END": {
          const b = st.burn; if (!b) break;
          b.complete = true; b.active = false; st.autoAttitude = null;
          this._emit("BURN_END", { kind: b.kind, dv: b.dvDone });
          if (b.kind === "OMS2") this._say(`Orbit boost #2 finished (+${b.dvDone.toFixed(1)} m/s speed). Checking orbit…`, "info");
          if (b.kind === "DEORBIT") this._afterDeorbit();
          break;
        }
        case "DOORS_OPEN": this._emit("DOORS_OPEN"); this._say("Cargo bay doors open — heat panels exposed, cooling working normally.", "info"); break;
        case "DOORS_CLOSED": this._emit("DOORS_CLOSED"); this._say("Cargo bay doors closed and latched.", "info"); break;
        case "PAYLOAD_READY": this._emit("PAYLOAD_READY"); this._say("Satellite checkout done: READY to release.", "info"); break;
        case "PAYLOAD_POWER_LOST": this._say("Satellite power lost: cooling panels closed.", "warn"); break;
        case "PAYLOAD_DEPLOYED": this._emit("PAYLOAD_DEPLOYED"); this._say("Satellite reports solar wings and antenna opened.", "info"); break;
        case "COLLISION": this._fail(`Collided with the satellite: ${e.range.toFixed(1)} m away and closing${-e.rangeRate >= 0.01 ? ` at ${(-e.rangeRate).toFixed(2)} m/s` : ""}. Move DOWN (away from the cargo bay) after releasing it.`, { quantity: "range" }); break;
        case "NOSE_GEAR_TOUCHDOWN": this._say("Front wheel on the runway. Wheel brakes ready.", "info"); break;
        case "GROUND_FAIL": this._fail(e.reason); break;
        case "WHEELS_STOP": this._done("wheels_stop"); this._complete(); break;
      }
    }

    _afterDeorbit() {
      const st = this.st;
      this._done("deorbit_burn");
      const el = S.elements(st.r, st.v);
      const tEI = S.timeToRadius(st.r, st.v, S.RE + S.EI_ALT, 8000);
      if (tEI === null || el.periapsisAlt > 85e3) { this._fail(`Didn't slow down enough: lowest point ${(el.periapsisAlt / 1e3).toFixed(0)} km is still too high to enter Earth's air (needs under 85 km).`); return; }
      const e = S.keplerPropagate(st.r, st.v, tEI);
      const fake = { theta0: st.theta0, t: st.t + tEI, r: e.r, v: e.v, flight: { alpha: 40 * DEG, sigma: 50 * DEG } };
      const pred = S.predictEntry(fake, 55 * DEG, { dt: 4, mass: S.vehicleMass(st) });
      const gam = Math.asin(dot(unit(e.r), unit(S.airVel(e.r, e.v))));
      this.guid.eiPred = { tEI: st.t + tEI, gamma: gam, rangeErr: pred.rangeErr, cross: pred.cross };
      if (pred.skip || pred.crashed || Math.abs(pred.rangeErr) > 450e3) {
        this._fail(`Missed landing zone: predicted to come down ${pred.skip ? "too high (skipping off air)" : (Math.abs(pred.rangeErr) / 1e3).toFixed(0) + " km " + (pred.rangeErr > 0 ? "long" : "short")} of Florida — steering during re-entry can only fix ~450 km. Try firing the burn closer to target time.`, { quantity: "rangeErr" });
        return;
      }
      this._done("entry_corridor");
      this._say(`Return burn finished. Low point ${(el.periapsisAlt / 1e3).toFixed(0)} km; hitting upper air in ${(tEI / 60).toFixed(1)} min (estimated offset ${(pred.rangeErr / 1e3).toFixed(0)} km). Autopilot now tilts nose 40° up for re-entry.`, "info");
    }

    _phaseLogic() {
      const st = this.st;
      switch (this.phase) {
        case "insertion": {
          if (st.burn && st.burn.complete && st.burn.kind === "OMS2") {
            const el = S.elements(st.r, st.v);
            const okOrbit = el.bound && el.periapsisAlt >= 250e3 && el.apoapsisAlt <= 420e3 && el.e <= 0.012;
            this.flags.orbitDwell = okOrbit ? this.flags.orbitDwell + DT : 0;
            if (this.flags.orbitDwell >= 10) {
              this._done("orbit_valid");
              this._emit("ORBIT_VERIFIED", { peri: el.periapsisAlt, apo: el.apoapsisAlt });
              st.dap.mode = "FREE";
              // handover transient: the DAP releases with residual rates the pilot must null
              st.w = add(S.orbitRateBody(st), [0.45 * DEG, -0.40 * DEG, 0.70 * DEG]);
              st.burn = null;
              if (this.handoffAtOrbit) {
                // Main-mission merge: hold the shuttle on its verified orbit. The
                // server sees handoffReady and opens the ISS docking phase.
                this._saveCheckpoint("orbit");
                this.handoffReady = true;
                this.paused = true;
                this._emit("DOCKING_HANDOFF", { peri: el.periapsisAlt, apo: el.apoapsisAlt });
                this._say(`Stable orbit reached (${(el.periapsisAlt / 1e3).toFixed(0)} × ${(el.apoapsisAlt / 1e3).toFixed(0)} km). Handing off to station docking.`, "info");
              } else {
                this._setPhase("payload");
                this._saveCheckpoint("orbit");
                this._say(`Stable orbit reached (${(el.periapsisAlt / 1e3).toFixed(0)} × ${(el.apoapsisAlt / 1e3).toFixed(0)} km). Steering handed to you. Next: open cargo doors, power satellite, stop spin, aim, release, and drift clear.`, "info");
              }
            }
          }
          if (norm(st.r) - S.RE < 95e3) this._fail("Did not reach orbit: the ship fell back into Earth's air without an orbit-push burn.");
          break;
        }
        case "payload": {
          const p = st.payload;
          if (st.bay.doors >= 1) this._done("doors_open");
          if (p.power) this._done("payload_power");
          if (p.ready) this._done("payload_ready");
          if (st.cfg.payload) {
            const wOK = this._relRate() <= 0.15 * DEG, aOK = this._releaseErr() <= 10 * DEG;
            if (wOK || st.dap.mode === "HOLD") this._done("rates_nulled");
            this.obj.release_att = aOK && wOK ? "done" : (this.obj.release_att === "done" ? "active" : this.obj.release_att);
          } else {
            if ((p.sepDv || 0) >= 0.3 && p.rangeRate >= 0.8 && p.range >= 20) this._done("separation");
            if (p.range >= 150 && p.deploy >= 1 && p.rangeRate >= 0.5 && this.obj.separation === "done" && !p.collided) {
              this._done("deploy_verified");
              this._emit("PAYLOAD_VERIFIED", { range: p.range, rangeRate: p.rangeRate });
              this._setPhase("deorbit");
              this._planDeorbit();
              this._saveCheckpoint("payload");
              this._say("Satellite safely away! Ready to head home: close cargo doors [Y], jump to burn spot [T], point backward, and start return burn [B].", "info");
            }
            if (p.range > 600 && this.obj.separation !== "done") this._fail(`Forgot to drift away: satellite is ${p.range.toFixed(0)} m out without your move-away thrust (${(p.sepDv || 0).toFixed(2)} of ≥0.30 m/s needed).`);
          }
          break;
        }
        case "deorbit": {
          if (st.bay.doors <= 0) this._done("doors_closed");
          if (this.plan && st.t >= this.plan.tig - 400) this._done("coast_tig");
          if (!(st.burn && st.burn.authorized)) {
            this.obj.retro_att = this._retroErr() <= 5 * DEG && this._relRate() <= 0.2 * DEG ? "done" : "pending";
            if (this.plan && st.t > this.plan.tig + 60 && !this.flags.missWarned) { this.flags.missWarned = true; this._say("Return burn window passed. Press JUMP TO BURN [T] to catch the next landing window.", "warn"); }
          }
          if (st.burn && st.burn.complete && st.burn.kind === "DEORBIT") {
            const va = S.airVel(st.r, st.v);
            const tgt = S.attitudeFromAero(st.r, va, 40 * DEG, 0).q;
            st.autoAttitude = tgt; st.dap.mode = "AUTO";
            const alt = norm(st.r) - S.RE;
            if (alt < 135e3 && dot(st.r, st.v) < 0 && !this.flags.entryCk) { this.flags.entryCk = true; this._saveCheckpoint("entry"); }
            if (alt <= S.EI_ALT) {
              S.enterAtmo(st); st.autoAttitude = null; st.burn = null;
              this._done("entry_interface"); this._setPhase("entry");
              this._say("ENTERING EARTH'S AIR. Auto-nose holds 40° up. YOU tilt the wings [A/D]: steeper tilt drops sooner, flip sides when arrows switch.", "info");
            }
          }
          break;
        }
        case "entry": this._entryLogic(); break;
        case "approach": this._approachLogic(); break;
        case "rollout": break;
      }
    }

    _entryLogic() {
      const st = this.st, d = S.derive(st), g = this.guid;
      if (!st.flight.alphaAssist) this.assistLog.alphaAssistOffT += DT;
      g.entryT = (g.entryT || 0) + DT;
      if (!g.nextUpd || st.t >= g.nextUpd) {
        g.nextUpd = st.t + 1.0;
        const opts = { dt: 2, mass: S.vehicleMass(st) };
        const sol = S.solveBank(st, g.bankMag || 55 * DEG, opts);
        g.bankMag = sol.bank; g.predCmd = sol.pred;
        g.predNow = S.predictEntry(st, Math.abs(st.flight.sigma), opts);
        // lateral reversal cue from the current trajectory (heading error to the site)
        const va = S.airVel(st.r, st.v), van = norm(va);
        const dpsi = S.vec.wrapPi(d.bearingToRunwayRad - d.headingRad);
        const db = (van > 4000 ? 10 : 5 + 5 * (van - 1500) / 2500) * DEG;
        g.dpsi = dpsi; g.deadband = Math.max(4 * DEG, db);
        const wantSign = Math.abs(dpsi) > g.deadband ? Math.sign(dpsi) : (Math.sign(st.flight.sigma) || Math.sign(dpsi) || 1);
        g.bankSign = wantSign;
        g.reverseCue = Math.abs(dpsi) > g.deadband && Math.sign(st.flight.sigma || 1e-9) !== Math.sign(dpsi);
        g.bankCmd = wantSign * g.bankMag;
      }
      // envelopes (gameplay approximations driven by the actual trajectory)
      const heat = st.heat || 0, lg = st.loadG || 0;
      this.flags.heatT = heat > 95 ? this.flags.heatT + DT : 0;
      this.flags.gT = lg > 3.2 ? this.flags.gT + DT : 0;
      if (this.flags.heatT > 4) return this._fail(`Thermal limit: heat flux ${heat.toFixed(0)} W/cm² exceeded 95 W/cm² — too deep/fast; reduce bank to stay higher.`, { quantity: "heat" });
      if (this.flags.gT > 3) return this._fail(`Structural load ${lg.toFixed(2)} g exceeded 3.2 g — bank less steeply.`, { quantity: "load" });
      if (d.altitudeM > 135e3 && d.verticalSpeedMps > 0) return this._fail("Skipped out of the atmosphere: too much vertical lift early in entry.");
      if (d.altitudeM < 0) return this._fail("Impact during entry.");
      const relBrg = S.vec.wrapPi(d.bearingToRunwayRad - d.headingRad), behind = Math.abs(relBrg) > 120 * DEG;
      const crossKm = d.rangeToRunwayM * Math.abs(Math.sin(relBrg)) / 1e3;
      const es = this.flags.es || (this.flags.es = { n: 0, absBank: 0, wrong: 0 });
      es.n++; es.absBank += Math.abs(st.flight.sigma);
      if (g.bankSign && Math.abs(st.flight.sigma) > 10 * DEG && Math.sign(st.flight.sigma) !== g.bankSign) es.wrong++;
      if (Math.abs(relBrg) > 60 * DEG && d.airspeedMps > 4000 && d.rangeToRunwayM < 2500e3) {
        const meanBank = es.absBank / es.n / DEG, wrongFrac = es.wrong / es.n;
        const why = wrongFrac > 0.35 ? `wings were tilted AWAY from the runway ${(wrongFrac * 100).toFixed(0)}% of the time (flip sides toward runway when cued)` :
          meanBank < 35 ? `gentle wing tilt (${meanBank.toFixed(0)}°) kept too much lift and speed` : "kept too much speed";
        return this._fail(`Missed Florida runway: passing ${(d.rangeToRunwayM / 1e3).toFixed(0)} km past the site still at ${d.airspeedMps.toFixed(0)} m/s — ${why}.`, { quantity: "range" });
      }
      if (!behind && Math.abs(relBrg) > 60 * DEG && d.rangeToRunwayM > 150e3 && crossKm > 300 && d.airspeedMps > 1200)
        return this._fail(`Off course: the runway is ${crossKm.toFixed(0)} km to your ${relBrg > 0 ? "right" : "left"} — flip your wing tilt toward the target when cued.`, { quantity: "crossrange" });
      if (d.rangeToRunwayM < 25e3 && d.airspeedMps > 1500) return this._fail(`Passing Florida too fast at ${d.airspeedMps.toFixed(0)} m/s — tilt wings steeper earlier to slow down.`, { quantity: "range" });
      if (behind && d.rangeToRunwayM > 150e3 && d.airspeedMps > 1200) return this._fail(`Overshot: the runway is ${(d.rangeToRunwayM / 1e3).toFixed(0)} km behind you at ${d.airspeedMps.toFixed(0)} m/s — tilt wings steeper to drop speed.`, { quantity: "range" });
      if (d.airspeedMps < S.TAEM_V && d.altitudeM < 60e3) {
        const D = d.rangeToRunwayM;
        if (D > 190e3) return this._fail(`Too slow & far from the runway approach zone: ${(D / 1e3).toFixed(0)} km from Florida at ${d.airspeedMps.toFixed(0)} m/s (needs ≤ 190 km). Tilt wings flatter to glide farther.`, { quantity: "range" });
        if (D < 35e3) return this._fail(`Too fast & close at the approach zone: only ${(D / 1e3).toFixed(0)} km from the runway (needs ≥ 35 km).`, { quantity: "range" });
        this._done("taem_gate");
        S.beginApproach(st);
        const rw = S.toRunway(st, st.r);
        this.guid.side = rw.y >= 0 ? 1 : -1;
        this._setPhase("approach");
        this._saveCheckpoint("approach");
        this._say(`APPROACH ZONE: ${(D / 1e3).toFixed(0)} km from Florida, ${(d.altitudeM / 1e3).toFixed(1)} km high, Mach ${d.mach.toFixed(1)}. Auto-nose OFF — steer nose up/down [W/S] & wing tilt [A/D]. Air brake [X/Z], wheels [G]. Glider mode: one shot to land!`, "info");
      }
    }

    _approachLogic() {
      const st = this.st;
      this.guid.appr = S.approachGuidance(st, this.guid.side);
      const d = S.derive(st);
      if (d.altitudeM < 80) {
        const td = S.touchdownCheck(st);
        if (td) {
          this.touchdown = td;
          if (!td.ok) return this._fail(td.reason, { touchdown: td });
          this._done("touchdown"); this._setPhase("rollout");
          this._emit("LANDED", { sink: td.sink, gs: td.gs, x: td.x, y: td.y });
          this._say(`MAIN GEAR TOUCHDOWN: sink ${td.sink.toFixed(2)} m/s, ${td.gs.toFixed(0)} m/s, ${td.x.toFixed(0)} m past threshold. Lower the nose [W], steer [A/D], brake [Space].`, "info");
        }
      }
      if (d.altitudeM < -5) this._fail("Ground impact.");
    }

    _complete() {
      if (this.result) return;
      const st = this.st, g = st.ground;
      this.result = {
        success: this.integrity === "normal", integrity: this.integrity,
        summary: this.integrity === "normal" ? "LANDED & STOPPED — mission complete" : "PRACTICE MODE — QUICK START (not a full flight)",
        stopX: g.x, stopY: g.y, touchdown: this.touchdown, maxG: st.log.maxG, maxHeat: st.log.maxHeat, maxQ: st.maxQ,
        dvOMS: st.log.dvOMS, dvRCS: st.log.dvRCS, retries: this.retries, rejections: this.rejections, failures: this.failures.slice(),
        assists: Object.assign({}, this.assistLog), met: st.t,
      };
      this._setPhase("debrief");
      this._emit("MISSION_COMPLETE", { success: this.result.success });
      this._say(this.result.summary, "info");
    }

    // ------------------------------------------------------------------ snapshot
    allowedCommands() {
      const st = this.st, out = ["PAUSE", "EXIT", "RESTART"];
      if (Object.keys(this.checkpoints).length) out.push("RETRY_CHECKPOINT");
      if (this.failure || this.result) return out;
      out.push("SET_CONTROL_INPUT", "SET_WARP");
      switch (this.phase) {
        case "briefing": out.push("START"); break;
        case "insertion": if (this.obj.oms2 !== "done") out.push("AUTHORIZE_BURN"); break;
        case "payload": out.push("OPEN_BAY", "PAYLOAD_POWER", "PAYLOAD_GO", "DAP_HOLD", "RELEASE_PAYLOAD"); break;
        case "deorbit": out.push("CLOSE_BAY", "COAST_TO_TIG", "DAP_HOLD", "AUTHORIZE_BURN"); break;
        case "entry": out.push("TOGGLE_AOA_ASSIST"); break;
        case "approach": out.push("DEPLOY_GEAR"); break;
      }
      return out;
    }
    snapshot() {
      const st = this.st, d = S.derive(st), p = st.payload;
      const tel = Object.assign({}, d, {
        bankRad: st.flight.sigma, angleOfAttackRad: st.flight.alpha, pitchRad: st.flight.theta, flightPathRad: d.flightPathRad, gammaHoldRad: st.flight.gammaHold === undefined ? null : st.flight.gammaHold, loadG: st.loadG || 0, heat: st.heat || 0,
        ratesBody: st.w.slice(), relRateRad: st.regime === "orbit" ? this._relRate() : 0,
        releaseErrRad: st.regime === "orbit" ? this._releaseErr() : null, retroErrRad: st.regime === "orbit" ? this._retroErr() : null,
      });
      const lim = this._warpLimit();
      return {
        schemaVersion: 1, missionId: this.missionId, revision: this.revision, mode: "solo-training", phase: this.phase,
        handoffAtOrbit: this.handoffAtOrbit, handoffReady: this.handoffReady,
        simTime: st.t, theta0: st.theta0, met: st.launchT !== undefined && st.launchT !== null ? st.t - st.launchT : null, countdown: this.phase === "prelaunch" ? this.countdown : null,
        paused: this.paused, warp: this.warp, warpReq: this.warpReq, warpMax: lim.max, warpWhy: lim.why, integrity: this.integrity,
        vehicle: { r: st.r, v: st.v, q: st.q, w: st.w, regime: st.regime, cfg: st.cfg, gear: st.flight.gear, gearCmd: st.flight.gearCmd, sb: st.flight.sb,
                   doors: st.bay.doors, doorsCmd: st.bay.cmd, dap: st.dap.mode, alphaAssist: st.flight.alphaAssist, eng: st.eng, ground: st.ground,
                   prevR: this.prev.r, prevQ: this.prev.q, alpha: this.acc / DT },
        resources: { oms: st.mass.oms, rcs: st.mass.rcs, et: st.mass.et, srb: st.mass.srbL + st.mass.srbR, payloadKg: st.cfg.payload ? st.mass.payload : 0 },
        payload: { attached: st.cfg.payload, power: p.power, checkout: p.checkout, ready: p.ready, released: p.released, r: p.r, v: p.v, q: p.q,
                   deploy: p.deploy, range: p.range || null, rangeRate: p.rangeRate || null },
        debris: st.debris.map((b) => ({ id: b.id, kind: b.kind, r: b.r, q: b.q })),
        burn: st.burn ? Object.assign({}, st.burn) : null, plan: this.plan,
        telemetry: tel,
        objectives: OBJECTIVES.map(([id, phase, label]) => ({ id, phase, label, status: this.obj[id] })),
        guidance: this._guidanceView(d),
        allowedCommands: this.allowedCommands(), failure: this.failure, result: this.result,
        checkpoints: CHECKPOINTS.filter((c) => this.checkpoints[c]), messages: this.messages.slice(-8), retries: this.retries,
      };
    }
    _guidanceView(d) {
      const st = this.st, g = this.guid, out = { phase: this.phase };
      if (this.phase === "payload" || this.phase === "insertion") {
        out.releaseChecks = st.cfg.payload ? this._releaseChecks() : [];
        if (st.payload.released) { out.sepCue = "Translate DOWN (−Y, away from the satellite): ≥ 0.30 m/s burn, opening ≥ 0.8 m/s"; out.range = st.payload.range; out.rangeRate = st.payload.rangeRate; out.sepDv = st.payload.sepDv || 0; }
        if (this.phase === "insertion" && st.burn) { out.tig = st.burn.tig - st.t; out.dv = st.burn.dvTarget - st.burn.dvDone; }
        if (this.phase === "insertion" && !st.burn) out.tApo = S.timeToApoapsis(st.r, st.v);
      }
      if (this.phase === "deorbit" && this.plan) {
        out.tig = this.plan.tig - st.t; out.dv = this.plan.dv; out.burnDur = this.plan.dur;
        if (st.burn) out.dvRemaining = st.burn.dvTarget - st.burn.dvDone;
        if (g.eiPred) out.eiPred = g.eiPred, out.tEI = g.eiPred.tEI - st.t;
      }
      if (this.phase === "entry") {
        out.bankCmd = g.bankCmd; out.bankMag = g.bankMag; out.reverseCue = g.reverseCue; out.dpsi = g.dpsi; out.deadband = g.deadband;
        out.predRangeErrNow = g.predNow ? (g.predNow.skip ? "skip" : g.predNow.rangeErr) : null;
        out.predCrossNow = g.predNow ? g.predNow.cross : null;
        out.alphaCmd = S.alphaSchedule(d.mach);
      }
      if (this.phase === "approach" && g.appr) out.appr = g.appr;
      out.next = this._nextStep(d, out);
      out.path = this._refPath(d, out);
      if (this.phase === "rollout" && st.ground) out.rollout = { x: st.ground.x, y: st.ground.y, V: st.ground.V, noseDown: st.ground.noseDown, remaining: S.RWY.length - st.ground.x };
      return out;
    }
  }
  // ---- reference path for the on-screen guidance ribbon ("where the orbiter should go")
  //   rwy : runway-frame points [x, y, h] (approach, rollout)
  //   ecef: Earth-fixed points [x, y, z] m along the great circle to KSC, descending (entry)
  //   dir : a direction the nose (or the vehicle) should point, ECI unit vector + length (orbit tasks)
  ShuttleMission.prototype._refPath = function (d, gv) {
    const st = this.st, ph = this.phase;
    if (this.failure || this.result) return null;
    if (ph === "approach" || ph === "rollout") return { frame: "rwy", pts: S.approachPath(st) };
    if (ph === "entry") {
      const ll = S.ecefToLL(S.eciToEcef(st.r, S.gmst(st))), rw = S.SITES.runway;
      const a = S.llhToEcef(ll.lat, ll.lon, 0), b = S.llhToEcef(rw.lat, rw.lon, 0);
      const ua = unit(a), ub = unit(b), ang = Math.acos(clamp(dot(ua, ub), -1, 1)), n = Math.max(28, Math.min(400, Math.round(ang * S.RE / 10000))), pts = [];   // ~10 km spacing
      const alt0 = d.altitudeM, alt1 = 25000;
      for (let i = 1; i <= n; i++) {
        const t = i / n, sa = Math.sin((1 - t) * ang) / Math.sin(ang || 1e-9), sb = Math.sin(t * ang) / Math.sin(ang || 1e-9);
        const u = unit(add(scl(ua, sa), scl(ub, sb)));
        pts.push(scl(u, S.RE + alt0 + (alt1 - alt0) * t));
      }
      return { frame: "ecef", pts };
    }
    if (ph === "payload" && st.cfg.payload && this.flags.payloadGo) return { frame: "dir", dir: S.quat.qrot(S.lvlh(st.r, st.v).q, [0, 0, 1]), len: 70, what: "nose" };
    if (ph === "payload" && st.payload.released && this.obj.deploy_verified !== "done") return { frame: "dir", dir: scl(S.quat.qAxes(st.q).y, -1), len: 60, what: "move" };
    if (ph === "deorbit" && st.bay.doors <= 0 && !(st.burn && st.burn.complete)) return { frame: "dir", dir: scl(unit(st.v), -1), len: 70, what: "nose" };
    if (ph === "insertion" && st.burn && !st.burn.complete) return { frame: "dir", dir: unit(st.v), len: 70, what: "nose" };
    return null;
  };

  // ---- one plain-language "what to do now" line per moment, tagged with the seat that does it.
  // Attitude cues name the key to hold, worked out from the body-axis rotation still needed.
  // Body axes: X left, Y dorsal, Z nose. Keys: S/W pitch up/down, Q/E yaw left/right (rudder), A/D roll left/right.
  ShuttleMission.prototype._attCue = function (rotBody) {
    const ax = [Math.abs(rotBody[0]), Math.abs(rotBody[1]), Math.abs(rotBody[2])];
    // stick with the axis already being worked on until it is nearly done (no flip-flopping cues)
    let i = ax.indexOf(Math.max(...ax)), p = this.guid.cueAxis;
    if (p !== undefined && ax[p] > 3 * DEG && ax[i] < 2.5 * ax[p]) i = p;
    this.guid.cueAxis = i;
    const sgn = Math.sign(rotBody[i]) || 1, deg = ax[i] / DEG;
    const opt = [[sgn > 0 ? "W" : "S", sgn > 0 ? "pitch nose DOWN" : "pitch nose UP"], [sgn > 0 ? "Q" : "E", sgn > 0 ? "yaw LEFT" : "yaw RIGHT"], [sgn > 0 ? "D" : "A", sgn > 0 ? "roll RIGHT" : "roll LEFT"]][i];
    return { key: opt[0], what: opt[1], deg };
  };
  ShuttleMission.prototype._rotTo = function (target) {      // body-frame rotation vector q -> target
    let e = S.quat.qmul(S.quat.qconj(this.st.q), target); if (e[0] < 0) e = e.map((x) => -x);
    const sv = Math.hypot(e[1], e[2], e[3]); if (sv < 1e-9) return [0, 0, 0];
    const ang = 2 * Math.atan2(sv, e[0]); return [e[1] / sv * ang, e[2] / sv * ang, e[3] / sv * ang];
  };
  ShuttleMission.prototype._nextStep = function (d, gv) {
    const st = this.st, o = this.obj, ph = this.phase, step = (seat, key, text, detail) => ({ seat, key, text, detail: detail || "" });
    if (this.failure) return step("cdr", "", "MISSION FAILED — choose a checkpoint to retry", this.failure.reason || "");
    if (this.result) return step("all", "", "MISSION COMPLETE — debrief", "");
    if (this.paused) return step("cdr", "Esc", "PAUSED — Commander resumes", "");
    const holdCue = (rot, goal, lim) => {
      if (st.dap.mode !== "HOLD") {
        const w = sub(st.w, S.orbitRateBody(st)), wm = norm(w);
        if (wm > 0.45 * DEG) {             // FREE: keys add rotation; hold the key that opposes the biggest spin
          const ab = w.map(Math.abs); let i = ab.indexOf(Math.max(...ab)); const pw = this.guid.spinAxis;
          if (pw !== undefined && ab[pw] > 0.12 * DEG && ab[i] < 2 * ab[pw]) i = pw;
          this.guid.spinAxis = i; const sg = Math.sign(w[i]);
          const k = [[sg > 0 ? "S" : "W", sg > 0 ? "nose is pitching DOWN" : "nose is pitching UP"], [sg > 0 ? "E" : "Q", sg > 0 ? "nose is yawing LEFT" : "nose is yawing RIGHT"], [sg > 0 ? "A" : "D", sg > 0 ? "rolling RIGHT" : "rolling LEFT"]][i];
          return step("cdr", k[0], `Stop the tumble: tap [${k[0]}] — ${k[1]}`, `Spin ${(wm / DEG).toFixed(2)}°/s. Get it under 0.45°/s, then the next step is [H] attitude hold.`);
        }
        return step("cdr", "H", "Engage ATTITUDE HOLD", "The autopilot holds the orbiter steady. Your keys then turn it and it stays where you leave it.");
      }
      const c = this._attCue(rot);
      if (norm(rot) / DEG <= lim * 0.7) return step("cdr", "", "Hands off — let it settle", `${goal}: within ${lim}°, waiting for rotation to stop`);
      return step("cdr", c.key, `Hold [${c.key}] — ${c.what} ${c.deg.toFixed(0)}°`, `${goal}. Total error ${(norm(rot) / DEG).toFixed(0)}°, needs < ${lim}°. Release the key to stop turning.`);
    };
    switch (ph) {
      case "briefing": return step("cdr", "Enter", "Commander: START THE COUNTDOWN", "Everyone else: check your crew job on the left");
      case "prelaunch": return step("all", "", `Launch countdown T-${Math.max(0, this.countdown || 0).toFixed(0)} s — automatic`, "Drag mouse to look around");
      case "ascent": return step("all", "", "Automatic rocket climb — watch the view", "Drag to look · wheel to zoom · [F] recenter");
      case "insertion":
        if (!st.burn) return step("plt", "B", "Start the orbit-push burn", "Without it the low side of your path dips back into Earth's air");
        if (!st.burn.complete && !st.burn.active && (st.burn.tig - st.t) > 60) return step("plt", "T", "Jump ahead to the burn", `Engine fires in ${(st.burn.tig - st.t).toFixed(0)} s`);
        if (!st.burn.complete) return step("all", "", st.burn.active ? "Orbit engine firing — automatic" : "Burn starting soon — automatic", "");
        return step("all", "", "Checking your orbit path…", "");
      case "payload": {
        if (st.cfg.payload) {
          if (st.bay.doors < 0.999) return st.bay.cmd > 0 ? step("ms1", "", `Cargo doors opening ${(st.bay.doors * 100).toFixed(0)}%`, "") : step("ms1", "Y", "Open the cargo bay doors", "Lets the satellite out and cools the ship");
          if (!st.payload.power) return step("ms2", "P", "Turn on satellite power", "");
          if (!st.payload.ready) return step("ms2", "", "Satellite self-check running…", "Pilot can speed up time with [.]");
          if (!this.flags.payloadGo) return step("ms2", "N", "Approve satellite release", "Self-check passed: confirm the satellite is healthy");
          return (() => { const r = holdCue(this._rotTo(S.lvlh(st.r, st.v).q), "Cargo bay pointing straight up, nose facing forward", 10);
            if (r.key === "" && this._releaseErr() <= 10 * DEG && this._relRate() <= 0.15 * DEG) return step("ms1", "R", "RELEASE the satellite", "All safety checks clear");
            return r; })();
        }
        if ((st.payload.sepDv || 0) < 0.3 || (st.payload.rangeRate || 0) < 0.8) return step("ms1", "K", "Hold [K] — drift down away from the satellite", `Move away until pulling apart at ≥ 0.8 m/s (now ${(st.payload.rangeRate || 0).toFixed(2)})`);
        return step("plt", ".", `Drifting clear — ${((st.payload.range || 0)).toFixed(0)} / 150 m`, "Pilot can speed up time with [.]");
      }
      case "deorbit": {
        if (st.burn && st.burn.complete) return step("all", "", "Return burn finished — dropping toward Earth's air", `Re-entry starts in ${(gv.tEI || 0).toFixed(0)} s`);
        if (st.burn) return step("all", "", st.burn.active ? "Return braking burn — automatic" : `Return burn in ${(st.burn.tig - st.t).toFixed(0)} s`, "Auto-steer holds nose pointing backward");
        if (st.bay.doors > 0) return step("ms1", "Y", "Close the cargo bay doors", "Needed before hitting the air");
        if (this.plan && this.plan.tig - st.t > 400) return step("plt", "T", "Fast-forward to return burn spot", "");
        if (this._retroErr() > 5 * DEG) {
          const tgt = S.quat.qrot(S.quat.qconj(st.q), scl(unit(st.v), -1)), ang = Math.acos(clamp(tgt[2], -1, 1)), h = Math.hypot(tgt[0], tgt[1]) || 1;
          const rot = [-tgt[1] / h * ang, tgt[0] / h * ang, 0];      // axis = z × target (no roll needed)
          const r = holdCue(rot, "Point nose backward along the flight path", 5);
          return r;
        }
        if (this._relRate() > 0.18 * DEG) return step("cdr", "", "Hands off — let it settle", `Nose pointed backward; steady hold is stopping spin (${(this._relRate() / DEG).toFixed(2)}°/s, needs < 0.20)`);
        return step("plt", "B", "Start the RETURN burn", "Nose pointed backward and steady");
      }
      case "entry": return step("cdr", "A/D", gv.reverseCue ? `FLIP SIDE — roll ${gv.bankCmd >= 0 ? "RIGHT [D]" : "LEFT [A]"}` : `Tilt wings ${Math.abs((gv.bankCmd || 0) / DEG).toFixed(0)}° ${gv.bankCmd >= 0 ? "right" : "left"}`, "Tilting your wings steers lift: steeper tilt drops faster to land sooner");
      case "approach": {
        const a = gv.appr;
        if (a && a.gearCue && !st.flight.gearCmd) return step("plt", "G", "Lower landing wheels [G]", "");
        return step("cdr", "W/S A/D", a && (a.mode === "FLARE" || a.mode === "PREFLARE") ? "PULL UP GENTLY — ease nose up [S] before touching down" : "Follow yellow aim line: nose down/up [W/S], tilt wings [A/D]", "W/S sets glide slope and holds when you let go · Speed brake [X] open / [Z] close if fast");
      }
      case "rollout": return step("cdr", "Space", st.ground && st.ground.noseDown ? "Hold brakes [Space] and steer [Q/E] down the center line" : "Lower the nose [W]", "");
      default: return step("all", "", "", "");
    }
  };

  function fmtT(t) { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }

  // Crew roles (co-op). Each command / control axis belongs to one seat, as on a real flight deck.
  // Unfilled seats are flown by the Commander (or the room host), so 1–4 players can fly.
  const CREW = {
    roles: ["cdr", "plt", "ms1", "ms2"],
    info: {
      cdr: { title: "Commander", short: "CDR", duty: "Steers the ship in space, tilts wings during re-entry, glides onto the runway & brakes; picks retries" },
      plt: { title: "Pilot", short: "PLT", duty: "Starts big engine burns, speeds up wait time, toggles auto nose angle, air brakes & landing wheels" },
      ms1: { title: "Mission Specialist 1", short: "MS1", duty: "Cargo bay crew: opens cargo doors, releases satellite, steers gently away afterward" },
      ms2: { title: "Mission Specialist 2", short: "MS2", duty: "Satellite lead: turns on satellite power, checks self-test & approves release" },
    },
    commandRole: {
      START: "cdr", PAUSE: "cdr", RETRY_CHECKPOINT: "cdr", RESTART: "cdr", DAP_HOLD: "cdr",
      AUTHORIZE_BURN: "plt", COAST_TO_TIG: "plt", SET_WARP: "plt", TOGGLE_AOA_ASSIST: "plt", DEPLOY_GEAR: "plt",
      OPEN_BAY: "ms1", CLOSE_BAY: "ms1", RELEASE_PAYLOAD: "ms1",
      PAYLOAD_POWER: "ms2", PAYLOAD_GO: "ms2",
    },
    axisRole: { pitch: "cdr", yaw: "cdr", roll: "cdr", brake: "cdr", tx: "ms1", ty: "ms1", tz: "ms1", sb: "plt" },
  };

  const api = { ShuttleMission, PHASES, OBJECTIVES, CHECKPOINTS, WARP_LIMIT, DT, fmtT, CREW };
  root.ShuttleMissionLib = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
