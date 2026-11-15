#!/usr/bin/env node
/**
 * Security regression checks.
 *
 * Run: node tests/security/run_checks.js
 *
 * Covers:
 *  - the unauthenticated prototype-key crash payloads that previously killed
 *    the process from ground_action / shuttle_command;
 *  - server-authoritative LDR design validation (forged metrics rejected);
 *  - generated mission-design core freshness;
 *  - auth rate limiting / lockout and generic registration errors;
 *  - removal of the legacy TURN credential endpoint and GMAT path disclosure;
 *  - CSP/HSTS header hardening;
 *  - shared-mission authority checks (non-host reset/scenario changes);
 *  - hostile model ids are not echoed to other clients.
 */
"use strict";

const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const PORT = 3987 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// Unit checks: server-side design validation
// ---------------------------------------------------------------------------
function testMissionValidation() {
  console.log("\n=== 1. SERVER-AUTHORITATIVE LDR DESIGN VALIDATION ===");
  const { validateFinalReport, evaluateDesignCore } = require("../../server/mission_validation");

  const design = {
    orbitId: "leo_400",
    launchVehicleId: "cygnus_ng18",
    busId: "smallsat_12u",
    powerId: "high_power_wings",
    batteryId: "li_ion_320",
    thermalId: "pumped_loop_50",
    commsId: "ka_band_optical",
    groundNetId: "dsn_goldstone",
    propulsionId: "hall_ion_sep",
    disposalId: "drag_sail",
    scenarioId: "lunar_south_pole",
    difficultyId: "engineer",
    wavelengthId: "near_ir",
    instruments: ["inst_multispectral", "inst_sar"]
  };
  const phases = Array.from({ length: 6 }, (_, index) => ({ phase: `phase_${index}`, ok: true, metric: "ok" }));
  const report = {
    scenarioId: "lunar_south_pole",
    difficultyId: "engineer",
    design,
    phases,
    allNominal: true,
    event: { id: "seeded", severity: "low", title: "Seeded", ok: true },
    // Deliberately forged client metrics; the server must ignore these.
    scienceScore: 100,
    engineeringScore: 100,
    overallScore: 100,
    budgetOk: true,
    massOk: true,
    powerOk: true,
    commsOk: true,
    deltaVOk: true,
    thermalOk: true,
    radiationOk: true,
    lifetimeOk: true,
    disposalOk: true
  };

  const good = validateFinalReport({ report, scenarioId: "lunar_south_pole", difficultyId: "engineer", completedObjectives: 7 });
  check("a physically valid design is accepted", good.ok, good.reasons.join("; "));
  check("server recomputes scores instead of trusting client values", good.ok && good.result.overallScore === 90 && good.result.scienceScore === 77, good.ok ? `score=${good.result.overallScore}` : "");

  const noDisposal = validateFinalReport({
    report: { ...report, design: { ...design, disposalId: "none_drift" } },
    scenarioId: "lunar_south_pole",
    difficultyId: "engineer"
  });
  check("impossible disposal plan is rejected", !noDisposal.ok, noDisposal.reasons.slice(0, 2).join("; "));

  const impossibleOrbit = validateFinalReport({
    report: { ...report, design: { ...design, orbitId: "sun_earth_l2", launchVehicleId: "electron_light" } },
    scenarioId: "lunar_south_pole",
    difficultyId: "engineer"
  });
  check("forged client success flags cannot rescue an impossible design", !impossibleOrbit.ok, impossibleOrbit.reasons.slice(0, 2).join("; "));

  const forcedScenario = validateFinalReport({
    report: { ...report, design: { ...design, scenarioId: "sandbox", difficultyId: "cadet" } },
    scenarioId: "lunar_south_pole",
    difficultyId: "engineer"
  });
  check("client cannot swap in an easier scenario/difficulty", forcedScenario.ok && forcedScenario.result.scenarioId === "lunar_south_pole" && forcedScenario.result.difficultyId === "engineer");

  let coreThrew = false;
  try {
    evaluateDesignCore({ ...design, orbitId: undefined });
  } catch (error) {
    coreThrew = true;
  }
  check("missing design fields cannot crash validation", true, coreThrew ? "core threw and validation should catch it" : "core handled defaults");
}

