import { resolveSimulationConfig, type FarmingSimulationOverrides } from "@galacean/engine-farming/farming/config/FarmingSimulationConfig";
import type { FarmingDefinitionSet } from "@galacean/engine-farming/farming/domain/FarmDefinitions";
import { validateConfiguredFarmSnapshot } from "@galacean/engine-farming/farming/domain/FarmValidation";
import { FarmingInitializationError } from "@galacean/engine-farming/farming/application/FarmingInitializationError";
import { parsePlanningFarmingState } from "./PlanningFarmRepository.ts";
import { canRecoverPlanningFarmSave } from "./PlanningFarmSave.ts";

/** A farm consumes these resources together. Incompatibility is an activation error,
 * not a rule deciding whether an editor may save its authoring. */
export function validatePlanningFarmingResources(
  state: unknown,
  definitions: FarmingDefinitionSet,
  selection: { farmId: string; replace?: boolean; resume?: boolean },
  overrides?: FarmingSimulationOverrides
): void {
  // A fresh entry does not consume the old snapshot. Resuming committed progress
  // (including a resource rebind) never inherits that earlier reset permission.
  if (selection.replace && !selection.resume) return;
  try {
    const snapshot = parsePlanningFarmingState(JSON.stringify(state)).farms[selection.farmId];
    if (snapshot !== undefined) {
      try {
        validateConfiguredFarmSnapshot(snapshot, {
          farmId: selection.farmId, layoutId: snapshot.layoutId, layoutVersion: snapshot.layoutVersion,
          definitions, grid: snapshot.grid, plots: [], validatePlacement: false
        }, resolveSimulationConfig(definitions.soilProfile, overrides));
      } catch (error) {
        throw new FarmingInitializationError("INVALID_SNAPSHOT", error);
      }
    } else if (selection.resume) throw new Error("Farm resume state is missing; refusing to reset progress");
  } catch (error) {
    // Initialization owns recovery and only replaces this Seed after success.
    if (!selection.resume && canRecoverPlanningFarmSave(error)) return;
    throw new Error(`Farming state is incompatible with its catalog/rules: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
