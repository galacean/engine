import type { AgentMessage } from "./agent-types";

/** Keep native continuation state in active requests, not UI or diagnostic copies. */
export function withoutReasoningContent(message: AgentMessage): AgentMessage {
  if (message.role !== "assistant") return message;
  const { reasoningContent: _state, ...visible } = message;
  return visible;
}
