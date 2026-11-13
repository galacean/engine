import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import type { SemanticResult } from "../../../semantic-study/WorldPlanningContract.ts";
import { adoptPlanningHeightmap, cachedPlanningHeightmap } from "../../../semantic-study/PlanningHeightmap.ts";
import { applyRockObbSizes } from "./Authoring.ts";

const rockComponent = (type: string) => type === "rockObb" || type === "rockFormation";

/** Rock-only authoring retains terrain and spatial layout; runtime building supports
 * can still depend on the changed surface and must be published with it.
 * Check the actual documents, including undo/redo and inherited source edits. */
export function isRockFormationOnlyEdit(previous: PlanningDocument, next: PlanningDocument): boolean {
  const ids = new Set([...Object.keys(previous.entities), ...Object.keys(next.entities)]);
  const state = (document: PlanningDocument, other: PlanningDocument) =>
    JSON.stringify({
      ...document,
      revision: 0,
      entities: Object.fromEntries(
        [...ids].flatMap((id) => {
          const entity = document.entities[id],
            opposite = other.entities[id];
          if (!entity) return [];
          const components = Object.fromEntries(
            Object.entries(entity.components).filter(([type]) => !rockComponent(type))
          );
          // The first edit lazily creates a generated box's sparse author record.
          if (
            !opposite &&
            !entity.origin &&
            !entity.parent &&
            !Object.keys(components).length &&
            Object.keys(entity.components).some(rockComponent)
          )
            return [];
          return [[id, { ...entity, components }]];
        })
      )
    });
  return state(previous, next) === state(next, previous);
}

/** Derive only OBB output; the immutable spatial solve and canonical terrain are retained. */
export function prepareRockFormationEdit(previous: SemanticResult, document: PlanningDocument): SemanticResult {
  const started = performance.now(),
    plan = { ...previous.plan };
  applyRockObbSizes(plan, document);
  const height = cachedPlanningHeightmap(previous.plan);
  if (height) adoptPlanningHeightmap(plan, height);
  const rocks = (value: typeof plan) => [
    ...value.rocks,
    ...(value.landscapes ?? []).filter((rock) => rock.kind === "rock")
  ];
  const old = new Map(rocks(previous.plan).map((rock) => [rock.id, rock]));
  const changedIds = rocks(plan)
    .filter((rock) => JSON.stringify(rock) !== JSON.stringify(old.get(rock.id)))
    .map((rock) => rock.id);
  return {
    ...previous,
    plan,
    execution: "local",
    waterUpdate: undefined,
    contentUpdate: undefined,
    parameterCorrections: [],
    changedIds,
    timings: { rockAuthoring: performance.now() - started }
  };
}
