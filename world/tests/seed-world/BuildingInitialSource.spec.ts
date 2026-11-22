import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { constructionGeometry } from "../../../packages/building/tests/fixtures/constructionGeometry";
import { buildingGenerationPlan } from "../../demos/building-components/BuildingGenerationFixture";
import { initialBuildingDrafts } from "@galacean/engine-world-planning/masonry/BuildingInitialDraft.ts";
import { initialBuildingSource } from "@galacean/engine-world-planning/masonry/BuildingInitialSource.ts";
import {
  designBuildingCore,
  expandUnits,
  type BuildingPartDef
} from "@galacean/engine-building/building/core/index.ts";
import { createBuildingTypeRegistry, MOUNTED_PART_TYPES } from "@galacean/engine-building/building/partTypes/index.ts";
import { coreBuildingEnvironment } from "@galacean/engine-building/building/render/CoreBuilding.ts";
import { BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/building/resources/BuiltinBuildingAssets";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { RuntimePreparationViews } from "@galacean/engine-runtime-editor/runtime-editor/runtime-preparation-context";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import {
  buildingScenePreparation,
  initializeBuildingScene
} from "../../demos/seed-world/masonry/BuildingSceneInitialization";

it("keeps the mounted parts the design lays when the initial plan is saved as native author Source", async () => {
  const plan = structuredClone(buildingGenerationPlan);
  const registry = createBuildingTypeRegistry(),
    environment = coreBuildingEnvironment(() => 0, constructionGeometry);
  const laid = new Set<string>(),
    rejected = new Set<string>();
  for (const group of initialBuildingDrafts(plan)) {
    const design = designBuildingCore(group.draft, registry, { environment });
    for (const part of design.parts)
      if (part.identity.kind === "author" && MOUNTED_PART_TYPES.includes(part.type))
        if (expandUnits(part, registry, { environment }).length) laid.add(part.identity.id);
    // A mounted part the design does not lay, including one whose geometry failed.
    for (const part of group.draft.parts)
      if (MOUNTED_PART_TYPES.includes(part.type) && !laid.has(part.id)) rejected.add(part.id);
  }
  expect(laid.size).toBeGreaterThan(0);
  const source = await initialBuildingSource(
    plan,
    {
      samples: new Uint16Array(4),
      resolution: 2,
      origin: [-1000, -1000],
      size: 2000,
      decode: { offset: 0, scale: 1 }
    },
    constructionGeometry,
    "Building/Units/building-kit.prefab"
  );
  const restored = JSON.parse(JSON.stringify(source)) as typeof source;
  const parts = restored.components
    .filter((c) => c.type === "BuildingPartComponent")
    .map((c) => c.props!.definition as unknown as BuildingPartDef);
  const saved = new Set(parts.map((p) => p.id));
  for (const id of laid) expect(saved.has(id), `Laid installation lost from Source: ${id}`).toBe(true);
  for (const id of rejected) expect(saved.has(id), `Rejected installation persisted: ${id}`).toBe(false);
  expect(parts.some((p) => p.type === "window")).toBe(true);
  expect(parts.some((p) => p.type === "door")).toBe(true);
  // Some houses carry a Gothic dormer on their roof.
  expect(parts.some((p) => p.type === "dormer")).toBe(true);
});

