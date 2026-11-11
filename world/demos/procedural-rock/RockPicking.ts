/** A triangulated rock in the same coordinate space as the picking ray. */
interface RockRaySurface {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  bounds: [number[], number[]];
}

interface RayVector {
  x: number;
  y: number;
  z: number;
}

/**
 * Intersect both sides of the rock's triangles, after an inclusive bounds test.
 * @param surface - Indexed positions and bounds, usually in world space.
 * @param origin - Ray origin in the surface's coordinate space.
 * @param direction - Ray direction; normalize it to return world-space distance.
 * @returns The nearest nonnegative ray parameter, or Infinity when no face is hit.
 */
export function intersectRockRay(surface: RockRaySurface, origin: RayVector, direction: RayVector): number {
  const { x: ox, y: oy, z: oz } = origin;
  const { x: dx, y: dy, z: dz } = direction;
  const directionLengthSquared = dx * dx + dy * dy + dz * dz;
  if (!(directionLengthSquared > 0) || !Number.isFinite(directionLengthSquared)) return Infinity;

  let near = 0;
  let far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? ox : axis === 1 ? oy : oz;
    const d = axis === 0 ? dx : axis === 1 ? dy : dz;
    const min = surface.bounds[0][axis];
    const max = surface.bounds[1][axis];
    // A parallel ray on a slab boundary is valid; avoid 0 * Infinity here.
    if (d === 0) {
      if (o < min || o > max) return Infinity;
      continue;
    }
    const t0 = (min - o) / d;
    const t1 = (max - o) / d;
    near = Math.max(near, Math.min(t0, t1));
    far = Math.min(far, Math.max(t0, t1));
    if (near > far) return Infinity;
  }

  const { positions, indices } = surface;
  const edgeTolerance = 1e-10;
  let closest = Infinity;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const ax = positions[a],
      ay = positions[a + 1],
      az = positions[a + 2];
    const e1x = positions[b] - ax,
      e1y = positions[b + 1] - ay,
      e1z = positions[b + 2] - az;
    const e2x = positions[c] - ax,
      e2y = positions[c + 1] - ay,
      e2z = positions[c + 2] - az;
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const determinant = e1x * px + e1y * py + e1z * pz;
    const e1LengthSquared = e1x * e1x + e1y * e1y + e1z * e1z;
    const e2LengthSquared = e2x * e2x + e2y * e2y + e2z * e2z;
    // Relative tolerance handles differently sized rocks without backface culling.
    if (determinant * determinant <= 1e-24 * e1LengthSquared * e2LengthSquared * directionLengthSquared) continue;
    const inverseDeterminant = 1 / determinant;
    const tx = ox - ax,
      ty = oy - ay,
      tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inverseDeterminant;
    if (u < -edgeTolerance || u > 1 + edgeTolerance) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inverseDeterminant;
    if (v < -edgeTolerance || u + v > 1 + edgeTolerance) continue;
    const distance = (e2x * qx + e2y * qy + e2z * qz) * inverseDeterminant;
    if (distance >= 0 && distance < closest) closest = distance;
  }
  return closest;
}
