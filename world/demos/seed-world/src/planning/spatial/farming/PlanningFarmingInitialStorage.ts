import type {
  FarmingGroundView,
  FarmingStarterPlacement,
  FarmingStorageDefinitions
} from "@galacean/engine-farming/farming/api/index";
import { createInitialStorage } from "@galacean/engine-farming/farming/storage/StorageRules";
import { farmingBoundsOutline, restrictPlanningFarmingCultivation } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingGround";

/** Reuse accepted placement only while its resource rules still match. Never called for saved farms. */
export function planningFarmingInitialStorage(
  farmId: string,
  placement: FarmingStarterPlacement,
  definitions: FarmingStorageDefinitions,
  initialContainers: boolean,
  physical: () => FarmingGroundView
) {
  if (placement.storage.definitionsSignature === JSON.stringify(definitions)) return placement.storage;
  // The component assets changed after planning. Preflight the new containers at the same
  // farm, keeping its grid, search domain and operating corridor. Failure remains visible.
  const view = restrictPlanningFarmingCultivation(physical(), [farmingBoundsOutline(placement.operationBounds)]);
  return createInitialStorage(
    farmId,
    placement.grid,
    placement.plots.map((plot) => plot.target!),
    { storage: definitions },
    view,
    placement.storage.layout,
    initialContainers ? undefined : Object.fromEntries(definitions.containers.map((type) => [type.id, 0]))
  );
}
