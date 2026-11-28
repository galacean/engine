import type { BoundingBox } from "@galacean/engine";

/** Flat meshes are valid; empty, inverted, non-finite and point-only bounds cannot be framed. */
export function isUsableBounds({ min, max }: BoundingBox): boolean {
  return (
    [min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) &&
    max.x >= min.x &&
    max.y >= min.y &&
    max.z >= min.z &&
    (max.x > min.x || max.y > min.y || max.z > min.z)
  );
}
