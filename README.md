# 🚀 Interfellas — Lunaspis Orbital Transit & NASA ISS 3D Simulator

**Interfellas** is a real-time 6-player cooperative 3D space simulator built with **vanilla Three.js**, **Express**, **Socket.IO**, **WebRTC Proximity Voice**, and **Web Audio API**. Fully optimized for both **desktop** and **mobile/tablet** viewports and ready for instant deployment on **Railway**.

## 📁 Project Structure

```text
Interfellas/
├── server.js                      # Express + Socket.IO authoritative multiplayer server entrypoint
├── server/                        # Backend services
│   ├── db.js                      # PostgreSQL / local JSON persistence (users, rooms, tasks, chat)
│   ├── storage.js                 # Zero-dependency S3 / Railway Object Storage client
│   └── voice-signaling.js         # WebRTC peer-to-peer proximity & radio voice signaling
├── scripts/
│   └── sync_bucket.js             # CLI utility to sync 3D .glb assets to Railway Object Storage
├── design-reference/
│   └── spacecenter2-godot/        # Original Godot LC-39A source (reference only, not deployed)
├── public/                        # Static frontend (Vanilla Three.js — no Next.js)
│   ├── index.html                 # Main application shell & responsive HUD overlays
│   ├── css/
│   │   ├── style.css              # Desktop + mobile responsive layout & touch thumbstick UI
│   │   ├── premium.css            # Interface tokens & component system
│   │   ├── lunar-glass.css        # Flight Lime accent & frosted glass surfaces
│   │   └── flightdeck.css         # Technical HUD layer, chamfered chrome & Quick Deck
│   ├── basis/                     # Basis Universal / KTX2 GPU texture transcoder (JS + WASM)
│   ├── draco/                     # Google Draco 3D mesh decompression workers (JS + WASM)
│   ├── models/                    # Primary SpaceShip (Lunaspis) 3D GLB assets
│   │   ├── astronaut/             # astronaut_lod0.glb (2K KTX2) & astronaut_lod1.glb (1K KTX2)
│   │   └── iss/                   # ISS_stationary_opt.glb (27-part NASA ISS) & ISS_B.glb
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
│       │   ├── ui_theme.js        # Shared UI palette, input-mode prompts & canvas colors
│       │   ├── glb_manager.js     # GLB/KTX2/Draco/Meshopt loader, astronaut rig & 3D Hangar Studio
│       │   ├── network.js         # Socket.IO client state sync & snapshot interpolation
│       │   ├── voice.js           # WebRTC spatial proximity & long-range radio voice chat
│       │   ├── audio_synth.js     # Procedural Web Audio synthesizer & Quindar radio tones
│       │   └── cinematic_pass.js  # ACES Filmic post-processing shader pass
│       ├── world/                 # 3D scenes & interactive environments
│       │   ├── ship_interior.js   # 6-room Lunaspis spacecraft interior/exterior, HoloTable orbit sync & Lunar scene
│       │   ├── station_modules.js # 27-part interactive NASA ISS 3D reference showcase
│       │   ├── mission_viz.js     # Interactive 3D NASA Mission Viz & GMAT trajectory theater
│       │   ├── vr_mode.js         # WebXR ("immersive-vr") + desktop/mobile Side-by-Side Stereo VR mode
│       │   ├── photorealistic_earth.js # Custom GLSL atmospheric & day/night Earth shader
│       │   ├── space_center.js    # Kennedy Space Center LC-39A scene & VAB/LCC terminal controller
│       │   ├── space_center/      # Modular Space Center 2 web port
│       │   │   ├── site.js        # Orchestrator, collision registry & instanced batching
│       │   │   ├── environment.js # Terrain, roads, beach, palms, press site
│       │   │   ├── pad.js         # Pad support, propellant farm, masts & water tower
│       │   │   ├── vab.js         # Walkable VAB high bay + spacecraft integration terminal
│       │   │   ├── lcc.js         # Walkable Launch Control Center + flight dynamics terminal
│       │   │   ├── crawler.js     # Crawler transporter
│       │   │   ├── utilities.js   # Substation, cooling, fire, antenna & power
│       │   │   └── shared.js      # Site constants, tour spawns & module registry
│       │   ├── launch_cutscene.js # Multi-stage orbital launch & selected bus GLB deployment
│       │   └── docking_simulator.js # 6-DOF orbital rendezvous & docking simulator
│       └── game/                  # Gameplay & runtime loop
│           ├── gameplay.js        # 7 NASA Systems Engineering / MDL consoles, CML 1-4, & Science Products
│           └── main.js            # Main Three.js render loop, desktop/mobile controls & DRS
├── Dockerfile                     # Production container definition
├── Procfile                       # Process declaration
├── railway.json                   # Railway build & deploy configuration
└── package.json                   # Dependencies & scripts
```

