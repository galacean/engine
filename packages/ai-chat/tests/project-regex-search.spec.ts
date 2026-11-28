import { validateSearchInput } from "@galacean/engine-project/project-files/project-file-search.ts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectRegexScanner } from "@galacean/engine-project/project-files/project-regex-scanner.ts";
import { SEARCH_LIMITS } from "@galacean/engine-project/project-files/project-search-contract.ts";
import type { RegexRequest } from "@galacean/engine-project/project-files/project-regex-protocol.ts";
import { VirtualProjectFiles } from "@galacean/engine-project/project-files/virtual-project-files.ts";
import { readAgentFile } from "../src/ai-chat/agent-file-read";
import { parseAgentToolCall } from "../src/ai-chat/agent-protocol";
import { createTestAgentLoop } from "./AIChatTestRuntime";
vi.mock("../src/ai-chat/asap-chat", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "../src/ai-chat/asap-chat";

// Runs the real scanner with deterministic transport for cancellation/error paths.
// Native Worker loading/termination and frame behavior are covered by the browser harness.
import {TestWorker} from "../../project/tests/TestRegexWorker";

const files = (text: string) => new VirtualProjectFiles([{paths: () => ["Scene/main.scene"], read: () => text}]);
beforeEach(() => { TestWorker.instances = []; TestWorker.stall = undefined; vi.stubGlobal("Worker", TestWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("keeps literal metacharacters literal without constructing a Worker", async () => {
  const result = await files("Camera.*position\nCamera xyz position").search({path: "", query: "Camera.*position"});
  expect(result.matches.map(hit => hit.line)).toEqual([1]);
  expect(TestWorker.instances).toHaveLength(0);
});

it.each(["literal", "regex"] as const)("finishes exact-file %s search without enumerating unrelated paths", async mode => {
  let visited = 0;
  const fs = new VirtualProjectFiles([{
    *paths() { for (const path of ["Scene.scene", "other.txt"]) { visited++; yield path; } },
    read: () => "Camera"
  }]);
  visited = 0; // Namespace construction validates both entries once.
  expect(await fs.search({path: "Scene.scene", query: "Camera", mode})).toMatchObject({complete: true, visitedPaths: 1});
  expect(visited).toBe(1);
});

it("preserves RE2 line anchors, alternatives, case flags and read line offsets and UTF-16 match coordinates", async () => {
  const fs = files("😀 相机 Camera\r\ncamera\nLight\nCameraController\n");
  const result = await fs.search({path: "", query: "\\b(?:Camera|Light)\\b", mode: "regex"});
  expect(result.complete).toBe(true);
  expect(result.matches.map(({line, column}) => ({line, column}))).toEqual([{line: 1, column: 7}, {line: 3, column: 1}]);
  for (const hit of result.matches) {
    const read = await readAgentFile(fs, {file_path: hit.path, offset: hit.line, limit: 1});
    if (!("lines" in read.result)) throw new Error("Expected text");
    expect(read.result.lines[0].text.slice(hit.column - 1)).toBe(hit.line === 1 ? "Camera" : "Light");
  }
  expect((await fs.search({path: "", query: "^camera$", mode: "regex", caseSensitive: false})).matches.map(hit => hit.line)).toEqual([2]);
  expect(TestWorker.instances.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
});

it("matches across stream/block boundaries without treating them as line boundaries", async () => {
  const text = "x".repeat(SEARCH_LIMITS.blockChars - 2) + "Camera" + "x".repeat(SEARCH_LIMITS.blockChars) + "position";
  const result = await files(text).search({path: "", query: "Camera.*position$", mode: "regex"});
  expect(result).toMatchObject({complete: true, matches: [{line: 1, column: SEARCH_LIMITS.blockChars - 1}]});
  expect(result.matches[0].text.length).toBeLessThanOrEqual(SEARCH_LIMITS.excerptChars);
  expect((await files(text).search({path: "", query: "^Camera", mode: "regex"})).matches).toEqual([]);
});

it("handles empty matching lines and trailing CRLF consistently with read_tool", async () => {
  const fs = files("\r\nCamera\r\n\n");
  expect((await fs.search({path: "", query: "^$", mode: "regex"})).matches.map(hit => hit.line)).toEqual([1, 3]);
  expect((await fs.search({path: "", query: "Camera$", mode: "regex"})).matches[0].text).toBe("Camera");
  expect((await files("").search({path: "", query: "^", mode: "regex"})).matches).toEqual([]);
});

it("does not invent cross-line matches", async () => {
  expect((await files("Camera\nposition").search({path: "", query: "Camera\\s+position", mode: "regex"})).matches).toEqual([]);
});

it.each(["[", "(Camera)\\1", "Camera(?=Position)", "(?<=Camera)Position", "a{1000}".repeat(9)])(
  "rejects unsupported/over-budget expressions and terminates the Worker: %s", async query => {
    await expect(files("Camera").search({path: "", query, mode: "regex"})).rejects.toThrow();
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
  }
);

it("bounds regex results using the same transport budget and per-line limit", async () => {
  const fs = files(("Camera Camera " + "汉".repeat(300) + "\n").repeat(150));
  expect(await fs.search({path: "", query: "Camera", mode: "regex", limit: 1})).toMatchObject({stopReason: "match_limit", matches: [{line: 1}]});
  const result = await fs.search({path: "", query: "Camera", mode: "regex", limit: 100});
  expect(result.stopReason).toBe("output_budget");
  expect(new TextEncoder().encode(JSON.stringify({ok: true, result})).length).toBeLessThanOrEqual(SEARCH_LIMITS.resultBytes);
});

it("discards partial hits from a stale provider and resets line assembly before the next file", async () => {
  const fs = new VirtualProjectFiles([{
    paths: () => ["stale.txt", "current.txt"], read: () => undefined,
    open: async path => ({kind: "text" as const, chunks: (async function* () {
      yield path === "stale.txt" ? "Camera\nunfinished" : "Light";
      if (path === "stale.txt") throw new Error("changed while reading");
    })()})
  }]);
  expect(await fs.search({path: "", query: "Camera|Light", mode: "regex"})).toMatchObject({
    complete: false, unavailableFiles: 1, matches: [{path: "current.txt", line: 1, text: "Light"}]
  });
});

it.each(["ready", "reply"] as const)("terminates a stuck %s phase and reports an incomplete budget result", async stall => {
  vi.useFakeTimers(); TestWorker.stall = stall;
  const result = files("Camera").search({path: "", query: "Camera", mode: "regex"});
  await vi.advanceTimersByTimeAsync(SEARCH_LIMITS.wallTimeMs + 1);
  expect(await result).toMatchObject({complete: false, stopReason: "time_budget", unavailableFiles: 0});
  expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
});

it("cancels while loading and releases the Worker immediately", async () => {
  TestWorker.stall = "ready";
  const controller = new AbortController();
  const promise = files("Camera").search({path: "", query: "Camera", mode: "regex"}, controller.signal);
  const rejection = expect(promise).rejects.toThrow("cancel regex");
  controller.abort(new Error("cancel regex"));
  await rejection;
  expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
});

it("surfaces Worker module-load failure and releases its resources", async () => {
  TestWorker.stall = "ready";
  const promise = files("Camera").search({path: "", query: "Camera", mode: "regex"});
  const rejection = expect(promise).rejects.toThrow("module failed");
  TestWorker.instances[0].onerror?.({message: "module failed", preventDefault() {}});
  await rejection;
  expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
});

it("advertises and parses regex mode without changing the default for existing callers", () => {
  const input = {path: "", query: "Camera|Light", mode: "regex"};
  expect(validateSearchInput(input)).toMatchObject(input);
});

it("routes a native regex Tool call through AgentLoop and returns its actual match", async () => {
  const request = vi.mocked(requestAsapChat);
  request.mockReset();
  request.mockResolvedValueOnce({content: "", finishReason: "tool_calls", toolCalls: [{
    id: "regex", type: "function", function: {name: "grep", arguments: JSON.stringify({path:"skills/fixture/guide.md",pattern:"Camera|Light"})}
  }]}).mockResolvedValueOnce({content: "done", toolCalls: [], finishReason: "stop"});
  const loop = createTestAgentLoop({tools: [], definition: {scriptApi: {catalog: "# Host", entries: [], modules: [],
    documents: [{path: "skills/fixture/guide.md", content: "Light"}]}, toolNames: []}});
  await loop.run("find", {});
  const receipt = request.mock.calls[1][0].messages.find(message => message.role === "tool")!.content;
  expect(receipt).toContain("skills/fixture/guide.md\n  Line 1: Light");
  expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
});

it("coalesces tiny producer chunks and retains correct surrogate-pair coordinates", () => {
  const scanner = new ProjectRegexScanner("Camera$", true);
  const text = "😀" + "x".repeat(SEARCH_LIMITS.blockChars) + "Camera";
  for (const character of text) expect(scanner.push(character, false, false, 10)).toEqual([]);
  expect(scanner.push("", false, true, 10)).toMatchObject([{line: 1, column: SEARCH_LIMITS.blockChars + 3}]);
});
