import {
  cropWaterTerrainSnapshot,
  type WaterTerrainSnapshot
} from "@galacean/engine-water/water/authoring/terrain/index";
import { hashStableValue } from "@galacean/engine-water/water/compiler/index";
import type { IslandPlan, PlanWater } from "./IslandPlanModel";
import { planningWaterTerrainSnapshot } from "./PlanningHeightmap";

const dependencies = new WeakMap<
  WaterTerrainSnapshot,
  Map<
    string,
    {
      authoringKey: string;
      boundsKey: string;
      bedId: string;
      dependency: string;
    }
  >
>();

/** Derived cache key only. Include the exact accepted bed, not just changed author IDs:
 * roads and neighbouring water edits can also alter this body's terrain support. */
export function planningWaterDependency(plan: IslandPlan, water: PlanWater): string {
  const terrain = planningWaterTerrainSnapshot(plan),
    sx = terrain.spacing,
    sz = terrain.spacingZ ?? sx;
  const resource = plan.authoredResources?.find((resource) => resource.resourceId === water.id);
  const inputs = {
    water,
    // Appearance is authored independently of the immutable physical source.
    authoring: resource && { ...resource, properties: { ...resource.properties, colorRgb: undefined } },
    seed: plan.parameters.seed,
    profile: plan.planning?.profiles.find((p) => p.ownerId === water.id && p.kind === "water")
  };
  const authoringKey = hashStableValue(inputs);
  let entries = dependencies.get(terrain);
  if (!entries) dependencies.set(terrain, (entries = new Map()));
  const previous = entries.get(water.id);
  if (previous?.authoringKey === authoringKey) return previous.dependency;
  const xs = water.outline.map((p) => p.x),
    zs = water.outline.map((p) => p.z);
  const bounds: [number, number, number, number] =
    water.kind === "lake"
      ? [
          Math.max(0, Math.floor(Math.min(...xs) / sx) - 2) * sx,
          Math.max(0, Math.floor(Math.min(...zs) / sz) - 2) * sz,
          Math.min(terrain.columns - 1, Math.ceil(Math.max(...xs) / sx) + 2) * sx,
          Math.min(terrain.rows - 1, Math.ceil(Math.max(...zs) / sz) + 2) * sz
        ]
      : [Math.min(...xs) - 2, Math.min(...zs) - 2, Math.max(...xs) + 2, Math.max(...zs) + 2];
  const boundsKey = JSON.stringify(bounds);
  const bedId =
    previous?.boundsKey === boundsKey
      ? previous.bedId
      : (water.outline.length ? cropWaterTerrainSnapshot(terrain, bounds) : terrain).id;
  const dependency = hashStableValue({ ...inputs, bed: bedId });
  entries.set(water.id, { authoringKey, boundsKey, bedId, dependency });
  return dependency;
}
