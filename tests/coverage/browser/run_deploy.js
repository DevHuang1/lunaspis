// Run against an isolated local server with SHUTTLE_TEST=1 for accelerated airlock/drift timers.
// COVERAGE_URL=http://localhost:3137 node tests/coverage/browser/run_deploy.js
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const BASE = process.env.COVERAGE_URL || "http://localhost:3137";
const OUT = process.env.OUT_DIR || "deploy-playtest";
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
async function open(browser, name) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: "load", timeout: 180000 });
  await page.fill("#input-player-name", name);
  await page.evaluate(() => localStorage.setItem("interfellas_cov_onboarded", "true"));
  await page.click('#mission-picker [data-activity="coverage"]');
  return page;
}
const state = page => page.evaluate(() => window.coverageGame.deploy?.b);
const wait = (page, predicate, timeout = 30000) => page.waitForFunction(predicate, null, { timeout, polling: 100 });
const phase = (page, name) => page.waitForFunction(n => window.coverageGame.deploy?.b?.phase === n, name, { timeout: 30000, polling: 100 });
async function request(page, type, payload) {
  return page.evaluate(({ type, payload }) => window.netManager.coverageRequest(type, payload), { type, payload });
}
async function cmd(page, command, arg) {
  const result = await request(page, "DEPLOY", { cmd: command, arg });
  assert.ok(result.accepted, command + ": " + result.reason);
  return result;
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + ".png") });
async function button(page, command) {
  // The HUD updates live and handles pointerdown before the next snapshot replaces the button.
  const locator = page.locator('#dh-con button[data-c="' + command + '"]');
  await locator.dispatchEvent("pointerdown", { button: 0 });
}
async function flyArm(page, mode) {
  const held = new Set();
  const deadline = Date.now() + 100000;
  let settled = 0;
  while (Date.now() < deadline) {
    const s = await state(page), a = s.arm;
    const keys = [];
    if (mode === "grapple") {
      if (Math.abs(a.d[0]) > 0.012) keys.push(a.d[0] > 0 ? "KeyD" : "KeyA");
      if (Math.abs(a.d[2]) > 0.012) keys.push(a.d[2] > 0 ? "KeyS" : "KeyW");
      if (Math.abs(a.d[1] - 0.06) > 0.012) keys.push(a.d[1] > 0.06 ? "KeyR" : "KeyF");
      if (Math.abs(a.rollDeg) > 0.8) keys.push(a.rollDeg > 0 ? "KeyQ" : "KeyE");
      if (a.d[1] < 0.2) keys.push("ShiftLeft");
    } else {
      if (Math.abs(a.az - 180) > 0.8) keys.push(a.az < 180 ? "KeyA" : "KeyD");
      if (Math.abs(a.el + 45) > 0.8) keys.push(a.el > -45 ? "KeyS" : "KeyW");
    }
    const wanted = new Set(keys);
    for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
    for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
    const moving = keys.some(k => k !== "ShiftLeft");
    settled = moving ? 0 : settled + 1;
    if (settled >= 10) break;
    await page.waitForTimeout(150);
  }
  for (const key of held) await page.keyboard.up(key);
  assert.ok(settled >= 10, "Arm did not settle in " + mode);
  await page.waitForTimeout(1500);
}
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  try {
    const p = await open(browser, "Deploy solo");
    await p.click("#btn-solo-flight");
    await phase(p, "brief");
    await wait(p, () => window.coverageGame.deploy.view.status.iss === "ok" && window.coverageGame.deploy.view.status.cubesat === "ok");
    assert.equal(await p.locator("#dh-tag .aos").evaluate(el => getComputedStyle(el).color), "rgb(237, 232, 221)");
    const hiddenArm = await p.evaluate(() => {
      const nodes = [];
      window.coverageGame.deploy.view.iss.traverse(o => { if (/robotic_?arm/i.test(o.name)) nodes.push(o.visible); });
      return nodes.length > 0 && nodes.every(v => !v);
    });
    assert.ok(hiddenArm, "ISS model's original arm must be hidden");
    await shot(p, "00_brief");
    await p.keyboard.press("Enter");
    await phase(p, "load");
    await cmd(p, "WARP", 1000);
    for (let i = 0; i < 5; i++) {
      await p.keyboard.press("Enter");
      await p.waitForFunction(i => window.coverageGame.deploy.b.load.step > i, i, { polling: 100 });
    }
    await phase(p, "depress");
    await button(p, "PUMP");
    await wait(p, () => window.coverageGame.deploy.b.al.p < 2.2);
    await button(p, "PUMP");
    await wait(p, () => !window.coverageGame.deploy.b.al.pump);
    await p.keyboard.press("KeyV");
    await wait(p, () => window.coverageGame.deploy.b.al.p < 0.2);
    await p.keyboard.press("KeyV");
    await wait(p, () => !window.coverageGame.deploy.b.al.vent);
    await p.keyboard.press("KeyL");
    await wait(p, () => window.coverageGame.deploy.b.al.leakOk);
    await shot(p, "01_airlock");
    await p.keyboard.press("KeyH");
    await phase(p, "outboard");
    await cmd(p, "WARP", 1000);
    await wait(p, () => window.coverageGame.deploy.b.al.outer === 1);
    await p.keyboard.press("KeyT");
    await phase(p, "grapple");
    await cmd(p, "WARP", 1);
    await shot(p, "02_grapple");
    await flyArm(p, "grapple");
    await shot(p, "03_grapple_aligned");
    await p.keyboard.press("KeyG");
    await phase(p, "move");
    await p.keyboard.press("KeyM");
    await cmd(p, "WARP", 60);
    await phase(p, "point");
    await flyArm(p, "point");
    await p.keyboard.press("KeyB");
    await p.keyboard.press("KeyK");
    await wait(p, () => window.coverageGame.deploy.b.arm.brakes && window.coverageGame.deploy.b.camera);
    await wait(p, () => !window.DeployCore.inLos(window.DeployCore.frame(window.coverageGame.deploy.b, window.coverageGame.deploy.b.t).u), 300000);
    await p.keyboard.press("KeyG");
    await wait(p, () => Object.values(window.coverageGame.deploy.b.poll).every(Boolean));
    assert.equal(await p.locator("#dh-con .good").first().evaluate(el => getComputedStyle(el).color), "rgb(237, 232, 221)");
    await shot(p, "04_go_poll");
    await p.keyboard.press("KeyY");
    await wait(p, () => window.coverageGame.deploy.b.armed);
    await p.keyboard.press("Enter");
    await phase(p, "release");
    await shot(p, "05_release");
    await phase(p, "drift");
    assert.equal((await state(p)).sat.antennas, false);
    await cmd(p, "WARP", 60);
    await p.waitForTimeout(1500);
    const rotationBefore = await p.evaluate(() => ({
      q: window.coverageGame.deploy.view.cubesat.quaternion.toArray(), now: performance.now(),
    }));
    await p.waitForTimeout(1000);
    const orbitDisplay = await p.evaluate(before => {
      const view = window.coverageGame.deploy.view, st = view._st;
      const points = view.orbitLine.geometry.attributes.position.array;
      let minAltitude = Infinity, maxAltitude = -Infinity;
      for (let i = 0; i < points.length; i += 3) {
        const altitude = Math.hypot(points[i], points[i + 1], points[i + 2]) - 6371;
        minAltitude = Math.min(minAltitude, altitude); maxAltitude = Math.max(maxAltitude, altitude);
      }
      const arc = view.orbitArc.geometry.attributes.position;
      const centre = new THREE.Vector3().fromBufferAttribute(arc, 24);
      const tangent = new THREE.Vector3().fromBufferAttribute(arc, 25).sub(new THREE.Vector3().fromBufferAttribute(arc, 23)).normalize();
      return {
        minAltitude, maxAltitude, forward: tangent.z,
        gap: centre.distanceTo(view.cubesat.position), visible: view.orbitLine.visible && view.orbitArc.visible,
        spinDegS: view.cubesat.quaternion.angleTo(new THREE.Quaternion().fromArray(before.q)) * 180 / Math.PI / ((performance.now() - before.now) / 1000),
        axisHidden: !view.axisLine.visible && !view.planLine.visible && !view.pathLine.visible,
      };
    }, rotationBefore);
    assert.ok(orbitDisplay.visible && orbitDisplay.axisHidden);
    assert.ok(orbitDisplay.minAltitude > 410 && orbitDisplay.maxAltitude < 416, JSON.stringify(orbitDisplay));
    assert.ok(orbitDisplay.forward > 0.999 && orbitDisplay.gap < 0.001);
    assert.ok(orbitDisplay.spinDegS < 11, JSON.stringify(orbitDisplay));
    await shot(p, "05a_orbital_drift");
    console.log("PASS 60x gentle rotation and Earth-clearing orbital line", JSON.stringify(orbitDisplay));
    await phase(p, "done");
    const done = await state(p);
    assert.ok(done.done.at30.along > 3000 && done.done.at30.radial < -2000);
    assert.equal(done.arm.contacts, 0);
    assert.equal(done.violations.length, 0);
    await shot(p, "06_beacon");
    await p.keyboard.press("Enter");
    await wait(p, () => window.coverageGame.ready && !window.coverageGame.deploy);
    assert.ok((await p.textContent("#cv-card")).includes("CubeSat in orbit"));
    assert.equal(await p.locator('#cv-card').getByText('Scenario problem', { exact: true }).count(), 0);
    await shot(p, "07_coverage");
    console.log("PASS solo deployment through coverage handoff", JSON.stringify(done.done.at30));
    await p.keyboard.press("Escape");
    await p.click('#cv-ctl [data-c="EXIT"]');
    await p.waitForTimeout(500);
    await p.click("#btn-host-game");
    await p.waitForTimeout(700);
    const code = (await p.textContent("#lobby-room-code")).trim();
    const guest = await open(browser, "Kibo crew");
    await guest.fill("#input-join-code", code);
    await guest.click("#btn-join-game");
    await p.waitForTimeout(700);
    await p.click("#btn-start-mission");
    await phase(p, "brief"); await phase(guest, "brief");
    const roles = (await state(p)).roles;
    assert.equal(roles.rms.name, "Deploy solo");
    assert.equal(roles.flight.name, "Deploy solo");
    assert.equal(roles.crew.name, "Kibo crew");
    assert.equal((await request(guest, "DEPLOY", { cmd: "BEGIN" })).accepted, false);
    await cmd(p, "BEGIN");
    await phase(guest, "load");
    assert.equal((await request(p, "DEPLOY", { cmd: "STEP" })).accepted, false);
    await guest.keyboard.press("Enter");
    await wait(p, () => !!window.coverageGame.deploy.b.load.busy);
    assert.equal((await request(guest, "DEPLOY_INPUT", { input: { x: 1 } })).accepted, false);
    assert.equal((await request(guest, "DEPLOY", { cmd: "SKIP" })).accepted, false);
    await shot(guest, "08_crew_console");
    await cmd(p, "SKIP");
    await wait(p, () => window.coverageGame.ready && !window.coverageGame.deploy);
    await wait(guest, () => window.coverageGame.ready && !window.coverageGame.deploy);
    assert.equal(await p.locator("#dep-hud").count(), 0);
    assert.equal(await guest.locator("#dep-hud").count(), 0);
    assert.equal(await p.locator("#cv-card").isVisible(), false);
    console.log("PASS two-player console ownership, synchronized snapshots and host skip");
    assert.deepEqual(errors, []);
    console.log("PASS no browser errors");
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
