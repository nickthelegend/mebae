/**
 * Mebae coach proxy. The only holder of MODEL_API_KEY. It allows exactly two
 * routes and two models, caps requests, and fails loudly:
 *
 *   GET  /api/coach                 health: configured?, models, limits (never the key)
 *   POST /api/coach?route=habit     body audio/wav (mono 16-bit, 16 kHz, <= 16 s)
 *        -> muse-voice-transcribe-1.0 -> muse-spark-1.3 (JSON schema)
 *        <- { transcript, habit: { preset, target, surface, label }, ms }
 *   POST /api/coach?route=note      body { summary } (counts from the user's real week)
 *        -> muse-spark-1.3 (JSON schema)  <- { note, ms }
 *
 * Errors: 503 setup_required (no key), 429 rate_limited|daily_cap, 400/413 bad
 * input, 422 not_a_habit, 502 upstream. The app shows each as "AI unavailable: …".
 */
import { Limiter } from './limits.js';

export const BASE_URL = 'https://api.meta.ai/v1';
export const MODELS = Object.freeze({ transcribe: 'muse-voice-transcribe-1.0', spark: 'muse-spark-1.3' });
/** Same ids as packages/core/src/presets.ts (test/presets.test.js compares them). */
export const PRESET_IDS = Object.freeze(['stretch', 'water', 'read', 'deep-work', 'breathe', 'journal', 'walk', 'tidy', 'vitamins', 'eye-break', 'practice', 'lights-out']);
export const MAX_AUDIO_BYTES = 44 + 16_000 * 2 * 16; // 16 s at 16 kHz mono 16-bit
export const MAX_JSON_BYTES = 8 * 1024;
export const DEFAULT_ORIGINS = ['https://nickthelegend.github.io'];

const HABIT_SCHEMA = {
  name: 'mebae_habit',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'preset', 'target', 'surface', 'label', 'problem'],
    properties: {
      ok: { type: 'boolean', description: 'false if the sentence is not a habit Mebae can track' },
      preset: { type: 'string', enum: PRESET_IDS },
      target: { type: 'integer', minimum: 1, maximum: 12 },
      surface: { type: 'string', description: 'the place the person named, 1-3 lowercase words, or empty' },
      label: { type: 'string', description: 'the habit in at most 6 words, in their words' },
      problem: { type: 'string', description: 'when ok is false: one short sentence saying why' },
    },
  },
};

const NOTE_SCHEMA = {
  name: 'mebae_week_note',
  strict: true,
  schema: { type: 'object', additionalProperties: false, required: ['note'], properties: { note: { type: 'string' } } },
};

const HABIT_PROMPT = `You turn one spoken sentence into a habit for Mebae, a mixed-reality habit garden where each habit is a plant pinned to a real place.
Pick exactly one preset:
stretch (stretching, yoga, mobility), water (drinking water, glasses of water), read (reading, books), deep-work (focused work, study, coding),
breathe (breathing, meditation), journal (writing, journaling), walk (walking, steps, going outside), tidy (tidying, cleaning, dishes),
vitamins (vitamins, pills, medication), eye-break (eye or screen breaks), practice (practising an instrument or skill), lights-out (going to bed, sleep, screens off).
target: how many times a day they said (1 if they gave no number). surface: the place they named, 1-3 lowercase words ("counter", "front door", "desk"), or "" if none.
label: their habit in at most 6 words. If the sentence is not a daily habit that fits a preset, set ok=false and explain in problem; otherwise ok=true and problem="".`;

const NOTE_PROMPT = `You write a short weekly note for a person using Mebae, a habit garden where each habit is a plant in their room.
Use only the numbers given. Call habits naturally ("your water habit", "reading"). At most 3 short sentences and 55 words, warm and specific: one thing that went well, one gentle concrete suggestion for the coming days.
In Mebae a missed day only pauses growth; plants never die. No guilt, no medical claims, no emojis, no lists.`;

