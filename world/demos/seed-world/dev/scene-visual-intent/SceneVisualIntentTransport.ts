import { imageDataUrl } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import type { AgentFinishReason, AgentMessage, AgentModelDebug, AgentModelToolDefinition, AgentRunOptions, AgentToolCall } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { requestAsapChat, AsapRateLimitError, ASAP_TPM_RATE_LIMIT_MESSAGE, type AsapChatResult } from "@galacean/engine-ai-chat/ai-chat/asap-chat";

/** Debug options belong to this demo, never to the shared Seed World Agent. */
export type SceneGenerationRunOptions = AgentRunOptions & {
  localAsapOrigin?: string;
  modelTimeoutMs?: number;
};
type SceneGenerationChatOptions = SceneGenerationRunOptions & {
  messages: AgentMessage[];
  tools: AgentModelToolDefinition[];
  toolChoice?: "auto" | "required";
  debugMode: boolean;
  signal: AbortSignal;
};

const ASAP_TRANSPORT_GRACE_MS = 5_000;
const MAX_TIMER_TIMEOUT_MS = 2 ** 31 - 1;
const FINISH_REASONS = new Set<AgentFinishReason>(["stop", "tool_calls", "length", "content_filter"]);

/** An explicit debug endpoint owns this request; no global bridge is installed or replaced. */
export async function requestSceneGenerationChat(options: SceneGenerationChatOptions): Promise<AsapChatResult> {
  // This single-response demo has no AgentLoop prefix or persistent active transcript.
  const { localAsapOrigin, modelTimeoutMs = 25_000, contextCompaction: _contextCompaction, ...standardOptions } = options;
  // Native/Wrapper requests keep the shared transport's existing behavior and deadlines.
  if (localAsapOrigin === undefined) return requestAsapChat(standardOptions);
  const origin = validateLocalAsapOrigin(localAsapOrigin);
  if (!Number.isSafeInteger(modelTimeoutMs) || modelTimeoutMs <= 0 || modelTimeoutMs > MAX_TIMER_TIMEOUT_MS - ASAP_TRANSPORT_GRACE_MS) {
    throw new Error(`modelTimeoutMs 须为正安全整数，且不得超过 ${MAX_TIMER_TIMEOUT_MS - ASAP_TRANSPORT_GRACE_MS}ms`);
  }
  const params = await createSceneRequest(options, modelTimeoutMs);
  return requestWithinTransportTimeout(options.signal, modelTimeoutMs + ASAP_TRANSPORT_GRACE_MS,
    signal => requestThroughLocalService(params, signal, origin));
}

async function createSceneRequest(options: SceneGenerationChatOptions, modelTimeoutMs: number) {
  return {
    messages: await Promise.all(options.messages.map(async message => {
      if (message.role !== "user" || !message.image) return message;
      const { image, ...textMessage } = message;
      return { ...textMessage, content: [
        { type: "text", text: message.content },
        { type: "image_url", image_url: { url: await imageDataUrl(image.blob), detail: "auto" } }
      ] };
    })),
    ...(options.model ? { model: options.model } : {}),
    timeout: modelTimeoutMs,
    responseFormat: {
      type: "lingguang_ai_chat_transport_bridge", version: 1,
      params: {
        ...(options.tools.length ? { tools: options.tools, toolChoice: options.toolChoice ?? "auto", parallelToolCalls: false } : {}),
        debugMode: options.debugMode
      }
    }
  };
}

async function requestWithinTransportTimeout<T>(
  callerSignal: AbortSignal,
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (callerSignal.aborted) throw createAbortError();
  const requestController = new AbortController();
  let timedOut = false;
  const onCallerAbort = () => requestController.abort();
  callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, timeoutMs);
  try {
    return await request(requestController.signal);
  } catch (error) {
    if (timedOut) throw new Error(`ASAP AI 通道超时（${timeoutMs}ms）`);
    throw normalizeAsapChatError(error);
  } finally {
    globalThis.clearTimeout(timeoutId);
    callerSignal.removeEventListener("abort", onCallerAbort);
  }
}

