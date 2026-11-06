import { describe, expect, it } from "vitest";
import { exportPlanningAuthoring, exportPlanningRecipe, importPlanningDocument, upgradePlanningDocument, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { legacyDefaultPoiLayout, legacyDistributePois } from "@galacean/engine-world-planning/spatial/migration/LegacyPoiDistribution";
import { createSpatialWorldBase, generateSpatialLand } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { SEMANTIC_DEFAULTS, type SemanticRecipe } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { exportPlanningScene, importPlanningScene } from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset.ts";
import { switchPlanningLayoutScope } from "@galacean/engine-world-planning/spatial/PlanningLayoutScope";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { resolveComponent } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { legacyInitialLayoutConfiguration } from "@galacean/engine-world-planning/spatial/migration/LegacyLayoutProfiles";

function legacyFixture(seed: number) {
  const old = legacyDefaultPoiLayout();
  const recipe: SemanticRecipe = { version: 2, parameters: { ...SEMANTIC_DEFAULTS, seed,
    poiLayout: old as unknown as SemanticRecipe["parameters"]["poiLayout"] }, edits: {} };
  const plan = createSpatialWorldBase(recipe);
  generateSpatialLand(plan, recipe, []);
  const distribution = legacyDistributePois({ width: 1024, depth: 1024, seed,
    domains: [{ id: "land-main", outline: plan.land }, ...plan.islands.map((outline, i) => ({ id: `offshore-${i}`, outline }))] }, old);
  const selected = distribution.sites.find(site => site.tier === "small")!;
  const document: PlanningDocument = { version: 1, revision: 7, layoutVersion: 2, passthrough: recipe,
    entities: {
      world: { id: "world", name: "world", components: { world: { values: { seed } }, landscape: { values: { density: 2 } } } },
      "policy:small": { id: "policy:small", name: "old policy", parent: "world", components: {
        landscape: { base: { entity: "world", component: "landscape" }, values: { density: 0.25, maxSlopeDegrees: 13 } },
        layout: { values: { widthMinM: 22, widthMaxM: 30 } },
        legacyFlowerContext: { values: { roadMultiplier: 0.4 } }
      } },
      [selected.id]: { id: selected.id, name: "Retained named POI", parent: "world", components: {
        poi: { values: { sizeWeight: 0.2 } },
        layout: { base: { entity: "policy:small", component: "layout" }, values: { widthMinM: 25 } },
        landscape: { base: { entity: "policy:small", component: "landscape" }, values: { density: 0.9 } }
      } }
    }
  };
  return { document, old, sites: distribution.sites, selected };
}

describe("identity-based POI authoring migration", () => {
  it.each([1, 110520])("preserves terrain-assigned content and sampled dimensions for saved Seed %s", (seed) => {
    const { document, sites } = legacyFixture(seed);
    document.entities = { world: document.entities.world };
    const migrated = upgradePlanningDocument(document);
    const habitables = sites.filter(site => migrated.entities[site.id].components.layout.values.elementProfile === "habitable");
    expect(habitables.map(site => site.id)).toEqual(seed === 1
      ? ["poi-large-1", "poi-large-2", "poi-medium-0", "poi-medium-1"] : ["poi-large-2"]);
    const reassigned = habitables.find(site => legacyInitialLayoutConfiguration(seed, site).elementProfile !== "habitable");
    if (seed === 1) expect(reassigned).toBeDefined();
    const selected = reassigned ?? habitables[0];
    const initial = legacyInitialLayoutConfiguration(seed, selected, undefined, "habitable");
    expect(migrated.entities[selected.id].components.layout.values).toMatchObject({
      elementProfile: "habitable", widthMinM: initial.rule.widthMinM, widthMaxM: initial.rule.widthMaxM,
      heightMinM: initial.rule.heightMinM, heightMaxM: initial.rule.heightMaxM,
      maxGroundSlopeDegrees: initial.rule.maxGroundSlopeDegrees
    });
    // An unrelated sparse layout edit must not turn schema defaults into a
    // replacement for the terrain-assigned building dimensions and organization.
    document.entities[selected.id] = { id: selected.id, name: "authored village", components: {
      layout: { values: { curveBendM: 73 } }
    } };
    const sparse = upgradePlanningDocument(document).entities[selected.id].components.layout.values;
    expect(sparse).toEqual({ ...migrated.entities[selected.id].components.layout.values, curveBendM: 73 });
  });

  it("repairs version 1 content bindings across active and archived Seeds without reverting author edits", () => {
    const active = legacyFixture(1), inactive = legacyFixture(110520);
    active.document.entities = { world: active.document.entities.world };
    inactive.document.entities = { world: inactive.document.entities.world };
    active.document.layoutOverrides = { "110520": { entities: inactive.document.entities,
      parameters: inactive.document.passthrough.parameters, edits: inactive.document.passthrough.edits } };
    const original = upgradePlanningDocument(active.document);
    const prior = structuredClone(original);
    prior.poiAuthoringVersion = 1;
    for (const scope of [prior, ...Object.values(prior.layoutOverrides!)]) {
      for (const entity of Object.values(scope.entities)) if (entity.components.layout) delete entity.components.layout.values.elementProfile;
    }
    const id = active.sites.find(site => original.entities[site.id].components.layout.values.elementProfile === "habitable")!.id;
    prior.entities[id].components.poi.values.sizeWeight = 4;
    prior.entities[id].components.layout.values.widthMinM = 17;
    prior.entities[id].components.layout.values.widthMaxM = 27;
    const before = structuredClone(prior);
    const repaired = upgradePlanningDocument(prior);
    expect(prior).toEqual(before);
    expect(repaired.poiAuthoringVersion).toBe(2);
    expect(repaired.entities[id].components.poi.values.sizeWeight).toBe(4);
    expect(repaired.entities[id].components.layout.values).toMatchObject({ elementProfile: "habitable", widthMinM: 17, widthMaxM: 27 });
    for (const [current, expected] of [[repaired, original], [repaired.layoutOverrides!["110520"], original.layoutOverrides!["110520"]]])
      for (const [key, entity] of Object.entries(expected.entities))
        if (entity.components.layout?.values.elementProfile)
          expect(current.entities[key].components.layout.values.elementProfile).toBe(entity.components.layout.values.elementProfile);
    expect(upgradePlanningDocument(repaired)).toEqual(repaired);
  });

  it("preserves old candidate IDs, power offsets and effective author overrides without runtime policies", () => {
    const { document, sites, old, selected } = legacyFixture(110513);
    const before = structuredClone(document);
    const migrated = upgradePlanningDocument(document);
    expect(document).toEqual(before);
    expect(migrated.poiAuthoringVersion).toBe(2);
    const config = exportPlanningRecipe(migrated).parameters.poiLayout!;
    expect(config.version).toBe(2);
    expect(config.candidates?.map(candidate => candidate.id)).toEqual(sites.map(site => site.id));
    expect(Object.keys(migrated.entities).some(id => id.startsWith("policy:"))).toBe(false);
    expect(config).not.toHaveProperty("territoryWeights");
    expect(config).not.toHaveProperty("spacing");
    for (const site of sites) {
      const entity = migrated.entities[site.id];
      expect(entity.components.poi.values).not.toHaveProperty("tier");
      expect(config.candidates!.find(candidate => candidate.id === site.id)!.origin).toEqual(site.center);
      const nearest = Math.min(Infinity, ...sites.filter(other => other.id !== site.id && other.domainId === site.domainId)
        .map(other => (site.center.x - other.center.x) ** 2 + (site.center.z - other.center.z) ** 2));
      const oldWeight = site.id === selected.id ? 0.2 : 1;
      const baseline = (old.territoryWeights![site.tier] - 1) / 4;
      const expected = Number.isFinite(nearest) ? nearest * (baseline + oldWeight - 1) : 0;
      expect(config.spacingM ** 2 * (Number(entity.components.poi.values.sizeWeight) - 1)).toBeCloseTo(expected, 7);
    }
    expect(new Set(sites.map(site => migrated.entities[site.id].name)).size).toBe(sites.length);
    const chosen = migrated.entities[selected.id];
    expect(chosen.name).toBe("Retained named POI");
    expect(chosen.components.layout.values).toMatchObject({ widthMinM: 25, widthMaxM: 30 });
    expect(resolveComponent(migrated, selected.id, "landscape", planningRegistry).values)
      .toMatchObject({ density: 0.9, maxSlopeDegrees: 13 });
    const neighbour = sites.find(site => site.tier === "small" && site.id !== selected.id)!;
    expect(resolveComponent(migrated, neighbour.id, "landscape", planningRegistry).values)
      .toMatchObject({ density: 0.25, maxSlopeDegrees: 13 });
    expect(exportPlanningRecipe(migrated).edits[neighbour.id].flowers).toMatchObject({ roadMultiplier: 0.4 });
    expect(exportPlanningAuthoring(migrated)).toEqual(exportPlanningAuthoring(upgradePlanningDocument(migrated)));
  });

  it("migrates inactive Seed archives and keeps overrides through native Scene reload and switching", () => {
    const active = legacyFixture(110513), inactive = legacyFixture(110514);
    active.document.layoutOverrides = { "110514": { entities: inactive.document.entities,
      parameters: inactive.document.passthrough.parameters, edits: inactive.document.passthrough.edits } };
    const saved = exportPlanningScene(upgradePlanningDocument(active.document));
    const restored = importPlanningScene(JSON.parse(JSON.stringify(saved)));
    expect(Object.keys(restored.layoutOverrides!["110514"].entities).some(id => id.startsWith("policy:"))).toBe(false);
    restored.entities.world.components.world.values.seed = 110514;
    switchPlanningLayoutScope(restored, 110513);
    expect(restored.entities[inactive.selected.id].components.layout.values).toMatchObject({ widthMinM: 25, widthMaxM: 30 });
    expect(exportPlanningRecipe(restored).parameters.poiLayout!.candidates!.map(candidate => candidate.id))
      .toEqual(inactive.sites.map(site => site.id));
  });

  it("materializes the shared defaults of older sparse Seed archives before retiring their policies", () => {
    const active = legacyFixture(110513), archived = legacyFixture(110514);
    const archivedEntities = structuredClone(archived.document.entities);
    delete archivedEntities.world;
    active.document.layoutOverrides = { "110514": { entities: archivedEntities, edits: {} } };
    const restored = upgradePlanningDocument(active.document);
    const archive = restored.layoutOverrides!["110514"];
    expect(archive.parameters!.seed).toBe(110514);
    expect(archive.parameters!.poiLayout!.candidates!.map(candidate => candidate.id)).toEqual(archived.sites.map(site => site.id));
    expect(Object.keys(archive.entities).some(id => id.startsWith("policy:"))).toBe(false);
    restored.entities.world.components.world.values.seed = 110514;
    switchPlanningLayoutScope(restored, 110513);
    expect(restored.entities[archived.selected.id].components.layout.values).toMatchObject({ widthMinM: 25, widthMaxM: 30 });
  });

  it("imports old recipe policies once while fresh worlds expose only unified defaults", () => {
    const legacy = legacyFixture(110513);
    const oldConfig = legacy.document.passthrough.parameters.poiLayout as unknown as Record<string, any>;
    oldConfig.landscape.tierDensity = { small: 0.3 };
    const imported = importPlanningDocument(legacy.document.passthrough);
    expect(resolveComponent(imported, legacy.selected.id, "landscape", planningRegistry).values.density).toBe(0.3);
    const fresh = createSeedPlanningDocument(110513);
    expect(fresh.poiAuthoringVersion).toBe(2);
    expect(Object.keys(fresh.entities).some(id => id.startsWith("policy:"))).toBe(false);
    const distribution = planningRegistry.get("distribution");
    expect(distribution.fields.map(field => field.key)).toEqual(["spacingM", "minAreaM2", "count", "averageAreaM2"]);
    expect(planningRegistry.get("poi").fields.some(field => field.key === "tier")).toBe(false);
  });
});
