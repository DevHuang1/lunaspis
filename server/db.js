/**
 * ============================================================================
 * INTERFELLAS DATABASE & PERSISTENT STATE MANAGER
 * ============================================================================
 * Supports PostgreSQL via `pg` (production on Railway) with automatic fallback
 * to a persistent local storage engine when DATABASE_URL is not configured.
 *
 * Tables:
 * - users: astronaut profiles, persistent stats, color/role preferences
 * - game_rooms: room lifecycle, host, status, task progress
 * - room_members: player positions, roles, ready states, connection metadata
 * - room_task_states: co-op task status, who completed each task, timestamps
 * - game_chat_logs: persistent in-game and lobby comms
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let pool = null;
const isPostgres = !!process.env.DATABASE_URL;

// ============================================================================
// PASSWORD HASHING & CRYPTOGRAPHIC VERIFICATION
// ============================================================================
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  try {
    const [salt, key] = stored.split(":");
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(String(password), salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (e) {
    return false;
  }
}

// Local persistent file fallback (used if no PostgreSQL connection is provided)
const LOCAL_DB_DIR = path.join(__dirname, ".data");
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, "interfellas_db.json");

const memoryStore = {
  users: {},
  game_rooms: {},
  room_members: {},
  room_task_states: {},
  game_chat_logs: []
};

function loadLocalStore() {
  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const raw = fs.readFileSync(LOCAL_DB_FILE, "utf8");
      const parsed = JSON.parse(raw);
      Object.assign(memoryStore, parsed);
    }
  } catch (err) {
    console.warn("[DB] Could not load local DB file, starting fresh:", err.message);
  }
}

function saveLocalStore() {
  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(memoryStore, null, 2), "utf8");
  } catch (err) {
    console.error("[DB] Failed to save local DB:", err.message);
  }
}

// Initialize Database connection and schema
async function initDatabase() {
  if (isPostgres) {
    try {
      const { Pool } = require("pg");
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
      });

      console.log("[DB] Connecting to PostgreSQL on Railway...");
      const client = await pool.connect();
      console.log("[DB] PostgreSQL connected successfully!");

      // 1. Users table (Astronaut Flight Credentials)
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(128) PRIMARY KEY,
          username VARCHAR(64) NOT NULL,
          password_hash VARCHAR(255),
          callsign VARCHAR(64),
          flight_title VARCHAR(64) DEFAULT 'Commander',
          suit_color VARCHAR(32) DEFAULT '#ef4444',
          preferred_role VARCHAR(32) DEFAULT 'commander',
          games_played INT DEFAULT 0,
          games_won INT DEFAULT 0,
          tasks_completed INT DEFAULT 0,
          eva_hours FLOAT DEFAULT 0.0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Safe schema migrations for existing installations
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS callsign VARCHAR(64);`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS flight_title VARCHAR(64) DEFAULT 'Commander';`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS eva_hours FLOAT DEFAULT 0.0;`);

      // Auto-reset MRTTS credentials to default clearance "1234" if existing or guest
      try {
        await client.query(`
          INSERT INTO users (id, username, password_hash, callsign, flight_title, suit_color, preferred_role)
          VALUES ('astro_mrtts', 'mrtts', $1, 'MRTTS', 'Commander', '#f8fafc', 'commander')
          ON CONFLICT (id) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            last_seen_at = CURRENT_TIMESTAMP
        `, [hashPassword("1234")]);
        console.log("[DB] MRTTS NASA Flight Credential synced with clearance password '1234'.");
      } catch (err) {
        console.warn("[DB] Note on MRTTS credential sync:", err.message);
      }

      // 2. Game Rooms table
      await client.query(`
        CREATE TABLE IF NOT EXISTS game_rooms (
          room_id VARCHAR(16) PRIMARY KEY,
          host_id VARCHAR(128) NOT NULL,
          status VARCHAR(32) DEFAULT 'lobby',
          total_tasks INT DEFAULT 9,
          completed_tasks INT DEFAULT 0,
          is_public BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. Room Members table
      await client.query(`
        CREATE TABLE IF NOT EXISTS room_members (
          room_id VARCHAR(16) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
          user_id VARCHAR(128) NOT NULL,
          socket_id VARCHAR(128),
          player_name VARCHAR(64) NOT NULL,
          suit_color VARCHAR(32) NOT NULL,
          role VARCHAR(32) NOT NULL,
          is_host BOOLEAN DEFAULT FALSE,
          is_ready BOOLEAN DEFAULT FALSE,
          pos_x REAL DEFAULT 0.0,
          pos_y REAL DEFAULT 0.15,
          pos_z REAL DEFAULT -9.0,
          yaw REAL DEFAULT 0.0,
          tasks_done INT DEFAULT 0,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (room_id, user_id)
        );
      `);

      // 4. Room Task States table
      await client.query(`
        CREATE TABLE IF NOT EXISTS room_task_states (
          room_id VARCHAR(16) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
          task_id VARCHAR(64) NOT NULL,
          task_name VARCHAR(128) NOT NULL,
          completed BOOLEAN DEFAULT FALSE,
          completed_by_user_id VARCHAR(128),
          completed_by_name VARCHAR(64),
          completed_at TIMESTAMP WITH TIME ZONE,
          PRIMARY KEY (room_id, task_id)
        );
      `);

      // 5. Game Chat Logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS game_chat_logs (
          id SERIAL PRIMARY KEY,
          room_id VARCHAR(16) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
          sender VARCHAR(64) NOT NULL,
          color VARCHAR(32) NOT NULL,
          role VARCHAR(32) NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      client.release();
      console.log("[DB] PostgreSQL schema initialized: users, game_rooms, room_members, room_task_states, game_chat_logs");
      return true;
    } catch (err) {
      console.error("[DB] PostgreSQL initialization error, falling back to local persistent store:", err.message);
      pool = null;
      loadLocalStore();
      return false;
    }
  } else {
    console.log("[DB] No DATABASE_URL provided. Initializing local persistent store at", LOCAL_DB_FILE);
    loadLocalStore();
    return true;
  }
}

// ============================================================================
// ASTRONAUT FLIGHT CREDENTIALS & AUTHENTICATION
// ============================================================================

/**
 * Registers a new astronaut credential.
 */
