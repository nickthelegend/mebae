import { type Clock, type DayKey, dayKey } from './clock.js';
import { type HabitKind, type Species, presetById } from './presets.js';

/** Meta documents a cap of 8 persistent anchors per site. */
export const PERSISTENT_ANCHORS_PER_SITE = 8;
/** One anchor is the desk tray. */
export const TRAY_ANCHORS = 1;
/** 6 habits + 1 tray = 7, one under the cap so a move can create before it deletes. */
export const MAX_HABITS = 6;

export type SurfaceKind = 'wall' | 'floor' | 'table' | 'ceiling' | 'other';

export interface Placement {
  /** Persistent anchor handle from XRAnchor.requestPersistentHandle(), if the runtime gave one. */
  anchorUuid: string | null;
  /** Shown as "on: <label>". */
  surfaceLabel: string;
  surface: SurfaceKind;
}

export interface Habit {
  id: string;
  presetId: string;
  label: string;
  glyph: string;
  kind: HabitKind;
  target: number;
  species: Species;
  createdDay: DayKey;
  archivedDay: DayKey | null;
  placement: Placement | null;
}

export interface FocusBlock {
  startedAt: number;
  minutes: 25 | 50;
  completedAt: number;
}

export interface FocusState {
  /** Wall-clock start (ms since epoch) of the running block, or null. */
  startedAt: number | null;
  minutes: 25 | 50;
  blocks: FocusBlock[];
}

export interface Ledger {
  format: 'mebae.history.v1';
  /** Sample gardens are never saved, exported or mixed with real history. */
  sample: boolean;
  habits: Habit[];
  /** counts[habitId][day] = pinches that day (capped at target). */
  counts: Record<string, Record<DayKey, number>>;
  focus: FocusState;
}

export class HabitError extends Error {
  constructor(
    public code: 'limit' | 'unknown-preset' | 'unknown-habit' | 'archived' | 'sample',
    message: string,
  ) {
    super(message);
    this.name = 'HabitError';
  }
}

export function emptyLedger(): Ledger {
  return {
    format: 'mebae.history.v1',
    sample: false,
    habits: [],
    counts: {},
    focus: { startedAt: null, minutes: 25, blocks: [] },
  };
}

export function activeHabits(l: Ledger): Habit[] {
  return l.habits.filter((h) => h.archivedDay === null);
}

function nextId(l: Ledger, presetId: string): string {
  let n = l.habits.length + 1;
  while (l.habits.some((h) => h.id === `${presetId}-${n}`)) n++;
  return `${presetId}-${n}`;
}

export function createHabit(
  l: Ledger,
  presetId: string,
  clock: Clock,
  placement: Placement | null = null,
): Habit {
  requireReal(l);
  const preset = presetById(presetId);
  if (!preset) throw new HabitError('unknown-preset', `No preset named "${presetId}".`);
  if (activeHabits(l).length >= MAX_HABITS) {
    throw new HabitError(
      'limit',
      `Mebae keeps ${MAX_HABITS} habits so every one can hold a persistent anchor (Quest allows ${PERSISTENT_ANCHORS_PER_SITE} per site, one is the tray). Drop a sprout in the tray to free a seed.`,
    );
  }
  const species = placement?.surface === 'wall' ? 'moss' : preset.species;
  const habit: Habit = {
    id: nextId(l, presetId),
    presetId,
    label: preset.label,
    glyph: preset.glyph,
    kind: preset.kind,
    target: preset.target,
    species,
    createdDay: dayKey(clock.now()),
    archivedDay: null,
    placement,
  };
  l.habits.push(habit);
  l.counts[habit.id] = {};
  return habit;
}

function requireActive(l: Ledger, id: string): Habit {
  requireReal(l);
  const h = l.habits.find((x) => x.id === id);
  if (!h) throw new HabitError('unknown-habit', `No habit with id "${id}".`);
  if (h.archivedDay !== null) throw new HabitError('archived', `"${h.label}" was removed.`);
  return h;
}

function requireReal(l: Ledger): void {
  if (l.sample) throw new HabitError('sample', 'The example garden is sample data. Switch back to your real garden to tend it.');
}

export function countOn(l: Ledger, id: string, day: DayKey): number {
  return l.counts[id]?.[day] ?? 0;
}

export interface CheckResult {
  habit: Habit;
  day: DayKey;
  count: number;
  /** True only on the pinch that completes the day. */
  completedNow: boolean;
  /** True when the pinch changed nothing (already complete). */
  saturated: boolean;
}

/** One pinch: +1 for counted habits (up to target); done for daily ones. */
export function checkIn(l: Ledger, id: string, clock: Clock): CheckResult {
  const h = requireActive(l, id);
  const day = dayKey(clock.now());
  const before = countOn(l, id, day);
  if (before >= h.target) {
    return { habit: h, day, count: before, completedNow: false, saturated: true };
  }
  const count = before + 1;
  (l.counts[id] ??= {})[day] = count;
  return { habit: h, day, count, completedNow: count === h.target, saturated: false };
}

/** Pinch-hold for 1 s: removes one pinch from today. Never touches past days. */
export function undoOne(l: Ledger, id: string, clock: Clock): CheckResult {
  const h = requireActive(l, id);
  const day = dayKey(clock.now());
  const before = countOn(l, id, day);
  const count = Math.max(0, before - 1);
  const map = (l.counts[id] ??= {});
  if (count === 0) delete map[day];
  else map[day] = count;
  return { habit: h, day, count, completedNow: false, saturated: before === 0 };
}

export function setPlacement(l: Ledger, id: string, placement: Placement | null): Habit {
  const h = requireActive(l, id);
  h.placement = placement;
  if (placement?.surface === 'wall') h.species = 'moss';
  else if (placement) h.species = presetById(h.presetId)?.species ?? h.species;
  return h;
}

/** Dropping a sprout in the tray archives it. History stays in the ledger. */
export function archiveHabit(l: Ledger, id: string, clock: Clock): Habit {
  const h = requireActive(l, id);
  h.archivedDay = dayKey(clock.now());
  h.placement = null;
  return h;
}
