/**
 * DEV-SERVER ONLY. Imported behind `import.meta.env.DEV`, so Vite drops this
 * module from production builds (scripts/check-dist.mjs asserts it). It
 * exposes state for the headless e2e runs and the core's injectable clock so
 * a test can advance the day. The shipped app always uses the system clock.
 */
import { type World, VisibilityState, createSystem } from '@iwsdk/core';
import { activeHabits, countOn, exportLedger, growthOf } from '@mebae/core';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { AimSystem } from '../systems/aim.js';
import { AnchorSystem } from '../systems/anchors.js';
import { FocusSystem } from '../systems/focus.js';
import { PlantingSystem } from '../systems/planting.js';
import { RoomSystem } from '../systems/room.js';
import { SproutSystem } from '../systems/sprouts.js';
import { TraySystem } from '../systems/tray.js';
import { WeekSystem } from '../systems/week.js';

let offsetMs = 0;

export function install(world: World): void {
  const renderer = world.renderer;
  let t0 = 0;
  let sampling = false;
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
      offsetMs += n * 86_400_000;
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
    exportJson: () => exportLedger(garden.real, new Date(garden.clock.now())),
    perfStart() {
      cpu.length = calls.length = tris.length = 0;
      sampling = true;
    },
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
      localStorage.clear();
      await new Promise((r) => {
        const req = indexedDB.deleteDatabase('mebae');
        req.onsuccess = req.onerror = req.onblocked = () => r(null);
      });
    },
  };
}
