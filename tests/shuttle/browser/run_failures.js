// Failure / retry / input-comparison browser playtest in ONE flight session (real key input).
const OUT = process.env.OUT_DIR || 'shuttle-playtest-failures';
const { play, openShuttle } = require('./bot');
const fs = require('fs');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const lines = []; const log = (s) => { lines.push(s); console.log(s); };
  const { browser, page, logs } = await openShuttle();
  const resetBot = () => page.evaluate(() => { window.__botMem = null; });
  const retry = async (name, shot) => {
    if (shot) { await page.waitForTimeout(800); await page.screenshot({ path: shot }); }
    const sel = `#sh-card button[data-arg="${name}"]`;
    await page.click(sel); log(`   [click] ${sel}`); await resetBot(); await page.waitForTimeout(500);
  };
  const tel = () => page.evaluate(() => { const s = window.__shuttleTest.snapshot(); return { phase: s.phase, t: s.simTime, fail: s.failure && s.failure.reason, alt: s.telemetry.altitudeM, dist: s.telemetry.rangeToRunwayM, retries: s.retries, cks: s.checkpoints, res: s.result }; });
  // 1) fly to payload ops, then separate the WRONG way (toward the satellite)
  let r = await play(page, { sepDir: 'up' }, { log, stopPhase: 'deorbit' });
  log('CASE wrong-way separation → ' + JSON.stringify({ phase: r.phase, fail: r.fail }));
  await retry('orbit', OUT + '/01_collision_failure.png');
  r = await play(page, {}, { log, stopPhase: 'deorbit' });
  log('CASE retry from ORBIT with correct separation → phase ' + r.phase + ' ' + (r.fail || ''));
  // 2) deorbit and coast to the entry checkpoint, then NO bank input
  r = await play(page, { entry: 'none' }, { log });
  const noneT = await tel();
  log('CASE entry with no bank input → ' + JSON.stringify({ fail: noneT.fail, t: noneT.t.toFixed(0), alt: noneT.alt.toFixed(0), dist: (noneT.dist / 1e3).toFixed(0) + ' km' }));
  await retry('entry', OUT + '/02_entry_nobank_failure.png');
  r = await play(page, { entry: 'wrong' }, { log });
  const wrongT = await tel();
  log('CASE entry with wrong-way reversals → ' + JSON.stringify({ fail: wrongT.fail, dist: (wrongT.dist / 1e3).toFixed(0) + ' km' }));
  await retry('entry', OUT + '/03_entry_wrong_failure.png');
  r = await play(page, {}, { log, stopPhase: 'approach' });
  const fol = await tel();
  log('CASE entry following cues → ' + JSON.stringify({ phase: fol.phase, dist: (fol.dist / 1e3).toFixed(0) + ' km', alt: (fol.alt / 1e3).toFixed(1) + ' km' }));
  // 3) approach variants from the same TAEM checkpoint
  r = await play(page, { approach: 'noflare' }, { log });
  log('CASE approach without flare → ' + (r.fail || r.res));
  await retry('approach', OUT + '/04_noflare_failure.png');
  r = await play(page, { approach: 'nogear' }, { log });
  log('CASE approach without gear → ' + (r.fail || r.res));
  await retry('approach', OUT + '/05_nogear_failure.png');
  r = await play(page, { rollout: 'nobrake' }, { log });
  log('CASE rollout without brakes → ' + (r.fail || r.res));
  await retry('approach', OUT + '/06_overrun_failure.png');
  r = await play(page, {}, { log });
  const fin = await tel();
  log('CASE approach per cues after retries → ' + JSON.stringify({ res: fin.res && fin.res.summary, success: fin.res && fin.res.success, retries: fin.retries, td: fin.res && fin.res.touchdown }));
  await page.waitForTimeout(800); await page.screenshot({ path: OUT + '/07_debrief_after_retries.png' });
  // 4) lifecycle: LEAVE back to the title (leaves the crew room), then 10 solo start/leave cycles
  await page.click('#sh-card button[data-cmd="LEAVE"]');
  await page.waitForTimeout(1000);
  const lcState = () => page.evaluate(() => ({ active: window.shuttleGame.isActive, hud: document.querySelectorAll('#shuttle-hud').length, css: document.querySelectorAll('#shuttle-hud-css').length, menu: getComputedStyle(document.getElementById('screen-menu')).display, listeners: window.shuttleGame.listeners.length, room: window.netManager.roomId }));
  let lc = await lcState();
  log('LIFECYCLE after leave ' + JSON.stringify(lc));
  for (let i = 0; i < 10; i++) {
    await page.click('#btn-solo-flight'); await page.waitForTimeout(1500);
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    if (i % 2) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.click('#sh-card button[data-cmd="LEAVE"]'); }
    else await page.evaluate(() => window.leaveCrewRoom());
    await page.waitForTimeout(800);
  }
  lc = await lcState();
  log('LIFECYCLE after 10 start/leave cycles ' + JSON.stringify(lc));
  await page.screenshot({ path: OUT + '/08_title_after_cycles.png' });
  // the old activities are gone: none of their entry points or globals remain
  const legacy = await page.evaluate(() => ({ quickPlayIsCrew: (document.getElementById('btn-quick-play') || {}).textContent, oldGlobals: ['gameplay', 'shipInterior', 'dockingSimulator', 'launchCutscene', 'spaceCenter'].filter((k) => window[k]) }));
  log('OLD ACTIVITIES removed ' + JSON.stringify(legacy));
  log('console errors: ' + JSON.stringify(logs.filter((l) => /pageerror|\[error\]/.test(l)).slice(0, 10)));
  fs.writeFileSync(OUT + '/log.txt', lines.join('\n'));
  await browser.close();
})();