async function registerUser({ username, password, callsign, flightTitle = "Commander", suitColor = "#ef4444" }) {
  const cleanUsername = String(username || "").trim().toLowerCase();
  const cleanCallsign = String(callsign || username || "").trim().slice(0, 24);
  const cleanTitle = String(flightTitle || "Commander").trim();
  const cleanColor = String(suitColor || "#ef4444").trim();

  if (!cleanUsername || cleanUsername.length < 3) {
    return { success: false, error: "Username must be at least 3 characters." };
  }
  if (!password || String(password).length < 4) {
    return { success: false, error: "Password must be at least 4 characters." };
  }

  const passHash = hashPassword(password);
  const userId = `astro_${cleanUsername}`;

  if (pool) {
    try {
      // Check if an account is already registered with a valid password
      const existing = await pool.query(
        "SELECT id FROM users WHERE (LOWER(username) = $1 OR id = $2) AND password_hash IS NOT NULL",
        [cleanUsername, userId]
      );
      if (existing.rows.length > 0) {
        return { success: false, error: "Astronaut callsign already registered. Please sign in or reset password." };
      }

      // Clean up any uncredentialed guest records with this username or ID
      await pool.query(
        "DELETE FROM users WHERE (LOWER(username) = $1 OR id = $2) AND password_hash IS NULL",
        [cleanUsername, userId]
      );

      const res = await pool.query(`
        INSERT INTO users (id, username, password_hash, callsign, flight_title, suit_color, preferred_role)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          username = EXCLUDED.username,
          password_hash = EXCLUDED.password_hash,
          callsign = EXCLUDED.callsign,
          flight_title = EXCLUDED.flight_title,
          suit_color = EXCLUDED.suit_color,
          preferred_role = EXCLUDED.preferred_role,
          last_seen_at = CURRENT_TIMESTAMP
        RETURNING id, username, callsign, flight_title, suit_color, preferred_role, games_played, games_won, tasks_completed, created_at, last_seen_at
      `, [userId, cleanUsername, passHash, cleanCallsign, cleanTitle, cleanColor, cleanTitle.toLowerCase()]);

      return { success: true, user: res.rows[0] };
    } catch (err) {
      console.error("[DB] registerUser error:", err.message);
      return { success: false, error: "Registration failed: " + err.message };
    }
  }

  // Memory store fallback
  const exists = Object.values(memoryStore.users).some(
    u => ((u.username && u.username.toLowerCase() === cleanUsername) || u.id === userId) && u.password_hash
  );
  if (exists) {
    return { success: false, error: "Astronaut callsign already registered. Please sign in or reset password." };
  }

  // Remove any uncredentialed guest entry
  for (const [k, u] of Object.entries(memoryStore.users)) {
    if (((u.username && u.username.toLowerCase() === cleanUsername) || u.id === userId) && !u.password_hash) {
      delete memoryStore.users[k];
    }
  }

  const newUser = {
    id: userId,
    username: cleanUsername,
    password_hash: passHash,
    callsign: cleanCallsign,
    flight_title: cleanTitle,
    suit_color: cleanColor,
    preferred_role: cleanTitle.toLowerCase(),
    games_played: 0,
    games_won: 0,
    tasks_completed: 0,
    eva_hours: 0.0,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  };

  memoryStore.users[userId] = newUser;
  saveLocalStore();

  const sanitized = { ...newUser };
  delete sanitized.password_hash;
  return { success: true, user: sanitized };
}

