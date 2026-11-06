import { describe, expect, it } from "vitest";
import { createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import {
  exportPlanningAuthoring,
  upgradePlanningDocument,
  type PlanningDocument
} from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { generateSpatialWorld } from "@galacean/engine-world-planning/spatial/layout/SpatialWorld";
import { boxOutline } from "@galacean/engine-world-planning/spatial/layout/Volumes";
import { createPlanningRingQuery } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
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
