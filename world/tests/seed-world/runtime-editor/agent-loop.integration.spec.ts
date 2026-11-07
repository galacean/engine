import { fixtureBlob, serializedImages } from "../../../../packages/ai-chat/tests/image-fixture";
import { AgentTraceStore } from "@galacean/engine-ai-chat/ai-chat/agent-trace.ts";
import { createTestAgentLoop } from "../../../../packages/ai-chat/tests/AIChatTestRuntime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

vi.mock("@galacean/engine-ai-chat/ai-chat/asap-chat.ts", () => ({
  requestAsapChat: vi.fn()
}));

import {
  AgentCancelledError,
  AgentTaskToolLimitError,
  AgentNoProgressError,
  AgentScriptRepairLimitError,
  AgentToolFailureLimitError,
  getAgentTaskFailure
} from "@galacean/engine-ai-chat/ai-chat/agent-loop.ts";
import { requestAsapChat } from "@galacean/engine-ai-chat/ai-chat/asap-chat.ts";
import { createSeedWorldAgentDefinition } from "../../../demos/seed-world/agent-adapter/SeedWorldAgentDefinition";
import {
  AgentToolExecutionError,
  defineTool,
  type AgentApplicationDefinition,
  type AgentEvent,
  type AgentScriptTrace
} from "@galacean/engine-ai-chat/ai-chat/agent-types.ts";

const mockedRequest = vi.mocked(requestAsapChat);

let toolCallSequence = 0;

function toolCall(name: "read_tool" | "execute" | "snapshot", args: Record<string, unknown>) {
  const id = `call-${++toolCallSequence}`;
  return {
    content: "",
    toolCalls: [{ id, type: "function" as const, function: { name: name === "read_tool" ? "read" : name, arguments: JSON.stringify(args) } }],
    finishReason: "tool_calls" as const,
    traceId: crypto.randomUUID(),
    debug: { modelName: "test-model", validationStatus: "valid" as const }
  };
}

function execute(body: string, _message = "执行中") {
  return toolCall("execute", { code: `\n${body}\n` });
}

function final(message = "任务完成") {
  return {
    content: message,
    toolCalls: [],
    finishReason: "stop" as const,
    traceId: crypto.randomUUID(),
    debug: { modelName: "test-model", validationStatus: "valid" as const }
  };
}

function search(symbol: string) {
  return toolCall("read_tool", { file_path: `declare/editor/tools/${symbol}.d.ts` });
}

function systemPromptAt(index: number): string {
  return mockedRequest.mock.calls[index][0].messages[0].content;
}

it("refreshes installed capabilities and declarations between steps of the same task", async () => {
  mockedRequest.mockReset();
  const inspect = vi.fn(() => ({ ok: true }));
  const read = defineTool({ name: "inspect", effect:"read", input: z.strictObject({}), output: z.strictObject({ ok: z.boolean() }), execute: inspect });
  const remove = defineTool({ name: "remove", input: z.strictObject({}), output: z.strictObject({ ok: z.boolean() }), execute: () => {
    configuration = initial; return { ok: true };
  } });
  const install = defineTool({ name: "install", input: z.strictObject({}), output: z.strictObject({ ok: z.boolean() }), execute: () => {
    configuration = { definition: definition(["install", "inspect", "remove"]), tools: [install, read, remove] };
    return { ok: true };
  } });
  const definition = (names:string[]) => testDefinition(names,{beginEdit:id=>({
    tools:[install,remove],hasChanges:()=>true,prepare(){},discard(){},commit:()=>({transactionId:id})
  })});
  const initial = { definition: definition(["install"]), tools: [install] };
  let configuration = initial;
  const loop = createTestAgentLoop({ ...initial, getConfiguration: () => configuration });
  mockedRequest.mockResolvedValueOnce(execute("return await tools.install({});"))
    .mockResolvedValueOnce(search("inspect"))
    .mockResolvedValueOnce(execute("const result = await tools.inspect({}); await tools.remove({}); return result;"))
    .mockResolvedValueOnce(search("inspect"))
    .mockResolvedValueOnce(final());
  const result = await loop.run("install, use and remove", {});
  expect(result.stageResults.map(stage => stage.ok)).toEqual([true, true, true, false]);
  expect(inspect).toHaveBeenCalledOnce();
  expect(toolResultsAt(2)[1]).toMatchObject({ ok: true });
  expect(toolResultsAt(4)[3]).toMatchObject({ ok: false });
  expect(mockedRequest.mock.calls[2][0].messages.some(message => message.content.includes("capabilities_changed"))).toBe(true);
  expect(result.steps[1].availableApiNames).toContain("inspect");
  expect(result.steps[3].availableApiNames).not.toContain("inspect");
});

it("retains a successful committed task when its final explanation exceeds the brevity guideline",async()=>{
  mockedRequest.mockReset();
  const apply=vi.fn(()=>({ok:true}));
  const tool=defineTool({name:"apply",input:z.strictObject({}),output:z.strictObject({ok:z.boolean()}),execute:apply});
  const message="已提交并核对结果。".repeat(50);
  mockedRequest.mockResolvedValueOnce(execute("return await tools.apply({});")).mockResolvedValueOnce(final(message));
  const result=await createTestAgentLoop({tools:[tool],definition:testDefinition([tool.name])}).run("apply",{});
  expect(result.result.status).toBe("completed");
  expect(result.finalMessage).toBe(message);
  expect(result.stageResults[0].receipt?.status).toBe("committed");
  expect(apply).toHaveBeenCalledOnce();
  expect(mockedRequest).toHaveBeenCalledTimes(2);
});

it("sends runtime diagnostics once per task as historical evidence without extra requests", async () => {
  mockedRequest.mockReset();
  const errors = [{id:"error-1",occurredAt:"2026-10-09T00:00:00Z",message:"assets/B.ts: late error"}];
  const definition = testDefinition([], {runtimeDiagnostics:()=>errors});
  const loop = createTestAgentLoop({tools:[],definition});
  mockedRequest.mockResolvedValueOnce(toolCall("read_tool",{ file_path: "skills/fixture/README.md" })).mockResolvedValueOnce(final());
  await loop.run("检查错误",{});
  expect(mockedRequest).toHaveBeenCalledTimes(2);
  for (const [call] of mockedRequest.mock.calls) {
    const records = call.messages.filter(message=>message.content.includes('"contextKind":"runtime_errors"'));
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0].content)).toMatchObject({historical:true,errors});
  }
});

it("observes only on demand, preserves retained images and redacts trace pixels", async () => {
  mockedRequest.mockReset();
  const captureSnapshot = vi.fn(async () => ({ image: { blob: fixtureBlob("data:image/jpeg;base64,YWJj"), width: 12, height: 8 }, metadata: { capturedAt: "now" } }));
  const definition = testDefinition([], { captureSnapshot });
  const loop = createTestAgentLoop({ tools: [], definition });
  const traceStore = new AgentTraceStore({enabled:true});
  const traceId = traceStore.begin({input:"What do I see?",inputSource:"text"});
  loop.subscribe(event => traceStore.captureAgentEvent(event));
  mockedRequest.mockResolvedValueOnce(toolCall("snapshot", {}))
    .mockResolvedValueOnce(toolCall("snapshot", {}))
    .mockResolvedValueOnce(toolCall("snapshot", {})).mockResolvedValueOnce(final());
  await loop.run("What do I see?", { debugMode: true });
  expect(captureSnapshot).toHaveBeenCalledTimes(3);
  expect(mockedRequest.mock.calls[0][0].messages.some(message => message.role === "user" && message.image)).toBe(false);
  const observations = mockedRequest.mock.calls[3][0].messages.filter(message => message.role !== "system" && message.content.includes("view_observation"));
  expect(observations).toHaveLength(3);
  expect(observations.map(message => JSON.parse(message.content).metadata)).toEqual(
    [{ capturedAt: "now" }, { capturedAt: "now" }, { capturedAt: "now" }]
  );
  expect(toolResultsAt(3)).toEqual(observations.map(message => {
    const { contextKind: _, metadata: _metadata, ...reference } = JSON.parse(message.content);
    return { ok: true, result: reference };
  }));
  expect(observations.every(message => message.role === "user" && message.image)).toBe(true);
  expect(await serializedImages(mockedRequest.mock.calls[3][0].messages)).toContain("data:image/jpeg;base64,YWJj");
  traceStore.finish(traceId, "completed");
  expect(JSON.stringify(traceStore.getLastTrace())).not.toContain("data:image/jpeg;base64,YWJj");
  mockedRequest.mockReset(); mockedRequest.mockResolvedValueOnce(final());
  await loop.run("hello", {});
  expect(captureSnapshot).toHaveBeenCalledTimes(3);
  expect(mockedRequest.mock.calls[0][0].messages.some(message => message.role === "user" && message.image)).toBe(false);
});

