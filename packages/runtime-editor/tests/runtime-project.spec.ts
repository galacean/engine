import { expect, it, vi } from "vitest";
import {
  assertAssetPath,
  cloneRuntimeProjectPackage,
  RUNTIME_PROJECT_SAVE_VERSION,
  RuntimeProjectSnapshot,
  RuntimeProjectStorage,
  runtimeProjectFiles,
  projectDocuments,
  validateRuntimeProject,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { VirtualProjectFiles } from "@galacean/engine-project/project-files/virtual-project-files.ts";

// Project restoration does not execute component scripts or initialize the browser engine.
vi.mock("../src/runtime-editor/scripts/runtime-project-scripts", () => ({
  RuntimeProjectScripts: class { dispose() {} }
}));

function project(): RuntimeProjectPackage {
  return { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "Scene/main.scene", scenes: ["Scene/main.scene", "Scene/other.scene"], files: [
    {  type: "Scene", dependencies: [], virtualPath: "Scene/main.scene", path: "main.scene" },
    {  type: "Scene", dependencies: [], virtualPath: "Scene/other.scene", path: "other.scene" },
    {  type: "Mesh", dependencies: [], virtualPath: "mesh.bin", path: "mesh.bin" }
  ] }, contents: { "Scene/main.scene": "{}", "mesh.bin": new Uint8Array([1, 2]) } };
}

it("maps every Scene and reads current authored content while retaining binary assets", () => {
  const pack = project();
  validateRuntimeProject(pack);
  const files = runtimeProjectFiles(() => pack);
  expect([...files.paths()]).toContain("Scene/other.scene");
  pack.contents["Scene/main.scene"] = '{"entities":[]}';
  expect(files.read("Scene/main.scene")).toBe('{"entities":[]}');
  expect(JSON.parse(files.read("project.json") as string)).toEqual(pack.project);
  expect(files.read("mesh.bin")).toEqual(new Uint8Array([1, 2]));
  expect(() => files.read("Scene/other.scene")).toThrow("not loaded");
});

it("searches current project text and synthesized manifests without changing the package", async () => {
  let pack = project();
  const provider = runtimeProjectFiles(() => pack), files = new VirtualProjectFiles([provider]);
  const before = structuredClone(pack);
  expect(await files.search({ path: "Scene", query: "entities", glob: "*.scene" })).toMatchObject({ complete: false, unavailableFiles: 1, matches: [] });
  expect(pack).toEqual(before);
  pack = { ...pack, contents: { ...pack.contents, "Scene/main.scene": '{"entities":[]}' } };
  expect((await files.search({ path: "Scene/main.scene", query: "entities" })).matches).toMatchObject([{ line: 1, column: 3 }]);
  expect(await files.search({path: "project.json", query: "scene"})).toMatchObject({complete: true, matches: expect.arrayContaining([expect.objectContaining({line: 2})])});
});

it("describes unloaded assets and directories without duplicating or mutating project data", () => {
  const pack = project(), before = structuredClone(pack);
  const files = runtimeProjectFiles(() => pack);
  expect(JSON.parse(files.read("Scene/other.scene.meta") as string).summary).toBe("");
  expect(files.read("Scene.meta")).toBeUndefined();
  expect(files.read("project.json.meta")).toBeUndefined();
  expect(pack).toEqual(before);
  pack.documents = {"Scene/other.scene.meta": '{"summary":"出生场景","usage":"玩家进入时加载"}'};
  expect(JSON.parse(files.read("Scene/other.scene.meta") as string).summary).toBe("出生场景");
  expect([...files.paths()].filter(path => path === "Scene/other.scene.meta")).toHaveLength(1);
});

it("rejects orphan content, missing Scenes and duplicate identities before persistence", () => {
  const orphan = project(); orphan.contents["missing"] = "x";
  expect(() => validateRuntimeProject(orphan)).toThrow("Unregistered");
  const scene = project(); scene.project.scene = "missing";
  expect(() => validateRuntimeProject(scene)).toThrow("Scene");
  const duplicate = project(); duplicate.project.files[1].virtualPath = "Scene/main.scene";
  expect(() => validateRuntimeProject(duplicate)).toThrow("path");
});

function savedStorage(saved: unknown) {
  const record = saved as (RuntimeProjectPackage & { storageRevision?: string }) | undefined;
  const header = record
    ? (() => {
        const { contents, documents, storageRevision: _rev, ...metadata } = record;
        return {
          ...metadata,
          storageFormat: "files" as const,
          contentPaths: Object.keys(contents ?? {}),
          ...(documents === undefined ? {} : { documentPaths: Object.keys(documents) })
        };
      })()
    : undefined;
  const revRecord = record ? { storageRevision: record.storageRevision ?? "saved-revision" } : undefined;
  const database = {
    transaction() {
      let aborted = false;
      const pending: Array<() => void> = [];
      const tx = {
        error: undefined as unknown,
        oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
        abort() {
          aborted = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore(name: string) {
          return {
            get(key: unknown) {
              const request = { result: undefined as unknown, onsuccess: undefined as (() => void) | undefined };
              pending.push(() => {
                if (name === "projects") request.result = header;
                else if (name === "projectRevisions") request.result = revRecord;
                else if (name === "projectFiles" && Array.isArray(key) && record) {
                  const [, kind, path] = key as [string, string, string];
                  request.result = kind === "asset" ? record.contents?.[path] : record.documents?.[path];
                }
                request.onsuccess?.();
              });
              return request;
            }
          };
        }
      };
      queueMicrotask(() => {
        for (let i = 0; i < pending.length; i++) {
          if (aborted) return;
          pending[i]();
        }
        if (!aborted) tx.oncomplete?.();
      });
      return tx;
    },
    close() {}
  };
  return new RuntimeProjectStorage(database as unknown as IDBDatabase);
}

function databaseFactory(initialVersion = 0) {
  const stores = new Set<string>();
  const createdStores: string[] = [];
  const deletedStores: string[] = [];
  const createdIndexes = new Map<string, ReturnType<typeof vi.fn>>();
  const storeFor = (name: string) => {
    let createIndex = createdIndexes.get(name);
    if (!createIndex) {
      createIndex = vi.fn();
      createdIndexes.set(name, createIndex);
    }
    return { createIndex };
  };
  const database = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore(name: string) {
      stores.add(name);
      createdStores.push(name);
      return storeFor(name);
    },
    deleteObjectStore(name: string) {
      stores.delete(name);
      deletedStores.push(name);
    },
    close() {}
  };
  let version = initialVersion;
  const factory = { open: (_name: string, requestedVersion: number) => {
    const request = {
      result: database,
      transaction: { objectStore: (name: string) => storeFor(name) },
      error: undefined as DOMException | undefined,
      onupgradeneeded: undefined as undefined | ((event: {oldVersion: number}) => void),
      onerror: undefined as undefined | (() => void),
      onsuccess: undefined as undefined | (() => void),
    };
    queueMicrotask(() => {
      if (requestedVersion < version) {
        request.error = new DOMException("requested version is less than existing", "VersionError");
        request.onerror?.();
        return;
      }
      if (requestedVersion > version) {
        const oldVersion = version;
        version = requestedVersion;
        request.onupgradeneeded?.({oldVersion});
      }
      request.onsuccess?.();
    });
    return request;
  } };
  return {
    factory: factory as unknown as IDBFactory,
    stores,
    createdStores,
    deletedStores,
    createdIndexes,
    version: () => version
  };
}

it("opens the single-format database schema at version 5 with split projectRevisions", async () => {
  const empty = databaseFactory();
  const storage = await RuntimeProjectStorage.open(empty.factory);
  expect(empty.version()).toBe(5);
  expect([...empty.stores]).toEqual(["projects", "projectRevisions", "projectFiles"]);
  expect(empty.createdStores).toEqual(["projects", "projectRevisions", "projectFiles"]);
  expect(empty.createdIndexes.get("projectRevisions")).toHaveBeenCalledWith(
    "storageRevision",
    "storageRevision",
    { unique: true }
  );
  storage.close();
});

it.each([1, 2, 4])("rebuilds cleanly into single-format version 5 when upgrading from older version %i", async (oldVer) => {
  const existing = databaseFactory(oldVer);
  existing.stores.add("projects");
  if (oldVer >= 4) existing.stores.add("projectFiles");
  const upgraded = await RuntimeProjectStorage.open(existing.factory);
  expect(existing.version()).toBe(5);
  expect(existing.deletedStores).toEqual(oldVer >= 4 ? ["projects", "projectFiles"] : ["projects"]);
  expect(existing.createdStores).toEqual(["projects", "projectRevisions", "projectFiles"]);
  expect(existing.createdIndexes.get("projectRevisions")).toHaveBeenCalledWith(
    "storageRevision",
    "storageRevision",
    { unique: true }
  );
  upgraded.close();
});

it("opens a database already at version 5 without recreating stores", async () => {
  const existing = databaseFactory(5);
  existing.stores.add("projects");
  existing.stores.add("projectRevisions");
  existing.stores.add("projectFiles");
  const storage = await RuntimeProjectStorage.open(existing.factory);
  expect(existing.version()).toBe(5);
  expect(existing.deletedStores).toEqual([]);
  expect(existing.createdStores).toEqual([]);
  storage.close();
});

// Cross-store atomicity, queued writes and stale-page replacement run against native
// IndexedDB in tests/runtime-editor/project-storage-browser.mjs (not a transaction mock).

it.each([0, 1, 2, 5, RUNTIME_PROJECT_SAVE_VERSION + 1, undefined])("rejects unsupported saved versions without discarding the stored project: %s", async version => {
  const saved = { ...project(), version };
  await expect(savedStorage(saved).load("world")).rejects.toThrow("Unsupported saved project version");
  expect(saved.contents["Scene/main.scene"]).toBe("{}");
});

it("retains compatible project content and rejects same-version corruption", async () => {
  const saved = project();
  expect(await savedStorage(saved).load("world")).toEqual(saved);
  saved.project.scene = "missing";
  await expect(savedStorage(saved).load("world")).rejects.toThrow("Scene");
});

