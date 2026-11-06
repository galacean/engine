import { afterEach, expect, it, vi } from "vitest";
import { Scene, type Engine } from "@galacean/engine";
import { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { RuntimeScriptWorker } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-worker";
import {
  RuntimeProjectStorage,
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window ??= {};
});
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const pack: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "main.scene",
      files: [{ virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: [] }]
    },
    contents: {
      "main.scene": JSON.stringify({
        asset: { version: "2.0" },
        scene: { rootEntities: [], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
        entities: [],
        components: []
      })
    }
  };
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
    load: async () => structuredClone(pack),
    save: async () => {},
    close() {}
  } as never);
  vi.spyOn(RuntimeScriptWorker.prototype, "compile").mockResolvedValue({
    entries: {},
    files: {},
    dependencies: {}
  } as never);
  const project = await RuntimeProjectSession.open(crypto.randomUUID(), pack.project, "https://example.test/");
  const engine = {
    resourceManager: {
      _deleteAsset() {},
      _deleteContentRestorer() {},
      registerVirtualResources() {},
      getResourceByRef: async () => ({})
    }
  } as unknown as Engine;
  const scene = Object.assign(Object.create(Scene.prototype), {
    _engine: engine,
    _rootEntities: [],
    _isActiveInEngine: true,
    _componentsManager: { getActiveChangedTempList: () => [], putActiveChangedTempList() {} }
  }) as Scene;
  const editor = new RuntimeNativeEditor(project, scene, new Map());
  return { editor, signal: new AbortController().signal, dispose: () => (editor.dispose(), project.dispose()) };
}

it.each(["declare/x.txt", "declare/engine/manifest.json", "skills/a/SKILL.md", ".ai/x.txt", "project.json"])(
  "every write entry reports %s as read-only",
  async (path) => {
    const { editor, signal, dispose } = await fixture();
    try {
      const edit = editor.beginEdit("read-only", signal);
      await expect((async () => edit.documents!.write(path, "x"))()).rejects.toMatchObject({
        code: "READ_ONLY_PATH"
      });
      for (const [name, input] of [
        ["asset.create", { path, type: "JSON", content: "{}" }],
        ["asset.import", { source: "remote/Kit", path }]
      ] as const) {
        const tool = edit.tools.find((candidate) => candidate.name === name)!;
        await expect(tool.execute(tool.parseInput(input), { signal })).rejects.toMatchObject({
          code: "READ_ONLY_PATH",
          executed: false
        });
      }
    } finally {
      dispose();
    }
  }
);

it("still accepts project paths outside the read-only roots", async () => {
  const { editor, signal, dispose } = await fixture();
  try {
    const edit = editor.beginEdit("writable", signal);
    await expect(edit.documents!.write("Assets/notes.txt", "x")).resolves.toBeUndefined();
    const tool = edit.tools.find((candidate) => candidate.name === "asset.create")!;
    await expect(
      tool.execute(tool.parseInput({ path: "Assets/ok.json", type: "JSON", content: "{}" }), { signal })
    ).resolves.toBeDefined();
  } finally {
    dispose();
  }
});
