/*
 * artemis_mission.js — deterministic mission state machine for the Artemis
 * lunar expedition training scenario.
 *
 * The mission is server-authoritative in co-op and also runs headless in Node
 * for automated checks. It owns phase guards, resource budgets, checkpoints,
 * crew/duty locations and the read-only snapshot consumed by the client.
 * It does not own DOM, Three.js, networking or player identity policy.
 */
(function (root) {
  "use strict";
  const SIM = root.ArtemisSim || (typeof require !== "undefined" ? require("./artemis_simulation.js") : null);
  const { vec, quat } = SIM;
  const clamp = SIM.clamp;
  const DEG = SIM.DEG;
  const DT = 1 / 30;
  const COAST_STEP = 60;

  const PHASES = [
    "briefing", "launch", "earth_orbit", "outbound", "lunar_arrival",
    "lunar_orbit", "docking", "transfer", "descent", "landed", "surface",
    "ascent", "reunion", "return_prep", "return", "entry", "splashdown", "debrief"
  ];

  const OBJECTIVES = [
    { id: "launch", phase: "launch", label: "Launch SLS and validate a stable Earth orbit" },
    { id: "tli", phase: "earth_orbit", label: "Authorize the trans-lunar injection burn" },
    { id: "capture", phase: "lunar_arrival", label: "Capture into the lunar rendezvous orbit" },
    { id: "dock_lander", phase: "docking", label: "Dock Orion with the waiting lander" },
    { id: "transfer_out", phase: "transfer", label: "Transfer two crew and check the lander" },
    { id: "land", phase: "descent", label: "Land at the south-polar training site" },
    { id: "survey", phase: "surface", label: "Survey, photograph and collect sample A" },
    { id: "experiment", phase: "surface", label: "Deploy the training experiment and collect sample B" },
    { id: "ascent", phase: "ascent", label: "Launch from the Moon and rendezvous with Orion" },
    { id: "tei", phase: "return_prep", label: "Authorize the trans-Earth injection burn" },
    { id: "entry", phase: "entry", label: "Prepare Orion and complete entry, parachutes and splashdown" }
  ];

  const CHECKPOINTS = ["launch", "earth_orbit", "lunar_orbit", "docked", "landed", "surface_done", "reunion", "entry"];

  const WARP_LIMIT = {
    briefing: 1, launch: 4, earth_orbit: 1000, outbound: 1000, lunar_arrival: 10,
    lunar_orbit: 1000, docking: 4, transfer: 10, descent: 4, landed: 4, surface: 20,
    ascent: 10, reunion: 4, return_prep: 10, return: 1000, entry: 8, splashdown: 2, debrief: 1
  };

  const DUTIES = {
    surface_pilot: { label: "Surface Pilot", short: "SURF-PLT", color: "#fbbf24" },
    surface_science: { label: "Surface Science", short: "SURF-SCI", color: "#7fb8a6" },
    orion_nav: { label: "Orion Navigation", short: "ORION-NAV", color: "#67e8f9" },
    orion_systems: { label: "Orion Systems", short: "ORION-SYS", color: "#c4b5fd" }
  };

  const COMMAND_DUTY = {
    START: "surface_pilot", TLI: "orion_nav", CAPTURE: "orion_nav", CIRCULARIZE: "orion_nav",
    PHASING: "orion_nav", AUTO_DOCK: "orion_nav", TRANSFER_CREW: "orion_systems",
    UNDOCK: "surface_pilot", SELECT_SITE: "surface_pilot", BEGIN_DESCENT: "surface_pilot",
    AUTO_LAND: "surface_pilot", EGRESS: "surface_pilot", END_EVA: "surface_pilot",
    ASCENT: "surface_pilot", TRANSFER_RETURN: "orion_systems", TEI: "orion_nav",
    ENTRY_PREP: "orion_nav", DEPLOY_CHUTE: "orion_nav", ABORT: "orion_nav",
    ORION_CHECK: "orion_systems", CHECKOUT: "orion_systems", SURFACE_INTERACT: "surface_pilot",
    SET_ASSIST: "surface_pilot", PAUSE: "surface_pilot", SET_WARP: "surface_pilot",
    RETRY_CHECKPOINT: "surface_pilot", RESTART: "surface_pilot"
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fmtT = (t) => {
    const s = Math.max(0, Math.floor(t || 0));
    return `${String(Math.floor(s / 86400)).padStart(2, "0")}:${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  class ArtemisMission {
    constructor(opts) {
      this.opts = opts || {};
      this.serial = 0;
      this.reset();
    }

    reset() {
      this.serial += 1;
      this.missionId = `ART-T${String(this.serial).padStart(2, "0")}-${Date.now().toString(36).slice(-4)}`;
      this.revision = 0; this.eventSeq = 0;
      this.phase = "briefing";
      this.t = 0;
      this.warp = 1; this.warpReq = 1; this.paused = false; this.exited = false;
      this.eventHold = null;
      this.assist = true; this.autoLand = false; this.autoDock = false;
      this.obj = {}; OBJECTIVES.forEach((o) => (this.obj[o.id] = "pending"));
      this.failure = null; this.result = null;
      this.retries = 0; this.checkpoints = {};
      this.messages = []; this.events = [];
      this.flags = { launchLiftoff: false, srbSep: false, coreSep: false, meco: false, orbit: false, tli: false, capture: false, circular: false, phasing: false, dockedLander: false, transferOut: false, landed: false, egress: false, samples: 0, photos: 0, experiment: false, ascent: false, reunion: false, transferReturn: false, tei: false, entry: false, chute: false, splash: false };
      this.crew = { surface: this.opts.surfaceCrew || ["surface-1", "surface-2"], orion: this.opts.orionCrew || ["orion-1", "orion-2"] };
      this.duties = this.opts.duties || null;
      this.orion = SIM.makeVehicle("orion", SIM.parkingState(0).r, SIM.parkingState(0).v, [1, 0, 0, 0]);
      this.lander = SIM.makeVehicle("lander", [SIM.RM + 100000, 0, 0], [0, 0, 0], [1, 0, 0, 0]);
      this.icps = { prop: SIM.VEHICLES.icps.prop, dry: SIM.VEHICLES.icps.dry, isp: SIM.VEHICLES.icps.isp };
      this.launch = { elapsed: 0, stage: "prelaunch", maxQ: 0, slsProp: SIM.VEHICLES.sls.prop };
      this.tliPlan = null; this.teiPlan = null; this.capturePlan = null;
      this.docking = { active: false, target: "lander", pos: [0, 0, 120], vel: [0, 0, -0.18], quat: [1, 0, 0, 0], rates: [0, 0, 0], range: 120, closure: 0.18, lateral: 0, alignErr: 0, docked: false, collisions: 0 };
      this.descent = { active: false, final: false, siteId: SIM.SITES[0].id, x: 0, z: 0, alt: 15000, vx: 0, vy: -20, vz: 0, pitch: 0, roll: 0, yaw: 0, throttle: 0, fuelStart: this.lander.descentProp, terrainH: 0, slope: 0 };
      this.surface = { active: false, elapsed: 0, astronauts: {}, tasks: { photo: false, sampleA: false, experiment: false, sampleB: false }, samples: 0, photos: 0, experimentDeployed: false, endRequested: false };
      this.entry = { ready: false, active: false, alt: 0, speed: 0, gamma: 0, bank: 0, chute: false, heat: 0, loadG: 0, maxHeat: 0, maxG: 0, downrange: 0 };
      this.returnAbort = false;
      this.log = [];
      this._say("Artemis lunar expedition ready. This is a training scenario, not an exact reconstruction of an unflown mission.");
      return this;
    }

    // ---------------------------------------------------------------- events
    _emit(type, data) {
      const e = Object.assign({ id: `${this.missionId}-${++this.eventSeq}`, type, t: this.t, phase: this.phase }, data || {});
      this.events.push(e); this.revision++;
      return e;
    }
    _say(text, level) {
      this.messages.push({ t: this.t, text, level: level || "info" });
      if (this.messages.length > 60) this.messages.shift();
      this.log.push({ t: this.t, text, level: level || "info" });
      if (this.log.length > 200) this.log.shift();
    }
    drainEvents() { const e = this.events; this.events = []; return e; }
    _done(id) { if (this.obj[id] !== "done") { this.obj[id] = "done"; this._emit("OBJECTIVE_DONE", { objective: id }); } }
    _setPhase(p) {
      if (this.phase !== p) {
        const from = this.phase; this.phase = p;
        this._emit("PHASE_CHANGED", { from, to: p });
        this._say(`PHASE: ${String(p).replace(/_/g, " ").toUpperCase()}`, "info");
        this._saveCheckpointForPhase(p);
      }
    }
    _saveCheckpointForPhase(p) {
      const names = { earth_orbit: "earth_orbit", lunar_orbit: "lunar_orbit", landed: "landed", reunion: "reunion", entry: "entry" };
      if (names[p]) this._saveCheckpoint(names[p]);
    }
    _saveCheckpoint(name) {
      if (!name) return;
      this.checkpoints[name] = JSON.stringify({
        v: 1, phase: this.phase, t: this.t, orion: this.orion, lander: this.lander,
        icps: this.icps, launch: this.launch, obj: this.obj, flags: this.flags,
        crew: this.crew, docking: this.docking, descent: this.descent,
        surface: this.surface, entry: this.entry, returnAbort: this.returnAbort,
        tliPlan: this.tliPlan, teiPlan: this.teiPlan, capturePlan: this.capturePlan,
        assist: this.assist, autoLand: this.autoLand, autoDock: this.autoDock
      });
      this._emit("CHECKPOINT_SAVED", { name });
    }
    _restore(name) {
      const c = JSON.parse(this.checkpoints[name]);
      if (c.v !== 1) throw new Error("Unsupported Artemis checkpoint");
      this.phase = c.phase; this.t = c.t; this.orion = c.orion; this.lander = c.lander;
      this.icps = c.icps; this.launch = c.launch; this.obj = c.obj; this.flags = c.flags;
      this.crew = c.crew; this.docking = c.docking; this.descent = c.descent;
      this.surface = c.surface; this.entry = c.entry; this.returnAbort = c.returnAbort;
      this.tliPlan = c.tliPlan; this.teiPlan = c.teiPlan; this.capturePlan = c.capturePlan;
      this.assist = c.assist; this.autoLand = c.autoLand; this.autoDock = c.autoDock;
      this.failure = null; this.result = null; this.paused = false; this.eventHold = null;
      this.warp = 1; this.warpReq = 1; this.retries += 1;
      this._emit("RESTORED", { name });
      this._say(`Restored checkpoint ${name.toUpperCase()} — all vessels, crew, resources and samples were restored together.`, "warn");
    }
    _fail(reason, extra) {
      if (this.failure || this.result) return;
      this.failure = Object.assign({ reason, phase: this.phase, t: this.t, checkpoint: this._bestCheckpoint() }, extra || {});
      this.paused = true; this.eventHold = "failure";
      this.result = { success: false, abort: false, failure: this.failure, samples: this.surface.samples, photos: this.surface.photos, fuel: this._fuelMargins(), assistance: this.assist, retries: this.retries, met: this.t };
      this._emit("FAILED", { reason, checkpoint: this.failure.checkpoint });
      this._say(`FAILURE — ${reason}`, "fail");
    }
    _bestCheckpoint() {
      for (let i = CHECKPOINTS.length - 1; i >= 0; i--) if (this.checkpoints[CHECKPOINTS[i]]) return CHECKPOINTS[i];
      return null;
    }
    _fuelMargins() {
      return {
        orionPropKg: Math.round(this.orion.prop),
        orionRcsKg: Math.round(this.orion.rcs),
        landerDescentKg: Math.round(this.lander.descentProp),
        landerAscentKg: Math.round(this.lander.ascentProp),
        landerRcsKg: Math.round(this.lander.rcs)
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
      if (this.result && !["RESTART", "RETRY_CHECKPOINT", "EXIT", "DEBRIEF"].includes(type)) return no("Mission is complete — retry a checkpoint or return to the lobby");
      const locked = !!(this.failure || this.result);
      switch (type) {
        case "START":
          if (this.phase !== "briefing") return no("Mission already started");
          this._setPhase("launch"); this._saveCheckpoint("launch");
          this._say("Launch authorization received. SLS guidance is in control; monitor the stack and enjoy the view.", "info");
          return ok();
        case "PAUSE": this.paused = !this.paused; return ok(this.paused ? "Paused" : "Resumed");
        case "EXIT": this.exited = true; this.paused = true; this._emit("EXITED"); return ok("Mission exited — no result recorded.");
        case "RESTART": this.reset(); return ok("Fresh Artemis mission.");
        case "RETRY_CHECKPOINT": {
          const name = a.name || this.failure && this.failure.checkpoint || this._bestCheckpoint();
          if (!name || !this.checkpoints[name]) return no("No checkpoint available");
          this._restore(name); return ok(`Restored ${name}`);
        }
        case "SET_WARP": {
          const max = this._warpLimit();
          const f = Math.max(1, Math.min(1000, Math.round(Number(a.factor) || 1)));
          if (f > max) { this.warpReq = max; return no(`Time acceleration limited to ${max}× in this phase`); }
          this.warpReq = f; return { accepted: true };
        }
        case "SET_ASSIST": this.assist = a.on === undefined ? !this.assist : !!a.on; return ok(`Guidance assist ${this.assist ? "ON" : "OFF"}`);
        case "AUTO_DOCK":
          if (this.phase !== "docking" && this.phase !== "reunion") return no("No docking approach is active");
          this.autoDock = true; return ok("Auto-dock guidance engaged. The pilot can still take over at any time.");
        case "AUTO_LAND":
          if (this.phase !== "descent") return no("Descent is not active");
          this.autoLand = true; return ok("Auto-land guidance engaged. Final descent is still fuel-limited.");
        case "TLI": return this._tli();
        case "CAPTURE": return this._capture();
        case "CIRCULARIZE": return this._circularize();
        case "PHASING": return this._phasing();
        case "TRANSFER_CREW": return this._transferCrew();
        case "UNDOCK": return this._undock();
        case "SELECT_SITE": {
          if (this.phase !== "transfer" && this.phase !== "descent") return no("Select a site after crew transfer, before descent");
          const site = SIM.siteById(a.siteId);
          this.descent.siteId = site.id; this.descent.x = 0; this.descent.z = 0;
          return ok(`Landing site selected: ${site.name}`);
        }
        case "BEGIN_DESCENT": return this._beginDescent();
        case "EGRESS":
          if (this.phase !== "landed") return no("Touchdown is not confirmed");
          return this._egress();
        case "DEBRIEF":
          if (this.phase !== "splashdown") return no("Debrief is available after splashdown");
          this._setPhase("debrief");
          return ok("Debrief opened.");
        case "SURFACE_INTERACT": return this._surfaceInteract(a);
        case "END_EVA": return this._endEva();
        case "ASCENT": return this._ascent();
        case "TRANSFER_RETURN": return this._transferReturn();
        case "TEI": return this._tei();
        case "ENTRY_PREP": return this._entryPrep();
        case "DEPLOY_CHUTE": return this._deployChute();
        case "ORION_CHECK": return this._orionCheck(a);
        case "CHECKOUT": return this._checkout();
        case "ABORT": return this._abort();
        default: return no(`Unknown command ${type}`);
      }
    }

    // ---------------------------------------------------------------- launch / earth orbit
    _advanceLaunch(dt) {
      this.launch.elapsed += dt; this.t += dt;
      const e = this.launch.elapsed;
      if (!this.flags.launchLiftoff && e >= 8) {
        this.flags.launchLiftoff = true; this.launch.stage = "ascent";
        this._emit("LIFTOFF", { alt: 0 }); this._say("LIFTOFF — SLS has cleared the tower. Guidance is controlling pitch, throttle and staging.", "info");
      }
      if (!this.flags.srbSep && e >= 126) {
        this.flags.srbSep = true; this.launch.stage = "core";
        this._emit("SRB_SEPARATION"); this._say("Twin solid rocket boosters separated. Core stage and ICPS continue the climb.", "info");
      }
      if (!this.flags.meco && e >= 480) {
        this.flags.meco = true; this.launch.stage = "meco";
        this._emit("MECO"); this._say("Main engine cutoff. Core stage separation and ICPS orbit insertion are next.", "info");
      }
      if (!this.flags.coreSep && e >= 492) {
        this.flags.coreSep = true; this.launch.stage = "icps";
        this._emit("CORE_SEPARATION"); this._say("Core stage separated; ICPS is circularizing the Orion stack.", "info");
      }
      if (e >= 510) {
        const p = SIM.parkingState(this.t);
        this.orion.r = p.r; this.orion.v = p.v;
        const el = SIM.elements(this.orion.r, this.orion.v, SIM.MU_E);
        if (!(el.bound && el.periapsisAlt >= 180000)) {
          this._fail(`Launch guidance did not reach a stable parking orbit (${(el.periapsisAlt / 1000).toFixed(0)} km periapsis).`);
          return;
        }
        this.flags.orbit = true; this._done("launch"); this._setPhase("earth_orbit");
        this._say(`Parking orbit validated from the physical state: ${(el.periapsisAlt / 1000).toFixed(0)} × ${(el.apoapsisAlt / 1000).toFixed(0)} km.`, "info");
        this.eventHold = "earth_orbit"; this.paused = true;
        this._emit("ORBIT_VALIDATED", { periapsisAlt: el.periapsisAlt, apoapsisAlt: el.apoapsisAlt });
      }
    }

    _tli() {
      if (this.phase !== "earth_orbit") return { accepted: false, reason: "TLI is available in the checked-out Earth orbit" };
      const plan = SIM.planTLI({ r: this.orion.r, v: this.orion.v }, this.t);
      if (!plan || !SIM.tliFeasible(plan)) return { accepted: false, reason: "No feasible lunar transfer window from the current parking state" };
      const stackMass = SIM.mass(this.orion) + this.icps.dry + this.icps.prop;
      const mf = stackMass * Math.exp(-plan.dvMag / (this.icps.isp * SIM.G0));
      const used = stackMass - mf;
      if (used > this.icps.prop) return { accepted: false, reason: `TLI needs ${Math.round(used)} kg of ICPS propellant; ${Math.round(this.icps.prop)} kg available` };
      this.icps.prop -= used;
      SIM.applyImpulse(this.orion, plan.dv);
      this.tliPlan = plan; this.flags.tli = true; this._done("tli");
      this._emit("TLI_BURN", { dv: plan.dvMag, tofDays: plan.tof / 86400, propUsed: used });
      this._say(`Trans-lunar injection complete: ${(plan.dvMag / 1000).toFixed(2)} km/s, ${(plan.tof / 86400).toFixed(2)} day transfer. ICPS separated.`, "info");
      this._setPhase("outbound");
      this.eventHold = null; this.paused = false;
      return { accepted: true };
    }

    _advanceCislunar(dt) {
      const step = Math.min(dt, COAST_STEP);
      const s = SIM.rk4(this.orion.r, this.orion.v, step, this.t, true, SIM.MU_E);
      this.orion.r = s.r; this.orion.v = s.v; this.t += step;
      const moon = SIM.moonState(this.t);
      const rel = vec.sub(this.orion.r, moon.r);
      const range = vec.norm(rel);
      if (this.phase === "outbound" && range < SIM.LUNAR_GATE) {
        this.capturePlan = { relR: rel, relV: vec.sub(this.orion.v, moon.v), range };
        this.eventHold = "lunar_arrival"; this.warpReq = 1; this.paused = true;
        this._setPhase("lunar_arrival");
        this._emit("LUNAR_GATE", { range, altitude: range - SIM.RM });
        this._say(`Lunar arrival gate: ${(range / 1000).toFixed(0)} km from the Moon. Authorize the capture burn before the trajectory reaches the surface.`, "warn");
      }
    }

    _capture() {
      if (this.phase !== "lunar_arrival") return { accepted: false, reason: "Capture is available at the lunar arrival gate" };
      if (!this.capturePlan) return { accepted: false, reason: "No lunar arrival state" };
      const rel = { r: this.capturePlan.relR, v: this.capturePlan.relV };
      const rp = SIM.RM + 100000;
      const shaped = SIM.shapeLunarApproach(rel, rp);
      if (!shaped) return { accepted: false, reason: "Cannot shape a safe lunar approach from the arrival gate" };
      // Propagate the shaped approach to perilune using Moon-only dynamics.
      let r = rel.r.slice(), v = shaped.v.slice(), elapsed = 0, h = 5, steps = 0;
      while (steps++ < 40000) {
        const next = SIM.rk4(r, v, h, this.t + elapsed, false, SIM.MU_M);
        const rn = vec.norm(next.r), prev = vec.norm(r);
        r = next.r; v = next.v; elapsed += h;
        if (rn <= rp + 1200 && vec.dot(next.r, next.v) < 0) break;
        if (rn < SIM.RM + 1000) break;
      }
      const peri = { r, v };
      const circ = SIM.circularizeAtPeriapsis(peri, 100000);
      if (!circ) return { accepted: false, reason: "Approach did not reach a safe 100 km perilune" };
      const totalDv = shaped.dvMag + circ.dvMag;
      const m0 = SIM.mass(this.orion);
      const mf = m0 * Math.exp(-totalDv / (this.orion.isp * SIM.G0));
      const used = m0 - mf;
      if (used > this.orion.prop) return { accepted: false, reason: `Capture sequence needs ${Math.round(used)} kg of Orion propellant; ${Math.round(this.orion.prop)} kg available` };
      this.orion.prop -= used;
      this.t += elapsed;
      const moon = SIM.moonState(this.t);
      this.orion.r = vec.add(moon.r, peri.r);
      this.orion.v = vec.add(moon.v, circ.targetV);
      this.flags.capture = true; this.flags.circular = true; this._done("capture");
      this._emit("CAPTURE_BURN", { dv: totalDv, approachDv: shaped.dvMag, circularDv: circ.dvMag, propUsed: used, tofHours: elapsed / 3600 });
      this._say(`Lunar capture complete: ${(shaped.dvMag + circ.dvMag).toFixed(0)} m/s total, 100 km circular orbit. The Blue Moon-style lander is 30 km ahead.`, "info");
      this._setPhase("lunar_orbit"); this.eventHold = null; this.paused = false;
      this._saveCheckpoint("lunar_orbit");
      return { accepted: true };
    }

    _advanceLunarOrbit(dt) {
      const step = Math.min(dt, 30);
      const rel = SIM.moonRelative(this.orion.r, this.orion.v, this.t);
      const s2 = SIM.rk4(rel.r, rel.v, step, this.t, false, SIM.MU_M);
      const world = SIM.moonToEci(s2.r, s2.v, this.t);
      this.orion.r = world.r; this.orion.v = world.v; this.t += step;
      if (!this.flags.circular && rel.r) {
        const el = SIM.elements(s2.r, s2.v, SIM.MU_M);
        const rn = vec.norm(s2.r);
        if (el.bound && el.periapsisAlt > 50e3 && rn <= el.rp + 8000 && vec.dot(s2.r, s2.v) < 0) {
          this.eventHold = "perilune"; this.warpReq = 1; this.paused = true;
          this._emit("PERILUNE_READY", { altitude: rn - SIM.RM, periapsisAlt: el.periapsisAlt });
          this._say(`Periapsis reached at ${((rn - SIM.RM) / 1000).toFixed(0)} km. Circularize the orbit before rendezvous.`, "warn");
        }
      }
      // Lander remains parked in the 100 km orbit until phasing.
      const lm = SIM.moonState(this.t);
      this.lander.r = vec.add(lm.r, [SIM.RM + 100000, 0, 0]);
      this.lander.v = vec.add(lm.v, [0, 0, Math.sqrt(SIM.MU_M / (SIM.RM + 100000))]);
    }

    _circularize() {
      if (this.phase !== "lunar_orbit") return { accepted: false, reason: "Circularization is available in lunar orbit" };
      if (this.flags.circular) return { accepted: false, reason: "Orbit is already circular" };
      const rel = SIM.moonRelative(this.orion.r, this.orion.v, this.t);
      const p = SIM.circularizeAtPeriapsis(rel, 100000);
      if (!p) return { accepted: false, reason: "Wait until the spacecraft reaches perilune" };
      const m0 = SIM.mass(this.orion);
      const mf = m0 * Math.exp(-p.dvMag / (this.orion.isp * SIM.G0));
      const used = m0 - mf;
      if (used > this.orion.prop) return { accepted: false, reason: `Circularization needs ${Math.round(used)} kg of Orion propellant` };
      this.orion.prop -= used; SIM.applyImpulse(this.orion, p.dv);
      this.flags.circular = true; this.eventHold = null; this.paused = false;
      this._emit("CIRCULARIZED", { dv: p.dvMag, propUsed: used });
      this._say(`Lunar orbit circularized at 100 km: ${p.dvMag.toFixed(0)} m/s. The Blue Moon-style lander is 30 km ahead in the same orbit.`, "info");
      return { accepted: true };
    }

    _phasing() {
      if (this.phase !== "lunar_orbit") return { accepted: false, reason: "Phasing is available after circularization" };
      if (!this.flags.circular) return { accepted: false, reason: "Circularize the lunar orbit first" };
      this.flags.phasing = true; this._done("capture");
      this._emit("PHASING_BURN", {});
      this._say("Phasing burn complete. The lander is 25 m ahead; final RCS approach is now under pilot control.", "info");
      this._startDocking("lander", 25);
      return { accepted: true };
    }

    // ---------------------------------------------------------------- docking
    _startDocking(target, range) {
      this._setPhase(target === "orion" ? "reunion" : "docking");
      this.docking = { active: true, target, pos: [0, 0, range || 25], vel: [0, 0, -0.40], quat: [1, 0, 0, 0], rates: [0, 0, 0], range: range || 25, closure: 0.40, lateral: 0, alignErr: 0, docked: false, collisions: 0 };
      this.autoDock = false;
      this._emit("DOCKING_STARTED", { target, range: range || 120 });
    }

    _advanceDocking(dt, input) {
      const d = this.docking;
      if (!d.active) return;
      const i = input || {};
      const fine = i.fine ? 0.35 : 1;
      const accel = 0.22 * fine;
      const rot = 0.9 * DEG * fine;
      d.vel[0] += (i.tx || 0) * accel * dt;
      d.vel[1] += (i.ty || 0) * accel * dt;
      d.vel[2] += (i.tz || 0) * accel * dt;
      d.rates[0] += (i.pitch || 0) * rot * dt;
      d.rates[1] += (i.yaw || 0) * rot * dt;
      d.rates[2] += (i.roll || 0) * rot * dt;
      const damp = Math.pow(0.995, dt * 60);
      d.vel = vec.scl(d.vel, damp); d.rates = vec.scl(d.rates, damp);
      if (this.autoDock) {
        const desired = Math.min(0.18, Math.max(0.025, d.range * 0.012));
        d.vel[0] += -d.pos[0] * 0.20 * dt;
        d.vel[1] += -d.pos[1] * 0.20 * dt;
        d.vel[2] += ((-desired) - d.vel[2]) * 0.9 * dt;
        d.rates = vec.scl(d.rates, Math.pow(0.90, dt * 60));
      }
      d.pos = vec.add(d.pos, vec.scl(d.vel, dt));
      d.range = vec.norm(d.pos);
      d.closure = -d.vel[2];
      d.lateral = Math.hypot(d.pos[0], d.pos[1]);
      d.rates = vec.scl(d.rates, 1 + 0);
      d.alignErr = Math.hypot(d.rates[0], d.rates[1], d.rates[2]) * 20 + Math.hypot(d.pos[0], d.pos[1]) * 0.08;
      if (d.range < 1.6) {
        if (d.closure > 0.12 || d.lateral > 0.22 || d.alignErr > 5) {
          d.collisions += 1;
          this._fail(`Docking contact outside limits: closure ${d.closure.toFixed(2)} m/s, lateral ${d.lateral.toFixed(2)} m, alignment ${d.alignErr.toFixed(1)}°.`);
          return;
        }
        d.active = false; d.docked = true;
        if (d.target === "lander") { this.flags.dockedLander = true; this._done("dock_lander"); this._setPhase("transfer"); this._say("Hard capture with the lunar lander confirmed. Pressure and hatch checks are now available.", "info"); this._saveCheckpoint("docked"); }
        else { this.flags.reunion = true; this._setPhase("return_prep"); this._say("Reunion with Orion confirmed. Transfer the surface crew and samples, then prepare for TEI.", "info"); this._saveCheckpoint("reunion"); }
      }
    }

    _transferCrew() {
      if (this.phase !== "transfer" || !this.flags.dockedLander) return { accepted: false, reason: "Dock with the lander first" };
      this.flags.transferOut = true; this._done("transfer_out");
      this.crew.surface = this.crew.surface.slice(0, 2);
      this.crew.orion = this.crew.orion.slice(0, 2);
      this._emit("CREW_TRANSFER", { surface: this.crew.surface, orion: this.crew.orion });
      this._say("Two crew transferred to the lander; two remain aboard Orion. Check the docking seal, suits and descent/ascent reserves before undocking.", "info");
      return { accepted: true };
    }

    _undock() {
      if (this.phase !== "transfer" || !this.flags.transferOut) return { accepted: false, reason: "Complete the crew transfer and lander checks first" };
      if (this.lander.descentProp < 18000 || this.lander.ascentProp < 9000) return { accepted: false, reason: "Lander descent/ascent reserve is below the training minimum" };
      this.flags.dockedLander = false;
      this._setPhase("descent");
      this._say("Lander undocked. Select a south-polar site, then authorize the guided braking phase. Final descent is pilot-controlled.", "info");
      return { accepted: true };
    }

    _beginDescent() {
      if (this.phase !== "descent") return { accepted: false, reason: "Descent is not active" };
      this.descent.active = true; this.descent.final = false;
      this.descent.alt = 15000; this.descent.vx = 1450; this.descent.vy = -12; this.descent.vz = 0;
      this.descent.fuelStart = this.lander.descentProp;
      this.descent.terrainH = SIM.terrainHeight(this.descent.x, this.descent.z);
      this.descent.slope = SIM.terrainSlopeDeg(this.descent.x, this.descent.z);
      this.autoLand = false;
      this._emit("DESCENT_STARTED", { site: this.descent.siteId });
      this._say("Guided braking has started. The lander will transition to active final descent at 2 km; throttle and translation become live then.", "info");
      return { accepted: true };
    }

    _advanceDescent(dt, input) {
      const d = this.descent;
      if (!d.active) return;
      const i = input || {};
      if (!d.final) {
        d.vx = Math.max(0, d.vx - 16 * dt);
        d.alt -= Math.max(0, -d.vy) * dt;
        d.vy = Math.max(-55, d.vy - 0.30 * dt);
        const used = Math.max(0, (d.vx * 0.01 + 2.0) * dt * 0.04);
        this.lander.descentProp = Math.max(0, this.lander.descentProp - used);
        if (d.alt <= 2000) {
          d.final = true; d.alt = 2000; d.vx = 0; d.vy = -18; d.vz = 0;
          this._emit("FINAL_DESCENT", {}); this._say("FINAL DESCENT — 2 km. Use throttle to control descent rate and lateral thrusters to hold the site.", "warn");
        }
        return;
      }
      const g = 1.62;
      const mass = SIM.mass(this.lander);
      const maxThrust = SIM.VEHICLES.lander.descentThrust;
      const hover = mass * g / maxThrust;
      const targetVy = -Math.min(8, Math.max(1.2, d.alt * 0.006));
      const autoThrottle = clamp(hover + (targetVy - d.vy) * 0.6 * mass / maxThrust, 0, 1);
      const throttle = this.autoLand ? autoThrottle : clamp(Number(i.throttle) || 0, 0, 1);
      const thrustA = throttle * maxThrust / Math.max(1, mass);
      d.vy += (-g + thrustA) * dt;
      const lateral = this.autoLand ? -d.x * 0.12 : (Number(i.tx) || 0) * 0.35;
      d.vx += lateral * dt;
      d.vz += (this.autoLand ? -d.z * 0.02 : (Number(i.tz) || 0) * 0.35) * dt;
      d.vx *= Math.pow(0.996, dt * 60); d.vz *= Math.pow(0.996, dt * 60);
      d.x += d.vx * dt; d.z += d.vz * dt; d.alt += d.vy * dt;
      const used = throttle * SIM.VEHICLES.lander.descentThrust / (SIM.VEHICLES.lander.descentIsp * SIM.G0) * dt;
      this.lander.descentProp = Math.max(0, this.lander.descentProp - used);
      d.throttle = throttle;
      d.terrainH = SIM.terrainHeight(SIM.siteById(d.siteId).x + d.x, SIM.siteById(d.siteId).z + d.z);
      d.slope = SIM.terrainSlopeDeg(SIM.siteById(d.siteId).x + d.x, SIM.siteById(d.siteId).z + d.z);
      if (this.lander.descentProp <= 0) { this._fail("Descent propellant exhausted before touchdown."); return; }
      if (d.alt <= d.terrainH + 2.4) this._touchdown();
    }

    _touchdown() {
      const d = this.descent;
      const vertical = Math.abs(d.vy), horizontal = Math.hypot(d.vx, d.vz);
      d.alt = d.terrainH + 2.4;
      if (vertical > 2.0) return this._fail(`Touchdown vertical speed ${vertical.toFixed(2)} m/s exceeded the 2.0 m/s training limit.`);
      if (horizontal > 1.0) return this._fail(`Touchdown horizontal speed ${horizontal.toFixed(2)} m/s exceeded the 1.0 m/s limit.`);
      if (d.slope > 12) return this._fail(`Landing site slope ${d.slope.toFixed(1)}° exceeded the 12° limit.`);
      if (Math.abs(d.pitch) > 8 || Math.abs(d.roll) > 8) return this._fail("Lander attitude exceeded the 8° touchdown limit.");
      this.flags.landed = true; this.lander.landed = true; this._done("land");
      this._setPhase("landed");
      this._saveCheckpoint("landed");
      this._say(`Touchdown confirmed. Vertical ${vertical.toFixed(2)} m/s, horizontal ${horizontal.toFixed(2)} m/s, slope ${d.slope.toFixed(1)}°. The surface crew can egress.`, "info");
      this._emit("TOUCHDOWN", { vertical, horizontal, slope: d.slope, site: d.siteId });
    }

    _egress() {
      this.flags.egress = true; this.surface.active = true; this.surface.elapsed = 0;
      const ids = this.crew.surface.length ? this.crew.surface : ["surface-1", "surface-2"];
      this.surface.astronauts = {};
      ids.forEach((id, i) => {
        this.surface.astronauts[id] = { id, x: 10 + i * 4, z: 12 - i * 6, heading: 0, o2: 100, battery: 100, outside: true, slope: 0 };
      });
      this._setPhase("surface");
      this._emit("EVA_STARTED", { crew: ids });
      this._say("EVA started. Two surface crew are outside. Complete the survey/sample and experiment/sample sequences, then return to the lander.", "info");
      return { accepted: true };
    }

    _advanceSurface(dt, inputs) {
      if (!this.surface.active) return;
      this.surface.elapsed += dt;
      const site = SIM.siteById(this.descent.siteId);
      const maxDist = 700;
      Object.values(this.surface.astronauts).forEach((a) => {
        const inp = inputs && inputs[a.id] || {};
        const speed = inp.sprint ? 2.2 : 1.25;
        const forward = (inp.forward || 0) * speed, strafe = (inp.strafe || 0) * speed;
        const s = Math.sin(a.heading), c = Math.cos(a.heading);
        a.x += (forward * s + strafe * c) * dt;
        a.z += (forward * c - strafe * s) * dt;
        a.heading += (inp.turn || 0) * 1.4 * dt;
        const dist = Math.hypot(a.x, a.z);
        if (dist > maxDist) { a.x *= maxDist / dist; a.z *= maxDist / dist; }
        a.slope = SIM.terrainSlopeDeg(site.x + a.x, site.z + a.z);
        a.o2 = Math.max(0, a.o2 - 0.0028 * dt);
        a.battery = Math.max(0, a.battery - 0.0018 * dt);
        if (a.slope > 22) a.o2 = Math.max(0, a.o2 - 0.0015 * dt);
        if (a.o2 <= 0) this._fail(`EVA oxygen exhausted for ${a.id}.`);
        if (a.battery <= 0) this._fail(`EVA suit battery exhausted for ${a.id}.`);
      });
      if (this.surface.elapsed > 7200) this._fail("EVA exceeded the two-hour training limit.");
    }

    _surfaceTargets() {
      const site = SIM.siteById(this.descent.siteId);
      return {
        photo: { x: 70, z: 95, r: 30, label: "Survey photo station" },
        sampleA: { x: 105, z: 145, r: 25, label: "Documented sample A" },
        experiment: { x: -75, z: 135, r: 30, label: "Training experiment" },
        sampleB: { x: -135, z: 205, r: 25, label: "Documented sample B" }
      };
    }

    _surfaceInteract(a) {
      if (this.surface.active !== true) return { accepted: false, reason: "EVA is not active" };
      const id = a.actorId || Object.keys(this.surface.astronauts)[0];
      const ast = this.surface.astronauts[id];
      if (!ast) return { accepted: false, reason: "No active surface astronaut" };
      const targets = this._surfaceTargets();
      const targetId = String(a.target || "");
      const t = targets[targetId];
      if (!t) return { accepted: false, reason: "Unknown surface target" };
      if (Math.hypot(ast.x - t.x, ast.z - t.z) > t.r) return { accepted: false, reason: `Move closer to ${t.label}` };
      if (targetId === "photo") {
        if (this.surface.tasks.photo) return { accepted: false, reason: "Survey photo already taken" };
        this.surface.tasks.photo = true; this.surface.photos += 1; this.flags.photos += 1;
        this._emit("SURFACE_PHOTO", { by: id }); this._say(`Survey photograph captured by ${id}.`, "info");
      } else if (targetId === "sampleA") {
        if (!this.surface.tasks.photo) return { accepted: false, reason: "Take the survey photograph first" };
        if (this.surface.tasks.sampleA) return { accepted: false, reason: "Sample A already collected" };
        this.surface.tasks.sampleA = true; this.surface.samples += 1; this.flags.samples += 1;
        this._emit("SAMPLE_COLLECTED", { sample: "A", by: id }); this._say(`Documented sample A collected and bagged by ${id}.`, "info");
      } else if (targetId === "experiment") {
        if (this.surface.tasks.experiment) return { accepted: false, reason: "Experiment already deployed" };
        this.surface.tasks.experiment = true; this.surface.experimentDeployed = true;
        this._emit("EXPERIMENT_DEPLOYED", { by: id }); this._say("Small training experiment deployed and checked; it is not a flight-confirmed Artemis instrument.", "info");
      } else if (targetId === "sampleB") {
        if (!this.surface.tasks.experiment) return { accepted: false, reason: "Deploy the experiment first" };
        if (this.surface.tasks.sampleB) return { accepted: false, reason: "Sample B already collected" };
        this.surface.tasks.sampleB = true; this.surface.samples += 1; this.flags.samples += 1;
        this._emit("SAMPLE_COLLECTED", { sample: "B", by: id }); this._say(`Documented sample B collected and bagged by ${id}.`, "info");
      }
      if (this.surface.tasks.photo && this.surface.tasks.sampleA && !this.obj.survey) this._done("survey");
      if (this.surface.tasks.experiment && this.surface.tasks.sampleB && !this.obj.experiment) this._done("experiment");
      return { accepted: true };
    }

    _endEva() {
      if (!this.surface.active) return { accepted: false, reason: "EVA is not active" };
      const done = this.surface.tasks.photo && this.surface.tasks.sampleA && this.surface.tasks.experiment && this.surface.tasks.sampleB;
      if (!done) return { accepted: false, reason: "Complete both bounded EVA task sequences before returning" };
      const site = SIM.siteById(this.descent.siteId);
      for (const a of Object.values(this.surface.astronauts)) {
        if (Math.hypot(a.x, a.z) > 45) return { accepted: false, reason: `${a.id} is still away from the lander (return margin)` };
      }
      this.surface.active = false;
      this.flags.egress = false;
      this._setPhase("ascent");
      this._saveCheckpoint("surface_done");
      this._say("EVA complete: two samples, two photographs and the training experiment. Crew and samples are secured for ascent.", "info");
      return { accepted: true };
    }

    _ascent() {
      if (this.phase !== "ascent") return { accepted: false, reason: "Ascent is available after EVA" };
      if (this.lander.ascentProp < 6500) return { accepted: false, reason: "Insufficient ascent propellant for the training rendezvous" };
      const used = 5200;
      this.lander.ascentProp -= used;
      this.flags.ascent = true; this._done("ascent");
      this._emit("ASCENT_START", { propUsed: used });
      this._say("Guided lunar ascent started. The lander is targeting a 100 km rendezvous with Orion; final docking remains pilot-controlled.", "info");
      this.ascentTimer = 0;
      return { accepted: true };
    }

    _advanceAscent(dt) {
      this.ascentTimer = (this.ascentTimer || 0) + dt;
      if (this.ascentTimer < 240) return;
      const moon = SIM.moonState(this.t);
      const rOrb = SIM.RM + 100000;
      const vOrb = Math.sqrt(SIM.MU_M / rOrb);
      const orb = SIM.moonRelative(this.orion.r, this.orion.v, this.t);
      const rel = vec.add(orb.r, [140, 0, 0]);
      const relV = vec.add(orb.v, [0, 0, vOrb * 0.0001]);
      const world = SIM.moonToEci(rel, relV, this.t);
      this.lander.r = world.r; this.lander.v = world.v;
      this._startDocking("orion", 25);
      this._emit("RENDEZVOUS_READY", { range: 25 });
      this._say("Lunar ascent complete; the lander is 25 m from Orion. Fly the final RCS approach.", "info");
    }

    _transferReturn() {
      if (this.phase !== "return_prep") return { accepted: false, reason: "Dock with Orion before returning crew" };
      this.flags.transferReturn = true;
      this._emit("RETURN_TRANSFER", { samples: this.surface.samples });
      this._say("Surface crew and samples transferred to Orion. Orion is the only vehicle returning to Earth.", "info");
      this._setPhase("return_prep");
      return { accepted: true };
    }

    _tei() {
      if (this.phase !== "return_prep") return { accepted: false, reason: "TEI is available after the crew and samples are aboard Orion" };
      const plan = SIM.planTEI(this.orion, this.t);
      if (!plan) return { accepted: false, reason: "No feasible Earth-return window from the current lunar orbit" };
      const m0 = SIM.mass(this.orion);
      const mf = m0 * Math.exp(-plan.dvMag / (this.orion.isp * SIM.G0));
      const used = m0 - mf;
      if (used > this.orion.prop) return { accepted: false, reason: `TEI needs ${Math.round(used)} kg of Orion propellant; ${Math.round(this.orion.prop)} kg available` };
      this.orion.prop -= used; SIM.applyImpulse(this.orion, plan.dv);
      this.teiPlan = plan; this.flags.tei = true; this._done("tei");
      this._emit("TEI_BURN", { dv: plan.dvMag, propUsed: used, tofDays: plan.tof / 86400 });
      this._say(`Trans-Earth injection complete: ${(plan.dvMag / 1000).toFixed(2)} km/s. Orion is on a separate Earth-return trajectory, not a reversed outbound path.`, "info");
      this._setPhase("return");
      this.eventHold = null;
      return { accepted: true };
    }

    _advanceReturn(dt) {
      let remaining = dt, guard = 0;
      while (remaining > 1e-6 && guard++ < 5000) {
        const rn = vec.norm(this.orion.r);
        // Refine near Earth so a 60 s coast step cannot tunnel through the
        // entry interface. Earth-only motion matches the TEI Lambert arc.
        const step = Math.min(remaining, rn < SIM.RE + 500000 ? 0.5 : COAST_STEP);
        const prevR = this.orion.r.slice(), prevV = this.orion.v.slice(), prevRn = rn;
        const s = SIM.rk4(this.orion.r, this.orion.v, step, this.t, false, SIM.MU_E);
        this.orion.r = s.r; this.orion.v = s.v; this.t += step; remaining -= step;
        const rn2 = vec.norm(this.orion.r);
        if (rn2 <= SIM.RE + SIM.ENTRY_ALT) {
          const f = Math.max(0, Math.min(1, (prevRn - (SIM.RE + SIM.ENTRY_ALT)) / Math.max(1e-9, prevRn - rn2)));
          const rInt = vec.add(prevR, vec.scl(vec.sub(this.orion.r, prevR), f));
          const vInt = vec.add(prevV, vec.scl(vec.sub(this.orion.v, prevV), f));
          this.orion.r = rInt; this.orion.v = vInt;
          const rr = vec.norm(rInt), vv = vec.norm(vInt);
          const gamma = Math.asin(vec.dot(rInt, vInt) / (rr * vv));
          this.entry.active = true; this.entry.alt = SIM.ENTRY_ALT; this.entry.speed = vv; this.entry.gamma = -1.2 * DEG;
          this.entry.ready = false; this.entry.chute = false;
          this._setPhase("entry"); this.eventHold = "entry_prep"; this.paused = true;
          this._emit("ENTRY_INTERFACE", { altitude: this.entry.alt, speed: vv, gamma });
          this._say(`Entry interface: ${(this.entry.alt / 1000).toFixed(0)} km at ${(vv / 1000).toFixed(2)} km/s, flight-path angle ${(gamma / DEG).toFixed(1)}°. Prepare the capsule.`, "warn");
          this._saveCheckpoint("entry");
          return;
        }
        if (rn2 < SIM.RE) { this._fail("Return trajectory impacted the Earth before entry interface."); return; }
      }
    }

    _entryPrep() {
      if (this.phase !== "entry") return { accepted: false, reason: "Entry preparation is only available at entry interface" };
      this.entry.ready = true; this.eventHold = null; this.paused = false;
      this._emit("ENTRY_READY", {});
      this._say("Entry preparation complete: crew strapped, heat shield forward, service module separation sequence armed.", "info");
      return { accepted: true };
    }

    _deployChute() {
      if (this.phase !== "entry" || !this.entry.active) return { accepted: false, reason: "No active entry" };
      if (this.entry.chute) return { accepted: false, reason: "Parachutes already deployed" };
      if (this.entry.alt > 10000 || this.entry.speed > 260) return { accepted: false, reason: `Parachute deployment envelope not met (${(this.entry.alt / 1000).toFixed(1)} km, ${this.entry.speed.toFixed(0)} m/s)` };
      this.entry.chute = true; this.eventHold = null; this.paused = false; this._emit("CHUTE_DEPLOYED", { alt: this.entry.alt, speed: this.entry.speed });
      this._say("Drogue and main parachutes deployed. Orion is descending to the ocean recovery zone.", "info");
      return { accepted: true };
    }

    _advanceEntry(dt) {
      if (!this.entry.active) return;
      if (!this.entry.ready) {
        // Give the crew a short grace period at interface, then fail.
        this.entry.grace = (this.entry.grace || 0) + dt;
        if (this.entry.grace > 8) this._fail("Entry started before the crew completed heat-shield and cabin preparation.");
        return;
      }
      const step = Math.min(dt, 1);
      if (this.entry.chute) {
        // Training parachute model: stable terminal descent under the mains.
        this.entry.alt -= 9 * step;
        this.entry.speed = 9;
        this.entry.gamma = -Math.PI / 2;
        this.entry.heat = 0;
        this.entry.loadG = 0;
      } else {
        // Guided entry: hold a shallow lift-modulated profile until the
        // capsule is subsonic, then steepen for the parachute box.
        const targetGamma = this.entry.speed < 600 ? -8 * DEG : -1.2 * DEG;
        this.entry.gamma += (targetGamma - this.entry.gamma) * Math.min(1, step * 0.4);
        const d = SIM.entryDerivative(this.entry.alt, this.entry.speed, this.entry.gamma, this.entry.bank || 0, false);
        this.entry.alt += d.dAlt * step; this.entry.speed = Math.max(0, this.entry.speed + d.dSpeed * step);
        this.entry.heat = d.heat; this.entry.loadG = d.loadG;
        this.entry.maxHeat = Math.max(this.entry.maxHeat, d.heat); this.entry.maxG = Math.max(this.entry.maxG, d.loadG);
        if (this.entry.heat > 200) return this._fail(`Entry heat load ${this.entry.heat.toFixed(0)} exceeded the training limit.`);
        if (this.entry.loadG > 8.5) return this._fail(`Entry load ${this.entry.loadG.toFixed(2)} g exceeded the 8.5 g training limit.`);
        if (this.entry.alt < 8000 && this.entry.speed < 300) {
          this.eventHold = "chute"; this.warpReq = 1; this.paused = true;
          this._say("Parachute deployment altitude reached. Deploy the chutes.", "warn");
        }
        if (this.entry.alt < 4500) return this._fail("No parachute deployment before the 4.5 km hard limit.");
      }
      if (this.entry.alt <= 0) {
        const vertical = this.entry.chute ? 9 : Math.abs(this.entry.speed * Math.sin(this.entry.gamma || -Math.PI / 2));
        const horizontal = this.entry.chute ? 0 : Math.abs(this.entry.speed * Math.cos(this.entry.gamma || 0));
        if (vertical > 12 || horizontal > 25) return this._fail(`Ocean contact outside limits: ${vertical.toFixed(1)} m/s vertical, ${horizontal.toFixed(1)} m/s horizontal.`);
        this.flags.splash = true; this._done("entry");
        this._setPhase("splashdown");
        this.result = { success: !this.returnAbort, abort: !!this.returnAbort, failure: null, samples: this.surface.samples, photos: this.surface.photos, fuel: this._fuelMargins(), assistance: this.assist, retries: this.retries, met: this.t, splashdown: { vertical, horizontal } };
        this._emit("SPLASHDOWN", { vertical, horizontal });
        this._say(`Splashdown confirmed. Vertical ${vertical.toFixed(1)} m/s, horizontal ${horizontal.toFixed(1)} m/s. Crew and samples are recovered.`, "info");
        this.paused = true; this.eventHold = "debrief";
      }
    }

    _orionCheck() {
      if (!["earth_orbit", "outbound", "lunar_orbit", "return_prep"].includes(this.phase)) return { accepted: false, reason: "Orion checks are available during cruise or before TEI" };
      this.flags.orionCheck = true;
      this._emit("ORION_CHECK", {}); this._say("Orion systems and navigation check complete: power, ECLSS, comms, propellant and guidance are within training limits.", "info");
      return { accepted: true };
    }
    _checkout() {
      if (this.phase !== "earth_orbit") return { accepted: false, reason: "Checkout is available in Earth orbit" };
      this.flags.checkout = true;
      this._emit("CHECKOUT", {}); this._say("Earth-orbit checkout complete: Orion, ICPS, crew and ground links are ready for TLI.", "info");
      return { accepted: true };
    }

    _abort() {
      if (["briefing", "launch", "descent", "landed", "surface", "ascent", "reunion", "entry", "splashdown", "debrief"].includes(this.phase)) {
        return { accepted: false, reason: "No physically feasible abort from this phase; retry the last checkpoint or continue the checklist" };
      }
      if (this.phase === "earth_orbit") {
        this.returnAbort = true;
        const up = vec.unit(this.orion.r), east = vec.unit(vec.cross([0, 0, 1], up));
        this.orion.r = vec.scl(up, SIM.RE + SIM.ENTRY_ALT);
        this.orion.v = vec.scl(east, 7600);
        this.entry.active = true; this.entry.alt = SIM.ENTRY_ALT; this.entry.speed = 7600; this.entry.gamma = -1.2 * DEG;
        this.entry.ready = false; this.entry.chute = false;
        this._setPhase("entry"); this.eventHold = "entry_prep"; this.paused = true;
        this._emit("ABORT_ENTRY", { speed: 7600 });
        this._say("Abort declared in Earth orbit. Orion is on a direct entry trajectory; this is a training abort, not a lunar mission.", "warn");
        return { accepted: true };
      }
      const plan = SIM.planTEI(this.orion, this.t);
      if (!plan) return { accepted: false, reason: "No feasible Earth-return trajectory from this state" };
      const m0 = SIM.mass(this.orion), mf = m0 * Math.exp(-plan.dvMag / (this.orion.isp * SIM.G0)), used = m0 - mf;
      if (used > this.orion.prop) return { accepted: false, reason: "Not enough Orion propellant for an abort-return burn" };
      this.orion.prop -= used; SIM.applyImpulse(this.orion, plan.dv);
      this.returnAbort = true; this._setPhase("return");
      this._emit("ABORT_RETURN", { dv: plan.dvMag, propUsed: used });
      this._say("Abort-return burn complete. The crew is returning to Earth without a landing; no universal rescue maneuver is assumed.", "warn");
      return { accepted: true };
    }

    // ---------------------------------------------------------------- time advance
    _warpLimit() {
      const base = WARP_LIMIT[this.phase] || 1;
      if (this.eventHold || this.paused) return 1;
      if (this.phase === "outbound" || this.phase === "return") return base;
      return base;
    }

    advance(realDt) {
      if (this.exited) return [];
      if (realDt > 1.0 && !this.paused && !this.result && this.phase !== "briefing") {
        this.paused = true; this._say(`Paused after a ${realDt.toFixed(1)} s suspension; simulation time was not skipped.`, "warn");
        this._emit("SUSPENDED", { realDt });
      }
      if (this.paused || this.result || this.phase === "briefing" || this.phase === "debrief" || this.eventHold) return this.drainEvents();
      const lim = this._warpLimit();
      this.warp = Math.min(this.warpReq, lim);
      let remaining = Math.min(realDt, 0.5) * this.warp;
      let guard = 0;
      while (remaining > 1e-6 && guard++ < 4000) {
        if (this.eventHold || this.result || this.paused) break;
        let dt;
        if (["outbound", "return"].includes(this.phase)) dt = Math.min(remaining, COAST_STEP);
        else if (["lunar_orbit", "earth_orbit", "return"].includes(this.phase)) dt = Math.min(remaining, 30);
        else if (this.phase === "surface") dt = Math.min(remaining, 0.25);
        else if (this.phase === "launch") dt = Math.min(remaining, 0.25);
        else dt = Math.min(remaining, DT);
        this._step(dt);
        remaining -= dt;
      }
      if (guard >= 4000) this.warp = 1;
      return this.drainEvents();
    }

    advanceSim(seconds) {
      let remaining = Math.max(0, seconds), guard = 0;
      while (remaining > 1e-6 && guard++ < 100000) {
        if (this.eventHold || this.result || this.paused) break;
        const dt = Math.min(remaining, ["outbound", "return"].includes(this.phase) ? COAST_STEP : ["lunar_orbit", "earth_orbit"].includes(this.phase) ? 30 : DT);
        this._step(dt); remaining -= dt;
      }
      return this.drainEvents();
    }

    _step(dt) {
      switch (this.phase) {
        case "launch": this._advanceLaunch(dt); break;
        case "earth_orbit": this.t += dt; { const p = SIM.parkingState(this.t); this.orion.r = p.r; this.orion.v = p.v; } break;
        case "outbound": this._advanceCislunar(dt); break;
        case "lunar_arrival": this.t += dt; break;
        case "lunar_orbit": this._advanceLunarOrbit(dt); break;
        case "docking": this._advanceDocking(dt, this.inputs && this.inputs.docking); this.t += dt; break;
        case "descent": this._advanceDescent(dt, this.inputs && this.inputs.descent); this.t += dt; break;
        case "surface": this._advanceSurface(dt, this.inputs && this.inputs.surface); this.t += dt; break;
        case "ascent": this._advanceAscent(dt); this.t += dt; break;
        case "reunion": this._advanceDocking(dt, this.inputs && this.inputs.docking); this.t += dt; break;
        case "return": this._advanceReturn(dt); break;
        case "entry": this._advanceEntry(dt); this.t += dt; break;
        default: this.t += dt; break;
      }
    }

    setInputs(inputs) { this.inputs = inputs || {}; }

    // ---------------------------------------------------------------- snapshot
    snapshot() {
      const moon = SIM.moonState(this.t);
      const rel = this.phase === "outbound" || this.phase === "lunar_arrival" || this.phase === "lunar_orbit" || this.phase === "docking" || this.phase === "reunion" || this.phase === "return" || this.phase === "return_prep"
        ? vec.sub(this.orion.r, moon.r) : null;
      return {
        schemaVersion: 1, missionId: this.missionId, revision: this.revision, mode: "artemis-training",
        phase: this.phase, simTime: this.t, met: this.t, metLabel: fmtT(this.t),
        warp: this.warp, warpReq: this.warpReq, warpMax: this._warpLimit(), paused: this.paused, eventHold: this.eventHold,
        assist: this.assist, autoLand: this.autoLand, autoDock: this.autoDock,
        vessel: {
          orion: this._vesselView(this.orion), lander: this._vesselView(this.lander),
          icps: { prop: this.icps.prop, dry: this.icps.dry },
          stack: { attached: ["briefing", "launch", "earth_orbit"].includes(this.phase), mass: this._stackMass() }
        },
        moon: { r: moon.r, v: moon.v },
        lunarRel: rel,
        launch: { elapsed: this.launch.elapsed, stage: this.launch.stage },
        tliPlan: this.tliPlan ? { dv: this.tliPlan.dvMag, tofDays: this.tliPlan.tof / 86400, tDepart: this.tliPlan.tDepart } : null,
        teiPlan: this.teiPlan ? { dv: this.teiPlan.dvMag, tofDays: this.teiPlan.tof / 86400 } : null,
        docking: Object.assign({}, this.docking, { active: this.docking.active }),
        descent: Object.assign({}, this.descent),
        surface: { active: this.surface.active, elapsed: this.surface.elapsed, tasks: this.surface.tasks, samples: this.surface.samples, photos: this.surface.photos, astronauts: this.surface.astronauts, targets: this._surfaceTargets(), experimentDeployed: this.surface.experimentDeployed },
        entry: Object.assign({}, this.entry),
        resources: {
          orionProp: this.orion.prop, orionPropStart: SIM.VEHICLES.orion.prop, orionRcs: this.orion.rcs,
          landerDescent: this.lander.descentProp, landerDescentStart: SIM.VEHICLES.lander.descentProp,
          landerAscent: this.lander.ascentProp, landerAscentStart: SIM.VEHICLES.lander.ascentProp,
          landerRcs: this.lander.rcs, samples: this.surface.samples, photos: this.surface.photos
        },
        crew: this.crew, duties: this.duties,
        objectives: OBJECTIVES.map((o) => ({ id: o.id, phase: o.phase, label: o.label, status: this.obj[o.id] })),
        guidance: this._guidance(),
        allowedCommands: this.allowedCommands(),
        failure: this.failure, result: this.result,
        checkpoints: CHECKPOINTS.filter((c) => this.checkpoints[c]),
        messages: this.messages.slice(-8), retries: this.retries
      };
    }
    _vesselView(v) {
      return { kind: v.kind, r: v.r, v: v.v, q: v.q, w: v.w, mass: SIM.mass(v), prop: v.prop, dryMass: v.dryMass, descentProp: v.descentProp, ascentProp: v.ascentProp, rcs: v.rcs, heat: v.heat, loadG: v.loadG, landed: v.landed, chute: v.chute };
    }
    _stackMass() { return SIM.mass(this.orion) + this.icps.dry + this.icps.prop; }
    _guidance() {
      const g = { phase: this.phase };
      if (this.phase === "earth_orbit") {
        const plan = SIM.planTLI({ r: this.orion.r, v: this.orion.v }, this.t);
        g.tli = plan ? { dv: plan.dvMag, tofDays: plan.tof / 86400, feasible: SIM.tliFeasible(plan) } : null;
      }
      if (this.phase === "lunar_orbit") {
        const rel = SIM.moonRelative(this.orion.r, this.orion.v, this.t);
        const el = SIM.elements(rel.r, rel.v, SIM.MU_M);
        g.lunarOrbit = { periapsisAlt: el.periapsisAlt, apoapsisAlt: el.apoapsisAlt, target: "100 km circular" };
      }
      if (this.phase === "descent") {
        const site = SIM.siteById(this.descent.siteId);
        g.descent = { site: site.name, alt: this.descent.alt, terrain: this.descent.terrainH, slope: this.descent.slope, vertical: -this.descent.vy, horizontal: Math.hypot(this.descent.vx, this.descent.vz), fuel: this.lander.descentProp, reserve: this.lander.descentProp - (this.descent.final ? 1800 : 8000), final: this.descent.final };
      }
      if (this.phase === "entry") g.entry = { alt: this.entry.alt, speed: this.entry.speed, gamma: this.entry.gamma / DEG, heat: this.entry.heat, loadG: this.entry.loadG, chute: this.entry.chute, ready: this.entry.ready };
      return g;
    }
    allowedCommands() {
      const out = ["PAUSE", "EXIT", "RESTART", "SET_ASSIST"];
      if (Object.keys(this.checkpoints).length) out.push("RETRY_CHECKPOINT");
      if (this.result) return out;
      out.push("SET_WARP");
      switch (this.phase) {
        case "briefing": out.push("START"); break;
        case "earth_orbit": out.push("TLI", "CHECKOUT", "ORION_CHECK", "ABORT"); break;
        case "outbound": out.push("ORION_CHECK", "ABORT"); break;
        case "lunar_arrival": out.push("CAPTURE", "ABORT"); break;
        case "lunar_orbit": out.push("CIRCULARIZE", "PHASING", "ORION_CHECK", "ABORT"); break;
        case "docking": case "reunion": out.push("AUTO_DOCK"); break;
        case "transfer": out.push("TRANSFER_CREW", "UNDOCK"); break;
        case "descent": out.push("SELECT_SITE", "BEGIN_DESCENT", "AUTO_LAND", "ABORT"); break;
        case "landed": out.push("EGRESS"); break;
        case "surface": out.push("SURFACE_INTERACT", "END_EVA", "ORION_CHECK"); break;
        case "ascent": out.push("ASCENT"); break;
        case "return_prep": out.push("TRANSFER_RETURN", "TEI", "ORION_CHECK"); break;
        case "return": out.push("ABORT"); break;
        case "entry": out.push("ENTRY_PREP", "DEPLOY_CHUTE"); break;
        case "splashdown": out.push("DEBRIEF"); break;
      }
      return out;
    }

    // ---------------------------------------------------------------- api
  }

  const api = { ArtemisMission, PHASES, OBJECTIVES, CHECKPOINTS, WARP_LIMIT, DUTIES, COMMAND_DUTY, DT, fmtT };
  root.ArtemisMissionLib = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
