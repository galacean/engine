import { describe, expect, it } from "vitest";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import {
  exportPlanningAuthoring,
  importPlanningDocument,
  upgradePlanningDocument,
  type PlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { generateSpatialWorld } from "@galacean/engine-world-planning/spatial/layout/SpatialWorld";
import { boxOutline } from "@galacean/engine-world-planning/spatial/layout/Volumes";
import { createPlanningRingQuery } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import { settlementRandom } from "@galacean/engine-world-planning/semantic-study/SettlementGeometry";
import { SEMANTIC_DEFAULTS, type SemanticRecipe } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import { legacyDefaultPoiLayout } from "@galacean/engine-world-planning/spatial/migration/LegacyPoiDistribution";
import legacyProfile from "@galacean/engine-world-planning/spatial/migration/legacy-space-rules.json";

// Reproduce the original first-visit sampler, including the terrain/network streams.
// Golden owner IDs below were independently measured against HEAD 88bbb29de.
function migratedLegacySeed(seed: number): PlanningDocument {
  const poiLayout = legacyDefaultPoiLayout();
  const sample = (component: string, ranges: Record<string, number[]>) =>
    Object.fromEntries(Object.entries(ranges).map(([key, [a, b]]) => [key,
      a + (b - a) * settlementRandom(seed, `initial:${legacyProfile.version}:${component}:${key}`)]));
  const terrain = sample("terrain", legacyProfile.initial.terrain);
  terrain.count = Math.round(terrain.count);
  Object.assign(poiLayout.network, sample("network", legacyProfile.initial.network));
  Object.assign(poiLayout.landscape, sample("landscape", legacyProfile.initial.landscape));
  return importPlanningDocument({
    version: 2,
    parameters: { ...SEMANTIC_DEFAULTS, seed,
      poiLayout: poiLayout as unknown as SemanticRecipe["parameters"]["poiLayout"],
      terrainSkeleton: terrain as unknown as SemanticRecipe["parameters"]["terrainSkeleton"] },
    edits: {}
  });
}

type Result = ReturnType<typeof generateSpatialWorld>;
const generate = (document: PlanningDocument, previous?: Result) =>
  generateSpatialWorld(document, previous, undefined, { environment: false });
const binding = (result: Result) => result.plan.spatialLayout!.elementProfiles!;

function expectBuildingsOnOwnedLand(result: Result): void {
  const distribution = result.plan.poiDistribution!;
  const domains = new Map(distribution.domains.map(domain => [domain.id, createPlanningRingQuery(domain.outline)]));
  const sites = new Map(distribution.sites.map(site => [site.id, site]));
  for (const group of result.plan.spatialLayout!.groups) {
    if (binding(result)[group.id] !== "habitable") continue;
    const land = domains.get(sites.get(group.id)!.domainId)!;
    for (const volume of group.volumes)
      for (const box of volume.boxes)
        expect(land.containsPolygon(boxOutline(box)), `${group.id}/${volume.id} must remain on its own land`).toBe(true);
  }
  for (const building of result.plan.buildings) {
    const site = sites.get(building.regionId);
    if (site) expect(domains.get(site.domainId)!.containsPolygon(building.outline), building.id).toBe(true);
  }
}

function expectStableBindings(before: Result, after: Result): void {
  for (const [id, profile] of Object.entries(binding(before)))
    if (id in binding(after)) expect(binding(after)[id], `${id} content must not change with area`).toBe(profile);
  expectBuildingsOnOwnedLand(after);
}

describe("POI area edits preserve content ownership", () => {
  for (const [seed, oldVillages] of [
    [1, ["poi-large-1", "poi-large-2", "poi-medium-0", "poi-medium-1"]],
    [110520, ["poi-large-2"]]
  ] as const) {
    it(`keeps actual old seed ${seed} village bindings through migration, weight edits and reload`, () => {
      const document = migratedLegacySeed(seed);
      const authoredVillages = Object.entries(document.entities)
        .filter(([, entity]) => entity.components.layout?.values.elementProfile === "habitable")
        .map(([id]) => id).sort();
      expect(authoredVillages).toEqual([...oldVillages].sort());
      const baseline = generate(document);
      expect(baseline.plan.buildings.length).toBeGreaterThan(0);
      expectBuildingsOnOwnedLand(baseline);
      for (const weight of [2, 4]) {
        const changed = structuredClone(document);
        changed.entities["poi-large-0"].components.poi.values.sizeWeight = weight;
        const committed = generate(changed, baseline);
        expectStableBindings(baseline, committed);
        for (const id of oldVillages)
          if (id in binding(committed)) expect(binding(committed)[id]).toBe("habitable");
        const cold = generate(upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(changed)))));
        expect(binding(cold)).toEqual(binding(committed));
        expect(cold.plan.spatialLayout!.groups.map(group => group.volumes))
          .toEqual(committed.plan.spatialLayout!.groups.map(group => group.volumes));
        expectBuildingsOnOwnedLand(cold);
      }
    }, 60000);
  }

  it("keeps un-authored new-world purposes independent of weight/anchor edits and restores them", () => {
    const document = createSeedPlanningInputs(1);
    const baseline = generate(document);
    const site = baseline.plan.poiDistribution!.sites.find(site => site.active)!;
    const changed = structuredClone(document);
    changed.entities[site.id] = { id: site.id, name: site.id, components: {
      poi: { values: { sizeWeight: 2 } },
      anchor: { values: { x: site.origin.x + 8, z: site.origin.z - 8 } }
    } };
    const committed = generate(changed, baseline);
    expectStableBindings(baseline, committed);
    const cold = generate(upgradePlanningDocument(JSON.parse(JSON.stringify(exportPlanningAuthoring(changed)))));
    expect(binding(cold)).toEqual(binding(committed));
    expect(cold.plan.buildings).toEqual(committed.plan.buildings);
    expectBuildingsOnOwnedLand(cold);
    const reset = generate(document, committed);
    expect(binding(reset)).toEqual(binding(baseline));
    expect(reset.plan.buildings).toEqual(baseline.plan.buildings);
  }, 60000);
});
