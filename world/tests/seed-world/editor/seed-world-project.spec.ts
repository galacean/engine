import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import {
  openSeedWorldProject,
  seedWorldProjectStorageId,
  SEED_WORLD_BUILDING_SAVE_VERSION
} from "../../../demos/seed-world/SeedWorldProject";
import { SEED_WORLD_PRODUCTION_ASSET_CATALOG } from "@galacean/engine-vegetation/asset-assembly/SeedWorldProductionAssetCatalog.ts";
import { createSeedPlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningInitialization.ts";
import {
  PlanningProjectStorage,
  PLANNING_PROJECT_PATH
} from "../../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectStorage";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session.ts";
import {
  RuntimeProjectStorage,
  type RuntimeProjectManifest,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { validateProjectDependencies } from "@galacean/engine-project/runtime-editor/project/runtime-project-dependencies.ts";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import textureManifest from "@galacean/engine-water/water/resources/river/assets/ktx2-manifest.json";
import { builtinFarmingPropFiles } from "@galacean/engine-farming/farming/presentation/props/FarmingPropResources";
import { preparePlanningFarmingScene } from "../../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingScene";
import { planningFarmingRecoveryNotice, planningFarmingRecoveryUrl } from "../../../demos/seed-world/src/planning/spatial/farming/PlanningFarmingQuarantine";

vi.hoisted(() => {
  (globalThis as any).window ??= {};
});

const sessions: RuntimeProjectSession[] = [];
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function readCatalogFile(url: string): Promise<string> {
  const parsed = new URL(url);
  const root = globalThis.__migrationRepositoryRoot;
  const local = parsed.protocol === "file:" ? fileURLToPath(parsed) : undefined;
  // Vitest resolves Vite's root-relative asset URLs against file: import.meta.url.
  const path = local?.startsWith(`${root}/`)
    ? local
    : parsed.pathname.startsWith("/@fs/")
      ? decodeURIComponent(parsed.pathname.slice(4))
      : resolve(root, `.${decodeURIComponent(parsed.pathname)}`);
  return readFile(path, "utf8");
}

function storageFixture() {
  const records = new Map<string, RuntimeProjectPackage>();
  const close = vi.fn();
  const save = vi.fn(async (id: string, pack: RuntimeProjectPackage) => {
    validateProjectDependencies(pack);
    records.set(id, structuredClone(pack));
  });
  const load = vi.fn(async (id: string) => structuredClone(records.get(id)));
  const deleteMatching = vi.fn(async (matches: (id: string) => boolean) => {
    const removed = [...records.keys()].filter(matches);
    for (const id of removed) records.delete(id);
    return removed;
  });
  vi.spyOn(RuntimeProjectStorage, "open").mockImplementation(
    async () =>
      ({
        load,
        save,
        close,
        deleteMatching
      }) as unknown as RuntimeProjectStorage
  );
  const url = new URL("https://seed.test/demos/terrain/seed-world-planner/index.html?seed=42");
  vi.stubGlobal("location", { href: url.href });
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => new Response(await readCatalogFile(String(input))));
  return { url, close, save, fetcher, records, load };
}

it.each(["runtime", "planning"] as const)(
  "opens a writable Seed World from the %s entry and restores planning edits",
  async (entry) => {
    const f = storageFixture();
    const initial = JSON.parse(
      await readCatalogFile(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl)
    ) as RuntimeProjectManifest;
    const project = await openSeedWorldProject(f.url, entry === "runtime" ? initial : undefined);
    sessions.push(project);
    validateProjectDependencies(project.projectPackage);
    expect(f.save).not.toHaveBeenCalled();
    // Only the known farm AnimatorControllers are additional text reads. Mesh, texture and clip files stay lazy.
    const controllers = builtinFarmingPropFiles.filter((file) => file.type === "AnimatorController");
    const controllerUrls = new Set(controllers.map((file) => new URL(file.path, f.url).href));
    const fetched = f.fetcher.mock.calls.map(([url]) => String(url));
    expect(new Set(fetched.filter((url) => /\.animCtrl$/.test(new URL(url).pathname)))).toEqual(controllerUrls);
    expect(controllerUrls.size).toBeGreaterThan(0);
    expect(fetched.every((url) => /\.(json|scene|prefab|mat)$/.test(new URL(url).pathname) || controllerUrls.has(url))).toBe(true);
    for (const file of builtinFarmingPropFiles.filter((asset) => ["Mesh", "KTX2", "AnimationClip"].includes(asset.type))) {
      expect(fetched).not.toContain(new URL(file.path, f.url).href);
      expect(project.projectPackage.contents[file.virtualPath]).toBeUndefined();
    }
    expect(
      project.projectPackage.project.files.find((file) => file.virtualPath === "Prefab/Detail/detail-00.prefab")
        ?.dependencies
    ).toEqual(expect.arrayContaining(["Models/grass-2-authored.glb", "Material/Vegetation/grass-2.mat"]));
    const waterManifest = project.projectPackage.project.files.find((file) =>
      file.virtualPath.endsWith("WaterAotManifest.json")
    )!;
    expect(waterManifest.dependencies?.length).toBeGreaterThan(0);
    expect(waterManifest.dependencies?.every((path) => path.startsWith("Shader/Water/"))).toBe(true);

    const storage = new PlanningProjectStorage(project);
    const document = createSeedPlanningDocument(42);
    document.entities.world.components.world.values.landCoverage = 0.7;
    await storage.save(document);
    await project.flush();
    expect(f.save).toHaveBeenCalledTimes(1);
    expect(
      project.projectPackage.project.files.find((file) => file.virtualPath === PLANNING_PROJECT_PATH)?.dependencies
    ).toEqual([]);
    project.dispose();
    sessions.pop();

    f.fetcher.mockClear();
    const restored = await openSeedWorldProject(f.url, initial);
    sessions.push(restored);
    expect(f.fetcher).not.toHaveBeenCalled();
    const restoredStorage = new PlanningProjectStorage(restored);
    const loaded = (await restoredStorage.load(42))!;
    expect(loaded.entities.world.components.world.values.landCoverage).toBe(0.7);
    loaded.entities.world.components.world.values.landCoverage = 0.6;
    await restoredStorage.save(loaded);
    await restored.flush();
    expect(f.save).toHaveBeenCalledTimes(2);
    expect((await restoredStorage.load(42))?.entities.world.components.world.values.landCoverage).toBe(0.6);
  }
);

it("keeps an ordinary JSON asset with a .farming filename on reopen", async () => {
  const f = storageFixture();
  const project = await openSeedWorldProject(f.url);
  sessions.push(project);
  await preparePlanningFarmingScene(project, { baseUrl: f.url.href });
  const path = "Other/Config.farming";
  const content = '{\n  "kind": "catalog",\n  "example": true\n}\n';
  await project.publishAsset({ virtualPath: path, path: "runtime:other-config", type: "JSON" }, content);
  await project.flush();
  project.dispose();
  sessions.pop();

  const restored = await openSeedWorldProject(f.url);
  sessions.push(restored);
  expect(restored.projectPackage.project.files.find((file) => file.virtualPath === path)?.type).toBe("JSON");
  expect(restored.projectPackage.contents[path]).toBe(content);
  expect(planningFarmingRecoveryNotice(restored.projectPackage)).toBeUndefined();
  expect(planningFarmingRecoveryUrl(restored.projectPackage, f.url)).toBeUndefined();
});

it.each([1, 2, 3])("opens other authoring when farm preset %s contains unsupported resources", async (version) => {
  const f = storageFixture();
  const initial = JSON.parse(await readCatalogFile(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl)) as RuntimeProjectManifest;
  const project = await openSeedWorldProject(f.url, initial);
  sessions.push(project);
  await preparePlanningFarmingScene(project, { baseUrl: f.url.href });
  await project.save();
  project.dispose();
  sessions.pop();

  const saved = f.records.get(project.id)!;
  const scenePath = saved.project.scene;
  const marker = `${scenePath}.farming-preset.json`;
  const archivePath = `${scenePath}.farming-quarantine.json`;
  const farmStatePath = "World/Farming.json";
  const oldCatalogPath = "World/Farming/Catalog.farming";
  const oldRulesPath = "World/Farming/Rules.farming";
  const catalogPath = "World/Farming/Catalog.json";
  const rulesPath = "World/Farming/Rules.json";
  const legacyScript = "World/Farming/legacy.ts";
  const ownerScript = "Other/Owner.ts";
  const ownerScriptText = 'import { Script } from "@galacean/engine"; export default class Owner extends Script {}';
  const legacyBinary = "World/Farming/Legacy.mesh";
  const missingLegacy = "World/Farming/Missing.farming";
  const coldBodies = new Map<string, Uint8Array<ArrayBuffer>>();
  const detachedComponents = new Set(["legacy-farm-script", "farm-owner", "farm-owner-consumer"]);
  const otherDocument = "Notes/World.txt";
  const farmComponent = JSON.parse(saved.contents[scenePath] as string).components.find(
    (component: GalaceanSourceComponentSchema) => component.type === "FarmingSystem"
  ) as GalaceanSourceComponentSchema;
  const legacyResources = version === 3;
  if (legacyResources) {
    const rename = new Map([[catalogPath, oldCatalogPath], [rulesPath, oldRulesPath]]);
    for (const file of saved.project.files) {
      const old = rename.get(file.virtualPath);
      if (old) {
        saved.contents[old] = saved.contents[file.virtualPath];
        delete saved.contents[file.virtualPath];
        const meta = saved.documents?.[`${file.virtualPath}.meta`];
        if (meta !== undefined) {
          saved.documents![`${old}.meta`] = meta;
          delete saved.documents![`${file.virtualPath}.meta`];
        }
        file.virtualPath = old;
        file.type = "FarmingResource";
      }
      file.dependencies = file.dependencies!.map((ref) => rename.get(ref) ?? ref);
    }
    const scene = JSON.parse(saved.contents[scenePath] as string) as GalaceanSourceSceneFile;
    const system = scene.components.find(({ id }) => id === farmComponent.id)!;
    system.props!.catalog = { $ref: oldCatalogPath };
    system.props!.rules = { $ref: oldRulesPath };
    const owner = scene.entities.find((entity) => entity.components?.includes(system.id))!;
    const scriptComponent = "legacy-farm-script";
    owner.components!.push(scriptComponent);
    scene.components.push({ id: scriptComponent, type: "Script", script: { $ref: legacyScript } });
    saved.project.files.find((file) => file.virtualPath === scenePath)!.dependencies!.push(legacyScript);
    saved.project.files.push({ virtualPath: legacyScript, path: "runtime:legacy-farm-script", type: "script", dependencies: [oldCatalogPath] });
    saved.contents[legacyScript] = 'import catalog from "./Catalog.farming"; export default catalog;';

    const root = scene.entities.find((entity) => entity.id === scene.scene.rootEntities[0])!;
    (root.components ??= []).push("farm-owner-consumer", "farm-owner", "unrelated-owner");
    const script = { type: "Script", script: { $ref: ownerScript } };
    scene.components.push(
      { ...script, id: "farm-owner-consumer", props: { inputs: [{ $component: "farm-owner" }] } },
      { ...script, id: "farm-owner", props: { owner: { $component: system.id } } },
      { ...script, id: "unrelated-owner" }
    );
    saved.project.files.find((file) => file.virtualPath === scenePath)!.dependencies!.push(ownerScript);
    saved.project.files.push({ virtualPath: ownerScript, path: "runtime:owner-script", type: "script", dependencies: [] });
    saved.contents[ownerScript] = ownerScriptText;
    // Node has no browser Worker. Only Script dependency analysis is stubbed; Scene compilation is real.
    vi.spyOn(RuntimeProjectSession.prototype, "compileScripts").mockResolvedValue({
      dependencies: { [ownerScript]: [] },
      entries: {},
      files: {}
    });
    const coldAsset = (path: string, type: string, body?: Uint8Array<ArrayBuffer>) => {
      const url = new URL(path, f.url.origin).href;
      const existing = saved.project.files.find((file) => file.virtualPath === path);
      if (existing) existing.path = url;
      else saved.project.files.push({ virtualPath: path, path: url, type, dependencies: type === "Mesh" ? [oldCatalogPath] : [] });
      if (body) coldBodies.set(path, body);
      delete saved.contents[path];
    };
    coldAsset(oldCatalogPath, "FarmingResource", new TextEncoder().encode("\uFEFF" + saved.contents[oldCatalogPath]));
    coldAsset(legacyBinary, "Mesh", new Uint8Array([0, 255, 3, 128]));
    coldAsset(missingLegacy, "FarmingResource");
    const regularFetch = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((input, init) => {
      const path = new URL(String(input)).pathname.slice(1);
      if (path === missingLegacy) return Promise.resolve(new Response(null, {status: 404}));
      const body = coldBodies.get(path);
      return body ? Promise.resolve(new Response(body)) : regularFetch(input, init);
    });
    saved.contents[scenePath] = JSON.stringify(scene);
  }
  saved.documents = { ...saved.documents, [marker]: JSON.stringify({ version, scene: scenePath }), [otherDocument]: "Keep this authoring" };
  const props = new Set(builtinFarmingPropFiles.map((file) => file.virtualPath));
  const keptProp = builtinFarmingPropFiles.find((file) => file.type === "Material")!.virtualPath;
  const keptPropFile = saved.project.files.find(({ virtualPath }) => virtualPath === keptProp)!;
  const keptPropText = JSON.stringify({ ...JSON.parse(saved.contents[keptProp] as string), name: "Author's material edit" });
  const keepProps = new Set(legacyResources ? [keptProp, ...keptPropFile.dependencies!] : []);
  saved.project.files = saved.project.files.filter((file) => !props.has(file.virtualPath) || keepProps.has(file.virtualPath));
  for (const path of props) if (!keepProps.has(path)) delete saved.contents[path];
  if (legacyResources) {
    saved.contents[keptProp] = keptPropText;
  }
  const occupiedState = "World/Farming/Rebuilt/State.json";
  saved.project.files.push({ virtualPath: occupiedState, path: "runtime:existing-rebuilt-state", type: "JSON", dependencies: [] });
  const occupiedStateText = '{"keep":"previous author content"}';
  saved.contents[occupiedState] = occupiedStateText;
  const oldState = saved.contents[farmStatePath];
  expect(typeof oldState).toBe("string");
  const originalScene = saved.contents[scenePath];
  const originalComponents = (JSON.parse(originalScene as string) as GalaceanSourceSceneFile).components;

  if (legacyResources) {
    const invalid = JSON.parse(originalScene as string) as GalaceanSourceSceneFile;
    invalid.components.find(({ id }) => id === "unrelated-owner")!.props = {
      owner: { $component: "missing-component" }
    };
    const invalidText = JSON.stringify(invalid);
    saved.contents[scenePath] = invalidText;
    f.save.mockClear();
    await expect(openSeedWorldProject(f.url, initial)).rejects.toThrow(/\$component references missing component/);
    expect(f.save).not.toHaveBeenCalled();
    expect(f.records.get(project.id)?.contents[scenePath]).toBe(invalidText);
    expect(f.records.get(project.id)?.contents[oldCatalogPath]).toBeUndefined();
    expect(f.records.get(project.id)?.documents?.[archivePath]).toBeUndefined();
    saved.contents[scenePath] = originalScene;
  }

  const opened = await openSeedWorldProject(f.url, initial);
  sessions.push(opened);
  validateProjectDependencies(opened.projectPackage);
  expect(opened.projectPackage.contents[farmStatePath]).toBe(oldState);
  expect(opened.projectPackage.documents?.[otherDocument]).toBe("Keep this authoring");
  expect(new Set(opened.projectPackage.project.files.filter((file) => props.has(file.virtualPath)).map((file) => file.virtualPath)))
    .toEqual(keepProps);
  expect(opened.projectPackage.project.files.some((file) => file.type === "FarmingResource" || file.virtualPath === legacyScript)).toBe(false);
  const archive = JSON.parse(opened.projectPackage.documents![archivePath]) as {
    originalHierarchies: Record<string, string>;
    assets: { file: { virtualPath: string }; content?: string | number[]; contentUnavailable?: string; metadata?: string }[];
  }[];
  expect(archive[0].originalHierarchies[scenePath]).toBe(originalScene);
  if (legacyResources) {
    const assets = new Map(archive[0].assets.map((asset) => [asset.file.virtualPath, asset]));
    for (const path of [oldCatalogPath, oldRulesPath, legacyScript, legacyBinary]) {
      expect(assets.get(path)).toMatchObject({
        file: saved.project.files.find((file) => file.virtualPath === path),
        content: coldBodies.has(path) ? Array.from(coldBodies.get(path)!) : saved.contents[path]
      });
      expect(assets.get(path)?.metadata).toBe(saved.documents?.[`${path}.meta`]);
    }
    expect(assets.get(missingLegacy)).toMatchObject({ contentUnavailable: "Error: HTTP 404" });
    expect(assets.get(missingLegacy)).not.toHaveProperty("content");
    expect(assets.has(ownerScript)).toBe(false);
    expect(opened.projectPackage.project.files.find((file) => file.virtualPath === ownerScript)?.type).toBe("script");
    expect(opened.projectPackage.contents[ownerScript]).toBe(ownerScriptText);
  }
  await expect(opened.resources()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ virtualPath: scenePath })]));
  expect((JSON.parse(opened.projectPackage.contents[scenePath] as string) as GalaceanSourceSceneFile).components).toEqual(
    originalComponents.filter(({ type, id }) => type !== "FarmingSystem" && !detachedComponents.has(id))
  );
  expect(planningFarmingRecoveryNotice(opened.projectPackage)).toContain("rebuildFarm=1");
  await preparePlanningFarmingScene(opened, { baseUrl: f.url.href });
  expect(opened.projectPackage.documents?.[marker]).toBeUndefined();
  if (legacyResources) {
    const slot = builtinFarmingPropFiles.find((file) => file.type === "Mesh")!.virtualPath;
    await opened.publishAsset({ virtualPath: slot, path: "runtime:other-author-asset", type: "JSON" }, "{}");
    const revision = opened.publicationRevision;
    await expect(preparePlanningFarmingScene(opened, { baseUrl: f.url.href, rebuildQuarantinedFarm: true }))
      .rejects.toThrow(`Farming prop type conflict: ${slot}`);
    expect(opened.publicationRevision).toBe(revision);
    expect(opened.projectPackage.contents[slot]).toBe("{}");
    const draft = new RuntimeProjectEdit(opened.projectPackage, nativeAssetFormats(() => ({})));
    draft.delete(slot);
    await opened.publish(draft.finish(), revision, [slot]);
  }
  await preparePlanningFarmingScene(opened, { baseUrl: f.url.href, rebuildQuarantinedFarm: true });
  const built = (JSON.parse(opened.projectPackage.contents[scenePath] as string) as GalaceanSourceSceneFile).components.find(({ type }) => type === "FarmingSystem")!;
  expect(built.id).not.toBe(farmComponent.id);
  expect(built.props).toMatchObject({
    catalog: { $ref: "World/Farming/Rebuilt-2/Catalog.json" },
    rules: { $ref: "World/Farming/Rebuilt-2/Rules.json" },
    state: { $ref: "World/Farming/Rebuilt-2/State.json" }
  });
  const reopenedProject = opened.projectPackage;
  expect(reopenedProject.contents[occupiedState]).toBe(occupiedStateText);
  const hoe = "Farming/Props/Tilling/hoe.prefab";
  expect(JSON.parse(opened.fileProvider().read(hoe) as string).asset.version).toBe("2.0");
  expect(reopenedProject.project.files.find((file) => file.virtualPath === hoe)?.dependencies)
    .toContain("Farming/Props/Tilling/hoe.animCtrl");
  expect(reopenedProject.project.files.filter((file) => props.has(file.virtualPath))).toHaveLength(props.size);
  expect(reopenedProject.project.files.find((file) => file.virtualPath.endsWith("/Rebuilt-2/Catalog.json"))?.dependencies)
    .toEqual(expect.arrayContaining([expect.stringMatching(/^World\/Farming\/Rebuilt-2\/Textures\//)]));
  if (legacyResources) expect(reopenedProject.contents[keptProp]).toBe(keptPropText);
  expect(opened.projectPackage.contents[farmStatePath]).toBe(oldState);
  expect(planningFarmingRecoveryNotice(opened.projectPackage)).toBeUndefined();
  expect(planningFarmingRecoveryUrl(opened.projectPackage, f.url)).toBeUndefined();
  await opened.save();
  opened.dispose();
  sessions.pop();

  const restored = await openSeedWorldProject(f.url, initial);
  sessions.push(restored);
  const originalRestored = restored.projectPackage.contents[scenePath];
  await preparePlanningFarmingScene(restored, { baseUrl: f.url.href, rebuildQuarantinedFarm: true });
  expect(restored.projectPackage.contents[scenePath]).toBe(originalRestored);
  expect(restored.projectPackage.contents[farmStatePath]).toBe(oldState);
  expect(restored.projectPackage.documents![archivePath]).toBe(opened.projectPackage.documents![archivePath]);
  if (legacyResources) {
    const rebuiltState = "World/Farming/Rebuilt-2/State.json";
    const firstRebuild = restored.projectPackage.contents[rebuiltState];
    restored.dispose();
    sessions.pop();
    // Model a project that was independently quarantined again after an earlier successful rebuild.
    f.records.get(project.id)!.documents![marker] = JSON.stringify({ version: 2, scene: scenePath });
    const isolatedAgain = await openSeedWorldProject(f.url, initial);
    sessions.push(isolatedAgain);
    expect(isolatedAgain.projectPackage.contents["World/Farming/Rebuilt-3/State.json"]).toBeUndefined();
    await preparePlanningFarmingScene(isolatedAgain, { baseUrl: f.url.href, rebuildQuarantinedFarm: true });
    expect(isolatedAgain.projectPackage.contents[rebuiltState]).toBe(firstRebuild);
    expect(isolatedAgain.projectPackage.contents["World/Farming/Rebuilt-3/State.json"]).toBe('{"version":1,"farms":{}}');
  }
});

it("isolates a retired Prefab component, its instance references and overrides in their Source scope", async () => {
  const f = storageFixture();
  const project = await openSeedWorldProject(f.url);
  sessions.push(project);
  await project.save();
  project.dispose();
  sessions.pop();

  const saved = f.records.get(project.id)!;
  const scenePath = saved.project.scene;
  const farmPrefab = "Virtual/PrefabFarm.prefab";
  const controlPrefab = "Virtual/Control.prefab";
  const catalog = "World/Farming/Catalog.farming";
  const script = "Other/Owner.ts";
  const scriptText = 'import { Script } from "@galacean/engine"; export default class Owner extends Script {}';
  const scopedId = "prefab-component";
  const makePrefab = (...components: GalaceanSourceComponentSchema[]): string =>
    JSON.stringify({
      asset: { version: "2.0" },
      root: "prefab-root",
      entities: [{ id: "prefab-root", components: components.map(({ id }) => id) }],
      components
    } satisfies GalaceanSourcePrefabFile);
  const companion = { id: "prefab-companion", type: "Script", script: { $ref: script } };
  const farmSource = makePrefab({ id: scopedId, type: "FarmingSystem", props: { catalog: { $ref: catalog } } }, companion);
  const controlSource = makePrefab({ id: scopedId, type: "Script", script: { $ref: script } });
  const addAsset = (path: string, type: string, content: string, dependencies: string[] = []) => {
    saved.project.files.push({ virtualPath: path, path: `runtime:${path}`, type, dependencies });
    saved.contents[path] = content;
  };
  addAsset(catalog, "FarmingResource", "{}");
  addAsset(farmPrefab, "Prefab", farmSource, [catalog, script]);
  addAsset(controlPrefab, "Prefab", controlSource, [script]);
  addAsset(script, "script", scriptText);

  const scene = JSON.parse(saved.contents[scenePath] as string) as GalaceanSourceSceneFile;
  const addInstance = (id: string, path: string, overrides: GalaceanInstanceOverrides) => {
    scene.scene.rootEntities.push(id);
    scene.entities.push({ id, instance: { asset: { $ref: path }, overrides } });
  };
  const propertyOverride = [{ target: scopedId, props: { enabled: false } }];
  addInstance("farm-instance", farmPrefab, {
    componentProps: [
      ...propertyOverride,
      { target: companion.id, props: { owner: { $component: { instance: "farm-instance", target: scopedId } } } }
    ]
  });
  addInstance("farm-with-removal", farmPrefab, { removedComponents: [scopedId] });
  addInstance("control-instance", controlPrefab, { componentProps: propertyOverride });
  const root = scene.entities.find((entity) => entity.id === scene.scene.rootEntities[0])!;
  const makeObserver = (id: string, instance: string, target = scopedId): GalaceanSourceComponentSchema => ({
    id,
    type: "Script",
    script: { $ref: script },
    props: { owner: { $component: { instance, target } } }
  });
  const farmObserver = makeObserver("farm-observer", "farm-instance");
  const companionObserver = makeObserver("companion-observer", "farm-instance", companion.id);
  const otherCompanionObserver = makeObserver("other-companion-observer", "farm-with-removal", companion.id);
  const controlObserver = makeObserver("control-observer", "control-instance");
  (root.components ??= []).push(farmObserver.id, companionObserver.id, otherCompanionObserver.id, controlObserver.id);
  scene.components.push(farmObserver, companionObserver, otherCompanionObserver, controlObserver);
  const originalScene = JSON.stringify(scene);
  saved.contents[scenePath] = originalScene;
  saved.project.files.find(({ virtualPath }) => virtualPath === scenePath)!.dependencies!.push(farmPrefab, controlPrefab, script);
  vi.spyOn(RuntimeProjectSession.prototype, "compileScripts").mockResolvedValue({
    dependencies: { [script]: [] },
    entries: {},
    files: {}
  });
  for (const path of [scenePath, farmPrefab])
    expect(JSON.parse(compileProjectResource(saved, path) as string)).toMatchObject({ version: "2.0" });

  const opened = await openSeedWorldProject(f.url);
  sessions.push(opened);
  const current = opened.projectPackage;
  const viewerUrl = new URL("/world/demos/seed-world/index.html?seed=42&template=original&agentTrace=0#overview", f.url);
  expect(planningFarmingRecoveryUrl(current, viewerUrl)?.href).toBe(`${viewerUrl.origin}${viewerUrl.pathname}${viewerUrl.search}&rebuildFarm=1#overview`);
  expect(viewerUrl.searchParams.has("rebuildFarm")).toBe(false);
  const source = JSON.parse(current.contents[scenePath] as string) as GalaceanSourceSceneFile;
  expect(source.components).toEqual(scene.components.filter(({ id }) => id !== farmObserver.id && id !== companionObserver.id));
  const farmOverrides = source.entities.find(({ id }) => id === "farm-instance")?.instance?.overrides;
  expect(farmOverrides).toEqual({ componentProps: [], removedComponents: [companion.id] });
  expect(source.entities.find(({ id }) => id === "farm-with-removal")?.instance?.overrides?.removedComponents).toEqual([]);
  expect(source.entities.find(({ id }) => id === "control-instance")?.instance?.overrides?.componentProps).toEqual(propertyOverride);
  expect(current.contents[controlPrefab]).toBe(controlSource);
  expect(current.contents[script]).toBe(scriptText);
  expect(JSON.parse(current.contents[farmPrefab] as string).components).toEqual([companion]);
  for (const path of [scenePath, farmPrefab])
    expect(JSON.parse(compileProjectResource(current, path) as string)).toMatchObject({ version: "2.0" });
  await expect(opened.resources()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ virtualPath: scenePath })]));
  await opened.flush();
  expect(f.records.get(project.id)?.contents[scenePath]).toBe(current.contents[scenePath]);
  const archive = JSON.parse(current.documents![`${scenePath}.farming-quarantine.json`]);
  expect(archive[0].originalHierarchies).toMatchObject({ [scenePath]: originalScene, [farmPrefab]: farmSource });
});

