# Shuttle mission specification

**Additional mission:** [Artemis lunar expedition draft](#artemis-lunar-expedition--draft-2026-11-14), researched 2026-11-14. Planning only; current Shuttle and CubeSat work is preserved.

**Scope update 2026-11-14:** the Shuttle material below is the original design history; current implemented status is in [progress](progress.md). The new [CubeSat coverage draft](#cubesat-contact-coverage-mission--draft-2026-11-14) is an additional requested mission and supersedes the earlier communications-planner exclusion for that scope only.

**DRAFT — control requirements confirmed 2026-11-13; recommended scenario defaults remain proposed. This documentation handoff does not itself start implementation.**

Baseline: `5012ff791a15f8b652df089fa8f3b9c4fbbda5c0`, audited 2026-11-12. See [codebase audit](codebase-audit.md) for current behavior and evidence. This describes the intended destination, not what already works.

## Proposed scope and decisions

Build an accessible, historically grounded Shuttle mission from Kennedy Space Center through orbital work to an unpowered runway landing. Prioritize understandable cause and effect, useful guidance, and recoverable mistakes. This is not a certified flight model or a reproduction of every switch in a Shuttle cockpit.

Recommend **satellite deployment first**, using the existing `Orbiter_V2`, `ExternalTank`, `SolidRocketBooster` and `Satellite` GLBs. Bay opening, payload release and safe separation create a meaningful orbital task without implementing a second spacecraft's entire rendezvous problem. Preserve the existing ISS practice, interior, spacecraft-design consoles, hangar and Lunar showcase as separate activities.

Confirmed requirements: nominal launch/ascent is automatic; the player performs orbital work, controls entry bank magnitude/reversal timing, and pilots the unpowered approach/landing. Claude's intended deliverable is the complete core mission, not a rehearsal or first milestone only.

Recommended defaults adopted by the implementation prompt when the user sends it (not previously selected by the user):

1. Satellite deployment as the first objective; defer full ISS rendezvous/docking.
2. A separate, single-pilot Shuttle mode. Existing six-player co-op stays intact. Shared Shuttle flight requires its own authority/synchronization milestone before it is advertised.
3. A fictional Shuttle-era training mission: generic LEO payload deployment and KSC return, without claiming to recreate an actual STS flight.
4. Guidance cues, entry AoA assistance, labelled coast acceleration and checkpoints. Rehearsal fixtures may support development but a player-facing rehearsal mode is not required. Proposed pacing target is roughly 15–25 minutes, to be tested rather than enforced by false telemetry; prioritize flyability if credible pacing takes longer.

No new satellite communications/ground-station planner. Existing design-console functionality remains available; it is not a prerequisite for Shuttle flight. No GUI overhaul until gameplay passes the acceptance gate. No new assets are assumed available from Google Drive.

## Player contract and progression

Normal play follows this sequence. A phase advances because its guard is satisfied, not merely because a cinematic finishes. Failure and pause are orthogonal states; rehearsal uses visibly labelled fixtures and cannot award a completed flight.

| Phase | Player task / feedback | Exit condition and failure handling |
|---|---|---|
| Briefing / prelaunch | Understand payload, target orbit, return site and assists; board; confirm readiness | Start accepted once; stack attached, vehicle initialized, input owner selected. Explain unmet readiness conditions |
| Ascent, SRBs attached | Monitor the automatically flown roll/pitch/throttle program; no mandatory steering, throttle or staging inputs | Autopilot reaches booster burnout/separation conditions. Guidance acts on simulated state; a timer alone cannot certify flight |
| Ascent, orbiter + ET | Monitor automatic ascent and MECO/ET separation; flight controls remain owned by guidance | MECO on target energy/state; then ET separation after engine shutdown. Prevent invalid or repeated stage events |
| Insertion / coast | Orient for the planned OMS maneuver; authorize/execute burn; inspect apoapsis/periapsis | Bound orbit with both apsides within the scenario's safe target envelope for a dwell period. Altitude alone never qualifies |
| Payload operations | Manually orient/stabilize with RCS; open bay, activate/check payload, align for release, release, verify deployment and maneuver clear | Payload is independently propagated with inherited velocity plus small separation impulse; safe distance and deployment confirmed. Prevent release with closed doors, incomplete checks or unsafe attitude/rates |
| Deorbit preparation / burn | Close bay, select landing opportunity, orient retrograde, authorize burn, inspect predicted entry | Energy reduction puts trajectory into the entry corridor for the selected landing site. Early/late/insufficient burn yields a clear miss prediction and retry option |
| Entry | Player commands bank magnitude and reversal timing using guidance cues; default assist maintains scheduled AoA; monitor energy/range, heating and load | Reach terminal-area gate with a viable energy/range/heading envelope. Wrong or missing bank input changes the trajectory and can cause a miss; excess heating/load or unrecoverable range error yields a reason |
| Approach / landing | Fly heading alignment, glide, flare, gear deployment and rollout | Touchdown within runway bounds at acceptable sink rate, speed, attitude and gear state; wheel stop produces success. Ground contact elsewhere, excessive sink, or runway overrun fails |
| Debrief | Review objective, return outcome, assists, mistakes and retries | Retry a checkpoint or start a fresh mission; no retained actors, timers, input or stale outcomes |

Temporary rehearsal shortcuts must display “REHEARSAL — PRESET STATE” and cannot satisfy normal-flight guards. A later skip/coast feature must propagate the state and stop before events, not set an arbitrary altitude and call it orbit.

## What the crew does, and what the player controls

Real orbital duties vary by mission: operate/check spacecraft systems, manage attitude and maneuvers, open the bay to expose cooling radiators, deploy/retrieve payloads, operate experiments and sometimes robotic arms or perform spacewalks. STS-7, for example, combined satellite deployments, robotic-arm work and experiments; no single mission requires every kind of task. See the NASA sources below.

For this first mission, implement this bounded interactive sequence. The exact release mechanism and thresholds are fictional training choices matched to available art, not a reconstruction of STS-7:

1. **Establish orbit:** inspect orbital guidance and authorize a guided OMS insertion burn if needed. The autopilot executes the authorized burn; derive orbit validity from position/velocity. Explain the handover from automatic ascent to orbital controls.
2. **Prepare the spacecraft:** player opens the bay and checks cooling/payload power readiness. Show actual door progress and a small set of state-based readiness indicators. Do not invent a complex thermal/electrical simulator or reward merely clicking through text.
3. **Aim and stabilize:** player uses RCS pitch/yaw/roll controls to match a release-attitude cue and reduce angular rates; attitude hold can maintain an orientation the player has acquired. Allow bounded translation for separation. Display reference frame, alignment error, rates and resources. Vacuum translation does not stop when keys are released.
4. **Prepare and release:** player powers/activates the payload, confirms readiness, then commands release. Interlocks explain unmet conditions. Doors must be physically open; attitude/rates must be in a documented envelope. Use the existing satellite deployment animation only when clearance permits.
5. **Separate and verify:** player commands a guided-direction RCS departure; both bodies retain their state and separation motion. Confirm actual clearance, safe relative motion and payload deployment before completing the objective. A missed command or unsafe action cannot auto-pass; provide a corrective cue or checkpoint retry for collision/unrecoverable failure.
6. **Prepare return:** after clearance, player stows equipment/closes the bay, acquires the retrograde attitude and authorizes the guided deorbit burn. Show burn readiness, predicted entry and residual error; do not require orbital-mechanics calculations from a novice.

Scientific experiments, arm manipulation, EVA, servicing and ISS rendezvous are later mission options. Do not add shallow versions merely to increase the task count.

## Entry and landing control contract

Nominal automatic ascent is historically grounded; the crew still monitored systems and could respond to contingencies. Do not require manual ascent steering for this game. Manual entry banking is an intentional gameplay emphasis using a real control capability, not a claim that every Shuttle entry was hand-flown from entry interface. Heading alignment, approach and landing were normally manually controlled.

- **Entry:** left/right inputs command bank rate or bank target with bounded authority; releasing input has a documented hold/neutral behavior. Display actual/target bank, reversal cue, crossrange, energy/range margin, AoA and load/heat warnings. Cues derive from current trajectory, not a fixed repeating left/right timer. Assistance holds scheduled AoA and coordinates turns; it does not choose the player's banks/reversals. Advanced manual pitch is optional, not required for the first release.
- **Transition:** explicitly announce the shift from assisted entry AoA to approach pitch control. Preserve vehicle state and continuous control response; never teleport onto an approach rail. Blend RCS/aerodynamic authority with the flight regime.
- **Glide:** player controls pitch and bank to align with the runway and manage speed/descent, then flies preflare/flare, commands gear deployment and steers/brakes during rollout. Guidance advises without landing for the player. A simplified manual speed-brake control may dissipate excess energy; label this control allocation as a gameplay simplification. No engine throttle or powered go-around.
- **Teaching and proof:** present short phase-specific bindings/cues with pause/retry. Test correct, no-input and deliberately wrong-input trajectories from identical checkpoints: bank input changes crossrange/energy history, pitch changes glide/sink, and gear/flare affect touchdown outcome. One prescribed reversal count or a completed animation is never a success condition.

## Physics and reference frames

Use SI internally: meters, seconds, kilograms, newtons and radians. Display altitude in km, speed in m/s or km/s as appropriate, angles in degrees. Every telemetry value must carry a unit and a named reference frame. Separate inertial velocity, air-relative velocity and runway-relative velocity.

Proposed minimal model:

- Position and velocity in an Earth-centered inertial frame: X/Y in the equatorial plane, Z north; Earth-fixed longitude rotates relative to it. Maintain an explicit transform for launch/landing sites.
- Keep existing mesh coordinates (+Z nose, +Y dorsal, +X right) in the visual adapter. They are game/model conventions, not NASA's vehicle-axis nomenclature. Render ECI vectors into Three.js using a documented right-handed mapping such as `(x,z,-y)`, camera-relative origin, and consistent scale. Do not integrate on the small decorative Earth sphere.
- Use central gravity and thrust/mass depletion for ascent/orbit; a simple atmosphere and lift/drag model for entry/glide. Preserve mass/velocity across stage separation and release. Model SSME supply from ET separately from OMS/RCS resources; ordinary thrust must not reappear after ET separation.
- A commanded-rate/attitude controller is acceptable instead of full rigid-body inertia. Mark assistance explicitly. Coast attitude hold may use idealized RCS authority, but no hidden frame-based drag should stop translation in vacuum.
- Use a fixed simulation step (proposed 1/60 s) with an accumulator and rendering interpolation. Bound catch-up work; pause/report a long suspension rather than integrating one huge step or silently dropping elapsed mission time. Separate simulation time, real elapsed time, and cinematics.
- Initially allow only modest time acceleration in safe coasts; disable it for burns, release, entry and landing. Substep or use a validated coast propagator. Event guards must fire exactly once across time-warp boundaries.

For orbit validation, derive specific energy `epsilon = |v|²/2 - mu/|r|`, angular momentum `h = r × v`, eccentricity and apsides from the same state. Bound motion requires negative energy, but also a perigee safely above the atmosphere and the scenario's limits. A vertical ascent to 400 km with inadequate tangential velocity fails this test. With illustrative Earth constants `mu = 3.986004418e14 m³/s²`, `R = 6.371e6 m`, a circular orbit at 408 km needs approximately 7.67 km/s; this is a model calculation, not a mission-specific NASA target.

Do not fix 120° of roll as a universal Shuttle maneuver. Derive automatic ascent guidance from launch pad orientation, ascent heading and selected orbit; document attitude order and signs. Validate with orientation markers and ground-track plots. All nominal powered ascent, including staging, is automatic while the player monitors.

Entry bank tilts the lift vector relative to the trajectory and changes vertical lift, crossrange and drag history. Reversals manage lateral error while maintaining energy guidance. They are not flat left/right zigzags or yaw-only turns. Use angle of attack relative to air velocity, not world-horizon pitch. A simplified heating/load envelope is acceptable if identified as a gameplay approximation and responsive to actual trajectory.

Landing is a glider problem: pitch trades speed and flight path; bank changes lift direction; speed brake dissipates energy. No powered go-around. Use simple runway/ground collision proxies and wheel contact points. In normal flight, gear deployment is one-way; the supplied retract animation may remain in the art inspector.

## Failure, checkpoints and input

Provide actionable explanations: measured quantity, allowed envelope, likely corrective action, and nearest useful checkpoint. Examples: “Perigee intersects the atmosphere — add horizontal velocity near apoapsis”; “Too low on energy to reach the runway”; “Touchdown sink rate exceeded the limit.” Do not diagnose a failure from a decorative animation.

Proposed checkpoints: pad ready, verified stable orbit before payload, payload complete before deorbit, safe entry start, and terminal approach. Store versioned complete simulation state, mission phase/objective flags, stage configuration, propellant, control mode, clock and any randomized scenario seed. Restore from clean state; reconstruct visual actors and clear timers/listeners. Retry never keeps a released payload twice or counts an objective twice. Later releases may persist checkpoint data locally; cross-session save compatibility must be explicit.

Input goes to exactly one active mode. Suppress gameplay keys when typing or when a modal owns focus; clear held controls on blur, disconnect and touch cancel. Expose current bindings and assist state in the minimal HUD. Training skip cannot share the semantic command used for docking capture, deployment success or landing completion.

## State-to-UI interface

Suggested new modules are proposals, not existing files:

- `public/js/game/shuttle_mission.js`: phase guards, commands, objectives, checkpoints and result.
- `public/js/game/shuttle_simulation.js`: deterministic state update, environment and derived flight quantities; no DOM, camera or asset dependency.
- `public/js/world/shuttle_view.js`: maps state/events to existing models, effects and cameras.
- `public/js/game/shuttle_hud.js`: minimal displays and command buttons; later GUI can replace this adapter.

Expose a read-only `MissionSnapshot` containing `schemaVersion`, `missionId`, `revision`, `mode`, `phase`, `simTime`, vehicle state, stage/resources, derived telemetry, objective status, guidance, allowed commands, failure/result and checkpoint availability. Define telemetry names such as `altitudeM`, `inertialSpeedMps`, `airspeedMps`, `periapsisAltitudeM`, `bankRad`, `angleOfAttackRad` and `runwayCrossTrackM`; avoid ambiguous `speed` or `altitude` fields.

UI sends semantic commands (`START`, `SET_CONTROL_INPUT`, `AUTHORIZE_BURN`, `OPEN_BAY`, `RELEASE_PAYLOAD`, `DEPLOY_GEAR`, `RETRY_CHECKPOINT`, `PAUSE`, `EXIT`). The mission layer validates them and returns accepted/rejected plus reason. Renderer emits no mission success. Discrete events (`STAGE_SEPARATED`, `PAYLOAD_RELEASED`, `PHASE_CHANGED`, `FAILED`, `LANDED`) have unique IDs so audio/animation plays once. A future shared-flight server validates command ownership and broadcasts versioned snapshots; avatar networking is not authoritative vehicle state.

## Later ISS objective

Add only after the first mission loop is stable and the user approves it. Carry ISS and orbiter state vectors through plane/phase matching, transfer, braking and proximity approach. Time compression may shorten waits while preserving orbital consequences. Final docking needs orbiter ODS and station-port transforms, relative translational/angular velocity, full orientation including roll, a signed approach corridor, hold points, collision/abort and undocking. Preserve the current simulator as a clearly labelled practice activity until these are implemented. Match the station/adapter to the selected historical era.

## Historical grounding

Primary NASA sources were opened during the audit. These facts constrain the design; proposed pacing, thresholds, assists and training fixtures are game choices, not historical claims.

| Topic | Verified fact / limit | Primary source |
|---|---|---|
| Propulsion and staging | SRBs supplement the three main engines for roughly the first two minutes; main-engine powered ascent is about 8.5 minutes; ET supplies main-engine propellants and is discarded | [NASA: The Space Shuttle](https://www.nasa.gov/reference/the-space-shuttle/) |
| Guidance and controls | First-stage ascent followed a pitch/yaw/roll schedule; ET separation normally followed MECO automatically. OMS burns served major orbital maneuvers. Entry control blends RCS into aerodynamic surfaces; gear deployment in flight was one-way and manual | [NASA/JSC spacecraft piloting report, pp. 20–21](https://ntrs.nasa.gov/api/citations/20220005666/downloads/SC_design_for_man_cntl_2.pdf) |
| Orbital crew duties | STS-7 crew opened the bay to expose radiators, deployed satellites, operated the robotic arm and conducted experiments. These support possible task types, not a requirement to implement them all | [NASA: STS-7 and the flight of Sally Ride](https://www.nasa.gov/history/40-years-ago-sts-7-and-the-flight-of-sally-ride/) |
| Insertion and docking | OMS-2 commonly circularized the initial orbit. Rendezvous involved phasing, height/plane corrections, terminal intercept and braking. STS-110 approached with cargo bay facing the station and aligned the actual docking mechanisms | [NASA STS-110 press kit, printed pp. 16–18 and 70](https://www.nasa.gov/wp-content/uploads/2023/05/spk-110-press-kit.pdf) |
| Orbit and rendezvous | Orbital motion and differing orbital periods govern catching a target; simply pointing and firing toward it is insufficient | [NASA STS-71: Rendezvous & Docking](https://www.nasa.gov/history/SP-4225/sts71/sts-71.htm) |
| Deorbit / attitude | STS-6 used an OMS retrograde maneuver, then turned nose-forward to about 40° nose-up for atmospheric entry | [NASA history of Challenger's first flight](https://www.nasa.gov/history/40-years-ago-first-flight-of-space-shuttle-challenger/) |
| Entry bank | NASA entry-guidance work explicitly studies bank schedules, crossrange and drag-acceleration control. Use these coupled quantities, not lateral zigzag animation | [NASA-CR-151480 abstract](https://ntrs.nasa.gov/citations/19770022264) |
| Unpowered return | Shuttle landing is a gliding approach with aerodynamic controls, flare and rollout | [NASA: Aeronautics of the Space Shuttle](https://www.nasa.gov/centers-and-facilities/langley/the-aeronautics-of-the-space-shuttle/) |
| Adapter chronology | IDA-2 installation at PMA-2 occurred on 19 August 2016. The existing “Shuttle PMA-2 / IDA-2” label mixes eras with a Shuttle flight | [NASA ISS daily report, 19 August 2016](https://www.nasa.gov/blogs/stationreport/2016/08/19/iss-daily-summary-report-08-19-2016/) |

Caveats: NASA's general aeronautics article mentions about 30° at entry, while the STS-6 account gives about 40°; do not turn either overview into a constant for the entire trajectory. Implement a phase-dependent schedule only after selecting/validating a reference profile. The 1977 bank study is design evidence, not a universal operational limit. Exact ascent roll, MECO targets, aero coefficients, heating/failure thresholds, winds, runway coordinates and selected mission payload history remain to be verified/tuned. Avoid advertising a precise historical replica until that work is done.

## CubeSat contact coverage mission — DRAFT 2026-11-14

**Superseded the same day by the two-mode plan in [cubesat-coverage-plan.md](cubesat-coverage-plan.md).** That file holds the full specification: player journey, input and output tables, contact/orbit/time/frame model, data sources, architecture, milestones, tests, decisions and the implementation prompt. The earlier single-mode draft that was here is in git history. Its content was carried into the new plan.

Confirmed scope (user, 2026-11-14):
- Two modes: **Sandbox** (hypothetical circular orbit and an editable station network) and **Real Satellite** (published CelesTrak GP/OMM data propagated with an established SGP4 implementation, plus catalog station locations).
- Coverage questions: which and how many stations are available at position X; what is retained, lost or gained at a later Y; which stations come next, when and for how long; coverage gaps; revolution period and the next return to a chosen orbital position; how results change when the scenario changes.
- Starts directly in orbit. No Shuttle launch or mission required.
- "Contact available" means geometric access above the station's minimum elevation, assuming compatible radios and an adequate link budget. It is always distinguished from a scheduled or successful radio connection.
- Excluded: RF/link-budget engineering, station booking, downlink operations, spacecraft subsystems, constellations.
- Earth rotates continuously. Nothing resets after a revolution. Identical repetition only through an explicit replay from start.

Recommended defaults (sandbox 550 km / 51.6°, 10° masks, 24 h window, 60× playback, minimal shared session with host-owned edits, and others) are marked [REC] in the plan. Items needing a user decision are D1–D6 in the plan's §10.

## Artemis lunar expedition — DRAFT 2026-11-14

### Scope and evidence boundary

**User request:** add an entire realistically grounded Artemis Moon-landing mission. **This deliverable is a plan, not implementation.** Preserve Shuttle and the two-mode CubeSat plan. Interpret "entire mission" as the astronaut expedition from Earth launch through lunar landing, surface work and safe Earth return. Prerequisite uncrewed logistics are represented in the briefing/readiness state; flying every support launch is outside this first expedition.

Artemis is a program, not one identical flight. As of this research date, NASA's November update describes Artemis III as a 2027 Earth-orbit demonstration and Artemis IV as the first landing, targeted for 2028 [A1]. These are plans, not completed landing history. Do not reuse a 2023 Artemis III graphic as the current flight sequence.

NASA's October architecture update replaces the common NRHO rendezvous with provider-specific approaches: Starship meets Orion in Earth orbit and propels the joined vehicles to low lunar orbit; Blue Moon uses transfer stages to preposition the lander in elliptical polar lunar orbit, where it meets Orion. The first landing provider is not assigned [A2]. Thus a Gateway stop, NRHO, depot refueling and lunar-only rendezvous cannot all be silently combined into one current mission.

**Recommended first scenario:** "Artemis Lunar Expedition — Blue Moon concept training scenario, NASA architecture snapshot October/November 2026." Choose this one route because it supports a clear crew journey, lunar rendezvous and separate surface sortie without making Earth-orbit propellant logistics a second playable campaign. This is a proposed game scope, not a statement that NASA chose Blue Origin. A Starship route is an alternative future scenario with a different rendezvous/transfer sequence, not a visual skin. Freeze the architecture before implementation; recheck NASA updates first.

Public information does not specify every future vehicle mass, throttle limit, orbit, burn, landing coordinate or cockpit procedure. Tag configuration values **published reference**, **derived from a stated model**, or **training assumption**, with source/version. Promise a physically credible educational simulation; do not advertise an exact flown Artemis IV reconstruction. A realistic concept can be implemented now, but operational-level accuracy requires flight-design and vehicle data not established by these sources.

### Vehicles and mission structure

- SLS: Earth launch vehicle. Use a verified configuration for the chosen concept; the upper-stage choice remains under consideration in the November update [A1]. Do not model it as a Shuttle orbiter/ET stack.
- Orion crew module and European Service Module: crew transport, spacecraft support/propulsion, and Earth-return capsule. Orion does not land on the Moon [A3, A4].
- Human Landing System: a separate lunar descent/ascent vehicle, with its own fuel, propulsion, docking geometry and cabin. Do not assume an Apollo-style discarded descent stage unless the chosen lander actually uses one.
- Four crew in transit, with two assigned to the surface sortie and two remaining with Orion in lunar orbit [A3]. Recommended game duty assignments below are abstractions, not NASA's final crew procedures.
- One selected south-polar training site, one coherent outbound/return opportunity, one lander architecture, and two short EVA task sequences. No base construction, rover campaign, Gateway assembly or fully simulated tanker program in this delivery.

### Complete player sequence and phase guards

The following is the recommended training implementation, not a published flight timeline. Exact burn/entry profiles must be validated in milestone A0. Automation acts on simulated state; cinematic time alone cannot certify orbit, docking, touchdown or mission success.

| Phase | Player activity and automation | Required state to proceed |
|---|---|---|
| 1. Readiness and briefing | Review Earth departure, lunar site, crew duties and return plan; confirm prepositioned lander readiness. Choose assists; crew gives GO | Valid scenario/ephemeris window, vehicle configuration, resources and return opportunity; no fabricated "real launch date" |
| 2. Launch from KSC | Automatic SLS attitude/throttle/staging; crew monitors and authorizes launch. Free-look remains available | Actual ascent state and valid stage order; upper-stage/Orion configuration matches scenario; failed launch gives explanation/retry |
| 3. Earth-orbit checkout | Verify orbit, power and guidance; confirm lunar departure readiness | Bound orbit and transfer readiness with margin; reaching an altitude is insufficient |
| 4. Trans-lunar injection and separation | Review target/burn, authorize guided injection; verify residual error, Orion deployment and solar-array configuration in the correct selected sequence | Predicted lunar encounter within the scenario corridor, valid propellant/stage state; no straight-line flight toward the Moon |
| 5. Outbound cruise | Attitude/spacecraft checks, navigation observation and guided correction-burn decisions; accelerated quiet coasts | Measured trajectory and arrival corridor valid; correction consumes propellant and changes arrival |
| 6. Lunar arrival and capture | Authorize the planned capture sequence into the chosen elliptical polar rendezvous orbit; monitor closest approach and fuel | Valid lunar-relative state, terrain clearance and reachable lander orbit. Proximity to the Moon alone is not capture |
| 7. Rendezvous and docking | Guidance handles phasing/transfer; player flies final RCS approach through hold points, aligns docking ports and controls closing speed | Relative position, velocity, alignment including roll, and angular rates within documented capture limits; collision/abort possible |
| 8. Transfer and landing preparation | Two crew transfer after seal/pressure checks; verify suits, descent/ascent reserve and surface lighting; undock | Correct crew inventory in each vehicle, hatches/pressure safe, descent and return plan feasible |
| 9. Powered descent and landing | Authorize guided deorbit/braking. Player selects a reachable safe patch and flies final descent with rate/attitude assistance, managing lateral motion, vertical speed and throttle | Actual landing-foot contacts, terrain slope/clearance, attitude, vertical/horizontal speeds and fuel within vehicle envelope; no altitude-only touchdown |
| 10. Surface checkout and EVA | Confirm stable landing and systems; configure cabin/suits and egress. Survey, photograph, collect/document samples and deploy/check a small experiment | Suit/cabin interlocks, time/resource reserve and reachable route; samples linked to location/evidence; return and repressurize safely |
| 11. Surface completion and ascent | Perform a second bounded EVA task sequence if resources permit; stow samples, secure crew, authorize guided ascent at the proper opportunity | Crew aboard, hatch sealed, cargo secured, adequate ascent/rendezvous reserve; launch reaches a viable intercept orbit |
| 12. Lunar rendezvous and crew reunion | Guided phasing followed by active final docking; return crew and samples to Orion; check cabin and propulsion | Four crew and required samples accounted for; no transfer through undocked/open-vacuum cabins; lander separation/disposition follows scenario |
| 13. Departure from the Moon | Review/authorize return burn and course corrections; monitor Earth entry prediction | Earth-entry corridor and return reserves valid. Do not assume the outbound path simply reverses |
| 14. Orion entry and splashdown | Prepare crew module, separate service module at the planned event, guided heat-shield entry and parachute sequence; player monitors/configures, with a documented assisted entry control task only if justified | Entry/load/thermal envelope, valid separation and parachute deployment conditions, acceptable ocean-contact state |
| 15. Recovery and debrief | Verify crew condition/recovery beacon and review science, fuel, control assistance and retries | Crew safely returned; success is distinct from landing on the Moon, abort-return, failed sortie or practice completion |

Moon descent has effectively no aerodynamic braking, lift, parachutes or airplane glide; thrust cancels descent and horizontal velocity. Near-surface lunar gravity is about 1.62 m/s², varying with position in the model. Orion returns by atmospheric capsule entry and ocean splashdown, not a Shuttle runway approach. The documented Orion entry sequence is a reference, not a license to copy Artemis I/II's exact timings or assume an identical Artemis IV skip profile [A4].

### Player controls, crew duties and useful work

Recommend automatic nominal launch, guided major burns and guided early descent/ascent. Player agency concentrates on GO/no-GO decisions, attitude acquisition, final RCS docking, reachable landing-site selection, final landing and EVA. These are game control allocations; verify actual vehicle manual-control capability before labelling them NASA procedures. No compulsory full switch-by-switch cockpit reproduction.

For final landing provide attitude/rate hold, throttle or commanded descent-rate assist, horizontal-velocity cues, radar height above actual terrain, fuel/reserve, predicted touchdown point and an abort cue. Manual inputs must affect fuel, trajectory and landing outcome. Assistance may stabilize the vehicle; it must not silently win after missing/wrong pilot input. Abort is only offered where a simulated safe ascent/rejoin remains feasible; otherwise explain failure and offer retry.

For four-player co-op, recommend a surface pilot and surface science/operations partner, plus Orion navigation and spacecraft/surface-support operators. During EVA the orbit crew can check the next rendezvous opportunity, review transmitted imagery/sample records and prepare return/navigation; task acknowledgement alone must not create physical success. Duty reassignment and solo coverage are supported, but avatars/crew cannot teleport between vehicles. All four launch and return together; only the assigned two descend. These duties are not claims of continuous live links: show occultation/delay for flight telemetry if modeled. Social player voice may remain immediate, clearly separate from simulated mission communications.

Two EVA sequences: (1) survey/photograph a nearby geology station and collect a documented sample; (2) place/check a simple training instrument and collect a contrasting sample. Use a bounded walkable patch, reduced lunar gravity, low-angle sunlight, slope hazards and meaningful oxygen/battery/return margins. Label instrument selection and small unresolved rocks as training content. NASA's current source describes initial short moonwalks [A2]; do not force real multi-hour EVA waits or claim the game tasks are the final flight manifest. No requirement to enter permanently shadowed craters.

Coasts and rest periods can be accelerated through integrated/predicted safe intervals; display mission elapsed time separately from play time. Slow to normal speed before burns, docking, descent, EVA hazards, entry and abort decisions. Pause/retry restores all vehicles, crew, resources and science state consistently. Proposed session pacing is 60–90 active minutes across resumable chapters; test with humans, do not distort orbital telemetry to force that duration.

### Accuracy requirements and permitted approximations

1. **Dynamics:** one documented inertial frame with ephemeris-driven Earth/Moon positions, correct frame-origin acceleration where necessary, propulsion/mass depletion and numerically validated Earth–Moon transfer/capture/return. Include solar perturbations if error analysis over the chosen time span requires them. The current Earth-only Kepler propagation may support isolated reference cases or initial guesses; it cannot certify a lunar expedition. An NRHO must not be implemented as an ordinary two-body ellipse if a later scenario introduces one.
2. **Continuity:** transform both position and velocity at the same epoch when switching body-relative displays/local terrain frames. Keep meter/second simulation state separate from kilometer-scaled distant rendering and floating origins. No teleport at capture, landing, ascent or docking.
3. **Vehicle feasibility:** freeze sourced or explicit assumed dry/wet masses, thrust/throttle range, Isp, propellant and reserve rules; demonstrate a coherent delta-v/resource budget for the full sortie. Propellant is vehicle-specific and finite; do not invent transfer capability or refill fuel at a phase change. Model docked combined mass and proper separation impulses. Validate thrust can support the selected landing/ascent masses.
4. **Moon surface:** use one modest LRO/LOLA terrain patch and consistent collision geometry. Document projection, vertical definition, body-fixed frame and pixel resolution. Correct south-pole Sun/Earth directions for the selected epoch; shadowed terrain does not get arbitrary daylight. DEM pixels do not certify individual rocks/footpads: small obstacles and safe zones remain labelled training geometry unless supported by higher-resolution data.
5. **Environment and visibility:** no wind/atmospheric drag on the Moon; geometric Earth/Moon occultation; actual local terrain heights/slopes and resource limits. Simple dust visuals, thermal warnings and suit budgets are acceptable disclosed approximations. No CFD, dust erosion, complete avionics/hydraulics or full life-support chemistry required.
6. **Time and data:** scenario manifest records UTC epoch, dynamical-time conversion, ephemeris/frame/kernel versions, terrain product, vehicle assumptions and model revision. Bundle bounded reproducible data for offline play; no live service call every frame. Planet ephemerides do not supply the future crew's flight trajectory: design and validate that trajectory separately. Do not use TLE/SGP4 as the Artemis interplanetary/cislunar propagator.
7. **Guidance and learning:** phase-specific controls, units, target/current values and correction cues; distinguish commanded/estimated from measured state. Failures name the actual cause and nearest useful checkpoint. Practice presets cannot award a full expedition result.

### Checkpoints and failure coverage

Checkpoints: pad readiness, verified Earth orbit, post-injection cruise, safe lunar rendezvous orbit, docked lander, pre-descent, landed/pre-EVA, pre-ascent, reunited in Orion, and Earth-entry preparation. Save all vessel states, crew ownership/location, dock/hatch/pressure states, consumables, sample inventory, epoch, mission flags and pending events. Restore creates no duplicate vehicles, samples or payouts. Reject incompatible/corrupt saves with an actionable message.

Required failures/recoveries: missed burn/arrival corridor; excessive docking closure/roll misalignment; rejected unsafe undock/crew transfer; bad touchdown slope or speed; landing fuel reserve violated; unsafe EVA egress or inadequate return reserve; premature ascent/missed rendezvous; invalid service-module/parachute sequence; failed entry/splashdown. Demonstrate at least one modeled safe abort-return outcome distinct from full science success; unsupported emergencies can end in explained failure and checkpoint retry rather than an invented universal rescue.

### NASA/JPL resources and provenance

| ID | Primary source, accessed 2026-11-14 | Use and boundary |
|---|---|---|
| A1 | [NASA architecture update, 2026-11-04](https://www.nasa.gov/missions/artemis/nasa-shares-plans-to-accelerate-artemis-return-to-moon/) | Current mission numbering, target dates and upper-stage uncertainty; future plan, not flight evidence |
| A2 | [NASA lander concepts, updated 2026-10-26](https://www.nasa.gov/missions/artemis/nasa-partners-accelerate-lander-development-for-2028-moon-missions/) | Provider-specific rendezvous/transfer concepts and unresolved selection; supersedes older shared NRHO plans |
| A3 | [NASA Artemis IV overview](https://www.nasa.gov/mission/artemis-iv/) | Crew split, surface science and lunar return; use dated detailed A1/A2 where broad overview wording lags |
| A4 | [NASA Artemis II press kit](https://www.nasa.gov/artemis-ii-press-kit/) | Orion operations, separation/entry/parachutes reference; do not copy the flyby trajectory into a landing mission |
| A5 | [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) and [NAIF SPICE](https://naif.jpl.nasa.gov/) | Earth/Moon/Sun ephemerides and orientation/time tools; select a bounded dataset and consistent frame convention |
| A6 | [NASA Goddard south-pole LOLA DEMs](https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/) | Local elevation/slope and uncertainty products; consult product README before conversion |
| A7 | [NASA lunar south-pole environment](https://www.nasa.gov/reference/moonbase-environment/) | Polar illumination and terrain constraints |

Unresolved before implementation: user selection of the recommended provider concept (or Starship alternative), availability/approval of appropriate vehicle assets, and a validated numerical scenario budget. Resolve routine HUD/control choices in implementation. Do not require a complete proprietary NASA flight plan; explicitly retain training labels for unavailable facts. No Artemis code or data downloads were performed during this planning pass.
