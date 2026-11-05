import type { AgentExecutionReceipt } from "./agent-types";

/** Classification is diagnostic only; it never authorizes a retry or a write. */
export type FailureCategory =
  | "rate_limit"
  | "quota"
  | "server"
  | "connection"
  | "timeout"
  | "request"
  | "context"
  | "output_limit"
  | "content_filter"
  | "protocol"
  | "tool"
  | "publication"
  | "budget"
  | "cancelled"
  | "unknown";

export function classifyFailure(value: {
  code?: string;
  message?: string;
  name?: string;
  finishReason?: string;
  details?: Record<string, unknown>;
  category?: FailureCategory;
}): FailureCategory {
  if (value.category) return value.category;
  const retry = value.details?.model_retry as { classification?: string; status_code?: number } | undefined;
  const transport: Record<string, FailureCategory> = {
    hard_rate_limit: "quota",
    transient_rate_limit: "rate_limit",
    local_rate_limit: "rate_limit",
    connection_error: "connection",
    server_error: "server",
    timeout: "timeout"
  };
  if (retry?.classification && transport[retry.classification]) return transport[retry.classification];
  if (value.finishReason === "length") return "output_limit";
  if (value.finishReason === "content_filter") return "content_filter";
  if (retry?.status_code === 429) return "rate_limit";
  if (retry?.status_code && retry.status_code >= 500) return "server";
  if (retry?.status_code && retry.status_code >= 400) return "request";
  const provider = value.details?.agent_error as { category?: string } | undefined;
  if (provider?.category === "connection" || provider?.category === "timeout") return provider.category;
  if (provider?.category === "environment") return "request";
  const code = `${value.code ?? ""} ${value.name ?? ""}`;
  if (/Cancel|Abort|CANCELLED|INTERRUPTED/.test(code)) return "cancelled";
  if (/TIMEOUT|Timeout/.test(code)) return "timeout";
  if (/INPUT_TOO_LONG|CONTEXT|COMPACTION/.test(code)) return "context";
  if (/OUTPUT_LIMIT/.test(code)) return "output_limit";
  if (/RATE_LIMIT|TPM_LIMIT|RateLimit/.test(code)) return "rate_limit";
  if (/REQUEST_PARAM|AUTH|PERMISSION|CONFIG/.test(code)) return "request";
  if (/PROTOCOL/.test(code)) return "protocol";
  if (/PUBLICATION|OUTCOME_UNKNOWN/.test(code)) return "publication";
  if (/LIMIT|Limit|NoProgress/.test(code)) return "budget";
  if (/FILE_|SCRIPT_|TOOL_|IMAGE_|PICK_|SNAPSHOT_|VIEW_OBSERVATION_|INVALID_ARGUMENTS|UNKNOWN_TOOL/.test(code))
    return "tool";
  // Compatibility with older hosts that only preserve an error message.
  const message = value.message ?? "";
  if (/deadline|timed? ?out|超时/i.test(message)) return "timeout";
  if (/contextCompaction|context.length|input.too.long/i.test(message)) return "context";
  if (/connection|disconnect|network|fetch failed/i.test(message)) return "connection";
  return "unknown";
}

export type ExecutionSummary = {
  committed: string[];
  notExecuted: string[];
  rolledBack: string[];
  uncertain: string[];
  completed: string[];
  committedCommands: string[];
};

/** Execution IDs are retained so diagnostics can link back to exact host receipts. */
export function summarizeExecutions(receipts: readonly AgentExecutionReceipt[]): ExecutionSummary {
  const summary: ExecutionSummary = {
    committed: [],
    notExecuted: [],
    rolledBack: [],
    uncertain: [],
    completed: [],
    committedCommands: []
  };
  for (const receipt of new Map(receipts.map((r) => [r.executionId, r])).values()) {
    if (receipt.status === "committed") summary.committed.push(receipt.executionId);
    else if (receipt.status === "rejected") summary.notExecuted.push(receipt.executionId);
    else if (receipt.status === "aborted") summary.rolledBack.push(receipt.executionId);
    else if (receipt.status === "completed") summary.completed.push(receipt.executionId);
    for (const command of receipt.commands ?? [])
      if (command.status === "settled" && command.ok)
        summary.committedCommands.push(command.commandId ?? `${receipt.executionId}:${command.call}`);
    if (
      receipt.status === "publication_failed" ||
      (receipt.status === "interrupted" && !receipt.commands?.length) ||
      receipt.commands?.some((c) => c.status === "unknown")
    )
      summary.uncertain.push(receipt.executionId);
  }
  return summary;
}

export function describeTaskFailure(
  reason: string,
  summary: ExecutionSummary,
  category: FailureCategory,
  modelFailed: boolean
): string {
  // Known model terminals have a concise cause; execution facts come only from the host.
  const cause =
    category === "output_limit"
      ? "本次回复过长，处理已停止。"
      : category === "content_filter"
        ? "本次请求无法继续处理。"
        : category === "rate_limit" || category === "quota"
          ? "服务暂时繁忙，请稍后重试。"
          : category === "connection" || category === "server"
            ? "暂时无法连接处理服务，请稍后重试。"
            : category === "timeout"
              ? "等待处理结果超时，请稍后重试。"
              : category === "budget"
                ? "本次处理已达到资源上限。"
                : "处理过程中遇到了问题。";
  const parts = [category === "cancelled" ? "任务已停止。" : `任务未完成：${cause}`];
  const saved = summary.committed.length + summary.committedCommands.length;
  if (saved) parts.push("已完成的修改已保留。");
  if (summary.uncertain.length) parts.push("部分操作的结果尚未确认，需要检查当前状态。");
  else if (!saved) parts.push("本次任务没有保存新的修改。");
  if (summary.rolledBack.length) parts.push("未提交的修改已撤销。");
  // Rejected attempts and completed reads remain in the structured summary/trace.
  // They are diagnostic events, not a count of unfinished user tasks.
  if (modelFailed && category !== "cancelled") parts.push("本次模型请求未返回可执行结果。");
  return parts.join("\n");
}
