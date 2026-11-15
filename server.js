// SI-ASSISTED: drafted/edited with Super Intelligence assistance.
// See SI-DISCLOSURE.md in the repository root for scope and review notes.
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const crypto = require("crypto");
const express = require("express");
const { Server } = require("socket.io");
const db = require("./server/db");
const storage = require("./server/storage");
const { MISSION_DESIGN_KEYS, sanitizeDesignPatch } = require("./server/design_sanitizer");
const { validateFinalReport } = require("./server/mission_validation");
const { propagateCoast } = require("./server/gmat-propagation");
const { guardSocket } = require("./server/socket_guard");
const { ShuttleMission, CREW: SHUTTLE_CREW } = require("./public/js/game/shuttle_mission.js");
const { ArtemisMission, DUTIES: ARTEMIS_DUTIES, COMMAND_DUTY: ARTEMIS_COMMAND_DUTY } = require("./public/js/game/artemis_mission.js");
const gmatForecast = require("./server/gmat_forecast");
const planetSeeds = require("./public/data/gmat-planet-seeds.json");
const coverageRoom = require("./server/coverage_room.js");

const SHUTTLE_SNAPSHOT_HZ = 15;
const SHUTTLE_TEST_HOOKS = process.env.SHUTTLE_TEST === "1";
const VALID_OPS_MODES = new Set(["iss_expedition", "shuttle_flight"]);

// Only trust X-Forwarded-For when the immediate peer is a private/loopback
// proxy (Railway, local reverse proxy). A directly exposed public client can
// never spoof req.ip and bypass the HTTP rate limiters.
function isPrivateOrLoopbackAddress(address) {
  const raw = String(address || "").trim();
  if (!raw) return false;
  const mapped = raw.startsWith("::ffff:") ? raw.slice(7) : raw;
  if (net.isIPv4(mapped)) {
    const parts = mapped.split(".").map(Number);
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    );
  }
  if (net.isIPv6(mapped)) {
    const lower = mapped.toLowerCase();
    return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  }
  return false;
}

function resolveTrustProxySetting() {
  const configured = process.env.TRUST_PROXY;
  if (configured === "false") return false;
  if (configured === "true") return true;
  if (configured && /^\d+$/.test(configured)) return Number(configured);
  // Default: trust exactly the socket peer when it is a private/loopback
  // reverse proxy. Direct public connections keep their real socket address.
  return (address, index) => index === 0 && isPrivateOrLoopbackAddress(address);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", resolveTrustProxySetting());
const server = http.createServer(app);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedSocketOrigin(request) {
  const origin = request && request.headers && request.headers.origin;
  // Non-browser clients (tests, game launchers) do not send Origin.
  if (!origin) return true;
  if (allowedOrigins.includes("*")) return true;
  if (allowedOrigins.length > 0) return allowedOrigins.includes(origin);
  const host = request.headers.host;
  if (!host) return false;
  return origin === `https://${host}` || origin === `http://${host}`;
}

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ["GET", "POST"]
  },
  // The `cors` option only applies to HTTP long-polling. Validate the Origin
  // on WebSocket upgrades too, so a hostile page cannot open a same-browser
  // socket to this server.
  allowRequest: (request, callback) => callback(null, isAllowedSocketOrigin(request)),
  // Realtime packets are small; 64 KB covers voice chunks and image-free
  // signalling while sharply reducing the bandwidth a hostile socket can burn.
  maxHttpBufferSize: 64 * 1024,
  // Small realtime packets do not benefit from per-message compression; the
  // compression work adds latency and can increase jitter on constrained CPUs.
  perMessageDeflate: false,
  // Socket.IO defaults. The previous 10s/5s heartbeat was aggressive enough
  // that a long shader compile or tab stall could trigger a needless reconnect
  // (and a burst of high-latency traffic on rejoin).
  pingInterval: 25000,
  pingTimeout: 20000
});

// Initialize always-on crew voice relay and camera-free 3D crew link presence
require("./server/voice-signaling")(io);
require("./server/video-signaling")(io);

const PORT = process.env.PORT || 3000;
const DEPLOY_REGION = process.env.SERVER_REGION || process.env.RAILWAY_REPLICA_REGION || process.env.RAILWAY_SERVICE_NAME || "local";

const INDEX_HTML_PATH = path.join(__dirname, "public", "index.html");
let indexHtmlTemplate = null;

function getIndexHtmlTemplate() {
  if (indexHtmlTemplate == null) {
    indexHtmlTemplate = fs.readFileSync(INDEX_HTML_PATH, "utf8");
  }
  return indexHtmlTemplate;
}

function sendIndexHtml(req, res) {
  const nonce = (res.locals && res.locals.cspNonce) || "";
  const html = getIndexHtmlTemplate().split("__CSP_NONCE__").join(nonce);
  res.setHeader("Cache-Control", "no-cache");
  res.type("html").send(html);
}

