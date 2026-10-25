# Testing

Evidence only. Sources, in this order:

1. [`docs/emulator-results.json`](docs/emulator-results.json), recorded `2026-10-25T12:10:31.284Z`, `sourceCommit` `0f8c671d95e98fd5f76108de23a8592185fb454f`, `status` `blocked`. The stacks in that file name the `t4` worktree. This page copies that file. It does not re-run Chrome.
2. `docs/whoa-result.json` is absent. The whoa clip check was not recorded. `/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/` is not on disk.
3. Vitest, re-run in this worktree on 2026-10-25 with no Chrome and no heavy slot. `node_modules` was missing, so the run was `cd packages/core && npm install && npm test`. Vitest v3.2.7 printed start `17:43:22`. **6 files, 61 tests passed, 0 failed.**

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

The recorded emulator run acquired `mebae` and released it from an EXIT trap (`cleanup.heavySlotReleasedByExitTrap: true`).

### Emulator suites

From `packages/app`, against an already-started managed runtime. `e2e/run.mjs` starts no server. Suites: `quest`, `glasses`, `kitchen`, `perf`. Unknown names throw. Reports go to `MEBAE_OUT` (default `e2e-out/`, gitignored).

The recorded startup command failed before any suite could talk to the app:

```bash
cd packages/app
npx @iwsdk/cli dev up --no-open --ai-mode agent --allow-browser-automation
```

`startup.ok` is `false`. `cliError` is `dev_up_exit`. `runtimeError` is `runtime_owner_identity_unavailable`. `serverPid` is `null`. The diagnostic `ps -p $$ -o lstart=` exited 127 with `zsh:1: operation not permitted: ps`. Every suite then exited with `cli_error`: no running IWSDK runtime. No app interaction and no performance sample ran.

Commands recorded in `docs/emulator-results.json`, in order, after `npm install` and a passing `npm run typecheck`:

```bash
cd packages/app
MEBAE_OUT=e2e-out node e2e/run.mjs quest

node scripts/set-device.mjs metaVRGlasses home_office
node e2e/run.mjs glasses

node scripts/set-device.mjs metaQuest3 kitchen
node e2e/run.mjs kitchen

node scripts/set-device.mjs metaQuest3 home_office
node e2e/run.mjs perf

node scripts/set-device.mjs metaQuest3 home_office
```

`scripts/set-device.mjs` only edits `iwsdk.config.json` (`metaQuest3` or `metaVRGlasses`, `home_office` or `kitchen`). The quest driver expects Quest 3 in `home_office`. The glasses driver expects `metaVRGlasses`. The kitchen driver is the room smoke (`e2e/run-room.mjs`) on detected furniture. The perf driver is a dev-only six-plant fixture, not the hands-only loop. Restore `metaQuest3` / `home_office` before committing.

### Whoa capture

`e2e/whoa.mjs` is a separate browser script, not a `run.mjs` suite. It was not in the recorded command list. It exports `run({ page, frame, cdp })`, the same entry `e2e/eval.mjs` documents as:

```bash
npx @iwsdk/cli browser run e2e/eval.mjs
```

The whoa script requires `MEBAE_REC_DIR`, sets `MEBAE_REC_SECONDS` to `35`, and throws unless the session is already Quest 3 / `home_office`, hands XR, tray placed, and the real garden empty. It writes `whoa.json`, `captions.txt`, and screencast JPEGs plus `times.txt` (via `e2e/record.mjs`) into `MEBAE_REC_DIR`. `scripts/frames-to-mp4.py` builds an mp4 from that frames directory and an optional captions file. No such output is in this tree.

## Check totals

`passed` / `failed` / `executedChecks` are copied from `docs/emulator-results.json`. For every suite, `failedCountMeaning` is: "One runner interruption; no product assertion was evaluated." Listed checks are all `status: "not_run"` and `ok: null`. `consoleErrorCount` is `null`. `consoleErrorDetail` is "Not captured: no managed browser was started."

