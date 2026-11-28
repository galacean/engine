import { fixtureBlob, serializedImages } from "../../../packages/ai-chat/tests/image-fixture";
import { imageDataUrl, ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources.ts";
import { createTestAgentLoop } from "../../../packages/ai-chat/tests/AIChatTestRuntime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({
  requestAsapChat: vi.fn()
}));

import { AIChatSession } from "@galacean/engine-ai-chat/ai-chat/ai-chat-session.ts";
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";
import { readSystemInjection } from "@galacean/engine-ai-chat/ai-chat/agent-protocol.ts";
import { ConversationHistory } from "@galacean/engine-ai-chat/ai-chat/conversation-history.ts";
import { defineTool } from "@galacean/engine-ai-chat/ai-chat/agent-types.ts";

const mockedRequest = vi.mocked(requestAsapChat);

let toolCallSequence = 0;

function toolCall(name: "read" | "execute" | "snapshot", args: Record<string, unknown>) {
  return {
    content: "",
    toolCalls: [{
      id: `call-${++toolCallSequence}`,
      type: "function" as const,
      function: { name, arguments: JSON.stringify(args) }
    }],
    finishReason: "tool_calls" as const
  };
}

function execute(body: string, _message: string) {
  return toolCall("execute", { code: `\n${body}\n` });
}

function final(message: string) {
  return { content: message, toolCalls: [], finishReason: "stop" as const };
}

function search(symbol: string) {
  return toolCall("read", { file_path: `tools/${symbol}.d.ts` });
}

function promptAt(index: number): string {
  return mockedRequest.mock.calls[index][0].messages.map(({ content }) => content).join("\n");
}

function taskContextAt(index: number): Record<string, unknown> {
  const message = [...mockedRequest.mock.calls[index][0].messages]
    .reverse()
    .find(m => readSystemInjection(m.content)?.type === "task_context");
  if (!message) {
    throw new Error(`Request ${index} does not contain a task_context message`);
  }
  const parsed = readSystemInjection(message.content)!;
  return { ...(JSON.parse(parsed.body) as Record<string, unknown>), instruction: parsed.trailing };
}

function testDefinition(toolNames: readonly string[]) {
  return {
    scriptApi: {
      catalog: `Test API symbols: ${toolNames.join(", ") || "none"}`,
      entries: toolNames.map((name) => ({
        name,
        description: `Test declaration for ${name}`,
        moduleId: `tools/${name}.d.ts`
      })),
      modules: toolNames.map((name) => ({
        id: `tools/${name}.d.ts`,
        source: `declare const tools: { ${name}(input?: unknown): Promise<unknown>; };`,
        imports: [],
        toolNames: [name]
      }))
    },
    toolNames
  };
}

