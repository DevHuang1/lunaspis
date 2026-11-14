# Interfellas codebase audit

Audited 2026-11-12 (Asia/Rangoon). Evidence baseline: `5012ff791a15f8b652df089fa8f3b9c4fbbda5c0`, “fix: harden voice chat lifecycle and mic error handling”. This is an audit, not implementation approval.

## Repository identity and scope

- Requested remote verified: `https://github.com/DevHuang1/Interfellas.git`; remote default branch `main` points to the audited commit.
- Audit checkout: `C:\Users\Omen 16\OneDrive\Desktop\VScode Workspace\SpaceApp\Interfellas`. It is a shallow, detached-HEAD checkout of that commit, recovered from an interrupted clone with `git fetch --depth=1 origin HEAD` and `git switch --detach FETCH_HEAD`. It was clean before documentation creation.
- The parent `SpaceApp` directory is **another repository**, `DevHuang1/SkyDetective`, branch `main`, commit `d21a4dce81757c7a1baa37084feea8c801caccef`. Its tracked application/configuration/assets were already marked deleted; `ShipDesign/` and `ShipDesign.zip` were untracked. None was restored, deleted, moved, or incorporated into this audit. Run Interfellas commands from the child checkout.
- No existing `AGENTS.md`, `CLAUDE.md`, or requested `docs/*.md` files were present in the Interfellas checkout. The user's cross-project guidance remains applicable; glass-effect changes are outside this audit.
- Only the five requested handoff documents are authored. Dependency installation was separately approved; `npm ci --ignore-scripts --no-audit --no-fund` installed 100 packages without manifest/lockfile changes. Local server startup created its ignored `server/.data` runtime directory. No application code, configuration, or original assets were edited.
- Source citations below are repository-relative paths with audited line numbers and symbols. Line numbers must be refreshed after code changes. Status **verified/source** establishes code behavior, not successful browser gameplay; **verified/probe** is an isolated execution with test doubles; **suspected** needs reproduction; **not tested** means no supporting execution.

## What exists

This is a vanilla JavaScript browser application using Three.js r128, not Godot, Unity, React, or Next.js. Express and Socket.IO serve it. There is useful rendering, asset-loading, interior exploration, educational console gameplay, and a local proximity-docking implementation. There is no continuous Shuttle flight simulation or return-to-Earth mission.

The README is partly stale: it lists missing `space_textures.js`, `fleet_controller.js`, and `space_map.js`, describes six old repair mini-games, and advertises fleet/map hotkeys. Current `gameplay.js` implements seven spacecraft-design consoles instead. Treat source and the served HTML as authoritative; do not create missing modules merely to match README claims.

### Commands and dependencies

Working directory for every command: the Interfellas checkout above.

| Purpose | Exact command / behavior | Evidence and verification |
|---|---|---|
| Node requirement | Node `>=20.0.0` | `package.json`; audit host Node `v24.20.0`, npm `11.19.0` |
| Reproducible setup | `npm ci --ignore-scripts --no-audit --no-fund` | Passed after explicit user approval. Lockfile v3; no dependency `hasInstallScript` entries |
| README setup | `npm install` | Documented, not used; prefer locked setup above |
| Run | `npm start` or `npm run dev` | Both resolve to `node server.js`; no watcher. Default URL `http://localhost:3000` |
| Build | No `build` script or frontend bundler | Static frontend is served directly. Do not report a passing build |
| Tests / lint | No `test` or `lint` script or tracked test suite found | Syntax and targeted probes described below are audit checks, not an existing suite |
| Syntax check | `git ls-files '*.js' \| ForEach-Object { node --check $_; if ($LASTEXITCODE -ne 0) { throw "Syntax failed: $_" } }` | Equivalent Node-driven check passed for all 26 tracked JS files |
| Container | `docker build -t interfellas .` then `docker run --rm -p 3000:3000 interfellas` | Derived from inspected Dockerfile; **not run**. Docker uses Node 20 Alpine and `npm install --omit=dev` |
| Deployment configuration | Procfile and Railway start `node server.js` | Inspected only; no deployment |
| Storage upload | `npm run storage:sync` | **Do not run for an audit**: uploads GLBs to configured object storage |

