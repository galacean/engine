import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { isGlobalRoadId } from "@galacean/engine-world-planning/spatial/layout/RoadIdentity";

/** Publish only water, global roads and the internal approaches required by river crossings.
 * POI volumes/ports remain private compiler dependencies; they are not renderable preview content.
 */
export function projectWaterPreview(plan: IslandPlan): IslandPlan {
  const crossingRoutes = new Set(plan.bridges.map((b) => b.routeId));
  const routes = plan.routes.filter((r) => isGlobalRoadId(r.id) || crossingRoutes.has(r.id));
  const routeIds = new Set(routes.map((r) => r.id));
  const roadGraph = plan.roadGraph && {
    ...plan.roadGraph,
    sections: plan.roadGraph.sections
      .filter((s) => s.owners.some((id) => routeIds.has(id)))
      .map((s) => ({ ...s, owners: s.owners.filter((id) => routeIds.has(id)) }))
  };
  const ids = new Set([
    "world",
    "world-routes",
    "land-main",
    ...plan.waters.map((w) => w.id),
    ...routes.map((r) => r.id),
    ...plan.bridges.map((b) => b.id),
    ...(plan.roadApproaches ?? []).map((b) => b.id)
  ]);
  const planning = plan.planning && {
    ...plan.planning,
    modules: plan.planning.modules.filter((m) => ids.has(m.id)),
    profiles: plan.planning.profiles.filter((p) => ids.has(p.ownerId)),
    ports: plan.planning.ports.filter((p) => ids.has(p.ownerId)),
    relations: plan.planning.relations.filter((r) => r.owners.every((id) => ids.has(id))),
    reservations: plan.planning.reservations.filter((r) => ids.has(r.ownerId)),
    checks: plan.planning.checks.filter((c) => c.owners.some((id) => ids.has(id))),
    adjustments: plan.planning.adjustments.filter((c) => c.owners.some((id) => ids.has(id))),
    requiredIds: plan.planning.requiredIds.filter((id) => ids.has(id)),
    changedIds: plan.planning.changedIds.filter((id) => ids.has(id))
  };
  return {
    ...plan,
    routes,
    roadGraph,
    planning,
    // Elevation fields and published navigation heights remain Terrain/road authorities.
    poiDistribution: undefined,
    spatialLayout: plan.spatialLayout && { worldSignature: plan.spatialLayout.worldSignature, groups: [] },
    buildings: [],
    rocks: [],
    mountains: [],
    ridges: [],
    supports: [],
    slopes: [],
    structures: [],
    regions: [],
    places: [],
    sights: [],
    landscapes: [],
    flowerRegions: [],
    visualGuidance: [],
    fences: [],
    courtyards: [],
    plazas: [],
    plazaCandidates: [],
    shapeRecipes: plan.shapeRecipes?.filter((r) => r.id === "land-main" || r.id.startsWith("offshore-"))
  };
}
