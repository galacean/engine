import { summarizeExecutionEvidence } from "./agent-script-runtime";
import { toAgentValue } from "./agent-values";
import type {
  AgentConsoleEntry,
  AgentScriptCall,
  AgentScriptResult,
  AgentScriptRuntime,
  AgentScriptToolTrace,
  AgentScriptTrace,
  AgentToolResult
} from "./agent-types";
import type { AgentWorkerRequest, AgentWorkerResponse } from "./agent-worker-protocol";

/** Native Worker execution; tool implementations and cancellation ownership stay on the host. */
export class WorkerAgentScriptRuntime implements AgentScriptRuntime {
  constructor(
    private readonly createWorker: () => Worker = () =>
      new Worker(new URL("./AgentScript.worker.ts", import.meta.url), { type: "module" })
  ) {}

  execute(call: AgentScriptCall): Promise<AgentScriptResult> {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const controller = new AbortController();
    const traces: AgentScriptToolTrace[] = [];
    const logs: string[] = [];
    const entries: AgentConsoleEntry[] = [];
    const bindings = new Map(call.toolBindings.map((binding) => [binding.name, binding]));
    return new Promise((resolve) => {
      let worker: Worker | undefined;
      let done = false;
      let inFlight = 0;
      let accepted = 0;
      const requestIds = new Set<number>();
      const callOrdinals = new Set<number>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: AgentScriptResult, trace?: AgentScriptTrace) => {
        if (done) return;
        done = true;
        result = { ...result, console: result.console ?? entries };
        clearTimeout(timer);
        call.signal.removeEventListener("abort", cancel);
        worker?.terminate();
        controller.abort();
        try {
          call.onTrace?.(
            trace ?? {
              callId: call.id,
              source: call.source,
              startedAt,
              durationMilliseconds: performance.now() - started,
              toolCalls: structuredClone(traces.sort((a, b) => a.call - b.call)),
              logs: [...logs],
              result: structuredClone(result)
            }
          );
        } catch {
          /* Diagnostics cannot change the execution outcome. */
        }
        resolve({ ...result, console: result.console ?? entries });
      };
      const fail = (code: string, phase: "timeout" | "cancelled" | "execution", message: string) => {
        const execution = summarizeExecutionEvidence(traces, inFlight > 0);
        finish({ ok: false, error: { code, phase, message, ...(execution ? { execution } : {}) } });
      };
      const cancel = () => fail("SCRIPT_CANCELLED", "cancelled", "Agent Script cancelled");
      if (call.signal.aborted) {
        cancel();
        return;
      }
      call.signal.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(
        () => fail("SCRIPT_TIMEOUT", "timeout", `Agent Script exceeded timeoutMs=${call.timeoutMs}`),
        call.timeoutMs
      );
      const post = (message: AgentWorkerRequest) => {
        if (done) return;
        try {
          worker!.postMessage(message);
        } catch (error) {
          fail("SCRIPT_WORKER_ERROR", "execution", String(error));
        }
      };
      try {
        worker = this.createWorker();
        worker.onerror = (event) => {
          event.preventDefault();
          fail("SCRIPT_WORKER_ERROR", "execution", event.message || "Agent Script Worker failed");
        };
        worker.onmessageerror = () => fail("SCRIPT_WORKER_ERROR", "execution", "Invalid Worker message");
        worker.onmessage = ({ data }: MessageEvent<AgentWorkerResponse>) => {
          if (done) return;
          if (data.type === "log") {
            logs.push(data.line);
            entries.push(data.entry);
          } else if (data.type === "complete") {
            // A legitimate completion follows settlement of all Worker tool promises.
            if (inFlight && data.result.ok) {
              fail("SCRIPT_WORKER_ERROR", "execution", "Worker completed with pending Tool calls");
              return;
            }
            finish(data.result, data.trace);
          } else if (data.type === "tool") {
            const binding = bindings.get(data.name);
            if (!binding || requestIds.has(data.requestId) || accepted >= call.maxToolCalls) {
              fail("SCRIPT_WORKER_ERROR", "execution", "Invalid or over-budget Worker Tool request");
              return;
            }
            requestIds.add(data.requestId);
            const ordinal = data.call ?? accepted + 1;
            if (
              !Number.isSafeInteger(ordinal) ||
              ordinal < 1 ||
              ordinal > call.maxToolCalls ||
              callOrdinals.has(ordinal)
            ) {
              fail("SCRIPT_WORKER_ERROR", "execution", "Invalid Worker Tool call identity");
              return;
            }
            accepted++;
            callOrdinals.add(ordinal);
            const toolStarted = performance.now();
            inFlight++;
            void (async () => {
              let result: AgentToolResult;
              try {
                const input = toAgentValue(data.input);
                result = await binding.invoke(input, controller.signal, ordinal);
              } catch (error) {
                result = {
                  ok: false,
                  error: {
                    code: "TOOL_EXECUTION_FAILED",
                    message: error instanceof Error ? error.message : String(error),
                    executed: true
                  }
                };
              }
              inFlight--;
              if (done) return;
              traces.push({
                call: ordinal,
                tool: data.name,
                input: data.input,
                result: structuredClone(result),
                durationMilliseconds: performance.now() - toolStarted
              });
              post({ type: "tool_result", requestId: data.requestId, result });
            })().catch((error) => fail("SCRIPT_WORKER_ERROR", "execution", String(error)));
          }
        };
        post({
          type: "execute",
          id: call.id,
          source: call.source,
          editorComponents: call.editorComponents,
          tools: call.toolBindings.map(({ name, effect }) => ({ name, effect })),
          maxToolCalls: call.maxToolCalls,
          timeoutMs: call.timeoutMs
        });
      } catch (error) {
        fail("SCRIPT_WORKER_ERROR", "execution", error instanceof Error ? error.message : String(error));
      }
    });
  }
}
