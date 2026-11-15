/*
 * coverage_data.js — real-satellite data for the CubeSat Contact Coverage mission.
 *
 *   GET /api/coverage/gp/:catnr        CelesTrak GP record (OMM JSON) for one catalog number
 *   GET /api/coverage/search?name=..   CelesTrak name search (catalog numbers + names)
 *   GET /api/coverage/stations         SatNOGS station catalog (reduced fields)
 *
 * CelesTrak usage rules built in (checked 2026-11-14, celestrak.org/NORAD/documentation/gp-data-formats.php):
 * data changes at most every 2 hours, repeat downloads inside that window are refused, more than
 * 50 error responses in 2 hours gets an address firewalled, and on 403/404/5xx a client must stop rather
 * than retry. So: every result is cached ≥ 2 h, an error puts that key on a 2 h cooldown with no retry,
 * a process-wide budget stops ALL live fetches after 20 errors in 2 h, and only celestrak.org is used.
 * SatNOGS (CC BY-SA 4.0) is fetched at most once per 24 h. Set COVERAGE_OFFLINE=1 to disable live fetches.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const C = require("../public/js/coverage/coverage_core.js");

const ROOT = process.env.COVERAGE_CACHE_DIR || path.join(__dirname, ".data", "coverage");
const BUNDLED_STATIONS = path.join(__dirname, "..", "public", "data", "coverage", "satnogs_stations_snapshot.json");
const GP_TTL = 2 * 3600e3, SEARCH_TTL = 2 * 3600e3, ST_TTL = 24 * 3600e3, COOLDOWN = 2 * 3600e3;
const BUDGET = { max: 20, windowMs: 2 * 3600e3, errors: [] };
const cooldown = new Map();      // key -> until (ms)
const inflight = new Map();      // key -> Promise (one upstream request per key at a time)
const UA = "Interfellas-coverage/1.0 (educational game; geometric visibility only)";

const offline = () => process.env.COVERAGE_OFFLINE === "1";
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const ensureDir = (d) => { try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* read-only disk: cache stays in memory */ } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
const writeJson = (f, o) => { try { ensureDir(path.dirname(f)); fs.writeFileSync(f, JSON.stringify(o)); } catch (e) { /* ignore */ } };
const memCache = new Map();
function cacheGet(file) { if (memCache.has(file)) return memCache.get(file); const v = readJson(file); if (v) memCache.set(file, v); return v; }
function cachePut(file, v) { memCache.set(file, v); writeJson(file, v); }

function budgetLeft(now) { BUDGET.errors = BUDGET.errors.filter((t) => now - t < BUDGET.windowMs); return BUDGET.max - BUDGET.errors.length; }
function noteError(key, now) { BUDGET.errors.push(now); cooldown.set(key, now + COOLDOWN); }
function blocked(key, now) {
  if (offline()) return "live data disabled (offline mode)";
  if (budgetLeft(now) <= 0) return "live data paused after repeated errors (protects the data provider's limits)";
  const until = cooldown.get(key); if (until && until > now) return `previous request failed; next attempt allowed after ${new Date(until).toISOString().slice(11, 16)}Z`;
  return null;
}
async function fetchText(url, timeoutMs) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs || 20000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ac.signal, redirect: "manual" });
    const text = await r.text();
    return { status: r.status, text, link: r.headers.get("link") };
  } finally { clearTimeout(timer); }
}
function once(key, fn) { if (inflight.has(key)) return inflight.get(key); const p = fn().finally(() => inflight.delete(key)); inflight.set(key, p); return p; }

