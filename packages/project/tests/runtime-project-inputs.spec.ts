import { describe, expect, it } from "vitest";
import { RuntimeProjectInputs } from "../src/runtime-editor/project/runtime-project-inputs";
import { sameRuntimeProjectContent } from "../src/runtime-editor/project/runtime-project-content";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "../src/runtime-editor/project/runtime-project";

function fixture(): RuntimeProjectPackage {
  return {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "scene",
      files: [
        { virtualPath: "scene", path: "scene", type: "Scene", dependencies: ["prefab"] },
        { virtualPath: "prefab", path: "prefab", type: "Prefab", dependencies: ["buffer"] },
        { virtualPath: "buffer", path: "buffer", type: "Buffer", dependencies: [] },
        { virtualPath: "editor", path: "editor", type: "Editor", dependencies: [] }
      ]
    },
    contents: { scene: "scene", prefab: "prefab", buffer: new Uint8Array([1, 2, 3]), editor: "time:1" },
    documents: { "scene.meta": "{}" }
  };
}

describe("project input scopes", () => {
  it("excludes unrelated content but follows nested resource dependencies", () => {
    const pack = fixture(),
      inputs = new RuntimeProjectInputs(pack, { rootTypes: ["Scene"] });
    pack.contents.editor = "time:2";
    expect(inputs.matches(pack)).toBe(true);
    (pack.contents.buffer as Uint8Array)[2] = 4;
    expect(inputs.matches(pack)).toBe(false);
  });
  it.each(["delete", "type", "path", "params", "sidecar", "root", "prefab"])("invalidates %s edits", (kind) => {
    const pack = fixture(),
      inputs = new RuntimeProjectInputs(pack, { rootTypes: ["Scene"] });
    if (kind === "delete") pack.project.files.splice(2, 1);
    if (kind === "type") pack.project.files[2].type = "JSON";
    if (kind === "path") pack.project.files[2].path = "new-url";
    if (kind === "params") pack.project.files[2].params = { url: "different" };
    if (kind === "sidecar") pack.documents!["scene.meta"] = '{"removed":true}';
    if (kind === "root") pack.project.scene = "other";
    if (kind === "prefab") pack.contents.prefab = "changed";
    expect(inputs.matches(pack)).toBe(false);
  });
  it("falls back to all content for unknown dependencies and detects changed dependency membership", () => {
    const pack = fixture();
    delete pack.project.files[1].dependencies;
    const inputs = new RuntimeProjectInputs(pack, { rootTypes: ["Scene"] });
    pack.contents.editor = "time:2";
    expect(inputs.matches(pack)).toBe(false);
    const complete = fixture(),
      known = new RuntimeProjectInputs(complete, { rootTypes: ["Scene"] });
    complete.project.files[1].dependencies!.push("editor");
    expect(known.matches(complete)).toBe(false);
  });
  it("owns binary snapshots and includes newly hydrated bytes", () => {
    const pack = fixture();
    delete pack.contents.buffer;
    const inputs = new RuntimeProjectInputs(pack, { rootTypes: ["Scene"] });
    pack.contents.buffer = new Uint8Array([1]);
    expect(inputs.matches(pack)).toBe(false);
  });
  it("compares sliced buffers exactly, including last-byte differences", () => {
    const a = new Uint8Array([9, 1, 2, 8]).subarray(1, 3),
      b = new Uint8Array([1, 2]);
    expect(sameRuntimeProjectContent(a, b)).toBe(true);
    b[1] = 3;
    expect(sameRuntimeProjectContent(a, b)).toBe(false);
    expect(sameRuntimeProjectContent(a, b.subarray(0, 1))).toBe(false);
    expect(sameRuntimeProjectContent("1,2", a)).toBe(false);
  });
});

it("compares every byte in aligned slices, including partial final words", () => {
  for (const length of [4, 5, 6, 7, 8, 31, 32, 33]) {
    const buffer = Uint8Array.from({ length: length + 8 }, (_, i) => i);
    const a = buffer.subarray(4, 4 + length),
      b = new Uint8Array(a);
    expect(sameRuntimeProjectContent(a, b)).toBe(true);
    for (const index of [0, Math.floor(length / 2), length - 1]) {
      b[index] ^= 255;
      expect(sameRuntimeProjectContent(a, b)).toBe(false);
      b[index] ^= 255;
    }
    buffer[0] ^= 255;
    expect(sameRuntimeProjectContent(a, b)).toBe(true);
  }
});
