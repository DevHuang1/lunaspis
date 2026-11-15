// Bake the planned launch-to-landing route from the existing deterministic nominal flight.
// Run again when the flight model/guidance changes: node scripts/build_shuttle_route.js
// The test pilot runs only here, never in the browser or a player's mission.
const fs = require('node:fs');
const path = require('node:path');
const S = require('../public/js/game/shuttle_simulation.js');
const { ShuttleMission } = require('../public/js/game/shuttle_mission.js');
const { createPilot } = require('../tests/shuttle/pilot.js');
function build(variant) {
  const m = new ShuttleMission({ variant }), pilot = createPilot(), points = [];
  const phases = m.phases;
  function record(r, t, phase, force = false) {
    const p = S.eciToEcef(r, S.gmst(m.st, t));
    const prev = points[points.length - 1];
    const altitude = S.vec.norm(r) - S.RE;
    const spacing = altitude < 5000 ? 150 : altitude < 30000 ? 1500 : 15000;
    if (prev && S.vec.norm(S.vec.sub(p, prev.slice(2))) < 0.1) { prev[1] = phases.indexOf(phase); return; }
    if (prev && S.vec.norm(S.vec.sub(p, prev.slice(2))) < spacing && !force && prev[1] === phases.indexOf(phase)) return;
    points.push([+t.toFixed(6), phases.indexOf(phase), ...p.map(x => +x.toFixed(3))]);
  }
  record(m.st.r, m.st.t, m.phase);
  while (!m.result && !m.failure && m.st.t < 6 * 3600) {
    let output = pilot.step(m);
    if (m.phase === 'docking') {
      // The same one-key-at-a-time crew cues exercised by dock_checks.js.
      const cue = m.snapshot().guidance.next.key;
      const axes = { W: ['pitch', -1], S: ['pitch', 1], A: ['roll', -1], D: ['roll', 1], Q: ['yaw', -1], E: ['yaw', 1],
        I: ['ty', 1], K: ['ty', -1], J: ['tx', 1], L: ['tx', -1], U: ['tz', 1], O: ['tz', -1] };
      output = { input: { pitch:0, yaw:0, roll:0, tx:0, ty:0, tz:0, sb:0, brake:0 }, cmds: [], warp: axes[cue] ? 1 : 10 };
      if (axes[cue]) output.input[axes[cue][0]] = axes[cue][1];
      if (cue === 'Y') output.cmds.push(['OPEN_BAY']);
      if (cue === 'H') output.cmds.push(['DAP_HOLD']);
    }
    for (const cmd of output.cmds) {
      const r = m.st.r.slice(), v = m.st.v.slice(), t = m.st.t;
      m.command(cmd[0], cmd[1]);
      // COAST TO TIG skips time analytically. Fill that same Kepler coast instead of drawing a chord.
      if (m.st.t - t > 2) {
        for (let dt = 2; dt < m.st.t - t; dt += 2) record(S.keplerPropagate(r, v, dt).r, t + dt, m.phase);
      }
    }
    m.command('SET_CONTROL_INPUT', output.input);
    m.advanceSim(Math.max(1, Math.min(output.warp, m._warpLimit().max)) / 60);
    record(m.st.r, m.st.t, m.phase);
  }
  if (!m.result || !m.result.success) throw new Error(`Nominal ${variant} route did not finish (${m.phase}): ${JSON.stringify(m.failure)}`);
  record(m.st.r, m.st.t, m.phase, true);
  console.log(`Baked ${variant}: ${points.length} route points, mission complete (${(m.st.t / 60).toFixed(1)} min).`);
  return { frame: 'ecef', phases, points };
}
fs.writeFileSync(path.join(__dirname, '../public/data/shuttle_route.json'), JSON.stringify({ version: 1, routes: { deploy: build('deploy'), iss: build('iss') } }));
