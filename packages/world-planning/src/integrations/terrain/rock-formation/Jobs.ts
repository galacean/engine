import type { IslandPlan, PlanRockBox } from "../../../semantic-study/IslandPlanModel.ts";
import type { PlanningHeightmap } from "../../../semantic-study/PlanningHeightmap.ts";
import { planningRemovedObjectIds } from "../../../spatial/PlanningResources.ts";
import { hashSeed } from "@galacean/engine-terrain/rock-formation/math";
import { rockObbId } from "./Authoring.ts";
import type { RockFormationJob, RockObb, V3 } from "@galacean/engine-terrain/rock-formation/types";

/** Published OBBs are the sole input; no preset, automatic template, or fitted rock asset. */
export function rockFormationJobs(plan: IslandPlan, heightmap: Pick<PlanningHeightmap, "sample">): RockFormationJob[] {
  const groups = new Map<
    string,
    {
      surfaceGrass: boolean;
      boxes: Array<
        Pick<PlanRockBox, "id" | "center" | "sizeX" | "sizeY" | "sizeZ" | "elevation" | "yaw"> & { ownerId: string }
      >;
    }
  >();
  for (const rock of plan.rocks) {
    if (rock.assetId) continue;
    const boxes = (
      rock.boxes ?? [
        {
          id: rock.id,
          center: rock.center,
          sizeX: rock.width,
          sizeY: rock.height,
          sizeZ: rock.depth,
          elevation: rock.baseHeight,
          yaw: rock.yaw
        }
      ]
    ).map((box) => ({ ...box, ownerId: rockObbId(rock.id, box.id) }));
    // Each editable OBB owns its worker result and resident mesh.
    // POI grouping must not make a sibling resize regenerate this rock.
    for (const box of boxes) groups.set(box.ownerId, { surfaceGrass: true, boxes: [box] });
  }
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []);
  for (const rock of plan.landscapes ?? [])
    if (rock.kind === "rock" && !rock.assetId && !removed.has(rock.id)) {
      groups.set(rock.id, {
        surfaceGrass: false,
        boxes: [
          {
            id: rock.id,
            ownerId: plan.poiDistribution ? rock.id : rock.ownerId,
            center: rock.center,
            sizeX: rock.width,
            sizeY: rock.height,
            sizeZ: rock.depth,
            elevation: rock.baseHeight,
            yaw: rock.yaw
          }
        ]
      });
    }
  return Array.from(groups, ([id, { boxes, surfaceGrass }]) => {
    const origin: V3 = [
      boxes.reduce((sum, b) => sum + b.center.x, 0) / boxes.length,
      Math.min(...boxes.map((b) => b.elevation ?? heightmap.sample(b.center))),
      boxes.reduce((sum, b) => sum + b.center.z, 0) / boxes.length
    ];
    const guides: RockObb[] = boxes.map((box) => {
      const c = Math.cos(box.yaw),
        s = Math.sin(box.yaw);
      return {
        id: box.id,
        ownerId: box.ownerId,
        center: [
          box.center.x - origin[0],
          (box.elevation ?? heightmap.sample(box.center)) + box.sizeY / 2 - origin[1],
          box.center.z - origin[2]
        ],
        size: [box.sizeX, box.sizeY, box.sizeZ],
        axes: [
          [c, 0, s],
          [0, 1, 0],
          [-s, 0, c]
        ]
      };
    });
    return {
      id,
      seed: hashSeed(plan.parameters.seed, id),
      surfaceGrass,
      origin,
      guides
    };
  });
}