| Suite | Profile | Status | Exit | Passed | Failed | Executed | Listed, all `not_run` |
|---|---|---|---|---|---|---|---|
| quest | `metaQuest3` / `home_office` | blocked | 2 | 0 | 1 | 0 | 30 |
| glasses | `metaVRGlasses` / `home_office` | blocked | 2 | 0 | 1 | 0 | 8 |
| kitchen | `metaQuest3` / `kitchen` | blocked | 2 | 0 | 1 | 0 | 6 |
| perf | `metaQuest3` / `home_office` | blocked | 2 | 0 | 1 | 0 | 7 |

Core, this session: **61 passed, 0 failed.**

The same JSON records two checks that did finish, and this session did not re-run them:

| Check | Result in `docs/emulator-results.json` |
|---|---|
| `verification.typecheck.ok` | `true` |
| `verification.productionBuild.ok` | `true`. Detail: "check-dist confirmed no test hooks or test clock in production output." |

`gatesChanged` is `false`.

## Performance next to the gates

The perf driver (`e2e/run-perf.mjs`) gates a 600-frame sample of six stage-7 plants:

| Gate | Recorded value (`suites[perf].metrics`) |
|---|---|
| CPU p95 ≤ 4 ms | `cpuMs.p95`: `null` (check `not_run`) |
| draw calls ≤ 50 | `drawCalls.max`: `null` (check `not_run`) |
| triangles ≤ 150000 | `triangles.max`: `null` (check `not_run`) |
| 0 console errors | `consoleErrorCount`: `null` (check `not_run`) |

`metrics.frames` is `null`. `metricsPrinted` is `false`. The file's qualification string:

> Performance is an uncalibrated desktop CPU/render proxy. No metrics were measured or printed in this blocked run. Quest hardware frame rate, including 72 fps, remains unverified.

The driver's own string, which this run did not reach, is: "Uncalibrated desktop CPU/render proxy; unverified on Quest hardware."

## Whoa clip

No path to copy. `docs/whoa-result.json` is absent, and `/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/` does not exist. `packages/landing` also has no `media/mebae-whoa.mp4` and no `history.json`.

The driver states its own qualification in source (`packages/app/e2e/whoa.mjs`). A finished capture would set:

- `multiDayFootage: false`
- `qualification`: "First-day capture plus labelled sample preview. Real separate-day footage is still required."

The file header calls the clip 35 seconds of emulator input: a first-day planting and growth, then a stamped sample preview. It says that preview cannot stand in for the Representative's real multi-day recordings. One caption mark is "Example garden (sample data) · NOT a recorded later day". Another is "One real check-in · stage 1 · no clock advancement". That capture was not recorded here.

## Test-only clock

`advanceDays` is test-only. The shipped garden uses `systemClock` (`packages/app/src/state/garden.ts`).

- Unit tests use `ManualClock.advanceDays` in `packages/core/src/clock.ts`.
- The dev server exposes `window.__mebae.advanceDays` from `packages/app/src/dev/test-hooks.ts`. `packages/app/src/index.ts` imports that module only behind `import.meta.env.DEV`. The quest driver calls `m.advanceDays(1)` and `m.advanceDays(3)`. Those checks are in the 30 quest rows above, all `not_run`.

`npm run build` runs `scripts/check-dist.mjs`, which exits 1 if any `dist/assets/*.js` file contains `__mebae`, `advanceDays`, `forgetEmulatorAnchors`, or `perfStart`. The recorded production-build check says that assertion passed. This session did not rebuild.

## Hardware still unverified

These were not measured in the recorded emulator run, and they are still unverified on hardware:

- Persistent anchors across days on Quest Browser
- Hit-test on real surfaces
- 72 fps on Quest

Real hand-tracking pinch reliability on a headset is also unverified. The blocked run never started a managed browser.
