import { boxGroundBottom } from "../layout/VolumeTerrain";
import type { IslandPlan, PlanPoint, PlanRock } from "../../semantic-study/IslandPlanModel";
import {
  DEFAULT_ROCK_COLLISION_POLICY,
  resolvePlanRockCollision,
  type RockCollisionPolicy
} from "../RockCollisionPolicy";
import { rockObbId } from "../RockVariantFit";
import type { V2Box } from "../V2Model.ts";

/** One published guidance member is one OBB; upper-level placement owns count and spacing. */
export function guidanceRockBox(
  rock: PlanRock,
  ground: (point: PlanPoint) => number,
  policy: RockCollisionPolicy = DEFAULT_ROCK_COLLISION_POLICY,
  plan?: Pick<IslandPlan, "parameters">
): V2Box {
  return {
    id: rock.id,
    label: "guidance-volume",
    center: rock.center,
    sizeX: rock.width,
    sizeZ: rock.depth,
    sizeY: rock.height,
    yaw: rock.yaw,
    elevation: boxGroundBottom(rock, ground),
    collision: resolvePlanRockCollision(
      plan,
      {
        id: rockObbId(rock.id, rock.id),
        width: rock.width,
        depth: rock.depth,
        height: rock.height,
        assetId: rock.assetId,
        surfaceGrass: true
      },
      policy
    ),
    occlusion: true
  };
}
