import { afterEach, expect, it, vi } from "vitest";
import { AgentNativeFiles, collectActiveReadPaths, nativeFileTraceInput } from "../src/ai-chat/agent-native-files";
import { createAgentProjectFiles } from "../src/ai-chat/agent-project-files";
import { compileProjectGlob } from "@galacean/engine-project/project-files/project-glob.ts";
import { VirtualProjectFiles } from "@galacean/engine-project/project-files/virtual-project-files.ts";
import type { AgentEditTransaction } from "../src/ai-chat/agent-types";
import { TestWorker } from "../../project/tests/TestRegexWorker";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fixture(initial = "before", hooks: Partial<AgentEditTransaction> = {}) {
  const data: Record<string, string> = { "notes.md": initial };
  const provider = { paths: () => Object.keys(data), read: (path: string) => data[path] };
  const artifacts: string[] = [];
  const discard = vi.fn();
  const beginEdit = () => {
    const draft = { ...data };
    return {
      tools: [],
      hasChanges: () => true,
      documents: {
        read: async (path: string) => draft[path],
        write: async (path: string, text: string) => {
          draft[path] = text;
        },
        delete: async (path: string) => {
          delete draft[path];
        }
      },
      prepare() {},
      commit() {
        for (const path of Object.keys(data)) delete data[path];
        Object.assign(data, draft);
        return { transactionId: "tx" };
      },
      discard,
      ...hooks
    };
  };
  const api = new AgentNativeFiles(
    () => new VirtualProjectFiles([provider]),
    () => ({ scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [], beginEdit }),
    new Map(),
    (content) => {
      artifacts.push(content);
      return ".ai/outputs/result.json";
    }
  );
  const call = (name: Parameters<typeof api.execute>[0], input: Record<string, unknown>) =>
    api.execute(name, input, "call", new AbortController().signal);
  return { api, call, data, provider, artifacts, discard };
}
it("reconstructs long lines using only the continuation cursor shown to the model", async () => {
  const original = "a".repeat(1999) + "🌱" + "b".repeat(3100);
  const f = fixture(original);
  let cursor = { offset: 1, column: 1 }, reconstructed = "", pages = 0;
  while (true) {
    const outcome = await f.call("read", { file_path: "notes.md", ...cursor });
    expect(outcome.result.ok).toBe(true);
    reconstructed += outcome.content.match(/^1: (.*)$/m)![1];
    const next = outcome.content.match(/Continue with read offset=(\d+) column=(\d+)\./);
    pages++;
    if (!next) break;
    expect(pages).toBeLessThan(4);
    expect(Number(next[2])).toBeGreaterThan(cursor.column);
    cursor = { offset: Number(next[1]), column: Number(next[2]) };
  }
  expect(pages).toBe(3);
  expect(reconstructed).toBe(original);
});
it("retains a committed edit when full trace details exceed their display budget", async () => {
  const f = fixture("a".repeat(70000));
  await f.call("read", { file_path: "notes.md" });
  const result = await f.call("edit", { file_path: "notes.md", old_string: "a", new_string: "b", replace_all: true });
  expect(result).toMatchObject({
    result: { ok: true, value: { outputFile: ".ai/outputs/result.json" } },
    receipt: { status: "committed" }
  });
  expect(f.data["notes.md"]).toBe("b".repeat(70000));
  expect(JSON.parse(f.artifacts[0])).toMatchObject({ before: "a".repeat(70000), after: "b".repeat(70000) });
  expect(nativeFileTraceInput({ content: "a".repeat(70000) })).toMatchObject({
    content: { truncated: true, characters: 70000 }
  });
});
it("distinguishes prepare rejection, uncertain publication and post-commit activation failure", async () => {
  const rejected = fixture("before", {
    prepare() {
      throw new Error("invalid");
    }
  });
  expect(await rejected.call("write", { file_path: "new.md", content: "new" })).toMatchObject({
    result: { ok: false },
    receipt: { status: "aborted" }
  });
  expect(rejected.data["new.md"]).toBeUndefined();
  expect(rejected.discard).toHaveBeenCalledOnce();
  const uncertain = fixture("before", {
    commit() {
      throw new Error("publication interrupted");
    }
  });
  expect(await uncertain.call("delete", { file_path: "notes.md" })).toMatchObject({
    result: { ok: false },
    receipt: { status: "publication_failed" }
  });
  expect(uncertain.discard).not.toHaveBeenCalled();
  const activated = fixture("before", {
    activate() {
      throw new Error("runtime failed");
    }
  });
  expect(await activated.call("delete", { file_path: "notes.md" })).toMatchObject({
    result: { ok: true },
    receipt: { status: "committed", runtimeErrors: ["runtime failed"] }
  });
  expect(activated.data["notes.md"]).toBeUndefined();
});
it("does not bless a file version changed during a read", async () => {
  const f = fixture();
  const provider = {
    ...f.provider,
    open: async () => ({
      kind: "text" as const,
      chunks: (async function* () {
        yield "before";
        f.data["notes.md"] = "changed";
      })()
    })
  };
  // The observation must match the bytes captured before opening the stream.
  const observations = new Map<string, string>();
  const observed = new AgentNativeFiles(
    () => new VirtualProjectFiles([provider]),
    () => ({ scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [] }),
    observations,
    () => "unused"
  );
  expect(
    (await observed.execute("read", { file_path: "notes.md" }, "r", new AbortController().signal)).content
  ).toContain("before");
  expect(observations.has("notes.md")).toBe(false);
});
it("uses directory-relative glob patterns and excludes VCS before content loading", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const opened: string[] = [];
  const values = {
    "src/nested/a.ts": "needle",
    "src/b.js": "needle",
    "src/.git/config": "needle",
    "src/c.txt": "needle"
  };
  const files = new VirtualProjectFiles([
    {
      paths: () => Object.keys(values),
      read: (path) => {
        opened.push(path);
        return values[path as keyof typeof values];
      }
    }
  ]);
  const api = new AgentNativeFiles(
    () => files,
    () => ({ scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [] }),
    new Map(),
    () => "unused"
  );
  const signal = new AbortController().signal;
  const grep = await api.execute("grep", { path: "src", pattern: "needle", include: "**/*.{ts,js}" }, "grep", signal);
  expect(grep.content).toContain("src/nested/a.ts");
  expect(grep.content).toContain("src/b.js");
  expect(opened).toEqual(["src/nested/a.ts", "src/b.js"]);
  expect((await api.execute("glob", { path: "src", pattern: "**/*.{ts,js}" }, "glob", signal)).content).toBe(
    "src/b.js\nsrc/nested/a.ts"
  );
});
it.each([
  ["*.ts", "a/b.ts", true],
  ["src/**/*.ts", "src/a.ts", true],
  ["src/**/*.ts", "src/a/b.ts", true],
  ["*.{js,ts}", "a.ts", true],
  ["file[0-9].?s", "file3.ts", true],
  ["file[!0-9].ts", "filea.ts", true],
  ["src/*.ts", "src/nested/a.ts", false],
  ["*.js", "test.ts", false]
] as const)("matches %s against %s", (pattern, path, expected) =>
  expect(compileProjectGlob(pattern)(path)).toBe(expected)
);