Declared dependencies: Express `^5.3.0`, pg `^8.23.1`, Socket.IO `^4.8.1`; lockfile resolves `5.3.0`, `8.23.1`, `4.8.4`. Three.js comes from `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` in `public/index.html:13`, not npm. Browser startup therefore also needs the CDN. Decoder JS/WASM is checked in under `public/js/loaders`, `public/draco`, and `public/basis`.

For an isolated PowerShell run, use process-local overrides; never print secret values:

```powershell
$env:DATABASE_URL = ''
$env:AWS_ACCESS_KEY_ID = ''
$env:AWS_SECRET_ACCESS_KEY = ''
$env:AWS_S3_BUCKET_NAME = ''
$env:PORT = '3137'
node server.js
```

These overrides affect that shell process, not saved configuration. `server.js` otherwise initializes PostgreSQL schema when configured and automatically uploads missing assets to configured object storage on startup. `server/db.js:49` uses `server/.data/interfellas_db.json` when no database URL is supplied. Do not run against production settings for verification.

## System map

| System | Source and principal entry points | Boundary / reuse guidance |
|---|---|---|
| Startup | `server.js`; `public/index.html`; `public/js/game/main.js:278` `init()` | Express static delivery, ordered global scripts, `window` singletons. Retain framework |
| Mission routing | `main.js:650` `setupMissionControlFlow()`; game-start handler around 1670; `space_center.js:749–898` | Several independent booleans, callbacks, visibility changes; no authoritative Shuttle state machine |
| Launch | `public/js/world/launch_cutscene.js` `LaunchCutsceneManager.start/update/finish` | Reuse art, audio, camera ideas; replace elapsed-time mission truth |
| Docking | `public/js/world/docking_simulator.js` `DockingSimulator.start/update/_completeDocking` | Local practice activity; not an orbital rendezvous system |
| Astronaut movement | `main.js:2178` `updatePlayerPhysics`; `space_center.js:535` `resolveGroundCollision`; `ship_interior.js:2720` `resolveCollision` | Ground/interior walking and EVA displacement, not vehicle flight dynamics |
| Renderer/cameras | `main.js:278`, `updateCamera`, `animate:2502`; `core/cinematic_pass.js`; `world/photorealistic_earth.js` | Three.js/ACES, performance settings, dynamic resolution. Several modes directly own the same camera |
| Assets | `core/glb_manager.js:221` `loadGLB`, `:381` `instantiateModel`; catalog at :23 | Cached GLTFLoader with Draco/KTX2/Meshopt, cloned materials/rigs, hangar. Retain with lifecycle fixes |
| Input | `main.js:1827` `setupInputControls`; `space_center.js` `_setupGroundUI`; docking `_bindInputs:224` | Keyboard, touch joystick, pointer controls, separate global listeners. Add mode routing and release-on-blur |
| UI / objectives | `public/index.html`, `public/css/style.css`; `gameplay.js:513` `GameplayEngine`; multiple `_createHUD` functions | DOM and inline styles mixed with logic. Preserve current appearance until later redesign |
| Other activities | `ship_interior.js` interior, AI crew, minimap, Lunar scene; `station_modules.js` ISS showcase; GLB hangar | Preserve as existing activities. Lunar scene is a diorama/camera scene, not Shuttle landing |
| Networking | `core/network.js` `NetworkManager`; `server.js:603` start, :638 movement, :661 tasks | Default client avatar updates 25 Hz with culling, interpolation ~90 ms and bounded extrapolation. Server room telemetry loop 10 Hz. No shared Shuttle state |
| Audio / voice | `core/audio_synth.js`, `core/voice.js`, `server/voice-signaling.js` | Procedural sound plus WebRTC signaling. Voice calls and microphone access not tested |
| Persistence | `server/db.js`; localStorage in `main.js`/`network.js` | User profiles, task records, room metadata, chat; local identity/settings. No Shuttle checkpoints or saved vehicle vectors. Active rooms live in `server.js` memory |

## Actual mission trace

