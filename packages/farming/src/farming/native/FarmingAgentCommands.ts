import { AgentToolExecutionError, type AgentTool } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { FarmingAPI, isFarmingReadOperation, type FarmingRequest } from "./FarmingAPI";

export const describeFarmingCommand: NonNullable<AgentTool["describeCommand"]> = (input, result) => {
  const request = input as unknown as FarmingRequest;
  if (request && isFarmingReadOperation(request.operation)) return null;
  const scopeId = request?.input && "farmId" in request.input ? request.input.farmId : undefined;
  const commandId = request?.options?.commandId;
  const outcome = result?.ok
    ? (result.value as unknown as {
        value?: {
          receipt?: {
            commandId?: string;
            revision?: number;
            replayed?: boolean;
          };
        };
      })
    : undefined;
  const committed = outcome?.value?.receipt;
  const details = result && !result.ok ? result.error.details : undefined;
  const failedId =
    details && typeof details === "object" && !Array.isArray(details)
      ? (details as { commandId?: unknown }).commandId
      : undefined;
  const failed = details as { revision?: number; replayed?: boolean } | undefined;
  return {
    ...(typeof scopeId === "string" ? { scopeId } : {}),
    ...(typeof commandId === "string" ? { commandId } : {}),
    ...(typeof failedId === "string" ? { commandId: failedId } : {}),
    ...(typeof failed?.revision === "number" ? { revision: failed.revision, replayed: failed.replayed } : {}),
    ...committed
  };
};

export async function executeFarmingRequest(api: FarmingAPI, input: FarmingRequest, signal: AbortSignal) {
  const result = await api.execute(input as FarmingRequest, signal);
  if (!result.ok)
    throw new AgentToolExecutionError({
      code: result.error.code,
      message: result.error.message,
      executed: result.error.executed,
      // Domain failures carry a complete command result, even when the
      // clock advanced before an unavailable action was rejected.
      outcomeKnown: result.error.details !== undefined,
      retryable: result.error.retryable,
      details: { context: result.context ?? null, ...result.error.details }
    });
  return result;
}
