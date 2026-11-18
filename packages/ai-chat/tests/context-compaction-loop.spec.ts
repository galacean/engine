import { fixtureBlob } from "./image-fixture";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/ai-chat/asap-chat", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat, type AsapChatResult } from "../src/ai-chat/asap-chat";
import { createTestAgentLoop } from "./AIChatTestRuntime";
import { AIChatSession } from "../src/ai-chat/ai-chat-session";
import { AgentTraceStore } from "../src/ai-chat/agent-trace";
import type { AgentLoopOptions, AgentMessage } from "../src/ai-chat/agent-types";
import type { ContextCompactionResult } from "../src/ai-chat/context-compaction";

const request = vi.mocked(requestAsapChat);
const definition: AgentLoopOptions["definition"] = { scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [] };
const final = (): AsapChatResult => ({ content: "done", toolCalls: [], finishReason: "stop" });
function tool(id: string, name = "list_tool"): AsapChatResult {
  return { content: "", finishReason: "tool_calls", toolCalls: [{ id, type: "function", function: {
    name: name === "snapshot" ? name : "glob", arguments: name === "snapshot" ? "{}" : JSON.stringify({pattern:"**"})
  } }] };
}
function compact(cutIndex: number, summary = "server summary"): ContextCompactionResult {
  return { version: 2, status: "compacted", strategy: "summary", beforeTokens: 1000, afterTokens: 400, durationMs: 3,
    replacement: { prefixLength: 5, cutIndex, summary } };
}
const messages = (index: number) => request.mock.calls[index][0].messages;
beforeEach(() => request.mockReset());

it("persists repeated compaction with new Tool receipts and fresh prefix while canonical trace remains complete", async () => {
  let round = 0;
  const loop = createTestAgentLoop({ tools: [], definition: { ...definition, provideWorldThumbnail: () => ({ round: ++round }) } });
  const trace = new AgentTraceStore({ enabled: true });
  trace.begin({ input: "original task", inputSource: "text" });
  loop.subscribe(event => trace.captureAgentEvent(event));
  request.mockResolvedValueOnce(tool("a"));
  request.mockResolvedValueOnce({ ...tool("b"), contextCompaction: compact(2, "first summary") });
  request.mockResolvedValueOnce({ ...tool("c"), contextCompaction: compact(3, "second summary") });
  request.mockResolvedValueOnce(final());
  const result = await loop.run("original task", { debugMode: true, contextCompaction: { triggerTokens: 1000, targetTokens: 400 } });
  expect(messages(2).slice(5, -1).map(m => m.role)).toEqual(["user", "assistant", "tool"]);
  expect(messages(2)[5].content).toBe("first summary");
  expect(messages(2)[7]).toMatchObject({ role: "tool", toolCallId: "b" });
  expect(messages(3)[5].content).toBe("second summary");
  expect(messages(3)[7]).toMatchObject({ role: "tool", toolCallId: "c" });
  expect(JSON.stringify(messages(3))).not.toContain("first summary");
  for (let i = 0; i < 4; i++) {
    expect(JSON.parse(messages(i)[3].content)).toMatchObject({ instruction: "original task" });
    expect(JSON.parse(messages(i).at(-1)!.content)).toMatchObject({ snapshot: { round: i + 1 } });
    expect(request.mock.calls[i][0].contextCompaction).toEqual({ version: 2, protectedPrefixLength: i === 0 ? 6 : 5, triggerTokens: 1000, targetTokens: 400 });
  }
  const canonical = trace.getCurrentTrace()!.agentEvents.flatMap(({ event }: any) => event.type === "transcript_appended" ? event.messages : []) as AgentMessage[];
  expect(canonical.filter(m => m.role === "tool").map(m => m.toolCallId)).toEqual(["a", "b", "c"]);
  expect(canonical.at(-1)).toEqual({ role: "assistant", content: "done" });
  expect(JSON.stringify(canonical)).not.toContain("summary");
  expect(result.steps[1].attempts[0].contextCompaction).toEqual(compact(2, "first summary"));
});

