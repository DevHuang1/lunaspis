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

Update 2026-11-14 (round 5, below): by user direction the crew now boards on foot from the LC-39A gantry (team assets from remote-main), and an **ISS docking** flight was added next to the satellite deploy. The removal note above still holds for the old interior/board-ship activities; docking ends at soft capture.

## Round 6 (2026-11-15): CubeSat mode — ISS deployment phase (VERIFIED)

User request: CubeSat mode jumped straight to the CubeSat already in orbit. Add an animation of the CubeSat launching from the ISS with gameplay, realistic to how CubeSats are really deployed from the ISS. Design, sources, physics and file list: **[cubesat-iss-deploy.md](cubesat-iss-deploy.md)**.

Handover checklist (tick as done; anyone can continue from the first unticked item):
- [x] `public/js/coverage/deploy_core.js`: simulation of the whole J-SSOD procedure (load → depress → outboard → grapple → move → point + GO/NO-GO → release → 30-min inhibit → handoff). Verified in Node: a scripted run reaches handoff (orbit 413.77 km, 51.64°, e 0.0002). At T+30 min the CubeSat is 3.33 km ahead of and 2.33 km below the ISS. The direction checks match the design doc.
- [x] `server/coverage_room.js`: opt-in deploy state, `DEPLOY` / `DEPLOY_INPUT` requests, roles, tick, snapshot, handoff into the Sandbox scenario, and `SKIP`. `node tests/coverage/run_checks.js` 29/29; `node tests/shuttle/run_checks.js` 61/61.
- [x] `public/js/core/network.js`: `deploy_state` channel.
- [x] `server.js`: ticks the deployment and broadcasts `deploy_state` at 10 Hz; `{ deploy: true }` at session start. **Off switch: start the server with `COVERAGE_DEPLOY=0` to get the old behaviour (straight into orbit).**
- [x] `public/js/coverage/deploy_view.js` (3D scene), `deploy_hud.js` (STS_OS panels, EE-camera overlay, prediction plot, GO/NO-GO), `deploy_game.js` (controller: snapshot interpolation, keys, hand-controller input). Hooked into `coverage_game.js` (`_startDeploy` / `_endDeploy` / `_ensureUi`, frame + key + pointer guards, result card after handoff, test hooks `__coverageTest.deploy*`). Script tags are in `index.html`. All files pass `node --check`.
- [x] Browser solo deployment from title through load, depress, outboard, grapple, move, pointing, GO poll, release, first beacon and coverage handoff. Both GLBs load, the original model arm is hidden, Earth renders below the ISS, the hand-controller keys converge, and pointerdown controls survive live panel updates.
- [x] `?coveragetest=1` host auto-skip and the existing `tests/coverage/browser/run_coverage.js` regression pass. Added `tests/coverage/deploy_checks.js` and `tests/coverage/browser/run_deploy.js`.
- [x] Two-player browser check confirms host JEMRMS + flight and guest crew. Guest BEGIN, arm input and SKIP are refused. Host load-step requests are refused. Guest loading and host skip reach both clients.
- [x] Handoff evidence recorded below.

Continuation evidence on the PC, 2026-11-15