/**
 * Authenticates an astronaut with username & password.
 */
async function loginUser(username, password) {
  const cleanUsername = String(username || "").trim().toLowerCase();
  if (!cleanUsername || !password) {
    return { success: false, error: "Username and password are required." };
  }

  if (pool) {
    try {
      const res = await pool.query(
        "SELECT * FROM users WHERE (LOWER(username) = $1 OR id = $2) AND password_hash IS NOT NULL",
        [cleanUsername, `astro_${cleanUsername}`]
      );
      if (res.rows.length === 0) {
        // Check if there is an uncredentialed guest entry
        const guestRes = await pool.query("SELECT id FROM users WHERE LOWER(username) = $1 AND password_hash IS NULL", [cleanUsername]);
        if (guestRes.rows.length > 0) {
          return { success: false, error: "This callsign has no password set. Please use Reset Password or New Credential." };
        }
        return { success: false, error: "Astronaut flight credential not found." };
      }
      const user = res.rows[0];
      if (!verifyPassword(password, user.password_hash)) {
        return { success: false, error: "Invalid password for flight credential." };
      }

      await pool.query("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1", [user.id]);
      const sanitized = { ...user };
      delete sanitized.password_hash;
      return { success: true, user: sanitized };
    } catch (err) {
      console.error("[DB] loginUser error:", err.message);
      return { success: false, error: "Login failed: " + err.message };
    }
  }

  // Memory store fallback
  const user = Object.values(memoryStore.users).find(
    u => ((u.username && u.username.toLowerCase() === cleanUsername) || u.id === `astro_${cleanUsername}`) && u.password_hash
  );
  if (!user) {
    const isGuest = Object.values(memoryStore.users).some(u => u.username && u.username.toLowerCase() === cleanUsername);
    if (isGuest) {
      return { success: false, error: "This callsign has no password set. Please use Reset Password or New Credential." };
    }
    return { success: false, error: "Astronaut flight credential not found." };
  }
  if (!verifyPassword(password, user.password_hash)) {
    return { success: false, error: "Invalid password for flight credential." };
  }

  user.last_seen_at = new Date().toISOString();
  saveLocalStore();

  const sanitized = { ...user };
  delete sanitized.password_hash;
  return { success: true, user: sanitized };
}

