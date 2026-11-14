# Implementation progress — co-op Shuttle crew mission

Updated 2026-11-13, Asia/Rangoon. This replaces the earlier solo-mission status. For the audit and handoff history, see the [codebase audit](codebase-audit.md), the [mission spec](mission-spec.md) and the [implementation plan](implementation-plan.md).

## Current state

**Interfellas is now one game: a co-op Space Shuttle crew mission.** It runs from the KSC pad through an automatic ascent, OMS-2 insertion with orbit validation, satellite deployment, a guided deorbit, player-banked entry, and a manual unpowered approach, flare, gear and rollout to wheels stop. It ends with a debrief.

Up to four players form a crew. Each player owns real crew duties. The server runs the one authoritative simulation for the room.

**User direction (2026-11-13):**
- Remove every other mission. The team's earlier "board ship / ISS / docking / interior" activities were added by mistake.
- Make the Shuttle mission co-op: "each will take up its own task just like in real life".
- During launch, let players look around freely, like a car camera in open-world games.
- Use the team's 3D assets. Players should be able to see the other planets in the free-look camera.

**Observed end-to-end:** a full mission flown by four browser clients in one crew room, each pressing only its own seat's keys. It ended in **WHEELS STOP — mission complete** with no page errors. A solo crew (one player covering all seats) passed the failure, retry and lifecycle tests. The details and limits are below.

No human real-time playthrough has been observed yet.

## How to run

```
cd "C:\Users\Omen 16\OneDrive\Desktop\VScode Workspace\SpaceApp\Interfellas"
# PowerShell, process-local overrides (no PostgreSQL migration, no bucket upload):
$env:DATABASE_URL=''; $env:AWS_ACCESS_KEY_ID=''; $env:AWS_SECRET_ACCESS_KEY=''; $env:AWS_S3_BUCKET_NAME=''; $env:PORT='3137'; node server.js
# open http://localhost:3137
```

On the title screen:
- **CREATE CREW** hosts a room and shows a 6-character code.
- Crewmates type the code and press **JOIN**.
- **QUICK CREW** joins the public `ORBIT1` room.
- **FLY SOLO** starts a private room where you hold every seat.

In the lobby, each player clicks a seat card. The host presses **GO TO BRIEFING**, and the Commander presses **Enter / START THE COUNT**.

For LAN play, crewmates open `http://<host-PC-IP>:3137`.

## Crew seats

| Seat | Owns |
|---|---|
| **CDR** Commander | Orbit RCS: W/S pitch, A/D roll, Q/E yaw; entry bank (A/D); approach pitch and bank (W/S, A/D); rollout: W nose down, Q/E rudder steering (A/D also steers), Space brakes; DAP attitude hold (H); START, PAUSE, RETRY and RESTART |
| **PLT** Pilot | OMS-2 and deorbit burn authorisation (B); coast to TIG (T); time acceleration (`,` `.`); AoA assist (M); speed brake in approach and rollout (X open / Z close); landing gear (G) |
| **MS1** Mission Specialist 1 | Payload bay doors (Y); satellite release (R); RCS translation (I/K up/down, J/L left/right, U/O fwd/aft) |
| **MS2** Mission Specialist 2 | Satellite power (P); checkout review and GO for deploy (N) — release is interlocked until MS2 gives GO |

- Each seat can be taken by only one player.
- An empty seat falls to the Commander. With no Commander, it falls to the host.
- Seat ownership is enforced on the server. A command from the wrong seat is refused with a reason, for example "Commander (Voss) owns START". The HUD shows this as a toast.
- The server only reads the control axes that a player's seats own.
- Everyone can drag to look around, zoom, recentre (F), switch camera (C), use text chat (/) and toggle voice (V).

## Free-look camera

The follow camera stays centred on the stack, then the orbiter.

| Input | Action |
|---|---|
| Mouse drag, or one-finger drag | Look around freely |
| Wheel, or pinch | Zoom |
| `F` | Recentre |
| `C` | Cycle follow / payload-bay / fixed pad or runway view |

The view recentres after 4 s without input. On the pad it starts west of the stack, level with the horizon; during ascent it trails along the air-relative velocity. It never goes below the ground.

The sky (far pass, in km) includes:
- A textured, rotating Earth with a cloud layer.
- The Moon at 384,400 km.
- A sun disk.
- The team's planet models: Mercury, Venus, Mars, Jupiter, Saturn, Uranus and Neptune.

