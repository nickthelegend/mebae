# Meta VR Start Developer Competition 2026: submission form (Mebae)

Draft for the team's Representative. Rules: [specs/meta-vr/RULES.md](../../specs/meta-vr/RULES.md) in the grokbot folder.
Submit by **Nov 17 18:00 UTC** (deadline Nov 18 20:00 UTC). Freeze the app and Pages branch from the deadline until winners
are announced (about Dec 11).

| Field | Value |
|---|---|
| Name | Mebae (芽生え, "sprouting") |
| Tagline (≤140) | Pin each habit to the real place it happens. Pinch the sprout when you do it, and watch it grow there, day after day. |
| Track | **Productivity** (habits tied to a recurring context: a morning routine, winding down) |
| Division | **New Experience** (repo created Oct 24, 2026, inside the window that opened Sep 24) |
| Award it aims at | Best Reason to Come Back (secondary target; the form has no award field, every entry is considered) |
| Platform | Immersive Web SDK 1.1.0-rc.2 (WebXR), submitted as a public URL opened in the Quest Browser |
| Project URL | **TODO (Representative):** the GitHub Pages URL, `https://nickthelegend.github.io/mebae/app/` once the `pages` workflow is enabled (landing at `/mebae/`) |
| Video (<3 min, YouTube/Vimeo) | **TODO (Representative):** upload `/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/mebae-film.mp4` (2:40, 1920×1080, IWER emulator Quest 3 profile, real hand input; shot list in `mebae-film.md`). Days 2-4 use the dev test clock and the film says so on screen; real separate-day footage is still the Representative's to add if wanted. |
| Target launch date | **TODO (Representative)** |
| Team | **TODO:** Representative (eligible, VR Start member) + Nick (non-Representative member) with emails and roles |

## Description (≈400 words, edit in your own voice)

**Inspiration.** Habit apps live in your phone, the one place where the habit never happens. The best reminder is the place itself:
the doorway where you stretch, the counter where the water glass sits, the desk where deep work starts. Mixed reality can put the
habit right there.

