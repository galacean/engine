import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { SemanticResult } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { WaterPreviewSites } from "./WaterPreviewSites.ts";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { exportPlanningRecipe, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { planningWaterCreation } from "@galacean/engine-world-planning/spatial/PlanningWaterAuthoring";
import { applySpatialCommands } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { generateRiverRegions, RIVER_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/RiverRegions";
import { generateLakeRegions, LAKE_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/LakeRegions";

import { generateSpatialWorld } from "@galacean/engine-world-planning/spatial/layout/SpatialWorld";
import { projectWaterPreview } from "./WaterPreviewProjection.ts";

export const PREVIEW_CASES = {
  planner: "Planner 水域与桥",
  all: "综合水体与道路",
  stream: "1 米浅溪",
  river: "河流",
  waterfall: "瀑布",
  steps: "阶梯落水",
  lake: "湖泊"
} as const;
export type PreviewCase = keyof typeof PREVIEW_CASES;

/** Case is demo author input, never a generated snapshot. Preserved by author-only export. */
export type WaterPreviewDocument = PlanningDocument & { previewCase?: PreviewCase };
// Full material-independent layout is private transaction state, not preview output or save data.
const sources = new WeakMap<SemanticResult, SemanticResult>();

/** Shared Planner road solving; isolated showcases execute only terrain and hydrology. */
export function compileWaterPreview(document: WaterPreviewDocument, previous?: SemanticResult): SemanticResult {
  if (document.previewCase === "planner" || document.previewCase === "all") {
    const source = generateSpatialWorld(document, previous && sources.get(previous), undefined, { environment: false });
    const result = { ...source, plan: projectWaterPreview(source.plan) };
    sources.set(result, source);
    return result;
  }
  const recipe = exportPlanningRecipe(document);
  const notes: string[] = [];
  const plan = createSpatialTerrainPlan(recipe, notes);
  const rivers = Object.fromEntries(
    Object.entries(recipe.edits)
      .filter(([, e]) => e.rivers)
      .map(([id, e]) => [id, e.rivers!])
  );
  const lakes = Object.fromEntries(
    Object.entries(recipe.edits)
      .filter(([, e]) => e.lakes)
      .map(([id, e]) => [id, e.lakes!])
  );
  const checks = [
    ...generateRiverRegions(plan, { ...RIVER_DEFAULTS, ...recipe.parameters.rivers, countMin: 0, countMax: 0 }, rivers),
    ...generateLakeRegions(plan, { ...LAKE_DEFAULTS, ...recipe.parameters.lakes, countMin: 0, countMax: 0 }, lakes)
  ];
  return {
    recipe,
    plan,
    checks,
    accepted: true,
    changedIds: plan.waters.map((w) => w.id),
    notes,
    execution: "full"
  };
}

export function createWaterPreviewDocument(seed: number, scenario: PreviewCase): WaterPreviewDocument {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed 须为 0–4294967295 的整数");
  // Identical first-visit world and terrain settings to the reference Planner page (Seed 1).
  const document: WaterPreviewDocument = createSeedPlanningDocument(seed);
  document.previewCase = scenario;
  if (scenario === "planner") return document;
  const plan = createSpatialTerrainPlan(exportPlanningRecipe(document));
  // Exclude the same initially generated water corridors/lakes that Planner will publish.
  const recipe = exportPlanningRecipe(document);
  generateRiverRegions(plan, { ...RIVER_DEFAULTS, ...recipe.parameters.rivers }, {});
  generateLakeRegions(plan, { ...LAKE_DEFAULTS, ...recipe.parameters.lakes }, {});
  const sites = new WaterPreviewSites(plan);
  const active = (kind: PreviewCase) => scenario === "all" || scenario === kind;
  const lake = active("lake") ? sites.lake() : undefined;
  for (const kind of ["stream", "river", "waterfall", "steps"] as const) {
    if (!active(kind)) continue;
    const { points, sections } = sites.river(kind);
    Object.assign(
      document,
      applySpatialCommands(
        document,
        [
          planningWaterCreation({
            kind: "river",
            id: `river:authored:${kind}`,
            parameters: {
              points,
              bankWidthM: 2,
              sections
            }
          })
        ],
        planningRegistry
      )
    );
    document.entities[`river:authored:${kind}`].name = PREVIEW_CASES[kind];
  }
  if (lake) {
    const { center, radius, referenceLevel } = lake;
    const shoreline = Array.from({ length: 32 }, (_, i) => ({
      id: `shore-${i}`,
      ring: "shore",
      x: center.x + Math.cos((i / 32) * Math.PI * 2) * radius,
      z: center.z + Math.sin((i / 32) * Math.PI * 2) * radius
    }));
    Object.assign(
      document,
      applySpatialCommands(
        document,
        [
          planningWaterCreation({
            kind: "lake",
            id: "lake:authored:preview",
            parameters: {
              shoreline,
              referenceLevel,
              radiusM: radius,
              depthM: 2,
              bankWidthM: 2,
              allowCarving: true
            }
          })
        ],
        planningRegistry
      )
    );
    document.entities["lake:authored:preview"].name = "湖泊";
  }
  return document;
}

export async function createWaterPreviewSession(seed: number, scenario: PreviewCase): Promise<PlanningSession> {
  const document = createWaterPreviewDocument(seed, scenario);
  const session = new PlanningSession(
    exportPlanningRecipe(document),
    async (document, previous) => compileWaterPreview(document, previous),
    document,
    { history: true }
  );
  await session.initialize();
  return session;
}
