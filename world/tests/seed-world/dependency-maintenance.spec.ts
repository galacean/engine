import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import catalog from "@galacean/engine-terrain/data/seed-world/project.json";
import { seedWorldProjectFormats } from "../../demos/seed-world/SeedWorldProjectFormats";
import { RuntimeDependencyMaintenance, validateProjectDependencies } from "@galacean/engine-project/runtime-editor/project/runtime-project-dependencies.ts";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats.ts";
import { RUNTIME_PROJECT_SAVE_VERSION, RuntimeProjectStorage, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session.ts";

vi.hoisted(() => { (globalThis as any).window ??= {}; });
afterEach(() => { vi.restoreAllMocks(); });

function project(): RuntimeProjectPackage {
  return {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: "main.scene", files: [
      { virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: [] },
      { virtualPath: "config.json", path: "config.json", type: "JSON", dependencies: [] },
      { virtualPath: "image.png", path: "image.png", type: "Texture", dependencies: [] }
    ] },
    contents: { "main.scene": "{}", "config.json": "{}" }
  };
}

it("coalesces repeated writes, reuses unchanged extraction, and updates reverse edges", () => {
  const pack = project(), formats = new Map(nativeAssetFormats(() => ({})));
  const references = vi.fn(formats.get("JSON")!.references);
  formats.set("JSON", { ...formats.get("JSON")!, references });
  const maintenance = new RuntimeDependencyMaintenance(pack, formats);
  const edit = new RuntimeProjectEdit(pack, formats, maintenance);
  for (let i = 0; i < 5; i++) edit.update("config.json", JSON.stringify({ i, image: { $ref: "image.png" } }));
  expect(references).not.toHaveBeenCalled();
  expect(edit.references("image.png")).toEqual(["config.json"]);
  expect(edit.references("image.png")).toEqual(["config.json"]);
  edit.finish();
  expect(references).toHaveBeenCalledTimes(1);
  expect(pack.project.files[1].dependencies).toEqual([]);
});

it("does not replace an accepted cold graph with results from a discarded draft", () => {
  const pack = project();
  pack.project.files[1].dependencies = ["image.png"];
  delete pack.contents["config.json"];
  pack.project.files.push({ virtualPath: "use.ts", path: "use.ts", type: "script", dependencies: ["image.png"] });
  const formats = nativeAssetFormats(() => ({ "use.ts": [] }));
  const maintenance = new RuntimeDependencyMaintenance(pack, formats);
  const discarded = new RuntimeProjectEdit(pack, formats, maintenance);
  discarded.provideContents({ "config.json": '{"image":{"$ref":"image.png"}}', "use.ts": "export {}" });
  discarded.update("config.json", "{}");
  discarded.update("use.ts", "export const value=1;");
  discarded.refreshDependencies(true);
  expect(discarded.references("image.png")).toEqual([]);
  const current = new RuntimeProjectEdit(pack, formats, maintenance);
  expect(current.needsScriptAnalysis()).toBe(false);
  expect(current.references("image.png")).toEqual(["config.json", "use.ts"]);
  expect(current.preview().contents["use.ts"]).toBeUndefined();
});

it("ingests the actual Seed World catalog once without downloading binary assets", async () => {
  const save = vi.fn(async () => {});
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({ load: async () => undefined, close() {}, save } as any);
  const root = resolve(globalThis.__migrationRepositoryRoot, "packages/terrain/src/data/seed-world");
  const fetched: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = new URL(String(input));
    fetched.push(url.pathname);
    return new Response(await readFile(url));
  });
  const session = await RuntimeProjectSession.open("catalog", catalog, pathToFileURL(resolve(root, "project.json")).href);
  session.registerAssetFormats(seedWorldProjectFormats);
  try {
    await session.prepareEditableHierarchies(() => true);
    await session.initializeDependencies();
    validateProjectDependencies(session.projectPackage);
    expect(fetched.length).toBeGreaterThan(0);
    const files = session.projectPackage.project.files;
    for (const file of files.filter(file => ["KTX2", "Buffer", "GLTF"].includes(file.type))) {
      expect(session.projectPackage.contents[file.virtualPath]).toBeUndefined();
      expect(file.dependencies).toEqual([]);
    }
    const count = fetched.length;
    await session.initializeDependencies();
    const draft = new RuntimeProjectEdit(session.projectPackage, seedWorldProjectFormats, session.dependencyMaintenance);
    draft.references(files.find(file => file.type === "KTX2")!.virtualPath);
    await session.save();
    expect(fetched).toHaveLength(count);
    expect(save).toHaveBeenCalledTimes(1);
  } finally { session.dispose(); }
});

it("recreates only the old project store on the incompatible IndexedDB upgrade", async () => {
  let exists = true;
  const database = {
    objectStoreNames: { contains: (name: string) => exists && name === "projects" },
    deleteObjectStore: vi.fn(() => { exists = false; }),
    createObjectStore: vi.fn(() => ({createIndex: vi.fn()})), close: vi.fn()
  };
  const factory = { open: vi.fn(() => {
    const request: any = { result: database };
    queueMicrotask(() => { request.onupgradeneeded({oldVersion:1}); request.onsuccess(); });
    return request;
  }) };
  const storage = await RuntimeProjectStorage.open(factory as any);
  expect(factory.open).toHaveBeenCalledWith("galacean-runtime-projects", 4);
  expect(database.deleteObjectStore.mock.calls).toEqual([["projects"]]);
  expect(database.createObjectStore.mock.calls).toEqual([["projects"], ["projectFiles"]]);
  storage.close();
});

it("shares one registered extractor and releases it only after its last owner", async () => {
  const pack = project();
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({ load: async () => pack, close() {}, save: async () => {} } as any);
  const session = await RuntimeProjectSession.open("formats", pack.project, "https://example.test/");
  const format = { validate() {}, references: () => ["image.png"] };
  const first = session.registerAssetFormats(new Map([["JSON", format]]));
  const second = session.registerAssetFormats(new Map([["JSON", format]]));
  try {
    expect(() => session.registerAssetFormats(new Map([["JSON", { ...format }]]))).toThrow("Conflicting asset format");
    first();
    first();
    await session.publishAsset(pack.project.files[1], '{"changed":1}');
    expect(session.projectPackage.project.files[1].dependencies).toEqual(["image.png"]);
    second();
    await session.publishAsset(pack.project.files[1], "{}");
    expect(session.projectPackage.project.files[1].dependencies).toEqual([]);
  } finally { first(); second(); session.dispose(); }
});
