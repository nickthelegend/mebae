import { describe, expect, it } from 'vitest';
import {
  ImportError,
  ManualClock,
  SAMPLE_STAMP,
  checkIn,
  createHabit,
  emptyLedger,
  exportLedger,
  growthOf,
  importLedger,
  planRestore,
  sampleLedger,
  startFocus,
} from '../src/index.js';

const T0 = new Date(2026, 9, 24, 8, 0).getTime();

function realLedger() {
  const l = emptyLedger();
  const c = new ManualClock(T0);
  const a = createHabit(l, 'stretch', c, { anchorUuid: 'uuid-a', surfaceLabel: 'door', surface: 'wall' });
  const b = createHabit(l, 'water', c, { anchorUuid: null, surfaceLabel: 'counter', surface: 'table' });
  checkIn(l, a.id, c);
  for (let i = 0; i < 6; i++) checkIn(l, b.id, c);
  startFocus(l.focus, c);
  return l;
}

describe('export / import', () => {
  it('round-trips exactly', () => {
    const l = realLedger();
    const json = exportLedger(l, new Date(T0));
    expect(importLedger(json)).toEqual(l);
  });

  it('refuses to export sample data', () => {
    expect(() => exportLedger(sampleLedger('2026-10-24'), new Date(T0))).toThrow(ImportError);
  });

  it('refuses to import sample data', () => {
    const file = { format: 'mebae.history.v1', exportedAt: 'x', ledger: sampleLedger('2026-10-24') };
    expect(() => importLedger(JSON.stringify(file))).toThrow(/never mixes sample data/);
  });

  it.each([
    ['not json', 'nope{', /not JSON/],
    ['wrong format', JSON.stringify({ format: 'x' }), /not a Mebae history file/],
    ['bad preset', null, /not a known preset/],
    ['count over target', null, /must be an integer from 0 to 1/],
    ['bad date', null, /bad date/],
  ])('rejects %s with a readable reason', (name, raw, re) => {
    let json = raw as string | null;
    if (json === null) {
      const f = JSON.parse(exportLedger(realLedger(), new Date(T0)));
      if (name === 'bad preset') f.ledger.habits[0].presetId = 'jetski';
      if (name === 'count over target') f.ledger.counts[f.ledger.habits[0].id]['2026-10-24'] = 5;
      if (name === 'bad date') f.ledger.counts[f.ledger.habits[0].id]['2026-13-40'] = 1;
      json = JSON.stringify(f);
    }
    expect(() => importLedger(json!)).toThrow(re);
  });

  it('the sample garden is flagged, stamped, and grows like day 30', () => {
    const s = sampleLedger('2026-10-24');
    expect(s.sample).toBe(true);
    expect(SAMPLE_STAMP).toBe('Example garden (sample data)');
    const stages = s.habits.map((h) => growthOf(s, h, '2026-10-24').stage);
    expect(Math.max(...stages)).toBeGreaterThanOrEqual(6);
    expect(sampleLedger('2026-10-24')).toEqual(s); // deterministic
  });
});

describe('anchor restore plan', () => {
  it('never guesses a position: missing or failed anchors go to "Pin again"', () => {
    const l = realLedger();
    const [a, b] = l.habits;
    const plan = planRestore(l, new Map([[a.id, { ok: true }]]));
    expect(plan).toEqual([
      { habitId: a.id, status: 'restored' },
      { habitId: b.id, status: 'pin-again', reason: expect.stringMatching(/did not give a persistent anchor/) },
    ]);
    const failed = planRestore(l, new Map([[a.id, { ok: false, reason: 'restorePersistentAnchor rejected' }]]));
    expect(failed[0]).toEqual({ habitId: a.id, status: 'pin-again', reason: 'restorePersistentAnchor rejected' });
  });
});
