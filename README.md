# 🚀 Interfellas — Lunaspis Orbital Transit & NASA ISS 3D Simulator

**Interfellas** is a real-time 6-player cooperative 3D space simulator built with **vanilla Three.js**, **Express**, **Socket.IO**, **WebRTC all-crew voice**, and **Web Audio API**. Fully optimized for both **desktop** and **mobile/tablet** viewports and ready for instant deployment on **Railway**.

## 📁 Project Structure

```text
Interfellas/
├── server.js                      # Express + Socket.IO authoritative multiplayer server entrypoint
├── server/                        # Backend services
│   ├── db.js                      # PostgreSQL / local JSON persistence (users, rooms, tasks, chat)
│   ├── storage.js                 # Zero-dependency S3 / Railway Object Storage client
│   ├── voice-signaling.js         # Always-on crew voice relay signaling
│   └── video-signaling.js         # SDP/ICE relay for the crew video link
├── scripts/
│   └── sync_bucket.js             # CLI utility to sync 3D .glb assets to Railway Object Storage
├── design-reference/
│   └── spacecenter2-godot/        # Original Godot LC-39A source (reference only, not deployed)
├── public/                        # Static frontend (Vanilla Three.js — no Next.js)
│   ├── index.html                 # Main application shell & responsive HUD overlays
│   ├── css/
│   │   └── style.css              # Desktop + mobile responsive styles & touch thumbstick UI
│   ├── basis/                     # Basis Universal / KTX2 GPU texture transcoder (JS + WASM)
│   ├── draco/                     # Google Draco 3D mesh decompression workers (JS + WASM)
│   ├── models/                    # Primary SpaceShip (Lunaspis) 3D GLB assets
│   │   ├── astronaut/             # astronaut_lod0.glb (2K KTX2) & astronaut_lod1.glb (1K KTX2)
│   │   ├── crew/                  # crew_a.glb & crew_b.glb — rigged humans in NASA-blue jerseys
│   │   └── iss/                   # ISS exterior/showcase GLBs
│   ├── assets/                    # Fleet spacecraft, launch stack, xEMU suits & Solar System .glb models
│   ├── textures/
│   │   └── earth/                 # 4K Earth day/night, clouds, normal & specular maps
│   └── js/
│       ├── loaders/               # Three.js binary asset decoders
│       │   ├── DRACOLoader.js
│       │   ├── KTX2Loader.js
│       │   ├── meshopt_decoder.js
│       │   ├── GLTFLoader.js
│       │   └── SkeletonUtils.js
│       ├── core/                  # Core engine subsystems
│       │   ├── glb_manager.js     # GLB/KTX2/Draco/Meshopt loader, astronaut rig & 3D Hangar Studio
│       │   ├── network.js         # Socket.IO client state sync & snapshot interpolation
│       │   ├── voice.js           # Always-on all-crew voice relay
│       │   ├── video_link.js      # Earth Control ↔ Flight Crew WebRTC video link & 3D flight-deck view
│       │   ├── audio_synth.js     # Procedural Web Audio synthesizer & Quindar radio tones
│       │   └── cinematic_pass.js  # ACES Filmic post-processing shader pass
│       ├── world/                 # 3D scenes & interactive environments
│       │   ├── ship_interior.js   # Constructed ISS interior, mission stations, crew map & Lunar scene
│       │   ├── station_modules.js # 27-part interactive NASA ISS 3D reference showcase
│       │   ├── mission_viz.js     # Interactive 3D NASA Mission Viz & GMAT trajectory theater
│       │   ├── vr_mode.js         # WebXR ("immersive-vr") + desktop/mobile Side-by-Side Stereo VR mode
│       │   ├── photorealistic_earth.js # Custom GLSL atmospheric & day/night Earth shader
│       │   ├── space_center.js    # Kennedy Space Center LC-39A scene & VAB/LCC terminal controller
│       │   ├── space_center/      # Modular Space Center 2 web port
│       │   │   ├── site.js        # Orchestrator, collision registry & instanced batching
│       │   │   ├── environment.js # Terrain, roads, beach, palms, press site
│       │   │   ├── pad.js         # Pad 39A support, propellant farm, masts & water tower
│   │   ├── pad39b.js      # Walkable LC-39B: hardstand, SLS stack, crawler CT-2 & collision
│       │   │   ├── vab.js         # Walkable VAB high bay + spacecraft integration terminal
│       │   │   ├── lcc.js         # Walkable Launch Control Center + flight dynamics terminal
│       │   │   ├── crawler.js     # Crawler transporter
│       │   │   ├── utilities.js   # Substation, cooling, fire, antenna & power
│       │   │   └── shared.js      # Site constants, tour spawns & module registry
│       │   ├── launch_cutscene.js # Multi-stage orbital launch & selected bus GLB deployment
│       │   └── docking_simulator.js # 6-DOF orbital rendezvous & docking simulator
│       └── game/                  # Gameplay & runtime loop
│           ├── csa_nasa_resources.js # CSA Digital Games (RADARSAT, OLA, Canadarm2, Tomatosphere) & GMAT .script Lab
│           ├── gameplay.js        # 7 NASA Systems Engineering / MDL consoles, CML 1-4, & Science Products
│           ├── artemis_simulation.js # Cislunar/orbital math for the Artemis training scenario
│           ├── artemis_mission.js  # Artemis phase/resource/checkpoint state machine
│           ├── artemis_game.js     # Artemis client, 3D view and dedicated HUD
│           └── main.js            # Main Three.js render loop, desktop/mobile controls & DRS
├── Dockerfile                     # Production container definition
├── Procfile                       # Process declaration
├── railway.json                   # Railway build & deploy configuration
└── package.json                   # Dependencies & scripts
```

