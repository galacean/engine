import { settlementRandom } from "../semantic-study/SettlementGeometry";

/** Candidate-count preferences for initial layout generation. */
export interface PlanningCountRange {
  countMin?: number;
  countMax?: number;
}

/** Resolve a stable candidate budget; spatial feasibility may produce fewer objects.
 * @param seed World or landform Seed.
 * @param stream Independent deterministic count stream.
 * @param values Author range.
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
  const min = values.countMin ?? fallback;
  const max = values.countMax ?? fallback;
  if (![min, max].every((value) => Number.isSafeInteger(value) && value >= 0) || min > max)
    throw new Error("数量范围须为非负整数且下限不大于上限");
  return min + Math.min(max - min, Math.floor(settlementRandom(seed, stream) * (max - min + 1)));
}
