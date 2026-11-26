import { afterEach, expect, it, vi } from "vitest";
import { requestAsapChat, AsapModelError, AsapRateLimitError, ASAP_TPM_RATE_LIMIT_MESSAGE } from "../src/ai-chat/asap-chat";
import { formatContextTrace } from "../src/ai-chat/context-trace";
import { AgentTraceStore } from "../src/ai-chat/agent-trace";
import { createTestAgentLoop } from "./AIChatTestRuntime";
import { AIChatSession } from "../src/ai-chat/ai-chat-session";
import { fixtureBlob } from "./image-fixture";

afterEach(() => vi.unstubAllGlobals());

it.each(["local", "sdk-envelope", "sdk-direct"])("preserves server retry exhaustion over %s without frontend retry", async transport => {
  const telemetry = { modelName: "resolved", usage: { source: "provider", inputTokens: 400, outputTokens: 8000 } };
  const error = { code: "MODEL_GENERATION_FAILED", message: "output budget exhausted",
    details: { agent_error: { source: "llm_provider", category: "response", exception_type: "WrappedModelError" } } };
  const modelAttempts = [1, 2, 3].map(attempt => ({ attempt, finishReason: "length", error, telemetry }));
  const result = { content: "", toolCalls: [], finishReason: "length", error, telemetry, modelAttempts, traceId: "trace-exhausted" };
  const envelope = (nonce: string) => JSON.stringify({ type: "lingguang_ai_chat_stream_result_bridge", version: 1, nonce, result });
  const document = new EventTarget();
  const send = vi.fn((request: any) => {
    const nonce = request.responseFormat.params.streamResponseNonce;
    return transport === "sdk-direct" ? result : { content: envelope(nonce) };
  });
  vi.stubGlobal("window", transport === "local" ? {
    location: { hostname: "localhost" }, document,
    CandyJar: { call: (_m: string, _a: string, payload: any) => {
      const request = JSON.parse(payload.extInfo.payload).params;
      const response = send(request);
      queueMicrotask(() => document.dispatchEvent(Object.assign(new Event("CandyJar.FlashApp.OnRemoteStreamUpdate"), {
        detail: { htmlFragment: { success: true, content: response.content, hasNext: false,
          extInfo: { debugStreamRequestId: request.responseFormat.params.streamResponseNonce } } }
      })));
    } }
  } : { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: send } } });
  const failure = await requestAsapChat({ messages: [], tools: [], debugMode: false,
    signal: new AbortController().signal }).catch(error => error);
  expect(failure).toBeInstanceOf(AsapModelError);
  expect(failure).toMatchObject({ code: error.code, message: error.message, finishReason: "length", traceId: "trace-exhausted",
    details: error.details, telemetry, modelAttempts });
  expect(send).toHaveBeenCalledTimes(1);
  const trace = formatContextTrace([{ elapsedMilliseconds: 1, event: {
    type: "model_failed", taskId: "task", step: 1, error: failure, attempts: [{ attempt: 1, rawContent: "",
      error: failure.message, errorCode: failure.code, finishReason: failure.finishReason, telemetry: failure.telemetry, modelAttempts: failure.modelAttempts }]
  } }]);
  expect(trace).toContain("MODEL_GENERATION_FAILED");
  expect(trace).toContain("1.1/ASAP-3");
  expect(trace).toContain("实际输入 400；输出 8000");
});

it("rejects mismatched error envelope nonce before consuming its usage", async () => {
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async () => ({
    content: JSON.stringify({ type: "lingguang_ai_chat_stream_result_bridge", version: 1, nonce: "wrong-nonce",
      result: { content: "", error: { code: "MODEL_GENERATION_FAILED", message: "wrong task" }, telemetry: { modelName: "wrong" } } })
  }) } } });
  const failure = await requestAsapChat({ messages: [], tools: [], debugMode: false, signal: new AbortController().signal }).catch(error => error);
  expect(failure.message).toContain("结果信封无效");
  expect(failure.telemetry).toBeUndefined();
});