it("keeps initialized legacy building frames and hand-placed children on reload", async () => {
  const grid = {
    samples: new Uint16Array(4), resolution: 2, origin: [0, 0] as [number, number], size: 1024,
    decode: { offset: 0, scale: 1 }
  };
  const legacy = await initialBuildingSource(
    { ...buildingGenerationPlan, buildings: buildingGenerationPlan.buildings.slice(0, 1), fences: [], courtyards: [] },
    grid, constructionGeometry, BUILTIN_BUILDING_ASSETS
  );
  expect(legacy.rootEntities).toHaveLength(1);
  const path = "Seed.scene";
  const draft = new RuntimeProjectEdit({
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: path, files: [
      { virtualPath: path, path, type: "Scene" },
      { virtualPath: BUILTIN_BUILDING_ASSETS, path: BUILTIN_BUILDING_ASSETS, type: "Prefab" }
    ] },
    contents: {
      [path]: JSON.stringify({
        asset: { version: "2.0" }, scene: { rootEntities: ["generator"] },
        entities: [{ id: "generator", components: ["init"], children: [...legacy.rootEntities, "author-prop"] },
          ...legacy.entities, { id: "author-prop", name: "Hand placed" }],
        components: [{ id: "init", type: "BuildingGeneratorComponent", props: { initialized: true } }, ...legacy.components]
      })
    }
  }, nativeAssetFormats(() => ({})));
  const plan = buildingGenerationPlan;
  const scene = new RuntimeSceneEdit(draft, path);
  const withAsset = vi.fn();
  const edit = {
    run: async (run: (args: { draft: RuntimeProjectEdit; edited: () => void }) => unknown) => run({ draft, edited() {} }),
    withAsset
  } as unknown as Parameters<ReturnType<typeof buildingScenePreparation>>[0];
  const prepare = buildingScenePreparation(path, async () => ({ plan, terrain: { grid, revision: 0 } }), plan);
  await prepare(edit, new AbortController().signal);
  const children = scene.readEntity("generator").children!.map((id) => scene.readEntity(id));
  const active = children.find((child) => child.children?.includes(legacy.rootEntities[0]));
  expect(active?.children).toEqual(legacy.rootEntities);
  expect(scene.readEntity(legacy.rootEntities[0]).position).toEqual(legacy.entities[0].position);
  expect(children.some((child) => child.id === "author-prop")).toBe(true);
  const before = draft.read(path);
  await prepare(edit, new AbortController().signal);
  expect(draft.read(path)).toBe(before);
  expect(withAsset).not.toHaveBeenCalled();
}, 60000);

it("skips boot-time editor mutation for 0-building templates and converges initialized:true without re-running inputs on later edits", async () => {
  const path = "Seed.scene";
  const grid = {
    samples: new Uint16Array(4),
    resolution: 2,
    origin: [0, 0] as [number, number],
    size: 1024,
    decode: { offset: 0, scale: 1 }
  };
  const zeroPlan = {
    ...buildingGenerationPlan,
    parameters: { ...buildingGenerationPlan.parameters, worldTemplate: { id: "titan-wasteland" } },
    buildings: [],
    fences: [],
    courtyards: []
  };
  const projectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: path, files: [{ virtualPath: path, path, type: "Scene" }] },
    contents: {
      [path]: JSON.stringify({
        asset: { version: "2.0" },
        scene: { rootEntities: ["generator"] },
        entities: [{ id: "generator", components: ["init"], children: [] }],
        components: [{ id: "init", type: "BuildingGeneratorComponent", props: { initialized: false } }]
      })
    }
  };
  const beginEdit = vi.fn();
  const emptyGeneratorId = await initializeBuildingScene(
    { projectPackage } as any,
    { beginEdit } as any,
    zeroPlan,
    { grid, revision: 0 },
    new AbortController().signal
  );
  // Fast-path skips opening a heavyweight RuntimeProjectEdit during boot.
  expect(beginEdit).not.toHaveBeenCalled();
  expect(emptyGeneratorId).toBe("init");

  // Subsequent editor transactions converge `initialized: true` in-place with 0 `inputs()` calls.
  const editInputs = vi.fn(async () => ({ plan: zeroPlan, terrain: { grid, revision: 1 } }));
  const registered = buildingScenePreparation(path, editInputs, undefined, {
    bootEmptyInitializedGeneratorId: () => emptyGeneratorId
  });
  const editDraft1 = new RuntimeProjectEdit(structuredClone(projectPackage), nativeAssetFormats(() => ({})));
  const views1 = new RuntimePreparationViews(projectPackage as any);
  editDraft1.writeDocument("planning.json", JSON.stringify({ revision: 1 }));
  let edited1 = false;
  await registered(
    {
      run: async (fn: any) => fn({ draft: editDraft1, edited: () => { edited1 = true; } }),
      withAsset: vi.fn()
    } as any,
    new AbortController().signal,
    views1.current(editDraft1)
  );
  expect(edited1).toBe(true);
  expect(editInputs).not.toHaveBeenCalled();
  expect(JSON.parse(editDraft1.read(path) as string).components[0].props.initialized).toBe(true);

  // Edit #2 hits the fast `initialized === true` early-return guard with 0 writes and 0 `inputs()` calls.
  const pkgAfterEdit1 = editDraft1.preview();
  const editDraft2 = new RuntimeProjectEdit(structuredClone(pkgAfterEdit1), nativeAssetFormats(() => ({})));
  const views2 = new RuntimePreparationViews(pkgAfterEdit1);
  editDraft2.writeDocument("planning.json", JSON.stringify({ revision: 2 }));
  let edited2 = false;
  await registered(
    {
      run: async (fn: any) => fn({ draft: editDraft2, edited: () => { edited2 = true; } }),
      withAsset: vi.fn()
    } as any,
    new AbortController().signal,
    views2.current(editDraft2)
  );
  expect(edited2).toBe(false);
  expect(editInputs).not.toHaveBeenCalled();
});

