// Test-only Playwright harness for the Shuttle browser playtests.
// Playwright is NOT a project dependency; use a locally available install (e.g. NODE_PATH=$(npm root -g)).
// Start the server with the documented local overrides first, then:
//   SHUTTLE_URL=http://localhost:3137 node tests/shuttle/browser/run_full.js
// If the CDN copy of three.js r128 is unreachable from the test machine, set THREE_JS_PATH to a local
// three.min.js r128 file; the page request is then fulfilled from that file (test-only routing).
const { chromium } = require('playwright');
const fs = require('fs');
const THREE_PATH = process.env.THREE_JS_PATH || null;
async function open(opts = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: opts.w || 1280, height: opts.h || 720 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  if (THREE_PATH) {
    const src = fs.readFileSync(THREE_PATH);
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1).*/, (r) => { logs.push('[blocked-ext] ' + r.request().url()); r.abort(); });
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: src }));
  }
  const base = process.env.SHUTTLE_URL || 'http://localhost:3137';
  await page.goto(opts.url || `${base}/?shuttletest=1`, { waitUntil: 'load', timeout: 60000 });
  return { browser, page, logs };
}
module.exports = { open };
