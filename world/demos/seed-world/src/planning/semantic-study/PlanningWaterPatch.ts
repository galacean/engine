import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { encodePlanningHeightSamples, type PlanningHeightmap, type PlanningHeightBounds } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";

/** Only the author layer and its bounded ecological consumers cross this protocol. */
export interface PlanningWaterPatch {
  authoredWaterLayer: 1;
  authoredResources: IslandPlan["authoredResources"];
  waters: IslandPlan["waters"];
  profiles: NonNullable<IslandPlan["planning"]>["profiles"];
  revision: number;
  baselineLandscapes: NonNullable<IslandPlan["spatialLayout"]>["baselineLandscapes"];
  landscapeModule: NonNullable<IslandPlan["planning"]>["modules"][number] | undefined;
  changedIds: string[];
  landscapeBase: NonNullable<IslandPlan["spatialLayout"]>["landscapeBase"];
  landscapes: IslandPlan["landscapes"];
  flowerRegions: IslandPlan["flowerRegions"];
}
const fields = [
  "authoredWaterLayer",
  "authoredResources",
  "waters",
  "profiles",
  "revision",
  "landscapeBase",
  "landscapes",
  "flowerRegions",
  "baselineLandscapes",
  "landscapeModule",
  "changedIds"
];
export function planningWaterPatch(plan: IslandPlan): PlanningWaterPatch {
  return {
    authoredWaterLayer: 1,
    authoredResources: plan.authoredResources,
    waters: plan.waters,
    profiles: plan.planning!.profiles,
    revision: plan.planning!.revision,
    baselineLandscapes: plan.spatialLayout?.baselineLandscapes,
    landscapeModule: plan.planning!.modules?.find((m) => m.id === "landscape"),
    changedIds: plan.planning!.changedIds,
    landscapeBase: plan.spatialLayout?.landscapeBase,
    landscapes: plan.landscapes,
    flowerRegions: plan.flowerRegions
  };
}
export function mergePlanningWaterPatch(base: IslandPlan, patch: PlanningWaterPatch): IslandPlan {
  if (
    Object.keys(patch).length !== fields.length ||
    Object.keys(patch).some((key) => !fields.includes(key)) ||
    patch.authoredWaterLayer !== 1 ||
    !base.planning ||
    !base.spatialLayout
  )
    throw Error("Invalid water plan patch");
  return {
    ...base,
    authoredWaterLayer: 1,
    authoredResources: patch.authoredResources,
    waters: patch.waters,
    planning: {
      ...base.planning,
      profiles: patch.profiles,
      revision: patch.revision,
      changedIds: patch.changedIds,
      modules: base.planning.modules?.map((m) => (m.id === "landscape" ? (patch.landscapeModule ?? m) : m))
    },
    spatialLayout: {
      ...base.spatialLayout,
      landscapeBase: patch.landscapeBase,
      baselineLandscapes: patch.baselineLandscapes
    },
    landscapes: patch.landscapes,
    flowerRegions: patch.flowerRegions
  };
}
export interface PlanningWaterHeightPatch {
  baseToken: string;
  targetToken: string;
  resolution: number;
  spacingX: number;
  spacingZ: number;
  tiles: { x: number; z: number; width: number; height: number; samples: Float32Array }[];
}
const tokens = new WeakMap<Float32Array, string>();
/** Immutable canonical bytes, independent of plan identity and structured cloning. */
export function planningHeightToken(
  map: Pick<PlanningHeightmap, "resolution" | "spacingX" | "spacingZ" | "heights">
): string {
  let token = tokens.get(map.heights);
  if (!token) {
    const bits = new Uint32Array(map.heights.buffer, map.heights.byteOffset, map.heights.length);
    let a = 2166136261,
      b = 0x9e3779b9;
    for (const value of bits) {
      a = Math.imul(a ^ value, 16777619);
      b = Math.imul(b ^ value, 0x85ebca6b);
      b ^= b >>> 13;
    }
    token = (a >>> 0).toString(16) + ":" + (b >>> 0).toString(16);
    tokens.set(map.heights, token);
  }
  return `${map.resolution}:${map.spacingX}:${map.spacingZ}:${token}`;
}
export function planningWaterHeightPatch(
  base: PlanningHeightmap,
  target: PlanningHeightmap,
  support: readonly PlanningHeightBounds[]
): PlanningWaterHeightPatch {
  if (base.resolution !== target.resolution || base.spacingX !== target.spacingX || base.spacingZ !== target.spacingZ)
    throw Error("Water patch grid changed");
  const tiles = support.flatMap(([minX, minZ, maxX, maxZ]) => {
    const x = Math.max(0, Math.floor(minX / target.spacingX)),
      z = Math.max(0, Math.floor(minZ / target.spacingZ));
    const x1 = Math.min(target.resolution - 1, Math.ceil(maxX / target.spacingX));
    const z1 = Math.min(target.resolution - 1, Math.ceil(maxZ / target.spacingZ));
    if (x1 < x || z1 < z) return [];
    const width = x1 - x + 1,
      height = z1 - z + 1,
      samples = new Float32Array(width * height);
    for (let row = 0; row < height; row++)
      samples.set(
        target.heights.subarray((z + row) * target.resolution + x, (z + row) * target.resolution + x + width),
        row * width
      );
    return [{ x, z, width, height, samples }];
  });
  return {
    baseToken: planningHeightToken(base),
    targetToken: planningHeightToken(target),
    resolution: target.resolution,
    spacingX: target.spacingX,
    spacingZ: target.spacingZ,
    tiles
  };
}
/** Validate and reconstruct in private memory. The caller adopts only after every check succeeds. */
export function applyPlanningWaterHeightPatch(
  base: PlanningHeightmap,
  patch: PlanningWaterHeightPatch
): Omit<PlanningHeightmap, "sample"> {
  if (
    patch.baseToken !== planningHeightToken(base) ||
    patch.resolution !== base.resolution ||
    patch.spacingX !== base.spacingX ||
    patch.spacingZ !== base.spacingZ
  )
    throw Error("Water height patch baseline mismatch");
  const heights = base.heights.slice();
  for (const tile of patch.tiles) {
    if (
      ![tile.x, tile.z, tile.width, tile.height].every(Number.isInteger) ||
      tile.x < 0 ||
      tile.z < 0 ||
      tile.width < 1 ||
      tile.height < 1 ||
      tile.x + tile.width > base.resolution ||
      tile.z + tile.height > base.resolution ||
      !(tile.samples instanceof Float32Array) ||
      tile.samples.length !== tile.width * tile.height ||
      tile.samples.some((v) => !Number.isFinite(v))
    )
      throw Error("Invalid water height patch tile");
    for (let row = 0; row < tile.height; row++)
      heights.set(
        tile.samples.subarray(row * tile.width, (row + 1) * tile.width),
        (tile.z + row) * base.resolution + tile.x
      );
  }
  const grid = { resolution: base.resolution, spacingX: base.spacingX, spacingZ: base.spacingZ };
  if (planningHeightToken({ ...grid, heights }) !== patch.targetToken)
    throw Error("Water height patch target mismatch");
  return encodePlanningHeightSamples(grid, heights);
}
