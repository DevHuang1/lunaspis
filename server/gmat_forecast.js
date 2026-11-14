"use strict";

// Runs GMAT locally for a single, bounded educational forecast. No input is
// passed to a shell or inserted into GMAT scripts before numeric validation.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const PLANETS = {
  mercury: { name: "Mercury", mu: 22031.86855, radius: 2439.7 },
  venus: { name: "Venus", mu: 324858.592, radius: 6051.8 },
  mars: { name: "Mars", mu: 42828.375214, radius: 3396.2 },
  jupiter: { name: "Jupiter", mu: 126686534.9, radius: 71492 },
  saturn: { name: "Saturn", mu: 37931187, radius: 60268 },
  uranus: { name: "Uranus", mu: 5793939, radius: 25559 },
  neptune: { name: "Neptune", mu: 6836529, radius: 24764 }
};
const G0 = 9.80665;
let running = false;

function executable() {
  const candidate = process.env.GMAT_CONSOLE_PATH || (process.platform === "win32" ? "E:\\gmat-R2026a-local\\bin\\GmatConsole.exe" : "");
  return candidate && path.isAbsolute(candidate) && fs.existsSync(candidate) ? candidate : null;
}

function status() { return { available: !!executable(), busy: running }; }
function validNumber(value, min, max, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(label + " is out of range.");
  return value;
}
function gmatEpoch(ms) {
  const d = new Date(ms), months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
}
function parseOem(content, expectedCenter) {
  if (!content.includes(`CENTER_NAME          = ${expectedCenter}`) || !content.includes("REF_FRAME            = EME2000") || !content.includes("TIME_SYSTEM          = UTC")) throw new Error("GMAT returned an unexpected coordinate frame.");
  const rows = [];
  for (const line of content.split(/\r?\n/)) {
    if (!/^\d{4}-\d\d-\d\dT/.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 7) continue;
    const row = [Date.parse(parts[0] + "Z"), ...parts.slice(1).map(Number)];
    if (row.every(Number.isFinite)) rows.push(row);
  }
  if (rows.length < 2 || rows.some((row, i) => i && row[0] < rows[i - 1][0])) throw new Error("GMAT did not produce a valid trajectory.");
  return rows;
}
function downsample(rows, requiredTimes, limit = 300) {
  const selected = new Set([0, rows.length - 1]);
  const stride = Math.max(1, Math.ceil(rows.length / limit));
  for (let i = 0; i < rows.length; i += stride) selected.add(i);
  for (let i = 0; i < rows.length; i++) {
    if (requiredTimes.some(t => Math.abs(rows[i][0] - t) < 1000)) {
      selected.add(i);
      if (i > 0) selected.add(i - 1);
      if (i + 1 < rows.length) selected.add(i + 1);
    }
  }
  return [...selected].sort((a, b) => a - b).map(i => rows[i].map((n, j) => j ? Number(n.toFixed(6)) : n));
}
function orbitAssessment(row, planet) {
  const r = row.slice(1, 4), v = row.slice(4, 7), radius = Math.hypot(...r), speed = Math.hypot(...v);
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]];
  const h2 = h.reduce((sum, n) => sum + n * n, 0);
  const energy = speed * speed / 2 - planet.mu / radius;
  const eccentricity = Math.sqrt(Math.max(0, 1 + 2 * energy * h2 / (planet.mu * planet.mu)));
  const periapsisKm = h2 / (planet.mu * (1 + eccentricity));
  return { bound: energy < 0, periapsisAltitudeKm: periapsisKm - planet.radius, safeCapture: energy < 0 && periapsisKm > planet.radius, method: `${planet.name} two-body osculating estimate at burn` };
}

