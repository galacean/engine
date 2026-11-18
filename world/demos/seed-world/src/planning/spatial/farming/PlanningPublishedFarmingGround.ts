import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { sampleSeedWorldHeight, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import { RoadObstacleIndex } from "@galacean/engine-world-planning/spatial/layout/LayoutKernel";
import { planningWhiteboxes } from "@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes";
import type { GroundBounds } from "@galacean/engine-farming/farming/api/index";
import { createPlanningFarmingGroundView, farmingBoundsOutline } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingGround";
import { createPlanningFarmingTerrainQuery } from "./PlanningFarmingTerrain.ts";
import { createPlanningFarmingWaterInspection } from "./PlanningFarmingWater.ts";
import type { WaterSpatialFieldSnapshot } from "@galacean/engine-water/water/runtime/index";

/** Accepted building occupancy; independent of the building generator and renderer. */
export interface PlanningBuildingOccupancyOwner {
  readonly bounds: readonly { readonly max: readonly [number, number, number] }[];
  captureOccupancyQuery(): { intersectBounds(min: [number, number, number], max: [number, number, number]): { building: string; subject: string } | null } | undefined;
}

export type PlanningFarmingTerrain = Pick<
  SeedWorldFields,
  | "sizeMetres"
  | "worldOrigin"
  | "heightDecode"
  | "heightResolution"
  | "heightSamples"
  | "surfaceHeights"
  | "surfaceResolution"
  | "rockySlopeWeight"
  | "materialWeights"
>;

/** Final raw Terrain plus published water/solid queries. Bridge navigation never enters the height sampler. */
export function publishedPlanningFarmingGround(
  plan: IslandPlan,
  fields: PlanningFarmingTerrain,
  revision: number,
  underwater: (x: number, z: number, terrainHeight: number) => boolean,
  additionalBlocked: (bounds: GroundBounds) => boolean = () => false,
  buildings?: PlanningBuildingOccupancyOwner,
  waterFields?: readonly WaterSpatialFieldSnapshot[],
  restrictToManagement = true
) {
  const farm = plan.farming!;
  const terrain = createPlanningFarmingTerrainQuery(fields);
  const solidParts = planningWhiteboxes(plan, (p) => sampleSeedWorldHeight(fields, p.x, p.z) ?? 0).filter(
    (part) => part.layer !== "tree" && part.layer !== "bridge" && (!buildings || part.layer !== "building")
  );
  const obstacles = new RoadObstacleIndex(
    solidParts.map((part) => ({
      id: part.id,
      owner: part.id,
      boxes: part.boxes.map((box) => ({
        center: box.center,
        elevation: box.elevation ?? 0,
        width: box.sizeX,
        depth: box.sizeZ,
        height: box.sizeY,
        yaw: box.yaw
      }))
    }))
  );
  const occupancy = buildings?.captureOccupancyQuery();
  const maximumBuildingHeight = Math.max(-Infinity, ...(buildings?.bounds ?? []).map((b) => b.max[1]));
  const buildingBlocked = (bounds: GroundBounds) => {
    if (!occupancy || !Number.isFinite(maximumBuildingHeight)) return false;
    const minimumGround = terrain.inspectBounds(bounds).minimumHeight;
    return (
      Number.isFinite(minimumGround) &&
      minimumGround <= maximumBuildingHeight &&
      Boolean(
        occupancy.intersectBounds(
          [bounds.minimumX, minimumGround, bounds.minimumZ],
          [bounds.maximumX, maximumBuildingHeight, bounds.maximumZ]
        )
      )
    );
  };
  return createPlanningFarmingGroundView({
    revision,
    groundId: farm.groundId,
    domains: [plan.land, ...plan.islands],
    allowedArea: restrictToManagement ? farm.managementOutline : undefined,
    sampleStepM: Math.min(0.5, fields.sizeMetres / (fields.heightResolution - 1)),
    terrain,
    height: (x, z) => terrain.sample(x, z)?.position[1] ?? null,
    underwater,
    underwaterBounds: waterFields && createPlanningFarmingWaterInspection(waterFields, terrain),
    blocked: (bounds) =>
      obstacles.collides(farmingBoundsOutline(bounds)) || buildingBlocked(bounds) || additionalBlocked(bounds)
  });
}
