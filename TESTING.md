# Testing

Evidence only. Sources, in this order:

1. [`docs/emulator-results.json`](docs/emulator-results.json), recorded `2026-10-25T13:41:52.147Z`, `sourceCommit` `00cbb12`, `status` `completed_with_failures`. `qualification`: "Uncalibrated desktop CPU/render proxy; unverified on Quest hardware." This page copies that file. It does not re-run Chrome.
2. [`docs/whoa-result.json`](docs/whoa-result.json), recorded `2026-10-25T13:53:03.279Z`. Video path: `/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/mebae-whoa.mp4` (landing copy: `packages/landing/media/mebae-whoa.mp4`). Duration: 35.2 s (frames: 2100, 1280×1364 h264). Qualification: "First-day capture plus labelled sample preview. Real separate-day footage is still required." `multiDayFootage: false`.
3. Vitest, re-run in this worktree on 2026-10-25 with no Chrome and no heavy slot. `node_modules` was missing, so the run was `cd packages/core && npm install && npm test`. Vitest v3.2.7. **6 files, 61 tests passed, 0 failed.**

## How to run

### Core unit tests

No dev server, no Chrome, no heavy slot.

```bash
cd packages/core && npm install && npm test
```

`npm test` is `vitest run`. Counts from the 2026-10-25 re-run:

| File | Tests |
|---|---|
| `test/clock.test.ts` | 5 passed |
| `test/growth.test.ts` | 9 passed |
| `test/habits.test.ts` | 12 passed |
| `test/timer.test.ts` | 7 passed |
| `test/history.test.ts` | 17 passed |
| `test/lsystem.test.ts` | 11 passed |
| **Total** | **61 passed, 0 failed (6 files)** |

### Heavy slot

Any dev server or headless Chrome takes the shared slot first, then releases it after that server and Chrome are gone. Unit tests and this file do not take a slot.

```bash
"/Volumes/Extreme SSD/Projects/grokbot/tools/heavy-slot.sh" acquire mebae
"/Volumes/Extreme SSD/Projects/grokbot/tools/heavy-slot.sh" release mebae
```

The recorded emulator run acquired `mebae` before running the suites and released it after finishing.

### Emulator suites

From `packages/app`, against an already-started managed runtime. `e2e/run.mjs` starts no server. Suites: `quest`, `glasses`, `kitchen`, `perf`. Unknown names throw. Reports go to `MEBAE_OUT` (default `e2e-out/`, gitignored).

The recorded startup command used the managed browser with browser automation enabled:

```bash
cd packages/app
npx @iwsdk/cli dev restart --open --ai-mode agent --allow-browser-automation
```

`startup.serverPid` is `26670`. `ps` resolved to `/bin/ps`. Note from the recording: "dev up --no-open left the managed browser not_launched, so no suite could run. The live server was restarted with --open. PATH resolved ps to /bin/ps. No lstart shim."

Commands recorded in `docs/emulator-results.json`, in order:

```bash
hash -r && PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH && command -v ps
node -e execFileSync('/bin/ps', ['-p', pid, '-o', 'lstart='], LC_ALL=C TZ=UTC)
/Volumes/Extreme SSD/Projects/grokbot/tools/heavy-slot.sh acquire mebae
npx @iwsdk/cli dev restart --open --ai-mode agent --allow-browser-automation
MEBAE_OUT=e2e-out node e2e/run.mjs kitchen
node scripts/set-device.mjs metaQuest3 home_office
MEBAE_OUT=e2e-out node e2e/run.mjs quest
node scripts/set-device.mjs metaVRGlasses home_office
MEBAE_OUT=e2e-out node e2e/run.mjs glasses
node scripts/set-device.mjs metaQuest3 home_office
MEBAE_OUT=e2e-out node e2e/run.mjs perf
restore packages/app/iwsdk.config.json to metaQuest3 / home_office
/Volumes/Extreme SSD/Projects/grokbot/tools/heavy-slot.sh release mebae
```