it.each(["template", "override", "added component"])("keeps unrelated native nested overrides with the retired asset in the %s", async (location) => {
  const f = storageFixture();
  const original = await openSeedWorldProject(f.url);
  sessions.push(original);
  await original.save();
  original.dispose();
  sessions.pop();
  const saved = f.records.get(original.id)!;
  const scenePath = saved.project.scene;
  const retired = "World/Farming/Nested.farming";
  const inner = "Virtual/InnerFarm.prefab";
  const outer = "Virtual/OuterFarm.prefab";
  const inherited = location !== "added component";
  const addAsset = (virtualPath: string, type: string, content: object, dependencies: string[] = []) => {
    saved.project.files.push({ virtualPath, type, path: `runtime:${virtualPath}`, dependencies });
    saved.contents[virtualPath] = JSON.stringify(content);
  };
  addAsset(retired, "FarmingResource", { legacy: true });
  addAsset(inner, "Prefab", {
    asset: { version: "2.0" }, root: "inner",
    entities: [
      { id: "inner", components: inherited ? ["nested-farm"] : [], children: ["light-child"] },
      { id: "light-child", components: ["unrelated-light"] }
    ],
    components: [
      ...(inherited ? [{ id: "nested-farm", type: "FarmingSystem", props: location === "template" ? { catalog: { $ref: retired } } : {} }] : []),
      { id: "unrelated-light", type: "PointLight", props: { intensity: 1 } }
    ]
  } satisfies GalaceanSourcePrefabFile, location === "template" ? [retired] : []);
  addAsset(outer, "Prefab", {
    asset: { version: "2.0" }, root: "outer",
    entities: [
      { id: "outer", children: ["nested-anchor"] },
      { id: "nested-anchor", instance: { asset: { $ref: inner } } }
    ],
    components: []
  } satisfies GalaceanSourcePrefabFile, [inner]);
  const formats = nativeAssetFormats(() => ({}));
  const draft = new RuntimeProjectEdit(saved, formats);
  const edit = new RuntimeSceneEdit(draft, scenePath);
  const first = edit.create({ name: "Farm override scope", prefab: outer }).id;
  const second = location === "template" ? edit.create({ name: "Light-only scope", prefab: outer }).id : undefined;
  const nestedLight = (sceneEdit: RuntimeSceneEdit, scope: string) =>
    sceneEdit.queryComponents({ type: "PointLight" }).find(({ id }) => id.includes(scope) && id.includes("unrelated-light"))!;
  if (inherited) {
    const farm = edit.queryComponents({ type: "FarmingSystem" }).find(({ id }) => id.includes(first))!;
    edit.updateComponent(farm.id, location === "template" ? { cropGrowthMultiplier: 7 } : { catalog: { $ref: retired } });
  } else {
    edit.addComponent(nestedLight(edit, first).entityId, { type: "FarmingSystem", props: { catalog: { $ref: retired } } });
  }
  edit.updateComponent(nestedLight(edit, first).id, { intensity: 20 });
  if (second) edit.updateComponent(nestedLight(edit, second).id, { intensity: 12 });
  const before = draft.read(scenePath) as string;
  saved.contents[scenePath] = before;
  saved.project.files.find((file) => file.virtualPath === scenePath)!.dependencies!.push(outer, inner);
  if (location !== "template")
    saved.project.files.find((file) => file.virtualPath === scenePath)!.dependencies!.push(retired);
  expect(JSON.parse(before).prefab.nestedOverrides).toHaveLength(second ? 2 : 1);
  expect(JSON.parse(compileProjectResource(saved, scenePath) as string).version).toBe("2.0");

  const opened = await openSeedWorldProject(f.url);
  sessions.push(opened);
  const current = opened.projectPackage;
  expect(JSON.parse(compileProjectResource(current, scenePath) as string).version).toBe("2.0");
  const currentEdit = new RuntimeSceneEdit(new RuntimeProjectEdit(current, formats), scenePath);
  expect(currentEdit.queryComponents({ type: "FarmingSystem" })).toEqual([]);
  expect(currentEdit.readComponent(nestedLight(currentEdit, first).id).props?.intensity).toBe(20);
  if (second) expect(currentEdit.readComponent(nestedLight(currentEdit, second).id).props?.intensity).toBe(12);
  expect(JSON.parse(current.documents![`${scenePath}.farming-quarantine.json`])[0].originalHierarchies[scenePath]).toBe(before);
});