1. Title screen creates or joins a six-player co-op room via `NetworkManager`. Host's start emits `start_game`; server resets seven objective IDs and broadcasts `game_started` (`server.js:603`).
2. `main.js` starts ground mode at the LC-39A gantry. Player can walk, lock the access arm with B, board with E, or use HUD buttons. `startLaunchCountdown()` also automatically locks/boards if L is pressed first: these are conveniences, not enforced checks.
3. `space_center.js:784` hides the ground environment and starts `LaunchCutsceneManager`. There is no piloted ascent input. Space/Escape skips to the completion callback.
4. At **cutscene elapsed time**, ignition/hold lasts 3.5 s; roll is animated over 3.5–7 s; pitch over 7–13 s; SRBs separate at 13 s; MECO and tank separation begin together at 19 s. Doors open at 24.5 s and satellite deployment is flagged at 27 s. The sequence ends at 32 s. Header comments claiming later tank separation differ from executable logic. The MET display subtracts 3.5 s, while banners often use raw elapsed thresholds.
5. “408 km / 7,860 KM/H / orbit stabilized” is assigned telemetry, not computed from a state vector. The satellite remains a child of the orbiter; it is translated away visually and removed with the cutscene group. O/P labels are displayed but no corresponding deployment command handler exists here; P opens diagnostics in `main.js`.
6. `space_center.js:824` immediately starts `DockingSimulator` approximately 37.5 scene units from a fixed target. It resets velocity to +1.35 Z, independent of launch. W/S/A/D/R/F translate; arrows and Q/E rotate; T assists; V changes view. No orbital phasing or transfer is simulated.
7. Capture uses position-to-point, Z velocity, and forward-vector alignment. The “latch now” button calls `skip()` unconditionally. Completion waits 1.1 s, removes the craft, then calls `completeDockingAndEnterStation()`.
8. Player appears in the six-room Perilune interior, described by transition text as the ISS interior. Seven engineering-design consoles evaluate choices. `renderMissionSimulationConsole()` can display local victory even for an imperfect design; server victory is completion of seven task IDs. `showVictory()` enables the Lunar scene. Neither victory is a Shuttle return.
9. **No deorbit, entry, bank guidance, approach, runway collision, rollout, Shuttle failure explanation, or mission checkpoint/retry flow exists.** G teleports between ground and station; it does not return a flying vehicle to Earth. Source searches and call-path inspection agree on this absence.

## Simulation conventions and limitations

- World scenes use Three.js Y-up; local craft nose is +Z, dorsal +Y, with X lateral. Launch `_buildLaunchScene()` rotates the stack core -90° about X to point the nose up. The launch roll is then a world-Y rotation; pitch modifies the stack Euler X. The fixed ~118.8° roll is not derived from launch latitude, heading, or target inclination.
- Docking assumes meters and seconds in its labels, but no global units contract exists. It starts from a fixed local position, applies acceleration in world axes without rotating thrust by attitude, and uses no gravity, propellant, inertia, or orbital frame. Its cameras always look at the fixed target, including “cockpit”.
- Launch positions use arbitrary scene distances. Example: at elapsed 7 s, the altitude readout changes to `120 * 0.8 = 96 km`; the preceding segment uses `altitude / 100`. At elapsed 13 s the prior ~960 km readout changes to 65.4 km. These are mathematical discontinuities in source, not observed flight paths.
- `main.js:2516` updates once per rendered frame with `min(clock.getDelta(), 0.05)`. There is no accumulator, fixed simulation step, or time-warp control. Below 20 rendered FPS, simulated elapsed time is discarded; wall-clock timers still run normally. FPS capping affects simulation scheduling.
- Docking lateral damping multiplies X/Y velocity by 0.94 each update; angular damping uses 0.92 (plus 0.82 under assist). In a one-second probe from 1 m/s lateral speed, remaining speed was 0.15626 at 30 FPS, 0.02442 at 60 FPS, and 0.000596 at 120 FPS. This is verified frame dependence.
- `server.js` has unrelated oxygen/reactor/docking telemetry. Its 100 ms loop subtracts docking velocity times 0.01, not 0.1, and does not drive `DockingSimulator`. Do not repurpose these fields as Shuttle flight truth without an explicit new contract.

## Findings and disposition

P0 = exposure blocker; P1 = blocks target gameplay or credible success; P2 = reliability/authenticity issue; P3 = maintenance. Severity applies to the stated impact, not a promise to fix it during this audit.