it("returns a paired capture failure without sending invalid image bytes", async () => {
  mockedRequest.mockReset();
  const definition = testDefinition([], { captureSnapshot: async () => ({
    image: { blob: new Blob(["invalid"], { type: "text/plain" }), width: 1, height: 1 }, metadata: null
  }) });
  mockedRequest.mockResolvedValueOnce(toolCall("snapshot", {})).mockResolvedValueOnce(final("无法观察画面。"));
  await createTestAgentLoop({ tools: [], definition }).run("look", {});
  expect(toolResultsAt(1)[0]).toMatchObject({ ok: false, error: { code: "VIEW_OBSERVATION_FAILED" } });
  expect(mockedRequest.mock.calls[1][0].messages.some(message => message.role === "user" && message.image)).toBe(false);
});

it("discards a capture that completes after cancellation", async () => {
  mockedRequest.mockReset();
  const definition = testDefinition([], { captureSnapshot: async () => {
    loop.cancel();
    return { image: { blob: fixtureBlob("data:image/jpeg;base64,YQ=="), width: 1, height: 1 }, metadata: null };
  } });
  const loop = createTestAgentLoop({ tools: [], definition });
  mockedRequest.mockResolvedValueOnce(toolCall("snapshot", {}));
  await expect(loop.run("look", {})).rejects.toThrow("cancelled");
  expect(mockedRequest).toHaveBeenCalledOnce();
  expect(loop.running).toBe(false);
});

it("a paginated read does not revoke registered execution capabilities", async () => {
  mockedRequest.mockReset(); toolCallSequence = 0;
  const executeInspect = vi.fn(() => ({ ok: true }));
  const tool = defineTool({ name: "inspect", input: z.strictObject({}), output: z.strictObject({ ok: z.boolean() }), execute: executeInspect });
  const definition = testDefinition([tool.name]);
  definition.scriptApi.documents = [{ path: "skills/fixture/large.md", content: "x".repeat(65536) }];
  mockedRequest
    .mockResolvedValueOnce(toolCall("read_tool", { file_path: "skills/fixture/large.md" }))
    .mockResolvedValueOnce(execute("return await tools.inspect({});"))
    .mockResolvedValueOnce(final());
  const result = await createTestAgentLoop({ tools: [tool], definition }).run("inspect", {});
  expect(toolResultsAt(1)[0]).toMatchObject({ ok: true, result: { path: "skills/fixture/large.md", next: true } });
  expect(transcriptAt(1).find(message => message.role === "tool")?.content)
    .toContain("Continue with read offset=1 column=2001.");
  expect(result.stageResults[0]).toMatchObject({ ok: true });
  expect(executeInspect).toHaveBeenCalledOnce();
});

it("reading a guide is independent of registered execution capabilities", async () => {
  mockedRequest.mockReset(); toolCallSequence = 0;
  const executeInspect = vi.fn(() => ({ ok: true }));
  const tool = defineTool({ name: "inspect", input: z.strictObject({}), output: z.strictObject({ ok: z.boolean() }), execute: executeInspect });
  const definition = testDefinition([tool.name]);
  definition.scriptApi.documents = [{ path: "skills/fixture/objects/README.md", content: "## Usage Guide\nInspect first.\n## API Reference Index\n[inspect](../tools/inspect.d.ts)" }];
  mockedRequest
    .mockResolvedValueOnce(toolCall("read_tool", { file_path: "skills/fixture/objects/README.md" }))
    .mockResolvedValueOnce(execute("return await tools.inspect({});"))
    .mockResolvedValueOnce(final());
  const result = await createTestAgentLoop({ tools: [tool], definition }).run("inspect", {});
  expect(toolResultsAt(1)[0]).toMatchObject({ ok: true, result: { path: "skills/fixture/objects/README.md", lines: expect.arrayContaining([{number: 2, text: "Inspect first."}]) } });
  expect(systemPromptAt(1)).not.toContain("Inspect first");
  expect(result.stageResults[0]).toMatchObject({ ok: true });
  expect(executeInspect).toHaveBeenCalledOnce();
});

function contextAt(index: number, kind: string) {
  const messages = mockedRequest.mock.calls[index][0].messages;
  const message = messages.find(message => message.role === "user" &&
    typeof message.content === "string" && message.content.startsWith("{") &&
    JSON.parse(message.content).contextKind === kind);
  expect(message, `Missing ${kind} context`).toBeDefined();
  return JSON.parse(message!.content);
}

function transcriptAt(index: number) {
  const messages = mockedRequest.mock.calls[index][0].messages;
  const start = messages.findIndex(message => message.role === "assistant");
  const tail = start < 0 ? [] : messages.slice(start);
  return tail.filter((message, i) => !(i === tail.length - 1 && message.content.includes('"contextKind":"world_state"')));
}

function toolResultsAt(index: number): Record<string, unknown>[] {
  return transcriptAt(index)
    .filter((message) => message.role === "tool")
    .map((message) => {
      if (message.content.startsWith("Error:")) return {ok:false,error:message.content.slice(7)};
      if (message.content.startsWith("<path>")) return {ok:true,result:{
        path:message.content.match(/<path>(.*?)<\/path>/)![1],
        lines:[...message.content.matchAll(/^(\d+): (.*)$/gm)].map(m=>({number:Number(m[1]),text:m[2]})),
        truncated:message.content.includes("truncated"), next:message.content.includes("Continue with") || message.content.includes("truncated")
      }};
      return JSON.parse(message.content) as Record<string, unknown>;
    });
}

function testDefinition(
  toolNames: readonly string[],
  overrides: Partial<AgentApplicationDefinition> = {}
): AgentApplicationDefinition {
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
    toolNames,
    ...overrides
  };
}

it("reuses knowledge across tasks and invalidates it on content changes and reset", async () => {
  mockedRequest.mockReset();
  const tool = defineTool({ name: "inspect", input: z.strictObject({}), output: z.strictObject({ ok: z.boolean() }), execute: () => ({ ok: true }) });
  const definition = testDefinition([tool.name]);
  definition.scriptApi.documents = [{ path: "skills/fixture/guide.md", content: "Read only relevant objects." }];
  const loop = createTestAgentLoop({ tools: [tool], definition });
  mockedRequest.mockResolvedValueOnce(toolCall("read_tool", { file_path: "skills/fixture/guide.md" })).mockResolvedValueOnce(final());
  await loop.run("learn", {});
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValueOnce(execute("return await tools.inspect({});")).mockResolvedValueOnce(final());
  const reused = await loop.run("inspect", {});
  expect(reused.stageResults[0].ok).toBe(true);
  expect(mockedRequest.mock.calls[0][0].messages.some(message => message.content.includes('session_knowledge') && message.content.includes('Read only relevant objects.'))).toBe(false);
  for (const invalidate of [
    () => { definition.scriptApi.documents![0].content = "Updated guide."; },
    () => loop.resetKnowledge()
  ]) {
    invalidate();
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValueOnce(final());
    await loop.run("check", {});
    expect(mockedRequest.mock.calls[0][0].messages.some(message => message.content.includes('session_knowledge'))).toBe(false);
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValueOnce(search("inspect")).mockResolvedValueOnce(final());
    await loop.run("learn again", {});
  }
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValueOnce(final());
  await createTestAgentLoop({ tools: [tool], definition }).run("new session", {});
  expect(mockedRequest.mock.calls[0][0].messages.some(message => message.content.includes('session_knowledge'))).toBe(false);
});