it.each(["success", "prepare", "commit", "activate", "discard"] as const)(
  "completes the transaction after %s, including failed discard", async phase => {
    let owned = false;
    const complete = vi.fn(() => { owned = false; });
    const f = fixture("before", {
      prepare() { owned = true; if (phase === "prepare" || phase === "discard") throw Error("prepare failed"); },
      ...(phase === "commit" ? {commit() { throw Error("commit failed"); }} : {}),
      activate() { if (phase === "activate") throw Error("activate failed"); },
      ...(phase === "discard" ? {discard() { throw Error("discard failed"); }} : {}),
      complete
    });
    const result = await f.call("delete", {file_path: "notes.md"});
    expect(owned).toBe(false);
    expect(complete).toHaveBeenCalledOnce();
    expect(result.receipt?.status).toBe(phase === "commit" ? "publication_failed"
      : phase === "prepare" || phase === "discard" ? "aborted" : "committed");
    if (phase === "activate") expect(result.receipt?.runtimeErrors).toEqual(["activate failed"]);
    if (phase === "discard") expect(result.content).toContain("prepare failed; Edit discard failed: discard failed");
  }
);

it("reports cleanup failure without concealing activation failure or losing a commit", async () => {
  const f = fixture("before", {
    activate() { throw Error("activate failed"); },
    complete() { throw Error("release failed"); }
  });
  const result = await f.call("delete", {file_path: "notes.md"});
  expect(result).toMatchObject({result: {ok: true}, receipt: {status: "committed", transactionId: "tx",
    runtimeErrors: ["activate failed", "Edit resource cleanup failed: release failed"]}});
  expect(result.content).toContain("release failed");
  expect(f.data["notes.md"]).toBeUndefined();
  expect(f.discard).not.toHaveBeenCalled();
});

