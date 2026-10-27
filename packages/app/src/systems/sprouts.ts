import {
  type Habit,
  type Ledger,
  MAX_HABITS,
  activeHabits,
  archiveHabit,
  checkIn,
  growthOf,
  plantForm,
  setPlacement,
  undoOne,
} from '@mebae/core';
import {
  type Entity,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { chimeGrow, chimeTap, chimeUndo, unlockAudio } from '../fx/chimes.js';
import { bindInstanceSpherecast } from '../interaction/instance-spherecast.js';
import { makePressable, unregisterPressable } from '../interaction/press-router.js';
import { PlantMesh, mossMat } from '../plants/plant-mesh.js';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { CanvasCard, roundRect } from '../ui/canvas-card.js';
import { drawIcon } from '../ui/icons.js';
import { FONT_MONO, FONT_UI, LOAM, MOSS, SEED_PAPER, TERRACOTTA } from '../ui/palette.js';
import { type AimSource, AimSystem } from './aim.js';
import { AnchorSystem } from './anchors.js';
import { horizontalLabelRise, SAMPLE_PLANT_SCALE, SAMPLE_SPOTS } from './garden-layout.js';
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
}

const stakeMat = new MeshStandardMaterial({ color: new Color('#b98a5c'), roughness: 0.8 });
const stakeGeo = new CylinderGeometry(0.004, 0.003, 0.07, 6);

/**
 * The living sprouts: one per habit, drawn only where its anchor really is.
 * Pinch = check in (counted: +1). Pinch-hold 1 s = undo one. Pinch the stake
 * to carry a sprout: pinch a new surface to move it, or the tray to remove it.
 */
export class SproutSystem extends createSystem({}) {
  private sprouts = new Map<string, Sprout>();
  private stakes!: InstancedMesh;
  private lastVersion = -1;
  private lastDay = '';
  private dayCheck = 0;
  private head = new Vector3();
  private v = new Vector3();
  private q = new Quaternion();
  private carryId: string | null = null;
  private carryStart = 0;
  private carrySrc: AimSource = 'right';
  private labelWorld = new Vector3();
  private nrm = new Vector3();
  private yawQ = new Quaternion();
  private up = new Vector3(0, 1, 0);

  init(): void {
    this.stakes = new InstancedMesh(stakeGeo, stakeMat, MAX_HABITS);
    this.stakes.name = 'Move stakes';
    this.stakes.count = 0;
    bindInstanceSpherecast(this.stakes);
    const stakesEntity = this.world.createTransformEntity(this.stakes, { persistent: true });
    makePressable(stakesEntity, 'move-stakes', {
      tap: (point) => {
        if (!point) return;
        let closest: Sprout | null = null;
        let distance = Infinity;
        for (const s of this.sprouts.values()) {
          if (!s.stake) continue;
          const d = s.stake.object3D!.position.distanceToSquared(point);
          if (d < distance) { closest = s; distance = d; }
        }
        if (closest) this.startCarry(closest.habitId);
      },
    });
    const aim = () => this.world.getSystem(AimSystem);
    const wire = () => {
      const a = aim();
      if (!a) return void setTimeout(wire, 50);
      this.cleanupFuncs.push(a.onSelect((e) => this.onSelect(e.source, e.startedAt)));
    };
    wire();
    this.cleanupFuncs.push(this.world.getSystem(TrayEvents)!.on('drop-in-tray', () => {
      if (ui.mode.peek() === 'carrying' && this.carryId) void this.finishCarry(this.carrySrc, true);
    }));
    this.xrManager.addEventListener('sessionend', () => {
      for (const id of [...this.sprouts.keys()]) this.drop(id);
      this.stakes.count = 0;
      this.carryId = null;
    });
  }

  get count(): number {
    return this.sprouts.size;
  }

