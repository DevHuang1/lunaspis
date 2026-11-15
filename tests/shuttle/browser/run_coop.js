// Co-op playtest (CREW_N clients, default 4): browser clients (CDR, PLT, MS1, MS2) in one crew room. Each client decides
// from its own copy of the server snapshot but only presses keys that belong to ITS seat (real key
// events). The CDR client advances the server's fixed-step simulation (test hook) after every
// client's held inputs have been acknowledged by the server.
const { chromium } = require('playwright');
const fs = require('fs');
const { brain, seatOfKey } = require('./bot');
const OUT = process.env.OUT_DIR || 'coop';
fs.mkdirSync(OUT, { recursive: true });
const THREE_SRC = process.env.THREE_JS_PATH ? fs.readFileSync(process.env.THREE_JS_PATH) : null;
const BASE = process.env.SHUTTLE_URL || 'http://localhost:3137';
const VARIANT = JSON.parse(process.env.VARIANT || '{}');

async function client(browser, name, big) {
  const page = await browser.newPage({ viewport: big ? { width: 1280, height: 720 } : { width: 640, height: 360 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });
  if (THREE_SRC) {
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1).*/, (r) => r.abort());
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_SRC }));
  }
  await page.goto(`${BASE}/?shuttletest=1`, { waitUntil: 'load', timeout: 300000 });
  await page.waitForTimeout(2500);
  await page.waitForSelector('#input-player-name', { timeout: 120000 }); await page.evaluate((n) => { document.getElementById('input-player-name').value = n; }, name);
  return { page, logs, name, held: new Set(), roles: [] };
}