export function createHandler({ env, fetchImpl = fetch, now = () => Date.now(), limiter } = {}) {
  const key = (env.MODEL_API_KEY ?? '').trim();
  const origins = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = origins.length ? origins : DEFAULT_ORIGINS;
  const allowNoOrigin = env.ALLOW_NO_ORIGIN === '1';
  const limits = limiter ?? new Limiter({
    perMinute: int(env.COACH_PER_MINUTE, 8),
    perIpDay: int(env.COACH_PER_IP_DAY, 60),
    globalDay: int(env.COACH_DAILY_CAP, 400),
    now,
  });

  return async function handle(request) {
    const origin = request.headers.get('origin');
    const cors = origin && allowed.includes(origin)
      ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'origin' }
      : {};
    const reply = (status, body, extra = {}) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors, ...extra } });

    if (origin ? !allowed.includes(origin) : !allowNoOrigin)
      return reply(403, { error: 'origin_not_allowed', message: 'This origin may not use the Mebae coach.' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET')
      return reply(200, { ok: true, configured: !!key, models: MODELS, routes: ['habit', 'note'], limits: { perMinute: limits.perMinute, perIpDay: limits.perIpDay, dailyCap: limits.globalDay } });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed', message: 'Use POST.' });

    const route = new URL(request.url).searchParams.get('route');
    if (route !== 'habit' && route !== 'note') return reply(404, { error: 'unknown_route', message: 'Routes: habit, note.' });
    if (!key) return reply(503, { error: 'setup_required', message: 'Setup required: MODEL_API_KEY is not set on the coach proxy.' });

    // validate before spending a request
    const type = (request.headers.get('content-type') ?? '').split(';')[0].trim();
    const declared = Number(request.headers.get('content-length') ?? '0');
    const max = route === 'habit' ? MAX_AUDIO_BYTES : MAX_JSON_BYTES;
    if (declared > max) return reply(413, { error: 'too_large', message: route === 'habit' ? 'Speak for at most 16 seconds.' : 'Summary too large.' });
    if (route === 'habit' && type !== 'audio/wav') return reply(400, { error: 'bad_audio', message: 'Send audio/wav (mono 16-bit PCM, 16 kHz).' });
    if (route === 'note' && type !== 'application/json') return reply(400, { error: 'bad_json', message: 'Send application/json.' });
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.length > max) return reply(413, { error: 'too_large', message: route === 'habit' ? 'Speak for at most 16 seconds.' : 'Summary too large.' });
    let input;
    try {
      input = route === 'habit' ? checkWav(body) : checkSummary(body);
    } catch (e) {
      return reply(400, { error: route === 'habit' ? 'bad_audio' : 'bad_summary', message: e.message });
    }

    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
    const limited = limits.take(ip);
    if (limited) return reply(429, limited, { 'retry-after': String(limited.retryAfter) });

    const t0 = now();
    try {
      if (route === 'habit') {
        const transcript = await transcribe(fetchImpl, key, body);
        if (!transcript) return reply(422, { error: 'not_heard', message: 'Nothing was heard. Hold the seed, wait for the chime, then speak.' });
        const h = await spark(fetchImpl, key, HABIT_PROMPT, transcript, HABIT_SCHEMA, 700);
        if (!h.ok) return reply(422, { error: 'not_a_habit', message: h.problem || 'That did not sound like a daily habit.', transcript });
        return reply(200, { transcript, habit: { preset: h.preset, target: h.target, surface: h.surface, label: h.label }, models: MODELS, ms: now() - t0 });
      }
      const n = await spark(fetchImpl, key, NOTE_PROMPT, JSON.stringify(input), NOTE_SCHEMA, 900);
      return reply(200, { note: n.note, model: MODELS.spark, ms: now() - t0 });
    } catch (e) {
      // Upstream detail is logged server-side; the key never appears in it.
      console.error(`[coach] ${route} failed: ${e.message}`);
      return reply(502, { error: 'upstream', message: `The Meta Model API did not answer (${e.status ?? 'network'}).` });
    }
  };
}

function int(v, d) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : d;
}

