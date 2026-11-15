// No upstream is faked here: every case below is decided before the proxy
// would call the Meta Model API. Live calls are in live.test.js (key-gated).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_AUDIO_BYTES, checkSummary, checkWav, createHandler } from '../lib/handler.js';
import { Limiter } from '../lib/limits.js';

const ORIGIN = 'https://nickthelegend.github.io';
const noUpstream = () => {
  throw new Error('upstream must not be called in this test');
};

function wav(seconds, { rate = 16000, ch = 1, bits = 16 } = {}) {
  const n = Math.round(seconds * rate) * ch * (bits / 8);
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  v.setUint32(4, 36 + n, true);
  b.set([...'WAVEfmt '].map((c) => c.charCodeAt(0)), 8);
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * (bits / 8), true);
  v.setUint16(32, ch * (bits / 8), true);
  v.setUint16(34, bits, true);
  b.set([...'data'].map((c) => c.charCodeAt(0)), 36);
  v.setUint32(40, n, true);
  return b;
}

const req = (method, route, { body, type, origin = ORIGIN, ip = '1.2.3.4' } = {}) =>
  new Request(`https://coach.example/api/coach${route ? `?route=${route}` : ''}`, {
    method,
    body,
    headers: { ...(origin ? { origin } : {}), ...(type ? { 'content-type': type } : {}), 'x-forwarded-for': `${ip}, 10.0.0.1` },
  });

const summary = { summary: { habits: [{ label: 'Water', target: 8, goalMetDaysThisWeek: 3, daysElapsedThisWeek: 4, todayCount: 1, streak: 3, stage: 'Seedling', resting: false, inBloom: false, plantedDaysAgo: 3 }], focusBlocksThisWeek: 1 } };

test('health reports configuration without the key', async () => {
  const h = createHandler({ env: { MODEL_API_KEY: 'k-secret' }, fetchImpl: noUpstream });
  const r = await h(req('GET'));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.configured, true);
  assert.deepEqual(j.routes, ['habit', 'note']);
  assert.equal(JSON.stringify(j).includes('k-secret'), false);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
});

test('no key: setup_required, loudly', async () => {
  const h = createHandler({ env: {}, fetchImpl: noUpstream });
  const r = await h(req('POST', 'habit', { body: wav(1), type: 'audio/wav' }));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'setup_required');
  assert.equal((await (await h(req('GET'))).json()).configured, false);
});

test('only allowed origins; no-origin calls only when enabled', async () => {
  const h = createHandler({ env: { MODEL_API_KEY: 'k' }, fetchImpl: noUpstream });
  const bad = await h(req('GET', null, { origin: 'https://evil.example' }));
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  assert.equal((await h(req('GET', null, { origin: null }))).status, 403);
  const dev = createHandler({ env: { MODEL_API_KEY: 'k', ALLOW_NO_ORIGIN: '1', ALLOWED_ORIGINS: 'https://localhost:8081' }, fetchImpl: noUpstream });
  assert.equal((await dev(req('GET', null, { origin: null }))).status, 200);
  assert.equal((await dev(req('GET', null, { origin: 'https://localhost:8081' }))).status, 200);
  assert.equal((await dev(req('GET', null, { origin: ORIGIN }))).status, 403);
});

test('preflight answers with CORS headers', async () => {
  const h = createHandler({ env: { MODEL_API_KEY: 'k' }, fetchImpl: noUpstream });
  const r = await h(req('OPTIONS', 'habit'));
  assert.equal(r.status, 204);
  assert.match(r.headers.get('access-control-allow-methods'), /POST/);
});

test('only two routes and POST', async () => {
  const h = createHandler({ env: { MODEL_API_KEY: 'k' }, fetchImpl: noUpstream });
  assert.equal((await h(req('POST', 'image', { body: '{}', type: 'application/json' }))).status, 404);
  assert.equal((await h(req('POST', null, { body: '{}', type: 'application/json' }))).status, 404);
  assert.equal((await h(req('PUT', 'note', { body: '{}', type: 'application/json' }))).status, 405);
});

test('bad input is rejected before any upstream call', async () => {
  const h = createHandler({ env: { MODEL_API_KEY: 'k' }, fetchImpl: noUpstream });
  const cases = [
    [req('POST', 'habit', { body: 'hello', type: 'text/plain' }), 400],
    [req('POST', 'habit', { body: new Uint8Array(100), type: 'audio/wav' }), 400],
    [req('POST', 'habit', { body: wav(1, { rate: 44100 }), type: 'audio/wav' }), 400],
    [req('POST', 'habit', { body: wav(1, { ch: 2 }), type: 'audio/wav' }), 400],
    [req('POST', 'habit', { body: wav(0.1), type: 'audio/wav' }), 400],
    [req('POST', 'habit', { body: new Uint8Array(MAX_AUDIO_BYTES + 10), type: 'audio/wav' }), 413],
    [req('POST', 'note', { body: 'nope', type: 'application/json' }), 400],
    [req('POST', 'note', { body: JSON.stringify({ summary: { habits: [] } }), type: 'application/json' }), 400],
    [req('POST', 'note', { body: JSON.stringify(summary), type: 'text/plain' }), 400],
    [req('POST', 'note', { body: 'x'.repeat(9000), type: 'application/json' }), 413],
  ];
  for (const [r, status] of cases) assert.equal((await h(r)).status, status);
});

test('checkWav and checkSummary', () => {
  assert.equal(checkWav(wav(2)).seconds, 2);
  assert.throws(() => checkWav(wav(17)), /16 seconds/);
  const s = checkSummary(new TextEncoder().encode(JSON.stringify(summary)));
  assert.equal(s.habits[0].label, 'Water');
  assert.throws(() => checkSummary(new TextEncoder().encode(JSON.stringify({ summary: { habits: [{ label: 'x'.repeat(50) }] } }))), /label/);
  // unknown fields are dropped, not forwarded
  const extra = { summary: { ...summary.summary, secret: 'anchor-uuid', habits: [{ ...summary.summary.habits[0], anchorUuid: 'u' }] } };
  assert.equal(JSON.stringify(checkSummary(new TextEncoder().encode(JSON.stringify(extra)))).includes('anchor'), false);
});

test('limiter: per-minute, per-IP daily and global daily caps', () => {
  let t = Date.UTC(2026, 10, 15, 12);
  const l = new Limiter({ perMinute: 2, perIpDay: 3, globalDay: 4, now: () => t });
  assert.equal(l.take('a'), null);
  assert.equal(l.take('a'), null);
  assert.equal(l.take('a').error, 'rate_limited');
  t += 61_000;
  assert.equal(l.take('a'), null);
  t += 61_000;
  assert.match(l.take('a').message, /today/);
  assert.equal(l.take('b'), null);
  assert.equal(l.take('c').error, 'daily_cap');
  t = Date.UTC(2026, 10, 16, 0, 0, 1);
  assert.equal(l.take('a'), null);
});

test('rate limit answers 429 with retry-after before calling upstream', async () => {
  // exhaust the one allowed request without an upstream call: take it directly
  const lim = new Limiter({ perMinute: 1, perIpDay: 9, globalDay: 9 });
  lim.take('1.2.3.4');
  const h2 = createHandler({ env: { MODEL_API_KEY: 'k' }, fetchImpl: noUpstream, limiter: lim });
  const r = await h2(req('POST', 'note', { body: JSON.stringify(summary), type: 'application/json' }));
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal((await r.json()).error, 'rate_limited');
});
