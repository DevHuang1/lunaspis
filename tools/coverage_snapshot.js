#!/usr/bin/env node
/*
 * Build the bundled offline data for the CubeSat coverage mission (needs internet; run rarely):
 *   node tools/coverage_snapshot.js            → public/data/coverage/gp_snapshot.json
 *                                                public/data/coverage/satnogs_stations_snapshot.json
 * CelesTrak: ONE download of the CubeSat group (JSON / OMM), then 8 satellites are picked automatically:
 * freshest element epochs, low Earth orbit, spread across inclinations. Stops on any HTTP error (no retries),
 * as CelesTrak asks. SatNOGS: one catalog download, reduced to Online/Testing stations (CC BY-SA 4.0).
 *   --group=<name>   CelesTrak group to sample (default "cubesat")
 *   --count=<n>      satellites to keep (default 8)
 *   --skip-stations  only refresh the satellite snapshot
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const C = require("../public/js/coverage/coverage_core.js");

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const GROUP = arg("group", "cubesat"), COUNT = +arg("count", 8);
const OUT = path.join(__dirname, "..", "public", "data", "coverage");
const UA = "Interfellas-coverage/1.0 (educational game; snapshot tool)";
const iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, redirect: "manual" });
  const text = await r.text();
  if (r.status !== 200) { console.error(`STOP: ${url} returned HTTP ${r.status}. Not retrying (CelesTrak/SatNOGS usage rules).\n${text.slice(0, 300)}`); process.exit(1); }
  return { text, link: r.headers.get("link") };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // ---------------- CelesTrak
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(GROUP)}&FORMAT=JSON`;
  console.log("CelesTrak:", url);
  let arr; try { arr = JSON.parse((await get(url)).text); } catch (e) { console.error("STOP: response is not JSON (wrong group name?)"); process.exit(1); }
  const now = Date.now(), fetchedAt = iso();
  const cands = arr.filter((o) => C.validateOmm(o).ok && Number(o.MEAN_MOTION) > 11.25 && Number(o.ECCENTRICITY) < 0.02)
    .map((o) => ({ o, age: (now - C.ommEpochMs(o)) / 86400000, inc: Number(o.INCLINATION) }))
    .filter((c) => c.age >= 0 && c.age < 3).sort((a, b) => a.age - b.age);
  if (!cands.length) { console.error("STOP: no fresh LEO CubeSat records in that group"); process.exit(1); }
  const bins = [[0, 45], [45, 60], [60, 90], [90, 180]], picked = [];
  for (let round = 0; picked.length < COUNT && round < COUNT; round++)
    for (const [lo, hi] of bins) { const c = cands.find((x) => x.inc >= lo && x.inc < hi && !picked.includes(x)); if (c && picked.length < COUNT) picked.push(c); }
  for (const c of cands) { if (picked.length >= COUNT) break; if (!picked.includes(c)) picked.push(c); }
  const sats = picked.map((c) => ({ omm: c.o, fetchedAt, sourceUrl: url, sha256: crypto.createHash("sha256").update(JSON.stringify(c.o)).digest("hex") }));
  const gp = { source: "CelesTrak GP data (celestrak.org), OMM JSON", group: GROUP, fetchedAt, note: "Published mean elements for SGP4. Bundled for offline use; refresh with tools/coverage_snapshot.js.", satellites: sats };
  fs.writeFileSync(path.join(OUT, "gp_snapshot.json"), JSON.stringify(gp, null, 1));
  console.log(`wrote gp_snapshot.json: ${sats.map((s) => `${s.omm.OBJECT_NAME} #${s.omm.NORAD_CAT_ID} (${(+s.omm.INCLINATION).toFixed(1)}°)`).join(", ")}`);
  if (process.argv.includes("--skip-stations")) return;
  // ---------------- SatNOGS
  let next = "https://network.satnogs.org/api/stations/?format=json", all = [];
  console.log("SatNOGS:", next);
  for (let page = 0; page < 30 && next; page++) {
    const r = await get(next); const j = JSON.parse(r.text);
    const items = Array.isArray(j) ? j : (j.results || []); all = all.concat(items);
    const m = r.link && /<([^>]+)>;\s*rel="next"/.exec(r.link); next = m ? m[1] : (j && j.next) || null;
  }
  const stations = all.filter((s) => (s.status === "Online" || s.status === "Testing") && isFinite(s.lat) && isFinite(s.lng))
    .map((s) => ({ id: s.id, name: String(s.name || "").slice(0, 60), lat: s.lat, lng: s.lng, altitude: s.altitude || 0, min_horizon: typeof s.min_horizon === "number" ? s.min_horizon : null, status: s.status, last_seen: s.last_seen || null }));
  const st = { source: "SatNOGS Network station catalog (network.satnogs.org)", license: "CC BY-SA 4.0", attribution: "Station data © SatNOGS / Libre Space Foundation contributors, CC BY-SA 4.0",
               fetchedAt: iso(), note: "Online and Testing stations only. Listed locations; listing does not mean a station will or can track a given satellite.", stations };
  fs.writeFileSync(path.join(OUT, "satnogs_stations_snapshot.json"), JSON.stringify(st));
  console.log(`wrote satnogs_stations_snapshot.json: ${stations.length} stations (of ${all.length} listed)`);
})().catch((e) => { console.error("STOP:", e.message); process.exit(1); });
