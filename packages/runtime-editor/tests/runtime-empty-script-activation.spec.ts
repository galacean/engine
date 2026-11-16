import { afterEach, expect, it, vi } from "vitest";
vi.hoisted(() => {
  (globalThis as any).window ??= {};
});
import { historyFixture } from "./runtime-history-fixture";

afterEach(() => vi.restoreAllMocks());

it("releases the previous script graph without preparing assets when the last script is removed", async () => {
  const f = await historyFixture();
  try {
    const dispose = vi.fn();
    const scripts = (f.project as any).scripts;
    scripts.modules = { dispose };
    const resources = vi.spyOn(f.project, "resources");
    expect(await f.project.scriptClasses({}, f.signal)).toEqual(new Map());
    expect(resources).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scripts.modules).toBeUndefined();
    expect(scripts.preparedCompilation).toBeUndefined();

    f.project.projectPackage.project.files.push({
      virtualPath: "Behavior.ts",
      path: "Behavior.ts",
      type: "script"
    });
    const source = JSON.parse(f.project.projectPackage.contents["main.scene"] as string);
    source.scene.rootEntities = ["root"];
    source.entities = [{ id: "root", components: ["behavior"] }];
    source.components = [{ id: "behavior", type: "Script", script: { $ref: "Behavior.ts" } }];
    f.project.projectPackage.contents["main.scene"] = JSON.stringify(source);
    resources.mockRejectedValue(new Error("asset preparation required"));
    await expect(f.project.scriptClasses({}, f.signal)).rejects.toThrow("asset preparation required");
    expect(resources).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});

it("honors cancellation even when no scripts need assets", async () => {
  const f = await historyFixture();
  try {
    const controller = new AbortController();
    controller.abort("cancelled");
    await expect(f.project.scriptClasses({}, controller.signal)).rejects.toBe("cancelled");
  } finally {
    f.dispose();
  }
});

it("reuses parsed script references while validating the current namespace and source", async () => {
  const { projectComponentScripts } = await import("../src/runtime-editor/scripts/runtime-project-scripts");
  const f = await historyFixture();
  try {
    const pack = f.project.projectPackage;
    pack.project.files.push({ virtualPath: "A.ts", path: "A.ts", type: "script" });
    const source = JSON.parse(pack.contents["main.scene"] as string);
    source.scene.rootEntities = ["root"];
    source.entities = [{ id: "root", components: ["script"] }];
    source.components = [{ id: "script", type: "Script", script: { $ref: "A.ts" } }];
    pack.contents["main.scene"] = JSON.stringify(source);
    const parse = vi.spyOn(JSON, "parse");
    expect(projectComponentScripts(pack)).toEqual(["A.ts"]);
    const calls = parse.mock.calls.length;
    pack.project.files.push({ virtualPath: "World/Editor.json", path: "editor", type: "JSON" });
    const result = projectComponentScripts(pack);
    result.length = 0;
    expect(projectComponentScripts(pack)).toEqual(["A.ts"]);
    expect(parse.mock.calls.length).toBe(calls);
    pack.project.files.push({ virtualPath: "A.ts", path: "duplicate", type: "JSON" });
    expect(() => projectComponentScripts(pack)).toThrow("Invalid component script reference");
    pack.project.files.pop();
    pack.project.files[1].type = "JSON";
    expect(() => projectComponentScripts(pack)).toThrow("Invalid component script reference");
    pack.project.files[1].type = "script";
    source.components[0].script.$ref = "missing.ts";
    pack.contents["main.scene"] = JSON.stringify(source);
    expect(() => projectComponentScripts(pack)).toThrow("missing.ts");
  } finally {
    f.dispose();
  }
});