describe("AIChatSession", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    toolCallSequence = 0;
  });

  it("snapshots application references per task and clears them on the next turn", async () => {
    const context = { user_selection_at_submission: { id: "tree-A", kind: "tree" } };
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: testDefinition([]) }) });
    mockedRequest.mockImplementationOnce(async () => {
      context.user_selection_at_submission.id = "tree-B";
      return final("Selected tree-A");
    });
    await session.run("make this tree bigger", { context });
    expect(taskContextAt(0)).toMatchObject({ instruction: "make this tree bigger",
      context: { user_selection_at_submission: { id: "tree-A", kind: "tree" } } });
    mockedRequest.mockResolvedValueOnce(final("No selection"));
    await session.run("what is selected", { context: { user_selection_at_submission: null } });
    expect(taskContextAt(1).context).toEqual({ user_selection_at_submission: null });
    mockedRequest.mockResolvedValueOnce(final("Done"));
    await session.run("hello", {});
    expect(taskContextAt(2)).not.toHaveProperty("context");
  });

  it("sends the marked screenshot and pointer context on the first request and retains them through later observations", async () => {
    const attachment = { image: { blob: fixtureBlob("data:image/png;base64,AAAA"), width: 2, height: 2 },
      metadata: { snapshotId: "selected-view", annotations: [{ points: [{ x: 0, y: 0 }, { x: 2, y: 0 }], width: 3 }], queryTool: "pick" } };
    const definition = { ...testDefinition([]), captureSnapshot: async () => ({ image: { blob: fixtureBlob("data:image/png;base64,BBBB"), width: 2, height: 2 }, metadata: { snapshotId: "new-view" } }) };
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition }) });
    mockedRequest.mockImplementationOnce(async () => {
      attachment.metadata.snapshotId = "replaced-view";
      attachment.image.blob = fixtureBlob("data:image/png;base64,CCCC");
      return toolCall("snapshot", {});
    });
    mockedRequest.mockResolvedValueOnce(toolCall("snapshot", {}));
    mockedRequest.mockResolvedValueOnce(toolCall("snapshot", {}));
    mockedRequest.mockResolvedValueOnce(final("Done"));
    await session.run("change the selected tree", { attachments: [attachment] });
    for (const [request] of mockedRequest.mock.calls) {
      const serialized = await serializedImages(request.messages);
      expect(serialized).toContain("selected-view");
      expect(serialized).toContain("pick");
      expect(serialized).not.toContain("replaced-view");
      expect(serialized).toContain("data:image/png;base64,AAAA");
      expect(serialized).toContain("annotations");
      expect(serialized).not.toContain("polygon");
    }
  });

  it("sends multiple photos with distinct snapshot identities in the same model request", async () => {
    const photos = ["first-view", "second-view"].map((snapshotId, index) => ({
      image: { blob: fixtureBlob(`data:image/png;base64,${index ? "BBBB" : "AAAA"}`), width: 2, height: 2 },
      metadata: { snapshotId }
    }));
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: testDefinition([]) }) });
    mockedRequest.mockResolvedValueOnce(final("Both photos received"));
    await session.run("compare these photos", { attachments: photos });
    const messages = mockedRequest.mock.calls[0][0].messages;
    const references = messages.filter(message => readSystemInjection(message.content)?.type === "user_visual_reference").map(message => JSON.parse(readSystemInjection(message.content)!.body));
    expect(references).toHaveLength(2);
    expect(JSON.stringify(references)).toContain("first-view");
    expect(JSON.stringify(references)).toContain("second-view");
    expect(references[0].imagePath).not.toBe(references[1].imagePath);
    expect(await serializedImages(messages)).toContain("data:image/png;base64,AAAA");
    expect(await serializedImages(messages)).toContain("data:image/png;base64,BBBB");
  });

  it("keeps uploaded originals readable after image offloading", async () => {
    const attachment = { image: { blob: fixtureBlob("data:image/png;base64,AAAA"), width: 2, height: 2 }, metadata: { snapshotId: "marked-view" } };
    const definition = { ...testDefinition([]), captureSnapshot: async () => ({
      image: { blob: fixtureBlob("data:image/png;base64,BBBB"), width: 2, height: 2 }, metadata: {} }) };
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition }) });
    let imagePath = "";
    mockedRequest.mockImplementationOnce(async request => {
      const reference = request.messages.find(message => readSystemInjection(message.content)?.type === "user_visual_reference")!;
      imagePath = JSON.parse(readSystemInjection(reference.content)!.body).imagePath;
      return toolCall("snapshot", {});
    });
    for (let i = 0; i < 3; i++) mockedRequest.mockResolvedValueOnce(toolCall("snapshot", {}));
    mockedRequest.mockImplementationOnce(async request => {
      expect(await serializedImages(request.messages)).not.toContain((await imageDataUrl(attachment.image.blob)));
      expect(await serializedImages(request.messages)).toContain(imagePath);
      expect(request.tools?.some(tool => tool.function.name === "read")).toBe(true);
      return toolCall("read", { file_path: imagePath });
    });
    mockedRequest.mockImplementationOnce(async request => {
      expect(await serializedImages(request.messages)).toContain((await imageDataUrl(attachment.image.blob)));
      expect(await serializedImages(request.messages)).toContain("marked-view");
      return final("Done");
    });
    await session.run("edit this", { attachments: [attachment] });
  });

  it("delivers frozen attachments from a next-step submission without embedding pixels in input events", async () => {
    const attachment = { image: { blob: fixtureBlob("data:image/png;base64,AAAA"), width: 2, height: 2 }, metadata: { snapshotId: "queued-view" } };
    const definition = { ...testDefinition([]), captureSnapshot: async () => ({
      image: { blob: fixtureBlob("data:image/png;base64,BBBB"), width: 2, height: 2 }, metadata: {} }) };
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition }) });
    const inputs: unknown[] = [];
    session.subscribe(event => { if (event.type === "input_queued" || event.type === "input_consumed") inputs.push(event); });
    let steering: ReturnType<AIChatSession["run"]> | undefined;
    mockedRequest.mockImplementationOnce(async () => {
      steering = session.run("use this marked photo", { attachments: [attachment] });
      attachment.metadata.snapshotId = "changed-after-submit";
      return toolCall("snapshot", {});
    });
    mockedRequest.mockImplementationOnce(async request => {
      const messages = await serializedImages(request.messages);
      expect(messages).toContain("queued-view");
      expect(messages).toContain((await imageDataUrl(attachment.image.blob)));
      expect(messages).not.toContain("changed-after-submit");
      return final("Done");
    });
    await session.run("look around");
    await steering;
    expect(JSON.stringify(inputs)).not.toContain("data:image");
  });

  it("retains a committed receipt across a later thumbnail failure and the next user turn", async () => {
    let committed = false;
    const edit = defineTool({ name: "edit", input: z.strictObject({}), output: z.null(), execute: () => null });
    const definition = { ...testDefinition([edit.name]),
      provideWorldThumbnail: () => { if (committed) throw new Error("Snapshot unavailable"); return {}; },
      beginEdit: (id: string) => ({ tools: [edit], hasChanges: () => true, prepare() {}, discard() {}, commit: () => {
        committed = true; return { transactionId: id };
      } })
    };
    const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [edit], definition }) });
    mockedRequest.mockResolvedValueOnce(search("edit")).mockResolvedValueOnce(execute('await tools.edit({}); return null;', "edit"));
    await expect(session.run("edit", {})).rejects.toThrow("Snapshot unavailable");
    expect(committed).toBe(true);
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    committed = false; // Observation becomes available again; no new edit request.
    mockedRequest.mockResolvedValueOnce(final("Already committed"));
    await (await session.continue()).completion;
    const resumedMessages = mockedRequest.mock.calls[2][0].messages;
    expect(resumedMessages.some(m => readSystemInjection(m.content)?.type === "task_continued")).toBe(true);
    const toolReceipts = resumedMessages.filter(m => m.role === "tool" && m.content.startsWith("{")).map(m => JSON.parse(m.content));
    expect(toolReceipts).toContainEqual(expect.objectContaining({
      ok: true,
      receipt: expect.objectContaining({ status: "committed", transactionId: expect.any(String) })
    }));
  });

  it("retains prior turn context in session transcript without leaking raw unreturned tool payloads", async () => {
    const tool = defineTool({
      name: "create_river",
      input: z.strictObject({}),
      output: z.strictObject({ riverId: z.string(), meshData: z.string() }),
      execute: () => ({ riverId: "river-1", meshData: "large-render-payload" })
    });
    const session = new AIChatSession({
      agent: createTestAgentLoop({
        tools: [tool],
        definition: testDefinition([tool.name])
      })
    });
    mockedRequest
      .mockResolvedValueOnce(search(tool.name))
      .mockResolvedValueOnce(execute(
        "const river = await tools.create_river({}); return { riverId: river.riverId };",
        "正在生成河流"
      ))
      .mockResolvedValueOnce(final("第一条河流已生成"))
      .mockResolvedValueOnce(final("知道了，你指的是 river-1"));

    await session.run("生成一条河流");
    await session.run("在它旁边种树");

    expect(session.historyRecordCount).toBe(2);
    const turn2Prompt = promptAt(3);
    expect(turn2Prompt).toContain("生成一条河流");
    expect(turn2Prompt).toContain("第一条河流已生成");
    expect(turn2Prompt).toContain('"riverId":"river-1"');
    expect(turn2Prompt).not.toContain("large-render-payload");
  });

  it("marks only the current instruction as voice input", async () => {
    const session = new AIChatSession({
      agent: createTestAgentLoop({
        tools: [],
        definition: testDefinition([])
      })
    });
    mockedRequest
      .mockResolvedValueOnce(final("已将时间调整到晚上八点"))
      .mockResolvedValueOnce(final("已继续"));

    await session.run("完善八点", { inputSource: "voice" });
    expect(promptAt(0)).toContain('"inputSource":"voice"');
    await session.run("继续");
    expect(promptAt(1)).toContain("完善八点");
    expect(promptAt(1)).toContain("已将时间调整到晚上八点");
  });

  it("preserves conversation history when a legacy caller passes different model values", async () => {
    const session = new AIChatSession({
      agent: createTestAgentLoop({
        tools: [],
        definition: testDefinition([])
      })
    });
    mockedRequest
      .mockResolvedValueOnce(final("第一轮完成"))
      .mockResolvedValueOnce(final("第二轮完成"));

    const first = { model: "model-a", debugMode: true };
    const second = { model: "model-b", debugMode: true };
    await session.run("第一轮秘密", first);
    await session.run("继续提问", second);

    expect(session.historyRecordCount).toBe(2);
    expect(promptAt(1)).toContain("第一轮秘密");
  });

  it("stores a failed task as a compact result without partial script data", async () => {
    const tool = defineTool({
      name: "create_river",
      input: z.strictObject({}),
      output: z.strictObject({ createdId: z.string() }),
      execute: () => ({ createdId: "river-1" })
    });
    const history = new ConversationHistory();
    const session = new AIChatSession({
      history,
      agent: createTestAgentLoop({
        tools: [tool],
        definition: testDefinition([tool.name])
      })
    });
    mockedRequest
      .mockResolvedValueOnce(search(tool.name))
      .mockResolvedValueOnce(execute(
        "const created = await tools.create_river({}); return { createdId: created.createdId };",
        "生成河流"
      ))
      .mockRejectedValueOnce(new Error("HTTP 500"))
      .mockResolvedValueOnce(final("已读取失败结果"));

    await expect(session.run("生成后继续")).rejects.toThrow("HTTP 500");
    const failureHistory = JSON.stringify(history.snapshot());
    expect(failureHistory).toContain('"status":"failed"');
    expect(failureHistory).toContain("处理过程中遇到了问题");
    expect(failureHistory).not.toContain("createdId");

    await (await session.continue()).completion;
    expect(promptAt(3)).toContain('<system_injection type="task_continued">');
  });

  it("records cancellation as a compact result", async () => {
    const history = new ConversationHistory();
    const session = new AIChatSession({
      history,
      agent: createTestAgentLoop({
        tools: [],
        definition: testDefinition([])
      })
    });
    mockedRequest.mockImplementationOnce(({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    }));

    const running = session.run("等待中的任务");
    await vi.waitFor(() => expect(mockedRequest).toHaveBeenCalledOnce());
    session.cancel();
    await expect(running).rejects.toThrow("Agent task cancelled");
    expect(JSON.stringify(history.snapshot())).toContain('"status":"cancelled"');

    mockedRequest.mockResolvedValueOnce(final("新任务"));
    await (await session.continue()).completion;
    expect(promptAt(1)).toContain('<system_injection type="task_continued">');
    expect(promptAt(1)).toContain("等待中的任务");
  });
});

