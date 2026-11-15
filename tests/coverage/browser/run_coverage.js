// CubeSat coverage browser playtest (Playwright is not a project dependency; use NODE_PATH=$(npm root -g)).
// Start the server with the local overrides (docs/progress.md), then:
//   COVERAGE_URL=http://localhost:3137 THREE_JS_PATH=/path/three.min.js node tests/coverage/browser/run_coverage.js
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.OUT_DIR || 'coverage-playtest'; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.COVERAGE_URL || 'http://localhost:3137';
const THREE_SRC = process.env.THREE_JS_PATH ? fs.readFileSync(process.env.THREE_JS_PATH) : null;
const PART = process.env.PART || 'all';

const lines = []; const log = (s) => { lines.push(s); console.log(s); };
let fails = 0; const expect = (c, m) => { if (c) log('  ok   ' + m); else { fails++; log('  FAIL ' + m); } };

async function open(browser, name, size) {
  const page = await browser.newPage({ viewport: size || { width: 1280, height: 720 }, acceptDownloads: true });
  const errs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|404|503/.test(m.text())) errs.push('[error] ' + m.text()); });
  if (THREE_SRC) {
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1).*/, (r) => r.abort());
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: THREE_SRC }));
  }
  await page.goto(`${BASE}/?coveragetest=1`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.evaluate((n) => { document.getElementById('input-player-name').value = n; localStorage.setItem('interfellas_cov_onboarded', 'true'); }, name);
  return { page, errs, name };
}
const T = (p, fn, arg) => p.evaluate(fn, arg);
const waitReady = (p) => p.waitForFunction(() => window.__coverageTest && window.__coverageTest.ready(), null, { timeout: 180000, polling: 250 });
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const A = await open(browser, 'Mya');
  const p = A.page;
  // ------------------------------------------------------------ title → solo coverage
  log('B1 title → CubeSat → solo');
  await p.click('#mission-picker [data-activity="coverage"]');
  await shot(p, '00_title');
  await p.click('#btn-solo-flight');
  await waitReady(p);
  await p.waitForTimeout(2500);
  const s0 = await T(p, () => ({ scn: __coverageTest.scenario(), q: __coverageTest.query(0), model: __coverageTest.model(), hash: __coverageTest.forecastHash() }));
  expect(s0.scn.mode === 'sandbox' && s0.scn.stations.length === 6, 'default sandbox with 6 preset stations');
  expect(s0.model === 'ok', 'CubeSat GLB loaded: ' + s0.model);
  await shot(p, '01_start');

  // ------------------------------------------------------------ B2 playback + jump to events
  log('B2 playback and next-event jumps');
  await p.keyboard.press('Space'); await p.waitForTimeout(400);
  const jumps = [];
  for (let i = 0; i < 5; i++) {
    const ev = await T(p, () => __coverageTest.nextEvent());
    await p.keyboard.press('KeyN'); await p.waitForTimeout(500);
    const r = await T(p, (ev) => { const t = __coverageTest.simTime(); const q = __coverageTest.query(t); return { t, inView: q.available.map((a) => a.id), ev }; }, ev);
    jumps.push(r);
    const okLanding = ev && r.t >= ev.t && r.t < ev.t + 60 * 0.6 + 1;   // 60x for ≤0.5 s wall after the seek
    const okState = ev && (ev.type === 'aos' ? r.inView.includes(ev.stationId) : (!r.inView.includes(ev.stationId) || r.t - ev.t > 1));
    expect(okLanding && okState, `jump ${i + 1}: ${ev && ev.type} ${ev && ev.stationId} at T+${ev && ev.t.toFixed(1)} → now T+${r.t.toFixed(1)}`);
  }
  await shot(p, '02_after_jumps');
  // B3: contact lines never cross the Earth, and match the in-view list (paused, so the frame and the query share a time)
  await p.keyboard.press('Space'); await p.waitForTimeout(300);
  let clear = true, match = true;
  for (let i = 0; i < 12; i++) {
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));   // the drawn lines belong to the latest frame
    const r = await T(p, (i) => { const fc = __coverageTest; return { clear: fc.linesClear(), n: fc.drawnLines(), k: fc.query().available.length }; }, i);
    clear = clear && r.clear; if (r.n !== r.k) log(`    lines ${r.n} vs in view ${r.k} at T+${(await T(p, () => __coverageTest.simTime())).toFixed(2)} ${JSON.stringify(await T(p, () => __coverageTest.query().available.map((a) => a.id)))}`); match = match && r.n === r.k;
    await p.keyboard.press('KeyN'); await p.waitForTimeout(350);
  }
  expect(clear, 'B3 contact lines never pass through the Earth (12 samples)');
  expect(match, 'B3 number of contact lines equals stations in view');

  // ------------------------------------------------------------ stations on the globe
  log('Stations mode: add by click, drag to move, edit in popover');
  await p.keyboard.press('KeyS'); await p.waitForTimeout(300);
  const before = (await T(p, () => __coverageTest.scenario().stations.length));
  // click the centre of the globe (Earth is under the screen centre in globe view)
  await p.mouse.click(640, 280); await p.waitForTimeout(1200);
  const afterAdd = await T(p, () => __coverageTest.scenario().stations);
  expect(afterAdd.length === before + 1, `click on globe added a station (${before} → ${afterAdd.length}) at ${afterAdd[afterAdd.length - 1].lat}, ${afterAdd[afterAdd.length - 1].lon}`);
  const added = afterAdd[afterAdd.length - 1];
  await shot(p, '03_station_added');
  // drag it
  const scr = (await T(p, () => __coverageTest.stationScreen())).find((x) => x.id === added.id);
  await p.mouse.move(scr.x, scr.y); await p.mouse.down(); await p.mouse.move(scr.x + 40, scr.y + 25, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(1200);
  const moved = (await T(p, () => __coverageTest.scenario().stations)).find((x) => x.id === added.id);
  expect(moved && (moved.lat !== added.lat || moved.lon !== added.lon), `drag moved the station to ${moved && moved.lat}, ${moved && moved.lon}`);
  // click it → popover, rename + mask
  const scr2 = (await T(p, () => __coverageTest.stationScreen())).find((x) => x.id === added.id);
  await p.mouse.click(scr2.x, scr2.y); await p.waitForTimeout(500);
  const popOpen = await p.isVisible('#cv-pop');
  expect(popOpen, 'clicking a station opens its editor');
  if (popOpen) {
    await p.fill('#cv-pop-name', 'Team station'); await p.fill('#cv-pop-mask', '15');
    await shot(p, '04_station_popover');
    await p.click('#cv-pop [data-p="APPLY"]'); await p.waitForTimeout(1000);
  }
  const renamed = (await T(p, () => __coverageTest.scenario().stations)).find((x) => x.id === added.id);
  expect(renamed && renamed.name === 'Team station' && renamed.maskDeg === 15, 'popover applied name and minimum elevation');
  // invalid name rejected with a message
  // paste a list
  await p.click('#cv-stbar [data-s="PASTE"]'); await p.waitForTimeout(300);
  await p.fill('#cv-paste', 'Partner uni, 35.68, 139.69, 10\n-1.29\t36.82\nbad line here');
  await p.click('#cv-card [data-a="ST_PASTE_ADD"]'); await p.waitForTimeout(1200);
  const afterPaste = await T(p, () => __coverageTest.scenario().stations);
  const pasteErr = await p.textContent('#cv-paste-err').catch(() => '');
  expect(afterPaste.some((x) => x.name === 'Partner uni') && afterPaste.some((x) => x.lat === -1.29), `paste added 2 stations; error shown for the bad line: "${pasteErr}"`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // my stations
  await p.click('#cv-stbar [data-s="MY_SAVE"]'); await p.waitForTimeout(300);
  const mine = await T(p, () => JSON.parse(localStorage.getItem('interfellas_cov_mystations') || '[]').length);
  expect(mine === afterPaste.length, `saved ${mine} stations as "my stations"`);
  await p.keyboard.press('KeyS'); await p.waitForTimeout(200);
  // station edits must not reset the clock
  const tBeforeEdit = await T(p, () => __coverageTest.simTime());
  expect(tBeforeEdit > 1000, `clock kept through station edits (T+${tBeforeEdit.toFixed(0)} s)`);

  // ------------------------------------------------------------ coverage-coloured track + hover inspector + click to pin
  log('Track colour, hover inspector, pins');
  await p.keyboard.press('KeyT'); await p.waitForTimeout(800);   // whole-window track
  await shot(p, '05_whole_window_track');
  const pts = (await T(p, () => __coverageTest.trackScreen(15))).filter((x) => x.vis && x.x > 380 && x.x < 900 && x.y > 120 && x.y < 480);
  expect(pts.length > 0, `found ${pts.length} visible track points to hover`);
  if (pts.length) {
    const tp = pts[Math.floor(pts.length / 2)];
    await p.mouse.move(tp.x, tp.y); await p.waitForTimeout(400);
    const insp = await p.isVisible('#cv-insp'); const txt = insp ? await p.textContent('#cv-insp') : '';
    expect(insp && /orbit/.test(txt), `hover shows the inspector: "${txt.slice(0, 110)}…"`);
    await shot(p, '06_hover_inspector');
    await p.mouse.click(tp.x, tp.y); await p.waitForTimeout(900);
    const pins = await T(p, () => __coverageTest.pins());
    expect(pins.length === 1 && Math.abs(pins[0].t - tp.t) < 60, `click on the track pinned ${pins[0] && pins[0].name} at T+${pins[0] && pins[0].t.toFixed(0)} (hovered T+${tp.t.toFixed(0)})`);
  }
  // more pins: now, timeline shift-click
  await p.keyboard.press('KeyN'); await p.waitForTimeout(300); await p.keyboard.press('KeyP'); await p.waitForTimeout(600);
  const tl = await p.$('#cv-tl'); const box = await tl.boundingBox();
  await p.keyboard.down('Shift'); await p.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5); await p.keyboard.up('Shift'); await p.waitForTimeout(800);
  const pins3 = await T(p, () => __coverageTest.pins());
  expect(pins3.length === 3, `three pins: ${pins3.map((x) => x.name + '@' + x.t.toFixed(0)).join(', ')}`);
  // compare two pins via the panel
  const ids = pins3.slice(0, 2).map((x) => x.id);
  for (const id of ids) await p.check(`#cv-pins [data-sel="${id}"]`);
  await p.click('#cv-pins [data-cmp]'); await p.waitForTimeout(600);
  const cmpTxt = await p.textContent('#cv-cmp');
  const cmpCore = await T(p, () => __coverageTest.compare());
  expect(/Retained/.test(cmpTxt) && cmpCore && cmpCore.diff, 'compare window shows retained / lost / new for two pins');
  await shot(p, '07_compare_pins');
  await p.keyboard.press('Escape');

  // ------------------------------------------------------------ results, CSV, A/B
  log('Results, CSV and A/B');
  await p.click('#cv-ctl [data-c="RESULTS"]'); await p.waitForTimeout(400);
  const resTxt = await p.textContent('#cv-res');
  expect(/PER DAY/.test(resTxt) && /LONGEST GAP/.test(resTxt) && /CONTACT \/ DAY/.test(resTxt), 'results show passes/day, contact/day and gaps per station');
  await shot(p, '08_results');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#cv-res [data-a="CSV"]')]);
  if (dl) { const fp = `${OUT}/${dl.suggestedFilename()}`; await dl.saveAs(fp); const csv = fs.readFileSync(fp, 'utf8').split(/\r\n/); expect(csv[2].startsWith('station,') && csv.length > 10, `CSV pass schedule downloaded: ${dl.suggestedFilename()} (${csv.length - 4} passes)`); }
  else expect(false, 'CSV download');
  await p.click('#cv-res [data-a="SAVE_A"]'); await p.waitForTimeout(400);
  await p.keyboard.press('Escape');
  // change altitude in the editor → run → save B → compare
  await p.keyboard.press('KeyE'); await p.waitForTimeout(400);
  await p.fill('#cv-alt', '800'); await p.dispatchEvent('#cv-alt', 'change'); await p.waitForTimeout(200);
  await shot(p, '09_editor');
  await p.click('#cv-ed-run'); await p.waitForTimeout(1500);
  const alt = await T(p, () => __coverageTest.scenario().orbit.altKm);
  expect(alt === 800, 'editor RUN applied altitude 800 km (new revision)');
  await p.click('#cv-ctl [data-c="RESULTS"]'); await p.waitForTimeout(300);
  await p.click('#cv-res [data-a="SAVE_B"]'); await p.waitForTimeout(300);
  await p.click('#cv-res [data-a="AB"]'); await p.waitForTimeout(400);
  const abTxt = await p.textContent('#cv-ab');
  expect(/550 km/.test(abTxt) && /800 km/.test(abTxt) && /changed/.test(abTxt), 'A/B shows both altitudes and marks the changed setting');
  await shot(p, '10_ab');
  await p.keyboard.press('Escape');

  // ------------------------------------------------------------ validation + empty state
  log('Validation and empty states');
  await p.keyboard.press('KeyE'); await p.waitForTimeout(300);
  await p.fill('#cv-inc', '200'); await p.dispatchEvent('#cv-inc', 'change'); await p.waitForTimeout(200);
  const runDisabled = await p.isDisabled('#cv-ed-run'); const errTxt = await p.textContent('#cv-edit');
  expect(runDisabled && /Inclination must be 0–180°/.test(errTxt), 'invalid inclination disables RUN and explains why');
  await p.keyboard.press('Escape');
  // save / reload / replay identical forecast
  const h1 = await T(p, () => __coverageTest.forecastHash());
  await p.click('#cv-ctl [data-c="REPLAY"]'); await p.waitForTimeout(500);
  const h2 = await T(p, () => __coverageTest.forecastHash()); const t2 = await T(p, () => __coverageTest.simTime());
  expect(h1 === h2 && t2 < 120, `replay restarts from T+0 with an identical forecast (${h1})`);

  // ------------------------------------------------------------ Real Satellite mode (server offline → bundled snapshot)
  log('Real Satellite mode (offline, bundled snapshot)');
  expect(await T(p, () => typeof window.satellite === 'object' && typeof window.satellite.json2satrec === 'function'), 'SGP4 library loaded in the browser');
  await p.keyboard.press('KeyE'); await p.waitForTimeout(400);
  await p.click('#cv-edit [data-mode="real"]'); await p.waitForTimeout(800);
  const realDraft = await T(p, () => __coverageTest.draft());
  expect(realDraft && realDraft.mode === 'real' && realDraft.orbit.omm && realDraft.orbit.source.snapshot === 'bundled', `real mode picked ${realDraft && realDraft.orbit.omm && realDraft.orbit.omm.OBJECT_NAME} from the bundled snapshot`);
  const opts = await p.$$eval('#cv-satsel option', (o) => o.map((x) => x.textContent));
  expect(opts.length === 8, `curated list offers ${opts.length} CubeSats: ${opts.slice(0, 3).join(', ')}…`);
  await p.selectOption('#cv-satsel', { index: 1 }); await p.waitForTimeout(400);
  // catalog picker: add 8 nearest Online stations to the track
  await p.click('#cv-edit [data-ed="CATALOG"]'); await p.waitForTimeout(1200);
  const catTxt = await p.textContent('#cv-catalog');
  expect(/SatNOGS station catalog/.test(catTxt) && /CC BY-SA 4.0/.test(catTxt), 'SatNOGS catalog shown with licence and the "listing ≠ access" note');
  await p.click('#cv-catalog [data-near]'); await p.waitForTimeout(800);
  const nst = await T(p, () => __coverageTest.draft().stations.filter((x) => /^satnogs-/.test(x.id)).length);
  expect(nst >= 6, `added ${nst} catalog stations near the ground track`);
  // offline fetch of an unknown catalog number fails gracefully
  await p.fill('#cv-catnr', '25544'); await p.click('#cv-edit [data-ed="FETCH"]'); await p.waitForTimeout(800);
  const toastTxt = await p.textContent('#cv-toast');
  expect(/offline|not in the bundled|unavailable|disabled/i.test(toastTxt), `offline fetch explained: "${toastTxt}"`);
  await shot(p, '15_real_editor');
  await p.click('#cv-ed-run'); await p.waitForTimeout(2500);
  const rs = await T(p, () => ({ mode: __coverageTest.scenario().mode, ready: __coverageTest.ready(), err: __coverageTest.error(), sum: __coverageTest.summary() }));
  expect(rs.mode === 'real' && rs.ready && rs.sum.passCount > 0, `real forecast ready: ${rs.sum && rs.sum.passCount} passes, period ${(rs.sum && rs.sum.periodS / 60).toFixed(2)} min ${rs.err || ''}`);
  const banner = await p.textContent('#cv-banners');
  expect(/bundled element snapshot/.test(banner), `data source banner: "${banner}"`);
  await p.keyboard.press('Space'); await p.waitForTimeout(400);
  for (let i = 0; i < 3; i++) { await p.keyboard.press('KeyN'); await p.waitForTimeout(500); }
  await p.keyboard.press('Space');
  await shot(p, '16_real_running');
  await p.keyboard.press('Tab'); await p.waitForTimeout(400);
  const dataTxt = await p.textContent('#cv-data');
  expect(/SGP4/.test(dataTxt) && /Element epoch/.test(dataTxt) && /AZ RISE/.test(dataTxt), 'data page names SGP4, the element epoch and pass azimuths');
  await shot(p, '17_real_data');
  await p.keyboard.press('Escape');
  // copy to sandbox
  await p.keyboard.press('KeyE'); await p.waitForTimeout(400);
  await p.click('#cv-edit [data-ed="COPY_SANDBOX"]'); await p.waitForTimeout(600);
  const cs = await T(p, () => __coverageTest.draft());
  expect(cs.mode === 'sandbox' && cs.derivedFrom && /Hypothetical orbit based on/.test(cs.title), `Copy to Sandbox: "${cs.title}", ${cs.orbit.altKm} km / ${cs.orbit.incDeg}°`);
  await p.fill('#cv-inc', '60'); await p.dispatchEvent('#cv-inc', 'change'); await p.waitForTimeout(200);
  await p.click('#cv-ed-run'); await p.waitForTimeout(1500);
  const edited = await T(p, () => __coverageTest.scenario());
  const bn2 = await p.textContent('#cv-banners');
  expect(edited.edited && /Hypothetical \(edited\)/.test(bn2), `edited copy labelled: "${bn2}"`);
  await shot(p, '18_copied_sandbox');

  // ------------------------------------------------------------ layout check at a smaller size
  await p.setViewportSize({ width: 1024, height: 640 }); await p.waitForTimeout(800); await shot(p, '11_1024x640');
  await p.setViewportSize({ width: 1280, height: 720 });

  // ------------------------------------------------------------ shared session (2 clients)
  log('B13 shared session');
  await p.click('#cv-ctl [data-c="EXIT"]'); await p.waitForTimeout(800);
  await p.click('#mission-picker [data-activity="coverage"]');
  await p.click('#btn-host-game'); await p.waitForTimeout(1200);
  const code = (await p.textContent('#lobby-room-code')).trim();
  const B = await open(browser, 'Zaw', { width: 960, height: 600 });
  await B.page.evaluate((c) => { document.getElementById('input-join-code').value = c; document.getElementById('btn-join-game').click(); }, code);
  await B.page.waitForTimeout(1200);
  await shot(p, '12_lobby');
  await p.click('#btn-start-mission');
  await waitReady(p); await waitReady(B.page); await p.waitForTimeout(1500);
  const hA = await T(p, () => __coverageTest.forecastHash()), hB = await T(B.page, () => __coverageTest.forecastHash());
  expect(hA === hB, `both clients computed the same forecast (${hA})`);
  // non-editor edit rejected
  const rej = await T(B.page, () => window.netManager.coverageRequest('CLOCK', { op: 'play' }));
  expect(!rej.accepted && /editor/.test(rej.reason), 'viewer cannot control time: ' + rej.reason);
  await B.page.keyboard.press('KeyS'); await B.page.waitForTimeout(300);
  expect(!(await T(B.page, () => window.coverageGame.stationMode)), 'viewer cannot enter stations mode');
  // editor plays; both see the same sim time
  await p.keyboard.press('Space'); await p.waitForTimeout(1500);
  const ta = await T(p, () => __coverageTest.simTime()), tb = await T(B.page, () => __coverageTest.simTime());
  expect(Math.abs(ta - tb) < 60 * 0.3, `shared clock: A T+${ta.toFixed(1)} vs B T+${tb.toFixed(1)}`);
  // editor adds a station: viewer gets it
  await p.keyboard.press('KeyS'); await p.mouse.click(640, 280); await p.waitForTimeout(1500);
  const nB = await T(B.page, () => __coverageTest.scenario().stations.length), nA = await T(p, () => __coverageTest.scenario().stations.length);
  expect(nA === nB && nA === 7, `station added by the editor reached the viewer (${nA}/${nB})`);
  await shot(B.page, '13_viewer');
  // hand over editing
  const viewerId = await T(B.page, () => window.netManager.socketId);
  const ho = await T(p, (id) => window.netManager.coverageRequest('SET_EDITOR', { playerId: id }), viewerId);
  await B.page.waitForTimeout(600);
  const nowEditor = await T(B.page, () => window.coverageGame.isEditor());
  expect(ho.accepted && nowEditor, 'host handed editing to the viewer');
  await B.page.close();

  // ------------------------------------------------------------ mission switching / cleanup
  log('B14 mission switching');
  await p.click('#cv-ctl [data-c="EXIT"]'); await p.waitForTimeout(800);
  for (let i = 0; i < 4; i++) {
    await p.click('#mission-picker [data-activity="coverage"]'); await p.click('#btn-solo-flight'); await waitReady(p); await p.waitForTimeout(300);
    await p.click('#cv-ctl [data-c="EXIT"]'); await p.waitForTimeout(500);
    await p.click('#mission-picker [data-activity="shuttle"]'); await p.click('#btn-solo-flight');
    await p.waitForFunction(() => window.shuttleGame && window.shuttleGame.isActive && window.netManager.snapshot, null, { timeout: 60000 });
    await p.waitForTimeout(300);
    await p.evaluate(() => window.shuttleGame.command('LEAVE')); await p.waitForTimeout(500);
  }
  const life = await T(p, () => ({ cov: window.coverageGame.isActive, covL: window.coverageGame.listeners.length, sh: window.shuttleGame.isActive, hud: !!document.getElementById('cov-hud'), shHud: !!document.getElementById('shuttle-hud'), menu: document.getElementById('screen-menu').style.display }));
  expect(!life.cov && life.covL === 0 && !life.sh && !life.hud && !life.shHud && life.menu === 'flex', 'after 4 Shuttle/CubeSat cycles: no stale HUDs or listeners ' + JSON.stringify(life));
  await shot(p, '14_back_to_menu');

  log('console errors: ' + JSON.stringify(A.errs.concat(B.errs)));
  expect(A.errs.length + B.errs.length === 0, 'no console errors');
  log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  fs.writeFileSync(`${OUT}/run.out`, lines.join('\n'));
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
