import { initialBuildingDrafts } from "@galacean/engine-world-planning/masonry/BuildingInitialDraft.ts";
import { prepareBuildingCpu } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingCpu.ts";
import { constructionGeometry } from "../../../packages/building/tests/fixtures/constructionGeometry";
import { describe, expect, it } from "vitest";
import {
  publishedPlanningFarmingGround,
  type PlanningBuildingSurfaceOwner,
  type PlanningFarmingTerrain
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningPublishedFarmingGround";
import { ConstructionSurfaceQuery } from "@galacean/engine-building/tiny-glade/runtime/ConstructionSurfaceQuery.ts";
import { PLANNING_FARMING_DEFAULTS } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingComponent.ts";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel.ts";

const rectangle = [
  { x: 0, z: 0 },
  { x: 20, z: 0 },
  { x: 20, z: 20 },
  { x: 0, z: 20 }
];
const plan: IslandPlan = {
  parameters: { width: 20, depth: 20, seed: 1, valleyWidth: 0, riverWidth: 0, mountainHeight: 0 },
  land: rectangle,
  islands: [],
  rocks: [],
  buildings: [],
  mountains: [],
  waters: [],
  routes: [],
  places: [],
  bridges: [],
  sights: [],
  regions: [],
  ridges: [],
  supports: [],
  slopes: [],
  spawn: { x: 0, z: 0 },
  prompt: "",
  raster: { heightSamples: 2, alphaSamples: 2, spacing: 20 },
  farming: {
    farmId: "farm",
    groundId: "ground",
    managementOutline: rectangle,
    poiId: null,
    planningRevision: 1,
    options: PLANNING_FARMING_DEFAULTS,
    placementCheck: { state: "ready", issues: [] },
    accessCheck: { state: "ready", issues: [] }
  }
};
const fields: PlanningFarmingTerrain = {
  sizeMetres: 20,
  worldOrigin: [0, 0],
  heightDecode: { offset: 0, scale: 1 },
  heightResolution: 2,
  heightSamples: new Uint16Array(4),
  surfaceResolution: 2,
  rockySlopeWeight: new Uint8Array(4),
  materialWeights: Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0])
};
const bounds = (x: number) => ({ minimumX: x - 0.5, maximumX: x + 0.5, minimumZ: 9.5, maximumZ: 10.5 });
const wall = (x: number) =>
  new ConstructionSurfaceQuery(
    [
      {
        owner: "house",
        positions: [x, 0, 9, x, 3, 9, x, 0, 11],
        indices: [0, 1, 2]
      }
    ],
    [0, 0, 0],
    (id) => id
  );

describe("published farming ground host facts", () => {
  it("checks rendered standalone rocks that are outside the layout group array", () => {
    const rockPlan = {
      ...plan,
      landscapes: [
        {
          id: "rock",
          ownerId: "poi",
          kind: "rock",
          center: { x: 10, z: 10 },
          width: 2,
          depth: 2,
          height: 3,
          yaw: 0,
          baseHeight: 0
        }
      ]
    } as IslandPlan;
    const view = publishedPlanningFarmingGround(rockPlan, fields, 1, () => false);
    expect(view.inspectBounds("ground", bounds(10)).blocked).toBe(true);
    expect(view.inspectBounds("ground", bounds(3)).blocked).toBe(false);
  });
  it("uses accepted masonry triangles and keeps an old ground capture independent of later surface replacement", () => {
    let current = wall(8);
    const owner: PlanningBuildingSurfaceOwner = {
      get bounds() {
        return current.bounds;
      },
      captureSurfaceQuery() {
        const captured = current;
        return Object.freeze({ intersectBounds: captured.intersectBounds.bind(captured) });
      }
    };
    const old = publishedPlanningFarmingGround(plan, fields, 1, () => false, undefined, owner);
    expect(old.inspectBounds("ground", bounds(8)).blocked).toBe(true);
    current = wall(12);
    const next = publishedPlanningFarmingGround(plan, fields, 2, () => false, undefined, owner);
    expect(next.inspectBounds("ground", bounds(8)).blocked).toBe(false);
    expect(next.inspectBounds("ground", bounds(12)).blocked).toBe(true);
    expect(old.inspectBounds("ground", bounds(8)).blocked).toBe(true);
    expect(old.inspectBounds("ground", bounds(12)).blocked).toBe(false);
  });
});

