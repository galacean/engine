import { RUNTIME_PROJECT_SAVE_VERSION } from "../src/runtime-editor/project/runtime-project";
import { describe, expect, it, vi } from "vitest";
import { compileProjectResource, prepareProjectSources } from "../src/runtime-editor/scene/runtime-project-compiler";
import type { RuntimeProjectPackage } from "../src/runtime-editor/project/runtime-project";

describe("Editor source compilation", () => {
  const source = { asset: { version: "2.0" }, root: "Cube.prefab", entities: [{ id: "Cube.prefab", name: "Cube", components: ["mesh"] }], components: [{ id: "mesh", type: "MeshRenderer", props: { enabled: true } }] };
  function pack(): RuntimeProjectPackage {
    return { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "scene", files: [{  virtualPath: "Cube.prefab", path: "Cube.prefab", type: "Prefab" }] }, contents: { "Cube.prefab": JSON.stringify(source) } };
  }
  it("lowers stable source IDs without changing saved source", () => {
    const project = pack();
    const before = structuredClone(project);
    const runtime = JSON.parse(compileProjectResource(project, "Cube.prefab") as string);
    expect(runtime.root).toBe(0);
    expect(runtime.entities[0].components).toEqual([0]);
    expect(runtime.components[0]).toEqual({ type: "MeshRenderer", props: { enabled: true } });
    expect(project).toEqual(before);
  });
  it("preserves published runtime resources and rejects invalid editable sources", () => {
    const project = pack();
    project.contents["Cube.prefab"] = JSON.stringify({ version: "2.0", root: 0, entities: [], components: [], refs: [] });
    expect(compileProjectResource(project, "Cube.prefab")).toBe(project.contents["Cube.prefab"]);
    project.contents["Cube.prefab"] = JSON.stringify({ ...source, root: "missing" });
    expect(() => compileProjectResource(project, "Cube.prefab")).toThrow();
  });
  it("uses registered script classes without adding unloadable Script resources to Scene refs", () => {
    const project = pack();
    project.project.files.push({  virtualPath: "Scripts/Spin.ts", path: "Scripts/Spin.ts", type: "script" });
    project.contents["Cube.prefab"] = JSON.stringify({ ...source,
      components: [{ id: "mesh", type: "Script", script: { $ref: "Scripts/Spin.ts" } }] });
    const original = project.contents["Cube.prefab"];
    const compiled = JSON.parse(compileProjectResource(project, "Cube.prefab") as string);
    expect(compiled.components[0]).toEqual({ type: "Scripts/Spin.ts" });
    expect(compiled.refs).toEqual([]);
    expect(project.contents["Cube.prefab"]).toBe(original);
  });
});

 it("loads referenced Prefab topology once and terminates cyclic references", async () => {
   const project: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "A.prefab", files: [
     {  virtualPath: "A.prefab", path: "A.prefab", type: "Prefab" },
     {  virtualPath: "B.prefab", path: "B.prefab", type: "Prefab" }
   ] }, contents: { "A.prefab": JSON.stringify({ asset: { version: "2.0" }, refs: [{ $ref: "B.prefab" }, { $ref: "B.prefab" }] }) } };
   const loaded: string[] = [];
   await prepareProjectSources(project, async path => {
     loaded.push(path);
     project.contents[path] = JSON.stringify({ asset: { version: "2.0" }, ref: { $ref: "A.prefab" } });
   });
   expect(loaded).toEqual(["B.prefab"]);
 });


