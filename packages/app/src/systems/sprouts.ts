import {
  type Habit,
  type Ledger,
  MAX_HABITS,
  activeHabits,
  archiveHabit,
  checkIn,
  displayScale,
  distanceScale,
  growthOf,
  plantForm,
  stageName,
  setPlacement,
  undoOne,
} from '@mebae/core';
import {
  type Entity,
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Matrix4,
  PlaneGeometry,
  SRGBColorSpace,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { chimeGrow, chimeSparkle, chimeTap, chimeUndo, unlockAudio, voiceLine } from '../fx/chimes.js';
import { RewardSystem } from '../fx/reward.js';
import { PressRouter, makePressable, unregisterPressable } from '../interaction/press-router.js';
import { PlantMesh, mossMat } from '../plants/plant-mesh.js';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { CanvasCard, cardFor, roundRect } from '../ui/canvas-card.js';
import { drawIcon } from '../ui/icons.js';
import { FONT_MONO, FONT_UI, LOAM, MOSS, SEED_PAPER, TERRACOTTA } from '../ui/palette.js';
import { type AimSource, type SelectEvent, AimSystem } from './aim.js';
import { AnchorSystem } from './anchors.js';
import { SAMPLE_PLANT_SCALE, SAMPLE_SPOTS } from './garden-layout.js';
import { surfaceQuaternion } from './surface-pose.js';
import { TrayEvents, TraySystem } from './tray.js';

interface Sprout {
  habitId: string;
  sample: boolean;
  entity: Entity;
  group: Group;
  plant: PlantMesh;
  label: CanvasCard;
  stake: Entity | null;
  stage: number;
  key: string;
  bounce: number;
  wallish: boolean;
  /** Display scale of the plant (legibility, see displayScale in core). */
  baseScale: number;
  /** Drawn size: height (upright) or radius (moss), metres, after the seat boost. */
  size: number;
  /** Stage size before the seat boost. */
  sizeBase: number;
  /** Plant scale actually applied (baseScale × seat boost). */
  scaleNow: number;
  /** 'full' card near, 'pill' beyond ~1.5 m. */
  layout: 'full' | 'pill';
  labelScale: number;
}

const stakeMat = new MeshStandardMaterial({ color: new Color('#b98a5c'), roughness: 0.8 });
const stakeGeo = new CylinderGeometry(0.004, 0.003, 0.07, 6);
const stakePickGeo = new BoxGeometry(0.03, 0.09, 0.05);
const stakePickMat = new MeshBasicMaterial({ visible: false });

/** Soft glowing ring texture for the halo that marks each plant's spot. */
function haloTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 18, 64, 64, 63);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.88, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
const HALO_TODO = new Color('#ffab4a');
const HALO_DONE = new Color('#a6e05c');
const HALO_REST = new Color('#9a8d5f');
/** Labels switch to the compact pill beyond this distance (with hysteresis). */
const PILL_AT = 1.6;
/** Plants far from the tray (the seat) are drawn bigger so they read from there; capped. */
const SEAT_REF_M = 1.2;
const SEAT_BOOST_MAX = 2.2;
const MAX_UPRIGHT_M = 0.75;
const MAX_MOSS_R_M = 0.45;
const _trayPos = new Vector3();
const FULL_AT = 1.35;

/**
 * The living sprouts: one per habit, drawn only where its anchor really is.
 * Pinch = check in (counted: +1). Pinch-hold 1 s = undo one. Pinch the stake
 * to carry a sprout: pinch a new surface to move it, or the tray to remove it.
 */
export class SproutSystem extends createSystem({}) {
  private sprouts = new Map<string, Sprout>();
  private stakes!: InstancedMesh;
  private halos!: InstancedMesh;
  private haloM = new Matrix4();
  private haloS = new Vector3();
  private haloC = new Color();
  private lastVersion = -1;
  private lastDay = '';
  private dayCheck = 0;
  private head = new Vector3();
  private v = new Vector3();
  private q = new Quaternion();
  private carryId: string | null = null;
  private carryStart = 0;
  private pendingSelect: SelectEvent | null = null;
  private carrySrc: AimSource = 'right';
  private labelWorld = new Vector3();
  private nrm = new Vector3();
  private yawQ = new Quaternion();
  private up = new Vector3(0, 1, 0);

