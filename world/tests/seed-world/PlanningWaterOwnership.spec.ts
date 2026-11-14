import { expect, it, vi } from "vitest";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
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
import { PlanningProjectStorage } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectStorage";
import { createPlanningWorldSource } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningWorldSource";
import {
  exportPlanningScene,
  importPlanningScene
} from "../../demos/seed-world/src/planning/spatial/PlanningSceneAsset";

const path = "Main.scene";
function fixture(seed = 20261110) {
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
  const document = createSeedPlanningDocument(seed);
  const plan = {
    parameters: { seed, landMode: "island", width: 1024, depth: 1024 },
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

it("installs water assets when a fresh planning project first applies a template with a lake", async () => {
  const initial = fixture(1).draft.finish();
  const materials = initial.project.files.filter(file => file.type === "Material");
  const project = {
    projectPackage: {
      ...initial,
      project: { ...initial.project, files: initial.project.files.filter(file => file.type !== "Material") },
      contents: { [path]: JSON.stringify({ asset: { version: "2.0" }, scene: { rootEntities: [] }, entities: [], components: [] }) },
      documents: {}
    } as RuntimeProjectPackage,
    async publish(pack: RuntimeProjectPackage) { this.projectPackage = pack; return []; }
  };
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => ({
    ok: true,
    json: async () => ({ files: materials }),
    text: async () => initial.contents[materials.find(file => String(url).endsWith(file.path))!.virtualPath]
  }) as Response);
  try {
    await new PlanningProjectStorage(project).save(createTemplatePlanningDocument(1, "low-poly"), "first-template", true);
    expect(project.projectPackage.project.files.map(file => file.virtualPath)).toContain("Water/Materials/lake.mat");
    expect(planningSourceDocument(project.projectPackage)!.entities["lake:authored:template:low-poly:water:valley-pond"])
      .toBeDefined();
  } finally { fetch.mockRestore(); }
});

it("replaces saved water with the selected template without changing unrelated Scene authoring", async () => {
  const { draft, scene } = fixture(1);
  const building = scene.create({ name: "Keep building", position: [50, 3, 60] });
  const decoration = scene.create({ name: "Keep child", parentEntityId: building.id });
  const oldWater = scene.queryComponents({ type: "WaterBodyComponent" })[0];
  const waterChild = scene.create({ name: "Keep water decoration", parentEntityId: oldWater.entityId });
  const beforeBuilding = scene.readEntity(building.id);
  draft.writeDocument(waterInitializationPath(path), JSON.stringify({
    version: 1, seeds: { "1": ["lake:0", "planning-ocean"] }, removed: { "1": ["lake:0", "planning-ocean"] }
  }));
  const project = {
    projectPackage: draft.finish(),
    async publish(pack: RuntimeProjectPackage) { this.projectPackage = pack; return []; }
  };
  const storage = new PlanningProjectStorage(project);
  const target = createTemplatePlanningDocument(1, "low-poly");
  // Exercise the same storage transaction as the planning template picker.
  await storage.save(target, "template-water-reset", true);
  expect(waterInitialization(project.projectPackage)).toEqual({ version: 1, seeds: {}, resetPending: expect.any(String) });
  const saved = (await storage.load(1))!;
  expect(saved.entities["lake:0"]).toBeUndefined();
  expect(saved.entities["planning-ocean"]).toBeUndefined();
  expect(Object.keys(saved.entities).sort()).toEqual(Object.keys(target.entities).sort());
  expect(saved.entities.world).toEqual(target.entities.world);
  const restoredScene = new RuntimeSceneEdit(new RuntimeProjectEdit(project.projectPackage, nativeAssetFormats(() => ({}))), path);
  expect(restoredScene.readEntity(building.id)).toEqual(beforeBuilding);
  expect(restoredScene.readEntity(decoration.id).name).toBe("Keep child");
  expect(restoredScene.readEntity(waterChild.id).name).toBe("Keep water decoration");
  const result = generatePlanningDocument(saved, undefined, [], undefined, { environment: false });
  expect(result.accepted).toBe(true);
  expect(result.plan.waters.filter(water => water.kind === "lake").map(water => water.id))
    .toEqual(["lake:authored:template:low-poly:water:valley-pond"]);
  const before = project.projectPackage;
  project.publish = async () => { throw new Error("storage unavailable"); };
  await expect(storage.save(createSeedPlanningDocument(1), "failed-reset", true)).rejects.toThrow("storage unavailable");
  expect(project.projectPackage).toBe(before);
}, 60000);

it("rebuilds handed-off water over a target template's old shapes and deletion records, then preserves ordinary reloads", async () => {
  const { draft, scene } = fixture(1);
  const lake = scene.queryComponents({ type: "WaterBodyComponent" }).find(body =>
    (scene.readComponent(body.id).props!.authoring as any).shape.kind === "lake")!;
  scene.update(lake.entityId, { position: [20, 0, 30] });
  draft.writeDocument(waterInitializationPath(path), JSON.stringify({
    version: 1, seeds: { "1": ["lake:0", "planning-ocean"] }, removed: { "1": ["lake:0", "planning-ocean"] }
  }));
  const project = {
    projectPackage: draft.finish(),
    async publish(pack: RuntimeProjectPackage) { this.projectPackage = pack; return []; }
  };
  const storage = new PlanningProjectStorage(project);
  const document = createSeedPlanningDocument(1);
  const result = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  expect(result.accepted).toBe(true);
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ files: [] }) } as Response);
  try {
    const source = await createPlanningWorldSource("?seed=1", { document, result, waterResetRequest: "template-reset" }, storage);
    const initialized = source.session.export();
    source.dispose();
    const generatedIds = result.plan.waters.filter(water => ["lake", "river"].includes(water.kind)).map(water => water.id);
    expect(waterInitialization(project.projectPackage).removed).toBeUndefined();
    expect(waterInitialization(project.projectPackage).seeds["1"].sort()).toEqual([...generatedIds, "planning-ocean"].sort());
    expect(generatePlanningDocument(initialized, undefined, [], undefined, { environment: false }).accepted).toBe(true);
    const current = new RuntimeSceneEdit(new RuntimeProjectEdit(project.projectPackage, nativeAssetFormats(() => ({}))), path);
    expect(current.queryComponents({ type: "WaterBodyComponent" })).toHaveLength(generatedIds.length + 1);
    expect(current.queryComponents({ type: "WaterBodyComponent" }).some(body => body.id === lake.id)).toBe(false);
    const before = current.queryComponents({ type: "WaterBodyComponent" });
    await storage.initialize(initialized, result);
    const reloaded = new RuntimeSceneEdit(new RuntimeProjectEdit(project.projectPackage, nativeAssetFormats(() => ({}))), path);
    expect(reloaded.queryComponents({ type: "WaterBodyComponent" })).toEqual(before);
  } finally { fetch.mockRestore(); }
}, 60000);

