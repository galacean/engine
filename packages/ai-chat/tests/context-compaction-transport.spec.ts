import { afterEach, expect, it, vi } from "vitest";
import { requestAsapChat } from "../src/ai-chat/asap-chat";
import { createContextCompactionRequest } from "../src/ai-chat/context-compaction";

afterEach(() => vi.unstubAllGlobals());

it.each(["sdk-direct", "sdk-envelope", "local"])("passes explicit budgets and terminal metadata through %s independently of debug", async transport => {
  const contextCompaction = { version: 2, status: "compacted", strategy: "summary", beforeTokens: 100, afterTokens: 40, durationMs: 7,
    replacement: { prefixLength: 2, cutIndex: 2, summary: "opaque server summary" } };
  const response = { content: "done", finishReason: "stop", contextCompaction };
  let params: any;
  const envelope = (nonce: string) => JSON.stringify({ type: "lingguang_ai_chat_stream_result_bridge", version: 1, nonce, result: response });
  const document = new EventTarget();
  const emit = (nonce: string, content: string, hasNext: boolean) => document.dispatchEvent(Object.assign(new Event("CandyJar.FlashApp.OnRemoteStreamUpdate"), {
    detail: { htmlFragment: { success: true, content, hasNext, extInfo: { debugStreamRequestId: nonce } } }
  }));
  vi.stubGlobal("window", transport === "local" ? {
    location: { hostname: "localhost" }, document,
    CandyJar: { call: (_method: string, _action: string, payload: any) => {
      params = JSON.parse(payload.extInfo.payload).params;
      queueMicrotask(() => {
        const nonce = params.responseFormat.params.streamResponseNonce;
        const text = envelope(nonce);
        emit("stale-nonce", "bad", false);
        emit(nonce, text.slice(0, 40), true);
        emit(nonce, text.slice(40), false);
        emit(nonce, text, false);
      });
    } }
  } : {
    location: { hostname: "example.com" },
    lingguang: { ai: { streamChat: async (request: any) => {
      params = request;
      return transport === "sdk-direct" ? response : { content: envelope(request.responseFormat.params.streamResponseNonce) };
    } } }
  });
  const result = await requestAsapChat({ messages: [], tools: [], debugMode: false, signal: new AbortController().signal,
    contextCompaction: createContextCompactionRequest({ triggerTokens: 100, targetTokens: 40 }) });
  expect(result.contextCompaction).toEqual(contextCompaction);
  expect(params.responseFormat.params.contextCompaction).toEqual({ version: 2, protectedPrefixLength: 2, triggerTokens: 100, targetTokens: 40 });
  expect(params.responseFormat.params.debugMode).toBe(false);
});

it.each([null, {}, { version: 2, status: "compacted" }])("fails closed on malformed metadata at the transport boundary", async contextCompaction => {
  const streamChat = vi.fn(async () => ({ content: "done", finishReason: "stop", contextCompaction }));
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat } } });
  await expect(requestAsapChat({ messages: [], tools: [], debugMode: false, signal: new AbortController().signal,
    contextCompaction: createContextCompactionRequest() })).rejects.toThrow("Invalid contextCompaction");
  expect(streamChat).toHaveBeenCalledTimes(1);
});

it("does not silently resend without compaction when an old server rejects the bridge parameter", async () => {
  const streamChat = vi.fn(async () => { throw new Error("unknown bridge parameter contextCompaction"); });
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat } } });
  await expect(requestAsapChat({ messages: [], tools: [], debugMode: false, signal: new AbortController().signal,
    contextCompaction: createContextCompactionRequest() })).rejects.toThrow("unknown bridge parameter");
  expect(streamChat).toHaveBeenCalledTimes(1);
});
