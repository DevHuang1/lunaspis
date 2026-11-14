/*
 * Scripted test pilot for automated checks. It only uses what a player has: the MissionSnapshot
 * (HUD data/cues) and semantic commands. Control outputs are DIGITAL (-1/0/+1, like held keys).
 * Variants deliberately omit or invert player inputs to prove they change outcomes.
 */
"use strict";
const S = require("../../public/js/game/shuttle_simulation.js");
const DEG = Math.PI / 180;
const key = (err, dead) => (err > dead ? 1 : err < -dead ? -1 : 0);

function createPilot(variant) {
  const v = Object.assign({ orbital: "follow", sepDir: "down", entry: "follow", approach: "follow", rollout: "follow", deorbitLate: 0 }, variant || {});
  const mem = { sent: {} };
  const once = (k, cmds, c) => { if (!mem.sent[k]) { mem.sent[k] = true; cmds.push(c); } };

  function step(m) {
    const sn = m.snapshot(), st = m.st, t = sn.telemetry, g = sn.guidance, cmds = [];
    const inp = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: mem.sb || 0, brake: 0 };
    let warp = 1;
    // attitude helpers (orbit): digital rate-nulling and alignment in DAP HOLD
    const relW = () => S.vec.sub(st.w, S.orbitRateBody(st));
    const alignTo = (target) => {
      let e = S.quat.qmul(S.quat.qconj(st.q), target); if (e[0] < 0) e = e.map((x) => -x);
      const ang = 2 * Math.acos(Math.min(1, e[0])), ax = S.vec.unit([e[1], e[2], e[3]]);
      const des = S.vec.scl(ax, Math.min(1, ang / (6 * DEG)));       // desired body rate fraction
      const w = S.vec.scl(relW(), 1 / S.V.holdMaxRate);
      const err = S.vec.sub(des, w);
      inp.pitch = key(-err[0], 0.15); inp.yaw = key(-err[1], 0.15); inp.roll = key(err[2], 0.15);
      return ang;
    };
    switch (sn.phase) {
      case "briefing": once("start", cmds, ["START"]); break;
      case "ascent": warp = 4; break;
      case "insertion":
        once("oms2", cmds, ["AUTHORIZE_BURN"]);
        warp = 100; break;
      case "payload": {
        if (v.orbital === "none") break;
        once("doors", cmds, ["OPEN_BAY"]);
        if (st.bay.doors >= 1) once("power", cmds, ["PAYLOAD_POWER"]);
        if (sn.payload.ready) once("go", cmds, ["PAYLOAD_GO"]);
        if (st.dap.mode === "FREE") {
          const w = relW();
          inp.pitch = key(w[0], 0.03 * DEG); inp.yaw = key(w[1], 0.03 * DEG); inp.roll = key(-w[2], 0.03 * DEG);
          if (S.vec.norm(w) < 0.4 * DEG) { cmds.push(["DAP_HOLD"]); }
        } else if (st.cfg.payload) {
          const ang = alignTo(S.lvlh(st.r, st.v).q);
          if (ang < 6 * DEG && t.relRateRad < 0.1 * DEG && sn.payload.ready) cmds.push(["RELEASE_PAYLOAD"]);
          if (!sn.payload.ready || st.bay.doors < 1) warp = ang < 3 * DEG ? 10 : 1;
        } else {
          if (((sn.payload.rangeRate || 0) < 1.05 || (st.payload.sepDv || 0) < 0.4) && (sn.payload.range || 0) < 100) inp.ty = v.sepDir === "down" ? -1 : v.sepDir === "up" ? 1 : 0;
        }
        break;
      }
      case "deorbit": {
        if (v.orbital === "none") break;
        once("close", cmds, ["CLOSE_BAY"]);
        if (st.bay.doors <= 0) once("coast", cmds, ["COAST_TO_TIG"]);
        if (st.burn && st.burn.authorized) { warp = st.burn.complete ? 100 : 1; break; }
        if (mem.sent.coast) {
          if (st.dap.mode === "FREE") cmds.push(["DAP_HOLD"]);
          const tgt = S.quat.qFromNoseUp(S.vec.scl(S.vec.unit(st.v), -1), S.quat.qrot(st.q, [0, 1, 0]));
          const ang = alignTo(tgt);
          if (ang < 2.5 * DEG && t.relRateRad < 0.1 * DEG && g.tig <= -v.deorbitLate) cmds.push(["AUTHORIZE_BURN"]);
          if (ang < 2.5 * DEG && g.tig > 30 + v.deorbitLate) warp = 1;
        }
        break;
      }
      case "entry": {
        const sig = t.bankRad;
        let tgt = g.bankCmd === undefined ? 0 : g.bankCmd;
        if (v.entry === "none") break;
        if (v.entry === "wrong") tgt = -Math.sign(g.bankCmd || 1) * Math.abs(g.bankCmd || 0);    // reversals the wrong way
        if (v.entry === "shallow") tgt = Math.sign(g.bankCmd || 1) * 20 * DEG;
        if (v.entry === "steep") tgt = Math.sign(g.bankCmd || 1) * 88 * DEG;
        inp.roll = key(S.vec.wrapPi(tgt - sig), 2 * DEG);
        break;
      }
      case "approach": {
        const a = g.appr; if (!a) break;
        if (v.approach === "none") break;
        // keys move the commanded glide angle; steer it onto the guidance flight-path command
        let gc = a.gammaCmd;
        if (v.approach === "noflare" && (a.mode === "PREFLARE" || a.mode === "FLARE")) gc = -19 * DEG;
        inp.pitch = key(gc - (t.gammaHoldRad === null ? t.flightPathRad : t.gammaHoldRad), 0.4 * DEG);
        inp.roll = key(a.bankCue - t.bankRad, 1 * DEG);
        mem.sb = a.sbCue; inp.sb = mem.sb;
        if (a.gearCue && v.approach !== "nogear") once("gear", cmds, ["DEPLOY_GEAR"]);
        break;
      }
      case "rollout": {
        const gr = st.ground; if (!gr || v.rollout === "none") break;
        if (!gr.noseDown) inp.pitch = -1;
        const psiCmd = -Math.atan2(gr.y, 300);
        inp.roll = key(S.vec.wrapPi(psiCmd - gr.psi), 0.3 * DEG);
        if (gr.noseDown && v.rollout !== "nobrake") inp.brake = 1;
        inp.sb = 1; mem.sb = 1;
        break;
      }
    }
    return { input: inp, cmds, warp };
  }
  return { step, variant: v };
}

