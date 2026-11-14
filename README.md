# 🚀 Interfellas — Perilune Orbital Transit & NASA ISS 3D Simulator

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
├── public/                        # Static frontend (Vanilla Three.js — no Next.js)
│   ├── index.html                 # Main application shell & responsive HUD overlays
│   ├── css/
│   │   └── style.css              # Desktop + mobile responsive styles & touch thumbstick UI
│   ├── basis/                     # Basis Universal / KTX2 GPU texture transcoder (JS + WASM)
│   ├── draco/                     # Google Draco 3D mesh decompression workers (JS + WASM)
│   ├── models/                    # Primary SpaceShip (Perilune) 3D GLB assets
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
│       │   ├── glb_manager.js     # GLB/KTX2/Draco/Meshopt loader, astronaut rig & 3D Hangar Studio
│       │   ├── network.js         # Socket.IO client state sync & snapshot interpolation
│       │   ├── voice.js           # WebRTC spatial proximity & long-range radio voice chat
│       │   ├── audio_synth.js     # Procedural Web Audio synthesizer & Quindar radio tones
│       │   ├── cinematic_pass.js  # ACES Filmic post-processing shader pass
│       │   └── space_textures.js  # Procedural canvas material & decal generators
│       ├── world/                 # 3D scenes & interactive environments
│       │   ├── ship_interior.js   # 6-room Perilune spacecraft interior/exterior, AI crew, SVG minimap & Lunar scene
│       │   ├── station_modules.js # 27-part interactive NASA ISS 3D reference showcase
│       │   ├── photorealistic_earth.js # Custom GLSL atmospheric & day/night Earth shader
│       │   ├── space_center.js    # Kennedy Space Center LC-39A ground complex
│       │   ├── launch_cutscene.js # Multi-stage orbital launch sequence
│       │   ├── docking_simulator.js # 6-DOF orbital rendezvous & docking simulator
│       │   ├── fleet_controller.js # Free-flight spacecraft piloting & satellite deployment
│       │   └── space_map.js       # 3D Solar System planetary navigation map
│       └── game/                  # Gameplay & runtime loop
│           ├── gameplay.js        # 6 Perilune console mini-games & 4-resource telemetry
│           └── main.js            # Main Three.js render loop, desktop/mobile controls & DRS
├── Dockerfile                     # Production container definition
├── Procfile                       # Process declaration
├── railway.json                   # Railway build & deploy configuration
└── package.json                   # Dependencies & scripts
```

## 🛸 Key Features

- **6-Room Perilune Spacecraft (`ship_interior.js`)**: Explore the Transit Hub, Command Deck (with 3D Earth Cupola window), Power Bay, Life Support, Hull Access, and Lander Bay with real-time wall/rack sliding collision, 3 autonomous AI crewmates, and a collapsible SVG ship minimap.
- **27-Part Interactive NASA ISS Showcase (`station_modules.js`, `[J]`)**: Inspect 27 curated NASA ISS modules, trusses, solar wings, and robotic arms with raycast selection, component isolation, floating 3D labels, and searchable engineering dossiers.
- **6 Console Mini-Games & Lunar Touchdown (`gameplay.js`, `[K]`)**: Stabilize Power Routing, Hull Breach Seals, Life Support Scrubbers, Navigation Burns, High-Gain Antenna Alignment, and Science Spectrometer Scans before descending to Mare Tranquillitatis in the 3D Lunar Lander scene.
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
| **Switch 1st / 3rd Person** | `[C]` | Tap `👁️` Camera button in HUD |
| **27-Part NASA ISS 3D Showcase** | `[J]` | Tap `🛰️ ISS 3D` button in HUD |
| **3D Lunar Touchdown Scene** | `[K]` | Tap `🌕 MOON` button in HUD |
| **3D Model Hangar / Fleet / Map** | `[H]` / `[U]` / `[M]` | Tap `🛰️`, `🚀`, or `🌌` in HUD |

## 🌐 Local Development

```bash
npm install
npm start
# Open http://localhost:3000
```
