import { Vector3, Matrix, Quaternion } from "@alipay/o3-math";

export function transformDirection(out: Vector3, a: Vector3, m: Matrix): Vector3 {
  const { x, y, z } = a;
  const me = m.elements;
  out.x = x * me[0] + y * me[4] + z * me[8];
  out.y = x * me[1] + y * me[5] + z * me[9];
  out.z = x * me[2] + y * me[6] + z * me[10];

  out.normalize();
  return out;
}

export function fromBufferAttribute(attribute, index, size = 3): Vector3 {
  return new Vector3(attribute[index * size], attribute[index * size + 1], attribute[index * size + 2]);
}

export function getNormal(a: Vector3, b: Vector3, c: Vector3) {
  const normal: Vector3 = new Vector3();
  const v0: Vector3 = new Vector3();
  const v1: Vector3 = new Vector3();

  Vector3.subtract(c, b, v0);
  Vector3.subtract(a, b, v1);
  Vector3.cross(v0, v1, normal);
  return normal.normalize();
}

export function distanceTo(a: Vector3, b: Vector3) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function setPosition(out: Matrix, v: Vector3) {
  const oe = out.elements;
  oe[12] = v.x;
  oe[13] = v.y;
  oe[14] = v.z;

  return out;
}

export function makeRotationFromQuaternion(q: Quaternion): Matrix {
  const out = new Matrix();
  Matrix.fromQuat(q, out);
  return out;
}
