import type { Clock } from './clock.js';
import type { FocusBlock, FocusState } from './habits.js';

/** Raking for this long starts a 25-minute block. */
export const RAKE_START_MS = 2000;
/** Raking this long in total (within the first minute) makes it 50. */
export const RAKE_EXTEND_MS = 4000;
const EXTEND_WINDOW_MS = 60_000;

export interface FocusStatus {
  running: boolean;
  minutes: 25 | 50;
  remainingMs: number;
  /** 1 at start -> 0 at the end; drives the rake lines fading. */
  remainingFraction: number;
  stones: number;
}

/**
 * The timer stores only the wall-clock start. Nothing ticks: suspending the
 * headset, closing the tab or reloading cannot drift it. `settle` turns an
 * elapsed block into a stone, stamped with its real end time.
 */
export function settle(f: FocusState, clock: Clock): FocusBlock | null {
  if (f.startedAt === null) return null;
  const end = f.startedAt + f.minutes * 60_000;
  if (clock.now() < end) return null;
  const block: FocusBlock = { startedAt: f.startedAt, minutes: f.minutes, completedAt: end };
  f.blocks.push(block);
  f.startedAt = null;
  return block;
}

export function focusStatus(f: FocusState, clock: Clock): FocusStatus {
  if (f.startedAt === null) {
    return { running: false, minutes: f.minutes, remainingMs: 0, remainingFraction: 0, stones: f.blocks.length };
  }
  const total = f.minutes * 60_000;
  const remainingMs = Math.max(0, f.startedAt + total - clock.now());
  return {
    running: remainingMs > 0,
    minutes: f.minutes,
    remainingMs,
    remainingFraction: remainingMs / total,
    stones: f.blocks.length,
  };
}

export function startFocus(f: FocusState, clock: Clock, minutes: 25 | 50 = 25): boolean {
  settle(f, clock);
  if (f.startedAt !== null) return false;
  f.startedAt = clock.now();
  f.minutes = minutes;
  return true;
}

/** Keep raking (total >= RAKE_EXTEND_MS) in the first minute to make it 50. */
export function extendFocus(f: FocusState, clock: Clock): boolean {
  if (f.startedAt === null || f.minutes === 50) return false;
  if (clock.now() - f.startedAt > EXTEND_WINDOW_MS) return false;
  f.minutes = 50;
  return true;
}

export function cancelFocus(f: FocusState): boolean {
  if (f.startedAt === null) return false;
  f.startedAt = null;
  return true;
}
