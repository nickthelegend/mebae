import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  IcosahedronGeometry,
  Matrix4,
  RepeatWrapping,
  SRGBColorSpace,
} from '@iwsdk/core';
import { hashSeed, mulberry32 } from '@mebae/core';

/** Merges boxes (each with its own transform) into one geometry: one draw call. */
export function mergedBoxes(boxes: { w: number; h: number; d: number; m: Matrix4 }[]): BufferGeometry {
  const parts = boxes.map((b) => new BoxGeometry(b.w, b.h, b.d).toNonIndexed().applyMatrix4(b.m));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  return out;
}

/** Procedural wood grain (no image files). */
export function woodTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  const rand = mulberry32(hashSeed('wood'));
  g.fillStyle = '#9a6b45';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 70; i++) {
    const y = rand() * 64;
    g.strokeStyle = `rgba(${60 + rand() * 30},${35 + rand() * 20},${20 + rand() * 10},${0.15 + rand() * 0.25})`;
    g.lineWidth = 0.5 + rand() * 1.8;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.5 * rand());
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A lumpy river stone. */
export function stoneGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    // keyed on position so shared corners move together (no cracks)
    const h = Math.sin(p.getX(i) * 12.9898 + p.getY(i) * 78.233 + p.getZ(i) * 37.719) * 43758.5453;
    const k = 0.85 + (h - Math.floor(h)) * 0.25;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.55, p.getZ(i) * k * 0.9);
  }
  g.computeVertexNormals();
  return g;
}
