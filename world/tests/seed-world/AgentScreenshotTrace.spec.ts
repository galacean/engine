import { fixtureBlob, serializedImages } from "../../../packages/ai-chat/tests/image-fixture";
import { imageDataUrl, ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources.ts";
import { expect, it, vi } from "vitest";
import { createTestAgentLoop } from "../../../packages/ai-chat/tests/AIChatTestRuntime";
import { MemoryTraceAttachments } from "../../../packages/ai-chat/tests/MemoryTraceAttachments";
import { AgentTraceStore } from "@galacean/engine-ai-chat/ai-chat/agent-trace.ts";
import { parseTrajectoryJson } from "@galacean/engine-ai-chat/ai-chat/trajectory/trajectory-model.ts";
import { adaptTrace } from "../../demos/agent-trajectory/trace-adapter";
import { tinyPng } from "./fixture";
vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";

const image = { blob: fixtureBlob(tinyPng), width: 1, height: 1 };
const final = { content: "Observed", toolCalls: [], finishReason: "stop" as const,
  debug: { modelName: "test", validationStatus: "valid" as const } };

async function run(options: { count?: number; maxAttachmentBytes?: number; fail?: boolean; debugMode?: boolean; cancelAfterCapture?: boolean } = {}) {
  const request = vi.mocked(requestAsapChat);
  request.mockReset();
  for (let i = 0; i < (options.count ?? 1); i++) request.mockResolvedValueOnce({ ...final, content: "", finishReason: "tool_calls",
    toolCalls: [{ id: `view-${i}`, type: "function", function: { name: "snapshot", arguments: "{}" } }] });
  request.mockResolvedValueOnce(final);
  let capture = 0;
  const loop = createTestAgentLoop({ tools: [], definition: {
    scriptApi: { catalog: "# View", entries: [], modules: [] }, toolNames: [],
    captureSnapshot: async () => {
      if (options.fail) throw new Error("capture failed");
      return { image: { ...image }, metadata: { capturedAt: `capture-${++capture}` } };
    }
  } });
  const store = new AgentTraceStore({ enabled: true, maxAttachmentBytes: options.maxAttachmentBytes, attachmentStorage: new MemoryTraceAttachments() });
  const id = store.begin({ input: "Inspect view", inputSource: "text" });
  const unsubscribe = loop.subscribe(event => {
    store.captureAgentEvent(event);
    if (options.cancelAfterCapture && event.type === "view_observed") loop.cancel();
  });
  try {
    const task = loop.run("Inspect view", { debugMode: options.debugMode ?? true });
    if (options.cancelAfterCapture) await expect(task).rejects.toBeDefined();
    else await task;
    const live = (await store.exportCurrentTrace())!;
    store.finish(id, options.cancelAfterCapture ? "cancelled" : "completed");
    return { live, json: (await store.exportLastTrace())!, request };
  } finally { unsubscribe(); loop.cancel(); }
}

it("records one attachment across repeated observations and model requests, with DSH previews at both ends", async () => {
  const { json, live, request } = await run({ count: 3 });
  const trace = JSON.parse(json);
  expect(trace.attachments).toEqual([expect.objectContaining({ width: 1, height: 1, dataUrl: tinyPng, attachmentId: expect.stringMatching(/^sha256:/), mediaType: "image/png" })]);
  expect(JSON.parse(live).attachments).toEqual(trace.attachments);
  expect(json.split(tinyPng)).toHaveLength(2);
  expect(JSON.stringify(trace.agentEvents)).not.toContain(tinyPng);
  const messages = request.mock.calls[3][0].messages;
  expect(messages.filter(message => message.role === "user" && message.image)).toHaveLength(3);
  expect(messages.filter(message => message.role === "user" && message.image).every(message =>
    message.role === "user" && message.image?.blob.size === image.blob.size)).toBe(true);
  const document = parseTrajectoryJson(json);
  expect(document.warnings).toEqual([]);
  expect(document.cells.filter(cell => cell.kind === "context")).toHaveLength(3);
  const { turns, loadImage } = adaptTrace(document);
  const cells = turns.flatMap(turn => turn.groups.flatMap(group => group.cells));
  const tools = cells.filter(cell => cell.kind === "tool");
  const inputs = cells.filter(cell => cell.kind === "context");
  expect(tools).toHaveLength(3);
  for (let i = 0; i < 3; i++) {
    expect(tools[i].callId).toBe(`view-${i}`);
    expect(inputs[i].messageSource).toMatchObject({ callId: `view-${i}` });
    const outputImage = tools[i].outputBlocks!.find(block => block.type === "image")!.attachment!;
    const inputImage = inputs[i].sourceBlocks!.find(block => block.type === "image")!.attachment!;
    expect(inputImage).toEqual(outputImage);
    await expect(loadImage(outputImage)).resolves.toBe(tinyPng);
  }
});

it("marks images over budget without removing the actual model input or failing the task", async () => {
  const { json, request } = await run({ maxAttachmentBytes: 1 });
  expect(json).not.toContain(tinyPng);
  expect(json).toContain("attachment-budget-exceeded");
  expect(JSON.parse(json).attachments).toBeUndefined();
  expect(request.mock.calls[1][0].messages.some(message => message.role === "user" && message.image?.blob.size === image.blob.size)).toBe(true);
  const document = parseTrajectoryJson(json);
  expect(document.warnings).toEqual([expect.stringContaining("附件预算")]);
  const tool = document.cells.find(cell => cell.kind === "tool")!;
  expect(tool.status).toBe("completed");
  expect(tool.outputBlocks?.find(block => block.type === "image")).toMatchObject({ content: expect.stringContaining("未保存"), attachment: undefined });
});

it("keeps screenshot failures as failed tool results, with no image or fabricated model input", async () => {
  const { json } = await run({ fail: true });
  const document = parseTrajectoryJson(json);
  expect(JSON.parse(json).attachments).toBeUndefined();
  expect(document.cells.filter(cell => cell.kind === "context")).toHaveLength(0);
  expect(document.cells.find(cell => cell.kind === "tool")).toMatchObject({ status: "failed", isError: true });
  expect(document.cells.find(cell => cell.kind === "tool")?.outputDetail).toContain("capture failed");
});

it("does not retain screenshot bytes when model debug tracing is disabled", async () => {
  const { json } = await run({ debugMode: false });
  expect(JSON.parse(json).attachments).toBeUndefined();
  expect(json).not.toContain("view_observed");
  expect(json).not.toContain(tinyPng);
});

it("shows a missing-attachment warning for portable traces whose image payload was removed", async () => {
  const { json } = await run();
  const trace = JSON.parse(json);
  delete trace.attachments;
  const document = parseTrajectoryJson(JSON.stringify(trace));
  expect(document.warnings).toEqual([expect.stringContaining("附件缺失")]);
  const { turns } = adaptTrace(document);
  expect(turns.flatMap(turn => turn.groups.flatMap(group => group.cells))
    .flatMap(cell => [...cell.sourceBlocks ?? [], ...cell.outputBlocks ?? []]).some(block => block.attachment)).toBe(false);
});

it("keeps a captured screenshot when cancelled before the next request, without claiming it reached the model", async () => {
  const { json, request } = await run({ cancelAfterCapture: true });
  expect(request).toHaveBeenCalledTimes(1);
  const document = parseTrajectoryJson(json);
  expect(JSON.parse(json).attachments).toHaveLength(1);
  expect(document.cells.filter(cell => cell.text === "截图输入")).toHaveLength(0);
  expect(document.cells.find(cell => cell.kind === "tool")).toMatchObject({ status: "completed", outputBlocks: [
    expect.anything(), expect.objectContaining({ attachment: expect.objectContaining({ dataUrl: tinyPng }) })
  ] });
});

it("restores attachment references without inline bytes and isolates snapshots from caller mutation", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
  try {
    const options = { enabled: true, sessionStorageKey: "screenshot-test", attachmentStorage: new MemoryTraceAttachments() };
    const store = new AgentTraceStore(options);
    const id = store.begin({ input: "view", inputSource: "text" });
    store.captureAgentEvent({ type: "view_observed", taskId: "t", step: 1, toolCallId: "c", image: { ...image }, metadata: {} });
    await store.exportCurrentTrace();
    store.getCurrentTrace()!.attachments![0].attachmentId = "mutated";
    expect(store.getCurrentTrace()!.attachments![0].attachmentId).toMatch(/^sha256:/);
    expect(JSON.stringify(store.getCurrentTrace())).not.toContain(tinyPng);
    store.finish(id, "completed");
    const restored = new AgentTraceStore(options);
    expect(restored.getLastTrace()!.attachments).toEqual(store.getLastTrace()!.attachments);
    expect(storage.get("screenshot-test")).not.toContain(tinyPng);
    expect(await restored.exportLastTrace()).toContain(tinyPng);
  } finally { vi.unstubAllGlobals(); }
});

