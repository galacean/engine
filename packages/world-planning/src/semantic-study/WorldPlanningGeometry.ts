import type { PlanPoint } from "./IslandPlanModel";
import { pointInPolygon } from "../geometry/V2Geometry";
/** Euclidean distance to a closed line segment. */
export function segmentGap(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const x = b.x - a.x,
    z = b.z - a.z,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / (x * x + z * z || 1)));
  return Math.hypot(p.x - a.x - t * x, p.z - a.z - t * z);
}
/** Inclusive point containment with a numerical boundary tolerance. */
export function inRing(p: PlanPoint, r: PlanPoint[], epsilon = 0.01): boolean {
  return pointInPolygon(p, r) || r.some((a, i) => segmentGap(p, a, r[(i + 1) % r.length]) <= epsilon);
}
/** Detect proper segment crossings, excluding mere boundary contact. */
export function crosses(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint): boolean {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.z, b.z) < Math.min(c.z, d.z) ||
    Math.max(c.z, d.z) < Math.min(a.z, b.z)
  )
    return false;
  const side = (a: PlanPoint, b: PlanPoint, c: PlanPoint) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  return side(a, b, c) * side(a, b, d) < -1e-8 && side(c, d, a) * side(c, d, b) < -1e-8;
}
/** Actual polygon intersection; organization envelopes must not be passed as solids. */
export function overlap(a: PlanPoint[], b: PlanPoint[]): boolean {
  if (!boundsOverlap(polygonBounds(a), polygonBounds(b))) return false;
  return (
    a.some((p) => pointInPolygon(p, b)) ||
    b.some((p) => pointInPolygon(p, a)) ||
    a.some((p, i) => b.some((q, j) => crosses(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])))
  );
}
/** Full boundary containment catches edges crossing a concave parent's boundary. */
export function contains(outer: PlanPoint[], inner: PlanPoint[]): boolean {
  return (
    inner.every((p) => inRing(p, outer)) &&
    !inner.some((p, i) =>
      outer.some((q, j) => crosses(p, inner[(i + 1) % inner.length], q, outer[(j + 1) % outer.length]))
    )
  );
}
/** Signed-independent polygon area in square metres. */
export function ringArea(r: PlanPoint[]): number {
  return Math.abs(r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length].z - p.z * r[(i + 1) % r.length].x, 0)) / 2;
}
/** True polygon-boundary distance, zero inside. */
export function ringGap(p: PlanPoint, r: PlanPoint[]): number {
  return inRing(p, r) ? 0 : Math.min(...r.map((a, i) => segmentGap(p, a, r[(i + 1) % r.length])));
}
/** Check final contour validity without relying on the generator's status. */
export function validRing(r: PlanPoint[]): boolean {
  if (
    !(
      r.length >= 3 &&
      ringArea(r) > 1 &&
      r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z) && p.x >= 0 && p.z >= 0 && p.x <= 2048 && p.z <= 2048)
    )
  )
    return false;
  return !firstRingCrossing(r);
}

/** Sweep only overlapping edge bounds; preserve the original lexicographic cut order. */
export function firstRingCrossing(r: PlanPoint[]): [number, number] | undefined {
  // Sweep along the dominant boundary axis. Tall, narrow roads
  // otherwise keep almost their entire sampled boundary in an X-only active set.
  let spanX = 0,
    spanZ = 0;
  for (let i = 0; i < r.length; i++) {
    const b = r[(i + 1) % r.length];
    spanX += Math.abs(b.x - r[i].x);
    spanZ += Math.abs(b.z - r[i].z);
  }
  const axis = spanX >= spanZ ? "x" : "z";
  const edges = r
    .map((a, i) => ({
      a,
      b: r[(i + 1) % r.length],
      i,
      min: Math.min(a[axis], r[(i + 1) % r.length][axis]),
      max: Math.max(a[axis], r[(i + 1) % r.length][axis])
    }))
    .sort((a, b) => a.min - b.min);
  const active: typeof edges = [];
  let first: [number, number] | undefined;
  for (const edge of edges) {
    let keep = 0;
    for (let k = 0; k < active.length; k++) {
      const other = active[k];
      if (other.max < edge.min) continue;
      active[keep++] = other;
      const i = Math.min(edge.i, other.i),
        j = Math.max(edge.i, other.i);
      if (first && (i > first[0] || (i === first[0] && j >= first[1]))) continue;
      const gap = j - i;
      if (gap !== 1 && gap !== r.length - 1 && crosses(edge.a, edge.b, other.a, other.b)) first = [i, j];
    }
    active.length = keep;
    active.push(edge);
  }
  return first;
}

/** Broad phase only rejects disjoint bounds; surviving pairs still use exact predicates.
 * Bounds are transaction-owned, never cached against a mutable polygon identity. */
export function polygonBounds(r: readonly PlanPoint[]) {
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity;
  for (const p of r) {
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, minZ, maxX, maxZ };
}
export function boundsOverlap(a: ReturnType<typeof polygonBounds>, b: ReturnType<typeof polygonBounds>): boolean {
  return a.minX <= b.maxX + 1e-7 && b.minX <= a.maxX + 1e-7 && a.minZ <= b.maxZ + 1e-7 && b.minZ <= a.maxZ + 1e-7;
}
