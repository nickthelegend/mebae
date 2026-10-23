import { type Habit, type Ledger, activeHabits } from './habits.js';

export type RestoreOutcome =
  | { habitId: string; status: 'restored' }
  | { habitId: string; status: 'pin-again'; reason: string };

/**
 * Decides where each habit appears at session start. A habit whose persistent
 * anchor could not be restored goes back to the tray with "Pin again". It is
 * never placed at a guessed position.
 */
export function planRestore(
  l: Ledger,
  results: Map<string, { ok: true } | { ok: false; reason: string }>,
): RestoreOutcome[] {
  return activeHabits(l).map((h: Habit) => {
    if (!h.placement) return { habitId: h.id, status: 'pin-again', reason: 'Not pinned yet.' };
    if (!h.placement.anchorUuid)
      return { habitId: h.id, status: 'pin-again', reason: 'This browser did not give a persistent anchor last time.' };
    const r = results.get(h.id);
    if (!r) return { habitId: h.id, status: 'pin-again', reason: 'Anchor restore was not attempted.' };
    if (r.ok) return { habitId: h.id, status: 'restored' };
    return { habitId: h.id, status: 'pin-again', reason: r.reason };
  });
}
