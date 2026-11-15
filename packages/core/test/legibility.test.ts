import { describe, expect, it } from 'vitest';
import { CARDS, MIN_CAP_AT_1M, capAt1m, capHeightM, distanceScale, minFontFor } from '../src/index.js';

describe('headset text legibility', () => {
  for (const [name, c] of Object.entries(CARDS)) {
    it(`${name}: smallest text is at least 18 mm cap height at 1 m`, () => {
      expect(capAt1m(c)).toBeGreaterThanOrEqual(MIN_CAP_AT_1M);
      expect(c.minFontPx).toBeGreaterThanOrEqual(minFontFor(c));
      // the canvas keeps the card's aspect ratio (no stretched text)
      expect(Math.abs(c.pxW / c.pxH - c.mW / c.mH)).toBeLessThan(0.05 * (c.pxW / c.pxH));
    });
  }
  it('cap height scales with the card and the font', () => {
    expect(capHeightM({ pxH: 100, mH: 0.1 }, 50)).toBeCloseTo(0.035, 6);
    expect(capHeightM({ pxH: 100, mH: 0.1 }, 50, 2)).toBeCloseTo(0.07, 6);
  });
  it('the old 15 cm sprout label with 30 px text failed the bar', () => {
    // packages/app before Nov 15: 640x400 canvas on a 0.15 x 0.094 m card
    expect(capAt1m({ pxW: 640, pxH: 400, mW: 0.15, mH: 0.094, minFontPx: 30, viewM: 1 })).toBeLessThan(MIN_CAP_AT_1M / 3);
  });
  it('distance-scaled cards keep their angular size and stay bounded', () => {
    expect(distanceScale(2.5)).toBeCloseTo(2.5);
    expect(distanceScale(0.2)).toBe(0.7);
    expect(distanceScale(9)).toBe(3.2);
    expect(distanceScale(Number.NaN)).toBe(1);
    // a sprout label 2.5 m away: same 18 mm-at-1 m angular size
    const c = CARDS.sproutPill;
    expect(capHeightM(c, c.minFontPx, distanceScale(2.5)) / 2.5).toBeGreaterThanOrEqual(MIN_CAP_AT_1M);
  });
});
