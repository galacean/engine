export type CandyJarApi = {
  call(
    method: string,
    action: string,
    params: Record<string, unknown>,
    successCallback: (result: unknown) => void,
    errorCallback: (error: unknown) => void,
    timeout?: number
  ): void;
};

type CandyJarWindow = Window & {
  CustomEvent: typeof CustomEvent;
  CandyJar?: CandyJarApi;
};

type PendingCall = {
  method: string;
  action: string;
  successCallback: (result: unknown) => void;
  errorCallback: (error: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type CandyJarBridgeError = {
  name: "CandyJarBridgeError";
  message: string;
  error: string;
  code?: string | number;
  method: string;
  action: string;
  details?: unknown;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const bridges = new WeakMap<Window, CandyJarApi>();
let nextCallId = 0;

/**
 * Returns the native CandyJar channel, or installs the Flash App iframe
 * postMessage bridge used by the local ASAP wrapper.
 */
export function resolveCandyJar(hostWindow: CandyJarWindow = window): CandyJarApi | undefined {
  if (typeof hostWindow.CandyJar?.call === "function") {
    return hostWindow.CandyJar;
  }
  if (hostWindow.CandyJar || hostWindow.parent === hostWindow) {
    return undefined;
  }

  const existingBridge = bridges.get(hostWindow);
  if (existingBridge) {
    hostWindow.CandyJar = existingBridge;
    return existingBridge;
  }

  const bridge = createPostMessageBridge(hostWindow);
  bridges.set(hostWindow, bridge);
  hostWindow.CandyJar = bridge;
  return bridge;
}

function createPostMessageBridge(hostWindow: CandyJarWindow): CandyJarApi {
  const parentWindow = hostWindow.parent;
  const targetOrigin = resolveParentOrigin(hostWindow);
  const pendingCalls = new Map<string, PendingCall>();
  const debugEvents: Array<{ callId: string; stage: string; at: number }> = [];
  const debug = new URLSearchParams(hostWindow.location.search).get("agentTrace") === "1";
  const record = (callId: string, stage: string) => {
    if (!debug) return;
    debugEvents.push({ callId, stage, at: Date.now() });
    if (debugEvents.length > 32) debugEvents.shift();
    hostWindow.document.documentElement.setAttribute(
      "data-candyjar-bridge",
      JSON.stringify({
        targetOrigin,
        pendingCount: pendingCalls.size,
        events: debugEvents
      })
    );
  };

  hostWindow.addEventListener("message", (event) => {
    const response = event.data;
    if (event.source !== parentWindow || !isAllowedOrigin(event.origin, targetOrigin)) {
      if (
        isRecord(response) &&
        response.type === "CANDYJAR_CALLBACK" &&
        typeof response.callId === "string" &&
        pendingCalls.has(response.callId)
      ) {
        record(
          response.callId,
          event.source !== parentWindow ? "callback-source-rejected" : "callback-origin-rejected"
        );
      }
      return;
    }
    if (!isRecord(response)) {
      return;
    }
    if (response.type === "CANDYJAR_EVENT") {
      dispatchCandyJarEvent(hostWindow, response);
      return;
    }
    if (response.type !== "CANDYJAR_CALLBACK" || typeof response.callId !== "string") {
      return;
    }
    const pending = pendingCalls.get(response.callId);
    if (!pending) {
      return;
    }
    pendingCalls.delete(response.callId);
    record(response.callId, response.success === true ? "callback-success" : "callback-error");
    clearTimeout(pending.timeoutId);
    if (response.success === true) {
      pending.successCallback(response.result);
    } else {
      pending.errorCallback(normalizeCandyJarCallbackError(response, pending));
    }
  });

  return {
    call(method, action, params, successCallback, errorCallback, timeout = DEFAULT_TIMEOUT_MS) {
      const callId = createCallId();
      const timeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS;
      const timeoutId = setTimeout(() => {
        const pending = pendingCalls.get(callId);
        if (!pending) {
          return;
        }
        pendingCalls.delete(callId);
        record(callId, "callback-timeout");
        pending.errorCallback(new Error(`CandyJar call timed out: ${method}.${action}`));
      }, timeoutMs);
      pendingCalls.set(callId, { method, action, successCallback, errorCallback, timeoutId });
      record(callId, "dispatch");

      try {
        parentWindow.postMessage(
          {
            type: "CANDYJAR_CALL",
            callId,
            method,
            action,
            params,
            timeout: timeoutMs
          },
          targetOrigin
        );
      } catch (error) {
        clearTimeout(timeoutId);
        pendingCalls.delete(callId);
        record(callId, "dispatch-error");
        errorCallback(error);
      }
    }
  };
}

function dispatchCandyJarEvent(hostWindow: CandyJarWindow, message: Record<string, unknown>): void {
  const eventType = message.eventType;
  const eventData = message.eventData;
  if (typeof eventType !== "string" || !eventType || !isRecord(eventData)) {
    return;
  }
  const candyJarEvent = new hostWindow.CustomEvent(eventType, {
    detail: eventData
  });
  for (const [key, value] of Object.entries(eventData)) {
    if (key === "type") continue;
    Object.defineProperty(candyJarEvent, key, {
      configurable: true,
      enumerable: true,
      value
    });
  }
  hostWindow.document.dispatchEvent(candyJarEvent);
}

function normalizeCandyJarCallbackError(
  response: Record<string, unknown>,
  pending: Pick<PendingCall, "method" | "action">
): CandyJarBridgeError {
  const rawError = response.error;
  const details = response.errorDetails ?? rawError;
  const detailsRecord = isRecord(details) ? details : undefined;
  const errorRecord = isRecord(rawError) ? rawError : undefined;
  const message =
    firstNonEmptyString(
      rawError,
      errorRecord?.message,
      errorRecord?.error,
      errorRecord?.error_message,
      errorRecord?.description,
      detailsRecord?.message,
      detailsRecord?.error,
      detailsRecord?.error_message,
      detailsRecord?.description
    ) ?? `CandyJar ${pending.method}.${pending.action} failed without an error payload`;
  const code = firstStringOrNumber(errorRecord?.code, detailsRecord?.code);

  return {
    name: "CandyJarBridgeError",
    message,
    error: message,
    ...(code === undefined ? {} : { code }),
    method: pending.method,
    action: pending.action,
    ...(details === undefined ? {} : { details })
  };
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function firstStringOrNumber(...values: unknown[]): string | number | undefined {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") {
      return value;
    }
  }
  return undefined;
}

function resolveParentOrigin(hostWindow: Window): string {
  try {
    // An iframe navigation/reload can make document.referrer its own previous
    // URL. The browser's immediate ancestor origin still identifies the parent.
    const ancestorOrigin = hostWindow.location.ancestorOrigins?.[0];
    if (ancestorOrigin && ancestorOrigin !== "null") return new URL(ancestorOrigin).origin;
    const referrer = hostWindow.document.referrer;
    return referrer ? new URL(referrer, hostWindow.location.href).origin : "*";
  } catch {
    return "*";
  }
}

function isAllowedOrigin(origin: string, targetOrigin: string): boolean {
  return targetOrigin === "*" || origin === targetOrigin;
}

function createCallId(): string {
  nextCallId += 1;
  return `ai_chat_candyjar_${Date.now()}_${nextCallId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
