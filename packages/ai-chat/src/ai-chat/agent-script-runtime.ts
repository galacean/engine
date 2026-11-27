import { createAgentEditorFacade } from "./agent-editor-facade";
import { analyzeAgentScript } from "./agent-script-syntax";
import { AgentOutputTooLargeError, AgentValueError, toAgentScriptOutput, toAgentValue } from "./agent-values";
import type {
  AgentConsoleEntry,
  AgentScriptCall,
  AgentScriptError,
  AgentScriptExecutionEvidence,
  AgentScriptLocation,
  AgentScriptResult,
  AgentScriptRuntime,
  AgentScriptToolBinding,
  AgentScriptToolTrace,
  AgentToolResult,
  AgentValue
} from "./agent-types";

const HOST_BINDINGS = [
  "globalThis",
  "global",
  "window",
  "self",
  "document",
  "module",
  "exports",
  "require",
  "process",
  "Buffer",
  "location",
  "navigator",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "Worker",
  "SharedWorker",
  "MessageChannel",
  "BroadcastChannel",
  "Function",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame"
] as const;

const MAX_SCRIPT_BYTES = 32 * 1024;
const EXECUTE_CODE_LOCATION = Object.freeze({ source: "execute.code" as const });
const RETURN_LOCATION = Object.freeze({ source: "execute.code" as const, target: "return" as const });
// Function constructors add two wrapper lines and this runtime adds the strict-mode line.
const ASYNC_FUNCTION_STACK_LINE_OFFSET = 3;

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

export class JavaScriptAgentScriptRuntime implements AgentScriptRuntime {
  constructor(private readonly onLog?: (line: string, entry: AgentConsoleEntry) => void) {}
  async execute(call: AgentScriptCall): Promise<AgentScriptResult> {
    const startedAt = new Date().toISOString();
    const startedAtMilliseconds = performance.now();
    const toolCalls: AgentScriptToolTrace[] = [];
    const logs: string[] = [];
    const entries: AgentConsoleEntry[] = [];
    const execution = await executeScript(call, toolCalls, logs, (line, entry) => {
      entries.push(entry);
      this.onLog?.(line, entry);
    });
    execution.result = { ...execution.result, console: entries };
    const trace = {
      callId: call.id,
      source: call.source,
      startedAt,
      durationMilliseconds: performance.now() - startedAtMilliseconds,
      toolCalls: structuredClone([...toolCalls].sort((left, right) => left.call - right.call)),
      logs: [...logs],
      result: structuredClone(execution.result),
      errorStack: execution.errorStack
    };
    try {
      call.onTrace?.(trace);
    } catch {
      // Diagnostics must never change task execution.
    }
    return execution.result;
  }
}

/**
 * Returns statically addressed `tools.namespace.api` references without being
 * confused by comments or string literals. Dynamic Tool lookup is outside the
 * Agent Script contract and is intentionally not inferred here.
 */
export function extractAgentScriptToolReferences(source: string): readonly string[] {
  return analyzeAgentScript(source).references;
}

