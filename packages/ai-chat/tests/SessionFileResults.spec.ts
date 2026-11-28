import { beforeEach, expect, it, vi } from "vitest";
import { createTestAgentLoop } from "./AIChatTestRuntime";
import { AIChatSession } from "../src/ai-chat/ai-chat-session";
import { getAgentTaskFailure } from "../src/ai-chat/agent-loop";
import { SessionData } from "../src/ai-chat/session-data";
import type { AgentExecutionReceipt, AgentStepRecord, AgentTaskResult, AgentToolResult } from "../src/ai-chat/agent-types";

vi.mock("../src/ai-chat/asap-chat", () => ({ requestAsapChat: vi.fn() }));
import { requestAsapChat } from "../src/ai-chat/asap-chat";

const request = vi.mocked(requestAsapChat);
const definition = { toolNames: [], scriptApi: { catalog: "known document", entries: [], modules: [], documents: [{ path: "skills/fixture/README.md", content: "known document" }] } };
const final = { content: "done", finishReason: "stop" as const, toolCalls: [] };
const call = (id: string, name: string, input: unknown) => ({
  id, type: "function" as const, function: { name, arguments: JSON.stringify(input) }
});
const batch = (...toolCalls: ReturnType<typeof call>[]) => ({ content: "", finishReason: "tool_calls" as const, toolCalls });
beforeEach(() => request.mockReset());

it("publishes parallel file results before the next model response and scopes reused call IDs by step", async () => {
  const gate = Promise.withResolvers<typeof final>();
  request.mockResolvedValueOnce(batch(
    call("same-id", "read", { file_path: "skills/fixture/README.md" }),
    call("missing", "read", { file_path: "skills/fixture/missing.md" })
  )).mockResolvedValueOnce(batch(call("same-id", "read", { file_path: "skills/fixture/README.md" })))
    .mockReturnValueOnce(gate.promise);
  const session = new AIChatSession({ agent: createTestAgentLoop({ tools: [], definition }) });
  const running = session.run("read files", { debugMode: true });
  try {
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
    const snapshot = session.snapshot;
    expect(snapshot.current?.outcome).toBeUndefined();
    const steps = snapshot.current!.debug!.steps;
    expect(steps.map(step => [step.step, step.toolCallId, step.scriptResult?.ok])).toEqual([
      [1, "same-id", true], [2, "missing", false], [3, "same-id", true]
    ]);
    expect(steps[0].scriptResult).toMatchObject({ ok: true, output: {
      path: "skills/fixture/README.md", lines: [{ number: 1, text: "known document" }]
    } });
    expect(steps[1].scriptResult).toMatchObject({ ok: false, error: {
      code: "FILE_OPERATION_FAILED", phase: "tool", message: expect.stringContaining("skills/fixture/missing.md")
    } });
    expect(steps.every(step => step.attempts.every(attempt => !attempt.requestMessages))).toBe(true);
    gate.resolve(final);
    const result = await running;
    expect(session.snapshot.current!.debug!.steps.slice(0, 3).map(step => step.scriptResult))
      .toEqual(result.steps.slice(0, 3).map(step => step.scriptResult));
    expect(snapshot.current?.outcome).toBeUndefined();
    expect(Object.isFrozen(steps[0].scriptResult)).toBe(true);
  } finally { gate.resolve(final); await running.catch(() => undefined); session.dispose(); }
});

it.each(["completed", "failed", "cancelled", "aborted", "publication_failed"] as const)(
  "retains the actual file receipt when the task is %s", async mode => {
    const files: Record<string, string> = {};
    const commit = vi.fn((id: string, draft: Record<string, string>) => {
      if (mode === "publication_failed") throw new Error("publication interrupted");
      Object.assign(files, draft);
      return { transactionId: id };
    });
    const agent = createTestAgentLoop({ tools: [], definition: {
      ...definition, projectFiles: [{ paths: () => Object.keys(files), read: path => files[path] }],
      beginEdit(id) {
        const draft = { ...files };
        return {
          tools: [], hasChanges: () => true,
          documents: {
            read: async path => draft[path],
            write: async (path, content) => { draft[path] = content; },
            delete: async path => { delete draft[path]; }
          },
          prepare() { if (mode === "aborted") throw new Error("prepare rejected"); },
          commit: () => commit(id, draft), discard() {}
        };
      }
    } });
    const session = new AIChatSession({ agent });
    const calls = [call("write", "write", { file_path: "saved.md", content: "saved content" })];
    if (mode === "cancelled") calls.push(call("not-started", "write", { file_path: "later.md", content: "later" }));
    request.mockResolvedValueOnce(batch(...calls));
    if (mode === "failed") request.mockRejectedValueOnce(new Error("HTTP 500"));
    else request.mockResolvedValueOnce(final);
    let finished: AgentToolResult | undefined;
    let liveReceipt: AgentExecutionReceipt | undefined;
    let eventReceipt: AgentExecutionReceipt | undefined;
    session.subscribe(event => {
      if (event.type === "tool_finished" && event.toolCallId === "write") {
        finished = event.result;
        // Session has the result even before the loop emits its terminal event.
        liveReceipt = session.snapshot.current!.debug!.steps[0].scriptResult?.receipt;
        eventReceipt = event.receipt;
        if (mode === "cancelled") session.cancel();
      }
    });
    try {
      const outcome: AgentTaskResult | NonNullable<ReturnType<typeof getAgentTaskFailure>> = await session.run("save", { debugMode: true })
        .catch(error => { const failure = getAgentTaskFailure(error); if (!failure) throw error; return failure; });
      const saved = session.snapshot.current!.debug!.steps[0].scriptResult;
      const status = mode === "aborted" || mode === "publication_failed" ? mode : "committed";
      expect(saved?.receipt?.status).toBe(status);
      expect(liveReceipt).toEqual(eventReceipt);
      expect(liveReceipt?.status).toBe(status);
      expect(saved?.ok).toBe(status === "committed");
      expect(saved).toEqual(outcome.steps[0].scriptResult);
      expect(finished?.ok).toBe(saved?.ok);
      if (status === "committed") {
        expect(saved?.receipt?.transactionId).toBeTruthy();
        expect(files["saved.md"]).toBe("saved content");
        expect(commit).toHaveBeenCalledOnce();
      } else expect(files["saved.md"]).toBeUndefined();
      expect(session.snapshot.current?.outcome?.status).toBe(
        mode === "cancelled" ? "stopped" : mode === "failed" || mode === "publication_failed" ? "failed" : "completed"
      );
      if (mode === "cancelled") {
        expect(files["later.md"]).toBeUndefined();
        expect(outcome.steps).toHaveLength(1);
        expect(request).toHaveBeenCalledOnce();
      }
      if (mode === "publication_failed") expect(session.continuationBlocked).toBe(true);
    } finally { session.dispose(); }
  }
);

