/*
 * deploy_hud.js — STS_OS-style display for the CubeSat deployment from the ISS.
 *
 * Top: mission tag (phase, MET, UTC, time warp, Ku-band AOS/LOS, day/night). Left: procedure and who holds
 * which console. Right: the current phase's console (checklist, airlock gauge, slide table, grapple
 * readouts, pointing + predicted path + GO/NO-GO, post-release status). Centre: end-effector camera overlay
 * while grappling. Bottom: event log, keys, time warp. Buttons emit semantic commands to deploy_game.js.
 */
(function () {
  "use strict";
  const D = window.DeployCore, CC = window.CoverageCore;
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const met = (s) => CC.fmtDur(s, true);
  const hhmm = (ms) => new Date(Math.round(ms)).toISOString().slice(11, 19) + "Z";
  const PH_LABEL = { brief: "BRIEFING", load: "LOAD J-SSOD", depress: "AIRLOCK DEPRESS", outboard: "HATCH + SLIDE TABLE", grapple: "JEMRMS GRAPPLE", move: "MOVE TO RELEASE POINT", point: "POINT + GO/NO-GO", release: "RELEASE", drift: "FREE FLIGHT", done: "FIRST BEACON" };
  const STEPS = ["load", "depress", "outboard", "grapple", "move", "point", "release", "drift", "done"];
  const ROLE_SHORT = { rms: "JEMRMS", crew: "CREW", flight: "FLIGHT" };

  const CSS = `
  #dep-hud{--ink:#ede8dd;--dim:#8e897f;--line:rgba(237,232,221,.78);--blue:#5cc2ec;--live:var(--ink);--rose:#c9576a;--amber:#ffb347;--yellow:#ffd21a;--void:rgba(0,0,0,.76);
    position:fixed;inset:0;z-index:4000;pointer-events:none;color:var(--ink);font:13px/1.45 "Share Tech Mono",ui-monospace,Menlo,Consolas,monospace;letter-spacing:.02em}
  #dep-hud *{box-sizing:border-box}
  #dep-hud button{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--line);padding:3px 9px;cursor:pointer;border-radius:0;text-transform:uppercase;pointer-events:auto}
  #dep-hud button:hover:not(:disabled),#dep-hud button:focus-visible{background:var(--ink);color:#000;outline:0}
  #dep-hud button:disabled{opacity:.38;cursor:default}
  #dep-hud button.on{background:var(--ink);color:#000} #dep-hud button.go{border-color:var(--live);color:var(--live)} #dep-hud button.go:hover:not(:disabled){background:var(--live);color:#000}
  #dep-hud button.warn{border-color:var(--rose);color:var(--rose)}
  #dep-hud .top{position:absolute;left:50%;top:10px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px}
  #dep-hud .tag{display:flex;border:1px solid var(--line);background:var(--void);white-space:nowrap}
  #dep-hud .tag b{background:var(--ink);color:#000;font-weight:400;padding:3px 10px} #dep-hud .tag span{padding:3px 10px;border-left:1px solid rgba(237,232,221,.3)}
  #dep-hud .tag .los{color:var(--rose)} #dep-hud .tag .aos{color:var(--live)}
  #dep-hud .panel{position:absolute;background:var(--void);border-left:3px solid var(--ink);padding:8px 12px;pointer-events:auto;overflow:auto}
  #dep-hud .panel h3{margin:0 0 6px;font-weight:400;font-size:13px;text-transform:uppercase;display:flex;justify-content:space-between;gap:10px}
  #dep-hud .panel h3 em{font-style:normal;color:var(--dim)}
  #dep-hud .proc{left:14px;top:62px;width:250px;max-height:calc(100vh - 260px)}
  #dep-hud .proc ol{margin:0;padding:0;list-style:none} #dep-hud .proc li{padding:1px 0;color:var(--dim)} #dep-hud .proc li.cur{color:var(--ink)} #dep-hud .proc li.cur::before{content:"▶ "} #dep-hud .proc li.ok{color:var(--live)} #dep-hud .proc li.ok::before{content:"✓ "}
  #dep-hud .proc .roles{margin-top:8px;border-top:1px solid rgba(237,232,221,.3);padding-top:6px;font-size:12px} #dep-hud .proc .roles div{display:flex;justify-content:space-between;gap:8px} #dep-hud .proc .roles .me{color:var(--yellow)}
  #dep-hud .con{right:14px;top:62px;width:min(440px,44vw);max-height:calc(100vh - 250px)}
  #dep-hud .row{display:flex;justify-content:space-between;gap:10px} #dep-hud .k{color:var(--dim)}
  #dep-hud .btns{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
  #dep-hud .chk{margin:0;padding:0;list-style:none} #dep-hud .chk li{padding:2px 0 2px 20px;position:relative;color:var(--dim);text-transform:none}
  #dep-hud .chk li::before{content:"□";position:absolute;left:0} #dep-hud .chk li.ok{color:var(--live)} #dep-hud .chk li.ok::before{content:"■"} #dep-hud .chk li.cur{color:var(--ink)} #dep-hud .chk li.cur::before{content:"▶"}
  #dep-hud .bar{height:6px;background:rgba(237,232,221,.2);position:relative;margin:3px 0 6px} #dep-hud .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--blue)}
  #dep-hud .big{font-size:28px;line-height:1.1} #dep-hud .good{color:var(--live)} #dep-hud .bad{color:var(--rose)} #dep-hud .am{color:var(--amber)} #dep-hud .note{color:var(--dim);font-size:12px;text-transform:none;letter-spacing:0;margin-top:6px}
  #dep-hud .gauge{display:flex;gap:2px;height:10px;margin:4px 0} #dep-hud .gauge i{flex:1;background:rgba(237,232,221,.15)} #dep-hud .gauge i.f{background:var(--blue)} #dep-hud .gauge i.w{background:var(--amber)}
  #dep-hud canvas.plot{width:100%;height:190px;display:block;border:1px solid rgba(237,232,221,.3);margin-top:6px;background:rgba(0,0,0,.4)}
  #dep-hud .poll div{display:grid;grid-template-columns:70px 1fr auto;gap:8px;align-items:center;padding:2px 0}
  #dep-hud .dock{position:absolute;left:14px;right:14px;bottom:10px;background:var(--void);border:1px solid var(--line);pointer-events:auto;display:flex;flex-direction:column;max-height:170px}
  #dep-hud .ctl{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:5px 8px;border-bottom:1px solid rgba(237,232,221,.3)} #dep-hud .ctl .sp{flex:1} #dep-hud .ctl .keys{color:var(--dim);font-size:12px}
  #dep-hud .log{padding:4px 8px;overflow:auto;font-size:12px;flex:1;text-transform:none;letter-spacing:0} #dep-hud .log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #dep-hud .log .warn{color:var(--amber)} #dep-hud .log .good{color:var(--live)} #dep-hud .log b{font-weight:400;color:var(--dim);display:inline-block;width:74px}
  #dep-hud .toast{position:absolute;left:50%;top:62px;transform:translateX(-50%);display:none;background:var(--void);border:1px solid var(--rose);padding:5px 12px;max-width:min(720px,80vw);text-transform:none;letter-spacing:0}
  #dep-hud .ee{position:absolute;inset:0;pointer-events:none;display:none} #dep-hud .ee canvas{position:absolute;inset:0;width:100%;height:100%}
  #dep-hud .ee .lbl{position:absolute;left:50%;top:56px;transform:translateX(-50%);color:var(--live);font-size:12px}
  #dep-hud .win{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(760px,94vw);max-height:90vh;display:none;flex-direction:column;border:1px solid var(--line);background:rgba(0,0,0,.92);pointer-events:auto}
  #dep-hud .wh{display:flex;justify-content:space-between;border-bottom:1px solid var(--line)} #dep-hud .wh b{background:var(--ink);color:#000;font-weight:400;padding:4px 14px;text-transform:uppercase} #dep-hud .wh span{padding:4px 14px;color:var(--dim)}
  #dep-hud .wb{overflow:auto;padding:14px 18px;text-transform:none;letter-spacing:0;line-height:1.55} #dep-hud .wb p{margin:0 0 10px} #dep-hud .wb h4{margin:12px 0 6px;font-weight:400;text-transform:uppercase;letter-spacing:.02em}
  #dep-hud .wb table{border-collapse:collapse;font-size:12px} #dep-hud .wb td{padding:1px 12px 1px 0}
  #dep-hud .wf{display:flex;gap:6px;justify-content:flex-end;padding:8px 14px;border-top:1px solid rgba(237,232,221,.3);flex-wrap:wrap}
  #dep-hud .lbl3{position:absolute;font-size:11px;color:var(--ink);text-shadow:0 0 3px #000,0 0 2px #000;white-space:nowrap;transform:translate(10px,-50%)}
  @media (max-width:820px){#dep-hud .proc{display:none} #dep-hud .con{width:calc(100vw - 28px);top:auto;bottom:190px;max-height:40vh}}
  `;

  class DeployHud {
    constructor(cmd) {
      this.cmd = cmd;
      if (!document.getElementById("dep-hud-css")) { const s = document.createElement("style"); s.nonce = window.__lunaspisCspNonce || ""; s.id = "dep-hud-css"; s.textContent = CSS; document.head.appendChild(s); }
      const el = document.createElement("div"); el.id = "dep-hud"; this.el = el;
      el.innerHTML = `
        <div class="top"><div class="tag" id="dh-tag"></div></div>
        <div class="ee" id="dh-ee"><canvas></canvas><div class="lbl">JEMRMS END-EFFECTOR CAMERA</div></div>
        <div class="panel proc" id="dh-proc"></div>
        <div class="panel con" id="dh-con"></div>
        <div id="dh-labels"></div>
        <div class="toast" id="dh-toast"></div>
        <div class="dock"><div class="ctl" id="dh-ctl"></div><div class="log" id="dh-log"></div></div>
        <div class="win" id="dh-win"><div class="wh"><b id="dh-wt"></b><span id="dh-ws"></span></div><div class="wb" id="dh-wb"></div><div class="wf" id="dh-wf"></div></div>`;
      document.body.appendChild(el);
      // panels refresh ~10x a second, so act on pointerdown (a click could straddle a refresh); keyboard "click" (detail 0) too
      const fire = (b) => { if (!b || b.disabled) return; this.cmd(b.getAttribute("data-c"), b.getAttribute("data-a")); };
      el.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; const b = e.target.closest("button[data-c]"); if (!b) return; e.preventDefault(); fire(b); });
      el.addEventListener("click", (e) => { const b = e.target.closest("button[data-c]"); if (!b) return; e.preventDefault(); if (e.detail === 0) fire(b); });
      this._phaseKey = null; this._logKey = null; this._last = 0;
    }
    $(id) { return this.el.querySelector("#" + id); }
    toast(msg, ms) { const t = this.$("dh-toast"); t.textContent = msg; t.style.display = "block"; clearTimeout(this._tt); this._tt = setTimeout(() => (t.style.display = "none"), ms || 3500); }
    showWin(title, sub, html, buttons) {
      this.$("dh-wt").textContent = title; this.$("dh-ws").textContent = sub || ""; this.$("dh-wb").innerHTML = html;
      this.$("dh-wf").innerHTML = (buttons || []).map(([c, l, a, cls]) => `<button data-c="${c}"${a !== undefined ? ` data-a="${esc(a)}"` : ""}${cls ? ` class="${cls}"` : ""}>${esc(l)}</button>`).join("");
      this.$("dh-win").style.display = "flex"; this.openWin = title;
    }
    closeWin() { if (!this.openWin) return false; this.$("dh-win").style.display = "none"; this.openWin = null; return true; }
    dispose() { clearTimeout(this._tt); this.el.remove(); }

    /** ctx: { st, assess, roles, mine:[roles], isHost, view, cc:{los,inS}, frame } */
    update(ctx) {
      const st = ctx.st; if (!st) return;
      const now = performance.now();
      this._eeOverlay(ctx);
      this._labels(ctx);
      if (now - this._last < 100 && this._phaseKey === st.phase + "|" + ctx.mine.join()) return;
      this._last = now;
      this._tag(ctx); this._proc(ctx); this._console(ctx); this._ctl(ctx); this._log(ctx);
      if (st.phase === "brief" && !this._briefShown) { this._briefShown = true; this._brief(ctx); }
      if (st.phase !== "brief" && this.openWin === "J-SSOD deployment") this.closeWin();
      if (st.phase === "done" && !this._doneShown) { this._doneShown = true; this._debrief(ctx); }
      this._phaseKey = st.phase + "|" + ctx.mine.join();
    }

    _tag(ctx) {
      const st = ctx.st, f = ctx.frame, cc = ctx.cc;
      const tag = `<b>CUBESAT DEPLOY · ISS KIBO</b><span>${PH_LABEL[st.phase]}</span><span>MET ${met(st.t)}</span><span>${hhmm(f.utcMs)}</span>`
        + `<span class="${cc.los ? "los" : "aos"}">KU ${cc.los ? "LOS" : "AOS"} ${CC.fmtDur(cc.inS)}</span><span>${ctx.view && ctx.view.lit ? "DAY" : "NIGHT"}</span><span>×${st.warp}</span>`;
      if (tag !== this._tagHtml) { this.$("dh-tag").innerHTML = tag; this._tagHtml = tag; }
    }
    _proc(ctx) {
      const st = ctx.st, i = STEPS.indexOf(st.phase);
      const roles = ctx.roles || {};
      const ph = `<h3>Procedure <em>J-SSOD</em></h3><ol>${STEPS.map((p, k) => `<li class="${k < i ? "ok" : k === i ? "cur" : ""}">${PH_LABEL[p]}</li>`).join("")}</ol>
        <div class="roles">${D.ROLES.map((r) => `<div class="${ctx.mine.includes(r) ? "me" : ""}"><span>${ROLE_SHORT[r]}</span><span>${esc((roles[r] && roles[r].name) || "—")}${ctx.mine.includes(r) ? " (you)" : ""}</span></div>`).join("")}</div>
        `;
      if (ph !== this._procHtml) { this.$("dh-proc").innerHTML = ph; this._procHtml = ph; }
    }
    _btn(c, label, enabled, cls, a) { return `<button data-c="${c}"${a !== undefined ? ` data-a="${esc(a)}"` : ""}${enabled ? "" : " disabled"}${cls ? ` class="${cls}"` : ""}>${esc(label)}</button>`; }
    _console(ctx) {
      const st = ctx.st, m = (r) => ctx.mine.includes(r), b = (...a) => this._btn(...a);
      let h = "";
      switch (st.phase) {
        case "brief":
          h = `<h3>Ready to deploy</h3><div class="btns">${b("BEGIN", "Begin [Enter]", m("flight") || ctx.isHost, "go")}${b("SKIP", "Skip to orbit", ctx.isHost)}${b("BRIEF", "Controls", true)}</div>`; break;
        case "load": {
          const busy = st.load.busy, prog = busy ? 1 - (busy.until - st.t) / D.LOAD_STEPS[busy.step].s : 0;
          h = `<h3>Load the J-SSOD <em>Kibo crew · inside Kibo</em></h3><ul class="chk">${D.LOAD_STEPS.map((s, k) => `<li class="${k < st.load.step ? "ok" : k === st.load.step ? "cur" : ""}">${esc(s.label)}</li>`).join("")}</ul>`
            + (busy ? `<div class="bar"><i style="width:${(prog * 100).toFixed(0)}%"></i></div>` : "")
            + `<div class="btns">${b("STEP", busy ? "Working…" : "Next [Enter]", m("crew") && !busy, "go")}</div>`;
          break;
        }
        case "depress": case "outboard": {
          const al = st.al, A = D.P.airlock, frac = Math.max(0, Math.min(1, Math.log10(Math.max(al.p, 0.01) / 0.01) / Math.log10(101.3 / 0.01)));
          const seg = 24, filled = Math.round(frac * seg);
          h = `<h3>JEM airlock <em>Kibo crew</em></h3><div class="row"><span class="k">PRESSURE</span><span class="big ${al.p < A.hatchMaxKPa ? "good" : ""}">${al.p >= 10 ? al.p.toFixed(1) : al.p.toFixed(3)} kPa</span></div>`
            + `<div class="gauge">${Array.from({ length: seg }, (_, k) => `<i class="${k < filled ? (al.p > A.ventWarnKPa ? "w" : "f") : ""}"></i>`).join("")}</div>`
            + `<div class="row"><span class="k">PUMP</span><span>${al.pump ? "<span class=good>RUNNING</span>" : "OFF"}</span></div><div class="row"><span class="k">VENT VALVE</span><span>${al.vent ? "<span class=am>OPEN</span>" : "CLOSED"}</span></div>`
            + `<div class="row"><span class="k">AIR VENTED OVERBOARD</span><span class="${al.ventedKg > 0.5 ? "bad" : ""}">${al.ventedKg.toFixed(2)} kg</span></div>`
            + `<div class="row"><span class="k">LEAK CHECK</span><span>${al.leakOk ? "<span class=good>PASSED</span>" : al.leak ? `RUNNING ${Math.max(0, A.leakCheckS - (st.t - al.leak.t0)).toFixed(0)} s · +${(al.p - al.leak.p0).toFixed(3)} kPa` : "—"}</span></div>`;
          if (st.phase === "depress") {
            h += `<div class="btns">${b("PUMP", al.pump ? "Pump off [P]" : "Depress pump [P]", m("crew"), al.pump ? "on" : "")}${b("VENT", al.vent ? "Close vent [V]" : "Vent valve [V]", m("crew"), al.vent ? "on" : "")}${b("LEAK_CHECK", "Leak check [L]", m("crew") && !al.leak && !al.leakOk)}${b("OUTER_HATCH", "Open outer hatch [H]", m("crew") && al.leakOk, "go")}</div>`
              + `<div class="note">Pump → ${A.pumpFloorKPa} kPa · vent → &lt;${A.hatchMaxKPa} kPa · close vent → leak check → hatch</div>`;
          } else {
            h += `<div class="row"><span class="k">OUTER HATCH</span><span>${(al.outer * 100).toFixed(0)} %</span></div><div class="bar"><i style="width:${al.outer * 100}%"></i></div>`
              + `<div class="row"><span class="k">SLIDE TABLE</span><span>${(al.table * 100).toFixed(0)} %</span></div><div class="bar"><i style="width:${al.table * 100}%"></i></div>`
              + `<div class="btns">${b("TABLE", "Extend slide table [T]", m("crew") && al.outer >= 1 && !al.tableCmd, "go")}</div>`;
          }
          break;
        }
        case "grapple": {
          const a = st.arm, g = D.G.grapple, lat = Math.hypot(a.d[0], a.d[2]), sp = Math.hypot(...a.vel);
          const ok = (c) => (c ? "good" : "bad");
          h = `<h3>Grapple the MPEP <em>JEMRMS operator</em></h3>`
            + `<div class="row"><span class="k">HEIGHT ABOVE FIXTURE</span><span class="${ok(a.d[1] <= g.depth)}">${(a.d[1] * 100).toFixed(1)} cm (≤ ${g.depth * 100})</span></div>`
            + `<div class="row"><span class="k">OFF-CENTRE</span><span class="${ok(Math.abs(a.d[0]) <= g.lat && Math.abs(a.d[2]) <= g.lat)}">${(lat * 100).toFixed(1)} cm (≤ ${(g.lat * 100).toFixed(1)})</span></div>`
            + `<div class="row"><span class="k">ROLL</span><span class="${ok(Math.abs(a.rollDeg) <= g.rollDeg)}">${a.rollDeg.toFixed(1)}° (≤ ${g.rollDeg})</span></div>`
            + `<div class="row"><span class="k">RATE</span><span class="${ok(sp <= g.speed)}">${(sp * 100).toFixed(1)} cm/s (≤ ${g.speed * 100})</span></div>`
            + `<div class="row"><span class="k">MODE</span><span>${st.input.fine ? "VERNIER 1 cm/s" : "COARSE 5 cm/s"}</span></div>`
            + `<div class="row"><span class="k">ATTEMPTS · CONTACTS</span><span>${a.attempts} · ${a.contacts}</span></div>`
            + `<div class="btns">${b("GRAPPLE", "Grapple [G]", m("rms"), "go")}</div>`
            + `<div class="note">${m("rms") ? "WASD align · R/F in/out · Q/E roll · Shift fine · stop → G grapple" : "Waiting for JEMRMS"}</div>`;
          break;
        }
        case "move":
          h = `<h3>Move to release point <em>JEMRMS operator</em></h3><div class="bar"><i style="width:${(st.arm.move * 100).toFixed(0)}%"></i></div>`
            + `<div class="btns">${b("MOVE", st.arm.moving ? "Moving…" : "Move [M]", m("rms") && !st.arm.moving, "go")}</div>`;
          break;
        case "point": h = this._pointHtml(ctx); break;
        case "release": h = `<h3>Release</h3><div class="row"><span class="k">DOOR</span><span>${(st.sat.door * 100).toFixed(0)} %</span></div><div class="row"><span class="k">PUSH</span><span>${(st.sat.rail * 100).toFixed(0)} / ${D.P.railM * 100} cm</span></div>`; break;
        case "drift": case "done": {
          const s = st.sat, since = st.t - (s.relT || st.t), d = Math.hypot(...s.p);
          h = `<h3>CubeSat free flight</h3>`
            + `<div class="row"><span class="k">DISTANCE FROM ISS</span><span class="big">${d >= 1000 ? (d / 1000).toFixed(2) + " km" : d.toFixed(0) + " m"}</span></div>`
            + `<div class="row"><span class="k">ALONG-TRACK</span><span>${(s.p[2] / 1000).toFixed(3)} km ${s.p[2] >= 0 ? "ahead" : "behind"}</span></div>`
            + `<div class="row"><span class="k">RADIAL</span><span>${(Math.abs(s.p[1]) / 1000).toFixed(3)} km ${s.p[1] < 0 ? "below" : "above"}</span></div>`
            + `<div class="row"><span class="k">SEPARATION SPEED</span><span>${s.speed.toFixed(2)} m/s</span></div>`
            + `<div class="row"><span class="k">TIP-OFF</span><span>${Math.hypot(...s.w).toFixed(1)}°/s</span></div>`
            + `<div class="row"><span class="k">INHIBIT TIMER</span><span class="${s.antennas ? "good" : "am"}">${s.antennas ? "ANTENNAS DEPLOYED · BEACON" : CC.fmtDur(D.P.inhibitS - since)}</span></div>`
            + (st.phase === "done" ? `<div class="btns">${b("HANDOFF", "Coverage [Enter]", ctx.isHost || m("flight"), "go")}${b("DEBRIEF", "Results", true)}</div>` : `<div class="btns">${b("WARP", "Warp ×60", m("flight") || ctx.isHost, "", 60)}</div>`);
          break;
        }
      }
      const con = this.$("dh-con");
      if (h !== this._conHtml) { const sc = con.scrollTop; con.innerHTML = h; con.scrollTop = sc; this._conHtml = h; this._plotKey = null; }
      if (st.phase === "point") { const k = (ctx.assess && ctx.assess._rev) + "|" + (this.$("dh-plot") ? this.$("dh-plot").clientWidth : 0); if (k !== this._plotKey) { this._plotKey = k; this._plot(ctx); } }
    }
    _pointHtml(ctx) {
      const st = ctx.st, A = ctx.assess, m = (r) => ctx.mine.includes(r), b = (...a) => this._btn(...a), a = st.arm;
      const cls = (c) => (c ? "good" : "bad");
      let h = `<h3>Point the deployer <em>flight plan: nadir-aft 45°</em></h3>`
        + `<div class="row"><span class="k">AZIMUTH · ELEVATION</span><span>${a.az.toFixed(1)}° · ${a.el.toFixed(1)}° <span class="k">(plan 180° · −45°)</span></span></div>`;
      if (A) {
        h += `<div class="row"><span class="k">ERROR FROM PLAN</span><span class="${cls(A.inTol)}">${A.errDeg.toFixed(1)}° (≤ ${D.P.plan.tolDeg}°)</span></div>`
          + `<div class="row"><span class="k">LINE OF FIRE</span><span class="${cls(A.lof.clear)}">${A.lof.clear ? "CLEAR" : esc("BLOCKED · " + A.lof.hit.name)}</span></div>`
          + `<div class="row"><span class="k">PREDICTION (${D.P.horizonDays} d)</span><span class="${cls(A.safe)}">${A.safe ? "SAFE" : "UNSAFE"}</span></div>`
          + `<canvas class="plot" id="dh-plot"></canvas>`
          + `<div class="note">3 orbits · ← behind · ahead → · Earth ↓ · dashed = ISS zone</div>`;
      }
      h += `<div class="btns">${b("BRAKES", st.arm.brakes ? "Release brakes [B]" : "Apply brakes [B]", m("rms"), st.arm.brakes ? "on" : "")}${b("CAMERA", st.camera ? "Stow camera [K]" : "Camera at window [K]", m("crew"), st.camera ? "on" : "")}</div>`;
      const pollRow = (r, label, need) => `<div><span>${ROLE_SHORT[r]}</span><span class="k">${label}</span>${st.poll[r] ? `<span class="good">GO</span>` : b("GO", "GO", m(r) && need, "go", r)}</div>`;
      h += `<h3 style="margin-top:10px">GO / NO-GO poll</h3><div class="poll">${pollRow("rms", "brakes on, at plan attitude", true)}${pollRow("crew", "camera recording", true)}${pollRow("flight", "prediction safe, Ku AOS", st.poll.rms && st.poll.crew)}</div>`
        + `<div class="btns">${b("ARM", st.armed ? "Safe deployer" : "Arm deployer [Y]", m("flight") && st.poll.rms && st.poll.crew && st.poll.flight, st.armed ? "warn on" : "")}${b("DEPLOY", st.uplink ? "Command in flight…" : "DEPLOY [Enter]", m("flight") && st.armed && !st.uplink, "warn")}</div>`
        + `<div class="note">${m("rms") ? "A/D yaw · W/S pitch · Shift fine · " : ""}Deploy at KU AOS</div>`;
      return h;
    }
    _plot(ctx) {
      const c = this.$("dh-plot"), A = ctx.assess; if (!c || !A || !A.pr) return;
      const w = c.clientWidth, h = c.clientHeight; c.width = w * devicePixelRatio; c.height = h * devicePixelRatio;
      const g = c.getContext("2d"); g.scale(devicePixelRatio, devicePixelRatio);
      const pts = A.pr.plot; let ext = 4000; for (const p of pts) ext = Math.max(ext, Math.abs(p[0]) * 0.55, Math.abs(p[1]) * 1.1); ext = Math.min(ext, 60000);
      const sx = (w / 2) / ext, sy = sx, cx = w / 2, cy = h / 2;
      g.strokeStyle = "rgba(237,232,221,.25)"; g.beginPath(); g.moveTo(0, cy); g.lineTo(w, cy); g.moveTo(cx, 0); g.lineTo(cx, h); g.stroke();
      g.setLineDash([4, 3]); g.strokeStyle = "#5cc2ec"; g.beginPath(); g.ellipse(cx, cy, D.P.ae.along * sx, D.P.ae.radial * sy, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.strokeStyle = A.safe ? "#ffd21a" : "#c9576a"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy);
      for (const p of pts) g.lineTo(cx + p[0] * sx, cy - p[1] * sy); g.stroke();
      g.fillStyle = "#ede8dd"; g.fillRect(cx - 3, cy - 2, 6, 4); g.font = "10px Share Tech Mono, monospace"; g.fillText("ISS", cx + 5, cy - 4);
      g.fillStyle = "#8e897f"; g.fillText(`±${(ext / 1000).toFixed(1)} km`, 4, 11); g.fillText("Earth ↓", 4, h - 4);
    }
    _ctl(ctx) {
      const st = ctx.st, can = ctx.mine.includes("flight") || ctx.isHost, cap = D.WARP_PHASES[st.phase] || 1;
      const keys = { grapple: "W/S A/D R/F Q/E · Shift vernier · G grapple", point: "A/D W/S slew · B brakes · K camera · G GO · Y arm · Enter deploy", depress: "P pump · V vent · L leak check · H hatch", load: "Enter next step", outboard: "T slide table", move: "M move", done: "Enter start coverage" }[st.phase] || "";
      const html = D.WARPS.map((w) => this._btn("WARP", "×" + w, can && w <= cap && w !== st.warp, st.warp === w ? "on" : "", w)).join("")
        + `<span class="keys">&nbsp; C camera (${esc(ctx.view ? (ctx.view.camMode === "auto" ? "auto · " + ctx.view.activeMode : ctx.view.camMode) : "")}) · drag look · wheel zoom · ${esc(keys)}</span><span class="sp"></span>`
        + this._btn("BRIEF", "Briefing", true) + (ctx.isHost && st.phase !== "done" ? this._btn("SKIP", "Skip to orbit", true) : "") + this._btn("LEAVE", "Leave", true);
      if (html !== this._ctlHtml) { this.$("dh-ctl").innerHTML = html; this._ctlHtml = html; }
    }
    _log(ctx) {
      const L = ctx.st.log || [], key = L.length + "|" + (L.length ? L[L.length - 1].t : 0);
      if (key === this._logKey) return; this._logKey = key;
      const box = this.$("dh-log");
      box.innerHTML = L.slice(-3).map((e) => `<div class="${e.kind}"><b>${met(e.t)}</b><b>${ROLE_SHORT[e.who] || ""}</b>${esc(e.msg)}</div>`).join("");
      box.scrollTop = box.scrollHeight;
    }
    _labels(ctx) {
      const v = ctx.view, st = ctx.st, box = this.$("dh-labels"); if (!v || !v._ps) { box.innerHTML = ""; return; }
      const items = [];
      const add = (p, t) => { const s = v.screen(p); if (s && s.x > 0 && s.y > 0 && s.x < innerWidth && s.y < innerHeight) items.push(`<div class="lbl3" style="left:${s.x}px;top:${s.y}px">${esc(t)}</div>`); };
      if (v.activeMode === "overview") {
        if (["load", "depress", "outboard"].includes(st.phase)) { add(D.G.hatch, "JEM airlock"); add([16.5, -1.2, 18.5], "Kibo exposed facility"); add(v._ps.arm.elbow, "JEMRMS"); }
        if (st.phase === "move") add(v._ps.mpep, "MPEP + J-SSOD");
      }
      if (st.sat.released && v.activeMode !== "follow") add(st.sat.p, "CubeSat");
      if (st.phase === "point" && v.activeMode !== "ee") { const ex = v._ps.exit, ax = v._ps.axis; add([ex[0] + ax[0] * 30, ex[1] + ax[1] * 30, ex[2] + ax[2] * 30], "deployer axis"); const pl = D.axisOf(D.P.plan.azDeg, D.P.plan.elDeg); add([ex[0] + pl[0] * 30, ex[1] + pl[1] * 30, ex[2] + pl[2] * 30], "plan: nadir-aft 45°"); }
      if ((st.phase === "drift" || st.phase === "done") && v.activeMode === "follow") add([0, 0, 0], "ISS");
      box.innerHTML = items.join("");
    }
    _eeOverlay(ctx) {
      const box = this.$("dh-ee"), st = ctx.st, show = st.phase === "grapple" && ctx.view && ctx.view.activeMode === "ee";
      box.style.display = show ? "block" : "none"; if (!show) return;
      const c = box.querySelector("canvas"), w = innerWidth, h = innerHeight;
      if (c.width !== w * devicePixelRatio || c.height !== h * devicePixelRatio) { c.width = w * devicePixelRatio; c.height = h * devicePixelRatio; }
      const g = c.getContext("2d"); g.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, a = st.arm;
      const target = ctx.view.screen(ctx.view._ps.fixture);
      const depth = Math.max(0.02, a.d[1] + 0.05);
      const s = h / (2 * Math.tan(ctx.view.cam.fov * Math.PI / 360) * depth);
      const inTol = Math.abs(a.d[0]) <= D.G.grapple.lat && Math.abs(a.d[2]) <= D.G.grapple.lat;
      g.strokeStyle = "rgba(124,240,192,.9)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx - 12, cy); g.moveTo(cx + 12, cy); g.lineTo(cx + 60, cy); g.moveTo(cx, cy - 60); g.lineTo(cx, cy - 12); g.moveTo(cx, cy + 12); g.lineTo(cx, cy + 60); g.stroke();
      g.beginPath(); g.arc(cx, cy, D.G.grapple.lat * s, 0, Math.PI * 2); g.stroke();
      // target: fixture position in the image (right = -X, up = +Z), rotated by the roll error
      const tx = target ? target.x : cx, ty = target ? target.y : cy, r = -a.rollDeg * Math.PI / 180;
      g.strokeStyle = inTol ? "#7cf0c0" : "#ffd21a"; g.lineWidth = 2;
      g.save(); g.translate(tx, ty); g.rotate(r); g.beginPath(); g.moveTo(-50, 0); g.lineTo(50, 0); g.moveTo(0, -14); g.lineTo(0, 14); g.stroke(); g.restore();
      // depth scale
      const H = 1.2, y0 = cy + 120, x0 = w / 2 + 200; g.strokeStyle = "rgba(237,232,221,.6)"; g.lineWidth = 1; g.strokeRect(x0, cy - 120, 10, 240);
      const dy = Math.max(0, Math.min(H, a.d[1])); g.fillStyle = a.d[1] <= D.G.grapple.depth ? "#7cf0c0" : "#5cc2ec"; g.fillRect(x0, y0 - (dy / H) * 240 - 2, 10, 4);
      g.fillStyle = "rgba(124,240,192,.25)"; g.fillRect(x0, y0 - (D.G.grapple.depth / H) * 240, 10, (D.G.grapple.depth / H) * 240);
      g.fillStyle = "#ede8dd"; g.font = "12px Share Tech Mono, monospace"; g.fillText(`${(a.d[1] * 100).toFixed(0)} cm`, x0 + 16, y0 - (dy / H) * 240 + 4);
      g.fillText(`ROLL ${a.rollDeg.toFixed(1)}°`, cx - 40, cy + 90);
    }
    _brief(ctx) {
      const st = ctx.st, sp = D.releaseSpeed(D.P.sat.massKg);
      this.showWin("J-SSOD deployment", "ISS · Kibo", `
        <table>
          <tr><td>CREW</td><td>Load → pump → vent → leak check → extend table</td></tr>
          <tr><td>JEMRMS</td><td>Grapple → move → point aft/down 45° → brakes</td></tr>
          <tr><td>ALL</td><td>Camera → GO poll → arm → deploy</td></tr>
          <tr><td>RELEASE</td><td>${sp.toFixed(2)} m/s · 30-min radio inhibit · ×60 available</td></tr>
        </table>
        <p class="k">You hold ${ctx.mine.length ? ctx.mine.map((r) => ROLE_SHORT[r]).join(" · ") : "OBSERVER"}</p>`,
        [["CLOSE", "Close"], ...(ctx.isHost ? [["SKIP", "Skip to orbit"]] : []), ...((ctx.mine.includes("flight") || ctx.isHost) && st.phase === "brief" ? [["BEGIN", "Begin [Enter]", undefined, "go"]] : [])]);
    }
    _debrief(ctx) {
      const st = ctx.st, d = st.done || {};
      const v = (st.violations || []).map((x) => `<li>${esc(x)}</li>`).join("");
      this.showWin("CubeSat deployed", "first beacon at T+30 min", `
        <table>
          ${d.at30 ? `<tr><td>ISS range</td><td>${(d.at30.dist / 1000).toFixed(2)} km</td></tr><tr><td>Relative position</td><td>${(d.at30.along / 1000).toFixed(2)} km ${d.at30.along >= 0 ? "ahead" : "behind"} · ${(Math.abs(d.at30.radial) / 1000).toFixed(2)} km ${d.at30.radial < 0 ? "below" : "above"}</td></tr>` : ""}
          <tr><td>Deployer attitude</td><td>az ${(d.az || 0).toFixed(1)}° · el ${(d.el || 0).toFixed(1)}° (${(d.errDeg || 0).toFixed(1)}° from plan)</td></tr>
          <tr><td>Grapple</td><td>${d.attempts} attempt(s), ${d.contacts} contact(s)</td></tr>
          <tr><td>Air vented overboard</td><td>${(d.ventedKg || 0).toFixed(2)} kg</td></tr>
          <tr><td>Prediction</td><td>${d.safe ? "CLEAR · 14 DAYS" : "CHECK RELEASE"}</td></tr>
        </table>
        ${v ? `<h4>Flight-rule notes</h4><ul>${v}</ul>` : ""}
        `,
        [["CLOSE", "Close"], ...(ctx.isHost || ctx.mine.includes("flight") ? [["HANDOFF", "Plan coverage", undefined, "go"]] : [])]);
    }
  }
  window.DeployHud = DeployHud;
})();
