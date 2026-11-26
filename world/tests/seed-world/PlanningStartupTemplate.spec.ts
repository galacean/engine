import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.resetModules());

it("draws a Seed for a new entry and reuses explicit shared Seeds", async () => {
  const { planningStartupSeed } = await import("../../demos/seed-world/src/planning/spatial/PlanningStartupTemplate.ts");
  const random = vi.spyOn(crypto, "getRandomValues");
  try {
    const generated = planningStartupSeed(new URLSearchParams());
    expect(random).toHaveBeenCalledOnce();
    expect(Number.isSafeInteger(generated) && generated >= 0 && generated <= 0xffffffff).toBe(true);
    expect(planningStartupSeed(new URLSearchParams({ seed: String(generated) }))).toBe(generated);
    expect(planningStartupSeed(new URLSearchParams({ seed: "0" }))).toBe(0);
    expect(random).toHaveBeenCalledOnce();
  } finally {
    random.mockRestore();
  }
});

it("initializes the app's single bound template only when no matching saved world exists", async () => {
  const { initialPlanningTemplate } = await import("../../demos/seed-world/src/planning/spatial/PlanningStartupTemplate.ts");
  expect(initialPlanningTemplate(undefined, "titan-wasteland")).toBe("titan-wasteland");
  expect(initialPlanningTemplate(undefined, "original")).toBe("");
  expect(initialPlanningTemplate("titan-wasteland", "titan-wasteland")).toBeUndefined();
  expect(initialPlanningTemplate("", "original")).toBeUndefined();
  // Cross-template or retired saves are replaced with the standalone app's fixed template.
  expect(initialPlanningTemplate("sakura-pearl", "titan-wasteland")).toBe("titan-wasteland");
  expect(initialPlanningTemplate("retired-theme", "emerald-forest")).toBe("emerald-forest");
  expect(initialPlanningTemplate("retired-theme", "original")).toBe("");
});

it("rejects an unknown bound template before any planning", async () => {
  const { initialPlanningTemplate } = await import("../../demos/seed-world/src/planning/spatial/PlanningStartupTemplate.ts");
  expect(() => initialPlanningTemplate(undefined, "missing")).toThrow("未知世界风格");
});

it("restores the sandbar flock when reopening a residents-only desert save", async () => {
  const { createTemplatePlanningDocument, refreshDesertAnimalPreset } = await import("@galacean/engine-world-planning/spatial/WorldTemplateAuthoring");
  const { readAnimalPopulationConfig } = await import("@galacean/engine-world-planning/spatial/AnimalPopulationComponent");
  const document = createTemplatePlanningDocument(2361848456, "titan-wasteland");
  const values = document.entities.world.components.animals.values;
  Object.assign(values, { "species.min": 11, "species.max": 11, "birdCount.species": "swan", "birdCount.max": 1 });
  refreshDesertAnimalPreset(document);
  const animals = readAnimalPopulationConfig(document);
  expect(animals.types.filter(type => type.min > 0)).toHaveLength(12);
  expect(animals.types.find(type => type.typeId === "flamingo-01")?.min).toBeGreaterThanOrEqual(10);
});

it.each([0, 0xffffffff])("publishes a terrain-carved oasis with shared rocks on Seed %i", async (seed) => {
  const { createTemplatePlanningDocument } = await import("@galacean/engine-world-planning/spatial/WorldTemplateAuthoring");
  const { generatePlanningDocument } = await import("@galacean/engine-world-planning/spatial/PlanningRuntime");
  const { worldTemplate } = await import("@galacean/engine-world-planning/spatial/WorldTemplateCatalog");
  const { readAnimalPopulationConfig } = await import("@galacean/engine-world-planning/spatial/AnimalPopulationComponent");
  const { createPlanningRingQuery } = await import("@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain");
  const document = createTemplatePlanningDocument(seed, "titan-wasteland");
  const template = worldTemplate("titan-wasteland")!;
  expect(template.rockSource).toBe("shared");
  expect(template.rockTopCover).toBe("ground");
  const animals = readAnimalPopulationConfig(document);
  expect(animals.enabled).toBe(true);
  expect(animals.types.filter(type => type.min > 0).map(type => type.typeId).sort()).toEqual(
    ["ostrich", "hippopotamus-01", "elephant-01", "porcupine", "bison-01", "rhinoceros-01",
      "chameleon", "bull", "crocodile-01", "swan-01", "platypus", "flamingo-01"].sort()
  );
  const flock = animals.types.find(type => type.typeId === "flamingo-01")!;
  const swan = animals.types.find(type => type.typeId === "swan-01")!;
  expect(flock.min).toBeGreaterThanOrEqual(10);
  expect(flock.max).toBeLessThanOrEqual(13);
  expect(swan.min).toBe(1);
  expect(swan.spawnPoint?.center).not.toEqual(flock.spawnPoint?.center);
  const { accepted, plan } = generatePlanningDocument(document);
  expect(accepted).toBe(true);
  expect(plan.rocks.some((rock) => rock.groupId.startsWith("template:titan-wasteland:cliff:") && !rock.assetId)).toBe(true);
  const lake = plan.waters.find((water) => water.id === "lake:authored:template:titan-wasteland:water:oasis-lagoon");
  expect(lake?.kind).toBe("lake");
  expect(lake?.lake?.holes?.length).toBeGreaterThanOrEqual(1);
  const stones = plan.landscapes?.filter((item) => item.kind === "rock") ?? [];
  expect(stones.some((item) => item.id.includes("island-pillar-") && !item.assetId)).toBe(true);
  const tree = plan.worldTemplateSite?.footprints.find((item) => item.id === "oasis-scarlet-tree");
  expect(tree).toBeDefined();
  const outer = createPlanningRingQuery(lake!.outline);
  const shoal = createPlanningRingQuery(lake!.lake!.holes![0]);
  expect(outer.inside(tree!.obb.center)).toBe(false);
  expect(outer.overlapsPolygon(tree!.outline)).toBe(false);
  expect(outer.inside({ x: tree!.obb.center.x, z: tree!.obb.center.z + 11 })).toBe(true);
  expect(outer.inside({ x: tree!.obb.center.x - 18, z: tree!.obb.center.z })).toBe(true);
  expect(outer.inside({ x: tree!.obb.center.x + 22, z: tree!.obb.center.z })).toBe(true);
  expect(outer.containsPolygon(lake!.lake!.holes![0])).toBe(true);
  expect(shoal.inside({ x: plan.worldTemplateSite!.center.x - 16, z: plan.worldTemplateSite!.center.z - 11 })).toBe(true);
  expect(outer.inside(plan.spawn)).toBe(false);
}, 30_000);
