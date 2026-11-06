import { describe, expect, it } from "vitest";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { initializePlanningPopulation } from "@galacean/engine-world-planning/spatial/PlanningPopulationInitialization";
import { exportPlanningRecipe, importPlanningDocument, upgradePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { exportPlanningScene, importPlanningScene } from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";

import { importRuntimeHierarchy } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-hierarchy-source";
import { RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { planningSourceDocument, validatePlanningProject } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectSource.ts";

const generate = (document: Parameters<typeof generatePlanningDocument>[0]) =>
  generatePlanningDocument(document, undefined, [], undefined, { environment: false });
function source() {
  const document = createSeedPlanningInputs(1);
  for (const type of ["terrain", "rivers", "lakes"]) Object.assign(document.entities.world.components[type].values, { countMin: 0, countMax: 0 });
  return document;
}

describe("world population parameters", () => {
  it("uses public parameter edits, persists values and realized layout, and does not cap later local edits", async () => {
    const document = initializePlanningPopulation(source(), { villageTarget: 1, buildingLimit: 20 });
    const session = new PlanningSession(exportPlanningRecipe(document), async document => generate(document), document);
    await session.initialize();
    const definition = session.describe().find(component => component.type === "population")!;
    expect(definition.fields.map(field => field.key)).toEqual(["villageMin", "villageMax", "buildingMin", "buildingMax"]);
    expect(definition.scopes.world).toBe(true);
    const expanded = await session.dispatchParameters([{ op: "set", entity: "world", component: "population", values: { villageMin: 2, villageMax: 2, buildingMin: 0, buildingMax: 40 } }]);
    expect(expanded.status, expanded.message).toBe("accepted");
    expect(new Set(session.result!.plan.buildings.map(building => building.regionId)).size).toBe(2);
    expect(session.result!.plan.buildings.length).toBeLessThanOrEqual(40);
    const originalPoi = session.document.populationInitialization!.selectedPoiIds[0];
    const authorBeforeReadonly = structuredClone(session.document);
    for (const [entity, component, field] of [
      [originalPoi, "layout", "memberCount"], ["world", "distribution", "count"],
      ["world", "distribution", "averageAreaM2"], [originalPoi, "poi", "actualAreaM2"]
    ]) {
      const write = await session.dispatchParameters([{ op: "set", entity, component, values: { [field]: 99 } }]);
      expect(write.status, `${component}.${field}`).toBe("rejected");
      expect(session.document).toEqual(authorBeforeReadonly);
    }
    const receipt = await session.dispatchParameters([{ op: "set", entity: "world", component: "population", values: { villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0 } }]);
    expect(receipt.status, receipt.message).toBe("accepted");
    expect(session.result!.plan.buildings).toHaveLength(0);
    expect(exportPlanningRecipe(session.document).parameters.population).toEqual({ villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0 });
    const restored = importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(session.document))));
    expect(generate(restored).plan.buildings).toHaveLength(0);
    expect(exportPlanningRecipe(restored).parameters.population).toEqual({ villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0 });
    const local = await session.dispatchParameters([{ op: "set", entity: originalPoi, component: "layout", values: { elementProfile: "habitable", spacingMinM: 0, spacingMaxM: 0 } }]);
    expect(local.status, local.message).toBe("accepted");
    expect(session.result!.plan.buildings.length).toBeGreaterThan(0);
    const cold = generate(importPlanningScene(JSON.parse(JSON.stringify(exportPlanningScene(session.document)))));
    expect(cold.plan.buildings).toEqual(session.result!.plan.buildings);
    const sameValue = await session.dispatchParameters([{ op: "set", entity: "world", component: "population", values: { villageMin: 0 } }]);
    expect(sameValue.status, sameValue.message).toBe("accepted");
    expect(session.result!.plan.buildings).toEqual(cold.plan.buildings);
  }, 120000);

  it("migrates historical targets without rewriting existing layouts", () => {
    const document = source();
    delete document.entities.world.components.population;
    document.populationInitialization = { version: 1, seed: 1, villageTarget: 2, buildingLimit: 40, villages: 2, buildings: 30, selectedPoiIds: [], diagnostics: [] };
    const before = JSON.stringify(document.entities.world.components.layout);
    const migrated = upgradePlanningDocument(document);
    expect(exportPlanningRecipe(migrated).parameters.population).toEqual({ villageMin: 2, villageMax: 2, buildingMin: 0, buildingMax: 40 });
    expect(JSON.stringify(migrated.entities.world.components.layout)).toBe(before);
    const recipe = exportPlanningRecipe(source());
    recipe.parameters.population = { villageTarget: 3, buildingLimit: 12 };
    expect(exportPlanningRecipe(importPlanningDocument(recipe)).parameters.population).toEqual({ villageMin: 3, villageMax: 3, buildingMin: 0, buildingMax: 12 });
    document.layoutOverrides = { "7": { entities: structuredClone(document.entities), edits: {}, parameters: { ...recipe.parameters, seed: 7 }, populationInitialization: document.populationInitialization } };
    document.layoutOverrides["7"].entities.world.components.population = { values: { villageTarget: 4, buildingLimit: 10 } };
    const archive = upgradePlanningDocument(document).layoutOverrides!["7"];
    expect(archive.entities.world.components.population.values).toEqual({ villageMin: 4, villageMax: 4, buildingMin: 0, buildingMax: 10 });
    expect(archive.parameters!.population).toEqual({ villageMin: 3, villageMax: 3, buildingMin: 0, buildingMax: 12 });
    document.entities.world.components.population = { values: { villageTarget: 2, buildingLimit: 40 } };
    for (const type of ["terrain", "rivers", "lakes"]) {
      document.entities.world.components[type].values.count = 0;
      delete document.entities.world.components[type].values.countMin;
      delete document.entities.world.components[type].values.countMax;
    }
    const path = "World.scene", files = [{ virtualPath: path, path, type: "Scene" }];
    const pack: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: path, files },
      contents: { [path]: JSON.stringify(importRuntimeHierarchy(exportPlanningScene(document), path, files, () => true)) } };
    expect(() => validatePlanningProject(pack)).not.toThrow();
    const native = planningSourceDocument(pack)!;
    expect(native.entities.world.components.population.values).toEqual({ villageMin: 2, villageMax: 2, buildingMin: 0, buildingMax: 40 });
    for (const type of ["terrain", "rivers", "lakes"]) {
      expect(native.entities.world.components[type].values).toMatchObject({ countMin: 0, countMax: 0 });
      expect(native.entities.world.components[type].values).not.toHaveProperty("count");
    }
  });

  it("accepts cross-range scarcity and rejects inverted ranges atomically", async () => {
    const input = source();
    input.entities.world.components.population.values = { villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0 };
    const document = initializePlanningPopulation(input);
    expect(document.populationInitialization!.buildings).toBe(0);
    const session = new PlanningSession(exportPlanningRecipe(document), async document => generate(document), document);
    await session.initialize();
    const scarcity = await session.dispatchParameters([{ op: "set", entity: "world", component: "population", values: { villageMin: 2, villageMax: 3, buildingMin: 0, buildingMax: 0 } }]);
    expect(scarcity.status, scarcity.message).toBe("accepted");
    expect(session.result!.plan.buildings).toHaveLength(0);
    expect(session.document.populationInitialization!.diagnostics.length).toBeGreaterThan(0);
    const noSites = await session.dispatchParameters([{ op: "set", entity: "world", component: "population", values: { villageMin: 0, villageMax: 0, buildingMin: 10, buildingMax: 20 } }]);
    expect(noSites.status, noSites.message).toBe("accepted");
    expect(session.result!.plan.buildings).toHaveLength(0);
    expect(session.document.populationInitialization!.diagnostics.some(message => message.includes("10"))).toBe(true);
    const before = structuredClone(session.document);
    const receipt = await session.dispatchParameters([{ op: "set", entity: "world", component: "population", values: { villageMin: 3, villageMax: 1 } }]);
    expect(receipt.status).toBe("rejected");
    expect(session.document).toEqual(before);
  }, 120000);
});