it("keeps Script type information while lowering references among mixed components", () => {
  const source = {asset: {version: "2.0"}, scene: {rootEntities: ["root"], background: {mode: 0, color: {r: 0, g: 0, b: 0, a: 1}, skyMaterial: {$ref: "sky.mat"}}},
    entities: [{id: "root", components: ["mesh", "spin", "observer"]}], components: [
      {id: "mesh", type: "MeshRenderer"},
      {id: "spin", type: "Script", script: {$ref: "Spin.ts"}},
      {id: "observer", type: "Script", script: {$ref: "Observer.ts"}, props: {target: {$component: "spin"}, material: {$ref: "sky.mat"}}}
    ]};
  const pack: RuntimeProjectPackage = {version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {scene: "main.scene", files: [["main.scene", "Scene"], ["Spin.ts", "script"], ["Observer.ts", "script"], ["sky.mat", "Material"]].map(([path,type]) => ({virtualPath: path, path, type}))},
    contents: {"main.scene": JSON.stringify(source)}};
  const runtime = JSON.parse(compileProjectResource(pack, "main.scene") as string);
  expect(runtime.components[1]).toEqual({type: "Spin.ts"});
  expect(runtime.components[2].props.target).toEqual({$component: {entity: [0], type: "Spin.ts", index: 0}});
  expect(runtime.refs).toEqual([{url: "sky.mat"}]);
  expect(runtime.components[2].props.material).toEqual({$ref: 0});
  expect(runtime.scene.background.skyMaterial).toBe(0);
});

it("keeps Script material properties as properties in Prefab overrides", () => {
  const prefab = { asset: { version: "2.0" }, root: "root", entities: [{ id: "root", components: ["script"] }],
    components: [{ id: "script", type: "Script", script: { $ref: "Paint.ts" } }] };
  const source = { asset: { version: "2.0" }, scene: { rootEntities: ["instance"], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
    entities: [{ id: "instance", instance: { asset: { $ref: "Paint.prefab" }, overrides: {
      componentProps: [{ target: "script", props: { material: { $ref: "paint.mat" } } }]
    } } }], components: [] };
  const pack: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: "main.scene", files: [["main.scene", "Scene"], ["Paint.prefab", "Prefab"], ["Paint.ts", "Script"], ["paint.mat", "Material"]]
      .map(([path, type]) => ({ virtualPath: path, path, type })) },
    contents: { "main.scene": JSON.stringify(source), "Paint.prefab": JSON.stringify(prefab) } };
  const runtime = JSON.parse(compileProjectResource(pack, "main.scene") as string);
  expect(runtime.entities[0].instance.overrides.componentProps[0]).toEqual({
    path: [], selector: { type: "Paint.ts", index: 0 }, props: { material: { $ref: 1 } }
  });
  expect(runtime.refs).toEqual([{ url: "Paint.prefab" }, { url: "paint.mat" }]);
});


it("isolates failed Script assets while preserving shared resources and the authoring baseline", () => {
  const source = {asset: {version: "2.0"}, scene: {rootEntities: ["root"], background: {mode: 0, color: {r: 0, g: 0, b: 0, a: 1}, skyMaterial: {$ref: "shared.mat"}}},
    entities: [{id: "root", components: ["broken", "mesh"]}], components: [
      {id: "broken", type: "Script", script: {$ref: "Broken.ts"}, props: {privateAsset: {$ref: "missing.mesh"}, shared: {$ref: "shared.mat"}}, calls: [{method: "setup", args: []}]},
      {id: "mesh", type: "MeshRenderer", props: {material: {$ref: "shared.mat"}}}
    ]};
  const pack: RuntimeProjectPackage = {version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {scene: "main.scene", files: [["main.scene", "Scene"], ["Broken.ts", "script"], ["missing.mesh", "Mesh"], ["shared.mat", "Material"]]
      .map(([path, type]) => ({virtualPath: path, path, type}))}, contents: {"main.scene": JSON.stringify(source)}};
  const baseline = compileProjectResource(pack, "main.scene");
  const runtime = JSON.parse(compileProjectResource(pack, "main.scene", path => path === "Broken.ts") as string);
  expect(runtime.refs).toEqual([{url: "shared.mat"}]);
  expect(runtime.components[0]).toMatchObject({type: "Broken.ts", props: {enabled: false}, calls: []});
  expect(runtime.components[1].calls[0].args).toEqual([{$ref: 0}]);
  expect(runtime.scene.background.skyMaterial).toBe(0);
  expect(compileProjectResource(pack, "main.scene")).toBe(baseline);
  expect(pack.contents["main.scene"]).toBe(JSON.stringify(source));
});

