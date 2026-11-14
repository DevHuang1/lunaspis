const { play, openShuttle } = require('./bot');
const OUT = process.env.OUT_DIR || 'shuttle-playtest-full'; require('fs').mkdirSync(OUT, { recursive: true });
const fs = require('fs');
(async () => {
  const lines = []; const log = (s) => { lines.push(s); console.log(s); };
  const { browser, page, logs } = await openShuttle();
  await page.screenshot({ path: OUT + '/00_briefing.png' });
  const shots = { prelaunch: OUT + '/01_prelaunch.png', insertion: OUT + '/03_insertion.png', payload: OUT + '/04_payload_start.png', deorbit: OUT + '/07_deorbit.png', entry: OUT + '/09_entry.png', approach: OUT + '/11_approach.png', rollout: OUT + '/13_rollout.png', debrief: OUT + '/14_debrief.png' };
  const flags = {};
  const res = await play(page, {}, { log, shots, onIter: async (s, it) => {
    const shot = async (k, f, pre) => { if (!flags[k]) { flags[k] = 1; if (pre) await pre(); await page.waitForTimeout(700); await page.screenshot({ path: f }); log(`   [shot] ${f}`); } };
    if (s.phase === 'ascent' && s.met > 40) await shot('asc40', OUT + '/02_ascent_srb.png');
    if (s.phase === 'ascent' && s.met > 300) await shot('asc300', OUT + '/02b_ascent_ssme.png');
    if (s.phase === 'payload' && s.doors > 0.99) await shot('bay', OUT + '/05_bay_open.png', async () => { await page.keyboard.press('KeyC'); });
    if (s.phase === 'deorbit' && !flags.cam2) { flags.cam2 = 1; await page.keyboard.press('KeyC'); await page.keyboard.press('KeyC'); }
    if (s.phase === 'entry' && s.alt < 75000) await shot('ent75', OUT + '/10_entry_75km.png');
    if (s.phase === 'approach' && s.alt < 4000) await shot('ogs', OUT + '/12_final_ogs.png');
    if (s.phase === 'approach' && s.alt < 60) await shot('flare', OUT + '/12b_flare.png');
  } });
  await page.waitForTimeout(1500); await page.screenshot({ path: OUT + '/15_end.png' });
  log('END ' + JSON.stringify(res));
  log('console errors: ' + logs.filter(l => /pageerror|\[error\]/.test(l)).slice(0, 10).join(' | '));
  fs.writeFileSync(OUT + '/log.txt', lines.join('\n'));
  await browser.close();
})();
