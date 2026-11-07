import { createTestAgentLoop } from "../../../packages/ai-chat/tests/AIChatTestRuntime";
import { fixtureBlob, serializedImages } from "../../../packages/ai-chat/tests/image-fixture";
import { imageDataUrl, ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources.ts";
import { expect, it, vi } from "vitest";
import { AgentLoop } from "@galacean/engine-ai-chat/ai-chat/agent-loop.ts";
import { AgentTraceStore } from "@galacean/engine-ai-chat/ai-chat/agent-trace.ts";
import { MemoryTraceAttachments } from "../../../packages/ai-chat/tests/MemoryTraceAttachments";
import { tinyPng } from "./fixture";
import { parseTrajectoryJson, projectTrajectory } from "@galacean/engine-ai-chat/ai-chat/trajectory/trajectory-model.ts";
import { adaptTrace } from "../../demos/agent-trajectory/trace-adapter";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";

async function capture(kind: "read_tool" | "snapshot", reuse: boolean, mode: "plain" | "compacted" | "retry" | "retry-call" = "plain") {
  const request = vi.mocked(requestAsapChat).mockReset();
  // Images pin the compaction tail; remove a preceding text-only exchange instead.
  if (kind === "snapshot" && mode === "compacted") request.mockResolvedValueOnce({
    content: "", finishReason: "tool_calls", toolCalls: [{ id: "call_0", type: "function", function: {
      name: "read", arguments: JSON.stringify({file_path:"skills/fixture/README.md"})
    } }]
  });
  const paths = mode === "compacted"
    ? ["skills/fixture/README.md", "skills/fixture/notes.md", "skills/fixture/README.md"] : ["skills/fixture/README.md", "skills/fixture/notes.md"];
  for (const [index, file_path] of paths.entries()) {
    if (index === 1 && mode === "retry") request.mockResolvedValueOnce({ content: "", finishReason: "stop", toolCalls: [] });
    if (index === 1 && mode === "retry-call") request.mockResolvedValueOnce({ content: "", finishReason: "tool_calls", toolCalls: [{
      id: "", type: "function", function: { name: "execute", arguments: '{"code":42}' }
    }] });
    request.mockResolvedValueOnce({ content: "", finishReason: "tool_calls", toolCalls: [{
      id: reuse ? "call_0" : file_path, type: "function", function: { name: kind === "read_tool" ? "read" : kind,
        arguments: JSON.stringify(kind === "read_tool" ? { file_path } : {}) }
    }], ...(index === 2 && mode === "compacted" ? { contextCompaction: {
      version: 2 as const, status: "compacted" as const, strategy: "summary" as const,
      beforeTokens: 1000, afterTokens: 400, durationMs: 3,
      replacement: { prefixLength: 5 as const, cutIndex: 2, summary: "first exchange" }
    } } : {}) });
  }
  request.mockResolvedValueOnce({ content: "done", finishReason: "stop", toolCalls: [] });
  let captures = 0;
  const loop = createTestAgentLoop({ tools: [], definition: {
    toolNames: [], scriptApi: { hostNotes: "First file", entries: [], modules: [],
      documents: [{ path: "skills/fixture/README.md", content: "First file" }, { path: "skills/fixture/notes.md", content: "Second file" }] },
    captureSnapshot: async () => ({ image: { blob: fixtureBlob(tinyPng), width: 1, height: 1 }, metadata: { capture: ++captures } })
  } });
  const store = new AgentTraceStore({ enabled: true, attachmentStorage: new MemoryTraceAttachments() });
  const id = store.begin({ input: "inspect", inputSource: "text" });
  const off = loop.subscribe(event => store.captureAgentEvent(event));
  try {
    await loop.run("inspect", { debugMode: true });
    store.finish(id, "completed");
    return JSON.parse((await store.exportLastTrace())!);
  } finally { off(); loop.cancel(); }
}

it.each([false, true])("keeps native arguments scoped to their accepted response (reuse=%s)", async reuse => {
  const document = projectTrajectory(await capture("read_tool", reuse));
  const cells = adaptTrace(document).turns.flatMap(turn => turn.groups.flatMap(group => group.cells));
  const tools = cells.filter(cell => cell.kind === "tool");
  expect(tools[0].inputDetail).toContain("skills/fixture/README.md");
  expect(tools[1].inputDetail).toContain("skills/fixture/notes.md");
  expect(tools.map(cell => cell.callId)).toEqual(reuse ? ["call_0", "call_0"] : ["skills/fixture/README.md", "skills/fixture/notes.md"]);
  const assistant = document.cells.find(cell => cell.kind === "assistant")!;
  expect(cells.find(cell => cell.recordId === assistant.id)?.inputDetail).toBe(assistant.inputDetail);
});

function omitSummaryIds(trace: Awaited<ReturnType<typeof capture>>, legacy: boolean) {
  const partial = structuredClone(trace);
  if (legacy) partial.agentEvents = partial.agentEvents.filter((entry: { event: { type: string } }) => entry.event.type !== "transcript_appended");
  for (const { event } of partial.agentEvents) if (event.type === "model_finished") delete event.step.toolCallId;
  return partial;
}

it.each([false, true])("imports missing summary IDs using accepted-call identities (reuse=%s)", async reuse => {
  const original = await capture("read_tool", reuse);
  for (const legacy of [false, true]) {
    const partial = omitSummaryIds(original, legacy);
    const document = parseTrajectoryJson(JSON.stringify(partial));
    const view = adaptTrace(document);
    const tools = view.turns.flatMap(turn => turn.groups.flatMap(group => group.cells)).filter(cell => cell.kind === "tool");
    expect(tools.map(cell => cell.callId)).toEqual(reuse ? ["call_0", "call_0"] : ["skills/fixture/README.md", "skills/fixture/notes.md"]);
    expect(tools.map(cell => cell.outputDetail)).toEqual([expect.stringContaining("First file"), expect.stringContaining("Second file")]);
    expect(tools[0].inputDetail).toContain("skills/fixture/README.md");
    expect(tools[1].inputDetail).toContain("skills/fixture/notes.md");
    expect(document.records[0]).toEqual(partial);
  }
});

it.each([false, true])("uses normalized IDs for ungrouped legacy receipts without guessing (reuse=%s)", async reuse => {
  const partial = omitSummaryIds(await capture("read_tool", reuse), true);
  for (const { event } of partial.agentEvents) if (event.type === "model_request") {
    event.messages = event.messages.filter((message: { role: string }) => message.role === "tool");
  }
  const tools = parseTrajectoryJson(JSON.stringify(partial)).cells.filter(cell => cell.kind === "tool");
  expect(tools[0].outputDetail).toContain("First file");
  if (reuse) expect(tools[1].outputDetail).toContain("Second file");
  else expect(tools[1].outputDetail).toContain("Second file");
});

it.each([false, true])("retains screenshot outputs and Context with missing summary IDs (reuse=%s)", async reuse => {
  const original = await capture("snapshot", reuse);
  for (const legacy of [false, true]) {
    const view = adaptTrace(parseTrajectoryJson(JSON.stringify(omitSummaryIds(original, legacy))));
    const cells = view.turns.flatMap(turn => turn.groups.flatMap(group => group.cells));
    const tools = cells.filter(cell => cell.kind === "tool");
    const contexts = cells.filter(cell => cell.kind === "context" && cell.inputDetail?.includes('"contextKind":"view_observation"'));
    expect(tools).toHaveLength(2);
    expect(contexts).toHaveLength(2);
    expect(contexts.map(cell => JSON.parse(cell.inputDetail!).metadata.capture)).toEqual([1, 2]);
    for (const cell of tools) expect(cell.outputBlocks?.some(block => block.attachment)).toBe(true);
    for (const cell of contexts) expect(cell.sourceBlocks?.some(block => block.attachment)).toBe(true);
  }
});

it("does not normalize a missing summary ID from a rejected retry", async () => {
  const original = await capture("read_tool", true, "retry-call");
  for (const legacy of [false, true]) {
    const document = parseTrajectoryJson(JSON.stringify(omitSummaryIds(original, legacy)));
    const tools = document.cells.filter(cell => cell.kind === "tool");
    expect(tools.map(cell => cell.callId)).toEqual(["call_0", "call_0"]);
    expect(tools[1].outputDetail).toContain("Second file");
    expect(document.cells.find(cell => cell.kind === "assistant" && cell.step === 2)?.rawDetail).toMatchObject({
      attempts: [expect.objectContaining({ error: expect.any(String) }), expect.objectContaining({ error: null })]
    });
  }
});

it.each([false, true])("keeps both actual screenshot inputs without duplicating replayed history (reuse=%s)", async reuse => {
  const document = projectTrajectory(await capture("snapshot", reuse));
  const inputs = document.cells.filter(cell => cell.kind === "context" && cell.inputDetail?.includes('"contextKind":"view_observation"'));
  expect(inputs).toHaveLength(2);
  expect(inputs.map(cell => JSON.parse(cell.inputDetail!).metadata.capture)).toEqual([1, 2]);
  expect(new Set(inputs.map(cell => cell.id)).size).toBe(2);
  const rendered = adaptTrace(document).turns.flatMap(turn => turn.groups.flatMap(group => group.cells));
  expect(rendered.filter(cell => cell.kind === "context").every(cell => cell.sourceBlocks?.some(block => block.attachment))).toBe(true);
});

it.each([false, true])("pairs legacy request receipts with the correct exchange (reuse=%s)", async reuse => {
  const trace = await capture("read_tool", reuse);
  trace.agentEvents = trace.agentEvents.filter((entry: { event: { type: string } }) => entry.event.type !== "transcript_appended");
  const tools = projectTrajectory(trace).cells.filter(cell => cell.kind === "tool");
  expect(tools[0].outputDetail).toContain("First file");
  expect(tools[1].outputDetail).toContain("Second file");
});

it.each(["compacted", "retry"] as const)("keeps group identities across %s in current and legacy exports", async mode => {
  for (const kind of ["read_tool", "snapshot"] as const) {
    const original = await capture(kind, true, mode);
    for (const legacy of [false, true]) {
      const trace = structuredClone(original);
      if (legacy) trace.agentEvents = trace.agentEvents.filter((entry: { event: { type: string } }) => entry.event.type !== "transcript_appended");
      const document = projectTrajectory(trace);
      const tools = document.cells.filter(cell => cell.kind === "tool" && cell.toolName === (kind === "read_tool" ? "read" : kind));
      expect(tools).toHaveLength(mode === "compacted" ? 3 : 2);
      expect(tools.every(cell => cell.status === "completed")).toBe(true);
      if (kind === "read_tool") {
        const contents = mode === "compacted" ? ["First file", "Second file", "First file"] : ["First file", "Second file"];
        expect(tools.map(cell => cell.outputDetail)).toEqual(contents.map(content => expect.stringContaining(content)));
      } else {
        const inputs = document.cells.filter(cell => cell.kind === "context" && cell.inputDetail?.includes('"contextKind":"view_observation"'));
        expect(inputs.map(cell => JSON.parse(cell.inputDetail!).metadata.capture)).toEqual(
          mode === "compacted" ? [1, 2, 3] : [1, 2]);
        expect(inputs.map(cell => (cell.messageSource as { step: number }).step)).toEqual(
          mode === "compacted" ? [2, 3, 4] : [1, 2]);
      }
    }
  }
});

it("uses authoritative script results even in a partial legacy snapshot", async () => {
  const trace = await capture("read_tool", true);
  trace.agentEvents = trace.agentEvents.filter((entry: { event: { type: string } }) => entry.event.type !== "transcript_appended");
  const request = trace.agentEvents.find((entry: { event: { type: string; step: number } }) =>
    entry.event.type === "model_request" && entry.event.step === 3).event;
  request.messages = request.messages.filter((message: { role: string }) => message.role === "tool");
  const tools = projectTrajectory(trace).cells.filter(cell => cell.kind === "tool");
  expect(tools[0].outputDetail).toContain("First file");
  expect(tools[1].outputDetail).toContain("Second file");
});

it("retains the second reused call's receipt when cancelled before the next request", async () => {
  const trace = await capture("read_tool", true);
  const nextRequest = trace.agentEvents.findIndex((entry: { event: { type: string; step: number } }) =>
    entry.event.type === "model_started" && entry.event.step === 3);
  trace.agentEvents = trace.agentEvents.slice(0, nextRequest);
  trace.status = "cancelled";
  const tools = projectTrajectory(trace).cells.filter(cell => cell.kind === "tool");
  expect(tools.map(cell => cell.status)).toEqual(["completed", "completed"]);
  expect(tools[0].outputDetail).toContain("First file");
  expect(tools[1].outputDetail).toContain("Second file");
});