**Planet sizes are true apparent sizes** (Venus ≈30″, Jupiter ≈44″, Saturn with rings ≈41″, Mars ≈10″, Mercury ≈8″, Uranus ≈3.7″, Neptune ≈2.3″; Moon 0.52°, Sun 0.53°). In the normal 60° view every planet is far smaller than a pixel, so each is drawn as a point of light; **hold the right mouse button for the SCOPE** (a narrow-field sky view, wheel = magnification from 5× to 300×) to resolve the team's planet models. Directions are still a fixed scenario sky, not an ephemeris for a real date.

## Fixes after the first user playtest (2026-11-13 evening)

| Report | Root cause | Fix |
|---|---|---|
| Engine flames point the wrong way, even in space | The orbiter GLB's `FX_*` engine empties are exported with a −90° X rotation; plumes built along the empty's −Z pointed at the belly | Each SSME/OMS plume cancels its empty's rotation so it points along the vehicle's aft axis (`shuttle_view.js`) |
| Stack tips down after MECO, then tips up | Closed-loop ascent guidance kept steering for the 18 s MECO→ET-sep coast with no thrust (nose down), then large artificial "residual rates" and a fast 2.5°/s auto-maneuver | Guidance only steers while an engine thrusts; residual rates cut to ~0.1°/s; auto attitude maneuvers capped at 1°/s (`shuttle_simulation.js`) |
| SRB / ET separation stutters | Separated stages were drawn at raw 15 Hz server positions while the orbiter was dead-reckoned without thrust | Client renders ~1.5 snapshot intervals in the past and interpolates everything (Hermite for the orbiter, lerp/slerp for debris and satellite) (`shuttle_game.js`) |
| Bay doors open but bay still closed | The body mesh has its own closed bay roof under the separate door meshes | Roof triangles removed at load; a simple bay liner (floor, walls, bulkheads) added (`shuttle_view.js`) |
| Lost at "null rates / hold" | Orbit handover leaves the orbiter tumbling ~0.9°/s and HOLD is refused above 0.5°/s; the HUD gave no direction | New server-side NEXT step for every moment: who does it, which key, and for attitude work which key to hold and how many degrees remain. A Node check flies payload deploy and deorbit using only that cue (`shuttle_mission.js`, `run_checks.js`) |
| Earth blurry | 4096 px day map and 1024 px cloud map, no anisotropic filtering | Team Earth textures from `earth.glb` (5400 × 2700 day, 2048 RGBA clouds), anisotropic filtering, a procedural fine-detail layer within ~2,500 km, a thin limb glow |
| Planet sizes | Planets were enlarged 2–7° | True apparent sizes plus the right-mouse SCOPE (see above) |
| Controls | — | A/D roll, Q/E yaw (rudder) as requested; speed brake moved to X/Z |
| GUI too complex / AI-looking | — | New STS_OS display (below) |

**GUI.** The flight display is minimal by default:
- A mission tag (ID, phase, mission time).
- One command-line prompt saying what to do next, who does it and which key.
- A short terminal log.

Everything else is on the **DATA page (F3 or Tab)**: telemetry, systems, phase tasks, crew, your seat's keys and clickable commands. The title, lobby and dialogs use the same style, taken from the team's reference boards: black background, cream hairlines, monospace capitals (Share Tech Mono), an inverted header tab, a breadcrumb, a page number and a blue/rose progress bar.

**Evidence for this round** (cloud workspace, headless Chromium with SwiftShader; scripted crew pressing real keys):
- **Node checks:** `node tests/shuttle/run_checks.js`: 59 passed, 0 failed. This includes the new check that only the NEXT cue is followed, one key at a time, through payload deploy and deorbit.
- **4-client co-op flight:** run again with the new keys and GUI (`run_coop.js`). Result: WHEELS STOP — mission complete; sink 1.68 m/s, 260 m past the threshold, 4.8 m off the centreline, no retries.
  - Seat key presses: Voss Enter and H; Reyes B ×2, T and G; Okafor Y ×2 and R; Lindqvist P and N.
  - Each client's only console error is the Google Fonts request, which the test harness blocks.