it("closes the session and leaves storage untouched if catalog preparation fails", async () => {
  const f = storageFixture();
  const initial = JSON.parse(
    await readCatalogFile(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl)
  ) as RuntimeProjectManifest;
  f.fetcher.mockResolvedValue(new Response("unavailable", { status: 503 }));
  await expect(openSeedWorldProject(f.url, initial)).rejects.toThrow();
  // One close releases the retired-save cleanup handle, the other the failed session.
  expect(f.close).toHaveBeenCalledTimes(2);
  expect(f.save).not.toHaveBeenCalled();
});

it("deletes saves of other versions before loading contents and restores the current version", async () => {
  const f = storageFixture();
  const projectUrl = new URL(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl, f.url).href;
  const oldId = `seed-world:native-buildings-v7-groups:42:${projectUrl}`;
  const previousId = `seed-world:native-buildings-v10-groups:42:${projectUrl}`;
  const preMergeId = `seed-world:native-buildings-v11-groups:42:${projectUrl}`;
  const otherProjectId = "seed-world:native-buildings-v11-groups:42:https://other.test/project.json";
  const unrelatedId = "another-project";
  const legacy = { incompatibleBuildingSave: true } as unknown as RuntimeProjectPackage;
  for (const id of [oldId, previousId, preMergeId, otherProjectId, unrelatedId]) f.records.set(id, legacy);
  const initial = JSON.parse(
    await readCatalogFile(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl)
  ) as RuntimeProjectManifest;
  const project = await openSeedWorldProject(f.url, initial);
  sessions.push(project);
  expect(SEED_WORLD_BUILDING_SAVE_VERSION).toBe(12);
  expect(project.id).toBe(seedWorldProjectStorageId(42, projectUrl));
  expect(f.load.mock.calls).toEqual([[project.id]]);
  expect(project.id).not.toBe(oldId);
  expect(f.records.has(oldId)).toBe(false);
  expect(f.records.has(previousId)).toBe(false);
  expect(f.records.has(preMergeId)).toBe(false);
  expect(f.records.get(otherProjectId)).toEqual(legacy);
  expect(f.records.get(unrelatedId)).toEqual(legacy);
  await project.update((current) => ({
    ...current,
    documents: { ...current.documents, "building-save.txt": "current building version" }
  }));
  await project.flush();
  project.dispose();
  sessions.pop();
  const restored = await openSeedWorldProject(f.url, initial);
  sessions.push(restored);
  expect(restored.projectPackage.documents?.["building-save.txt"]).toBe("current building version");
  expect(f.load.mock.calls.every(([id]) => id !== oldId && id !== previousId && id !== preMergeId)).toBe(true);
});

