import type { IslandPlan } from "./IslandPlanModel";
import { envelope } from "./IslandPlanAtoms";
import { planningHeightmap, type PlanningHeightmap } from "./PlanningHeightmap";

/** Lowest decoded Terrain value beneath the cells covering a footprint. Bilinear interpolation
 * cannot fall below these vertices. Including boundary cells conservatively embeds the foundation
 * without inventing another height source or missing a narrow river cut between sample points.
 */
function foundationLevel(map: PlanningHeightmap, outline: { x: number; z: number }[]): number {
  const last = map.resolution - 1;
  const x0 = Math.max(0, Math.floor(Math.min(...outline.map((p) => p.x)) / map.spacingX));
  const x1 = Math.min(last, Math.ceil(Math.max(...outline.map((p) => p.x)) / map.spacingX));
  const z0 = Math.max(0, Math.floor(Math.min(...outline.map((p) => p.z)) / map.spacingZ));
  const z1 = Math.min(last, Math.ceil(Math.max(...outline.map((p) => p.z)) / map.spacingZ));
  let minimum = Infinity;
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) minimum = Math.min(minimum, map.heights[z * map.resolution + x]);
  return minimum;
}

/** Resolve ground-bound rock assemblies after all terrain cuts/foundations, before navigation.
 * Translate the whole assembly by its anchor delta; extend only basal boxes down to terrain.
 * Upper stacked parts retain their relative transforms. Reapplying is idempotent, not additive.
 */
export function groundPlanningRocks(plan: IslandPlan): void {
  if (!plan.rocks.length) return;
  const map = planningHeightmap(plan);
  for (const rock of plan.rocks) {
    const oldBase = rock.baseHeight ?? 0;
    const base = map.sample(rock.center),
      delta = base - oldBase;
    // Normalize a single-volume rock once so its authoring height does not accumulate foundation depth.
    const boxes = (rock.boxes ??= [
      {
        id: rock.id,
        label: rock.id,
        center: rock.center,
        sizeX: rock.width,
        sizeZ: rock.depth,
        sizeY: rock.height,
        yaw: rock.yaw,
        elevation: oldBase,
        collision: true,
        occlusion: true
      }
    ]);
    for (const box of boxes) {
      const previous = box.elevation ?? oldBase;
      const bottom = previous + delta;
      const supported = previous <= oldBase + 1e-5;
      box.elevation = supported
        ? Math.min(bottom, foundationLevel(map, envelope(box.center, box.sizeX, box.sizeZ, box.yaw)))
        : bottom;
      box.sizeY += bottom - box.elevation;
    }
    rock.baseHeight = base;
  }
}
