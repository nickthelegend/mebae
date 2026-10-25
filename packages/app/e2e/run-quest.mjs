// Hands-only e2e on the IWER Quest 3 profile (home_office room).
// Requires: `npx @iwsdk/cli dev up --ai-mode agent --allow-browser-automation`.
// Spec plan steps are numbered as in specs/meta-vr/mebae.md.
import { check, cli, dist, ev, pinchAt, resetResults, sleep, summary, until, v3, xr } from './lib.mjs';

const SEATED = { x: -0.08, y: 1.2, z: -1.35 }; // the desk chair in home_office

async function enterSeated() {
  const st = xr('status');
  if (!st.sessionActive) xr('enter');
  await until(() => xr('status').sessionActive, 'XR session');
  xr('set-input-mode', { mode: 'hand' });
  xr('set-transform', { device: 'headset', position: SEATED, orientation: { pitch: -28, yaw: 0, roll: 0 } });
  await until(() => ev('m.state().tray?.placed'), 'tray placed', 20_000);
}

const state = () => ev('m.state()');
const targets = () => ev('m.targets()');

async function plant(presetIndex, aimPoint) {
  let t = targets();
  await pinchAt('hand-right', t.seed);
  await until(() => ev('m.state().mode') === 'radial', 'radial open');
  t = targets();
  await pinchAt('hand-right', t.icons[presetIndex]);
  await until(() => ev('m.state().mode') === 'aiming', 'aiming');
  xr('look-at', { device: 'hand-right', target: v3(aimPoint) });
  await sleep(500);
  xr('select', { device: 'hand-right' });
  await until(() => ev('m.state().mode') === 'idle', 'seed rooted', 10_000);
  await sleep(300);
}

