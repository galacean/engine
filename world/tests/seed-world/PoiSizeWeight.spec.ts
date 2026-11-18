import { describe, expect, it } from "vitest";
import {
  poiTerritories,
  poiTerritoryAreas,
  previewPoiTerritories
} from "@galacean/engine-world-planning/spatial/ecology/PoiTerritories";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import {
  exportPlanningAuthoring,
  exportPlanningRecipe,
  importPlanningDocument,
  upgradePlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { generateSpatialWorld } from "@galacean/engine-world-planning/spatial/layout/SpatialWorld";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";

function documentFixture() {
  const document = createSeedPlanningDocument(17);
  document.entities.world.components.world.values.offshoreCoverage = 0;
  Object.assign(document.entities.world.components.rivers.values, { countMin: 0, countMax: 0 });
  Object.assign(document.entities.world.components.lakes.values, { countMin: 0, countMax: 0 });
  document.entities.world.components.distribution.values = { spacingM: 210, minAreaM2: 0 };
  return document;
}
describe("unified POI authoring integration", () => {
  it("uses identical positions and partitions for preview, incremental commit and cold reload", () => {
    const document = documentFixture();
    const baseline = generateSpatialWorld(document, undefined, undefined, { environment: false });
    const id = baseline.plan.poiDistribution!.sites.find((site) => site.active)!.id;
    const before = JSON.stringify(baseline.plan.poiDistribution);
    const preview = previewPoiTerritories(baseline.plan, { id, sizeWeight: 1.2 });
    expect(JSON.stringify(baseline.plan.poiDistribution)).toBe(before);
    document.entities[id] = { id, name: "Local", components: { poi: { values: { sizeWeight: 1.2 } } } };
    const committed = generateSpatialWorld(document, baseline, undefined, { environment: false });
    const restored = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(document))));
    const cold = generateSpatialWorld(restored, undefined, undefined, { environment: false });
    expect(poiTerritories(cold.plan)).toEqual(poiTerritories(committed.plan));
    expect(preview.map((cell) => [cell.center, cell.active, cell.areaM2])).toEqual(
      cold.plan.poiDistribution!.sites.map((site) => [
        site.center,
        site.active,
        poiTerritoryAreas(cold.plan).get(site.id)
      ])
    );
    expect(() => previewPoiTerritories(baseline.plan, { id, sizeWeight: 0 })).toThrow();
    expect(() => previewPoiTerritories(baseline.plan, { id: "missing", sizeWeight: 1 })).toThrow();
  }, 60000);

  it("commits dormancy, reloads stable identities and restores original populations", async () => {
    const document = documentFixture();
    const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
    await session.initialize();
    const original = session.result!;
    const ids = original.plan.poiDistribution!.sites.map((site) => site.id);
    const id = original.plan.poiDistribution!.sites.find((site) => site.active)!.id;
    const changed = await session.dispatchParameters([
      { op: "set", entity: id, component: "poi", values: { sizeWeight: 100 } }
    ]);
    expect(changed.status, changed.message).toBe("accepted");
    const committed = session.result!;
    expect(committed.plan.poiDistribution!.metrics.count).toBeLessThan(original.plan.poiDistribution!.metrics.count);
    expect(committed.plan.poiDistribution!.sites.map((site) => site.id)).toEqual(ids);
    for (const site of committed.plan.poiDistribution!.sites.filter((site) => !site.active)) {
      expect(poiTerritoryAreas(committed.plan).get(site.id)).toBe(0);
      expect(site.memberIds).toEqual([]);
      expect(committed.plan.spatialLayout!.groups.some((group) => group.id === site.id)).toBe(false);
    }
    const finite = (value: unknown): boolean =>
      typeof value === "number"
        ? Number.isFinite(value)
        : value !== null && typeof value === "object"
          ? Object.values(value).every(finite)
          : true;
    expect(
      finite([committed.plan.buildings, committed.plan.rocks, committed.plan.routes, committed.plan.landscapes])
    ).toBe(true);
    const saved = upgradePlanningDocument(JSON.parse(JSON.stringify(session.export())));
    const reloaded = new PlanningSession(exportPlanningRecipe(saved), undefined, saved);
    await reloaded.initialize();
    expect(reloaded.result!.plan.poiDistribution!.sites.map((site) => [site.id, site.center, site.active])).toEqual(
      committed.plan.poiDistribution!.sites.map((site) => [site.id, site.center, site.active])
    );
    expect(poiTerritories(reloaded.result!.plan)).toEqual(poiTerritories(committed.plan));
    expect(reloaded.result!.plan.spatialLayout!.groups.map((group) => group.volumes)).toEqual(
      committed.plan.spatialLayout!.groups.map((group) => group.volumes)
    );
    const reset = await reloaded.dispatchParameters([
      { op: "reset", entity: id, component: "poi", fields: ["sizeWeight"] }
    ]);
    expect(reset.status, reset.message).toBe("accepted");
    expect(poiTerritories(reloaded.result!.plan)).toEqual(poiTerritories(original.plan));
    expect(reloaded.result!.plan.spatialLayout!.groups.map((group) => group.volumes)).toEqual(
      original.plan.spatialLayout!.groups.map((group) => group.volumes)
    );
    const allDormant = await reloaded.dispatchParameters([
      { op: "set", entity: "world", component: "distribution", values: { minAreaM2: 1e9 } }
    ]);
    expect(allDormant.status, allDormant.message).toBe("accepted");
    expect(reloaded.result!.plan.poiDistribution!.metrics.count).toBe(0);
    expect(reloaded.result!.plan.poiDistribution!.sites.map((site) => site.id)).toEqual(ids);
    expect(reloaded.result!.plan.spatialLayout!.groups).toEqual([]);
    const restoreMinimum = await reloaded.dispatchParameters([
      { op: "set", entity: "world", component: "distribution", values: { minAreaM2: 0 } }
    ]);
    expect(restoreMinimum.status, restoreMinimum.message).toBe("accepted");
    expect(poiTerritories(reloaded.result!.plan)).toEqual(poiTerritories(original.plan));
  }, 60000);

  it("persists one local weight through author and recipe formats without tier schema", () => {
    const document = createSeedPlanningDocument(17);
    document.entities["poi-0"] = { id: "poi-0", name: "Local", components: { poi: { values: { sizeWeight: 1.1 } } } };
    const restored = upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(document))));
    expect(restored.entities["poi-0"].components.poi.values.sizeWeight).toBe(1.1);
    const recipe = exportPlanningRecipe(restored);
    expect(recipe.edits["poi-0"].poi?.sizeWeight).toBe(1.1);
    const imported = importPlanningDocument(JSON.parse(JSON.stringify(recipe)));
    expect(imported.entities["poi-0"].components.poi.values.sizeWeight).toBe(1.1);
    expect(planningRegistry.get("poi").legacy).not.toBe(true);
    expect(planningRegistry.get("poi").fields.some((field) => field.key === "tier")).toBe(false);
    expect(planningRegistry.get("poi").fields.find((field) => field.key === "actualAreaM2")?.readonly).toBe(true);
  });
});
