import {
  RAKE_EXTEND_MS,
  RAKE_START_MS,
  cancelFocus,
  extendFocus,
  focusStatus,
  settle,
  startFocus,
} from '@mebae/core';
import {
  type Entity,
  CanvasTexture,
  Color,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector2,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { chimeGrow, chimeTap, chimeUndo, unlockAudio } from '../fx/chimes.js';
import { makePressable } from '../interaction/press-router.js';
import { garden } from '../state/garden.js';
import { CanvasCard, roundRect } from '../ui/canvas-card.js';
import { stoneGeometry } from '../ui/geometry.js';
import { FONT_MONO, FONT_UI, LOAM, MOSS, SEED_PAPER } from '../ui/palette.js';
import { TraySystem } from './tray.js';

const SAND_W = 0.205;
const SAND_H = 0.165;
const RAKE_PX = 256;
const MAX_STONES = 20;

/**
 * The focus sand: rake it (pinch-drag) for 2 s to start 25 minutes, keep
 * raking to 4 s for 50. The rake lines fade as the block runs, so the sand
 * is the timer. The 256x256 rake texture is written on the CPU only while
 * raking; the fade is a shader uniform. Each finished block leaves a stone.
 */
export class FocusSystem extends createSystem({}) {
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private sand!: Mesh;
  private sandEntity: Entity | null = null;
  private mat!: ShaderMaterial;
  private stones!: InstancedMesh;
  private card!: CanvasCard;
  private rakeMs = 0;
  private pressRakeMs = 0;
  private prevUv = new Vector2(-1, -1);
  private lastLabel = '';
  private nextTick = 0;
  private lastStones = -1;
  private v = new Vector3();
  rakeWrites = 0;

  init(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = RAKE_PX;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.mat = new ShaderMaterial({
      uniforms: { uRake: { value: this.tex }, uFade: { value: 0 }, uHC: { value: 0 }, uResume: { value: 0 } },
      side: 2,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform sampler2D uRake;
        uniform float uFade;
        uniform float uHC;
        uniform float uResume;
        float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          float grain = h(floor(vUv * 420.0)) * 0.08 + h(floor(vUv * 90.0)) * 0.05;
          vec3 sand = vec3(0.86, 0.79, 0.64) - grain;
          float g0 = texture2D(uRake, vUv).r * uFade;
          float g1 = texture2D(uRake, vUv + vec2(0.006, 0.006)).r * uFade;
          // A restored timer has no saved pixels: reconstruct lines on the GPU.
          float resumed = (1.0 - smoothstep(0.025, 0.07, abs(fract(vUv.y * 24.0) - 0.5))) * step(0.08, vUv.x) * step(vUv.x, 0.92);
          g0 = max(g0, resumed * uResume * uFade);
          vec3 col = sand * (1.0 - g0 * 0.42) + vec3(0.12) * max(0.0, g1 - g0);
          col = mix(col, mix(vec3(0.08), vec3(1.0, 0.88, 0.3), g0), uHC * step(0.05, g0));
          vec2 e = min(vUv, 1.0 - vUv);
          col *= 0.82 + 0.18 * smoothstep(0.0, 0.06, min(e.x, e.y));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sand = new Mesh(new PlaneGeometry(SAND_W, SAND_H), this.mat);
    this.sand.name = 'Focus sand';
    this.sand.rotation.x = -Math.PI / 2;
    this.sand.position.set(0.075, 0.0138, 0);
    this.stones = new InstancedMesh(stoneGeometry(), new MeshStandardMaterial({ color: new Color('#8a8f88'), roughness: 0.55 }), MAX_STONES);
    this.stones.name = 'Focus stones';
    this.stones.count = 0;
    this.card = new CanvasCard(640, 150, 0.15, 0.035, 'Focus timer');
    this.card.mesh.position.set(0.075, 0.052, -0.098);
    this.card.mesh.rotation.x = -0.35;

    const start = () => {
      const wire = () => {
        const tray = this.world.getSystem(TraySystem);
        if (this.sandEntity) return;
        if (!tray?.entity) return void setTimeout(wire, 50);
        this.sandEntity = this.world.createTransformEntity(this.sand, { parent: tray.entity, persistent: true });
        makePressable(this.sandEntity, 'sand', {
          down: () => {
            unlockAudio();
            this.pressRakeMs = 0;
            this.prevUv.set(-1, -1);
          },
          drag: (p, dt) => this.rake(p, dt),
          hold: () => {
            if (garden.isSample || garden.settings.oneHand) return;
            if (this.pressRakeMs < 150 && cancelFocus(garden.real.focus)) {
              this.clearRake();
              chimeUndo();
              garden.say('Focus block cancelled. No stone this time.');
              void garden.commit();
            }
          },
          tap: () => this.onTap(),
        });
        tray.root.add(this.stones);
        tray.root.add(this.card.mesh);
      };
      wire();
    };
    this.xrManager.addEventListener('sessionstart', start);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionstart', start));
  }

  private onTap(): void {
    if (garden.isSample) return garden.say('Example garden (sample data). Turn it off to start your own focus block.');
    if (this.pressRakeMs >= 150) return;
    const f = garden.real.focus;
    const st = focusStatus(f, garden.clock);
    if (garden.settings.oneHand) {
      if (!st.running) this.begin(25);
      else if (st.minutes === 25 && extendFocus(f, garden.clock)) {
        garden.say('50-minute focus block.');
        void garden.commit();
      } else {
        cancelFocus(f);
        this.clearRake();
        chimeUndo();
        garden.say('Focus block cancelled. No stone this time.');
        void garden.commit();
      }
      return;
    }
    if (!st.running) garden.say('Rake the sand: pinch and drag across it for 2 s to start 25 minutes (4 s for 50).');
  }

  private begin(min: 25 | 50): void {
    if (startFocus(garden.real.focus, garden.clock, min)) {
      chimeGrow();
      garden.say(`${min}-minute focus started. ${min === 25 ? 'Keep raking for 50.' : ''} The lines fade as time runs.`);
      void garden.commit();
    }
  }

  private rake(p: Vector3, dt: number): void {
    if (garden.isSample || garden.settings.oneHand) return;
    const l = this.sand.worldToLocal(this.v.copy(p));
    const u = l.x / SAND_W + 0.5;
    const v = l.y / SAND_H + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const step = Math.min(dt, 120);
    this.pressRakeMs += step;
    this.rakeMs += step;
    if (this.prevUv.x >= 0) this.drawStroke(this.prevUv.x, this.prevUv.y, u, v);
    this.prevUv.set(u, v);
    const f = garden.real.focus;
    const st = focusStatus(f, garden.clock);
    if (!st.running && this.pressRakeMs >= RAKE_START_MS) this.begin(25);
    else if (st.running && st.minutes === 25 && this.pressRakeMs >= RAKE_EXTEND_MS && extendFocus(f, garden.clock)) {
      chimeTap(6);
      garden.say('50-minute focus block. Let the sand settle.');
      void garden.commit();
    }
  }

  /** Four rake tines along the stroke. CPU texture write, only while raking. */
  private drawStroke(u0: number, v0: number, u1: number, v1: number): void {
    const g = this.g;
    const x0 = u0 * RAKE_PX, y0 = (1 - v0) * RAKE_PX, x1 = u1 * RAKE_PX, y1 = (1 - v1) * RAKE_PX;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineWidth = 5;
    g.shadowColor = '#fff';
    g.shadowBlur = 4;
    for (let k = -1.5; k <= 1.5; k += 1) {
      g.beginPath();
      g.moveTo(x0 + nx * k * 13, y0 + ny * k * 13);
      g.lineTo(x1 + nx * k * 13, y1 + ny * k * 13);
      g.stroke();
    }
    this.tex.needsUpdate = true;
    this.rakeWrites++;
  }

  private clearRake(): void {
    this.g.clearRect(0, 0, RAKE_PX, RAKE_PX);
    this.tex.needsUpdate = true;
    this.rakeMs = 0;
  }

  update(): void {
    const tray = this.world.getSystem(TraySystem);
    if (!tray?.placed) return;
    const now = performance.now();
    const real = garden.real.focus;
    const f = garden.ledger.focus;
    const st = focusStatus(f, garden.clock);
    this.mat.uniforms.uResume.value = st.running && this.rakeMs === 0 ? 1 : 0;
    this.mat.uniforms.uFade.value = garden.isSample ? 0 : st.running ? st.remainingFraction : this.rakeMs > 0 ? 1 : 0;
    this.mat.uniforms.uHC.value = garden.settings.highContrast ? 1 : 0;
    if (now < this.nextTick) return;
    this.nextTick = now + 500;
    const done = settle(real, garden.clock);
    if (done) {
      this.clearRake();
      chimeGrow();
      garden.say(`Focus block done (${done.minutes} min). A stone joins the tray.`);
      void garden.commit();
    }
    const n = Math.min(MAX_STONES, f.blocks.length);
    if (n !== this.lastStones) {
      this.lastStones = n;
      const m = new Matrix4();
      for (let i = 0; i < n; i++) {
        const s = 0.0075 + ((i * 37) % 5) * 0.0006;
        m.compose(new Vector3(-0.18 + i * 0.019, 0.032, -0.094), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), i * 1.3), new Vector3(s, s, s));
        this.stones.setMatrixAt(i, m);
      }
      this.stones.count = n;
      this.stones.instanceMatrix.needsUpdate = true;
      this.stones.computeBoundingSphere();
    }
    const label = garden.isSample
      ? 'Example garden (sample data)'
      : st.running
      ? `${fmt(st.remainingMs)} · ${st.minutes} min focus`
      : garden.settings.oneHand
        ? `Pinch: 25 → 50 → cancel · stones ${f.blocks.length}`
        : `Rake to focus · stones ${f.blocks.length}`;
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      const hc = garden.settings.highContrast;
      this.card.draw((g, w, h) => {
        g.fillStyle = hc ? '#000' : st.running ? MOSS : 'rgba(29,26,20,0.82)';
        roundRect(g, 4, 4, w - 8, h - 8, 34);
        g.fill();
        g.fillStyle = hc ? '#ffe14d' : SEED_PAPER;
        g.font = `600 ${st.running ? `52px ${FONT_MONO}` : `40px ${FONT_UI}`}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, w / 2, h / 2 + 2);
      });
    }
  }

  get status() {
    return { ...focusStatus(garden.real.focus, garden.clock), rakeMs: this.rakeMs, rakeWrites: this.rakeWrites, ink: LOAM };
  }
}

function fmt(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
