import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { expect, it } from "vitest";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { nativeToolSchemas, executeNativeProjectTool } from "../src/runtime-editor-agent/runtime-native-tools";

const formats = new Map([["Scene", { validate: (value: unknown) => { JSON.parse(value as string); },
  references: (value: unknown) => (JSON.parse(value as string).refs ?? []) as string[] }],
["Material", { validate: (value: unknown) => { JSON.parse(value as string); }, references: () => [] as string[] }]]);
function source(): RuntimeProjectPackage {
  return { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "main.scene", files: [
    {  virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: ["red.mat"] },
    {  virtualPath: "red.mat", path: "red.mat", type: "Material", dependencies: [] }
  ] }, contents: { "main.scene": "{\"refs\":[\"red.mat\"]}", "red.mat": '{}' } };
}

it("keeps edits detached, preserves IDs and rejects invalid updates without changing content", () => {
  const original = source(); const edit = new RuntimeProjectEdit(original, formats);
  edit.update("red.mat", '{"color":"blue"}');
  expect(() => edit.update("red.mat", "invalid")).toThrow();
  expect(original.contents["red.mat"]).toBe("{}");
  const result = edit.finish();
  expect(result.project.files[1].virtualPath).toBe("red.mat");
  expect(result.contents["red.mat"]).toBe('{"color":"blue"}');
  expect(() => edit.update("red.mat", "{}")).toThrow("closed");
});

it("guards references and registered Scenes, then permits deletion after explicit unlink", () => {
  const edit = new RuntimeProjectEdit(source(), formats);
  expect(() => edit.delete("red.mat")).toThrow("main.scene");
  expect(() => edit.delete("main.scene")).toThrow("registered");
  edit.update("main.scene", '{"refs":[]}');
  edit.delete("red.mat");
  expect(edit.deletedAssetPaths()).toEqual(["red.mat"]);
  expect(edit.finish().contents["red.mat"]).toBeUndefined();
  expect(edit.deletedAssetPaths()).toEqual(["red.mat"]);
});

it("rejects duplicate creation and makes discard terminal", () => {
  const original = source(); const edit = new RuntimeProjectEdit(original, formats);
  expect(() => edit.create(original.project.files[1], "{}")).toThrow("already exists");
  edit.discard();
  expect(() => edit.finish()).toThrow("closed");
  expect(original.project.files).toHaveLength(2);
});

it("authors document text through host document methods, reads the draft and restores documents with project undo", async () => {
  const before = source(), edit = new RuntimeProjectEdit(before, formats);
  let mutations = 0;
  const call = (name: string, input: unknown) => executeNativeProjectTool(name, input, edit, async () => {}, () => mutations++, new AbortController().signal);
  edit.writeDocument("Notes/README.md", "# How to use");
  edit.writeDocument("red.mat.meta", JSON.stringify({summary:"Red",usage:"Use as a material"}));
  expect(edit.fileProvider().read("Notes/README.md")).toBe("# How to use");
  await expect(call("document.read", {path:"Notes/README.md"})).rejects.toThrow("Unknown native tool");
  expect(mutations).toBe(0);
  expect(before.documents).toBeUndefined();
  const undo = edit.captureUndo(before), saved = edit.finish();
  expect(saved.project.files).toEqual(before.project.files);
  expect(saved.documents!["Notes.meta"]).toBeUndefined();
  const restored = new RuntimeProjectEdit(saved, formats);
  restored.restore(undo);
  expect(restored.finish().documents).toEqual({});
});

it("rejects asset shadowing, orphan or malformed metadata and invalid document paths without changing the draft", () => {
  const edit = new RuntimeProjectEdit(source(), formats), before = edit.preview();
  for (const [path, content] of [["red.mat","shadow"],["missing.meta",'{"summary":"x","usage":"y"}'],["red.mat.meta","{}"],["../README.md","bad"],["red.mat/README.md","child"]]) {
    expect(() => edit.writeDocument(path, content), path).toThrow();
    expect(edit.preview()).toEqual(before);
  }
  expect(() => edit.readDocument("toString")).toThrow("Unknown document");
});


it("creates a registered domain asset through the native tool while retaining its separate live edit validation", async () => {
  const domain = {contentEncoding: "utf8" as const, validate: () => {throw new Error("Use component methods");}, validateCreate: (content: unknown) => {JSON.parse(content as string);}, references: () => []};
  const pack = source();
  pack.project.files.push({virtualPath:"saved.data",path:"saved",type:"CustomAuthoring"});
  pack.contents["saved.data"] = new TextEncoder().encode("{}");
  const edit = new RuntimeProjectEdit(pack, new Map([...formats, ["CustomAuthoring", domain]]));
  expect(edit.read("saved.data")).toBe("{}");
  const input = nativeToolSchemas["asset.create"].parse({path:"custom.json",type:"CustomAuthoring",content:"null"});
  await executeNativeProjectTool("asset.create", input, edit, async()=>{}, ()=>{}, new AbortController().signal);
  expect(edit.read("custom.json")).toBe("null");
  expect(()=>edit.update("custom.json", "{}")).toThrow("component methods");
  expect(()=>edit.create({virtualPath:"bad.json",path:"bad",type:"CustomAuthoring"},"invalid")).toThrow();
  expect(()=>edit.create({virtualPath:"missing.json",path:"missing",type:"Unregistered"},"{}")).toThrow("unsupported");
  expect(edit.list().map(file=>file.virtualPath)).toEqual(["main.scene","red.mat","saved.data","custom.json"]);
});

it("isolates mutable bytes, metadata and documents across source, preview and finished draft", () => {
  const original = source();
  original.project.files.push({virtualPath:"mesh.bin",path:"mesh.bin",type:"Mesh",dependencies:[],params:{nested:{value:1}}});
  original.contents["mesh.bin"] = new Uint8Array([1,2,3]).subarray(1);
  original.documents = {"notes.md":"before"};
  const edit = new RuntimeProjectEdit(original, formats);
  (original.contents["mesh.bin"] as Uint8Array)[0] = 8;
  (original.project.files[2].params!.nested as {value:number}).value = 8;
  original.documents["notes.md"] = "outside";
  const preview = edit.preview();
  expect(preview.contents["mesh.bin"]).toEqual(new Uint8Array([2,3]));
  (preview.contents["mesh.bin"] as Uint8Array)[0] = 9;
  (preview.project.files[2].params!.nested as {value:number}).value = 9;
  preview.documents!["notes.md"] = "preview";
  const result = edit.finish();
  expect(result.contents["mesh.bin"]).toEqual(new Uint8Array([2,3]));
  expect(result.project.files[2].params).toEqual({nested:{value:1}});
  expect(result.documents).toEqual({"notes.md":"before"});
});
