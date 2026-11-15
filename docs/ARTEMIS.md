# Artemis Lunar Expedition — Implementation Notes

## Scope

This is an additional Interfellas/Lunaspis mission: **Earth launch → lunar transfer → lunar orbit → lander rendezvous/docking → powered south-polar landing → two bounded surface task sequences → lunar ascent → Orion reunion → Earth return → Orion splashdown → debrief**.

It is a **dated training scenario**, not a reconstruction of a flown mission. The implementation uses the public NASA October 2026 architecture snapshot as a design input and chooses the **Blue Moon-style lunar-rendezvous** option. It does not claim that NASA selected Blue Origin for a specific landing, and it does not silently reuse the older shared-NRHO architecture.

Machine-readable assumptions and calculated values live in `public/data/artemis-scenario.json`.

## Published facts vs. calculated values vs. training assumptions

### Published facts (as of the dated snapshot)

- Artemis III is planned as an Earth-orbit rendezvous/docking demonstration with lander test articles in 2027.
- Artemis IV targets the first crewed Artemis lunar landing in early 2028 at the lunar South Pole.
- Two crew descend; two remain with Orion.
- The October 2026 Blue Origin concept uses transfer stages to deliver a Blue Moon Mark 2 lander to an elliptical polar lunar orbit, where it meets Orion.
- The SpaceX concept instead meets Orion in Earth orbit and uses Starship to push the combined stack toward low lunar orbit.
- NASA says the provider assignment for the near-term landing missions remains to be determined.
- Axiom Space's suit and approximately two two-hour moonwalks are part of initial surface planning.

### Calculated values (current training model)

Observed by `tests/artemis/run_checks.js` on the current code:

| Item | Value |
|---|---:|
| TLI impulse | ~3,626 m/s |
| TLI time of flight | 2.50 days |
| Lunar capture sequence | ~1,261 m/s total |
| Capture orbit | ~100 × 103 km circularized |
| TEI impulse | ~1,407 m/s |
| Orion propellant after capture | ~11,408 kg |
| Orion propellant after TEI | ~1,532 kg |
| Automatic descent propellant remaining | ~9,595 kg |
| Automatic ascent propellant remaining | ~6,800 kg |

These are not NASA flight values. They are outputs of the declared training model and will change if vehicle or transfer assumptions change. Re-run the checks after any edit.

### Training assumptions / limitations

- Patched-conic Earth–Moon transfer with a 20,000 km lunar arrival gate; Moon-only two-body motion inside the lunar sphere of influence.
- Circular Moon orbit at 384,400 km, inclination 5.145°, fixed training epoch phase. The Moon moves, but this is not a JPL Horizons/SPICE ephemeris.
- SLS ascent is a **guided automatic profile** with staging events and a physically validated 200 km parking orbit, not a 6-DOF SLS flight model.
- Lunar capture is a two-impulse patched-conic sequence: a gate burn shapes a 100 km perilune, then a circularization burn is applied at perilune after a Moon-only propagation.
- Lunar phasing after circularization is a guided training closure to a 25 m final-approach gate; the final docking itself is the active pilot task.
- The lander ascent is a guided, propellant-limited profile that ends at a 25 m reunion gate; the final docking is active.
- Vehicle masses, propellant loads, thrusts and Isp are training values.
- No J2, solar gravity, lunar mascons, finite-burn optimization, Gateway/NRHO, HLS elevator, rover or habitat.
- No real-time voice light-time delay; voice remains the existing social channel.
- Orion entry is a guided training model with heat/load limits and parachute deployment, not Artemis I/II certification guidance.
- Lunar terrain is a procedural 2 km patch. Its visual mesh and collision/slope checks share one height function. It is not LOLA imagery.
- Visual SLS/Orion is a derived copy of the existing display asset; the lander, capsule, astronaut and terrain are clearly labelled development proxies.

## Architecture choice

The mission uses a **separate mission profile** on the server:

- `flightProfile: "artemis"` and `flightMode: "artemis"`.
- A new `ArtemisMission` state machine, not the Shuttle phase/objective graph and not the seven ISS station objectives.
- Orion and the lander are separate vessels with separate propellant, mass, crew and checkpoint state.
- Orion performs lunar orbit insertion, rendezvous/docking, TEI and Earth entry. It does not land.
- The lander performs the powered descent, surface stay, and ascent. It is a Blue Moon-style proxy.
- Two crew transfer to the lander; two remain with Orion.
- A dedicated client `artemis_game.js` renders a cislunar map and local scenes and provides duty-aware controls.

The existing Shuttle mission, ISS station flow, CubeSat design scenario, CML framework and the unmerged work on `main` were left intact.

## Mission phases

`briefing → launch → earth_orbit → outbound → lunar_arrival → lunar_orbit → docking → transfer → descent → landed → surface → ascent → reunion → return_prep → return → entry → splashdown → debrief`

Critical events pause time acceleration. The server advances the mission; clients render snapshots and send duty-scoped commands/inputs.

## Controls

### Common

- `T` — cycle time warp in coast phases.
- `H` / `F1` — help.
- `C` — reset camera orbit distance.
- `P` or HUD PAUSE — pause.
- `Space` — deploy parachutes when the entry prompt appears.
- `E` — interact with the nearest surface marker.

### Docking / reunion

- `W/S` — close/back.
- `A/D` — lateral.
- `R/F` — up/down.
- Arrow keys — pitch/yaw.
- `Q/E` — roll.
- `Shift` — fine mode.
- `AUTO DOCK` — assisted training mode.

### Powered descent

