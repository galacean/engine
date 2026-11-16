import { expect, it, vi } from "vitest";
import { changedSpatialWaterBounds } from "@galacean/engine-world-planning/spatial/layout/SpatialWaterDependencies";
import { generateSpatialWorld } from "@galacean/engine-world-planning/spatial/layout/SpatialWorld";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { createPlanningGroundSampler } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import * as layout from "@galacean/engine-world-planning/spatial/layout/LayoutKernel";
import { planningWaterParameters } from "../../demos/seed-world/src/planning/spatial/PlanningWaterSource";
import { validateWaterAuthoringSettings } from "@galacean/engine-water/water/native/WaterAuthoring";

it("keeps exact old/new bounds for changed water and includes profile-only and deleted bodies", () => {
  const water = (id: string, x: number) => ({
    id,
    bankWidthM: 2,
    outline: [
      { x, z: 10 },
      { x: x + 10, z: 20 }
    ]
  });
  const before: any = {
    waters: [water("lake", 10), water("river", 400)],
    planning: { profiles: [{ ownerId: "lake", y: 1 }] },
    spatialLayout: { waterTerrainInfluences: [{ id: "lake", bounds: [-40, -30, 70, 60] }] }
  };
  const same = structuredClone(before);
  expect(changedSpatialWaterBounds(before, same)).toEqual([]);
  same.planning.profiles[0].y = 1 + Number.EPSILON;
  expect(changedSpatialWaterBounds(before, same)).toEqual([
    { x0: 10, z0: 10, x1: 20, z1: 20 },
    { x0: -40, z0: -30, x1: 70, z1: 60 },
    { x0: 10, z0: 10, x1: 20, z1: 20 },
    { x0: -40, z0: -30, x1: 70, z1: 60 }
  ]);
  same.waters.splice(0, 1);
  same.planning.profiles = [];
  expect(changedSpatialWaterBounds(before, same)).toEqual([
    { x0: 10, z0: 10, x1: 20, z1: 20 },
    { x0: -40, z0: -30, x1: 70, z1: 60 }
  ]);
  delete before.spatialLayout.waterTerrainInfluences;
  expect(changedSpatialWaterBounds(before, same)).toBeUndefined();
});

it("replays lake removal and restoration exactly, including newly feasible volumes and road checks", () => {
  const on = createSeedPlanningDocument(1);
  Object.assign(on.entities.world.components.lakes.values, { countMin: 1, countMax: 1 });
  const initial = generateSpatialWorld(on);
  const off = structuredClone(on);
  Object.assign(off.entities.world.components.lakes.values, { countMin: 0, countMax: 0 });
  const solve = vi.spyOn(layout, "solveLayoutGroup");
  let incremental: ReturnType<typeof generateSpatialWorld>, cold: ReturnType<typeof generateSpatialWorld>;
  try {
    incremental = generateSpatialWorld(off, initial);
    const localWork = solve.mock.calls.length;
    solve.mockClear();
    cold = generateSpatialWorld(off);
    expect(localWork).toBeLessThan(solve.mock.calls.length);
  } finally {
    solve.mockRestore();
  }
  const fields = [
    "waters",
    "rocks",
    "buildings",
    "routes",
    "roadGraph",
    "roadNetwork",
    "bridges",
    "roadApproaches",
    "landscapes",
    "flowerRegions",
    "farming"
  ] as const;
  for (const key of fields) expect(incremental.plan[key], key).toEqual(cold.plan[key]);
  expect(incremental.accepted).toBe(cold.accepted);
  expect(incremental.checks).toEqual(cold.checks);
  const restored = generateSpatialWorld(on, incremental);
  for (const key of fields) expect(restored.plan[key], key).toEqual(initial.plan[key]);
  expect(restored.checks).toEqual(initial.checks);
}, 120000);

