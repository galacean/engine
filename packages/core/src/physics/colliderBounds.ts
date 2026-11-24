import type { BoundingBox, Quaternion, Vector3 } from "@galacean/engine-math";

export function setBounds(
  out: BoundingBox,
  center: Vector3,
  extentX: number,
  extentY: number,
  extentZ: number
): boolean {
  const { x, y, z } = center;
  const minX = x - extentX;
  const minY = y - extentY;
  const minZ = z - extentZ;
  const maxX = x + extentX;
  const maxY = y + extentY;
  const maxZ = z + extentZ;
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY) ||
    !Number.isFinite(maxZ)
  ) {
    return false;
  }
  out.min.set(minX, minY, minZ);
  out.max.set(maxX, maxY, maxZ);
  return true;
}

export function setRotatedBounds(
  out: BoundingBox,
  center: Vector3,
  rotation: Quaternion,
  halfX: number,
  halfY: number,
  halfZ: number
): boolean {
  const { x, y, z, w } = rotation;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = y * x2;
  const xz = z * x2;
  const yy = y * y2;
  const yz = z * y2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  // Each world extent is the projection of the three local half-extents onto that axis.
  return setBounds(
    out,
    center,
    Math.abs(1 - yy - zz) * halfX + Math.abs(xy - wz) * halfY + Math.abs(xz + wy) * halfZ,
    Math.abs(xy + wz) * halfX + Math.abs(1 - xx - zz) * halfY + Math.abs(yz - wx) * halfZ,
    Math.abs(xz - wy) * halfX + Math.abs(yz + wx) * halfY + Math.abs(1 - xx - yy) * halfZ
  );
}

export function setCapsuleBounds(
  out: BoundingBox,
  center: Vector3,
  axis: Vector3,
  radius: number,
  halfHeight: number
): boolean {
  return setBounds(
    out,
    center,
    radius + Math.abs(axis.x) * halfHeight,
    radius + Math.abs(axis.y) * halfHeight,
    radius + Math.abs(axis.z) * halfHeight
  );
}
