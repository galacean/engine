import { Vector3 } from "@galacean/engine-math";

export type ReadonlyDirection = Readonly<Pick<Vector3, "x" | "y" | "z">>;

export function directionSnapshot(x: number, y: number, z: number): Vector3 {
  const direction = new Vector3(x, y, z);
  Object.freeze(direction);
  return direction;
}

/** Validate the whole input before replacing the immutable direction. */
export function normalizeDirection(current: Vector3, value: ReadonlyDirection, property: string): Vector3 {
  let { x, y, z } = value;
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length)) {
    throw new Error(`${property} must be finite.`);
  }
  if (length === 0) return current;

  x /= length;
  y /= length;
  z /= length;
  return x === current.x && y === current.y && z === current.z ? current : directionSnapshot(x, y, z);
}
