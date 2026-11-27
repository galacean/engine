import { describe, expect, it } from "vitest";
import { assertProjectPathWritable, ProjectPathReadOnlyError } from "../src/project-files/virtual-project-files";
import { RuntimeProjectEdit } from "../src/runtime-editor/project/runtime-project-edit";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  validateRuntimeProject,
  type RuntimeProjectPackage
} from "../src/runtime-editor/project/runtime-project";

const project = (documents: Record<string, string> = {}): RuntimeProjectPackage => ({
  version: RUNTIME_PROJECT_SAVE_VERSION,
  project: {
    scene: "main.scene",
    files: [{ virtualPath: "main.scene", path: "main.scene", type: "Scene", dependencies: [] }]
  },
  contents: { "main.scene": "{}" },
  documents
});

describe("project write boundary", () => {
  it("tracks successful asset writes, removals and restores but not reads or rejected writes", () => {
    const initial = project();
    const file = { virtualPath: "data.json", path: "data.json", type: "JSON", dependencies: [] };
    initial.project.files.push(file);
    initial.contents[file.virtualPath] = "{}";
    const draft = new RuntimeProjectEdit(
      initial,
      new Map([
        [
          "JSON",
          {
            validate: (value) => {
              JSON.parse(value as string);
            },
            references: () => []
          }
        ],
        ["Scene", { validate: () => {}, references: () => [] }]
      ])
    );
    draft.read(file.virtualPath);
    expect(() => draft.update(file.virtualPath, "invalid")).toThrow();
    expect(draft.changedAssetPaths()).toEqual([]);
    draft.delete(file.virtualPath);
    expect(draft.changedAssetPaths()).toEqual([file.virtualPath]);
    draft.restore([{ path: file.virtualPath, file, content: "{}" }]);
    draft.update("main.scene", '{"updated":true}');
    expect(draft.changedAssetPaths()).toEqual([file.virtualPath, "main.scene"]);
    expect(draft.read(file.virtualPath)).toBe("{}");
  });
  it.each([
    "declare",
    "declare.meta",
    "declare/x.txt",
    "declare/engine/manifest.json",
    "skills/a/SKILL.md",
    ".ai/x.txt",
    "remote/x.txt",
    "project.json"
  ])("rejects %s with a read-only code", (path) => {
    expect(() => assertProjectPathWritable(path)).toThrow(ProjectPathReadOnlyError);
    try {
      assertProjectPathWritable(path);
    } catch (error) {
      expect((error as ProjectPathReadOnlyError).code).toBe("READ_ONLY_PATH");
    }
  });

  it.each(["Assets/manifest.json", "declare-notes/x.txt", "notes/declare/x.txt"])("allows %s", (path) => {
    expect(() => assertProjectPathWritable(path)).not.toThrow();
  });

  it("stops new assets and documents under declare/", () => {
    const draft = new RuntimeProjectEdit(project(), new Map());
    expect(() => draft.assertDestination("declare/engine/manifest.json")).toThrow("Read-only path");
    expect(() => draft.writeDocument("declare/notes.md", "x")).toThrow("Read-only path");
    expect(() => draft.writeDocument("notes.md", "x")).not.toThrow();
  });

  it.each(["declare/old.md", "declare/native/api.d.ts", "declare/editor/native/api.d.ts"])(
    "rejects a project package containing %s",
    (path) => {
      expect(() => new RuntimeProjectEdit(project({ [path]: "export {};" }), new Map())).toThrow(
        "Invalid runtime asset path"
      );
    }
  );

  it("rejects a package saved with the previous version", () => {
    const previous = { ...project(), version: RUNTIME_PROJECT_SAVE_VERSION - 1 } as unknown as RuntimeProjectPackage;
    expect(() => validateRuntimeProject(previous)).toThrow();
  });
});

it("retains structured Scene journals in explicit undo and invalidates mismatched history hints", () => {
  const initial = project();
  const formats = new Map([
    [
      "Scene",
      {
        validate: (content: unknown) => {
          JSON.parse(content as string);
        },
        references: () => []
      }
    ]
  ]);
  const draft = new RuntimeProjectEdit(initial, formats);
  draft.update("main.scene", '{"edited":true}', { components: ["a"] });
  const patch = draft.captureUndo(initial);
  expect(patch[0]).toMatchObject({ sceneChanges: { fromContent: '{"edited":true}', components: ["a"] } });
  const restored = new RuntimeProjectEdit(draft.preview(), formats);
  restored.restore(patch);
  expect(restored.sceneChangeSets()["main.scene"]).toMatchObject({
    before: '{"edited":true}',
    after: "{}",
    components: ["a"]
  });
  const raw = new RuntimeProjectEdit(initial, formats);
  raw.update("main.scene", '{"different":true}');
  raw.restore(patch);
  expect(raw.sceneChangeSets()).toEqual({});
  const saved = draft.sceneChangeSets();
  saved["main.scene"].components.push("fake");
  expect(draft.sceneChangeSets()["main.scene"].components).toEqual(["a"]);
  // An accepted raw no-op introduces no unknown changes.
  draft.update("main.scene", draft.read("main.scene"));
  expect(draft.sceneChangeSets()["main.scene"].components).toEqual(["a"]);
});
