import { type DayKey, addDays } from './clock.js';
import { type Habit, type Ledger, emptyLedger } from './habits.js';
import { presetById } from './presets.js';
import { mulberry32 } from './rng.js';

/**
 * "Example garden (sample data)": what day 30 looks like. Always flagged
 * `sample: true`; the app stamps every view while it is shown, never saves
 * it, and never merges it with real history.
 */
export const SAMPLE_STAMP = 'Example garden (sample data)';

const PLAN: { preset: string; surface: 'wall' | 'table' | 'floor'; label: string; rate: number }[] = [
  { preset: 'stretch', surface: 'wall', label: 'door', rate: 0.85 },
  { preset: 'deep-work', surface: 'table', label: 'desk', rate: 0.8 },
  { preset: 'water', surface: 'table', label: 'counter', rate: 0.7 },
  { preset: 'read', surface: 'table', label: 'nightstand', rate: 0.6 },
  { preset: 'lights-out', surface: 'floor', label: 'floor', rate: 0.5 },
];

export function sampleLedger(today: DayKey, days = 30): Ledger {
  const l = emptyLedger();
  l.sample = true;
  const rand = mulberry32(30);
  const start = addDays(today, -(days - 1));
  PLAN.forEach((p, i) => {
    const preset = presetById(p.preset)!;
    const h: Habit = {
      id: `sample-${p.preset}`,
      presetId: p.preset,
      label: preset.label,
      glyph: preset.glyph,
      kind: preset.kind,
      target: preset.target,
      species: p.surface === 'wall' ? 'moss' : preset.species,
      createdDay: start,
      archivedDay: null,
      placement: { anchorUuid: null, surfaceLabel: p.label, surface: p.surface },
    };
    l.habits.push(h);
    const counts: Record<DayKey, number> = {};
    for (let d = 0; d < days; d++) {
      const day = addDays(start, d);
      const r = rand();
      if (r < p.rate) counts[day] = h.target;
      else if (h.kind === 'counted' && r < p.rate + 0.2) counts[day] = Math.max(1, Math.floor(h.target * (0.4 + i * 0.05)));
    }
    l.counts[h.id] = counts;
  });
  return l;
}
