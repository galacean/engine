import type { PlanPoint } from "../../semantic-study/IslandPlanModel";

const key = (p: PlanPoint) => `${Math.round(p.x * 1e5)},${Math.round(p.z * 1e5)}`;
/** Integrate a linearly clipped field without allocating its intermediate polygon.
 * @param polygon Ordered vertices carrying the same scalar field used for final clipping.
 * @param level Inclusive upper field threshold.
 * @returns Area in square metres, using the final clipper's edge interpolation and winding.
 */
export function coverageAreaBelow(polygon: readonly (PlanPoint & { score: number })[], level: number): number {
  let firstX = 0,
    firstZ = 0,
    lastX = 0,
    lastZ = 0,
    count = 0,
    area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    const u = level - a.score,
      v = level - b.score;
    // At most two output vertices per input edge, in the exact clipping order.
    for (let part = 0; part < 2; part++) {
      if (part === 0 ? u < 0 : u >= 0 === v >= 0) continue;
      const t = part === 0 ? 0 : u / (u - v);
      const x = part === 0 ? a.x : a.x + (b.x - a.x) * t;
      const z = part === 0 ? a.z : a.z + (b.z - a.z) * t;
      if (count++) area = area + lastX * z - lastZ * x;
      else {
        firstX = x;
        firstZ = z;
      }
      lastX = x;
      lastZ = z;
    }
  }
  return Math.abs(area + lastX * firstZ - lastZ * firstX) / 2;
}

/** Extract only exposed edges of a conforming coverage mesh; retain holes with opposite winding.
 * @param polygons Non-overlapping, consistently wound polygons with matching shared edges.
 * @returns Closed rings, without repeated end vertices or internal triangulation edges.
 */
export function coverageBoundaries(polygons: PlanPoint[][]): PlanPoint[][] {
  const edges = new Map<string, { a: PlanPoint; b: PlanPoint }>();
  for (const ring of polygons)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        ka = key(a),
        kb = key(b);
      if (ka === kb) continue;
      if (!edges.delete(`${kb}|${ka}`)) edges.set(`${ka}|${kb}`, { a, b });
    }
  const outgoing = new Map<string, Set<string>>();
  for (const [id, e] of edges) {
    const k = key(e.a),
      set = outgoing.get(k) ?? new Set();
    set.add(id);
    outgoing.set(k, set);
  }
  const rings: PlanPoint[][] = [];
  while (edges.size) {
    const first = edges.values().next().value!,
      start = key(first.a),
      ring: PlanPoint[] = [];
    let edge = first;
    for (let budget = edges.size + 1; budget > 0; budget--) {
      const id = `${key(edge.a)}|${key(edge.b)}`;
      edges.delete(id);
      outgoing.get(key(edge.a))?.delete(id);
      ring.push(edge.a);
      if (key(edge.b) === start) break;
      const next = outgoing.get(key(edge.b))?.values().next().value;
      if (!next) throw new Error("花区边界不闭合，拒绝发布采样网格");
      edge = edges.get(next)!;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}
/** Round contour corners in world space, subject to the same placement mask as generation.
 * No SVG-only smoothing: picking, area calculation and display consume these points.
 */
export function smoothCoverage(ring: PlanPoint[], allowed: (p: PlanPoint) => boolean, passes = 2): PlanPoint[] {
  let points = ring;
  for (let pass = 0; pass < passes; pass++) {
    const next: PlanPoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length],
        b = points[i],
        c = points[(i + 1) % points.length];
      const p = { x: b.x * 0.75 + a.x * 0.25, z: b.z * 0.75 + a.z * 0.25 },
        q = { x: b.x * 0.75 + c.x * 0.25, z: b.z * 0.75 + c.z * 0.25 };
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
      if (allowed(p) && allowed(q) && allowed(mid)) next.push(p, q);
      else next.push(b);
    }
    points = next;
  }
  return points;
}
