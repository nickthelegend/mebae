import { type DayKey, addDays, daysBetween, weekStart } from './clock.js';
import { type Habit, type Ledger, countOn } from './habits.js';

/** Completed days needed for each of the 8 stages (index = stage). */
export const STAGE_DAYS = [0, 1, 2, 4, 6, 9, 13, 18] as const;
export const MAX_STAGE = STAGE_DAYS.length - 1;
/** A week (Mon-Sun) with this many completed days blooms. */
export const BLOOM_DAYS = 5;

export type Vitality = 'fresh' | 'thriving' | 'waiting' | 'resting';

export interface Growth {
  stage: number;
  completedDays: number;
  /** Completed days still needed for the next stage (0 at max stage). */
  toNextStage: number;
  /** Consecutive completed days ending today (or yesterday if today is open). */
  streak: number;
  /**
   * fresh: planted today, nothing yet. thriving: done today.
   * waiting: done yesterday, today still open. resting: a day was missed;
   * growth pauses, nothing is lost.
   */
  vitality: Vitality;
  /** Weeks (their Monday keys) that reached BLOOM_DAYS completed days. */
  bloomWeeks: DayKey[];
  /** True if this week or last week bloomed: the plant shows flowers. */
  inBloom: boolean;
  todayCount: number;
}

export function stageFor(completedDays: number): number {
  let s = 0;
  for (let i = 0; i < STAGE_DAYS.length; i++) if (completedDays >= STAGE_DAYS[i]) s = i;
  return s;
}

function isComplete(l: Ledger, h: Habit, day: DayKey): boolean {
  return countOn(l, h.id, day) >= h.target;
}

/**
 * Growth is a pure function of the ledger and today's key, so the same history
 * always grows the same plant. Missed days never subtract: they only pause.
 */
export function growthOf(l: Ledger, h: Habit, today: DayKey): Growth {
  const counts = l.counts[h.id] ?? {};
  const days = Object.keys(counts)
    .filter((d) => counts[d] >= h.target && daysBetween(d, today) >= 0)
    .sort();
  const completedDays = days.length;
  const stage = stageFor(completedDays);
  const toNextStage = stage >= MAX_STAGE ? 0 : STAGE_DAYS[stage + 1] - completedDays;

  const doneToday = isComplete(l, h, today);
  let streak = 0;
  let cursor = doneToday ? today : addDays(today, -1);
  while (isComplete(l, h, cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  let vitality: Vitality;
  if (doneToday) vitality = 'thriving';
  else if (isComplete(l, h, addDays(today, -1))) vitality = 'waiting';
  else if (h.createdDay === today || (completedDays === 0 && daysBetween(h.createdDay, today) <= 1))
    vitality = 'fresh';
  else vitality = 'resting';

  const perWeek = new Map<DayKey, number>();
  for (const d of days) {
    const w = weekStart(d);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const bloomWeeks = [...perWeek.entries()]
    .filter(([, n]) => n >= BLOOM_DAYS)
    .map(([w]) => w)
    .sort();
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const inBloom = bloomWeeks.includes(thisWeek) || bloomWeeks.includes(lastWeek);

  return {
    stage,
    completedDays,
    toNextStage,
    streak,
    vitality,
    bloomWeeks,
    inBloom,
    todayCount: countOn(l, h.id, today),
  };
}

export interface WeekCell {
  day: DayKey;
  /** 0..1 of the day's target. */
  fraction: number;
  future: boolean;
}

/** Seven cells (Mon-Sun) of the current week for the Week ring. */
export function weekRing(l: Ledger, h: Habit, today: DayKey): WeekCell[] {
  const start = weekStart(today);
  const cells: WeekCell[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    const future = daysBetween(today, day) > 0;
    cells.push({ day, fraction: future ? 0 : Math.min(1, countOn(l, h.id, day) / h.target), future });
  }
  return cells;
}