// ------------------------------------------------------------------ CelesTrak GP
async function getGp(catnr) {
  const key = "gp:" + catnr, file = path.join(ROOT, "gp", catnr + ".json"), now = Date.now();
  const cached = cacheGet(file);
  if (cached && now - Date.parse(cached.fetchedAt) < GP_TTL) return { ...cached, from: "cache" };
  const why = blocked(key, now);
  if (why) return cached ? { ...cached, from: "cache", stale: true, error: why } : { error: why, status: 503 };
  return once(key, async () => {
    const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=JSON`;
    let res;
    try { res = await fetchText(url); } catch (e) { noteError(key, Date.now()); return cached ? { ...cached, from: "cache", stale: true, error: "network error" } : { error: "Could not reach CelesTrak", status: 502 }; }
    if (res.status !== 200) { noteError(key, Date.now()); const msg = res.status === 403 ? "CelesTrak refused the request (403: data unchanged since the last download, or blocked)" : `CelesTrak returned HTTP ${res.status}`; return cached ? { ...cached, from: "cache", stale: true, error: msg } : { error: msg, status: res.status === 404 ? 404 : 502 }; }
    let arr = null; try { arr = JSON.parse(res.text); } catch (e) { arr = null; }
    if (!Array.isArray(arr) || !arr.length) { noteError(key, Date.now()); return { error: `No published elements for catalog number ${catnr}`, status: 404 }; }
    const omm = arr[0], v = C.validateOmm(omm);
    if (!v.ok) { noteError(key, Date.now()); return { error: "Invalid orbital elements from the source: " + v.errors[0], status: 502 }; }
    const rec = { omm, fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), sourceUrl: url, sha256: sha256(JSON.stringify(omm)) };
    cachePut(file, rec);
    return { ...rec, from: "live" };
  });
}
async function searchName(term) {
  const k = term.toLowerCase(), key = "search:" + k, file = path.join(ROOT, "search", k.replace(/[^a-z0-9]+/g, "_") + ".json"), now = Date.now();
  const cached = cacheGet(file);
  if (cached && now - Date.parse(cached.fetchedAt) < SEARCH_TTL) return { ...cached, from: "cache" };
  const why = blocked(key, now);
  if (why) return cached ? { ...cached, from: "cache", stale: true, error: why } : { error: why, status: 503 };
  return once(key, async () => {
    const url = `https://celestrak.org/NORAD/elements/gp.php?NAME=${encodeURIComponent(term)}&FORMAT=JSON`;
    let res;
    try { res = await fetchText(url); } catch (e) { noteError(key, Date.now()); return { error: "Could not reach CelesTrak", status: 502 }; }
    if (res.status !== 200) { noteError(key, Date.now()); return { error: `CelesTrak returned HTTP ${res.status}`, status: 502 }; }
    let arr = null; try { arr = JSON.parse(res.text); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    const results = arr.filter((o) => C.validateOmm(o).ok).slice(0, 25).map((o) => ({ catnr: String(o.NORAD_CAT_ID), name: o.OBJECT_NAME, epoch: o.EPOCH }));
    // the same response holds full records: cache them as GP records too (avoids a second download)
    for (const o of arr.slice(0, 25)) if (C.validateOmm(o).ok) cachePut(path.join(ROOT, "gp", String(o.NORAD_CAT_ID) + ".json"), { omm: o, fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), sourceUrl: url, sha256: sha256(JSON.stringify(o)) });
    const rec = { results, fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") };
    cachePut(file, rec);
    return { ...rec, from: "live" };
  });
}

// ------------------------------------------------------------------ SatNOGS stations
function reduceStations(list) {
  return list.filter((s) => s && typeof s.lat === "number" && typeof s.lng === "number" && isFinite(s.lat) && isFinite(s.lng))
    .map((s) => ({ id: s.id, name: String(s.name || "").slice(0, 60), lat: s.lat, lng: s.lng, altitude: typeof s.altitude === "number" ? s.altitude : 0,
                   min_horizon: typeof s.min_horizon === "number" ? s.min_horizon : null, status: s.status || "", last_seen: s.last_seen || null }));
}
async function getStations() {
  const key = "satnogs", file = path.join(ROOT, "satnogs_stations.json"), now = Date.now();
  const cached = cacheGet(file);
  if (cached && now - Date.parse(cached.fetchedAt) < ST_TTL) return { ...cached, from: "cache" };
  const fallback = () => { const b = cached || readJson(BUNDLED_STATIONS); return b ? { ...b, from: cached ? "cache" : "bundled", stale: true } : null; };
  const why = blocked(key, now);
  if (why) { const f = fallback(); return f ? { ...f, error: why } : { error: why, status: 503 }; }
  return once(key, async () => {
    let url = "https://network.satnogs.org/api/stations/?format=json", all = [];
    try {
      for (let page = 0; page < 30 && url; page++) {
        const res = await fetchText(url, 30000);
        if (res.status !== 200) { noteError(key, Date.now()); const f = fallback(); return f ? { ...f, error: `SatNOGS returned HTTP ${res.status}` } : { error: `SatNOGS returned HTTP ${res.status}`, status: 502 }; }
        const j = JSON.parse(res.text);
        const items = Array.isArray(j) ? j : (j && Array.isArray(j.results) ? j.results : []);
        all = all.concat(items);
        const m = res.link && /<([^>]+)>;\s*rel="next"/.exec(res.link);
        url = m ? m[1] : (j && j.next) || null;
        if (url && !/^https:\/\/network\.satnogs\.org\//.test(url)) url = null;
      }
    } catch (e) { noteError(key, Date.now()); const f = fallback(); return f ? { ...f, error: "Could not reach SatNOGS" } : { error: "Could not reach SatNOGS", status: 502 }; }
    const rec = { source: "SatNOGS Network station catalog (network.satnogs.org)", license: "CC BY-SA 4.0", attribution: "Station data © SatNOGS / Libre Space Foundation contributors, CC BY-SA 4.0",
                  fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), stations: reduceStations(all) };
    cachePut(file, rec);
    return { ...rec, from: "live" };
  });
}

module.exports = function mount(app) {
  app.get("/api/coverage/gp/:catnr", async (req, res) => {
    const catnr = String(req.params.catnr || "");
    if (!/^\d{1,9}$/.test(catnr)) return res.status(400).json({ message: "Catalog number must be 1–9 digits" });
    const r = await getGp(String(+catnr));
    if (r.omm) return res.json(r);
    res.status(r.status || 502).json({ message: r.error });
  });
  app.get("/api/coverage/search", async (req, res) => {
    const term = String(req.query.name || "").trim();
    if (!/^[A-Za-z0-9 ()\-./]{3,24}$/.test(term)) return res.status(400).json({ message: "Search with 3–24 letters, digits, spaces or - . / ( )" });
    const r = await searchName(term);
    if (r.results) return res.json(r);
    res.status(r.status || 502).json({ message: r.error });
  });
  app.get("/api/coverage/stations", async (req, res) => {
    const r = await getStations();
    if (r.stations) return res.json(r);
    res.status(r.status || 502).json({ message: r.error });
  });
};
module.exports._internals = { getGp, searchName, getStations, BUDGET, cooldown, memCache, ROOT, budgetLeft };