it("preserves uncertain publication and cleanup errors together", async () => {
  const f = fixture("before", {
    commit() { throw Error("commit failed"); },
    complete() { throw Error("release failed"); }
  });
  const result = await f.call("delete", {file_path: "notes.md"});
  expect(result).toMatchObject({result: {ok: false}, receipt: {status: "publication_failed"}});
  expect(result.content).toContain("commit failed; Edit resource cleanup failed: release failed");
  expect(f.discard).not.toHaveBeenCalled();
});

it("cleans up a transaction that does not expose document tools", async () => {
  const complete = vi.fn();
  const f = fixture("before", {documents: undefined, complete});
  expect(await f.call("delete", {file_path: "notes.md"})).toMatchObject({result: {ok: false}});
  expect(f.discard).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledOnce();
});

it("auto-inlines transitive small declaration dependencies once across parallel and subsequent reads, and re-inlines after compaction", async () => {
  const modules = [
    { id: "declare/world/common/Ref.d.ts", source: "export type Ref = { id: string };", imports: [] },
    { id: "declare/world/common/Anchor.d.ts", source: 'import type { Ref } from "./Ref";\nexport type Anchor = { ref: Ref };', imports: ["declare/world/common/Ref.d.ts"] },
    { id: "declare/world/common/Target.d.ts", source: 'import type { Anchor } from "./Anchor";\nexport type Target = { anchor: Anchor };', imports: ["declare/world/common/Anchor.d.ts"] },
    { id: "declare/world/tools/a.d.ts", source: 'import type { Target } from "../common/Target";\nexport function a(t: Target): void;', imports: ["declare/world/common/Target.d.ts"] },
    { id: "declare/world/tools/b.d.ts", source: 'import type { Target } from "../common/Target";\nexport function b(t: Target): void;', imports: ["declare/world/common/Target.d.ts"] }
  ];
  const catalog = { entries: [], modules };
  const projectFiles = createAgentProjectFiles(catalog);
  let activeClaimed = new Set<string>();
  const api = new AgentNativeFiles(
    () => projectFiles,
    () => ({ scriptApi: catalog, toolNames: [] }),
    new Map(),
    () => "unused",
    60_000,
    () => activeClaimed
  );
  const signal = new AbortController().signal;

  // Parallel batch reading A and B that both depend on Target -> Anchor -> Ref:
  const [readA, readB] = await Promise.all([
    api.execute("read", { file_path: "declare/editor/world/tools/a.d.ts" }, "a", signal),
    api.execute("read", { file_path: "declare/editor/world/tools/b.d.ts" }, "b", signal)
  ]);
  const combined = `${readA.content}\n${readB.content}`;
  expect(combined.match(/<dependency path="declare\/editor\/world\/common\/Target\.d\.ts">/g)).toHaveLength(1);
  expect(combined.match(/<dependency path="declare\/editor\/world\/common\/Anchor\.d\.ts">/g)).toHaveLength(1);
  expect(combined.match(/<dependency path="declare\/editor\/world\/common\/Ref\.d\.ts">/g)).toHaveLength(1);

  // Subsequent turn retains active transcript tool replies -> reading B again does not re-inline Target/Anchor/Ref:
  activeClaimed = collectActiveReadPaths([
    { role: "tool", toolCallId: "a", content: readA.content },
    { role: "tool", toolCallId: "b", content: readB.content }
  ]);
  const readBAgain = await api.execute("read", { file_path: "declare/editor/world/tools/b.d.ts" }, "b2", signal);
  expect(readBAgain.content).not.toContain("<dependency ");

  // After compaction removes the old tool messages from active transcript -> dependencies are inlined fresh:
  activeClaimed = collectActiveReadPaths([{ role: "user", content: "compacted summary" }]);
  const readAfterCompaction = await api.execute("read", { file_path: "declare/editor/world/tools/b.d.ts" }, "b3", signal);
  expect(readAfterCompaction.content).toContain('<dependency path="declare/editor/world/common/Target.d.ts">');
  expect(readAfterCompaction.content).toContain('<dependency path="declare/editor/world/common/Ref.d.ts">');
});