## 🛸 Key Features

- **Merged Shuttle main mission**: **PLAY SOLO** and **CREATE TEAM** now start on LC-39A, board the Shuttle, launch, fly the automatic ascent and OMS-2 orbit insertion, then hand off at verified orbit to the ISS docking simulator and station interior. The crew keeps the Shuttle HUD through launch/ascent; Earth Control stays in the LCC. The original standalone launch-to-runway training flight is still available at `?shuttle=1`.
- **Artemis Lunar Expedition (dated training mission)**: A separate, server-authoritative expedition from SLS launch through Orion lunar transfer, Blue Moon-style lander rendezvous/docking, powered south-polar landing, two bounded EVA task sequences, lunar ascent, Orion reunion, TEI, entry and splashdown. It uses a moving Moon, a patched-conic cislunar model, separate Orion/lander resources and checkpoints, and labels its vehicle/terrain/EVA assumptions. See `docs/ARTEMIS.md` and `public/data/artemis-scenario.json`. It is not an exact reconstruction of an unflown mission.
- **ISS Interior (`ship_interior.js`)**: Explore a simplified, single-level walking arrangement of Harmony, Destiny, Unity, Zarya and Zvezda, with Columbus, Kibo, Tranquility and Quest branches and a Cupola-inspired observation area. The Rassvet and Nauka connections are marked by closed deck hatches; they are not walkable modules. The rebuilt interior has equipment racks, stowage, overhead equipment, handrails, hatches, workstations and a module map; the reference model is not loaded in the game. The rack artwork in `public/textures/iss/` was generated for this reconstruction. A detail pass adds hazard-marked hatch thresholds, finished pressure-wall frames, detailed open hatch leaves with handwheels and latch dogs, cable trays, ventilation grilles, smoke detectors, rack placards, emergency equipment, module colour coding, and a padded seven-pane cupola with a distant animated Earth, atmospheric limb and local starfield.
- **Space Center 2 Web Port (`public/js/world/space_center/`)**: The full LC-39A complex rebuilt in Three.js as reusable modules — Pad 39A support structures, propellant farm, lightning protection, water tower, walkable VAB high bay and comms room, walkable Launch Control Center, crawler transporter, press site, substation, cooling tower, fire water, antenna farm, roads, beach and Pad 39B silhouette. Includes a ground-level site tour with fast travel from the launch-pad HUD. The Pad 39A hardstand now carries a procedural wear layer with expansion joints, cracks, scorch, tyre tracks and blast staining, while the MLP, ramp and flame-trench walls use dedicated weathered concrete/steel textures. The Orbiter Access Arm has diamond-plate and corrugated bump maps, exterior hazard placards, floor NO-STEP stencils, service strip lights and wall junction boxes.
- **27-Part Interactive NASA ISS Showcase (`station_modules.js`, `[J]`)**: Inspect 27 curated NASA ISS modules, trusses, solar wings, and robotic arms with raycast selection, component isolation, floating 3D labels, and searchable engineering dossiers.
- **Mission Academy & Cadet Guidance (`mission_academy.js`, `[F1]`)**: A five-step first-flight wizard covers mission goals, the six design decisions, trade-offs, flight controls, solo/crew flow and debrief scoring. New pilots see it automatically on their first visit, and every design console can show plain-language **CADET COACH** tips, recommended baselines and resource-meter explanations. The Academy can launch a guided, private **Cadet** mission directly.
- **Seeded Mission Anomalies (`getMissionEvent`)**: Every expedition draws a deterministic anomaly from a difficulty-specific deck — cadet maintenance/weather transients, engineer CMEs, DSN outages, reaction-wheel faults and detector degradation, or director-level severe solar storms, network loss, power-bus faults and instrument failures. The same seed produces the same event for the whole crew, and the LDR simulation adds it as a PASS/FAIL phase.
- **Flight Records & Local Leaderboard (`mission_log.js`)**: Completed runs are saved in the browser with score, scenario, difficulty, science/engineering split, CML, constraints, crew and duration. The **PAST FLIGHTS** panel ranks the top 30, supports JSON export, and copies a shareable mission report. Victory requires a **server-validated** LDR report (design ids, score arithmetic, resource constraints, all phases and seeded anomaly), so records marked ✓ reflect an authoritative mission result.
- **Crew Emotes & Fresh Expedition Codes**: Wave, salute, dance, laugh, look around, heart, salsa, Footloose, Woo Walk, and Breakdance emotes (`[X]`, `[1]`–`[9]`, `[0]`) combine skeletal animation with two-bone arm/hand IK — heart hands meet above the helmet, laugh hands cover the visor, salsa trades high flourishes with low cross-body sweeps, the Footloose emote kicks and pumps through an arm-swinging line dance, the Woo Walk struts through a bouncy two-step with alternating fist pumps, the Breakdance drops into a one-hand coffee-grinder spin and finishes in a leg-lifted freeze, and every gesture is relayed to crewmates with floating 3D emoji bubbles. **ENTER MISSION** launches a solo expedition, while **HOST CREW** creates a fresh room with a shareable expedition code (or join a crew by entering its code).
- **Live Earth ↔ Flight Crew Video Link (`video_link.js`)**: Opt-in WebRTC camera call between the LCC and the flight deck. The ship crew gets a compact **EARTH CONTROL** camera feed in the top-left; Earth Control gets a live 3D flight-deck view with up to four seated, animated crew avatars (CDR/PLT/MS1/MS2) and a live camera screen on each seat. Audio stays on the existing all-crew voice relay, and the server only relays SDP/ICE signalling, never video frames. Start it from **CREW COMMS → VIDEO**, the crew-side top-left prompt, or **VIDEO** / **START CAMERA** in the LCC operations console.
- **Unsuit Earth-Control Crew (`crew_a.glb`, `crew_b.glb`)**: The two Earth Control roles spawn inside the LCC wearing NASA-blue crew uniforms instead of spacesuits. **Flight Director** uses Crew A and **Ground Systems** uses Crew B; station crew keep their spacesuit rigs. Earth Control actions are exclusive: Flight Director owns launch/docking clearance, crew alerts and room pings; Ground Systems owns Earth-dish lock, power routing and science downlink. The server rejects actions from the wrong ground role. Both crew models share the astronaut skeleton and idle/walk/look_around/wave clips, so walking, emotes and name badges work in the control room.
- **7 NASA Systems Engineering & MDL Consoles (`gameplay.js`, `[E]`, `[K]`)**: Design missions across Earth Climate EO, Lunar South Pole, Asteroid Rendezvous, **COSMOS-L2 Space Telescope** (wavelength-optics-cryo constraints), **NASA CSLI CubeSat 101** (`3U`/`6U`/`12U` mass & 5-year End-of-Mission deorbit rules), and Sandbox mode. Tracks **CML 1–4** maturity, **Launch/Space/Ground/User** segment readiness, Option A vs. Option B trade studies, live 3D Point-Design previews, Risk Matrices, simulated science product plots, NASA/CSA heritage mission matches, and JSON MDL + **GMAT `.script`** export. Each shared station objective is owned by one crew role (Commander, Engineer, Scientist, Specialist); other roles see it locked, and the server rejects completion attempts from the wrong role. Missing roles are covered by the least-loaded stationed role so solo and small crews remain completable.
- **CSA Digital Games & NASA Space Apps Resource Lab (`csa_nasa_resources.js`)**: Playable in-sim activities built from the Canadian Space Agency's [Digital Games and Activities](https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp) and NASA resources — **CSA RADARSAT Constellation Mission (RCM)** C-band SAR swath triage (Arctic Maritime Captains, Flood First Responders, Prairie Precision Farmers), **CSA OSIRIS-REx Laser Altimeter (OLA)** Bennu 2cm LiDAR sample-site selector (*Nightingale*, *Osprey*, *Kingfisher*, *Sandpiper*), **CSA Mission: Astronaut** (**Canadarm2 / Dextre** robotics & **Tomatosphere™** space agriculture ECLSS), **NASA Build-It-Yourself Space Telescope** (Levels 1–3 + **CSA JWST FGS/NIRISS**), **NASA CSLI CubeSat 101** 5-phase checklist, and live **NASA GMAT (`.script`)** trajectory script generation.
- **ISS CSA Lab co-op activities (`iss_side_games.js`)**: Station-only, room-synchronised versions of the two activities actually performed aboard the ISS — **Canadarm2 cargo capture** (one crew drives the arm, one latches) and the **Tomatosphere greenhouse** (one controls water, one controls light/temperature). Both are opened at the new **CSA LAB** console in Kibo, are independent of the seven mission objectives, and never block mission completion.
- **3D NASA Mission Viz & GMAT Trajectory Theater (`mission_viz.js`, `[U]`)**: Inspect Earth/Moon/L2/Asteroid orbital trajectories, Van Allen radiation belts, Earth shadow umbra cones, ground station coverage cones & RF beams, and scrub mission event timelines across all mission phases.
- **WebXR & Stereo VR Mode (`vr_mode.js`)**: Enter native `immersive-vr` WebXR headsets or universal Desktop/Mobile Side-by-Side Stereo VR (with adjustable IPD & mobile gyro support) for Mission Viz, the 27-part ISS Showcase, and Station exploration.
- **Interactive VAB High Bay & LCC Firing Room Terminals (`space_center.js`)**: Open the pre-flight MDL Spacecraft Integration Desk inside the VAB and the Flight Dynamics / 3D Mission Viz console inside the LCC during the LC-39A Site Tour (`[E]`).
- **Full site collision**: Every complex contributes solid volumes — 39A mound/masts/propellant farm/kiosk, VAB and its indoor launcher, LCC shell and furniture, gatehouse, press mound, utilities and the whole LC-39B complex. The ground tour slides along them instead of walking through structures.
- **Full Mobile Compatibility (Width, Height & Performance)**:
  - Dynamic viewport adaptation (`visualViewport`, `100dvw`/`100dvh`, safe-area insets, and portrait-adaptive vertical FOV).
  - Multi-touch controls: left-thumb analog virtual joystick with auto-sprint, right-thumb 360° camera look, and 2-finger pinch-to-zoom.
  - Mobile GPU/CPU optimization: capped DPR (`1.25`), `mediump` shaders, disabled shadow maps on mobile, lightweight `astronaut_lod1.glb` default, and automatic Dynamic Resolution Scaling (DRS).

