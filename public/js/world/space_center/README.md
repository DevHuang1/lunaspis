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

`environment → pad → vab → lcc → crawler → utilities`

Static box/beam meshes are automatically instanced per material in
`_mergeStaticBoxes()` to keep draw calls low.

## Adding a location

1. Add its coordinates and fast-travel entry to `shared.js`.
2. Create a module and register it with `NS.register(...)`.
3. Add the `<script>` tag to `public/index.html` before `site.js`.
4. Add the module name to the order list in `site.js` if it is part of the
   core complex.
5. Register collision volumes and test the location through the site tour
   (`1`–`6`, or the destination buttons on mobile).