- User requested minimal GUI wording and no green text. Deployment briefing is four short rows. Checklists, phase hints, logs and the result card use compact labels. GO, AOS, completion and success text use ink-white. The HUD shows the latest three log entries.
- Fixed the coverage handoff's misplaced `else`, which displayed “Scenario problem” for a valid forecast. Fixed the EE overlay to project the real fixture through the camera, including depth and roll. Moved the overview camera clear of the solar array. Coverage epoch now rounds forward to the minute after the 30-minute inhibit.
- `node tests/coverage/deploy_checks.js` passes 12/12 groups. Covers the complete procedure, airlock and grapple interlocks, IK boom lengths, pointing and ordered GO poll, inhibit, handoff validation, directional safety, analytic CW cross-track propagation, frame conversion, warp limits and two-player authority.
- Existing Node checks pass. Coverage 38/38, Shuttle 61/61, docking 15/15, landing assist 6/6, and planned-route checks for both flights. `node --check` passes for all deployment, integration and new test files. `git diff --check` passes.
- `tests/coverage/browser/run_deploy.js` passes in installed Chrome with the normal title-screen entry and real keyboard events. Timers are accelerated through the existing test-only warp option. The arm is flown at 1×. First beacon occurs about 4.07 km from the ISS, 3.33 km ahead and 2.33 km below, with zero fixture contacts and zero airlock violations. The resulting coverage orbit is about 413.8 km at 51.64°. Computed AOS and GO font colours are `rgb(237, 232, 221)`. Both clients complete the skip transition with the deployment HUD removed. Browser errors are empty.
- `tests/coverage/browser/run_coverage.js` passes with `COVERAGE_OFFLINE=1` and a fresh isolated `COVERAGE_CACHE_DIR`. Earlier attempts used live data or an existing cached ISS element record, which invalidated that test's offline-only expectations. Fresh-cache offline testing passes the catalog, fallback, forecast, shared session and four Shuttle/CubeSat lifecycle cycles.
- Browser evidence and temporary local test launchers are in `C:/Users/Omen 16/.codex/visualizations/2026/11/15/01a1dd5f-7652-7272-a82c-9a0dd3481caa/`. Screenshot folders are `deploy-browser` and `coverage-browser`. Used existing installed Playwright and Chrome, with process-local DB/storage overrides and temporary local servers.
- Limits remain a scripted local playthrough with accelerated timers. Human 1× deployment, internet latency and touch-device deployment controls remain unobserved. Orbital safety uses the documented simplified CW and constant differential-drag model.

Post-release playtest fix, 2026-11-15

- User reported excessive CubeSat spin and a trajectory line pointing toward Earth's surface after release. The default release used a 3.10°/s angular-rate magnitude, displayed at about 186°/s under 60× warp. Nominal tip-off is now sampled within ±0.1°/s per axis, below the existing published 5°/s per-axis limit. Rotation-vector rendering replaces compounded Euler rotations.
- The old post-release trail represented ISS-relative displacement. The view now draws an Earth-centred Kepler orbit using the existing Shuttle propagator and the CubeSat's inherited ISS velocity, spring impulse and rotating-frame velocity term. A fine near-camera orbital arc passes through the CubeSat. Pre-release pointing predictions remain on the pointing console. The shared inertial-state conversion also feeds the coverage handoff.
- `node tests/coverage/deploy_checks.js` passes 14/14 groups, including nominal spin bounds at 60×, inherited orbital velocity, orbit clearance above 410 km and zero-offset ISS-state equivalence. `node tests/coverage/run_checks.js` passes 38/38. Changed JavaScript syntax checks and `git diff --check` pass.
- The updated `tests/coverage/browser/run_deploy.js` passes the full solo deployment and two-player checks in Chrome. During 60× drift, measured screen rotation is 3.71°/s, plotted orbit altitude spans 412.40–415.15 km, and the local arc passes through the CubeSat within 0.005 mm. Release-direction guides are hidden after separation. Browser errors are empty. Screenshot `deploy-browser/05a_orbital_drift.png` shows the orbital line above Earth's limb. This remains a scripted local playthrough.
- Changed deployment script URLs to `v=9.0.1`. Restart the game server and refresh the client to use the new nominal release rates and renderer.

Keys: load Enter · depress P pump, V vent, L leak check, H outer hatch · outboard T · grapple W/S A/D (image), R in / F out, Q/E roll, Shift vernier, G grapple · move M · point A/D yaw, W/S pitch, Shift fine, B brakes, K camera, G GO (your consoles), Y arm, Enter deploy · done Enter = start coverage · C camera · , . warp · Esc leave. Host can **Skip to orbit** at any time.

## Round 5 (2026-11-14): remote-main integration — boarding walk, detailed KSC, ISS docking

