import type { RuntimeEditorEdit } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { PlanningWorkerClient } from "../src/planning/semantic-study/PlanningWorkerClient.ts";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import type { SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { exportPlanningAuthoring, exportPlanningRecipe, upgradePlanningDocument, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { PLANNING_PROJECT_PATH } from "../src/planning/spatial/runtime/PlanningProjectStorage.ts";
import { planningSourceDocument } from "../src/planning/spatial/runtime/PlanningProjectSource.ts";
import type { RockFormationClient } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Client";
import { masonryRockTerrainSource } from "@galacean/engine-world-planning/masonry/MasonryPlacement";

/** Resolve only when a draft needs first-time buildings. This detached solve
 * cannot supersede the live planning worker or publish a world. */
export async function buildingInitializationInputs(edit: Pick<RuntimeEditorEdit, "run">, signal: AbortSignal,
  current: { document: PlanningDocument; result: SemanticResult }, rocks: RockFormationClient, initialDocument = current.document) {
  const document = await edit.run(({ draft }) => {
    const source = planningSourceDocument(draft.preview());
    if (source) return upgradePlanningDocument(source);
    const raw = draft.fileProvider().read(PLANNING_PROJECT_PATH);
    return typeof raw === "string" ? upgradePlanningDocument(JSON.parse(raw)) : initialDocument;
  }, true, [PLANNING_PROJECT_PATH]);
  const comparable = (document: PlanningDocument) => JSON.stringify({ ...exportPlanningAuthoring(document), revision: 0 });
  let result = current.result;
  if (comparable(document) !== comparable(current.document)) {
    const worker = new PlanningWorkerClient();
    const abort = () => worker.dispose();
    signal.throwIfAborted();
    signal.addEventListener("abort", abort, { once: true });
    try {
      const recipe = exportPlanningRecipe(document);
      const solved = await worker.run(recipe.parameters, recipe.edits, undefined, document);
      signal.throwIfAborted();
      if (!solved?.accepted) throw Error("Building initialization requires an accepted planning draft");
      result = solved;
    } finally { signal.removeEventListener("abort", abort); worker.dispose(); }
  }
  signal.throwIfAborted();
  const plan = result.plan, height = planningHeightmap(plan);
  const formations = await rocks.prepare(plan, signal);
  signal.throwIfAborted();
  // Same R16 field/decode/origin as PlanningPopulationData; no raster/material
  // publication is needed to construct authoring components.
  return { plan, terrain: masonryRockTerrainSource({ revision: document.revision, grid: {
    samples: height.encoded.slice(), resolution: height.resolution, origin: [0, 0], size: plan.parameters.width,
    decode: { offset: height.decodeOffset, scale: height.decodeScale }
  } }, formations, document.revision) };
}
