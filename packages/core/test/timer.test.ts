import { describe, expect, it } from 'vitest';
import { ManualClock, cancelFocus, emptyLedger, extendFocus, focusStatus, settle, startFocus } from '../src/index.js';

const T0 = new Date(2026, 9, 24, 9, 0).getTime();

describe('focus timer (wall clock)', () => {
  it('starts a 25 min block and reports remaining time', () => {
    const f = emptyLedger().focus;
    const c = new ManualClock(T0);
    expect(startFocus(f, c)).toBe(true);
    c.advance(10 * 60_000);
    const s = focusStatus(f, c);
    expect(s.running).toBe(true);
    expect(s.remainingMs).toBe(15 * 60_000);
    expect(s.remainingFraction).toBeCloseTo(0.6);
  });

  it('survives a simulated suspend: no ticks needed, the stone is stamped at the real end', () => {
    const f = emptyLedger().focus;
    const c = new ManualClock(T0);
    startFocus(f, c);
    // headset suspended for 3 hours, app state serialised and restored
    const restored = JSON.parse(JSON.stringify(f));
    c.advance(3 * 3600_000);
    const block = settle(restored, c);
    expect(block).toEqual({ startedAt: T0, minutes: 25, completedAt: T0 + 25 * 60_000 });
    expect(focusStatus(restored, c)).toMatchObject({ running: false, stones: 1 });
  });

  it('does not settle early and does not double count', () => {
    const f = emptyLedger().focus;
    const c = new ManualClock(T0);
    startFocus(f, c);
    c.advance(24 * 60_000);
    expect(settle(f, c)).toBeNull();
    c.advance(60_000);
    expect(settle(f, c)).not.toBeNull();
    expect(settle(f, c)).toBeNull();
    expect(f.blocks).toHaveLength(1);
  });

  it('a second start while running is refused', () => {
    const f = emptyLedger().focus;
    const c = new ManualClock(T0);
    startFocus(f, c);
    expect(startFocus(f, c)).toBe(false);
  });

  it('keeps raking in the first minute: 25 becomes 50; later it cannot', () => {
    const f = emptyLedger().focus;
    const c = new ManualClock(T0);
    startFocus(f, c);
    c.advance(2000);
    expect(extendFocus(f, c)).toBe(true);
    expect(focusStatus(f, c).remainingMs).toBe(50 * 60_000 - 2000);
    const g = emptyLedger().focus;
    startFocus(g, c);
    c.advance(61_000);
    expect(extendFocus(g, c)).toBe(false);
  });

  it('cancel drops the block without a stone', () => {
    const f = emptyLedger().focus;
    const c = new ManualClock(T0);
    startFocus(f, c);
    expect(cancelFocus(f)).toBe(true);
    c.advance(26 * 60_000);
    expect(settle(f, c)).toBeNull();
    expect(f.blocks).toHaveLength(0);
  });

  it('starting after an elapsed block first banks the old stone', () => {
    const f = emptyLedger().focus;
    const c = new ManualClock(T0);
    startFocus(f, c);
    c.advance(30 * 60_000);
    expect(startFocus(f, c)).toBe(true);
    expect(f.blocks).toHaveLength(1);
  });
});