User direction: take from `SpaceApp/remote-main` (the team's main branch) the astronauts and their animations, how they walk, the detailed Kennedy Space Center, the ISS and proximity voice chat; **local wins every overlap** (GUI included) and only missing GUI is added, in the STS_OS style. Flow: solo / co-op room → spawn on the gantry of the service structure → walk the access-arm bridge and board → the normal mission. New flight: **ISS docking** (no station interior; the flight ends at docking). Fix the eight playtest issues first.

Playtest fixes (first): orbiter V1 (separate cockpit windows) instead of V2; nose and yellow line agree through ascent (ascent "ahead" line = thrust + gravity, closed-loop pitch bounded to the flight-path angle +13°/−5°, heads-up roll at T+345 s); no nose-up/upside-down flip; the ET falls away from where it really is (was spawned 12.4 m off and double-stepped); hand-over rates 0.05–0.07°/s (was 0.4–0.7); the back-away line no longer makes a right angle; points behind the camera are clipped (no cut-off or wedge lines); far plane 320 km. Re-entry cue: pointing retrograde for the deorbit burn is correct; the cue now says why and that the autopilot turns the nose forward for entry.

What was taken from remote-main (copied unchanged unless noted):
- `public/js/world/space_center.js` + `public/js/world/space_center/*.js` (LC-39A, VAB, LCC, crawler, utilities, environment). `public/js/world/ksc_scene.js` (new) builds them without UI, stack, sky or dynamic lights and moves the fixed service structure to the orbiter's **port side** (east; the sim's stack has dorsal north), base sunk in the apron so the gantry deck is level with the crew hatch. It replaces the earlier pad and VAB in `shuttle_view.js` (old builders kept as a fallback); the ground tile has a hole where the KSC brings its own ground, beach and ocean, at the true surface height.
- `public/js/core/glb_manager.js`: the remote superset (astronaut rig with idle/walk/look-around/wave, emote gestures, HTML-escaped hangar text), with the local "Perilune" naming kept.
- `public/js/core/voice.js` (proximity voice: distance-shaped gain/filter, jitter buffer, VAD hysteresis) with one local patch: the `debrief` room status counts as lobby (full volume). `server/voice-signaling.js` (room-checked relay, chunk size cap, rate limit).
- Walking (WASD relative to the camera, Shift run 3.9/5.6 m/s, turn toward motion) and the third-person camera are ported from remote `main.js` into `public/js/game/pad_walk.js` (new). Collision is a walkable-surface model (`public/js/game/pad_layout.js`, shared with the server): the staging deck and the extended arm; nobody can fall off.

Boarding: everyone spawns on the staging deck. Walking into the yellow ring (access-arm control) swings the arm and White Room to the orbiter (server-owned, ~3 s). Walking the bridge to the cyan ring at the hatch boards that crew member. Other astronauts are visible and animated; proximity voice follows the distance on the gantry, crew aboard are heard from the cabin, and in flight everyone is at full volume. Keys 1–6 play the remote rig's expressions (wave, salute, dance, laugh, look, roger) for everyone. The briefing card lists who is aboard; the server refuses START until the whole crew has boarded. Server events `pad_pos` / `pad_moved` / `pad_action` (ARM, BOARD) validate positions against `pad_layout.js`. The simulation's pad height moved to the remote MLP deck (orbiter origin 41.1 m; checks unchanged).

ISS docking flight (lobby / menu: FLIGHT → ISS DOCKING): no satellite (an equal-mass logistics carrier rides in the bay), launch heading 44.9° and lofted second stage (hTarget 165 km) → 51.55° orbit, OMS-2 to ~300 km. **Documented skip:** the two days of rendezvous phasing are skipped; the station (remote `models/iss/ISS_stationary_opt.glb`, LVLH attitude, forward port PMA-2) is placed on the orbiter's own orbit 250 m behind it on the V-bar (+V-bar approach, no relative drift). Tasks: MS1 opens the bay (the docking system is in the forward bay), CDR nulls rates / attitude hold and turns the bay toward the station with the nose up, MS1 translates in (I/K along the docking axis, J/L and U/O across it). The prompt gives one key at a time from the real offset and closing rate (target 0.4 m/s far out, 0.06 m/s at the end). Contact limits: closing 0.03–0.15 m/s, offset < 0.30 m, misalignment < 4°, roll < 10° from nose-up, rotation < 0.2°/s, doors open; otherwise the failure says why and the PROX checkpoint retries. Warp 10× far out, 4× inside 60 m, 2× inside 15 m. C cycles to a docking-ring centreline camera. Soft capture ends the mission (debrief shows the contact numbers).

