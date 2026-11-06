import { describe, expect, it } from "vitest";
import { WORLD_TEMPLATES } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { createTemplatePlanningDocument } from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { exportPlanningScene, importPlanningScene } from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";

describe("requested template population initialization", () => {
  it("native water template: matches its receipt to the complete overlay result and cold restore", () => {
    const document = createTemplatePlanningDocument(110513, "sakura-pearl");
    expect(document.authoredResources?.some(resource => resource.resourceType === "water-body")).toBe(true);
    const probe = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
    expect(probe.accepted, JSON.stringify(probe.checks.filter(check => check.required && check.status === "fail"))).toBe(true);
    const result = generatePlanningDocument(document);
    expect(result.waterOverlay?.mode).toBe("overlay");
    expect(result.accepted, JSON.stringify(result.checks.filter(check => check.required && check.status === "fail"))).toBe(true);
    const buildings = result.plan.buildings.length;
    const villages = new Set(result.plan.buildings.map(building => building.regionId)).size;
    expect(buildings).toBeLessThanOrEqual(20);
    expect(villages).toBeLessThanOrEqual(10);
    expect(result.plan.buildings).toEqual(probe.plan.buildings);
    expect(result.plan.landscapes.length).toBeGreaterThan(0);
    expect(document.populationInitialization).toMatchObject({ villageMin: 1, villageMax: 10, buildingMin: 0, buildingMax: 20, villages, buildings });
    const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(document))));
    const cold = generatePlanningDocument(restored);
    expect(cold.accepted, JSON.stringify(cold.checks.filter(check => check.required && check.status === "fail"))).toBe(true);
    expect(cold.plan.buildings).toEqual(result.plan.buildings);
    expect(restored.populationInitialization).toEqual(document.populationInitialization);
  }, 60000);

  for (const index of [8, 11, 12]) {
    const template = WORLD_TEMPLATES[index];
    it(`template ${index + 1} ${template.id}: accepts the complete world and persists its realized initial budget`, () => {
      const document = createTemplatePlanningDocument(110513, template.id);
      const result = generatePlanningDocument(document);
      const requiredFailures = result.checks.filter(check => check.required && check.status === "fail");
      expect(result.accepted, JSON.stringify(requiredFailures)).toBe(true);
      const buildings = result.plan.buildings.length;
      const villages = new Set(result.plan.buildings.map(building => building.regionId)).size;
      expect(buildings).toBeLessThanOrEqual(20);
      expect(villages).toBeLessThanOrEqual(10);
      expect(document.populationInitialization).toMatchObject({
        villageMin: 1, villageMax: 10, buildingMin: 0, buildingMax: 20, villages, buildings
      });
      if (index === 8) {
        const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(document))));
        const cold = generatePlanningDocument(restored);
        expect(cold.accepted, JSON.stringify(cold.checks.filter(check => check.required && check.status === "fail"))).toBe(true);
        expect(cold.plan.buildings).toEqual(result.plan.buildings);
        expect(cold.plan.spatialLayout!.elementProfiles).toEqual(result.plan.spatialLayout!.elementProfiles);
        expect(restored.populationInitialization).toEqual(document.populationInitialization);
      }
    }, 60000);
  }
});
