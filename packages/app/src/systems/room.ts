import type { SurfaceKind } from '@mebae/core';
import {
  type Entity,
  Matrix4,
  Mesh,
  Object3D,
  Raycaster,
  Vector3,
  XRMesh,
  XRPlane,
  createSystem,
} from '@iwsdk/core';

export interface SurfaceInfo {
  label: string;
  surface: SurfaceKind;
  /** Where the label came from, shown in debug and asserted in e2e. */
  source: 'mesh-label' | 'plane-label' | 'orientation';
}

export interface DeskSurface {
  center: Vector3;
  /** Top height in metres. */
  y: number;
  label: string;
  /** Half extents in world X/Z (axis aligned approximation). */
  halfX: number;
  halfZ: number;
}

const TABLE_LIKE = ['desk', 'table', 'counter', 'kitchen counter'];

/**
 * Reads IWSDK's XRPlane / XRMesh entities. Quest planes have no reliable
 * label, so a surface is named by an XRMesh semantic label when the point is
 * inside a labelled mesh's box, then by the plane's label when the runtime
 * gives one, and otherwise by orientation and height.
 */
export class RoomSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  private inv = new Matrix4();
  private local = new Vector3();
  private ray = new Raycaster();
  private targets: Object3D[] = [];

  get planeCount(): number {
    return this.queries.planes.entities.size;
  }
  get meshCount(): number {
    return this.queries.meshes.entities.size;
  }

  classify(point: Vector3, normal: Vector3): SurfaceInfo {
    // 1. labelled bounded meshes (furniture)
    let best: { label: string; vol: number } | null = null;
    for (const e of this.queries.meshes.entities) {
      if (!e.getValue(XRMesh, 'isBounded3D')) continue;
      const label = String(e.getValue(XRMesh, 'semanticLabel') ?? '');
      if (!label || label === 'global mesh') continue;
      const obj = e.object3D;
      if (!obj) continue;
      const min = e.getVectorView(XRMesh, 'min');
      const max = e.getVectorView(XRMesh, 'max');
      obj.updateMatrixWorld();
      this.local.copy(point).applyMatrix4(this.inv.copy(obj.matrixWorld).invert());
      const m = 0.04;
      if (
        this.local.x >= min[0] - m && this.local.x <= max[0] + m &&
        this.local.y >= min[1] - m && this.local.y <= max[1] + m &&
        this.local.z >= min[2] - m && this.local.z <= max[2] + m
      ) {
        const vol = (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]);
        if (!best || vol < best.vol) best = { label, vol };
      }
    }
    const kind = kindFrom(normal, point.y);
    if (best) return { label: best.label, surface: kindForLabel(best.label, kind), source: 'mesh-label' };
    // 2. a plane label, when the runtime provides one (the smallest matching
    // plane wins, so a door beats the wall it sits in)
    let bestPlane: { label: string; area: number } | null = null;
    for (const e of this.queries.planes.entities) {
      const plane = e.getValue(XRPlane, '_plane') as XRPlane & { semanticLabel?: string };
      const obj = e.object3D;
      if (!plane || !obj) continue;
      obj.updateMatrixWorld();
      this.local.copy(point).applyMatrix4(this.inv.copy(obj.matrixWorld).invert());
      if (Math.abs(this.local.y) > 0.03) continue;
      if (!insidePolygon(this.local.x, this.local.z, plane.polygon)) continue;
      const label = plane.semanticLabel;
      if (!label || label === 'other') continue;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const q of plane.polygon) {
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
        minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z);
      }
      const area = (maxX - minX) * (maxZ - minZ);
      if (!bestPlane || area < bestPlane.area) bestPlane = { label, area };
    }
    if (bestPlane) return { label: bestPlane.label, surface: kindForLabel(bestPlane.label, kind), source: 'plane-label' };
    // 3. orientation + height
    return { label: nameFor(kind, point.y), surface: kind, source: 'orientation' };
  }

  /** Nearest desk/table-like top within `reach` metres (horizontal) of `from`. */
  findDesk(from: Vector3, reach = 1.1): DeskSurface | null {
    let best: DeskSurface | null = null;
    let bestD = Infinity;
    const consider = (center: Vector3, y: number, label: string, hx: number, hz: number) => {
      // distance from the viewer to the nearest point of the top
      const dx = Math.max(0, Math.abs(from.x - center.x) - hx);
      const dz = Math.max(0, Math.abs(from.z - center.z) - hz);
      const d = Math.hypot(dx, dz);
      if (d <= reach && d < bestD) {
        bestD = d;
        best = { center: center.clone(), y, label, halfX: hx, halfZ: hz };
      }
    };
    for (const e of this.queries.meshes.entities) {
      const label = String(e.getValue(XRMesh, 'semanticLabel') ?? '');
      if (!TABLE_LIKE.includes(label) || !e.object3D) continue;
      const min = e.getVectorView(XRMesh, 'min');
      const max = e.getVectorView(XRMesh, 'max');
      const o = e.object3D;
      o.updateMatrixWorld();
      const c = new Vector3((min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2).applyMatrix4(o.matrixWorld);
      const hx = (max[0] - min[0]) / 2;
      const hz = (max[2] - min[2]) / 2;
      // mesh yaw may swap extents; use the larger as a safe x/z bound
      consider(c, c.y, label, Math.max(hx, hz) * 0.9, Math.min(hx, hz) * 0.9);
    }
    if (!best) {
      for (const e of this.queries.planes.entities) {
        const plane = e.getValue(XRPlane, '_plane') as XRPlane & { semanticLabel?: string };
        const o = e.object3D;
        if (!plane || !o || plane.orientation !== 'horizontal') continue;
        o.updateMatrixWorld();
        const c = new Vector3().setFromMatrixPosition(o.matrixWorld);
        if (c.y < 0.55 || c.y > 1.15) continue;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of plane.polygon) {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        }
        consider(c, c.y, plane.semanticLabel || 'table', (maxX - minX) / 2, (maxZ - minZ) / 2);
      }
    }
    return best;
  }

  /**
   * Fallback when hit-test gives nothing: raycast the detected plane and mesh
   * geometry (real surfaces from the room scan, never invented ones).
   */
  raycast(origin: Vector3, dir: Vector3, max = 8): { point: Vector3; normal: Vector3 } | null {
    this.targets.length = 0;
    const push = (e: Entity) => {
      const o = e.object3D;
      if (o instanceof Mesh) this.targets.push(o);
    };
    this.queries.planes.entities.forEach(push);
    this.queries.meshes.entities.forEach((e) => {
      if (e.getValue(XRMesh, 'isBounded3D') || String(e.getValue(XRMesh, 'semanticLabel')) === 'global mesh') push(e);
    });
    this.ray.set(origin, dir);
    this.ray.far = max;
    const hits = this.ray.intersectObjects(this.targets, false);
    const h = hits[0];
    if (!h || !h.face) return null;
    const normal = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (normal.dot(dir) > 0) normal.negate();
    return { point: h.point.clone(), normal };
  }
}

function insidePolygon(x: number, z: number, poly: DOMPointReadOnly[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi) inside = !inside;
  }
  return inside;
}

export function kindFrom(normal: Vector3, y: number): SurfaceKind {
  if (normal.y > 0.75) return y < 0.25 ? 'floor' : 'table';
  if (normal.y < -0.75) return 'ceiling';
  if (Math.abs(normal.y) < 0.35) return 'wall';
  return 'other';
}

function kindForLabel(label: string, fallback: SurfaceKind): SurfaceKind {
  if (['wall', 'door', 'window', 'wall art', 'screen'].includes(label)) return 'wall';
  if (label === 'floor') return 'floor';
  if (label === 'ceiling') return 'ceiling';
  return fallback === 'wall' ? 'wall' : fallback === 'ceiling' ? 'ceiling' : fallback === 'floor' ? 'floor' : 'table';
}

function nameFor(kind: SurfaceKind, y: number): string {
  if (kind === 'table') return y > 1.3 ? 'shelf' : 'surface';
  return kind;
}
