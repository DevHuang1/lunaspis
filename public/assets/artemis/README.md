# Artemis visual asset provenance

`sls_block1_orion_display.glb` is a derived copy of the existing external
Blender display asset:

```text
D:\SLS_Rocket_Exploded_View\SLS_Rocket_Exploded_View.glb
```

The original `.blend`, `.blend1`, textures, scripts and previews were **not**
modified. The copy is used as a launch/stack visual only.

Known limitations of the source asset:

- It is an exploded-view / display model, not a flight-scale SLS.
- It contains nine joined mesh assemblies and nine 10-second location
  animations (assembled/exploded loop), not flight stage-separation clips.
- It has no camera or lights in the GLB.
- The source README describes the scene as owned and maintained by the
  primary Antigravity agent. Confirm repository redistribution rights before
  publishing this derived copy.
- Current copy SHA-256:
  `36CE33EC1494A40D87C97C165B19FA99E397750838E22AC6D01E086EB5EE9F72`
  (the source README has an older hash; the external asset changed after that
  snapshot).

The lunar lander, Orion capsule, astronauts and terrain in the Artemis client
are procedural development proxies. They must be replaced by reviewed flight
or licensed assets before the scenario is presented as a final reconstruction.
