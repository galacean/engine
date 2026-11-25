import { Quaternion, Vector3, type Vector3Like } from "@galacean/engine-math";

/**
 * @internal
 */
export class PhysicsUtils {
  /** Compare positions submitted directly as native Float32 vectors. */
  static differsF32(a: Vector3, b: Vector3): boolean {
    return (
      PhysicsUtils._componentDiffersF32(a.x, b.x) ||
      PhysicsUtils._componentDiffersF32(a.y, b.y) ||
      PhysicsUtils._componentDiffersF32(a.z, b.z)
    );
  }

  /** Compare orientations after the same normalization and Float32 conversion as the native pose. */
  static rotationDiffersF32(a: Quaternion, b: Quaternion): boolean {
    if (a.x === b.x && a.y === b.y && a.z === b.z && a.w === b.w) return false;
    const scaleA = 1 / a.length();
    const scaleB = (Quaternion.dot(a, b) < 0 ? -1 : 1) / b.length();
    return (
      PhysicsUtils._componentDiffersF32(a.x * scaleA, b.x * scaleB) ||
      PhysicsUtils._componentDiffersF32(a.y * scaleA, b.y * scaleB) ||
      PhysicsUtils._componentDiffersF32(a.z * scaleA, b.z * scaleB) ||
      PhysicsUtils._componentDiffersF32(a.w * scaleA, b.w * scaleB)
    );
  }

  /** Whether the value is a positive, normal, finite Float32 extent safe for native physics geometry. */
  static isValidPositiveFloat32(value: number): boolean {
    const f = Math.fround(value);
    return f >= 1.17549435e-38 && Number.isFinite(f);
  }

  /** Validate that a scalar parameter is finite and clamp negative values to 0. */
  static clampNonNegative(value: number, property: string): number {
    if (!Number.isFinite(value)) {
      throw new Error(`${property} must be finite.`);
    }
    return Math.max(0, value);
  }

  /** Validate the whole input before replacing a unit direction snapshot. */
  static normalizeDirection(current: Vector3, value: Readonly<Vector3Like>, property: string): Vector3 {
    let { x, y, z } = value;
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(length)) {
      throw new Error(`${property} must be finite.`);
    }
    if (length === 0) return current;

    x /= length;
    y /= length;
    z /= length;
    return x === current.x && y === current.y && z === current.z ? current : Object.freeze(new Vector3(x, y, z));
  }

  private static _componentDiffersF32(a: number, b: number): boolean {
    return a !== b && Math.fround(a) !== Math.fround(b);
  }
}
