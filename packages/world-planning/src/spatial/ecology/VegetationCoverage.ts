import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { rasterizeCoverageRegions } from "./CoverageRaster";
/** Independent ecological coverage, not normalized terrain material weights or an instance count. */
export interface VegetationCoverage {
  resolution: number;
  width: number;
  depth: number;
  flowers: Uint8Array;
  ownership: { ids: string[]; samples: Uint32Array };
}
const cache = new Map<string, VegetationCoverage>();
/** Compile resolved contours to a 0..255 occupancy mask. Visibility only affects this preview layer.
 * Flower and future grass density layers can overlap; they do not compete for terrain channels.
 */
export function vegetationCoverage(
  plan: IslandPlan,
  visibility: Readonly<Record<string, boolean>> = {}
): VegetationCoverage {
  const { width, depth } = plan.parameters;
  const regions = (plan.flowerRegions ?? []).filter(
    (f) =>
      visibility.flowers !== false &&
      visibility.landscape !== false &&
      visibility["object:" + f.id] !== false &&
      visibility["object:" + f.ownerId] !== false
  );
  const resolution = Math.ceil(Math.max(width, depth)) + 1;
  const key = JSON.stringify([width, depth, resolution, regions.map((f) => [f.id, f.outlines])]);
  const saved = cache.get(key);
  if (saved) return saved;
  const ownership = { ids: regions.map((f) => f.id), samples: new Uint32Array(resolution * resolution) };
  const result = {
    ownership,
    resolution,
    width,
    depth,
    flowers: rasterizeCoverageRegions(
      regions.map((f) => f.outlines),
      resolution,
      width,
      depth,
      ownership.samples
    )
  };
  cache.set(key, result);
  if (cache.size > 3) cache.delete(cache.keys().next().value!);
  return result;
}
