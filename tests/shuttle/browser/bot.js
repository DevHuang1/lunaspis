// Browser playtest bot: decides from the in-page MissionSnapshot (HUD data), then acts ONLY through
// real Playwright keyboard events (trusted key presses through the game's DOM listeners). Time is
// accelerated with the test hook __shuttleTest.stepSim (same fixed-step simulation, held keys).
const { open } = require('./harness');
const fs = require('fs');

function brain(variant) {
  const S = window.ShuttleSim, sn = window.__shuttleTest.snapshot(), DEG = Math.PI / 180;
  const v = Object.assign({ orbital: 'follow', sepDir: 'down', entry: 'follow', approach: 'follow', rollout: 'follow', deorbitLate: 0 }, variant || {});
  const mem = window.__botMem || (window.__botMem = { sent: {} });
  const out = { keys: [], press: [], step: 1, sn: null };
  const once = (k, key) => { if (!mem.sent[k]) { mem.sent[k] = true; out.press.push(key); } };
  const t = sn.telemetry, g = sn.guidance, veh = sn.vehicle;
  const key = (err, dead) => (err > dead ? 1 : err < -dead ? -1 : 0);
  const hold = (axisVal, pos, neg) => { if (axisVal > 0) out.keys.push(pos); else if (axisVal < 0) out.keys.push(neg); };
  const st = { q: veh.q, w: veh.w, r: veh.r, v: veh.v };
  const relW = () => S.vec.sub(st.w, S.orbitRateBody(st));
  const alignTo = (target) => {
    let e = S.quat.qmul(S.quat.qconj(st.q), target); if (e[0] < 0) e = e.map((x) => -x);
    const ang = 2 * Math.acos(Math.min(1, e[0])), ax = S.vec.unit([e[1], e[2], e[3]]);
    const des = S.vec.scl(ax, Math.min(1, ang / (6 * DEG))), w = S.vec.scl(relW(), 1 / S.V.holdMaxRate), err = S.vec.sub(des, w);
    hold(key(-err[0], 0.15), 'KeyS', 'KeyW'); hold(key(-err[1], 0.15), 'KeyE', 'KeyQ'); hold(key(err[2], 0.15), 'KeyD', 'KeyA');
    return ang;
  };
  switch (sn.phase) {
    case 'briefing': once('start', 'Enter'); break;
    case 'prelaunch': case 'ascent': out.step = 2; break;
    case 'insertion': once('oms2', 'KeyB'); out.step = sn.burn && sn.burn.active ? 1 : 5; break;
    case 'payload': {
      out.step = 0.25;
      if (v.orbital === 'none') { out.step = 5; break; }
      once('doors', 'KeyY');
      if (veh.doors >= 1) once('power', 'KeyP');
      if (sn.payload.ready) once('go', 'KeyN');
      if (veh.dap === 'FREE') {
        const w = relW();
        hold(key(w[0], 0.03 * DEG), 'KeyS', 'KeyW'); hold(key(w[1], 0.03 * DEG), 'KeyE', 'KeyQ'); hold(key(-w[2], 0.03 * DEG), 'KeyD', 'KeyA');
        if (S.vec.norm(w) < 0.4 * DEG && !mem.holdT) { mem.holdT = 1; out.press.push('KeyH'); } else if (S.vec.norm(w) >= 0.4 * DEG) mem.holdT = 0;
      } else if (sn.payload.attached) {
        const ang = alignTo(S.lvlh(st.r, st.v).q);
        if (ang < 6 * DEG && t.relRateRad < 0.1 * DEG && sn.payload.ready) once('release', 'KeyR');
        if (!sn.payload.ready && ang < 3 * DEG) out.step = 1;
      } else {
        if (((sn.payload.rangeRate || 0) < 1.05 || (g.sepDv || 0) < 0.4) && (sn.payload.range || 0) < 100) { if (v.sepDir === 'down') out.keys.push('KeyK'); if (v.sepDir === 'up') out.keys.push('KeyI'); }
        else out.step = 1;
      }
      break;
    }
    case 'deorbit': {
      out.step = 0.25;
      once('close', 'KeyY');
      if (veh.doors <= 0) once('coast', 'KeyT');
      if (sn.burn && sn.burn.authorized) { out.step = sn.burn.complete ? 4 : 1; break; }
      if (!mem.sent.coast) { out.step = 1; break; }
      if (veh.dap === 'FREE' && !mem.sent.hold2) { mem.sent.hold2 = true; out.press.push('KeyH'); }
      const tgt = S.quat.qFromNoseUp(S.vec.scl(S.vec.unit(st.v), -1), S.quat.qrot(st.q, [0, 1, 0]));
      const ang = alignTo(tgt);
      if (ang < 2.5 * DEG && t.relRateRad < 0.1 * DEG && g.tig <= -v.deorbitLate) once('burn', 'KeyB');
      if (ang < 2.5 * DEG && g.tig > 20 + v.deorbitLate) { out.step = 2; out.keys = []; }
      break;
    }
    case 'entry': {
      out.step = 0.5;
      if (v.entry === 'none') { out.step = 2; break; }
      let tgt = g.bankCmd || 0;
      if (v.entry === 'wrong') tgt = -tgt;
      if (v.entry === 'shallow') tgt = Math.sign(g.bankCmd || 1) * 20 * DEG;
      hold(key(S.vec.wrapPi(tgt - t.bankRad), 2.5 * DEG), 'KeyD', 'KeyA');
      break;
    }
    case 'approach': {
      const a = g.appr; out.step = t.altitudeM < 120 ? 0.05 : 0.1;
      if (!a || v.approach === 'none') { out.step = 0.5; break; }
      // W/S set the glide angle and it holds when released (round 3): steer the held glide angle to the cue,
      // as the node prompt-pilot does (tests/shuttle/run_checks.js)
      let gc = a.gammaCmd;
      if (v.approach === 'noflare' && (a.mode === 'PREFLARE' || a.mode === 'FLARE' || a.mode === 'SHALLOW')) gc = -19 * DEG;
      const gNow = t.gammaHoldRad === null || t.gammaHoldRad === undefined ? t.flightPathRad : t.gammaHoldRad;
      hold(key(gc - gNow, 0.5 * DEG), 'KeyS', 'KeyW');
      hold(key(a.bankCue - t.bankRad, 2 * DEG), 'KeyD', 'KeyA');
      hold(key(a.sbCue - veh.sb, 0.06), 'KeyX', 'KeyZ');
      if (a.gearCue && v.approach !== 'nogear') once('gear', 'KeyG');
      break;
    }
    case 'rollout': {
      out.step = 0.25;
      const r = g.rollout; if (!r) break;
      if (!r.noseDown) out.keys.push('KeyW');
      const psi = veh.ground ? veh.ground.psi : 0;
      hold(key(S.vec.wrapPi(-Math.atan2(r.y, 300) - psi), 0.3 * DEG), 'KeyD', 'KeyA');
      if (r.noseDown && v.rollout !== 'nobrake') out.keys.push('Space');
      if (veh.sb < 0.95) out.keys.push('KeyX');
      break;
    }
  }
  out.sn = { phase: sn.phase, t: sn.simTime, met: sn.met, fail: sn.failure && sn.failure.reason, res: sn.result && sn.result.summary, success: sn.result && sn.result.success,
    alt: t.altitudeM, v: t.airspeedMps, bank: t.bankRad, cmd: g.bankCmd, dap: veh.dap, doors: veh.doors, msg: sn.messages.slice(-1)[0], td: sn.result && sn.result.touchdown, checkpoints: sn.checkpoints };
  return out;
}

