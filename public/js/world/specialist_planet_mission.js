(function (window) {
  "use strict";
  const destinations = new Set(["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"]);
  let hostNow, selectedNow, listening = false, tickTimer, lastAccessKey;
  const net = () => window.netManager;
  const mission = () => net() && typeof net().getMission === "function" ? net().getMission() : null;
  const getFlight = () => mission() && mission().specialistFlight;
  const title = id => id ? id[0].toUpperCase() + id.slice(1) : "planet";
  const fmt = (number, digits = 0) => Number(number).toLocaleString("en-US", { maximumFractionDigits: digits });
  const elapsedLabel = ms => {
    const seconds = Math.max(0, ms / 1000);
    if (seconds < 60) return fmt(seconds, 1) + " sec";
    if (seconds < 3600) return fmt(seconds / 60, 1) + " min";
    if (seconds < 86400) return fmt(seconds / 3600, 1) + " h";
    return fmt(seconds / 86400, 1) + " days";
  };
  const utc = (ms, seconds = false) => new Date(ms).toISOString().slice(0, seconds ? 19 : 16).replace("T", " ") + " UTC";
  const numberValue = value => Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  const html = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function accessState() {
    const connection = net(), room = connection && connection.roomState;
    const players = room && Array.isArray(room.players) ? room.players : [];
    const local = players.find(player => player.id === connection.socketId) || (connection && connection.localPlayer) || {};
    const roles = window.InterfellasRoles;
    const role = roles && typeof roles.normalizeRole === "function" ? roles.normalizeRole(local.role, "commander") : String(local.role || "").toLowerCase();
    const specialist = players.find(player => {
      const playerRole = roles && typeof roles.normalizeRole === "function" ? roles.normalizeRole(player.role, "commander") : String(player.role || "").toLowerCase();
      return playerRole === "specialist";
    });
    const atStation = !!(mission() && mission().phase === "station");
    const isGround = local.team === "ground" || role === "flight_director" || role === "ground_capcom";
    return { role, allowed: role === "specialist", specialist, atStation, isGround,
      canClaim: !!(connection && connection.connected && connection.roomId && room && Array.isArray(room.players) && atStation && !isGround && !specialist && local.role) };
  }
  function accessKey(access) {
    return [access.role, access.atStation, access.isGround, access.canClaim, access.specialist && access.specialist.id, access.specialist && access.specialist.name].join("|");
  }
  function accessNotice(access) {
    if (access.allowed) return "";
    let message;
    if (!access.atStation) message = "Dock with the ISS first. The Space Specialist operates this expedition.";
    else if (access.specialist) message = html(access.specialist.name || "A crewmember") + " is the Space Specialist. You can monitor the flight; only the specialist can operate it.";
    else if (access.isGround) message = "The Space Specialist role is open. A flight crewmember at the ISS can take it; Ground Control can monitor the flight.";
    else message = "The Space Specialist role is open. Take the role to operate this expedition.";
    return '<div class="sp-notice">' + message + (access.canClaim ? '<button type="button" class="sp-secondary" data-claim-specialist>Become Space Specialist <span>→</span></button>' : '') + '</div>';
  }

  function progress(flight) {
    if (!flight || !flight.playback) return 0;
    return Math.max(0, Math.min(1, (Date.now() - flight.playback.startAt) / flight.playback.durationMs));
  }
  function stateAt(points, epoch) {
    if (!points || !points.length) return null;
    let lo = 0, hi = points.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (points[mid][0] <= epoch) lo = mid + 1; else hi = mid; }
    const a = points[Math.max(0, lo - 1)], b = points[Math.min(lo, points.length - 1)];
    const t = b[0] === a[0] ? 0 : Math.max(0, Math.min(1, (epoch - a[0]) / (b[0] - a[0])));
    return a.map((v, i) => i ? v + (b[i] - v) * t : epoch);
  }
  function draw(canvas, points, epoch) {
    if (!canvas || !points || !points.length) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h);
    const max = Math.max(1, ...points.map(s => Math.max(Math.abs(s[1]), Math.abs(s[2])))) * 1.1;
    const scale = Math.min(w, h) / (2 * max), xy = s => [w / 2 + s[1] * scale, h / 2 - s[2] * scale];
    ctx.strokeStyle = "#76d6c8"; ctx.lineWidth = 2; ctx.beginPath();
    points.forEach((point, i) => { const p = xy(point); if (i) ctx.lineTo(...p); else ctx.moveTo(...p); }); ctx.stroke();
    const dot = (p, color, radius) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], radius, 0, Math.PI * 2); ctx.fill(); };
    const now = stateAt(points, epoch), target = now.length >= 10 ? [now[0], now[7], now[8]] : points[points.length - 1];
    dot([w / 2, h / 2], "#ffc879", 5); dot(xy(target), "#fc9877", 4); dot(xy(now), "#fff", 4);
  }
  function render(host, planet) {
    if (!host) return;
    const detailsOpen = !!host.querySelector(".sp-details[open]");
    const oldInputs = host.querySelector("[data-burn-input]");
    const draft = oldInputs ? Object.fromEntries([...host.querySelectorAll("[data-burn-input]")].map(x => [x.dataset.burnInput, x.value])) : null;
    clearInterval(tickTimer); hostNow = host; selectedNow = planet;
    if (!listening && net() && typeof net().on === "function") {
      listening = true;
      net().on("mission_update", payload => {
        if (payload && hostNow && hostNow.isConnected && (payload.action === "specialist_flight" || accessKey(accessState()) !== lastAccessKey)) render(hostNow, selectedNow);
      });
      net().on("room_update", () => {
        if (hostNow && hostNow.isConnected && accessKey(accessState()) !== lastAccessKey) render(hostNow, selectedNow);
      });
    }
    host.innerHTML = '<section class="sp-task"><div class="sp-eyebrow">ISS · PLANET EXPEDITION</div><div class="sp-body"></div></section>';
    const box = host.querySelector(".sp-body"), flight = getFlight(), m = mission(), access = accessState();
    lastAccessKey = accessKey(access);
    if (!destinations.has(planet)) {
      box.innerHTML = '<h3>' + (planet === "earth" ? 'Departure point' : 'No planet mission') + '</h3><p class="sp-copy">' + (planet === "earth" ? 'The expedition starts near the ISS. Select another planet on the Solar Map.' : 'Select Mercury, Venus, Mars, Jupiter, Saturn, Uranus or Neptune to plan an expedition.') + '</p>';
      return;
    }
    if (flight && flight.planet !== planet) {
      box.innerHTML = '<h3>Expedition in progress</h3><p class="sp-copy">Your crew is planning a flight to ' + html(title(flight.planet)) + '.</p><button class="sp-primary" data-switch>View active mission <span>→</span></button>' +
        (access.allowed ? '<button class="sp-quiet" data-action="reset">End current expedition</button>' : accessNotice(access)) + '<p class="sp-status" role="status"></p>';
      box.querySelector("[data-switch]").addEventListener("click", () => window.solarSystem && window.solarSystem._selectDestination(flight.planet));
      bindActions(box, planet); return;
    }
    if (!flight) {
      const atStation = !!(m && m.phase === "station");
      box.innerHTML = '<div class="sp-head"><h3>Mission to ' + html(title(planet)) + '</h3><span class="sp-badge">PLAN</span></div><p class="sp-copy">Begin from an ISS-like Earth orbit, plan a burn and use GMAT to predict the route.</p>' +
        (atStation && access.allowed ? '<button class="sp-primary" data-action="plan">Prepare expedition <span>→</span></button>' : accessNotice(access) || '<div class="sp-notice">Dock with the ISS first, then return to this map.</div>') +
        '<p class="sp-footnote">Training scenario: the starting orbit is idealized and aligned for this destination, not live ISS telemetry.</p><p class="sp-status" role="status"></p>';
      bindActions(box, planet); return;
    }
    const active = flight.stage === "coast", planning = ["planning", "encounter"].includes(flight.stage), insertion = flight.stage === "encounter", preview = flight.preview;
    const labels = { planning: ["PLAN", "Plan departure"], coast: ["IN FLIGHT", "Following trajectory"], encounter: ["ENCOUNTER", "Plan orbit insertion"], complete: ["COMPLETE", "Orbit estimate achieved"], missed: ["REVIEW", "Flight needs review"] };
    const label = labels[flight.stage] || labels.planning;
    let action = "";
    if (planning && access.allowed) {
      const suggest = preview ? preview.dvMps : flight.suggestedBurnMps;
      const values = { v: numberValue(suggest[0]), n: numberValue(suggest[1]), b: numberValue(suggest[2]), hours: preview ? numberValue(preview.delayDays * 24) : 0, ...draft };
      const maxHours = insertion ? 0.12 : 1.2;
      action = '<p class="sp-copy">' + (insertion ? 'Set a target-relative burn. Preview the resulting orbit before committing.' : 'Set the ISS departure burn and preview the trajectory with GMAT.') + '</p>' +
        '<div class="sp-fields"><label>Velocity Δv <small>m/s</small><input data-burn-input="v" type="number" min="-60000" max="60000" step="0.01" value="' + html(values.v) + '"></label><label>Burn in <small>hours</small><input data-burn-input="hours" type="number" min="0" max="' + maxHours + '" step="0.01" value="' + html(values.hours) + '"></label></div>' +
        '<details class="sp-advanced"><summary>Direction components</summary><div class="sp-fields"><label>Normal Δv <small>m/s</small><input data-burn-input="n" type="number" min="-60000" max="60000" step="0.01" value="' + html(values.n) + '"></label><label>Binormal Δv <small>m/s</small><input data-burn-input="b" type="number" min="-60000" max="60000" step="0.01" value="' + html(values.b) + '"></label></div><p class="sp-footnote">V/N/B axes relative to ' + (insertion ? html(title(planet)) : 'Earth') + '. Suggested values are an initial guess, not an optimized mission.</p></details>' +
        (!insertion ? '<p class="sp-footnote">The suggested route assumes a burn at 0 hours. A later burn changes the departure direction.</p>' : '') +
        '<button class="sp-primary" data-action="forecast">Calculate forecast with GMAT <span>→</span></button><button class="sp-quiet" data-reset-burn>Restore suggested burn</button>' +
        '<details class="sp-help"><summary>What do these controls do?</summary><p class="sp-footnote"><b>Velocity Δv</b> changes speed along the current flight direction. <b>Burn in</b> sets the delay before the burn. <b>Direction components</b> adjust its sideways directions. <b>Calculate forecast</b> asks GMAT to predict the route and fuel use. <b>Commit this burn</b> starts the shared simulation using that forecast. <b>Restore suggested burn</b> resets the inputs.</p></details>';
    } else if (planning) {
      action = '<p class="sp-copy">Monitor the shared flight plan and forecast below.</p>' + accessNotice(access);
    }
    if (planning && preview) {
        const safe = insertion ? preview.orbit && preview.orbit.safeCapture : preview.earthDeparture && preview.earthDeparture.escaped && preview.closestKm > preview.targetRadiusKm && preview.closestKm <= preview.targetRadiusKm * 100;
        const resultLabel = insertion ? (safe ? 'BOUND ESTIMATE' : 'NOT SAFE') : !preview.earthDeparture || !preview.earthDeparture.escaped ? 'EARTH DEPARTURE' : (safe ? 'APPROACH ZONE' : 'OUTSIDE ZONE');
        action += '<div class="sp-result"><div class="sp-result-top"><strong>GMAT forecast</strong><span class="sp-badge ' + (safe ? '' : 'attention') + '">' + resultLabel + '</span></div>' +
          (!access.allowed ? '<div class="sp-row"><span>Burn V / N / B</span><strong>' + preview.dvMps.map(value => fmt(value, 2)).join(' / ') + ' m/s</strong></div><div class="sp-row"><span>Burn delay</span><strong>' + elapsedLabel(preview.delayDays * 86400000) + '</strong></div>' : '') +
          '<div class="sp-row"><span>Sampled closest distance</span><strong>' + fmt(preview.closestKm) + ' km</strong></div>' +
          '<div class="sp-row"><span>Time to sampled closest</span><strong>' + elapsedLabel(preview.closestEpochMs - preview.epochMs) + '</strong></div>' +
          '<div class="sp-row"><span>Fuel used / remaining</span><strong>' + fmt(preview.fuelUsedKg) + ' / ' + fmt(preview.fuelAfterKg) + ' kg</strong></div>' +
          (preview.orbit ? '<div class="sp-row"><span>Estimated periapsis altitude</span><strong>' + fmt(preview.orbit.periapsisAltitudeKm) + ' km</strong></div>' : '') +
          '<p class="sp-footnote">' + (!insertion && preview.earthDeparture && !preview.earthDeparture.escaped ? 'This burn did not leave Earth’s vicinity during the departure check. Try the suggested burn. ' : (!insertion && !safe ? 'This trajectory misses the target approach zone. Try changing the burn or restoring the suggested one. ' : '')) + 'Closest point is sampled about every ' + fmt(preview.closestSamplingHours, 1) + ' hours; it is not a precise minimum. ' + (insertion ? 'Orbit result is an approximate two-body estimate.' : 'Approach zone is 1–100 planet radii, an educational game rule.') + '</p>' +
          (access.allowed ? '<button class="sp-secondary" data-action="execute" data-forecast-id="' + html(preview.id) + '">Commit this burn <span>→</span></button>' : '') + '</div>';
    }
    if (active) {
      action = '<p class="sp-copy">The crew is following the committed GMAT trajectory. Time is accelerated.</p>' + accessNotice(access) + '<div class="sp-progress-head"><span>SIMULATED FLIGHT</span><strong class="sp-progress">0%</strong></div><div class="sp-bar"><div></div></div>';
    } else if (!planning) {
      const last = flight.lastResult;
      action = '<p class="sp-copy">' + (flight.stage === "complete" ? 'The committed burn produced a bound, above-surface two-body orbit estimate.' : 'The trajectory did not meet the training approach or safe-orbit condition. Try a new expedition.') + '</p>' +
        (last ? '<div class="sp-row"><span>Sampled closest distance</span><strong>' + fmt(last.closestKm) + ' km</strong></div>' : '') +
        (access.allowed ? '<button class="sp-secondary" data-action="reset">End expedition</button>' : accessNotice(access));
    }
    const reference = preview && preview.points;
    box.innerHTML = '<div class="sp-head"><h3>' + html(label[1]) + '</h3><span class="sp-badge">' + label[0] + '</span></div>' +
      '<div class="sp-route">ISS <span>→</span> ' + html(title(planet)) + '</div>' + action + '<p class="sp-status" role="status" aria-live="polite"></p>' +
      '<div class="sp-live-clock"><span>CURRENT UTC</span><strong class="sp-current-utc">' + utc(Date.now(), true) + '</strong></div>' +
      '<div class="sp-metrics"><div><span>SIMULATED DATE</span><strong class="sp-epoch">' + utc(flight.current.epochMs) + '</strong></div><div><span>FUEL</span><strong class="sp-fuel">' + fmt(flight.current.fuelKg) + ' kg</strong></div><div><span>SPEED · SUN-RELATIVE</span><strong class="sp-speed">—</strong></div><div><span>DISTANCE TO ' + html(title(planet)).toUpperCase() + '</span><strong class="sp-range">—</strong></div></div>' +
      (reference ? '<details class="sp-details"' + (detailsOpen ? ' open' : '') + '><summary>GMAT trajectory</summary><p class="sp-footnote">Sun-centered XY projection. Orange is the target at the displayed time; the 3D atlas uses schematic scaling.</p><canvas class="sp-path" width="320" height="180" aria-label="GMAT trajectory"></canvas><div class="sp-legend">● Sun &nbsp; <span>● Planet</span> &nbsp; ○ Spacecraft</div></details>' : '') +
      '<p class="sp-footnote">Educational 2000 departure scenario, idealized ISS-like orbit and high-performance impulsive engine. GMAT runs locally; avatars remain in the station.</p>' +
      (planning && access.allowed ? '<button class="sp-quiet" data-action="reset">End expedition</button>' : '');
    bindActions(box, planet);
    const resetBurn = box.querySelector("[data-reset-burn]");
    if (resetBurn) resetBurn.addEventListener("click", () => {
      const suggested = flight.suggestedBurnMps;
      const defaults = { v: numberValue(suggested[0]), n: numberValue(suggested[1]), b: numberValue(suggested[2]), hours: 0 };
      box.querySelectorAll("[data-burn-input]").forEach(input => {
        input.value = defaults[input.dataset.burnInput];
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      if (!preview) box.querySelector(".sp-status").textContent = "Suggested burn restored.";
    });
    if (planning && preview && access.allowed) {
      const fields = Object.fromEntries([...box.querySelectorAll("[data-burn-input]")].map(input => [input.dataset.burnInput, Number(input.value)]));
      const unchanged = [fields.v, fields.n, fields.b].every((value, i) => Number.isFinite(value) && Math.abs(value - preview.dvMps[i]) < 1e-9) && Math.abs(fields.hours / 24 - preview.delayDays) < 1e-9;
      if (!unchanged) { box.querySelector('[data-action="execute"]').disabled = true; box.querySelector(".sp-status").textContent = "Burn changed. Calculate a new forecast before committing."; }
    }
    const tick = () => {
      if (!host.isConnected) { clearInterval(tickTimer); return; }
      const f = getFlight(); if (!f || f.planet !== planet) return;
      const forecast = f.preview, p = progress(f);
      const epoch = f.playback && forecast ? forecast.epochMs + p * (forecast.endEpochMs - forecast.epochMs) : f.current.epochMs;
      const epochEl = box.querySelector(".sp-epoch"), fuelEl = box.querySelector(".sp-fuel");
      const currentUtcEl = box.querySelector(".sp-current-utc");
      if (currentUtcEl) currentUtcEl.textContent = utc(Date.now(), true);
      if (epochEl) epochEl.textContent = utc(epoch);
      if (fuelEl) fuelEl.textContent = fmt(f.playback && forecast && epoch >= forecast.burnEpochMs ? forecast.fuelAfterKg : f.current.fuelKg) + " kg";
      const row = forecast && stateAt(forecast.points, epoch);
      const velocity = row ? row.slice(4, 7) : f.current.state.slice(3, 6);
      const targetRange = row && row.length >= 10 ? Math.hypot(row[1] - row[7], row[2] - row[8], row[3] - row[9]) : f.current.targetRelativeState ? Math.hypot(...f.current.targetRelativeState.slice(0, 3)) : null;
      box.querySelector(".sp-speed").textContent = fmt(Math.hypot(...velocity), 2) + " km/s";
      box.querySelector(".sp-range").textContent = targetRange == null ? "Forecast first" : fmt(targetRange) + " km";
      const progressEl = box.querySelector(".sp-progress"); if (progressEl) { progressEl.textContent = Math.round(p * 100) + "%"; box.querySelector(".sp-bar div").style.width = p * 100 + "%"; }
      const details = box.querySelector(".sp-details"); if (details && details.open && forecast) draw(box.querySelector("canvas"), forecast.points, epoch);
    };
    const details = box.querySelector(".sp-details"); if (details) details.addEventListener("toggle", tick);
    tick(); tickTimer = setInterval(tick, 500);
  }
  function bindActions(box, planet) {
    const status = box.querySelector(".sp-status"), inputs = [...box.querySelectorAll("[data-burn-input]")];
    const execute = box.querySelector('[data-action="execute"]');
    const claim = box.querySelector("[data-claim-specialist]");
    if (claim) claim.addEventListener("click", () => {
      const connection = net();
      if (!connection || !connection.connected || !connection.roomId || !connection.socket) { status.textContent = "Join a mission first."; return; }
      claim.disabled = true;
      status.textContent = "Taking Space Specialist role…";
      connection.socket.timeout(5000).emit("claim_specialist_role", {}, (error, result) => {
        if (error || !result || !result.ok) { claim.disabled = false; status.textContent = (result && result.error) || "Connection problem. Please try again."; }
      });
    });
    inputs.forEach(input => input.addEventListener("input", () => { if (execute) { execute.disabled = true; status.textContent = "Burn changed. Calculate a new forecast before committing."; } }));
    box.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => {
      const connection = net();
      if (!connection || !connection.connected || !connection.roomId || !connection.socket) { status.textContent = "Join a mission first."; return; }
      if (button.dataset.action === "forecast" && inputs.some(input => !input.validity.valid || input.value.trim() === "")) { status.textContent = "Check the burn values and limits."; return; }
      const values = Object.fromEntries(inputs.map(input => [input.dataset.burnInput, Number(input.value)]));
      const payload = { action: button.dataset.action, planet, forecastId: button.dataset.forecastId };
      if (payload.action === "forecast") payload.burn = { v: values.v, n: values.n, b: values.b, delayDays: values.hours / 24 };
      button.disabled = true;
      status.textContent = payload.action === "forecast" ? "GMAT is calculating…" : "Sending…";
      connection.socket.timeout(75000).emit("specialist_flight_action", payload, (error, result) => {
        if (error || !result || !result.ok) { button.disabled = false; status.textContent = (result && result.error) || "Connection problem. Please try again."; }
        else if (payload.action === "forecast" && window.solarSystem && window.solarSystem.isActive) {
          window.solarSystem.following = false;
          window.solarSystem.desiredRadius = 55;
        }
      });
      if (payload.action === "execute" && window.solarSystem) { window.solarSystem.following = false; window.solarSystem.desiredRadius = 55; }
    }));
  }
  const style = document.createElement("style");
      style.nonce = window.__lunaspisCspNonce || "";
  style.textContent = `
    .sp-task{font-family:system-ui,sans-serif;background:#102632;border:1px solid #34515d;border-radius:12px;padding:15px;margin:12px 0;color:#eaf5f5;box-sizing:border-box}.sp-task h3{font-size:17px;line-height:1.25;margin:6px 0;color:#f4fbfa}.sp-eyebrow{color:#8dd2c8;font-size:9px;font-weight:750;letter-spacing:1px}.sp-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.sp-badge{flex:none;border-radius:20px;background:#1b4c4a;color:#b1eee2;font-size:9px;font-weight:750;padding:5px 8px}.sp-badge.attention{background:#5a4628;color:#ffdda4}.sp-route{font-size:11px;color:#aecbd0;margin:1px 0 8px}.sp-route span{color:#94dbcf;margin:0 5px}.sp-copy,.sp-footnote{line-height:1.5;color:#bdd0d5;font-size:11px;margin:10px 0}.sp-footnote{font-size:10px;color:#a8c0c6}.sp-notice,.sp-result{background:#1c3943;border-radius:8px;padding:10px;margin:10px 0;font-size:11px;color:#d5e9e8}.sp-result-top{display:flex;justify-content:space-between;align-items:center;gap:5px}.sp-primary,.sp-secondary{display:flex;justify-content:space-between;align-items:center;width:100%;border:0;border-radius:8px;padding:11px;background:#a5e2d7;color:#123037;font:700 11px system-ui;text-align:left;cursor:pointer;margin-top:9px}.sp-secondary{background:#335e65;color:#effffc}.sp-primary:disabled,.sp-secondary:disabled{opacity:.48;cursor:default}.sp-quiet{border:0;background:transparent;color:#aecbd0;font:600 10px system-ui;padding:10px 0;cursor:pointer}.sp-primary:focus-visible,.sp-secondary:focus-visible,.sp-quiet:focus-visible{outline:2px solid white}.sp-status{font-size:11px;color:#ffd0b0;margin:7px 0}.sp-status:empty{display:none}.sp-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0}.sp-fields label{font-size:10px;color:#c2d9dc}.sp-fields small{font-size:9px;color:#9fb7bd}.sp-fields input{display:block;box-sizing:border-box;width:100%;margin-top:4px;border:1px solid #496a73;border-radius:7px;background:#0a1c26;color:#f4fbfa;font:12px system-ui;padding:8px}.sp-advanced summary,.sp-details summary,.sp-help summary{font-size:11px;font-weight:700;color:#d7eeee;cursor:pointer}.sp-advanced{margin:8px 0}.sp-help{margin:1px 0 8px}.sp-row{display:flex;justify-content:space-between;gap:8px;margin:7px 0;font-size:10px;color:#b2c7cd}.sp-row strong{color:#ebf7f6;text-align:right}.sp-metrics{display:grid;grid-template-columns:1.4fr 1fr;gap:8px;margin-top:12px}.sp-metrics>div{background:#1b3642;border-radius:8px;padding:9px;min-width:0;display:grid;gap:3px}.sp-metrics span{font-size:8px;font-weight:700;letter-spacing:.4px;color:#a0b9bf}.sp-metrics strong{font-size:11px;color:#f2fbfa;white-space:nowrap}.sp-progress-head{display:flex;justify-content:space-between;margin:14px 0 6px;font-size:10px;color:#bdd0d5}.sp-bar{height:5px;background:#294955;border-radius:5px}.sp-bar div{height:100%;background:#9ce2d3;border-radius:5px}.sp-details{border-top:1px solid #36525d;margin-top:13px;padding-top:11px}.sp-path{display:block;background:#091b24;width:100%;height:auto;border-radius:8px}.sp-legend{font-size:9px;color:#ffc879;margin:6px 0}.sp-legend span{color:#fc9877}
  `;
  document.head.appendChild(style);
  window.specialistPlanetMission = { render, getFlight, progress, stateAt };
})(window);
