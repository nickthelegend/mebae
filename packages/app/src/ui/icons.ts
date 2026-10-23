/**
 * The 12 preset icons as procedural line drawings (no icon font, no images).
 * Each draws into a unit box [-1, 1] centred on the origin; the caller sets
 * transform, strokeStyle and lineWidth.
 */
type Draw = (g: CanvasRenderingContext2D) => void;

const circle = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
};
const line = (g: CanvasRenderingContext2D, ...pts: number[]) => {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
};

export const ICONS: Record<string, Draw> = {
  stretch: (g) => {
    circle(g, 0, -0.62, 0.17);
    line(g, -0.75, -0.55, -0.35, -0.25, 0, -0.38, 0.35, -0.25, 0.75, -0.55);
    line(g, 0, -0.38, 0, 0.25);
    line(g, -0.45, 0.85, 0, 0.25, 0.45, 0.85);
  },
  glass: (g) => {
    line(g, -0.5, -0.75, -0.38, 0.8, 0.38, 0.8, 0.5, -0.75);
    line(g, -0.44, -0.05, 0.44, -0.05);
    line(g, -0.2, 0.25, -0.05, 0.4);
  },
  book: (g) => {
    line(g, 0, -0.55, 0, 0.75);
    line(g, 0, -0.55, -0.35, -0.7, -0.8, -0.62, -0.8, 0.62, -0.35, 0.55, 0, 0.75, 0.35, 0.55, 0.8, 0.62, 0.8, -0.62, 0.35, -0.7, 0, -0.55);
  },
  lamp: (g) => {
    line(g, -0.55, 0.8, 0.55, 0.8);
    line(g, 0, 0.8, -0.3, 0.05, 0.25, -0.45);
    line(g, 0.05, -0.75, 0.75, -0.2, 0.25, -0.45, 0.05, -0.75);
    line(g, 0.55, 0.0, 0.62, 0.18);
  },
  breath: (g) => {
    g.beginPath();
    g.moveTo(-0.85, -0.35);
    g.bezierCurveTo(-0.2, -0.35, 0.4, -0.35, 0.45, -0.6);
    g.bezierCurveTo(0.5, -0.85, 0.1, -0.85, 0.15, -0.55);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.85, 0.05);
    g.lineTo(0.7, 0.05);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.85, 0.42);
    g.bezierCurveTo(-0.1, 0.42, 0.35, 0.42, 0.4, 0.65);
    g.bezierCurveTo(0.45, 0.88, 0.05, 0.88, 0.1, 0.6);
    g.stroke();
  },
  pen: (g) => {
    line(g, -0.6, 0.7, 0.55, -0.45, 0.72, -0.62, 0.55, -0.79, 0.38, -0.62, -0.75, 0.55, -0.82, 0.82, -0.6, 0.7);
    line(g, -0.85, 0.85, 0.85, 0.85);
  },
  shoe: (g) => {
    line(g, -0.85, 0.5, -0.8, -0.35, -0.35, -0.35, -0.2, -0.05, 0.4, 0.1, 0.8, 0.25, 0.85, 0.5, -0.85, 0.5);
    line(g, -0.85, 0.7, 0.85, 0.7);
    line(g, -0.35, -0.1, -0.15, -0.2);
  },
  broom: (g) => {
    line(g, 0.75, -0.85, 0.05, 0.1);
    line(g, -0.15, 0.0, 0.25, 0.35, -0.05, 0.85, -0.75, 0.6, -0.15, 0.0);
    line(g, -0.4, 0.75, -0.05, 0.35);
  },
  pill: (g) => {
    g.save();
    g.rotate(-Math.PI / 4);
    g.beginPath();
    g.arc(-0.35, 0, 0.32, Math.PI / 2, Math.PI * 1.5);
    g.lineTo(0.35, -0.32);
    g.arc(0.35, 0, 0.32, -Math.PI / 2, Math.PI / 2);
    g.closePath();
    g.stroke();
    line(g, 0, -0.32, 0, 0.32);
    g.restore();
  },
  eye: (g) => {
    g.beginPath();
    g.moveTo(-0.85, 0);
    g.quadraticCurveTo(0, -0.75, 0.85, 0);
    g.quadraticCurveTo(0, 0.75, -0.85, 0);
    g.stroke();
    circle(g, 0, 0, 0.22);
  },
  note: (g) => {
    circle(g, -0.38, 0.55, 0.22);
    circle(g, 0.42, 0.38, 0.22);
    line(g, -0.16, 0.55, -0.16, -0.7, 0.64, -0.85, 0.64, 0.38);
    line(g, -0.16, -0.38, 0.64, -0.53);
  },
  moon: (g) => {
    g.beginPath();
    g.arc(0, 0, 0.72, Math.PI * 0.3, Math.PI * 1.7);
    g.arc(0.38, -0.12, 0.55, Math.PI * 1.45, Math.PI * 0.55, true);
    g.stroke();
    line(g, 0.6, 0.55, 0.6, 0.75);
    line(g, 0.5, 0.65, 0.7, 0.65);
  },
};

export function drawIcon(
  g: CanvasRenderingContext2D,
  glyph: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  width = 0.11,
): void {
  const d = ICONS[glyph];
  if (!d) throw new Error(`Unknown icon "${glyph}"`);
  g.save();
  g.translate(cx, cy);
  g.scale(size / 2, size / 2);
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  d(g);
  g.restore();
}
