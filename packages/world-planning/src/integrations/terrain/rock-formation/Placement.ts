import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { RockFormationMesh, V3 } from "@galacean/engine-terrain/rock-formation/types";
import { rockObbId } from "./Authoring.ts";

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
