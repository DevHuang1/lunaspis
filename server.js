const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");
const db = require("./server/db");
const storage = require("./server/storage");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "false" ? false : 1);
const server = http.createServer(app);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e6,
  // Small realtime packets do not benefit from per-message compression; the
  // compression work adds latency and can increase jitter on constrained CPUs.
  perMessageDeflate: false,
  // Socket.IO defaults. The previous 10s/5s heartbeat was aggressive enough
  // that a long shader compile or tab stall could trigger a needless reconnect
  // (and a burst of high-latency traffic on rejoin).
  pingInterval: 25000,
  pingTimeout: 20000
});

// Initialize zero-audio WebRTC voice signaling
require("./server/voice-signaling")(io);

const PORT = process.env.PORT || 3000;

// Baseline security headers. The app relies on inline handlers/styles and a
// CDN-hosted Three.js build, so 'unsafe-inline' is retained for compatibility.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "media-src 'self' blob:; " +
    "connect-src 'self' blob:; " +
    "worker-src 'self' blob:; " +
    "font-src 'self' data:; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  next();
});

// Lightweight in-memory rate limiter for HTTP APIs.
function createRateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    // Bound memory if the process sees many distinct client addresses.
    if (hits.size > 10_000) {
      for (const [k, v] of hits) {
        if (now - v.start >= windowMs) hits.delete(k);
      }
    }

    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((windowMs - (now - entry.start)) / 1000)));
      return res.status(429).json({ success: false, error: "Too many requests" });
    }
    next();
  };
}

app.use("/api/auth", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
});
app.use("/api/auth", createRateLimiter({ windowMs: 60_000, max: 20 }));
app.use("/api", createRateLimiter({ windowMs: 60_000, max: 120 }));
app.use(express.json({ limit: "100kb" }));

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(header);
  return match ? match[1] : null;
}

async function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  const user = token ? await db.resolveSessionUser(token) : null;
  if (!user) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  req.authUser = user;
  req.authToken = token;
  next();
}

function isValidAssetFilename(filename) {
  return typeof filename === "string" && /^[A-Za-z0-9._-]+$/.test(filename) && !filename.includes("..");
}

function requireStorageAdmin(req, res, next) {
  const token = process.env.STORAGE_ADMIN_TOKEN;
  if (!token) {
    return res.status(403).json({ success: false, error: "Storage admin endpoint is disabled" });
  }
  const provided = req.headers["x-storage-admin-token"];
  if (typeof provided !== "string" || provided.length !== token.length) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token))) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
  } catch (e) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  next();
}

// Railway Object Storage Stream & Fallback Route for 3D Assets
app.get("/assets/:filename", async (req, res, next) => {
  const filename = req.params.filename;
  if (!isValidAssetFilename(filename)) {
    return res.status(400).json({ success: false, error: "Invalid asset name" });
  }

  const assetsBase = path.resolve(__dirname, "public", "assets");
  const localFile = path.resolve(assetsBase, filename);
  if (!localFile.startsWith(assetsBase + path.sep)) {
    return res.status(400).json({ success: false, error: "Invalid asset path" });
  }

  if (fs.existsSync(localFile)) {
    return next(); // Let local express.static serve it
  }

  if (storage.isConfigured()) {
    try {
      const objectKey = `assets/${filename}`;
      const obj = await storage.getObject(objectKey);
      if (obj && obj.body) {
        res.setHeader("Content-Type", obj.contentType || "model/gltf-binary");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        if (obj.contentLength) res.setHeader("Content-Length", obj.contentLength);

        const { Readable } = require("stream");
        if (typeof Readable.fromWeb === "function" && obj.body.getReader) {
          Readable.fromWeb(obj.body).pipe(res);
        } else {
          const buf = Buffer.from(await obj.body.arrayBuffer());
          res.send(buf);
        }
        return;
      }
    } catch (e) {
      console.warn(`[STORAGE] Stream fallback error for ${filename}:`, e.message);
    }
  }

  next();
});

/**
 * Automatically syncs local 3D assets to the Railway Object Storage Bucket
 * in the background upon container startup.
 */
async function syncAssetsToBucket() {
  if (!storage.isConfigured()) return { success: false, reason: "Storage not configured" };

  const assetsDir = path.join(__dirname, "public", "assets");
  if (!fs.existsSync(assetsDir)) return { success: false, reason: "No local assets folder" };

  const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith(".glb"));
  console.log(`📦 [STORAGE] Verifying Railway Bucket sync for ${files.length} assets...`);

  let uploaded = 0;
  let totalBytes = 0;

  for (const file of files) {
    const key = `assets/${file}`;
    const exists = await storage.hasObject(key);
    if (!exists) {
      const fullPath = path.join(assetsDir, file);
      const buffer = fs.readFileSync(fullPath);
      await storage.putObject(key, buffer, "model/gltf-binary");
      uploaded++;
      totalBytes += buffer.length;
      console.log(`📦 [STORAGE] Synced ${file} to bucket (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`);
    }
  }

  if (uploaded > 0) {
    console.log(`🎉 [STORAGE] Bucket populated: ${uploaded} assets uploaded (${(totalBytes / (1024 * 1024)).toFixed(2)} MB).`);
  } else {
    console.log(`📦 [STORAGE] Railway Bucket verified: all ${files.length} assets are already present.`);
  }

  return { success: true, uploaded, total: files.length };
}

// Storage Telemetry & On-Demand Sync Endpoints (admin-protected)
app.get("/api/storage/status", requireStorageAdmin, async (req, res) => {
  const assetsDir = path.join(__dirname, "public", "assets");
  const localFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter(f => f.endsWith(".glb")) : [];

  res.json({
    configured: storage.isConfigured(),
    localAssetCount: localFiles.length,
    assets: localFiles
  });
});

app.post("/api/storage/sync", requireStorageAdmin, async (req, res) => {
  try {
    const result = await syncAssetsToBucket();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: "Sync failed" });
  }
});

// Serve static assets. Heavy binary assets (models, textures, WASM) are
// cacheable so reloads and reconnects do not saturate the connection and
// inflate realtime ping. HTML stays fresh, while JS/CSS revalidate cheaply.
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  lastModified: true,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (/\.(glb|gltf|bin|jpg|jpeg|png|webp|ktx2|wasm)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=3600, immutable");
    } else if (/\.(js|css)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    } else {
      res.setHeader("Cache-Control", "no-cache");
    }
    if (filePath.endsWith(".glb") || filePath.endsWith(".obj")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", filePath.endsWith(".glb") ? "model/gltf-binary" : "text/plain");
    }
  }
}));

// ============================================================================
// REST API: USER INFOS, PERSISTENT ROOM STATES, LEADERBOARDS
// ============================================================================
// ============================================================================
// ASTRONAUT FLIGHT CREDENTIALS REST API
// ============================================================================
async function attachSession(result) {
  if (!result || !result.success || !result.user) return result;
  const session = await db.issueSessionToken(result.user.id);
  if (!session) return { success: false, error: "Unable to issue session" };
  return { ...result, token: session.token, sessionExpiresAt: session.expiresAt, user: db.sanitizeUser(result.user) };
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, callsign, flightTitle, suitColor } = req.body || {};
    const result = await db.registerUser({ username, password, callsign, flightTitle, suitColor });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(await attachSession(result));
  } catch (err) {
    res.status(500).json({ success: false, error: "Registration failed" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const result = await db.loginUser(username, password);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(await attachSession(result));
  } catch (err) {
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body || {};
    const result = await db.resetPassword(username, currentPassword, newPassword);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(await attachSession(result));
  } catch (err) {
    res.status(500).json({ success: false, error: "Password reset failed" });
  }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json({ success: true, user: req.authUser });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  await db.revokeSessionToken(req.authToken);
  res.json({ success: true });
});

app.post("/api/auth/update-profile", requireAuth, async (req, res) => {
  try {
    const { callsign, flightTitle, suitColor, preferredRole } = req.body || {};
    const validColor = /^#[0-9a-fA-F]{6}$/.test(suitColor) ? suitColor : undefined;
    const user = await db.updateUserProfile(req.authUser.id, {
      callsign: callsign ? String(callsign).trim().slice(0, 24) : undefined,
      flight_title: flightTitle ? String(flightTitle).trim().slice(0, 32) : undefined,
      suit_color: validColor,
      preferred_role: preferredRole ? String(preferredRole).trim().slice(0, 32) : undefined
    });
    res.json({ success: true, user: user || req.authUser });
  } catch (err) {
    res.status(500).json({ success: false, error: "Profile update failed" });
  }
});

