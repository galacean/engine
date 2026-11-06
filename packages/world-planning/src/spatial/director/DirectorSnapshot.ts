import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
const snapshotCache = new WeakMap<IslandPlan, string>();
/** Geometry identity prevents reports from another document with the same revision from appearing current. */
export function directorSnapshotId(plan: IslandPlan): string {
  let result = snapshotCache.get(plan);
  if (result) return result;
  const data = JSON.stringify([
    plan.parameters,
    plan.buildings,
    plan.rocks,
    plan.landscapes,
    plan.routes,
    plan.bridges,
    plan.regions,
    plan.waters,
    plan.land,
    plan.islands
  ]);
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619);
  result = `${data.length}:${hash >>> 0}`;
  snapshotCache.set(plan, result);
  return result;
}
