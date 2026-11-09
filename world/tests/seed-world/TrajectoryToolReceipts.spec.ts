import { createTestAgentLoop } from "../../../packages/ai-chat/tests/AIChatTestRuntime";
import { fixtureBlob, serializedImages } from "../../../packages/ai-chat/tests/image-fixture";
import { imageDataUrl, ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources.ts";
import { expect, it, vi } from "vitest";
import { AgentLoop, AgentCancelledError } from "@galacean/engine-ai-chat/ai-chat/agent-loop.ts";
import { AgentTraceStore, type AgentTraceSnapshot } from "@galacean/engine-ai-chat/ai-chat/agent-trace.ts";
import { projectTrajectory } from "@galacean/engine-ai-chat/ai-chat/trajectory/trajectory-model.ts";
import { adaptTrace } from "../../demos/agent-trajectory/trace-adapter";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";

it.each(["read_tool", "list_tool"])("retains successful %s when cancelled before the next request", async tool => {
  const request = vi.mocked(requestAsapChat).mockReset().mockResolvedValueOnce({
    content: "", finishReason: "tool_calls", toolCalls: [{ id: "call-1", type: "function", function: {
      name: tool === "read_tool" ? "read" : tool === "list_tool" ? "glob" : "grep", arguments: JSON.stringify(tool === "read_tool" ? {file_path:"skills/fixture/README.md"} : tool === "list_tool" ? {pattern:"**",path:"skills"} : {path:"skills",pattern:"API"})
    } }]
  });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let thumbnails = 0;
  const loop = createTestAgentLoop({ tools: [], definition: {
    toolNames: [], scriptApi: { hostNotes: "API", entries: [], modules: [], documents: [{ path: "skills/fixture/README.md", content: "API" }] },
    provideWorldThumbnail: async () => {
      if (++thumbnails === 2) { entered.resolve(); await release.promise; }
      return null;
    }
  } });
  const store = new AgentTraceStore({ enabled: true });
  const unsubscribe = loop.subscribe(event => store.captureAgentEvent(event));
  const id = store.begin({ input: "inspect", inputSource: "text" });
  const task = loop.run("inspect", { debugMode: true }).catch(error => error);
  try {
    await Promise.race([entered.promise, task.then(() => { throw new Error("Task ended before the cancellation boundary"); })]);
    const live = projectTrajectory(JSON.parse((await store.exportCurrentTrace())!));
    expect(live.cells.find(cell => cell.kind === "tool")).toMatchObject({ status: "completed", isError: false });
    loop.cancel();
    release.resolve();
    expect(await task).toBeInstanceOf(AgentCancelledError);
    store.finish(id, "cancelled");
    expect(request).toHaveBeenCalledTimes(1);
    const document = projectTrajectory(JSON.parse((await store.exportLastTrace())!));
    const cell = document.cells.find(cell => cell.kind === "tool")!;
    expect(cell).toMatchObject({ callId: "call-1", status: "completed", isError: false });
    expect(cell.outputDetail).toBeTruthy();
    expect(cell.durationMilliseconds).toBe(live.cells.find(cell => cell.kind === "tool")!.durationMilliseconds);
    const rendered = adaptTrace(document).turns.flatMap(turn => turn.groups.flatMap(group => group.cells));
    expect(rendered.find(cell => cell.kind === "tool")).toMatchObject({ callId: "call-1", isError: false });
  } finally {
    loop.cancel(); release.resolve(); await task; unsubscribe();
  }
});

const event = (elapsedMilliseconds: number, event: unknown) => ({ elapsedMilliseconds, event });
const call = (step: number, toolCallId?: string, type = "read_tool") => ({ type: "model_finished", step: {
  step, toolCallId, decision: { type, file_path: "skills/fixture/README.md" }, attempts: []
} });
const receipt = (toolCallId: string | undefined, ok = true) => ({ role: "tool", toolCallId,
  content: JSON.stringify(ok ? { ok, result: "read content" } : { ok, error: { code: "READ_FAILED", message: "not found" } }) });
const append = (...messages: unknown[]) => ({ type: "transcript_appended", messages });
function project(agentEvents: AgentTraceSnapshot["agentEvents"], status: AgentTraceSnapshot["status"] = "cancelled") {
  return projectTrajectory({ schemaVersion: 1, interactionId: "receipts", status,
    startedAt: "2026-10-23T00:00:00Z", finishedAt: "2026-10-23T00:00:01Z", observedAt: "2026-10-23T00:00:01Z",
    input: { text: "inspect", source: "text" }, agentEvents });
}

it.each([true, false])("uses the receipt outcome and timestamp before interruption (ok=%s)", ok => {
  const document = project([event(10, call(1, "read-1")), event(25, append(receipt("read-1", ok))),
    event(50, { type: "task_failed", failure: { message: "cancelled" } })]);
  expect(document.cells.find(cell => cell.kind === "tool")).toMatchObject({
    callId: "read-1", status: ok ? "completed" : "failed", isError: !ok, durationMilliseconds: 15,
    outputDetail: expect.stringContaining(ok ? "read content" : "READ_FAILED")
  });
});

it("pairs receipts by identity, ignores unrelated messages, and leaves unmatched calls running", () => {
  const cells = project([event(10, call(1, "first")), event(20, call(2, "second")), event(30, append(
    { role: "assistant", content: "done" }, receipt("unknown"), receipt(undefined), receipt("second")
  ))], "running").cells.filter(cell => cell.kind === "tool");
  expect(cells).toHaveLength(2);
  expect(cells[0]).toMatchObject({ status: "running", durationMilliseconds: null });
  expect(cells[0].outputDetail).toBeUndefined();
  expect(cells[1]).toMatchObject({ status: "completed", durationMilliseconds: 10 });
});

it("does not associate an unidentified new receipt by queue order", () => {
  const cell = project([event(10, call(1)), event(25, append(receipt(undefined)))], "running")
    .cells.find(cell => cell.kind === "tool")!;
  expect(cell.status).toBe("running");
  expect(cell.outputDetail).toBeUndefined();
});

it("does not replay a receipt from retries or later request snapshots", () => {
  const cells = project([event(10, call(1, "first")), event(25, append(receipt("first"))),
    event(30, append(receipt("first"))), event(40, { type: "model_request", step: 2, messages: [receipt("first")] }),
    event(50, call(2, "second")), event(60, append(receipt("first"))),
    event(70, append(receipt("second", false)))
  ]).cells.filter(cell => cell.kind === "tool");
  expect(cells).toHaveLength(2);
  expect(cells[0]).toMatchObject({ status: "completed", durationMilliseconds: 15 });
  expect(cells[1]).toMatchObject({ status: "failed", durationMilliseconds: 20 });
});

it.each(["snapshot", "read"])("enriches %s with its image without changing the receipt completion", type => {
  const image = { blob: fixtureBlob("data:image/png;base64,AQ=="), width: 1, height: 1 };
  const document = project([event(10, type === "read" ? {type:"model_finished",step:{...call(1,"view",type).step,decision:{type:"file",name:"read",input:{file_path:".ai/snapshots/a.jpg"}}}} : call(1, "view", type)), event(10,{type:"tool_started",step:1,call:1,toolCallId:"view",tool:type,input:{file_path:".ai/snapshots/a.jpg"}}), event(25,{type:"tool_finished",step:1,call:1,toolCallId:"view",tool:type,result:{ok:true,value:"read content"}}), event(25, append(receipt("view"))),
    event(30, { type: "view_observed", step: 1, toolCallId: "view", image, metadata: {} }),
    event(40, { type: "model_request", step: 2, messages: [receipt("view")] })]);
  const cell = document.cells.find(cell => cell.kind === "tool")!;
  expect(cell).toMatchObject({ callId: "view", toolName: type, status: "completed", durationMilliseconds: 15 });
  expect(cell.outputBlocks?.filter(block => block.type === "image")).toHaveLength(1);
  expect(cell.outputDetail).toContain("read content");
});

it("keeps legacy request-only receipts working", () => {
  const cell = project([event(10, call(1, "old")),
    event(40, { type: "model_request", step: 2, messages: [receipt("old")] })])
    .cells.find(cell => cell.kind === "tool")!;
  expect(cell).toMatchObject({ status: "completed", durationMilliseconds: 30 });
  expect(cell.outputDetail).toContain("read content");
});
