import { afterEach, expect, it, vi } from "vitest";
import { VirtualProjectFiles, configuredProjectFiles } from "@galacean/engine-project/project-files/virtual-project-files.ts";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit.ts";
import {
  runtimeProjectFiles,
  RuntimeProjectStorage,
  RUNTIME_PROJECT_SAVE_VERSION
} from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";
import { RuntimeProjectSession } from "../src/project/runtime-project-session";
import { readAgentFile } from "@galacean/engine-ai-chat/ai-chat/agent-file-read.ts";
vi.mock("../src/runtime-editor/scripts/runtime-project-scripts", () => ({
  RuntimeProjectScripts: class {
    dispose() {}
  }
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const read = (files: VirtualProjectFiles, path: string, offset = 1) =>
  readAgentFile(files, { file_path: path, offset, limit: 100 });

it("search positions round-trip through read_tool for real authored parent metadata and synthesized VFS files", async () => {
  const draft = new RuntimeProjectEdit(
    {
      version: RUNTIME_PROJECT_SAVE_VERSION,
      project: { scene: "Main.scene", files: [{ virtualPath: "Main.scene", path: "Main.scene", type: "Scene" }] },
      contents: { "Main.scene": "{}" }
    },
    new Map()
  );
  draft.writeDocument("SearchFolder/notes.md", "control needle");
  const pack = draft.preview(),
    files = new VirtualProjectFiles([runtimeProjectFiles(() => pack)]);
  const before = structuredClone(pack);
  for (const [path, query] of [
    ["SearchFolder/notes.md", "needle"],
    ["project.json", '"scene"'],
    ["Main.scene.meta", "Main.scene"]
  ]) {
    const result = await files.search({ path, query });
    expect(result.complete).toBe(true);
    const hit = result.matches[0];
    const page = await read(files, path, hit.line);
    expect("lines" in page.result && page.result.lines[0].text.slice(hit.column - 1)).toMatch(new RegExp(query));
  }
  expect(pack).toEqual(before);
  const catalog = new VirtualProjectFiles([
    configuredProjectFiles({ files: [{ path: "sample.mesh", content: "x", summary: "catalog needle" }] })
  ]);
  const hit = (await catalog.search({ path: "sample.mesh.meta", query: "catalog needle" })).matches[0];
  const page = await read(catalog, hit.path, hit.line);
  expect("lines" in page.result && page.result.lines[0].text.slice(hit.column - 1)).toContain("catalog needle");
});

async function remoteFiles() {
  vi.spyOn(RuntimeProjectStorage, "open").mockResolvedValue({
    load: async () => undefined,
    save: async () => {},
    close() {}
  } as unknown as RuntimeProjectStorage);
  const session = await RuntimeProjectSession.open(
    "stream-test",
    {
      scene: "main.scene",
      files: [
        { virtualPath: "main.scene", path: "main.scene", type: "Scene" },
        { virtualPath: "image.png", path: "image.png", type: "Texture" }
      ]
    },
    "https://example.test/"
  );
  return { session, files: new VirtualProjectFiles([session.fileProvider()]) };
}

it("streams remote UTF-8 without caching searches, shares read offsets and preserves explicit-read hydration", async () => {
  const bytes = new TextEncoder().encode("😀\r\n前缀 needle\nend");
  const canceled = vi.fn();
  const fetcher = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
            // Leave open: match-limit must cancel the response rather than waiting for EOF.
          },
          cancel: canceled
        })
      )
  );
  vi.stubGlobal("fetch", fetcher);
  const { session, files } = await remoteFiles();
  try {
    const result = await files.search({ path: "main.scene", query: "needle", limit: 1 });
    expect(result).toMatchObject({ stopReason: "match_limit", matches: [{ line: 2, column: 4 }] });
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(session.projectPackage.contents).toEqual({});
    fetcher.mockImplementation(async () => new Response(bytes));
    const page = await read(files, "main.scene", 2);
    expect("lines" in page.result && page.result.lines[0].text).toBe("前缀 needle");
    expect(session.projectPackage.contents["main.scene"]).toBe("😀\r\n前缀 needle\nend");
    const count = fetcher.mock.calls.length;
    expect(await files.search({ path: "image.png", query: "x" })).toMatchObject({ binaryFiles: 1, complete: true });
    expect(fetcher).toHaveBeenCalledTimes(count);
  } finally {
    session.dispose();
  }
});

