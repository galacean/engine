/**
 * Node shim of LocalCandyJar (`local_candyjar.js`) -> http://127.0.0.1:8082/api/message.
 * Lets real `packages/ai-chat/src/ai-chat/asap-chat.ts` execute unmodified against local ASAP 8082.
 */

export interface AsapTransportOptions {
  baseUrl?: string;
  alipayUid?: string;
  sessionId?: string;
  maxRateLimitRetries?: number;
}

const REMOTE_STREAM_UPDATE_EVENT = "CandyJar.FlashApp.OnRemoteStreamUpdate";

function isRetryableStreamError(error: unknown): boolean {
  const text = typeof error === "string" ? error : JSON.stringify(error ?? "");
  if (text.includes("<!DOCTYPE html>")) return false;
  if (text.includes("lingguang_ai_chat_recovery") && !text.includes("lingguang_ai_chat_stream_result_bridge")) {
    return false;
  }
  if (text.includes("lingguang_ai_chat_stream_result_bridge") && !/LLMAgent error|"agent_error"|"errorCode"/.test(text)) {
    return false;
  }
  return /\bHTTP\s*(?:429|502|503|504)\b|\b(?:status|statusCode)["':=\s]+(?:429|502|503|504)\b|TPM_LIMIT_EXCEEDED|RATE_LIMIT|too many requests|ECONNRESET|ETIMEDOUT|APITimeoutError|APIConnectionError|ConnectTimeout|Connection error/i.test(text);
}

function parseBridgeFrames(text: string): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        frames.push(parsed as Record<string, unknown>);
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  return frames;
}

function readSSEDataEvents(
  buffer: string,
  flushRemaining: boolean,
  onEvent: (data: Record<string, unknown>) => boolean | void
): { remaining: string; shouldStop: boolean } {
  const frames = buffer.split(/(?:\r\n|\r(?!\n)|\n){2}/);
  const remaining = flushRemaining ? "" : (frames.pop() ?? "");
  for (const frame of frames) {
    const payload = frame
      .split(/\r\n?|\n/)
      .filter((line) => line === "data" || line.startsWith("data:"))
      .map((line) => line.slice(line.startsWith("data: ") ? 6 : 5))
      .join("\n");
    if (!payload) continue;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(payload);
    } catch {
      continue;
    }
    if (onEvent(data) === false) {
      return { remaining: "", shouldStop: true };
    }
  }
  return { remaining, shouldStop: false };
}

function serializeStreamError(error: unknown, seen = new Set<unknown>()): unknown {
  if (!(error instanceof Error)) return error;
  if (seen.has(error)) return "[Circular error cause]";
  seen.add(error);
  return {
    ...(error as unknown as Record<string, unknown>),
    name: error.name,
    message: error.message,
    ...(error.cause !== undefined ? { cause: serializeStreamError(error.cause, seen) } : {})
  };
}