it("restores relocated building assets before hierarchy reads without replacing saved authoring", async () => {
  const f = storageFixture();
  const initial = JSON.parse(
    await readCatalogFile(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl)
  ) as RuntimeProjectManifest;
  const project = await openSeedWorldProject(f.url, initial);
  await project.save();
  project.dispose();
  const saved = f.records.get(project.id)!;
  const originalFiles = structuredClone(saved.project.files);
  const toLegacy = (url: string) => url.replace("/packages/building/src/building/", "/packages/building/src/tiny-glade/");
  const kit = saved.project.files.find((file) => file.virtualPath === "Building/Units/building-kit.prefab")!;
  delete saved.contents[kit.virtualPath];
  const roof = "Building/Units/Textures/roof_colors-neutral.ktx2";
  saved.contents[roof] = new Uint8Array([1, 2, 3]);
  saved.documents = { ...saved.documents, "Notes/author.txt": "Keep my scene and building edits" };
  saved.project.files = saved.project.files.map((file) => ({ ...file, path: toLegacy(file.path) }));
  const custom = saved.project.files.find((file) => file.virtualPath === "Building/Units/Textures/brick_colors-neutral.ktx2")!;
  custom.path = "https://assets.example.test/custom-bricks.ktx2";
  const inbound = new Set(saved.project.files.flatMap((file) => file.dependencies ?? []));
  const deleted = saved.project.files.find((file) => file.type === "Prefab" &&
    file.virtualPath.startsWith("Building/") && !inbound.has(file.virtualPath) && file.virtualPath !== kit.virtualPath)!;
  expect(deleted).toBeDefined();
  saved.project.files = saved.project.files.filter((file) => file !== deleted);
  delete saved.contents[deleted.virtualPath];
  const authoredMaterial = saved.project.files.find((file) => file.type === "Material" && file.virtualPath.startsWith("Building/"))!;
  const material = JSON.parse(await readCatalogFile(
    originalFiles.find((file) => file.virtualPath === authoredMaterial.virtualPath)!.path
  ));
  material.name = "My edited building material";
  saved.contents[authoredMaterial.virtualPath] = JSON.stringify(material);
  const retained = structuredClone(saved);
  f.fetcher.mockClear();

  const restored = await openSeedWorldProject(f.url, initial);
  sessions.push(restored);
  expect(f.fetcher.mock.calls.some(([url]) => String(url).includes("/tiny-glade/"))).toBe(false);
  expect(restored.projectPackage.project.files.find((file) => file.virtualPath === kit.virtualPath)?.path).toBe(
    originalFiles.find((file) => file.virtualPath === kit.virtualPath)!.path
  );
  expect(restored.projectPackage.project.files.find((file) => file.virtualPath === roof)?.path).toBe(
    originalFiles.find((file) => file.virtualPath === roof)!.path
  );
  expect(restored.projectPackage.project.files.find((file) => file.virtualPath === custom.virtualPath)?.path).toBe(custom.path);
  expect(restored.projectPackage.project.files.some((file) => file.virtualPath === deleted.virtualPath)).toBe(false);
  expect(restored.projectPackage.contents[roof]).toEqual(retained.contents[roof]);
  expect(restored.projectPackage.contents[authoredMaterial.virtualPath]).toBe(retained.contents[authoredMaterial.virtualPath]);
  expect(restored.projectPackage.documents).toEqual(retained.documents);
  await restored.save();
  const checkpoint = structuredClone(f.records.get(restored.id));
  restored.dispose();
  sessions.pop();
  f.fetcher.mockClear();
  const reopened = await openSeedWorldProject(f.url, initial);
  sessions.push(reopened);
  expect(reopened.projectPackage).toEqual(checkpoint);
  expect(f.fetcher).not.toHaveBeenCalled();
});