/** Same local identity and remoteSkill envelope as the official ASAP Wrapper. */
function createLocalRemoteSkillParams(params: Awaited<ReturnType<typeof createSceneRequest>>) {
  return {
    action: "lingguang.ai.chat",
    payload: JSON.stringify({
      action: "lingguang.ai.chat",
      params,
      // The local wrapper synthesizes a timestamped Flash App identity on every
      // boot. That identity is not a deployable artifact and cannot participate
      // in ASAP's explicit model-routing allowlist. Keep local requests on one
      // stable development identity; production never enters this code path and
      // continues to use the native shell's trusted artifact identity.
      artifactId: "ai-chat-local",
      artifactVersion: window.artifactVersion || "1",
      debugTraceId: window.trace_id || ""
    }),
    source: "lingguang.ai.chat",
    extInfo: {}
  };
}

function validateLocalAsapOrigin(value: string): string {
  if (!isLocalPreview()) throw new Error("localAsapOrigin 仅允许在本地预览页面使用");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("localAsapOrigin 须为完整的本地服务 origin"); }
  if (!isLoopbackHostname(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("localAsapOrigin 仅接受无凭据、路径和查询参数的 loopback HTTP(S) origin");
  }
  return url.origin;
}

/** Opt-in top-level Gallery transport; no proxy, provider credentials, or browser retries. */
async function requestThroughLocalService(
  params: Awaited<ReturnType<typeof createSceneRequest>>,
  signal: AbortSignal,
  origin: string
): Promise<AsapChatResult> {
  let response: Response;
  try {
    response = await fetch(`${origin}/api/remote_skill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ params: createLocalRemoteSkillParams(params) }),
      signal,
      credentials: "omit",
      redirect: "error"
    });
  } catch (error) {
    if (signal.aborted) throw createAbortError();
    throw new Error(`无法连接本地 ASAP 服务 ${origin}；请确认服务已启动且允许当前页面访问`, { cause: error });
  }
  let result: unknown;
  try { result = await response.json(); }
  catch (error) {
    if (signal.aborted) throw createAbortError();
    throw new Error(`本地 ASAP 服务返回了无效 JSON（HTTP ${response.status}）`, { cause: error });
  }
  if (!response.ok || !isRecord(result) || result.success !== true) {
    const fallback = response.status === 429
      ? "本地 ASAP 服务限流（HTTP 429）"
      : `本地 ASAP 请求失败（HTTP ${response.status}）`;
    throw {
      ...(isRecord(result) ? result : {}),
      message: getErrorMessage(result, fallback),
      status: response.status
    };
  }
  if (typeof result.data !== "string") throw new Error("本地 ASAP 返回格式无效：缺少 remoteSkill data 字符串");
  return normalizeAsapChatResult(JSON.parse(result.data));
}

function normalizeAsapChatResult(value: unknown): AsapChatResult {
  if (!isRecord(value) || typeof value.content !== "string") {
    throw new Error("ASAP AI 返回格式无效");
  }
  const toolCalls = normalizeToolCalls(value.toolCalls);
  const inferredFinishReason = toolCalls.length ? "tool_calls" : "stop";
  const finishReason = value.finishReason ?? inferredFinishReason;
  if (typeof finishReason !== "string" || !FINISH_REASONS.has(finishReason as AgentFinishReason)) {
    throw new Error("ASAP AI 返回了未知 finishReason");
  }
  if (finishReason === "tool_calls" && toolCalls.length === 0) {
    throw new Error("ASAP AI 返回 tool_calls，但没有 Tool Call");
  }
  return {
    content: value.content,
    toolCalls,
    finishReason: finishReason as AgentFinishReason,
    traceId: typeof value.traceId === "string" ? value.traceId : undefined,
    debug: normalizeDebug(value.debug)
  };
}

function normalizeToolCalls(value: unknown): AgentToolCall[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("ASAP AI toolCalls 必须是数组");
  return value.map((item, index) => {
    const path = `toolCalls[${index}]`;
    if (!isRecord(item) || item.type !== "function") {
      throw new Error(`${path}.type 必须是 function`);
    }
    if (typeof item.id !== "string" || !item.id) {
      throw new Error(`${path}.id 必须是非空字符串`);
    }
    if (!isRecord(item.function)) throw new Error(`${path}.function 必须是对象`);
    const name = item.function.name;
    const args = item.function.arguments;
    if (typeof name !== "string" || !name) {
      throw new Error(`${path}.function.name 必须是非空字符串`);
    }
    if (typeof args !== "string") {
      throw new Error(`${path}.function.arguments 必须是 JSON 字符串`);
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
      value.validationStatus === "valid" || value.validationStatus === "invalid"
        ? value.validationStatus
        : undefined,
    validationError:
      typeof validationError === "string" || validationError === null
        ? validationError
        : undefined,
    modelName: typeof value.modelName === "string" ? value.modelName : undefined,
    requestedModel: typeof value.requestedModel === "string" ? value.requestedModel : undefined,
    artifactId: typeof value.artifactId === "string" ? value.artifactId : undefined,
    modelRoute: typeof value.modelRoute === "string" ? value.modelRoute : undefined,
    jsonSchemaName: typeof value.jsonSchemaName === "string" ? value.jsonSchemaName : undefined,
    structuredOutputMode:
      typeof value.structuredOutputMode === "string" ? value.structuredOutputMode : undefined
  };
}

function isLocalPreview(): boolean {
  return isLoopbackHostname(window.location.hostname);
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function createAbortError(): DOMException {
  return new DOMException("Agent task cancelled", "AbortError");
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value) return value;
  if (isRecord(value)) {
    const message = value.message || value.error;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function normalizeAsapChatError(value: unknown): Error {
  if (value instanceof AsapRateLimitError) return value;
  if (isRateLimitError(value)) {
    const evidence = collectErrorEvidence(value).join(" ");
    const message = /TPM_LIMIT_EXCEEDED/i.test(evidence)
      ? ASAP_TPM_RATE_LIMIT_MESSAGE
      : getErrorMessage(value, "模型服务限流，请稍后重试。");
    return new AsapRateLimitError(message);
  }
  return value instanceof Error ? value : new Error(getErrorMessage(value, "ASAP 大模型调用失败"));
}

function isRateLimitError(value: unknown): boolean {
  const names = collectErrorFieldEvidence(value, "name");
  if (names.some((name) => name === "RATE_LIMIT_EXCEEDED_ERROR")) return true;
  const codes = collectErrorFieldEvidence(value, "code");
  if (codes.some((code) => code === "30001" || code === "TPM_LIMIT_EXCEEDED")) return true;
  const evidence = collectErrorEvidence(value).join(" ");
  if (/TPM_LIMIT_EXCEEDED/i.test(evidence)) return true;
  return /(?:HTTP\s*)?429\b/i.test(evidence) &&
    /rate.?limit|too many requests|请求额度超限|限流/i.test(evidence);
}

function collectErrorFieldEvidence(
  value: unknown,
  field: string,
  seen = new Set<object>()
): string[] {
  if (typeof value !== "object" || value === null || seen.has(value)) return [];
  seen.add(value);
  if (value instanceof Error) {
    const ownValue = (value as unknown as Record<string, unknown>)[field];
    return [
      ...(typeof ownValue === "string" || typeof ownValue === "number"
        ? [String(ownValue)]
        : []),
      ...(field === "name" ? [value.name] : []),
      ...collectErrorFieldEvidence(value.cause, field, seen)
    ];
  }
  if (!isRecord(value)) return [];
  const own = typeof value[field] === "string" || typeof value[field] === "number"
    ? [String(value[field])]
    : [];
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