it("protocol retries consume each response once and never resurrect pre-compaction history", async () => {
  request.mockResolvedValueOnce(tool("a"));
  request.mockResolvedValueOnce({ content: "", toolCalls: [], finishReason: "stop", contextCompaction: compact(2) });
  request.mockResolvedValueOnce({ ...tool("b"), contextCompaction: compact(1, "retry summary") });
  request.mockResolvedValueOnce(final());
  const loop = createTestAgentLoop({ tools: [], definition });
  const result = await loop.run("task", {});
  expect(messages(2)[5]).toEqual({ role: "user", content: "server summary" });
  expect(messages(2).at(-1)!.content).toContain("agent_protocol_correction");
  expect(JSON.stringify(messages(2))).not.toContain('"id":"a"');
  expect(messages(3).slice(5, -1).map(m => m.role)).toEqual(["user", "assistant", "tool"]);
  expect(messages(3)[5].content).toBe("retry summary");
  expect(messages(3)[7]).toMatchObject({ toolCallId: "b" });
  expect(result.steps[1].attempts).toHaveLength(2);
  expect(result.steps[1].attempts[0].contextCompaction?.status).toBe("compacted");
  expect(result.steps[1].attempts[1].contextCompaction?.replacement?.summary).toBe("retry summary");
});

it.each([compact(1), compact(99), { ...compact(2), afterTokens: 2000 }])("invalid patches fail closed without a correction retry or Tool execution", async contextCompaction => {
  request.mockResolvedValueOnce(tool("a"));
  request.mockResolvedValueOnce({ ...tool("must-not-execute"), contextCompaction });
  const loop = createTestAgentLoop({ tools: [], definition });
  await expect(loop.run("task", {})).rejects.toThrow("Invalid contextCompaction");
  expect(request).toHaveBeenCalledTimes(2);
});

it("preserves images through compaction and reports failed compaction unchanged", async () => {
  const image = { blob: fixtureBlob("data:image/png;base64,YQ=="), width: 1, height: 1 };
  request.mockResolvedValueOnce(tool("a"));
  request.mockResolvedValueOnce(tool("view", "snapshot"));
  request.mockResolvedValueOnce({ ...tool("c"), contextCompaction: compact(2) });
  request.mockResolvedValueOnce({ ...tool("d"), contextCompaction: {
    version: 2, status: "failed", strategy: "summary", beforeTokens: 1000, afterTokens: 1000, durationMs: 2, reason: "image pins tail"
  } });
  request.mockResolvedValueOnce(final());
  const loop = createTestAgentLoop({ tools: [], definition: { ...definition, captureSnapshot: async () => ({ image, metadata: { view: 1 } }) } });
  const trace = new AgentTraceStore({ enabled: true });
  trace.begin({ input: "task", inputSource: "text" });
  loop.subscribe(event => trace.captureAgentEvent(event));
  await loop.run("task", { debugMode: true });
  for (const index of [2, 3, 4]) expect(messages(index).filter(m => m.role === "user" && m.image)).toEqual([
    expect.objectContaining({ image })
  ]);
  expect(messages(4).slice(5, -3)).toEqual(messages(3).slice(5, -1));
  expect(trace.exportCurrentTrace()).not.toContain("data:image/png;base64,YQ==");
});


it("cancellation discards late compaction and a new task starts from its own context", async () => {
  let resolve!: (result: AsapChatResult) => void;
  request.mockResolvedValueOnce(tool("a"));
  request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const loop = createTestAgentLoop({ tools: [], definition });
  const running = loop.run("cancelled task", {});
  const rejected = expect(running).rejects.toThrow("cancelled");
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  loop.cancel();
  resolve({ ...tool("late"), contextCompaction: compact(2) });
  await rejected;
  request.mockResolvedValueOnce(final());
  await loop.run("new task", {});
  expect(messages(2)).toHaveLength(6);
  expect(JSON.parse(messages(2)[3].content).instruction).toBe("new task");
  expect(request.mock.calls[2][0].contextCompaction).toEqual({ version: 2, protectedPrefixLength: 6 });
});


it("continues from the compacted transcript without resurrecting discarded Tool pairs", async () => {
  request.mockResolvedValueOnce(tool("old"));
  request.mockResolvedValueOnce({ ...tool("kept"), contextCompaction: compact(2, "retained summary") });
  request.mockImplementationOnce(({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  request.mockResolvedValueOnce(final());
  const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition }) });
  const running = session.run("task");
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  await session.stop();
  await expect(running).rejects.toThrow("cancelled");
  await (await session.continue()).completion;
  const restored = messages(3).slice(5, -1);
  expect(restored[0].content).toBe("retained summary");
  expect(restored.some(message => message.role === "tool" && message.toolCallId === "old")).toBe(false);
  expect(restored.some(message => message.role === "tool" && message.toolCallId === "kept")).toBe(true);
});