it("uses actual building surfaces without retaining a ghost planning OBB after replacement or deletion", () => {
  const planned = {
    ...plan,
    buildings: [
      {
        id: "house",
        regionId: "poi",
        center: { x: 10, z: 10 },
        width: 6,
        depth: 6,
        height: 6,
        yaw: 0,
        baseHeight: 0,
        outline: []
      }
    ]
  } as IslandPlan;
  const actual = wall(12);
  const owner = { bounds: actual.bounds, captureSurfaceQuery: () => actual };
  const view = publishedPlanningFarmingGround(planned, fields, 1, () => false, undefined, owner);
  expect(view.inspectBounds("ground", bounds(12)).blocked).toBe(true);
  expect(view.inspectBounds("ground", bounds(8)).blocked).toBe(false);
  const deleted = publishedPlanningFarmingGround(planned, fields, 2, () => false, undefined, {
    bounds: [],
    captureSurfaceQuery: () => new ConstructionSurfaceQuery([], [0, 0, 0], (id) => id)
  });
  expect(deleted.inspectBounds("ground", bounds(12)).blocked).toBe(false);
});

it("refreshes farming against actual building surface snapshots, excludes ghost OBBs and preserves captures", async () => {
  const source: IslandPlan = {
    ...plan,
    buildings: [
      {
        id: "house",
        regionId: "poi",
        center: { x: 10, z: 10 },
        width: 4,
        depth: 4,
        height: 6,
        yaw: 0,
        baseHeight: 0,
        outline: []
      }
    ]
  };
  const group = initialBuildingDrafts(source, constructionGeometry)[0];
  const capture = async () => {
    const geometry = await prepareBuildingCpu(
      group.draft,
      { samples: new Uint16Array(4), resolution: 2, origin: [0, 0], size: 20, decode: { offset: 0, scale: 1 } },
      constructionGeometry,
      { frame: { position: group.position, rotationY: 0 } }
    );
    const query = new ConstructionSurfaceQuery(geometry.preview.structuralParts!, group.position, (id) => id);
    return { bounds: query.bounds, captureSurfaceQuery: () => query };
  };
  const before = publishedPlanningFarmingGround(source, fields, 1, () => false, undefined, await capture());
  expect(before.inspectBounds("ground", bounds(10)).blocked).toBe(true);
  group.draft.parts.find((p) => p.type === "roof")!.regions = [
    {
      id: "hide-roof",
      region: {
        space: "surface_uv",
        polygon: [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100]
        ]
      },
      effect: { hidden: true }
    }
  ];
  const after = publishedPlanningFarmingGround(source, fields, 2, () => false, undefined, await capture());
  expect(after.inspectBounds("ground", bounds(10)).blocked).toBe(false);
  expect(before.inspectBounds("ground", bounds(10)).blocked).toBe(true);
  const deleted = publishedPlanningFarmingGround(source, fields, 3, () => false, undefined, {
    bounds: [],
    captureSurfaceQuery: () => new ConstructionSurfaceQuery([], [0, 0, 0], (id) => id)
  });
  expect(deleted.inspectBounds("ground", bounds(10)).blocked).toBe(false);
  expect(before.inspectBounds("ground", bounds(10)).blocked).toBe(true);
});

it("clips translated triangles exactly, keeps broad-phase empty corners clear and detaches query inputs", () => {
  const part = {
    owner: "roof",
    material: "wall" as const,
    uvs: [],
    positions: [0, 0, 0, 4, 0, 0, 0, 0, 4],
    indices: [0, 1, 2]
  };
  const query = new ConstructionSurfaceQuery([part], [10, 3, 20], (id) => id);
  expect(query.bounds).toEqual([{ min: [10, 3, 20], max: [14, 3, 24] }]);
  // No triangle vertex lies in this box, but the triangle covers its roof plane.
  expect(query.intersectBounds([10.5, 0, 20.5], [11, 4, 21])).toEqual({ building: "roof", subject: "roof" });
  expect(query.intersectBounds([13, 0, 23], [14, 4, 24])).toBeNull();
  expect(query.intersectBounds([10, 3, 20], [10, 3, 20])).not.toBeNull();
  expect(query.intersectBounds([10, 4, 20], [14, 5, 24])).toBeNull();
  expect(() => query.intersectBounds([11, 0, 20], [10, 4, 24])).toThrow(/ordered/i);
  part.positions.fill(100);
  part.indices.fill(0);
  const detached = query.bounds;
  detached[0].max[1] = 100;
  expect(query.bounds[0].max[1]).toBe(3);
  expect(query.intersectBounds([10.5, 0, 20.5], [11, 4, 21])).not.toBeNull();
});