it("cancels stalled response readers on deadline and caller abort", async () => {
  const canceled = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ReadableStream({ cancel: canceled })))
  );
  const { session, files } = await remoteFiles();
  try {
    expect(await files.search({ path: "main.scene", query: "x" })).toMatchObject({
      complete: false,
      stopReason: "time_budget"
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("user stopped")), 10);
    await expect(files.search({ path: "main.scene", query: "x" }, controller.signal)).rejects.toThrow("user stopped");
    expect(canceled).toHaveBeenCalledTimes(2);
    expect(session.projectPackage.contents).toEqual({});
  } finally {
    session.dispose();
  }
});

it("discards partial hits from failed streams and continues to subsequent files with bounded errors", async () => {
  const fs = new VirtualProjectFiles([
    {
      paths: () => ["broken.txt", "ok.txt"],
      read: () => undefined,
      async open(path) {
        return {
          kind: "text",
          chunks: (async function* () {
            yield "needle\n";
            if (path === "broken.txt") throw new Error("changed while reading");
          })()
        };
      }
    }
  ]);
  expect(await fs.search({ path: "", query: "needle" })).toMatchObject({
    complete: false,
    unavailableFiles: 1,
    matches: [{ path: "ok.txt" }],
    errors: [{ path: "broken.txt", message: "changed while reading" }]
  });
});

it("bounds read_tool output and yields even when a text provider emits many tiny chunks", async () => {
  const fs = new VirtualProjectFiles([
    {
      paths: () => ["large.txt"],
      read: () => undefined,
      async open() {
        return {
          kind: "text",
          chunks: (async function* () {
            for (let i = 0; i < 100_000; i++) yield "abc";
          })()
        };
      }
    }
  ]);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 0);
  try {
    const result = await read(fs, "large.txt");
    expect(ticks).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("knowledge");
    expect(JSON.stringify(result.result).length).toBeLessThan(32 * 1024);
  } finally {
    clearInterval(timer);
  }
});

it("rejects a remote stream if a public asset publication replaces its content mid-read", async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let began!: () => void;
  const ready = new Promise<void>((resolve) => {
    began = resolve;
  });
  const canceled = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              controller = c;
              c.enqueue(new TextEncoder().encode("needle\n"));
              began();
            },
            cancel: canceled
          })
        )
    )
  );
  const { session, files } = await remoteFiles();
  try {
    const search = files.search({ path: "main.scene", query: "needle" });
    await ready;
    await session.publishAsset(session.projectPackage.project.files[0], '{"entities":[]}');
    if (!canceled.mock.calls.length) {
      controller.enqueue(new TextEncoder().encode("obsolete"));
      controller.close();
    }
    expect(await search).toMatchObject({
      complete: false,
      matches: [],
      unavailableFiles: 1,
      errors: [{ path: "main.scene", message: expect.stringContaining("changed while reading") }]
    });
    expect((await read(files, "main.scene")).result).toMatchObject({ lines: [{ text: '{"entities":[]}' }] });
  } finally {
    session.dispose();
  }
});

it("enforces the deadline even on empty stream chunks and closes their iterator", async () => {
  let closed = false;
  const fs = new VirtualProjectFiles([
    {
      paths: () => ["empty.txt"],
      read: () => undefined,
      async open() {
        return {
          kind: "text",
          chunks: (async function* () {
            try {
              for (;;) yield "";
            } finally {
              closed = true;
            }
          })()
        };
      }
    }
  ]);
  expect(await fs.search({ path: "", query: "x" })).toMatchObject({ complete: false, stopReason: "time_budget" });
  expect(closed).toBe(true);
});

it("releases error response bodies and makes a disposed session's stream terminal", async () => {
  const canceled = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ReadableStream({ cancel: canceled }), { status: 503 }))
  );
  const { session, files } = await remoteFiles();
  try {
    expect(await files.search({ path: "main.scene", query: "x" })).toMatchObject({
      complete: false,
      unavailableFiles: 1,
      errors: [{ message: expect.stringContaining("503") }]
    });
    expect(canceled).toHaveBeenCalledTimes(1);
    const view = await files.open("main.scene");
    session.dispose();
    if (view.kind !== "text") throw new Error("Expected text view");
    await expect(view.chunks[Symbol.asyncIterator]().next()).rejects.toThrow();
  } finally {
    session.dispose();
  }
});

it("allows cold text I/O beyond the scanning budget without turning it into an unavailable file", async () => {
  const fs = new VirtualProjectFiles([
    configuredProjectFiles({
      files: [
        {
          path: "slow.txt",
          load: async () => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            return "needle";
          }
        }
      ]
    })
  ]);
  expect(await fs.search({ path: "slow.txt", query: "needle" })).toMatchObject({
    complete: true,
    unavailableFiles: 0,
    matches: [{ line: 1, column: 1 }]
  });
});
