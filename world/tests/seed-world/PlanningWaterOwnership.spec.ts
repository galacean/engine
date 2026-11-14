import { expect, it } from "vitest";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization";
import { createTemplatePlanningDocument } from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import {
  planningSourceDocument,
  retainPlanningWaterSource,
  writePlanningProjectSource
} from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectSource";
import {
  initializePlanningOcean,
  initializePlanningWater,
  preparePlanningWaterSource,
  waterInitialization,
  waterInitializationPath
} from "../../demos/seed-world/src/planning/spatial/runtime/PlanningWaterInitialization";
import { createSpatialTerrainPlan } from "@galacean/engine-world-planning/spatial/layout/SpatialTerrain";
import { generateRiverRegions, RIVER_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/RiverRegions";
import { generateLakeRegions, LAKE_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/LakeRegions";
import { exportPlanningRecipe } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { createPlanningGroundSampler } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import {
  exportPlanningScene,
  importPlanningScene
} from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset";

const path = "Main.scene";
function fixture() {
  const contents = {
    [path]: JSON.stringify({ asset: { version: "2.0" }, scene: { rootEntities: [] }, entities: [], components: [] }),
    ...Object.fromEntries(
      ["lake", "river", "ocean"].map((kind) => [
        `Water/Materials/${kind}.mat`,
        JSON.stringify({ name: kind, shader: "WaterTest", shaderData: {}, macros: [] })
      ])
    )
  };
  const draft = new RuntimeProjectEdit(
    {
      version: RUNTIME_PROJECT_SAVE_VERSION,
      project: {
        scene: path,
        files: Object.keys(contents).map((virtualPath) => ({
          virtualPath,
          path: virtualPath,
          type: virtualPath === path ? "Scene" : "Material"
        }))
      },
      contents
    },
    nativeAssetFormats(() => ({}))
  );
  const document = createSeedPlanningDocument(20261110);
  const plan = {
    parameters: { seed: 20261110, landMode: "island", width: 1024, depth: 1024 },
    waters: [
      {
        id: "lake:0",
        label: "Lake",
        kind: "lake",
        outline: [
          { x: 1, z: 1 },
          { x: 7, z: 1 },
          { x: 4, z: 7 }
        ],
        lake: { center: { x: 4, z: 4 }, radiusM: 3, referenceLevel: 2, waterLevel: 2, depthM: 1, carved: true }
      }
    ]
  } as unknown as IslandPlan;
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, document, plan));
  initializePlanningOcean(draft, plan);
  return { draft, document, plan, scene: new RuntimeSceneEdit(draft, path) };
}

async function prepareRemoval(draft: RuntimeProjectEdit, before: ReturnType<RuntimeProjectEdit["preview"]>) {
  await preparePlanningWaterSource(() => before)({
    run: async (run) => run({ draft, edited() {} } as Parameters<typeof run>[0])
  } as Parameters<ReturnType<typeof preparePlanningWaterSource>>[0]);
}

it("initializes an Ocean on the handed-off identity in a fresh template project exactly once", () => {
  const source = fixture();
  const document = retainPlanningWaterSource(source.document, source.draft.preview());
  expect(document.entities["planning-ocean"].components).toEqual({});
  const pack = source.draft.preview();
  const draft = new RuntimeProjectEdit({
    ...pack,
    documents: {},
    contents: { ...pack.contents, [path]: JSON.stringify({
      asset: { version: "2.0" }, scene: { rootEntities: [] }, entities: [], components: []
    }) }
  }, nativeAssetFormats(() => ({})));
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, document, source.plan));
  const scene = new RuntimeSceneEdit(draft, path);
  const identity = scene.queryComponents({ type: "PlanningEntityAuthoring" })
    .find(identity => scene.readComponent(identity.id).props?.planningId === "planning-ocean")!;
  expect(waterInitialization(draft.preview()).seeds["20261110"]).not.toContain("planning-ocean");
  initializePlanningOcean(draft, source.plan);
  expect(() => planningSourceDocument(draft.preview())).not.toThrow();
  const ocean = scene.queryComponents({ type: "WaterBodyComponent", entityId: identity.entityId });
  expect(ocean).toHaveLength(1);
  initializePlanningOcean(draft, source.plan);
  expect(scene.queryComponents({ type: "PlanningEntityAuthoring" })
    .filter(identity => scene.readComponent(identity.id).props?.planningId === "planning-ocean")).toEqual([identity]);
  expect(scene.queryComponents({ type: "WaterBodyComponent", entityId: identity.entityId })).toEqual(ocean);
  expect(waterInitialization(draft.preview()).seeds["20261110"]
    .filter(id => id === "planning-ocean")).toHaveLength(1);
  expect(planningSourceDocument(draft.finish())!.entities["planning-ocean"]).toBeDefined();
}, 60000);

