const fs = require("fs");
const path = require("path");

const DEFAULT_LINUX_GMAT_CONSOLE = "/opt/GMAT/R2026a/bin/GmatConsole";
const DEFAULT_WIN32_GMAT_CONSOLE = "E:\\gmat-R2026a-local\\bin\\GmatConsole.exe";

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Resolve the local GmatConsole executable path for the current platform.
 */
function findGmatExecutable() {
  const configured = String(process.env.GMAT_CONSOLE_PATH || "").trim();
  const candidates = [];
  if (configured) {
    candidates.push(configured);
  }
  if (process.platform === "win32") {
    candidates.push(DEFAULT_WIN32_GMAT_CONSOLE);
  } else {
    candidates.push(DEFAULT_LINUX_GMAT_CONSOLE);
  }

  for (const candidate of candidates) {
    if (candidate && path.isAbsolute(candidate) && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Build child-process environment variables so GmatConsole resolves bundled shared libraries.
 *
 * Only a small allow-list of non-sensitive variables is inherited. The GMAT
 * binary must never receive database credentials, object-storage keys or session
 * secrets just because the parent process has them.
 */
function buildGmatChildEnv(exePath) {
  const allowed = [
    "PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "USER", "LOGNAME",
    "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"
  ];
  const env = {};
  for (const key of allowed) {
    if (process.env[key] != null) env[key] = process.env[key];
  }
  if (!exePath || process.platform === "win32") {
    return env;
  }

  const binDir = path.dirname(exePath);
  const libDir = path.resolve(binDir, "..", "lib");
  const extraDirs = [libDir, binDir].filter((dir) => fs.existsSync(dir));
  const current = String(env.LD_LIBRARY_PATH || "")
    .split(":")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const merged = [];
  for (const dir of [...extraDirs, ...current]) {
    if (dir && !merged.includes(dir)) {
      merged.push(dir);
    }
  }
  if (merged.length > 0) {
    env.LD_LIBRARY_PATH = merged.join(":");
  }
  return env;
}

/**
 * Create an isolated FIFO execution queue for GmatConsole jobs.
 */
function createGmatQueue(options = {}) {
  const maxConcurrent = readPositiveInt(
    options.maxConcurrent ?? process.env.GMAT_MAX_CONCURRENT,
    1
  );
  const maxQueue = readPositiveInt(
    options.maxQueue ?? process.env.GMAT_MAX_QUEUE,
    20
  );
  const defaultQueueTimeoutMs = readPositiveInt(
    options.queueTimeoutMs ?? process.env.GMAT_QUEUE_TIMEOUT_MS,
    45000
  );

  let active = 0;
  let completedCount = 0;
  let failedCount = 0;
  let cancelledCount = 0;
  const pending = [];

  function makeCancelledError(message = "GMAT request cancelled because the room state changed.") {
    const err = new Error(message);
    err.code = "GMAT_CANCELLED";
    return err;
  }

  function pump() {
    while (active < maxConcurrent && pending.length > 0) {
      const item = pending.shift();
      if (!item) continue;

      if (item.timer) {
        clearTimeout(item.timer);
        item.timer = null;
      }

      if (typeof item.shouldRun === "function") {
        let keepGoing = true;
        try {
          keepGoing = item.shouldRun() !== false;
        } catch (err) {
          keepGoing = false;
        }
        if (!keepGoing) {
          cancelledCount += 1;
          item.reject(makeCancelledError());
          continue;
        }
      }

      active += 1;
      const waitMs = Math.max(0, Date.now() - item.enqueuedAt);
      Promise.resolve()
        .then(() => item.taskFn({ waitMs, label: item.label }))
        .then(
          (result) => {
            completedCount += 1;
            item.resolve(result);
          },
          (err) => {
            failedCount += 1;
            item.reject(err);
          }
        )
        .finally(() => {
          active = Math.max(0, active - 1);
          pump();
        });
    }
  }

  function enqueue(taskFn, opts = {}) {
    if (typeof taskFn !== "function") {
      return Promise.reject(new TypeError("GMAT queue requires a task function."));
    }

    if (typeof opts.shouldRun === "function" && opts.shouldRun() === false) {
      cancelledCount += 1;
      return Promise.reject(makeCancelledError());
    }

    if (active >= maxConcurrent && pending.length >= maxQueue) {
      const err = new Error("GMAT calculation queue is full. Please retry shortly.");
      err.code = "GMAT_QUEUE_FULL";
      return Promise.reject(err);
    }

    const queueTimeoutMs = readPositiveInt(opts.queueTimeoutMs, defaultQueueTimeoutMs);
    return new Promise((resolve, reject) => {
      const item = {
        taskFn,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        label: opts.label || "gmat",
        shouldRun: opts.shouldRun || null,
        timer: null,
      };

      item.timer = setTimeout(() => {
        const index = pending.indexOf(item);
        if (index !== -1) {
          pending.splice(index, 1);
          const err = new Error("GMAT queue wait timed out. Please try again.");
          err.code = "GMAT_QUEUE_TIMEOUT";
          reject(err);
        }
      }, queueTimeoutMs);
      if (typeof item.timer.unref === "function") {
        item.timer.unref();
      }

      pending.push(item);
      pump();
    });
  }

  function getStatus() {
    const executable = findGmatExecutable();
    return {
      available: !!executable,
      executable,
      busy: active > 0,
      active,
      queued: pending.length,
      maxConcurrent,
      maxQueue,
      completedCount,
      failedCount,
      cancelledCount,
    };
  }

  return {
    enqueue,
    getStatus,
    maxConcurrent,
    maxQueue,
    defaultQueueTimeoutMs,
  };
}

const defaultQueue = createGmatQueue();

module.exports = {
  DEFAULT_LINUX_GMAT_CONSOLE,
  DEFAULT_WIN32_GMAT_CONSOLE,
  findGmatExecutable,
  buildGmatChildEnv,
  createGmatQueue,
  enqueue: defaultQueue.enqueue,
  getStatus: defaultQueue.getStatus,
};
