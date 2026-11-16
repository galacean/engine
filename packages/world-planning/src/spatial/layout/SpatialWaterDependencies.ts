import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { PlanningWaterTerrainInfluence } from "../../semantic-study/WorldPlanningTerrain";
import { bounds, type Bounds } from "./Volumes";

/** Include old/new geometry and Terrain's actual influence; undefined requires full invalidation. */
export function changedSpatialWaterBounds(
  before: IslandPlan | undefined,
  after: IslandPlan,
  afterInfluences: readonly PlanningWaterTerrainInfluence[] | undefined = after.spatialLayout?.waterTerrainInfluences
): Bounds[] | undefined {
  const old = new Map(before?.waters.map((water) => [water.id, water]));
  const next = new Map(after.waters.map((water) => [water.id, water]));
  const profiles = (plan: IslandPlan | undefined, id: string) =>
    plan?.planning?.profiles.filter((profile) => profile.ownerId === id);
  const result: Bounds[] = [];
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    if (JSON.stringify([old.get(id), profiles(before, id)]) === JSON.stringify([next.get(id), profiles(after, id)]))
      continue;
    for (const [water, influences] of [
      [old.get(id), before?.spatialLayout?.waterTerrainInfluences],
      [next.get(id), afterInfluences]
    ] as const) {
      if (!water) continue;
      if (!influences || !water.outline.length) return;
      // Geometry remains an obstacle even when Terrain deliberately does not carve it.
      result.push(bounds(water.outline));
      const influence = influences.find((entry) => entry.id === id);
      if (!influence) continue;
      if (!influence.bounds || !influence.bounds.every(Number.isFinite)) return;
      const [x0, z0, x1, z1] = influence.bounds;
      result.push({ x0, z0, x1, z1 });
    }
  }
  return result;
}
