import { expect, it, vi } from "vitest";
import { AgentTraceStore } from "@galacean/engine-ai-chat/ai-chat/agent-trace.ts";
import { projectTrajectory } from "@galacean/engine-ai-chat/ai-chat/trajectory/trajectory-model.ts";
import { adaptTrace } from "../../demos/agent-trajectory/trace-adapter";
import { createTestAgentLoop } from "../../../packages/ai-chat/tests/AIChatTestRuntime";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat, type AsapChatResult } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";

const startedAt = "2026-10-23T00:00:00Z";
const telemetry = { modelName: "test-route", usage: {
  source: "provider", inputTokens: 2695, outputTokens: 145, cachedInputTokens: 2304, totalTokens: 2840
} };
function usageTrace(attempts: unknown[]) {
  return projectTrajectory({ schemaVersion: 1, interactionId: "usage", startedAt, status: "completed",
    input: { text: "inspect", source: "text" }, agentEvents: [
      { elapsedMilliseconds: 0, event: { type: "model_started", step: 1 } },
      { elapsedMilliseconds: 10, event: { type: "model_finished", step: {
        step: 1, decision: { type: "final", message: "done" }, attempts
      } } }
    ] });
}

it("displays ASAP total input and cache without counting cache twice in DSH", () => {
  const doc = usageTrace([{ attempt: 1, error: null, rawContent: "done", telemetry }]);
  expect(doc.requests[0].usage).toEqual({ input: 391, cacheRead: 2304, output: 145 });
  const view = adaptTrace(doc);
  expect(view.requests[0].usage).toMatchObject({ input: 391, cacheRead: 2304, output: 145 });
  const message = view.turns.flatMap(t => t.groups.flatMap(g => g.cells)).find(c => c.kind === "message")!;
  expect(message.input! + message.cacheRead!).toBe(2695);
  expect(message.assistantMetrics?.usageProvided).toBe(true);
  expect(message.assistantMetrics?.firstTokenTime).toBeNull();
  expect(message.think).toBeUndefined();
  expect(message.cacheWrite).toBeUndefined();
});

it.each([
  [{ source: "provider", inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }, { input: 0, output: 0, cacheRead: 0 }],
  [{ source: "provider", inputTokens: 10 }, { input: 10 }],
  [{ source: "provider", outputTokens: 5 }, { output: 5 }],
  [{ source: "provider", totalTokens: 99 }, undefined],
  [{ source: "provider", inputTokens: 10, cachedInputTokens: 11 }, { input: 10 }],
  [{ source: "estimated", inputTokens: 99 }, undefined],
  [undefined, undefined]
])("keeps optional ASAP counters, zero and unavailable distinct (%#)", (usage, expected) => {
  const doc = usageTrace([{ attempt: 1, error: null, telemetry: { modelName: "test-route", usage } }]);
  expect(doc.requests[0].usage).toEqual(expected);
});

it("does not borrow a previous response's usage when the accepted response did not report it", () => {
  const doc = usageTrace([
    { attempt: 1, error: "retry", telemetry },
    { attempt: 2, error: null, telemetry: { modelName: "test-route" } }
  ]);
  expect(doc.requests[0].usage).toBeUndefined();
});

it("retains legacy DSH bucket semantics without subtracting cache again", () => {
  const doc = usageTrace([{ attempt: 1, error: null, usage: {
    inputTokens: 391, cacheReadTokens: 2304, outputTokens: 145, reasoningTokens: 2
  } }]);
  expect(doc.requests[0].usage).toEqual({ input: 391, cacheRead: 2304, output: 145, thinking: 2 });
});

const tool = (id: string): AsapChatResult => ({ content: "", finishReason: "tool_calls", toolCalls: [{
  id, type: "function", function: { name: "glob", arguments: JSON.stringify({pattern:"**"}) }
}] });

it.each(["none", "once", "repeated"])("keeps canonical Context across real loop compaction=%s, including legacy exports", async mode => {
  const compact = mode !== "none";
  const request = vi.mocked(requestAsapChat).mockReset();
  request.mockResolvedValueOnce(tool("one")).mockResolvedValueOnce(tool("two"));
  request.mockResolvedValueOnce({ ...tool("three"), ...(compact ? { contextCompaction: {
    version: 2 as const, status: "compacted" as const, strategy: "summary" as const,
    beforeTokens: 1000, afterTokens: 400, durationMs: 3,
    replacement: { prefixLength: 5 as const, cutIndex: 4, summary: "server summary" }
  } } : {}) });
  if (mode === "repeated") request.mockResolvedValueOnce({ ...tool("four"), contextCompaction: {
    version: 2, status: "compacted", strategy: "summary", beforeTokens: 1000, afterTokens: 400, durationMs: 3,
    replacement: { prefixLength: 5, cutIndex: 4, summary: "second summary" }
  } });
  request.mockResolvedValueOnce({ content: "done", finishReason: "stop", toolCalls: [] });
  let diagnostic = 0;
  const loop = createTestAgentLoop({ tools: [], definition: {
    scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [],
    runtimeDiagnostics: () => [{ id: `error-${++diagnostic}`, occurredAt: startedAt, message: `ERROR_${diagnostic}` }]
  } });
  const store = new AgentTraceStore({ enabled: true });
  const id = store.begin({ input: "inspect", inputSource: "text" });
  const unsubscribe = loop.subscribe(e => store.captureAgentEvent(e));
  try {
    await loop.run("inspect", { debugMode: true });
    store.finish(id, "completed");
    const exported = JSON.parse((await store.exportLastTrace())!);
    for (const legacy of [false, true]) {
      const record = structuredClone(exported);
      if (legacy) record.agentEvents = record.agentEvents.filter(({ event }: any) => event.type !== "transcript_appended");
      const doc = projectTrajectory(record);
      const contexts = doc.cells.filter(c => c.kind === "context" && c.inputDetail?.includes('"contextKind":"runtime_errors"'));
      expect(contexts.map(c => JSON.parse(c.inputDetail!).errors[0].message)).toEqual(
        Array.from({ length: mode === "repeated" ? 5 : 4 }, (_, i) => `ERROR_${i + 1}`));
      expect(doc.cells.filter(c => c.kind === "compacted").map(c => c.outputDetail)).toEqual(
        mode === "repeated" ? ["server summary", "second summary"] : compact ? ["server summary"] : []);
      expect(doc.cells.filter(c => c.kind === "user")).toHaveLength(1);
      expect(doc.requests).toHaveLength(mode === "repeated" ? 5 : 4);
    }
  } finally { unsubscribe(); loop.cancel(); }
});

it("retains distinct equal appended contexts even without a following model request", () => {
  const message = { role: "user", content: '{"contextKind":"runtime_errors","errors":["same"]}' };
  const doc = projectTrajectory({ schemaVersion: 1, interactionId: "cancelled", startedAt, status: "cancelled",
    input: { text: "inspect", source: "text" }, agentEvents: [
      { elapsedMilliseconds: 1, event: { type: "transcript_appended", messages: [message, message] } },
      { elapsedMilliseconds: 2, event: { type: "transcript_appended", messages: [message] } }
    ] });
  const contexts = doc.cells.filter(c => c.kind === "context");
  expect(contexts).toHaveLength(3);
  expect(new Set(contexts.map(c => c.id)).size).toBe(3);
});