// Baseline security headers. Inline <script> blocks were removed, so scripts
// are nonce-gated (no 'unsafe-inline'). Styles still rely on inline style
// attributes across the UI, which CSP3 scopes to style-src-attr; dynamic
// <style> elements receive the same per-request nonce from boot.js.
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(18).toString("base64");
  res.locals.cspNonce = nonce;
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com; ` +
    "script-src-attr 'none'; " +
    `style-src 'self' 'nonce-${nonce}'; ` +
    "style-src-attr 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "media-src 'self' blob:; " +
    "connect-src 'self' blob:; " +
    "worker-src 'self' blob:; " +
    "font-src 'self' data:; " +
    "manifest-src 'self'; form-action 'self'; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  next();
});

// Lightweight in-memory rate limiter for HTTP APIs.
function createRateLimiter({ windowMs, max, maxKeys = 20_000 }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    // Bound memory even when a client can influence the address key. Expired
    // entries are swept first; if every entry is fresh, evict oldest keys.
    if (hits.size > maxKeys) {
      for (const [k, v] of hits) {
        if (now - v.start >= windowMs) hits.delete(k);
      }
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
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
app.use("/api/user", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use("/api/auth", createRateLimiter({ windowMs: 60_000, max: 20 }));
app.use("/api", createRateLimiter({ windowMs: 60_000, max: 120 }));
app.use(express.json({ limit: "100kb" }));

// Per-account failed credential lockout. The IP limiter alone can be defeated
// by distributed clients; this adds a bounded, short-lived account backoff.
const LOGIN_FAILURE_LIMIT = 8;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const loginFailures = new Map();

function credentialKey(value) {
  return String(value || "").trim().toLowerCase().slice(0, 64);
}

function credentialLockRemainingMs(key) {
  const entry = loginFailures.get(key);
  if (!entry) return 0;
  if (Date.now() - entry.firstAt > LOGIN_FAILURE_WINDOW_MS) {
    loginFailures.delete(key);
    return 0;
  }
  return Math.max(0, entry.lockedUntil - Date.now());
}

function recordCredentialFailure(key) {
  if (!key) return;
  const now = Date.now();
  let entry = loginFailures.get(key);
  if (!entry || now - entry.firstAt > LOGIN_FAILURE_WINDOW_MS) {
    entry = { firstAt: now, count: 0, lockedUntil: 0 };
  }
  entry.count += 1;
  if (entry.count >= LOGIN_FAILURE_LIMIT) {
    entry.lockedUntil = now + LOGIN_LOCK_MS;
    entry.count = 0;
    entry.firstAt = now;
  }
  loginFailures.set(key, entry);

  if (loginFailures.size > 10_000) {
    for (const [k, value] of loginFailures) {
      if (now - value.firstAt > LOGIN_FAILURE_WINDOW_MS && value.lockedUntil <= now) loginFailures.delete(k);
    }
    while (loginFailures.size > 10_000) {
      const oldest = loginFailures.keys().next().value;
      if (oldest === undefined) break;
      loginFailures.delete(oldest);
    }
  }
}

function clearCredentialFailures(key) {
  if (key) loginFailures.delete(key);
}

function credentialLockedResponse(res, remainingMs) {
  res.setHeader("Retry-After", String(Math.max(1, Math.ceil(remainingMs / 1000))));
  return res.status(429).json({ success: false, error: "Too many failed attempts. Try again later." });
}
app.get("/api/gmat/status", (req, res) => {
  const status = gmatForecast.status();
  // Never disclose the server filesystem path of the GMAT executable.
  res.json({
    available: !!status.available,
    busy: !!status.busy,
    active: Number(status.active) || 0,
    queued: Number(status.queued) || 0,
    maxConcurrent: Number(status.maxConcurrent) || 0,
    maxQueue: Number(status.maxQueue) || 0,
    completedCount: Number(status.completedCount) || 0,
    failedCount: Number(status.failedCount) || 0,
    cancelledCount: Number(status.cancelledCount) || 0
  });
});

// Legacy WebRTC ICE configuration was removed: the current 3D crew link never
// requests camera or microphone media, and the endpoint leaked long-lived TURN
// credentials to unauthenticated callers. If a future media feature needs TURN,
// serve short-lived HMAC credentials from an authenticated endpoint.

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
  return (
    typeof filename === "string" &&
    /^[A-Za-z0-9._-]+$/.test(filename) &&
    !filename.includes("..") &&
    /\.(glb|gltf|bin|obj|mtl|png|jpe?g|webp|ktx2|wasm)$/i.test(filename)
  );
}

function assetContentType(filename) {
  const lower = String(filename || "").toLowerCase();
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".gltf")) return "model/gltf+json";
  if (lower.endsWith(".bin")) return "application/octet-stream";
  return "application/octet-stream";
}

// Player-selected astronaut model ids are rendered by other clients. Restrict
// them to the catalog id charset so a hostile client cannot make every other
// browser request an arbitrary same-origin URL as a "model".
function sanitizeModelId(value) {
  const raw = String(value == null ? "" : value).trim();
  return /^[A-Za-z0-9_-]{1,48}$/.test(raw) ? raw : null;
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
        // Never trust a bucket-supplied MIME type for a same-origin response.
        res.setHeader("Content-Type", assetContentType(filename));
        res.setHeader("X-Content-Type-Options", "nosniff");
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

// The app shell needs a per-request CSP nonce, so serve it through the
// templating helper instead of express.static.
app.get(["/", "/index.html"], sendIndexHtml);

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
    const key = credentialKey(username);
    const lockMs = credentialLockRemainingMs(key);
    if (lockMs > 0) return credentialLockedResponse(res, lockMs);

    const result = await db.loginUser(username, password);
    if (!result.success) {
      recordCredentialFailure(key);
      return res.status(400).json(result);
    }
    clearCredentialFailures(key);
    res.json(await attachSession(result));
  } catch (err) {
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body || {};
    const key = credentialKey(username);
    const lockMs = credentialLockRemainingMs(key);
    if (lockMs > 0) return credentialLockedResponse(res, lockMs);

    const result = await db.resetPassword(username, currentPassword, newPassword);
    if (!result.success) {
      recordCredentialFailure(key);
      return res.status(400).json(result);
    }
    clearCredentialFailures(key);
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
    const activeRooms = await db.getActiveRoomsList(DEPLOY_REGION);
    res.json({ success: true, rooms: activeRooms });
  } catch (err) {
    res.status(500).json({ success: false, error: "Unable to load rooms" });
  }
});

// CubeSat coverage: SGP4 library (satellite.js, MIT) served from node_modules;
// a clean 404 if the optional dependency is not installed.
app.get("/vendor/satellite.min.js", (req, res) => {
  const file = path.join(__dirname, "node_modules", "satellite.js", "dist", "satellite.min.js");
  try {
    if (fs.existsSync(file)) return res.type("application/javascript").send(fs.readFileSync(file));
  } catch (err) {
    console.error("[COVERAGE] Could not read satellite.js:", err.message);
  }
  res.status(404).type("application/javascript").send("/* satellite.js not installed: Real Satellite mode unavailable */");
});
// CubeSat coverage: CelesTrak GP / SatNOGS station proxy with caching and an error budget.
require("./server/coverage_data.js")(app);

// Fallback route to serve index.html for client-side navigation. Unknown API
// routes get a JSON 404 instead of the app shell.
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: "Not found" });
  }
  if (req.method === "GET") {
    sendIndexHtml(req, res);
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
// Earth Control duties are exclusive too: the Flight Director clears launch
// and docking and manages crew alerts; Ground Systems owns the dish, power and
// science links.
const GROUND_ACTION_ROLES = {
  go_nogo_launch: ["flight_director"],
  docking_clearance: ["flight_director"],
  ping_room: ["flight_director"],
  clear_ping: ["flight_director"],
  dsn_lock: ["ground_capcom"],
  power_route: ["ground_capcom"],
  science_downlink: ["ground_capcom"]
};
const MAX_PLAYERS = 6;
const GAME_MODE = "coop";
const ACTIVITIES = ["shuttle", "coverage"];
const FLIGHTS = ["deploy", "iss"];
const SUIT_COLORS = ["#c9f04b", "#63e6a8", "#ff6b6b", "#7dd3fc", "#8a8194", "#efeee7"];

function getTeamForRole(roleId) {
  return GROUND_ROLES.includes(roleId) ? "ground" : "crew";
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function isKnownScenario(scenarioId) {
  return typeof scenarioId === "string" && hasOwn(MISSION_CATALOG, scenarioId);
}

function roomPlayerById(room, playerId) {
  if (!room || !room.players || typeof playerId !== "string") return null;
  return hasOwn(room.players, playerId) ? room.players[playerId] : null;
}

// Shared mission-design patches may be sent by any crewmate (trade studies),
// but only the host can change the scenario/difficulty, and only in the lobby.
function applyRoomDesignPatch(room, socket, rawPatch) {
  if (!room || room.activity === "coverage") return null;
  const patch = sanitizeDesignPatch(rawPatch);
  if (!patch) return null;

  const canChangeMission = socket && socket.id === room.hostId && room.status === "lobby";
  if (!canChangeMission) {
    delete patch.scenarioId;
    delete patch.difficultyId;
  }
  if (hasOwn(patch, "scenarioId") && !isKnownScenario(patch.scenarioId)) delete patch.scenarioId;
  if (hasOwn(patch, "difficultyId") && !DIFFICULTY_IDS.has(patch.difficultyId)) delete patch.difficultyId;
  if (Object.keys(patch).length === 0) return null;

  room.mission = room.mission || createMissionState();
  room.mission.design = Object.assign({}, room.mission.design || {}, patch);
  if (patch.scenarioId) room.mission.scenarioId = patch.scenarioId;
  if (patch.difficultyId) room.mission.difficultyId = patch.difficultyId;
  room.mission.updatedAt = Date.now();
  return patch;
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
const EMOTE_IDS = new Set(["wave", "salute", "dance", "laugh", "look", "heart", "salsa", "footloose", "woowalk", "breakdance"]);

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
    role: "specialist",
    dependsOn: ["task_hull", "task_lss"]
  }
];

const COOP_OBJECTIVE_IDS = new Set(MISSION_OBJECTIVES.map((o) => o.id));
const COOP_OBJECTIVE_ID_LIST = MISSION_OBJECTIVES.map((o) => o.id);

const MISSION_CATALOG = {
  artemis_expedition: {
    id: "artemis_expedition",
    name: "Artemis Lunar Expedition (Training)",
    code: "ARTEMIS",
    badge: "LUNAR EXPEDITION",
    summary: "Launch on SLS, fly Orion to lunar orbit, dock with a Blue Moon-style lander, land at the south pole, return samples, and splash down. Dated training scenario, not an exact reconstruction."
  },
  cubesat_101: {
    id: "cubesat_101",
    name: "Pocket Mini-Satellite Builder",
    code: "MINI-SAT",
    badge: "STARTER KIT",
    summary: "Design a tiny shoebox-sized student satellite from start to finish, launched from the Space Station and cleanly retired in 5 years."
  },
  bionutrients_2: {
    id: "bionutrients_2",
    name: "BioNutrients-2 Space Food Lab",
    code: "BIONUTRIENTS-2",
    badge: "SPACE STATION LAB",
    summary: "Send compact clear pouches on a supply ship, add Space Station drinking water, keep warm at 30°C with a 6-hour shake to make fresh Vitamin A nutrients, and freeze at -80°C for Earth lab testing."
  },
  sandbox: {
    id: "sandbox",
    name: "Free-Build Sandbox (Custom Plan)",
    code: "SANDBOX",
    badge: "OPEN PLAY",
    summary: "Test any rocket, spacecraft body, camera, or destination freely without tight money limits."
  }
};

const DIFFICULTY_IDS = new Set(["cadet", "engineer", "director"]);


const ROLE_INFO = {
  flight_director: {
    id: "flight_director",
    short: "BOSS",
    team: "ground",
    title: "Mission Boss",
    callsign: "EARTH-BOSS",
    color: "#38bdf8",
    primaryDuty: "Earth Control Lead: Give final Launch & Docking OK, alert rooms, and review the mission plan",
    padDuty: "Check launch pad readiness and give final GO for liftoff from Earth Control",
    dockDuty: "Give final clearance for orbital approach and station hook-up from Earth Control",
    stationRooms: ["LCC", "ORBIT", "HUB"]
  },
  ground_capcom: {
    id: "ground_capcom",
    short: "COM",
    team: "ground",
    title: "Earth Comms",
    callsign: "EARTH-COM",
    color: "#60a5fa",
    primaryDuty: "Earth Dish & Systems Helper: all-crew voice, lock Earth dishes, route power, and clear science downloads",
    padDuty: "Check crew comms, clear skies, and launch pad cables from Earth Control",
    dockDuty: "Watch approach speed, lock Earth dish, and clear science data",
    stationRooms: ["LCC", "COMMS", "PWR"]
  },
  commander: {
    id: "commander",
    short: "CAPT",
    team: "crew",
    title: "Captain",
    callsign: "SHIP-CAPT",
    color: "#c08a8a",
    primaryDuty: "Start Liftoff [L], Fly Space Docking [WASD/QE] & run Goal / Flight Path desks [HUB, CMD]",
    padDuty: "Board the spaceship and trigger Liftoff [L]",
    dockDuty: "Main Docking Pilot & Lock Hatch Latches [SPACE]",
    stationRooms: ["HUB", "CMD", "LDR"]
  },
  engineer: {
    id: "engineer",
    short: "ENG",
    team: "crew",
    title: "Flight Engineer",
    callsign: "SHIP-ENG",
    color: "#d0a15c",
    primaryDuty: "Move Boarding Bridge [F], Steady Thrusters [1/2] & run Power / Engine desks [PWR, HULL]",
    padDuty: "Extend & lock the Boarding Bridge [F]",
    dockDuty: "Steadier Thrusters [1] & Fine Steering [2]",
    stationRooms: ["PWR", "HULL", "LDR"]
  },
  scientist: {
    id: "scientist",
    short: "SCI",
    team: "crew",
    title: "Science Officer",
    callsign: "LAB-SCI",
    color: "#7fb8a6",
    primaryDuty: "Pre-launch Health Check, Auto-Line-Up Helper [3/4] & run Science / Cooling desks [SCI, LSS]",
    padDuty: "Finish boarding prep and health check before launch",
    dockDuty: "Auto-Align Guide [3] & Tunnel Signal Check [4]",
    stationRooms: ["SCI", "LSS", "LDR"]
  },
  specialist: {
    id: "specialist",
    short: "SPEC",
    team: "crew",
    title: "Spacewalk Specialist",
    callsign: "CREW-SPEC",
    color: "#a78bfa",
    primaryDuty: "Spacewalk & Docking Helper [3/4], Final Test Run [LDR] & Radio Relay [SCI, HULL]",
    padDuty: "Help check boarding bridge and cabin seal",
    dockDuty: "Tunnel Signal Check [4] & Hatch Readiness",
    stationRooms: ["EVA", "LDR", "SCI", "HUB"]
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
  const currentPlayer = roomPlayerById(room, current);
  if (currentPlayer && getTeamForRole(currentPlayer.role) !== "ground") {
    return current;
  }
  const cmd = pool.find((p) => normalizeRoleId(p.role) === "commander");
  if (cmd) return cmd.id;
  const hostPlayer = roomPlayerById(room, room.hostId);
  if (hostPlayer && getTeamForRole(hostPlayer.role) !== "ground") {
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
  // Crew staging bays in front of the boarding-bridge threshold and safely
  // clear (>2.7m) of the Arm Control proximity trigger at (-25.9, -6.3) so
  // joining slots never accidentally auto-lock the access arm on spawn.
  const slots = [
    [-29.8, 64.1, -10.6],
    [-30.9, 64.1, -10.6],
    [-29.8, 64.1, -9.2],
    [-30.9, 64.1, -9.2],
    [-29.8, 64.1, -7.8],
    [-30.9, 64.1, -7.8]
  ];
  return slots[index % slots.length].slice();
}

function groundSpawnLccFor(index = 0) {
  // Open aisle inside LCC Firing Room, one slot behind each operator station,
  // facing the North Launch Wall Screen, console monitors, and LC-39A.
  const slots = [
    [-208.3, 0.25, 185.5],
    [-197.7, 0.25, 185.5],
    [-204.5, 0.25, 185.5],
    [-201.0, 0.25, 185.5]
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
    const roleSlot = normalizeRoleId(role, "commander") === "ground_capcom" ? 1 : 0;
    return groundSpawnLccFor(roleSlot);
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
function createMissionState(scenarioId = "cubesat_101", difficultyId = "engineer", opsMode = "iss_expedition") {
  const scenario = isKnownScenario(scenarioId) ? scenarioId : "cubesat_101";
  const difficulty = DIFFICULTY_IDS.has(difficultyId) ? difficultyId : "engineer";
  const mode = VALID_OPS_MODES.has(opsMode) ? opsMode : "iss_expedition";
  const isArtemis = scenario === "artemis_expedition";
  const now = Date.now();
  return {
    opsMode: mode, // iss_expedition | shuttle_flight
    flightProfile: isArtemis ? "artemis" : "shuttle_iss",
    // Main missions now inherit the interactive Shuttle launch/ascent and hand
    // off to the ISS docking phase at orbit insertion. `shuttle_flight` keeps
    // the standalone launch-to-runway training flight. Artemis uses its own
    // server-authoritative simulation instead of the Shuttle flight model.
    flightMode: isArtemis ? "artemis" : (mode === "shuttle_flight" ? "standalone_shuttle" : "shuttle_docking"),
    phase: isArtemis ? "artemis" : "gantry", // gantry -> launch -> docking -> station
    dockLocked: false,
    boarded: {}, // socketId -> timestamp
    skipVotes: {}, // socketId -> true (launch cutscene skip readiness)
    launchSpeed: 1, // 1x | 3x shared launch cinematic speed
    launchedBy: null,
    dockedBy: null,
    launchPollAt: 0,
    launchPollBy: null,
    groundSupport: createGroundSupportState(),
    specialistFlight: null,
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

// Each station objective belongs to one role. The preferred role owns the
// console when it is staffed; if it is not, the objective is reassigned to the
// least-loaded station role so solo and small crews can still complete the
// mission. Once assigned, only that role can complete the objective.
function resolveMissionObjectiveAssignments(room) {
  const assignments = {};
  const crewRoles = [];
  if (room && room.players) {
    Object.values(room.players).forEach((player) => {
      if (!player || getTeamForRole(player.role) === "ground") return;
      const role = normalizeRoleId(player.role, "commander");
      if (FLIGHT_ROLES.includes(role) && !crewRoles.includes(role)) crewRoles.push(role);
    });
  }
  const loads = {};
  crewRoles.forEach((role) => { loads[role] = 0; });

  MISSION_OBJECTIVES.forEach((objective) => {
    const preferred = objective.role === "all"
      ? "all"
      : normalizeRoleId(objective.role, "commander");
    let assigned = preferred;
    if (preferred !== "all" && crewRoles.length > 0 && !crewRoles.includes(preferred)) {
      assigned = crewRoles.slice().sort((a, b) => {
        const loadDiff = (loads[a] || 0) - (loads[b] || 0);
        if (loadDiff !== 0) return loadDiff;
        return FLIGHT_ROLES.indexOf(a) - FLIGHT_ROLES.indexOf(b);
      })[0];
    }
    assignments[objective.id] = assigned;
    if (assigned !== "all" && loads[assigned] != null) loads[assigned] += 1;
  });

  return assignments;
}

function canPlayerCompleteMissionObjective(room, player, objective) {
  if (!objective) return true;
  const assignments = resolveMissionObjectiveAssignments(room);
  const assignedRole = assignments[objective.id]
    || (objective.role === "all" ? "all" : normalizeRoleId(objective.role, "commander"));
  if (assignedRole === "all") return true;
  return normalizeRoleId(player && player.role, "commander") === assignedRole;
}

function isMissionComplete(mission) {
  return MISSION_OBJECTIVES.every((objective) => mission && mission.completed && mission.completed[objective.id]);
}

function serializeMission(mission, room = null) {
  const m = mission || createMissionState();
  const scenario = isKnownScenario(m.scenarioId) ? MISSION_CATALOG[m.scenarioId] : MISSION_CATALOG.cubesat_101;
  return {
    opsMode: VALID_OPS_MODES.has(m.opsMode) ? m.opsMode : "iss_expedition",
    flightProfile: m.flightProfile || "shuttle_iss",
    flightMode: m.flightMode || (m.opsMode === "shuttle_flight" ? "standalone_shuttle" : "shuttle_docking"),
    phase: m.phase,
    artemisPhase: room && room.artemisMission ? room.artemisMission.phase : null,
    artemisResult: room && room.artemisMission ? room.artemisMission.result : null,
    dockLocked: !!m.dockLocked,
    boarded: Object.keys(m.boarded || {}),
    skipVotes: Object.keys(m.skipVotes || {}),
    launchSpeed: m.launchSpeed === 3 ? 3 : 1,
    launchedBy: m.launchedBy || null,
    dockedBy: m.dockedBy || null,
    dockingPilotId: m.dockingPilotId || null,
    launchPollAt: m.launchPollAt || 0,
    launchPollBy: m.launchPollBy || null,
    groundSupport: m.groundSupport || createGroundSupportState(),
    specialistFlight: m.specialistFlight || null,
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
    objectiveAssignments: resolveMissionObjectiveAssignments(room),
    completedObjectives: completedMissionObjectiveIds(m),
    availableObjectives: availableMissionObjectiveIds(m),
    design: m.design || null,
    result: m.result || null,
    startedAt: m.startedAt || null,
    completedAt: m.completedAt || null
  };
}

function buildMissionDebrief(room) {
  const mission = room.mission || createMissionState();
  const scenario = isKnownScenario(mission.scenarioId) ? MISSION_CATALOG[mission.scenarioId] : MISSION_CATALOG.cubesat_101;
  const players = Object.values(room.players);
  const nameFor = (socketId) => {
    const player = socketId ? roomPlayerById(room, socketId) : null;
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
    result: mission.result || null,
    completedAt: mission.completedAt || now
  };
}

function broadcastMissionUpdate(room, extra = {}) {
  const payload = {
    roomId: room.id,
    mission: serializeMission(room.mission, room),
    ...extra
  };
  io.to(room.id).emit("mission_update", payload);
  const immediate = !!(extra && (extra.action === "specialist_flight" || extra.action === "objective" || extra.action === "docking" || extra.action === "launch"));
  scheduleRoomSave(room, immediate);
  return payload;
}

const roomSaveTimers = new Map();
const roomSaveInFlight = new Map();
const ROOM_SAVE_DEBOUNCE_MS = 1500;

function memberSnapshotKey(userId, name) {
  if (userId && !String(userId).startsWith("guest_")) {
    return `user:${userId}`;
  }
  const cleanName = String(name || "").trim().toLowerCase();
  return cleanName ? `name:${cleanName}` : `user:${userId || "anon"}`;
}

function capturePlayerSnapshot(room, p) {
  if (!p) return null;
  return {
    userId: p.userId || null,
    name: p.name,
    color: p.color,
    modelId: p.modelId || null,
    role: p.role,
    team: p.team,
    ready: !!p.ready,
    isHost: !!(room && (room.hostId === p.id || (room.hostUserId && p.userId && room.hostUserId === p.userId))),
    pos: Array.isArray(p.pos) ? [...p.pos] : null,
    yaw: Number(p.yaw || 0),
    pitch: Number(p.pitch || 0),
    isEva: !!p.isEva,
    suitLights: p.suitLights !== false,
    driving: !!p.driving,
    tasksDone: Number(p.tasksDone || 0),
    wasBoarded: !!(room && room.mission && room.mission.boarded && room.mission.boarded[p.id]),
    wasDockingPilot: !!(room && room.systems && room.systems.dockingPilotId === p.id),
    updatedAt: Date.now()
  };
}

function syncRoomMemberSnapshots(room) {
  if (!room) return;
  if (!room.memberSnapshots || typeof room.memberSnapshots !== "object") {
    room.memberSnapshots = {};
  }
  for (const p of Object.values(room.players || {})) {
    const key = memberSnapshotKey(p.userId, p.name);
    room.memberSnapshots[key] = capturePlayerSnapshot(room, p);
  }
}

function findSavedMemberSnapshot(room, userId, name) {
  const snaps = room && room.memberSnapshots;
  if (!snaps || typeof snaps !== "object") return null;
  if (userId && !String(userId).startsWith("guest_") && snaps[`user:${userId}`]) {
    return { key: `user:${userId}`, snapshot: snaps[`user:${userId}`] };
  }
  const nameKey = name ? `name:${String(name).trim().toLowerCase()}` : null;
  if (nameKey && snaps[nameKey]) {
    return { key: nameKey, snapshot: snaps[nameKey] };
  }
  if (name) {
    const lower = String(name).trim().toLowerCase();
    for (const [k, snap] of Object.entries(snaps)) {
      // Never let a guest claim a credential-backed snapshot by copying the
      // display name of a disconnected authenticated player.
      if (!k.startsWith("name:")) continue;
      if (snap && String(snap.name || "").trim().toLowerCase() === lower) {
        return { key: k, snapshot: snap };
      }
    }
  }
  return null;
}

function serializeRoomForDb(room) {
  syncRoomMemberSnapshots(room);
  const missionCopy = room.mission ? JSON.parse(JSON.stringify(room.mission)) : null;
  if (missionCopy && missionCopy.specialistFlight) {
    missionCopy.specialistFlight.forecastPending = false;
  }
  return {
    id: room.id,
    hostId: room.hostId || null,
    hostUserId: room.hostUserId || null,
    createdAt: room.createdAt || Date.now(),
    lastActivityAt: room.lastActivityAt || Date.now(),
    emptySince: room.emptySince || null,
    mode: room.mode || GAME_MODE,
    maxPlayers: room.maxPlayers || MAX_PLAYERS,
    status: room.status || "lobby",
    isPublic: room.isPublic !== false,
    isSolo: !!room.isSolo,
    manualSwapOccurred: !!room.manualSwapOccurred,
    completedTaskIds: room.completedTaskIds || {},
    systems: room.systems || {},
    tasks: room.tasks || { completed: 0, total: COOP_OBJECTIVE_IDS.size },
    mission: missionCopy,
    shuttleMission: room.shuttleMission && typeof room.shuttleMission.serializeState === "function"
      ? room.shuttleMission.serializeState()
      : null,
    shuttleResultRecorded: !!room.shuttleResultRecorded,
    shuttleHandedOff: !!room.shuttleHandedOff,
    shuttleTestFreeze: !!room.shuttleTestFreeze,
    memberSnapshots: room.memberSnapshots || {},
    chatHistory: Array.isArray(room.chatHistory) ? room.chatHistory.slice(-40) : []
  };
}

async function saveRoomSnapshotNow(room) {
  if (!room || !room.id || !rooms[room.id]) return;
  const roomId = room.id;
  if (roomSaveTimers.has(roomId)) {
    clearTimeout(roomSaveTimers.get(roomId));
    roomSaveTimers.delete(roomId);
  }
  if (roomSaveInFlight.has(roomId)) {
    try {
      await roomSaveInFlight.get(roomId);
    } catch (_) {}
  }

  const runSave = db.saveGameRoomSnapshot(roomId, {
    hostId: room.hostUserId || room.hostId || "system",
    status: room.status || "lobby",
    totalTasks: (room.tasks && room.tasks.total) || COOP_OBJECTIVE_IDS.size,
    completedTasks: (room.tasks && room.tasks.completed) || 0,
    isPublic: room.isPublic !== false,
    opsMode: (room.mission && room.mission.opsMode) || "iss_expedition",
    isSolo: !!room.isSolo,
    serverRegion: DEPLOY_REGION,
    state: serializeRoomForDb(room)
  });

  roomSaveInFlight.set(roomId, runSave);
  try {
    await runSave;
  } finally {
    if (roomSaveInFlight.get(roomId) === runSave) {
      roomSaveInFlight.delete(roomId);
    }
  }
}

function scheduleRoomSave(room, immediate = false) {
  if (!room || !room.id || !rooms[room.id]) return Promise.resolve();
  room.lastActivityAt = Date.now();
  if (immediate) {
    return saveRoomSnapshotNow(room).catch((err) => {
      console.error("[DB] Immediate room save failed:", err.message);
    });
  }
  if (roomSaveTimers.has(room.id)) return Promise.resolve();
  const timer = setTimeout(() => {
    roomSaveTimers.delete(room.id);
    if (rooms[room.id] === room) {
      saveRoomSnapshotNow(room).catch((err) => {
        console.error("[DB] Debounced room save failed:", err.message);
      });
    }
  }, ROOM_SAVE_DEBOUNCE_MS);
  if (typeof timer.unref === "function") timer.unref();
  roomSaveTimers.set(room.id, timer);
  return Promise.resolve();
}

async function flushAllRoomSaves() {
  for (const timer of roomSaveTimers.values()) {
    clearTimeout(timer);
  }
  roomSaveTimers.clear();
  await Promise.all(
    Object.values(rooms).map((room) =>
      saveRoomSnapshotNow(room).catch((err) => {
        console.error("[DB] Shutdown room save failed:", err.message);
      })
    )
  );
}

function completeSpecialistCoast(room) {
  const mission = room && room.mission;
  const flight = mission && mission.specialistFlight;
  if (!room || rooms[room.id] !== room || !flight || flight.stage !== "coast" || !flight.preview) return;
  const preview = flight.preview;
  const insertion = preview.mode === "insertion";
  flight.current = {
    ...flight.current,
    epochMs: preview.endEpochMs,
    state: preview.endState.slice(),
    targetRelativeState: preview.endRelativeState.slice(),
    fuelKg: preview.fuelAfterKg
  };
  flight.revision++;
  flight.lastResult = {
    planet: flight.planet,
    mode: preview.mode,
    closestKm: preview.closestKm,
    closestSamplingHours: preview.closestSamplingHours,
    orbit: preview.orbit,
    fuelUsedKg: preview.fuelUsedKg
  };
  flight.preview = null;
  flight.playback = null;
  if (insertion) {
    flight.stage = preview.orbit && preview.orbit.safeCapture ? "complete" : "missed";
  } else {
    flight.stage =
      preview.earthDeparture &&
      preview.earthDeparture.escaped &&
      preview.closestKm <= preview.targetRadiusKm * 100 &&
      preview.closestKm > preview.targetRadiusKm
        ? "encounter"
        : "missed";
    if (flight.stage === "encounter" && gmatForecast.PLANETS[flight.planet]) {
      const relative = preview.closestRelativeState;
      const r = relative.slice(0, 3);
      const v = relative.slice(3, 6);
      const norm = (vector) => Math.hypot(...vector);
      const cross = (a, b) => [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ];
      const unit = (vector) => {
        const length = norm(vector);
        return vector.map((n) => n / length);
      };
      const vhat = unit(v);
      const nhat = unit(cross(r, v));
      const bhat = cross(vhat, nhat);
      const tangent = unit(cross(nhat, unit(r)));
      const circular = Math.sqrt(gmatForecast.PLANETS[flight.planet].mu / preview.closestKm);
      const delta = tangent.map((n, i) => n * circular - v[i]);
      const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0) * 1000;
      flight.suggestedBurnMps = [dot(delta, vhat), dot(delta, nhat), dot(delta, bhat)];
    }
  }
  mission.updatedAt = Date.now();
  broadcastMissionUpdate(room, {
    action: "specialist_flight",
    playerId: flight.operatorId || null,
    playerName: flight.executedBy || "Space Specialist"
  });
}

function armSpecialistCoastTimer(room, delayMs) {
  if (!room) return;
  if (room.specialistCoastTimer) {
    clearTimeout(room.specialistCoastTimer);
    room.specialistCoastTimer = null;
  }
  const timer = setTimeout(() => {
    room.specialistCoastTimer = null;
    completeSpecialistCoast(room);
  }, Math.max(50, delayMs));
  if (typeof timer.unref === "function") timer.unref();
  room.specialistCoastTimer = timer;
}

function hydrateRoomFromDb(row) {
  if (!row || !row.state_json) return null;
  const rawState = typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json;
  if (!rawState || typeof rawState !== "object") return null;

  const opsMode = (rawState.mission && rawState.mission.opsMode) || row.ops_mode || "iss_expedition";
  const room = createNewRoom(row.room_id, rawState.hostId || row.host_id, rawState.isPublic !== false, opsMode);
  room.hostUserId = rawState.hostUserId || row.host_id || null;
  room.createdAt = Number(rawState.createdAt) || Date.now();
  room.lastActivityAt = Number(rawState.lastActivityAt) || Date.now();
  room.emptySince = Date.now();
  room.status = rawState.status === "playing" ? "playing" : "lobby";
  room.isPublic = rawState.isPublic !== false;
  room.isSolo = !!(rawState.isSolo || row.is_solo);
  room.manualSwapOccurred = !!rawState.manualSwapOccurred;
  room.completedTaskIds = rawState.completedTaskIds && typeof rawState.completedTaskIds === "object" ? rawState.completedTaskIds : {};
  if (rawState.systems && typeof rawState.systems === "object") {
    room.systems = rawState.systems;
  }
  if (rawState.tasks && typeof rawState.tasks === "object") {
    room.tasks = rawState.tasks;
  }
  if (rawState.mission && typeof rawState.mission === "object") {
    room.mission = rawState.mission;
    if (room.mission.specialistFlight) {
      room.mission.specialistFlight.forecastPending = false;
    }
  }
  if (rawState.shuttleMission) {
    room.shuttleMission = ShuttleMission.fromSerializedState(rawState.shuttleMission, {
      handoffAtOrbit: opsMode !== "shuttle_flight"
    });
    room.shuttleLastTick = Date.now();
    room.shuttleLastSnap = 0;
  }
  room.shuttleResultRecorded = !!rawState.shuttleResultRecorded;
  room.shuttleHandedOff = !!rawState.shuttleHandedOff;
  room.shuttleTestFreeze = !!rawState.shuttleTestFreeze;
  room.memberSnapshots = rawState.memberSnapshots && typeof rawState.memberSnapshots === "object" ? rawState.memberSnapshots : {};
  room.chatHistory = Array.isArray(rawState.chatHistory) ? rawState.chatHistory.slice(-40) : [];

  if (room.mission && room.mission.specialistFlight && room.mission.specialistFlight.stage === "coast") {
    const pb = room.mission.specialistFlight.playback || {};
    const endsAt = Number(pb.endsAt) || (Number(pb.startAt || Date.now()) + Number(pb.durationMs || 10000));
    armSpecialistCoastTimer(room, Math.max(100, endsAt - Date.now()));
  }
  return room;
}

async function restoreActiveRoomsFromDb() {
  const rows = await db.loadActiveGameRooms(DEPLOY_REGION, 180);
  let restored = 0;
  for (const row of rows) {
    if (!row || !row.room_id || rooms[row.room_id]) continue;
    try {
      const hydrated = hydrateRoomFromDb(row);
      if (hydrated) {
        rooms[hydrated.id] = hydrated;
        restored++;
      }
    } catch (err) {
      console.warn(`[RESTORE] Skipped room ${row.room_id}:`, err.message);
    }
  }
  console.log(`[RESTORE] Recovered ${restored} persisted room(s) for region ${DEPLOY_REGION}`);
  return restored;
}

// Shared launch-complex -> docking transition. Kept at module scope because
// both the socket handlers and the authoritative Shuttle physics loop use it:
// merged main missions arrive here automatically at verified orbit insertion.
function enterRoomDockingPhase(room, triggeredById) {
  if (!room || !room.mission) return false;
  if (room.mission.phase === "docking" || room.mission.phase === "station") return false;
  const now = Date.now();
  room.mission.phase = "docking";
  room.mission.skipVotes = {};
  room.mission.launchSpeed = 1;
  room.mission.phaseStartedAt = now;
  room.mission.updatedAt = now;
  room.shuttleInputs = {};
  room.shuttleHandedOff = true;
  if (room.shuttleMission) {
    // A deliberate step-skip may hand off before orbit verification. Halt the
    // flight model so it cannot keep advancing in the background.
    room.shuttleMission.warpReq = 1;
    room.shuttleMission.paused = true;
  }
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
  return true;
}

// A step-skip can also finish docking without a hand-flown soft capture. This
// is the same authoritative terminal state used by space_dock_complete.
function completeRoomDocking(room, dockedById) {
  if (!room || !room.mission) return false;
  if (room.mission.phase !== "launch" && room.mission.phase !== "docking") return false;
  const now = Date.now();
  room.mission.phase = "station";
  room.mission.dockedBy = dockedById || null;
  room.mission.skipVotes = {};
  room.mission.phaseStartedAt = now;
  room.mission.updatedAt = now;
  for (const pid in room.players) {
    if (getTeamForRole(room.players[pid].role) !== "ground") {
      room.mission.boarded[pid] = room.mission.boarded[pid] || now;
    }
  }
  room.systems.docking = { range: 0, velocity: 0, alignment: 0, latchesLocked: true };
  const player = roomPlayerById(room, dockedById);
  broadcastMissionUpdate(room, {
    action: "docked",
    playerId: dockedById || null,
    playerName: player ? player.name : null
  });
  return true;
}

function createNewRoom(roomId, hostId, isPublic = true, opsMode = "iss_expedition") {
  return {
    id: roomId,
    hostId: hostId,
    mode: GAME_MODE,
    activity: "shuttle",
    flight: "deploy",
    coverage: null,
    lastCovClock: 0,
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
    shuttleHandedOff: false,
    artemisMission: null,
    artemisInputs: {},
    artemisSurfaceInputs: {},
    artemisDuties: null,
    artemisLastTick: 0,
    artemisLastSnap: 0,
    artemisResultRecorded: false,
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
    mission: createMissionState("cubesat_101", "engineer", opsMode),
    chatHistory: [],
    hostUserId: null,
    lastActivityAt: Date.now(),
    lastDbFlushAt: 0,
    emptySince: null,
    specialistCoastTimer: null,
    memberSnapshots: {}
  };
}

// Flight crew fill the four Shuttle seats. Ground crew monitor from MCC and do
// not receive flight controls. Unclaimed seats fall back to the Commander/host.
const SHUTTLE_SEAT_PREFS = {
  cdr: ["commander", "flight_director", "engineer", "ground_capcom", "specialist", "scientist"],
  plt: ["engineer", "ground_capcom", "specialist", "scientist", "flight_director", "commander"],
  ms1: ["specialist", "scientist", "engineer", "ground_capcom", "flight_director", "commander"],
  ms2: ["flight_director", "scientist", "ground_capcom", "specialist", "engineer", "commander"]
};

function assignShuttleSeatMap(room) {
  const players = Object.values((room && room.players) || {}).filter((player) => player && getTeamForRole(player.role) !== "ground");
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
  if (room && roomPlayerById(room, room.hostId)) return room.hostId;
  const ids = Object.keys((room && room.players) || {});
  return ids[0] || null;
}

function shuttleCrewAssignments(room) {
  const primary = assignShuttleSeatMap(room);
  const out = {};
  for (const r of SHUTTLE_CREW.roles) {
    const sid = shuttleSeatOwner(room, r);
    const p = roomPlayerById(room, sid);
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

function sendCoverageState(room, socket) {
  if (!room || !room.coverage) return;
  const state = coverageRoom.publicState(room.coverage, room);
  (socket || io.to(room.id)).emit("coverage_state", state);
}
// ISS deployment phase of the CubeSat mission: server-authoritative simulation, snapshots at 10 Hz
function sendDeployState(room, socket, forceAssess) {
  const cov = room.coverage; if (!cov || !cov.deploy) return;
  const d = cov.deploy, withAssess = forceAssess || !!socket || d.sim.st.assessRev !== d.lastAssessRev;
  const snap = coverageRoom.deploySnapshot(cov, room, withAssess);
  if (!socket) { d.lastAssessRev = d.sim.st.assessRev; room.lastDeploySnap = Date.now(); }
  (socket || io.to(room.id)).emit("deploy_state", snap);
}

function sendShuttleSnapshot(room) {
  if (!room || !room.shuttleMission) return null;
  const sn = room.shuttleMission.snapshot();
  sn.crew = shuttleCrewAssignments(room);
  io.to(room.id).emit("shuttle_state", sn);
  return sn;
}

function createRoomShuttleMission(opsMode) {
  return new ShuttleMission({ handoffAtOrbit: opsMode !== "shuttle_flight" });
}

// ── ARTEMIS LUNAR EXPEDITION ───────────────────────────────────────────────
// A separate server-authoritative mission profile. It does not consume the
// Shuttle mission graph or the seven ISS station objectives.
function assignArtemisDuties(room) {
  const crew = Object.values((room && room.players) || {}).filter((p) => p && getTeamForRole(p.role) !== "ground");
  if (!crew.length) return null;
  const byRole = {};
  crew.forEach((p) => { byRole[normalizeRoleId(p.role, "commander")] = p.id; });
  const order = crew.map((p) => p.id);
  const pick = (role, index) => byRole[role] || order[index % order.length];
  const duties = {
    surface_pilot: pick("commander", 0),
    surface_science: pick("scientist", 1),
    orion_nav: pick("specialist", 2),
    orion_systems: pick("engineer", 3)
  };
  const used = new Set();
  for (const duty of Object.keys(duties)) {
    if (!used.has(duties[duty])) { used.add(duties[duty]); continue; }
    const alt = order.find((id) => !used.has(id));
    if (alt) { duties[duty] = alt; used.add(alt); }
  }
  return duties;
}

function artemisDutyPayload(room) {
  const out = {};
  const dutyMap = (room && room.artemisDuties) || {};
  for (const id of Object.keys(ARTEMIS_DUTIES)) {
    const player = roomPlayerById(room, dutyMap[id]);
    out[id] = Object.assign({}, ARTEMIS_DUTIES[id], {
      playerId: dutyMap[id] || null,
      playerName: player ? player.name : null,
      role: player ? player.role : null
    });
  }
  return out;
}

function sendArtemisSnapshot(room) {
  if (!room || !room.artemisMission) return null;
  const sn = room.artemisMission.snapshot();
  sn.duties = artemisDutyPayload(room);
  sn.players = Object.values(room.players || {}).map((p) => ({ id: p.id, name: p.name, role: p.role, team: p.team, color: p.color }));
  sn.roomId = room.id;
  io.to(room.id).emit("artemis_state", sn);
  return sn;
}

function mergedArtemisInputs(room) {
  const duties = (room && room.artemisDuties) || {};
  const surface = {};
  for (const [id, input] of Object.entries((room && room.artemisSurfaceInputs) || {})) {
    if (room.players && room.players[id]) surface[id] = input;
  }
  return {
    docking: (room.artemisInputs && room.artemisInputs[duties.orion_nav]) || {},
    descent: (room.artemisInputs && room.artemisInputs[duties.surface_pilot]) || {},
    surface
  };
}

async function recordArtemisResult(room) {
  if (!room || !room.artemisMission || room.artemisResultRecorded || !room.artemisMission.result) return;
  room.artemisResultRecorded = true;
  const result = room.artemisMission.result;
  room.mission = room.mission || createMissionState("artemis_expedition");
  room.mission.result = result;
  room.mission.status = result.success ? "complete" : "active";
  room.mission.completedAt = result.success ? Date.now() : null;
  if (result.success) {
    room.status = "victory";
    await db.upsertGameRoom(room.id, room.hostId, "victory");
    for (const pid in room.players) {
      const p = room.players[pid];
      const s = io.sockets.sockets.get(pid);
      if (p && p.userId && s && s.isAuthenticated) db.incrementUserStats(p.userId, { gamesWon: 1 });
    }
  } else {
    await db.upsertGameRoom(room.id, room.hostId, "playing");
  }
  const payload = {
    mission: serializeMission(room.mission, room),
    result,
    debrief: {
      success: !!result.success,
      abort: !!result.abort,
      failure: result.failure || null,
      samples: result.samples || 0,
      photos: result.photos || 0,
      fuel: result.fuel || {},
      assistance: !!result.assistance,
      retries: result.retries || 0,
      met: result.met || 0,
      splashdown: result.splashdown || null
    }
  };
  broadcastMissionUpdate(room, { action: "artemis_result", playerId: null, playerName: "FLIGHT" });
  io.to(room.id).emit("artemis_result", payload);
  broadcastRoomUpdate(room);
}

async function recordShuttleResult(room) {
  if (!room || room.shuttleResultRecorded || !room.shuttleMission || !room.shuttleMission.result) return;
  room.shuttleResultRecorded = true;
  const success = !!room.shuttleMission.result.success;
  room.status = success ? "victory" : "lobby";
  await db.upsertGameRoom(room.id, room.hostId, room.status);
  if (success) {
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

    // Prune stale empty rooms: 30m for idle lobbies, 3h for active missions
    const idleAnchor = room.emptySince || room.lastActivityAt || room.createdAt;
    const maxEmptyMs = room.status === "playing" ? 3 * 60 * 60 * 1000 : 30 * 60 * 1000;
    if (playerCount === 0 && now - idleAnchor > maxEmptyMs) {
      if (room.launchPollTimer) clearTimeout(room.launchPollTimer);
      if (room.specialistCoastTimer) clearTimeout(room.specialistCoastTimer);
      if (roomSaveTimers.has(roomId)) {
        clearTimeout(roomSaveTimers.get(roomId));
        roomSaveTimers.delete(roomId);
      }
      delete rooms[roomId];
      continue;
    }

    if (room.status !== "playing" || playerCount === 0) continue;

    // CubeSat coverage runs on its own clock and never advances station systems.
    if (room.coverage) {
      if (!room.lastCovClock || now - room.lastCovClock >= 1000) {
        room.lastCovClock = now;
        const cov = room.coverage;
        io.to(roomId).emit("coverage_clock", {
          revision: cov.revision,
          clock: { simT: coverageRoom.clockNow(cov, now), wallRef: now, rate: cov.clock.rate, paused: cov.clock.paused },
          serverNow: now
        });
      }
      if (room.coverage.deploy && room.coverage.deploy.active && playerCount > 0) {
        const ddt = room.lastDeployTick ? (now - room.lastDeployTick) / 1000 : 0; room.lastDeployTick = now;
        const evs = coverageRoom.tickDeploy(room.coverage, room, ddt);
        if (evs.length || now - (room.lastDeploySnap || 0) >= 100) sendDeployState(room);
      } else room.lastDeployTick = 0;
      if (!room.lastDbFlushAt || now - room.lastDbFlushAt >= 5000) {
        room.lastDbFlushAt = now;
        scheduleRoomSave(room, false);
      }
      continue;
    }

    if (!room.lastDbFlushAt || now - room.lastDbFlushAt >= 5000) {
      room.lastDbFlushAt = now;
      scheduleRoomSave(room, false);
    }
    const inShuttleFlight = room.shuttleMission && room.mission && (
      room.mission.opsMode === "shuttle_flight" || room.mission.phase === "launch"
    );
    if (inShuttleFlight) continue;

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
    if (!room || room.status !== "playing" || !room.shuttleMission || !room.mission) continue;
    const standaloneShuttle = room.mission.opsMode === "shuttle_flight";
    const mergedLaunch = room.mission.flightMode === "shuttle_docking" && room.mission.phase === "launch";
    if (!standaloneShuttle && !mergedLaunch) continue;
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
    if (mergedLaunch && room.shuttleMission.handoffReady && !room.shuttleHandedOff) {
      // The Shuttle has a verified orbit. Main mission control takes over and
      // opens the existing ISS docking phase; the shuttle sim stays paused.
      room.shuttleHandedOff = true;
      console.log(`[SHUTTLE] ${roomId}: orbit verified — handing off to station docking`);
      enterRoomDockingPhase(room, null);
      continue;
    }
    if (standaloneShuttle && room.shuttleMission.result) {
      recordShuttleResult(room);
    }
  }
}, 1000 / 30);

// Artemis expedition loop (20 Hz). The mission class owns fixed-step mission
// time; this loop only supplies merged player inputs and snapshots.
setInterval(() => {
  const now = Date.now();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (!room || room.status !== "playing" || !room.artemisMission || !room.mission) continue;
    if (room.mission.flightProfile !== "artemis") continue;
    if (Object.keys(room.players).length === 0) continue;
    if (!room.artemisDuties) room.artemisDuties = assignArtemisDuties(room);
    const dt = room.artemisLastTick ? (now - room.artemisLastTick) / 1000 : 0;
    room.artemisLastTick = now;
    room.artemisMission.setInputs(mergedArtemisInputs(room));
    const events = room.artemisMission.advance(Math.min(dt, 0.5));
    if (events.length) io.to(roomId).emit("artemis_events", events.filter((e) => e.type !== "COMMAND_ACCEPTED"));
    if (now - room.artemisLastSnap >= 1000 / 10 || events.length) {
      room.artemisLastSnap = now;
      sendArtemisSnapshot(room);
    }
    if (room.artemisMission.result && !room.artemisResultRecorded) {
      recordArtemisResult(room).catch((err) => console.error("[ARTEMIS] result error:", err.message));
    }
  }
}, 1000 / 20);

function serializePlayer(player) {
  const { userId, ...publicPlayer } = player || {};
  if (player) {
    publicPlayer.modelId = sanitizeModelId(player.modelId) || null;
    const role = normalizeRoleId(player.role, "commander");
    if (getTeamForRole(role) === "ground") {
      // Earth Control players are always the unsuited crew rigs.
      publicPlayer.modelId = role === "flight_director" ? "crew_a" : "crew_b";
    } else if (publicPlayer.modelId === "crew_a" || publicPlayer.modelId === "crew_b") {
      // Station crew keep pressure suits even if a crew rig was selected.
      publicPlayer.modelId = "astronaut_lod1";
    }
  }
  return publicPlayer;
}

function serializeSwapRequests(room) {
  if (!room || !room.swapRequests) return [];
  const now = Date.now();
  const active = [];
  for (const [id, req] of Object.entries(room.swapRequests)) {
    if (!req || now > req.expiresAt || !roomPlayerById(room, req.fromId) || !roomPlayerById(room, req.toId)) {
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
  Object.values(room.players).forEach((p) => {
    const team = getTeamForRole(p.role);
    p.team = team;
    if (team === "ground") {
      const roleSlot = normalizeRoleId(p.role, "commander") === "ground_capcom" ? 1 : 0;
      p.pos = groundSpawnLccFor(roleSlot);
      p.yaw = Math.PI;
      if (room.mission && room.mission.boarded) {
        delete room.mission.boarded[p.id];
      }
    } else {
      p.pos = groundSpawnFor(flightIdx++);
      p.yaw = 0;
    }
    p.pitch = 0;
    p.isEva = false;
    p.sprinting = false;
    p.driving = false;
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
    activity: room.activity || "shuttle",
    flight: room.flight || "deploy",
    editorId: room.coverage ? room.coverage.editorId : null,
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
    artemisDuties: room.artemisDuties || null,
    chatHistory: Array.isArray(room.chatHistory) ? room.chatHistory.slice(-40) : [],
    mission: serializeMission(room.mission, room)
  };
}

function broadcastRoomUpdate(room) {
  io.to(room.id).emit("room_update", {
    roomId: room.id,
    ...serializeRoom(room)
  });
  scheduleRoomSave(room, false);
}

// ============================================================================
// SOCKET.IO AUTHENTICATION & RATE LIMITING
// ============================================================================
function socketClientIp(socket) {
  const remote = (socket && socket.handshake && socket.handshake.address) || "";
  if (isPrivateOrLoopbackAddress(remote)) {
    const header = socket.handshake && socket.handshake.headers && socket.handshake.headers["x-forwarded-for"];
    if (typeof header === "string" && header.trim()) {
      // The trusted proxy appends the real peer at the right edge.
      const parts = header.split(",").map((part) => part.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1].slice(0, 64);
    }
  }
  return String(remote || "unknown").slice(0, 64);
}

const ROOM_CREATE_WINDOW_MS = 60_000;
const ROOM_CREATE_MAX_PER_WINDOW = 10;
const ROOM_CREATE_MAX_ACTIVE = 50;
const roomCreateBuckets = new Map();

function allowRoomCreation(ip) {
  const key = ip || "unknown";
  const now = Date.now();
  let bucket = roomCreateBuckets.get(key);
  if (!bucket || now - bucket.start >= ROOM_CREATE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    roomCreateBuckets.set(key, bucket);
  }
  if (bucket.count >= ROOM_CREATE_MAX_PER_WINDOW) return false;
  bucket.count += 1;

  if (roomCreateBuckets.size > 10_000) {
    for (const [k, value] of roomCreateBuckets) {
      if (now - value.start >= ROOM_CREATE_WINDOW_MS) roomCreateBuckets.delete(k);
    }
    while (roomCreateBuckets.size > 10_000) {
      const oldest = roomCreateBuckets.keys().next().value;
      if (oldest === undefined) break;
      roomCreateBuckets.delete(oldest);
    }
  }
  return true;
}

function countActiveRoomsForIp(ip) {
  if (!ip) return 0;
  let count = 0;
  for (const roomId in rooms) {
    if (rooms[roomId] && rooms[roomId].creatorIp === ip) count += 1;
  }
  return count;
}

const JOIN_FAILURE_WINDOW_MS = 60_000;
const JOIN_FAILURE_MAX = 20;
const joinFailureBuckets = new Map();

function joinFailureBucket(ip) {
  const key = ip || "unknown";
  const now = Date.now();
  let bucket = joinFailureBuckets.get(key);
  if (!bucket || now - bucket.start >= JOIN_FAILURE_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    joinFailureBuckets.set(key, bucket);
  }
  return bucket;
}

function isJoinBlocked(ip) {
  return joinFailureBucket(ip).count >= JOIN_FAILURE_MAX;
}

function recordJoinFailure(ip) {
  const bucket = joinFailureBucket(ip);
  bucket.count += 1;
  if (joinFailureBuckets.size > 10_000) {
    const now = Date.now();
    for (const [key, value] of joinFailureBuckets) {
      if (now - value.start >= JOIN_FAILURE_WINDOW_MS) joinFailureBuckets.delete(key);
    }
    while (joinFailureBuckets.size > 10_000) {
      const oldest = joinFailureBuckets.keys().next().value;
      if (oldest === undefined) break;
      joinFailureBuckets.delete(oldest);
    }
  }
}

function clearJoinFailures(ip) {
  joinFailureBuckets.delete(ip || "unknown");
}

// Estimate the wire size of a Socket.IO packet without JSON-expanding binary
// buffers (which would over-count voice chunks by roughly 3-4×).
function estimateSocketPacketBytes(packet) {
  let total = 0;
  const visit = (value, depth) => {
    if (total > 512 * 1024 || depth > 6) return;
    if (typeof value === "string") {
      total += Buffer.byteLength(value);
    } else if (Buffer.isBuffer(value)) {
      total += value.length;
    } else if (value instanceof ArrayBuffer) {
      total += value.byteLength;
    } else if (ArrayBuffer.isView(value)) {
      total += value.byteLength;
    } else if (value && typeof value === "object") {
      for (const key of Object.keys(value)) visit(value[key], depth + 1);
    } else {
      total += 8;
    }
  };
  visit(packet, 0);
  return total;
}

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
  socket.clientIp = socketClientIp(socket);

  let windowStart = Date.now();
  let windowCount = 0;
  let windowBytes = 0;
  const MAX_EVENTS_PER_SECOND = 60;
  const MAX_BYTES_PER_SECOND = 256 * 1024;

  socket.use((packet, nextEvent) => {
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      windowCount = 0;
      windowBytes = 0;
    }
    windowCount += 1;
    let size = 0;
    try {
      size = estimateSocketPacketBytes(packet);
    } catch (e) {
      return nextEvent(new Error("invalid packet"));
    }
    windowBytes += size;
    if (windowCount > MAX_EVENTS_PER_SECOND || windowBytes > MAX_BYTES_PER_SECOND) {
      return nextEvent(new Error("rate limited"));
    }
    nextEvent();
  });

  next();
});

// ============================================================================
// SOCKET.IO EVENT HANDLERS (ORBITAL STATION ROOM SYSTEM + DB PERSISTENCE)
// ============================================================================
io.on("connection", (socket) => {
  guardSocket(socket);
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
      const color = /^#[0-9a-fA-F]{6}$/.test(data.suitColor) ? data.suitColor : "#c9f04b";
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
    const creatorIp = socket.clientIp || "unknown";
    if (!allowRoomCreation(creatorIp) || countActiveRoomsForIp(creatorIp) >= ROOM_CREATE_MAX_ACTIVE) {
      const err = { success: false, message: "Too many expeditions created. Please wait a few minutes." };
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
    room.activity = ACTIVITIES.includes(data.activity) ? data.activity : "shuttle";
    room.flight = FLIGHTS.includes(data.flight) ? data.flight : "deploy";
    room.isSolo = isSolo;
    room.hostUserId = socket.userId;
    room.creatorIp = creatorIp;
    if (isSolo) {
      if (data.scenarioId && isKnownScenario(data.scenarioId)) {
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
      driving: false,
      tasksDone: 0
    };

    room.players[socket.id] = player;
    room.manualSwapOccurred = false;
    room.swapRequests = {};
    syncRoomMemberSnapshots(room);

    console.log(`[ROOM] Created 6-player co-op room ${roomId} by ${player.name} (${playerRole}, user: ${userId}, socket: ${socket.id})`);

    // Persist authenticated profiles only; guest identities stay session-only.
    await db.upsertGameRoom(roomId, userId, "lobby", 7, isPublic, {
      opsMode,
      isSolo,
      serverRegion: DEPLOY_REGION
    });
    await scheduleRoomSave(room, true);
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

    if (isJoinBlocked(socket.clientIp)) {
      const err = { success: false, message: "Too many failed join attempts. Please wait a minute." };
      if (typeof callback === "function") callback(err);
      socket.emit("join_error", err);
      return;
    }

    const targetRoom = rooms[targetCode];

    if (!targetRoom) {
      recordJoinFailure(socket.clientIp);
      const err = { success: false, message: `Room "${targetCode}" does not exist. Check the code and try again!` };
      if (typeof callback === "function") callback(err);
      socket.emit("join_error", err);
      return;
    }

    // An empty room owned by a persistent account may only be reopened by that
    // account. Without this, anyone who learns a room code could claim host
    // powers after the original host disconnects.
    const ownerUserId = typeof targetRoom.hostUserId === "string" ? targetRoom.hostUserId : "";
    const ownerIsPersistent = !!ownerUserId && !ownerUserId.startsWith("guest_");
    if (
      ownerIsPersistent &&
      Object.keys(targetRoom.players).length === 0 &&
      socket.userId !== ownerUserId
    ) {
      const err = {
        success: false,
        message: "This expedition is waiting for its original host. Ask the host to reopen it or create a new room."
      };
      if (typeof callback === "function") callback(err);
      socket.emit("join_error", err);
      return;
    }

    const isSoloOwnerReconnect =
      targetRoom.isSolo &&
      ((socket.userId && targetRoom.hostUserId && socket.userId === targetRoom.hostUserId) ||
        (!!data.reconnect &&
          Object.keys(targetRoom.players).length === 0 &&
          (!targetRoom.hostUserId || String(targetRoom.hostUserId).startsWith("guest_"))));
    if (targetRoom.isSolo && !isSoloOwnerReconnect) {
      recordJoinFailure(socket.clientIp);
      const err = { success: false, message: "This expedition is a single-player mission and is not accepting crew." };
      if (typeof callback === "function") callback(err);
      socket.emit("join_error", err);
      return;
    }

    if (currentRoomId && currentRoomId !== targetCode) {
      await handlePlayerLeave(false);
    }

    const room = targetRoom;
    room.emptySince = null;
    room.lastActivityAt = Date.now();
    const userId = socket.userId;

    if (Object.keys(room.players).length === 0) {
      room.hostId = socket.id;
      if (!room.mission || room.status === "finished") {
        room.status = "lobby";
        room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
        room.completedTaskIds = {};
        room.mission = createMissionState();
        await db.upsertGameRoom(targetCode, userId, "lobby", COOP_OBJECTIVE_IDS.size, room.isPublic !== false, {
          opsMode: room.mission.opsMode,
          isSolo: !!room.isSolo,
          serverRegion: DEPLOY_REGION
        });
      }
      if (!room.hostUserId) {
        room.hostUserId = userId;
      }
    } else if (room.hostUserId && userId && room.hostUserId === userId) {
      for (const existing of Object.values(room.players)) {
        existing.isHost = false;
      }
      room.hostId = socket.id;
    } else if (!roomPlayerById(room, room.hostId)) {
      room.hostId = socket.id;
    }

    if (Object.keys(room.players).length >= MAX_PLAYERS && !room.players[socket.id]) {
      recordJoinFailure(socket.clientIp);
      const err = { success: false, message: `Room "${targetCode}" is already full (${MAX_PLAYERS}/${MAX_PLAYERS} astronauts in the co-op crew)!` };
      if (typeof callback === "function") callback(err);
      socket.emit("join_error", err);
      return;
    }

    clearJoinFailures(socket.clientIp);
    currentRoomId = targetCode;
    socket.join(targetCode);

    const requestedName =
      String(data.playerName || data.name || `Crew ${Object.keys(room.players).length + 1}`)
        .replace(/[\u0000-\u001F\u007F<>]/g, "")
        .trim()
        .slice(0, 16) || "Astronaut";
    const savedMatch = findSavedMemberSnapshot(room, userId, requestedName);
    const savedSnap = savedMatch ? savedMatch.snapshot : null;

    // Server allocates randomized Ground vs Flight slots automatically, or restores persisted role.
    const role = savedSnap && savedSnap.role
      ? normalizeRoleId(savedSnap.role, pickBalancedRoleForRoom(room))
      : pickBalancedRoleForRoom(room);
    const team = getTeamForRole(role);

    // Pick a unique suit color across the whole crew.
    const rawJoinColor = data.suitColor || data.color;
    const requestedColor = /^#[0-9a-fA-F]{6}$/.test(rawJoinColor)
      ? rawJoinColor
      : (savedSnap && /^#[0-9a-fA-F]{6}$/.test(savedSnap.color)
        ? savedSnap.color
        : (socket.authUser && /^#[0-9a-fA-F]{6}$/.test(socket.authUser.suit_color) ? socket.authUser.suit_color : null));
    const takenColors = Object.values(room.players).map(p => p.color);
    const color = requestedColor && !takenColors.includes(requestedColor)
      ? requestedColor
      : (SUIT_COLORS.find(c => !takenColors.includes(c)) || SUIT_COLORS[0]);

    const player = {
      id: socket.id,
      userId: userId,
      name: requestedName,
      color: color,
      modelId: savedSnap && savedSnap.modelId ? sanitizeModelId(savedSnap.modelId) : null,
      role: role,
      team: team,
      isHost: room.hostId === socket.id,
      ready: savedSnap ? !!savedSnap.ready : false,
      pos: savedSnap && Array.isArray(savedSnap.pos) && savedSnap.pos.length === 3
        ? [...savedSnap.pos]
        : spawnForRoomPhase(room, Object.keys(room.players).length, role),
      yaw: savedSnap && typeof savedSnap.yaw === "number"
        ? savedSnap.yaw
        : (team === "ground"
          ? Math.PI
          : ((!room.mission || room.mission.phase === "gantry" || room.mission.phase === "launch") ? 0 : Math.PI)),
      pitch: savedSnap && typeof savedSnap.pitch === "number" ? savedSnap.pitch : 0,
      isEva: savedSnap ? !!savedSnap.isEva : false,
      suitLights: savedSnap ? savedSnap.suitLights !== false : true,
      driving: savedSnap ? !!savedSnap.driving : false,
      tasksDone: savedSnap ? Number(savedSnap.tasksDone || 0) : 0
    };

    room.players[socket.id] = player;

    // On transition from 1P -> 2P in Lobby (before any manual swaps), randomize
    // who takes LCC Ground Control vs Ship Flight Crew so either player can draw either team.
    if (room.status === "lobby" && Object.keys(room.players).length === 2 && !room.manualSwapOccurred && !savedSnap) {
      assignRandomRolesForRoom(room);
      repositionPlayersForGantry(room);
    }

    // Late Flight Crew joiners during ascent/docking/station are marked aboard;
    // Ground Control remains stationed at Kennedy LCC.
    if (room.mission && room.mission.phase !== "gantry" && player.team !== "ground") {
      if (savedSnap && savedSnap.wasBoarded) {
        room.mission.boarded[socket.id] = Date.now();
      } else {
        room.mission.boarded[socket.id] = Date.now();
      }
      room.mission.updatedAt = Date.now();
    }
    if (savedSnap && savedSnap.wasDockingPilot && room.systems) {
      room.systems.dockingPilotId = socket.id;
      if (room.mission) room.mission.dockingPilotId = socket.id;
    }
    if (
      room.mission &&
      room.mission.specialistFlight &&
      ((userId && room.mission.specialistFlight.operatorUserId === userId) || normalizeRoleId(player.role) === "specialist")
    ) {
      room.mission.specialistFlight.operatorId = socket.id;
      room.mission.specialistFlight.operatorUserId = userId;
    }
    syncRoomMemberSnapshots(room);
    console.log(`[ROOM] ${player.name} joined room ${targetCode} as ${player.role} (${player.team}, ${Object.keys(room.players).length}/${MAX_PLAYERS}${savedSnap ? ", restored" : ""})`);

    // Persist authenticated profiles only; guest identities stay session-only.
    if (socket.isAuthenticated) {
      await db.getOrCreateUser(userId, player.name, player.color, player.role);
      await db.upsertRoomMember(targetCode, userId, socket.id, player);
    }

    const payload = {
      success: true,
      roomId: targetCode,
      hostId: room.hostId,
      reconnected: room.status === "playing",
      player: player,
      room: serializeRoom(room)
    };

    if (typeof callback === "function") callback(payload);
    socket.emit("room_joined", payload);
    broadcastRoomUpdate(room);
    scheduleRoomSave(room, true);
    if (room.status === "playing" && room.shuttleMission) {
      sendShuttleSnapshot(room);
    }
    if (room.status === "playing" && room.artemisMission) {
      room.artemisDuties = assignArtemisDuties(room);
      room.artemisMission.duties = artemisDutyPayload(room);
      sendArtemisSnapshot(room);
    }
    if (room.status === "playing" && room.coverage) {
      socket.emit("game_started", { roomId: targetCode, mode: "coverage", rejoin: true });
      sendCoverageState(room, socket);
      sendDeployState(room, socket);
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
    if (data.modelId) {
      const nextModelId = sanitizeModelId(data.modelId);
      if (nextModelId) player.modelId = nextModelId;
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

  // 3a-2. Host manually assigns a specific crew role to any player in the room
  socket.on("host_assign_role", (data = {}, callback) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.hostId !== socket.id) {
      const err = { success: false, message: "Only the room host can assign crew roles." };
      if (typeof callback === "function") callback(err);
      return;
    }

    const targetId = typeof data.targetId === "string" ? data.targetId.slice(0, 128) : "";
    const target = roomPlayerById(room, targetId);
    if (!target) {
      const err = { success: false, message: "Crewmember not found in room." };
      if (typeof callback === "function") callback(err);
      return;
    }

    const rawRole = typeof data.role === "string" ? data.role : "";
    const nextRole = normalizeRoleId(rawRole, "");
    if (!nextRole || !hasOwn(ROLE_INFO, nextRole)) {
      const err = { success: false, message: "Invalid crew role requested." };
      if (typeof callback === "function") callback(err);
      return;
    }

    const phase = room.mission ? room.mission.phase : "gantry";
    const fullEditAllowed = room.status === "lobby" || phase === "gantry";
    const prevRole = normalizeRoleId(target.role, "commander");
    const prevTeam = getTeamForRole(prevRole);
    const nextTeam = getTeamForRole(nextRole);

    if (prevRole === nextRole) {
      const samePayload = {
        success: true,
        targetId: target.id,
        targetName: target.name,
        role: nextRole,
        team: nextTeam,
        swappedPeerId: null,
        players: Object.values(room.players).map(serializePlayer)
      };
      if (typeof callback === "function") callback(samePayload);
      return;
    }

    if (!fullEditAllowed && prevTeam !== nextTeam) {
      const err = { success: false, message: "Cross-zone Ground <-> Flight changes lock after liftoff." };
      if (typeof callback === "function") callback(err);
      return;
    }

    const allPlayers = Object.values(room.players);
    if (allPlayers.length <= 1 && nextTeam === "ground") {
      const err = { success: false, message: "Solo missions require a Space Crew role to fly the spacecraft." };
      if (typeof callback === "function") callback(err);
      return;
    }

    let swappedPeer = null;
    if (nextTeam === "ground") {
      const seatHolder = allPlayers.find((pl) => pl.id !== target.id && normalizeRoleId(pl.role, "commander") === nextRole);
      if (seatHolder) {
        if (!fullEditAllowed && getTeamForRole(seatHolder.role) !== prevTeam) {
          const err = { success: false, message: "Cannot swap across Ground and Flight zones after liftoff." };
          if (typeof callback === "function") callback(err);
          return;
        }
        swappedPeer = seatHolder;
      } else {
        const groundOthers = allPlayers.filter((pl) => pl.id !== target.id && getTeamForRole(pl.role) === "ground");
        const flightOthers = allPlayers.filter((pl) => pl.id !== target.id && getTeamForRole(pl.role) !== "ground");
        if (flightOthers.length < 1 && groundOthers.length > 0) {
          swappedPeer = groundOthers[0];
        } else if (groundOthers.length >= GROUND_ROLES.length) {
          const err = { success: false, message: "Earth Control already has 2 assigned operators." };
          if (typeof callback === "function") callback(err);
          return;
        }
      }
    }

    if (swappedPeer) {
      swappedPeer.role = prevRole;
      swappedPeer.team = prevTeam;
    }
    target.role = nextRole;
    target.team = nextTeam;
    room.manualSwapOccurred = true;

    const clearedIds = new Set([target.id, swappedPeer ? swappedPeer.id : null].filter(Boolean));
    for (const [reqId, req] of Object.entries(room.swapRequests || {})) {
      if (clearedIds.has(req.fromId) || clearedIds.has(req.toId)) {
        delete room.swapRequests[reqId];
      }
    }

    if (room.systems) {
      room.systems.dockingPilotId = resolveDockingPilotId(room);
    }
    if (room.status === "playing" && room.mission) {
      room.mission.dockingPilotId = room.systems ? room.systems.dockingPilotId : null;
      if (room.mission.phase === "gantry") {
        if (prevTeam !== nextTeam || swappedPeer) {
          repositionPlayersForGantry(room);
        }
        broadcastMissionUpdate(room, {
          action: "role_assigned",
          playerId: target.id,
          assignedBy: socket.id
        });
      }
    }

    const payload = {
      success: true,
      targetId: target.id,
      targetName: target.name,
      role: nextRole,
      team: nextTeam,
      swappedPeerId: swappedPeer ? swappedPeer.id : null,
      players: Object.values(room.players).map(serializePlayer)
    };
    io.to(currentRoomId).emit("role_assigned", payload);
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
    const swapNow = Date.now();
    if (socket.lastSwapRequestAt && swapNow - socket.lastSwapRequestAt < 1000) {
      const err = { success: false, message: "Please wait before requesting another swap." };
      if (typeof callback === "function") callback(err);
      return;
    }
    socket.lastSwapRequestAt = swapNow;
    const pFrom = room.players[socket.id];
    const targetId = typeof data.targetId === "string" ? data.targetId.slice(0, 128) : "";
    const pTo = roomPlayerById(room, targetId);
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
    const requestId = typeof data.requestId === "string" ? data.requestId.slice(0, 64) : "";
    const swapReq = room.swapRequests && hasOwn(room.swapRequests, requestId) ? room.swapRequests[requestId] : null;
    if (!swapReq || swapReq.toId !== socket.id) {
      const err = { success: false, message: "Swap request expired or invalid." };
      if (typeof callback === "function") callback(err);
      return;
    }

    delete room.swapRequests[requestId];
    const pFrom = roomPlayerById(room, swapReq.fromId);
    const pTo = roomPlayerById(room, swapReq.toId);

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
    const requestId = typeof data.requestId === "string" ? data.requestId.slice(0, 64) : "";
    const req = room.swapRequests && hasOwn(room.swapRequests, requestId) ? room.swapRequests[requestId] : null;
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
      room.mission.flightMode = data.opsMode === "shuttle_flight" ? "standalone_shuttle" : "shuttle_docking";
    }
    if (data.scenarioId && isKnownScenario(data.scenarioId)) {
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

  // 3e. Host picks the activity in the lobby (Shuttle crew or CubeSat coverage).
  socket.on("set_activity", (data = {}, callback) => {
    data = asObject(data);
    const room = currentRoomId && rooms[currentRoomId];
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    if (!room) return reply({ success: false, message: "Not in a room" });
    if (room.hostId !== socket.id) return reply({ success: false, message: "Only the host can change the mission" });
    if (room.status !== "lobby" || room.coverage || room.shuttleMission || room.artemisMission) {
      return reply({ success: false, message: "A mission is already running in this room" });
    }
    if (!ACTIVITIES.includes(data.activity)) return reply({ success: false, message: "Unknown mission" });
    room.activity = data.activity;
    reply({ success: true });
    broadcastRoomUpdate(room);
  });

  // 3f. Host picks the Shuttle flight in the lobby (satellite deploy or ISS docking).
  socket.on("set_flight", (data = {}, callback) => {
    data = asObject(data);
    const room = currentRoomId && rooms[currentRoomId];
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    if (!room) return reply({ success: false, message: "Not in a room" });
    if (room.hostId !== socket.id) return reply({ success: false, message: "Only the host can change the flight" });
    if (room.status !== "lobby") return reply({ success: false, message: "A flight is already running in this room" });
    if (!FLIGHTS.includes(data.flight)) return reply({ success: false, message: "Unknown flight" });
    room.flight = data.flight;
    reply({ success: true });
    broadcastRoomUpdate(room);
  });

  // 3g. CubeSat coverage: scenario / pins / clock / editor hand-over / forecast hash.
  socket.on("coverage_request", (data = {}, callback) => {
    data = asObject(data);
    const room = currentRoomId && rooms[currentRoomId];
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    if (!room || !room.coverage || !room.players[socket.id]) return reply({ accepted: false, reason: "No coverage session" });
    if (data.type === "SYNC") { sendCoverageState(room, socket); sendDeployState(room, socket); return reply({ accepted: true }); }
    const result = coverageRoom.applyRequest(room.coverage, room, socket.id, data);
    reply({ accepted: result.accepted, reason: result.reason || null, revision: room.coverage.revision });
    if (result.changed === "deploy") sendDeployState(room);
    else if (result.accepted && result.changed === "deploy-end") { sendDeployState(room, null, true); sendCoverageState(room); }
    else if (result.accepted && result.changed) {
      sendCoverageState(room);
      if (result.changed === "editor") broadcastRoomUpdate(room);
    }
  });

  // 4. Host starts the game
  socket.on("start_game", async (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (!roomPlayerById(room, room.hostId) && room.players[socket.id]) {
      room.hostId = socket.id;
      room.players[socket.id].isHost = true;
    }
    if (room.hostId !== socket.id) return;
    if (room.status === "playing") return;

    if (room.launchPollTimer) {
      clearTimeout(room.launchPollTimer);
      room.launchPollTimer = null;
    }
    if (room.specialistCoastTimer) {
      clearTimeout(room.specialistCoastTimer);
      room.specialistCoastTimer = null;
    }

    // CubeSat coverage is a separate activity: the server owns the scenario,
    // simulation clock and edit rights; the operational mission state is unused.
    if (room.activity === "coverage") {
      room.status = "playing";
      room.mission = null;
      room.shuttleMission = null;
      room.artemisMission = null;
      if (!room.coverage) room.coverage = coverageRoom.createCoverageState(socket.id, null, { deploy: process.env.COVERAGE_DEPLOY !== "0", testHooks: SHUTTLE_TEST_HOOKS });
      console.log(`[COVERAGE] CubeSat session started in room ${currentRoomId}`);
      await db.upsertGameRoom(currentRoomId, room.hostUserId || room.hostId, "playing").catch(() => {});
      broadcastRoomUpdate(room);
      io.to(currentRoomId).emit("game_started", { roomId: currentRoomId, mode: "coverage" });
      sendCoverageState(room);
      sendDeployState(room, null, true);
      return;
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

    const scenarioId = (room.mission && room.mission.scenarioId) || "cubesat_101";
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

    if (room.mission.flightProfile === "artemis") {
      room.mission.phase = "artemis";
      room.tasks = { completed: 0, total: 11 };
      room.completedTaskIds = {};
      room.artemisDuties = assignArtemisDuties(room);
      const duty = room.artemisDuties || {};
      const surfaceCrew = [...new Set([duty.surface_pilot, duty.surface_science].filter(Boolean))];
      const orionCrew = [...new Set([duty.orion_nav, duty.orion_systems].filter(Boolean))];
      room.artemisMission = new ArtemisMission({
        surfaceCrew: surfaceCrew.length ? surfaceCrew : undefined,
        orionCrew: orionCrew.length ? orionCrew : undefined
      });
      room.artemisMission.duties = artemisDutyPayload(room);
      room.artemisInputs = {};
      room.artemisSurfaceInputs = {};
      room.artemisLastTick = Date.now();
      room.artemisLastSnap = 0;
      room.artemisResultRecorded = false;
      room.shuttleMission = null;
      room.shuttleInputs = {};
      Object.keys(room.players).forEach((pid) => { room.players[pid].tasksDone = 0; });
      console.log(`[ARTEMIS] ${room.mission.scenarioId} started in room ${currentRoomId} by host (${surfaceCrew.length} surface / ${orionCrew.length} Orion)`);
      await db.upsertGameRoom(currentRoomId, room.hostId, "playing");
      for (const pid in room.players) {
        const memberSocket = io.sockets.sockets.get(pid);
        const p = room.players[pid];
        if (p.userId && memberSocket && memberSocket.isAuthenticated) db.incrementUserStats(p.userId, { gamesPlayed: 1 });
      }
      io.to(currentRoomId).emit("game_started", {
        roomId: currentRoomId,
        mode: GAME_MODE,
        opsMode: "artemis_expedition",
        flightProfile: "artemis",
        artemisMissionId: room.artemisMission.missionId,
        maxPlayers: MAX_PLAYERS,
        players: Object.values(room.players).map(serializePlayer),
        systems: room.systems,
        tasks: room.tasks,
        mission: serializeMission(room.mission, room)
      });
      sendArtemisSnapshot(room);
      broadcastRoomUpdate(room);
      return;
    }

    // Every mission flies the Shuttle after launch. Main missions stop at orbit
    // insertion and hand off to docking; the standalone mode continues to
    // payload, entry and runway landing.
    room.shuttleMission = createRoomShuttleMission(opsMode);
    room.shuttleInputs = {};
    room.shuttleLastTick = Date.now();
    room.shuttleLastSnap = 0;
    room.shuttleResultRecorded = false;
    room.shuttleTestFreeze = false;
    room.shuttleHandedOff = false;

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
      mission: serializeMission(room.mission, room)
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
    const type = String(data.type || "").slice(0, 48);
    if (type === "SET_CONTROL_INPUT") {
      return reply({ accepted: false, reason: "Use shuttle_input" });
    }
    const seat = hasOwn(SHUTTLE_CREW.commandRole, type) ? SHUTTLE_CREW.commandRole[type] : null;
    // Shared commands use the sentinel seat "all". They must bypass the
    // per-seat lookup below because "all" is intentionally absent from
    // SHUTTLE_CREW.info (only the four primary seats live there).
    if (!seat || (seat !== "all" && !hasOwn(SHUTTLE_CREW.info, seat))) {
      return reply({ accepted: false, reason: "Unknown command" });
    }
    // Shared commands ("all") are deliberately not seat-gated: every crewmember
    // in the flight can use them (e.g. time acceleration), even if they do not
    // own one of the four primary seats.
    if (seat !== "all") {
      const ownerId = shuttleSeatOwner(room, seat);
      if (ownerId !== socket.id) {
        const owner = ownerId ? roomPlayerById(room, ownerId) : null;
        return reply({
          accepted: false,
          reason: `${SHUTTLE_CREW.info[seat].title} (${owner ? owner.name : "unassigned"}) owns command`
        });
      }
    }
    let r;
    if (type === "RESTART") {
      const merged = !!(room.mission && room.mission.flightMode === "shuttle_docking");
      room.shuttleMission = createRoomShuttleMission(merged ? "iss_expedition" : "shuttle_flight");
      room.shuttleInputs = {};
      room.shuttleLastTick = Date.now();
      room.shuttleLastSnap = 0;
      room.shuttleResultRecorded = false;
      room.shuttleTestFreeze = false;
      room.shuttleHandedOff = false;
      room.status = "playing";
      // A merged main-mission restart re-arms the same automatic launch so the
      // crew is never stranded in the Shuttle briefing screen.
      if (merged && room.mission.phase === "launch") room.shuttleMission.command("START");
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

  // ── Artemis commands and controls (server-authoritative, duty-gated) ─────
  function artemisCanCommand(room, player, type) {
    if (!room || !room.artemisMission || !player) return false;
    const flight = Object.values(room.players || {}).filter((p) => p && getTeamForRole(p.role) !== "ground");
    const isGround = getTeamForRole(player.role) === "ground";
    if (flight.length < 4) {
      // Small/solo crews may operate every station, but Ground Control must
      // still not fly the spacecraft. The host may always authorize START.
      if (isGround) return type === "START" && room.hostId === player.id;
      return true;
    }
    if (type === "START" && room.hostId === player.id) return true;
    if (["PAUSE", "SET_WARP", "RETRY_CHECKPOINT", "RESTART", "EXIT", "SET_ASSIST", "DEBRIEF"].includes(type)) return true;
    const duties = room.artemisDuties || (room.artemisDuties = assignArtemisDuties(room));
    if (!duties) return false;
    if (type === "SURFACE_INTERACT") return duties.surface_pilot === player.id || duties.surface_science === player.id;
    const duty = hasOwn(ARTEMIS_COMMAND_DUTY, type) ? ARTEMIS_COMMAND_DUTY[type] : null;
    if (!duty) return false;
    return duties[duty] === player.id;
  }

  socket.on("artemis_command", (data = {}, callback) => {
    data = asObject(data);
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.artemisMission || !room.players[socket.id]) return reply({ accepted: false, reason: "Not in an Artemis expedition" });
    const player = room.players[socket.id];
    const type = String(data.type || "").slice(0, 40);
    if (!artemisCanCommand(room, player, type)) {
      const duty = hasOwn(ARTEMIS_COMMAND_DUTY, type) ? ARTEMIS_COMMAND_DUTY[type] : null;
      const ownerId = duty && room.artemisDuties ? room.artemisDuties[duty] : null;
      const owner = ownerId ? roomPlayerById(room, ownerId) : null;
      const dutyInfo = duty && hasOwn(ARTEMIS_DUTIES, duty) ? ARTEMIS_DUTIES[duty] : null;
      return reply({ accepted: false, reason: `${dutyInfo ? dutyInfo.label : "This station"} is owned by ${owner ? owner.name : "another crewmember"}` });
    }
    const args = data.args && typeof data.args === "object" ? data.args : {};
    if (type === "SURFACE_INTERACT") args.actorId = socket.id;
    const r = room.artemisMission.command(type, args);
    reply(r);
    if (r.accepted && (type === "RETRY_CHECKPOINT" || type === "RESTART")) {
      room.artemisResultRecorded = false;
      room.status = "playing";
      if (room.mission) { room.mission.result = null; room.mission.status = "active"; }
    }
    const events = room.artemisMission.drainEvents();
    if (events.length) io.to(room.id).emit("artemis_events", events.filter((e) => e.type !== "COMMAND_ACCEPTED"));
    sendArtemisSnapshot(room);
    if (room.artemisMission.result && !room.artemisResultRecorded) recordArtemisResult(room).catch((err) => console.error("[ARTEMIS] result error:", err.message));
  });

  socket.on("artemis_input", (data = {}) => {
    data = asObject(data);
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.artemisMission || !room.players[socket.id]) return;
    const clean = {};
    for (const k of ["pitch", "yaw", "roll", "tx", "ty", "tz", "throttle", "fine"]) {
      if (k === "fine") { if (typeof data[k] === "boolean") clean[k] = data[k]; continue; }
      if (typeof data[k] === "number" && Number.isFinite(data[k])) clean[k] = Math.max(-1, Math.min(1, data[k]));
    }
    room.artemisInputs = room.artemisInputs || {};
    room.artemisInputs[socket.id] = clean;
  });

  socket.on("artemis_surface_input", (data = {}) => {
    data = asObject(data);
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.artemisMission || !room.players[socket.id]) return;
    const clean = {};
    for (const k of ["forward", "strafe", "turn"]) {
      if (typeof data[k] === "number" && Number.isFinite(data[k])) clean[k] = Math.max(-1, Math.min(1, data[k]));
    }
    if (typeof data.sprint === "boolean") clean.sprint = data.sprint;
    room.artemisSurfaceInputs = room.artemisSurfaceInputs || {};
    room.artemisSurfaceInputs[socket.id] = clean;
  });

  socket.on("artemis_reassign", (data = {}, callback) => {
    data = asObject(data);
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.artemisMission || !room.players[socket.id]) return reply({ ok: false, error: "Not in an Artemis expedition" });
    const actor = room.players[socket.id];
    if (socket.id !== room.hostId && normalizeRoleId(actor.role) !== "commander") return reply({ ok: false, error: "Only the host or commander can reassign duties" });
    if (["descent", "landed", "surface", "ascent", "reunion"].includes(room.artemisMission.phase)) return reply({ ok: false, error: "Reassign before descent so no crewmember is moved while on the surface" });
    const duty = String(data.duty || "").slice(0, 32);
    const targetId = String(data.playerId || "").slice(0, 128);
    const target = roomPlayerById(room, targetId);
    if (!hasOwn(ARTEMIS_DUTIES, duty) || !target || getTeamForRole(target.role) === "ground") {
      return reply({ ok: false, error: "Invalid duty or flight-crew target" });
    }
    room.artemisDuties = room.artemisDuties || assignArtemisDuties(room);
    room.artemisDuties[duty] = targetId;
    room.artemisMission.duties = artemisDutyPayload(room);
    const d = room.artemisDuties;
    room.artemisMission.crew.surface = [...new Set([d.surface_pilot, d.surface_science].filter(Boolean))];
    room.artemisMission.crew.orion = [...new Set([d.orion_nav, d.orion_systems].filter(Boolean))];
    sendArtemisSnapshot(room);
    reply({ ok: true, duties: artemisDutyPayload(room) });
  });

  socket.on("shuttle_gmat_coast", async (callback) => {
    if (typeof callback !== "function") return;
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.shuttleMission || !room.players[socket.id]) return callback({ success: false, error: "Join a Shuttle flight first." });
    if (room.gmatRunning) return callback({ success: false, error: "GMAT is already calculating for this flight. Try again shortly." });
    if (socket.lastGmatRequest && Date.now() - socket.lastGmatRequest < 5000) return callback({ success: false, error: "Wait a few seconds before calculating again." });
    socket.lastGmatRequest = Date.now();
    room.gmatRunning = true;
    const snapshot = room.shuttleMission.snapshot();
    const expectedMissionId = snapshot.missionId;
    try {
      const prediction = await propagateCoast(snapshot, {
        label: `coast:${room.id}`,
        shouldRun: () => !!(rooms[room.id] === room && room.shuttleMission && room.shuttleMission.missionId === expectedMissionId)
      });
      if (!room.shuttleMission || room.shuttleMission.missionId !== prediction.missionId) return callback({ success: false, error: "The flight changed while GMAT was running." });
      callback({ success: true, prediction });
    } catch (error) {
      const message =
        error.code === "ENOENT" ? "GMAT Console is unavailable on this server." :
        error.code === "GMAT_QUEUE_FULL" || error.code === "GMAT_QUEUE_TIMEOUT" || error.code === "GMAT_CANCELLED" ? error.message :
        error.message.includes("GMAT coast prediction") ? error.message :
        "GMAT calculation failed. Check the server logs.";
      if (message === "GMAT calculation failed. Check the server logs.") console.error("[GMAT]", error.message);
      callback({ success: false, error: message });
    } finally {
      room.gmatRunning = false;
    }
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
      const testPlayer = room.players[socket.id];
      if (!testPlayer) return typeof callback === "function" && callback(null);
      if (socket.id !== room.hostId && normalizeRoleId(testPlayer.role, "commander") !== "commander") {
        return typeof callback === "function" && callback(null);
      }
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
    if (typeof data.sprinting === "boolean") p.sprinting = data.sprinting;
    if (typeof data.moving === "boolean") p.moving = data.moving;
    if (typeof data.driving === "boolean") p.driving = data.driving;

    socket.to(currentRoomId).volatile.emit("player_moved", {
      id: socket.id,
      t: Date.now(),
      pos: p.pos,
      yaw: p.yaw,
      pitch: p.pitch,
      isEva: p.isEva,
      suitLights: p.suitLights,
      sprinting: !!p.sprinting,
      moving: p.moving,
      driving: !!p.driving
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
    const actorRole = normalizeRoleId(p.role, "commander");
    const canControlArm = socket.id === room.hostId || actorRole === "engineer" || actorRole === "commander";
    if (!canControlArm) {
      socket.emit("ground_support_event", {
        type: "role_locked",
        action: "dock",
        requiredRole: "engineer",
        requiredRoleShort: "ENG",
        requiredRoleLabel: "Flight Engineer",
        message: "Only the Flight Engineer (or the host/commander) controls the boarding arm."
      });
      return;
    }

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
    if (room.specialistCoastTimer) {
      clearTimeout(room.specialistCoastTimer);
      room.specialistCoastTimer = null;
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
    room.mission.launchSpeed = 1;
    room.mission.launchedBy = launchedById || null;
    room.systems.dockingState = null;
    room.systems.dockingPilotId = resolveDockingPilotId(room);
    room.mission.dockingPilotId = room.systems.dockingPilotId;
    room.mission.phaseStartedAt = now;
    room.mission.updatedAt = now;

    // Main mission launch clearance starts the interactive Shuttle flight.
    // The CDR no longer has to press a separate Shuttle START key: the launch
    // order itself arms the automatic countdown/ascent.
    if (!room.shuttleMission || room.shuttleMission.exited || !["briefing", "prelaunch"].includes(room.shuttleMission.phase)) {
      room.shuttleMission = createRoomShuttleMission(room.mission.opsMode);
    }
    if (room.shuttleMission.phase === "briefing") {
      room.shuttleMission.command("START");
    }
    room.shuttleInputs = {};
    room.shuttleLastTick = now;
    room.shuttleLastSnap = 0;
    room.shuttleHandedOff = false;

    // Send the armed Shuttle snapshot first so the client already has the
    // countdown/ascent state when the launch update switches it into ShuttleView.
    if (room.shuttleMission && room.mission.flightMode === "shuttle_docking") {
      sendShuttleSnapshot(room);
    }
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
        message: "Earth Control stays inside the Control Room during launch and flight."
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

  socket.on("space_unboard", () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    if (getTeamForRole(p.role) === "ground") return;
    if (!room.mission || room.mission.phase !== "gantry") return;

    if (room.mission.boarded) delete room.mission.boarded[socket.id];
    // Stepping out invalidates the crew-wide launch request. Earth Control must
    // receive a fresh request after everyone is aboard again.
    if (room.mission.launchPollAt) {
      if (room.launchPollTimer) {
        clearTimeout(room.launchPollTimer);
        room.launchPollTimer = null;
      }
      room.mission.launchPollAt = 0;
      room.mission.launchPollBy = null;
      const gs = room.mission.groundSupport || (room.mission.groundSupport = createGroundSupportState());
      gs.goNoGoLaunch = false;
      gs.goNoGoBy = null;
      gs.goNoGoAt = 0;
    }
    room.mission.updatedAt = Date.now();
    broadcastMissionUpdate(room, {
      action: "unboard",
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

    const hasGround = roomHasGroundCrew(room);
    if (!hasGround) {
      triggerRoomLaunch(room, socket.id, p.name);
      return;
    }

    // Earth Control clearance is mandatory whenever a ground player is present.
    // Require the entire flight crew to be aboard before opening the clearance
    // request; a flight-side launch request can never bypass the Flight Director.
    if (getTeamForRole(p.role) === "ground") {
      socket.emit("ground_support_event", {
        type: "launch_clearance_wait",
        message: "Earth Control gives launch clearance from the Flight Director console after every astronaut is aboard."
      });
      return;
    }
    const flightIds = getFlightCrewIds(room);
    const allFlightCrewAboard = flightIds.length > 0 && flightIds.every((id) => !!(room.mission.boarded && room.mission.boarded[id]));
    if (!allFlightCrewAboard) {
      socket.emit("ground_support_event", {
        type: "launch_clearance_wait",
        message: "All astronauts must be aboard before requesting launch clearance from Earth Control."
      });
      return;
    }

    if (room.mission.launchPollAt) return;

    const now = Date.now();
    const gs = room.mission.groundSupport || (room.mission.groundSupport = createGroundSupportState());
    // Clear any legacy/pre-board approval. Clearance must follow this request.
    gs.goNoGoLaunch = false;
    gs.goNoGoBy = null;
    gs.goNoGoAt = 0;
    room.mission.launchPollAt = now;
    room.mission.launchPollBy = socket.id;
    room.mission.dockLocked = true;
    room.mission.updatedAt = now;

    broadcastMissionUpdate(room, {
      action: "go_nogo_poll",
      playerId: socket.id,
      playerName: p.name
    });
    io.to(currentRoomId).emit("ground_support_event", {
      type: "go_nogo_poll",
      byId: socket.id,
      byName: p.name,
      byRole: p.role
    });
  });

  // Ground Control operations. Launch clearance is mandatory when ground crew are present.
  socket.on("ground_action", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p || room.status !== "playing") return;
    const type = String(data.type || "").trim().slice(0, 32);
    const allowedRoles = hasOwn(GROUND_ACTION_ROLES, type) ? GROUND_ACTION_ROLES[type] : null;
    if (!Array.isArray(allowedRoles)) return;
    const actorRole = normalizeRoleId(p.role, "commander");
    if (!allowedRoles.includes(actorRole)) {
      const requiredRole = allowedRoles[0];
      const roleMeta = ROLE_INFO[requiredRole] || null;
      socket.emit("ground_support_event", {
        type: "role_locked",
        action: type,
        requiredRole,
        requiredRoleShort: roleMeta ? roleMeta.short : String(requiredRole).toUpperCase(),
        requiredRoleLabel: roleMeta ? roleMeta.title : String(requiredRole).toUpperCase(),
        message: `${roleMeta ? roleMeta.title : requiredRole} is the only Earth Control role cleared for this action.`
      });
      return;
    }

    const now = Date.now();
    if (socket.lastGroundActionAt && now - socket.lastGroundActionAt < 300) return;
    socket.lastGroundActionAt = now;

    room.mission = room.mission || createMissionState();
    const gs = room.mission.groundSupport || (room.mission.groundSupport = createGroundSupportState());

    if (type === "go_nogo_launch") {
      const flightIds = getFlightCrewIds(room);
      const allFlightCrewAboard = flightIds.length > 0 && flightIds.every((id) => !!(room.mission.boarded && room.mission.boarded[id]));
      if (room.mission.phase !== "gantry" || !room.mission.launchPollAt || !allFlightCrewAboard) {
        socket.emit("ground_support_event", {
          type: "launch_clearance_wait",
          message: "Wait until all astronauts are aboard and the flight crew requests launch clearance."
        });
        return;
      }

      gs.goNoGoLaunch = true;
      gs.goNoGoBy = p.name;
      gs.goNoGoAt = now;

      io.to(currentRoomId).emit("ground_support_event", {
        type: "go_nogo_launch",
        byId: socket.id,
        byName: p.name,
        byRole: p.role
      });
      triggerRoomLaunch(room, socket.id, p.name);
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
      const message = String(data.message || "").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 96)
        || `ATTENTION NEEDED AT ${hasOwn(roomLabels, targetRoom) ? roomLabels[targetRoom] : targetRoom}`;
      gs.activePing = {
        roomId: targetRoom,
        roomLabel: hasOwn(roomLabels, targetRoom) ? roomLabels[targetRoom] : targetRoom,
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

  // Shared launch-cinematic speed. Any Flight Crew member (or the host) can
  // toggle 1x/3x for everyone, so one player's fast-forward never desyncs the
  // crew or leaves the rest of the room watching at normal speed.
  socket.on("launch_speed", (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p || !room.mission || room.mission.phase !== "launch" || room.status !== "playing") return;
    if (getTeamForRole(p.role) === "ground" && socket.id !== room.hostId) return;
    const speed = Number(data.speed) === 3 ? 3 : 1;
    if (room.mission.launchSpeed === speed) return;
    room.mission.launchSpeed = speed;
    room.mission.updatedAt = Date.now();
    broadcastMissionUpdate(room, {
      action: "launch_speed",
      playerId: socket.id,
      playerName: p.name,
      speed
    });
  });

  // Step-skip: advance the shared main mission to its next phase. The first
  // press from a non-authority player records a crew vote; the host/commander
  // (or a majority) advances immediately. This is what lets the crew jump from
  // launch straight to ISS docking without waiting for the Shuttle orbit gate.
  socket.on("mission_skip_step", (data = {}, callback) => {
    data = asObject(data);
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    const room = currentRoomId && rooms[currentRoomId];
    const p = room && room.players[socket.id];
    if (!room || !room.mission || !p || room.status !== "playing") return reply({ accepted: false, reason: "Not in an active mission" });
    const phase = room.mission.phase;
    if (phase === "station") return reply({ accepted: false, reason: "No next mission step to skip" });
    if (!["gantry", "launch", "docking"].includes(phase)) return reply({ accepted: false, reason: "No next mission step to skip" });

    const flightIds = getFlightCrewIds(room);
    const activePilotId = phase === "docking" ? resolveDockingPilotId(room) : null;
    const isAuthority = flightIds.length <= 1 ||
      socket.id === room.hostId ||
      socket.id === activePilotId ||
      normalizeRoleId(p.role) === "commander";

    if (!isAuthority) {
      room.mission.skipVotes = room.mission.skipVotes || {};
      room.mission.skipVotes[socket.id] = true;
      const needed = Math.max(1, Math.ceil(Object.keys(room.players).length / 2));
      const votes = Object.keys(room.mission.skipVotes).filter((id) => room.players[id]).length;
      if (votes < needed) {
        room.mission.updatedAt = Date.now();
        broadcastMissionUpdate(room, {
          action: "skip_vote",
          playerId: socket.id,
          playerName: p.name
        });
        return reply({ accepted: true, pending: true, votes, needed, phase });
      }
    }

    room.mission.skipVotes = {};
    if (phase === "gantry") {
      if (!triggerRoomLaunch(room, socket.id, p.name)) return reply({ accepted: false, reason: "Launch could not be started" });
    } else if (phase === "launch") {
      room.shuttleHandedOff = true;
      if (!enterRoomDockingPhase(room, socket.id)) return reply({ accepted: false, reason: "Docking is already active" });
    } else if (phase === "docking") {
      if (!completeRoomDocking(room, socket.id)) return reply({ accepted: false, reason: "The station is already active" });
    }
    reply({ accepted: true, phase: room.mission.phase });
  });

  socket.on("launch_skip_vote", () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    room.mission = room.mission || createMissionState();
    if (room.mission.phase !== "launch") return;
    if (getTeamForRole(p.role) === "ground" && socket.id !== room.hostId) return;
    // Merged main missions must reach verified orbit before docking opens;
    // old/console skip requests cannot bypass the Shuttle flight.
    if (room.mission.flightMode === "shuttle_docking" && (!room.shuttleMission || !room.shuttleMission.handoffReady)) return;

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
      // Merged main missions hand off only from the authoritative orbit check.
      if (room.mission.flightMode === "shuttle_docking") {
        if (!room.shuttleMission || !room.shuttleMission.handoffReady) return;
        enterRoomDockingPhase(room, socket.id);
        return;
      }
      const flightIds = getFlightCrewIds(room);
      const elapsedMs = Date.now() - (room.mission.phaseStartedAt || 0);
      // Do not trust a client-supplied "the cutscene ended" flag. The server
      // uses its own launch clock, the crew count, or host/commander authority.
      const cutsceneMs = Math.ceil(26000 / (room.mission.launchSpeed === 3 ? 3 : 1));
      const isNaturalOrAuthority = elapsedMs >= cutsceneMs || flightIds.length <= 1 || socket.id === room.hostId || normalizeRoleId(p.role) === "commander";
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

    const requestedTargetId = typeof (data.targetId || data.pilotId) === "string" ? String(data.targetId || data.pilotId).slice(0, 128) : "";
    let targetPilotId = getTeamForRole(p.role) !== "ground" ? socket.id : resolveDockingPilotId(room);
    const requestedTarget = roomPlayerById(room, requestedTargetId);
    if (requestedTarget && getTeamForRole(requestedTarget.role) !== "ground") {
      const canAssignOther = socket.id === room.hostId || socket.id === room.systems.dockingPilotId || normalizeRoleId(p.role) === "commander" || requestedTargetId === socket.id;
      if (canAssignOther) targetPilotId = requestedTargetId;
    }

    room.systems.dockingPilotId = targetPilotId;
    room.mission.dockingPilotId = targetPilotId;
    room.mission.updatedAt = Date.now();
    const targetPlayer = roomPlayerById(room, targetPilotId);

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
    const isAuthority = flightIds.length <= 1 || socket.id === room.hostId || socket.id === activePilotId || normalizeRoleId(p.role) === "commander";
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

    completeRoomDocking(room, socket.id);
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

    // Resetting the whole crew's mission is an authoritative action. A random
    // crewmate cannot abort an in-progress flight for everyone else.
    if (socket.id !== room.hostId && normalizeRoleId(p.role, "commander") !== "commander") {
      socket.emit("ground_support_event", {
        type: "reset_denied",
        message: "Only the host or commander can reset the shared mission."
      });
      return;
    }

    if (room.artemisMission || (room.mission && room.mission.flightProfile === "artemis") || (room.mission && room.mission.scenarioId === "artemis_expedition")) {
      room.artemisDuties = assignArtemisDuties(room);
      const duty = room.artemisDuties || {};
      const surfaceCrew = [...new Set([duty.surface_pilot, duty.surface_science].filter(Boolean))];
      const orionCrew = [...new Set([duty.orion_nav, duty.orion_systems].filter(Boolean))];
      room.mission = createMissionState("artemis_expedition", room.mission && room.mission.difficultyId, room.mission && room.mission.opsMode);
      room.mission.phase = "artemis";
      room.artemisMission = new ArtemisMission({ surfaceCrew: surfaceCrew.length ? surfaceCrew : undefined, orionCrew: orionCrew.length ? orionCrew : undefined });
      room.artemisMission.duties = artemisDutyPayload(room);
      room.artemisInputs = {};
      room.artemisSurfaceInputs = {};
      room.artemisResultRecorded = false;
      room.artemisLastTick = Date.now();
      room.artemisLastSnap = 0;
      room.status = "playing";
      room.tasks = { completed: 0, total: 11 };
      sendArtemisSnapshot(room);
      broadcastMissionUpdate(room, { action: "reset", playerId: socket.id, playerName: p.name });
      broadcastRoomUpdate(room);
      return;
    }

    if (room.launchPollTimer) {
      clearTimeout(room.launchPollTimer);
      room.launchPollTimer = null;
    }
    if (room.specialistCoastTimer) {
      clearTimeout(room.specialistCoastTimer);
      room.specialistCoastTimer = null;
    }

    const scenarioId = room.mission && room.mission.scenarioId;
    const difficultyId = room.mission && room.mission.difficultyId;
    const opsMode = (room.mission && VALID_OPS_MODES.has(room.mission.opsMode)) ? room.mission.opsMode : "iss_expedition";
    room.mission = createMissionState(scenarioId, difficultyId, opsMode);
    room.mission.updatedAt = now;
    room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
    room.completedTaskIds = {};
    // Re-arm the Shuttle for the next launch attempt. Without this, a reset
    // after orbit insertion would leave a paused/finished mission behind.
    room.shuttleMission = createRoomShuttleMission(opsMode);
    room.shuttleInputs = {};
    room.shuttleLastTick = Date.now();
    room.shuttleLastSnap = 0;
    room.shuttleResultRecorded = false;
    room.shuttleTestFreeze = false;
    room.shuttleHandedOff = false;
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

  // A flight crewmember can take the unstaffed specialist role at the station.
  // This changes their actual room role, including in solo/small crews.
  socket.on("claim_specialist_role", (_data = {}, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!currentRoomId || !rooms[currentRoomId]) return reply({ ok: false, error: "Join a mission first." });
    const room = rooms[currentRoomId];
    const player = room.players[socket.id];
    if (!player) return reply({ ok: false, error: "Join a mission first." });
    if (!room.mission || room.mission.phase !== "station" || room.status !== "playing") return reply({ ok: false, error: "Reach the ISS before changing to Space Specialist." });
    if (normalizeRoleId(player.role) === "specialist") return reply({ ok: true });
    if (getTeamForRole(normalizeRoleId(player.role)) === "ground") return reply({ ok: false, error: "A flight crewmember at the ISS must take this role." });
    if (Object.values(room.players).some(p => normalizeRoleId(p.role) === "specialist")) return reply({ ok: false, error: "Space Specialist is already assigned. Ask that crewmember to swap roles." });
    player.role = "specialist";
    player.team = "crew";
    broadcastRoomUpdate(room);
    reply({ ok: true });
  });

  // Server-authoritative educational planet flights. GMAT previews are tied
  // to a spacecraft revision and only the exact preview can be committed.
  socket.on("specialist_flight_action", async (data, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!currentRoomId || !rooms[currentRoomId]) return reply({ ok: false, error: "Join a mission first." });
    const room = rooms[currentRoomId];
    const player = room.players[socket.id];
    if (!player) return reply({ ok: false, error: "Join a mission first." });
    if (normalizeRoleId(player.role) !== "specialist") return reply({ ok: false, error: "Only the assigned Space Specialist can operate this expedition." });
    data = asObject(data);
    room.mission = room.mission || createMissionState();
    const mission = room.mission;
    let flight = mission.specialistFlight;
    const fail = (error) => reply({ ok: false, error });
    const notify = () => {
      mission.updatedAt = Date.now();
      broadcastMissionUpdate(room, { action: "specialist_flight", playerId: socket.id, playerName: player.name });
    };
    if (data.action === "plan") {
      if (mission.phase !== "station") return fail("Dock with the ISS before starting a planet expedition.");
      const seed = typeof data.planet === "string" && Object.prototype.hasOwnProperty.call(planetSeeds.planets, data.planet) ? planetSeeds.planets[data.planet] : null;
      if (!seed) return fail("Choose a supported planet.");
      if (flight && !["complete", "missed"].includes(flight.stage)) return fail("End the current expedition before selecting another planet.");
      if (room.specialistCoastTimer) {
        clearTimeout(room.specialistCoastTimer);
        room.specialistCoastTimer = null;
      }
      flight = mission.specialistFlight = {
        planet: data.planet, stage: "planning", revision: 0, plannedBy: player.name,
        operatorId: socket.id, operatorUserId: player.userId || null,
        current: { epochMs: seed.epochMs, state: seed.state.slice(), fuelKg: seed.fuelKg, dryMassKg: seed.dryMassKg, ispSec: seed.ispSec },
        suggestedBurnMps: seed.suggestedBurnMps.slice(), horizonDays: seed.horizonDays,
        earthPositionKm: seed.earthPositionKm.slice(), preview: null, playback: null
      };
    } else if (data.action === "reset") {
      if (!flight) return fail("No expedition is active.");
      if (room.specialistCoastTimer) {
        clearTimeout(room.specialistCoastTimer);
        room.specialistCoastTimer = null;
      }
      mission.specialistFlight = null;
    } else if (!flight) {
      return fail("Choose a destination first.");
    } else if (data.action === "forecast") {
      if (!["planning", "encounter"].includes(flight.stage)) return fail("A forecast is not available during this flight stage.");
      if (flight.forecastPending) return fail("A forecast is already running.");
      const burn = asObject(data.burn);
      const version = flight.revision;
      flight.forecastPending = true;
      flight.operatorId = socket.id;
      flight.operatorUserId = player.userId || null;
      try {
        const result = await gmatForecast.forecast(
          {
            planet: flight.planet,
            mode: flight.stage === "planning" ? "transfer" : "insertion",
            current: flight.current,
            horizonDays: flight.horizonDays,
            delayDays: burn.delayDays,
            v: burn.v,
            n: burn.n,
            b: burn.b
          },
          {
            label: `forecast:${room.id}`,
            shouldRun: () =>
              !!(
                rooms[room.id] === room &&
                room.status !== "lobby" &&
                room.mission === mission &&
                mission.specialistFlight === flight &&
                flight.revision === version
              )
          }
        );
        if (rooms[room.id] !== room || room.mission !== mission || mission.specialistFlight !== flight || flight.revision !== version) return fail("The flight changed while GMAT was running. Forecast again.");
        if (room.players[socket.id] && normalizeRoleId(room.players[socket.id].role) !== "specialist") return fail("Your Space Specialist role changed while GMAT was running.");
        flight.preview = { ...result, id: crypto.randomUUID(), revision: version, requestedBy: player.name };
        flight.forecastPending = false;
        notify();
        return reply({ ok: true, forecastId: flight.preview.id });
      } catch (error) {
        return fail(error.message || "GMAT forecast failed.");
      } finally {
        flight.forecastPending = false;
      }
    } else if (data.action === "execute") {
      const preview = flight.preview;
      if (!["planning", "encounter"].includes(flight.stage) || !preview || preview.id !== data.forecastId || preview.revision !== flight.revision) return fail("Forecast the current burn before executing it.");
      const insertion = flight.stage === "encounter";
      const durationMs = insertion ? 10000 : 35000;
      const startAt = Date.now();
      flight.stage = "coast";
      flight.playback = { startAt, durationMs, endsAt: startAt + durationMs, from: 0, to: 1 };
      flight.executedBy = player.name;
      flight.operatorId = socket.id;
      flight.operatorUserId = player.userId || null;
      armSpecialistCoastTimer(room, durationMs);
    } else {
      return fail("That action is not available at this stage.");
    }
    notify();
    reply({ ok: true, flight });
  });

  // 6. Complete Task (single shared co-op objective track)
  socket.on("complete_task", async (data = {}) => {
    data = asObject(data);
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const p = room.players[socket.id];
    if (!p) return;
    if (room.status !== "playing") return;
    room.mission = room.mission || createMissionState();

    const now = Date.now();
    if (socket.lastTaskAt && now - socket.lastTaskAt < 500) return;
    socket.lastTaskAt = now;

    room.completedTaskIds = room.completedTaskIds || {};
    const taskId = String(data.taskId || "").slice(0, 64);
    const taskName = String(data.taskName || "Station Maintenance").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 64) || "Station Maintenance";
    const isMissionObjective = COOP_OBJECTIVE_IDS.has(taskId);
    // Only the fixed shared-objective track can award statistics or write task
    // rows. Unknown/side task ids used to allow unlimited leaderboard farming.
    if (!isMissionObjective) return;

    room.mission.completed = room.mission.completed || {};

    // Mission objectives form a dependency graph. Reject out-of-order
    // completions so the room always advances through valid tracks.
    if (isMissionObjective) {
      const objectiveDef = MISSION_OBJECTIVES.find((objective) => objective.id === taskId);
      const assignedRole = resolveMissionObjectiveAssignments(room)[taskId]
        || (objectiveDef && objectiveDef.role === "all" ? "all" : normalizeRoleId(objectiveDef && objectiveDef.role, "commander"));

      // Mission consoles are owned by one role. The server is authoritative:
      // a client cannot complete another role's objective by spoofing the event.
      if (!canPlayerCompleteMissionObjective(room, p, objectiveDef)) {
        const roleMeta = ROLE_INFO[assignedRole] || null;
        socket.emit("objective_locked", {
          taskId,
          taskName,
          missing: [],
          reason: "role",
          assignedRole,
          assignedRoleShort: roleMeta ? roleMeta.short : String(assignedRole).toUpperCase(),
          assignedRoleLabel: roleMeta ? roleMeta.title : String(assignedRole).toUpperCase(),
          mission: serializeMission(room.mission, room)
        });
        return;
      }

      const completed = new Set(Object.keys(room.mission.completed));
      const missing = objectiveDef
        ? objectiveDef.dependsOn.filter((dependency) => !completed.has(dependency))
        : [];
      if (missing.length > 0) {
        socket.emit("objective_locked", {
          taskId,
          taskName,
          missing,
          mission: serializeMission(room.mission, room)
        });
        return;
      }
      if (taskId !== "task_antenna" && room.mission.phase !== "station") {
        socket.emit("objective_locked", {
          taskId,
          taskName,
          missing: [],
          reason: "station_phase",
          mission: serializeMission(room.mission, room)
        });
        return;
      }
    }

    // The LDR final report is validated by the server before the objective can
    // be completed. The browser provides the compact report; the server owns
    // the room scenario/difficulty, recomputes the score arithmetic, checks all
    // resource constraints, validates design ids, and requires every phase to
    // pass (including the seeded anomaly).
    if (taskId === "task_landing" || data.evaluation) {
      const validation = validateFinalReport({
        report: data.evaluation,
        scenarioId: room.mission.scenarioId,
        difficultyId: room.mission.difficultyId,
        completedObjectives: Object.keys(room.mission.completed || {}).length
      });
      if (!validation.ok) {
        socket.emit("mission_validation_failed", {
          taskId,
          taskName,
          reasons: validation.reasons,
          message: `LDR report rejected: ${validation.reasons.slice(0, 3).join(" ")}`
        });
        return;
      }
      room.mission.design = validation.result.design;
      room.mission.result = validation.result;
      room.mission.updatedAt = now;
      room.mission.scenarioId = validation.result.scenarioId;
      room.mission.difficultyId = validation.result.difficultyId;
      console.log(`[VALIDATION] LDR report accepted for room ${currentRoomId}: score ${validation.result.overallScore}/100, CML ${validation.result.cmlLevel}, event ${validation.result.event ? validation.result.event.id : "none"}`);
    }

    // Merge the subsystem choices committed at this console into the shared
    // mission design before checking alreadyCompleted so crew revisions sync.
    // Scenario/difficulty changes are host-only and lobby-only.
    const designPatch = applyRoomDesignPatch(room, socket, data.designPatch);

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
          mission: serializeMission(room.mission, room),
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
          mission: serializeMission(room.mission, room),
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
    await db.recordRoomTaskCompletion(currentRoomId, taskId, taskName, socket.userId, p.name, COOP_OBJECTIVE_ID_LIST);
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
      mission: serializeMission(room.mission, room)
    });

    // Victory when the whole crew has completed all shared objectives and the
    // LDR report has passed server-side flight-qualification validation.
    if (isMissionObjective && isMissionComplete(room.mission) && room.mission.result) {
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
        mission: serializeMission(room.mission, room),
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
    const designPatch = applyRoomDesignPatch(room, socket, data.designPatch || data);
    if (!designPatch) return;

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
    if (room.specialistCoastTimer) {
      clearTimeout(room.specialistCoastTimer);
      room.specialistCoastTimer = null;
    }

    const scenarioId = (room.mission && room.mission.scenarioId) || "cubesat_101";
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
    room.shuttleHandedOff = false;
    room.artemisMission = null;
    room.artemisInputs = {};
    room.artemisSurfaceInputs = {};
    room.artemisDuties = null;
    room.artemisResultRecorded = false;
    room.artemisLastTick = 0;
    room.artemisLastSnap = 0;
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
      color: /^#[0-9a-fA-F]{6}$/.test(p.color) ? p.color : "#c9f04b",
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

    const snapKey = memberSnapshotKey(p.userId, p.name);
    if (isDisconnect) {
      if (!room.memberSnapshots || typeof room.memberSnapshots !== "object") {
        room.memberSnapshots = {};
      }
      room.memberSnapshots[snapKey] = capturePlayerSnapshot(room, p);
    } else if (room.memberSnapshots) {
      delete room.memberSnapshots[snapKey];
    }

    delete room.players[socket.id];
    if (room.shuttleInputs) {
      delete room.shuttleInputs[socket.id];
    }
    if (room.artemisInputs) delete room.artemisInputs[socket.id];
    if (room.artemisSurfaceInputs) delete room.artemisSurfaceInputs[socket.id];
    if (room.artemisMission && room.artemisDuties && Object.values(room.artemisDuties).includes(socket.id)) {
      room.artemisDuties = assignArtemisDuties(room);
      room.artemisMission.duties = artemisDutyPayload(room);
      sendArtemisSnapshot(room);
    }
    if (room.swapRequests) {
      for (const [reqId, req] of Object.entries(room.swapRequests)) {
        if (req.fromId === socket.id || req.toId === socket.id) {
          delete room.swapRequests[reqId];
        }
      }
    }
    if (room.mission && room.mission.boarded && !isDisconnect) {
      delete room.mission.boarded[socket.id];
      if (room.mission.skipVotes) delete room.mission.skipVotes[socket.id];
      room.mission.updatedAt = Date.now();
    } else if (room.mission && room.mission.boarded) {
      delete room.mission.boarded[socket.id];
      if (room.mission.skipVotes) delete room.mission.skipVotes[socket.id];
    }

    if (room.coverage) {
      coverageRoom.onPlayerLeft(room.coverage, room);
      sendCoverageState(room);
    }

    const remainingIds = Object.keys(room.players);
    if (remainingIds.length === 0) {
      if (isDisconnect) {
        // Keep active mission/shuttle state intact on transient disconnects and persist to DB.
        room.emptySince = Date.now();
        await saveRoomSnapshotNow(room).catch((err) => {
          console.error("[DB] Failed saving disconnected room:", err.message);
        });
      } else {
        if (room.launchPollTimer) {
          clearTimeout(room.launchPollTimer);
          room.launchPollTimer = null;
        }
        if (room.specialistCoastTimer) {
          clearTimeout(room.specialistCoastTimer);
          room.specialistCoastTimer = null;
        }
        room.status = "lobby";
        room.tasks = { completed: 0, total: COOP_OBJECTIVE_IDS.size };
        room.completedTaskIds = {};
        room.swapRequests = {};
        room.manualSwapOccurred = false;
        room.memberSnapshots = {};
        room.mission = createMissionState();
        room.shuttleMission = null;
        room.shuttleInputs = {};
        room.shuttleResultRecorded = false;
        room.shuttleTestFreeze = false;
        room.shuttleHandedOff = false;
        room.artemisMission = null;
        room.artemisInputs = {};
        room.artemisSurfaceInputs = {};
        room.artemisDuties = null;
        room.artemisResultRecorded = false;
        room.coverage = null;
        room.lastCovClock = 0;
        room.systems.dockingPilotId = null;
        room.systems.dockingState = null;
        await saveRoomSnapshotNow(room).catch(() => {});
      }
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
        const nextPilot = nextPilotId ? roomPlayerById(room, nextPilotId) : null;
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

let shuttingDown = false;
async function handleGracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] Received ${signal}, flushing active room state...`);
  try {
    await flushAllRoomSaves();
  } catch (err) {
    console.error("[SHUTDOWN] Error flushing rooms:", err.message);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}