/**
 * Resets or updates an astronaut credential's password.
 */
async function resetPassword(username, newPassword) {
  const cleanUsername = String(username || "").trim().toLowerCase();
  if (!cleanUsername || cleanUsername.length < 3) {
    return { success: false, error: "Username must be at least 3 characters." };
  }
  if (!newPassword || String(newPassword).length < 4) {
    return { success: false, error: "New password must be at least 4 characters." };
  }

  const passHash = hashPassword(newPassword);
  const userId = `astro_${cleanUsername}`;

  if (pool) {
    try {
      const res = await pool.query(
        "SELECT id, username, callsign, flight_title, suit_color, preferred_role FROM users WHERE LOWER(username) = $1 OR id = $2",
        [cleanUsername, userId]
      );

      if (res.rows.length === 0) {
        // Register newly with this password
        return await registerUser({ username: cleanUsername, password: newPassword, callsign: username });
      }

      const existingUser = res.rows[0];
      await pool.query(
        "UPDATE users SET password_hash = $1, last_seen_at = CURRENT_TIMESTAMP WHERE id = $2",
        [passHash, existingUser.id]
      );

      const updated = await pool.query(
        "SELECT id, username, callsign, flight_title, suit_color, preferred_role, games_played, games_won, tasks_completed, created_at, last_seen_at FROM users WHERE id = $1",
        [existingUser.id]
      );
      return { success: true, user: updated.rows[0], message: "Clearance password reset successfully!" };
    } catch (err) {
      console.error("[DB] resetPassword error:", err.message);
      return { success: false, error: "Password reset failed: " + err.message };
    }
  }

  // Memory store fallback
  let user = Object.values(memoryStore.users).find(
    u => (u.username && u.username.toLowerCase() === cleanUsername) || u.id === userId
  );
  if (!user) {
    return await registerUser({ username: cleanUsername, password: newPassword, callsign: username });
  }

  user.password_hash = passHash;
  user.last_seen_at = new Date().toISOString();
  saveLocalStore();

  const sanitized = { ...user };
  delete sanitized.password_hash;
  return { success: true, user: sanitized, message: "Clearance password reset successfully!" };
}

/**
 * Gets an astronaut profile by ID without sensitive fields.
 */
async function getUserById(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  if (pool) {
    try {
      const res = await pool.query("SELECT id, username, callsign, flight_title, suit_color, preferred_role, games_played, games_won, tasks_completed, created_at, last_seen_at FROM users WHERE id = $1", [uid]);
      return res.rows[0] || null;
    } catch (e) {
      console.error("[DB] getUserById error:", e.message);
    }
  }

  if (memoryStore.users[uid]) {
    const copy = { ...memoryStore.users[uid] };
    delete copy.password_hash;
    return copy;
  }
  return null;
}

// ============================================================================
// USER PROFILE & STATS OPERATIONS
// ============================================================================

/**
 * Gets or creates a persistent user profile by ID.
 */
