/* ==========================================================================
   feature_tutorial.js — Interactive Annotated Screenshot Tutorials
   Shows a visual screenshot of each interactive feature with pointer leader
   lines, numbered pins, what each button does, and what key/action to press.
   CSP-safe: zero inline handlers, zero inline <style> tags.
   ========================================================================== */
(function (window, document) {
  "use strict";

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Reusable SVG helpers for crisp 800x500 (16:10) UI screenshots
  function svgFrame(bgFill, inner) {
    return `<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Feature screenshot diagram">
      <defs>
        <linearGradient id="ft-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0b1f3a"/>
          <stop offset="65%" stop-color="#1d4d7a"/>
          <stop offset="100%" stop-color="#6096ba"/>
        </linearGradient>
        <linearGradient id="ft-space" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#030712"/>
          <stop offset="60%" stop-color="#091326"/>
          <stop offset="100%" stop-color="#0c1d3a"/>
        </linearGradient>
        <linearGradient id="ft-lunar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#06080f"/>
          <stop offset="55%" stop-color="#1e2430"/>
          <stop offset="100%" stop-color="#474e5c"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" fill="${bgFill}"/>
      ${inner}
    </svg>`;
  }

  function svgBtn(x, y, w, h, label, fill, stroke, textColor) {
    return `<g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill || "#111b2e"}" stroke="${stroke || "#38bdf8"}" stroke-width="1.3"/>
      <text x="${x + w / 2}" y="${y + h / 2 + 3.5}" text-anchor="middle" fill="${textColor || "#f8fafc"}" font-family="monospace" font-size="10" font-weight="700">${esc(label)}</text>
    </g>`;
  }

  function svgPanel(x, y, w, h, fill, stroke) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill || "rgba(9,14,26,0.9)"}" stroke="${stroke || "rgba(148,163,184,0.35)"}" stroke-width="1.4"/>`;
  }

  const FEATURES = [
    {
      id: "title_screen",
      name: "Title Screen",
      badge: "START & SETUP",
      subtitle: "Launch a mission, join a crew room, pick your theme, or open training tools.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <circle cx="580" cy="210" r="145" fill="#0d2b52" opacity="0.65"/>
        <circle cx="580" cy="210" r="122" fill="#13467d" opacity="0.8"/>
        <ellipse cx="580" cy="210" rx="150" ry="38" fill="none" stroke="#38bdf8" stroke-opacity="0.35" stroke-width="2" transform="rotate(-14 580 210)"/>
        <!-- Top utility bar -->
        ${svgBtn(565, 16, 70, 24, "THEME", "#0f172a", "#64748b")}
        ${svgBtn(642, 16, 68, 24, "AUDIO", "#0f172a", "#64748b")}
        ${svgBtn(718, 16, 64, 24, "? HELP", "#0f172a", "#38bdf8", "#7dd3fc")}
        <!-- Hero left card -->
        ${svgPanel(46, 76, 360, 355, "rgba(8,13,25,0.88)", "rgba(148,163,184,0.3)")}
        <text x="70" y="114" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="700">INTERFELLAS // LUNASPIS</text>
        <text x="70" y="146" fill="#f8fafc" font-family="sans-serif" font-size="24" font-weight="800">ORBITAL COMMAND</text>
        <rect x="70" y="170" width="312" height="32" rx="6" fill="#0b1220" stroke="#475569"/>
        <text x="82" y="190" fill="#cbd5e1" font-family="monospace" font-size="11">CALLSIGN: ASTRONAUT_01</text>
        ${svgBtn(70, 218, 150, 38, "NEW MISSION", "#0369a1", "#38bdf8", "#ffffff")}
        ${svgBtn(232, 218, 150, 38, "JOIN MISSION", "#0f172a", "#38bdf8", "#7dd3fc")}
        <rect x="70" y="270" width="312" height="30" rx="6" fill="#0b1220" stroke="#475569"/>
        <text x="82" y="289" fill="#94a3b8" font-family="monospace" font-size="10">ROOM CODE: [ X X X X X X ]</text>
        <!-- Bottom utility row -->
        ${svgBtn(70, 326, 98, 30, "ACADEMY [F1]", "#111827", "#facc15", "#fde047")}
        ${svgBtn(176, 326, 102, 30, "SPACE LABS", "#111827", "#a78bfa", "#ddd6fe")}
        ${svgBtn(286, 326, 96, 30, "SETTINGS", "#111827", "#64748b", "#e2e8f0")}
        ${svgBtn(70, 372, 312, 34, "SOLO / QUICK LAUNCH", "#14532d", "#4ade80", "#dcfce7")}
      `),
      steps: [
        {
          id: "callsign",
          title: "Callsign Input",
          what: "Sets your astronaut name shown to teammates.",
          press: ["Click", "Type Name"],
          x: 28, y: 37, lx: 56, ly: 20,
          domSelector: "#input-callsign"
        },
        {
          id: "host",
          title: "New / Join Mission",
          what: "Create a 6-player co-op room or enter a room code to join.",
          press: ["Click"],
          x: 28, y: 47, lx: 62, ly: 42,
          domSelector: "#btn-create-room"
        },
        {
          id: "academy",
          title: "Academy & Space Labs",
          what: "Open the 5-step Mission Academy or CSA/NASA simulator labs.",
          press: ["Click", "F1"],
          x: 22, y: 68, lx: 62, ly: 66,
          domSelector: "#btn-open-academy"
        },
        {
          id: "solo",
          title: "Solo / Quick Launch",
          what: "Jump straight into LC-39A ground & launch sequence solo.",
          press: ["Click"],
          x: 28, y: 78, lx: 62, ly: 84,
          domSelector: "#btn-quick-solo"
        },
        {
          id: "theme_audio",
          title: "Theme & Audio",
          what: "Switch HUD color theme or mute/adjust sound effects.",
          press: ["Click"],
          x: 78, y: 5.5, lx: 78, ly: 19,
          domSelector: "#btn-title-theme"
        }
      ]
    },
    {
      id: "lobby",
      name: "Mission Lobby & Crew Roles",
      badge: "CREW STAGING",
      subtitle: "Pick Flight or Earth Control role, toggle ready status, and launch.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        ${svgPanel(40, 26, 720, 448, "rgba(10,16,30,0.92)", "rgba(56,189,248,0.35)")}
        <text x="64" y="58" fill="#38bdf8" font-family="monospace" font-size="12" font-weight="800">ROOM CODE: KSC-39A</text>
        ${svgBtn(616, 40, 62, 24, "AUDIO", "#0f172a", "#64748b")}
        ${svgBtn(686, 40, 52, 24, "LEAVE", "#450a0a", "#ef4444", "#fecaca")}
        <!-- Role Cards -->
        ${svgPanel(64, 84, 330, 270, "rgba(15,23,42,0.85)", "#334155")}
        <text x="80" y="108" fill="#facc15" font-family="monospace" font-size="11" font-weight="700">SELECT CREW ROLE</text>
        ${svgBtn(80, 122, 142, 42, "COMMANDER", "#1e3a8a", "#38bdf8")}
        ${svgBtn(234, 122, 142, 42, "PILOT", "#1e293b", "#64748b")}
        ${svgBtn(80, 174, 142, 42, "ENGINEER", "#1e293b", "#64748b")}
        ${svgBtn(234, 174, 142, 42, "SCIENTIST", "#1e293b", "#64748b")}
        ${svgBtn(80, 228, 296, 38, "EARTH CONTROL (LCC ROOM 4)", "#064e3b", "#34d399", "#a7f3d0")}
        ${svgBtn(80, 282, 296, 48, "READY FOR LAUNCH", "#14532d", "#4ade80", "#dcfce7")}
        <!-- Crew Roster & Chat -->
        ${svgPanel(414, 84, 324, 270, "rgba(15,23,42,0.85)", "#334155")}
        <text x="430" y="108" fill="#94a3b8" font-family="monospace" font-size="11" font-weight="700">CREW ROSTER & CHAT</text>
        <rect x="430" y="124" width="292" height="30" rx="5" fill="#0f172a" stroke="#38bdf8"/>
        <text x="442" y="143" fill="#e2e8f0" font-family="monospace" font-size="10">1. ASTRONAUT_01 · COMMANDER [READY]</text>
        <rect x="430" y="294" width="220" height="32" rx="5" fill="#090d16" stroke="#475569"/>
        ${svgBtn(656, 294, 66, 32, "SEND", "#0369a1", "#38bdf8")}
        <!-- Launch bar -->
        ${svgBtn(64, 382, 420, 44, "START MISSION (HOST)", "#7c2d12", "#f59e0b", "#fef3c7")}
        ${svgBtn(500, 382, 238, 44, "INVITE / COPY CODE", "#0f172a", "#38bdf8")}
      `),
      steps: [
        {
          id: "roles",
          title: "Flight & Earth Roles",
          what: "Choose Flight Crew (board shuttle & ISS) or Earth Control (LCC ops).",
          press: ["Click Role Card"],
          x: 28, y: 36, lx: 22, ly: 16,
          domSelector: "#lobby-role-grid"
        },
        {
          id: "ready",
          title: "Ready Toggle",
          what: "Mark yourself ready so the host can initiate launch.",
          press: ["Click READY"],
          x: 28, y: 61, lx: 24, ly: 76,
          domSelector: "#btn-lobby-ready"
        },
        {
          id: "roster_chat",
          title: "Roster & Lobby Chat",
          what: "Check connected teammates and coordinate roles via text.",
          press: ["Type", "Enter"],
          x: 72, y: 62, lx: 76, ly: 44,
          domSelector: "#lobby-chat-input"
        },
        {
          id: "start",
          title: "Start Mission",
          what: "Host launches the crew onto LC-39A pad & gantry.",
          press: ["Click START"],
          x: 34, y: 81, lx: 56, ly: 88,
          domSelector: "#btn-lobby-start"
        }
      ]
    },
    {
      id: "in_game_hud",
      name: "In-Game HUD & Station Controls",
      badge: "MOVEMENT & COMMS",
      subtitle: "Move inside the 3D station, interact with workstations, use voice/comms, and open Quick Deck.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <!-- 3D Station corridor backdrop -->
        <polygon points="120,60 680,60 580,380 220,380" fill="#111b2c" stroke="#1e293b" stroke-width="2"/>
        <circle cx="400" cy="250" r="3.5" fill="#38bdf8"/>
        <!-- Top-left Crew & Room Pill -->
        ${svgPanel(18, 16, 220, 56, "rgba(10,16,30,0.9)", "#38bdf8")}
        <text x="32" y="38" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="800">CMD · WINDOW DECK</text>
        <text x="32" y="56" fill="#94a3b8" font-family="monospace" font-size="10">O2 100% · PRESS 101.3 kPa</text>
        <!-- Top-right Voice & Tools -->
        ${svgPanel(556, 16, 226, 62, "rgba(10,16,30,0.9)", "#64748b")}
        ${svgBtn(568, 28, 66, 24, "MIC [V]", "#0f172a", "#4ade80", "#86efac")}
        ${svgBtn(642, 28, 68, 24, "CHAT [C]", "#0f172a", "#38bdf8")}
        ${svgBtn(718, 28, 52, 24, "SET", "#0f172a", "#64748b")}
        <!-- Bottom Quick Deck -->
        ${svgPanel(180, 412, 440, 72, "rgba(10,16,30,0.94)", "#38bdf8")}
        ${svgBtn(194, 428, 76, 38, "3D VIEW", "#0f172a", "#38bdf8")}
        ${svgBtn(278, 428, 76, 38, "ISS MAP", "#0f172a", "#38bdf8")}
        ${svgBtn(362, 428, 76, 38, "SOLAR", "#0f172a", "#38bdf8")}
        ${svgBtn(446, 428, 76, 38, "TASKS", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(530, 428, 76, 38, "VR MODE", "#0f172a", "#a78bfa", "#ddd6fe")}
      `),
      steps: [
        {
          id: "move",
          title: "Walk & Look Around",
          what: "Move through 3D rooms and rotate camera view.",
          press: ["W A S D", "Click + Drag"],
          x: 50, y: 50, lx: 22, ly: 34
        },
        {
          id: "interact",
          title: "Use Workstation",
          what: "Aim crosshair at glowing consoles/hatches to open tasks.",
          press: ["E", "Click Prompt"],
          x: 50, y: 58, lx: 72, ly: 44
        },
        {
          id: "voice_chat",
          title: "Voice & Crew Chat",
          what: "Toggle push-to-talk microphone or open team text chat.",
          press: ["V", "C"],
          x: 78, y: 8.5, lx: 78, ly: 25,
          domSelector: "#hud-voice-panel"
        },
        {
          id: "quick_deck",
          title: "Quick Deck Tools",
          what: "Open 3D Mission Viz, ISS Showcase, Solar System, Tasks, or VR.",
          press: ["Click Deck", "U"],
          x: 50, y: 89, lx: 50, ly: 72,
          domSelector: "#quick-deck"
        }
      ]
    },
    {
      id: "space_center",
      name: "Space Center (LC-39A) & LCC",
      badge: "LAUNCH PAD & OPS",
      subtitle: "Ride the FSS elevator, extend the Boarding Bridge, board the shuttle, or tour KSC.",
      renderScreenshot: () => svgFrame("url(#ft-sky)", `
        <!-- Ocean & Pad Berm -->
        <rect x="0" y="340" width="800" height="160" fill="#2f4f32"/>
        <rect x="610" y="340" width="190" height="160" fill="#0b6e94"/>
        <!-- FSS Tower + OAA Arm + Shuttle Stack -->
        <rect x="260" y="95" width="38" height="255" fill="#64748b" stroke="#94a3b8"/>
        <rect x="298" y="190" width="84" height="12" fill="#facc15"/>
        <rect x="392" y="140" width="24" height="190" rx="8" fill="#d97706"/>
        <rect x="412" y="155" width="22" height="170" rx="6" fill="#f8fafc"/>
        <!-- Ground HUD Dock (top-left) -->
        ${svgPanel(18, 16, 330, 175, "rgba(8,14,26,0.93)", "#38bdf8")}
        <text x="32" y="38" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="800">LC-39A // LAUNCH PAD</text>
        ${svgBtn(224, 24, 54, 22, "BOARD", "#064e3b", "#34d399")}
        ${svgBtn(284, 24, 52, 22, "LAUNCH", "#7c2d12", "#f59e0b")}
        ${svgBtn(32, 68, 92, 28, "1 · GROUND", "#0f172a", "#64748b")}
        ${svgBtn(132, 68, 92, 28, "2 · GANTRY", "#0f172a", "#38bdf8")}
        ${svgBtn(232, 68, 102, 28, "3 · TOP DECK", "#0f172a", "#64748b")}
        ${svgBtn(32, 108, 146, 28, "SITE TOUR [T]", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(186, 108, 148, 28, "OPS CONSOLE [F2]", "#0f172a", "#34d399", "#a7f3d0")}
        ${svgBtn(32, 146, 302, 28, "DESIGN [F4] · 3D VIEW [U]", "#0f172a", "#94a3b8")}
      `),
      steps: [
        {
          id: "elevator",
          title: "FSS Elevator Floors",
          what: "Ride between Pad Ground (1), Gantry (2), and Tower Top (3).",
          press: ["1", "2", "3", "E"],
          x: 23, y: 16.5, lx: 64, ly: 16,
          domSelector: "#btn-sc-gantry"
        },
        {
          id: "bridge_arm",
          title: "Access Arm & Boarding",
          what: "Walk to Arm Console to swing bridge, then enter White Room hatch.",
          press: ["F", "E / B"],
          x: 42, y: 39, lx: 66, ly: 39,
          domSelector: "#btn-sc-boarding"
        },
        {
          id: "launch_cmd",
          title: "Launch / Request Go",
          what: "Start liftoff countdown once all flight crew are aboard.",
          press: ["L", "Click LAUNCH"],
          x: 38.5, y: 7, lx: 64, ly: 60,
          domSelector: "#btn-sc-launch"
        },
        {
          id: "tour_car",
          title: "Site Tour & Rover",
          what: "Fast-travel KSC landmarks or drive the open-top rover.",
          press: ["T", "Click TOUR"],
          x: 13, y: 24.5, lx: 24, ly: 58,
          domSelector: "#btn-sc-site-tour"
        },
        {
          id: "lcc_ops",
          title: "LCC Ops Console",
          what: "Earth Control telemetry, Go/No-Go poll, and crew comms.",
          press: ["F2", "E at Desk"],
          x: 32, y: 24.5, lx: 64, ly: 80,
          domSelector: "#btn-sc-lcc-console"
        }
      ]
    },
    {
      id: "shuttle_flight",
      name: "Shuttle Ascent & Orbit",
      badge: "FLIGHT DECK HUD",
      subtitle: "Monitor ascent staging, attitude, burns, and time-warp into ISS rendezvous.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <!-- Earth horizon curve -->
        <path d="M 0 380 Q 400 285 800 380 L 800 500 L 0 500 Z" fill="#0d3b66" opacity="0.85"/>
        <path d="M 0 380 Q 400 285 800 380" fill="none" stroke="#38bdf8" stroke-width="2.5" opacity="0.7"/>
        <!-- Top Tag Bar -->
        ${svgPanel(20, 14, 760, 38, "rgba(8,13,25,0.92)", "#38bdf8")}
        <text x="36" y="37" fill="#4ade80" font-family="monospace" font-size="11" font-weight="800">STAGE 2 // MECO PREP · ALT 112.4 KM</text>
        ${svgBtn(576, 21, 92, 24, "WARP 4x [>]", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(676, 21, 90, 24, "SKIP STAGE", "#0f172a", "#ef4444", "#fecaca")}
        <!-- Left Telemetry Card -->
        ${svgPanel(20, 68, 220, 180, "rgba(8,13,25,0.88)", "#334155")}
        <text x="36" y="92" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="700">FLIGHT DATA [F3]</text>
        <text x="36" y="118" fill="#e2e8f0" font-family="monospace" font-size="10">APOAPSIS:  408.2 km</text>
        <text x="36" y="138" fill="#e2e8f0" font-family="monospace" font-size="10">PERIAPSIS: 396.1 km</text>
        <text x="36" y="158" fill="#e2e8f0" font-family="monospace" font-size="10">VELOCITY:  7,672 m/s</text>
        <text x="36" y="178" fill="#facc15" font-family="monospace" font-size="10">THROTTLE:  104% SSME</text>
        <!-- Bottom Action Bar -->
        ${svgPanel(170, 428, 460, 56, "rgba(8,13,25,0.94)", "#38bdf8")}
        ${svgBtn(186, 440, 100, 32, "PITCH [W/S]", "#0f172a", "#38bdf8")}
        ${svgBtn(296, 440, 100, 32, "ROLL [A/D]", "#0f172a", "#38bdf8")}
        ${svgBtn(406, 440, 100, 32, "BURN [SPACE]", "#7c2d12", "#f59e0b", "#fef3c7")}
        ${svgBtn(516, 440, 98, 32, "SAS [T]", "#064e3b", "#4ade80", "#dcfce7")}
      `),
      steps: [
        {
          id: "attitude",
          title: "Pitch & Roll Steering",
          what: "Steer Shuttle nose along the orbital guidance corridor.",
          press: ["W S", "A D"],
          x: 37, y: 91, lx: 22, ly: 66
        },
        {
          id: "burn",
          title: "Engine Ignition / Burn",
          what: "Fire OMS/SSME engines for orbital insertion or circularization.",
          press: ["SPACE"],
          x: 57, y: 91, lx: 60, ly: 66
        },
        {
          id: "telemetry_f3",
          title: "Flight Data Drawer",
          what: "Toggle full apoapsis, periapsis, Mach & propellant readouts.",
          press: ["F3"],
          x: 16, y: 26, lx: 46, ly: 28,
          domSelector: "#sh-data"
        },
        {
          id: "warp_skip",
          title: "Time Warp & Stage Skip",
          what: "Speed up coast phases or advance directly to ISS docking.",
          press: ["Click WARP", "Click SKIP"],
          x: 84, y: 6.5, lx: 78, ly: 24,
          domSelector: "#sh-ff"
        }
      ]
    },
    {
      id: "docking_sim",
      name: "Orbital Docking Simulator",
      badge: "RENDEZVOUS & DOCK",
      subtitle: "Align pitch/yaw/roll and translate with RCS thrusters to softly latch onto the ISS port.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <!-- Docking Target Reticle -->
        <circle cx="400" cy="255" r="95" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 4"/>
        <circle cx="400" cy="255" r="38" fill="none" stroke="#4ade80" stroke-width="2"/>
        <line x1="350" y1="255" x2="450" y2="255" stroke="#4ade80" stroke-width="1.2"/>
        <line x1="400" y1="205" x2="400" y2="305" stroke="#4ade80" stroke-width="1.2"/>
        <!-- Top Header Row -->
        ${svgPanel(20, 14, 760, 44, "rgba(8,13,25,0.92)", "#38bdf8")}
        <text x="36" y="40" fill="#4ade80" font-family="monospace" font-size="11" font-weight="800">RANGE: 14.2 M · CLOSING: 0.18 M/S</text>
        ${svgBtn(470, 24, 98, 24, "CAM: DOCK [V]", "#0f172a", "#38bdf8")}
        ${svgBtn(576, 24, 98, 24, "AUTO-ALIGN", "#064e3b", "#4ade80")}
        ${svgBtn(682, 24, 84, 24, "BOARD ISS", "#7c2d12", "#f59e0b")}
        <!-- Crew Role Bar -->
        ${svgPanel(20, 72, 220, 96, "rgba(8,13,25,0.88)", "#334155")}
        <text x="34" y="94" fill="#facc15" font-family="monospace" font-size="10" font-weight="700">DOCKING STATION ROLE</text>
        <text x="34" y="114" fill="#e2e8f0" font-family="monospace" font-size="10">PILOT: TRANSLATION [IJKL]</text>
        <text x="34" y="132" fill="#94a3b8" font-family="monospace" font-size="10">CDR: ATTITUDE [WASD]</text>
        <!-- Bottom RCS Bar -->
        ${svgPanel(130, 424, 540, 62, "rgba(8,13,25,0.94)", "#38bdf8")}
        ${svgBtn(146, 438, 120, 34, "ROTATE [W A S D]", "#0f172a", "#38bdf8")}
        ${svgBtn(276, 438, 128, 34, "TRANSLATE [I J K L]", "#0f172a", "#38bdf8")}
        ${svgBtn(414, 438, 118, 34, "FORE/AFT [Q / E]", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(542, 438, 112, 34, "DAMP [SPACE]", "#064e3b", "#4ade80")}
      `),
      steps: [
        {
          id: "translate",
          title: "RCS Translation",
          what: "Slide up/down/left/right and forward/back to center target.",
          press: ["I J K L", "Q / E"],
          x: 42, y: 91, lx: 26, ly: 66
        },
        {
          id: "rotate",
          title: "Attitude & Kill Rotation",
          what: "Align Shuttle roll/pitch/yaw or zero out drift with SPACE.",
          press: ["W A S D", "SPACE"],
          x: 75, y: 91, lx: 74, ly: 66
        },
        {
          id: "cam_auto",
          title: "Camera & Auto-Align",
          what: "Switch docking reticle view or engage assisted alignment.",
          press: ["V", "Click AUTO"],
          x: 72, y: 7, lx: 62, ly: 23,
          domSelector: "#dock-cam-badge"
        },
        {
          id: "enter_iss",
          title: "Enter Station",
          what: "Once soft-capture & hard-latch complete, board the ISS.",
          press: ["Click BOARD ISS"],
          x: 90, y: 7, lx: 84, ly: 32,
          domSelector: "#btn-dock-leave"
        }
      ]
    },
    {
      id: "mdl_workstations",
      name: "MDL Workstations (7 Tasks)",
      badge: "STATION CONSOLES",
      subtitle: "Complete 7 engineering & science workstation tasks inside the 6-room station.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        ${svgPanel(60, 32, 680, 436, "rgba(9,14,27,0.96)", "#38bdf8")}
        <!-- Modal Header -->
        <text x="86" y="66" fill="#38bdf8" font-family="monospace" font-size="12" font-weight="800">WORKSTATION // ORBIT & MISSION DESIGN</text>
        ${svgBtn(670, 46, 52, 26, "CLOSE", "#450a0a", "#ef4444", "#fecaca")}
        <!-- Task Tabs -->
        ${svgBtn(86, 86, 120, 26, "1. MISSION", "#1e3a8a", "#38bdf8")}
        ${svgBtn(214, 86, 120, 26, "2. ORBIT", "#0f172a", "#475569")}
        ${svgBtn(342, 86, 120, 26, "3. BUS / PWR", "#0f172a", "#475569")}
        ${svgBtn(470, 86, 120, 26, "4. COMMS", "#0f172a", "#475569")}
        <!-- Parameter Sliders -->
        ${svgPanel(86, 132, 310, 262, "rgba(15,23,42,0.85)", "#334155")}
        <text x="104" y="160" fill="#e2e8f0" font-family="monospace" font-size="11">ORBIT ALTITUDE: 408 KM</text>
        <rect x="104" y="172" width="270" height="8" rx="4" fill="#1e293b"/>
        <rect x="104" y="172" width="165" height="8" rx="4" fill="#38bdf8"/>
        <text x="104" y="218" fill="#e2e8f0" font-family="monospace" font-size="11">INCLINATION: 51.6 DEG</text>
        <rect x="104" y="230" width="270" height="8" rx="4" fill="#1e293b"/>
        <rect x="104" y="230" width="195" height="8" rx="4" fill="#facc15"/>
        <!-- Live Preview & Verify -->
        ${svgPanel(414, 132, 300, 262, "rgba(15,23,42,0.85)", "#334155")}
        <circle cx="564" cy="240" r="68" fill="#0d2b52" stroke="#38bdf8" stroke-dasharray="4 3"/>
        <ellipse cx="564" cy="240" rx="92" ry="30" fill="none" stroke="#4ade80" stroke-width="2" transform="rotate(-22 564 240)"/>
        ${svgBtn(440, 412, 274, 38, "VALIDATE & COMMIT DESIGN", "#14532d", "#4ade80", "#dcfce7")}
      `),
      steps: [
        {
          id: "tabs",
          title: "Subsystem Tabs",
          what: "Switch between Mission, Orbit, Bus/Power, Thermal, Comms & Science.",
          press: ["Click Tab"],
          x: 34, y: 20, lx: 34, ly: 8,
          domSelector: "#task-modal-body"
        },
        {
          id: "sliders",
          title: "Design Sliders & Inputs",
          what: "Adjust altitude, power budget, antenna gain, or coolant flow.",
          press: ["Drag Slider", "Type Value"],
          x: 28, y: 42, lx: 25, ly: 66
        },
        {
          id: "preview",
          title: "Live Telemetry Readout",
          what: "Inspect real-time orbit/link/mass feasibility before committing.",
          press: ["Observe"],
          x: 70, y: 48, lx: 74, ly: 28
        },
        {
          id: "commit",
          title: "Validate & Commit",
          what: "Save workstation solution and advance station readiness.",
          press: ["Click VALIDATE"],
          x: 72, y: 86, lx: 40, ly: 86
        }
      ]
    },
    {
      id: "iss_showcase",
      name: "ISS Exterior 3D Modules",
      badge: "3D INSPECTOR",
      subtitle: "Orbit the International Space Station, inspect individual modules, and toggle cutaway/VR.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <!-- Stylized ISS truss + modules -->
        <line x1="190" y1="250" x2="610" y2="250" stroke="#94a3b8" stroke-width="8"/>
        <rect x="210" y="130" width="44" height="240" fill="#1e3a8a" stroke="#60a5fa"/>
        <rect x="546" y="130" width="44" height="240" fill="#1e3a8a" stroke="#60a5fa"/>
        <rect x="355" y="190" width="90" height="120" rx="10" fill="#cbd5e1" stroke="#38bdf8" stroke-width="2"/>
        <!-- Topbar -->
        ${svgPanel(18, 14, 764, 42, "rgba(8,13,25,0.92)", "#38bdf8")}
        <text x="34" y="39" fill="#f8fafc" font-family="monospace" font-size="11" font-weight="800">ISS EXTERIOR // MODULE INSPECTOR</text>
        ${svgBtn(494, 23, 86, 24, "CUTAWAY", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(588, 23, 84, 24, "STEREO VR", "#0f172a", "#a78bfa", "#ddd6fe")}
        ${svgBtn(680, 23, 88, 24, "CLOSE [ESC]", "#450a0a", "#ef4444", "#fecaca")}
        <!-- Left Module List -->
        ${svgPanel(18, 70, 174, 340, "rgba(8,13,25,0.88)", "#334155")}
        ${svgBtn(30, 86, 150, 28, "DESTINY LAB", "#1e3a8a", "#38bdf8")}
        ${svgBtn(30, 122, 150, 28, "COLUMBUS", "#0f172a", "#475569")}
        ${svgBtn(30, 158, 150, 28, "KIBO JEM", "#0f172a", "#475569")}
        ${svgBtn(30, 194, 150, 28, "CUPOLA", "#0f172a", "#475569")}
        <!-- Right Info Card -->
        ${svgPanel(606, 70, 176, 260, "rgba(8,13,25,0.88)", "#334155")}
        <text x="622" y="96" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="800">DESTINY LAB</text>
        <text x="622" y="122" fill="#cbd5e1" font-family="sans-serif" font-size="10">Primary US research</text>
        <text x="622" y="138" fill="#cbd5e1" font-family="sans-serif" font-size="10">facility · 24 racks</text>
      `),
      steps: [
        {
          id: "orbit_cam",
          title: "3D Orbit & Zoom",
          what: "Rotate around the ISS exterior and zoom into trusses/docking ports.",
          press: ["Drag", "Scroll Wheel"],
          x: 50, y: 50, lx: 46, ly: 76
        },
        {
          id: "mod_list",
          title: "Module Selector",
          what: "Focus camera on Destiny, Columbus, Kibo, Harmony, or Cupola.",
          press: ["Click Module"],
          x: 13, y: 27, lx: 34, ly: 32,
          domSelector: "#iss-showcase-left"
        },
        {
          id: "cutaway",
          title: "Cutaway & Labels",
          what: "Toggle structural cutaway view and 3D callout pins.",
          press: ["Click CUTAWAY"],
          x: 67, y: 7, lx: 56, ly: 22,
          domSelector: "#iss-showcase-topbar"
        },
        {
          id: "vr_exit",
          title: "VR View & Close",
          what: "Enter Stereo/WebXR view or return to station interior.",
          press: ["Click VR", "ESC"],
          x: 84, y: 7, lx: 84, ly: 22,
          domSelector: "#iss-btn-vr"
        }
      ]
    },
    {
      id: "mission_viz",
      name: "3D Mission Trajectory Viz",
      badge: "ORBITAL VIZ",
      subtitle: "Scrub mission timeline from Launch through LEO, Lunar Transit, and Return.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <!-- Earth + Moon + Orbit Arc -->
        <circle cx="240" cy="250" r="46" fill="#1d4ed8" stroke="#60a5fa" stroke-width="2"/>
        <circle cx="590" cy="220" r="22" fill="#94a3b8"/>
        <path d="M 285 250 C 370 120 530 140 590 220" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-dasharray="6 4"/>
        <!-- Topbar -->
        ${svgPanel(18, 14, 764, 40, "rgba(8,13,25,0.92)", "#38bdf8")}
        <text x="34" y="38" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="800">3D MISSION TRAJECTORY // PHASE 3</text>
        ${svgBtn(530, 22, 78, 24, "CAM: FREE", "#0f172a", "#38bdf8")}
        ${svgBtn(616, 22, 74, 24, "VR VIEW", "#0f172a", "#a78bfa")}
        ${svgBtn(698, 22, 72, 24, "CLOSE", "#450a0a", "#ef4444", "#fecaca")}
        <!-- Telemetry Card -->
        ${svgPanel(18, 70, 210, 140, "rgba(8,13,25,0.88)", "#334155")}
        <text x="34" y="96" fill="#facc15" font-family="monospace" font-size="11" font-weight="700">TELEMETRY</text>
        <text x="34" y="122" fill="#e2e8f0" font-family="monospace" font-size="10">ALT: 384,400 KM</text>
        <text x="34" y="142" fill="#e2e8f0" font-family="monospace" font-size="10">VEL: 1.42 KM/S</text>
        <!-- Bottom Timeline Scrubber -->
        ${svgPanel(40, 424, 720, 60, "rgba(8,13,25,0.94)", "#38bdf8")}
        ${svgBtn(56, 438, 68, 32, "PLAY", "#064e3b", "#4ade80")}
        <rect x="142" y="450" width="460" height="8" rx="4" fill="#1e293b"/>
        <rect x="142" y="450" width="260" height="8" rx="4" fill="#38bdf8"/>
        <circle cx="402" cy="454" r="8" fill="#facc15"/>
        ${svgBtn(618, 438, 126, 32, "SPEED: 1x / 5x", "#0f172a", "#38bdf8")}
      `),
      steps: [
        {
          id: "orbit_3d",
          title: "3D Camera Orbit",
          what: "Drag to rotate around the Earth-Moon trajectory arc; scroll to zoom.",
          press: ["Drag", "Scroll"],
          x: 54, y: 42, lx: 54, ly: 22
        },
        {
          id: "play_scrub",
          title: "Play & Timeline Scrubber",
          what: "Play/pause mission playback or drag scrubber to any phase.",
          press: ["Click PLAY", "Drag Bar"],
          x: 38, y: 90, lx: 28, ly: 70,
          domSelector: "#mv-timeline-bar"
        },
        {
          id: "speed",
          title: "Playback Speed",
          what: "Cycle simulation speed (1x, 2x, 5x, 10x).",
          press: ["Click SPEED"],
          x: 85, y: 90, lx: 82, ly: 70
        },
        {
          id: "cam_vr",
          title: "Camera Preset & VR",
          what: "Switch Ship/Earth/Free camera or open Stereo/WebXR mode.",
          press: ["Click CAM / VR", "ESC"],
          x: 78, y: 7, lx: 78, ly: 22,
          domSelector: "#mv-topbar"
        }
      ]
    },
    {
      id: "solar_system",
      name: "Solar System Orrery",
      badge: "PLANETARY EXPLORER",
      subtitle: "Inspect planets, compare orbital periods/radii, and warp planetary motion.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <circle cx="400" cy="250" r="34" fill="#f59e0b"/>
        <circle cx="400" cy="250" r="78" fill="none" stroke="#334155" stroke-width="1.2"/>
        <circle cx="400" cy="250" r="128" fill="none" stroke="#38bdf8" stroke-width="1.4" stroke-dasharray="4 3"/>
        <circle cx="400" cy="250" r="180" fill="none" stroke="#334155" stroke-width="1.2"/>
        <circle cx="528" cy="250" r="9" fill="#38bdf8"/>
        <circle cx="242" cy="160" r="13" fill="#ef4444"/>
        <!-- Topbar -->
        ${svgPanel(18, 14, 764, 40, "rgba(8,13,25,0.92)", "#38bdf8")}
        <text x="34" y="38" fill="#facc15" font-family="monospace" font-size="11" font-weight="800">SOLAR SYSTEM ORRERY // 8 PLANETS</text>
        ${svgBtn(578, 22, 92, 24, "SPEED: 1x", "#0f172a", "#38bdf8")}
        ${svgBtn(678, 22, 88, 24, "CLOSE [ESC]", "#450a0a", "#ef4444", "#fecaca")}
        <!-- Right Dossier -->
        ${svgPanel(576, 70, 206, 240, "rgba(8,13,25,0.9)", "#38bdf8")}
        <text x="594" y="96" fill="#38bdf8" font-family="monospace" font-size="12" font-weight="800">EARTH</text>
        <text x="594" y="122" fill="#cbd5e1" font-family="monospace" font-size="10">ORBIT: 1.00 AU</text>
        <text x="594" y="142" fill="#cbd5e1" font-family="monospace" font-size="10">PERIOD: 365.25 DAYS</text>
        <!-- Bottom Planet Strip -->
        ${svgPanel(40, 428, 720, 56, "rgba(8,13,25,0.94)", "#334155")}
        ${svgBtn(56, 440, 78, 32, "SUN", "#7c2d12", "#f59e0b")}
        ${svgBtn(142, 440, 78, 32, "MERCURY", "#0f172a", "#64748b")}
        ${svgBtn(228, 440, 78, 32, "VENUS", "#0f172a", "#64748b")}
        ${svgBtn(314, 440, 78, 32, "EARTH", "#1e3a8a", "#38bdf8")}
        ${svgBtn(400, 440, 78, 32, "MARS", "#0f172a", "#64748b")}
        ${svgBtn(486, 440, 78, 32, "JUPITER", "#0f172a", "#64748b")}
        ${svgBtn(572, 440, 78, 32, "SATURN", "#0f172a", "#64748b")}
      `),
      steps: [
        {
          id: "planet_strip",
          title: "Planet Selector Strip",
          what: "Click any planet to smoothly fly the camera to it.",
          press: ["Click Planet"],
          x: 44, y: 91, lx: 34, ly: 70,
          domSelector: "#ss-strip"
        },
        {
          id: "orbit_view",
          title: "3D Orrery Camera",
          what: "Drag to tilt orbital plane and scroll to zoom from Sun to Kuiper belt.",
          press: ["Drag", "Scroll"],
          x: 42, y: 46, lx: 24, ly: 26
        },
        {
          id: "dossier",
          title: "Planetary Dossier",
          what: "Read AU distance, orbital period, gravity, and mission notes.",
          press: ["Select Planet"],
          x: 84, y: 34, lx: 80, ly: 60,
          domSelector: "#ss-dossier"
        },
        {
          id: "warp",
          title: "Orbital Time Warp",
          what: "Speed up or pause planetary orbital motion.",
          press: ["Click SPEED"],
          x: 78, y: 6.5, lx: 76, ly: 18,
          domSelector: "#ss-actions"
        }
      ]
    },
    {
      id: "cubesat_deploy",
      name: "CubeSat ISS Deployment",
      badge: "J-SSOD DEPLOY",
      subtitle: "Follow the 4-step ISS Kibo deployment procedure from grapple to orbital release.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <!-- Earth & Deployer Visual -->
        <ellipse cx="400" cy="360" rx="340" ry="110" fill="#0d3b66" opacity="0.65"/>
        <rect x="270" y="185" width="90" height="54" rx="4" fill="#cbd5e1" stroke="#38bdf8" stroke-width="2"/>
        <rect x="415" y="196" width="44" height="34" rx="3" fill="#facc15" stroke="#fde047" stroke-width="2"/>
        <line x1="365" y1="212" x2="410" y2="212" stroke="#4ade80" stroke-width="2.5" stroke-dasharray="5 3"/>
        <!-- Top Tag -->
        ${svgPanel(18, 14, 764, 38, "rgba(8,13,25,0.92)", "#38bdf8")}
        <text x="34" y="38" fill="#4ade80" font-family="monospace" font-size="11" font-weight="800">KIBO J-SSOD // CUBESAT DEPLOYMENT</text>
        <!-- Left Procedure Checklist -->
        ${svgPanel(18, 68, 224, 188, "rgba(8,13,25,0.9)", "#334155")}
        <text x="34" y="92" fill="#facc15" font-family="monospace" font-size="10" font-weight="800">PROCEDURE STEPS</text>
        <text x="34" y="118" fill="#4ade80" font-family="monospace" font-size="10">[OK] 1. AIRLOCK TRANSFER</text>
        <text x="34" y="140" fill="#38bdf8" font-family="monospace" font-size="10">[>>] 2. GRAPPLE MPEP</text>
        <text x="34" y="162" fill="#94a3b8" font-family="monospace" font-size="10">[  ] 3. AIM 45° AFT-NADIR</text>
        <text x="34" y="184" fill="#94a3b8" font-family="monospace" font-size="10">[  ] 4. SPRING RELEASE</text>
        <!-- Bottom Control Dock -->
        ${svgPanel(90, 424, 620, 60, "rgba(8,13,25,0.94)", "#38bdf8")}
        ${svgBtn(108, 438, 128, 32, "NEXT STEP [SPACE]", "#064e3b", "#4ade80")}
        ${svgBtn(246, 438, 118, 32, "CAM: ARM / SAT", "#0f172a", "#38bdf8")}
        ${svgBtn(374, 438, 112, 32, "BRIEF [B]", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(496, 438, 100, 32, "LEAVE [ESC]", "#450a0a", "#ef4444", "#fecaca")}
      `),
      steps: [
        {
          id: "proc",
          title: "Procedure Checklist",
          what: "Tracks the 4-stage Kibo J-SSOD deployment sequence.",
          press: ["Follow Order"],
          x: 16, y: 30, lx: 46, ly: 24,
          domSelector: "#dh-proc"
        },
        {
          id: "next_step",
          title: "Execute Next Step",
          what: "Trigger arm grapple, orientation, or spring deployment.",
          press: ["SPACE", "Click NEXT"],
          x: 21, y: 90, lx: 22, ly: 68,
          domSelector: "#dh-ctl"
        },
        {
          id: "cam_brief",
          title: "Camera & Mission Brief",
          what: "Switch camera angles or read engineering constraints.",
          press: ["Click CAM", "B"],
          x: 50, y: 90, lx: 54, ly: 68
        },
        {
          id: "leave_dep",
          title: "Proceed / Leave",
          what: "Transition to CubeSat Ground Coverage simulator after release.",
          press: ["ESC", "Click LEAVE"],
          x: 68, y: 90, lx: 78, ly: 68
        }
      ]
    },
    {
      id: "cubesat_coverage",
      name: "CubeSat Ground Coverage",
      badge: "LINK & PASSES",
      subtitle: "Place ground stations on Earth, track satellite passes, and optimize link coverage.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        <!-- Earth Globe with Swath -->
        <circle cx="400" cy="245" r="145" fill="#0f3460" stroke="#38bdf8" stroke-width="1.5"/>
        <ellipse cx="400" cy="245" rx="175" ry="52" fill="none" stroke="#4ade80" stroke-width="2" transform="rotate(-24 400 245)"/>
        <circle cx="355" cy="215" r="6" fill="#facc15"/>
        <circle cx="465" cy="270" r="6" fill="#4ade80"/>
        <!-- Top Now / Next Bar -->
        ${svgPanel(18, 14, 340, 54, "rgba(8,13,25,0.92)", "#38bdf8")}
        <text x="34" y="36" fill="#4ade80" font-family="monospace" font-size="11" font-weight="800">LINK: ACTIVE · ELEV 42° · 18.4 dB</text>
        <text x="34" y="54" fill="#94a3b8" font-family="monospace" font-size="10">NEXT PASS: SVALBARD IN 04:12</text>
        <!-- Bottom Control Dock -->
        ${svgPanel(90, 424, 620, 60, "rgba(8,13,25,0.94)", "#38bdf8")}
        ${svgBtn(106, 438, 108, 32, "DROP PIN [P]", "#064e3b", "#4ade80")}
        ${svgBtn(222, 438, 108, 32, "WARP 10x [>]", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(338, 438, 108, 32, "ORBIT EDIT", "#0f172a", "#38bdf8")}
        ${svgBtn(454, 438, 108, 32, "DATA [F3]", "#0f172a", "#38bdf8")}
        ${svgBtn(570, 438, 56, 32, "? HELP", "#0f172a", "#facc15", "#fde047")}
      `),
      steps: [
        {
          id: "globe_pins",
          title: "Globe & Ground Stations",
          what: "Rotate Earth and click to place ground station receiver pins.",
          press: ["Drag Globe", "Click / P"],
          x: 46, y: 45, lx: 76, ly: 32
        },
        {
          id: "now_next",
          title: "Live Pass Telemetry",
          what: "View active antenna elevation, SNR, and countdown to next pass.",
          press: ["Monitor Bar"],
          x: 22, y: 8, lx: 26, ly: 26,
          domSelector: "#cv-now"
        },
        {
          id: "warp_edit",
          title: "Time Warp & Orbit Edit",
          what: "Accelerate orbital passes or tune altitude/inclination.",
          press: ["Click WARP", "Click EDIT"],
          x: 41, y: 90, lx: 38, ly: 70,
          domSelector: "#cv-ctl"
        },
        {
          id: "data_help",
          title: "Link Data & Help",
          what: "Open contact budget tables or toggle overlay help.",
          press: ["F3", "Click ?"],
          x: 68, y: 90, lx: 74, ly: 70,
          domSelector: "#cv-data"
        }
      ]
    },
    {
      id: "artemis_expedition",
      name: "Artemis Lunar Expedition",
      badge: "LUNAR ROVER & EVA",
      subtitle: "Drive the Lunar Rover or walk in EVA to sample craters and deploy beacons.",
      renderScreenshot: () => svgFrame("url(#ft-lunar)", `
        <!-- Lunar Craters & Lander -->
        <ellipse cx="400" cy="400" rx="340" ry="60" fill="#333945"/>
        <ellipse cx="520" cy="360" rx="52" ry="18" fill="#1f242e" stroke="#64748b"/>
        <rect x="260" y="250" width="44" height="58" rx="4" fill="#e2e8f0" stroke="#facc15"/>
        <!-- Top-left Status & Top-right Actions -->
        ${svgPanel(18, 14, 270, 56, "rgba(8,13,25,0.9)", "#facc15")}
        <text x="34" y="36" fill="#facc15" font-family="monospace" font-size="11" font-weight="800">LUNAR SOUTH POLE // EVA-1</text>
        <text x="34" y="54" fill="#cbd5e1" font-family="monospace" font-size="10">O2 94% · SAMPLES: 2 / 5</text>
        ${svgBtn(576, 20, 96, 26, "BRIEF [B]", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(680, 20, 44, 26, "? HELP", "#0f172a", "#38bdf8")}
        ${svgBtn(732, 20, 52, 26, "EXIT", "#450a0a", "#ef4444", "#fecaca")}
        <!-- Bottom Controls -->
        ${svgPanel(140, 424, 520, 60, "rgba(8,13,25,0.94)", "#facc15")}
        ${svgBtn(156, 438, 118, 32, "MOVE [W A S D]", "#0f172a", "#38bdf8")}
        ${svgBtn(284, 438, 118, 32, "ROVER [R]", "#0f172a", "#facc15", "#fde047")}
        ${svgBtn(412, 438, 118, 32, "SAMPLE [E]", "#064e3b", "#4ade80")}
        ${svgBtn(540, 438, 104, 32, "JUMP [SPACE]", "#0f172a", "#94a3b8")}
      `),
      steps: [
        {
          id: "eva_move",
          title: "EVA Walk & Jump",
          what: "Traverse low-gravity lunar regolith and hop over crater rims.",
          press: ["W A S D", "SPACE"],
          x: 27, y: 90, lx: 22, ly: 68
        },
        {
          id: "rover",
          title: "Board / Drive Rover",
          what: "Enter or exit the pressurized Lunar Terrain Vehicle.",
          press: ["R", "W A S D"],
          x: 43, y: 90, lx: 46, ly: 68
        },
        {
          id: "sample",
          title: "Collect Core Samples",
          what: "Extract ice/regolith cores at glowing crater waypoints.",
          press: ["E"],
          x: 59, y: 90, lx: 70, ly: 68
        },
        {
          id: "art_help",
          title: "Mission Brief & Exit",
          what: "Open Artemis objectives brief or return to Title/Station.",
          press: ["B", "Click EXIT"],
          x: 84, y: 6.5, lx: 78, ly: 24,
          domSelector: ".art-top-right"
        }
      ]
    },
    {
      id: "csa_nasa_lab",
      name: "Space Labs & Simulators",
      badge: "TRAINING LABS",
      subtitle: "Run Canadarm2 robotics, life-support, and orbital mechanics training sims.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        ${svgPanel(48, 28, 704, 444, "rgba(9,14,27,0.96)", "#a78bfa")}
        <text x="72" y="60" fill="#ddd6fe" font-family="monospace" font-size="12" font-weight="800">SPACE LABS // SIMULATION SUITE</text>
        ${svgBtn(678, 42, 54, 26, "CLOSE", "#450a0a", "#ef4444", "#fecaca")}
        <!-- Lab Tabs -->
        ${svgBtn(72, 82, 152, 28, "CANADARM2", "#3b0764", "#a78bfa")}
        ${svgBtn(234, 82, 152, 28, "ECLSS O2 LAB", "#0f172a", "#475569")}
        ${svgBtn(396, 82, 152, 28, "ORBITAL DELTA-V", "#0f172a", "#475569")}
        ${svgBtn(558, 82, 174, 28, "RADIATION SHIELD", "#0f172a", "#475569")}
        <!-- Interactive Lab Canvas -->
        ${svgPanel(72, 126, 660, 320, "rgba(15,23,42,0.88)", "#334155")}
        <line x1="190" y1="330" x2="340" y2="210" stroke="#cbd5e1" stroke-width="8" stroke-linecap="round"/>
        <line x1="340" y1="210" x2="490" y2="260" stroke="#38bdf8" stroke-width="7" stroke-linecap="round"/>
        <circle cx="490" cy="260" r="14" fill="none" stroke="#facc15" stroke-width="2.5"/>
        ${svgBtn(96, 396, 170, 32, "JOINT SLIDERS", "#0f172a", "#a78bfa")}
        ${svgBtn(278, 396, 170, 32, "RUN SIMULATION", "#064e3b", "#4ade80")}
        ${svgBtn(460, 396, 120, 32, "RESET", "#0f172a", "#64748b")}
      `),
      steps: [
        {
          id: "lab_tabs",
          title: "Simulator Module Tabs",
          what: "Switch between Robotics, ECLSS, Delta-V, and Radiation labs.",
          press: ["Click Tab"],
          x: 34, y: 19, lx: 34, ly: 8,
          domSelector: "#csa-nasa-lab-tabs"
        },
        {
          id: "lab_controls",
          title: "Interactive Parameters",
          what: "Drag joint angles, valve settings, or burn parameters.",
          press: ["Drag / Click"],
          x: 23, y: 82, lx: 22, ly: 62,
          domSelector: "#csa-nasa-lab-body"
        },
        {
          id: "lab_run",
          title: "Run & Verify Sim",
          what: "Execute the test run and check pass/fail engineering metrics.",
          press: ["Click RUN"],
          x: 45, y: 82, lx: 56, ly: 62
        },
        {
          id: "lab_close",
          title: "Exit Space Labs",
          what: "Close simulator modal and return to Title Screen.",
          press: ["ESC", "Click CLOSE"],
          x: 88, y: 11, lx: 82, ly: 24,
          domSelector: "#btn-close-csa-nasa-lab"
        }
      ]
    },
    {
      id: "lcc_console",
      name: "Earth Control (LCC Room 4)",
      badge: "FIRING ROOM OPS",
      subtitle: "Monitor live Shuttle telemetry, answer Go/No-Go launch polls, and message flight crew.",
      renderScreenshot: () => svgFrame("url(#ft-space)", `
        ${svgPanel(32, 22, 736, 456, "rgba(7,12,24,0.96)", "#38bdf8")}
        <text x="54" y="52" fill="#93c5fd" font-family="monospace" font-size="11" font-weight="800">EARTH CONTROL CENTER · ROOM 4 · LAUNCH DIRECTOR</text>
        ${svgBtn(460, 34, 88, 24, "3D LINK", "#064e3b", "#4ade80")}
        ${svgBtn(556, 34, 92, 24, "CREW COMMS", "#0f172a", "#38bdf8")}
        ${svgBtn(656, 34, 92, 24, "CLOSE [F2]", "#450a0a", "#ef4444", "#fecaca")}
        <!-- Left Telemetry Tabs -->
        ${svgPanel(54, 78, 380, 260, "rgba(15,23,42,0.88)", "#334155")}
        ${svgBtn(68, 92, 72, 24, "FLIGHT", "#1e3a8a", "#38bdf8")}
        ${svgBtn(146, 92, 78, 24, "SYSTEMS", "#0f172a", "#475569")}
        ${svgBtn(230, 92, 72, 24, "CREW", "#0f172a", "#475569")}
        <text x="70" y="148" fill="#4ade80" font-family="monospace" font-size="11">ALTITUDE: 184.2 KM · MACH 14.2</text>
        <text x="70" y="172" fill="#e2e8f0" font-family="monospace" font-size="10">DOWNLINK: 15 PACKETS / SEC</text>
        ${svgBtn(68, 290, 170, 32, "GMAT COAST FORECAST", "#0f172a", "#a78bfa")}
        ${svgBtn(248, 290, 170, 32, "FAST FORWARD", "#0f172a", "#facc15", "#fde047")}
        <!-- Right Comms & Go/No-Go -->
        ${svgPanel(450, 78, 296, 260, "rgba(15,23,42,0.88)", "#334155")}
        <text x="466" y="102" fill="#38bdf8" font-family="monospace" font-size="11" font-weight="700">FLIGHT CREW MESSAGES</text>
        <rect x="466" y="252" width="194" height="30" rx="5" fill="#090d16" stroke="#475569"/>
        ${svgBtn(666, 252, 64, 30, "SEND", "#0369a1", "#38bdf8")}
        <!-- Bottom Launch Clearance -->
        ${svgPanel(54, 356, 692, 102, "rgba(15,23,42,0.9)", "#4ade80")}
        ${svgBtn(72, 376, 220, 44, "GO FOR LIFTOFF CLEARANCE", "#14532d", "#4ade80", "#dcfce7")}
        ${svgBtn(306, 376, 190, 44, "PING STATION ROOM", "#0f172a", "#38bdf8")}
        ${svgBtn(510, 376, 218, 44, "SKIP STAGE / ADVANCE", "#7c2d12", "#f59e0b", "#fef3c7")}
      `),
      steps: [
        {
          id: "lcc_telem",
          title: "Live Telemetry & GMAT",
          what: "Inspect real-time downlink tabs and run GMAT coast predictions.",
          press: ["Click Tab", "Click GMAT"],
          x: 24, y: 21, lx: 24, ly: 48,
          domSelector: "#lcc-shuttle-telemetry-tabs"
        },
        {
          id: "lcc_go",
          title: "Go / No-Go Liftoff Clearance",
          what: "Grant Earth Control clearance when the flight crew polls for launch.",
          press: ["Click GO FOR LIFTOFF"],
          x: 23, y: 80, lx: 24, ly: 66
        },
        {
          id: "lcc_comms",
          title: "Crew Messages & 3D Link",
          what: "Send text directives or toggle the live 3D cabin link.",
          press: ["Type + Enter", "Click 3D LINK"],
          x: 76, y: 53, lx: 78, ly: 32,
          domSelector: "#lcc-console-message-input"
        },
        {
          id: "lcc_close",
          title: "Toggle Console",
          what: "Open or close the Firing Room console anytime.",
          press: ["F2", "Click CLOSE"],
          x: 88, y: 9, lx: 84, ly: 20,
          domSelector: "#btn-sc-lcc-console"
        }
      ]
    }
  ];

  class FeatureTutorialManager {
    constructor() {
      this.modal = null;
      this.currentFeatureId = FEATURES[0].id;
      this.mode = "all"; // "all" | "step"
      this.activeStepIndex = 0;
      this._pulsedEl = null;
      this._bound = false;
    }

    getFeatureIds() {
      return FEATURES.map((f) => f.id);
    }

    getFeature(id) {
      return FEATURES.find((f) => f.id === id) || FEATURES[0];
    }

    isOpen() {
      return !!(this.modal && this.modal.classList.contains("is-open"));
    }

    init() {
      if (this._bound) return;
      this._bound = true;

      // Delegated click listener for all [data-feature-help] buttons across static & dynamic HUDs
      document.addEventListener("click", (ev) => {
        const trigger = ev.target && ev.target.closest ? ev.target.closest("[data-feature-help]") : null;
        if (!trigger) return;
        ev.preventDefault();
        ev.stopPropagation();
        const featureId = trigger.getAttribute("data-feature-help");
        this.open(featureId);
      });

      document.addEventListener("keydown", (ev) => {
        if (!this.isOpen()) return;
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          this.close();
        } else if (ev.key === "ArrowRight") {
          ev.preventDefault();
          this.nextStep();
        } else if (ev.key === "ArrowLeft") {
          ev.preventDefault();
          this.prevStep();
        }
      }, true);
    }

    _ensureModal() {
      if (this.modal) return this.modal;
      const modal = document.createElement("div");
      modal.id = "modal-feature-tutorial";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "ft-modal-title");
      modal.innerHTML = `
        <div class="ft-dialog">
          <div class="ft-header">
            <div class="ft-title-group">
              <span class="ft-badge" id="ft-badge">TUTORIAL</span>
              <div>
                <h2 class="ft-title" id="ft-modal-title">Feature Guide</h2>
                <p class="ft-subtitle" id="ft-modal-subtitle"></p>
              </div>
            </div>
            <div class="ft-header-actions">
              <select class="ft-select" id="ft-feature-select" aria-label="Choose interactive feature">
                ${FEATURES.map((f) => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}
              </select>
              <div class="ft-mode-toggle" role="group" aria-label="Annotation display mode">
                <button type="button" class="ft-mode-btn is-active" id="ft-mode-all">ALL LABELS</button>
                <button type="button" class="ft-mode-btn" id="ft-mode-step">STEP-BY-STEP</button>
              </div>
              <button type="button" class="ft-close-btn" id="ft-close-btn">CLOSE [ESC]</button>
            </div>
          </div>
          <div class="ft-body">
            <div class="ft-stage-wrap">
              <div class="ft-stage" id="ft-stage">
                <div class="ft-screenshot-layer" id="ft-screenshot-layer"></div>
                <svg class="ft-overlay-svg" id="ft-overlay-svg" viewBox="0 0 800 500" preserveAspectRatio="none"></svg>
                <div id="ft-pins-layer"></div>
              </div>
            </div>
            <aside class="ft-sidebar">
              <div class="ft-sidebar-head">
                <span>CONTROLS &amp; SHORTCUTS</span>
                <span id="ft-control-count">0 ITEMS</span>
              </div>
              <div class="ft-step-list" id="ft-step-list"></div>
              <div class="ft-footer">
                <button type="button" class="ft-nav-btn" id="ft-prev-btn">← PREV</button>
                <span class="ft-step-counter" id="ft-step-counter">ALL</span>
                <button type="button" class="ft-nav-btn" id="ft-next-btn">NEXT →</button>
              </div>
            </aside>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.modal = modal;

      modal.addEventListener("click", (ev) => {
        if (ev.target === modal) this.close();
      });

      modal.querySelector("#ft-close-btn").addEventListener("click", () => this.close());
      modal.querySelector("#ft-feature-select").addEventListener("change", (ev) => {
        this.open(ev.target.value);
      });
      modal.querySelector("#ft-mode-all").addEventListener("click", () => {
        this.mode = "all";
        this._render();
      });
      modal.querySelector("#ft-mode-step").addEventListener("click", () => {
        this.mode = "step";
        this._render();
      });
      modal.querySelector("#ft-prev-btn").addEventListener("click", () => this.prevStep());
      modal.querySelector("#ft-next-btn").addEventListener("click", () => this.nextStep());

      return modal;
    }

    open(featureId) {
      this._ensureModal();
      const feat = this.getFeature(featureId || this.currentFeatureId);
      this.currentFeatureId = feat.id;
      this.activeStepIndex = 0;
      this.modal.classList.add("is-open");
      if (window.spaceAudio && typeof window.spaceAudio.playClick === "function") {
        window.spaceAudio.playClick();
      }
      this._render();
    }

    close() {
      this._clearLivePulse();
      if (this.modal) this.modal.classList.remove("is-open");
    }

    prevStep() {
      const feat = this.getFeature(this.currentFeatureId);
      if (this.mode !== "step") this.mode = "step";
      this.activeStepIndex = (this.activeStepIndex - 1 + feat.steps.length) % feat.steps.length;
      this._render();
    }

    nextStep() {
      const feat = this.getFeature(this.currentFeatureId);
      if (this.mode !== "step") this.mode = "step";
      this.activeStepIndex = (this.activeStepIndex + 1) % feat.steps.length;
      this._render();
    }

    _selectStep(index, switchToStepMode) {
      this.activeStepIndex = index;
      if (switchToStepMode) this.mode = "step";
      this._syncHighlight();
    }

    _clearLivePulse() {
      if (this._pulsedEl) {
        this._pulsedEl.classList.remove("ft-live-target-pulse");
        this._pulsedEl = null;
      }
    }

    _syncLivePulse(step) {
      this._clearLivePulse();
      if (!step || !step.domSelector) return;
      const el = document.querySelector(step.domSelector);
      if (el && el.offsetParent !== null) {
        el.classList.add("ft-live-target-pulse");
        this._pulsedEl = el;
      }
    }

    _render() {
      if (!this.modal) return;
      const feat = this.getFeature(this.currentFeatureId);
      const select = this.modal.querySelector("#ft-feature-select");
      if (select) select.value = feat.id;

      this.modal.querySelector("#ft-badge").textContent = feat.badge;
      this.modal.querySelector("#ft-modal-title").textContent = feat.name;
      this.modal.querySelector("#ft-modal-subtitle").textContent = feat.subtitle;
      this.modal.querySelector("#ft-control-count").textContent = `${feat.steps.length} CONTROLS`;

      this.modal.querySelector("#ft-mode-all").classList.toggle("is-active", this.mode === "all");
      this.modal.querySelector("#ft-mode-step").classList.toggle("is-active", this.mode === "step");

      // 1. Screenshot Backdrop
      this.modal.querySelector("#ft-screenshot-layer").innerHTML = feat.renderScreenshot();

      // 2. Leader Lines SVG (800x500 coordinate space)
      const svg = this.modal.querySelector("#ft-overlay-svg");
      svg.innerHTML = feat.steps.map((s, idx) => {
        const tx = (s.x / 100) * 800;
        const ty = (s.y / 100) * 500;
        const lx = (s.lx / 100) * 800;
        const ly = (s.ly / 100) * 500;
        const midX = tx + (lx - tx) * 0.45;
        const pathD = `M ${tx.toFixed(1)} ${ty.toFixed(1)} L ${midX.toFixed(1)} ${ly.toFixed(1)} L ${lx.toFixed(1)} ${ly.toFixed(1)}`;
        return `
          <path class="ft-leader-halo" data-step-idx="${idx}" d="${pathD}"/>
          <path class="ft-leader-line" data-step-idx="${idx}" d="${pathD}"/>
          <circle class="ft-leader-dot" data-step-idx="${idx}" cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="4.5"/>
        `;
      }).join("");

      // 3. Pins + Callout Boxes
      const pinsLayer = this.modal.querySelector("#ft-pins-layer");
      pinsLayer.innerHTML = feat.steps.map((s, idx) => {
        const kbdHtml = s.press.map((k) => `<span class="ft-kbd">${esc(k)}</span>`).join("");
        return `
          <button type="button" class="ft-pin" data-step-idx="${idx}" style="left:${s.x}%;top:${s.y}%;" title="${esc(s.title)}">${idx + 1}</button>
          <div class="ft-callout" data-step-idx="${idx}" style="left:${s.lx}%;top:${s.ly}%;">
            <div class="ft-callout-top">
              <span class="ft-callout-num">${idx + 1}</span>
              <span class="ft-callout-title">${esc(s.title)}</span>
            </div>
            <div class="ft-callout-desc">${esc(s.what)}</div>
            <div class="ft-callout-press">PRESS: ${kbdHtml}</div>
          </div>
        `;
      }).join("");

      // 4. Sidebar List
      const listEl = this.modal.querySelector("#ft-step-list");
      listEl.innerHTML = feat.steps.map((s, idx) => {
        const kbdHtml = s.press.map((k) => `<span class="ft-kbd">${esc(k)}</span>`).join("");
        return `
          <button type="button" class="ft-step-item" data-step-idx="${idx}">
            <div class="ft-step-item-head">
              <span class="ft-step-item-name">
                <span class="ft-step-item-num">${idx + 1}</span>
                <span>${esc(s.title)}</span>
              </span>
            </div>
            <div class="ft-step-item-desc">${esc(s.what)}</div>
            <div class="ft-step-item-press">PRESS: ${kbdHtml}</div>
          </button>
        `;
      }).join("");

      // Bind hover & click across pins, callouts, and sidebar items
      this.modal.querySelectorAll("[data-step-idx]").forEach((el) => {
        if (el.tagName === "path" || el.tagName === "circle") return;
        const idx = Number(el.getAttribute("data-step-idx"));
        el.addEventListener("mouseenter", () => {
          if (this.mode === "all") {
            this.activeStepIndex = idx;
            this._syncHighlight();
          }
        });
        el.addEventListener("click", () => {
          this._selectStep(idx, false);
        });
      });

      this._syncHighlight();
    }

    _syncHighlight() {
      if (!this.modal) return;
      const feat = this.getFeature(this.currentFeatureId);
      const isStep = this.mode === "step";
      const activeIdx = this.activeStepIndex;

      this.modal.querySelector("#ft-step-counter").textContent = isStep
        ? `STEP ${activeIdx + 1} / ${feat.steps.length}`
        : `ALL ${feat.steps.length} LABELS`;

      this.modal.querySelectorAll(".ft-pin, .ft-callout, .ft-leader-line, .ft-leader-halo, .ft-leader-dot, .ft-step-item").forEach((el) => {
        const idx = Number(el.getAttribute("data-step-idx"));
        const isActive = idx === activeIdx;
        el.classList.toggle("is-active", isActive);
        if (isStep) {
          el.classList.toggle("is-hidden", !isActive && !el.classList.contains("ft-step-item"));
          el.classList.remove("is-dimmed");
        } else {
          el.classList.remove("is-hidden");
          el.classList.remove("is-dimmed");
        }
      });

      this._syncLivePulse(feat.steps[activeIdx]);
    }
  }

  const instance = new FeatureTutorialManager();
  window.featureTutorial = instance;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => instance.init());
  } else {
    instance.init();
  }
})(window, document);
