import { PlanningSession } from "../PlanningSession";
import type { PlanningDocument } from "../PlanningDocument";
import type { SemanticRecipe } from "../../semantic-study/WorldPlanningContract";
/** Historical study factory. Uses exactly the editor pipeline, including serialized replay.
 * No private after-generation geometry restoration or baseline snapshot is applied.
 */
export function createGuidanceSession(recipe: SemanticRecipe, document?: PlanningDocument): PlanningSession {
  return new PlanningSession(recipe, undefined, document);
}
