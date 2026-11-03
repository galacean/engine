import { MODEL_ROUND_TIMEOUT_MS, normalizeRecoveryEvent, type ModelRecoveryEvent } from "./model-recovery";
import { imageDataUrl, type ImageResourceBudget } from "./image-resources";
import type {
  AgentFinishReason,
  AgentMessage,
  AgentModelDebug,
  AgentToolCall,
  AgentModelToolDefinition
} from "./agent-types";
import { resolveCandyJar, type CandyJarApi } from "./candyjar-bridge";
import {
  normalizeModelTelemetry,
  normalizeServerModelAttempts,
  normalizeServerModelError,
  type ModelTelemetry,
  type ServerModelAttempt,
  type ServerModelError
} from "./context-metrics";
import {
  parseContextCompaction,
  type ContextCompactionRequest,
  type ContextCompactionResult
} from "./context-compaction";

export type AsapChatResult = {
  content: string;
  toolCalls: AgentToolCall[];
  finishReason: AgentFinishReason;
  traceId?: string;
  debug?: AgentModelDebug;
  telemetry?: ModelTelemetry;
  contextCompaction?: ContextCompactionResult;
  modelAttempts?: ServerModelAttempt[];
};

export class AsapModelError extends Error {
  readonly code: string;
  readonly details?: ServerModelError["details"];
  readonly finishReason?: AgentFinishReason;
  readonly traceId?: string;
  readonly telemetry?: ModelTelemetry;
  readonly modelAttempts?: ServerModelAttempt[];

  constructor(value: Record<string, unknown>, error: ServerModelError) {
    super(error.message);
    this.name = "AsapModelError";
    this.code = error.code;
    this.details = error.details;
    this.finishReason = FINISH_REASONS.has(value.finishReason as AgentFinishReason)
      ? (value.finishReason as AgentFinishReason)
      : undefined;
    this.traceId = typeof value.traceId === "string" ? value.traceId : undefined;
    this.telemetry = normalizeModelTelemetry(value.telemetry);
    this.modelAttempts = normalizeServerModelAttempts(value.modelAttempts);
  }
}

type AsapChatOptions = {
  timeoutMs?: number;
  onRecovery?: (event: ModelRecoveryEvent) => void;
  imageBudget?: ImageResourceBudget;
  contextCompaction?: ContextCompactionRequest;
  messages: AgentMessage[];
  model?: string;
  tools: AgentModelToolDefinition[];
  toolChoice?: "auto" | "required";
  debugMode: boolean;
  signal: AbortSignal;
};

type LingguangAiChatTransportBridge = {
  type: "lingguang_ai_chat_transport_bridge";
  version: 1;
  params: {
    tools?: AgentModelToolDefinition[];
    toolChoice?: "auto" | "required";
    parallelToolCalls?: boolean;
    debugMode: boolean;
    streamResponseNonce: string;
    recoveryEvents: boolean;
    contextCompaction?: ContextCompactionRequest;
  };
};

type LingguangAiStreamChatRequest = {
  messages: Array<Omit<AgentMessage, "content"> & { content: string | Array<Record<string, unknown>> }>;
  model?: string;
  responseFormat: LingguangAiChatTransportBridge;
  timeout: number;
  signal: AbortSignal;
  onEvent?: (event: LingguangAiChatStreamEvent) => void;
};

type LingguangAiChatStreamEvent =
  | { type: "text_delta"; delta: string; text: string }
  | { type: "message_done"; content: string; finishReason?: string; traceId?: string }
  | { type: "error"; message: string; code?: string; traceId?: string };

type LingguangAiApi = {
  streamChat(options: LingguangAiStreamChatRequest): Promise<AsapChatResult>;
};

declare global {
  interface Window {
    CandyJar?: CandyJarApi;
    artifactId?: string;
    artifactVersion?: string;
    lingguang?: {
      ai?: LingguangAiApi;
      asr?: {
        start(options: {
          lang: string;
          interim: boolean;
          onText: (payload: { text: string }) => void;
          onError?: (error: { message?: string; error?: string }) => void;
          onEnd?: (reason: "stop" | "abort" | "error") => void;
        }): Promise<void>;
        stop(): Promise<void>;
        abort?(): Promise<void>;
      };
    };
    trace_id?: string;
  }
}

