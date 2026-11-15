#!/usr/bin/env node
/*
 * Focused unit checks for GMAT queueing, room state persistence fallback,
 * and ShuttleMission serialization/rehydration.
 * Run: node tests/persistence/run_checks.js
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { createGmatQueue, buildGmatChildEnv } = require("../../server/gmat_queue");
const gmatForecast = require("../../server/gmat_forecast");
const { ShuttleMission } = require("../../public/js/game/shuttle_mission.js");

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

async function runQueueChecks() {
  const queue = createGmatQueue({ maxConcurrent: 1, maxQueue: 2, queueTimeoutMs: 250 });
  const order = [];
  let maxObservedActive = 0;
  let activeNow = 0;

  const p1 = queue.enqueue(async ({ label }) => {
    activeNow += 1;
    maxObservedActive = Math.max(maxObservedActive, activeNow);
    order.push(`start:${label}`);
    await new Promise((r) => setTimeout(r, 40));
    order.push(`end:${label}`);
    activeNow -= 1;
    return label;
  }, { label: "r1" });

  let cancelledRan = false;
  let keepCancelled = true;
  const p2 = queue.enqueue(async () => {
    cancelledRan = true;
    return "should-not-run";
  }, { label: "r2-stale", shouldRun: () => keepCancelled });

  const p3 = queue.enqueue(async ({ label }) => {
    activeNow += 1;
    maxObservedActive = Math.max(maxObservedActive, activeNow);
    order.push(`start:${label}`);
    await new Promise((r) => setTimeout(r, 15));
    order.push(`end:${label}`);
    activeNow -= 1;
    return label;
  }, { label: "r3" });

  // Cancel p2 while queued
  keepCancelled = false;

  // One more slot while active=1 and queued=2 (p2+p3 still in pending? Actually maxQueue is 2 so p4 should overflow!)
  let overflowErr = null;
  try {
    await queue.enqueue(async () => "overflow", { label: "r4-overflow" });
  } catch (err) {
    overflowErr = err;
  }

  let staleErr = null;
  try {
    await p2;
  } catch (err) {
    staleErr = err;
  }

  const [res1, res3] = await Promise.all([p1, p3]);
  check("FIFO queue enforces single concurrency", maxObservedActive === 1, `maxActive=${maxObservedActive}`);
  check("FIFO queue executes in strict order", order.join(",") === "start:r1,end:r1,start:r3,end:r3", order.join(","));
  check("FIFO queue returns task results", res1 === "r1" && res3 === "r3", `${res1},${res3}`);
  check("Stale request skipped without invoking task", !cancelledRan && staleErr && staleErr.code === "GMAT_CANCELLED", staleErr && staleErr.code);
  check("Overflow rejects with GMAT_QUEUE_FULL", overflowErr && overflowErr.code === "GMAT_QUEUE_FULL", overflowErr && overflowErr.code);

  // Timeout check
  const timeoutQueue = createGmatQueue({ maxConcurrent: 1, maxQueue: 2, queueTimeoutMs: 40 });
  const blocker = timeoutQueue.enqueue(() => new Promise((r) => setTimeout(() => r("done"), 120)), { label: "block" });
  let timeoutErr = null;
  try {
    await timeoutQueue.enqueue(async () => "never", { label: "late", queueTimeoutMs: 30 });
  } catch (err) {
    timeoutErr = err;
  }
  await blocker;
  check("Queue wait timeout rejects with GMAT_QUEUE_TIMEOUT", timeoutErr && timeoutErr.code === "GMAT_QUEUE_TIMEOUT", timeoutErr && timeoutErr.code);

  const env = buildGmatChildEnv("/opt/GMAT/R2026a/bin/GmatConsole");
  check("buildGmatChildEnv clones env object", env && typeof env === "object" && env !== process.env);

  const st = gmatForecast.status();
  check("gmatForecast.status returns queue metadata", typeof st.available === "boolean" && typeof st.queued === "number" && st.maxConcurrent >= 1, JSON.stringify(st));
}

async function runDbPersistenceChecks() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "lunaspis-db-test-"));
  const prevDataDir = process.env.LUNASPIS_DATA_DIR;
  const prevDbUrl = process.env.DATABASE_URL;
  process.env.LUNASPIS_DATA_DIR = tempDir;
  delete process.env.DATABASE_URL;

  try {
    const dbPath = require.resolve("../../server/db");
    delete require.cache[dbPath];
    const db = require("../../server/db");
    await db.initDatabase();

    await db.saveGameRoomSnapshot("GMAT01", {
      hostId: "usr_host",
      status: "playing",
      totalTasks: 7,
      completedTasks: 3,
      isPublic: true,
      opsMode: "iss_expedition",
      isSolo: false,
      serverRegion: "ams",
      state: {
        id: "GMAT01",
        status: "playing",
        mission: {
          phase: "station",
          specialistFlight: { planet: "mars", stage: "planning", revision: 1 }
        },
        memberSnapshots: {
          "user:usr_host": { role: "specialist", name: "Nova", color: "#a78bfa" }
        }
      }
    });

    await db.saveGameRoomSnapshot("ASIA01", {
      hostId: "usr_other",
      status: "playing",
      totalTasks: 7,
      completedTasks: 1,
      isPublic: true,
      opsMode: "iss_expedition",
      isSolo: false,
      serverRegion: "sin",
      state: { id: "ASIA01", status: "playing", mission: { phase: "docking" } }
    });

    // Reload fresh db instance from disk to simulate restart
    delete require.cache[dbPath];
    const reloadedDb = require("../../server/db");
    await reloadedDb.initDatabase();

    const amsRooms = await reloadedDb.loadActiveGameRooms("ams", 180);
    const sinRooms = await reloadedDb.loadActiveGameRooms("sin", 180);
    check("DB fallback restores region-scoped rooms after reload", amsRooms.length === 1 && amsRooms[0].room_id === "GMAT01", `ams=${amsRooms.length}`);
    check("DB fallback keeps regions isolated", sinRooms.length === 1 && sinRooms[0].room_id === "ASIA01", `sin=${sinRooms.length}`);
    check(
      "DB fallback preserves nested specialistFlight & memberSnapshots",
      amsRooms[0].state_json.mission.specialistFlight.planet === "mars" &&
        amsRooms[0].state_json.memberSnapshots["user:usr_host"].role === "specialist"
    );

    const activePublicAms = await reloadedDb.getActiveRoomsList("ams");
    check("getActiveRoomsList filters by region", activePublicAms.length === 1 && activePublicAms[0].room_id === "GMAT01");
  } finally {
    if (prevDataDir === undefined) delete process.env.LUNASPIS_DATA_DIR;
    else process.env.LUNASPIS_DATA_DIR = prevDataDir;
    if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runShuttleSerializationChecks() {
  const mission = new ShuttleMission({ handoffAtOrbit: false });
  const startRes = mission.command("START");
  check("ShuttleMission starts cleanly", startRes && startRes.accepted === true);
  for (let i = 0; i < 60; i++) {
    mission.advance(1 / 30);
  }
  const snapBefore = mission.snapshot();
  const serialized = mission.serializeState();
  const restored = ShuttleMission.fromSerializedState(serialized, { handoffAtOrbit: false });
  check("ShuttleMission.fromSerializedState restores instance", restored instanceof ShuttleMission);
  const snapAfter = restored.snapshot();
  check(
    "ShuttleMission round-trip preserves phase, revision, missionId, and simTime",
    snapAfter.missionId === snapBefore.missionId &&
      snapAfter.phase === snapBefore.phase &&
      snapAfter.revision === snapBefore.revision &&
      Math.abs(snapAfter.simTime - snapBefore.simTime) < 1e-9
  );
  restored.advance(1 / 30);
  check("Restored ShuttleMission continues stepping cleanly", restored.snapshot().simTime > snapAfter.simTime);
}

(async function main() {
  await runQueueChecks();
  await runDbPersistenceChecks();
  runShuttleSerializationChecks();
  console.log(`\nResults: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
})();