app.get("/api/user/:userId", requireAuth, async (req, res) => {
  if (req.params.userId !== req.authUser.id) {
    return res.status(403).json({ success: false, error: "Forbidden" });
  }
  res.json({ success: true, user: req.authUser });
});

app.post("/api/user", requireAuth, async (req, res) => {
  try {
    const { suitColor, preferredRole } = req.body || {};
    const validColor = /^#[0-9a-fA-F]{6}$/.test(suitColor) ? suitColor : undefined;
    const user = await db.updateUserProfile(req.authUser.id, {
      suit_color: validColor,
      preferred_role: preferredRole ? String(preferredRole).trim().slice(0, 32) : undefined
    });
    res.json({ success: true, user: user || req.authUser });
  } catch (err) {
    res.status(500).json({ success: false, error: "Profile update failed" });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const leaders = await db.getTopAstronauts(10);
    res.json({ success: true, leaderboard: leaders });
  } catch (err) {
    res.status(500).json({ success: false, error: "Unable to load leaderboard" });
  }
});

app.get("/api/rooms", async (req, res) => {
  try {
    const activeRooms = await db.getActiveRoomsList();
    res.json({ success: true, rooms: activeRooms });
  } catch (err) {
    res.status(500).json({ success: false, error: "Unable to load rooms" });
  }
});

// Fallback route to serve index.html for client-side navigation. Unknown API
// routes get a JSON 404 instead of the app shell.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: "Not found" });
  }
  if (req.method === "GET") {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  } else {
    next();
  }
});

// JSON error handler: never leak stack traces or internal error details.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("[HTTP] Unhandled request error:", err.message);
  const status = err && err.status ? err.status : 500;
  res.status(status).json({
    success: false,
    error: status === 400 ? "Invalid request" : "Server error"
  });
});

// ============================================================================
// AUTHORITATIVE MULTIPLAYER GAME STATE & ROOM MANAGER
// ============================================================================
const ROLES = ["commander", "engineer", "scientist"];
const MAX_PLAYERS = 6;
const GAME_MODE = "coop";
const SUIT_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#06b6d4", "#a855f7"];

function normalizeRoleId(rawRole, fallback = "commander") {
  const s = String(rawRole || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!s) return fallback;
  if (s === "commander" || s === "cmd" || s.includes("commander") || s.includes("pilot")) {
    return "commander";
  }
  if (s === "engineer" || s === "eng" || s === "pwr" || s.includes("engineer")) {
    return "engineer";
  }
  if (
    s === "scientist" ||
    s === "sci" ||
    s === "lss" ||
    s.includes("scien") ||
    s.includes("payload") ||
    s.includes("eclss")
  ) {
    return "scientist";
  }
  return fallback;
}

// Allow-listed crew expressions (validated server-side before relaying).
const EMOTE_IDS = new Set(["wave", "salute", "dance", "laugh", "look", "heart"]);

// The seven station objectives shown on the shared co-op flight plan.
// Side activities (satellite deploys, planet charting) still grant career
// stats but must not advance or complete the shared mission track.
//
// The dependency graph intentionally opens three parallel tracks after the
// mission charter so a six-person crew can split across rooms instead of
// queueing behind a single console.
const MISSION_OBJECTIVES = [
  {
    id: "task_antenna",
    title: "Mission Charter & Crew Roles",
    room: "HUB",
    role: "commander",
    dependsOn: []
  },
  {
    id: "task_nav",
    title: "Trajectory & Launch Compatibility",
    room: "CMD",
    role: "commander",
    dependsOn: ["task_antenna"]
  },
  {
    id: "task_wires",
    title: "Power, Solar Array & Battery Sizing",
    room: "PWR",
    role: "engineer",
    dependsOn: ["task_antenna"]
  },
  {
    id: "task_science",
    title: "Science Instruments & Payload",
    room: "SCI",
    role: "scientist",
    dependsOn: ["task_antenna"]
  },
  {
    id: "task_hull",
    title: "Comms, Propulsion & Hull Systems",
    room: "HULL",
    role: "engineer",
    dependsOn: ["task_nav", "task_wires"]
  },
  {
    id: "task_lss",
    title: "Thermal, Radiation & ECLSS",
    room: "LSS",
    role: "scientist",
    dependsOn: ["task_wires", "task_science"]
  },
  {
    id: "task_landing",
    title: "Full Mission Simulation & Descent",
    room: "LDR",
    role: "all",
    dependsOn: ["task_hull", "task_lss"]
  }
];

const COOP_OBJECTIVE_IDS = new Set(MISSION_OBJECTIVES.map((o) => o.id));

const MISSION_CATALOG = {
  lunar_south_pole: {
    id: "lunar_south_pole",
    name: "Artemis Lunar South Pole Volatiles Orbiter",
    code: "ARTEMIS-LSP",
    badge: "LUNAR EXPLORATION",
    summary: "Map water-ice deposits inside permanently shadowed craters and characterize landing hazards for crewed Artemis surface missions."
  },
  earth_climate: {
    id: "earth_climate",
    name: "Earth Climate & Cryosphere Observatory",
    code: "EARTH-EO",
    badge: "EARTH OBSERVATION",
    summary: "Monitor polar ice sheet mass balance, sea-surface height, and greenhouse gas columns with global sun-synchronous coverage."
  },
  asteroid_rendezvous: {
    id: "asteroid_rendezvous",
    name: "Near-Earth Asteroid (Bennu/Apophis) Rendezvous",
    code: "NEA-PROBE",
    badge: "DEEP SPACE",
    summary: "Rendezvous with a carbon-rich Near-Earth Asteroid to map regolith composition, gravity anomalies, and orbital drift."
  },
  space_telescope: {
    id: "space_telescope",
    name: "Deep-Space Infrared & Exoplanet Observatory",
    code: "COSMOS-L2",
    badge: "ASTROPHYSICS",
    summary: "Couple science targets to wavelength bands, cryo-optics, and sunshield geometry in a Sun-Earth L2 halo orbit."
  },
  cubesat_101: {
    id: "cubesat_101",
    name: "CSLI 6U/12U CubeSat 101 Pathfinder",
    code: "CUBESAT-101",
    badge: "SMALLSAT / CSLI",
    summary: "Design a mass-constrained university CubeSat from ConOps through ISS/rideshare deployment and 5-year deorbit compliance."
  },
  sandbox: {
    id: "sandbox",
    name: "Open Engineering Sandbox (Custom Mission)",
    code: "SANDBOX",
    badge: "UNCONSTRAINED LAB",
    summary: "Experiment freely with spacecraft buses, instruments, launchers, and orbital regimes without strict budget caps."
  }
};

const DIFFICULTY_IDS = new Set(["cadet", "engineer", "director"]);
const MISSION_DESIGN_KEYS = new Set([
  "scenarioId",
  "difficultyId",
  "orbitId",
  "launchVehicleId",
  "busId",
  "powerId",
  "batteryId",
  "instruments",
  "thermalId",
  "commsId",
  "groundNetId",
  "propulsionId",
  "wavelengthId",
  "disposalId",
  "cubesatFormId"
]);


const ROLE_INFO = {
  commander: {
    id: "commander",
    short: "CMD",
    title: "Commander",
    callsign: "FLIGHT-CDR",
    color: "#c67979",
    primaryDuty: "Initiate Liftoff [L], Pilot Orbital Docking [WASD/QE] & Charter/Navigation Consoles [HUB, CMD]",
    padDuty: "Board White Room & Initiate Liftoff [L]",
    dockDuty: "Primary 6DOF Docking Pilot & Capture Latch [SPACE]",
    stationRooms: ["HUB", "CMD", "LDR"]
  },
  engineer: {
    id: "engineer",
    short: "ENG",
    title: "Flight Engineer",
    callsign: "SYSTEMS-ENG",
    color: "#d0a15c",
    primaryDuty: "Operate Pad Access Arm [F], Stabilize Docking RCS [1/2] & Power/Hull Consoles [PWR, HULL]",
    padDuty: "Extend & Lock Orbiter Access Arm [F]",
    dockDuty: "RCS Attitude Stabilizer [1] & Fine Trim [2]",
    stationRooms: ["PWR", "HULL", "LDR"]
  },
  scientist: {
    id: "scientist",
    short: "SCI",
    title: "Science Officer",
    callsign: "PAYLOAD-SCI",
    color: "#83a896",
    primaryDuty: "White Room Bio-Check, Boresight Lidar Telemetry [3/4] & Science/ECLSS Consoles [SCI, LSS]",
    padDuty: "Complete White Room Ingress & Bio-Check",
    dockDuty: "Boresight Auto-Align [3] & Corridor Telemetry Ping [4]",
    stationRooms: ["SCI", "LSS", "LDR"]
  }
};

