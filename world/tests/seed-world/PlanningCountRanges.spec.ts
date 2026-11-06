import { describe, expect, it } from "vitest";
import { planningCandidateCount } from "@galacean/engine-world-planning/spatial/PlanningCountRange";
import { SEMANTIC_DEFAULTS, type SemanticRecipe } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { generateRiverRegions, RIVER_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/RiverRegions";
import { generateLakeRegions, LAKE_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/LakeRegions";
import { importPlanningDocument, exportPlanningRecipe, upgradePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";

const recipe = (): SemanticRecipe => ({ version: 2, parameters: { ...SEMANTIC_DEFAULTS, seed: 1,
  terrainSkeleton: { count: 2, directionDegrees: 45, heightM: 10, widthM: 160 },
  rivers: { count: 1 }, lakes: { count: 1 } }, edits: {} });
function generate(input: SemanticRecipe) {
  const plan = createSpatialTerrainPlan(input);
  generateRiverRegions(plan, { ...RIVER_DEFAULTS, ...input.parameters.rivers }, {});
  generateLakeRegions(plan, { ...LAKE_DEFAULTS, ...input.parameters.lakes }, {});
  return { patches: plan.parameters.terrainPatches, waters: plan.waters };
}

describe("planning candidate count ranges", () => {
  it("samples stable bounded counts while preserving equal-endpoint legacy geometry", () => {
    const counts = Array.from({ length: 20 }, (_, seed) => planningCandidateCount(seed, "rivers:count", { countMin: 1, countMax: 4 }, 1));
    expect(counts.every(count => count >= 1 && count <= 4)).toBe(true);
    expect(new Set(counts).size).toBeGreaterThan(1);
    expect(counts).toEqual(Array.from({ length: 20 }, (_, seed) => planningCandidateCount(seed, "rivers:count", { countMin: 1, countMax: 4 }, 1)));
    const old = recipe();
    const document = importPlanningDocument(old);
    const restored = exportPlanningRecipe(document);
    expect(restored.parameters.rivers).toMatchObject({ countMin: 1, countMax: 1 });
    expect(restored.parameters.rivers?.count).toBeUndefined();
    expect(restored.parameters.terrainSkeleton).toMatchObject({ countMin: 2, countMax: 2 });
    expect(generate(restored)).toEqual(generate(old));
  }, 60000);

  it("migrates active and archived fields without sampling or touching author identities", () => {
    const document = importPlanningDocument(recipe());
    for (const type of ["terrain", "rivers", "lakes"]) document.entities.world.components[type].values = { count: 0 };
    document.layoutOverrides = { "7": { entities: structuredClone(document.entities), edits: {}, parameters: recipe().parameters } };
    const upgraded = upgradePlanningDocument(document);
    for (const scope of [upgraded, upgraded.layoutOverrides!["7"]])
      for (const type of ["terrain", "rivers", "lakes"])
        expect(scope.entities.world.components[type].values).toEqual({ countMin: 0, countMax: 0 });
    expect(upgraded.layoutOverrides!["7"].parameters?.terrainSkeleton).toMatchObject({ countMin: 2, countMax: 2 });
    expect(Object.keys(upgraded.entities)).toEqual(Object.keys(document.entities));
    const result = generate(exportPlanningRecipe(upgraded));
    expect(result.patches).toHaveLength(0);
    expect(result.waters).toHaveLength(0);
  });

  it("keeps explicit range endpoints authoritative over a leftover legacy count", () => {
    const input = recipe();
    input.parameters.rivers = { count: 9, countMin: 0, countMax: 2 };
    const document = importPlanningDocument(input);
    expect(document.entities.world.components.rivers.values).toMatchObject({ countMin: 0, countMax: 2 });
    expect(document.entities.world.components.rivers.values.count).toBeUndefined();
    document.entities.world.components.terrain.values = { count: 9, countMin: 1, countMax: 3 };
    expect(upgradePlanningDocument(document).entities.world.components.terrain.values).toEqual({ countMin: 1, countMax: 3 });
  });

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