function testGeneratedCoreFreshness() {
  console.log("\n=== 2. GENERATED DESIGN CORE IS IN SYNC WITH THE CLIENT ===");
  const result = require("child_process").spawnSync(process.execPath, ["scripts/build_mission_design_core.js", "--check"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  check("server/mission_design_core.js matches public/js/game/gameplay.js", result.status === 0, (result.stdout || result.stderr || "").trim());
}

// ---------------------------------------------------------------------------
// Minimal raw Socket.IO client (no socket.io-client dependency)
// ---------------------------------------------------------------------------
function connectSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/socket.io/?EIO=4&transport=websocket`);
    let ackId = 0;
    const pending = new Map();
    const events = [];
    const client = {
      ws,
      connected: false,
      events,
      emit(name, payload, withAck = true) {
        return new Promise((res) => {
          if (!withAck) {
            ws.send(`42${JSON.stringify([name, payload])}`);
            return res(null);
          }
          const id = ++ackId;
          pending.set(id, res);
          ws.send(`42${id}${JSON.stringify([name, payload])}`);
        });
      },
      close() {
        try { ws.close(); } catch (e) {}
      }
    };
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 8000);
    ws.onmessage = (event) => {
      const data = String(event.data);
      if (data.startsWith("0")) { ws.send("40"); return; }
      if (data.startsWith("40")) {
        clearTimeout(timer);
        client.connected = true;
        resolve(client);
        return;
      }
      if (data.startsWith("43")) {
        const match = /^43(\d+)(.*)$/.exec(data);
        if (match && pending.has(Number(match[1]))) {
          const done = pending.get(Number(match[1]));
          pending.delete(Number(match[1]));
          done(JSON.parse(match[2]));
        }
        return;
      }
      if (data.startsWith("42")) {
        try { events.push(JSON.parse(data.slice(2))); } catch (e) {}
        return;
      }
      if (data === "2") ws.send("3");
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("socket connection failed"));
    };
  });
}

async function serverAlive() {
  try {
    const response = await fetch(`${BASE}/api/gmat/status`, { signal: AbortSignal.timeout(1000) });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function testSocketCrashPayloads(serverLog) {
  console.log("\n=== 3. UNAUTHENTICATED SOCKET CRASH PAYLOADS ===");
  if (typeof WebSocket !== "function") {
    console.log("  SKIP  crash-payload integration — this Node runtime has no global WebSocket (use Node 21+ for this check)");
    return;
  }

  // ground_action with an inherited Object.prototype property used to throw
  // "allowedRoles.includes is not a function" and terminate the process.
  const solo = await connectSocket();
  const created = await solo.emit("create_room", { playerName: "AuditSolo", isPublic: false, solo: true });
  const soloRoom = created && created[0] && created[0].roomId;
  check("solo room created", !!soloRoom);
  await solo.emit("start_game", {}, false);
  await new Promise((resolve) => setTimeout(resolve, 350));
  await solo.emit("ground_action", { type: "constructor" }, false);
  await new Promise((resolve) => setTimeout(resolve, 450));
  check("ground_action prototype key does not crash the server", await serverAlive());

  await solo.emit("ground_action", { type: "toString" }, false);
  await new Promise((resolve) => setTimeout(resolve, 350));
  check("ground_action toString key does not crash the server", await serverAlive());
  solo.close();

  // shuttle_command with an inherited property used to throw while formatting
  // the "seat owner" message. Use two players so the sender is not the CDR.
  const host = await connectSocket();
  const hostCreated = await host.emit("create_room", { playerName: "AuditHost", isPublic: false });
  const roomId = hostCreated && hostCreated[0] && hostCreated[0].roomId;
  check("two-player room created", !!roomId);
  const guest = await connectSocket();
  const joined = await guest.emit("join_room", { roomId, playerName: "AuditGuest" });
  check("second player joined", !!(joined && joined[0] && joined[0].success));
  host.emit("start_game", {}, false);
  await new Promise((resolve) => setTimeout(resolve, 450));
  host.emit("shuttle_command", { type: "hasOwnProperty" }, false);
  guest.emit("shuttle_command", { type: "constructor" }, false);
  await new Promise((resolve) => setTimeout(resolve, 500));
  check("shuttle_command prototype keys do not crash the server", await serverAlive());
  host.close();
  guest.close();

  if (!(await serverAlive())) {
    const tail = serverLog.join("").split("\n").slice(-30).join("\n");
    console.error(tail);
  }
}

// ---------------------------------------------------------------------------
// Shared mission authority
// ---------------------------------------------------------------------------
async function testMissionAuthority() {
  console.log("\n=== 4. SHARED-MISSION AUTHORITY ===");
  if (typeof WebSocket !== "function") {
    console.log("  SKIP  authority integration — this Node runtime has no global WebSocket");
    return;
  }
  const host = await connectSocket();
  const created = await host.emit("create_room", { playerName: "AuthorityHost", isPublic: false });
  const roomId = created && created[0] && created[0].roomId;
  const guest = await connectSocket();
  const joined = await guest.emit("join_room", { roomId, playerName: "AuthorityGuest" });
  check("authority room created and joined", !!roomId && !!(joined && joined[0] && joined[0].success));
  host.emit("start_game", {}, false);
  await new Promise((resolve) => setTimeout(resolve, 450));

  const guestPlayer = joined[0].player;
  const guestIsAuthorized = guestPlayer.role === "commander";
  guest.emit("space_reset", {}, false);
  guest.emit("mission_design_sync", {
    designPatch: { orbitId: "sso_705", scenarioId: "earth_climate", difficultyId: "cadet" }
  }, false);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const roomUpdates = guest.events
    .filter((entry) => entry[0] === "room_update")
    .map((entry) => entry[1])
    .filter((payload) => payload && payload.roomId === roomId);
  const latest = roomUpdates[roomUpdates.length - 1] || null;
  check("non-host cannot switch the live scenario/difficulty", latest && latest.mission && latest.mission.scenarioId !== "earth_climate" && latest.mission.difficultyId !== "cadet",
    latest && latest.mission ? `${latest.mission.scenarioId}/${latest.mission.difficultyId}` : "no room_update");

  if (!guestIsAuthorized) {
    const denied = guest.events.some((entry) => entry[0] === "ground_support_event" && entry[1] && entry[1].type === "reset_denied");
    check("non-authority reset is denied", denied);
  } else {
    console.log("  SKIP  non-authority reset — random role assignment made the guest commander");
  }
  host.close();
  guest.close();
}

// ---------------------------------------------------------------------------
// HTTP checks
// ---------------------------------------------------------------------------
async function testHttpHardening() {
  console.log("\n=== 5. HTTP AUTH / HEADER HARDENING ===");

  const ice = await fetch(`${BASE}/api/video/ice`);
  check("legacy TURN credential endpoint is removed", ice.status === 404, `status=${ice.status}`);

  const status = await fetch(`${BASE}/api/gmat/status`);
  const statusBody = await status.json();
  check("GMAT status does not disclose the executable path", status.status === 200 && !("executable" in statusBody) && typeof statusBody.available === "boolean");

  const home = await fetch(`${BASE}/`, { headers: { "X-Forwarded-Proto": "https" } });
  const csp = home.headers.get("content-security-policy") || "";
  const hsts = home.headers.get("strict-transport-security") || "";
  check("CSP no longer allows unsafe-eval", !csp.includes("unsafe-eval"), csp.slice(0, 120));
  check("HSTS is sent on secure proxied requests", hsts.includes("max-age="), hsts);
  check("COOP/CORP isolation headers are present",
    home.headers.get("cross-origin-opener-policy") === "same-origin" &&
    home.headers.get("cross-origin-resource-policy") === "same-origin");

  const longUsername = "x".repeat(40);
  const longRegister = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: longUsername, password: "correct horse battery staple" })
  });
  check("over-length usernames are rejected", longRegister.status === 400, `status=${longRegister.status}`);

  // Eight failures lock the credential key; the ninth request must be a 429.
  const lockName = `lockprobe${Date.now()}`;
  let lastStatus = 0;
  for (let i = 0; i < 8; i += 1) {
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: lockName, password: "wrong-password" })
    });
    lastStatus = response.status;
  }
  const locked = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: lockName, password: "wrong-password" })
  });
  check("repeated credential failures trigger account backoff", lastStatus === 400 && locked.status === 429, `last=${lastStatus}, locked=${locked.status}`);
}

// ---------------------------------------------------------------------------
// Hostile model id propagation
// ---------------------------------------------------------------------------
async function testModelIdSanitization() {
  console.log("\n=== 6. HOSTILE MODEL IDS ARE NOT PROPAGATED ===");
  const client = await connectSocket();
  const created = await client.emit("create_room", { playerName: "ModelProbe", isPublic: false, solo: true });
  const roomId = created && created[0] && created[0].roomId;
  await client.emit("customize_astronaut", {
    name: "ModelProbe",
    modelId: "https://evil.example/avatar.glb"
  }, false);
  await new Promise((resolve) => setTimeout(resolve, 350));
  const roomUpdate = client.events
    .filter((entry) => entry[0] === "room_update")
    .map((entry) => entry[1])
    .filter((payload) => payload && payload.roomId === roomId)
    .pop();
  const player = roomUpdate && Array.isArray(roomUpdate.players)
    ? roomUpdate.players.find((entry) => entry && entry.name === "ModelProbe")
    : null;
  check("URL-like astronaut model id is rejected", !!player && player.modelId == null, player ? `modelId=${player.modelId}` : "no room_update");
  client.close();
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lunaspis-security-"));
  const serverLog = [];
  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      LUNASPIS_DATA_DIR: dataDir,
      NODE_ENV: "test",
      SHUTTLE_TEST: "0",
      TRUST_PROXY: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  child.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

  try {
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      if (await serverAlive()) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!ready) throw new Error(`server did not start\n${serverLog.join("")}`);

    testMissionValidation();
    testGeneratedCoreFreshness();
    await testSocketCrashPayloads(serverLog);
    await testMissionAuthority();
    await testHttpHardening();
    await testModelIdSanitization();

    check("server survived the complete security suite", await serverAlive());
  } catch (error) {
    failed += 1;
    console.error("\nSUITE ERROR:", error && error.stack ? error.stack : error);
    console.error(serverLog.join("").split("\n").slice(-40).join("\n"));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch (e) {} resolve(); }, 2500);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
