import config from "./guidance-policy.json";
import { poiMemberIds } from "../../semantic-study/PoiContents";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { PoiSite } from "../../semantic-study/PoiDistribution";
export const GUIDANCE_POLICY = config;
export interface StudyLink {
  id: string;
  label: string;
  from: PoiSite;
  to: PoiSite;
  routeId: string;
  reversed: boolean;
  targetIds: string[];
}
/** Find actual populated destinations connected by published roads. Empty POI slots are excluded. */
export function studyLinks(plan: IslandPlan): StudyLink[] {
  const sites = plan.poiDistribution?.sites ?? [],
    nodes = plan.roadNetwork?.nodes ?? [];
  const buildingCount = (site: PoiSite) => {
    const ids = new Set(poiMemberIds(plan, site));
    return plan.buildings.filter((b) => ids.has(b.id)).length;
  };
  const result: StudyLink[] = [];
  for (const edge of plan.roadNetwork?.edges ?? []) {
    const a = sites.find((p) => p.id === nodes.find((n) => n.id === edge.a)?.poiId),
      b = sites.find((p) => p.id === nodes.find((n) => n.id === edge.b)?.poiId);
    if (!a || !b || !a.memberIds.length || !b.memberIds.length || a.id === b.id) continue;
    const countA = buildingCount(a),
      countB = buildingCount(b);
    if (!countA && !countB) continue;
    const from = countA > countB || (countA === countB && a.id.localeCompare(b.id) < 0) ? a : b,
      to = from === a ? b : a,
      houses = buildingCount(to) > 0;
    const owned = new Set(poiMemberIds(plan, to));
    // Measure the destination's primary volume, not its ambient landscape or helper occluders.
    const targetIds = houses
      ? plan.buildings.filter((p) => owned.has(p.id)).map((p) => p.id)
      : plan.rocks.filter((p) => owned.has(p.id) && plan.mountains.some((m) => m.id === p.groupId)).map((p) => p.id);
    result.push({
      id: edge.routeId,
      label: houses ? "房屋组 → 房屋组" : "房屋组 → 地貌地标",
      from,
      to,
      routeId: edge.routeId,
      reversed: from === b,
      targetIds
    });
  }
  return result.sort((a, b) => (b.from.sizeWeight ?? 1) - (a.from.sizeWeight ?? 1) || a.id.localeCompare(b.id));
}
/** Orient a route by its declared POI relationship without changing the physical network. */
export function linkPoints(plan: IslandPlan, link: StudyLink): PlanPoint[] {
  const route = plan.routes.find((r) => r.id === link.routeId);
  if (!route) throw new Error("实验路线不存在");
  return link.reversed ? [...route.points].reverse() : route.points;
}
/** Sample by arc length; fractions are independent of curve tessellation. */
export function pathSample(points: PlanPoint[], fraction: number): { point: PlanPoint; direction: PlanPoint } {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.z - points[i].z));
  let left = Math.max(0, Math.min(1, fraction)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    const d = lengths[i];
    if (left <= d || i === lengths.length - 1) {
      const t = d ? left / d : 0,
        a = points[i],
        b = points[i + 1];
      return {
        point: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
        direction: { x: (b.x - a.x) / (d || 1), z: (b.z - a.z) / (d || 1) }
      };
    }
    left -= d;
  }
  throw new Error("实验路线至少需要两个点");
}
/** Choose a populated POI close to the actual route. */
export function routeCue(plan: IslandPlan, route: PlanPoint[]): PoiSite | undefined {
  const samples = Array.from({ length: 21 }, (_, i) => pathSample(route, i / 20).point);
  return plan.poiDistribution?.sites
    .filter((p) => p.active && p.memberIds.length)
    .map((p) => ({ p, d: Math.min(...samples.map((q) => Math.hypot(p.center.x - q.x, p.center.z - q.z))) }))
    .filter((v) => v.d < 120)
    .sort((a, b) => a.d - b.d || a.p.id.localeCompare(b.p.id))[0]?.p;
}
