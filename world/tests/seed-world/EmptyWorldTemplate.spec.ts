import { expect, it, vi } from "vitest";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { createTemplatePlanningDocument } from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime";

vi.mock("../../../packages/world-planning/src/spatial/world-templates/sakura-pearl.json", () => ({ default: {} }));

it("uses ordinary Seed authoring and layout for an empty JSON template", () => {
  const seed = 42;
  const ordinary = createSeedPlanningDocument(seed);
  const themed = createTemplatePlanningDocument(seed, "sakura-pearl");
  const { worldTemplate, ...components } = themed.entities.world.components;
  expect(worldTemplate?.values).toEqual({ id: "sakura-pearl" });
  expect({ ...themed, entities: { ...themed.entities, world: {
    ...themed.entities.world,
    components: { ...components, worldTemplate: ordinary.entities.world.components.worldTemplate }
  } } })
    .toEqual(ordinary);

  const result = generatePlanningDocument(themed);
  const baseline = generatePlanningDocument(ordinary);
  expect(result.accepted).toBe(true);
  expect(result.plan.worldTemplateSite).toBeUndefined();
  expect(result.plan.spawn).toEqual(baseline.plan.spawn);
  expect(result.plan.poiDistribution).toEqual(baseline.plan.poiDistribution);
  expect(result.plan.waters).toEqual(baseline.plan.waters);
  expect(result.plan.buildings).toEqual(baseline.plan.buildings);
  expect(result.plan.rocks).toEqual(baseline.plan.rocks);
}, 60000);
