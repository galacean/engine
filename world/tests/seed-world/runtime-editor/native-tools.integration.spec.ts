import { RUNTIME_PROJECT_SAVE_VERSION } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { expect, it } from "vitest";
import { createAgentEditorFacade } from "@galacean/engine-ai-chat/ai-chat/agent-editor-facade.ts";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats.ts";
import { nativeProjectTools } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-tools.ts";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import { checkRuntimeScripts } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-compiler.ts";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";

function fixture(): RuntimeProjectPackage {
  return { version: RUNTIME_PROJECT_SAVE_VERSION, project: { scene: "main.scene", files: [
    {  virtualPath: "main.scene", path: "main.scene", type: "Scene" },
    {  virtualPath: "Scripts/main.ts", path: "main.ts", type: "script" },
    {  virtualPath: "Scripts/rate.ts", path: "rate.ts", type: "script" },
    {  virtualPath: "mesh.bin", path: "mesh.bin", type: "Buffer" }
  ] }, contents: {
    "main.scene": JSON.stringify({ asset: { version: "2.0" }, entities: [], components: [] }),
    "Scripts/main.ts": "import { speed } from './rate'; export const result = speed;",
    "Scripts/rate.ts": "export const speed = 90;",
    "mesh.bin": new Uint8Array([1, 2, 3])
  } };
}

it("rejects a missing material macro list before the Engine loader can fail", () => {
  const format = nativeAssetFormats(() => ({})).get("Material")!;
  expect(() => format.validate(JSON.stringify({ name: "Solid", shader: "Unlit", shaderData: {} }))).toThrow("macros");
  expect(() => format.validate(JSON.stringify({ name: "Solid", shader: "Unlit", shaderData: {}, macros: [] }))).not.toThrow();
});

it("protects imported script assets until their callers remove the import", async () => {
  let dependencies: Record<string, string[]> = {};
  const draft = new RuntimeProjectEdit(fixture(), nativeAssetFormats(() => dependencies));
  const tools = nativeProjectTools(() => draft, async () => {
    const sources = Object.fromEntries(draft.list().filter(file => file.type === "script")
      .map(file => [file.virtualPath, draft.read(file.virtualPath) as string]));
    dependencies = checkRuntimeScripts(sources, {}, {}, [], true).dependencies!;
  });
  const call = async (name: string, input: unknown) => {
    const tool = tools.find(tool => tool.name === name)!;
    return tool.execute(tool.parseInput(input), { signal: new AbortController().signal });
  };
  await expect(call("asset.references", { path: "Scripts/rate.ts" })).resolves.toEqual({ references: ["Scripts/main.ts"] });
  await expect(call("asset.delete", { path: "Scripts/rate.ts" })).rejects.toThrow("referenced by: Scripts/main.ts");
  await call("asset.update", { path: "Scripts/main.ts", content: "export const result = 90;" });
  await call("asset.delete", { path: "Scripts/rate.ts" });
  expect(draft.finish().project.files.some(file => file.virtualPath === "Scripts/rate.ts")).toBe(false);
});

it("returns typed text and rejects assets without a registered reader", async () => {
  const draft = new RuntimeProjectEdit(fixture(), nativeAssetFormats(() => ({})));
  const read = nativeProjectTools(() => draft, async () => {}).find(tool => tool.name === "asset.read")!;
  const context = { signal: new AbortController().signal };
  await expect(read.execute({ path: "Scripts/rate.ts" }, context)).resolves.toEqual({ path: "Scripts/rate.ts", type: "script", kind: "text", content: "export const speed = 90;" });
  await expect(read.execute({ path: "mesh.bin" }, context)).rejects.toThrow("Asset inspection unsupported for type 'Buffer'");
});

it("inspects water shader manifests and ordinary JSON candidate references", async () => {
  const { seedWorldProjectFormats } = await import("../../../demos/seed-world/SeedWorldProjectFormats");
  const pack = fixture();
  pack.project.files.push({  virtualPath: "aot.json", path: "aot.json", type: "JSON" });
  pack.contents["aot.json"] = JSON.stringify({ schema: "seed-world-water-shader-aot-v1", profiles: [{ virtualPath: "water.shader" }] });
  pack.project.files.push({  virtualPath: "water.shader", path: "water.shader", type: "Shader" });
  const sources = Object.fromEntries(pack.project.files.filter(file => file.type === "script")
    .map(file => [file.virtualPath, pack.contents[file.virtualPath] as string]));
  const dependencies = checkRuntimeScripts(sources, {}, {}, [], true).dependencies!;
  const draft = new RuntimeProjectEdit(pack, new Map([...nativeAssetFormats(() => dependencies), ...seedWorldProjectFormats]));
  expect(draft.references("water.shader")).toContain("aot.json");
  const format = seedWorldProjectFormats.get("JSON")!;
  expect(format.references('{"schema":"custom","candidate":{"$ref":"water.shader"}}', pack.project.files.at(-2)!)).toEqual(["water.shader"]);
});


it("component queries observe same-execute creation and deletion without marking reads as edits", async () => {
  const pack = fixture();
  pack.contents["main.scene"] = JSON.stringify({asset: {version: "2.0"}, scene: {rootEntities: []}, entities: [], components: []});
  const draft = new RuntimeProjectEdit(pack, nativeAssetFormats(() => ({})));
  let edits = 0;
  const tools = nativeProjectTools(() => draft, async () => {}, () => edits++);
  const call = async (name: string, input: unknown) => {
    const tool = tools.find(item => item.name === name)!;
    return tool.parseOutput(await tool.execute(tool.parseInput(input), {signal: new AbortController().signal})) as any;
  };
  const editor = createAgentEditorFacade([], call, tools.map(tool => tool.name));
  const entity = await editor.entity.create({scene: "main.scene", name: "light"}) as {id: string};
  const component = await editor.component.add({scene: "main.scene", entityId: entity.id, type: "DirectLight", props: {shadowStrength: 0.2}}) as {id: string};
  expect(await editor.component.query({scene: "main.scene", type: "DirectLight"})).toEqual([
    {scene: "main.scene", entityId: entity.id, id: component.id, type: "DirectLight"}
  ]);
  expect(await editor.component.read({scene: "main.scene", id: component.id})).toMatchObject({props: {shadowStrength: 0.2}});
  expect(edits).toBe(2);
  expect(tools.find(item => item.name === "component.query")!.effect).toBe("read");
  await editor.component.remove({scene: "main.scene", id: component.id});
  expect(await editor.component.query({scene: "main.scene"})).toEqual([]);
  expect(edits).toBe(3);
});
