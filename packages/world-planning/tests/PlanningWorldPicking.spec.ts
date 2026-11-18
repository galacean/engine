import { describe, expect, it, vi } from "vitest";

// Match the existing CPU runtime tests: only Engine module initialization needs a browser global.
vi.hoisted(() => Object.defineProperty(globalThis, "window", { value: {}, configurable: true }));

import { Vector4 } from "@galacean/engine";
import { PlanningNaturalVegetationRuntime } from "../src/spatial/runtime/PlanningNaturalVegetationRuntime";
import type { SeedWorldFields } from "../src/runtime/SeedWorldFields";
import type { IslandPlan } from "../src/semantic-study/IslandPlanModel";
import { planningPickAssets, visitPlanningWorldPickBatches, resolvePlanningNaturalPlantPick, resolvePlanningDetailPick, resolvePlanningTerrainPick, PLANNING_GRASSLAND_ID, PLANNING_TERRAIN_ID } from "../src/spatial/runtime/PlanningWorldPicking";
const ring = (min: number, max: number) => [{ x: min, z: min }, { x: max, z: min }, { x: max, z: max }, { x: min, z: max }];
function plan(): IslandPlan {
  return { parameters: { width: 100, depth: 100, terrainPatches: [] }, routes: [], rocks: [], buildings: [],
    mountains: [{ id: "mountain", outline: ring(30, 50), rockIds: [] }],
    flowerRegions: [{ id: "flowers", ownerId: "poi", outlines: [ring(1, 20), ring(5, 10)] }]
  } as unknown as IslandPlan;
}
describe("published world picking identities", () => {
  it("snapshots terrain identity geometry without retaining mutable published arrays", () => {
    const p = plan();
    const renderer = {};
    const scene = { plan: p, world: { visitPickBatches() {}, visitTerrainRenderers(visit: (renderer: unknown) => void) { visit(renderer); } },
      solids: { visitPickBatches() {} } } as any;
    const batches: import("@galacean/engine-modify/rendering/SeedWorldPickBatch.ts").SeedWorldPickBatch[] = [];
    visitPlanningWorldPickBatches(scene, { visitPickBatches() {} } as any, batch => batches.push(batch));
    const snapshot = batches[0].snapshotResolver!();
    expect(snapshot.resolve({ x: 40, y: 0, z: 40 } as never)).toBe("mountain");
    p.mountains[0].id = "replacement";
    p.mountains[0].outline.length = 0;
    expect(snapshot.resolve({ x: 40, y: 0, z: 40 } as never)).toBe("mountain");
    expect(snapshot.resolve({ x: 80, y: 0, z: 80 } as never)).toBe(PLANNING_TERRAIN_ID);
    expect(snapshot.byteLength).toBeGreaterThan(0);
  });
  it("uses planned buildings as the sole building pick catalog", () => {
    const p = plan();
    p.buildings = [{ id: "house" }, { id: "tower" }] as IslandPlan["buildings"];
    expect(planningPickAssets(p).filter(asset => asset.ref.kind === "building").map(asset => asset.ref.id))
      .toEqual(["house", "tower"]);
  });
  it("leaves rock membership to the runtime catalog so deleted rocks cannot reappear as pick assets", () => {
    const p = plan();
    p.rocks = [{ id: "retired-rock" }] as IslandPlan["rocks"];
    p.landscapes = [{ id: "retired-small-rock", kind: "rock" }] as IslandPlan["landscapes"];
    expect(planningPickAssets(p).filter(asset => asset.ref.kind === "rock")).toEqual([]);
  });
  it("maps a merged pavement section to an existing editable road instead of its render ID", () => {
    const p = plan();
    const owner = { id: "logical-road", points: [], width: 3 } as any;
    const physical = { ...owner, id: "physical-section", outline: ring(60, 70) };
    p.routes = [owner];
    p.roadGraph = { nodes: [], sections: [{ id: physical.id, owners: [owner.id], route: physical }] };
    expect(resolvePlanningTerrainPick(p, 65, 65)).toBe("natural:road:logical-road");
  });
  it("uses the generated flower owner rather than inferring ownership from a second contour test", () => {
    const p = plan();
    expect(resolvePlanningDetailPick("flower", "flowers")).toBe("flowers");
    expect(resolvePlanningDetailPick("flower")).toBeUndefined();
    const asset = planningPickAssets(p).find(asset => asset.ref.id === "flowers");
    expect(asset?.properties.planningEntityId).toBe("flowers");
  });
  it("keeps grass as one editable coverage field and does not select the nearest mountain outside its boundary", () => {
    const p = plan();
    expect(resolvePlanningDetailPick("grass")).toBe(PLANNING_GRASSLAND_ID);
    expect(resolvePlanningTerrainPick(p, 40, 40)).toBe("mountain");
    expect(resolvePlanningTerrainPick(p, 55, 40)).toBe(PLANNING_TERRAIN_ID);
    const ids = planningPickAssets(p).map(asset => asset.ref.id);
    expect(ids).toContain(PLANNING_TERRAIN_ID);
    expect(ids).toContain(PLANNING_GRASSLAND_ID);
  });
});

