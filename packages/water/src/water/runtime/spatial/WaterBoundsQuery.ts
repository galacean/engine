import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";

export function assertWaterQueryBounds(b: WaterBoundsXZ): void {
  if (![b.minX, b.minZ, b.maxX, b.maxZ].every(Number.isFinite) || b.minX > b.maxX || b.minZ > b.maxZ)
    throw new Error("Invalid Water query bounds");
}

/** Euclidean distance from a segment to a closed axis-aligned rectangle. */
export function segmentWaterBoundsDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  bounds: WaterBoundsXZ
): number {
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [ax, bx - ax, bounds.minX, bounds.maxX],
    [az, bz - az, bounds.minZ, bounds.maxZ]
  ]) {
    if (delta === 0) {
      if (start < min || start > max) {
        high = -1;
        break;
      }
    } else {
      const a = (min - start) / delta,
        b = (max - start) / delta;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
  }
  if (low <= high) return 0;
  const pointDistance = (x: number, z: number) =>
    Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX), Math.max(bounds.minZ - z, 0, z - bounds.maxZ));
  let distance = Math.min(pointDistance(ax, az), pointDistance(bx, bz));
  const dx = bx - ax,
    dz = bz - az,
    length = dx * dx + dz * dz;
  for (const x of [bounds.minX, bounds.maxX])
    for (const z of [bounds.minZ, bounds.maxZ]) {
      const t = length > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
      distance = Math.min(distance, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
  return distance;
}

/** Includes boundaries; also works for concave polygons. */
export function polygonWaterBoundsOverlap(
  points: readonly (readonly [number, number])[],
  bounds: WaterBoundsXZ
): boolean {
  let inside = false;
  const x = bounds.minX,
    z = bounds.minZ;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (segmentWaterBoundsDistance(a[0], a[1], b[0], b[1], bounds) === 0) return true;
    if (a[1] > z !== b[1] > z && x < a[0] + ((z - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) inside = !inside;
  }
  return inside;
}