| ID / type | Severity, evidence and player impact | Status | Recommended action |
|---|---|---|---|
| F01 Missing mission | **P1.** `space_center.js:824,855`, `gameplay.js:1895,2107`: launch leads to docking/design consoles/Lunar display; return path absent. Cannot finish the requested Shuttle mission | Verified/source | **Retain** other activities; **add/refactor** a separate explicit Shuttle lifecycle and rough return loop |
| F02 Scripted flight / incorrect claims | **P1.** `launch_cutscene.js:153,331`: transformations and literal telemetry assert orbit without dynamics; automatic payload flags. Probe confirmed door/deployment flags with no commands. 7,860 km/h is ~2.18 km/s, inconsistent with a circular low Earth orbit | Verified/source + probe | **Replace** flight authority with integrated position/velocity and orbital guards; **retain** cinematic as labelled replay/tutorial |
| F03 Incomplete rendezvous | **P1 for an ISS objective.** `docking_simulator.js:58,278`: teleport to fixed target, no target orbit or phasing, world-axis RCS. A proximity exercise is presented as orbital approach | Verified/source | **Defer** ISS objective; retain practice mode. Later add relative orbital navigation and explicit control frames |
| F04 Invalid capture | **P1.** `_isInsideCaptureCorridor:363`, `_calcAngularDeviation:370`, `skip:122`, HUD binding :547. Probe accepts 180° roll and 100 m/s transverse speed at 1 m range; skip completes from outside corridor. No collision/failure handling | Verified/source + probe | **Repair** full port pose, relative velocity/angular rate, signed corridor, collision and abort. Label training skip; never award mission success for it |
| F05 Frame-dependent motion | **P1 for consistent control.** `main.js:2502`, docking `update:278`; measurements above vary with FPS. Low FPS slows launch while timeout-based callbacks remain wall-clock | Verified/source + probe | **Refactor** fixed-step simulation, time-normalized assistance, controlled pause/time warp |
| F06 Local-only flight | **P1 for co-op Shuttle.** Launch/docking methods never publish vehicle state; `network.js:365` sends astronaut pose; server :603/:661 tracks design tasks. Two pilots can independently be in different flight phases | Verified/source; multi-browser impact not observed | **Add** one mission authority/command owner for Shuttle before offering shared flight; preserve existing co-op protocol |
| F07 Cancellation mismatch | **P2.** `main.js:1040` calls `launchCutscene.stop` only if defined; class only has `finish`/`skip`. Probe confirms `stop` undefined. `finish` advances mission; calling it is not a correct cancel substitute. Launch roar timer :105 and docking completion timer :438 are uncancelled | Verified/source; menu/late-callback effects suspected | **Repair** distinct cancel/complete semantics, cancel timers, invalidate outstanding load callbacks. Manually leave during launch and immediately after capture |
| F08 Asset timing / lifetime | **P2.** Launch `start` does not clear plume/puff arrays, mixers, or model references; `_buildLaunchScene` pushes more objects. Satellite can attach before a later orbiter replacement; door trigger may run before clips load | Retained arrays verified/source; visible races suspected/not tested | **Repair** per-run asset ownership, load barrier, generation token, safe cleanup; test slow loading and 10 retries. Do not dispose cached shared geometry accidentally |
| F09 Stage presentation | **P2.** Launch :559–579 parents SRB exhaust to core, not SRBs; all plumes persist until tank phase. Tank moves in stack-local coordinates; camera/readout discontinuities accompany script stages | Verified/source; appearance not tested | **Repair** renderer attachment hierarchy and derive displays from simulation events |
| F10 Docking geometry / era | **P2.** Docking target `(0,1.85,-24.5)` is not obtained from a station port; ISS model is positioned `(0,4,-55)` in `main.js:452`. Ship origin and +Z-forward are used for capture rather than an ODS socket. HUD :454 calls it PMA-2 / IDA-2 | Fixed-point logic verified/source; geometric alignment unverified. IDA chronology verified via NASA | **Repair** explicit port transforms/era labels when implementing ISS; preserve original models |
| F11 Missing asset hidden by HTML fallback | **P2.** `launch_cutscene.js:76` requests absent `assets/earth.glb`. Local HTTP returned **200 text/html**, 37,592 bytes, from `server.js:250` catch-all. Loader will receive HTML rather than a GLB; procedural sphere fallback exists | Verified/source + HTTP | **Repair** asset 404 behavior/request list; reuse checked-in Earth textures and shader; no need to invent/download an Earth GLB |
| F12 Overlapping modes and controls | **P2.** `main.js:1868` G teleport remains accessible during modes; H/J/K and separate listeners can also activate scenes; V affects both general and docking camera state. `animate` updates all managers before choosing camera priority | Verified/source; exact UI conflicts suspected | **Refactor** active-mode command routing/camera ownership, preserving intentional showcase access through explicit transitions |
| F13 Identity protection | **P0 before public account use.** `server.js:168` reset endpoint directly calls `server/db.js:378` with only username/new password. No proof of identity or reset token is checked; profile routes also trust supplied user IDs | Verified/source; deliberately not exploited | **Repair** authentication/reset authorization in a separately approved backend task; block public-account release until resolved. No credentials inspected |
| F14 Documentation drift | **P3.** README's missing module list and old console descriptions differ from tracked files/current classes | Verified/source | **Retain** useful source; **repair** README later with approval (outside this audit's file allowlist) |

