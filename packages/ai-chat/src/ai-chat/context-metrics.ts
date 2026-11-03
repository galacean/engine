/** A server observation. The frontend never estimates model input. */
export type ServerInputEstimate = {
  source: "asap";
  scope: "prepared-request";
  modelName: string;
  method: string;
  inputTokens: number;
  requestTokens: number;
  imageTokens: number;
  messageCount: number;
  imageCount: number;
  tokensPerImage: number;
};

export type ModelTelemetry = {
  modelName: string;
  inputEstimate?: ServerInputEstimate;
  inputLimitTokens?: number;
  maxOutputTokens?: number;
  usage?: {
    source: "provider";
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    totalTokens?: number;
  };
};

export type ServerModelError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export function normalizeServerModelError(value: unknown): ServerModelError | undefined {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string") return undefined;
  return {
    code: value.code,
    message: value.message,
    // ASAP owns the diagnostic schema and filters these fields before transmission.
    ...(isRecord(value.details) ? { details: structuredClone(value.details) } : {})
  };
}

export type ServerModelAttempt = {
  attempt: number;
  finishReason?: string;
  error?: ServerModelError;
  telemetry?: ModelTelemetry;
};

export function normalizeServerModelAttempts(value: unknown): ServerModelAttempt[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const attempts: ServerModelAttempt[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || item.attempt !== index + 1) return undefined;
    const error = normalizeServerModelError(item.error);
    attempts.push({
      attempt: item.attempt,
      finishReason: typeof item.finishReason === "string" ? item.finishReason : undefined,
      error,
      telemetry: normalizeModelTelemetry(item.telemetry)
    });
  }
  return attempts;
}

/** Telemetry is optional on deployed older ASAP versions; invalid values remain unknown. */
export function normalizeModelTelemetry(value: unknown): ModelTelemetry | undefined {
  if (!isRecord(value) || typeof value.modelName !== "string" || !value.modelName.trim()) return undefined;
  const telemetry: ModelTelemetry = { modelName: value.modelName };
  const estimate = normalizeInputEstimate(value.inputEstimate);
  if (estimate) telemetry.inputEstimate = estimate;
  const inputLimit = tokenCount(value.inputLimitTokens);
  const outputLimit = tokenCount(value.maxOutputTokens);
  if (inputLimit !== undefined && inputLimit > 0) telemetry.inputLimitTokens = inputLimit;
  if (outputLimit !== undefined && outputLimit > 0) telemetry.maxOutputTokens = outputLimit;
  if (isRecord(value.usage) && value.usage.source === "provider") {
    const usage: NonNullable<ModelTelemetry["usage"]> = { source: "provider" };
    for (const key of ["inputTokens", "outputTokens", "cachedInputTokens", "totalTokens"] as const) {
      const count = tokenCount(value.usage[key]);
      if (count !== undefined) usage[key] = count;
    }
    if (
      usage.cachedInputTokens !== undefined &&
      usage.inputTokens !== undefined &&
      usage.cachedInputTokens > usage.inputTokens
    ) {
      delete usage.cachedInputTokens;
    }
    if (Object.keys(usage).length > 1) telemetry.usage = usage;
  }
  return telemetry;
}

function normalizeInputEstimate(value: unknown): ServerInputEstimate | undefined {
  if (
    !isRecord(value) ||
    value.source !== "asap" ||
    value.scope !== "prepared-request" ||
    typeof value.method !== "string" ||
    !value.method.trim() ||
    typeof value.modelName !== "string" ||
    !value.modelName.trim()
  )
    return undefined;
  const counts = {} as Pick<
    ServerInputEstimate,
    "inputTokens" | "requestTokens" | "imageTokens" | "messageCount" | "imageCount" | "tokensPerImage"
  >;
  for (const key of [
    "inputTokens",
    "requestTokens",
    "imageTokens",
    "messageCount",
    "imageCount",
    "tokensPerImage"
  ] as const) {
    const count = tokenCount(value[key]);
    if (count === undefined) return undefined;
    counts[key] = count;
  }
  if (
    counts.inputTokens !== counts.requestTokens + counts.imageTokens ||
    counts.imageTokens !== counts.imageCount * counts.tokensPerImage
  )
    return undefined;
  return { source: "asap", scope: "prepared-request", modelName: value.modelName, method: value.method, ...counts };
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