async function executeScript(
  call: AgentScriptCall,
  toolCalls: AgentScriptToolTrace[],
  logs: string[],
  onLog?: (line: string, entry: AgentConsoleEntry) => void
): Promise<{ result: AgentScriptResult; errorStack?: string }> {
  const sourceUrl = agentScriptSourceUrl(call.id);
  const sourceLineCount = call.source.split(/\r?\n/).length;
  if (call.signal.aborted) {
    return { result: scriptFailure("SCRIPT_CANCELLED", "cancelled", "Agent Script cancelled") };
  }
  const codeBytes = new TextEncoder().encode(call.source).byteLength;
  if (codeBytes > MAX_SCRIPT_BYTES) {
    return {
      result: scriptFailure("SCRIPT_UNSUPPORTED", "parse", `Agent Script exceeds ${MAX_SCRIPT_BYTES} bytes`)
    };
  }
  const syntax = analyzeAgentScript(call.source);
  if (syntax.error) return { result: { ok: false, error: syntax.error }, errorStack: syntax.errorStack };

  let fn: (...args: unknown[]) => Promise<unknown>;
  try {
    fn = new AsyncFunction(
      "tools",
      "console",
      "editor",
      ...HOST_BINDINGS,
      `"use strict";\n${call.source}\n//# sourceURL=${sourceUrl}`
    );
  } catch (error) {
    return {
      result: scriptFailure("SCRIPT_SYNTAX_ERROR", "parse", `Agent Script syntax error: ${errorMessage(error)}`, {
        location: scriptSourceLocation(error, sourceUrl, sourceLineCount)
      }),
      errorStack: errorStack(error)
    };
  }

  const runtimeController = new AbortController();
  const abortFromTask = () => runtimeController.abort(call.signal.reason);
  call.signal.addEventListener("abort", abortFromTask, { once: true });
  const runtimeConsole = createRuntimeConsole(logs, onLog);
  const facade = createToolFacade(call.toolBindings, runtimeController.signal, call.maxToolCalls, toolCalls);
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  let removeAbortWaiter: (() => void) | undefined;

  try {
    const execution = (async () => {
      const editor = createAgentEditorFacade(
        call.editorComponents ?? [],
        (name, input) => {
          let method: unknown = facade.tools;
          for (const part of name.split(".")) method = (method as Record<string, unknown>)[part];
          if (typeof method !== "function") throw new Error(`Editor binding is not a Tool: ${name}`);
          return method(input);
        },
        call.toolBindings.map((tool) => tool.name)
      );
      const output = await fn(facade.tools, runtimeConsole, editor, ...HOST_BINDINGS.map(() => undefined));
      facade.close();
      await facade.settle();
      return output;
    })();
    void execution.catch(() => undefined);
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        const error = new AgentScriptTimeoutError(`Agent Script exceeded timeoutMs=${call.timeoutMs}`);
        runtimeController.abort(error);
        reject(error);
      }, call.timeoutMs);
    });
    const cancelled = new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(runtimeController.signal.reason ?? new AgentScriptCancelledError());
      runtimeController.signal.addEventListener("abort", onAbort, { once: true });
      removeAbortWaiter = () => runtimeController.signal.removeEventListener("abort", onAbort);
    });
    const rawOutput = await Promise.race([execution, timeout, cancelled]);
    if (call.signal.aborted) {
      return { result: scriptFailure("SCRIPT_CANCELLED", "cancelled", "Agent Script cancelled") };
    }
    try {
      return {
        result: { ok: true, output: toAgentScriptOutput(rawOutput), returnValuePresent: rawOutput !== undefined }
      };
    } catch (error) {
      const successfulToolShape = summarizeSuccessfulToolOutputShape(toolCalls);
      return {
        result: scriptFailure(
          error instanceof AgentOutputTooLargeError ? "OUTPUT_TOO_LARGE" : "INVALID_SCRIPT_OUTPUT",
          "output",
          `${errorMessage(error)}${successfulToolShape ? ` Successful Tool output fields: ${successfulToolShape}.` : ""}`,
          {
            execution: summarizeExecutionEvidence(toolCalls),
            location: RETURN_LOCATION
          }
        ),
        errorStack: errorStack(error)
      };
    }
  } catch (error) {
    const result = normalizeScriptFailure(error, call.signal, toolCalls, sourceUrl, sourceLineCount);
    return { result, errorStack: errorStack(error) };
  } finally {
    facade.close();
    runtimeController.abort();
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    removeAbortWaiter?.();
    call.signal.removeEventListener("abort", abortFromTask);
  }
}