- **Root cause found during that run:** with four slow clients, the host was dropped from the room because Socket.IO's `pingTimeout` was 5 s. It is raised to 30 s, so a player whose page stalls briefly keeps their crew seat.
- **Failure/retry browser test:** the collision, both entry failures, no-flare and **runway overrun (no brakes)** all failed as designed. Checkpoint retries and the lifecycle checks (leave, 10 start/leave cycles) are clean.
  - The no-gear case and the final "fly per cues" case both touched down about 100 m short from the restored approach checkpoint. The scripted pilot's approach from that checkpoint is marginal. The belly-landing failure itself is covered in the Node checks.
- **Screenshots:** plumes point aft at liftoff, after SRB sep and on the SSMEs. Attitude is unchanged through MECO → ET sep (quaternion constant to 3 decimals). The open bay shows the liner and satellite. The new title, lobby, briefing, prompt, DATA page, pause, entry, approach and debrief screens were also captured.
- **Not checked:** the Earth's sharpness from orbit was only seen over the night side in this run.

## Round 3 (2026-11-13 late): second user playtest

| Report | Cause | Change |
|---|---|---|
| Nose still dips below the horizon late in ascent | The closed-loop law could command thrust up to 20° below the horizon when altitude overshot the target | Lower limit of the thrust elevation is now the horizon (`shuttle_simulation.js`) |
| Corners sticking out of the bay, a sliver on the wing | Hull cut used a z range that left the forward arc section (z 8.1–9.8) and slivers; bulkheads were rectangles taller than the hull | Cut by triangle centroid over the whole door span; bulkheads are hull-shaped (circle r 2.5) and the walls stop at the sill |
| Flames too simple | Single translucent cone | Layered shader plume: core with throat, shock diamonds in air, streaky flicker; wider sheath; pulsing throat discs; vacuum expansion. SSME, OMS and SRB |
| No sound | — | `shuttle_sfx.js`: engine roar + sub, SRB crackle, wind by dynamic pressure, RCS jets, OMS hiss; one-shot liftoff, separations, MECO, bay, release, gear, touchdown, fail/complete; "creamy" key click on every key press/release |
| City lights on the night side | The repository's own night map (`earth_night_4096.jpg`, from the earlier Earth shader work) was not wired into the Shuttle view | That map is used as the Earth's emissive texture on the night side, blended across a soft terminator. A procedural map was briefly generated over it by mistake and has been reverted |
| A line showing where the shuttle should go | — | Yellow guidance ribbon: starts at the orbiter along its actual direction and bends onto the reference path (HAC → final → runway on approach; great circle to KSC in entry; the required nose/translation direction for orbit tasks). A deviation shows as a visible bend |
| Pressed keys on screen | — | Keycaps appear at their physical keyboard positions while held, left of centre |
| Stages that cannot be sped up | Warp limits 1× in entry/approach/rollout and around burns | Every phase accepts time acceleration: prelaunch 4×, ascent 8×, entry 8×, approach/rollout 4×, burns 4×; orbit phases unchanged |
| Timer at top-middle with a stage timeline | — | SpaceX-style timeline above the mission tag: five milestones around the current one, marker moving through the current segment |
| Landing guidance put me off the runway | Reproduced: a pilot doing only what the prompt said landed 0.6–1.3 km short. Approach pitch was a pitch-attitude rate command (4°/s): a held key could not be stopped on the cue, every correction overshot and the oscillation grew as speed decayed | Approach W/S now set the **glide angle** (fly-by-wire flight-path command, holds when released); the guidance publishes a glide-angle command in every approach segment; the prompt shows glide and bank errors; aim point moved to a nominal ≈ +700 m touchdown; Q/E steer on the ground. New check: following only the prompt lands at 0.25 / 0.5 / 1 s reaction times |

**Round 3 evidence.**
- **Node checks:** `node tests/shuttle/run_checks.js`: **61 passed, 0 failed**.
  - New check: the approach flown from the HUD prompt alone lands at 0.25 s, 0.5 s and 1 s reaction times: x 725 / 690 / 467 m, y 2.6 / 0.5 / 5.2 m, sink 1.96 / 2.07 / 1.25 m/s.
  - New checks: entry, approach and rollout accept time acceleration.
  - The existing failure cases still fail as designed: no flare, no gear, overrun, wrong-way bank, collision.
