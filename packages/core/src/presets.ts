/**
 * The 12 habit presets. There is no text entry in Mebae: a habit is an icon
 * plus a short preset label. `glyph` names a procedural line icon drawn by
 * the app (packages/app/src/ui/icons.ts).
 */
export type Species = 'moss' | 'fern' | 'maple' | 'bamboo';
export type HabitKind = 'daily' | 'counted';
export type Ritual = 'morning' | 'day' | 'evening';

export interface Preset {
  id: string;
  label: string;
  glyph: string;
  kind: HabitKind;
  /** Pinches per day that complete the day (1 for daily habits). */
  target: number;
  /** Species when planted on a horizontal surface. Walls always grow moss. */
  species: Species;
  ritual: Ritual;
  /** Where people usually pin it, shown as a hint on the radial. */
  hint: string;
}

export const PRESETS: readonly Preset[] = [
  { id: 'stretch', label: 'Stretch', glyph: 'stretch', kind: 'daily', target: 1, species: 'moss', ritual: 'morning', hint: 'doorway' },
  { id: 'water', label: 'Water', glyph: 'glass', kind: 'counted', target: 8, species: 'bamboo', ritual: 'day', hint: 'kitchen counter' },
  { id: 'read', label: 'Read', glyph: 'book', kind: 'daily', target: 1, species: 'fern', ritual: 'evening', hint: 'bedside' },
  { id: 'deep-work', label: 'Deep work', glyph: 'lamp', kind: 'daily', target: 1, species: 'maple', ritual: 'day', hint: 'desk' },
  { id: 'breathe', label: 'Breathe', glyph: 'breath', kind: 'daily', target: 1, species: 'moss', ritual: 'morning', hint: 'window' },
  { id: 'journal', label: 'Journal', glyph: 'pen', kind: 'daily', target: 1, species: 'fern', ritual: 'evening', hint: 'desk' },
  { id: 'walk', label: 'Walk', glyph: 'shoe', kind: 'daily', target: 1, species: 'bamboo', ritual: 'day', hint: 'front door' },
  { id: 'tidy', label: 'Tidy up', glyph: 'broom', kind: 'daily', target: 1, species: 'fern', ritual: 'evening', hint: 'shelf' },
  { id: 'vitamins', label: 'Vitamins', glyph: 'pill', kind: 'daily', target: 1, species: 'maple', ritual: 'morning', hint: 'kitchen' },
  { id: 'eye-break', label: 'Eye breaks', glyph: 'eye', kind: 'counted', target: 4, species: 'bamboo', ritual: 'day', hint: 'monitor' },
  { id: 'practice', label: 'Practice', glyph: 'note', kind: 'daily', target: 1, species: 'maple', ritual: 'evening', hint: 'instrument' },
  { id: 'lights-out', label: 'Lights out', glyph: 'moon', kind: 'daily', target: 1, species: 'fern', ritual: 'evening', hint: 'bed' },
] as const;

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