it.each(["TPM_LIMIT_EXCEEDED", "RATE_LIMIT_EXCEEDED_ERROR"])("preserves rate-limit presentation and model metadata for %s", async code => {
  const telemetry = { modelName: "resolved", usage: { source: "provider", inputTokens: 100, outputTokens: 32 } };
  const modelAttempts = [{ attempt: 1, finishReason: "length", telemetry }];
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async () => ({
    content: "", error: { code, message: "rate limited" }, telemetry, modelAttempts, traceId: "rate-trace"
  }) } } });
  const failure = await requestAsapChat({ messages: [], tools: [], debugMode: false, signal: new AbortController().signal }).catch(error => error);
  expect(failure).toBeInstanceOf(AsapRateLimitError);
  expect(failure).toMatchObject({ code, traceId: "rate-trace", telemetry, modelAttempts });
  expect(failure.message).toBe(code === "TPM_LIMIT_EXCEEDED" ? ASAP_TPM_RATE_LIMIT_MESSAGE : "rate limited");
});

it.each(["MODEL_GENERATION_FAILED", "RATE_LIMIT_EXCEEDED_ERROR"])("exports %s details through the real transport and AgentLoop without another model call", async code => {
  const details = { agent_error: { source: "llm_provider", category: "response", exception_type: "ProviderError" },
    model_retry: { retry_after_milliseconds: 3600000 } };
  const originalDetails = structuredClone(details);
  const telemetry = { modelName: "resolved", usage: { source: "provider", inputTokens: 100, outputTokens: 32 } };
  const error = { code, message: "original provider failure", details };
  const modelAttempts = [
    { attempt: 1, finishReason: "length", telemetry },
    { attempt: 2, error, telemetry: { modelName: "resolved" } }
  ];
  const send = vi.fn(async () => ({ content: "", toolCalls: [], error, modelAttempts,
    telemetry: { modelName: "resolved" }, traceId: "details-trace" }));
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: send } } });
  const loop = createTestAgentLoop({ tools: [], definition: {
    scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: []
  } });
  const store = new AgentTraceStore({ enabled: true });
  store.begin({ input: "read only", inputSource: "text" });
  loop.subscribe(event => store.captureAgentEvent(event));
  const failure = await loop.run("read only", { debugMode: true }).catch(error => error);
  expect(failure).toMatchObject({ code, message: error.message, details: originalDetails });
  expect(send).toHaveBeenCalledOnce();
  details.model_retry.retry_after_milliseconds = 1;
  expect(failure.details).toEqual(originalDetails);
  expect(failure.modelAttempts[1].error.details).toEqual(originalDetails);
  const events = JSON.parse((await store.exportCurrentTrace())!).agentEvents.map(({ event }: any) => event);
  const attempts = events.find((event: any) => event.type === "model_failed").attempts;
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ errorCode: code, errorDetails: originalDetails, modelAttempts: [
    { attempt: 1, telemetry }, { attempt: 2, error: { code, message: error.message, details: originalDetails } }
  ] });
  expect(attempts[0].telemetry).not.toHaveProperty("usage");
  expect(attempts[0].modelAttempts[1].telemetry).not.toHaveProperty("usage");
  expect(events.some((event: any) => ["script_started", "tool_started"].includes(event.type))).toBe(false);
});

it.each([undefined, null, "invalid", []])("keeps the original model failure when optional details are absent or invalid: %j", async details => {
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async () => ({
    content: "", error: { code: "MODEL_GENERATION_FAILED", message: "original failure", details }
  }) } } });
  const failure = await requestAsapChat({ messages: [], tools: [], debugMode: false, signal: new AbortController().signal }).catch(error => error);
  expect(failure).toBeInstanceOf(AsapModelError);
  expect(failure.message).toBe("original failure");
  expect(failure.details).toBeUndefined();
});