it("keeps native water identities, transforms and authoring when planning is replaced", () => {
  const { draft, document, scene, plan } = fixture();
  initializePlanningOcean(draft, plan);
  expect(waterInitialization(draft.preview()).seeds["20261110"].filter((id) => id === "planning-ocean")).toHaveLength(
    1
  );
  const bodies = scene.queryComponents({ type: "WaterBodyComponent" });
  expect(bodies).toHaveLength(2);
  scene.update(bodies[0].entityId, { position: [10, 2, 0], rotation: [0, 90, 0] });
  const before = bodies.map((body) => ({
    entity: scene.readEntity(body.entityId),
    component: scene.readComponent(body.id)
  }));
  writePlanningProjectSource(draft, path, document);
  expect(scene.queryComponents({ type: "WaterBodyComponent" })).toEqual(bodies);
  expect(
    bodies.map((body) => ({ entity: scene.readEntity(body.entityId), component: scene.readComponent(body.id) }))
  ).toEqual(before);
  expect(planningSourceDocument(draft.finish())!.entities["lake:0"].components.lakes.values.referenceLevel).toBe(4);
});

it("fits retained lakes to a lower template terrain without hiding their water", () => {
  const { draft, scene } = fixture();
  const body = scene.queryComponents({ type: "WaterBodyComponent" }).find(body =>
    (scene.readComponent(body.id).props!.authoring as any).shape.kind === "lake")!;
  const authoring = scene.readComponent(body.id).props!.authoring as any;
  scene.update(body.entityId, { position: [508, 0, 508] });
  scene.updateComponent(body.id, { authoring: { ...authoring,
    shape: { ...authoring.shape, referenceLevel: 1000 } } });
  const target = createTemplatePlanningDocument(20261110, "aurora-palace");
  const retained = retainPlanningWaterSource(target, draft.preview());
  const lake = retained.entities["lake:0"].components.lakes.values;
  expect(lake.enabled).toBe(true);
  expect(lake.referenceLevel).toBeLessThan(1000);
  expect(lake.allowCarving).toBe(true);
  const plan = createSpatialTerrainPlan(exportPlanningRecipe(retained));
  generateLakeRegions(plan, { ...LAKE_DEFAULTS, countMin: 0, countMax: 0 }, { "lake:0": lake });
  expect(plan.waters.find(water => water.id === "lake:0")?.lake?.waterLevel).toBe(lake.referenceLevel);
  const shape = plan.waters.find(water => water.id === "lake:0")!.lake!;
  expect(createPlanningGroundSampler(plan)(shape.center)).toBeLessThan(shape.waterLevel);
  writePlanningProjectSource(draft, path, retained);
  expect(planningSourceDocument(draft.finish())!.entities["lake:0"].components.lakes.values.referenceLevel)
    .toBe(lake.referenceLevel);
}, 60000);

it("does not recreate native water removed through the Scene transaction", async () => {
  const { draft, document, plan, scene } = fixture();
  const before = draft.preview();
  for (const body of scene.queryComponents({ type: "WaterBodyComponent" })) scene.removeComponent(body.id);
  await prepareRemoval(draft, before);
  writePlanningProjectSource(draft, path, document);
  const read = planningSourceDocument(draft.preview())!;
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, read, plan));
  initializePlanningOcean(draft, plan);
  expect(scene.queryComponents({ type: "WaterBodyComponent" })).toHaveLength(0);
  expect(planningSourceDocument(draft.finish())!.entities["lake:0"].components.lakes.values.enabled).toBe(false);
});

