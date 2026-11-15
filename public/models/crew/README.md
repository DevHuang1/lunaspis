# NASA Crew — Rigged Human Characters

Two game-ready human crew members in NASA-blue jerseys and pants, generated in
Blender and exported as glTF 2.0 binary (`.glb`).

| File | Height | Description |
| --- | --- | --- |
| `crew_a.glb` | ~1.90 m | Crew A — broad-shouldered male, short black hair, medium-tan skin. |
| `crew_b.glb` | ~1.77 m | Crew B — female, pulled-back hair with bun, gold earrings, light-tan skin. |

Both wear a NASA-blue jersey (`#0B3D91`) with white collar/cuffs and hem, a red
vector swoosh, a white **NASA** front wordmark and back wordmark, and a back
number (`01` / `02`). The navy jogger-style pants (`#0A2350`) have a white side
stripe and a small NASA wordmark on the left thigh. White sneakers with blue and
red accents finish the uniform.

## Asset facts

- **Units / scale:** metres. The origin is at the feet, centre of the stance.
- **Orientation:** faces **+Z** in glTF (modelled facing -Y in Blender), **Y up**.
- **Loader origin:** the catalog entries set `origin: "feet"` so
  `instantiateModel()` grounds these models instead of applying the generic
  half-height centering used by the hip-origin astronaut suits.
- **Skeleton:** 22 deform bones with a standard humanoid hierarchy.
- **Skinning:** smooth, max 4 influences per vertex. Hands are rigidly bound to
  the hand bones; all arm and leg joints articulate.
- **Materials:** native glTF PBR materials (base colour, roughness, metallic),
  no external texture files. Double-sided thin prints for crisp decals.
- **Animations:** four embedded clips, all authored at 30 fps.
- **Budget:** ~71k vertices / ~136k triangles for Crew A and ~72k / ~137k
  for Crew B (~4.1–4.2 MB GLB). The faces, hands and hair carry most of the
  detail; the body under the uniform is deliberately simpler.
- **Silhouette:** sloped, raglan-style jersey shoulders and tapered jogger
  legs replace the earlier puffy sleeve caps and bell-bottom trousers. The
  face uses almond eye openings, thinner brow/lip geometry and a shorter,
  wider jaw; the hands have tighter finger spacing and a relaxed curl.

## Game integration

`crew_a.glb` and `crew_b.glb` are registered in `js/core/glb_manager.js` under
the `crew` category. `glb_manager.getModelIdForRole()` assigns them to the two
Earth Control roles:

| Role | Model |
| --- | --- |
| `flight_director` (Mission Boss) | `crew_a.glb` |
| `ground_capcom` (Earth Radio Helper) | `crew_b.glb` |

Station crew roles always use `astronaut_lod0.glb` / `astronaut_lod1.glb`. Both
crew models share the astronaut rig's bone names and `idle`, `walk`,
`look_around` and `wave` clips,
so movement, emotes and name badges work without extra animation code.

## Bones

```
hips
├─ spine → spine1 → chest → neck → head
│                   ├─ shoulder_L → upperarm_L → forearm_L → hand_L
│                   └─ shoulder_R → upperarm_R → forearm_R → hand_R
├─ thigh_L → calf_L → foot_L → toe_L
└─ thigh_R → calf_R → foot_R → toe_R
```

The names intentionally match the existing `astronaut_lod0/lod1.glb` rig, so
the crew emote system (`upperarm_L`, `forearm_L`, `hand_L`, `head`, …) works
with these models.

## Clips

| Clip | Length | Loop | Notes |
| --- | --- | --- | --- |
| `idle` | 4.0 s | yes | Breathing, micro-sway, relaxed arms. |
| `walk` | 1.07 s | yes | In-place walk cycle; drive root motion yourself. |
| `look_around` | 6.0 s | yes | Head/chest scan. |
| `wave` | 3.2 s | no | Right-arm raise, wave, settle back to idle. |

## Three.js example

```js
const loader = new GLTFLoader();
const gltf = await loader.loadAsync("models/crew/crew_a.glb");

// Clone per crew member (SkeletonUtils keeps the skeleton independent)
const model = SkeletonUtils.clone(gltf.scene);
model.traverse((o) => {
  if (o.isMesh) {
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
  }
});

const mixer = new THREE.AnimationMixer(model);
const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
mixer.clipAction(clips.idle).play();

// walk example
const walk = mixer.clipAction(clips.walk);
walk.play();
walk.crossFadeFrom(mixer.clipAction(clips.idle), 0.25, false);
```

`gltf.animations` contains exactly `idle`, `walk`, `look_around`, `wave`.

## Regenerating / editing

The source generator and a combined `.blend` live in `scripts/crew/`:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python scripts/crew/build_crew.py
```

- `build_crew.py` — fully procedural body, clothing, face, rig, weights,
  animations and export.
- `crew_characters.blend` — both characters, rigs, actions and the studio
  preview setup.
- `previews/` — front/back/face, wave and walk reference renders.

The generator is parameter-driven (`CHARS` at the top of the script), so height,
build, skin/hair colours and proportions can be adjusted and rebuilt.