Evidence (container, 2026-11-14):
- `node tests/shuttle/run_checks.js` 61/61 (deploy flight, after the pad-height and variant changes). `node tests/shuttle/dock_checks.js` 15/15: 51.55° orbit 300 × 301 km; station ≈250 m behind with no drift (10 min hands-off stays within 15 m); a crew pressing only the NEXT cue key docks (closing 0.078 m/s, offset 0.04 m, misalignment 2.5°, ~24 sim-min, 1 298 kg RCS left); rushing (0.30 m/s), doors closed, 8° misalignment and 0.015 m/s each fail with their reason; PROX retry; warp caps; default flight unchanged. `node tests/coverage/run_checks.js` 38/38.
- Browser (SwiftShader): solo boarding — walk to the arm control, arm swings, cross the bridge, boarded, briefing lists the crew aboard. Two clients: both spawn walking; START refused "Waiting for … to board"; the Pilot sees the Commander's animated astronaut move to the console; the arm state reaches every client; the Commander's BOARD accepted at the hatch; the whole two-seat flight then ran to **WHEELS STOP — mission complete** (sink 1.91 m/s, 617 m past the threshold, 13 m off centreline). The browser bot's approach logic was out of date since round 3 (it steered pitch, not the held glide angle) and was updated to the glide-angle cue. ISS flight: menu/lobby flight picker, ISS briefing, station rendered 250 m away (GLB loaded), docking-ring camera, placed contact → SOFT CAPTURE debrief with contact numbers. KSC renders from deck, aerial and pad views; the White Room meets the orbiter's port side.
- Found and fixed while testing: gantry positions were sent volatile and were dropped over HTTP long-polling, so the server refused BOARD; positions are now reliable and the request carries the walker's position.
- Limits: four simultaneous SwiftShader clients could not even load the title (software rendering of the full KSC); the four-seat flight itself was verified in round 2 and is unchanged apart from boarding. Proximity-voice audio itself needs real microphones (the gain path is exercised, not heard). No human playthrough of boarding or docking yet. The orbiter model has no modelled side hatch, so the White Room meets the fuselage at the measured hatch spot (body x 2.65, y 2.0, z 11.5).

## Round 6 (2026-11-14): line, nose, station side, key sound (user playtest)

- **Nose vs line entering space.** Measured: in the vacuum second stage the guidance flies the nose ~10° (bound 13°) above the flight path — a physical need (thrust above the velocity fights gravity; a near-zero-alpha second stage was swept and cannot reach orbit with this guidance: lofted runs hit the 300 km apoapsis target while far too slow). After ET separation the orbiter then held that attitude while the orbit carried the path away (13° → 25°). Fixes: (1) after ET separation (+8 s) the autopilot turns the nose onto the direction of travel, heads-up, and tracks it until the hand-over (measured 0.4° from the line); (2) during powered ascent the line leaves the orbiter along the nose and blends onto the predicted path further out.
- **Line cut off ahead in orbit.** In orbit the whole orbit is now drawn (two-body, far scene, recomputed every 0.5 s sim; a suborbital arc stops at 80 km), so the line never ends a few hundred km ahead.
- **Line gap around the orbiter (follow-up).** The far-scene orbit is clipped within 0.5 km of the camera (its near plane), which left a gap around the orbiter when zoomed out; the orbit is now also drawn ±300 km around the orbiter in the near scene (Kepler samples every second), so the line runs continuously through the orbiter, front and back. Verified the station start position in the browser: 277 m ahead along the velocity and the nose, visible ahead in the default follow camera (the mission runs on the server, so the server must be restarted to pick this up).
- **Line style.** All guidance lines are thin 1-px STS_OS ink-white lines, like the CubeSat orbit lines (trail dimmer, line ahead brighter); the prompt says "guide line".
- **ISS behind the orbiter.** The station is now placed 250 m AHEAD on the orbiter's orbit (orbiter on the −V-bar, looking at it along its direction of travel). It flies tail-first (−XVV, an attitude the real ISS also flew) so the forward PMA-2 port faces the approaching orbiter; the docking attitude is bay toward the station ahead, nose up.
- **Key sound.** The keyboard click is rebuilt as a "creamy" lubed-linear sound: tight dry tick + short 1.2 kHz clack + round 450 Hz body + soft low thump, separate lighter top-out on release, deeper stabilised big keys, six random variants each (`synthKey` in shuttle_sfx.js; energy 12% < 300 Hz, 43% 300–800 Hz, 36% 0.8–2 kHz, 9% above 2 kHz).
- Checks: run_checks 61/61, dock_checks 15/15 (cue-following crew docks from the new side: closing 0.079 m/s, offset 0.03 m). Browser screenshots: ascent line from the nose, insertion nose on the line with the ET falling away, payload phase line + orbit, ISS ahead of the orbiter at the start of the approach.

