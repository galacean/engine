import { expect, it } from "vitest";
import { VirtualProjectFiles, type ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files.ts";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import { nativeAssetFormats } from "../src/project/runtime-native-formats";
import { importRuntimeAsset } from "../src/project/runtime-asset-import";
import { RUNTIME_PROJECT_SAVE_VERSION, runtimeProjectFiles, validateRuntimeProject, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";

const signal = new AbortController().signal;
const source = "library/Materials/Coral.mat";
function library(): ProjectFileProvider {
  const contents: Record<string, string> = {
    [source]: JSON.stringify({name: "Coral", shader: "Unlit", macros: [], shaderData: {}}),
    [`${source}.meta`]: JSON.stringify({name: "Coral.mat", type: "Material", summary: "珊瑚橙纯色材质，无需贴图，适合道具强调色。"}),
    "library/Materials.meta": JSON.stringify({name:"Materials", type:"Folder", summary:"材质目录"}),
    "library/README.md": "Material library"
  };
  const paths = Object.keys(contents);
  const loaded = new Map<string, string>();
  return { paths: () => paths, read: path => loaded.get(path), async prepare(path) {
    loaded.set(path, contents[path]);
  } };
}
function project(): RuntimeProjectPackage {
  return { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "main.scene", files: [
    {  virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: [] }
  ] }, contents: { "main.scene": JSON.stringify({ asset: { version: "2.0" }, entities: [], components: [] }) } };
}

it("discovers lazy source metadata without modifying the project, then imports content and docs together", async () => {
  const pack = project(), before = structuredClone(pack), provider = library();
  const files = new VirtualProjectFiles([runtimeProjectFiles(() => pack)]);
  expect((await files.listDirectory({ path: "", query: "橙" })).entries).toEqual([]);
  const libraryFiles = new VirtualProjectFiles([provider]);
  const results = await libraryFiles.listDirectory({ path: "library", query: "橙" });
  expect(results.entries).toEqual([{ path: source, kind: "file", summary: "珊瑚橙纯色材质，无需贴图，适合道具强调色。" }]);
  const meta = await libraryFiles.inspectFiles([`${source}.meta`]);
  expect(meta[0].content).toContain("Material");
  expect(pack).toEqual(before);
  const draft = new RuntimeProjectEdit(pack, nativeAssetFormats(() => ({})));
  const imported = await importRuntimeAsset(draft, [provider], { source, path: "Materials/Coral.mat", type: "Material" }, signal);
  expect(pack).toEqual(before); // still detached
  const undo = draft.captureUndo(pack);
  const committed = draft.finish();
  validateRuntimeProject(committed);
  const projectFiles = new VirtualProjectFiles([runtimeProjectFiles(() => committed)]);
  expect(JSON.parse(projectFiles.read("Materials/Coral.mat.meta"))).toMatchObject({...JSON.parse(meta[0].content!), name: "Coral.mat", type: "Material"});
  expect(projectFiles.read("Materials/Coral.mat")).toContain("Unlit");
  expect(committed.project.files.find(file => file.virtualPath === imported.path)?.virtualPath).toBe("Materials/Coral.mat");
  expect(committed.project.files.some(file => file.virtualPath.endsWith(".meta"))).toBe(false);
  expect(committed.contents["main.scene"]).toBe(before.contents["main.scene"]);
  expect((await projectFiles.listDirectory({ path: "" })).entries).toContainEqual({ path: "Materials", kind: "directory" });
  const reverting = new RuntimeProjectEdit(committed, nativeAssetFormats(() => ({})));
  reverting.restore(undo);
  const reverted = reverting.finish();
  expect(reverted.project).toEqual(before.project);
  expect(reverted.contents).toEqual(before.contents);
  expect(Object.keys(reverted.documents ?? {})).toEqual([]);
});

it("rejects invalid material content, duplicate destinations, cancellation and missing dependency imports", async () => {
  const draft = new RuntimeProjectEdit(project(), nativeAssetFormats(() => ({}))), provider = library();
  const input = { source, path: "Coral.mat", type: "Material" as const };
  await expect(importRuntimeAsset(draft, [{ paths: () => [source], read: () => "{}" }], input, signal)).rejects.toThrow("Material requires");
  expect(draft.list()).toHaveLength(1);
  const abort = new AbortController(); abort.abort();
  await expect(importRuntimeAsset(draft, [provider], input, abort.signal)).rejects.toThrow();
  const textured = { paths: () => [source, `${source}.meta`], read: (path: string) => path.endsWith(".meta") ? '{"summary":"x","usage":"x"}' : '{"name":"Missing","shader":"unlit","macros":[],"shaderData":{"texture":{"type":"Texture","value":{"url":"./missing.png"}}}}' };
  await expect(importRuntimeAsset(draft, [textured], input, signal)).rejects.toThrow("dependencies");
  await importRuntimeAsset(draft, [provider], input, signal);
  const snapshot = draft.preview();
  await expect(importRuntimeAsset(draft, [provider], input, signal)).rejects.toThrow("already exists");
  expect(draft.preview()).toEqual(snapshot);
});

it("deletes an imported asset and its sidecar without leaving orphan directory metadata", async () => {
  const draft = new RuntimeProjectEdit(project(), nativeAssetFormats(() => ({})));
  const imported = await importRuntimeAsset(draft, [library()], { source, path: "Materials/Coral.mat", type: "Material" }, signal);
  draft.delete(imported.path);
  expect(draft.finish().documents).toEqual({});
});

it("lists direct children, searches descendants and returns explicit pagination and binary descriptors", async () => {
  const contents: Record<string, string | Uint8Array> = { "assets/A.glb": new Uint8Array([1, 2]), "assets/A.glb.meta": '{"summary":"树","usage":"装饰"}', "assets/nested/B.txt": "text" };
  const files = new VirtualProjectFiles([{ paths: () => Object.keys(contents), read: path => contents[path] }]);
  const first = await files.listDirectory({ path: "assets/", limit: 1 });
  expect(first.total).toBe(3); expect(first.nextOffset).toBe(1);
  const last = await files.listDirectory({ path: "assets", offset: 2, limit: 1 });
  expect(last.entries[0].kind).toBe("directory"); expect(last.nextOffset).toBeNull();
  expect((await files.listDirectory({ path: "assets", query: "B.txt" })).entries[0].path).toBe("assets/nested/B.txt");
  expect(await files.inspectFiles(["assets/A.glb"])).toEqual([{ path: "assets/A.glb", kind: "binary", byteLength: 2, metadataPath: "assets/A.glb.meta" }]);
  await expect(files.listDirectory({ path: "../assets" })).rejects.toThrow("Invalid");
  await expect(files.listDirectory({ path: "missing" })).rejects.toThrow("Unknown directory");
});
