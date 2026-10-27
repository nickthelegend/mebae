import {
  type Entity,
  Object3D,
  PokeInteractable,
  Pressed,
  RayInteractable,
  Raycaster,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { Pressable } from './pressable-component.js';
import { AimSystem } from '../systems/aim.js';

export const HOLD_MS = 1000;

export interface PressHandlers {
  /** Fires on pinch start with the world hit point. */
  down?: (point: Vector3 | null) => void;
  /** Pinch released before HOLD_MS (and no hold fired). */
  tap?: (point: Vector3 | null) => void;
  /** Pinch held for HOLD_MS. Suppresses the tap. */
  hold?: () => void;
  /** Pointer moved while pressed (raking). */
  drag?: (point: Vector3, dtMs: number) => void;
  /** Pinch released (always, after tap/hold). */
  up?: () => void;
}

interface Live {
  key: string;
  downAt: number;
  held: boolean;
  lastMoveAt: number;
}

const handlers = new Map<string, PressHandlers>();
const lastPoint = new Map<string, Vector3>();

/** Registers handlers and makes `object` pinchable by ray and pokeable. */
export function makePressable(
  entity: Entity,
  key: string,
  h: PressHandlers,
  opts: { poke?: boolean } = {},
): void {
  handlers.set(key, h);
  entity.addComponent(Pressable, { key });
  entity.addComponent(RayInteractable);
  if (opts.poke !== false) entity.addComponent(PokeInteractable);
  const obj = entity.object3D as Object3D;
  const remember = (e: { point?: Vector3 }) => {
    if (!e.point) return;
    const v = lastPoint.get(key) ?? new Vector3();
    v.copy(e.point);
    lastPoint.set(key, v);
  };
  obj.addEventListener('pointerdown' as never, remember as never);
  obj.addEventListener('pointermove' as never, remember as never);
}

export function unregisterPressable(key: string): void {
  handlers.delete(key);
  lastPoint.delete(key);
}

export function pointFor(key: string): Vector3 | null {
  return lastPoint.get(key) ?? null;
}

/** Routes IWSDK's Pressed tag into tap / hold / drag callbacks. */
export class PressRouter extends createSystem({
  pressed: { required: [Pressable, Pressed] },
}) {
  private live = new Map<number, Live>();
  private pressTimes = new Map<string, number>();
  private prevPoint = new Map<string, Vector3>();
  private raycaster = new Raycaster();
  private rayOrigin = new Vector3();
  private rayDir = new Vector3();

  init(): void {
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (e) => {
        const key = e.getValue(Pressable, 'key') as string;
        const now = performance.now();
        this.live.set(e.index, { key, downAt: now, held: false, lastMoveAt: now });
        this.pressTimes.set(key, now);
        const p = pointFor(key);
        if (p) this.prevPoint.set(key, p.clone());
        handlers.get(key)?.down?.(p);
      }),
      this.queries.pressed.subscribe('disqualify', (e) => {
        const key = e.getValue(Pressable, 'key') as string;
        const st = this.live.get(e.index);
        this.pressTimes.set(key, performance.now());
        this.live.delete(e.index);
        this.prevPoint.delete(key);
        const h = handlers.get(key);
        if (!h || !st) return;
        if (!st.held) h.tap?.(pointFor(key));
        h.up?.();
      }),
    );
  }

  /** Includes a just-released press, until the next selection starts. */
  wasPressedSince(key: string, startedAt: number): boolean {
    if ((this.pressTimes.get(key) ?? -Infinity) >= startedAt) return true;
    for (const press of this.live.values()) if (press.key === key) return true;
    return false;
  }

  update(): void {
    if (this.live.size === 0) return;
    const now = performance.now();
    for (const e of this.queries.pressed.entities) {
      const st = this.live.get(e.index);
      if (!st) continue;
      const key = e.getValue(Pressable, 'key') as string;
      const h = handlers.get(key);
      if (!h) continue;
      if (!st.held && h.hold && now - st.downAt >= HOLD_MS) {
        st.held = true;
        h.hold();
      }
      if (h.drag) {
        const aim = this.world.getSystem(AimSystem);
        if (aim && e.object3D) {
          for (const src of ['right', 'left', 'gaze'] as const) {
            if (aim.ray(src, this.rayOrigin, this.rayDir)) {
              this.raycaster.set(this.rayOrigin, this.rayDir);
              const hits = this.raycaster.intersectObject(e.object3D, true);
              if (hits.length > 0) {
                const v = lastPoint.get(key) ?? new Vector3();
                v.copy(hits[0].point);
                lastPoint.set(key, v);
                break;
              }
            }
          }
        }
        const p = pointFor(key);
        const prev = this.prevPoint.get(key);
        if (p && prev && p.distanceToSquared(prev) > 1e-7) {
          h.drag(p, now - st.lastMoveAt);
          prev.copy(p);
          st.lastMoveAt = now;
        } else if (p && !prev) {
          this.prevPoint.set(key, p.clone());
        }
      }
    }
  }
}
