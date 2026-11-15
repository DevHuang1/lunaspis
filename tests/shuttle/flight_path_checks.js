// Planned-route artifact checks. Browser geometry checks: browser/run_route.js.
const assert = require('node:assert/strict');
const S = require('../../public/js/game/shuttle_simulation.js');
const data = require('../../public/data/shuttle_route.json');
assert.equal(data.version, 1);
for (const variant of ['deploy', 'iss']) {
  const route = data.routes[variant], pts = route.points;
  assert.equal(route.frame, 'ecef');
  assert.ok(pts.length > 100);
  const pad = S.llhToEcef(S.SITES.pad.lat, S.SITES.pad.lon, 41.1);
  assert.ok(S.vec.norm(S.vec.sub(pts[0].slice(2), pad)) < 0.01, 'route starts on the launch pad');
  for (let i = 1; i < pts.length; i++) {
    assert.ok(pts[i].every(Number.isFinite));
    assert.ok(pts[i][0] >= pts[i - 1][0], 'time never runs backwards');
    const distance = S.vec.norm(S.vec.sub(pts[i].slice(2), pts[i - 1].slice(2)));
    assert.ok(distance > 0.01 && distance < 40000, `no duplicate knots or unfilled coast jumps: ${distance}`);
  }
  for (const phase of variant === 'deploy' ? ['ascent','insertion','payload','deorbit','entry','approach','rollout'] : ['ascent','insertion','docking']) {
    assert.ok(pts.some(p => route.phases[p[1]] === phase), `planned ${phase} is present before launch`);
  }
  if (variant === 'deploy') {
    const final = pts[pts.length - 1];
    const r = S.ecefToEci(final.slice(2), 0.35 + S.OMEGA_E * final[0]);
    const runway = S.toRunway({theta0:0.35,t:final[0]}, r);
    assert.ok(runway.x > 0 && runway.x < S.RWY.length && Math.abs(runway.y) < S.RWY.width / 2, 'route ends on the runway');
  }
  console.log(`PASS ${variant}: continuous complete planned route (${pts.length} knots)`);
}
