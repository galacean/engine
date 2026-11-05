import type { AgentMessage } from "./agent-types";
import { withoutReasoningContent } from "./agent-message-state";

export type ContextCompactionBudget = { triggerTokens?: number; targetTokens?: number };
export type ContextCompactionRequest = ContextCompactionBudget & { version: 1; protectedPrefixLength: 2 };
export type ContextCompactionResult = {
  version: 1;
  status: "not_needed" | "compacted" | "failed";
  strategy: "summary";
  beforeTokens: number;
  afterTokens: number;
  durationMs: number;
  reason?: string;
  replacement?: { prefixLength: 2; cutIndex: number; summary: string };
};

export class ContextCompactionError extends Error {
  constructor(detail: string) {
    super(`Invalid contextCompaction: ${detail}`);
    this.name = "ContextCompactionError";
  }
}

export function createContextCompactionRequest(budget: ContextCompactionBudget = {}): ContextCompactionRequest {
  const value = record(budget, ["triggerTokens", "targetTokens"]);
  for (const key of ["triggerTokens", "targetTokens"] as const) {
    if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || (value[key] as number) <= 0)) {
      throw new ContextCompactionError(`${key} must be a positive integer`);
    }
  }
  if (
    budget.triggerTokens !== undefined &&
    budget.targetTokens !== undefined &&
    budget.targetTokens >= budget.triggerTokens
  ) {
    throw new ContextCompactionError("targetTokens must be below triggerTokens");
  }
  return {
    version: 1,
    protectedPrefixLength: 2,
    ...(budget.triggerTokens !== undefined ? { triggerTokens: budget.triggerTokens } : {}),
    ...(budget.targetTokens !== undefined ? { targetTokens: budget.targetTokens } : {})
  };
}

/** Absence supports older servers; a present, malformed contract is fatal. */
export function parseContextCompaction(value: unknown): ContextCompactionResult | undefined {
  if (value === undefined) return undefined;
  const item = record(value, [
    "version",
    "status",
    "strategy",
    "beforeTokens",
    "afterTokens",
    "durationMs",
    "reason",
    "replacement"
  ]);
  if (
    item.version !== 1 ||
    item.strategy !== "summary" ||
    !["not_needed", "compacted", "failed"].includes(item.status as string)
  ) {
    throw new ContextCompactionError("unsupported version, strategy or status");
  }
  for (const key of ["beforeTokens", "afterTokens"] as const) {
    if (!Number.isSafeInteger(item[key]) || (item[key] as number) < 0)
      throw new ContextCompactionError(`invalid ${key}`);
  }
  if (typeof item.durationMs !== "number" || !Number.isFinite(item.durationMs) || item.durationMs < 0) {
    throw new ContextCompactionError("invalid durationMs");
  }
  if (item.reason !== undefined && typeof item.reason !== "string") throw new ContextCompactionError("invalid reason");
  if (item.status === "compacted") {
    const patch = record(item.replacement, ["prefixLength", "cutIndex", "summary"]);
    if (patch.prefixLength !== 2 || !Number.isSafeInteger(patch.cutIndex) || (patch.cutIndex as number) <= 0) {
      throw new ContextCompactionError("invalid replacement range");
    }
    if (typeof patch.summary !== "string" || !patch.summary.trim()) throw new ContextCompactionError("empty summary");
    if ((item.afterTokens as number) >= (item.beforeTokens as number))
      throw new ContextCompactionError("tokens did not decrease");
  } else if (item.replacement !== undefined || item.afterTokens !== item.beforeTokens) {
    throw new ContextCompactionError("unchanged status must retain context");
  }
  return structuredClone(item) as ContextCompactionResult;
}

type ContextRequest = {
  messages: AgentMessage[];
  activeLength: number;
  revision: number;
  consumed: boolean;
};

/** Canonical evidence is append-only; only the active request history is replaced. */
export class AgentContextTranscript {
  readonly #canonical: AgentMessage[] = [];
  #active: AgentMessage[] = [];
  #revision = 0;
  readonly #requests = new WeakSet<ContextRequest>();

