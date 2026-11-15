# CubeSat Contact Coverage mission — DRAFT PLAN (2026-11-14)

**Status: planning only. Nothing in this document is implemented.** It supersedes the single-mode CubeSat draft written earlier on 2026-11-14 (kept in git history; summarized in [mission-spec](mission-spec.md#cubesat-contact-coverage-mission--draft-2026-11-14)). The co-op Shuttle crew mission stays as it is; this is a second, separate mission.

## Revision — user direction, 2026-11-14 (supersedes the X/Y parts below)

Audience: **CubeSat teams.** The two fixed X/Y markers were too limiting. Changes (user-confirmed; implemented):

1. **Stations on the globe.** In Stations mode [S] you click the globe to add a station, drag to move it, and click it to edit name, latitude/longitude, minimum elevation and enabled state. You can also paste a list ("name, lat, lon[, min elevation]", comma/tab/semicolon) and save/load "my stations" in the browser. The table editor still exists. Station-only edits keep the clock running; orbit, start time or window edits restart from T+0.
2. **Inspect anywhere, plus pins.** Hover any point on the ground track, orbit ring or timeline to see time, orbit number, position and every station in view (elevation, azimuth, range), or the next contact. Click (or press P, or shift-click the timeline) to pin the moment. Up to 20 named pins (A, B, C…) are shared in the session; tick any two to compare (retained / lost / new / came-and-went, and the next return to the first pin's orbit position). `scenario.markers {x,y}` became `scenario.pins [{id,name,t}]`.
3. **Coverage-coloured track.** The ground track and orbit ring are coloured by how many stations see the satellite at each point: rose 0, blue 1, green 2, yellow 3+. A legend explains it, and the hover inspector gives the exact count, so colour is not the only cue. [T] switches between ±1 orbit and the whole prediction window.
4. **Team results and CSV.** Per station: passes, passes/day, contact minutes/day, useful passes (peak ≥ an adjustable elevation, default 30°), average pass, longest and average gap between passes, best peak. Network row: contacts/day and contact min/day. EXPORT PASS SCHEDULE (CSV): station, start/end UTC, duration, max elevation and its time, start/end azimuth, clipping flags, with a header saying it is geometric visibility, not a radio schedule.

Everything else in this plan stands. Where the sections below say X/Y, read "pins".

Labels used below:
- **[CONFIRMED]**: stated by the user in the 2026-11-14 planning request.
- **[REC]**: recommended default or design choice. Adopted when the user approves this plan, open to change before then.
- **[DECIDE]**: needs a user yes/no before or during implementation. All are listed in [§10](#10-remaining-decisions).

Repository facts were checked on 2026-11-14 against the user's working copy. The source files on the PC matched the last delivered working copy by size. Only `CLAUDE.md`, `docs/mission-spec.md` and `docs/implementation-plan.md` differed, because they held the earlier CubeSat draft. `git status` could not be run on the PC from this session; recheck it before implementing.

---

## 1. Scope and definition of done

### 1.1 Confirmed scope [CONFIRMED]

Two modes in one mission:

1. **Sandbox**: one hypothetical CubeSat in an editable circular orbit plus an editable ground-station network.
2. **Real Satellite**: a selected real CubeSat propagated from published orbital data (CelesTrak GP/OMM + SGP4), with predicted access to catalog ground stations.

The mission answers coverage questions:
- At orbital position X, which stations are available, and how many?
- At a later position Y, which contacts are retained, lost or newly available?
- Which stations come next, when, and for how long?
- Where are the coverage gaps?
- How long is a revolution, and when does the satellite next reach the chosen orbital position?
- How do the answers change when the scenario changes?

The player starts directly in orbit. There is no launch and no Shuttle prerequisite.

**Contact available** means geometric access: the station is enabled, the satellite is above that station's minimum elevation, and the line of sight is not blocked by Earth. Compatible radios and an adequate link budget are assumed. The UI calls this **"in view"** or **"available"**, never "connected", "linked" or "downlinking". It shows this explanation once at the start of each mode, and it is in the glossary: *"Available = the satellite is above this station's minimum elevation. It does not mean a radio contact is scheduled or would succeed."*

Out of scope [CONFIRMED]: RF/link-budget engineering, station booking or scheduling, data downlink operations, spacecraft subsystem management, constellations.

### 1.2 Player journey

```
Title menu ─► Mission: [Shuttle crew] / [CubeSat coverage]
              │
              ▼ (CubeSat)
         Mode: [Sandbox] / [Real satellite]
              │
              ▼
   Scenario setup (preset loaded, editable, validated)
   ├─ Sandbox: orbit (altitude, inclination, track position, start phase, UTC start)
   ├─ Real: pick satellite → shows source / element epoch / data age
   ├─ Stations: preset network or catalog picker; per-station enable + min elevation
   └─ Prediction length
              │  [RUN]
              ▼
   Interactive simulation
   ├─ Globe: Earth rotating, satellite, orbit ring, ground track (past solid / future dotted),
   │         stations, footprint circle, contact lines to available stations only
   ├─ Clock (top centre): UTC, T+elapsed, Orbit #, playback rate
   ├─ NOW panel: available stations with elevation, distance, time left
   ├─ NEXT PASSES table: station, starts in, start/end UTC, duration, peak elevation
   ├─ Timeline (bottom): one row per station + NETWORK row + X/Y markers + playhead
   └─ Controls: pause, speeds, scrub, jump to next event, set X / set Y, replay from start
              │
              ▼
   X/Y inspection ─► compare panel (retained / lost / new) + "next time at X's position"
              │
              ▼
   Following revolutions (Earth keeps rotating; the sequence changes)
              │
              ▼
   Results (for the prediction window) ─► Save as A / B ─► A/B comparison
              │
              ▼
   Save / Load / Export JSON · Replay from start · Edit scenario · Exit to menu
```

### 1.3 Definition of done (whole mission)

The mission is done when all of the following have been observed in a real browser, with evidence recorded in `docs/progress.md`:

1. Both modes reach the interactive simulation from the title menu without the Shuttle mission. Real mode works fully offline from the bundled snapshot.
2. With the default sandbox scenario, the player can set X, advance to Y, read the retained/lost/new lists, see the next passes with countdowns, and watch at least two revolutions where the station sequence differs because Earth rotated.
3. Every number on screen (available stations, elevation, distance, time left, pass start/end/duration/peak, period, return-to-X countdown, results) comes from the same core module, and the automated checks in [§7](#7-acceptance-criteria-automated-checks-and-playtests) pass.
4. Changing playback speed does not change any prediction. Live status changes happen at the predicted times (to within one rendered frame of simulated time).
5. A/B comparison works for one sandbox change (for example altitude 550 → 800 km) and for one real-mode change (station network or element refresh), with both settings and both prediction windows shown.
6. Saved scenarios reload and reproduce identical pass lists, including real-mode runs with no network.
7. Invalid inputs, missing or stale data, empty station lists and no-pass windows each show a clear state with a way forward.
8. The shared session works for 2+ clients: same scenario and clock, edits only by the editor, independent cameras, identical results.
9. Shuttle regressions pass: `node tests/shuttle/run_checks.js` (61 checks) and the co-op browser run still end in WHEELS STOP. Switching Shuttle → CubeSat → Shuttle 10 times leaves no stale listeners or actors.

---

## 2. Inputs and outputs

### 2.1 Sandbox inputs [REC unless marked]

| Input | Control | Units | Default | Range / validation | Changes physical coverage? |
|---|---|---|---|---|---|
| Altitude (circular) | slider + number | km | **550** | 300–2000, integer. Below 300: "too low for a stable orbit in this simplified model". Above 2000 needs an "outside LEO" confirmation | **Yes**: period, footprint size, distance |
| Inclination | slider + presets 0 / 28.5 / 51.6 / 90 / 97.6 | deg | **51.6** | 0–180, step 0.1. Above 90 is labelled "retrograde (moves westward)" | **Yes**: how far north/south the track reaches |
| Track position | slider | deg E | **0** | −180 to 180, wraps. Means "longitude where the satellite crosses the equator heading north, at the start time" | **Yes**: shifts the ground track east/west relative to stations |
| Start phase | slider | deg | **0** | 0–360 (wraps). 0 = at that northbound equator crossing. 90 = a quarter orbit later (furthest north) | **Yes**: where along the orbit the run begins |
| UTC start | date-time input, UTC only | ISO 8601 | **current UTC, rounded down to the minute** when the scenario is created, then stored | 1990-01-01 to 2100-12-31 | **Timestamps only** (see 2.3) |
| Stations: name | text | — | preset names | 1–32 characters, unique, trimmed | No (label only) |
| Stations: latitude / longitude | numbers, or click on the globe | deg | preset | lat −90 to 90; lon −180 to 180 (wraps); finite | **Yes** |
| Stations: enabled | checkbox | — | on | — | **Yes** (disabled stations are excluded from all results) |
| Stations: minimum elevation | number / slider | deg | **10** | 0–60. Negative values are rejected (a negative mask would claim visibility below the horizon) | **Yes**: a higher mask means shorter or fewer passes |
| Station count | add / remove | — | 6 (preset) | 0–50 in sandbox. 0 is allowed and shows the empty state | Yes |
| Prediction length | segmented: 1 orbit · 3 orbits · 6 h · 24 h · 72 h | — | **24 h** | fixed choices | **No**: only how far ahead results are computed |
| X / Y markers | "Set X" / "Set Y" buttons at the playhead, or click on the timeline | time | unset | must lie inside the prediction window; Y may be before X (the compare panel says "Y is earlier than X") | **No**: observation only |
| Playback | pause, 1×, 10×, 60×, 300×, 1000×; scrub; jump to next event | — | **60×** | — | **No** (tested invariant) |
| Camera | drag / wheel / follow-satellite / Earth-fixed toggle | — | follow satellite | — | **No** |

Preset station network [REC]: six geographically spread hypothetical sites, labelled "hypothetical site near <city>" so they don't claim real antennas. Suggested set: Yangon, Svalbard, Cape Town, Santiago, Fairbanks, Perth. The default scenario and preset must be checked by calculation to include within 24 h at least one overlap (two or more stations at once), at least one blackout over 30 min, and a short low-elevation pass. If they don't, adjust the default track position and record why.

### 2.2 Real-mode inputs [REC]

| Input | Control | Default | Validation | Physical effect |
|---|---|---|---|---|
| Satellite | curated list (bundled) + "Catalog number" field + name search (server, cached) | first curated entry | NORAD catalog number 1–9 digits, because 6-digit numbers started on 2026-07-11. Name search needs at least 3 characters and is debounced 600 ms | Yes |
| Element set | fixed by the snapshot; explicit **Refresh elements** button | bundled/cached record | see [§4.4](#44-data-age-invalid-and-missing-data) | Yes |
| Start time | "Now" (default) or a UTC date-time | now, rounded down to the minute | warn when more than 3 days from the element epoch; refuse more than 30 days | Yes (SGP4 is time-dependent) |
| Stations | SatNOGS catalog picker (filters: Online only, region, name, nearest to a point) + the user's own stations | 8 Online catalog stations nearest the curated satellite's ground track at the start time, plus the 6 sandbox sites disabled | at most 50 enabled | Yes |
| Minimum elevation | per station | the station's catalog `min_horizon` if present and between 0 and 60°, otherwise 10° | 0–60 | Yes |
| Prediction length, X/Y, playback, camera | as in sandbox | as in sandbox | as in sandbox | as in sandbox |

The orbit cannot be edited in Real mode. Editing goes through **Copy to Sandbox** ([§4.6](#46-copy-to-sandbox)).

### 2.3 Which inputs change what

- **Physical coverage** (pass times, durations, station counts, gaps): altitude, inclination, track position, start phase, station positions, enabled stations, minimum elevations. In Real mode: satellite, element set and start time.
- **Observation only**: prediction length (how far ahead is computed), X/Y (what is compared), playback speed and scrubbing (how fast time is viewed), camera. None of these may change a computed pass.
- **UTC start in Sandbox.** The orbit is defined relative to Earth at the start time: track position is an Earth longitude. Changing only the date or time therefore moves the same geometry to new timestamps. Every pass shifts by exactly the change in start time, and durations, peaks and stations stay the same. The UI says this next to the field: *"Sandbox orbits are placed relative to Earth at the start time, so changing the date only changes the clock times."* Only the Sun lighting on the globe changes, which is display only. This is deliberate. It keeps sandbox experiments about geometry. Real-date effects belong to Real mode.
- **Equatorial orbits (inclination 0° or 180°).** There is no ascending node, so "track position" and "start phase" describe the same thing. The editor merges them into one **Start longitude** control and hides start phase (the stored values combine into λ = track position + start phase, prograde, or minus start phase, retrograde). The math in [§3.2](#32-sandbox-orbit-model) stays defined because it uses λ_node + u, so no special case is needed in the propagator. Within 0.01° of 0 or 180, the UI treats the orbit as equatorial.
- **CubeSat size, mass, power, frequency, weather, day/night** change nothing in a geometry-only model, so no controls are offered for them.

### 2.4 Outputs

| Output | Where | Definition / units |
|---|---|---|
| Available now | NOW panel + count badge | Enabled stations with elevation ≥ their mask. For each: name, elevation (°, 1 dp), slant range (km, integer), time left until loss (mm:ss, or "≥ hh:mm (window end)" when the pass runs past the window) |
| Next passes | table, sorted by start | Station, starts in (countdown), start UTC, end UTC, duration (mm:ss), peak elevation (°), peak UTC. Passes clipped by the window start or end are marked "◄ clipped" or "clipped ►", and their duration and peak read "≥" |
| No contacts | NOW panel | "No station in view" + "next: <station> in mm:ss", or "none in this prediction window (N h)". Never "never" |
| Timeline | bottom strip | per-station bars; NETWORK row = union; X/Y markers labelled `X · Orbit 2 · 14:32:10Z`; ascending equator crossings as ticks |
| Clock | top centre | UTC; T+hh:mm:ss since start; Orbit n; rate |
| Orbit info | DATA page (Tab/F3) | period (sandbox exact; real "≈", with source), altitude now, latitude/longitude now, speed, inclination, argument of latitude (orbit position °) |
| X/Y snapshot | compare panel | for each marker: UTC, T+, orbit #, orbit position (°), latitude/longitude, altitude, available stations with elevation/range |
| X→Y comparison | compare panel | Retained (in view at both), Lost (at X only), New (at Y only). Count of each, with names. Plus "passes that began and ended between X and Y" (a station can appear and disappear in between) |
| Return to X's position | compare panel + clock tooltip | Sandbox: next time the satellite reaches X's orbit position (exact). Real: estimated ([§3.5](#35-revolutions-phase-return-and-revisits)). Shown separately from the next pass at any station |
| Results | results screen | unique stations reached; per-station contact time (min:s) and pass count; network coverage % (union); total blackout time; longest blackout (with "≥" if it touches a window edge); peak simultaneous available stations and when; passes found; prediction window; mode; data source |
| A/B comparison | results screen | two columns: full settings (only changed rows highlighted with ▲/▼ and text, not colour alone), results, prediction windows, data epochs. Warning when the windows differ |

---

## 3. Physics, time and reference-frame model

### 3.1 Units, time and frames (both modes)

- Internally SI: metres, seconds, radians. Time is the scenario epoch `t0` (UTC, integer milliseconds) plus simulation seconds `t` (float64). Display converts to km, degrees and UTC strings.
- **One Earth rotation angle for everything.** θ(t) = GMST(t0 + t), computed from UTC with the IAU-1982 GMST formula, taking UT1 ≈ UTC. That error is under 0.9 s, about 0.4 km at the equator, and is documented. The same θ drives calculations, the globe rotation and the Earth-fixed ground track. In Real mode this must equal satellite.js `gstime` to within 1e-9 rad; there is a test for it.
- The existing `ShuttleSim.gmst(st, t)` is `theta0 + ω·t` for a fixed scenario angle. It is **not** a UTC conversion. CubeSat code must not use it for real time.
- ECI uses the ShuttleSim convention: X/Y in the equator, Z north. Earth-fixed = R_z(−θ)·ECI (`ShuttleSim.eciToEcef`). The render mapping is `toR(v) = (x, z, −y)` with `earth.rotation.y = θ`. The texture puts longitude 0 on +X when θ = 0, checked against the current `shuttle_view.js` code. A browser check places a station at Greenwich and at KSC and confirms the markers sit on the right spot of the texture.
- Earth rotates continuously with θ(t). Nothing resets Earth or the station sequence at the end of a revolution. **Replay from start** is the only way to see an identical sequence again.

### 3.2 Sandbox orbit model

Ideal circular two-body orbit around a spherical Earth, R = 6 371 km and μ = 3.986004418e14 m³/s², the same constants as `ShuttleSim`.

```
a  = R + h                       n = sqrt(μ / a³)            T = 2π / n
Ω  = λ_node + θ(0)               (inertial right ascension of the ascending node,
                                  derived from the Earth-relative track position at t0)
u(t) = u0 + n t                  (argument of latitude; u0 = start phase)
r_ECI(t) = R3(−Ω) · R1(−i) · [a cos u, a sin u, 0]
r_ECEF(t) = R3(θ(t)) applied with ShuttleSim.eciToEcef(r_ECI, θ(t))
```

Calculated reference values for this model, not measured ephemerides:

| Altitude | Period | Earth rotation per orbit | Footprint radius, 0° mask | Footprint radius, 10° mask | Longest possible pass, 10° mask (approx.) |
|---|---|---|---|---|---|
| 400 km | 92.41 min | 23.17° | 2 201 km | 1 344 km | ≈ 6.2 min |
| 550 km | 95.50 min | 23.94° | 2 557 km | 1 664 km | ≈ 7.9 min |
| 800 km | 100.72 min | 25.25° | 3 038 km | 2 108 km | ≈ 10.6 min |

Footprint radius is the Earth central angle λ = acos(R cos ε / a) − ε, times R. The longest pass is 2λ/n and ignores Earth rotation, so it is only a sanity bound for tests.

Simplifications (shown in the "About this model" panel and saved with results): no drag, no J2 or orbital-plane drift, no terrain or refraction, spherical Earth. One consequence is that a 97.6° orbit here is **not** Sun-synchronous, and the UI must not call it that.

Elliptical orbits are a **later extension**, not a prerequisite. They would add perigee and apogee altitude plus argument of perigee, use the existing `ShuttleSim.keplerPropagate`, measure phase as mean anomaly, and use an adaptive pass-search step near perigee. The core interfaces in [§5.2](#52-new-files-and-responsibilities) keep the propagator pluggable, so this needs no refactor.

### 3.3 Real-mode propagation

- Use an established SGP4 implementation: **satellite.js** (MIT; supports OMM JSON through `json2satrec`, plus `propagate`, `gstime`, `eciToEcf`, `geodeticToEcf`, `ecfToLookAngles`). npm showed version 6.0.0 during planning. Pin the exact version at install time. This is a new dependency: **[DECIDE] D1**.
- Input is CelesTrak GP data in **JSON (OMM keywords)**. Never feed published mean elements into the sandbox circular propagator. Copy to Sandbox is an explicitly labelled approximation ([§4.6](#46-copy-to-sandbox)).
- SGP4 output is in the TEME frame (km, km/s). To get Earth-fixed, use satellite.js `eciToEcf(r, gstime(date))`. Polar motion and the equation of the equinoxes are ignored, which is acceptable at this game's level and documented. Stations use **WGS84 geodetic** latitude, longitude and altitude via `geodeticToEcf`. Elevation and range come from `ecfToLookAngles`, or from the shared look-angle function given the ECEF vectors (one function, see 3.4).
- On the globe (a 6 371 km sphere) real positions are drawn by geodetic latitude/longitude and altitude. That is a display mapping only; calculations stay WGS84.
- Propagation failures: satellite.js returns an error code or `false` positions for decayed or invalid sets. The prediction stops at the first failure and shows "Elements invalid after <UTC> (predicted decay or bad data)". Altitude below 100 km is treated the same way.
- Deep-space objects (mean motion below 6.4 rev/day) are rejected as outside this mission's scope: "not a low-Earth-orbit CubeSat".

### 3.4 Access (contact) model, the same for live display and forecasts

For satellite position s and station position g, both Earth-fixed, and the station's local up unit vector û (geodetic normal in Real mode, radial in Sandbox):

```
d   = s − g          range = |d|
el  = asin( clamp( (d · û) / |d|, −1, 1 ) )
available ⇔ station.enabled ∧ el ≥ mask   (mask ≥ 0)
```

For a station on or above a convex Earth (sphere or ellipsoid), el ≥ 0 means the line of sight stays above the station's tangent plane, so Earth cannot block it. A mask of 0 or more therefore also enforces occultation. A separate segment–sphere intersection test exists **only in the test suite** as an independent check (§7). Range alone is never used as a visibility test.

There is one function, `lookAngle(satEcef, station)`, and the live NOW panel, the timeline and the pass forecast all call it.

### 3.5 Revolutions, phase return and revisits

Four different ideas are kept separate in UI wording and code:

| Concept | Sandbox | Real |
|---|---|---|
| **Completing a revolution** | exactly T = 2π/n. "Orbit n" counts from the scenario start (Orbit 1 = 0 ≤ t < T) | "Orbit n" counts ascending equator crossings after the start (Orbit 1 = until the first crossing). Period shown as "≈ 1440 / MEAN_MOTION min (published mean motion)" and as "measured between the last two northbound equator crossings" once two have been seen |
| **Returning to X's orbit position** | t_next = t + posMod(u_X − u(t), 2π) / n. If the result is 0 (sitting at X), the answer is t + T, not "now" | find the next time osculating argument of latitude u(t) crosses u_X (coarse 10 s scan + bisection to 0.1 s). Labelled "estimated: the orbit slowly drifts" |
| **Revisiting an Earth location** | not promised. The ground track shifts about 24° west per orbit, so the "next pass near <place>" is just that station's next pass | same |
| **Another pass over a station** | next interval in that station's pass list | same |

Wording rules:
- "Back at X's orbit position in 1:12:05": correct.
- "Same contacts as X again": forbidden, unless it is computed and true.
- "Exact repeat": never shown. A repeat ground track is not looked for in this scope.

### 3.6 Pass search (forecast)

Run once per scenario revision, never per frame. Results are cached and shared by every view.

1. **Grid.** Sample the satellite's Earth-fixed position every Δ = 10 s over [0, H], plus both endpoints. Satellite positions are computed once per sample and shared by all stations.
2. **Per station**, f(t) = el(t) − mask:
   - Sign change between samples → bisection to **0.1 s** gives AOS/LOS times.
   - **Grazing passes** are caught even when both samples are negative: when f[k−1] < f[k] > f[k+1] with f[k] < 0, refine the maximum with golden-section search on [t_{k−1}, t_{k+1}]. If the refined maximum is ≥ 0, insert a pass and bisect both sides. Also check the two boundary intervals for a maximum at the window edge.
   - **Peak**: golden-section search for maximum elevation inside each pass, to 0.1 s.
   - f(0) ≥ 0 → the pass is **already active** (`clippedStart: true`). It is listed under NOW with time left, never as a future pass. f(H) ≥ 0 → `clippedEnd: true`.
3. **Network intervals** = union of all enabled stations' passes (sort and merge). Gaps = complement within [0, H], with gaps touching 0 or H flagged.
4. **Peak simultaneous** = sweep over interval endpoints, ending before starting at equal times.

Tolerances [REC]: crossing time ±0.1 s, peak time ±0.5 s, peak elevation ±0.01°. A grazing pass whose peak is at least 0.001° above the mask must be found by step 2's maximum test. A pass shorter than 1 s is still listed with its exact duration.

Budget: 24 h at 10 s is 8 641 samples. With 50 stations that is about 0.43 M look-angle evaluations plus refinement. Target: under 150 ms on the main thread for Sandbox, and under 250 ms for Real, including SGP4. Move the forecast to a Web Worker only if measured above that. The 72 h choice triples the cost and shows a spinner while computing.

---

## 4. Data sources, caching and reproducibility (Real mode)

All sources were checked on 2026-11-14.

### 4.1 CelesTrak GP (orbital elements), primary source

- Query: `https://celestrak.org/NORAD/elements/gp.php?CATNR=<n>&FORMAT=JSON` (query keys must be uppercase). `NAME=` and `GROUP=` work the same way. JSON uses CCSDS OMM keywords. **TLE text is not available for 6-digit catalog numbers**, which CelesTrak began assigning on 2026-07-11. That is another reason to use JSON/OMM.
- Usage rules that must be built in:
  - CelesTrak checks for new data every 2 hours. Re-download no more than once per update. Since 2026-03-26, repeat downloads before the next update get a 403.
  - More than 50 error responses (301/403/404) in 2 hours puts the IP on the firewall. On 403, 404 or 500, stop. Do not retry automatically.
  - Use `celestrak.org`, never `.com` (that redirects with a 301).
  - Download only when needed. Never fetch whole groups to look up one satellite.
- CORS is not documented, so fetch **server-side only** through the existing Express server, using Node's built-in `fetch` (no new dependency).
- Server design (`server/coverage_data.js`):
  - `GET /api/coverage/gp/:catnr`: validate 1–9 digits. Serve the cached record if under 2 h old. Otherwise fetch once. On success, store `{ omm, fetchedAt, sourceUrl, sha256 }` in `server/.data/coverage/gp/<catnr>.json`. On an error response, keep and serve the stale cache with `stale: true, error: "<code>"`, and set a per-catalog-number cooldown of 2 h.
  - A process-wide error budget of 20 per rolling 2 h. When it is used up, all live fetches stop and only cache or bundled data is served. That keeps the game far below CelesTrak's 50-error firewall.
  - `GET /api/coverage/search?name=`: one CelesTrak `NAME` query, cached 2 h per lowercase term, at most 25 results returned, counted against the same budget.
- The **bundled snapshot** `public/data/coverage/gp_snapshot.json` holds 6–10 curated CubeSats (OMM records + fetchedAt + source), chosen at implementation time from CelesTrak's CubeSat group. The exact `GROUP=` value must be confirmed then, because the index page didn't load during planning. Real mode always has a working offline choice. **[DECIDE] D2**

### 4.2 SatNOGS station catalog

- `GET https://network.satnogs.org/api/stations/` returns a JSON array of station objects with `id, name, altitude, min_horizon, lat, lng, qthlocator, antenna[], status ("Online"/"Testing"/"Offline"), last_seen, …`. The full response is about 3.5 MB. Anonymous API access is throttled; a SatNOGS community post (2024) gives 60 requests/hour anonymous. Data is **CC BY-SA 4.0**.
- The server fetches at most once per 24 h and stores a reduced file (`id, name, lat, lng, altitude, min_horizon, status, last_seen`). The bundled offline file `public/data/coverage/satnogs_stations_snapshot.json` (fetched date + licence + attribution) is the reduced, Online/Testing subset. Attribution is shown in the station picker and on the results screen. **[DECIDE] D2**
- Wording: *"SatNOGS catalog station (listed location). Listing does not mean it will or can track this satellite."* The `status` and `last_seen` fields are shown as catalog information only.
- Antenna bands are not used to filter or decide availability. That would be RF scope.

### 4.3 NASA SSCWeb (optional, not required for every CubeSat)

- REST base `https://sscweb.gsfc.nasa.gov/WS/sscr/2/`: `/observatories`, `/groundStations`, `/locations/{obs}/{timeRange}/{coords}`, with GEO, GEI-J2000 and other coordinate systems. JSON via the Accept header. CORS is allowed. 429/503 responses carry Retry-After.
- Use 1 [REC]: an **external reference check** in tests. Capture SSCWeb GEO positions for a well-covered spacecraft (for example ISS) once, with source and time, as a fixture. Compare our SGP4 sub-satellite latitude/longitude within a loose tolerance, since the ephemeris sources differ.
- Use 2 (later, optional): when the selected satellite appears in `/observatories` for the requested time, offer "Compare with NASA SSCWeb track". Not in the first delivery, and never a hard requirement.

### 4.4 Data age, invalid and missing data

| Condition | Behaviour |
|---|---|
| Element age < 3 days | green "fresh" label: `Elements: CelesTrak GP · epoch 2026-11-13 18:02Z (14 h old) · fetched 2026-11-14 03:10Z` |
| 3–7 days | amber "aging: predictions drift (km-level errors)" |
| 7–30 days | "stale: timings may be minutes off". Predictions are shown with a warning banner on every result |
| > 30 days, or start time > 30 days from epoch | Real predictions are blocked: "Elements too old for meaningful prediction". Offer Refresh or Copy to Sandbox |
| Catalog number not found / empty result | "No published elements for catalog number N", with no retry button for 2 h |
| Fetch error / offline | use cache, else the bundled snapshot, with a banner naming which one and its age. Never block the UI |
| Malformed OMM (missing keys, NaN, eccentricity ≥ 1, mean motion ≤ 0) | rejected. The record is not saved to cache |
| SatNOGS unavailable | bundled station snapshot + the user's own stations |
| SGP4 error during prediction | prediction truncated at that time, clearly marked |

No network request happens per frame or per scrub. Requests happen only when the scenario is chosen or Refresh is pressed.

### 4.5 Reproducible snapshots

A saved scenario is self-contained:

```json
{
  "schema": "interfellas.coverage.scenario/1",
  "mode": "real",
  "title": "…",
  "epochUtc": "2026-11-14T03:00:00Z",
  "horizonS": 86400,
  "orbit": { "type": "omm", "omm": { …full OMM record… },
             "source": { "name": "CelesTrak GP", "url": "…", "fetchedAt": "…", "sha256": "…" } },
  "stations": [ { "id": "satnogs-1234", "name": "…", "lat": 0, "lon": 0, "altM": 0,
                  "maskDeg": 10, "enabled": true, "source": "SatNOGS catalog 2026-11-14 (CC BY-SA 4.0)" } ],
  "markers": { "x": 3600.0, "y": 9120.5 },
  "model": { "propagator": "satellite.js@<pinned>", "earth": "WGS84 stations / GMST IAU-82",
             "contact": "geometric, el >= mask", "app": "<package version>" }
}
```

A sandbox scenario stores `orbit: { type: "circular", altKm, incDeg, nodeLonDeg, phaseDeg }` instead.

- **Reload never refetches.** The embedded OMM is used, so offline replay produces bit-identical pass lists with the same app and library version.
- Storage: browser `localStorage` list of named scenarios (try/catch; works when empty), plus **Export / Import JSON file**. Import validates against the schema and shows field-level errors. Server-side saves for logged-in users are later scope.
- Results and A/B snapshots store the full scenario next to the computed summary, so a comparison always shows what produced it.

### 4.6 Copy to Sandbox

- Creates a sandbox scenario with `derivedFrom: { catnr, name, elementEpoch, sha256 }`. The title becomes "Hypothetical orbit based on <NAME>".
- Conversion (labelled "approximate circular orbit"): altitude = a − R, where a comes from MEAN_MOTION; inclination = INCLINATION; track position and start phase come from the SGP4 state at the chosen start time (the longitude of the last northbound equator crossing, and the current argument of latitude). Eccentricity is dropped, with a note showing its value.
- Stations are copied unchanged, with their source labels kept.
- Every later edit shows "hypothetical (edited)" in the header and on results. The original real scenario stays available unchanged as A for comparison.

### 4.7 NASA Earth imagery (optional)

The globe already uses the team's 5400 × 2700 day map, the repo's original night-lights map and the cloud texture (`public/textures/earth/`). Blue Marble NG is not needed for the first delivery. Swapping it in later is an asset-only change.

---

## 5. Architecture and reuse (repository-specific)

### 5.1 What exists and how it is reused

| Existing | Reuse decision |
|---|---|
| `public/js/game/shuttle_simulation.js` (`ShuttleSim`: MU, RE, OMEGA_E, vector helpers, `rotZ`, `eciToEcef`, `ecefToEci`, `llhToEcef`, `ecefToLL`, `enuBasis`, `elements`, `keplerPropagate`; UMD for browser + Node) | **Reuse** its constants and frame/vector helpers from the new core (loaded before it, as today). Do **not** use `gmst` (fixed theta0) or any ascent/entry code. Do not modify this file, so the Shuttle stays untouched |
| `public/js/world/shuttle_view.js` (Earth material with day/night/cloud shader, two-pass far/near rendering, `toR` axis mapping, planets, free-look camera) | **Extract** the Earth globe construction (material, `onBeforeCompile` night-lights shader, clouds, atmosphere) into `public/js/world/earth_globe.js`, used by both views. The Shuttle view switches to it in the same milestone, gated by Shuttle screenshot and regression checks. The near scene, pad and runway are not reused. Planets and the Sun model are optional backdrop |
| `public/js/game/shuttle_hud.js` / `os_theme.css` (STS_OS look: Share Tech Mono, cream hairlines, inverted header tab, F3 DATA page) | **Reuse the visual language** (CSS variables, panel styles). New HUD markup is in its own file. No redesign of shared styles |
| `public/js/game/shuttle_sfx.js` (Web Audio) | Optional: reuse `key()` click and `event("UI"/"OK")` for timeline events. No new audio work |
| `public/js/game/main.js` (title → lobby → game; solo = private room that auto-starts) | Add a mission choice to the title menu and lobby. Start routes to `shuttleGame` or `coverageGame` |
| `public/js/core/network.js` (Socket.IO client, `client_ping`) | Add `coverage_*` events and a server-clock offset estimate (the ping callback returns server `Date.now()`) |
| `server.js` (rooms, host, `start_game` creates `ShuttleMission`, 30 Hz loop only for rooms with `room.mission`) | Add `room.activity: "shuttle" | "coverage"`. `start_game` branches. Coverage rooms hold `room.coverage` and **never enter the Shuttle tick loop**. Shuttle code paths are unchanged |
| `public/assets/modular_spacecraft_bus_smallsat.glb`, `Satellite.glb` | CubeSat model: the teammate's model ([§5.5](#55-cubesat-3d-model)), fallback `modular_spacecraft_bus_smallsat.glb`. `Satellite.glb` is the Shuttle payload (2 m class with dish and boom) and is not used, to avoid confusing the missions |
| `tests/shuttle/run_checks.js`, `tests/shuttle/browser/*` (Playwright with SwiftShader, `?shuttletest=1`) | Mirror the pattern in `tests/coverage/`. No new test framework |

### 5.2 New files and responsibilities

```
public/js/coverage/coverage_core.js    DOM-free, UMD (window.CoverageCore / module.exports)
  ├─ scenario: schema, defaults, validate(scenario) → {ok, errors[{field,msg}]}, normalize
  ├─ time:     gmstFromUtc(ms), utc formatting helpers
  ├─ propagators: circular(scenario) / sgp4(omm, satellite)   (interface: posEcef(t), stateEci(t), argLat(t))
  ├─ lookAngle(satEcef, station) → {elRad, azRad, rangeM}
  ├─ forecast(scenario, propagator) → {samples, passes[station][], network[], gaps[], peakSimul, stats}
  ├─ query(forecast, t) → {available[], next[], orbitNo, argLat, subLatLon}
  ├─ compare(forecast, tX, tY) → {retained, lost, gained, between}
  ├─ phaseReturn(propagator, t, uX), period info
  └─ summarize / compareAB(resultA, resultB)
public/js/coverage/coverage_view.js    Three.js globe view: earth_globe + orbit ring, ground track,
                                       footprint, station markers, contact lines, CubeSat, cameras
public/js/coverage/coverage_hud.js     setup screens, NOW, NEXT PASSES, timeline, compare, results,
                                       DATA/table page, onboarding, error banners
public/js/coverage/coverage_game.js    controller: lifecycle start/stop/dispose, clock, input,
                                       snapshot from server, calls core, feeds view/HUD
public/js/world/earth_globe.js         extracted Earth (shared with shuttle_view)
public/css/coverage.css                mission-specific layout only (reuses os_theme variables)
public/data/coverage/gp_snapshot.json, satnogs_stations_snapshot.json, presets.json
public/vendor/satellite.min.js         (or served from node_modules; D1)
server/coverage_data.js                CelesTrak + SatNOGS fetch/cache/budget, REST routes
server/coverage_room.js                coverage room state, validation, ownership, clock
tests/coverage/run_checks.js           Node checks (§7)
tests/coverage/fixtures/*              reference vectors, captured references (with provenance)
tests/coverage/browser/run_coverage.js Playwright playtests
```

The core holds no Three.js, DOM, network or wall-clock time. All time arrives as an argument. This is the same rule as ShuttleSim, and it is what makes the playback-speed invariant testable.

### 5.3 Shared session (co-op) [REC: include in the first delivery, minimal]

Every game already runs in a room (solo is a private room), so a minimal shared session costs little and avoids a second code path.

- **Server is the authority for the scenario and the clock, not the physics.** `room.coverage = { scenario, revision, editorId, clock: { simT, wallRef, rate, paused } }`. Clients compute forecasts themselves. They get identical results because the scenario (including the embedded OMM) and the code are identical. Clients exchange a forecast hash (SHA-256 of the pass list rounded to 1 ms), and a mismatch is shown in the DATA page as a desync warning.
- **Edits**: only the **editor** (default: host) can change the scenario, markers, rate or time. The server validates with the same `CoverageCore.validate` (it can `require` it) and bumps `revision`. Other players see "Editing: <name>". The host can hand over the editor role. There are no Shuttle-style crew seats; there is no seat task worth inventing.
- **Independent**: each player's camera, panels, table view and selection highlight.
- **Clock**: clients compute simT = simT_ref + rate × (serverNow − wallRef), using a ping-based offset. The server broadcasts only on change, plus 1 Hz.
- **Personal markers** are out of scope. X/Y are shared, so everyone discusses the same positions.
- Quick crew (public room ORBIT1) stays Shuttle only.

### 5.4 Mission switching and cleanup

- Title menu: `SHUTTLE CREW` and `CUBESAT COVERAGE` choices set `activity` on room creation. The lobby shows the activity, and the host can change it before start.
- `start_game` with `activity === "coverage"` creates `room.coverage` and emits `game_started { mode: "coverage" }`. `room.mission` stays `null`, so the 30 Hz Shuttle loop skips the room.
- Client `coverageGame.start()` / `stop()` mirror `shuttleGame`: they remove all socket listeners, DOM, render loop, resize handlers, workers and audio nodes they created. A lifecycle check repeats start/leave 10 times and checks listener counts, DOM nodes and `active` flags, as in the existing Shuttle lifecycle test.
- Ending: "Exit to menu" leaves the room the same way the Shuttle does. Results are not recorded in the DB win stats. Recording `gamesPlayed` is optional.

### 5.5 CubeSat 3D model

- Preferred: the teammate's CubeSat Blender model, which the user will download into `SpaceApp\Drive`. Three.js cannot load `.blend`, so export to **GLB** (glTF 2.0) with applied transforms, metres, +Y up, under 2 MB, at true size (3U ≈ 0.10 × 0.10 × 0.34 m). The Blender connection on the user's PC can do this export at implementation time. Copy it to `public/assets/cubesat.glb` without overwriting any team asset.
- **Checked 2026-11-14:** `SpaceApp\Drive\Space-Place-Satellite-HD.glb` appeared in Drive. It is a Blender 5.2 glTF export with no extensions, so Three.js r128 can load it. It has 183 meshes and nodes, about 7.3 k triangles, 8 materials and 10 embedded PNG textures (about 12 MB of the 12.6 MB file). Its bounding box is about 2.7 × 3.1 × 2.9 m. Parts include a communications dish, an instrument boom, gold insulation and solar cells. **That is a conventional satellite, not a CubeSat form or size.** Confirm with the team whether a separate CubeSat model exists. If this model is used: (a) merge meshes by material (≈ 8 draw calls instead of 183) and reduce textures to 1024 px or less, targeting ≤ 3 MB; (b) either present it honestly as a generic satellite, or keep it only for the close-up view, because scaling a 3 m satellite down to 0.34 m would misrepresent it. Keep the original file untouched and write the optimized copy to `public/assets/`.
- Fallback: `public/assets/modular_spacecraft_bus_smallsat.glb`, then a procedural box with panel quads.
- At globe scale a CubeSat is sub-pixel, so it is drawn as a scaled-up model plus a screen-space marker. A close-up "Satellite" camera shows true scale. Model choice has no effect on results.

---

## 6. Implementation milestones (dependency-ordered)

Each milestone ends with its checks passing and a short entry in `docs/progress.md`. These are internal checkpoints, not stopping points.

| # | Milestone | Depends on | Delivers | Proof |
|---|---|---|---|---|
| **C1** | Core math (Sandbox) | — | `coverage_core.js`: schema/validation, GMST from UTC, circular propagator, `lookAngle`, forecast with grazing detection, union/gaps/peak, `query`, `compare`, phase return, orbit numbering | Node checks N1–N16, N22, N23 |
| **C2** | Mission entry + shared session | C1 | title/lobby mission choice, `room.activity`, `server/coverage_room.js`, `coverage_*` events, editor ownership, clock + offset, lifecycle/cleanup, Shuttle loop untouched | Node room tests (N24–N26), Shuttle 61 checks, Shuttle co-op browser run |
| **C3** | Globe view + core HUD | C2 | `earth_globe.js` extraction (Shuttle switched + screenshot check), `coverage_view.js`, clock, NOW, NEXT PASSES, timeline, playback/scrub/jump, CubeSat model | Browser B1–B3; Shuttle screenshot comparison |
| **C4** | X/Y and revolutions | C3 | markers, compare panel, return-to-X countdown, orbit labels, ascending-node ticks, replay from start | B4–B5; N9, N10 live/forecast agreement |
| **C5** | Scenario editor, onboarding, states | C3 | full sandbox editor with validation messages, globe click to place stations, equatorial merge, presets, glossary, first-run 3-step overlay, empty/no-pass/error states, DATA table view (keyboard accessible) | B6–B7; N16 |
| **C6** | Results, A/B, save/load | C4, C5 | results screen, A/B snapshots and diff, localStorage list, export/import, schema migration hook | B8–B9; N22, N27 |
| **C7** | Real data layer | C1, C2 | dependency install (D1), `sgp4` propagator adapter, `server/coverage_data.js` (GP + SatNOGS fetch/cache/budget), bundled snapshots (D2), data-age model, invalid-data handling | N17–N21, N28–N30 |
| **C8** | Real mode UX | C6, C7 | satellite picker, data-source/age display, station catalog picker, real orbit numbering/period/phase estimates, Copy to Sandbox, element refresh as a new revision, A/B across modes | B10–B12; N31 |
| **C9** | Hardening and final playtest | all | performance budget, 2–4 client session test, full journeys in both modes, mission-switch cycles, progress write-up with evidence and limits | B13–B16; all N and Shuttle checks |

Later options, not in this delivery: SSCWeb track comparison, elliptical orbits, a 2D map inset, Sun position from date (lighting only), station terrain masks, server-side saved scenarios, a scored "place N stations to minimise blackout" challenge.

---

## 7. Acceptance criteria, automated checks and playtests

### 7.1 Node checks (`node tests/coverage/run_checks.js`)

| ID | Check | Pass condition |
|---|---|---|
| N1 | Overhead | station at sub-satellite point: el = 90° ± 1e-6, range = h ± 1 m |
| N2 | Elevation geometry | for central angles 0…λ_max: computed el matches the analytic el(γ) = atan2(cos γ − R/a, sin γ) within 1e-9 rad |
| N3 | Mask boundary | station placed so the peak el = mask − 0.001° → no pass; mask + 0.001° → one pass |
| N4 | Earth occultation | 10 000 random satellite/station pairs: `available` agrees with an independent segment–sphere intersection test (with mask 0) |
| N5 | Overlapping contacts | two nearby stations: both passes kept, union shorter than the sum, peak simultaneous = 2 |
| N6 | Short/grazing passes | constructed passes of 0.5 s, 5 s and 30 s found with duration error ≤ 0.2 s; none lost by the 10 s grid |
| N7 | Window clipping | start inside a pass → `clippedStart`, listed as available now with time left, not in "next". End clipping likewise. Durations flagged "≥" |
| N8 | No pass in window | equatorial orbit at 550 km and a station at 60°N, 24 h → zero passes, message "none in this prediction window" (never "never") |
| N9 | Orbital timing | T(400/550/800 km) = 92.41 / 95.50 / 100.72 min ± 0.01. After one T, u returns to u0 within 1e-9 rad, while the sub-satellite longitude has moved −23.94° ± 0.01° (550 km, i = 51.6°) |
| N10 | Phase return | posMod logic. At X exactly → T. Agrees with a brute-force scan to 0.1 s |
| N11 | No automatic repetition | default scenario: the orbit-2 station sequence differs from orbit 1. The timeline never resets |
| N12 | Date-only shift (Sandbox) | epoch + 1 day + 37 min → every pass shifted by exactly that; durations and peaks identical |
| N13 | Equatorial / polar / retrograde | i = 0, 90, 180, 135: tracks stay within ±i latitude; retrograde ground speed is westward; i = 0 merged controls give an identical forecast to the same λ split differently |
| N14 | Date line | stations at lon 179.95 and −179.95 mirrored: symmetric pass results |
| N15 | Monotonic invariants | raising a mask never adds or lengthens a pass; disabling a station never raises coverage; adding a station never lowers it |
| N16 | Validation | NaN, Infinity, out-of-range, duplicate names, more than 50 stations, negative mask, unknown horizon → field-specific errors; valid edge values accepted |
| N17 | SGP4 reference vectors | satellite.js against the published SGP4 verification cases (Vallado et al. 2006, CelesTrak "Revisiting Spacetrack Report #3" test set), a committed subset with source: position within 1 m, velocity within 1 mm/s |
| N18 | GMST | `gmstFromUtc` vs satellite.js `gstime` within 1e-9 rad over 1990–2100. One independently published value (for example a USNO/IAU worked example) to 1e-6 rad |
| N19 | Frames | WGS84 geodetic → ECEF → geodetic round trip under 1 mm; a known TEME → ECEF case from the Vallado reference within 1 m (ignoring polar motion, as documented) |
| N20 | Real access vs independent reference | a committed fixture produced outside the game (python `sgp4` + standard look-angle code, or another established tracker), with tool name, version and OMM record: AOS/LOS within 2 s, peak elevation within 0.1° for at least 3 stations over 24 h |
| N21 | External ephemeris sanity | captured SSCWeb GEO track for a reference spacecraft vs our SGP4 from the matching element epoch: sub-satellite point within 25 km (different ephemeris sources, loose tolerance) |
| N22 | Playback-speed independence | the controller is driven at rates 1/60/300/1000 with random frame dt: the forecast is byte-identical, and live "became available" transitions happen within one frame of simulated time of the predicted AOS |
| N23 | Union statistics | hand-built interval sets: coverage %, blackout total, longest gap including edge gaps (flagged), peak simultaneous with ties |
| N24 | Room activity | coverage room never gets a `ShuttleMission`; the Shuttle tick loop skips it; Shuttle room behaviour unchanged |
| N25 | Edit ownership | a non-editor `coverage_edit` is rejected with a reason; an invalid scenario is rejected server-side; revision increments only on accepted edits |
| N26 | Shared clock | two simulated clients with different ping offsets agree on simT within 50 ms of simulated time × rate |
| N27 | Save/load | export → import round trip equal; schema mismatch → clear error; localStorage throwing → app still works |
| N28 | Cached replay offline | a saved real scenario forecast with `fetch` mocked to throw: identical to the online result; zero network calls |
| N29 | Data age and errors | age tiers and labels; >30 days blocks; malformed OMM rejected; 404/403 → no retry plus cooldown; error budget stops fetching at 20/2 h |
| N30 | GP cache policy | second request within 2 h is served from cache (no upstream call); `celestrak.org` host only |
| N31 | Copy to Sandbox | provenance kept, "approximate circular" label, eccentricity noted; edits mark "hypothetical (edited)"; source scenario unchanged |
| S1 | Shuttle regression | `node tests/shuttle/run_checks.js`: 61/61 |

### 7.2 Browser playtests (Playwright harness extended with `?coveragetest=1`)

Hooks (test only): `__coverageTest.snapshot()`, `.forecastHash()`, `.setTime(t)`, `.listeners()`.

| ID | Playtest | Observe |
|---|---|---|
| B1 | Title → CubeSat → Sandbox default → Run | globe renders, Earth rotates, track past/future, stations, contact lines only to available stations, no console errors |
| B2 | Playback 1× → 1000× → pause → scrub → jump to next event (5×) | each jump lands on a predicted AOS/LOS; the NOW list changes exactly there; screenshots at each |
| B3 | Contact line geometry | at 20 random times no contact line passes through the Earth mesh (ray test in the page); line set = `query().available` |
| B4 | X/Y | set X at an overlap, Y 40 min later: retained/lost/new match the core `compare`; labels show orbit # and UTC |
| B5 | Two revolutions | return-to-X countdown reaches 0 at the computed time; the orbit-2 sequence differs; no reset |
| B6 | Editor | change altitude, inclination, track position, phase, masks, add a station by globe click, disable a station; invalid input shows messages and Run is disabled; equatorial merge works |
| B7 | Empty and no-pass states | zero stations; a station that is never reached in 24 h; a pass active at start |
| B8 | Results + A/B | A at 550 km, B at 800 km: both settings and windows shown; changed rows marked with text/symbol |
| B9 | Save/reload | save, reload page, load: identical forecast hash |
| B10 | Real mode offline | network blocked: curated snapshot satellite → predictions, source and age labels shown, banner "bundled snapshot" |
| B11 | Real mode live (only where network is allowed) | fetch by catalog number, cache reused on a second load, Refresh creates a new revision, A/B old vs new elements |
| B12 | Copy to Sandbox | provenance header; edit inclination → "hypothetical (edited)" |
| B13 | Shared session | 2 clients: same forecast hash; non-editor edits rejected visibly; cameras independent; editor handover |
| B14 | Mission switching | Shuttle → CubeSat → Shuttle × 10: listener and DOM counts stable; the Shuttle co-op run still reaches WHEELS STOP |
| B15 | Layout | 1280×720 and 1024×640: no overlapping panels; keyboard-only path through setup → run → X/Y → results |
| B16 | Performance | 24 h forecast with 50 stations under the budget; steady 60 fps at 1000× on the reference machine (record the GPU used) |

---

## 8. Performance, tolerances and failure handling

- **Forecast per scenario revision**, never per frame. Per frame: one propagator call, plus look angles for enabled stations (at most 50), plus a binary search into the cached pass list. That is negligible.
- **Ground track**: sampled from the forecast grid (10 s) and drawn as two line buffers (past solid, future dotted, up to one orbit ahead and behind). Rebuilt only on revision change or when the playhead leaves the buffered range.
- **Contact lines**: pooled `LineSegments`, at most 50.
- **Globe**: reuse the extracted Earth material. Do not load planets in coverage mode unless the camera is far out.
- **Memory**: 72 h at 10 s is 25 921 samples × 3 doubles, about 0.6 MB. Fine.
- **Tolerances** (from §3.6 and §7): crossing ±0.1 s, peak time ±0.5 s, peak elevation ±0.01°. Real vs reference: AOS/LOS ±2 s, peak ±0.1°. Shared clock ±50 ms. Live vs forecast: one frame of simulated time.
- **Failure handling** (all user-visible, none silent): validation errors next to the field; Run disabled with the reason; data errors per §4.4; a forecast longer than 1 s shows progress text; WebGL loss shows "3D view unavailable — table view still works" (the DATA/table page works without the globe); desync hash mismatch shown on the DATA page with a "resync" action (re-request the scenario from the server).

---

## 9. Remaining risks

- **Frame or sign errors** (east/west, retrograde, date line, texture longitude). Mitigated by N2, N13, N14, N19 and the B3 Greenwich/KSC marker check.
- **Missed grazing passes.** Mitigated by maximum detection (N6) and the brute-force comparison in N20.
- **Misleading wording** (available vs contact, repeat claims). Mitigated by the wording rules in §1.1 and §3.5, which are checked during the B-series screenshot review.
- **CelesTrak policy changes** (stricter limits, format changes). Mitigated by the cache, budget, bundled snapshot and the no-retry rule. Recheck the documentation page right before implementing C7.
- **satellite.js with 6-digit catalog numbers.** Verify that `json2satrec` accepts a NORAD_CAT_ID ≥ 100000 at implementation time. If not, keep the ID out of `satrec` and carry it separately.
- **Earth helper extraction touching the Shuttle view.** Done in one step with before/after screenshots and the Shuttle browser run.

## 10. Remaining decisions

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Add the **satellite.js** dependency (MIT) for SGP4 | **Yes.** Pin the exact version and serve its UMD build to the browser from a local path (no CDN dependency for core physics). Without it, Real mode would need a hand-written SGP4, which is riskier and slower to verify |
| D2 | Commit **bundled data snapshots** (6–10 CubeSat OMM records from CelesTrak; reduced SatNOGS Online/Testing station list, CC BY-SA 4.0 with attribution) | **Yes.** Needed for offline play and reproducible demos |
| D3 | Shared session in the first delivery | **Yes, minimal** (§5.3) |
| D4 | Curated satellite list | Pick at implementation from CelesTrak's CubeSat group: recent element epochs, a mix of inclinations. The user or team may name specific satellites instead |
| D5 | CubeSat model | `Space-Place-Satellite-HD.glb` (now in Drive) is a 3 m conventional satellite, not a CubeSat. Use a true CubeSat model if the team has one. Otherwise use a simple procedural 3U CubeSat for the satellite, and this model only if the team wants it as an optimized close-up. See §5.5 |
| D6 | Limits | 50 stations; prediction choices up to 72 h; real start time within 30 days of element epoch |

Routine choices (palette, exact key bindings, preset names) follow the existing STS_OS style and are settled during implementation without asking.

---

## 11. Implementation prompt (send after approving this plan)

> Implement the CubeSat Contact Coverage mission in `C:\Users\Omen 16\OneDrive\Desktop\VScode Workspace\SpaceApp\Interfellas` exactly as planned in `docs/cubesat-coverage-plan.md` (both Sandbox and Real Satellite modes, milestones C1–C9). I approve the plan, including decisions D1–D6 as recommended [edit any you want changed], so you may: install the pinned `satellite.js` dependency; add the bundled CelesTrak and SatNOGS data snapshots with attribution; add the new coverage files and the minimal shared session; extract the Earth globe into `earth_globe.js` and switch the Shuttle view to it; copy the CubeSat GLB into `public/assets/` (export it from my teammate's Blender model in `SpaceApp\Drive` if it is there, otherwise use the fallback).
>
> Read `CLAUDE.md`, `docs/cubesat-coverage-plan.md` and `docs/progress.md` first, and recheck `git status`. Preserve the co-op Shuttle mission and all existing assets; do not repair the parent `SpaceApp` folder; do not run `npm run storage:sync`, inspect secrets, commit, push or deploy. Follow CelesTrak's usage rules in §4.1 (cache, no repeat downloads within 2 h, stop on 403/404, error budget). Never present predicted visibility as a radio connection.
>
> Work through all milestones without stopping at intermediate ones; they are checkpoints. Ask me only for decisions that cannot be undone or that the plan does not cover. Finish only when the definition of done in §1.3 is met: all Node checks in §7.1 and Shuttle regressions pass, the browser playtests in §7.2 have been run with screenshots, and `docs/progress.md` records the evidence, exact commands and any remaining limits. Do not claim completion without an observed full journey in both modes.

---

## Sources checked (2026-11-14)

- CelesTrak, *A New Way to Obtain GP Data*: https://celestrak.org/NORAD/documentation/gp-data-formats.php (query format, OMM JSON, 2-hour update, one-download-per-update rule, error limits, 6-digit catalog numbers)
- SatNOGS Network API docs: https://docs.satnogs.org/projects/satnogs-network/en/latest/api.html (open access, CC BY-SA 4.0); live `https://network.satnogs.org/api/stations/` (fields); throttling (60/h anonymous): https://community.libre.space/t/api-and-throttling-anonymous-vs-with-api-token/12091
- NASA SSCWeb REST: https://sscweb.gsfc.nasa.gov/WebServices/REST/ (endpoints, coordinate systems, CORS, 429/503)
- satellite.js: https://github.com/shashwatak/satellite-js and https://www.npmjs.com/package/satellite.js (OMM `json2satrec`, `gstime`, `eciToEcf`, `ecfToLookAngles`, MIT, UMD build)
- NASA orbit tutorial (revolution vs ground revisit): https://eol.jsc.nasa.gov/Tools/orbitTutorial.htm
- Numerical values in §3.2 were computed with the repository's constants (R = 6 371 km, μ = 3.986004418e14 m³/s², ω = 7.2921159e-5 rad/s).
