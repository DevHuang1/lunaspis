const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");
const db = require("./server/db");
const storage = require("./server/storage");
const { MISSION_DESIGN_KEYS, sanitizeDesignPatch } = require("./server/design_sanitizer");
const { ShuttleMission, CREW: SHUTTLE_CREW } = require("./public/js/game/shuttle_mission.js");

const SHUTTLE_SNAPSHOT_HZ = 15;
const SHUTTLE_TEST_HOOKS = process.env.SHUTTLE_TEST === "1";
const VALID_OPS_MODES = new Set(["iss_expedition", "shuttle_flight"]);

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
const ROLES = [
  "flight_director",
  "ground_capcom",
  "commander",
  "engineer",
  "scientist",
  "specialist"
];
const GROUND_ROLES = ["flight_director", "ground_capcom"];
const FLIGHT_ROLES = ["commander", "engineer", "scientist", "specialist"];
const GROUND_SLOT_SCHEDULE = { 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2 };
const MAX_PLAYERS = 6;
const GAME_MODE = "coop";
const SUIT_COLORS = ["#67e8f9", "#d0a15c", "#7fb8a6", "#c08a8a", "#9a8fc4", "#f8fafc"];

function getTeamForRole(roleId) {
  return GROUND_ROLES.includes(roleId) ? "ground" : "crew";
}

