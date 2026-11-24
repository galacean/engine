import { Vector3, type Vector3Like } from "@galacean/engine-math";

/** Validate the whole input before replacing the direction snapshot. */
export function normalizeDirection(current: Vector3, value: Readonly<Vector3Like>, property: string): Vector3 {
  let { x, y, z } = value;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length)) {
    throw new Error(`${property} must be finite.`);
  }
  if (length === 0) return current;

  x /= length;
  y /= length;
  z /= length;
  return x === current.x && y === current.y && z === current.z ? current : new Vector3(x, y, z);
}
