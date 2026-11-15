// Voice coach e2e, Quest 3 hands, home_office. Needs the dev server started with
// MEBAE_PROXY_TARGET + VITE_MEBAE_COACH_URL and packages/proxy running.
//   MEBAE_COACH_PHASE=live    proxy with MODEL_API_KEY: the whole voice loop + weekly note (real Muse calls)
//   MEBAE_COACH_PHASE=nokey   proxy without a key: "AI unavailable: setup required", icons still plant
//   MEBAE_COACH_PHASE=down    proxy stopped: readable "AI unavailable"
// MEBAE_MIC_WAV / MEBAE_MIC_WAV_OTHER: recorded speech fed to the emulated mic (see fake-mic.mjs).
import { execFileSync } from 'node:child_process';
import { APP, check, cli, consoleErrors, ev, pinchAt, resetResults, sleep, summary, until, v3, xr } from './lib.mjs';

const SEATED = { x: -0.08, y: 1.2, z: -1.35 };
const state = () => ev('m.state()');
const targets = () => ev('m.targets()');

function fakeMic(path) {
  const out = execFileSync(`${APP}/node_modules/.bin/iwsdk`, ['browser', 'run', 'e2e/fake-mic.mjs', '--timeout', '20000'], {
    cwd: APP, encoding: 'utf8', env: { ...process.env, MEBAE_MIC_WAV: path }, timeout: 30_000,
  });
  const j = JSON.parse(out);
  if (!j.ok) throw new Error(`fake mic: ${JSON.stringify(j.error)}`);
}

async function enterSeated() {
  if (!xr('status').sessionActive) xr('enter');
  await until(() => xr('status').sessionActive, 'XR session');
  xr('set-input-mode', { mode: 'hand' });
  xr('set-transform', { device: 'headset', position: SEATED, orientation: { pitch: -28, yaw: 0, roll: 0 } });
  await until(() => ev('m.state().tray?.placed'), 'tray placed', 20_000);
}

async function speakToggle(seconds) {
  await pinchAt('hand-right', targets().menuButtons[0]);
  await until(() => ev('m.state().coach.state') === 'listening', 'listening (Speak)');
  await sleep(seconds * 1000);
  await pinchAt('hand-right', targets().menuButtons[0]);
}