function pickBalancedRoleForRoom(room, requestedRole, explicitRole = false) {
  const normalized = normalizeRoleId(requestedRole, "");
  if (explicitRole && normalized && ROLES.includes(normalized)) {
    return normalized;
  }

  const counts = { commander: 0, engineer: 0, scientist: 0 };
  if (room && room.players) {
    Object.values(room.players).forEach((p) => {
      const r = normalizeRoleId(p && p.role, "commander");
      counts[r] = (counts[r] || 0) + 1;
    });
  }

  if (normalized && counts[normalized] === 0) {
    return normalized;
  }

  let bestRole = ROLES[0];
  let bestCount = Infinity;
  for (const r of ROLES) {
    if (counts[r] < bestCount) {
      bestCount = counts[r];
      bestRole = r;
    }
  }
  return bestRole;
}

function buildRoomRoleSummary(room) {
  const summary = {
    commander: [],
    engineer: [],
    scientist: []
  };
  if (room && room.players) {
    Object.values(room.players).forEach((p) => {
      const r = normalizeRoleId(p && p.role, "commander");
      summary[r].push(p.id);
    });
  }
  return summary;
}

function resolveDockingPilotId(room) {
  if (!room || !room.players) return null;
  const players = Object.values(room.players);
  if (players.length === 0) return null;
  const current = room.systems && room.systems.dockingPilotId;
  if (current && room.players[current]) return current;
  const cmd = players.find((p) => normalizeRoleId(p.role) === "commander");
  if (cmd) return cmd.id;
  if (room.hostId && room.players[room.hostId]) return room.hostId;
  return players[0].id;
}

const rooms = {};

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

function groundSpawnFor(index = 0) {
  // Matches SpaceCenterManager._groundSpawnForIndex on the LC-39A gantry deck.
  // Positioned east of tower columns (x > -28) and safely clear (>2.7m) of the
  // Arm Control proximity trigger at (-25.9, -6.3) so joining slots never
  // accidentally auto-lock the access arm on spawn.
  const slots = [
    [-25.8, 64.1, -9.0],
    [-26.8, 64.1, -9.0],
    [-25.8, 64.1, -10.3],
    [-26.8, 64.1, -10.3],
    [-25.8, 64.1, -11.6],
    [-26.8, 64.1, -11.6]
  ];
  return slots[index % slots.length].slice();
}

function stationSpawnFor(index = 0) {
  // Unique berths around the Transit Hub holotable inside the station.
  const slots = [
    [0.0, 0.0, 2.2],
    [-2.4, 0.0, 2.4],
    [2.4, 0.0, 2.4],
    [-2.4, 0.0, 0.0],
    [2.4, 0.0, 0.0],
    [0.0, 0.0, -2.6]
  ];
  return slots[index % slots.length].slice();
}

function spawnForRoomPhase(room, index = 0) {
  const phase = room && room.mission ? room.mission.phase : "gantry";
  if (phase === "station" || phase === "docking") {
    return stationSpawnFor(index);
  }
  return groundSpawnFor(index);
}

// Shared mission state. Every client renders the same phase, objective chain
// and mission design, so late joiners and astronauts who board at different
// times stay in lockstep.
function createMissionState(scenarioId = "lunar_south_pole", difficultyId = "engineer") {
  const scenario = MISSION_CATALOG[scenarioId] ? scenarioId : "lunar_south_pole";
  const difficulty = DIFFICULTY_IDS.has(difficultyId) ? difficultyId : "engineer";
  const now = Date.now();
  return {
    phase: "gantry", // gantry -> launch -> docking -> station
    dockLocked: false,
    boarded: {}, // socketId -> timestamp
    skipVotes: {}, // socketId -> true (launch cutscene skip readiness)
    launchedBy: null,
    dockedBy: null,
    phaseStartedAt: now,
    updatedAt: now,
    scenarioId: scenario,
    difficultyId: difficulty,
    seed: Math.floor(Math.random() * 1000000000),
    status: "active", // active | complete
    completed: {}, // objectiveId -> socketId
    design: null, // shared subsystem selections committed by consoles
    startedAt: null,
    completedAt: null
  };
}

function completedMissionObjectiveIds(mission) {
  return Object.keys((mission && mission.completed) || {});
}

function availableMissionObjectiveIds(mission) {
  const completed = new Set(completedMissionObjectiveIds(mission));
  return MISSION_OBJECTIVES
    .filter((objective) =>
      !completed.has(objective.id) &&
      objective.dependsOn.every((dependency) => completed.has(dependency))
    )
    .map((objective) => objective.id);
}

function isMissionComplete(mission) {
  return MISSION_OBJECTIVES.every((objective) => mission && mission.completed && mission.completed[objective.id]);
}

function sanitizeDesignPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const clean = {};
  for (const key of Object.keys(patch)) {
    if (!MISSION_DESIGN_KEYS.has(key)) continue;
    const value = patch[key];
    if (key === "instruments") {
      if (Array.isArray(value)) {
        clean[key] = value
          .filter((item) => typeof item === "string")
          .map((item) => item.slice(0, 48))
          .slice(0, 8);
      }
    } else if (typeof value === "string" && value.length <= 64) {
      clean[key] = value;
    }
  }
  return Object.keys(clean).length ? clean : null;
}

function serializeMission(mission) {
  const m = mission || createMissionState();
  const scenario = MISSION_CATALOG[m.scenarioId] || MISSION_CATALOG.lunar_south_pole;
  return {
    phase: m.phase,
    dockLocked: !!m.dockLocked,
    boarded: Object.keys(m.boarded || {}),
    skipVotes: Object.keys(m.skipVotes || {}),
    launchedBy: m.launchedBy || null,
    dockedBy: m.dockedBy || null,
    dockingPilotId: m.dockingPilotId || null,
    phaseStartedAt: m.phaseStartedAt || null,
    updatedAt: m.updatedAt || null,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioCode: scenario.code,
    scenarioBadge: scenario.badge,
    scenarioSummary: scenario.summary,
    difficultyId: m.difficultyId || "engineer",
    seed: m.seed || 0,
    status: m.status || "active",
    objectives: MISSION_OBJECTIVES,
    completedObjectives: completedMissionObjectiveIds(m),
    availableObjectives: availableMissionObjectiveIds(m),
    design: m.design || null,
    startedAt: m.startedAt || null,
    completedAt: m.completedAt || null
  };
}

function buildMissionDebrief(room) {
  const mission = room.mission || createMissionState();
  const scenario = MISSION_CATALOG[mission.scenarioId] || MISSION_CATALOG.lunar_south_pole;
  const players = Object.values(room.players);
  const nameFor = (socketId) => {
    const player = socketId ? room.players[socketId] : null;
    return player ? player.name : null;
  };
  const now = Date.now();
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioCode: scenario.code,
    scenarioBadge: scenario.badge,
    difficultyId: mission.difficultyId || "engineer",
    durationMs: mission.startedAt ? Math.max(0, now - mission.startedAt) : 0,
    completedObjectives: completedMissionObjectiveIds(mission),
    totalObjectives: MISSION_OBJECTIVES.length,
    crew: players.map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
      tasksDone: player.tasksDone || 0
    })),
    launchedBy: nameFor(mission.launchedBy),
    dockedBy: nameFor(mission.dockedBy),
    completedAt: mission.completedAt || now
  };
}

function broadcastMissionUpdate(room, extra = {}) {
  const payload = {
    roomId: room.id,
    mission: serializeMission(room.mission),
    ...extra
  };
  io.to(room.id).emit("mission_update", payload);
  return payload;
}

