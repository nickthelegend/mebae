import {
  type Clock,
  type Ledger,
  SAMPLE_STAMP,
  dayKey,
  emptyLedger,
  sampleLedger,
  settle,
  systemClock,
} from '@mebae/core';
import { signal } from '@iwsdk/core';
import { load, save } from './store.js';

export interface Settings {
  highContrast: boolean;
  largeTargets: boolean;
  /** Every action is a single pinch: hold-to-undo and raking get buttons. */
  oneHand: boolean;
}

export interface TrayPose {
  /** Tray pose in the IWSDK scene anchor's local frame. */
  local: { p: [number, number, number]; q: [number, number, number, number] };
  /** The IWSDK persistent anchor uuid this pose is relative to. */
  anchorUuid: string | null;
}

const LEDGER_KEY = 'ledger';
const SETTINGS_KEY = 'settings';
const TRAY_KEY = 'tray';

/**
 * App state. `clock` is the real system clock in the shipped build; only the
 * dev-server test hook (src/dev/test-hooks.ts, stripped from production) can
 * swap it. Real history and the sample garden are separate objects.
 */
class Garden {
  clock: Clock = systemClock;
  real: Ledger = emptyLedger();
  sample: Ledger | null = null;
  settings: Settings = { highContrast: false, largeTargets: false, oneHand: false };
  tray: TrayPose | null = null;
  /** Bumped on every change; systems re-render from it. */
  readonly version = signal(0);
  readonly toast = signal<{ text: string; tone: 'info' | 'error'; at: number } | null>(null);
  loaded = false;

  get ledger(): Ledger {
    return this.sample ?? this.real;
  }
  get isSample(): boolean {
    return this.sample !== null;
  }
  get stamp(): string | null {
    return this.sample ? SAMPLE_STAMP : null;
  }
  today(): string {
    return dayKey(this.clock.now());
  }

  async load(): Promise<void> {
    const [l, s, t] = await Promise.all([
      load<Ledger>(LEDGER_KEY),
      load<Settings>(SETTINGS_KEY),
      load<TrayPose>(TRAY_KEY),
    ]);
    if (l && !l.sample) this.real = l;
    if (s) this.settings = { ...this.settings, ...s };
    if (t) this.tray = t;
    if (settle(this.real.focus, this.clock)) await save(LEDGER_KEY, this.real);
    this.loaded = true;
    this.bump();
  }

  /** Persists real history. Sample data is never written. */
  async commit(): Promise<void> {
    this.bump();
    try {
      await save(LEDGER_KEY, this.real);
    } catch (e) {
      this.say(`Not saved: ${(e as Error).message}`, 'error');
    }
  }

  async saveSettings(): Promise<void> {
    this.bump();
    await save(SETTINGS_KEY, this.settings);
  }

  async saveTray(t: TrayPose): Promise<void> {
    this.tray = t;
    await save(TRAY_KEY, t);
  }

  setSample(on: boolean): void {
    this.sample = on ? sampleLedger(this.today()) : null;
    this.bump();
  }

  async replaceReal(l: Ledger): Promise<void> {
    await save(LEDGER_KEY, l);
    this.real = l;
    this.bump();
  }

  say(text: string, tone: 'info' | 'error' = 'info'): void {
    this.toast.value = { text, tone, at: performance.now() };
    if (tone === 'error') console.warn(`[mebae] ${text}`);
  }

  bump(): void {
    this.version.value = this.version.peek() + 1;
  }
}

export const garden = new Garden();