## Round 7 (2026-11-14): easier landing, bigger timeline, skip to OMS-2

- **Landing assist (default on, M toggles in approach/rollout).** When the crew is hands-off on an axis for 1 s, the assist flies the guide-line cues (flight-path command, bank cue, speedbrake cue after 3 s), lowers the gear below 120 m AGL at ≤165 kt EAS, and in rollout lowers the nose, steers the centreline and brakes. Any key input takes that axis back. Prompts say when the assist is flying, flaring or braking. Fixed a rollout overrun under the assist (an unset brake timestamp gave NaN and disabled the brakes).
- **Bigger mission counter and stage timeline** (tag 20 px; timeline up to 920 px wide, 14 px labels); the log/chat/toast moved down to clear it.
- **"Skip ahead to the burn [T]" after ET separation now works**: once OMS-2 is authorised it coasts on the two-body orbit to 60 s before ignition, keeping the attitude relative to the local horizon.
- Checks: assist_checks 6/6 (new; hands-off crew lands from the approach checkpoint), run_checks 61/61 (manual-failure cases run with the assist off), dock_checks 15/15.

## Round 8 (2026-11-14): site tour, matching nameplates, controls legend

- **Site tour (from remote-main).** While walking on the gantry, T starts a tour of the whole KSC site using remote-main's six `SITE_TOUR_SPAWNS` (Pad 39A, VAB, LCC, crawler, beach, press site); 1–6 fast-travels between them; T returns to the gantry spawn. The walker collides with the site's box/circle colliders, stays in the site bounds, cannot climb the pad mound, and follows the ground by a downward raycast (pad surfaces, roads). Boarding triggers are off during the tour. Emotes (1–6) are unchanged on the gantry.
- **Nameplates in the HUD style.** New `public/js/core/os_plate.js` draws every world label like the HUD mission tag: square corners, 1-px ink rule, solid key cell + dark cell, Share Tech Mono upper case. Astronaut plates read `[ROLE] NAME` (`*` marks the host); the gantry markers read `[1] ACCESS ARM CONTROL` (yellow key) and `[2] BOARD ORBITER` (cyan key), matching their rings.
- **Controls legend.** The run-on controls sentence under the walk prompt is now one row of key chips (`[W A S D] Walk  [Shift] Run  [Drag] Look  [Wheel] Zoom  [V] Mic  [1–6] Gestures  [T] Site tour`), separated from the instruction by a rule; in the tour 1–6 reads "Fast travel" and T "Back to gantry". Reject reasons / "Aboard:" appear on their own status line only when present.
- **Time acceleration (2026-11-15, user direction).** Up to 100× in every flying phase (pre-launch, ascent, insertion, docking, payload, deorbit, entry), including burns and close to the station; only the landing (approach and rollout) is capped at 4×. Every fixed 1/60 s step is still simulated at any warp, so burns, separation and contacts behave the same, only faster (a 100× ascent costs ~1.8 ms per 30 Hz server tick). Tests updated for the new limits.
- **Title screen dead (2026-11-15, fixed).** A planned-route change made on the PC on 2026-11-14 (`shuttle_route.js`, `public/data/shuttle_route.json`, `scripts/build_shuttle_route.js`, a new `shuttle_view.js`, `tests/shuttle/flight_path_checks.js`, `tests/shuttle/browser/run_route.js`) needs `shuttle_route.js` loaded before `shuttle_view.js`; later `index.html` deliveries from this session dropped that script tag, so `new ShuttleView` threw on the title screen and no button worked. The tag is restored; those PC files are now the reference copy here too. Verified on the PC's own server in the desktop browser: no new errors, `ShuttleRoute` loaded, title wired up. flight_path_checks pass.
- **Gantry fixes (2026-11-15).** Esc on the gantry now shows the pause card ("paused boarding") and freezes the walker (the card was hidden while walking). Emote bubbles use the STS_OS plate (`[>] WAVE`, blue key, above the nameplate) via `OsPlate.drawEmote`, hooked from glb_manager's `drawEmoteBubble`. Run is 2× walk (7.8 m/s; remote-main's 5.6 barely read as running) with the walk clip at 1.7×; `pad_pos.moving` = 2 while running (server relays it) so others see it. Verified headless: pause card + no movement while paused; 3.9 / 7.8 m/s at fixed 1/60 s steps; emote plate screenshots; no page errors.
- Checks: node --check on the changed files; run_checks 61/61, assist_checks 6/6, dock_checks 15/15. Browser (1280×720, headless): gantry with plates + one-row legend; tour at Pad 39A standing on the raised pad (y 1.59 m), VAB at ground level, back to the gantry at the spawn; no page errors. Not checked: phone width, real multiplayer plates of other players.

