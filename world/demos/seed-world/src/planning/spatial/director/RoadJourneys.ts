import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { distance, type DirectorRoute } from "@galacean/engine-world-planning/spatial/director/DirectorRoute";

/** Keep parallel roads distinct: shortest-path queries would silently leave some published roads untested. */
export function roadJourneys(plan: IslandPlan) {
  const network = plan.roadNetwork;
  return (network?.edges ?? []).flatMap((edge) => {
    const from = network!.nodes.find((n) => n.id === edge.a)?.poiId;
    const to = network!.nodes.find((n) => n.id === edge.b)?.poiId;
    return from && to && from !== to
      ? [
          { from, to, routeId: edge.routeId },
          { from: to, to: from, routeId: edge.routeId }
        ]
      : [];
  });
}

export function publishedRoadJourney(plan: IslandPlan, routeId: string, from: string, to: string): DirectorRoute {
  if (!roadJourneys(plan).some((j) => j.routeId === routeId && j.from === from && j.to === to))
    throw Error("不是已发布的 POI 道路连接");
  const edge = plan.roadNetwork!.edges.find((e) => e.routeId === routeId)!;
  const source = plan.roadNetwork!.nodes.find((n) => n.id === edge.a)!;
  const destination = plan.roadNetwork!.nodes.find((n) => n.id === edge.b)!;
  const road = plan.routes.find((r) => r.id === routeId);
  if (!road || road.points.length < 2) throw Error("已发布道路缺少路径几何");
  let points = road.points.slice();
  if (distance(points[0], source.position) > distance(points[points.length - 1], source.position)) points.reverse();
  if (distance(points[0], source.position) > 0.1 || distance(points[points.length - 1], destination.position) > 0.1)
    throw Error("道路端点与 POI 接入点不一致");
  if (source.poiId !== from) points.reverse();
  return {
    id: routeId + ":" + from + ":" + to,
    from,
    to,
    points,
    routeIds: [routeId],
    lengthM: points.slice(1).reduce((n, p, i) => n + distance(points[i], p), 0)
  };
}