it.each([false, true])("replans template water around its subject and preserves native looks and removal intent (%s)", async removed => {
  const { draft, document, scene } = fixture();
  const original = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, document, original.plan));
  const river = scene.queryComponents({ type: "WaterBodyComponent" }).find(body =>
    (scene.readComponent(body.id).props!.authoring as any).shape.kind === "river")!;
  const look = (scene.readComponent(river.id).props!.authoring as any).material;
  const identity = scene.queryComponents({ entityId: river.entityId, type: "PlanningEntityAuthoring" })[0];
  scene.updateComponent(identity.id, { planningId: "river:authored:retained" });
  if (removed) {
    const before = draft.preview();
    const lake = scene.queryComponents({ type: "WaterBodyComponent" }).find(body =>
      (scene.readComponent(body.id).props!.authoring as any).shape.kind === "lake")!;
    scene.removeComponent(lake.id);
    await prepareRemoval(draft, before);
  }
  const retained = retainPlanningWaterSource(createTemplatePlanningDocument(20261110, "aurora-palace"), draft.preview());
  expect(retainPlanningWaterSource(createTemplatePlanningDocument(20261110, "aurora-palace"), draft.preview()))
    .toEqual(retained);
  const result = generatePlanningDocument(retained, undefined, [], undefined, { environment: false });
  expect(result.accepted).toBe(true);
  expect(result.plan.waters.filter(water => water.id === "river:authored:retained")).toHaveLength(1);
  expect(result.plan.waters.filter(water => water.id === "lake:0")).toHaveLength(removed ? 0 : 1);
  writePlanningProjectSource(draft, path, retained);
  expect((scene.readComponent(river.id).props!.authoring as any).material).toEqual(look);
  expect(planningSourceDocument(draft.finish())!.entities["planning-ocean"]).toBeDefined();
}, 60000);

it("replans stale river elevations when reapplying the same template and keeps the repaired source stable", () => {
  const { draft, document, scene } = fixture();
  const original = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, document, original.plan));
  const target = createTemplatePlanningDocument(20261110, "aurora-palace");
  const initialized = retainPlanningWaterSource(target, draft.preview());
  writePlanningProjectSource(draft, path, initialized);
  const river = scene.queryComponents({ type: "WaterBodyComponent" }).find(body =>
    (scene.readComponent(body.id).props!.authoring as any).shape.kind === "river")!;
  const authoring = scene.readComponent(river.id).props!.authoring as any;
  scene.updateComponent(river.id, { authoring: { ...authoring, shape: { ...authoring.shape,
    course: { ...authoring.shape.course, points: authoring.shape.course.points.map((point: any) =>
      ({ ...point, elevation: point.elevation + 1000 })) }
  } } });
  expect(() => generatePlanningDocument(planningSourceDocument(draft.preview())!, undefined, [], undefined,
    { environment: false })).toThrow("Surface above terrain requires an explicit basin");
  const repaired = retainPlanningWaterSource(target, draft.preview());
  const result = generatePlanningDocument(repaired, undefined, [], undefined, { environment: false });
  expect(result.accepted).toBe(true);
  expect(result.plan.waters.filter(water => water.id === "river:0")).toHaveLength(1);
  writePlanningProjectSource(draft, path, repaired);
  expect((scene.readComponent(river.id).props!.authoring as any).material).toEqual(authoring.material);
  const restored = planningSourceDocument(draft.preview())!;
  expect(retainPlanningWaterSource(target, draft.preview()).entities["river:0"])
    .toEqual(restored.entities["river:0"]);
}, 60000);

it("solves replacement inputs with current Source water and its deletion intent", async () => {
  const { draft, document, scene } = fixture();
  const lake = scene
    .queryComponents({ type: "WaterBodyComponent" })
    .find(
      (body) => (scene.readComponent(body.id).props!.authoring as { shape: { kind: string } }).shape.kind === "lake"
    )!;
  const retained = retainPlanningWaterSource(document, draft.preview());
  expect(retained.entities["lake:0"].components.lakes.values.shoreline).toHaveLength(3);
  expect(retained.entities["planning-ocean"]).toBeDefined();
  expect(document.entities["lake:0"]).toBeUndefined();
  const before = draft.preview();
  scene.removeComponent(lake.id);
  await prepareRemoval(draft, before);
  expect(retainPlanningWaterSource(document, draft.preview()).entities["lake:0"].components.lakes.values.enabled).toBe(
    false
  );
  const anotherSeed = structuredClone(document);
  anotherSeed.entities.world.components.world.values.seed = 20261111;
  expect(retainPlanningWaterSource(anotherSeed, draft.preview())).toBe(anotherSeed);
});

it("does not let landscape composition recreate a removed Source river", () => {
  const document = createSeedPlanningDocument(20261110);
  document.entities.world.components.landscapeComposition = {
    values: { enabled: true, streamWidthM: 14, streamDepthM: 0.9 }
  };
  const id = "river:authored:landscape-composition:-1";
  document.entities[id] = {
    id,
    name: "Removed river",
    parent: "world",
    components: {
      rivers: { base: { entity: "world", component: "rivers" }, values: { enabled: false } }
    }
  };
  expect(importPlanningScene(exportPlanningScene(document)).entities[id].components.rivers.values.enabled).toBe(false);
  const result = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  expect(result.accepted).toBe(true);
  expect(result.plan.waters.some((water) => water.id === id)).toBe(false);
  expect(result.plan.waters.some((water) => water.id === "river:authored:landscape-composition:1")).toBe(true);
}, 60000);

