import { describe, expect, it } from "vitest";
import { planningCandidateCount } from "@galacean/engine-world-planning/spatial/PlanningCountRange";
import { SEMANTIC_DEFAULTS, type SemanticRecipe } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { generateRiverRegions, RIVER_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/RiverRegions";
import { generateLakeRegions, LAKE_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/LakeRegions";
import { importPlanningDocument, exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";

const recipe = (): SemanticRecipe => ({ version: 2, parameters: { ...SEMANTIC_DEFAULTS, seed: 1,
  terrainSkeleton: { countMin: 2, countMax: 2, directionDegrees: 45, heightM: 10, widthM: 160 },
  rivers: { countMin: 1, countMax: 1 }, lakes: { countMin: 1, countMax: 1 } }, edits: {} });
function generate(input: SemanticRecipe) {
  const plan = createSpatialTerrainPlan(input);
  generateRiverRegions(plan, { ...RIVER_DEFAULTS, ...input.parameters.rivers }, {});
  generateLakeRegions(plan, { ...LAKE_DEFAULTS, ...input.parameters.lakes }, {});
  return { patches: plan.parameters.terrainPatches, waters: plan.waters };
}

describe("planning candidate count ranges", () => {
  it("samples stable bounded counts and preserves equal-endpoint geometry through authoring", () => {
    const counts = Array.from({ length: 20 }, (_, seed) => planningCandidateCount(seed, "rivers:count", { countMin: 1, countMax: 4 }, 1));
    expect(counts.every(count => count >= 1 && count <= 4)).toBe(true);
    expect(new Set(counts).size).toBeGreaterThan(1);
    expect(counts).toEqual(Array.from({ length: 20 }, (_, seed) => planningCandidateCount(seed, "rivers:count", { countMin: 1, countMax: 4 }, 1)));
    const input = recipe();
    const document = importPlanningDocument(input);
    const restored = exportPlanningRecipe(document);
    expect(restored.parameters.rivers).toMatchObject({ countMin: 1, countMax: 1 });
    expect(restored.parameters.terrainSkeleton).toMatchObject({ countMin: 2, countMax: 2 });
    expect(generate(restored)).toEqual(generate(input));
  }, 60000);

  it("exposes range pairs and allows infeasible water requests to return fewer objects", () => {
    for (const type of ["terrain", "rivers", "lakes"]) {
      const definition = planningRegistry.get(type);
      expect(definition.ranges).toContainEqual(["countMin", "countMax"]);
      expect(definition.fields.some(field => field.key === "count")).toBe(false);
    }
    const plan = createSpatialTerrainPlan(recipe());
    const checks = generateLakeRegions(plan, { ...LAKE_DEFAULTS, countMin: 2, countMax: 3, radiusM: 2000 }, {});
    expect(plan.waters.filter(water => water.kind === "lake")).toHaveLength(0);
    expect(checks.every(check => !check.required)).toBe(true);
    expect(() => planningCandidateCount(1, "lakes:count", { countMin: 3, countMax: 2 }, 1)).toThrow();
  });
});
