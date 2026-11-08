import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization.ts";
import { generatePlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningRuntime.ts";
import { expect, it } from "vitest";
import { planningSeedURL } from "../../demos/seed-world/src/planning/spatial/PlanningDocumentCodec";
import { planningProjectFixture as fixture } from "./PlanningProjectFixture";
import { importPlanningDocument, exportPlanningRecipe, exportPlanningAuthoring } from "@galacean/engine-world-planning/spatial/PlanningDocument.ts";
import { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession.ts";
import { SEMANTIC_DEFAULTS } from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract.ts";
import { defaultPoiLayout } from "@galacean/engine-world-planning/semantic-study/PoiDistribution.ts";
const recipe = () => ({
  version: 2 as const,
  parameters: { ...SEMANTIC_DEFAULTS, seed: 1, poiLayout: defaultPoiLayout() },
  edits: {}
});
it("round-trips authored data and retains local parameters only for their Seed", async () => {
  const { store } = fixture();
  const doc = importPlanningDocument(recipe());
  doc.entities.world.components.world.values.landCoverage = 0.7;
  doc.entities["poi-small-0"] = {
    id: "poi-small-0",
    name: "Test",
    components: { flowers: { values: { coverage: 0.2 } } }
  };
  await store.save(doc);
  expect((await store.load(1))?.entities).toEqual(doc.entities);
  const next = (await store.load(2))!;
  expect(exportPlanningRecipe(next).parameters.seed).toBe(2);
  expect(exportPlanningRecipe(next).parameters.landCoverage).toBe(SEMANTIC_DEFAULTS.landCoverage);
  expect(next.entities["poi-small-0"]).toBeUndefined();
  expect(next.layoutOverrides?.["1"].entities["poi-small-0"]).toEqual(doc.entities["poi-small-0"]);
  await store.save(next);
  expect((await store.load(1))?.entities).toEqual(doc.entities);
});
it.each(["not-json", "null", '{"version":1,"entities":{}}'])(
  "rejects malformed storage without destroying it: %s",
  async (raw) => {
    const { store, setRaw, getRaw } = fixture();
    setRaw(raw);
    await expect(store.load(1)).rejects.toThrow();
    expect(getRaw()).toBe(raw);
  }
);
it("saves accepted parameter edits reproducibly without editor history; rejected edits leave DB unchanged", async () => {
  const { store } = fixture();
  const session = new PlanningSession(recipe(), undefined, undefined, { history: false });
  await session.initialize();
  const changed = await session.dispatchParameters([
    { op: "set", entity: "world", component: "world", values: { landCoverage: 0.6 } }
  ]);
  expect(changed.status, changed.message).toBe("accepted");
  await store.save(session.export());
  expect(session.canUndo).toBe(false);
  expect(session.canRedo).toBe(false);
  const prior = await store.load(1);
  const rejected = await session.dispatchParameters([
    { op: "set", entity: "world", component: "world", values: { landCoverage: NaN } }
  ]);
  expect(rejected.status).toBe("rejected");
  expect(await store.load(1)).toEqual(prior);
  const reload = new PlanningSession(recipe(), undefined, await store.load(1), { history: false });
  await reload.initialize();
  expect(reload.recipe()).toEqual(session.recipe());
  expect(reload.result!.plan.buildings).toEqual(session.result!.plan.buildings);
  expect(reload.result!.plan.routes).toEqual(session.result!.plan.routes);
}, 120000);

it("removes retired world-river settings from active and archived Seeds without losing current ecology edits", async () => {
  const { store } = fixture();
  const document = importPlanningDocument(recipe());
  const river = { id: "world-river-0", name: "Removed river", components: { riverNetwork: { values: { widthM: 8 } } } };
  document.entities.world.components.riverNetwork = { values: { count: 1 } };
  document.entities[river.id] = river;
  Object.assign(document.passthrough.parameters, { worldRivers: { count: 1 } });
  Object.assign(document.passthrough.edits, {
    [river.id]: { river: { widthM: 8 } },
    "poi-small-0": { flowers: { coverage: 0.2 } }
  });
  document.layoutOverrides = {
    "2": { entities: { [river.id]: structuredClone(river) }, edits: { [river.id]: { river: { widthM: 8 } } } as never }
  };
  await store.save(document);
  const loaded = (await store.load(1))!;
  expect(loaded.entities.world.components.riverNetwork).toBeUndefined();
  expect(loaded.entities[river.id]).toBeUndefined();
  expect(loaded.layoutOverrides?.["2"]?.edits).toEqual({});
  expect(Object.keys(loaded.layoutOverrides?.["2"]?.entities ?? {}).sort()).toEqual([
    "policy:large",
    "policy:medium",
    "policy:small"
  ]);
  for (const entity of Object.values(loaded.layoutOverrides?.["2"]?.entities ?? {}))
    expect(entity.components.layout.values).toEqual({});
  expect(loaded.passthrough.parameters).not.toHaveProperty("worldRivers");
  expect(loaded.passthrough.edits).toEqual({ "poi-small-0": { flowers: { coverage: 0.2 } } });
});

it("keeps the explicit debug page mode while removing encoded parameters", async () => {
  expect(planningSeedURL("http://localhost/editor?debug=1&document=old&seed=1&version=2", 8)).toBe(
    "http://localhost/editor?seed=8&debug=1"
  );
});

it("stores planning data only in the project without browser-storage fallback", async () => {
  const { PlanningProjectStorage, PLANNING_PROJECT_PATH } = await import("../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectStorage");
  const document = importPlanningDocument(recipe());
  const { project, store: storage } = fixture();
  expect(await storage.load(1)).toBeUndefined();
  const generated = { roads: { routes: [] } } as never;
  document.placementState = generated;
  document.layoutOverrides = { "2": { entities: structuredClone(document.entities), edits: {}, placementState: generated } };
  await storage.save(document);
  const saved = JSON.parse(project.projectPackage.contents[PLANNING_PROJECT_PATH] as string);
  expect(saved.placementState).toBeUndefined();
  expect(saved.layoutOverrides["2"].placementState).toBeUndefined();
  expect(document.placementState).toBe(generated);
  expect(document.layoutOverrides["2"].placementState).toBe(generated);
  expect(project.projectPackage.contents[PLANNING_PROJECT_PATH]).toBe(JSON.stringify(exportPlanningAuthoring(document)));
  expect(project.projectPackage.project.files).toHaveLength(2);
  expect((await storage.load(1))?.entities).toEqual(document.entities);
  project.projectPackage.contents[PLANNING_PROJECT_PATH] = JSON.stringify({ ...document, version: 2 });
  await expect(storage.load(1)).rejects.toThrow("本地工程格式无效");
  await storage.save(document);
  expect(project.projectPackage.project.files).toHaveLength(2);
  const sceneContent = JSON.stringify({ name: "keep", entities: [], components: [] });
  project.projectPackage.contents["Scene.json"] = sceneContent;
  await storage.clear();
  expect(await storage.load(1)).toBeUndefined();
  expect(project.projectPackage.contents["Scene.json"]).toBe(sceneContent);
  expect(project.projectPackage.project.files).toHaveLength(1);
  await storage.save(document);
  expect((await storage.load(1))?.entities).toEqual(document.entities);
  const previous = project.projectPackage;
  project.publish = async () => { throw new Error("storage failure"); };
  await expect(storage.save(document)).rejects.toThrow("storage failure");
  expect(project.projectPackage).toBe(previous);
});

it("stores only parameters for active and archived Seeds without mutating the live cache", async () => {
  const document = createSeedPlanningDocument(1);
  const result = generatePlanningDocument(document);
  document.placementState = result.plan.spatialLayout;
  const raw = JSON.stringify(document);
  const { store, setRaw, getRaw } = fixture();
  await store.save(document);
  const packed = getRaw()!;
  const loaded = (await store.load(1))!;
  expect(loaded.placementState).toBeUndefined();
  expect(document.placementState).toBe(result.plan.spatialLayout);
  expect(generatePlanningDocument(loaded).plan.spatialLayout).toEqual(result.plan.spatialLayout);
  expect(loaded.entities).toEqual(document.entities);
  const next = (await store.load(2))!;
  await store.save(next);
  expect((await store.load(1))!.placementState).toBeUndefined();
  expect((await store.load(2))!.layoutOverrides?.["1"].placementState).toBeUndefined();
  setRaw(raw);
  expect((await store.load(1))!.placementState).toBeUndefined();
  console.log(
    JSON.stringify({
      rawBytes: raw.length * 2,
      storedBytes: packed.length * 2,
      reduction: 1 - packed.length / raw.length
    })
  );
}, 120000);

it("migrates scalar river depth in active and archived authoring without losing its value", async () => {
  const {store,setRaw}=fixture();
  const doc=importPlanningDocument(recipe());
  doc.entities.world.components.rivers={values:{depthM:2}};
  setRaw(JSON.stringify(doc));
  const loaded=(await store.load(1))!;
  expect(loaded.entities.world.components.rivers.values).toEqual({depthMinM:2,depthMaxM:2});
});

 it.each([0, 2, undefined])("rejects invalid inner document formats without partially resetting the project: %s", async version => {
  const { store, setRaw, getRaw } = fixture();
  const raw = JSON.stringify({ ...createSeedPlanningDocument(1), version });
  setRaw(raw);
  await expect(store.load(1)).rejects.toThrow("本地工程格式无效");
  expect(getRaw()).toBe(raw);
});
