import { VisibilityState, World } from '@iwsdk/core';
import { activeHabits, exportLedger, importLedger } from '@mebae/core';
import projectOptions from 'virtual:iwsdk-project';
import { PressRouter } from './interaction/press-router.js';
import { garden } from './state/garden.js';
import { AimSystem } from './systems/aim.js';
import { AnchorSystem } from './systems/anchors.js';
import { FocusSystem } from './systems/focus.js';
import { PlantingSystem } from './systems/planting.js';
import { RoomSystem } from './systems/room.js';
import { SproutSystem } from './systems/sprouts.js';
import { TrayEvents, TraySystem } from './systems/tray.js';
import { WeekSystem } from './systems/week.js';
import { fontsReady } from './ui/palette.js';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = (text: string, err = false) => {
  const el = $('status');
  el.textContent = text;
  el.className = err ? 'err' : '';
};

function summary(): void {
  const l = garden.real;
  const n = activeHabits(l).length;
  $('summary').textContent = `${n} of 6 habits planted · ${l.focus.blocks.length} focus stone${l.focus.blocks.length === 1 ? '' : 's'}`;
}

async function main(): Promise<void> {
  try {
    await garden.load();
  } catch (e) {
    status(`Storage unavailable: ${(e as Error).message}. History cannot be saved in this browser.`, true);
  }
  summary();
  await fontsReady();

  const world = await World.create($('scene-container') as HTMLDivElement, projectOptions);
  world
    .registerSystem(TrayEvents)
    .registerSystem(PressRouter, { priority: 1 })
    .registerSystem(RoomSystem, { priority: 2 })
    .registerSystem(AnchorSystem, { priority: 3 })
    .registerSystem(AimSystem, { priority: 4 })
    .registerSystem(TraySystem, { priority: 10 })
    .registerSystem(PlantingSystem, { priority: 11 })
    .registerSystem(SproutSystem, { priority: 12 })
    .registerSystem(FocusSystem, { priority: 13 })
    .registerSystem(WeekSystem, { priority: 14 });

  const enter = $<HTMLButtonElement>('enter');
  const supported = !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false));
  if (supported) {
    enter.disabled = false;
    enter.textContent = 'Enter your garden';
    enter.onclick = () => world.launchXR();
  } else {
    enter.textContent = 'Open on a Meta Quest 3 / 3S';
    status('Setup required: this browser has no immersive-ar WebXR. Open this page in the Quest Browser (hands are enough).');
  }
  world.visibilityState.subscribe((v) => document.body.classList.toggle('xr', v !== VisibilityState.NonImmersive));
  garden.version.subscribe(() => summary());

  $('export').onclick = () => {
    try {
      const json = exportLedger(garden.real, new Date());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `mebae-history-${garden.today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      status('History exported.');
    } catch (e) {
      status((e as Error).message, true);
    }
  };
  $<HTMLInputElement>('import').onchange = async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      const l = importLedger(await f.text());
      if (!confirm(`Replace this browser's history with ${l.habits.length} habits from ${f.name}? Anchors from another headset will ask to be pinned again.`)) return;
      await garden.replaceReal(l);
      // Discard live XRAnchor objects before restoring the imported handles.
      // Reusing a matching habit id must never reuse that id's previous spot.
      location.reload();
    } catch (e) {
      status(`Import refused: ${(e as Error).message}`, true);
    }
  };

  if (import.meta.env.DEV) {
    const hooks = await import('./dev/test-hooks.js');
    hooks.install(world);
  }
}

main().catch((e) => {
  console.error(e);
  status(`Mebae could not start: ${(e as Error).message}`, true);
});
