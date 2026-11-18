import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { RoadObstacleIndex } from "../layout/LayoutKernel";
import { FARM_DEFINITIONS } from "@galacean/engine-farming/farming/content/DefaultFarmingDefinitions";
import { storageDefinitions } from "@galacean/engine-farming/farming/storage/StorageRules";
import {
  createPlanningFarmingGroundView,
  farmingBoundsOutline,
  restrictPlanningFarmingCultivation
} from "./PlanningFarmingGround";
import { inspectPublishedPlanningFarm } from "./PlanningFarmingValidation";

/** Only a complete, finally checked starter may publish a start marker. Runtime consumes this accepted layout. */
export function finalizePlanningFarm(plan: IslandPlan): void {
  const farm = plan.farming;
  if (!farm?.placement || farm.placementCheck.state !== "ready" || farm.accessCheck.state !== "ready") return;
  const height = createPlanningGroundSampler(plan);
  const obstacles = new RoadObstacleIndex(
    planningWhiteboxes(plan, (p) => height(p))
      .filter((p) => p.layer !== "tree" && p.layer !== "bridge")
      .map((part) => ({
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
  const water = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const raw = createPlanningFarmingGroundView({
    revision: farm.planningRevision,
    groundId: farm.groundId,
    domains: [plan.land, ...plan.islands],
    allowedArea: farm.managementOutline,
    height: (x, z) => height({ x, z }),
    sampleStepM: 0.25,
    underwater: (x, z) => water.some((w) => w.inside({ x, z })),
    blocked: (bounds) => obstacles.collides(farmingBoundsOutline(bounds))
  });
  const view = restrictPlanningFarmingCultivation(raw, [
    farmingBoundsOutline(farm.placement.operationBounds),
    ...plan.routes.flatMap((route) => (route.outline ? [route.outline] : []))
  ]);
  const result = inspectPublishedPlanningFarm(
    view,
    farm.farmId,
    farm.groundId,
    farm.placement,
    storageDefinitions(FARM_DEFINITIONS),
    raw
  );
  if (result.issues.length) {
    plan.farming = {
      ...farm,
      entrance: undefined,
      placementCheck: { state: "blocked", issues: result.issues },
      accessCheck: { state: "blocked", issues: result.issues }
    };
  } else {
    plan.farming = { ...farm, placement: { ...farm.placement, storage: result.initialStorage! } };
  }
}
