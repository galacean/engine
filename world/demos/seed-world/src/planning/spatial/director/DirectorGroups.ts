import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { poiMemberIds } from "@galacean/engine-world-planning/semantic-study/PoiContents";
import type { ColorAssignments } from "@galacean/engine-world-planning/spatial/director/DirectorMask";

/** Resolve endpoint content from published ownership. Surrounding scenery is not the destination itself. */
export function endpointGroups(plan: IslandPlan, fromId: string, toId: string) {
  const ambient = new Set((plan.landscapes ?? []).filter((p) => p.role !== "poi").map((p) => p.id));
  const members = (id: string) => {
    const site = plan.poiDistribution?.sites.find((p) => p.id === id);
    return site ? poiMemberIds(plan, site).filter((member) => !ambient.has(member)) : [];
  };
  const origin = members(fromId),
    target = members(toId);
  const colors: ColorAssignments = {};
  for (const id of origin) colors[id] = "blue";
  for (const id of target) colors[id] = "green";
  return { colors, targets: new Set(target), origin };
}
