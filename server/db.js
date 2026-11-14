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
function scryptAsync(password, salt, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), String(salt), keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  try {
    const [salt, key] = stored.split(":");
    const keyBuffer = Buffer.from(key, "hex");
    if (!salt || keyBuffer.length !== 64) return false;
    const derivedKey = await scryptAsync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (e) {
    return false;
  }
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function sanitizeUser(user) {
  if (!user || typeof user !== "object") return null;
  const copy = { ...user };
  delete copy.password_hash;
  delete copy.session_token_hash;
  delete copy.session_expires_at;
  if (copy.preferred_role || copy.flight_title) {
    copy.preferred_role = normalizeRoleId(copy.preferred_role || copy.flight_title, "commander");
  } else {
    copy.preferred_role = "commander";
  }
  return copy;
}

function sanitizeProfileText(value, maxLength = 32) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F<>]/g, "")
    .trim()
    .slice(0, maxLength);
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function issueSessionToken(userId) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  if (pool) {
    try {
      await pool.query(
        "UPDATE users SET session_token_hash = $1, session_expires_at = $2 WHERE id = $3",
        [tokenHash, expiresAt, userId]
      );
    } catch (e) {
      console.error("[DB] Error issuing session token:", e.message);
      return null;
    }
  } else if (memoryStore.users[userId]) {
    memoryStore.users[userId].session_token_hash = tokenHash;
    memoryStore.users[userId].session_expires_at = expiresAt.toISOString();
    saveLocalStore();
  } else {
    return null;
  }

  return { token, expiresAt: expiresAt.toISOString() };
}

async function resolveSessionUser(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const tokenHash = hashSessionToken(raw);

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, username, callsign, flight_title, suit_color, preferred_role,
                games_played, games_won, tasks_completed, created_at, last_seen_at
         FROM users
         WHERE session_token_hash = $1 AND session_expires_at > CURRENT_TIMESTAMP`,
        [tokenHash]
      );
      return res.rows[0] || null;
    } catch (e) {
      console.error("[DB] Error resolving session:", e.message);
      return null;
    }
  }

  const user = Object.values(memoryStore.users).find((u) => {
    if (!u.session_token_hash || u.session_token_hash !== tokenHash) return false;
    const expires = Date.parse(u.session_expires_at || 0);
    return Number.isFinite(expires) && expires > Date.now();
  });
  return user ? sanitizeUser(user) : null;
}

async function revokeSessionToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return;
  const tokenHash = hashSessionToken(raw);

  if (pool) {
    try {
      await pool.query("UPDATE users SET session_token_hash = NULL, session_expires_at = NULL WHERE session_token_hash = $1", [tokenHash]);
    } catch (e) {
      console.error("[DB] Error revoking session:", e.message);
    }
    return;
  }

  for (const user of Object.values(memoryStore.users)) {
    if (user.session_token_hash === tokenHash) {
      delete user.session_token_hash;
      delete user.session_expires_at;
    }
  }
  saveLocalStore();
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
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true, mode: 0o700 });
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
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true, mode: 0o700 });
    }
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(memoryStore, null, 2), { encoding: "utf8", mode: 0o600 });
    try {
      fs.chmodSync(LOCAL_DB_FILE, 0o600);
    } catch (e) {}
  } catch (err) {
    console.error("[DB] Failed to save local DB:", err.message);
  }
}

// Initialize Database connection and schema
async function initDatabase() {
  if (isPostgres) {
    try {
      const { Pool } = require("pg");
      const localDb = process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1");
      const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === "false" ? false : true;
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: localDb ? false : { rejectUnauthorized }
      });

      console.log("[DB] Connecting to PostgreSQL...");
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
          session_token_hash VARCHAR(128),
          session_expires_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Safe schema migrations for existing installations
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS callsign VARCHAR(64);`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS flight_title VARCHAR(64) DEFAULT 'Commander';`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS eva_hours FLOAT DEFAULT 0.0;`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_token_hash VARCHAR(128);`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMP WITH TIME ZONE;`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_users_session_token_hash ON users(session_token_hash);`);

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
  const cleanUsername = String(username || "").trim().toLowerCase().replace(/[\u0000-\u001F\u007F<>]/g, "");
  const cleanCallsign = String(callsign || username || "").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 24) || cleanUsername;
  const cleanTitle = String(flightTitle || "Commander").replace(/[\u0000-\u001F\u007F<>]/g, "").trim().slice(0, 32) || "Commander";
  const normalizedRole = normalizeRoleId(cleanTitle, "commander");
  const cleanColor = /^#[0-9a-fA-F]{6}$/.test(String(suitColor || "")) ? String(suitColor) : "#ef4444";

  if (!cleanUsername || cleanUsername.length < 3) {
    return { success: false, error: "Username must be at least 3 characters." };
  }
  if (!password || String(password).length < 8) {
    return { success: false, error: "Password must be at least 8 characters." };
  }

  const passHash = await hashPassword(password);
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
        ON CONFLICT (id) DO NOTHING
        RETURNING id, username, callsign, flight_title, suit_color, preferred_role, games_played, games_won, tasks_completed, created_at, last_seen_at
      `, [userId, cleanUsername, passHash, cleanCallsign, cleanTitle, cleanColor, normalizedRole]);

      if (!res.rows[0]) {
        return { success: false, error: "Astronaut callsign already registered. Please sign in." };
      }
      return { success: true, user: sanitizeUser(res.rows[0]) };
    } catch (err) {
      console.error("[DB] registerUser error:", err.message);
      return { success: false, error: "Registration failed" };
    }
  }

  // Memory store fallback
  const exists = Object.values(memoryStore.users).some(
    u => ((u.username && u.username.toLowerCase() === cleanUsername) || u.id === userId) && u.password_hash
  );
  if (exists) {
    return { success: false, error: "Astronaut callsign already registered. Please sign in." };
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
    preferred_role: normalizedRole,
    games_played: 0,
    games_won: 0,
    tasks_completed: 0,
    eva_hours: 0.0,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString()
  };

  memoryStore.users[userId] = newUser;
  saveLocalStore();

  return { success: true, user: sanitizeUser(newUser) };
}