- **Known limit:** with 1.5–2 s between glances at the prompt, the prompt-only pilot still fails.
- **Browser** (headless Chromium):
  - The body pitch stays ≥ 0.0° above the horizon from MET 300 s to MECO.
  - Layered plumes render at liftoff.
  - Held keys appear at their physical positions (S and D adjacent; A and G with a gap).
  - The timeline shows five milestones around the current one.
  - The open bay has no protruding corners.
  - The guidance ribbon was seen in orbit, in entry and in approach, starting at the orbiter.
  - City lights show over south-east Brazil at night.
- **Sound:** generated with Web Audio. It was not heard in testing, because headless browsers have no audio output.

## Round 4 (2026-11-14): guidance line and steering arrows

| Report | Cause | Change |
|---|---|---|
| Line wrong in some stages | (1) The payload target pointed at the Earth. `lvlh()` built a left-handed axis set, so `qFromAxes` returned an unrelated attitude: the game had been asking for something other than "bay up, nose along track" (that is why it asked for ~166° rolls). (2) No line in deorbit before the doors closed or after the burn, or while coasting in orbit. (3) The orbit trail was stored Earth-fixed. (4) The approach path could climb above a low orbiter | (1) LVLH X = +orbit normal (right-handed); the release attitude, its line and the NEXT cues now agree. (2) Coasting shows the ballistic path ahead; insertion and deorbit burns show the burn direction. (3) The trail is inertial in orbit and Earth-fixed in the air. (4) The pre-final path never rises above the orbiter |
| Line too thick | Width grew with distance | About 2 px wide at any distance |
| Line only in front | — | Trail of the flown path behind the orbiter; the line always passes through it |
| Still failing the landing | Steering numbers in the prompt had to be read and converted into keys | Arrow tips around the orbiter: left/right (bank or steer), up/down (glide shallower or steeper), ↺/↻ (roll in orbit); 1–3 tips by size of error, none when on cue. In the air they are horizon-level, in orbit body-relative. The prompt no longer shows steering numbers |
| — | After the retrograde turn the prompt jumped to "authorize burn" while still rotating (refused) | New "hands off, let it settle" step before the deorbit burn |

Also: the flat KSC ground tile is hidden above 9 km, where it showed as a pale square.

**Evidence:**
- `node tests/shuttle/run_checks.js`: 61 passed, 0 failed. The arrows use the thresholds of the prompt-only landing check, which lands at 0.25, 0.5 and 1 s reactions.
- Browser screenshots were taken of the line and arrows in ascent, payload (tumble and align), deorbit (doors open and closed), entry (behind and side), approach (acquisition, HAC, off-course right, final) and rollout.

## Team assets used

| Asset (team Drive) | Use |
|---|---|
| `OrbitForge-GLBs` planets (`sun`, `mercury` … `neptune`) | Copied to `public/assets/planets/` (33 MB) and loaded through the existing `glbManager` |
| `SpaceCenter` (Godot 4 project) | It has no meshes: LC-39A is built procedurally in `LaunchComplex.gd`. That layout is ported to Three.js in `ShuttleView._buildLaunchComplex()` with the same dimensions and positions (see below) |
| `Orbiter`, `ExternalTank`, `SolidRocketBooster`, `Satellite` GLBs | Already in the repository; used as before |
| `ISS SIM`, `nasa_iss.glb`, `iss_lab.glb`, `lunar_eva.glb`, `earth.glb` | Not used: ISS, EVA and lunar content is outside this mission; Earth is the existing texture sphere |
| `GamerDraftVer.LMA.zip` (458 MB) | Not inspected: larger than the 400 MB transfer limit of the workspace bridge |

LC-39A from the team spec:
- Hardstand 130 × 6 × 130 m with embankments, plus flame-trench opening.
- Launch mount 28 × 4 × 28 m.
- Mobile launcher platform 42 × 2.5 × 42 m, deck at 12.8 m, with hold-down posts. The simulated stack now starts 34.1 m up, so the SRB aft skirts sit on that deck.
- 108 m fixed service structure at x = 26 m. It has tapering legs, 9 ring levels and diagonals, plus access arms and a hammerhead.
- Three lightning masts (118 m) at radius 88 m, with catenary wires.
- Water tower at (96, 58).
- Propellant spheres with feed lines.

Additions near the pad:
- The VAB, 158 × 160 × 218 m from the team README, at its real location with a flag and the low bay.
- The crawlerway to the pad.

