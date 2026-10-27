# Testing Mebae

Evidence refreshed on **2026-10-27**, integration source **ffb3152**: **147 PASS / 0 FAIL / 17 UNTESTED**, across 164 rows in [AUDIT.md](AUDIT.md). The 48 existing current-commit PASS evidence cells remain unchanged. All 99 stale PASS rows were refreshed: **6 exact t10 suite/capture references and 93 direct re-observations**. The 17 excluded UNTESTED rows were not retried.

[Machine-readable results](docs/emulator-results.json) retain the original t10 suite values and add `t11Refresh`. [The 99-row index](audit/raw/t11-refresh.json) lists every relinked/re-observed ID and its evidence file. No product source changes were required.

## Browser observations

Chrome for Testing ran IWSDK's IWER emulator in active immersive runtime views. Quest 3 used emulated hands; Glasses used emulated gaze plus pinch, with the explicit gaze-disconnect row exercising hand-ray fallback. Actual detected geometry, XRAnchors, persistent handles, IndexedDB, synthesized Web Audio and room labels were used. No application logic, anchor/hit-test results, storage methods, audio results or room labels were mocked.

The existing harnesses were adapted to drive the current app and only the requested rows. Tests explicitly recorded all 12 presets, selecting-hand placement, aiming-source preview/alignment, flight timing, pokes and near-seed negatives, focus and undo boundaries, persistence/lost anchors, move/archive, all six palm-up actions and Close latch, combined-setting pixels/highlights, and actual Glasses geometry/rectangle/icon bounds in normal, Large and sample states. Superseded captures and row observations were replaced.

| t11 complete capture | Console errors | Page errors | Failed requests | HTTP errors |
| --- | ---: | ---: | ---: | ---: |
| Quest office + edge cases | 0 | 0 | 0 | 0 |
| Kitchen | 0 | 0 | 0 | 0 |
| Glasses | 0 | 0 | 0 | 0 |
| Integration inventory loop | 0 | 0 | 0 | 0 |
| Door-facing first growth | 0 | 0 | 0 | 0 |

Each capture has its full event stream and counters under `audit/raw/t11-*`. Isolated native IndexedDB-version failure, production runtime and clip playback also have separate clean console/page/network captures. The native storage-open failure displayed the required honest error state and did not prevent entry/tray initialization.

The integration loop covered create, check-in, focus, Week, sample, move, archive and reload: **0 application API calls, 0 history uploads, 0 chain RPC/contract calls, 0 wallet signatures/transactions and 0 product MCP calls**. Static app/scene/SDK/font downloads, Vite HMR and the IWSDK `__iwer_mcp` test-runner bridge are classified separately. Ten SDK asset URLs contain a `mcp/` directory; they are static module GETs, not product tool invocations. [Inventory](audit/raw/t11-inventory.json.gz).

Existing DEV calendar, elapsed-timer, completed-history and performance fixtures are explicitly labelled in the observations. Native missing-capability configuration and deletion of actual persisted emulator handles supplied the denial/loss cases; no replacement API results were used. DEV elapsed days are not actual separate-day footage.

## Core, production and performance

- **61 core tests passed in 6 files**. The existing [pure undoOne assertion](audit/2d/D2-33.json), checked against the current implementation, returned `count: 0`, `completedNow: false`, `saturated: true`; preceding-day history stayed unchanged. [Test output](audit/raw/t11-core-vitest.txt).
- **Typecheck passed.** [Output](audit/raw/t11-typecheck.txt).
- **Production build passed**, printing `check-dist: no test hooks or test clock in the production build`. The production HTTP runtime had undefined `window.__mebae` and a real advancing wall clock. The dev server was not used as production proof. [Build](audit/raw/t11-build.txt), [runtime](audit/raw/t11-production.json).

| 600-frame, six-stage-7-plant sample | CPU p95 | Raw draw-call max | Raw triangle max |
| --- | ---: | ---: | ---: |
| Exact t10 values relinked for VR-113–115 | 1.30 ms | 48 | 37,664 |
| Additional t11 observed sample | 1.10 ms | 48 | 37,664 |
| Unchanged gates | ≤ 4 ms | ≤ 50 | ≤ 150,000 |

CPU scope is priority −100 `PerfStart` through `scene.onAfterRender`; both samples are uncalibrated desktop emulator proxies, **not headset performance**. Raw renderer calls/triangles include both XR views, without division. The t11 sample had CPU p50 0.80 ms and max 2.10 ms. Native sand-bound WebGL upload counters and CPU stroke writes stayed unchanged over the separate steady interval after raking. [Fresh fixture/sample](audit/raw/t11-special-rows.json.gz), [native sand measurements](audit/raw/t11-focus-exact-rows.json.gz).

## Clip and unavailable conditions

The existing [first-day emulator clip](audit/vr/first-day.mp4) was decoded and played again in Chrome: **35.000 seconds**, 1,050 decoded output frames, no decoder error. Its original capture report records 2,100 captured frames, `error: null` and `multiDayFootage: false`. It shows seed → Stretch on a detected door → one real check-in → stage 1. The later preview is captioned **Example garden (sample data) · NOT a recorded later day**. This is not a new recording or a second actual calendar day. [Playback/probe observation](audit/raw/t11-clip.json). Door-facing growth was also re-observed in the current runtime with before/after captures and the actual unfurl animation trace. [Observation](audit/raw/t11-visual-rows.json.gz).

There are **no remaining FAIL IDs**. The unchanged UNTESTED rows are VR-21, VR-22, VR-26, VR-27, VR-61, VR-63, VR-64, VR-66, VR-69, VR-90, VR-99, VR-122, VR-123, VR-124, VR-125, VR-126 and D2-35. Their exact geometry, native-runtime, storage, actual-day or physical-headset dependencies remain in AUDIT.md. A real headset remains **UNTESTED**.

## Evidence and cleanup

One `mebae` heavy slot was acquired before any server or Chrome and retained for the entire session. All owned server/browser/static-server processes were stopped by PID, with **0 surviving owned PIDs**, and the **slot was released**. Configuration is byte-identical to the integration source: **metaQuest3 / home_office**. `packages/landing/history.json` is the original empty real `mebae.history.v1` ledger. [Cleanup proof](audit/raw/t11-shutdown.json).

Final `audit/` evidence is **14,451,394 bytes**, below 15,000,000. All **203** screenshots are JPEG/WebP; the largest is **78,818 bytes**, below 200,000. Superseded captures/reports were removed, and mixed legacy reports retain only their unchanged UNTESTED-condition observations.

No push, deployment or `.loom/` edit occurred. Changes are left uncommitted for Loom, as required by the authoritative worker-session instruction.
