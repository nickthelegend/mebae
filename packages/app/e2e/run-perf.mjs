// Six fully grown real-ledger plants, arranged on detected surfaces by a
// dev-only fixture. This is performance setup, never hands-only evidence.
import { check, cli, consoleErrors, ev, resetResults, sleep, summary, until, xr } from './lib.mjs';

export async function main() {
  resetResults();
  const started = Date.now();
  await ev('m.wipe()');
  cli(['browser', 'reload']);
  await sleep(2500);
  if (!xr('status').sessionActive) xr('enter');
  xr('set-input-mode', { mode: 'hand' });
  xr('set-transform', { device: 'headset', position: { x: -0.08, y: 1.2, z: -1.35 }, orientation: { pitch: -28, yaw: 0, roll: 0 } });
  await until(() => ev('m.state().tray?.placed'), 'tray placed', 20_000);
  await ev('m.preparePerf()');
  await until(() => ev('m.state().sprouts.filter(s => s.stage === 7).length') === 6, 'six stage-7 plants');
  await sleep(2500); // unfurl/shader warm-up
  ev('m.forcePlantDraws()'); // include all six even when leaves extend offscreen
  const profile = cli(['browser', 'profile', '--input-json', JSON.stringify({ action: 'start', mode: 'rendering', maxDurationMs: 60000 })]);
  let browserProfile;
  try {
    ev('m.perfStart(600)');
    await until(() => ev('m.perfFrames()') >= 600, '600 rendered frames', 60_000);
  } finally {
    browserProfile = cli(['browser', 'profile', '--input-json', JSON.stringify({ action: 'stop' })]);
  }
  const metrics = ev('m.perfStop()');
  check('600-frame sample', metrics.frames === 600, `${metrics.frames} frames`);
  check('CPU p95 ≤ 4 ms', metrics.cpuMs.p95 <= 4, `${metrics.cpuMs.p95.toFixed(3)} ms`);
  check('draw calls ≤ 50', metrics.drawCalls.max <= 50, `${metrics.drawCalls.max}`);
  check('triangles ≤ 150000', metrics.triangles.max <= 150000, `${metrics.triangles.max}`);
  check('six grown plants still present', ev('m.state().sprouts.filter(s => s.stage === 7).length') === 6);
  const writes = ev('m.state().focus.rakeWrites');
  await sleep(1000);
  check('idle sand makes no CPU texture writes', ev('m.state().focus.rakeWrites') === writes);
  const errors = consoleErrors(cli(['browser', 'logs', '--input-json', JSON.stringify({ count: 200 })]), started);
  check('zero console errors (performance)', errors.length === 0, JSON.stringify(errors));
  console.log(JSON.stringify(metrics, null, 2));
  return { ...summary(), metrics, browserProfile, profile,
    qualification: 'Uncalibrated desktop CPU/render proxy; unverified on Quest hardware.' };
}

if (import.meta.url === `file://${process.argv[1]}`) main().then((r) => { process.exitCode = r.failed ? 1 : 0; }).catch((e) => { console.error(e); process.exitCode = 2; });
