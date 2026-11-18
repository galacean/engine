import { sampleLakeBoundary, triangulateLakeBoundary } from "@galacean/engine-water/water/compiler/index";
import { planningLakeBoundary } from "./PlanningLakeBoundary";
import type { IslandPlan, PlanWater } from "./IslandPlanModel";
import type { V2Mesh } from "../spatial/V2Model.ts";

/** The whitebox and native Lake share the same accepted bed and resolved wet contour. */
export function planningLakeMesh(plan: IslandPlan, water: PlanWater): V2Mesh {
  const boundary = sampleLakeBoundary(planningLakeBoundary(plan, water).boundary);
  const positions = Array.from(triangulateLakeBoundary(boundary, 200000));
  return { positions, indices: Array.from({ length: positions.length / 3 }, (_, i) => i) };
}