it("preserves unsupported saved projects instead of silently opening a fresh project", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const old = { ...project(), version: 1 };
  old.contents["World/Planning.json"] = "old planning";
  const storage = savedStorage(old);
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage);
  let session: Awaited<ReturnType<typeof RuntimeProjectSession.open>> | undefined;
  try {
    const initial = { scene: "Scene/new.scene", files: [
      {  type: "Scene", dependencies: [], virtualPath: "Scene/new.scene", path: "new.scene" }
    ] };
    await expect(RuntimeProjectSession.open("world", initial, "https://example.com/project.json")).rejects.toThrow("Unsupported saved project version");
    expect(old.contents["World/Planning.json"]).toBe("old planning");
  } finally { session?.dispose(); opening.mockRestore(); }
});

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

it("serializes asset patches against the accepted package and rejects a concurrent stale full publication", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const first = deferred(), writes: RuntimeProjectPackage[] = [];
  const storage = { load: async () => project(), close() {}, save: vi.fn(async (_id: string, pack: RuntimeProjectPackage) => {
    if (!writes.length) { writes.push(structuredClone(pack)); await first.promise; }
    else writes.push(structuredClone(pack));
  }) };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("world", project().project, "https://example.com/project.json");
  try {
    const before = session.publicationRevision, stale = structuredClone(session.projectPackage);
    const a = session.publishAsset({  virtualPath: "a.json", path: "a.json", type: "JSON" }, '{"value":1}');
    const b = session.publishAsset({  virtualPath: "b.json", path: "b", type: "JSON" }, '{"value":2}');
    const full = expect(session.publish(stale, before)).rejects.toThrow("Stale");
    await Promise.resolve(); expect(session.projectPackage.contents["a.json"]).toBeUndefined();
    first.resolve(); await Promise.all([a, b, full]);
    expect(session.projectPackage.contents).toMatchObject({ "a.json": '{"value":1}', "b.json": '{"value":2}', "Scene/main.scene": "{}" });
    expect(session.publicationRevision).toBe(2);
    await session.save(); expect(writes.at(-1)!.contents).toEqual(session.projectPackage.contents);
    // An asynchronous editor must retain its original draft revision, not capture at commit.
    await expect(session.publish(stale, before)).rejects.toThrow("Stale");
  } finally { session.dispose(); opening.mockRestore(); }
});

it("failed persistence retains accepted authoring and does not poison queued asset updates", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  let fail = true;
  const storage = { load: async () => project(), close() {}, save: vi.fn(async () => { if (fail) { fail = false; throw Error("disk failed"); } }) };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("world", project().project, "https://example.com/project.json");
  try {
    const accepted = session.publishAsset({  virtualPath: "a.json", path: "a.json", type: "JSON" }, '{"value":"accepted"}');
    const bytes = new Uint8Array([7, 8]);
    const saved = session.publishAsset({  virtualPath: "b.bin", path: "b", type: "Mesh" }, bytes);
    bytes[0] = 99;
    await Promise.all([accepted, saved]);
    await expect(session.flush()).rejects.toThrow("disk");
    expect(session.persistenceStatus).toMatchObject({state:"failed",savedSeq:0,commitSeq:2});
    expect(session.projectPackage.contents["a.json"]).toBe('{"value":"accepted"}');
    await session.flush();
    expect(session.persistenceStatus).toMatchObject({state:"saved",savedSeq:2});
    expect(session.projectPackage.contents["b.bin"]).toEqual(new Uint8Array([7, 8]));
    expect(session.publicationRevision).toBe(2);
    await expect(session.publishAsset({  virtualPath: "b.bin", path: "x", type: "Texture2D" }, bytes)).rejects.toThrow("identity conflicts");
    expect(session.publicationRevision).toBe(2);
  } finally { session.dispose(); opening.mockRestore(); }
});

it("projection asset snapshots reject queued and accepted dependency edits but permit unrelated asset updates", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const gate = deferred();
  const storage = { load: async () => project(), close() {}, save: vi.fn(async () => gate.promise) };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("world", project().project, "https://example.com/project.json");
  try {
    const dependency = session.readAssetSnapshot("a.json");
    const unrelated = session.readAssetSnapshot("Scene/main.scene");
    expect(dependency.isCurrent()).toBe(true);
    const write = session.publishAsset({ virtualPath:"a.json",path:"a.json",type:"JSON" }, '{"value":"new author"}');
    expect(() => dependency.assertCurrent()).toThrow("pending"); // Before the write even starts.
    expect(dependency.isCurrent()).toBe(false);
    expect(unrelated.isCurrent()).toBe(true);
    unrelated.assertCurrent();
    await Promise.resolve();
    expect(session.projectPackage.contents["a.json"]).toBeUndefined();
    expect(() => dependency.assertCurrent()).toThrow("pending");
    gate.resolve(); await write;
    expect(() => dependency.assertCurrent()).toThrow("stale");
    expect(dependency.isCurrent()).toBe(false);
    unrelated.assertCurrent();
    session.readAssetSnapshot("a.json").assertCurrent();
  } finally { gate.resolve(); session.dispose(); opening.mockRestore(); }
});

it("failed author writes release projection dependencies without invalidating their accepted source", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const gate = deferred();
  const storage = { load: async () => project(), close() {}, save: vi.fn(async () => gate.promise) };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("world", project().project, "https://example.com/project.json");
  session.registerProjectValidator(() => { throw Error("invalid author"); });
  try {
    const dependency = session.readAssetSnapshot("mesh.bin");
    const original = new Uint8Array(dependency.content as Uint8Array);
    (dependency.content as Uint8Array)[0] = 99; // Public snapshot cannot mutate the guard's baseline.
    const file = session.projectPackage.project.files.find(f=>f.virtualPath === "mesh.bin")!;
    const write = expect(session.publishAsset(file,new Uint8Array([7,8]))).rejects.toThrow("invalid author");
    expect(() => dependency.assertCurrent()).toThrow("pending");
    await write;
    dependency.assertCurrent();
    expect(dependency.isCurrent()).toBe(true);
    expect(session.projectPackage.contents["mesh.bin"]).toEqual(original);
    const full = structuredClone(session.projectPackage);
    full.project.files.find(f=>f.virtualPath === "mesh.bin")!.path = "replacement.bin";
    const next = session.publish(full);
    await expect(next).rejects.toThrow("invalid author");
    dependency.assertCurrent();
  } finally { gate.resolve(); session.dispose(); opening.mockRestore(); }
});

it("full publications fence dependent projections even before their durable bytes change", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const gate = deferred();
  const storage = { load: async () => project(), close() {}, save: vi.fn(async () => gate.promise) };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("world", project().project, "https://example.com/project.json");
  try {
    const dependency = session.readAssetSnapshot("mesh.bin");
    const full = structuredClone(session.projectPackage);
    full.project.files.find(f=>f.virtualPath === "mesh.bin")!.path = "replacement.bin";
    const write = session.publish(full);
    expect(() => dependency.assertCurrent()).toThrow("pending");
    gate.resolve(); await write;
    expect(() => dependency.assertCurrent()).toThrow("stale");
    session.readAssetSnapshot("mesh.bin").assertCurrent();
  } finally { gate.resolve(); session.dispose(); opening.mockRestore(); }
});


it("preserves runtime-owned farming saves without invalidating unrelated masonry or editor drafts", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const gate = deferred();
  const storage = { load: async () => project(), close() {}, save: vi.fn(async () => { await gate.promise; }) };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("world", project().project, "https://example.com/project.json");
  session.registerAssetFormats(new Map([["Farming", {validate() {}, referenceTypes: [], references: () => []}]]));
  const owner = session.ownRuntimeAsset({  virtualPath: "farm.json", path: "farm.json", type: "Farming" }, "project");
  try {
    const revision = session.publicationRevision, draft = structuredClone(session.projectPackage);
    const masonry = session.readAssetSnapshot("mesh.bin"), farm = session.readAssetSnapshot("farm.json");
    const write = owner.update(() => ({ content: "growing", value: 1 }));
    masonry.assertCurrent();
    expect(() => farm.assertCurrent()).toThrow("pending");
    gate.resolve(); await write;
    expect(session.publicationRevision).toBe(revision);
    masonry.assertCurrent();
    draft.contents["Scene/main.scene"] = "{\"edited\":true}";
    await session.publish(draft, revision);
    expect(session.projectPackage.contents["farm.json"]).toBe("growing");
    expect(session.projectPackage.contents["Scene/main.scene"]).toBe("{\"edited\":true}");
  } finally { gate.resolve(); owner.dispose(); session.dispose(); opening.mockRestore(); }
});


it("rejects old or incomplete saved projects and keeps storage revisions out of exports", async () => {
  const pack = project();
  await expect(savedStorage({...pack, version: 3}).load("world")).rejects.toThrow("Unsupported saved project version");
  const incomplete = structuredClone(pack); delete incomplete.project.files[0].dependencies;
  await expect(savedStorage(incomplete).load("world")).rejects.toThrow("Dependency information unavailable");
  const restored = await savedStorage({...pack, storageRevision: "revision"}).load("world");
  expect(restored).toEqual(pack);
});


