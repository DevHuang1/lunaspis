/*
 * coverage_hud.js — STS_OS-style display for the CubeSat Contact Coverage mission.
 *
 * Panels: clock (top), IN VIEW NOW (left), NEXT PASSES (right), timeline (bottom) with controls,
 * station labels on the globe, and windows: scenario editor, pins + comparison, hover inspector, station tools, results + A/B,
 * DATA page (text/table alternative to the globe), help/glossary and first-run onboarding.
 * Reads CoverageCore results only; buttons emit semantic commands to coverage_game.js.
 * Wording rule: "in view / available" — never "connected", "linked" or "downlinking".
 */
(function () {
  "use strict";
  const C = window.CoverageCore;
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ok = (x) => typeof x === "number" && isFinite(x);
  const dur = (s, h) => C.fmtDur(s, h);
  const utc = (ms) => (ok(ms) ? new Date(Math.round(ms)).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z") : "—");
  const hhmm = (ms) => (ok(ms) ? new Date(Math.round(ms)).toISOString().slice(11, 19) + "Z" : "—");
  const RATES = [1, 10, 60, 300, 1000];
  const AVAIL_NOTE = "Available = the satellite is above this station's minimum elevation. It does not mean a radio contact is scheduled or would succeed.";

  const CSS = `
  #cov-hud{--ink:#ede8dd;--dim:#8e897f;--line:rgba(237,232,221,.78);--blue:#5cc2ec;--live:#7cf0c0;--rose:#c9576a;--amber:#ffb347;--violet:#b48cff;--void:rgba(0,0,0,.76);
    position:fixed;inset:0;z-index:4000;pointer-events:none;color:var(--ink);font:13px/1.45 "Share Tech Mono",ui-monospace,Menlo,Consolas,monospace;letter-spacing:.02em}
  #cov-hud *{box-sizing:border-box}
  #cov-hud .up{text-transform:uppercase}
  #cov-hud button{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--line);padding:3px 9px;cursor:pointer;border-radius:0;text-transform:uppercase}
  #cov-hud button:hover:not(:disabled),#cov-hud button:focus-visible{background:var(--ink);color:#000;outline:0}
  #cov-hud button:disabled{opacity:.4;cursor:default}
  #cov-hud button.on{background:var(--ink);color:#000}
  #cov-hud input,#cov-hud select{font:inherit;color:var(--ink);background:rgba(0,0,0,.6);border:1px solid var(--line);padding:3px 6px;border-radius:0;min-width:0}
  #cov-hud input:focus,#cov-hud select:focus{outline:1px solid var(--blue);border-color:var(--blue)}
  #cov-hud input[aria-invalid=true]{border-color:var(--rose)}
  #cov-hud .top{position:absolute;left:50%;top:10px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px}
  #cov-hud .tag{display:flex;align-items:stretch;border:1px solid var(--line);background:var(--void);white-space:nowrap}
  #cov-hud .tag b{background:var(--ink);color:#000;font-weight:400;padding:3px 10px}
  #cov-hud .tag span{padding:3px 10px} #cov-hud .tag .r{color:var(--blue)}
  #cov-hud .wbar{width:min(560px,80vw);height:3px;background:rgba(237,232,221,.25);position:relative}
  #cov-hud .wbar i{position:absolute;left:0;top:0;bottom:0;background:var(--blue)}
  #cov-hud .banners{position:absolute;left:50%;top:62px;transform:translateX(-50%);display:flex;flex-direction:column;gap:4px;align-items:center;max-width:92vw}
  #cov-hud .banners div{background:var(--void);border:1px solid var(--amber);color:var(--amber);padding:2px 10px;font-size:12px}
  #cov-hud .banners .info{border-color:var(--dim);color:var(--dim)} #cov-hud .banners .bad{border-color:var(--rose);color:var(--rose)}
  #cov-hud .panel{position:absolute;background:var(--void);border-left:3px solid var(--ink);padding:8px 12px;pointer-events:auto;max-height:calc(100vh - 330px);overflow:auto}
  #cov-hud .panel h3{margin:0 0 6px;font-weight:400;font-size:13px;text-transform:uppercase;display:flex;justify-content:space-between;gap:10px}
  #cov-hud .panel h3 em{font-style:normal;color:var(--dim)}
  #cov-hud .now{left:14px;top:62px;width:min(340px,40vw)}
  #cov-hud .next{right:14px;top:62px;width:min(470px,48vw)}
  #cov-hud table{border-collapse:collapse;width:100%;font-size:12px}
  #cov-hud th{color:var(--dim);font-weight:400;text-align:left;padding:1px 6px 2px 0;white-space:nowrap}
  #cov-hud td{padding:1px 6px 1px 0;white-space:nowrap} #cov-hud td.n{text-align:right} #cov-hud td.nm{max-width:170px;overflow:hidden;text-overflow:ellipsis}
  #cov-hud .live{color:var(--live)} #cov-hud .muted{color:var(--dim)} #cov-hud .bad{color:var(--rose)} #cov-hud .xc{color:var(--amber)} #cov-hud .yc{color:var(--violet)}
  #cov-hud .empty{color:var(--dim);text-transform:none;letter-spacing:0;font-size:12px}
  #cov-hud .labels{position:absolute;inset:0;pointer-events:none}
  #cov-hud .labels span{position:absolute;transform:translate(8px,-50%);font-size:11px;color:var(--ink);text-shadow:0 0 3px #000,0 0 2px #000;white-space:nowrap}
  #cov-hud .labels span.on{color:var(--live)} #cov-hud .labels span.off{color:var(--dim)}
  #cov-hud .labels span.sat{color:#ffd21a}
  #cov-hud .dock{position:absolute;left:14px;right:14px;bottom:10px;background:var(--void);border:1px solid var(--line);pointer-events:auto;display:flex;flex-direction:column}
  #cov-hud .ctl{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:5px 8px;border-bottom:1px solid rgba(237,232,221,.3)}
  #cov-hud .ctl .sep{width:10px} #cov-hud .ctl .who{margin-left:auto;color:var(--dim);font-size:12px}
  #cov-hud .tlwrap{position:relative;display:flex}
  #cov-hud .tlnames{width:150px;flex:none;border-right:1px solid rgba(237,232,221,.3);position:relative;overflow:hidden}
  #cov-hud .tlnames div{position:absolute;left:6px;right:4px;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dim)}
  #cov-hud canvas.tl{flex:1;display:block;cursor:pointer;min-width:0}
  #cov-hud .toast{position:absolute;left:50%;top:92px;transform:translateX(-50%);display:none;background:var(--void);border:1px solid var(--rose);padding:5px 12px;max-width:80vw}
  #cov-hud .hint{position:absolute;right:16px;bottom:calc(var(--dockH,190px) + 16px);color:var(--dim);font-size:11px;text-shadow:0 0 3px #000}
  #cov-hud .win{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(980px,96vw);max-height:92vh;display:none;flex-direction:column;border:1px solid var(--line);background:rgba(0,0,0,.92);pointer-events:auto}
  #cov-hud .win.sm{width:min(620px,94vw)}
  #cov-hud .wh{display:flex;justify-content:space-between;border-bottom:1px solid var(--line)}
  #cov-hud .wh b{background:var(--ink);color:#000;font-weight:400;padding:4px 14px;min-width:30%;text-transform:uppercase}
  #cov-hud .wh span{padding:4px 14px;font-size:13px;color:var(--dim)}
  #cov-hud .wb{overflow:auto;padding:14px 18px;display:flex;flex-direction:column;gap:16px}
  #cov-hud .wf{display:flex;gap:6px;justify-content:flex-end;padding:8px 14px;border-top:1px solid rgba(237,232,221,.3);flex-wrap:wrap}
  #cov-hud .sec{border-left:3px solid var(--ink);padding-left:12px}
  #cov-hud .sec h4{margin:0 0 8px;font-weight:400;font-size:13px;text-transform:uppercase;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
  #cov-hud .sec h4 em{font-style:normal;color:var(--dim);text-transform:none;font-size:12px}
  #cov-hud .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px 18px}
  #cov-hud .fld{display:flex;flex-direction:column;gap:2px;font-size:12px}
  #cov-hud .fld label{color:var(--dim);text-transform:uppercase;font-size:11px}
  #cov-hud .fld .row{display:flex;gap:6px;align-items:center} #cov-hud .fld .row input[type=range]{flex:1}
  #cov-hud .fld input[type=number]{width:92px}
  #cov-hud .fld .err{color:var(--rose);font-size:11px;text-transform:none;letter-spacing:0}
  #cov-hud .fld .note{color:var(--dim);font-size:11px;text-transform:none;letter-spacing:0}
  #cov-hud .seg{display:flex;flex-wrap:wrap} #cov-hud .seg button+button{border-left:0}
  #cov-hud .sttab td input[type=text]{width:100%} #cov-hud .sttab td input[type=number]{width:74px}
  #cov-hud .txt{text-transform:none;letter-spacing:0;font-size:13px;max-width:78ch} #cov-hud .txt p{margin:0 0 8px}
  #cov-hud .kv{display:grid;grid-template-columns:auto 1fr;gap:1px 16px;font-size:12px} #cov-hud .kv .k{color:var(--dim)}
  #cov-hud .diff td.ch{color:var(--amber)} #cov-hud .diff td{white-space:normal;vertical-align:top;max-width:340px} #cov-hud .diff tr.ch td{color:var(--amber)} #cov-hud .better{color:var(--live)} #cov-hud .worse{color:var(--rose)}
  #cov-hud .pick{position:absolute;left:50%;bottom:calc(var(--dockH,190px) + 24px);transform:translateX(-50%);display:none;background:var(--void);border:1px solid var(--blue);color:var(--blue);padding:5px 12px;pointer-events:auto}
  #cov-hud .scrim{position:absolute;inset:0;background:rgba(0,0,0,.35);display:none;pointer-events:auto}
  #cov-hud .legend{position:absolute;right:16px;bottom:calc(var(--dockH,190px) + 34px);font-size:11px;color:var(--dim);background:var(--void);padding:3px 8px;display:flex;gap:8px;align-items:center}
  #cov-hud .legend i{display:inline-block;width:14px;height:3px;margin-right:3px;vertical-align:middle}
  #cov-hud .insp{position:absolute;display:none;background:rgba(0,0,0,.9);border:1px solid var(--line);padding:6px 10px;font-size:12px;pointer-events:none;max-width:340px;z-index:2}
  #cov-hud .insp b{font-weight:400;color:var(--blue)} #cov-hud .insp .t{color:var(--dim)}
  #cov-hud .pins{left:14px;bottom:calc(var(--dockH,190px) + 12px);top:auto;width:min(340px,40vw);max-height:30vh;display:none}
  #cov-hud .pins td button{padding:0 5px}
  #cov-hud .pinlab{position:absolute;transform:translate(-50%,-160%);font-size:11px;color:var(--amber);text-shadow:0 0 3px #000;pointer-events:none}
  #cov-hud .stbar{position:absolute;left:50%;top:124px;transform:translateX(-50%);display:none;background:var(--void);border:1px solid var(--blue);padding:5px 10px;pointer-events:auto;gap:6px;align-items:center;flex-wrap:wrap;max-width:94vw}
  #cov-hud .stbar span{color:var(--blue);font-size:12px}
  #cov-hud .pop{position:absolute;display:none;background:rgba(0,0,0,.94);border:1px solid var(--line);padding:8px 10px;pointer-events:auto;width:270px;z-index:3}
  #cov-hud .pop .fld{margin-bottom:5px} #cov-hud .pop input[type=number]{width:96px}
  #cov-hud textarea{font:inherit;color:var(--ink);background:rgba(0,0,0,.6);border:1px solid var(--line);width:100%;min-height:120px;padding:6px;text-transform:none}
  @media (max-width:900px){#cov-hud .next{display:none} #cov-hud .tlnames{width:90px} #cov-hud .now{width:min(300px,70vw)}}
  @media (max-height:640px){#cov-hud .panel{max-height:30vh}}
  `;

  class CoverageHud {
    constructor(cb) {
      this.cb = cb;
      this.style = document.createElement("style"); this.style.nonce = window.__lunaspisCspNonce || ""; this.style.textContent = CSS; document.head.appendChild(this.style);
      const el = this.el = document.createElement("div"); el.id = "cov-hud";
      el.innerHTML = `
        <div class="top"><div class="tag" id="cv-tag"><b>COVERAGE</b><span id="cv-utc">—</span><span id="cv-met">T+00:00:00</span><span id="cv-orbit">ORBIT 1</span><span class="r" id="cv-rate">II 60×</span></div><div class="wbar" title="Position in the prediction window"><i id="cv-wbar"></i></div></div>
        <div class="banners" id="cv-banners" aria-live="polite"></div>
        <section class="panel now" aria-label="Stations in view now"><h3><span>IN VIEW NOW</span><em id="cv-nowc">0</em></h3><div id="cv-now"></div></section>
        <section class="panel next" aria-label="Next passes"><h3><span>NEXT PASSES</span><em id="cv-nextc"></em></h3><div id="cv-next"></div></section>
        <div class="labels" id="cv-labels"></div>
        <div class="hint" id="cv-hint">SPACE play · N next event · hover the track to inspect · P pin · S stations · TAB data · ? help</div>
        <div class="legend" aria-label="Track colour: number of stations in view"><span>STATIONS IN VIEW</span><span><i style="background:#c9576a"></i>0</span><span><i style="background:#5cc2ec"></i>1</span><span><i style="background:#7cf0c0"></i>2</span><span><i style="background:#ffd21a"></i>3+</span></div>
        <div class="insp" id="cv-insp" role="tooltip"></div>
        <section class="panel pins" id="cv-pins" aria-label="Pins"></section>
        <div class="stbar" id="cv-stbar"><span>STATIONS: click the globe to add · drag a station to move it · click a station to edit</span><button data-s="PASTE">PASTE LIST</button><button data-s="MY_SAVE">SAVE AS MY STATIONS</button><button data-s="MY_LOAD">LOAD MY STATIONS</button><button data-s="TABLE">TABLE</button><button data-s="DONE">DONE [S]</button></div>
        <div class="pop" id="cv-pop" role="dialog" aria-label="Station"></div>
        <div class="pick" id="cv-pick">Click the globe to place the station · ESC cancels</div>
        <div class="dock" id="cv-dock">
          <div class="ctl" id="cv-ctl">
            <button data-c="PLAY" id="cv-play" title="Play / pause [Space]">▶ PLAY</button>
            <span class="seg" id="cv-rates">${RATES.map((r) => `<button data-c="RATE" data-a="${r}" title="Playback ${r}× [, .]">${r}×</button>`).join("")}</span>
            <button data-c="NEXT_EVENT" title="Jump to the next time a station comes into or leaves view [N]">⏭ NEXT EVENT</button>
            <span class="sep"></span>
            <button data-c="PIN" title="Pin the current moment (or click the track / timeline while hovering) [P]"><span class="xc">◆</span> PIN NOW</button>
            <button data-c="PINS" id="cv-pinsbtn" title="Show pins and compare any two [K]">PINS (0)</button>
            <button data-c="STATIONS" id="cv-stbtn" title="Add, move and edit stations on the globe [S]">STATIONS</button>
            <span class="sep"></span>
            <button data-c="REPLAY" title="Replay the identical scenario from the start [R]">↺ REPLAY</button>
            <button data-c="ZOOM" id="cv-zoom" title="Timeline: whole window / ±3 h around now [Z]">TIMELINE: WINDOW</button>
            <button data-c="TRACK" id="cv-track" title="Ground track: ±1 orbit around now / the whole prediction window [T]">TRACK: ±1 ORBIT</button>
            <button data-c="CAM" id="cv-cam" title="Camera: globe / follow / close-up [C]">CAM: GLOBE</button>
            <button data-c="LOCK" id="cv-lock" title="Turn the camera with the Earth so stations stay put [L]">EARTH LOCK: OFF</button>
            <span class="sep"></span>
            <button data-c="EDIT" title="Edit the scenario [E]">EDIT</button>
            <button data-c="RESULTS" title="Results for the prediction window">RESULTS</button>
            <button data-c="DATA" title="Data page and pass table [Tab]">DATA</button>
            <button data-c="HELP" title="Help and glossary [?]">?</button>
            <button type="button" class="ft-help-btn ft-help-btn--sm" data-feature-help="cubesat_coverage" title="Visual Screenshot Tutorial">?</button>
            <button data-c="EXIT" title="Leave the session">EXIT</button>
            <span class="who" id="cv-who"></span>
          </div>
          <div class="tlwrap"><div class="tlnames" id="cv-tlnames"></div><canvas class="tl" id="cv-tl" aria-label="Station timeline: one row per station, bars are passes. Click to move time (editor)." role="img"></canvas></div>
        </div>
        <div class="toast" id="cv-toast" role="status"></div>
        <div class="scrim" id="cv-scrim"></div>
        <div class="win" id="cv-edit" role="dialog" aria-label="Scenario editor"></div>
        <div class="win sm" id="cv-cmp" role="dialog" aria-label="Compare pins"></div>
        <div class="win" id="cv-res" role="dialog" aria-label="Results"></div>
        <div class="win" id="cv-ab" role="dialog" aria-label="A/B comparison"></div>
        <div class="win" id="cv-data" role="dialog" aria-label="Data page"></div>
        <div class="win sm" id="cv-help" role="dialog" aria-label="Help"></div>
        <div class="win sm" id="cv-card" role="dialog" aria-label="Message"></div>`;
      document.body.appendChild(el);
      this.$ = (id) => el.querySelector("#" + id);
      el.querySelector("#cv-ctl").addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (b) this.cb(b.getAttribute("data-c"), b.getAttribute("data-a")); });
      this.tl = this.$("cv-tl"); this.tlZoom = "window";
      this._tlDrag = false;
      const seekFromEvent = (e) => { const r = this.tl.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width; const [a, b] = this._tlRange(); this.cb("SEEK", a + fx * (b - a)); };
      this.tl.addEventListener("pointerdown", (e) => { if (e.shiftKey) { const r = this.tl.getBoundingClientRect(); const [a, b] = this._tlRange(); this.cb("PIN_AT", a + ((e.clientX - r.left) / r.width) * (b - a)); return; } this._tlDrag = true; this.tl.setPointerCapture(e.pointerId); seekFromEvent(e); });
      this.tl.addEventListener("pointermove", (e) => { if (this._tlDrag) seekFromEvent(e); });
      this.tl.addEventListener("pointerup", () => { this._tlDrag = false; });
      this.openWin = null; this._lastSlow = 0; this.labelEls = {};
      this.$("cv-scrim").addEventListener("click", () => this.closeWindows());
      this.$("cv-stbar").addEventListener("click", (e) => { const b = e.target.closest("button[data-s]"); if (b) this.cb("ST_" + b.getAttribute("data-s")); });
      this.tl.addEventListener("mousemove", (e) => { const r = this.tl.getBoundingClientRect(); const [a, b] = this._tlRange(); this.cb("HOVER_T", { t: a + ((e.clientX - r.left) / r.width) * (b - a), x: e.clientX, y: r.top - 8, from: "timeline" }); });
      this.tl.addEventListener("mouseleave", () => this.cb("HOVER_T", null));
    }

    // ------------------------------------------------------------------ scenario-level refresh
    setForecast(scn, prop, fc, info) {
      this.scn = scn; this.prop = prop; this.fc = fc; this.info = info || {};
      this._tlStatic = null;
      const lab = this.$("cv-labels"); lab.innerHTML = ""; this.labelEls = {};
      if (scn) for (const s of scn.stations) { const sp = document.createElement("span"); sp.textContent = s.name.replace(/^Hypothetical site near /, ""); lab.appendChild(sp); this.labelEls[s.id] = sp; }
      const sat = document.createElement("span"); sat.className = "sat"; sat.textContent = scn && scn.mode === "real" ? (scn.orbit.omm.OBJECT_NAME || "SAT") : "CUBESAT"; lab.appendChild(sat); this.satLabel = sat;
      this.$("cv-tag").querySelector("b").textContent = scn ? (scn.mode === "real" ? "COVERAGE.REAL" : "COVERAGE.SANDBOX") : "COVERAGE";
      this._names();
      this._lastSlow = 0;
    }
    _rows() { return this.scn ? this.scn.stations.filter((s) => s.enabled) : []; }
    _rowH() { const n = this._rows().length + 1; return Math.max(4, Math.min(14, Math.floor(150 / Math.max(1, n)))); }
    _names() {
      const box = this.$("cv-tlnames"), rows = this._rows(), h = this._rowH();
      const H = (rows.length + 1) * h + 18;
      this.tl.style.height = H + "px"; box.style.height = H + "px";
      box.innerHTML = "";
      if (h >= 9) rows.forEach((s, i) => { const d = document.createElement("div"); d.style.top = (14 + i * h) + "px"; d.style.lineHeight = h + "px"; d.textContent = s.name.replace(/^Hypothetical site near /, ""); box.appendChild(d); });
      const n = document.createElement("div"); n.style.top = (14 + rows.length * h) + "px"; n.style.lineHeight = h + "px"; n.style.color = "#ede8dd"; n.textContent = "ANY STATION"; box.appendChild(n);
      requestAnimationFrame(() => { const dock = this.$("cv-dock"); if (dock) this.el.style.setProperty("--dockH", dock.offsetHeight + "px"); });
    }
    _tlRange() {
      const H = this.fc ? this.fc.validUntil : 1;
      if (this.tlZoom === "window") return [0, Math.max(1, H)];
      const t = this._t || 0, a = Math.max(0, t - 10800); return [a, Math.min(Math.max(H, a + 1), a + 21600)];
    }

    // ------------------------------------------------------------------ per-frame
    update(t, q, ctx) {
      this._t = t; this.ctx = ctx;
      const prop = this.prop, fc = this.fc, scn = this.scn;
      if (!prop || !fc || !q) return;
      const H = fc.validUntil;
      this.$("cv-utc").textContent = "UTC " + utc(q.utcMs);
      this.$("cv-met").textContent = "T+" + dur(t, true);
      this.$("cv-orbit").textContent = "ORBIT " + q.orbitNo;
      this.$("cv-rate").textContent = (ctx.paused ? "II " : "▶ ") + ctx.rate + "×";
      this.$("cv-wbar").style.width = (100 * Math.min(1, t / Math.max(1, H))) + "%";
      const pb = this.$("cv-play"); pb.textContent = ctx.paused ? "▶ PLAY" : "II PAUSE";
      this.el.querySelectorAll("#cv-rates button").forEach((b) => b.classList.toggle("on", +b.getAttribute("data-a") === ctx.rate));
      this.$("cv-cam").textContent = "CAM: " + ctx.camMode.toUpperCase();
      this.$("cv-lock").textContent = "EARTH LOCK: " + (ctx.earthLock ? "ON" : "OFF"); this.$("cv-lock").disabled = ctx.camMode !== "globe";
      this.$("cv-zoom").textContent = "TIMELINE: " + (this.tlZoom === "window" ? "WINDOW" : "±3 H");
      this.$("cv-who").textContent = ctx.isEditor ? (ctx.players > 1 ? "YOU EDIT · others watch with their own camera" : "") : `${ctx.editorName || "The host"} controls time and the scenario`;
      this.el.querySelectorAll("#cv-ctl button").forEach((b) => { const c = b.getAttribute("data-c"); if (["PLAY", "RATE", "NEXT_EVENT", "PIN", "REPLAY", "STATIONS"].includes(c)) b.disabled = !ctx.isEditor; });
      this.$("cv-pinsbtn").textContent = `PINS (${(ctx.pins || []).length})`; this.$("cv-pinsbtn").classList.toggle("on", this.pinsOpen);
      this.$("cv-stbtn").classList.toggle("on", !!ctx.stationMode); this.$("cv-stbar").style.display = ctx.stationMode ? "flex" : "none";
      this.$("cv-track").textContent = "TRACK: " + (ctx.trackSpan === "window" ? "WHOLE WINDOW" : "±1 ORBIT");
      // banners
      this._banners(ctx);
      // IN VIEW NOW (every frame: time-left counts down)
      const now = this.$("cv-now"); this.$("cv-nowc").textContent = String(q.available.length);
      if (!ctx.ready) now.innerHTML = `<div class="empty">${esc(ctx.error || "Computing passes…")}</div>`;
      else if (!q.valid) now.innerHTML = `<div class="empty bad">Predictions end at T+${dur(H, true)} — ${esc(fc.truncated ? "orbital elements invalid after this time" : "end of the prediction window")}.</div>`;
      else if (q.available.length) {
        now.innerHTML = `<table><tr><th>STATION</th><th>ELEV</th><th>DIST</th><th>TIME LEFT</th></tr>${q.available.map((a) =>
          `<tr><td class="nm live" title="${esc(a.name)}">● ${esc(a.name.replace(/^Hypothetical site near /, ""))}</td><td class="n">${a.elDeg.toFixed(1)}°</td><td class="n">${Math.round(a.rangeKm).toLocaleString("en-US")} km</td><td class="n">${a.clippedEnd ? "≥ " : ""}${dur(a.timeLeft)}</td></tr>`).join("")}</table>`;
      } else {
        const nx = q.next[0];
        now.innerHTML = `<div class="empty">No station in view.<br>${nx ? `Next: <span class="up">${esc(nx.name.replace(/^Hypothetical site near /, ""))}</span> in ${dur(nx.startsIn, true)}` : `None in this prediction window (${esc(C.HORIZONS[scn.horizon].label)}). That does not mean never — try a longer window or another orbit.`}</div>`;
      }
      // NEXT PASSES (4 Hz)
      const wall = performance.now();
      if (wall - this._lastSlow > 250) {
        this._lastSlow = wall;
        const nx = this.$("cv-next"); this.$("cv-nextc").textContent = q.nextCount ? `${q.nextCount} in window` : "";
        nx.innerHTML = q.next.length ? `<table><tr><th>STATION</th><th>STARTS IN</th><th>START</th><th>END</th><th>DUR</th><th>PEAK</th></tr>${q.next.slice(0, 8).map((p) =>
          `<tr><td class="nm" title="${esc(p.name)}">${esc(p.name.replace(/^Hypothetical site near /, ""))}</td><td class="n">${dur(p.startsIn, true)}</td><td>${hhmm(prop.epochMs + p.start * 1000)}</td><td>${p.clippedEnd ? "clipped ►" : hhmm(prop.epochMs + p.end * 1000)}</td><td class="n">${p.clippedEnd ? "≥ " : ""}${dur(p.duration)}</td><td class="n">${p.clippedEnd ? "≥ " : ""}${(p.peakEl * C.R2D).toFixed(0)}°</td></tr>`).join("")}</table>${q.nextCount > 8 ? `<div class="empty">+${q.nextCount - 8} more on the DATA page [Tab]</div>` : ""}`
          : `<div class="empty">No more passes in this prediction window.</div>`;
        if (this.openWin === "cv-cmp") this._renderCompare();
      }
      // labels on the globe
      if (ctx.screen) {
        const av = new Set(q.available.map((a) => a.id));
        for (const s of ctx.screen) {
          const sp = this.labelEls[s.id]; if (!sp) continue;
          const st = scn.stations.find((x) => x.id === s.id);
          sp.style.display = s.vis ? "block" : "none"; sp.style.left = s.x + "px"; sp.style.top = s.y + "px";
          sp.className = !st.enabled ? "off" : av.has(s.id) ? "on" : "";
          sp.textContent = (av.has(s.id) ? "● " : "") + st.name.replace(/^Hypothetical site near /, "") + (st.enabled ? (av.has(s.id) ? " · IN VIEW" : "") : " · OFF");
        }
        this._pinLabels(ctx);
        if (this.satLabel && ctx.sat) { this.satLabel.style.display = ctx.sat.vis && ctx.camMode !== "close" ? "block" : "none"; this.satLabel.style.left = ctx.sat.x + "px"; this.satLabel.style.top = (ctx.sat.y - 14) + "px"; }
      }
      this._drawTimeline(t, ctx);
    }

    _pinLabels(ctx) {
      const box = this.$("cv-labels"); this._pinEls = this._pinEls || {};
      const seen = {};
      for (const ps of ctx.pinScreen || []) {
        const p = (ctx.pins || []).find((x) => x.id === ps.id); if (!p) continue; seen[p.id] = 1;
        let el = this._pinEls[p.id]; if (!el) { el = document.createElement("span"); el.className = "pinlab"; box.appendChild(el); this._pinEls[p.id] = el; }
        el.textContent = "◆ " + p.name; el.style.display = ps.vis ? "block" : "none"; el.style.left = ps.x + "px"; el.style.top = ps.y + "px";
      }
      for (const id of Object.keys(this._pinEls)) if (!seen[id]) { this._pinEls[id].remove(); delete this._pinEls[id]; }
    }
    // ---- hover inspector (any point on the track, orbit ring or timeline)
    showInspector(x, y, info) {
      const el = this.$("cv-insp"); if (!info) { el.style.display = "none"; return; }
      const av = info.available;
      el.innerHTML = `<div><b>${esc(utc(info.utcMs))}</b> <span class="t">T+${dur(info.t, true)} · orbit ${info.orbitNo}</span></div>
        <div class="t">${info.latDeg.toFixed(2)}°, ${info.lonDeg.toFixed(2)}° · ${info.altKm.toFixed(0)} km · orbit position ${info.argLatDeg.toFixed(0)}°</div>
        <div>${av.length ? `<span class="live">${av.length} in view:</span> ${av.map((a) => `${esc(a.name.replace(/^Hypothetical site near /, ""))} ${a.elDeg.toFixed(0)}° el · ${a.azDeg.toFixed(0)}° az · ${Math.round(a.rangeKm)} km`).join("; ")}` : `<span class="bad">No station in view</span>${info.next ? ` · next ${esc(info.next.name.replace(/^Hypothetical site near /, ""))} in ${dur(info.next.startsIn, true)}` : ""}`}</div>
        <div class="t">${info.canPin ? "click to pin this moment" : ""}</div>`;
      el.style.display = "block";
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, x + 14)) + "px";
      el.style.top = Math.max(6, Math.min(window.innerHeight - h - 6, y - h - 10)) + "px";
    }
    // ---- pins panel
    togglePins(on) { this.pinsOpen = on === undefined ? !this.pinsOpen : on; this._pinsKey = null; this.renderPins(this._lastPins || [], this._pinSel, this._lastPinInfo); }
    renderPins(pins, sel, info) {
      this._lastPins = pins; this._pinSel = sel || this._pinSel || []; if (info) this._lastPinInfo = info; info = info || this._lastPinInfo;
      const el = this.$("cv-pins"); el.style.display = this.pinsOpen ? "block" : "none"; if (!this.pinsOpen) { this._pinsKey = null; return; }
      const canEdit = this.ctx && this.ctx.isEditor;
      const key = JSON.stringify([pins, this._pinSel, canEdit, info]);   // re-render only on change (keeps clicks on the checkboxes)
      if (key === this._pinsKey) return; this._pinsKey = key;
      el.innerHTML = `<h3><span>PINS</span><em>${pins.length} / ${C.LIMITS.pins}</em></h3>${pins.length ? `<table><tr><th></th><th>PIN</th><th>TIME</th><th>ORBIT</th><th>IN VIEW</th><th></th></tr>${pins.map((p) => { const i = info && info[p.id]; return `<tr>
        <td><input type="checkbox" data-sel="${esc(p.id)}" ${this._pinSel.includes(p.id) ? "checked" : ""} aria-label="Select ${esc(p.name)} to compare"></td><td class="xc">◆ ${esc(p.name)}</td><td>${i ? hhmm(i.utcMs) : ""}</td><td class="n">${i ? i.orbitNo : ""}</td><td class="n">${i ? i.count : ""}</td>
        <td><button data-go="${esc(p.id)}" ${canEdit ? "" : "disabled"} title="Move time to this pin">GO</button>${canEdit ? ` <button data-del="${esc(p.id)}" title="Delete pin">✕</button>` : ""}</td></tr>`; }).join("")}</table>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><button data-cmp ${this._pinSel.length === 2 ? "" : "disabled"}>COMPARE SELECTED (${this._pinSel.length}/2)</button>${canEdit ? `<button data-clear>CLEAR ALL</button>` : ""}</div>`
        : `<div class="empty">No pins yet. Hover the ground track, orbit or timeline and click to pin a moment, or press P to pin now. Pin as many as you like, then tick two to compare.</div>`}`;
      el.querySelectorAll("[data-sel]").forEach((c) => c.addEventListener("change", () => { const id = c.getAttribute("data-sel"); this._pinSel = c.checked ? [...this._pinSel.filter((x) => x !== id), id].slice(-2) : this._pinSel.filter((x) => x !== id); this.renderPins(this._lastPins, this._pinSel, info); }));
      el.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => this.cb("PIN_GO", b.getAttribute("data-go"))));
      el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { this._pinSel = this._pinSel.filter((x) => x !== b.getAttribute("data-del")); this.cb("PIN_DEL", b.getAttribute("data-del")); }));
      const cmp = el.querySelector("[data-cmp]"); if (cmp) cmp.addEventListener("click", () => this.cb("PIN_COMPARE", this._pinSel.slice()));
      const clr = el.querySelector("[data-clear]"); if (clr) clr.addEventListener("click", () => { this._pinSel = []; this.cb("PIN_CLEAR"); });
    }
    // ---- station popover (STATIONS mode)
    showStationPop(st, x, y, canEdit) {
      const el = this.$("cv-pop"); if (!st) { el.style.display = "none"; this._popId = null; return; }
      this._popId = st.id;
      const ro = canEdit ? "" : "disabled";
      el.innerHTML = `<div class="fld"><label>Name</label><input type="text" id="cv-pop-name" value="${esc(st.name)}" maxlength="32" ${ro}></div>
        <div style="display:flex;gap:8px"><div class="fld"><label>Lat °</label><input type="number" id="cv-pop-lat" step="0.01" min="-90" max="90" value="${esc(st.lat)}" ${ro}></div><div class="fld"><label>Lon °</label><input type="number" id="cv-pop-lon" step="0.01" min="-180" max="180" value="${esc(st.lon)}" ${ro}></div></div>
        <div style="display:flex;gap:8px;align-items:end"><div class="fld"><label>Min elevation °</label><input type="number" id="cv-pop-mask" step="1" min="0" max="60" value="${esc(st.maskDeg)}" ${ro}></div><label class="fld" style="flex-direction:row;gap:4px;align-items:center"><input type="checkbox" id="cv-pop-en" ${st.enabled ? "checked" : ""} ${ro}> enabled</label></div>
        <div class="fld"><span class="note">${esc(st.source || "")}</span><span class="err" id="cv-pop-err"></span></div>
        <div style="display:flex;gap:6px;justify-content:flex-end">${canEdit ? `<button data-p="DEL">DELETE</button><button data-p="APPLY">APPLY</button>` : ""}<button data-p="CLOSE">CLOSE</button></div>`;
      el.style.display = "block";
      el.style.left = Math.max(6, Math.min(window.innerWidth - 280, x + 14)) + "px"; el.style.top = Math.max(60, Math.min(window.innerHeight - 260, y - 40)) + "px";
      el.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
        const a = b.getAttribute("data-p");
        if (a === "CLOSE") return this.showStationPop(null);
        if (a === "DEL") return this.cb("ST_DELETE", st.id);
        const v = (id) => el.querySelector("#" + id);
        this.cb("ST_UPDATE", { id: st.id, name: v("cv-pop-name").value.trim(), lat: +v("cv-pop-lat").value, lon: +v("cv-pop-lon").value, maskDeg: +v("cv-pop-mask").value, enabled: v("cv-pop-en").checked });
      }));
      const f = el.querySelector("input"); if (f && canEdit) setTimeout(() => f.focus(), 0);
    }
    stationPopError(msg) { const e = this.$("cv-pop-err"); if (e) e.textContent = msg || ""; }
    showPaste(canEdit) {
      const w = this._win("cv-card", "Paste stations", "One per line: name, latitude, longitude[, min elevation]", `<div class="txt"><p>Copy rows from a spreadsheet or type them. Comma, tab or semicolon separated. Lines starting with # are ignored. Without a name, the coordinates become the name. Default minimum elevation: 10°.</p></div><textarea id="cv-paste" spellcheck="false" placeholder="Home station, 16.84, 96.17, 10&#10;Partner uni, 35.68, 139.69&#10;-33.92, 18.42, 15"></textarea><div class="err" id="cv-paste-err" style="color:var(--rose);font-size:12px"></div>`,
        canEdit ? `<button data-a="ST_PASTE_ADD">ADD STATIONS</button>` : "");
      w.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => this.cb(b.getAttribute("data-a"), (this.$("cv-paste") || {}).value || "")));
    }
    pasteError(msg) { const e = this.$("cv-paste-err"); if (e) e.textContent = msg; }

    _banners(ctx) {
      const out = [];
      if (ctx.dataAge) { const a = ctx.dataAge; if (a.tier !== "fresh") out.push([a.tier === "blocked" ? "bad" : "", `Orbital elements ${a.days.toFixed(1)} days old — ${a.note}`]); }
      if (ctx.dataBanner) out.push(["info", ctx.dataBanner]);
      if (this.scn && this.scn.derivedFrom) out.push([this.scn.edited ? "" : "info", this.scn.edited ? `Hypothetical (edited) — based on ${this.scn.derivedFrom.name}` : `Approximate circular orbit based on ${this.scn.derivedFrom.name}`]);
      if (ctx.desync) out.push(["bad", "Players' results differ (desync) — DATA page → resync"]);
      if (ctx.atEnd) out.push(["info", "End of the prediction window — open RESULTS, REPLAY or EDIT to extend"]);
      const key = JSON.stringify(out); if (key === this._bkey) return; this._bkey = key;
      this.$("cv-banners").innerHTML = out.map(([c, m]) => `<div class="${c}">${esc(m)}</div>`).join("");
    }

    _drawTimeline(t, ctx) {
      const cv = this.tl, dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(50, cv.clientWidth), Hh = Math.max(20, cv.clientHeight);
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); this._tlStatic = null; }
      const [a, b] = this._tlRange(), key = `${a.toFixed(0)}|${b.toFixed(0)}|${W}|${Hh}|${this.fc.hash}`;
      const x = (s) => ((s - a) / (b - a)) * W, rows = this._rows(), h = this._rowH(), top = 14;
      if (this._tlStatic !== key) {
        this._tlStatic = key;
        const off = this._off || (this._off = document.createElement("canvas")); off.width = cv.width; off.height = cv.height;
        const g = off.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
        g.font = "10px 'Share Tech Mono', monospace"; g.fillStyle = "#8e897f";
        // hour ticks
        const span = b - a, step = span > 43200 ? 7200 : span > 10800 ? 3600 : 1800;
        for (let s = Math.ceil(a / step) * step; s <= b; s += step) { g.fillStyle = "rgba(237,232,221,.18)"; g.fillRect(x(s), top, 1, Hh - top); g.fillStyle = "#8e897f"; g.fillText(hhmm(this.prop.epochMs + s * 1000).slice(0, 5), x(s) + 2, 10); }
        // ascending equator crossings (orbit starts)
        g.fillStyle = "rgba(92,194,236,.55)"; for (const n of this.fc.ascNodes || []) if (n >= a && n <= b) g.fillRect(x(n), top - 4, 1, 4);
        rows.forEach((s, i) => {
          const y = top + i * h; g.fillStyle = i % 2 ? "rgba(237,232,221,.04)" : "rgba(237,232,221,.08)"; g.fillRect(0, y, W, h);
          g.fillStyle = "#7cf0c0";
          for (const p of this.fc.passes[s.id] || []) { if (p.end < a || p.start > b) continue; const x0 = x(p.start), x1 = Math.max(x0 + 1.5, x(p.end)); g.fillRect(x0, y + 1, x1 - x0, Math.max(2, h - 2)); }
        });
        const yN = top + rows.length * h; g.fillStyle = "rgba(201,87,106,.35)"; g.fillRect(0, yN, W, h);   // gaps show as rose
        g.fillStyle = "#ede8dd"; for (const iv of this.fc.network) { if (iv.end < a || iv.start > b) continue; const x0 = x(iv.start); g.fillRect(x0, yN + 1, Math.max(1.5, x(iv.end) - x0), Math.max(2, h - 2)); }
      }
      const g = cv.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(this._off, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mk = (s, color, label) => { if (s === null || s === undefined || s < a || s > b) return; g.fillStyle = color; g.fillRect(x(s) - 0.5, top - 2, 2, Hh - top + 2); g.font = "10px 'Share Tech Mono', monospace"; g.fillText(label, Math.min(W - 60, x(s) + 3), Hh - 3); };
      for (const p of ctx.pins || []) mk(p.t, "#ffb347", p.name);
      if (ctx.hoverT !== null && ctx.hoverT !== undefined && ctx.hoverT >= a && ctx.hoverT <= b) { g.fillStyle = "rgba(255,255,255,.6)"; g.fillRect(x(ctx.hoverT), top - 2, 1, Hh - top + 2); }
      if (t >= a && t <= b) { g.fillStyle = "#ffd21a"; g.fillRect(x(t) - 1, 0, 2, Hh); g.beginPath(); g.moveTo(x(t) - 5, 0); g.lineTo(x(t) + 5, 0); g.lineTo(x(t), 6); g.fill(); }
    }

    // ------------------------------------------------------------------ windows
    _win(id, title, sub, body, foot) {
      this.closeWindows(true);
      const w = this.$(id);
      w.innerHTML = `<div class="wh"><b>${esc(title)}</b><span>${esc(sub || "")}</span></div><div class="wb">${body}</div><div class="wf">${foot || ""}<button data-close>CLOSE [ESC]</button></div>`;
      w.style.display = "flex"; this.openWin = id; this.$("cv-scrim").style.display = "block";
      w.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => this.closeWindows()));
      const f = w.querySelector("input,select,button"); if (f) setTimeout(() => f.focus(), 0);
      return w;
    }
    closeWindows(silent) {
      for (const id of ["cv-edit", "cv-cmp", "cv-res", "cv-ab", "cv-data", "cv-help", "cv-card"]) this.$(id).style.display = "none";
      const was = this.openWin; this.openWin = null; this.$("cv-scrim").style.display = "none";
      if (!silent && was === "cv-edit" && this.cb) this.cb("EDIT_CLOSED");
      return !!was;
    }
    toast(msg, ms) {
      const t = this.$("cv-toast"); t.textContent = msg; t.style.display = "block";
      clearTimeout(this._tt); this._tt = setTimeout(() => { t.style.display = "none"; }, ms || 3500);
    }
    setPickMode(on) { this.$("cv-pick").style.display = on ? "block" : "none"; }
    toggleZoom() { this.tlZoom = this.tlZoom === "window" ? "near" : "window"; this._tlStatic = null; }

    // ---- compare two pins
    showCompare(cmp) { this._cmpData = cmp; this._win("cv-cmp", "Compare pins", "What changed between two moments", "", ""); this._renderCompare(); }
    _renderCompare() {
      const w = this.$("cv-cmp"), body = w.querySelector(".wb"), cmp = (this.ctx && this.ctx.compare) || this._cmpData;
      if (!cmp || !cmp.a || !cmp.b) { body.innerHTML = `<div class="txt"><p>Pin two moments (hover the track or timeline and click, or press P), open PINS, tick two and press COMPARE.</p><p>A pin remembers the time, the orbit number and the position along the orbit, so the same orbit position on orbit 1 and orbit 2 are different pins.</p></div>`; return; }
      const snap = (s, lab) => `<div class="sec"><h4><span class="xc">◆ ${esc(lab)}</span><em>${esc(s.utc)} · T+${dur(s.t, true)} · orbit ${s.orbitNo} · orbit position ${s.argLatDeg.toFixed(1)}°</em></h4>
        <div class="kv"><span class="k">Position</span><span>${s.latDeg.toFixed(2)}°, ${s.lonDeg.toFixed(2)}° · ${s.altKm.toFixed(0)} km</span><span class="k">In view (${s.available.length})</span><span>${s.available.length ? s.available.map((a) => `${esc(a.name.replace(/^Hypothetical site near /, ""))} (${a.elDeg.toFixed(1)}° el, ${a.azDeg.toFixed(0)}° az, ${Math.round(a.rangeKm)} km)`).join(", ") : "none"}</span>
        ${s.available.length ? "" : `<span class="k">Next</span><span>${s.next ? `${esc(s.next.name.replace(/^Hypothetical site near /, ""))} in ${dur(s.next.startsIn, true)}` : "none in this window"}</span>`}</div></div>`;
      const list = (arr) => arr.length ? arr.map((a) => esc(a.name.replace(/^Hypothetical site near /, ""))).join(", ") : "—";
      const d = cmp.diff;
      body.innerHTML = snap(cmp.a, cmp.aName) + snap(cmp.b, cmp.bName) + `<div class="sec"><h4>${esc(cmp.aName)} → ${esc(cmp.bName)}<em>${dur(Math.abs(cmp.b.t - cmp.a.t), true)} apart · ${(Math.abs(cmp.b.t - cmp.a.t) / this.prop.period).toFixed(2)} orbits</em></h4>
        <table><tr><td class="muted">Retained (in view at both)</td><td class="n">${d.retained.length}</td><td>${list(d.retained)}</td></tr>
        <tr><td class="muted">Lost (only at ${esc(cmp.aName)})</td><td class="n">${d.lost.length}</td><td>${list(d.lost)}</td></tr>
        <tr><td class="muted">New (only at ${esc(cmp.bName)})</td><td class="n">${d.gained.length}</td><td>${list(d.gained)}</td></tr>
        <tr><td class="muted">Came and went in between</td><td class="n">${d.between.length}</td><td>${d.between.length ? d.between.map((p) => `${esc(p.name.replace(/^Hypothetical site near /, ""))} ${hhmm(this.prop.epochMs + p.start * 1000)}–${hhmm(this.prop.epochMs + p.end * 1000)}`).join(", ") : "—"}</td></tr></table></div>`
        + (cmp.returnA ? `<div class="sec"><h4>Back at ${esc(cmp.aName)}'s orbit position</h4><div class="txt"><p>${cmp.returnA.t === null ? "Not found within three orbits." : `next at ${utc(this.prop.epochMs + cmp.returnA.t * 1000)} (T+${dur(cmp.returnA.t, true)})${cmp.returnA.exact ? "" : " — estimated: the real orbit slowly drifts"}.`} The Earth will have turned underneath, so the stations in view are usually different — that is a new pass, not a repeat.</p></div></div>` : "");
    }

    // ---- results
    showResults(sum, scn, prop, saved) {
      const lg = sum.longestGap;
      const per = sum.perStation.slice().sort((a, b) => b.contactS - a.contactS);
      const pd = (x) => (ok(x) ? x.toFixed(1) : "—");
      const body = `<div class="sec"><h4>Prediction window<em>${esc(C.HORIZONS[scn.horizon].label)} from ${esc(scn.epochUtc)}${sum.truncated ? " — truncated (elements invalid after T+" + dur(sum.windowS, true) + ")" : ""}</em></h4>
        <div class="grid"><div class="kv"><span class="k">Stations reached</span><span>${sum.uniqueStations} of ${sum.enabledStations} enabled</span>
        <span class="k">Passes</span><span>${sum.passCount}</span>
        <span class="k">Network coverage</span><span>${sum.coveragePct.toFixed(1)} % (at least one station in view)</span>
        <span class="k">Time with a station in view</span><span>${dur(sum.unionS, true)} (overlaps counted once)</span></div>
        <div class="kv"><span class="k">Total blackout</span><span>${dur(sum.blackoutS, true)}</span>
        <span class="k">Longest blackout</span><span>${lg ? `${lg.clipped ? "≥ " : ""}${dur(lg.duration, true)} (${hhmm(prop.epochMs + lg.start * 1000)}–${hhmm(prop.epochMs + lg.end * 1000)})` : "—"}</span>
        <span class="k">Most stations at once</span><span>${sum.peakSimul.count}${sum.peakSimul.t !== null ? " at " + hhmm(prop.epochMs + sum.peakSimul.t * 1000) : ""}</span>
        <span class="k">Orbit period</span><span>${(sum.periodS / 60).toFixed(2)} min${sum.periodExact ? "" : " (≈ from published mean motion)"}</span></div></div></div>
        <div class="sec"><h4>Per station<em>rates per day over this window · useful pass = peak at least <input type="number" id="cv-useful" min="0" max="90" step="5" value="${sum.usefulElDeg}" style="width:56px" aria-label="Useful pass elevation"> °</em></h4>
        <table><tr><th>STATION</th><th>MIN EL</th><th>PASSES</th><th>PER DAY</th><th>CONTACT / DAY</th><th>USEFUL</th><th>AVG PASS</th><th>LONGEST GAP</th><th>AVG GAP</th><th>BEST PEAK</th></tr>
        ${per.map((p) => `<tr><td class="nm" title="${esc(p.name)}">${esc(p.name.replace(/^Hypothetical site near /, ""))}</td><td class="n">${p.maskDeg}°</td><td class="n">${p.passes}</td><td class="n">${pd(p.passesPerDay)}</td><td class="n">${pd(p.contactMinPerDay)} min</td><td class="n">${p.usefulPasses}</td><td class="n">${p.meanPassS === null ? "—" : dur(p.meanPassS)}</td><td class="n">${p.longestGapS === null ? "—" : dur(p.longestGapS, true)}</td><td class="n">${p.meanGapS === null ? "—" : dur(p.meanGapS, true)}</td><td class="n">${p.maxEl === null ? "never in view" : p.maxEl.toFixed(0) + "°"}</td></tr>`).join("")}
        <tr><td class="up">ANY STATION</td><td></td><td class="n">${sum.passCount}</td><td class="n">${pd(sum.contactsPerDay)} contacts</td><td class="n">${pd(sum.contactMinPerDay)} min</td><td></td><td></td><td class="n">${lg ? (lg.clipped ? "≥ " : "") + dur(lg.duration, true) : "—"}</td><td class="n">${sum.meanGapS === null ? "—" : dur(sum.meanGapS, true)}</td><td></td></tr></table>
        <div class="empty" style="margin-top:4px">Gaps are measured between passes inside the window; the "any station" longest gap includes the window edges (marked ≥).</div></div>
        <div class="sec"><h4>What this means</h4><div class="txt"><p>${esc(AVAIL_NOTE)}</p><p>Results only cover this prediction window. A station with no pass here may still be reached later.</p></div></div>`;
      const foot = `<span class="muted" style="margin-right:auto;align-self:center">${saved.A ? "A saved" : "A empty"} · ${saved.B ? "B saved" : "B empty"}</span><button data-a="SAVE_A">SAVE AS A</button><button data-a="SAVE_B">SAVE AS B</button><button data-a="AB" ${saved.A && saved.B ? "" : "disabled"}>COMPARE A / B</button><button data-a="CSV">EXPORT PASS SCHEDULE (CSV)</button><button data-a="EXPORT">EXPORT SCENARIO</button>`;
      const w = this._win("cv-res", "Results", scn.mode === "real" ? "Real satellite" : "Sandbox", body, foot);
      w.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => this.cb(b.getAttribute("data-a"))));
      const u = w.querySelector("#cv-useful"); if (u) u.addEventListener("change", () => this.cb("USEFUL_EL", +u.value));
    }
    showAB(ab, A, B) {
      const row = (r) => `<tr class="${r.changed ? "ch" : ""}"><td class="muted">${esc(r.label)}</td><td>${esc(r.a)}</td><td>${esc(r.b)}</td><td>${r.changed ? "changed" : ""}</td></tr>`;
      const res = (r) => `<tr><td class="muted">${esc(r.label)}</td><td class="n">${esc(r.a)}</td><td class="n">${esc(r.b)}</td><td class="${r.dir === "better" ? "better" : r.dir === "worse" ? "worse" : ""}">${r.arrow} ${r.dir === "info" ? "" : r.dir}</td></tr>`;
      const body = `${ab.windowsDiffer ? `<div class="banners" style="position:static;transform:none"><div>The two runs used different prediction windows (A ${dur(ab.windowA, true)}, B ${dur(ab.windowB, true)}). Percentages compare; totals do not.</div></div>` : ""}
        <div class="sec"><h4>Settings<em>A saved ${esc(A.savedAt)} · B saved ${esc(B.savedAt)}</em></h4><table class="diff"><tr><th></th><th>A</th><th>B</th><th></th></tr>${ab.settings.map(row).join("")}</table></div>
        <div class="sec"><h4>Results</h4><table><tr><th></th><th>A</th><th>B</th><th>B vs A</th></tr>${ab.results.map(res).join("")}</table></div>`;
      this._win("cv-ab", "A / B comparison", "Same questions, two scenarios", body, "");
    }

    // ---- DATA page (text / table alternative to the globe)
    showData(q, extra) {
      const scn = this.scn, prop = this.prop, fc = this.fc; if (!fc) return;
      const all = []; for (const s of scn.stations) for (const p of fc.passes[s.id] || []) all.push({ ...p, name: s.name });
      all.sort((a, b) => a.start - b.start);
      const o = scn.orbit, src = o.type === "omm" ? o.source : null;
      const body = `<div class="grid">
        <div class="sec"><h4>Satellite now</h4><div class="kv"><span class="k">UTC</span><span>${utc(q.utcMs)}</span><span class="k">Orbit</span><span>${q.orbitNo}</span>
          <span class="k">Orbit position</span><span>${q.argLatDeg.toFixed(1)}° from the northbound equator crossing</span><span class="k">Lat / lon</span><span>${q.latDeg.toFixed(2)}°, ${q.lonDeg.toFixed(2)}°</span>
          <span class="k">Altitude</span><span>${q.altKm.toFixed(1)} km</span><span class="k">Period</span><span>${(prop.period / 60).toFixed(2)} min${prop.exactPeriod ? "" : " (≈ published mean motion)"}</span>
          <span class="k">Inclination</span><span>${(prop.incRad * C.R2D).toFixed(2)}°</span></div></div>
        <div class="sec"><h4>Model</h4><div class="txt"><p>${o.type === "circular" ? "Ideal circular orbit, spherical Earth (6 371 km), no drag or orbit drift. The orbit is placed relative to the Earth at the start time, so changing only the date shifts clock times." : "SGP4 propagation (satellite.js) of published CelesTrak GP elements. Stations on the WGS84 ellipsoid. Earth rotation from UTC (GMST, UT1 ≈ UTC)."}</p><p>${esc(AVAIL_NOTE)}</p></div></div>
        ${src ? `<div class="sec"><h4>Data source</h4><div class="kv"><span class="k">Source</span><span>${esc(src.name)}</span><span class="k">Catalog #</span><span>${esc(o.omm.NORAD_CAT_ID)}</span><span class="k">Element epoch</span><span>${esc(C.isoUtc(C.ommEpochMs(o.omm)))}</span><span class="k">Fetched</span><span>${esc(src.fetchedAt || "—")}</span><span class="k">Snapshot</span><span>${esc(src.snapshot || "")}</span></div></div>` : ""}
        <div class="sec"><h4>Session</h4><div class="kv"><span class="k">Forecast hash</span><span>${esc(fc.hash)}</span><span class="k">Revision</span><span>${esc(extra.revision)}</span><span class="k">Editor</span><span>${esc(extra.editorName || "—")}</span><span class="k">CubeSat model</span><span>${esc(extra.model)}</span></div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${extra.desync ? `<button data-a="RESYNC">RESYNC</button>` : ""}${extra.handover ? extra.handover.map((p) => `<button data-a="HANDOVER" data-p="${esc(p.id)}">LET ${esc(p.name)} EDIT</button>`).join("") : ""}</div></div>
      </div>
      <div class="sec"><h4>All passes in the window<em>${all.length} passes · sorted by start</em></h4><table><tr><th>STATION</th><th>START (UTC)</th><th>END (UTC)</th><th>DURATION</th><th>PEAK</th><th>PEAK AT</th><th>AZ RISE → SET</th><th></th></tr>
        ${all.map((p) => `<tr><td class="nm" title="${esc(p.name)}">${esc(p.name)}</td><td>${utc(prop.epochMs + p.start * 1000)}</td><td>${utc(prop.epochMs + p.end * 1000)}</td><td class="n">${p.clippedStart || p.clippedEnd ? "≥ " : ""}${dur(p.duration)}</td><td class="n">${(p.peakEl * C.R2D).toFixed(1)}°</td><td>${hhmm(prop.epochMs + p.peakT * 1000)}</td><td class="n">${(p.azStart * C.R2D).toFixed(0)}° → ${(p.azEnd * C.R2D).toFixed(0)}°</td><td class="muted">${p.clippedStart ? "◄ clipped " : ""}${p.clippedEnd ? "clipped ►" : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="empty">No passes in this window.</td></tr>`}</table></div>
      <div class="sec"><h4>Coverage gaps</h4><table><tr><th>FROM</th><th>TO</th><th>LENGTH</th></tr>${fc.gaps.map((g) => `<tr><td>${utc(prop.epochMs + g.start * 1000)}</td><td>${utc(prop.epochMs + g.end * 1000)}</td><td class="n">${g.clipped ? "≥ " : ""}${dur(g.duration, true)}</td></tr>`).join("")}</table></div>`;
      const w = this._win("cv-data", "Data", "Text and table view of everything on the globe", body, "");
      w.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => this.cb(b.getAttribute("data-a"), b.getAttribute("data-p"))));
    }

    showHelp() {
      const k = [["SPACE", "play / pause"], [", / .", "slower / faster"], ["N", "jump to the next event (a station comes into or leaves view)"], ["HOVER", "inspect any point on the ground track, orbit or timeline"], ["CLICK / P", "pin that moment / pin now (shift-click the timeline)"], ["K", "pins panel — tick two to compare"], ["S", "stations mode: click the globe to add, drag to move, click to edit"], ["T", "ground track: ±1 orbit / whole window"], ["R", "replay from the start"], ["Z", "timeline zoom"], ["C", "camera: globe / follow / close-up"], ["L", "Earth lock (globe camera)"], ["E", "edit the scenario"], ["TAB / F3", "data page"], ["DRAG / WHEEL", "look around / zoom"], ["ESC", "close a window"]];
      const body = `<div class="sec"><h4>What you are looking at</h4><div class="txt">
        <p>A CubeSat circles the Earth while the Earth turns underneath it. A ground station can only see the satellite while it is above that station's <b>minimum elevation</b> — the lowest angle above the horizon the station uses.</p>
        <p>The track is coloured by how many of your stations can see the satellite at each point: rose = none, blue = 1, green = 2, yellow = 3 or more.</p>
        <p><b>Pass</b>: one stretch of time a station has the satellite in view. <b>Blackout</b>: time with no station in view. <b>Coverage</b>: the share of time at least one station has it in view (overlapping stations count once).</p>
        <p><b>Orbit / revolution</b>: one trip around the Earth. Coming back to the same orbit position does not mean coming back over the same place: the Earth has turned about 24° in the meantime.</p>
        <p>${esc(AVAIL_NOTE)}</p></div></div>
        <div class="sec"><h4>Keys</h4><div class="kv">${k.map(([a, b]) => `<span class="k">${a}</span><span>${b}</span>`).join("")}</div></div>`;
      this._win("cv-help", "Help", "Glossary and keys", body, `<button data-a="ONBOARD">SHOW THE INTRO AGAIN</button>`).querySelector("[data-a]").addEventListener("click", () => this.cb("ONBOARD"));
    }

    showCard(title, html, buttons) {
      const w = this._win("cv-card", title, "", `<div class="txt">${html}</div>`, (buttons || []).map((b) => `<button data-a="${esc(b[0])}">${esc(b[1])}</button>`).join(""));
      w.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => this.cb(b.getAttribute("data-a"))));
    }
    showOnboarding(step) {
      const steps = [
        ["1 / 3 · The question", `<p>Your CubeSat is already in orbit. Down on Earth, your ground stations wait for it. Find out <b>when each station can see it, for how long, and how long you go without contact</b> — then try other stations and orbits.</p><p>${esc(AVAIL_NOTE)}</p>`],
        ["2 / 3 · Watch and jump", `<p>Press <b>SPACE</b> to play. Green lines join the satellite to every station that has it in view. The list on the left shows them with elevation, distance and time left; the table on the right shows what comes next.</p><p>Press <b>N</b> to jump straight to the next event. The timeline at the bottom has one row per station; the bottom row shows when <i>any</i> station can see it.</p>`],
        ["3 / 3 · Your stations, any moment", `<p>Press <b>S</b> and click the globe to put your own ground stations anywhere (drag to move, click to edit), or paste a list. The track colour shows how many of them see the satellite at every point.</p><p>Hover the track or timeline to inspect any moment, click to pin it, and compare pins. <b>RESULTS</b> gives passes and contact minutes per day, gaps, and a CSV pass schedule; <b>SAVE AS A / B</b> compares scenarios.</p>`],
      ];
      const [t, h] = steps[step];
      this.showCard(t, h, step < 2 ? [["ONBOARD_SKIP", "SKIP"], ["ONBOARD_NEXT", "NEXT"]] : [["ONBOARD_DONE", "START"]]);
    }

    // ---- scenario editor
    showEditor(draft, env) {
      this.draft = draft; this.env = env;
      const w = this._win("cv-edit", "Scenario", env.isEditor ? "Changes apply when you press RUN" : "Read only — the editor changes the scenario", `<div id="cv-ed-body"></div>`,
        `<span class="muted" id="cv-ed-msg" style="margin-right:auto;align-self:center"></span><button data-a="ED_SAVE">SAVE…</button><button data-a="ED_LOAD">LOAD…</button><button data-a="ED_EXPORT">EXPORT JSON</button><button data-a="ED_IMPORT">IMPORT JSON</button><button data-a="ED_RESET">DEFAULTS</button><button data-a="ED_RUN" id="cv-ed-run">RUN</button>`);
      w.querySelectorAll(".wf [data-a]").forEach((b) => b.addEventListener("click", () => this._edAction(b.getAttribute("data-a"))));
      this._renderEditor();
    }
    _edAction(a) {
      if (a === "ED_RUN") { this.cb("APPLY_SCENARIO", JSON.parse(JSON.stringify(this.draft))); return; }
      this.cb(a, this.draft);
    }
    _fld(id, label, html, err, note) { return `<div class="fld"><label for="${id}">${label}</label>${html}${err ? `<span class="err" id="${id}-err">${esc(err)}</span>` : ""}${note ? `<span class="note">${note}</span>` : ""}</div>`; }
    _renderEditor() {
      const d = this.draft, env = this.env, box = this.$("cv-ed-body"); if (!box) return;
      const v = C.validate(d), errs = {}; v.errors.forEach((e) => { if (!errs[e.field]) errs[e.field] = e.msg; });
      const ro = env.isEditor ? "" : "disabled";
      const num = (id, path, val, min, max, step, unit) => `<div class="row"><input type="range" id="${id}-r" data-p="${path}" min="${min}" max="${max}" step="${step}" value="${esc(val)}" ${ro}><input type="number" id="${id}" data-p="${path}" min="${min}" max="${max}" step="${step}" value="${esc(val)}" ${ro} aria-invalid="${!!errs[path]}"><span class="muted">${unit}</span></div>`;
      const o = d.orbit, isReal = d.mode === "real";
      let orbitHtml = "";
      if (!isReal) {
        const eq = C.isEquatorial(o.incDeg);
        orbitHtml = `<div class="sec"><h4>Orbit<em>ideal circular orbit — what each setting changes is listed under it</em></h4>
          <div class="seg" style="margin-bottom:8px">${[["ISS-LIKE", 51.6, 420], ["EQUATORIAL", 0, 550], ["KSC 28.5°", 28.5, 550], ["POLAR", 90, 550], ["SUN-SYNC-LIKE 97.6°", 97.6, 550]].map(([n, i, h]) => `<button data-preset="${i},${h}" ${ro}>${n}</button>`).join("")}</div>
          <div class="grid">
          ${this._fld("cv-alt", "Altitude", num("cv-alt", "orbit.altKm", o.altKm, 300, 2000, 1, "km"), errs["orbit.altKm"], "Higher: longer orbit, bigger footprint, farther from stations.")}
          ${this._fld("cv-inc", "Inclination", num("cv-inc", "orbit.incDeg", o.incDeg, 0, 180, 0.1, "°"), errs["orbit.incDeg"], o.incDeg > 90 ? "Retrograde: moves westward." : "How far north and south the track reaches." + (Math.abs(o.incDeg - 97.6) < 1 ? " Not truly Sun-synchronous here (no orbit drift in this model)." : ""))}
          ${this._fld("cv-node", eq ? "Start longitude" : "Track position", num("cv-node", "orbit.nodeLonDeg", o.nodeLonDeg, -180, 180, 0.1, "°E"), errs["orbit.nodeLonDeg"], eq ? "Equatorial orbit: there is no northbound crossing, so this one setting places the satellite." : "Longitude where it crosses the equator heading north, at the start time. Shifts the track east/west.")}
          ${eq ? "" : this._fld("cv-phase", "Start phase", num("cv-phase", "orbit.phaseDeg", o.phaseDeg, 0, 359.9, 0.1, "°"), errs["orbit.phaseDeg"], "0 = at that equator crossing, 90 = a quarter orbit later (furthest north).")}
          </div></div>`;
      } else {
        const omm = o.omm, age = omm ? C.dataAge(omm, Date.now()) : null;
        orbitHtml = `<div class="sec"><h4>Satellite<em>published orbital elements — not editable here (use COPY TO SANDBOX)</em></h4>
          <div class="grid">
            ${this._fld("cv-satsel", "Curated CubeSats (works offline)", `<select id="cv-satsel" ${ro}>${(env.satellites || []).map((s) => `<option value="${esc(s.catnr)}" ${omm && String(omm.NORAD_CAT_ID) === String(s.catnr) ? "selected" : ""}>${esc(s.name)} (#${esc(s.catnr)})</option>`).join("")}</select>`, errs["orbit.omm"])}
            ${this._fld("cv-catnr", "Catalog number", `<div class="row"><input type="text" id="cv-catnr" inputmode="numeric" maxlength="9" placeholder="e.g. 25544" ${ro}><button data-ed="FETCH" ${ro}>FETCH</button></div>`, null, "NORAD catalog number, 1–9 digits.")}
            ${this._fld("cv-search", "Search by name", `<div class="row"><input type="text" id="cv-search" maxlength="24" placeholder="at least 3 letters" ${ro}><button data-ed="SEARCH" ${ro}>SEARCH</button></div><div id="cv-search-res"></div>`)}
          </div>
          ${omm ? `<div class="kv" style="margin-top:8px"><span class="k">Selected</span><span>${esc(omm.OBJECT_NAME)} · #${esc(omm.NORAD_CAT_ID)} · ${esc(omm.OBJECT_ID || "")}</span>
            <span class="k">Elements</span><span>${esc(o.source ? o.source.name : "—")} · epoch ${esc(C.isoUtc(C.ommEpochMs(omm)))} (${age.days.toFixed(1)} days old: ${esc(age.note)}) · fetched ${esc(o.source && o.source.fetchedAt || "—")}</span>
            <span class="k">Orbit</span><span>${(86400 / omm.MEAN_MOTION / 60).toFixed(1)} min period · ${(+omm.INCLINATION).toFixed(1)}° inclination · e = ${(+omm.ECCENTRICITY).toFixed(4)}</span></div>
            <div style="margin-top:6px;display:flex;gap:6px"><button data-ed="REFRESH" ${ro}>REFRESH ELEMENTS</button><button data-ed="COPY_SANDBOX" ${ro}>COPY TO SANDBOX</button></div>` : `<div class="empty">Choose a satellite.</div>`}</div>`;
      }
      const sts = d.stations;
      const stHtml = `<div class="sec"><h4>Ground stations<em>${sts.filter((s) => s.enabled).length} enabled of ${sts.length} (max ${C.LIMITS.stations})${errs.stations ? ` — <span class="bad">${esc(errs.stations)}</span>` : ""}</em></h4>
        <table class="sttab"><tr><th>ON</th><th>NAME</th><th>LAT °</th><th>LON °</th><th>MIN ELEV °</th><th>SOURCE</th><th></th></tr>
        ${sts.map((s, i) => { const e = (k) => errs[`stations[${i}].${k}`]; return `<tr>
          <td><input type="checkbox" data-st="${i}" data-k="enabled" ${s.enabled ? "checked" : ""} ${ro} aria-label="Enable ${esc(s.name)}"></td>
          <td><input type="text" data-st="${i}" data-k="name" value="${esc(s.name)}" maxlength="32" ${ro} aria-invalid="${!!e("name")}" title="${esc(e("name") || "")}"></td>
          <td><input type="number" data-st="${i}" data-k="lat" value="${esc(s.lat)}" step="0.01" min="-90" max="90" ${ro} aria-invalid="${!!e("lat")}" title="${esc(e("lat") || "")}"></td>
          <td><input type="number" data-st="${i}" data-k="lon" value="${esc(s.lon)}" step="0.01" min="-180" max="180" ${ro} aria-invalid="${!!e("lon")}" title="${esc(e("lon") || "")}"></td>
          <td><input type="number" data-st="${i}" data-k="maskDeg" value="${esc(s.maskDeg)}" step="1" min="0" max="60" ${ro} aria-invalid="${!!e("maskDeg")}" title="${esc(e("maskDeg") || "")}"></td>
          <td class="muted nm" title="${esc(s.source)}">${esc(String(s.source || "").slice(0, 22))}</td>
          <td><button data-del="${i}" ${ro} aria-label="Remove ${esc(s.name)}">✕</button></td></tr>`; }).join("") || `<tr><td colspan="7" class="empty">No stations. Add one — with none, nothing can be in view.</td></tr>`}</table>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap"><button data-ed="ADD" ${ro}>+ ADD STATION</button><button data-ed="PICK" ${ro}>+ PLACE ON GLOBE</button>${isReal ? `<button data-ed="CATALOG" ${ro}>+ SATNOGS CATALOG</button>` : `<button data-ed="PRESET_ST" ${ro}>PRESET NETWORK</button>`}<span class="note muted" style="align-self:center">Minimum elevation: lowest angle above the local horizon the station uses (0–60°).</span></div>
        <div id="cv-catalog"></div></div>`;
      const t0 = C.parseUtc(d.epochUtc);
      const timeHtml = `<div class="sec"><h4>Time</h4><div class="grid">
        ${this._fld("cv-epoch", "Start (UTC)", `<div class="row"><input type="text" id="cv-epoch" data-p="epochUtc" value="${esc(d.epochUtc)}" ${ro} aria-invalid="${!!errs.epochUtc}" placeholder="2026-11-14T03:00:00Z"><button data-ed="NOW" ${ro}>NOW</button></div>`, errs.epochUtc, isReal ? "Real orbits change with time: the start matters." : "Sandbox orbits are placed relative to Earth at the start time, so changing the date only changes the clock times.")}
        ${this._fld("cv-hz", "Prediction length", `<div class="seg">${Object.keys(C.HORIZONS).map((k) => `<button data-hz="${k}" class="${d.horizon === k ? "on" : ""}" ${ro}>${C.HORIZONS[k].label}</button>`).join("")}</div>`, errs.horizon, "How far ahead passes and results are computed. Does not change the orbit.")}
        </div>${ok(t0) ? "" : ""}</div>`;
      box.innerHTML = `<div class="sec"><h4>Mode</h4><div class="seg"><button data-mode="sandbox" class="${!isReal ? "on" : ""}" ${ro}>SANDBOX · HYPOTHETICAL</button><button data-mode="real" class="${isReal ? "on" : ""}" ${ro}>REAL SATELLITE</button></div>
        <div class="note muted" style="margin-top:4px;font-size:11px">${isReal ? "Real: published elements (CelesTrak) with SGP4, catalog stations (SatNOGS). Predicted visibility only." : "Sandbox: your own orbit and stations. Nothing here is a real spacecraft or a real antenna."}</div></div>`
        + orbitHtml + timeHtml + stHtml;
      // bind
      const set = (path, val) => { const ks = path.split("."); let o2 = this.draft; for (let i = 0; i < ks.length - 1; i++) o2 = o2[ks[i]]; o2[ks[ks.length - 1]] = val; };
      box.querySelectorAll("input[data-p]").forEach((inp) => {
        const isNum = inp.type === "number" || inp.type === "range";
        inp.addEventListener(inp.type === "range" ? "input" : "change", () => { set(inp.getAttribute("data-p"), isNum ? (inp.value === "" ? NaN : +inp.value) : inp.value.trim()); if (this.draft.derivedFrom && inp.getAttribute("data-p").startsWith("orbit.")) this.draft.edited = true; this._renderEditorKeepFocus(inp.id); });
      });
      box.querySelectorAll("input[data-st]").forEach((inp) => inp.addEventListener("change", () => {
        const s = this.draft.stations[+inp.getAttribute("data-st")], k = inp.getAttribute("data-k");
        s[k] = inp.type === "checkbox" ? inp.checked : inp.type === "number" ? (inp.value === "" ? NaN : +inp.value) : inp.value; this._renderEditorKeepFocus(null);
      }));
      box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { this.draft.stations.splice(+b.getAttribute("data-del"), 1); this._renderEditor(); }));
      box.querySelectorAll("[data-hz]").forEach((b) => b.addEventListener("click", () => { this.draft.horizon = b.getAttribute("data-hz"); this._renderEditor(); }));
      box.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => this.cb("ED_MODE", b.getAttribute("data-mode"))));
      box.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => { const [i, h] = b.getAttribute("data-preset").split(",").map(Number); this.draft.orbit.incDeg = i; this.draft.orbit.altKm = h; if (this.draft.derivedFrom) this.draft.edited = true; this._renderEditor(); }));
      box.querySelectorAll("[data-ed]").forEach((b) => b.addEventListener("click", () => this.cb("ED_" + b.getAttribute("data-ed"), this.draft)));
      const sel = box.querySelector("#cv-satsel"); if (sel) sel.addEventListener("change", () => this.cb("ED_SELECT_SAT", sel.value));
      const run = this.$("cv-ed-run"); if (run) { run.disabled = !v.ok || !env.isEditor; run.title = v.ok ? "Apply and restart from the start time" : "Fix the highlighted fields first"; }
      const msg = this.$("cv-ed-msg"); if (msg) msg.textContent = v.ok ? (env.isEditor ? "Ready." : "") : `${v.errors.length} field${v.errors.length > 1 ? "s" : ""} to fix`;
    }
    _renderEditorKeepFocus(id) { this._renderEditor(); if (id) { const el = this.el.querySelector("#" + id); if (el) el.focus(); } }
    refreshEditor() { if (this.openWin === "cv-edit") this._renderEditor(); }
    editorHtml(id, html) { const el = this.el.querySelector("#" + id); if (el) el.innerHTML = html; return el; }

    dispose() { clearTimeout(this._tt); this.el.remove(); this.style.remove(); }
  }
  window.CoverageHud = CoverageHud;
})();