export function installAsap8082WindowShim(options: AsapTransportOptions = {}) {
  const baseUrl = options.baseUrl ?? process.env.BENCH_ASAP_URL ?? "http://127.0.0.1:8082";
  const alipayUid = options.alipayUid ?? "seed-world-local-debug";
  const maxRateLimitRetries = options.maxRateLimitRetries ?? 6;
  let sessionId = options.sessionId ?? `bench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const docTarget = new EventTarget();
  const docShim = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) =>
      docTarget.addEventListener(type, listener, opts),
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject, opts?: boolean | EventListenerOptions) =>
      docTarget.removeEventListener(type, listener, opts),
    dispatchEvent: (event: Event) => docTarget.dispatchEvent(event),
    documentElement: { setAttribute: () => {} },
    referrer: ""
  };

  const emitFragment = (htmlFragment: Record<string, unknown>) => {
    const ev = new CustomEvent(REMOTE_STREAM_UPDATE_EVENT, {
      detail: { htmlFragment }
    });
    docShim.dispatchEvent(ev);
  };

  async function streamAttempt(requestBody: Record<string, unknown>, htmlContentCtx: unknown): Promise<{
    retryableError?: unknown;
    traceId?: string;
  }> {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let reachedEOF = false;
    let settled = false;
    let doneSeen = false;
    const bufferedPreModelFrames: unknown[] = [];
    let forwardedToConsumer = false;
    let retryableError: unknown;
    let traceId: string | undefined;

    const flushBuffered = () => {
      if (forwardedToConsumer) return;
      forwardedToConsumer = true;
      for (const item of bufferedPreModelFrames) {
        emitFragment({ success: true, type: "text", content: item, hasNext: true, extInfo: htmlContentCtx });
      }
      bufferedPreModelFrames.length = 0;
    };

    const finish = (fragment: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      flushBuffered();
      if (fragment.success === false) {
        const original = fragment.error;
        const details = serializeStreamError(original);
        const record = details && typeof details === "object" ? (details as Record<string, unknown>) : {};
        const message = [details, record.error_message, record.message, record.errorMessage, record.error, record.description].find(
          (value): value is string => typeof value === "string" && value.trim().length > 0
        );
        fragment = {
          ...fragment,
          error: message || "流式请求失败",
          errorDetails: details,
          ...(record.code != null ? { errorCode: String(record.code) } : {})
        };
      }
      emitFragment({ ...fragment, extInfo: htmlContentCtx, hasNext: false });
    };

    try {
      const response = await fetch(`${baseUrl}/api/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        const errObj = { status: response.status, message: `HTTP ${response.status}: ${bodyText.slice(0, 300)}` };
        if (!forwardedToConsumer && (response.status === 429 || response.status >= 500)) {
          return { retryableError: errObj };
        }
        throw new Error(errObj.message);
      }
      if (!response.body) {
        throw new Error("Empty response body from /api/message");
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (data: Record<string, unknown>): boolean => {
        if (settled) return false;
        if (data.type === "error") {
          if (!forwardedToConsumer && isRetryableStreamError(data.data)) {
            retryableError = data.data;
            settled = true;
            return false;
          }
          finish({ success: false, error: data.data ?? "Unknown error" });
        } else if (data.type === "trace_id") {
          traceId = typeof data.trace_id === "string" ? data.trace_id : undefined;
          finish({ success: true, type: "text", content: "", trace_id: traceId });
        } else if (data.type === "done") {
          doneSeen = true;
        } else if (data.type === "content" && data.data != null) {
          if (!forwardedToConsumer) {
            const text = typeof data.data === "string" ? data.data : JSON.stringify(data.data);
            const frames = parseBridgeFrames(text);
            const bridge = frames.find((frame) => frame.type === "lingguang_ai_chat_stream_result_bridge");
            if (bridge) {
              const bridgeResult =
                bridge.result && typeof bridge.result === "object" ? (bridge.result as Record<string, unknown>) : undefined;
              const bridgeErr = bridgeResult?.error;
              if (bridgeErr && isRetryableStreamError(bridgeErr)) {
                retryableError = bridgeErr;
                settled = true;
                return false;
              }
              bufferedPreModelFrames.push(data.data);
              flushBuffered();
            } else if (frames.length > 0 && frames.every((frame) => frame.type === "lingguang_ai_chat_recovery")) {
              // ASAP internal retry keepalive heartbeat: pass through to asap-chat without disarming outer retry
              emitFragment({ success: true, type: "text", content: data.data, hasNext: true, extInfo: htmlContentCtx });
            } else {
              bufferedPreModelFrames.push(data.data);
              if (!text.includes("<!DOCTYPE html>") && /"(?:text_delta|tool_call)"/.test(text)) {
                flushBuffered();
              }
            }
          } else {
            emitFragment({ success: true, type: "text", content: data.data, hasNext: true, extInfo: htmlContentCtx });
          }
        }
        return !settled;
      };

      while (!settled) {
        const { done, value } = await reader.read();
        reachedEOF = done;
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const result = readSSEDataEvents(buffer, done, handleEvent);
        buffer = result.remaining;
        if (retryableError) {
          return { retryableError };
        }
        if (done) {
          if (!settled) {
            finish(
              doneSeen
                ? { success: true, type: "text", content: "" }
                : { success: false, error: { code: "STREAM_INCOMPLETE", message: "流连接已关闭，但未收到结束标记" } }
            );
          }
          break;
        }
      }
      return { traceId };
    } catch (error) {
      if (!forwardedToConsumer && isRetryableStreamError(error)) {
        return { retryableError: error };
      }
      finish({ success: false, error });
      return {};
    } finally {
      if (reader) {
        try {
          if (!reachedEOF) await reader.cancel();
        } catch {
          // ignore
        } finally {
          reader.releaseLock();
        }
      }
    }
  }

  async function runStreamWithRetry(requestBody: Record<string, unknown>, htmlContentCtx: unknown) {
    const delaysMs = [5000, 10000, 15000, 20000, 25000, 25000];
    for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
      const outcome = await streamAttempt(requestBody, htmlContentCtx);
      if (!outcome.retryableError) return;
      if (attempt === maxRateLimitRetries) {
        emitFragment({
          success: false,
          error: typeof outcome.retryableError === "string" ? outcome.retryableError : JSON.stringify(outcome.retryableError),
          errorDetails: outcome.retryableError,
          extInfo: htmlContentCtx,
          hasNext: false
        });
        return;
      }
      const waitMs = delaysMs[Math.min(attempt, delaysMs.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  const candyJar = {
    call(
      method: string,
      action: string,
      params: Record<string, unknown>,
      successCallback: (result: unknown) => void,
      errorCallback: (error: unknown) => void
    ) {
      if (method === "FlashApp" && action === "remoteStreamSkill") {
        const htmlContentCtx = params.extInfo as Record<string, unknown>;
        const requestBody = {
          message: params.query,
          format: "html",
          reasoning: true,
          agent: "follow_up_no_search",
          components_options: "leopard",
          enable_personalization: false,
          is_mobile: false,
          css_template: "default",
          html_content_ctx_dict: htmlContentCtx,
          ext_info: { alipay_uid: alipayUid },
          session_id: sessionId
        };
        queueMicrotask(() => {
          successCallback({ success: true, message: "请求已发送" });
          void runStreamWithRetry(requestBody, htmlContentCtx);
        });
        return;
      }
      if (method === "FlashApp" && action === "remoteSkill") {
        queueMicrotask(() => successCallback({ content: JSON.stringify({ success: true }) }));
        return;
      }
      queueMicrotask(() => errorCallback(new Error(`Unsupported CandyJar call: ${method}.${action}`)));
    }
  };

  const windowShim = {
    location: { hostname: "127.0.0.1", href: "http://127.0.0.1:4173/world/demos/seed-world/index.html", search: "?aiChat=1&agentTrace=1" },
    document: docShim,
    artifactVersion: "1",
    trace_id: "",
    CustomEvent: globalThis.CustomEvent,
    CandyJar: candyJar,
    addEventListener: () => {},
    removeEventListener: () => {}
  };
  (windowShim as Record<string, unknown>).parent = windowShim;

  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = windowShim;

  return {
    setSessionId(nextId: string) {
      sessionId = nextId;
    },
    restore() {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  };
}