## What changed in this co-op pass

**Removed (unhooked and deleted, recoverable with git).** The old missions and their UI:

| File | Content |
|---|---|
| `public/js/game/gameplay.js` | Old gameplay (≈3,000 lines) |
| `public/js/world/ship_interior.js` | Ship interior |
| `public/js/world/station_modules.js` | ISS modules |
| `public/js/world/docking_simulator.js` | Docking |
| `public/js/world/launch_cutscene.js` | Launch cutscene |
| `public/js/world/space_center.js` | Old space centre |
| `public/js/world/photorealistic_earth.js` | Old Earth renderer |
| `public/js/core/cinematic_pass.js` | Cinematic pass |

`audio_synth.js`, `glb_manager.js`, `voice.js` and the loaders are kept.

**Rewritten:**
- `server.js` game section: rooms of up to 4, crew seats, and one authoritative `ShuttleMission` per room. It advances at 30 Hz and broadcasts snapshots at 15 Hz. It also handles seat-checked commands and inputs, `RESTART`, rejoin mid-flight, chat and voice signalling. Auth, database and storage are unchanged.
- `public/index.html`: title, lobby with seat cards, auth and comms only.
- `public/js/game/main.js`: renderer, title, auth, room flow, lobby, comms.
- `public/js/core/network.js`: slim crew client.

**New or extended:**
- `shuttle_mission.js`: the MS2 GO-for-deploy objective and interlock; the `CREW` seat table.
- `shuttle_game.js`: network controller that dead-reckons snapshots; title flyby around the pad.
- `shuttle_hud.js`: seat-tagged controls, crew panel, chat, toasts, LEAVE.
- `shuttle_view.js`: free-look rig, sky and planets, LC-39A, VAB.

The simulation itself (`shuttle_simulation.js`) is unchanged apart from the pad height.

**Tests:**
- `tests/shuttle/run_checks.js` (Node, no dependencies).
- `tests/shuttle/browser/run_coop.js` (4 clients).
- `tests/shuttle/browser/run_failures.js` and `bot.js`, updated for the co-op build.
- `tests/shuttle/browser/run_full.js` (solo) was not re-run in this pass.

The test-only hooks:
- **Server:** start with `SHUTTLE_TEST=1` to allow freeze and step.
- **Page:** open with `?shuttletest=1`.

Normal play needs neither.

## Verification evidence

**Environment:** cloud workspace (Linux, Node 22).
- Runtime `node_modules` were copied read-only from the PC earlier.
- Server: `DATABASE_URL='' AWS_ACCESS_KEY_ID='' AWS_SECRET_ACCESS_KEY='' AWS_S3_BUCKET_NAME='' PORT=3137 SHUTTLE_TEST=1 node server.js`, which reports "Local Disk Mode".
- The browsers are headless Chromium with SwiftShader at 1–3 fps.
- The cdnjs three.js r128 request is served from a local r128 copy (test-only routing).

**Node checks — `node tests/shuttle/run_checks.js`: 58 passed, 0 failed** (after the GO, CREW and pad-height changes).
- Physics, staging, orbit validation, payload interlocks, separation, deorbit targeting, the entry bank comparisons and the approach comparisons all pass.
- The full scripted mission succeeds, including the GO step.
- Ascent still yields MECO / ET sep at 112 × 301 km, inclination 28.40°.

**Browser — 4-client co-op flight (`run_coop.js`):** crew Voss (CDR, host), Reyes (PLT), Okafor (MS1) and Lindqvist (MS2).

Each client reads its own snapshot copy and presses only the keys that belong to its seat, as real key events.

Setup checks:
- Lobby seat claims gave Voss = cdr, Reyes = plt, Okafor = ms1, Lindqvist = ms2. Okafor (MS1) clicked the already-taken PLT seat and still held MS1 at launch.
- The Pilot sending START returned `{"accepted":false,"reason":"Commander (Voss) owns START"}`.

Flight timeline (sim time):

| Sim time | Event |
|---|---|
| 11 s | Ascent |
| 533 s | Insertion |
| 3243 s | Payload |
| 3483 s | Deorbit |
| 10396 s | Entry |
| 12031 s | Approach |
| 12426 s | Rollout and debrief |

