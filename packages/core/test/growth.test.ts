import { describe, expect, it } from 'vitest';
import {
  MAX_STAGE,
  ManualClock,
  STAGE_DAYS,
  addDays,
  checkIn,
  createHabit,
  dayKey,
  emptyLedger,
  growthOf,
  stageFor,
  weekRing,
} from '../src/index.js';

const T0 = new Date(2026, 9, 24, 8, 0).getTime(); // a Saturday

describe('growth', () => {
  it('has 8 stages with increasing thresholds', () => {
    expect(STAGE_DAYS).toHaveLength(8);
    for (let i = 1; i < STAGE_DAYS.length; i++) expect(STAGE_DAYS[i]).toBeGreaterThan(STAGE_DAYS[i - 1]);
    expect(stageFor(0)).toBe(0);
    expect(stageFor(1)).toBe(1);
    expect(stageFor(1000)).toBe(MAX_STAGE);
  });

  it('first check-in reaches stage 1', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'stretch', c);
    expect(growthOf(l, h, dayKey(c.now())).stage).toBe(0);
    expect(growthOf(l, h, dayKey(c.now())).vitality).toBe('fresh');
    checkIn(l, h.id, c);
    const g = growthOf(l, h, dayKey(c.now()));
    expect(g).toMatchObject({ stage: 1, completedDays: 1, streak: 1, vitality: 'thriving' });
  });

  it('a missed day pauses growth and never resets it', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'stretch', c);
    for (let d = 0; d < 4; d++) {
      checkIn(l, h.id, c);
      c.advanceDays(1);
    }
    const before = growthOf(l, h, dayKey(c.now()));
    expect(before.stage).toBe(3);
    c.advanceDays(3); // three missed days
    const paused = growthOf(l, h, dayKey(c.now()));
    expect(paused.stage).toBe(3);
    expect(paused.completedDays).toBe(4);
    expect(paused.vitality).toBe('resting');
    expect(paused.streak).toBe(0);
    checkIn(l, h.id, c);
    const resumed = growthOf(l, h, dayKey(c.now()));
    expect(resumed).toMatchObject({ completedDays: 5, stage: 3, vitality: 'thriving', toNextStage: 1 });
    c.advanceDays(1);
    checkIn(l, h.id, c);
    expect(growthOf(l, h, dayKey(c.now())).stage).toBe(4);
  });

  it('a counted day only counts once the target is reached', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'water', c);
    for (let i = 0; i < 7; i++) checkIn(l, h.id, c);
    expect(growthOf(l, h, dayKey(c.now())).completedDays).toBe(0);
    checkIn(l, h.id, c);
    expect(growthOf(l, h, dayKey(c.now())).completedDays).toBe(1);
  });

  it('is deterministic: same history, same growth, regardless of insertion order', () => {
    const mk = (order: number[]) => {
      const l = emptyLedger();
      const c = new ManualClock(T0);
      const h = createHabit(l, 'read', c);
      for (const d of order) l.counts[h.id][addDays('2026-10-01', d)] = 1;
      return growthOf(l, h, '2026-10-24');
    };
    expect(mk([0, 3, 5, 6, 7, 8, 20])).toEqual(mk([20, 8, 7, 6, 5, 3, 0]));
  });

  it('waiting: done yesterday, today open; streak still counts yesterday', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'read', c);
    checkIn(l, h.id, c);
    c.advanceDays(1);
    checkIn(l, h.id, c);
    c.advanceDays(1);
    const g = growthOf(l, h, dayKey(c.now()));
    expect(g).toMatchObject({ vitality: 'waiting', streak: 2 });
  });

  it('a week with 5 completed days blooms, and stays in bloom the next week', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'read', c);
    // Mon Oct 26 .. Fri Oct 30
    for (let i = 0; i < 5; i++) l.counts[h.id][addDays('2026-10-26', i)] = 1;
    const g = growthOf(l, h, '2026-11-01');
    expect(g.bloomWeeks).toEqual(['2026-10-26']);
    expect(g.inBloom).toBe(true);
    // Missed days can make a flowering plant resting. Flowers (and the bloom
    // label in the app) last through every day of the following week.
    for (let d = 0; d < 7; d++) {
      expect(growthOf(l, h, addDays('2026-11-02', d))).toMatchObject({
        inBloom: true,
        vitality: 'resting',
        completedDays: 5,
      });
    }
    expect(growthOf(l, h, '2026-11-09').inBloom).toBe(false);
  });

  it('future-dated counts are ignored', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'read', c);
    l.counts[h.id]['2026-12-01'] = 1;
    expect(growthOf(l, h, '2026-10-24').completedDays).toBe(0);
  });

  it('week ring has 7 cells Mon-Sun with fractions for counted habits', () => {
    const l = emptyLedger();
    const c = new ManualClock(T0);
    const h = createHabit(l, 'water', c);
    for (let i = 0; i < 6; i++) checkIn(l, h.id, c);
    const ring = weekRing(l, h, '2026-10-24');
    expect(ring.map((x) => x.day)).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25',
    ]);
    expect(ring[5].fraction).toBeCloseTo(6 / 8);
    expect(ring[6].future).toBe(true);
  });
});