it.each(["none", "unrelated", "delete", "replace", "recreate", "cancel", "dispose"] as const)("fences delayed file reads against %s", async mode => {
  const {RuntimeProjectSession} = await import("../src/project/runtime-project-session");
  const initial = project(); delete initial.contents["mesh.bin"];
  const storage = {load:async()=>structuredClone(initial),close(){},save:vi.fn(async(_id:string,pack:RuntimeProjectPackage)=>validateRuntimeProject(pack))};
  const opening = vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const response = deferred();
  const fetching = vi.spyOn(globalThis,"fetch").mockImplementation(async()=>{await response.promise;return new Response(new Uint8Array([4,5]));});
  const session = await RuntimeProjectSession.open("world",initial.project,"https://example.com/project.json");
  const abort = new AbortController();
  try {
    const reading = session.fileProvider().prepare!("mesh.bin",abort.signal).then(()=>null,error=>error);
    if(mode === "unrelated") await session.publishAsset({virtualPath:"other.json",path:"other.json",type:"JSON"},"{}");
    if(mode === "delete" || mode === "recreate") {
      const next = structuredClone(session.projectPackage);
      next.project.files = next.project.files.filter(file=>file.virtualPath!=="mesh.bin");
      await session.publish(next);
      if(mode === "recreate") await session.publish(initial);
    }
    if(mode === "replace") await session.publishAsset(initial.project.files[2],new Uint8Array([9]));
    if(mode === "cancel") abort.abort();
    if(mode === "dispose") session.dispose();
    response.resolve();
    const error = await reading;
    if(mode === "none" || mode === "unrelated") {
      expect(error).toBeNull(); expect(session.projectPackage.contents["mesh.bin"]).toEqual(new Uint8Array([4,5]));
    } else {
      expect(error).toBeInstanceOf(Error);
      expect(session.projectPackage.contents["mesh.bin"]).toEqual(mode === "replace" ? new Uint8Array([9]) : undefined);
    }
    validateRuntimeProject(session.projectPackage);
    if(mode !== "dispose") await session.save();
  } finally {session.dispose();opening.mockRestore();fetching.mockRestore();}
});


it("keeps independent pending reads valid when a publication fails", async()=>{
  const {RuntimeProjectSession}=await import("../src/project/runtime-project-session");
  const initial=project(); delete initial.contents["mesh.bin"];
  const storage={load:async()=>structuredClone(initial),close(){},save:vi.fn(async()=>{throw new Error("disk failed");})};
  const opening=vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const first=deferred(),second=deferred();let reads=0;
  const fetching=vi.spyOn(globalThis,"fetch").mockImplementation(async()=>{await (++reads===1?first:second).promise;return new Response(new Uint8Array([7]));});
  const session=await RuntimeProjectSession.open("world",initial.project,"https://example.com/project.json");
  session.registerProjectValidator(() => {throw Error("invalid author");});
  try {
    const a=session.fileProvider().prepare!("mesh.bin"),b=session.fileProvider().prepare!("mesh.bin");
    const deleted=structuredClone(initial);deleted.project.files=deleted.project.files.filter(f=>f.virtualPath!=="mesh.bin");
    await expect(session.publish(deleted)).rejects.toThrow("invalid author");
    second.resolve();await b;first.resolve();await a;
    expect(session.projectPackage.contents["mesh.bin"]).toEqual(new Uint8Array([7]));
    validateRuntimeProject(session.projectPackage);
  }finally{session.dispose();opening.mockRestore();fetching.mockRestore();}
});


it("releases authoring ownership so an unreferenced asset can be deleted, without a stale disposer releasing a new owner", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const storage = {load:async()=>project(),close(){},save:vi.fn(async()=>{})};
  const opening = vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session=await RuntimeProjectSession.open("owner-retention",project().project,"https://example.com/");
  session.registerAssetFormats(new Map([["Authoring", {validate() {}, referenceTypes: [], references: () => []}]]));
  const file={virtualPath:"author.json",path:"author.json",type:"Authoring"};
  try {
    const old=session.ownRuntimeAsset(file,"owner");
    await old.update(()=>({content:"first",value:undefined}));
    old.dispose();
    const next=session.ownRuntimeAsset(file,"owner");
    old.dispose();
    expect(()=>session.ownRuntimeAsset(file,"owner")).toThrow("already owned");
    const stale=structuredClone(session.projectPackage);
    await next.update(()=>({content:"latest",value:undefined}));
    await session.publish(stale);
    expect(session.projectPackage.contents[file.virtualPath]).toBe("latest");
    const removed=structuredClone(session.projectPackage);
    removed.project.files=removed.project.files.filter(asset=>asset.virtualPath!==file.virtualPath);
    delete removed.contents[file.virtualPath];
    const revision=session.publicationRevision;
    await expect(session.publish(removed, revision, [file.virtualPath])).rejects.toThrow("release its component");
    expect(session.projectPackage.contents[file.virtualPath]).toBe("latest");
    expect(session.publicationRevision).toBe(revision);
    next.dispose();
    await session.publish(removed, revision, [file.virtualPath]);
    expect(session.projectPackage.contents[file.virtualPath]).toBeUndefined();
    expect(session.projectPackage.project.files.some(asset=>asset.virtualPath===file.virtualPath)).toBe(false);
  } finally {session.dispose();opening.mockRestore();}
});


it("uses host encoding declarations for custom remote text and retains binary resources", async () => {
  const {RuntimeProjectSession}=await import("../src/project/runtime-project-session");
  const initial=project();
  initial.project.files.push({virtualPath:"custom.data",path:"https://example.com/custom",type:"CustomAuthoring"});
  const storage={load:async()=>initial,close(){},save:vi.fn(async()=>{})};
  const opening=vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const fetching=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response('{"value":"树"}'));
  const session=await RuntimeProjectSession.open("custom-text",initial.project,"https://example.com/");
  try {
    // A persisted byte representation must be readable too, independently of fetch timing.
    initial.contents["custom.data"]=new TextEncoder().encode('{"value":"树"}');
    const provider=session.fileProvider();
    const release=session.registerTextAssetTypes(["CustomAuthoring"]);
    const releaseSecond=session.registerTextAssetTypes(["CustomAuthoring"]);
    release();release();
    expect(provider.read("custom.data")).toBe('{"value":"树"}');
    expect(await new VirtualProjectFiles([provider]).search({path: "custom.data", query: "树"}))
      .toMatchObject({complete: true, matches: [{line: 1, column: 11}]});
    delete initial.contents["custom.data"];
    await provider.prepare!("custom.data");
    expect(initial.contents["custom.data"]).toBe('{"value":"树"}');
    expect(provider.read("mesh.bin")).toBeInstanceOf(Uint8Array);
    releaseSecond();
  } finally {session.dispose();fetching.mockRestore();opening.mockRestore();}
});


it("runs domain validators before durable writes and releases them with their owner", async () => {
  const {RuntimeProjectSession} = await import("../src/project/runtime-project-session");
  const storage = {load:async()=>project(),close(){},save:vi.fn(async()=>{})};
  const opening = vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("validation",project().project,"https://example.com/");
  try {
    const initial = structuredClone(session.projectPackage), revision = session.publicationRevision;
    const release = session.registerProjectValidator(candidate => {
      if (candidate.contents["Scene/main.scene"] === '{"invalid":true}') throw new Error("Invalid domain author");
    });
    const candidate = structuredClone(initial);candidate.contents["Scene/main.scene"]='{"invalid":true}';
    expect(()=>session.validateCandidate(candidate)).toThrow("Invalid domain author");
    await expect(session.publish(candidate)).rejects.toThrow("Invalid domain author");
    expect(storage.save).not.toHaveBeenCalled();
    expect(session.projectPackage).toEqual(initial);
    expect(session.publicationRevision).toBe(revision);
    const owner = session.ownRuntimeAsset(initial.project.files[0],"owner");
    await expect(owner.update(()=>({content:'{"invalid":true}',value:null}))).rejects.toThrow("Invalid domain author");
    expect(storage.save).not.toHaveBeenCalled();
    owner.dispose();release();release();
    await session.publish(candidate);
    expect(storage.save).not.toHaveBeenCalled();
    await session.flush();
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(session.projectPackage.contents["Scene/main.scene"]).toBe('{"invalid":true}');
  } finally {session.dispose();opening.mockRestore();}
  expect(()=>session.registerProjectValidator(()=>{})).toThrow();
});


it("retains remote text loaded while an unrelated runtime save is awaiting storage", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const saving = deferred(), release = deferred(), response = deferred();
  const storage = {load:async()=>project(),close(){},save:vi.fn(async()=>{saving.resolve();await release.promise;})};
  const opening=vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const fetching=vi.spyOn(globalThis,"fetch").mockImplementation(async()=>({ok:true,text:async()=>{response.resolve();return '{"entities":[]}';}} as Response));
  const session=await RuntimeProjectSession.open("read-during-save",project().project,"https://example.com/");
  session.registerAssetFormats(new Map([["Farming", {validate() {}, referenceTypes: [], references: () => []}]]));
  const owner=session.ownRuntimeAsset({virtualPath:"farm.json",path:"farm.json",type:"Farming"},"project");
  try {
    await owner.update(()=>({content:'{"revision":1}',value:1}));
    const write=session.flush();
    await saving.promise;
    const provider=session.fileProvider();
    const read=provider.prepare!("Scene/other.scene");
    await response.promise;
    // Allow fetch decoding/cache installation to interleave while the durable save is blocked.
    await new Promise(resolve=>setTimeout(resolve,0));
    release.resolve();
    await Promise.all([write,read]);
    expect(provider.read("Scene/other.scene")).toBe('{"entities":[]}');
    expect(session.projectPackage.contents["farm.json"]).toBe('{"revision":1}');
    expect(session.publicationRevision).toBe(0);
  } finally {release.resolve();owner.dispose();session.dispose();opening.mockRestore();fetching.mockRestore();}
});


it("implicit and persisted default sidecars expose the same virtual documents while preserving authored summaries", () => {
  const pack=project();
  const before=projectDocuments(pack),after=structuredClone(pack);
  after.documents={...after.documents,...before};
  expect(projectDocuments(after)).toEqual(before);
  after.documents["mesh.bin.meta"]=JSON.stringify({summary:"Authored mesh usage",usage:"Do not replace"});
  expect(projectDocuments(after)).not.toEqual(before);
  expect(JSON.parse(projectDocuments(after)["mesh.bin.meta"]).summary).toBe("Authored mesh usage");
});

