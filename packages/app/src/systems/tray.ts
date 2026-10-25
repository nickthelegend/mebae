import { MAX_HABITS, activeHabits } from '@mebae/core';
import {
  type Entity,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  XRAnchor,
  createSystem,
} from '@iwsdk/core';
import { bindInstanceSpherecast } from '../interaction/instance-spherecast.js';
import { makePressable, unregisterPressable } from '../interaction/press-router.js';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { CanvasCard, roundRect } from '../ui/canvas-card.js';
import { drawIcon } from '../ui/icons.js';
import { FONT_UI, LOAM, MOSS, SEED_PAPER, TERRACOTTA } from '../ui/palette.js';
import { mergedBoxes, woodTexture } from '../ui/geometry.js';
import { AnchorSystem } from './anchors.js';
import { RoomSystem } from './room.js';

const IWSDK_ANCHOR_KEY = 'iwsdk_scene_anchor_uuid';
export const TRAY_W = 0.4;
export const TRAY_D = 0.2;
const SLOT_X = [-0.165, -0.12, -0.075];
const SLOT_Z = [-0.035, 0.035];
const MENU = ['Week', 'Sample', 'Contrast', 'Large', 'One-hand'] as const;

export function slotLocal(i: number, out: Vector3): Vector3 {
  return out.set(SLOT_X[i % 3], 0.034, SLOT_Z[Math.floor(i / 3) % 2]);
}

/**
 * The desk tray: seeds for new habits, "Pin again" pots, the focus sand and
 * a small menu. Anchored with IWSDK's own persistent scene anchor (the 7th
 * anchor: 6 habits + this one, under Meta's 8 per site).
 */
export class TraySystem extends createSystem({}) {
  entity: Entity | null = null;
  root = new Group();
  placed = false;
  placedOn = '';
  private placing = false;
  private sessionT0 = 0;
  private seeds!: InstancedMesh;
  private base!: Mesh;
  private seedsEntity: Entity | null = null;
  private menu!: CanvasCard;
  private toastCard!: CanvasCard;
  private stampCard!: CanvasCard;
  private pots = new Map<string, Entity>();
  private potStyle = '';
  private showGardenHint = false;
  private toastUntil = 0;
  private lastVersion = -1;
  private v = new Vector3();
  private head = new Vector3();