function createToolFacade(
  bindings: readonly AgentScriptToolBinding[],
  signal: AbortSignal,
  maxToolCalls: number,
  trace: AgentScriptToolTrace[]
): { tools: Record<string, unknown>; close(): void; settle(): Promise<void> } {
  let closed = false;
  const pending = new Set<Promise<AgentValue>>();
  let editFailure: unknown;
  interface FacadeNode {
    [name: string]: FacadeNode | ((input?: unknown) => Promise<AgentValue>);
  }
  const root = Object.create(null) as FacadeNode;
  let invocationCount = 0;
  for (const binding of bindings) {
    const path = binding.name.split(".");
    if (path.some((segment) => !/^[A-Za-z_$][\w$]*$/.test(segment))) {
      throw new Error(`Invalid Agent Tool namespace path: ${binding.name}`);
    }
    let target = root;
    for (const segment of path.slice(0, -1)) {
      const existing = target[segment];
      if (typeof existing === "function") throw new Error(`Agent Tool namespace conflicts at '${segment}'`);
      if (existing) {
        target = existing;
      } else {
        const child = Object.create(null) as FacadeNode;
        Object.defineProperty(target, segment, {
          enumerable: true,
          configurable: true,
          writable: false,
          value: child
        });
        target = child;
      }
    }
    const leaf = path.at(-1)!;
    if (Object.hasOwn(target, leaf)) throw new Error(`Duplicate Agent Tool binding: ${binding.name}`);
    Object.defineProperty(target, leaf, {
      enumerable: true,
      configurable: false,
      writable: false,
      value: (rawInput: unknown = {}) => {
        // This facade returns a tracked promise rather than awaiting it. Keep
        // the generated-code call site even when an async host reply fails.
        const invocationStack = new Error().stack;
        const invocation = (async () => {
          throwIfAborted(signal);
          if (closed) throw new Error("Agent Script has finished accepting Tool calls");
          if (invocationCount >= maxToolCalls) {
            throw new AgentScriptBudgetError(`Agent Script exceeded maxToolCalls=${maxToolCalls}`);
          }
          const call = ++invocationCount;
          const startedAt = performance.now();
          let input: AgentValue;
          try {
            input = toAgentValue(rawInput);
          } catch (error) {
            const result = toolFailure("INVALID_ARGUMENTS", errorMessage(error), errorStack(error));
            trace.push({
              call,
              tool: binding.name,
              input: null,
              result,
              durationMilliseconds: performance.now() - startedAt
            });
            throw new AgentScriptToolError(binding.name, result);
          }
          const result = await binding.invoke(input, signal, call);
          trace.push({
            call,
            tool: binding.name,
            input,
            result: structuredClone(result),
            durationMilliseconds: performance.now() - startedAt
          });
          if (result.ok === false) throw new AgentScriptToolError(binding.name, result);
          return result.value;
        })();
        pending.add(invocation);
        // Attach a rejection handler immediately: missing await must not leak an
        // unhandled rejection or allow a caught editing failure to commit.
        void invocation.then(
          () => pending.delete(invocation),
          (error) => {
            pending.delete(invocation);
            if (error instanceof Error && invocationStack)
              error.stack = `${error.stack ?? error.message}\n${invocationStack}`;
            if (
              (error instanceof AgentScriptBudgetError || binding.effect === undefined || binding.effect === "edit") &&
              editFailure === undefined
            )
              editFailure = error;
          }
        );
        return invocation;
      }
    });
  }
  const finalize = (node: FacadeNode, parentPath: string): Record<string, unknown> => {
    for (const [name, value] of Object.entries(node)) {
      if (typeof value === "function") continue;
      Object.defineProperty(node, name, {
        enumerable: true,
        configurable: false,
        writable: false,
        value: finalize(value, parentPath ? `${parentPath}.${name}` : name)
      });
    }
    Object.freeze(node);
    return new Proxy(node, {
      get(current, property, receiver) {
        if (typeof property === "string" && !Object.hasOwn(current, property)) {
          const fullName = parentPath ? `${parentPath}.${property}` : property;
          throw new AgentScriptToolError(fullName, toolFailure("UNKNOWN_TOOL", `Unknown Agent Tool: ${fullName}`));
        }
        return Reflect.get(current, property, receiver);
      },
      set() {
        throw new Error("Agent Tool facade is read-only");
      }
    });
  };
  return {
    tools: finalize(root, ""),
    close: () => {
      closed = true;
    },
    settle: async () => {
      await Promise.allSettled([...pending]);
      if (editFailure !== undefined) throw editFailure;
    }
  };
}

