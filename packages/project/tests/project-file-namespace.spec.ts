import { expect, it } from "vitest";
import { assertProjectPath, parentDirectories, VirtualProjectFiles } from "../src/project-files/virtual-project-files";

it("preserves path validation for dot segments, empty segments, Unicode and line breaks", () => {
  const segments = ["", ".", "..", "...", "name", ".meta", "中文", "\n", ".\n", "..\n", "\\"];
  for (const a of segments)
    for (const b of segments)
      for (const path of [a, `${a}/${b}`, `root/${a}/${b}/leaf`]) {
        const invalid =
          !path || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..");
        if (invalid) expect(() => assertProjectPath(path)).toThrow("Invalid project path");
        else expect(() => assertProjectPath(path)).not.toThrow();
        const parts = path.split("/");
        expect(parentDirectories(path)).toEqual(parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/")));
      }
  for (const path of [null, undefined, 12, {}]) expect(() => assertProjectPath(path as string)).toThrow();
});

it("shares directory nodes but still rejects duplicate files and file/directory collisions in either mount order", () => {
  const mount = (paths: string[], directories: string[] = []) => ({
    paths: () => paths,
    directories: () => directories,
    read: () => "text"
  });
  const files = new VirtualProjectFiles([mount(["a/b/c", "a/b/d"], ["a", "a/b"]), mount(["a/e"], ["a/b"])]);
  expect(files.list()).toEqual(["a/b/c", "a/b/d", "a/e"]);
  expect(files.directories()).toEqual(["a", "a/b"]);
  for (const pair of [
    [mount(["a"]), mount(["a/b"])],
    [mount(["a/b"]), mount(["a"])],
    [mount(["a"]), mount([], ["a/b"])],
    [mount(["a"]), mount(["a"])]
  ])
    expect(() => new VirtualProjectFiles(pair)).toThrow("Path already exists");
  expect(() => new VirtualProjectFiles([mount([], ["a/../b"])])).toThrow("Invalid project path");
});

it("validates a fresh namespace on each operation, including new conflicts after a successful read", () => {
  const paths = ["a/b"];
  const files = new VirtualProjectFiles([{ paths: () => paths, read: () => "text" }]);
  expect(files.read("a/b")).toBe("text");
  paths.push("a");
  expect(() => files.read("a/b")).toThrow("Path already exists");
  paths.pop();
  paths[0] = "other/file";
  expect(files.list()).toEqual(["other/file"]);
});
