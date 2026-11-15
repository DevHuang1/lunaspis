const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const gmatQueue = require("./gmat_queue");
const runFile = promisify(execFile);
const PROPAGATION_TIMEOUT_MS = Number(process.env.GMAT_TIMEOUT_MS) || 30000;

// GMAT propagates a coast from an authoritative Shuttle snapshot. The game uses
// an idealized ECI frame, treated as EarthMJ2000Eq for this training estimate.
async function propagateCoast(snapshot, options = {}) {
  const executable = gmatQueue.findGmatExecutable();
  if (!executable) {
    throw new Error("GMAT is not configured. Set GMAT_CONSOLE_PATH to the local GmatConsole executable.");
  }
  await fs.access(executable);
  const { r, v, eng } = snapshot.vehicle;
  if (snapshot.phase === "briefing" || snapshot.phase === "prelaunch" || snapshot.phase === "ascent" || snapshot.telemetry.altitudeM < 150000 || eng.ssme || eng.srb || eng.oms || (snapshot.burn && snapshot.burn.active)) {
    throw new Error("GMAT coast prediction is available above 150 km with engines off.");
  }
  if (![...r, ...v].every(Number.isFinite)) throw new Error("Invalid spacecraft state.");
  const workRoot = process.env.GMAT_WORK_DIR || path.join(__dirname, ".data", "gmat-runs");
  if (/[#!'\r\n]/.test(workRoot)) throw new Error("GMAT_WORK_DIR contains unsupported characters.");
  await fs.mkdir(workRoot, { recursive: true });
  const workDir = await fs.mkdtemp(path.join(workRoot, "coast-"));
  try {
    const report = path.join(workDir, "coast.txt").replace(/\\/g, "/");
    const scriptFile = path.join(workDir, "coast.script");
    const [x, y, z] = r.map(n => n / 1000);
    const [vx, vy, vz] = v.map(n => n / 1000);
    const script = `Create Spacecraft Shuttle;
Shuttle.DateFormat = UTCGregorian;
Shuttle.Epoch = '01 Jan 2026 00:00:00.000';
Shuttle.CoordinateSystem = EarthMJ2000Eq;
Shuttle.DisplayStateType = Cartesian;
Shuttle.X = ${x};
Shuttle.Y = ${y};
Shuttle.Z = ${z};
Shuttle.VX = ${vx};
Shuttle.VY = ${vy};
Shuttle.VZ = ${vz};
Create ForceModel EarthModel;
EarthModel.CentralBody = Earth;
EarthModel.PointMasses = {Earth};
Create Propagator Coast;
Coast.FM = EarthModel;
Coast.Type = PrinceDormand78;
Coast.Accuracy = 1e-12;
Create ReportFile Prediction;
Prediction.Filename = '${report}';
Prediction.WriteHeaders = false;
BeginMissionSequence;
Propagate Coast(Shuttle) {Shuttle.ElapsedSecs = 120};
Report Prediction Shuttle.X Shuttle.Y Shuttle.Z Shuttle.VX Shuttle.VY Shuttle.VZ;
`;
    await fs.writeFile(scriptFile, script, "utf8");
    const result = await gmatQueue.enqueue(
      () =>
        runFile(executable, ["--run", scriptFile], {
          cwd: path.dirname(executable),
          env: gmatQueue.buildGmatChildEnv(executable),
          timeout: PROPAGATION_TIMEOUT_MS,
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        }),
      {
        label: options.label || "coast",
        queueTimeoutMs: options.queueTimeoutMs,
        shouldRun: options.shouldRun,
      }
    );
    if (!result.stdout.includes("Mission run completed.")) throw new Error("GMAT did not complete the calculation.");
    const output = (await fs.readFile(report, "utf8")).trim().split(/\s+/).map(Number);
    if (output.length !== 6 || !output.every(Number.isFinite)) throw new Error("GMAT returned invalid prediction data.");
    return {
      missionId: snapshot.missionId,
      sourceSimTime: snapshot.simTime,
      horizonSeconds: 120,
      altitudeKm: Math.hypot(...output.slice(0, 3)) - 6378.137,
      inertialSpeedKmS: Math.hypot(...output.slice(3, 6)),
      positionKm: output.slice(0, 3),
      velocityKmS: output.slice(3, 6)
    };
  } finally {
    await fs.rm(path.join(workDir, "coast.txt"), { force: true });
    await fs.rm(path.join(workDir, "coast.script"), { force: true });
    await fs.rmdir(workDir);
  }
}

module.exports = { propagateCoast };
