# Handoff — Interfellas (2026-11-14, end of Claude session)

Project: `SpaceApp/Interfellas` (vanilla JS + Three.js r128, Express 5 + Socket.IO, no build step). Read `CLAUDE.md` and `docs/progress.md` (rounds 5–7) first. Rules: do not commit/push/deploy/install without the user's OK; local wins over remote-main on overlapping work; STS_OS GUI style.

Run: `$env:DATABASE_URL=''; $env:AWS_ACCESS_KEY_ID=''; $env:AWS_SECRET_ACCESS_KEY=''; $env:AWS_S3_BUCKET_NAME=''; $env:PORT='3137'; node server.js` — mission logic runs on the SERVER: restart it after any `public/js/game/shuttle_*.js` change, then Ctrl+F5.
Checks: `node tests/shuttle/run_checks.js` (61), `node tests/shuttle/dock_checks.js` (15), `node tests/shuttle/assist_checks.js` (6), `node tests/coverage/run_checks.js` (38). Browser tests need `SHUTTLE_TEST=1`.

## Done this session (all on the PC)
- Boarding walk on LC-39A gantry (`pad_walk.js`, `pad_layout.js`, server `pad_pos`/`pad_action`), team's detailed KSC (`ksc_scene.js` + `space_center*.js`), astronaut rigs, proximity voice, emotes 1–6.
- ISS docking flight (lobby FLIGHT picker): 51.6° launch, rendezvous skipped, station 250 m AHEAD flying tail-first (−XVV), hand-flown docking, ends at soft capture.
- Guidance lines: thin white; whole orbit drawn (far scene) + ±300 km near the orbiter (near scene); ascent line leaves along the nose; autopilot holds prograde after ET sep.
- Creamy key-click sound (`synthKey` in `shuttle_sfx.js`).

## Round 7 (last request) — status
1. **Landing too hard → Landing assist (DONE in container, verify on PC).** Default ON; M toggles in approach/rollout. Hands-off for 1 s → the computer flies glide/bank/speed brake to the guide cues, auto gear at 120 m, auto derotate/centreline/brake in rollout; any input takes over that axis. `_landingAssist` / `_rolloutAssist` in `shuttle_mission.js`; tests `assist_checks.js` 6/6 (hands-off lands from disturbed starts: sink 1.2 m/s, stops 2.5 km). `run_checks.js` now sets `landAssist=false` in `fromCk` (manual-flying tests) — confirmed 61/61.
2. **Bigger counter + mission timeline (DONE).** `shuttle_hud.js` CSS: timeline 920 px / 14 px labels / bigger dots; tag 20 px; log, chat and toast moved to top 140 px. Check visually for overlaps at 1366×768 and mobile.
3. **T "skip ahead to the burn" after ET sep did nothing (FIXED).** `COAST_TO_TIG` only worked in deorbit; now `_coastToOms2()` coasts to TIG−60 s in insertion (after B authorize). Needs a quick in-game check.
4. **Update progress.md** with round 7 (not yet written — add the three items above + evidence).

## Files changed in round 7 (copy from container if missing on PC)
`public/js/game/shuttle_mission.js`, `public/js/game/shuttle_hud.js`, `tests/shuttle/run_checks.js`, `tests/shuttle/assist_checks.js` (new), this doc. Bump `?v=` in `public/index.html` for mission/hud scripts.

## Open items / ideas
- Four simultaneous SwiftShader clients can't load the full KSC in tests (real GPUs fine); two-client co-op verified end to end.
- No human playthrough yet of boarding, docking, or the landing assist. Proximity voice not heard with real mics.
- Entry (before the approach) is still hand-flown; if users still find landing hard, consider extending the assist to entry bank reversals.