// Allow geometry-heavy tool results to receive a complete model response.
// Keep transport headroom and caller cancellation; this is a per-round budget.
export const ASAP_MODEL_ROUND_TIMEOUT_MS = MODEL_ROUND_TIMEOUT_MS;
const ASAP_TRANSPORT_TIMEOUT_MS = 130_000;
const LINGGUANG_AI_CHAT_TRANSPORT_BRIDGE_TYPE = "lingguang_ai_chat_transport_bridge";
const LINGGUANG_AI_CHAT_STREAM_RESULT_BRIDGE_TYPE = "lingguang_ai_chat_stream_result_bridge";
const LINGGUANG_AI_CHAT_STREAM_RESULT_BRIDGE_VERSION = 1;
const REMOTE_STREAM_UPDATE_EVENT = "CandyJar.FlashApp.OnRemoteStreamUpdate";
const localChatSessions = new WeakMap<Window, string>();
export const ASAP_TPM_RATE_LIMIT_MESSAGE = "模型服务请求额度超限（HTTP 429，TPM_LIMIT_EXCEEDED），请稍后重试。";
const FINISH_REASONS = new Set<AgentFinishReason>(["stop", "tool_calls", "length", "content_filter"]);

export async function requestAsapChat(options: AsapChatOptions): Promise<AsapChatResult> {
  const streamResponseNonce = createStreamResponseNonce();
  const timeoutMs = Math.max(
    1,
    Math.min(ASAP_MODEL_ROUND_TIMEOUT_MS, options.timeoutMs ?? ASAP_MODEL_ROUND_TIMEOUT_MS)
  );
  let lastSequence = 0;
  const onRecovery = (event: ModelRecoveryEvent) => {
    if (options.signal.aborted || event.sequence <= lastSequence) return;
    lastSequence = event.sequence;
    options.onRecovery?.(event);
  };
  const inspectProgress = (text: string) => stripRecoveryFrames(text, streamResponseNonce, onRecovery);
  const bridgedToolParams = options.tools.length
    ? {
        tools: options.tools,
        toolChoice: options.toolChoice ?? "auto",
        parallelToolCalls: true as const
      }
    : {};
  const responseFormat: LingguangAiChatTransportBridge = {
    type: LINGGUANG_AI_CHAT_TRANSPORT_BRIDGE_TYPE,
    version: 1,
    params: {
      ...bridgedToolParams,
      ...(options.contextCompaction ? { contextCompaction: options.contextCompaction } : {}),
      debugMode: options.debugMode,
      streamResponseNonce,
      recoveryEvents: true
    }
  };
  const release = options.imageBudget?.reserve(
    "temporary",
    options.messages.reduce((n, m) => n + (m.role === "user" && m.image ? m.image.blob.size * 8 : 0), 0)
  );
  try {
    const params: Omit<LingguangAiStreamChatRequest, "signal" | "onEvent"> = {
      messages: options.messages.some((message) => message.role === "user" && message.image)
        ? await Promise.all(
            options.messages.map(async (message) => {
              if (message.role !== "user" || !message.image) return message;
              const { image, ...textMessage } = message;
              return {
                ...textMessage,
                content: [
                  { type: "text", text: message.content },
                  { type: "image_url", image_url: { url: await imageDataUrl(image.blob), detail: "auto" } }
                ]
              };
            })
          )
        : options.messages,
      ...(options.model ? { model: options.model } : {}),
      timeout: timeoutMs,
      responseFormat
    };

    try {
      return await requestWithinTransportTimeout(
        options.signal,
        async (signal) => {
          if (isLocalPreview()) {
            return requestStreamThroughCandyJar(params, signal, streamResponseNonce, inspectProgress, options.signal);
          }

          const ai = window.lingguang?.ai;
          const streamChat = ai?.streamChat;
          if (!streamChat) throw new Error("当前环境没有注入 ASAP AI_STREAM_CHAT");
          // Published SDKs can put the code only in onEvent, then reject with a
          // text-only Error and emit another generic error event. Keep one failure
          // per request; subsequent events may fill fields but cannot erase them.
          let failure: Extract<LingguangAiChatStreamEvent, { type: "error" }> | undefined;
          try {
            const result = await streamChat.call(ai, {
              ...params,
              signal,
              onEvent: (event: LingguangAiChatStreamEvent) => {
                if (signal.aborted) return;
                if (event.type === "text_delta") {
                  inspectProgress(event.text);
                  return;
                }
                if (event.type !== "error") return;
                failure = {
                  ...event,
                  ...Object.fromEntries(
                    Object.entries(failure ?? {}).filter(([, value]) => value !== undefined && value !== "")
                  )
                };
              }
            });
            if (signal.aborted) throw createAbortError();
            if (failure) throw failure;
            return normalizeStreamAsapChatResult(result, streamResponseNonce, inspectProgress);
          } catch (error) {
            if (signal.aborted) throw createAbortError();
            // The final rejection may carry details unavailable in the stream event.
            throw failure && error !== failure ? { ...failure, cause: error } : error;
          }
        },
        timeoutMs + 10_000
      );
    } catch (error) {
      throw normalizeAsapChatError(error);
    }
  } finally {
    release?.();
  }
}