export async function main() {
  resetResults();
  const t0 = Date.now();
  // clean slate
  ev('m.wipe()');
  cli(['browser', 'reload']);
  await sleep(2500);
  await enterSeated();
  let s = state();
  check('cold load: tray placed on a real surface', s.tray.placed, `${s.tray.how} on ${s.tray.on}`);
  check('scene understanding sees the room', s.room.planes > 0 && s.room.meshes > 0, `planes ${s.room.planes}, meshes ${s.room.meshes}`);

  // 1-3: seed -> radial -> hand ray at the door (behind the chair) -> pinch
  const DOOR = [-0.6, 1.2, 1.58];
  await plant(0, DOOR);
  s = state();
  const stretch = s.habits.find((h) => h.label === 'Stretch');
  check('3. habit created with an XRAnchor', !!stretch && s.anchors.live >= 1, JSON.stringify(stretch?.placement));
  check('3. surface label from the room scan', stretch?.placement?.surfaceLabel === 'door', stretch?.placement?.surfaceLabel);
  const sp = s.sprouts.find((x) => x.id === stretch?.id);
  check('3. sprout at the hit point (±2 cm)', sp && dist(sp.position, s.lastPlaced.point) <= 0.02, sp && `${(dist(sp.position, s.lastPlaced.point) * 100).toFixed(2)} cm, via ${s.lastPlaced.via}`);
  const firstPinMs = Date.now() - t0;

  // 4: check in -> stage 1
  let t = targets();
  await pinchAt('hand-right', t.sprouts[stretch.id].label);
  await sleep(400);
  s = state();
  check('4. check-in reaches stage 1', s.habits.find((h) => h.id === stretch.id).stage === 1);
  check('first habit pinned and checked in under 60 s', Date.now() - t0 < 60_000, `${((Date.now() - t0) / 1000).toFixed(1)} s through check-in (${(firstPinMs / 1000).toFixed(1)} s to pin)`);

  // 5: counted water on the desk: 3 pinches -> 3/8, hold 1 s -> 2/8
  t = targets();
  const deskPoint = [t.tray[0] + 0.32, t.tray[1] + 0.003, t.tray[2] - 0.15];
  await plant(1, deskPoint);
  s = state();
  const water = s.habits.find((h) => h.label === 'Water');
  check('5. water planted on the desk', water?.placement?.surfaceLabel === 'desk', water?.placement?.surfaceLabel);
  t = targets();
  for (let i = 0; i < 3; i++) {
    await pinchAt('hand-right', t.sprouts[water.id].label);
    await sleep(250);
  }
  check('5. three pinches: 3/8', state().habits.find((h) => h.id === water.id).today === 3);
  xr('select', { device: 'hand-right', duration: 1.3 }, { timeout: 30_000 });
  await sleep(400);
  check('5. pinch-hold 1 s undoes one: 2/8', state().habits.find((h) => h.id === water.id).today === 2);

  // 6: rake the sand (pinch-drag) for > 2 s
  t = targets();
  const [a, b, c, d] = t.sandSpan;
  xr('look-at', { device: 'hand-right', target: v3(a) });
  await sleep(200);
  xr('set-select-value', { device: 'hand-right', value: 1 });
  // Every discrete move is capped to 120 ms of rake time by the app, so use
  // enough real moves to cover 2 s instead of crediting time spent stationary.
  const path = Array.from({ length: 28 }, (_, i) => [b, d, c, a][i % 4]);
  for (const p of path) {
    xr('look-at', { device: 'hand-right', target: v3(p) });
    await sleep(330);
  }
  xr('set-select-value', { device: 'hand-right', value: 0 });
  await sleep(400);
  s = state();
  check('6. raking started the focus timer', s.focus.running, `rake ${Math.round(s.focus.rakeMs)} ms, ${s.focus.rakeWrites} texture writes, ${s.focus.minutes} min`);

  // 7: reload -> habits, history and anchors restore
  const before = state().sprouts;
  cli(['browser', 'reload']);
  await sleep(2500);
  await enterSeated();
  await until(() => ev('m.state().anchors.outcomes') !== null && ev('m.state().sprouts.length') === 2, 'sprouts restored', 20_000);
  s = state();
  check('7. history restored after reload', s.habits.length === 2 && s.habits.find((h) => h.label === 'Water').today === 2);
  check('7. persistent anchors restored', s.anchors.outcomes.every((o) => o.status === 'restored'), JSON.stringify(s.anchors.outcomes));
  const moved = before.map((p) => dist(p.position, s.sprouts.find((x) => x.id === p.id).position));
  check('7. sprouts back on their spots (±1 cm)', moved.every((m) => m < 0.01), moved.map((m) => `${(m * 100).toFixed(2)} cm`).join(', '));
  check('7. focus timer survived the reload', s.focus.running);

  // 7b: lost anchors -> Pin again, never a guessed position
  ev('m.forgetEmulatorAnchors()');
  cli(['browser', 'reload']);
  await sleep(2500);
  await enterSeated();
  await until(() => ev('m.state().anchors.outcomes') !== null, 'restore pass');
  s = state();
  check('7b. lost anchors go to "Pin again"', s.anchors.outcomes.every((o) => o.status === 'pin-again') && s.sprouts.length === 0, JSON.stringify(s.anchors.outcomes.map((o) => o.status)));
  t = targets();
  const pot = t.sprouts[stretch.id].pot;
  check('7b. a "Pin again" pot is in the tray', !!pot);
  await pinchAt('hand-right', pot);
  await until(() => ev('m.state().mode') === 'aiming', 'aiming for re-pin');
  xr('look-at', { device: 'hand-right', target: v3(DOOR) });
  await sleep(500);
  xr('select', { device: 'hand-right' });
  await until(() => ev('m.state().mode') === 'idle', 're-pinned');
  await sleep(300);
  s = state();
  check('7b. one pinch re-pins it with a new anchor', s.sprouts.some((x) => x.id === stretch.id) && s.habits.find((h) => h.id === stretch.id).stage === 1);

  // 8: advance the day with the test clock
  ev('m.advanceDays(1)');
  t = targets();
  await pinchAt('hand-right', t.sprouts[stretch.id].label);
  await sleep(400);
  s = state();
  check('8. next day check-in grows to stage 2', s.habits.find((h) => h.id === stretch.id).stage === 2, s.today);
  ev('m.advanceDays(3)');
  s = state();
  const h = s.habits.find((x) => x.id === stretch.id);
  check('8. three missed days: resting, stage kept', h.stage === 2 && h.vitality === 'resting');

  // review: palm up -> wrist menu -> Week
  xr('set-transform', { device: 'hand-left', position: { x: -0.2, y: 1.0, z: -1.65 }, orientation: { fingers: 'forward', palm: 'up' }, anchor: 'wrist' });
  await sleep(700);
  s = state();
  check('palm up shows the wrist menu', s.palmUp === true);
  t = targets();
  if (t.wrist) await pinchAt('hand-right', t.wrist[0]);
  await sleep(400);
  check('wrist "Week" opens the week rings', state().weekOpen === true);

  // sample garden: stamped and never mixed
  t = targets();
  await pinchAt('hand-right', t.menuButtons[1]);
  await sleep(500);
  s = state();
  check('sample garden on: only sample sprouts drawn', s.sample && s.sprouts.every((x) => x.sample) && s.sprouts.length === 5);
  const realBeforeSampleRake = ev('m.exportJson()');
  await pinchAt('hand-right', targets().sand);
  check('sample focus interaction leaves real history untouched', ev('m.exportJson()').replace(/"exportedAt": "[^"]+"/, '') === realBeforeSampleRake.replace(/"exportedAt": "[^"]+"/, ''));
  await pinchAt('hand-right', targets().menuButtons[1]);
  await sleep(500);
  s = state();
  check('sample garden off: real history untouched', !s.sample && s.habits.length === 2 && s.sprouts.every((x) => !x.sample));

  // Every one-hand action stays a single pinch, including focus cancellation.
  await pinchAt('hand-right', targets().menuButtons[4]);
  await pinchAt('hand-right', targets().sand); // 25 -> 50, or cancel an existing 50
  if (state().focus.running) await pinchAt('hand-right', targets().sand);
  check('one-hand focus cancellation uses a single pinch', !state().focus.running);
  await pinchAt('hand-right', targets().sand);
  check('one-hand focus starts 25 minutes', state().focus.running && state().focus.minutes === 25);
  await pinchAt('hand-right', targets().sand);
  check('one-hand focus extends to 50 minutes', state().focus.minutes === 50);
  ev('m.advanceMinutes(51)');
  await sleep(700);
  check('suspend completion adds exactly one stone', state().focus.stones === 1 && !state().focus.running);

  const logs = cli(['browser', 'logs', '--input-json', JSON.stringify({ count: 200 })]);
  const entries = logs.logs ?? logs.entries ?? logs;
  const errors = (Array.isArray(entries) ? entries : []).filter((l) => l.level === 'error');
  check('zero console errors', errors.length === 0, errors.slice(0, 3).map((e) => e.text ?? e.message).join(' | '));
  return summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((r) => process.exit(r.failed ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(2);
    });
}