it("uses producer-owned native meadow identities and visits persistent batches from the published scene", () => {
  const p = plan();
  p.landscapes = [{ id: "tree-author", kind: "tree" }] as IslandPlan["landscapes"];
  expect(planningPickAssets(p).some(asset => asset.ref.id === "tree-author")).toBe(false);
  p.naturalVegetation = { world: {}, regions: {}, settings: {} } as IslandPlan["naturalVegetation"];
  expect(planningPickAssets(p).find(asset => asset.ref.id === "tree-author")).toMatchObject({
    ref: { id: "tree-author", domain: "vegetation", kind: "tree" },
    properties: { planningEntityId: "tree-author" }
  });
  expect(resolvePlanningNaturalPlantPick({ id: "opaque-tree-id" }, true)).toBe("opaque-tree-id");
  expect(resolvePlanningNaturalPlantPick({ id: "unrelated/random:id", scopeId: "flowers" }, false)).toBe("flowers");
  expect(resolvePlanningNaturalPlantPick({ id: "understory" }, false)).toBe(PLANNING_GRASSLAND_ID);
  const batch = { renderer: {}, count: 1, resolve: () => "flowers" };
  const scene = { plan: p, world: { visitPickBatches() {}, visitTerrainRenderers() {} },
    solids: { visitPickBatches() {} }, vegetation: { visitPickBatches(visitor: (batch: unknown) => void) { visitor(batch); } } } as any;
  const water = { visitPickBatches() {} } as any;
  const visits: unknown[] = [];
  visitPlanningWorldPickBatches(scene, water, item => visits.push(item));
  visitPlanningWorldPickBatches(scene, water, item => visits.push(item));
  expect(visits).toEqual([batch, batch]);
  expect(visits[0]).toBe(visits[1]);
});

