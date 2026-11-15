import { describe, expect, it } from 'vitest';
import { MOSS_RADIUS_M, STAGE_NAMES, UPRIGHT_HEIGHT_M, displayScale, displaySize, plantForm, stageLine, stageName } from '../src/index.js';

describe('plant display size', () => {
  it('every stage is drawn bigger than the one before', () => {
    for (let s = 1; s < 8; s++) {
      expect(UPRIGHT_HEIGHT_M[s]).toBeGreaterThan(UPRIGHT_HEIGHT_M[s - 1] * 1.15);
      expect(MOSS_RADIUS_M[s]).toBeGreaterThan(MOSS_RADIUS_M[s - 1] * 1.1);
    }
  });
  for (const species of ['maple', 'fern', 'bamboo', 'moss'] as const) {
    it(`${species}: scaled forms reach their stage size and never shrink`, () => {
      let last = 0;
      for (let s = 0; s < 8; s++) {
        const f = plantForm(species, s, 'h1');
        const k = displayScale(f);
        expect(k).toBeGreaterThanOrEqual(1);
        const drawn = species === 'moss' ? f.mossRadius * k : f.height * k;
        expect(drawn).toBeGreaterThanOrEqual(displaySize(species, s) - 1e-9);
        expect(drawn).toBeGreaterThan(last);
        last = drawn;
      }
    });
  }
  it('a stage-1 sprout is at least 13 cm tall (readable from a seat 2.5 m away)', () => {
    for (const sp of ['maple', 'fern', 'bamboo'] as const) {
      const f = plantForm(sp, 1, 'x');
      expect(f.height * displayScale(f)).toBeGreaterThanOrEqual(0.13);
    }
  });
  it('names the 8 stages 1-based on screen', () => {
    expect(STAGE_NAMES).toHaveLength(8);
    expect(stageLine(0)).toBe('Stage 1 of 8 · Seed');
    expect(stageLine(7)).toBe('Stage 8 of 8 · Flourishing');
    expect(stageName(99)).toBe('Flourishing');
    expect(stageName(-3)).toBe('Seed');
  });
});
