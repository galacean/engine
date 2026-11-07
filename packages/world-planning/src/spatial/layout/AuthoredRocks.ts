import type { IslandPlan, PlanPoint, PlanRock } from "../../semantic-study/IslandPlanModel";
import { envelope } from "../../semantic-study/IslandPlanAtoms";
import type { PlanningDocument } from "../PlanningDocument";
import { planningRegistry } from "../PlanningComponents";
import { resolveComponent } from "../SpatialDocument";

/** Authored rock solids have no placement solver: dimensions and shape are independent author inputs.
 * Project after roads/ecology so distant scenery cannot expand the playable terrain or acquire POIs.
 */
export function projectAuthoredRocks(
  plan: IslandPlan,
  document: PlanningDocument,
  ground: (point: PlanPoint) => number
): void {
  const rocks: PlanRock[] = [];
  for (const entity of Object.values(document.entities)) {
    if (entity.origin !== "authored" || !entity.components.solid || !entity.components.rockFormation) continue;
    const { values } = resolveComponent(document, entity.id, "solid", planningRegistry);
    const center = { x: Number(values.x), z: Number(values.z) };
    const width = Number(values.width),
      depth = Number(values.depth),
      height = Number(values.height);
    const yaw = (Number(values.yawDegrees) * Math.PI) / 180;
    const baseHeight = values.elevation === undefined ? ground(center) : Number(values.elevation);
    const outline = envelope(center, width, depth, yaw);
    rocks.push({
      id: entity.id,
      groupId: entity.parent ?? "world",
      authored: true,
      center,
      width,
      depth,
      height,
      yaw,
      baseHeight,
      outline,
      obb: outline,
      role: "peak"
    });
  }
  plan.rocks = [...plan.rocks.filter((rock) => !rock.authored), ...rocks];
}