it("reuses message-history image order across turns, preserves edited versions, and expires unpinned images after two turns", async () => {
  const {SeedWorldViewSnapshots} = await import("@galacean/engine-world-planning/world/SeedWorldViewSnapshot.ts");
  const destroyed = vi.fn();
  const snapshots = new SeedWorldViewSnapshots(()=>({image:{texture:{} as any, width:2,height:2, dispose:vi.fn(), export:async (marks) => ({width:2,height:2,
    blob:fixtureBlob(marks.length ? "data:image/png;base64,BBBB" : "data:image/png;base64,AAAA")})},width:2,height:2,
    identities:{identityBits:14,estimatedPosition:()=>undefined,byteLength:16,read:()=>new Uint8Array(4),resolve:()=>undefined,dispose:destroyed}}),()=>"scene");
  const photo=await snapshots.capture();
  snapshots.setAttachment(photo.snapshotId,[]);
  const session=new AIChatSession({agent:createTestAgentLoop({tools:[],definition:{...testDefinition([]),imageResources:snapshots}})});
  mockedRequest.mockReset(); mockedRequest.mockResolvedValue(final("已看到第一张图"));
  const initial=snapshots.acquireAttachments()!;
  const initialObservations = await initial.export();
  await session.run("这是第一张图",{attachments:initialObservations}); initial.release();
  const originalId=initialObservations[0].imagePath!;
  snapshots.setAttachment(photo.snapshotId,[{points:[{x:1,y:1}],width:1,color:"#ff0000"}]);
  const edited=snapshots.acquireAttachments()!;
  const editedObservations = await edited.export();
  mockedRequest.mockResolvedValueOnce(toolCall("read",{file_path:originalId})).mockResolvedValueOnce(final("上轮的图没改过"));
  await session.run("本轮也有图，但请看上一轮的第一张",{attachments:editedObservations}); edited.release();
  const request=mockedRequest.mock.lastCall![0];
  const task=JSON.parse(readSystemInjection(request.messages.at(-1)!.content)!.body);
  expect(JSON.stringify(task)).toContain(originalId);
  expect(await serializedImages(request.messages)).toContain("data:image/png;base64,AAAA");
  expect(await serializedImages(request.messages)).toContain("data:image/png;base64,BBBB");
  expect(JSON.stringify(task)).not.toContain("base64");
  snapshots.removeAttachment(photo.snapshotId);
  await session.run("第三轮，聊别的");
  await session.run("第四轮，还是别的");
  expect(snapshots.hasImage(originalId)).toBe(true);
  await session.run("第五轮");
  expect(snapshots.hasImage(originalId)).toBe(false);
  expect(destroyed).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(snapshots.budget.stats.total).toBe(0);
  expect(mockedRequest.mock.lastCall![0].messages.some(message => typeof message.content === "string" && message.content.includes('"available":false'))).toBe(true);
  session.dispose(); snapshots.dispose();
});

