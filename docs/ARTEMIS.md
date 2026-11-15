# Artemis II Crewed Lunar Flyby — Implementation Notes

## Scope

This mission implements a complete, interactive **13-phase Artemis II-inspired Crewed Lunar Flyby and Figure-Eight Free-Return Simulation**:

1. **Phase 1 (`briefing`)** — Mission Briefing & Crew Preparation (crew readiness & Orion/SLS status checks, launch authorization)
2. **Phase 2 (`launch_prep`)** — Crew Transportation & Launch Complex 39B Preparation (Astrovan transport, White Room ingress, SLS cryogenic propellant loading & pad commit)
3. **Phase 3 (`launch`)** — SLS Block 1 Launch & Ascent (`T-15s` countdown, ROFI sparklers at `T-12s`, RS-25 ignition at `T-6s`, `8.8M lbs` SRB liftoff at `T-0s`, Max-Q, SRB separation at `T+126s`, Service Module fairing & LAS jettison at `T+195–201s`, Core Stage MECO & separation at `T+480–492s`, and initial Earth orbit insertion at `T+510s`)
4. **Phase 4 (`earth_orbit`)** — Earth Orbit, Solar Array Deployment, ICPS High Earth Orbit (HEO) Raise Burn (`200 × 38,000 km`), 24-Hour Systems Checkout & ICPS Separation
5. **Phase 5 (`prox_ops`)** — Proximity Operations Demonstration (6-DOF manual or assisted handling relative to the separated ICPS & Stage Adapter: approach `<= 38 m`, hold & align, and back away `>= 85 m`)
6. **Phase 6 (`tli_prep`)** — Trans-Lunar Injection (TLI) Preparation, Go/No-Go Verification & Orion Service Module TLI Burn
7. **Phase 7 (`outbound`)** — Outbound Deep-Space Cruise (~4-day translunar coast, deep-space systems check, radiation shelter drill, and trajectory trim)
8. **Phase 8 (`lunar_flyby`)** — Lunar Far-Side Flyby (`~4,600 miles / 7,400 km` perilune beyond the far side, `~244,533 miles` max distance from Earth, geometric ~43-minute far-side radio blackout & AOS restoration, and far-side observation/photography)
9. **Phase 9 (`return_coast`)** — Gravity-Driven Free-Return Journey to Earth (~4-day return coast, return systems check & corridor trim)
10. **Phase 10 (`entry`)** — Service Module Separation, Heat-Shield Orientation & Atmospheric Skip Entry at `121.9 km` (`~75.7 miles`) and `~24,600 mph` (`~11.0 km/s`), peaking near `~4.0G` and `~5,000°F`
11. **Phase 11 (`chutes`)** — 11-Parachute Deployment Sequence (3 Forward Bay Cover chutes + 2 Drogues at ~25,000 ft; 3 Pilot chutes + 3 Main chutes at ~9,000 ft)
12. **Phase 12 (`splashdown`)** — Pacific Ocean Splashdown (`17.4 mph` / `7.8 m/s`, ~50 NM off California), CMUS Upright Airbag Deployment & Crew Safety Confirmation
13. **Phase 13 (`recovery` & `debrief`)** — U.S. Navy Crew Recovery Operations (Inflatable "Front Porch" deployment, Helicopter Crew Extraction to the recovery ship, Well-Deck recovery & Complete Mission Debrief)

**Orion does not land on the Moon.** Obsolete lunar orbit capture and surface lander stages have been removed from the active mission flow while preserving reusable helper functions in `artemis_simulation.js`.

## Calculated Reference Values (`tests/artemis/run_checks.js`)

| Metric | Value |
|---|---:|
| SLS liftoff thrust | 8.80 million lbs (39.14 MN) |
| Initial Earth parking orbit | 200 × 2,200 km (`28.6°` inclination) |
| High Earth Orbit (HEO) after ICPS burn | 200 × 38,000 km (`Δv ≈ 2,491 m/s`) |
| Total TLI impulse from LEO | ~3,143 m/s (tangential nodal window) |
| Orion ESM TLI impulse from HEO perigee | ~652–1,084 m/s |
| Outbound transfer duration | 3.60 days |
| Lunar far-side closest approach (perilune) | 7,400 km (4,598 miles) |
| Max distance from Earth at perilune | 393,537 km (244,533 miles) |
| Far-side geometric radio blackout duration | ~43.0 minutes |
| Earth Entry Interface altitude & speed | 121.92 km (75.7 mi) at 10,998 m/s (24,601 mph) |
| Peak atmospheric entry load & temperature | 4.02 G / 4,993–5,050 °F |
| Terminal splashdown speed (3 main chutes) | 7.8 m/s (17.4 mph) |

## Verification

Run:

```bash
node tests/artemis/run_checks.js
```

Current automated suite result: **53 passed, 0 failed**.
