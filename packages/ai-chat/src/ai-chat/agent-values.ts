import type { AgentValue } from "./agent-types";

const MAX_AGENT_VALUE_BYTES = 64 * 1024;
export const MAX_SCRIPT_OUTPUT_BYTES = 64 * 1024;
const MAX_AGENT_VALUE_DEPTH = 100;

export function toAgentValue(value: unknown): AgentValue {
  return serializeBounded(value, MAX_AGENT_VALUE_BYTES, "Agent context, script input, or result", false);
}

/** Normalize complete script values before the host applies its display budget. */
export function toAgentScriptOutput(value: unknown): AgentValue {
  return normalizeOutput(value, "Agent Script output");
}

/** Native tools share the execution resource ceiling before applying their display budget. */
export function toAgentToolOutput(value: unknown): AgentValue {
  return normalizeOutput(value, "Agent Tool output");
}

function normalizeOutput(value: unknown, label: string): AgentValue {
  // This is a resource ceiling, not the model presentation budget. The host
  // saves oversized display output without changing the execution outcome.
  const normalized = normalize(value, label, false);
  if (byteLength(normalized) > 8 * 1024 * 1024)
    throw new AgentOutputTooLargeError(`${label} exceeds the 8 MiB execution resource limit`);
  if (
    isPlainObject(value) &&
    Object.keys(value).length &&
    isAgentObject(normalized) &&
    !Object.keys(normalized).length
  ) {
    throw new AgentValueError(`${label} object contains only undefined properties`);
  }
  return normalized;
}

function serializeBounded(
  value: unknown,
  maxBytes: number,
  label: string,
  rejectUndefinedProperties: boolean
): AgentValue {
  const normalized = normalize(value, label, rejectUndefinedProperties);
  const size = byteLength(normalized);
  if (size > maxBytes) {
    throw new AgentValueError(`${label} exceeds ${maxBytes} bytes`);
  }
  return normalized;
}

function normalize(value: unknown, label: string, rejectUndefinedProperties: boolean): AgentValue {
  if (value === undefined) {
    return null;
  }
  let normalized: AgentValue;
  try {
    normalized = normalizeAgentValue(value, "$", new WeakSet<object>(), 0, rejectUndefinedProperties);
  } catch (error) {
    if (error instanceof AgentValueError) {
      throw error;
    }
    throw new AgentValueError(`${label} is not an AgentValue: ${errorMessage(error)}`);
  }
  return normalized;
}

function isAgentObject(value: AgentValue): value is { [key: string]: AgentValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function byteLength(value: AgentValue): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function normalizeAgentValue(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  depth: number,
  rejectUndefinedProperties: boolean
): AgentValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new AgentValueError(`${path} contains a non-finite number`);
    }
    return value;
  }
  if (typeof value !== "object") {
    throw new AgentValueError(`${path} contains unsupported ${typeof value}`);
  }
  if (depth >= MAX_AGENT_VALUE_DEPTH) {
    throw new AgentValueError(`${path} exceeds maximum depth ${MAX_AGENT_VALUE_DEPTH}`);
  }
  if (ancestors.has(value)) {
    throw new AgentValueError(`${path} contains a circular reference`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    const typeName = prototype?.constructor?.name || "object";
    throw new AgentValueError(`${path} contains unsupported ${typeName}`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        if (!(index in value)) {
          throw new AgentValueError(`${path}[${index}] is an array hole`);
        }
        return normalizeAgentValue(item, `${path}[${index}]`, ancestors, depth + 1, rejectUndefinedProperties);
      });
    }

    const symbolKeys = Object.getOwnPropertySymbols(value);
    if (symbolKeys.length > 0) {
      throw new AgentValueError(`${path} contains symbol keys`);
    }
    const normalized = Object.create(null) as Record<string, AgentValue>;
    for (const key of Object.keys(value)) {
      const propertyValue = (value as Record<string, unknown>)[key];
      if (propertyValue === undefined) {
        if (rejectUndefinedProperties) {
          throw new AgentValueError(
            `${path}.${key} is undefined; Agent Script output must contain only explicit JSON values. ` +
              "Use a field declared by the API or omit the field intentionally before returning."
          );
        }
        // Tool results and conversation context may contain absent optional
        // properties. Preserve that absence when normalizing internal values.
        continue;
      }
      normalized[key] = normalizeAgentValue(
        propertyValue,
        `${path}.${key}`,
        ancestors,
        depth + 1,
        rejectUndefinedProperties
      );
    }
    return normalized;
  } finally {
    ancestors.delete(value);
  }
}

function errorMessage(value: unknown): string {
  return value instanceof Error && value.message ? value.message : String(value);
}

export class AgentValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentValueError";
  }
}

export class AgentOutputTooLargeError extends AgentValueError {
  constructor(message: string) {
    super(message);
    this.name = "AgentOutputTooLargeError";
  }
}
