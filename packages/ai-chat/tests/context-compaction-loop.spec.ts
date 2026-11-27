import { fixtureBlob } from "./image-fixture";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/ai-chat/asap-chat", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat, type AsapChatResult } from "../src/ai-chat/asap-chat";
import { createTestAgentLoop } from "./AIChatTestRuntime";
import { AIChatSession } from "../src/ai-chat/ai-chat-session";
import { readSystemInjection } from "../src/ai-chat/agent-protocol";
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
    replacement: { prefixLength: 3, cutIndex, summary } };
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
  request.mockResolvedValueOnce({ ...tool("b"), contextCompaction: compact(3, "first summary") });
  request.mockResolvedValueOnce({ ...tool("c"), contextCompaction: compact(3, "second summary") });
  request.mockResolvedValueOnce(final());
  const result = await loop.run("original task", { debugMode: true, contextCompaction: { triggerTokens: 1000, targetTokens: 400 } });
  expect(messages(2).slice(3, -1).map(m => m.role)).toEqual(["user", "assistant", "tool"]);
  expect(messages(2)[3].content).toBe("first summary");
  expect(messages(2)[5]).toMatchObject({ role: "tool", toolCallId: "b" });
  expect(messages(3)[3].content).toBe("second summary");
  expect(messages(3)[5]).toMatchObject({ role: "tool", toolCallId: "c" });
  expect(JSON.stringify(messages(3))).not.toContain("first summary");
  for (let i = 0; i < 4; i++) {
    expect(JSON.parse(readSystemInjection(messages(i).at(-1)!.content)!.body)).toMatchObject({ snapshot: { round: i + 1 } });
    expect(request.mock.calls[i][0].contextCompaction).toEqual({ version: 2, protectedPrefixLength: 3, triggerTokens: 1000, targetTokens: 400 });
  }
  expect(readSystemInjection(messages(0)[3].content)!.trailing).toBe("original task");
  const canonical = trace.getCurrentTrace()!.agentEvents.flatMap(({ event }: any) => event.type === "transcript_appended" ? event.messages : []) as AgentMessage[];
  expect(canonical.filter(m => m.role === "tool").map(m => m.toolCallId)).toEqual(["a", "b", "c"]);
  expect(canonical.at(-1)).toEqual({ role: "assistant", content: "done" });
  expect(JSON.stringify(canonical)).not.toContain("summary");
  expect(result.steps[1].attempts[0].contextCompaction).toEqual(compact(3, "first summary"));
});

it("protocol retries consume each response once and never resurrect pre-compaction history", async () => {
  request.mockResolvedValueOnce(tool("a"));
  request.mockResolvedValueOnce({ content: "", toolCalls: [], finishReason: "stop", contextCompaction: compact(3),
    error: { code: "MODEL_EMPTY_OUTPUT", message: "模型没有返回 Tool Call 或最终回复" } });
  request.mockResolvedValueOnce({ ...tool("b"), contextCompaction: compact(1, "retry summary") });
  request.mockResolvedValueOnce(final());
  const loop = createTestAgentLoop({ tools: [], definition });
  const result = await loop.run("task", {});
  expect(messages(2)[3]).toEqual({ role: "user", content: "server summary" });
  expect(messages(2).at(-1)!.content).toContain("agent_protocol_correction");
  expect(JSON.stringify(messages(2))).not.toContain('"id":"a"');
  expect(messages(3).slice(3, -1).map(m => m.role)).toEqual(["user", "assistant", "tool"]);
  expect(messages(3)[3].content).toBe("retry summary");
  expect(messages(3)[5]).toMatchObject({ toolCallId: "b" });
  expect(result.steps[1].attempts).toHaveLength(2);
  expect(result.steps[1].attempts[0].contextCompaction?.status).toBe("compacted");
  expect(result.steps[1].attempts[0].errorCode).toBe("MODEL_EMPTY_OUTPUT");
  expect(result.steps[1].attempts[1].contextCompaction?.replacement?.summary).toBe("retry summary");
});

it.each([compact(2), compact(99), { ...compact(3), afterTokens: 2000 }])("invalid patches fail closed without a correction retry or Tool execution", async contextCompaction => {
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
  request.mockResolvedValueOnce({ ...tool("c"), contextCompaction: compact(3) });
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
  expect(messages(4).slice(3, -3)).toEqual(messages(3).slice(3, -1));
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
  resolve({ ...tool("late"), contextCompaction: compact(3) });
  await rejected;
  request.mockResolvedValueOnce(final());
  await loop.run("new task", {});
  expect(messages(2)).toHaveLength(5);
  expect(readSystemInjection(messages(2)[3].content)!.trailing).toBe("new task");
  expect(request.mock.calls[2][0].contextCompaction).toEqual({ version: 2, protectedPrefixLength: 3 });
});


