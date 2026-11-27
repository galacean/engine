import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { poiTerritories } from "./PoiTerritories";
import { footprintBoundsLookup } from "../layout/FootprintLookup";

type Edge = { a: PlanPoint; b: PlanPoint };
const edges = (outline: PlanPoint[]): Edge[] => outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length] }));

/** Distance to the first boundary in a direction, including concave coastlines. */
function exitDistance(point: PlanPoint, direction: PlanPoint, boundary: Edge[]): number {
  let nearest = Infinity;
  for (const { a, b } of boundary) {
    const ex = b.x - a.x,
      ez = b.z - a.z;
    const determinant = direction.x * ez - direction.z * ex;
    if (Math.abs(determinant) < 1e-10) continue;
    const ax = a.x - point.x,
      az = a.z - point.z;
    const t = (ax * ez - az * ex) / determinant;
    const u = (ax * direction.z - az * direction.x) / determinant;
    if (t >= -1e-8 && u >= 0 && u <= 1) nearest = Math.min(nearest, Math.max(0, t));
  }
  return nearest;
}

/** Prepare content-to-boundary normalization for each management cell clipped by its land domain.
 * The returned length never determines ownership: callers must use the point's actual owner.
 * @returns A local decay length; ratio 1 reaches the boundary, ratio 2 retains more density there.
 */
export function prepareLandscapeFalloff(plan: IslandPlan) {
  const sites = new Map(plan.poiDistribution?.sites.map((s) => [s.id, s]));
  const domains = new Map(
    plan.poiDistribution?.domains.map((d) => {
      const boundary = edges(d.outline);
      return [d.id, { boundary, nearby: footprintBoundsLookup(boundary, (e) => [e.a, e.b]) }] as const;
    })
  );
  const regions = new Map(poiTerritories(plan).map((t) => [t.poiId, { ...t, boundary: edges(t.outline) }]));
  return (owner: string | undefined, point: PlanPoint, contentDistance: number, ratio: number): number => {
    const region = owner && regions.get(owner),
      site = owner && sites.get(owner);
    if (!region || !site) return Infinity;
    const dx = point.x - site.center.x,
      dz = point.z - site.center.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-8) return ratio > 0 ? Infinity : 0;
    const direction = { x: dx / length, z: dz / length };
    const coast = domains.get(region.domainId);
    const cellExit = exitDistance(point, direction, region.boundary);
    const end = { x: point.x + direction.x * cellExit, z: point.z + direction.z * cellExit };
    // The cell's first exit bounds the only coastline ray that can affect decay.
    // Keep exact segment intersections, including concave shores and endpoint tolerance.
    const boundary =
      coast && Number.isFinite(cellExit)
        ? coast.nearby({
            x0: Math.min(point.x, end.x) - 1e-7,
            x1: Math.max(point.x, end.x) + 1e-7,
            z0: Math.min(point.z, end.z) - 1e-7,
            z1: Math.max(point.z, end.z) + 1e-7
          })
        : coast?.boundary;
    const remaining = Math.min(cellExit, boundary ? exitDistance(point, direction, boundary) : Infinity);
    return (contentDistance + remaining) * ratio;
  };
}
