import {
  OceanNearshoreOutsidePolicy,
  OceanNearshoreSchemaVersion,
  type WaterOceanRepresentationStateV1
} from "@galacean/engine-water/water/index";
import {
  OceanWaterCompiledResource,
  type OceanWaterBodyDescriptorV1,
  type OceanWaterCompiledTransferV1
} from "@galacean/engine-water/water/runtime/ocean/index";
import { planningHeightmap, type PlanningHeightmap } from "./PlanningHeightmap";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import type { IslandPlan } from "./IslandPlanModel";

import { numericContentIdentity } from "@galacean/engine-water/water/compiler/index";

// Bounded immutable CPU caches shared by Planner and the water preview, including Worker execution.
const compiledByContent = new Map<string, OceanWaterCompiledTransferV1>();
const domainMasks = new Map<string, Uint8Array>();
function retain<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > 2) cache.delete(cache.keys().next().value!);
  return value;
}
const cache = new WeakMap<PlanningHeightmap, OceanWaterCompiledTransferV1>();
const descriptors = new WeakMap<PlanningHeightmap, OceanWaterBodyDescriptorV1>();
/** Ocean has one datum; inland rivers keep their own longitudinal water profiles. */
export function planningOceanDescriptor(plan: IslandPlan): OceanWaterBodyDescriptorV1 {
  const height = planningHeightmap(plan);
  const previous = descriptors.get(height);
  if (previous) return previous;
  const resolution = height.resolution;
  const bedHeights = height.heights.slice(),
    mask = new Uint8Array(bedHeights.length);
  const domainKey = JSON.stringify([resolution, height.spacingX, height.spacingZ, plan.land, plan.islands]);
  let outside = domainMasks.get(domainKey);
  if (!outside) {
    const domains = [plan.land, ...plan.islands].map(createPlanningRingQuery);
    outside = new Uint8Array(bedHeights.length);
    for (let z = 0; z < resolution; z++)
      for (let x = 0; x < resolution; x++)
        outside[z * resolution + x] = domains.some((domain) =>
          domain.inside({ x: x * height.spacingX, z: z * height.spacingZ })
        )
          ? 0
          : 1;
    retain(domainMasks, domainKey, outside);
  }
  for (let i = 0; i < bedHeights.length; i++) {
    mask[i] = outside[i] && bedHeights[i] < 0 ? 1 : 0;
    // Dry slots are outside Ocean's domain. They contribute neither bathymetry nor depth
    // to its atlas/query. Canonicalize only those slots; Terrain keeps every real height.
    if (!mask[i]) bedHeights[i] = 0;
  }
  const ocean = OceanNearshoreOutsidePolicy.DeepOcean;
  const descriptor: OceanWaterBodyDescriptorV1 = {
    schemaVersion: 2,
    id: "planning-ocean",
    config: {
      waterLevel: 0,
      nearshoreDescriptor: {
        schemaVersion: OceanNearshoreSchemaVersion.V1,
        id: "planning-ocean:nearshore",
        waterLevel: 0,
        grid: {
          originXZ: [0, 0],
          cellSizeXZ: [height.spacingX, height.spacingZ],
          width: resolution,
          height: resolution
        },
        bedHeights,
        budget: {
          maxWidth: resolution,
          maxHeight: resolution,
          maxTexelCount: resolution * resolution,
          maxAtlasByteLength: resolution * resolution * 4
        },
        wetSource: { kind: "mask", mask, minimumDepth: 0 },
        outsidePolicy: { negativeX: ocean, positiveX: ocean, negativeZ: ocean, positiveZ: ocean }
      }
    }
  };
  descriptors.set(height, descriptor);
  return descriptor;
}
/** Finite presentation surrounds this world's bounds; it never imports the legacy Seed world's fixed size. */
export function planningOceanRepresentation(plan: IslandPlan): Readonly<WaterOceanRepresentationStateV1> {
  return {
    schemaVersion: 1,
    kind: "ocean-surface-layout",
    centerXZ: [plan.parameters.width / 2, plan.parameters.depth / 2],
    size: Math.max(plan.parameters.width, plan.parameters.depth) * 2,
    surfaceTopology: "finite",
    finitePatchGridSize: 1
  };
}
/** CPU-only Water compilation, called in the shared raster worker. */
export function compilePlanningOcean(plan: IslandPlan): OceanWaterCompiledTransferV1 {
  const height = planningHeightmap(plan);
  let result = cache.get(height);
  if (!result) {
    const descriptor = planningOceanDescriptor(plan);
    const nearshore = descriptor.config.nearshoreDescriptor;
    const key = JSON.stringify([
      nearshore.grid,
      nearshore.waterLevel,
      nearshore.outsidePolicy,
      numericContentIdentity(nearshore.bedHeights),
      nearshore.wetSource.kind === "mask" && numericContentIdentity(nearshore.wetSource.mask)
    ]);
    result = compiledByContent.get(key);
    if (!result) result = OceanWaterCompiledResource.compileForTransfer(descriptor);
    retain(compiledByContent, key, result);
    cache.set(height, result);
  }
  return result;
}
/** Publish worker output under the same canonical terrain snapshot. */
export function adoptPlanningOcean(plan: IslandPlan, data: OceanWaterCompiledTransferV1): void {
  const height = planningHeightmap(plan);
  if (!cache.has(height)) cache.set(height, data);
}
export function preparedPlanningOcean(plan: IslandPlan): OceanWaterCompiledTransferV1 {
  const data = cache.get(planningHeightmap(plan));
  if (!data) throw new Error("海洋尚未经过后台地表编译");
  return data;
}