- `W/S` — throttle.
- `A/D` — lateral.
- `Q/E` — rotate.
- `Space` — level hold.
- `AUTO LAND` — assisted training mode; fuel-limited.

### Surface EVA

- `WASD` — walk; `Shift` — sprint.
- Mouse drag — look.
- `E` — interact.
- Return to the lander within 45 m and use `END EVA` before the suit reserve expires.

### Entry

- Authorize `ENTRY PREP` at the interface.
- Monitor heat and load.
- Deploy parachutes at the prompt.

## Roles / duties

| Duty | Default role | Responsibility |
|---|---|---|
| Surface Pilot | Commander | descent, landing, EVA movement, ascent authorization |
| Surface Science | Scientist | EVA tasks, samples, experiment |
| Orion Navigation | Specialist | TLI, capture, phasing, docking, TEI, entry prep |
| Orion Systems | Engineer | checkout, crew transfer, Orion checks, abort |

These are **gameplay assignments**, not claimed NASA crew procedures. Solo players can operate every station. Ground Control can monitor. The host/commander can reassign duties without teleporting crew.

## Checkpoints and failures

Checkpoints: `launch`, `earth_orbit`, `lunar_orbit`, `docked`, `landed`, `surface_done`, `reunion`, `entry`.

Checkpoint restore restores both vessels, crew locations, resources, samples, pending phase state and retry count. It does not duplicate samples or rewards.

Failure cases include missed/insufficient TLI, invalid capture, docking limits, unsafe landing speed/slope/attitude, insufficient descent/ascent propellant, EVA suit reserve, missed rendezvous, missing entry preparation and parachute hard limits. A direct Earth-orbit abort and a lunar-orbit abort-return are supported when the propulsion budget is physically sufficient; after landing there is no universal rescue maneuver.

## Asset inventory

| Asset | Source | Status |
|---|---|---|
| SLS Block 1 / Orion display GLB | Derived copy of `D:\SLS_Rocket_Exploded_View\SLS_Rocket_Exploded_View.glb`; original preserved | Used as a launch visual; display scale, no flight animations |
| Blue Moon-style lander | Procedural client proxy | Development proxy |
| Orion capsule | Procedural client proxy | Development proxy |
| Lunar terrain, rocks, sample markers | Procedural from `terrainHeight` | Training geometry, not LOLA |
| Astronaut EVA figures | Procedural client proxies | Development proxy |
| Earth/Moon textures | Existing repository textures | Existing assets |
| Crew models | Existing `public/models/crew` / astronaut GLBs | Existing assets, not used in the dedicated Artemis HUD scene |

The SLS/Orion GLB remains an exploded-view display asset. It has nine joined meshes, nine 10-second location animations, four embedded textures and no flight stage-separation/solar-array animations. A production pass should re-export a clean flight hierarchy and animations.

## Implementation milestones

- **A0** — scenario freeze, reference trajectory/resource budget, manifest.
- **A1** — descent → landing → surface task → ascent → docking practice segment (the training mission state machine now covers this).
- **A2** — full Earth-launch-to-splashdown loop (implemented in the shared simulation).
- **A3** — surface tasks, co-op duties, saves, failures and recovery (implemented; human playtest still required).
- **A4** — physics/assets/control/performance validation and complete playthroughs.

## Verification

Run:

```bash
node tests/artemis/run_checks.js
```

Current result: **21 passed, 0 failed**. The suite covers Moon motion, Lambert consistency, TLI feasibility, capture orbit, assisted docking, powered landing, EVA tasks, sample accounting, checkpoint restoration, absent-input failures, abort-return and full normal mission completion. It does not replace a human playtest or a browser/network integration test.

The existing Shuttle suite now reports **64 passed, 0 failed**. Its previously stale `Ascent warp capped at 8×` expectation was updated to the current code's 25× ascent limit; the Shuttle flight model was not changed.

Observed on 2026-11-15:

- `node tests/artemis/run_checks.js` — 21 passed, 0 failed.
- `node tests/shuttle/run_checks.js` — 64 passed, 0 failed.
- `node tests/cml/run_checks.js` — 20 passed, 0 failed.
- `node tests/regions/run_checks.js` — 36 passed, 0 failed.
- `node tests/space_center/run_checks.js` — 15 passed, 0 failed.
- Syntax check of 75 project JavaScript files — all passed.
- Local server booted on port 3137 with declared dependencies; the Artemis mission card, briefing, launch authorization, dedicated HUD and SLS display scene were smoke-tested in Chromium. No Artemis-specific console errors were observed. (The existing video-link camera permission warning is unrelated to Artemis.)
- A full human-paced, multi-client browser playthrough and a final art/performance pass remain to be performed.

## Run

The project needs its existing npm dependencies and a server process:

```bash
npm install
npm start
# open http://localhost:3000
```

Select **ARTEMIS EXPEDITION** in the lobby, or join a room whose host selected it. The dedicated client starts directly; there is no station/Shuttle detour.

## Remaining limitations / honest completion report

- The mission loop is implemented and passes the headless full-mission check. A browser smoke test of briefing/launch/HUD/scene was run; a full human-paced playthrough and a multi-client network test still need to be run.
- Visuals for the lander/capsule/astronaut/terrain are proxies.
- The SLS/Orion display asset is not a clean flight export.
- The Moon ephemeris, terrain and vehicle data are training approximations.
- No real GPS/DSN contact scheduling, comms delay, Gateway, HLS elevator, rover or surface habitat.
- The outcome is a complete playable training expedition, not a certified Artemis reconstruction.
