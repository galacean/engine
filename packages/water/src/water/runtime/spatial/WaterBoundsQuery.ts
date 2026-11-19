import type { WaterBoundsXZ } from "../body/WaterBodyRuntime";

export function assertWaterQueryBounds(b: WaterBoundsXZ): void {
  if (
    !Number.isFinite(b.minX) ||
    !Number.isFinite(b.minZ) ||
    !Number.isFinite(b.maxX) ||
    !Number.isFinite(b.maxZ) ||
    b.minX > b.maxX ||
    b.minZ > b.maxZ
  )
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
  const minX = bounds.minX,
    maxX = bounds.maxX,
    minZ = bounds.minZ,
    maxZ = bounds.maxZ;
  const dx = bx - ax,
    dz = bz - az;
  let low = 0,
    high = 1;
  if (dx === 0) {
    if (ax < minX || ax > maxX) high = -1;
  } else {
    const a = (minX - ax) / dx,
      b = (maxX - ax) / dx;
    low = Math.max(low, Math.min(a, b));
    high = Math.min(high, Math.max(a, b));
  }
  if (low <= high) {
    if (dz === 0) {
      if (az < minZ || az > maxZ) high = -1;
    } else {
      const a = (minZ - az) / dz,
        b = (maxZ - az) / dz;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
    }
  }
  if (low <= high) return 0;
  let distance = Math.min(
    Math.hypot(Math.max(minX - ax, 0, ax - maxX), Math.max(minZ - az, 0, az - maxZ)),
    Math.hypot(Math.max(minX - bx, 0, bx - maxX), Math.max(minZ - bz, 0, bz - maxZ))
  );
  const length = dx * dx + dz * dz;
  for (let cx = 0; cx < 2; cx++) {
    const x = cx === 0 ? minX : maxX;
    for (let cz = 0; cz < 2; cz++) {
      const z = cz === 0 ? minZ : maxZ;
      const t = length > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
      const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
      if (d < distance) distance = d;
    }
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
