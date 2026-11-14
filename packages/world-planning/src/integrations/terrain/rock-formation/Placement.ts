import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { RockFormationMesh, V3 } from "@galacean/engine-terrain/rock-formation/types";
import { rockObbId } from "./Authoring.ts";
import { ConstructionGroundSupports } from "@galacean/engine-building/building/runtime/ConstructionGroundSupports";

const supportQueries = new WeakMap<RockFormationMesh, { query: ConstructionGroundSupports; bounds: number[] }>();

/** Query the actual immutable rock triangles at their displayed placements.
 * Vegetation and buildings share the native vertical support algorithm; no fitted
 * height field or renderer/physics readback is introduced. */
export function rockFormationGround(plan: IslandPlan, formations: readonly RockFormationMesh[]) {
  const surfaces = rockFormationPlacements(plan, formations).map(({ formation, origin }) => {
    let support = supportQueries.get(formation);
    if (!support) {
      const bounds = [Infinity, Infinity, -Infinity, -Infinity],
        p = formation.mesh.positions;
      for (let i = 0; i < p.length; i += 3) {
        bounds[0] = Math.min(bounds[0], p[i]);
        bounds[1] = Math.min(bounds[1], p[i + 2]);
        bounds[2] = Math.max(bounds[2], p[i]);
        bounds[3] = Math.max(bounds[3], p[i + 2]);
      }
      support = { query: new ConstructionGroundSupports([formation.mesh]), bounds };
      supportQueries.set(formation, support);
    }
    return { ...support, origin };
  });
  return (x: number, z: number, fallback: number): number => {
    let height = fallback;
    for (const { query, bounds, origin } of surfaces) {
      const px = x - origin[0],
        pz = z - origin[2];
      if (px < bounds[0] || px > bounds[2] || pz < bounds[1] || pz > bounds[3]) continue;
      height = query.sample(px, pz, height - origin[1]) + origin[1];
    }
    return height;
  };
}

/** Shared by mesh rendering, collision and grass; origin Y alone is not the displayed elevation. */
export function rockFormationPlacements(plan: IslandPlan, formations: readonly RockFormationMesh[]) {
  const bottoms = new Map<string, number>();
  for (const rock of plan.rocks) {
    const y = rock.boxes?.length
      ? Math.min(...rock.boxes.map((b) => b.elevation ?? rock.baseHeight ?? 0))
      : (rock.baseHeight ?? 0);
    bottoms.set(rock.groupId, Math.min(bottoms.get(rock.groupId) ?? Infinity, y));
    for (const box of rock.boxes ?? [{ id: rock.id, elevation: rock.baseHeight }])
      bottoms.set(rockObbId(rock.id, box.id), box.elevation ?? rock.baseHeight ?? y);
  }
  for (const rock of plan.landscapes ?? []) if (rock.kind === "rock") bottoms.set(rock.id, rock.baseHeight);
  return formations.map((formation) => ({
    formation,
    origin: [formation.origin[0], bottoms.get(formation.id) ?? formation.origin[1], formation.origin[2]] as V3
  }));
}