it.each(["local", "sdk"])("streams recovery before the terminal over %s, validates nonce and ignores duplicate snapshots", async transport => {
  const progress: any[] = [];
  const document = new EventTarget();
  const observation = { sequence: 1, phase: "retry_wait", layer: "transport", attempt: 2, maxAttempts: 3,
    elapsedMs: 20, remainingMs: 119980, delayMs: 500, category: "rate_limit" };
  const send = async (request: any) => {
    expect(request.responseFormat.params.recoveryEvents).toBe(true);
    const nonce = request.responseFormat.params.streamResponseNonce;
    const line = JSON.stringify({ type: "lingguang_ai_chat_recovery", version: 1, nonce, event: observation }) + "\n";
    const result = JSON.stringify({ type: "lingguang_ai_chat_stream_result_bridge", version: 1, nonce,
      result: { content: "done", finishReason: "stop", toolCalls: [] } });
    if (transport === "sdk") {
      request.onEvent({ type: "text_delta", delta: line.slice(0, 20), text: line.slice(0, 20) });
      expect(progress).toHaveLength(0);
      request.onEvent({ type: "text_delta", delta: line.slice(20), text: line });
    } else {
      for (const content of [line.slice(0, 20), line.slice(20)]) document.dispatchEvent(Object.assign(
        new Event("CandyJar.FlashApp.OnRemoteStreamUpdate"), { detail: { htmlFragment: {
          success: true, content, hasNext: true, extInfo: { debugStreamRequestId: nonce }
        } } }));
    }
    expect(progress).toEqual([observation]); // Before the model response has completed.
    if (transport === "sdk") return { content: line + result };
    document.dispatchEvent(Object.assign(new Event("CandyJar.FlashApp.OnRemoteStreamUpdate"), {
      detail: { htmlFragment: { success: true, content: result, hasNext: false,
        extInfo: { debugStreamRequestId: nonce } } }
    }));
  };
  vi.stubGlobal("window", transport === "sdk" ? { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: send } } }
    : { location: { hostname: "localhost" }, document, CandyJar: { call: (_m: string, _a: string, payload: any) => {
      void send(JSON.parse(payload.extInfo.payload).params);
    } } });
  const result = await requestAsapChat({ messages: [], tools: [], debugMode: false,
    signal: new AbortController().signal, onRecovery: event => progress.push(event) });
  expect(result.content).toBe("done");
  expect(result).not.toHaveProperty("recovery");
  expect(progress).toHaveLength(1);
});

it("rejects a foreign recovery nonce without reporting progress", async () => {
  const onRecovery = vi.fn();
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async () => ({
    content: JSON.stringify({ type: "lingguang_ai_chat_recovery", version: 1, nonce: "foreign", event: {
      sequence: 1, phase: "requesting", layer: "output", attempt: 1, maxAttempts: 3, elapsedMs: 0, remainingMs: 100, delayMs: 0
    } }) + "\n{}"
  }) } } });
  await expect(requestAsapChat({ messages: [], tools: [], debugMode: false, signal: new AbortController().signal, onRecovery }))
    .rejects.toMatchObject({ code: "MODEL_PROTOCOL_ERROR" });
  expect(onRecovery).not.toHaveBeenCalled();
});

it.each([false, true])("does not reconstruct recovery from terminal metadata (error=%s)", async failed => {
  const onRecovery = vi.fn();
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async () => ({
    content: failed ? "" : "done", toolCalls: [],
    ...(failed ? { error: { code: "MODEL_GENERATION_FAILED", message: "failed" } } : {}),
    recovery: [{ sequence: 1, phase: "retry_wait", layer: "transport", attempt: 2, maxAttempts: 3,
      elapsedMs: 10, remainingMs: 100, delayMs: 50, category: "rate_limit" }]
  }) } } });
  const result = await requestAsapChat({ messages: [], tools: [], debugMode: false,
    signal: new AbortController().signal, onRecovery }).catch(error => error);
  expect(result).not.toHaveProperty("recovery");
  expect(onRecovery).not.toHaveBeenCalled();
});

it("uses an independent random queryId shared between local streamChat and stopChat", async () => {
  const calls: Array<{ method: string; action: string; payload: any }> = [];
  vi.stubGlobal("window", {
    location: { hostname: "localhost" },
    document: new EventTarget(),
    CandyJar: {
      call: (method: string, action: string, payload: any) => {
        calls.push({ method, action, payload });
      },
    },
  });

  const controller = new AbortController();
  const pending = requestAsapChat({
    messages: [],
    tools: [],
    debugMode: false,
    signal: controller.signal,
  });
  await Promise.resolve();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ method: "FlashApp", action: "remoteStreamSkill" });
  const streamParams = JSON.parse(calls[0].payload.extInfo.payload).params;
  expect(streamParams.queryId).toMatch(/^[a-f0-9]{32}$/);
  expect(streamParams.queryId).not.toBe(streamParams.responseFormat.params.streamResponseNonce);

  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ method: "FlashApp", action: "remoteSkill" });
  expect(calls[1].payload.action).toBe("lingguang.ai.stopChat");
  expect(JSON.parse(calls[1].payload.payload).params).toEqual({
    sessionId: streamParams.sessionId,
    queryId: streamParams.queryId,
  });
});