/** Mono 16-bit PCM WAV at 16 or 24 kHz, 0.3-16 s. Walks the RIFF chunks (fmt, data). */
export function checkWav(b) {
  const ascii = (o, n) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length < 44 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') throw new Error('Not a WAV file.');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fmt = null;
  let dataBytes = -1;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = ascii(o, 4);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ' && o + 24 <= b.length) fmt = { ch: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
    if (id === 'data') {
      dataBytes = Math.min(size, b.length - o - 8);
      break;
    }
    o += 8 + size + (size % 2);
  }
  if (!fmt || dataBytes < 0) throw new Error('WAV has no fmt or data chunk.');
  const { ch, rate, bits } = fmt;
  if (ch !== 1 || bits !== 16 || (rate !== 16000 && rate !== 24000)) throw new Error('WAV must be mono 16-bit PCM at 16 or 24 kHz.');
  const secs = dataBytes / (rate * 2);
  if (secs < 0.3) throw new Error('Too short: say the habit after the chime.');
  if (secs > 16) throw new Error('Speak for at most 16 seconds.');
  return { seconds: secs };
}

/** The weekly summary the app builds (core weeklySummary): counts only. */
export function checkSummary(b) {
  let j;
  try {
    j = JSON.parse(new TextDecoder().decode(b));
  } catch {
    throw new Error('Body is not JSON.');
  }
  const s = j?.summary;
  if (!s || typeof s !== 'object' || !Array.isArray(s.habits)) throw new Error('summary.habits must be an array.');
  if (s.habits.length < 1 || s.habits.length > 6) throw new Error('summary.habits must have 1 to 6 habits.');
  const num = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const habits = s.habits.map((h, i) => {
    if (typeof h?.label !== 'string' || h.label.length > 40) throw new Error(`habits[${i}].label must be a short string.`);
    for (const k of ['target', 'daysDone', 'daysSoFar', 'todayCount', 'streak', 'ageDays'])
      if (!num(h[k], 0, 10_000)) throw new Error(`habits[${i}].${k} must be a number.`);
    return {
      label: h.label,
      target: h.target,
      daysDone: h.daysDone,
      daysSoFar: h.daysSoFar,
      todayCount: h.todayCount,
      streak: h.streak,
      stage: typeof h.stage === 'string' ? h.stage.slice(0, 20) : '',
      resting: !!h.resting,
      inBloom: !!h.inBloom,
      ageDays: h.ageDays,
    };
  });
  return { habits, focusBlocksThisWeek: num(s.focusBlocksThisWeek, 0, 1000) ? s.focusBlocksThisWeek : 0 };
}

class UpstreamError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function upstream(fetchImpl, path, init) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  let res;
  try {
    res = await fetchImpl(`${BASE_URL}${path}`, { ...init, signal: ctl.signal });
  } catch (e) {
    throw new UpstreamError(0, e.name === 'AbortError' ? 'timeout' : 'unreachable');
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* keep null */
  }
  if (!res.ok) throw new UpstreamError(res.status, data?.error?.message ?? `HTTP ${res.status}`);
  return data;
}

export async function transcribe(fetchImpl, key, wav) {
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify({ model: MODELS.transcribe, audioEncoding: 'WAV' })], { type: 'application/json' }));
  form.append('audio', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
  const data = await upstream(fetchImpl, '/asr/transcribe', { method: 'POST', body: form, headers: { authorization: `Bearer ${key}` } });
  return typeof data?.transcript === 'string' ? data.transcript.trim() : '';
}

export async function spark(fetchImpl, key, system, user, schema, maxTokens) {
  const data = await upstream(fetchImpl, '/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELS.spark,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_schema', json_schema: schema },
      reasoning_effort: 'minimal',
      max_tokens: maxTokens,
    }),
  });
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new UpstreamError(200, `no content (finish: ${data?.choices?.[0]?.finish_reason ?? '?'})`);
  try {
    return JSON.parse(content);
  } catch {
    throw new UpstreamError(200, 'answer was not JSON');
  }
}
