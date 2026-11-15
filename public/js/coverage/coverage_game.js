/*
 * coverage_game.js — client controller for the CubeSat Contact Coverage mission.
 *
 * The server owns the scenario, its revision, the editor and the clock (server/coverage_room.js).
 * This controller computes the forecast locally from the identical scenario (CoverageCore), renders
 * it (CoverageView + CoverageHud), sends editor requests, and reports a forecast hash so the session
 * can detect desync. Playback speed only changes how fast simulation time advances; predictions are
 * computed once per scenario revision.
 */
(function () {
  "use strict";
  const C = window.CoverageCore;
  const RATES = [1, 10, 60, 300, 1000];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const floorMinuteIso = (ms) => C.isoUtc(Math.floor(ms / 60000) * 60000);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const game = {
    isActive: false, net: null, view: null, hud: null, listeners: [],
    testMode: /[?&]coveragetest=1/.test(location.search),
    st: null, scn: null, prop: null, fc: null, revision: 0, error: null, ready: false,
    clock: { simT: 0, wallRef: 0, rate: 60, paused: true }, saved: { A: null, B: null },
    catalog: null, satellites: null,

    start(opts) {
      if (this.isActive) return;
      this.net = opts.net; this.onLeave = opts.onLeave; this.isActive = true;
      this.renderer = window.renderer;
      this.view = null; this.hud = null; this.deploy = null; this._deployCardShown = false;
      this.saved = store.get("interfellas_cov_ab", { A: null, B: null }) || { A: null, B: null };
      this.st = null; this.scn = null; this.prop = null; this.fc = null; this.revision = 0; this.ready = false; this.error = null;
      this._endShownRev = null; this._cmpKey = null; this._lastCmpT = 0; this.picking = false;
      this.stationMode = false; this.hoverT = null; this.compareIds = null; this.usefulEl = store.get("interfellas_cov_useful", 30);
      this._on(window, "keydown", (e) => this._key(e), true);
      this._netHandlers = {
        coverage_state: (st) => this._onState(st),
        coverage_clock: (c) => { if (this.st && c.revision === this.revision) { this.clock = c.clock; this._clockServerNow = c.serverNow; } },
        player_left: (p) => this.hud && this.hud.toast(`${p.name} left the session`),
      };
      for (const k of Object.keys(this._netHandlers)) this.net.on(k, this._netHandlers[k]);
      // The session opens with the CubeSat still on the ISS (deploy_game.js) unless the deployment is over or skipped
      const st0 = this.net.coverageState;
      if (st0 && st0.deployActive) this._startDeploy(); else this._ensureUi();
      if (st0) this._onState(st0); else this.net.coverageRequest("SYNC");
      this._loadSatelliteList();
      if (!this.testMode && !store.get("interfellas_cov_onboarded", false)) setTimeout(() => this.isActive && this.hud && !this.deploy && this.hud.showOnboarding(0), 600);
      console.log("[Coverage] session view active");
    },
    _ensureUi() {
      if (this.view) return;
      this.view = new window.CoverageView(this.renderer);
      this.hud = new window.CoverageHud((c, a) => this.command(c, a));
      if (!this._pointerBound) { this._pointerBound = true; this._bindPointer(); }
    },
    _startDeploy() {
      if (this.deploy) return;
      if (this.hud) { this.hud.dispose(); this.hud = null; } if (this.view) { this.view.dispose(); this.view = null; }
      this.deploy = new window.DeployMode(this);
      // automated coverage playtests start in orbit as before (unless ?deploytest=1)
      if (this.testMode && !/[?&]deploytest=1/.test(location.search) && (!this.room || this.room.hostId === this.net.socketId)) this.net.coverageRequest("DEPLOY", { cmd: "SKIP" });
      console.log("[Coverage] ISS deployment phase");
    },
    _endDeploy() {
      if (!this.deploy) return;
      this.deploy.dispose(); this.deploy = null;
      this.revision = -1; this.st = null;
      this._ensureUi();
      console.log("[Coverage] deployment over — coverage phase");
    },
    _on(t, type, fn, cap) { t.addEventListener(type, fn, !!cap); this.listeners.push([t, type, fn, !!cap]); },
    exit() {
      if (!this.isActive) return;
      for (const [t, type, fn, cap] of this.listeners) t.removeEventListener(type, fn, cap);
      this.listeners = []; this._pointerBound = false;
      if (this.net && this._netHandlers) for (const k of Object.keys(this._netHandlers)) this.net.off(k, this._netHandlers[k]);
      if (this.deploy) { this.deploy.dispose(); this.deploy = null; }
      if (this.hud) this.hud.dispose(); if (this.view) this.view.dispose();
      this.hud = null; this.view = null; this.isActive = false; this.st = null; this.fc = null; this.prop = null; this.scn = null;
      console.log("[Coverage] session view closed");
    },
    onRoomUpdate(room) { this.room = room; },

    // ---------------------------------------------------------------- server state → local forecast
    _onState(st) {
      if (st.deployActive) { this._startDeploy(); return; }
      if (this.deploy) this._endDeploy();
      this._ensureUi();
      const newRev = !this.st || st.revision !== this.revision;
      this.st = st; this.clock = st.clock; this._clockServerNow = st.serverNow;
      if (!newRev) { if (this.scn) { this.scn.pins = st.scenario.pins || []; this._cmpKey = null; } return; }
      this.revision = st.revision; this.scn = st.scenario; this.ready = false; this.error = null; this._endShownRev = null; this._cmpKey = null;
      try {
        this.prop = C.makePropagator(this.scn, window.satellite);
        this.fc = C.forecast(this.scn, this.prop);
        this.ready = true;
      } catch (e) {
        this.error = this.scn.orbit.type === "omm" && !window.satellite ? "The SGP4 library did not load, so real-satellite predictions are unavailable. Edit the scenario and choose Sandbox." : `Could not compute passes: ${e.message}`;
        this.prop = null; this.fc = null;
      }
      this.view.setScenario(this.scn, this.prop, this.fc);
      this.hud.setForecast(this.scn, this.prop, this.fc, {});
      if (this.ready) this.net.coverageRequest("HASH", { revision: this.revision, hash: this.fc.hash });
      if (this.ready && st.deployResult && !this._deployCardShown && !this.testMode) {
        this._deployCardShown = true; const h = st.deployResult.handoff, d = st.deployResult.done || {};
        this.hud.showCard("CubeSat in orbit", `<p><b>${h.altKm.toFixed(1)} km · ${h.incDeg.toFixed(2)}°</b> · release-derived, circularised</p>${d.at30 ? `<p>First beacon · ${(d.at30.dist / 1000).toFixed(2)} km from ISS</p>` : ""}<p>[Space] Play · [S] Stations · [E] Orbit</p>`, [["HELP", "Controls"]]);
      }
      else if (!this.ready) this.hud.showCard("Scenario problem", `<p>${this.error}</p>`, this.isEditor() ? [["EDIT", "EDIT SCENARIO"]] : []);
    },
    isEditor() { return !!(this.st && this.net && this.st.editorId === this.net.socketId); },
    simTime() {
      if (!this.st) return 0;
      const c = this.clock, H = this.fc ? this.fc.validUntil : C.horizonSecondsQuick(this.scn);
      if (c.paused) return Math.min(c.simT, H);
      return Math.max(0, Math.min(H, c.simT + c.rate * (this.net.serverNow() - c.wallRef) / 1000));
    },

    // ---------------------------------------------------------------- frame
    frame(dt) {
      if (!this.isActive) return;
      if (this.deploy) { this.deploy.frame(dt); return; }
      if (!this.view) return;
      if (!this.ready || !this.prop) { this.view.render(); if (this.hud && this.scn) this.hud.update(0, null, {}); return; }
      const t = this.simTime(), q = C.query(this.scn, this.prop, this.fc, t, 30);
      const dock = this.hud.el.querySelector("#cv-dock"); if (dock) this.view.setViewOffsetY(dock.offsetHeight / 2);
      const pins = this.scn.pins || [];
      this.view.update(t, q, { pins, hoverT: this.hoverT });
      this.view.render();
      const wall = performance.now();
      if (wall - this._lastCmpT > 250) {
        this._lastCmpT = wall; this._compare = this._computeCompare(t);
        const info = {}; for (const p of pins) info[p.id] = { utcMs: this.prop.epochMs + p.t * 1000, orbitNo: this.prop.orbitNo(p.t), count: C.inViewCount(this.fc, p.t) };
        this.hud.renderPins(pins, null, info);
      }
      const atEnd = t >= this.fc.validUntil - 1e-6;
      if (atEnd && this._endShownRev !== this.revision && !this.hud.openWin) { this._endShownRev = this.revision; this.hud.showCard("End of the prediction window", `<p>The ${C.HORIZONS[this.scn.horizon].label} prediction window is over. Open the results, replay the identical scenario from the start, or edit the scenario to look further ahead.</p>`, [["RESULTS", "RESULTS"], ...(this.isEditor() ? [["REPLAY", "REPLAY"], ["EDIT", "EDIT"]] : [])]); }
      const ed = this.room && this.room.players ? this.room.players.find((p) => p.id === this.st.editorId) : null;
      this.hud.update(t, q, {
        ready: this.ready, error: this.error, paused: this.clock.paused, rate: this.clock.rate, isEditor: this.isEditor(), editorName: (ed && ed.name) || this.st.editorName,
        players: this.room && this.room.players ? this.room.players.length : 1, camMode: this.view.mode, earthLock: this.view.earthLock,
        screen: this.view.stationScreen(), sat: this.view.satScreen(), pins, pinScreen: this.view.pinScreen(pins), hoverT: this.hoverT, compare: this._compare,
        stationMode: this.stationMode, trackSpan: this.view.trackSpan,
        dataAge: this.scn.orbit.type === "omm" ? C.dataAge(this.scn.orbit.omm, this.prop.epochMs + t * 1000) : null,
        dataBanner: this.scn.orbit.type === "omm" && this.scn.orbit.source && this.scn.orbit.source.snapshot === "bundled" ? "Using the bundled element snapshot (offline copy)" : null,
        desync: this.st.desync, atEnd,
      });
    },
    _computeCompare(t) {
      const ids = this.compareIds, pins = this.scn.pins || [];
      if (!ids || ids.length !== 2) return null;
      const A = pins.find((p) => p.id === ids[0]), B = pins.find((p) => p.id === ids[1]); if (!A || !B) return null;
      const [a, b] = A.t <= B.t ? [A, B] : [B, A];
      const key = `${this.revision}|${a.id}|${a.t}|${b.id}|${b.t}`;
      if (key !== this._cmpKey) {
        this._cmpKey = key;
        this._cmpStatic = { a: C.markerSnapshot(this.scn, this.prop, this.fc, a.t), b: C.markerSnapshot(this.scn, this.prop, this.fc, b.t), aName: a.name, bName: b.name, diff: C.compare(this.scn, this.fc, a.t, b.t) };
        const r = this.prop.phaseReturn(a.t, this.prop.argLat(a.t)); this._cmpStatic.returnA = { t: r, exact: this.prop.exactPeriod };
      }
      return this._cmpStatic;
    },
    _nextPinName() { const used = new Set((this.scn.pins || []).map((p) => p.name)); for (let i = 0; i < 26 * 4; i++) { const n = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) + 1 : ""); if (!used.has(n)) return n; } return "P" + Date.now() % 1000; },
    async _pinAt(t) {
      if (!this._editorOnly()) return;
      const pins = (this.scn.pins || []).slice();
      if (pins.length >= C.LIMITS.pins) { this.hud.toast(`At most ${C.LIMITS.pins} pins — delete one first`); return; }
      const H = this.fc ? this.fc.validUntil : 0; t = Math.max(0, Math.min(H, t));
      const pin = { id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 100), name: this._nextPinName(), t };
      pins.push(pin); pins.sort((x, y) => x.t - y.t);
      const r = await this._req("SET_PINS", { pins });
      if (r.accepted) { this.hud.toast(`Pinned ${pin.name} — ${C.inViewCount(this.fc, t)} station(s) in view`, 2500); if (!this.hud.pinsOpen) this.hud.togglePins(true); }
    },
    async _applyStations(mutate, okMsg) {
      if (!this._editorOnly()) return false;
      const next = clone(this.scn); mutate(next.stations, next);
      const v = C.validate(next);
      if (!v.ok) { const m = v.errors[0]; this.hud.toast(`${m.msg}`); this.hud.stationPopError(m.msg); return false; }
      const r = await this._req("SET_SCENARIO", { scenario: next });
      if (r.accepted && okMsg) this.hud.toast(okMsg, 2500);
      return r.accepted;
    },
    // ---------------------------------------------------------------- commands
    async _req(type, payload) {
      const r = await this.net.coverageRequest(type, payload);
      if (!r.accepted && this.hud) this.hud.toast(r.reason || "Rejected");
      return r;
    },
    _editorOnly() { if (this.isEditor()) return true; this.hud.toast(`${(this.st && this.st.editorName) || "The host"} controls time and the scenario`); return false; },
    async command(c, a) {
      if (!this.isActive) return;
      const t = this.simTime();
      switch (c) {
        case "PLAY": if (!this._editorOnly()) return; return this._req("CLOCK", { op: this.clock.paused ? "play" : "pause" });
        case "RATE": if (!this._editorOnly()) return; return this._req("CLOCK", { op: "rate", value: +a });
        case "RATE+": case "RATE-": { if (!this._editorOnly()) return; const i = RATES.indexOf(this.clock.rate); const n = RATES[Math.max(0, Math.min(RATES.length - 1, i + (c === "RATE+" ? 1 : -1)))]; return this._req("CLOCK", { op: "rate", value: n }); }
        case "SEEK": if (!this.isEditor()) { this.hud.toast(`${(this.st && this.st.editorName) || "The host"} controls time`); return; } return this._req("CLOCK", { op: "seek", value: +a });
        case "NEXT_EVENT": {
          if (!this._editorOnly() || !this.fc) return;
          const ev = C.nextEventAfter(this.fc, t);
          if (!ev) { this.hud.toast("No more station events in this prediction window"); return; }
          const st = this.scn.stations.find((s) => s.id === ev.stationId);
          this.hud.toast(`${st.name.replace(/^Hypothetical site near /, "")} ${ev.type === "aos" ? "comes into view" : "leaves view"}`, 2500);
          return this._req("CLOCK", { op: "seek", value: ev.t + (ev.type === "aos" ? 0.01 : 0.01) });
        }
        case "PIN": return this._pinAt(t);
        case "PIN_AT": return this._pinAt(+a);
        case "PINS": return this.hud.togglePins();
        case "PIN_GO": { const p = (this.scn.pins || []).find((x) => x.id === a); if (p && this._editorOnly()) return this._req("CLOCK", { op: "seek", value: p.t }); return; }
        case "PIN_DEL": { if (!this._editorOnly()) return; return this._req("SET_PINS", { pins: (this.scn.pins || []).filter((x) => x.id !== a) }); }
        case "PIN_CLEAR": { if (!this._editorOnly()) return; return this._req("SET_PINS", { pins: [] }); }
        case "PIN_COMPARE": { this.compareIds = a; this._cmpKey = null; this._compare = this._computeCompare(t); return this.hud.showCompare(this._compare); }
        case "COMPARE": return this.hud.togglePins();
        case "HOVER_T": {
          this._hoverFrom = a ? a.from : null;
          if (!a || !this.fc) { this.hoverT = null; this.hud.showInspector(0, 0, null); return; }
          this.hoverT = Math.max(0, Math.min(this.fc.validUntil, a.t));
          const q = C.query(this.scn, this.prop, this.fc, this.hoverT, 1);
          this.hud.showInspector(a.x, a.y, { t: this.hoverT, utcMs: q.utcMs, orbitNo: q.orbitNo, latDeg: q.latDeg, lonDeg: q.lonDeg, altKm: q.altKm, argLatDeg: q.argLatDeg, available: q.available, next: q.next[0] ? { name: q.next[0].name, startsIn: q.next[0].startsIn } : null, canPin: this.isEditor() && a.from !== "timeline" });
          return;
        }
        case "STATIONS": case "ST_DONE": if (c === "STATIONS" && !this._editorOnly()) return; this.stationMode = c === "STATIONS" ? !this.stationMode : false; this.hud.showStationPop(null); if (this.stationMode) this.hud.toast("Click the globe to add a station · drag one to move it · click one to edit", 3500); return;
        case "TRACK": this.view.setTrackSpan(this.view.trackSpan === "window" ? "orbit" : "window"); return;
        case "ST_PASTE": return this.hud.showPaste(this.isEditor());
        case "ST_PASTE_ADD": {
          const r = C.parseStationList(a, this.scn.stations);
          if (r.errors.length) { this.hud.pasteError(r.errors.slice(0, 4).map((e) => `Line ${e.line}: ${e.msg}`).join(" · ")); if (!r.stations.length) return; }
          if (this.scn.stations.length + r.stations.length > C.LIMITS.stations) { this.hud.pasteError(`That would make more than ${C.LIMITS.stations} stations.`); return; }
          const ok = await this._applyStations((sts) => sts.push(...r.stations), `Added ${r.stations.length} station(s)${r.errors.length ? `, skipped ${r.errors.length} line(s)` : ""}`);
          if (ok && !r.errors.length) this.hud.closeWindows(true);
          return;
        }
        case "ST_MY_SAVE": { const mine = this.scn.stations.map((x) => ({ ...x })); this.hud.toast(store.set("interfellas_cov_mystations", mine) ? `Saved ${mine.length} stations as "my stations" in this browser` : "This browser blocks storage — export the scenario instead"); return; }
        case "ST_MY_LOAD": {
          const mine = store.get("interfellas_cov_mystations", null);
          if (!mine || !mine.length) { this.hud.toast("No saved stations yet — set them up, then SAVE AS MY STATIONS"); return; }
          return this._applyStations((sts) => { sts.splice(0, sts.length, ...mine.slice(0, C.LIMITS.stations)); }, `Loaded ${mine.length} saved stations`);
        }
        case "ST_TABLE": this.stationMode = false; return this.openEditor();
        case "ST_UPDATE": { const ok = await this._applyStations((sts) => { const x = sts.find((q) => q.id === a.id); if (x) Object.assign(x, { name: a.name, lat: a.lat, lon: a.lon, maskDeg: a.maskDeg, enabled: a.enabled }); }, "Station updated"); if (ok) this.hud.showStationPop(null); return; }
        case "ST_DELETE": { const ok = await this._applyStations((sts) => { const i = sts.findIndex((q) => q.id === a); if (i >= 0) sts.splice(i, 1); }, "Station removed"); if (ok) this.hud.showStationPop(null); return; }
        case "CSV": return this._downloadText(C.passesCsv(this.scn, this.prop, this.fc), `passes-${(this.scn.title || "scenario").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${this.scn.epochUtc.slice(0, 10)}.csv`, "text/csv");
        case "USEFUL_EL": { const v = Math.max(0, Math.min(90, +a || 0)); this.usefulEl = v; store.set("interfellas_cov_useful", v); return this.command("RESULTS"); }
        case "REPLAY": if (!this._editorOnly()) return; return this._req("CLOCK", { op: "replay" });
        case "ZOOM": return this.hud.toggleZoom();
        case "CAM": this.view.cycleMode(); return;
        case "LOCK": this.view.earthLock = !this.view.earthLock; return;
        case "EDIT": return this.openEditor();
        case "EDIT_CLOSED": this._draft = null; return;
        case "RESULTS": if (!this.fc) return; return this.hud.showResults(C.summarize(this.scn, this.prop, this.fc, { usefulElDeg: this.usefulEl }), this.scn, this.prop, { A: !!this.saved.A, B: !!this.saved.B });
        case "SAVE_A": case "SAVE_B": {
          const k = c === "SAVE_A" ? "A" : "B";
          this.saved[k] = { scenario: clone(this.scn), summary: C.summarize(this.scn, this.prop, this.fc, { usefulElDeg: this.usefulEl }), savedAt: new Date().toISOString().slice(0, 16).replace("T", " ") + "Z" };
          store.set("interfellas_cov_ab", this.saved);
          this.hud.toast(`Saved as ${k}${this.saved.A && this.saved.B ? " — press COMPARE A / B" : " — change the scenario, run it, then save the other one"}`);
          return this.command("RESULTS");
        }
        case "AB": if (this.saved.A && this.saved.B) this.hud.showAB(C.compareAB(this.saved.A, this.saved.B), this.saved.A, this.saved.B); return;
        case "EXPORT": return this._download(this.scn);
        case "DATA": if (!this.fc) return; return this.hud.showData(C.query(this.scn, this.prop, this.fc, t, 0), { revision: this.revision, editorName: this.st.editorName, desync: this.st.desync, model: this.view.modelStatus,
          handover: this.net.socketId === (this.room && this.room.hostId) && this.room.players ? this.room.players.filter((p) => p.id !== this.st.editorId).map((p) => ({ id: p.id, name: p.name })) : null });
        case "RESYNC": this.revision = -1; this.st = null; return this.net.coverageRequest("SYNC");
        case "HANDOVER": { const r = await this._req("SET_EDITOR", { playerId: a }); if (r.accepted) { this.hud.closeWindows(); this.hud.toast("Editing handed over"); } return; }
        case "HELP": return this.hud.showHelp();
        case "ONBOARD": this._onb = 0; return this.hud.showOnboarding(0);
        case "ONBOARD_NEXT": this._onb = (this._onb || 0) + 1; return this.hud.showOnboarding(Math.min(2, this._onb));
        case "ONBOARD_SKIP": case "ONBOARD_DONE": store.set("interfellas_cov_onboarded", true); this._onb = 0; return this.hud.closeWindows();
        case "EXIT": case "LEAVE": if (this.onLeave) this.onLeave(); return;
        case "APPLY_SCENARIO": {
          const v = C.validate(a); if (!v.ok) { this.hud.toast("Fix the highlighted fields first"); return; }
          if (a.orbit.type === "omm" && !window.satellite) { this.hud.toast("SGP4 library unavailable — choose Sandbox"); return; }
          const r = await this._req("SET_SCENARIO", { scenario: a });
          if (r.accepted) { this._draft = null; this.hud.closeWindows(true); this.hud.toast("Scenario running from its start time — press SPACE"); }
          return;
        }
        default:
          if (c.startsWith("ED_")) return this._editorCommand(c, a);
      }
    },

    // ---------------------------------------------------------------- scenario editor
    openEditor() {
      this._draft = this._draft || clone(this.scn || C.defaultSandbox(Date.now()));
      this.hud.showEditor(this._draft, { isEditor: this.isEditor(), satellites: this.satellites || [] });
    },
    async _loadSatelliteList() {
      if (this.satellites) return this.satellites;
      try { const r = await fetch("data/coverage/gp_snapshot.json", { cache: "no-cache" }); if (r.ok) { const j = await r.json(); this.snapshot = j; this.satellites = j.satellites.map((s) => ({ catnr: String(s.omm.NORAD_CAT_ID), name: s.omm.OBJECT_NAME })); } }
      catch (e) { this.satellites = []; }
      return this.satellites;
    },
    _snapshotRecord(catnr) {
      const s = this.snapshot && this.snapshot.satellites.find((x) => String(x.omm.NORAD_CAT_ID) === String(catnr));
      return s ? { omm: s.omm, source: { name: "CelesTrak GP", url: s.sourceUrl, fetchedAt: s.fetchedAt, sha256: s.sha256 || null, snapshot: "bundled" } } : null;
    },
    async _fetchGp(catnr) {
      if (!/^\d{1,9}$/.test(String(catnr))) { this.hud.toast("Catalog number: 1–9 digits"); return null; }
      try {
        const r = await fetch(`api/coverage/gp/${catnr}`); const j = await r.json();
        if (!r.ok || !j.omm) { const snap = this._snapshotRecord(catnr); if (snap) { this.hud.toast(`${j.message || "Live data unavailable"} — using the bundled snapshot`); return snap; } this.hud.toast(j.message || `No published elements for catalog number ${catnr}`); return null; }
        if (j.stale) this.hud.toast(`Live fetch unavailable (${j.error}) — using cached elements from ${j.fetchedAt}`);
        return { omm: j.omm, source: { name: "CelesTrak GP", url: j.sourceUrl, fetchedAt: j.fetchedAt, sha256: j.sha256, snapshot: j.from } };
      } catch (e) {
        const snap = this._snapshotRecord(catnr); if (snap) { this.hud.toast("Offline — using the bundled snapshot"); return snap; }
        this.hud.toast("Offline and not in the bundled snapshot"); return null;
      }
    },
    _setReal(d, rec) {
      const v = C.validateOmm(rec.omm); if (!v.ok) { this.hud.toast("Invalid orbital elements: " + v.errors[0]); return; }
      d.orbit = { type: "omm", omm: rec.omm, source: rec.source };
      d.title = rec.omm.OBJECT_NAME; delete d.derivedFrom; d.edited = false;
      const ep = C.ommEpochMs(rec.omm), now = Date.now();
      if (Math.abs(C.parseUtc(d.epochUtc) - ep) > 25 * 86400000) d.epochUtc = floorMinuteIso(Math.abs(now - ep) < 25 * 86400000 ? now : ep);
      this.hud.refreshEditor();
    },
    async _editorCommand(c, d) {
      d = this._draft;
      if (!d) return;
      if (!this.isEditor() && !["ED_EXPORT", "ED_LOAD"].includes(c)) { this.hud.toast("Only the editor can change the scenario"); return; }
      switch (c) {
        case "ED_MODE": {
          const mode = arguments[1];
          if (mode === d.mode) return;
          if (mode === "sandbox") { const def = C.defaultSandbox(Date.now()); d.mode = "sandbox"; d.orbit = def.orbit; d.title = def.title; delete d.derivedFrom; d.edited = false; }
          else {
            await this._loadSatelliteList();
            const first = this.satellites && this.satellites[0]; const rec = first && this._snapshotRecord(first.catnr);
            if (!rec) { this.hud.toast("No satellite data available offline"); return; }
            d.mode = "real"; d.epochUtc = floorMinuteIso(Date.now()); this._setReal(d, rec); return;
          }
          return this.hud.refreshEditor();
        }
        case "ED_SELECT_SAT": { const rec = this._snapshotRecord(arguments[1]); if (rec) this._setReal(d, rec); return; }
        case "ED_FETCH": { const v = (this.hud.el.querySelector("#cv-catnr") || {}).value || ""; const rec = await this._fetchGp(v.trim()); if (rec) this._setReal(d, rec); return; }
        case "ED_REFRESH": { const rec = await this._fetchGp(d.orbit.omm.NORAD_CAT_ID); if (rec) { this._setReal(d, rec); this.hud.toast("Elements refreshed — RUN creates a new revision; save A/B to compare old vs new"); } return; }
        case "ED_SEARCH": {
          const q = ((this.hud.el.querySelector("#cv-search") || {}).value || "").trim();
          if (q.length < 3) { this.hud.toast("Type at least 3 letters"); return; }
          let list = [];
          try { const r = await fetch(`api/coverage/search?name=${encodeURIComponent(q)}`); const j = await r.json(); if (r.ok) list = j.results || []; else this.hud.toast(j.message || "Search unavailable"); }
          catch (e) { this.hud.toast("Search needs the network — showing bundled matches"); }
          const local = (this.satellites || []).filter((s) => s.name.toLowerCase().includes(q.toLowerCase())).map((s) => ({ catnr: s.catnr, name: s.name, bundled: true }));
          const all = [...local, ...list.filter((x) => !local.some((l) => l.catnr === String(x.catnr)))].slice(0, 25);
          const el = this.hud.editorHtml("cv-search-res", all.length ? all.map((s) => `<div><button data-sr="${s.catnr}">${s.name} (#${s.catnr})${s.bundled ? " · offline" : ""}</button></div>`).join("") : `<div class="empty">No matches.</div>`);
          if (el) el.querySelectorAll("[data-sr]").forEach((b) => b.addEventListener("click", async () => { const id = b.getAttribute("data-sr"); const rec = this._snapshotRecord(id) || await this._fetchGp(id); if (rec) this._setReal(d, rec); }));
          return;
        }
        case "ED_COPY_SANDBOX": {
          try {
            const prop = C.makePropagator(d, window.satellite);
            const t = this.scn && this.scn.orbit.type === "omm" && String(this.scn.orbit.omm.NORAD_CAT_ID) === String(d.orbit.omm.NORAD_CAT_ID) ? this.simTime() : 0;
            const sb = C.copyToSandbox(d, prop, t);
            this._draft = sb; this.hud.showEditor(sb, { isEditor: true, satellites: this.satellites || [] });
            this.hud.toast(`Approximate circular orbit (eccentricity ${sb.derivedFrom.eccentricity.toFixed(4)} dropped). Edits are hypothetical.`, 5000);
          } catch (e) { this.hud.toast("Copy failed: " + e.message); }
          return;
        }
        case "ED_CATALOG": return this._showCatalog(d);
        case "ED_ADD": {
          if (d.stations.length >= C.LIMITS.stations) { this.hud.toast(`At most ${C.LIMITS.stations} stations`); return; }
          let n = d.stations.length + 1; while (d.stations.some((s) => s.name === `Station ${n}`)) n++;
          d.stations.push({ id: "st-" + Date.now().toString(36) + Math.floor(Math.random() * 1e4), name: `Station ${n}`, lat: 0, lon: 0, altM: 0, maskDeg: 10, enabled: true, source: "user" });
          return this.hud.refreshEditor();
        }
        case "ED_PICK": this.picking = true; this.hud.closeWindows(true); this.hud.setPickMode(true); return;
        case "ED_PRESET_ST": d.stations = C.defaultSandbox(Date.now()).stations; return this.hud.refreshEditor();
        case "ED_NOW": d.epochUtc = floorMinuteIso(Date.now()); return this.hud.refreshEditor();
        case "ED_RESET": { const def = C.defaultSandbox(Date.now()); Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, def); return this.hud.refreshEditor(); }
        case "ED_EXPORT": return this._download(d);
        case "ED_IMPORT": return this._import();
        case "ED_SAVE": {
          const list = store.get("interfellas_cov_saved", []) || [];
          const name = `${d.title || "Scenario"} · ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z`;
          list.unshift({ name, scenario: clone(d) }); while (list.length > 20) list.pop();
          this.hud.toast(store.set("interfellas_cov_saved", list) ? `Saved in this browser as "${name}"` : "This browser blocks storage — use EXPORT JSON instead");
          return;
        }
        case "ED_LOAD": {
          const list = store.get("interfellas_cov_saved", []) || [];
          const box = this.hud.editorHtml("cv-ed-body", `<div class="sec"><h4>Saved in this browser<em>${list.length} scenario${list.length === 1 ? "" : "s"}</em></h4>${list.length ? `<table>${list.map((s, i) => `<tr><td>${s.name.replace(/</g, "&lt;")}</td><td><button data-ld="${i}">LOAD</button> <button data-rm="${i}">DELETE</button></td></tr>`).join("")}</table>` : `<div class="empty">Nothing saved yet. SAVE… stores the scenario in this browser; EXPORT JSON gives you a file.</div>`}<div style="margin-top:8px"><button data-back>BACK</button></div></div>`);
          if (!box) return;
          box.querySelectorAll("[data-ld]").forEach((b) => b.addEventListener("click", () => { const s = list[+b.getAttribute("data-ld")].scenario; const v = C.validate(s); if (!v.ok) { this.hud.toast("That saved scenario is no longer valid: " + v.errors[0].msg); return; } this._draft = clone(s); this.hud.showEditor(this._draft, { isEditor: this.isEditor(), satellites: this.satellites || [] }); }));
          box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { list.splice(+b.getAttribute("data-rm"), 1); store.set("interfellas_cov_saved", list); this._editorCommand("ED_LOAD"); }));
          box.querySelector("[data-back]").addEventListener("click", () => this.hud.refreshEditor());
          return;
        }
      }
    },
    async _showCatalog(d) {
      let cat = this.catalog;
      if (!cat) {
        try { const r = await fetch("api/coverage/stations"); if (r.ok) cat = await r.json(); } catch (e) { /* offline */ }
        if (!cat || !cat.stations) { try { const r = await fetch("data/coverage/satnogs_stations_snapshot.json"); if (r.ok) cat = await r.json(); } catch (e) { /* none */ } }
        if (!cat || !cat.stations) { this.hud.toast("Station catalog unavailable"); return; }
        this.catalog = cat;
      }
      const render = () => {
        const f = ((this.hud.el.querySelector("#cv-cat-q") || {}).value || "").toLowerCase(), online = !!(this.hud.el.querySelector("#cv-cat-on") || { checked: true }).checked;
        const list = cat.stations.filter((s) => (!online || s.status === "Online") && (!f || s.name.toLowerCase().includes(f))).slice(0, 40);
        const el = this.hud.el.querySelector("#cv-cat-list");
        if (el) {
          el.innerHTML = list.map((s) => `<tr><td class="nm" title="${s.name.replace(/"/g, "&quot;")}">${s.name.replace(/</g, "&lt;")}</td><td>${s.lat.toFixed(2)}, ${s.lng.toFixed(2)}</td><td class="muted">${s.status}</td><td><button data-cat="${s.id}">ADD</button></td></tr>`).join("") || `<tr><td class="empty">No matching stations.</td></tr>`;
          el.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { const s = cat.stations.find((x) => String(x.id) === b.getAttribute("data-cat")); this._addCatalogStation(d, s, cat); }));
        }
      };
      const el = this.hud.editorHtml("cv-catalog", `<div class="sec" style="margin-top:8px"><h4>SatNOGS station catalog<em>${cat.stations.length} stations · fetched ${cat.fetchedAt || "?"} · ${cat.license || "CC BY-SA 4.0"} — listed locations; listing does not mean a station will or can track this satellite</em></h4>
        <div class="row" style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap"><input type="text" id="cv-cat-q" placeholder="filter by name"><label><input type="checkbox" id="cv-cat-on" checked> Online only</label><button data-near>ADD 8 NEAREST TO THE TRACK</button></div>
        <table id="cv-cat-list"></table></div>`);
      if (!el) return;
      el.querySelector("#cv-cat-q").addEventListener("input", render); el.querySelector("#cv-cat-on").addEventListener("change", render);
      el.querySelector("[data-near]").addEventListener("click", () => this._addNearest(d, cat, 8));
      render();
    },
    _addCatalogStation(d, s, cat) {
      if (!s) return;
      const id = "satnogs-" + s.id;
      if (d.stations.some((x) => x.id === id)) { this.hud.toast("Already in the list"); return; }
      if (d.stations.length >= C.LIMITS.stations) { this.hud.toast(`At most ${C.LIMITS.stations} stations`); return; }
      let name = String(s.name).trim().slice(0, 32) || ("SatNOGS " + s.id); while (d.stations.some((x) => x.name.toLowerCase() === name.toLowerCase())) name = (name.slice(0, 26) + " #" + s.id).slice(0, 32);
      const mh = typeof s.min_horizon === "number" && s.min_horizon >= 0 && s.min_horizon <= 60 ? s.min_horizon : 10;
      d.stations.push({ id, name, lat: +s.lat.toFixed(4), lon: +s.lng.toFixed(4), altM: Math.max(-500, Math.min(9000, s.altitude || 0)), maskDeg: mh, enabled: true, source: `SatNOGS catalog ${String(cat.fetchedAt || "").slice(0, 10)} (CC BY-SA 4.0)` });
      this.hud.refreshEditor(); this._showCatalog(d);
    },
    _addNearest(d, cat, n) {
      let prop; try { prop = C.makePropagator(d, window.satellite); } catch (e) { this.hud.toast("Choose a valid satellite first"); return; }
      const track = []; for (let t = 0; t < prop.period * 3; t += 60) { const p = prop.posEcef(t); if (p) { const ll = C.ecefToLatLon(p, prop.earth); track.push([ll.lat, ll.lon]); } }
      const dist = (s) => { let best = 9; const la = s.lat * C.D2R, lo = s.lng * C.D2R; for (const [a, b] of track) { const c = Math.acos(Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(a) + Math.cos(la) * Math.cos(a) * Math.cos(lo - b)))); if (c < best) best = c; } return best; };
      const cands = cat.stations.filter((s) => s.status === "Online" && !d.stations.some((x) => x.id === "satnogs-" + s.id)).map((s) => ({ s, d: dist(s) })).sort((a, b) => a.d - b.d);
      const picked = []; for (const c of cands) { if (picked.length >= n) break; if (picked.every((p) => Math.hypot(p.s.lat - c.s.lat, p.s.lng - c.s.lng) > 5)) picked.push(c); }
      picked.forEach((p) => this._addCatalogStation(d, p.s, cat));
      this.hud.toast(`Added ${picked.length} catalog stations near the next three orbits' ground track`);
    },
    _downloadText(text, name, type) {
      try { const blob = new Blob([text], { type }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
      catch (e) { this.hud.toast("Download failed: " + e.message); }
    },
    _download(scn) {
      try {
        const blob = new Blob([JSON.stringify(scn, null, 2)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `coverage-${(scn.title || "scenario").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      } catch (e) { this.hud.toast("Export failed: " + e.message); }
    },
    _import() {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json";
      inp.addEventListener("change", () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        if (f.size > 2e6) { this.hud.toast("File too large for a scenario"); return; }
        f.text().then((txt) => {
          let s; try { s = JSON.parse(txt); } catch (e) { this.hud.toast("Not a JSON file"); return; }
          const v = C.validate(s);
          if (!v.ok) { this.hud.toast("Scenario file has problems: " + v.errors.slice(0, 2).map((e) => `${e.field}: ${e.msg}`).join("; "), 6000); return; }
          this._draft = C.normalize(s); this.hud.showEditor(this._draft, { isEditor: this.isEditor(), satellites: this.satellites || [] }); this.hud.toast("Imported — press RUN to apply");
        });
      });
      inp.click();
    },

    // ---------------------------------------------------------------- input
    _key(e) {
      if (!this.isActive || this.deploy || !this.hud) return;
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { if (e.code === "Escape") { e.target.blur(); if (!this.hud.closeWindows() && this.hud._popId) this.hud.showStationPop(null); } return; }
      if (e.repeat) return;
      const map = { Space: "PLAY", KeyN: "NEXT_EVENT", KeyP: "PIN", KeyK: "PINS", KeyS: "STATIONS", KeyT: "TRACK", KeyR: "REPLAY", KeyZ: "ZOOM", KeyC: "CAM", KeyL: "LOCK", KeyE: "EDIT", Comma: "RATE-", Period: "RATE+" };
      if (e.code === "Escape") {   // closes the topmost thing only
        e.preventDefault();
        if (this.hud.closeWindows()) return;
        if (this.hud._popId) { this.hud.showStationPop(null); return; }
        if (this.picking) { this.picking = false; this.hud.setPickMode(false); this.openEditor(); return; }
        if (this.stationMode) { this.stationMode = false; return; }
        if (this.hud.pinsOpen) { this.hud.togglePins(false); return; }
        this.hud.showCard("Leave?", "<p>Leave this coverage session and return to the title screen?</p>", [["EXIT", "LEAVE SESSION"]]); return;
      }
      if (e.code === "Tab" || e.code === "F3") { e.preventDefault(); if (this.hud.openWin === "cv-data") this.hud.closeWindows(); else this.command("DATA"); return; }
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) { e.preventDefault(); this.command("HELP"); return; }
      if (this.hud.openWin && e.code !== "Space") return;
      if (map[e.code]) { if (tag === "BUTTON" && e.code === "Space") return; e.preventDefault(); e.stopPropagation(); if (this.hud.openWin && e.code === "Space") return; if (window.shuttleSfx) window.shuttleSfx.key(true, e.code); this.command(map[e.code]); }
    },
    _bindPointer() {
      const canvas = this.renderer.domElement, pts = new Map();
      let down = null;   // { x, y, stationId, moved }
      this._on(canvas, "pointerdown", (e) => {
        if (!this.view || this.deploy) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const sid = this.stationMode && this.isEditor() ? this.view.pickStation(e.clientX, e.clientY) : null;
        down = { x: e.clientX, y: e.clientY, stationId: sid, moved: false, ll: null };
        if (sid) canvas.style.cursor = "grabbing";
      });
      this._on(window, "pointerup", async (e) => {
        pts.delete(e.pointerId);
        if (!this.view || this.deploy) { down = null; return; }
        const d = down; down = null; canvas.style.cursor = "";
        if (!d || e.target !== canvas && !d.stationId) return;
        const click = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5;
        if (d.stationId) {
          const st = this.scn.stations.find((x) => x.id === d.stationId);
          if (d.moved && d.ll) { const ll = d.ll; await this._applyStations((sts) => { const x = sts.find((q) => q.id === d.stationId); if (x) { x.lat = +ll.lat.toFixed(3); x.lon = +ll.lon.toFixed(3); } }, `${st.name} moved to ${ll.lat.toFixed(2)}°, ${ll.lon.toFixed(2)}°`); }
          else if (st) this.hud.showStationPop(st, e.clientX, e.clientY, this.isEditor());
          return;
        }
        if (!click) return;
        if (this.picking) {   // legacy "place on globe" from the editor table
          const ll = this.view.pickLatLon(e.clientX, e.clientY); if (!ll) { this.hud.toast("Click on the Earth"); return; }
          this.picking = false; this.hud.setPickMode(false);
          const dr = this._draft; if (!dr) return;
          let n = dr.stations.length + 1; while (dr.stations.some((s2) => s2.name === `Station ${n}`)) n++;
          dr.stations.push({ id: "st-" + Date.now().toString(36), name: `Station ${n}`, lat: +ll.lat.toFixed(2), lon: +ll.lon.toFixed(2), altM: 0, maskDeg: 10, enabled: true, source: "user" });
          this.openEditor(); return;
        }
        if (this.stationMode) {
          if (!this.isEditor()) return;
          const ll = this.view.pickLatLon(e.clientX, e.clientY); if (!ll) return;
          if (this.scn.stations.length >= C.LIMITS.stations) { this.hud.toast(`At most ${C.LIMITS.stations} stations`); return; }
          let n = this.scn.stations.length + 1; while (this.scn.stations.some((s2) => s2.name === `Station ${n}`)) n++;
          const id = "st-" + Date.now().toString(36) + Math.floor(Math.random() * 100);
          const ok = await this._applyStations((sts) => sts.push({ id, name: `Station ${n}`, lat: +ll.lat.toFixed(3), lon: +ll.lon.toFixed(3), altM: 0, maskDeg: 10, enabled: true, source: "user" }), `Station ${n} added at ${ll.lat.toFixed(2)}°, ${ll.lon.toFixed(2)}° — click it to rename or set its minimum elevation`);
          void ok; return;
        }
        // plain click on the track / orbit: pin that moment
        const tp = this.view.pickTime(e.clientX, e.clientY);
        if (tp !== null && this.isEditor()) this._pinAt(tp);
      });
      this._on(window, "pointermove", (e) => {
        if (!this.view) return;
        if (!pts.has(e.pointerId)) {   // hover: inspect any point on the track / orbit
          if (e.target !== canvas || !this.fc) return;
          const tp = this.view.pickTime(e.clientX, e.clientY);
          if (this.stationMode) canvas.style.cursor = this.view.pickStation(e.clientX, e.clientY) ? "grab" : "crosshair";
          if (tp !== null) { this.command("HOVER_T", { t: tp, x: e.clientX, y: e.clientY, from: "globe" }); if (!this.stationMode) canvas.style.cursor = "pointer"; }
          else if (this.hoverT !== null && this._hoverFrom !== "timeline") { this.command("HOVER_T", null); if (!this.stationMode) canvas.style.cursor = ""; }
          return;
        }
        const p = pts.get(e.pointerId);
        if (down && down.stationId) {
          if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
          const ll = this.view.pickLatLon(e.clientX, e.clientY); if (ll) { down.ll = ll; this.view.previewStation(down.stationId, ll.lat, ll.lon); }
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); return;
        }
        if (pts.size === 1) this.view.orbitCamera(-(e.clientX - p.x) * 0.005, (e.clientY - p.y) * 0.004);
        else if (pts.size === 2) { const other = [...pts.entries()].find(([id]) => id !== e.pointerId)[1]; const d0 = Math.hypot(p.x - other.x, p.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y); if (d0 > 0 && d1 > 0) this.view.zoomCamera(d0 / d1); }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      });
      this._on(canvas, "wheel", (e) => { if (!this.view || this.deploy) return; e.preventDefault(); this.view.zoomCamera(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, false);
    },
  };

  // Automated playtests only (?coveragetest=1)
  if (game.testMode) {
    window.__coverageTest = {
      state: () => game.st, scenario: () => game.scn, forecastHash: () => (game.fc ? game.fc.hash : null), simTime: () => game.simTime(),
      query: (t) => (game.fc ? C.query(game.scn, game.prop, game.fc, t === undefined ? game.simTime() : t, 50) : null),
      nextEvent: () => (game.fc ? C.nextEventAfter(game.fc, game.simTime()) : null),
      linesClear: () => (game.view ? game.view.contactLinesClear() : null),
      drawnLines: () => (game.view ? game.view.lines.geometry.drawRange.count / 2 : 0),
      listeners: () => game.listeners.length, active: () => game.isActive, ready: () => game.ready, error: () => game.error,
      compare: () => game._compare, summary: () => (game.fc ? C.summarize(game.scn, game.prop, game.fc) : null),
      command: (c, a) => game.command(c, a), draft: () => game._draft, model: () => (game.view ? game.view.modelStatus : null),
      pins: () => (game.scn ? game.scn.pins : []), stationScreen: () => (game.view ? game.view.stationScreen() : []), trackScreen: (n) => { const v = game.view; if (!v || !v.trackSamples) return []; return v.trackSamples.filter((_, i) => i % (n || 10) === 0).map((s) => { const w = v.earth.localToWorld(new THREE.Vector3(s.ecef[0], s.ecef[2], -s.ecef[1])); const sc = v._screen(w); return { t: s.t, x: sc.x, y: sc.y, vis: sc.ok && v._frontFacing(w) }; }); },
      csv: () => (game.fc ? C.passesCsv(game.scn, game.prop, game.fc) : null),
      deploy: () => (game.deploy ? game.deploy.b : null), deployAssess: () => (game.deploy ? game.deploy.assess : null), deployActive: () => !!game.deploy,
      deployCmd: (c, a) => (game.deploy ? game.deploy.command(c, a) : null), deployReq: (t, p) => game.net.coverageRequest(t, p),
      deployKeys: (codes) => { if (game.deploy) { game.deploy.keys = new Set(codes || []); } }, deployView: () => (game.deploy ? { mode: game.deploy.view.activeMode, iss: game.deploy.view.status.iss, cubesat: game.deploy.view.status.cubesat } : null),
    };
  }
  window.coverageGame = game;
})();