export async function main() {
  resetResults();
  const t0 = Date.now();
  const phase = process.env.MEBAE_COACH_PHASE ?? 'live';
  ev('m.wipe()');
  cli(['browser', 'reload']);
  await sleep(2500);
  await enterSeated();
  fakeMic(process.env.MEBAE_MIC_WAV);
  let s;

  if (phase === 'live') {
    // 1. pinch-hold a seed, speak, release
    const t = targets();
    xr('look-at', { device: 'hand-right', target: v3(t.seed) });
    await sleep(250);
    const tHold = Date.now();
    xr('select', { device: 'hand-right', duration: 4.6 }, { timeout: 30_000 });
    await until(() => ['heard', 'error'].includes(ev('m.state().coach.state')), 'coach answer', 45_000, 500);
    s = state();
    const c = s.coach;
    check('voice: hold a seed -> listening -> heard', c.state === 'heard', c.error ?? '');
    check('voice: mic captured the spoken line', c.recordedSeconds >= 2, `${c.recordedSeconds.toFixed(2)} s of audio`);
    check('voice: Muse transcript', /water/i.test(c.last?.transcript ?? '') && /counter/i.test(c.last?.transcript ?? ''), JSON.stringify(c.last?.transcript));
    check('voice: structured habit = Water, 8 a day, counter', c.last?.habit?.preset === 'water' && c.last?.habit?.target === 8 && /counter/.test(c.last?.habit?.surface ?? ''), JSON.stringify(c.last?.habit));
    check('voice: round trip time recorded', c.last?.ms > 0, `${c.last?.ms} ms proxy round trip, ${((Date.now() - tHold) / 1000).toFixed(1)} s hold-to-answer`);
    check('voice: the seed is lifted and aiming', s.mode === 'aiming');
    // 2. point at the desk (a table-height surface: matches "counter") and pinch
    const desk = [t.tray[0] + 0.32, t.tray[1] + 0.003, t.tray[2] - 0.15];
    xr('look-at', { device: 'hand-right', target: v3(desk) });
    await sleep(600);
    xr('select', { device: 'hand-right' });
    await until(() => ev('m.state().mode') === 'idle', 'rooted', 10_000);
    await sleep(400);
    s = state();
    const w = s.habits.find((h) => h.label === 'Water');
    check('voice: Water planted with the spoken count', w?.target === 8 && w?.kind === 'counted', JSON.stringify(w && { target: w.target, kind: w.kind, on: w.placement?.surfaceLabel }));
    check('voice: aimed surface matched the spoken place', s.lastPlaced?.coach?.matched === true, JSON.stringify(s.lastPlaced?.coach));
    // 3. Speak button (one-hand route) with a sentence that is not a habit
    fakeMic(process.env.MEBAE_MIC_WAV_OTHER);
    await speakToggle(3.6);
    await until(() => ev('m.state().coach.state') === 'error', 'refusal', 45_000, 500);
    s = state();
    check('voice: a non-habit is refused, not guessed', s.coach.state === 'error' && s.habits.length === 1, s.coach.error);
    // 4. weekly note from real history
    await pinchAt('hand-right', targets().menuButtons[1]);
    await until(() => ev('m.state().weekOpen'), 'week open');
    await pinchAt('hand-right', targets().noteStrip);
    await until(() => ['ready', 'error'].includes(ev('m.state().coach.note?.state')), 'weekly note', 45_000, 500);
    s = state();
    check('weekly note: Muse answers from real counts', s.coach.note.state === 'ready' && s.coach.note.text.length > 20, `${s.coach.note.ms} ms · ${s.coach.note.spoken} · ${s.coach.note.text}`);
  } else {
    await speakToggle(2.4);
    await until(() => ev('m.state().coach.state') === 'error', 'AI unavailable', 30_000, 500);
    s = state();
    const want = phase === 'nokey' ? /setup required/i : /AI unavailable/i;
    check(`${phase}: coach shows a readable "AI unavailable"`, want.test(s.coach.error ?? ''), s.coach.error);
    // the core loop still works with the icons
    let t = targets();
    await pinchAt('hand-right', t.seed);
    await until(() => ev('m.state().mode') === 'radial', 'radial');
    t = targets();
    await pinchAt('hand-right', t.icons[1]);
    await until(() => ev('m.state().mode') === 'aiming', 'aiming');
    xr('look-at', { device: 'hand-right', target: v3([t.tray[0] + 0.32, t.tray[1] + 0.003, t.tray[2] - 0.15]) });
    await sleep(500);
    xr('select', { device: 'hand-right' });
    await until(() => ev('m.state().mode') === 'idle', 'rooted', 10_000);
    check(`${phase}: icons still plant a habit without the AI`, state().habits.length === 1);
  }
  const errors = consoleErrors(cli(['browser', 'logs', '--input-json', JSON.stringify({ count: 200 })]), t0);
  // In the nokey/down phases the coach request itself fails (503 setup_required,
  // or the dev server's 500 for a stopped proxy) and Chrome logs that network
  // failure on its own. Those are the expected failures under test; anything
  // else is a real error.
  const expected = (e) => phase !== 'live' && /Failed to load resource: the server responded with a status of (500|502|503)/.test(e.text ?? e.message ?? '');
  const real = errors.filter((e) => !expected(e));
  check('zero console errors', real.length === 0, `${real.length} unexpected; ${errors.length - real.length} expected coach network failure(s)${real.length ? `: ${real.slice(0, 3).map((e) => e.text ?? e.message).join(' | ')}` : ''}`);
  return summary();
}
