import { PERSISTENT_ANCHORS_PER_SITE, TRAY_ANCHORS, type RestoreOutcome, activeHabits, planRestore } from '@mebae/core';
import { Matrix4, Quaternion, Vector3, createSystem } from '@iwsdk/core';
import { garden } from '../state/garden.js';

type PersistentSession = XRSession & {
  restorePersistentAnchor?: (uuid: string) => Promise<XRAnchor>;
  deletePersistentAnchor?: (uuid: string) => Promise<void>;
};
type PersistentAnchor = XRAnchor & { requestPersistentHandle?: () => Promise<string> };

export interface AnchorPose {
  position: Vector3;
  quaternion: Quaternion;
}

/**
 * One XRAnchor per habit (6 max) plus IWSDK's own scene anchor for the tray:
 * 7 of the 8 persistent anchors Meta allows per site. Restores at session
 * start; a habit whose anchor does not come back goes to "Pin again" and is
 * never drawn at a guessed position.
 */
export class AnchorSystem extends createSystem({}) {
  private anchors = new Map<string, XRAnchor>();
  private poses = new Map<string, AnchorPose>();
  private mat = new Matrix4();
  private scratchS = new Vector3();
  /** null until the restore pass for this session finished. */
  outcomes: RestoreOutcome[] | null = null;
  persistentSupported = false;
  anchorsSupported = false;
  private pendingCreate: { habitId: string; p: Vector3; q: Quaternion; resolve: (uuid: string | null) => void; reject: (e: Error) => void }[] = [];
  private creating = 0;

