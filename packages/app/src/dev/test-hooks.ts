/**
 * DEV-SERVER ONLY. Imported behind `import.meta.env.DEV`, so Vite drops this
 * module from production builds (scripts/check-dist.mjs asserts it). It
 * exposes state for the headless e2e runs and the core's injectable clock so
 * a test can advance the day. The shipped app always uses the system clock.
 */
import { type World, Vector3, VisibilityState, createSystem } from '@iwsdk/core';
import { activeHabits, addDays, countOn, createHabit, exportLedger, growthOf, setPlacement } from '@mebae/core';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { clear } from '../state/store.js';
import { AimSystem } from '../systems/aim.js';
import { AnchorSystem } from '../systems/anchors.js';
import { FocusSystem } from '../systems/focus.js';
import { PlantingSystem } from '../systems/planting.js';
import { RoomSystem } from '../systems/room.js';
import { SproutSystem } from '../systems/sprouts.js';
import { TraySystem } from '../systems/tray.js';
import { WeekSystem } from '../systems/week.js';
import { surfaceQuaternion } from '../systems/surface-pose.js';
import { Quaternion } from '@iwsdk/core';

let offsetMs = 0;

export function install(world: World): void {
  const renderer = world.renderer;
  let t0 = 0;
  let sampling = false;
  let sampleLimit = 600;
  const cpu: number[] = [];
  const calls: number[] = [];
  const tris: number[] = [];
  // the first system each frame stamps t0; the scene's after-render hook closes it
  class PerfStart extends createSystem({}) {
    update(): void {
      t0 = performance.now();
    }
  }
  world.registerSystem(PerfStart, { priority: -100 });
  const scene = world.scene;
  scene.onAfterRender = () => {
    if (!sampling || !t0) return;
    cpu.push(performance.now() - t0);
    calls.push(renderer.info.render.calls);
    tris.push(renderer.info.render.triangles);
    if (cpu.length >= sampleLimit) sampling = false;
    t0 = 0;
  };

  const sys = <T>(c: new (...a: never[]) => T) => world.getSystem(c as never) as T;
  const pct = (a: number[], p: number) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  };

  (window as unknown as Record<string, unknown>).__mebae = {
    state() {
      const l = garden.ledger;
      const today = garden.today();
      const tray = sys(TraySystem);
      return {
        today,
        xr: world.visibilityState.peek() !== VisibilityState.NonImmersive,
        mode: ui.mode.peek(),
        weekOpen: ui.weekOpen.peek(),
        sample: garden.isSample,
        settings: garden.settings,
        tray: tray ? { placed: tray.placed, how: tray.root.userData.placedHow ?? null, on: tray.placedOn, position: tray.root.getWorldPosition(tray.root.position.clone().set(0, 0, 0)).toArray() } : null,
        room: { planes: sys(RoomSystem)?.planeCount, meshes: sys(RoomSystem)?.meshCount },
        anchors: {
          live: sys(AnchorSystem)?.count,
          persistentSupported: sys(AnchorSystem)?.persistentSupported,
          outcomes: sys(AnchorSystem)?.outcomes,
        },
        hitTest: sys(AimSystem)?.hitTestSupported,
        habits: activeHabits(l).map((h) => ({
          id: h.id,
          label: h.label,
          kind: h.kind,
          today: countOn(l, h.id, today),
          target: h.target,
          stage: growthOf(l, h, today).stage,
          vitality: growthOf(l, h, today).vitality,
          placement: h.placement,
        })),
        sprouts: sys(SproutSystem)?.snapshot(),
        lastPlaced: sys(PlantingSystem)?.lastPlaced,
        focus: sys(FocusSystem)?.status,
        palmUp: sys(WeekSystem)?.palmUp,
      };
    },
    /** Test-only: move the injectable clock forward by whole days. */
    advanceDays(n: number) {
      const before = Date.now() + offsetMs;
      const after = new Date(before);
      after.setDate(after.getDate() + n);
      offsetMs += after.getTime() - before;
      garden.clock = { now: () => Date.now() + offsetMs };
      garden.bump();
      return garden.today();
    },
    advanceMinutes(n: number) {
      offsetMs += n * 60_000;
      garden.clock = { now: () => Date.now() + offsetMs };
      garden.bump();
      return garden.clock.now();
    },
    /** World positions of everything a test pinches. */
    targets() {
      const scene = world.scene;
      const w = (name: string, local?: [number, number, number]) => {
        const o = scene.getObjectByName(name);
        if (!o || !o.visible) return null;
        for (let p = o.parent; p; p = p.parent) if (!p.visible) return null;
        o.updateWorldMatrix(true, false);
        const v = new Vector3(...(local ?? [0, 0, 0]));
        return o.localToWorld(v).toArray();
      };
      const radial = scene.getObjectByName('Icon radial');
      const icons = radial?.visible
        ? Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const r = 0.16 * 0.73;
            return radial.localToWorld(new Vector3(Math.sin(a) * r, Math.cos(a) * r, 0)).toArray();
          })
        : null;
      const tray = sys(TraySystem);
      const seed = tray && tray.freeSlots().length ? tray.slotWorld(tray.freeSlots()[0], new Vector3()).toArray() : null;
      const menu = scene.getObjectByName('Tray menu');
      const menuMesh = menu?.children.find((c) => c.name === 'Tray menu') ?? menu;
      const menuButtons = menuMesh
        ? ['Week', 'Sample', 'Contrast', 'Large', 'One-hand'].map((_, i) => menuMesh.localToWorld(new Vector3(-0.18 + 0.036 + i * 0.072, 0, 0)).toArray())
        : null;
      const wristMesh = scene.getObjectByName('Wrist menu')?.children[0];
      const wrist = wristMesh?.parent?.visible
        ? [0, 1, 2, 3, 4, 5].map((k) => wristMesh.localToWorld(new Vector3((k % 2 ? 1 : -1) * 0.0325, 0.0303 - Math.floor(k / 2) * 0.0303, 0)).toArray())
        : null;
      const sprouts: Record<string, unknown> = {};
      for (const h of activeHabits(garden.ledger)) {
        sprouts[h.id] = {
          label: w(`Label: ${h.label}`),
          stake: w(`Move: ${h.label}`),
          pot: w(`Pin again: ${h.label}`),
        };
      }
      return {
        tray: w('Seed tray'),
        seed,
        icons,
        sand: w('Focus sand'),
        sandSpan: [w('Focus sand', [-0.08, 0.05, 0]), w('Focus sand', [0.08, 0.05, 0]), w('Focus sand', [-0.08, -0.05, 0]), w('Focus sand', [0.08, -0.05, 0])],
        menuButtons,
        wrist,
        week: w('Week view'),
        reticle: w('Aim reticle'),
        sprouts,
        // Actual rectangle corners, not only centres, for the Glasses mask gate.
        bounds: Object.fromEntries([
          ['tray', 'Seed tray', 0.4, 0.2, true],
          ['menu', 'Tray menu', 0.36, 0.052, false],
          ['radial', 'Icon radial', 0.32, 0.32, false],
          ['week', 'Week view', 0.46, 0.305, false],
          ['focus', 'Focus timer', 0.15, 0.035, false],
        ].map(([key, name, width, height, horizontal]) => {
          // Tray menu has a named wrapper, so use its actual card mesh.
          const o = scene.getObjectByName(name as string);
          const card = name === 'Tray menu' ? o?.children.find((c) => c.name === name) ?? o : o;
          if (!card) return [key, []];
          card.updateWorldMatrix(true, false);
          const pts = [-1, 1].flatMap((x) => [-1, 1].map((y) => {
            const v = new Vector3(x * Number(width) / 2, horizontal ? 0 : y * Number(height) / 2, horizontal ? y * Number(height) / 2 : 0);
            return card.localToWorld(v).toArray();
          }));
          return [key, pts];
        })),
      };
    },
    /** Test-only: marks the last n days complete for every active habit (perf scenes). */
    fillHistory(n: number) {
      const today = garden.today();
      for (const h of activeHabits(garden.real)) {
        for (let d = 1; d <= n; d++) garden.real.counts[h.id][addDays(today, -d)] = h.target;
      }
      void garden.commit();
      return activeHabits(garden.real).map((h) => growthOf(garden.real, h, today).stage);
    },
    exportJson: () => exportLedger(garden.real, new Date(garden.clock.now())),
    roomFixture() {
      const d = sys(RoomSystem)?.findDesk(new Vector3(), 100);
      if (!d) throw new Error('The room has no detected desk/table/counter top.');
      return { centre: d.center.toArray(), halfX: d.halfX, halfZ: d.halfZ, label: d.label,
        seated: [d.center.x, d.y + 0.45, d.center.z + d.halfZ + 0.35] };
    },
    /** Performance setup only: not evidence of a user interaction. */
    async preparePerf() {
      if (activeHabits(garden.real).length || !sys(TraySystem)?.placed) throw new Error('Perf setup needs an empty garden with its tray placed.');
      const tray = sys(TraySystem);
      const room = sys(RoomSystem);
      const anchors = sys(AnchorSystem);
      const head = world.player.head.getWorldPosition(new Vector3());
      for (let i = 0; i < 6; i++) {
        const target = tray.root.localToWorld(new Vector3((i % 3 - 1) * 0.3, 0, -0.24 - Math.floor(i / 3) * 0.3));
        const hit = room.raycast(head, target.clone().sub(head).normalize());
        if (!hit) throw new Error(`No detected surface for perf plant ${i + 1}`);
        const info = room.classify(hit.point, hit.normal);
        const h = createHabit(garden.real, ['read', 'water', 'deep-work', 'stretch', 'read', 'deep-work'][i], garden.clock);
        const uuid = await anchors.create(h.id, hit.point, surfaceQuaternion(hit.normal, hit.point, head, new Quaternion()));
        setPlacement(garden.real, h.id, { anchorUuid: uuid, surfaceLabel: info.label, surface: info.surface });
        for (let d = 1; d <= 24; d++) garden.real.counts[h.id][addDays(garden.today(), -d)] = h.target;
      }
      await garden.commit();
    },
    forcePlantDraws() {
      world.scene.traverse((o) => {
        if (o.name.startsWith('Sprout: ')) o.traverse((child) => { child.frustumCulled = false; });
      });
    },
    perfStart(frames = 600) {
      cpu.length = calls.length = tris.length = 0;
      sampleLimit = frames;
      sampling = true;
    },
    perfFrames: () => cpu.length,
    perfStop() {
      sampling = false;
      return {
        frames: cpu.length,
        cpuMs: { p50: pct(cpu, 50), p95: pct(cpu, 95), max: pct(cpu, 100) },
        drawCalls: { p50: pct(calls, 50), max: pct(calls, 100) },
        triangles: { p50: pct(tris, 50), max: pct(tris, 100) },
      };
    },
    /** Simulates a lost anchor: removes IWER's stored persistent anchors. */
    forgetEmulatorAnchors() {
      localStorage.removeItem('@immersive-web-emulation-runtime/persistent-anchors');
    },
    async wipe() {
      localStorage.removeItem('iwsdk_scene_anchor_uuid');
      localStorage.removeItem('@immersive-web-emulation-runtime/persistent-anchors');
      await clear();
    },
  };
}
