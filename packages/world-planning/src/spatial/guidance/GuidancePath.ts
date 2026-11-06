import { TerrainNavigator } from "../director/TerrainNavigator";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
const paths = new Map<string, PlanPoint[]>();
/** Same ground navigation as the director. Roads are a preference, not the identity of the journey. */
export function guidancePath(plan: IslandPlan, fromPoi: string, toPoi: string): PlanPoint[] {
  const key = JSON.stringify([
    fromPoi,
    toPoi,
    plan.parameters,
    plan.poiDistribution?.sites,
    plan.roadNetwork?.nodes,
    plan.buildings,
    plan.rocks,
    plan.landscapes,
    plan.routes,
    plan.regions,
    plan.waters,
    plan.land,
    plan.islands,
    plan.courtyards,
    plan.fences
  ]);
  let points = paths.get(key);
  if (!points) {
    points = new TerrainNavigator(plan).route({ kind: "poi", id: fromPoi }, { kind: "poi", id: toPoi }).points;
    paths.set(key, points);
    if (paths.size > 4) paths.delete(paths.keys().next().value!);
  }
  return points;
}
