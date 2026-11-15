/**
 * Text legibility in the headset. Every Mebae text surface is a canvas
 * texture on a flat card, so its physical cap height is
 *   fontPx × CAP_RATIO × (card height in m / canvas height in px).
 * The bar (Nov 15 judge pass): body text ≥ 18 mm cap height when the card is
 * 1 m away, scaled linearly with the distance it is actually read from.
 * The app builds its cards from CARDS, and test/legibility.test.ts checks
 * every one of them against the bar, so a smaller font fails the suite.
 */
export const MIN_CAP_AT_1M = 0.018;
/** Cap height / font size for Rethink Sans and Sono (both ≈ 0.70 em). */
export const CAP_RATIO = 0.7;

export interface CardSpec {
  /** Canvas size in px. */
  pxW: number;
  pxH: number;
  /** Card size in metres (at scale 1). */
  mW: number;
  mH: number;
  /** Smallest font in px drawn on this card. */
  minFontPx: number;
  /**
   * Distance in metres the card is normally read from. For cards that the
   * app scales with distance (sprout labels, aim label, reward text), this
   * is the distance at which scale = 1; they keep the same angular size
   * further away (see distanceScale).
   */
  viewM: number;
  /** Scaled with distance (keeps angular size). */
  scalesWithDistance?: boolean;
}

/** Cap height in metres of `fontPx` on a card. */
export function capHeightM(c: Pick<CardSpec, 'pxH' | 'mH'>, fontPx: number, scale = 1): number {
  return fontPx * CAP_RATIO * (c.mH / c.pxH) * scale;
}

/** Cap height normalised to 1 m (what the 18 mm bar is stated at). */
export function capAt1m(c: CardSpec, fontPx = c.minFontPx): number {
  return capHeightM(c, fontPx) / c.viewM;
}

/** Smallest font (px) that meets the bar on this card. */
export function minFontFor(c: Pick<CardSpec, 'pxH' | 'mH' | 'viewM'>): number {
  return Math.ceil((MIN_CAP_AT_1M * c.viewM * c.pxH) / (CAP_RATIO * c.mH));
}

/**
 * Scale for a card that should keep its angular size: 1 at `ref` metres,
 * growing linearly with distance, clamped so near cards don't vanish and far
 * ones don't swallow the room.
 */
export function distanceScale(distanceM: number, refM = 1, min = 0.7, max = 3.2): number {
  if (!Number.isFinite(distanceM)) return 1;
  return Math.max(min, Math.min(max, distanceM / refM));
}

/**
 * Every text card in the app. Viewing distances are for the seated layout:
 * eyes ~45 cm above the desk, tray ~35 cm in front of the chest.
 */
export const CARDS = {
  /** Sprout label, full layout (read within ~1.5 m). */
  sproutLabel: { pxW: 640, pxH: 460, mW: 0.3, mH: 0.215625, minFontPx: 56, viewM: 1, scalesWithDistance: true },
  /** Sprout label, compact pill used beyond ~1.5 m. */
  sproutPill: { pxW: 640, pxH: 220, mW: 0.3, mH: 0.103125, minFontPx: 56, viewM: 1, scalesWithDistance: true },
  /** Floating "+1 · 3/8" after a check-in. */
  reward: { pxW: 640, pxH: 200, mW: 0.3, mH: 0.09375, minFontPx: 64, viewM: 1, scalesWithDistance: true },
  /** "Grew: Stage 3 of 8 · Seedling" banner. */
  stageBanner: { pxW: 900, pxH: 200, mW: 0.42, mH: 0.0933, minFontPx: 60, viewM: 1, scalesWithDistance: true },
  /** Aim preview at the reticle ("Water · on: counter"). */
  aimLabel: { pxW: 900, pxH: 170, mW: 0.42, mH: 0.0793, minFontPx: 56, viewM: 1, scalesWithDistance: true },
  trayMenu: { pxW: 1200, pxH: 150, mW: 0.45, mH: 0.05625, minFontPx: 42, viewM: 0.6 },
  toast: { pxW: 1024, pxH: 220, mW: 0.44, mH: 0.0945, minFontPx: 40, viewM: 0.55 },
  stamp: { pxW: 1024, pxH: 110, mW: 0.44, mH: 0.0473, minFontPx: 42, viewM: 0.6 },
  focus: { pxW: 640, pxH: 150, mW: 0.25, mH: 0.0586, minFontPx: 44, viewM: 0.6 },
  radial: { pxW: 1024, pxH: 1024, mW: 0.38, mH: 0.38, minFontPx: 40, viewM: 0.5 },
  pinAgain: { pxW: 512, pxH: 220, mW: 0.165, mH: 0.0709, minFontPx: 50, viewM: 0.6 },
  week: { pxW: 1400, pxH: 700, mW: 0.66, mH: 0.33, minFontPx: 34, viewM: 0.6 },
  wrist: { pxW: 600, pxH: 420, mW: 0.1625, mH: 0.11375, minFontPx: 40, viewM: 0.4 },
  /** Voice coach card above the tray (listening, heard, planted). */
  coach: { pxW: 1024, pxH: 330, mW: 0.46, mH: 0.1482, minFontPx: 40, viewM: 0.6 },
} as const satisfies Record<string, CardSpec>;

export type CardName = keyof typeof CARDS;
