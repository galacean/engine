import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { SemanticResult } from "../../semantic-study/WorldPlanningContract";
import { inheritPlanningHeightmap, type PlanningHeightBounds } from "../../semantic-study/PlanningHeightmap";
import { exportPlanningRecipe, type PlanningDocument } from "../PlanningDocument";
import { generateSpatialWorld } from "../layout/SpatialWorld";

/** Derived publication provenance. Concrete water intent has already been projected from Source. */
export interface PlanningWaterOverlayState {
  mode: "overlay";
  baseSignature: string;
  reason: string;
  bounds: readonly PlanningHeightBounds[];
  dirtyWaterIds: string[];
}
const bases = new Map<string, SemanticResult>();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)])
    );
  return value;
}
function bodyInput(plan: IslandPlan | undefined, id: string): unknown {
  return (
    plan && [
      plan.waters.find((water) => water.id === id),
      plan.planning?.profiles.filter((profile) => profile.ownerId === id)
    ]
  );
}

export function generateWaterOverlay(
  document: PlanningDocument,
  previous?: SemanticResult,
  progress?: (stage: string) => void,
  runtimeSignature = ""
): SemanticResult {
  if (document.waterAuthoringVersion !== undefined && document.waterAuthoringVersion !== 1)
    throw new Error("Unsupported water authoring version");
  const input = structuredClone(document);
  input.revision = 0;
  delete input.waterAuthoringVersion;
  delete input.placementState;
  delete input.layoutOverrides;
  const signature = JSON.stringify([runtimeSignature, canonical(input)]);
  let base = bases.get(signature);
  if (base) {
    bases.delete(signature);
    bases.set(signature, base);
  } else {
    base = generateSpatialWorld(input, previous, progress);
    bases.set(signature, base);
    if (bases.size > 2) bases.delete(bases.keys().next().value!);
  }
  const checks = [...base.checks],
    plan: IslandPlan = {
      ...base.plan,
      authoredResources: structuredClone(document.authoredResources ?? []),
      planning: base.plan.planning && { ...base.plan.planning, revision: document.revision, checks }
    };
  inheritPlanningHeightmap(plan, base.plan);
  const ids = new Set([...plan.waters, ...(previous?.plan.waters ?? [])].map((water) => water.id));
  const dirtyWaterIds = [...ids].filter(
    (id) => JSON.stringify(bodyInput(previous?.plan, id)) !== JSON.stringify(bodyInput(plan, id))
  );
  const dirty = new Set(dirtyWaterIds);
  const bounds = [...plan.waters, ...(previous?.plan.waters ?? [])]
    .filter((water) => dirty.has(water.id) && water.outline.length)
    .map(
      (water) =>
        [
          Math.min(...water.outline.map((point) => point.x)),
          Math.min(...water.outline.map((point) => point.z)),
          Math.max(...water.outline.map((point) => point.x)),
          Math.max(...water.outline.map((point) => point.z))
        ] as PlanningHeightBounds
    );
  return {
    ...base,
    recipe: exportPlanningRecipe(document),
    plan,
    checks,
    changedIds: [...new Set([...base.changedIds, ...dirtyWaterIds])],
    notes: [...base.notes],
    timings: base.timings && { ...base.timings },
    waterOverlay: { mode: "overlay", baseSignature: signature, reason: "source-water", bounds, dirtyWaterIds }
  };
}