/**
 * Authenticates an astronaut with username & password.
 */
async function loginUser(username, password) {
  const cleanUsername = String(username || "").trim().toLowerCase().replace(/[\u0000-\u001F\u007F<>]/g, "");
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
        return { success: false, error: "Invalid username or password." };
      }
      const user = res.rows[0];
      if (!(await verifyPassword(password, user.password_hash))) {
        return { success: false, error: "Invalid username or password." };
      }

      await pool.query("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = $1", [user.id]);
      const sanitized = { ...user };
      delete sanitized.password_hash;
      return { success: true, user: sanitized };
    } catch (err) {
      console.error("[DB] loginUser error:", err.message);
      return { success: false, error: "Login failed" };
    }
  }

  // Memory store fallback
  const user = Object.values(memoryStore.users).find(
    u => ((u.username && u.username.toLowerCase() === cleanUsername) || u.id === `astro_${cleanUsername}`) && u.password_hash
  );
  if (!user) {
    return { success: false, error: "Invalid username or password." };
  }
  if (!(await verifyPassword(password, user.password_hash))) {
    return { success: false, error: "Invalid username or password." };
  }

  user.last_seen_at = new Date().toISOString();
  saveLocalStore();

  const sanitized = { ...user };
  delete sanitized.password_hash;
  return { success: true, user: sanitized };
}

/**
 * Changes an astronaut credential's password.
 * Requires the current password for existing credentialed accounts.
 */
