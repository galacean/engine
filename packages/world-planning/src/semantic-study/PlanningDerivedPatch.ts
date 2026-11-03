import type { IslandPlan } from "./IslandPlanModel";
/** All buffers writable by ecology and constrained enrichment. Shared by worker protocol and tests. */
export type PlanningDerivedPatch = Pick<
  IslandPlan,
  "spatialLayout" | "landscapes" | "naturalVegetation" | "flowerRegions" | "rocks" | "visualGuidance" | "planning"
>;
export function planningDerivedPatch(plan: IslandPlan): PlanningDerivedPatch {
  return {
    spatialLayout: plan.spatialLayout,
    naturalVegetation: plan.naturalVegetation,
    landscapes: plan.landscapes,
    flowerRegions: plan.flowerRegions,
    rocks: plan.rocks,
    visualGuidance: plan.visualGuidance,
    planning: plan.planning
  };
}
/** SVG's circle-only update is valid only when every other derived buffer is unchanged. */
export function onlyLandscapeDrawingChanged(before: IslandPlan | null | undefined, after: IslandPlan): boolean {
  return (
    !!before &&
    JSON.stringify([before.rocks, before.flowerRegions, before.visualGuidance, before.farming]) ===
      JSON.stringify([after.rocks, after.flowerRegions, after.visualGuidance, after.farming])
  );
}
