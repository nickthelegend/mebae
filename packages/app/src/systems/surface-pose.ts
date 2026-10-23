import { Matrix4, Quaternion, Vector3 } from '@iwsdk/core';

const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();

/**
 * Orientation for something rooted on a surface: local +Y along the surface
 * normal, local +Z turned toward the viewer (so labels and leaves face you).
 */
export function surfaceQuaternion(normal: Vector3, point: Vector3, viewer: Vector3, out: Quaternion): Quaternion {
  _y.copy(normal).normalize();
  _z.subVectors(viewer, point);
  _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}
