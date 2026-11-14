#!/usr/bin/env node
// Offline SFX regression check. Renders every sound in headless Chrome and asserts:
//   - every sound produces audible output, with no NaN/Infinity samples
//   - nothing clips before the master limiter (worst case: unity master + bus gain)
//   - one-shots are not unreasonably long
// Usage: node tests/audio/run_checks.js [--verbose]
// Needs Google Chrome / Chromium. Set CHROME_BIN to override discovery. Skips (exit 0) if none found.
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const CANDIDATES = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.log("SKIP: no Chrome/Chromium found (set CHROME_BIN)");
  process.exit(0);
}

const verbose = process.argv.includes("--verbose");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sfx-check-"));
let proc = null;
let done = false;

function finish(code, msg) {
  if (done) return;
  done = true;
  if (msg) console[code ? "error" : "log"](msg);
  try { if (proc) proc.kill("SIGKILL"); } catch (e) { /* ignore */ }
  try { server.close(); } catch (e) { /* ignore */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  process.exit(code);
}

function evaluate(data) {
  const fails = [];
  for (const s of data.results) {
    const bad = [];
    if (s.nan) bad.push("NaN samples");
    if (s.startMs === null) bad.push("silent");
    if (s.clipped) bad.push("clips pre-limiter");
    if (s.lenMs > 6500) bad.push("too long (" + s.lenMs + "ms)");
    if (bad.length) fails.push(s.name + ": " + bad.join(", "));
    if (verbose || bad.length) {
      console.log((bad.length ? "✗ " : "✓ ") + s.name.padEnd(18) + ` peak ${String(s.peakDb).padStart(6)} dB  rms ${String(s.rmsDb).padStart(6)} dB  start ${s.startMs}ms  len ${s.lenMs}ms`);
    }
  }
  if (!data.ambOk) fails.push("ambience / rocket graph failed: " + data.err);
  console.log(`${data.results.length} sounds checked, ${fails.length} problem(s)`);
  if (fails.length) { fails.forEach((f) => console.error(" - " + f)); finish(1); } else finish(0);
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
    try { evaluate(JSON.parse(body)); } catch (e) { finish(1, "FAIL: bad report: " + body.slice(0, 500)); }
  });
});

server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  const page = "file://" + path.join(__dirname, "render_check.html") + "?report=" + encodeURIComponent("http://127.0.0.1:" + port);
  proc = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--allow-file-access-from-files",
    "--autoplay-policy=no-user-gesture-required", "--user-data-dir=" + profile, page,
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  proc.stderr.on("data", (d) => { err += d; });
  proc.on("exit", () => { if (!done) finish(1, "FAIL: Chrome exited before reporting\n" + err.slice(0, 1500)); });
  setTimeout(() => finish(1, "FAIL: timed out waiting for render report\n" + err.slice(0, 1500)), 150000);
});