(async () => {
  const lines = []; const log = (s) => { lines.push(s); console.log(s); };
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const cdr = await client(browser, 'Voss', true);
  await cdr.page.evaluate(() => document.getElementById('btn-host-game').click());
  await cdr.page.waitForTimeout(1500);
  const code = (await cdr.page.textContent('#lobby-room-code')).trim();
  log(`room ${code}`);
  const crew = [cdr];
  for (const n of ['Reyes', 'Okafor', 'Lindqvist'].slice(0, Math.max(0, Number(process.env.CREW_N || 4) - 1))) {
    log(`joining ${n}…`);
    const c = await client(browser, n, false);
    log(`  page loaded for ${n}`);
    // DOM clicks: SwiftShader renders ~1 fps with four clients, which stalls Playwright's 'stable' check
    await c.page.evaluate((code) => { document.getElementById('input-join-code').value = code; document.getElementById('btn-join-game').click(); }, code);
    await c.page.waitForTimeout(1200);
    crew.push(c);
  }
  await cdr.page.waitForTimeout(800);
  await cdr.page.screenshot({ timeout: 150000, path: `${OUT}/01_lobby_cdr.png` });
  await crew[Math.min(2, crew.length - 1)].page.screenshot({ timeout: 150000, path: `${OUT}/01b_lobby_ms1.png` });
  // a seat conflict must be refused: MS1 tries to take the Pilot seat
  await crew[Math.min(2, crew.length - 1)].page.evaluate(() => document.querySelector('#lobby-roles-list .lobby-role-card[data-role="plt"]').click());
  await crew[Math.min(2, crew.length - 1)].page.waitForTimeout(600);
  log('lobby ready; launching');
  await cdr.page.evaluate(() => document.getElementById('btn-start-mission').click());
  for (const c of crew) await c.page.waitForFunction(() => window.shuttleGame && window.shuttleGame.isActive && window.netManager.snapshot && window.netManager.snapshot.crew, null, { timeout: 180000, polling: 500 });
  for (const c of crew) c.roles = await c.page.evaluate(() => window.__shuttleTest.roles());
  log('seats: ' + crew.map((c) => `${c.name}=${c.roles.join('+')}`).join(', '));
  // ---- boarding on LC-39A: everyone starts on the gantry deck; START waits for the whole crew
  await cdr.page.waitForTimeout(3000);
  const walking = [];
  for (const c of crew) walking.push(!!(await c.page.evaluate(() => window.__shuttleTest.walk())));
  log('walking on the gantry: ' + crew.map((c, i) => `${c.name}=${walking[i]}`).join(', '));
  const early = await cdr.page.evaluate(() => window.netManager.sendCommand('START'));
  log('CDR START before boarding → ' + JSON.stringify(early));
  // the Commander walks to the access-arm control; the Pilot must see the Commander's astronaut move
  const cdrId = await cdr.page.evaluate(() => window.netManager.socketId);
  const seen0 = await crew[1].page.evaluate((id) => { const r = window.shuttleGame.walk && window.shuttleGame.walk.remote[id]; return r ? r.pos.slice() : null; }, cdrId);
  const goTo = async (c, tx, tz, rad) => {
    for (let i = 0; i < 160; i++) {
      const w = await c.page.evaluate(() => window.__shuttleTest.walk()); if (!w) return null;
      const dx = tx - w.pos[0], dz = tz - w.pos[2]; if (Math.hypot(dx, dz) < rad) return w;
      await c.page.evaluate(([dx, dz]) => { window.shuttleGame.walk.camYaw = Math.atan2(dx, dz); }, [dx, dz]);
      await c.page.keyboard.down('w'); await c.page.waitForTimeout(Math.max(200, Math.min(1500, Math.hypot(dx, dz) * 600))); await c.page.keyboard.up('w'); await c.page.waitForTimeout(150);
    }
    return null;
  };
  await goTo(cdr, 27.5, -1.5, 0.6); const atC = await goTo(cdr, 25.9, -2.9, 1.3);
  await cdr.page.waitForTimeout(2500);
  const seen1 = await crew[1].page.evaluate((id) => { const r = window.shuttleGame.walk && window.shuttleGame.walk.remote[id]; const rig = window.shuttleGame.walk && window.shuttleGame.walk.rigs[id]; return r ? { pos: r.pos.slice(), rigVisible: !!(rig && rig.root.visible) } : null; }, cdrId);
  const vm = await crew[1].page.evaluate(() => { const v = window.voiceManager; return v ? { lastProx: v.lastProximityUpdateAt > 0 } : null; });
  const armState = await crew[Math.min(3, crew.length - 1)].page.evaluate(() => window.netManager.snapshot.pad);
  log(`CDR at the arm control: ${!!atC}; PLT sees CDR ${JSON.stringify(seen0)} → ${JSON.stringify(seen1)}; proximity voice updated on PLT: ${JSON.stringify(vm)}; MS2 sees pad ${JSON.stringify(armState)}`);
  await crew[1].page.screenshot({ timeout: 150000, path: `${OUT}/02a_gantry_plt.png` });
  await cdr.page.waitForTimeout(3500);
  await goTo(cdr, 24.0, -2.0, 0.5); await goTo(cdr, 8.5, -2.0, 1.2);
  await cdr.page.waitForTimeout(2500);
  const afterCdr = await cdr.page.evaluate(() => window.netManager.snapshot.pad);
  log('after the Commander crossed the arm: ' + JSON.stringify(afterCdr));
  await crew[1].page.screenshot({ timeout: 150000, path: `${OUT}/02b_gantry_after_cdr_plt.png` });
  await cdr.page.evaluate(() => window.__shuttleTest.boardAll());   // the other three board (test shortcut)
  await cdr.page.waitForTimeout(2000);
  await crew[1].page.screenshot({ timeout: 150000, path: `${OUT}/02_briefing_plt.png` });
  // non-owner command must be refused by the server: the Pilot tries to start the count
  const refused = await crew[1].page.evaluate(() => window.netManager.sendCommand('START'));
  log('PLT sends START → ' + JSON.stringify(refused));
  await cdr.page.evaluate(() => window.__shuttleTest.freeze(true));

  const shots = { ascent: 's_ascent', insertion: 's_insertion', payload: 's_payload', deorbit: 's_deorbit', entry: 's_entry', approach: 's_approach', rollout: 's_rollout', debrief: 's_debrief' };
  let lastPhase = null, lastMsg = '', it = 0;
  const t0 = Date.now();
  const pressCount = {};
  while (true) {
    const outs = [];
    for (const c of crew) outs.push(await c.page.evaluate(brain, VARIANT));
    const s = outs[0].sn;
    if (s.phase !== lastPhase) {
      log(`[${((Date.now() - t0) / 1000).toFixed(0)}s wall | sim ${s.t.toFixed(0)}s] phase → ${s.phase}`);
      if (shots[s.phase]) { await cdr.page.waitForTimeout(600); await cdr.page.screenshot({ timeout: 150000, path: `${OUT}/${shots[s.phase]}_cdr.png` }); }
      if (s.phase === 'payload') await crew[Math.min(2, crew.length - 1)].page.screenshot({ timeout: 150000, path: `${OUT}/s_payload_ms1.png` });
      lastPhase = s.phase;
    }
    if (s.msg && s.msg.text !== lastMsg) { lastMsg = s.msg.text; log(`   > ${s.msg.text}`); }
    if (s.fail || s.res) { log('END ' + JSON.stringify({ phase: s.phase, fail: s.fail, res: s.res, success: s.success, td: s.td })); break; }
    for (let i = 0; i < crew.length; i++) {
      const c = crew[i], o = outs[i], ph = o.sn.phase;
      const want = new Set(o.keys.filter((k) => c.roles.includes(seatOfKey(k, ph))));
      for (const k of [...c.held]) if (!want.has(k)) { await c.page.keyboard.up(k); c.held.delete(k); }
      for (const k of want) if (!c.held.has(k)) { await c.page.keyboard.down(k); c.held.add(k); }
      for (const k of o.press) if (c.roles.includes(seatOfKey(k, ph))) { await c.page.keyboard.press(k); pressCount[`${c.name}:${k}`] = (pressCount[`${c.name}:${k}`] || 0) + 1; await c.page.waitForTimeout(40); }
      await c.page.evaluate(() => window.__shuttleTest.flushInput());
    }
    await cdr.page.evaluate((sec) => window.__shuttleTest.stepSim(sec), outs[0].step);
    if (s.phase === 'payload' && !shots.bayDone && (s.doors || 0) >= 1) { shots.bayDone = 1; await crew[Math.min(2, crew.length - 1)].page.keyboard.press('KeyC'); await crew[Math.min(2, crew.length - 1)].page.waitForTimeout(800); await crew[Math.min(2, crew.length - 1)].page.screenshot({ timeout: 150000, path: `${OUT}/s_bay_ms1.png` }); await crew[Math.min(2, crew.length - 1)].page.keyboard.press('KeyC'); await crew[Math.min(2, crew.length - 1)].page.keyboard.press('KeyC'); }
    if (s.phase === 'ascent' && !shots.look && s.met > 60) { shots.look = 1; const p = crew[1].page; await p.mouse.move(320, 180); await p.mouse.down(); await p.mouse.move(470, 140, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(700); await p.screenshot({ timeout: 150000, path: `${OUT}/s_ascent_freelook_plt.png` }); }
    it++;
  }
  log('key presses by seat: ' + JSON.stringify(pressCount));
  await cdr.page.waitForTimeout(1200);
  await cdr.page.screenshot({ timeout: 150000, path: `${OUT}/99_debrief_cdr.png` });
  await crew[Math.min(3, crew.length - 1)].page.screenshot({ timeout: 150000, path: `${OUT}/99_debrief_ms2.png` });
  for (const c of crew) log(`${c.name} page errors: ${JSON.stringify(c.logs.slice(0, 5))}`);
  fs.writeFileSync(`${OUT}/log.txt`, lines.join('\n'));
  await browser.close();
})();
