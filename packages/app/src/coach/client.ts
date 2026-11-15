import { type CoachHabit, CoachError, type WeekSummary, parseCoachHabit, parseCoachNote } from '@mebae/core';

/**
 * The browser never holds the Meta Model API key. It talks to the Mebae
 * coach proxy (packages/proxy, a Vercel function) whose URL is baked in at
 * build time as VITE_MEBAE_COACH_URL. Without it the coach is "Setup
 * required" and the rest of Mebae works exactly the same.
 */
const URL_ = (import.meta.env.VITE_MEBAE_COACH_URL as string | undefined)?.trim() ?? '';

export function coachConfigured(): boolean {
  return URL_.length > 0;
}

export class CoachUnavailable extends Error {
  constructor(
    public kind: 'setup' | 'limit' | 'upstream' | 'network' | 'bad-input' | 'bad-answer',
    message: string,
  ) {
    super(message);
    this.name = 'CoachUnavailable';
  }
}

/** One readable sentence for any coach failure (shown on the coach card / week panel). */
export function describeCoachError(e: unknown): string {
  if (e === null) return 'AI unavailable: setup required (no coach proxy in this build). Pinch a seed to pick from the icons instead.';
  if (e instanceof CoachUnavailable && e.kind === 'setup')
    return 'AI unavailable: setup required (the coach proxy has no Meta Model API key). Pinch a seed to pick from the icons instead.';
  if (e instanceof CoachUnavailable) {
    if (e.kind === 'limit') return `AI unavailable: ${e.message} Pinch a seed to pick from the icons.`;
    if (e.kind === 'bad-answer' || e.kind === 'bad-input') return `${e.message} Try again, or pinch a seed to pick from the icons.`;
    if (e.kind === 'network') return 'AI unavailable: the coach could not be reached. Check the connection, or pinch a seed to pick from the icons.';
    return `AI unavailable: ${e.message}`;
  }
  if (e instanceof CoachError) return `The coach's answer was not usable: ${e.message}`;
  return `AI unavailable: ${(e as Error)?.message ?? String(e)}`;
}

async function call(route: 'habit' | 'note', body: BodyInit, type: string): Promise<{ data: Record<string, unknown>; ms: number }> {
  if (!coachConfigured()) throw new CoachUnavailable('setup', 'No coach proxy URL.');
  const t0 = performance.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(`${URL_}?route=${route}`, { method: 'POST', body, headers: { 'content-type': type }, signal: ctl.signal });
  } catch (e) {
    throw new CoachUnavailable('network', (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON error page */
  }
  const msg = typeof data.message === 'string' ? data.message : `HTTP ${res.status}`;
  if (res.status === 503 && data.error === 'setup_required') throw new CoachUnavailable('setup', msg);
  if (res.status === 429) throw new CoachUnavailable('limit', msg);
  if (res.status === 400 || res.status === 413) throw new CoachUnavailable('bad-input', msg);
  if (!res.ok && typeof data.message !== 'string') throw new CoachUnavailable('network', `HTTP ${res.status}`);
  if (!res.ok) throw new CoachUnavailable('upstream', msg);
  if (data.ok === false) throw new CoachUnavailable('bad-answer', msg);
  return { data, ms: Math.round(performance.now() - t0) };
}

export interface HeardHabit {
  transcript: string;
  habit: CoachHabit;
  ms: number;
}

/** WAV (mono 16-bit, 16 kHz) → transcript → structured habit, validated here again. */
export async function habitFromVoice(wav: Blob): Promise<HeardHabit> {
  const { data, ms } = await call('habit', wav, 'audio/wav');
  const transcript = typeof data.transcript === 'string' ? data.transcript.trim() : '';
  if (!transcript) throw new CoachUnavailable('bad-answer', 'Nothing was heard. Hold the seed, wait for the chime, then speak.');
  return { transcript, habit: parseCoachHabit(data.habit), ms };
}

export async function weeklyNote(summary: WeekSummary): Promise<{ note: string; ms: number }> {
  const { data, ms } = await call('note', JSON.stringify({ summary }), 'application/json');
  return { note: parseCoachNote(data), ms };
}