it("stages native plant anchors with one terrain frame and retains transforms and pick descriptors", () => {
  const fields = (height: number) => ({ sizeMetres: 20, worldOrigin: [0, 0], heightResolution: 2,
    heightSamples: new Uint16Array(4), heightDecode: { offset: height, scale: 1 } } as unknown as SeedWorldFields);
  const plant = (id: string, x: number, z: number) => {
    const position = [x, 2, z];
    const grassRoot = new Vector4(x, 2, z, 0.75);
    const instance = { id, position: [x, 2, z], scale: 0.6, scaleAxes: [0.7, 0.6, 0.8], yaw: 45 };
    const batch = { renderer: { enabled: true, entity: { isActiveInHierarchy: true } }, count: 1, resolve: () => id };
    return { instance, root: { transform: { scale: instance.scaleAxes,
      setPosition(x: number, y: number, z: number) { position[0] = x; position[1] = y; position[2] = z; } } },
      groundHeight: 2, grassRootPositions: [grassRoot], pickBatches: [batch], position };
  };
  const tree = plant("tree", 3, 4), flower = plant("flowers", 7, 8);
  const runtime = Object.create(PlanningNaturalVegetationRuntime.prototype) as PlanningNaturalVegetationRuntime;
  Object.assign(runtime, { trees: [tree], cells: new Map([["0/0", { plants: [flower] }]]), groundingFields: fields(2), sources: [new Map()], disposed: false });
  const batches: unknown[] = [];
  runtime.visitPickBatches(batch => batches.push(batch));
  const frame = runtime.prepareGrounding(fields(9));
  expect(tree.position).toEqual([3, 2, 4]);
  expect(flower.position).toEqual([7, 2, 8]);
  frame.commit();
  expect(tree.position).toEqual([3, 9, 4]);
  expect(flower.position).toEqual([7, 9, 8]);
  expect(tree.root.transform.scale).toBe(tree.instance.scaleAxes);
  expect(flower.instance.position).toEqual([7, 2, 8]);
  expect([flower.grassRootPositions[0].x, flower.grassRootPositions[0].y,
    flower.grassRootPositions[0].z, flower.grassRootPositions[0].w]).toEqual([7, 9, 8, 0.75]);
  runtime.visitPickBatches(batch => batches.push(batch));
  expect(batches[0]).toBe(batches[2]);
  expect(batches[1]).toBe(batches[3]);
  const discarded = runtime.prepareGrounding(fields(15));
  discarded.discard();
  expect(flower.position).toEqual([7, 9, 8]);
  const cancelled = new AbortController();
  const aborted = runtime.prepareGrounding(fields(20), cancelled.signal);
  cancelled.abort();
  expect(() => aborted.commit()).toThrow();
  aborted.discard();
  expect(flower.position).toEqual([7, 9, 8]);
  const outside = runtime.prepareGrounding({ ...fields(10), sizeMetres: 1 });
  expect(flower.groundHeight).toBe(flower.instance.position[1]);
  outside.discard();
  flower.instance.position[1] = Number.NaN;
  expect(() => runtime.prepareGrounding({ ...fields(10), sizeMetres: 1 })).toThrow("Invalid native plant ground");
  expect(flower.position).toEqual([7, 9, 8]);
});


it("visits every published building draw with one stable building identity", () => {
  const renderers = [{}, {}, {}];
  const batches = renderers.map((renderer, i) => ({ renderer, count: 1, resolve: () => i < 2 ? "house" : "tower" }));
  const scene = { plan: plan(), world: { visitPickBatches() {}, visitTerrainRenderers() {} },
    solids: { visitPickBatches() {} }, masonry: { visitPickBatches(visit: (batch: unknown) => void) {
      batches.forEach(visit);
    } } } as any;
  const water = { visitPickBatches() {} } as any;
  const first: any[] = [], second: any[] = [];
  visitPlanningWorldPickBatches(scene, water, batch => first.push(batch));
  visitPlanningWorldPickBatches(scene, water, batch => second.push(batch));
  expect(first.map(batch => batch.resolve(0))).toEqual(["house", "house", "tower"]);
  expect(first.map(batch => batch.renderer)).toEqual(renderers);
  first.forEach((batch, i) => { expect(batch.count).toBe(1); expect(batch).toBe(second[i]); });
});

 it("publishes grass and flower properties accepted by the public inspect contract", async () => {
  const {grasslandAssetPropertiesSchema,flowerFieldAssetPropertiesSchema}=await import("../src/agent-adapter/contracts/SeedWorldAssetContracts");
  for(const asset of planningPickAssets(plan())) {
    if(asset.ref.kind === "grassland") expect(grasslandAssetPropertiesSchema.safeParse(asset.properties).success).toBe(true);
    if(asset.ref.kind === "flower-field") expect(flowerFieldAssetPropertiesSchema.safeParse(asset.properties).success).toBe(true);
  }
});
