import { expect, it } from "vitest";
import { AgentProjectFiles, createAgentProjectFiles, projectDeclarationModules } from "../src/ai-chat/agent-project-files";

it("collects declarations with one namespace traversal and observes later provider edits", () => {
  const sources = new Map(Array.from({length: 100}, (_, i) => [`declare/editor/${i}.d.ts`, `export type T${i} = string;`]));
  sources.set("mounted/extra.d.ts", "export {};");
  let traversals = 0;
  const files = new AgentProjectFiles([{paths: () => { traversals++; return sources.keys(); }, read: path => sources.get(path)}]);
  const modules = [...sources].map(([path]) => ({id: path.replace(/^declare\/editor\//, ""), source: "stale", imports: []}));
  traversals = 0;
  expect(projectDeclarationModules(files, modules).map(module => module.source)).toEqual([...sources.values()]);
  expect(traversals).toBe(1);
  sources.set("declare/editor/0.d.ts", "export type T0 = number;");
  expect(projectDeclarationModules(files, modules)[0].source).toBe("export type T0 = number;");
  sources.delete("declare/editor/0.d.ts");
  expect(() => projectDeclarationModules(files, modules)).toThrow("Unknown project path");
});

it("reads current provider content without copying or caching assets", () => {
  const assets = new Map([["assets/world.scene", "before"]]);
  const files = new AgentProjectFiles([{ paths: () => assets.keys(), read: path => assets.get(path) }]);
  expect(files.read("assets/world.scene")).toBe("before");
  assets.set("assets/world.scene", "after");
  expect(files.read("assets/world.scene")).toBe("after");
  assets.delete("assets/world.scene");
  expect(() => files.read("assets/world.scene")).toThrow("Unknown project path");
});

it("feeds readers and checker from the same declaration source", () => {
  const catalog = { catalog: "guide", entries: [], modules: [
    { id: "declare/api.d.ts", source: "export type A = string;", imports: [] }
  ] };
  const files = createAgentProjectFiles(catalog);
  catalog.modules[0].source = "export type A = number;";
  expect(projectDeclarationModules(files, catalog.modules)[0].source).toBe(files.read("declare/editor/api.d.ts"));
});

it("rejects ambiguous mounts and noncanonical paths", () => {
  const provider = { paths: () => ["a"], read: (path: string) => path === "a" ? "" : undefined };
  expect(() => new AgentProjectFiles([provider, provider])).toThrow("Path already exists");
  const files = new AgentProjectFiles([provider]);
  for (const path of ["../a", "/a", "a//b", "a/./b", "a\\b"]) expect(() => files.read(path)).toThrow("Invalid");
});

it("loads requested provider content on demand and stops after cancellation", async () => {
  const content = new Map<string, string>();
  const loaded: string[] = [];
  const files = new AgentProjectFiles([{
    paths: () => ["assets/a", "assets/b"],
    read: path => content.get(path),
    prepare: async path => { loaded.push(path); content.set(path, "loaded"); }
  }]);
  expect(await files.readFilesAsync(["assets/a"])).toEqual([{ path: "assets/a", content: "loaded" }]);
  expect(loaded).toEqual(["assets/a"]);
  const controller = new AbortController(); controller.abort();
  await expect(files.readFilesAsync(["assets/b"], controller.signal)).rejects.toThrow();
  expect(loaded).toEqual(["assets/a"]);
});
