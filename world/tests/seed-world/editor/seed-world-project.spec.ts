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