## 🕹️ Controls

| Action | Desktop (Keyboard & Mouse) | Mobile / Tablet (Multi-Touch) |
| :--- | :--- | :--- |
| **Move / Sprint** | `WASD` / `Arrow Keys` (`Shift` to sprint) | Left-thumb Analog Joystick (outer ring auto-sprints) |
| **Look / Orbit** | Drag Mouse / Pointer Lock | Right-thumb Drag + 2-Finger Pinch-to-Zoom |
| **Interact with Console** | `[E]` or click prompt | Tap floating `⚡ ACCESS TERMINAL` button |
| **Crew Emotes** | `[X]` wheel / `[1]`–`[9]`, `[0]` quick emotes | Tap `💬 EMOTE` in HUD |
| **Switch 1st / 3rd Person** | `[C]` | Tap `👁️` Camera button in HUD |
| **Boarding** | Lock the Access Arm, walk the bridge, then press `[E]`/`[B]` at the Orbiter Hatch. Press `[E]`/`[B]` again before liftoff to step back onto the bridge | Tap the hatch prompt or **STEP OUT** button |
| **Docking Camera** | Drag to orbit, wheel to zoom, double-click to reset, `[V]` chase/cockpit | Drag to orbit, pinch to zoom |
| **Site Tour** | `SITE TOUR` on the pad HUD, `1`–`8` fast travel (39A, VAB, LCC, crawler, beach, press, Pad 39B, 39B crawler), `T` return to gantry | Tap `SITE TOUR`, then tap a destination |
| **Ground Consoles** | `[E]` at the Flight Director / Ground Systems desks in the LCC, or the VAB integration desk | Tap the `⚡ ACCESS TERMINAL` prompt |
| **Live Crew Video** | `VIDEO` in **CREW COMMS** or the LCC operations console (`[C]`) / top-left crew prompt | Tap `VIDEO` or `START CAMERA` |
| **27-Part NASA ISS 3D Showcase** | `[J]` | Tap `🛰️ ISS 3D` button in HUD |
| **3D Lunar Touchdown Scene** | `[K]` | Tap `🌕 MOON` button in HUD |
| **3D Mission Viz / Trajectory Theater** | `[U]` | Tap `🛰️ VIZ` or `🛰️ 3D ORBIT VIZ` in HUD |
| **WebXR / Stereo VR Inspection** | `VR VIEW` button (`[ESC]` to exit) | Tap `🥽 VR` / `🥽 STEREO VR` button |
| **3D Model Hangar / Ground Planner** | `[H]` / `[M]` | Tap `GLB HANGAR` or `📋 MISSION DESIGN` in HUD |

