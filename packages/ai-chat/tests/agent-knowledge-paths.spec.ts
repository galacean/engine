import { expect, it, vi, afterEach } from "vitest";
import { canonicalKnowledgePaths } from "../src/ai-chat/agent-knowledge-paths";
import { createAgentProjectFiles } from "../src/ai-chat/agent-project-files";
import { AgentNativeFiles } from "../src/ai-chat/agent-native-files";
import { TestWorker } from "../../project/tests/TestRegexWorker";
import { contentView } from "@galacean/engine-project/project-files/project-file-view.ts";

afterEach(() => vi.unstubAllGlobals());

it("publishes relative, parent and already canonical references without changing code or external links", () => {
  const source = [
    "[Guide](guide.md)",
    '[**API**](../declare/api.d.ts "contract")',
    "[Canonical](editor/declare/api.d.ts)",
    "[Reference][api:read]",
    "",
    "[api:read]: ../declare/api.d.ts",
    "",
    "Read `../declare/api.d.ts`.",
    "[Web](https://example.com/guide.md) [Anchor](#local) [Missing](absent.md)",
    "![image](guide.md)",
    "```ts",
    'import "../declare/api.d.ts"; // [example](guide.md)',
    "```"
  ].join("\n");
  const paths = new Set(["editor/docs/guide.md", "editor/declare/api.d.ts"]);
  const published = canonicalKnowledgePaths(source, "editor/docs/README.md", paths);
  expect(published).toContain("[Guide](<editor/docs/guide.md>)");
  expect(published).toContain('[**API**](<editor/declare/api.d.ts> "contract")');
  expect(published).toContain("[Canonical](editor/declare/api.d.ts)");
  expect(published).toContain("[api:read]: <editor/declare/api.d.ts>");
  expect(published).toContain("Read `editor/declare/api.d.ts`.");
  for (const line of source.split("\n").slice(8)) expect(published).toContain(line);
  expect(canonicalKnowledgePaths(published, "editor/docs/README.md", paths)).toBe(published);
});

it("handles escaped labels, titles and empty links while rejecting traversal above the project", () => {
  const source = '[a\\]b](a.md "a \\"title\\"") [](a.md) [../](../../../outside.md)';
  const result = canonicalKnowledgePaths(source, "editor/docs/README.md", new Set(["editor/docs/a.md", "outside.md"]));
  expect(result).toBe('[a\\]b](<editor/docs/a.md> "a \\"title\\"") [](<editor/docs/a.md>) [../](../../../outside.md)');
});

it("exposes identical canonical knowledge to native read and grep and keeps editable files and declarations byte-exact", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const catalog = {
    hostNotes: "host",
    entries: [],
    documents: [{ path: "skills/world/README.md", content: "[Create](../../declare/editor/create.d.ts)" }],
    modules: [
      { id: "declare/create.d.ts", source: 'import "./Target";', imports: [] },
      { id: "components/Example.d.ts", source: "export {};", imports: [] }
    ]
  };
  const authored = "[World](skills/world/README.md)";
  const files = createAgentProjectFiles(catalog, [
    {
      paths: () => ["notes.md", "skills/runtime/README.md"],
      read: (path) =>
        path === "notes.md"
          ? authored
          : path === "skills/runtime/README.md"
            ? "[API](../../declare/editor/create.d.ts)"
            : undefined,
      open: async (path) => contentView(path === "notes.md" ? authored : "[API](../../declare/editor/create.d.ts)")
    }
  ]);
  const api = new AgentNativeFiles(
    () => files,
    () => ({ scriptApi: catalog, toolNames: [] }),
    new Map(),
    () => "unused"
  );
  const call = (name: "read" | "grep", input: Record<string, unknown>) =>
    api.execute(name, input, "call", new AbortController().signal);
  const guide = await call("read", { file_path: "skills/world/README.md" });
  expect(guide.content).toContain("[Create](<declare/editor/create.d.ts>)");
  expect((await call("read", { file_path: "declare/editor/create.d.ts" })).result.ok).toBe(true);
  const search = await call("grep", { pattern: "declare/editor/create", path: "skills", include: "*.md" });
  expect(search.result).toMatchObject({
    ok: true,
    value: {
      matches: [
        { path: "skills/world/README.md", line: 1, text: "[Create](<declare/editor/create.d.ts>)" },
        { path: "skills/runtime/README.md", line: 1, text: "[API](<declare/editor/create.d.ts>)" }
      ]
    }
  });
  expect(files.read("notes.md")).toBe(authored);
  expect(files.read("skills/runtime/README.md")).toBe("[API](<declare/editor/create.d.ts>)");
  expect(files.read("declare/editor/create.d.ts")).toBe('import "./Target";');
  // Wrong paths still fail; no basename guessing or hidden fallback namespace.
  expect((await call("read", { file_path: "knowledge/world/README.md" })).result.ok).toBe(false);
});