it.each([
  { reuseId: true, stop: "cancel" },
  { reuseId: false, stop: "cancel" },
  { reuseId: true, stop: "budget" },
  { reuseId: true, stop: "none" }
] as const)("keeps batch admission and continuation receipts scoped to the current call: %j", async ({ reuseId, stop }) => {
  const files: Record<string, string> = {};
  const commit = vi.fn((id: string, draft: Record<string, string>) => {
    Object.assign(files, draft);
    return { transactionId: id };
  });
  const laterId = reuseId ? "write" : "later-write";
  request.mockResolvedValueOnce(batch(call("write", "write", { file_path: "saved.md", content: "saved" })))
    .mockResolvedValueOnce(batch(
      call("read", "read", { file_path: "skills/fixture/README.md" }),
      call(laterId, "write", { file_path: "later.md", content: "later" })
    )).mockResolvedValueOnce(final);
  const agent = createTestAgentLoop({ tools: [], ...(stop === "budget" ? { maxToolCallsPerTask: 1 } : {}), definition: {
    ...definition, projectFiles: [{ paths: () => Object.keys(files), read: path => files[path] }],
    beginEdit(id) {
      const draft = { ...files };
      return {
        tools: [], hasChanges: () => true,
        documents: {
          read: async path => draft[path],
          write: async (path, content) => { draft[path] = content; },
          delete: async path => { delete draft[path]; }
        },
        prepare() {}, discard() {}, commit: () => commit(id, draft)
      };
    }
  } });
  const session = new AIChatSession({ agent });
  session.subscribe(event => {
    if (stop === "cancel" && event.type === "tool_finished" && event.toolCallId === "read") session.cancel();
  });
  try {
    if (stop === "none") {
      await session.run("save both files", { debugMode: true });
      expect(files).toEqual({ "saved.md": "saved", "later.md": "later" });
      expect(commit).toHaveBeenCalledTimes(2);
    } else {
      await expect(session.run("save both files", { debugMode: true })).rejects.toThrow();
      expect(files).toEqual({ "saved.md": "saved" });
      expect(commit).toHaveBeenCalledOnce();
      expect(session.snapshot.current!.debug!.steps[0].scriptResult?.receipt?.status).toBe("committed");
      expect(session.canContinue).toBe(true);
      expect(session.continuationBlocked).toBe(false);
      const resumed = await session.continue();
      await resumed.completion;
      const replies = request.mock.calls[2][0].messages.filter(message => message.role === "tool");
      expect(replies.map(message => message.toolCallId)).toEqual(["write", "read", laterId]);
      expect(JSON.parse(replies.at(-1)!.content).error.code).toBe("NOT_STARTED");
      if (stop === "budget") expect(JSON.parse(replies[1].content).error.code).toBe("INTERRUPTED");
      // Continuing passes the receipts to the model; it does not replay either write.
      expect(files).toEqual({ "saved.md": "saved" });
      expect(commit).toHaveBeenCalledOnce();
    }
    expect(request).toHaveBeenCalledTimes(3);
  } finally { session.dispose(); }
});

it("does not replace execute output with one of its internal tool results", () => {
  const data = new SessionData();
  data.begin({ id: "input", text: "execute", inputSource: "text" }, { debugMode: true }, 0);
  const step: AgentStepRecord = { step: 1, toolCallId: "script", decision: { type: "execute", code: "return 7;" }, attempts: [] };
  data.accept({ type: "model_finished", taskId: "task", step });
  data.accept({ type: "tool_finished", taskId: "task", step: 1, call: 1, tool: "world.query", result: { ok: true, value: "internal" } });
  expect(data.current?.debug?.steps[0].scriptResult).toBeUndefined();
  data.accept({ type: "script_finished", taskId: "task", step: 1, result: { ok: true, output: 7 } });
  expect(data.current?.debug?.steps[0].scriptResult).toEqual({ ok: true, output: 7 });
});