`scripts/set-device.mjs` only edits `iwsdk.config.json` (`metaQuest3` or `metaVRGlasses`, `home_office` or `kitchen`). The quest driver expects Quest 3 in `home_office`. The glasses driver expects `metaVRGlasses`. The kitchen driver is the room smoke (`e2e/run-room.mjs`) on detected furniture. The perf driver is a dev-only six-plant fixture, not the hands-only loop. After running, `iwsdk.config.json` was restored to `metaQuest3` / `home_office`.

### Whoa capture

`e2e/whoa.mjs` is a separate browser script that exports `run({ page, frame, cdp })`. It records a 35-second walkthrough: first-day planting and check-in, then an example garden preview with stamped sample data. Output was captured to `docs/whoa-result.json` and rendered to `/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/mebae-whoa.mp4`.

## Check totals

Counts copied exactly from `docs/emulator-results.json` (`passFail` and `consoleErrors`):

| Suite | Profile | Passed | Failed | Console Errors | Status / Details |
|---|---|---|---|---|---|
| quest | `metaQuest3` / `home_office` | 30 | 0 | 0 | 30 of 30 checks passed |
| glasses | `metaVRGlasses` / `home_office` | 8 | 0 | 0 | 8 of 8 checks passed |
| kitchen | `metaQuest3` / `kitchen` | 6 | 0 | 0 | 6 of 6 checks passed |
| perf | `metaQuest3` / `home_office` | 6 | 1 | 0 | 6 of 7 checks passed (draw calls gate failed) |
| **Total** | | **50** | **1** | **0** | **51 checks executed** |

Core Vitest, this session: **61 passed, 0 failed (6 files).**

### Suite check details

- **`quest` suite (30 passed, 0 failed, 0 console errors):**
  - cold load: tray placed on a real surface (`desk on desk`)
  - scene understanding sees the room (`planes 13, meshes 9`)
  - 3. habit created with an XRAnchor (`anchorUuid: 17be7c02-f31a-4856-9b41-52c23ce70ecf, surfaceLabel: door, surface: wall`)
  - 3. surface label from the room scan (`door`)
  - 3. sprout at the hit point (±2 cm) (`0.00 cm, via hit-test`)
  - 4. check-in reaches stage 1
  - first habit pinned and checked in under 60 s (`11.8 s through check-in (10.0 s to pin)`)
  - 5. water planted on the desk (`desk`)
  - 5. three pinches: 3/8
  - 5. pinch-hold 1 s undoes one: 2/8
  - 6. raking started the focus timer (`rake 3302 ms, 191 texture writes, 25 min`)
  - 7. history restored after reload
  - 7. persistent anchors restored (`stretch-1` and `water-2` restored)
  - 7. sprouts back on their spots (±1 cm) (`0.00 cm, 0.00 cm`)
  - 7. focus timer survived the reload
  - one-hand focus cancellation uses a single pinch
  - one-hand focus starts 25 minutes
  - one-hand focus extends to 50 minutes
  - suspend completion adds exactly one stone
  - 7b. lost anchors go to "Pin again" (`["pin-again","pin-again"]`)
  - 7b. a "Pin again" pot is in the tray
  - 7b. one pinch re-pins it with a new anchor
  - 8. next day check-in grows to stage 2 (`2026-10-26`)
  - 8. three missed days: resting, stage kept
  - palm up shows the wrist menu
  - wrist "Week" opens the week rings
  - sample garden on: only sample sprouts drawn
  - sample focus interaction leaves real history untouched
  - sample garden off: real history untouched
  - zero console errors

- **`glasses` suite (8 passed, 0 failed, 0 console errors):**
  - Glasses profile active with gaze (`Meta VR Glasses; ["local-floor","bounded-floor","hand-tracking","anchors","hit-test","plane-detection","mesh-detection","gaze-tracking","eye-tracking","viewer","local"]`)
  - gaze + pinch on the seed opens the radial
  - gaze aim + pinch pins a habit on the desk (`desk`)
  - gaze + pinch checks in (stage 1)
  - gaze + pinch opens the week rings
  - gaze disconnected: hand ray closes the week view
  - every key element inside the Glasses FoV (37/25/43 with 3° margin)
  - zero console errors (Glasses)

