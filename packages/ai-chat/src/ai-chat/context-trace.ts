import { summarizeFailures } from "./agent-failure-statistics";
import { classifyFailure } from "./agent-failure";
import type { AgentModelAttempt } from "./agent-types";
import type { AgentTraceEventRecord } from "./agent-trace";

/** Fold only model events: terminal task snapshots contain duplicate attempts. */
export function formatContextTrace(events: readonly AgentTraceEventRecord[]): string {
  const attempts = new Map<
    string,
    Pick<
      AgentModelAttempt,
      "category" | "telemetry" | "error" | "errorCode" | "finishReason" | "modelAttempts" | "contextCompaction"
    >
  >();
  for (const { event } of events) {
    if (!event || typeof event !== "object") continue;
    const item = event as {
      type: string;
      step?: number | { step: number; attempts: AgentModelAttempt[] };
      attempt?: number;
      attempts?: AgentModelAttempt[];
    };
    if (item.type === "model_request" && typeof item.step === "number" && item.attempt !== undefined) {
      attempts.set(`${item.step}.${item.attempt}`, { error: null });
    } else if (item.type === "model_finished" && typeof item.step === "object") {
      for (const attempt of item.step.attempts) attempts.set(`${item.step.step}.${attempt.attempt}`, attempt);
    } else if (item.type === "model_failed" && typeof item.step === "number") {
      for (const attempt of item.attempts ?? []) attempts.set(`${item.step}.${attempt.attempt}`, attempt);
    }
  }
  const entries = [...attempts];
  if (!entries.length) return "";
  const summary = summarizeFailures(events);
  const rows = [
    `失败统计：模型请求 ${summary.model.requests} 次，其中失败 ${summary.model.failedRequests} 次、取消 ${summary.model.cancelledRequests} 次、内部重试后恢复 ${summary.model.recoveredRequests} 次；工具错误 ${summary.tools.failedCalls} 次；脚本错误 ${summary.scripts.failedExecutions} 次（可能包含同一次工具错误，不相加）。`,
    `恢复统计：限流等待 ${summary.recovery.retries.admission} 次、传输重试 ${summary.recovery.retries.transport} 次、超限重试 ${summary.recovery.retries.output} 次、协议纠正 ${summary.recovery.retries.protocol} 次；计划等待 ${summary.recovery.scheduledWaitMs} ms。`,
    "上下文用量（token；服务端估算不是精确 tokenizer）",
    "步骤.尝试 | ASAP 估算 | 实际输入 | 输出 | 缓存输入 | 估算误差"
  ];
  for (const [id, attempt] of entries) {
    const outcome =
      (attempt.category ?? classifyFailure({ code: attempt.errorCode, message: attempt.error ?? undefined })) ===
      "cancelled"
        ? "取消"
        : "失败";
    const usage = attempt.telemetry?.usage;
    const server = attempt.telemetry?.inputEstimate;
    const delta = usage?.inputTokens !== undefined && server ? server.inputTokens - usage.inputTokens : undefined;
    rows.push(
      `${id}${attempt.error ? ` ${outcome}` : ""} | ${server ? `~${server.inputTokens}` : "未提供"} | ${count(usage?.inputTokens)} | ${count(usage?.outputTokens)} | ${count(usage?.cachedInputTokens)} | ${delta === undefined ? "未提供" : `${delta >= 0 ? "+" : ""}${delta}`}`
    );
    if (attempt.error)
      rows.push(
        `${id} ${outcome}原因：${attempt.errorCode ?? "未知代码"}；${attempt.finishReason ?? "未提供终止原因"}；${attempt.error}`
      );
    for (const serverAttempt of attempt.modelAttempts ?? []) {
      const observed = serverAttempt.telemetry;
      rows.push(
        `${id}/ASAP-${serverAttempt.attempt}：${serverAttempt.finishReason ?? "未提供终止原因"}${serverAttempt.error ? `；${serverAttempt.error.code}：${serverAttempt.error.message}` : ""}；估算 ${observed?.inputEstimate ? `~${observed.inputEstimate.inputTokens}` : "未提供"}；实际输入 ${count(observed?.usage?.inputTokens)}；输出 ${count(observed?.usage?.outputTokens)}；缓存输入 ${count(observed?.usage?.cachedInputTokens)}`
      );
    }
    const compaction = attempt.contextCompaction;
    rows.push(
      compaction
        ? `${id} 压缩：${compaction.status}；${compaction.beforeTokens} → ${compaction.afterTokens} token；${compaction.durationMs} ms${compaction.reason ? `；${compaction.reason}` : ""}`
        : `${id} 压缩：未提供`
    );
  }
  const latest = entries[entries.length - 1][1];
  const telemetry = latest.telemetry;
  const estimate = telemetry?.inputEstimate;
  const actual = telemetry?.usage?.inputTokens;
  const limit = telemetry?.inputLimitTokens;
  rows.push(
    `模型路由：${telemetry?.modelName ?? "未提供"}；输入硬上限：${count(limit)}；输出上限：${count(telemetry?.maxOutputTokens)}`
  );
  if (limit !== undefined) {
    const estimatedOccupancy = estimate ? `${((100 * estimate.inputTokens) / limit).toFixed(1)}%` : "未提供";
    const actualOccupancy = actual !== undefined ? `${((100 * actual) / limit).toFixed(1)}%` : "未提供";
    rows.push(`输入占用：ASAP 估算 ${estimatedOccupancy}；实际 ${actualOccupancy}（缓存仍占输入窗口）`);
  }
  if (estimate) {
    rows.push(`估算方法：${estimate.method}；请求模型：${estimate.modelName}；消息 ${estimate.messageCount} 条。`);
    rows.push(
      `文本与协议 ~${estimate.requestTokens}；图片预算 ~${estimate.imageTokens}（${estimate.imageCount} 张，每张 ${estimate.tokensPerImage}）。`
    );
  }
  rows.push("仅展示服务端计数；未返回时不在前端补算。图片预算与模板开销是估算，不是安全上界。");
  rows.push("实际值为服务端回传的本次模型响应用量；未提供不代表零，不汇总为完整计费账单。");
  return rows.join("\n");
}

function count(value: number | undefined): string {
  return value === undefined ? "未提供" : String(value);
}
