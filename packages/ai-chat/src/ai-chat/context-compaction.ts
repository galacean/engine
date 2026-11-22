import type { AgentMessage } from "./agent-types";
import { withoutReasoningContent } from "./agent-message-state";
import { readSystemInjection } from "./agent-protocol";

export type ContextCompactionBudget = { triggerTokens?: number; targetTokens?: number };
export type ContextCompactionRequest = ContextCompactionBudget & { version: 2; protectedPrefixLength: number };
export type CompactionCommittedAnchor = {
  status: "committed" | "completed" | "interrupted";
  transactionId?: string;
  revision?: number;
  commands?: readonly string[];
};
export type CompactionAnchors = {
  readPaths?: readonly string[];
  committed?: readonly CompactionCommittedAnchor[];
};
export type ContextCompactionResult = {
  version: 2;
  status: "not_needed" | "compacted" | "failed";
  strategy: "summary";
  beforeTokens: number;
  afterTokens: number;
  durationMs: number;
  reason?: string;
  replacement?: { prefixLength: number; cutIndex: number; summary: string };
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
    version: 2,
    protectedPrefixLength: 2,
    ...(budget.triggerTokens !== undefined ? { triggerTokens: budget.triggerTokens } : {}),
    ...(budget.targetTokens !== undefined ? { targetTokens: budget.targetTokens } : {})
  };
}

/** A present, malformed contract is fatal. */
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
    item.version !== 2 ||
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
    if (
      !Number.isSafeInteger(patch.prefixLength) ||
      (patch.prefixLength as number) < 2 ||
      !Number.isSafeInteger(patch.cutIndex) ||
      (patch.cutIndex as number) <= 0
    ) {
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
  prefixLength: number;
  revision: number;
  consumed: boolean;
};

const MAX_COMPACTED_READ_PATHS = 24;
const MAX_COMPACTED_COMMITTED = 12;
const FULL_FILE_READ_HEADER_RE = /^<path>([^<\n]+)<\/path>\n<type>file<\/type>\n<content>\n(?:1: |\n<\/content>)/;
const FILE_MUTATION_RECEIPT_RE = /^(?:Created|Updated|Deleted) file: [^\n]+\n(\{[\s\S]*\})$/;
const COMPACTION_UNREDUCIBLE_REASON_RE =
  /did not reduce the estimated token count|no replaceable messages are available/i;

export function isCompactionUnreducibleFailure(result: ContextCompactionResult | undefined): boolean {
  return (
    result?.status === "failed" &&
    typeof result.reason === "string" &&
    COMPACTION_UNREDUCIBLE_REASON_RE.test(result.reason)
  );
}

/** Canonical evidence is append-only; only the active request history is replaced. */
export class AgentContextTranscript {
  readonly #canonical: AgentMessage[] = [];
  #active: AgentMessage[] = [];
  #compactedReadPaths = new Set<string>();
  #compactedCommitted = new Map<string, CompactionCommittedAnchor>();
  #revision = 0;
  readonly #requests = new WeakSet<ContextRequest>();