it("includes persisted generated IDs exactly once when automatic counts change", () => {
  const source = createSeedPlanningDocument(20261110);
  const plan = createSpatialTerrainPlan(exportPlanningRecipe(source));
  const river = {
    enabled: true,
    points: [
      { id: "a", x: 437, z: 460, elevation: -10, width: 2, depth: 1 },
      { id: "b", x: 437, z: 470, elevation: -10, width: 2, depth: 1 }
    ]
  };
  const lake = {
    enabled: true,
    referenceLevel: -10,
    shoreline: [
      { id: "a", ring: "shore", x: 470, z: 470 },
      { id: "b", ring: "shore", x: 475, z: 470 },
      { id: "c", ring: "shore", x: 472, z: 475 }
    ]
  };
  for (const count of [0, 1]) {
    generateRiverRegions(plan, { ...RIVER_DEFAULTS, countMin: count, countMax: count }, { "river:0": river });
    generateLakeRegions(plan, { ...LAKE_DEFAULTS, countMin: count, countMax: count }, { "lake:0": lake });
    expect(plan.waters.map((water) => water.id)).toEqual(["river:0", "lake:0"]);
  }
});

it("recovers water lost with a legacy planning subtree instead of treating initialization as deletion", () => {
  const { draft, scene, plan } = fixture();
  for (const body of scene.queryComponents({ type: "WaterBodyComponent" })) scene.delete(body.entityId);
  const owner = scene.queryComponents({ type: "PlanningProjectAuthoring" })[0];
  const ghost = scene.create({ name: "Legacy synthetic tombstone", parentEntityId: owner.entityId });
  scene.addComponent(ghost.id, {
    type: "PlanningEntityAuthoring",
    props: { planningId: "lake:0", spatialComponents: {}, parentId: "world" }
  });
  const read = planningSourceDocument(draft.preview())!;
  expect(read.entities["lake:0"]?.components.lakes?.values.enabled).not.toBe(false);
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, read, plan));
  initializePlanningOcean(draft, plan);
  expect(scene.queryComponents({ type: "WaterBodyComponent" })).toHaveLength(2);
});

it("persists explicit entity deletion and restores it with the same native transaction", async () => {
  const { draft, scene, document, plan } = fixture();
  const before = draft.preview();
  for (const body of scene.queryComponents({ type: "WaterBodyComponent" })) scene.delete(body.entityId);
  await prepareRemoval(draft, before);
  expect(waterInitialization(draft.preview()).removed?.["20261110"]).toEqual(["lake:0", "planning-ocean"]);
  const read = planningSourceDocument(draft.preview())!;
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, read, plan));
  initializePlanningOcean(draft, plan);
  expect(scene.queryComponents({ type: "WaterBodyComponent" })).toHaveLength(0);
  const restored = new RuntimeProjectEdit(
    before,
    nativeAssetFormats(() => ({}))
  );
  expect(waterInitialization(restored.preview()).removed?.["20261110"]).toBeUndefined();
  expect(
    retainPlanningWaterSource(document, restored.preview()).entities["lake:0"].components.lakes.values.enabled
  ).toBe(true);
});

it("rejects malformed removal records instead of applying them as deletion intent", () => {
  const { draft } = fixture();
  draft.writeDocument(
    waterInitializationPath(path),
    JSON.stringify({ version: 1, seeds: {}, removed: { "20261110": [1] } })
  );
  expect(() => waterInitialization(draft.preview())).toThrow("Invalid Water authoring initialization state");
});

it("preserves a legacy Ocean component removal when its original identity remains", () => {
  const { draft, scene, plan } = fixture();
  const ocean = scene
    .queryComponents({ type: "WaterBodyComponent" })
    .find(
      (body) => (scene.readComponent(body.id).props!.authoring as { shape: { kind: string } }).shape.kind === "ocean"
    )!;
  scene.removeComponent(ocean.id);
  initializePlanningOcean(draft, plan);
  expect(scene.queryComponents({ type: "WaterBodyComponent" })).toHaveLength(1);
});

it("accepts a removed authored lake without requiring its old shoreline", () => {
  const document = createTemplatePlanningDocument(20261110, "sakura-pearl");
  const id = "lake:authored:removed";
  document.entities[id] = {
    id,
    name: "Removed lake",
    parent: "world",
    components: {
      lakes: { base: { entity: "world", component: "lakes" }, values: { enabled: false } }
    }
  };
  const result = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  expect(result.accepted).toBe(true);
  expect(result.plan.waters.some((water) => water.id === id)).toBe(false);
}, 60000);
