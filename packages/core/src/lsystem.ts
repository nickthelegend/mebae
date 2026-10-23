import type { Species } from './presets.js';
import { hashSeed, mulberry32 } from './rng.js';

export type V3 = [number, number, number];

export interface Segment {
  a: V3;
  b: V3;
  r0: number;
  r1: number;
}
export interface Leaf {
  pos: V3;
  /** Unit direction the leaf points along. */
  dir: V3;
  size: number;
  /** 0 = inner/young, 1 = outer/old; tints the leaf. */
  age: number;
}
export interface Flower {
  pos: V3;
  size: number;
}
export interface PlantForm {
  species: Species;
  stage: number;
  stems: Segment[];
  leaves: Leaf[];
  flowers: Flower[];
  /** Moss patch radius in metres (0 for other species). */
  mossRadius: number;
  height: number;
}

/** Rewrites an L-system string `n` times. Deterministic. */
export function rewrite(axiom: string, rules: Record<string, string>, n: number): string {
  let s = axiom;
  for (let i = 0; i < n; i++) {
    let out = '';
    for (const c of s) out += rules[c] ?? c;
    s = out;
  }
  return s;
}

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Rotate v around unit axis k by angle t (Rodrigues). */
function rot(v: V3, k: V3, t: number): V3 {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const kxv = cross(k, v);
  const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  return [
    v[0] * c + kxv[0] * s + k[0] * d * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * d * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * d * (1 - c),
  ];
}

interface Turtle {
  p: V3;
  h: V3; // heading
  l: V3; // left
  len: number;
  r: number;
  depth: number;
}

/** 3D turtle: F forward, + - yaw, & ^ pitch, / \ roll, [ ] push/pop, L leaf. */
function interpret(
  s: string,
  opts: { len: number; r: number; angle: number; decay: number; jitter: number; rand: () => number; leafSize: number; gravitropism: number },
  out: PlantForm,
): void {
  const stack: Turtle[] = [];
  let t: Turtle = { p: [0, 0, 0], h: [0, 1, 0], l: [-1, 0, 0], len: opts.len, r: opts.r, depth: 0 };
  const j = () => (opts.rand() - 0.5) * 2 * opts.jitter;
  for (const c of s) {
    switch (c) {
      case 'F': {
        const b = add(t.p, t.h, t.len);
        out.stems.push({ a: t.p, b, r0: t.r, r1: t.r * 0.82 });
        t.p = b;
        t.r *= 0.82;
        // bend gently toward the light (up)
        t.h = norm(add(t.h, [0, 1, 0], opts.gravitropism));
        out.height = Math.max(out.height, b[1]);
        break;
      }
      case '+':
      case '-': {
        const up = cross(t.h, t.l);
        const a = (c === '+' ? 1 : -1) * (opts.angle + j());
        t.h = norm(rot(t.h, up, a));
        t.l = norm(rot(t.l, up, a));
        break;
      }
      case '&':
      case '^': {
        const a = (c === '&' ? 1 : -1) * (opts.angle + j());
        t.h = norm(rot(t.h, t.l, a));
        break;
      }
      case '/':
      case '\\': {
        const a = (c === '/' ? 1 : -1) * (2.39996 + j()); // golden angle roll
        t.l = norm(rot(t.l, t.h, a));
        break;
      }
      case '[':
        stack.push({ ...t, p: [...t.p] as V3, h: [...t.h] as V3, l: [...t.l] as V3 });
        t.len *= opts.decay;
        t.depth++;
        break;
      case ']':
        t = stack.pop() ?? t;
        break;
      case 'L':
        out.leaves.push({ pos: t.p, dir: norm(add(t.h, t.l, 0.3 * (opts.rand() - 0.5))), size: opts.leafSize * (0.8 + 0.4 * opts.rand()), age: Math.min(1, t.depth / 4) });
        break;
      default:
        break;
    }
  }
}

function maple(stage: number, rand: () => number, out: PlantForm): void {
  // stage 0 = seed leaf pair, 7 = a small potted maple (~0.42 m)
  const iters = [0, 1, 1, 2, 2, 3, 3, 4][stage];
  const s = rewrite('FX', { X: 'F[&+XL]/[&-XL]/[&XL]L', F: 'F' }, iters);
  interpret(
    s + (iters === 0 ? '[&+L][&-L]' : ''),
    { len: 0.035 + stage * 0.008, r: 0.004 + stage * 0.0012, angle: 0.55, decay: 0.86, jitter: 0.18, rand, leafSize: 0.03 + stage * 0.003, gravitropism: 0.08 },
    out,
  );
}

