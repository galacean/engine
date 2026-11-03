import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import type { FarmSnapshot } from "@galacean/engine-farming/farming/api/index";
import { validateConfiguredFarmSnapshot } from "@galacean/engine-farming/farming/domain/FarmValidation";
import { FARM_DEFINITIONS } from "@galacean/engine-farming/farming/content/DefaultFarmingDefinitions";
import {
  resolveSimulationConfig,
  type FarmingSimulationOverrides
} from "@galacean/engine-farming/farming/config/FarmingSimulationConfig";
import { FarmingInitializationError } from "@galacean/engine-farming/farming/application/FarmingInitializationError";
import { FarmItemIdentityConflictError } from "@galacean/engine-farming/farming/domain/RetiredFarmItems";
import { FarmSnapshotCompatibilityError } from "@galacean/engine-farming/farming/domain/FarmSnapshotCompatibilityError";

/** Corruption may start this Seed afresh; incompatible resources and ambiguous ownership may not. */
export function canRecoverPlanningFarmSave(error: unknown): boolean {
  return error instanceof FarmingInitializationError && error.code === "INVALID_SNAPSHOT" &&
    !(error.cause instanceof FarmItemIdentityConflictError) &&
    !(error.cause instanceof FarmSnapshotCompatibilityError);
}

export const PLANNING_FARM_LAYOUT = { layoutId: "seed-world-starter-v1", layoutVersion: 1 } as const;
export const planningFarmId = (seed: number) => `seed-world/seed-${seed}/starter`;

/** Validate data integrity against its own layout, never against a newly generated farm. */
export function validatePlanningFarmSave(
  snapshot: FarmSnapshot,
  farmId: string,
  definitions = FARM_DEFINITIONS,
  ErrorType = FarmingInitializationError,
  simulationConfig?: FarmingSimulationOverrides
): void {
  try {
    const config = resolveSimulationConfig(definitions.soilProfile, simulationConfig);
    validateConfiguredFarmSnapshot(
      snapshot,
      {
        ...PLANNING_FARM_LAYOUT,
        farmId,
        definitions,
        grid: snapshot.grid,
        plots: [],
        validatePlacement: false
      },
      config
    );
  } catch (error) {
    throw new ErrorType("INVALID_SNAPSHOT", error);
  }
}

/** A fresh-generation choice is consumed by the current entry, not inherited by a later visit or Seed. */
export function resetPlanningFarmSaveChoice(document: PlanningDocument): void {
  for (const entities of [
    document.entities,
    ...Object.values(document.layoutOverrides ?? {}).map((archive) => archive.entities)
  ]) {
    const component = entities.world?.components.farming;
    if (component) component.values.saveMode = "auto";
  }
}