function normalizeScriptFailure(
  error: unknown,
  taskSignal: AbortSignal,
  toolCalls: readonly AgentScriptToolTrace[],
  sourceUrl: string,
  sourceLineCount: number
): AgentScriptResult {
  const execution = summarizeExecutionEvidence(toolCalls);
  if (taskSignal.aborted || error instanceof AgentScriptCancelledError) {
    return scriptFailure("SCRIPT_CANCELLED", "cancelled", "Agent Script cancelled", { execution });
  }
  if (error instanceof AgentScriptTimeoutError) {
    return scriptFailure("SCRIPT_TIMEOUT", "timeout", error.message, { execution });
  }
  if (error instanceof AgentScriptBudgetError) {
    return scriptFailure("SCRIPT_BUDGET_EXCEEDED", "execution", error.message, {
      execution,
      location: scriptSourceLocation(error, sourceUrl, sourceLineCount)
    });
  }
  if (error instanceof AgentScriptToolError) {
    const toolExecution = summarizeExecutionEvidence(toolCalls, Boolean(error.result.error.executed));
    return {
      ok: false,
      error: {
        code: error.result.error.code,
        phase: "tool",
        message: error.result.error.message,
        tool: error.tool,
        ...(error.result.error.retryable !== undefined ? { retryable: error.result.error.retryable } : {}),
        ...(error.result.error.details !== undefined ? { details: error.result.error.details } : {}),
        location: scriptSourceLocation(error, sourceUrl, sourceLineCount),
        ...(toolExecution ? { execution: toolExecution } : {})
      }
    };
  }
  if (error instanceof AgentValueError) {
    return scriptFailure("INVALID_SCRIPT_OUTPUT", "output", error.message, {
      execution,
      location: RETURN_LOCATION
    });
  }
  return scriptFailure("SCRIPT_RUNTIME_ERROR", "execution", errorMessage(error), {
    execution,
    location: scriptSourceLocation(error, sourceUrl, sourceLineCount)
  });
}

/**
 * Preserve the last successful Tool receipt when later script code fails. This
 * is execution truth, not domain interpretation: the Agent decides whether the
 * completed call was a read or a write from the Tool declaration and result.
 */
export function summarizeExecutionEvidence(
  toolCalls: readonly AgentScriptToolTrace[],
  failedToolMayHaveExecuted = false
): AgentScriptExecutionEvidence | undefined {
  const successful = toolCalls.filter(
    (call): call is AgentScriptToolTrace & { result: Extract<AgentToolResult, { ok: true }> } => call.result.ok
  );
  if (successful.length === 0 && !failedToolMayHaveExecuted) return undefined;
  const retained = successful.slice(-1).map(({ call, tool, result }) => ({
    call,
    tool,
    result: boundedExecutionResult(result.value, toolCalls)
  }));
  return {
    status: "tool_calls_completed_before_failure",
    successfulToolCalls: retained,
    successfulToolCallsTruncated: successful.length > retained.length,
    failedToolMayHaveExecuted
  };
}

function boundedExecutionResult(value: AgentValue, toolCalls: readonly AgentScriptToolTrace[]): AgentValue {
  try {
    return toAgentScriptOutput(value);
  } catch {
    return { availableFields: summarizeSuccessfulToolOutputShape(toolCalls) };
  }
}

/**
 * Output-validation failures commonly mean the script projected a field that
 * an API never returned. Expose only a bounded field topology for repair; raw
 * intermediate values, collections and logs remain in the diagnostic Trace.
 */
function summarizeSuccessfulToolOutputShape(toolCalls: readonly AgentScriptToolTrace[]): string {
  const summaries: string[] = [];
  const maxPaths = 32;
  for (const call of toolCalls) {
    if (!call.result.ok) continue;
    const paths: string[] = [];
    collectAgentValuePaths(call.result.value, "", paths, maxPaths);
    if (paths.length > 0) summaries.push(`${call.tool} => ${paths.join(", ")}`);
    if (summaries.join("; ").length >= 800) break;
  }
  return summaries.join("; ").slice(0, 800);
}

