import { describe, expect, it } from 'vitest';
import {
  HabitError,
  MAX_HABITS,
  ManualClock,
  PERSISTENT_ANCHORS_PER_SITE,
  TRAY_ANCHORS,
  activeHabits,
  archiveHabit,
  checkIn,
  countOn,
  createHabit,
  dayKey,
  emptyLedger,
  setPlacement,
  undoOne,
} from '../src/index.js';

const T0 = new Date(2026, 9, 24, 8, 30).getTime(); // Oct 24 2026 08:30 local

describe('habits state machine', () => {
  it('creates a habit from a preset with its kind and target', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'water', c);
    expect(h.kind).toBe('counted');
    expect(h.target).toBe(8);
    expect(h.createdDay).toBe('2026-10-24');
    expect(activeHabits(l)).toHaveLength(1);
  });

  it('rejects an unknown preset with a readable error', () => {
    expect(() => createHabit(emptyLedger(), 'nope', new ManualClock(T0))).toThrow(/No preset named "nope"/);
  });

  it('caps habits at 6 so 6 + tray stays under the 8-anchor site cap', () => {
    expect(MAX_HABITS + TRAY_ANCHORS).toBeLessThanOrEqual(PERSISTENT_ANCHORS_PER_SITE);
    const l = emptyLedger();
    const c = new ManualClock(T0);
    for (let i = 0; i < MAX_HABITS; i++) createHabit(l, 'read', c);
    let err: unknown;
    try {
      createHabit(l, 'read', c);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HabitError);
    expect((err as HabitError).code).toBe('limit');
  });

  it('archiving frees a slot but keeps the history', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const ids = Array.from({ length: MAX_HABITS }, () => createHabit(l, 'walk', c).id);
    checkIn(l, ids[0], c);
    archiveHabit(l, ids[0], c);
    expect(activeHabits(l)).toHaveLength(MAX_HABITS - 1);
    expect(countOn(l, ids[0], '2026-10-24')).toBe(1);
    expect(() => checkIn(l, ids[0], c)).toThrow(/was removed/);
    expect(() => createHabit(l, 'walk', c)).not.toThrow();
    expect(new Set(l.habits.map((h) => h.id)).size).toBe(l.habits.length);
  });

  it('daily: one pinch completes, a second pinch is saturated', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'stretch', c);
    const r1 = checkIn(l, h.id, c);
    expect(r1).toMatchObject({ count: 1, completedNow: true, saturated: false });
    const r2 = checkIn(l, h.id, c);
    expect(r2).toMatchObject({ count: 1, completedNow: false, saturated: true });
  });

  it('counted: 3 pinches reach 3/8, a hold undoes one to 2/8', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'water', c);
    for (let i = 0; i < 3; i++) checkIn(l, h.id, c);
    expect(countOn(l, h.id, dayKey(c.now()))).toBe(3);
    const u = undoOne(l, h.id, c);
    expect(u.count).toBe(2);
  });

  it('counted: caps at the target and completes exactly once', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'water', c);
    const results = Array.from({ length: 10 }, () => checkIn(l, h.id, c));
    expect(results.filter((r) => r.completedNow)).toHaveLength(1);
    expect(results[7].completedNow).toBe(true);
    expect(results[9]).toMatchObject({ count: 8, saturated: true });
  });

  it('undo never goes below zero and never touches yesterday', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'water', c);
    checkIn(l, h.id, c);
    c.advanceDays(1);
    const u = undoOne(l, h.id, c);
    expect(u).toMatchObject({ count: 0, saturated: true });
    expect(countOn(l, h.id, '2026-10-24')).toBe(1);
    expect(l.counts[h.id]['2026-10-25']).toBeUndefined();
  });

  it('day rolls over at local midnight, not UTC', () => {
    const l = emptyLedger();
    const c = new ManualClock(new Date(2026, 9, 24, 23, 59, 30).getTime());
    const h = createHabit(l, 'stretch', c);
    checkIn(l, h.id, c);
    c.advance(60_000); // 00:00:30 local next day
    expect(dayKey(c.now())).toBe('2026-10-25');
    const r = checkIn(l, h.id, c);
    expect(r).toMatchObject({ day: '2026-10-25', completedNow: true });
  });

  it('rolls over correctly across the DST change (Nov 1 2026, LA)', () => {
    const c = new ManualClock(new Date(2026, 9, 31, 23, 30).getTime());
    expect(dayKey(c.now())).toBe('2026-10-31');
    c.advance(3600_000); // 00:30 Nov 1
    expect(dayKey(c.now())).toBe('2026-11-01');
    c.advance(25 * 3600_000); // the 25-hour day ends at local midnight
    expect(dayKey(c.now())).toBe('2026-11-02');
  });

  it('a wall placement grows moss; moving to a table restores the species', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'deep-work', c, { anchorUuid: 'a', surfaceLabel: 'door', surface: 'wall' });
    expect(h.species).toBe('moss');
    setPlacement(l, h.id, { anchorUuid: 'b', surfaceLabel: 'desk', surface: 'table' });
    expect(h.species).toBe('maple');
  });
});