**What it does.** A small seed tray sits on your real desk. Hold a seed and say the habit ("drink water by the counter,
eight a day"): Meta's Muse models turn it into a habit with its daily count and place. Or pinch a seed and pick one of
12 icons on a radial (stretch, water, read, deep work…). Point your hand ray at the real spot and pinch: the seed flies there and takes root on that surface, labelled with
what the room scan says it is ("on: door"). Each time you do the habit, pinch the sprout: petals burst, a ring of light crosses its surface and the new count rises
above it, readable from your chair. It grows: 8 stages per species (moss
on walls, fern, maple, bamboo), drawn procedurally from your history. Counted habits like water go 1/8 → 8/8; a 1-second hold
undoes one. Rake the sand in the tray for 2 seconds to start a 25-minute focus block; the rake lines fade as time runs, so the
sand is the timer, and each finished block leaves a stone. Turn your left palm up for the week rings.

**Why you come back.** Growth is visible between sessions and anchored where you live. Missing a day pauses growth; it never kills
the plant. Five good days in a week bring a bloom. Persistent anchors (one per habit, 7 of Quest's 8 per site with the tray) put
every sprout back on its spot tomorrow; if one can't be restored, it waits in the tray with "Pin again" instead of appearing in a
guessed place.

**How we built it.** IWSDK on WebXR: hit-test placement against real surfaces, XRPlane/XRMesh labels, one XRAnchor per habit with
`requestPersistentHandle`, hand rays and pinch everywhere (no controllers), gaze + pinch on Meta VR Glasses. Plants are an
L-system with instanced leaves and a moss shader, drawn at a target size per stage so they read from the seat; every text
card is checked by a unit test against 18 mm cap height at 1 m. The voice coach records 16 kHz audio in the browser and
sends it to a small Vercel function, the only holder of the Meta Model API key: Muse Voice Transcribe, then Muse Spark
with a strict JSON schema (a sentence that isn't a habit is refused, never guessed). A weekly note from Muse uses counts
only. Chimes are synthesised with Web Audio; four short spoken lines are pre-rendered with Chatterbox TTS. History stays on the headset (IndexedDB),
with JSON export. A pure-TypeScript core is unit tested (115 passed, 0 failed, Nov 15), the proxy has 13 tests (3 live), and the IWER emulator suites pass: Quest 33/33, voice coach 11/11 (plus no-key and proxy-down 3/3 each), Glasses 8/8, kitchen 6/6, performance 7/7 (see TESTING.md). The recorded headless IWER run completed with 50 passed checks and 1 failure on the draw calls gate (max 92 vs ≤ 50 target due to desktop stereo count without multiview, 0 console errors; see TESTING.md).

**What's next.** Morning and evening ritual sequences, a shared family garden, and a weekly bloom recap.

**Honesty notes.** The voice coach is optional: without the proxy the app says "AI unavailable" and everything else works.
The "Example garden (sample data)" toggle shows what day 30 looks like; it is off by default and stamped on
every view. In the film, days 2-4 are advanced with a dev-build test clock and captioned as such. There is no real multi-day footage yet.

## How hand interactions are implemented

- Far: IWSDK hand ray + pinch (`RayInteractable`, WebXR `select`) for seeds, the icon radial, sprouts and menus; near: poke
  (`PokeInteractable`) on the same targets.
- Placement: WebXR hit-test from the pinching hand's target ray (gaze ray on Glasses), falling back to a raycast against the
  detected planes and meshes. No head-gaze is used on Quest 3.
- Tap = check in, 1 s pinch-hold = undo, pinch-drag across the sand = rake (start a focus block), stake pinch = carry a sprout.
- Palm-up (left hand, from WebXR joint poses) shows the wrist menu. Every wrist action also exists on the tray menu.
- One-hand mode turns every action into a single pinch (an undo chip replaces the hold, a tap replaces raking).

## Judging criteria map

| Criterion (25% each) | Mebae |
|---|---|
| Innovation & Creativity | Habits bound to real places, with growth you see in the room. Say the habit and the place: Muse returns a structured habit and the aim checks the real surface against the place you named. Persistent anchors drive daily repeat use |
| Experience Design | First habit pinned and checked in under 60 s, seated, hand ray for far spots; morning/evening rituals; passthrough is the point (the room is the reminder) |
| Technical Implementation | One persistent anchor per habit with an honest "Pin again" restore path, hit-test placement with scene labels, a wall-clock timer that survives suspend. Glasses (gaze + pinch, FoV) has an emulator suite; the recorded run passed all 8 checks (0 console errors; TESTING.md). The voice coach runs through a key-holding proxy (origin allow-list, per-IP and daily caps, strict JSON schema, live-tested) |
| Polish & Presentation | Plants and labels readable from the seat, a visible check-in payoff (petals, light ring, rising count, stage banners), procedural L-system plants and moss shader, synthesised chimes, Chatterbox voice lines, seed-packet brand, a 2:40 film of the whole loop. |
| Reason to Come Back | Visible growth between sessions, weekly blooms, gentle streaks (missed days pause, never punish) |

## Representative must do

1. Be eligible and a VR Start member; join Devpost; create the team; add Nick as a non-Representative member.
2. Genuinely own part of the build: design the 12 habit presets and the growth art direction; use Mebae daily from about Oct 30
   (emulator or a Quest) so the multi-day footage is real; write the description.
3. Own the repo, Pages, the video and the submission (Track Productivity, Division New Experience) by Nov 17 18:00 UTC; freeze
   until about Dec 11.
4. With a Quest 3/3S: test persistent-anchor restore over at least 2 days and the voice coach's microphone in the Quest
   Browser (both unverified on hardware so far).
5. Coach proxy: Claude's main session deploys `packages/proxy` to Vercel (steps in its README); then set the repo
   variable `MEBAE_COACH_URL` so the Pages build points at it. Without it the coach honestly says "AI unavailable".