async function getOrCreateUser(userId, defaultName = "Astronaut", defaultColor = "#ef4444", defaultRole = "commander") {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  if (pool) {
    try {
      const res = await pool.query(`
        INSERT INTO users (id, username, suit_color, preferred_role, last_seen_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE
        SET last_seen_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [uid, defaultName.slice(0, 32), defaultColor, defaultRole]);
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (e) {
      console.error("[DB] Error in getOrCreateUser:", e.message);
    }
  }

  // Local fallback
  if (!memoryStore.users[uid]) {
    memoryStore.users[uid] = {
      id: uid,
      username: defaultName.slice(0, 32),
      suit_color: defaultColor,
      preferred_role: defaultRole,
      games_played: 0,
      games_won: 0,
      tasks_completed: 0,
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    };
    saveLocalStore();
  } else {
    memoryStore.users[uid].last_seen_at = new Date().toISOString();
  }
  return memoryStore.users[uid];
}

/**
 * Updates user profile settings (nickname, color, role)
 */
async function updateUserProfile(userId, updates = {}) {
  const uid = String(userId || "").trim();
  if (!uid) return null;

  if (pool) {
    try {
      const fields = [];
      const values = [uid];
      let idx = 2;

      if (updates.username) {
        fields.push(`username = $${idx++}`);
        values.push(String(updates.username).slice(0, 32));
      }
      if (updates.callsign) {
        fields.push(`callsign = $${idx++}`);
        values.push(String(updates.callsign).slice(0, 32));
      }
      if (updates.flight_title) {
        fields.push(`flight_title = $${idx++}`);
        values.push(String(updates.flight_title).slice(0, 32));
      }
      if (updates.suit_color) {
        fields.push(`suit_color = $${idx++}`);
        values.push(updates.suit_color);
      }
      if (updates.preferred_role) {
        fields.push(`preferred_role = $${idx++}`);
        values.push(updates.preferred_role);
      }
      fields.push(`last_seen_at = CURRENT_TIMESTAMP`);

      if (fields.length > 1) {
        const query = `UPDATE users SET ${fields.join(", ")} WHERE id = $1 RETURNING *`;
        const res = await pool.query(query, values);
        return res.rows[0] || null;
      }
    } catch (e) {
      console.error("[DB] Error in updateUserProfile:", e.message);
    }
  }

  // Local fallback
  if (memoryStore.users[uid]) {
    if (updates.username) memoryStore.users[uid].username = String(updates.username).slice(0, 32);
    if (updates.callsign) memoryStore.users[uid].callsign = String(updates.callsign).slice(0, 32);
    if (updates.flight_title) memoryStore.users[uid].flight_title = String(updates.flight_title).slice(0, 32);
    if (updates.suit_color) memoryStore.users[uid].suit_color = updates.suit_color;
    if (updates.preferred_role) memoryStore.users[uid].preferred_role = updates.preferred_role;
    memoryStore.users[uid].last_seen_at = new Date().toISOString();
    saveLocalStore();
    const clean = { ...memoryStore.users[uid] };
    delete clean.password_hash;
    return clean;
  }
  return null;
}

/**
 * Increments user statistics (games played, victories, tasks completed).
 */
async function incrementUserStats(userId, { gamesPlayed = 0, gamesWon = 0, tasksCompleted = 0 }) {
  const uid = String(userId || "").trim();
  if (!uid) return;

  if (pool) {
    try {
      await pool.query(`
        UPDATE users
        SET games_played = games_played + $2,
            games_won = games_won + $3,
            tasks_completed = tasks_completed + $4,
            last_seen_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [uid, gamesPlayed, gamesWon, tasksCompleted]);
    } catch (e) {
      console.error("[DB] Error in incrementUserStats:", e.message);
    }
    return;
  }

  // Local fallback
  if (memoryStore.users[uid]) {
    memoryStore.users[uid].games_played = (memoryStore.users[uid].games_played || 0) + gamesPlayed;
    memoryStore.users[uid].games_won = (memoryStore.users[uid].games_won || 0) + gamesWon;
    memoryStore.users[uid].tasks_completed = (memoryStore.users[uid].tasks_completed || 0) + tasksCompleted;
    memoryStore.users[uid].last_seen_at = new Date().toISOString();
    saveLocalStore();
  }
}

/**
 * Retrieves leaderboard of top astronauts.
 */