  init(): void {
    this.root.name = 'Seed tray';
    this.build();
    const start = () => this.onSessionStart();
    const end = () => this.onSessionEnd();
    this.xrManager.addEventListener('sessionstart', start);
    this.xrManager.addEventListener('sessionend', end);
    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', start),
      () => this.xrManager.removeEventListener('sessionend', end),
      garden.toast.subscribe((t) => {
        if (!t) return;
        const wasVisible = this.toastCard.mesh.visible;
        this.drawToast(t.text, t.tone);
        this.toastUntil = performance.now() + 4200;
        if (!wasVisible) {
          // appear in place, then follow lazily
          this.followHead(this.toastCard.mesh);
          this.toastCard.mesh.position.copy(this.v);
          this.toastCard.mesh.lookAt(this.head);
        }
      }),
    );
  }

  private build(): void {
    const wood = new MeshStandardMaterial({ map: woodTexture(), roughness: 0.7, color: new Color('#d8b48c') });
    const m = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
    const base = this.base = new Mesh(
      mergedBoxes([
        { w: TRAY_W, h: 0.012, d: TRAY_D, m: m(0, 0.006, 0) },
        { w: TRAY_W, h: 0.03, d: 0.012, m: m(0, 0.015, -TRAY_D / 2 + 0.006) },
        { w: TRAY_W, h: 0.03, d: 0.012, m: m(0, 0.015, TRAY_D / 2 - 0.006) },
        { w: 0.012, h: 0.03, d: TRAY_D, m: m(-TRAY_W / 2 + 0.006, 0.015, 0) },
        { w: 0.012, h: 0.03, d: TRAY_D, m: m(TRAY_W / 2 - 0.006, 0.015, 0) },
        { w: 0.008, h: 0.026, d: TRAY_D - 0.02, m: m(-0.042, 0.013, 0) },
      ]),
      wood,
    );
    base.name = 'Tray base';
    this.root.add(base);
    const soil = new Mesh(new PlaneGeometry(0.15, 0.17), new MeshStandardMaterial({ color: new Color('#3b2c1e'), roughness: 1 }));
    soil.rotation.x = -Math.PI / 2;
    soil.position.set(-0.12, 0.0135, 0);
    soil.name = 'Seed soil';
    this.root.add(soil);

    this.menu = new CanvasCard(1024, 150, 0.36, 0.052, 'Tray menu');
    this.menu.mesh.position.set(0, 0.035, TRAY_D / 2 + 0.03);
    this.menu.mesh.rotation.x = -0.9;
    this.root.add(this.menu.mesh);

    this.toastCard = new CanvasCard(1024, 200, 0.34, 0.066, 'Toast');
    this.toastCard.mesh.visible = false;
    this.toastCard.mesh.renderOrder = 30;
    (this.toastCard.mesh.material as { depthTest: boolean }).depthTest = false;

    this.stampCard = new CanvasCard(1024, 110, 0.36, 0.039, 'Sample stamp');
    this.stampCard.mesh.position.set(0, 0.195, -0.06);
    this.stampCard.mesh.visible = false;
    this.drawSampleStamp();
    this.root.add(this.stampCard.mesh);
  }

  private onSessionStart(): void {
    this.sessionT0 = performance.now();
    this.placed = false;
    this.placing = false;
    this.root.visible = false;
    this.lastVersion = -1;
    if (this.entity) return; // entities live for the page; only placement resets
    this.entity = this.world.createTransformEntity(this.root, { persistent: true });
    this.entity.addComponent(XRAnchor);
    const baseEntity = this.world.createTransformEntity(this.base, { parent: this.entity, persistent: true });
    let removing = false;
    makePressable(baseEntity, 'tray-base', {
      down: () => {
        removing = ui.mode.peek() === 'carrying';
        if (removing) this.world.getSystem(TrayEvents)?.emit('drop-in-tray');
      },
      tap: () => {
        if (!removing) this.world.getSystem(TrayEvents)?.emit('seed');
      },
    });
    this.world.createTransformEntity(this.toastCard.mesh, { persistent: true });
    this.seedsEntity = this.world.createTransformEntity(this.makeSeeds(), { parent: this.entity, persistent: true });
    makePressable(this.seedsEntity, 'seeds', { tap: () => this.world.getSystem(TrayEvents)?.emit('seed') });
    const menuEntity = this.world.createTransformEntity(new Object3D(), { parent: this.entity, persistent: true });
    menuEntity.object3D!.add(this.menu.mesh);
    menuEntity.object3D!.name = 'Tray menu';
    makePressable(menuEntity, 'tray-menu', {
      tap: (p) => {
        if (!p) return;
        const local = this.menu.mesh.worldToLocal(p.clone());
        const i = Math.floor(((local.x + this.menu.mW / 2) / this.menu.mW) * MENU.length);
        this.menuAction(MENU[Math.max(0, Math.min(MENU.length - 1, i))]);
      },
    });
    this.lastVersion = -1;
  }

  private onSessionEnd(): void {
    this.placed = false;
    this.root.visible = false;
  }

  menuAction(a: (typeof MENU)[number]): void {
    const s = garden.settings;
    if (a === 'Week') ui.weekOpen.value = !ui.weekOpen.peek();
    else if (a === 'Sample') {
      if (ui.mode.peek() !== 'idle') return garden.say('Finish pinning or moving this sprout before switching gardens.');
      garden.setSample(!garden.isSample);
      garden.say(garden.isSample ? 'Example garden on: sample data, not your history.' : 'Back to your real garden.');
    } else {
      if (a === 'Contrast') s.highContrast = !s.highContrast;
      if (a === 'Large') s.largeTargets = !s.largeTargets;
      if (a === 'One-hand') s.oneHand = !s.oneHand;
      void garden.saveSettings();
      garden.say(
        a === 'One-hand'
          ? s.oneHand
            ? 'One-hand mode: every action is one pinch. Tap a sprout for its undo button.'
            : 'One-hand mode off.'
          : `${a === 'Large' ? 'Larger targets' : 'High contrast'} ${(a === 'Large' ? s.largeTargets : s.highContrast) ? 'on' : 'off'}.`,
      );
    }
  }

  private makeSeeds(): InstancedMesh {
    const g = new SphereGeometry(1, 10, 8);
    const mat = new MeshStandardMaterial({ color: new Color('#c9a36a'), roughness: 0.55, emissive: new Color('#2a1c08'), emissiveIntensity: 0.4 });
    this.seeds = new InstancedMesh(g, mat, MAX_HABITS);
    this.seeds.name = 'Seeds';
    bindInstanceSpherecast(this.seeds);
    return this.seeds;
  }

  /** World position of a seed slot. */
  slotWorld(i: number, out: Vector3): Vector3 {
    slotLocal(i, out);
    return this.root.localToWorld(out);
  }

  freeSlots(): number[] {
    const used = activeHabits(garden.real).length;
    const free: number[] = [];
    for (let i = used; i < MAX_HABITS; i++) free.push(i);
    return free;
  }

  /** True if a world point is over the tray footprint (for "drop in tray"). */
  contains(p: Vector3): boolean {
    const l = this.root.worldToLocal(this.v.copy(p));
    return Math.abs(l.x) < TRAY_W / 2 + 0.05 && Math.abs(l.z) < TRAY_D / 2 + 0.05 && l.y > -0.1 && l.y < 0.25;
  }

  potKeyFor(habitId: string): string {
    return `pin-again:${habitId}`;
  }

  update(): void {
    if (!this.entity) return;
    if (!this.placed) this.tryPlace();
    if (!this.placed) return;
    // the scene anchor's persistent handle can arrive after placement
    const t = garden.tray;
    if (t && !t.anchorUuid && !this.root.userData.unanchored) {
      const uuid = localStorage.getItem(IWSDK_ANCHOR_KEY);
      if (uuid) void garden.saveTray({ ...t, anchorUuid: uuid });
    }
    const ver = garden.version.peek();
    if (ver !== this.lastVersion) {
      this.lastVersion = ver;
      this.refresh();
    }
    // The week panel supplies its own sample stamp and occupies this space.
    this.stampCard.mesh.visible = !ui.weekOpen.peek() && (garden.isSample || (ui.mode.peek() === 'idle' && this.showGardenHint));
    if (this.toastCard.mesh.visible) {
      if (performance.now() > this.toastUntil) this.toastCard.mesh.visible = false;
      else this.followHead(this.toastCard.mesh);
    }
  }

  /** Toasts float 55 cm ahead and 20 cm below the eyes (inside the Glasses FoV), lazily following. */
  private followHead(o: Object3D): void {
    this.player.head.getWorldPosition(this.head);
    const q = this.player.head.getWorldQuaternion(new Quaternion());
    const fwd = this.v.set(0, 0, -1).applyQuaternion(q).setY(0).normalize();
    const target = fwd.multiplyScalar(0.55).add(this.head);
    target.y -= 0.2;
    if (o.position.distanceToSquared(target) > 0.0004) o.position.lerp(target, 0.12);
    o.lookAt(this.head);
    // `this.v` now holds the target (used to place a fresh toast directly)
  }

  private tryPlace(): void {
    if (!this.entity || this.placing || !garden.loaded) return;
    const attached = !!this.entity.getValue(XRAnchor, 'attached');
    const waited = performance.now() - this.sessionT0;
    if (!attached && waited < 3000) return;
    // no anchor after 3 s: place anyway, but do not claim persistence
    this.root.userData.unanchored = !attached;
    const anchorUuid = attached ? localStorage.getItem(IWSDK_ANCHOR_KEY) : null;
    const saved = garden.tray;
    if (saved && anchorUuid && saved.anchorUuid === anchorUuid) {
      this.root.position.fromArray(saved.local.p);
      this.root.quaternion.fromArray(saved.local.q);
      this.finishPlace('restored');
      return;
    }
    const room = this.world.getSystem(RoomSystem);
    this.player.head.getWorldPosition(this.head);
    const desk = room?.findDesk(this.head);
    if (!desk && waited < 1800) return; // give scene understanding a moment
    this.placing = true;
    const worldPos = new Vector3();
    const toHead = new Vector3();
    if (desk) {
      // the near edge of the desk, 14 cm in, clamped to the top
      const c = desk.center;
      worldPos.set(
        Math.max(c.x - desk.halfX + 0.22, Math.min(c.x + desk.halfX - 0.22, this.head.x)),
        desk.y + 0.002,
        Math.max(c.z - desk.halfZ + 0.12, Math.min(c.z + desk.halfZ - 0.12, this.head.z)),
      );
      this.placedOn = desk.label;
    } else {
      const fwd = new Vector3(0, 0, -1).applyQuaternion(this.player.head.getWorldQuaternion(new Quaternion()));
      fwd.y = 0;
      fwd.normalize();
      worldPos.copy(this.head).addScaledVector(fwd, 0.42);
      worldPos.y = this.head.y - 0.45;
      this.placedOn = 'in front of you';
    }
    toHead.subVectors(this.head, worldPos);
    const yaw = Math.atan2(toHead.x, toHead.z);
    const parent = this.root.parent;
    parent?.updateMatrixWorld(true);
    const worldQ = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    // convert world pose into the anchor group's local frame
    if (parent) {
      const inv = new Matrix4().copy(parent.matrixWorld).invert();
      this.root.position.copy(worldPos).applyMatrix4(inv);
      const pq = parent.getWorldQuaternion(new Quaternion()).invert();
      this.root.quaternion.copy(pq.multiply(worldQ));
    } else {
      this.root.position.copy(worldPos);
      this.root.quaternion.copy(worldQ);
    }
    void garden.saveTray({
      local: { p: this.root.position.toArray() as [number, number, number], q: this.root.quaternion.toArray() as [number, number, number, number] },
      anchorUuid,
    });
    this.finishPlace(desk ? 'desk' : 'float');
  }

  private finishPlace(how: string): void {
    this.placed = true;
    this.root.visible = true;
    this.root.userData.placedHow = how;
    garden.bump();
  }

  /** Rebuilds seeds, pots, menu and stamp from state. */
  private refresh(): void {
    const free = this.freeSlots();
    this.showGardenHint = free.length === MAX_HABITS || free.length === 0;
    const anchors = this.world.getSystem(AnchorSystem);
    const pinAgain = garden.isSample
      ? []
      : activeHabits(garden.real).filter((h) => {
          const o = anchors?.outcomeFor(h.id);
          return (o && o.status === 'pin-again') || (!o && anchors?.outcomes && !anchors.hasAnchor(h.id));
        });
    const potStyle = `${garden.settings.highContrast}:${garden.settings.largeTargets}`;
    if (potStyle !== this.potStyle) {
      for (const [id, e] of this.pots) {
        unregisterPressable(this.potKeyFor(id));
        e.dispose();
      }
      this.pots.clear();
      this.potStyle = potStyle;
    }
    const m = new Matrix4();
    let n = 0;
    for (const i of free) {
      const p = slotLocal(i, new Vector3());
      const s = garden.settings.largeTargets ? 1.4 : 1;
      m.compose(p, new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.5 + i), new Vector3(0.011 * s, 0.0075 * s, 0.0075 * s));
      if (ui.mode.peek() !== 'idle' && i === free[0]) continue; // the lifted seed
      this.seeds.setMatrixAt(n++, m);
    }
    this.seeds.count = n;
    this.seeds.instanceMatrix.needsUpdate = true;
    this.seeds.computeBoundingSphere();

    // pots for sprouts whose anchor did not come back
    const want = new Set(pinAgain.map((h) => h.id));
    for (const [id, e] of this.pots) if (!want.has(id)) {
      unregisterPressable(this.potKeyFor(id));
      e.dispose();
      this.pots.delete(id);
    }
    pinAgain.forEach((h, k) => {
      const existing = this.pots.get(h.id);
      if (existing) {
        existing.object3D!.position.set((k % 3 - 1) * 0.14, 0.01 + Math.floor(k / 3) * 0.065, -0.01);
        return;
      }
      const card = new CanvasCard(512, 220, 0.11, 0.047, `Pin again: ${h.label}`);
      card.draw((g, w, hh) => {
        const hc = garden.settings.highContrast;
        g.fillStyle = hc ? '#000' : SEED_PAPER;
        roundRect(g, 4, 4, w - 8, hh - 8, 26);
        g.fill();
        g.strokeStyle = hc ? '#fff' : TERRACOTTA;
        g.lineWidth = 6;
        g.stroke();
        drawIcon(g, h.glyph, 70, hh / 2, 90, hc ? '#ffe14d' : MOSS, 0.12);
        g.fillStyle = hc ? '#fff' : LOAM;
        g.font = `700 54px ${FONT_UI}`;
        g.textBaseline = 'middle';
        g.fillText('Pin again', 130, hh / 2 - 30);
        g.font = `500 44px ${FONT_UI}`;
        g.fillText(h.label, 130, hh / 2 + 34);
      });
      const pot = new Mesh(new SphereGeometry(0.016, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new MeshStandardMaterial({ color: new Color(TERRACOTTA), roughness: 0.8 }));
      pot.rotation.x = Math.PI;
      const holder = new Group();
      // The named pinch target is the card, which stands above the tray.
      // The holder origin is the pot, and that point sits inside the tray
      // base, so a ray aimed there presses the tray instead of this card.
      holder.add(pot);
      card.mesh.position.set(0, 0.05, 0);
      holder.add(card.mesh);
      // Six independent cards, with a gap even when larger targets are on.
      holder.position.set((k % 3 - 1) * 0.14, 0.01 + Math.floor(k / 3) * 0.065, -0.01);
      holder.scale.setScalar(garden.settings.largeTargets ? 1.2 : 1);
      const e = this.world.createTransformEntity(holder, { parent: this.entity!, persistent: true });
      makePressable(e, this.potKeyFor(h.id), { tap: () => this.world.getSystem(TrayEvents)?.emit('pin-again', h.id) });
      this.pots.set(h.id, e);
    });

    this.drawMenu();
    this.menu.mesh.scale.y = garden.settings.largeTargets ? 1.4 : 1;
    if (!garden.isSample) this.stampCard.draw((g, w, h) => {
      const hc = garden.settings.highContrast;
      g.fillStyle = hc ? '#000' : SEED_PAPER;
      roundRect(g, 4, 4, w - 8, h - 8, 18);
      g.fill();
      g.fillStyle = hc ? '#ffe14d' : LOAM;
      g.font = `700 42px ${FONT_UI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(free.length ? 'No habits yet · pinch a seed or the tray to begin' : '6 of 6 habits · move a sprout into the tray to free a seed', w / 2, h / 2, w - 40);
    });
    else this.drawSampleStamp();
  }

  private drawSampleStamp(): void {
    this.stampCard.draw((g, w, h) => {
      g.fillStyle = garden.settings.highContrast ? '#000' : TERRACOTTA;
      roundRect(g, 4, 4, w - 8, h - 8, 18);
      g.fill();
      g.fillStyle = garden.settings.highContrast ? '#ffe14d' : SEED_PAPER;
      g.font = `700 52px ${FONT_UI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('EXAMPLE GARDEN (SAMPLE DATA)', w / 2, h / 2 + 2);
    });
  }

  private drawMenu(): void {
    const s = garden.settings;
    const hc = s.highContrast;
    const on = [ui.weekOpen.peek(), garden.isSample, s.highContrast, s.largeTargets, s.oneHand];
    this.menu.draw((g, w, h) => {
      const bw = w / MENU.length;
      MENU.forEach((label, i) => {
        g.fillStyle = on[i] ? (hc ? '#ffe14d' : MOSS) : hc ? '#000' : 'rgba(243,236,217,0.94)';
        roundRect(g, i * bw + 6, 8, bw - 12, h - 16, 30);
        g.fill();
        g.lineWidth = hc ? 6 : 3;
        g.strokeStyle = hc ? '#fff' : 'rgba(29,26,20,0.35)';
        g.stroke();
        g.fillStyle = on[i] ? (hc ? '#000' : SEED_PAPER) : hc ? '#fff' : LOAM;
        g.font = `700 ${hc ? 46 : 42}px ${FONT_UI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, i * bw + bw / 2, h / 2 + 2);
      });
    });
  }

  private drawToast(text: string, tone: 'info' | 'error'): void {
    const hc = garden.settings.highContrast;
    this.toastCard.draw((g, w, h) => {
      g.fillStyle = hc ? '#000' : tone === 'error' ? '#5a2414' : 'rgba(29,26,20,0.88)';
      roundRect(g, 4, 4, w - 8, h - 8, 36);
      g.fill();
      g.fillStyle = hc ? '#ffe14d' : SEED_PAPER;
      g.font = `600 40px ${FONT_UI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      wrap(g, text, w / 2, h / 2, w - 70, 46);
    });
    this.toastCard.mesh.visible = true;
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, cy: number, maxW: number, lh: number): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 3);
  shown.forEach((l, i) => g.fillText(l, x, cy + (i - (shown.length - 1) / 2) * lh));
}

/** Tiny event hub so tray presses reach the planting flow without import cycles. */
export class TrayEvents extends createSystem({}) {
  private subs = new Map<string, Set<(arg?: string) => void>>();
  on(ev: string, fn: (arg?: string) => void): () => void {
    let s = this.subs.get(ev);
    if (!s) this.subs.set(ev, (s = new Set()));
    s.add(fn);
    return () => s!.delete(fn);
  }
  emit(ev: string, arg?: string): void {
    this.subs.get(ev)?.forEach((f) => f(arg));
  }
}
