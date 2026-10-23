import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

/**
 * A flat card whose face is a 2D canvas: one draw call, redrawn only when
 * its content changes (labels, the icon radial, the week rings).
 */
export class CanvasCard {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  readonly mesh: Mesh;

  constructor(
    public readonly pxW: number,
    public readonly pxH: number,
    public readonly mW: number,
    public readonly mH: number,
    name: string,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    this.g = g;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: DoubleSide,
      toneMapped: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(mW, mH), mat);
    this.mesh.name = name;
    this.mesh.renderOrder = 10;
  }

  draw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
    this.g.clearRect(0, 0, this.pxW, this.pxH);
    fn(this.g, this.pxW, this.pxH);
    this.texture.needsUpdate = true;
  }
}

export function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
