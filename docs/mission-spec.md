# Shuttle mission specification

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

### Purpose and boundaries

User-requested addition: at orbital position X, show how many and which ground stations the satellite can contact; at later position Y, show changed and upcoming contacts; show time to complete a revolution and return to X. Let the user vary inputs and compare results. This is a coverage simulation, not another launch/landing mission. Preserve the current co-op Shuttle implementation. This request authorizes planning only.

Recommend one CubeSat in a configurable circular LEO, a rotating spherical Earth and a configurable list of hypothetical ground stations. Start directly in orbit. Optional later import of a Shuttle deployment state must preserve its actual position/velocity; do not require a Shuttle playthrough to use coverage mode. Station markers at real cities are hypothetical sites, not claims of operational antennas or access rights.

First-release "contact available" means geometric access under the stated assumptions: Earth does not obstruct the line of sight, station elevation exceeds its mask, and the station is enabled. Assume compatible radios, adequate link budget and antennas capable of tracking across the allowed sky. Display this assumption in the scenario description. Count available stations, not simultaneous working radio sessions. CubeSat size (1U/3U/6U), mass, transmit power, frequency, weather and day/night do not change this geometry-only result; do not offer ineffective controls for them. No radio operations, station booking, RF/link-budget model, data transfers, constellation or detailed spacecraft systems in the first scope.

### Player flow and required outputs

1. Configure orbit and stations; preview the track and choose a prediction horizon. Provide a useful preset and editable station list/map placement.
2. Run, pause, scrub time, or jump to the next access start/end. Show the satellite, rotating Earth, ground track, station markers and valid contact lines. Add a timeline with one row per station; color must not be the only status cue.
3. Mark X and Y on the orbit/timeline. Store orbital phase plus occurrence time/revolution index: X on orbit 1 and X on orbit 2 must be distinguishable. Report UTC and elapsed simulation time, latitude/longitude, altitude, available station names/count, elevation and slant range. Marked positions are observations, not steering commands.
4. At Y, compare against X: contacts retained, newly available and lost. Show future passes ordered by access start, with station, starts-in time, start/end UTC, duration, peak elevation and time of peak. Already active passes belong in "contact now" with time remaining, not as falsely future contacts. Multiple stations may overlap; there need not be one unique "next station".
5. Show orbital period, countdown to the next occurrence of X's orbital phase, and each station's next access separately. Following each revolution, recompute contacts with Earth continuing to rotate. Offer explicit scenario replay from the initial time for identical repetition; do not reset Earth automatically every orbit.
6. Summarize unique stations reached, per-station contact minutes, time with at least one available station, coverage percentage, longest no-contact gap and peak available-station count over the selected interval. Network contact time is the union of intervals, not the sum of overlapping station minutes. Include gaps at the interval start/end.
7. Save the current configuration/results as comparison A, change inputs and run B over the same stated duration. A bounded optional challenge can ask the player to select up to N stations to minimize the longest blackout; this is secondary to answering X/Y/contact timing questions.

Show "no pass within the next 24 hours" (or selected horizon), never "never reachable" from a finite search alone. Mark passes truncated by the start/end of the prediction window; do not present truncated duration/peak as full-pass values.

### Recommended variable inputs

All ranges/defaults below are proposed teaching choices, not user-approved limits or claimed spacecraft specifications.

