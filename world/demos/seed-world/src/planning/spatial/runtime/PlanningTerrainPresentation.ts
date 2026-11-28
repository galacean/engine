import type { SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";

/** Scene-level boundary: canonical ground owns authoring; a transient view owns presentation only. */
export function preparePlanningTerrainPresentation(
  runtime: Pick<SeedWorldTerrainRuntime, "prepareHeightTransition">,
  previous: SeedWorldFields | undefined,
  next: SeedWorldFields,
  presentation: { -readonly [K in keyof SeedWorldFields]: SeedWorldFields[K] },
  duration: number | undefined,
  dependents?: Parameters<SeedWorldTerrainRuntime["prepareHeightTransition"]>[4]
) {
  if (duration === undefined || !previous) return undefined;
  return runtime.prepareHeightTransition(previous, next, duration, presentation, dependents);
}
