# NASA Space Apps Challenge — Mission Design Game Readiness Audit

_Updated: 2026-11-14_

Lunaspis / Interfellas is already a strong fit for the **2026 NASA Space Apps Challenge — Space Mission Design Game** brief. The core loop is present: choose a mission scenario, design a spacecraft across six connected subsystems, launch and fly the mission, complete station objectives, and review a scored engineering debrief.

This audit maps the brief to the current build, documents the beginner-onboarding work added in this pass, and lists the remaining gaps in priority order.

---

## 1. Requirement Coverage

| Brief requirement | Status | Where it lives | Notes |
|---|---|---|---|
| Interactive game covering design, management and simulation | **Strong** | `server.js`, `public/js/game/gameplay.js`, `public/js/game/main.js`, `public/js/world/space_center.js`, `public/js/world/docking_simulator.js`, `public/js/world/ship_interior.js` | Full loop from gantry boarding → launch → docking → station consoles → full mission simulation/debrief. |
| Solo play | **Strong** | `ENTER MISSION`, `network.js#startSolo`, server `create_room` with `solo:true` | Private solo room, auto-starts immediately, cannot be joined by code. |
| Team play up to four participants | **Partial** | `server.js` `MAX_PLAYERS = 6`, lobby crew manifest, randomized roles | Supports crews up to six, which exceeds the brief. A four-seat “Challenge Crew” preset is not yet exposed. |
| Role responsibilities | **Strong** | `public/js/core/network.js` role metadata, `public/js/game/main.js` lobby/roster, `gameplay.js` console duty strip | Ground Control (Flight Director, CAPCOM) and Flight Crew (Commander, Engineer, Scientist, Specialist). Roles can be randomized/swapped. |
| Define mission objective, requirements, spacecraft, instruments, launcher, orbit | **Strong** | `gameplay.js`: `MISSION_SCENARIOS`, `ORBIT_OPTIONS`, `LAUNCH_VEHICLES`, `SPACECRAFT_BUSES`, `POWER_SYSTEMS`, `SCIENTIFIC_INSTRUMENTS`, `THERMAL_RADIATION_PACKAGES`, `COMMS_PACKAGES`, `PROPULSION_SYSTEMS`; pre-flight MDL desk | Six scenarios: lunar south pole, Earth climate, asteroid rendezvous, L2 telescope, CubeSat, sandbox. |
| Budget, mass, power, communications, data, lifetime constraints | **Strong** | `gameplay.js#evaluateMissionDesign`, `_renderResourceMeters`, `_renderLiveTradeoffStrip` | Live solver covers cost cap, wet mass vs launcher, solar generation + eclipse DoD, data generation vs downlink, link margin, ΔV, disposal and lifetime. |
| Consequences and trade-offs; multiple valid solutions | **Strong** | `evaluateMissionDesign`, `applyRecommendedScenarioBaseline`, Option A trade delta, risk matrix | Heavier instruments increase mass/power/data/cost; higher orbits reduce launcher capacity; ion propulsion trades power for ΔV efficiency. |
| Clear UI, mission configuration, resource management mechanisms | **Strong** | Title screen, staging deck, pre-flight MDL desk, seven station consoles, live resource strip | New **Mission Academy** adds a beginner layer without changing the expert flow. |
| Simulation and evaluation; performance feedback | **Strong** | Launch cutscene, docking simulator, station interior, `gameplay.js` evaluation, CML framework, victory debrief | Science 45% + Engineering 55%; CML 1–4; Launch/Space/Ground/User segment gates; objective completion. |
| Difficulty levels | **Strong** | `DIFFICULTY_LEVELS` in `gameplay.js`; lobby difficulty pills | Cadet (+25% budget, forgiving margins), Systems Engineer (baseline), Flight Director (−12% budget, strict margins). |
| Multiple mission types/scenarios | **Strong** | `MISSION_SCENARIOS`, `MISSION_CATALOG` | Six mission profiles including a sandbox. |
| Random events / unexpected constraints | **Partial** | `server.js` room state has a `crisis` slot (`reactor_meltdown`, `hull_breach`, `meteor_storm`) | State plumbing exists, but no active random-event trigger was found in the runtime. |
| Mission dashboard with real-time resources | **Strong** | `#lunaspis-resource-meters`, `_renderResourceMeters`, live trade-off strip | Budget, mass, power, comms/data, ΔV and science are visible while editing. |
| Interactive spacecraft / 3D visualizations | **Strong** | MDL point-design preview, 3D hangar, ISS showcase `[J]`, mission viz `[U]`, solar atlas `[O]`, VR modes | Uses GLB models and procedural 3D previews. |
| Post-mission analysis and reports | **Strong** | Victory/debrief overlay in `gameplay.js`, mission briefing/debrief, MDL JSON export | Includes duration, objectives, score, analogue mission, EoM disposal, crew manifest and per-player stats. |
| Save, share and compare designs | **Partial** | Option A snapshot + live trade delta; `EXPORT POINT DESIGN (.JSON)` | In-session A/B comparison and JSON export exist. No persistent design library, share link, or import flow. |
| Leaderboards / rankings | **Partial** | `GET /api/leaderboard`, `server/db.js#getTopAstronauts` | Backend endpoint exists but no UI consumes it. The current build also strips the auth UI, so rankings would be guest-only unless sign-in is restored. |
| Sandbox mode | **Strong** | `MISSION_SCENARIOS.sandbox`, open budget | Selectable in the staging deck and design console. |
| Tutorials / plain-language explanations | **Strong (new)** | `public/js/game/mission_academy.js`, `public/css/academy.css`, briefing coach, console coach | Five-step first-flight wizard, trade-off cheat sheet, controls, role map, and contextual tips. |
| Export/share mission results | **Partial** | `EXPORT MDL (.JSON)` in design desk and debrief | JSON export works; no copyable share link or report image. |
| Accessibility for different knowledge levels | **Good** | Cadet difficulty, Mission Academy, resource tooltips, recommended baselines | More work can be done on keyboard-only flows and screen-reader labels. |