## 🌐 Local Development

```bash
npm install
npm start
# Open http://localhost:3000
```

## 🏗️ Space Center 2 Web Port

The LC-39A complex from the original Godot project has been converted to
Vanilla Three.js and split into reusable modules under
`public/js/world/space_center/`. The original Godot source is preserved in
`design-reference/spacecenter2-godot/` for reference only and is excluded from
the production container.

- `shared.js` — site constants, fast-travel spawns and module registry.
- `environment.js` — terrain, roads, crawlerway, beach, palms, press site,
  turn basin and Pad 39B.
- `pad.js` — pad support structures, propellant farm, lightning masts and
  water tower.
- `vab.js` / `lcc.js` — walkable Vehicle Assembly Building and Launch Control
  Center interiors.
- `crawler.js` — crawler transporter.
- `utilities.js` — substation, cooling tower, generator house, fire water,
  antenna farm and power lines.
- `site.js` — assembles the site, registers collision volumes and batches
  static boxes into instanced meshes. The tour controller itself lives in
  `space_center.js`.

Open the **SITE TOUR** from the launch-pad HUD, then use `1`–`8` to fast travel
between Pad 39A, the VAB, the LCC, the crawler, the beach, the press site and
the walkable **LC-39B** complex (Pad 39B and its crawlerway approach). The LCC
contains the single ground control room. Pad 39B has its own octagonal
hardstand, flame trench, SLS-class launch stack, fixed service structure,
lightning masts, water tower and propellant farm; the launch and boarding flow
still runs from Pad 39A. Press `T` to return to the gantry and continue boarding.