  /** For tests and the perf HUD. */
  snapshot(): { id: string; stage: number; position: number[]; sample: boolean; triangles: number }[] {
    return [...this.sprouts.values()].map((s) => ({
      id: s.habitId,
      stage: s.stage,
      position: s.group.getWorldPosition(new Vector3()).toArray(),
      sample: s.sample,
      triangles: s.plant.triangles,
    }));
  }

  update(dt: number): void {
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
      if (s.bounce > 0) {
        s.bounce = Math.max(0, s.bounce - dt * 2.5);
        s.plant.group.scale.setScalar(1 + Math.sin(s.bounce * Math.PI * 3) * 0.08 * s.bounce);
      }
      // label stays upright and turns to face you
      const big = garden.settings.largeTargets ? 1.4 : 1;
      s.label.mesh.scale.setScalar(big);
      s.group.updateMatrixWorld();
      const base = s.group.getWorldPosition(this.v);
      const yaw = Math.atan2(this.head.x - base.x, this.head.z - base.z);
      const world = this.labelWorld.copy(base);
      if (s.wallish) {
        this.nrm.set(0, 1, 0).applyQuaternion(s.group.quaternion).setY(0).normalize();
        world.addScaledVector(this.nrm, 0.06);
        world.y += 0.13 * big;
      } else {
        world.y += horizontalLabelRise(s.plant.group.userData.height ?? 0, garden.settings.largeTargets, s.sample);
      }
      if (s.stake) {
        const st = s.stake.object3D!;
        st.position.set(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(0.092 * big).add(world);
        st.position.y -= 0.05 * big;
        st.quaternion.identity();
        st.scale.setScalar(big);
        st.updateMatrixWorld();
        this.stakes.setMatrixAt(stakeCount++, st.matrixWorld);
      }
      s.label.mesh.position.copy(s.group.worldToLocal(world));
      this.yawQ.setFromAxisAngle(this.up, yaw);
      s.label.mesh.quaternion.copy(s.group.quaternion).invert().multiply(this.yawQ);
    }
    this.stakes.count = stakeCount;
    this.stakes.instanceMatrix.needsUpdate = true;
    if (stakeCount) this.stakes.computeBoundingSphere();
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
        s.plant.group.userData.height = form.height;
        if (grew) chimeGrow();
      }
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
    const label = new CanvasCard(640, 400, 0.15, 0.094, `Label: ${h.label}`);
    group.add(label.mesh);
    const entity = this.world.createTransformEntity(group, { persistent: true });
    const key = `sprout:${h.id}`;
    const s: Sprout = { habitId: h.id, sample, entity, group, plant, label, stake: null, stage: -1, key: '', bounce: 0, wallish: false };
    if (!sample) {
      makePressable(entity, key, {
        tap: (p) => this.onTap(s, p),
        hold: () => {
          if (!garden.settings.oneHand) this.undo(s);
        },
      });
      // Keep a named transform per handle; all six visible handles share one
      // instanced draw and retain per-instance ray/poke hit testing.
      const handle = new Object3D();
      handle.name = `Move: ${h.label}`;
      s.stake = this.world.createTransformEntity(handle, { persistent: true });
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
      if (Math.abs(l.x) <= s.label.mW * 0.4625 && l.y >= -s.label.mH * 0.47 && l.y <= -s.label.mH * 0.34) return this.undo(s);
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
    else chimeTap(5);
    s.key = '';
    void garden.commit();
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

  private onSelect(src: AimSource, startedAt: number): void {
    if (ui.mode.peek() !== 'carrying' || !this.carryId || startedAt < this.carryStart + 30) return;
    void this.finishCarry(src);
  }

  private async finishCarry(src: AimSource, remove = false): Promise<void> {
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
    const tray = this.world.getSystem(TraySystem)!;
    const hit = aim.hit(aim.preferred(src === 'left' ? 'left' : 'right'));
    const h = garden.real.habits.find((x) => x.id === id);
    this.carryId = null;
    aim.enabled = false;
    if (!h) return;
    const oldUuid = h.placement?.anchorUuid ?? null;
    if (remove || (hit && tray.contains(hit.point))) {
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
    const key = JSON.stringify([g, st, chip, s.sample, h.placement?.surfaceLabel, garden.isSample]);
    if (key === s.key) return;
    s.key = key;
    const hc = st.highContrast;
    s.label.draw((c, w, hh) => {
      c.fillStyle = hc ? '#000' : 'rgba(243,236,217,0.95)';
      roundRect(c, 4, 4, w - 8, hh - 8, 34);
      c.fill();
      c.lineWidth = hc ? 8 : 3;
      c.strokeStyle = hc ? '#fff' : 'rgba(29,26,20,0.25)';
      c.stroke();
      const ink = hc ? '#fff' : LOAM;
      const accent = hc ? '#ffe14d' : MOSS;
      c.fillStyle = accent;
      c.beginPath();
      c.arc(68, 72, 46, 0, Math.PI * 2);
      c.fill();
      drawIcon(c, h.glyph, 68, 72, 56, hc ? '#000' : SEED_PAPER, 0.14);
      c.fillStyle = ink;
      c.textBaseline = 'middle';
      c.font = `700 50px ${FONT_UI}`;
      c.fillText(h.label, 130, 58);
      c.font = `500 30px ${FONT_MONO}`;
      c.fillStyle = hc ? '#fff' : 'rgba(29,26,20,0.65)';
      c.fillText(`on: ${h.placement?.surfaceLabel ?? '?'}`, 132, 102);
      // today
      c.fillStyle = ink;
      if (h.kind === 'counted') {
        c.font = `700 74px ${FONT_MONO}`;
        c.fillText(`${g.todayCount}/${h.target}`, 30, 182);
        c.font = `500 30px ${FONT_UI}`;
        c.fillText(g.todayCount >= h.target ? 'full today' : st.oneHand ? 'pinch +1' : 'pinch +1 · hold 1 s: −1', 250, 182);
      } else {
        c.font = `700 46px ${FONT_UI}`;
        c.fillStyle = g.todayCount ? accent : ink;
        c.fillText(g.todayCount ? 'Done today' : 'Pinch when done', 30, 180);
      }
      // stage dots
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        c.arc(42 + i * 34, 252, 11, 0, Math.PI * 2);
        c.fillStyle = i < g.stage ? accent : hc ? '#444' : 'rgba(29,26,20,0.15)';
        c.fill();
      }
      c.fillStyle = hc ? '#fff' : 'rgba(29,26,20,0.8)';
      c.font = `500 28px ${FONT_MONO}`;
      c.fillText(`stage ${g.stage}/7`, 320, 252);
      c.font = `600 32px ${FONT_UI}`;
      const status =
        g.inBloom
          ? 'In bloom this week'
          : g.vitality === 'resting'
            ? 'Resting: a missed day pauses growth'
            : g.streak > 1
              ? `${g.streak}-day streak`
              : g.vitality === 'fresh'
                ? 'Just planted'
                : g.toNextStage > 0
                  ? `${g.toNextStage} more day${g.toNextStage > 1 ? 's' : ''} to grow`
                  : 'Fully grown';
      c.fillStyle = !g.inBloom && g.vitality === 'resting' ? (hc ? '#ffe14d' : TERRACOTTA) : ink;
      c.fillText(status, 30, 312);
      if (chip) {
        c.fillStyle = hc ? '#ffe14d' : TERRACOTTA;
        roundRect(c, 24, 336, w - 48, 52, 24);
        c.fill();
        c.fillStyle = hc ? '#000' : SEED_PAPER;
        c.font = `700 32px ${FONT_UI}`;
        c.textAlign = 'center';
        c.fillText('Pinch here to undo one', w / 2, 363);
        c.textAlign = 'start';
      } else if (s.sample) {
        c.fillStyle = TERRACOTTA;
        c.font = `700 26px ${FONT_UI}`;
        c.fillText('EXAMPLE GARDEN (SAMPLE DATA)', 30, 366);
      }
    });
  }
}