## Repository asset inventory

Metadata was parsed from GLB JSON chunks using Node's `Buffer`, not by dumping binary assets as text. All 14 files have GLB v2 headers and no external buffer/image URIs. This is structural inventory, not proof of visual fidelity, compression decoding, rig behavior, or licensing provenance.

| File under `public/` | Bytes | Verified structure / reuse |
|---|---:|---|
| `assets/Orbiter_V2.glb` | 8,370,304 | 30 nodes, 24 meshes, 16 animation clips; payload socket and separate movable surfaces/gear |
| `assets/ExternalTank.glb` | 584,340 | 4 nodes, 1 mesh; `SOCKET_Orbiter`, `SOCKET_SRB_L`, `SOCKET_SRB_R` |
| `assets/SolidRocketBooster.glb` | 284,796 | 4 nodes, 1 mesh, no animation; instantiate twice |
| `assets/Satellite.glb` | 242,776 | 12 nodes, 9 meshes; `Satellite_Deploy` |
| `assets/earth_launch_vehicle_stack.glb` | 347,008 | 8 meshes, no clips; other vehicle, not substitute for Shuttle stack |
| `assets/earth_to_iss_crew_ship.glb` | 458,616 | 9 meshes including `CrewTransport_IDSSDockingRing`; no clips |
| `assets/modular_spacecraft_bus_smallsat.glb` | 204,600 | 8 meshes, no clips |
| `assets/modular_spacecraft_bus_hex.glb` | 465,032 | 9 meshes, no clips |
| `assets/modular_spacecraft_bus_heavy.glb` | 553,684 | 9 meshes, no clips |
| `assets/modular_spacecraft_fully_configured.glb` | 487,424 | 9 meshes, no clips |
| `models/astronaut/astronaut_lod0.glb` | 1,875,748 | 57 nodes; idle/look_around/walk/wave; Meshopt, quantization, Basis/KTX2 |
| `models/astronaut/astronaut_lod1.glb` | 697,544 | Same clip names and required extensions |
| `models/iss/ISS_stationary_opt.glb` | 3,763,636 | 132 nodes, 131 meshes; Draco/WebP; no clips. Includes OCO3/ECOStress node names, so “2011-era” label is not a complete provenance check |
| `models/iss/ISS_B.glb` | 476,992 | 11 nodes, 10 meshes, 11 named clips; Draco |

Earth textures: `blue-marble-2048.jpg`, `earth_clouds_1024.png`, `earth_day_4096.jpg`, `earth_night_4096.jpg`, `earth_normal_2048.jpg`, `earth_specular_2048.jpg`. KSC, interior, Lunar terrain/lander, indicators and exhaust are largely procedural; sound is synthesized.

Orbiter clips: `ControlSurfaces_Test`, `BodyFlap_Up/Down`, `Elevons_PitchUp/PitchDown/RollLeft/RollRight`, `Gear_Deploy/Retract`, `MainEngines_GimbalTest`, `PayloadDoors_Open/Close`, `SpeedBrake_Open/Close`, `Rudder_YawLeft/Right`. Clip existence does not establish that a flight controller uses it. In particular, do not expose gear retraction in a historically grounded in-flight mode just because the art has that clip.

