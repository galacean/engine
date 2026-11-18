import { captureLakeTerrain, resolveLakeTerrainBoundary } from "@galacean/engine-water/water/compiler/index";
import { planningWaterTerrainSnapshot } from "./PlanningHeightmap";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import type { IslandPlan, PlanWater } from "./IslandPlanModel";

/** The authored shore bounds the basin intent. The published wet shore is the actual Terrain isoline. */
const cache = new WeakMap<IslandPlan, Map<string, ReturnType<typeof resolve>>>();
function resolve(plan: IslandPlan, water: PlanWater) {
  const terrain = planningWaterTerrainSnapshot(plan),
    sx = terrain.spacing,
    sz = terrain.spacingZ ?? sx;
  const xs = water.outline.map((p) => p.x),
    zs = water.outline.map((p) => p.z);
  const captured = captureLakeTerrain(terrain, [
    Math.max(0, Math.floor(Math.min(...xs) / sx) - 2) * sx,
    Math.max(0, Math.floor(Math.min(...zs) / sz) - 2) * sz,
    Math.min(terrain.columns - 1, Math.ceil(Math.max(...xs) / sx) + 2) * sx,
    Math.min(terrain.rows - 1, Math.ceil(Math.max(...zs) / sz) + 2) * sz
  ]);
  const domain = createPlanningRingQuery(water.outline);
  const boundary = resolveLakeTerrainBoundary(
    captured,
    water.lake!.waterLevel,
    // Distance saturates at its search cap. Keep the cap above the inclusive shore tolerance
    // so unrelated lowlands outside the basin are not mistaken for this lake's open shore.
    (x, z) => domain.inside({ x, z }) || domain.distance({ x, z }, 0.05 + 1e-6) <= 0.05
  );
  const rings = boundary.rings;
  if (!rings.length) throw new Error(`EMPTY_WATER: 湖泊 ${water.id} 在当前水位没有实际水域`);
  return { ...captured, boundary: { ...boundary, rings } };
}
export function planningLakeBoundary(plan: IslandPlan, water: PlanWater) {
  let values = cache.get(plan);
  if (!values) {
    values = new Map();
    cache.set(plan, values);
  }
  let value = values.get(water.id);
  if (!value) {
    value = resolve(plan, water);
    values.set(water.id, value);
  }
  return value;
}
