import { vi } from "vitest";
import { Scene, type Engine } from "@galacean/engine";
import { RuntimeNativeEditor } from "../src/runtime-editor-agent/runtime-native-editor";
import { RuntimeProjectSession } from "../src/project/runtime-project-session";
import { RuntimeProjectStorage, RUNTIME_PROJECT_SAVE_VERSION, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { RuntimeScriptWorker } from "../src/runtime-editor/scripts/runtime-script-worker";
import type { RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";

export async function historyFixture(formats: ReadonlyMap<string, RuntimeAssetFormat> = new Map()) {
  const source = {asset: {version: "2.0"}, scene: {rootEntities: [], background: {mode: 0, color: {r: 0, g: 0, b: 0, a: 1}}}, entities: [], components: []};
  const pack: RuntimeProjectPackage = {version: RUNTIME_PROJECT_SAVE_VERSION, project: {scene: "main.scene", files: [
    {virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: []}
  ]}, contents: {"main.scene": JSON.stringify(source)}};
  const save = vi.fn(async () => {});
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({load: async () => structuredClone(pack), save, close() {}} as any);
  vi.spyOn(RuntimeScriptWorker.prototype, "compile").mockResolvedValue({entries: {}, files: {}, dependencies: {}} as any);
  const project = await RuntimeProjectSession.open(crypto.randomUUID(), pack.project, "https://example.test/");
  const engine = {resourceManager: {_deleteAsset() {}, _deleteContentRestorer() {}, registerVirtualResources() {}, getResourceByRef: async () => ({})}} as unknown as Engine;
  const scene = Object.assign(Object.create(Scene.prototype), {_engine: engine, _rootEntities: [], _isActiveInEngine: true,
    _componentsManager: {getActiveChangedTempList: () => [], putActiveChangedTempList() {}}
  }) as Scene;
  const editor = new RuntimeNativeEditor(project, scene, formats);
  const signal = new AbortController().signal;
  const invoke = async (edit: ReturnType<typeof editor.beginEdit>, name: string, input: unknown) => {
    const tool = edit.tools.find(tool => tool.name === name)!;
    return tool.execute(tool.parseInput(input), {signal});
  };
  const commit = async (edit: ReturnType<typeof editor.beginEdit>) => { await edit.prepare(signal); const receipt = await edit.commit(); await edit.activate(signal); return receipt; };
  return {project, editor, scene, save, signal, invoke, commit, dispose() {editor.dispose(); project.dispose();}};
}