it("does not age screenshot resources on stop/continue and releases them after the third new user turn", async () => {
  const { SeedWorldViewSnapshots } = await import("@galacean/engine-world-planning/world/SeedWorldViewSnapshot.ts");
  const destroyed = vi.fn();
  const snapshots = new SeedWorldViewSnapshots(() => ({ image: { texture:{} as any, width:1,height:1, dispose:vi.fn(), export:async () => ({blob: fixtureBlob("data:image/png;base64,AAAA"), width: 1, height: 1 }) }, width: 1, height: 1,
    identities: { identityBits: 14, estimatedPosition: () => undefined, byteLength: 4, read: () => new Uint8Array(4), resolve: () => undefined, dispose: destroyed } }), () => "scene");
  const photo = await snapshots.capture(); snapshots.setAttachment(photo.snapshotId, []);
  const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: { ...testDefinition([]), imageResources: snapshots } }) });
  mockedRequest.mockReset();
  mockedRequest.mockImplementationOnce(({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true })));
  const batch = snapshots.acquireAttachments()!;
  const batchObservations = await batch.export();
  const running = session.run("看图", { attachments: batchObservations });
  const rejected = expect(running).rejects.toThrow("Agent task cancelled");
  await vi.waitFor(() => expect(mockedRequest).toHaveBeenCalledOnce());
  snapshots.removeAttachment(photo.snapshotId);
  await session.stop(); await rejected; batch.release();
  expect(snapshots.resourceStats.turn).toBe(1);
  mockedRequest.mockResolvedValue(final("继续完成"));
  await (await session.continue()).completion;
  expect(snapshots.resourceStats.turn).toBe(1);
  expect(snapshots.hasImage(photo.imagePath!)).toBe(true);
  await session.run("下一轮"); await session.run("再下一轮");
  expect(destroyed).not.toHaveBeenCalled();
  await session.run("第三个后续轮次");
  expect(destroyed).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(snapshots.budget.stats.total).toBe(0);
  session.dispose(); snapshots.dispose();
});

