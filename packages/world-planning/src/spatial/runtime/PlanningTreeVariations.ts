import type { PlanningResource } from "../PlanningResources";
import type { SeedWorldPopulationRuntime } from "../../runtime/SeedWorldPopulationRuntime.ts";

// These recipes were deliberately removed from the catalog in 890ef7ab7.
// Keep their author records intact, but do not replay them into a runtime that
// can no longer render them. Unknown or unexpectedly missing recipes still fail.
const retiredTreeRecipes = new Set([
  "cartoon/tree/birch/v1",
  "cartoon/tree/broadleaf/v1",
  "cartoon/tree/broadleaf-green/v1"
]);

/** Apply author controls only to the unpublished candidate owned by the planning transaction. */
export function applyPlanningTreeVariations(
  population: Pick<SeedWorldPopulationRuntime, "setProceduralTreeVariationControls">,
  resources: readonly PlanningResource[]
): void {
  for (const resource of resources)
    if (resource.resourceType === "tree-variation") {
      const { recipeId, variationIndex, controls } = resource.properties;
      if (retiredTreeRecipes.has(recipeId)) continue;
      population.setProceduralTreeVariationControls(recipeId, variationIndex, controls);
    }
}