async function requestWithinTransportTimeout<T>(
  callerSignal: AbortSignal,
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = ASAP_TRANSPORT_TIMEOUT_MS
): Promise<T> {
  if (callerSignal.aborted) throw createAbortError();
  const requestController = new AbortController();
  // Own settlement here: an existing shell may ignore AbortSignal or settle
  // its Promise with a late result after aborting the underlying transport.
  let rejectAborted!: (reason: Error) => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAborted = reject;
  });
  const onRequestAbort = () => rejectAborted(createAbortError());
  requestController.signal.addEventListener("abort", onRequestAbort, { once: true });
  let timedOut = false;
  const onCallerAbort = () => requestController.abort();
  callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, timeoutMs);
  try {
    const result = await Promise.race([request(requestController.signal), aborted]);
    if (requestController.signal.aborted) throw createAbortError();
    return result;
  } catch (error) {
    if (timedOut) throw Object.assign(new Error(`ASAP AI 通道超时（${timeoutMs}ms）`), { code: "MODEL_TIMEOUT" });
    throw normalizeAsapChatError(error);
  } finally {
    globalThis.clearTimeout(timeoutId);
    callerSignal.removeEventListener("abort", onCallerAbort);
    requestController.signal.removeEventListener("abort", onRequestAbort);
  }
}

