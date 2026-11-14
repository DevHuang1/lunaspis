# Interfellas handoff

Work in this Interfellas directory. Its parent `SpaceApp` is an unrelated SkyDetective checkout with existing deletions; do not repair or overwrite it.

Audit baseline: `5012ff791a15f8b652df089fa8f3b9c4fbbda5c0`, remote `https://github.com/DevHuang1/Interfellas.git`, remote default `main`. This checkout is shallow and detached. Recheck `git status --short --branch`, `git remote -v`, and `git rev-parse HEAD` before work.

- [Code map, findings, assets, checks](docs/codebase-audit.md)
- [Mission specification — DRAFT with confirmed control requirements](docs/mission-spec.md)
- [Implementation plan — DRAFT; complete-mission Claude prompt](docs/implementation-plan.md)
- [Progress and approval decisions](docs/progress.md)

Node >=20; audited on Node 24.20.0. `npm ci --ignore-scripts --no-audit --no-fund` passed with user approval. `npm start` / `npm run dev` both run `node server.js`; default port 3000. No build/test/lint script exists. All 26 tracked JS files passed `node --check`. Browser gameplay remains unverified.

For local testing use the audit's process-local DB/storage overrides: startup can otherwise migrate PostgreSQL and upload assets. Do not run `npm run storage:sync`, commit, push, deploy, inspect secrets, or install dependencies without authorization.

Gameplay first; GUI redesign later. Preserve current working gameplay and original assets. No framework rewrite. Altitude is not orbit; proximity docking is not rendezvous. Keep simulation/mission logic independent of DOM and rendering.

New user direction (2026-11-14): plan an additional CubeSat ground-station contact-coverage mission. This supersedes the earlier exclusion of a ground-station planner only for this bounded new mission; keep the co-op Shuttle mission intact. See the [CubeSat draft specification](docs/mission-spec.md#cubesat-contact-coverage-mission--draft-2026-11-14) and [CubeSat implementation sequence](docs/implementation-plan.md#cubesat-coverage-implementation-plan--draft-2026-11-14). Current request is planning, not implementation. Determine contacts now/at marked orbit positions, subsequent station access windows, orbital period and time to next contact. Earth rotates: one orbital revolution does not imply a repeated ground track or station sequence. Recommended first scope is one idealized circular-orbit CubeSat with geometric visibility/elevation masks; radio-link budgets, real station booking and satellite constellations are deferred.

User-confirmed direction (2026-11-13): automatic launch/ascent, player-operated orbital tasks, player-controlled entry banking/reversals, and manual unpowered glide landing. Ascent guidance controls throttle, attitude and staging. Entry bank tilts the lift vector; it is not yaw-only zigzag motion. Default AoA assistance may hold the entry attitude while the player chooses bank and reversal timing. Landing requires player pitch/bank, flare, gear and rollout. Orbital objectives cannot auto-complete during a cutscene.

Recommended bounded first mission: single-pilot, fictional Shuttle-era satellite deployment and KSC return; preserve existing co-op as a separate activity. These defaults are proposals, not prior user selections. The detailed prompt adopts them when the user sends it. Full ISS rendezvous, EVA, robotic-arm simulation and shared Shuttle flight are later scope.

Status 2026-11-13 (supersedes the solo/"preserve existing activities" defaults above, by user direction): Interfellas is now only the co-op Shuttle crew mission. Old missions were removed; up to 4 players hold CDR/PLT/MS1/MS2 seats; `server.js` runs one authoritative `ShuttleMission` per room; free-look follow camera; team planet GLBs and the team's LC-39A layout are used. See [progress](docs/progress.md) for files, run/controls, evidence and remaining limits; checks: `node tests/shuttle/run_checks.js`, browser: `tests/shuttle/browser/run_coop.js` (server with `SHUTTLE_TEST=1`). The original handoff text follows. This handoff changes documentation only; implementation begins when the user gives Claude the implementation prompt. Then finish the entire core mission through verified landing, failures/retries and usable guidance. Milestones are internal checkpoints, not instructions to stop after M1 or a rehearsal. Do not silently broaden scope. Do not spawn agents unless approved. Record actual evidence and remaining blockers in progress; do not claim completion without an observed full playthrough.