it("continues from the compacted transcript without resurrecting discarded Tool pairs", async () => {
  request.mockResolvedValueOnce(tool("old"));
  request.mockResolvedValueOnce({ ...tool("kept"), contextCompaction: compact(3, "retained summary") });
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
  const restored = messages(3).slice(3, -1);
  expect(restored[0].content).toBe("retained summary");
  expect(restored.some(message => message.role === "tool" && message.toolCallId === "old")).toBe(false);
  expect(restored.some(message => message.role === "tool" && message.toolCallId === "kept")).toBe(true);
});

it("offloads already-seen images to unblock server compaction after a non-reducing failure", async () => {
  const image = { blob: fixtureBlob("data:image/png;base64,YQ=="), width: 1, height: 1 };
  request.mockResolvedValueOnce(tool("view", "snapshot"));
  request.mockResolvedValueOnce(tool("a"));
  request.mockResolvedValueOnce({
    ...tool("b"),
    contextCompaction: {
      version: 2,
      status: "failed",
      strategy: "summary",
      beforeTokens: 50000,
      afterTokens: 50000,
      durationMs: 5000,
      reason: "the rebuilt context did not reduce the estimated token count"
    }
  });
  request.mockResolvedValueOnce({ ...tool("c"), contextCompaction: compact(6, "unblocked summary") });
  request.mockResolvedValueOnce(final());

  const loop = createTestAgentLoop({
    tools: [],
    definition: { ...definition, captureSnapshot: async () => ({ image, metadata: { view: 1 } }) }
  });
  await loop.run("task", { contextCompaction: { triggerTokens: 48000, targetTokens: 20000 } });

  // Before the failure, the snapshot image was sent to the model.
  expect(messages(1).some((m) => m.role === "user" && m.image)).toBe(true);
  expect(messages(2).some((m) => m.role === "user" && m.image)).toBe(true);
  // After the non-reducing failure, the already-seen image payload is offloaded to text while keeping imagePath,
  // and compaction is retried immediately on the next round.
  expect(messages(3).some((m) => m.role === "user" && m.image)).toBe(false);
  expect(messages(3).some((m) => m.role === "user" && m.content.includes("Image offloaded from this request"))).toBe(true);
  expect(request.mock.calls[3][0].contextCompaction).toEqual({
    version: 2,
    protectedPrefixLength: 3,
    triggerTokens: 48000,
    targetTokens: 20000
  });
  expect(messages(4)[3]).toEqual({ role: "user", content: "unblocked summary" });
});

it("backs off compaction retries when no seen images remain to offload and resumes after transcript growth", async () => {
  const failedCompaction: ContextCompactionResult = {
    version: 2,
    status: "failed",
    strategy: "summary",
    beforeTokens: 50000,
    afterTokens: 50000,
    durationMs: 4000,
    reason: "the rebuilt context did not reduce the estimated token count"
  };
  request.mockResolvedValueOnce({ ...tool("a"), contextCompaction: failedCompaction });
  request.mockResolvedValueOnce(tool("b"));
  request.mockResolvedValueOnce(tool("c"));
  request.mockResolvedValueOnce(tool("d"));
  request.mockResolvedValueOnce(final());

  const loop = createTestAgentLoop({ tools: [], definition });
  await loop.run("task", { contextCompaction: { triggerTokens: 48000, targetTokens: 20000 } });

  // Round 0 sends compaction and fails with nothing to offload -> next 2 rounds (+2, +4 msgs) omit compaction.
  expect(request.mock.calls[0][0].contextCompaction).toBeDefined();
  expect(request.mock.calls[1][0].contextCompaction).toBeUndefined();
  expect(request.mock.calls[2][0].contextCompaction).toBeUndefined();
  // By Round 3 (+6 messages appended: 3 assistant+tool pairs), compaction resumes.
  expect(request.mock.calls[3][0].contextCompaction).toEqual({
    version: 2,
    protectedPrefixLength: 3,
    triggerTokens: 48000,
    targetTokens: 20000
  });
});

it("retains a newly arrived image for at least one follow-up round before offloading on compaction failure", async () => {
  const image = { blob: fixtureBlob("data:image/png;base64,YQ=="), width: 1, height: 1 };
  const failedCompaction: ContextCompactionResult = {
    version: 2,
    status: "failed",
    strategy: "summary",
    beforeTokens: 50000,
    afterTokens: 50000,
    durationMs: 3000,
    reason: "no replaceable messages are available for summarization"
  };
  request.mockResolvedValueOnce(tool("view", "snapshot"));
  // On round 1, the snapshot image arrived after the previous assistant turn (tool("view")).
  // When compaction fails during round 1 (before round 1's assistant message is appended), keep
  // the fresh image for the follow-up round so multi-step tool chains retain visual continuity.
  request.mockResolvedValueOnce({ ...tool("a"), contextCompaction: failedCompaction });
  request.mockResolvedValueOnce(final());

  const loop = createTestAgentLoop({
    tools: [],
    definition: { ...definition, captureSnapshot: async () => ({ image, metadata: { view: 1 } }) }
  });
  await loop.run("task", { contextCompaction: { triggerTokens: 48000, targetTokens: 20000 } });

  // Freshly arrived snapshot stays intact in round 2 while backoff suppresses immediate compaction retry.
  expect(messages(2).some((m) => m.role === "user" && m.image)).toBe(true);
  expect(request.mock.calls[2][0].contextCompaction).toBeUndefined();
});

