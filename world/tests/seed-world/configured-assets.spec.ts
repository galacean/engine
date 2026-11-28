import { afterEach, expect, it, vi } from "vitest";
import guide from "@galacean/engine-runtime-editor/skills/scripting/references/configured-assets.md?raw";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit.ts";
import { RuntimeProjectDependencies } from "@galacean/engine-project/runtime-editor/project/runtime-project-dependencies.ts";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats.ts";
import { RUNTIME_PROJECT_SAVE_VERSION, RuntimeProjectStorage, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session.ts";
import { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor.ts";
import { RuntimeScriptWorker } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-worker.ts";
import { checkRuntimeScripts } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-compiler.ts";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import declarations from "@galacean/engine-runtime-editor/runtime-editor/generated/engine-runtime-files.json";
import dom from "typescript/lib/lib.dom.d.ts?raw";
import ts from "typescript";
import { seedWorldProjectFormats } from "../../demos/seed-world/SeedWorldProjectFormats";

vi.hoisted(() => { (globalThis as any).window ??= {}; });

const scene = JSON.stringify({ asset: { version: "2.0" },
  scene: { rootEntities: [], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
  entities: [], components: [] });
const config = JSON.stringify({ trees: [{ model: { $ref: "Birch.glb" } }, { model: { $ref: "Pine.glb" } }] });
const formats = () => nativeAssetFormats(() => ({}));
function project(): RuntimeProjectPackage {
  return { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "main.scene", files: [
    { virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: [] },
    { virtualPath: "Forest.json", path: "Forest.json", type: "JSON", dependencies: ["Birch.glb", "Pine.glb"] },
    { virtualPath: "Birch.glb", path: "Birch.glb", type: "GLTF", dependencies: [] },
    { virtualPath: "Pine.glb", path: "Pine.glb", type: "GLTF", dependencies: [] }
  ] }, contents: { "main.scene": scene } };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("protects all configured candidates from a cold manifest without reading the caller or binary", () => {
  const pack = project(), read = vi.fn(() => { throw Error("must not parse unloaded config"); });
  const edit = new RuntimeProjectEdit(pack, new Map([...formats(), ["JSON", { validate() {}, references: read }]]));
  expect(edit.references("Birch.glb")).toEqual(["Forest.json"]);
  expect(edit.references("Pine.glb")).toEqual(["Forest.json"]);
  expect(() => edit.delete("Pine.glb")).toThrow("Forest.json");
  expect(read).not.toHaveBeenCalled();
  expect(edit.preview().contents).toEqual({ "main.scene": scene });
});

it("component candidates compile to Engine refs and only direct edges are persisted", () => {
  const pack = project(); pack.contents["Forest.json"] = config;
  const edit = new RuntimeProjectEdit(pack, formats()), hierarchy = new RuntimeSceneEdit(edit, "main.scene");
  const entity = hierarchy.create({ name: "Forest" });
  hierarchy.addComponent(entity.id, { type: "Forest", props: {
    config: { $ref: "Forest.json" },
    trees: [{ $ref: "Birch.glb" }, { $ref: "Birch.glb" }]
  } });
  expect(edit.references("Birch.glb")).toEqual(["Forest.json", "main.scene"]);
  expect(edit.references("Pine.glb")).toEqual(["Forest.json"]);
  const saved = edit.finish();
  expect(saved.project.files[0].dependencies).toEqual(expect.arrayContaining(["Forest.json", "Birch.glb"]));
  expect(saved.project.files[0].dependencies).toHaveLength(2);
  const runtime = JSON.parse(compileProjectResource(saved, "main.scene") as string);
  expect(runtime.refs.map((ref: { url: string }) => ref.url).sort()).toEqual(["Birch.glb", "Forest.json"]);
  expect(compileProjectResource(saved, "Forest.json")).toBe(config); // JSON references remain lazy descriptors.
});

it("unlink, delete, undo and reopen preserve candidate protection", () => {
  const pack = project(); pack.contents["Forest.json"] = config;
  const edit = new RuntimeProjectEdit(pack, formats());
  edit.update("Forest.json", JSON.stringify({ trees: [{ model: { $ref: "Birch.glb" } }] }));
  expect(edit.references("Pine.glb")).toEqual([]);
  edit.delete("Pine.glb");
  const undo = edit.captureUndo(pack), saved = edit.finish();
  expect(saved.project.files.find(file => file.virtualPath === "Forest.json")!.dependencies).toEqual(["Birch.glb"]);
  const reopened = new RuntimeProjectEdit(saved, formats());
  reopened.restore(undo);
  expect(reopened.references("Pine.glb")).toEqual(["Forest.json"]);
  expect(reopened.finish().project.files.find(file => file.virtualPath === "Forest.json")!.dependencies).toEqual(["Birch.glb", "Pine.glb"]);
  expect(pack.contents["Forest.json"]).toBe(config);
});

it("imports derive dependencies instead of trusting caller-supplied empty metadata", () => {
  const pack = project(), edit = new RuntimeProjectEdit(pack, formats());
  edit.createBundle([{ file: { virtualPath: "other.json", path: "other.json", type: "JSON", dependencies: [] },
    content: JSON.stringify({ choices: [{ $ref: "Pine.glb" }, { $ref: "Pine.glb" }] }),
    metadata: { summary: "Other candidates" } }], {});
  expect(edit.references("Pine.glb")).toEqual(["Forest.json", "other.json"]);
  expect(edit.finish().project.files.at(-1)!.dependencies).toEqual(["Pine.glb"]);
});

it("extracts candidates from custom UTF-8 config bytes using the registered encoding", () => {
  const pack = project();
  pack.project.files[1].type = "CandidateConfig";
  delete pack.project.files[1].dependencies;
  pack.contents["Forest.json"] = new TextEncoder().encode(config);
  const edit = new RuntimeProjectEdit(pack, new Map([...formats(), ["CandidateConfig", {
    ...formats().get("JSON")!, contentEncoding: "utf8" as const
  }]]));
  expect(edit.references("Pine.glb")).toEqual(["Forest.json"]);
});

it("does not accept missing candidate assets or infer references from ordinary strings", () => {
  const edit = new RuntimeProjectEdit(project(), formats());
  edit.update("Forest.json", '{"description":"Pine.glb","trees":[]}');
  expect(edit.references("Pine.glb")).toEqual([]);
  edit.update("Forest.json", '{"trees":[{"$ref":"missing.glb"}]}');
  expect(() => edit.finish()).toThrow("missing.glb");
});

it("unknown dependency information blocks deletion; cyclic edges do not require recursive traversal", () => {
  const pack = project(); delete pack.project.files[1].dependencies;
  const edit = new RuntimeProjectEdit(pack, formats());
  expect(() => edit.references("Birch.glb")).toThrow("Dependency information unavailable");
  const files = project().project.files;
  files[1].dependencies = ["Birch.glb"]; files[2].dependencies = ["Forest.json"];
  const graph = new RuntimeProjectDependencies(files);
  expect(graph.references("Forest.json")).toEqual(["Birch.glb"]);
  expect(graph.references("Birch.glb")).toEqual(["Forest.json"]);
});

it("reanalyzing imports updates existing Script edges when a new module changes resolution", () => {
  const pack = project();
  const sources = { "Use.ts": 'import {value} from "./Choice"; export const selected = value;', "Choice/index.ts": "export const value = 1;" };
  let dependencies = checkRuntimeScripts(sources, {}, {}, [], true).dependencies;
  for (const [path, content] of Object.entries(sources)) {
    pack.project.files.push({ virtualPath: path, path, type: "script", dependencies: dependencies[path] });
    pack.contents[path] = content;
  }
  const edit = new RuntimeProjectEdit(pack, nativeAssetFormats(() => dependencies));
  edit.create({ virtualPath: "Choice.ts", path: "Choice.ts", type: "script" }, "export const value = 2;");
  dependencies = checkRuntimeScripts({ ...sources, "Choice.ts": "export const value = 2;" }, {}, {}, [], true).dependencies;
  edit.refreshDependencies(true);
  expect(edit.references("Choice.ts")).toEqual(["Use.ts"]);
  expect(edit.references("Choice/index.ts")).toEqual([]);
});

it("typechecks the exact player-system example supplied to the LLM", () => {
  const script = /```typescript\n([\s\S]*?)```/.exec(guide)![1];
  const checked = checkRuntimeScripts({ "Scripts/Forest.ts": script }, declarations, { ...agentTypecheckLibraries, "/lib.dom.d.ts": dom });
  expect(checked.dependencies["Scripts/Forest.ts"]).toEqual([]);
});

it("the documented Script loads only the selected configured model and rejects an invalid choice", async () => {
  const script = /```typescript\n([\s\S]*?)```/.exec(guide)![1];
  const compiled = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports: { default?: new () => any } = {};
  // Execute the exact example with a resource boundary double; no GPU/browser is needed.
  new Function("require", "exports", compiled.outputText)(() => ({ Script: class {} }), exports);
  const forest = new exports.default!();
  forest.config = { data: JSON.parse(config) };
  const child = {}, instantiateSceneRoot = vi.fn(() => child);
  const load = vi.fn(async () => ({ instantiateSceneRoot })), addChild = vi.fn();
  forest.engine = { resourceManager: { load } }; forest.entity = { addChild };
  await forest.createTree(1);
  expect(load.mock.calls).toEqual([["Pine.glb"]]);
  expect(addChild).toHaveBeenCalledWith(child);
  await expect(forest.createTree(5)).rejects.toThrow("候选树木");
  expect(load).toHaveBeenCalledTimes(1);
  forest.destroyed = true;
  await forest.createTree(0);
  expect(addChild).toHaveBeenCalledTimes(1);
});

it("Seed World supports ordinary candidate JSON while preserving generated water profile references", () => {
  const format = seedWorldProjectFormats.get("JSON")!, file = project().project.files[1];
  expect(() => format.validate(config)).not.toThrow();
  expect(format.references(config, file)).toEqual(expect.arrayContaining(["Birch.glb", "Pine.glb"]));
  const water = JSON.stringify({ schema: "seed-world-water-shader-aot-v1", profiles: [{ virtualPath: "Water.shader" }] });
  expect(format.references(water, file)).toEqual(["Water.shader"]);
  expect(() => format.validate(water)).toThrow("generated");
});

it.each(["indexed", "custom"] as const)("public reference tools inspect %s configuration and never fetch candidate models", async mode => {
  vi.stubGlobal("window", {});
  const pack = project();
  if (mode === "indexed") pack.project.files.push({
    virtualPath: "Forest.ts", path: "Forest.ts", type: "script", dependencies: ["Forest.json"]
  });
  if (mode === "custom") pack.project.files[1].type = "CandidateConfig";
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({ load: async () => pack, close() {}, save: async () => {} } as any);
  const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    expect(String(input)).toBe("Forest.json");
    return new Response(config);
  });
  const compiler = vi.spyOn(RuntimeScriptWorker.prototype, "compile").mockImplementation(async () => {
    throw Error("reference query must not compile scripts");
  });
  const session = await RuntimeProjectSession.open("candidates", pack.project, "https://example.test/");
  const hostFormats = mode === "custom" ? new Map([["CandidateConfig", {
    ...formats().get("JSON")!, contentEncoding: "utf8" as const, referenceTypes: ["GLTF"]
  }]]) : undefined;
  const editor = new RuntimeNativeEditor(session, { rootEntities: [] } as any, hostFormats);
  const signal = new AbortController().signal;
  try {
    for (let i = 0; i < 2; i++) {
      const transaction = editor.beginEdit("query-" + i, signal);
      try {
        const info = transaction.tools!.find(tool => tool.name === "asset.info")!;
        await expect(info.execute(info.parseInput({ path: "Pine.glb" }), { signal })).resolves.toMatchObject({path:"Pine.glb",type:"GLTF",name:"Pine.glb",summary:""});
        const tool = transaction.tools!.find(tool => tool.name === "asset.references")!;
        await expect(tool.execute(tool.parseInput({ path: "Pine.glb" }), { signal })).resolves.toEqual({ references: ["Forest.json"] });
        expect(transaction.hasChanges()).toBe(false);
      } finally { await transaction.discard(); }
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(compiler).not.toHaveBeenCalled();
    expect(session.projectPackage.contents["Birch.glb"]).toBeUndefined();
    expect(session.projectPackage.contents["Pine.glb"]).toBeUndefined();
    if (mode === "indexed") {
      expect(session.projectPackage.contents["Forest.ts"]).toBeUndefined();
      const transaction = editor.beginEdit("read-config", signal);
      try {
        const tool = transaction.tools!.find(tool => tool.name === "asset.read")!;
        await expect(tool.execute(tool.parseInput({ path: "Forest.json" }), { signal })).resolves.toMatchObject({ kind: "structured", data: JSON.parse(config) });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(session.projectPackage.contents["Forest.ts"]).toBeUndefined();
      } finally { await transaction.discard(); }
    }
  } finally { editor.dispose(); session.dispose(); }
});

it("domain writes maintain dependencies atomically and recheck final references before removal", async () => {
  vi.stubGlobal("window", {});
  const pack = project(); pack.contents["Forest.json"] = config;
  const save = vi.fn(async () => {});
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({ load: async () => pack, close() {}, save } as any);
  const session = await RuntimeProjectSession.open("save-candidates", pack.project, "https://example.test/");
  try {
    const file = pack.project.files[1], onlyBirch = '{"trees":[{"model":{"$ref":"Birch.glb"}}]}';
    await session.publishAsset(file, onlyBirch);
    expect(session.projectPackage.project.files[1].dependencies).toEqual(["Birch.glb"]);
    const before = structuredClone(session.projectPackage);
    save.mockRejectedValueOnce(new Error("disk failed"));
    await session.publishAsset(file, config);
    await expect(session.flush()).rejects.toThrow("disk failed");
    expect(session.projectPackage.project.files[1].dependencies).toEqual(["Birch.glb", "Pine.glb"]);
    await session.flush();
    const owner = session.ownRuntimeAsset({ virtualPath: "state.json", path: "state.json", type: "JSON" }, "project");
    const staleDraft = structuredClone(before);
    staleDraft.project.files = staleDraft.project.files.filter(file => file.virtualPath !== "Pine.glb");
    await owner.update(() => ({ content: '{"selected":{"$ref":"Pine.glb"}}', value: null }));
    await expect(session.publish(staleDraft)).rejects.toThrow("Pine.glb");
    expect(session.projectPackage.project.files.some(file => file.virtualPath === "Pine.glb")).toBe(true);
    owner.dispose();
  } finally { session.dispose(); }
});