function collectAgentValuePaths(value: AgentValue, prefix: string, paths: string[], maxPaths: number): void {
  if (paths.length >= maxPaths) return;
  if (Array.isArray(value)) {
    paths.push(`${prefix || "$"}[]`);
    return;
  }
  if (!value || typeof value !== "object") {
    if (prefix) paths.push(prefix);
    return;
  }
  const entries = Object.entries(value);
  if (entries.length === 0 && prefix) paths.push(prefix);
  for (const [key, child] of entries) {
    if (paths.length >= maxPaths) break;
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) paths.push(`${path}[]`);
    else if (child && typeof child === "object") collectAgentValuePaths(child, path, paths, maxPaths);
    else paths.push(path);
  }
}

function scriptFailure(
  code: AgentScriptError["code"],
  phase: AgentScriptError["phase"],
  message: string,
  extra: Readonly<Pick<AgentScriptError, "execution" | "location">> = {}
): AgentScriptResult {
  return {
    ok: false,
    error: {
      code,
      phase,
      message,
      ...(extra.location ? { location: extra.location } : {}),
      ...(extra.execution ? { execution: extra.execution } : {})
    }
  };
}

function toolFailure(
  code: Extract<AgentToolResult, { ok: false }>["error"]["code"],
  message: string,
  stack?: string
): Extract<AgentToolResult, { ok: false }> {
  return { ok: false, error: { code, message, ...(stack ? { stack } : {}) } };
}

function createRuntimeConsole(logs: string[], onLog?: (line: string, entry: AgentConsoleEntry) => void): Console {
  let bytes = 0;
  const append =
    (level: AgentConsoleEntry["level"]) =>
    (...values: unknown[]) => {
      const args = values.map((value) => {
        if (value === undefined) return "undefined";
        if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack ?? "" };
        try {
          return toAgentScriptOutput(value);
        } catch (error) {
          if (error instanceof AgentOutputTooLargeError) throw error;
          return String(value);
        }
      });
      const entry = { level, args };
      bytes += new TextEncoder().encode(JSON.stringify(entry)).byteLength;
      if (bytes > 8 * 1024 * 1024 || logs.length >= 10000) throw new Error("Console resource limit exceeded");
      const line = args.map(formatLogValue).join(" ");
      logs.push(line);
      onLog?.(line, entry);
    };
  return Object.freeze({
    log: append("log"),
    info: append("info"),
    warn: append("warn"),
    error: append("error"),
    debug: append("debug")
  }) as unknown as Console;
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new AgentScriptCancelledError();
}

function errorMessage(value: unknown): string {
  return value instanceof Error && value.message ? value.message : String(value);
}

function errorStack(value: unknown): string | undefined {
  return value instanceof Error ? value.stack : undefined;
}

function agentScriptSourceUrl(callId: string): string {
  return `agent-script://${encodeURIComponent(callId)}`;
}

function scriptSourceLocation(error: unknown, sourceUrl: string, sourceLineCount: number): AgentScriptLocation {
  const stack = errorStack(error);
  if (!stack) return EXECUTE_CODE_LOCATION;
  const locationPattern = new RegExp(`${escapeRegExp(sourceUrl)}:(\\d+):(\\d+)`, "g");
  for (const match of stack.matchAll(locationPattern)) {
    const generatedLine = Number(match[1]);
    const column = Number(match[2]);
    const sourceLine = generatedLine - ASYNC_FUNCTION_STACK_LINE_OFFSET;
    if (
      Number.isSafeInteger(sourceLine) &&
      sourceLine >= 1 &&
      sourceLine <= sourceLineCount &&
      Number.isSafeInteger(column) &&
      column >= 1
    ) {
      return { source: "execute.code", line: sourceLine, column };
    }
  }
  return EXECUTE_CODE_LOCATION;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class AgentScriptToolError extends Error {
  constructor(
    readonly tool: string,
    readonly result: Extract<AgentToolResult, { ok: false }>
  ) {
    super(`Agent Tool ${tool} failed: ${result.error.message}`);
    this.name = "AgentScriptToolError";
  }
}

class AgentScriptBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentScriptBudgetError";
  }
}

class AgentScriptTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentScriptTimeoutError";
  }
}

class AgentScriptCancelledError extends Error {
  constructor() {
    super("Agent Script cancelled");
    this.name = "AgentScriptCancelledError";
  }
}
