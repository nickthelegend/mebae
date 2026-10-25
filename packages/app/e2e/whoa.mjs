// 35 seconds of genuine emulator input and capture: a first-day planting and
// growth, then a conspicuously stamped SAMPLE preview. This cannot substitute
// for the Representative's real multi-day recordings.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP } from './lib.mjs';
import record from './record.mjs';

const exec = promisify(execFile);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export default async function run({ page, frame, cdp }) {
  const target = frame ?? page;
  const state = () => target.evaluate(() => window.__mebae.state());
  const targets = () => target.evaluate(() => window.__mebae.targets());
  const initial = await state();
  if (!initial.xr || !initial.tray?.placed || initial.habits.length || initial.sample)
    throw new Error('Whoа capture needs Quest 3/home_office, active hands XR, and an empty real garden with the tray placed.');
  if (!process.env.MEBAE_REC_DIR) throw new Error('Set MEBAE_REC_DIR to a new frames directory.');
  const xr = async (action, input) => {
    const { stdout } = await exec(`${APP}/node_modules/.bin/iwsdk`, ['xr', action, '--input-json', JSON.stringify(input)], { cwd: APP, timeout: 15_000 });
    const r = JSON.parse(stdout);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
  };
  const pinch = async (p) => {
    if (!p) throw new Error('Capture target is missing.');
    await xr('look-at', { device: 'hand-right', target: { x: p[0], y: p[1], z: p[2] } });
    await pause(250);
    await xr('select', { device: 'hand-right', duration: 0.15 });
  };
  const until = async (test, label) => {
    const end = Date.now() + 6000;
    while (Date.now() < end) { if (await test()) return; await pause(100); }
    throw new Error(`Capture timed out: ${label}`);
  };
  process.env.MEBAE_REC_SECONDS = '35';
  const capturedAt = new Date().toISOString();
  const start = Date.now();
  const marks = [{ at: 0, text: `Day 1 · ${initial.today} · IWER Quest 3 · hands only` }];
  const capture = record({ page, cdp });
  let error;
  // Sample mode swaps the ledger, so the final habits are the example garden
  // (stage 7), not the real stage-1 sprout. Remember the real garden first.
  let realAtStageOne = null;
  try {
    await pause(800);
    await pinch((await targets()).seed);
    await until(async () => (await state()).mode === 'radial', 'radial');
    await pinch((await targets()).icons[0]);
    await until(async () => (await state()).mode === 'aiming', 'aiming');
    await xr('set-transform', { device: 'headset', position: { x: -0.08, y: 1.2, z: -1.35 }, orientation: { pitch: 0, yaw: 180, roll: 0 } });
    await pinch([-0.6, 1.2, 1.58]);
    await until(async () => (await state()).sprouts.length === 1 && (await state()).mode === 'idle', 'rooted');
    marks.push({ at: (Date.now() - start) / 1000, text: 'Stretch takes root on a detected surface · real XRAnchor' });
    const habit = (await state()).habits[0];
    await pinch((await targets()).sprouts[habit.id].label);
    await until(async () => (await state()).habits[0].stage === 1, 'growth');
    realAtStageOne = await state();
    marks.push({ at: (Date.now() - start) / 1000, text: 'One real check-in · stage 1 · no clock advancement' });
    await pause(Math.max(0, 20000 - (Date.now() - start)));
    await xr('set-transform', { device: 'headset', position: { x: -0.08, y: 1.2, z: -1.35 }, orientation: { pitch: -28, yaw: 0, roll: 0 } });
    await pinch((await targets()).menuButtons[1]);
    marks.push({ at: (Date.now() - start) / 1000, text: 'Example garden (sample data) · NOT a recorded later day' });
  } catch (e) {
    error = e.stack ?? String(e);
  }
  const footage = await capture;
  const final = await state();
  const report = { capturedAt, initialDay: initial.today, footage, marks, realAtStageOne, final, error: error ?? null,
    multiDayFootage: false, qualification: 'First-day capture plus labelled sample preview. Real separate-day footage is still required.' };
  writeFileSync(join(process.env.MEBAE_REC_DIR, 'whoa.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(process.env.MEBAE_REC_DIR, 'captions.txt'), marks.map((m, i) => `${m.at.toFixed(2)} ${(marks[i + 1]?.at ?? 35).toFixed(2)} ${m.text}`).join('\n'));
  if (error) throw new Error(error);
  const stageOne = realAtStageOne?.habits?.length === 1 && realAtStageOne.habits[0].stage === 1 && !realAtStageOne.sample && realAtStageOne.today === initial.today;
  const sampleShown = final.sample && final.today === initial.today && final.habits.some((h) => String(h.id).startsWith('sample-'));
  if (!footage.frames || !stageOne || !sampleShown) throw new Error('Whoа capture did not complete. Inspect whoa.json.');
  return report;
}