it("consumes cross-project template resets once and preserves edits when an older planning page is reopened", async () => {
  const makeProject = (pack: RuntimeProjectPackage) => ({
    projectPackage: pack,
    async publish(next: RuntimeProjectPackage) { this.projectPackage = next; return []; }
  });
  const source = makeProject(fixture(1).draft.finish()), target = makeProject(fixture(1).draft.finish());
  const sourceStore = new PlanningProjectStorage(source), targetStore = new PlanningProjectStorage(target);
  const document = createTemplatePlanningDocument(1, "low-poly");
  const result = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  expect(result.accepted).toBe(true);
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ files: [] }) } as Response);
  const lake = () => {
    const draft = new RuntimeProjectEdit(target.projectPackage, nativeAssetFormats(() => ({})));
    const scene = new RuntimeSceneEdit(draft, path);
    const body = scene.queryComponents({ type: "WaterBodyComponent" }).find(body =>
      (scene.readComponent(body.id).props!.authoring as any).shape.kind === "lake")!;
    return { draft, scene, body, authoring: scene.readComponent(body.id).props!.authoring as any };
  };
  const customize = () => {
    const current = lake();
    current.scene.updateComponent(current.body.id, { authoring: {
      ...current.authoring, material: { $ref: "Water/Materials/river.mat" }, priority: 7
    } });
    target.projectPackage = current.draft.finish();
    return current.body.id;
  };
  try {
    await sourceStore.save(document, "first-template-application", true);
    const request = sourceStore.pendingWaterReset!;
    await targetStore.initialize((await sourceStore.load(1))!, result, request);
    const id = customize();
    await targetStore.initialize((await sourceStore.load(1))!, result, request);
    expect(lake().body.id).toBe(id);
    expect(lake().authoring).toMatchObject({ material: { $ref: "Water/Materials/river.mat" }, priority: 7 });

    await sourceStore.save(document, "second-template-application", true);
    const nextRequest = sourceStore.pendingWaterReset!;
    expect(nextRequest).not.toBe(request);
    await targetStore.initialize((await sourceStore.load(1))!, result, nextRequest);
    expect(lake().body.id).not.toBe(id);
    expect(lake().authoring.material).toEqual({ $ref: "Water/Materials/lake.mat" });
    const nextId = customize();
    // An older source project can still hand off an earlier, already applied request.
    await targetStore.initialize(document, result, request);
    expect(lake().body.id).toBe(nextId);
    expect(lake().authoring).toMatchObject({ material: { $ref: "Water/Materials/river.mat" }, priority: 7 });
  } finally { fetch.mockRestore(); }
}, 60000);