async function getTopAstronauts(limit = 10) {
  if (pool) {
    try {
      const res = await pool.query(`
        SELECT id, username, suit_color, preferred_role, games_played, games_won, tasks_completed, last_seen_at
        FROM users
        ORDER BY games_won DESC, tasks_completed DESC
        LIMIT $1
      `, [limit]);
      return res.rows;
    } catch (e) {
      console.error("[DB] Error in getTopAstronauts:", e.message);
    }
  }

  // Local fallback
  return Object.values(memoryStore.users)
    .sort((a, b) => (b.games_won || 0) - (a.games_won || 0) || (b.tasks_completed || 0) - (a.tasks_completed || 0))
    .slice(0, limit);
}

// ============================================================================
// ROOM & GAME SESSION STATE OPERATIONS
// ============================================================================

/**
 * Creates or updates a game room record.
 */
async function upsertGameRoom(roomId, hostId, status = "lobby", totalTasks = 9, isPublic = true) {
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO game_rooms (room_id, host_id, status, total_tasks, is_public, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (room_id) DO UPDATE SET
          host_id = EXCLUDED.host_id,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP
      `, [roomId, hostId, status, totalTasks, isPublic]);
    } catch (e) {
      console.error("[DB] Error in upsertGameRoom:", e.message);
    }
    return;
  }

  memoryStore.game_rooms[roomId] = {
    room_id: roomId,
    host_id: hostId,
    status: status,
    total_tasks: totalTasks,
    completed_tasks: memoryStore.game_rooms[roomId]?.completed_tasks || 0,
    is_public: isPublic,
    updated_at: new Date().toISOString()
  };
  saveLocalStore();
}

/**
 * Upserts a player member in a room.
 */
async function upsertRoomMember(roomId, userId, socketId, player) {
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO room_members (
          room_id, user_id, socket_id, player_name, suit_color, role,
          is_host, is_ready, pos_x, pos_y, pos_z, yaw, tasks_done, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        ON CONFLICT (room_id, user_id) DO UPDATE SET
          socket_id = EXCLUDED.socket_id,
          player_name = EXCLUDED.player_name,
          suit_color = EXCLUDED.suit_color,
          role = EXCLUDED.role,
          is_host = EXCLUDED.is_host,
          is_ready = EXCLUDED.is_ready,
          pos_x = EXCLUDED.pos_x,
          pos_y = EXCLUDED.pos_y,
          pos_z = EXCLUDED.pos_z,
          yaw = EXCLUDED.yaw,
          tasks_done = EXCLUDED.tasks_done,
          updated_at = CURRENT_TIMESTAMP
      `, [
        roomId,
        userId,
        socketId,
        player.name,
        player.color,
        player.role,
        !!player.isHost,
        !!player.ready,
        player.pos?.[0] || 0.0,
        player.pos?.[1] || 0.15,
        player.pos?.[2] || -9.0,
        player.yaw || 0.0,
        player.tasksDone || 0
      ]);
    } catch (e) {
      console.error("[DB] Error in upsertRoomMember:", e.message);
    }
    return;
  }

  const key = `${roomId}_${userId}`;
  memoryStore.room_members[key] = {
    room_id: roomId,
    user_id: userId,
    socket_id: socketId,
    player_name: player.name,
    suit_color: player.color,
    role: player.role,
    is_host: !!player.isHost,
    is_ready: !!player.ready,
    pos_x: player.pos?.[0] || 0.0,
    pos_y: player.pos?.[1] || 0.15,
    pos_z: player.pos?.[2] || -9.0,
    yaw: player.yaw || 0.0,
    tasks_done: player.tasksDone || 0,
    updated_at: new Date().toISOString()
  };
  saveLocalStore();
}

/**
 * Removes a member from a room.
 */
async function removeRoomMember(roomId, userId) {
  if (pool) {
    try {
      await pool.query("DELETE FROM room_members WHERE room_id = $1 AND user_id = $2", [roomId, userId]);
    } catch (e) {
      console.error("[DB] Error in removeRoomMember:", e.message);
    }
    return;
  }

  const key = `${roomId}_${userId}`;
  delete memoryStore.room_members[key];
  saveLocalStore();
}