Result: **"WHEELS STOP — mission complete", success.**
- Touchdown: sink 1.93 m/s, 93 m/s, 288 m past the threshold, 5.2 m off the centreline, gear locked.
- Semantic key presses by seat:
  - Voss: Enter, H.
  - Reyes: B ×2, T, G.
  - Okafor: Y ×2, R.
  - Lindqvist: P, N.
- Held flight keys were filtered the same way: only the Commander client pressed the rotation, bank and steering keys, and only the MS1 client pressed the translation keys.
- Page errors on all four clients: none.

Screenshots were taken for the lobby (CDR and MS1 views), the PLT briefing, every phase from the CDR view, the MS1 bay camera, the PLT free-look during ascent, and the debrief.

**Browser — failures, retries and lifecycle (`run_failures.js`, solo crew through the server):** no console errors.

| Case | Result |
|---|---|
| Wrong-way separation | Failure: "Collision with the satellite: range 5.8 m and closing" |
| Retry from the ORBIT checkpoint, correct separation | Reached the deorbit phase |
| Entry with no bank input | Failure: "Missed KSC … 826 km … mean bank only 0°" |
| Entry with wrong-way reversals | Failure: "Missed KSC … 921 km … bank held AWAY from the site 39% of the time" |
| Entry following cues | Approach handover at 100 km / 22 km altitude |
| Approach without flare | Failure: touched down 2297 m short at a sink of 50.7 m/s |
| Approach without gear, and rollout without brakes | **Not shown in the browser this run.** In both, the scripted pilot touched down short (83 m and 147 m) before the gear or brake failure could appear. The approach checkpoint from this entry was low on energy and the bot's flare is marginal. The belly-landing and overrun failures are verified in the Node checks |
| Approach per cues after 6 checkpoint retries | WHEELS STOP — mission complete: sink 0.63 m/s, 91 m/s, 365 m past the threshold |

Lifecycle checks:
- After LEAVE, the page returned to the title with no HUD, no listeners and no room.
- After 10 more solo start/leave cycles, it was in the same state.
- None of the old activity globals were present.

**Browser — visuals:**
- Asset status: orbiter, ET, SRB, satellite and planets all "ok".
- The LC-39A complex was checked from 5 free-look angles.
- At liftoff, a free-look drag works.
- The Earth limb is now a thin view-dependent glow. The old flat 115 km shell showed as a grey band from orbit.
- During ascent, Mercury and Venus were found in view.
- In orbit, Mars, Saturn (with rings) and Jupiter were each brought into view with the free-look camera, clear of Earth.
- No page errors.

## Verification limits / remaining issues

- **No human real-time playthrough.** The browser runs used scripted crew members:
  - They pressed real keys.
  - Simulated time was advanced by the test-only step hook while real time was frozen.
  - Normal play runs the same server simulation from wall time at 30 Hz. Human flyability at 1×, especially the ≈27 min entry, is untested.
- **Co-op was tested on one machine**, four headless clients over localhost.
  - Not tested: latency across the internet, NAT, voice chat, or reconnecting mid-flight. A rejoin is coded but not exercised.
  - Remote players see the vehicle dead-reckoned between 15 Hz snapshots. Their control inputs reach the server one round-trip later.
- **Not measured on the user's PC/GPU.** The 33 MB of planet GLBs add load time.
- **The planets are deliberately not astronomically placed.** The Moon's direction is fixed too.
- **The LC-39A and VAB are simplified block structures** taken from the team spec. The ground away from the pad is a flat tile.
- **The flight-model limits are unchanged from the solo build:**
  - Gameplay approximations with no reference-trajectory validation.
  - Pacing is longer than the 15–25 min proposal.
  - Touch controls are untested on a device.
- **Upstream `origin/main` (`aa5267a`) has not been merged.** Its changes touch files that this pass rewrote or deleted.
- **On the PC, the deleted files above must still be removed**, with `git rm` or by deleting them. The new `index.html` no longer loads them in any case.

## Stage status

| Stage | Status |
|---|---|
| Core mission (ascent → landing, failures, checkpoints, debrief) | Implemented; Node and browser verified |
| Old missions removed | Done (unhooked in this copy; files to delete on the PC) |
| Co-op crew (4 seats, server authority) | Implemented; 4-client browser flight verified on localhost |
| Free-look camera and team assets | Implemented; screenshots verified |
| Human playthrough, PC performance, internet co-op | **Not yet observed** |
