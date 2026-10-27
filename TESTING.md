# Testing Mebae

Focused re-verification on **2026-10-27**, source base `19c2d7f`: every former FAIL, all landing rows at desktop and 375 px, D2-27, and the four IWER regression suites. This run directly checked **34 PASS / 0 FAIL / 1 UNTESTED** across 35 audit rows. The audit ledger after these replacements is **147 PASS / 0 FAIL / 17 UNTESTED** across 164 rows. Other rows retain their preceding full-plan evidence; this was not a new execution of all 164 rows.

[AUDIT.md](AUDIT.md) records exact expectations, observations, fixes and dependencies. [Fresh machine-readable results](docs/emulator-results.json) contain the individual suite checks, capture totals, native measurements and cleanup proof.

## Browser regressions from this run

| Suite | Profile / room | Passed | Failed |
| --- | --- | ---: | ---: |
| kitchen | metaQuest3 / kitchen | 6 | 0 |
| quest | metaQuest3 / home_office | 30 | 0 |
| glasses | metaVRGlasses / home_office | 8 | 0 |
| perf | metaQuest3 / home_office | 7 | 0 |
| **Total** | | **51** | **0** |

All four suite captures and the targeted managed-session capture have **0 console errors, 0 page errors, 0 failed requests and 0 HTTP errors**. The fresh Glasses runtime image replaces [glasses-normal.jpg](audit/vr/glasses-normal.jpg). Native IWER hands drove the interactions; Glasses gaze is emulated. A physical Quest or Glasses device was not tested.

| Flat pass | Landing rows + startup-error row | PASS | FAIL |
| --- | ---: | ---: | ---: |
| Desktop | 21 | 21 | 0 |
| 375 px | 21 | 21 | 0 |

D2-01 and D2-02 keep their specified desktop/375 px viewports in both batches. Shipped `history.json` returned **200** and both pages showed **No history recorded yet**. Happy paths had zero console/page/network errors. D2-10 temporarily served an absent/non-OK file, invalid JSON, wrong format, missing ledger, sample ledger and incomplete counts; both pages kept the exact empty text without script console.error. D2-06 forced the real media decoder error and displayed **No emulator clip in this build yet.** The empty shipped ledger and original mp4 bytes were restored. Deliberate broken-file resource logs are retained as negative-test evidence.

D2-27 used a real persisted ledger with `habits:null`. It displayed **Mebae could not start: Cannot read properties of null (reading 'filter')**, class `err`, and exactly its expected main().catch console.error. That expected error was preserved. [Desktop evidence](audit/2d/desktop/D2-27.json), [375 px evidence](audit/2d/mobile/D2-27.json).

## Fixed-row results

[Fresh native observations](audit/raw/t10-verification.json.gz) verify aiming-seed cancellation, aiming-hand-only preview, bloom priority, wrist Close latching, Sample refusal during carrying, and moving at six habits. The sample refusal retains the exact prefix: **Example garden (sample data). Turn off the example garden to plant your own habits.** No new product fix was needed in this task.

VR-70 has **32 stage screenshots**, stages 0–7 for moss, fern, maple and bamboo; each species was planted into its own clean real-ledger garden. Water was aimed from above onto an actual horizontal detected surface to obtain bamboo. Completed-day fixtures are DEV setup, not actual elapsed days. At 22 completed days every species stayed stage 7, displayed **Fully grown**, and reproduced its form after reload. [Stage matrix and image paths](audit/raw/t10-growth-rows.json.gz).

VR-71 verified four-day non-bloom, five-day flowers and **In bloom this week**, persistence through the following week, expiry in the third week, a separate **2-day streak**, and unchanged stage 2 after three missed days. VR-62 used native `XRAnchor.delete()` to invalidate a live tracked pose and observed the exact pin-again toast; no frame/getPose/restore result was substituted.

VR-96 recorded seed/label/stake ×1.4, radial/Pin again ×1.2, and menu height/wrist ×1.4, with a 0.000001 tolerance for native Float32 transforms. A native hand ray selected the enlarged seed; another selected an enlarged stage-7 Read stake in a labelled DEV six-plant fixture. Off restored ×1 and **Larger targets off.**

VR-98 recorded native AudioContext states before and after the first pinch. The SDK's context was already running; the app created its additional running context on that pinch. Native oscillator schedules were root **6** (two notes, three partials each), partial tap **3**, growth **9 plus tap 3**, and undo **6**. Every scheduled oscillator used a running context; **0 audio-file requests** occurred.

## Performance

Exactly **600 rendered frames**, six tracked stage-7 plants, with all six forced into submission. The raw renderer counters include both XR views. No gate was relaxed.

| Gate | Fresh value | Result |
| --- | ---: | --- |
| CPU p95 ≤ 4 ms | **1.30 ms** (p50 0.80, max 2.70) | PASS |
| Raw draw calls max ≤ 50 | **48** | PASS |
| Raw triangles max ≤ 150000 | **37664** | PASS |

These are uncalibrated desktop CPU/render measurements. Quest hardware frame rate remains UNTESTED.

VR-116 confirmed the renderer's native sand texture binding, then counted actual WebGL texImage2D/texSubImage2D calls targeting it during **1100 ms** idle: **0 / 0**, with rakeWrites delta **0** and six tracked stage-7 plants remaining. Global GL upload counts are separately retained: tracked-hand textures continue uploading and are not sand uploads. VR-94 peaked at **8** reserved slots while moving, then returned to **7** including the tray, with **6** active habits and live habit anchors. A later repeated pinch checked in the moved Read once; it created no seventh habit or duplicate anchor/history entry. [Measurements](audit/raw/t10-perf-rows.json.gz).

## Tests and remaining dependencies

- Core Vitest: **61 passed, 0 failed, 6 files passed**. [Output](audit/raw/t10-core-vitest.txt).
- App typecheck: **PASS**. [Output](audit/raw/t10-typecheck.txt).
- App build: **PASS**, including `check-dist: no test hooks or test clock in the production build`. [Output](audit/raw/t10-build.txt).

**No remaining FAIL IDs.** The 17 UNTESTED rows remain VR-21, VR-22, VR-26, VR-27, VR-61, VR-63, VR-64, VR-66, VR-69, VR-90, VR-99, VR-122, VR-123, VR-124, VR-125, VR-126 and D2-35. Their exact native-runtime, geometry, storage, actual-day or hardware dependencies remain in AUDIT.md.

VR-64 was attempted once using Playwright's real dialog.accept(). Managed Chrome auto-dismissed the native confirm first; Playwright reported **No dialog is showing**. This remains UNTESTED, requiring an accept-capable managed native-confirm session. No import success was inferred.

## Evidence and cleanup

One heavy slot was acquired before any server or Chrome and retained through the full session. Evidence is **13,914,141 bytes**, below 15,000,000; all **195** screenshots are JPEG/WebP, largest **78,818 bytes**, below 200,000. Retested evidence replaced prior captures; superseded screenshots and temporary PNGs were deleted. No product methods or XR results were mocked or stubbed; native inputs, static-file fixtures, DEV calendar/perf fixtures and pass-through telemetry are identified in the evidence.

The empty real history file and media file were restored. Configuration is **metaQuest3 / home_office**, byte-identical to the worktree's original config. Owned processes were terminated by PID, with **0 surviving owned PIDs**, and the **mebae heavy slot was released**. [Cleanup proof](audit/raw/t10-shutdown.json). No push, deployment or `.loom/` edit occurred. Changes are left for Loom to commit under the authoritative worker-session instruction.
