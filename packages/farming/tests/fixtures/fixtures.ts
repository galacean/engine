import { planeSurfaceTriangles } from "@galacean/engine-terrain/geometry/SurfaceTriangles.ts";
import { freezeSnapshot } from "../../src/farming/domain/FarmState";
import type { FarmingDefinitionSet, CropDefinition } from "../../src/farming/domain/index";
import { createPlantingCatalog } from "../../src/farming/content/PlantingCatalog";
import { rosetteRecipe, fixtureMetadata } from "./procedural-fixtures";
const recipe = rosetteRecipe();
const plant = { ...fixtureMetadata(recipe.id), recipe, atlasUrl: "/test-atlas.png" };
const full = { minimum: 0, optimalMinimum: 0, optimalMaximum: 100, maximum: 100 };
export function createTestDefinitions(version = 1): FarmingDefinitionSet {
  const crops: CropDefinition[] = ["berry", "herb"].map((id, i) => ({
    id,
    version: 1,
    name: i ? "Test Herb" : "Test Berry",
    cycle: {
      id: `${id}-growth`,
      revision: 1,
      growthTarget: i ? 80 : 100,
      baseGrowthUnitsPerSecond: i ? 20 : 10,
      stages: [
        { id: "seeded", name: "Seeded", minimumProgress: 0 },
        { id: "growing", name: "Growing", minimumProgress: 0.5 },
        { id: "mature", name: "Mature", minimumProgress: 1 }
      ]
    },
    growthFactors: {
      soilMoisture: { minimum: 0, optimalMinimum: i ? 20 : 50, optimalMaximum: 100, maximum: 100 },
      airTemperature: { minimum: -10, optimalMinimum: -10, optimalMaximum: 50, maximum: 50 },
      light: full,
      soilPh: { minimum: 3, optimalMinimum: 3, optimalMaximum: 10, maximum: 10 },
      pestPressure: full
    },
    appearance: {
      plantId: plant.id,
      plantRevision: 1,
      recipeRevision: 1,
      emergence: { start: 0.3, end: 0.5 },
      ageByStage: [
        { stageId: "seeded", age: 0 },
        { stageId: "growing", age: 0 },
        { stageId: "mature", age: 1 }
      ]
    },
    harvest: { itemId: i ? "herb-leaf" : "berry-fruit", itemName: i ? "Test Herb" : "Test Berry", quantity: i ? 1 : 2 }
  }));
  return {
    version,
    storage: {
      containers: [
        { id: "cart", name: "Cart", appearance: "cart", width: 1.43, depth: 2.282 },
        { id: "basket", name: "Basket", appearance: "basket", width: 0.567, depth: 0.567 }
      ],
      crops: {
        berry: { containerTypeId: "basket", capacity: 20, unit: "个" },
        herb: { containerTypeId: "basket", capacity: 16, unit: "份" }
      }
    },
    catalog: createPlantingCatalog(crops, [plant]),
    soilProfile: {
      id: "test-loam",
      version: 1,
      maximumMoistureUnits: 100,
      minimumMoistureUnits: 0,
      wiltingPointUnits: 0,
      evaporationSlowdownThresholdUnits: 0,
      fieldCapacityUnits: 80,
      initialMoistureUnits: 25,
      wateringUnitsPerAction: 55,
      evaporationUnitsPerMinute: 60,
      initialPhTenths: 65
    },
    environmentProfile: { initialAirTemperatureTenths: 240, initialLightUnits: 75 },
    actionPolicy: { allowIrrigateEmptyPlot: false },
    seeds: [
      { id: "berry-seed", cropId: "berry", name: "Berry Seed", description: "Test seed" },
      { id: "herb-seed", cropId: "herb", name: "Herb Seed", description: "Test seed" }
    ]
  };
}
export const TEST_FARMING_DEFINITIONS = createTestDefinitions();

export const TEST_GROUND_PROVIDER: import("../../src/farming/domain/FarmingGround").FarmingGroundProvider = {
  capture: () => ({
    revision: 0,
    surfaceTriangles: (_id, bounds) => planeSurfaceTriangles(bounds),
    sample: (_groundId, x, z) => ({ position: [x, 0, z], normal: [0, 1, 0], surface: "soil" }),
    inspectBounds: () => ({
      covered: true,
      maximumSlopeDegrees: 0,
      surfaces: ["soil"],
      blocked: false,
      underwater: false
    }),
    raycast: () => null
  }),
  subscribe: () => () => {}
};

/** Set up a carried basket without changing the revision under test. Pickup has separate integration coverage. */
export function withHeldTestBasket(
  snapshot: import("../../src/farming/domain/FarmState").FarmSnapshot
): import("../../src/farming/domain/FarmState").FarmSnapshot {
  const basket = snapshot.items.instances.find((item) => item.type === "harvest-basket");
  if (!basket) throw new Error("Test setup requires a persistent basket");
  return freezeSnapshot({ ...snapshot, items: { ...snapshot.items, carried: { itemId: basket.id } } });
}
export function pendingTestInventory(snapshot: import("../../src/farming/domain/FarmState").FarmSnapshot): Record<string, number> {
  const pending: Record<string, number> = {};
  for (const item of snapshot.items.instances)
    for (const entry of item.contents) pending[entry.itemId] = (pending[entry.itemId] ?? 0) + entry.quantity;
  return pending;
}