it.each([1, 40])("Terrain envelopes cover every changed dry-bank sample with maximum bank width %s", (maximumWidth) => {
  const plan: any = {
    parameters: { width: 1024, depth: 1024, seed: 1, landMode: "continuous" },
    land: [
      { x: 0, z: 0 },
      { x: 1024, z: 0 },
      { x: 1024, z: 1024 },
      { x: 0, z: 1024 }
    ],
    islands: [],
    buildings: [],
    roadApproaches: [],
    spatialLayout: { groups: [] },
    waters: [
      {
        id: "river",
        outline: [
          { x: 400, z: 399 },
          { x: 410, z: 399 },
          { x: 410, z: 401 },
          { x: 400, z: 401 }
        ],
        bankWidthM: 1,
        bankWidths: [1, maximumWidth]
      }
    ],
    planning: {
      profiles: [
        {
          ownerId: "river",
          kind: "bed",
          width: 2,
          points: [
            { x: 400, y: -51, z: 400 },
            { x: 410, y: -51, z: 400 }
          ]
        },
        {
          ownerId: "river",
          kind: "water",
          width: 2,
          points: [
            { x: 400, y: -50, z: 400 },
            { x: 410, y: -50, z: 400 }
          ]
        }
      ]
    }
  };
  const source = () => 20;
  const sample = createPlanningGroundSampler(plan, { natural: true, baseGround: source });
  const influence = sample.waterTerrainInfluences![0].bounds!;
  expect(sample({ x: 500, z: 400 })).toBeLessThan(20);
  let changed = 0;
  for (let x = 100; x <= 710; x += 5)
    for (let z = 100; z <= 710; z += 5) {
      const value = sample({ x, z });
      sample.prepareBounds!([x - 1, z - 1, x + 1, z + 1]);
      expect(sample({ x, z })).toBe(value);
      if (value === source()) continue;
      changed++;
      expect(x).toBeGreaterThanOrEqual(influence[0]);
      expect(x).toBeLessThanOrEqual(influence[2]);
      expect(z).toBeGreaterThanOrEqual(influence[1]);
      expect(z).toBeLessThanOrEqual(influence[3]);
    }
  expect(changed).toBeGreaterThan(1000);
  expect(sample({ x: influence[2] + 1, z: 400 })).toBe(20);
  // Legacy broad-relief grading is not bounded by the authored bank envelope.
  delete plan.waters[0].bankWidthM;
  plan.parameters.worldElevation = { riseM: 10 };
  const unbounded = createPlanningGroundSampler(plan, { natural: true, baseGround: source });
  expect(unbounded.waterTerrainInfluences![0].bounds).toBeNull();
  const next = { ...plan, spatialLayout: { waterTerrainInfluences: unbounded.waterTerrainInfluences } };
  expect(changedSpatialWaterBounds(undefined, next)).toBeUndefined();
});

it.each([
  [450, 450],
  [300, 500]
])(
  "retains exact cold replay for low river creation, removal and restoration at %s/%s",
  (x, z) => {
    const before = createSeedPlanningDocument(1);
    Object.assign(before.entities.world.components.rivers.values, { countMin: 0, countMax: 0 });
    const initial = generateSpatialWorld(before);
    const after = structuredClone(before),
      id = "river:authored:regression";
    const input = {
      shape: {
        kind: "river" as const,
        course: {
          id,
          sections: [],
          points: [
            { id: "a", x, z, elevation: -50, width: 2, depth: 1 },
            { id: "b", x: x + 10, z, elevation: -50, width: 2, depth: 1 }
          ]
        },
        speed: 1,
        bankWidthM: 1
      },
      terrain: { mode: "host" as const },
      material: { $ref: "Water/Materials/river.mat" }
    };
    validateWaterAuthoringSettings(input);
    after.entities[id] = { id, name: "Low river", parent: "world", components: planningWaterParameters(input, true) };
    const added = generateSpatialWorld(after, structuredClone(initial));
    // generateSpatialWorld is the actual solver, without the outer whole-result cache.
    const cold = generateSpatialWorld(after);
    const removed = generateSpatialWorld(before, structuredClone(added));
    const restored = generateSpatialWorld(after, structuredClone(removed));
    const fields = [
      "waters",
      "rocks",
      "buildings",
      "routes",
      "roadGraph",
      "roadNetwork",
      "bridges",
      "roadApproaches",
      "landscapes",
      "flowerRegions",
      "farming"
    ] as const;
    for (const [actual, expected] of [
      [added, cold],
      [removed, initial],
      [restored, cold]
    ]) {
      expect(actual.accepted).toBe(true);
      expect(expected.accepted).toBe(true);
      expect(fields.filter((key) => JSON.stringify(actual.plan[key]) !== JSON.stringify(expected.plan[key]))).toEqual(
        []
      );
      expect(actual.checks).toEqual(expected.checks);
      expect(actual.plan.planning!.profiles).toEqual(expected.plan.planning!.profiles);
    }
    if (x === 450) {
      expect(added.plan.rocks.find((r) => r.id === "poi-2-4:volume:0")!.baseHeight).toBe(-8.79003178080698);
      const legacy = structuredClone(initial);
      delete legacy.plan.spatialLayout!.waterTerrainInfluences;
      const replay = generateSpatialWorld(after, legacy);
      expect(replay.plan.rocks).toEqual(cold.plan.rocks);
      expect(replay.checks).toEqual(cold.checks);
    }
  },
  120000
);
