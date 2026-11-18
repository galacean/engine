import { afterEach, expect, it, vi } from "vitest";
import { AgentNativeFiles, nativeFileTraceInput } from "../src/ai-chat/agent-native-files";
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
