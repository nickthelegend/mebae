Local D2 audit evidence, 2026-10-27 (Asia/Kolkata).

`run.mjs` attaches Playwright to the single Chrome for Testing process started by the required IWSDK CLI command. It starts no browser or server. Every browser row has its own isolated context, console/page-error capture, complete request/response/failure log, actual observations and explicit checks in `D2-NN.json`. Screenshots are JPEG, quality 50. `results.json` summarizes the final row artifacts.

The landing files were served unchanged at http://127.0.0.1:4321/. Almanac fixtures were written temporarily to that server's `packages/landing/history.json` and removed in `finally`. D2-10 exercises missing/non-OK (404), unparseable, wrong-format, missing-ledger, sample and incomplete-day files on both documents. D2-11 uses 18 completed days and overlapping habits to check every stage/color and maximum stage. D2-06 feeds invalid MP4 bytes with HTTP 200 to the browser's real media decoder. D2-07 counts native `play()` calls with a pass-through observer. Expected history 404 resource messages and user-agent favicon probes are preserved in logs and excluded only under the explicit audit exceptions. Font failures are never exempted.

The app was served by `npx @iwsdk/cli dev restart --open --ai-mode agent --allow-browser-automation`; readiness was confirmed by `browserCommandReady: true` before Playwright attached. The HTTPS development certificate was accepted. The localhost origin enables the real IWER browser XR emulator. For D2-28 and D2-34, the same dev server's local network origin disables IWER through the SDK's existing localhost activation rule, allowing native Chrome's unsupported `immersive-ar` result without replacing WebXR APIs.

Imports use the real file chooser, confirmation dialog, application handlers, IndexedDB and reload. No garden method or state is mocked. The CLI's browser monitor unconditionally dismisses native dialogs. To accept D2-24's real confirmation, the runner briefly pauses only its own Vite process after resource loading, accepts the dialog in Chrome with Playwright, and immediately resumes Vite in a `finally` path. The imported fixture contains one active Stretch, one archived Read, completed-day history, one focus stone, and foreign persistent-anchor handles. The row also enters IWER, observes the actual `pin-again` outcome, no live habit anchor or guessed sprout, and a visible named tray card. Pass-through `fillText()` capture verifies that card actually draws “Pin again” and “Stretch”.

D2-26 creates a real IndexedDB database at version 2 before the application opens version 1. The native request fails through `req.onerror`; the captured status is exactly:

> Storage unavailable: IndexedDB unavailable: The requested version (1) is less than the existing version (2).. History cannot be saved in this browser.

D2-27 stores a malformed real IndexedDB ledger (`habits: null`) and reloads. `garden.load()` resolves, then `summary()` throws inside `main()`. The exact visible error is:

> Mebae could not start: Cannot read properties of null (reading 'filter')

This row is FAIL because the expected `main().catch` path also calls `console.error(TypeError)`. Its UI checks pass, but the user's zero-console-error rule still fails the row. No product fix was made under this audit-only scope. Other tested browser rows have no unexpected console errors, page errors, failed requests or HTTP errors.

`core-vitest.txt` contains the required installed-core Vitest run. Its file/test counts appear only on the pure-core D2-33 row. `check-core.mjs` adds exact-value assertions against the real core bundled in memory; `core-assertions.json` retains actual errors and returned values for the pure portions of D2-30 through D2-33. These do not substitute for the separately executed browser imports.

D2-35 remains UNTESTED: a real Quest headset is required. This evidence makes no real-headset claim. Product source, VR audit rows and `.loom/` were not edited. No deployment or push was performed.
