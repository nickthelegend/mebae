import { describe, expect, it } from 'vitest';
import { estimateTriangles, plantForm, rewrite } from '../src/index.js';

const SPECIES = ['moss', 'fern', 'maple', 'bamboo'] as const;

describe('procedural plants', () => {
  it('rewrites an L-system deterministically', () => {
    expect(rewrite('X', { X: 'F[X]' }, 2)).toBe('F[F[X]]');
  });

  it.each(SPECIES)('%s: identical form for identical inputs', (sp) => {
    expect(plantForm(sp, 5, 'stretch-1')).toEqual(plantForm(sp, 5, 'stretch-1'));
  });

  it.each(SPECIES)('%s: grows (more leaves or bigger) through all 8 stages', (sp) => {
    let prevSize = -1;
    for (let s = 0; s < 8; s++) {
      const f = plantForm(sp, s, 'x');
      const size = f.leaves.length + f.stems.length + f.mossRadius * 1000 + f.height * 100;
      expect(size).toBeGreaterThan(prevSize);
      prevSize = size;
      for (const seg of [...f.stems]) for (const v of [...seg.a, ...seg.b]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('6 fully grown plants in bloom stay well inside the 150k triangle budget', () => {
    let tris = 0;
    for (let i = 0; i < 6; i++) tris += estimateTriangles(plantForm(SPECIES[i % 4], 7, `h${i}`, true));
    expect(tris).toBeLessThan(40_000);
  });

  it('bloom adds flowers, stage 7 maple is under half a metre', () => {
    const f = plantForm('maple', 7, 'desk', true);
    expect(f.flowers.length).toBeGreaterThan(0);
    expect(f.height).toBeLessThan(0.5);
    expect(plantForm('maple', 7, 'desk', false).flowers).toHaveLength(0);
  });
});
