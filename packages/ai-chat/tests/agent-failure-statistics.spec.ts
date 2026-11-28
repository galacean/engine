import { expect, it } from "vitest";
import { classifyFailure, describeTaskFailure, summarizeExecutions } from "../src/ai-chat/agent-failure";
import { summarizeFailures } from "../src/ai-chat/agent-failure-statistics";
import { AgentTraceStore } from "../src/ai-chat/agent-trace";

it.each([
  [{ finishReason: "length" }, "output_limit"],
  [{ details: { model_retry: { classification: "hard_rate_limit", status_code: 429 } } }, "quota"],
  [{ details: { model_retry: { classification: "transient_rate_limit" } } }, "rate_limit"],
  [{ details: { model_retry: { status_code: 401 } } }, "request"],
  [{ details: { agent_error: { category: "connection" } } }, "connection"],
  [{ name: "AbortError" }, "cancelled"],
  [{ code: "SCRIPT_CHECK_FAILED" }, "tool"],
  [{ code: "NEW_PROVIDER_CODE" }, "unknown"]
])("classifies safe metadata without replacing the original error: %j", (failure, category) => {
  expect(classifyFailure(failure as any)).toBe(category);
});

it("keeps committed, rejected, read-only and uncertain receipts distinct", () => {
  const summary = summarizeExecutions([
    { executionId: "read", status: "completed" }, { executionId: "write", status: "committed" },
    { executionId: "rejected", status: "rejected" }, { executionId: "draft", status: "aborted" },
    { executionId: "lost", status: "publication_failed" },
    { executionId: "commands", status: "interrupted", commands: [
      { call: 1, tool: "create", status: "settled", ok: true, commandId: "created" },
      { call: 2, tool: "update", status: "unknown" }
    ] }, { executionId: "write", status: "committed" }
  ]);
  expect(summary.committed).toEqual(["write"]);
  expect(summary.committedCommands).toEqual(["created"]);
  expect(summary.notExecuted).toEqual(["rejected"]);
  expect(summary.uncertain).toEqual(["lost", "commands"]);
  const text = describeTaskFailure("模型输出达到长度上限", summary, "output_limit", true);
  expect(text).toContain("已完成的修改已保留");
  expect(text).toContain("部分操作的结果尚未确认");
  expect(text).toContain("本次模型请求未返回可执行结果");
  expect(text).not.toContain("本次指令未执行");
});

it("deduplicates multi-call replies and separates recovered attempts, tool errors and task status", async () => {
  const attempt = { attempt: 1, rawContent: "", error: null, traceId: "one", durationMilliseconds: 42,
    modelAttempts: [
      { attempt: 1, finishReason: "length", error: { code: "MODEL_GENERATION_FAILED", message: "length" } },
      { attempt: 2, finishReason: "tool_calls" }
    ] };
  const records = [1, 2].map(step => ({ elapsedMilliseconds: step, event: {
    type: "model_finished", taskId: "task", step: { step, modelStep: 1, attempts: [attempt] }
  } }));
  const result = summarizeFailures([...records, { elapsedMilliseconds: 3, event: {
    type: "tool_finished", taskId: "task", step: 2, call: 1, tool: "read",
    result: { ok: false, error: { code: "FILE_OPERATION_FAILED", message: "path" } }
  } }, { elapsedMilliseconds: 4, event: { type: "task_completed" } }]);
  expect(result.model).toMatchObject({ requests: 1, generationAttempts: 2, failedRequests: 0,
    recoveredRequests: 1, durationMs: 42, failuresByCategory: { output_limit: 1 } });
  expect(result.tools.failedCalls).toBe(1);
  expect(result.taskStatus).toBe("completed");
  const store = new AgentTraceStore({ enabled: true });
  const id = store.begin({ input: "test", inputSource: "text" });
  store.finish(id, "cancelled");
  const exported = JSON.parse((await store.exportLastTrace())!);
  expect(exported.diagnostics.model.failedRequests).toBe(0);
});

