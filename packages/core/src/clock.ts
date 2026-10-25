/**
 * Time source for the habit ledger. The shipped app passes `systemClock`.
 * Tests (and only tests) pass a `ManualClock` so a day can be advanced
 * without waiting for midnight. See TESTING.md.
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export class ManualClock implements Clock {
  constructor(private t: number) {}
  now(): number {
    return this.t;
  }
  set(t: number): void {
    this.t = t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
  /** Moves to the next local midnight plus `offsetMs`, so DST days work. */
  advanceDays(days: number, offsetMs = 9 * 3600_000): void {
    const d = new Date(this.t);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    const hours = Math.floor(offsetMs / 3600_000);
    const minutes = Math.floor((offsetMs % 3600_000) / 60_000);
    const seconds = Math.floor((offsetMs % 60_000) / 1000);
    const ms = offsetMs % 1000;
    d.setHours(hours, minutes, seconds, ms);
    this.t = d.getTime();
  }
}

/** A calendar day in the user's local time zone, as `YYYY-MM-DD`. */
export type DayKey = string;

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** Local-midnight day key. Rolls over at local midnight, DST-safe. */
export function dayKey(ms: number): DayKey {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isDayKey(v: unknown): v is DayKey {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Day arithmetic on keys (calendar days, independent of DST). */
export function addDays(key: DayKey, n: number): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Monday of the week containing `key` (ISO weeks start on Monday). */
export function weekStart(key: DayKey): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}
