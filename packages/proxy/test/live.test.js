// Live calls to the real Meta Model API through the handler. Skipped (with a
// visible reason) when MODEL_API_KEY is not in the environment; nothing is faked.
// Run: (set -a; . /path/to/.env; set +a; MEBAE_LIVE_WAV=/path/to/speech.wav node --test test/live.test.js)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHandler } from '../lib/handler.js';

const key = process.env.MODEL_API_KEY;
const wavPath = process.env.MEBAE_LIVE_WAV;
const skip = key ? false : 'Setup required: MODEL_API_KEY not set, live Muse calls skipped';
const env = { MODEL_API_KEY: key, ALLOW_NO_ORIGIN: '1' };

test('live: spoken habit -> transcript -> structured habit', { skip: skip || (!wavPath && 'MEBAE_LIVE_WAV not set') }, async () => {
  const h = createHandler({ env });
  const r = await h(new Request('http://local/api/coach?route=habit', { method: 'POST', body: readFileSync(wavPath), headers: { 'content-type': 'audio/wav' } }));
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  console.log(`  heard: ${JSON.stringify(j.transcript)} -> ${JSON.stringify(j.habit)} in ${j.ms} ms`);
  assert.match(j.transcript.toLowerCase(), /water/);
  assert.equal(j.habit.preset, 'water');
  assert.equal(j.habit.target, 8);
  assert.match(j.habit.surface, /counter/);
});

test('live: weekly note from counts', { skip }, async () => {
  const h = createHandler({ env });
  const summary = { habits: [{ label: 'Water', target: 8, daysDone: 3, daysSoFar: 4, todayCount: 1, streak: 3, stage: 'Seedling', resting: false, inBloom: false, ageDays: 3 }], focusBlocksThisWeek: 1 };
  const r = await h(new Request('http://local/api/coach?route=note', { method: 'POST', body: JSON.stringify({ summary }), headers: { 'content-type': 'application/json' } }));
  const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j));
  console.log(`  note (${j.ms} ms): ${j.note}`);
  assert.ok(j.note.length > 20 && j.note.length < 500);
});

test('live: a sentence that is not a habit is refused, not guessed', { skip: skip || (!process.env.MEBAE_LIVE_NOT_HABIT_WAV && 'MEBAE_LIVE_NOT_HABIT_WAV not set') }, async () => {
  const h = createHandler({ env });
  const r = await h(new Request('http://local/api/coach?route=habit', { method: 'POST', body: readFileSync(process.env.MEBAE_LIVE_NOT_HABIT_WAV), headers: { 'content-type': 'audio/wav' } }));
  const j = await r.json();
  console.log(`  ${r.status}: ${JSON.stringify(j)}`);
  assert.equal(r.status, 422);
});