it("invalidates cached compilation on nested source, namespace and script availability changes", () => {
  const prefab = { asset: { version: "2.0" }, root: "root", entities: [{ id: "root", components: ["script"] }],
    components: [{ id: "script", type: "Script", script: { $ref: "Paint.ts" }, props: { enabled: true } }] };
  const source = { asset: { version: "2.0" }, scene: { rootEntities: ["instance"], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
    entities: [{ id: "instance", instance: { asset: { $ref: "Paint.prefab" }, overrides: {
      componentProps: [{ target: "script", props: { enabled: false } }]
    } } }], components: [] };
  const pack: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: "main.scene", files: [["main.scene", "Scene"], ["Paint.prefab", "Prefab"], ["Paint.ts", "script"]]
      .map(([path, type]) => ({ virtualPath: path, path, type })) },
    contents: { "main.scene": JSON.stringify(source), "Paint.prefab": JSON.stringify(prefab) } };
  const original = compileProjectResource(pack, "main.scene");
  expect(compileProjectResource(structuredClone(pack), "main.scene")).toBe(original);
  prefab.components[0].script.$ref = "Missing.ts";
  pack.contents["Paint.prefab"] = JSON.stringify(prefab);
  expect(() => compileProjectResource(pack, "main.scene")).toThrow();
  prefab.components[0].script.$ref = "Paint.ts";
  pack.contents["Paint.prefab"] = JSON.stringify(prefab);
  expect(compileProjectResource(pack, "main.scene")).toBe(original);
  pack.project.files[2].type = "JSON";
  expect(() => compileProjectResource(pack, "main.scene")).toThrow();
  pack.project.files[2].type = "script";
  const suppressed = JSON.parse(compileProjectResource(pack, "main.scene", () => true) as string);
  expect(suppressed.entities[0].instance.overrides.componentProps[0].calls).toEqual([]);
  expect(compileProjectResource(pack, "main.scene")).toBe(original);
});

it("retries failed source preparation and invalidates when a dependency disappears", async () => {
  const project: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "main", files: [
    { virtualPath: "main", path: "main", type: "Scene" }, { virtualPath: "nested", path: "nested", type: "Prefab" }
  ] }, contents: { main: JSON.stringify({ asset: { version: "2.0" }, ref: { $ref: "nested" } }) } };
  await expect(prepareProjectSources(project, async () => { throw Error("unavailable"); })).rejects.toThrow("unavailable");
  let loads = 0;
  const load = async () => { loads++; project.contents.nested = '{"asset":{"version":"2.0"}}'; };
  await prepareProjectSources(project, load);
  await prepareProjectSources(structuredClone(project), load);
  expect(loads).toBe(1);
  project.project.files.pop();
  await expect(prepareProjectSources(project, load)).rejects.toThrow("Cannot resolve project asset");
});

it("does not cache a source hydration callback that leaves the referenced source unavailable", async () => {
  const project: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "main", files: [
    { virtualPath: "main", path: "main", type: "Scene" }, { virtualPath: "nested", path: "nested", type: "Prefab" }
  ] }, contents: { main: JSON.stringify({ asset: { version: "2.0" }, ref: { $ref: "nested" } }) } };
  let calls = 0;
  await prepareProjectSources(project, async () => { calls++; });
  await prepareProjectSources(project, async () => { calls++; });
  expect(calls).toBe(2);
});