## 3D Asset Attribution

The constructed ISS interior uses **International Space Station** by [Stephen Mack on Sketchfab](https://sketchfab.com/3d-models/international-space-station-2256c89a089b4ec895bb658b18fa7bbb) as a structural reference. The original model is licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/); it is not included in this repository or loaded in the game. The reference credit is also available from the ISS interior HUD.

Module relationships and interior details were also checked against NASA's [station assembly guide](https://www.nasa.gov/international-space-station/international-space-station-assembly-elements/), [Harmony module description](https://www.nasa.gov/international-space-station/harmony-module/) and [ISS tour](https://www.nasa.gov/international-space-station/suni-iss-tour/). The walkable layout is a simplified single-level interpretation, including the Cupola observation area.

## 🔐 Security Configuration

- **Sessions:** register/login/reset issue an opaque bearer token (stored as a SHA-256 hash, 7-day expiry). Send it as `Authorization: Bearer <token>` and via Socket.IO `auth: { token }`. Guests receive server-assigned, session-only identities.
- **CORS:** set `ALLOWED_ORIGINS` (comma-separated) to the trusted origins serving the game.
- **Storage admin:** `/api/storage/status` and `/api/storage/sync` are disabled unless `STORAGE_ADMIN_TOKEN` is set; callers must send `x-storage-admin-token`.
- **DB TLS:** PostgreSQL TLS verification is on by default. Only set `DB_SSL_REJECT_UNAUTHORIZED=false` if your provider requires relaxed verification.
- **Password changes:** `/api/auth/reset-password` now requires the current password as well as the new one.
- **Rate limits:** auth endpoints are limited to 20 requests/minute/IP; other APIs to 120/minute/IP; Socket.IO events are throttled per connection. The app trusts one reverse-proxy hop by default (Railway); set `TRUST_PROXY=false` only when running without a proxy.
- **Video ICE / TURN:** the live crew video link uses WebRTC with public STUN by default. Set `TURN_URLS` (comma-separated), `TURN_USERNAME` and `TURN_CREDENTIAL` on the server to advertise a TURN relay through `/api/video/ice` for restrictive NATs.
- **Dependencies:** `npm audit --omit=dev` should be run in CI (currently reports 0 vulnerabilities).

## 🌐 Server Regions

`public/js/core/regions.js` maps the `us.lunaspis.com` and `asia.lunaspis.com` subdomains to the title-screen server selector. Clicking the current region navigates to the other subdomain; the lobby shows which region hosts the room. This is a full navigation, not a Socket.IO redirect.

For the label to match real hosting, each hostname must point to a **separate Railway service**, and each service must be deployed in the intended region. A custom domain does not set the Railway region by itself. Startup logs `Server region:` from `SERVER_REGION` (or Railway's `RAILWAY_REPLICA_REGION`), so set `SERVER_REGION=us` / `SERVER_REGION=asia` on each service to make deployments easy to distinguish. Active rooms live in the memory of the serving instance, so:

- Create and join rooms on the same region.
- Invite links (`/?room=CODE`) keep the creator's region.
- A room code typed after a wrong-region failure is carried to the other region and retried automatically.
- Room codes are independent per region and can collide.
- Profiles and history are shared only when both services use the same `DATABASE_URL`; otherwise each falls back to its own local JSON store.
- The display name is carried across regions with a `lunaspis_name` cookie scoped to `.lunaspis.com`.

If the domains change, update the `REGIONS` list in `regions.js`. Focused checks: `node tests/regions/run_checks.js`.
