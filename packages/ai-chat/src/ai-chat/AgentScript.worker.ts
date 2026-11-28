import { JavaScriptAgentScriptRuntime } from "./agent-script-runtime";
import type { AgentScriptTrace, AgentToolResult } from "./agent-types";
import type { AgentWorkerRequest, AgentWorkerResponse } from "./agent-worker-protocol";

const scope = globalThis as unknown as {
  postMessage(message: AgentWorkerResponse): void;
  onmessage: ((event: MessageEvent<AgentWorkerRequest>) => void) | null;
};
const pending = new Map<number, (result: AgentToolResult) => void>();
let serial = 0;
let started = false;
scope.onmessage = ({ data }) => {
  if (data.type === "tool_result") {
    const resolve = pending.get(data.requestId);
    pending.delete(data.requestId);
    resolve?.(data.result);
    return;
  }
  if (started) return;
  started = true;
  const runtime = new JavaScriptAgentScriptRuntime((line, entry) => scope.postMessage({ type: "log", line, entry }));
  let trace: AgentScriptTrace;
  void runtime
    .execute({
      id: data.id,
      source: data.source,
      editorComponents: data.editorComponents,
      signal: new AbortController().signal,
      timeoutMs: data.timeoutMs,
      maxToolCalls: data.maxToolCalls,
      toolBindings: data.tools.map((tool) => ({
        ...tool,
        invoke: (input, _signal, call) =>
          new Promise((resolve) => {
            const requestId = ++serial;
            pending.set(requestId, resolve);
            scope.postMessage({ type: "tool", requestId, call, name: tool.name, input });
          })
      })),
      onTrace: (value) => {
        trace = value;
      }
    })
    .then((result) => {
      scope.postMessage({ type: "complete", result, trace });
    })
    .catch((error) => {
      const result = {
        ok: false as const,
        error: {
          code: "SCRIPT_RUNTIME_ERROR",
          phase: "execution" as const,
          message: error instanceof Error ? error.message : String(error)
        }
      };
      scope.postMessage({
        type: "complete",
        result,
        trace: {
          callId: data.id,
          source: data.source,
          startedAt: new Date().toISOString(),
          durationMilliseconds: 0,
          toolCalls: [],
          logs: [],
          result
        }
      });
    });
};