describe("AgentLoop final AgentScriptCalling contract", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    toolCallSequence = 0;
  });

  it.each([
    ["你好", "你好！"],
    ["现在世界里是几点？", "现在是中午十二点。"]
  ])("allows Seed World to answer from existing context without an application call: %s", async (input, reply) => {
    const definition = createSeedWorldAgentDefinition({
      getWorldThumbnail: () => ({ time: { hours: 12 } })
    } as Parameters<typeof createSeedWorldAgentDefinition>[0]);
    const events: AgentEvent[] = [];
    mockedRequest.mockResolvedValue(final(reply));
    const loop = createTestAgentLoop({
      tools: [],
      definition: { ...definition, scriptApi: testDefinition([]).scriptApi, toolNames: [] }
    });
    loop.subscribe((event) => events.push(event));

    const result = await loop.run(input, { debugMode: true });

    expect(result.finalMessage).toBe(reply);
    expect(result.stageResults).toMatchObject([]);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(mockedRequest.mock.calls[0][0].toolChoice).toBe("auto");
    expect(events.some((event) => event.type === "script_started" || event.type === "tool_started")).toBe(false);
  });

  it.each([
    "不要创建花丛，只查询面前有什么",
    "创建草地之前先告诉我这里有没有空间",
    "不要添加灌木，看看当前有哪些植物"
  ])("lets the model finish a Seed World query without creating vegetation: %s", async (input) => {
    const query = defineTool({
      name: "world.query",
      input: z.strictObject({}),
      output: z.strictObject({ count: z.number() }),
      execute: () => ({ count: 0 })
    });
    const definition = createSeedWorldAgentDefinition({
      getWorldThumbnail: () => undefined
    } as Parameters<typeof createSeedWorldAgentDefinition>[0]);
    mockedRequest
      .mockResolvedValueOnce(search(query.name))
      .mockResolvedValueOnce(execute("return await tools.world.query({});"))
      .mockResolvedValueOnce(final("查询完成，没有创建任何植被。"));
    const loop = createTestAgentLoop({
      tools: [query],
      definition: {
        ...definition,
        // This application stub supplies only a thumbnail, not an editor.
        beginEdit: undefined,
        scriptApi: testDefinition([query.name]).scriptApi,
        toolNames: [query.name]
      }
    });
    const result = await loop.run(input, { debugMode: true });
    expect(result.finalMessage).toBe("查询完成，没有创建任何植被。");
    expect(result.result.output).toEqual({ count: 0 });
    expect(mockedRequest).toHaveBeenCalledTimes(3);
    expect(mockedRequest.mock.calls[2][0].toolChoice).toBe("auto");
  });

  it("preserves model request errors while retaining failed-attempt trace evidence", async () => {
    const requestError = new Error("模型服务请求额度超限");
    requestError.name = "AsapRateLimitError";
    mockedRequest.mockRejectedValueOnce(requestError);
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });
    const events: AgentEvent[] = [];
    loop.subscribe((event) => events.push(event));

    await expect(loop.run("你好", { debugMode: true })).rejects.toBe(requestError);

    const modelFailure = events.find(
      (event): event is Extract<AgentEvent, { type: "model_failed" }> => event.type === "model_failed"
    );
    expect(modelFailure?.error).toBe(requestError);
    expect(modelFailure?.attempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        rawContent: "",
        error: requestError.message,
        requestMessages: expect.any(Array)
      })
    ]);
    expect(getAgentTaskFailure(requestError)).toMatchObject({
      status: "failed",
      message: expect.stringContaining("服务暂时繁忙"),
      steps: []
    });
  });

  it("loads only requested API declarations and bindings through APISearch", async () => {
    const teleport = vi.fn(({ x }: { x: number }) => ({ success: true, x }));
    const tools = [
      defineTool({
        name: "teleport",
        input: z.strictObject({ x: z.number() }),
        output: z.strictObject({ success: z.boolean(), x: z.number() }),
        execute: teleport
      }),
      defineTool({
        name: "set_weather",
        input: z.strictObject({}),
        output: z.strictObject({ success: z.boolean() }),
        execute: () => ({ success: true })
      })
    ];
    mockedRequest
      .mockResolvedValueOnce(search("teleport"))
      .mockResolvedValueOnce(execute("return await tools.teleport({ x: 42 });", "正在传送"))
      .mockResolvedValueOnce(final("已传送"));

    const loop = createTestAgentLoop({
      tools,
      definition: testDefinition(tools.map(({ name }) => name))
    });
    const traces: AgentScriptTrace[] = [];
    loop.subscribe((event) => {
      if (event.type === "script_trace") traces.push(event.trace);
    });
    const result = await loop.run("把我传宋过去", {
      model: "test-model-route",
      debugMode: true
    });

    expect(teleport).toHaveBeenCalledOnce();
    expect(mockedRequest.mock.calls.every(([request]) => request.model === "test-model-route")).toBe(true);
    expect(systemPromptAt(0)).not.toContain("teleport(input?: unknown)");
    expect(systemPromptAt(0)).not.toContain("set_weather(input?: unknown)");
    expect(systemPromptAt(1)).not.toContain("teleport(input?: unknown)");
    expect(systemPromptAt(1)).not.toContain("set_weather(input?: unknown)");
    expect(transcriptAt(1)).toEqual([
      expect.objectContaining({ role: "assistant", toolCalls: [expect.objectContaining({ id: "call-1" })] }),
      {
        role: "tool",
        toolCallId: "call-1",
        content: expect.stringContaining("teleport(input?: unknown)")
      }
    ]);
    expect(transcriptAt(2)).toHaveLength(4);
    expect(result.stageResults).toMatchObject([
      { ok: true, output: { path: "declare/editor/tools/teleport.d.ts" } },
      { ok: true, output: { success: true, x: 42 } }
    ]);
    expect(traces.map((trace) => trace.toolCalls[0]?.tool)).toEqual(["teleport"]);
    expect(result.result.output).toEqual({ success: true, x: 42 });
  });

  it("preflights every static API reference before any Tool can partially execute", async () => {
    const mutate = vi.fn(() => ({ changed: true }));
    const inspect = vi.fn(() => ({ present: true }));
    const tools = [
      defineTool({
        name: "world.mutate",
        input: z.strictObject({}),
        output: z.strictObject({ changed: z.boolean() }),
        execute: mutate
      }),
      defineTool({
        name: "world.inspect",
        input: z.strictObject({}),
        output: z.strictObject({ present: z.boolean() }),
        execute: inspect
      })
    ];
    mockedRequest
      .mockResolvedValueOnce(search("world.mutate"))
      .mockResolvedValueOnce(execute(
        "await tools.world.mutate({}); return await tools.world.unknown({});",
        "修改并检查"
      ))
      .mockResolvedValueOnce(search("world.inspect"))
      .mockResolvedValueOnce(execute(
        "await tools.world.mutate({}); return await tools.world.inspect({});",
        "修改并检查"
      ))
      .mockResolvedValueOnce(final());

    const loop = createTestAgentLoop({
      tools,
      definition: testDefinition(tools.map(({ name }) => name))
    });
    const result = await loop.run("修改后检查", {});

    expect(mutate).toHaveBeenCalledOnce();
    expect(inspect).toHaveBeenCalledOnce();
    expect(result.stageResults[1]).toMatchObject({
      ok: false,
      error: {
        code: "UNKNOWN_TOOL",
        phase: "parse",
        tool: "world.unknown"
      }
    });
    expect(result.stageResults[1]).toHaveProperty(
      "error.message",
      "Agent Script 引用了未注册的 API：world.unknown；脚本尚未执行"
    );
    expect(result.stageResults[3]).toMatchObject({ ok: true, output: { present: true } });
  });

  it("keeps APISearch idempotent while retaining real lookup failures in the trajectory", async () => {
    const inspect = defineTool({
      name: "inspect",
      input: z.strictObject({}),
      output: z.strictObject({ ok: z.boolean() }),
      execute: () => ({ ok: true })
    });
    mockedRequest
      .mockResolvedValueOnce(search("guessed.symbol"))
      .mockResolvedValueOnce(search(inspect.name))
      .mockResolvedValueOnce(search(inspect.name))
      .mockResolvedValueOnce(execute("return await tools.inspect({});"))
      .mockResolvedValueOnce(final());

    const loop = createTestAgentLoop({
      tools: [inspect], maxConsecutiveNoProgressScripts: 3,
      definition: testDefinition([inspect.name])
    });
    const result = await loop.run("检查", {});

    expect(toolResultsAt(1)[0]).toMatchObject({
      ok: false,
      error: "Unknown project path 'declare/editor/tools/guessed.symbol.d.ts'"
    });
    expect(toolResultsAt(3)[2]).toMatchObject({
      ok: true,
      result: { path: "declare/editor/tools/inspect.d.ts", lines: expect.any(Array) }
    });
    expect(result.result.output).toEqual({ ok: true });
  });

  it("does not retain knowledge from a failed read", async () => {
    const inspect = defineTool({
      name: "inspect",
      input: z.strictObject({}),
      output: z.strictObject({ ok: z.boolean() }),
      execute: () => ({ ok: true })
    });
    mockedRequest
      .mockResolvedValueOnce(search("unknown.symbol"))
      .mockResolvedValueOnce(search(inspect.name))
      .mockResolvedValueOnce(execute("return await tools.inspect({});"))
      .mockResolvedValueOnce(final());

    const loop = createTestAgentLoop({
      tools: [inspect],
      definition: testDefinition([inspect.name])
    });
    const result = await loop.run("检查", {});

    expect(toolResultsAt(1)[0]).toMatchObject({
      ok: false,
      error: "Unknown project path 'declare/editor/tools/unknown.symbol.d.ts'"
    });
    expect(systemPromptAt(1)).not.toContain("inspect(input?: unknown)");
    expect(systemPromptAt(2)).not.toContain("inspect(input?: unknown)");
    expect(toolResultsAt(2)[1]).toMatchObject({
      ok: true,
      result: {
        path: "declare/editor/tools/inspect.d.ts", lines: expect.arrayContaining([expect.objectContaining({text: expect.stringContaining("inspect(input?: unknown)")})])
      }
    });
    expect(result.result.output).toEqual({ ok: true });
  });

  it("returns only the requested declaration while dependencies remain available to execution", async () => {
    const executeInspect = vi.fn(() => ({ species: "birch" }));
    const inspect = defineTool({
      name: "inspect",
      input: z.strictObject({ domain: z.literal("vegetation") }),
      output: z.strictObject({ species: z.string() }),
      execute: executeInspect
    });
    const definition = {
      scriptApi: {
        hostNotes: "tree -> TreeAsset; inspect -> inspect",
        entries: [
          {
            name: "TreeAsset",
            description: "Tree fields",
            moduleId: "assets/TreeAsset.d.ts"
          },
          {
            name: "inspect",
            description: "Inspect vegetation",
            moduleId: "tools/inspect.d.ts"
          }
        ],
        modules: [
          {
            id: "assets/TreeAsset.d.ts",
            source: "export interface TreeAsset { species?: string; }",
            imports: []
          },
          {
            id: "tools/inspect.d.ts",
            source: "import type { TreeAsset } from '../assets/TreeAsset';\ndeclare const tools: { inspect(input: { domain: 'vegetation' }): Promise<TreeAsset>; };",
            imports: ["assets/TreeAsset.d.ts"],
            toolNames: ["inspect"]
          }
        ]
      },
      toolNames: ["inspect"]
    };
    mockedRequest
      .mockResolvedValueOnce(search("inspect"))
      .mockResolvedValueOnce(execute("return await tools.inspect({ domain: 'vegetation' });"))
      .mockResolvedValueOnce(final());

    const loop = createTestAgentLoop({ tools: [inspect], definition });
    const result = await loop.run("读取树种", {});

    expect(executeInspect).toHaveBeenCalledOnce();
    expect(systemPromptAt(1)).not.toContain("species?: string");
    expect(toolResultsAt(1)[0]).toMatchObject({
      ok: true,
      result: {
        path: "declare/editor/tools/inspect.d.ts", lines: definition.scriptApi.modules.find(module => module.id === "tools/inspect.d.ts")!.source.split("\n").map((text, index) => ({number: index + 1, text}))
      }
    });
    expect(result.stageResults[1]).toMatchObject({ ok: true, output: { species: "birch" } });
  });

  it("keeps raw Tool data in Trace and returns only the script reduction to the model", async () => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: index === 23 ? "birch-23" : `oak-${index}`,
      kind: index === 23 ? "birch" : "oak"
    }));
    const query = defineTool({
      name: "query_objects",
      input: z.strictObject({}),
      output: z.strictObject({
        items: z.array(z.strictObject({ id: z.string(), kind: z.string() }))
      }),
      execute: () => ({ items })
    });
    mockedRequest
      .mockResolvedValueOnce(search(query.name))
      .mockResolvedValueOnce(execute(
        "const result = await tools.query_objects({}); const tree = result.items.find((item) => item.kind === 'birch'); return { id: tree?.id ?? null };",
        "查找白桦树"
      ))
      .mockResolvedValueOnce(final("找到了"));

    const loop = createTestAgentLoop({
      tools: [query],
      definition: testDefinition([query.name])
    });
    const traces: AgentScriptTrace[] = [];
    loop.subscribe((event) => {
      if (event.type === "script_trace") traces.push(event.trace);
    });
    const result = await loop.run("找一棵白桦树", {});

    expect(result.stageResults[1]).toMatchObject({ ok: true, output: { id: "birch-23" } });
    expect(Object.keys(result.stageResults[1])).toEqual(["ok", "output", "returnValuePresent", "console", "receipt"]);
    expect(JSON.stringify(transcriptAt(2))).toContain("birch-23");
    expect(JSON.stringify(transcriptAt(2))).not.toContain("oak-49");
    expect(JSON.stringify(traces[0].toolCalls[0].result)).toContain("oak-49");
  });

  it("creates a fresh local-variable scope for every script call", async () => {
    mockedRequest
      .mockResolvedValueOnce(execute("var stageSecret = 'hidden'; return { stage: 1 };"))
      .mockResolvedValueOnce(execute("return { secretType: typeof stageSecret };"))
      .mockResolvedValueOnce(final());

    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });
    const result = await loop.run("分两步执行", {});

    expect(result.stageResults).toMatchObject([
      { ok: true, output: { stage: 1 } },
      { ok: true, output: { secretType: "undefined" } }
    ]);
    expect(transcriptAt(2)).toHaveLength(4);
    expect(toolResultsAt(2)).toMatchObject([
      { ok: true, result: { stage: 1 } },
      { ok: true, result: { secretType: "undefined" } }
    ]);
  });

  it("rebuilds world_state on every model decision", async () => {
    let revision = 0;
    mockedRequest
      .mockResolvedValueOnce(execute("return { observed: 1 };"))
      .mockResolvedValueOnce(final());
    const loop = createTestAgentLoop({
      tools: [],
      definition: {
        scriptApi: { hostNotes: "Test API symbols: none", entries: [], modules: [] },
        toolNames: [],
        provideWorldThumbnail: () => ({ revision: ++revision })
      }
    });
    await loop.run("读取", {});

    expect(contextAt(0, "world_state").snapshot).toEqual({ revision: 1 });
    expect(contextAt(1, "world_state").snapshot).toEqual({ revision: 2 });
  });

  it("reports Tool input failures without exposing receipts to the model", async () => {
    const update = defineTool({
      name: "update_weather",
      input: z.strictObject({ transitionDuration: z.number() }),
      output: z.strictObject({ ok: z.boolean() }),
      execute: () => ({ ok: true })
    });
    mockedRequest
      .mockResolvedValueOnce(search(update.name))
      .mockResolvedValueOnce(execute("return await tools.update_weather({ transitionDuraton: 1 });"))
      .mockResolvedValueOnce(final("参数错误已处理"));
    const loop = createTestAgentLoop({
      tools: [update],
      definition: testDefinition([update.name])
    });
    const result = await loop.run("更新天气", {});

    expect(result.stageResults[1]).toMatchObject({
      ok: false,
      error: { code: "INVALID_ARGUMENTS", phase: "tool", tool: "update_weather" }
    });
    expect(JSON.stringify(transcriptAt(2))).toContain("transitionDuraton");
    expect(JSON.stringify(transcriptAt(2))).not.toContain("logs");
  });

  it("validates script return values as compact AgentValue output", async () => {
    mockedRequest
      .mockResolvedValueOnce(execute("const circular = {}; circular.self = circular; return circular;"))
      .mockResolvedValueOnce(final("已停止"));
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });
    const traces: AgentScriptTrace[] = [];
    loop.subscribe((event) => {
      if (event.type === "script_trace") traces.push(event.trace);
    });
    const result = await loop.run("返回循环对象", {});
    expect(result.stageResults[0]).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_SCRIPT_OUTPUT",
        phase: "output",
        location: { source: "execute.code", target: "return" }
      }
    });
    expect(toolResultsAt(1)[0]).toMatchObject({
      ok: false,
      error: expect.stringContaining("circular"),
      location: { source: "execute.code", target: "return" }
    });
    expect(JSON.stringify(toolResultsAt(1)[0])).not.toContain("circular.self = circular");
    expect(traces[0].errorStack).toEqual(expect.any(String));
  });

  it("returns script errors with a source location while keeping the full stack in Trace", async () => {
    mockedRequest
      .mockResolvedValueOnce(execute("const state = undefined; return state.windSpeed;"))
      .mockResolvedValueOnce(final("已修正"));
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });
    const traces: AgentScriptTrace[] = [];
    loop.subscribe((event) => {
      if (event.type === "script_trace") traces.push(event.trace);
    });

    await loop.run("读取状态", {});

    expect(toolResultsAt(1)[0]).toMatchObject({
      ok: false,
      error: expect.stringContaining("windSpeed"),
      location: { source: "execute.code", line: 2, column: expect.any(Number) }
    });
    expect(Object.keys(toolResultsAt(1)[0]).sort()).toEqual(["code", "console", "error", "location", "ok", "phase", "receipt", "returnValuePresent"]);
    expect(JSON.stringify(toolResultsAt(1)[0])).not.toContain("async function main");
    expect(JSON.stringify(toolResultsAt(1)[0])).not.toContain("stack");
    expect(traces[0].errorStack).toContain("TypeError");
    expect(traces[0].errorStack).toContain("agent-script://");
  });

  it("returns ReferenceError text and the failing execute.code line to the model", async () => {
    mockedRequest
      .mockResolvedValueOnce(execute("return missingWorldState.windSpeed;"))
      .mockResolvedValueOnce(final("已修正"));
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });
    const traces: AgentScriptTrace[] = [];
    loop.subscribe((event) => {
      if (event.type === "script_trace") traces.push(event.trace);
    });

    await loop.run("读取状态", {});

    expect(toolResultsAt(1)[0]).toMatchObject({
      ok: false,
      error: expect.stringContaining("missingWorldState is not defined"),
      location: { source: "execute.code", line: 2, column: expect.any(Number) }
    });
    expect(traces[0].errorStack).toContain("ReferenceError");
    expect(JSON.stringify(toolResultsAt(1)[0])).not.toContain("ReferenceError");
  });

  it("identifies execute.code when the host cannot provide an exact syntax-error line", async () => {
    mockedRequest
      .mockResolvedValueOnce(toolCall("execute", {
        code: "\nconst broken = ;\nreturn broken;\n"
      }))
      .mockResolvedValueOnce(final("已修正"));
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });
    const traces: AgentScriptTrace[] = [];
    loop.subscribe((event) => {
      if (event.type === "script_trace") traces.push(event.trace);
    });

    await loop.run("执行", {});

    expect(toolResultsAt(1)[0]).toMatchObject({
      ok: false,
      error: expect.stringContaining("Agent Script syntax error"),
      location: { source: "execute.code" }
    });
    expect(Object.keys(toolResultsAt(1)[0]).sort()).toEqual(["code", "console", "error", "location", "ok", "phase", "receipt", "returnValuePresent"]);
    expect(JSON.stringify(toolResultsAt(1)[0])).not.toContain("const broken =");
    expect(JSON.stringify(toolResultsAt(1)[0])).not.toContain("stack");
    expect(traces[0].errorStack).toContain("SyntaxError");
  });

  it("omits an absent optional projection after a successful Tool call", async () => {
    const executeCreate = vi.fn(() => ({ status: "applied", assetRef: { id: "tree-1" } }));
    const create = defineTool({
      name: "tree.create",
      input: z.strictObject({}),
      output: z.strictObject({
        status: z.literal("applied"),
        assetRef: z.strictObject({ id: z.string() })
      }),
      execute: executeCreate
    });
    mockedRequest
      .mockResolvedValueOnce(search(create.name))
      .mockResolvedValueOnce(execute(
        "const result = await tools.tree.create({}); return { assetRef: result.assetRef, error: result.error };"
      ))
      .mockResolvedValueOnce(final("树已创建"));
    const loop = createTestAgentLoop({
      tools: [create],
      definition: testDefinition([create.name])
    });

    const result = await loop.run("在我面前创建一棵树", {});

    expect(result.stageResults[1]).toMatchObject({
      ok: true,
      output: { assetRef: { id: "tree-1" } }
    });
    expect(executeCreate).toHaveBeenCalledOnce();
  });

  it("rejects a script output whose declared fields all resolve to undefined", async () => {
    const read = defineTool({
      name: "state.read",
      input: z.strictObject({}),
      output: z.strictObject({ windSpeed: z.number() }),
      execute: () => ({ windSpeed: 8 })
    });
    mockedRequest
      .mockResolvedValueOnce(search(read.name))
      .mockResolvedValueOnce(execute(
        "const state = await tools.state.read({}); return { value: state.windSpead };"
      ))
      .mockResolvedValueOnce(final("已停止"));
    const loop = createTestAgentLoop({
      tools: [read],
      definition: testDefinition([read.name])
    });

    const result = await loop.run("读取风速", {});

    expect(result.stageResults[1]).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_SCRIPT_OUTPUT",
        phase: "output",
        message: expect.stringContaining("contains only undefined properties")
      }
    });
    expect(JSON.stringify(transcriptAt(2))).toContain("state.read => windSpeed");
    expect(JSON.stringify(transcriptAt(2))).not.toContain("logs");
  });

  it("preserves completed Tool evidence when later script output validation fails", async () => {
    const create = defineTool({
      name: "tree.create",
      input: z.strictObject({}),
      output: z.strictObject({
        status: z.literal("applied"),
        transactionId: z.string(),
        assetRef: z.strictObject({ id: z.string() })
      }),
      execute: () => ({ status: "applied", transactionId: "tx-1", assetRef: { id: "tree-1" } })
    });
    mockedRequest
      .mockResolvedValueOnce(search(create.name))
      .mockResolvedValueOnce(execute(
        "const created = await tools.tree.create({}); const circular = {}; circular.self = circular; return { created, circular };"
      ))
      .mockResolvedValueOnce(final("已停止"));
    const loop = createTestAgentLoop({
      tools: [create],
      definition: testDefinition([create.name])
    });

    const result = await loop.run("创建一棵树", {});

    expect(result.stageResults[1]).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_SCRIPT_OUTPUT",
        execution: {
          status: "tool_calls_completed_before_failure",
          successfulToolCalls: [{
            call: 1,
            tool: "tree.create",
            result: { status: "applied", transactionId: "tx-1", assetRef: { id: "tree-1" } }
          }],
          successfulToolCallsTruncated: false,
          failedToolMayHaveExecuted: false
        }
      }
    });
    expect(toolResultsAt(2)[1]).toMatchObject({
      ok: false,
      execution: {
        successfulToolCalls: [{ tool: "tree.create", result: { transactionId: "tx-1" } }]
      }
    });
  });

  it("keeps application Tool failures on the structured failure channel", async () => {
    const remove = defineTool({
      name: "world.delete",
      input: z.strictObject({}),
      output: z.strictObject({ status: z.literal("applied") }),
      execute: () => {
        throw new AgentToolExecutionError({
          code: "NOT_EDITABLE",
          message: "自然资产不可删除",
          retryable: false,
          executed: false,
          details: { ref: "natural-tree-1" }
        });
      }
    });
    mockedRequest
      .mockResolvedValueOnce(search(remove.name))
      .mockResolvedValueOnce(execute("return await tools.world.delete({});"))
      .mockResolvedValueOnce(final("无法删除"));
    const loop = createTestAgentLoop({
      tools: [remove],
      definition: testDefinition([remove.name])
    });
    const traces: AgentScriptTrace[] = [];
    loop.subscribe((event) => {
      if (event.type === "script_trace") traces.push(event.trace);
    });

    const result = await loop.run("删除这棵自然树", {});

    expect(result.stageResults[1]).toMatchObject({
      ok: false,
      error: {
        code: "NOT_EDITABLE",
        phase: "tool",
        retryable: false,
        details: { ref: "natural-tree-1" }
      }
    });
    expect(toolResultsAt(2)[1]).toMatchObject({
      ok: false,
      error: "自然资产不可删除",
      location: { source: "execute.code", line: 2, column: expect.any(Number) },
      details: { ref: "natural-tree-1" }
    });
    expect(toolResultsAt(2)[1]).toMatchObject({ code: "NOT_EDITABLE", phase: "tool", retryable: false });
    expect(JSON.stringify(toolResultsAt(2)[1])).not.toContain("stack");
    expect(JSON.stringify(toolResultsAt(2)[1])).not.toContain("AgentToolExecutionError");
    expect(traces[0].toolCalls[0].result).toMatchObject({
      ok: false,
      error: { stack: expect.stringContaining("AgentToolExecutionError") }
    });
  });

  it("returns ordinary script output beyond the former 4 KiB limit", async () => {
    mockedRequest
      .mockResolvedValueOnce(execute("return { items: Array.from({ length: 150 }, (_, index) => ({ index, text: 'x'.repeat(20) })) };"))
      .mockResolvedValueOnce(execute("return { raw: 'x'.repeat(13000) };"))
      .mockResolvedValueOnce(final("输出边界已处理"));
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });

    const result = await loop.run("验证输出边界", {});
    const first = result.stageResults[0];
    expect(first).toMatchObject({ok:true, output:{items:expect.any(Array)}});
    expect(result.stageResults[1]).toMatchObject({ok:true,output:{raw:"x".repeat(13000)}});
  });

  it("reports invalid Tool outputs as Tool failures", async () => {
    const invalid = defineTool({
      name: "read_state",
      input: z.strictObject({}),
      output: z.strictObject({ version: z.number() }),
      execute: () => ({ version: "wrong" })
    });
    mockedRequest
      .mockResolvedValueOnce(search(invalid.name))
      .mockResolvedValueOnce(execute("return await tools.read_state({});"))
      .mockResolvedValueOnce(final("已停止"));
    const loop = createTestAgentLoop({
      tools: [invalid],
      definition: testDefinition([invalid.name])
    });
    const result = await loop.run("读取", {});
    expect(result.stageResults[1]).toMatchObject({
      ok: false,
      error: { code: "INVALID_TOOL_RESULT", phase: "tool", tool: "read_state" }
    });
  });

  it("normalizes timeout and aborts the active Tool", async () => {
    const aborted = vi.fn();
    const wait = defineTool({
      name: "wait",
      input: z.strictObject({}),
      output: z.strictObject({ done: z.boolean() }),
      execute: (_input, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted();
          reject(signal.reason);
        }, { once: true });
      })
    });
    mockedRequest
      .mockResolvedValueOnce(search(wait.name))
      .mockResolvedValueOnce(execute("return await tools.wait({});"))
      .mockResolvedValueOnce(final("超时已处理"));
    const loop = createTestAgentLoop({
      tools: [wait],
      definition: testDefinition([wait.name]),
      scriptTimeoutMs: 10
    });
    const result = await loop.run("等待", {});
    expect(result.stageResults[1]).toMatchObject({
      ok: false,
      error: { code: "SCRIPT_TIMEOUT", phase: "timeout" }
    });
    expect(aborted).toHaveBeenCalledOnce();
  });

  it("reserves the Tool-call budget before concurrent invocations start", async () => {
    const executeTool = vi.fn(() => ({ done: true }));
    const tool = defineTool({
      name: "bounded_call",
      input: z.strictObject({}),
      output: z.strictObject({ done: z.boolean() }),
      execute: executeTool
    });
    mockedRequest
      .mockResolvedValueOnce(search(tool.name))
      .mockResolvedValueOnce(execute(
        "return await Promise.all([tools.bounded_call({}), tools.bounded_call({})]);"
      ))
      .mockResolvedValueOnce(final("预算错误已处理"));
    const loop = createTestAgentLoop({
      tools: [tool],
      definition: testDefinition([tool.name]),
      maxToolCallsPerScript: 1
    });

    const result = await loop.run("并发调用", {});

    expect(executeTool).toHaveBeenCalledOnce();
    expect(result.stageResults[1]).toMatchObject({
      ok: false,
      error: { code: "SCRIPT_BUDGET_EXCEEDED", phase: "execution" }
    });
  });

  it("never executes a Tool returned by the model after cancellation", async () => {
    const executeTool = vi.fn(() => ({ done: true }));
    const tool = defineTool({
      name: "change_world",
      input: z.strictObject({}),
      output: z.strictObject({ done: z.boolean() }),
      execute: executeTool
    });
    let resolveModel!: (value: ReturnType<typeof execute>) => void;
    mockedRequest.mockResolvedValueOnce(search(tool.name))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveModel = resolve; }));
    const loop = createTestAgentLoop({ tools: [tool], definition: testDefinition([tool.name]) });
    const running = loop.run("change world", {});
    const rejected = expect(running).rejects.toBeInstanceOf(AgentCancelledError);
    await vi.waitFor(() => expect(mockedRequest).toHaveBeenCalledTimes(2));
    loop.cancel();
    resolveModel(execute("return await tools.change_world({});"));
    await rejected;
    expect(executeTool).not.toHaveBeenCalled();
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it("propagates cancellation through Runtime and Tool", async () => {
    const started = vi.fn();
    const cancelled = vi.fn();
    const wait = defineTool({
      name: "wait",
      input: z.strictObject({}),
      output: z.strictObject({ done: z.boolean() }),
      execute: (_input, { signal }) => new Promise((_resolve, reject) => {
        started();
        signal.addEventListener("abort", () => {
          cancelled();
          reject(signal.reason);
        }, { once: true });
      })
    });
    mockedRequest
      .mockResolvedValueOnce(search(wait.name))
      .mockResolvedValueOnce(execute("return await tools.wait({});"));
    const loop = createTestAgentLoop({
      tools: [wait],
      definition: testDefinition([wait.name])
    });

    const running = loop.run("等待", {});
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    loop.cancel();
    await expect(running).rejects.toBeInstanceOf(AgentCancelledError);
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("stops after the configured number of consecutive failed scripts", async () => {
    mockedRequest
      .mockResolvedValueOnce(execute("throw new Error('first');"))
      .mockResolvedValueOnce(execute("throw new Error('second');"));
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([]),
      maxScriptRepairs: 2
    });
    await expect(loop.run("执行", {})).rejects.toBeInstanceOf(AgentScriptRepairLimitError);
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it("counts several failed execute calls in one response as one repair round", async () => {
    const first = execute("throw new Error('first');");
    const second = execute("throw new Error('second');");
    mockedRequest.mockResolvedValueOnce({ ...first, toolCalls: [...first.toolCalls, ...second.toolCalls] })
      .mockResolvedValueOnce(execute("return { recovered: true };"))
      .mockResolvedValueOnce(final("Recovered after reading both errors"));
    const loop = createTestAgentLoop({ tools: [], definition: testDefinition([]), maxScriptRepairs: 2 });
    const result = await loop.run("recover", {});
    expect(result.stageResults.map(stage => stage.ok)).toEqual([false, false, true]);
    expect(mockedRequest).toHaveBeenCalledTimes(3);
  });

  it("preserves a repair opportunity when a mixed batch contains an invalid host result", async () => {
    const invalid = defineTool({ name: "read_state", effect: "read", input: z.strictObject({}),
      output: z.strictObject({ version: z.number() }), execute: () => ({ version: "wrong" }) });
    const host = execute("return await tools.read_state({});");
    const script = execute("throw new Error('second script error');");
    mockedRequest.mockResolvedValueOnce(execute("throw new Error('first script error');"))
      .mockResolvedValueOnce({ ...host, toolCalls: [...host.toolCalls, ...script.toolCalls] })
      .mockResolvedValueOnce(final("Host data unavailable; earlier observations retained"));
    const result = await createTestAgentLoop({ tools: [invalid], definition: testDefinition([invalid.name]),
      maxScriptRepairs: 3 }).run("diagnose", {});
    expect(result.stageResults.map(stage => stage.ok)).toEqual([false, false, false]);
    expect(result.stageResults[1]).toMatchObject({ ok: false, error: { code: "INVALID_TOOL_RESULT", phase: "tool" } });
    expect(mockedRequest).toHaveBeenCalledTimes(3);
  });

  it("bounds host failures separately even when successful calls occur between them", async () => {
    const invalid = defineTool({ name: "read_state", effect: "read", input: z.strictObject({}),
      output: z.strictObject({ version: z.number() }), execute: () => ({ version: "wrong" }) });
    mockedRequest.mockResolvedValueOnce(execute("return await tools.read_state({});"))
      .mockResolvedValueOnce(execute("return 1;"))
      .mockResolvedValueOnce(execute("return await tools.read_state({});"));
    const loop = createTestAgentLoop({ tools: [invalid], definition: testDefinition([invalid.name]),
      maxScriptRepairs: 1, maxToolFailureRounds: 2 });
    await expect(loop.run("read", {})).rejects.toBeInstanceOf(AgentToolFailureLimitError);
    expect(mockedRequest).toHaveBeenCalledTimes(3);
  });

  it("does not clear unresolved script errors when an intervening host call fails", async () => {
    const invalid = defineTool({ name: "read_state", effect: "read", input: z.strictObject({}),
      output: z.strictObject({ version: z.number() }), execute: () => ({ version: "wrong" }) });
    mockedRequest.mockResolvedValueOnce(execute("throw new Error('first');"))
      .mockResolvedValueOnce(execute("return await tools.read_state({});"))
      .mockResolvedValueOnce(execute("throw new Error('second');"));
    const loop = createTestAgentLoop({ tools: [invalid], definition: testDefinition([invalid.name]), maxScriptRepairs: 2 });
    await expect(loop.run("recover", {})).rejects.toBeInstanceOf(AgentScriptRepairLimitError);
    expect(mockedRequest).toHaveBeenCalledTimes(3);
  });

  it("stops when the same successful script repeats without model-visible progress", async () => {
    const mutate = vi.fn(() => ({ ok: true }));
    const tool = defineTool({
      name: "mutate",
      input: z.strictObject({}),
      output: z.strictObject({ ok: z.boolean() }),
      execute: mutate
    });
    const repeated = execute("await tools.mutate({}); return { verified: false };");
    mockedRequest
      .mockResolvedValueOnce(search(tool.name))
      .mockResolvedValueOnce(repeated)
      .mockResolvedValueOnce(repeated);
    const loop = createTestAgentLoop({
      tools: [tool],
      definition: testDefinition([tool.name])
    });

    await expect(loop.run("修改并验证", {})).rejects.toBeInstanceOf(AgentNoProgressError);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mockedRequest).toHaveBeenCalledTimes(3);
  });

  it("returns a malformed native Tool Call to the model for one-step correction", async () => {
    const invalid = {
      content: "",
      toolCalls: [{
        id: "call-invalid",
        type: "function" as const,
        function: { name: "execute", arguments: "{}" }
      }],
      finishReason: "tool_calls" as const
    };
    mockedRequest.mockResolvedValueOnce(invalid).mockResolvedValueOnce(final("已修正"));
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });
    await expect(loop.run("你好", { debugMode: true })).resolves.toMatchObject({ finalMessage: "已修正" });
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    const correction = mockedRequest.mock.calls[1][0].messages.at(-2);
    expect(correction).toMatchObject({ role: "tool", toolCallId:"call-invalid" });
    expect(correction?.content).toContain("execute.code 必须是字符串");
    expect(correction?.content).toContain("INVALID_TOOL_CALL");
  });

  it("executes every call in one response with independent replies", async () => {
    const first = toolCall("execute", { code: " return 1; " });
    const second = toolCall("execute", { code: " return 2; " });
    mockedRequest
      .mockResolvedValueOnce({
        ...first,
        toolCalls: [...first.toolCalls, ...second.toolCalls]
      })
      .mockResolvedValueOnce(final("完成两个调用"));
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([])
    });
    await expect(loop.run("这是什么树", { debugMode: true })).resolves.toMatchObject({
      finalMessage: "完成两个调用"
    });
    const replies=mockedRequest.mock.calls[1][0].messages.filter(message=>message.role==="tool");
    expect(replies.map(message=>message.toolCallId)).toEqual([first.toolCalls[0].id,second.toolCalls[0].id]);
    expect(replies.map(message=>JSON.parse(message.content).result)).toEqual([1,2]);
  });

  it("fails closed after malformed Tool Call correction is exhausted", async () => {
    const invalid = {
      content: "",
      toolCalls: [{
        id: "call-invalid",
        type: "function" as const,
        function: { name: "execute", arguments: "{}" }
      }],
      finishReason: "tool_calls" as const
    };
    mockedRequest.mockResolvedValue(invalid);
    const loop = createTestAgentLoop({
      tools: [],
      definition: testDefinition([]),
      maxModelAttempts: 2
    });

    await expect(loop.run("你好", { debugMode: true })).rejects.toThrow("execute.code 必须是字符串");
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });
});


