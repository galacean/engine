import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import { roadSurfaces } from "../layout/RoadTopology";
import {
  categoryRoadBoundaryClearance,
  circleOverlapsOrientedRectangle,
  populationFootprintTouchesDryLand,
  type SeedWorldPopulationInstance
} from "../../runtime/SeedWorldPopulationPlan.ts";
import type { SeedWorldFields } from "../../runtime/SeedWorldFields.ts";

/** Apply existing authored-tree placement rules to current planning geometry, including removal tombstones. */
export function createPlanningTreeEligibility(
  plan: IslandPlan,
  ground: (point: PlanPoint) => number,
  fields: Pick<SeedWorldFields, "sizeMetres" | "surfaceResolution" | "waterMask">
) {
  const roads = roadSurfaces(plan)
    .filter((route) => route.outline?.length)
    .map((route) => createPlanningRingQuery(route.outline!));
  const rocks = planningWhiteboxes(plan, ground)
    .filter((part) => part.layer === "rock" || part.layer === "landscape-rock")
    .flatMap((part) => part.boxes);
  return (instance: Pick<SeedWorldPopulationInstance, "normalizedPosition" | "footprintMetres">) => {
    const x = instance.normalizedPosition.x * fields.sizeMetres,
      z = instance.normalizedPosition.y * fields.sizeMetres;
    const radius = Math.max(...instance.footprintMetres) * 0.5,
      point = { x, z };
    // The shared legacy mask predicate uses a centred coordinate frame.
    if (!populationFootprintTouchesDryLand(fields, x - fields.sizeMetres / 2, z - fields.sizeMetres / 2, radius))
      return false;
    const roadClearance = radius + categoryRoadBoundaryClearance("tree");
    if (
      roads.some(
        (road) =>
          road.within(point, roadClearance) &&
          (road.inside(point) || road.distance(point, roadClearance) < roadClearance)
      )
    )
      return false;
    return !rocks.some((box) =>
      circleOverlapsOrientedRectangle(
        x,
        z,
        radius,
        box.center.x,
        box.center.z,
        box.sizeX / 2,
        box.sizeZ / 2,
        Math.cos(box.yaw),
        Math.sin(box.yaw)
      )
    );
  };
}