| Input | Proposed control/default | Effect on results |
|---|---|---|
| Circular altitude | 400–800 km, default 550 km; optional wider validated LEO range later | Changes period, distance and geometric footprint. Higher altitude increases geometric reach but also radio distance; do not imply stronger signals |
| Inclination | 0–180°, presets 0°, 28.5°, 51.6°, 90°, 98°; default 51.6° | Changes north/south track reach and prograde/retrograde motion; station visibility also depends on footprint, not only station latitude |
| Orbit orientation | Longitude of ascending equator crossing at scenario start, −180° to 180°, default 0° | Rotates the ground-track placement relative to stations. At equatorial inclinations the node is undefined: use a documented reference longitude instead |
| Starting position | Phase along circular orbit, 0–360°, default 0° at ascending crossing | Changes where the CubeSat begins and which contacts occur first |
| Start date/time | Explicit UTC epoch | Dates the schedule and station availability if later supported. With orientation defined Earth-relative at this epoch, changing only the date shifts timestamps, not ideal geometric coverage; state this honestly |
| Station positions | Add/move/remove; latitude −90° to 90°, longitude −180° to 180° | Changes current count, pass order, durations, gaps and overlap. Use a geographically spread preset including a nearby/user-chosen site |
| Station enabled | Toggle each site; count derived from enabled list | Explores station-network size and outages without inventing extra RF behavior |
| Minimum elevation | Per-station 0–30° teaching slider, default 10° | Raising it excludes low passes and shortens access windows; explain as angle above that station's local horizon |
| Prediction duration | 1 orbit, 3 orbits, 6 h, 24 h; default 24 h | Changes how far ahead results/statistics are computed, not orbital motion |
| X/Y markers | Timeline selection or orbital phase plus revolution | Changes which positions/times are compared, not the trajectory |
| Playback speed | Pause, 1×, 10×, 60×, 300×; scrubbing | Changes viewing speed only; predicted pass times and coverage must remain identical |

Later precision options, only if needed: station altitude/local horizon mask; station operating windows; elliptical orbit via perigee/apogee and argument of perigee; inertial RAAN/UTC initialization; real element sets with an appropriate propagator. Do not claim a 98° two-body orbit is accurately Sun-synchronous: that requires orbit precession absent from this first model. Transmit power/frequency/antenna gain require a separately specified link-budget extension.

### Contact and repetition model

Use the same simulation time for orbit propagation and Earth rotation, with meters/seconds/radians internally. In Earth-fixed coordinates let satellite position be s, station position g, local-up unit vector u, and line-of-sight vector d = s − g. Slant range is |d|; elevation is asin(clamp(dot(d/|d|, u), −1, 1)). A station is available when enabled, elevation >= its minimum, and the segment from g to s does not pass through Earth. For a surface station on the spherical Earth and a nonnegative mask, the elevation condition already enforces Earth visibility. Handle degenerate input and numeric boundaries explicitly. Do not substitute straight-line distance alone for horizon visibility.

For circular altitude h: a = Earth radius + h; period T = 2π sqrt(a³ / μ). The existing constants R = 6,371 km and μ = 3.986004418e14 m³/s² give about **95.50 min at 550 km**. Earth rotates about **23.94°** during that revolution. Thus return to X in inertial orbital phase is not return over the same Earth longitude or to the same station set. These figures are calculated for the ideal model, not measured satellite ephemerides.

For the circular model, remaining time from current phase φ to X is positiveModulo(φX − φ, 2π) / n, with n = 2π/T. When already at X, "next return" means T, not zero. If X instead denotes a place on Earth, report the next access to a station/region there; exact ground-track repetition is a separate condition and may not occur within the prediction horizon. Do not promise daily or once-per-orbit repetition. Elliptical phase timing, if later added, must use Kepler propagation rather than constant angular speed.

Calculate access intervals independently of animation frames. Find elevation-threshold crossings, refine their times (proposed target: within 1 simulation second), and locate pass maxima. Account for short/grazing passes whose entry and exit fall between coarse samples; a bare coarse sign-change scan can miss them. State numeric tolerances and test them. Scrubbing and speed changes evaluate the same scenario at different times; scenario edits invalidate/recompute affected forecasts and comparison labels.

Simplifications: spherical Earth, central gravity, circular orbit first, no drag/J2/precession/terrain/refraction. Use this for short educational forecasts (up to 24 h initially), not operational station scheduling. Model assumptions must accompany exported/saved results.

### Primary grounding

- [NASA orbit tutorial](https://eol.jsc.nasa.gov/Tools/orbitTutorial.htm): successive tracks shift relative to Earth as it rotates; orbital revolution and ground revisit are different.
- [NASA archived orbital-period explanation](https://cdaweb.gsfc.nasa.gov/pub/documents/archived_websites/pwg.gsfc.nasa.gov/stargaze/Sorbit.htm): Kepler period depends on radius/semi-major axis.
- [ESA ESTRACK guide](https://www.esa.int/nl/articles/about-us/directorates/operations/esa-ground-stations/estrack-now-the-guide): contact/pass describes visibility above a station's horizon. The per-station minimum-elevation mask and adequate-radio assumptions above define this game's stricter access rule.
