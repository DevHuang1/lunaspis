/*
 * pad_layout.js — LC-39A boarding geometry shared by the browser (KSC scene, pad walk) and the
 * server (boarding validation). DOM-free, no THREE.
 *
 * Frame: pad centre on the ground, +X east, +Y up, +Z south (metres). The simulation's stack has
 * the orbiter origin over the pad centre at 41.1 m (SRB skirts on the 19.8 m MLP deck), nose up,
 * dorsal north, so the port-side crew hatch (orbiter body x +2.65, y +2.0, z +11.5) is at
 * (2.65, 52.6, -2.0). The remote KSC's fixed service structure is turned 180° and moved east so
 * its gantry access arm (19 m, White Room at the tip) reaches that hatch.
 */
(function (root) {
  "use strict";
  const TOWER = { pos: [34, 7.05, -9.2], yaw: Math.PI };          // base sunk into the apron: deck level = hatch level
  const ARM = { pivot: [8.5, 44.0, -7.2], retracted: 0.38, extended: 0, swingRate: 0.12, floor: 0.3, length: 18.8, halfWidth: 1.1 };
  const DECK = { x0: -6.2, x1: 9.2, z0: -12.6, z1: 4.6, top: 44.3 };  // tower-local walkable staging deck
  // tower-local blockers on the deck: corner columns, elevator core, arm control console
  const BLOCKERS = [[-6, -6, 0.8, 0.8], [6, -6, 0.8, 0.8], [-6, 6, 0.8, 0.8], [6, 6, 0.8, 0.8], [-4.1, 4.1, 1.9, 1.9], [8.1, -5.4, 1.1, 0.7]];
  const CONSOLE_MARK = [8.1, 44.42, -6.3];        // tower-local "1 · ACCESS ARM CONTROL" marker
  const HATCH_MARK = [17.0, 0.48, 0];             // arm-local "2 · BOARD ORBITER" marker
  const SPAWNS = [[3.2, -9.6], [6.0, -9.6], [3.2, -11.6], [6.0, -11.6]];   // tower-local deck spots
  const RADIUS = { console: 2.0, hatch: 1.7, serverSlack: 1.5 };

  const cy = Math.cos(TOWER.yaw), sy = Math.sin(TOWER.yaw);
  // THREE rotation.y convention: local (x, z) -> (x cos + z sin, -x sin + z cos)
  const rotY = (x, z, c, s) => [x * c + z * s, -x * s + z * c];
  function towerToPad(p) { const r = rotY(p[0], p[2], cy, sy); return [r[0] + TOWER.pos[0], p[1] + TOWER.pos[1], r[1] + TOWER.pos[2]]; }
  function padToTower(p) { const x = p[0] - TOWER.pos[0], z = p[2] - TOWER.pos[2]; const r = rotY(x, z, cy, -sy); return [r[0], p[1] - TOWER.pos[1], r[1]]; }
  function armToTower(p, ang) { const r = rotY(p[0], p[2], Math.cos(ang), Math.sin(ang)); return [r[0] + ARM.pivot[0], p[1] + ARM.pivot[1], r[1] + ARM.pivot[2]]; }
  function towerToArm(p, ang) { const x = p[0] - ARM.pivot[0], z = p[2] - ARM.pivot[2]; const r = rotY(x, z, Math.cos(ang), -Math.sin(ang)); return [r[0], p[1] - ARM.pivot[1], r[1]]; }
  const armToPad = (p, ang) => towerToPad(armToTower(p, ang));
  const padToArm = (p, ang) => towerToArm(padToTower(p), ang);

  const deckY = TOWER.pos[1] + DECK.top;
  /** Floor height under pad-frame point p (x, z used), or null when there is nothing to stand on. */
  function floorAt(p, armAngle) {
    const q = padToTower(p);
    if (q[0] >= DECK.x0 && q[0] <= DECK.x1 && q[2] >= DECK.z0 && q[2] <= DECK.z1) {
      const blocked = BLOCKERS.some(([bx, bz, hx, hz]) => Math.abs(q[0] - bx) < hx && Math.abs(q[2] - bz) < hz);
      if (!blocked) return deckY;
    }
    if (Math.abs((armAngle === undefined ? ARM.extended : armAngle) - ARM.extended) < 0.02) {
      const a = padToArm(p, ARM.extended);
      if (a[0] >= -0.5 && a[0] <= ARM.length && Math.abs(a[2]) <= ARM.halfWidth) return TOWER.pos[1] + ARM.pivot[1] + ARM.floor;
    }
    return null;
  }
  const consolePad = towerToPad(CONSOLE_MARK);
  const hatchPad = armToPad(HATCH_MARK, ARM.extended);
  const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const spawn = (i) => { const s = SPAWNS[((i % SPAWNS.length) + SPAWNS.length) % SPAWNS.length]; const p = towerToPad([s[0], DECK.top, s[1]]); return { pos: p, yaw: -Math.PI / 2 }; };

  const api = { TOWER, ARM, DECK, BLOCKERS, RADIUS, CONSOLE: consolePad, HATCH: hatchPad, DECK_Y: deckY,
    towerToPad, padToTower, armToPad, padToArm, floorAt, spawn,
    nearConsole: (p, slack) => dist2(p, consolePad) <= RADIUS.console + (slack || 0) && Math.abs(p[1] - deckY) < 3,
    nearHatch: (p, slack) => dist2(p, hatchPad) <= RADIUS.hatch + (slack || 0) && Math.abs(p[1] - deckY) < 3 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PadLayout = api;
})(typeof window !== "undefined" ? window : globalThis);