it("auto-inlines relative imports for declare/engine declarations and deduplicates parallel reads", async () => {
  const runtimeProvider = {
    paths: () => [
      "declare/engine/pkg/types/Leaf.d.ts",
      "declare/engine/pkg/types/Mid.d.ts",
      "declare/engine/pkg/types/EntryA.d.ts",
      "declare/engine/pkg/types/EntryB.d.ts",
      "declare/engine/pkg/types/physics/index.d.ts"
    ],
    read: (path: string) =>
      ({
        "declare/engine/pkg/types/Leaf.d.ts": "export interface Leaf { value: number; }\n",
        "declare/engine/pkg/types/Mid.d.ts": 'import type { Leaf } from "./Leaf";\nexport interface Mid { leaf: Leaf; }\n',
        "declare/engine/pkg/types/physics/index.d.ts": "export interface ColliderShape {}\n",
        "declare/engine/pkg/types/EntryA.d.ts":
          'import { Mid } from "./Mid";\nimport { ColliderShape } from "./physics";\nexport type Maker = typeof import("./Leaf");\nexport interface EntryA { mid: Mid; shape: ColliderShape; }\n',
        "declare/engine/pkg/types/EntryB.d.ts": 'export * from "./Mid";\nexport interface EntryB { id: string; }\n'
      })[path]
  };
  const projectFiles = createAgentProjectFiles({ entries: [], modules: [] }, [runtimeProvider]);
  const claimed = new Set<string>();
  const api = new AgentNativeFiles(
    () => projectFiles,
    () => ({ scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [] }),
    new Map(),
    () => "unused",
    60_000,
    () => claimed
  );
  const signal = new AbortController().signal;
  const [readA, readB] = await Promise.all([
    api.execute("read", { file_path: "declare/engine/pkg/types/EntryA.d.ts" }, "ea", signal),
    api.execute("read", { file_path: "declare/engine/pkg/types/EntryB.d.ts" }, "eb", signal)
  ]);
  const combined = `${readA.content}\n${readB.content}`;
  expect(combined.match(/<dependency path="declare\/engine\/pkg\/types\/Mid\.d\.ts">/g)).toHaveLength(1);
  expect(combined.match(/<dependency path="declare\/engine\/pkg\/types\/Leaf\.d\.ts">/g)).toHaveLength(1);
  expect(combined.match(/<dependency path="declare\/engine\/pkg\/types\/physics\/index\.d\.ts">/g)).toHaveLength(1);
});

it("inlines 13KB dependencies under the 16KB cap and reports omitted dependencies for oversized or paginated declarations", async () => {
  const mediumSource = Array.from({ length: 260 }, (_, i) => `export type M${i} = ${i}; // padding line for 13kb`).join("\n");
  expect(new TextEncoder().encode(mediumSource).byteLength).toBeGreaterThan(12 * 1024);
  expect(new TextEncoder().encode(mediumSource).byteLength).toBeLessThan(14 * 1024);
  const oversizedDep = Array.from({ length: 420 }, (_, i) => `export type Big${i} = ${i}; // padding line`).join("\n");
  const paginatedRoot = Array.from({ length: 360 }, (_, i) =>
    i === 0 ? 'import type { Medium } from "../native/medium";' : `export const k${i}: number;`
  ).join("\n");
  const modules = [
    { id: "declare/native/medium.d.ts", source: mediumSource, imports: [] },
    { id: "declare/native/oversized.d.ts", source: oversizedDep, imports: [] },
    { id: "declare/native/api.d.ts", source: 'import "./medium";\nexport interface Api {}', imports: ["declare/native/medium.d.ts"] },
    { id: "declare/world/tools/bigDepUser.d.ts", source: 'import "../../native/oversized";\nexport function u(): void;', imports: ["declare/native/oversized.d.ts"] },
    { id: "declare/world/tools/paginatedTool.d.ts", source: paginatedRoot, imports: ["declare/native/medium.d.ts"] }
  ];
  const catalog = { entries: [], modules };
  const projectFiles = createAgentProjectFiles(catalog);
  const freshApi = () =>
    new AgentNativeFiles(
      () => projectFiles,
      () => ({ scriptApi: catalog, toolNames: [] }),
      new Map(),
      () => "unused"
    );
  const signal = new AbortController().signal;

  const apiRead = await freshApi().execute("read", { file_path: "declare/editor/native/api.d.ts" }, "n1", signal);
  expect(apiRead.content).toContain('<dependency path="declare/editor/native/medium.d.ts">');
  expect(apiRead.result).toMatchObject({ ok: true, value: { inlinedDependencies: ["declare/editor/native/medium.d.ts"] } });

  const bigDepRead = await freshApi().execute("read", { file_path: "declare/editor/world/tools/bigDepUser.d.ts" }, "n2", signal);
  expect(bigDepRead.content).toContain("<omitted_dependencies>");
  expect(bigDepRead.content).toContain("declare/editor/native/oversized.d.ts");
  expect(bigDepRead.content).toContain("size");

  const paginatedRead = await freshApi().execute("read", { file_path: "declare/editor/world/tools/paginatedTool.d.ts" }, "n3", signal);
  expect(paginatedRead.content).toContain("<omitted_dependencies>");
  expect(paginatedRead.content).toContain("declare/editor/native/medium.d.ts");
  expect(paginatedRead.content).toContain("paginated");
});

