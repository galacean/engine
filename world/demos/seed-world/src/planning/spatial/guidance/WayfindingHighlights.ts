import { isGlobalRoadId } from "@galacean/engine-world-planning/spatial/layout/RoadIdentity";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";

/** Project published guidance ownership to view highlights; never infer it from object names or types. */
export function wayfindingHighlights(plan?: IslandPlan) {
  const elements = new Set<string>(), paths = new Set<string>();
  if (plan) {
    const present = new Set([...plan.rocks, ...(plan.landscapes ?? [])].map(p => p.id));
    const routes = new Set(plan.routes.map(p => p.id));
    // S-bend/clearance parameters also apply to access edges without a separate POI-to-POI cue report.
    for (const route of plan.routes) if (isGlobalRoadId(route.id)) paths.add(route.id);
    for (const guidance of plan.visualGuidance ?? []) {
      if (routes.has(guidance.sourceId)) paths.add(guidance.sourceId);
      for (const id of guidance.memberIds) if (present.has(id)) elements.add(id);
    }
  }
  return { elements: [...elements], paths: [...paths] };
}
