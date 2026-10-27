import { HabitError, PRESETS, type Preset, createHabit, presetById, setPlacement } from '@mebae/core';
import {
  type Entity,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { chimeRoot, chimeTap, unlockAudio } from '../fx/chimes.js';
import { makePressable, pointFor } from '../interaction/press-router.js';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { CanvasCard } from '../ui/canvas-card.js';
import { drawIcon } from '../ui/icons.js';
import { FONT_MONO, FONT_UI, LOAM, MOSS, SEED_PAPER, TERRACOTTA } from '../ui/palette.js';
import { type AimHit, type AimSource, type SelectEvent, AimSystem } from './aim.js';
import { AnchorSystem } from './anchors.js';
import { surfaceQuaternion } from './surface-pose.js';
import { TrayEvents, TraySystem } from './tray.js';

const RADIAL_M = 0.32;
const FLIGHT_S = 0.95;

/**
 * Seed -> radial -> aim -> flight -> rooted. A new habit (or a "Pin again")
 * is only created once a real surface was hit and an XRAnchor exists there.
 */
export class PlantingSystem extends createSystem({}) {
  private radial!: CanvasCard;
  private radialEntity: Entity | null = null;
  private seed!: Mesh;
  private seedEntity: Entity | null = null;
  private reticle!: Group;
  private reticleEntity: Entity | null = null;
  private preview!: CanvasCard;
  private arc!: Line;
  private arcEntity: Entity | null = null;
  private hovered = -1;
  private preset: Preset | null = null;
  private repinId: string | null = null;
  private aimStart = 0;
  private aimSrc: AimSource = 'right';
  private pendingSelect: SelectEvent | null = null;
  private hit: AimHit | null = null;
  private flight: { from: Vector3; to: Vector3; normal: Vector3; t: number; hit: AimHit } | null = null;
  private seedHome = new Vector3();
  private head = new Vector3();
  private tmp = new Vector3();
  private q = new Quaternion();
  private lastPreview = '';
  private radialStyle = '';
  lastPlaced: { habitId: string; point: [number, number, number]; label: string; via: string } | null = null;

  init(): void {
    this.radial = new CanvasCard(1024, 1024, RADIAL_M, RADIAL_M, 'Icon radial');
    this.preview = new CanvasCard(640, 150, 0.17, 0.04, 'Aim label');
    this.seed = new Mesh(
      new SphereGeometry(1, 14, 10),
      new MeshStandardMaterial({ color: new Color('#d8b070'), roughness: 0.5, emissive: new Color('#3a2508'), emissiveIntensity: 0.5 }),
    );
    this.seed.scale.set(0.013, 0.009, 0.009);
    this.seed.name = 'Lifted seed';
    this.reticle = new Group();
    this.reticle.name = 'Aim reticle';
    const ring = new Mesh(new RingGeometry(0.03, 0.038, 40), new MeshBasicMaterial({ color: new Color(MOSS), transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2;
    const dot = new Mesh(new RingGeometry(0, 0.008, 20), new MeshBasicMaterial({ color: new Color(SEED_PAPER), depthTest: false, toneMapped: false }));
    dot.rotation.x = -Math.PI / 2;
    ring.renderOrder = dot.renderOrder = 20;
    this.reticle.add(ring, dot);
    this.preview.mesh.position.set(0, 0.07, 0);
    this.reticle.add(this.preview.mesh);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(24 * 3), 3));
    this.arc = new Line(g, new LineDashedMaterial({ color: new Color(SEED_PAPER), dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.85, toneMapped: false }));
    this.arc.name = 'Aim arc';
    this.arc.frustumCulled = false;

    const start = () => this.onSessionStart();
    this.xrManager.addEventListener('sessionstart', start);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionstart', start));
    this.xrManager.addEventListener('sessionend', () => this.reset());
    const ev = this.world.getSystem(TrayEvents)!;
    this.cleanupFuncs.push(
      ev.on('seed', () => this.onSeed()),
      ev.on('pin-again', (id) => id && this.onPinAgain(id)),
      this.world.getSystem(AimSystem)!.onSelect((e) => {
        if (ui.mode.peek() !== 'aiming' || e.startedAt < this.aimStart + 30) return;
        // Let PressRouter finish the UI pinch first. A seed/tray cancellation
        // must win over the same session select event's surface placement.
        this.pendingSelect = e;
      }),
    );
  }

  private onSessionStart(): void {
    const tray = this.world.getSystem(TraySystem)!;
    // entities are created once, after the tray entity exists
    const wire = () => {
      if (this.radialEntity) return;
      if (!tray.entity) return void setTimeout(wire, 50);
      this.radialEntity = this.world.createTransformEntity(this.radial.mesh, { parent: tray.entity, persistent: true });
      this.radial.mesh.position.set(0, 0.2, -0.02);
      this.radial.mesh.visible = false;
      makePressable(this.radialEntity, 'radial', { tap: (p) => this.onRadialTap(p) });
      this.seedEntity = this.world.createTransformEntity(this.seed, { persistent: true });
      makePressable(this.seedEntity, 'lifted-seed', { tap: () => this.onSeed() });
      this.seed.visible = false;
      this.reticleEntity = this.world.createTransformEntity(this.reticle, { persistent: true });
      this.reticle.visible = false;
      this.arcEntity = this.world.createTransformEntity(this.arc, { persistent: true });
      this.arc.visible = false;
    };
    wire();
  }

  private reset(): void {
    this.pendingSelect = null;
    ui.mode.value = 'idle';
    this.flight = null;
    this.preset = null;
    this.repinId = null;
    this.radial.mesh.visible = this.seed.visible = this.reticle.visible = this.arc.visible = false;
    this.world.getSystem(AimSystem)!.enabled = false;
  }

  private onSeed(): void {
    unlockAudio();
    const mode = ui.mode.peek();
    if (mode === 'radial' || mode === 'aiming') return this.cancel('Seed back in the tray.');
    if (mode !== 'idle') return;
    if (garden.isSample) return garden.say('Turn off the example garden to plant your own habits.');
    ui.weekOpen.value = false;
    const tray = this.world.getSystem(TraySystem)!;
    const free = tray.freeSlots();
    if (!free.length) {
      return garden.say('All 6 habits are planted. Pinch a sprout’s wooden stake, then pinch the tray to free a seed.');
    }
    tray.slotWorld(free[0], this.seedHome);
    this.seed.position.copy(this.seedHome);
    this.seed.visible = true;
    this.hovered = -1;
    this.drawRadial();
    this.radial.mesh.visible = true;
    ui.mode.value = 'radial';
    chimeTap(0);
    garden.bump();
  }

  private onPinAgain(habitId: string): void {
    unlockAudio();
    if (ui.mode.peek() !== 'idle') return;
    ui.weekOpen.value = false;
    const h = garden.real.habits.find((x) => x.id === habitId);
    const preset = h && presetById(h.presetId);
    if (!h || !preset) return;
    const tray = this.world.getSystem(TraySystem)!;
    tray.slotWorld(5, this.seedHome);
    this.seed.position.copy(this.seedHome);
    this.seed.visible = true;
    this.repinId = habitId;
    this.beginAim(preset);
  }

  private cancel(msg: string): void {
    this.pendingSelect = null;
    ui.mode.value = 'idle';
    this.radial.mesh.visible = false;
    this.reticle.visible = false;
    this.arc.visible = false;
    this.seed.visible = false;
    this.preset = null;
    this.repinId = null;
    this.world.getSystem(AimSystem)!.enabled = false;
    garden.say(msg);
    garden.bump();
  }

  private onRadialTap(p: Vector3 | null): void {
    if (ui.mode.peek() !== 'radial' || !p) return;
    const idx = this.radialIndex(p);
    if (idx === -2) return this.cancel('Seed back in the tray.');
    if (idx < 0) return;
    chimeTap(idx % 5);
    this.beginAim(PRESETS[idx]);
  }

  /** -2 = centre (cancel), -1 = nothing, else preset index. */
  private radialIndex(p: Vector3): number {
    const l = this.radial.mesh.worldToLocal(this.tmp.copy(p));
    const r = Math.hypot(l.x, l.y) / (RADIAL_M / 2);
    if (r < 0.33) return -2;
    if (r > 1.02) return -1;
    let a = Math.atan2(l.x, l.y); // 0 at top, clockwise
    if (a < 0) a += Math.PI * 2;
    return Math.round(a / ((Math.PI * 2) / 12)) % 12;
  }

  private beginAim(preset: Preset): void {
    this.preset = preset;
    this.radial.mesh.visible = false;
    const aim = this.world.getSystem(AimSystem)!;
    aim.enabled = true;
    this.aimSrc = aim.preferred('right');
    this.aimStart = performance.now();
    this.lastPreview = '';
    ui.mode.value = 'aiming';
    garden.say(
      this.repinId
        ? `Point at the spot for ${preset.label} and pinch to pin it again.`
        : `Point at where you ${preset.label.toLowerCase()} (${preset.hint}?) and pinch.`,
    );
  }

  private place(): void {
    const hit = this.hit;
    if (!hit || !this.preset) {
      garden.say('No real surface there. Point the ray at a wall, desk or floor, then pinch.', 'info');
      return;
    }
    this.flight = { from: this.seed.position.clone(), to: hit.point.clone(), normal: hit.normal.clone(), t: 0, hit };
    this.reticle.visible = false;
    this.arc.visible = false;
    ui.mode.value = 'flying';
    this.world.getSystem(AimSystem)!.enabled = false;
  }

  private async root(hit: AimHit): Promise<void> {
    const preset = this.preset!;
    const anchors = this.world.getSystem(AnchorSystem)!;
    this.player.head.getWorldPosition(this.head);
    const q = surfaceQuaternion(hit.normal, hit.point, this.head, new Quaternion());
    const tempId = this.repinId ?? `pending-${performance.now()}`;
    let uuid: string | null;
    try {
      uuid = await anchors.create(tempId, hit.point, q);
    } catch (e) {
      this.seed.visible = false;
      ui.mode.value = 'idle';
      garden.say(`Could not pin here: ${(e as Error).message}`, 'error');
      garden.bump();
      return;
    }
    const placement = { anchorUuid: uuid, surfaceLabel: hit.info.label, surface: hit.info.surface };
    let habitId: string;
    try {
      if (this.repinId) {
        const old = garden.real.habits.find((h) => h.id === this.repinId)?.placement?.anchorUuid ?? null;
        if (old && old !== uuid) void anchors.remove(`old-${this.repinId}`, old);
        setPlacement(garden.real, this.repinId, placement);
        anchors.markPlaced(this.repinId);
        habitId = this.repinId;
      } else {
        habitId = createHabit(garden.real, preset.id, garden.clock, placement).id;
        anchors.rename(tempId, habitId);
      }
    } catch (e) {
      await anchors.remove(tempId, uuid);
      this.seed.visible = false;
      ui.mode.value = 'idle';
      garden.say(e instanceof HabitError ? e.message : `Not planted: ${(e as Error).message}`, 'error');
      garden.bump();
      return;
    }
    this.lastPlaced = { habitId, point: hit.point.toArray() as [number, number, number], label: hit.info.label, via: hit.via };
    chimeRoot();
    garden.say(
      `${preset.label} took root on: ${hit.info.label}.${uuid ? '' : ' This browser gave no persistent anchor, so it will ask to be pinned again next session.'}`,
    );
    this.seed.visible = false;
    this.preset = null;
    this.repinId = null;
    ui.mode.value = 'idle';
    await garden.commit();
  }

  update(dt: number): void {
    const selection = this.pendingSelect;
    this.pendingSelect = null;
    if (selection && ui.mode.peek() === 'aiming' && selection.startedAt >= this.aimStart + 30) {
      const aim = this.world.getSystem(AimSystem)!;
      this.aimSrc = aim.preferred(selection.source === 'left' ? 'left' : 'right');
      this.hit = aim.hit(this.aimSrc);
      this.place();
    }
    const mode = ui.mode.peek();
    if (mode === 'idle') return;
    this.player.head.getWorldPosition(this.head);
    const t = performance.now() / 1000;
    if (mode === 'radial') {
      const style = `${garden.settings.highContrast}:${garden.settings.largeTargets}`;
      this.radial.mesh.scale.setScalar(garden.settings.largeTargets ? 1.2 : 1);
      if (style !== this.radialStyle) {
        this.radialStyle = style;
        this.drawRadial();
      }
      // seed lifts and bobs above the tray, radial faces the viewer
      const tray = this.world.getSystem(TraySystem)!;
      this.tmp.set(0, 0.2, -0.02);
      tray.root.localToWorld(this.tmp);
      this.seed.position.lerp(this.tmp, Math.min(1, dt * 8));
      this.seed.rotation.y += dt * 2;
      const p = pointFor('radial');
      const idx = p ? this.radialIndex(p) : -1;
      if (idx !== this.hovered) {
        this.hovered = idx;
        this.drawRadial();
      }
      return;
    }
    if (mode === 'aiming') {
      const aim = this.world.getSystem(AimSystem)!;
      this.hit = aim.hit(this.aimSrc) ?? (this.aimSrc !== 'gaze' ? aim.hit(this.aimSrc === 'right' ? 'left' : 'right') : null);
      this.seed.position.y += Math.sin(t * 3) * 0.0004;
      if (this.hit) {
        this.reticle.visible = true;
        this.reticle.position.copy(this.hit.point);
        surfaceQuaternion(this.hit.normal, this.hit.point, this.head, this.reticle.quaternion);
        const text = `${this.preset!.label}  ·  on: ${this.hit.info.label}`;
        if (text !== this.lastPreview) {
          this.lastPreview = text;
          this.drawPreview(text);
        }
        // keep the label upright and facing you on walls too
        const inv = this.preview.mesh.quaternion.copy(this.reticle.quaternion).invert();
        this.preview.mesh.position.set(0, 0.065, 0).addScaledVector(this.hit.normal, 0.03).applyQuaternion(inv);
        inv.multiply(this.yawToward(this.hit.point));
        this.writeArc(this.seed.position, this.hit.point);
        this.arc.visible = true;
      } else {
        this.reticle.visible = false;
        this.arc.visible = false;
      }
      return;
    }
    if (mode === 'flying' && this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / FLIGHT_S);
      const k = f.t < 0.5 ? 2 * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 2) / 2;
      bezier(f.from, f.to, k, this.seed.position);
      this.seed.rotation.x += dt * 9;
      if (f.t >= 1) {
        const hit = f.hit;
        this.flight = null;
        void this.root(hit);
      }
    }
  }

  private yawToward(p: Vector3): Quaternion {
    const yaw = Math.atan2(this.head.x - p.x, this.head.z - p.z);
    return this.q.setFromAxisAngle(this.tmp.set(0, 1, 0), yaw);
  }

  private writeArc(a: Vector3, b: Vector3): void {
    const pos = this.arc.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < 24; i++) {
      bezier(a, b, i / 23, this.tmp);
      pos.setXYZ(i, this.tmp.x, this.tmp.y, this.tmp.z);
    }
    pos.needsUpdate = true;
    this.arc.computeLineDistances();
  }

  private drawPreview(text: string): void {
    const hc = garden.settings.highContrast;
    this.preview.draw((g, w, h) => {
      g.fillStyle = hc ? '#000' : 'rgba(29,26,20,0.9)';
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 40);
      g.fill();
      g.fillStyle = hc ? '#ffe14d' : SEED_PAPER;
      g.font = `600 52px ${FONT_UI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
  }

  private drawRadial(): void {
    const hc = garden.settings.highContrast;
    const hov = this.hovered;
    this.radial.draw((g, w) => {
      const c = w / 2;
      g.fillStyle = hc ? 'rgba(0,0,0,0.92)' : 'rgba(29,26,20,0.78)';
      g.beginPath();
      g.arc(c, c, c - 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = hc ? '#fff' : 'rgba(243,236,217,0.35)';
      g.lineWidth = 4;
      g.stroke();
      PRESETS.forEach((p, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x = c + Math.sin(a) * c * 0.73;
        const y = c - Math.cos(a) * c * 0.73;
        const on = i === hov;
        g.fillStyle = on ? (hc ? '#ffe14d' : MOSS) : hc ? '#111' : SEED_PAPER;
        g.beginPath();
        g.arc(x, y, on ? 92 : 80, 0, Math.PI * 2);
        g.fill();
        if (hc) {
          g.strokeStyle = '#fff';
          g.lineWidth = 5;
          g.stroke();
        }
        drawIcon(g, p.glyph, x, y, on ? 104 : 92, on ? (hc ? '#000' : SEED_PAPER) : hc ? '#fff' : LOAM, 0.12);
        if (p.kind === 'counted') {
          g.fillStyle = TERRACOTTA;
          g.font = `700 30px ${FONT_MONO}`;
          g.textAlign = 'center';
          g.fillText(`×${p.target}`, x, y + 66);
        }
      });
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (hov >= 0) {
        const p = PRESETS[hov];
        g.fillStyle = hc ? '#ffe14d' : SEED_PAPER;
        g.font = `700 64px ${FONT_UI}`;
        g.fillText(p.label, c, c - 22);
        g.font = `500 34px ${FONT_MONO}`;
        g.fillStyle = hc ? '#fff' : 'rgba(243,236,217,0.75)';
        g.fillText(p.kind === 'counted' ? `${p.target} a day · ${p.hint}` : `daily · ${p.hint}`, c, c + 36);
      } else {
        g.fillStyle = hc ? '#fff' : 'rgba(243,236,217,0.8)';
        g.font = `600 44px ${FONT_UI}`;
        g.fillText('Pick a habit', c, c - 18);
        g.font = `500 32px ${FONT_MONO}`;
        g.fillText('centre: cancel', c, c + 30);
      }
    });
  }
}

/** Quadratic arc that rises 30 cm above the higher end. */
function bezier(a: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const my = Math.max(a.y, b.y) + 0.3;
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * mx + t * t * b.x, u * u * a.y + 2 * u * t * my + t * t * b.y, u * u * a.z + 2 * u * t * mz + t * t * b.z);
}