it("executes the acceptance trace's bare async script without a repair round", async () => {
  const {AgentJavaScriptChecker} = await import("@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts");
  const {agentTypecheckLibraries} = await import("@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts");
  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  const code = 'const r = {value: 1};\nreturn r;';
  const beginEdit = vi.fn(() => {throw new Error("read-only script must not open an edit");});
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValueOnce(toolCall("execute", {code})).mockResolvedValueOnce(final());
  try {
    const loop = createTestAgentLoop({tools:[],definition:testDefinition([], {beginEdit}),
      scriptChecker:{check:async (source,modules) => checker.check(source,modules)}});
    await loop.run("inspect", {});
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(toolResultsAt(1)[0]).toMatchObject({ok:true,result:{value:1},receipt:{status:"completed"}});
    expect(beginEdit).not.toHaveBeenCalled();
    const assistant = mockedRequest.mock.calls[1][0].messages.find(message => message.role === "assistant" && message.toolCalls?.length);
    expect(assistant?.role === "assistant" && JSON.parse(assistant.toolCalls![0].function.arguments).code).toBe(code);
  } finally {checker.dispose();}
});

it("preserves real checker diagnostics in the next model turn and permits repair", async () => {
  const { AgentJavaScriptChecker } = await import("@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts");
  const { agentTypecheckLibraries } = await import("@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts");
  const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
  try {
    for (const source of ["const x = unknownName;", " const x = ; ", " return unknownName; ",
      '/** @type {{name: string}} */\nconst value = {name: 3}; return value;',
      '\n/** @type {{name: string}} */\nconst value = {name: 3}; return value; ',
      ` ${Array.from({length: 15}, (_, i) => `missing${i};`).join(" ")} `]) {
      mockedRequest.mockReset();
      const expected = checker.check(source, [])!;
      const beginEdit = vi.fn(() => ({ tools: [], hasChanges: () => false, prepare() {}, discard() {}, commit: () => ({ transactionId: "repair" }) }));
      mockedRequest.mockResolvedValueOnce(toolCall("execute", { code: source }))
        .mockResolvedValueOnce(toolCall("execute", { code: " return 1; " }))
        .mockResolvedValueOnce(final());
      const loop = createTestAgentLoop({ tools: [], definition: testDefinition([], { beginEdit }),
        scriptChecker: { check: async (code, modules) => checker.check(code, modules) } });
      await loop.run("check then repair", {});
      expect(toolResultsAt(1)[0]).toMatchObject({ ok: false, code: expected.code, phase: expected.phase,
        error: expected.message, receipt: { status: "rejected" },
        ...(expected.details ? { details: expected.details } : {}),
        ...(expected.location ? { location: expected.location } : {}) });
      if (expected.code === "SCRIPT_CHECK_FAILED") {
        expect(toolResultsAt(1)[0].error).toMatch(/execute\.js\(\d+,\d+\): error TS\d+:/);
      }
      if (source.includes("missing0")) expect(expected.details).toMatchObject({ totalDiagnostics: 15, truncated: true, diagnostics: expect.any(Array) });
      if (source.includes("@type")) expect(expected.details).toMatchObject({ diagnostics: [expect.objectContaining({
        relatedInformation: expect.arrayContaining([expect.objectContaining({ file: "/execute.js", line: expect.any(Number), column: expect.any(Number) })])
      })] });
      const messages = mockedRequest.mock.calls[1][0].messages;
      const assistant = messages.find(message => message.role === "assistant" && message.toolCalls?.length);
      const response = messages.find(message => message.role === "tool");
      expect(assistant?.role).toBe("assistant");
      expect(response?.toolCallId).toBe(assistant?.role === "assistant" ? assistant.toolCalls?.[0].id : undefined);
      expect(beginEdit).not.toHaveBeenCalled();
      expect(toolResultsAt(2)[1]).toMatchObject({ ok: true, receipt: { status: "completed" } });
      loop.cancel();
    }
  } finally { checker.dispose(); }
});