it("preserves explicit caller triggerTokens without stepping up after in-task compaction", async () => {
  for (const triggerTokens of [47_999, 48_000, 120_000]) {
    request.mockReset();
    request.mockResolvedValueOnce({ ...tool("a"), telemetry: { inputLimitTokens: 500_000 } });
    request.mockResolvedValueOnce({
      ...tool("b"),
      telemetry: { inputLimitTokens: 500_000 },
      contextCompaction: compact(3, "mid-task summary")
    });
    request.mockResolvedValueOnce(final());

    const loop = createTestAgentLoop({ tools: [], definition });
    await loop.run("explicit budget task", { contextCompaction: { triggerTokens, targetTokens: 20_000 } });

    expect(request.mock.calls[1][0].contextCompaction).toEqual({
      version: 2,
      protectedPrefixLength: 3,
      triggerTokens,
      targetTokens: 20_000
    });
    expect(request.mock.calls[2][0].contextCompaction).toEqual({
      version: 2,
      protectedPrefixLength: 3,
      triggerTokens,
      targetTokens: 20_000
    });
  }
});

it("applies telemetry-adaptive session compaction budgets and steps up only on automatic budgets", async () => {
  const { AIChatSession } = await import("../src/ai-chat/ai-chat-session");
  request.mockResolvedValueOnce({ ...tool("a"), telemetry: { inputLimitTokens: 500_000 } });
  request.mockResolvedValueOnce({
    ...tool("b"),
    telemetry: { inputLimitTokens: 500_000 },
    contextCompaction: compact(3, "500k summary")
  });
  request.mockResolvedValueOnce(final());
  const session500 = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition }) });
  await session500.run("500k task");
  expect(request.mock.calls[0][0].contextCompaction).toEqual({ version: 2, protectedPrefixLength: 3 });
  expect(request.mock.calls[1][0].contextCompaction).toEqual({
    version: 2,
    protectedPrefixLength: 3,
    triggerTokens: 120_000,
    targetTokens: 50_000
  });
  expect(request.mock.calls[2][0].contextCompaction).toEqual({
    version: 2,
    protectedPrefixLength: 3,
    triggerTokens: 160_000,
    targetTokens: 50_000
  });

  // 128K window: adaptive budget and post-compaction step-up clamp strictly to floor(128_000 * 0.8) = 102_400.
  request.mockReset();
  request.mockResolvedValueOnce({ ...tool("a"), telemetry: { inputLimitTokens: 128_000 } });
  request.mockResolvedValueOnce({
    ...tool("b"),
    telemetry: { inputLimitTokens: 128_000 },
    contextCompaction: compact(3, "128k summary")
  });
  request.mockResolvedValueOnce(final());
  const session128 = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition }) });
  await session128.run("128k task");
  expect(request.mock.calls[0][0].contextCompaction).toEqual({ version: 2, protectedPrefixLength: 3 });
  expect(request.mock.calls[1][0].contextCompaction).toEqual({
    version: 2,
    protectedPrefixLength: 3,
    triggerTokens: 102_400,
    targetTokens: 50_000
  });
  expect(request.mock.calls[2][0].contextCompaction).toEqual({
    version: 2,
    protectedPrefixLength: 3,
    triggerTokens: 102_400,
    targetTokens: 50_000
  });
});

