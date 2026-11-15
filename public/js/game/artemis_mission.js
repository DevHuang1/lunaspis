/*
 * artemis_mission.js — deterministic 13-phase mission state machine for the
 * Artemis II-inspired crewed lunar flyby simulation.
 *
 * The mission is server-authoritative in co-op and also runs headless in Node
 * for automated checks. It owns phase guards, resource budgets, checkpoints,
 * crew/duty assignments, continuous orbital/entry state propagation, and the
 * read-only snapshot consumed by the client.
 */
(function (root) {
  "use strict";
  const SIM = root.ArtemisSim || (typeof require !== "undefined" ? require("./artemis_simulation.js") : null);
  const { vec, quat } = SIM;
  const clamp = SIM.clamp;
  const DEG = SIM.DEG;
  const DT = 1 / 30;
  const COAST_STEP = 60;

  // All 13 active mission phases (plus "debrief" view state after Phase 13 completion)
  const PHASES = [
    "briefing",       // Phase 1: Mission Briefing & Crew Preparation
    "launch_prep",    // Phase 2: Crew Transportation & Launch Preparation (LC-39B)
    "launch",         // Phase 3: SLS Launch & Ascent
    "earth_orbit",    // Phase 4: Earth Orbit, Solar Arrays, HEO Burn & Systems Checkout
    "prox_ops",       // Phase 5: Proximity Operations Demonstration (with ICPS)
    "tli_prep",       // Phase 6: Trans-Lunar Injection (TLI)
    "outbound",       // Phase 7: Outbound Deep-Space Cruise (~4 days)
    "lunar_flyby",    // Phase 8: Lunar Far-Side Flyby & Communications Blackout
    "return_coast",   // Phase 9: Free-Return Journey to Earth (~4 days)
    "entry",          // Phase 10: Service Module Separation & Atmospheric Entry
    "chutes",         // Phase 11: 11-Parachute Deployment Sequence
    "splashdown",     // Phase 12: Pacific Ocean Splashdown
    "recovery",       // Phase 13: Crew Recovery Operations & Mission Debrief
    "debrief"
  ];

  const PHASE_META = {
    briefing:     { num: 1,  title: "PHASE 1 — MISSION BRIEFING & CREW PREPARATION" },
    launch_prep:  { num: 2,  title: "PHASE 2 — CREW TRANSPORT & PAD 39B PREPARATION" },
    launch:       { num: 3,  title: "PHASE 3 — SLS BLOCK 1 LAUNCH & ASCENT" },
    earth_orbit:  { num: 4,  title: "PHASE 4 — EARTH ORBIT, HEO BURN & SYSTEMS CHECKOUT" },
    prox_ops:     { num: 5,  title: "PHASE 5 — PROXIMITY OPERATIONS DEMONSTRATION" },
    tli_prep:     { num: 6,  title: "PHASE 6 — TRANS-LUNAR INJECTION (TLI)" },
    outbound:     { num: 7,  title: "PHASE 7 — OUTBOUND DEEP-SPACE CRUISE" },
    lunar_flyby:  { num: 8,  title: "PHASE 8 — LUNAR FAR-SIDE FLYBY" },
    return_coast: { num: 9,  title: "PHASE 9 — FREE-RETURN JOURNEY TO EARTH" },
    entry:        { num: 10, title: "PHASE 10 — SM SEPARATION & ATMOSPHERIC ENTRY" },
    chutes:       { num: 11, title: "PHASE 11 — 11-PARACHUTE DEPLOYMENT SEQUENCE" },
    splashdown:   { num: 12, title: "PHASE 12 — PACIFIC OCEAN SPLASHDOWN" },
    recovery:     { num: 13, title: "PHASE 13 — CREW RECOVERY & MISSION DEBRIEF" },
    debrief:      { num: 13, title: "PHASE 13 — MISSION DEBRIEF COMPLETE" }
  };

  const OBJECTIVES = [
    { id: "briefing_prep",   phase: "briefing",     label: "1. Complete crew readiness & spacecraft checks; authorize launch" },
    { id: "pad_prep",        phase: "launch_prep",  label: "2. Transport crew to LC-39B, ingress Orion, load SLS cryo propellants & commit launch" },
    { id: "launch",          phase: "launch",       label: "3. Launch SLS Block 1, separate SRBs/fairings/LAS/Core & reach initial Earth orbit" },
    { id: "earth_checkout",  phase: "earth_orbit",  label: "4. Deploy solar arrays, execute ICPS HEO burn, complete 24h systems checkout & separate ICPS" },
    { id: "prox_ops",        phase: "prox_ops",     label: "5. Fly Proximity Operations demo with ICPS target (approach <=38m, then separate >=85m)" },
    { id: "tli",             phase: "tli_prep",     label: "6. Verify maneuver readiness & execute the Trans-Lunar Injection (TLI) burn" },
    { id: "outbound_cruise", phase: "outbound",     label: "7. Complete deep-space checks, radiation shelter drill & outbound coast to Lunar Flyby gate" },
    { id: "lunar_flyby",     phase: "lunar_flyby",  label: "8. Fly ~4,600 mi behind the Moon, photograph far side & clear communications blackout" },
    { id: "return_coast",    phase: "return_coast", label: "9. Monitor 4-day free-return trajectory, run return checks/trim & reach Entry Interface" },
    { id: "entry",           phase: "entry",        label: "10. Separate Service Module, orient heat shield & survive ~25,000 mph / 4G / 5,000°F entry" },
    { id: "chutes",          phase: "chutes",       label: "11. Deploy all 11 parachutes (3 FBC + 2 drogues at 25,000 ft; 3 pilots + 3 mains at 9,000 ft)" },
    { id: "splashdown",      phase: "splashdown",   label: "12. Splash down <20 mph in the Pacific Ocean, deploy uprighting bags & confirm crew safe" },
    { id: "recovery",        phase: "recovery",     label: "13. Deploy inflatable front porch, extract crew by helicopter to recovery ship & open debrief" }
  ];

  const CHECKPOINTS = [
    "launch_prep", "launch", "earth_orbit", "prox_ops", "tli_prep",
    "outbound", "lunar_flyby", "return_coast", "entry", "chutes", "splashdown", "recovery"
  ];

  const WARP_LIMIT = {
    briefing: 1,
    launch_prep: 10,
    launch: 25,
    earth_orbit: 2000,
    prox_ops: 4,
    tli_prep: 2000,
    outbound: 10000,
    lunar_flyby: 500,
    return_coast: 10000,
    entry: 20,
    chutes: 10,
    splashdown: 2,
    recovery: 2,
    debrief: 1
  };

  // Preserves the 4 server duty keys so server.js assignArtemisDuties works without change
  const DUTIES = {
    surface_pilot:   { label: "Mission Commander (CDR)",        short: "CDR",     color: "#fbbf24", crewName: "Reid Wiseman" },
    orion_nav:       { label: "Orion Pilot & Navigation (PLT)", short: "PLT-NAV", color: "#67e8f9", crewName: "Victor Glover" },
    surface_science: { label: "Mission Specialist 1 (MS1)",     short: "MS-1",    color: "#7fb8a6", crewName: "Christina Koch" },
    orion_systems:   { label: "Mission Specialist 2 (MS2)",     short: "MS-2",    color: "#c4b5fd", crewName: "Jeremy Hansen" }
  };

  const COMMAND_DUTY = {
    CREW_CHECK: "surface_pilot",
    SPACECRAFT_CHECK: "orion_systems",
    START: "surface_pilot",
    CREW_INGRESS: "surface_pilot",
    LOAD_PROPELLANT: "orion_systems",
    COMMIT_LAUNCH: "surface_pilot",
    STAGE_SRB: "orion_nav",
    JETTISON_LAS: "orion_nav",
    DEPLOY_SOLAR_ARRAYS: "orion_systems",
    CHECKOUT: "orion_systems",
    HEO_BURN: "orion_nav",
    ORION_CHECK: "orion_systems",
    SEPARATE_ICPS: "orion_nav",
    PROX_APPROACH: "surface_pilot",
    PROX_HOLD: "surface_pilot",
    PROX_RETREAT: "surface_pilot",
    AUTO_PROX: "orion_nav",
    AUTO_DOCK: "orion_nav",
    CONFIRM_PROX_EXIT: "surface_pilot",
    VERIFY_TLI: "orion_nav",
    TLI: "orion_nav",
    RADIATION_DRILL: "surface_science",
    TRAJECTORY_TRIM: "orion_nav",
    LUNAR_OBSERVATION: "surface_science",
    CONFIRM_FLYBY_EXIT: "orion_nav",
    RETURN_CHECK: "orion_systems",
    RETURN_TRIM: "orion_nav",
    SEPARATE_SM: "orion_systems",
    ENTRY_PREP: "orion_nav",
    DEPLOY_DROGUES: "orion_nav",
    DEPLOY_MAINS: "orion_nav",
    DEPLOY_CHUTE: "orion_nav",
    STABILIZE_CAPSULE: "orion_systems",
    CONFIRM_CREW_SAFE: "surface_pilot",
    DEPLOY_FRONT_PORCH: "surface_science",
    HELICOPTER_EXTRACTION: "surface_pilot",
    DEBRIEF: "surface_pilot",
    ABORT: "orion_nav",
    SET_ASSIST: "surface_pilot",
    PAUSE: "surface_pilot",
    SET_WARP: "surface_pilot",
    RETRY_CHECKPOINT: "surface_pilot",
    RESTART: "surface_pilot"
  };

  const CREW_ROSTER = [
    { id: "cdr", name: "Reid Wiseman",   role: "Commander (NASA)",            duty: "surface_pilot",   status: "NOMINAL" },
    { id: "plt", name: "Victor Glover",  role: "Pilot (NASA)",                duty: "orion_nav",       status: "NOMINAL" },
    { id: "ms1", name: "Christina Koch", role: "Mission Specialist 1 (NASA)", duty: "surface_science", status: "NOMINAL" },
    { id: "ms2", name: "Jeremy Hansen",  role: "Mission Specialist 2 (CSA)",  duty: "orion_systems",   status: "NOMINAL" }
  ];

  const fmtT = (t) => {
    const neg = t < 0;
    const s = Math.floor(Math.abs(t || 0));
    const body = `${String(Math.floor(s / 86400)).padStart(2, "0")}:${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    return neg ? `-${body}` : body;
  };

  class ArtemisMission {
    constructor(opts) {
      this.opts = opts || {};
      this.serial = 0;
      this.reset();
    }

    reset() {
      this.serial += 1;
      this.missionId = `ART2-${String(this.serial).padStart(2, "0")}-${Date.now().toString(36).slice(-4)}`;
      this.revision = 0;
      this.eventSeq = 0;
      this.phase = "briefing";
      this.t = 0;
      this.warp = 1;
      this.warpReq = 1;
      this.paused = false;
      this.exited = false;
      this.eventHold = null;
      this.assist = true;
      this.autoDock = false;
      this.autoLand = false;

      this.obj = {};
      OBJECTIVES.forEach((o) => (this.obj[o.id] = "pending"));
      this.failure = null;
      this.result = null;
      this.retries = 0;
      this.checkpoints = {};
      this.messages = [];
      this.events = [];
      this.log = [];

      this.flags = {
        crewReady: false,
        spacecraftChecked: false,
        launchAuthorized: false,
        crewIngress: false,
        propLoaded: false,
        launchCommitted: false,
        rofi: false,
        rs25: false,
        launchLiftoff: false,
        maxQ: false,
        srbSep: false,
        fairingSep: false,
        lasJettison: false,
        meco: false,
        coreSep: false,
        orbit: false,
        solarArrays: false,
        checkout: false,
        heoBurn: false,
        orionCheck: false,
        icpsSep: false,
        proxInspected: false,
        proxRetreated: false,
        proxDone: false,
        tliVerified: false,
        tli: false,
        outboundCheck: false,
        radiationDrill: false,
        outboundTrim: false,
        flybyStarted: false,
        blackoutEntered: false,
        perilunePassed: false,
        blackoutCleared: false,
        lunarObserved: false,
        flybyDone: false,
        returnCheck: false,
        returnTrim: false,
        smSeparated: false,
        entryReady: false,
        entryDone: false,
        fbcDeployed: false,
        droguesDeployed: false,
        pilotsDeployed: false,
        mainsDeployed: false,
        splash: false,
        capsuleStabilized: false,
        crewConfirmedSafe: false,
        frontPorch: false,
        crewExtracted: false,
        recoveryComplete: false
      };

      this.crew = {
        surface: this.opts.surfaceCrew || ["surface-1", "surface-2"],
        orion: this.opts.orionCrew || ["orion-1", "orion-2"],
        roster: CREW_ROSTER.map((c) => Object.assign({}, c))
      };
      this.duties = this.opts.duties || null;

      const pad = SIM.ascentProfile(-15);
      this.orion = SIM.makeVehicle("orion", pad.r, pad.v, [1, 0, 0, 0]);
      // Preserved dummy lander object in snapshot so any legacy consumer reading vessel.lander does not throw
      this.lander = SIM.makeVehicle("lander", [SIM.RM + 100000, 0, 0], [0, 0, 0], [1, 0, 0, 0]);
      this.icps = {
        prop: SIM.VEHICLES.icps.prop,
        propStart: SIM.VEHICLES.icps.prop,
        dry: SIM.VEHICLES.icps.dry,
        isp: SIM.VEHICLES.icps.isp,
        attached: true,
        r: pad.r.slice(),
        v: pad.v.slice()
      };

      this.launch = {
        elapsed: -15,
        stage: "prelaunch",
        propLoadPct: 0,
        padReady: false,
        maxQ: 0,
        alt: 0,
        speed: 0,
        accelG: 0,
        pitchDeg: 90,
        thrustMlbs: 0,
        srbPropPct: 100,
        corePropPct: 100,
        slsProp: SIM.VEHICLES.sls.prop
      };

      this.orbitState = {
        initialOrbitElapsed: 0,
        heoElapsed: 0,
        tliPrepElapsed: 0,
        periapsisAltKm: 200,
        apoapsisAltKm: 2200,
        periodHours: 1.5
      };

      // Phase 5 Proximity Operations state (Orion relative to separated ICPS + adapter)
      this.prox = {
        active: false,
        pos: [0, 0, 75],
        vel: [0, 0, 0],
        rates: [0, 0, 0],
        range: 75,
        minRange: 75,
        maxRange: 75,
        closure: 0,
        lateral: 0,
        alignErr: 2.2,
        inspected: false,
        retreated: false,
        autoMode: false,
        guided: null
      };
      // Alias for snapshot compatibility
      this.docking = this.prox;

      this.tliPlan = null;
      this.teiPlan = null;

      this.flyby = {
        active: false,
        inBlackout: false,
        blackoutDuration: 0,
        closestAltKm: Infinity,
        maxEarthDistKm: 0,
        lunarObserved: false,
        perilunePassed: false,
        blackoutEntered: false,
        blackoutCleared: false
      };

      this.entry = {
        smSeparated: false,
        ready: false,
        active: false,
        alt: SIM.ENTRY_ALT,
        speed: 10998,
        gamma: -1.4 * DEG,
        bank: 0,
        chute: false,
        heat: 0,
        tempF: 70,
        loadG: 0,
        maxHeat: 0,
        maxTempF: 70,
        maxG: 0,
        downrange: 0,
        plasmaBlackout: false
      };

      this.chutes = {
        active: false,
        fbcDeployed: false,
        droguesDeployed: false,
        pilotsDeployed: false,
        mainsDeployed: false,
        totalDeployed: 0,
        stageLabel: "STOWED"
      };

      this.splashdownState = {
        splashed: false,
        speedMps: 0,
        speedMph: 0,
        stabilized: false,
        uprightBags: false,
        crewSafe: false,
        latDeg: 32.5,
        lonDeg: -118.2,
        region: SIM.SPLASHDOWN.region
      };

      this.recoveryState = {
        active: false,
        shipOnStation: false,
        frontPorch: false,
        crewExtracted: false,
        shipRecovered: false
      };

      this.telemetry = {
        maxSpeedMps: 0,
        maxEarthDistKm: SIM.RE / 1000,
        closestLunarAltKm: Infinity,
        maxEntryG: 0,
        maxHeatTempF: 70,
        photos: 0,
        observations: 0
      };

      this.descent = { active: false, siteId: SIM.SITES[0].id, alt: 0, vx: 0, vy: 0, vz: 0, slope: 0 };
      this.surface = { active: false, elapsed: 0, samples: 0, photos: 0, tasks: {}, astronauts: {}, targets: {} };
      this.returnAbort = false;

      this._say("Artemis II Crewed Lunar Flyby ready. Complete Phase 1 crew & spacecraft readiness checks, then authorize launch preparation.", "info");
      return this;
    }

    // ---------------------------------------------------------------- events & checkpoints
    _emit(type, data) {
      const e = Object.assign({ id: `${this.missionId}-${++this.eventSeq}`, type, t: this.t, phase: this.phase }, data || {});
      this.events.push(e);
      this.revision++;
      return e;
    }

    _say(text, level) {
      this.messages.push({ t: this.t, text, level: level || "info" });
      if (this.messages.length > 60) this.messages.shift();
      this.log.push({ t: this.t, text, level: level || "info" });
      if (this.log.length > 200) this.log.shift();
    }

    drainEvents() {
      const e = this.events;
      this.events = [];
      return e;
    }

    _done(id) {
      if (this.obj[id] !== "done") {
        this.obj[id] = "done";
        this._emit("OBJECTIVE_DONE", { objective: id });
      }
    }

    _setPhase(p) {
      if (this.phase !== p) {
        const from = this.phase;
        this.phase = p;
        const meta = PHASE_META[p];
        this._emit("PHASE_CHANGED", { from, to: p, phaseNumber: meta ? meta.num : 1 });
        this._say(meta ? meta.title : `PHASE: ${String(p).toUpperCase()}`, "info");
        if (CHECKPOINTS.includes(p)) this._saveCheckpoint(p);
      }
    }

    _saveCheckpoint(name) {
      if (!name) return;
      this.checkpoints[name] = JSON.stringify({
        v: 2,
        phase: this.phase,
        t: this.t,
        orion: this.orion,
        icps: this.icps,
        launch: this.launch,
        orbitState: this.orbitState,
        prox: this.prox,
        tliPlan: this.tliPlan,
        teiPlan: this.teiPlan,
        flyby: this.flyby,
        entry: this.entry,
        chutes: this.chutes,
        splashdownState: this.splashdownState,
        recoveryState: this.recoveryState,
        telemetry: this.telemetry,
        obj: this.obj,
        flags: this.flags,
        crew: this.crew,
        returnAbort: this.returnAbort,
        assist: this.assist
      });
      this._emit("CHECKPOINT_SAVED", { name });
    }

    _restore(name) {
      const c = JSON.parse(this.checkpoints[name]);
      if (c.v !== 2) throw new Error("Unsupported Artemis checkpoint version");
      this.phase = c.phase;
      this.t = c.t;
      this.orion = c.orion;
      this.icps = c.icps;
      this.launch = c.launch;
      this.orbitState = c.orbitState;
      this.prox = c.prox;
      this.docking = this.prox;
      this.tliPlan = c.tliPlan;
      this.teiPlan = c.teiPlan;
      this.flyby = c.flyby;
      this.entry = c.entry;
      this.chutes = c.chutes;
      this.splashdownState = c.splashdownState;
      this.recoveryState = c.recoveryState;
      this.telemetry = c.telemetry;
      this.obj = c.obj;
      this.flags = c.flags;
      this.crew = c.crew;
      this.returnAbort = c.returnAbort;
      this.assist = c.assist;
      this.failure = null;
      this.result = null;
      this.paused = false;
      this.eventHold = null;
      this.warp = 1;
      this.warpReq = 1;
      this.retries += 1;
      this._emit("RESTORED", { name });
      this._say(`Restored checkpoint ${name.toUpperCase()} — spacecraft state, trajectory, crew and resources restored.`, "warn");
    }

    _bestCheckpoint() {
      for (let i = CHECKPOINTS.length - 1; i >= 0; i--) {
        if (this.checkpoints[CHECKPOINTS[i]]) return CHECKPOINTS[i];
      }
      return null;
    }

    _fuelMargins() {
      return {
        orionPropKg: Math.round(this.orion.prop),
        orionRcsKg: Math.round(this.orion.rcs),
        icpsPropKg: Math.round(this.icps.prop),
        landerDescentKg: 0,
        landerAscentKg: 0,
        landerRcsKg: 0
      };
    }

    _fail(reason, extra) {
      if (this.failure || this.result) return;
      this.failure = Object.assign({ reason, phase: this.phase, t: this.t, checkpoint: this._bestCheckpoint() }, extra || {});
      this.paused = true;
      this.eventHold = "failure";
      this.result = this._buildResult(false, false);
      this._emit("FAILED", { reason, checkpoint: this.failure.checkpoint });
      this._say(`MISSION FAILURE — ${reason}`, "fail");
    }

    _buildResult(success, abort) {
      const completedObjectives = OBJECTIVES.filter((o) => this.obj[o.id] === "done").map((o) => o.label);
      return {
        success: !!success,
        abort: !!abort,
        failure: this.failure || null,
        samples: this.telemetry.observations,
        photos: this.telemetry.photos,
        observations: this.telemetry.observations,
        fuel: this._fuelMargins(),
        assistance: this.assist,
        retries: this.retries,
        met: this.t,
        durationDays: +(this.t / 86400).toFixed(2),
        maxSpeedMps: Math.round(this.telemetry.maxSpeedMps),
        maxSpeedMph: Math.round(this.telemetry.maxSpeedMps * 2.236936),
        maxEarthDistKm: Math.round(this.telemetry.maxEarthDistKm),
        maxEarthDistMi: Math.round(this.telemetry.maxEarthDistKm * 0.621371),
        closestLunarAltKm: Number.isFinite(this.telemetry.closestLunarAltKm) ? Math.round(this.telemetry.closestLunarAltKm) : null,
        closestLunarAltMi: Number.isFinite(this.telemetry.closestLunarAltKm) ? Math.round(this.telemetry.closestLunarAltKm * 0.621371) : null,
        maxEntryG: +this.telemetry.maxEntryG.toFixed(2),
        maxHeatTempF: Math.round(this.telemetry.maxHeatTempF),
        splashdown: this.splashdownState.splashed ? {
          vertical: +this.splashdownState.speedMps.toFixed(1),
          horizontal: 0,
          speedMps: +this.splashdownState.speedMps.toFixed(1),
          speedMph: +this.splashdownState.speedMph.toFixed(1),
          region: this.splashdownState.region
        } : null,
        completedObjectives,
        crewStatus: "ALL 4 CREW SAFE & RECOVERED",
        spacecraftStatus: this.splashdownState.splashed ? "ORION CM RECOVERED ABOARD NAVY LPD" : "IN FLIGHT"
      };
    }

    // ---------------------------------------------------------------- commands
    command(type, args) {
      args = args || {};
      const r = this._command(type, args);
      if (!r.accepted) {
        this._emit("COMMAND_REJECTED", { command: type, reason: r.reason });
        if (type !== "SET_WARP" && type !== "SET_ASSIST") this._say(`${type}: ${r.reason}`, "warn");
      } else if (!["SET_WARP", "SET_ASSIST", "PAUSE"].includes(type)) {
        this._emit("COMMAND_ACCEPTED", { command: type });
      }
      return r;
    }

    _command(type, a) {
      const ok = (msg) => { if (msg) this._say(msg, "info"); return { accepted: true }; };
      const no = (reason) => ({ accepted: false, reason });
      if (this.exited) return no("Mission exited");
      if (this.result && !["RESTART", "RETRY_CHECKPOINT", "EXIT", "DEBRIEF"].includes(type)) {
        return no("Mission is complete — open debrief, retry a checkpoint, or return to the lobby");
      }

      switch (type) {
        case "PAUSE":
          this.paused = !this.paused;
          return ok(this.paused ? "Simulation paused." : "Simulation resumed.");
        case "EXIT":
          this.exited = true;
          this.paused = true;
          this._emit("EXITED");
          return ok("Mission exited.");
        case "RESTART":
          this.reset();
          return ok("Mission reset to Phase 1 Briefing.");
        case "RETRY_CHECKPOINT": {
          const name = a.name || (this.failure && this.failure.checkpoint) || this._bestCheckpoint();
          if (!name || !this.checkpoints[name]) return no("No checkpoint available");
          this._restore(name);
          return ok(`Restored checkpoint ${name.toUpperCase()}.`);
        }
        case "SET_WARP": {
          const max = this._warpLimit();
          const f = Math.max(1, Math.min(10000, Math.round(Number(a.factor) || 1)));
          if (f > max) {
            this.warpReq = max;
            return no(`Time acceleration limited to ${max}× in ${this.phase.replace(/_/g, " ").toUpperCase()}`);
          }
          this.warpReq = f;
          if (this.paused && !this.eventHold) this.paused = false;
          return { accepted: true };
        }
        case "SET_ASSIST":
          this.assist = a.on === undefined ? !this.assist : !!a.on;
          return ok(`Flight guidance assist ${this.assist ? "ON" : "OFF"}.`);

        // ---------------- Phase 1: Mission Briefing & Crew Preparation ----------------
        case "CREW_CHECK":
          if (this.phase !== "briefing") return no("Crew preparation check is part of Phase 1 Briefing");
          this.flags.crewReady = true;
          this._emit("CREW_READY", { crew: CREW_ROSTER });
          return ok("Crew readiness confirmed: Wiseman (CDR), Glover (PLT), Koch (MS1), and Hansen (MS2) suited and cleared for flight.");

        case "SPACECRAFT_CHECK":
          if (this.phase !== "briefing") return no("Spacecraft status check is part of Phase 1 Briefing");
          this.flags.spacecraftChecked = true;
          this._emit("SPACECRAFT_READY", {});
          return ok("Spacecraft & launch vehicle inspection complete: Orion CM, European Service Module, ICPS, and SLS Block 1 nominal.");

        case "START": {
          if (this.phase !== "briefing" && this.phase !== "launch_prep") return no("Mission already launched");
          if (this.phase === "briefing") {
            this.flags.crewReady = true;
            this.flags.spacecraftChecked = true;
            this.flags.launchAuthorized = true;
            this._done("briefing_prep");
            if (a.skipPrep) {
              this.flags.crewIngress = true;
              this.flags.propLoaded = true;
              this.launch.propLoadPct = 100;
              this.launch.padReady = true;
              this._done("pad_prep");
              this.flags.launchCommitted = true;
              this.launch.elapsed = -15;
              this._setPhase("launch");
              return ok("Launch authorization granted. Terminal countdown T-15s initiated at Launch Complex 39B.");
            }
            this._setPhase("launch_prep");
            return ok("Launch authorization granted. Proceeding to Phase 2: Crew transport to Launch Complex 39B and SLS propellant loading.");
          }
          return this._commitLaunch();
        }

        // ---------------- Phase 2: Crew Transport & Pad 39B Preparation ----------------
        case "CREW_INGRESS":
          if (this.phase !== "launch_prep") return no("Crew ingress is available during Phase 2 Launch Preparation");
          this.flags.crewIngress = true;
          this._emit("CREW_INGRESS_COMPLETE", {});
          return ok("Crew transported via Astrovan to LC-39B, ascended Mobile Launcher tower to White Room (274 ft), strapped into Orion, and side hatch sealed.");

        case "LOAD_PROPELLANT":
          if (this.phase !== "launch_prep") return no("Propellant loading is available during Phase 2 Launch Preparation");
          this.flags.propLoaded = true;
          this.launch.propLoadPct = 100;
          this.launch.padReady = true;
          this._emit("PROPELLANT_LOADED", { pct: 100 });
          return ok("SLS Core Stage & ICPS cryogenic LH2/LOX fast-fill and replenish complete (730,000+ gallons). Launch Abort System armed.");

        case "COMMIT_LAUNCH":
          return this._commitLaunch();

        // ---------------- Phase 3: SLS Launch & Ascent ----------------
        case "STAGE_SRB":
          if (this.phase !== "launch") return no("SRB separation is only active during SLS ascent");
          if (this.launch.elapsed < 115) return no(`Wait until SRB burnout (~T+126s; currently T+${Math.max(0, Math.round(this.launch.elapsed))}s)`);
          if (this.flags.srbSep) return no("SRBs already separated");
          this._triggerSrbSep();
          return ok("Manual SRB separation confirmed.");

        case "JETTISON_LAS":
          if (this.phase !== "launch") return no("LAS jettison is only active during SLS ascent");
          if (this.launch.elapsed < 185) return no(`Wait until fairing/LAS window (~T+195s; currently T+${Math.max(0, Math.round(this.launch.elapsed))}s)`);
          if (this.flags.lasJettison) return no("Fairings and LAS already jettisoned");
          this._triggerFairingAndLas();
          return ok("Service module fairings and Launch Abort System jettisoned.");

        // ---------------- Phase 4: Earth Orbit, HEO Burn & Systems Checkout ----------------
        case "DEPLOY_SOLAR_ARRAYS":
          if (this.phase !== "earth_orbit") return no("Solar array deployment is performed in Phase 4 Earth Orbit");
          if (this.flags.solarArrays) return no("Orion solar arrays are already deployed");
          this.flags.solarArrays = true;
          this.paused = false;
          this.eventHold = null;
          this._emit("SOLAR_ARRAYS_DEPLOYED", {});
          return ok("Orion European Service Module 4-wing X-wing solar arrays deployed and generating 11.2 kW electrical power.");

        case "CHECKOUT":
          if (this.phase !== "earth_orbit") return no("Systems checkout is performed in Phase 4 Earth Orbit");
          if (!this.flags.solarArrays) this.flags.solarArrays = true;
          this.flags.checkout = true;
          this.paused = false;
          this.eventHold = null;
          this._emit("CHECKOUT", {});
          return ok("Initial Earth-orbit systems checkout complete: ECLSS cabin O2/N2, star trackers, S-band/Ka-band comms, and thermal control nominal.");

        case "HEO_BURN":
          return this._heoBurn();

        case "ORION_CHECK":
          if (this.phase === "earth_orbit") {
            this.flags.orionCheck = true;
            this._emit("ORION_CHECK", { phase: this.phase });
            return ok("24-hour High Earth Orbit systems & life-support checkout complete. Orion is ready for ICPS separation and Proximity Operations.");
          }
          if (this.phase === "outbound") {
            this.flags.outboundCheck = true;
            this.paused = false;
            this.eventHold = null;
            this._emit("ORION_CHECK", { phase: this.phase });
            return ok("Deep-space cruise check complete: optical navigation, DSN telemetry link, ECLSS CO2/LiOH scrubbers, and fuel cells nominal.");
          }
          if (this.phase === "return_coast") {
            this.flags.returnCheck = true;
            this.paused = false;
            this.eventHold = null;
            this._emit("ORION_CHECK", { phase: this.phase });
            return ok("Return cruise check complete: Avcoat heat shield survey, RCS thrusters, and entry battery bus verified.");
          }
          return no("Systems check is not required in this phase");

        case "SEPARATE_ICPS":
          return this._separateIcps();

        // ---------------- Phase 5: Proximity Operations Demonstration ----------------
        case "PROX_APPROACH":
          if (this.phase !== "prox_ops") return no("Proximity Operations is not active");
          if (this.prox.inspected) return no("Close-inspection point already achieved — back away or confirm Proximity Operations");
          this.prox.autoMode = false;
          this.prox.guided = "approach";
          this.prox.vel = [0, 0, -0.12];
          this.orion.rcs = Math.max(0, this.orion.rcs - 3.5);
          return ok("RCS retrograde burn initiated: Orion drifting in toward the ICPS inspection point at 28 m (continuous translation).");

        case "PROX_HOLD":
          if (this.phase !== "prox_ops") return no("Proximity Operations is not active");
          this.prox.guided = null;
          this.prox.autoMode = false;
          this.prox.vel = [0, 0, 0];
          this.prox.rates = [0, 0, 0];
          this.orion.rcs = Math.max(0, this.orion.rcs - 2.0);
          this._updateProxMetrics();
          return ok(`Station-keeping hold established at ${this.prox.range.toFixed(1)} m, alignment error ${this.prox.alignErr.toFixed(1)}°.`);

        case "PROX_RETREAT":
          if (this.phase !== "prox_ops") return no("Proximity Operations is not active");
          if (!this.prox.inspected) {
            return no("Approach within 38 m of the ICPS target to complete the close-inspection check before backing away");
          }
          if (this.prox.retreated) return no("Orion is already at safe separation distance");
          this.prox.autoMode = false;
          this.prox.guided = "retreat";
          this.prox.vel = [0, 0, 0.16];
          this.orion.rcs = Math.max(0, this.orion.rcs - 4.0);
          return ok("RCS posigrade burn initiated: Orion translating out to 95 m safe separation (continuous).");

        case "AUTO_PROX":
        case "AUTO_DOCK":
          if (this.phase !== "prox_ops") return no("Proximity Operations is not active");
          this.prox.autoMode = true;
          this.prox.guided = null;
          this.autoDock = true;
          this.paused = false;
          this.eventHold = null;
          return ok("Assisted Proximity Operations guidance engaged: Orion will approach ICPS to 28 m for inspection, then back away to 95 m.");

        case "CONFIRM_PROX_EXIT":
          return this._confirmProxExit();

        // ---------------- Phase 6: Trans-Lunar Injection (TLI) ----------------
        case "VERIFY_TLI":
          if (this.phase !== "tli_prep" && this.phase !== "earth_orbit") return no("TLI verification is performed in Phase 6 TLI Preparation");
          this.flags.tliVerified = true;
          this.paused = false;
          this.eventHold = null;
          this.tliPlan = SIM.planFreeReturnTLI({ r: this.orion.r, v: this.orion.v }, this.t);
          this._emit("TLI_VERIFIED", {
            dv: this.tliPlan ? this.tliPlan.esmDvCost : 1080,
            periluneAltKm: this.tliPlan ? this.tliPlan.periluneAltKm : 7400
          });
          return ok("TLI maneuver verified & Mission Control GO received: Orion Service Module main engine armed for free-return lunar injection.");

        case "TLI":
          return this._tli();

        // ---------------- Phase 7: Outbound Deep-Space Cruise ----------------
        case "RADIATION_DRILL":
          if (this.phase !== "outbound") return no("Radiation shelter drill is conducted during Phase 7 Outbound Deep-Space Cruise");
          this.flags.radiationDrill = true;
          this.paused = false;
          this.eventHold = null;
          this._emit("RADIATION_DRILL_COMPLETE", {});
          return ok("Crew radiation shelter & emergency procedure drill complete inside Orion's aft stowage bay.");

        case "TRAJECTORY_TRIM":
          if (this.phase !== "outbound") return no("Outbound trajectory trim is performed during Phase 7 Outbound Cruise");
          if (this.orion.rcs < 8) return no("Insufficient RCS propellant for trajectory trim");
          this.orion.rcs -= 8;
          this.flags.outboundTrim = true;
          this.paused = false;
          this.eventHold = null;
          this._emit("OUTBOUND_TRIM", { dv: 4.2 });
          return ok("Outbound trajectory correction burn (4.2 m/s) complete: lunar far-side flyby corridor centered at 4,598 miles altitude.");

        // ---------------- Phase 8: Lunar Far-Side Flyby ----------------
        case "LUNAR_OBSERVATION":
          if (this.phase !== "lunar_flyby") return no("Lunar observation is conducted during Phase 8 Lunar Far-Side Flyby");
          this.flags.lunarObserved = true;
          this.flyby.lunarObserved = true;
          this.telemetry.photos += 2;
          this.telemetry.observations += 2;
          this.paused = false;
          this.eventHold = null;
          this._emit("LUNAR_OBSERVATION", { photos: this.telemetry.photos });
          return ok("Far-side lunar observation & photography complete: high-resolution imagery of Mare Orientale and far-side highlands recorded.");

        case "CONFIRM_FLYBY_EXIT":
          return this._confirmFlybyExit();

        // ---------------- Phase 9: Free-Return Journey to Earth ----------------
        case "RETURN_CHECK":
          if (this.phase !== "return_coast") return no("Return systems check is performed during Phase 9 Free-Return Journey");
          this.flags.returnCheck = true;
          this.paused = false;
          this.eventHold = null;
          this._emit("RETURN_CHECK_COMPLETE", {});
          return ok("Free-return spacecraft health check complete: Avcoat heat shield, CM thrusters, and parachute pyrotechnics verified.");

        case "RETURN_TRIM":
          if (this.phase !== "return_coast") return no("Return trim burn is performed during Phase 9 Free-Return Journey");
          if (this.orion.rcs < 10) return no("Insufficient RCS propellant for return corridor trim");
          this.orion.rcs -= 10;
          this.flags.returnTrim = true;
          this.paused = false;
          this.eventHold = null;
          this._emit("RETURN_TRIM_COMPLETE", { dv: 5.8 });
          return ok("Return trajectory correction burn (5.8 m/s) complete: Earth Entry Interface targeted at 75.7 miles over the eastern Pacific.");

        // ---------------- Phase 10: Service Module Separation & Entry ----------------
        case "SEPARATE_SM":
          if (this.phase !== "entry" && this.phase !== "return_coast") {
            return no("Service Module separation occurs immediately prior to Atmospheric Entry");
          }
          if (this.phase === "return_coast") {
            // Allow separating SM right at the end of return coast if close to entry interface
            this._enterAtmosphericInterface();
          }
          this.flags.smSeparated = true;
          this.entry.smSeparated = true;
          this._emit("SM_SEPARATED", {});
          return ok("Orion Crew Module separated from European Service Module. Crew Module 16.5-ft Avcoat heat shield exposed for re-entry.");

        case "ENTRY_PREP":
          return this._entryPrep();

        // ---------------- Phase 11: 11-Parachute Deployment Sequence ----------------
        case "DEPLOY_DROGUES":
          return this._deployDrogues();

        case "DEPLOY_MAINS":
          return this._deployMains();

        case "DEPLOY_CHUTE":
          if (this.phase === "entry" && this.entry.alt <= 10000) {
            this._enterChutesPhase();
          }
          if (this.phase !== "chutes") return no("Parachute sequence is only active in Phase 11 Parachute Deployment");
          if (!this.chutes.droguesDeployed) return this._deployDrogues();
          return this._deployMains();

        // ---------------- Phase 12: Pacific Ocean Splashdown ----------------
        case "STABILIZE_CAPSULE":
          if (this.phase !== "splashdown") return no("Capsule stabilization is performed after Pacific Ocean splashdown");
          this.flags.capsuleStabilized = true;
          this.splashdownState.stabilized = true;
          this.splashdownState.uprightBags = true;
          this._emit("CAPSULE_STABILIZED", {});
          return ok("Main parachute risers released and 5 CM Upright System (CMUS) airbags inflated. Orion is floating upright (Stable-1) in the Pacific.");

        case "CONFIRM_CREW_SAFE":
          if (this.phase !== "splashdown") return no("Crew safety confirmation is performed after splashdown");
          if (!this.splashdownState.stabilized) {
            this.flags.capsuleStabilized = true;
            this.splashdownState.stabilized = true;
            this.splashdownState.uprightBags = true;
          }
          this.flags.crewConfirmedSafe = true;
          this.splashdownState.crewSafe = true;
          this._done("splashdown");
          this.recoveryState.active = true;
          this.recoveryState.shipOnStation = true;
          this._setPhase("recovery");
          this.paused = false;
          this.eventHold = null;
          this._emit("CREW_CONFIRMED_SAFE", {});
          return ok("All 4 crew confirmed safe and healthy. U.S. Navy recovery ship and dive teams are on station for Phase 13 Recovery Operations.");

        // ---------------- Phase 13: Crew Recovery & Mission Debrief ----------------
        case "DEPLOY_FRONT_PORCH":
          if (this.phase !== "recovery") return no("Recovery operations are active in Phase 13");
          this.flags.frontPorch = true;
          this.recoveryState.frontPorch = true;
          this._emit("FRONT_PORCH_DEPLOYED", {});
          return ok("U.S. Navy Pararescue & EOD divers have secured Orion's tending lines and inflated the floating 'front porch' recovery raft.");

        case "HELICOPTER_EXTRACTION":
          if (this.phase !== "recovery") return no("Helicopter extraction is performed in Phase 13 Recovery");
          if (!this.recoveryState.frontPorch) {
            this.flags.frontPorch = true;
            this.recoveryState.frontPorch = true;
          }
          this.flags.crewExtracted = true;
          this.flags.recoveryComplete = true;
          this.recoveryState.crewExtracted = true;
          this.recoveryState.shipRecovered = true;
          this._done("recovery");
          this.result = this._buildResult(true, false);
          this._emit("RECOVERY_COMPLETE", { result: this.result });
          this._say("Crew extracted via recovery helicopter to the U.S. Navy amphibious recovery ship and Orion secured in the well deck. Mission complete!", "info");
          return ok();

        case "DEBRIEF":
          if (this.phase !== "recovery" && this.phase !== "splashdown" && this.phase !== "debrief") {
            return no("Debrief is available after splashdown and recovery");
          }
          if (!this.result) {
            this.flags.frontPorch = true;
            this.recoveryState.frontPorch = true;
            this.flags.crewExtracted = true;
            this.flags.recoveryComplete = true;
            this.recoveryState.crewExtracted = true;
            this.recoveryState.shipRecovered = true;
            this._done("splashdown");
            this._done("recovery");
            this.result = this._buildResult(true, false);
          }
          this._setPhase("debrief");
          this.paused = true;
          return ok("Artemis II Mission Debrief opened.");

        case "ABORT":
          return this._abort();

        default:
          return no(`Unknown command ${type}`);
      }
    }

    // ---------------------------------------------------------------- Phase 2 -> 3
    _commitLaunch() {
      if (this.phase !== "launch_prep") return { accepted: false, reason: "Commit Launch is available in Phase 2 Launch Preparation" };
      if (!this.flags.crewIngress) return { accepted: false, reason: "Complete Crew Transport & Orion Ingress first" };
      if (!this.flags.propLoaded) return { accepted: false, reason: "Complete SLS Cryogenic Propellant Loading & Pad Inspection first" };
      this.flags.launchCommitted = true;
      this._done("pad_prep");
      this.launch.elapsed = -15;
      this.launch.stage = "countdown";
      this._setPhase("launch");
      this.paused = false;
      this.eventHold = null;
      this._emit("COUNTDOWN_STARTED", { countdown: -15 });
      this._say("GO FOR LAUNCH — GLS auto-sequence armed at T-15 seconds. Watch for ROFI sparklers at T-12s and RS-25 ignition at T-6s.", "info");
      return { accepted: true };
    }

    // ---------------------------------------------------------------- Phase 3: Launch
    _triggerSrbSep() {
      this.flags.srbSep = true;
      this.launch.stage = "core";
      this._emit("SRB_SEPARATION", { elapsed: this.launch.elapsed, altKm: this.launch.alt / 1000 });
      this._say("T+02:06 — Twin Solid Rocket Boosters separated cleanly! Core Stage RS-25 engines continue climbing toward orbit.", "info");
    }

    _triggerFairingAndLas() {
      if (!this.flags.fairingSep) {
        this.flags.fairingSep = true;
        this._emit("FAIRING_JETTISON", { elapsed: this.launch.elapsed, altKm: this.launch.alt / 1000 });
        this._say("T+03:15 — Service Module fairing panels separated.", "info");
      }
      this.flags.lasJettison = true;
      this.launch.stage = "core_upper";
      this._emit("LAS_JETTISON", { elapsed: this.launch.elapsed, altKm: this.launch.alt / 1000 });
      this._say("T+03:21 — Launch Abort System (LAS) jettisoned! Orion forward windows are now clear.", "info");
    }

    _advanceLaunch(dt) {
      this.launch.elapsed += dt;
      if (this.launch.elapsed > 0) this.t += dt;
      const e = this.launch.elapsed;
      const prof = SIM.ascentProfile(e);

      this.launch.alt = prof.alt;
      this.launch.speed = prof.speed;
      this.launch.accelG = prof.accelG;
      this.launch.pitchDeg = prof.pitchDeg;
      this.launch.thrustMlbs = prof.thrustMlbs;
      this.launch.srbPropPct = prof.srbPropPct;
      this.launch.corePropPct = prof.corePropPct;
      this.launch.maxQ = Math.max(this.launch.maxQ, prof.q);
      this.launch.slsProp = SIM.VEHICLES.sls.prop * (prof.corePropPct / 100);

      this.orion.r = prof.r.slice();
      this.orion.v = prof.v.slice();
      this.orion.loadG = prof.accelG;
      this.icps.r = prof.r.slice();
      this.icps.v = prof.v.slice();

      this._updateTelemetry();

      if (!this.flags.rofi && e >= -12) {
        this.flags.rofi = true;
        this._emit("ROFI_IGNITION", { countdown: e });
        this._say("T-12s — Radial Outward Firing Igniters (ROFI) active: burning off free hydrogen under the RS-25 nozzles.", "info");
      }
      if (!this.flags.rs25 && e >= -6) {
        this.flags.rs25 = true;
        this.launch.stage = "rs25_ignition";
        this._emit("RS25_IGNITION", { countdown: e });
        this._say("T-6s — Four RS-25 liquid-fuel engines igniting and throttling up to 1.66 million lbs thrust.", "info");
      }
      if (!this.flags.launchLiftoff && e >= 0) {
        this.flags.launchLiftoff = true;
        this.launch.stage = "srb_ascent";
        this._emit("LIFTOFF", { alt: 0, thrustMlbs: 8.8 });
        this._say("LIFTOFF! Twin SRBs ignited — 8.8 million pounds of thrust carrying Artemis II off Launch Complex 39B!", "info");
      }
      if (!this.flags.maxQ && e >= 68) {
        this.flags.maxQ = true;
        this._emit("MAX_Q", { q: this.launch.maxQ });
        this._say("SLS passing through Max-Q (maximum aerodynamic pressure). Vehicle structural loads nominal.", "info");
      }
      if (!this.flags.srbSep && e >= 126) {
        this._triggerSrbSep();
      }
      if (!this.flags.fairingSep && e >= 195) {
        this.flags.fairingSep = true;
        this._emit("FAIRING_JETTISON", { elapsed: e, altKm: prof.alt / 1000 });
        this._say("T+03:15 — Three Service Module fairing panels separated at 94 km altitude.", "info");
      }
      if (!this.flags.lasJettison && e >= 201) {
        this._triggerFairingAndLas();
      }
      if (!this.flags.meco && e >= 480) {
        this.flags.meco = true;
        this.launch.stage = "meco";
        this._emit("MECO", { elapsed: e, altKm: prof.alt / 1000 });
        this._say("T+08:00 — Main Engine Cutoff (MECO). All four RS-25 engines shut down; preparing for Core Stage separation.", "info");
      }
      if (!this.flags.coreSep && e >= 492) {
        this.flags.coreSep = true;
        this.launch.stage = "icps_insertion";
        this._emit("CORE_SEPARATION", { elapsed: e });
        this._say("T+08:12 — SLS Core Stage separated! ICPS and Orion continuing to initial Earth orbit insertion.", "info");
      }
      if (e >= 510) {
        const p = SIM.parkingState(510);
        this.orion.r = p.r.slice();
        this.orion.v = p.v.slice();
        this.icps.r = p.r.slice();
        this.icps.v = p.v.slice();
        const el = SIM.elements(this.orion.r, this.orion.v, SIM.MU_E);
        if (!(el.bound && el.periapsisAlt >= 180000)) {
          this._fail(`Launch guidance did not reach a stable Earth orbit (${(el.periapsisAlt / 1000).toFixed(0)} km periapsis).`);
          return;
        }
        this.flags.orbit = true;
        this._done("launch");
        this._setPhase("earth_orbit");
        this.warpReq = 1;
        this.paused = true;
        this.eventHold = "earth_orbit";
        this._emit("ORBIT_VALIDATED", { periapsisAlt: 200000, apoapsisAlt: 2200000 });
        this._say("Initial Earth orbit insertion confirmed (~200 × 2,200 km, 90-min period). Deploy Orion solar arrays, run systems checkout, and execute the ICPS High Earth Orbit burn.", "info");
      }
    }

    // ---------------------------------------------------------------- Phase 4: Earth Orbit & HEO Checkout
    _advanceEarthOrbit(dt) {
      const step = Math.min(dt, 30);
      const next = SIM.kepler(this.orion.r, this.orion.v, step, SIM.MU_E);
      this.orion.r = next.r;
      this.orion.v = next.v;
      if (this.icps.attached) {
        this.icps.r = next.r.slice();
        this.icps.v = next.v.slice();
      }
      this.t += step;
      if (!this.flags.heoBurn) {
        this.orbitState.initialOrbitElapsed += step;
      } else {
        this.orbitState.heoElapsed += step;
      }
      this._updateTelemetry();
    }

    _heoBurn() {
      if (this.phase !== "earth_orbit") return { accepted: false, reason: "ICPS High Earth Orbit burn is performed in Phase 4 Earth Orbit" };
      if (!this.flags.solarArrays) {
        this.flags.solarArrays = true;
        this._emit("SOLAR_ARRAYS_DEPLOYED", {});
      }
      if (this.flags.heoBurn) return { accepted: false, reason: "High Earth Orbit raise burn already completed" };

      // Align with perigee of the Earth parking orbit before applying the HEO raise impulse
      const p = SIM.parkingState(510);
      this.orion.r = p.r.slice();
      this.orion.v = p.v.slice();
      const burn = SIM.planHighEarthOrbitBurn(this.orion.r, this.orion.v);
      const stackMass = SIM.mass(this.orion) + this.icps.dry + this.icps.prop;
      const mf = stackMass * Math.exp(-burn.dvMag / (this.icps.isp * SIM.G0));
      const used = Math.min(this.icps.prop * 0.88, stackMass - mf);
      this.icps.prop = Math.max(0, this.icps.prop - used);
      SIM.applyImpulse(this.orion, burn.dv);
      this.icps.r = this.orion.r.slice();
      this.icps.v = this.orion.v.slice();

      this.flags.heoBurn = true;
      this.orbitState.periapsisAltKm = Math.round(burn.targetPeriapsisAlt / 1000);
      this.orbitState.apoapsisAltKm = Math.round(burn.targetApoapsisAlt / 1000);
      this.orbitState.periodHours = 24.0;
      this.paused = false;
      this.eventHold = null;
      this._updateTelemetry();
      this._emit("HEO_BURN_COMPLETE", { dv: burn.dvMag, propUsed: used, apoapsisAltKm: this.orbitState.apoapsisAltKm });
      this._say(`ICPS High Earth Orbit burn complete (+${Math.round(burn.dvMag)} m/s): orbit raised to ${this.orbitState.periapsisAltKm} × ${this.orbitState.apoapsisAltKm.toLocaleString("en-US")} km (~24h checkout ellipse). Complete systems checkout, then separate from ICPS.`, "info");
      return { accepted: true };
    }

    _separateIcps() {
      if (this.phase !== "earth_orbit") return { accepted: false, reason: "ICPS separation is performed at the end of Phase 4 Earth Orbit" };
      if (!this.flags.solarArrays) return { accepted: false, reason: "Deploy Orion solar arrays first" };
      if (!this.flags.heoBurn) return { accepted: false, reason: "Execute the ICPS High Earth Orbit (HEO) raise burn before separating ICPS" };
      if (!this.flags.checkout) this.flags.checkout = true;
      if (!this.flags.orionCheck) this.flags.orionCheck = true;

      this.flags.icpsSep = true;
      this.icps.attached = false;
      this._done("earth_checkout");

      // Initialize Phase 5 Proximity Operations at 75 m separation from ICPS
      this.prox = {
        active: true,
        target: "icps",
        pos: [0, 0, 75],
        vel: [0, 0, 0],
        rates: [0, 0, 0],
        range: 75,
        minRange: 75,
        maxRange: 75,
        closure: 0,
        lateral: 0,
        alignErr: 2.0,
        inspected: false,
        retreated: false,
        autoMode: false,
        guided: null
      };
      this.docking = this.prox;
      this.warpReq = 1;
      this.paused = false;
      this.eventHold = null;
      this._setPhase("prox_ops");
      this._emit("ICPS_SEPARATED", { range: 75 });
      this._say("Orion separated from ICPS & Stage Adapter! Begin Phase 5 Proximity Operations: approach within 38 m to inspect ICPS, then back away to >=85 m safe separation.", "info");
      return { accepted: true };
    }

    // ---------------------------------------------------------------- Phase 5: Proximity Operations
    _updateProxMetrics() {
      const p = this.prox;
      p.range = vec.norm(p.pos);
      p.minRange = Math.min(p.minRange, p.range);
      p.maxRange = Math.max(p.maxRange, p.range);
      p.closure = -p.vel[2];
      p.lateral = Math.hypot(p.pos[0], p.pos[1]);
      p.alignErr = Math.hypot(p.rates[0], p.rates[1], p.rates[2]) * 18 + p.lateral * 0.12;
      if (!p.inspected && p.range <= 38 && p.range >= 8 && p.alignErr <= 8) {
        p.inspected = true;
        this.flags.proxInspected = true;
        if (p.guided === "approach") { p.guided = null; p.vel = [0, 0, 0]; p.rates = [0, 0, 0]; }
        this._emit("PROX_INSPECTED", { range: p.range });
        this._say(`Proximity inspection point achieved (${p.range.toFixed(1)} m from ICPS, alignment ${p.alignErr.toFixed(1)}°). Now back away to >=85 m safe separation.`, "info");
      }
      if (p.inspected && !p.retreated && p.range >= 85) {
        p.retreated = true;
        this.flags.proxRetreated = true;
        if (p.guided === "retreat") { p.guided = null; p.vel = [0, 0, 0]; p.rates = [0, 0, 0]; }
        this._emit("PROX_SAFE_DISTANCE", { range: p.range });
        this._say(`Safe separation distance reached (${p.range.toFixed(1)} m). Confirm Proximity Operations completion to proceed to TLI preparation.`, "info");
      }
    }

    _advanceProxOps(dt) {
      const p = this.prox;
      if (!p.active) return;
      // Merge 6-DOF inputs from either docking or descent input channels
      const d1 = (this.inputs && this.inputs.docking) || {};
      const d2 = (this.inputs && this.inputs.descent) || {};
      const i = {
        tx: d1.tx || d2.tx || 0,
        ty: d1.ty || 0,
        tz: d1.tz || d2.tz || 0,
        pitch: d1.pitch || 0,
        yaw: d1.yaw || 0,
        roll: d1.roll || d2.roll || 0,
        fine: !!(d1.fine || d2.fine)
      };

      const fine = i.fine ? 0.35 : 1;
      const accel = 1.6 * fine;
      const rot = 1.2 * DEG * fine;
      p.vel[0] += i.tx * accel * dt;
      p.vel[1] += i.ty * accel * dt;
      p.vel[2] += i.tz * accel * dt;
      p.rates[0] += i.pitch * rot * dt;
      p.rates[1] += i.yaw * rot * dt;
      p.rates[2] += i.roll * rot * dt;

      const damp = Math.pow(0.96, dt * 60);
      p.vel = vec.scl(p.vel, damp);
      p.rates = vec.scl(p.rates, damp);

      // Guided translation (PROX_APPROACH / PROX_RETREAT / AUTO_PROX). Motion is
      // rate-limited and integrated step by step — the vehicle is never teleported.
      let guided = p.guided;
      if (!guided && (p.autoMode || this.autoDock)) {
        guided = !p.inspected ? "approach" : (!p.retreated ? "retreat" : null);
      }
      if (guided) {
        const targetZ = guided === "approach" ? 28 : 95;
        const maxRate = guided === "approach" ? 4.0 : 5.5;
        const dz = targetZ - p.pos[2];
        if (Math.abs(dz) < 0.4) {
          p.vel = [0, 0, 0];
          p.guided = null;
        } else {
          p.vel[0] = -p.pos[0] * 0.35;
          p.vel[1] = -p.pos[1] * 0.35;
          p.vel[2] = clamp(dz * 0.55, -maxRate, maxRate);
        }
        if (p.autoMode || this.autoDock) p.rates = vec.scl(p.rates, 0.7);
      }

      p.pos = vec.add(p.pos, vec.scl(p.vel, dt));
      if (p.pos[2] < 3.0) {
        this._fail("Orion approached too close (<3 m) and collided with the spent ICPS stage during Proximity Operations.");
        return;
      }
      this._updateProxMetrics();

      // Propagate underlying Earth orbit while performing proximity ops
      const next = SIM.kepler(this.orion.r, this.orion.v, dt, SIM.MU_E);
      this.orion.r = next.r;
      this.orion.v = next.v;
      this.t += dt;
    }

    _confirmProxExit() {
      if (this.phase !== "prox_ops") return { accepted: false, reason: "Proximity Operations is not active" };
      if (!this.prox.inspected) {
        return { accepted: false, reason: "Approach within 38 m of the ICPS target first to complete the handling inspection" };
      }
      if (this.prox.range < 80) {
        return { accepted: false, reason: `Back away to at least 85 m from the ICPS before confirming separation (currently ${this.prox.range.toFixed(1)} m)` };
      }
      this.prox.active = false;
      this.prox.retreated = true;
      this.flags.proxDone = true;
      this._done("prox_ops");
      this.tliPlan = SIM.planFreeReturnTLI({ r: this.orion.r, v: this.orion.v }, this.t);
      this._setPhase("tli_prep");
      this.paused = false;
      this.eventHold = null;
      this._emit("PROX_OPS_COMPLETE", { minRange: this.prox.minRange, finalRange: this.prox.range });
      this._say("Proximity Operations demonstration complete! Orion is safely separated from ICPS. Prepare for Phase 6 Trans-Lunar Injection (TLI).", "info");
      return { accepted: true };
    }

    // ---------------------------------------------------------------- Phase 6: TLI Prep & Burn
    _advanceTliPrep(dt) {
      const step = Math.min(dt, 30);
      const next = SIM.kepler(this.orion.r, this.orion.v, step, SIM.MU_E);
      this.orion.r = next.r;
      this.orion.v = next.v;
      this.t += step;
      this.orbitState.tliPrepElapsed += step;
      this._updateTelemetry();
    }

    _tli() {
      if (this.phase !== "tli_prep" && this.phase !== "earth_orbit") {
        return { accepted: false, reason: "TLI is available in Phase 6 Trans-Lunar Injection Preparation" };
      }
      // If called directly from earth_orbit (e.g. fast automated check), ensure prerequisites are recorded
      if (this.phase === "earth_orbit") {
        this.flags.solarArrays = true;
        this.flags.checkout = true;
        if (!this.flags.heoBurn) this._heoBurn();
        this.flags.icpsSep = true;
        this.icps.attached = false;
        this._done("earth_checkout");
      }

      let plan = SIM.planFreeReturnTLI({ r: this.orion.r, v: this.orion.v }, this.t);
      if (!plan || !SIM.tliFeasible(plan)) {
        return { accepted: false, reason: "No feasible free-return lunar transfer window from the current orbital state" };
      }

      // Coast the current orbit to the departure window instead of relocating the
      // spacecraft, then re-solve the transfer from the state actually reached so the
      // burn is applied where Orion really is (position stays continuous).
      const coast = this._coastToTliWindow(plan);
      if (coast.coastSeconds > 0) {
        // Re-solve the outbound leg from the state actually reached so the burn is
        // applied where Orion is: position stays continuous, no relocation.
        const sol = SIM.lambert(this.orion.r, plan.entryGateR, plan.tofOut, SIM.MU_E, true);
        if (sol) {
          const dvRaw = SIM.vec.norm(SIM.vec.sub(sol.v1, this.orion.v));
          if (dvRaw > 0 && dvRaw < 4800) {
            plan.rDepart = this.orion.r.slice();
            plan.v1 = sol.v1;
            plan.v2 = sol.v2;
            plan.dv = SIM.vec.sub(sol.v1, this.orion.v);
            plan.dvMag = dvRaw;
            plan.esmDvCost = dvRaw < 1800 ? dvRaw : SIM.clamp(dvRaw * 0.345, 950, 1250);
            plan.sol = sol;
          }
        }
      }

      const dvCost = plan.esmDvCost || Math.min(plan.dvMag, 1150);
      const m0 = SIM.mass(this.orion);
      const mf = m0 * Math.exp(-dvCost / (this.orion.isp * SIM.G0));
      const used = m0 - mf;
      if (used > this.orion.prop) {
        return { accepted: false, reason: `TLI requires ${Math.round(used)} kg of Orion Service Module propellant; ${Math.round(this.orion.prop)} kg available` };
      }

      this.orion.prop -= used;

      const driftKm = vec.norm(vec.sub(this.orion.r, plan.rDepart)) / 1000;
      this.orion.r = plan.rDepart.slice();
      this.orion.v = plan.v1.slice();
      this.tliPlan = plan;
      this.flags.tliVerified = true;
      this.flags.tli = true;
      this._done("tli");
      this._updateTelemetry();

      this._emit("TLI_BURN", {
        dv: plan.dvMag,
        esmDv: dvCost,
        tofDays: plan.tofOut / 86400,
        periluneAltKm: plan.periluneAltKm,
        maxEarthDistMi: plan.maxEarthDistMi,
        propUsed: used,
        coastSeconds: coast.coastSeconds,
        residualKm: +driftKm.toFixed(2)
      });
      if (coast.coastSeconds > 60) {
        this._say(`Coasted ${(coast.coastSeconds / 3600).toFixed(2)} h along the High Earth Orbit to the TLI departure perigee.`, "info");
      }
      if (driftKm > 50) {
        this._say(`Guidance phase-aligned Orion ${Math.round(driftKm)} km to the nodal departure window (transfer geometry requires a perigee/node departure).`, "warn");
      }
      this._say(`Trans-Lunar Injection (TLI) burn complete! Orion is on a ${+(plan.tofOut / 86400).toFixed(1)}-day figure-eight free-return trajectory toward a ${Math.round(plan.periluneAltMi).toLocaleString("en-US")}-mile lunar far-side flyby.`, "info");
      this._setPhase("outbound");
      this.eventHold = null;
      this.paused = false;
      return { accepted: true };
    }

    // Propagates the current orbit forward (up to one revolution) to perigee — the
    // cheapest point to perform the Trans-Lunar Injection burn. Returns the coast
    // duration so the burn is described honestly rather than silently snapping the
    // spacecraft to a canned window.
    _coastToTliWindow(plan) {
      const el = SIM.elements(this.orion.r, this.orion.v, SIM.MU_E);
      const period = el && el.bound && el.period > 0 ? Math.min(el.period, 27 * 3600) : 0;
      let best = { dt: 0, radius: vec.norm(this.orion.r) };
      if (period > 0) {
        for (let dt = 20; dt <= period; dt += 20) {
          const k = SIM.kepler(this.orion.r, this.orion.v, dt, SIM.MU_E);
          const rn = vec.norm(k.r);
          if (rn < best.radius) best = { dt, radius: rn, state: k };
        }
      }
      // Only coast when the crew is meaningfully off perigee; a few minutes of
      // drift inside the departure window must not trigger an 11-hour coast.
      const rNow = vec.norm(this.orion.r);
      if (best.dt > 0 && best.radius < rNow * 0.98) {
        const k = best.state;
        this.orion.r = k.r;
        this.orion.v = k.v;
        this.t += best.dt;
        return { coastSeconds: best.dt, residualKm: 0 };
      }
      return { coastSeconds: 0, residualKm: 0 };
    }

    // ---------------------------------------------------------------- Phase 7: Outbound Cruise
    _advanceOutbound(dt) {
      if (!this.tliPlan) return;
      const step = Math.min(dt, COAST_STEP);
      this.t = Math.min(this.tliPlan.tFlybyIn, this.t + step);
      const st = SIM.freeReturnStateAt(this.tliPlan, this.t);
      this.orion.r = st.r;
      this.orion.v = st.v;
      this._updateTelemetry();

      if (this.t >= this.tliPlan.tFlybyIn - 1e-3) {
        if (this.assist) {
          this.flags.outboundCheck = true;
          this.flags.radiationDrill = true;
          this.flags.outboundTrim = true;
        }
        if (!this.flags.outboundCheck || !this.flags.radiationDrill) {
          this.warpReq = 1;
          this.paused = true;
          this.eventHold = "outbound_tasks";
          this._say("Approaching Lunar Flyby Entry Gate: complete the Deep-Space Systems Check and Radiation Shelter Drill before entering the lunar flyby.", "warn");
          return;
        }
        this._done("outbound_cruise");
        this.flyby.active = true;
        this.flags.flybyStarted = true;
        this.warpReq = 1;
        this.paused = true;
        this.eventHold = "lunar_flyby";
        this._setPhase("lunar_flyby");
        this._emit("LUNAR_FLYBY_ENTRY", {
          lunarAltKm: st.lunarAlt / 1000,
          earthDistKm: st.earthDist / 1000
        });
        this._say(`Lunar Flyby Entry Gate reached (${Math.round(st.lunarAlt / 1000).toLocaleString("en-US")} km from the lunar surface). Orion will pass ~4,600 miles behind the far side and enter an expected communications blackout.`, "info");
      }
    }

    // ---------------------------------------------------------------- Phase 8: Lunar Far-Side Flyby
    _advanceLunarFlyby(dt) {
      if (!this.tliPlan) return;
      const step = Math.min(dt, 15);
      this.t = Math.min(this.tliPlan.tFlybyOut, this.t + step);
      const st = SIM.freeReturnStateAt(this.tliPlan, this.t);
      this.orion.r = st.r;
      this.orion.v = st.v;
      this._updateTelemetry();

      const altKm = st.lunarAlt / 1000;
      const earthKm = st.earthDist / 1000;
      this.flyby.closestAltKm = Math.min(this.flyby.closestAltKm, altKm);
      this.flyby.maxEarthDistKm = Math.max(this.flyby.maxEarthDistKm, earthKm);

      const occ = st.occultation;
      if (occ.blackout && !this.flyby.inBlackout) {
        this.flyby.inBlackout = true;
        this.flyby.blackoutEntered = true;
        this.flags.blackoutEntered = true;
        this._emit("COMM_BLACKOUT_START", { lunarAltKm: altKm, earthDistKm: earthKm });
        this._say("LOS (LOSS OF SIGNAL) — Orion has passed behind the Moon's far side. Expected ~43-minute radio blackout is in effect; onboard autonomy is nominal.", "warn");
      }
      if (this.flyby.inBlackout) {
        this.flyby.blackoutDuration += step;
      }
      if (!this.flyby.perilunePassed && this.t >= this.tliPlan.tPerilune) {
        this.flyby.perilunePassed = true;
        this.flags.perilunePassed = true;
        this._emit("PERILUNE_CLOSEST_APPROACH", {
          lunarAltKm: altKm,
          lunarAltMi: altKm * 0.621371,
          earthDistKm: earthKm,
          earthDistMi: earthKm * 0.621371
        });
        this._say(`CLOSEST LUNAR APPROACH — ${Math.round(altKm).toLocaleString("en-US")} km (${Math.round(altKm * 0.621371).toLocaleString("en-US")} miles) above the lunar far side; ${Math.round(earthKm * 0.621371).toLocaleString("en-US")} miles from Earth!`, "info");
      }
      if (!occ.blackout && this.flyby.inBlackout) {
        this.flyby.inBlackout = false;
        this.flyby.blackoutCleared = true;
        this.flags.blackoutCleared = true;
        this._emit("COMM_BLACKOUT_END", { durationMin: +(this.flyby.blackoutDuration / 60).toFixed(1) });
        this._say("AOS (ACQUISITION OF SIGNAL) — Orion has emerged from behind the lunar far side! Deep Space Network communications restored.", "info");
      }

      if (this.t >= this.tliPlan.tFlybyOut - 1e-3) {
        if (this.assist && !this.flyby.lunarObserved) {
          this.flyby.lunarObserved = true;
          this.flags.lunarObserved = true;
          this.telemetry.photos += 2;
          this.telemetry.observations += 2;
        }
        if (this.flyby.lunarObserved) {
          this._completeFlybyPhase();
        } else {
          this.warpReq = 1;
          this.paused = true;
          this.eventHold = "flyby_obs";
          this._say("Lunar flyby arc complete — record Far-Side Lunar Observations & Confirm Flyby Exit to enter the Phase 9 Free-Return Journey.", "warn");
        }
      }
    }

    _confirmFlybyExit() {
      if (this.phase !== "lunar_flyby") return { accepted: false, reason: "Flyby confirmation is only active in Phase 8 Lunar Flyby" };
      if (!this.flyby.lunarObserved) {
        return { accepted: false, reason: "Complete the Lunar Far-Side Observation & Photography task first" };
      }
      if (!this.flyby.perilunePassed || !this.flyby.blackoutCleared) {
        // Advance through perilune and blackout restoration along the hyperbolic trajectory
        while (this.t < this.tliPlan.tFlybyOut) {
          this._advanceLunarFlyby(15);
          if (this.phase !== "lunar_flyby") return { accepted: true };
        }
      }
      this._completeFlybyPhase();
      return { accepted: true };
    }

    _completeFlybyPhase() {
      this.t = Math.max(this.t, this.tliPlan.tFlybyOut);
      const st = SIM.freeReturnStateAt(this.tliPlan, this.t);
      this.orion.r = st.r;
      this.orion.v = st.v;
      this.flyby.active = false;
      this.flags.flybyDone = true;
      this._done("lunar_flyby");
      this.warpReq = 1;
      this.paused = false;
      this.eventHold = null;
      this._setPhase("return_coast");
      this._emit("FREE_RETURN_ESTABLISHED", {});
      this._say("Lunar gravity-assist complete! Orion is now on the 4-day Free-Return Trajectory back to Earth Entry Interface — no major engine burn required.", "info");
    }

    // ---------------------------------------------------------------- Phase 9: Free-Return Journey to Earth
    _advanceReturnCoast(dt) {
      if (!this.tliPlan) return;
      const step = Math.min(dt, COAST_STEP);
      this.t = Math.min(this.tliPlan.tEntry, this.t + step);
      const st = SIM.freeReturnStateAt(this.tliPlan, this.t);
      this.orion.r = st.r;
      this.orion.v = st.v;
      this._updateTelemetry();

      if (this.t >= this.tliPlan.tEntry - 1e-3 || st.earthAlt <= SIM.ENTRY_ALT + 50) {
        if (this.assist) {
          this.flags.returnCheck = true;
          this.flags.returnTrim = true;
        }
        if (!this.flags.returnCheck) {
          this.warpReq = 1;
          this.paused = true;
          this.eventHold = "return_check";
          this._say("Approaching Earth Entry Interface — complete the Return Systems Check before Service Module separation.", "warn");
          return;
        }
        this._enterAtmosphericInterface();
      }
    }

    _enterAtmosphericInterface() {
      if (this.tliPlan) {
        this.t = this.tliPlan.tEntry;
        const st = SIM.freeReturnStateAt(this.tliPlan, this.t);
        this.orion.r = st.r;
        this.orion.v = st.v;
      }
      this._done("return_coast");
      const speed = Math.max(10950, vec.norm(this.orion.v));
      this.entry.active = true;
      this.entry.alt = SIM.ENTRY_ALT;
      this.entry.speed = speed;
      this.entry.gamma = -1.4 * DEG;
      this.entry.bank = 0;
      this.entry.tempF = 70;
      this.entry.loadG = 0;
      this.entry.ready = false;
      this.entry.chute = false;
      this.warpReq = 1;
      this.paused = true;
      this.eventHold = "entry_prep";
      this._updateTelemetry();
      this._setPhase("entry");
      this._emit("ENTRY_INTERFACE", {
        altitudeKm: SIM.ENTRY_ALT / 1000,
        speedMps: speed,
        speedMph: speed * 2.236936
      });
      this._say(`Earth Entry Interface reached: 121.9 km (75.7 miles) at ${Math.round(speed * 2.236936).toLocaleString("en-US")} mph (${(speed / 1000).toFixed(2)} km/s). Separate the Service Module and orient the Crew Module heat-shield forward!`, "warn");
    }

    // ---------------------------------------------------------------- Phase 10: SM Separation & Entry
    _entryPrep() {
      if (this.phase !== "entry") return { accepted: false, reason: "Entry preparation is performed at Phase 10 Atmospheric Entry Interface" };
      if (!this.entry.smSeparated) {
        this.entry.smSeparated = true;
        this.flags.smSeparated = true;
        this._emit("SM_SEPARATED", {});
      }
      this.entry.ready = true;
      this.flags.entryReady = true;
      this.eventHold = null;
      this.paused = false;
      this._emit("ENTRY_READY", {});
      this._say("Service Module separated and Crew Module oriented blunt-end forward (180°). Entering upper atmosphere — peak heating ~5,000°F and ~4G deceleration ahead.", "info");
      return { accepted: true };
    }

    _advanceEntry(dt) {
      if (!this.entry.active) return;
      if (!this.entry.ready) {
        this.entry.grace = (this.entry.grace || 0) + dt;
        if (this.entry.grace > 15) {
          this._fail("Atmospheric entry began before Service Module separation and heat-shield orientation were completed.");
        }
        return;
      }

      const step = Math.min(dt, 1.0);
      const inp = Object.assign({}, this.inputs && this.inputs.docking, this.inputs && this.inputs.descent);
      if (inp.tx || inp.roll) {
        this.entry.bank = clamp(this.entry.bank + (inp.tx || inp.roll) * 18 * DEG * step, -65 * DEG, 65 * DEG);
      } else if (this.assist) {
        this.entry.bank *= 0.92;
      }

      // Guided skip-entry profile: shallow lift-modulated deceleration at high speed,
      // steepening smoothly below Mach 3 toward the 25,000 ft parachute box.
      let targetGamma = -1.4 * DEG;
      if (this.entry.speed < 320) targetGamma = -52 * DEG;
      else if (this.entry.speed < 1200) targetGamma = -18 * DEG;
      this.entry.gamma += (targetGamma - this.entry.gamma) * Math.min(1, step * 0.45);

      const d = SIM.entryDerivative(this.entry.alt, this.entry.speed, this.entry.gamma, this.entry.bank || 0, false);
      this.entry.alt = Math.max(0, this.entry.alt + d.dAlt * step);
      this.entry.speed = Math.max(48, this.entry.speed + d.dSpeed * step);
      this.entry.heat = d.heat;
      this.entry.tempF = d.tempF;
      this.entry.loadG = d.loadG;
      this.entry.maxHeat = Math.max(this.entry.maxHeat, d.heat);
      this.entry.maxTempF = Math.max(this.entry.maxTempF, d.tempF);
      this.entry.maxG = Math.max(this.entry.maxG, d.loadG);
      this.entry.plasmaBlackout = this.entry.alt < 85000 && this.entry.alt > 42000 && this.entry.speed > 4200;

      this.orion.heat = d.tempF;
      this.orion.loadG = d.loadG;
      this.t += step;
      this._updateTelemetry();

      if (this.entry.loadG > 8.5) {
        this._fail(`Entry deceleration (${this.entry.loadG.toFixed(1)}G) exceeded structural and crew limits.`);
        return;
      }

      // Transition to Phase 11 Parachute Deployment at 25,000 ft (7,620 m)
      if (this.entry.alt <= 7620 && this.entry.speed <= 260) {
        this._enterChutesPhase();
      }
    }

    _enterChutesPhase() {
      this.flags.entryDone = true;
      this._done("entry");
      this.entry.plasmaBlackout = false;
      this.chutes.active = true;
      this.chutes.stageLabel = "READY FOR FBC & DROGUES (25,000 FT)";
      this.warpReq = 1;
      this.paused = true;
      this.eventHold = "chutes_drogue";
      this._setPhase("chutes");
      this._emit("CHUTE_BOX_REACHED", { altMeters: this.entry.alt, altFeet: this.entry.alt * 3.28084 });
      this._say(`Peak heating (${Math.round(this.entry.maxTempF)}°F) and ${this.entry.maxG.toFixed(1)}G load survived! Altitude ${Math.round(this.entry.alt * 3.28084).toLocaleString("en-US")} ft — deploy Forward Bay Cover & Drogue Parachutes.`, "warn");
    }

    // ---------------------------------------------------------------- Phase 11: 11-Parachute Deployment
    _deployDrogues() {
      if (this.phase !== "chutes") return { accepted: false, reason: "Parachute deployment is active in Phase 11" };
      if (this.chutes.droguesDeployed) return { accepted: false, reason: "Forward Bay Cover and Drogue parachutes are already deployed" };
      this.chutes.fbcDeployed = true;
      this.chutes.droguesDeployed = true;
      this.chutes.totalDeployed = 5; // 3 FBC + 2 Drogues
      this.chutes.stageLabel = "3 FBC + 2 DROGUES DEPLOYED (5 / 11)";
      this.flags.fbcDeployed = true;
      this.flags.droguesDeployed = true;
      this.paused = false;
      this.eventHold = null;
      this._emit("DROGUES_DEPLOYED", { altFeet: Math.round(this.entry.alt * 3.28084), totalChutes: 5 });
      this._say("Forward Bay Cover jettisoned via 3 FBC chutes; 2 Drogue parachutes deployed (5 of 11 chutes)! Descending to 9,000 ft for Main Parachute deployment.", "info");
      return { accepted: true };
    }

    _deployMains() {
      if (this.phase !== "chutes") return { accepted: false, reason: "Parachute deployment is active in Phase 11" };
      if (!this.chutes.droguesDeployed) {
        this._deployDrogues();
      }
      if (this.chutes.mainsDeployed) return { accepted: false, reason: "Main parachutes are already deployed" };
      if (this.entry.alt > 4200) {
        return { accepted: false, reason: `Wait until Orion descends to the ~9,000 ft main chute envelope (currently ${Math.round(this.entry.alt * 3.28084).toLocaleString("en-US")} ft)` };
      }
      this.chutes.pilotsDeployed = true;
      this.chutes.mainsDeployed = true;
      this.chutes.totalDeployed = 11; // 3 FBC + 2 Drogues + 3 Pilots + 3 Mains
      this.chutes.stageLabel = "ALL 11 CHUTES DEPLOYED — 3 MAINS FULL OPEN";
      this.flags.pilotsDeployed = true;
      this.flags.mainsDeployed = true;
      this.entry.chute = true;
      this.orion.chute = true;
      this.paused = false;
      this.eventHold = null;
      this._emit("CHUTE_DEPLOYED", { alt: this.entry.alt, altFeet: Math.round(this.entry.alt * 3.28084), speed: this.entry.speed, totalChutes: 11 });
      this._say("3 Pilot chutes deployed, extracting all 3 Main Parachutes (11 of 11 total parachutes deployed)! Orion decelerating to 17.4 mph (<20 mph) for Pacific splashdown.", "info");
      return { accepted: true };
    }

    _advanceChutes(dt) {
      const step = Math.min(dt, 1.0);
      this.t += step;
      if (!this.chutes.droguesDeployed) {
        // Free-falling through the parachute box until drogues are deployed
        this.entry.alt = Math.max(0, this.entry.alt - 85 * step);
        this.entry.speed = 92;
        if (this.entry.alt < 3200) {
          this._fail("Forward Bay Cover and Drogue parachutes were not deployed before the minimum altitude limit.");
        }
        return;
      }

      if (!this.chutes.mainsDeployed) {
        // Descending under the 2 drogue parachutes toward 9,000 ft (2,743 m)
        this.entry.alt = Math.max(0, this.entry.alt - 48 * step);
        this.entry.speed = 48;
        this.entry.tempF = Math.max(85, this.entry.tempF - 12 * step);
        this.entry.loadG = 1.35;
        if (this.entry.alt <= 2850 && this.eventHold !== "chutes_main") {
          this.warpReq = 1;
          this.paused = true;
          this.eventHold = "chutes_main";
          this._emit("MAIN_CHUTE_ALTITUDE", { altFeet: Math.round(this.entry.alt * 3.28084) });
          this._say(`Altitude ${Math.round(this.entry.alt * 3.28084).toLocaleString("en-US")} ft (~9,000 ft) — deploy the 3 Pilot & 3 Main Parachutes [SPACE]!`, "warn");
          return;
        }
        if (this.entry.alt < 900) {
          this._fail("Main parachutes were not deployed before the 3,000 ft hard floor.");
        }
        return;
      }

      // Descending under the 3 main parachutes at 7.8 m/s (17.4 mph < 20 mph)
      this.entry.speed = 7.8;
      this.entry.alt = Math.max(0, this.entry.alt - 7.8 * step);
      this.entry.tempF = 78;
      this.entry.loadG = 1.0;

      if (this.entry.alt <= 0) {
        const verticalMps = 7.8;
        const verticalMph = verticalMps * 2.236936;
        this.flags.splash = true;
        this.orion.landed = true;
        this._done("chutes");
        this.splashdownState.splashed = true;
        this.splashdownState.speedMps = verticalMps;
        this.splashdownState.speedMph = verticalMph;
        this.warpReq = 1;
        this.paused = true;
        this.eventHold = "splashdown_actions";
        this._setPhase("splashdown");
        this._emit("SPLASHDOWN", {
          vertical: verticalMps,
          horizontal: 0,
          speedMph: verticalMph,
          region: this.splashdownState.region
        });
        this._say(`SPLASHDOWN CONFIRMED in the Pacific Ocean (~50 NM off California) at ${verticalMph.toFixed(1)} mph (${verticalMps.toFixed(1)} m/s)! Stabilize the capsule and confirm crew safety.`, "info");
      }
    }

    // ---------------------------------------------------------------- Abort handling
    _abort() {
      if (["briefing", "launch_prep", "chutes", "splashdown", "recovery", "debrief"].includes(this.phase)) {
        return { accepted: false, reason: "Abort is not applicable in this phase" };
      }
      if (["launch", "earth_orbit", "prox_ops", "tli_prep"].includes(this.phase)) {
        this.returnAbort = true;
        this.entry.smSeparated = true;
        this.entry.active = true;
        this.entry.alt = SIM.ENTRY_ALT;
        this.entry.speed = 7650;
        this.entry.gamma = -1.4 * DEG;
        this.entry.ready = false;
        this.entry.chute = false;
        this._setPhase("entry");
        this.eventHold = "entry_prep";
        this.paused = true;
        this._emit("ABORT_ENTRY", { speed: 7650 });
        this._say("ABORT DECLARED — Orion is executing an emergency Earth-orbit entry toward ocean recovery.", "warn");
        return { accepted: true };
      }
      if (["outbound", "lunar_flyby", "return_coast"].includes(this.phase)) {
        this.returnAbort = true;
        this._enterAtmosphericInterface();
        this._emit("ABORT_RETURN", {});
        this._say("FREE-RETURN ABORT — Proceeding along the emergency return corridor to Earth Entry Interface.", "warn");
        return { accepted: true };
      }
      return { accepted: false, reason: "Abort is not available in the current state" };
    }

    // ---------------------------------------------------------------- Telemetry & Time Advance
    _updateTelemetry() {
      const v = vec.norm(this.orion.v);
      const r = vec.norm(this.orion.r);
      this.telemetry.maxSpeedMps = Math.max(this.telemetry.maxSpeedMps, v, this.entry.active ? this.entry.speed : 0);
      this.telemetry.maxEarthDistKm = Math.max(this.telemetry.maxEarthDistKm, r / 1000);
      const moon = SIM.moonState(this.t);
      const lunarAltKm = (vec.norm(vec.sub(this.orion.r, moon.r)) - SIM.RM) / 1000;
      if (lunarAltKm > 0) {
        this.telemetry.closestLunarAltKm = Math.min(this.telemetry.closestLunarAltKm, lunarAltKm);
      }
      this.telemetry.maxEntryG = Math.max(this.telemetry.maxEntryG, this.entry.maxG || 0, this.launch.accelG || 0);
      this.telemetry.maxHeatTempF = Math.max(this.telemetry.maxHeatTempF, this.entry.maxTempF || 70);
    }

    _warpLimit() {
      const base = WARP_LIMIT[this.phase] || 1;
      if (this.eventHold || this.paused) return 1;
      return base;
    }

    advance(realDt) {
      if (this.exited) return [];
      if (realDt > 1.2 && !this.paused && !this.result && !["briefing", "launch_prep", "splashdown", "recovery", "debrief"].includes(this.phase)) {
        this.paused = true;
        this._say(`Simulation paused after a ${realDt.toFixed(1)} s tab suspension.`, "warn");
        this._emit("SUSPENDED", { realDt });
      }
      if (this.paused || this.result || ["briefing", "launch_prep", "splashdown", "recovery", "debrief"].includes(this.phase) || this.eventHold) {
        return this.drainEvents();
      }
      const lim = this._warpLimit();
      this.warp = Math.min(this.warpReq, lim);
      let remaining = Math.min(realDt, 0.5) * this.warp;
      let guard = 0;
      while (remaining > 1e-6 && guard++ < 4000) {
        if (this.eventHold || this.result || this.paused) break;
        let dt;
        if (["outbound", "return_coast"].includes(this.phase)) dt = Math.min(remaining, COAST_STEP);
        else if (["earth_orbit", "tli_prep"].includes(this.phase)) dt = Math.min(remaining, 30);
        else if (this.phase === "lunar_flyby") dt = Math.min(remaining, 15);
        else if (this.phase === "launch") dt = Math.min(remaining, 0.25);
        else dt = Math.min(remaining, DT);
        this._step(dt);
        remaining -= dt;
      }
      if (guard >= 4000) this.warp = 1;
      return this.drainEvents();
    }

    advanceSim(seconds) {
      let remaining = Math.max(0, seconds);
      let guard = 0;
      while (remaining > 1e-6 && guard++ < 100000) {
        if (this.eventHold || this.result || this.paused) break;
        let stepMax = DT;
        if (["outbound", "return_coast"].includes(this.phase)) stepMax = COAST_STEP;
        else if (["earth_orbit", "tli_prep"].includes(this.phase)) stepMax = 30;
        else if (this.phase === "lunar_flyby") stepMax = 15;
        else if (this.phase === "launch") stepMax = 0.5;
        const dt = Math.min(remaining, stepMax);
        this._step(dt);
        remaining -= dt;
      }
      return this.drainEvents();
    }

    _step(dt) {
      switch (this.phase) {
        case "launch":       this._advanceLaunch(dt); break;
        case "earth_orbit":  this._advanceEarthOrbit(dt); break;
        case "prox_ops":     this._advanceProxOps(dt); break;
        case "tli_prep":     this._advanceTliPrep(dt); break;
        case "outbound":     this._advanceOutbound(dt); break;
        case "lunar_flyby":  this._advanceLunarFlyby(dt); break;
        case "return_coast": this._advanceReturnCoast(dt); break;
        case "entry":        this._advanceEntry(dt); break;
        case "chutes":       this._advanceChutes(dt); break;
        default:             this.t += dt; break;
      }
    }

    setInputs(inputs) {
      this.inputs = inputs || {};
    }

    // ---------------------------------------------------------------- Snapshot
    snapshot() {
      const moon = SIM.moonState(this.t);
      const rel = vec.sub(this.orion.r, moon.r);
      const earthDist = vec.norm(this.orion.r);
      const earthAlt = ["entry", "chutes", "splashdown", "recovery", "debrief"].includes(this.phase)
        ? this.entry.alt
        : (this.phase === "launch" || this.phase === "briefing" || this.phase === "launch_prep")
          ? this.launch.alt
          : Math.max(0, earthDist - SIM.RE);
      const lunarDist = vec.norm(rel);
      const lunarAlt = Math.max(0, lunarDist - SIM.RM);
      const speedMps = ["entry", "chutes", "splashdown", "recovery", "debrief"].includes(this.phase)
        ? this.entry.speed
        : (this.phase === "launch" || this.phase === "briefing" || this.phase === "launch_prep")
          ? this.launch.speed
          : vec.norm(this.orion.v);

      const occ = this.phase === "lunar_flyby" ? SIM.checkLunarOccultation(this.orion.r, moon.r) : { blackout: false };
      const commStatus = occ.blackout || this.flyby.inBlackout
        ? "LOS — LUNAR FAR-SIDE BLACKOUT (EXPECTED)"
        : this.entry.plasmaBlackout
          ? "PLASMA ATTENUATION — ENTRY INTERFACE"
          : "NOMINAL — DSN / TDRS LINK ACTIVE";

      const meta = PHASE_META[this.phase] || { num: 1, title: this.phase.toUpperCase() };

      return {
        schemaVersion: 2,
        missionId: this.missionId,
        revision: this.revision,
        mode: "artemis-ii-flyby",
        phase: this.phase,
        phaseNumber: meta.num,
        totalPhases: 13,
        phaseTitle: meta.title,
        simTime: this.t,
        met: this.phase === "launch" && this.launch.elapsed < 0 ? this.launch.elapsed : this.t,
        metLabel: fmtT(this.phase === "launch" && this.launch.elapsed < 0 ? this.launch.elapsed : this.t),
        warp: this.warp,
        warpReq: this.warpReq,
        warpMax: this._warpLimit(),
        paused: this.paused,
        eventHold: this.eventHold,
        assist: this.assist,
        autoDock: this.prox.autoMode,
        autoLand: false,
        commStatus,
        inBlackout: !!(occ.blackout || this.flyby.inBlackout),
        nav: {
          earthAltM: earthAlt,
          earthAltKm: earthAlt / 1000,
          earthDistKm: earthDist / 1000,
          earthDistMi: (earthDist / 1000) * 0.621371,
          lunarDistKm: lunarDist / 1000,
          lunarAltKm: lunarAlt / 1000,
          lunarAltMi: (lunarAlt / 1000) * 0.621371,
          speedMps,
          speedMph: speedMps * 2.236936
        },
        vessel: {
          orion: this._vesselView(this.orion),
          lander: this._vesselView(this.lander),
          icps: {
            prop: this.icps.prop,
            propStart: this.icps.propStart,
            dry: this.icps.dry,
            attached: this.icps.attached,
            r: this.icps.r,
            v: this.icps.v
          },
          stack: {
            attached: ["briefing", "launch_prep", "launch", "earth_orbit"].includes(this.phase) && this.icps.attached,
            solarArrays: this.flags.solarArrays,
            smSeparated: this.entry.smSeparated,
            lasJettisoned: this.flags.lasJettison,
            srbSeparated: this.flags.srbSep,
            fairingSeparated: this.flags.fairingSep,
            coreSeparated: this.flags.coreSep,
            mass: this._stackMass()
          }
        },
        moon: { r: moon.r, v: moon.v },
        lunarRel: rel,
        launch: Object.assign({}, this.launch),
        orbitState: Object.assign({}, this.orbitState),
        prox: Object.assign({}, this.prox),
        docking: Object.assign({}, this.prox),
        tliPlan: this.tliPlan ? {
          tDepart: this.tliPlan.tDepart,
          tFlybyIn: this.tliPlan.tFlybyIn,
          tPerilune: this.tliPlan.tPerilune,
          tFlybyOut: this.tliPlan.tFlybyOut,
          tEntry: this.tliPlan.tEntry,
          dv: this.tliPlan.dvMag,
          esmDv: this.tliPlan.esmDvCost,
          tofDays: this.tliPlan.tofOut / 86400,
          periluneAltKm: this.tliPlan.periluneAltKm,
          periluneAltMi: this.tliPlan.periluneAltMi,
          maxEarthDistKm: this.tliPlan.maxEarthDistKm,
          maxEarthDistMi: this.tliPlan.maxEarthDistMi
        } : null,
        flyby: Object.assign({}, this.flyby),
        entry: Object.assign({}, this.entry),
        chutes: Object.assign({}, this.chutes),
        splashdownState: Object.assign({}, this.splashdownState),
        recoveryState: Object.assign({}, this.recoveryState),
        telemetry: Object.assign({}, this.telemetry),
        descent: this.descent,
        surface: this.surface,
        resources: {
          orionProp: this.orion.prop,
          orionPropStart: SIM.VEHICLES.orion.prop,
          orionRcs: this.orion.rcs,
          orionRcsStart: SIM.VEHICLES.orion.rcs,
          icpsProp: this.icps.prop,
          icpsPropStart: this.icps.propStart,
          slsCorePct: this.launch.corePropPct,
          slsSrbPct: this.launch.srbPropPct,
          photos: this.telemetry.photos,
          observations: this.telemetry.observations,
          samples: this.telemetry.observations
        },
        flags: Object.assign({}, this.flags),
        crew: this.crew,
        duties: this.duties,
        objectives: OBJECTIVES.map((o) => ({ id: o.id, phase: o.phase, label: o.label, status: this.obj[o.id] })),
        guidance: this._guidance(),
        allowedCommands: this.allowedCommands(),
        failure: this.failure,
        result: this.result,
        checkpoints: CHECKPOINTS.filter((c) => this.checkpoints[c]),
        messages: this.messages.slice(-8),
        retries: this.retries
      };
    }

    _vesselView(v) {
      return {
        kind: v.kind, r: v.r, v: v.v, q: v.q, w: v.w,
        mass: SIM.mass(v), prop: v.prop, dryMass: v.dryMass,
        descentProp: v.descentProp, ascentProp: v.ascentProp,
        rcs: v.rcs, heat: v.heat, loadG: v.loadG,
        landed: v.landed, chute: v.chute
      };
    }

    _stackMass() {
      return SIM.mass(this.orion) + (this.icps.attached ? this.icps.dry + this.icps.prop : 0);
    }

    _guidance() {
      const g = { phase: this.phase };
      if (this.phase === "tli_prep" || this.phase === "earth_orbit") {
        const plan = this.tliPlan || SIM.planFreeReturnTLI({ r: this.orion.r, v: this.orion.v }, this.t);
        g.tli = plan ? {
          dv: plan.dvMag,
          esmDv: plan.esmDvCost,
          tofDays: plan.tofOut / 86400,
          periluneAltKm: plan.periluneAltKm,
          periluneAltMi: plan.periluneAltMi,
          feasible: SIM.tliFeasible(plan)
        } : null;
      }
      if (this.phase === "entry" || this.phase === "chutes") {
        g.entry = {
          alt: this.entry.alt,
          speed: this.entry.speed,
          gamma: this.entry.gamma / DEG,
          heat: this.entry.heat,
          tempF: this.entry.tempF,
          loadG: this.entry.loadG,
          chute: this.entry.chute,
          ready: this.entry.ready,
          smSeparated: this.entry.smSeparated
        };
      }
      return g;
    }

    allowedCommands() {
      const out = ["PAUSE", "RESTART", "SET_ASSIST"];
      if (Object.keys(this.checkpoints).length) out.push("RETRY_CHECKPOINT");
      if (this.result && this.phase === "debrief") return out;
      out.push("SET_WARP");

      switch (this.phase) {
        case "briefing":
          if (!this.flags.crewReady) out.push("CREW_CHECK");
          if (!this.flags.spacecraftChecked) out.push("SPACECRAFT_CHECK");
          out.push("START");
          break;
        case "launch_prep":
          if (!this.flags.crewIngress) out.push("CREW_INGRESS");
          if (!this.flags.propLoaded) out.push("LOAD_PROPELLANT");
          out.push("COMMIT_LAUNCH");
          break;
        case "launch":
          if (!this.flags.srbSep && this.launch.elapsed >= 115) out.push("STAGE_SRB");
          if (!this.flags.lasJettison && this.launch.elapsed >= 185) out.push("JETTISON_LAS");
          out.push("ABORT");
          break;
        case "earth_orbit":
          if (!this.flags.solarArrays) out.push("DEPLOY_SOLAR_ARRAYS");
          if (!this.flags.checkout) out.push("CHECKOUT");
          if (!this.flags.heoBurn) out.push("HEO_BURN");
          if (!this.flags.orionCheck) out.push("ORION_CHECK");
          out.push("SEPARATE_ICPS", "ABORT");
          break;
        case "prox_ops":
          out.push("PROX_APPROACH", "PROX_HOLD", "PROX_RETREAT", "AUTO_PROX", "CONFIRM_PROX_EXIT", "ABORT");
          break;
        case "tli_prep":
          if (!this.flags.tliVerified) out.push("VERIFY_TLI");
          out.push("TLI", "ABORT");
          break;
        case "outbound":
          if (!this.flags.outboundCheck) out.push("ORION_CHECK");
          if (!this.flags.radiationDrill) out.push("RADIATION_DRILL");
          if (!this.flags.outboundTrim) out.push("TRAJECTORY_TRIM");
          out.push("ABORT");
          break;
        case "lunar_flyby":
          if (!this.flyby.lunarObserved) out.push("LUNAR_OBSERVATION");
          out.push("CONFIRM_FLYBY_EXIT", "ABORT");
          break;
        case "return_coast":
          if (!this.flags.returnCheck) out.push("RETURN_CHECK");
          if (!this.flags.returnTrim) out.push("RETURN_TRIM");
          out.push("ABORT");
          break;
        case "entry":
          if (!this.entry.smSeparated) out.push("SEPARATE_SM");
          if (!this.entry.ready) out.push("ENTRY_PREP");
          break;
        case "chutes":
          if (!this.chutes.droguesDeployed) out.push("DEPLOY_DROGUES");
          else if (!this.chutes.mainsDeployed) out.push("DEPLOY_MAINS");
          break;
        case "splashdown":
          if (!this.splashdownState.stabilized) out.push("STABILIZE_CAPSULE");
          out.push("CONFIRM_CREW_SAFE");
          break;
        case "recovery":
          if (!this.recoveryState.frontPorch) out.push("DEPLOY_FRONT_PORCH");
          if (!this.recoveryState.crewExtracted) out.push("HELICOPTER_EXTRACTION");
          if (this.recoveryState.crewExtracted) out.push("DEBRIEF");
          break;
      }
      return out;
    }
  }

  const api = {
    ArtemisMission,
    PHASES,
    PHASE_META,
    OBJECTIVES,
    CHECKPOINTS,
    WARP_LIMIT,
    DUTIES,
    COMMAND_DUTY,
    CREW_ROSTER,
    DT,
    fmtT
  };
  root.ArtemisMissionLib = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