it("keeps structured omittedDependencies aligned with rendered lines when trimmed by byte budget", async () => {
  const filler = (prefix: string, lines: number) =>
    Array.from({ length: lines }, (_, i) => `export type ${prefix}_${i} = "${"x".repeat(48)}";`).join("\n");
  const rootSource =
    `// ${"p".repeat(300)}\n` +
    'import "./bigInlined";\nimport "./midInlined";\n' +
    Array.from({ length: 12 }, (_, i) => `import "./huge${i}";`).join("\n") +
    "\n" +
    filler("R", 159);
  const modules = [
    { id: "declare/native/bigInlined.d.ts", source: filler("INL", 190), imports: [] },
    { id: "declare/native/midInlined.d.ts", source: filler("MID", 45), imports: [] },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `declare/native/huge${i}.d.ts`,
      source: filler(`H${i}`, 250),
      imports: []
    })),
    {
      id: "declare/native/root.d.ts",
      source: rootSource,
      imports: [
        "declare/native/bigInlined.d.ts",
        "declare/native/midInlined.d.ts",
        ...Array.from({ length: 12 }, (_, i) => `declare/native/huge${i}.d.ts`)
      ]
    }
  ];
  const catalog = { entries: [], modules };
  const projectFiles = createAgentProjectFiles(catalog);
  const api = new AgentNativeFiles(
    () => projectFiles,
    () => ({ scriptApi: catalog, toolNames: [] }),
    new Map(),
    () => "unused"
  );
  const outcome = await api.execute("read", { file_path: "declare/editor/native/root.d.ts" }, "n4", new AbortController().signal);
  const omittedBlock = outcome.content.match(/<omitted_dependencies>([\s\S]*?)<\/omitted_dependencies>/)?.[1] ?? "";
  const renderedPaths = omittedBlock
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).split(" ", 1)[0]);
  const structuredOmitted = (outcome.result as { ok: true; value: { omittedDependencies?: string[] } }).value.omittedDependencies ?? [];
  expect(renderedPaths.length).toBeGreaterThan(0);
  expect(renderedPaths.length).toBeLessThan(12);
  expect(structuredOmitted).toEqual(renderedPaths);
  expect(omittedBlock).toContain(`(+${12 - renderedPaths.length} more omitted dependencies)`);
});

it("caches declare relative import resolution and uses a single snapshot per read without regex stalls", async () => {
  const runtimeProvider = {
    paths: () => [
      "declare/engine/pkg/types/Leaf.d.ts",
      "declare/engine/pkg/types/BigClass.d.ts"
    ],
    read: (path: string) =>
      ({
        "declare/engine/pkg/types/Leaf.d.ts": "export interface Leaf { id: number; }\n",
        "declare/engine/pkg/types/BigClass.d.ts":
          'import type { Leaf } from "./Leaf";\n' +
          Array.from({ length: 40 }, (_, i) => `export declare class Entity${i} {\n  value: number;\n  method(x: Leaf): void;\n}`).join("\n")
      })[path]
  };
  const projectFiles = createAgentProjectFiles({ entries: [], modules: [] }, [runtimeProvider]);
  const snapshotSpy = vi.spyOn(projectFiles, "snapshot");
  const freshApi = () =>
    new AgentNativeFiles(
      () => projectFiles,
      () => ({ scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [] }),
      new Map(),
      () => "unused"
    );
  const signal = new AbortController().signal;

  const first = await freshApi().execute("read", { file_path: "declare/engine/pkg/types/BigClass.d.ts" }, "c1", signal);
  const snapshotsAfterFirst = snapshotSpy.mock.calls.length;
  expect(first.content).toContain('<dependency path="declare/engine/pkg/types/Leaf.d.ts">');
  // One snapshot inside readAgentFile + one snapshot inside AgentNativeFiles.execute("read")
  expect(snapshotsAfterFirst).toBeLessThanOrEqual(3);

  const second = await freshApi().execute("read", { file_path: "declare/engine/pkg/types/BigClass.d.ts" }, "c2", signal);
  expect(second.content).toContain('<dependency path="declare/engine/pkg/types/Leaf.d.ts">');
  expect(snapshotSpy.mock.calls.length - snapshotsAfterFirst).toBeLessThanOrEqual(3);
});