process.once("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
process.once("SIGINT", () => handleGracefulShutdown("SIGINT"));

// Last-resort safety net. Socket handlers are individually guarded, but an
// unexpected asynchronous failure must be logged and turned into a controlled
// restart rather than an unlabelled process death.
process.on("unhandledRejection", (reason) => {
  console.error("[PROCESS] Unhandled promise rejection:", reason && reason.stack ? reason.stack : reason);
});
process.on("uncaughtException", (error) => {
  console.error("[PROCESS] Uncaught exception:", error && error.stack ? error.stack : error);
  if (!shuttingDown) {
    handleGracefulShutdown("uncaughtException");
  } else {
    process.exit(1);
  }
});

// Initialize database, restore persisted active rooms, and boot HTTP/Socket server
db.initDatabase()
  .then(async () => {
    await restoreActiveRoomsFromDb().catch((err) => {
      console.warn("[RESTORE] Failed loading persisted rooms:", err.message);
    });
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Interfellas Lunaspis Orbital Transit Simulator online on port ${PORT}`);
      console.log(`🌍 Server region: ${DEPLOY_REGION}`);
      console.log(`📦 Railway Object Storage: ${storage.isConfigured() ? 'Active (' + storage.bucket + ')' : 'Local Disk Mode'}`);

      // Auto-populate Railway Bucket in background if configured
      if (storage.isConfigured()) {
        syncAssetsToBucket().catch(err => console.warn('[STORAGE] Background sync notice:', err.message));
      }
    });
  })
  .catch(async (err) => {
    console.error("[DB] Fatal error during database startup:", err);
    await restoreActiveRoomsFromDb().catch(() => {});
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Interfellas server online on port ${PORT} (fallback mode)`);
      console.log(`🌍 Server region: ${DEPLOY_REGION}`);
      console.log(`📦 Railway Object Storage: ${storage.isConfigured() ? 'Active (' + storage.bucket + ')' : 'Local Disk Mode'}`);

      // Auto-populate Railway Bucket in background if configured
      if (storage.isConfigured()) {
        syncAssetsToBucket().catch(err => console.warn('[STORAGE] Background sync notice:', err.message));
      }
    });
  });
