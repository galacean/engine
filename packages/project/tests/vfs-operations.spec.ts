import {expect, it, vi} from "vitest";
import {configuredProjectFiles, mountProjectFiles, VirtualProjectFiles} from "../src/project-files/virtual-project-files";

it("loads only the requested page metadata when listing without a query", async () => {
  const loaded: string[] = [];
  const files = new VirtualProjectFiles([configuredProjectFiles({files: Array.from({length: 10}, (_, i) => [
    {path: `${i}.txt`, content: "text"},
    {path: `${i}.txt.meta`, load: async () => { loaded.push(String(i)); if (i === 9) throw new Error("offline"); return JSON.stringify({summary: `item ${i}`}); }}
  ]).flat()})]);
  expect(await files.listDirectory({path: "", limit: 1})).toEqual({entries: [{path: "0.txt", kind: "file", summary: "item 0"}], total: 20, nextOffset: 1});
  expect(loaded).toEqual(["0"]);
  await expect(files.listDirectory({path: "", query: "item"})).rejects.toThrow("offline");
});

it("enumerates each provider once per operation, including summary search and batched reads", async () => {
  const source = configuredProjectFiles({files: Array.from({length: 100}, (_, i) => ({path: `${i}.mesh`, content: "text", summary: "target"}))});
  const paths = vi.fn(() => source.paths());
  const files = new VirtualProjectFiles([{...source, paths}]);
  paths.mockClear();
  expect((await files.listDirectory({path: "", query: "target", limit: 1})).total).toBe(100);
  expect(paths).toHaveBeenCalledTimes(1);
  paths.mockClear();
  expect(await files.readFilesAsync(["0.mesh", "1.mesh"])).toHaveLength(2);
  expect(paths).toHaveBeenCalledTimes(1);
});

it("observes additions, removals and updated summaries on the next operation", async () => {
  const content = new Map([["a.txt", "a"], ["a.txt.meta", '{"summary":"before"}']]);
  const files = new VirtualProjectFiles([{paths: () => content.keys(), read: path => content.get(path)}]);
  expect((await files.listDirectory({path: "", query: "before"})).total).toBe(1);
  content.set("a.txt.meta", '{"summary":"after"}');
  content.set("b.txt", "b");
  expect((await files.listDirectory({path: "", query: "before"})).total).toBe(0);
  expect((await files.listDirectory({path: "", query: "after"})).total).toBe(1);
  expect(files.read("b.txt")).toBe("b");
  content.delete("b.txt");
  expect(() => files.read("b.txt")).toThrow("Unknown");
});

it("lets a pending browser-style cancellation interrupt a large cached summary search", async () => {
  const source = mountProjectFiles("remote", configuredProjectFiles({files: Array.from({length: 5000}, (_, i) => ({path: `${i}.mesh`, content: "text", summary: "match"}))}));
  const files = new VirtualProjectFiles([source]);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 0);
  try { await expect(files.listDirectory({path: "remote", query: "match"}, controller.signal)).rejects.toThrow(); }
  finally { clearTimeout(timer); }
});

it.each([
  ["Model.glb", "GLTF"], ["Picture.PNG", "Texture"], ["Photo.jpg", "Texture"],
  ["Surface.mat", "Material"], ["Cube.mesh", "PrimitiveMesh"], ["Object.prefab", "Prefab"],
  ["main.scene", "Scene"], ["Walk.animctrl", "AnimatorController"], ["Run.ts", "script"],
  ["README.md", "Document"], ["types.d.ts", "Document"], ["constructor", "Document"]
])("describes %s with its inferred type %s", (path, type) => {
  const files = new VirtualProjectFiles([configuredProjectFiles({files:[{path, content:"content"}]})]);
  if (type === "Document") expect(files.kind(`${path}.meta`)).toBeUndefined();
  else expect(JSON.parse(files.read(`${path}.meta`))).toMatchObject({name:path, type});
});
