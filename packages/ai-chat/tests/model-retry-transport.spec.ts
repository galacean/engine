import { afterEach, expect, it, vi } from "vitest";
import { requestAsapChat, AsapModelError, AsapRateLimitError, ASAP_TPM_RATE_LIMIT_MESSAGE } from "../src/ai-chat/asap-chat";
import { formatContextTrace } from "../src/ai-chat/context-trace";
import { AgentTraceStore } from "../src/ai-chat/agent-trace";
import { createTestAgentLoop } from "./AIChatTestRuntime";

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
