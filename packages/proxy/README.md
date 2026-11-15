# Mebae coach proxy (`packages/proxy`)

A single Vercel serverless function, `api/coach.js` (Node runtime, Web `Request`/`Response` handlers, no dependencies). It is
the only place `MODEL_API_KEY` (Meta Model API) lives. The Mebae app in the headset never sees the key; it calls this proxy.

| Route | Input | Models | Output |
|---|---|---|---|
| `GET /api/coach` | none | none | `{ configured, models, routes, limits }` (never the key) |
| `POST /api/coach?route=habit` | `audio/wav`, mono 16-bit PCM, 16 kHz, 0.3–16 s | `muse-voice-transcribe-1.0` → `muse-spark-1.3` (strict JSON schema) | `{ transcript, habit: { preset, target, surface, label }, ms }` |
| `POST /api/coach?route=note` | `{ summary }` from core `weeklySummary` (counts only: no anchors, places or timestamps) | `muse-spark-1.3` | `{ note, ms }` |

Guards: only these two routes and two models; an origin allow-list (`ALLOWED_ORIGINS`, default
`https://nickthelegend.github.io`); per-IP limits (8 a minute, 60 a day) and a global daily cap (400 a day), all
in-memory per function instance (so the real ceiling is instances × cap; the cap is a spend guard, not billing-grade);
body caps (16 s of audio, 8 KB of JSON); input validated before any upstream call; unknown summary fields dropped.

Failures are loud and readable: `503 setup_required` (no key), `429 rate_limited | daily_cap` (with `Retry-After`),
`400/413` bad input, `502 upstream`. A sentence that is not a habit is an answer, not a failure:
`200 { ok: false, error: "not_a_habit" | "not_heard", message }` (Muse is told to refuse rather than guess). The app shows each as
"AI unavailable: …" and the icon path keeps working.

## Tests

```bash
npm test                       # 10 offline tests; the 3 live tests skip with "Setup required" without a key
# live (real Meta Model API, nothing faked); source the key in a subshell, never on the command line:
(set -a; . /path/to/.env; set +a; MEBAE_LIVE_WAV=speech.wav MEBAE_LIVE_NOT_HABIT_WAV=other.wav npm test)
```

`speech.wav` can be made with macOS `say -o speech.wav --data-format=LEI16@16000 "Drink water by the counter, eight a day."`.

## Run locally (for the emulator)

```bash
(set -a; . /path/to/.env; set +a; node dev-server.mjs)          # http://127.0.0.1:8787/api/coach
cd ../app && MEBAE_PROXY_TARGET=http://127.0.0.1:8787 VITE_MEBAE_COACH_URL=/api/coach npx @iwsdk/cli dev up
```

The Vite dev server forwards `/api/coach` to the local proxy, so the page stays same-origin.

## Deploy (not done yet: Claude's main session or the Representative does this)

1. `cd packages/proxy && npx vercel@latest link` (new project, framework "Other", root `packages/proxy`).
2. `npx vercel@latest env add MODEL_API_KEY production` and paste the key at the prompt (never as an argument).
3. Optional: `ALLOWED_ORIGINS` (comma list, e.g. `https://nickthelegend.github.io`), `COACH_DAILY_CAP`,
   `COACH_PER_IP_DAY`, `COACH_PER_MINUTE`.
4. `npx vercel@latest deploy --prod`. Check `curl -H 'Origin: https://nickthelegend.github.io' https://<project>.vercel.app/api/coach`
   returns `"configured": true`.
5. Build the app with `VITE_MEBAE_COACH_URL=https://<project>.vercel.app/api/coach` (the Pages workflow reads the repo
   variable `MEBAE_COACH_URL`). Without it the app shows "AI unavailable: setup required" on the coach card and the week note.
