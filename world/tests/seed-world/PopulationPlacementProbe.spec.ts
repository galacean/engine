import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createSeedPlanningDocument, createSeedPlanningInputs } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { exportPlanningAuthoring } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import { generateSpatialWorld, probeSpatialPlacement } from "@galacean/engine-world-planning/spatial/layout/SpatialWorld";

function placements(groups: ReturnType<typeof probeSpatialPlacement>["groups"]) {
  return groups.map(({ id, volumes, rule }) => ({ id, volumes, memberMin: rule.memberMin }));
}

it("probes uncapped capacities with exactly the same members as complete road generation", () => {
  const document = createSeedPlanningInputs(1);
  document.entities.world.components.layout.values.elementProfile = "habitable";
  const before = structuredClone(document);
  const probe = probeSpatialPlacement(document);
  const complete = generateSpatialWorld(document, undefined, undefined, { environment: false });
  expect(probe.candidates).toEqual(complete.plan.poiDistribution!.candidates);
  expect(probe.elementProfiles).toEqual(complete.plan.spatialLayout!.elementProfiles);
  expect(placements(probe.groups)).toEqual(placements(complete.plan.spatialLayout!.groups));
  expect(probe.groups.some(group => group.volumes.length > 20)).toBe(true);
  expect(probe.groups.every(group => !group.paths.length && !group.ports.length)).toBe(true);
  expect(complete.plan.routes.length).toBeGreaterThan(0);
  expect(document).toEqual(before);
}, 60000);

it("preserves slope, count, dimensions and spacing for both organization shapes independently of paving", () => {
  const document = createSeedPlanningInputs(7);
  document.entities.world.components.layout.values = {
    elementProfile: "habitable", memberMin: 1, memberMax: 4,
    widthMinM: 14, widthMaxM: 24, depthMinM: 10, depthMaxM: 18,
    heightMinM: 20, heightMaxM: 40, spacingMinM: 7, spacingMaxM: 15,
    maxGroundSlopeDegrees: 3, variationSeed: 21
  };
  Object.assign(document.entities.world.components.terrain.values, { countMin: 2, countMax: 2, heightM: 35 });
  for (const branchShape of ["radial", "curve"]) {
    document.entities.world.components.layout.values.branchShape = branchShape;
    const members = probeSpatialPlacement(document).groups;
    for (const roadMode of ["members", "none"]) {
      document.entities.world.components.layout.values.roadMode = roadMode;
      const probe = probeSpatialPlacement(document);
      const complete = generateSpatialWorld(document, undefined, undefined, { environment: false });
      expect(placements(probe.groups)).toEqual(placements(members));
      expect(placements(probe.groups)).toEqual(placements(complete.plan.spatialLayout!.groups));
      expect(probe.groups.some(group => group.volumes.length > 0)).toBe(true);
      expect(probe.groups.every(group => group.volumes.length <= 4)).toBe(true);
      expect(probe.groups.every(group => !group.paths.length)).toBe(true);
    }
  }
}, 60000);

function geometry(plan: ReturnType<typeof generatePlanningDocument>["plan"]) {
  return Object.fromEntries([
    "parameters", "land", "islands", "rocks", "mountains", "waters", "routes", "places", "bridges", "sights",
    "spawn", "regions", "buildings", "ridges", "supports", "slopes", "plazas", "landscapes", "flowerRegions",
    "roadGraph", "roadNetwork", "poiDistribution", "visualGuidance", "courtyards"
  ].map(key => [key, plan[key as keyof typeof plan]]));
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Captured from complete capacity evaluation before placement-only optimization.
// Keep authoring, all published geometry and diagnostics independently observable.
const baseline = {
  1: ["a363ef250ba4f6505a8f9cd306b309d9e8ec73b9d540eedd5da5a169e0568a30", "597855894af022468425f88975c8aaf2ad98a3aa7eda06babb801cef0514dc2a", "f00d8712e25a8c4b0a1096502591c3c1a5bff71be1ee8b66a491aee2df091c6f"],
  7: ["cd1946e8cf463ca305d4cd1fec5ee3679415a5dbc8b58999064be05b8a3d2938", "37446db8c8863b12cc07051e3e542fee6c6e8ebed4b8c785b63ae1121ff7745a", "c05d1bdaa51216596d5137da578eb5ebd122f626cc9a86000ced3068089f84d6"],
  110513: ["26adb584172074da50b12face8d89c29db3e5d3def739d391f8e2f350cfb5cc0", "cab8b24b456b21f4b05e08a390501cab8ee2e2e04b783f27d92c2e306442f0a1", "c0aa67b6d90e9843fd7065d6b6a024b3783bf56a851efd8400cf84e6f35337ef"]
};
it("keeps reset authoring, final geometry and checks identical to the complete-solve baseline", () => {
  for (const seed of [1, 7, 110513] as const) {
    const document = createSeedPlanningDocument(seed);
    const result = generatePlanningDocument(document);
    expect(result.accepted, `Seed ${seed}`).toBe(true);
    expect(digest(exportPlanningAuthoring(document)), `Seed ${seed}: authoring`).toBe(baseline[seed][0]);
    expect(digest(geometry(result.plan)), `Seed ${seed}: geometry`).toBe(baseline[seed][1]);
    expect(digest(result.checks), `Seed ${seed}: checks`).toBe(baseline[seed][2]);
  }
}, 120000);