it("gives legacy boolean resets a stable cross-project identity after reopening", async () => {
  const source = fixture(1), target = fixture(1);
  const sourceProject = {
    id: "legacy-source", projectPackage: source.draft.finish(),
    async publish(pack: RuntimeProjectPackage) { this.projectPackage = pack; return []; }
  };
  const targetProject = {
    id: "legacy-target", projectPackage: target.draft.finish(),
    async publish(pack: RuntimeProjectPackage) { this.projectPackage = pack; return []; }
  };
  const sourceStore = new PlanningProjectStorage(sourceProject), targetStore = new PlanningProjectStorage(targetProject);
  await sourceStore.save(createTemplatePlanningDocument(1, "low-poly"), "legacy-template-application", true);
  const legacy = new RuntimeProjectEdit(sourceProject.projectPackage, nativeAssetFormats(() => ({})));
  legacy.writeDocument(waterInitializationPath(path), JSON.stringify({
    ...waterInitialization(sourceProject.projectPackage), resetPending: true
  }));
  sourceProject.projectPackage = legacy.finish();
  const request = sourceStore.pendingWaterReset!;
  expect(typeof request).toBe("string");
  expect(new PlanningProjectStorage(sourceProject).pendingWaterReset).toBe(request);
  const document = (await sourceStore.load(1))!;
  const result = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ files: [] }) } as Response);
  try {
    await targetStore.initialize(document, result, request);
    const current = new RuntimeSceneEdit(new RuntimeProjectEdit(targetProject.projectPackage, nativeAssetFormats(() => ({}))), path);
    const before = current.queryComponents({ type: "WaterBodyComponent" });
    await new PlanningProjectStorage(targetProject).initialize(document, result,
      new PlanningProjectStorage(sourceProject).pendingWaterReset);
    const restored = new RuntimeSceneEdit(new RuntimeProjectEdit(targetProject.projectPackage, nativeAssetFormats(() => ({}))), path);
    expect(restored.queryComponents({ type: "WaterBodyComponent" })).toEqual(before);
    expect(waterInitialization(targetProject.projectPackage).appliedResets).toEqual([request]);
  } finally { fetch.mockRestore(); }
}, 60000);