function requestStreamThroughCandyJar(
  params: Omit<Parameters<LingguangAiApi["streamChat"]>[0], "signal" | "onEvent">,
  signal: AbortSignal,
  streamResponseNonce: string,
  inspectProgress: (text: string) => string,
  callerSignal: AbortSignal
): Promise<AsapChatResult> {
  const candyJar = resolveCandyJar();
  if (!candyJar?.call) {
    return Promise.reject(new Error("本地预览没有连接到 ASAP CandyJar 通道"));
  }
  if (signal.aborted) return Promise.reject(createAbortError());

  let sessionId = localChatSessions.get(window);
  if (!sessionId) {
    sessionId = `ai-chat-${createStreamResponseNonce()}`;
    localChatSessions.set(window, sessionId);
  }
  const identity = { sessionId, queryId: streamResponseNonce };

  const remoteSkillParams = {
    action: "lingguang.ai.streamChat",
    query: "lingguang.ai.streamChat",
    extInfo: {
      action: "lingguang.ai.streamChat",
      debugStreamRequestId: streamResponseNonce,
      artifactId: "ai-chat-local",
      artifactVersion: window.artifactVersion || "1",
      debugTraceId: window.trace_id || "",
      payload: JSON.stringify({
        action: "lingguang.ai.streamChat",
        params: { ...params, ...identity },
        // The local wrapper synthesizes a timestamped Flash App identity on every
        // boot. That identity is not a deployable artifact and cannot participate
        // in ASAP's explicit model-routing allowlist. Keep local requests on one
        // stable development identity; production never enters this code path and
        // continues to use the native shell's trusted artifact identity.
        artifactId: "ai-chat-local",
        artifactVersion: window.artifactVersion || "1",
        debugTraceId: window.trace_id || ""
      })
    }
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let content = "";
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      window.document.removeEventListener(REMOTE_STREAM_UPDATE_EVENT, onStreamUpdate);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () =>
      finish(() => {
        // Stop accepting results immediately. The existing control plane can
        // cancel even before the stream has registered its runtime scope.
        reject(createAbortError());
        if (callerSignal.aborted) requestLocalStop(candyJar, identity);
      });
    const onStreamUpdate = (event: Event) => {
      const fragment = getRemoteStreamFragment(event);
      if (!fragment || !isMatchingStreamFragment(fragment, streamResponseNonce)) return;
      if (fragment.success !== true) {
        // New local shells separate display text from structured details; older
        // shells put the structured error directly in `error`.
        const error = isRecord(fragment.errorDetails) ? fragment.errorDetails : fragment.error;
        finish(() => reject(isRecord(error) ? error : new Error(getErrorMessage(fragment.error, "ASAP 流式请求失败"))));
        return;
      }
      if (typeof fragment.content === "string") {
        content += fragment.content;
        try {
          inspectProgress(content);
        } catch (error) {
          finish(() => reject(error));
          return;
        }
      }
      if (fragment.hasNext === false) {
        finish(() => {
          try {
            resolve(
              normalizeStreamAsapChatResult(
                {
                  content,
                  finishReason: "stop",
                  traceId: typeof fragment.trace_id === "string" ? fragment.trace_id : undefined
                },
                streamResponseNonce,
                inspectProgress
              )
            );
          } catch (error) {
            reject(error);
          }
        });
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    window.document.addEventListener(REMOTE_STREAM_UPDATE_EVENT, onStreamUpdate);

    try {
      candyJar.call(
        "FlashApp",
        "remoteStreamSkill",
        remoteSkillParams,
        () => undefined,
        (error) => finish(() => reject(error)),
        ASAP_TRANSPORT_TIMEOUT_MS
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function requestLocalStop(candyJar: CandyJarApi, identity: { sessionId: string; queryId: string }): void {
  const failed = () => console.warn("ASAP stopChat 未确认受理；前端已停止接收结果。");
  try {
    candyJar.call(
      "FlashApp",
      "remoteSkill",
      {
        action: "lingguang.ai.stopChat",
        payload: JSON.stringify({ params: identity })
      },
      (value) => {
        try {
          const result = isRecord(value) && typeof value.content === "string" ? JSON.parse(value.content) : value;
          if (!isRecord(result) || result.success !== true) failed();
        } catch {
          failed();
        }
      },
      failed,
      10_000
    );
  } catch {
    failed();
  }
}

function getRemoteStreamFragment(event: Event): Record<string, unknown> | undefined {
  const direct = (event as Event & { htmlFragment?: unknown }).htmlFragment;
  if (isRecord(direct)) return direct;
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isRecord(detail)) return undefined;
  return isRecord(detail.htmlFragment) ? detail.htmlFragment : undefined;
}

function isMatchingStreamFragment(fragment: Record<string, unknown>, nonce: string): boolean {
  const extInfo = fragment.extInfo;
  return isRecord(extInfo) && extInfo.debugStreamRequestId === nonce;
}

function normalizeStreamAsapChatResult(
  value: unknown,
  expectedNonce: string,
  inspectProgress: (text: string) => string
): AsapChatResult {
  const streamedResult = normalizeAsapChatResult(value);
  const terminalText = inspectProgress(streamedResult.content);
  let envelope: unknown;
  try {
    envelope = JSON.parse(terminalText);
  } catch {
    return streamedResult;
  }
  if (!isRecord(envelope) || envelope.type !== LINGGUANG_AI_CHAT_STREAM_RESULT_BRIDGE_TYPE) {
    return streamedResult;
  }
  if (
    envelope.version !== LINGGUANG_AI_CHAT_STREAM_RESULT_BRIDGE_VERSION ||
    envelope.nonce !== expectedNonce ||
    !isRecord(envelope.result)
  ) {
    throw modelProtocolError("ASAP AI 流式 Tool Calling 结果信封无效");
  }
  return normalizeAsapChatResult(envelope.result);
}

function createStreamResponseNonce(): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw Object.assign(new Error("当前环境无法创建 ASAP 流式请求标识"), { code: "MODEL_CONFIG_ERROR" });
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeAsapChatResult(value: unknown): AsapChatResult {
  if (!isRecord(value) || typeof value.content !== "string") {
    throw modelProtocolError("ASAP AI 返回格式无效");
  }
  if (value.error !== undefined) {
    const error = normalizeServerModelError(value.error);
    if (!error) {
      throw modelProtocolError("ASAP AI 返回错误格式无效");
    }
    throw new AsapModelError(value, error);
  }
  const toolCalls = normalizeToolCalls(value.toolCalls);
  const inferredFinishReason = toolCalls.length ? "tool_calls" : "stop";
  const finishReason = value.finishReason ?? inferredFinishReason;
  if (typeof finishReason !== "string" || !FINISH_REASONS.has(finishReason as AgentFinishReason)) {
    throw modelProtocolError("ASAP AI 返回了未知 finishReason");
  }
  if (finishReason === "tool_calls" && toolCalls.length === 0) {
    throw modelProtocolError("ASAP AI 返回 tool_calls，但没有 Tool Call");
  }
  return {
    content: value.content,
    toolCalls,
    finishReason: finishReason as AgentFinishReason,
    traceId: typeof value.traceId === "string" ? value.traceId : undefined,
    debug: normalizeDebug(value.debug),
    telemetry: normalizeModelTelemetry(value.telemetry),
    contextCompaction: parseContextCompaction(value.contextCompaction),
    modelAttempts: normalizeServerModelAttempts(value.modelAttempts)
  };
}

function normalizeToolCalls(value: unknown): AgentToolCall[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw modelProtocolError("ASAP AI toolCalls 必须是数组");
  return value.map((item, index) => {
    const path = `toolCalls[${index}]`;
    if (!isRecord(item) || item.type !== "function") {
      throw modelProtocolError(`${path}.type 必须是 function`);
    }
    if (typeof item.id !== "string" || !item.id) {
      throw modelProtocolError(`${path}.id 必须是非空字符串`);
    }
    if (!isRecord(item.function)) throw modelProtocolError(`${path}.function 必须是对象`);
    const name = item.function.name;
    const args = item.function.arguments;
    if (typeof name !== "string" || !name) {
      throw modelProtocolError(`${path}.function.name 必须是非空字符串`);
    }
    if (typeof args !== "string") {
      throw modelProtocolError(`${path}.function.arguments 必须是 JSON 字符串`);
    }
    return {
      id: item.id,
      type: "function",
      function: { name, arguments: args }
    };
  });
}

function normalizeDebug(value: unknown): AgentModelDebug | undefined {
  if (!isRecord(value)) return undefined;
  const validationError = value.validationError;
  return {
    validationStatus:
      value.validationStatus === "valid" || value.validationStatus === "invalid" ? value.validationStatus : undefined,
    validationError: typeof validationError === "string" || validationError === null ? validationError : undefined,
    modelName: typeof value.modelName === "string" ? value.modelName : undefined,
    requestedModel: typeof value.requestedModel === "string" ? value.requestedModel : undefined,
    artifactId: typeof value.artifactId === "string" ? value.artifactId : undefined,
    modelRoute: typeof value.modelRoute === "string" ? value.modelRoute : undefined,
    jsonSchemaName: typeof value.jsonSchemaName === "string" ? value.jsonSchemaName : undefined,
    structuredOutputMode: typeof value.structuredOutputMode === "string" ? value.structuredOutputMode : undefined
  };
}

function isLocalPreview(): boolean {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function createAbortError(): DOMException {
  return new DOMException("Agent task cancelled", "AbortError");
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value) return value;
  if (isRecord(value)) {
    for (const message of [value.error_message, value.message, value.error, value.description]) {
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return fallback;
}

export class AsapRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsapRateLimitError";
  }
}

function normalizeAsapChatError(value: unknown): Error {
  if (value instanceof AsapRateLimitError) return value;
  if (isRateLimitError(value)) {
    const evidence = [...collectErrorEvidence(value), ...collectErrorFieldEvidence(value, "code")].join(" ");
    const message = /TPM_LIMIT_EXCEEDED/i.test(evidence)
      ? ASAP_TPM_RATE_LIMIT_MESSAGE
      : getErrorMessage(value, "模型服务限流，请稍后重试。");
    return Object.assign(
      new AsapRateLimitError(message),
      value instanceof AsapModelError
        ? {
            code: value.code,
            details: value.details,
            finishReason: value.finishReason,
            traceId: value.traceId,
            telemetry: value.telemetry,
            modelAttempts: value.modelAttempts
          }
        : {},
      { cause: value }
    );
  }
  return value instanceof Error
    ? value
    : Object.assign(new Error(getErrorMessage(value, "ASAP 大模型调用失败")), { cause: value });
}

function isRateLimitError(value: unknown): boolean {
  const names = collectErrorFieldEvidence(value, "name");
  if (names.some((name) => name === "RATE_LIMIT_EXCEEDED_ERROR")) return true;
  const codes = collectErrorFieldEvidence(value, "code");
  if (codes.some((code) => code === "30001" || code === "TPM_LIMIT_EXCEEDED" || code === "RATE_LIMIT_EXCEEDED_ERROR"))
    return true;
  const evidence = collectErrorEvidence(value).join(" ");
  if (/TPM_LIMIT_EXCEEDED/i.test(evidence)) return true;
  return /(?:HTTP\s*)?429\b/i.test(evidence) && /rate.?limit|too many requests|请求额度超限|限流/i.test(evidence);
}

function collectErrorFieldEvidence(value: unknown, field: string, seen = new Set<object>()): string[] {
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  if (value instanceof Error) {
    const ownValue = (value as unknown as Record<string, unknown>)[field];
    return [
      ...(typeof ownValue === "string" || typeof ownValue === "number" ? [String(ownValue)] : []),
      ...(field === "name" ? [value.name] : []),
      ...collectErrorFieldEvidence(value.cause, field, seen)
    ];
  }
  if (!isRecord(value)) return [];
  const own = typeof value[field] === "string" || typeof value[field] === "number" ? [String(value[field])] : [];
  return [
    ...own,
    ...collectErrorFieldEvidence(value.details, field, seen),
    ...collectErrorFieldEvidence(value.cause, field, seen),
    ...collectErrorFieldEvidence(value.data, field, seen)
  ];
}

function collectErrorEvidence(value: unknown, seen = new Set<object>()): string[] {
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  if (value instanceof Error) {
    return [value.name, value.message, ...collectErrorEvidence(value.cause, seen)];
  }
  if (!isRecord(value)) return [];
  const evidence: string[] = [];
  for (const key of ["name", "message", "error", "code", "status", "details", "cause"]) {
    evidence.push(...collectErrorEvidence(value[key], seen));
  }
  return evidence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Negotiated NDJSON prefix; the existing nonce-correlated terminal remains atomic. */
function stripRecoveryFrames(text: string, nonce: string, onEvent: (event: ModelRecoveryEvent) => void): string {
  let offset = 0;
  while (true) {
    const end = text.indexOf("\n", offset);
    if (end < 0) return text.slice(offset);
    let frame: unknown;
    try {
      frame = JSON.parse(text.slice(offset, end));
    } catch {
      return text.slice(offset);
    }
    if (!isRecord(frame) || frame.type !== "lingguang_ai_chat_recovery") return text.slice(offset);
    const event = normalizeRecoveryEvent(frame.event);
    if (frame.version !== 1 || frame.nonce !== nonce || !event)
      throw Object.assign(new Error("ASAP 恢复状态信封无效"), { code: "MODEL_PROTOCOL_ERROR" });
    onEvent(event);
    offset = end + 1;
  }
}

function modelProtocolError(message: string): Error {
  return Object.assign(new Error(message), { code: "MODEL_PROTOCOL_ERROR" });
}
