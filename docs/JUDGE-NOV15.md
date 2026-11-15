# Mebae: headset-judge pass (Nov 15, 2026)

Judged the way a Meta VR Start judge meets it: seated, in the Quest 3 profile of the IWER emulator, looking at frames from
the user's eye. The four criteria are equal (25 % each). Scores are honest and out of 10; no inflation.

## Before (code at `fdaf746`)

Evidence: the existing first-day clip (`grokbot/videos/mebae/mebae-whoa.mp4`, 1280×1364, 35 s) and the t11 audit captures
in `audit/vr/` (`VR-70-*-stage-*.jpg`, `VR-30.jpg`). The app code had not changed since those captures (`fdaf746` only
added art files), so they are frames of the same build.

| Criterion | Score | Why |
|---|---:|---|
| Innovation & Creativity | 6.5 | Pinning a habit to the real place it happens is a fresh MR idea, but nothing on screen sells it: a judge sees a speck on a door |
| Experience Design | 5.0 | The flow is sound (pinch seed → radial → aim → root, hands only, Pin again), but the payoff is invisible from the seat and the only way to say what you want is 12 icons |
| Technical Implementation | 7.0 | Persistent anchors with an honest restore path, hit-test placement with scene labels, wall-clock focus timer, 61 core tests, emulator suites, perf inside the gates |
| Polish & Presentation | 4.5 | Text far below headset legibility, emulator toolbar in the clip, odd 1280×1364 frame, a 35 s clip instead of a film |
| **Mean** | **5.75** | |

### The 5 biggest problems

1. **Plants are specks from the seat.** A stage-1 moss patch on the door is 10 cm across at 3 m (about 2° of view), the same grey-green as the wall art. Early
   stages differ by a centimetre or two, so growth can't be seen.
2. **Every text card fails headset legibility.** Sprout label body text: 30 px on a 400 px canvas mapped to 9.4 cm, so
   4.9 mm cap height at 1 m (bar: 18 mm). Its title: 8.2 mm. Tray menu, toast, focus card, radial hints and the week panel
   were 10-17 mm at their reading distance, scaled to 1 m. Labels on far plants did not grow with distance.
3. **The check-in has no payoff.** An 8 % bounce and a soft chime; from the seat a judge cannot tell it registered.
4. **The film doesn't exist yet**, and the clip shows the IWER Runtime/Editor toolbar in a non-16:9 frame.
5. **Presets only.** A habit is one of 12 icons with a fixed count, so "water, six a day" or "by the counter" can't be said.

### What I fix

| Problem | Fix |
|---|---|
| 1 | Per-stage target sizes (`displaySize` in core: upright 9 → 48 cm, wall moss 7 → 28 cm radius); a glowing halo ring at every plant (amber while today is open, green when done, dim when resting); stage names on labels |
| 2 | One legibility table (`CARDS` in core) that every card is built from, with a unit test that fails any text under 18 mm at 1 m; sprout labels keep their angular size with distance and switch to a compact pill beyond 1.6 m; aim reticle and label scale with distance |
| 3 | Reward FX: a burst of glowing petals, a light ring across the surface, the new count rising above the label; on a stage-up a column of light and an "It grew! Stage 3 of 8 · Seedling" banner; a sparkle chime when the day's goal is met |
| 4 | Agent-mode emulator at 1920×1080 (no toolbar), a 2:30-2:55 film from real input, captions in Rethink Sans |
| 5 | Muse voice coach: hold a seed and say the habit; Muse Voice Transcribe → Muse Spark returns preset, count and place through `packages/proxy`; a weekly note from real counts. Fully optional: without the proxy every view says "AI unavailable" and the icons work |

## After (code at `main`, Nov 15 evening)

Evidence: the film (`grokbot/videos/mebae/mebae-film.mp4`, 2:40, 1920×1080) and the suites in
[TESTING.md](../TESTING.md) ([results](results-nov15/)).

| Criterion | Before | After | Why it moved (or didn't move more) |
|---|---:|---:|---|
| Innovation & Creativity | 6.5 | 7.5 | Say a habit and where it happens; Muse turns it into a preset, a count and a place, and the aim label checks the real surface against the place you named. Habits-as-plants in your room now *reads* on screen |
| Experience Design | 5.0 | 7.0 | Plants read from the seat (door moss 15-21 cm drawn at 3 m, halo ring), every text card meets 18 mm at 1 m, the check-in pays off with petals, a light ring, a rising count and stage banners. Still: the desk is busy when the coach card, toast and labels overlap, and nothing has been tried on a headset |
| Technical Implementation | 7.0 | 7.5 | Key-holding proxy with origin allow-list, per-IP and daily caps, strict JSON schema, refusal instead of guessing, live tests; legibility enforced by a unit test; 115 core + 13 proxy + 71 emulator checks. Perf passes but draw calls sit exactly at the 50 gate |
| Polish & Presentation | 4.5 | 7.0 | A 2:40 film at 1080p of the whole loop from real input, no toolbar, brand captions, the app's own chimes and Chatterbox lines. Held back by: days 2-4 are test-clock days (captioned), the desk shots keep UI at the lower-middle of the frame, the Glasses view is small |
| **Mean** | **5.75** | **7.25** | |

### What is still open

1. **No real multi-day footage.** Growth across days is shown with the dev test clock and says so. Real separate-day
   recordings (Representative, on a Quest) would replace that segment.
2. **Hardware.** Quest Browser mic permission and capture, Chatterbox MP3 playback, persistent anchors across days and
   72 fps are unverified on a headset.
3. **Draw calls at the gate** (50 of 50 in the six-grown-plants sample). One more always-visible mesh needs a merge.
4. **The proxy is not deployed.** Until it is (and the Pages build gets `MEBAE_COACH_URL`), the public app shows "AI
   unavailable: setup required" for the coach, which is the honest state.
5. The coach card, a toast and nearby sprout labels can stack on the desk in the first minute; a tidier layout would
   fade the toast while the card is up.