Metadata attachment positions match current hardcoded offsets: tank-to-orbiter `(0,5.25,-12.4)`; boosters `(±6.6,0,-9.88)` with right-side Z rotation π; orbiter payload socket `(0,3.6,-1.5)`. Prefer reading these named nodes over duplicating coordinates. Scale is currently passed as 1.0; actual dimensions, center of mass, socket world transforms, pivots under animation and model alignment still require visual/bounds validation. No collision-named nodes or dedicated orbiter docking socket were found by metadata-name inspection; absence of a name does not prove absence of useful geometry.

The separate Google Drive was not accessed. Parent `ShipDesign` files were not assumed to be that Drive delivery. Future import contract: retain originals; inventory dimensions and license/source; agree +Z-forward/+Y-dorsal convention; verify scale in meters; separate stage bodies; test sockets, hinge pivots and clip endpoints; add simple collision proxies, docking-port transforms, wheel contact points and runway geometry in adapters/derived assets after approval. Existing Orbiter/Tank/SRB/Satellite assets are enough to begin logic work.

## Verification ledger

| Check | Result | Limit |
|---|---|---|
| Repository identity/status | Remote/default branch/commit verified; clean checkout before docs | Shallow clone; no historical blame audit |
| Approved locked install | Passed, 100 packages; manifests unchanged | No dependency security audit or version migration |
| `node --check` | All 26 tracked JS files pass | Parsing only; no browser globals/shader validation |
| Server startup | Passed with local DB mode and cloud settings disabled | Initial sandbox localhost requests failed; outside-sandbox self-contained smoke probe succeeded |
| HTTP | `/`, Socket.IO client, launch script, orbiter GLB, Earth day texture, `/api/rooms` all return 200 with expected MIME types | No multiplayer session or GPU execution |
| Missing asset | `/assets/earth.glb` returns HTML 200, not GLB | Demonstrates bad fallback, not a whole-game startup failure |
| Targeted method probes | Actual docking/launch classes loaded with Node `vm`, minimal vector/quaternion/DOM/event doubles; reproduced roll/lateral capture acceptance, frame damping differences, unconditional skip and automatic payload flags | Not full Three.js, rendered animation, or human-played flight. No test files added |
| GLBs | Parsed headers, JSON metadata, animation/node names for 14 assets | No mesh-decoder/render or animation inspection |
| Visual gameplay | **Not observed** | Chrome connector unavailable; IAB localhost timed out; native Computer Use ended because it could not reliably determine the browser URL. No bypass attempted |
| Build/tests | No configured build/test/lint commands | Do not describe syntax or HTTP checks as gameplay correctness |
| NASA research | Primary NASA pages/reports opened; claims and limits in [mission spec](mission-spec.md#historical-grounding) | Exact selected-mission trajectory and aero tuning still need verification |

Manual follow-up after browser access is restored: create a disposable local room; start; try B/E/L and direct L; watch full launch and a skipped launch; verify payload/booster animation; use manual docking and T assist; compare latch outside corridor; reach interior; inspect planner, hangar, ISS and Lunar activities; leave/rejoin during launch and capture; repeat with slow asset delivery, 30/60/120 FPS, mobile touch, and two local clients. Do not use production credentials or real microphones for this audit.

## Recommendation

Reuse Three.js, the Express static host, GLB loading/catalog, existing assets, procedural KSC, sound, performance controls and other activities. Introduce small flight/mission modules and adapters instead of rewriting the application. Satellite deployment should be the first Shuttle objective: it has art, clips and a demonstrated rendering path but needs genuine release state. ISS has strong visual/demo value, but accurate rendezvous, port geometry, capture and multiplayer coordination add substantial work. Preserve its existing practice activity and schedule full ISS missions later, subject to approval.

See [mission-spec.md](mission-spec.md), [implementation-plan.md](implementation-plan.md), and [progress.md](progress.md). If HEAD changes, recheck mission routing, asset catalog/GLBs, networking authority, commands/lockfile, and every finding affected by the diff before implementing.