## 🛸 Key Features

- **6-Room Lunaspis Spacecraft (`ship_interior.js`)**: Explore the Transit Hub, Command Deck (with 3D Earth Cupola window), Power Bay, Life Support, Hull Access, and Lander Bay with real-time wall/rack sliding collision, live crew markers on a collapsible SVG ship minimap, and no AI-controlled crewmates.
- **Space Center 2 Web Port (`public/js/world/space_center/`)**: The full LC-39A complex rebuilt in Three.js as reusable modules — Pad 39A support structures, propellant farm, lightning protection, water tower, walkable VAB high bay and comms room, walkable Launch Control Center, crawler transporter, press site, substation, cooling tower, fire water, antenna farm, roads, beach and Pad 39B silhouette. Includes a ground-level site tour with fast travel from the launch-pad HUD.
- **27-Part Interactive NASA ISS Showcase (`station_modules.js`, `[J]`)**: Inspect 27 curated NASA ISS modules, trusses, solar wings, and robotic arms with raycast selection, component isolation, floating 3D labels, and searchable engineering dossiers.
- **Crew Emotes & Fresh Expedition Codes**: Wave, salute, dance, laugh, look around, and heart emotes (`[Q]`/`[X]` Quick Deck, `[1]`–`[6]`) combine skeletal animation with two-bone arm/hand IK — heart hands meet above the helmet, laugh hands cover the visor, and every gesture is relayed to crewmates with floating 3D emoji bubbles. Quick play now fills an open public crew or creates a brand-new random expedition code instead of reusing a permanent room.
- **7 NASA Systems Engineering & MDL Consoles (`gameplay.js`, `[E]`, `[K]`)**: Design missions across Earth Climate EO, Lunar South Pole, Asteroid Rendezvous, **COSMOS-L2 Space Telescope** (wavelength-optics-cryo constraints), **NASA CSLI CubeSat 101** (`3U`/`6U`/`12U` mass & 5-year End-of-Mission deorbit rules), and Sandbox mode. Tracks **CML 1–4** maturity, **Launch/Space/Ground/User** segment readiness, Option A vs. Option B trade studies, live 3D Point-Design previews, Risk Matrices, simulated science product plots, NASA/CSA heritage mission matches, and JSON MDL export.
- **3D NASA Mission Viz & GMAT Trajectory Theater (`mission_viz.js`, `[U]`)**: Inspect Earth/Moon/L2/Asteroid orbital trajectories, Van Allen radiation belts, Earth shadow umbra cones, ground station coverage cones & RF beams, and scrub mission event timelines across all mission phases.
- **WebXR & Stereo VR Mode (`vr_mode.js`)**: Enter native `immersive-vr` WebXR headsets or universal Desktop/Mobile Side-by-Side Stereo VR (with adjustable IPD & mobile gyro support) for Mission Viz, the 27-part ISS Showcase, and Station exploration.
- **Interactive VAB High Bay & LCC Firing Room Terminals (`space_center.js`)**: Open the pre-flight MDL Spacecraft Integration Desk inside the VAB and the Flight Dynamics / 3D Mission Viz console inside the LCC during the LC-39A Site Tour (`[E]`).
- **Dual UI Themes (Settings → Display → UI Theme)**: Switch instantly between **Flight Lime** mission-control lime and **Gloss Silver** frosted-chrome finishes. The choice persists per browser and applies across the title screen, lobby, HUD, modals, world terminals, and Quick Deck without touching layout or gameplay.
- **Flight Deck UI Themes**: Switch between Flight Lime, Gloss Silver, and Lunar Champagne in Settings → Display, with frosted glass surfaces, objective progress/status animations, resource-meter target ticks, Quick Deck hover detail, input-aware prompts, and reduced-motion support.
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
| **Quick Deck** | `[Q]` deck / `[X]` crew tab / `[1]`–`[6]` quick emotes | Tap `▦ DECK` in HUD |
| **Switch 1st / 3rd Person** | `[C]` | Tap `👁️` Camera button in HUD |
| **Boarding** | Follow the glowing Access Arm Control and Orbiter Hatch markers; arm lock, boarding and liftoff trigger automatically | Same glowing markers |
| **Docking Camera** | Drag to orbit, wheel to zoom, double-click to reset, `[V]` chase/cockpit | Drag to orbit, pinch to zoom |
| **LC-39A Site Tour** | `LC-39A SITE TOUR` on the pad HUD, `1`–`6` fast travel, `T` return to gantry | Tap `LC-39A SITE TOUR`, then tap a destination |
| **27-Part NASA ISS 3D Showcase** | `[J]` | Tap `🛰️ ISS 3D` button in HUD |
| **3D Lunar Touchdown Scene** | `[K]` | Tap `🌕 MOON` button in HUD |
| **3D Mission Viz / Trajectory Theater** | `[U]` | Tap `🛰️ VIZ` or `🛰️ 3D ORBIT VIZ` in HUD |
| **WebXR / Stereo VR Inspection** | `VR VIEW` button (`[ESC]` to exit) | Tap `🥽 VR` / `🥽 STEREO VR` button |
| **3D Model Hangar / Ground Planner** | `[H]` / `[M]` | Tap `GLB HANGAR` or `📋 MISSION DESIGN` in HUD |
| **Gamepad** | `A` select/interact, `B` back, `X` interact, `Y` camera, `LB/RB` deck tabs, `Start` settings | Bluetooth/USB controller with standard mapping |

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