function createNewRoom(roomId, hostId, isPublic = true) {
  return {
    id: roomId,
    hostId: hostId,
    mode: GAME_MODE,
    maxPlayers: MAX_PLAYERS,
    status: "lobby", // 'lobby' or 'playing'
    isPublic: !!isPublic,
    createdAt: Date.now(),
    players: {}, // socketId -> playerObj
    roles: {}, // informational only; co-op allows duplicate roles
    completedTaskIds: {}, // taskId -> socketId, prevents double-counting shared objectives
    systems: {
      hull: 100.0,
      oxygen: 100.0,
      reactorTemp: 35.0,
      coolantPumps: 2,
      powerGrid: { engines: 35, shields: 35, lifeSupport: 20, sensors: 10 },
      quantumGateCharge: 0.0,
      docking: { range: 18.5, velocity: 0.30, alignment: 3.5, latchesLocked: false },
      dockingPilotId: hostId || null,
      dockingState: null,
      crisis: null // null | 'reactor_meltdown' | 'hull_breach' | 'meteor_storm'
    },
    tasks: {
      completed: 0,
      total: COOP_OBJECTIVE_IDS.size
    },
    mission: createMissionState(),
    chatHistory: []
  };
}

// Global server loop (5 Hz). Systems telemetry does not need 10 Hz updates,
// and halving the broadcast volume reduces socket queueing latency for
// movement and voice packets.
setInterval(() => {
  const now = Date.now();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const playerCount = Object.keys(room.players).length;

    // Prune stale empty rooms after 30 minutes
    if (playerCount === 0 && now - room.createdAt > 1800000) {
      delete rooms[roomId];
      continue;
    }

    if (room.status !== "playing" || playerCount === 0) continue;

    const sys = room.systems;

    // Environmental oxygen drain (per 5 Hz tick)
    sys.oxygen = Math.max(0, Math.min(100, sys.oxygen - 0.04));

    // Reactor thermals
    if (sys.reactorTemp > 85) {
      sys.hull = Math.max(0, sys.hull - 0.12);
    }

    // Docking drift
    if (sys.docking.range > 0.05 && !sys.docking.latchesLocked) {
      sys.docking.range = Math.max(0, sys.docking.range - sys.docking.velocity * 0.02);
    }

    // Broadcast authoritative state. Volatile packets are dropped rather than
    // queued when a client socket is congested; the next 5 Hz snapshot repairs
    // the state, preventing a backlog from inflating ping.
    io.to(roomId).volatile.emit("state_sync", {
      systems: sys,
      tasks: room.tasks,
      status: room.status
    });
  }
}, 200);

function serializePlayer(player) {
  const { userId, ...publicPlayer } = player || {};
  return publicPlayer;
}

function serializeRoom(room) {
  room.roles = buildRoomRoleSummary(room);
  if (room.systems) {
    room.systems.dockingPilotId = resolveDockingPilotId(room);
  }
  return {
    id: room.id,
    hostId: room.hostId,
    mode: room.mode || GAME_MODE,
    maxPlayers: room.maxPlayers || MAX_PLAYERS,
    status: room.status,
    players: Object.values(room.players).map(serializePlayer),
    roles: room.roles,
    roleInfo: ROLE_INFO,
    systems: room.systems,
    tasks: room.tasks,
    mission: serializeMission(room.mission)
  };
}

function broadcastRoomUpdate(room) {
  io.to(room.id).emit("room_update", {
    roomId: room.id,
    ...serializeRoom(room)
  });
}

// ============================================================================
// SOCKET.IO AUTHENTICATION & RATE LIMITING
// ============================================================================
io.use(async (socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  const user = token ? await db.resolveSessionUser(String(token)) : null;
  if (user) {
    socket.userId = user.id;
    socket.authUser = user;
    socket.isAuthenticated = true;
  } else {
    // Guests get a server-assigned, socket-scoped identity. Client-supplied
    // IDs are never trusted for persistent identity or stats.
    socket.userId = `guest_${socket.id}`;
    socket.isAuthenticated = false;
  }

  let windowStart = Date.now();
  let windowCount = 0;
  socket.use((packet, nextEvent) => {
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      windowCount = 0;
    }
    windowCount += 1;
    if (windowCount > 80) {
      return nextEvent(new Error("rate limited"));
    }
    nextEvent();
  });

  next();
});

