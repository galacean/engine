import { expect, it, vi } from "vitest";
import { createSeedPlanningDocument } from "../src/spatial/PlanningInitialization";
import { exportPlanningRecipe } from "../src/spatial/PlanningDocument";
import { PlanningSession } from "../src/spatial/PlanningSession";
import * as landscape from "../src/semantic-study/ContextLandscape";

it("rebuilds regional candidates with their full halo and agrees with a fresh-module cold solve", async () => {
  const document = createSeedPlanningDocument(2);
  const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
  await session.initialize();
  const original = session.result!, before = JSON.stringify(original.plan);
  const prepare = vi.spyOn(landscape, "prepareLandscapeBasemap");
  try {
    const receipt = await session.dispatchParameters([{ op: "set", entity: "poi-small-7", component: "landscape",
      values: { treeHeightMaxM: 40 } }]);
    expect(receipt.status).toBe("accepted");
    expect(prepare.mock.calls.some(call => call[4]?.area)).toBe(true);
  } finally { prepare.mockRestore(); }
  const local = session.result!;
  expect(local.plan.routes).toBe(original.plan.routes);
  expect(local.plan.flowerRegions).toBe(original.plan.flowerRegions);
  expect(JSON.stringify(original.plan)).toBe(before);
  // A cached full input must not disguise a defective regional merge.
  vi.resetModules();
  const { generatePlanningDocument } = await import("../src/spatial/PlanningRuntime");
  const cold = generatePlanningDocument(session.export());
  expect(cold.accepted).toBe(true);
  expect(local.plan.spatialLayout!.landscapeBase!.candidateSlots).toEqual(cold.plan.spatialLayout!.landscapeBase!.candidateSlots);
  expect(local.plan.landscapes).toEqual(cold.plan.landscapes);
  expect(local.plan.flowerRegions).toEqual(cold.plan.flowerRegions);
  expect(local.plan.visualGuidance).toEqual(cold.plan.visualGuidance);
  expect(local.plan.farming).toEqual(cold.plan.farming);
}, 30000);

it.each(["terrain-patch", "terrain-feature"] as const)("local %s preserves roads and building identities on edit and cold replay", async resourceType => {
  const document = createSeedPlanningDocument(1);
  const session = new PlanningSession(exportPlanningRecipe(document), undefined, document);
  await session.initialize();
  const before = structuredClone(session.result!.plan);
  const { planningHeightmap } = await import("../src/semantic-study/PlanningHeightmap");
  const point = {x:before.spawn.x+20,z:before.spawn.z};
  const height = planningHeightmap(before).sample(point);
  const next = session.export();
  next.authoredResources = [...(next.authoredResources??[]), resourceType === "terrain-patch"
    ? {resourceId:"local-brush",resourceType,properties:{...point,radiusMetres:10,heightDeltaMetres:3}}
    : {resourceId:"local-feature",resourceType,properties:{...point,kind:"mountain",headingDegrees:0,lengthMetres:20,widthMetres:20,elevationDeltaMetres:3,sharpness:0.5,asymmetry:0,roughness:0,erosion:0,seed:1}}];
  expect((await session.load(next)).status).toBe("accepted");
  const edited = session.result!.plan;
  expect(edited.routes).toEqual(before.routes);
  expect(edited.buildings).toEqual(before.buildings);
  // Semantic amplitude is sampled through the finite heightmap, not an exact peak-height target.
  expect(Math.abs(planningHeightmap(edited).sample(point)-height-3)).toBeLessThan(0.15);
  const {generatePlanningDocument} = await import("../src/spatial/PlanningRuntime");
  const cold = generatePlanningDocument(session.export()).plan;
  expect(cold.routes).toEqual(edited.routes);
  expect(cold.buildings).toEqual(edited.buildings);
  expect(planningHeightmap(cold).sample(point)).toBeCloseTo(planningHeightmap(edited).sample(point),5);
},60000);
