# Implementation plan

**Additional mission:** [Artemis implementation plan](#artemis-implementation-plan--draft-2026-11-14), researched 2026-11-14. This is a new planning request, not permission to implement.

**2026-11-14 navigation:** the Shuttle plan below is historical; current implemented behavior is recorded in [progress](progress.md). The additional [CubeSat coverage plan](#cubesat-coverage-implementation-plan--draft-2026-11-14) is a new planning request, not authorization to execute the older Shuttle implementation prompt again.

**DRAFT — updated 2026-11-13 with confirmed control requirements and proposed scenario defaults. No gameplay implementation has begun.**

Baseline: `5012ff791a15f8b652df089fa8f3b9c4fbbda5c0`. Read [audit](codebase-audit.md) and [mission specification](mission-spec.md) first. Relative complexity is engineering scope, not a calendar estimate. Each milestone should be reviewable independently; do not polish ascent for weeks while the return journey is absent.

## Execution scope

The user requires automatic ascent, interactive orbital tasks, manual entry banking and manual glide landing, and intends Claude to complete that gameplay. The prompt below adopts the recommended satellite-first, single-pilot fictional training scenario with guidance/checkpoints; these are defaults the user can change before sending it. Sending the implementation prompt authorizes the core implementation through M1, M2a, M2b, M3 and the gameplay stability gate. Milestones organize work and verification; they are not repeated permission gates or stopping points. This documentation-only handoff does not implement gameplay.

Existing co-op/design/showcase activities remain intact. M4 shared flight and the later GUI redesign require separate scope decisions and are not part of this first completion target. A separate backend security task is required before public-account use (audit F13); it is not permission to rewrite auth during Shuttle work.

External GLBs are not a prerequisite: useful models already exist. Do not add dependencies or replace frameworks without a concrete need and approval. Future source/module paths below are proposals. Preserve original assets; source adaptation belongs in code or derived assets.

## M1 — Mission lifecycle and restartable state

**Outcome:** A separate Shuttle entry point provides a minimal phase/objective HUD and restartable mission state. The existing co-op route still behaves as before. Internal fixtures can make transitions, cancellation and retry testable before flight math is built; a separate public rehearsal mode is unnecessary. Continue directly into the playable loop.

- **Files/systems:** proposed `public/js/game/shuttle_mission.js`, `shuttle_hud.js`; minimal script/menu wiring in `public/index.html`, `public/js/game/main.js`; adapter boundaries around `space_center.js`, `launch_cutscene.js` and `docking_simulator.js`. Add focused tests in a later implementation change; no test files were added by this audit.
- **Dependencies/boundaries:** adopt the prompt's scope and a small state/command contract. Keep current script-loading style. Do not replace design consoles or reskin UI. Introduce `cancel()` separately from successful completion; fix timer ownership when integrating old managers. Prefer existing owners or small modules; do not create a generalized mission framework for one scenario.
- **Temporary shortcut:** explicit rehearsal fixtures supply stage/orbit/entry/landing facts through a test adapter. The HUD marks preset transitions; rehearsal ends as “rehearsal complete”, never a valid flight. The current launch animation may illustrate ascent but cannot certify orbit. No fake engine/altitude values are passed off as measured telemetry.
- **Acceptance:** every required phase is testable through fixtures; out-of-order commands return reasons; duplicate completion is idempotent; exit never starts docking later; retry rebuilds one set of objects/UI/listeners; a fresh mission has no old payload or completion flags. A normal-flight result cannot be awarded from fixtures or skip.
- **Automated checks:** command/guard transition table, duplicate/stale event rejection, checkpoint round-trip, cancel during delayed callback, new run after cancel, rehearsal result exclusion. Run actual mission reducer without DOM/Three.js.
- **Manual checks:** start/exit/restart at pad, mid-launch and capture delay; repeat 10 times; use keyboard/touch buttons and blur/release; revisit original co-op lobby/interior/hangar/ISS/Lunar activities. Inspect placeholder labelling.
- **Risk/complexity:** **Medium**. Global listeners and visibility flags can leak across modes; isolate ownership without broadly refactoring unrelated systems.

## M2a — Rough playable outbound flight and payload task

**Outcome:** Player starts and monitors automatic ascent/staging, reaches a validated orbit, then actively prepares, deploys and separates from one independent satellite.

- **Files/systems:** proposed `shuttle_simulation.js` and `world/shuttle_view.js`; M1 state/HUD; existing KSC, launch model construction, GLB manager and audio adapters.
- **Dependencies/boundaries:** M1. Establish SI/frame contract and fixed step first. Implement central gravity, thrust/mass, simple atmosphere, bounded attitude guidance and orbital elements. Keep one scenario and one payload. Do not implement ISS rendezvous, ground-network design, detailed engine failures or a fully manual first-stage controller.
- **Acceptance:** nominal ascent requires no player steering, throttle or staging; the automatic controller drives simulated state and exposes measured telemetry. SRB separation, MECO and ET separation occur in valid order once; stage mass changes do not teleport the vehicle. A vertical high-altitude trajectory cannot trigger orbit. Main engines cannot thrust after ET loss. Insertion requires the orbit envelope. Player performs bay/power readiness, RCS alignment/rate settling, release and departure as specified in the mission spec. Payload release requires correct state/doors and becomes a separate object with inherited motion; objective completes only after safe clearance/deployment. Without player orbital commands the objective remains incomplete.
- **Automated checks:** circular-orbit propagation and bounded energy drift, vertical-suborbital rejection, staging mass/velocity continuity, frame-transform round trips, deterministic replay at 30/60/120 rendered FPS, payload release once and closed-bay rejection. Compare integrated state within documented tolerances, not screenshots alone.
- **Manual checks:** full outbound run with hands-off automatic ascent, then player-controlled payload work. Omit orbital commands; attempt unsafe release and wrong-way departure; recover alignment and retry. Exercise insertion underburn through a labelled test fixture; inspect slow-loading assets/staging. Verify HUD against state, including units.
- **Risk/complexity:** **High**, split into simulation/timebase, staging/guidance, and payload changes. Art sockets help, but no existing physical ascent can be reused. Do not polish camera effects yet.

## M2b — Rough return, entry and runway completion

**Outcome:** Complete the first rough mission loop: payload success → deorbit → entry → glide/landing → debrief, with failures and checkpoint retry.

- **Files/systems:** M2a simulation/view, mission state/HUD; proposed `world/shuttle_landing_site.js` or a localized KSC runway extension; original orbiter clips through the view adapter.
- **Dependencies/boundaries:** M2a. Use one landing opportunity, calm weather, coarse terrain, simple aerodynamic coefficients and generous labelled training envelopes. Use the same state across orbital/atmospheric/local render transitions. These are deliberate approximations; no teleport from orbit to an unlabelled landing success.
- **Acceptance:** player aligns/authorizes deorbit; retrograde burn changes the predicted entry path and incorrect timing/energy can miss the site. Entry AoA assist is explicit; player bank magnitude/reversal timing changes trajectory, energy and lateral error. No automatic bank sequence substitutes for input. Announce the transition to player pitch/bank control for glide. Player flies alignment/flare, deploys gear and controls rollout. Approach is unpowered; runway bounds, touchdown speed/sink, attitude and gear determine success or failure. Rollout ends with a stop. Retry works from payload, entry and approach; no design-console victory can complete Shuttle mode.
- **Automated checks:** deorbit lowers perigee, lift/drag direction and sign, zero aerodynamic force in vacuum, bank sign changes lateral lift, dissipated energy does not increase without thrust, runway collision inside/outside boundaries, touchdown envelope edges, checkpoint equivalence, completion exactly once. Include transition stress tests around entry interface/time acceleration.
- **Manual checks:** one full successful mission; intentional undershoot, overshoot, high sink, late gear and runway overrun; retry each. From the same entry checkpoint compare guided player banks, no input and wrong reversals; from approach compare successful flare with no flare. Record different trajectories/outcomes. Compare 30/60/120 FPS; background/resume; verify time warp drops to 1× before sensitive phases.
- **Risk/complexity:** **High**. Largest missing functionality; use simple credible dynamics and iterate on flyability. Declare the loop complete only after observed playthrough, not a unit-test result.

**Gate before further polish:** Demonstrate the whole M2a+M2b loop and at least one recovery. If it fails, repair that loop before improving individual phase visuals or adding ISS work.

## M3 — Guidance, authenticity and asset reliability

**Outcome:** The complete mission becomes understandable and consistently flyable, with credible guidance, unit-correct feedback and dependable art behavior.

- **Files/systems:** simulation/guidance configuration, mission/HUD/view adapters, `glb_manager.js`, launch/docking lifecycle boundaries and asset/socket mapping.
- **Dependencies/boundaries:** rough-loop gate. Select reference profile, verify NASA-derived values, tune ascent heading/roll/pitch and entry/terminal guidance. Refine simple aero rather than migrating to a professional simulator. Keep the deferred ISS mode separate.
- **Acceptance:** guidance explains orbit energy and range management; no universal hardcoded roll claim; displayed AoA/bank correspond to flight-relative geometry. Asset sockets/pivots match model scale, stage exhaust follows its stage, bay animation gates payload release, and gear animation agrees with contact logic. Failure messages name the actual failed quantity. Slow asset loads/retries do not lose models, replay stale callbacks or leak listeners.
- **Automated checks:** reference-trajectory tolerances, no discontinuity at frame/stage changes, missing-asset failure paths, stale-load cancellation, event replay/idempotency, bounds/socket adapter tests, frame-rate invariance and save-schema rejection.
- **Manual checks:** novice guided run, minimal-assist run, touch controls, camera changes, keyboard remapping/focus, 10 retries with delayed assets. Inspect geometry/animations and loading errors in a real browser; record measured performance on declared hardware.
- **Risk/complexity:** **Medium–High**. Overfitting a single trajectory and confusing UI polish with guidance quality. Keep parameter tolerances documented as gameplay choices.

## M4 — Shared-flight authority (conditional)

**Outcome:** If approved, multiple crew members see the same Shuttle phase and vehicle; one pilot/controller owns flight commands, with useful spectator/crew feedback.

- **Files/systems:** `server.js`, `core/network.js`, shared mission/simulation contract, checkpoint serialization; possibly a small server mission module rather than expanding existing task handlers.
- **Dependencies/boundaries:** M1 contract; schedule after M2 for solo-first approval, or add basic authority from M1 if shared flight is required immediately. Keep existing seven task IDs and co-op activity semantics. Do not infer vehicle authority from avatar positions.
- **Acceptance:** one authority commits commands and stage events; all clients agree on phase/result; late join gets a complete snapshot; disconnect/reconnect and pilot transfer follow a documented rule; stale/duplicate/unauthorized commands are rejected; one client cannot complete the mission locally. Shared pause/retry/time warp requires authority agreement.
- **Automated checks:** two-client command ordering, revision/epoch rejection, packet loss/reconnect, owner disconnect, checkpoint restore and idempotent outcomes. Use isolated local rooms, never production accounts.
- **Manual checks:** two browsers with independent inputs/latency; compare telemetry, staged bodies and payload; disconnect at burn/retry; regress original room/interior activities. Voice remains separately tested.
- **Risk/complexity:** **High**. A real extension to existing avatar networking; cannot be advertised as already implemented. Public release additionally depends on the separate auth fix in F13.

## Gameplay stability gate — required for this delivery

The core mission is complete only when all of the following are demonstrated:

- One observed, uninterrupted normal mission from KSC through automatic ascent, valid orbit, player payload work, deorbit, player-controlled bank reversals, manual glide/landing and stopped rollout/debrief. No preset transitions or skip-success flags.
- No-input/wrong-input comparisons show that orbital tasks, bank control and landing require the player. Guidance helps without silently completing these tasks.
- Meaningful failures and checkpoint recovery are exercised; exit/restart and repeated retries do not duplicate objects, timers, listeners or outcomes. Failed/aborted flights cannot report success.
- Minimal readable HUD gives controls, objectives, units, assistance state, guidance, failure explanation and retry. Keyboard/touch input ownership, focus/blur and camera changes work; representative frame rates do not change simulation results beyond documented tolerances.
- Relevant automated checks and legacy-mode smoke checks pass. A real browser shows correct assets, animations and runway contact. Record what was observed, exact commands/results and remaining limitations in progress. If browser verification is blocked, explicitly leave this gate unverified; do not claim tests prove a finished game.

Fix failures within the core scope and continue until this gate passes. If an external blocker cannot be resolved, record the concrete blocker and next action without calling the mission complete. Do not spend this delivery on M4 or the GUI redesign.

## M5 — Later GUI redesign (separately scoped)

**Outcome:** Freeze a stable gameplay contract, then replace the GUI while keeping mission behavior unchanged.

- **Files/systems:** first simulation/mission acceptance suite; subsequently `public/index.html`, `public/css/style.css`, `shuttle_hud.js`, mode menus and HUD adapters. Existing DOM construction in other activities can be migrated in small reviewed groups.
- **Dependencies/boundaries:** full mission and retry observed; asset/input/performance checks pass; M4 if shared flight is in scope. User approves visual direction separately. No styling-driven changes to orbital dynamics or success guards.
- **Acceptance:** the HUD shows objectives, current phase, usable actions, units, guidance/assist state and failure/retry affordances. New UI consumes the same snapshots and commands; replayed inputs yield identical mission results. Preserve all other game modes. Desktop/mobile layouts remain usable with keyboard and touch, readable contrast, reduced-motion support and unclipped critical telemetry.
- **Automated checks:** state-to-view formatting/units, command emission, keyboard/focus behavior and representative responsive UI tests; rerun unchanged mission replay suite.
- **Manual checks:** full flight using the new UI, all failure/retry screens, portrait/landscape, zoom and low resolution, modal focus, legacy activity navigation. Compare against approved design before replacing it.
- **Risk/complexity:** **Medium–High** due to current inline DOM/style coupling. The M1 interface is the main protection against rewriting mission logic.

## Deferred work

Full ISS rendezvous/docking is a later optional mission using the criteria in [mission spec](mission-spec.md#later-iss-objective). Detailed abort modes, full cockpit switchology, multiple weather/landing sites, advanced thermal/structural modeling, robotic-arm simulation, new ground-station planning, framework migration and asset replacement are outside the first loop. The presence of art or a README promise does not authorize these features.

## Implementation prompt for Claude

This prompt adopts the recommended defaults. The user can edit them before sending; the current handoff remains documentation only.

```text
Implement the complete core Shuttle mission in:
C:\Users\Omen 16\OneDrive\Desktop\VScode Workspace\SpaceApp\Interfellas

Read CLAUDE.md and its four linked documents first. Verify repository identity, HEAD/status and applicable instructions against audited commit 5012ff791a15f8b652df089fa8f3b9c4fbbda5c0. Inspect intervening changes; preserve unrelated work and the SkyDetective parent. The audit is a baseline, not proof of current runtime behavior.

I authorize the core gameplay implementation. Adopt the recommended first scope: one single-pilot fictional Shuttle-era satellite deployment mission from KSC to orbit and back to a KSC runway. Preserve existing co-op and other activities. Full ISS rendezvous, shared Shuttle flight, EVA/robotic-arm simulation and GUI redesign are deferred.

Required player experience:
1. Start/monitor automatic launch and ascent, including roll/pitch/throttle guidance, booster separation, MECO and tank separation. No mandatory manual ascent controls. Reach a physically validated orbit; altitude alone is insufficient.
2. Perform orbital work: authorize guided insertion if needed, open bay/check cooling and payload readiness, use RCS to align/stabilize, activate/check/release the satellite, maneuver clear and verify deployment. These actions and outcomes must depend on player input and simulated state, not auto-complete in the launch cutscene.
3. Prepare return, align retrograde and authorize a guided deorbit burn with useful predictions.
4. Manually control entry bank magnitude and reversal timing. Default assistance may maintain a scheduled high angle of attack and coordinate turns. Banking changes the lift vector, energy/range and crossrange; do not implement flat yaw-only zigzags or automatic reversal playback.
5. Manually fly unpowered heading alignment, glide, preflare/flare, gear deployment and rollout. Give pitch/bank control, useful approach cues and steering/braking after touchdown. No powered go-around or scripted landing success.
6. Provide objectives, a minimal functional HUD, phase-specific controls, failure explanations, checkpoints, retry and debrief. Clearly explain control handovers and assists.

Use the current architecture and original assets. Extend responsible systems or add small focused modules; no framework rewrite or speculative generic simulator. Keep simulation/mission logic independent of rendering/DOM, with explicit units/frames, stable stepping and validated commands. Reuse existing art, loaders, audio and KSC where suitable. The existing cinematic cannot certify orbit or objective completion.

Work through M1, M2a, M2b, M3 and the gameplay stability gate as internal checkpoints. Do not stop after scaffolding, rehearsal or a rough outbound flight; continue to a complete playable and verified return mission. Build the rough whole loop before polishing phases. Do not ask for milestone approval already covered by this prompt. Ask before new dependency/setup changes or material scope expansion; do not spawn agents, commit, push, deploy or access external DB/storage services without permission. Use documented local test overrides.

Run focused automated checks and real browser playtests. Demonstrate one full normal mission and failure/retry cases. Compare correct input, no input and wrong input from equivalent entry/approach checkpoints to prove player control changes trajectories/outcomes. Check restart/cleanup, frame-rate independence and existing modes. Never count fixture states, skips, fake telemetry or animation completion as flight success.

Update docs/progress.md with actual changes, commands/results, observed playthrough evidence and remaining limitations. If runtime verification is blocked, identify the blocker and leave completion unverified. Deliver the working core mission with concise run/control instructions and an honest completion report; defer the GUI redesign.
```

## CubeSat coverage implementation plan — DRAFT 2026-11-14

**Superseded the same day by [cubesat-coverage-plan.md](cubesat-coverage-plan.md)**, which covers both confirmed modes (Sandbox and Real Satellite). The earlier C1–C3 single-mode sequence is in git history and is folded into the new milestones.

Milestones (details, acceptance criteria and checks are in the plan's §6–§7):

| # | Milestone | Depends on |
|---|---|---|
| C1 | DOM-free core: scenario/validation, UTC GMST, circular propagator, look angles, pass search with grazing detection, union statistics, X/Y compare, phase return | — |
| C2 | Mission choice in title/lobby, `room.activity`, coverage room state, editor ownership, shared clock, cleanup. Shuttle loop untouched | C1 |
| C3 | Shared `earth_globe.js` (Shuttle view switched, screenshot-checked), coverage globe, clock, NOW, NEXT PASSES, timeline, playback | C2 |
| C4 | X/Y markers, compare panel, return-to-X countdown, orbit numbering, replay from start | C3 |
| C5 | Scenario editor, validation, onboarding, empty/error states, table view | C3 |
| C6 | Results, A/B comparison, save/load/export | C4, C5 |
| C7 | Real data layer: satellite.js (D1), CelesTrak GP proxy/cache/error budget, SatNOGS catalog, bundled snapshots (D2), data age | C1, C2 |
| C8 | Real mode UX: satellite picker, source/age display, station catalog picker, Copy to Sandbox, element refresh | C6, C7 |
| C9 | Performance, 2–4 client session, full playtests in both modes, Shuttle regressions, progress evidence | all |

Planning only. Implementation begins when the user sends the prompt in the plan's §11. Do not run the older Shuttle implementation prompt above again.

## Artemis implementation plan — DRAFT 2026-11-14

Plan only; no application implementation authorized by the current request. Read the [Artemis specification](mission-spec.md#artemis-lunar-expedition--draft-2026-11-14) and its dated NASA sources. Deliver one complete astronaut expedition, not just a landing vignette. Preserve existing Shuttle changes and the two-mode CubeSat work; do not implement both lander-provider routes by default.

### Repository evidence and ownership

Inspected at `5925567e06fba35afedcee29829d850ab6e46c35` on `shuttle-coop-mission`, 2026-11-14. Existing documentation edits and untracked CubeSat plan were present. No revalidation of prior gameplay results was performed.

- `server.js` imports `ShuttleMission`/`CREW`, fixes `GAME_MODE` to `shuttle-coop`, and constructs/restarts that class directly. Reuse server authority, room snapshots and semantic command checks. Extend mission selection at these actual ownership points; if CubeSat routing has landed by implementation time, extend it instead of adding a competing selector. Separate per-mission result/role logic; no need for a plugin framework.
- `public/js/game/main.js` owns current menu/lobby/controller handoff; `core/network.js` transports room commands. Keep one mission clock/authority, mission-specific input bindings, epoch/revision checks and complete late-join snapshots. New Artemis state must track two independent vessels while the crew is split.
- `shuttle_simulation.js` supplies useful pure vector/quaternion helpers, time conventions and Earth-frame calculations. Its gravity/propagator are Earth-only and vehicle data is Shuttle-specific. Build a small cislunar simulation owner; extract shared math only when reused and regression-tested, without disturbing Shuttle guidance to fit Orion.
- `shuttle_view.js` renders a Moon at fixed direction `moonDir` and 384,400 km. This is decorative sky context, not an ephemeris or a lunar landing world. Reuse loader/render techniques and suitable textures; replace the Artemis scene's celestial geometry and add local terrain/collisions. Do not claim existing Moon art proves a flyable surface exists.
- Inspected asset filenames include Shuttle stages, generic spacecraft and planets; no verified SLS/Orion/HLS flight-ready asset set was established. Inspect geometry, scale, sockets and licenses before claiming reuse. Generic meshes can be clearly labelled development proxies, not historically accurate final vehicles. Never stretch a Shuttle into an SLS or reuse its collision shape as a lander.

Likely focused additions (names are proposals): `artemis_simulation.js` for dynamics/vehicles, `artemis_mission.js` for phase/crew/checkpoint rules, `artemis_game.js` plus HUD adapter for inputs/snapshots, and `artemis_view.js` for vehicles/terrain. A small scenario data bundle owns dated assumptions/ephemeris/terrain references. Do not split further without a real ownership need. Reuse any suitable shared Earth view introduced by CubeSat work.

### A0 — Freeze the concept and prove a feasible reference expedition

**Outcome:** an inspectable mission brief/trajectory, not yet a game. Adopt the recommended Blue Moon-style concept or the user-selected alternative; recheck NASA changes, freeze source date, select one training epoch/site and one coherent stack/upper-stage assumption. Identify missing assets and inspect available ones before installation/download work.

**Work:** derive/validate transfer, capture, rendezvous, descent/ascent and return opportunities against finite vehicle budgets; prepare bounded Earth/Moon/Sun data and a local terrain product; label unavailable performance numbers as training assumptions. Establish reference states and numeric tolerances with an independent calculation/tool, not only the future game implementation. Document any new tool/dependency need and ask for required setup permission only after identifying it.

**Acceptance/proof:** full trajectory reaches the chosen site and returns with stated reserves; stage/propulsion ownership is coherent; ephemeris/time/frame and terrain conventions are explicit; lander can arrest descent and launch its return mass. Source review rejects obsolete NRHO/Gateway assumptions and provider mixing. Main risk: unknown future vehicle data and infeasible invented budgets. Complexity: high; resolve this before production visuals.

### A1 — Playable lunar landing and recovery segment

**Outcome:** from a labelled pre-descent practice checkpoint, two crew undock, descend, manually land, perform one short surface task, ascend and rejoin Orion. This is an internal development segment, never a claim of full mission completion.

**Systems:** cislunar/local simulation, two-vessel mission state, lander collision/terrain, active docking, minimal HUD and crew commands. Initial orbit/terrain fixtures are marked practice; they must use A0-feasible states. Provide reserve/abort cues and checkpoint retry.

**Acceptance/proof:** correct inputs land; no/wrong inputs produce different trajectories and possible failure. Touchdown depends on legs/terrain and speed; final docking depends on full relative state. EVA pressure/crew rules cannot be bypassed. Unit/reference checks for lunar gravity, thrust/mass/fuel, local transforms, contact envelope, docking roll/velocity and snapshot restore; observe the practice loop in a browser. Complexity: high, focused on the core new gameplay.

### A2 — Complete rough launch-to-splashdown loop

**Outcome:** connect launch → Earth orbit → trans-lunar injection → cruise/capture → A1 lunar segment → departure/return → Orion entry/parachutes/splashdown/debrief. Include the planned short EVA sequences before declaring content complete. Continue to A3/A4; a polished launch alone is not delivery.

**Systems:** SLS/Orion vehicle states, guided finite burns, phase guards, resource budgets, cruise acceleration and event stopping, capsule entry model, save/restart. Use prepositioned lander logistics as a verified scenario initial condition. Automatic launch remains simulated; no elapsed-time orbit/capture flags.

**Acceptance/proof:** one uninterrupted normal mission with all crew/samples tracked; no resource resets or state discontinuities; rejected out-of-order staging/docking/entry commands; accelerated coast gives equivalent event states within documented tolerances. Compare independent reference burn/encounter/return cases, test frame-change position AND velocity, verify mission failure/success exactly once, and observe browser launch-through-splashdown. Complexity: very high, largest mission integration work.

### A3 — Surface operations, co-op and recovery reliability

**Outcome:** all four players have useful phase-specific duties; two descend, two remain with Orion, and everyone reunites. Solo mode can cover duties without changing crew physics. The bounded EVA objectives, pressure/resource checks, samples, failures and save/resume are reliable and understandable.

**Systems:** room ownership/role transitions, full vessel/crew/surface inventory snapshots, site lighting/walking/collisions, guidance and mission audio, lifecycle cleanup. Integrate existing comms without confusing social voice with physical telemetry connectivity.

**Acceptance/proof:** two-client then four-client tests for command ownership, simultaneous commands, disconnect/rejoin, host/controller reassignment and retry agreement. Prevent a player controlling both mutually exclusive vessel stations or transferring while undocked; preserve legitimate solo role switching. Exercise unsafe landing, missed rendezvous, EVA reserve exhaustion and one safe abort-return; verify no duplicate vehicles/samples on repeated retries. Human test measures useful work and idle periods for the orbital crew. Complexity: high; do not wait until final release to discover split-vehicle authority problems.

### A4 — Accuracy, assets and completion verification

**Outcome:** an end-to-end educational mission whose vehicle appearance, terrain and dynamics meet the declared accuracy level. Replace development proxies with verified mission assets or explicitly report the remaining art limitation. Do not market unfinished proxies as accurate replicas.

**Acceptance:** dated architecture and assumptions visible in briefing/reference notes; correct body scale/orientation and lighting; state-driven staging/doors/gear/engine visuals; no impossible Moon aerodynamics or Shuttle-style Orion landing. UI provides units, controls, assists, objective/failure/retry state and accessible text alternatives. A full human-paced successful flight, a separate failure/recovery run and a co-op split/reunion are observed. Scripted tests alone cannot establish flyability.

**Proof:** reference trajectory comparisons and step-size convergence; weak/coarse ephemeris interpolation cannot move touchdown/encounters beyond declared tolerances; 30/60/120 rendered FPS invariance; fast-coast event accuracy; persistent-save round trip; frame-switch/camera stability over Earth–Moon distance; terrain/collision agreement at the selected site; PC performance and input focus tests. Regress Shuttle and any implemented CubeSat modes after mission routing/shared-math edits. Report actual tested hardware, runtime gaps, numerical error and assumptions. Complexity: high; prioritize correctness/flyability over cinematic polish.

### Final completion rule and handoff

Done means a crew can launch from Earth, complete a physically consistent lunar landing and surface tasks, ascend/rejoin, and return alive to an acceptable Orion splashdown, with meaningful player control, finite resources, failure explanations and working save/retry. All required phases must be playable and verified; not merely reachable via test fixtures. Do not implement unsupported professional-level emergencies, both provider concepts, every logistics launch or a lunar base to satisfy this gate.

When the user authorizes implementation, execute A0–A4 as internal reviewable milestones, updating progress with evidence rather than stopping after scaffolding. Resolve final provider/art selection before dependent implementation. If reference data is unavailable, specify and approve an explicitly hypothetical training parameter set rather than fabricate NASA values. Report any blocked verification and do not claim completion while the final gate is unobserved.