Open the **LC-39A SITE TOUR** from the launch-pad HUD, then use `1`–`6` to fast
travel between Pad 39A, the VAB, the LCC, the crawler, the beach and the press
site. Press `T` to return to the gantry and continue boarding.

## 🔐 Security Configuration

- **Sessions:** register/login/reset issue an opaque bearer token (stored as a SHA-256 hash, 7-day expiry). Send it as `Authorization: Bearer <token>` and via Socket.IO `auth: { token }`. Guests receive server-assigned, session-only identities.
- **CORS:** set `ALLOWED_ORIGINS` (comma-separated) to the trusted origins serving the game.
- **Storage admin:** `/api/storage/status` and `/api/storage/sync` are disabled unless `STORAGE_ADMIN_TOKEN` is set; callers must send `x-storage-admin-token`.
- **DB TLS:** PostgreSQL TLS verification is on by default. Only set `DB_SSL_REJECT_UNAUTHORIZED=false` if your provider requires relaxed verification.
- **Password changes:** `/api/auth/reset-password` now requires the current password as well as the new one.
- **Rate limits:** auth endpoints are limited to 20 requests/minute/IP; other APIs to 120/minute/IP; Socket.IO events are throttled per connection. The app trusts one reverse-proxy hop by default (Railway); set `TRUST_PROXY=false` only when running without a proxy.
- **Dependencies:** `npm audit --omit=dev` should be run in CI (currently reports 0 vulnerabilities).
