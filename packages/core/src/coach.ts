import { type DayKey, addDays, daysBetween, weekStart } from './clock.js';
import { growthOf } from './growth.js';
import { type Ledger, MAX_TARGET, type SurfaceKind, activeHabits, countOn } from './habits.js';
import { PRESETS, presetById } from './presets.js';
import { stageName } from './display.js';

/**
 * The voice coach's contract with the app. Muse (through packages/proxy)
 * hears "drink water by the counter, eight a day" and answers with a
 * structured habit. Nothing it says is trusted until it passes these checks;
 * a bad answer is a readable error, never a guessed habit.
 */
export class CoachError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoachError';
  }
}

export interface CoachHabit {
  /** One of the 12 preset ids. */
  preset: string;
  /** Per-day count (1 = daily yes/no). */
  target: number;
  /** Where the user said it happens ("counter"), lower case, may be "". */
  surface: string;
  /** A short label in the user's words, for the "Heard" card only. */
  label: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseCoachHabit(raw: unknown): CoachHabit {
  if (!isObj(raw)) throw new CoachError('The coach answered without a habit.');
  const preset = typeof raw.preset === 'string' ? raw.preset : '';
  if (!presetById(preset)) throw new CoachError(`The coach picked "${clean(preset, 40)}", which is not one of the 12 habits.`);
  const target = raw.target;
  if (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > MAX_TARGET)
    throw new CoachError(`The coach asked for ${String(target)} a day; Mebae counts 1 to ${MAX_TARGET}.`);
  const surface = typeof raw.surface === 'string' ? clean(raw.surface, 40).toLowerCase() : '';
  const label = typeof raw.label === 'string' && raw.label.trim() ? clean(raw.label, 60) : presetById(preset)!.label;
  return { preset, target, surface, label };
}

/** Words for each kind of place, so "counter" can match a detected table. */
const PLACE_WORDS: Record<string, string[]> = {
  table: ['table', 'desk', 'counter', 'kitchen', 'worktop', 'bench', 'nightstand', 'bedside', 'shelf', 'dresser', 'monitor', 'screen', 'coffee', 'dining'],
  wall: ['wall', 'door', 'doorway', 'doorframe', 'window', 'mirror', 'hallway', 'entrance', 'front door'],
  floor: ['floor', 'rug', 'mat', 'carpet', 'yoga'],
};

/**
 * Does a surface the hand ray is on fit where the user said the habit
 * happens? Exact semantic labels win ("door" on a door); otherwise the kind of
 * surface must fit the kind of place ("counter" on any table-height top).
 */
export function surfaceMatches(suggested: string, label: string, surface: SurfaceKind): boolean {
  const s = suggested.toLowerCase().trim();
  if (!s) return false;
  const l = label.toLowerCase();
  if (l && l !== 'other' && (s.includes(l) || l.includes(s))) return true;
  for (const [kind, words] of Object.entries(PLACE_WORDS)) {
    if (words.some((w) => s.includes(w)) && kind === surface) return true;
  }
  return false;
}

/** A short "where" hint for the aim prompt ("the counter"). */
export function surfaceHint(suggested: string): string {
  const s = suggested.trim();
  if (!s) return 'the spot where you do it';
  return /^(the|my|a|an)\s/i.test(s) ? s : `the ${s}`;
}

export interface WeekHabitSummary {
  label: string;
  /** Per-day goal. */
  target: number;
  /** Days this week (Mon..today) the daily goal was met. */
  goalMetDaysThisWeek: number;
  /** Days of this week so far, including today (Mon = 1 … Sun = 7). */
  daysElapsedThisWeek: number;
  todayCount: number;
  streak: number;
  stage: string;
  resting: boolean;
  inBloom: boolean;
  /** Days since it was planted (0 = planted today). */
  plantedDaysAgo: number;
}

export interface WeekSummary {
  weekOf: DayKey;
  today: DayKey;
  habits: WeekHabitSummary[];
  focusBlocksThisWeek: number;
}

/**
 * What the coach sees for the weekly note: counts from the real ledger only.
 * No anchors, positions or timestamps leave the headset.
 */
export function weeklySummary(l: Ledger, today: DayKey, blockDay: (ms: number) => DayKey): WeekSummary {
  if (l.sample) throw new CoachError('The example garden is sample data; the weekly note only reads your real history.');
  const ws = weekStart(today);
  const daysSoFar = daysBetween(ws, today) + 1;
  const habits = activeHabits(l).map((h) => {
    let goalMetDaysThisWeek = 0;
    for (let i = 0; i < daysSoFar; i++) if (countOn(l, h.id, addDays(ws, i)) >= h.target) goalMetDaysThisWeek++;
    const g = growthOf(l, h, today);
    return {
      label: h.label,
      target: h.target,
      goalMetDaysThisWeek,
      daysElapsedThisWeek: daysSoFar,
      todayCount: g.todayCount,
      streak: g.streak,
      stage: stageName(g.stage),
      resting: g.vitality === 'resting',
      inBloom: g.inBloom,
      plantedDaysAgo: Math.max(0, daysBetween(h.createdDay, today)),
    };
  });
  const focusBlocksThisWeek = l.focus.blocks.filter((b) => {
    const d = blockDay(b.completedAt);
    return d >= ws && d <= today;
  }).length;
  return { weekOf: ws, today, habits, focusBlocksThisWeek };
}

/** The weekly note: 1-3 short sentences, plain text. */
export function parseCoachNote(raw: unknown): string {
  if (!isObj(raw) || typeof raw.note !== 'string') throw new CoachError('The coach sent no note.');
  const note = clean(raw.note, 320);
  if (note.length < 8) throw new CoachError('The coach sent an empty note.');
  return note;
}

/** Preset ids, for the proxy's JSON schema check (packages/proxy keeps a copy and its test compares). */
export const COACH_PRESET_IDS = PRESETS.map((p) => p.id);
