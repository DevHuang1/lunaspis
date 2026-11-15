/*
 * Real-satellite checks (run from run_checks.js when satellite.js is installed).
 * Reference SGP4 vectors: Vallado, Crawford, Hujsak & Kelso (2006) "Revisiting Spacetrack Report #3",
 * verification output for catalog 00005 (published test set; also distributed with CelesTrak's SGP4 code).
 */
"use strict";
const path = require("path");
const fs = require("fs");

module.exports = function ({ C, sat, check, assert, near }) {
  const D = C.D2R;
  check("N17", "SGP4 vs published reference vectors (Vallado 2006, #00005)", () => {
    const rec = sat.twoline2satrec(
      "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753",
      "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667");
    const ref = [
      [0, [7022.46529266, -1400.08296755, 0.03995155], [1.893841015, 6.405893759, 4.534807250]],
      [360, [-7154.03120202, -3783.17682504, -3536.19412294], [4.741887409, -4.151817765, -2.093935425]],
    ];
    for (const [tm, r, v] of ref) {
      const pv = sat.sgp4(rec, tm);
      const dr = Math.hypot(pv.position.x - r[0], pv.position.y - r[1], pv.position.z - r[2]) * 1000;
      const dv = Math.hypot(pv.velocity.x - v[0], pv.velocity.y - v[1], pv.velocity.z - v[2]) * 1e6;
      assert(dr < 1, `t=${tm} min position off by ${dr.toFixed(3)} m`); assert(dv < 1, `t=${tm} min velocity off by ${dv.toFixed(3)} mm/s`);
    }
  });

  check("N18", "GMST matches satellite.js gstime (1990–2100) and a published value", () => {
    let worst = 0;
    for (let y = 1990; y <= 2100; y += 3.7) { const ms = Date.UTC(Math.floor(y), Math.floor((y % 1) * 12), 1 + Math.floor((y * 7) % 27), 7, 13, 42); worst = Math.max(worst, Math.abs(C.wrapPi(C.gmstFromUtcMs(ms) - sat.gstime(new Date(ms))))); }
    assert(worst < 1e-9, "max diff " + worst);
    // Vallado Example 3-5: 1992-08-20 12:14 UT1 → GMST 152.578788810°
    near(C.gmstFromUtcMs(Date.UTC(1992, 7, 20, 12, 14, 0)) / D, 152.578788810, 1e-5, "Vallado example 3-5");
  });

  check("N19", "WGS84 station positions and look angles match satellite.js", () => {
    const st = { lat: 16.84, lon: 96.17, altM: 30, maskDeg: 0 };
    const g = C.stationGeometry(st, "wgs84"), e = sat.geodeticToEcf({ latitude: st.lat * D, longitude: st.lon * D, height: st.altM / 1000 });
    near(Math.hypot(g.pos[0] - e.x * 1000, g.pos[1] - e.y * 1000, g.pos[2] - e.z * 1000), 0, 1e-3, "station ECEF (m)");
    const ll = C.ecefToLatLon(g.pos, "wgs84"); near(ll.lat / D, st.lat, 1e-9, "geodetic lat round trip"); near(ll.alt, st.altM, 1e-3, "alt round trip");
    const satE = [e.x * 1000 + 300e3, e.y * 1000 - 800e3, e.z * 1000 + 500e3];
    const mine = C.lookAngle(satE, g), lib = sat.ecfToLookAngles({ latitude: st.lat * D, longitude: st.lon * D, height: st.altM / 1000 }, { x: satE[0] / 1000, y: satE[1] / 1000, z: satE[2] / 1000 });
    near(mine.el, lib.elevation, 1e-9, "elevation"); near(C.wrapPi(mine.az - lib.azimuth), 0, 1e-9, "azimuth"); near(mine.range / 1000, lib.rangeSat, 1e-6, "range");
  });

  // a real OMM record: bundled snapshot if present, else derived from the #00005 reference set is not LEO → skip
  const snapFile = path.join(__dirname, "../../public/data/coverage/gp_snapshot.json");
  const snap = fs.existsSync(snapFile) ? JSON.parse(fs.readFileSync(snapFile, "utf8")) : null;
  if (!snap || !snap.satellites || !snap.satellites.length) { check("N20", "real forecast (needs public/data/coverage/gp_snapshot.json)", () => { throw new Error("bundled snapshot missing — run node tools/coverage_snapshot.js"); }); return; }
  const omm = snap.satellites[0].omm;
  const scenario = () => ({ schema: C.SCHEMA, mode: "real", title: omm.OBJECT_NAME, epochUtc: C.isoUtc(Math.floor(C.ommEpochMs(omm) / 60000) * 60000), horizon: "24h",
    orbit: { type: "omm", omm, source: { name: "CelesTrak GP", snapshot: "bundled" } }, pins: [], edited: false,
    stations: [{ id: "a", name: "Yangon", lat: 16.84, lon: 96.17, altM: 30, maskDeg: 10, enabled: true, source: "test" }, { id: "b", name: "Cape Town", lat: -33.92, lon: 18.42, altM: 0, maskDeg: 10, enabled: true, source: "test" }, { id: "c", name: "Fairbanks", lat: 64.84, lon: -147.72, altM: 130, maskDeg: 5, enabled: true, source: "test" }] });

  check("N20", `real forecast: pass edges agree with a 1 s brute-force scan using satellite.js look angles (${omm.OBJECT_NAME})`, () => {
    const s = scenario(); assert(C.validate(s).ok, JSON.stringify(C.validate(s).errors));
    const p = C.makePropagator(s, sat), fc = C.forecast(s, p);
    let checked = 0, worst = 0;
    for (const st of s.stations) {
      const gd = { latitude: st.lat * D, longitude: st.lon * D, height: st.altM / 1000 };
      const el = (t) => { const d = new Date(p.epochMs + t * 1000), pv = sat.propagate(p.satrec, d), e = sat.eciToEcf(pv.position, sat.gstime(d)); return sat.ecfToLookAngles(gd, e).elevation - st.maskDeg * D; };
      for (const ps of fc.passes[st.id]) {
        if (ps.clippedStart || ps.clippedEnd) continue;
        // independent edge search with the library's own frames, at 1 s then bisection
        const edge = (t0, rising) => { let a = t0 - 30, b = t0 + 30; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if ((el(m) >= 0) === rising) b = m; else a = m; } return (a + b) / 2; };
        const aos = edge(ps.start, true), los = edge(ps.end, false);
        worst = Math.max(worst, Math.abs(aos - ps.start), Math.abs(los - ps.end)); checked++;
      }
    }
    assert(checked >= 3, "only " + checked + " passes"); assert(worst < 2, `edge difference ${worst.toFixed(2)} s`);
    return `${checked} passes, worst edge difference ${worst.toFixed(3)} s; period ${(p.period / 60).toFixed(2)} min`;
  });

  check("N20b", "real orbit numbering, nodal period and phase return are consistent", () => {
    const s = scenario(), p = C.makePropagator(s, sat), fc = C.forecast(s, p);
    assert(fc.ascNodes.length >= 14, "ascending crossings " + fc.ascNodes.length);
    const dt = fc.ascNodes.slice(1).map((x, i) => x - fc.ascNodes[i]), mean = dt.reduce((a, b) => a + b, 0) / dt.length;
    near(mean / p.period, 1, 0.01, "nodal period vs mean-motion period");
    const tX = 5000, uX = p.argLat(tX), tr = p.phaseReturn(tX, uX);
    assert(tr !== null && Math.abs(C.wrapPi(p.argLat(tr) - uX)) < 1e-3, "phase return"); near(tr - tX, mean, 120, "return ≈ one nodal period");
    assert(p.orbitNo(fc.ascNodes[0] + 1) === 2, "orbit number increments at the first ascending crossing");
  });

  check("N28", "cached replay: saved real scenario reproduces the identical forecast with no network", () => {
    const s = scenario(), a = C.forecast(s, C.makePropagator(s, sat));
    const saved = JSON.parse(JSON.stringify(C.normalize(s)));
    const realFetch = global.fetch; let calls = 0; global.fetch = () => { calls++; throw new Error("network disabled"); };
    try { const b = C.forecast(saved, C.makePropagator(saved, sat)); assert(b.hash === a.hash, "hash differs"); } finally { global.fetch = realFetch; }
    assert(calls === 0, "network called");
  });

  check("N29", "data age tiers and invalid records", () => {
    const ep = C.ommEpochMs(omm);
    assert(C.dataAge(omm, ep + 1 * 86400e3).tier === "fresh" && C.dataAge(omm, ep + 5 * 86400e3).tier === "aging" && C.dataAge(omm, ep + 10 * 86400e3).tier === "stale" && C.dataAge(omm, ep + 40 * 86400e3).tier === "blocked", "tiers");
    const bad = { ...omm, ECCENTRICITY: 1.2 }; assert(!C.validateOmm(bad).ok, "e ≥ 1 accepted");
    const deep = { ...omm, MEAN_MOTION: 1.0027 }; assert(!C.validateOmm(deep).ok, "GEO accepted");
    const s = scenario(); s.epochUtc = C.isoUtc(ep + 40 * 86400e3); assert(!C.validate(s).ok, "start 40 days from epoch accepted");
  });

  check("N30", "server GP proxy: 2 h cache, 404 → cooldown without retry, error budget", () => {
    process.env.COVERAGE_OFFLINE = "0";
    process.env.COVERAGE_CACHE_DIR = fs.mkdtempSync(path.join(require("os").tmpdir(), "covcache-"));   // isolated cache
    const data = require("../../server/coverage_data.js")._internals;
    data.ROOT && data.memCache.clear(); data.BUDGET.errors.length = 0; data.cooldown.clear();
    const realFetch = global.fetch; const calls = [];
    global.fetch = async (url) => { calls.push(url); if (/CATNR=99999/.test(url)) return { status: 404, text: async () => "No GP data found", headers: { get: () => null } }; return { status: 200, text: async () => JSON.stringify([omm]), headers: { get: () => null } }; };
    return (async () => {
      try {
        const r1 = await data.getGp(String(omm.NORAD_CAT_ID)); const r2 = await data.getGp(String(omm.NORAD_CAT_ID));
        assert(r1.from === "live" && r2.from === "cache" && calls.length === 1, "second request not served from cache");
        assert(calls.every((u) => u.startsWith("https://celestrak.org/")), "wrong host");
        const n1 = await data.getGp("99999"), n2 = await data.getGp("99999");
        assert(n1.status === 502 || n1.status === 404, "404 status"); assert(calls.length === 2, "retried after an error (" + calls.length + " calls)"); assert(/next attempt/.test(n2.error), n2.error);
        // error budget: after 20 errors in 2 h every live fetch stops (CelesTrak firewalls at 50)
        global.fetch = async (url) => { calls.push(url); return { status: 500, text: async () => "", headers: { get: () => null } }; };
        const before = calls.length; for (let i = 0; i < 30; i++) await data.getGp(String(10000 + i));
        assert(calls.length - before === 19 && data.budgetLeft(Date.now()) === 0, `budget: ${calls.length - before} upstream calls after 1 earlier error`);
        const blockedAll = await data.getGp(String(omm.NORAD_CAT_ID)); assert(blockedAll.from === "cache", "cached record still served while paused");
      } finally { global.fetch = realFetch; process.env.COVERAGE_OFFLINE = "1"; }
    })();
  });

  check("N31", "Copy to Sandbox keeps provenance and approximates the orbit", () => {
    const s = scenario(), p = C.makePropagator(s, sat), sb = C.copyToSandbox(s, p, 3000);
    assert(C.validate(sb).ok, JSON.stringify(C.validate(sb).errors)); assert(sb.derivedFrom.catnr === String(omm.NORAD_CAT_ID) && !sb.edited, "provenance");
    const ps = C.makePropagator(sb); const a = p.posEcef(3000), b = ps.posEcef(0);
    const sep = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 1000; assert(sep < 60, `copied orbit starts ${sep.toFixed(1)} km from the real satellite`);
    return `starts ${sep.toFixed(1)} km from the real position; ${sb.orbit.altKm} km / ${sb.orbit.incDeg}°`;
  });
};
