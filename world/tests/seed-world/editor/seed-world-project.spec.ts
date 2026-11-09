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
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import textureManifest from "@galacean/engine-water/water/resources/river/assets/ktx2-manifest.json";

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
  vi.spyOn(RuntimeProjectStorage, "open").mockImplementation(
    async () =>
      ({
        load,
        save,
        close
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
    // Initial graph preparation reads reference-bearing sources, not meshes/textures/shader binaries.
    expect(f.fetcher.mock.calls.every(([url]) => /\.(json|scene|prefab|mat)$/.test(String(url)))).toBe(true);
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

it("closes the session and leaves storage untouched if catalog preparation fails", async () => {
  const f = storageFixture();
  const initial = JSON.parse(
    await readCatalogFile(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl)
  ) as RuntimeProjectManifest;
  f.fetcher.mockResolvedValue(new Response("unavailable", { status: 503 }));
  await expect(openSeedWorldProject(f.url, initial)).rejects.toThrow();
  expect(f.close).toHaveBeenCalledTimes(1);
  expect(f.save).not.toHaveBeenCalled();
});

it("excludes previous building saves before loading contents and restores the current version", async () => {
  const f = storageFixture();
  const projectUrl = new URL(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl, f.url).href;
  const oldId = `seed-world:native-buildings-v6-assemblies:42:${projectUrl}`;
  const legacy = { incompatibleBuildingSave: true } as unknown as RuntimeProjectPackage;
  f.records.set(oldId, legacy);
  const initial = JSON.parse(
    await readCatalogFile(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl)
  ) as RuntimeProjectManifest;
  const project = await openSeedWorldProject(f.url, initial);
  sessions.push(project);
  expect(SEED_WORLD_BUILDING_SAVE_VERSION).toBe(7);
  expect(project.id).toBe(seedWorldProjectStorageId(42, projectUrl));
  expect(f.load.mock.calls).toEqual([[project.id]]);
  expect(project.id).not.toBe(oldId);
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
  expect(f.load.mock.calls.every(([id]) => id !== oldId)).toBe(true);
  expect(f.records.get(oldId)).toEqual(legacy);
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
  const roof = "Building/Units/Textures/roof_colors.tex";
  saved.contents[roof] = new Uint8Array([1, 2, 3]);
  saved.documents = { ...saved.documents, "Notes/author.txt": "Keep my scene and building edits" };
  saved.project.files = saved.project.files.map((file) => ({ ...file, path: toLegacy(file.path) }));
  const custom = saved.project.files.find((file) => file.virtualPath === "Building/Units/Textures/brick_colors.tex")!;
  custom.path = "https://assets.example.test/custom-bricks.tex";
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
