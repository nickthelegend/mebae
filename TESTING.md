# Testing Mebae

Fresh local verification on **2026-10-27**. Product source base `f2e5cee`. No deployment or origin push. Final configuration: `metaQuest3` / `home_office`.

The audit is **not accepted as fully passing**: **114 PASS / 33 FAIL / 17 UNTESTED** across 164 rows. [AUDIT.md](AUDIT.md) gives every exact observation, evidence path, fix and dependency. Measurement gaps are failures; genuinely unavailable native conditions and real-headset checks are untested. No historical PASS was carried forward.

## Browser and suite counts

The four existing drivers passed **51/51 checks, 0 failed**. Driver checks cover only parts of some larger audit rows. A passing suite does not promote incomplete audit rows.

| Suite | Profile / room | Passed | Failed | Console errors in suite |
| --- | --- | ---: | ---: | ---: |
| kitchen | `metaQuest3` / `kitchen` | 6 | 0 | 0 |
| quest | `metaQuest3` / `home_office` | 30 | 0 | 0 |
| glasses | `metaVRGlasses` / `home_office` | 8 | 0 | 0 |
| perf | `metaQuest3` / `home_office` | 7 | 0 | 0 |

[Fresh machine-readable results](docs/emulator-results.json) retain all 51 checks, capture counts and raw metrics. The final Quest core replay, kitchen, Glasses, Week supplement, performance, growth and guarded storage intervals contain **0 console errors, 0 page errors, 0 failed requests and 0 unexpected HTTP errors**. The superseded about:blank IndexedDB test initialization was guarded and re-run; its earlier interval was removed from final evidence.

| Flat-page pass | Browser rows executed | PASS | FAIL | Error-level console entries | Page errors | Unexpected HTTP errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop (1440 px) | 33 | 13 | 20 | 28 | 0 | 0 |
| 375 px | 33 | 13 | 20 | 28 | 0 | 0 |

D2-02 and D2-28 deliberately use their specified 375 px viewport even within the desktop batch. D2-33 is a core-only assertion, and D2-35 needs a physical headset.

The landing's absent `history.json` is an explicitly expected HTTP 404, but Chrome emits an error-level resource message. The user's stricter “any console error fails” instruction therefore fails D2-01–10 and D2-12–20, even when the UI matches. D2-11 uses a real served history file and passes. The intentionally corrupt persisted-ledger startup case emits `TypeError: Cannot read properties of null (reading 'filter')`; D2-27 fails at both widths. These errors remain explicit rather than being suppressed.

## Tests and build

- Core Vitest: **61 passed, 0 failed, 6 files passed**. [Exact output](audit/raw/core-vitest.txt).
- Five supplemental pure-core exact-value assertions passed, including sample refusal, seventh-habit refusal, counted saturation and empty undo. [Assertions](audit/2d/core-assertions.json). These do not add to the 61 Vitest tests.
- App `npm run typecheck`: passed. [Output](audit/raw/typecheck.txt).
- App `npm run build`: passed; `check-dist: no test hooks or test clock in the production build`. [Output](audit/raw/build.txt).
- Real production browser: `window.__mebae` undefined, native clock matches elapsed wall time, 0 console/page/network errors. [Observation](audit/raw/production.json).

## Performance

Exactly **600 rendered frames**, six tracked stage-7 plants, all forced into submission. The fixture's history is synthetic test setup. Measurement runs from the priority −100 PerfStart system through `scene.onAfterRender`, with raw renderer counters covering both XR views.

| Gate | Fresh measured value | Result |
| --- | ---: | --- |
| CPU p95 ≤ 4 ms | 1.20 ms (p50 0.80, max 2.30) | PASS |
| Raw draw calls max ≤ 50 | 48 | PASS |
| Raw triangles max ≤ 150000 | 37664 | PASS |

**Uncalibrated desktop CPU/render proxy; unverified on Quest hardware.** No stereo halving, calibrated headset timing or 72 fps claim. The earlier draw batching and Glasses layout fixes passed their unchanged gates. Actual transformed plant/label corners also passed normal, Large radial, Large Week and sample field-of-view checks.

The broader audit still fails the actual sand-upload measurement requirement: rakeWrites and texture/source version deltas were 0 over 1200 ms, but a native GL upload counter was not recorded. The driver’s narrower idle-write assertion passes; VR-116 remains FAIL.

## Recording and remaining work

[Fresh 35-second first-day clip](audit/vr/first-day.mp4): **2100 frames, error null, multiDayFootage false**. It shows a real emulator seed/anchor/check-in/stage-1 flow and a clearly captioned “Example garden (sample data) · NOT a recorded later day” preview. Temporary capture frames were deleted. This is not actual multi-day footage.

Remaining audit failures include the aiming-seed acquisition/cancellation attempt, other-hand aim preview in the no-hit case, incomplete tracked-pose-loss/enlarged-target/audio/upload measurements, a missing bamboo stage-matrix setup, resting-label priority over bloom, wrist Close reopening while the palm stays up, the sample-seed toast prefix, carrying/Sample archiving, and an unestablished capacity move. Each ID and exact value is in AUDIT.md and `remainingFailures` in the JSON report.

Untested native conditions include genuine anchor rejection/nonpersistent handles/missing restore API, overlapping or unlabelled room geometry fixtures, precise interruption and midnight conditions, accepted same-ID import in the managed browser (its host auto-dismisses native confirms), actual storage-commit failure (native zero-quota override did not induce it), and unavailable Web Audio. No mocked result substituted for these conditions.

Physical Quest Browser across actual days, real hit-tests, sustained 72 fps, real hand-tracking pinch accuracy, and real separate-day recordings remain **UNTESTED**. Emulator analogues do not establish hardware results.

## Reproduction and cleanup

One heavy slot was acquired before any server or Chrome. The sequence was Playwright Chrome for Testing against a local static landing server and app flat page, desktop then 375 px; then `npx @iwsdk/cli dev restart --open --ai-mode agent --allow-browser-automation`, waiting for `browserCommandReady`; then kitchen → Quest → Glasses → perf via `e2e/run.mjs` and `scripts/set-device.mjs`, with additional exact-row observations in the same managed session. Tests/build and production smoke followed. All final evidence is from this acquired session.

The harnesses under `audit/2d/` and `audit/vr/` record the action inputs and observers. Native capability configuration and DEV fixtures are labelled. No product logic, XR result, or persistence method was stubbed. The original config bytes were restored to `metaQuest3` / `home_office`.

Owned server/Chrome processes were killed by PID; **0 surviving owned PIDs**. The heavy slot was **released successfully**. [Shutdown proof](audit/raw/shutdown.json). `.loom/` was not edited. Origin was not pushed; nothing was deployed.