- **`kitchen` suite (6 passed, 0 failed, 0 console errors):**
  - tray uses detected furniture (`table`)
  - habit pinned to a detected top (`table`)
  - three water pinches reach 3/8
  - hold undoes one: 2/8
  - Week opens with a hand pinch
  - zero console errors (room smoke)

- **`perf` suite (6 passed, 1 failed, 0 console errors):**
  - 600-frame sample (`600 frames`)
  - CPU p95 ≤ 4 ms (`2.000 ms`, passed)
  - draw calls ≤ 50 (`92`, failed)
  - triangles ≤ 150000 (`37556`, passed)
  - six grown plants still present
  - idle sand makes no CPU texture writes
  - zero console errors (performance)

## Performance next to the gates

The perf driver (`e2e/run-perf.mjs`) gates a 600-frame sample of six stage-7 plants:

| Gate Target | Recorded Value (`perf`) | Status |
|---|---|---|
| CPU p95 ≤ 4 ms | `cpuMs.p95`: `2` ms (`2.000 ms`) | **Pass** (`cpuMsP95Pass: true`) |
| draw calls ≤ 50 | `drawCalls.max`: `92` | **Fail** (`drawCallsPass: false`) |
| triangles ≤ 150000 | `triangles.max`: `37556` | **Pass** (`trianglesPass: true`) |
| 0 console errors | `consoleErrors`: `0` | **Pass** |

Frames: `600`.

Qualification string from `docs/emulator-results.json`:

> Uncalibrated desktop CPU/render proxy; unverified on Quest hardware.

Driver note from `docs/emulator-results.json`:

> Desktop Chrome has no OCULUS_multiview, so renderer.info.render.calls counts both XR views. 92 is 46 submits per eye. The gate is the raw counter, max <= 50, and this run fails it. CPU p95 and triangles pass. Unverified on Quest hardware; not a 72 fps claim.

## Whoa clip

Recorded output exists in `docs/whoa-result.json`:

- `video`: `/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/mebae-whoa.mp4`
- `landing`: `/Volumes/Extreme SSD/Projects/grokbot/projects/.loom-worktrees/mebae-b1fe5b8c1893/omvnrm4fq/t8/packages/landing/media/mebae-whoa.mp4` (also at `packages/landing/media/mebae-whoa.mp4`)
- Duration: `35.166667` s (2100 frames, h264, 1280×1364)
- `multiDayFootage`: `false`
- `initialDay`: `2026-10-25`
- `error`: `null`

The driver's qualification (`docs/whoa-result.json`):

> First-day capture plus labelled sample preview. Real separate-day footage is still required.

The whoa clip consists of 35 seconds of emulator input: a first-day planting and growth to stage 1, then a stamped sample preview showing day 30. Captions include "Example garden (sample data) · NOT a recorded later day" and "One real check-in · stage 1 · no clock advancement". As qualified by the driver, this capture is a first-day take plus a labelled sample preview; it cannot replace the Representative's real multi-day recordings across separate calendar days.

## Test-only clock

`advanceDays` is test-only. The shipped garden uses `systemClock` (`packages/app/src/state/garden.ts`).

- Unit tests use `ManualClock.advanceDays` in `packages/core/src/clock.ts`.
- The dev server exposes `window.__mebae.advanceDays` from `packages/app/src/dev/test-hooks.ts`. `packages/app/src/index.ts` imports that module only behind `import.meta.env.DEV`. The quest driver calls `m.advanceDays(1)` and `m.advanceDays(3)`.
- `scripts/check-dist.mjs` runs during `npm run build` and asserts that production output contains no `__mebae`, `advanceDays`, `forgetEmulatorAnchors`, or `perfStart`.

## Hardware still unverified

These were not measured in the emulator runs and remain unverified on headset hardware:

- Persistent anchors across days on Quest Browser
- Hit-test on real surfaces
- 72 fps on Quest
- Real hand-tracking pinch reliability on a headset