it("awaits async candidate validation before writing and leaves rejected publication unchanged", async () => {
  const {RuntimeProjectSession}=await import("../src/project/runtime-project-session");
  const entered=deferred(),gate=deferred();
  const storage={load:async()=>project(),close(){},save:vi.fn(async()=>{})};
  const opening=vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session=await RuntimeProjectSession.open("async-validation",project().project,"https://example.com/");
  try {
    const before=structuredClone(session.projectPackage),revision=session.publicationRevision;
    const release=session.registerProjectValidator(async()=>{entered.resolve();await gate.promise;throw Error("Cannot install");});
    const candidate=structuredClone(before);candidate.contents["Scene/main.scene"]='{"changed":true}';
    const pending=expect(session.publish(candidate)).rejects.toThrow("Cannot install");
    await entered.promise;
    expect(storage.save).not.toHaveBeenCalled();expect(session.projectPackage).toEqual(before);
    gate.resolve();await pending;
    expect(storage.save).not.toHaveBeenCalled();expect(session.projectPackage).toEqual(before);
    expect(session.publicationRevision).toBe(revision);
    release();await session.publish(candidate);await session.flush();expect(storage.save).toHaveBeenCalledTimes(1);
  } finally {gate.resolve();session.dispose();opening.mockRestore();}
});

it("aborts an asynchronous validation before a following validator or durable write", async () => {
  const {RuntimeProjectSession}=await import("../src/project/runtime-project-session");
  const entered=deferred(),gate=deferred(),later=vi.fn();
  const storage={load:async()=>project(),close(){},save:vi.fn(async()=>{})};
  const opening=vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session=await RuntimeProjectSession.open("cancel-validation",project().project,"https://example.com/");
  try {
    session.registerProjectValidator(async()=>{entered.resolve();await gate.promise;});
    session.registerProjectValidator(later);
    const pending=expect(session.publish(structuredClone(session.projectPackage))).rejects.toThrow();
    await entered.promise;session.dispose();gate.resolve();await pending;
    expect(later).not.toHaveBeenCalled();expect(storage.save).not.toHaveBeenCalled();
  } finally {gate.resolve();session.dispose();opening.mockRestore();}
});

it("coalesces accepted authoring and runtime-owned changes into the next checkpoint", async () => {
  const {RuntimeProjectSession}=await import("../src/project/runtime-project-session");
  let durable=project();
  const storage={load:async()=>structuredClone(durable),close(){},save:vi.fn(async(_id:string,pack:RuntimeProjectPackage)=>{durable=structuredClone(pack);})};
  const opening=vi.spyOn(RuntimeProjectStorage,"open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session=await RuntimeProjectSession.open("author-owner",durable.project,"https://example.com/");
  session.registerAssetFormats(new Map([["Simulation",{validate(){},referenceTypes:[],references:()=>[]}]]));
  const owner=session.ownRuntimeAsset({virtualPath:"simulation.json",path:"simulation.json",type:"Simulation"},"owner");
  try {
    const candidate=structuredClone(session.projectPackage);candidate.contents["mesh.bin"]=new Uint8Array([9,9]);
    await session.publish(candidate);const revision=session.publicationRevision;
    await owner.update(()=>({content:'{"tick":1}',value:1}));
    expect(session.publicationRevision).toBe(revision);
    expect(storage.save).not.toHaveBeenCalled();await session.flush();
    expect(durable.contents["mesh.bin"]).toEqual(new Uint8Array([9,9]));
    expect(durable.contents["simulation.json"]).toBe('{"tick":1}');
    expect(storage.save).toHaveBeenCalledOnce();
  } finally {owner.dispose();session.dispose();opening.mockRestore();}
});

it("captures a full publication before queuing without aliasing mutable author data", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const storage = { load: async () => project(), close() {}, save: vi.fn(async () => {}) };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("world", project().project, "https://example.com/project.json");
  try {
    const candidate = project();
    candidate.project.files[2].params = {nested:{value:1}};
    candidate.documents = {"notes.md":"before"};
    const publishing = session.publish(candidate);
    (candidate.contents["mesh.bin"] as Uint8Array)[0] = 9;
    (candidate.project.files[2].params.nested as {value:number}).value = 9;
    candidate.documents["notes.md"] = "later";
    await publishing;
    expect(session.projectPackage.contents["mesh.bin"]).toEqual(new Uint8Array([1,2]));
    expect(session.projectPackage.project.files[2].params).toEqual({nested:{value:1}});
    expect(session.projectPackage.documents).toEqual({"notes.md":"before"});
  } finally { session.dispose(); opening.mockRestore(); }
});

it("does not coerce invalid asset content into valid binary while cloning", () => {
  const invalid = project();
  invalid.contents["mesh.bin"] = 123 as unknown as Uint8Array;
  expect(() => cloneRuntimeProjectPackage(invalid)).toThrow("Invalid runtime asset content");
});

it("propagates activation cancellation to remote Prefab source loading without caching a late result", async () => {
  const {RuntimeProjectSession} = await import("../src/project/runtime-project-session");
  const pack = project();
  pack.project.files.push({virtualPath: "Remote.prefab", path: "https://example.test/remote.prefab", type: "Prefab"});
  pack.contents["Scene/main.scene"] = JSON.stringify({asset: {version: "2.0"}, refs: [{$ref: "Remote.prefab"}]});
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({load: async () => pack, close() {}, save: async () => {}} as any);
  const entered = Promise.withResolvers<void>();
  let fetchSignal: AbortSignal | undefined;
  const fetching = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
    if (!options?.signal) throw new Error("Missing request signal");
    fetchSignal = options.signal;
    entered.resolve();
    return new Promise<Response>((_resolve, reject) => fetchSignal!.addEventListener("abort", () => reject(fetchSignal!.reason), {once: true}));
  });
  const session = await RuntimeProjectSession.open("cancel-resource", pack.project, "https://example.test/");
  const controller = new AbortController();
  try {
    const loading = session.resources(controller.signal);
    const rejected = expect(loading).rejects.toThrow("cancel resource");
    await entered.promise; controller.abort(new Error("cancel resource")); await rejected;
    expect(fetchSignal?.aborted).toBe(true);
    expect(session.projectPackage.contents["Remote.prefab"]).toBeUndefined();
  } finally { session.dispose(); fetching.mockRestore(); opening.mockRestore(); }
});

it("keeps unedited dependent Materials out of pack.contents on initial resources() and reissues URLs after live dependency edits", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const pack = project();
  pack.project.files.push(
    { virtualPath: "Textures/albedo.png", path: "https://example.test/albedo.png", type: "Texture", dependencies: [] },
    {
      virtualPath: "Materials/wall.mat",
      path: "https://example.test/wall.mat",
      type: "Material",
      dependencies: ["Textures/albedo.png"]
    }
  );
  const materialJson = JSON.stringify({
    name: "Wall",
    shader: "pbr",
    macros: [],
    shaderData: { material_BaseTexture: { type: "Texture", value: { url: "Textures/albedo.png" } } }
  });
  const opening = vi
    .spyOn(RuntimeProjectStorage, "open")
    .mockResolvedValue({ load: async () => pack, close() {}, save: async () => {} } as any);
  const fetching = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input) === "https://example.test/wall.mat") return new Response(materialJson);
    throw new Error(`Unexpected fetch: ${String(input)}`);
  });
  const session = await RuntimeProjectSession.open("cold-resources", pack.project, "https://example.test/");
  try {
    const initialResources = await session.resources();
    expect(fetching).not.toHaveBeenCalled();
    expect(session.projectPackage.contents["Materials/wall.mat"]).toBeUndefined();
    expect(initialResources.find((file) => file.virtualPath === "Materials/wall.mat")?.path).toBe(
      "https://example.test/wall.mat"
    );

    await session.publishAsset(
      pack.project.files.find((file) => file.virtualPath === "Textures/albedo.png")!,
      new Uint8Array([255, 216, 255, 224])
    );
    const updatedResources = await session.resources();
    expect(fetching).toHaveBeenCalledTimes(1);
    expect(updatedResources.find((file) => file.virtualPath === "Materials/wall.mat")?.path).toMatch(/^blob:/);
  } finally {
    session.dispose();
    fetching.mockRestore();
    opening.mockRestore();
  }
});

it("rebases remote URLs with preserved dependencies via rebaseRemoteFiles without populating pack.contents", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  let savedPack = project();
  savedPack.project.files.push(
    { virtualPath: "Textures/albedo.png", path: "https://example.test/v1/albedo.png", type: "Texture", dependencies: [] },
    {
      virtualPath: "Materials/wall.mat",
      path: "https://example.test/v1/wall.mat",
      type: "Material",
      dependencies: ["Textures/albedo.png"]
    }
  );
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
    load: async () => structuredClone(savedPack),
    close() {},
    save: vi.fn(async (_id: string, next: RuntimeProjectPackage) => {
      savedPack = structuredClone(next);
    })
  } as any);
  const fetching = vi.spyOn(globalThis, "fetch");
  const session = await RuntimeProjectSession.open("rebase-remote", savedPack.project, "https://example.test/");
  try {
    await session.rebaseRemoteFiles(
      (current) => ({
        files: current.project.files.map((file) =>
          file.virtualPath === "Materials/wall.mat"
            ? { ...file, path: "https://example.test/v2/wall.mat" }
            : file
        ),
        preservedDependencies: new Map([["Materials/wall.mat", ["Textures/albedo.png"]]])
      }),
      { recordHistory: false }
    );
    expect(fetching).not.toHaveBeenCalled();
    expect(session.projectPackage.contents["Materials/wall.mat"]).toBeUndefined();
    expect(
      session.projectPackage.project.files.find((file) => file.virtualPath === "Materials/wall.mat")
    ).toMatchObject({
      path: "https://example.test/v2/wall.mat",
      dependencies: ["Textures/albedo.png"]
    });
    await expect(session.save()).resolves.toBeUndefined();
    expect(savedPack.contents["Materials/wall.mat"]).toBeUndefined();

    await expect(
      session.rebaseRemoteFiles(
        (current) => ({
          files: current.project.files.map((file) =>
            file.virtualPath === "Materials/wall.mat"
              ? { ...file, path: "https://example.test/v3/wall.mat" }
              : file
          ),
          preservedDependencies: new Map([["Materials/wall.mat", ["Textures/missing.png"]]])
        }),
        { recordHistory: false }
      )
    ).rejects.toThrow("missing asset 'Textures/missing.png'");
  } finally {
    session.dispose();
    fetching.mockRestore();
    opening.mockRestore();
  }
});