it("reopens legacy Water PNG references as KTX2 without overwriting authored textures or materials", async () => {
  const f = storageFixture();
  const initial = JSON.parse(await readCatalogFile(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl)) as RuntimeProjectManifest;
  const project = await openSeedWorldProject(f.url, initial);
  const entries = textureManifest.textures;
  const key = (entry: { id: string }) => `Water/Textures/${entry.id}.png`;
  const selected = [entries.wave, entries.caustics, entries.directional, entries.cloud, entries.lines];
  const waveBytes = new Uint8Array(await readFile(resolve(globalThis.__migrationRepositoryRoot,
    "packages/water/src/water/resources/river/assets", entries.wave.source)));
  const editedBytes = new Uint8Array([9, 8, 7, 6]);
  const materialPath = "Water/Materials/legacy-author.mat";
  const material = JSON.stringify({ name: "My Water edits", shader: "unlit", shaderData: {
    material_BaseTexture: { type: "Texture", value: { url: key(entries.wave) } }
  } });
  await project.update(pack => ({ ...pack,
    project: { ...pack.project, files: [...pack.project.files,
      ...selected.map(entry => ({ virtualPath: key(entry),
        path: entry === entries.cloud ? "https://custom.test/water.png" : new URL(key(entry), BUILTIN_WATER_PROJECT_URL).href,
        type: "Texture", params: { isSRGBColorSpace: entry === entries.lines ? false : entry.isSRGBColorSpace, wrapModeU: 0 } })),
      { virtualPath: materialPath, path: materialPath, type: "Material" }] },
    contents: { ...pack.contents, [key(entries.wave)]: waveBytes,
      [key(entries.directional)]: editedBytes, [materialPath]: material }
  }));
  await project.save();
  project.dispose();
  f.fetcher.mockImplementation(async input => {
    const url = String(input);
    if (!url.endsWith(".ktx2")) throw new Error(`Unexpected migration fetch: ${url}`);
    const entry = Object.values(entries).find(entry => url.endsWith(`/${entry.id}.ktx2`))!;
    const bytes = await readFile(resolve(globalThis.__migrationRepositoryRoot,
      "packages/water/src/water/resources/river/assets", entry.output));
    return new Response(new Uint8Array(bytes));
  });
  f.fetcher.mockClear();
  const restored = await openSeedWorldProject(f.url, initial);
  sessions.push(restored);
  expect(f.fetcher).toHaveBeenCalledTimes(2);
  for (const entry of [entries.wave, entries.caustics]) {
    expect(restored.projectPackage.project.files.find(file => file.virtualPath === key(entry))).toMatchObject({
      type: "KTX2", path: new URL(`Water/Textures/${entry.id}.ktx2`, BUILTIN_WATER_PROJECT_URL).href,
      params: { wrapModeU: 0 }
    });
    const content = restored.projectPackage.contents[key(entry)] as Uint8Array;
    expect([...content.slice(0, 4)]).toEqual([0xab, 0x4b, 0x54, 0x58]);
  }
  for (const entry of [entries.directional, entries.cloud, entries.lines])
    expect(restored.projectPackage.project.files.find(file => file.virtualPath === key(entry))?.type).toBe("Texture");
  expect(restored.projectPackage.contents[key(entries.directional)]).toEqual(editedBytes);
  expect(restored.projectPackage.contents[materialPath]).toBe(material);
  expect(restored.projectPackage.project.files.find(file => file.virtualPath === materialPath)?.dependencies).toEqual([key(entries.wave)]);
  expect(restored.projectPackage.project.files.some(file => file.virtualPath === key(entries.edge))).toBe(false);
  validateProjectDependencies(restored.projectPackage);
  await restored.save();
  const checkpoint = structuredClone(f.records.get(restored.id));
  restored.dispose();
  sessions.pop();
  f.fetcher.mockClear();
  const reopened = await openSeedWorldProject(f.url, initial);
  sessions.push(reopened);
  expect(reopened.projectPackage).toEqual(checkpoint);
  expect(f.fetcher).not.toHaveBeenCalled();
});