it("matches sync initialBuildingSource byte-for-byte when fanned out across BuildingCpuClient workers out of order", async () => {
  const { designInitialBuildingGroup } = await import(
    "@galacean/engine-building/building/parts/architecture/BuildingInitialGroup.ts"
  );
  const { BuildingCpuClient } = await import(
    "@galacean/engine-building/building/parts/architecture/BuildingCpuClient.ts"
  );
  const plan = structuredClone(buildingGenerationPlan);
  const grid = {
    samples: new Uint16Array(4),
    resolution: 2,
    origin: [-1000, -1000] as [number, number],
    size: 2000,
    decode: { offset: 0, scale: 1 }
  };
  const syncResult = await initialBuildingSource(
    plan,
    grid,
    constructionGeometry,
    "Building/Units/building-kit.prefab"
  );

  // Stub Worker to execute designInitialBuildingGroup asynchronously and reply in reverse order.
  const pendingReplies: (() => void)[] = [];
  class FakeBuildingWorker {
    onmessage: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    private assets = new Map<number, any>();
    private terrains = new Map<number, any>();
    postMessage(msg: any) {
      if (msg.mode === "release") return;
      if (msg.units) this.assets.set(msg.assetId, msg.units);
      if (msg.terrain) this.terrains.set(msg.terrainId, msg.terrain);
      const units = this.assets.get(msg.assetId);
      const terrain = this.terrains.get(msg.terrainId);
      pendingReplies.push(() => {
        const result = designInitialBuildingGroup(msg.group, terrain, units, msg.library, msg.layoutKey);
        this.onmessage?.({ data: { id: msg.id, ok: true, result } });
      });
    }
    terminate() {}
  }
  vi.stubGlobal("Worker", FakeBuildingWorker);
  const compiler = new BuildingCpuClient(3);
  try {
    const workerPromise = initialBuildingSource(
      plan,
      grid,
      constructionGeometry,
      "Building/Units/building-kit.prefab",
      undefined,
      undefined,
      compiler
    );
    expect(pendingReplies.length).toBeGreaterThan(1);
    // Reply in reverse order to verify deterministic output ordering.
    while (pendingReplies.length > 0) pendingReplies.pop()!();
    const workerResult = await workerPromise;
    expect(workerResult).toEqual(syncResult);
  } finally {
    compiler.dispose();
    vi.unstubAllGlobals();
  }
});