it("does not poison RuntimeDependencyMaintenance across failed rebase retries, multi-file corrections, or discarded drafts", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const { RuntimeProjectEdit } = await import("@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts");
  let savedPack = project();
  savedPack.project.files.push(
    { virtualPath: "Textures/albedo.png", path: "https://example.test/v1/albedo.png", type: "Texture", dependencies: [] },
    { virtualPath: "Textures/alt.png", path: "https://example.test/v1/alt.png", type: "Texture", dependencies: [] },
    {
      virtualPath: "Materials/wall.mat",
      path: "https://example.test/v2/wall.mat",
      type: "Material",
      dependencies: ["Textures/albedo.png"]
    }
  );
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
    load: async () => structuredClone(savedPack),
    close() {},
    save: vi.fn(async (_id: string, next: RuntimeProjectPackage) => {
      savedPack = structuredClone(next);
    })
  } as any);
  const fetching = vi.spyOn(globalThis, "fetch");
  const session = await RuntimeProjectSession.open("rebase-poison-guard", savedPack.project, "https://example.test/");
  try {
    // Discarded draft deletes wall.mat + failed rebase on v3 must not evict v2 or break save()/retry
    const discardedDraft = new RuntimeProjectEdit(
      session.projectPackage,
      session.referenceFormats,
      session.dependencyMaintenance
    );
    discardedDraft.delete("Materials/wall.mat");
    discardedDraft.refreshDependencies();

    // Path A: failed v2 -> v3 rebase must not block subsequent save() or valid v2 -> v3 retry
    await expect(
      session.rebaseRemoteFiles(
        (current) => ({
          files: current.project.files.map((file) =>
            file.virtualPath === "Materials/wall.mat"
              ? { ...file, path: "https://example.test/v3/wall.mat" }
              : file
          ),
          preservedDependencies: new Map([["Materials/wall.mat", ["Textures/missing.png"]]])
        }),
        { recordHistory: false }
      )
    ).rejects.toThrow("missing asset 'Textures/missing.png'");

    await expect(session.save()).resolves.toBeUndefined();
    expect(
      session.projectPackage.project.files.find((file) => file.virtualPath === "Materials/wall.mat")?.dependencies
    ).toEqual(["Textures/albedo.png"]);

    await expect(
      session.rebaseRemoteFiles(
        (current) => ({
          files: current.project.files.map((file) =>
            file.virtualPath === "Materials/wall.mat"
              ? { ...file, path: "https://example.test/v3/wall.mat" }
              : file
          ),
          preservedDependencies: new Map([["Materials/wall.mat", ["Textures/albedo.png"]]])
        }),
        { recordHistory: false }
      )
    ).resolves.toBeUndefined();

    // Path B: failed batch for v4 with stale edge must not overwrite corrected edge on retry
    await expect(
      session.rebaseRemoteFiles(
        (current) => ({
          files: [
            ...current.project.files.map((file) =>
              file.virtualPath === "Materials/wall.mat"
                ? { ...file, path: "https://example.test/v4/wall.mat" }
                : file
            ),
            { virtualPath: "Materials/broken.mat", path: "https://example.test/v4/broken.mat", type: "Material" }
          ],
          preservedDependencies: new Map([
            ["Materials/wall.mat", ["Textures/albedo.png"]],
            ["Materials/broken.mat", ["Textures/missing.png"]]
          ])
        }),
        { recordHistory: false }
      )
    ).rejects.toThrow("missing asset 'Textures/missing.png'");

    await session.rebaseRemoteFiles(
      (current) => ({
        files: current.project.files.map((file) =>
          file.virtualPath === "Materials/wall.mat"
            ? { ...file, path: "https://example.test/v4/wall.mat" }
            : file
        ),
        preservedDependencies: new Map([["Materials/wall.mat", ["Textures/alt.png"]]])
      }),
      { recordHistory: false }
    );
    expect(
      session.projectPackage.project.files.find((file) => file.virtualPath === "Materials/wall.mat")
    ).toMatchObject({
      path: "https://example.test/v4/wall.mat",
      dependencies: ["Textures/alt.png"]
    });
    await expect(session.save()).resolves.toBeUndefined();
    expect(fetching).not.toHaveBeenCalled();
  } finally {
    session.dispose();
    fetching.mockRestore();
    opening.mockRestore();
  }
});

it("runs validators and persists runtime-owned content updates", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  let savedPack: RuntimeProjectPackage | undefined;
  const initial = project();
  initial.project.files.push({ type: "Farming", dependencies: [], virtualPath: "farm.json", path: "farm.json" });
  initial.contents["farm.json"] = '{"revision":0}';
  const storage = {
    load: async () => initial,
    close() {},
    save: vi.fn(async (_id: string, pack: RuntimeProjectPackage) => {
      savedPack = structuredClone(pack);
    })
  };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("runtime-fast-path", initial.project, "https://example.com/");
  session.registerAssetFormats(new Map([["Farming", { validate() {}, referenceTypes: [], references: () => [] }]]));
  await session.initializeDependencies();
  const validator = vi.fn((candidate: RuntimeProjectPackage) => {
    if (candidate.contents["farm.json"] === '{"invalid":true}') throw new Error("Invalid farm state");
  });
  const releaseValidator = session.registerProjectValidator(validator);
  const owner = session.ownRuntimeAsset({ virtualPath: "farm.json", path: "farm.json", type: "Farming" }, "owner");
  try {
    await owner.update(() => ({ content: '{"revision":1}', value: 1 }));
    await expect(owner.update(() => ({ content: '{"invalid":true}', value: 2 }))).rejects.toThrow("Invalid farm state");
    expect(session.projectPackage.contents["farm.json"]).toBe('{"revision":1}');
    await owner.update(() => ({ content: '{"revision":2}', value: 3 }));
    expect(validator).toHaveBeenCalledTimes(3);
    await session.flush();
    expect(savedPack?.contents["farm.json"]).toBe('{"revision":2}');
    // Fallback to full validation path when files change via publish
    const edited = structuredClone(session.projectPackage);
    edited.project.directories = ["notes"];
    await session.publish(edited);
    await owner.update(() => ({ content: '{"revision":3}', value: 4 }));
    await session.flush();
    expect(savedPack?.contents["farm.json"]).toBe('{"revision":3}');
    expect(savedPack?.project.directories).toEqual(["notes"]);
  } finally {
    releaseValidator();
    owner.dispose();
    session.dispose();
    opening.mockRestore();
  }
});

it("checks dependencies again when the format changes during a fast-path validator", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const initial = project();
  const path = "farm.json";
  const file = { type: "Farming", dependencies: [], virtualPath: path, path };
  initial.project.files.push(file);
  initial.contents[path] = "{}";
  const storage = { load: async () => initial, close() {}, save: vi.fn(async () => {}) };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("fast-validation-format-change", initial.project, "https://example.com/");
  const unregister = session.registerAssetFormats(new Map([[file.type, { references: () => [], referenceTypes: [] }]]));
  await session.initializeDependencies();
  const entered = deferred();
  const gate = deferred();
  session.registerProjectValidator(async () => {
    entered.resolve();
    await gate.promise;
  });
  const owner = session.ownRuntimeAsset(file, "owner");
  try {
    const pending = owner.update(() => ({ content: '{"revision":1}', value: undefined }));
    await entered.promise;
    unregister();
    session.registerAssetFormats(new Map([[file.type, { references: () => ["mesh.bin"], referenceTypes: ["Mesh"] }]]));
    expect(session.projectPackage.contents[path]).toBe("{}");
    gate.resolve();
    await pending;
    expect(session.projectPackage.contents[path]).toBe('{"revision":1}');
    expect(session.projectPackage.project.files.find((entry) => entry.virtualPath === path)?.dependencies).toEqual([
      "mesh.bin"
    ]);
  } finally {
    gate.resolve();
    owner.dispose();
    session.dispose();
    opening.mockRestore();
  }
});

