import {
  recoveryRecordKey,
  summarizeRecoveries,
  type ModelRecoveryEvent,
  type ModelRecoveryRecord
} from "./model-recovery";
import { fileToolStepResult } from "./agent-output";
import type { AgentImageReference } from "./agent-image-store";
import type {
  AgentEvent,
  AgentInputTarget,
  AgentModelAttempt,
  AgentRunOptions,
  AgentSessionState,
  AgentInputSource,
  AgentStepRecord,
  AgentUserInput
} from "./agent-types";

export type AgentProgress =
  | { kind: "recovery"; recovery: ModelRecoveryEvent }
  | { kind: "model"; step: number; decision?: AgentStepRecord["decision"]["type"]; commentary?: string }
  | { kind: "tool"; tool: string; ok?: boolean }
  | { kind: "script"; ok?: boolean; committed?: boolean; runtimeErrors?: boolean }
  | { kind: "input"; text: string }
  | { kind: "input_error"; text: string; message: string };
export type AgentSessionTask = {
  id: string;
  inputId: string;
  input: string;
  inputSource: AgentInputSource;
  taskId?: string;
  continuedFrom?: string;
  inputs: { id: string; text: string; error?: string; visualReferences?: AgentImageReference[] }[];
  progress: AgentProgress[];
  recoveryEvents: ModelRecoveryRecord[];
  outcome?: { status: "completed" | "failed" | "stopped"; message: string };
  debug?: {
    model: string;
    previousRecordCount: number;
    steps: AgentStepRecord[];
    failedAttempts?: AgentModelAttempt[];
  };
};
type ReadonlyData<T> = T extends object ? { readonly [K in keyof T]: ReadonlyData<T[K]> } : T;
export type AgentSessionSnapshot = ReadonlyData<{
  state: AgentSessionState;
  running: boolean;
  canStop: boolean;
  canContinue: boolean;
  continuationBlocked: boolean;
  tasks: (AgentSessionTask & { recoverySummary: ReturnType<typeof summarizeRecoveries> })[];
  current?: AgentSessionTask & { recoverySummary: ReturnType<typeof summarizeRecoveries> };
  pendingInputs: readonly { input: AgentUserInput; target: AgentInputTarget }[];
}>;