  get canonical(): AgentMessage[] {
    return structuredClone(this.#canonical);
  }
  get active(): AgentMessage[] {
    return structuredClone(this.#active);
  }

  /** Cancellation releases pixels immediately while retaining textual recovery evidence. */
  releaseImages(): void {
    this.#active = this.#active.map((message) =>
      message.role === "user" && message.image
        ? { role: "user", content: `${message.content}\n[Image expired. Capture a new view if needed.]` }
        : message
    );
    this.#revision++;
  }

  /** Offload only image payloads; Tool pairs and original evidence stay intact. */
  offloadImages(): number {
    let remaining = 4;
    let offloaded = 0;
    for (let i = this.#active.length - 1; i >= 0; i--) {
      const message = this.#active[i];
      if (message.role !== "user" || !message.image) continue;
      if (remaining-- > 0) continue;
      this.#active[i] = {
        role: "user",
        content: `${message.content}\n[Image offloaded from this request. Use read_image with the imageId to view the original screenshot.]`
      };
      offloaded++;
    }
    if (offloaded) this.#revision++;
    return offloaded;
  }

  clear(): void {
    this.#canonical.length = 0;
    this.#active.length = 0;
    this.#revision++;
  }

  push(...messages: AgentMessage[]): void {
    // Image IDs and metadata remain in content; the task image store owns original pixels.
    this.#canonical.push(
      ...structuredClone(
        messages.map((message) =>
          message.role === "user" && message.image
            ? { role: message.role, content: message.content }
            : withoutReasoningContent(message)
        )
      )
    );
    this.#active.push(...structuredClone(messages));
    this.#revision++;
  }

  captureRequest(messages: AgentMessage[]): ContextRequest {
    if (messages[0]?.role !== "system" || messages[1]?.role !== "user")
      throw new ContextCompactionError("invalid protected prefix");
    let task: unknown;
    try {
      task = JSON.parse(messages[1].content);
    } catch {
      throw new ContextCompactionError("invalid task prefix");
    }
    if (!task || typeof task !== "object" || (task as { contextKind?: unknown }).contextKind !== "agent_task") {
      throw new ContextCompactionError("missing agent_task prefix");
    }
    if (JSON.stringify(messages.slice(2, 2 + this.#active.length)) !== JSON.stringify(this.#active)) {
      throw new ContextCompactionError("request does not match active transcript");
    }
    const request = {
      messages: structuredClone(messages),
      activeLength: this.#active.length,
      revision: this.#revision,
      consumed: false
    };
    this.#requests.add(request);
    return request;
  }

  applyResponse(
    request: ContextRequest,
    sentMessages: readonly AgentMessage[],
    value: unknown
  ): ContextCompactionResult | undefined {
    if (!this.#requests.has(request) || request.consumed || request.revision !== this.#revision) {
      throw new ContextCompactionError("duplicate or stale response");
    }
    request.consumed = true;
    if (JSON.stringify(request.messages) !== JSON.stringify(sentMessages))
      throw new ContextCompactionError("sent prefix or transcript changed");
    const result = parseContextCompaction(value);
    if (!result?.replacement) return result;
    const { prefixLength, cutIndex, summary } = result.replacement;
    const tail = request.messages.slice(prefixLength);
    if (cutIndex > tail.length) throw new ContextCompactionError("cut exceeds sent transcript");
    if (
      tail
        .slice(0, cutIndex)
        .some((message) => message.role === "system" || (message.role === "user" && message.image !== undefined))
    ) {
      throw new ContextCompactionError("replacement removes a protected system message or image");
    }
    validateToolGroups(tail, cutIndex);
    // A retry correction is request-local. Keep the summary, never replay an old correction.
    this.#active = [
      { role: "user", content: summary },
      ...tail.slice(cutIndex, Math.max(cutIndex, request.activeLength))
    ];
    this.#revision++;
    return result;
  }
}

function validateToolGroups(messages: readonly AgentMessage[], cutIndex: number): void {
  const pending = new Set<string>();
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === "tool") {
      if (!pending.delete(message.toolCallId)) throw new ContextCompactionError("orphan Tool result");
    } else {
      if (pending.size) throw new ContextCompactionError("incomplete Tool group");
      if (message.role === "assistant") {
        for (const call of message.toolCalls ?? []) {
          if (pending.has(call.id)) throw new ContextCompactionError("duplicate Tool call within group");
          pending.add(call.id);
        }
      }
    }
    if (index + 1 === cutIndex && pending.size) throw new ContextCompactionError("replacement splits Tool group");
  }
  if (pending.size) throw new ContextCompactionError("incomplete Tool group");
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new ContextCompactionError("unexpected fields or invalid object");
  }
  return value as Record<string, unknown>;
}
