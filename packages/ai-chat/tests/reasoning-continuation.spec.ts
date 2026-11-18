import { afterEach, expect, it, vi } from "vitest";
import { requestAsapChat } from "../src/ai-chat/asap-chat";
import { createTestAgentLoop } from "./AIChatTestRuntime";
import { AgentTraceStore } from "../src/ai-chat/agent-trace";
import { AIChatSession } from "../src/ai-chat/ai-chat-session";

afterEach(() => vi.unstubAllGlobals());

const states = ["native round one\n  preserve whitespace ", "native round two\n "];
const tool = (round: number) => ({ content: "", reasoningContent: states[round], finishReason: "tool_calls",
  toolCalls: [{ id: `call-${round}`, type: "function", function: { name: "glob", arguments: '{"pattern":"**"}' } }] });
const done = { content: "done", finishReason: "stop", reasoningContent: "native final state" };
const definition = { scriptApi: { catalog: "API", entries: [], modules: [] }, toolNames: [] };
function envelope(nonce: string, result: unknown) {
  return JSON.stringify({ type: "lingguang_ai_chat_stream_result_bridge", version: 1, nonce, result });
}

it.each([false, true].flatMap(debugMode => ["sdk-direct", "sdk-envelope", "local"].map(transport => ({ debugMode, transport }))))(
  "round-trips native state through two tool rounds ($transport, debug=$debugMode) without exporting it", async ({ transport, debugMode }) => {
    const requests: any[] = [];
    const respond = (params: any) => {
      requests.push({ messages: structuredClone(params.messages) });
      return requests.length <= 2 ? tool(requests.length - 1) : done;
    };
    const document = new EventTarget();
    vi.stubGlobal("window", transport === "local" ? {
      location: { hostname: "localhost" }, document,
      CandyJar: { call: (_method: string, _action: string, payload: any) => {
        const params = JSON.parse(payload.extInfo.payload).params;
        const text = envelope(params.responseFormat.params.streamResponseNonce, respond(params));
        queueMicrotask(() => {
          for (const [content, hasNext] of [[text.slice(0, 45), true], [text.slice(45), false]] as const) {
            document.dispatchEvent(Object.assign(new Event("CandyJar.FlashApp.OnRemoteStreamUpdate"), {
              detail: { htmlFragment: { success: true, content, hasNext, extInfo: { debugStreamRequestId: params.responseFormat.params.streamResponseNonce } } }
            }));
          }
        });
      } }
    } : {
      location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async (params: any) => {
        const result = respond(params);
        return transport === "sdk-direct" ? result : { content: envelope(params.responseFormat.params.streamResponseNonce, result) };
      } } }
    });
    const loop = createTestAgentLoop({ tools: [], definition });
    const trace = new AgentTraceStore({ enabled: true });
    trace.begin({ input: "inspect twice", inputSource: "text" });
    const events: unknown[] = [];
    loop.subscribe(event => { events.push(event); trace.captureAgentEvent(event); });
    const result = await loop.run("inspect twice", { debugMode });
    expect(result.finalMessage).toBe("done");
    expect(requests).toHaveLength(3);
    for (let round = 1; round <= 2; round++) {
      const assistants = requests[round].messages.filter((m: any) => m.role === "assistant");
      expect(assistants.map((m: any) => m.reasoningContent)).toEqual(states.slice(0, round));
      expect(assistants.map((m: any) => m.toolCalls[0].id)).toEqual(Array.from({ length: round }, (_, i) => `call-${i}`));
      expect(requests[round].messages.filter((m: any) => m.role === "tool").map((m: any) => m.toolCallId)).toEqual(assistants.map((m: any) => m.toolCalls[0].id));
    }
    for (const output of [JSON.stringify(events), JSON.stringify(result), trace.exportCurrentTrace()]) {
      expect(output).not.toContain("native round");
      expect(output).not.toContain("native final state");
      expect(output).not.toContain("reasoningContent");
    }
  }
);

it("does not reconstruct native state from visible content or diagnostic fields", async () => {
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async () => ({
    content: "<think>visible text</think>done", finishReason: "stop", debug: { reasoningContent: "diagnostic-only" }
  }) } } });
  const result = await requestAsapChat({ messages: [], tools: [], debugMode: true, signal: new AbortController().signal });
  expect(result).not.toHaveProperty("reasoningContent");
  expect(result.content).toBe("<think>visible text</think>done");
});

it.each([null, 42, {}, []])("rejects malformed native state instead of silently dropping it: %j", async reasoningContent => {
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async () => ({ ...done, reasoningContent }) } } });
  await expect(requestAsapChat({ messages: [], tools: [], debugMode: false, signal: new AbortController().signal })).rejects.toThrow("reasoningContent");
});

it("retains the matching native state through compaction and stop/continue, then clears it for a new task", async () => {
  const requests: any[] = [];
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: async (params: any) => {
    requests.push(structuredClone(params.messages));
    if (requests.length === 1) return tool(0);
    if (requests.length === 2) return { ...tool(1), contextCompaction: {
      version: 2, status: "compacted", strategy: "summary", beforeTokens: 1000, afterTokens: 400, durationMs: 1,
      replacement: { prefixLength: params.responseFormat.params.contextCompaction.protectedPrefixLength, cutIndex: 2, summary: "first tool completed" }
    } };
    if (requests.length === 3) return new Promise((_resolve, reject) => {
      params.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    return done;
  } } } });
  const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition }) });
  const running = session.run("inspect twice");
  const rejected = expect(running).rejects.toThrow("cancelled");
  await vi.waitFor(() => expect(requests).toHaveLength(3));
  await session.stop();
  await rejected;
  await (await session.continue()).completion;
  const assistants = requests[3].filter((m: any) => m.role === "assistant");
  expect(assistants).toHaveLength(1);
  expect(assistants[0]).toMatchObject({ reasoningContent: states[1], toolCalls: [{ id: "call-1" }] });
  expect(JSON.stringify(requests[3])).not.toContain(states[0].trim());
  await session.run("new task");
  expect(requests[4].some((m: any) => m.reasoningContent !== undefined)).toBe(false);
});
