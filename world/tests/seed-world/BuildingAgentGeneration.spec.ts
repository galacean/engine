import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { createSeedWorldBuildingTools } from "../../demos/seed-world/agent-adapter/tools/building-tools";
import { European } from "@galacean/engine-building/building/parts/architecture/European.ts";
import { buildingDraftSource } from "@galacean/engine-building/building/parts/architecture/BuildingSource.ts";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats.ts";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit.ts";
import { compileProjectResource } from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler.ts";
import { executeNativeProjectTool, nativeToolSchemas } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-tools.ts";

const tool = createSeedWorldBuildingTools()[0];
const source = { id: "frame", assetLibrary: "Building/Kit.prefab" };
const signal = new AbortController().signal;
const invoke = async (input: unknown) =>
  tool.parseOutput(await tool.execute(tool.parseInput(input), { signal })) as { content: string };

it.each([
  ["buildHouses", [{ id: "a" }, { id: "b", height: 5 }]],
  ["buildTower", { id: "tower", height: 9, circle: { center: [0, 0], radius: 2.5, phase: 0 } }],
  ["buildWall", { id: "wall", length: 5 }],
  ["buildFence", { id: "fence", height: 2 }],
  ["buildSteps", { id: "steps", width: 2, rise: 0.2, run: 0.4, count: 5 }]
] as const)("transports %s through the native generator with author-only Source", async (name, parameters) => {
  const result = await invoke({ generator: `European.${name}`, parameters, source });
  const build = European[name] as (p: any) => ReturnType<typeof European.buildHouses>;
  const expected = buildingDraftSource(build(parameters), source);
  const prefab = JSON.parse(result.content);
  const format = nativeAssetFormats(() => ({})).get("Prefab")!;
  expect(() => format.validate(result.content)).not.toThrow();
  expect(prefab).toEqual({
    asset: { version: "2.0" },
    root: expected.rootEntities[0],
    entities: expected.entities,
    components: expected.components
  });
  expect(
    JSON.parse(result.content).components.every((c: any) =>
      ["BuildingPartComponent", "BuildingGroupComponent"].includes(c.type)
    )
  ).toBe(true);
  expect(tool.effect).toBe("read");
});

it("rejects malformed or cancelled transport requests instead of publishing a partial building", async () => {
  const request = { generator: "European.buildTower", parameters: { id: "tower", height: -1 }, source };
  await expect(invoke(request)).rejects.toThrow();
  await expect(invoke({ ...request, generator: "European.unknown" })).rejects.toThrow();
  await expect(invoke({ ...request, parameters: [{ id: "tower" }] })).rejects.toThrow("Only");
  await expect(invoke({ ...request, parameters: { id: "tower", height: Infinity } })).rejects.toThrow();
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    tool.execute(tool.parseInput({ ...request, parameters: { id: "tower" } }), { signal: cancelled.signal })
  ).rejects.toThrow();
});

it("creates generated Prefabs through the editor and persists isolated instance edits with undo", async () => {
  const result = await invoke({
    generator: "European.buildTower",
    parameters: { id: "tower", height: 9, circle: { center: [0, 0], radius: 2.5, phase: 0 } },
    source
  });
  let original: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "Main.scene",
      files: [
        { virtualPath: "Main.scene", path: "Main.scene", type: "Scene" },
        { virtualPath: source.assetLibrary, path: source.assetLibrary, type: "Prefab" }
      ]
    },
    contents: {
      "Main.scene": JSON.stringify({
        asset: { version: "2.0" },
        scene: { rootEntities: [], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
        entities: [],
        components: []
      }),
      [source.assetLibrary]: JSON.stringify({
        asset: { version: "2.0" },
        root: "kit",
        entities: [{ id: "kit" }],
        components: []
      })
    }
  };
  const formats = nativeAssetFormats(() => ({}));
  // Start from a published package with the editor's canonical dependency metadata.
  original = new RuntimeProjectEdit(original, formats).finish();
  const edit = new RuntimeProjectEdit(original, formats);
  const request = nativeToolSchemas["asset.create"].parse({
    path: "Tower.prefab",
    type: "Prefab",
    content: result.content
  });
  await executeNativeProjectTool(
    "asset.create",
    request,
    edit,
    async () => {},
    () => {},
    signal
  );
  const scene = new RuntimeSceneEdit(edit, "Main.scene");
  const a = scene.create({ name: "A", prefab: "Tower.prefab", position: [512, 0, 512] });
  const b = scene.create({ name: "B", prefab: "Tower.prefab", position: [520, 0, 512] });
  const wall = (root: string) =>
    scene
      .queryComponents({ type: "BuildingPartComponent" })
      .find((c) => c.id.includes(root) && (scene.readComponent(c.id).props!.definition as any).type === "wall")!;
  const aWall = wall(a.id),
    bWall = wall(b.id);
  expect(aWall).toBeDefined();
  expect(bWall).toBeDefined();
  const definition = scene.readComponent(aWall.id).props!.definition as any;
  definition.support.params.height = 10;
  scene.updateComponent(aWall.id, { definition });
  expect((scene.readComponent(bWall.id).props!.definition as any).support.params.height).toBe(9);
  // The exact tool output is accepted; no repair of asset/root or copied parts.
  expect(edit.read("Tower.prefab")).toBe(result.content);
  const undo = edit.captureUndo(original);
  const saved = edit.finish();
  expect(() => compileProjectResource(saved, "Main.scene")).not.toThrow();
  const reloaded = new RuntimeProjectEdit(JSON.parse(JSON.stringify(saved)), formats);
  const restoredScene = new RuntimeSceneEdit(reloaded, "Main.scene");
  expect(restoredScene.queryComponents({ type: "BuildingPartComponent" })).toHaveLength(4);
  expect((restoredScene.readComponent(aWall.id).props!.definition as any).support.params.height).toBe(10);
  expect((restoredScene.readComponent(bWall.id).props!.definition as any).support.params.height).toBe(9);
  reloaded.restore(undo);
  const undone = reloaded.finish();
  expect(undone.contents).toEqual(original.contents);
  expect(undone.project.scene).toBe(original.project.scene);
  // Asset manifest order is not Scene root order; restore may reinsert changed files.
  const filesByPath = (pack: RuntimeProjectPackage) =>
    Object.fromEntries(pack.project.files.map((file) => [file.virtualPath, file]));
  expect(filesByPath(undone)).toEqual(filesByPath(original));
});

it("keeps the requested Prefab root independent of generated part identities", async () => {
  const output = await invoke({
    generator: "European.buildHouses",
    parameters: { id: "house" },
    source: { id: "house-wall", assetLibrary: "Units/kit.prefab" }
  });
  const source = JSON.parse(output.content);
  expect(source.root).toBe("house-wall");
  expect(new Set([...source.entities, ...source.components].map((v: any) => v.id)).size).toBe(
    source.entities.length + source.components.length
  );
});