it("re-inlines a declaration dependency evicted by compaction when re-reading the retained root in AIChatSession", async () => {
  const { AIChatSession } = await import("../src/ai-chat/ai-chat-session");
  const readCall = (id: string, filePath: string): AsapChatResult => ({
    content: "",
    finishReason: "tool_calls",
    toolCalls: [{ id, type: "function", function: { name: "read", arguments: JSON.stringify({ file_path: filePath }) } }]
  });
  const defWithDecls = {
    ...definition,
    projectFiles: [
      {
        paths: () => ["declare/editor/world/common/MutationResult.d.ts", "declare/editor/world/tools/terrain.patch.d.ts"],
        read: (p: string) =>
          ({
            "declare/editor/world/common/MutationResult.d.ts": "export interface MutationResult { status: string; }",
            "declare/editor/world/tools/terrain.patch.d.ts":
              'import type { MutationResult } from "../common/MutationResult";\nexport declare function patch(): Promise<MutationResult>;'
          })[p]
      }
    ]
  };
  request.mockResolvedValueOnce(readCall("r1", "declare/editor/world/common/MutationResult.d.ts"));
  request.mockResolvedValueOnce(readCall("r2", "declare/editor/world/tools/terrain.patch.d.ts"));
  // Compaction cuts indices [0..3) (task_context + r1 assistant + r1 tool), retaining r2 (terrain.patch.d.ts).
  request.mockResolvedValueOnce({
    ...readCall("r3", "declare/editor/world/tools/terrain.patch.d.ts"),
    contextCompaction: compact(3, "evicted MutationResult.d.ts")
  });
  request.mockResolvedValueOnce(final());

  const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: defWithDecls }) });
  await session.run("patch terrain");

  const finalRequestMessages = request.mock.calls[3][0].messages as { role: string; toolCallId?: string; content: string }[];
  const r3Reply = finalRequestMessages.find((m) => m.role === "tool" && m.toolCallId === "r3");
  expect(r3Reply?.content).toContain("Already present at the time of this read");
  expect(r3Reply?.content).toContain('<dependency path="declare/editor/world/common/MutationResult.d.ts">');
  expect(r3Reply?.content).toContain("export interface MutationResult { status: string; }");
});

it.each([1, 350])("reuses an inlined declaration across rounds and restores reads at offset %s after compaction", async (offset) => {
  const sourcePath = "declare/editor/native/source.d.ts";
  const apiPath = "declare/editor/native/api.d.ts";
  const source = Array.from({ length: 393 }, (_, i) => `export type L${i + 1} = ${i + 1};`).join("\n");
  const modules = [
    { id: "declare/native/source.d.ts", source, imports: [] },
    { id: "declare/native/api.d.ts", source: 'import "./source";', imports: ["declare/native/source.d.ts"] }
  ];
  const read = (id: string, file_path: string, offset?: number): AsapChatResult => ({
    content: "",
    finishReason: "tool_calls",
    toolCalls: [{ id, type: "function", function: { name: "read", arguments: JSON.stringify({ file_path, offset }) } }]
  });
  request
    .mockResolvedValueOnce(read("api", apiPath))
    .mockResolvedValueOnce(read("reuse", sourcePath, offset))
    .mockResolvedValueOnce({ ...read("after", sourcePath, offset), contextCompaction: compact(3) })
    .mockResolvedValueOnce(final());
  const loop = createTestAgentLoop({
    definition: { ...definition, scriptApi: { ...definition.scriptApi, modules } },
    tools: []
  });
  await loop.run("inspect editor declarations", {});

  const reused = messages(2).find((message) => message.role === "tool" && message.toolCallId === "reuse")!.content;
  expect(reused).toContain("Reuse the complete copy if it is still in context. Otherwise, you can read this path again if needed.");
  expect(reused).not.toContain("Continue with read");
  const after = messages(3).find((message) => message.role === "tool" && message.toolCallId === "after")!.content;
  expect(after).toContain(`${offset}: export type L${offset} = ${offset};`);
  if (offset === 1) expect(after).toContain("Continue with read offset=");
  else expect(after).toContain("393: export type L393 = 393;");
  const remaining = messages(3).filter((message) => message.role === "tool");
  expect(remaining.map((reply) => reply.toolCallId)).toEqual(["reuse", "after"]);
  expect(remaining[0].content).toBe(reused);
});

it("resets repeated static read guidance counters after server-side compaction", async () => {
  const readSkill = (id: string): AsapChatResult => ({
    content: "",
    finishReason: "tool_calls",
    toolCalls: [
      { id, type: "function", function: { name: "read", arguments: JSON.stringify({ file_path: "skills/demo/SKILL.md" }) } }
    ]
  });
  const defWithSkill = {
    ...definition,
    projectFiles: [{ paths: () => ["skills/demo/SKILL.md"], read: (p: string) => (p === "skills/demo/SKILL.md" ? "# Demo" : undefined) }]
  };
  request.mockResolvedValueOnce(readSkill("r1"));
  request.mockResolvedValueOnce({ ...readSkill("r2"), contextCompaction: compact(3, "compacted summary") });
  request.mockResolvedValueOnce(final());

  const loop = createTestAgentLoop({ tools: [], definition: defWithSkill });
  await loop.run("re-read after compaction", {});

  const round3Messages = request.mock.calls[2][0].messages as { role: string; content: string }[];
  expect(
    round3Messages.some((m) => m.role === "user" && typeof m.content === "string" && m.content.includes('type="loop_guidance"'))
  ).toBe(false);
});
