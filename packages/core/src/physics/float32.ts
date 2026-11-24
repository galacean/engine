import { Quaternion, Vector3 } from "@galacean/engine-math";

function componentDiffersF32(a: number, b: number): boolean {
  return a !== b && Math.fround(a) !== Math.fround(b);
}

/** Compare positions submitted directly as native Float32 vectors. */
export function differsF32(a: Vector3, b: Vector3): boolean {
  return componentDiffersF32(a.x, b.x) || componentDiffersF32(a.y, b.y) || componentDiffersF32(a.z, b.z);
}

/** Compare rotations submitted directly as native Float32 quaternions. */
export function rotationDiffersF32(a: Quaternion, b: Quaternion): boolean {
  return (
    componentDiffersF32(a.x, b.x) ||
    componentDiffersF32(a.y, b.y) ||
    componentDiffersF32(a.z, b.z) ||
    componentDiffersF32(a.w, b.w)
  );
}

/** Whether the value is a positive, normal, finite Float32 extent safe for native physics geometry. */
export function isValidPositiveFloat32(value: number): boolean {
  const f = Math.fround(value);
  return f >= 1.17549435e-38 && Number.isFinite(f);
}

export function clampNonNegativeDimension(value: number, property: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${property} must be finite.`);
  }
  return Math.max(0, value);
}
