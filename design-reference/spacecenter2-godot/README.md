# NASA Space Center — LC-39A Hub

Walkable 3D launch-complex hub for the NASA game, built in **Godot 4.7**.
This is the scene behind **Main Menu / Lobby Start → Cinematic Earth Launch
Cutscene**: the player spawns at Pad 39A, can walk the complex, use the launch
console, and trigger the countdown.

Everything is generated from primitives at runtime, so the project runs with
**zero imported assets**. Swap in the team's GLB models later (see below).

## Run

```bash
/Users/taki/Downloads/Godot.app/Contents/MacOS/Godot --path /Users/taki/Desktop/space/SpaceCenter
```

Or open the folder in the Godot editor and press F5. Main scene:
`res://src/SpaceCenter.tscn`.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint (15 m/s) |
| Space | Jump |
| E | Interact (launch console) |
| 1–6 | Fast travel: Pad 39A / VAB / LCC / Crawler / Beach View / Comms Room |
| K | Skip countdown |
| R | Reset the vehicle |
| Esc | Release / recapture the mouse |

## What's in the scene

1 unit = 1 metre, real-ish LC-39A scale.

- **Pad 39A** — 6 m hardstand with grass embankment and concrete vehicle ramp,
  flame trench, launch mount, 42 m mobile launcher platform, hold-down posts,
  deluge ring and risers, tail service masts, hardstand railings, trench exits,
  tower work decks, ladder, apron markings, hazard-striped ramp curbs.
- **Fixed Service Structure** — 108 m lattice tower with elevator core, ring
  beams, diagonal bracing, five service arms, hammerhead crane, "39A" sign and
  aviation beacons.
- **Lightning protection** — three 118 m masts with catenary wires to ground
  anchors.
- **Pad support** — 55 m water tower, two propellant spheres and feed lines,
  eight light poles, launch console kiosk, fire/service trucks, cherry picker,
  cable reels, generators, jersey barriers.
- **Launch vehicle** — stylised SLS/Orion stack (64.6 m core, twin SRBs, ICPS,
  Orion, LAS), 97 m tall, on the MLP.
- **Vehicle Assembly Building** — a real shell you can walk into: 158 × 160 ×
  218 m, open 46 m high-bay door with retracted leaves, work platforms on six
  levels with caged ladders, bridge cranes, bay lighting, floor markings, and a
  second SLS stack on its transport stand inside. Exterior: NASA meatball and
  wordmark on the door face, American flag on the north face, fins and
  construction bands on all four faces, roof parapet with penthouse, stacks and
  chillers, two-storey annex, low bay with window strip, door track, rooftop
  crane and flag, apron light poles, lightning masts, utility pipes. Inside, a
  communications room on a steel mezzanine beside the indoor vehicle, with
  consoles, a roof mast and a crew access bridge to the upper stage (fast
  travel `6`).
- **Launch Control Center** — set back west of the LCC access road (off the
  main road it used to sit on), window bands with mullions and sunshades, lit
  entrance vestibule and reception lobby, loading dock with roll-up doors,
  rooftop HVAC units and fans, hedges, walkway, security bollards, painted
  parking lot with cars, wheel stops and lot lighting. Walkable inside: lobby
  with reception desk and benches, firing room with video wall and eight
  consoles, conference room, restroom, and an electrical room (`LCCInterior.gd`).
- **Site utilities** — substation with transformers and bus gantry, cooling
  tower, generator house with diesel tank and stacks, fire-water tank and main,
  antenna farm with dishes and equipment cabinets, power line with poles and
  wires, fire hydrants.
- **Per-building infrastructure** (`src/world/SiteDetails.gd`) — pad-mounted
  transformers with conduit and warning plates (VAB, LCC, substation), VAB low
  bay roll-up doors and air handlers, LCC downspouts and backup generator,
  substation grounding grid and danger placards, cooling-tower ladder and
  chemical tank, diesel containment berm and louvres, fire-tank bollards and
  valve house, antenna-farm lightning mast, propellant valves and nitrogen
  rack, water-tank pump house, turn-basin pump house and light poles, console
  canopy, and labelled signs throughout.
