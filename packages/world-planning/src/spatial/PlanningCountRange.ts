import { settlementRandom } from "../semantic-study/SettlementGeometry";
import type { SemanticParameters } from "../semantic-study/WorldPlanningContract";
import type { PlanningDocument } from "./PlanningDocument";

/** Candidate-count preferences; legacy count is accepted only at import/generator boundaries. */
export interface PlanningCountRange {
  countMin?: number;
  countMax?: number;
  /** @deprecated Import as an equal-endpoint count range. */
  count?: number;
}

/** Resolve a stable candidate budget; spatial feasibility may produce fewer objects.
 * @param seed World or landform Seed.
 * @param stream Independent deterministic count stream.
 * @param values Author range, or legacy fixed-count inputs.
 * @param fallback Unauthored count.
 * @returns A nonnegative integer within the requested range.
 * @throws If either endpoint is invalid or the lower endpoint exceeds the upper endpoint.
 */
export function planningCandidateCount(
  seed: number,
  stream: string,
  values: PlanningCountRange,
  fallback: number
): number {
  const min = values.countMin ?? values.count ?? fallback;
  const max = values.countMax ?? values.count ?? fallback;
  if (![min, max].every((value) => Number.isSafeInteger(value) && value >= 0) || min > max)
    throw new Error("数量范围须为非负整数且下限不大于上限");
  return min + Math.min(max - min, Math.floor(settlementRandom(seed, stream) * (max - min + 1)));
}

function migrateCount(values: Record<string, unknown> | undefined): void {
  if (values?.count === undefined) return;
  values.countMin ??= values.count;
  values.countMax ??= values.count;
  delete values.count;
}

/** Normalize legacy count recipe inputs in place without generating layout.
 * @param parameters Imported world recipe, including archived recipes.
 */
export function migratePlanningRecipeCounts(parameters: Partial<SemanticParameters> | undefined): void {
  if (!parameters) return;
  for (const key of ["terrainSkeleton", "rivers", "lakes"] as const)
    migrateCount(parameters[key] as Record<string, unknown> | undefined);
}

/** Normalize active and archived author fields without replacing geometry or stable identities.
 * @param document Detached author document being imported or upgraded.
 */
export function migratePlanningDocumentCounts(document: PlanningDocument): void {
  migratePlanningRecipeCounts(document.passthrough.parameters);
  for (const scope of [document, ...Object.values(document.layoutOverrides ?? {})]) {
    for (const type of ["terrain", "rivers", "lakes"]) migrateCount(scope.entities.world?.components[type]?.values);
    if ("parameters" in scope) migratePlanningRecipeCounts(scope.parameters);
  }
}
