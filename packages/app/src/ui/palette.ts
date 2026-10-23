/** Brand palette (BRANDS.md: Mebae). */
export const LOAM = '#1d1a14';
export const SEED_PAPER = '#f3ecd9';
export const MOSS = '#5b7f3a';
export const TERRACOTTA = '#c96a3d';
export const INK_SOFT = '#4a4335';

export const FONT_UI = '"Rethink Sans", "Helvetica Neue", Arial, sans-serif';
export const FONT_MONO = '"Sono", ui-monospace, Menlo, monospace';

/** Waits (max 1.5 s) for the web fonts so canvas text uses them. */
export async function fontsReady(): Promise<void> {
  if (!('fonts' in document)) return;
  const wait = Promise.all([
    document.fonts.load(`600 48px "Rethink Sans"`),
    document.fonts.load(`500 40px "Sono"`),
  ]).catch(() => undefined);
  await Promise.race([wait, new Promise((r) => setTimeout(r, 1500))]);
}