// Fly a mission (or from the current state) until a terminal condition. Steps 1/60 s.
function fly(m, pilot, opts) {
  opts = opts || {};
  const stopPhase = opts.stopPhase, maxSim = opts.maxSim || 6 * 3600, log = opts.log || (() => {});
  let lastPhase = null, steps = 0;
  const t0 = m.st.t;
  while (!m.result && !m.failure && !m.exited) {
    if (stopPhase && m.phase === stopPhase) break;
    const o = pilot.step(m);
    for (const c of o.cmds) { const r = m.command(c[0], c[1]); if (opts.verbose && !r.accepted && c[0] !== "DAP_HOLD") log(`  [rej] ${c[0]}: ${r.reason}`); }
    m.command("SET_CONTROL_INPUT", o.input);
    // emulate warp by stepping several fixed steps per decision (identical physics)
    const n = Math.max(1, Math.min(o.warp, m._warpLimit().max));
    m.advanceSim(n / 60);
    steps += n;
    if (m.phase !== lastPhase) { log(`[${(m.st.t - t0).toFixed(0)}s] phase ${m.phase}`); lastPhase = m.phase; }
    if (m.st.t - t0 > maxSim) { log("maxSim reached"); break; }
  }
  return { result: m.result, failure: m.failure, phase: m.phase };
}

module.exports = { createPilot, fly };