  get canonical(): AgentMessage[] {
    return structuredClone(this.#canonical);
  }
  get active(): AgentMessage[] {
    return structuredClone(this.#active);
  }
  get activeLength(): number {
    return this.#active.length;
  }
  get compactedAnchors(): CompactionAnchors | undefined {
    if (!this.#compactedReadPaths.size && !this.#compactedCommitted.size) return undefined;
    return {
      ...(this.#compactedReadPaths.size ? { readPaths: [...this.#compactedReadPaths] } : {}),
      ...(this.#compactedCommitted.size ? { committed: structuredClone([...this.#compactedCommitted.values()]) } : {})
    };
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
        content: `${message.content}\n[Image offloaded from this request. Use read with file_path set to imagePath to view the original screenshot.]`
      };
      offloaded++;
    }
    if (offloaded) this.#revision++;
    return offloaded;
  }

  /**
   * Offload image payloads that precede the latest historical assistant turn in
   * `#active` when server-side compaction cannot reduce the context because an
   * earlier image pins the remaining tool history. Because `#requestModelTurn`
   * runs this before the current round's assistant message is appended, a newly
   * submitted photo or snapshot stays visible for at least one follow-up round
   * (preserving visual continuity across multi-step `pick`/`read` -> `execute`
   * chains), and `imagePath` references remain usable with `read`/`pick`.
   */
  offloadSeenImagesForCompaction(): number {
    let latestAssistantIndex = -1;
    for (let i = this.#active.length - 1; i >= 0; i--) {
      if (this.#active[i]?.role === "assistant") {
        latestAssistantIndex = i;
        break;
      }
    }
    if (latestAssistantIndex <= 0) return 0;
    let offloaded = 0;
    for (let i = 0; i < latestAssistantIndex; i++) {
      const message = this.#active[i];
      if (message.role !== "user" || !message.image) continue;
      this.#active[i] = {
        role: "user",
        content: `${message.content}\n[Image offloaded from this request. Use read with file_path set to imagePath to view the original screenshot.]`
      };
      offloaded++;
    }
    if (offloaded) this.#revision++;
    return offloaded;
  }

  clear(): void {
    this.#canonical.length = 0;
    this.#active.length = 0;
    this.#compactedReadPaths.clear();
    this.#compactedCommitted.clear();
    this.#revision++;
  }

  restoreActive(messages: readonly AgentMessage[]): void {
    this.#active = structuredClone(messages) as AgentMessage[];
    this.#revision++;
  }

  closeInterruptedToolCalls(errorMessage: string): AgentMessage[] {
    const pending = new Set<string>();
    for (const message of this.#active) {
      if (message.role === "assistant") for (const call of message.toolCalls ?? []) pending.add(call.id);
      if (message.role === "tool") pending.delete(message.toolCallId);
    }
    const closed: AgentMessage[] = [];
    for (const toolCallId of pending) {
      closed.push({
        role: "tool",
        toolCallId,
        content: JSON.stringify({
          ok: false,
          error: { code: "INTERRUPTED", message: errorMessage }
        })
      });
    }
    if (closed.length) this.push(...closed);
    return structuredClone(this.#active);
  }

  /** Strip completed-turn native reasoning state once so subsequent turns share an immutable prefix. */
  completeTurn(fallbackAssistantMessage?: string): void {
    if (!this.#active.length) return;
    let changed = false;
    this.#active = this.#active.map((message) => {
      if (message.role === "assistant" && message.reasoningContent !== undefined) {
        changed = true;
        return withoutReasoningContent(message);
      }
      return message;
    });
    if (fallbackAssistantMessage && this.#active.at(-1)?.role !== "assistant") {
      this.push({ role: "assistant", content: fallbackAssistantMessage });
      return;
    }
    if (changed) this.#revision++;
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
    if (messages[0]?.role !== "system") throw new ContextCompactionError("missing system rules");
    // Host snapshots are separate from append-only execution evidence. Determine
    // their boundary by kind, and bind every replacement to this request's boundary.
    const kinds = new Set([
      "host_environment",
      "skills",
      "agent_task",
      "task_context",
      "conversation_history",
      "world_state"
    ]);
    const seen = new Set<string>();
    let prefixLength = 1;
    for (const message of messages.slice(1)) {
      if (message.role !== "user" || message.image) break;
      const injection = readSystemInjection(message.content);
      let kind: unknown = injection?.type;
      if (kind === undefined) {
        try {
          kind = JSON.parse(message.content).contextKind;
        } catch {
          break;
        }
      }
      if (typeof kind !== "string" || !kinds.has(kind)) break;
      // When task turns live inside #active, stop right at the start of #active.
      if (kind === "task_context" && this.#active.length > 0 && message.content === this.#active[0]?.content) break;
      if (seen.has(kind)) throw new ContextCompactionError("duplicate context section");
      seen.add(kind);
      prefixLength++;
    }
    if (!seen.has("host_environment") && !seen.has("agent_task") && !seen.has("task_context")) {
      throw new ContextCompactionError("missing agent_task prefix");
    }
    if (
      JSON.stringify(messages.slice(prefixLength, prefixLength + this.#active.length)) !== JSON.stringify(this.#active)
    ) {
      throw new ContextCompactionError("request does not match active transcript");
    }
    const request = {
      messages: structuredClone(messages),
      activeLength: this.#active.length,
      prefixLength,
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
    if (prefixLength !== request.prefixLength) throw new ContextCompactionError("replacement changes protected prefix");
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
    this.#recordCompactedAnchors(tail.slice(0, cutIndex));
    // A retry correction is request-local. Keep the summary, never replay an old correction.
    this.#active = [
      { role: "user", content: summary },
      ...tail.slice(cutIndex, Math.max(cutIndex, request.activeLength))
    ];
    this.#revision++;
    return result;
  }

  #recordCompactedAnchors(dropped: readonly AgentMessage[]): void {
    const pushReadPath = (path: string) => {
      if (!path.startsWith("skills/") && !path.startsWith("declare/")) return;
      this.#compactedReadPaths.delete(path);
      this.#compactedReadPaths.add(path);
      while (this.#compactedReadPaths.size > MAX_COMPACTED_READ_PATHS) {
        const oldest = this.#compactedReadPaths.values().next().value;
        if (oldest === undefined) break;
        this.#compactedReadPaths.delete(oldest);
      }
    };
    for (const message of dropped) {
      if (message.role !== "tool" || typeof message.content !== "string") continue;
      if (!message.content.includes("(Continue with read offset=")) {
        const primary = message.content.match(FULL_FILE_READ_HEADER_RE);
        if (primary) pushReadPath(primary[1]);
      }
      for (const match of message.content.matchAll(/<dependency path="([^"\n]+)">/g)) {
        pushReadPath(match[1]);
      }
      let jsonPayload: string | undefined;
      let isNativeFileMutation = false;
      if (message.content.startsWith("{")) {
        jsonPayload = message.content;
      } else {
        const fileMutationMatch = message.content.match(FILE_MUTATION_RECEIPT_RE);
        if (fileMutationMatch) {
          jsonPayload = fileMutationMatch[1];
          isNativeFileMutation = true;
        }
      }
      if (!jsonPayload) continue;
      try {
        const parsed = JSON.parse(jsonPayload) as Record<string, unknown>;
        const receipt =
          parsed && typeof parsed === "object" && parsed.receipt && typeof parsed.receipt === "object"
            ? (parsed.receipt as Record<string, unknown>)
            : undefined;
        if (!receipt) continue;
        const status = receipt.status;
        if (status !== "committed" && status !== "completed" && status !== "interrupted") continue;
        if (status === "committed" && !isNativeFileMutation && parsed.ok !== true) continue;
        const commands = Array.isArray(receipt.commands)
          ? receipt.commands
              .filter(
                (entry): entry is Record<string, unknown> =>
                  Boolean(entry) &&
                  typeof entry === "object" &&
                  (((entry as Record<string, unknown>).status === "settled" &&
                    (entry as Record<string, unknown>).ok === true) ||
                    (entry as Record<string, unknown>).status === "unknown")
              )
              .map((entry) => {
                const name =
                  typeof entry.tool === "string" ? entry.tool : typeof entry.name === "string" ? entry.name : undefined;
                if (!name) return undefined;
                return entry.status === "unknown" ? `${name}:unknown` : name;
              })
              .filter((name): name is string => Boolean(name))
              .slice(0, 8)
          : [];
        if ((status === "completed" || status === "interrupted") && !commands.length) continue;
        const executionId = typeof receipt.executionId === "string" ? receipt.executionId : undefined;
        const transactionId = typeof receipt.transactionId === "string" ? receipt.transactionId : undefined;
        const revision = typeof receipt.revision === "number" ? receipt.revision : undefined;
        const key = executionId ?? `${status}:${transactionId ?? ""}:${revision ?? ""}:${commands.join(",")}`;
        if (this.#compactedCommitted.has(key)) continue;
        this.#compactedCommitted.set(key, {
          status,
          ...(transactionId ? { transactionId } : {}),
          ...(revision !== undefined ? { revision } : {}),
          ...(commands.length ? { commands } : {})
        });
        while (this.#compactedCommitted.size > MAX_COMPACTED_COMMITTED) {
          const oldestKey = this.#compactedCommitted.keys().next().value;
          if (oldestKey === undefined) break;
          this.#compactedCommitted.delete(oldestKey);
        }
      } catch {
        // Ignore non-JSON or malformed tool messages.
      }
    }
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
