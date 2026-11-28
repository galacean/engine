import { newLandformCollisions } from "./WorldLocalCollisions";
import type { SemanticParameters, SemanticEdit, SemanticResult } from "./WorldPlanningContract";
import { planStudyLandforms } from "./WorldStudyLandforms";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
/** Rebuild only changed study landforms, preserving every unrelated published record.
 * @returns A local transaction, or undefined when a broader edit requires the planner.
 */
export function updatePlanningLandform(
  parameters: SemanticParameters,
  edits: Record<string, SemanticEdit>,
  previous: SemanticResult
): SemanticResult | undefined {
  if (
    !previous.accepted ||
    !previous.plan.landformStudy ||
    JSON.stringify(parameters) !== JSON.stringify(previous.recipe.parameters)
  )
    return;
  const changed = [...new Set([...Object.keys(edits), ...Object.keys(previous.recipe.edits)])].filter(
    (id) => JSON.stringify(edits[id] ?? {}) !== JSON.stringify(previous.recipe.edits[id] ?? {})
  );
  if (!changed.length) return;
  for (const id of changed) {
    if (!previous.plan.mountains.some((m) => m.id === id && id.startsWith("landform-"))) return;
    const a = { ...edits[id] },
      b = { ...previous.recipe.edits[id] };
    for (const k of ["variation", "variantSeed", "landformType"] as const) {
      delete a[k];
      delete b[k];
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) return;
  }
  const start = performance.now(),
    plan = structuredClone(previous.plan),
    owners = new Set(changed),
    notes: string[] = [],
    localEdits = structuredClone(edits);
  for (const id of changed) {
    const m = plan.planning!.modules.find((m) => m.id === id)!;
    localEdits[id] = {
      ...localEdits[id],
      placement: {
        origin: { x: Number(m.resolved.originX), z: Number(m.resolved.originZ) },
        size: 1,
        footprints: m.outlines ?? [m.outline]
      }
    };
  }
  plan.rocks = plan.rocks.filter((r) => !owners.has(r.groupId));
  plan.mountains = plan.mountains.filter((m) => !owners.has(m.id));
  plan.shapeRecipes = plan.shapeRecipes?.filter((r) => !owners.has(r.id));
  const owned = (id: string) =>
    changed.some((owner) => id === owner || id === `${owner}-water-domain` || id === `${owner}-structure`);
  plan.planning!.modules = plan.planning!.modules.filter((m) => !owned(m.id));
  plan.structures = plan.structures?.filter((s) => !s.bankIds.some((id) => owners.has(id)));
  try {
    planStudyLandforms(
      {
        plan,
        edits: localEdits,
        notes,
        parameters: { seed: parameters.seed },
        frame: { angle: parameters.landOrientation * Math.PI * 2 },
        random: () => {
          throw new Error("局部编辑禁止重新选址");
        }
      },
      owners
    );
  } catch (error) {
    return { ...previous, accepted: false, changedIds: [], notes: [String(error), "保留上次布局"] };
  }
  const collisions = newLandformCollisions(previous.plan, plan, owners);
  if (collisions.length)
    return {
      ...previous,
      accepted: false,
      changedIds: [],
      notes: [`局部占地新增碰撞：${collisions.join("、")}；保留已发布布局，不移动其他模块`]
    };
  const ground = createPlanningGroundSampler(plan);
  for (const rock of plan.rocks)
    if (owners.has(rock.groupId)) {
      rock.baseHeight = ground(rock.center);
      for (const box of rock.boxes ?? []) box.elevation = (box.elevation ?? 0) + rock.baseHeight;
    }
  const data = plan.planning!;
  data.revision++;
  data.changedIds = changed;
  data.rounds = 0;
  notes.push(`地貌局部更新 ${Math.round(performance.now() - start)}ms；其他布局阶段重算 0`);
  return { recipe: { version: 2, parameters, edits }, plan, accepted: true, checks: [], changedIds: changed, notes };
}