it.each([false, true])("runs the same screenshot, length retry and follow-up via dedicated=%s", async dedicated => {
  const requests: unknown[] = [];
  const screenshot = "data:image/png;base64,AAAA";
  const observation = { sequence: 1, phase: "requesting", layer: "output", attempt: 1, maxAttempts: 1,
    elapsedMs: 3, remainingMs: 119000, delayMs: 0 };
  const send = vi.fn(async (request: any) => {
    const { messages, model, timeout, responseFormat, sessionId, queryId, signal, onEvent, version, ...direct } = request;
    const params = dedicated ? direct : responseFormat.params;
    requests.push({ messages, params });
    expect(params).toMatchObject({ recoveryEvents: true, parallelToolCalls: true, debugMode: true });
    expect(params.tools.map((tool: any) => tool.function.name)).toContain("snapshot");
    if (dedicated) {
      expect(responseFormat).toBeUndefined();
      expect(model).toBeUndefined();
      expect(version).toBe(1);
      expect(sessionId).toMatch(/^seed-world-[0-9a-f]{32}$/);
      expect(queryId).not.toBe(params.streamResponseNonce);
    }
    const nonce = params.streamResponseNonce;
    const recovery = JSON.stringify({ type: dedicated ? "lingguang_seed_world_stream_recovery" : "lingguang_ai_chat_recovery", version: 1, nonce, event: observation }) + "\n";
    onEvent({ type: "text_delta", text: recovery, delta: recovery });
    const result = { content: "", toolCalls: [] as unknown[], finishReason: "stop" };
    if (requests.length === 1) {
      result.finishReason = "length";
      result.content = "discard this truncated result";
    } else if (requests.length === 2) {
      result.finishReason = "tool_calls";
      result.toolCalls = [{ type: "function", id: "view-1", function: { name: "snapshot", arguments: "{}" } }];
    } else if (requests.length === 3) {
      expect(JSON.stringify(messages)).toContain(screenshot);
      expect(messages).toContainEqual(expect.objectContaining({ role: "tool", toolCallId: "view-1" }));
      result.content = "The image shows a lake.";
    } else {
      expect(JSON.stringify(messages)).toContain("The image shows a lake.");
      result.content = "The lake is still there.";
    }
    const terminal = JSON.stringify({ type: dedicated ? "lingguang_seed_world_stream_result" : "lingguang_ai_chat_stream_result_bridge", version: 1, nonce, result });
    return { content: recovery + terminal };
  });
  const stop = vi.fn();
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: dedicated
    ? { seedWorldStream: send, seedWorldStop: stop } : { streamChat: send } } });
  const captureSnapshot = vi.fn(async () => ({
    image: { blob: fixtureBlob(screenshot), width: 2, height: 2 }, metadata: { snapshotId: "view" }
  }));
  const loop = createTestAgentLoop({ tools: [], useSeedWorldAction: dedicated, definition: {
    scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [], captureSnapshot
  } });
  const session = new AIChatSession({ agent: loop });
  try {
    await session.run("what do you see?", { debugMode: true });
    await session.run("is it still there?", { debugMode: true });
    expect(captureSnapshot).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(4);
    expect(stop).not.toHaveBeenCalled();
  } finally {
    session.dispose();
  }
});

it("stops just the in-flight dedicated model call and ignores its late result", async () => {
  const controller = new AbortController();
  const stop = vi.fn(async () => ({ success: true, status: "accepted" }));
  let resolveLate!: (value: unknown) => void;
  const send = vi.fn(() => new Promise(resolve => { resolveLate = resolve; }));
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { seedWorldStream: send, seedWorldStop: stop } } });
  const request = requestAsapChat({ messages: [], tools: [], debugMode: false, useSeedWorldAction: true, signal: controller.signal });
  const [{ sessionId }] = send.mock.calls[0] as unknown as [{ sessionId: string }];
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: "AbortError" });
  expect(stop).toHaveBeenCalledExactlyOnceWith(sessionId);
  resolveLate({ content: "late" });
});


it.each(["foreign nonce", "old protocol", "wrong version"])("rejects a Seed World terminal with %s", async failure => {
  const send = async (request: { streamResponseNonce: string }) => ({
    content: JSON.stringify({
      type: failure === "old protocol" ? "lingguang_ai_chat_stream_result_bridge" : "lingguang_seed_world_stream_result",
      version: failure === "wrong version" ? 2 : 1,
      nonce: failure === "foreign nonce" ? "different-request" : request.streamResponseNonce,
      result: { content: "must not be accepted", toolCalls: [], finishReason: "stop" }
    })
  });
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { seedWorldStream: send, seedWorldStop: vi.fn() } } });
  await expect(requestAsapChat({
    messages: [], tools: [], debugMode: false, useSeedWorldAction: true, signal: new AbortController().signal
  })).rejects.toMatchObject({ code: "MODEL_PROTOCOL_ERROR" });
});