function fern(stage: number, rand: () => number, out: PlantForm): void {
  const fronds = [1, 2, 3, 4, 5, 7, 8, 9][stage];
  const pinnae = [2, 3, 4, 5, 6, 7, 8, 9][stage];
  const len = 0.05 + stage * 0.022;
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + rand() * 0.4;
    const tilt = 0.35 + 0.5 * (f % 2) + rand() * 0.15;
    let p: V3 = [0, 0, 0];
    let h: V3 = norm([Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), Math.cos(yaw) * Math.sin(tilt)]);
    const side: V3 = norm(cross(h, [0, 1, 0.0001]));
    const seg = len / pinnae;
    for (let i = 0; i < pinnae; i++) {
      const b = add(p, h, seg);
      out.stems.push({ a: p, b, r0: 0.0022 * (1 - i / pinnae) + 0.0006, r1: 0.0022 * (1 - (i + 1) / pinnae) + 0.0006 });
      const size = 0.022 * (1 - i / (pinnae + 2)) * (0.8 + stage * 0.05);
      out.leaves.push({ pos: b, dir: norm(add(side, h, 0.35)), size, age: i / pinnae });
      out.leaves.push({ pos: b, dir: norm(add([-side[0], -side[1], -side[2]], h, 0.35)), size, age: i / pinnae });
      p = b;
      // arch outward and down near the tip
      h = norm(add(h, [h[0], -0.6, h[2]], 0.12));
      out.height = Math.max(out.height, b[1]);
    }
  }
}

function bamboo(stage: number, rand: () => number, out: PlantForm): void {
  const culms = [1, 1, 2, 2, 3, 3, 4, 5][stage];
  const nodes = [2, 3, 4, 5, 6, 7, 8, 9][stage];
  for (let c = 0; c < culms; c++) {
    const ang = c * 2.4 + rand();
    let p: V3 = c === 0 ? [0, 0, 0] : [Math.cos(ang) * 0.025 * c, 0, Math.sin(ang) * 0.025 * c];
    const h: V3 = norm([Math.cos(ang) * 0.06, 1, Math.sin(ang) * 0.06]);
    const n = Math.max(2, nodes - c);
    const seg = 0.03 + stage * 0.004;
    for (let i = 0; i < n; i++) {
      const b = add(p, h, seg);
      out.stems.push({ a: p, b, r0: 0.0045, r1: 0.0042 });
      if (i >= 1) {
        const yaw = rand() * Math.PI * 2;
        out.leaves.push({ pos: b, dir: norm([Math.cos(yaw), 0.35, Math.sin(yaw)]), size: 0.05 + 0.004 * stage, age: i / n });
        if (i % 2 === 0)
          out.leaves.push({ pos: b, dir: norm([-Math.cos(yaw), 0.25, -Math.sin(yaw)]), size: 0.045, age: i / n });
      }
      p = b;
      out.height = Math.max(out.height, b[1]);
    }
  }
}

function moss(stage: number, rand: () => number, out: PlantForm): void {
  out.mossRadius = [0.035, 0.05, 0.065, 0.085, 0.105, 0.13, 0.16, 0.2][stage];
  // little tufts (instanced as tiny leaves) scattered on the patch
  const tufts = 6 + stage * 6;
  for (let i = 0; i < tufts; i++) {
    const r = Math.sqrt(rand()) * out.mossRadius * 0.85;
    const a = rand() * Math.PI * 2;
    out.leaves.push({ pos: [Math.cos(a) * r, 0.002, Math.sin(a) * r], dir: norm([rand() - 0.5, 1.4, rand() - 0.5]), size: 0.008 + rand() * 0.006, age: r / out.mossRadius });
  }
  out.height = 0.012;
}

/** The plant for a species at a stage. Same inputs -> identical form. */
export function plantForm(species: Species, stage: number, seed: string, inBloom = false): PlantForm {
  const st = Math.max(0, Math.min(7, Math.floor(stage)));
  const rand = mulberry32(hashSeed(`${seed}:${species}`));
  const out: PlantForm = { species, stage: st, stems: [], leaves: [], flowers: [], mossRadius: 0, height: 0 };
  if (species === 'maple') maple(st, rand, out);
  else if (species === 'fern') fern(st, rand, out);
  else if (species === 'bamboo') bamboo(st, rand, out);
  else moss(st, rand, out);
  if (inBloom) {
    // weekly bloom: flowers at the outermost leaves (moss: spore capsules)
    const tips = [...out.leaves].sort((a, b) => b.age - a.age || b.pos[1] - a.pos[1]).slice(0, Math.min(9, 3 + st));
    for (const t of tips) out.flowers.push({ pos: add(t.pos, t.dir, t.size * 0.6), size: species === 'moss' ? 0.006 : 0.014 });
  }
  return out;
}

/** Rough triangle count for budget checks (matches the app's mesh builder). */
export function estimateTriangles(f: PlantForm): number {
  const STEM_TRIS = 12; // 6-sided open tube
  const LEAF_TRIS = 6;
  const FLOWER_TRIS = 10;
  const MOSS_TRIS = f.mossRadius > 0 ? 512 : 0;
  return f.stems.length * STEM_TRIS + f.leaves.length * LEAF_TRIS + f.flowers.length * FLOWER_TRIS + MOSS_TRIS;
}