/** Session-owned presentation facts. No image bytes, host resources or replay of raw events. */
export class SessionData {
  private readonly tasks: AgentSessionTask[] = [];
  private readonly recoveryKeys = new Set<string>();
  get current(): AgentSessionTask | undefined {
    return this.tasks.at(-1);
  }
  clear(): void {
    this.tasks.length = 0;
    this.recoveryKeys.clear();
  }
  begin(input: AgentUserInput, options: AgentRunOptions, previousRecordCount: number, continuedFrom?: string): void {
    this.recoveryKeys.clear();
    this.tasks.push({
      id: crypto.randomUUID(),
      inputId: input.id,
      input: input.text,
      inputSource: input.inputSource,
      continuedFrom,
      inputs: [{ id: input.id, text: input.text }],
      progress: [],
      recoveryEvents: [],
      ...(options.debugMode
        ? { debug: { model: options.model?.trim() || "默认路由", previousRecordCount, steps: [] } }
        : {})
    });
    if (this.tasks.length > 20) this.tasks.shift();
  }
  accept(event: AgentEvent): boolean {
    const task = this.current;
    if (!task) return false;
    let progress: AgentProgress | undefined;
    switch (event.type) {
      case "task_started":
        task.taskId = event.taskId;
        break;
      case "input_consumed":
        task.inputs.push({
          id: event.input.id,
          text: event.input.text,
          visualReferences: structuredClone(event.input.visualReferences)
        });
        progress = { kind: "input", text: event.input.text };
        break;
      case "model_recovery": {
        if (event.taskId !== task.taskId || task.outcome) return false;
        const key = recoveryRecordKey(event);
        if (this.recoveryKeys.has(key)) return false;
        this.recoveryKeys.add(key);
        const record = structuredClone({
          taskId: event.taskId,
          step: event.step,
          attempt: event.attempt,
          recovery: event.recovery
        });
        task.recoveryEvents.push(record);
        progress = { kind: "recovery", recovery: record.recovery };
        break;
      }
      case "model_started":
        progress = { kind: "model", step: event.step };
        break;
      case "model_finished": {
        if (task.debug) {
          task.debug.steps.push({
            ...structuredClone({ ...event.step, attempts: [] }),
            attempts: event.step.attempts.map(displayAttempt)
          });
          if (task.debug.steps.length > 256) task.debug.steps.shift();
        }
        const attempt = event.step.attempts.at(-1);
        const raw = attempt?.error === null ? attempt.rawContent : "";
        const visible = raw
          .replace(/<think\b[^>]*>[\s\S]*?(?:<\/think>|$)/gi, "")
          .replace(/```[\s\S]*?(?:```|$)/g, "")
          .trim();
        progress = {
          kind: "model",
          step: event.step.step,
          decision: event.step.decision.type,
          commentary: visible && !/^[{[]/.test(visible) ? visible : undefined
        };
        break;
      }
      case "model_failed":
        if (task.debug) task.debug.failedAttempts = event.attempts.map(displayAttempt);
        break;
      case "tool_started":
        progress = { kind: "tool", tool: event.tool };
        break;
      case "tool_finished": {
        const step = task.debug?.steps.find((item) => item.step === event.step && item.toolCallId === event.toolCallId);
        // Calls inside execute do not finish the enclosing script step.
        if (step?.decision.type === "file") step.scriptResult = structuredClone(fileToolStepResult(event));
        progress = { kind: "tool", tool: event.tool, ok: event.result.ok };
        break;
      }
      case "script_started":
        progress = { kind: "script" };
        break;
      case "script_finished": {
        const step = task.debug?.steps.find((item) => item.step === event.step);
        if (step) step.scriptResult = structuredClone(event.result);
        progress = {
          kind: "script",
          ok: event.result.ok,
          committed: event.result.receipt?.status === "committed",
          runtimeErrors: !!event.result.receipt?.runtimeErrors?.length
        };
        break;
      }
      case "task_completed":
        task.outcome = { status: "completed", message: event.result.finalMessage || "任务已完成。" };
        task.inputs[0].visualReferences = structuredClone(event.result.visualReferences);
        break;
      case "task_failed":
        task.outcome = {
          status: event.failure.status === "cancelled" ? "stopped" : "failed",
          message: event.failure.message
        };
        task.inputs[0].visualReferences = structuredClone(event.failure.visualReferences);
        break;
      default:
        return false;
    }
    if (progress) {
      task.progress.push(progress);
      if (task.progress.length > 256) task.progress.shift();
    }
    return true;
  }
  rejectInput(input: AgentUserInput, error: unknown): void {
    const task = this.current;
    if (!task) return;
    const message = error instanceof Error ? error.message : String(error);
    task.inputs.push({ id: input.id, text: input.text, error: message });
    task.progress.push({ kind: "input_error", text: input.text, message });
    if (task.progress.length > 256) task.progress.shift();
  }
  fail(error: unknown, cancelled = false): void {
    if (this.current && !this.current.outcome)
      this.current.outcome = {
        status: cancelled ? "stopped" : "failed",
        message: cancelled ? "任务已停止。" : error instanceof Error ? error.message : String(error)
      };
  }
  settleStopped(): void {
    if (this.current && !this.current.outcome) this.current.outcome = { status: "stopped", message: "任务已停止。" };
  }
  snapshot(
    state: AgentSessionState,
    canContinue: boolean,
    continuationBlocked: boolean,
    pendingInputs: readonly { input: AgentUserInput; target: AgentInputTarget }[]
  ): AgentSessionSnapshot {
    const canStop = state === "preparing" || state === "executing";
    const tasks = this.tasks.map((task) => ({ ...task, recoverySummary: summarizeRecoveries(task.recoveryEvents) }));
    return freeze(
      structuredClone({
        state,
        running: canStop || state === "stopping",
        canStop,
        canContinue,
        continuationBlocked,
        tasks,
        current: tasks.at(-1),
        pendingInputs
      })
    );
  }
}
function freeze<T>(value: T): ReadonlyData<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value as ReadonlyData<T>;
}

// The full request belongs to Agent Trace. In particular, requestMessages may own
// image Blobs and must never enter Session presentation/history snapshots.
function displayAttempt(attempt: AgentModelAttempt): AgentModelAttempt {
  return structuredClone({
    attempt: attempt.attempt,
    rawContent: attempt.rawContent,
    error: attempt.error,
    traceId: attempt.traceId,
    debug: attempt.debug
  });
}
