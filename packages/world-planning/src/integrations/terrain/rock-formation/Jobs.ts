import type { IslandPlan, PlanRockBox } from "../../../semantic-study/IslandPlanModel.ts";
import type { PlanningHeightmap } from "../../../semantic-study/PlanningHeightmap.ts";
import { planningRemovedObjectIds } from "../../../spatial/PlanningResources.ts";
import { captureRockGround } from "./Ground.ts";
import { hashSeed } from "@galacean/engine-terrain/rock-formation/math";
import { rockObbId } from "./Authoring.ts";
import type { RockDomain, RockFormationJob, RockObb, V3 } from "@galacean/engine-terrain/rock-formation/types";
import { DEFAULT_ROCK_HEIGHT_MODE } from "@galacean/engine-terrain/rock-formation/types";

/** The projection domain follows the published footprint, including rotated OBB corners. */
export function rockFormationDomain(guides: readonly RockObb[]): RockDomain {
  const points = guides.flatMap((g) =>
    [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => [
        g.center[0] + ((x * g.size[0]) / 2) * g.axes[0][0] + ((z * g.size[2]) / 2) * g.axes[2][0],
        g.center[2] + ((x * g.size[0]) / 2) * g.axes[0][2] + ((z * g.size[2]) / 2) * g.axes[2][2]
      ])
    )
  );
  const minX = Math.min(...points.map((p) => p[0])),
    minZ = Math.min(...points.map((p) => p[1]));
  const width = Math.max(...points.map((p) => p[0])) - minX,
    depth = Math.max(...points.map((p) => p[1])) - minZ;
  const padding = Math.max(0.5, Math.max(width, depth) * 0.07);
  return {
    minX: minX - padding,
    minZ: minZ - padding,
    width: width + padding * 2,
    depth: depth + padding * 2,
    resolution: 65
  };
}

/** Published OBBs are the sole input; no preset, automatic template, or fitted rock asset. */
export function rockFormationJobs(plan: IslandPlan, heightmap: PlanningHeightmap): RockFormationJob[] {
  const groups = new Map<
    string,
    {
      surfaceGrass: boolean;
      boxes: Array<
        Pick<
          PlanRockBox,
          | "id"
          | "center"
          | "sizeX"
          | "sizeY"
          | "sizeZ"
          | "elevation"
          | "yaw"
          | "heightMode"
          | "surfaceMode"
          | "slopeMode"
          | "slopeRate"
          | "slopeVariation"
          | "heightVariation"
        > & { ownerId: string }
      >;
    }
  >();
  for (const rock of plan.rocks) {
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
    // Each editable OBB owns its noise domain, worker result and resident mesh.
    // POI grouping must not make a sibling resize regenerate this rock.
    for (const box of boxes) groups.set(box.ownerId, { surfaceGrass: true, boxes: [box] });
  }
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []);
  for (const rock of plan.landscapes ?? [])
    if (rock.kind === "rock" && !removed.has(rock.id)) {
      const { sourceHeight: _sourceHeight, ...shape } = rock.rockGeneration ?? {};
      groups.set(rock.id, {
        surfaceGrass: false,
        boxes: [
          {
            id: rock.id,
            ownerId: plan.poiDistribution ? rock.id : rock.ownerId,
            ...shape,
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
        ...(box.heightMode && box.heightMode !== DEFAULT_ROCK_HEIGHT_MODE ? { heightMode: box.heightMode } : {}),
        ...(box.surfaceMode !== undefined ? { surfaceMode: box.surfaceMode } : {}),
        ...(box.slopeMode !== undefined ? { slopeMode: box.slopeMode } : {}),
        ...(box.slopeRate !== undefined ? { slopeRate: box.slopeRate } : {}),
        ...(box.slopeVariation !== undefined ? { slopeVariation: box.slopeVariation } : {}),
        ...(box.heightVariation !== undefined ? { heightVariation: box.heightVariation } : {}),
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
    const domain = rockFormationDomain(guides);
    return {
      id,
      seed: hashSeed(plan.parameters.seed, id),
      surfaceGrass,
      origin,
      guides,
      domain,
      ground: captureRockGround(heightmap, domain, origin, 16)
    };
  });
}
