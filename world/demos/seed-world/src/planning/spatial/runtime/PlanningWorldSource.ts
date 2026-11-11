import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { applyPlanningTemplateSurface, initialPlanningTemplate, updateDesertPreviewRelief } from "../PlanningStartupTemplate.ts";
import { removeDesertCamelPreset } from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { resetPlanningFarmSaveChoice } from "../farming/PlanningFarmSave.ts";
import { PlanningSession, type PlanningSessionOptions } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { exportPlanningRecipe, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { PlanningWorkerClient } from "../../semantic-study/PlanningWorkerClient.ts";
import { SEMANTIC_DEFAULTS, type SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { defaultPoiLayout } from "@galacean/engine-world-planning/semantic-study/PoiDistribution";

/** Accepted editor state passed directly to the original Seed scene. No URL-encoded geometry. */
export interface PlanningWorldHandoff {
  document: PlanningDocument;
  result: SemanticResult;
}

/** Acquire authoring/storage/worker ownership without publishing. The native page
 * can install its scene preparation boundary after engine resources are ready,
 * before the first document (including restored buildings) is accepted.
 */
export async function createPlanningWorldSource(search: string, handoff: PlanningWorldHandoff | undefined, storage: {
  load(seed: number): Promise<PlanningDocument | undefined>; save(document: PlanningDocument): Promise<void>;
  initialize?(document: PlanningDocument, result: SemanticResult): Promise<PlanningDocument>;
}) {
  const query = new URLSearchParams(search);
  const raw = query.get("seed");
  const seed = raw !== null && /^\d+$/.test(raw) && Number(raw) <= 0xffffffff ? Number(raw) : SEMANTIC_DEFAULTS.seed;
  let document = handoff?.document ?? await storage.load(seed);
  let replaceSavedTemplate = false;
  if (!handoff && document) {
    resetPlanningFarmSaveChoice(document);
    if (import.meta.env.DEV && query.get("desertSkyLab") === "1") updateDesertPreviewRelief(document);
  }
  const client = new PlanningWorkerClient();
  if (!handoff) {
    const template = initialPlanningTemplate(search, seed,
      document ? exportPlanningRecipe(document).parameters.worldTemplate?.id ?? "" : undefined);
    if (template !== undefined) {
      replaceSavedTemplate = !!document;
      try {
        document = await client.initialize(seed, undefined, template);
        applyPlanningTemplateSurface(document);
      }
      catch (error) { client.dispose(); throw error; }
    }
  }
  if (document) removeDesertCamelPreset(document);
  let accepted = handoff?.result;
  if (storage.initialize) {
    try {
      document ??= createSeedPlanningDocument(seed);
      const recipe = exportPlanningRecipe(document);
      accepted ??= await client.run(recipe.parameters, recipe.edits, undefined, document);
      if (!accepted?.accepted) throw new Error("Water authoring initialization requires an accepted planning result");
      document = await storage.initialize(document, accepted);
    } catch (error) { client.dispose(); throw error; }
  }
  // Source/project history owns undo; the runtime session is a derived consumer.
  const options: PlanningSessionOptions = { history: false };
  let disposed = false, started = false;
  const session = new PlanningSession(
    { version: 2, parameters: { ...SEMANTIC_DEFAULTS, seed, poiLayout: defaultPoiLayout() }, edits: {} },
    async (document, previous, signal) => {
      if (disposed) throw new Error("Planning world source disposed");
      if (accepted) { const result = accepted; accepted = undefined; return result; }
      const recipe = exportPlanningRecipe(document);
      const result = await client.run(recipe.parameters, recipe.edits, previous, document, signal);
      if (disposed) throw new Error("Planning world source disposed");
      return result;
    },
    document ?? createSeedPlanningDocument(seed),
    options
  );
  const dispose = () => { if (!disposed) { disposed = true; client.dispose(); } };
  return {
    session,
    replaceSavedTemplate,
    async initialize(preparePublication?: PlanningSessionOptions["preparePublication"]) {
      if (disposed) throw new Error("Planning world source disposed");
      if (started) throw new Error("Planning world source initialization already started");
      started = true;
      if (preparePublication) options.preparePublication = async (document, result, context) => {
        if (disposed) throw new Error("Planning world source disposed");
        const candidate = await preparePublication(document, result, context);
        if (disposed) { await candidate.discard(); throw new Error("Planning world source disposed"); }
        return candidate;
      };
      try {
        await session.initialize();
        if (disposed) throw new Error("Planning world source disposed");
      } catch (error) { dispose(); throw error; }
    },
    save: () => {
      if (disposed || !session.result) throw new Error("Planning world source is not published");
      // save synchronously serializes the invocation snapshot before queuing I/O;
      // cloning the same author graph first adds a redundant main-thread pass.
      return storage.save(session.document);
    },
    dispose
  };
}

/** Compatibility bootstrap for headless callers without a native scene owner. */
export async function loadPlanningWorldSource(search: string, handoff: PlanningWorldHandoff | undefined, storage: {
  load(seed: number): Promise<PlanningDocument | undefined>; save(document: PlanningDocument): Promise<void>;
}) {
  const source = await createPlanningWorldSource(search, handoff, storage);
  await source.initialize();
  return source;
}