it("keeps manifest validation intact on identical format re-registration and fast-commits unchanged-deps JSON assets", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const { projectHistoryPatch, projectHistoryPatches } = await import("../src/project/runtime-project-history");
  const formats = new Map([
    [
      "JSON",
      {
        references: (content: string | Uint8Array) => {
          const parsed = JSON.parse(typeof content === "string" ? content : new TextDecoder().decode(content));
          return typeof parsed?.ref === "string" ? [parsed.ref] : [];
        }
      }
    ]
  ]);
  const initial = project();
  initial.project.files.push(
    { type: "JSON", dependencies: [], virtualPath: "Animals/1.json", path: "runtime:animals", params: { seed: 1 } },
    { type: "JSON", dependencies: [], virtualPath: "target.json", path: "target.json" }
  );
  initial.contents["Animals/1.json"] = '{"count":0}';
  initial.contents["target.json"] = "{}";
  const storage = {
    load: async () => initial,
    close() {},
    save: vi.fn(async () => {})
  };
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("json-fast-path", initial.project, "https://example.com/");
  const unregisterA = session.registerAssetFormats(formats);
  await session.initializeDependencies();
  const unregisterB = session.registerAssetFormats(formats);
  const owner = session.ownRuntimeAsset({ virtualPath: "Animals/1.json", path: "runtime:animals", type: "JSON" }, "project");
  const commitPackageSpy = vi.spyOn(session as unknown as { commitPackage: (...args: unknown[]) => Promise<unknown> }, "commitPackage");
  try {
    // Re-registering identical formats must not drop validated manifest state or force commitPackage fallback.
    await owner.update(() => ({ content: '{"count":1}', value: undefined }));
    expect(commitPackageSpy).not.toHaveBeenCalled();
    expect(session.projectPackage.contents["Animals/1.json"]).toBe('{"count":1}');

    // Adding a $ref changes dependencies and must fall back cleanly to commitPackage.
    await owner.update(() => ({ content: '{"count":2,"ref":"target.json"}', value: undefined }));
    expect(commitPackageSpy).toHaveBeenCalledTimes(1);
    expect(session.projectPackage.project.files.find((f) => f.virtualPath === "Animals/1.json")?.dependencies).toEqual([
      "target.json"
    ]);

    // Keeping the updated dependencies unchanged on the next write must re-enter fast commit.
    await owner.update(() => ({ content: '{"count":3,"ref":"target.json"}', value: undefined }));
    expect(commitPackageSpy).toHaveBeenCalledTimes(1);
    await session.flush();
    expect(storage.save).toHaveBeenCalledTimes(1);

    // Verify projectHistoryPatches matches two separate projectHistoryPatch calls across files/params/directories/documents.
    const prev = structuredClone(session.projectPackage);
    prev.documents = { "Main.scene.meta": '{"summary":"old"}' };
    const next = structuredClone(prev);
    next.project.directories = ["extra"];
    next.project.files[1].params = { seed: 2 };
    next.contents["target.json"] = '{"v":2}';
    next.documents = { "Main.scene.meta": '{"summary":"new"}' };
    const symmetric = projectHistoryPatches(prev, next);
    expect(symmetric.before).toEqual(projectHistoryPatch(next, prev));
    expect(symmetric.after).toEqual(projectHistoryPatch(prev, next));
  } finally {
    commitPackageSpy.mockRestore();
    owner.dispose();
    unregisterB();
    unregisterA();
    session.dispose();
    opening.mockRestore();
  }
});

it("always runs full RuntimeProjectStorage.save validation even after session initialization", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const initial = project();
  initial.project.files.push({ type: "Farming", dependencies: [], virtualPath: "farm.json", path: "farm.json" });
  initial.contents["farm.json"] = '{"revision":0}';
  const tx = {
    objectStore: () => ({
      index: () => ({ getKey: () => ({ onsuccess: undefined as (() => void) | undefined, result: undefined }) }),
      getKey: () => ({ onsuccess: undefined as (() => void) | undefined, result: undefined }),
      put() {},
      delete() {}
    }),
    oncomplete: undefined as (() => void) | undefined,
    onabort: undefined as (() => void) | undefined
  };
  const realStorage = new RuntimeProjectStorage({
    transaction: () => tx,
    close() {}
  } as unknown as IDBDatabase);
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
    load: async () => initial,
    close() {},
    save: (id: string, pack: RuntimeProjectPackage) => realStorage.save(id, pack)
  } as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("option-1a-save", initial.project, "https://example.com/");
  session.registerAssetFormats(new Map([["Farming", { validate() {}, referenceTypes: [], references: () => [] }]]));
  await session.initializeDependencies();
  try {
    // Mutate manifest in-place after validation: Option 1A must still reject it on save().
    session.projectPackage.project.scene = "Scene/missing.scene";
    await expect(realStorage.save(session.id, session.projectPackage)).rejects.toThrow(
      "Unregistered runtime Scene 'Scene/missing.scene'"
    );
  } finally {
    realStorage.close();
    session.dispose();
    opening.mockRestore();
  }
});

