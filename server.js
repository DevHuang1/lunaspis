const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const db = require("./server/db");
const storage = require("./server/storage");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 10000,
  pingTimeout: 30000   // a player whose page stalls a few seconds (texture upload, slow PC) keeps their crew seat
});

// Initialize zero-audio WebRTC voice signaling
require("./server/voice-signaling")(io);

const PORT = process.env.PORT || 3000;

app.use(express.json());

// Railway Object Storage Stream & Fallback Route for 3D Assets
app.get("/assets/:filename", async (req, res, next) => {
  const localFile = path.join(__dirname, "public", "assets", req.params.filename);
  if (fs.existsSync(localFile)) {
    return next(); // Let local express.static serve it
  }

  if (storage.isConfigured()) {
    try {
      const objectKey = `assets/${req.params.filename}`;
      const obj = await storage.getObject(objectKey);
      if (obj && obj.body) {
        res.setHeader("Content-Type", obj.contentType || "model/gltf-binary");
        res.setHeader("Access-Control-Allow-Origin", "*");
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
      console.warn(`[STORAGE] Stream fallback error for ${req.params.filename}:`, e.message);
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

// Storage Telemetry & On-Demand Sync Endpoints
app.get("/api/storage/status", async (req, res) => {
  const assetsDir = path.join(__dirname, "public", "assets");
  const localFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir).filter(f => f.endsWith(".glb")) : [];

  res.json({
    configured: storage.isConfigured(),
    endpoint: storage.endpoint,
    bucket: storage.bucket,
    region: storage.region,
    localAssetCount: localFiles.length,
    assets: localFiles
  });
});

app.post("/api/storage/sync", async (req, res) => {
  try {
    const result = await syncAssetsToBucket();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve static assets with no-cache headers for scripts/html so updates load instantly
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  maxAge: 0,
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
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
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, callsign, flightTitle, suitColor } = req.body;
    const result = await db.registerUser({ username, password, callsign, flightTitle, suitColor });
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await db.loginUser(username, password);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    const result = await db.resetPassword(username, newPassword);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] || req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });
    const user = await db.getUserById(userId);
    if (!user) return res.status(404).json({ success: false, error: "Astronaut credential not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/update-profile", async (req, res) => {
  try {
    const { userId, callsign, flightTitle, suitColor, preferredRole } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });
    const user = await db.updateUserProfile(userId, {
      callsign,
      flight_title: flightTitle,
      suit_color: suitColor,
      preferred_role: preferredRole
    });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/user/:userId", async (req, res) => {
  try {
    const user = await db.getOrCreateUser(req.params.userId);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/user", async (req, res) => {
  try {
    const { userId, username, suitColor, preferredRole } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: "userId required" });
    const user = await db.updateUserProfile(userId, {
      username,
      suit_color: suitColor,
      preferred_role: preferredRole
    });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const leaders = await db.getTopAstronauts(10);
    res.json({ success: true, leaderboard: leaders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/rooms", async (req, res) => {
  try {
    const activeRooms = await db.getActiveRoomsList();
    res.json({ success: true, rooms: activeRooms });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// CubeSat coverage: SGP4 library (satellite.js, MIT) served from node_modules; a clean 404 if not installed
app.get("/vendor/satellite.min.js", (req, res) => {
  const f = path.join(__dirname, "node_modules", "satellite.js", "dist", "satellite.min.js");
  if (fs.existsSync(f)) return res.type("application/javascript").sendFile(f);
  res.status(404).type("application/javascript").send("/* satellite.js not installed: Real Satellite mode unavailable */");
});
// CubeSat coverage: CelesTrak GP / SatNOGS station proxy with caching and an error budget
require("./server/coverage_data.js")(app);

// Fallback route to serve index.html for any unhandled GET request
app.use((req, res, next) => {
  if (req.method === "GET") {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  } else {
    next();
  }
});

// ============================================================================
// AUTHORITATIVE CO-OP SHUTTLE MISSION: ROOMS, CREW SEATS, SIMULATION LOOP
// ============================================================================
// One deterministic ShuttleMission per room runs here at a fixed 60 Hz step (the same DOM-free
// module the browser loads). Clients send semantic commands and control axes; the server only
// accepts them from the crew seat that owns them and streams MissionSnapshots to the whole crew.
const { ShuttleMission, CREW } = require("./public/js/game/shuttle_mission.js");
const MAX_PLAYERS = CREW.roles.length;
const GAME_MODE = "shuttle-coop";
const SUIT_COLORS = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b"];
const SNAPSHOT_HZ = 15;
const TEST_HOOKS = process.env.SHUTTLE_TEST === "1";   // accelerated stepping for automated playtests only
// CubeSat Contact Coverage: a second, separate activity. The server owns scenario + clock + edit rights only.
const coverageRoom = require("./server/coverage_room.js");
const ACTIVITIES = ["shuttle", "coverage"];
const FLIGHTS = ["deploy", "iss"];      // Shuttle flight: satellite deploy + landing, or ISS docking
// Pre-flight boarding on LC-39A: everyone walks the gantry access arm to the crew hatch (pad_layout.js)
const PadLayout = require("./public/js/game/pad_layout.js");
function newPadState() { return { arm: false, armAt: 0, aboard: {} }; }
function padAboardIds(room) { return room.pad ? Object.keys(room.pad.aboard).filter((id) => room.players[id]) : []; }
function crewNotAboard(room) { return room.pad ? Object.keys(room.players).filter((id) => !room.pad.aboard[id]) : []; }

const rooms = {};

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return rooms[code] ? generateRoomCode() : code;
}

function createNewRoom(roomId, hostId, isPublic = true, activity = "shuttle") {
  return {
    id: roomId, hostId, mode: GAME_MODE, activity: ACTIVITIES.includes(activity) ? activity : "shuttle", flight: "deploy", coverage: null, maxPlayers: MAX_PLAYERS, status: "lobby", isPublic: !!isPublic,
    createdAt: Date.now(), players: {}, mission: null, inputs: {}, lastTick: 0, lastSnap: 0,
    testFreeze: false, resultRecorded: false, chatHistory: []
  };
}

function takenRoles(room, exceptId) {
  const t = {};
  for (const id in room.players) if (id !== exceptId && room.players[id].role) t[room.players[id].role] = id;
  return t;
}
function firstFreeRole(room) {
  const t = takenRoles(room);
  return CREW.roles.find((r) => !t[r]) || null;
}
// Seat owner: the player in that seat; otherwise the Commander; otherwise the host.
function seatOwner(room, role) {
  const t = takenRoles(room);
  if (t[role]) return t[role];
  if (t.cdr) return t.cdr;
  return room.players[room.hostId] ? room.hostId : Object.keys(room.players)[0];
}
function effectiveRoles(room, socketId) {
  return CREW.roles.filter((r) => seatOwner(room, r) === socketId);
}
function crewAssignments(room) {
  const out = {};
  for (const r of CREW.roles) {
    const sid = seatOwner(room, r), p = room.players[sid];
    out[r] = { playerId: sid || null, name: p ? p.name : null, filled: !!takenRoles(room)[r] };
  }
  return out;
}

function serializeRoom(room) {
  return {
    id: room.id, hostId: room.hostId, mode: room.mode, activity: room.activity, flight: room.flight || "deploy", maxPlayers: room.maxPlayers, status: room.status,
    editorId: room.coverage ? room.coverage.editorId : null,
    players: Object.values(room.players), crew: crewAssignments(room), roleInfo: CREW.info
  };
}
function broadcastRoomUpdate(room) {
  io.to(room.id).emit("room_update", { roomId: room.id, ...serializeRoom(room) });
}

function mergedInputs(room) {
  const inp = { pitch: 0, yaw: 0, roll: 0, tx: 0, ty: 0, tz: 0, sb: 0, brake: 0 };
  for (const axis of Object.keys(inp)) {
    const owner = seatOwner(room, CREW.axisRole[axis]);
    const src = room.inputs[owner];
    if (src && typeof src[axis] === "number" && isFinite(src[axis])) inp[axis] = src[axis];
  }
  return inp;
}

function sendCoverageState(room, socket) {
  if (!room.coverage) return;
  const st = coverageRoom.publicState(room.coverage, room);
  (socket || io.to(room.id)).emit("coverage_state", st);
}

function sendSnapshot(room) {
  if (!room.mission) return;
  const sn = room.mission.snapshot();
  sn.crew = crewAssignments(room);
  sn.pad = room.pad ? { arm: room.pad.arm, aboard: padAboardIds(room) } : { arm: true, aboard: Object.keys(room.players) };
  io.to(room.id).emit("shuttle_state", sn);
  return sn;
}

async function recordResult(room) {
  if (room.resultRecorded || !room.mission || !room.mission.result) return;
  room.resultRecorded = true;
  room.status = "debrief";
  await db.upsertGameRoom(room.id, room.hostId, "victory");
  if (room.mission.result.success) {
    for (const pid in room.players) {
      const p = room.players[pid];
      if (p.userId) db.incrementUserStats(p.userId, { gamesWon: 1 });
    }
  }
}

// Simulation loop: the mission's own accumulator turns wall time into fixed 1/60 s steps.
setInterval(() => {
  const now = Date.now();
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const playerCount = Object.keys(room.players).length;
    if (playerCount === 0 && now - room.createdAt > 1800000) { delete rooms[roomId]; continue; }
    if (room.coverage && playerCount > 0 && now - (room.lastCovClock || 0) >= 1000) {
      room.lastCovClock = now;
      const c = room.coverage; io.to(roomId).emit("coverage_clock", { revision: c.revision, clock: { simT: coverageRoom.clockNow(c, now), wallRef: now, rate: c.clock.rate, paused: c.clock.paused }, serverNow: now });
    }
    if (!room.mission) continue;
    if (playerCount === 0) continue;      // nobody aboard: hold the simulation
    const dt = room.lastTick ? (now - room.lastTick) / 1000 : 0;
    room.lastTick = now;
    room.mission.command("SET_CONTROL_INPUT", mergedInputs(room));
    const events = room.mission.advance(room.testFreeze ? 0 : Math.min(dt, 0.5));
    if (events.length) io.to(roomId).emit("shuttle_events", events.filter((e) => e.type !== "COMMAND_ACCEPTED"));
    if (now - room.lastSnap >= 1000 / SNAPSHOT_HZ || events.length) { room.lastSnap = now; sendSnapshot(room); }
    if (room.mission.result) recordResult(room);
  }
}, 1000 / 30);

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================
io.on("connection", (socket) => {
  let currentRoomId = null;

  socket.on("client_ping", (clientTime, callback) => {
    if (typeof callback === "function") callback(Date.now());
  });

  socket.on("sync_user", async (data = {}, callback) => {
    const userId = data.userId || socket.id;
    socket.userId = userId;
    const user = await db.getOrCreateUser(userId, data.playerName || "Astronaut", data.suitColor || "#ef4444", data.role || "cdr");
    if (typeof callback === "function") callback({ success: true, user });
    socket.emit("user_synced", user);
  });

  function makePlayer(room, data, isHost) {
    const taken = Object.values(room.players).map((p) => p.color);
    const color = data.suitColor && !taken.includes(data.suitColor) ? data.suitColor : (SUIT_COLORS.find((c) => !taken.includes(c)) || SUIT_COLORS[0]);
    const wanted = CREW.roles.includes(data.role) && !takenRoles(room)[data.role] ? data.role : firstFreeRole(room);
    return {
      id: socket.id, userId: socket.userId, color, role: wanted, team: "crew", isHost, ready: !!isHost,
      name: (data.playerName || `Crew ${Object.keys(room.players).length + 1}`).trim().slice(0, 16) || "Astronaut"
    };
  }

  // Host creates a room (private "solo" rooms are the same thing with one crew member)
  socket.on("create_room", async (data = {}, callback) => {
    const roomId = generateRoomCode();
    const room = createNewRoom(roomId, socket.id, data.isPublic !== false, data.activity);
    if (FLIGHTS.includes(data.flight)) room.flight = data.flight;
    rooms[roomId] = room;
    currentRoomId = roomId;
    socket.join(roomId);
    socket.userId = data.userId || socket.userId || `user_${socket.id.slice(0, 8)}`;
    const player = makePlayer(room, Object.assign({}, data, { role: data.role || "cdr" }), true);
    room.players[socket.id] = player;
    console.log(`[ROOM] Created Shuttle crew room ${roomId} by ${player.name} (${player.role})`);
    await db.getOrCreateUser(socket.userId, player.name, player.color, player.role);
    await db.upsertGameRoom(roomId, socket.userId, "lobby", MAX_PLAYERS, data.isPublic !== false);
    await db.upsertRoomMember(roomId, socket.userId, socket.id, player);
    const payload = { success: true, roomId, hostId: socket.id, player, room: serializeRoom(room) };
    if (typeof callback === "function") callback(payload);
    socket.emit("room_created", payload);
    broadcastRoomUpdate(room);
  });

  socket.on("join_room", async (data = {}, callback) => {
    const targetCode = (data.roomId || "").trim().toUpperCase();
    let room = rooms[targetCode];
    if (!room && targetCode === "ORBIT1") {
      room = createNewRoom("ORBIT1", socket.id, true);
      rooms.ORBIT1 = room;
      await db.upsertGameRoom("ORBIT1", data.userId || socket.userId || socket.id, "lobby", MAX_PLAYERS, true);
    }
    const fail = (message) => { const err = { success: false, message }; if (typeof callback === "function") callback(err); socket.emit("join_error", err); };
    if (!room) return fail(`Room "${targetCode}" does not exist. Check the code and try again!`);
    if (Object.keys(room.players).length >= MAX_PLAYERS && !room.players[socket.id]) return fail(`Room "${targetCode}" is full (${MAX_PLAYERS}/${MAX_PLAYERS} crew seats).`);
    if (Object.keys(room.players).length === 0) room.hostId = socket.id;
    socket.userId = data.userId || socket.userId || `user_${socket.id.slice(0, 8)}`;
    currentRoomId = targetCode;
    socket.join(targetCode);
    const player = makePlayer(room, data, room.hostId === socket.id);
    room.players[socket.id] = player;
    console.log(`[ROOM] ${player.name} joined ${targetCode} as ${player.role} (${Object.keys(room.players).length}/${MAX_PLAYERS})`);
    await db.getOrCreateUser(socket.userId, player.name, player.color, player.role);
    await db.upsertRoomMember(targetCode, socket.userId, socket.id, player);
    const payload = { success: true, roomId: targetCode, hostId: room.hostId, player, room: serializeRoom(room), inFlight: !!(room.mission || room.coverage) };
    if (typeof callback === "function") callback(payload);
    socket.emit("room_joined", payload);
    broadcastRoomUpdate(room);
    if (room.mission) { socket.emit("game_started", { roomId: targetCode, mode: GAME_MODE, rejoin: true }); sendSnapshot(room); }
    else if (room.coverage) { socket.emit("game_started", { roomId: targetCode, mode: "coverage", rejoin: true }); sendCoverageState(room, socket); }
  });

  // Lobby: name / colour / crew seat (seats are unique)
  socket.on("customize_astronaut", async (data = {}, callback) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId], player = room.players[socket.id];
    if (!player) return;
    if (data.name) player.name = String(data.name).trim().slice(0, 16);
    if (data.color) player.color = data.color;
    if (typeof data.ready === "boolean") player.ready = data.ready;
    let result = { success: true };
    if (data.role !== undefined && data.role !== null) {
      const t = takenRoles(room, socket.id);
      if (!CREW.roles.includes(data.role)) result = { success: false, message: "Unknown crew seat" };
      else if (t[data.role]) result = { success: false, message: `${CREW.info[data.role].title} seat is taken by ${room.players[t[data.role]].name}` };
      else player.role = data.role;
    }
    if (socket.userId) {
      await db.updateUserProfile(socket.userId, { username: player.name, suit_color: player.color, preferred_role: player.role });
      await db.upsertRoomMember(currentRoomId, socket.userId, socket.id, player);
    }
    if (typeof callback === "function") callback(result);
    if (!result.success) socket.emit("role_rejected", result);
    broadcastRoomUpdate(room);
  });

  // Host launches the crew into the mission (briefing first; the Commander starts the count)
  socket.on("start_game", async () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.hostId !== socket.id) return;
    if (room.activity === "coverage") {
      room.mission = null;
      if (!room.coverage) room.coverage = coverageRoom.createCoverageState(socket.id);
      room.status = "playing";
      console.log(`[GAME] CubeSat coverage session started in room ${currentRoomId}`);
      await db.upsertGameRoom(currentRoomId, room.hostId, "playing");
      io.to(currentRoomId).emit("game_started", { roomId: currentRoomId, mode: "coverage" });
      broadcastRoomUpdate(room);
      sendCoverageState(room);
      return;
    }
    room.mission = new ShuttleMission({ variant: room.flight });
    room.pad = newPadState();
    for (const pid in room.players) room.players[pid].padPos = null;
    room.status = "playing"; room.inputs = {}; room.lastTick = Date.now(); room.resultRecorded = false; room.testFreeze = false;
    console.log(`[GAME] Shuttle mission ${room.mission.missionId} started in room ${currentRoomId}`);
    await db.upsertGameRoom(currentRoomId, room.hostId, "playing");
    for (const pid in room.players) { const p = room.players[pid]; if (p.userId) db.incrementUserStats(p.userId, { gamesPlayed: 1 }); }
    io.to(currentRoomId).emit("game_started", { roomId: currentRoomId, mode: GAME_MODE, missionId: room.mission.missionId });
    sendSnapshot(room);
  });

  // Host picks the activity in the lobby (Shuttle crew or CubeSat coverage)
  socket.on("set_activity", (data = {}, callback) => {
    const room = currentRoomId && rooms[currentRoomId];
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    if (!room) return reply({ success: false, message: "Not in a room" });
    if (room.hostId !== socket.id) return reply({ success: false, message: "Only the host can change the mission" });
    if (room.mission || room.coverage) return reply({ success: false, message: "A mission is already running in this room" });
    if (room.id === "ORBIT1") return reply({ success: false, message: "The public room is for the Shuttle crew" });
    if (!ACTIVITIES.includes(data.activity)) return reply({ success: false, message: "Unknown mission" });
    room.activity = data.activity;
    reply({ success: true });
    broadcastRoomUpdate(room);
  });

  // Host picks the Shuttle flight in the lobby (satellite deploy or ISS docking)
  socket.on("set_flight", (data = {}, callback) => {
    const room = currentRoomId && rooms[currentRoomId];
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    if (!room) return reply({ success: false, message: "Not in a room" });
    if (room.hostId !== socket.id) return reply({ success: false, message: "Only the host can change the flight" });
    if (room.mission) return reply({ success: false, message: "A flight is already running in this room" });
    if (!FLIGHTS.includes(data.flight)) return reply({ success: false, message: "Unknown flight" });
    room.flight = data.flight;
    reply({ success: true });
    broadcastRoomUpdate(room);
  });

  // CubeSat coverage: scenario / markers / clock / editor hand-over / forecast hash
  socket.on("coverage_request", (data = {}, callback) => {
    const room = currentRoomId && rooms[currentRoomId];
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    if (!room || !room.coverage || !room.players[socket.id]) return reply({ accepted: false, reason: "No coverage session" });
    if (data.type === "SYNC") { sendCoverageState(room, socket); return reply({ accepted: true }); }
    const r = coverageRoom.applyRequest(room.coverage, room, socket.id, data);
    reply({ accepted: r.accepted, reason: r.reason || null, revision: room.coverage.revision });
    if (r.accepted && r.changed) { sendCoverageState(room); if (r.changed === "editor") broadcastRoomUpdate(room); }
  });

  // Semantic mission commands, authorised by crew seat
  socket.on("shuttle_command", (data = {}, callback) => {
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.mission || !room.players[socket.id]) return reply({ accepted: false, reason: "Not in a flight" });
    const type = String(data.type || "");
    if (type === "SET_CONTROL_INPUT") return reply({ accepted: false, reason: "Use shuttle_input" });
    const seat = CREW.commandRole[type];
    if (!seat) return reply({ accepted: false, reason: `Unknown command ${type}` });
    if (seatOwner(room, seat) !== socket.id) {
      const owner = room.players[seatOwner(room, seat)];
      const r = { accepted: false, reason: `${CREW.info[seat].title} (${owner ? owner.name : "unassigned"}) owns ${type}` };
      return reply(r);
    }
    let r;
    const waiting = type === "START" ? crewNotAboard(room) : [];
    if (waiting.length) {
      r = { accepted: false, reason: `Waiting for ${waiting.map((id) => room.players[id].name).join(", ")} to board the orbiter` };
      return reply(r);
    }
    if (type === "RESTART") { room.mission = new ShuttleMission({ variant: room.flight }); room.resultRecorded = false; room.status = "playing"; r = { accepted: true }; }
    else r = room.mission.command(type, data.args || {});
    reply(r);
    const p = room.players[socket.id];
    io.to(room.id).emit("shuttle_command_log", { by: p.name, seat, type, accepted: r.accepted, reason: r.reason || null });
    const ev = room.mission.drainEvents();
    if (ev.length) io.to(room.id).emit("shuttle_events", ev.filter((e) => e.type !== "COMMAND_ACCEPTED"));
    sendSnapshot(room);
  });

  // Boarding walk: positions on the gantry are relayed to the crew (proximity voice + astronaut rigs)
  socket.on("pad_pos", (data = {}) => {
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.pad || !room.players[socket.id] || !Array.isArray(data.pos) || data.pos.length !== 3) return;
    const pos = data.pos.map(Number);
    if (!pos.every((n) => Number.isFinite(n) && Math.abs(n) < 5000)) return;
    const p = room.players[socket.id];
    p.padPos = pos;
    const emote = typeof data.emote === "string" && /^[a-z_]{2,12}$/.test(data.emote) ? data.emote : null;
    const out = { id: socket.id, pos, yaw: Number.isFinite(+data.yaw) ? +data.yaw : 0, moving: data.moving === 2 ? 2 : !!data.moving, emote };   // 2 = running
    socket.to(room.id).emit("pad_moved", out);   // not volatile: long-polling clients would lose most updates
  });
  // ARM: swing the access arm across (any crew member at the control console). BOARD: enter at the hatch.
  socket.on("pad_action", (data = {}, callback) => {
    const reply = (r) => { if (typeof callback === "function") callback(r); };
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.pad || !room.mission || !room.players[socket.id]) return reply({ accepted: false, reason: "Not on the pad" });
    if (room.mission.phase !== "briefing") return reply({ accepted: false, reason: "The count has started" });
    const p = room.players[socket.id], slack = PadLayout.RADIUS.serverSlack;
    // the request carries the walker's position (also kept from pad_pos); it must be a standable spot
    if (Array.isArray(data.pos) && data.pos.length === 3 && data.pos.every((n) => Number.isFinite(+n)) && PadLayout.floorAt(data.pos.map(Number), PadLayout.ARM.extended) !== null) p.padPos = data.pos.map(Number);
    const pos = p.padPos;
    let r;
    if (data.type === "ARM") {
      if (room.pad.arm) r = { accepted: true };
      else if (!pos || !PadLayout.nearConsole(pos, slack)) r = { accepted: false, reason: "Walk to the access-arm control first" };
      else { room.pad.arm = true; room.pad.armAt = Date.now(); r = { accepted: true }; io.to(room.id).emit("shuttle_command_log", { by: p.name, seat: null, type: "ACCESS_ARM_EXTEND", accepted: true, reason: null }); }
    } else if (data.type === "BOARD") {
      const swing = (PadLayout.ARM.retracted - PadLayout.ARM.extended) / PadLayout.ARM.swingRate * 1000 - 500;
      if (!room.pad.arm || Date.now() - room.pad.armAt < swing) r = { accepted: false, reason: "The access arm is not locked to the orbiter yet" };
      else if (!pos || !PadLayout.nearHatch(pos, slack)) r = { accepted: false, reason: "Walk across the access arm to the crew hatch" };
      else { room.pad.aboard[socket.id] = true; r = { accepted: true }; io.to(room.id).emit("shuttle_command_log", { by: p.name, seat: null, type: "BOARDED", accepted: true, reason: null }); }
    } else r = { accepted: false, reason: "Unknown pad action" };
    reply(r);
    sendSnapshot(room);
  });

  // Control axes (only the owning seat's axes are used by the server)
  socket.on("shuttle_input", (data = {}, callback) => {
    const room = currentRoomId && rooms[currentRoomId];
    if (!room || !room.players[socket.id]) return;
    const clean = {};
    for (const k of ["pitch", "yaw", "roll", "tx", "ty", "tz", "sb", "brake"]) if (typeof data[k] === "number" && isFinite(data[k])) clean[k] = Math.max(-1, Math.min(1, data[k]));
    room.inputs[socket.id] = clean;
    if (typeof callback === "function") callback(true);
  });

  if (TEST_HOOKS) {
    // Automated playtests only (SHUTTLE_TEST=1): freeze wall-clock stepping and advance the same
    // fixed-step simulation on request with the crew's current inputs.
    socket.on("shuttle_test", (data = {}, callback) => {
      const room = currentRoomId && rooms[currentRoomId];
      if (!room || !room.mission) return typeof callback === "function" && callback(null);
      if (data.op === "freeze") room.testFreeze = !!data.on;
      if (data.op === "dock_place" && room.mission.st.iss) {
        // test only: aligned in DAP HOLD, doors open, on the docking axis at the given distance, closing slowly
        const S = require("./public/js/game/shuttle_simulation.js"), m = room.mission;
        m.applyFixture("dock_place", (mm) => {
          const st = mm.st; st.bay.doors = 1; st.bay.cmd = 0; st.dap.mode = "HOLD"; st.q = S.dockGeometry(st).target; st.w = S.orbitRateBody(st); st.dap.holdRel = null;
          const g = S.dockGeometry(st), ax = Math.max(0.2, Number(data.axial) || 20);
          st.r = S.vec.add(st.r, S.vec.sub(S.vec.add(g.P, S.vec.scl(g.axis, ax)), g.D));
          const n = S.vec.norm(S.vec.cross(st.iss.r, st.iss.v)) / S.vec.norm(st.iss.r) ** 2;
          st.v = S.vec.add(S.vec.add(st.iss.v, S.vec.scl(S.vec.cross(g.F.H, S.vec.sub(st.r, st.iss.r)), n)), S.vec.scl(g.axis, -(Number(data.closing) || 0.07)));
          st.iss.axial = undefined; mm.prev = { r: st.r.slice(), q: st.q.slice() };
        });
      }
      if (data.op === "board_all" && room.pad) { room.pad.arm = true; room.pad.armAt = 0; for (const id in room.players) room.pad.aboard[id] = true; }
      if (data.op === "preset") {
        // test only: a scripted pilot flies the server mission to the named phase, in 200 ms slices so
        // the socket keeps breathing; the ack is sent when the phase is reached
        try {
          const { createPilot } = require("./tests/shuttle/pilot.js"), m = room.mission, pilot = createPilot(), stop = String(data.phase || "approach"), t0 = Date.now();
          m.applyFixture("preset " + stop, () => {});
          m._uncapped = true; m.warpReq = 1000;
          const slice = () => {
            const s0 = Date.now();
            while (Date.now() - s0 < 200) {
              if (m.result || m.failure || m.phase === stop || m.st.t > 6 * 3600) {
                m._uncapped = false; m.warpReq = 1; m.command("SET_CONTROL_INPUT", mergedInputs(room));
                console.log(`[TEST] preset ${stop}: ${m.phase} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
                const sn = sendSnapshot(room); if (typeof callback === "function") callback({ t: sn.simTime, phase: sn.phase }); return;
              }
              const o = pilot.step(m); for (const c of o.cmds) m.command(c[0], c[1]); m.command("SET_CONTROL_INPUT", o.input);
              m.advanceSim(Math.max(1, Math.min(o.warp, m._warpLimit().max)) / 60);
            }
            setImmediate(slice);
          };
          slice(); return;
        } catch (e) { console.warn("[TEST] preset failed:", e.message); }
      }
      if (data.op === "step") {
        room.mission.command("SET_CONTROL_INPUT", mergedInputs(room));
        const events = room.mission.advanceSim(Math.max(0, Math.min(60, Number(data.seconds) || 0)));
        if (events.length) io.to(room.id).emit("shuttle_events", events);
        if (room.mission.result) recordResult(room);
      }
      const sn = sendSnapshot(room);
      if (typeof callback === "function") callback({ t: sn.simTime, phase: sn.phase });
    });
  }

  socket.on("chat_message", async (msg) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId], p = room.players[socket.id];
    if (!p) return;
    const comm = { sender: p.name, color: p.color, role: p.role, team: "crew", teamOnly: false, text: String((msg && msg.text) || "").slice(0, 140), timestamp: Date.now() };
    room.chatHistory.push(comm);
    if (room.chatHistory.length > 50) room.chatHistory.shift();
    await db.logChatMessage(currentRoomId, comm.sender, comm.color, comm.role, comm.text);
    io.to(currentRoomId).emit("chat_broadcast", comm);
  });

  async function handlePlayerLeave(isDisconnect = false) {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const leavingRoomId = currentRoomId, room = rooms[leavingRoomId], p = room.players[socket.id];
    currentRoomId = null;
    if (!isDisconnect) socket.leave(leavingRoomId);
    if (!p) return;
    delete room.players[socket.id];
    delete room.inputs[socket.id];
    if (socket.userId) await db.removeRoomMember(leavingRoomId, socket.userId);
    if (room.hostId === socket.id) {
      const remaining = Object.keys(room.players);
      if (remaining.length > 0) {
        room.hostId = remaining[0];
        room.players[remaining[0]].isHost = true;
        await db.upsertGameRoom(leavingRoomId, room.players[remaining[0]].userId || remaining[0], room.status);
      }
    }
    if (room.coverage) { coverageRoom.onPlayerLeft(room.coverage, room); sendCoverageState(room); }
    if (Object.keys(room.players).length === 0) { room.mission = null; room.coverage = null; room.status = "lobby"; }
    broadcastRoomUpdate(room);
    socket.to(leavingRoomId).emit("player_left", { id: socket.id, name: p.name, role: p.role });
  }

  socket.on("leave_room", async (callback) => {
    await handlePlayerLeave(false);
    if (typeof callback === "function") callback({ success: true });
  });
  socket.on("disconnect", async () => { await handlePlayerLeave(true); });
});

// Initialize database and boot HTTP/Socket server
db.initDatabase()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Interfellas co-op Shuttle mission server online on port ${PORT}`);
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
