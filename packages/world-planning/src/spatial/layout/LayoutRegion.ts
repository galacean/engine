import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";

/** Safety budget for pathological millimetre spacing, surfaced separately from geometric capacity. */
export const LAYOUT_CANDIDATE_BUDGET = 2048;
/** Shared geometry of the automatic generation domain; explicit instance edits remain separate. */
export function layoutRegion(region: readonly PlanPoint[], center: PlanPoint, heading = 0) {
  const query = createPlanningRingQuery([...region]);
  let area = 0,
    x = 0,
    z = 0;
  for (let i = 0; i < region.length; i++) {
    const a = region[i],
      b = region[(i + 1) % region.length],
      cross = a.x * b.z - b.x * a.z;
    area += cross;
    x += (a.x + b.x) * cross;
    z += (a.z + b.z) * cross;
  }
  const centroid = Math.abs(area) > 1e-8 ? { x: x / (3 * area), z: z / (3 * area) } : { ...center };
  const c = Math.cos(heading),
    s = Math.sin(heading);
  const local = region.map((p) => ({
    x: (p.x - center.x) * c + (p.z - center.z) * s,
    z: -(p.x - center.x) * s + (p.z - center.z) * c
  }));
  /** Nearest allowed translation of a footprint along a fixed direction, or undefined when it cannot fit.
   * Boundary-contact events partition the sweep into intervals of constant containment;
   * no resampling, size reduction or movement along the row is involved.
   */
  const fitOffset = (outline: PlanPoint[], direction: PlanPoint, min: number, preferred: number, max: number) => {
    const contains = (offset: number) =>
      query.containsPolygon(
        outline.map((p) => ({ x: p.x + direction.x * offset, z: p.z + direction.z * offset })),
        1e-6
      );
    if (contains(preferred)) return preferred;
    if (max <= min) return undefined;
    const events = [min, max];
    const contact = (point: PlanPoint, velocity: PlanPoint, a: PlanPoint, b: PlanPoint) => {
      const ex = b.x - a.x,
        ez = b.z - a.z,
        px = a.x - point.x,
        pz = a.z - point.z,
        determinant = velocity.x * ez - velocity.z * ex;
      if (Math.abs(determinant) < 1e-9) return;
      const offset = (px * ez - pz * ex) / determinant,
        along = (px * velocity.z - pz * velocity.x) / determinant;
      if (offset > min && offset < max && along >= -1e-9 && along <= 1 + 1e-9) events.push(offset);
    };
    const reverse = { x: -direction.x, z: -direction.z };
    for (let i = 0; i < region.length; i++)
      for (let j = 0; j < outline.length; j++) {
        contact(outline[j], direction, region[i], region[(i + 1) % region.length]);
        contact(region[i], reverse, outline[j], outline[(j + 1) % outline.length]);
      }
    events.sort((a, b) => a - b);
    let best: number | undefined;
    for (const event of events)
      if ((best === undefined || Math.abs(event - preferred) < Math.abs(best - preferred)) && contains(event))
        best = event;
    for (let i = 1; i < events.length; i++) {
      const lo = events[i - 1],
        hi = events[i];
      if (hi - lo < 1e-8 || !contains((lo + hi) / 2)) continue;
      const inset = Math.min(1e-4, (hi - lo) / 2);
      const candidate = Math.max(lo + inset, Math.min(hi - inset, preferred));
      if (best === undefined || Math.abs(candidate - preferred) < Math.abs(best - preferred)) best = candidate;
    }
    return best;
  };
  return {
    centroid,
    fitOffset,
    clearance: (p: PlanPoint) => (query.inside(p) ? query.distance(p, Infinity) : 0),
    inside: (p: PlanPoint) => query.inside(p) || query.distance(p, 0.001001) <= 0.001,
    minX: Math.min(...local.map((p) => p.x)),
    maxX: Math.max(...local.map((p) => p.x)),
    radius: Math.max(0, ...local.map((p) => Math.hypot(p.x, p.z))),
    world: (x: number, z: number) => ({ x: center.x + x * c - z * s, z: center.z + x * s + z * c })
  };
}