it("shows pinned input photos on the user message without requiring an snapshot call", async () => {
  const request = vi.mocked(requestAsapChat);
  request.mockReset(); request.mockResolvedValue(final);
  const loop = createTestAgentLoop({tools:[],definition:{scriptApi:{catalog:"# Photo",entries:[],modules:[]},toolNames:[]}});
  const store = new AgentTraceStore({enabled:true,attachmentStorage:new MemoryTraceAttachments()});
  const id = store.begin({input:"看这张图",inputSource:"text"});
  const off = loop.subscribe(event=>store.captureAgentEvent(event));
  await loop.run("看这张图",{debugMode:true,attachments:[{image,metadata:{snapshotId:"photo-1",photoNumber:1}}]});
  store.finish(id,"completed");
  const json = (await store.exportLastTrace())!;
  const document = parseTrajectoryJson(json);
  const user = document.cells.find(cell=>cell.kind==="user")!;
  expect(user.sourceBlocks?.filter(block=>block.type==="image")).toEqual([
    expect.objectContaining({attachment:expect.objectContaining({dataUrl:tinyPng,width:1,height:1})})
  ]);
  expect(JSON.parse(json).attachments).toHaveLength(1);
  const adapted=adaptTrace(document);
  expect(adapted.turns.flatMap(turn=>turn.groups.flatMap(group=>group.cells)).find(cell=>cell.kind==="user")?.sourceBlocks)
    .toContainEqual(expect.objectContaining({type:"image",attachment:expect.objectContaining({mediaType:"image/png"})}));
  off();
});