## CubeSat Contact Coverage — implementation (2026-11-14)

Status: **both modes complete and verified (automated + browser).** The user ran `npm install satellite.js@6.0.0 --save-exact --ignore-scripts --no-audit --no-fund` (D1; package.json now pins it) and `node tools/coverage_snapshot.js` (D2) on 2026-11-14. Bundled data: 8 CubeSats from CelesTrak's `cubesat` group (LASARSAT #62391, KNACKSAT-2 #67683, PROPCUBE 3 #40973, SITRO-AIS 28 #59071, CROCUBE #62394, ROBUSTA-3A #60243, TRITON-1 #39427, PROPCUBE 1 #40976; 45–98°) and 357 Online/Testing SatNOGS stations (of 4 572 listed). Refresh the data by rerunning the tool. Plan: [cubesat-coverage-plan.md](cubesat-coverage-plan.md). The team-oriented redesign (stations on the globe, inspect anywhere + pins, coverage-coloured track, team results + CSV) replaced the fixed X/Y markers by user direction.

How to play: title screen → MISSION **CUBESAT COVERAGE** → FLY SOLO or CREATE ROOM (others JOIN with the code; the host edits, everyone has their own camera). Keys: SPACE play/pause · , . speed · N next event · S stations mode (click globe = add, drag = move, click = edit) · hover track/timeline = inspect · click / P / shift-click timeline = pin · K pins panel (tick two → compare) · T track span · Z timeline zoom · C camera (globe / follow / close-up with the 3U CubeSat) · L Earth lock · E scenario editor · TAB data page · ? help.

Files: `public/js/coverage/coverage_core.js` (DOM-free math), `coverage_view.js`, `coverage_hud.js`, `coverage_game.js`; `public/js/world/earth_globe.js` (Earth shared with the Shuttle view); `server/coverage_room.js` (scenario/clock/editor authority), `server/coverage_data.js` (CelesTrak/SatNOGS proxy: 2 h cache, cooldown, error budget); `tools/coverage_snapshot.js`; `public/assets/cubesat_3u.glb` (true-size 3U CubeSat built in Blender, 87 KB; source `SpaceApp\Drive\cubesat_3u_source.blend`). Edited: `server.js` (room activity, routes), `main.js` (mission picker, routing), `network.js` (coverage channel, min-RTT clock offset), `index.html`, `os_theme.css`, `shuttle_view.js` (uses earth_globe).

