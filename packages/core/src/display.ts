import type { PlantForm } from './lsystem.js';
import type { Species } from './presets.js';

/**
 * How big a real, anchored plant is drawn, and what each stage is called.
 *
 * The L-system forms are botanically proportioned (a stage-1 moss patch is
 * 5 cm across), which reads as a speck from a seated position 2-3 m away.
 * Mebae draws each stage at a target size instead, so the room reads from
 * the seat and every stage is visibly bigger than the one before it.
 */

/** Stage names shown on labels ("Stage 3 of 8 · Seedling"). Index = stage. */
export const STAGE_NAMES = ['Seed', 'Sprout', 'Seedling', 'Young plant', 'Leafy', 'Sapling', 'Mature', 'Flourishing'] as const;

/** Upright plants: target height in metres per stage (desk, counter, floor). */
export const UPRIGHT_HEIGHT_M = [0.09, 0.13, 0.17, 0.22, 0.28, 0.34, 0.41, 0.48] as const;
/** Wall moss: target patch radius in metres per stage. */
export const MOSS_RADIUS_M = [0.07, 0.095, 0.12, 0.15, 0.18, 0.21, 0.245, 0.28] as const;

const clampStage = (s: number) => Math.max(0, Math.min(7, Math.floor(s)));

export function stageName(stage: number): string {
  return STAGE_NAMES[clampStage(stage)];
}

/** "Stage 3 of 8 · Seedling" (stages are 0-based in the ledger, 1-based on screen). */
export function stageLine(stage: number): string {
  const s = clampStage(stage);
  return `Stage ${s + 1} of 8 · ${STAGE_NAMES[s]}`;
}

/**
 * Uniform scale applied to an L-system form so it reaches its stage's target
 * size. Never below 1: a form is only ever enlarged for legibility.
 */
export function displayScale(form: Pick<PlantForm, 'species' | 'stage' | 'height' | 'mossRadius'>): number {
  const s = clampStage(form.stage);
  if (form.species === 'moss') {
    const r = form.mossRadius > 0 ? form.mossRadius : 0.035;
    return Math.max(1, MOSS_RADIUS_M[s] / r);
  }
  const h = Math.max(0.02, form.height);
  return Math.max(1, UPRIGHT_HEIGHT_M[s] / h);
}

/** Drawn size (m) of a stage: height for upright plants, radius for moss. */
export function displaySize(species: Species, stage: number): number {
  const s = clampStage(stage);
  return species === 'moss' ? MOSS_RADIUS_M[s] : UPRIGHT_HEIGHT_M[s];
}