---

## 2. Beginner Onboarding Added

### First-run Mission Academy
- Opens automatically once for new pilots; can be reopened anytime with **F1**, the title-screen **MISSION ACADEMY** chip, or the in-game **GUIDE** button.
- Five steps: **Mission**, **Design**, **Trade-offs**, **Fly**, **Crew & Score**.
- Includes a plain-language resource grid, six-decision design flow, trade-off table, flight-phase walkthrough, controls, role map and scoring explanation.
- Can launch a private **Cadet** solo mission directly (`lunar_south_pole`, cadet difficulty, +25% budget).

### Contextual CADET COACH
- Every design console shows a plain-language tip explaining what the current station controls and what to watch.
- Quick actions: **Use Recommended Baseline**, **Open Guide**, **Hide Tips**.
- Tip preference is stored in `localStorage` (`lunaspis_cadet_tips_v1`) and can be toggled from the Academy.
- Resource meters now expose hover explanations for budget, mass, power, comms/data, ΔV and science.

### Staging deck and briefing
- Lobby shows the selected scenario’s trade-off tip and the selected difficulty explanation.
- Mission briefing shows a scenario-specific coach note and a direct link to the Academy.
- New pilots can still choose a host crew room; the Academy start button is hidden while in a room to avoid accidentally abandoning a crew.

---

## 3. Remaining Gaps (Priority Order)

1. **Persistent mission log + leaderboard UI** — store best score, scenario, difficulty, mass, cost and date locally; optionally sync to `/api/leaderboard` when auth is restored. Add a title-screen/debrief ranking panel.
2. **Shareable mission reports** — encode a completed run into a short URL or JSON download that can be imported for comparison.
3. **Random anomalies in the full simulation** — activate the existing crisis slot during `[LDR]` runs (solar storm, comms dropout, power fault) and show the trade-off/response.
4. **Four-seat Challenge Crew preset** — optional lobby mode that caps the crew at four and maps the six consoles onto four responsibilities; keeps the six-player sandbox as the extended mode.
5. **Design library / save-resume** — persist multiple named designs in `localStorage` and allow A/B/C comparison beyond the in-session Option A.
6. **Automated browser coverage for onboarding** — headless check that the Academy opens, advances through steps, launches a cadet mission, and that coach tips appear inside a console.
7. **Accessibility polish** — focus trap inside the Academy, ARIA labels on resource meters, and reduced-motion support.

---

## 4. Suggested Judge Demo (3 minutes)

1. Open the title screen → the **Mission Academy** appears (or press **F1**).
2. Advance to **Trade-offs**, then launch **START CADET MISSION**.
3. In the mission briefing, point out the scenario coach note and begin pre-flight.
4. Board, launch, dock, and open **HUB / CMD / PWR / SCI** consoles.
5. Show a **CADET COACH** tip, apply the recommended baseline, then change one instrument and watch the resource strip react.
6. Run the **LDR** full simulation and open the debrief with score, CML, segments and MDL export.

---

## 5. Verification Performed

- `node --check` on `server.js`, `network.js`, `gameplay.js`, `mission_academy.js`, `main.js` and `open_car.js`.
- Socket.IO integration: solo room creation, private-room join rejection, cadet scenario/difficulty persistence, game start, and crew room code join.
- Headless Chrome (SwiftShader): Academy auto-opens on first visit, all five steps render, HUD GUIDE opens it, cadet mission starts and closes the modal, `window.gameplay.missionDesign.difficultyId` becomes `cadet`, console coach HTML appears in the pre-flight MDL desk, and the guidance toggle works.