Evidence (this session, container):
- `node tests/coverage/run_checks.js`: 29/29 Sandbox and session checks. These cover geometry against the analytic elevation (9.8e-15 rad), Earth occultation against an independent segment–sphere test (10 000 pairs), grazing passes of 0.5 s / 5 s / 30 s found despite the 10 s grid, mask boundary ±0.001°, periods 92.41 / 95.50 / 100.72 min, the −23.94° track shift per orbit, date-only shift, equatorial/polar/retrograde, date line, monotonic invariants, validation, playback-speed independence, union statistics, azimuths, coverage counts, team stats, CSV, station paste, edit ownership, the shared clock, and station edits keeping the clock. A 24 h forecast for 50 stations takes about 70 ms.
- Real-mode checks (`tests/coverage/real_checks.js`), now 38/38 in total. SGP4 matches the Vallado 2006 reference vectors for #00005 to under 1 m and 1 mm/s. GMST matches satellite.js to 1e-9 rad over 1990–2100, plus Vallado example 3-5. WGS84 station positions and look angles match satellite.js. Real pass edges (LASARSAT, 9 passes) agree with an independent brute-force scan to 0.002 s. Nodal period agrees with mean motion within 1 %, and phase return works. A saved scenario replays offline to an identical forecast with zero network calls. Data-age tiers and invalid records are handled. The server proxy serves from its 2 h cache, does not retry after a 404 and applies a cooldown, and the error budget stops upstream calls after 20. Copy to Sandbox starts 4.5 km from the real satellite.
- `node tests/shuttle/run_checks.js`: 61/61. Shuttle orbit and briefing screenshots before and after the Earth extraction are identical apart from the clock.
- Browser playtest `tests/coverage/browser/run_coverage.js` (SwiftShader, 1280×720 and 1024×640): ALL PASSED. It covers jumps landing on predicted events, contact lines never crossing the Earth and matching the in-view list, station add/drag/edit on the globe, paste list with a line error, my stations, hover inspector, click-to-pin and three pins, pin comparison, results with per-day rates and gaps, CSV download, editor altitude change, A/B, the invalid-input message, replay with an identical forecast, two clients with the same forecast hash, viewer edits refused, shared clock within 0.2 s, an editor's station reaching the viewer, editor handover, four Shuttle↔CubeSat switches with no stale HUDs or listeners, and no console errors.

- Browser, Real mode (server offline, so the bundled data must be used): SGP4 loaded in the page, 8 curated CubeSats, SatNOGS catalog with licence and note, 8 nearest catalog stations added, offline fetch explained, real forecast (56 passes), data-source banner, data page with SGP4/element epoch/azimuths, and Copy to Sandbox → edited copy labelled hypothetical. Pins are cleared when the orbit, start time or window changes. Final run: 46/46, no console errors.

Remaining limits: SSCWeb comparison (plan N21) was not done (needs network). Sound in coverage mode is only the key click. The planet backdrop is not shown in coverage mode. No human playthrough yet.

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

Pick the Shuttle flight under MISSION (SATELLITE DEPLOY or ISS DOCKING; the host can change it in the lobby). In the lobby, each player clicks a seat card. The host presses **GO TO BRIEFING**. Everyone appears on the LC-39A gantry: walk (WASD, Shift run, drag to look) to the yellow ring to swing the access arm, then across the bridge to the cyan ring at the hatch. When the whole crew is aboard, the Commander presses **Enter / START THE COUNT**.

Checks: `node tests/shuttle/run_checks.js` (deploy flight), `node tests/shuttle/dock_checks.js` (ISS flight), `node tests/coverage/run_checks.js`; browser playtests need a server started with `SHUTTLE_TEST=1`.

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
