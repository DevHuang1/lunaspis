# Space Center 2 — Web Port Modules

The LC-39A complex is built in world-space metres from reusable Three.js
primitives. The original Godot project is preserved in
`design-reference/spacecenter2-godot/` and is not loaded at runtime.

## Module contract

Each builder is a plain IIFE registered on `window.SpaceCenterModules`:

```js
(function (window) {
  "use strict";
  const NS = window.SpaceCenterModules;
  NS.register("my-module", function (site) {
    // site.box / site.cyl / site.beam / site.label / site.mat
    // site.addBoxCollider / site.addCircleCollider
  });
})(window);
```

Builders receive a `SpaceCenterSite` façade and must:

1. Add geometry to `site.group`.
2. Use `site.mat(key)` so materials are shared.
3. Register collision only for volumes the ground tour should block.
4. Use world coordinates from `shared.js` rather than hard-coded duplicates.

`site.build()` runs the registered modules in this order:

`environment → pad → pad39b → vab → lcc → crawler → utilities`

Static box/beam meshes are automatically instanced per material in
`_mergeStaticBoxes()` to keep draw calls low.

## Adding a location

1. Add its coordinates and fast-travel entry to `shared.js`.
2. Create a module and register it with `NS.register(...)`.
3. Add the `<script>` tag to `public/index.html` before `site.js`.
4. Add the module name to the order list in `site.js` if it is part of the
   core complex.
5. Register collision volumes and test the location through the site tour
   (`1`–`8`, or the destination buttons on mobile).

## Launch Complex 39B

`pad39b.js` builds a second, fully walkable complex at `shared.js` →
`constants.PAD_39B` (~26° rotated to the LC-39B bearing): octagonal hardstand
and flame trench, SLS-class launch stack (core stage, boosters, Orion service
module with X-configuration solar wings, LAS lattice, raceway and body decals)
on a mobile launcher, a Fixed Service Structure loaded from `assets/space-shuttle-launching-platform-fss.glb`
(the FSS-only extraction of `source/space-shuttle-launching-platform-low-poly.glb`,
identical to how Pad 39A loads `assets/space-shuttle-fss-tower.glb`): the GLB is
fetched asynchronously via `glbManager.loadGLB` and a procedural box-truss tower
fallback (`Pad39B_FSS_Fallback`) is shown until the asset resolves, then hidden.
The GLB includes the Launch Infrastructure base, Launching Tower, service-arm Plane
Towers, and the Small Building support structure. A separate white lattice crane
mast (`Pad39B_CraneMast`) with jib and beacon is kept as a procedural supplement, three
lightning masts with catenary wires, elevated deluge water tower, LOX/LH2 propellant farm,
gatehouse, a detailed crawler transporter CT-2 (four double-track truck
assemblies, jacking cylinders, twin cabs, exhaust stacks, deck rails) and
service road. The launch and boarding flow stays on Pad 39A; 39B is a site-tour
destination. The `environment.js` crawlerway spur (Main Crawlerway toe at
`z = 185` down to the 39B ramp) is the documented approach.

Collision covers the hardstand mound, the crawlerway ramp, every lightning mast,
both propellant spheres, the water tower, pump house, gatehouse, entrance sign,
crawler transporter and the fixed service structure base. The crawlerway, service
road and grass perimeter remain walkable.

## Mission Control Center (LCC firing room)

The LCC firing room is built as a two-station **Mission Control Center** for the
ground team:

- **Flight Director console** — opens the mission charter/planner (scenario,
  difficulty, roles).
- **Ground Systems console** — opens the orbit & launch trade desk
  (`openPreFlightMdlDesk("orbit")`).
- Hero status screen (`MISSION CONTROL · LC-39B`), two ground-track side
  displays, a GO/NO-GO wall board, a ground-network board, tiered desks with
  monitor graphics, nameplates and operator chairs.
- Facility terminals are defined in `space_center.js` (`lcc_fd`, `lcc_gs`);
  actions `mission` and `orbit` are routed in `_activateFacilityTerminal`.
- Interior furniture is collidable: both consoles, reception desk, sofas,
  coffee counter, conference table, electrical racks and the lobby planters.

## Collision coverage

Every module contributes colliders to `site.boxColliders` /
`site.circleColliders`; the site tour slides the walker along them
(`_resolveSiteTourCollision`). Coverage includes the VAB shell plus its indoor
launcher, comms room and support modules; the LCC shell and interior furniture;
the crawler transporter; Pad 39A's 92 m berm footprint, crawlerway ramp and
flanking embankments, propellant farm, egress bunker, lightning masts and guy
anchors, water tower, kiosk, floodlight cart, jersey barriers and support
vehicles; the security gatehouse, press mound,
turn basin, substation, cooling tower, generator, fire tank and antenna farm;
and the full LC-39B complex.