async function resetPassword(username, currentPassword, newPassword) {
  const cleanUsername = String(username || "").trim().toLowerCase().replace(/[\u0000-\u001F\u007F<>]/g, "");
  if (!cleanUsername || cleanUsername.length < 3) {
    return { success: false, error: "Username must be at least 3 characters." };
  }
  if (!newPassword || String(newPassword).length < 8) {
    return { success: false, error: "New password must be at least 8 characters." };
  }
  if (!currentPassword || String(currentPassword).length < 1) {
    return { success: false, error: "Current password is required." };
  }

  const passHash = await hashPassword(newPassword);
  const userId = `astro_${cleanUsername}`;

  if (pool) {
    try {
      const res = await pool.query(
        "SELECT id, username, callsign, flight_title, suit_color, preferred_role, password_hash FROM users WHERE (LOWER(username) = $1 OR id = $2) AND password_hash IS NOT NULL",
        [cleanUsername, userId]
      );

      if (res.rows.length === 0) {
        return { success: false, error: "Unable to reset password for this credential." };
      }

      const existingUser = res.rows[0];
      if (!(await verifyPassword(currentPassword, existingUser.password_hash))) {
        return { success: false, error: "Invalid username or password." };
      }

      await pool.query(
        "UPDATE users SET password_hash = $1, last_seen_at = CURRENT_TIMESTAMP WHERE id = $2",
        [passHash, existingUser.id]
      );

      const updated = await pool.query(
        "SELECT id, username, callsign, flight_title, suit_color, preferred_role, games_played, games_won, tasks_completed, created_at, last_seen_at FROM users WHERE id = $1",
        [existingUser.id]
      );
      return { success: true, user: sanitizeUser(updated.rows[0]), message: "Password updated successfully." };
    } catch (err) {
      console.error("[DB] resetPassword error:", err.message);
      return { success: false, error: "Password reset failed" };
    }
  }

  // Memory store fallback
  const user = Object.values(memoryStore.users).find(
    u => ((u.username && u.username.toLowerCase() === cleanUsername) || u.id === userId) && u.password_hash
  );
  if (!user) {
    return { success: false, error: "Unable to reset password for this credential." };
  }
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    return { success: false, error: "Invalid username or password." };
  }

  user.password_hash = passHash;
  user.last_seen_at = new Date().toISOString();
  saveLocalStore();

  return { success: true, user: sanitizeUser(user), message: "Password updated successfully." };
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
      return sanitizeUser(res.rows[0] || null);
    } catch (e) {
      console.error("[DB] getUserById error:", e.message);
    }
  }

  if (memoryStore.users[uid]) {
    return sanitizeUser(memoryStore.users[uid]);
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
  const safeName = sanitizeProfileText(defaultName, 32) || "Astronaut";
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(String(defaultColor || "")) ? String(defaultColor) : "#ef4444";
  const safeRole = normalizeRoleId(defaultRole, "commander");

  if (pool) {
    try {
      const res = await pool.query(`
        INSERT INTO users (id, username, suit_color, preferred_role, last_seen_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE
        SET last_seen_at = CURRENT_TIMESTAMP
        RETURNING id, username, callsign, flight_title, suit_color, preferred_role,
                  games_played, games_won, tasks_completed, created_at, last_seen_at
      `, [uid, safeName, safeColor, safeRole]);
      if (res.rows.length > 0) {
        return sanitizeUser(res.rows[0]);
      }
    } catch (e) {
      console.error("[DB] Error in getOrCreateUser:", e.message);
    }
  }

  // Local fallback
  if (!memoryStore.users[uid]) {
    memoryStore.users[uid] = {
      id: uid,
      username: safeName,
      suit_color: safeColor,
      preferred_role: safeRole,
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
  return sanitizeUser(memoryStore.users[uid]);
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
        const nextUsername = sanitizeProfileText(updates.username, 32).toLowerCase();
        if (nextUsername) {
          const conflict = await pool.query(
            "SELECT id FROM users WHERE LOWER(username) = $1 AND id <> $2",
            [nextUsername, uid]
          );
          if (conflict.rows.length === 0) {
            fields.push(`username = $${idx++}`);
            values.push(nextUsername);
          }
        }
      }
      if (updates.callsign) {
        fields.push(`callsign = $${idx++}`);
        values.push(sanitizeProfileText(updates.callsign, 32));
      }
      if (updates.flight_title) {
        fields.push(`flight_title = $${idx++}`);
        values.push(sanitizeProfileText(updates.flight_title, 32));
      }
      if (updates.suit_color) {
        fields.push(`suit_color = $${idx++}`);
        values.push(/^#[0-9a-fA-F]{6}$/.test(String(updates.suit_color)) ? String(updates.suit_color) : "#ef4444");
      }
      if (updates.preferred_role) {
        fields.push(`preferred_role = $${idx++}`);
        values.push(normalizeRoleId(updates.preferred_role, "commander"));
      } else if (updates.flight_title) {
        fields.push(`preferred_role = $${idx++}`);
        values.push(normalizeRoleId(updates.flight_title, "commander"));
      }
      fields.push(`last_seen_at = CURRENT_TIMESTAMP`);

      if (fields.length > 1) {
        const query = `UPDATE users SET ${fields.join(", ")} WHERE id = $1 RETURNING id, username, callsign, flight_title, suit_color, preferred_role, games_played, games_won, tasks_completed, created_at, last_seen_at`;
        const res = await pool.query(query, values);
        return sanitizeUser(res.rows[0]);
      }
    } catch (e) {
      console.error("[DB] Error in updateUserProfile:", e.message);
    }
  }

  // Local fallback
  if (memoryStore.users[uid]) {
    if (updates.username) {
      const nextUsername = sanitizeProfileText(updates.username, 32).toLowerCase();
      const conflict = Object.values(memoryStore.users).some(
        (user) => user.id !== uid && user.username && user.username.toLowerCase() === nextUsername
      );
      if (nextUsername && !conflict) memoryStore.users[uid].username = nextUsername;
    }
    if (updates.callsign) memoryStore.users[uid].callsign = sanitizeProfileText(updates.callsign, 32);
    if (updates.flight_title) memoryStore.users[uid].flight_title = sanitizeProfileText(updates.flight_title, 32);
    if (updates.suit_color) memoryStore.users[uid].suit_color = /^#[0-9a-fA-F]{6}$/.test(String(updates.suit_color)) ? String(updates.suit_color) : "#ef4444";
    if (updates.preferred_role) memoryStore.users[uid].preferred_role = normalizeRoleId(updates.preferred_role, "commander");
    else if (updates.flight_title) memoryStore.users[uid].preferred_role = normalizeRoleId(updates.flight_title, "commander");
    memoryStore.users[uid].last_seen_at = new Date().toISOString();
    saveLocalStore();
    return sanitizeUser(memoryStore.users[uid]);
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
    .map((user) => sanitizeUser(user))
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
          AND r.is_public = TRUE
          AND r.updated_at > NOW() - INTERVAL '30 minutes'
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
  return Object.values(memoryStore.game_rooms)
    .filter((r) => r.is_public !== false)
    .map(r => {
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
  issueSessionToken,
  resolveSessionUser,
  revokeSessionToken,
  sanitizeUser,
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
