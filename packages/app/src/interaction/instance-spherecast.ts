import { type InstancedMesh, type Intersection, Matrix4, Quaternion, Vector3 } from '@iwsdk/core';

/**
 * The poke intersector sphere-tests an InstancedMesh as one mesh and ignores
 * instance matrices. Geometry authored at unit size then fills about a metre
 * around the mesh origin, so a fingertip anywhere in that volume is a poke
 * (distance 0). Touch outranks the ray, and the pinch never reaches the mesh
 * the ray is actually hitting. Test each instance's own bounding sphere.
 */
type SphereLike = { center: Vector3; radius: number };
type Hit = Intersection & {
  pointOnFace: Vector3;
  object: InstancedMesh;
  instanceId: number;
  normal: Vector3;
};

const matrix = new Matrix4();
const quaternion = new Quaternion();
const center = new Vector3();
const scale = new Vector3();
const toward = new Vector3();

export function bindInstanceSpherecast(mesh: InstancedMesh): void {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  const geoRadius = mesh.geometry.boundingSphere?.radius ?? 0;
  const spherecast = (pointerSphere: SphereLike, target: Intersection[]) => {
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      mesh.getMatrixAt(i, matrix);
      matrix.premultiply(mesh.matrixWorld);
      matrix.decompose(center, quaternion, scale);
      const radius = geoRadius * Math.max(scale.x, scale.y, scale.z);
      const dist = pointerSphere.center.distanceTo(center);
      const surface = dist - radius;
      if (surface > pointerSphere.radius) continue;
      const point = center.clone();
      let normal: Vector3;
      if (dist > 1e-8) {
        toward.copy(pointerSphere.center).sub(center);
        point.addScaledVector(toward, Math.min(radius, dist) / dist);
        normal = toward.clone().multiplyScalar(1 / dist);
      } else {
        normal = new Vector3(0, 1, 0);
      }
      const hit: Hit = {
        distance: Math.max(0, surface),
        point,
        pointOnFace: point.clone(),
        object: mesh,
        instanceId: i,
        normal,
        face: { normal, a: 0, b: 0, c: 0, materialIndex: 0 },
      };
      target.push(hit);
    }
  };
  mesh.spherecast = spherecast;
}
