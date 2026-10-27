/** Tray-relative display layout; real anchored plants keep their actual size. */
export const RADIAL_Y = 0.18;
export const SAMPLE_PLANT_SCALE = 0.3;
export const SAMPLE_SPOTS: [number, number, number][] = [
  [0, 0.05, -0.48],
  [0.28, 0, -0.3],
  [-0.28, 0, -0.3],
  [-0.22, 0, -0.68],
  [0.22, 0, -0.68],
];

export function horizontalLabelRise(height: number, large: boolean, sample: boolean): number {
  const scale = sample ? SAMPLE_PLANT_SCALE : 1;
  return Math.max(0.1, height * scale + 0.075) + 0.02 * (large ? 1.4 : 1);
}
