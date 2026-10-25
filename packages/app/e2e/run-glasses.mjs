// Meta VR Glasses profile: gaze targets, a pinch selects. Requires
// dev.emulator.device = "metaVRGlasses" (scripts/set-device.mjs).
import { check, cli, ev, resetResults, sleep, summary, until, v3, xr } from './lib.mjs';

const SEATED = { x: -0.08, y: 1.2, z: -1.35 };

/** Horizontal/vertical angles of a world point from the head looking along `fwd`. */
function angles(head, yawDeg, pitchDeg, p) {
  const yaw = (yawDeg * Math.PI) / 180, pitch = (pitchDeg * Math.PI) / 180;
  const d = [p[0] - head.x, p[1] - head.y, p[2] - head.z];
  // rotate into head frame: undo yaw then pitch
  const x1 = d[0] * Math.cos(yaw) - d[2] * Math.sin(yaw);
  const z1 = d[0] * Math.sin(yaw) + d[2] * Math.cos(yaw);
  const y2 = d[1] * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = d[1] * Math.sin(pitch) + z1 * Math.cos(pitch);
  return { h: (Math.atan2(x1, -z2) * 180) / Math.PI, v: (Math.atan2(y2, -z2) * 180) / Math.PI };
}

async function gazePinch(point) {
  xr('look-at', { device: 'gaze', target: v3(point) });
  await sleep(300);
  xr('select', { device: 'hand-right' });
}

export async function main() {
  resetResults();
  ev('m.wipe()');
  cli(['browser', 'reload']);
  await sleep(2500);
  if (!xr('status').sessionActive) xr('enter');
  await until(() => xr('status').sessionActive, 'XR session');
  const st = xr('status');
  check('Glasses profile active with gaze', st.deviceName === 'Meta VR Glasses' && (st.enabledFeatures ?? []).includes('gaze-tracking'), `${st.deviceName}; ${JSON.stringify(st.enabledFeatures)}`);
  xr('set-input-mode', { mode: 'hand' });
  const PITCH = -30;
  xr('set-transform', { device: 'headset', position: SEATED, orientation: { pitch: PITCH, yaw: 0, roll: 0 } });
  await until(() => ev('m.state().tray?.placed'), 'tray placed', 20_000);

  // FoV: tray corners, menu, focus card, radial and week panel
  let t = ev('m.targets()');
  const pts = { 'tray centre': t.tray, 'tray menu (left)': t.menuButtons[0], 'tray menu (right)': t.menuButtons[4], 'sand centre': t.sand };
  const corners = {};
  const includeBounds = (bounds, names) => names.forEach((name) => {
    bounds[name]?.forEach((p, i) => { corners[`${name} corner ${i + 1}`] = p; });
  });
  includeBounds(t.bounds, ['tray', 'menu', 'focus']);
  // gaze -> seed -> radial
  await gazePinch(t.seed);
  await until(() => ev('m.state().mode') === 'radial', 'radial (gaze + pinch)');
  check('gaze + pinch on the seed opens the radial', true);
  t = ev('m.targets()');
  includeBounds(t.bounds, ['radial']);
  pts['radial top icon'] = t.icons[0];
  pts['radial bottom icon'] = t.icons[6];
  pts['radial left icon'] = t.icons[9];
  pts['radial right icon'] = t.icons[3];
  await gazePinch(t.icons[3]); // deep work
  await until(() => ev('m.state().mode') === 'aiming', 'aiming');
  // aim with the eyes at the desk, right of the tray
  const deskPoint = [t.tray[0] + 0.3, t.tray[1] + 0.003, t.tray[2] - 0.12];
  await gazePinch(deskPoint);
  await until(() => ev('m.state().mode') === 'idle', 'rooted');
  await sleep(400);
  let s = ev('m.state()');
  const dw = s.habits.find((h) => h.label === 'Deep work');
  check('gaze aim + pinch pins a habit on the desk', dw?.placement?.surfaceLabel === 'desk', dw?.placement?.surfaceLabel);
  t = ev('m.targets()');
  await gazePinch(t.sprouts[dw.id].label);
  await sleep(400);
  check('gaze + pinch checks in (stage 1)', ev('m.state()').habits.find((h) => h.id === dw.id).stage === 1);
  await gazePinch(t.menuButtons[0]);
  await sleep(500);
  t = ev('m.targets()');
  check('gaze + pinch opens the week rings', ev('m.state().weekOpen') === true);
  pts['week panel'] = t.week;
  includeBounds(t.bounds, ['week']);
  pts['sprout label'] = t.sprouts[dw.id].label;

  // with gaze disconnected, the hand ray works again
  xr('set-connected', { device: 'gaze', connected: false });
  await sleep(300);
  xr('look-at', { device: 'hand-right', target: v3(t.menuButtons[0]) });
  await sleep(250);
  xr('select', { device: 'hand-right' });
  await sleep(500);
  check('gaze disconnected: hand ray closes the week view', ev('m.state().weekOpen') === false);
  xr('set-connected', { device: 'gaze', connected: true });

  // reset head to straight ahead pitch for the FoV numbers
  const fov = [];
  for (const [name, p] of Object.entries({ ...pts, ...corners })) {
    if (!p) continue;
    const a = angles(SEATED, 0, PITCH, p);
    const inside = Math.abs(a.h) <= 34 && a.v <= 22 && a.v >= -40;
    fov.push({ name, h: +a.h.toFixed(1), v: +a.v.toFixed(1), inside });
  }
  console.table(fov);
  check('every key element inside the Glasses FoV (37/25/43 with 3° margin)', fov.every((f) => f.inside), fov.filter((f) => !f.inside).map((f) => f.name).join(', '));
  const shot = cli(['browser', 'screenshot', '--output-file', `${process.env.MEBAE_OUT ?? '/tmp'}/glasses-fov.png`]);
  console.log('screenshot', shot.screenshotPath ?? shot);
  const logs = cli(['browser', 'logs', '--input-json', JSON.stringify({ count: 200 })]);
  const entries = logs.logs ?? logs.entries ?? logs;
  const errors = (Array.isArray(entries) ? entries : []).filter((l) => l.level === 'error');
  check('zero console errors (Glasses)', errors.length === 0, errors.slice(0, 3).map((e) => e.text ?? e.message).join(' | '));
  return summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((r) => process.exit(r.failed ? 1 : 0)).catch((e) => { console.error(e); process.exit(2); });
}
