import { isDayKey } from './clock.js';
import { type Habit, type Ledger, MAX_HABITS, activeHabits } from './habits.js';
import { presetById } from './presets.js';

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export interface ExportFile {
  format: 'mebae.history.v1';
  exportedAt: string;
  ledger: Ledger;
}

/** JSON export of real history. Sample gardens cannot be exported. */
export function exportLedger(l: Ledger, exportedAt: Date): string {
  if (l.sample) throw new ImportError('The example garden is sample data and cannot be exported.');
  const file: ExportFile = { format: 'mebae.history.v1', exportedAt: exportedAt.toISOString(), ledger: l };
  return JSON.stringify(file, null, 2);
}

const fail = (msg: string): never => {
  throw new ImportError(msg);
};

function checkHabit(h: unknown, i: number): Habit {
  if (typeof h !== 'object' || h === null) fail(`habits[${i}] is not an object.`);
  const o = h as Record<string, unknown>;
  for (const k of ['id', 'presetId', 'label', 'glyph', 'kind', 'species', 'createdDay'] as const)
    if (typeof o[k] !== 'string') fail(`habits[${i}].${k} must be a string.`);
  if (!presetById(o.presetId as string)) fail(`habits[${i}].presetId "${o.presetId}" is not a known preset.`);
  if (o.kind !== 'daily' && o.kind !== 'counted') fail(`habits[${i}].kind must be daily or counted.`);
  if (!['moss', 'fern', 'maple', 'bamboo'].includes(o.species as string)) fail(`habits[${i}].species is unknown.`);
  if (typeof o.target !== 'number' || !Number.isInteger(o.target) || o.target < 1 || o.target > 20)
    fail(`habits[${i}].target must be an integer from 1 to 20.`);
  if (!isDayKey(o.createdDay)) fail(`habits[${i}].createdDay is not a YYYY-MM-DD date.`);
  if (o.archivedDay !== null && !isDayKey(o.archivedDay)) fail(`habits[${i}].archivedDay is not a date or null.`);
  if (o.placement !== null) {
    const p = o.placement as Record<string, unknown> | undefined;
    if (!p || typeof p.surfaceLabel !== 'string' || typeof p.surface !== 'string')
      fail(`habits[${i}].placement is malformed.`);
    if (p!.anchorUuid !== null && typeof p!.anchorUuid !== 'string') fail(`habits[${i}].placement.anchorUuid is malformed.`);
  }
  return o as unknown as Habit;
}

/** Parses and validates an export. Throws ImportError with a readable reason. */
export function importLedger(json: string): Ledger {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    fail('This file is not JSON.');
  }
  const file = raw as Partial<ExportFile>;
  if (!file || file.format !== 'mebae.history.v1') fail('This is not a Mebae history file (format mebae.history.v1).');
  const l = file.ledger as Ledger | undefined;
  if (!l || typeof l !== 'object') fail('The file has no ledger.');
  if (l!.sample) fail('This file holds sample data. Mebae never mixes sample data with real history.');
  if (!Array.isArray(l!.habits)) fail('ledger.habits must be a list.');
  const habits = l!.habits.map(checkHabit);
  const ids = new Set(habits.map((h) => h.id));
  if (ids.size !== habits.length) fail('Two habits share an id.');
  if (habits.filter((h) => h.archivedDay === null).length > MAX_HABITS)
    fail(`More than ${MAX_HABITS} active habits.`);
  if (typeof l!.counts !== 'object' || l!.counts === null) fail('ledger.counts must be an object.');
  for (const [id, days] of Object.entries(l!.counts)) {
    const h = habits.find((x) => x.id === id);
    if (!h) fail(`counts has an entry for unknown habit "${id}".`);
    for (const [d, n] of Object.entries(days as Record<string, unknown>)) {
      if (!isDayKey(d)) fail(`counts.${id} has a bad date "${d}".`);
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > h!.target)
        fail(`counts.${id}.${d} must be an integer from 0 to ${h!.target}.`);
    }
  }
  const f = l!.focus;
  if (!f || (f.startedAt !== null && typeof f.startedAt !== 'number') || !Array.isArray(f.blocks))
    fail('ledger.focus is malformed.');
  if (f.minutes !== 25 && f.minutes !== 50) fail('ledger.focus.minutes must be 25 or 50.');
  for (const b of f.blocks)
    if (typeof b?.startedAt !== 'number' || typeof b?.completedAt !== 'number' || (b.minutes !== 25 && b.minutes !== 50))
      fail('A focus block is malformed.');
  const out: Ledger = {
    format: 'mebae.history.v1',
    sample: false,
    habits,
    counts: Object.fromEntries(habits.map((h) => [h.id, { ...(l!.counts[h.id] ?? {}) }])),
    focus: { startedAt: f.startedAt, minutes: f.minutes, blocks: f.blocks.map((b) => ({ ...b })) },
  };
  return out;
}

/** Number of active habits whose saved anchor handle is set. */
export function anchoredCount(l: Ledger): number {
  return activeHabits(l).filter((h) => h.placement?.anchorUuid).length;
}
