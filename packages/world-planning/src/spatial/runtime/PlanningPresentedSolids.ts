import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { sampleSeedWorldHeight, type SeedWorldFields } from "../../runtime/SeedWorldFields.ts";

/** Reproject terrain-bound solid anchors without mutating canonical layout.
 * Preserve each final anchor's offset/compound-box arrangement. Bridge decks
 * have their own water/road elevation contract and are not ground anchors. */
export function planningPresentedSolids(
  plan: IslandPlan,
  current: SeedWorldFields,
  final: SeedWorldFields
): IslandPlan {
  if (current.heightSamples === final.heightSamples && current.heightDecode === final.heightDecode) return plan;
  const delta = (p: PlanPoint) =>
    (sampleSeedWorldHeight(current, p.x, p.z) ?? 0) - (sampleSeedWorldHeight(final, p.x, p.z) ?? 0);
  const box = <T extends { center: PlanPoint; elevation?: number }>(value: T, shift = delta(value.center)): T => ({
    ...value,
    elevation: value.elevation === undefined ? undefined : value.elevation + shift
  });
  return {
    ...plan,
    buildings: plan.buildings.map((value) => ({
      ...value,
      baseHeight: value.baseHeight === undefined ? undefined : value.baseHeight + delta(value.center)
    })),
    rocks: plan.rocks.map((value) => {
      const shift = delta(value.center);
      return {
        ...value,
        baseHeight: value.baseHeight === undefined ? undefined : value.baseHeight + shift,
        boxes: value.boxes?.map((value) => box(value, shift))
      };
    }),
    landscapes: plan.landscapes?.map((value) => ({ ...value, baseHeight: value.baseHeight + delta(value.center) })),
    fences: plan.fences?.map((value) => box(value)),
    courtyards: plan.courtyards?.map((value) => ({ ...value, fences: value.fences.map((value) => box(value)) }))
  };
}