- **Crawler transporter** — parked just south of the crawlerway (off the road),
  four track bogies,
  girder-grid deck on a truss plenum, hydraulic leveling jacks, operator cab,
  generator sets with stacks, deck railings, floodlights, cable reels.
- **Terrain** — Merritt Island grass, Atlantic ocean, beach and dunes, palms,
  tree line, roads with lane dashes and street lights, turn basin, press site
  with grandstand/camera stands/trailers/uplink, road sign.
- **Distant Pad 39B** silhouette on the northern horizon.

## Project layout

```
src/
  SpaceCenter.tscn      Main scene (environment, sun, world, player, HUD)
  SpaceCenter.gd        Hub controller: spawns, location label, launch wiring
  core/
    BuildKit.gd         Box/cylinder/sphere/beam/collision/label helpers
    Mats.gd             Shared material library + procedural noise textures
  world/
    WorldBuilder.gd     Assembles the site
    Terrain.gd          Ground, ocean, beach, crawlerway, roads, palms
    LaunchComplex.gd    Pad 39A, tower, masts, tanks, console, vehicle spawn
    LaunchVehicle.gd    SLS stack + countdown/ignition/ascent sequence
    Facilities.gd       VAB, LCC, crawler, fence, Pad 39B, props, site utilities
    Infrastructure.gd   Street lights, junction signs, LCC checkpoint, landscaping
    SiteDetails.gd      Per-building transformers, pipes, valves, signs, fences
    LCCInterior.gd      Walkable LCC: shell, lobby, firing room, restrooms, conference
  player/
    Player.tscn/.gd     First-person controller, interaction raycast
  ui/
    HUD.tscn/.gd        Location, status, prompt, countdown, fade
  interact/
    Interactable.gd     Reusable [E] interactable StaticBody3D
```

## Game-flow hooks

`LaunchVehicle` emits:

```gdscript
countdown_tick(seconds_left: int)
ignition_started
liftoff
ascent_shake(strength: float)
sequence_finished
```

`SpaceCenter.gd` already connects them to the HUD and camera shake. To drive
the next stage of your flow (orbit / docking), connect `sequence_finished` or
`liftoff` to your scene transition instead of the placeholder status text.

The launch console is a plain `Interactable` node in the `launch_console`
group; the player raycasts for any body with an `interact()` method, so new
consoles/airlocks can reuse the same script.

Spawn points are the `SPAWNS` array in `src/SpaceCenter.gd` — edit positions,
names and yaw there (also used by the 1–5 fast travel keys).

## Swapping in the real models

The team's `earth_launch_vehicle_stack.glb` should replace `_build_stack()` in
`src/world/LaunchVehicle.gd`:

1. Drop the GLB into `assets/models/`.
2. In `_build_stack()`, instance it instead of the primitive stack, scale it so
   the base sits at local `y = 0` and the top is ~97 m.
3. Keep the node name `LaunchVehicle` and the effects (`_build_effects`) — the
   plume, light and smoke are positioned relative to the engine plane at `y=0`.

The same applies to characters, ISS interior pieces and the crew ship: they can
be instanced as children of the existing nodes without touching the layout.

## Notes / next steps

- Launch sequence is functional (countdown → ignition → ascent) but currently a
  blockout: no staging, no audio, no camera cut.
- The VAB high bay is walkable (fast travel `2` lands at the door). The LCC is
  still an exterior shell with a lit entrance vestibule; adding a full firing
  room interior is the next building pass.
- Collision exists for the ground, pad, ramp, slopes, tower core, VAB walls,
  the indoor vehicle, LCC and crawler. Fences and small props are decorative.