it("flushes async hidden-tab commits immediately via attachProjectSaveLifecycle without looping on failure", async () => {
  vi.useFakeTimers();
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const { attachProjectSaveLifecycle } = await import("../src/project/project-save-control");
  const initial = project();
  initial.project.files.push({ type: "Farming", dependencies: [], virtualPath: "farm.json", path: "farm.json" });
  initial.contents["farm.json"] = '{"revision":0}';
  let failNext = false;
  const saveMock = vi.fn(async () => {
    if (failNext) throw new Error("Simulated IDB failure");
  });
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
    load: async () => initial,
    close() {},
    save: saveMock
  } as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open("hidden-flush-race", initial.project, "https://example.com/");
  session.registerAssetFormats(new Map([["Farming", { validate() {}, referenceTypes: [], references: () => [] }]]));
  await session.initializeDependencies();
  const owner = session.ownRuntimeAsset({ virtualPath: "farm.json", path: "farm.json", type: "Farming" }, "owner");
  const fakeWindow = new EventTarget() as unknown as Window;
  const fakeDoc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState }) as unknown as Document;
  const abort = new AbortController();
  const unsubscribe = attachProjectSaveLifecycle(session, fakeWindow, fakeDoc, () => {}, abort.signal);
  try {
    // Switch tab hidden: visibilitychange fires BEFORE FarmingService finishes async checkpoint update.
    (fakeDoc as unknown as { visibilityState: DocumentVisibilityState }).visibilityState = "hidden";
    fakeDoc.dispatchEvent(new Event("visibilitychange"));
    expect(saveMock).not.toHaveBeenCalled();

    // Async commit completes while hidden: must flush before the 250ms debounce timer elapses.
    await owner.update(() => ({ content: '{"revision":1}', value: 1 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(session.persistenceStatus.state).toBe("saved");

    // Failed hidden save must stay failed without loop-retrying.
    failNext = true;
    await owner.update(() => ({ content: '{"revision":2}', value: 2 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(session.persistenceStatus.state).toBe("failed");
    await vi.advanceTimersByTimeAsync(500);
    expect(saveMock).toHaveBeenCalledTimes(2);
  } finally {
    abort.abort();
    unsubscribe();
    owner.dispose();
    session.dispose();
    opening.mockRestore();
    vi.useRealTimers();
  }
});

it("tears down DOM listeners and persistence subscription symmetrically via signal, dispose(), or pre-aborted signal", async () => {
  const { attachProjectSaveLifecycle } = await import("../src/project/project-save-control");
  const listeners = new Set<() => void>();
  const status = { commitSeq: 2, savedSeq: 1, state: "pending" as const, error: undefined };
  const flushMock = vi.fn(async () => {});
  const subscribeMock = vi.fn((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });
  const projectLike = {
    get persistenceStatus() {
      return status;
    },
    subscribePersistence: subscribeMock,
    flush: flushMock
  };

  // 1. Aborting external signal without calling dispose() unsubscribes subscribePersistence and detaches DOM listeners.
  const win1 = new EventTarget() as unknown as Window;
  const doc1 = Object.assign(new EventTarget(), { visibilityState: "hidden" as DocumentVisibilityState }) as unknown as Document;
  const onChange1 = vi.fn();
  const abort1 = new AbortController();
  attachProjectSaveLifecycle(projectLike, win1, doc1, onChange1, abort1.signal);
  expect(listeners.size).toBe(1);

  abort1.abort();
  expect(listeners.size).toBe(0);
  for (const listener of listeners) listener();
  doc1.dispatchEvent(new Event("visibilitychange"));
  const unloadEvent1 = new Event("beforeunload", { cancelable: true });
  win1.dispatchEvent(unloadEvent1);
  expect(onChange1).not.toHaveBeenCalled();
  expect(flushMock).not.toHaveBeenCalled();
  expect(unloadEvent1.defaultPrevented).toBe(false);

  // 2. Omitting signal and calling returned dispose() detaches DOM listeners and unsubscribes persistence.
  const win2 = new EventTarget() as unknown as Window;
  const doc2 = Object.assign(new EventTarget(), { visibilityState: "hidden" as DocumentVisibilityState }) as unknown as Document;
  const onChange2 = vi.fn();
  const dispose2 = attachProjectSaveLifecycle(projectLike, win2, doc2, onChange2);
  expect(listeners.size).toBe(1);

  // Confirm active before dispose: visibilitychange triggers flush and beforeunload prevents unload.
  doc2.dispatchEvent(new Event("visibilitychange"));
  expect(flushMock).toHaveBeenCalledTimes(1);
  const unloadActive = new Event("beforeunload", { cancelable: true });
  win2.dispatchEvent(unloadActive);
  expect(unloadActive.defaultPrevented).toBe(true);

  dispose2();
  expect(listeners.size).toBe(0);
  doc2.dispatchEvent(new Event("visibilitychange"));
  expect(flushMock).toHaveBeenCalledTimes(1);
  const unloadAfterDispose = new Event("beforeunload", { cancelable: true });
  win2.dispatchEvent(unloadAfterDispose);
  expect(unloadAfterDispose.defaultPrevented).toBe(false);

  // 3. Pre-aborted signal registers zero DOM listeners and zero persistence subscriptions.
  const preAborted = new AbortController();
  preAborted.abort();
  const winAdd = vi.fn();
  const docAdd = vi.fn();
  subscribeMock.mockClear();
  const dispose3 = attachProjectSaveLifecycle(
    projectLike,
    { addEventListener: winAdd } as unknown as Window,
    { addEventListener: docAdd, visibilityState: "visible" } as unknown as Document,
    () => {},
    preAborted.signal
  );
  expect(winAdd).not.toHaveBeenCalled();
  expect(docAdd).not.toHaveBeenCalled();
  expect(subscribeMock).not.toHaveBeenCalled();
  expect(() => dispose3()).not.toThrow();
});

function createInMemoryProjectStorage() {
  const hadIDBKeyRange = "IDBKeyRange" in globalThis;
  const previousIDBKeyRange = (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange;
  if (!hadIDBKeyRange) {
    (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = {
      bound: (lower: unknown, upper: unknown) => ({ lower, upper })
    };
  }
  const projects = new Map<string, Record<string, unknown>>();
  const projectRevisions = new Map<string, { storageRevision: string }>();
  const projectFiles = new Map<string, string | Uint8Array>();
  const stats = { projectsPutCount: 0, revisionsPutCount: 0, filesPutCount: 0, filesRangeDeleteCount: 0 };
  const fileKey = (key: [string, string, string]) => `${key[0]}\0${key[1]}\0${key[2]}`;
  const database = {
    transaction() {
      let aborted = false;
      const pending: Array<() => void> = [];
      const tx = {
        error: undefined as unknown,
        oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
        abort() {
          aborted = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore(name: string) {
          if (name === "projects") {
            return {
              get(id: string) {
                const req = { result: undefined as unknown, onsuccess: undefined as (() => void) | undefined };
                pending.push(() => {
                  req.result = structuredClone(projects.get(id));
                  req.onsuccess?.();
                });
                return req;
              },
              getAllKeys() {
                const req = { result: undefined as unknown, onsuccess: undefined as (() => void) | undefined };
                pending.push(() => {
                  req.result = [...projects.keys()];
                  req.onsuccess?.();
                });
                return req;
              },
              put(header: Record<string, unknown>, id: string) {
                stats.projectsPutCount++;
                projects.set(id, structuredClone(header));
              },
              delete(id: string) {
                projects.delete(id);
              }
            };
          }
          if (name === "projectRevisions") {
            return {
              get(id: string) {
                const req = { result: undefined as unknown, onsuccess: undefined as (() => void) | undefined };
                pending.push(() => {
                  req.result = structuredClone(projectRevisions.get(id));
                  req.onsuccess?.();
                });
                return req;
              },
              getKey(id: string) {
                const req = { result: undefined as unknown, onsuccess: undefined as (() => void) | undefined };
                pending.push(() => {
                  req.result = projectRevisions.has(id) ? id : undefined;
                  req.onsuccess?.();
                });
                return req;
              },
              index(_idx: string) {
                return {
                  getKey(revision: string) {
                    const req = { result: undefined as unknown, onsuccess: undefined as (() => void) | undefined };
                    pending.push(() => {
                      for (const [id, entry] of projectRevisions) {
                        if (entry.storageRevision === revision) {
                          req.result = id;
                          break;
                        }
                      }
                      req.onsuccess?.();
                    });
                    return req;
                  }
                };
              },
              put(entry: { storageRevision: string }, id: string) {
                stats.revisionsPutCount++;
                projectRevisions.set(id, structuredClone(entry));
              },
              delete(id: string) {
                projectRevisions.delete(id);
              }
            };
          }
          return {
            get(key: [string, string, string]) {
              const req = { result: undefined as unknown, onsuccess: undefined as (() => void) | undefined };
              pending.push(() => {
                const found = projectFiles.get(fileKey(key));
                req.result = found instanceof Uint8Array ? new Uint8Array(found) : found;
                req.onsuccess?.();
              });
              return req;
            },
            put(content: string | Uint8Array, key: [string, string, string]) {
              stats.filesPutCount++;
              projectFiles.set(fileKey(key), content instanceof Uint8Array ? new Uint8Array(content) : content);
            },
            delete(target: [string, string, string] | { lower?: [string] }) {
              if (Array.isArray(target)) {
                projectFiles.delete(fileKey(target));
              } else if (Array.isArray(target?.lower)) {
                stats.filesRangeDeleteCount++;
                const prefix = `${target.lower[0]}\0`;
                for (const key of [...projectFiles.keys()]) {
                  if (key.startsWith(prefix)) projectFiles.delete(key);
                }
              }
            }
          };
        }
      };
      queueMicrotask(() => {
        for (let i = 0; i < pending.length; i++) {
          if (aborted) return;
          pending[i]();
        }
        if (!aborted) tx.oncomplete?.();
      });
      return tx;
    },
    close() {
      if (!hadIDBKeyRange) delete (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange;
      else (globalThis as { IDBKeyRange?: unknown }).IDBKeyRange = previousIDBKeyRange;
    }
  };
  return {
    projects,
    projectRevisions,
    projectFiles,
    stats,
    storage: new RuntimeProjectStorage(database as unknown as IDBDatabase)
  };
}

it.each(["runtime", "authored"])("keeps validator mutations out of %s publications and storage", async (kind) => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const { storage } = createInMemoryProjectStorage();
  const initial = project();
  const farmPath = "farm.json";
  const farmFile = { type: "Farming", dependencies: [], virtualPath: farmPath, path: farmPath };
  initial.project.files.push(farmFile);
  initial.contents[farmPath] = '{"revision":0}';
  initial.documents = { "notes.md": "before" };
  const id = "runtime-owned-validator";
  await storage.save(id, initial);
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage);
  const session = await RuntimeProjectSession.open(id, initial.project, "https://example.com/");
  session.registerAssetFormats(new Map([["Farming", { validate() {}, referenceTypes: [], references: () => [] }]]));
  await session.initializeDependencies();
  const owner = session.ownRuntimeAsset(farmFile, "owner");
  let checked: RuntimeProjectPackage | undefined;
  let reject = true;
  const validate = vi.fn(async (candidate: RuntimeProjectPackage) => {
    checked = candidate;
    await Promise.resolve();
    candidate.project.files[0].path = "updated.scene";
    candidate.documents!["notes.md"] = "after";
    (candidate.contents["mesh.bin"] as Uint8Array)[0] = 9;
    candidate.contents[farmPath] = '{"revision":2}';
    if (reject) throw Error("Rejected farm update");
  });
  const unregister = session.registerProjectValidator(validate);
  try {
    const update = () =>
      kind === "runtime"
        ? owner.update(() => ({ content: '{"revision":1}', value: undefined }))
        : session.publish({ ...session.projectPackage, documents: { "notes.md": "authored" } });
    const before = structuredClone(session.projectPackage);
    const commitSeq = session.persistenceStatus.commitSeq;

    await expect(update()).rejects.toThrow("Rejected farm update");
    expect(session.projectPackage).toEqual(before);
    expect(session.persistenceStatus.commitSeq).toBe(commitSeq);
    expect(await storage.load(id)).toEqual(before);

    reject = false;
    await update();
    expect(validate).toHaveBeenCalledTimes(2);
    expect(session.projectPackage.project.files[0].path).toBe("main.scene");
    expect(session.projectPackage.documents!["notes.md"]).toBe(kind === "authored" ? "authored" : "before");
    expect(session.projectPackage.contents["mesh.bin"]).toEqual(new Uint8Array([1, 2]));
    expect(session.projectPackage.contents[farmPath]).toBe(kind === "runtime" ? '{"revision":1}' : '{"revision":0}');
    expect(session.persistenceStatus.commitSeq).toBe(commitSeq + 1);

    // A validator retaining the candidate cannot mutate the accepted project later.
    checked!.project.files[0].path = "retained.scene";
    (checked!.contents["mesh.bin"] as Uint8Array)[0] = 7;
    expect(session.projectPackage.project.files[0].path).toBe("main.scene");
    expect(session.projectPackage.contents["mesh.bin"]).toEqual(new Uint8Array([1, 2]));
    await session.flush();
    expect(await storage.load(id)).toEqual(session.projectPackage);
  } finally {
    unregister();
    owner.dispose();
    session.dispose();
    opening.mockRestore();
  }
});

it("Option 1B: persists via private saveSnapshot without exposing fastPath to in-place projectPackage mutations", async () => {
  const { RuntimeProjectSession } = await import("../src/project/runtime-project-session");
  const { projects, projectRevisions, projectFiles, stats, storage } = createInMemoryProjectStorage();
  const initial = project();
  initial.project.files.push({ type: "Farming", dependencies: [], virtualPath: "farm.json", path: "farm.json" });
  initial.contents["farm.json"] = '{"revision":0}';

  const saveSpy = vi.spyOn(storage, "save");
  const saveSnapshotSpy = vi.spyOn(storage, "saveSnapshot");
  const opening = vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue(storage);

  const session = await RuntimeProjectSession.open("option-1b-idb", initial.project, "https://example.com/");
  session.registerAssetFormats(new Map([["Farming", { validate() {}, referenceTypes: [], references: () => [] }]]));
  await session.initializeDependencies();
  const owner = session.ownRuntimeAsset({ virtualPath: "farm.json", path: "farm.json", type: "Farming" }, "owner");
  const validate = vi.fn((candidate: Readonly<RuntimeProjectPackage>) => {
    expect(candidate.contents["farm.json"]).toMatch(/^\{"revision":\d+\}$/);
  });
  const unregister = session.registerProjectValidator(validate);
  try {
    // 1. First steady-state save writes header + revision + initial baseline files via saveSnapshot.
    await owner.update(() => ({ content: '{"revision":1}', value: 1 }));
    await session.flush();
    expect(saveSnapshotSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(stats.projectsPutCount).toBe(1);
    expect(stats.revisionsPutCount).toBe(1);
    expect(stats.filesRangeDeleteCount).toBe(1);
    const initialFilesPutCount = stats.filesPutCount;
    expect(initialFilesPutCount).toBe(1);
    const firstRev = projectRevisions.get("option-1b-idb")?.storageRevision;
    expect(firstRev).toBeTruthy();
    expect(projectFiles.get("option-1b-idb\0asset\0farm.json")).toBe('{"revision":1}');

    const manifest = session.projectPackage.project;
    await owner.update(() => ({ content: '{"revision":2}', value: 2 }));
    await session.flush();
    expect(session.projectPackage.project).toBe(manifest);
    expect(stats.projectsPutCount).toBe(1);

    // 2. External in-place corruption of public projectPackage must NOT poison saveSnapshot or slip into IDB.
    // Steady-state content update also skips rewriting the projects header and only puts the changed asset.
    session.projectPackage.project.scene = "Scene/missing.scene";
    session.projectPackage.contents["farm.json"] = '{"revision":999,"tampered":true}';

    await owner.update(() => ({ content: '{"revision":3}', value: 3 }));
    await session.flush();
    expect(validate).toHaveBeenCalledTimes(3);
    expect(saveSnapshotSpy).toHaveBeenCalledTimes(3);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(stats.projectsPutCount).toBe(1);
    expect(stats.revisionsPutCount).toBe(3);
    expect(stats.filesRangeDeleteCount).toBe(1);
    expect(stats.filesPutCount).toBe(initialFilesPutCount + 2);
    expect(projectRevisions.get("option-1b-idb")?.storageRevision).not.toBe(firstRev);
    expect((projects.get("option-1b-idb")?.project as { scene: string }).scene).toBe("Scene/main.scene");
    expect(projectFiles.get("option-1b-idb\0asset\0farm.json")).toBe('{"revision":3}');

    // 3. Both session.save() and public storage.save() read/validate the mutated projectPackage and reject it.
    await expect(session.save()).rejects.toThrow("Unregistered runtime Scene 'Scene/missing.scene'");
    await expect(storage.save(session.id, session.projectPackage)).rejects.toThrow(
      "Unregistered runtime Scene 'Scene/missing.scene'"
    );
    expect(saveSpy).toHaveBeenCalledTimes(1);
  } finally {
    unregister();
    saveSpy.mockRestore();
    saveSnapshotSpy.mockRestore();
    owner.dispose();
    session.dispose();
    opening.mockRestore();
  }
});

it("v5 single-format skips headers for content-only writes, rewrites on manifest/file changes or concurrent writes, and cleans all stores", async () => {
  const { projects, projectRevisions, projectFiles, stats, storage } = createInMemoryProjectStorage();
  try {
    const base = project();
    base.project.files.push({ type: "JSON", dependencies: [], virtualPath: "farm.json", path: "farm.json" });
    base.contents["farm.json"] = '{"rev":0}';
    const snap0 = RuntimeProjectSnapshot.create(base);

    // Initial write has no baseline -> clears prior range, writes header + revision + all 3 files.
    await storage.saveSnapshot("header-skip", snap0);
    expect(stats.projectsPutCount).toBe(1);
    expect(stats.revisionsPutCount).toBe(1);
    expect(stats.filesRangeDeleteCount).toBe(1);
    expect(stats.filesPutCount).toBe(3);

    // Content-only update reuses baseline & header -> skips projects.put and only puts the changed asset.
    const snap1 = snap0.withUpdatedContent("farm.json", '{"rev":1}');
    await storage.saveSnapshot("header-skip", snap1);
    expect(stats.projectsPutCount).toBe(1);
    expect(stats.revisionsPutCount).toBe(2);
    expect(stats.filesRangeDeleteCount).toBe(1);
    expect(stats.filesPutCount).toBe(4);

    // Adding a file changes manifest/contentPaths -> keeps baseline diffing (only new/changed files) and rewrites projects header.
    const withNewFile = structuredClone(base);
    withNewFile.project.files.push({ type: "JSON", dependencies: [], virtualPath: "extra.json", path: "extra.json" });
    withNewFile.contents["farm.json"] = '{"rev":2}';
    withNewFile.contents["extra.json"] = '{"ok":true}';
    const snap2 = RuntimeProjectSnapshot.create(withNewFile);
    await storage.saveSnapshot("header-skip", snap2);
    expect(stats.projectsPutCount).toBe(2);
    expect(stats.filesRangeDeleteCount).toBe(1);
    expect(stats.filesPutCount).toBe(6);

    // Simulate another writer changing projectRevisions + leaving an extra stale file:
    // next save sees missing revision key -> clears stale files & forces full rewrite + header rewrite.
    projectRevisions.set("header-skip", { storageRevision: "other-tab-revision" });
    projectFiles.set("header-skip\0asset\0stale.json", "stale");
    const snap3 = snap2.withUpdatedContent("farm.json", '{"rev":3}');
    await storage.saveSnapshot("header-skip", snap3);
    expect(stats.projectsPutCount).toBe(3);
    expect(stats.filesRangeDeleteCount).toBe(2);
    expect(projectFiles.has("header-skip\0asset\0stale.json")).toBe(false);

    // Reload returns exact latest package, and deleteMatching cleans projects, projectRevisions, and projectFiles.
    const restored = await storage.load("header-skip");
    expect(restored?.contents["farm.json"]).toBe('{"rev":3}');
    expect(restored?.contents["extra.json"]).toBe('{"ok":true}');

    const removed = await storage.deleteMatching((id) => id === "header-skip");
    expect(removed).toEqual(["header-skip"]);
    expect(projects.has("header-skip")).toBe(false);
    expect(projectRevisions.has("header-skip")).toBe(false);
    expect([...projectFiles.keys()].some((k) => k.startsWith("header-skip\0"))).toBe(false);
    expect(await storage.load("header-skip")).toBeUndefined();
  } finally {
    storage.close();
  }
});

it("RuntimeProjectSnapshot isolates binary payloads and rejects tampering or forged tokens", async () => {
  const { projectFiles, storage } = createInMemoryProjectStorage();
  try {
    const pack = project();
    const initialBytes = pack.contents["mesh.bin"] as Uint8Array;
    const snapshot = RuntimeProjectSnapshot.create(pack);

    // Mutating input Uint8Array or manifest after snapshot creation must not alter the snapshot.
    initialBytes[0] = 99;
    pack.project.scene = "Scene/corrupted.scene";

    expect(snapshot.hasPath("mesh.bin")).toBe(true);
    expect(snapshot.hasPath("missing.bin")).toBe(false);
    expect(() => snapshot.withUpdatedContent("missing.bin", "x")).toThrow("Unregistered runtime asset content");
    expect(() => snapshot.withUpdatedContent("mesh.bin", null as unknown as string)).toThrow(
      "Invalid runtime asset content"
    );
    expect(() => snapshot.withUpdatedContents([["mesh.bin", "ok"], ["missing.bin", "bad"]])).toThrow(
      "Unregistered runtime asset content"
    );

    const nextBytes = new Uint8Array([7, 8, 9]);
    const updated = snapshot.withUpdatedContent("mesh.bin", nextBytes);
    nextBytes[1] = 255;

    await storage.saveSnapshot("snap-iso", snapshot);
    expect(projectFiles.get("snap-iso\0asset\0mesh.bin")).toEqual(new Uint8Array([1, 2]));

    await storage.saveSnapshot("snap-iso", updated);
    expect(projectFiles.get("snap-iso\0asset\0mesh.bin")).toEqual(new Uint8Array([7, 8, 9]));

    const loaded = await storage.load("snap-iso");
    expect(loaded?.project.scene).toBe("Scene/main.scene");
    expect(loaded?.contents["mesh.bin"]).toEqual(new Uint8Array([7, 8, 9]));

    await expect(storage.saveSnapshot("snap-iso", {} as unknown as RuntimeProjectSnapshot)).rejects.toThrow(
      "Invalid runtime project snapshot"
    );
  } finally {
    storage.close();
  }
});

it("preserves exact assertAssetPath, validateRuntimeProject, and cloneRuntimeProjectPackage edge cases", () => {
  for (const valid of [
    "Scene/main.scene",
    "skills.meta/x",
    "editor.meta/x",
    "a/.ai",
    "a/b:c",
    "...",
    "Assets/Sub:Folder/item.json"
  ]) {
    expect(() => assertAssetPath(valid)).not.toThrow();
  }
  for (const invalid of [
    "",
    ".",
    "..",
    "a/.",
    "a/..",
    "a/../b",
    "a//b",
    "/a",
    "a/",
    "a\\b",
    "a?b",
    "a#b",
    "http://example.com/a",
    "data:text/plain",
    "skills",
    "skills.meta",
    "skills/a",
    "declare",
    "declare/x",
    ".ai",
    ".ai/file",
    "remote",
    "remote/file",
    "project.json",
    "project.json.meta",
    "editor",
    "editor.meta",
    "editor/file",
    "engine",
    "engine.meta",
    "engine/file"
  ]) {
    expect(() => assertAssetPath(invalid), `expected '${invalid}' to throw`).toThrow("Invalid runtime asset path");
  }

  // Dependency duplicate error must run before invalid dependency path check.
  const dupDeps = project();
  dupDeps.project.files[0].dependencies = ["Scene/other.scene", "Scene/other.scene", "bad\\dep"];
  expect(() => validateRuntimeProject(dupDeps)).toThrow("Invalid asset dependencies");

  // Invalid non-registered dependency path must still fail assertAssetPath inside validateRuntimeProject.
  const badDep = project();
  badDep.project.files[0].dependencies = ["bad\\dep"];
  expect(() => validateRuntimeProject(badDep)).toThrow("Invalid runtime asset path");

  // Implicit parent directory from documents conflicts with registered file at that path.
  const docDirConflict = project();
  docDirConflict.project.files.push({ type: "JSON", virtualPath: "docs", path: "docs.json" });
  docDirConflict.documents = { "docs/readme.txt": "hello" };
  expect(() => validateRuntimeProject(docDirConflict)).toThrow("Path already exists: 'docs'");

  // Explicit directory conflicts with document at exact path.
  const explicitDirDocConflict = project();
  explicitDirDocConflict.project.directories = ["Notes"];
  explicitDirDocConflict.documents = { Notes: "note" };
  expect(() => validateRuntimeProject(explicitDirDocConflict)).toThrow("Path already exists: 'Notes'");

  // cloneRuntimeProjectPackage deep isolates metadata/params/dependencies/uint8 while keeping undefined keys.
  const orig = project();
  orig.project.engineVersion = undefined;
  orig.project.files[0].params = { nested: { tags: ["a", "b"] } };
  orig.documents = { "mesh.bin.meta": '{"summary":"m"}' };
  const cloned = cloneRuntimeProjectPackage(orig);
  expect(Object.hasOwn(cloned.project, "engineVersion")).toBe(true);
  expect(cloned.project.engineVersion).toBeUndefined();
  expect(cloned).toEqual(orig);
  (cloned.project.files[0].params!.nested as { tags: string[] }).tags.push("c");
  (cloned.contents["mesh.bin"] as Uint8Array)[0] = 77;
  cloned.documents!["mesh.bin.meta"] = '{"summary":"changed"}';
  expect((orig.project.files[0].params!.nested as { tags: string[] }).tags).toEqual(["a", "b"]);
  expect((orig.contents["mesh.bin"] as Uint8Array)[0]).toBe(1);
  expect(orig.documents["mesh.bin.meta"]).toBe('{"summary":"m"}');
});
