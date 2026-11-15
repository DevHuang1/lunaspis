# CubeSat mode: ISS deployment phase (J-SSOD from Kibo)

User request (2026-11-15): CubeSat mode used to start with the CubeSat already in orbit. Add a playable launch of the CubeSat from the ISS before the coverage phase, matching how CubeSats are actually deployed from the ISS.

**Verified in Node and Chrome on 2026-11-15.** Solo deployment reaches coverage planning, and two-player console ownership and host skip pass. Off switch `COVERAGE_DEPLOY=0`. Evidence and remaining verification limits are in [progress.md](progress.md).

## The real procedure the gameplay follows

Sources: JAXA J-SSOD pages (iss.jaxa.jp/en/kiboexp/jssod, humans-in-space.jaxa.jp J-SSOD facility page), JAXA/UNOOSA KiboCUBE J-SSOD overview slides, the NanoRacks NRCSD mission flow and cut sheet.

1. The crew installs the satellite install case (CubeSat inside) in the J-SSOD, mounts the J-SSOD on the Multi-Purpose Experiment Platform (MPEP), and mounts the MPEP on the JEM airlock slide table.
2. The JEM airlock is depressurised, the outer hatch opened and the slide table extended outboard.
3. The JEM robotic arm (JEMRMS, flown from JAXA Tsukuba) grapples the MPEP and moves it to the release point.
4. The deployer points **nadir-aft 45°** (away from the ISS's direction of travel and toward the Earth, in the ISS body frame).
5. The deploy command is sent from the ground. A spring pushes the CubeSat out at **0.77–1.7 m/s** depending on mass. Tip-off is ≤ 5°/s per axis (NRCSD). The game's nominal release samples ±0.1°/s per axis so the tumble stays readable at 60× warp.
6. The CubeSat must stay silent for **30 minutes** (CubeSat Design Specification inhibit), then deploys its antennas and starts beaconing.
7. The CubeSat's ballistic coefficient must be ≤ 120 kg/m² so it sinks faster than the ISS and never comes back to it.

## Gameplay (phases in `deploy_core.js`)

| Phase | Console | What the player does |
|---|---|---|
| brief | flight | Briefing, BEGIN |
| load | crew | 5-step checklist: install case → verify door latched / deployment switches held (inhibits) → J-SSOD on MPEP → MPEP on slide table → close inner hatch. Timed steps (compressed). |
| depress | crew | Depress pump (recovers air down to ~2 kPa), then vent valve to vacuum. Venting above 10 kPa wastes air and is recorded as a violation. Leak check: pump off + vent closed for 120 s, rise ≤ 0.1 kPa. Then OUTER HATCH (needs leak check passed and p ≤ 0.5 kPa). |
| outboard | crew | Hatch opens (20 s), SLIDE TABLE extends (40 s). |
| grapple | rms | Fly the end effector onto the MPEP grapple fixture from the EE camera (rate control, coarse 5 cm/s / vernier 1 cm/s, roll). Capture envelope: ≤ 3.5 cm off-centre, ≤ 10 cm above, roll ≤ 3°, speed ≤ 2 cm/s. Hitting the fixture logs a contact. |
| move | rms | MOVE: pre-planned arm trajectory to the release point (90 s). |
| point | rms / crew / flight | JEMRMS slews the deployer (starts pointing port = cross-track). Live prediction of the CubeSat's path. JEMRMS applies brakes; GO/NO-GO poll: JEMRMS (brakes on, ≤ 5° from planned nadir-aft 45°), crew (camera at the Kibo window), flight (prediction safe + Ku-band AOS). Flight ARMs and sends DEPLOY (2 s uplink; lost if in LOS). |
| release | — | Door opens, spring push over 0.4 m. |
| drift | — | CubeSat free-flies (time warp up to ×60). At T+30 min antennas deploy and the first beacon is heard. |
| done | host | HANDOFF: the coverage scenario becomes a Sandbox circular orbit computed from the CubeSat's actual release state (≈ 413.8 km, 51.64°), and the coverage phase starts. |

Time warp: ×60 in load/depress/drift, ×10 in outboard/move, real time while flying the arm, pointing or armed.

Roles: 1 player holds every console. 2 players: host = JEMRMS + flight, guest = crew. 3+: host JEMRMS, 2nd crew, 3rd flight, others watch.

## Physics

- ISS: circular 415 km, 51.64°; start phase chosen in daylight outside the LOS bands.
- Relative motion: Clohessy–Wiltshire (RK4) in the model frame (X cross-track = port, Y radial = zenith, Z along-track = velocity) plus differential drag (ρ = 3e-12 kg/m³, Cd 2.2, CubeSat 4 kg / 0.06 m², ISS 420 t / 1800 m²).
- Safety check (14 days): must leave the ISS Approach Ellipsoid (4 × 2 × 2 km) and never re-enter it; once it has left the ±25 km conjunction screening box along-track it must not come back into ±2 km radial / ±25 km.
- Line of fire: ray from the J-SSOD door vs padded bounding boxes of every part of the team's ISS GLB (arm excluded).
- Results at 0.98 m/s, verified by `tests/coverage/deploy_checks.js`. Nadir-aft 45° is safe and clear. Pure retrograde is orbitally safe but blocked by the P1 radiator. Port/starboard is blocked by station structure and returns into the approach zone after about 5.1 h with the model's initial offset and differential drag. Nadir or zenith returns after about 1.2 h. Posigrade returns after about 10.8 days. Zenith-aft 45° is blocked by the P1 truss.
- Handoff orbit: two-body elements from the release state (ISS state + door offset + spring Δv + ω×r), circularised (e ≈ 0.0002 dropped), propagated to the minute after T+30 min.
- Post-release trajectory display uses an Earth-centred Kepler orbit with inherited ISS velocity and a near-camera arc through the CubeSat. The pointing console's prediction remains ISS-relative. Attitude uses an accumulated rotation vector and quaternion rendering.

## Model frame facts (team GLB `models/iss/ISS_stationary_opt.glb`, metres)

+Z = velocity (Harmony / PMA-2 forward), +Y = zenith (Z1 truss), +X = port (Kibo, Tranquility), -Y = nadir (Leonardo). Kibo PM spans x 2.1–13.5 at z ≈ 16.2; Exposed Facility x 13.5–21, y −4 to −0.6. The GLB's own JEMRMS nodes are named `31 Robotic Arm…` (hide them and draw the IK arm). Geometry used: JEMRMS shoulder (13.2, 1.6, 17.6), booms 4.07 m each, wrist+EE 1.5 m; airlock hatch (13.5, 0.9, 15.0); MPEP on table x 12.7 → 14.6; release fixture (16.8, 0.4, 13.2).

## Files

- `public/js/coverage/deploy_core.js` — NEW, DOM-free simulation (works in Node and browser). Exports `DeployCore` (`create`, `predict`, `lineOfFire`, `assess`, `pose`, `frame`, `handoffOrbit`, …).
- `server/coverage_room.js` — `createCoverageState(hostId, scenario, { deploy: true })` adds `cov.deploy`; requests `DEPLOY` {cmd, arg} and `DEPLOY_INPUT` {input}; `tickDeploy`, `deploySnapshot`, `deployRoles`, `finishDeploy`. While deploying, SET_SCENARIO/SET_PINS/CLOCK are refused. `SKIP` (host) keeps the old behaviour.
- `server.js` — ticks the deployment in the 30 Hz loop, broadcasts `deploy_state` at 10 Hz (assessment only when it changes), passes `{ deploy: true }` when the coverage session starts.
- `public/js/core/network.js` — `deploy_state` channel (`netManager.deployState`).
- Browser-verified `public/js/coverage/deploy_view.js` provides the ISS scene, deployment hardware, IK arm, CubeSat, Earth and cameras. `deploy_hud.js` provides compact STS_OS labels, the EE overlay, pointing plot, GO poll and three-entry log, with ink-white success text. `deploy_game.js` sends console commands and controller input. `coverage_game.js` transitions after HANDOFF/SKIP, with host auto-skip in `?coveragetest=1`. Script tags are in `index.html` after `coverage_core.js`.

## Status / handover

See the latest entry in [progress.md](progress.md).