/**
 * Records or updates a task state in a room.
 */
async function recordRoomTaskCompletion(roomId, taskId, taskName, userId, userName) {
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO room_task_states (room_id, task_id, task_name, completed, completed_by_user_id, completed_by_name, completed_at)
        VALUES ($1, $2, $3, TRUE, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (room_id, task_id) DO UPDATE SET
          completed = TRUE,
          completed_by_user_id = EXCLUDED.completed_by_user_id,
          completed_by_name = EXCLUDED.completed_by_name,
          completed_at = CURRENT_TIMESTAMP
      `, [roomId, taskId, taskName, userId, userName]);

      await pool.query(`
        UPDATE game_rooms
        SET completed_tasks = (
          SELECT COUNT(*) FROM room_task_states WHERE room_id = $1 AND completed = TRUE
        ),
        updated_at = CURRENT_TIMESTAMP
        WHERE room_id = $1
      `, [roomId]);
    } catch (e) {
      console.error("[DB] Error in recordRoomTaskCompletion:", e.message);
    }
    return;
  }

  const key = `${roomId}_${taskId}`;
  memoryStore.room_task_states[key] = {
    room_id: roomId,
    task_id: taskId,
    task_name: taskName,
    completed: true,
    completed_by_user_id: userId,
    completed_by_name: userName,
    completed_at: new Date().toISOString()
  };

  if (memoryStore.game_rooms[roomId]) {
    const completedCount = Object.values(memoryStore.room_task_states).filter(t => t.room_id === roomId && t.completed).length;
    memoryStore.game_rooms[roomId].completed_tasks = completedCount;
  }
  saveLocalStore();
}

/**
 * Logs a chat message.
 */
async function logChatMessage(roomId, sender, color, role, message) {
  if (pool) {
    try {
      await pool.query(`
        INSERT INTO game_chat_logs (room_id, sender, color, role, message)
        VALUES ($1, $2, $3, $4, $5)
      `, [roomId, sender, color, role, message]);
    } catch (e) {
      console.error("[DB] Error in logChatMessage:", e.message);
    }
    return;
  }

  memoryStore.game_chat_logs.push({
    room_id: roomId,
    sender,
    color,
    role,
    message,
    created_at: new Date().toISOString()
  });
  if (memoryStore.game_chat_logs.length > 500) memoryStore.game_chat_logs.shift();
  saveLocalStore();
}

/**
 * Gets active rooms with player count and metadata.
 */
async function getActiveRoomsList() {
  if (pool) {
    try {
      const res = await pool.query(`
        SELECT r.room_id, r.status, r.total_tasks, r.completed_tasks, r.created_at,
               COUNT(m.user_id) AS player_count
        FROM game_rooms r
        LEFT JOIN room_members m ON r.room_id = m.room_id
        WHERE r.status != 'finished'
        GROUP BY r.room_id, r.status, r.total_tasks, r.completed_tasks, r.created_at
        ORDER BY r.created_at DESC
        LIMIT 20
      `);
      return res.rows;
    } catch (e) {
      console.error("[DB] Error in getActiveRoomsList:", e.message);
    }
  }

  // Local fallback
  return Object.values(memoryStore.game_rooms).map(r => {
    const count = Object.values(memoryStore.room_members).filter(m => m.room_id === r.room_id).length;
    return {
      ...r,
      player_count: count
    };
  });
}

module.exports = {
  initDatabase,
  registerUser,
  loginUser,
  resetPassword,
  hashPassword,
  getUserById,
  getOrCreateUser,
  updateUserProfile,
  incrementUserStats,
  getTopAstronauts,
  upsertGameRoom,
  upsertRoomMember,
  removeRoomMember,
  recordRoomTaskCompletion,
  logChatMessage,
  getActiveRoomsList
};