it("reuses compilation across editor sidecars but observes referenced metadata and duplicate paths", () => {
  const source = JSON.stringify({ asset: { version: "2.0" }, root: "root",
    entities: [{ id: "root", components: ["mesh"] }],
    components: [{ id: "mesh", type: "MeshRenderer", props: { material: { $ref: "paint.mat" } } }] });
  const pack: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: "Cached.prefab", files: [
      { virtualPath: "Cached.prefab", path: "Cached.prefab", type: "Prefab" },
      { virtualPath: "paint.mat", path: "paint.mat", type: "Material", params: { sourceContentRevision: "one" } }
    ] }, contents: { "Cached.prefab": source } };
  const parse = vi.spyOn(JSON, "parse");
  try {
    const original = compileProjectResource(pack, "Cached.prefab");
    const parses = () => parse.mock.calls.filter(([text]) => text === source).length;
    expect(parses()).toBe(1);
    const draft = structuredClone(pack);
    draft.project.files.push({ virtualPath: "World/Editor.json", path: "runtime-world:editor", type: "SeedWorldEditor" });
    draft.contents["World/Editor.json"] = '{"timeHours":13}';
    draft.documents = { "World/Editor.json.meta": '{"description":"editor settings"}' };
    expect(compileProjectResource(draft, "Cached.prefab")).toBe(original);
    expect(parses()).toBe(1);
    draft.project.files[1].params!.sourceContentRevision = "two";
    compileProjectResource(draft, "Cached.prefab");
    expect(parses()).toBe(2);
    draft.project.files.push({ ...draft.project.files[1] });
    expect(() => compileProjectResource(draft, "Cached.prefab")).toThrow("unambiguously");
    draft.project.files.pop();
    draft.project.files.splice(1, 1);
    expect(() => compileProjectResource(draft, "Cached.prefab")).toThrow("Cannot resolve");
    expect(compileProjectResource(pack, "Cached.prefab")).toBe(original);
  } finally { parse.mockRestore(); }
});

it("invalidates a cached animation controller when its referenced clip is removed", () => {
  const pack: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: "main", files: [
      { virtualPath: "Walk.controller", path: "Walk.controller", type: "AnimatorController" },
      { virtualPath: "Walk.clip", path: "Walk.clip", type: "AnimationClip" }
    ] }, contents: { "Walk.controller": JSON.stringify({ layers: [{ stateMachine: {
      states: [{ clip: { url: "Walk.clip" } }]
    } }] }) } };
  compileProjectResource(pack, "Walk.controller");
  pack.project.files.pop();
  expect(() => compileProjectResource(pack, "Walk.controller")).toThrow("Cannot resolve animation asset");
});

it("reuses source hydration across unrelated sidecars and rechecks newly hydrated roots", async () => {
  const pack: RuntimeProjectPackage = { version: RUNTIME_PROJECT_SAVE_VERSION,
    project: { scene: "Hydrate.scene", files: [
      { virtualPath: "Hydrate.scene", path: "Hydrate.scene", type: "Scene" },
      { virtualPath: "Lazy.prefab", path: "Lazy.prefab", type: "Prefab" }
    ] }, contents: { "Hydrate.scene": '{"asset":{"version":"2.0"}}' } };
  const load = vi.fn(async () => {}), parse = vi.spyOn(JSON, "parse");
  try {
    await prepareProjectSources(pack, load);
    const calls = parse.mock.calls.length;
    pack.project.files.push({ virtualPath: "World/Editor.json", path: "editor", type: "JSON" });
    pack.contents["World/Editor.json"] = '{}';
    await prepareProjectSources(pack, load);
    expect(parse.mock.calls.length).toBe(calls);
    pack.contents["Lazy.prefab"] = '{"asset":{"version":"2.0"},"reference":{"$ref":"missing.prefab"}}';
    await expect(prepareProjectSources(pack, load)).rejects.toThrow("Cannot resolve project asset");
    pack.project.files.push({ virtualPath: "missing.prefab", path: "missing.prefab", type: "Prefab" });
    pack.contents["missing.prefab"] = '{"asset":{"version":"2.0"}}';
    await prepareProjectSources(pack, load);
    expect(load).toHaveBeenCalledWith("missing.prefab");
    pack.project.files.push({ virtualPath: "missing.prefab", path: "duplicate", type: "JSON" });
    await expect(prepareProjectSources(pack, load)).rejects.toThrow("unambiguously");
  } finally { parse.mockRestore(); }
});
