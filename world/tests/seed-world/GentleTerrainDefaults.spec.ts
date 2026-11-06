import { describe, expect, it } from "vitest";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { reliefField } from "@galacean/engine-world-planning/spatial/terrain/ReliefField";
import { WORLD_TEMPLATES, templateBaseSeed } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { createTemplatePlanningDocument } from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";

function bandSlopes(recipe: ReturnType<typeof exportPlanningRecipe>) {
  const plan = createSpatialTerrainPlan(recipe);
  const field = reliefField(plan.parameters.terrainPatches ?? []);
  const slopes: number[] = [];
  for (let z = 0; z <= 1024; z += 4)
    for (let x = 0; x <= 1024; x += 4) {
      const dx = field({ x: x + 0.5, z }) - field({ x: x - 0.5, z });
      const dz = field({ x, z: z + 0.5 }) - field({ x, z: z - 0.5 });
      slopes.push((Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI);
    }
  slopes.sort((a, b) => a - b);
  return { maximum: slopes[slopes.length - 1], p95: slopes[Math.floor(slopes.length * 0.95)] };
}

describe("gentle default terrain bands", () => {
  it("keeps sampled ordinary worlds mostly flat with roughly ten-degree maximum bands", () => {
    for (const seed of [1, 7, 110513, 110613, 110713]) {
      const slopes = bandSlopes(exportPlanningRecipe(createSeedPlanningInputs(seed)));
      expect(slopes.maximum, `Seed ${seed}`).toBeLessThan(11);
      expect(slopes.p95, `Seed ${seed}`).toBeLessThan(7);
    }
  });

  it("keeps every template base gentle at the taller and narrower ends of its variation", () => {
    for (const template of WORLD_TEMPLATES) {
      const recipe = exportPlanningRecipe(createSeedPlanningInputs(110613));
      recipe.parameters.landformSeed = templateBaseSeed(template.id);
      recipe.parameters.terrainSkeleton = {
        countMin: template.terrain.count,
        countMax: template.terrain.count,
        directionDegrees: 45,
        lengthM: 600,
        heightM: template.terrain.heightM * 1.06,
        widthM: template.terrain.widthM * 0.96
      };
      const slopes = bandSlopes(recipe);
      expect(slopes.maximum, template.id).toBeLessThan(11);
      expect(slopes.p95, template.id).toBeLessThan(7);
    }
  });

  it("uses the gentle base through the real template initialization path", () => {
    for (const id of ["amber-dunes", "neon-alley", "titan-wasteland"]) {
      const document = createTemplatePlanningDocument(110613, id, {
        villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0
      });
      const slopes = bandSlopes(exportPlanningRecipe(document));
      expect(slopes.maximum, id).toBeLessThan(11);
      expect(slopes.p95, id).toBeLessThan(7);
    }
  }, 60000);

  it("keeps steeper authored terrain editable rather than imposing a slope cap", () => {
    const recipe = exportPlanningRecipe(createSeedPlanningInputs(110613));
    recipe.parameters.terrainSkeleton!.heightM = 70;
    expect(bandSlopes(recipe).maximum).toBeGreaterThan(20);
  });
});