  init(): void {
    this.stakes = new InstancedMesh(stakeGeo, stakeMat, MAX_HABITS);
    this.stakes.name = 'Move stakes';
    this.stakes.count = 0;
    this.world.createTransformEntity(this.stakes, { persistent: true });
    // One instanced draw for every plant's halo: a glowing ring on its real
    // surface, amber while today is open, green once it is done.
    this.halos = new InstancedMesh(
      new PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending, side: 2 }),
      MAX_HABITS,
    );
    this.halos.name = 'Plant halos';
    this.halos.count = 0;
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 3;
    this.world.createTransformEntity(this.halos, { persistent: true });
    const aim = () => this.world.getSystem(AimSystem);
    const wire = () => {
      const a = aim();
      if (!a) return void setTimeout(wire, 50);
      this.cleanupFuncs.push(a.onSelect((e) => this.onSelect(e)));
    };
    wire();
    this.cleanupFuncs.push(this.world.getSystem(TrayEvents)!.on('drop-in-tray', () => {
      if (ui.mode.peek() === 'carrying' && this.carryId) void this.finishCarry(this.carrySrc, true);
    }));
    this.xrManager.addEventListener('sessionend', () => {
      for (const id of [...this.sprouts.keys()]) this.drop(id);
      this.stakes.count = 0;
      this.halos.count = 0;
      this.carryId = null;
      this.pendingSelect = null;
    });
  }

  get count(): number {
    return this.sprouts.size;
  }

  /** For tests and the perf HUD. */
  snapshot(): { id: string; stage: number; position: number[]; sample: boolean; triangles: number; drawnSize: number; layout: string; labelScale: number; labelWidthM: number }[] {
    return [...this.sprouts.values()].map((s) => ({
      id: s.habitId,
      stage: s.stage,
      position: s.group.getWorldPosition(new Vector3()).toArray(),
      sample: s.sample,
      triangles: s.plant.triangles,
      drawnSize: s.size,
      layout: s.layout,
      labelScale: s.labelScale,
      labelWidthM: s.label.mW * s.labelScale,
    }));
  }

  update(dt: number): void {
    // PressRouter runs first, so menu presses consume their pinch before a
    // surface behind the menu can become a move or a tray removal.
    const selection = this.pendingSelect;
    this.pendingSelect = null;
    if (selection && ui.mode.peek() === 'carrying' && this.carryId) {
      const presses = this.world.getSystem(PressRouter)!;
      if (!presses.wasPressedSince('tray-menu', selection.startedAt) && !presses.wasPressedSince('wrist-menu', selection.startedAt)) {
        void this.finishCarry(selection.source, presses.wasPressedSince('tray-base', selection.startedAt));
      }
    }
    const tray = this.world.getSystem(TraySystem);
    if (!tray?.placed) return;
    const now = performance.now();
    if (now > this.dayCheck) {
      this.dayCheck = now + 1000;
      const d = garden.today();
      if (d !== this.lastDay) {
        this.lastDay = d;
        garden.bump(); // local midnight passed: re-derive growth
      }
    }
    const ver = garden.version.peek();
    if (ver !== this.lastVersion) {
      this.lastVersion = ver;
      this.sync();
    }
    this.player.head.getWorldPosition(this.head);
    const anchors = this.world.getSystem(AnchorSystem)!;
    mossMat.uniforms.uTime.value = now / 1000;
    let stakeCount = 0;
    let haloCount = 0;
    const pulse = 0.62 + 0.38 * Math.sin(now / 1000 * 2.6);
    for (const s of this.sprouts.values()) {
      if (!s.sample) {
        if (s.habitId === this.carryId) this.followCarry(s);
        else {
          const pose = anchors.pose(s.habitId);
          if (pose) {
            s.group.position.copy(pose.position);
            s.group.quaternion.copy(pose.quaternion);
          }
        }
      }
      s.plant.tick(dt);
      s.group.updateMatrixWorld();
      const base = s.group.getWorldPosition(this.v);
      if (!s.sample) {
        // Seat boost: the farther from the tray (where you sit), the bigger it is drawn.
        tray.root.getWorldPosition(_trayPos);
        const boost = Math.min(SEAT_BOOST_MAX, Math.max(1, Math.pow(base.distanceTo(_trayPos) / SEAT_REF_M, 0.8)));
        const cap = (s.wallish ? MAX_MOSS_R_M : MAX_UPRIGHT_M) / Math.max(1e-3, s.sizeBase);
        const k = Math.max(1, Math.min(boost, cap));
        const scale = s.baseScale * k;
        if (Math.abs(scale - s.scaleNow) > s.scaleNow * 0.01) {
          s.scaleNow = scale;
          s.size = s.sizeBase * k;
          if (s.bounce <= 0) s.plant.group.scale.setScalar(scale);
        }
      }
      if (s.bounce > 0) {
        s.bounce = Math.max(0, s.bounce - dt * 1.8);
        // squash-and-stretch pop on a check-in
        const k = Math.sin(s.bounce * Math.PI * 3) * 0.16 * s.bounce;
        s.plant.group.scale.set(s.scaleNow * (1 - k * 0.5), s.scaleNow * (1 + k), s.scaleNow * (1 - k * 0.5));
      }
      const dist = base.distanceTo(this.head);
      // Labels keep their angular size: about 18 mm cap height at 1 m from any seat.
      const big = garden.settings.largeTargets ? 1.4 : 1;
      if (s.layout === 'full' && dist > PILL_AT && !garden.settings.oneHand) this.setLayout(s, 'pill');
      else if (s.layout === 'pill' && (dist < FULL_AT || garden.settings.oneHand)) this.setLayout(s, 'full');
      s.labelScale = distanceScale(dist) * big;
      s.label.mesh.scale.setScalar(s.labelScale);
      const yaw = Math.atan2(this.head.x - base.x, this.head.z - base.z);
      const world = this.labelWorld.copy(base);
      const halfH = (s.label.mH * s.labelScale) / 2;
      if (s.wallish) {
        this.nrm.set(0, 1, 0).applyQuaternion(s.group.quaternion).setY(0).normalize();
        world.addScaledVector(this.nrm, 0.08);
        world.y += s.size + 0.03 + halfH;
      } else {
        world.y += s.size + 0.04 + halfH;
      }
      if (s.stake) {
        const st = s.stake.object3D!;
        const side = (s.label.mW * s.labelScale) / 2 + 0.025 * Math.min(2, s.labelScale);
        st.position.set(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(side).add(world);
        st.position.y -= halfH * 0.4;
        st.quaternion.identity();
        st.scale.setScalar(big * Math.min(2.2, Math.max(1, s.labelScale)));
        st.updateMatrixWorld();
        this.stakes.setMatrixAt(stakeCount++, st.matrixWorld);
      }
      s.label.mesh.position.copy(s.group.worldToLocal(world));
      this.yawQ.setFromAxisAngle(this.up, yaw);
      s.label.mesh.quaternion.copy(s.group.quaternion).invert().multiply(this.yawQ);
      if (!s.sample) {
        const g = s.plant.group.userData.vitality as string | undefined;
        const done = s.plant.group.userData.doneToday as boolean | undefined;
        const moss = s.plant.group.userData.species === 'moss';
        const r = Math.max(0.08, moss ? s.size * 1.15 : s.size * 0.35);
        this.haloS.setScalar(r * (done ? 1 : 0.94 + 0.06 * pulse));
        this.haloM.compose(this.v.set(0, 0.004, 0), this.q.identity(), this.haloS).premultiply(s.group.matrixWorld);
        this.halos.setMatrixAt(haloCount, this.haloM);
        // additive: several overlapping halos must not blow out to white
        if (done) this.haloC.copy(HALO_DONE).multiplyScalar(0.55);
        else if (g === 'resting') this.haloC.copy(HALO_REST).multiplyScalar(0.3);
        else this.haloC.copy(HALO_TODO).multiplyScalar(0.22 + 0.3 * pulse);
        this.halos.setColorAt(haloCount++, this.haloC);
      }
    }
    this.stakes.count = stakeCount;
    this.stakes.instanceMatrix.needsUpdate = true;
    if (stakeCount) this.stakes.computeBoundingSphere();
    this.halos.count = haloCount;
    this.halos.instanceMatrix.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
  }

  private setLayout(s: Sprout, layout: 'full' | 'pill'): void {
    if (s.layout === layout) return;
    const old = s.label;
    const next = cardFor(layout === 'full' ? 'sproutLabel' : 'sproutPill', old.mesh.name);
    s.group.remove(old.mesh);
    old.texture.dispose();
    (old.mesh.material as MeshBasicMaterial).dispose();
    s.group.add(next.mesh);
    s.label = next;
    s.layout = layout;
    s.key = '';
    this.redraw(s);
  }

  private ledgerAndHabits(): { ledger: Ledger; habits: Habit[] } {
    const ledger = garden.ledger;
    return { ledger, habits: activeHabits(ledger) };
  }

  /** Creates/updates/removes sprout entities to match state. */
  private sync(): void {
    const anchors = this.world.getSystem(AnchorSystem)!;
    const tray = this.world.getSystem(TraySystem)!;
    const { ledger, habits } = this.ledgerAndHabits();
    const want = new Set<string>();
    habits.forEach((h, i) => {
      if (!garden.isSample && !anchors.hasAnchor(h.id) && h.id !== this.carryId) return; // Pin again lives in the tray
      want.add(h.id);
      let s = this.sprouts.get(h.id);
      // Imported ids can match sample ids; never reuse the other garden's entity.
      if (s && s.sample !== garden.isSample) {
        this.drop(h.id);
        s = undefined;
      }
      if (!s) {
        s = this.create(h, garden.isSample);
        if (garden.isSample) {
          const spot = SAMPLE_SPOTS[i % SAMPLE_SPOTS.length];
          this.v.set(...spot);
          tray.root.localToWorld(this.v);
          s.group.position.copy(this.v);
          this.player.head.getWorldPosition(this.head);
          const n = h.placement?.surface === 'wall' ? this.head.clone().sub(this.v).setY(0).normalize() : new Vector3(0, 1, 0);
          surfaceQuaternion(n, this.v, this.head, s.group.quaternion);
        }
      }
      const g = growthOf(ledger, h, garden.today());
      const formKey = `${h.species}:${g.stage}:${g.inBloom}:${g.vitality === 'resting'}`;
      if (s.plant.group.userData.formKey !== formKey) {
        const grew = s.plant.group.userData.formKey !== undefined && g.stage > s.stage;
        const fresh = s.plant.group.userData.formKey === undefined && !s.sample;
        const form = plantForm(h.species, g.stage, h.id, g.inBloom);
        s.plant.set(form, g.vitality, grew || fresh);
        s.plant.group.userData.formKey = formKey;
        s.plant.group.userData.species = form.species;
        s.baseScale = s.sample ? SAMPLE_PLANT_SCALE : displayScale(form);
        s.plant.group.scale.setScalar(s.baseScale);
        s.sizeBase = (form.species === 'moss' ? form.mossRadius : form.height) * s.baseScale;
        s.size = s.sizeBase;
        s.scaleNow = s.baseScale;
        s.plant.group.userData.height = form.height * s.baseScale;
        if (grew) {
          chimeGrow();
          voiceLine('grew');
          this.reward(s, 'grow', stageName(g.stage), g.stage);
        }
      }
      s.plant.group.userData.vitality = g.vitality;
      s.plant.group.userData.doneToday = g.todayCount >= h.target;
      s.stage = g.stage;
      s.wallish = h.placement?.surface === 'wall';
      this.redraw(s);
    });
    for (const id of [...this.sprouts.keys()]) if (!want.has(id)) this.drop(id);
  }

  private create(h: Habit, sample: boolean): Sprout {
    const group = new Group();
    group.name = `Sprout: ${h.label}`;
    const plant = new PlantMesh(`${h.label} plant`);
    if (sample) plant.group.scale.setScalar(SAMPLE_PLANT_SCALE);
    group.add(plant.group);
    const label = cardFor('sproutLabel', `Label: ${h.label}`);
    group.add(label.mesh);
    const entity = this.world.createTransformEntity(group, { persistent: true });
    const key = `sprout:${h.id}`;
    const s: Sprout = { habitId: h.id, sample, entity, group, plant, label, stake: null, stage: -1, key: '', bounce: 0, wallish: false, baseScale: 1, size: 0.1, sizeBase: 0.1, scaleNow: 1, layout: 'full', labelScale: 1 };
    if (!sample) {
      // Mature foliage can overlap the wooden handle, especially on walls.
      // Keep labels, move targets and menus ahead of decorative plant hits.
      plant.group.pointerEventsOrder = -1;
      makePressable(entity, key, {
        tap: (p) => this.onTap(s, p),
        hold: () => {
          if (!garden.settings.oneHand) this.undo(s);
        },
      });
      // Visible wood stays in one instanced draw. Each handle has its own
      // wider invisible pick target, outside the label and above the foliage.
      // Resolve the habit directly instead of guessing from a thin instance hit.
      const handle = new Mesh(stakePickGeo, stakePickMat);
      handle.name = `Move: ${h.label}`;
      s.stake = this.world.createTransformEntity(handle, { persistent: true });
      makePressable(s.stake, `move:${h.id}`, { tap: () => this.startCarry(h.id) });
    } else {
      makePressable(entity, key, { tap: () => garden.say('This is the example garden (sample data). Turn it off in the tray menu to tend your own.') });
    }
    this.sprouts.set(h.id, s);
    return s;
  }

  private drop(id: string): void {
    const s = this.sprouts.get(id);
    if (!s) return;
    s.plant.dispose();
    s.label.texture.dispose();
    unregisterPressable(`sprout:${id}`);
    unregisterPressable(`move:${id}`);
    s.stake?.destroy();
    s.entity.destroy();
    this.sprouts.delete(id);
  }

  private onTap(s: Sprout, p: Vector3 | null): void {
    unlockAudio();
    if (garden.isSample || s.sample) return garden.say('Example garden (sample data). Turn it off to tend your own habits.');
    if (ui.mode.peek() !== 'idle') return;
    if (garden.settings.oneHand && p) {
      const l = s.label.mesh.worldToLocal(p.clone());
      if (Math.abs(l.x) <= s.label.mW * 0.4625 && l.y >= -s.label.mH * 0.48 && l.y <= -s.label.mH * 0.35) return this.undo(s);
    }
    let r;
    try {
      r = checkIn(garden.real, s.habitId, garden.clock);
    } catch (e) {
      return garden.say((e as Error).message, 'error');
    }
    if (r.saturated) {
      garden.say(r.habit.kind === 'counted' ? `${r.habit.label}: ${r.count}/${r.habit.target} already today.` : `${r.habit.label} is done for today.`);
      s.bounce = 0.6;
      return;
    }
    s.bounce = 1;
    if (!r.completedNow) chimeTap(r.count);
    else chimeSparkle();
    const h = r.habit;
    this.reward(
      s,
      r.completedNow ? 'complete' : 'tap',
      h.kind === 'counted' ? (r.completedNow ? `${r.count}/${h.target} · done!` : `+1 · ${r.count}/${h.target}`) : 'Done today ✓',
    );
    s.key = '';
    void garden.commit();
  }

  /** Plays the check-in / growth payoff at a sprout (see fx/reward.ts). */
  private reward(s: Sprout, kind: 'tap' | 'complete' | 'grow', text: string, stage = -1): void {
    const fx = this.world.getSystem(RewardSystem);
    if (!fx || s.sample) return;
    s.group.updateMatrixWorld();
    const base = s.group.getWorldPosition(new Vector3());
    const normal = new Vector3(0, 1, 0).applyQuaternion(s.group.getWorldQuaternion(new Quaternion())).normalize();
    const top = base.clone().addScaledVector(normal, s.wallish ? 0.03 : s.size * 0.85);
    const labelTop = s.label.mesh.getWorldPosition(new Vector3());
    labelTop.y += (s.label.mH * s.labelScale) / 2;
    fx.burst(kind, { base, normal, top, labelTop, size: s.size }, kind === 'grow' ? `Stage ${stage + 1} · ${text}` : text, stage);
  }

  private undo(s: Sprout): void {
    if (garden.isSample || s.sample) return garden.say('Example garden (sample data). Turn it off to tend your own habits.');
    let r;
    try {
      r = undoOne(garden.real, s.habitId, garden.clock);
    } catch (e) {
      return garden.say((e as Error).message, 'error');
    }
    if (r.saturated) return garden.say(`Nothing to undo for ${r.habit.label} today.`);
    chimeUndo();
    garden.say(`Undone: ${r.habit.label} ${r.habit.kind === 'counted' ? `${r.count}/${r.habit.target}` : 'not done yet today'}.`);
    s.key = '';
    void garden.commit();
  }

  // ------------------------------------------------------------ carrying

  private startCarry(id: string): void {
    unlockAudio();
    if (ui.mode.peek() !== 'idle' || garden.isSample) return;
    ui.weekOpen.value = false;
    const aim = this.world.getSystem(AimSystem)!;
    this.carryId = id;
    this.carryStart = performance.now();
    this.carrySrc = aim.preferred('right');
    aim.enabled = true;
    ui.mode.value = 'carrying';
    chimeTap(2);
    garden.say('Carrying. Pinch a new spot to move it, or pinch the tray to remove it (its history stays).');
  }

  private followCarry(s: Sprout): void {
    const hit = this.world.getSystem(AimSystem)!.hit(this.carrySrc);
    if (!hit) return;
    s.group.position.lerp(hit.point, 0.35);
    surfaceQuaternion(hit.normal, hit.point, this.head, this.q);
    s.group.quaternion.slerp(this.q, 0.35);
  }

  private onSelect(selection: SelectEvent): void {
    if (ui.mode.peek() !== 'carrying' || !this.carryId || selection.startedAt < this.carryStart + 30) return;
    this.pendingSelect = selection;
  }

  private async finishCarry(src: AimSource, remove = false): Promise<void> {
    if (ui.mode.peek() !== 'carrying' || !this.carryId) return;
    this.pendingSelect = null;
    // Lock the flow before awaiting anchor work so one pinch cannot commit twice.
    ui.mode.value = 'flying';
    try {
      await this.commitCarry(src, remove);
    } catch (e) {
      garden.say(`Could not move it: ${(e as Error).message}`, 'error');
    } finally {
      ui.mode.value = 'idle';
      garden.bump();
    }
  }

  private async commitCarry(src: AimSource, remove: boolean): Promise<void> {
    const id = this.carryId!;
    const aim = this.world.getSystem(AimSystem)!;
    const anchors = this.world.getSystem(AnchorSystem)!;
    const hit = aim.hit(aim.preferred(src === 'left' ? 'left' : 'right'));
    const h = garden.real.habits.find((x) => x.id === id);
    this.carryId = null;
    aim.enabled = false;
    if (!h) return;
    const oldUuid = h.placement?.anchorUuid ?? null;
    if (remove) {
      await anchors.remove(id, oldUuid);
      archiveHabit(garden.real, id, garden.clock);
      chimeUndo();
      garden.say(`${h.label} is back in the tray as a seed. Its history is kept (export includes it).`);
      await garden.commit();
      return;
    }
    if (!hit) {
      garden.say('No real surface there, so it stays where it was.');
      garden.bump();
      return;
    }
    this.player.head.getWorldPosition(this.head);
    const q = surfaceQuaternion(hit.normal, hit.point, this.head, new Quaternion());
    const temp = `move-${id}`;
    try {
      const uuid = await anchors.create(temp, hit.point, q);
      await anchors.remove(id, oldUuid);
      anchors.rename(temp, id);
      setPlacement(garden.real, id, { anchorUuid: uuid, surfaceLabel: hit.info.label, surface: hit.info.surface });
      chimeTap(4);
      garden.say(`${h.label} moved to: ${hit.info.label}.`);
      await garden.commit();
    } catch (e) {
      garden.say(`Could not move it: ${(e as Error).message}`, 'error');
      garden.bump();
    }
  }

  // ------------------------------------------------------------ label

  private redraw(s: Sprout): void {
    const { ledger } = this.ledgerAndHabits();
    const h = ledger.habits.find((x) => x.id === s.habitId);
    if (!h) return;
    const g = growthOf(ledger, h, garden.today());
    const st = garden.settings;
    const chip = st.oneHand && !s.sample;
    const key = JSON.stringify([g, st, chip, s.sample, h.placement?.surfaceLabel, garden.isSample, s.layout]);
    if (key === s.key) return;
    s.key = key;
    const hc = st.highContrast;
    const ink = hc ? '#fff' : LOAM;
    const accent = hc ? '#ffe14d' : MOSS;
    const done = g.todayCount >= h.target;
    const today = h.kind === 'counted' ? `${g.todayCount}/${h.target}` : done ? 'Done today' : 'Pinch when done';
    const status =
      g.inBloom
        ? 'In bloom'
        : g.vitality === 'resting'
          ? 'Resting · growth paused'
          : g.streak > 1
            ? `${g.streak}-day streak`
            : g.vitality === 'fresh'
              ? 'Just planted'
              : g.toNextStage > 0
                ? `${g.toNextStage} day${g.toNextStage > 1 ? 's' : ''} to grow`
                : 'Fully grown';
    // All text here is ≥ 56 px: 18 mm cap height at 1 m (CARDS in @mebae/core).
    s.label.draw((c, w, hh) => {
      c.fillStyle = hc ? '#000' : 'rgba(243,236,217,0.96)';
      roundRect(c, 4, 4, w - 8, hh - 8, 40);
      c.fill();
      c.lineWidth = hc ? 8 : 6;
      c.strokeStyle = hc ? '#fff' : done ? MOSS : TERRACOTTA;
      c.stroke();
      c.textBaseline = 'middle';
      c.textAlign = 'start';
      if (s.layout === 'pill') {
        c.fillStyle = done ? accent : hc ? '#ffe14d' : TERRACOTTA;
        c.beginPath();
        c.arc(84, hh / 2, 62, 0, Math.PI * 2);
        c.fill();
        drawIcon(c, h.glyph, 84, hh / 2, 76, hc ? '#000' : SEED_PAPER, 0.14);
        c.fillStyle = ink;
        c.font = `700 72px ${FONT_UI}`;
        c.fillText(h.label, 168, 66, w - 190);
        c.font = `700 60px ${h.kind === 'counted' ? FONT_MONO : FONT_UI}`;
        c.fillStyle = done ? accent : ink;
        c.fillText(`${today} · St ${g.stage + 1}/8`, 168, 152, w - 190);
        return;
      }
      c.fillStyle = done ? accent : hc ? '#ffe14d' : TERRACOTTA;
      c.beginPath();
      c.arc(74, 72, 52, 0, Math.PI * 2);
      c.fill();
      drawIcon(c, h.glyph, 74, 72, 64, hc ? '#000' : SEED_PAPER, 0.14);
      c.fillStyle = ink;
      c.font = `700 64px ${FONT_UI}`;
      c.fillText(h.label, 144, 74, w - 170);
      // today
      if (h.kind === 'counted') {
        c.font = `700 96px ${FONT_MONO}`;
        c.fillStyle = done ? accent : ink;
        c.fillText(today, 34, 172);
        const after = 34 + c.measureText(today).width + 24;
        c.font = `600 56px ${FONT_UI}`;
        c.fillStyle = ink;
        c.fillText(done ? 'full today' : 'today', after, 176, w - after - 24);
      } else {
        c.font = `700 64px ${FONT_UI}`;
        c.fillStyle = done ? accent : ink;
        c.fillText(today, 34, 172, w - 60);
      }
      // stage: 8 pips + "2/8"
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        c.arc(48 + i * 40, 262, 15, 0, Math.PI * 2);
        c.fillStyle = i <= g.stage ? accent : hc ? '#444' : 'rgba(29,26,20,0.16)';
        c.fill();
      }
      c.fillStyle = ink;
      c.font = `700 56px ${FONT_UI}`;
      c.fillText(`${stageName(g.stage)}`, 370, 264, w - 390);
      c.font = `600 56px ${FONT_UI}`;
      c.fillStyle = !g.inBloom && g.vitality === 'resting' ? (hc ? '#ffe14d' : TERRACOTTA) : ink;
      c.fillText(status, 34, 348, w - 60);
      if (chip) {
        c.fillStyle = hc ? '#ffe14d' : TERRACOTTA;
        roundRect(c, 24, 392, w - 48, 58, 26);
        c.fill();
        c.fillStyle = hc ? '#000' : SEED_PAPER;
        c.font = `700 56px ${FONT_UI}`;
        c.textAlign = 'center';
        c.fillText('Pinch here: undo one', w / 2, 422, w - 80);
        c.textAlign = 'start';
      } else if (s.sample) {
        c.fillStyle = TERRACOTTA;
        c.font = `700 56px ${FONT_UI}`;
        c.fillText('SAMPLE DATA', 34, 420, w - 60);
      } else {
        c.fillStyle = hc ? '#fff' : 'rgba(29,26,20,0.7)';
        c.font = `600 56px ${FONT_MONO}`;
        c.fillText(`on: ${h.placement?.surfaceLabel ?? '?'}`, 34, 420, w - 60);
      }
    });
  }
}