it("submits two detailed photo annotations through the actual ChatPanel boundary without duplicating them in task context", async () => {
  // Only the engine import polyfill needs window; no renderer is constructed in this submit-boundary test.
  vi.stubGlobal("window", {});
  try {
  const { SeedWorldVoiceHudController } = await import("../../demos/seed-world/assistant/SeedWorldChatPanel");
  const photos = [0, 1].map(index => ({
    image: { blob: fixtureBlob("data:image/png;base64,AAAA"), width: 768, height: 432 },
    metadata: { snapshotId: `detailed-${index}`,
      annotations: [{ width: 3, color: "#71e6ff", points: Array.from({ length: 800 }, (_, i) =>
        ({ x: (i % 300) + 0.123456789012345, y: (i % 200) + 0.987654321098765 })) }] }
  }));
  expect(JSON.stringify(photos.map(photo => photo.metadata)).length).toBeGreaterThan(65536);
  const release = vi.fn(), feedback = vi.fn();
  const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition: testDefinition([]) }) });
  mockedRequest.mockReset(); mockedRequest.mockResolvedValue(final("Both photos received"));
  const panel = {
    application: { getViewerSnapshot: () => ({}),
      viewSnapshots: { acquireAttachments: () => ({ export: async () => photos, release }) } },
    _activity: { submit: (...args: Parameters<AIChatSession["submit"]>) => session.submit(...args) },
    session, _state: { kind: "idle" }, _traceStore: { enabled: false },
    _waitForAsrCleanup: async () => {},
    _clearResultTimer() {}, _showFeedback: feedback
  };
  await SeedWorldVoiceHudController.prototype.submit.call(panel as any, "比较这两张照片");
  expect(feedback).not.toHaveBeenCalled();
  expect(mockedRequest).toHaveBeenCalledOnce();
  const messages = mockedRequest.mock.calls[0][0].messages;
  const references = messages.filter(message => readSystemInjection(message.content)?.type === "user_visual_reference");
  expect(references).toHaveLength(2);
  expect(references.map(message => JSON.parse(readSystemInjection(message.content)!.body).metadata.annotations)).toEqual(photos.map(photo => photo.metadata.annotations));
  expect(JSON.stringify(taskContextAt(0).context)).not.toContain("annotations");
  expect(release).toHaveBeenCalledOnce();
  session.dispose();
  } finally { vi.unstubAllGlobals(); }
});
