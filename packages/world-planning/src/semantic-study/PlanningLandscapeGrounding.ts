import type { IslandPlan } from "./IslandPlanModel";
import { planningGroundSurface } from "./PlanningHeightmap";

/** Resolve ground-bound landscape anchors after region elevation and terrain cuts.
 * baseHeight is derived terrain data, not an authored vertical offset. Both native
 * population and whiteboxes must consume the final decoded terrain surface.
 */
export function groundPlanningLandscapes(plan: IslandPlan): void {
  if (!plan.landscapes?.length) return;
  const ground = planningGroundSurface(plan).sample;
  for (const landscape of plan.landscapes) landscape.baseHeight = ground(landscape.center);
}
