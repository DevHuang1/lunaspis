# Implementation plan

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

Planning only. Implement after the user asks to proceed. Scope and variable definitions are in the [CubeSat specification](mission-spec.md#cubesat-contact-coverage-mission--draft-2026-11-14). Preserve the current co-op Shuttle and unrelated uncommitted changes. Do not restore removed activities from the historical audit.

### Existing implementation to reuse

Source inspected 2026-11-14, without running/revalidating Shuttle gameplay:

- `public/js/game/shuttle_simulation.js` exports SI constants, `elements`, `keplerPropagate`, ECI/ECEF transforms, spherical station coordinates, ENU basis and vector helpers. These already own the needed orbit/frame mathematics. Validate supported circular-orbit cases and reuse; do not reuse Shuttle ascent/entry approximations to predict CubeSat coverage.
- Its `gmst` helper advances a supplied `theta0`; it is not a full UTC-to-sidereal-time initializer. For the proposed first model initialize orbit orientation Earth-relative at the stated epoch, or explicitly add/test a UTC orientation conversion if inertial elements are introduced. Never advertise real satellite predictions using the current fixed scenario orientation.
- `public/js/world/shuttle_view.js` contains reusable Earth assets/render conventions, but its class also owns Shuttle scenery/cameras. Reuse assets and narrowly fitting view helpers, not a complete Shuttle scene for a standalone coverage map. Prefer a small focused coverage view over a speculative rendering framework.
- `main.js`, `core/network.js` and `server.js` now own co-op crew flow. Add a separate mission entry. Recommended default if used in crew rooms: shared scenario and simulation clock, host-owned configuration/time controls, independent local cameras. Reuse room authority; do not assign Shuttle flight seats to station tasks without a gameplay need. This co-op default is a proposal, not a user-selected new requirement.

### C1 — Contact calculation and complete prediction data

Outcome: configure one circular orbit and a station list; obtain available stations at any time plus chronological access windows over a chosen interval. Add a small coverage module owning visibility/pass search/statistics, using existing orbital math. It must run without DOM or rendering. Validate all finite inputs/ranges; bound station counts/horizon for responsive calculation and, if networked, validate on the authoritative side.

Acceptance: Earth occultation and minimum elevation work; overlapping contacts are retained; active versus future passes are distinct; returned intervals include start/end, peak, and clipping flags; network coverage uses interval union; empty/disabled station lists return valid zero coverage and a full-window gap. Preserve stable station IDs when names/positions change.

Proof: overhead, horizon/mask boundary, opposite-side-of-Earth, equatorial/polar/retrograde, date-line wrapping and finite-input cases; independent analytic circular-period check; short/grazing passes; compare against a finer reference calculation; same results at different playback speeds. Main risk: frame/sign errors and missed short passes. Relative complexity: medium.

### C2 — End-to-end player coverage mission

Outcome: mission entry → scenario setup → map/globe and pass timeline → X/Y inspection → next revolution → summary. Files likely affected: menu wiring plus a focused CubeSat controller/HUD/view; room routing only as required by the chosen shared-session scope. Add no launch or satellite-deployment prerequisite.

Acceptance: clicking/scrubbing X/Y produces matching position/contact lists; contact lines never cross Earth; next-pass table matches timeline; countdown to X is distinct from next ground-station pass; Earth rotation continues across revolutions. Playback/pause/jump/restart leave no stale actors/listeners or wrong mission state. Give accessible labelled inputs and a text/table alternative to globe-only selection.

Proof: real browser run with multiple overlapping stations, a blackout and two complete revolutions; compare forecast timestamps with live status changes, including accelerated playback; inspect X/Y/revolution labels, contacts and list sorting; smoke-test the existing Shuttle entry/co-op flow. If sharing a room, two clients must agree on scenario revision/time/results and reject unauthorized edits. Main risk: confusing rendered map positions with simulation frames, and accidentally altering Shuttle routing. Relative complexity: medium.

### C3 — Variable experiments, comparison and completion

Outcome: player changes the specified inputs, saves A/B scenarios and sees how station counts, passes and gaps change. Preset should yield useful contacts during a demonstration; determine the result by calculation, never hardcode station order. Offer a geographically spread hypothetical station preset and custom placement. A scored station-budget challenge is optional later polish.

Acceptance: increasing a station's elevation mask cannot create new geometric access in the same scenario; disabling a station cannot increase network coverage; increasing playback speed cannot alter predictions. A/B retains each configuration and reports its own horizon. UTC epoch changes with Earth-relative starting orientation only shift timestamps in this ideal model; avoid pretending every input changes geometry. All pass/summary results explain finite-horizon and geometry-only limits.

Proof: focused invariant tests plus observed browser edits to altitude, inclination, track orientation, start phase, station placement and elevation masks. Exercise zero contacts, overlapping windows, window-boundary passes, reset and repeated mission switching. Final gate: demonstrate the user's X → Y → next stations → next revolution questions with computed results and at least one meaningful A/B comparison. Update progress with exact checks and remaining verification limits. Main risk: misleading repeat/contact language and statistics. Relative complexity: low–medium after C1/C2.

No implementation begun for C1–C3. RF budgets, data downlink scheduling, real station availability, TLE/SGP4 integration, perturbations and constellations are deferred; do not add them to finish the core question.
