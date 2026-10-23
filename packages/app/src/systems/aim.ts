import { Matrix4, Quaternion, Vector3, createSystem } from '@iwsdk/core';
import { RoomSystem, type SurfaceInfo } from './room.js';

export type AimSource = 'right' | 'left' | 'gaze';

export interface AimHit {
  point: Vector3;
  normal: Vector3;
  info: SurfaceInfo;
  via: 'hit-test' | 'plane-raycast';
}

export interface SelectEvent {
  source: AimSource;
  startedAt: number;
  endedAt: number;
}

/**
 * Where the user is pointing: the hand ray on Quest 3 (no eye tracking), the
 * gaze ray on Meta VR Glasses. Positions come from WebXR hit-test against
 * real surfaces; if the runtime gives no hit, from a raycast against the
 * detected planes and meshes. Also turns session select events into pinches
 * with start times, so a pinch that began on a menu never places a seed.
 */
export class AimSystem extends createSystem({}) {
  private sources = new Map<XRInputSource, XRHitTestSource | 'pending' | 'failed'>();
  private hits = new Map<AimSource, AimHit | null>();
  private origin = new Vector3();
  private dir = new Vector3();
  private m = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private starts = new Map<AimSource, number>();
  private listeners = new Set<(e: SelectEvent) => void>();
  hitTestSupported = false;
  /** Hit-testing runs only while something is aiming (planting or moving). */
  enabled = false;

  init(): void {
    const onStart = () => {
      const s = this.xrManager.getSession();
      if (!s) return;
      const features = (s as XRSession & { enabledFeatures?: string[] }).enabledFeatures ?? [];
      this.hitTestSupported = features.includes('hit-test') && typeof s.requestHitTestSource === 'function';
      const sel0 = (e: XRInputSourceEvent) => this.starts.set(sourceOf(e.inputSource), performance.now());
      const sel1 = (e: XRInputSourceEvent) => {
        const src = sourceOf(e.inputSource);
        const ev = { source: src, startedAt: this.starts.get(src) ?? performance.now(), endedAt: performance.now() };
        this.listeners.forEach((l) => l(ev));
      };
      s.addEventListener('selectstart', sel0);
      s.addEventListener('select', sel1);
    };
    const onEnd = () => {
      this.sources.clear();
      this.hits.clear();
    };
    this.xrManager.addEventListener('sessionstart', onStart);
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', onStart),
      () => this.xrManager.removeEventListener('sessionend', onEnd),
    );
  }

  onSelect(fn: (e: SelectEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Gaze when a gaze source exists (Glasses), otherwise the given hand. */
  preferred(hand: 'left' | 'right'): AimSource {
    return this.hasGaze() ? 'gaze' : hand;
  }

  hasGaze(): boolean {
    const s = this.xrManager.getSession();
    if (!s) return false;
    for (const src of s.inputSources) if (src.targetRayMode === 'gaze') return true;
    return false;
  }

  hit(src: AimSource): AimHit | null {
    return this.hits.get(src) ?? null;
  }

  /** Ray origin/direction of a source this frame (for drawing the aim arc). */
  ray(src: AimSource, origin: Vector3, dir: Vector3): boolean {
    const s = this.xrManager.getSession();
    const frame = this.xrFrame;
    const ref = this.xrManager.getReferenceSpace();
    if (!s || !frame || !ref) return false;
    for (const input of s.inputSources) {
      if (sourceOf(input) !== src) continue;
      const pose = frame.getPose(input.targetRaySpace, ref);
      if (!pose) return false;
      this.m.fromArray(pose.transform.matrix);
      this.m.decompose(origin, this.q, this.s);
      dir.set(0, 0, -1).applyQuaternion(this.q);
      return true;
    }
    return false;
  }

  update(): void {
    const s = this.xrManager.getSession();
    const frame = this.xrFrame;
    const ref = this.xrManager.getReferenceSpace();
    if (!s || !frame || !ref) return;
    if (!this.enabled) return;
    const room = this.world.getSystem(RoomSystem);
    for (const input of s.inputSources) {
      const src = sourceOf(input);
      if (src !== 'left' && src !== 'right' && src !== 'gaze') continue;
      let hit: AimHit | null = null;
      if (this.hitTestSupported) {
        const hs = this.sources.get(input);
        if (hs === undefined) {
          this.sources.set(input, 'pending');
          s.requestHitTestSource!({ space: input.targetRaySpace })!
            .then((h) => this.sources.set(input, h))
            .catch(() => this.sources.set(input, 'failed'));
        } else if (hs !== 'pending' && hs !== 'failed') {
          const results = frame.getHitTestResults(hs);
          const pose = results[0]?.getPose(ref);
          if (pose) {
            this.m.fromArray(pose.transform.matrix);
            const point = new Vector3();
            this.m.decompose(point, this.q, this.s);
            const normal = new Vector3(0, 1, 0).applyQuaternion(this.q);
            hit = { point, normal, info: room?.classify(point, normal) ?? { label: 'surface', surface: 'other', source: 'orientation' }, via: 'hit-test' };
          }
        }
      }
      if (!hit && room && this.ray(src, this.origin, this.dir)) {
        const r = room.raycast(this.origin, this.dir);
        if (r) hit = { ...r, info: room.classify(r.point, r.normal), via: 'plane-raycast' };
      }
      this.hits.set(src, hit);
    }
  }
}

function sourceOf(input: XRInputSource): AimSource {
  if (input.targetRayMode === 'gaze') return 'gaze';
  return input.handedness === 'left' ? 'left' : 'right';
}
