import type { IslandPlan } from "../../semantic-study/IslandPlanModel";

/** Omit unusable physical sections and journeys that require them.
 * @param plan Detached publication candidate; unrelated pavement is retained.
 * @param sectionIds Physical sections whose support or clearance failed.
 * @param routeIds Additional logical journeys that cannot be published.
 */
export function omitUnusableRoads(
  plan: IslandPlan,
  sectionIds: ReadonlySet<string>,
  routeIds: ReadonlySet<string> = new Set()
): void {
  const owners = new Set(routeIds);
  for (const section of plan.roadGraph?.sections ?? [])
    if (sectionIds.has(section.id)) for (const owner of section.owners) owners.add(owner);
  plan.routes = plan.routes.filter((route) => !owners.has(route.id) && !sectionIds.has(route.id));
  if (plan.roadGraph) {
    const kept = plan.roadGraph.sections.filter((section) => !sectionIds.has(section.id));
    const degrees = new Map<string, number>();
    for (const section of kept)
      for (const id of [section.route.from, section.route.to]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
    plan.roadGraph = {
      ...plan.roadGraph,
      sections: kept.map((section) => ({ ...section, owners: section.owners.filter((owner) => !owners.has(owner)) })),
      nodes: plan.roadGraph.nodes.filter((n) => degrees.has(n.id)).map((n) => ({ ...n, degree: degrees.get(n.id)! }))
    };
  }
  if (plan.roadNetwork)
    plan.roadNetwork = {
      ...plan.roadNetwork,
      edges: plan.roadNetwork.edges.filter((edge) => !owners.has(edge.routeId))
    };
}
