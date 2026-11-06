import { describe, expect, it } from "vitest";
import { assertProjectPathWritable, ProjectPathReadOnlyError } from "../src/project-files/virtual-project-files";
import { RuntimeProjectEdit } from "../src/runtime-editor/project/runtime-project-edit";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
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

  it("still opens a saved project that already has a file under declare/", () => {
    const draft = new RuntimeProjectEdit(project({ "declare/old.md": "kept" }), new Map());
    expect(draft.readDocument("declare/old.md")).toBe("kept");
  });
});
