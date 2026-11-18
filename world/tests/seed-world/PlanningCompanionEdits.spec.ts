import { expect, it } from "vitest";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { PlanningNaturalVegetation } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetation";
import {
  NATURAL_VEGETATION_ASSET_IDS,
  NATURAL_VEGETATION_PALETTES
} from "@galacean/engine-world-planning/runtime/NaturalVegetationLayers";
import { applyLandscapeEdits } from "@galacean/engine-world-planning/spatial/layout/DerivedEdits";
import { envelope } from "@galacean/engine-world-planning/semantic-study/IslandPlanAtoms";

it("publishes companion anchors at the authored tree position in cold and incremental plans", () => {
  const tree = {
    id: "tree",
    kind: "tree",
    assetId: NATURAL_VEGETATION_PALETTES.trees[0],
    center: { x: 20, z: 20 },
    width: 10,
    depth: 10,
    height: 10,
    yaw: 0,
    baseHeight: 0,
    collisionRadius: 1,
    outline: envelope({ x: 20, z: 20 }, 10, 10, 0)
  };
  const plan = {
    parameters: { seed: 17, width: 128, depth: 128 },
    landscapes: [tree],
    buildings: [],
    rocks: [],
    waters: [],
    routes: [],
    plazas: [],
    spatialLayout: { baselineLandscapes: [tree], instanceEdits: { tree: { x: 80, z: 70 } } }
  } as unknown as IslandPlan;
  const assets = [...NATURAL_VEGETATION_ASSET_IDS].map((id) => ({
    id,
    bounds: { min: [-1, 0, -1] as const, max: [1, 2, 1] as const },
    radius: 1,
    height: 2,
    footprintArea: 4
  }));
  const height = { sample: () => 0 } as never;
  const fields = { waterMask: new Uint8Array(4) } as never;
  const population = { detailDensityFields: [{ category: "grass", samples: new Float32Array(4) }] } as never;
  applyLandscapeEdits(plan, plan.spatialLayout!.instanceEdits!, () => 0);
  const first = new PlanningNaturalVegetation(plan, height, fields, population, assets);
  expect(first.anchors.find((a) => a.id === "tree")!.position).toEqual([80, 0, 70]);
  const replay = new PlanningNaturalVegetation(structuredClone(plan), height, fields, population, assets);
  expect(replay.anchors).toEqual(first.anchors);
  expect(plan.spatialLayout!.baselineLandscapes![0].center).toEqual({ x: 20, z: 20 });
});
