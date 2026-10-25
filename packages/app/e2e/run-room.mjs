// Room-independent hands smoke. Uses detected furniture, with no hard-coded
// office coordinates. Matrix runs it in IWER's built-in kitchen.
import { check, cli, ev, pinchAt, resetResults, sleep, summary, until, v3, xr } from './lib.mjs';

export async function main() {
  resetResults();
  ev('m.wipe()');
  cli(['browser', 'reload']);
  await sleep(2500);
  if (!xr('status').sessionActive) xr('enter');
  xr('set-input-mode', { mode: 'hand' });
  await until(() => ev('m.state().room.planes') > 0, 'detected room');
  const fixture = ev('m.roomFixture()');
  xr('set-transform', { device: 'headset', position: v3(fixture.seated), orientation: { pitch: -30, yaw: 0, roll: 0 } });
  await until(() => ev('m.state().tray?.placed'), 'tray on furniture', 20_000);
  let t = ev('m.targets()');
  check('tray uses detected furniture', ev('m.state().tray.how') !== 'float', fixture.label);
  await pinchAt('hand-right', t.seed);
  await until(() => ev('m.state().mode') === 'radial', 'radial');
  t = ev('m.targets()');
  await pinchAt('hand-right', t.icons[1]);
  await until(() => ev('m.state().mode') === 'aiming', 'aiming');
  await pinchAt('hand-right', fixture.centre);
  await until(() => ev('m.state().mode') === 'idle', 'rooted');
  await until(() => ev('m.state().sprouts.length') === 1, 'anchored sprout');
  const h = ev('m.state().habits[0]');
  check('habit pinned to a detected top', !!h.placement && ev('m.state().anchors.live') === 1, h.placement?.surfaceLabel);
  t = ev('m.targets()');
  for (let i = 0; i < 3; i++) await pinchAt('hand-right', t.sprouts[h.id].label);
  check('three water pinches reach 3/8', ev('m.state().habits[0].today') === 3);
  await pinchAt('hand-right', t.sprouts[h.id].label, 1.3);
  check('hold undoes one: 2/8', ev('m.state().habits[0].today') === 2);
  await pinchAt('hand-right', t.menuButtons[0]);
  check('Week opens with a hand pinch', ev('m.state().weekOpen'));
  const logs = cli(['browser', 'logs', '--input-json', JSON.stringify({ count: 200 })]);
  const errors = (logs.logs ?? logs.entries ?? []).filter((l) => l.level === 'error');
  check('zero console errors (room smoke)', errors.length === 0, JSON.stringify(errors));
  return summary();
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((r) => { process.exitCode = r.failed ? 1 : 0; }).catch((e) => { console.error(e); process.exitCode = 2; });