  init(): void {
    const start = () => void this.onSessionStart();
    const end = () => {
      for (const j of this.pendingCreate.splice(0)) j.reject(new Error('The immersive session ended before the spot was pinned.'));
      this.anchors.clear();
      this.poses.clear();
      this.outcomes = null;
      garden.bump();
    };
    this.xrManager.addEventListener('sessionstart', start);
    this.xrManager.addEventListener('sessionend', end);
    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', start),
      () => this.xrManager.removeEventListener('sessionend', end),
    );
  }

  private get session(): PersistentSession | null {
    return (this.xrManager.getSession() as PersistentSession | null) ?? null;
  }

  private async onSessionStart(): Promise<void> {
    while (!garden.loaded) await new Promise((r) => setTimeout(r, 50));
    const s = this.session;
    if (!s) return;
    const features = (s as XRSession & { enabledFeatures?: string[] }).enabledFeatures ?? [];
    this.anchorsSupported = features.includes('anchors');
    this.persistentSupported = typeof s.restorePersistentAnchor === 'function';
    const results = new Map<string, { ok: true } | { ok: false; reason: string }>();
    if (!this.anchorsSupported) {
      garden.say('This browser did not grant anchors, so sprouts cannot be pinned. Setup required: Quest Browser with spatial data allowed.', 'error');
    }
    for (const h of activeHabits(garden.real)) {
      const uuid = h.placement?.anchorUuid;
      if (!uuid) continue;
      if (!this.persistentSupported) {
        results.set(h.id, { ok: false, reason: 'This browser cannot restore persistent anchors.' });
        continue;
      }
      try {
        const a = await withTimeout(s.restorePersistentAnchor!(uuid), 6000, 'restore timed out');
        this.anchors.set(h.id, a);
        results.set(h.id, { ok: true });
      } catch (e) {
        results.set(h.id, { ok: false, reason: `Anchor not found in this space (${(e as Error).message || 'rejected'}).` });
      }
    }
    this.outcomes = planRestore(garden.real, results);
    const lost = this.outcomes.filter((o) => o.status === 'pin-again' && garden.real.habits.find((h) => h.id === o.habitId)?.placement);
    if (lost.length) garden.say(`${lost.length} sprout${lost.length > 1 ? 's' : ''} could not find ${lost.length > 1 ? 'their' : 'its'} spot. They wait in the tray: pinch "Pin again".`);
    garden.bump();
  }

  /** Creates (and tries to persist) an anchor at a world pose. */
  create(habitId: string, p: Vector3, q: Quaternion): Promise<string | null> {
    if (!this.session) return Promise.reject(new Error('Enter your garden before pinning a spot.'));
    if (this.anchors.size + this.pendingCreate.length + this.creating + TRAY_ANCHORS >= PERSISTENT_ANCHORS_PER_SITE)
      return Promise.reject(new Error('All 8 anchor slots are reserved. Wait for the current move to finish.'));
    return new Promise((resolve, reject) => {
      this.pendingCreate.push({ habitId, p: p.clone(), q: q.clone(), resolve, reject });
    });
  }

  /** Deletes a habit's anchor and its persistent handle. */
  async remove(habitId: string, uuid: string | null): Promise<void> {
    const a = this.anchors.get(habitId);
    this.anchors.delete(habitId);
    this.poses.delete(habitId);
    const s = this.session;
    try {
      if (uuid && s?.deletePersistentAnchor) await s.deletePersistentAnchor(uuid);
      a?.delete();
    } catch (e) {
      console.warn(`[mebae] could not delete anchor ${uuid}: ${(e as Error).message}`);
    }
  }

  /** Re-keys an anchor created under a temporary id. */
  rename(from: string, to: string): void {
    const a = this.anchors.get(from);
    const p = this.poses.get(from);
    if (a) {
      this.anchors.delete(from);
      this.anchors.set(to, a);
    }
    if (p) {
      this.poses.delete(from);
      this.poses.set(to, p);
    }
    if (this.outcomes) this.outcomes = this.outcomes.filter((o) => o.habitId !== to).concat({ habitId: to, status: 'restored' });
  }

  /** After a successful re-pin the habit is placed again. */
  markPlaced(habitId: string): void {
    if (this.outcomes) this.outcomes = this.outcomes.filter((o) => o.habitId !== habitId).concat({ habitId, status: 'restored' });
  }

  outcomeFor(habitId: string): RestoreOutcome | undefined {
    return this.outcomes?.find((o) => o.habitId === habitId);
  }

  hasAnchor(habitId: string): boolean {
    return this.anchors.has(habitId);
  }

  pose(habitId: string): AnchorPose | undefined {
    return this.poses.get(habitId);
  }

  get count(): number {
    return this.anchors.size;
  }

  update(): void {
    const frame = this.xrFrame;
    const ref = this.xrManager.getReferenceSpace();
    if (!frame || !ref) return;
    if (this.pendingCreate.length) {
      const jobs = this.pendingCreate.splice(0);
      for (const j of jobs) void this.doCreate(frame, ref, j);
    }
    for (const [id, a] of this.anchors) {
      let pose: XRPose | undefined;
      try {
        pose = frame.getPose(a.anchorSpace, ref) ?? undefined;
      } catch {
        pose = undefined;
      }
      if (!pose) continue;
      let p = this.poses.get(id);
      if (!p) {
        p = { position: new Vector3(), quaternion: new Quaternion() };
        this.poses.set(id, p);
      }
      this.mat.fromArray(pose.transform.matrix);
      this.mat.decompose(p.position, p.quaternion, this.scratchS);
    }
  }

  private async doCreate(
    frame: XRFrame,
    ref: XRReferenceSpace,
    j: { habitId: string; p: Vector3; q: Quaternion; resolve: (uuid: string | null) => void; reject: (e: Error) => void },
  ): Promise<void> {
    if (!frame.createAnchor) {
      j.reject(new Error('This browser cannot create anchors (XRFrame.createAnchor missing).'));
      return;
    }
    const session = this.session;
    this.creating++;
    try {
      const t = new XRRigidTransform(
        { x: j.p.x, y: j.p.y, z: j.p.z },
        { x: j.q.x, y: j.q.y, z: j.q.z, w: j.q.w },
      );
      const a = (await frame.createAnchor(t, ref)) as PersistentAnchor;
      if (!a) throw new Error('createAnchor returned nothing');
      if (this.session !== session) {
        a.delete();
        throw new Error('The immersive session ended while pinning.');
      }
      this.anchors.set(j.habitId, a);
      this.poses.set(j.habitId, { position: j.p.clone(), quaternion: j.q.clone() });
      let uuid: string | null = null;
      if (a.requestPersistentHandle) {
        try {
          uuid = await a.requestPersistentHandle();
        } catch (e) {
          console.warn(`[mebae] persistent handle refused: ${(e as Error).message}`);
        }
      }
      j.resolve(uuid);
    } catch (e) {
      j.reject(new Error(`Anchor not created: ${(e as Error).message}`));
    } finally {
      this.creating--;
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