it("does not consume a water reset when target publication fails, and retries it once", async () => {
  const { draft, document } = fixture(1);
  const project = {
    projectPackage: draft.finish(),
    async publish(pack: RuntimeProjectPackage) { this.projectPackage = pack; return []; }
  };
  const storage = new PlanningProjectStorage(project);
  const result = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  const before = project.projectPackage;
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ files: [] }) } as Response);
  const publish = vi.spyOn(project, "publish").mockRejectedValueOnce(new Error("publication failed"));
  try {
    await expect(storage.initialize(document, result, "retry-reset")).rejects.toThrow("publication failed");
    expect(project.projectPackage).toBe(before);
    await storage.initialize(document, result, "retry-reset");
    expect(waterInitialization(project.projectPackage).appliedResets).toEqual(["retry-reset"]);
    const scene = new RuntimeSceneEdit(new RuntimeProjectEdit(project.projectPackage, nativeAssetFormats(() => ({}))), path);
    const bodies = scene.queryComponents({ type: "WaterBodyComponent" });
    await storage.initialize(document, result, "retry-reset");
    const restored = new RuntimeSceneEdit(new RuntimeProjectEdit(project.projectPackage, nativeAssetFormats(() => ({}))), path);
    expect(restored.queryComponents({ type: "WaterBodyComponent" })).toEqual(bodies);
  } finally { fetch.mockRestore(); publish.mockRestore(); }
}, 60000);

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

it("skips retained water that cannot fit Low Poly without blocking or reviving it on reload", () => {
  const { draft, document, scene } = fixture(1);
  const original = generatePlanningDocument(document, undefined, [], undefined, { environment: false });
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, document, original.plan));
  const bodies = scene.queryComponents({ type: "WaterBodyComponent" }).filter(body =>
    (scene.readComponent(body.id).props!.authoring as any).shape.kind !== "ocean");
  expect(bodies).toHaveLength(2);
  const materials = bodies.map(body => (scene.readComponent(body.id).props!.authoring as any).material);
  const target = createTemplatePlanningDocument(1, "low-poly");
  const retained = retainPlanningWaterSource(target, draft.preview());
  expect(retained.entities["river:0"].components.rivers.values.enabled).toBe(false);
  expect(retained.entities["lake:0"].components.lakes.values.enabled).toBe(true);
  expect(retained.entities.world.components.rivers.values).toMatchObject({ countMin: 0, countMax: 0 });
  expect(retained.entities.world.components.lakes.values).toMatchObject({ countMin: 1, countMax: 1 });
  const result = generatePlanningDocument(retained, undefined, [], undefined, { environment: false });
  expect(result.accepted).toBe(true);
  expect(result.plan.waters.map(water => water.id).sort()).toEqual([
    "lake:0", "lake:authored:template:low-poly:water:valley-pond"
  ]);
  writePlanningProjectSource(draft, path, initializePlanningWater(draft, retained, result.plan));
  for (const body of bodies) {
    const props = scene.readComponent(body.id).props!;
    expect(props.enabled).toBe((props.authoring as any).shape.kind === "lake");
  }
  expect(bodies.map(body => (scene.readComponent(body.id).props!.authoring as any).material)).toEqual(materials);
  const pack = draft.finish();
  const restored = planningSourceDocument(pack)!;
  const repeated = retainPlanningWaterSource(target, pack);
  for (const id of ["river:0", "lake:0"]) expect(repeated.entities[id]).toEqual(restored.entities[id]);
  const replay = generatePlanningDocument(restored, undefined, [], undefined, { environment: false });
  expect(replay.accepted).toBe(true);
  expect(replay.plan.waters.map(water => water.id)).toEqual(result.plan.waters.map(water => water.id));
  expect(waterInitialization(pack).removed?.["1"] ?? []).toEqual([]);
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
