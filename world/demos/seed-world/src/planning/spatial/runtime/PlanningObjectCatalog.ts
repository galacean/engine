import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes";
import { planningGroundSurface } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import type { SeedWorldObject } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { rockObbId } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Authoring";

/** Object identities and bounds come from the same solid parts used by rendering and collision. */
export function planningSolidObjects(plan: IslandPlan, revision: number): SeedWorldObject[] {
  const ground = planningGroundSurface(plan).sample;
  const parts = planningWhiteboxes(plan, ground).filter(part => part.layer === "rock" || part.layer === "landscape-rock");
  for (const rock of plan.rocks) for (const box of rock.boxes ?? [{ id: rock.id, label: rock.id, center: rock.center,
    sizeX: rock.width, sizeY: rock.height, sizeZ: rock.depth, yaw: rock.yaw, elevation: rock.baseHeight,
    collision: true, occlusion: true }])
    parts.push({ id: rockObbId(rock.id, box.id), layer: "rock", boxes: [box] });
  return parts
    .filter(part => part.boxes.length > 0).map(part => {
      const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
      const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const box of part.boxes) {
        const c = Math.abs(Math.cos(box.yaw)), s = Math.abs(Math.sin(box.yaw));
        const dx = (c * box.sizeX + s * box.sizeZ) / 2, dz = (s * box.sizeX + c * box.sizeZ) / 2;
        const y = box.elevation ?? ground(box.center);
        minimum[0] = Math.min(minimum[0], box.center.x - dx); minimum[1] = Math.min(minimum[1], y);
        minimum[2] = Math.min(minimum[2], box.center.z - dz);
        maximum[0] = Math.max(maximum[0], box.center.x + dx); maximum[1] = Math.max(maximum[1], y + box.sizeY);
        maximum[2] = Math.max(maximum[2], box.center.z + dz);
      }
      return { catalogOwner: "planning" as const, worldId: `seed-world-${plan.parameters.seed}`, worldRevision: revision, objectId: part.id,
        objectKind: part.layer === "rock" ? "rock" : "small-rock", source: { kind: "decoration", sourceId: part.id },
        position: [(minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, (minimum[2] + maximum[2]) / 2],
        footprintMetres: [maximum[0] - minimum[0], maximum[2] - minimum[2]], properties: { bounds: { minimum, maximum } } };
    });
}
