import { distanceScale, stageLine } from '@mebae/core';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { garden } from '../state/garden.js';
import { cardFor } from '../ui/canvas-card.js';
import { FONT_MONO, FONT_UI, LOAM, MOSS, SEED_PAPER, TERRACOTTA } from '../ui/palette.js';

/**
 * The check-in payoff, sized to read from the seat: a burst of glowing
 * leaves and petals from the plant, a light ring across its surface, the new
 * count rising above the label, and on a stage-up a column of light with a
 * "Stage 3 of 8 · Seedling" banner. Everything is hidden (0 draw calls)
 * between rewards; at most 4 extra draws while one plays.
 */
export type RewardKind = 'tap' | 'complete' | 'grow';

const MAX_PARTS = 96;
const GRAVITY = -0.55;

interface Part {
  p: Vector3;
  v: Vector3;
  age: number;
  life: number;
  size: number;
  spin: number;
  axis: Vector3;
}

const petal = (() => {
  const s = new Shape();
  s.moveTo(0, -1);
  s.quadraticCurveTo(0.75, -0.2, 0, 1);
  s.quadraticCurveTo(-0.75, -0.2, 0, -1);
  return new ShapeGeometry(s, 3);
})();

function columnTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,236,170,0.95)');
  grad.addColorStop(0.35, 'rgba(210,240,150,0.55)');
  grad.addColorStop(1, 'rgba(210,240,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const PALETTE: Record<RewardKind, string[]> = {
  tap: ['#b6e07a', '#8cc152', '#f3ecd9', '#d9f2a9'],
  complete: ['#ffd27a', '#ffe9a8', '#b6e07a', '#e08a5c', '#f3ecd9'],
  grow: ['#ffd27a', '#b6e07a', '#ffe9a8', '#8cc152', '#e08a5c', '#f3ecd9'],
};

export class RewardSystem extends createSystem({}) {
  private parts: Part[] = [];
  private mesh!: InstancedMesh;
  private ring!: Mesh;
  private ringT = -1;
  private ringMax = 0.4;
  private column!: Mesh;
  private columnT = -1;
  private columnH = 0.8;
  private text = cardFor('reward', 'Check-in reward');
  private textT = -1;
  private textFrom = new Vector3();
  private textScale = 1;
  private banner = cardFor('stageBanner', 'Stage banner');
  private bannerT = -1;
  private bannerFrom = new Vector3();
  private bannerScale = 1;
  private head = new Vector3();
  private m = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private c = new Color();
  private up = new Vector3(0, 1, 0);
  /** Last reward, for the e2e suite. */
  last: { kind: RewardKind; text: string; parts: number; at: number } | null = null;

