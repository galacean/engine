import { classifyFailure, type FailureCategory } from "./agent-failure";
import type { AgentModelAttempt } from "./agent-types";
import type { AgentTraceEventRecord } from "./agent-trace";
import {
  recoveryRecordKey,
  summarizeRecoveries,
  type ModelRecoveryEvent,
  type ModelRecoveryRecord
} from "./model-recovery";

/** Derived from evidence; retries, calls, and task outcome are deliberately separate counters. */
export function summarizeFailures(records: readonly AgentTraceEventRecord[], status?: string) {
  const requests = new Map<string, AgentModelAttempt>();
  const recoveries = new Map<string, ModelRecoveryRecord>();
  const tools = new Map<string, { code?: string; message?: string }>();
  const scripts = new Map<string, { code?: string; message?: string }>();
  let taskStatus: string | undefined = status;
  let terminalFailure: unknown;
  for (const { event: raw } of records) {
    // Trace storage has already serialized events; older exports may omit newer fields.
    const event = raw as Record<string, any>;
    if (!event || typeof event !== "object") continue;
    if (event.type === "model_finished" || event.type === "model_failed") {
      const step = event.type === "model_finished" ? (event.step.modelStep ?? event.step.step) : event.step;
      const attempts: AgentModelAttempt[] = event.type === "model_finished" ? event.step.attempts : event.attempts;
      for (const attempt of attempts ?? []) {
        const id = `${event.taskId}:${step}:${attempt.attempt}`;
        requests.set(id, attempt);
        // Read compatibility for traces exported before Session-owned recovery events.
        // New attempts never carry recovery arrays; explicit events take precedence.
        const legacy = attempt as AgentModelAttempt & { recovery?: ModelRecoveryEvent[] };
        for (const recovery of legacy.recovery ?? []) {
          const record = { taskId: event.taskId, step, attempt: attempt.attempt, recovery };
          const key = recoveryRecordKey(record);
          if (!recoveries.has(key)) recoveries.set(key, record);
        }
      }
    }
    if (event.type === "model_recovery")
      recoveries.set(recoveryRecordKey(event as ModelRecoveryRecord), event as ModelRecoveryRecord);
    if (event.type === "tool_finished" && event.result?.ok === false)
      tools.set(`${event.taskId}:${event.step}:${event.call}:${event.tool}`, event.result.error);
    if (event.type === "script_finished" && event.result?.ok === false)
      scripts.set(`${event.taskId}:${event.step}`, event.result.error);
    if (event.type === "task_completed") taskStatus = "completed";
    if (event.type === "task_failed") {
      taskStatus = event.failure.status;
      terminalFailure = {
        category: event.failure.category ?? classifyFailure(event.error),
        message: event.failure.message,
        executionSummary: event.failure.executionSummary
      };
    }
  }
  const byCategory: Partial<Record<FailureCategory, number>> = {};
  const increment = (category: FailureCategory) => {
    if (category !== "cancelled") byCategory[category] = (byCategory[category] ?? 0) + 1;
  };
  let generationAttempts = 0,
    requestsWithoutGenerationDetails = 0,
    failedRequests = 0,
    recoveredRequests = 0,
    cancelledRequests = 0;
  let durationMs = 0;
  const recoveredRequestIds = new Set(
    [...recoveries.values()]
      .filter((record) => record.recovery.phase === "retry_wait")
      .map((record) => `${record.taskId}:${record.step}:${record.attempt}`)
  );
  for (const [id, attempt] of requests) {
    durationMs += attempt.durationMilliseconds ?? 0;
    const category =
      attempt.category ??
      classifyFailure({
        code: attempt.errorCode,
        message: attempt.error ?? undefined,
        finishReason: attempt.finishReason,
        details: attempt.errorDetails
      });
    if (category === "cancelled") cancelledRequests++;
    else if (attempt.error) failedRequests++;
    else if (attempt.modelAttempts?.some((a) => a.error) || recoveredRequestIds.has(id)) recoveredRequests++;
    if (attempt.modelAttempts) {
      generationAttempts += attempt.modelAttempts.length;
      const failures = attempt.modelAttempts.filter((a) => a.error);
      for (const failure of failures)
        increment(classifyFailure({ ...failure.error, finishReason: failure.finishReason }));
      if (attempt.error && !failures.length)
        increment(
          attempt.category ??
            classifyFailure({
              code: attempt.errorCode,
              message: attempt.error ?? undefined,
              finishReason: attempt.finishReason,
              details: attempt.errorDetails
            })
        );
    } else {
      requestsWithoutGenerationDetails++;
      if (attempt.error)
        increment(
          attempt.category ??
            classifyFailure({
              code: attempt.errorCode,
              message: attempt.error ?? undefined,
              finishReason: attempt.finishReason,
              details: attempt.errorDetails
            })
        );
    }
  }
  return {
    taskStatus,
    terminalFailure,
    model: {
      requests: requests.size,
      generationAttempts,
      requestsWithoutGenerationDetails,
      failedRequests,
      cancelledRequests,
      recoveredRequests,
      durationMs,
      failuresByCategory: byCategory
    },
    recovery: summarizeRecoveries([...recoveries.values()]),
    tools: {
      failedCalls: [...tools.values()].filter((e) => classifyFailure(e) !== "cancelled").length,
      cancelledCalls: [...tools.values()].filter((e) => classifyFailure(e) === "cancelled").length,
      failures: [...tools.entries()].map(([id, error]) => ({ id, category: classifyFailure(error), ...error }))
    },
    // A script may wrap a failed tool. Do not add these two counters as independent incidents.
    scripts: {
      failedExecutions: [...scripts.values()].filter((e) => classifyFailure(e) !== "cancelled").length,
      cancelledExecutions: [...scripts.values()].filter((e) => classifyFailure(e) === "cancelled").length,
      failures: [...scripts.entries()].map(([id, error]) => ({ id, category: classifyFailure(error), ...error }))
    }
  };
}
