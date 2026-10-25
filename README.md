# Mebae 芽生え

**Pin each habit to the real place it happens. Pinch the sprout when you do it, and it grows.**

Mebae ("sprouting") is a mixed-reality habit garden for Meta Quest 3 / 3S, built with the Immersive Web SDK (WebXR). A seed
tray sits on your real desk. You plant a habit on the real spot where it happens (stretch at the doorway, water by the
counter, deep work at the desk) and check in by pinching the sprout there. Across days your room fills with a quiet,
living record of what you keep doing.

Meta VR Start Developer Competition 2026 · Track **Productivity** · Division **New Experience** · secondary target
**Best Reason to Come Back**. Submission draft: [HACKATHON_SUBMISSION_FORM.md](HACKATHON_SUBMISSION_FORM.md).
Test evidence: [TESTING.md](TESTING.md).

## What works

| Feature | How |
|---|---|
| Plant a habit | Pinch a seed in the tray → pick 1 of 12 icon presets on a radial → point the hand ray at a real surface → pinch. The seed flies along an arc and roots there |
| Real placement | WebXR hit-test from the pinching hand's target ray (gaze ray on Meta VR Glasses); fallback raycast against detected planes/meshes. Never a guessed position |
| Surface label | `XRMesh.semanticLabel` when the hit is inside a labelled mesh, then the plane's label if the runtime gives one, else orientation + height ("on: door", "on: desk", "on: wall") |
| Anchors | One `XRAnchor` per habit with `requestPersistentHandle()`; IWSDK's own scene anchor holds the tray. 6 habits + 1 tray = 7 of Meta's 8 persistent anchors per site |
| Restore | `restorePersistentAnchor()` at session start. A habit whose anchor can't be restored waits in the tray as a "Pin again" pot (one pinch to re-pin) |
| Check in | Pinch the sprout (ray) or poke it. Counted habits (water 0/8, eye breaks 0/4) add 1 per pinch. A 1 s pinch-hold undoes one |
| Growth | 8 stages per species (moss on walls; fern, maple, bamboo on horizontal surfaces), a deterministic L-system from the history. A missed day pauses growth and the plant rests; it never shrinks or dies. Five completed days in a week bloom |
| Focus | Pinch-drag (rake) the sand for 2 s → 25 min, keep raking to 4 s → 50 min. The rake lines fade as time runs. Wall-clock timer, survives suspend/reload. Each finished block adds a stone |
| Move / remove | Pinch a sprout's stake, then pinch a new surface (moves it, new anchor) or the tray (archives it; history kept) |
| Review | Turn the left palm up → wrist menu → Week: a 7-segment ring per habit. Same button on the tray menu |
| Sample garden | "Example garden (sample data)" toggle shows day 30. Off by default, stamped on the tray, every label and the week view; never saved, exported or mixed with real history |
| Accessibility | High-contrast mode, larger targets (×1.4), one-hand mode (every action is one pinch: an undo chip instead of the hold, a tap instead of raking) |
| Data | IndexedDB only, no account, no server. JSON export/import on the 2D page, validated with readable errors |
| Sound | Synthesised bell chimes (Web Audio), no audio files |

No text entry anywhere: icons plus short preset labels. Hands only; controllers are never required.

**Gaze, honestly:** Quest 3/3S has no eye tracking, so on Quest everything far is the hand ray plus pinch. Eye gaze is used
only on Meta VR Glasses (IWSDK gaze source + pinch). The Glasses emulator suite is in TESTING.md; the recorded run executed 0 checks.

## Repo

```
packages/core     pure TypeScript: habits, growth, focus timer, export/import, sample garden, L-system, restore plan (Vitest)
packages/app      the IWSDK app (Vite + IWER emulator in dev); e2e drivers in packages/app/e2e
packages/landing  one static page (seed packet). The hero looks for media/mebae-whoa.mp4 and the almanac looks for history.json; neither file is in this tree
```

## Run it

Needs Node 24+ (tested on 26.5).

```bash
cd packages/core && npm install && npm test          # unit tests
cd ../app && npm install
npm run typecheck && npm run build                   # build also checks no test hooks ship (scripts/check-dist.mjs)
npm run dev                                          # managed browser with the IWER emulator (Quest 3, home_office room)
```

In the emulator: Enter XR, switch the input to hands, and drive the tray. `e2e/run.mjs` is the scripted hands-only run
(see TESTING.md).

### On a Quest 3 / 3S (Nick, later)

No hosting is needed for a device test:

1. Enable developer mode on the headset, connect USB, accept the debugging prompt. Check `adb devices`.
2. `cd packages/app && npx @iwsdk/cli dev up --no-open` (serves HTTPS on port 8081 with a local certificate).
3. `adb reverse tcp:8081 tcp:8081`, then open `https://localhost:8081/` in the Quest Browser and accept the certificate
   warning. Or, on the same Wi-Fi, open the `runtimeUrls.network` address that `npx @iwsdk/cli dev status` prints.
4. Make sure Space Setup (room scan) is done, so planes, meshes and labels exist. Allow spatial data and hand tracking when
   asked. Tap **Enter your garden**.
5. To test persistence: plant two habits, exit, close the tab, come back the next day and re-enter. Each sprout should be on
   its spot; any that are not show "Pin again" in the tray.

`npm run build` writes `packages/app/dist` (relative `base`), which can be published as-is to GitHub Pages by the
Representative. Nothing has been deployed.

## Unverified

The IWER suites in `docs/emulator-results.json` (2026-10-25, status `blocked`) executed 0 product checks. CPU p95, draw calls, triangles, and console errors were not measured (`null`). `docs/whoa-result.json` is absent, so no whoa clip path is recorded. Core unit tests are in [TESTING.md](TESTING.md): 61 passed, 0 failed, on 2026-10-25.

Still unverified on hardware: persistent-anchor restore across days in Quest Browser, hit-test on real surfaces, real hand-tracking pinch reliability, and 72 fps on Quest.

## Licence

MIT, © 2026 Nivesh Gajengi. Fonts: Rethink Sans and Sono (SIL OFL, loaded from Google Fonts). All meshes, textures and sounds
are procedural; there are no third-party assets.