function normalizeRoleId(rawRole, fallback = "commander") {
  const s = String(rawRole || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!s) return fallback;
  if (s === "flight director" || s === "fdir" || s.includes("director")) {
    return "flight_director";
  }
  if (
    s === "ground capcom" ||
    s === "capcom" ||
    s === "cap" ||
    s === "ground systems" ||
    s === "mission scientist" ||
    s === "ground"
  ) {
    return "ground_capcom";
  }
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
  if (s === "specialist" || s === "spc" || s.includes("specialist") || s.includes("eva")) {
    return "specialist";
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
    title: "Solar Panels & Battery Sizing",
    room: "PWR",
    role: "engineer",
    dependsOn: ["task_antenna"]
  },
  {
    id: "task_science",
    title: "Cameras, Sensors & Lab Kit",
    room: "SCI",
    role: "scientist",
    dependsOn: ["task_antenna"]
  },
  {
    id: "task_hull",
    title: "Radios, Thrusters & Safe Cleanup",
    room: "HULL",
    role: "engineer",
    dependsOn: ["task_nav", "task_wires"]
  },
  {
    id: "task_lss",
    title: "Heating, Cooling & Space Shielding",
    room: "LSS",
    role: "scientist",
    dependsOn: ["task_wires", "task_science"]
  },
  {
    id: "task_landing",
    title: "Final Review & Launch Check",
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
  bionutrients_2: {
    id: "bionutrients_2",
    name: "BioNutrients-2 ISS Nutrient Production",
    code: "BIONUTRIENTS-2",
    badge: "ISS BIO / SMD",
    summary: "Launch soft-stowed FEP production bags on Cygnus NG-18, hydrate yeast from ISS PWD, incubate at 30°C (+6h shake) for ≥3 µg/mL beta-carotene, freeze in MELFI (-80°C), and slash mass (<250g) & volume (<300mL)."
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


const ROLE_INFO = {
  flight_director: {
    id: "flight_director",
    short: "FDIR",
    team: "ground",
    title: "Flight Director",
    callsign: "LCC-FLIGHT",
    color: "#38bdf8",
    primaryDuty: "LCC Firing Room Authority: GO/NO-GO Launch & Latch Calls, Room Pings & Mission Charter Review",
    padDuty: "Monitor LC-39A Pad Readiness & Issue GO/NO-GO Launch Release from LCC",
    dockDuty: "Issue Orbital Approach & Capture Latch Clearance from LCC Console",
    stationRooms: ["LCC", "ORBIT", "HUB"]
  },
  ground_capcom: {
    id: "ground_capcom",
    short: "CAP",
    team: "ground",
    title: "Ground CAPCOM",
    callsign: "LCC-CAPCOM",
    color: "#60a5fa",
    primaryDuty: "LCC DSN & Systems Desk: S-Band Relay [R], DSN Link Lock, Power/Thermal Routing & Science Downlink",
    padDuty: "Verify Telemetry Carrier, Weather Go & Pad Trunk Status in Firing Room",
    dockDuty: "Track Crew Positions, Ping Station Bays & Lock DSN Telemetry Link",
    stationRooms: ["LCC", "COMMS", "PWR"]
  },
  commander: {
    id: "commander",
    short: "CMD",
    team: "crew",
    title: "Commander",
    callsign: "FLIGHT-CDR",
    color: "#c08a8a",
    primaryDuty: "Initiate Liftoff [L], Pilot Orbital Docking [WASD/QE] & Charter/Navigation Consoles [HUB, CMD]",
    padDuty: "Board White Room & Initiate Liftoff [L]",
    dockDuty: "Primary 6DOF Docking Pilot & Capture Latch [SPACE]",
    stationRooms: ["HUB", "CMD", "LDR"]
  },
  engineer: {
    id: "engineer",
    short: "ENG",
    team: "crew",
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
    team: "crew",
    title: "Science Officer",
    callsign: "PAYLOAD-SCI",
    color: "#7fb8a6",
    primaryDuty: "White Room Bio-Check, Boresight Lidar Telemetry [3/4] & Science/ECLSS Consoles [SCI, LSS]",
    padDuty: "Complete White Room Ingress & Bio-Check",
    dockDuty: "Boresight Auto-Align [3] & Corridor Telemetry Ping [4]",
    stationRooms: ["SCI", "LSS", "LDR"]
  },
  specialist: {
    id: "specialist",
    short: "SPC",
    team: "crew",
    title: "Mission Specialist",
    callsign: "ORBIT-SPEC",
    color: "#a78bfa",
    primaryDuty: "EVA & Docking Corridor Assist [3/4], Cross-Console Systems & Comms Relay [SCI, COMMS, HULL]",
    padDuty: "Assist Access Arm Verification & White Room Ingress",
    dockDuty: "Corridor Telemetry Ping [4] & Hatch Readiness",
    stationRooms: ["EVA", "SCI", "HUB"]
  }
};

function shuffleCrypto(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function computeAdaptiveRolePlan(playerCount) {
  const n = Math.max(1, Math.min(MAX_PLAYERS, Number(playerCount) || 1));
  const groundCount = GROUND_SLOT_SCHEDULE[n] || 0;
  const flightCount = Math.max(1, n - groundCount);
  const plan = [];
  for (let i = 0; i < groundCount && i < GROUND_ROLES.length; i++) {
    plan.push(GROUND_ROLES[i]);
  }
  for (let i = 0; i < flightCount; i++) {
    plan.push(FLIGHT_ROLES[i % FLIGHT_ROLES.length]);
  }
  return plan;
}

function assignRandomRolesForRoom(room) {
  if (!room || !room.players) return;
  const ids = Object.keys(room.players);
  if (ids.length === 0) return;
  const plan = computeAdaptiveRolePlan(ids.length);
  const shuffledIds = shuffleCrypto(ids);
  shuffledIds.forEach((pid, idx) => {
    const role = plan[idx] || "commander";
    const p = room.players[pid];
    if (p) {
      p.role = role;
      p.team = getTeamForRole(role);
    }
  });
  room.swapRequests = {};
  if (room.systems) {
    room.systems.dockingPilotId = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
  }
  if (room.mission) {
    room.mission.dockingPilotId = room.systems ? room.systems.dockingPilotId : null;
  }
}

function pickBalancedRoleForRoom(room, _requestedRole, _explicitRole = false) {
  const existing = room && room.players ? Object.values(room.players) : [];
  const nextCount = Math.min(MAX_PLAYERS, existing.length + 1);
  const targetPlan = computeAdaptiveRolePlan(nextCount);

  // Count what is already staffed relative to the target split
  const remainingNeeded = targetPlan.slice();
  existing.forEach((p) => {
    const r = normalizeRoleId(p && p.role, "commander");
    const idx = remainingNeeded.indexOf(r);
    if (idx !== -1) {
      remainingNeeded.splice(idx, 1);
    }
  });

  // Always guarantee at least 1 flight crewmember in flightCrewRooms
  const hasFlightCrew = existing.some((p) => getTeamForRole(p && p.role) !== "ground");
  if (!hasFlightCrew && remainingNeeded.length > 0) {
    const flightChoices = remainingNeeded.filter((r) => getTeamForRole(r) !== "ground");
    if (flightChoices.length > 0) {
      return flightChoices[crypto.randomInt(0, flightChoices.length)];
    }
    return "commander";
  }

  if (remainingNeeded.length > 0) {
    return remainingNeeded[crypto.randomInt(0, remainingNeeded.length)];
  }

  const fallbackPool = existing.length === 0 ? ["commander"] : FLIGHT_ROLES;
  return fallbackPool[crypto.randomInt(0, fallbackPool.length)];
}

function buildRoomRoleSummary(room) {
  const summary = {
    flight_director: [],
    ground_capcom: [],
    commander: [],
    engineer: [],
    scientist: [],
    specialist: []
  };
  if (room && room.players) {
    Object.values(room.players).forEach((p) => {
      const r = normalizeRoleId(p && p.role, "commander");
      if (!summary[r]) summary[r] = [];
      summary[r].push(p.id);
    });
  }
  return summary;
}

function resolveDockingPilotId(room) {
  if (!room || !room.players) return null;
  const players = Object.values(room.players);
  if (players.length === 0) return null;
  const flightPlayers = players.filter((p) => getTeamForRole(p.role) !== "ground");
  const pool = flightPlayers.length > 0 ? flightPlayers : players;
  const current = room.systems && room.systems.dockingPilotId;
  if (current && room.players[current] && getTeamForRole(room.players[current].role) !== "ground") {
    return current;
  }
  const cmd = pool.find((p) => normalizeRoleId(p.role) === "commander");
  if (cmd) return cmd.id;
  if (room.hostId && room.players[room.hostId] && getTeamForRole(room.players[room.hostId].role) !== "ground") {
    return room.hostId;
  }
  return pool[0].id;
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

function groundSpawnLccFor(index = 0) {
  // Open aisle inside LCC Firing Room facing North Launch Wall Screen & LC-39A.
  const slots = [
    [-204.5, 0.25, 185.5],
    [-201.0, 0.25, 185.5],
    [-206.0, 0.25, 185.5],
    [-199.5, 0.25, 185.5]
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

function spawnForRoomPhase(room, index = 0, role = "commander") {
  if (getTeamForRole(role) === "ground") {
    return groundSpawnLccFor(index);
  }
  const phase = room && room.mission ? room.mission.phase : "gantry";
  if (phase === "station" || phase === "docking") {
    return stationSpawnFor(index);
  }
  return groundSpawnFor(index);
}

function createGroundSupportState() {
  return {
    goNoGoLaunch: false,
    goNoGoBy: null,
    goNoGoAt: 0,
    dockingClearance: false,
    dockingClearanceBy: null,
    dockingAssistCount: 0,
    dsnLocked: false,
    dsnLockedBy: null,
    powerRouted: false,
    powerRoutedBy: null,
    scienceCleared: false,
    scienceClearedBy: null,
    activePing: null
  };
}

// Shared mission state. Every client renders the same phase, objective chain
// and mission design, so late joiners and astronauts who board at different
// times stay in lockstep.
function createMissionState(scenarioId = "lunar_south_pole", difficultyId = "engineer", opsMode = "iss_expedition") {
  const scenario = MISSION_CATALOG[scenarioId] ? scenarioId : "lunar_south_pole";
  const difficulty = DIFFICULTY_IDS.has(difficultyId) ? difficultyId : "engineer";
  const mode = VALID_OPS_MODES.has(opsMode) ? opsMode : "iss_expedition";
  const now = Date.now();
  return {
    opsMode: mode, // iss_expedition | shuttle_flight
    phase: "gantry", // gantry -> launch -> docking -> station
    dockLocked: false,
    boarded: {}, // socketId -> timestamp
    skipVotes: {}, // socketId -> true (launch cutscene skip readiness)
    launchedBy: null,
    dockedBy: null,
    launchPollAt: 0,
    launchPollBy: null,
    groundSupport: createGroundSupportState(),
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

function serializeMission(mission) {
  const m = mission || createMissionState();
  const scenario = MISSION_CATALOG[m.scenarioId] || MISSION_CATALOG.lunar_south_pole;
  return {
    opsMode: VALID_OPS_MODES.has(m.opsMode) ? m.opsMode : "iss_expedition",
    phase: m.phase,
    dockLocked: !!m.dockLocked,
    boarded: Object.keys(m.boarded || {}),
    skipVotes: Object.keys(m.skipVotes || {}),
    launchedBy: m.launchedBy || null,
    dockedBy: m.dockedBy || null,
    dockingPilotId: m.dockingPilotId || null,
    launchPollAt: m.launchPollAt || 0,
    launchPollBy: m.launchPollBy || null,
    groundSupport: m.groundSupport || createGroundSupportState(),
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
      team: player.team || getTeamForRole(player.role),
      tasksDone: player.tasksDone || 0
    })),
    launchedBy: nameFor(mission.launchedBy),
    dockedBy: nameFor(mission.dockedBy),
    groundSupport: mission.groundSupport || createGroundSupportState(),
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

function createNewRoom(roomId, hostId, isPublic = true, opsMode = "iss_expedition") {
  return {
    id: roomId,
    hostId: hostId,
    mode: GAME_MODE,
    maxPlayers: MAX_PLAYERS,
    status: "lobby", // 'lobby' or 'playing'
    isPublic: !!isPublic,
    createdAt: Date.now(),
    players: {}, // socketId -> playerObj
    roles: {},
    swapRequests: {}, // requestId -> pending swap request
    manualSwapOccurred: false,
    launchPollTimer: null,
    completedTaskIds: {}, // taskId -> socketId, prevents double-counting shared objectives
    shuttleMission: null,
    shuttleInputs: {},
    shuttleLastTick: 0,
    shuttleLastSnap: 0,
    shuttleTestFreeze: false,
    shuttleResultRecorded: false,
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
    mission: createMissionState("lunar_south_pole", "engineer", opsMode),
    chatHistory: []
  };
}

// Shuttle Flight Ops seat assignment: maps Lunaspis room roles (commander, engineer,
// specialist, scientist, flight_director, ground_capcom) onto the 4 Shuttle seats
// (cdr, plt, ms1, ms2). Unclaimed seats automatically fall back to the Commander/host
// so solo pilots and 2-6 player crews can fly every Shuttle mission seamlessly.
const SHUTTLE_SEAT_PREFS = {
  cdr: ["commander", "flight_director", "engineer", "ground_capcom", "specialist", "scientist"],
  plt: ["engineer", "ground_capcom", "specialist", "scientist", "flight_director", "commander"],
  ms1: ["specialist", "scientist", "engineer", "ground_capcom", "flight_director", "commander"],
  ms2: ["flight_director", "scientist", "ground_capcom", "specialist", "engineer", "commander"]
};

function assignShuttleSeatMap(room) {
  const players = Object.values((room && room.players) || {});
  const assigned = {};
  if (!players.length) return assigned;

  const used = new Set();
  for (const seat of SHUTTLE_CREW.roles) {
    const prefs = SHUTTLE_SEAT_PREFS[seat] || [];
    let chosen = null;
    for (const prefRole of prefs) {
      chosen = players.find((p) => p && !used.has(p.id) && p.role === prefRole);
      if (chosen) break;
    }
    if (!chosen) chosen = players.find((p) => p && !used.has(p.id));
    if (chosen) {
      assigned[seat] = { id: chosen.id, filled: true };
      used.add(chosen.id);
    }
  }
  return assigned;
}

function shuttleSeatOwner(room, seat) {
  const primary = assignShuttleSeatMap(room);
  if (primary[seat]) return primary[seat].id;
  if (primary.cdr) return primary.cdr.id;
  if (room && room.players && room.players[room.hostId]) return room.hostId;
  const ids = Object.keys((room && room.players) || {});
  return ids[0] || null;
}

function shuttleCrewAssignments(room) {
  const primary = assignShuttleSeatMap(room);
  const out = {};
  for (const r of SHUTTLE_CREW.roles) {
    const sid = shuttleSeatOwner(room, r);
    const p = sid && room && room.players ? room.players[sid] : null;
    out[r] = {
      playerId: sid || null,
      name: p ? p.name : null,
      filled: !!(primary[r] && primary[r].filled)
    };
  }
  return out;
}

function mergedShuttleInputs(room) {
  const inp = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: 0, brake: 0 };
  for (const axis of Object.keys(inp)) {
    const owner = shuttleSeatOwner(room, SHUTTLE_CREW.axisRole[axis]);
    const src = owner && room.shuttleInputs ? room.shuttleInputs[owner] : null;
    if (src && typeof src[axis] === "number" && isFinite(src[axis])) inp[axis] = src[axis];
  }
  return inp;
}

function sendShuttleSnapshot(room) {
  if (!room || !room.shuttleMission) return null;
  const sn = room.shuttleMission.snapshot();
  sn.crew = shuttleCrewAssignments(room);
  io.to(room.id).emit("shuttle_state", sn);
  return sn;
}

async function recordShuttleResult(room) {
  if (!room || room.shuttleResultRecorded || !room.shuttleMission || !room.shuttleMission.result) return;
  room.shuttleResultRecorded = true;
  room.status = "victory";
  await db.upsertGameRoom(room.id, room.hostId, "victory");
  if (room.shuttleMission.result.success) {
    for (const pid in room.players) {
      const p = room.players[pid];
      const memberSocket = io.sockets.sockets.get(pid);
      if (p && p.userId && memberSocket && memberSocket.isAuthenticated) {
        db.incrementUserStats(p.userId, { gamesWon: 1 });
      }
    }
  }
  broadcastRoomUpdate(room);
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
    if (room.shuttleMission && room.mission && room.mission.opsMode === "shuttle_flight") continue;

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

// Shuttle Flight Ops physics loop (30 Hz tick -> internal fixed 1/60 s RK4/mission step,
// streaming 15 Hz MissionSnapshots when any room is actively flying a Shuttle mission).
setInterval(() => {
  const now = Date.now();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (!room || room.status !== "playing" || !room.shuttleMission) continue;
    if (!room.mission || room.mission.opsMode !== "shuttle_flight") continue;
    if (Object.keys(room.players).length === 0) continue;
    const dt = room.shuttleLastTick ? (now - room.shuttleLastTick) / 1000 : 0;
    room.shuttleLastTick = now;
    room.shuttleMission.command("SET_CONTROL_INPUT", mergedShuttleInputs(room));
    const events = room.shuttleMission.advance(room.shuttleTestFreeze ? 0 : Math.min(dt, 0.5));
    if (events.length) {
      io.to(roomId).emit("shuttle_events", events.filter((e) => e.type !== "COMMAND_ACCEPTED"));
    }
    if (now - room.shuttleLastSnap >= 1000 / SHUTTLE_SNAPSHOT_HZ || events.length) {
      room.shuttleLastSnap = now;
      sendShuttleSnapshot(room);
    }
    if (room.shuttleMission.result) {
      recordShuttleResult(room);
    }
  }
}, 1000 / 30);

function serializePlayer(player) {
  const { userId, ...publicPlayer } = player || {};
  return publicPlayer;
}

function serializeSwapRequests(room) {
  if (!room || !room.swapRequests) return [];
  const now = Date.now();
  const active = [];
  for (const [id, req] of Object.entries(room.swapRequests)) {
    if (!req || now > req.expiresAt || !room.players[req.fromId] || !room.players[req.toId]) {
      delete room.swapRequests[id];
      continue;
    }
    active.push({
      id: req.id,
      fromId: req.fromId,
      fromName: req.fromName,
      fromRole: req.fromRole,
      fromTeam: req.fromTeam,
      toId: req.toId,
      toName: req.toName,
      toRole: req.toRole,
      toTeam: req.toTeam,
      createdAt: req.createdAt,
      expiresAt: req.expiresAt
    });
  }
  return active;
}

function repositionPlayersForGantry(room) {
  if (!room || !room.players) return;
  let flightIdx = 0;
  let groundIdx = 0;
  Object.values(room.players).forEach((p) => {
    const team = getTeamForRole(p.role);
    p.team = team;
    if (team === "ground") {
      p.pos = groundSpawnLccFor(groundIdx++);
      p.yaw = 0;
      if (room.mission && room.mission.boarded) {
        delete room.mission.boarded[p.id];
      }
    } else {
      p.pos = groundSpawnFor(flightIdx++);
      p.yaw = 0;
    }
    p.pitch = 0;
    p.isEva = false;
  });
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
    isSolo: !!room.isSolo,
    players: Object.values(room.players).map(serializePlayer),
    roles: room.roles,
    roleInfo: ROLE_INFO,
    groundSlotSchedule: GROUND_SLOT_SCHEDULE,
    swapRequests: serializeSwapRequests(room),
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
    const opsMode = VALID_OPS_MODES.has(data.opsMode) ? data.opsMode : "iss_expedition";
    const isSolo = data.solo === true;
    const isPublic = isSolo ? false : data.isPublic !== false;
    const room = createNewRoom(roomId, socket.id, isPublic, opsMode);
    room.isSolo = isSolo;
    if (isSolo) {
      if (data.scenarioId && MISSION_CATALOG[data.scenarioId]) {
        room.mission.scenarioId = data.scenarioId;
      }
      if (data.difficultyId && DIFFICULTY_IDS.has(data.difficultyId)) {
        room.mission.difficultyId = data.difficultyId;
      }
    }
    rooms[roomId] = room;
    currentRoomId = roomId;
    socket.join(roomId);

    const userId = socket.userId;

    const playerRole = "commander";
    const playerTeam = getTeamForRole(playerRole);
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
      team: playerTeam,
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
    room.manualSwapOccurred = false;
    room.swapRequests = {};

    console.log(`[ROOM] Created 6-player co-op room ${roomId} by ${player.name} (${playerRole}, user: ${userId}, socket: ${socket.id})`);

    // Persist authenticated profiles only; guest identities stay session-only.
    await db.upsertGameRoom(roomId, userId, "lobby", 7, isPublic);
    if (socket.isAuthenticated) {
      await db.getOrCreateUser(userId, player.name, player.color, player.role);
      await db.upsertRoomMember(roomId, userId, socket.id, player);
    }

    const payload = {
      success: true,
      roomId: roomId,
      hostId: socket.id,
      solo: isSolo,
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

    if (targetRoom.isSolo) {
      const err = { success: false, message: "This expedition is a single-player mission and is not accepting crew." };
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

    // Server allocates randomized Ground vs Flight slots automatically.
    const role = pickBalancedRoleForRoom(room);
    const team = getTeamForRole(role);

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
      team: team,
      isHost: room.hostId === socket.id,
      ready: false,
      pos: spawnForRoomPhase(room, Object.keys(room.players).length, role),
      yaw: (team === "ground" || !room.mission || room.mission.phase === "gantry" || room.mission.phase === "launch")
        ? 0
        : Math.PI,
      pitch: 0,
      isEva: false,
      suitLights: true,
      tasksDone: 0
    };

    room.players[socket.id] = player;

    // On transition from 1P -> 2P in Lobby (before any manual swaps), randomize
    // who takes LCC Ground Control vs Ship Flight Crew so either player can draw either team.
    if (room.status === "lobby" && Object.keys(room.players).length === 2 && !room.manualSwapOccurred) {
      assignRandomRolesForRoom(room);
      repositionPlayersForGantry(room);
    }

    // Late Flight Crew joiners during ascent/docking/station are marked aboard;
    // Ground Control remains stationed at Kennedy LCC.
    if (room.mission && room.mission.phase !== "gantry" && player.team !== "ground") {
      room.mission.boarded[socket.id] = Date.now();
      room.mission.updatedAt = Date.now();
    }
    console.log(`[ROOM] ${player.name} joined room ${targetCode} as ${player.role} (${player.team}, ${Object.keys(room.players).length}/${MAX_PLAYERS})`);

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
    if (room.status === "playing" && room.shuttleMission) {
      sendShuttleSnapshot(room);
    }
  }

  // 1. Host creates a new room with a freshly generated expedition code
  socket.on("create_room", (data = {}, callback) => createRoomForSocket(data, callback));

  // 2. Join an existing room via Code (6-player co-op crew)
  socket.on("join_room", (data = {}, callback) => {
    data = asObject(data);
    const targetCode = String(data.roomId || "").trim().toUpperCase().slice(0, 16);
    return joinRoomForSocket(targetCode, data, callback);
  });

  // 2b. Quick play: fill an open public crew matching the requested operations mode,
  // otherwise create a fresh room.
  socket.on("quick_play", (data = {}, callback) => {
    data = asObject(data);
    const requestedMode = VALID_OPS_MODES.has(data.opsMode) ? data.opsMode : "iss_expedition";
    const openRooms = Object.values(rooms)
      .filter((room) =>
        room.isPublic &&
        !room.isSolo &&
        (room.status === "lobby" || room.status === "playing") &&
        ((room.mission && room.mission.opsMode) || "iss_expedition") === requestedMode &&
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

  // 3. Customize Astronaut in Lobby (callsign/suit color/ready only; roles come from randomizer/swaps)
  socket.on("customize_astronaut", async (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const player = room.players[socket.id];
    if (!player) return;

    if (data.name) player.name = String(data.name).replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 16) || player.name;
    if (/^#[0-9a-fA-F]{6}$/.test(data.color)) player.color = data.color;
    if (data.modelId) player.modelId = String(data.modelId).trim().slice(0, 64);

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

  // 3a. Host randomizes Ground Control + Flight Crew roles cleanly
  socket.on("randomize_roles", (_data = {}, callback) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.hostId !== socket.id) {
      const err = { success: false, message: "Only the room host can randomize crew roles." };
      if (typeof callback === "function") callback(err);
      return;
    }
    const phase = room.mission ? room.mission.phase : "gantry";
    if (room.status === "playing" && phase !== "gantry") {
      const err = { success: false, message: "Cannot re-randomize across zones after liftoff." };
      if (typeof callback === "function") callback(err);
      return;
    }

    assignRandomRolesForRoom(room);
    if (room.status === "playing" && phase === "gantry") {
      repositionPlayersForGantry(room);
      broadcastMissionUpdate(room, {
        action: "roles_randomized",
        playerId: socket.id
      });
    }
    room.manualSwapOccurred = false;

    const payload = {
      success: true,
      players: Object.values(room.players).map(serializePlayer)
    };
    io.to(currentRoomId).emit("roles_randomized", payload);
    broadcastRoomUpdate(room);
    if (typeof callback === "function") callback(payload);
  });

  function canSwapRoomRoles(room, pFrom, pTo) {
    if (!room || !pFrom || !pTo || pFrom.id === pTo.id) {
      return { ok: false, reason: "Invalid swap target." };
    }
    const phase = room.mission ? room.mission.phase : "gantry";
    const fullSwapAllowed = room.status === "lobby" || phase === "gantry";
    const sameZone = getTeamForRole(pFrom.role) === getTeamForRole(pTo.role);
    if (!fullSwapAllowed && !sameZone) {
      return {
        ok: false,
        reason: "Cross-zone Ground <-> Flight swaps lock after liftoff. Same-zone swaps remain open."
      };
    }
    return { ok: true };
  }

  // 3b. Peer Role Swap Request
  socket.on("request_role_swap", (data = {}, callback) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const pFrom = room.players[socket.id];
    const targetId = typeof data.targetId === "string" ? data.targetId : "";
    const pTo = room.players[targetId];
    if (!pFrom || !pTo) {
      const err = { success: false, message: "Crewmember no longer in room." };
      if (typeof callback === "function") callback(err);
      return;
    }

    const check = canSwapRoomRoles(room, pFrom, pTo);
    if (!check.ok) {
      const err = { success: false, message: check.reason };
      if (typeof callback === "function") callback(err);
      socket.emit("role_swap_error", err);
      return;
    }

    room.swapRequests = room.swapRequests || {};
    const now = Date.now();
    // Deduplicate existing pending request from this requester to this target
    for (const [id, existing] of Object.entries(room.swapRequests)) {
      if (existing.fromId === socket.id && existing.toId === targetId && existing.expiresAt > now) {
        const resPayload = { success: true, request: existing };
        if (typeof callback === "function") callback(resPayload);
        return;
      }
      if (existing.fromId === socket.id) {
        delete room.swapRequests[id];
      }
    }

    const requestId = `swap_${now}_${crypto.randomInt(1000, 9999)}`;
    const swapReq = {
      id: requestId,
      fromId: pFrom.id,
      fromName: pFrom.name,
      fromRole: pFrom.role,
      fromTeam: getTeamForRole(pFrom.role),
      toId: pTo.id,
      toName: pTo.name,
      toRole: pTo.role,
      toTeam: getTeamForRole(pTo.role),
      createdAt: now,
      expiresAt: now + 25000
    };
    room.swapRequests[requestId] = swapReq;

    io.to(targetId).emit("role_swap_requested", swapReq);
    broadcastRoomUpdate(room);
    if (typeof callback === "function") callback({ success: true, request: swapReq });
  });

  // 3c. Respond to Peer Role Swap Request (Accept / Decline)
  socket.on("respond_role_swap", (data = {}, callback) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const requestId = typeof data.requestId === "string" ? data.requestId : "";
    const swapReq = room.swapRequests && room.swapRequests[requestId];
    if (!swapReq || swapReq.toId !== socket.id) {
      const err = { success: false, message: "Swap request expired or invalid." };
      if (typeof callback === "function") callback(err);
      return;
    }

    delete room.swapRequests[requestId];
    const pFrom = room.players[swapReq.fromId];
    const pTo = room.players[swapReq.toId];

    if (!data.accept || !pFrom || !pTo) {
      const declinedPayload = {
        requestId,
        accepted: false,
        fromId: swapReq.fromId,
        fromName: swapReq.fromName,
        toId: swapReq.toId,
        toName: swapReq.toName
      };
      io.to(currentRoomId).emit("role_swap_resolved", declinedPayload);
      broadcastRoomUpdate(room);
      if (typeof callback === "function") callback({ success: true, accepted: false });
      return;
    }

    const check = canSwapRoomRoles(room, pFrom, pTo);
    if (!check.ok) {
      const err = { success: false, message: check.reason };
      io.to(swapReq.fromId).emit("role_swap_error", err);
      io.to(swapReq.toId).emit("role_swap_error", err);
      broadcastRoomUpdate(room);
      if (typeof callback === "function") callback(err);
      return;
    }

    const oldFromRole = pFrom.role;
    const oldToRole = pTo.role;
    const oldFromTeam = getTeamForRole(oldFromRole);
    const oldToTeam = getTeamForRole(oldToRole);
    pFrom.role = oldToRole;
    pFrom.team = oldToTeam;
    pTo.role = oldFromRole;
    pTo.team = oldFromTeam;
    room.manualSwapOccurred = true;

    // Clear any other pending swap requests involving either participant
    for (const [id, req] of Object.entries(room.swapRequests || {})) {
      if (req.fromId === pFrom.id || req.toId === pFrom.id || req.fromId === pTo.id || req.toId === pTo.id) {
        delete room.swapRequests[id];
      }
    }

    if (room.systems) {
      room.systems.dockingPilotId = resolveDockingPilotId(room);
    }
    if (room.status === "playing" && room.mission) {
      room.mission.dockingPilotId = room.systems ? room.systems.dockingPilotId : null;
      if (room.mission.phase === "gantry") {
        if (oldFromTeam !== oldToTeam) {
          repositionPlayersForGantry(room);
        }
        broadcastMissionUpdate(room, { action: "roles_swapped", playerId: pTo.id });
      }
    }

    const acceptedPayload = {
      requestId,
      accepted: true,
      fromId: pFrom.id,
      fromName: pFrom.name,
      fromNewRole: pFrom.role,
      fromNewTeam: pFrom.team,
      toId: pTo.id,
      toName: pTo.name,
      toNewRole: pTo.role,
      toNewTeam: pTo.team
    };
    io.to(currentRoomId).emit("role_swap_resolved", acceptedPayload);
    broadcastRoomUpdate(room);
    if (typeof callback === "function") callback({ success: true, accepted: true, ...acceptedPayload });
  });

  socket.on("cancel_role_swap", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const requestId = typeof data.requestId === "string" ? data.requestId : "";
    const req = room.swapRequests && room.swapRequests[requestId];
    if (!req || req.fromId !== socket.id) return;
    delete room.swapRequests[requestId];
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
    if (data.opsMode && VALID_OPS_MODES.has(data.opsMode)) {
      room.mission.opsMode = data.opsMode;
    }
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
  socket.on("start_game", async (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (!room.players[room.hostId] && room.players[socket.id]) {
      room.hostId = socket.id;
      room.players[socket.id].isHost = true;
    }
    if (room.hostId !== socket.id) return;
    if (room.status === "playing") return;

    if (room.launchPollTimer) {
      clearTimeout(room.launchPollTimer);
      room.launchPollTimer = null;
    }

    if (data.randomizeRoles) {
      assignRandomRolesForRoom(room);
    }

    // Ensure at least 1 flight crewmember exists if players > 0
    const roomPlayers = Object.values(room.players);
    if (roomPlayers.length > 0 && !roomPlayers.some((pl) => getTeamForRole(pl.role) !== "ground")) {
      const promoteTarget = roomPlayers.find((pl) => pl.id === room.hostId) || roomPlayers[0];
      promoteTarget.role = "commander";
      promoteTarget.team = "crew";
    }

    const scenarioId = (room.mission && room.mission.scenarioId) || "lunar_south_pole";
    const difficultyId = (room.mission && room.mission.difficultyId) || "engineer";
    const opsMode = (room.mission && VALID_OPS_MODES.has(room.mission.opsMode)) ? room.mission.opsMode : "iss_expedition";

    room.status = "playing";
    room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
    room.completedTaskIds = {};
    room.mission = createMissionState(scenarioId, difficultyId, opsMode);
    room.mission.startedAt = Date.now();
    room.systems.docking = { range: 18.5, velocity: 0.30, alignment: 3.5, latchesLocked: false };
    room.systems.dockingState = null;
    room.systems.dockingPilotId = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;

    if (opsMode === "shuttle_flight") {
      room.shuttleMission = new ShuttleMission();
      room.shuttleInputs = {};
      room.shuttleLastTick = Date.now();
      room.shuttleLastSnap = 0;
      room.shuttleResultRecorded = false;
      room.shuttleTestFreeze = false;
    } else {
      room.shuttleMission = null;
      room.shuttleInputs = {};
      room.shuttleResultRecorded = false;
      room.shuttleTestFreeze = false;
    }

    Object.keys(room.players).forEach((pid) => {
      const player = room.players[pid];
      player.tasksDone = 0;
    });
    repositionPlayersForGantry(room);

    console.log(`[GAME] Co-op ${opsMode} (${room.mission.scenarioId}, ${room.mission.difficultyId}) started in room ${currentRoomId} by host!`);

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
      opsMode: opsMode,
      shuttleMissionId: room.shuttleMission ? room.shuttleMission.missionId : null,
      maxPlayers: MAX_PLAYERS,
      players: Object.values(room.players).map(serializePlayer),
      systems: room.systems,
      tasks: room.tasks,
      mission: serializeMission(room.mission)
    });
    // Keep roomState.status in sync ("playing") so proximity voice and HUD
    // states activate immediately for every client, including late joiners.
    broadcastRoomUpdate(room);
    if (opsMode === "shuttle_flight" && room.shuttleMission) {
      sendShuttleSnapshot(room);
    }
  });

  // 4b. Shuttle Flight Ops semantic commands & control axes (authorised by Shuttle crew seat)
  socket.on("shuttle_command", (data = {}, callback) => {
    data = asObject(data);
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.shuttleMission || !room.players[socket.id]) {
      return reply({ accepted: false, reason: "Not in a Shuttle flight" });
    }
    const type = String(data.type || "");
    if (type === "SET_CONTROL_INPUT") {
      return reply({ accepted: false, reason: "Use shuttle_input" });
    }
    const seat = SHUTTLE_CREW.commandRole[type];
    if (!seat) {
      return reply({ accepted: false, reason: `Unknown command ${type}` });
    }
    const ownerId = shuttleSeatOwner(room, seat);
    if (ownerId !== socket.id) {
      const owner = ownerId ? room.players[ownerId] : null;
      return reply({
        accepted: false,
        reason: `${SHUTTLE_CREW.info[seat].title} (${owner ? owner.name : "unassigned"}) owns ${type}`
      });
    }
    let r;
    if (type === "RESTART") {
      room.shuttleMission = new ShuttleMission();
      room.shuttleInputs = {};
      room.shuttleLastTick = Date.now();
      room.shuttleResultRecorded = false;
      room.shuttleTestFreeze = false;
      room.status = "playing";
      r = { accepted: true };
    } else {
      r = room.shuttleMission.command(type, data.args && typeof data.args === "object" ? data.args : {});
    }
    reply(r);
    const p = room.players[socket.id];
    io.to(room.id).emit("shuttle_command_log", {
      by: p.name,
      seat,
      type,
      accepted: r.accepted,
      reason: r.reason || null
    });
    const ev = room.shuttleMission.drainEvents();
    if (ev.length) {
      io.to(room.id).emit("shuttle_events", ev.filter((e) => e.type !== "COMMAND_ACCEPTED"));
    }
    sendShuttleSnapshot(room);
  });

  socket.on("shuttle_input", (data = {}, callback) => {
    data = asObject(data);
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.shuttleMission || !room.players[socket.id]) return;
    const clean = {};
    for (const k of ["pitch", "yaw", "roll", "tx", "ty", "tz", "sb", "brake"]) {
      if (typeof data[k] === "number" && isFinite(data[k])) {
        clean[k] = Math.max(-1, Math.min(1, data[k]));
      }
    }
    room.shuttleInputs = room.shuttleInputs || {};
    room.shuttleInputs[socket.id] = clean;
    if (typeof callback === "function") callback(true);
  });

  if (SHUTTLE_TEST_HOOKS) {
    socket.on("shuttle_test", (data = {}, callback) => {
      data = asObject(data);
      const room = currentRoomId && rooms[currentRoomId];
      if (!room || !room.shuttleMission) return typeof callback === "function" && callback(null);
      if (data.op === "freeze") room.shuttleTestFreeze = !!data.on;
      if (data.op === "preset") {
        try {
          const { createPilot } = require("./tests/shuttle/pilot.js");
          const m = room.shuttleMission;
          const pilot = createPilot();
          const stop = String(data.phase || "approach");
          const t0 = Date.now();
          m.applyFixture("preset " + stop, () => {});
          m._uncapped = true;
          m.warpReq = 1000;
          const slice = () => {
            const s0 = Date.now();
            while (Date.now() - s0 < 200) {
              if (m.result || m.failure || m.phase === stop || m.st.t > 6 * 3600) {
                m._uncapped = false;
                m.warpReq = 1;
                m.command("SET_CONTROL_INPUT", mergedShuttleInputs(room));
                console.log(`[TEST] shuttle preset ${stop}: ${m.phase} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
                const sn = sendShuttleSnapshot(room);
                if (typeof callback === "function") callback({ t: sn.simTime, phase: sn.phase });
                return;
              }
              const o = pilot.step(m);
              for (const c of o.cmds) m.command(c[0], c[1]);
              m.command("SET_CONTROL_INPUT", o.input);
              m.advanceSim(Math.max(1, Math.min(o.warp, m._warpLimit().max)) / 60);
            }
            setImmediate(slice);
          };
          slice();
          return;
        } catch (e) {
          console.warn("[TEST] shuttle preset failed:", e.message);
        }
      }
      if (data.op === "step") {
        room.shuttleMission.command("SET_CONTROL_INPUT", mergedShuttleInputs(room));
        const events = room.shuttleMission.advanceSim(Math.max(0, Math.min(60, Number(data.seconds) || 0)));
        if (events.length) io.to(room.id).emit("shuttle_events", events);
        if (room.shuttleMission.result) recordShuttleResult(room);
      }
      const sn = sendShuttleSnapshot(room);
      if (typeof callback === "function") callback({ t: sn.simTime, phase: sn.phase });
    });
  }

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

  function roomHasGroundCrew(room) {
    if (!room || !room.players) return false;
    return Object.values(room.players).some((pl) => getTeamForRole(pl && pl.role) === "ground");
  }

  function getFlightCrewIds(room) {
    if (!room || !room.players) return [];
    return Object.keys(room.players).filter((id) => getTeamForRole(room.players[id].role) !== "ground");
  }

  function triggerRoomLaunch(room, launchedById, launchedByName) {
    if (!room || !room.mission || room.mission.phase !== "gantry") return false;
    if (room.launchPollTimer) {
      clearTimeout(room.launchPollTimer);
      room.launchPollTimer = null;
    }
    const now = Date.now();
    room.mission.dockLocked = true;
    room.mission.launchPollAt = 0;
    room.mission.launchPollBy = null;
    // Liftoff straps in every Flight Crew astronaut; Ground Control remains at Kennedy LCC.
    for (const pid in room.players) {
      if (getTeamForRole(room.players[pid].role) !== "ground") {
        room.mission.boarded[pid] = now;
      }
    }
    room.mission.phase = "launch";
    room.mission.skipVotes = {};
    room.mission.launchedBy = launchedById || null;
    room.systems.dockingState = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;
    room.mission.phaseStartedAt = now;
    room.mission.updatedAt = now;

    broadcastMissionUpdate(room, {
      action: "launch",
      playerId: launchedById || null,
      playerName: launchedByName || "FLIGHT"
    });
    return true;
  }

  socket.on("space_board", () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    if (getTeamForRole(p.role) === "ground") {
      socket.emit("ground_support_event", {
        type: "board_blocked_ground",
        message: "Ground Control operates from Kennedy LCC Firing Room during launch and flight."
      });
      return;
    }
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
    const gs = room.mission.groundSupport || (room.mission.groundSupport = createGroundSupportState());
    const hasGround = roomHasGroundCrew(room);

    // If sender is Ground (or GO/NO-GO is already approved, or no Ground exists), release immediately
    if (getTeamForRole(p.role) === "ground") {
      gs.goNoGoLaunch = true;
      gs.goNoGoBy = p.name;
      gs.goNoGoAt = now;
    }

    if (!hasGround || gs.goNoGoLaunch) {
      triggerRoomLaunch(room, socket.id, p.name);
      return;
    }

    // Advisory GO/NO-GO Poll: if Flight Crew clicks LAUNCH a second time (>=1.2s later),
    // override cleanly; otherwise hold briefly for LCC approval with an 8-second fail-safe.
    const pollAge = room.mission.launchPollAt ? (now - room.mission.launchPollAt) : Infinity;
    if (room.mission.launchPollAt && pollAge >= 1200 && pollAge < 10000) {
      triggerRoomLaunch(room, socket.id, p.name);
      return;
    }

    room.mission.launchPollAt = now;
    room.mission.launchPollBy = socket.id;
    room.mission.dockLocked = true;
    if (getTeamForRole(p.role) !== "ground") {
      room.mission.boarded[socket.id] = room.mission.boarded[socket.id] || now;
    }
    room.mission.updatedAt = now;

    if (room.launchPollTimer) clearTimeout(room.launchPollTimer);
    const roomRef = room;
    const triggerId = socket.id;
    const triggerName = p.name;
    room.launchPollTimer = setTimeout(() => {
      if (roomRef.mission && roomRef.mission.phase === "gantry") {
        triggerRoomLaunch(roomRef, triggerId, triggerName);
      }
    }, 8000);

    broadcastMissionUpdate(room, {
      action: "go_nogo_poll",
      playerId: socket.id,
      playerName: p.name
    });
    io.to(currentRoomId).emit("ground_support_event", {
      type: "go_nogo_poll",
      byId: socket.id,
      byName: p.name,
      byRole: p.role,
      autoReleaseMs: 8000
    });
  });

  // Ground Control Operations Actions (Advisory — Enhances Launch/Dock/Systems, never soft-locks)
  socket.on("ground_action", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p || room.status !== "playing") return;
    if (getTeamForRole(p.role) !== "ground" && socket.id !== room.hostId) return;

    const now = Date.now();
    if (socket.lastGroundActionAt && now - socket.lastGroundActionAt < 300) return;
    socket.lastGroundActionAt = now;

    room.mission = room.mission || createMissionState();
    const gs = room.mission.groundSupport || (room.mission.groundSupport = createGroundSupportState());
    const type = String(data.type || "").trim().slice(0, 32);

    if (type === "go_nogo_launch") {
      gs.goNoGoLaunch = true;
      gs.goNoGoBy = p.name;
      gs.goNoGoAt = now;
      room.mission.updatedAt = now;

      io.to(currentRoomId).emit("ground_support_event", {
        type: "go_nogo_launch",
        byId: socket.id,
        byName: p.name,
        byRole: p.role
      });

      const flightIds = getFlightCrewIds(room);
      const boardedCount = flightIds.filter((id) => room.mission.boarded && room.mission.boarded[id]).length;
      if (room.mission.phase === "gantry" && (room.mission.launchPollAt || (flightIds.length > 0 && boardedCount >= flightIds.length))) {
        triggerRoomLaunch(room, socket.id, p.name);
        return;
      }
      broadcastMissionUpdate(room, { action: "ground_go", playerId: socket.id, playerName: p.name });
      return;
    }

    if (type === "docking_clearance") {
      gs.dockingClearance = true;
      gs.dockingClearanceBy = p.name;
      gs.dockingAssistCount = (gs.dockingAssistCount || 0) + 1;
      room.mission.updatedAt = now;
      io.to(currentRoomId).emit("ground_support_event", {
        type: "docking_clearance",
        byId: socket.id,
        byName: p.name,
        byRole: p.role
      });
      if (room.mission.phase === "docking") {
        io.to(currentRoomId).emit("docking_assist_event", {
          kind: "boresight",
          playerId: socket.id,
          playerName: p.name,
          role: p.role,
          pilotId: resolveDockingPilotId(room)
        });
      }
      broadcastMissionUpdate(room, { action: "ground_docking_clearance", playerId: socket.id, playerName: p.name });
      return;
    }

    if (type === "dsn_lock") {
      gs.dsnLocked = true;
      gs.dsnLockedBy = p.name;
      room.mission.updatedAt = now;
      io.to(currentRoomId).emit("ground_support_event", {
        type: "dsn_lock",
        byId: socket.id,
        byName: p.name,
        byRole: p.role
      });
      broadcastMissionUpdate(room, { action: "ground_dsn_lock", playerId: socket.id, playerName: p.name });
      return;
    }

    if (type === "power_route") {
      gs.powerRouted = true;
      gs.powerRoutedBy = p.name;
      room.mission.updatedAt = now;
      io.to(currentRoomId).emit("ground_support_event", {
        type: "power_route",
        byId: socket.id,
        byName: p.name,
        byRole: p.role
      });
      broadcastMissionUpdate(room, { action: "ground_power_route", playerId: socket.id, playerName: p.name });
      return;
    }

    if (type === "science_downlink") {
      gs.scienceCleared = true;
      gs.scienceClearedBy = p.name;
      room.mission.updatedAt = now;
      io.to(currentRoomId).emit("ground_support_event", {
        type: "science_downlink",
        byId: socket.id,
        byName: p.name,
        byRole: p.role
      });
      broadcastMissionUpdate(room, { action: "ground_science_downlink", playerId: socket.id, playerName: p.name });
      return;
    }

    if (type === "ping_room") {
      const targetRoom = String(data.targetRoom || "HUB").toUpperCase().slice(0, 16);
      const roomLabels = {
        HUB: "Main Hub / Mission Goal",
        CMD: "Navigation & Rocket Control",
        PWR: "Solar Power & Hardware Bay",
        SCI: "Science & Experiment Lab",
        LSS: "Heating, -80C Freezer & Shields",
        HULL: "Radio Dishes & Engines Bay",
        PAD: "Launch Pad & Boarding Bridge"
      };
      const message = String(data.message || `ATTENTION NEEDED AT ${roomLabels[targetRoom] || targetRoom}`)
        .replace(/[\u0000-\u001F\u007F<>]/g, "")
        .trim()
        .slice(0, 96);
      gs.activePing = {
        roomId: targetRoom,
        roomLabel: roomLabels[targetRoom] || targetRoom,
        message,
        byName: p.name,
        byRole: p.role,
        at: now
      };
      room.mission.updatedAt = now;
      io.to(currentRoomId).emit("ground_support_event", {
        type: "ping_room",
        ping: gs.activePing,
        byId: socket.id,
        byName: p.name,
        byRole: p.role
      });
      broadcastMissionUpdate(room, { action: "ground_ping", playerId: socket.id, playerName: p.name });
      return;
    }

    if (type === "clear_ping") {
      gs.activePing = null;
      room.mission.updatedAt = now;
      broadcastMissionUpdate(room, { action: "ground_clear_ping", playerId: socket.id });
    }
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
    if (getTeamForRole(p.role) === "ground" && socket.id !== room.hostId) return;

    room.mission.skipVotes = room.mission.skipVotes || {};
    room.mission.skipVotes[socket.id] = true;
    room.mission.updatedAt = Date.now();

    const flightIds = getFlightCrewIds(room);
    const voteCount = Object.keys(room.mission.skipVotes).filter((id) => room.players[id] && getTeamForRole(room.players[id].role) !== "ground").length;
    const majority = Math.max(1, Math.ceil(flightIds.length / 2));
    const isAuthority = socket.id === room.hostId || normalizeRoleId(p.role) === "commander";

    if (flightIds.length <= 1 || isAuthority || voteCount >= majority) {
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
      const flightIds = getFlightCrewIds(room);
      const elapsedMs = Date.now() - (room.mission.phaseStartedAt || 0);
      const isNaturalOrAuthority = !!data.naturalEnd || elapsedMs >= 26000 || flightIds.length <= 1 || socket.id === room.hostId || normalizeRoleId(p.role) === "commander";
      if (isNaturalOrAuthority) {
        enterRoomDockingPhase(room, socket.id);
      } else {
        room.mission.skipVotes = room.mission.skipVotes || {};
        room.mission.skipVotes[socket.id] = true;
        const voteCount = Object.keys(room.mission.skipVotes).filter((id) => room.players[id] && getTeamForRole(room.players[id].role) !== "ground").length;
        if (voteCount >= Math.max(1, Math.ceil(flightIds.length / 2))) {
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
    if (getTeamForRole(p.role) === "ground" && socket.id !== room.hostId) return;

    const requestedTargetId = data.targetId || data.pilotId;
    let targetPilotId = getTeamForRole(p.role) !== "ground" ? socket.id : resolveDockingPilotId(room);
    if (requestedTargetId && room.players[requestedTargetId] && getTeamForRole(room.players[requestedTargetId].role) !== "ground") {
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

    const flightIds = getFlightCrewIds(room);
    const activePilotId = resolveDockingPilotId(room);
    const isAuthority = flightIds.length <= 1 || socket.id === room.hostId || socket.id === activePilotId || normalizeRoleId(p.role) === "commander" || !!data.corridorCapture;
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
      if (getTeamForRole(room.players[pid].role) !== "ground") {
        room.mission.boarded[pid] = room.mission.boarded[pid] || now;
      }
    }
    room.systems.docking = { range: 0, velocity: 0, alignment: 0, latchesLocked: true };

    broadcastMissionUpdate(room, {
      action: "docked",
      playerId: socket.id,
      playerName: p.name
    });
  });

  // 5c. Shared crew reset back to the launch pad. This aborts any in-flight
  // ascent/docking sequence and respawns every astronaut in their zone, so a
  // player pressing [G] or the PAD button never desyncs the rest of the room.
  socket.on("space_reset", () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;

    const now = Date.now();
    if (socket.lastMissionResetAt && now - socket.lastMissionResetAt < 1500) return;
    socket.lastMissionResetAt = now;

    if (room.launchPollTimer) {
      clearTimeout(room.launchPollTimer);
      room.launchPollTimer = null;
    }

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

    Object.keys(room.players).forEach((pid) => {
      room.players[pid].tasksDone = 0;
    });
    repositionPlayersForGantry(room);

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
        reason: `${debrief.scenarioCode} COMPLETE — ALL ${debrief.totalObjectives} SHARED OBJECTIVES VERIFIED BY FLIGHT & GROUND CREW`
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

    if (room.launchPollTimer) {
      clearTimeout(room.launchPollTimer);
      room.launchPollTimer = null;
    }

    const scenarioId = (room.mission && room.mission.scenarioId) || "lunar_south_pole";
    const difficultyId = (room.mission && room.mission.difficultyId) || "engineer";
    const opsMode = (room.mission && VALID_OPS_MODES.has(room.mission.opsMode)) ? room.mission.opsMode : "iss_expedition";

    room.status = "lobby";
    room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
    room.completedTaskIds = {};
    room.swapRequests = {};
    room.mission = createMissionState(scenarioId, difficultyId, opsMode);
    room.shuttleMission = null;
    room.shuttleInputs = {};
    room.shuttleResultRecorded = false;
    room.shuttleTestFreeze = false;
    room.systems.docking = { range: 18.5, velocity: 0.30, alignment: 3.5, latchesLocked: false };
    room.systems.dockingState = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;

    Object.keys(room.players).forEach((pid) => {
      room.players[pid].tasksDone = 0;
    });
    repositionPlayersForGantry(room);

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
      team: p.team || getTeamForRole(p.role),
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
    if (room.shuttleInputs) {
      delete room.shuttleInputs[socket.id];
    }
    if (room.swapRequests) {
      for (const [reqId, req] of Object.entries(room.swapRequests)) {
        if (req.fromId === socket.id || req.toId === socket.id) {
          delete room.swapRequests[reqId];
        }
      }
    }
    if (room.mission && room.mission.boarded) {
      delete room.mission.boarded[socket.id];
      if (room.mission.skipVotes) delete room.mission.skipVotes[socket.id];
      room.mission.updatedAt = Date.now();
    }

    const remainingIds = Object.keys(room.players);
    if (remainingIds.length === 0) {
      if (room.launchPollTimer) {
        clearTimeout(room.launchPollTimer);
        room.launchPollTimer = null;
      }
      room.status = "lobby";
      room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
      room.completedTaskIds = {};
      room.swapRequests = {};
      room.manualSwapOccurred = false;
      room.mission = createMissionState();
      room.shuttleMission = null;
      room.shuttleInputs = {};
      room.shuttleResultRecorded = false;
      room.shuttleTestFreeze = false;
      room.systems.dockingPilotId = null;
      room.systems.dockingState = null;
    } else {
      if (room.hostId === socket.id) {
        room.hostId = remainingIds[0];
        room.players[remainingIds[0]].isHost = true;
        db.upsertGameRoom(leavingRoomId, room.players[remainingIds[0]].userId || remainingIds[0], room.status).catch(() => {});
      }
      // Always guarantee at least 1 Flight Crewmember remains so a room never strands
      if (getFlightCrewIds(room).length === 0) {
        const candidate = room.players[room.hostId] || room.players[remainingIds[0]];
        if (candidate) {
          candidate.role = "commander";
          candidate.team = "crew";
          if (room.mission && room.mission.phase === "gantry") {
            candidate.pos = groundSpawnFor(0);
          } else if (room.mission && (room.mission.phase === "docking" || room.mission.phase === "station")) {
            candidate.pos = stationSpawnFor(0);
            room.mission.boarded[candidate.id] = Date.now();
          }
        }
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
    if (remainingIds.length > 0 && room.status === "playing" && room.shuttleMission) {
      sendShuttleSnapshot(room);
    }
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