// ============================================================================
// SOCKET.IO EVENT HANDLERS (NASA ISS ROOM SYSTEM + DB PERSISTENCE)
// ============================================================================
io.on("connection", (socket) => {
  let currentRoomId = null;

  // Normalize socket payloads so null/undefined primitives can never throw.
  const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

  // Latency & Ping Heartbeat
  socket.on("client_ping", (clientTime, callback) => {
    if (typeof callback === "function") callback(Date.now());
  });

  // 0. User Profile Sync & Identification (server-assigned identity only)
  socket.on("sync_user", async (data = {}, callback) => {
    data = asObject(data);
    let user;
    if (socket.isAuthenticated) {
      user = socket.authUser || await db.getUserById(socket.userId);
    } else {
      const name = String(data.playerName || "Astronaut").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 16) || "Astronaut";
      const color = /^#[0-9a-fA-F]{6}$/.test(data.suitColor) ? data.suitColor : "#ef4444";
      const role = normalizeRoleId(data.role, "commander");
      // Guests are session-only; do not grow persistent user tables.
      user = {
        id: socket.userId,
        username: name,
        suit_color: color,
        preferred_role: role,
        games_played: 0,
        games_won: 0,
        tasks_completed: 0,
        isGuest: true
      };
    }
    if (typeof callback === "function") callback({ success: true, user });
    socket.emit("user_synced", user);
  });

  // Shared room entry points (used by both explicit codes and quick-play)
  async function createRoomForSocket(data = {}, callback) {
    data = asObject(data);
    const now = Date.now();
    if (socket.lastRoomActionAt && now - socket.lastRoomActionAt < 1000) {
      const err = { success: false, message: "Please wait before creating another room." };
      if (typeof callback === "function") callback(err);
      return;
    }
    socket.lastRoomActionAt = now;
    if (Object.keys(rooms).length > 5000) {
      const err = { success: false, message: "Server is at room capacity. Try again shortly." };
      if (typeof callback === "function") callback(err);
      return;
    }

    if (currentRoomId) {
      await handlePlayerLeave(false);
    }

    const roomId = generateRoomCode();
    const room = createNewRoom(roomId, socket.id, data.isPublic !== false);
    rooms[roomId] = room;
    currentRoomId = roomId;
    socket.join(roomId);

    const userId = socket.userId;

    const requestedRole = normalizeRoleId(
      data.role || (socket.authUser && (socket.authUser.preferred_role || socket.authUser.flight_title)),
      "commander"
    );
    const playerRole = ROLES.includes(requestedRole) ? requestedRole : "commander";
    const rawColor = data.suitColor || data.color;
    const requestedColor = /^#[0-9a-fA-F]{6}$/.test(rawColor)
      ? rawColor
      : (socket.authUser && /^#[0-9a-fA-F]{6}$/.test(socket.authUser.suit_color) ? socket.authUser.suit_color : null);
    const color = requestedColor || SUIT_COLORS[0];

    const player = {
      id: socket.id,
      userId: userId,
      name: String(data.playerName || data.name || "Host").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 16) || "Astronaut 1",
      color: color,
      role: playerRole,
      team: "crew",
      isHost: true,
      ready: true,
      pos: groundSpawnFor(0),
      yaw: 0,
      pitch: 0,
      isEva: false,
      suitLights: true,
      tasksDone: 0
    };

    room.players[socket.id] = player;

    console.log(`[ROOM] Created 6-player co-op room ${roomId} by ${player.name} (${playerRole}, user: ${userId}, socket: ${socket.id})`);

    // Persist authenticated profiles only; guest identities stay session-only.
    await db.upsertGameRoom(roomId, userId, "lobby", 7, data.isPublic !== false);
    if (socket.isAuthenticated) {
      await db.getOrCreateUser(userId, player.name, player.color, player.role);
      await db.upsertRoomMember(roomId, userId, socket.id, player);
    }

    const payload = {
      success: true,
      roomId: roomId,
      hostId: socket.id,
      player: player,
      room: serializeRoom(room)
    };

    if (typeof callback === "function") callback(payload);
    socket.emit("room_created", payload);
    broadcastRoomUpdate(room);
  }

  async function joinRoomForSocket(targetCode, data = {}, callback) {
    data = asObject(data);
    const now = Date.now();
    if (socket.lastRoomActionAt && now - socket.lastRoomActionAt < 500) {
      const err = { success: false, message: "Please wait before joining another room." };
      if (typeof callback === "function") callback(err);
      return;
    }
    socket.lastRoomActionAt = now;

    const targetRoom = rooms[targetCode];

    if (!targetRoom) {
      const err = { success: false, message: `Room "${targetCode}" does not exist. Check the code and try again!` };
      if (typeof callback === "function") callback(err);
      socket.emit("join_error", err);
      return;
    }

    if (currentRoomId && currentRoomId !== targetCode) {
      await handlePlayerLeave(false);
    }

    const room = targetRoom;

    if (Object.keys(room.players).length === 0) {
      room.hostId = socket.id;
      room.status = "lobby";
      room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
      room.completedTaskIds = {};
      room.mission = createMissionState();
      await db.upsertGameRoom(targetCode, socket.userId, "lobby");
    } else if (!room.players[room.hostId]) {
      room.hostId = socket.id;
    }

    if (Object.keys(room.players).length >= MAX_PLAYERS && !room.players[socket.id]) {
      const err = { success: false, message: `Room "${targetCode}" is already full (${MAX_PLAYERS}/${MAX_PLAYERS} astronauts in the co-op crew)!` };
      if (typeof callback === "function") callback(err);
      socket.emit("join_error", err);
      return;
    }

    const userId = socket.userId;

    currentRoomId = targetCode;
    socket.join(targetCode);

    // Co-op crew: auto-balance unspecialized joiners across CMD / ENG / SCI so
    // a multi-player crew starts with full coverage, while preserving explicit
    // role choices from authenticated profiles or Lobby/Dossier selections.
    const authPref = socket.authUser ? normalizeRoleId(socket.authUser.preferred_role || socket.authUser.flight_title, "") : "";
    const reqRoleRaw = data.role ? normalizeRoleId(data.role, "") : authPref;
    const isExplicitRole = !!(data.explicitRole || (socket.isAuthenticated && authPref && authPref !== "commander"));
    const role = pickBalancedRoleForRoom(room, reqRoleRaw, isExplicitRole);

    // Pick a unique suit color across the whole crew.
    const rawJoinColor = data.suitColor || data.color;
    const requestedColor = /^#[0-9a-fA-F]{6}$/.test(rawJoinColor)
      ? rawJoinColor
      : (socket.authUser && /^#[0-9a-fA-F]{6}$/.test(socket.authUser.suit_color) ? socket.authUser.suit_color : null);
    const takenColors = Object.values(room.players).map(p => p.color);
    const color = requestedColor && !takenColors.includes(requestedColor)
      ? requestedColor
      : (SUIT_COLORS.find(c => !takenColors.includes(c)) || SUIT_COLORS[0]);

    const player = {
      id: socket.id,
      userId: userId,
      name: String(data.playerName || data.name || `Crew ${Object.keys(room.players).length + 1}`).replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 16) || "Astronaut",
      color: color,
      role: role,
      team: "crew",
      isHost: room.hostId === socket.id,
      ready: false,
      pos: spawnForRoomPhase(room, Object.keys(room.players).length),
      yaw: (!room.mission || room.mission.phase === "gantry" || room.mission.phase === "launch")
        ? 0
        : Math.PI,
      pitch: 0,
      isEva: false,
      suitLights: true,
      tasksDone: 0
    };

    room.players[socket.id] = player;
    // Late joiners during ascent/docking/station are already part of the
    // in-flight crew; record them as aboard so shared boarding state matches.
    if (room.mission && room.mission.phase !== "gantry") {
      room.mission.boarded[socket.id] = Date.now();
      room.mission.updatedAt = Date.now();
    }
    console.log(`[ROOM] ${player.name} joined co-op room ${targetCode} as ${role} (${Object.keys(room.players).length}/${MAX_PLAYERS})`);

    // Persist authenticated profiles only; guest identities stay session-only.
    if (socket.isAuthenticated) {
      await db.getOrCreateUser(userId, player.name, player.color, player.role);
      await db.upsertRoomMember(targetCode, userId, socket.id, player);
    }

    const payload = {
      success: true,
      roomId: targetCode,
      hostId: room.hostId,
      player: player,
      room: serializeRoom(room)
    };

    if (typeof callback === "function") callback(payload);
    socket.emit("room_joined", payload);
    broadcastRoomUpdate(room);
  }

  // 1. Host creates a new room with a freshly generated expedition code
  socket.on("create_room", (data = {}, callback) => createRoomForSocket(data, callback));

  // 2. Join an existing room via Code (6-player co-op crew)
  socket.on("join_room", (data = {}, callback) => {
    data = asObject(data);
    const targetCode = String(data.roomId || "").trim().toUpperCase().slice(0, 16);
    return joinRoomForSocket(targetCode, data, callback);
  });

  // 2b. Quick play: fill an open public crew, otherwise create a fresh room.
  // Each newly created room gets a brand-new random expedition code.
  socket.on("quick_play", (data = {}, callback) => {
    const openRooms = Object.values(rooms)
      .filter((room) =>
        room.isPublic &&
        (room.status === "lobby" || room.status === "playing") &&
        Object.keys(room.players).length > 0 &&
        Object.keys(room.players).length < MAX_PLAYERS
      )
      .sort((a, b) =>
        Object.keys(b.players).length - Object.keys(a.players).length ||
        b.createdAt - a.createdAt
      );

    if (openRooms.length > 0) {
      return joinRoomForSocket(openRooms[0].id, data, callback);
    }

    return createRoomForSocket(data, callback);
  });

  // 3. Customize Astronaut in Lobby (co-op: roles may repeat)
  socket.on("customize_astronaut", async (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const player = room.players[socket.id];
    if (!player) return;

    if (data.name) player.name = String(data.name).replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 16) || player.name;
    if (/^#[0-9a-fA-F]{6}$/.test(data.color)) player.color = data.color;
    if (data.modelId) player.modelId = String(data.modelId).trim().slice(0, 64);
    if (data.role) {
      const nextRole = normalizeRoleId(data.role, "");
      if (nextRole && ROLES.includes(nextRole)) {
        player.role = nextRole;
        if (room.mission && room.mission.phase !== "docking") {
          room.systems.dockingPilotId = null;
          room.systems.dockingPilotId = resolveDockingPilotId(room);
        }
      }
    }

    if (typeof data.ready === "boolean") player.ready = data.ready;

    // Update in Database only for authenticated profiles.
    if (socket.isAuthenticated) {
      await db.updateUserProfile(socket.userId, {
        callsign: player.name,
        suit_color: player.color,
        preferred_role: player.role
      });
      await db.upsertRoomMember(currentRoomId, socket.userId, socket.id, player);
    }

    broadcastRoomUpdate(room);
  });

  // 3b. Crew emote relay (rate-limited, validated expressions only)
  socket.on("player_emote", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const player = room.players[socket.id];
    if (!player) return;

    const emoteId = String(data.emoteId || "").trim().toLowerCase();
    if (!EMOTE_IDS.has(emoteId)) return;

    const now = Date.now();
    if (socket.lastEmoteAt && now - socket.lastEmoteAt < 450) return;
    socket.lastEmoteAt = now;

    socket.to(currentRoomId).emit("emote_broadcast", {
      id: socket.id,
      name: player.name,
      emoteId: emoteId
    });
  });

  // 3d. Host selects the expedition scenario and difficulty in the lobby.
  socket.on("select_mission", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.hostId !== socket.id) return;
    if (room.status === "playing" || room.status === "victory") return;

    room.mission = room.mission || createMissionState();
    if (data.scenarioId && MISSION_CATALOG[data.scenarioId]) {
      room.mission.scenarioId = data.scenarioId;
    }
    if (data.difficultyId && DIFFICULTY_IDS.has(data.difficultyId)) {
      room.mission.difficultyId = data.difficultyId;
    }
    room.mission.updatedAt = Date.now();

    const player = room.players[socket.id];
    broadcastMissionUpdate(room, {
      action: "mission_select",
      playerId: socket.id,
      playerName: player ? player.name : null
    });
    broadcastRoomUpdate(room);
  });

  // 4. Host starts the game
  socket.on("start_game", async () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (!room.players[room.hostId] && room.players[socket.id]) {
      room.hostId = socket.id;
      room.players[socket.id].isHost = true;
    }
    if (room.hostId !== socket.id) return;
    if (room.status === "playing") return;

    const scenarioId = (room.mission && room.mission.scenarioId) || "lunar_south_pole";
    const difficultyId = (room.mission && room.mission.difficultyId) || "engineer";

    room.status = "playing";
    room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
    room.completedTaskIds = {};
    room.mission = createMissionState(scenarioId, difficultyId);
    room.mission.startedAt = Date.now();
    room.systems.docking = { range: 18.5, velocity: 0.30, alignment: 3.5, latchesLocked: false };
    room.systems.dockingState = null;
    room.systems.dockingPilotId = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;
    Object.keys(room.players).forEach((pid, index) => {
      const player = room.players[pid];
      player.tasksDone = 0;
      player.pos = groundSpawnFor(index);
      player.yaw = 0;
      player.pitch = 0;
      player.isEva = false;
    });
    console.log(`[GAME] Co-op expedition ${room.mission.scenarioId} (${room.mission.difficultyId}) started in room ${currentRoomId} by host!`);

    // Update Room State in DB
    await db.upsertGameRoom(currentRoomId, room.hostId, "playing");

    // Increment games_played stat for authenticated players only.
    for (const pid in room.players) {
      const memberSocket = io.sockets.sockets.get(pid);
      const p = room.players[pid];
      if (p.userId && memberSocket && memberSocket.isAuthenticated) {
        db.incrementUserStats(p.userId, { gamesPlayed: 1 });
      }
    }

    io.to(currentRoomId).emit("game_started", {
      roomId: currentRoomId,
      mode: GAME_MODE,
      maxPlayers: MAX_PLAYERS,
      players: Object.values(room.players).map(serializePlayer),
      systems: room.systems,
      tasks: room.tasks,
      mission: serializeMission(room.mission)
    });
    // Keep roomState.status in sync ("playing") so proximity voice and HUD
    // states activate immediately for every client, including late joiners.
    broadcastRoomUpdate(room);
  });

  // 5. In-Game Movement Update
  socket.on("player_update", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;

    if (Array.isArray(data.pos) && data.pos.length === 3) {
      const pos = data.pos.map(Number);
      if (pos.every((n) => Number.isFinite(n) && Math.abs(n) < 100000)) p.pos = pos;
    }
    if (Number.isFinite(data.yaw)) p.yaw = data.yaw;
    if (Number.isFinite(data.pitch)) p.pitch = data.pitch;
    if (typeof data.isEva === "boolean") p.isEva = data.isEva;
    if (typeof data.suitLights === "boolean") p.suitLights = data.suitLights;
    if (typeof data.moving === "boolean") p.moving = data.moving;

    socket.to(currentRoomId).volatile.emit("player_moved", {
      id: socket.id,
      t: Date.now(),
      pos: p.pos,
      yaw: p.yaw,
      pitch: p.pitch,
      isEva: p.isEva,
      suitLights: p.suitLights,
      moving: p.moving
    });
  });

  // 5b. Shared launch-complex & docking mission state
  // Dock lock and mission phase are room-wide, while boarding is tracked per
  // astronaut so each player can walk the access arm and board independently.
  socket.on("space_dock", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    room.mission = room.mission || createMissionState();
    if (room.mission.phase !== "gantry") return;

    room.mission.dockLocked = typeof data.locked === "boolean"
      ? data.locked
      : !room.mission.dockLocked;
    room.mission.updatedAt = Date.now();

    broadcastMissionUpdate(room, {
      action: "dock",
      playerId: socket.id,
      playerName: p.name
    });
  });

  socket.on("space_board", () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    room.mission = room.mission || createMissionState();
    if (room.mission.phase !== "gantry") return;

    // Boarding implies the access arm is locked; accept it even if the dock
    // packet was lost or a player raced ahead of the animation.
    room.mission.dockLocked = true;
    room.mission.boarded[socket.id] = Date.now();
    room.mission.updatedAt = Date.now();

    broadcastMissionUpdate(room, {
      action: "board",
      playerId: socket.id,
      playerName: p.name
    });
  });

  socket.on("space_launch", () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    room.mission = room.mission || createMissionState();
    if (room.mission.phase !== "gantry") return;

    const now = Date.now();
    room.mission.dockLocked = true;
    // Liftoff is a shared event: strap in every connected astronaut so nobody
    // is left behind on the pad while the crew flies to orbit.
    for (const pid in room.players) {
      room.mission.boarded[pid] = now;
    }
    room.mission.phase = "launch";
    room.mission.skipVotes = {};
    room.mission.launchedBy = socket.id;
    room.systems.dockingState = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;
    room.mission.phaseStartedAt = now;
    room.mission.updatedAt = now;

    broadcastMissionUpdate(room, {
      action: "launch",
      playerId: socket.id,
      playerName: p.name
    });
  });

  function enterRoomDockingPhase(room, triggeredById) {
    const now = Date.now();
    room.mission.phase = "docking";
    room.mission.skipVotes = {};
    room.mission.phaseStartedAt = now;
    room.mission.updatedAt = now;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;
    room.systems.dockingState = {
      pos: [0, -2, -32],
      vel: [0, 0, 0],
      quat: [0, 0, 0, 1],
      angVel: [0, 0, 0],
      autoAssist: false,
      fineControl: false,
      boresightLocked: false,
      range: 32,
      rate: 0,
      alignErr: 0,
      t: now
    };
    broadcastMissionUpdate(room, {
      action: "phase",
      playerId: triggeredById || null
    });
  }

  socket.on("launch_skip_vote", () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    room.mission = room.mission || createMissionState();
    if (room.mission.phase !== "launch") return;

    room.mission.skipVotes = room.mission.skipVotes || {};
    room.mission.skipVotes[socket.id] = true;
    room.mission.updatedAt = Date.now();

    const playerIds = Object.keys(room.players);
    const voteCount = Object.keys(room.mission.skipVotes).filter((id) => room.players[id]).length;
    const majority = Math.max(1, Math.ceil(playerIds.length / 2));
    const isAuthority = socket.id === room.hostId || normalizeRoleId(p.role) === "commander";

    if (playerIds.length <= 1 || isAuthority || voteCount >= majority) {
      enterRoomDockingPhase(room, socket.id);
    } else {
      broadcastMissionUpdate(room, {
        action: "skip_vote",
        playerId: socket.id,
        playerName: p.name
      });
    }
  });

  socket.on("space_phase", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    room.mission = room.mission || createMissionState();

    if (data.phase === "docking" && room.mission.phase === "launch") {
      const playerCount = Object.keys(room.players).length;
      const elapsedMs = Date.now() - (room.mission.phaseStartedAt || 0);
      const isNaturalOrAuthority = !!data.naturalEnd || elapsedMs >= 26000 || playerCount <= 1 || socket.id === room.hostId || normalizeRoleId(p.role) === "commander";
      if (isNaturalOrAuthority) {
        enterRoomDockingPhase(room, socket.id);
      } else {
        room.mission.skipVotes = room.mission.skipVotes || {};
        room.mission.skipVotes[socket.id] = true;
        const voteCount = Object.keys(room.mission.skipVotes).filter((id) => room.players[id]).length;
        if (voteCount >= Math.max(1, Math.ceil(playerCount / 2))) {
          enterRoomDockingPhase(room, socket.id);
        } else {
          broadcastMissionUpdate(room, {
            action: "skip_vote",
            playerId: socket.id,
            playerName: p.name
          });
        }
      }
    }
  });

  socket.on("docking_pilot", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p || !room.mission || room.mission.phase !== "docking") return;

    const requestedTargetId = data.targetId || data.pilotId;
    let targetPilotId = socket.id;
    if (requestedTargetId && room.players[requestedTargetId]) {
      const canAssignOther = socket.id === room.hostId || socket.id === room.systems.dockingPilotId || normalizeRoleId(p.role) === "commander" || requestedTargetId === socket.id;
      if (canAssignOther) targetPilotId = requestedTargetId;
    }

    room.systems.dockingPilotId = targetPilotId;
    room.mission.dockingPilotId = targetPilotId;
    room.mission.updatedAt = Date.now();
    const targetPlayer = room.players[targetPilotId];

    io.to(currentRoomId).emit("docking_pilot_changed", {
      pilotId: targetPilotId,
      pilotName: targetPlayer ? targetPlayer.name : p.name,
      pilotRole: targetPlayer ? targetPlayer.role : p.role
    });
    broadcastMissionUpdate(room, {
      action: "docking_pilot",
      playerId: targetPilotId,
      playerName: targetPlayer ? targetPlayer.name : p.name
    });
  });

  socket.on("docking_sync", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (!room.players[socket.id] || !room.mission || room.mission.phase !== "docking") return;

    const activePilotId = resolveDockingPilotId(room);
    if (activePilotId && activePilotId !== socket.id) return;

    const toVec = (arr, len) => {
      if (!Array.isArray(arr) || arr.length !== len) return null;
      const out = arr.map(Number);
      return out.every((n) => Number.isFinite(n) && Math.abs(n) < 10000) ? out : null;
    };

    const pos = toVec(data.pos || data.position, 3);
    const vel = toVec(data.vel || data.velocity, 3) || [0, 0, 0];
    const quat = toVec(data.quat || data.quaternion, 4) || [0, 0, 0, 1];
    const angVel = toVec(data.angVel || data.angularVelocity, 3) || [0, 0, 0];
    if (!pos) return;

    const now = Date.now();
    const boresightVal = typeof data.boresight === "boolean" ? data.boresight : !!data.boresightLocked;
    const nextState = {
      pos,
      position: pos,
      vel,
      velocity: vel,
      quat,
      quaternion: quat,
      angVel,
      angularVelocity: angVel,
      autoAssist: !!data.autoAssist,
      fineControl: !!data.fineControl,
      boresightLocked: boresightVal,
      boresight: boresightVal,
      range: Number.isFinite(Number(data.range)) ? Number(data.range) : 0,
      rate: Number.isFinite(Number(data.rate)) ? Number(data.rate) : 0,
      alignErr: Number.isFinite(Number(data.alignErr)) ? Number(data.alignErr) : 0,
      pilotId: socket.id,
      t: now
    };
    room.systems.dockingState = nextState;
    room.systems.docking = {
      range: nextState.range,
      velocity: nextState.rate,
      alignment: nextState.alignErr,
      latchesLocked: false
    };

    socket.to(currentRoomId).volatile.emit("docking_state", nextState);
  });

  socket.on("docking_assist", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p || !room.mission || room.mission.phase !== "docking") return;

    const now = Date.now();
    if (socket.lastDockAssistAt && now - socket.lastDockAssistAt < 350) return;
    socket.lastDockAssistAt = now;

    const kind = String(data.kind || "").trim().slice(0, 32);
    if (!["rcs_stabilize", "fine_trim", "fine_toggle", "boresight", "boresight_toggle", "ping", "telemetry_ping"].includes(kind)) return;

    io.to(currentRoomId).emit("docking_assist_event", {
      kind,
      playerId: socket.id,
      playerName: p.name,
      role: p.role,
      pilotId: resolveDockingPilotId(room)
    });
  });

  socket.on("space_dock_complete", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    room.mission = room.mission || createMissionState();
    if (room.mission.phase !== "launch" && room.mission.phase !== "docking") return;

    const playerCount = Object.keys(room.players).length;
    const activePilotId = resolveDockingPilotId(room);
    const isAuthority = playerCount <= 1 || socket.id === room.hostId || socket.id === activePilotId || normalizeRoleId(p.role) === "commander" || !!data.corridorCapture;
    if (!isAuthority) {
      socket.emit("docking_assist_event", {
        kind: "dock_request",
        playerId: socket.id,
        playerName: p.name,
        role: p.role,
        pilotId: activePilotId
      });
      return;
    }

    const now = Date.now();
    room.mission.phase = "station";
    room.mission.dockedBy = socket.id;
    room.mission.phaseStartedAt = now;
    room.mission.updatedAt = now;
    for (const pid in room.players) {
      room.mission.boarded[pid] = room.mission.boarded[pid] || now;
    }
    room.systems.docking = { range: 0, velocity: 0, alignment: 0, latchesLocked: true };

    broadcastMissionUpdate(room, {
      action: "docked",
      playerId: socket.id,
      playerName: p.name
    });
  });

  // 5c. Shared crew reset back to the launch pad. This aborts any in-flight
  // ascent/docking sequence and respawns every astronaut on the gantry, so a
  // player pressing [G] or the PAD button never desyncs the rest of the room.
  socket.on("space_reset", () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;

    const now = Date.now();
    if (socket.lastMissionResetAt && now - socket.lastMissionResetAt < 1500) return;
    socket.lastMissionResetAt = now;

    const scenarioId = room.mission && room.mission.scenarioId;
    const difficultyId = room.mission && room.mission.difficultyId;
    room.mission = createMissionState(scenarioId, difficultyId);
    room.mission.updatedAt = now;
    room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
    room.completedTaskIds = {};
    room.systems.docking = { range: 18.5, velocity: 0.30, alignment: 3.5, latchesLocked: false };
    room.systems.dockingState = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;

    Object.keys(room.players).forEach((pid, index) => {
      const player = room.players[pid];
      player.tasksDone = 0;
      player.pos = groundSpawnFor(index);
      player.yaw = 0;
      player.pitch = 0;
      player.isEva = false;
    });

    broadcastMissionUpdate(room, {
      action: "reset",
      playerId: socket.id,
      playerName: p.name
    });
  });

  // 6. Complete Task (single shared co-op objective track)
  socket.on("complete_task", async (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    room.mission = room.mission || createMissionState();

    const now = Date.now();
    if (socket.lastTaskAt && now - socket.lastTaskAt < 500) return;
    socket.lastTaskAt = now;

    room.completedTaskIds = room.completedTaskIds || {};
    const taskId = String(data.taskId || `task_${room.tasks.completed + 1}`).slice(0, 64);
    const taskName = String(data.taskName || "Station Maintenance").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 64) || "Station Maintenance";
    const isMissionObjective = COOP_OBJECTIVE_IDS.has(taskId);

    room.mission.completed = room.mission.completed || {};

    // Mission objectives form a dependency graph. Reject out-of-order
    // completions so the room always advances through valid tracks.
    if (isMissionObjective) {
      const objectiveDef = MISSION_OBJECTIVES.find((objective) => objective.id === taskId);
      const completed = new Set(Object.keys(room.mission.completed));
      const missing = objectiveDef
        ? objectiveDef.dependsOn.filter((dependency) => !completed.has(dependency))
        : [];
      if (missing.length > 0) {
        socket.emit("objective_locked", {
          taskId,
          taskName,
          missing,
          mission: serializeMission(room.mission)
        });
        return;
      }
      if (taskId !== "task_antenna" && room.mission.phase !== "station") {
        socket.emit("objective_locked", {
          taskId,
          taskName,
          missing: [],
          reason: "station_phase",
          mission: serializeMission(room.mission)
        });
        return;
      }
    }

    // Merge the subsystem choices committed at this console into the shared
    // mission design before checking alreadyCompleted so crew revisions sync.
    const designPatch = sanitizeDesignPatch(data.designPatch);
    if (designPatch) {
      room.mission.design = Object.assign({}, room.mission.design || {}, designPatch);
      if (designPatch.scenarioId && MISSION_CATALOG[designPatch.scenarioId]) {
        room.mission.scenarioId = designPatch.scenarioId;
      }
      if (designPatch.difficultyId && DIFFICULTY_IDS.has(designPatch.difficultyId)) {
        room.mission.difficultyId = designPatch.difficultyId;
      }
      room.mission.updatedAt = now;
    }

    // The 7 objectives are shared by the whole crew, so each mission task
    // counts once no matter how many astronauts interact with the same console.
    if (isMissionObjective && (room.completedTaskIds[taskId] || room.mission.completed[taskId])) {
      if (designPatch) {
        broadcastMissionUpdate(room, {
          action: "design_revised",
          playerId: socket.id,
          playerName: p.name,
          taskId: taskId,
          taskName: taskName
        });
        io.to(currentRoomId).emit("task_completed_broadcast", {
          playerId: socket.id,
          playerName: p.name,
          team: "crew",
          taskId: taskId,
          taskName: taskName,
          countsTowardMission: false,
          design: designPatch,
          tasks: room.tasks,
          mission: serializeMission(room.mission),
          alreadyCompleted: true,
          revised: true
        });
      } else {
        socket.emit("task_completed_broadcast", {
          playerId: socket.id,
          playerName: p.name,
          team: "crew",
          taskId: taskId,
          taskName: taskName,
          tasks: room.tasks,
          mission: serializeMission(room.mission),
          alreadyCompleted: true
        });
      }
      return;
    }

    if (isMissionObjective) {
      room.completedTaskIds[taskId] = socket.id;
      room.mission.completed[taskId] = socket.id;
      room.mission.updatedAt = now;
      room.tasks.completed = Math.min(room.tasks.total, room.tasks.completed + 1);
    }

    p.tasksDone = (p.tasksDone || 0) + 1;

    // Record in DB: room_task_states table and users table stats.
    // Side activities keep their career rewards without advancing the mission.
    await db.recordRoomTaskCompletion(currentRoomId, taskId, taskName, socket.userId, p.name);
    if (socket.isAuthenticated) {
      db.incrementUserStats(socket.userId, { tasksCompleted: 1 });
    }

    if (isMissionObjective) {
      broadcastMissionUpdate(room, {
        action: "objective",
        playerId: socket.id,
        playerName: p.name,
        taskId: taskId,
        taskName: taskName
      });
    }

    io.to(currentRoomId).emit("task_completed_broadcast", {
      playerId: socket.id,
      playerName: p.name,
      team: "crew",
      taskId: taskId,
      taskName: taskName,
      countsTowardMission: isMissionObjective,
      design: designPatch,
      tasks: room.tasks,
      mission: serializeMission(room.mission)
    });

    // Victory when the whole crew has completed all shared objectives.
    if (isMissionObjective && isMissionComplete(room.mission)) {
      room.mission.status = "complete";
      room.mission.completedAt = now;
      room.mission.updatedAt = now;
      room.status = "victory";
      await db.upsertGameRoom(currentRoomId, room.hostId, "victory");

      // Increment victories for authenticated astronauts only.
      for (const pid in room.players) {
        const memberSocket = io.sockets.sockets.get(pid);
        const mem = room.players[pid];
        if (mem.userId && memberSocket && memberSocket.isAuthenticated) {
          db.incrementUserStats(mem.userId, { gamesWon: 1 });
        }
      }

      const debrief = buildMissionDebrief(room);
      io.to(currentRoomId).emit("crew_victory", {
        winningTeam: "crew",
        tasks: room.tasks,
        mission: serializeMission(room.mission),
        debrief,
        reason: `🏁 ${debrief.scenarioCode} COMPLETE — ALL ${debrief.totalObjectives} SHARED OBJECTIVES VERIFIED BY THE CREW!`
      });
      broadcastRoomUpdate(room);
    }
  });

  // 6b. Pre-flight / live MDL mission design sync (syncs trade-study parameters
  // across crewmates without bypassing objective completion gates).
  socket.on("mission_design_sync", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;

    const now = Date.now();
    if (socket.lastDesignSyncAt && now - socket.lastDesignSyncAt < 250) return;
    socket.lastDesignSyncAt = now;

    room.mission = room.mission || createMissionState();
    const designPatch = sanitizeDesignPatch(data.designPatch || data);
    if (!designPatch) return;

    room.mission.design = Object.assign({}, room.mission.design || {}, designPatch);
    if (designPatch.scenarioId && MISSION_CATALOG[designPatch.scenarioId]) {
      room.mission.scenarioId = designPatch.scenarioId;
    }
    if (designPatch.difficultyId && DIFFICULTY_IDS.has(designPatch.difficultyId)) {
      room.mission.difficultyId = designPatch.difficultyId;
    }
    room.mission.updatedAt = now;

    broadcastMissionUpdate(room, {
      action: "design_revised",
      playerId: socket.id,
      playerName: p.name
    });
  });

  // 6b. Host returns the crew to the lobby after a debrief. The room, crew and
  // socket identities are preserved so the next mission can start without a
  // page reload or a new expedition code.
  socket.on("return_to_lobby", async () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.hostId !== socket.id) return;

    const scenarioId = (room.mission && room.mission.scenarioId) || "lunar_south_pole";
    const difficultyId = (room.mission && room.mission.difficultyId) || "engineer";

    room.status = "lobby";
    room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
    room.completedTaskIds = {};
    room.mission = createMissionState(scenarioId, difficultyId);
    room.systems.docking = { range: 18.5, velocity: 0.30, alignment: 3.5, latchesLocked: false };
    room.systems.dockingState = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;

    Object.keys(room.players).forEach((pid, index) => {
      const player = room.players[pid];
      player.tasksDone = 0;
      player.pos = groundSpawnFor(index);
      player.yaw = 0;
      player.pitch = 0;
      player.isEva = false;
    });

    await db.upsertGameRoom(currentRoomId, room.hostId, "lobby");
    broadcastRoomUpdate(room);
    io.to(currentRoomId).emit("lobby_returned", {
      roomId: currentRoomId,
      hostId: room.hostId,
      room: serializeRoom(room)
    });
  });

  // 7. Crew Chat (one shared channel in co-op)
  socket.on("chat_message", async (msg) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;

    const now = Date.now();
    if (socket.lastChatAt && now - socket.lastChatAt < 250) return;
    socket.lastChatAt = now;

    const text = String((msg && msg.text) || "").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 140);
    if (!text) return;

    const comm = {
      sender: String(p.name || "Astronaut").slice(0, 16),
      color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : "#ef4444",
      role: String(p.role || "commander").slice(0, 16),
      team: "crew",
      teamOnly: false,
      text,
      timestamp: now
    };
    room.chatHistory.push(comm);
    if (room.chatHistory.length > 50) room.chatHistory.shift();

    // Persist to DB table game_chat_logs
    await db.logChatMessage(currentRoomId, comm.sender, comm.color, comm.role, comm.text);

    io.to(currentRoomId).emit("chat_broadcast", comm);
  });

  // 9. Disconnect
  async function handlePlayerLeave(isDisconnect = false) {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const leavingRoomId = currentRoomId;
    const room = rooms[leavingRoomId];
    const p = room.players[socket.id];
    currentRoomId = null;
    if (!isDisconnect) {
      socket.leave(leavingRoomId);
    }
    if (!p) return;

    delete room.players[socket.id];
    if (room.mission && room.mission.boarded) {
      delete room.mission.boarded[socket.id];
      if (room.mission.skipVotes) delete room.mission.skipVotes[socket.id];
      room.mission.updatedAt = Date.now();
    }

    const remainingIds = Object.keys(room.players);
    if (remainingIds.length === 0) {
      room.status = "lobby";
      room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
      room.completedTaskIds = {};
      room.mission = createMissionState();
      room.systems.dockingPilotId = null;
      room.systems.dockingState = null;
    } else {
      if (room.hostId === socket.id) {
        room.hostId = remainingIds[0];
        room.players[remainingIds[0]].isHost = true;
        db.upsertGameRoom(leavingRoomId, room.players[remainingIds[0]].userId || remainingIds[0], room.status).catch(() => {});
      }
      if (room.systems && room.systems.dockingPilotId === socket.id) {
        room.systems.dockingPilotId = null;
        const nextPilotId = resolveDockingPilotId(room);
        room.systems.dockingPilotId = nextPilotId;
        if (room.mission) room.mission.dockingPilotId = nextPilotId;
        const nextPilot = nextPilotId ? room.players[nextPilotId] : null;
        if (nextPilot) {
          socket.to(leavingRoomId).emit("docking_pilot_changed", {
            pilotId: nextPilotId,
            pilotName: nextPilot.name,
            pilotRole: nextPilot.role
          });
        }
      }
    }

    broadcastRoomUpdate(room);
    socket.to(leavingRoomId).emit("player_left", { id: socket.id, name: p.name });
    socket.to(leavingRoomId).emit("voice_peer_left", { id: socket.id });

    // Remove from DB room_members table after updating in-memory room state.
    if (socket.isAuthenticated && socket.userId) {
      await db.removeRoomMember(leavingRoomId, socket.userId);
    }
  }

  // 8. Voluntary Leave Room
  socket.on("leave_room", async (callback) => {
    await handlePlayerLeave(false);
    if (typeof callback === "function") callback({ success: true });
  });

  // 9. Disconnect
  socket.on("disconnect", async () => {
    await handlePlayerLeave(true);
  });
});

// Initialize database and boot HTTP/Socket server
db.initDatabase()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Interfellas NASA ISS Expedition 3D Simulator online on port ${PORT}`);
      console.log(`📦 Railway Object Storage: ${storage.isConfigured() ? 'Active (' + storage.bucket + ')' : 'Local Disk Mode'}`);

      // Auto-populate Railway Bucket in background if configured
      if (storage.isConfigured()) {
        syncAssetsToBucket().catch(err => console.warn('[STORAGE] Background sync notice:', err.message));
      }
    });
  })
  .catch((err) => {
    console.error("[DB] Fatal error during database startup:", err);
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Interfellas server online on port ${PORT} (fallback mode)`);
      console.log(`📦 Railway Object Storage: ${storage.isConfigured() ? 'Active (' + storage.bucket + ')' : 'Local Disk Mode'}`);

      // Auto-populate Railway Bucket in background if configured
      if (storage.isConfigured()) {
        syncAssetsToBucket().catch(err => console.warn('[STORAGE] Background sync notice:', err.message));
      }
    });
  });