async function forecast(input) {
  if (running) throw new Error("GMAT is busy with another forecast. Please retry shortly.");
  const exe = executable();
  if (!exe) throw new Error("GMAT is not configured. Set GMAT_CONSOLE_PATH to the local GmatConsole executable.");
  if (!input || !PLANETS[input.planet] || !["transfer", "insertion"].includes(input.mode) || !input.current || !Array.isArray(input.current.state) || input.current.state.length !== 6) throw new Error("Invalid spacecraft state or destination.");
  const planet = PLANETS[input.planet];
  const epoch = validNumber(input.current.epochMs, Date.UTC(2000, 0, 1), Date.UTC(2050, 0, 1), "Epoch");
  const state = input.current.state.map((n, i) => validNumber(n, i < 3 ? -1e10 : -1e4, i < 3 ? 1e10 : 1e4, "Spacecraft state"));
  const dryMassKg = validNumber(input.current.dryMassKg, 1, 1e8, "Dry mass");
  const fuelKg = validNumber(input.current.fuelKg, 0, 1e8, "Fuel");
  const ispSec = validNumber(input.current.ispSec, 1, 1e5, "Specific impulse");
  const delayDays = validNumber(input.delayDays, 0, input.mode === "transfer" ? 0.05 : 0.005, "Burn delay");
  const dv = ["v", "n", "b"].map(axis => validNumber(input[axis], -60000, 60000, "Burn component"));
  const deltaVMps = Math.hypot(...dv);
  const fuelUsedKg = (dryMassKg + fuelKg) * (1 - Math.exp(-deltaVMps / (ispSec * G0)));
  if (fuelUsedKg > fuelKg + 1e-9) throw new Error("Not enough fuel for this burn.");
  const horizonDays = input.mode === "transfer" ? validNumber(input.horizonDays, 30, 12000, "Forecast duration") : 0.02;
  if (epoch + horizonDays * 86400000 >= Date.UTC(2049, 11, 30)) throw new Error("This forecast exceeds the installed GMAT ephemeris date range.");
  if (delayDays >= horizonDays) throw new Error("Burn delay exceeds the forecast window.");
  const origin = input.mode === "transfer" ? "Earth" : planet.name;
  const step = input.mode === "transfer" ? Math.max(21600, Math.ceil(horizonDays * 86400 / 8000)) : 60;
  const burnEpoch = epoch + Math.round(delayDays * 86400000);
  running = true;
  let dir, scratch;
  try {
    scratch = path.resolve(process.env.GMAT_TEMP_DIR || path.join(__dirname, ".gmat-runtime"));
    await fs.promises.mkdir(scratch, { recursive: true });
    dir = await fs.promises.mkdtemp(path.join(scratch, "forecast-"));
    const outputPath = name => path.join(dir, name).replace(/\\/g, "/");
    if (dir.includes("'")) throw new Error("The temporary directory path cannot contain an apostrophe.");
    const script = `Create Spacecraft Sat;\nSat.DateFormat = UTCGregorian;\nSat.Epoch = '${gmatEpoch(epoch)}';\n` +
      `Create CoordinateSystem SunFrame;\nSunFrame.Origin = Sun;\nSunFrame.Axes = MJ2000Eq;\n` +
      `Create CoordinateSystem TargetFrame;\nTargetFrame.Origin = ${planet.name};\nTargetFrame.Axes = MJ2000Eq;\n` +
      `Sat.CoordinateSystem = SunFrame;\nSat.DisplayStateType = Cartesian;\n` +
      ["X", "Y", "Z", "VX", "VY", "VZ"].map((key, i) => `Sat.${key} = ${state[i]};\n`).join("") +
      `Sat.DryMass = ${dryMassKg + fuelKg};\n` +
      // Use Earth-centred integration near ISS, then Sun-centred integration
      // for the interplanetary leg. Output coordinates stay Sun/target centred.
      `Create ForceModel DeepSpace;\nDeepSpace.CentralBody = ${input.mode === "transfer" ? "Sun" : origin};\nDeepSpace.PointMasses = {Earth, Luna, Mars, Sun, Venus, Jupiter, Saturn, Uranus, Neptune};\nDeepSpace.Drag = None;\nDeepSpace.SRP = On;\n` +
      `Create Propagator Prop;\nProp.FM = DeepSpace;\nProp.Type = PrinceDormand78;\nProp.InitialStepSize = 600;\nProp.Accuracy = 1e-12;\nProp.MinStep = 0;\nProp.MaxStep = 864000;\nProp.MaxStepAttempts = 50;\n` +
      `Create ImpulsiveBurn Burn;\nBurn.CoordinateSystem = Local;\nBurn.Origin = ${origin};\nBurn.Axes = VNB;\n` +
      dv.map((n, i) => `Burn.Element${i + 1} = ${n / 1000};\n`).join("") + `Burn.DecrementMass = false;\n` +
      ["Sun", "Target"].map(body => `Create EphemerisFile ${body}Ephem;\n${body}Ephem.Spacecraft = Sat;\n${body}Ephem.Filename = '${outputPath(body + ".oem")}';\n${body}Ephem.FileFormat = CCSDS-OEM;\n${body}Ephem.CoordinateSystem = ${body}Frame;\n${body}Ephem.StepSize = ${step};\n${body}Ephem.WriteEphemeris = true;\n`).join("") +
      (input.mode === "transfer" ?
        `Create ForceModel NearEarth;\nNearEarth.CentralBody = Earth;\nNearEarth.PointMasses = {Earth, Luna, Mars, Sun, Venus, Jupiter, Saturn, Uranus, Neptune};\nNearEarth.Drag = None;\nNearEarth.SRP = On;\n` +
        `Create Propagator EarthProp;\nEarthProp.FM = NearEarth;\nEarthProp.Type = PrinceDormand78;\nEarthProp.InitialStepSize = 60;\nEarthProp.Accuracy = 1e-12;\nEarthProp.MinStep = 0;\nEarthProp.MaxStep = 86400;\nEarthProp.MaxStepAttempts = 50;\n` +
        `Create Variable MissionStart Remaining Escaped;\nCreate ReportFile EarthResult;\nEarthResult.Filename = '${outputPath("earth-result.txt")}';\nEarthResult.WriteHeaders = false;\n` : "") +
      `BeginMissionSequence;\n` +
      (input.mode === "transfer" ?
        `MissionStart = Sat.TAIModJulian;\nEscaped = 0;\n` + (delayDays ? `Propagate EarthProp(Sat) {Sat.ElapsedDays = ${delayDays}};\n` : "") +
        `Maneuver Burn(Sat);\nPropagate EarthProp(Sat) {Sat.Earth.RMAG = 1000000, Sat.Earth.RMAG = 6478, Sat.ElapsedDays = 5};\n` +
        `Remaining = ${horizonDays} - (Sat.TAIModJulian - MissionStart);\nIf Sat.Earth.RMAG > 999000;\nEscaped = 1;\nPropagate Prop(Sat) {Sat.ElapsedDays = Remaining};\nEndIf;\nReport EarthResult Escaped Sat.Earth.RMAG;\n` :
        (delayDays ? `Propagate Prop(Sat) {Sat.ElapsedDays = ${delayDays}};\n` : "") +
        `Maneuver Burn(Sat);\nPropagate Prop(Sat) {Sat.ElapsedDays = ${horizonDays - delayDays}};\n`);
    const scriptPath = path.join(dir, "forecast.script");
    await fs.promises.writeFile(scriptPath, script, "utf8");
    const result = await execFileAsync(exe, ["-r", scriptPath], { cwd: path.dirname(exe), timeout: 15000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    if (!result.stdout.includes("Mission run completed.")) throw new Error("GMAT did not complete the forecast.");
    const sunRows = parseOem(await fs.promises.readFile(path.join(dir, "Sun.oem"), "utf8"), "Sun");
    const targetRows = parseOem(await fs.promises.readFile(path.join(dir, "Target.oem"), "utf8"), planet.name);
    if (sunRows.length !== targetRows.length || sunRows.some((row, i) => Math.abs(row[0] - targetRows[i][0]) > 1000)) throw new Error("GMAT trajectory timestamps did not match.");
    let earthDeparture = null;
    if (input.mode === "transfer") {
      const report = (await fs.promises.readFile(path.join(dir, "earth-result.txt"), "utf8")).trim().split(/\s+/).map(Number);
      if (report.length !== 2 || !report.every(Number.isFinite)) throw new Error("GMAT did not report the Earth departure result.");
      earthDeparture = { escaped: report[0] > 0.5, finalEarthRadiusKm: report[1], status: report[0] > 0.5 ? "escaped" : report[1] <= 6480 ? "returned_near_earth" : "not_escaped" };
    }
    const expectedEnd = epoch + horizonDays * 86400000;
    const actualEnd = sunRows[sunRows.length - 1][0];
    if (Math.abs(sunRows[0][0] - epoch) > 1000 || actualEnd > expectedEnd + 5000 || ((!earthDeparture || earthDeparture.escaped) && Math.abs(actualEnd - expectedEnd) > 5000)) throw new Error("GMAT trajectory does not cover the requested time window.");
    const postBurnRows = targetRows.filter(row => row[0] >= burnEpoch - 500);
    if (!postBurnRows.length) throw new Error("GMAT did not report the post-burn trajectory.");
    let closest = postBurnRows[postBurnRows.length - 1];
    for (const row of postBurnRows) if (Math.hypot(...row.slice(1, 4)) <= Math.hypot(...closest.slice(1, 4))) closest = row;
    const closestKm = Math.hypot(...closest.slice(1, 4));
    // For a delayed burn the OEM contains pre- and post-burn samples at the
    // same epoch. The last matching sample is the post-burn state.
    const burnStates = targetRows.filter(row => Math.abs(row[0] - burnEpoch) < 1000);
    if (!burnStates.length) throw new Error("GMAT did not report the maneuver state.");
    const orbit = input.mode === "insertion" ? orbitAssessment(burnStates[burnStates.length - 1], planet) : null;
    const inApproachZone = closestKm > planet.radius && closestKm <= planet.radius * 100;
    const targetEpoch = input.mode === "transfer" && earthDeparture.escaped && inApproachZone ? closest[0] : actualEnd;
    const targetState = sunRows.filter(row => Math.abs(row[0] - targetEpoch) < 1000).pop();
    const targetRelativeState = targetRows.filter(row => Math.abs(row[0] - targetEpoch) < 1000).pop();
    if (!targetState) throw new Error("GMAT output epochs did not match.");
    if (!targetRelativeState) throw new Error("GMAT target-relative state is missing.");
    // Combine Sun-centred spacecraft state and target position at each epoch.
    const combined = sunRows.map((row, i) => [...row, row[1] - targetRows[i][1], row[2] - targetRows[i][2], row[3] - targetRows[i][3]]);
    const points = downsample(combined.filter(row => row[0] <= targetEpoch), [burnEpoch, targetEpoch]);
    return { mode: input.mode, epochMs: epoch, burnEpochMs: burnEpoch, endEpochMs: targetEpoch, dvMps: dv, deltaVMps, delayDays, fuelUsedKg, fuelAfterKg: fuelKg - fuelUsedKg,
      closestKm, closestEpochMs: closest[0], closestRelativeState: closest.slice(1), closestSamplingHours: step / 3600, earthDeparture,
      orbit, points, endState: targetState.slice(1), endRelativeState: targetRelativeState.slice(1), planet: input.planet, targetRadiusKm: planet.radius, source: `GMAT local run · Sun/${planet.name} MJ2000Eq · UTC` };
  } catch (error) {
    if (error.killed) throw new Error("GMAT forecast timed out.");
    if (error.code && error.code !== "ENOENT") throw new Error("GMAT could not complete this forecast. Try a different burn.");
    throw error;
  } finally {
    running = false;
    if (dir && path.dirname(path.resolve(dir)) === scratch) await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { forecast, status, orbitAssessment, PLANETS };