it("distinguishes unavailable checking from code diagnostics in model feedback", async () => {
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValueOnce(toolCall("execute", { code: "return;" })).mockResolvedValueOnce(final());
  const beginEdit = vi.fn();
  await createTestAgentLoop({ tools: [], definition: testDefinition([], { beginEdit }),
    scriptChecker: { check: async () => { throw new Error("checker unavailable"); } }
  }).run("check", {});
  expect(toolResultsAt(1)[0]).toMatchObject({ code: "SCRIPT_CHECK_UNAVAILABLE", phase: "check", error: "checker unavailable", receipt: {status: "rejected"} });
  expect(beginEdit).not.toHaveBeenCalled();
});

it("exposes the current execution source as a task-local execute.js file", async () => {
  mockedRequest.mockReset(); toolCallSequence = 0;
  mockedRequest
    .mockResolvedValueOnce(execute("return 1;"))
    .mockResolvedValueOnce(toolCall("read_tool", { file_path: ".ai/execute.js" }))
    .mockResolvedValueOnce(final());
  await createTestAgentLoop({ tools: [], definition: testDefinition([]) }).run("run", {});
  expect(toolResultsAt(2).at(-1)).toMatchObject({ ok: true, result: { path: ".ai/execute.js", lines: expect.arrayContaining([expect.objectContaining({text: expect.stringContaining("return 1;")})]) } });
});

