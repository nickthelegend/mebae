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
| Project URL | **TODO (Representative):** the GitHub Pages URL of `packages/app/dist` |
| Video (<3 min, YouTube/Vimeo) | **TODO (Representative):** upload. Video source recorded at `/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/mebae-whoa.mp4` (35.2 s, 1280×1364 h264). Qualified by the driver as a first-day capture plus labelled sample preview, not multi-day footage (`packages/app/e2e/whoa.mjs`). Multi-day footage is still yours to record. |
| Target launch date | **TODO (Representative)** |
| Team | **TODO:** Representative (eligible, VR Start member) + Nick (non-Representative member) with emails and roles |

## Description (≈400 words, edit in your own voice)

**Inspiration.** Habit apps live in your phone, the one place where the habit never happens. The best reminder is the place itself:
the doorway where you stretch, the counter where the water glass sits, the desk where deep work starts. Mixed reality can put the
habit right there.

**What it does.** A small seed tray sits on your real desk. Pinch a seed, pick one of 12 icons on a radial (stretch, water, read,
deep work…), point your hand ray at the real spot and pinch: the seed flies there and takes root on that surface, labelled with
what the room scan says it is ("on: door"). Each time you do the habit, pinch the sprout and it grows: 8 stages per species (moss
on walls, fern, maple, bamboo), drawn procedurally from your history. Counted habits like water go 1/8 → 8/8; a 1-second hold
undoes one. Rake the sand in the tray for 2 seconds to start a 25-minute focus block; the rake lines fade as time runs, so the
sand is the timer, and each finished block leaves a stone. Turn your left palm up for the week rings.

**Why you come back.** Growth is visible between sessions and anchored where you live. Missing a day pauses growth; it never kills
the plant. Five good days in a week bring a bloom. Persistent anchors (one per habit, 7 of Quest's 8 per site with the tray) put
every sprout back on its spot tomorrow; if one can't be restored, it waits in the tray with "Pin again" instead of appearing in a
guessed place.

**How we built it.** IWSDK on WebXR: hit-test placement against real surfaces, XRPlane/XRMesh labels, one XRAnchor per habit with
`requestPersistentHandle`, hand rays and pinch everywhere (no controllers), gaze + pinch on Meta VR Glasses. Plants are an
L-system with instanced leaves and a moss shader; chimes are synthesised with Web Audio. History stays on the headset (IndexedDB),
with JSON export. A pure-TypeScript core is unit tested (61 passed, 0 failed, on 2026-10-25; see TESTING.md). The recorded headless IWER run completed with 50 passed checks and 1 failure on the draw calls gate (max 92 vs ≤ 50 target due to desktop stereo count without multiview, 0 console errors; see TESTING.md).

**What's next.** Morning and evening ritual sequences, a shared family garden, and a weekly bloom recap.

**Honesty notes.** The "Example garden (sample data)" toggle shows what day 30 looks like; it is off by default and stamped on
every view. No multi-day footage is in this repo. The recorded whoa clip (`/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/mebae-whoa.mp4`) has `multiDayFootage: false` and is qualified by the driver as a first-day capture plus a labelled sample preview. Real separate-day footage is still required.

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
| Innovation & Creativity | Habits bound to real places, with growth you see in the room. Persistent anchors drive daily repeat use |
| Experience Design | First habit pinned and checked in under 60 s, seated, hand ray for far spots; morning/evening rituals; passthrough is the point (the room is the reminder) |
| Technical Implementation | One persistent anchor per habit with an honest "Pin again" restore path, hit-test placement with scene labels, a wall-clock timer that survives suspend. Glasses (gaze + pinch, FoV) has an emulator suite; the recorded run passed all 8 checks (0 console errors; TESTING.md) |
| Polish & Presentation | Procedural L-system plants and moss shader, synthesised chimes, seed-packet brand. The recorded whoa clip (`/Volumes/Extreme SSD/Projects/grokbot/videos/mebae/mebae-whoa.mp4`) is a first-day capture plus a labelled sample. Multi-day footage is still the Representative's |
| Reason to Come Back | Visible growth between sessions, weekly blooms, gentle streaks (missed days pause, never punish) |

## Representative must do

1. Be eligible and a VR Start member; join Devpost; create the team; add Nick as a non-Representative member.
2. Genuinely own part of the build: design the 12 habit presets and the growth art direction; use Mebae daily from about Oct 30
   (emulator or a Quest) so the multi-day footage is real; write the description.
3. Own the repo, Pages, the video and the submission (Track Productivity, Division New Experience) by Nov 17 18:00 UTC; freeze
   until about Dec 11.
4. With a Quest 3/3S: test persistent-anchor restore over at least 2 days (unverified on hardware so far).