  init(): void {
    const mat = new MeshBasicMaterial({ side: DoubleSide, transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending });
    this.mesh = new InstancedMesh(petal, mat, MAX_PARTS);
    this.mesh.name = 'Reward petals';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    for (let i = 0; i < MAX_PARTS; i++) this.mesh.setColorAt(i, this.c.set('#ffffff'));
    this.ring = new Mesh(
      new RingGeometry(0.82, 1, 64),
      new MeshBasicMaterial({ color: new Color('#ffe9a8'), transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending, side: DoubleSide }),
    );
    this.ring.name = 'Reward ring';
    this.ring.visible = false;
    this.ring.renderOrder = 24;
    this.column = new Mesh(
      new CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0),
      new MeshBasicMaterial({ map: columnTexture(), transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending, side: DoubleSide }),
    );
    this.column.name = 'Growth light';
    this.column.visible = false;
    this.column.renderOrder = 23;
    for (const card of [this.text, this.banner]) {
      card.mesh.visible = false;
      card.mesh.renderOrder = 40;
      (card.mesh.material as MeshBasicMaterial).depthTest = false;
    }
    for (const o of [this.mesh, this.ring, this.column, this.text.mesh, this.banner.mesh]) this.world.createTransformEntity(o, { persistent: true });
  }

  /**
   * Bursts a reward at a plant. `base` is the plant's root on its surface,
   * `normal` the surface normal, `top` the top of the plant, `labelTop` where
   * the rising text starts. `size` is the plant's drawn size (m).
   */
  burst(kind: RewardKind, at: { base: Vector3; normal: Vector3; top: Vector3; labelTop: Vector3; size: number }, text: string, stage = -1): void {
    this.player.head.getWorldPosition(this.head);
    const dist = this.head.distanceTo(at.top);
    // Far plants get a proportionally bigger effect so it reads from the seat.
    const k = Math.max(1, dist / 1.1);
    const n = kind === 'tap' ? 22 : kind === 'complete' ? 44 : 64;
    const colors = PALETTE[kind];
    const tangent = new Vector3().crossVectors(at.normal, Math.abs(at.normal.y) > 0.9 ? new Vector3(1, 0, 0) : this.up).normalize();
    const bitangent = new Vector3().crossVectors(at.normal, tangent).normalize();
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const out = (0.25 + Math.random() * 0.55) * k;
      const lift = (0.45 + Math.random() * (kind === 'tap' ? 0.5 : 0.9)) * k;
      const v = new Vector3()
        .addScaledVector(tangent, Math.cos(a) * out)
        .addScaledVector(bitangent, Math.sin(a) * out)
        .addScaledVector(at.normal, lift * 0.6);
      v.y += lift * 0.5;
      this.parts.push({
        p: at.top.clone().addScaledVector(v, 0.04),
        v,
        age: 0,
        life: 1.1 + Math.random() * (kind === 'tap' ? 0.5 : 1),
        size: (0.012 + Math.random() * 0.014) * k * (kind === 'tap' ? 1 : 1.25),
        spin: (Math.random() - 0.5) * 9,
        axis: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      });
      this.mesh.setColorAt((this.parts.length - 1) % MAX_PARTS, this.c.set(colors[i % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // light ring across the surface
    this.ring.position.copy(at.base).addScaledVector(at.normal, 0.006);
    this.ring.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), at.normal);
    this.ringMax = Math.max(0.22, at.size * 1.6) * (kind === 'tap' ? 1 : 1.5) * Math.min(k, 2);
    (this.ring.material as MeshBasicMaterial).color.set(kind === 'tap' ? '#c8f08a' : '#ffe39a');
    this.ringT = 0;
    this.ring.visible = true;
    // rising count
    this.textScale = distanceScale(dist);
    this.textFrom.copy(at.labelTop);
    this.drawText(kind, text);
    this.textT = 0;
    this.text.mesh.visible = true;
    if (kind === 'grow' && stage >= 0) {
      this.columnH = Math.max(0.6, at.size * 3) * Math.min(k, 1.8);
      this.column.position.copy(at.base);
      this.column.quaternion.identity();
      this.column.scale.set(Math.max(0.1, at.size * 0.8), 0.001, Math.max(0.1, at.size * 0.8));
      this.columnT = 0;
      this.column.visible = true;
      this.bannerScale = distanceScale(dist);
      this.bannerFrom.copy(at.labelTop).addScaledVector(this.up, 0.12 * this.bannerScale);
      this.drawBanner(stage);
      this.bannerT = 0;
      this.banner.mesh.visible = true;
    }
    this.last = { kind, text, parts: n, at: performance.now() };
  }

  update(dt: number): void {
    if (!this.parts.length && this.ringT < 0 && this.textT < 0 && this.columnT < 0 && this.bannerT < 0) return;
    this.player.head.getWorldPosition(this.head);
    // petals
    let live = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.v.y += GRAVITY * dt;
      p.v.multiplyScalar(1 - 1.6 * dt); // air drag: petals float down
      p.p.addScaledVector(p.v, dt);
      const fade = p.age < 0.12 ? p.age / 0.12 : 1 - Math.max(0, (p.age - p.life * 0.6) / (p.life * 0.4));
      this.q.setFromAxisAngle(p.axis, p.age * p.spin);
      this.s.setScalar(Math.max(0.0001, p.size * fade));
      this.m.compose(p.p, this.q, this.s);
      if (live !== i) this.parts[live] = p;
      this.mesh.setMatrixAt(live, this.m);
      live++;
    }
    this.parts.length = live;
    this.mesh.count = live;
    this.mesh.instanceMatrix.needsUpdate = true;
    // ring
    if (this.ringT >= 0) {
      this.ringT += dt / 0.8;
      const t = Math.min(1, this.ringT);
      const r = this.ringMax * (1 - Math.pow(1 - t, 3));
      this.ring.scale.setScalar(Math.max(0.001, r));
      (this.ring.material as MeshBasicMaterial).opacity = 1 - t;
      if (t >= 1) {
        this.ringT = -1;
        this.ring.visible = false;
      }
    }
    // rising text
    if (this.textT >= 0) {
      this.textT += dt / 1.9;
      const t = Math.min(1, this.textT);
      this.text.mesh.position.copy(this.textFrom);
      this.text.mesh.position.y += (0.05 + 0.12 * (1 - Math.pow(1 - t, 2))) * this.textScale;
      this.text.mesh.scale.setScalar(this.textScale * (t < 0.12 ? 0.6 + (t / 0.12) * 0.4 : 1));
      this.face(this.text.mesh);
      (this.text.mesh.material as MeshBasicMaterial).opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      if (t >= 1) {
        this.textT = -1;
        this.text.mesh.visible = false;
      }
    }
    // light column
    if (this.columnT >= 0) {
      this.columnT += dt / 2.2;
      const t = Math.min(1, this.columnT);
      this.column.scale.y = this.columnH * Math.min(1, t * 4);
      (this.column.material as MeshBasicMaterial).opacity = t < 0.25 ? 1 : 1 - (t - 0.25) / 0.75;
      if (t >= 1) {
        this.columnT = -1;
        this.column.visible = false;
      }
    }
    // stage banner
    if (this.bannerT >= 0) {
      this.bannerT += dt / 3.2;
      const t = Math.min(1, this.bannerT);
      this.banner.mesh.position.copy(this.bannerFrom);
      this.banner.mesh.position.y += 0.03 * t * this.bannerScale;
      this.banner.mesh.scale.setScalar(this.bannerScale * (t < 0.08 ? 0.7 + (t / 0.08) * 0.3 : 1));
      this.face(this.banner.mesh);
      (this.banner.mesh.material as MeshBasicMaterial).opacity = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
      if (t >= 1) {
        this.bannerT = -1;
        this.banner.mesh.visible = false;
      }
    }
  }

  private face(o: Mesh): void {
    o.quaternion.setFromAxisAngle(this.up, Math.atan2(this.head.x - o.position.x, this.head.z - o.position.z));
  }

  private drawText(kind: RewardKind, text: string): void {
    const hc = garden.settings.highContrast;
    this.text.draw((g, w, h) => {
      g.fillStyle = hc ? '#000' : kind === 'tap' ? 'rgba(29,26,20,0.86)' : MOSS;
      g.beginPath();
      g.roundRect(6, 6, w - 12, h - 12, (h - 12) / 2);
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = hc ? '#ffe14d' : kind === 'tap' ? '#c8f08a' : '#ffe39a';
      g.stroke();
      g.fillStyle = hc ? '#ffe14d' : SEED_PAPER;
      g.font = `700 84px ${kind === 'tap' ? FONT_MONO : FONT_UI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4, w - 60);
    });
  }

  private drawBanner(stage: number): void {
    const hc = garden.settings.highContrast;
    this.banner.draw((g, w, h) => {
      g.fillStyle = hc ? '#000' : SEED_PAPER;
      g.beginPath();
      g.roundRect(6, 6, w - 12, h - 12, 44);
      g.fill();
      g.lineWidth = 8;
      g.strokeStyle = hc ? '#ffe14d' : TERRACOTTA;
      g.stroke();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = hc ? '#ffe14d' : TERRACOTTA;
      g.font = `700 60px ${FONT_UI}`;
      g.fillText('It grew!', w / 2, 62);
      g.fillStyle = hc ? '#fff' : LOAM;
      g.font = `700 66px ${FONT_UI}`;
      g.fillText(stageLine(stage), w / 2, 140, w - 60);
    });
  }
}
