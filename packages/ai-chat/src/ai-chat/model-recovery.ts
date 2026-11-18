export const MODEL_ROUND_TIMEOUT_MS = 120_000;
import type { FailureCategory } from "./agent-failure";

export type ModelRecoveryEvent = {
  sequence: number;
  phase: "requesting" | "retry_wait";
  layer: "admission" | "transport" | "output" | "protocol";
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  remainingMs: number;
  delayMs: number;
  category?: FailureCategory;
};

export function normalizeRecoveryEvent(value: unknown): ModelRecoveryEvent | undefined {
  if (!value || typeof value !== "object") return;
  const event = value as ModelRecoveryEvent;
  if (
    !["requesting", "retry_wait"].includes(event.phase) ||
    !["admission", "transport", "output", "protocol"].includes(event.layer)
  )
    return;
  for (const key of ["sequence", "attempt", "maxAttempts", "elapsedMs", "remainingMs", "delayMs"] as const)
    if (!Number.isFinite(event[key]) || event[key] < 0) return;
  if (
    !Number.isInteger(event.sequence) ||
    event.sequence < 1 ||
    !Number.isInteger(event.attempt) ||
    event.attempt < 1 ||
    !Number.isInteger(event.maxAttempts) ||
    event.attempt > event.maxAttempts
  )
    return;
  const categories = [
    "rate_limit",
    "quota",
    "server",
    "connection",
    "timeout",
    "request",
    "context",
    "output_limit",
    "content_filter",
    "protocol",
    "tool",
    "publication",
    "budget",
    "cancelled",
    "unknown"
  ];
  if (event.category !== undefined && !categories.includes(event.category)) return;
  return {
    sequence: event.sequence,
    phase: event.phase,
    layer: event.layer,
    attempt: event.attempt,
    maxAttempts: event.maxAttempts,
    elapsedMs: event.elapsedMs,
    remainingMs: event.remainingMs,
    delayMs: event.delayMs,
    ...(event.category ? { category: event.category } : {})
  };
}

/** Request identity is assigned by the Session's agent loop, never by model output. */
export type ModelRecoveryRecord = {
  taskId: string;
  step: number;
  attempt: number;
  recovery: ModelRecoveryEvent;
};

export function recoveryRecordKey(record: ModelRecoveryRecord): string {
  return JSON.stringify([record.taskId, record.step, record.attempt, record.recovery.layer, record.recovery.sequence]);
}

export function summarizeRecoveries(records: readonly ModelRecoveryRecord[]) {
  const events = new Map(records.map((record) => [recoveryRecordKey(record), record.recovery]));
  const retries = { admission: 0, transport: 0, output: 0, protocol: 0 };
  let scheduledWaitMs = 0;
  const transientFailuresByCategory: Partial<Record<FailureCategory, number>> = {};
  for (const event of events.values()) {
    if (event.phase !== "retry_wait") continue;
    retries[event.layer]++;
    scheduledWaitMs += event.delayMs;
    if (event.layer === "admission" || event.layer === "transport") {
      const category = event.category ?? "unknown";
      transientFailuresByCategory[category] = (transientFailuresByCategory[category] ?? 0) + 1;
    }
  }
  return { retries, scheduledWaitMs, transientFailuresByCategory };
}

export function recoveryStatus(event: ModelRecoveryEvent): string {
  if (event.phase === "requesting") return "正在分析请求";
  const reason =
    event.category === "rate_limit"
      ? "服务繁忙"
      : event.category === "output_limit"
        ? "本轮输出达到上限"
        : event.layer === "protocol"
          ? "正在纠正模型返回格式"
          : "模型请求遇到临时问题";
  const wait = event.delayMs > 0 ? `，等待约 ${Math.ceil(event.delayMs / 1000)} 秒` : "";
  return `${reason}${wait}，准备第 ${event.attempt}/${event.maxAttempts} 次尝试`;
}
