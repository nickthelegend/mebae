import { describe, expect, it } from 'vitest';
import { ManualClock, addDays, dayKey, daysBetween, isDayKey, weekStart } from '../src/clock.js';

describe('local calendar clock', () => {
  it.each([
    [2026, 2, 7, '2026-03-08'], // spring daylight saving transition in New York
    [2026, 9, 31, '2026-11-01'], // autumn transition
    [2026, 11, 31, '2027-01-01'],
  ])('advances one calendar day from %s/%s/%s, retaining the local morning', (year, month, day, next) => {
    const c = new ManualClock(new Date(year, month, day, 9).getTime());
    c.advanceDays(1);
    expect(dayKey(c.now())).toBe(next);
    expect(new Date(c.now()).getHours()).toBe(9);
    expect(c.now()).toBe(new Date(year, month, day + 1, 9).getTime());
  });

  it('uses calendar arithmetic across leap day and ISO-week year boundaries', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  it('rejects invalid dates instead of normalizing them', () => {
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-13-01')).toBe(false);
  });
});
