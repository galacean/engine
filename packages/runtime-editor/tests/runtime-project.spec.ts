import { expect, it, vi } from "vitest";
import { cloneRuntimeProjectPackage, RUNTIME_PROJECT_SAVE_VERSION, RuntimeProjectStorage, runtimeProjectFiles, projectDocuments, validateRuntimeProject, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
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
  const database = { transaction() {
    const request = {result:saved, onsuccess:undefined as undefined | (() => void)};
    const tx = { oncomplete: undefined as undefined | (() => void),
      objectStore: () => ({ get: () => request }) };
    queueMicrotask(() => { request.onsuccess?.(); tx.oncomplete?.(); });
    return tx;
  }, close() {} };
  return new RuntimeProjectStorage(database as unknown as IDBDatabase);
}

function databaseFactory(initialVersion = 0) {
  const stores = new Set<string>();
  const createIndex = vi.fn();
  const store = { createIndex };
  const database = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore(name: string) { stores.add(name); return store; },
    deleteObjectStore(name: string) { stores.delete(name); },
    close() {}
  };
  let version = initialVersion;
  const factory = { open: (_name: string, requestedVersion: number) => {
    const request = {
      result: database,
      transaction: { objectStore: () => store },
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
  return { factory: factory as unknown as IDBFactory, stores, createIndex, version: () => version };
}

it("opens the shared database schema at version 4 and upgrades an empty version 1 database", async () => {
  const empty = databaseFactory();
  const storage = await RuntimeProjectStorage.open(empty.factory);
  expect(empty.version()).toBe(4);
  expect([...empty.stores]).toEqual(["projects", "projectFiles"]);
  storage.close();

  const existing = databaseFactory(1);
  existing.stores.add("projects");
  const upgraded = await RuntimeProjectStorage.open(existing.factory);
  expect(existing.version()).toBe(4);
  expect([...existing.stores]).toEqual(["projects", "projectFiles"]);
  upgraded.close();
});

it("opens a database already upgraded by a newer worktree without dropping its project store", async () => {
  const existing = databaseFactory(4);
  existing.stores.add("projects");
  existing.stores.add("projectFiles");
  const storage = await RuntimeProjectStorage.open(existing.factory);
  expect(existing.version()).toBe(4);
  expect([...existing.stores]).toEqual(["projects", "projectFiles"]);
  storage.close();
});

it("adds the revision index to version 2 without recreating its existing store", async () => {
  const existing = databaseFactory(2);
  existing.stores.add("projects");
  const storage = await RuntimeProjectStorage.open(existing.factory);
  expect(existing.version()).toBe(4);
  expect(existing.createIndex).toHaveBeenCalledWith("storageRevision", "storageRevision", {unique:true});
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
