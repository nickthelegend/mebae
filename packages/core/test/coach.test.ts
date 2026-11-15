import { describe, expect, it } from 'vitest';
import {
  COACH_PRESET_IDS, CoachError, HabitError, ManualClock, PRESETS, checkIn, createHabit, dayKey, emptyLedger,
  parseCoachHabit, parseCoachNote, sampleLedger, surfaceHint, surfaceMatches, weeklySummary,
} from '../src/index.js';

const T0 = new Date(2026, 10, 18, 9, 0).getTime(); // Wed Nov 18 2026

describe('voice coach: structured habit', () => {
  it('accepts a valid answer and tidies it', () => {
    expect(parseCoachHabit({ preset: 'water', target: 8, surface: ' Kitchen Counter ', label: 'Drink water\nby the counter' }))
      .toEqual({ preset: 'water', target: 8, surface: 'kitchen counter', label: 'Drink water by the counter' });
  });
  it('falls back to the preset label when the coach gives none', () => {
    expect(parseCoachHabit({ preset: 'read', target: 1, surface: '' }).label).toBe('Read');
  });
  it.each([
    [null, /without a habit/],
    [{ preset: 'juggle', target: 1 }, /not one of the 12/],
    [{ preset: 'water', target: 0 }, /1 to 12/],
    [{ preset: 'water', target: 13 }, /1 to 12/],
    [{ preset: 'water', target: 2.5 }, /1 to 12/],
    [{ preset: 'water', target: '8' }, /1 to 12/],
  ])('rejects %j', (raw, msg) => {
    expect(() => parseCoachHabit(raw)).toThrow(CoachError);
    expect(() => parseCoachHabit(raw)).toThrow(msg);
  });
  it('exposes the 12 preset ids for the proxy schema', () => {
    expect(COACH_PRESET_IDS).toEqual(PRESETS.map((p) => p.id));
    expect(COACH_PRESET_IDS).toHaveLength(12);
  });
});

describe('voice coach: target override on createHabit', () => {
  it('a spoken count makes the habit counted with that target', () => {
    const l = emptyLedger();
    const h = createHabit(l, 'water', new ManualClock(T0), null, { target: 6 });
    expect([h.kind, h.target]).toEqual(['counted', 6]);
  });
  it('target 1 makes a daily habit, even for a counted preset', () => {
    const h = createHabit(emptyLedger(), 'eye-break', new ManualClock(T0), null, { target: 1 });
    expect([h.kind, h.target]).toEqual(['daily', 1]);
  });
  it('a daily preset spoken as "three times a day" becomes counted', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'stretch', c, null, { target: 3 });
    expect(h.kind).toBe('counted');
    checkIn(l, h.id, c);
    expect(checkIn(l, h.id, c).completedNow).toBe(false);
    expect(checkIn(l, h.id, c).completedNow).toBe(true);
  });
  it('refuses an out-of-range target with a readable error', () => {
    expect(() => createHabit(emptyLedger(), 'water', new ManualClock(T0), null, { target: 40 })).toThrow(HabitError);
    expect(() => createHabit(emptyLedger(), 'water', new ManualClock(T0), null, { target: 40 })).toThrow(/1 to 12/);
  });
  it('without options the preset target is unchanged', () => {
    expect(createHabit(emptyLedger(), 'water', new ManualClock(T0)).target).toBe(8);
  });
});

describe('voice coach: suggested surface', () => {
  it.each([
    ['counter', 'table', 'table', true],
    ['kitchen counter', 'desk', 'table', true],
    ['the door', 'door', 'wall', true],
    ['doorway', 'wall', 'wall', true],
    ['counter', 'wall', 'wall', false],
    ['door', 'floor', 'floor', false],
    ['yoga mat', 'floor', 'floor', true],
    ['', 'table', 'table', false],
  ] as const)('"%s" on %s (%s) -> %s', (s, label, kind, ok) => {
    expect(surfaceMatches(s, label, kind)).toBe(ok);
  });
  it('builds a readable hint', () => {
    expect(surfaceHint('counter')).toBe('the counter');
    expect(surfaceHint('my desk')).toBe('my desk');
    expect(surfaceHint('')).toBe('the spot where you do it');
  });
});

describe('voice coach: weekly note input', () => {
  it('summarises only counts from the real ledger', () => {
    const l = emptyLedger();
    const c = new ManualClock(new Date(2026, 10, 16, 9, 0).getTime()); // Mon
    const w = createHabit(l, 'water', c, { anchorUuid: 'secret-uuid', surfaceLabel: 'counter', surface: 'table' });
    for (let d = 0; d < 3; d++) {
      for (let i = 0; i < 8; i++) checkIn(l, w.id, c);
      c.advanceDays(1);
    }
    checkIn(l, w.id, c); // Thu: 1/8
    l.focus.blocks.push({ startedAt: c.now() - 25 * 60_000, minutes: 25, completedAt: c.now() });
    const s = weeklySummary(l, dayKey(c.now()), (ms) => dayKey(ms));
    expect(s.weekOf).toBe('2026-11-16');
    expect(s.habits[0]).toMatchObject({ label: 'Water', target: 8, goalMetDaysThisWeek: 3, daysElapsedThisWeek: 4, plantedDaysAgo: 3, todayCount: 1, streak: 3, stage: 'Seedling' });
    expect(s.focusBlocksThisWeek).toBe(1);
    expect(JSON.stringify(s)).not.toContain('secret-uuid');
    expect(JSON.stringify(s)).not.toContain('counter');
  });
  it('refuses the sample garden', () => {
    expect(() => weeklySummary(sampleLedger('2026-11-18'), '2026-11-18', (ms) => dayKey(ms))).toThrow(/sample data/);
  });
  it('validates the note', () => {
    expect(parseCoachNote({ note: '  Three water days so far.\nKeep the counter glass out.  ' })).toBe('Three water days so far. Keep the counter glass out.');
    expect(() => parseCoachNote({ note: '' })).toThrow(CoachError);
    expect(() => parseCoachNote({})).toThrow(/no note/);
    expect(parseCoachNote({ note: 'x'.repeat(900) })).toHaveLength(320);
  });
});