async function play(page, variant, opts) {
  opts = opts || {};
  const held = new Set(), log = opts.log || console.log, shots = opts.shots || {};
  let lastPhase = null, it = 0, lastMsg = '';
  const t0 = Date.now();
  while (true) {
    const o = await page.evaluate(brain, variant);
    const s = o.sn;
    if (s.phase !== lastPhase) {
      log(`[${((Date.now() - t0) / 1000).toFixed(0)}s wall | sim ${s.t.toFixed(0)}s] phase → ${s.phase}`);
      if (shots[s.phase]) { await page.waitForTimeout(800); await page.screenshot({ path: shots[s.phase] }); }
      lastPhase = s.phase;
    }
    if (s.msg && s.msg.text !== lastMsg) { lastMsg = s.msg.text; log(`   > ${s.msg.text}`); }
    if (s.fail || s.res || (opts.stopPhase && s.phase === opts.stopPhase)) {
      for (const k of held) await page.keyboard.up(k); held.clear();
      await page.evaluate(() => { window.__botMem = null; });   // un-pressed one-shot keys must not count as sent
      return o.sn;
    }
    const want = new Set(o.keys);
    for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    for (const k of o.press) { await page.keyboard.press(k); log(`   [key] ${k}`); await page.waitForTimeout(30); }
    await page.evaluate((sec) => window.__shuttleTest.stepSim(sec), o.step);
    if (opts.onIter) await opts.onIter(o.sn, it);
    it++;
    if (opts.maxIter && it > opts.maxIter) { log('maxIter'); return o.sn; }
  }
}

async function openShuttle(opts) {
  const h = await open(opts);
  await h.page.waitForTimeout(3000);
  await h.page.fill('#input-player-name', (opts && opts.name) || 'Voss');
  await h.page.click('#btn-solo-flight');
  await h.page.waitForTimeout(4000);
  // the crew starts on the LC-39A gantry; the boarding walk has its own test (run_coop.js), so board here
  if (!(opts && opts.walk)) { await h.page.evaluate(() => window.__shuttleTest.boardAll()); await h.page.waitForTimeout(800); }
  // harness owns simulated time: real-time frames render but do not advance the sim between bot decisions
  await h.page.evaluate(() => window.__shuttleTest.freeze(true));
  return h;
}
// Which crew seat a key belongs to in a given phase (mirrors shuttle_mission.js CREW)
function seatOfKey(k, phase) {
  if (['KeyI', 'KeyK', 'KeyJ', 'KeyL', 'KeyU', 'KeyO', 'KeyY', 'KeyR'].includes(k)) return 'ms1';
  if (['KeyP', 'KeyN'].includes(k)) return 'ms2';
  if (['KeyB', 'KeyT', 'KeyG', 'KeyM', 'Comma', 'Period'].includes(k)) return 'plt';
  if (k === 'KeyZ' || k === 'KeyX') return 'plt';
  return 'cdr';   // rotation / bank / pitch / steering / brakes / Enter / H
}
module.exports = { brain, play, openShuttle, seatOfKey };