it("bounds host calls across different execute scripts and starts a fresh budget for the next task",async()=>{
  mockedRequest.mockReset();
  const inspect=vi.fn(()=>({ok:true}));
  const tool=defineTool({name:"inspect",effect:"read",input:z.strictObject({}),output:z.strictObject({ok:z.boolean()}),execute:inspect});
  const loop=createTestAgentLoop({tools:[tool],definition:testDefinition([tool.name]),maxToolCallsPerTask:2,maxToolCallsPerScript:10});
  mockedRequest.mockResolvedValueOnce(execute("await tools.inspect({}); return 1;"))
    .mockResolvedValueOnce(execute("await tools.inspect({}); return 2;"))
    .mockResolvedValueOnce(execute("await tools.inspect({}); return 3;"));
  await expect(loop.run("检查",{})).rejects.toBeInstanceOf(AgentTaskToolLimitError);
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(mockedRequest).toHaveBeenCalledTimes(3);
  mockedRequest.mockResolvedValueOnce(execute("return await tools.inspect({});")).mockResolvedValueOnce(final());
  expect((await loop.run("新的检查",{})).result.status).toBe("completed");
  expect(inspect).toHaveBeenCalledTimes(3);
});

it("cannot catch a read-call budget error to keep a task retrying",async()=>{
  mockedRequest.mockReset();
  const inspect=vi.fn(()=>({ok:true}));
  const tool=defineTool({name:"inspect",effect:"read",input:z.strictObject({}),output:z.strictObject({ok:z.boolean()}),execute:inspect});
  const loop=createTestAgentLoop({tools:[tool],definition:testDefinition([tool.name]),maxToolCallsPerTask:2,maxToolCallsPerScript:10});
  mockedRequest.mockResolvedValueOnce(execute("for(let i=0;i<4;i++){try{await tools.inspect({});}catch{}} return 'done';"));
  await expect(loop.run("检查",{})).rejects.toBeInstanceOf(AgentTaskToolLimitError);
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(mockedRequest).toHaveBeenCalledOnce();
});