it("counts a recovered transport request and keeps cancellation out of failure totals", () => {
  const event = { sequence: 1, phase: "retry_wait", layer: "transport", attempt: 2, maxAttempts: 3,
    elapsedMs: 10, remainingMs: 1000, delayMs: 500, category: "rate_limit" };
  const summary = summarizeFailures([
    { elapsedMilliseconds: 1, event: { type: "model_recovery", taskId: "task", step: 1, attempt: 1, recovery: event } },
    { elapsedMilliseconds: 2, event: { type: "model_finished", taskId: "task", step: { step: 1, attempts: [
      { attempt: 1, error: null, rawContent: "", modelAttempts: [{ attempt: 1, finishReason: "stop" }] }
    ] } } },
    { elapsedMilliseconds: 3, event: { type: "script_finished", taskId: "task", step: 2,
      result: { ok: false, error: { code: "SCRIPT_CANCELLED", message: "cancelled" } } } }
  ], "cancelled");
  expect(summary.model.recoveredRequests).toBe(1);
  expect(summary.recovery.retries.transport).toBe(1);
  expect(summary.recovery.scheduledWaitMs).toBe(500);
  expect(summary.scripts.failedExecutions).toBe(0);
  expect(summary.scripts.cancelledExecutions).toBe(1);
  expect(summary.taskStatus).toBe("cancelled");
});

it("describes the model cause once even when an older backend embeds execution wording", () => {
  const empty = summarizeExecutions([]);
  const message = describeTaskFailure("模型输出达到长度上限，本轮未生成可执行结果。", empty, "output_limit", true);
  expect(message).toBe("任务未完成：本次回复过长，处理已停止。\n本次任务没有保存新的修改。\n本次模型请求未返回可执行结果。");
  const partial = describeTaskFailure("模型输出达到长度上限，本次指令未执行。",
    summarizeExecutions([{ executionId: "saved", status: "committed" }]), "output_limit", true);
  expect(partial).toBe("任务未完成：本次回复过长，处理已停止。\n已完成的修改已保留。\n本次模型请求未返回可执行结果。");
  expect(partial).not.toContain("本次指令未执行");
});

it("describes cancellation with task-wide outcomes instead of counting rejected attempts as unfinished steps", () => {
  const reads = summarizeExecutions([
    { executionId: "read", status: "completed" },
    ...Array.from({ length: 4 }, (_, i) => ({ executionId: `bad-${i}`, status: "rejected" as const }))
  ]);
  expect(describeTaskFailure("cancel", reads, "cancelled", true))
    .toBe("任务已停止。\n本次任务没有保存新的修改。");
  expect(reads.notExecuted).toHaveLength(4);
  const partial = summarizeExecutions([
    { executionId: "saved", status: "committed" }, { executionId: "draft", status: "aborted" }
  ]);
  expect(describeTaskFailure("cancel", partial, "cancelled", false))
    .toBe("任务已停止。\n已完成的修改已保留。\n未提交的修改已撤销。");
  const uncertain = summarizeExecutions([{ executionId: "unknown", status: "publication_failed" }]);
  expect(describeTaskFailure("cancel", uncertain, "cancelled", false))
    .toBe("任务已停止。\n部分操作的结果尚未确认，需要检查当前状态。");
});

it("reads legacy trace recovery only when no canonical event supplies that identity", () => {
  const recovery = { sequence: 1, phase: "retry_wait", layer: "transport", attempt: 2, maxAttempts: 3,
    elapsedMs: 10, remainingMs: 1000, delayMs: 500, category: "rate_limit" };
  const legacy = { elapsedMilliseconds: 2, event: { type: "model_finished", taskId: "task", step: { step: 1, attempts: [
    { attempt: 1, error: null, recovery: [recovery] }
  ] } } };
  const canonical = { elapsedMilliseconds: 1, event: { type: "model_recovery", taskId: "task", step: 1, attempt: 1,
    recovery: { ...recovery, delayMs: 100 } } };
  expect(summarizeFailures([legacy]).recovery.scheduledWaitMs).toBe(500);
  for (const events of [[canonical, legacy], [legacy, canonical]]) {
    const summary = summarizeFailures(events);
    expect(summary.recovery.scheduledWaitMs).toBe(100);
    expect(summary.recovery.retries.transport).toBe(1);
    expect(summary.model.recoveredRequests).toBe(1);
  }
});

it("keeps raw host implementation errors out of user-facing failures", () => {
  const message = describeTaskFailure("SNAPSHOT_EXPIRED image id private-123 at internal.ts:10", summarizeExecutions([]), "tool", false);
  expect(message).toContain("处理过程中遇到了问题");
  expect(message).not.toMatch(/private-123|SNAPSHOT_EXPIRED|internal.ts/);
});
