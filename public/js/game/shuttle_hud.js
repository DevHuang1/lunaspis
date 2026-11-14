/*
 * shuttle_hud.js — STS_OS flight display.
 *
 * Minimal by default: a mission tag, ONE command-line prompt telling the crew what to do next (and
 * who does it), the last few log lines, and toasts. Everything else lives on the DATA page, toggled
 * with [F3] (or [Tab]) like a debug overlay: telemetry, systems, phase tasks, crew, and the keys for
 * your own seat. Mission cards (briefing, failure, pause, debrief) use the same system-window style.
 * Visual language follows the team's reference boards: black, cream hairlines, monospace capitals,
 * an inverted header tab, a path-style breadcrumb, a page number and a two-colour progress bar.
 * Reads MissionSnapshots only; buttons emit semantic commands.
 */
(function () {
  "use strict";
  const DEG = Math.PI / 180;
  const ok = (x) => x !== null && x !== undefined && isFinite(x);
  const f0 = (x) => (ok(x) ? x.toFixed(0) : "--");
  const f1 = (x) => (ok(x) ? x.toFixed(1) : "--");
  const f2 = (x) => (ok(x) ? x.toFixed(2) : "--");
  const deg = (r) => (ok(r) ? (r / DEG).toFixed(1) + "°" : "--");
  const LR = (r) => (ok(r) ? (r >= 0 ? "R " : "L ") + Math.abs(r / DEG).toFixed(0) + "°" : "--");
  const met = (t) => { if (!ok(t)) return "--:--:--"; const s = Math.floor(Math.abs(t)); return (t < 0 ? "-" : "+") + [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":"); };
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SEAT = { cdr: "CDR", plt: "PLT", ms1: "MS1", ms2: "MS2", all: "ALL" };
  const PHASES = ["briefing", "prelaunch", "ascent", "insertion", "payload", "deorbit", "entry", "approach", "rollout", "debrief"];
  const PHASE_TAG = { briefing: "BRIEFING", prelaunch: "COUNTDOWN", ascent: "LAUNCH", insertion: "ORBIT PUSH", payload: "SATELLITE", deorbit: "RETURN PREP", entry: "RE-ENTRY", approach: "LANDING", rollout: "RUNWAY STOP", debrief: "DEBRIEF" };
  // keys per seat and phase — shown on the DATA page for your own seats only
  const KEYS = {
    all: [["DRAG", "look around"], ["WHEEL", "zoom"], ["RMB", "hold: scope (sky view)"], ["F", "recenter camera"], ["C", "camera view"], ["/", "crew chat"], ["V", "mic on/off"], ["F3", "this page"]],
    cdr: { briefing: [["ENTER", "start countdown"]], orbit: [["W / S", "nose down / up"], ["A / D", "roll left / right"], ["Q / E", "turn left / right"], ["H", "steady hold"]],
      entry: [["A / D", "tilt wings left / right"], ["W / S", "nose up/down (if auto off)"]], approach: [["W / S", "glide steeper / gentler (holds when released)"], ["A / D", "tilt wings left / right"]],
      rollout: [["W", "lower the nose"], ["Q / E", "steer wheels"], ["SPACE", "brakes"]], any: [["ESC", "pause / checkpoints"]] },
    plt: { orbit: [["B", "start engine burn"], ["T", "jump to burn"], [", / .", "time slower / faster"]], entry: [["M", "auto nose angle"]], approach: [["X / Z", "air brake open / close"], ["G", "landing wheels"]],
      rollout: [["X / Z", "air brake"]], ascent: [[", / .", "time slower / faster"]] },
    ms1: { orbit: [["Y", "cargo bay doors"], ["R", "release satellite"], ["I / K", "slide up / down"], ["J / L", "slide left / right"], ["U / O", "slide forward / back"]] },
    ms2: { orbit: [["P", "satellite power"], ["N", "approve release"]] },
  };
  const keyGroup = (ph) => (["insertion", "payload", "deorbit"].includes(ph) ? "orbit" : ph === "prelaunch" ? "ascent" : ph);
  const CMDS = [["START", "START COUNTDOWN", "ENTER"], ["AUTHORIZE_BURN", "START BURN", "B"], ["COAST_TO_TIG", "JUMP TO BURN", "T"], ["BAY", "CARGO DOORS", "Y"], ["PAYLOAD_POWER", "SATELLITE POWER", "P"],
    ["PAYLOAD_GO", "APPROVE RELEASE", "N"], ["DAP_HOLD", "STEADY HOLD", "H"], ["RELEASE_PAYLOAD", "RELEASE SATELLITE", "R"], ["TOGGLE_AOA_ASSIST", "AUTO NOSE ANGLE", "M"], ["DEPLOY_GEAR", "LANDING WHEELS", "G"],
    ["WARP-", "TIME SLOWER", ","], ["WARP+", "TIME FASTER", "."], ["PAUSE", "PAUSE", "ESC"], ["TOUCH", "TOUCH CONTROLS", ""], ["COMMS", "MIC & CHAT", ""], ["LEAVE", "LEAVE FLIGHT", ""]];

  // physical key positions (row, column in key units) for the pressed-key display
  const KEYPOS = (() => {
    const m = {}; const rows = [["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP"], ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL"], ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"]];
    const off = [1.5, 1.75, 2.25];
    rows.forEach((r, i) => r.forEach((c, j) => { m[c] = { r: i + 1, c: off[i] + j, w: 1, l: c.replace("Key", "").replace("Comma", ",").replace("Period", ".").replace("Slash", "/") }; }));
    m.Escape = { r: 0, c: 0, w: 1, l: "ESC" }; m.F3 = { r: 0, c: 3, w: 1, l: "F3" }; m.Tab = { r: 1, c: 0, w: 1.5, l: "TAB" };
    m.Enter = { r: 2, c: 12.75, w: 2.25, l: "ENTER" }; m.Space = { r: 4, c: 3.75, w: 6.25, l: "SPACE" }; m.ShiftLeft = { r: 3, c: 0, w: 2.25, l: "SHIFT" };
    m.ArrowUp = { r: 3, c: 13.5, w: 1, l: "▲" }; m.ArrowLeft = { r: 4, c: 12.5, w: 1, l: "◀" }; m.ArrowDown = { r: 4, c: 13.5, w: 1, l: "▼" }; m.ArrowRight = { r: 4, c: 14.5, w: 1, l: "▶" };
    return m;
  })();
  // mission timeline milestones: [label, done test, expected seconds from the previous milestone]
  const MILESTONES = [
    ["LIFTOFF", (sn, o) => o.liftoff === "done", 0], ["MAX AIR PUSH", (sn) => sn.met !== null && sn.met > 60, 60], ["BOOSTERS OFF", (sn, o) => o.srb_sep === "done", 66],
    ["MAIN CUTOFF", (sn, o) => o.meco === "done", 400], ["TANK OFF", (sn, o) => o.et_sep === "done", 18], ["ORBIT SET", (sn, o) => o.orbit_valid === "done", 2700],
    ["SAT RELEASE", (sn, o) => o.release === "done", 400], ["RETURN BURN", (sn, o) => o.deorbit_burn === "done", 6000], ["RE-ENTRY", (sn, o) => o.entry_interface === "done", 1900],
    ["APPROACH", (sn, o) => o.taem_gate === "done", 1600], ["TOUCHDOWN", (sn, o) => o.touchdown === "done", 400], ["STOPPED", (sn, o) => o.wheels_stop === "done", 60],
  ];

  const CSS = `
  #shuttle-hud{--ink:#ede8dd;--dim:#8e897f;--line:rgba(237,232,221,.78);--blue:#5cc2ec;--rose:#c9576a;--void:rgba(0,0,0,.74);
    position:fixed;inset:0;z-index:4000;pointer-events:none;color:var(--ink);font:13px/1.45 "Share Tech Mono",ui-monospace,Menlo,Consolas,monospace;letter-spacing:.02em;text-transform:uppercase}
  #shuttle-hud *{box-sizing:border-box}
  #shuttle-hud .top{position:absolute;left:50%;top:12px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
  #shuttle-hud .tl{position:relative;width:min(640px,80vw);height:34px}
  #shuttle-hud .tl .ln{position:absolute;left:0;right:0;top:22px;height:1px;background:rgba(237,232,221,.35)}
  #shuttle-hud .tl .ln i{position:absolute;left:0;top:0;height:1px;background:var(--ink)}
  #shuttle-hud .tl .ev{position:absolute;top:22px;transform:translate(-50%,-50%);width:7px;height:7px;border-radius:50%;border:1px solid var(--ink);background:#000}
  #shuttle-hud .tl .ev.d{background:var(--ink)} #shuttle-hud .tl .ev.n{border-color:var(--blue);box-shadow:0 0 6px var(--blue)}
  #shuttle-hud .tl .lb{position:absolute;top:0;transform:translateX(-50%);font-size:10px;color:var(--dim);white-space:nowrap}
  #shuttle-hud .tl .lb.d{color:var(--ink)} #shuttle-hud .tl .lb.n{color:var(--blue)} #shuttle-hud .tl .lb.lo{top:28px}
  #shuttle-hud .tl .mk{position:absolute;top:22px;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;background:var(--ink);box-shadow:0 0 8px var(--ink)}
  #shuttle-hud .tag{display:flex;align-items:stretch;border:1px solid var(--line);background:var(--void)}
  #shuttle-hud .tag b{background:var(--ink);color:#000;font-weight:400;padding:3px 10px}
  #shuttle-hud .tag span{padding:3px 10px;white-space:nowrap} #shuttle-hud .tag .w{color:var(--blue)}
  #shuttle-hud .prompt{position:absolute;left:50%;bottom:58px;transform:translateX(-50%);width:min(760px,92vw);background:var(--void);border-left:3px solid var(--ink);padding:9px 14px 9px 12px}
  #shuttle-hud .prompt .l1{font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #shuttle-hud .prompt .l1 .k{display:inline-block;border:1px solid var(--ink);padding:0 6px;margin:0 2px;line-height:1.25}
  #shuttle-hud .prompt .l2{color:var(--dim);font-size:12px;margin-top:2px;text-transform:none;letter-spacing:0}
  #shuttle-hud .prompt .who{color:var(--blue)} #shuttle-hud .prompt.wait{border-left-color:var(--dim)} #shuttle-hud .prompt.wait .l1{color:var(--dim)}
  #shuttle-hud .prompt.alert{border-left-color:var(--rose)} #shuttle-hud .prompt.alert .who{color:var(--rose)}
  #shuttle-hud .cur{display:inline-block;width:.6em;height:1em;background:var(--ink);vertical-align:-2px;margin-left:4px;animation:oscur 1s steps(2) infinite}
  @keyframes oscur{50%{opacity:0}}
  #shuttle-hud .steer{position:absolute;inset:0;pointer-events:none}
  #shuttle-hud .steer i{position:absolute;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;border-top:3px solid #ffd21a;border-right:3px solid #ffd21a;filter:drop-shadow(0 0 2px #000) drop-shadow(0 0 1px #000)}
  #shuttle-hud .steer b{position:absolute;font:700 22px/1 "Share Tech Mono",monospace;color:#ffd21a;transform:translate(-50%,-50%);text-shadow:0 0 3px #000}
  #shuttle-hud .kb{position:absolute;left:18px;top:50%;transform:translateY(-50%);width:calc(15.2 * var(--ku));height:calc(5.2 * var(--ku));--ku:30px;pointer-events:none}
  #shuttle-hud .kb .k{position:absolute;height:calc(var(--ku) - 4px);width:calc(var(--ku) - 4px);border:1px solid var(--ink);background:rgba(0,0,0,.72);color:var(--ink);font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 0 var(--ink);transform:translateY(-2px)}
  #shuttle-hud .kb .k.w{color:#000;background:var(--ink)}
  @media (max-width:900px){#shuttle-hud .kb{--ku:22px}}
  #shuttle-hud .log{position:absolute;left:18px;top:62px;width:min(520px,60vw);font-size:12px;text-transform:none;letter-spacing:0}
  #shuttle-hud .log div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 0 4px #000,0 0 2px #000;transition:opacity 1.2s}
  #shuttle-hud .log .t{color:var(--dim)} #shuttle-hud .log .bad{color:var(--rose)} #shuttle-hud .log .me{color:var(--blue)}
  #shuttle-hud .chat{position:absolute;left:18px;top:62px;width:min(520px,60vw);display:none;pointer-events:auto;background:var(--void);border:1px solid var(--line)}
  #shuttle-hud .chat input{width:100%;background:transparent;border:0;outline:0;color:var(--ink);font:inherit;padding:5px 8px;text-transform:none}
  #shuttle-hud .hint{position:absolute;right:18px;bottom:16px;color:var(--dim);font-size:11px;text-shadow:0 0 3px #000}
  #shuttle-hud .toast{position:absolute;left:50%;top:18px;transform:translateX(-50%);display:none;background:var(--void);border:1px solid var(--rose);color:var(--ink);padding:5px 12px;text-transform:none;letter-spacing:0}
  #shuttle-hud .banner{position:absolute;right:18px;top:16px;display:none;border:1px solid var(--rose);color:var(--rose);background:var(--void);padding:3px 10px}
  #shuttle-hud .scope{position:absolute;inset:0;display:none;align-items:center;justify-content:center}
  #shuttle-hud .scope i{position:absolute;width:min(62vh,62vw);height:min(62vh,62vw);border:1px solid var(--line);border-radius:50%}
  #shuttle-hud .scope em{position:absolute;bottom:20%;font-style:normal;color:var(--dim)}
  /* windows: DATA page and mission cards */
  #shuttle-hud .win{position:absolute;inset:14px;display:none;flex-direction:column;border:1px solid var(--line);background:rgba(0,0,0,.66);pointer-events:auto}
  #shuttle-hud .win.card{inset:auto;left:50%;top:50%;transform:translate(-50%,-50%);width:min(820px,94vw);max-height:90vh;background:rgba(0,0,0,.88)}
  #shuttle-hud .wh{display:flex;justify-content:space-between;border-bottom:1px solid var(--line)}
  #shuttle-hud .wh b{background:var(--ink);color:#000;font-weight:400;padding:4px 14px;min-width:30%}
  #shuttle-hud .wh span{padding:4px 14px;font-size:15px}
  #shuttle-hud .crumb{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:3px 14px;font-size:11px;color:var(--ink)}
  #shuttle-hud .wb{flex:1;overflow:auto;padding:16px 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px 28px;align-content:start}
  #shuttle-hud .card .wb{display:block}
  #shuttle-hud .sec{border-left:3px solid var(--ink);padding-left:12px}
  #shuttle-hud .sec h3{margin:0 0 8px;font-weight:400;font-size:14px}
  #shuttle-hud .rows{display:grid;grid-template-columns:auto 1fr;gap:1px 14px;font-size:12px}
  #shuttle-hud .rows .v{text-align:right;color:var(--ink)} #shuttle-hud .rows .n{color:var(--dim)}
  #shuttle-hud .sec ul{list-style:none;margin:0;padding:0;font-size:12px} #shuttle-hud .sec li{margin:1px 0}
  #shuttle-hud .done{color:var(--dim)} #shuttle-hud .now{color:var(--blue)} #shuttle-hud .me{color:var(--blue)} #shuttle-hud .bad{color:var(--rose)}
  #shuttle-hud .txt{text-transform:none;letter-spacing:0;font-size:13px;max-width:72ch} #shuttle-hud .txt p{margin:0 0 10px}
  #shuttle-hud .wf{display:flex;align-items:center;gap:0;padding:0 14px 8px;margin-top:auto}
  #shuttle-hud .wf .bar{margin-left:auto;display:flex;height:4px;width:min(260px,40vw)}
  #shuttle-hud .wf .bar i{flex:1;background:var(--rose);margin-left:1px} #shuttle-hud .wf .bar i.d{background:var(--blue)}
  #shuttle-hud button{font:inherit;text-transform:uppercase;color:var(--ink);background:transparent;border:1px solid var(--line);padding:4px 10px;margin:0 6px 6px 0;cursor:pointer;letter-spacing:.04em}
  #shuttle-hud button:hover,#shuttle-hud button:focus-visible{background:var(--ink);color:#000;outline:0}
  #shuttle-hud button:disabled{opacity:.3;cursor:default;background:transparent;color:var(--ink)}
  #shuttle-hud button .k{color:var(--dim);margin-left:8px} #shuttle-hud button:hover .k{color:#000}
  #shuttle-hud .touch{position:absolute;left:50%;transform:translateX(-50%);bottom:132px;display:none;gap:4px;pointer-events:auto}
  #shuttle-hud .touch button{width:46px;height:40px;margin:0;padding:0}
  @media (max-width:720px){#shuttle-hud .prompt{bottom:44px}#shuttle-hud .prompt .l1{font-size:14px}#shuttle-hud .log{display:none}#shuttle-hud .hint{display:none}#shuttle-hud .win{inset:4px}}
  @media (prefers-reduced-motion:reduce){#shuttle-hud .cur{animation:none}}
  `;

  class ShuttleHud {
    constructor(onCommand, opts) {
      this.onCommand = onCommand; this.opts = opts || {};
      if (!document.getElementById("shuttle-hud-css")) { const st = document.createElement("style"); st.id = "shuttle-hud-css"; st.textContent = CSS; document.head.appendChild(st); }
      const root = document.createElement("div"); root.id = "shuttle-hud"; this.root = root;
      root.innerHTML = `
        <div class="top"><div class="tl" id="sh-tl"></div><div class="tag"><b id="sh-id">SHUTTLE</b><span id="sh-phase"></span><span id="sh-met"></span><span id="sh-warp" class="w"></span></div></div>
        <div class="kb" id="sh-kb"></div>
        <div class="steer" id="sh-steer"></div>
        <div class="banner" id="sh-banner">PRACTICE MODE — QUICK START</div>
        <div class="prompt" id="sh-prompt"><div class="l1" id="sh-l1"></div><div class="l2" id="sh-l2"></div></div>
        <div class="log" id="sh-log"></div>
        <div class="chat" id="sh-chat"><input id="sh-chatin" maxlength="140" placeholder="> message the crew, Enter to send" /></div>
        <div class="hint" id="sh-hint">F3 stats · / chat · Right-click zoom</div>
        <div class="toast" id="sh-toast"></div>
        <div class="scope" id="sh-scope"><i></i><em id="sh-scopefov"></em></div>
        <div class="touch" id="sh-touch"></div>
        <div class="win" id="sh-data"></div>
        <div class="win card" id="sh-modal"><div id="sh-card" style="display:contents"></div></div>`;
      document.body.appendChild(root);
      this.el = (id) => root.querySelector("#" + id);
      this._buildTouch();
      const ci = this.el("sh-chatin");
      ci.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { if (ci.value.trim()) this.onCommand("CHAT", ci.value.trim()); ci.value = ""; ci.blur(); }
        if (e.key === "Escape") ci.blur();
        e.stopPropagation();
      });
      ci.addEventListener("blur", () => { this.el("sh-chat").style.display = "none"; this.el("sh-log").style.visibility = ""; });
      this.el("sh-data").addEventListener("click", (e) => { const b = e.target.closest("button[data-cmd]"); if (b) { b.blur(); this.onCommand(b.dataset.cmd, b.dataset.arg); } });
      this.lines = []; this.lastHtml = {}; this.modalKind = null; this.t = 0; this.dataOpen = false; this.promptKey = "";
    }
    _set(id, html) { if (this.lastHtml[id] !== html) { this.lastHtml[id] = html; this.el(id).innerHTML = html; } }

    // ------------------------------------------------------------------ input helpers
    _buildTouch() {
      const defs = [["pitch", 1, "▲"], ["pitch", -1, "▼"], ["roll", -1, "◀"], ["roll", 1, "▶"], ["yaw", -1, "⟲"], ["yaw", 1, "⟳"], ["ty", -1, "DN"], ["ty", 1, "UP"], ["sb", 1, "AIR+"], ["sb", -1, "AIR−"], ["brake", 1, "BRAKE"]];
      const box = this.el("sh-touch"); this.touchAxes = {};
      for (const [axis, val, label] of defs) {
        const b = document.createElement("button"); b.textContent = label;
        const on = (e) => { e.preventDefault(); this.touchAxes[axis + val] = { axis, val }; };
        const off = (e) => { e.preventDefault(); delete this.touchAxes[axis + val]; };
        b.addEventListener("pointerdown", on); ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => b.addEventListener(ev, off));
        box.appendChild(b);
      }
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) box.style.display = "flex";
    }
    toggleTouch() { const b = this.el("sh-touch"); b.style.display = b.style.display === "flex" ? "none" : "flex"; }
    touchInput() { const out = {}; for (const k of Object.keys(this.touchAxes)) { const a = this.touchAxes[k]; out[a.axis] = (out[a.axis] || 0) + a.val; } return out; }
    clearTouch() { this.touchAxes = {}; }
    toggleData(force) { this.dataOpen = force === undefined ? !this.dataOpen : !!force; this.el("sh-data").style.display = this.dataOpen ? "flex" : "none"; this.lastHtml["sh-data"] = null; }

    // ------------------------------------------------------------------ feedback
    toast(msg) { const el = this.el("sh-toast"); el.textContent = msg; el.style.display = "block"; clearTimeout(this._toastT); this._toastT = setTimeout(() => { el.style.display = "none"; }, 3500); }
    crewLog(log) { if (log.accepted && log.type !== "SET_WARP") this._line(`<span class="me">${esc(log.by)}@${SEAT[log.seat] ? SEAT[log.seat].toLowerCase() : "crew"}</span> ${esc(log.type.replace(/_/g, " ").toLowerCase())}`); }
    events() { /* phase / failure messages arrive in the snapshot log */ }
    chat(comm) { this._line(`<span class="me">${esc(comm.sender)}:</span> ${esc(comm.text)}`); }
    _line(html) { this.lines.push({ html, at: performance.now() }); if (this.lines.length > 12) this.lines.shift(); this._drawLog(); }
    focusChat() { this.el("sh-chat").style.display = "block"; this.el("sh-log").style.visibility = "hidden"; this.el("sh-chatin").focus(); }

    // ------------------------------------------------------------------ windows
    _win(title, right, crumb, page, body, progress) {
      const bar = progress ? `<div class="bar">${PHASES.slice(1, 9).map((p, i) => `<i class="${i < progress ? "d" : ""}"></i>`).join("")}</div>` : "";
      return `<div class="wh"><b>${esc(title)}</b><span>${esc(right)}</span></div><div class="crumb"><span>${esc(crumb)}</span><span>${esc(page)}</span></div>
        <div class="wb">${body}</div><div class="wf">${bar}</div>`;
    }
    _sec(title, inner) { return `<div class="sec"><h3>${esc(title)}</h3>${inner}</div>`; }
    _rows(list) { return `<div class="rows">${list.map(([n, v, cls]) => `<span class="n">${esc(n)}</span><span class="v ${cls || ""}">${v}</span>`).join("")}</div>`; }
    showModal(kind, title, crumb, body) {
      this.modalKind = kind;
      const m = this.el("sh-modal");
      m.innerHTML = `<div id="sh-card" style="display:contents">${this._win(title, "INTERFELLAS.SHUTTLE_OS", crumb, this._page || "", body, this._prog)}</div>`;
      m.style.display = "flex";
      m.querySelectorAll("button[data-cmd]").forEach((b) => b.addEventListener("click", () => this.onCommand(b.dataset.cmd, b.dataset.arg)));
      const first = m.querySelector("button"); if (first) first.focus();
    }
    hideModal() { this.modalKind = null; this.el("sh-modal").style.display = "none"; }
    _btn(cmd, label, arg) { return `<button data-cmd="${cmd}"${arg ? ` data-arg="${esc(arg)}"` : ""}>${esc(label)}</button>`; }

    briefing(sn, roles) {
      const crew = (sn && sn.crew) || {}, info = this.opts.crew.info;
      const seats = ["cdr", "plt", "ms1", "ms2"].map((r) => {
        const c = crew[r] || {}, mine = roles.includes(r);
        return `<li class="${mine ? "me" : ""}">${SEAT[r]}  ${esc(c.name || "--")}${c.name && !c.filled ? " (covering)" : ""}${mine ? "  ◂ you" : ""}<br><span class="done" style="text-transform:none">${esc(info[r].duty)}</span></li>`;
      }).join("");
      const cdr = roles.includes("cdr");
      this.showModal("briefing", "MISSION BRIEF", "SHUTTLE FLIGHT // BRIEFING", `
        <div class="txt"><p>Launch to orbit, release a satellite from the cargo bay, and glide back to land on Florida Runway 15.</p>
        <p>Climbing into space is automatic: drag the mouse to look around. Once in space, each crew seat has its own job, and the prompt at the bottom of the screen always says what to do next and who does it. Re-entry and runway landing are flown by hand.</p></div>
        ${this._sec("CREW", `<ul>${seats}</ul>`)}
        <div style="margin-top:16px">${cdr ? this._btn("START", "Start the count  [Enter]") : '<span class="done">Waiting for the Commander to start the count</span><span class="cur"></span><br><br>'}${this._btn("LEAVE", "Leave flight")}</div>`);
    }
    failureCard(sn) {
      const f = sn.failure, cks = sn.checkpoints.slice().reverse();
      const lobbyBtn = this.opts && this.opts.canReturnLobby ? this._btn("RETURN_LOBBY", "Return to lobby") : "";
      this.showModal("failure", "MISSION STOPPED", `SHUTTLE FLIGHT // ${(f.phase || "").toUpperCase()} // STOPPED`, `
        <div class="txt"><p class="bad">${esc(f.reason)}</p><p>Retry from a checkpoint. The Commander chooses${f.checkpoint ? `; suggested: ${esc(f.checkpoint)}` : ""}.</p></div>
        <div>${cks.map((c) => this._btn("RETRY_CHECKPOINT", "Retry from " + c, c)).join("")}</div>
        <div>${this._btn("RESTART", "New mission")}${lobbyBtn}${this._btn("LEAVE", "Leave flight")}</div>`);
    }
    pauseCard(sn) {
      const cks = sn.checkpoints.slice().reverse();
      const lobbyBtn = this.opts && this.opts.canReturnLobby ? this._btn("RETURN_LOBBY", "Return to lobby") : "";
      this.showModal("pause", "PAUSED", "SHUTTLE FLIGHT // PAUSED", `
        <div class="txt"><p>The Commander paused the flight.</p></div>
        <div>${this._btn("PAUSE", "Resume  [Esc]")}</div>
        <div>${cks.map((c) => this._btn("RETRY_CHECKPOINT", "Restart from " + c, c)).join("")}</div>
        <div>${this._btn("RESTART", "New mission")}${lobbyBtn}${this._btn("LEAVE", "Leave flight")}</div>`);
    }
    debriefCard(sn) {
      const r = sn.result, td = r.touchdown || {};
      const done = sn.objectives.filter((o) => o.status === "done").length;
      const lobbyBtn = this.opts && this.opts.canReturnLobby ? this._btn("RETURN_LOBBY", "Return to lobby") : "";
      this.showModal("debrief", r.success ? "MISSION COMPLETE" : "MISSION ENDED", "SHUTTLE FLIGHT // DEBRIEF", `
        <div class="txt"><p class="${r.success ? "me" : "bad"}">${esc(r.summary)}</p></div>
        <div class="wb" style="padding:0;margin-bottom:14px">
        ${this._sec("TOUCHDOWN", this._rows([["Landing Drop Speed", f2(td.sink) + " m/s"], ["Groundspeed", f0(td.gs) + " m/s"], ["Past runway start", f0(td.x) + " m"], ["Off center", f1(td.y) + " m"], ["Stopped at", f0(r.stopX) + " m"]]))}
        ${this._sec("FLIGHT", this._rows([["Retries", String(r.retries)], ["Peak G-force", f2(r.maxG) + " g"], ["Peak heat", f0(r.maxHeat) + " W/cm²"], ["Engine fuel used", f0(r.dvOMS) + " m/s"], ["Tasks", `${done}/${sn.objectives.length}`]]))}
        </div>
        ${r.failures.length ? `<div class="txt"><p>${r.failures.map((x) => `${esc(x.phase)}: ${esc(x.reason)}`).join("<br>")}</p></div>` : ""}
        <div>${this._btn("RESTART", "Fly again")}${lobbyBtn}${this._btn("LEAVE", "Leave flight")}</div>`);
    }

    // ------------------------------------------------------------------ the DATA page (F3)
    _dataPage(sn, extra) {
      const t = sn.telemetry, g = sn.guidance, ph = sn.phase, v = sn.vehicle, roles = extra.roles || [];
      const tel = [["Height", t.altitudeM > 20000 ? f1(t.altitudeM / 1000) + " km" : f0(t.altitudeM) + " m"], ["Air speed", f0(t.airspeedMps) + " m/s"], ["Sound speed (Mach)", f2(t.mach)]];
      if (v.regime !== "ground") tel.push(["Space speed", f0(t.inertialSpeedMps) + " m/s"]);
      if (["prelaunch", "ascent", "insertion", "payload", "deorbit"].includes(ph)) {
        tel.push(["Climb / fall speed", f0(t.verticalSpeedMps) + " m/s"]);
        tel.push(["Highest Point", t.bound ? f1(t.apoapsisAltitudeM / 1000) + " km" : "--"], ["Lowest Point", t.periapsisAltitudeM < 0 ? "below ground" : f1(t.periapsisAltitudeM / 1000) + " km"], ["Path tilt", deg(t.inclinationRad)]);
        if (ph === "ascent" || ph === "prelaunch") tel.push(["Air push", f1(t.dynPressPa / 1000) + " kPa"], ["Throttle", f0((v.eng.throttle || 0) * 100) + "%"]);
      }
      if (v.regime === "orbit") {
        tel.push(["Spin speed", f2(t.relRateRad / DEG) + " °/s"]);
        if (ph === "payload" && sn.payload.attached) tel.push(["Release aim error", deg(t.releaseErrRad)]);
        if (ph === "deorbit") tel.push(["Backward aim error", deg(t.retroErrRad)]);
        if (sn.payload.released) tel.push(["Satellite distance", f1(sn.payload.range) + " m"], ["Drift speed", f2(sn.payload.rangeRate) + " m/s"]);
      }
      if (ph === "entry") tel.push(["Wing tilt", LR(t.bankRad)], ["Target wing tilt", LR(g.bankCmd)], ["Nose angle up", deg(t.angleOfAttackRad)], ["G-force", f2(t.loadG) + " g"], ["Heat", f0(t.heat) + " W/cm²"], ["Distance to runway", f0(t.rangeToRunwayM / 1000) + " km"]);
      if (ph === "approach" || ph === "rollout") tel.push(["Airspeed", f0(t.eas) + " m/s"], ["Sink speed", f1(t.verticalSpeedMps) + " m/s"], ["Nose angle", deg(t.pitchRad)], ["Wing tilt", LR(t.bankRad)], ["Down runway", f0(t.runwayX) + " m"], ["Off center", f1(t.runwayCrossTrackM) + " m"]);
      const sys = [["Speed", `${sn.warp}× (max ${sn.warpMax}×)`]];
      if (v.regime === "orbit") sys.push(["Auto-Steer", v.dap], ["Cargo doors", f0(v.doors * 100) + "%"], ["Big engine fuel", f0(sn.resources.oms) + " kg"], ["Steering fuel", f0(sn.resources.rcs) + " kg"]);
      if (ph === "entry") sys.push(["Auto nose angle", v.alphaAssist ? "ON" : "OFF"]);
      if (ph === "approach" || ph === "rollout") sys.push(["Speed brake", f0(v.sb * 100) + "%"], ["Wheels", v.gear >= 1 ? "DOWN" : v.gearCmd ? "MOVING" : "UP"]);
      const assets = extra.assets ? Object.entries(extra.assets).filter(([, s]) => s !== "ok") : [];
      sys.push(["3D Models", assets.length ? assets.map(([k, s]) => `${k} ${s}`).join(", ") : "OK"], ["Ping", f0(extra.ping) + " ms"], ["FPS", f0(extra.fps)], ["Comms", esc(extra.comms)]);
      const objs = sn.objectives.filter((o) => o.phase === (ph === "prelaunch" ? "ascent" : ph));
      const nextId = (objs.find((o) => o.status !== "done") || {}).id;
      const tasks = objs.length ? `<ul>${objs.map((o) => `<li class="${o.status === "done" ? "done" : o.id === nextId ? "now" : ""}">${o.status === "done" ? "[x]" : o.id === nextId ? "[>]" : "[ ]"} ${esc(o.label)}</li>`).join("")}</ul>` : `<span class="done">No tasks in this phase</span>`;
      const crew = extra.crew || {};
      const crewL = `<ul>${["cdr", "plt", "ms1", "ms2"].map((r) => `<li class="${roles.includes(r) ? "me" : ""}">${SEAT[r]}  ${esc((crew[r] && crew[r].name) || "--")}${crew[r] && crew[r].name && !crew[r].filled ? " (covering)" : ""}${roles.includes(r) ? "  ◂ you" : ""}</li>`).join("")}</ul>`;
      const grp = keyGroup(ph), keys = [];
      for (const r of roles) { const k = KEYS[r] || {}; for (const row of (k[grp] || []).concat(k.any || [])) keys.push([`${row[0]}`, `${SEAT[r]} ${row[1]}`]); }
      for (const row of KEYS.all) keys.push([row[0], row[1]]);
      const al = new Set(sn.allowedCommands), owns = (c) => { const s = this.opts.crew.commandRole[c]; return !s || roles.includes(s); };
      const can = { BAY: (al.has("OPEN_BAY") || al.has("CLOSE_BAY")) && owns("OPEN_BAY"), "WARP-": al.has("SET_WARP") && owns("SET_WARP"), "WARP+": al.has("SET_WARP") && owns("SET_WARP"), PAUSE: owns("PAUSE") && !sn.failure && !sn.result, TOUCH: true, COMMS: true, LEAVE: true };
      const cmds = CMDS.filter(([c]) => (c in can ? can[c] : al.has(c) && owns(c))).map(([c, label, k]) => `<button data-cmd="${c}">${label}${k ? `<span class="k">${k}</span>` : ""}</button>`).join("");
      const pi = PHASES.indexOf(ph);
      return {
        frame: this._win("FLIGHT STATS", "SHUTTLE MISSION DISPLAY", `SHUTTLE // ${roles.map((r) => SEAT[r]).join("+") || "CREW"} // ${PHASE_TAG[ph] || ph}`, `P.${String(pi).padStart(3, "0")}`,
          '<div id="sh-dlive" style="display:contents"></div>' + this._sec(`TASKS · ${PHASE_TAG[ph] || ph}`, tasks) + this._sec("CREW", crewL) + this._sec("YOUR KEYS", this._rows(keys)) + this._sec("CONTROLS", `<div>${cmds}</div>`), Math.max(0, pi - 1)),
        live: this._sec("LIVE NUMBERS", this._rows(tel)) + this._sec("SYSTEMS", this._rows(sys)),
      };
    }

    // ------------------------------------------------------------------ the prompt
    _prompt(sn, roles) {
      const n = (sn.guidance && sn.guidance.next) || { seat: "all", key: "", text: "", detail: "" };
      const mine = n.seat === "all" || roles.includes(n.seat);
      const keyHtml = (s) => esc(s).replace(/\[([^\]]+)\]/g, '<span class="k">$1</span>');
      const who = n.seat === "all" ? "ALL" : SEAT[n.seat] || "";
      const crew = sn.crew || {}, name = crew[n.seat] && crew[n.seat].name;
      let l1, cls = "";
      if (mine) { l1 = `<span class="who">${who} &gt;</span> ${keyHtml(n.text)}${n.key && !/\[/.test(n.text) ? ` <span class="k">${esc(n.key)}</span>` : ""}<span class="cur"></span>`; }
      else { cls = "wait"; l1 = n.key ? `<span class="who">${who} &gt;</span> waiting for ${esc(name || who)}: ${keyHtml(n.text)}` : `<span class="who">${who} &gt;</span> ${keyHtml(n.text)}`; }
      if (sn.failure || sn.phase === "approach" && /FLARE/.test(n.text)) cls = "alert";
      if (n.text.startsWith("REVERSE")) cls = "alert";
      let l2 = esc(n.detail || "");
      // the flight phases need one live number pair in the prompt (no other gauges on screen)
      const t = sn.telemetry, g = sn.guidance;
      // steering lives in the arrows next to the orbiter; the prompt keeps only context
      if (sn.phase === "entry") l2 = `Follow the arrows: tilt wings toward them, flip sides when they switch · ${f0(t.rangeToRunwayM / 1000)} km to runway`;
      if (sn.phase === "approach" && g.appr) { const a = g.appr, fin = /FINAL|PREFLARE|SHALLOW|FLARE/.test(a.mode || "");
        l2 = `Follow the arrows next to the shuttle · ${f0(t.altitudeM)} m${fin ? (t.eas < 138 ? " · SLOW: arrows will ask for a gentler drop" : t.eas > 168 ? " · FAST: Pilot opens air brake [X]" : "") : ""}`; }
      return { l1, l2, cls };
    }
    _timeline(sn) {
      const o = {}; for (const ob of sn.objectives) o[ob.id] = ob.status;
      const done = MILESTONES.map((m) => !!m[1](sn, o));
      let next = done.indexOf(false); if (next < 0) next = MILESTONES.length;
      // remember when each milestone was reached (sim time) to place the marker inside the current segment
      this._mt = this._mt || {}; const key = sn.missionId;
      if (this._mtId !== key) { this._mt = {}; this._mtId = key; }
      done.forEach((d, i) => { if (d && this._mt[i] === undefined) this._mt[i] = sn.simTime; if (!d) delete this._mt[i]; });
      const first = Math.max(0, Math.min(next - 2, MILESTONES.length - 5)), shown = MILESTONES.slice(first, first + 5);
      const x = (i) => 8 + 84 * (i - first) / 4;
      let prog = 0;
      if (next > 0 && next < MILESTONES.length) { const t0 = this._mt[next - 1]; if (t0 !== undefined) prog = Math.max(0, Math.min(0.97, (sn.simTime - t0) / Math.max(1, MILESTONES[next][2]))); }
      const mk = next >= MILESTONES.length ? x(MILESTONES.length - 1) : next === 0 ? x(0) - 20 : x(next - 1) + (x(next) - x(next - 1)) * prog;
      const html = `<div class="ln"><i style="width:${Math.max(0, Math.min(100, mk)).toFixed(1)}%"></i></div>` +
        shown.map((m, j) => { const i = first + j, cls = done[i] ? "d" : i === next ? "n" : ""; return `<div class="ev ${cls}" style="left:${x(i)}%"></div><div class="lb ${cls} ${j % 2 ? "lo" : ""}" style="left:${x(i)}%">${m[0]}</div>`; }).join("") +
        `<div class="mk" style="left:${Math.max(0, Math.min(100, mk)).toFixed(1)}%"></div>`;
      this._set("sh-tl", html);
    }
    _keyboard(keys) {
      const down = Object.keys(keys || {}).filter((k) => keys[k] && KEYPOS[k]);
      const html = down.map((k) => { const p = KEYPOS[k]; return `<div class="k" style="left:calc(${p.c} * var(--ku));top:calc(${p.r} * var(--ku));width:calc(${p.w} * var(--ku) - 4px)">${p.l}</div>`; }).join("");
      this._set("sh-kb", html);
    }
    // ---- steering demand: lr (+ = steer right), ud (+ = nose up / shallower), roll (+ = roll right),
    // each as 0..3 arrow tips. Approach and entry use the guidance cues; the runway uses the yellow
    // line's aim point; orbit tasks use the key in the NEXT step.
    _steer(sn, roles) {
      const t = sn.telemetry, g = sn.guidance || {}, a = g.appr, n = g.next || {}, ph = sn.phase;
      const lvl = (x, t1, t2, t3) => { const m = Math.abs(x); return (m < t1 ? 0 : m < t2 ? 1 : m < t3 ? 2 : 3) * Math.sign(x); };
      const out = { lr: 0, ud: 0, roll: 0 };
      if (sn.failure || sn.result || sn.paused) return out;
      if (ph === "approach" && a) {
        const gh = t.gammaHoldRad === null || t.gammaHoldRad === undefined ? t.flightPathRad : t.gammaHoldRad;
        out.ud = lvl(((a.gammaCmd === undefined ? a.pitchCue - t.pitchRad : a.gammaCmd - gh)) / DEG, 0.5, 2, 5);
        out.lr = lvl((a.bankCue - t.bankRad) / DEG, 2, 8, 20);
      } else if (ph === "entry" && ok(g.bankCmd)) {
        out.lr = lvl((g.bankCmd - t.bankRad) / DEG, 5, 15, 40);
        if (!sn.vehicle.alphaAssist && ok(g.alphaCmd)) out.ud = lvl((g.alphaCmd - t.angleOfAttackRad) / DEG, 1, 4, 10);
      } else if (ph === "rollout") {
        const gr = sn.vehicle;
        if (this._aim) out.lr = lvl(-Math.atan2(this._aim[0], Math.max(1, this._aim[2])) / DEG, 0.7, 3, 8);
        if (n.key === "W") out.ud = -2;
      } else if (n.key && (n.seat === "all" || roles.includes(n.seat))) {
        const k = n.key, m = /(\d+)°/.exec(n.text || ""), deg = m ? +m[1] : 10, mag = deg > 25 ? 3 : deg > 8 ? 2 : 1;
        if (k === "W") out.ud = -mag; else if (k === "S") out.ud = mag;
        else if (k === "Q") out.lr = -mag; else if (k === "E") out.lr = mag;
        else if (k === "A") out.roll = -mag; else if (k === "D") out.roll = mag;
        else if (k === "K") out.ud = -2;
      }
      return out;
    }
    _drawSteer(sn, roles, anchors) {
      if (!anchors || !anchors.c.ok || this.modalKind || this.dataOpen) { this._set("sh-steer", ""); return; }
      const st = this._steer(sn, roles), c = anchors.c, html = [];
      const chev = (A, count) => {
        if (!A || !A.ok || !count) return;
        let dx = A.x - c.x, dy = A.y - c.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const r0 = Math.max(46, Math.min(160, L)), ang = Math.atan2(dy, dx) * 180 / Math.PI + 45;   // the box's top-right corner points along +x
        for (let i = 0; i < Math.abs(count); i++) { const rr = r0 + i * 13; html.push(`<i style="left:${(c.x + dx * rr).toFixed(0)}px;top:${(c.y + dy * rr).toFixed(0)}px;transform:rotate(${ang.toFixed(0)}deg)"></i>`); }
      };
      chev(st.lr > 0 ? anchors.right : anchors.left, st.lr);
      chev(st.ud > 0 ? anchors.up : anchors.down, st.ud);
      if (st.roll) { const A = anchors.up, dx = A.x - c.x, dy = A.y - c.y, L = Math.hypot(dx, dy) || 1, rr = Math.max(46, Math.min(160, L)) + 24;
        html.push(`<b style="left:${(c.x + dx / L * rr).toFixed(0)}px;top:${(c.y + dy / L * rr).toFixed(0)}px">${st.roll > 0 ? "↻" : "↺"}${Math.abs(st.roll) > 1 ? (st.roll > 0 ? "↻" : "↺") : ""}</b>`); }
      this._set("sh-steer", html.join(""));
    }
    _drawLog() {
      const now = performance.now();
      const html = this.lines.slice(-4).map((x) => `<div style="opacity:${now - x.at > 9000 ? 0 : 1}">${x.html}</div>`).join("");
      this._set("sh-log", html);
    }

    // ------------------------------------------------------------------ per frame
    update(sn, dt, extra) {
      this.t += dt; extra = extra || {};
      const roles = extra.roles || [];
      const pi = PHASES.indexOf(sn.phase); this._page = `P.${String(pi).padStart(3, "0")}`; this._prog = Math.max(0, pi - 1);
      if (sn.failure) { if (this.modalKind !== "failure") this.failureCard(sn); }
      else if (sn.result) { if (this.modalKind !== "debrief") this.debriefCard(sn); }
      else if (sn.phase === "briefing") { const key = JSON.stringify([sn.crew, roles]); if (this.modalKind !== "briefing" || this._briefKey !== key) { this._briefKey = key; this.briefing(sn, roles); } }
      else if (sn.paused) { if (this.modalKind !== "pause") this.pauseCard(sn); }
      else if (this.modalKind) this.hideModal();
      this._keyboard(extra.keys);   // every frame: pressed keys must appear instantly
      this._aim = extra.aim || null;
      this._drawSteer(sn, roles, extra.anchors);
      if (this.t < 0.1) return; this.t = 0;
      this._set("sh-id", esc(sn.missionId));
      this._set("sh-phase", PHASE_TAG[sn.phase] || sn.phase);
      this._set("sh-met", sn.phase === "prelaunch" ? `T-${f0(sn.countdown)}` : sn.met === null ? "" : `T${met(sn.met)}`);
      this._set("sh-warp", sn.warp > 1 ? `${sn.warp}×` : "");
      this._timeline(sn);
      this.el("sh-banner").style.display = sn.integrity !== "normal" ? "block" : "none";
      const p = this._prompt(sn, roles);
      this.el("sh-prompt").className = "prompt " + p.cls;
      this.el("sh-prompt").style.display = this.modalKind || this.dataOpen || !p.l1 ? "none" : "";
      this._set("sh-l1", p.l1); this._set("sh-l2", p.l2);
      // mission log: new snapshot messages are appended to the terminal lines once
      for (const m of sn.messages) {
        const id = m.t + "|" + m.text; if (this._seen && this._seen.has(id)) continue;
        (this._seen = this._seen || new Set()).add(id);
        this._line(`<span class="t">${met(m.t - (sn.simTime - (sn.met || 0)))}</span> <span class="${m.level === "fail" ? "bad" : ""}">${esc(m.text)}</span>`);
      }
      this._drawLog();
      const sc = extra.scope;
      this.el("sh-scope").style.display = sc && sc.on ? "flex" : "none";
      if (sc && sc.on) this._set("sh-scopefov", `SCOPE ${f1(60 / sc.fov)}× · FOV ${f2(sc.fov)}° · wheel to zoom`);
      // DATA page: the frame (tasks, crew, keys, command buttons) only rebuilds when it changes, so buttons
      // stay clickable; telemetry/systems refresh in their own slot at ~4 Hz
      if (this.dataOpen) {
        const d = this._dataPage(sn, extra);
        if (this.lastHtml["sh-data"] !== d.frame) { this.lastHtml["sh-data"] = d.frame; this.el("sh-data").innerHTML = d.frame; this.lastHtml["sh-dlive"] = null; }
        this._dl = (this._dl || 0) + 1; if (this._dl % 2 === 0 || this.lastHtml["sh-dlive"] === null) this._set("sh-dlive", d.live);
      }
    }
    dispose() { if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root); }
  }
  window.ShuttleHud = ShuttleHud;
})();