it("allows pure computation and a final answer after using exactly the host-call budget",async()=>{
  mockedRequest.mockReset();
  const inspect=vi.fn(()=>({ok:true}));
  const tool=defineTool({name:"inspect",effect:"read",input:z.strictObject({}),output:z.strictObject({ok:z.boolean()}),execute:inspect});
  const loop=createTestAgentLoop({tools:[tool],definition:testDefinition([tool.name]),maxToolCallsPerTask:1});
  mockedRequest.mockResolvedValueOnce(execute("return await tools.inspect({});"))
    .mockResolvedValueOnce(execute("return 6 * 7;"))
    .mockResolvedValueOnce(final());
  expect((await loop.run("检查并计算",{})).result.status).toBe("completed");
  expect(inspect).toHaveBeenCalledOnce();
});

it("allows a large Tool result to be filtered inside execute before the model output budget",async()=>{
 mockedRequest.mockReset();
 const rows=Array.from({length:500},(_,id)=>({id,name:"树木".repeat(100)}));
 const tool=defineTool({name:"inspect",effect:"read",input:z.strictObject({}),output:z.array(z.object({id:z.number(),name:z.string()})),execute:()=>rows});
 const loop=createTestAgentLoop({definition:testDefinition(["inspect"]),tools:[tool]});
 mockedRequest.mockResolvedValueOnce(execute('const rows = await tools.inspect({}); return rows.filter(row => row.id === 499).map(row => row.id);')).mockResolvedValueOnce(final());
 const result=await loop.run("查找第499个对象",{});
 expect(result.stageResults[0]).toMatchObject({ok:true,output:[499]});
});
