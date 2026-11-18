import { afterEach, expect, it, vi } from "vitest";
import { AIChatSession } from "../src/ai-chat/ai-chat-session";
import { createTestAgentLoop } from "./AIChatTestRuntime";
import { AgentTraceStore } from "../src/ai-chat/agent-trace";
import { recoveryStatus, type ModelRecoveryEvent } from "../src/ai-chat/model-recovery";
import type { AgentEvent } from "../src/ai-chat/agent-types";
import { SessionData } from "../src/ai-chat/session-data";

afterEach(() => vi.unstubAllGlobals());
const observation: ModelRecoveryEvent = { sequence: 1, phase: "retry_wait", layer: "transport",
  attempt: 2, maxAttempts: 3, elapsedMs: 20, remainingMs: 119980, delayMs: 500, category: "rate_limit" };

it.each(["success", "failure", "disconnect", "cancel"])("retains recovery through the transport and Session after %s without a terminal history", async outcome => {
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const send = vi.fn(async (request: any) => {
    const nonce = request.responseFormat.params.streamResponseNonce;
    const line = JSON.stringify({ type: "lingguang_ai_chat_recovery", version: 1, nonce, event: observation }) + "\n";
    request.onEvent({ type: "text_delta", delta: line, text: line });
    request.onEvent({ type: "text_delta", delta: "", text: line });
    started();
    if (outcome === "cancel") {
      return await new Promise((_resolve, reject) => request.signal.addEventListener("abort",
        () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
    }
    if (outcome === "disconnect") throw new Error("connection lost");
    const result = outcome === "failure"
      ? { content: "", toolCalls: [], error: { code: "MODEL_GENERATION_FAILED", message: "provider failed" } }
      : { content: "done", toolCalls: [], finishReason: "stop" };
    return { content: line + JSON.stringify({ type: "lingguang_ai_chat_stream_result_bridge", version: 1, nonce, result }) };
  });
  vi.stubGlobal("window", { location: { hostname: "example.com" }, lingguang: { ai: { streamChat: send } } });
  const agent = createTestAgentLoop({ tools: [], definition: {
    toolNames: [], scriptApi: { catalog: "API", entries: [], modules: [] }
  } });
  const session = new AIChatSession({ agent });
  const trace = new AgentTraceStore({ enabled: true });
  trace.begin({ input: "inspect", inputSource: "text" });
  const events: AgentEvent[] = [];
  session.subscribe(event => { events.push(event); trace.captureAgentEvent(event); });
  const completion = session.submit("inspect").completion.catch(error => error);
  await ready;
  if (outcome === "cancel") await session.stop();
  await completion;
  expect(send).toHaveBeenCalledOnce();
  const current = session.snapshot.current!;
  expect(current.debug).toBeUndefined(); // Recording does not depend on debug or Trace being enabled.
  expect(current.recoveryEvents).toHaveLength(1);
  expect(current.recoveryEvents[0]).toMatchObject({ step: 1, attempt: 1, recovery: observation });
  expect(current.recoverySummary).toMatchObject({ retries: { transport: 1 }, scheduledWaitMs: 500 });
  expect(current.progress.some(p => p.kind === "recovery" && recoveryStatus(p.recovery).includes("服务繁忙"))).toBe(true);
  expect(current.outcome?.status).toBe(outcome === "success" ? "completed" : outcome === "cancel" ? "stopped" : "failed");
  const exported = JSON.parse((await trace.exportCurrentTrace())!);
  expect(exported.diagnostics.recovery).toEqual(current.recoverySummary);
  expect(exported.diagnostics.model.recoveredRequests).toBe(outcome === "success" ? 1 : 0);
  expect(events.filter(e => e.type === "model_recovery")).toHaveLength(1);
  for (const event of events) {
    const attempts = event.type === "model_finished" ? event.step.attempts : event.type === "model_failed" ? event.attempts : [];
    for (const attempt of attempts) expect(attempt).not.toHaveProperty("recovery");
  }
  let remounted: typeof session.snapshot | undefined;
  const unsubscribe = session.subscribeState(snapshot => { remounted = snapshot; });
  expect(remounted!.current!.recoveryEvents).toEqual(current.recoveryEvents);
  unsubscribe();
  session.dispose();
});

it("deduplicates by request identity, retains records beyond presentation limits and rejects foreign/late events", () => {
  const data = new SessionData();
  data.begin({ id: "input", text: "inspect", inputSource: "text" }, {}, 0);
  data.accept({ type: "task_started", taskId: "task", input: "inspect" } as AgentEvent);
  const event = { type: "model_recovery" as const, taskId: "task", step: 1, attempt: 1, recovery: observation };
  expect(data.accept(event)).toBe(true);
  expect(data.accept(event)).toBe(false);
  expect(data.accept({ ...event, taskId: "foreign" })).toBe(false);
  expect(data.accept({ ...event, attempt: 2 })).toBe(true);
  for (let sequence = 2; sequence <= 300; sequence++)
    data.accept({ ...event, recovery: { ...observation, sequence } });
  const snapshot = data.snapshot("executing", false, false, []);
  expect(snapshot.current!.progress).toHaveLength(256);
  expect(snapshot.current!.recoveryEvents).toHaveLength(301);
  expect(snapshot.current!.recoverySummary.retries.transport).toBe(301);
  data.fail(new Error("stopped"), true);
  expect(data.accept({ ...event, step: 2 })).toBe(false);
  expect(snapshot.current!.outcome).toBeUndefined();
});
