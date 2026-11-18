import { boxGroundBottom } from "../layout/VolumeTerrain";
import type { PlanPoint, PlanRock } from "../../semantic-study/IslandPlanModel";
import type { V2Box } from "../V2Model.ts";

/** One published guidance member is one OBB; upper-level placement owns count and spacing. */
export function guidanceRockBox(rock: PlanRock, ground: (point: PlanPoint) => number): V2Box {
  return {
    id: rock.id,
    label: "guidance-volume",
    center: rock.center,
    sizeX: rock.width,
    sizeZ: rock.depth,
    sizeY: rock.height,
    yaw: rock.yaw,
    elevation: boxGroundBottom(rock, ground),
    collision: true,
    occlusion: true
  };
}
