import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { overlap, segmentGap } from "../../semantic-study/WorldPlanningGeometry";

/** The infimum of grade-limited cones over a linear river profile is continuous even at bends.
 * Candidates are endpoints, the tube boundary, and the stationary point outside the tube.
 * Unlike multiplying a height difference by a blend weight, this bounds the resulting grade.
 */
export function gradeLimitedBed(
  points: (PlanPoint & { y: number })[],
  radius: number,
  grade: number
): (p: PlanPoint, ceiling?: number) => number {
  const segments = points.slice(1).map((b, i) => {
    const a = points[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    const slope = (b.y - a.y) / (length || 1);
    return {
      a,
      b,
      length,
      dx: (b.x - a.x) / (length || 1),
      dz: (b.z - a.z) / (length || 1),
      slope,
      stationaryFactor: Math.abs(slope) < grade ? slope / Math.sqrt(grade * grade - slope * slope) : undefined,
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minZ: Math.min(a.z, b.z),
      maxZ: Math.max(a.z, b.z),
      minY: Math.min(a.y, b.y)
    };
  });
  return (p, ceiling = Infinity) => {
    let height = ceiling;
    for (const s of segments) {
      // Exact lower bound: skip segments that cannot cut this point below the existing surface.
      if (height <= s.minY) continue;
      const reach = (height - s.minY) / grade + radius,
        dx = Math.max(0, s.minX - p.x, p.x - s.maxX),
        dz = Math.max(0, s.minZ - p.z, p.z - s.maxZ);
      if (dx * dx + dz * dz >= reach * reach) continue;
      if (s.length < 1e-8) {
        height = Math.min(
          height,
          Math.min(s.a.y, s.b.y) + grade * Math.max(0, Math.hypot(p.x - s.a.x, p.z - s.a.z) - radius)
        );
        continue;
      }
      const x = p.x - s.a.x,
        z = p.z - s.a.z,
        along = x * s.dx + z * s.dz,
        across = Math.abs(x * s.dz - z * s.dx);
      const at = (u: number) => {
        u = Math.max(0, Math.min(s.length, u));
        const delta = along - u;
        height = Math.min(
          height,
          s.a.y + s.slope * u + grade * Math.max(0, Math.sqrt(delta * delta + across * across) - radius)
        );
      };
      at(0);
      at(s.length);
      if (across < radius) {
        const reach = Math.sqrt(radius * radius - across * across);
        at(along - reach);
        at(along + reach);
      }
      if (s.stationaryFactor !== undefined) at(along - s.stationaryFactor * across);
    }
    return height;
  };
}

/** Compatible foundation levels on actual footprints. Shared regions remain level; nearby
 * regions cannot prescribe contradictory height envelopes. Multi-source Dijkstra only cuts
 * targets that cannot meet the grade budget, independently of input ordering.
 */
export function fitFoundationLevels(
  pads: { b: { id: string; regionId?: string; outline: PlanPoint[] }; height: number }[],
  grade: number
): void {
  const groups = new Map<string, typeof pads>();
  for (const pad of pads) {
    const key = pad.b.regionId ?? pad.b.id;
    const group = groups.get(key) ?? [];
    group.push(pad);
    groups.set(key, group);
  }
  const list = [...groups.values()],
    n = list.length,
    levels = list.map((g) => g.reduce((h, p) => h + p.height, 0) / g.length),
    done = new Set<number>();
  const gap = (a: PlanPoint[], b: PlanPoint[]) =>
    overlap(a, b)
      ? 0
      : Math.min(
          ...a.flatMap((p) => b.map((q, i) => segmentGap(p, q, b[(i + 1) % b.length]))),
          ...b.flatMap((p) => a.map((q, i) => segmentGap(p, q, a[(i + 1) % a.length])))
        );
  for (let step = 0; step < n; step++) {
    let nearest = -1;
    for (let i = 0; i < n; i++) if (!done.has(i) && (nearest < 0 || levels[i] < levels[nearest])) nearest = i;
    done.add(nearest);
    for (let i = 0; i < n; i++) {
      if (done.has(i)) continue;
      let distance = Infinity;
      for (const a of list[nearest])
        for (const b of list[i]) distance = Math.min(distance, gap(a.b.outline, b.b.outline));
      levels[i] = Math.min(levels[i], levels[nearest] + grade * distance);
    }
  }
  list.forEach((group, i) =>
    group.forEach((pad) => {
      pad.height = levels[i];
    })
  );
}
